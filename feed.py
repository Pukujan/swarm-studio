"""Swarm Feed from Hermes: connect, post a build, remix one, sign a browser in.

The feed (https://swarm.design-bakery.com, or ``SWARM_FEED_URL``) keeps people,
builds and remix chains; see docs/data-model.md in pukujan-lab-2/swarm-feed.
This module is the plugin's only client for it.

- ``/swarm connect``: the device flow. The feed gives a code; the person
  approves it on /link in their browser; this install gets its own token. A
  thread polls while Hermes runs, and any later feed command finishes it too,
  so it also works from the one-shot ``hermes swarm connect``.
- ``/swarm post [n] [--jam <id>] [caption]``: a published build into the feed,
  with a poster from its page shots, its pages and crew, then its export zip.
- ``/swarm remix <id> [change]``: a feed build's prompt starts a new run here;
  posting that run later records it as a remix of the original.
- ``/swarm login``: a one-time link that signs the browser in as you.

Settings live in ``$HERMES_HOME/swarm-studio/feed.json`` (mode 0600): the
token, who it belongs to, this install's id, a pending code, which runs were
posted or are remixes, and which Feed build each project lives in. The token
is never printed.

One idea is one Feed post (docs/specs/18-projects.md): the first run of a
project posts a build with ``project: {name}`` and ``piece``; a later run of
the same project sends its piece into that build (``into: <buildId>``). A
Feed that does not know these fields yet gets today's single post instead.
"""

from __future__ import annotations

import base64
import json
import os
import re
import secrets
import socket
import struct
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import zlib
from pathlib import Path

try:
    from . import launcher
except ImportError:  # loaded by path
    import launcher  # type: ignore

DEFAULT_ORIGIN = "https://swarm.design-bakery.com"
USER_AGENT = "swarm-studio/1.0 (+https://github.com/Pukujan/swarm-studio)"
MAX_POSTER = 2 * 1024 * 1024
MAX_BUNDLE = 50 * 1024 * 1024
KINDS = {"site", "app", "game", "film", "posts", "pack"}
EVENT_ID = re.compile(r"^(c-[a-z0-9]{6,16}|ev_[a-z0-9]{10})$")
BUILD_ID = re.compile(r"^b_[a-z0-9]{10}$")
AGENT_NAME = re.compile(r"^[A-Z][A-Za-z0-9-]{0,23}$")

_lock = threading.Lock()
_poller: threading.Thread | None = None


class FeedError(RuntimeError):
    def __init__(self, message: str, code: str = "", status: int = 0):
        super().__init__(message)
        self.code = code
        self.status = status


# ---------------------------------------------------------------- settings ---

def origin() -> str:
    return (os.environ.get("SWARM_FEED_URL") or DEFAULT_ORIGIN).rstrip("/")


def _settings_path() -> Path:
    return launcher.data_dir() / "feed.json"


def load() -> dict:
    try:
        got = json.loads(_settings_path().read_text("utf-8"))
        return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


def save(cfg: dict) -> None:
    path = _settings_path()
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(cfg, fh, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def _update(fn) -> dict:
    with _lock:
        cfg = load()
        fn(cfg)
        save(cfg)
        return cfg


def _client_id(cfg: dict) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,120}", str(cfg.get("clientId") or "")):
        cfg["clientId"] = "ss_" + secrets.token_urlsafe(18)
    return cfg["clientId"]


# -------------------------------------------------------------------- http ---

def _call(path: str, body: dict | None = None, *, token: str | None = None, method: str | None = None, timeout: float = 30.0) -> dict:
    url = path if path.startswith("http") else origin() + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if body is not None else "GET"))
    req.add_header("user-agent", USER_AGENT)
    req.add_header("accept", "application/json")
    if data is not None:
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            got = json.loads(exc.read().decode() or "{}")
        except ValueError:
            got = {}
        if isinstance(got, dict) and "status" in got and got.get("ok") is False and "code" not in got:
            return got  # the device poll answers pending/denied as plain data
        raise FeedError(got.get("message") if isinstance(got, dict) and got.get("message") else f"the feed answered {exc.code}",
                        str(got.get("code") or "") if isinstance(got, dict) else "", exc.code) from None
    except (OSError, urllib.error.URLError, ValueError) as exc:
        raise FeedError(f"could not reach {origin()}: {getattr(exc, 'reason', exc)}") from None


