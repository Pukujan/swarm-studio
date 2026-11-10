"""Animate one still through a Hermes video-gen provider and save the clip, as JSON.

The canvas server (Node) runs this with Hermes's own Python, so clips can come from
any video provider Hermes already has a login or key for (FAL with Veo 3.1, xAI,
OpenRouter, DeepInfra), without the server ever holding that token.

    python videogen.py --list
    python videogen.py --provider fal --image still.webp --seconds 4 --out clip.mp4 "the motion"

Prints {"ok": true, "path": ...} or {"ok": false, "error": ...}.
"""

from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import mimetypes
import os
import shutil
import sys
import urllib.request
from pathlib import Path

HERMES = Path(os.environ.get("HERMES_AGENT_DIR") or Path.home() / ".hermes" / "hermes-agent")
# the families that animate a still well, best first, per provider
PREFER = {"fal": ["veo3.1", "kling", "seedance"], "xai": [], "openrouter": ["veo"], "deepinfra": []}


class _Capture:
    """Stands in for the plugin context: keeps the providers a plugin registers."""

    def __init__(self) -> None:
        self.providers = []

    def register_video_gen_provider(self, provider) -> None:
        self.providers.append(provider)

    def __getattr__(self, _name):  # any other registration a plugin makes is ignored
        return lambda *a, **k: None


def providers() -> dict:
    sys.path.insert(0, str(HERMES))
    # the keys Hermes keeps for its providers (FAL_KEY, XAI_API_KEY…), through Hermes's own
    # loader, into this short-lived process only; the canvas server never holds them
    try:
        from hermes_cli.env_loader import load_hermes_dotenv
        load_hermes_dotenv()
    except Exception:
        pass
    found = {}
    for init in sorted((HERMES / "plugins" / "video_gen").glob("*/__init__.py")):
        try:
            spec = importlib.util.spec_from_file_location(f"swarm_videogen_{init.parent.name.replace('-', '_')}", init)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            ctx = _Capture()
            module.register(ctx)
        except Exception:  # a provider with missing dependencies just isn't offered
            continue
        for p in ctx.providers:
            found[getattr(p, "name", init.parent.name)] = p
    return found


def _models(p) -> list[str]:
    try:
        got = p.list_models() if hasattr(p, "list_models") else getattr(p, "models", {})
    except Exception:
        got = getattr(p, "models", {})
    if isinstance(got, dict):
        return [str(k) for k in got]
    return [str(m.get("id") if isinstance(m, dict) else m) for m in got or []]


def _pick(name: str, p, want: str) -> str | None:
    if want:
        return want
    models = _models(p)
    for fam in PREFER.get(name, []):
        hit = next((m for m in models if fam in m.lower()), None)
        if hit:
            return hit
    return None  # the provider's own default


def _data_url(path: str) -> str:
    kind = mimetypes.guess_type(path)[0] or "image/png"
    return f"data:{kind};base64,{base64.b64encode(Path(path).read_bytes()).decode()}"


def _save(video: str, out: str) -> None:
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    if video.startswith("http"):
        req = urllib.request.Request(video, headers={"user-agent": "swarm-studio"})
        with urllib.request.urlopen(req, timeout=300) as res, open(out, "wb") as fh:
            shutil.copyfileobj(res, fh)
    elif video.startswith("data:"):
        Path(out).write_bytes(base64.b64decode(video.split(",", 1)[1]))
    else:
        shutil.copyfile(video, out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="?", default="")
    ap.add_argument("--provider", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--image", default="")
    ap.add_argument("--seconds", type=int, default=4)
    ap.add_argument("--aspect", default="16:9")
    ap.add_argument("--out", default="")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    found = providers()
    if args.list:
        out = []
        for name, p in found.items():
            try:
                ok = bool(p.is_available())
            except Exception:
                ok = False
            out.append({"provider": name, "available": ok, "label": getattr(p, "display_name", "") or name, "model": _pick(name, p, "") or ""})
        print(json.dumps({"ok": True, "providers": out}))
        return 0
    p = found.get(args.provider)
    if not p:
        print(json.dumps({"ok": False, "error": f"no video provider {args.provider}"}))
        return 1
    if not args.image or not os.path.isfile(args.image) or not args.out:
        print(json.dumps({"ok": False, "error": "a still and an output path are needed"}))
        return 1
    try:
        res = p.generate(args.prompt, model=_pick(args.provider, p, args.model), image_url=_data_url(args.image),
                         duration=args.seconds, aspect_ratio=args.aspect)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:300]}))
        return 1
    if isinstance(res, str):
        res = json.loads(res)
    if not res.get("success") or not res.get("video"):
        print(json.dumps({"ok": False, "error": str(res.get("error") or "video generation failed")[:300]}))
        return 1
    try:
        _save(str(res["video"]), args.out)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"could not save the clip: {exc}"[:300]}))
        return 1
    print(json.dumps({"ok": True, "path": args.out, "model": res.get("model")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
