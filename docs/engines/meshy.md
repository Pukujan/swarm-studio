# Meshy

Glue: engine/meshy.mjs, engine/cast.mjs, engine/plan.mjs, engine/planart.mjs, server/plans.mjs, server/server.mjs, web/canvas/rooms.js, web/plan.js
Status: optional (person connects)

Meshy is a paid outside service that turns pictures into textured 3D models and rigs them (https://api.meshy.ai,
engine/meshy.mjs:19). No Meshy code is vendored: Swarm makes a few HTTPS calls itself, modelled on Nous's official
Meshy plugin (MIT), whose MCP server Swarm does not run (engine/meshy.mjs:10-14, docs/specs/20-meshy-characters.md:71-73).
A model made from the project's own art belongs to the person on a paid plan (docs/specs/20-meshy-characters.md:98-100).

## What it already does

- Image-to-3D and multi-image-to-3D (1–4 views), textured, GLB out (engine/meshy.mjs:25, 117-139).
- Rigging of a humanoid (biped) model, returning a rigged GLB and FBX plus free walking and running clips
  (https://docs.meshy.ai/en/api/rigging, fetched 2026-11-12; engine/meshy.mjs:143-147).
- Rigging limits: humanoid only, textured, face toward +Z, at most 380,000 triangles; options Swarm does not use:
  `skeleton_template` (`mixamo`, `ue5_mannequin`), `include_fingers`, `model_url` (https://docs.meshy.ai/en/api/rigging, fetched 2026-11-12).
- An animation library applied to a rig: `POST /openapi/v1/animations` with `rig_task_id` and `action_id` or up to
  10 `action_ids`, GLB/FBX/USDZ out, about 3 credits a clip (https://docs.meshy.ai/en/api/animation, fetched 2026-11-12).
  Swarm does not call it yet (engine/meshy.mjs:25 has no animations route).
- A balance route (engine/meshy.mjs:25). Unchecked: nothing in engine/meshy.mjs calls it.
- Text-to-3D exists but is out of scope (docs/specs/20-meshy-characters.md:127).

## When Swarm uses it

- Never by default. Owner: "definitely dont wanna start with meshy" (DECISIONS.md:95). Every game plan is painted 2D
  unless the person says 3D in the idea or the Look answer; a 2D plan has no Meshy rows and costs no credits
  (docs/specs/21-plan-before-spend.md:87-90, engine/plan.mjs:193).
- A 2D plan's build paints sprites and skips Meshy entirely (server/plans.mjs:73-83).
- The Make box suggestions name Meshy only in the 3D one (engine/intake.mjs:125-126).
- The Cast step shows a Meshy card only when a key is set and there is art; otherwise a free 2.5D Sprite card (docs/specs/20-meshy-characters.md:14-16, engine/meshy.mjs:225-229).
- An alternative without Meshy: licence-checked models from VRoid Hub and Sketchfab (engine/cast.mjs:1-12, docs/specs/19-cast-from-real-models.md).

## How Swarm drives it

- **Cast step (spec 20).** `GET /api/meshy?from=<run>` returns `{ ready, cost, art }`, never the key (server/server.mjs:3445-3452).
  `POST /api/meshy` and `/api/meshy/batch` go to `meshyJobs().start` / `.batch`, which refuse unless `credits`
  equals the price shown (402), at most 16 per batch, 3 running at once, one run per role (engine/meshy.mjs:235-315).
- **Plan build (spec 21).** On a locked 3D plan, `runBuild` paints front, side and back turnarounds, then calls
  `makeCharacter({ images, polycount })` per character; without a key the character fails with "no Meshy key" (server/plans.mjs:84-115).
- **`makeCharacter`** posts image-to-3D (one picture) or multi-image-to-3D (two or more), `meshy-6`, textured,
  `enable_pbr: false`, an anime cel `texture_prompt`, `pose_mode: a-pose`, remeshed triangles (15k single, 40k multi),
  then posts the rig with `height_meters: 1.7` (engine/meshy.mjs:117-140, 181-202).
- **Polling.** Every 3 s while `PENDING`/`IN_PROGRESS`; 5xx, 408, 429 back off to 60 s; a 404 in the first 90 s waits; 15 min limit (engine/meshy.mjs:77-112).
- **What comes back.** `{ file, clips: { walk, run }, thumb, tasks, credits }`: `meshy-<role>-<stamp>.glb`, its walk
  and run GLBs and a PNG thumbnail in the model library (engine/meshy.mjs:206-216). Downloads only from
  `https://assets.meshy.ai`, every redirect hop checked, 128 MB cap (engine/meshy.mjs:150-166).
- **Into the game.** The pick is a cast entry `source: 'meshy'`, `rigged: true` (engine/meshy.mjs:221-224); the server copies the GLB and clips to `public/models/` (server/server.mjs:2286), and `castPrompt` tells the crew to load it with GLTFLoader in three.js or import it in Godot, retargeting clips by bone name (engine/cast.mjs:299-300). Godot ports copy them to `assets/models` (engine/port.mjs:49-56).

## Cost display

- Prices live in one table: model 30 (meshy-6 textured), rig 5, so 35 credits a character; props 15 (meshy-6-lite); clips 3 (engine/meshy.mjs:27-40, engine/plan.mjs:39-45). Source: Nous plugin's table as of 2026-10-12 (engine/meshy.mjs:27).
- Buttons read "Make · 35 credits", "Redo · 35 credits", "Make all N" (web/canvas/rooms.js:1037-1038, docs/specs/20-meshy-characters.md:18, 40).
- The plan gate lists Characters, Rigs, Animations, Weapons rows and "Lock · N credits"; a 2D plan's gate counts pictures instead (web/plan.js:347-362, engine/plan.mjs:246-249).
- The lock and every Meshy call check the price stamped at the lock (engine/plan.mjs:276-280, docs/specs/21-plan-before-spend.md:127).

## Rigging and animation

- Every made character is rigged (5 credits) and comes with walk and run only (engine/meshy.mjs:29, 140-147).
- The plan prices a shared set of 8 clips (3 each) and weapon props, but the build does not make them yet (docs/specs/21-plan-before-spend.md:290-293, engine/plan.mjs:242-249).
- Non-humanoid plans draw turnarounds in a neutral pose, not A-pose (engine/planart.mjs:224); Meshy's rig is humanoid only (https://docs.meshy.ai/en/api/rigging, fetched 2026-11-12). Unchecked: what Swarm does when a non-humanoid is sent to the rig.

## What the person connects

- `MESHY_API_KEY`, optional, secret (plugin.yaml:25-27). The launcher reads it through Hermes's secret scope and hands it to the server (launcher.py:40, 223-228); `meshyKey()` reads only the environment (engine/meshy.mjs:44-46).
- A Meshy account with credits (Pro is 1,000 a month, about 28 characters) (docs/specs/20-meshy-characters.md:82).
- Unchecked: no download and no Hermes connector.

## Limits inside Swarm

- The key goes only in the Authorization header to api.meshy.ai with redirects refused; never logged or sent to the browser (engine/meshy.mjs:42-62).
- Art sent is only the project's own pictures, as data URIs (png, jpg, webp) (engine/meshy.mjs:168-174, docs/specs/20-meshy-characters.md:94).
- A failed paid call is not retried by the engine; Redo is the person's (docs/specs/20-meshy-characters.md:89).
- No 3D preview on the Cast bench, only a still (docs/specs/20-meshy-characters.md:60).
- Look is anime cel, never realistic (engine/meshy.mjs:32-33, DECISIONS.md:130).

## Open questions

- Owner rule: "A cost always shows its unit and source" (DECISIONS.md:95). Buttons and the gate show "credits" but do not name Meshy (web/canvas/rooms.js:1038, web/plan.js:360).
- Spec 20 says the key is also read from `~/.hermes/.env` or `~/Documents/projects/.env` (docs/specs/20-meshy-characters.md:90); the code and launcher read no .env file (engine/meshy.mjs:44-46, launcher.py:226). The spec is stale.
- The price includes animations and weapons the build does not make (docs/specs/21-plan-before-spend.md:290-293).
- Not done: one real run with a key, checked by eye; a turntable viewer (docs/specs/20-meshy-characters.md:121-122).
- Prices are from 2026-10-12; Meshy's pricing page was not fetched. Fetching https://docs.meshy.ai pricing would settle it.

## Sources

- AGENTS.md, docs/PRODUCT.md, docs/PLANS.md, docs/decisions/README.md, 0002, 0003, 0010, 0011
- ../../../DECISIONS.md (hackathon folder), lines 43, 95, 130
- engine/meshy.mjs, engine/cast.mjs, engine/intake.mjs, engine/planart.mjs, engine/plan.mjs, engine/port.mjs
- server/plans.mjs:60-125, server/server.mjs:69, 1449-1457, 1668-1713, 2283-2287, 3445-3475
- web/canvas/rooms.js:823-884, 1037-1038, web/plan.js:340-362
- plugin.yaml, launcher.py:40, 196-228, README.md:205-225
- docs/specs/04-3d.md, 19-cast-from-real-models.md, 20-meshy-characters.md, 21-plan-before-spend.md
- https://docs.meshy.ai/en/api/rigging (fetched 2026-11-12)
- https://docs.meshy.ai/en/api/animation (fetched 2026-11-12)
