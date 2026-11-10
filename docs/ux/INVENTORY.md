# Controls: what we have and where each one goes

The full fact sheet, with every control and its file:line, is
[inventory-raw-2026-11-09.md](inventory-raw-2026-11-09.md). This file is the reasoning layer on top of it: where
each control should live in the tree of [SITEMAP.md](SITEMAP.md) and the lenses of [AUDIENCE.md](AUDIENCE.md).
Update both when you add, move or remove a control.

Status: **proposal for the owner to discuss** (2026-11-09).

## What we have today

| | Count |
|---|---|
| User-facing controls | about 400 |
| Ways to start a build or a job | 31 |
| Places to type an instruction | 11 (plus 20 slash commands) |
| Groups of duplicate controls | 24 |
| Helper sentences visible by default | 75 |
| Separate progress displays | 10 |
| Views with no way back to the galaxy | 2 (Classic view; the Wall) |

The worst cases:

- **Game** can be started 5 ways (top bar Game, More → Game, `/game`, the App empty state, a Hermes command), and
  each opens a 7-step wizard.
- **Video** has 6 entry points, **App** has 5, the **canvas** has 4, and **Play** has 5.
- **Stop** means three different things (stop the app, stop Auto, stop the visitor tour) under one label.
- **Progress** shows in the status strip, chat, agent count, timer, Auto meter, sun, planets, stations, tab
  badges and file rows, all at the same time.
- **Classic view** is a trap: once it's on, the only control that turns it off is hidden.

## Changed since the inventory

Controls added, moved or removed after the 2026-11-09 snapshot. The raw inventory stays as it was taken.

