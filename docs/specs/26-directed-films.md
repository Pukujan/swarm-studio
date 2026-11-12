# 26. Directed films

The owner, 2026-11-11: "video generation it still sucks a lot and feels a lot like template based
repeatable generation rather than smart prompt based routing ... sure it looks good but i think it can
be a lot better ... while making sure every prompt always gets good result too".

Spec 15 made the storyboard prompt-driven: one model call writes beats with a length, layer, camera,
cut and music cue. Films still come out alike, for five reasons this spec removes:

1. **Nobody decides what kind of film it is.** The writer gets the prompt, seven outlines and two random
   "twists". Pace is read from keywords. Every film is checked against one shape: it must end on a card
   with the name, and the no-model fallback has two shapes (fast, and open … cta).
2. **Beats are slides.** A beat is one of eleven fixed kinds (`open`, `image`, `split`, `list`, `quote`,
   `cta` …), each with one layout and one entrance. How a beat is made (still, clip, capture, type) is
   decided after the fact, by what files happen to exist.
3. **The music follows the cuts.** Beat lengths are rounded to the half beat of a tempo the writer
   guessed, and the score is written to those times. A track from ElevenLabs does not land its hits
   where it was asked to, and a voice line stretches its beat off the grid.
4. **Layouts are fixed.** Seven layout families restyle the same eleven kinds.
5. **Nothing looks at the film.** A weak shot ships.

## What changes

### 1. The director (`engine/director.mjs`)

Before the storyboard, a director reads the prompt, the build (pages, pictures, footage, whether it is a
game or an app) and the plan the person picked, and writes a **treatment**:

```json
{"kind":"gameplay","why":"a game with real footage, and the prompt asks for a trailer",
 "logline":"one sentence: what this film is about",
 "acts":[{"name":"cold open","seconds":4,"intent":"what happens here, for this build"}],
 "pace":"fast","voice":false,"closing":"title"}
```

A film is one of six **kinds**. Each has its own grammar (`KINDS` in `director.mjs`): its acts and
their share of the runtime, how long a shot runs in each act, which layers it leans on, how many words
it shows, how the camera moves, how it opens, how it closes and how its music moves.

| Kind | Opens on | Closes on | Shape |
|---|---|---|---|
| `demo` (product demo) | the problem, or the product in use | the invitation (a `cta`) | problem, the product at work (proof), what you get, invitation. Narration allowed. |
| `mood` (mood piece) | a picture, no words | the name small over the last picture | long shots, slow camera, fades, at most a quarter of the time in type, no closing card |
| `character` (character story) | a person and their moment | their last line, the name under it | before, the turn, after. One person, second voice for their lines. |
| `gameplay` (gameplay trailer) | footage, cold | a title card with the name | footage first and at least 40% of the runtime, a montage that speeds up, a hard stop, the drop |
| `music` (music-led cut) | the first hit | the last hit, the name on it | type and pictures land on the track's hits; almost no sentences |
| `announce` (announcement) | the one fact (what, when, where) | the date or the action | short: the news, why it matters, how to join |

- A model call picks the kind and writes the acts for this build. With no model, or an answer that fails
  its check, `direct()` picks by rules: what the prompt asks, then what the build is (footage of a game
  → `gameplay`; a calm prompt → `mood`; a date or a place → `announce`; else `demo`).
- The five plans stay, as starting points: Promo leans `demo`, Kinetic type `music`, Slideshow `mood`,
  Teaser `announce` (`gameplay` for a game), Customer story `character`. The prompt can pull away from
  the plan; the plan only breaks ties.
- The storyboard writer gets the treatment in place of the outlines and twists: the acts in order with
  their time budgets and the kind's grammar. The seed still varies the film, inside the kind.
- `checkBoard` checks the film against **its kind's** grammar, not one shape. Only `demo` and
  `announce` end on a `cta`. The name must show somewhere in the last two beats; when it does not, the
  kind's own closing is added (a title card, or the name over the last picture), never a `cta` by reflex.
- The treatment is saved in `storyboard.json` (`film`) and sent with `video:story`.

### 2. Cuts on the music (`engine/musiccut.mjs`)

The track is made first and the cuts are placed on it.

