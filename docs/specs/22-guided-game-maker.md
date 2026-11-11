# 22. Guided game maker

## The problem, in plain words

ARES's heroines were made by hand on 2026-11-10 and 11: a design picture each, painted 3 × 2 sprite sheets cut
into strips, a Fish Audio voice per heroine, Japanese lines per move, combos, effect levels and outfits. All of it
now lives in one config file (`games/ares/data/heroes.json`) and three tools that read it:

| Tool | Does | Reads |
|---|---|---|
| `engine/voice.mjs` | records every move and bark `line` to `assets/voice/<hero>/<key>.mp3` (Fish or ElevenLabs, key from the env or an Octo vault lease) | `voices`, `heroes.*.voice`, `moves.*.line`, `moves.*.fx.levels.*.line`, `barks` |
| `engine/skins.mjs` | paints every sheet of one outfit from its design picture (`imagegen.py --ref --edit`), cuts and checks it into `assets/skins/<hero>/<outfit>/`, writes `pack.json`; `--fx` paints the effect sheets on black | `sheet` (grid, layout, fx style), `heroes.*.art` (look, personality, refs, outfits, sheets), `fx.sheets` |
| `games/ares/tools/sheets/cut.py` | keys out the grey, cuts a 3 × 2 sheet into a strip of six frames, checks it (`qc.ok`, `edge`, `height_spread`) | one painted PNG |

But only someone at a terminal can run them. The game maker today (`engine/game.mjs`) asks nine chip questions,
writes a JSON spec and hands it to a coding run; `engine/plan.mjs` (spec 21) turns the answers into nine Plan
cards, sketch sheets and a priced gate; `engine/cast.mjs` (spec 19) finds licensed 3D models. None of them writes
`heroes.json`, so a maker who wants their own heroines, voices, moves and outfits has no way in.

This spec adds **guided mode**: the same Plan board walked one step at a time, where every choice is a small,
playable slice (a moving sprite strip, a screenshot, a short clip, a voice sample) and every pick writes one part
of the game's config. The one-prompt build stays the default; guided mode is for people who want to shape every
part. Both paths end in the same config and call the same tools.

## Two paths, one front door

```
+ Create (Game) ─→ quick questions ─→ [ Build ]  ───────────────────────────→ one-prompt build (default)
                                     [ Shape it ] ─→ Plan board, guided ─→ Lock · N ─→ same build
```

- **No second front door** (RULES A1). + Create with the Game kind is still the only start. The grill pop's last
  question ends with the one primary **Build** (default, unchanged) and a secondary **Shape it**. Shape it opens
  the plan's board in guided mode instead of building.
- **The one-prompt path does not change.** Build fills every step from its defaults (`planFromAnswers` plus the
  heroes defaults below) and goes straight on. A maker can still open the board later and walk the steps.
- **One config.** Both paths produce the same plan, and the plan carries a `heroes` config with the same shape as
  `games/ares/data/heroes.json`. On Build it is written to `<game>/data/heroes.json` and the tools run on it.
- **Off any time.** Guided mode is a view of the board, not a different plan: the progress ring's sheet has a
  **Board** item that drops back to the free canvas with every pick kept.

## Borrowed from

RULES 31: one mature product. Guided mode follows **Apple's Mac configurator** (Buy Mac): one group of options at a
time, a large live preview of what you are building, the running price in one place, one button that carries it,
and you can jump back to any group without losing the rest. We take the order and behaviour, not the look.

## The steps

Seven steps. A step that does not apply to the plan is not shown (RULES A6): a 3D-model cast (spec 19 / 20) skips
**Characters**, **Poses** and **Outfits** sprite work and shows the cast shortlist in their place; a game with no
combat skips **Moves**. The ring counts only the steps shown.

