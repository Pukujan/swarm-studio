# 33. The Hermes bridge

From the Nous plugin-catalog review of Swarm Studio (points 1, 2 and 5):

- Point 1: pictures and clips go through Hermes's own `image_generate` and `video_generate` tools, not
  through Hermes's image plugins loaded in a second Python with Hermes's `.env`.
- Point 2: the provider key stays inside Hermes. Model calls go through `ctx.llm`. Only the plugin's
  own `SWARM_STUDIO_API_KEY` may reach Node.
- Point 5: MCP calls go through `ctx.call_mcp`, with no private Hermes imports.

All three need the same thing: the Node server must be able to ask the Hermes process for a model
call, a picture, a clip or an MCP tool. The server runs detached, so it cannot hold a plugin
context of its own. The **bridge** is a small HTTP server inside the Hermes process that does those
calls for it.

## Shape

```
Hermes process (Desktop, gateway, CLI chat, `hermes swarm`)
  plugin register(ctx) ──► bridge.py: ThreadingHTTPServer on 127.0.0.1:<random>
                               │ POST /v1/chat/completions  ─► ctx.llm.complete(task=…)
                               │ GET  /v1/models
                               │ POST /image                ─► ctx.dispatch_tool("image_generate")
                               │ POST /video                ─► ctx.dispatch_tool("video_generate")
                               │ POST /mcp                  ─► ctx.call_mcp(server, tool, args)
                               ▲
Node server (detached)         │ Bearer <bridge token>
  engine/bridge.mjs ───────────┘   attaches with POST /api/hermes/attach {url, token, pid}
```

- **Where it lives.** `bridge.py` is in the plugin's Python half. It runs as one daemon thread per
  Hermes process, on `127.0.0.1` with a port the OS picks. It starts only when needed:
  - `ensure_server()` and `start_run()` start it before they talk to the server;
  - `register()` starts it from a background thread about 3 seconds after loading, and only when a
    studio server already answers. A short-lived command (`hermes model`, `hermes config`) has
    exited by then, so it never opens a port.
- **The token.** Each process makes a fresh `secrets.token_urlsafe(32)`. It is held in memory and
  handed to Node in the attach call. It is never written to disk. Every request must carry
  `authorization: Bearer <token>`, which is checked with `hmac.compare_digest`. A request with an
  `Origin` header, or with a `Host` that is not `127.0.0.1` or `localhost`, is refused. That stops
  a web page in the person's browser (DNS rebinding included) from using the bridge.
- **Attaching.** The bridge calls the server's `POST /api/hermes/attach {url, token, pid}` with the
  server's own `x-swarm-token`. It does that when it starts and again every 15 seconds.
  - Node keeps up to 4 bridges, newest first.
  - Node drops a bridge that has been silent for 45 seconds or that refuses a connection.
  - A call goes to the newest live bridge. If that bridge refuses the connection, the call moves
    on to the next one.
  - `GET /api/hermes` reports whether a bridge is attached, without its token or port. The canvas
    and `/api/state` use it.

## Routes

| Route | In | Out | Hermes call |
|---|---|---|---|
| `POST /image` | `{prompt, aspect, refs[], edit, crop}` | `{ok, path, model}` or `{ok:false, error}` | `dispatch_tool("image_generate", {prompt, aspect_ratio, image_url?, reference_image_urls?})` |
| `POST /video` | `{prompt, image, seconds, aspect, out}` | `{ok, path, model}` or `{ok:false, error}` | `dispatch_tool("video_generate", {prompt, image_url, duration, aspect_ratio})` |
| `GET /media` | — | `{image:{available}, video:{available}}` | none |
| `POST /v1/chat/completions` | OpenAI-shaped | OpenAI-shaped, or SSE | `ctx.llm.complete(messages, task=<role's slot>, …)` |
| `GET /v1/models` | — | the three roles | none |
| `POST /mcp` | `{server, tool, args, timeout}` | `{ok, result}` or `{ok:false, error}` | `ctx.call_mcp(server, tool, args, timeout=…)` |

**Pictures and clips.** Hermes picks the provider and the model from its own config:
`image_gen.provider` and `video_gen.provider`, set with `hermes tools`. The studio offers one image
source, "Hermes", plus its own `ckff` key when that is set.
- A picture that comes back as a URL is downloaded into `$HERMES_HOME/swarm-studio/images/`.
- The bridge then makes the same web-sized WebP copy or centre crop that `imagegen.py` used to make.
- A clip is written to the `out` path the server gives. That path must be under the studio's data
  folder.
- The pasted FAL key in the Film panel is gone. Hermes reads its own `FAL_KEY`. The panel now says
  "Set FAL_KEY in Hermes" instead.

