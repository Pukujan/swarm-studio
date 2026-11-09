"""Everything Swarm Studio does, as commands: one dispatcher behind ``/swarm …``,
``hermes swarm …`` and the ``swarm_studio`` tool, so the chat, the terminal and
the canvas all reach the same features.

Settings (models, images, lite mode) go straight to the server. Actions that need
the canvas itself (a review photographs the pages it draws) are sent to the open
canvas, which runs them on screen.
"""

from __future__ import annotations

import json
import time
import urllib.error

try:
    from . import launcher
except ImportError:  # loaded by path
    import launcher  # type: ignore

ROLES = {"planner": "planner", "builders": "worker", "builder": "worker", "worker": "worker", "reviewer": "reviewer"}

HELP = """Swarm Studio commands
  /swarm <brief>                  build a site from a brief
  /swarm files                    recent builds
  /swarm open <n|id>              open a build on the canvas (n from /swarm files)
  /swarm play                     play the open build as a clickable prototype
  /swarm review [n|id]            a vision model checks every page; agents fix what it finds
  /swarm video [n|id]             cut a 20-second promo video of a build (HyperFrames, MP4)
  /swarm models                   which model does what
  /swarm models <planner|builders|reviewer> <model id|off|reset>
  /swarm images [auto|off|<provider> [model]]   generated images (default: your Codex login)
  /swarm lite [on|off|auto]       lite mode for machines short on memory"""

SUBCOMMANDS = {"help", "files", "open", "play", "review", "video", "models", "images", "lite"}


def _api(path: str, body: dict | None = None, timeout: float = 15.0) -> dict:
    up = launcher.ensure_server()
    if not up.get("running"):
        raise RuntimeError(up.get("error") or "the canvas server is not running")
    try:
        return launcher._request(path, method="POST" if body is not None else "GET", body=body, timeout=timeout)
    except urllib.error.HTTPError as exc:
        try:
            raise RuntimeError(json.loads(exc.read().decode()).get("error") or str(exc)) from None
        except ValueError:
            raise RuntimeError(str(exc)) from None


def _canvas(op: str, **extra) -> str:
    got = _api("/api/cmd", {"op": op, **extra})
    if not got.get("clients"):
        return "Open the Swarm Studio canvas first (the swarm pane in Hermes Desktop, or `hermes swarm`), then run this again."
    return ""


def _runs() -> list:
    return _api("/api/runs")


def _pick_run(ref: str) -> dict | None:
    runs = _runs()
    if not ref:
        return runs[0] if runs else None
    if ref.isdigit() and 0 < int(ref) <= len(runs):
        return runs[int(ref) - 1]
    return next((r for r in runs if r["id"] == ref or r["id"].startswith(ref)), None)


def is_command(text: str) -> bool:
    words = text.strip().split()
    if not words or words[0].lower() not in SUBCOMMANDS:
        return False
    # a brief that happens to start with one of these words is still a brief
    return len(words) <= 4


def run(text: str) -> str:
    words = text.strip().split()
    cmd, args = words[0].lower(), words[1:]
    try:
        return _dispatch(cmd, args)
    except RuntimeError as exc:
        return f"Swarm Studio: {exc}"


