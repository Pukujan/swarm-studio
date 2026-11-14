# Feel Platform

A side-view player that feels right from the first jump, in plain GDScript (it runs in the Web export).
Godot's own `CharacterBody2D` template jumps the same height however long you hold, misses a jump
pressed a frame early or a frame after a ledge, and bonks on every ceiling corner. This fixes those.

| Class | What it does |
|---|---|
| `PlatformerBody` (CharacterBody2D) | Run with separate ground and air acceleration. The jump is given by its height and time (`jump_height`, `jump_time`). Coyote time (`coyote`), a jump buffer (`buffer`), let go early for a short hop, a slower apex, a heavier fall, corner correction (`corner_nudge`), and down + jump to drop through a one-way platform (layer `ONE_WAY_LAYER`, 3). It rides moving platforms. From code: `use_input = false`, then `input_dir`, `jump_held`, `press_jump()`, `drop_through()`. Signals `jumped`, `landed`. |
| `MovingPlatform` (AnimatableBody2D) | Eases back and forth along `travel` every `period` seconds. |
| `LookaheadCamera` (Camera2D) | Looks ahead where the body faces. It holds its height during a jump, and catches up on landing or a long fall. |

A one-way platform is a `StaticBody2D` on layer 3 whose shape has `one_way_collision = true`.