| # | Step | At rest (≤ 4 slices) | A pick writes | Tools it calls |
|---|---|---|---|---|
| 1 | **Game** | 4 game types as clips: a 6 s loop of a real built game of that type | `plan.answers.genre`, `type`, `look`, the Combat card's `style`, the World card's `camera` | `game.mjs` `plan(answers)` for engine and skills; `plan.mjs` `planFromAnswers` |
| 2 | **World** | 4 level looks as screenshots, then the picked one's 2–4 backdrops | World card (`setting`, `stages`, `backdrops`), `plan.backdrops` | `POST /api/plans/:id/backdrops` (spec 21) |
| 3 | **Characters** | a cast sheet (spec 21's sketch sheet), then per picked cell the idle strip as a moving loop | `heroes.<id>.name`, `role`, `weapon`, `art.look`, `art.outfits.default.design` (the picked cell, cut out), `art.refs` | `POST /api/plans/:id/sheet` `{ kind: 'cast' }`, `cellBox` + crop, `skins.mjs` `skinJobs` + `buildPack` with `only: ['idle']` |
| 4 | **Personality and poses** | 4 personality chips per heroine, each a face crop; then the pose loops (`loading`, `idle`, a win pose) | `heroes.<id>.personality`, `art.personality`, `poses` | `skins.mjs` with `only: [<pose sheets>]` |
| 5 | **Voice** | 4 voices as play buttons, each saying this heroine's start bark | `voices.<key>` (provider, voice id, model), `heroes.<id>.voice`, `barks.*.line` | `voice.mjs` `speakLine` into the preview cache |
| 6 | **Moves** | the move list as strips (character strip with its effect strip over it); a level slider 1–5 on the selected move; the combos as chains of strips | `moves.<k>` (`name`, `reading`, `input`, `anim`, `line`), `moves.<k>.fx.levels`, `combos` | `skins.mjs` for move sheets, `fxJobs` for effect sheets, `fxAt(move, level)` for the slider, `voice.mjs` for the move's line |
| 7 | **Outfits** | the default outfit plus up to 3 outfit designs; the picked one's idle and run loops | `art.outfits.<id>.design`, outfit packs | `skins.mjs` `--outfit <id>` |

The last step's primary is spec 21's gate: **Lock · N credits**. Before that the primary is **Next**, at the same
place and width (RULES 29).

### What each step shows, in detail

1. **Game.** Four cards, each a muted looping clip of a real build of that type (ARES for "Action 2.5D", the
   showcase builds for the rest), the type's name under it. Selecting one shows, in the inspector, the questions
   that type still needs (`look`, `length`, `target` from `QUESTIONS`) as chips. Clips are library files, never
   made per plan, so this step spends nothing.
2. **World.** Four level looks as stills (existing backdrops from `games/ares/assets/backdrops` and the template
   library), then, once one is picked and the style is locked, the plan's own backdrops painted from it. One wide
   picture each; **Draw again** in the inspector.
3. **Characters.** The cast sketch sheet (5 × 4) as in spec 21. A picked cell is cut out into a design picture and
   becomes that heroine's `default` outfit design. Its **idle** sheet is painted from it at once (one image) and
   cut, and the cell's slice turns into the moving idle loop. Up to 4 heroines are shown at rest; more go one layer
   down (RULES 3).
4. **Personality and poses.** Per heroine, four personality chips (playful, deadpan, cold, warm; or your own words)
   that set `art.personality` and the short `personality`. Picking one repaints only the idle sheet with the new
   face, so the maker sees the expression change. The pose row shows `loading`, `idle` and one win pose as loops;
   each can be drawn again.
5. **Voice.** Four voice cards per heroine, each with its name (`about`, e.g. 落ち着いた女性) and a play button. The
   sample is the heroine's own start bark in that voice, not a stock line, so the choice is heard in context.
   Picking a voice writes it under `voices` and on the hero. Barks are editable lines in the inspector; editing one
   records only that line again.
6. **Moves.** The move list as small strips, grouped by input (attack, spells, ult) so at most four groups show
   (RULES 3). Selecting a move shows, in the inspector: its name and reading, the line (with a play button), the
   input, and a **Level** slider 1–5 that plays the move with `fxAt(move, level)` applied: the effect art, its
   scale, projectile count and, at the top level, the cut-in, new name and line. **Combos** is a row of chains,
   each chain its strips in order; dragging a move into a chain edits `combos`.
7. **Outfits.** The default outfit and up to three more. A new outfit comes from a cell of an outfit sketch sheet,
   an uploaded picture, or a reference (below). Picking one paints only its idle and run sheets for the preview;
   the full pack (every sheet in `art.sheets`) is painted after the lock.

### Back, forth and edit

- **Next** and **Back** are the primary button and a ghost arrow beside the ring; ← and → do the same. Esc still
  goes up one level (RULES 7): selection → step → board → Projects.
- The **ring** in the top bar reads "3/7" (`aria-label` "Step 3 of 7"). Opening it shows the step names; any step
  can be jumped to. A step with no pick yet has an empty dot, a done step a full one, a step with a failed preview
  a ⚠ (RULES 10).
- **Editing never throws work away.** Going back and changing a pick marks only the previews that depend on it as
  stale (a new design picture marks that heroine's strips, not her voice). Stale previews keep showing with a
  dot until redrawn.
- Every pick is saved as it is made (`plan.updated`), so leaving and coming back lands on the same step.

## A concept from another game

At any step, the maker can bring a **reference**: a screenshot, a short video or a link, dropped on the stage or
added from the step's **+** edge icon. It belongs to that step only.

- **How it is read.** `engine/reference.mjs` already measures images and videos (`measureImage`, `measureVideo`
  with ffmpeg) and writes plain style notes (`describe`, `plainNotes`). Guided mode adds a **focus** per step:
  `world` asks for the setting, light and palette; `moves` for the attack shapes, rhythm and effect sizes seen;
  `outfits` for the cut, layers and materials; `characters` for the silhouette and role. For a video, frames are
  taken at its cuts (`rhythmOf`) and the notes cover the whole clip.
- **What it writes.** The notes, never the picture, become a prompt line on the step's options (for outfits, the
  design prompt; for moves, a suggested move with its `anim` sheet text and its `fx.levels`). The reference itself
  is never sent to the image model as a `--ref`, so its characters and art are never copied.
- **The rule.** Same as every spec (README): take the idea, never the name, character, art or text. The step's
  options drawn from a reference go through `cast.mjs` `blockHit` on their text, so a fan-model name or an adult
  word never reaches a prompt. The notes are kept on the plan (`plan.refs`) so anyone can see what was taken.

## How a choice writes into the config

The plan gains three fields:

```js
// <data>/plans/<id>.json, added to spec 21's shape
{
  guide: { on: true, step: 'voice', steps: ['game', 'world', 'characters', 'personality', 'voice', 'moves', 'outfits'], done: ['game', 'world'] },
  heroes: { _note, voices: {}, heroes: {}, sheet: {}, fx: {} },     // same shape as games/ares/data/heroes.json
  previews: [{ id, step, hero, kind: 'strip' | 'loop' | 'still' | 'clip' | 'voice', src, from: ['heroes.runner.art.outfits.default.design'], state: 'ready' | 'stale' | 'painting' | 'failed' }],
  refs: [{ id, step, kind, file, notes }]
}
```

- **One writer.** `engine/guide.mjs` (new) holds `applyPick(plan, step, pick)`: it returns the plan with the
  config keys from the step table set, and marks stale the previews whose `from` paths changed. The server, the
  Hermes skill and `/swarm guide` all call it.
- **Defaults.** `heroesDefaults(plan)` fills a full config from the Cast card's roster, the template's `sheet`
  contract (ARES's grid, layout and fx style) and two voices, so the one-prompt path and a half-walked guide both
  end in a config the tools accept. A remixed template (spec 21 part e) starts from the template's `heroes.json`.
- **On Build.** The plan's `heroes` is written to `<game>/data/heroes.json` (pretty, with its `_note`s), then the
  build runs, in order: `skins.mjs` per hero and outfit, `skins.mjs --fx`, `voice.mjs`. Previews already painted
  for a sheet are passed with `--from` so they are cut, not painted again.
- **Validated before writing.** `checkHeroes(config)` refuses a hero whose `voice` is not in `voices`, a move whose
  `anim` has no sheet, a combo naming a missing move, an outfit without a design file, or a level key outside 1–5,
  with the step to fix named, so the ⚠ lands on that step.

## Spending

Spec 21's rule holds: **nothing that costs credits or a coding run starts before the lock.** Guided previews are
pictures and voice lines, both cheap and from the person's own logins:

| Preview | Cost | Counted on the gate as |
|---|---|---|
| Game clips, World stills | none (library files) | – |
| A sketch sheet, an idle or pose sheet, an outfit's idle and run | one image each, medium quality | image runs |
| A voice sample or a re-recorded line | one TTS line (Fish's free model for the defaults) | voice lines |
| Reference notes | one planner call | – |

- Previews that spend show their count on the ring's sheet ("12 images · 9 lines"). There is no confirm per
  preview; the gate lists the pictures and lines still to make for the full packs.
- A failed paint or line is never retried by the engine; **Draw again** is the maker's.
- One preview job per sheet at a time: a second click joins the running one.

## What exists and what is missing

| Need | Exists | Missing (this spec builds it) |
|---|---|---|
| Paint and cut a sheet | `skins.mjs` `skinJobs`, `buildPack`; `cut.py` | calling them per sheet from the server, as a background job with progress, into the plan's preview folder instead of the game's `assets/skins` |
| A moving preview of a strip | `cut.py` writes the strip (frames side by side, `cell` = slot size in the `.json`) | **`strip → loop`**: `games/ares/tools/sheets/loop.py strip.webp out.webp [--fps 10] [--fx]` reads the slot size from the `.json` and writes an **animated WebP** (Pillow `save_all`, alpha kept) for the studio and a **GIF** only on export (GIF has 1-bit alpha). It also writes a first-frame PNG for reduced motion. |
| A move with its effect | strips for the character and for the effect; `fxAt(move, level)` | **`moveLoop(hero, move, level)`** in `engine/guide.mjs`: composites the effect strip (additive, scaled by the level's `scale`) over the character strip at the cell origin, then `loop.py` |
| A face crop for personality chips | `games/ares/assets/faces`, `face.gd` in the game | `faceCrop(strip)`: the top third of the idle strip's first frame, by the alpha box |
| Voice samples | `voice.mjs` `speakLine`, `ttsRequest`, the two voices in ARES's config | **a voice library** `engine/voices.json`: 8–12 curated Fish voices `{ key, provider, voice, model, about }`, and `sampleVoice(voice, line)` that caches `<plan>/voices/<voice>/<hash>.mp3` so a sample is recorded once |
| Gameplay clips for game types | `footage.mjs` `filmBuild` records a web build; Jev plays ARES (`games/ares/jev`) | a small **clip library** `web/clips/<type>.webm` (6 s, muted, 720p), recorded once from the showcase builds with `filmBuild` |
| Reading a reference for one step | `reference.mjs` `kindOf`, `measureImage`, `measureVideo`, `describe` | the per-step `focus` passed to `describe`, and the notes → options step |
| Writing the config | the shape, in `games/ares/data/heroes.json` | `applyPick`, `heroesDefaults`, `checkHeroes`, and writing `data/heroes.json` on Build |
| Effect levels in a picture | `fx.levels` with `scale`, `projectiles`, `trail`, `shake`, `cutin` | the slider only reads them; tuning numbers beyond the five levels stays in the file |
| Running the game with the picks | ARES reads its config at start | for a new game made from the ARES template, the coding run is told to read `data/heroes.json` the same way (a line in `gameBrief(plan)`) |

## API routes

Added to spec 21's routes. All under the plan; none spends credits.

| Route | Does | Spends |
|---|---|---|
| `POST /api/plans/:id/guide` `{ on, step }` | turn guided view on or off, go to a step | – |
| `POST /api/plans/:id/choose` `{ step, hero?, pick }` | `applyPick`; returns the plan and the stale previews | – |
| `POST /api/plans/:id/preview` `{ kind: 'sheet' \| 'move' \| 'outfit', hero, sheet?, move?, level?, outfit? }` | paint, cut and loop one preview in the background | an image |
| `GET /api/plans/:id/preview/:pid` | its state and `src` | – |
| `POST /api/plans/:id/voice` `{ hero, voice, line? }` | record a sample (cached) | a voice line |
| `POST /api/plans/:id/reference` `{ step, file \| url }` | read a reference for one step, add options from its notes | a planner call |
| `GET /api/voices` | the voice library (names and `about` only, no keys) | – |

Preview files are served at `/plans/<id>/previews/<file>.(webp|png|mp3)` by name pattern only. Keys stay with the
server (env or vault lease), never in the browser (README rule).

## UX, per docs/ux

- **No new zone** (RULES 27, 28). Guided mode is the Plan board with the stage zoomed to one section. The top bar
  holds the breadcrumb `Projects › <plan> › <step>`, the ring, the Back arrow and the one primary (Next, then
  Lock · N). The inspector opens only while a slice is selected.
- **Slices, not text.** A step at rest is at most four slices, each its picture or loop and its name (RULES 3, 8).
  No step title sentence, no helper line: the breadcrumb names the step. Word budget 15 (RULES 30).
- **Motion.** Loops play on the selected or focused slice; the rest show their first frame. With
  reduced motion, all show the first frame and play on Enter (RULES 23).
- **Sound.** Voice samples play only on their play button, under the one Sound control (RULES 24); never on hover.
- **No tooltips, no new colour.** States are dots and rings with `aria-label`s; pictures are the only colour.
- **Closing.** The ring's sheet closes with ×, Esc and an outside click (RULES 18).
- When this is built: add the guided steps to SITEMAP.md under 5b and the ring, Back arrow, Shape it and the
  step slices to INVENTORY.md.

## Test plan

- `tests/guide.test.mjs`: each step's pick writes exactly its keys in the step table; a design change marks that
  heroine's strips stale and leaves her voice ready; `heroesDefaults` on ARES's plan gives a config that
  `voiceJobs` and `skinJobs` accept; `checkHeroes` names the step for a missing voice, a missing `anim` sheet, a
  combo with a missing move, a level outside 1–5; a plan built with Build only and one walked through every step
  produce configs with the same keys.
- `tests/loop.test.mjs` (Python fixture, no image model): a strip from `cut.py` on a test sheet becomes a 6-frame
  animated WebP at the `.json` slot size with alpha kept; `--fx` keeps the black; the first-frame PNG matches
  frame 0.
- `tests/voice.test.mjs` addition: `sampleVoice` records once and serves the cache on the second call (mocked
  fetch).
- `tests/reference.test.mjs` addition: an outfit reference's notes become option prompts and never a `--ref`; a
  blocked word in the notes is dropped.
- `scripts/check.sh`: `POST /api/plans/:id/choose` round-trips; `POST /preview` on a plan with no image login
  answers with a ⚠ state, not a 500.
- By hand: walk ARES's template through all seven steps at 1280 and 768, light and dark; Back from step 6 to 3,
  change the design, and see only that heroine's strips go stale; Build writes a `data/heroes.json` the game
  starts with.

## Done when

- [ ] The spec (this file).
- [ ] (a) `engine/guide.mjs`: `applyPick`, `heroesDefaults`, `checkHeroes`, and Build writing `data/heroes.json`
  then running `skins.mjs`, `skins.mjs --fx` and `voice.mjs`.
- [ ] (b) `loop.py` (strip → animated WebP, GIF on export) and `moveLoop` with effect levels.
- [ ] (c) The preview and voice routes as background jobs, the voice library and the sample cache.
- [ ] (d) The guided view on the Plan board: Shape it, the ring, Back and Next, the seven steps' slices.
- [ ] (e) References per step through `reference.mjs` with a focus.
- [ ] (f) The clip library for the Game step.

## Out of scope

- Drawing or editing frames by hand; the maker redraws a sheet, never a pixel.
- Tuning numbers past the five effect levels, hitboxes or frame timing in the UI; they stay in the config file.
- Voice cloning from the maker's own recording, and any paid TTS voice by default.
- 3D model work in guided steps; spec 19 and 20 keep the 3D cast, and guided mode shows their shortlist in place
  of the sprite steps.
