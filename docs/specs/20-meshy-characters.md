# 20. Characters from the project's own art

## Why

The site gets lovely anime art; the game's characters should be the same people. Spec 19 finds licence-checked
models made by others. This spec adds the project's own characters: the site's pictures turned into a rigged 3D
model with Meshy, or, without Meshy, standing in the 3D world as a 2.5D sprite.

## The flow

1. **The Cast step** (spec 19) asks `GET /api/meshy?from=<site run>` once. The reply is `{ ready, cost, art }`:
   whether `MESHY_API_KEY` is set (never the key), the price of one character, and up to 12 of the project's
   pictures, people first (by the prompt each was painted from).
2. **One more card** comes first in each role's grid when there is art. At rest it is the picture and one name:
   - **Meshy** when a key is set.
   - **Sprite** when there is none. Clicking it picks it at once: it is free.
3. **Opened**, the card shows a strip of the project's pictures to choose from and, for Meshy, one button:
   **Make · 35 credits**. The price on the button is the ask. Nothing is spent until it is clicked.
4. **Making** (2–4 minutes): the crew does it on a bench under the cards (see *The bench*).
5. **Made**: the model's picture, **Redo · 35 credits** (asks again, by its price) and **Accept**. Accept makes it
   the role's pick. A failure shows ⚠ and Meshy's reason, and the Make button again.
6. **Build**: the pick goes into `spec.cast`. `startGame` copies the GLB and its walk and run clips from the model
   library into the game's `public/models/`, or the sprite's picture as `public/models/<role>.png`. The build
   prompt (`castPrompt`) says how to load each one.

Without art (a game with no site behind it) there is no extra card, and the spec 19 shortlist is the cast step.

### The person's own pictures

**+ Pictures** in the role tabs (and **Add pictures** on an empty Cast step) takes pictures from disk; they can
also be dropped on the step. Each picture becomes one role, labelled from its filename (`03-lokee.png` → Lokee,
a leading number is dropped), with that picture as its art. `POST /api/meshy/art { from, name, data }` stores it
as `runs/<run>/img/game-cast-<role>.<ext>`: PNG, JPEG or WebP by their first bytes, 16 MB at most, into a run
that exists. A cast holds up to 16 own-art roles next to at most 4 found models.

`/cast` in "Tell the crew…" opens the Cast step on its own (no game spec needed), for the open build's art.

### Make all

With more than one role ready to make, the opened Meshy card also shows **Make all N · N×35 credits**. One click
sends `POST /api/meshy/batch { items: [{ role, src }], credits }`. The server checks the whole batch before
anything is spent: `credits` must equal 35 × the number of items (else 402), at most 16 items, no role twice,
every picture the project's own. Then each role is one job: 3 run at once and the rest queue. A role already
running joins its run, so it is never paid twice.

### The bench

While jobs run, a row of small tiles sits under the cards, one per job, with a crew worker of its own
(Pebble, Mochi, Tofu, Bean, Puff, Sprout). The worker's cursor (name only) works on its tile:

| Stage | Tile | Worker |
|---|---|---|
| Queued | dim, the waiting worker's face | parked |
| Modelling | a grey clay figure rises from the feet under a turning wire mesh, as far as Meshy's percentage | sweeps along the fill line |
| Rigging | bones and joints appear one by one | hops joint to joint |
| Saving | the coloured figure lifts | carries a small copy to the library box |
| Done | — | the model's picture lands in the library box (count, last three) and on the role's card, with Redo and Accept |
| Failed | ⚠ | — |

There is no 3D preview: it is a still picture, so no WebGL context is made. The bench is light by rule:

- Tiles are small, `contain: strict`, and animate only `transform` and `opacity`. There is no blur and no
  `will-change`.
- The bench pauses when off screen (IntersectionObserver) and stands still with reduced motion.
- Every picture on it is a copy at most 256 px, made once as WebP (`SwarmUI.small`), lazy and `decoding=async`.
  The full art is never drawn there.
- The page asks for job state on a single 2.5 s poll.

