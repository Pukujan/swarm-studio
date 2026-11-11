"""Generate one image through a Hermes image-gen provider and print the result as JSON.

The canvas server (Node) runs this with Hermes's own Python, so images can come
from any provider Hermes has a login for, such as ``openai-codex`` (your Codex /
ChatGPT login, model gpt-image-2) without the server ever holding that token.

    python imagegen.py --list
    python imagegen.py --provider openai-codex --model gpt-image-2-low --aspect landscape "a prompt"

Prints {"ok": true, "path": ...} or {"ok": false, "error": ...}.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

HERMES = Path(os.environ.get("HERMES_AGENT_DIR") or Path.home() / ".hermes" / "hermes-agent")


class _Capture:
    """Stands in for the plugin context: keeps the providers a plugin registers."""

    def __init__(self) -> None:
        self.providers = []

    def register_image_gen_provider(self, provider) -> None:
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
    for init in sorted((HERMES / "plugins" / "image_gen").glob("*/__init__.py")):
        try:
            spec = importlib.util.spec_from_file_location(f"swarm_imagegen_{init.parent.name.replace('-', '_')}", init)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            ctx = _Capture()
            module.register(ctx)
        except Exception:  # a provider with missing dependencies just isn't offered
            continue
        for p in ctx.providers:
            found[getattr(p, "name", init.parent.name)] = p
    return found


def shrink(path: str, width: int = 1024) -> str:
    """A web-sized WebP next to the original (a 2.7 MB PNG becomes ~100 KB), so
    pages with several images stay light on weaker machines. Falls back to the original."""
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="?", default="")
    ap.add_argument("--provider", default="openai-codex")
    ap.add_argument("--model", default="")
    ap.add_argument("--aspect", default="landscape")
    ap.add_argument("--ref", action="append", default=[], help="a reference picture (path or data URL); repeatable")
    ap.add_argument("--edit", action="store_true", help="paint over the first --ref (keeps a character's exact look); the rest stay references")
    ap.add_argument("--crop", default="", help="centre-crop the result to W:H, e.g. 2:1 for a sky panorama")
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
            models = list(getattr(p, "models", {}) or {})
            out.append({"provider": name, "available": ok, "models": models, "default": getattr(p, "default_model_id", "")})
        print(json.dumps({"ok": True, "providers": out}))
        return 0
    p = found.get(args.provider)
    if not p:
        print(json.dumps({"ok": False, "error": f"no image provider {args.provider}"}))
        return 1
    if args.model:
        os.environ["OPENAI_IMAGE_MODEL"] = args.model
    try:
        # references only when given: not every provider takes them
        if args.edit and args.ref:
            res = p.generate(args.prompt, aspect_ratio=args.aspect, image_url=args.ref[0], reference_image_urls=args.ref[1:] or None)
        elif args.ref:
            res = p.generate(args.prompt, aspect_ratio=args.aspect, reference_image_urls=args.ref)
        else:
            res = p.generate(args.prompt, aspect_ratio=args.aspect)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:300]}))
        return 1
    if isinstance(res, str):
        res = json.loads(res)
    if not res.get("success"):
        print(json.dumps({"ok": False, "error": str(res.get("error") or "image generation failed")[:300]}))
        return 1
    path = res.get("image")
    if args.crop and path and os.path.isfile(path):  # a panorama keeps its full width
        print(json.dumps({"ok": True, "path": crop(path, args.crop), "model": res.get("model")}))
        return 0
    print(json.dumps({"ok": True, "path": shrink(path) if path and os.path.isfile(path) else path, "model": res.get("model")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