1. The treatment's acts give the music its arc (sections on bar lines) before any beat is final.
2. The track is made: ElevenLabs when there is a key, else the studio's own score.
3. `analyse()` decodes it and measures: the tempo and where the beat falls (not assumed to start at 0),
   every onset with its strength, the loudness curve, the drop (the biggest jump in loudness after a
   quiet stretch) and the quiet passages.
4. `cutToMusic()` moves every cut to a beat: a beat marked `hit` goes to the nearest strong onset, the
   `drop` beat to the measured drop, a `stop` to a quiet passage when there is one, a change of section
   to a downbeat, and every other cut to the nearest beat (half beats inside a fast montage). A cut
   moves at most a third of its shot's length. A beat with a spoken line never gets shorter than the
   line; it runs on to the next beat of the music instead.
5. The studio's score is then written again to the final times, so its booms sit on the cuts. A
   generated track is kept as it is.

`storyboard.json` gets `musicCut`: the measured tempo, how many cuts sit within 60 ms of a beat, and how
far each moved.

### 3. Shots, with a route per shot (next)

The writer writes **shots**: subject, camera move, length, what changes during the shot, and `make`:
`still` (a painted still with camera motion), `clip` (the still animated by the video model), `capture`
(a real recording: footage of the running build, or the canvas replay `?replay=<run>` filmed headlessly)
or `type`. The route is the planner's choice per shot, inside the kind's grammar and a budget (at most 3
paid clips a film, asked for as today).

### 4. Composed layouts (next)

A shot's frame is composed from blocks in place of the eleven kinds: where the type sits (nine anchors,
a size, a weight), how the picture is framed (full, inset, band, mask shape), layers (picture, tint,
type, texture) and how each enters. The eleven kinds become eleven presets of those blocks, so every
old storyboard still plays.

### 5. The critic (next)

A draft is rendered small and fast. Frames from every shot go to the vision model with the prompt and
the treatment. It marks weak shots (unreadable type, a picture that does not show what the shot says,
two shots that look the same, a dead stretch). Each marked shot is fixed once (another layout, another
picture, a shorter length) and the final is rendered. No vision model, or a failed critic call: the
draft's storyboard renders as the final.

## Guarantees

- **Every free choice has a floor.** The director falls back to rules. A storyboard that fails its
  kind's check is repaired; one that cannot be repaired is cut by `fallbackBoard` in that kind's shape; a
  shot whose route fails becomes the next route down (`clip` → `still` → `type`); a layout that fails its
  check becomes the old kind's preset; a track that cannot be analysed leaves the writer's lengths as
  they are. A film always finishes.
- **Generated clips are checked frame by frame** before they are used (with step 3): the first frame
  against its still, jump cuts, and objects appearing or vanishing. A failed clip becomes a camera move
  on its still.
- **The regression set** (`tests/films/set.json`, run by `scripts/film-set.mjs`): 20 prompts over five
  fixture builds (a shop site, an event site, a game with footage, an app, a portfolio). After every
  change it is storyboarded and scored:
  - **finishes**: 20 of 20 produce a storyboard the renderer accepts;
  - **sameness**: how alike the 20 films are in structure (the average likeness of their beat
    sequences, 0 to 1; lower is better), plus how many different openings and closings there are;
  - **fit**: whether each film is the kind its prompt expects (each prompt names one or two);
  - **repairs**: how many fixes the check made per film, and how many films fell to a floor;
  - **on the beat**: the share of cuts within 60 ms of a beat of the track.

  `node --test` runs the set with no model (rules and fallbacks only) and fails when a film does not
  finish or the floors fall below their marks. With a model key the script runs the real writer, and
  `--render` renders drafts on a heavy machine.

## Build order

1. The regression set and its scorer, with today's numbers as the baseline.
2. The director and per-kind checks.
3. Cuts on the music.
4. Shots and routes, the clip check, the canvas replay as a capture.
5. Composed layouts.
6. The critic.

## Done when

Three prompts on three builds give three films whose structure visibly differs (how they open, how long
shots run, how they close), the set finishes 20 of 20 with a lower sameness than the baseline, and cuts
sit on the beat whichever way the music was made.