## Meshy

The calls, prices, result fields, polling policy and download guard come from Nous's official Meshy plugin
(`NousResearch/hermes-official-plugins`, `meshy/`, MIT). That plugin talks to Meshy through an MCP server the
Studio does not run, so `engine/meshy.mjs` makes the same few calls directly:

| Step | Call | Credits |
|---|---|---|
| Model | `POST /openapi/v1/image-to-3d`: the picture as a data URI, `ai_model: meshy-6`, textured, `enable_pbr: false`, `pose_mode: a-pose`, remeshed to ~15k triangles, GLB, and a texture prompt for anime cel shading, flat colours and clean lines, "not realistic" | 30 |
| Rig | `POST /openapi/v1/rigging` `{ input_task_id, height_meters: 1.7 }`. Includes the walking and running clips | 5 |
| Wait | `GET <route>/<id>` every 3 s while `PENDING`/`IN_PROGRESS`. 5xx, 408, 429 and network errors back off 3 → 6 → 12 … 60 s; a 404 in the first 90 s waits; any other 4xx stops | free |
| Save | `rigged_character_glb_url`, `basic_animations.walking_glb_url` / `running_glb_url` and the thumbnail into `<data>/models/meshy-<role>-<stamp>*.glb/.png` | free |

**35 credits a character.** Meshy's Pro plan is 1,000 credits a month, so about 28 characters.

### Safety

- **Ask first.** `POST /api/meshy` starts only when its `credits` equals the current price. A stale or missing
  number spends nothing (402).
- **One run per role.** A second click while one is running joins it instead of paying twice.
- **No retry of a paid call.** A create call that fails is not repeated by the engine; Redo is the person's.
- **The key** is read from the server's environment, `~/.hermes/.env` or `~/Documents/projects/.env`. It goes only
  in the `Authorization` header to `api.meshy.ai`, with redirects refused. It is never logged, returned, sent to
  the browser or sent to the asset host.
- **Downloads** come only from `https://assets.meshy.ai`, every redirect hop checked, 128 MB at most.
- **Art** is only the project's own pictures (`/img/<run>/<file>`), never a URL from the browser.

## Licence

A model Meshy makes from the project's own art belongs to the person (Meshy's terms for paid plans). No outside
credit is needed; CREDITS.md lists it as "Made from the project's own art with Meshy". The sprite is the
project's own art.

## The look

Anime family only: the texture prompt asks for cel shading and says "not realistic", and the build prompt gives
the model the game's cel shader and outline. The sprite is a camera-facing billboard (`THREE.Sprite`, Godot's
`Sprite3D` with billboard on) on the floor with a soft round shadow, about 1.7 m tall, flipped to face where it
moves, with a small walking bob and a squash on hits.

## Done when

- [x] `engine/meshy.mjs`: key lookup, price, image-to-3D, rig, polling, guarded downloads, the cast picks.
- [x] `GET /api/meshy`, `POST /api/meshy`, `GET /api/meshy/job`, the thumbnail route.
- [x] The Cast step's own-art card: Meshy (with a key) or Sprite (without), picture strip, Make / Redo with the
      price, Accept.
- [x] `cleanCast`, `castPrompt`, `castCredits` and `startGame` handle `meshy` and `art` picks.
- [x] Tests on a mocked Meshy (`tests/meshy.test.mjs`): price, key lookup, request body, polling policy, the
      full run, a failed rig, no key, the download guard, cast picks. No real credits.
- [x] The person's own pictures (`+ Pictures`, drop, `/cast`), `POST /api/meshy/art`.
- [x] Make all: `POST /api/meshy/batch` with the total checked by the server, a queue of 3 at once, one worker
      a job, and the bench. Tests: wrong totals, a bad item, duplicates, over 16, the queue and joining.
- [ ] One real run with a key, checked by eye before it is shown.
- [ ] A turntable `<model-viewer>` on the Made card instead of the still picture.

## Out of scope

- Animations past walk and run (`meshy_animate`, 3 credits each).
- Text-to-3D without a picture.
