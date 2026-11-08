"""Start and talk to the Swarm Studio canvas server.

Self-contained on purpose: the agent half (``__init__.py``) imports it as a
package module, and the dashboard route (``dashboard/plugin_api.py``) loads it
by path, because the dashboard loader imports that file standalone.

The server is a Node process bound to 127.0.0.1. It holds the model API key in
its environment only (never on disk) and accepts runs only with a per-install
token kept in ``$HERMES_HOME/swarm-studio/token``.
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 4319
KEY_ENV = "SWARM_STUDIO_API_KEY"


def data_dir() -> Path:
    home = os.environ.get("HERMES_HOME") or str(Path.home() / ".hermes")
    path = Path(home).expanduser() / "swarm-studio"
    path.mkdir(parents=True, exist_ok=True)
    return path


def port() -> int:
    try:
        return int(os.environ.get("SWARM_STUDIO_PORT", DEFAULT_PORT))
    except ValueError:
        return DEFAULT_PORT


def base_url() -> str:
    return f"http://127.0.0.1:{port()}"


def _secret(name: str) -> str | None:
    try:
        from agent.secret_scope import get_secret
    except ImportError:  # running outside Hermes (tests, plain python)
        return os.environ.get(name)
    return get_secret(name)


def token() -> str:
    path = data_dir() / "token"
    try:
        value = path.read_text("utf-8").strip()
        if value:
            return value
    except OSError:
        pass
    value = secrets.token_urlsafe(24)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(value)
    return value


def _request(path: str, *, method: str = "GET", body: dict | None = None, timeout: float = 2.0) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base_url() + path, data=data, method=method)
    req.add_header("content-type", "application/json")
    req.add_header("x-swarm-token", token())
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode() or "{}")


def state() -> dict | None:
    """The running server's state, or None when no Swarm Studio server answers."""
    try:
        got = _request("/api/state", timeout=0.6)
    except (OSError, urllib.error.URLError, ValueError):
        return None
    return got if got.get("app") == "swarm-studio" else None


def ensure_server() -> dict:
    """Start the canvas server if it is not already up. Returns {url} or {error}."""
    if state():
        return {"running": True, "started": False, "url": base_url() + "/"}

    key = _secret(KEY_ENV)
    if not key:
        return {"running": False, "error": f"{KEY_ENV} is not set. Add an OpenAI-compatible API key with `hermes config set` or your .env."}
    node = os.environ.get("SWARM_STUDIO_NODE") or shutil.which("node")
    if not node:
        return {"running": False, "error": "Node.js 20+ is required (no `node` on PATH)."}

    # A minimal environment: the child gets its own settings, not every secret Hermes holds.
    env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "LANG") if k in os.environ}
    env.update(
        SWARM_API_KEY=key,
        SWARM_TOKEN=token(),
        SWARM_RUNS_DIR=str(data_dir() / "runs"),
    )
    for src, dst in (
        ("SWARM_STUDIO_BASE_URL", "SWARM_BASE_URL"),
        ("SWARM_STUDIO_PLANNER_MODEL", "SWARM_PLANNER_MODEL"),
        ("SWARM_STUDIO_WORKER_MODEL", "SWARM_WORKER_MODEL"),
        ("SWARM_STUDIO_AGENTS", "SWARM_AGENTS"),
    ):
        if os.environ.get(src):
            env[dst] = os.environ[src]

    log = open(data_dir() / "server.log", "ab")
    try:
        subprocess.Popen(
            [node, str(ROOT / "server" / "server.mjs"), "--port", str(port())],
            cwd=str(ROOT),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    except OSError as exc:
        return {"running": False, "error": f"could not start node: {exc}"}
    finally:
        log.close()

    for _ in range(60):  # ~6s
        if state():
            return {"running": True, "started": True, "url": base_url() + "/"}
        time.sleep(0.1)
    return {"running": False, "error": f"server did not answer on {base_url()}; see {data_dir() / 'server.log'}"}


def start_run(brief: str, agents: int | None = None) -> dict:
    up = ensure_server()
    if not up.get("running"):
        return up
    body: dict = {"brief": brief}
    if agents:
        body["agents"] = max(2, min(24, int(agents)))
    try:
        got = _request("/api/run", method="POST", body=body, timeout=5)
    except (OSError, urllib.error.URLError, ValueError) as exc:
        return {"running": True, "error": f"could not start the run: {exc}"}
    return {"running": True, "run": got.get("run"), "url": up["url"]}


def wait_run(run_id: str, timeout: float = 240.0) -> dict:
    """Block until the run finishes (or times out) and return its summary."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        current = state()
        if not current or current.get("run") != run_id:
            return {"run": run_id, "status": "replaced", "note": "another run started or the server stopped"}
        if current.get("done"):
            return {"run": run_id, "status": "done", **(current.get("result") or {})}
        time.sleep(1.0)
    return {"run": run_id, "status": "running", "note": f"still building after {int(timeout)}s; watch it on the canvas"}
