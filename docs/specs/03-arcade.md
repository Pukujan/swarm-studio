# 5. Swarm Arcade: publish, browse, play, remix

## Problem

Each build lives on the machine of the person who made it, plus its own Vercel link. Nobody can find other people's builds, play them, or build on them.

## What we build

### 1. Share to Arcade (in the studio)
- A **🌐 Share to Arcade** item in the Publish menu.
- **What it sends:**
  - the title, the prompt and the kind (site, app or game);
  - the agent count and the build time;
  - a thumbnail: the home page snapshot, which we already make;
  - the publish target, see below;
  - a **remix bundle**: the existing export zip (plan, pages, images and the app source, without `node_modules`).
- **Where it publishes:**
  - **Static builds** (designed pages, and games that need no server): the Arcade hosts the export at `https://<sandbox-domain>/b/<slug>/`. No Vercel account is needed.
  - **Apps with a backend** (checkout, sign-ups, score routes): the build goes to the author's own Vercel. If it isn't deployed yet, Share deploys it first with their Vercel login, then lists the live link. Their data stays in their own Supabase.
- **Updates:** publishing again replaces the live version and keeps the same link and slug.
- **Unpublish:** removes the listing and the hosted copy.
- **Sign-in:** Share needs an Arcade sign-in (GitHub OAuth). The plugin stores the Arcade token in its data dir, never in the canvas.

### 2. The Arcade site
- **Grid:** cards with the thumbnail, title, kind, prompt (shortened), build time, likes, plays and remixes. It filters by Games / Sites / Apps and sorts by New / Top this week / Most remixed.
- **Card page:**
  - The build in a **sandboxed iframe**: `sandbox="allow-scripts allow-pointer-lock"`, on the sandbox domain, never the Arcade's own domain.
  - The full prompt, a "made with Swarm Studio in 9m 12s by 16 agents" line, a like button and a report button.
  - For a game: the leaderboard (read from the build's `/api/scores`, or from a shared Arcade score table for static games).
- **Remix:** a **Remix** button gives the command `/swarm remix <id>` (or a `hermes://` link). It downloads the bundle into the person's own Swarm Studio as a new run, records which build it came from, and opens it on the canvas. A remix gets its own new slug when it is published.
- **Lineage:** the card page shows "remixed from X" and "remixes of this".

### 3. Hermes commands
- `/swarm arcade`: the top builds this week, as links.
- `/swarm remix <id>`: imports a build.
- `/swarm share`: shares the current run.

## Architecture

- **Arcade API and site:** one small Node service on the **VPS**, deployed GitHub → Komodo like the other services, with its own repo or folder. It's added to `vps/services.toml` so `warm` can keep it awake.
- **Data:** Supabase tables:
  - `arcade_builds` (id, slug, owner, title, kind, prompt, thumb_url, live_url, bundle_url, parent_id, created_at, updated_at, hidden);
  - `arcade_likes`, `arcade_plays`, `arcade_scores` and `arcade_reports`.
- **Files:** hosted exports and bundles go on R2 or Supabase Storage, under the sandbox domain. Each upload is capped at 50 MB.
- **Safety:**
  - Only an exported static bundle can be hosted, never server code.
  - Builds are served from a separate domain with a strict CSP.
  - Reports and an admin "hide" switch handle bad builds, with rate limits on Share.
  - The remix bundle is checked on import: paths are kept inside the run folder, there are no symlinks, and executables are refused.

## Done when

- [ ] Share to Arcade publishes a static game and an app (Vercel). Both appear in the grid within 10 s.
- [ ] The card page plays the game in the sandbox, and its leaderboard works.
- [ ] Remix brings the build into a fresh Swarm Studio on another `HERMES_HOME`. It opens on the canvas and can be published again as a remix.
- [ ] Unpublish removes it, and a report hides it once an admin acts on the report.
- [ ] The Arcade is seeded with 10 or more of our own builds (Tidebreak, the comic con, Kona Skies…) for the demo.

## Out of scope for the hackathon

- Comments, follows, payments to authors, a full moderation queue.