def _put_bytes(url: str, data: bytes, content_type: str, timeout: float = 300.0) -> dict:
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("user-agent", USER_AGENT)
    req.add_header("content-type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            msg = json.loads(exc.read().decode() or "{}").get("message")
        except ValueError:
            msg = None
        raise FeedError(msg or f"the upload was refused ({exc.code})", status=exc.code) from None
    except (OSError, urllib.error.URLError) as exc:
        raise FeedError(f"the upload failed: {getattr(exc, 'reason', exc)}") from None


def _open(url: str) -> bool:
    try:
        return bool(webbrowser.open(url))
    except Exception:  # no browser on this machine (a server, CI)
        return False


# ----------------------------------------------------------------- connect ---

def _finish(cfg: dict, got: dict) -> None:
    cfg.update(token=got["token"], handle=got.get("handle"), name=got.get("name"), connectedAt=int(time.time()), origin=origin())
    cfg.pop("pending", None)


def poll_once() -> str:
    """Ask the feed once about a pending code. Returns pending|approved|denied|expired|used|none."""
    cfg = load()
    pending = cfg.get("pending")
    if not pending:
        return "none"
    if time.time() > pending.get("expiresAt", 0):
        _update(lambda c: c.pop("pending", None))
        return "expired"
    got = _call("/api/feed/device/token", {"deviceCode": pending["deviceCode"]})
    status = got.get("status") or ("approved" if got.get("ok") else "pending")
    if status == "approved" and got.get("token"):
        _update(lambda c: _finish(c, got))
    elif status in ("denied", "expired", "used"):
        _update(lambda c: c.pop("pending", None))
    return status


def _poll_loop(interval: float) -> None:
    global _poller
    try:
        while True:
            time.sleep(interval)
            try:
                status = poll_once()
            except FeedError:
                continue  # a network blip; the next tick tries again
            if status == "slow_down":
                interval *= 2
            if status not in ("pending", "slow_down"):
                return
    finally:
        _poller = None


def _start_poller(interval: float) -> None:
    global _poller
    if _poller and _poller.is_alive():
        return
    _poller = threading.Thread(target=_poll_loop, args=(max(2.0, interval),), name="swarm-feed-connect", daemon=True)
    _poller.start()


def _who(cfg: dict) -> str:
    return f"{cfg.get('name') or cfg.get('handle')} (@{cfg.get('handle')})"


def connect(args: list[str]) -> str:
    sub = (args[0].lower() if args else "")
    cfg = load()
    if sub == "forget":
        _update(lambda c: [c.pop(k, None) for k in ("token", "handle", "name", "connectedAt", "pending")])
        return "Forgot the feed token on this computer. Revoke it on /me in the feed too if you no longer use it. /swarm connect to connect again."
    if cfg.get("pending"):
        status = poll_once()
        cfg = load()
        if status == "approved":
            return f"Connected to the Swarm Feed as {_who(cfg)}. /swarm post shares your latest build."
        if status in ("pending", "slow_down"):
            p = cfg["pending"]
            _start_poller(p.get("interval", 5))
            return f"Waiting for you to approve code {p['userCode']} at {p['url']} (open it, check the code, press Connect)."
        if status == "denied":
            return "The code was turned down on the feed. Run /swarm connect for a new one."
        if sub == "status":
            return "That code ran out. Run /swarm connect for a new one."
    if cfg.get("token"):
        try:
            me = _call("/api/feed/me", token=cfg["token"])
        except FeedError as exc:
            if exc.status == 401:
                return "The feed no longer takes this computer's token (revoked?). /swarm connect forget, then /swarm connect."
            return f"Connected as {_who(cfg)}, but the feed did not answer now: {exc}"
        v = me.get("viewer") or {}
        return f"Connected to the Swarm Feed as {v.get('name')} (@{v.get('handle')}), {v.get('credits', 0)} credits. Your page: {origin()}/me"
    if sub == "status":
        return "Not connected to the Swarm Feed. /swarm connect starts it."

    host = socket.gethostname().split(".")[0][:40] or "this computer"
    cid = _update(_client_id)["clientId"]
    got = _call("/api/feed/device", {"clientId": cid, "clientName": f"Hermes on {host}"[:80]})
    url = got.get("verificationUriComplete") or f"{origin()}/link?code={got['userCode']}"
    pending = {"deviceCode": got["deviceCode"], "userCode": got["userCode"], "url": url,
               "expiresAt": time.time() + int(got.get("expiresIn") or 600), "interval": int(got.get("interval") or 5)}
    _update(lambda c: c.__setitem__("pending", pending))
    opened = _open(url)
    _start_poller(pending["interval"])
    return (f"Connect Hermes to the Swarm Feed: approve code {got['userCode']} at\n  {url}\n"
            + ("(opened in your browser) " if opened else "")
            + "It finishes by itself once you press Connect; /swarm connect status checks. The code works for 10 minutes.")


def _token() -> str:
    cfg = load()
    if cfg.get("pending") and not cfg.get("token"):
        poll_once()
        cfg = load()
    if not cfg.get("token"):
        raise FeedError("Connect to the Swarm Feed first: /swarm connect")
    return cfg["token"]


# -------------------------------------------------------------------- post ---

def run_dir(run_id: str) -> Path | None:
    """Where the canvas server keeps a run: the launcher's runs folder, or the repo's own for a server started by hand."""
    for base in (launcher.data_dir() / "runs", launcher.ROOT / "runs"):
        if (base / run_id).is_dir():
            return base / run_id
    return None


def _run_start(folder: Path | None) -> tuple[dict, list[dict]]:
    """The run:start event and the finished layers, read from the run's event log."""
    start, layers = {}, []
    if not folder:
        return start, layers
    try:
        with open(folder / "events.jsonl", encoding="utf-8") as fh:
            for line in fh:
                if '"run:start"' in line and not start:
                    start = json.loads(line)
                elif '"layer:done"' in line:
                    try:
                        layers.append(json.loads(line))
                    except ValueError:
                        pass
    except (OSError, ValueError):
        pass
    return start, layers


def crew_of(folder: Path | None) -> list[dict]:
    start, layers = _run_start(folder)
    tasks: dict[str, int] = {}
    for e in layers:
        if e.get("agent"):
            tasks[e["agent"]] = tasks.get(e["agent"], 0) + 1
    crew = [{"name": "Hermia", "role": "commander"}]
    for a in start.get("agents") or []:
        name = str(a.get("name") or "")
        if AGENT_NAME.match(name) and name != "Hermia":
            crew.append({"name": name, "role": "crew", "tasks": tasks.get(a.get("id"), 0)})
    return crew[:256]


def _slug(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:61] or "page"


def pages_of(r: dict) -> list[dict]:
    out, seen = [], set()
    for i, title in enumerate(r.get("pageTitles") or []):
        title = str(title).strip()[:80] or f"Page {i + 1}"
        slug = _slug(title)
        if slug in seen:
            slug = f"{slug[:56]}-{i + 1}"
        seen.add(slug)
        out.append({"slug": slug, "title": title})
    return out[:40]


MIME = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def poster_of(r: dict, folder: Path | None) -> str:
    """A data URL for the feed card: the first page shot from the video, else the build's first picture, else a drawn card in its colours."""
    candidates: list[Path] = []
    if folder:
        candidates += [folder / "video" / "p1.webp", folder / "video" / "p1.png"]
        img = folder / "img"
        if img.is_dir():
            pics = [p for p in img.iterdir() if p.suffix.lower() in MIME and not p.name.startswith("video-")]
            candidates += sorted(pics, key=lambda p: (not p.stem.isdigit(), int(p.stem) if p.stem.isdigit() else 0, p.name))
    for p in candidates:
        try:
            if p.is_file() and 0 < p.stat().st_size <= MAX_POSTER:
                return f"data:{MIME[p.suffix.lower()]};base64," + base64.b64encode(p.read_bytes()).decode()
        except OSError:
            continue
    colors = [c for c in ((r.get("theme") or {}).get("colors") or []) if isinstance(c, str)]
    return "data:image/png;base64," + base64.b64encode(_gradient_png(_hex(colors[0] if colors else "", (24, 12, 48)),
                                                                     _hex(colors[1] if len(colors) > 1 else "", (124, 58, 237)))).decode()


def _hex(value: str, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    m = re.fullmatch(r"#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})", value.strip())
    if not m:
        return fallback
    h = m.group(1)
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _gradient_png(top: tuple[int, int, int], bottom: tuple[int, int, int], w: int = 600, h: int = 750) -> bytes:
    rows = bytearray()
    for y in range(h):
        t = y / (h - 1)
        px = bytes(round(a + (b - a) * t) for a, b in zip(top, bottom))
        rows += b"\x00" + px * w
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")


def live_url(r: dict) -> str | None:
    sites = r.get("sites") or {}
    for host in ("github", "vercel", "cloudflare"):
        if str(sites.get(host, "")).startswith("https://"):
            return sites[host]
    return next((u for u in sites.values() if str(u).startswith("https://")), None)


def parse_post_args(args: list[str]) -> tuple[str, str, str, bool]:
    """[n|id] [--jam <id>] [--again] [--unlisted] [caption…] -> (ref, jam, caption, again)."""
    ref, jam, again, words = "", "", False, []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--jam" and i + 1 < len(args):
            jam, i = args[i + 1], i + 2
            continue
        if a == "--again":
            again, i = True, i + 1
            continue
        if a == "--unlisted":
            i += 1
            continue
        if not ref and not words and (a.isdigit() or a.startswith("20")):
            ref = a
        else:
            words.append(a)
        i += 1
    return ref, jam, " ".join(words).strip().strip('"“”'), again


PIECES = ("site", "app", "game", "film")
# never a project's or a post's name: these name a screen (engine/naming.mjs keeps the same list)
SCREEN_WORDS = {"sign", "sign in", "signin", "sign up", "signup", "log in", "login", "log out", "logout", "register", "home", "homepage",
                "dashboard", "welcome", "untitled", "index", "admin", "account", "profile", "settings", "overview", "landing page", "main page", "new project"}


def is_screen_name(name: str) -> bool:
    n = " ".join(re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).split())
    while re.match(r"^(your|my|our|the) ", n):
        n = n.split(" ", 1)[1]
    if not n or n.isdigit():
        return True
    for w in SCREEN_WORDS:
        if n == w:
            return True
        if n.startswith(w + " ") and n[len(w) + 1:].split(" ")[0] in ("to", "for", "page", "screen", "panel", "area", "view"):
            return True
    return False


def project_of(r: dict) -> tuple[str, str]:
    """(project id, project name) of a run, from the canvas's run list; a run alone is its own project."""
    p = r.get("project") if isinstance(r.get("project"), dict) else {}
    pid = str(p.get("id") or r["id"])[:120]
    name = str(p.get("name") or "").strip()
    if not name or is_screen_name(name):
        title = str(r.get("title") or "").strip()
        name = "" if is_screen_name(title) else re.split(r"\s[—–|:-]\s|:\s", title)[0].strip()
    return pid, (name or "Swarm build")[:80]


def piece_of(r: dict, url: str, poster: str) -> dict:
    kind = r.get("piece") if r.get("piece") in PIECES else (r.get("kind") if r.get("kind") in PIECES else "site")
    return {"kind": kind, "title": str(r.get("title") or "Untitled")[:80], "liveUrl": url, "poster": poster, "runId": str(r["id"])[:120]}


def build_payload(r: dict, *, jam: str = "", caption: str = "", parent: str | None = None, unlisted: bool = False,
                  into: str | None = None) -> dict:
    """The POST /api/feed/builds body. With the project fields (project, piece, and into for a later piece);
    ``plain_payload`` takes them off again for a Feed that does not know them."""
    folder = run_dir(r["id"])
    url = live_url(r)
    if not url:
        raise FeedError(f"“{r['title']}” has no public link yet. Publish it first (/swarm publish), then post it.")
    _, name = project_of(r)
    body = {
        "title": name,
        "kind": r.get("kind") if r.get("kind") in KINDS else "site",
        "prompt": (str(r.get("brief") or r.get("title") or "").strip() or "A Swarm Studio build")[:4000],
        "buildMs": max(0, int(r.get("ms") or 0)),
        "agents": max(1, min(256, int(r.get("agents") or 1))),
        "liveUrl": url,
        "poster": poster_of(r, folder),
        "runId": str(r["id"])[:120],
        "pages": pages_of(r),
        "crew": crew_of(folder),
    }
    if parent and BUILD_ID.match(parent):
        body["parentId"] = parent
    if jam:
        if not EVENT_ID.match(jam):
            raise FeedError(f"“{jam}” is not a jam id. The jam's page on the feed shows it (/jams).")
        body["jamId"] = jam
    if caption:
        body["caption"] = caption[:280]
    if unlisted:
        # off the feed and Browse; anyone with the link still sees it
        body["visibility"] = "unlisted"
    body["piece"] = piece_of(r, url, body["poster"])
    if into and BUILD_ID.match(into):
        body["into"] = into
    else:
        body["project"] = {"name": name}
    return body


PROJECT_FIELDS = ("project", "into", "piece")


def plain_payload(body: dict) -> dict:
    """Today's single post: the same body without the project fields (still titled by the project's name)."""
    return {k: v for k, v in body.items() if k not in PROJECT_FIELDS}


def _refused_fields(exc: FeedError) -> bool:
    """The Feed does not take the project fields yet: a 400, or a code or message about an unknown field."""
    text = f"{exc.code} {exc}".lower()
    return exc.status in (400, 422) or "unknown" in text or "unrecognized" in text or "field" in text


def post(r: dict, args: list[str], export) -> str:
    """Post a build. ``export(run_id) -> zip path or None`` makes the export zip through the canvas server."""
    out = post_result(r, args, export)
    return out["message"]


def post_result(r: dict, args: list[str], export) -> dict:
    """Like post, as {ok, url, message} for the canvas's Post to Feed button."""
    token = _token()
    _, jam, caption, again = parse_post_args(args)
    unlisted = "--unlisted" in args
    cfg = load()
    done = (cfg.get("posted") or {}).get(r["id"])
    if done and not again:
        return {"ok": True, "already": True, "url": f"{origin()}/b/{done}", "message": f"“{r['title']}” is already in the feed: {origin()}/b/{done}. /swarm post {r['id']} --again posts it once more."}
    pid, name = project_of(r)
    # the project's Feed build, if one of its pieces was posted before: this piece goes into it
    into = (cfg.get("projects") or {}).get(pid)
    if again and done == into:
        into = None  # --again on the head piece itself posts it once more, on its own
    body = build_payload(r, jam=jam, caption=caption, parent=(cfg.get("remixes") or {}).get(r["id"]), unlisted=unlisted, into=into)
    joined = False
    try:
        got = _call("/api/feed/builds", body, token=token, timeout=60)
        joined = bool(into) and got.get("id") == into
    except FeedError as exc:
        if into and exc.status == 404:
            # the project's build is gone from the Feed: this piece starts the project's post again
            _update(lambda c: (c.get("projects") or {}).pop(pid, None))
            into = None
            body = build_payload(r, jam=jam, caption=caption, parent=body.get("parentId"), unlisted=unlisted)
            try:
                got = _call("/api/feed/builds", body, token=token, timeout=60)
            except FeedError as again_exc:
                if not _refused_fields(again_exc):
                    raise
                got = _call("/api/feed/builds", plain_payload(body), token=token, timeout=60)
        elif _refused_fields(exc):
            # a Feed without projects yet: today's single post, so posting never breaks
            got = _call("/api/feed/builds", plain_payload(body), token=token, timeout=60)
        else:
            raise
    build_id = got["id"]

    def remember(c: dict) -> None:
        c.setdefault("posted", {})[r["id"]] = build_id
        # the project's first post is where its later pieces go
        if not joined:
            c.setdefault("projects", {}).setdefault(pid, build_id)
    _update(remember)
    note = ""
    try:
        zip_path = export(r["id"])
        if zip_path and Path(zip_path).is_file() and not got.get("uploadUrl"):
            note = "\nThe feed took no files for this piece; remixers start from the prompt."
        elif zip_path and Path(zip_path).is_file():
            size = Path(zip_path).stat().st_size
            if size > MAX_BUNDLE:
                note = f"\nThe files are {size // (1024 * 1024)} MB, over the feed's 50 MB, so remixers start from the prompt only."
            else:
                _put_bytes(got["uploadUrl"], Path(zip_path).read_bytes(), "application/zip")
                note = "\nIts files are attached, so a remix starts from them."
    except (FeedError, RuntimeError, OSError) as exc:
        note = f"\nThe files did not upload ({exc}); remixers start from the prompt only."
    jam_line = f" Entered in the jam {jam}." if jam else ""
    remix_line = f" Remix of {body['parentId']}." if body.get("parentId") else ""
    url = got.get("url") or origin() + "/b/" + build_id
    seen = " Unlisted: only people with the link see it." if unlisted else ""
    if joined:
        return {"ok": True, "url": url, "unlisted": unlisted, "project": name, "joined": True,
                "message": f"Added “{r['title']}” to “{name}” on the Swarm Feed: {url}{seen}{note}"}
    return {"ok": True, "url": url, "unlisted": unlisted, "project": name, "message": f"Posted “{r['title']}” to the Swarm Feed: {url}{remix_line}{jam_line}{seen}{note}"}


# ------------------------------------------------------------------- remix ---

def remix(args: list[str], start_run) -> str:
    """``start_run(brief) -> {run, url} | {error}`` starts a build on the canvas."""
    if not args:
        return "Say which build: /swarm remix <id> [what to change]. The id is on the build's card (b_…)."
    raw = args[0].rstrip("/").rsplit("/", 1)[-1]
    if not BUILD_ID.match(raw):
        return f"“{args[0]}” is not a feed build id (b_ and ten letters or digits, from the card or its link)."
    change = " ".join(args[1:]).strip().strip('"“”')
    token = load().get("token")
    got = _call(f"/api/feed/builds/{raw}/bundle", token=token)
    saved = ""
    if got.get("bundleUrl"):
        folder = launcher.data_dir() / "remix" / raw
        folder.mkdir(parents=True, exist_ok=True)
        try:
            req = urllib.request.Request(got["bundleUrl"], headers={"user-agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as res:
                data = res.read(MAX_BUNDLE + 1)
            if len(data) <= MAX_BUNDLE:
                (folder / "original.zip").write_bytes(data)
                saved = f"\nThe original's files: {folder / 'original.zip'}"
        except (OSError, urllib.error.URLError):
            saved = "\n(The original's files could not be downloaded; the remix starts from its prompt.)"
    brief = str(got.get("prompt") or got.get("title") or "")
    if change:
        brief = f"{brief}\n\nRemix: {change}"
    started = start_run(brief)
    if started.get("error") or not started.get("run"):
        return f"Could not start the remix: {started.get('error') or 'no run'}"
    run_id = started["run"]
    _update(lambda c: c.setdefault("remixes", {}).__setitem__(run_id, raw))
    return (f"Remixing “{got.get('title')}” by @{got.get('maker')}: the swarm is building it on the canvas ({started.get('url')})."
            f"\nWhen it is done: /swarm publish, then /swarm post. The feed links it to the original.{saved}")


# ------------------------------------------------------------------- login ---

def login() -> str:
    got = _call("/api/feed/login-link", {}, token=_token())
    url = got["url"]
    opened = _open(url)
    return ("Opened the feed in your browser: press Sign in there." if opened else f"Open this in your browser and press Sign in:\n  {url}") + \
        "\nThe link works once, for 10 minutes. What that browser liked and saved as a guest moves to your account."
