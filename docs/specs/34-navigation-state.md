# 34. Where you are: one navigation state

The owner, 2026-11-12: "right now, no matter what i click it keeps taking me to this screen instead of those pages/proejcts why?" The pill read OVERVIEW while the player showed another project's site. It was the fourth bug of that family in two days. #310 fixed the causes behind it. This spec removes the family.

## Why it keeps happening

Which project is open, which build shows, which room, and whether the player is open are each kept in several places:

- in `web/canvas.js`: `S.run`, `viewing`, `claimed`, `view` and the player's `hidden`;
- in `web/studio.js`: `C.mode`, `C.project` and `C.opening`;
- in `web/project.js`: `P.run` and `P.pid`;
- in `web/home.js`: `H.stack`.

On top of those, four things can set a view by themselves:

- the server's stream, which replays its current run;
- the query string;
- a timer that opens the latest file;
- `localStorage`.

Every screen picks its own copy, so two screens can disagree. #310 made the stream and the timer respect the person's choice, but the copies are still there.

## What it is

There is one slice in the existing store (`web/store.js`, `stateSlice`), named `nav`, with plain data only. A handful of actions are the only way to change it. Every screen draws from it. It is not XState and needs no library: a transition table in about 150 lines, in the house style.

### The slice

| Field | Values | Meaning |
|---|---|---|
| `room` | `home` · `overview` · `deck` · `app` · `game` · `video` · `plan` · `brand` | the screen. `home` is Projects; `deck` is the Design deck (Canvas) |
| `project` | project id · `null` | the open project. `null` only at home, in a plan, or for a build too new to be listed |
| `version` | run id · `null` | the project's version that is open (a site's run) |
| `run` | run id · `null` | the build on screen. It is the same as `version`, except in the game room, where it is the version's game run |
| `plan` | plan id · `null` | the game plan open in `plan` |
| `player` | `closed` · `prototype` · `visitor` | the player, and whether a visitor is walking it |
| `page` | page id · `null` | the player's page |
| `replay` | `false` · `true` | the deck is replaying the build as it was made |
| `pending` | run id · `null` | a build the person started that has not streamed yet. When its `run:start` arrives, the canvas follows it |
| `from` | a room · `null` | where the brand sheet was opened from |

### The actions

They live in `web/nav.js`. `step(state, action)` is pure: it returns the next state, or `{ refused: why }`. A refused action is logged to the console as `nav: refused <action>: <why>`, and nothing changes. A mixed screen is never drawn.

| Action | Allowed when | Changes |
|---|---|---|
| `home()` | always | room `home`; player `closed`; replay off. Project and run are kept, for Esc and Back; the screen shows none |
| `openProject(project, version)` | always | the project, version and run; room `overview`; player `closed`; replay off |
| `openVersion(version)` | a project is open | version and run; room unchanged (the game room goes to `overview`); player `closed` |
| `started(run, { project, room })` | always | a build the person started: run, version and `pending` = run, the project if known; room `deck`, or `overview` in the hosted studio; player `closed` |
| `enterRoom(room)`, room `overview` `deck` `app` `video` | a run is open | room; player `closed`; replay off unless the room is `deck` |
| `enterRoom('game', gameRun)` | the version has a game | room `game`, run = gameRun, version unchanged |
| `openPlan(plan)` | always | room `plan`, plan; player `closed` |
| `openBrand()` | always | room `brand`, `from` = the room before; player `closed` |
| `leaveBrand()` | room `brand` | back to `from`, or to `home` when that room has no build any more |
| `play(mode, page)` | room `overview` `deck` `app`, and the run has pages | player `prototype` or `visitor`; page |
| `playPage(page)` | the player is open | page |
| `stopVisitor()` | player `visitor` | player `prototype` |
| `closePlayer()` | always | player `closed` |
| `replay(on)` | room `deck` | replay |
| `streamed(run)` | always | only `pending` is cleared, when run === pending. **The stream never changes `project`, `version`, `run` or `room`** |
| `fromAddress(url)` | always | the state the address names, checked with the same rules. Something unknown is dropped, and the rest stands |

