"""Swarm Studio dashboard API, mounted at ``/api/plugins/swarm-studio``.

The Desktop pane calls ``/canvas`` to get the canvas URL; the route starts the
local canvas server first if it is not running. The dashboard loader imports
this file standalone, so the shared launcher is loaded by path.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

_spec = importlib.util.spec_from_file_location(
    "swarm_studio_launcher", Path(__file__).resolve().parent.parent / "launcher.py"
)
launcher = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(launcher)


@router.get("/canvas")
def canvas() -> dict:
    return launcher.ensure_server()


@router.get("/state")
def state() -> dict:
    return launcher.state() or {"running": False}
