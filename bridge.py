"""The Hermes bridge: the canvas server's way back into this Hermes process (docs/specs/33-hermes-bridge.md).

The canvas server (Node) runs detached, so it has no plugin context of its own. This module runs a small
HTTP server on 127.0.0.1 inside the Hermes process. Through it, the canvas server asks Hermes for what only
Hermes may do:

- ``POST /image``: one picture through Hermes's own ``image_generate`` tool (``ctx.dispatch_tool``);
- ``POST /video``: one clip through Hermes's own ``video_generate`` tool;
- ``GET /media``: whether pictures and clips are available;
- ``POST /mcp``: one MCP tool call through ``ctx.call_mcp``;
- ``POST /v1/chat/completions`` and ``GET /v1/models``: model calls through ``ctx.llm`` (bridge_llm.py).

Hermes picks the provider, the model and the keys for each from its own config. None of them leaves
this process.

Every request needs this process's token (``authorization: Bearer …``). The token is made fresh for
each process, kept in memory, and handed to the canvas server only in the attach call. A request
from a web page (any ``Origin`` header), or one with a Host that is not loopback, is refused.
"""

from __future__ import annotations

import base64
import hmac
import json
import re
import mimetypes
import os
import secrets
import shutil
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import bridge_llm, launcher

CTX = None  # the plugin context, set by register()
ATTACH_EVERY = 5.0  # seconds; the canvas server drops a bridge silent for 45, and a restarted one is found this fast
SERVER_POLL = 5.0  # seconds between looks for a canvas server that is not up yet


def _py_stamp(root: Path) -> float:
    """When this package's Python files were last written (the newest at its root), in seconds."""
    try:
        return max((f.stat().st_mtime for f in root.glob("*.py")), default=0.0)
    except OSError:
        return 0.0


# The code this process loaded, sent with every attach. The server compares it with the files on disk: a
# Hermes that loaded an older copy (``hermes plugins install … --force`` or an update while it ran) is told
# apart from one that is current, and the person is asked to restart Hermes (engine/hermeshealth.mjs).
LOADED = _py_stamp(Path(__file__).resolve().parent)
IMAGE_ASPECTS = ("landscape", "square", "portrait")
VIDEO_ASPECTS = ("16:9", "9:16", "1:1", "4:3", "3:4", "21:9")
# a backend Hermes reports as not set up: that kind of media is off until the studio asks again
MISSING = ("no_provider_configured", "provider_not_registered")

_lock = threading.Lock()
_server: ThreadingHTTPServer | None = None
_token = ""
_missing = {"image": False, "video": False}


def url() -> str:
    return f"http://127.0.0.1:{_server.server_address[1]}" if _server else ""


def running() -> bool:
    return _server is not None


def start() -> bool:
    """Start the bridge once for this process (and its attach loop). False without a plugin context."""
    global _server, _token
    if CTX is None:
        return False
    with _lock:
        if _server is None:
            _token = secrets.token_urlsafe(32)
            _server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
            _server.daemon_threads = True
            threading.Thread(target=_server.serve_forever, name="swarm-studio-bridge", daemon=True).start()
            threading.Thread(target=_attach_loop, name="swarm-studio-bridge-attach", daemon=True).start()
    attach()
    return True


def attach() -> bool:
    """Tell the canvas server where this bridge is. False when no server answers."""
    if not _server:
        return False
    try:
        launcher._request("/api/hermes/attach", method="POST", body={"url": url(), "token": _token, "pid": os.getpid(), "code": LOADED}, timeout=2)
        return True
    except (OSError, urllib.error.URLError, ValueError):
        return False


def _attach_loop() -> None:
    while True:
        time.sleep(ATTACH_EVERY)
        attach()


