# The board gauge

`scripts/board-gauge.mjs` measures how heavy a 250-page board is, on the Overview (`/`), the Design deck (`/`) and
the Design deck of the next UI (`/next/`). What it measures and what fails is in
[spec 43 §7](../specs/43-image-first-boards.md#7-the-gauge). The `board-gauge` job in `checks.yml` runs it on a pull
request that touches `web/`, `ui/`, `server/` or the gauge, the base and the head three times each in one job.

## What fails, and what is only reported

It fails on **counts and memory**: live iframes, players left after leaving, a film that did not play, crashes, DOM
nodes, layers, JS heap and GPU memory. Their numbers move less than 1 % between measurements of the same code (a
board of 21,578 nodes measured 21,579), so the thresholds are tight enough to catch a leak and far above the noise.

**Single frames' percentiles are report-only.** p50/p95/p99 are printed in the job summary and never fail. Measured on CI
runners, one Overview p95 of the same code ranged from 4 to 15 ms within a single job (the deck's stayed within 0.5 ms).
Between measurements a minute apart the runner's own speed changed about 2×, and the Overview's slowest frames fall in
the first tenth of the path. A threshold of +10 % on a few milliseconds cannot hold against that, and it failed about one
pull request in three that did not touch the board.

**The board's main-thread work fails past 1.15×.** The statistic is the browser's own count of the time its main thread
spent in tasks over the path (`taskMs`: script, layout, style, paint), divided by the CPU calibration made in the same
recording (`calibMs`); for the base and head recordings made one after the other (b1 h1 b2 h2 b3 h3), the head over the
base of each pair, and the median of the three. A heavier board does more work on the same path; a slower runner does
the same work slower in both numbers.

How it was chosen, from the soak's recordings of main against main (`gauge-soak.yml`): p50, p75, p90, p95, the mean and
the trimmed mean of frame times, with and without the calibration, paired and pooled, and the task time, the script,
layout and style time, the layout and restyle counts. On the first soak of the fixed method, p75 of frames over the
calibration, paired, read 0.93 to 1.08 and saw +20 % every time, and was picked from it; on two fresh soaks (20 trials,
not used to pick it) it read 0.63 to 1.50 and failed 5 of 20 on the Overview, whose frames alternate between two sizes.
The total of the main thread's tasks over the calibration was steady in all four soaks:

| 120 board-trials (40 trials × 3 boards) | head over base, median of 3 pairs |
|---|---|
| main against main | 0.94 to 1.10 |
| +10 % of task time (injected into the recordings) | over 1.15 in 10 of 120 |
| +15 % | over 1.15 in 66 of 120 |
| +20 % | over 1.15 in 107 of 120 |
| +25 % and more | over 1.15 in 120 of 120 |

The gate is 1.15, five points over the worst main-against-main ratio seen: it catches a slowdown of about a fifth or
more, and nothing smaller. `--gate-frame <ratio>` changes it, `--no-gate-frame` turns it off. The statistic was picked
looking at soaks 2 to 4, so the proof that matters is the soak run on the pull request that made it a gate, whose trials
chose nothing.

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
