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
  /swarm files [words]            recent builds, or search them (tag:x folder:x on:vercel has:video)
  /swarm info [n|id]              a build's details: theme, models, pages, live links, video, tags
  /swarm open <n|id>              open a build on the canvas (n from /swarm files)
  /swarm play                     play the open build as a clickable prototype
  /swarm review [n|id]            a vision model checks every page; agents fix what it finds
  /swarm fix <what to change>     an agent reworks the selected section (or the planner finds which)
  /swarm export [n|id]            files: static HTML, a React + Tailwind project, an ABA handoff
  /swarm publish [n|id] [github|vercel|cloudflare|local]   a live link (GitHub Pages by default)
  /swarm hosts                    where you can publish, and how to connect Vercel or Cloudflare
  /swarm video [n|id] [voice|off] [nomusic]  cut a promo video with a Kokoro voiceover and music (MP4)
  /swarm models                   which model does what
  /swarm models <planner|builders|reviewer> <model id|off|reset>
  /swarm images [auto|off|<provider> [model]]   generated images (default: your Codex login)
  /swarm motion [on|off]          scroll-in reveals and hover lifts in the prototype
  /swarm lite [on|off|auto]       lite mode for machines short on memory"""

TARGETS = ("github", "vercel", "cloudflare", "local")

SUBCOMMANDS = {"help", "files", "info", "open", "play", "review", "fix", "export", "publish", "hosts", "video", "motion", "models", "images", "lite"}


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


def _match(r: dict, q: str) -> bool:
    """The canvas's search: every field, plus tag:, folder:, on:<host>, has:video|site|images|note."""
    theme = r.get("theme") or {}
    hay = " ".join(str(x) for x in [r.get("title"), r.get("autoTitle"), r.get("brief"), r.get("folder"), r.get("note"), r["id"],
                                    *r.get("tags", []), *r.get("pageTitles", []), theme.get("name"), theme.get("direction"),
                                    *(theme.get("fonts") or {}).values(), *(r.get("models") or {}).values(), *(r.get("sites") or {}).values()] if x).lower()
    for w in q.lower().split():
        k, _, v = w.partition(":") if ":" in w else ("", "", w)
        ok = (any(v in t for t in r.get("tags", [])) if k == "tag"
              else v in (r.get("folder") or "").lower() if k == "folder"
              else any(v in p for p in r.get("published", [])) if k == "on"
              else {"video": r.get("video"), "site": r.get("published"), "images": r.get("images"), "note": r.get("note")}.get(v, True) if k == "has"
              else v in hay)
        if not ok:
            return False
    return True


def _files(q: str) -> str:
    runs = _runs()
    if not runs:
        return "No builds yet. Start one with /swarm <brief>."
    # numbers stay the build's place in the full list, so /swarm open <n> still works
    hits = [(i, r) for i, r in enumerate(runs, 1) if not q or _match(r, q)][: 40 if q else 15]
    if not hits:
        return f"No builds match “{q}”. Try a word from the brief, the theme or a tag, or tag:, folder:, on:vercel, has:video."
    lines = []
    for i, r in hits:
        when = time.strftime("%b %d %H:%M", time.localtime((r.get("t") or 0) / 1000))
        extra = [f"{r['pages']} pages", "building" if r.get("live") else "", "🎬" if r.get("video") else "",
                 ("🌐 " + ", ".join(r.get("published") or [])) if r.get("published") else "",
                 f"📁 {r['folder']}" if r.get("folder") else "", " ".join(f"#{t}" for t in r.get("tags", []))]
        lines.append(f"{i:>2}. {r['title'][:52]}  · {when} · {' · '.join(x for x in extra if x)}")
    more = "" if q or len(runs) <= 15 else f"\n…and {len(runs) - 15} older; search with /swarm files <words>."
    return "\n".join(lines) + more + "\nOpen one with /swarm open <n>, details with /swarm info <n>."


def _info(r: dict) -> str:
    when = lambda t: time.strftime("%Y-%m-%d %H:%M", time.localtime((t or 0) / 1000))
    theme = r.get("theme") or {}
    rows = [
        ("Name", r["title"] + (f" (was “{r['autoTitle']}”)" if r.get("autoTitle") and r["autoTitle"] != r["title"] else "")),
        ("Brief", r.get("brief")),
        ("Made", when(r.get("t"))), ("Last change", when(r.get("updated"))),
        ("Built", f"{r['pages']} pages, {r['layers']} sections, {r.get('agents', 0)} agents" + (f", {r['ms'] / 1000:.1f}s" if r.get("ms") else "")),
        ("Pages", ", ".join(r.get("pageTitles") or [])),
        ("Theme", f"{theme.get('name')} · {' '.join(theme.get('colors') or [])} · {(theme.get('fonts') or {}).get('heading', '')} / {(theme.get('fonts') or {}).get('body', '')}" if theme else ""),
        ("Models", " · ".join(f"{k} {v}" for k, v in (r.get("models") or {}).items() if v)),
        ("Work since", " · ".join(x for x in [f"{r['images']} pictures" if r.get("images") else "", f"{r['reviews']} reviews" if r.get("reviews") else "",
                                               f"{r['edits']} edits" if r.get("edits") else "", f"{r['exports']} exports" if r.get("exports") else ""] if x)),
        ("Live at", " · ".join(f"{k}: {u}" for k, u in (r.get("sites") or {}).items())),
        ("Video", f"runs/{r['id']}/video/promo.mp4" if r.get("video") else ""),
        ("Folder", r.get("folder")), ("Tags", ", ".join(r.get("tags") or [])), ("Note", r.get("note")), ("ID", r["id"]),
    ]
    return "\n".join(f"{k + ':':<12} {v}" for k, v in rows if v)


