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

## After the run

- Tell the person what was built in a sentence or two (theme name, the pages), and point them at the canvas: clicking a linked button on any page flies to the page it links to.
- `plan.json` in the run folder holds the theme, pages and every section's copy; use it if they want a real app built from the design (for example with an app builder that takes a page spec).
- If a section failed, say which; running again with the same brief gives a fresh design rather than a fix.