def _dispatch(cmd: str, args: list[str]) -> str:
    if cmd == "help":
        return HELP

    if cmd == "files":
        runs = _runs()[:12]
        if not runs:
            return "No builds yet. Start one with /swarm <brief>."
        lines = [f"{i:>2}. {r['title'][:56]}  ({r['pages']} pages{', building' if r.get('live') else ''})  {r['id']}" for i, r in enumerate(runs, 1)]
        return "\n".join(lines + ["Open one with /swarm open <n>."])

    if cmd == "open":
        r = _pick_run(args[0] if args else "")
        if not r:
            return "No such build. See /swarm files."
        return _canvas("open", run=r["id"]) or f"Opened “{r['title']}” on the canvas."

    if cmd == "play":
        return _canvas("play") or "Playing the open build as a prototype."

    if cmd == "review":
        r = _pick_run(args[0]) if args else None
        if args and not r:
            return "No such build. See /swarm files."
        return _canvas("review", **({"run": r["id"]} if r else {})) or (
            f"Reviewing “{r['title']}”" if r else "Reviewing the open build") + ": watch the canvas, fixes stream in live."

    if cmd == "video":
        return _video(args[0] if args else "", wait=False)

    if cmd == "models":
        if not args:
            info = _api("/api/models")
            out = []
            for label, role in (("planner ", "planner"), ("builders", "worker"), ("reviewer", "reviewer")):
                s = info["roles"][role]
                how = "off" if s.get("picked") == "off" else ("picked here" if s.get("picked") else "from Hermes")
                out.append(f"{label}  {s['model'] or '—'}  ({how})")
            img = info["image"]["pick"]
            out.append("images    " + ("off" if img == "off" else f"{img['provider']} {img['model']}".strip() if img else "auto (Codex login, gpt-image-2-low)"))
            out.append("lite      " + {True: "on", False: "off"}.get(info.get("lite"), "auto"))
            return "\n".join(out)
        role = ROLES.get(args[0].lower())
        if not role or len(args) < 2:
            return "Usage: /swarm models <planner|builders|reviewer> <model id|off|reset>"
        value = args[1]
        if value == "off" and role != "reviewer":
            return "Only the reviewer can be turned off."
        _api("/api/models", {"role": role, "model": None if value == "reset" else value})
        return f"{args[0]}: " + ("back to Hermes's setting" if value == "reset" else value) + ". Applies to the next build."

    if cmd == "images":
        if not args:
            info = _api("/api/models")
            avail = [p["provider"] for p in info["image"]["providers"] if p["available"]]
            pick = info["image"]["pick"]
            now = "off" if pick == "off" else f"{pick['provider']} {pick['model']}".strip() if pick else "auto (Codex login, gpt-image-2-low)"
            return f"Images: {now}. Signed-in providers: {', '.join(avail) or 'none'}."
        if args[0] in ("auto", "reset"):
            _api("/api/models", {"role": "image", "provider": None})
            return "Images: auto (your Codex login, gpt-image-2-low)."
        if args[0] == "off":
            _api("/api/models", {"role": "image", "provider": "off"})
            return "Images off: builders draw shapes and SVG instead."
        _api("/api/models", {"role": "image", "provider": args[0], "model": args[1] if len(args) > 1 else ""})
        return f"Images: {' '.join(args[:2])}. Applies to the next build."

    if cmd == "lite":
        value = (args[0] if args else "on").lower()
        if value not in ("on", "off", "auto"):
            return "Usage: /swarm lite [on|off|auto]"
        _api("/api/models", {"role": "lite", "on": None if value == "auto" else value == "on"})
        return f"Lite mode {value}. The canvas picks it up within a second."

    return HELP


def _video(ref: str, wait: bool) -> str:
    r = _pick_run(ref)
    if not r:
        return "No such build. See /swarm files."
    path = f"/api/runs/{r['id']}/video"
    job = _api(path, {})
    if not wait:
        return (f"Cutting a promo video of “{r['title']}”: the planner writes the storyboard, HyperFrames renders it "
                "(about a minute; the first one also fetches the renderer). Watch it on the canvas; "
                f"it is saved as runs/{r['id']}/video/promo.mp4.")
    deadline = time.time() + 600
    while job.get("state") == "working" and time.time() < deadline:
        time.sleep(3)
        job = _api(path)
    if job.get("state") == "done":
        return f"Promo video of “{r['title']}” is ready ({round(job.get('seconds') or 0)}s): {job.get('file')}"
    return f"Video: {job.get('message') or job.get('state')}"


# The tool: the same commands for the Hermes agent, with plain arguments.
TOOL_SCHEMA = {
    "name": "swarm_studio",
    "description": "Control Swarm Studio after a build: list or open builds, play the prototype, run the visual review (a vision model checks each page and agents fix issues live), cut a promo video of a build (MP4, waits until it is rendered and returns the file path), and set the models, image generation and lite mode.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["files", "open", "play", "review", "video", "models", "images", "lite", "help"]},
            "build": {"type": "string", "description": "for open/review/video: a number from `files` (1 = latest) or a build id; default the open or latest build"},
            "role": {"type": "string", "enum": ["planner", "builders", "reviewer"], "description": "for models: which role to change; omit to list"},
            "model": {"type": "string", "description": "for models: a model id, 'off' (reviewer only) or 'reset'; for images: the image model"},
            "provider": {"type": "string", "description": "for images: a Hermes image provider (openai-codex, xai, …), 'auto' or 'off'; omit to show"},
            "value": {"type": "string", "enum": ["on", "off", "auto"], "description": "for lite"},
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


def tool(args: dict | None = None, **_: object) -> str:
    a = args or {}
    action = str(a.get("action") or "help")
    if action == "video":
        try:
            return _video(str(a.get("build") or ""), wait=True)
        except RuntimeError as exc:
            return f"Swarm Studio: {exc}"
    parts = {
        "open": [a.get("build") or "1"],
        "review": [a["build"]] if a.get("build") else [],
        "models": [a["role"], a.get("model") or "reset"] if a.get("role") else [],
        "images": [a["provider"], *([a["model"]] if a.get("model") else [])] if a.get("provider") else [],
        "lite": [a.get("value") or "on"],
    }.get(action, [])
    try:
        return _dispatch(action, [str(p) for p in parts])
    except RuntimeError as exc:
        return f"Swarm Studio: {exc}"
