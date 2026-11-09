---
name: swarm-design
description: Design and build a multi-page website fast with a swarm of agents on a live canvas (Swarm Studio). Use when someone asks for a website, landing page, marketing site or page mockups, or wants to watch a design come together live.
---

# Swarm Design

Swarm Studio plans a 4-page website from one brief and builds every section in parallel: a planner picks the theme and pages, then a swarm of agents streams each section as HTML + Tailwind on a shared canvas, with links wired between pages into a clickable prototype. A run takes about 30 to 60 seconds.

## When to use it

- A request for a website, landing page, product site, or several pages of mockups.
- Someone wants to see options quickly, or watch the build happen (a demo, a pitch).
- Not for editing an existing codebase's components: it produces standalone pages, not changes to a repo.

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
- `export`: writes the build as files under `runs/<id>/export/<name>/` and a zip: `html/` (static pages), `react/` (Vite + React + Tailwind, one component per section, builds as is) and `aba/` (`spec.md` and `blueprint.json` for an app builder such as ABA). Use it when the person wants the code, wants to deploy, or wants a real app built from the design.
- `video`: cuts a ~20-second promo video of a build (default the latest; `build` picks another). The planner writes a storyboard from the site's own copy and generated photos, and HyperFrames renders it in the site's theme to `runs/<id>/video/promo.mp4` (about a minute; the first video also fetches HyperFrames and ffmpeg from npm). The tool waits and returns the file path; the canvas shows the storyboard, the render and the player.
- `models`: show which model plans, builds and reviews; with `role` and `model` change one (`reset` goes back to Hermes's setting, `off` turns the reviewer off).
- `images`: generated photos come from Hermes's image providers, by default the person's Codex login (`gpt-image-2-low`). `provider: "off"` for shapes and SVG only. Each image uses that provider's quota.
- `motion` with `value` `on`/`off`: the prototype's scroll-in reveals and hover lifts.
- `lite`: `on` for machines short on memory (one live page at a time).

## After the run

- Tell the person what was built in a sentence or two (theme name, the pages), and point them at the canvas: clicking a linked button on any page flies to the page it links to.
- If they want a real app built from the design, run `export`: `aba/spec.md` is written for an app builder, and `react/` is the design as components.
- If a section failed, say which; running again with the same brief gives a fresh design rather than a fix.
