# Hermes and connections

Glue: launcher.py, bridge.py, bridge_llm.py, engine/bridge.mjs, engine/hermesllm.mjs, engine/llm.mjs, engine/hermeshealth.mjs, engine/hermes_connect.mjs, engine/connect.mjs, engine/proc.mjs, engine/ckff.mjs, engine/paint-ckff.mjs, engine/auto.mjs, engine/appkit.mjs, engine/media.mjs, server/server.mjs, web/show.js
Status: built in

Hermes is the host: Swarm Studio is a Hermes plugin (`requires_hermes: ">=0.23"`, plugin.yaml:6) under FSL-1.1-ALv2 (plugin.yaml:58). Hermes's own licence: Unchecked (not in this repo; settle from Hermes's repo). Every other service here is an outside service reached through Hermes or a declared key.

## What it already does

- Model calls with Hermes's provider, model and key via `ctx.llm`; pictures and clips via its `image_generate` / `video_generate` tools; MCP via `ctx.call_mcp` (docs/specs/33-hermes-bridge.md:5-9, 54-61).
- Secrets through `agent.secret_scope.get_secret` (launcher.py:80-85).
- OAuth MCP connectors with `hermes mcp install` / `hermes mcp login`; Hermes keeps and refreshes the token (engine/hermes_connect.mjs:3-5).
- Messaging gateways (Discord, Slack, Telegram) with `hermes send` (server/server.mjs:1334-1343).
- Three auxiliary model slots in Hermes's model picker: `swarm_studio_planner`, `swarm_studio_builder`, `swarm_studio_reviewer` (launcher.py:10-12, 49).

## How Swarm drives it

