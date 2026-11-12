"""Swarm Studio dashboard API, mounted at ``/api/plugins/swarm-studio``.

The Desktop pane calls ``/canvas`` to get the canvas URL; the route starts the
local canvas server first if it is not running. The dashboard loader imports
this file standalone, so the shared launcher is loaded by path.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

_spec = importlib.util.spec_from_file_location(
    "swarm_studio_launcher", Path(__file__).resolve().parent.parent / "launcher.py"
)
launcher = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(launcher)
_BRIDGE = Path(__file__).resolve().parent.parent / "bridge.py"


def _plugin_bridge():
    """This process's own bridge, when Hermes loaded the plugin here (the gateway that serves Desktop's
    pages does): the loaded bridge.py module that holds a plugin context. Found by its file, so nothing
    of Hermes's own is imported."""
    for mod in list(sys.modules.values()):
        try:
            if getattr(mod, "CTX", None) is not None and Path(mod.__file__).resolve() == _BRIDGE:
                return mod
        except (TypeError, AttributeError, OSError):
            continue
    return None


def _wake() -> None:
    """The Studio page opened: attach this Hermes now rather than at its next 5-second look."""
    b = _plugin_bridge()
    if b is not None:
        launcher.on_server = b.start


@router.get("/canvas")
def canvas() -> dict:
    _wake()
    return launcher.ensure_server()


@router.get("/state")
def state() -> dict:
    return launcher.state() or {"running": False}
