"""Start and talk to the Swarm Studio canvas server.

Self-contained on purpose: the agent half (``__init__.py``) imports it as a
package module, and the dashboard route (``dashboard/plugin_api.py``) loads it
by path, because the dashboard loader imports that file standalone.

The server is a Node process bound to 127.0.0.1. It accepts runs only with a
per-install token kept in ``$HERMES_HOME/swarm-studio/token``.

Models stay in Hermes: the plugin registers three auxiliary model slots
(``swarm_studio_planner``, ``swarm_studio_builder`` and ``swarm_studio_reviewer``),
so they show up in Hermes's model picker, and the server's model calls go back
to Hermes through the bridge (bridge.py, bridge_llm.py), which answers them with
``ctx.llm``. No provider key reaches the server. The one key it may get is the
plugin's own ``SWARM_STUDIO_API_KEY``, when the person set it (Nous catalog
review, point 2).
"""

from __future__ import annotations

import json
import os
import secrets
import signal
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
# Optional keys and addresses, declared in plugin.yaml and read through Hermes's secret scope when the
# server starts (start()). Nothing here is required: each one switches a service on.
PASSED_KEYS = (
    "CKFF_API_KEY", "CKFF_BASE_URL", "CKFF_MODEL",              # pictures when Hermes's image tool cannot paint
    "MESHY_API_KEY",                                            # 3D characters (asks before spending credits)
    "FISH_API_KEY",                                             # game character voices (Fish Audio)
    "PEXELS_API_KEY", "PEXELS_OCTO_LEASE",                      # stand-in photos
    "OCTO_SWARM_WS", "OCTO_SWARM_WORKSPACE_ID", "OCTO_BASE_URL",  # public copies of stand-in photos
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",                # a generated app's data
    "STRIPE_SECRET_KEY",                                        # a generated app's checkout (test keys only)
    "RESEND_API_KEY",                                           # a generated app's email (only when its App kit chose Resend)
    "VERCEL_TOKEN", "CLOUDFLARE_API_TOKEN",                     # publishing
)
# role -> the Hermes auxiliary slot it uses (registered in __init__.py)
SLOTS = {"planner": "swarm_studio_planner", "worker": "swarm_studio_builder", "reviewer": "swarm_studio_reviewer"}
# With SWARM_STUDIO_API_KEY set, the server calls this endpoint and these models with it, not Hermes.
KEY_SETTINGS = ("SWARM_STUDIO_BASE_URL", "SWARM_STUDIO_PLANNER_MODEL", "SWARM_STUDIO_WORKER_MODEL", "SWARM_STUDIO_REVIEWER_MODEL")


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


def describe_models() -> dict:
    """Where each role's model calls go, for people and logs. Never a key."""
    if _secret(KEY_ENV):
        base = (os.environ.get("SWARM_STUDIO_BASE_URL") or "https://api.inferhub.dev/v1").rstrip("/")
        return {role: {"base_url": base, "model": os.environ.get(f"SWARM_STUDIO_{role.upper()}_MODEL") or "cb/deepseek-v4.1-flash", "source": KEY_ENV} for role in SLOTS}
    return {role: {"base_url": "Hermes (ctx.llm)", "model": f"auxiliary.{slot}", "source": "Hermes"} for role, slot in SLOTS.items()}


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


def code_stamp() -> float:
    """When the server's own code last changed on disk (the newest file under server/ and engine/)."""
    newest = 0.0
    for folder in ("server", "engine"):
        for f in (ROOT / folder).glob("*.mjs"):
            try:
                newest = max(newest, f.stat().st_mtime)
            except OSError:
                pass
    return newest


def stale(st: dict, stamp: float | None = None) -> bool:
    """True when the running server was started before its code on disk last changed: the plugin was
    updated under it. A server too old to say when it started is left alone (it cannot be asked to stop)."""
    booted = st.get("booted")
    if not isinstance(booted, (int, float)) or not st.get("pid"):
        return False
    return (code_stamp() if stamp is None else stamp) > booted / 1000 + 1


def _retire(st: dict) -> bool:
    """Stop an idle, outdated server so the next one runs the code now on disk. Never a busy one."""
    if st.get("busy"):
        return False
    try:
        os.kill(int(st["pid"]), signal.SIGTERM)
    except (OSError, ValueError, KeyError):
        return False
    for _ in range(50):  # ~5s for the port to come free
        if not state():
            return True
        time.sleep(0.1)
    return False


# Set by the package (``__init__.py``) to bridge.start: once the server answers, this Hermes process attaches
# its bridge, so the server can ask Hermes for pictures and clips. None when this file is loaded on its own.
on_server = None


def _bridged(result: dict) -> dict:
    if result.get("running") and on_server is not None:
        try:
            on_server()
        except Exception:  # the build still runs; pictures fall back as when Hermes is closed
            pass
    return result


def ensure_server() -> dict:
    """Start the canvas server if it is not already up, and attach this process's Hermes bridge.
    Returns {url} or {error}.

    A server left running from before a plugin update is replaced when it is idle, so an update
    takes effect without the person finding and stopping a background process."""
    return _bridged(_ensure_server())


