"""Swarm Studio: a swarm of agents designs and builds a multi-page website live on a canvas.

Agent half. Registers:

- ``swarm_design``: start a swarm build from a brief and (by default) wait for it
- ``swarm_canvas``: start the canvas server if needed and return its URL
- ``swarm_studio``: everything after a build (files, open, play, review, models,
  images, lite mode), the same commands as ``/swarm <subcommand>`` (see commands.py)
- ``/swarm <brief>`` / ``/swarm <subcommand>``: from any chat without going through the model;
  ``connect``, ``post``, ``remix`` and ``login`` reach the Swarm Feed (``feed.py``)
- ``hermes swarm``: the same from the command line
- the ``swarm-studio:swarm-design`` skill: when and how to use the swarm
- two model slots in Hermes's model picker: ``swarm_studio_planner`` (follows the
  main model) and ``swarm_studio_builder`` (follows the compression model, which is
  usually a fast, cheap one: the builders make most of the calls)

The build itself runs in a local Node server (``server/server.mjs``) that this
package starts on 127.0.0.1; the Desktop pane (``desktop/plugin.js``) shows it.
"""

from __future__ import annotations

import argparse
import json
import webbrowser
from pathlib import Path

from . import commands, launcher

TOOLSET = "swarm-studio"


def swarm_design(args: dict | None = None, **_: object) -> str:
    """Start a swarm build. Returns the canvas URL and, when waiting, the run summary."""
    args = args or {}
    brief = str(args.get("brief") or "").strip()
    agents, wait = args.get("agents"), args.get("wait", True)
    if not brief:
        return json.dumps({"error": "brief is required: describe the product the site is for"})
    started = launcher.start_run(brief, agents)
    if started.get("talk"):
        # the person said not to build yet: talk with them here, and call again with the agreed brief
        return json.dumps({"started": False, "error": "Not started: the brief says to talk before building. Discuss it with the person first, then call swarm_design again with the brief you agreed once they say build."})
    if started.get("error") or not wait:
        return json.dumps(started, indent=2)
    summary = launcher.wait_run(started["run"])
    runs = launcher.data_dir() / "runs" / started["run"]
    return json.dumps({**summary, "url": started["url"], "plan": str(runs / "plan.json")}, indent=2)


def swarm_canvas(args: dict | None = None, **_: object) -> str:
    """Start the canvas server if needed and return its URL."""
    return json.dumps(launcher.ensure_server(), indent=2)


def _slash_swarm(raw_args: str = "", **_: object) -> str:
    """``/swarm <brief>``: start a build without waiting; the canvas shows it live."""
    brief = (raw_args or "").strip()
    if commands.is_command(brief):
        return commands.run(brief)
    result = launcher.start_run(brief) if brief else launcher.ensure_server()
    if result.get("error"):
        return f"Swarm Studio: {result['error']}"
    if not brief:
        return f"Swarm Studio canvas is up: {result['url']}\n\n{commands.HELP}"
    return f"🐝 Swarm started. Watch it in the swarm pane, or open {result['url']}"


def _setup_cli(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("brief", nargs="*", help="what the site is for; omit to just open the canvas")
    parser.add_argument("--agents", type=int, default=None, help="swarm size, 2-24 (default 8)")
    parser.add_argument("--no-open", action="store_true", help="don't open the canvas in a browser")
    parser.add_argument("--wait", action="store_true", help="wait for the build and print its summary")
    parser.add_argument("--models", action="store_true", help="show which models the swarm will use, then exit")
    parser.add_argument("--build", action="store_true", help="build even when the brief says to talk first")


def _run_cli(args: argparse.Namespace) -> int:
    if args.models:
        for role, m in launcher.describe_models().items():
            name = {"planner": "planner ", "worker": "builders", "reviewer": "reviewer"}[role]
            print(f"{name}  {m['model']}  at {m['base_url']}  ({m['source']})" if "error" not in m else f"{name}  unavailable: {m['error']}")
        print("Change them with `hermes model` (Swarm Studio planner / builders) or SWARM_STUDIO_* variables.")
        return 0
    brief = " ".join(args.brief).strip()
    if commands.is_command(brief):
        print(commands.run(brief))
        return 0
    result = launcher.start_run(brief, args.agents, force=args.build) if brief else launcher.ensure_server()
    if result.get("error"):
        print(f"swarm: {result['error']}")
        return 1
    print(f"Swarm Studio canvas: {result['url']}")
    if not args.no_open:
        webbrowser.open(result["url"])
    if brief and args.wait:
        print(json.dumps(launcher.wait_run(result["run"]), indent=2))
    return 0


def register(ctx) -> None:
    ctx.register_auxiliary_task(
        "swarm_studio_planner",
        display_name="Swarm Studio planner",
        description="site plan and page layouts (a few calls per build)",
    )
    ctx.register_auxiliary_task(
        "swarm_studio_builder",
        display_name="Swarm Studio builders",
        description="the parallel agents that write each section (most calls; pick a fast model)",
        inherit_from="compression",
    )
    ctx.register_auxiliary_task(
        "swarm_studio_reviewer",
        display_name="Swarm Studio reviewer",
        description="looks at screenshots of the finished pages and sends fixes (needs a vision model)",
        inherit_from="vision",
    )
    ctx.register_tool(
        name="swarm_design",
        toolset=TOOLSET,
        schema={"name": "swarm_design", "description": "Design and build a multi-page website with a swarm of agents, live on the Swarm Studio canvas. Takes about 30-60s.", "parameters": {
            "type": "object",
            "properties": {
                "brief": {"type": "string", "description": "What the product is and who it is for. The swarm plans and builds a 4-page site from it."},
                "agents": {"type": "integer", "minimum": 2, "maximum": 24, "description": "Swarm size (default 8)."},
                "wait": {"type": "boolean", "description": "Wait for the build to finish and return its summary (default true)."},
            },
            "required": ["brief"],
            "additionalProperties": False,
        }},
        handler=swarm_design,
        description="Design a multi-page site with a swarm of agents, live on a canvas.",
        emoji="🐝",
    )
    ctx.register_tool(
        name="swarm_canvas",
        toolset=TOOLSET,
        schema={"name": "swarm_canvas", "description": "Start the Swarm Studio canvas server if needed and return its URL.",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": False}},
        handler=swarm_canvas,
        description="Open the Swarm Studio canvas.",
        emoji="🧭",
    )
    ctx.register_tool(
        name="swarm_studio",
        toolset=TOOLSET,
        schema=commands.TOOL_SCHEMA,
        handler=commands.tool,
        description="Review, open, play and configure Swarm Studio builds.",
        emoji="🎛️",
    )
    ctx.register_command(
        "swarm",
        handler=_slash_swarm,
        description="Start a Swarm Studio build from a brief",
        args_hint="<brief> | help | files | open | play | review | fix | export | publish | hosts | video | motion | models | images | lite | connect | post | remix | login",
    )
    skills = Path(__file__).resolve().parent / "skills"
    for child in sorted(skills.iterdir()) if skills.is_dir() else []:
        if (child / "SKILL.md").is_file():
            ctx.register_skill(child.name, child / "SKILL.md")
    ctx.register_cli_command(
        name="swarm",
        help="Design a site with a swarm of agents on a live canvas",
        setup_fn=_setup_cli,
        handler_fn=_run_cli,
        description="Start a Swarm Studio build from a brief and open the live canvas.",
    )