def start_later(delay: float = 3.0, poll: float = SERVER_POLL) -> None:
    """From register(): start the bridge once a canvas server is up, however late it comes.

    A server this Hermes did not start (another process, a restart, the Studio opened later) is found too:
    the thread keeps looking every ``poll`` seconds until one answers. It is a daemon thread, so a
    short-lived command (``hermes model``, ``hermes config``) exits before it ever opens a port."""
    def later() -> None:
        time.sleep(delay)
        while not running() and CTX is not None:
            if launcher.state() and start():
                return
            time.sleep(poll)
    threading.Thread(target=later, name="swarm-studio-bridge-later", daemon=True).start()


def others() -> bool:
    """True when another live Hermes process (Desktop, the gateway, a chat) has its bridge attached too."""
    try:
        got = launcher._request("/api/hermes", timeout=2)
    except (OSError, urllib.error.URLError, ValueError):
        return False
    return any(pid != os.getpid() for pid in got.get("pids") or [])


# ---------- what the routes do

def _out_dir(kind: str) -> Path:
    path = launcher.data_dir() / kind
    path.mkdir(parents=True, exist_ok=True)
    return path


def _save(source: str, dest: Path) -> Path:
    """A provider's result (a URL, a data: URL or a file) as a file of our own."""
    if source.startswith("http://") or source.startswith("https://"):
        req = urllib.request.Request(source, headers={"user-agent": "swarm-studio"})
        with urllib.request.urlopen(req, timeout=300) as res, open(dest, "wb") as fh:
            shutil.copyfileobj(res, fh)
    elif source.startswith("data:"):
        dest.write_bytes(base64.b64decode(source.split(",", 1)[1]))
    else:
        shutil.copyfile(source, dest)
    return dest


def _ext(source: str, fallback: str) -> str:
    if source.startswith("data:"):
        return mimetypes.guess_extension(source[5:].split(";", 1)[0]) or fallback
    suffix = Path(source.split("?", 1)[0]).suffix.lower()
    return suffix if suffix and len(suffix) <= 5 else fallback


def _data_url(path: str) -> str:
    kind = mimetypes.guess_type(path)[0] or "image/png"
    return f"data:{kind};base64,{base64.b64encode(Path(path).read_bytes()).decode()}"


def _result(raw, kind: str) -> dict:
    try:
        res = json.loads(raw) if isinstance(raw, str) else dict(raw or {})
    except (TypeError, ValueError):
        return {"ok": False, "error": f"Hermes's {kind} tool gave no answer"}
    if not res.get("success"):
        if res.get("error_type") in MISSING:
            _missing[kind] = True
        return {"ok": False, "error": str(res.get("error") or f"{kind} generation failed")[:300]}
    _missing[kind] = False
    return {"ok": True, "res": res}


def shrink(path: str, width: int = 1024) -> str:
    """A web-sized WebP next to the original (a 2.7 MB PNG becomes ~100 KB). Falls back to the original."""
    try:
        from PIL import Image

        src = Path(path)
        out = src.with_name(src.stem + f"-{width}.webp")
        with Image.open(src) as im:
            im = im.convert("RGB")
            if im.width > width:
                im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            im.save(out, "WEBP", quality=80, method=4)
        return str(out)
    except Exception:
        return path


