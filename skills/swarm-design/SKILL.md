---
name: swarm-design
description: Design and build a multi-page website fast with a swarm of agents on a live canvas (Swarm Studio), then turn it into a working full-stack app, a promo video, a live deploy, or build an original browser game from a short interview. Use when someone asks for a website, landing page, web app, page mockups, a game, or wants to watch a design come together live.
---

# Swarm Design

Swarm Studio plans a 4-page website from one brief and builds every section in parallel: a planner picks the theme and pages, then a swarm of agents streams each section as HTML + Tailwind on a shared canvas, with links wired between pages into a clickable prototype. A run takes about 30 to 60 seconds.

## When to use it

- A request for a website, landing page, product site, or several pages of mockups.
- Someone wants to see options quickly, or watch the build happen (a demo, a pitch).
- A working app from a design (forms that save, server routes, an admin page), or a playable browser game.
- Not for editing an existing codebase's components: it produces its own projects, not changes to your repo.

## Write a good brief

The brief is the only thing the swarm sees. One or two sentences, with:

1. The product name and what it is.
2. Who it is for.
3. The three or four things a visitor must be able to do or learn (these become pages).
4. A mood, if the person gave one ("calm", "loud and playful", "editorial").

Good: `Driftwood — a booking app for surf schools: lessons, board rentals, instructor schedules, tide-aware session times. Warm, sun-bleached, relaxed.`
Weak: `a surf website`.

Don't invent facts the person didn't give (prices, addresses, team names); the planner writes believable copy on its own.

## Run it

- Call `swarm_design` with `brief` (and `agents`, 8 to 24, default 16). It waits for the build and returns a summary: pages, layers built, time, and where the plan was saved.
- Pass `wait: false` to return at once with the canvas URL, when the person wants to watch.
- In Hermes Desktop the **swarm** pane shows the canvas live; elsewhere give the person the URL from the result (it only opens on this computer).
- The person can also type `/swarm <brief>` or run `hermes swarm "<brief>"` themselves.

## Everything else: the `swarm_studio` tool

Call `swarm_studio` with an `action` (the person can type the same as `/swarm <action>`):

- `files`: recent builds, numbered (1 = latest). `open` with `build` shows one on the canvas; `play` opens it as a clickable prototype, with motion: each section's headings, copy, pictures and cards rise in one after another as they scroll into view, buttons lift under the pointer, and bold or playful themes move quicker and springier (the ✨ Motion button or the M key turns it off). Exports keep the same motion.
- `review`: a vision model photographs every page, names up to 3 problems per page, and agents rewrite those sections live. Use it when the person asks to check, polish or fix a design. It runs on the open canvas, so the canvas must be open.
- `fix` with `text`: the person's comment on the design ("make the hero darker", "the footer is too tall") goes to an agent, who rewrites that section live. On the open canvas a selected section is the one changed; otherwise the planner works out which sections the comment is about. Use it whenever the person asks for a change to a build instead of starting a new one.
- `export`: writes the build as files under `runs/<id>/export/<name>/` and a zip, with a copy of the zip in `~/Documents/Swarm Studio/<build> · <date>/` (`<name>-v1.zip`, `-v2`…): `html/` (static pages), `react/` (Vite + React + Tailwind, one component per section, builds as is) and `aba/` (`spec.md` and `blueprint.json` for an app builder such as ABA). Use it when the person wants the code, wants to deploy, or wants a real app built from the design.
- `publish`: puts the site online and returns the link. By default it goes to GitHub Pages through the person's `gh` login (a public repo per site, live in about a minute; publishing again updates it). `target: "vercel"` or `"cloudflare"` deploys to the person's own account once they have connected it (🌐 Publish on the canvas → Connect, with an access token; never ask them to paste a token into chat). `target: "local"` hosts it on this computer, and it falls back to that if a host fails. `hosts` shows where they are signed in. Use it when the person wants a link to share or to see the site live.
- `files` / `info`: `files` lists builds, or searches them when `text` is set (every field: name, brief, theme, pages, tags, folder, live URL; `tag:x`, `folder:x`, `on:vercel`, `has:video` narrow it). `info` gives one build's details: dates, theme, models, pages, live links, video, tags and note.
- `folders` / `folder`: `folders` lists the person's folders and what is in each; `folder` with `build` and `text` (a folder name, or `none`) files a build there, making the folder if it is new.
- `trace`: every model call made for a build (the planner, each builder, the reviewer, comment fixes, tours, the video storyboard), with agent, page, section, time and tokens. `text` filters it (a section id, page, agent or kind such as `fix`), `call <id>` returns one call in full (the instructions, the request and the raw answer), `on`/`off` turns recording on or off for that build. Use it when a section came out wrong or a fix did something unexpected: read the call before guessing.
- `video`: cuts a video of a build (default the latest; `build` picks another). `style`: promo (default), kinetic (type-led, fast), slideshow (every picture, calm), teaser (4 scenes, holds back), story (a customer's point of view); `transition`: wipe, fade, zoom, slide or flash (default fits the style); `text`: the person's own idea for it. The planner writes a storyboard and a voiceover from the site's own copy and generated photos, Kokoro reads it locally over a music bed (`voice`: af_heart, af_bella, am_michael, bf_emma, bm_george or off; `music: false` for none), and HyperFrames renders it in the site's theme to `runs/<id>/video/promo.mp4`, copied to `~/Movies/Swarm Studio/<build> · <date>/<name>-promo-v1.mp4` (each new cut is the next version) (`~/Videos` on Linux and Windows; `SWARM_OUTPUT_DIR` puts both elsewhere) (about a minute; the first video also fetches HyperFrames and ffmpeg from npm). The tool waits and returns the file path; the canvas shows the storyboard, the render and the player.
- `models`: show which model plans, builds and reviews; with `role` and `model` change one (`reset` goes back to Hermes's setting, `off` turns the reviewer off).
- `images`: generated photos come from Hermes's image providers, by default the person's Codex login (`gpt-image-2-low`). `provider: "off"` for shapes and SVG only. Each image uses that provider's quota.
- `motion` with `value` `on`/`off`: the prototype's scroll-in reveals and hover lifts.
- `lite`: `on` for machines short on memory (one live page at a time).

## Apps and games

- `app`: turns a build into a working app (React + shadcn/ui, Vite, Nitro server routes): forms save through server routes, lists come from them, an `/admin` page shows what was saved. With `text`, one more change to the app ("add a waitlist", "make checkout ask for a date"). It waits until the app runs and returns its local URL; the App tab shows each step, a live preview and the code. Each change is a git commit in `runs/<id>/app/`. The first app build installs the engine once (a few minutes, about 1.5 GB).
- `deploy`: puts the app on the person's Vercel account (connected in 🌐 Publish), server routes included.
- Games: run the interview in chat. Call `game_questions`, then ask the person one question at a time, offering the chips as choices and keeping their own words; stop early if they say "just build it" (the rest get defaults). Then call `game` with `answers` (by question id) and `text` (their idea). It writes a spec and builds the game in the App tab. If they name a game they like, it only takes the genre and feel: the world, hero, enemies and names are always new. Never promise a copy of an existing game. On the canvas, 🎮 Game runs the same interview.

## After the run

- Tell the person what was built in a sentence or two (theme name, the pages), and point them at the canvas: clicking a linked button on any page flies to the page it links to.
- If they want to share it, run `publish` and give them the link.
- If they want a real app built from the design, run `export`: `aba/spec.md` is written for an app builder, and `react/` is the design as components.
- If a section failed, say which; running again with the same brief gives a fresh design rather than a fix.
