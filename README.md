# Swarm Studio

A whole creative studio, inside [Hermes Agent](https://github.com/NousResearch/hermes-agent). One prompt, and a crew of agents you can watch and steer builds the whole launch: a multi-page site, a live app with a database, a playable game, a promo film and the posts.

You give it a one-line brief. Commander Hermia, the planner, picks the theme and the pages. Then a dozen or more agents take sections off a shared queue and stream them onto a Figma-like canvas at the same time. You see their cursors, short chat bubbles about what they're doing, wires between linked pages, and a clickable prototype at the end. A typical run builds 4 pages and 30–40 sections in 30–60 seconds. Builds post to [Swarm Feed](https://swarm.design-bakery.com/studio), where people try them live and remix them with credit.

The pitch, brand, market numbers and stories live in [docs/brand](docs/brand/): [PITCH.md](docs/brand/PITCH.md), [BRAND.md](docs/brand/BRAND.md), [MARKET.md](docs/brand/MARKET.md) and [stories-swarm-studio.md](docs/brand/stories-swarm-studio.md).

## Ways to use it

| Where | How |
|---|---|
| Hermes Desktop | **Swarm Studio** in the sidebar opens the canvas as a page, and a `swarm` pane can sit beside the chat. A status-bar chip shows how many agents are working. |
| Any Hermes chat | Ask for a site. The agent calls the `swarm_design` tool and gets back the run summary and the canvas URL. |
| Slash command | `/swarm <what the site is for>` starts a build without going through the model. |
| Terminal | `hermes swarm "a climbing gym in Cornwall" --wait` |
| Skill | `swarm-studio:swarm-design` tells the agent when to use the swarm and how to write a good brief. |

See [FEATURES.md](FEATURES.md) for everything it does, with the canvas button and `/swarm` command for each.

## Install

```bash
hermes plugins install Pukujan/swarm-studio --force
hermes plugins enable swarm-studio
```

Why `--force`: Hermes scans every plugin on install. This repo vendors the dyad app engine, whose dev files
(its CI workflows, test fixtures and docs that list blocked commands such as `rm -rf /`) match the scan's
patterns, so the verdict is CAUTION and a plain install stops with `Decision: BLOCKED … Use --force to
override.` In a terminal it instead lists the findings and asks
`Install anyway? Only continue if you trust the source. [y/N]:`, where `y` does the same as `--force`.
`--force` accepts a CAUTION verdict only; Hermes still refuses a DANGEROUS one.

That's it: the swarm uses the models you already set up in Hermes. Check with:

```bash
hermes swarm --models
```

In Hermes Desktop, turn on **Swarm Studio** under Capabilities → Plugins.

Requires Node.js 18 or newer on `PATH` (or set `SWARM_STUDIO_NODE`). There are no npm dependencies. Works on macOS, Linux and native Windows.

## Models

The plugin adds two slots to Hermes's model picker (`hermes model`, or Desktop's model settings), stored as `auxiliary.<slot>` in your Hermes config:

| Slot | Used for | Until you pick one |
|---|---|---|
| **Swarm Studio planner** (`swarm_studio_planner`) | the sitemap and page planners, a few calls per build | your main model |
| **Swarm Studio builders** (`swarm_studio_builder`) | the parallel section agents, most of the calls | your compression model, which is usually a fast, cheap one |

When a build starts, Hermes resolves each slot to an endpoint, key and model and hands them to the swarm process. The slot's provider must speak the OpenAI `/chat/completions` API, since the builders stream. If it doesn't (Anthropic, Bedrock or Codex clients), `hermes swarm --models` says so; pick an OpenAI-compatible provider for that slot or set `SWARM_STUDIO_API_KEY`.

## Settings

Optional. Setting `SWARM_STUDIO_API_KEY` bypasses the Hermes slots and uses that key with `SWARM_STUDIO_BASE_URL`. The model variables override the model in either case.

| Variable | Default | What it does |
|---|---|---|
| `SWARM_STUDIO_API_KEY` | unset | Use this key instead of the Hermes slots. Read through Hermes's secret store. |
| `SWARM_STUDIO_BASE_URL` | `https://api.inferhub.dev/v1` | Any OpenAI-compatible `/chat/completions` endpoint. |
| `SWARM_STUDIO_PLANNER_MODEL` | the slot's model | Model for the sitemap and page planners. |
| `SWARM_STUDIO_WORKER_MODEL` | the slot's model | Model for the section agents. A fast model matters more than a big one. |
| `SWARM_STUDIO_AGENTS` | `16` | Swarm size, 2–24. |
| `SWARM_STUDIO_PORT` | `4319` | Port of the local canvas server. |

## How it works

1. **Sitemap.** One streamed call writes the theme (colours, fonts, radius), the shared nav and footer, and the pages with their section lists.
2. **Page planners.** One planner per page runs in parallel and breaks its page into layers. Each layer is queued the moment its JSON is complete, so agents start before planning finishes.
3. **Agents.** A fixed pool of agents takes layers off the queue. Each streams HTML and Tailwind using the theme's CSS variables, plus a one-line note about what it is doing. Links between pages use `data-goto`, which becomes a wire on the canvas and a working link in the prototype.
4. **Canvas.** Each page is a sandboxed frame. The canvas talks to the frames only by `postMessage`, so it works inside Hermes Desktop's opaque-origin `SandboxedFrame`.
5. **Visitors.** In Play mode, **Watch a visitor** asks the planner model for 3–4 people with different goals (one wants to buy or book, one is unsure and ends up calling, one reads about the company). Their scripts can only use links, buttons, inputs and headings that exist on each page, and are checked against them. A cursor then acts each one out on Desktop or Mobile, with a thought bubble that cycles through two or three ways of saying the same thought. Scripts are saved with the run.
6. **Motion.** The prototype plays like a finished site: sections reveal as they scroll in (headings, copy, pictures and cards one after another), the first screen plays on load and buttons lift on hover. The theme's art direction picks the feel (a soft rise, or a quicker spring for bold and playful themes), and it respects reduced-motion settings. **✨ Motion** (or M) turns it off. The HTML and React exports ship the same script (`engine/motion.mjs`).

