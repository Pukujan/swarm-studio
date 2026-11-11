# 13. The hosted studio: try Swarm Studio in the browser, no install

Anyone (hackathon judges first) opens `https://swarm.design-bakery.com/studio/app/` and runs a
real build with a small crew on the canvas. The owner chose **guest limit + cheap model**: a few builds a day per
guest, a fast cheap model, a hard daily spending cap on the server, and "install the plugin or bring your own key for
more" everywhere a limit is hit.

## What runs without Hermes

The studio server (`server/server.mjs`) and the engine (`engine/run.mjs`, `engine/llm.mjs`) are plain Node with no
dependencies. Hermes only supplies:

- **models and keys** (`launcher.py` sends the planner/worker endpoints with each run): the hosted server reads them
  from its own environment instead;
- **image providers** (`imagegen.py` runs in Hermes's Python): off in the hosted studio (no pictures, sections use
  gradients and icons, as with no image model today);
- **connectors, the gateway, Auto, apps, video, publishing to GitHub/Vercel**: all off in the hosted studio.

What needs a model: the **sitemap planner**, the **page planners** and the **section workers** (`runSwarm`), and the
comment router and section rewrite (`routeComment`, `fixSection`) if comments are on.

`server.mjs` is single-user by design: one `current` run, every event broadcast to every canvas, one token for
everything. So the hosted studio is a **separate, small server**, `server/hosted.mjs`, that reuses the engine and the
canvas page but owns its own routes:

| Route | What |
|---|---|
| `GET /` | The canvas page with `SWARM.hosted` (limits, the guest) and `SWARM.base` (`/studio/app`) in its boot block |
| `POST /api/guest` | Local testing only (no Feed): set the guest name and mint the studio's own cookie |
| `GET /api/state` | The guest, builds left today, whether the studio is open (cap not hit) |
| `POST /api/run` | Start a build, after every limit below passes |
| `GET /events` | Server-sent events for **this guest's** runs only |
| `GET /api/runs`, `GET /api/runs/:id/events` | The guest's own runs (any run by id is readable: builds are public, like the Feed) |
| `POST /api/runs/:id/edit`, `/restore` | Design-panel edits (no model) on the guest's own runs |
| `POST /api/runs/:id/site` | Export the finished build, serve it at `/site/<run>/` and return the Feed card for it |
| `GET /site/:id/` | The exported site, sandboxed (`content-security-policy: sandbox allow-scripts …`) |
| `GET /healthz` | Health check for the container |
| everything else under `/api/` | `403 {"error":"install"}`: the canvas says "this needs the plugin" |

The canvas gets one change for this: `api()`, the event stream and `/api/state` prefix `SWARM.base`, and
`body.hosted` hides what the hosted studio can't do (Video, App, Auto, Game, Publish, Review, Models, the model picker,
agents over the guest limit) and shows a guest bar: the name, builds left, and **Install the plugin** as the way to more.

## The model

InferHub `cb/deepseek-v4.1-flash` for both planner and workers. It was the fastest in our bench (time to first token
~1.6 s, ~210 tokens/s, `bench/results`) and is already the studio's default, and it is one of the cheapest:
list price $0.15 per million input tokens and $0.60 per million output (InferHub sells below that). The cap counts
at the **list price**, so real spend stays under it. A guest build (6 agents, 2 pages, ≤6 sections a page) is about
30k input + 20k output tokens, roughly **$0.02**.

No OpenRouter key exists on the dev Mac, so InferHub it is. The key goes only into the VPS env file
`~/apps/swarm-studio.env` as `SWARM_API_KEY`; models are set by name (`SWARM_PLANNER_MODEL`, `SWARM_WORKER_MODEL`).

## Guests and limits

Identity **is** the Feed's guest session (swarm-feed `docs/data-model.md`): the Feed's `swarm_feed_viewer` cookie
(HttpOnly, SameSite=Lax, Path=/), which the studio receives because `swarm-feed-web` serves it on the same origin.
The studio never reads the Feed's data: it asks `GET /api/feed/whoami` on `swarm-feed-web:8080` with the visitor's
cookie and keys every per-guest limit on the Feed user id (cached 30 s). The canvas sets the name through the Feed
(`GET /api/feed/me` creates the guest and prefills its generated name, `POST /api/feed/me {name}` sets it).
A build never waits for a name: the generated one is enough, and the name dialog opens once, the first time the
guest posts to the Feed. A prompt handed over as `?prompt=` (START on the Feed's `/studio` page) starts its build
at once and leaves the address, so a reload does not spend another build. So one
guest has one name across the Feed and the studio, and connecting Hermes later keeps the same id and credit.
The studio's own state is one file, `hosted-state.json` (today's spend, builds per guest and per IP).

All limits are environment settings with these defaults:

| Limit | Default | Env |
|---|---|---|
| Builds per guest per day (UTC) | 3 | `HOSTED_GUEST_BUILDS` |
| Builds per IP per day | 6 | `HOSTED_IP_BUILDS` |
| Builds running at once, one guest | 1 | — |
| Builds running at once, whole studio | 4 | `HOSTED_CONCURRENT` |
| Crew size | 6 agents | `HOSTED_AGENTS` |
| Pages per build | 2 | `HOSTED_PAGES` |
| Sections per page | 6 | `HOSTED_SECTIONS` |
| Prompt length | 500 characters | `HOSTED_PROMPT_CHARS` |
| API requests per IP | 60 a minute | `HOSTED_RPM` |
| **Spend per day, whole studio** | **$3.00** at list price | `HOSTED_DAILY_USD` |

Every model call reports its token usage (`streamChat` calls `provider.onUsage`); the server adds it to today's
ledger (`hosted-state.json`). When the ledger reaches the cap, running builds are stopped, new ones are refused, and the
canvas shows **"The hosted studio is done for today. Come back tomorrow, or install the plugin and use your own
model."** The IP is the `cf-connecting-ip` header from Cloudflare (falling back to `x-forwarded-for`).

## Posting to the Feed

A finished guest build can be posted to the Feed, a few a day (`HOSTED_GUEST_POSTS`, 3). The canvas makes the
poster (`snapFrame` of the first page, as the Files list does) and asks the studio for the site
(`POST /api/runs/:id/site`, owner only), which exports it and serves it at `/studio/app/site/<run>/`. Then the canvas
posts the card itself to `POST /api/feed/builds`, same-origin with the guest's cookie (swarm-feed accepts that since
the hosted-studio PR). The build's owner and maker credit is the guest's own user id, not a shared studio account.

## Deploy

- Repo `Pukujan/swarm-studio`, `Dockerfile.hosted` and `deploy/vps/` (compose + `autodeploy.sh`), modelled on
  swarm-feed: a Komodo `[[repo]]` + `[[stack]]` + `swarm-studio-deploy-on-push` action (server-management
  `komodo/resources/swarm-studio.toml`), building `swarm-studio:<sha12>` and rolling back on a failed health check.
- Container `swarm-studio-web` (port 8080 inside, `127.0.0.1:18096` on the host) on `study-os_edge`. No new DNS or
  tunnel route: `swarm-feed-web` proxies `/studio/app/**` to `http://swarm-studio-web:8080/**`.
- Runs and the ledger live in the volume `swarm-studio-data`. Runs older than 7 days are removed.

## Done when

- `swarm.design-bakery.com/studio` has **Try it here** as its first action, opening the hosted studio with the prompt.
- On the live site: build, watch the crew on the canvas, get finished pages, play them, post to
  the Feed, and the fourth build of the day says the limit and points to the plugin.
