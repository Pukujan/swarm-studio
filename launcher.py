"""Start and talk to the Swarm Studio canvas server.

Self-contained on purpose: the agent half (``__init__.py``) imports it as a
package module, and the dashboard route (``dashboard/plugin_api.py``) loads it
by path, because the dashboard loader imports that file standalone.

The server is a Node process bound to 127.0.0.1. It holds model API keys in
memory only (never on disk) and accepts runs only with a per-install token kept
in ``$HERMES_HOME/swarm-studio/token``.

Models come from Hermes: the plugin registers two auxiliary model slots
(``swarm_studio_planner`` and ``swarm_studio_builder``), so they show up in
Hermes's model picker, and each run resolves them through Hermes's own provider
routing. ``SWARM_STUDIO_*`` environment variables override that.
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 4319
KEY_ENV = "SWARM_STUDIO_API_KEY"
DEFAULT_ENDPOINT = "https://api.inferhub.dev/v1"
DEFAULT_MODEL = "cb/deepseek-v4.1-flash"
# role -> (Hermes auxiliary slot, model override variable)
SLOTS = {
    "planner": ("swarm_studio_planner", "SWARM_STUDIO_PLANNER_MODEL"),
    "worker": ("swarm_studio_builder", "SWARM_STUDIO_WORKER_MODEL"),
    # looks at screenshots of the finished pages; follows Hermes's vision model
    "reviewer": ("swarm_studio_reviewer", "SWARM_STUDIO_REVIEWER_MODEL"),
}
OPTIONAL = {"reviewer"}


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


def canvas_url() -> str:
    """The canvas address, with a version that changes whenever the canvas files do,
    so Hermes Desktop's pane loads the new canvas instead of keeping the old one."""
    web = ROOT / "web"
    version = int(max((f.stat().st_mtime for f in web.iterdir() if f.is_file()), default=0))
    return f"{base_url()}/?v={version}"


def base_url() -> str:
    return f"http://127.0.0.1:{port()}"


def _secret(name: str) -> str | None:
    try:
        from agent.secret_scope import get_secret
    except ImportError:  # running outside Hermes (tests, plain python)
        return os.environ.get(name)
    return get_secret(name)


def _from_hermes(slot: str) -> dict:
    """Resolve one auxiliary slot through Hermes's provider routing.

    The swarm streams chat completions from its own process, so only providers
    with an OpenAI-compatible endpoint work; others report why instead."""
    try:
        from agent.auxiliary_client import get_text_auxiliary_client
    except ImportError:
        return {"error": "not running inside Hermes"}
    try:
        client, model = get_text_auxiliary_client(slot)
    except Exception as exc:  # provider setup errors come back as messages, not crashes
        return {"error": f"Hermes could not resolve a model: {exc}"}
    if client is None or not model:
        return {"error": "no model is configured in Hermes"}
    endpoint = str(getattr(client, "base_url", "") or "").rstrip("/")
    key = getattr(client, "api_key", None)
    if not endpoint.startswith("http") or not isinstance(key, str) or not key or type(client).__module__.split(".")[0] != "openai":
        return {"error": f"{type(client).__name__} has no OpenAI-compatible endpoint; pick a chat-completions provider for {slot}"}
    return {"base_url": endpoint, "api_key": key, "model": model, "source": f"Hermes auxiliary.{slot}"}


def resolve_models() -> dict:
    """{role: {base_url, api_key, model, source} | {error}} for the planner and the builders.

    Precedence: SWARM_STUDIO_API_KEY (with its base URL and models) when set, then
    the Hermes slot, with SWARM_STUDIO_*_MODEL overriding the model either way."""
    key = _secret(KEY_ENV)
    out = {}
    for role, (slot, model_env) in SLOTS.items():
        if key:
            got = {"base_url": (os.environ.get("SWARM_STUDIO_BASE_URL") or DEFAULT_ENDPOINT).rstrip("/"),
                   "api_key": key, "model": DEFAULT_MODEL, "source": KEY_ENV}
        else:
            got = _from_hermes(slot)
        if "error" not in got and os.environ.get(model_env):
            got["model"] = os.environ[model_env]
        out[role] = got
    return out


def describe_models() -> dict:
    """resolve_models() without keys, for people and logs."""
    return {role: {k: v for k, v in m.items() if k != "api_key"} for role, m in resolve_models().items()}


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
        return {"running": True, "started": False, "url": canvas_url()}

    models = resolve_models()
    problems = [f"{role}: {m['error']}" for role, m in models.items() if "error" in m and role not in OPTIONAL]
    if problems:
        return {"running": False, "error": "Swarm Studio has no usable model. " + "; ".join(problems)}
    node = os.environ.get("SWARM_STUDIO_NODE") or shutil.which("node")
    if not node:
        return {"running": False, "error": "Node.js 20+ is required (no `node` on PATH)."}

    # A minimal environment: the child gets its own settings, not every secret Hermes holds.
    env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "LANG", "HERMES_HOME") if k in os.environ}
    env.update(SWARM_TOKEN=token(), SWARM_RUNS_DIR=str(data_dir() / "runs"), SWARM_DATA_DIR=str(data_dir()))
    # Images come from Hermes's own image providers (your Codex login, for one):
    # the server runs imagegen.py with this Python and these import paths.
    env.update(SWARM_HERMES_PY=sys.executable, SWARM_HERMES_PYTHONPATH=os.pathsep.join(p for p in sys.path if p and os.path.isdir(p)))
    # Defaults for builds started from the canvas itself; Hermes sends fresh ones with each run.
    for role, m in models.items():
        if "error" in m:
            continue
        prefix = f"SWARM_{role.upper()}_"
        env.update({prefix + "BASE_URL": m["base_url"], prefix + "API_KEY": m["api_key"], prefix + "MODEL": m["model"]})
    if os.environ.get("SWARM_STUDIO_AGENTS"):
        env["SWARM_AGENTS"] = os.environ["SWARM_STUDIO_AGENTS"]

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
            return {"running": True, "started": True, "url": canvas_url()}
        time.sleep(0.1)
    return {"running": False, "error": f"server did not answer on {base_url()}; see {data_dir() / 'server.log'}"}


def start_run(brief: str, agents: int | None = None) -> dict:
    up = ensure_server()
    if not up.get("running"):
        return up
    models = resolve_models()
    body: dict = {"brief": brief, "models": {r: m for r, m in models.items() if "error" not in m}}
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
