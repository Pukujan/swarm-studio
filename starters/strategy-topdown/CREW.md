This game starts from the Top-down strategy starter (Godot 4). It is already in the project:
- res://addons/swarm_rts: Swarm (every unit as an id in one pool, drawn by one MultiMesh), FlowField (one path map per order), BoxSelect, RtsCamera, FogOfWar, PlaceholderArt. Its README.md lists the API. Do not rewrite or copy these systems; build on them.
- res://scripts/main.gd: the map, the nest, 40 ants, rival waves and the HUD line. res://scripts/map.gd: dirt, rocks (blocked FlowField cells) and the nest. Change these freely: they are this game's own.
Rules for this starter:
- A unit is an id, never a node. Keep per-unit data (kind, food carried, upgrades) in your own packed arrays indexed by the id, cleared on Swarm.unit_died. Never make a node per unit.
- Kinds of units (worker, soldier, scout) are a byte per id that sets speed, damage and the tint; buildings and food are nodes (there are few of them).
- Painted unit sprites replace PlaceholderArt by setting Swarm.texture (one picture, head pointing right).
- Keep 500 units playable: no per-unit work in _process outside the Swarm loop, no get_children() scans per frame.
- The bench (-- --bench 500) must still run and print its BENCH line.