def _ensure_server() -> dict:
    st = state()
    if st and not (stale(st) and _retire(st)):
        return {"running": True, "started": False, "url": canvas_url()}

    node = os.environ.get("SWARM_STUDIO_NODE") or shutil.which("node")
    if not node:
        return {"running": False, "error": "Node.js 20+ is required (no `node` on PATH)."}

    # A minimal environment: the child gets its own settings, not every secret Hermes holds.
    # On Windows, Node also needs the system folders (SYSTEMROOT for its sockets and
    # crypto, TEMP, APPDATA for npm and pnpm, PATHEXT for finding .cmd tools).
    keep = ("PATH", "HOME", "TMPDIR", "LANG", "HERMES_HOME", "SWARM_GODOT", "GODOT")
    if os.name == "nt":
        keep += ("SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE",
                 "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA",
                 "HOMEDRIVE", "HOMEPATH", "NVM_HOME", "NVM_SYMLINK")
    env = {k: os.environ[k] for k in keep if k in os.environ}
    env.update(SWARM_TOKEN=token(), SWARM_RUNS_DIR=str(data_dir() / "runs"), SWARM_DATA_DIR=str(data_dir()))
    # Pictures and clips come from Hermes's own image and video tools through the bridge (bridge.py),
    # which attaches itself once the server is up. The Python and its import paths are for the Feed and
    # connector helpers.
    env.update(SWARM_HERMES_BIN=shutil.which("hermes") or "", SWARM_HERMES_PY=sys.executable, SWARM_HERMES_PYTHONPATH=os.pathsep.join(p for p in sys.path if p and os.path.isdir(p)))
    # Model calls go back to Hermes through the bridge, so no provider key is handed over. The one
    # exception is the plugin's own key, when the person set it (Nous catalog review, point 2).
    own = _secret(KEY_ENV)
    if own:
        env[KEY_ENV] = own
        env.update({k: os.environ[k] for k in KEY_SETTINGS if os.environ.get(k)})
    # Optional: ElevenLabs music and sound effects for the Film studio, from Hermes's secret scope.
    try:
        eleven = _secret("ELEVENLABS_API_KEY")
    except Exception:  # an unscoped read under multiplexing: the film is scored without it
        eleven = None
    if eleven:
        env["SWARM_ELEVENLABS_KEY"] = eleven
    # Every other optional key the studio can use (plugin.yaml, optional_env) reaches the server the
    # same way: read here through Hermes's secret scope and handed over in its environment. The
    # server and the engine read no .env file and no other credential store (catalog rule 11).
    for name in PASSED_KEYS:
        try:
            value = _secret(name)
        except Exception:  # an unscoped read under multiplexing: that service is simply not connected
            value = None
        if value:
            env[name] = value
    if os.environ.get("SWARM_STUDIO_AGENTS"):
        env["SWARM_AGENTS"] = os.environ["SWARM_STUDIO_AGENTS"]

    # The server outlives Hermes: its own session on POSIX. On Windows a detached
    # process, out of the caller's job when the job allows it (an SSH session's job
    # otherwise ends the server with the session).
    if os.name == "nt":
        detached = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        tries = [{"creationflags": detached | subprocess.CREATE_BREAKAWAY_FROM_JOB}, {"creationflags": detached}]
    else:
        tries = [{"start_new_session": True}]
    log = open(data_dir() / "server.log", "ab")
    try:
        for i, flags in enumerate(tries):
            try:
                subprocess.Popen(
                    [node, str(ROOT / "server" / "server.mjs"), "--port", str(port())],
                    # Not the plugin's folder: Windows locks a running program's working folder, and
                    # `hermes plugins install --force` / update must be able to replace that folder.
                    cwd=str(data_dir()),
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=log,
                    stderr=log,
                    **flags,
                )
                break
            except OSError as exc:
                if i == len(tries) - 1:
                    return {"running": False, "error": f"could not start node: {exc}"}
    finally:
        log.close()

    for _ in range(60):  # ~6s
        if state():
            return {"running": True, "started": True, "url": canvas_url()}
        time.sleep(0.1)
    return {"running": False, "error": f"server did not answer on {base_url()}; see {data_dir() / 'server.log'}"}


TALK_FIRST = ("Not started: the brief asks to talk before anything is built. Talk it through first, then send the "
              "agreed brief without that line (or add --build). In the studio, the Make box opens that talk with the planner.")


def talk_first(brief: str) -> bool:
    """True when the brief says not to build yet (the planner model reads it; engine/talkplan.mjs)."""
    try:
        got = _request("/api/discuss/read", method="POST", body={"text": brief, "kind": "site"}, timeout=12)
    except (OSError, urllib.error.URLError, ValueError):
        return False
    return got.get("intent") == "talk"


def refusal(exc: urllib.error.HTTPError) -> dict:
    """A refused request as {error, code, action}: the server says why (engine/hermeshealth.mjs) and what to do."""
    try:
        got = json.loads(exc.read().decode() or "{}")
    except (OSError, ValueError):
        got = {}
    message = got.get("message") or got.get("error") or f"the server answered HTTP {exc.code}"
    out = {"error": str(message), "code": str(got.get("code") or exc.code)}
    if got.get("action"):
        out["action"] = str(got["action"])
    return out


def start_run(brief: str, agents: int | None = None, force: bool = False) -> dict:
    up = ensure_server()
    if not up.get("running"):
        return up
    if not force and talk_first(brief):
        return {"running": True, "talk": True, "error": TALK_FIRST, "url": up["url"]}
    body: dict = {"brief": brief}
    if agents:
        body["agents"] = max(2, min(24, int(agents)))
    try:
        # a Hermes that is starting up gets a few seconds to attach before the server says it is missing
        got = _request("/api/run", method="POST", body=body, timeout=15)
    except urllib.error.HTTPError as exc:
        # refused with a reason (Hermes not there, or running an older copy): the server's own words
        return {"running": True, "url": up["url"], **refusal(exc)}
    except (OSError, urllib.error.URLError, ValueError) as exc:
        return {"running": True, "error": f"could not start the run: {exc}"}
    # the person started it here: an open canvas shows it (a canvas never switches builds by itself)
    if got.get("run"):
        try:
            _request("/api/cmd", method="POST", body={"op": "open", "run": got["run"]}, timeout=5)
        except (OSError, urllib.error.URLError, ValueError):
            pass
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
