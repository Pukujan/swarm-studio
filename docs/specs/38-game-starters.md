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
