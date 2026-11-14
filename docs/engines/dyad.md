# Dyad

Glue: engine/appbuild.mjs, engine/appjob.mjs, engine/export.mjs, engine/auto.mjs, engine/appkit.mjs, engine/systems.mjs, engine/advisor.mjs, engine/proc.mjs, engine/hermesllm.mjs
Status: built in

Dyad is a local AI app builder (dyad/README.md:3). Swarm vendors its agent engine in `dyad/`, copied from the owner's ABA fork (commit `8dd2d7a`), which adds a headless runner in `dyad/src/aba/` (dyad/SWARM.md:3-7). Licence: Apache-2.0 outside `src/pro/`, FSL-1.1-ALv2 inside it (dyad/README.md:33-34, dyad/LICENSE:1-3, dyad/src/pro/LICENSE:1-5). The agent tools below all live in `src/pro/` (dyad/src/pro/main/ipc/handlers/local_agent/tool_definitions.ts:150-209).

## What it already does

- Templates: React + Vite + shadcn + Tailwind (the default), Next.js, full-stack Vite + Nitro (experimental), and "Portal: Mini Store" with Neon, Payload CMS and Next.js (experimental, needs Neon) (dyad/src/shared/templates.ts:21-66).
- Agent mode ("local-agent") writes and edits files, adds npm packages, greps, searches code, reads logs, runs type checks, builds and tests, and spawns helper agents (dyad/src/pro/main/ipc/handlers/local_agent/tool_definitions.ts:150-209).
- Admin panels and dashboards are ordinary app code the agent writes. No special tool is needed. The owner confirmed Dyad builds them well (../DECISIONS.md:266, path from the repo root: `hermes hackathon/DECISIONS.md`).
- Tools that matter:
  - `web_crawl`: crawls a URL and clones the site from a screenshot plus markdown. It is used only when the person asks to clone/copy a site and gives a URL. Images become a grey placeholder (dyad/src/pro/main/ipc/handlers/local_agent/tools/web_crawl.ts:25-60).
  - `web_fetch` reads a page as markdown; `web_search` searches the web (tools/web_fetch.ts:45-94, tools/web_search.ts:18,175-184).
  - `add_integration`: asks the person to pick and set up Supabase or Neon, and blocks until they finish in Dyad's window (tools/add_integration.ts:14-35).
  - `enable_nitro`: adds a Nitro server layer (`server/routes/api/`) to a Vite app. Enabled only for Vite apps without Supabase (tools/enable_nitro.ts:44-50; dyad/plans/nitro-integration.md:7,23-25).
  - `execute_sql` and `get_database_table_schema`: run SQL and read a table's schema on the linked Supabase, Neon or Octo database. Enabled only when one is linked (tools/execute_sql.ts:180-218, tools/get_database_table_schema.ts:31-58, tools/types.ts:395-415).
  - `get_supabase_project_info`, `get_neon_project_info` (tools/get_supabase_project_info.ts:23-28, tools/get_neon_project_info.ts:24-29).
  - `add_dependency`: installs npm packages (tools/add_dependency.ts:29-36).
  - `generate_image`: paints an image into `.dyad/media` (tools/generate_image.ts:30-141).
  - `planning_questionnaire`, `write_plan`, `exit_plan`, `write_app_blueprint`: Dyad's own planning flow. `write_plan`/`exit_plan` are plan-mode only. A blueprint needs a finished questionnaire first (tool_definitions.ts:663; tools/write_app_blueprint.ts:129-136).
  - `search_mcp_tools`, `get_mcp_tool_schema`, `suggest_plugin`: MCP tools of the servers the person enabled (tools/search_mcp_tools.ts:67-77, tools/get_mcp_tool_schema.ts:35-46, tools/suggest_plugin.ts:236-251).
  - `view_render`: screenshots the running app (ABA addition; tools/view_render.ts:43-50).