def is_command(text: str) -> bool:
    words = text.strip().split()
    if not words or words[0].lower() not in SUBCOMMANDS:
        return False
    # a comment is free text; a brief that happens to start with another of these words is still a brief
    return words[0].lower() in ("fix", "files") or len(words) <= 4


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
        return _files(" ".join(args))

    if cmd == "info":
        r = _pick_run(args[0] if args else "")
        return _info(r) if r else "No such build. See /swarm files."

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
        # /swarm video [n] [voice|off] [nomusic]
        ref = next((x for x in args if x.isdigit() or x.startswith("20")), "")
        voice = next((x for x in args if x == "off" or ("_" in x and not x.startswith("20"))), "")
        return _video(ref, wait=False, voice=voice, music="nomusic" not in args)

    if cmd == "export":
        r = _pick_run(args[0] if args else "")
        if not r:
            return "No such build. See /swarm files."
        out = _api(f"/api/runs/{r['id']}/export", {}, timeout=60)
        return (f"Exported “{r['title']}” to {out['dir']}:\n"
                f"  html/   {out['pages']} static pages (open html/index.html)\n"
                f"  react/  {out['sections']} section components, Vite + Tailwind (npm i && npm run dev)\n"
                f"  aba/    spec.md + blueprint.json, to hand to an app builder" + (f"\nZip: {out['zip']}" if out.get("zip") else ""))

    if cmd == "publish":
        hosts = [a.lower() for a in args if a.lower() in TARGETS]
        rest = [a for a in args if a.lower() not in TARGETS]
        return _publish(rest[0] if rest else "", hosts[0] if hosts else "github")

    if cmd == "hosts":
        h = _api("/api/publish")
        lines = [f"github      {'signed in as ' + h['github'] if h.get('github') else 'not signed in: run `gh auth login`'}"]
        for p in ("vercel", "cloudflare"):
            c = h.get(p)
            lines.append(f"{p:<11} " + (f"connected ({c['user']})" if c else f"not connected: 🌐 Publish on the canvas → Connect, or set {h['providers'][p]['env']} (token from {h['providers'][p]['tokenUrl']})"))
        lines.append("local       always: hosted on this computer")
        return "\n".join(lines)

    if cmd == "fix":
        return _fix(" ".join(args).strip().strip('"“”'), "")

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

    if cmd == "motion":
        value = (args[0] if args else "on").lower()
        if value not in ("on", "off"):
            return "Usage: /swarm motion [on|off]"
        return _canvas("motion", on=value == "on") or f"Motion {value} in the prototype."

    if cmd == "lite":
        value = (args[0] if args else "on").lower()
        if value not in ("on", "off", "auto"):
            return "Usage: /swarm lite [on|off|auto]"
        _api("/api/models", {"role": "lite", "on": None if value == "auto" else value == "on"})
        return f"Lite mode {value}. The canvas picks it up within a second."

    return HELP


def _fix(text: str, ref: str) -> str:
    if not text:
        return 'Usage: /swarm fix <what to change>, e.g. /swarm fix make the hero darker and the headline shorter'
    # on the open canvas, so a selected section is the one changed and the person sees it happen
    if not ref and _api("/api/cmd", {"op": "fix", "text": text}).get("clients"):
        return f"Sent to the canvas: “{text}”. An agent picks it up and rewrites the section live."
    r = _pick_run(ref)
    if not r:
        return "No such build. See /swarm files."
    got = _api(f"/api/runs/{r['id']}/comment", {"text": text}, timeout=60)
    where = ", ".join(got.get("sections") or []) or "the right section"
    return f"On it in “{r['title']}”: reworking {where}." + (f" ({got['reply']})" if got.get("reply") else "")


