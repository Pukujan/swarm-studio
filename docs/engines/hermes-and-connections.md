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
- That minimal env keeps `PATH`, `HOME`, `TMPDIR`, `LANG`, `HERMES_HOME`, `SWARM_GODOT`, `GODOT` and `SWARM_IMAGE_SERVICE` (the image service's off switch, engine/images.mjs), plus the Windows system folders (launcher.py:199-202).
- bridge.py runs a loopback server inside each Hermes process and attaches with `POST /api/hermes/attach {url, token, pid, code}`; Node keeps 4 bridges, drops one silent 45 s (engine/bridge.mjs:1-20). Attach interval: 5 s (engine/bridge.mjs:3, docs/specs/33-hermes-bridge.md:148-149); spec 33 also says 15 s (docs/specs/33-hermes-bridge.md:44).
- `call(path, body)` for `/image`, `/video`, `/mcp`; `send` streams model calls (engine/bridge.mjs:25-62).
- `/llm/v1` on the studio's port, with a per-process key, forwards to the bridge; `model` is the role (`planner`, `worker`, `reviewer`), optionally `role:pick` (engine/hermesllm.mjs:3-9, 22-24, 94). The app engine (Dyad) uses the same endpoint (engine/hermesllm.mjs:3-5).
- `streamChat` is the client for any OpenAI-shaped endpoint; through Hermes it drops provider hints and sends `x-swarm-timeout` (engine/llm.mjs:12, 58, 71).
- `hermesHealth` tells `closed` from `updated` by `$HERMES_HOME/gateway.pid` and the plugin's `.py` mtimes (engine/hermeshealth.mjs:18-22, 26-47).
- Every child process gets `childEnv` only (engine/proc.mjs:1-23). The long-running ones (an app's dev or built server, a film render) start through `start()`, execa with `extendEnv: false`, `cleanup` and `forceKillAfterDelay`, and stop through `stopTree()`, tree-kill, so their children go too (engine/proc.mjs, engine/vendor/procs/; decision 0017, issue #450).
- A server whose code changed on disk under it (an update) replaces itself the next time the page is asked for, when no work is running: same program, same port, and only the environment the launcher builds (engine/proc.mjs `SERVER_ENV` / `serverEnv`: launcher.py's `KEEP_ENV`, the variables it sets, `SWARM_STUDIO_API_KEY` and its settings, `SWARM_ELEVENLABS_KEY`, `PASSED_KEYS`, and the Windows system folders, plus `SERVER_SETTINGS`: `SWARM_PORT`, `SWARM_OUTPUT_DIR`, `SWARM_SERVER_IDLE_MIN`, so a hand-started server keeps its port and folders), never the server's whole environment, so a server started by hand from a full shell does not hand its successor anything the launcher would not. tests/selfreplace.test.mjs reads launcher.py and fails if the two lists differ. Hermes's bridge attaches again by itself (server/server.mjs `replaceSelf`, engine/proc.mjs `respawnSelf`, engine/lifecycle.mjs `codeStamp`). `SWARM_NO_REPLACE=1` turns it off.
- The server exits after 20 minutes with nothing to do: no pane (an `/events` stream), no request other than the bridge's re-attach and status looks, no build, Auto run, film, publish or app build (Settings › Background; server/server.mjs `serverBusy`, engine/lifecycle.mjs `idleWatch`). It closes its port first, so the next `ensure_server()` (the pane's `/canvas`, any `/swarm` command, `start_run`) starts a new one at once, and the bridge's attach loop attaches to it (launcher.py `_ensure_server`, bridge.py `_attach_loop`). A command refused in that moment starts it and asks once more (commands.py `_api`).

### Models / gateway

- Default: all roles through Hermes; no provider key reaches Node (server/server.mjs:93-98).
- Fallback: `SWARM_STUDIO_API_KEY` with `SWARM_STUDIO_BASE_URL`, default InferHub `https://api.inferhub.dev/v1`, model `cb/deepseek-v4.1-flash` (plugin.yaml:12-14, server/server.mjs:100-101).
- InferHub route failover (cb/, ali/, alitp/, ocg/) only for an inferhub base URL (engine/llm.mjs:33-51).
- `ctx.llm` does not stream (one SSE delta) and has no tool calls; bridge fakes tools with `<tool_call>` blocks in the prompt (docs/specs/33-hermes-bridge.md:84-104).
- Multiplexed gateway (`gateway.multiplex_profiles`, Hermes Desktop's default): a `ctx.llm` call from the bridge's own threads has no profile secret scope, and Hermes refuses to read the model key (Hermes bug NousResearch/hermes-agent#132887; its fix #132898 is still open, checked 2026-11-14). Until it ships, bridge.py `in_profile` binds the profile Hermes loaded the plugin for (`keep_profile`, from `register()`) around each bridge request (bridge.py `_route`, `_chat`). Its limits, each pinned by tests/test_bridge.py:
  - only when `scope.is_multiplex_active()` is true **and** `scope.current_secret_scope()` is None; a single-profile Hermes, a scope Hermes already bound (its own fix), or an unknown home runs the call as it is (bridge.py:99, tests/test_bridge.py:184-205);
  - the binding is made in a copy of the call's context (`contextvars.copy_context().run`), so it ends with that call, a call that raises included, and never stays on the thread (bridge.py:113, tests/test_bridge.py:206-218);
  - it binds the same profile scope Hermes's own plugin host builds (`build_profile_secret_scope(HOME)`); Hermes still reads the keys, the plugin never does (bridge.py:111);
  - it is the only `set_secret_scope` call in the plugin; `agent.secret_scope` and `hermes_constants` are on Hermes's public plugin API (v0.23.1 `hermes_cli/data/plugin_api.json`), and only launcher.py (`get_secret`) and bridge.py import them (tests/test_bridge.py:220).
  Remove it once #132898 is in the pinned Hermes.
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
- `ckffCreds` reads only `CKFF_API_KEY`, the name plugin.yaml declares and launcher.py passes (engine/ckff.mjs, tests/enginegaps.test.mjs). The `CKFF_IMAGE_KEY` alias it also read was never passed and is gone.
- engine/paint-ckff.mjs is a developer command line (sprite sheets), not called by the server. It reads `CKFF_IMAGE_KEY` or an Octo vault item via `OCTO_AGENT_KEY`, and `CKFF_BASE` / `OCTO_URL`; none declared in plugin.yaml (engine/paint-ckff.mjs:1-33).
- Tools outside the server paint through `POST /api/hermes/image` (server/server.mjs:3292-3305).
- The bridge also has `POST /web`: `{search, limit}` runs Hermes's own `web_search` and `{urls}` its `web_extract` through `ctx.dispatch_tool`, at most 20 results or 5 http(s) addresses a call (bridge.py `web`, tests/test_bridge.py). Nothing in the server calls it yet: it is the ground for the app engine's search, fetch and clone routes, which are not built (docs/engines/dyad.md, Limits).
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
- A project's source on GitHub (☰ › GitHub; docs/specs/45-intake.md): the same `gh` login, through `gh` and `git` with `credential.helper=!gh auth git-credential`; no token is read or kept, and the repository a project goes to is in `github-source.json` in the data folder (engine/sourcehub.mjs, server/sourcehub.mjs). The model's push goes through Hermes's approval prompt (`commands.py` `outward`: `swarm-studio:github:push:private`, `:public`, `:named:<owner/name>`).

## The Setup model picker (hermes_models.py)

- Setup › Models lists Hermes's own providers and models and sets the `swarm_studio_planner` and
  `swarm_studio_builder` slots (docs/specs/06-onboarding.md, Models). `hermes_models.py` runs as a short
  process in Hermes's Python (`SWARM_HERMES_PY`, `SWARM_HERMES_PYTHONPATH`, the profile's `HERMES_HOME`), started
  by server/server.mjs `pyModels`; routes in server/setup.mjs (`/api/setup/models/options`, `/pick`, `/signin`).
- **Stopgap, read only: one import outside Hermes's public plugin API.** Hermes v0.23.1 lists the modules a
  plugin may import in `hermes_cli/data/plugin_api.json` (docs: developer-guide/plugins/public-api.md), and its
  own `hermes plugins validate` check (`hermes_cli/plugin_validate_private_imports.py`), run on this repo, flags
  only `hermes_cli.inventory.build_model_options_payload` and `load_picker_context` in hermes_models.py.
  `hermes_cli.config` (`load_config`, the two slots, credentials left out) is public. Checked for a public way to
  list providers and models, none usable:
  - no public module has it, and no `ctx` method: `ctx.llm` (agent/plugin_llm.py) has only `complete` and
    `complete_structured`;
  - no machine-readable CLI: `hermes model` is interactive only (hermes_cli/subcommands/model.py, no `--json`);
    `hermes auth list` lists credentials, not models;
  - the API server's documented `GET /api/model/options` (website/docs/user-guide/features/api-server.md) gives
    the same payload, but the API server is off unless the person turns it on, and it needs `API_SERVER_KEY`,
    a bearer key this plugin will not read; the dashboard's routes need an in-process session token.
  So hermes_models.py reads the list with the one function that route, the dashboard and Desktop's picker call.
  Nothing in it writes; tests/test_bridge.py pins its imports to those three names and refuses any save, set,
  write or open in it. `hermes_cli.auth.PROVIDER_REGISTRY` (private) is no longer imported. Move to a public API
  when Hermes ships one.
- **Every change is Hermes's public CLI** (server/setup.mjs), and the only setting the studio sets is a pick:
  `hermes config set auxiliary.<slot>.model <model>` when the provider stays, else
  `hermes config set auxiliary.<slot> '<json>'` with the new provider and model and the slot's other settings,
  which drops the old endpoint and credentials as Hermes's own slot save does (web_server_config.py
  `_apply_aux_assignment_sync`, config.py `clear_model_endpoint_credentials`). tests/test_bridge.py refuses any
  other `config set` target in the plugin.
- **A provider key never reaches the studio.** Under More providers, a provider whose sign-in is a key shows the
  command `hermes auth add <provider> --type api-key` with Copy, and **Check again**. The person runs it in their
  own terminal; Hermes asks for the key itself with a hidden prompt (hermes_cli/auth_commands.py
  `_add_api_key_credential`, `masked_secret_prompt`) and keeps it in its credential pool, which its provider list
  counts as signed in (model_switch_providers.py `_credential_pool_is_usable`). So the key is on no command line,
  not even the person's own. Check again asks Hermes's list afresh (`/api/setup/models/options?refresh=1`).
  There is no route that takes a key: `POST /api/setup/models/signin` answers 400 to any body with `key`, and
  runs nothing (tests/setup.test.mjs).
- Browser sign-in is Hermes's public CLI, `hermes auth add <provider> --type oauth`, which the studio starts
  (server/setup.mjs `signInBrowser`, unbuffered, `hermesEnv()` only: `HERMES_HOME`, no keys). Hermes runs the
  provider's own flow (device code, or PKCE on a loopback port) and opens the browser itself
  (hermes_cli/auth_device_flow.py, auth_codex_browser.py, auth_openrouter.py: `webbrowser.open`). The studio
  only reads the link and user code Hermes prints, so the sheet can show them with Open and Cancel; Hermes
  receives and keeps the token, and the studio never sees it. Cancel stops that process.
- Setup › Parts (web/setup-parts.js) lists every part a build uses, grouped by what the person makes, with its
  state and one fix. `GET /api/setup/parts` (server/setup.mjs `partsLocal`) answers only whether each key in
  `PART_KEYS` is set (booleans), Stripe's `test`/`live`, and whether Godot (`godotBin`), Chrome (`findChrome`),
  ffmpeg, HyperFrames, Kokoro and the built Dyad engine are on this computer. A key's fix is the command
  `hermes config set <NAME> <your key>` to copy and run in the person's own terminal, never a box to paste into; the launcher passes it at the
  studio's next start (launcher.py PASSED_KEYS). `hermes config set` writes any UPPER_SNAKE name to the
  profile's `.env` (Hermes v0.23.1 hermes_cli/config.py `set_config_value`: `save_env_setting`, or
  `save_provider_env_credential` for a provider key), the file `build_profile_secret_scope` reads for
  `get_secret` (website/docs/developer-guide/multiplexing-gateway.md). The studio never sees or runs it; the
  key is on the person's own command line (and shell history) only. Nothing restarts the studio yet, so a new
  key shows "Not set up" until it next starts.
- Hermes caches its config by file time, so a pick applies without a restart. A pick is two CLI calls, about
  1.5 s each.

## What the person connects

- All keys optional, names only: `SWARM_STUDIO_API_KEY`, `ELEVENLABS_API_KEY`, `CKFF_API_KEY`, `CKFF_BASE_URL`, `CKFF_MODEL`, `MESHY_API_KEY`, `PEXELS_API_KEY`, `PEXELS_OCTO_LEASE`, `OCTO_SWARM_WS`, `OCTO_SWARM_WORKSPACE_ID`, `OCTO_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN`, `JEV_KEY` (plugin.yaml:11-70).
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

- plugin.yaml, launcher.py:10-85, 200-233, hermes_models.py, server/setup.mjs (model picker), engine/proc.mjs (`serverEnv`)
- Hermes v0.23.1: hermes_cli/data/plugin_api.json, plugin_validate_private_imports.py, inventory.py, web_routers/models.py, web_server_config.py, config.py, auth_commands.py, subcommands/model.py, subcommands/auth.py, model_switch_providers.py, auth_device_flow.py, agent/plugin_llm.py, gateway/platforms/api_server.py, website/docs/developer-guide/plugins/public-api.md, website/docs/user-guide/features/api-server.md
- engine/bridge.mjs, hermesllm.mjs, llm.mjs, hermeshealth.mjs, hermes_connect.mjs, connect.mjs, proc.mjs, ckff.mjs, paint-ckff.mjs, auto.mjs, appkit.mjs, media.mjs:18-86
- server/server.mjs:93-114, 190-213, 1334-1343, 1437-1448, 3290-3330, 3540-3576; web/show.js:164-176
- docs/specs/25-connections.md, docs/specs/33-hermes-bridge.md, docs/decisions/0005, docs/PRODUCT.md, docs/PLANS.md, AGENTS.md, scripts/engine-docs-hook.mjs
