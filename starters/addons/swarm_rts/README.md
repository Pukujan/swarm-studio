# Swarm RTS (add-on)

Many units on one map in Godot 4, in GDScript only, so it runs in the Web export too. MIT, Swarm Studio.

| Class | What it does |
|---|---|
| `Swarm` (Node2D) | Every unit of every team as packed arrays in a pool, drawn by one MultiMesh. `spawn(team, pos)`, `kill(id)`, `move(ids, to)`, `ids_in_rect(rect, team)`, `nearest(pos, team, max)`, `count(team)`, `is_alive(id)`, `position_of(id)`, `pick(ids)` (rings under these units, one more MultiMesh). Separation, and bites between teams when `fight` is on. Signals `unit_spawned`, `unit_died(id, team)`, `group_arrived(order)`. |
| `FlowField` (RefCounted) | One breadth-first search per order target, shared by every unit sent there. `set_blocked(cell, on)`, `blocked_at(pos)`, `prepare(pos)`, `direction(key, pos)`. |
| `BoxSelect` (Node2D) | Drag to pick, click to pick one, right-click or tap to send. `ids`, `set_ids(ids)` to pick from code, signals `selected(ids)`, `ordered(ids, to)`. |
| `RtsCamera` (Camera2D) | Edge, key and middle-drag pan, wheel and pinch zoom, clamped to `bounds`. |
| `FogOfWar` (Sprite2D) | Unseen, explored and in sight. `setup(swarm, team, map_rect)`, `visible_at(pos)`. One refresh is spread over `spread` frames. |
| `PlaceholderArt` | `ant()`: a white ant, and `ring()` for the selection marks; the ant is drawn in code, tinted per team, until the painted sprite replaces it. |

A unit is an id, not a node. Keep per-unit game data (kind, carried food, upgrades) in your own packed
arrays indexed by that id, and listen to `unit_died` to clear it. Never make a node per unit: that is what
this add-on exists to avoid.