def _publish(ref: str, target: str) -> str:
    r = _pick_run(ref)
    if not r:
        return "No such build. See /swarm files."
    path = f"/api/runs/{r['id']}/publish"
    job = _api(path, {"target": target}, timeout=60)
    deadline = time.time() + 300
    while job.get("state") == "working" and time.time() < deadline:
        time.sleep(3)
        job = _api(path)
    if job.get("state") != "done":
        return f"Publish: {job.get('message') or job.get('state')}"
    if job.get("target") != "local" and job.get("url", "").startswith("https://"):
        where = {"github": f"Repo: https://github.com/{job.get('repo')}", "vercel": f"Vercel project: {str(job.get('repo', '')).split(':', 1)[-1]}",
                 "cloudflare": f"Cloudflare Pages project: {str(job.get('repo', '')).split(':', 1)[-1]}"}.get(job.get("target"), "")
        return (f"“{r['title']}” is live: {job['url']}" + (" (still going live; give it a minute)" if job.get("pending") else "")
                + f"\n{where}. Publish again to update it.")
    note = f" ({target} didn't work: {job['message']})" if job.get("message") else ""
    return f"“{r['title']}” is hosted on this computer: {job.get('url')}{note}"


def _video(ref: str, wait: bool, voice: str = "", music: bool = True) -> str:
    r = _pick_run(ref)
    if not r:
        return "No such build. See /swarm files."
    path = f"/api/runs/{r['id']}/video"
    job = _api(path, {**({"voice": voice} if voice else {}), "music": music})
    if not wait:
        return (f"Cutting a promo video of “{r['title']}”: the planner writes the storyboard and voiceover, HyperFrames renders it, Kokoro reads it over music "
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
    "description": "Control Swarm Studio after a build: list, search (by name, brief, theme, tag, folder, host) or open builds, show a build's details, play the prototype, run the visual review (a vision model checks each page and agents fix issues live), pass on a person's comment so an agent rewrites that part of the design live, export a build as files (static HTML, a React + Tailwind project, an ABA spec and blueprint), publish it as a live website (GitHub Pages, Vercel, Cloudflare Pages or this computer; waits and returns the URL; `hosts` shows where the person is signed in), cut a promo video of a build with a local Kokoro voiceover and music (MP4, waits until it is rendered and returns the file path), turn the prototype's motion on or off, and set the models, image generation and lite mode.",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["files", "info", "open", "play", "review", "fix", "export", "publish", "hosts", "video", "motion", "models", "images", "lite", "help"]},
            "build": {"type": "string", "description": "for open/info/review/fix/export/publish/video: a number from `files` (1 = latest) or a build id; default the open or latest build"},
            "text": {"type": "string", "description": "for files: search words (tag:x, folder:x, on:vercel, has:video work too); for fix: what to change, in the person's words (\"make the hero darker\", \"shorter footer\")"},
            "role": {"type": "string", "enum": ["planner", "builders", "reviewer"], "description": "for models: which role to change; omit to list"},
            "model": {"type": "string", "description": "for models: a model id, 'off' (reviewer only) or 'reset'; for images: the image model"},
            "provider": {"type": "string", "description": "for images: a Hermes image provider (openai-codex, xai, …), 'auto' or 'off'; omit to show"},
            "value": {"type": "string", "enum": ["on", "off", "auto"], "description": "for lite (on/off/auto) and motion (on/off)"},
            "voice": {"type": "string", "description": "for video: a Kokoro voice (af_heart, af_bella, am_michael, bf_emma, bm_george), 'off' for none; default picks one for the theme"},
            "music": {"type": "boolean", "description": "for video: false for no music bed (default true)"},
            "target": {"type": "string", "enum": ["github", "vercel", "cloudflare", "local"], "description": "for publish: github (a public GitHub Pages link through the gh login, the default), vercel or cloudflare (the person's own account, once connected on the canvas), or local (hosted on this computer)"},
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


def tool(args: dict | None = None, **_: object) -> str:
    a = args or {}
    action = str(a.get("action") or "help")
    if action in ("video", "fix", "publish"):
        try:
            if action == "publish":
                return _publish(str(a.get("build") or ""), a.get("target") if a.get("target") in TARGETS else "github")
            if action == "fix":
                return _fix(str(a.get("text") or "").strip(), str(a.get("build") or ""))
            return _video(str(a.get("build") or ""), wait=True, voice=str(a.get("voice") or ""), music=a.get("music") is not False)
        except RuntimeError as exc:
            return f"Swarm Studio: {exc}"
    parts = {
        "open": [a.get("build") or "1"],
        "files": str(a.get("text") or "").split(),
        "info": [a["build"]] if a.get("build") else [],
        "review": [a["build"]] if a.get("build") else [],
        "export": [a["build"]] if a.get("build") else [],
        "models": [a["role"], a.get("model") or "reset"] if a.get("role") else [],
        "images": [a["provider"], *([a["model"]] if a.get("model") else [])] if a.get("provider") else [],
        "lite": [a.get("value") or "on"],
        "motion": [a.get("value") or "on"],
    }.get(action, [])
    try:
        return _dispatch(action, [str(p) for p in parts])
    except RuntimeError as exc:
        return f"Swarm Studio: {exc}"