These are the refusals that guard against the owner's bug:

- `enterRoom` with no run open;
- `play` at home, in a plan, in a brand sheet, or on a build with no pages;
- `openVersion` with no project open;
- `replay` outside the deck.

### Who reads it

Each consumer has a `nav.on(draw)` and draws from the slice alone:

- the top bar: the breadcrumb (Projects › project ▾), the mode pill, Play and the back button;
- Projects: the versions view is a home preference, `H.stack`, and never a build;
- the Overview: its run and project are `nav.version` and `nav.project`;
- the deck and rooms: the canvas loads `nav.run` when it changes;
- the player: open when `player` is not `closed`, on `page`, with a visitor when `visitor`;
- the left chat's project: the dock extends `nav.version`.

Where an old variable must stay for a while, it is derived from the slice in one place. For example, `viewing` becomes a getter on `nav.run`. It is never set on its own.

### The address

The address carries the same state and nothing else:

`?project=<id>&version=<run>&room=<room>&play=<prototype|visitor>&page=<id>`

- Opening a project or entering a room adds a history entry (`pushState`). Player and page changes replace the current one (`replaceState`).
- Back and Forward call `fromAddress`.
- A reload shows exactly the address.
- `?run=<id>` (the old form) and `?replay=<id>` (the Wall and capture scripts) still work. They are read once, through `fromAddress`.
- `localStorage` keeps preferences only: the Projects tab, its sort, filter and layout, the player's device and motion, the panels, and the sound. Never which build, project or room is open.
- The "open the latest file behind an empty canvas" timer goes.

## Migration: small PRs, open-check green after each

`scripts/open-check.mjs` grows with every step. The order is chosen so `web/canvas.js` is touched only after the catalog review's point 4 (page frames sandboxed without `allow-same-origin`) has merged.

| PR | Files | What moves | open-check adds |
|---|---|---|---|
| 1 | new `web/nav.js`, `tests/nav.test.mjs` | the slice and `step()` with the whole transition table, unit-tested. Nothing reads it yet | — |
| 2 | `web/studio.js` | `C.go`, `C.open`, `C.load`, `C.home`, `C.up` become actions. `C.mode` and the pill and back button read `nav.room`. `projectRun` goes | the pill and breadcrumb match the screen in every room |
| 3 | `web/studio.js`, `web/home.js` | the address (push, replace, popstate). The start-up reads `fromAddress`, not `Q.get`. The `home.*` keys stay preferences | Back and Forward; a reload in each room |
| 4 | `web/canvas.js`, after point 4 | `openRun` loads `nav.run`. `viewing` and `claimed` become getters. The stream handler dispatches only `streamed`. The open-latest timer goes | reconnect; a build elsewhere; Make, then another project |
| 5 | `web/canvas.js` (the player block) | `openPlayer`, `closePlayer` and `watchVisitor` dispatch `play` and `closePlayer`. The player draws from `nav.player` and `nav.page` | the player never outlives its build or room |
| 6 | `web/project.js`, `web/home.js` | `P.run` and `P.pid` become `nav.version` and `nav.project`. A version tile dispatches `openVersion` | a version tile from inside a project |
| 7 | `web/canvas.js` (command, dock) | Hermes's `open` and `play` commands, the left chat's project and the hosted studio dispatch the actions. The duplicate getters on `window.swarm` go | a Hermes `cmd play` while at home |

## Done when

- One slice says where the person is. Every screen agrees with it, because every screen draws from it.
- An impossible transition is refused and logged, never drawn.
- The address is the only thing a reload restores.
- `tests/nav.test.mjs` covers every row of the table, refusals included.
- `open-check` runs the owner's sequences in CI:
  - Make, then another project;
  - a version tile;
  - a build started elsewhere;
  - a reconnect;
  - Back and Forward;
  - a reload in each room;
  - the pill and breadcrumb always matching the screen.
