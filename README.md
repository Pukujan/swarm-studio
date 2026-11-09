# Swarm Studio

A swarm of agents designs and builds a multi-page website live on a canvas, for [Hermes Agent](https://github.com/NousResearch/hermes-agent).

You give it a one-line brief. A planner picks the theme and the pages. Then a dozen or more agents take sections off a shared queue and stream them onto the canvas at the same time. You see their cursors, their design tools, short chat bubbles about what they're doing, wires between linked pages, and a clickable prototype at the end. A typical run builds 4 pages and 30–40 sections in 30–60 seconds.

## Ways to use it

| Where | How |
|---|---|
| Hermes Desktop | **Swarm Studio** in the sidebar opens the canvas as a page, and a `swarm` pane can sit beside the chat. A status-bar chip shows how many agents are working. |
| Any Hermes chat | Ask for a site. The agent calls the `swarm_design` tool and gets back the run summary and the canvas URL. |
| Slash command | `/swarm <what the site is for>` starts a build without going through the model. |
| Terminal | `hermes swarm "a climbing gym in Cornwall" --wait` |
| Skill | `swarm-studio:swarm-design` tells the agent when to use the swarm and how to write a good brief. |

## Install

```bash
hermes plugins install https://github.com/Pukujan/swarm-studio
hermes plugins enable swarm-studio
```

That's it: the swarm uses the models you already set up in Hermes. Check with:

```bash
hermes swarm --models
```

In Hermes Desktop, turn on **Swarm Studio** under Capabilities → Plugins.

Requires Node.js 18 or newer on `PATH` (or set `SWARM_STUDIO_NODE`). There are no npm dependencies.

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

Runs are saved under `$HERMES_HOME/swarm-studio/runs/<run>/` (`plan.json` plus each layer's HTML).

## What it does on your machine

- **A background process.** The plugin starts a small Node server (`server/server.mjs`) the first time you use it. It listens on `127.0.0.1` only, and keeps running after Hermes closes. It refuses requests whose `Host` isn't `127.0.0.1` or `localhost`. Starting a run and reading the event stream both need a random token that is made per install and stored with mode `0600`.
- **Network calls.**
  - The server calls the chat endpoint you configure (InferHub by default) with your brief and the plan.
  - The canvas and page frames load Tailwind from `cdn.tailwindcss.com` and fonts from Google Fonts.
  - Nothing else leaves the machine.
- **Files.** It writes only under `$HERMES_HOME/swarm-studio/`: the token, `server.log` and the runs.
- **Secrets.** Keys come from Hermes (the model slots or its secret store). It is passed to the server process through its environment and is never written to disk or logs.

## Known issues

- **Hermes mobile.** The canvas runs on the computer's `127.0.0.1`, so the phone webapp can't reach it.
- **Generated sites are prototypes.** They are static HTML and Tailwind, with no backend.
- **Not yet used:** Hermes's vision and image-generation models. Pictures are inline SVG and nobody reviews the result visually. A vision "reviewer" slot is planned alongside a look-and-fix pass.

## License

Apache-2.0
