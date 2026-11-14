This game starts from the Side-view platformer starter (Godot 4). It is already in the project:
- res://addons/feel_platform: PlatformerBody (run, jump with coyote time, buffer, variable height, corner correction, one-way drop-through, riding platforms), MovingPlatform, LookaheadCamera. Its README.md lists the API. Do not rewrite or copy these; build on them.
- res://scripts/main.gd (the demo hero, camera and HUD) and res://scripts/level.gd (StarterLevel: block, ledge, mover, build): this game's own, change them freely.
Rules for this starter:
- The hero is a PlatformerBody. Tune it with its exports (jump_height, jump_time, run_speed, coyote, buffer), never a new movement script. Enemies that walk can be PlatformerBody too, with use_input = false and input_dir set by their AI.
- One-way ledges are on physics layer 3 (PlatformerBody.ONE_WAY_LAYER) with one_way_collision on; use StarterLevel.ledge.
- A painted hero replaces the placeholder Polygon2D children with a Sprite2D or AnimatedSprite2D; keep the 20 × 30 collision box or set PlatformerBody.size.
- The feel test (-- --feel with --fixed-fps 60) must still pass: keep res://scripts/feel_test.gd and StarterLevel.
