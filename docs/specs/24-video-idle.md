# The hero's idle from a video clip

A big game's hero gets a painted six-pose idle sheet. ARES's Oracle and Baker idles were made a better
way: one painted frame, animated by a video model, keyed and packed into a 24-frame loop. Game mode now
offers that as an optional step, at the clip's price.

## When it runs

`paintGame` (`server/server.mjs`), called from `buildBig` (`engine/appjob.mjs`), paints the art list. When
the list has the hero's sprite and a video model is set up (the Film panel's **clips** row, Hermes's
`videogen.py` providers: Veo through FAL or OpenRouter, xAI's Grok Imagine…), `idleGate` asks once while
the rest paints:

- The chat shows Hermia's card with the cost line (`Grok Imagine · one 4 s clip · about $0.56`) and
  **Animate · $0.56** / **Keep painted**. The price is the ask, as with Meshy: the answer
  (`POST /api/runs/:id/app/idle {ok, usd}`) is refused (402) when the price differs.
- No answer in 5 minutes (`SWARM_IDLE_ASK_MS`) means no. A build input `{"idle": {"usd": 0.56}}` says yes
  ahead of time, and `{"idle": "no"}` skips the question.
- No video model, a no, or any failure keeps the painted idle sheet. A video idle kept with the run
  (`game-sheet-hero-idle.json` with `video`) is reused on Try again, not paid for again.

## How the sheet is made (`engine/idle.mjs`, `scripts/idle_sheet.py`)

1. **The first frame.** Frame 0 of the painted idle strip (else the hero sprite) is cut out by its alpha
   and set on flat `#00FF00`, or `#FF00FF` when the hero's look is green, at 80% of a 720p frame with the
   feet at 93% (`idle_sheet.py start`). Each start image has its own name (`idleStartName`): kits that
   attach images by file name would otherwise send an older picture.
2. **The clip.** `videogen.py` with the `sprite-idle-green` prompt: same 2D anime art, locked camera,
   small motions, feet planted, flat key, no particles. 4 s; square for xAI, 16:9 for Veo.
3. **The loop** (`idle_sheet.py sheet`), on the heavy machine:
   - The span of about 2.8 s (2.2–3.0 s, after the first 0.15–0.6 s) whose end looks most like its start,
     with the head counted twice.
   - 21 frames sampled from it, plus 3 RIFE frames that close the seam, made on the raw green frames
     before keying. RIFE is used only for this character seam, never for FX or between separately
     painted frames.
   - Each frame keyed and despilled with the ARES keyer (`games/ares/tools/sheets/cut.py`), with stray
     specks dropped, then aligned on the feet.
   - Packed into a WebP strip of square cells ≤680 px (24 × cell stays under WebP's 16383 px), with
     `fps` = frames / loop length, `anchor.feet` and a `qc` block (edge, area spread, jumps, seam, head
     drift, key left, strays).
4. **The check.** All frames on dark (`-check.png`) go to the vision reviewer (`idleMessages`), which looks
   for extra objects, a changed face, flicker, key leftovers and a 3D look. On a pass the sheet replaces
   `sheet-hero-idle` in the game. The art brief tells the crew to loop it whenever the hero stands still,
   at its own fps.

The chat card updates in place: the first frame while the model works, then the clip, then the keyed
loop beside it.

## The heavy machine (`engine/heavy.mjs`)

ffmpeg and RIFE run where `SWARM_HEAVY_HOST` (an SSH alias, such as `mac-pro`) or `<data>/heavy.json`
`{host, rife, python}` point. The script and the files it needs are copied to `~/swarm-heavy/<job>`
there, run in a login shell, and the outputs copied back. Without a host it runs here. `SWARM_RIFE` is
the `rife-ncnn-vulkan` binary; without it the seam is not bridged (the loop still closes on the best
span). With no Python named, the first one there with numpy, scipy and Pillow is used.

## Tests

`tests/idle.test.mjs` covers the price line, the price check, the key colour, start-image names, the
prompt, the added items, the build input and the heavy config. `tests/test_idle_sheet.py` covers the loop
picker and stray removal.