def crop(path: str, ratio: str) -> str:
    """Centre-crop to W:H (a 2:1 sky panorama, a 4:1 strip) next to the original. Falls back to the original."""
    try:
        from PIL import Image

        w, h = (float(x) for x in ratio.split(":"))
        src = Path(path)
        out = src.with_name(src.stem + f"-{ratio.replace(':', 'x')}.png")
        with Image.open(src) as im:
            want = w / h
            if im.width / im.height > want:
                cw = round(im.height * want)
                box = ((im.width - cw) // 2, 0, (im.width - cw) // 2 + cw, im.height)
            else:
                ch = round(im.width / want)
                box = (0, (im.height - ch) // 2, im.width, (im.height - ch) // 2 + ch)
            im.crop(box).save(out)
        return str(out)
    except Exception:
        return path


def image(body: dict) -> dict:
    """One picture through Hermes's image_generate. {prompt, aspect, refs[], edit, crop} -> {ok, path, model}."""
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "a prompt is needed"}
    aspect = body.get("aspect") if body.get("aspect") in IMAGE_ASPECTS else "landscape"
    args: dict = {"prompt": prompt, "aspect_ratio": aspect}
    refs = [r for r in (body.get("refs") or []) if isinstance(r, str) and r][:4]
    if refs and body.get("edit"):  # paint over the first (keeps a character's exact look); the rest stay references
        args["image_url"] = refs[0]
        if refs[1:]:
            args["reference_image_urls"] = refs[1:]
    elif refs:
        args["reference_image_urls"] = refs
    got = _result(CTX.dispatch_tool("image_generate", args), "image")
    if not got["ok"]:
        return got
    res = got["res"]
    source = str(res.get("host_image") or res.get("image") or "")
    if not source:
        return {"ok": False, "error": "Hermes's image tool returned no picture"}
    try:
        path = str(_save(source, _out_dir("images") / f"{uuid.uuid4().hex}{_ext(source, '.png')}"))
    except Exception as exc:
        return {"ok": False, "error": f"could not save the picture: {exc}"[:300]}
    ratio = str(body.get("crop") or "")
    if ratio:  # a panorama keeps its full width
        return {"ok": True, "path": crop(path, ratio), "model": res.get("model")}
    return {"ok": True, "path": shrink(path), "model": res.get("model")}


def video(body: dict) -> dict:
    """One clip from a still through Hermes's video_generate. {prompt, image, seconds, aspect} -> {ok, path, model}."""
    prompt = str(body.get("prompt") or "").strip()
    still = str(body.get("image") or "")
    if not prompt or not still or not os.path.isfile(still) or not (mimetypes.guess_type(still)[0] or "").startswith("image/"):
        return {"ok": False, "error": "a prompt and a still picture are needed"}
    try:
        seconds = max(1, min(20, int(body.get("seconds") or 4)))
    except (TypeError, ValueError):
        seconds = 4
    aspect = body.get("aspect") if body.get("aspect") in VIDEO_ASPECTS else "16:9"
    got = _result(CTX.dispatch_tool("video_generate", {"prompt": prompt, "image_url": _data_url(still), "duration": seconds, "aspect_ratio": aspect}), "video")
    if not got["ok"]:
        return got
    res = got["res"]
    source = str(res.get("video") or "")
    if not source:
        return {"ok": False, "error": "Hermes's video tool returned no clip"}
    try:
        path = _save(source, _out_dir("clips") / f"{uuid.uuid4().hex}{_ext(source, '.mp4')}")
    except Exception as exc:
        return {"ok": False, "error": f"could not save the clip: {exc}"[:300]}
    return {"ok": True, "path": str(path), "model": res.get("model")}


def media(_body: dict | None = None) -> dict:
    return {"image": {"available": not _missing["image"]}, "video": {"available": not _missing["video"]}}


PLUGIN = "swarm-studio"
NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


def allow_command(server: str, granted: list | None = None) -> str:
    """The one command the person runs to let Swarm Studio use an MCP server. The studio never runs it:
    which servers a plugin may call is the person's grant (Nous catalog review, point 5)."""
    names = sorted({*(granted or []), server})
    return f"hermes config set plugins.entries.{PLUGIN}.mcp_allowlist '{json.dumps(names)}'"


def mcp(body: dict) -> dict:
    """One MCP tool call through Hermes's own client (ctx.call_mcp): its allowlist, trust gates and
    sign-in tokens. A server not granted comes back with the command that grants it."""
    server, tool = str(body.get("server") or ""), str(body.get("tool") or "")
    if not NAME.match(server) or not NAME.match(tool):
        return {"ok": False, "error": "an MCP server and tool name are needed"}
    args = body.get("args") if isinstance(body.get("args"), dict) else {}
    try:
        timeout = float(body.get("timeout") or 120)
    except (TypeError, ValueError):
        timeout = 120.0
    try:
        got = CTX.call_mcp(server, tool, args, timeout=timeout)
    except PermissionError:
        granted = body.get("granted") if isinstance(body.get("granted"), list) else []
        return {"ok": False, "allowed": False, "error": f"Swarm Studio may not use {server} yet", "allow": allow_command(server, [str(g) for g in granted if NAME.match(str(g))])}
    except Exception as exc:  # a dead connector is an answer, not a crash
        return {"ok": False, "error": str(exc)[:300]}
    return got if isinstance(got, dict) else {"ok": True, "result": got}


def chat(body: dict, timeout_s: float | None = None) -> dict:
    return bridge_llm.complete(CTX, body, timeout_s)


ROUTES = {("POST", "/image"): image, ("POST", "/video"): video, ("GET", "/media"): media, ("POST", "/mcp"): mcp,
          ("POST", "/v1/chat/completions"): chat, ("GET", "/v1/models"): bridge_llm.models}
CHAT = ("POST", "/v1/chat/completions")
BIG = 48 << 20  # a reviewer's call carries page screenshots


# ---------- the HTTP side

def allowed(headers, token: str) -> bool:
    """Loopback only, no browser page, and this process's token."""
    if headers.get("Origin"):
        return False
    host = str(headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
    if host not in ("127.0.0.1", "localhost", "::1"):
        return False
    given = str(headers.get("Authorization") or "")
    return bool(token) and given.startswith("Bearer ") and hmac.compare_digest(given[7:].encode(), token.encode())


class _Handler(BaseHTTPRequestHandler):
    server_version = "swarm-studio-bridge"

    def log_message(self, *_args) -> None:  # Hermes's terminal stays quiet
        pass

    def _send(self, code: int, data: dict) -> None:
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _handle(self, method: str) -> None:
        if not allowed(self.headers, _token):
            return self._send(403, {"ok": False, "error": "forbidden"})
        route = ROUTES.get((method, self.path.split("?", 1)[0]))
        if not route:
            return self._send(404, {"ok": False, "error": "no such route"})
        key = (method, self.path.split("?", 1)[0])
        body: dict = {}
        if method == "POST":
            try:
                size = int(self.headers.get("content-length") or 0)
                body = json.loads(self.rfile.read(size) or b"{}") if 0 < size <= (BIG if key == CHAT else 4 << 20) else {}
            except (ValueError, OSError):
                return self._send(400, {"ok": False, "error": "bad request"})
        body = body if isinstance(body, dict) else {}
        if key == CHAT:
            return self._chat(body)
        try:
            self._send(200, route(body))
        except Exception as exc:  # a tool that raises comes back as an error, never a crash
            self._send(200, {"ok": False, "error": str(exc)[:300]})

    def _chat(self, body: dict) -> None:
        """OpenAI-shaped: an error is an HTTP error with {error: {message}}, as a provider answers."""
        try:
            timeout = max(5.0, min(1800.0, float(self.headers.get("x-swarm-timeout") or 0) / 1000)) if self.headers.get("x-swarm-timeout") else None
        except ValueError:
            timeout = None
        try:
            done = chat(body, timeout)
        except Exception as exc:  # the provider's own error, as Hermes reports it
            msg = str(exc)[:500]
            code = 429 if re.search(r"\b429\b|rate.?limit", msg, re.I) else 503 if re.search(r"\b50[23]\b|overloaded|capacity", msg, re.I) else 502
            return self._send(code, {"error": {"message": msg, "type": type(exc).__name__}})
        if not body.get("stream"):
            return self._send(200, done)
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.end_headers()
        try:
            for line in bridge_llm.sse(done):
                self.wfile.write(line)
            self.wfile.flush()
        except OSError:  # the caller gave up; the answer is dropped
            pass

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")
