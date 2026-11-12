# 34. Where you are: one navigation machine

The owner, 2026-11-12: "right now, no matter what i click it keeps taking me to this screen instead of those pages/proejcts why?" The pill read OVERVIEW while the player showed another project's site. It was the fourth bug of that family in two days. #310 fixed the causes behind it. This spec removes the family.

The first version of this spec kept the state in a hand-written slice (`web/nav.js`, merged as #316). The owner then asked for a mature library instead: "rather use a mature dependency than make one from scratch". So navigation is an **XState v5** machine, and the shared data moves to XState too. The `step()` table in #316 is the reference for the transitions below, and PR 2 replaces it.

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

Every screen picks its own copy, so two screens can disagree.

## One library: XState v5, for both jobs

- **Navigation** is a machine (`createMachine` through `setup`). A move the machine has no transition for does not happen.
- **Shared data** means today's `web/store.js` slices: the App view (`app`), the advisor (`advisor`) and the game interview (`game`). Each becomes an XState actor made from `fromTransition`, XState's reducer actor. Its events are `set` (merge a patch) and `reset` (back to the start, keeping the `keep` fields). It has the same `getSnapshot()` and `subscribe()` as the machine.

Zustand's vanilla store and `@xstate/store` would each be a second package. XState alone covers both cleanly, so the studio has one dependency, one way to subscribe, and one debug dump. `web/store.js` retires once its three users have moved.

## The machine

```
nav
├─ home                      Projects
├─ draft                     a new project talked through on the Design deck, nothing built yet
├─ plan                      a game plan (none yet while a game talk drafts one)
├─ brand                     the brand sheet (context.from says where it was opened from)
└─ build                     a version is open (context.version)
   ├─ video
   ├─ game                   context.run is the version's game run
   └─ playable               parallel
      ├─ room:   overview · deck (live | replay) · app
      └─ player: closed · prototype · visitor
```

The player is a region of `playable`, so the player exists only in the Overview, the deck and the app. Leaving `playable` (home, a plan, the brand sheet, the video or game room) exits the region. Coming back starts it `closed`. There is no player over Projects any more because no such state exists.

### Context

| Field | Meaning |
|---|---|
| `project` | the open project, or `null` (a plan, or a build too new to be listed) |
| `version` | the project's version that is open (a site's run) |
| `run` | the build on screen: `version`, or the game run in `game` |
| `plan` | the plan open in `plan` |
| `page` | the player's page |
| `pending` | a build the person started that has not streamed yet |
| `from` | the room the brand sheet was opened from |

`home` keeps `project` and `version`, so Esc and Back can go back to them. The screen shows neither.

### Events

The events are the named actions. Any event the current state does not take is ignored by XState. `nav.go(event)` is the one door: it checks `snapshot.can(event)` first and logs `nav: no <type> from <state>` when the move does not exist, so an impossible move shows in the console and never on screen.

| Event | Taken in | Goes to |
|---|---|---|
| `home` | every state | `home`; replay ends |
| `open.project { project, version }` | every state | `build.playable`, Overview, player `closed` |
| `open.version { version, project? }` | `build` | the same room on that version (and its project, when it names one); `game` goes to the Overview; player `closed` |
| `started { run, project?, room? }` | every state | the run's deck (the Overview in the hosted studio); `pending` = run |
| `room { room, run? }` | `build` | that room. `game` needs `run`. In `playable` the player region also takes `room` and goes to `closed` |
| `draft` | every state | `draft`: the deck with no project or build, for a new project's talk. A reload shows Projects |
| `plan { plan? }` | every state | `plan`; with no id while a game talk drafts it |
| `brand` | every state | `brand`, `from` = the room before |
| `back` | `brand` | `from`, or `home` when that room has no build any more |
| `play { page? }` | `playable`, if the run has pages | player `prototype` |
| `watch { page? }` | `playable`, if the run has pages | player `visitor` |
| `stop` | player `visitor` | player `prototype` |
| `close` | player open | player `closed` |
| `page { page }` | player open | the page |
| `replay { on }` | `deck` | `deck.replay` or `deck.live` |
| `streamed { run }` | every state | clears `pending` when run === pending. **Nothing else.** It has no target, so the stream cannot change the project, version, run, room or player |

### Who reads it

The actor's snapshot is what every screen reads. Each screen subscribes with `nav.subscribe(draw)` and draws from `snapshot.value` and `snapshot.context` alone:

- the top bar: the breadcrumb (Projects › project ▾), the mode pill, Play and the back button;
- Projects: the versions view is a home preference (`H.stack`), never a build;
- the Overview: `context.version` and `context.project`;
- the deck and rooms: the canvas loads `context.run` when it changes;
- the player: open in `player.prototype` and `player.visitor`, on `context.page`;
- the left chat's project: the dock extends `context.version`.

Where an old variable must stay for a while, it is a getter on the snapshot, defined in one place. For example, `viewing` reads `context.run`. Nothing sets it on its own.

## The address

The address carries the same state and nothing else:

`?project=<id>&version=<run>&room=<room>&run=<game run>&plan=<id>&play=<prototype|visitor>&page=<id>`

