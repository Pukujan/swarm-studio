# 38. Game starters

The owner, 2026-11-12:
- "maybe an option to directly load the starter like for games, ? you know the boiler plate we did yesterday
  for game prep with assets"
- After a Godot developer told them "the engines all kinda suck out of the box right now, you often have to
  introduce systems for various problems": "im thinking what we can do to introduce plugins into our scaffold
  too inside swarm studio"

A game starts from a **starter**: the systems its genre needs, already working and tested, plus art to begin
with. The crew builds the game's own scenes and scripts on top of the starter and does not rewrite the
systems. A generated game then holds up at scale: 500 ants on one map, not 20.

This is part of the Game kit in [spec 37](37-studio-first.md): the starter is a section of the game's Plan
step, and its choices go into the locked spec.

## The choice, on the Plan board

The Plan board has two groups for the starter, below the plan cards:

- **Starter**: three cards. Each card shows the choice and one line on why it is suggested.
  - **Engine**: the browser or Godot 4.
  - **Template**: the genre starter, for example Top-down strategy, or None (an empty project).
  - **Assets**: the starter's own art pack (placeholder units), or Paint my own.
- **Systems**: one card per system the template carries, each with **On** or **Off** and why.
  - A required system says "Part of this template" and can't be turned off.
  - An optional one is suggested from the plan. Fog of war is on when the plan mentions fog.

Selecting a card opens its options in the inspector, each with its own why. A template made for another
engine is shown but can't be picked.

Each choice is `{ value, why, by: 'planner' | 'person' }`, the same shape as spec 27's decisions:
- the planner suggests;
- the person keeps or changes;
- a re-plan never overwrites the person's choice;
- changing a choice reopens a locked plan.

The engine on this card is the build's target. Changing it here is the same as deciding it in the chat.

## The locked spec

Locking writes the starter as `starterSpec(plan)` into two places: `plan.gate.starter`, and `chat.spec.starter`
for a game chat.

```json
{ "engine": "godot", "template": { "id": "strategy-topdown", "version": "1.0.0" }, "assets": "placeholder",
  "systems": ["pool", "flowfield", "select", "camera", "fog"],
  "addons": [{ "id": "swarm_rts", "version": "1.0.0", "source": "ours" }] }
```

The build reads only this.

## A starter on disk

A starter is a folder that ships inside the plugin, `starters/<id>/`:
- `starter.json` holds id, name, version, engines, families, why, systems, assets and add-ons;
- the project files sit beside it (`godot/` for a Godot 4 project).

Nothing is downloaded at build time (the Nous review rules). Everything ships inside the plugin and is kept
small.

### Add-ons, in order of trust

Each add-on lives in `starters/addons/<id>/`. Its `addon.json` says where it came from:

1. **`ours`**: written and kept here. Small, and tested with the crew.
2. **`pinned`**: a well-known open-source add-on, vendored at an exact version. It records `url`, `version`,
   `licence`, `credits` and the `sha256` of the vendored files.
3. **`brought`**: one the person drops in, like an asset (spec 37 Assets, role `pack`). It is kept per
   project and recorded with where it came from.

## Slices

1. **The choice on the board.** `engine/starters.mjs`, the Starter and Systems groups, `POST /api/plans/:id/starter`,
   and the starter in the locked spec.
2. **The strategy starter.** A Godot 4 project with the `swarm_rts` add-on: unit pool, flow-field paths,
   box selection and orders, a camera, and optional fog. Placeholder ants on a map, so the first thing seen is
   ants moving before any art is painted. The build copies it in and tells the crew its API.
3. **The proof.** A measured test that the strategy starter keeps a playable frame rate with 500 units, in
   the Web export and in Godot itself. Plus a note on what the Web preview cannot run (native add-ons), with
   **Open in Godot** as the main way to play in that case.
4. **A second starter**, where the engine's defaults fail soonest, and the pinned and brought add-on paths.

## Slice 2, built

- `starters/strategy-topdown/godot/` is a playable Godot 4 project. It is a 96 × 96 map with rocks and a
  nest, and opens with 40 placeholder ants. Rival waves march on the nest every 25 s.
- `starters/addons/swarm_rts/` is the add-on (source `ours`, MIT). Every unit is a slot in packed arrays in
  one `Swarm` node, and one MultiMesh draws them all. The selection rings are a second MultiMesh.
  - `FlowField` gives one field per goal, cached, so a thousand units share one path search.
  - `BoxSelect` handles the mouse and touch.
  - `RtsCamera` handles edge, keys, drag, wheel and pinch.
  - `FogOfWar` refreshes over 8 frames.
  - `PlaceholderArt` paints the ant and the ring in code.
- `seedGodot` copies the locked starter into `ports/godot/` before anything else. It never copies over a
  file that is already there. `godotStagePrompt` adds the starter's `CREW.md`, the API and the rules the crew
  builds on.
- `engine/godotfirst.mjs` also reads the engine from `spec.starter.engine`.

## Slice 3, built: the proof