| When | Control | Change | Layer, lens |
|---|---|---|---|
| PR flow-calm | Sound: crew sound button (#crew-mute) | **Changed**: a click opens its popover, Crew sound (On / Muted / Quiet) and Volume; M still steps the modes. It keeps one width in every mode, and quiet swaps its icon instead of adding one. No second sound button | edge icon on every layer, all lenses |
| PR flow-calm | Chatter dock (.sd-toggle, .sd-vol, bottom-left) | **Removed**: its on/off is the crew sound mode, its volume is in the crew button's popover | — |
| PR flow-calm | Recentre (.gx-recentre on the galaxy, .ob-recentre in orbit) | **Added**, not at rest: appears only after you drag or zoom (rule 22), away from the nav and the primary button | 0 Galaxy, 2 Orbit, all lenses |
| PR flow-calm | Logo (.topbar .brand) | **Moved** from decoration to a control: goes to the galaxy from every view, Classic view included (rule 7). In orbit and rooms only its mark shows, beside Back | edge, every layer |
| PR flow-calm | Esc | **Added** a level: room → orbit → galaxy when no panel is open | keyboard, every layer |
| PR flow-calm | Auto panel (.auto-panel) | Starts folded as the pill (remembered); on a galaxy under 1140 px wide it waits under the top bar; an open sheet slides over it | 2 Orbit (and 0 Galaxy while a run is on) |
| PR flow-calm | Classic top bar: Game, Play, Publish, More | Under 1180 px wide they show icons only (names as aria-labels), so ☰ and its Classic view switch stay on screen | Classic view |
| PR flow-calm | Tooltips | **Removed** from everything that shows text (the top bar, ☰ menu, stations, planets, comm bar, canvas tools, Classic tabs and selects); their explanations are deleted. Icon-only buttons keep a 1–3 word name. 106 → 71 in `web/` | every layer |
| PR flow-calm | Auto mode sheet, game wizard, Launch kit | **Unchanged** apart from closing with ×, Esc and an outside click, the checkbox fix and never squeezing their own contents; the new site map replaces them | Start, game wizard |
| PR hosted-studio | Hosted studio guest bar (.guest-bar, only at swarm.design-bakery.com/studio/app) | **Added**: the guest's name, builds left today, Post to Feed, Install the plugin. Video, App, Auto, Game, Publish, Review, Models, the model picker and the Film/Engine stations are hidden there (spec 13) | top bar, hosted only |
| PR hosted-studio | Guest name dialog | **Added**: asks a name before the first hosted build (prefilled with the Feed's generated guest name) | dialog, hosted only |

## Landmarks, with only what is visible at rest

The full tree, every branch down to 14 layers, is in [SITEMAP.md](SITEMAP.md). This table covers only the landmark screens
on the way down.

| Landmark | Visible at rest (the whole list) | One click or hover away | ⌘K or ⚙ only |
|---|---|---|---|
| **Home** (the Feed) | one build full screen, its maker and title, the right rail (Maker, Like, Talk, Share), Remix, the five-slot nav | swipe up for the next build, left for its assets, tap for its story | — |
| **Projects › My builds** (the galaxy) | the galaxy (stars = builds), Search | star name and one fact on hover; Search opens the build list with sort, group, folders and tags behind a filter icon | everything else |
| **Start** (typing) | the input, the lens chip, Build | lens options (below); "what happens" as a row of step icons | Pro packs list, models |
| **Orbit** | the build (sun), its pages (planets, for lenses with pages), the lens's stations (1-3), one progress ring on the sun, the breadcrumb, the input (now the chat), Share, Sound, ⚙ | ring → steps sheet (with Stop); Hermia's avatar → crew radio (reasoning, agents, chatter); station hover → one line | think log, planner stream, break room |
| **Room** | the room's content, its one primary action, a ⋯ room menu, the breadcrumb, the input | an inspector panel on the right for whatever is selected | the room's power tools |
| **Design deck** (follows Figma, see PATTERNS.md) | the left panel (logo menu, pages, layers), the canvas with the crew's cursors, the bottom toolbar (Move, Frame, Shape, Pen, Text, Comment, Hermia, Code), the right panel (crew, progress, Play, Share; page and variables) | the Design and Prototype tabs for a selection; comment threads; follow one agent | Figma's shortcut keys, ⌘K, ⌘\\ hides the panels |
| **Details** | — | logs, reasoning, layers tree, files and code wall, traces, raw errors, per-role models | — |

## One home for each duplicate

| Function | Today | One home |
|---|---|---|
| Start anything | 31 ways | the one input, plus the lens chip; commands in ⌘K |
| Auto | top-bar Auto, galaxy Auto, the Auto box with Make / Pro | the **Just make it** lens, then Build |
| Game | 5 entries, then a 7-step wizard | the **Game** lens; genre and size in its options; the remaining wizard questions become optional tweaks after the first build |
| Pro packs | a Pro tab in the Auto box | "Start from a pack" inside the lens options (Develop, Launch, Just make it) |
| Chat / instructions | sidebar chat, galaxy input, Auto prompt, game idea, video idea, picture prompt, per-view composer | the one input, which knows its target (a small chip shows "→ App", "→ Film"); comments stay a canvas tool, because they're pinned to a spot |
| Video | Video tab, More → Video, station, `/video`, composer, auto-open | the **Film studio** room; "New cut" inside it |
| App | App tab, station, `/app`, Publish → Working app, Build the game | the **Engine room** |
| Canvas | Canvas tab, station, planet click, `/canvas` | the **Design deck**; a planet click opens it on that page |
| Play prototype | Play button, P, `/play`, a chat chip, a Hermes command | Play in the Design deck (P and ⌘K stay) |
| Progress | 10 displays | one ring on the sun that expands to the steps; a pulse on the station that is working |
| Open a build | Files tab, stars, star labels, Star chart, Live now / Back to chips, `/files`, `/open`, wall tiles | the galaxy (stars) and Search |
| Folders, tags, details, Show in Finder | 6 + 2 + 2 + 4 ways | the row menu in Search; ⌘K |
| Sound | crew mute button + Chatter dock + slider | one Sound button; its popover holds the volume |
| Models | More → Models, `/models`, a builder-model picker in the chat tab | ⚙ → Models |
| Publish, copy link, open live, launch kit | Publish menu, `/publish`, 4 copy-link buttons, 6 open-live buttons, 3 launch-kit buttons | one **Share** button: Link, Website, Working app, Post to Feed, Launch posts |
| Hermia's reasoning | thought bubble, comm text, Thinking count, Log tab | Hermia's avatar → crew radio |
| Stop | 3 meanings, one label | Stop lives in the sheet of the thing it stops, labelled by that thing ("Stop the build", "Stop the tour") |
| Back home | a back button that's hidden in Classic view | breadcrumb, logo (to Home), Esc |
| Classic view | a separate layout you can get trapped in | removed: its canvas becomes the Design deck, in Figma's layout; its chat becomes Hermia on the toolbar |

## Stations and rooms per lens

| Lens | Stations in orbit | Room primary action | In the room's ⋯ menu |
|---|---|---|---|
| Just make it | none while building; the result card when done | Open / Share | — |
| Design | Design deck | Share | the logo menu: Versions, Export all (the Critic's review arrives as comment pins) |
| Develop | Engine room (Design deck read-only) | Open app | Files, Checks, Deploy, Data |
| Game | Game room, Film studio | Play | Tune, Publish to Arcade |
| Mix | Design deck, Engine room | per room, as above | per room |
| Launch | Design deck, Film studio, Launch pad | Share | Posts, Show card, Post to Feed |

## Removed outright

- The 75 helper sentences: deleted, or moved one layer down into a sheet; never into a tooltip (RULES.md rules 8
  and 9).
- The top-bar Auto and Game buttons, and the More menu (places become stations, actions move into rooms,
  settings go to ⚙).
- The Make / Pro tabs and the "ONE PROMPT. THE whole THING." headline inside the Auto box.
- The Star chart button (replaced by Search), and the Live now / Back to chips (the live star pulses).
- The Hermia text strip ("Standing by.") and the sun and station status sentences (replaced by the ring and
  dots).
- In the Design deck, everything Figma doesn't have: the chat feed and log, the dock, the status bar, the
  camera hint, the separate agents list and the view tabs. Where each one goes is in PATTERNS.md.

## Questions for the owner

1. ~~Is the edge-icon set on the galaxy right?~~ Answered: the five-slot nav (Home, Discover, + Create, Projects,
   Me) replaces it; Sound and Settings live under Me.
2. The Wall (`/wall`) is a demo page, not part of the flow. Keep it separate, with an "Open in studio" link on
   each tile?
3. After the first game build, should the remaining wizard questions appear as optional tweak chips in the Game
   room?
4. Should Pro packs live in the lens options (as proposed), or become their own lens?
