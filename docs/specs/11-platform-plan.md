# 11. The platform plan: Swarm Feed on Kresilo, Swarm Studio as the studio

## The shape

- **Swarm Feed: the home and the community.** It's built from the owner's Kresilo project, so it starts with feed, boards, events, competitions, people pages and its MCP server already done.
- **Swarm Studio: the studio.** This is the Hermes plugin and the hackathon entry: the canvas, the crew, Auto, the packs and deploy. It must stay complete by itself, because judges install and score the plugin.
- **The adapter is MCP.** Hermes connects to the Feed's MCP server with `hermes mcp install swarm-feed`, the same way it connects to Supabase today (spec in PR #49). Post and Remix are MCP tool calls. Every build and remix runs on the person's own Hermes, with their own models and connections.

```
 Swarm Feed (web)                        Hermes on the person's machine
 ┌──────────────────────────┐   MCP     ┌─────────────────────────────┐
 │ feed · boards · events   │◄─────────►│ Swarm Studio plugin         │
 │ competitions · people    │ publish   │ canvas · crew · Auto · packs│
 │ live build cards (Try)   │ remix     │ deploy (Vercel, Supabase)   │
 └──────────────────────────┘           └─────────────────────────────┘
```

## What Kresilo already has (checked on 2026-11-09)

- **Routes:** `/feed`, `/boards`, `/boards/:id`, `/join/:token`, `/events` (with new and edit), `/competitions` (with new and edit), `/people/:id`, `/templates`, `/studio/:id`, `/embed/:id`.
- **MCP tools:** `list_works`, `list_projects`, `get_project`, `create_project`, `add_reference`, `comment`, `invite_project`, and others.
- **Stack:** Vite, React, shadcn and Tailwind. The theme is shadcn CSS variables in `src/globals.css`, so a reskin is mostly one token block plus the fonts.
- **Live:** kresilo.design-bakery.com on the VPS (`kresilo.service`, port 4390).
- **Not yet:**
  - boards and comments for real users need migrations 006–010, which are written but not applied;
  - its storage is the Octo `kresilo_demo` schema, which Kresilo's rules say must not be duplicated.

## Fork, don't reskin in place (recommended)

- Kresilo keeps its own brand, its live site, its founders' review, and its process with issues, checkpoints and receipts.
- **Swarm Feed** is a fork in `pukujan-lab-2/swarm-feed`.
  - **Storage:** it uses the free `swarm-studio` Supabase project that the connector already makes, not Octo, so Kresilo's database rule isn't touched.
  - **Process:** a light one: task branch, PR, CI, merge.
- **Hosting:** the VPS through Komodo, like the other sites, on a new hostname (for example `feed.design-bakery.com`). Adding the hostname and the tunnel route is a production change that the owner approves once.

## What changes in the fork

| Area | Change |
|---|---|
| Look | The Hermes space tokens from spec 08 go into the shadcn variables in `globals.css`: void background, Hermes blue frame and primary, yellow accent, the free fonts, the starfield. Hermia's logo and the "Built for Hermes Agent" footer. |
| Feed | `/` becomes the swipe feed from spec 10: one card per screen, the action column, and one live card at a time. The current grid stays as Browse. |
| Build cards | A new work kind, `build`: poster, live URL, kind (site, app or game), maker, build time, agent count, parent build. **Try** runs it in a sandboxed iframe on a separate sandbox origin. |
| Studio | For builds, Kresilo's poster studio is replaced by **Open in Swarm Studio**. It opens a `hermes://` link, or shows `/swarm remix <id>` to copy. Kresilo's studio stays for image works. |
| References | Kresilo's references with a reason feed the planner. **Build from this board** sends the board's references to Swarm Studio. |
| Competitions | They are reused as **Swarm Jams**: a theme, a timer, entries as build cards, and voting with likes. For the demo, one jam is seeded: "Hermes Jam #1". |
| Credits | Only the labelled $2 demo checkout. Real billing is later, after review. |
| New MCP tools | `publish_build` (the metadata plus the export bundle and the poster), `get_build_bundle` (for a remix), `list_builds`, and `save_reference`. |

## What changes in the plugin

- A **Connections** row for Swarm Feed: `hermes mcp install` and sign-in, the same flow as Supabase.
- **Post to Feed** in the Publish menu and on Auto's final card, which calls `publish_build`.
- **`/swarm remix <id>`**, which calls `get_build_bundle`, imports it as a new run with its parent recorded, and opens the canvas.
- The packs (spec 09) and the Swarm Wall. The four wall builds become the first cards in the feed.

## Schedule to the deadline (2026-11-11, 17:00 EST)

| When | Plugin (Swarm Studio) | Site (Swarm Feed) |
|---|---|---|
| **Sun 9 Nov, evening** | Spec 01 big game mode | Fork, the Supabase tables, the reskin tokens and fonts |
| **Mon 10 Nov** | Packs and the Make / Pro switch (spec 09), the Swarm Wall view, Post to Feed and remix | The swipe feed and build cards with Try, the 4 MCP tools, deploy to the new hostname |
| **Tue 11 Nov, morning** | Tidebreak run (spec 02), the wall dry run, then seed the feed with real builds | The Hermes Jam #1 seed, a pass at 390 px |
| **Tue 11 Nov, by 15:00** | Record and cut the video, make the repo public, the catalog PR | — |
| **Cut if late** | Onboarding (06), 3D (04), the launch kit part of 07 | Boards for real users, comments |

The look work from specs 05 and 08 is shared: we make one token set and use it in both the plugin's `canvas.css` and the fork's `globals.css`.

## Demo video order

1. **Make:** one prompt, the crew builds Tidebreak, and it goes live.
2. **Pro:** the Swarm Wall, with four packs and four markets at once.
3. **The Feed:** swipe, Try, Remix, and the remix comes back with credit.
4. **Vision:** boards, Swarm Jams and credits, labelled "next" except the parts that are live.

## Honesty

- The README says the Feed is built on the owner's earlier Kresilo project.
- Any part that isn't live is labelled "next".