- Stripe: Dyad has no Stripe integration. Its prompt only names "Stripe handlers" as server code (dyad/src/prompts/system_prompt.ts:347). A build adds `stripe` as a plain dependency.
- Plans in `dyad/plans/`, checked against this copy's code:
  - Neon (neondb-integration.md): shipped in part. `neon_admin/` and the Neon agent tools exist (dyad/src/neon_admin/neon_context.ts:147,331; tools/get_neon_project_info.ts:24). Unchecked: whether Neon works with the plain Next.js template; reading `dyad/src/ipc/utils/template_utils.ts` and the Neon connector would settle it.
  - Nitro (nitro-integration.md): shipped (tools/enable_nitro.ts:44-80).
  - Local Supabase (local-supabase-support.md): not shipped. No `supabase status` or local-instance detection in `dyad/src` (grep for `54321|supabase start|local supabase` finds only tests and remote-function sync code).
  - Convex (convex-backend-support.md): not shipped. No file in `dyad/src` mentions Convex.

## How Swarm drives it

- First use: `setupEngine` runs `pnpm install --frozen-lockfile` and `vite build --config vite.aba-headless.config.mts` into `dyad/.vite/build/aba_headless.cjs`, on a Node in dyad's `engines` range (engine/appbuild.mjs:88-106).
- `runEngine` spawns `node aba_headless.cjs --prompt <file> --workspace <app> --model <m> --gateway <baseUrl> --turns N --user-data-dir <dir> --json --view-render` (engine/appbuild.mjs:121-134). Its env is only git, `appEnv()`, `ABA_API_KEY` (the studio's own /llm/v1 key), `ABA_ENV_FILE` (a missing file, so no `.env` is read) and `ELECTRON_RUN_AS_NODE` (engine/appbuild.mjs:143-151).
- The runner boots Dyad in-process with Pro on and no Pro key, agent mode, auto-approve, all subagents on, and `execute_sql`, `add_dependency`, `web_search`, `web_crawl` set to "always" (dyad/src/aba/headless.ts:123-129,422-447). It streams the prompt, then runs the app's `typecheck` (if the script exists) and `build`, and sends failures back as repair turns until `--turns` runs out (dyad/src/aba/headless_cli.ts:198-243,455-474). It prints one JSON line `{ ok, gatesPassed, turns, files, commits, egressHosts, ... }` and writes `RUN_META.json` (dyad/src/aba/headless_cli.ts:490-523). `runEngine` parses that line (engine/appbuild.mjs:173,186).
- Which template Swarm seeds: the bare `dyad/scaffold/` (Vite + React + shadcn; dyad/scaffold/package.json:2-11), copied by `seedProject` (engine/export.mjs:314-322). For a site, `dyadApp` writes the design's sections and pages into it and removes `made-with-dyad.tsx` (engine/export.mjs:324-331). The scaffold has no `typecheck` script, so only `build` gates (dyad/scaffold/package.json:6-12; dyad/src/aba/headless_cli.ts:235-242). Swarm never picks Next.js, Nitro or Portal as a template.
- What Swarm's prompts dictate (engine/appjob.mjs):
  - keep the converted design's markup, classes and CSS variables (`KEEP`, :24);
  - call `enable_nitro`, put routes in `server/routes/api/`, keep data in a typed server-side store (`BACKEND`, :32-34);
  - sign-in is Supabase Auth when `SUPABASE_URL` is set, else a labelled scrypt guest pass, and no unconfigured provider buttons (`AUTH`, :27-30);
  - forms with zod + react-hook-form, GET routes for lists, saved records, and an `/admin` page with a shadcn Table and a summary unless a plan names the back office (`sitePrompt`, :47-71).
- What is left to Dyad: how to write the code, which files and packages, how the admin screens and dashboards look and work, and the repair loop (the prompts above dictate nothing else: engine/appjob.mjs:24-71; the repair loop is dyad/src/aba/headless_cli.ts:198-243).
- More prompts: Auto mode's games, `SHOP_ASK` checkout and `supabaseAsk` (engine/auto.mjs:59,82-89,217,267). The advisor's back-office questions (engine/advisor.mjs:22-36). The App kit's locked plan, `kitPlan` (engine/appkit.mjs:313-331). Systems modules (engine/systems.mjs:44-60).
- Swarm then serves the app itself on 127.0.0.1 and deploys it to Vercel (`deploy`). How it serves it (decision 0017, issue #450, spec 44 "the dev server only while building"):
  - While the crew builds or someone edits: the app's Vite dev server (`serve`, engine/appjob.mjs), started with execa through `start()` (engine/proc.mjs, engine/vendor/procs/).
  - Once building stops: the app built (`serveBuilt`). `vite build` runs when the app's files changed since the last build (`sourceSig`, stamped in `.swarm-built.json`), then `dist/` is served as files from Swarm's own process, with a fallback to `index.html` (engine/godotfirst.mjs `serveStatic`). An app with server routes (Dyad's Nitro layer: `nitro.config.ts` or `server/`) builds to `.output/` and runs as `node .output/server/index.mjs`, the start command Dyad itself writes (dyad/src/lib/framework_constants.ts:58), behind a front that adds CORS for the sandboxed frame (`corsFront`).
  - Either server stops after 2 minutes with no viewer and no build (the App view's heartbeat, `POST /api/runs/<id>/app/seen`; Settings › Background), and at most 2 run, the least recently viewed stopped first (engine/lifecycle.mjs `previewPool`). A stop kills the whole process tree (`stopTree`, tree-kill). Opening it again serves it cold, with the App view's skeleton while it starts.
  - A big game waiting after a slice ("your turn") is stopped the same way, and is not an app yet (`hasApp` needs a finished build). Its state says `canServe` when its files are there, the App view opens it again when the person asks (the Live option, Play it live, "show the game": `POST /api/runs/<id>/app/open`, served built), and it stays `paused` with its slice (engine/appjob.mjs `open`, `servable`; tests/elsewhere.test.mjs). Unchecked: a real `vite build` of a slice whose play test failed; the test uses an already built `dist/`.
  - Unchecked: a real `vite build` of a Nitro app here; the Nitro start command and `.output/` come from Dyad's code, not from a run.

## What the person connects

- Models: nothing for Dyad itself. The gateway is the studio's `/llm/v1`, forwarded to Hermes (engine/hermesllm.mjs:1-6). Or `SWARM_STUDIO_API_KEY` / `SWARM_STUDIO_BASE_URL` when set (server/server.mjs:115-128, plugin.yaml:12-13).
- App data: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (plugin.yaml:41-44), or Hermes's Supabase connector (docs/specs/25-connections.md:30). The table `swarm_records` is made once by the person (engine/auto.mjs:62,75).
- Payments: `STRIPE_SECRET_KEY`, test keys only. A live key is never handed to an app (engine/proc.mjs:32-37, plugin.yaml:46-48).
- Email: `RESEND_API_KEY`, handed only to an app whose locked kit chose Resend (engine/proc.mjs:31-36, engine/appkit.mjs:390).
- Disk: the first app build installs about 1.5 GB into `dyad/node_modules` (README.md:217).

## Limits inside Swarm

- Egress guard: `installEgressGuard` wraps `fetch` in the engine process and refuses any host but the gateway, the image host and the Octo host (Octo only when `OCTO_*` keys are set). Loopback is allowed with `--view-render` (dyad/src/aba/headless.ts:321-376; dyad/src/aba/headless_cli.ts:330-354). Every dyad.sh URL points at a dead loopback port (dyad/src/aba/headless_env.ts:19-28).
- Clone, web search, web fetch and image tools do not work in Swarm today. They call `DYAD_ENGINE_URL` + `/tools/web-crawl`, `/tools/web-search`, `/images/generations` (tools/web_crawl.ts:91, tools/web_search.ts:108, tools/web_fetch.ts:68, tools/generate_image.ts:64). The runner sets `DYAD_ENGINE_URL` to the gateway (dyad/src/aba/headless.ts:294-297). Swarm's `/llm/v1` serves only `chat/completions` and `models` and answers 404 to the rest (engine/hermesllm.mjs:22,37-41). Swarm paints pictures with its own pipeline instead (engine/appjob.mjs:143-146,327). Unchecked: whether the tools work with `SWARM_STUDIO_BASE_URL` pointed at a gateway that serves those paths.
- Dyad's own database setup cannot run here. `add_integration` waits for a person in Dyad's desktop window, which the headless runner does not have. `execute_sql` and the schema tools need a linked Supabase/Neon project (tools/add_integration.ts:27-33; tools/types.ts:395-415). Swarm wires Supabase through prompts and env instead (engine/auto.mjs:59; engine/proc.mjs:32-37). The app's own runtime calls to Supabase or Stripe run in the app's Vite process, not under the guard (engine/appjob.mjs:631).
- Unchecked: what happens if the model calls `add_integration` or `planning_questionnaire` headless (it may park until the turn times out). The runner has no user-input handling (no match for `userInput` in `dyad/src/aba/`).
- `write_app_blueprint` is off: the headless app row keeps `needs_app_blueprint` at its default 0 (dyad/src/db/schema.ts:122-124; dyad/src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts:1143-1144).
- MCP: the headless boot adds no MCP servers, and the MCP catalog URL is dead (dyad/src/aba/headless.ts:449-525; dyad/src/aba/headless_env.ts:25). Unchecked: whether Hermes's MCP servers could be added as rows.
- Licence: `src/pro/` is FSL. Non-commercial and internal use is fine (dyad/SWARM.md:9-11). A Competing Use is not allowed (dyad/src/pro/LICENSE:30-32).
- No Dyad branding in built apps (../DECISIONS.md:131; engine/export.mjs:318-321,330).

## Open questions

- Dyad as an optional engine instead of always bundled: proposed, not decided (../DECISIONS.md:167).
- Neon as a second database (a new key in `plugin.yaml`), and letting the person pick Dyad's Next.js template: open (../DECISIONS.md:283-286).
- A website link in What you have going to Dyad's clone tool: proposed (../DECISIONS.md:288). It needs a `/tools/web-crawl` route first (see Limits).
- How a website grows into a full-stack app, and how much Dyad owns: open (../DECISIONS.md:261). Standing: Dyad owns the stack, database, cloning, admin panels and dashboards (../DECISIONS.md:276).

## Sources

- dyad/SWARM.md, dyad/PRODUCT.md, dyad/README.md, dyad/LICENSE, dyad/src/pro/LICENSE, dyad/docs/architecture.md
- dyad/rules/local-agent-tools.md, dyad/rules/supabase-functions.md
- dyad/plans/neondb-integration.md, nitro-integration.md, local-supabase-support.md, convex-backend-support.md
- dyad/src/shared/templates.ts, dyad/scaffold/package.json, dyad/vite.aba-headless.config.mts
- dyad/src/aba/headless_cli.ts, headless.ts, headless_env.ts; dyad/src/lib/aba_model_config.ts; dyad/src/ipc/utils/dyad_engine_url.ts
- dyad/src/pro/main/ipc/handlers/local_agent/tool_definitions.ts and tools/: web_crawl, web_fetch, web_search, engine_fetch, add_integration, enable_nitro, execute_sql, get_database_table_schema, get_supabase_project_info, get_neon_project_info, add_dependency, generate_image, planning_questionnaire, write_plan, write_app_blueprint, search_mcp_tools, get_mcp_tool_schema, suggest_plugin, view_render, run_shell, execute_sandbox_script, types.ts
- dyad/src/db/schema.ts, dyad/src/prompts/system_prompt.ts, dyad/src/neon_admin/neon_context.ts
- engine/appbuild.mjs, appjob.mjs, export.mjs, auto.mjs, appkit.mjs, systems.mjs, advisor.mjs, proc.mjs, hermesllm.mjs; server/server.mjs; plugin.yaml; README.md
- AGENTS.md, docs/PRODUCT.md, docs/PLANS.md, docs/decisions/README.md, 0002, 0003, 0010, 0011
- docs/specs/18-projects.md, 21-plan-before-spend.md, 25-connections.md, 29-chats-references-marks.md, 37-studio-first.md
- ../DECISIONS.md (hermes hackathon/DECISIONS.md)
