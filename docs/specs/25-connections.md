# 25. Settings: one place for accounts, models, connections and where data goes

Status: **proposal, nothing built** (2026-11-11). It replaces the Connections panel of
[spec 6](06-onboarding.md), which was never built and predates [docs/ux/RULES.md](../ux/RULES.md).

## What the owner asked for (2026-11-11)

> i dont see the config and connectors or settings here so i can connect everything from one place ... to make
> all the capabilities possible as well as button to get it scripted directed from hermes or let hermes handle
> the connections and choose gateways and oauth to stripe or google oauth or whatever

> we should be honest about what data goes to public and what doesnt as well, like the connectors only public
> while only data related to their publishing goes to swarm feed the social platform/ website

Three things: **one screen** that lists everything a build can need and whether it is connected; for each, **one
action**, with Hermes doing the connecting where it can and a command to run it from Hermes; and **plain
statements of where data goes**.

## What exists today, and where it is scattered

Every row below already has a server endpoint. None of them is reachable from one place, and two have no screen
at all.

| Thing | Where it is today | Endpoint | State kept in |
|---|---|---|---|
| Models (planner, builders, reviewer), Lite | ☰ → Models; Projects user menu → Models; `/swarm models` | `GET/POST /api/models` | `models.json` (names only); keys come from Hermes's model slots |
| Pictures (Hermes image logins, ckff), idle video model | the same Models panel; `/swarm images` | `/api/models` (`image`, `idle`) | `models.json` |
| Music, clips, film pictures (ElevenLabs, FAL) | ☰ → Video panel, the source chips | `GET /api/media`, `POST /api/media/key`, `/api/media/allow` | `media-keys.json` (mode 0600) |
| Publishing: GitHub Pages, Vercel, Cloudflare Pages, Octo vault grant | Publish menu, a token form per host | `GET /api/publish`, `POST /api/connect` | `connections.json` (mode 0600); GitHub is the `gh` login |
| Supabase (apps' data and sign-in) | **no screen**: `renderConnectors()` draws into `.auto-conn`, which left with the Auto dialog | `GET /api/connectors`, `POST /api/connectors/connect`, `/cancel` | Hermes's MCP sign-in; `plugins.entries.swarm-studio.mcp_allowlist` |
| Swarm Feed account | **no screen**: connects silently on the first Post to Feed; `/swarm connect`, `/swarm login` | `GET /api/me`, `POST /api/feed/connect` | `feed.json` (mode 0600) |
| 3D models (Meshy) | the game Cast step | `GET /api/meshy` | env `MESHY_API_KEY` |
| Gateways (Discord, Slack, Telegram through Hermes) | Launch kit | `GET /api/gateway` | Hermes |
| Stand-in photos (Pexels, Octo, Openverse) | nowhere | none | env |
| Stripe test key, Supabase service key | nowhere | none | env |

Found while reading, and part of why "nothing says which account you are on": the plugin connects to the Feed
as an auto-named install (for example "Topaz Toucan", identity "Hermes on <computer name>"). `/api/me` returns
the name and handle but not whether it is a signed-in account, and no control offers sign-in.

## The screen

**Settings**, opened from the Projects user menu (the avatar, bottom left), where Theme, Sound and Models already
are. It follows iOS Settings, as [PATTERNS.md](../ux/PATTERNS.md) assigns for Me › Settings: grouped lists, one
level per tap. It is a sheet (rule 18: ×, Esc, click outside). Not shown in the hosted studio.

Layer 1, four rows, each a name and one state (rule 3: four choices; rule 12: states, not prose):

| Row | State at rest | Opens |
|---|---|---|
| **You** | the Feed name, or "Not signed in" | the Feed account |
| **Crew** | "3 of 3" models set; a ⚠ when a pick cannot run | Models, Pictures, Film sound and clips, Stand-in photos, 3D |
| **Publish** | "2 of 5" connected | Sites (GitHub Pages, Vercel, Cloudflare), Apps (Supabase, Stripe), Gateways |
| **Data** | none | where data goes (below) |

Layer 2 is a list of connections: a name and a dot (connected, not connected, ⚠ broken), nothing else.
Layer 3 is one connection: who is connected (an account name, never a key), one primary action, and one
"Goes to" value.

Text budget (rule 30): layer 1 is 4 names and 3 states; a connection is a name, an account, one or two buttons
and the "Goes to" value. No helper sentences.

Models, the publish token forms and the media keys **move** here (rule 4: one place per control). Their old
places keep a link, not a copy: ☰ → Models and the user menu's Models open Settings › Crew; a Publish host that
is not connected opens Settings › Publish on that host.

## The actions

One primary action per connection (rule 17), chosen by what the connection supports, in this order:

1. **Let Hermes connect.** Hermes runs it and keeps the secret: `hermes mcp install` + `hermes mcp login` for a
   connector (real today for Supabase), `hermes auth add swarm-studio:<id>` for an OAuth client declared under
   `oauth:` in `plugin.yaml`, Hermes's secret store for a key. The plugin never sees the token. This is also
   what catalog rule 11 requires.
2. **Connect.** The flow that exists today where Hermes has no route yet: a token checked with the provider
   (Vercel, Cloudflare), a pasted key (ElevenLabs, FAL), the Octo vault grant.
3. **Copy command.** The same connection as one line to run from Hermes, for people who script their setup:
   `/swarm connect`, `/swarm login`, `hermes mcp login supabase`, `gh auth login`. A new `/swarm setup` prints
   every connection's state and runs the missing ones in order.
4. **Disconnect**, once connected. It removes the plugin's access and says so with the dot, not a sentence.

Paid things keep the standing rule of [the spec index](README.md): nothing that costs money connects or spends
without the person (Meshy credits, a live Stripe key is refused).

## Where data goes

The **Data** row opens one table. These are the statements, written from what the code does (README, "What it
does on your machine"):

| What | Where it goes |
|---|---|
| Your builds, settings, keys and tokens | Stay on this computer (`$HERMES_HOME/swarm-studio/`, key files mode 0600) or with Hermes |
| Your prompt, the plan, page screenshots for review | The model provider you picked in Hermes |
| Picture and clip prompts | The image and video provider you picked |
| Words from a picture prompt | Pexels (with a key) and Openverse, to find a stand-in photo; the photos themselves load from files.design-bakery.com |
| The canvas page | Loads Tailwind from cdn.tailwindcss.com and fonts from Google Fonts |
| A site or app you publish | The host you connected (GitHub Pages makes a public repo); app data goes to your own Supabase |
| Swarm Feed, when you connect | An install id and "Hermes on <computer name>" |
| Swarm Feed, when you post | That build only: title, brief, link, page names, crew, poster, caption and its export |
| Everything else | Nowhere. No telemetry |

Each connection's "Goes to" value is its line from this table, so the honesty is on the row, not only in a table.

## What is real today and what needs building

| Slice | What | Needs | Size |
|---|---|---|---|
| 1 (built: `web/settings.js`) | **Read-only Settings**: the four rows, every connection's dot and account, the Data table. No new server code: it reads `/api/me`, `/api/models`, `/api/media`, `/api/publish`, `/api/connectors`, `/api/meshy`, `/api/gateway` | web only | ½ day |
| 2 | **Move the existing actions in**: model pickers, publish token forms, media keys, and the Supabase connector (its UI is orphaned today). Old places become links | web only | ½ day |
| 3 | **Missing status**: Feed account (connected, guest or signed in, Sign in, Disconnect), stand-in sources, Stripe test key, Supabase key, which route each model key came from | new endpoints, `feed.py` | ½ day |
| 4 | **Let Hermes connect + Copy command**: `/swarm setup`, a command per row, connectors beyond Supabase (Stripe and Vercel through Hermes's connectors) | `commands.py`, `engine/hermes_connect.mjs` | 1 day |
| 5 | **Secrets through Hermes only** (below) | `plugin.yaml`, `launcher.py`, engine | ½–1 day |

Not real today, and not promised by this spec: **Google sign-in for generated apps**. Apps sign people in with
Supabase Auth or a labelled guest pass, and the build prompts forbid a provider button that is not configured.
Google sign-in means a Google OAuth client set up in the person's own Supabase project; it needs its own design.

## Catalog rule 11: three things to fix before the next pin

> Fixed (PR secrets-through-hermes): the engine reads no `.env` file, `launcher.py` hands the keys over from
> Hermes's secret scope, and `plugin.yaml` declares them. What follows is the state the spec found.

Rule 11 of the Hermes plugin catalog: a plugin gets secrets only through Hermes's routes and never reads `.env`
files or other credential stores. Today:

- `engine/ckff.mjs` reads `~/Documents/projects/.env` when `CKFF_API_KEY` is not in the environment. That is a
  personal path in a public plugin, and a credential file read.
- `engine/auto.mjs` `hermesKey` reads `~/.hermes/.env` directly (Supabase, Stripe, Pexels keys).
- `plugin.yaml` declares only `SWARM_STUDIO_API_KEY` and `ELEVENLABS_API_KEY`. The other keys the engine uses
  (`FAL_KEY`, `PEXELS_API_KEY`, `MESHY_API_KEY`, `CKFF_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN`) are undeclared.

Rule 13 (disclosure) has one gap too: the README's network list does not mention stand-in photos (the searches
on Pexels and Openverse, and the photo files on files.design-bakery.com). It goes in the README with slice 1.

Slice 5: declare them as optional secrets, have `launcher.py` read them with `get_secret` and pass them to the
server (as it does for ElevenLabs), and delete both file reads. Pasted tokens in `connections.json` and
`media-keys.json` stay disclosed (rule 13) until Hermes has a route for them.

## Done when

- [ ] One Settings sheet opens from the Projects user menu and shows every connection in the table above with its state.
- [ ] No connect control exists in two places; ☰, Publish and the Video panel link to Settings.
- [ ] The Feed row says which account this is and offers Sign in and Disconnect.
- [ ] Every connection has one primary action, and a command that does the same from Hermes.
- [ ] The Data table matches the README's "What it does on your machine", and each connection shows its line.
- [ ] `hermes plugins validate` passes and no file under the plugin reads a `.env` file.
- [ ] `docs/ux/SITEMAP.md` section 7 and `INVENTORY.md` are updated in the PR that ships each slice; light and dark, 1280 and 390.