**Model calls (point 2).** `model` names the role: `planner`, `worker` or `reviewer`. It maps to the
plugin's auxiliary task: `swarm_studio_planner`, `swarm_studio_builder` or `swarm_studio_reviewer`.
- A model the person picked in the studio is passed as `model=` only when the operator has granted
  `allow_model_override`. Without that grant, the slot's own model answers. `/api/state` says so.
- **Streaming.** `ctx.llm` does not stream. With `stream: true`, the bridge waits for the full
  answer and then sends it as a single SSE delta, a usage chunk and `[DONE]`. The server's
  `streamChat` reads that unchanged.
  - Builders write one section per call, and the canvas shows sections as they finish, so builds
    keep their pace.
  - The talk pane shows the answer when it is complete instead of word by word.
- **Tools.** `ctx.llm` has no tool calls, but the app engine (dyad, local-agent mode) needs them.
  The bridge works around this in the prompt:
  - the request's `tools` are listed in the system prompt, and the model answers with
    `<tool_call>{"name":…,"arguments":{…}}</tool_call>` blocks;
  - the bridge parses those blocks back into OpenAI `tool_calls`;
  - earlier assistant tool calls in the history go back to the model as the same text, and tool
    results go back as user messages that say which call they answer.
  The app engine's gateway is the bridge, and the bridge token is its API key.
- **Timeouts.** Node sends its own timeout in `x-swarm-timeout` (ms). The bridge passes it to
  `ctx.llm` as `timeout`. Node's fetch waits that long plus 15 seconds. An abort in Node cannot
  cancel the Python call already in flight: the bridge finishes it and drops the result.

**MCP (point 5).** `call_mcp` raises `PermissionError` unless the server is in
`plugins.entries.swarm-studio.mcp_allowlist`. The studio never writes that list itself.
- The bridge answers `{ok:false, allowed:false, error, allow:"hermes config set plugins.entries.swarm-studio.mcp_allowlist '[…]'"}`.
  Node rebuilds the command from the current list, so running it keeps every server already granted.
- The canvas shows that command, with Copy and Check again; it never runs it.
- What is installed, granted and signed in comes from the public CLI: `hermes config get mcp_servers --json`
  (its keys; values stay masked), `hermes config get plugins.entries.swarm-studio.mcp_allowlist --json`, and
  whether `HERMES_HOME/mcp-tokens/<server>.json` exists. Cached for 5 seconds.
- Connect runs `hermes mcp install <name>` only after the person confirms it on the canvas
  (`POST /api/connectors/connect {name, confirm:true}`); without `confirm` the server answers with the question.
  `/swarm connect` is the Swarm Feed sign-in, not an MCP connector, so it has nothing to ask.
- `engine/hermes_mcp.py`, which used Hermes internals, is gone.

## When Hermes is not there

The server is detached, so it keeps running after the Hermes process that started it exits. When no
bridge is attached:

- **Model calls.**
  - If the person set `SWARM_STUDIO_API_KEY` (the one key the plugin may hand to Node), calls go
    straight to `SWARM_STUDIO_BASE_URL` with it.
  - Otherwise the build pauses at its next call with "Open Hermes, or run `hermes swarm`, to
    continue". When a bridge attaches again, Resume (#284) picks the build up where it stopped.
- **Pictures, clips and MCP** fail softly, as a signed-out provider did before. Pictures fall back
  to `ckff` if it is set, then to stock photos or drawn art.

## `hermes swarm` from the command line

The CLI command runs inside a Hermes process: `register()` has run, so `commands.CTX` holds a
working `ctx`, and `ctx.llm` and `ctx.dispatch_tool` work there.
- `hermes swarm <brief>` starts the bridge, attaches it, starts the run, and stays in the
  foreground until the build is done. It prints the canvas link and one line per step, and
  Ctrl-C leaves the build paused.
- If another bridge (Desktop or the gateway) is attached and live, the command returns at once,
  as it does today, and that bridge serves the build.
- `hermes swarm` with no brief only opens the canvas.

## Speed

A bridge call adds one loopback HTTP hop. That is under a millisecond, next to model calls of
seconds. Builders still run in parallel: the bridge is a threading server, and `ctx.llm.complete`
is called from each request's own thread.

## Done when

- `imagegen.py` and `videogen.py` no longer load `.env` or run Hermes's plugins.
- No module imports `hermes_cli.*`, `tools.*` or `agent.auxiliary_client`. The only exception is
  `agent.secret_scope.get_secret`, the public secret API. Tests check this.
- No provider key reaches Node, with one exception: `SWARM_STUDIO_API_KEY`, when the person set it.
  Tests check both the launcher's environment and the `/api/run` body.
- A real picture, a website build and an app build all succeed through the bridge, and the website
  build takes no more than 10% longer than before.