- `toAddress(snapshot)` writes it. `fromAddress(search)` returns the events that rebuild it (`open.project`, `room`, `play`…). They are sent to a fresh actor, so an address that asks for something impossible gets only the part the machine takes. A `play=` on Projects opens Projects. A room with no build opens nothing.
- Opening a project or entering a room adds a history entry (`pushState`). Player and page changes replace the current one (`replaceState`).
- Back and Forward rebuild from `fromAddress`, and so does a reload.
- `?run=<id>` (the old form) and `?replay=<id>` (the Wall and capture scripts) still work, through `fromAddress`.
- `localStorage` keeps preferences only: the Projects tab, its sort, filter and layout; the player's device and motion; the panels; the sound. Never which build, project or room is open.
- The timer that opens the latest file behind an empty canvas goes.

## `window.swarmState()`

It stays as the console's debug dump: `{ nav: { state, context }, app, advisor, game }`, made from the actors' snapshots.

## Vendoring: in the plugin, nothing fetched

- **The library.** XState **5.33.3** (MIT, released 2026-10-17; the newest release at least two weeks old) is vendored as one ESM file, `web/vendor/xstate/xstate.mjs`. It holds only the exports the studio uses (`setup`, `createActor`, `assign`, `fromTransition`). It is built once with esbuild **0.28.2**.
- **What is kept with it.**
  - `web/vendor/xstate/LICENSE`, the package's own licence text.
  - `web/vendor/xstate/SOURCE.json`, with:
    - the package and version;
    - the tarball URL (`https://registry.npmjs.org/xstate/-/xstate-5.33.3.tgz`) and npm's `integrity`;
    - the esbuild version;
    - the SHA-256 of `xstate.mjs`.
- **The reproduce script.** `scripts/vendor.mjs` reproduces the file:
  1. It downloads the tarball and checks it against the pinned `integrity`.
  2. It bundles the entry with the pinned esbuild.
  3. It writes the three files.

  `--check` rebuilds the file and fails if a byte differs. CI runs it. A unit test checks the committed file's SHA-256 against `SOURCE.json` offline.
- **How it is served.** The plugin's own server serves it, inlined into the page like every other web file, because the Desktop pane's frame has an opaque origin. `server/page.mjs` puts each vendored module in once, as `const __vendor_xstate = (() => { …; return { setup, … } })()`; the return comes from esbuild's closing `export { … }`. It turns `import { … } from './vendor/xstate/xstate.mjs'` into `const { … } = __vendor_xstate`. Node tests import the same file directly. No CDN, no install at run time, nothing fetched on the user's machine.
- **The README.** Its "What it does on your machine" list gains a line naming the vendored library, its version and licence, and saying it is served from the plugin and never fetched.
- **The catalog review.** The catalog review session is told, so the disclosure text and the install scan stay right.

## Migration: small PRs, open-check green after each

`scripts/open-check.mjs` grows with every step. `web/canvas.js` is touched only after the catalog review's point 4 (page frames sandboxed without `allow-same-origin`) has merged.

| PR | Files | What moves | open-check adds |
|---|---|---|---|
| 1 | `scripts/vendor.mjs`, `web/vendor/xstate/`, `server/page.mjs`, README, a test | XState vendored, the inline rule, the SHA test. Nothing uses it yet | — |
| 2 | `web/nav.js`, `tests/nav.test.mjs` | the machine replaces `step()`; `toAddress` and `fromAddress` work over its snapshot. #316's tests move over, one per row of the events table, plus a test that `streamed` never changes anything but `pending` | — |
| 3 | `web/studio.js` | `C.go`, `C.open`, `C.load`, `C.home` and `C.up` send events. The pill and back button read the snapshot. `projectRun` goes | the pill and breadcrumb match the screen in every room |
| 4 | `web/studio.js`, `web/home.js` | the address (push, replace, popstate). The start-up reads `fromAddress`, not `Q.get`. The `home.*` keys stay preferences | Back and Forward; a reload in each room |
| 5 | `web/canvas.js`, `web/studio.js`, `web/home.js` | The studio loads `context.run` into the canvas whenever it changes. The stream sends `streamed`, and an empty canvas takes only the build the machine names. Make sends `started`. The open-latest timer goes. `viewing` stays inside the canvas as its data source (live stream or saved file), not as navigation | reconnect; a build elsewhere; Make, then another project |
| 6 | `web/data.js`, `web/canvas.js`, `server/page.mjs` | `app`, `advisor` and `game` become `fromTransition` actors. `web/store.js` goes. `window.swarmState()` dumps nav and the data actors | the dump has all four |
| 7 | `web/canvas.js` (the player) | `openPlayer`, `closePlayer` and `watchVisitor` send `play`, `watch`, `stop` and `close`. The player draws from the `player` region | the player never outlives its build or room |
| 8 | `web/project.js`, `web/home.js` | `P.run` and `P.pid` read the context. A version tile sends `open.version` | a version tile from inside a project |
| 9 | `web/canvas.js` (commands, dock) | Hermes's `open` and `play` commands, the left chat's project and the hosted studio send the events (`runNow`, `showRun`). The duplicate getters on `window.swarm` go (`claimed` and `liveId`; `holds(run)` answers instead) | a Hermes `cmd play` while at home |

## Done when

- One machine says where the person is. Every screen agrees with it, because every screen draws from its snapshot.
- A move the machine does not have is logged and never drawn.
- The address is the only thing a reload restores.
- `tests/nav.test.mjs` covers every row of the events table.
- XState is vendored, pinned, licensed and reproducible, and the README says so.
- `open-check` runs the owner's sequences in CI:
  - Make, then another project;
  - a version tile;
  - a build started elsewhere;
  - a reconnect;
  - Back and Forward;
  - a reload in each room;
  - the pill and breadcrumb always matching the screen.