`node bench/starter-strategy.mjs --ssh windows --window --web --out bench/strategy-500.json` puts the strategy
starter together in a temporary folder and measures 500 units: two teams, every unit ordered to the far
corner every 4 s, 900 frames after 90 to warm up.
- Godot runs on the Windows PC (`bench/godot-run.ps1`). Without `--ssh` it uses the local `SWARM_GODOT`.
- The Web export comes back to this Mac and is served on 127.0.0.1. It is measured in a headless Chromium
  (`bench/browser.mjs`, over the DevTools protocol, with no npm packages).
- Every folder the run makes is deleted, here and on the PC.

| Where | Frame avg | Frame p95 | fps | Swarm update |
|---|---|---|---|---|
| Godot 4.7.2, headless (Windows) | 6.9 ms | 8.3 ms | 145 | 3.4 ms |
| Godot 4.7.2, window (RTX 4060 Laptop) | 2.6 ms | 3.5 ms | 379 | 1.8 ms |
| Web export, Chromium (Apple M1, ANGLE Metal) | 16.7 ms | 19.1 ms | 60 (vsync) | 5.2 ms |

`tests/starter-bench.test.mjs` holds `bench/strategy-500.json` to the bar: all 500 units alive at the end,
an average frame of 20 ms or less, and a p95 of 25 ms or less. It measures again when `SWARM_GODOT` is set.

The first Web run reached 45 fps, with a p95 of 37 ms. Three changes brought it to 60 fps:
- the selection rings became a second MultiMesh (before, `_draw` drew one arc per unit each frame);
- the fog refresh is spread over 8 frames, and stamps each cell once;
- every loop stops at the highest slot in use.

### What the Web preview cannot run

The Web export is Godot's single-threaded WebAssembly build. It cannot load:
- **native add-ons** (GDExtension: `.dll`, `.so`, `.dylib` or `.framework` files);
- anything that needs threads;
- C#.

When a starter or a brought add-on has `"native": true` in its `addon.json`, or `"web": false`, the
preview is not the way to play:
- the board's Template card says so with the starter's `web` note;
- the project is played with **Open in Godot**, as the main action where Play would be.

`swarm_rts` is plain GDScript (`"native": false`), so the strategy starter plays in the preview.

The **Open in Godot** action itself (open `ports/godot/` in the person's own Godot) is not built yet. It
comes with the first starter or add-on that needs it.

## The game kit

`web/kit-game.js` exports `gameKit`, the Plan board behind spec 37's kit contract. The board itself is
unchanged:
- **`plan.sections`**: the board's Starter, Systems and Plan artboards. The board draws them
  (`render: null`), and `inspect` selects them there.
- **`proposal`**: the Lock price.
- **`lock`**: the plan's gate and its starter. It is null until the plan is locked.
- **`build`**: the board's own gate. It shows Lock with the price first, then Build.

`web/plan.js` now also exposes `plan` and `gate`. The kit is listed in `web/kits.js` when that file
exists (spec 37).

## Slice 4, built: the platformer starter and the other add-on sources

**Why a platformer.** It is the genre where Godot's defaults let people down soonest. The stock
`CharacterBody2D` jump:
- is the same height however long you hold it;
- ignores a press a frame early or a frame after the ledge;
- stops dead on every ceiling corner.

One-way and moving platforms need wiring by hand.

**`starters/platformer-side/`** is a code-built level with ground, a pit, one-way ledges, a lift and a low
corner, plus a placeholder hero and a lookahead camera. Its add-on is `starters/addons/feel_platform/`
(ours, MIT):
- **`PlatformerBody`**: the jump is given by its height and time. It has coyote time, a jump buffer, a
  short hop on release, a slower apex, a heavier fall, corner correction, down + jump through ledges
  (physics layer 3), and riding lifts.
- **`MovingPlatform`**.
- **`LookaheadCamera`**: it holds its height through a jump.

**The proof.** `node bench/starter-feel.mjs --ssh windows --out bench/platformer-feel.json` runs
`scripts/feel_test.gd` headless at one physics step a frame. `tests/starter-bench.test.mjs` holds the
result:

| Check | Measured |
|---|---|
| Held jump | 105.7 px (aim 110) |
| Tap | 44.2 px |
| Jump 3 frames after the ledge | jumps |
| Jump 15 frames after the ledge | does not |
| Press just before landing | jumps on landing |
| Lift moves 103 px | the hero rides 102.3 |
| Drop through a ledge | yes |
| Corner 4 px over the head | slides past |

**Add-ons from every source** (`engine/starters.mjs`):
- **`checkAddon(dir)`** checks any add-on against its `addon.json`:
  - the source and fields;
  - the listed files are there;
  - the size limit: 200 KB for ours, 2 MB for pinned, 5 MB for brought;
  - native files force `native: true` and `web: false`;
  - a pinned add-on needs an https `url`, an exact version, and a `sha256` (`addonSum`: paths and bytes,
    sorted) that matches the vendored files.
- **`bringAddon(folder, project, {name, url, licence, credits})`** copies a folder the person dropped in
  into `addons/<id>/`. It must have a `plugin.cfg`, a script or a `.gdextension`. It writes the record with
  `source: 'brought'` and the checksum, and marks native files so **Open in Godot** takes over from the
  preview.

No pinned add-on ships yet. The first one goes in through `checkAddon`, with its licence and credits.
