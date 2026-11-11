# The hero's idle, animated

A big game's hero gets a painted six-pose idle sheet. ARES's Oracle and Baker idles were made a better
way: one painted frame, animated by a video model, keyed and packed into a 24-frame loop. Game mode now
offers that, and has a cheaper route for when no video model is set up. The routes, in order:

1. **Video**: the video model the person picks animates the painted frame.
2. **Keys**: with no video model, a no to the clip, or a clip that fails, close keyframes are painted
   over the same base frame and the in-betweener (RIFE by default) fills in the frames between them.
3. **Painted**: the six painted poses, as before, when the other two can't run or fail their checks.

## The video model is the person's pick

`paintGame` (`server/server.mjs`), called from `buildBig` (`engine/appjob.mjs`), paints the art list. When
it has the hero's sprite, `idleGate` runs while the rest paints.

- **The choices** (`idleOptions`, `engine/idle.mjs`) are every video provider Hermes has signed in
  (`videogen.py --list`, the same list the Film panel's clips row reads): Veo through FAL or OpenRouter,
  xAI's Grok Imagine, Kling, Seedance, Hailuo or Wan on FAL, and any other the list shows.
- **The order** is the saved pick (`models.json` `idle`: `{provider, model}`) first, then Veo as the
  known-good default, then the rest. A pick can name a model the provider takes but doesn't list, such
  as a FAL Kling id. `"off"` means no clips, so the keys route runs.
- **Per-model tuning.** Each model has its own entry in `IDLE_MODELS`: the name the chat shows, the list
  price per second, the frame shape and clip length it draws well, and its prompt tuning. `full` is the
  long, exact `sprite-idle-green` brief Veo reads well. `short` is a few plain lines, which Grok, Kling,
  Seedance and the like follow better. An unknown model gets the generic entry and its Hermes label.
- **The ask.** Hermia's chat card shows a model select when there's more than one, plus **Animate · $N**
  and **No clip** (**Keep painted** when no in-betweener is set up). The price and cost line follow the
  model picked. The answer (`POST /api/runs/:id/app/idle {ok, usd, option}`) is refused when the price
  differs (402), as with Meshy. The model picked becomes the next build's default.
- **Answering ahead.** A build input `{"idle": {"usd": 0.56, "video": "xai/"}}` says yes to that model
  at that price, and `{"idle": "no"}` says no clip. No answer in 5 minutes (`SWARM_IDLE_ASK_MS`) means no
  clip.
- **The API.** `GET /api/models` lists the choices under `idle` (with the in-betweener's name).
  `POST /api/models {role: "idle", provider, model}` sets the pick (`"off"` means no clips, `null` clears
  it).
- **Reuse.** An animated idle kept with the run (`game-sheet-hero-idle.json` with `video` or `keys`) is
  used again on Try again, not paid for again. The idle's own pictures kept from a build before, such as
  its keyframes, are reused too.

## Route 1: the clip (`scripts/idle_sheet.py start` and `sheet`)

1. **The first frame.** Frame 0 of the painted idle strip (else the hero sprite) is cut out and set on
   flat `#00FF00` (`#FF00FF` when the hero's look is green), at 80% of a 720p frame with the feet at 93%.
   It's drawn in the model's own shape. Each start image has its own name (`idleStartName`), because kits
   that attach images by file name would otherwise send an older picture.
2. **The clip.** `videogen.py` with the model's prompt tuning and length.
3. **The loop**, on the heavy machine:
   - It picks the span of about 2.8 s (2.2 to 3.0 s, after the first 0.15 to 0.6 s) whose end looks most
     like its start, with the head counted twice.
   - It samples 21 frames from that span and adds 3 in-between frames, made on the raw green frames
     before keying, to close the seam.
   - Each frame is keyed and despilled with the ARES keyer (`games/ares/tools/sheets/cut.py`), cleared of
     stray specks and aligned on the feet.
   - The frames are packed into a WebP strip of square cells of up to 680 px (24 cells stay under WebP's
     16383 px), with `fps` = frames / loop length, `anchor.feet` and a `qc` block.

If the clip fails (no clip, a bad cut, the checks below), the keys route runs next.

## Route 2: close keyframes and the in-betweener (`idle_sheet.py keys`)

Big pose gaps are what make an in-betweener ghost, so the keys stay close:

1. **The keyframes.** One sheet is painted over the sprite through the normal sheet painter
   (`IDLE_KEY_FRAMES`). Frame 1 is exactly the base pose, frame 2 breathes in, frame 3 is the hair and
   loose clothes swayed slightly, and frame 4 is a blink. This sheet is never used as game art itself.
2. **Too far apart is refused.** The keys are aligned on the feet. A key whose figure overlaps the first
   by less than 75% is refused before anything is made.
3. **The loop.** Breathe in and out (6 + 6 frames), sway out and back (4 + 4), then a quick blink
   (2 + 2), for 24 frames at 10 fps. The made frames come from the in-betweener on the flat-colour
   frames, before keying.
4. **The ghost check.** Every made frame is checked. It's a ghost when, where the two keys differ, the
   frame sits at their cross-fade, or it carries much more see-through edge than the keys do. Any ghost
   fails the sheet, and the painted idle stays.

## The check, for both routes

All frames on dark (`-check.png`) go to the vision reviewer (`idleMessages`). It looks for extra
objects, a changed face, flicker, ghosting, key leftovers and a 3D look. On a pass the sheet replaces
`sheet-hero-idle` in the game, and the art brief tells the crew to loop it whenever the hero stands
still, at its own fps. The chat card updates in place: the first frame (or the keyframes), then the clip,
then the keyed loop.

## The heavy machine and the in-betweener (`engine/heavy.mjs`)

ffmpeg and the in-betweener run where `SWARM_HEAVY_HOST` (an SSH alias, such as `mac-pro`) or
`<data>/heavy.json` point. The script and its files are copied to `~/swarm-heavy/<job>`, run in a login
shell, and the outputs copied back. Without a host they run here. With no Python named, the first one
there with numpy, scipy and Pillow is used.

The in-betweener is RIFE by default: `SWARM_RIFE` (or `heavy.json` `rife`) is the `rife-ncnn-vulkan`
binary. Another frame interpolator is set with `SWARM_INTERP` (or `heavy.json` `interp: {cmd, name}`): a
command on the heavy machine with `{a}` `{b}` `{out}` `{t}` in it (the two frames, the frame to write,
the time between them), with `SWARM_INTERP_NAME` as the name the chat shows. With no in-betweener, the
clip's loop is cut where it meets itself, and the keys route is skipped.

```json
{ "host": "mac-pro", "rife": "/Users/teresaguajardo/tools/rife-ncnn-vulkan-20221029-macos/rife-ncnn-vulkan" }
```

## Tests

- `tests/idle.test.mjs` covers:
  - the model choices, their order and prices, and per-model tuning;
  - the price check and the key colour;
  - start-image names and the two prompt tunings;
  - both routes' items, the build input, and the heavy and in-betweener config.
- `tests/test_idle_sheet.py` covers the loop picker, stray removal and the ghost check (a cross-fade is a
  ghost, a move is not).