Runs are saved under `$HERMES_HOME/swarm-studio/runs/<run>/` (`plan.json` plus each layer's HTML).

## What it does on your machine

- **A background process.** The plugin starts a small Node server (`server/server.mjs`) the first time you use it. It listens on `127.0.0.1` only, and keeps running after Hermes closes. It refuses requests whose `Host` isn't `127.0.0.1` or `localhost`. Starting a run and reading the event stream both need a random token that is made per install and stored with mode `0600`.
- **Network calls.**
  - The server calls the chat endpoint you configure (InferHub by default) with your brief and the plan.
  - The **Setup** sheet (shown once, then in your menu on Projects) sends the words "Say ok" to your planner and builder models to check they answer. "Let Hermes set this up" opens `hermes model` in a terminal.
  - The canvas and page frames load Tailwind from `cdn.tailwindcss.com` and fonts from Google Fonts.
  - Generated images go through the Hermes image provider you pick (your Codex login by default); the visual review sends page screenshots to your vision model.
  - While a picture is being painted its slot shows a stock photo: the picture's prompt words are searched on Openverse (and Pexels, with a key), and photos from the studio's own library are fetched from `files.design-bakery.com` by the local server and kept in `$HERMES_HOME/swarm-studio/standins/`.
  - **Publish** to GitHub Pages runs your `gh` CLI: it creates a public repo under your account (its description says it was made with Swarm Studio, and it only ever updates repos marked that way) and pushes the static site. **Vercel** and **Cloudflare Pages** use an access token you connect once in the Publish menu (or `VERCEL_TOKEN` / `CLOUDFLARE_API_TOKEN`); it is checked with the provider and stored in `$HERMES_HOME/swarm-studio/connections.json` with mode `0600`, and never sent back to the canvas. You can paste an **Octo vault** grant (`octo_vault_…`) instead of a token: Swarm Studio finds the provider's item in your vault, keeps only a 30-day working key for that one item (renewed automatically, the grant itself is not stored), and every call goes through Octo's relay, so the provider token never leaves the vault. Both deploy through the provider's REST API (Cloudflare's direct upload, the same calls wrangler makes), with no extra tools to install. Publishing locally serves the site from the canvas server at `127.0.0.1:4319/site/<run>/`.
  - The first promo video installs `hyperframes` and ffmpeg from npm into `$HERMES_HOME/swarm-studio/video-tools/`. Rendering runs locally in headless Chrome.
  - The first **app** build installs the app engine (dyad's headless engine, vendored in `dyad/`, Apache-2.0 with `src/pro` under FSL) from npm into the plugin's `dyad/node_modules` (about 1.5 GB, once), and each app installs its own packages with `pnpm`. Apps run on a local Vite server on `127.0.0.1`. **App deploy** uploads the app's source to your Vercel account, which builds it.
  - **Game mode** reads its game-dev notes from the plugin (`gameskills/`); games make their art and sound in code, so nothing is downloaded for them. A game spec can also name 3D models (`"models": [{ "file": "Knight.glb", "what": "the hero" }]`) that you put in `$HERMES_HOME/swarm-studio/models/`; they are copied into the game and into its engine port.
  - **Godot ports** are opened and run headless with your Godot 4 (`godot` on `PATH`, or `SWARM_GODOT` set to its executable) when it is installed, and Godot's errors get a fix turn.
  - **Swarm Feed** (only when you run `/swarm connect`, `post`, `remix` or `login`) talks to `https://swarm.design-bakery.com` (or `SWARM_FEED_URL`). `connect` sends a random install id and "Hermes on <computer name>"; `post` sends the build's title, brief, public link, page names, crew, a poster (a page shot or picture from the build) and caption, then its export zip; `remix` downloads the original's prompt and zip into `$HERMES_HOME/swarm-studio/remix/` (kept, never unpacked or run). The feed token is stored in `$HERMES_HOME/swarm-studio/feed.json` with mode `0600` and never printed.
  - Nothing else leaves the machine.
- **Files.** It writes only under `$HERMES_HOME/swarm-studio/`: the token, `server.log`, the runs, your picks (`models.json`, `setup.json`), `connections.json` if you connect a host, and `feed.json` and `remix/` if you use the Swarm Feed.
- **Secrets.** Keys come from Hermes (the model slots or its secret store). It is passed to the server process through its environment and is never written to disk or logs.

## Known issues

- **Hermes mobile.** The canvas runs on the computer's `127.0.0.1`, so the phone webapp can't reach it.
- **Generated sites are prototypes** until you open the **App** tab: Publish puts the static pages online as they are; the App tab makes them a working app with a backend.
- **The app engine is heavy**: about 1.5 GB on first use, and a build takes several minutes on a fast coding model.
- **Promo videos** need Node's `npm` on the machine the first time (to fetch HyperFrames and ffmpeg), and Chrome for headless rendering.

## License

[FSL-1.1-ALv2](LICENSE) (Functional Source License, Apache 2.0 future license). It is source-available ("fair source"), not OSI open source.

- You can install, read, change and use Swarm Studio for anything, including your own commercial sites and apps built with it.
- You can't offer Swarm Studio itself, or something substantially like it, as a commercial product or service.
- Each version becomes Apache-2.0 two years after it is released.

Versions up to commit `9283694` were released under Apache-2.0 and stay under it.