- launcher.py starts a detached Node server with a minimal env plus the declared keys read through Hermes's secret scope (launcher.py:200-233).
- That minimal env keeps `PATH`, `HOME`, `TMPDIR`, `LANG`, `HERMES_HOME`, `SWARM_GODOT` and `SWARM_IMAGE_SERVICE` (the image service's off switch, engine/images.mjs), plus the Windows system folders (launcher.py:199-202).
- bridge.py runs a loopback server inside each Hermes process and attaches with `POST /api/hermes/attach {url, token, pid, code}`; Node keeps 4 bridges, drops one silent 45 s (engine/bridge.mjs:1-20). Attach interval: 5 s (engine/bridge.mjs:3, docs/specs/33-hermes-bridge.md:148-149); spec 33 also says 15 s (docs/specs/33-hermes-bridge.md:44).
- `call(path, body)` for `/image`, `/video`, `/mcp`; `send` streams model calls (engine/bridge.mjs:25-62).
- `/llm/v1` on the studio's port, with a per-process key, forwards to the bridge; `model` is the role (`planner`, `worker`, `reviewer`), optionally `role:pick` (engine/hermesllm.mjs:3-9, 22-24, 94). The app engine (Dyad) uses the same endpoint (engine/hermesllm.mjs:3-5).
- `streamChat` is the client for any OpenAI-shaped endpoint; through Hermes it drops provider hints and sends `x-swarm-timeout` (engine/llm.mjs:12, 58, 71).
- `hermesHealth` tells `closed` from `updated` by `$HERMES_HOME/gateway.pid` and the plugin's `.py` mtimes (engine/hermeshealth.mjs:18-22, 26-47).
- Every child process gets `childEnv` only (engine/proc.mjs:1-23). The long-running ones (an app's dev or built server, a film render) start through `start()`, execa with `extendEnv: false`, `cleanup` and `forceKillAfterDelay`, and stop through `stopTree()`, tree-kill, so their children go too (engine/proc.mjs, engine/vendor/procs/; decision 0017, issue #450).
- The server exits after 20 minutes with nothing to do: no pane (an `/events` stream), no request other than the bridge's re-attach and status looks, no build, Auto run, film, publish or app build (Settings › Background; server/server.mjs `serverBusy`, engine/lifecycle.mjs `idleWatch`). It closes its port first, so the next `ensure_server()` (the pane's `/canvas`, any `/swarm` command, `start_run`) starts a new one at once, and the bridge's attach loop attaches to it (launcher.py `_ensure_server`, bridge.py `_attach_loop`). A command refused in that moment starts it and asks once more (commands.py `_api`).

### Models / gateway

- Default: all roles through Hermes; no provider key reaches Node (server/server.mjs:93-98).
- Fallback: `SWARM_STUDIO_API_KEY` with `SWARM_STUDIO_BASE_URL`, default InferHub `https://api.inferhub.dev/v1`, model `cb/deepseek-v4.1-flash` (plugin.yaml:12-14, server/server.mjs:100-101).
- InferHub route failover (cb/, ali/, alitp/, ocg/) only for an inferhub base URL (engine/llm.mjs:33-51).
- `ctx.llm` does not stream (one SSE delta) and has no tool calls; bridge fakes tools with `<tool_call>` blocks in the prompt (docs/specs/33-hermes-bridge.md:84-104).
- Multiplexed gateway (`gateway.multiplex_profiles`, Hermes Desktop's default): a `ctx.llm` call from the bridge's own threads has no profile secret scope, and Hermes refuses to read the model key (Hermes bug NousResearch/hermes-agent#132887; its fix #132898 is open). Until it ships, the bridge binds the profile Hermes loaded the plugin for around each request, only when multiplexing is on and nothing is bound (bridge.py:71-109, 411, 422; __init__.py:142). It imports Hermes's `agent.secret_scope`: remove it once #132898 is in the pinned Hermes.
- Model override only when the operator grants `plugins.entries.swarm-studio.llm.allow_model_override` (docs/specs/33-hermes-bridge.md:80-83).

### Supabase

- Keys: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (plugin.yaml:41-45, launcher.py:43).
- Or Hermes's Supabase MCP connector, the only one in `CONNECTORS` (engine/hermes_connect.mjs:20). `connect` installs only after the person confirms; the allowlist is a command shown, never written (engine/hermes_connect.mjs:86-99, 34-38).
- `supabaseProject` reuses or makes a project called `swarm-studio`, only if Supabase says it costs $0; region `us-east-1` unless `SWARM_SUPABASE_REGION` (engine/hermes_connect.mjs:146-163). It returns `SUPABASE_ANON_KEY` (publishable only) (engine/hermes_connect.mjs:143-145, 176-181).
- Connector route enables RLS with a policy open to `anon` for all rows; the key stays in the app's server env (engine/auto.mjs:73-75).
- Auto's data step: keys, else connector, else skipped with the SQL to run (engine/auto.mjs:257-269). `appEnv` hands Supabase vars to the generated app (engine/proc.mjs:32-33).
- App kit options: Supabase Auth and Supabase Storage (engine/appkit.mjs:36, 47).

### Stripe (test keys only)

- `STRIPE_SECRET_KEY`, test key only, live refused (plugin.yaml:46-48).
- Gate: `/^(sk|rk)_test_/` in `stripeEnv` and `appEnv` (engine/auto.mjs:77-80, engine/proc.mjs:34). Build prompts say `sk_test_` only (engine/auto.mjs:86, engine/appkit.mjs:39).
- With no test key: demo checkout, banner "DEMO", card 4242 (engine/auto.mjs:82-86, engine/appkit.mjs:40).
- Stripe through Hermes's connector is planned, not built (docs/specs/25-connections.md:111).

### Resend

- `RESEND_API_KEY`, handed only to an app whose locked plan chose Resend (plugin.yaml:49-51, engine/proc.mjs:31-36, engine/appkit.mjs:328, 390).
- Without it, emails go to an Outbox screen (engine/appkit.mjs:42-45).

### Image painting

- First choice: Hermes's `image_generate` through the bridge; provider is Hermes's `image_gen.provider` (docs/specs/33-hermes-bridge.md:56, 63-65, server/server.mjs:191).
- ckff (OpenAI-shaped image API, default `gpt-image-2.5`, base `https://ckffai.com/v1`) is listed beside Hermes when `CKFF_API_KEY` is set, and is the fallback when Hermes cannot paint (engine/ckff.mjs:1-14, server/server.mjs:193-207, 1437-1448). Keys: `CKFF_API_KEY`, `CKFF_BASE_URL`, `CKFF_MODEL` (plugin.yaml:18-24).
- `ckffCreds` also reads `CKFF_IMAGE_KEY`, but launcher.py does not pass it (engine/ckff.mjs:11, launcher.py:39).
- engine/paint-ckff.mjs is a developer command line (sprite sheets), not called by the server. It reads `CKFF_IMAGE_KEY` or an Octo vault item via `OCTO_AGENT_KEY`, and `CKFF_BASE` / `OCTO_URL`; none declared in plugin.yaml (engine/paint-ckff.mjs:1-33).
- Tools outside the server paint through `POST /api/hermes/image` (server/server.mjs:3292-3305).
- Clips: Hermes `video_generate` only (server/server.mjs:209-213). FAL is Hermes's own `FAL_KEY` (docs/specs/33-hermes-bridge.md:70-71).

### Posting (Postiz and others)

- No Postiz code exists; the only mentions are decision 0005 and the docs hook (docs/decisions/0005-sharing-person-posts.md:21-22, scripts/engine-docs-hook.mjs:16).
- Swarm never posts for anyone (docs/PRODUCT.md:60-62). Share pages open X, LinkedIn, Threads, Bluesky prefilled; the person presses Post (web/show.js:164-176).
- Launch kit can send one confirmed post to Discord, Slack or Telegram through the person's Hermes gateway (`hermes send --to`), only with `confirm: true` and unchanged text (server/server.mjs:3554-3566).
- Handing a post to a Hermes posting plugin (AdaptlyPost, Postel, Postroom): Unchecked, no code found (docs/decisions/0005-sharing-person-posts.md:20-22).

### Other connectors

- ElevenLabs: `ELEVENLABS_API_KEY` passed as `SWARM_ELEVENLABS_KEY`, or a pasted key, or an ElevenLabs MCP (plugin.yaml:15-17, launcher.py:217-223, engine/media.mjs:18-30, 84-86).
  Through the MCP, the file the connector saved is found from its reply, as a Unix or a Windows path (engine/media.mjs:102-107); none found means the studio scores the film itself (server/server.mjs).
- Meshy: `MESHY_API_KEY`, asks before spending credits (plugin.yaml:25-27).
- Pexels and Octo stand-in photos: `PEXELS_API_KEY`, `PEXELS_OCTO_LEASE`, `OCTO_SWARM_WS`, `OCTO_SWARM_WORKSPACE_ID`, `OCTO_BASE_URL` (plugin.yaml:28-40).
- Vercel and Cloudflare Pages: pasted token checked with the provider, kept mode 0600 in `connections.json`, or env `VERCEL_TOKEN` / `CLOUDFLARE_API_TOKEN`, or an Octo vault grant (engine/connect.mjs:1-24, 128-141).
- GitHub Pages: the `gh` login; Swarm Feed: `feed.json` (docs/specs/25-connections.md:29, 31).

## The Setup model picker (hermes_models.py)

- Setup › Models lists Hermes's own providers and models and sets the `swarm_studio_planner` and
  `swarm_studio_builder` slots (docs/specs/06-onboarding.md, Models). `hermes_models.py` runs as a short
  process in Hermes's Python (`SWARM_HERMES_PY`, `SWARM_HERMES_PYTHONPATH`, the profile's `HERMES_HOME`), started
  by server/server.mjs `pyModels`; routes in server/setup.mjs (`/api/setup/models/options`, `/pick`, `/signin`).
- **Stopgap, read only: it imports Hermes internals to read**, against the Nous review's "public plugin API only"
  (point 5), because Hermes has no public API for its model list yet. It reads with what Hermes's own dashboard
  and Desktop picker use: `hermes_cli.inventory.build_model_options_payload` (web_routers/models.py
  `/api/model/options`), `hermes_cli.config.load_config` (the two slots, credentials left out) and
  `hermes_cli.auth.PROVIDER_REGISTRY` (the env name a provider's key is kept under). Nothing in it writes;
  tests/test_bridge.py pins its imports and refuses any save, set or write in it. The dashboard's HTTP routes
  need an in-process session token, so they are not used. Move to a public API when Hermes ships one (asked
  for on NousResearch/hermes-agent).
- **Every change is Hermes's public CLI** (server/setup.mjs):
  - a pick: `hermes config set auxiliary.<slot>.model <model>` when the provider stays, else
    `hermes config set auxiliary.<slot> '<json>'` with the new provider and model and the slot's other settings,
    which drops the old endpoint and credentials as Hermes's own slot save does (web_server_config.py
    `_apply_aux_assignment_sync`, config.py `clear_model_endpoint_credentials`);
  - a key: `hermes config set <ENV_NAME> <key>`, which Hermes routes to `save_provider_env_credential`, the
    same store as its `model.save_key`. The env name comes from Hermes's list, never from the page. The key is
    on that process's command line for under two seconds (same user only); `hermes auth add --type api-key`
    would read it from a prompt instead, but that prompt waits on a hidden console on Windows.
- Browser sign-in is Hermes's public CLI, `hermes auth add <provider> --type oauth`, unbuffered; the sheet reads
  the link after "Open" and the user code from what it prints (hermes_cli/auth_device_flow.py,
  auth_codex_browser.py, auth_openrouter.py). Hermes opens the browser itself.
- Setup › Parts (web/setup-parts.js) lists every part a build uses, grouped by what the person makes, with its
  state and one fix. `GET /api/setup/parts` (server/setup.mjs `partsLocal`) answers only whether each key in
  `PART_KEYS` is set (booleans), Stripe's `test`/`live`, and whether Godot (`godotBin`), Chrome (`findChrome`),
  ffmpeg, HyperFrames, Kokoro and the built Dyad engine are on this computer. A key's fix is the command
  `hermes config set <NAME> <your key>` to copy, never a box to paste into; the launcher passes it at the
  studio's next start (launcher.py PASSED_KEYS). Unchecked: that `hermes config set` stores a plugin's own
  `optional_env` secret where `get_secret` reads it (verified only for provider keys, the `keyEnv` route above);
  settle from Hermes's hermes_cli/config.py. Nothing restarts the studio yet, so a new key shows "Not set up"
  until it next starts.
- Hermes caches its config by file time, so a pick applies without a restart. A pick is two CLI calls, about
  1.5 s each.

## What the person connects

- All keys optional, names only: `SWARM_STUDIO_API_KEY`, `ELEVENLABS_API_KEY`, `CKFF_API_KEY`, `CKFF_BASE_URL`, `CKFF_MODEL`, `MESHY_API_KEY`, `PEXELS_API_KEY`, `PEXELS_OCTO_LEASE`, `OCTO_SWARM_WS`, `OCTO_SWARM_WORKSPACE_ID`, `OCTO_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN` (plugin.yaml:11-57).
- Hermes connector: Supabase, plus the allowlist command the canvas shows (engine/hermes_connect.mjs:34-38).
- Hermes itself running (Desktop, gateway or `hermes swarm`) for any build (engine/hermeshealth.mjs:18-21).

## Limits inside Swarm

- A generated app gets only Supabase vars, a Stripe test key and its kit's declared keys (engine/proc.mjs:28-37).
- Keyed APIs like Duffel, Amadeus, Twilio, Mapbox are named but never reach a built app (engine/appkit.mjs:53-64).
- No Hermes, no build: refused with 503 before it starts; mid-build a call waits 20 s then stops (docs/specs/33-hermes-bridge.md:133-154).
- Hermes's default auxiliary timeout is 30 s; Swarm sends its own (docs/specs/33-hermes-bridge.md:108-111).
- Google sign-in for apps is not built (docs/specs/25-connections.md:114-116).

## Open questions

- Settings slices 2-5 (one place for every connection, `/swarm setup`) not built; slice 1 is (docs/specs/25-connections.md:106-112).
- Stripe and Vercel through Hermes connectors: planned (docs/specs/25-connections.md:111).
- Unchecked: Hermes's licence and whether a Postiz Hermes plugin exists (decision 0005 says none; not re-checked).

## Sources

- plugin.yaml, launcher.py:10-85, 200-233, hermes_models.py, server/setup.mjs (model picker)
- Hermes: hermes_cli/inventory.py, web_routers/models.py, web_server_config.py, config.py:765, credential_lifecycle.py, auth_device_flow.py:305-316
- engine/bridge.mjs, hermesllm.mjs, llm.mjs, hermeshealth.mjs, hermes_connect.mjs, connect.mjs, proc.mjs, ckff.mjs, paint-ckff.mjs, auto.mjs, appkit.mjs, media.mjs:18-86
- server/server.mjs:93-114, 190-213, 1334-1343, 1437-1448, 3290-3330, 3540-3576; web/show.js:164-176
- docs/specs/25-connections.md, docs/specs/33-hermes-bridge.md, docs/decisions/0005, docs/PRODUCT.md, docs/PLANS.md, AGENTS.md, scripts/engine-docs-hook.mjs
