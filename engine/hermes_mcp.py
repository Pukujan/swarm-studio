"""Call one tool on a Hermes MCP connector (Supabase, Vercel, ...) for the canvas server.

Runs under Hermes's own Python (SWARM_HERMES_PY). It goes through the same path as
``PluginContext.call_mcp``: the connector must be in ``plugins.entries.swarm-studio.mcp_allowlist``
(the grant the person gives when they press Connect), and the call uses Hermes's native MCP client,
which signs in with the token Hermes stored and refreshes it. The plugin never sees the token.

    hermes_mcp.py call <server> <tool> '<json args>'   -> {"ok": ..., "result"|"error": ...}
    hermes_mcp.py status <server>                      -> {"installed", "allowed", "signed_in"}
"""

import json
import sys

PLUGIN = "swarm-studio"


def allowlist():
    from hermes_cli.config import load_config
    from hermes_cli.plugins_state import _plugin_settings_entry
    entry = _plugin_settings_entry(load_config() or {}, PLUGIN) or {}
    allowed = entry.get("mcp_allowlist")
    return [str(s) for s in allowed] if isinstance(allowed, list) else []


def status(server):
    from hermes_cli.config import load_config
    from tools.mcp_oauth import HermesTokenStorage
    cfg = (load_config() or {}).get("mcp_servers") or {}
    tokens = HermesTokenStorage(server)._tokens_path()
    granted = allowlist()
    return {"installed": server in cfg, "allowed": server in granted, "allowlist": granted, "signed_in": tokens.exists()}


def call(server, tool, args, timeout=120.0):
    if server not in allowlist():
        return {"ok": False, "error": f"Swarm Studio is not allowed to use {server}: press Connect first"}
    from hermes_cli.plugins import PluginContext
    from tools.mcp_oauth import suppress_interactive_oauth
    from tools.mcp_tool_handlers import _make_tool_handler
    from tools.mcp_tool_discovery import discover_mcp_tools
    # a background call never pops a sign-in window: Connect does that
    with suppress_interactive_oauth():
        discover_mcp_tools([server])  # connect just this one, as the agent does at start
        raw = _make_tool_handler(server, tool, timeout)(dict(args or {}))
    return PluginContext._mcp_envelope(raw)


def main():
    cmd, server = sys.argv[1], sys.argv[2]
    try:
        out = status(server) if cmd == "status" else call(server, sys.argv[3], json.loads(sys.argv[4] if len(sys.argv) > 4 else "{}"))
    except Exception as exc:  # noqa: BLE001 - reported to the canvas, never a traceback with secrets
        out = {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:400]}
    sys.stdout.write(json.dumps(out, default=str))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
