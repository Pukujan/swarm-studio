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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="?", default="")
    ap.add_argument("--provider", default="openai-codex")
    ap.add_argument("--model", default="")
    ap.add_argument("--aspect", default="landscape")
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
        res = p.generate(args.prompt, aspect_ratio=args.aspect)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:300]}))
        return 1
    if isinstance(res, str):
        res = json.loads(res)
    if not res.get("success"):
        print(json.dumps({"ok": False, "error": str(res.get("error") or "image generation failed")[:300]}))
        return 1
    print(json.dumps({"ok": True, "path": res.get("image"), "model": res.get("model")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
