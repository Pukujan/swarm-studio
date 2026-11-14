# The board gauge

`scripts/board-gauge.mjs` measures how heavy a 250-page board is, on the Overview (`/`), the Design deck (`/`) and
the Design deck of the next UI (`/next/`). What it measures and what fails is in
[spec 43 §7](../specs/43-image-first-boards.md#7-the-gauge). The `board-gauge` job in `checks.yml` runs it on a pull
request that touches `web/`, `ui/`, `server/` or the gauge, the base and the head three times each in one job.

## What fails, and what is only reported

It fails on **counts and memory**: live iframes, players left after leaving, a film that did not play, crashes, DOM
nodes, layers, JS heap and GPU memory. Their numbers move less than 1 % between measurements of the same code (a
board of 21,578 nodes measured 21,579), so the thresholds are tight enough to catch a leak and far above the noise.

**Frame time is report-only.** It is printed in the job summary, base against head, and never fails. Measured on CI
runners, one Overview p95 of the same code ranged from 4 to 15 ms within a single job (the deck's stayed within 0.5 ms).
Between measurements a minute apart the runner's own speed changed about 2×, and the Overview's slowest frames fall in
the first tenth of the path. A threshold of +10 % on a few milliseconds cannot hold against that, and it failed about one
pull request in three that did not touch the board. `--gate-frame <ratio>` turns it into a gate to try a statistic.

## Why a measurement can differ for reasons that are not the code

- **The starting view.** The path used to start when the DOM settled, not the camera, so a board whose camera glided
  elsewhere (Follow framing the crew) was measured from another view. Every board is fitted first, and the path starts
  when the camera has been still for 1.5 s.
- **Work that happens only the first time.** The path is played twice and the second pass is recorded.
- **Photographing.** Without saved snapshots the Overview photographs pages while the path is played, in idle time. They
  are saved first, through the server's own `/snaps`.
- **The story.** The Studio asks for a build's story when it has a film, and the server exports the whole site before
  it answers (a headless Chrome run, synchronously, for each page with no picture), freezing the server for minutes
  on a 250-page site. The gauge does not send that request (the bug itself is issue #565).

## The soak

`.github/workflows/gauge-soak.yml` runs main against main, measured the way the job measures a pull request, on ten
runners at once, and uploads every recording. Nothing differs between the sides, so a trial that fails is a false
failure. It runs when a pull request is labelled `gauge-soak` (remove the label and add it again to run it again), or
by hand. The recordings carry each frame time, a CPU calibration and the browser's own work counters, to try a
statistic on them offline before it gates anything.

## On a small machine

`GAUGE_PAGES=20` makes a board of 20 pages, to try the gauge itself; never in CI. `GAUGE_REQLOG=1` makes the server log
each request, and a board that crashes says whether the server still answers, its CPU, its children's commands and its
last log lines.
