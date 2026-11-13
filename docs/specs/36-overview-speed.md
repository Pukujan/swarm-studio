# 36. A fast Overview

The owner asked (2026-11-12) for the Overview to open fast and stay light while a build runs. It is
done in four small PRs, in this order:

1. **Saved snapshots.** Each page's picture is kept in the run's folder per content version, in two
   sizes. Opening a project paints from those files, then photographs again only the pages whose
   content changed. Covers and the Projects grid use the same files.
2. **Skeleton tiles from the plan.** Before a page has a picture, its tile is a block per planned
   section, in the project's colours and in the section's proportions. Each block becomes the real
   picture as that section is built. There are no title-only cards and no thin strips.
3. **Low resolution first, sharp after.** Only the page that changed is photographed again, one page
   at a time, in idle time. Nothing is photographed while the camera moves. Tiles out of view and
   hidden tabs do no work.
4. **Slower cursors.** The Overview's crew cursors update about ten times a second, eased by CSS.
   The Design deck keeps full smoothness.

There is no headless browser in the plugin: the browser photographs the pages, as it does now.

## 1. Saved snapshots

`server/snaps.mjs` keeps them, in `<run>/snaps/`:

- **A page's content version** is a 12-hex hash of the events that change how the page looks: its own
  `page`, `layer:*` (but not `layer:delta`), `image` and `edit` events, any shared (`page: '*'`)
  section, and the build's `theme`, `art` and `reset`. A section finished on one page changes that
  page's version only. A theme or a shared section changes every page's.
- **Files:** `<page>.<version>.s.jpg` (small: 0.25 scale, the Overview at rest) and
  `<page>.<version>.f.jpg` (full: 0.6 scale, zoomed in and the cover). `index.json` names each page's
  current files. A newer version deletes the older version's files, so a run keeps at most one picture
  of each size per page.
- `GET /api/runs/:id/snaps` returns `{ first, pages: { [page]: { v, s?, f? } } }`. `s` and `f` appear
  only when they are of the current version. The board (`GET /api/runs/:id/board`) carries the same
  object as `snaps`, so the first paint needs no second request.
- `POST /api/runs/:id/snaps { page, v, size, image }` keeps a JPEG. It answers 409 when `v` is no
  longer the page's version: the page changed while it was being photographed, so the picture is not
  kept.
- `GET /snaps/:id/:file` serves a file, cached as immutable, since the name holds the version.
- **The cover** on Projects is the first page's full picture (else its small one). A build's hero
  picture still wins. The grid shows the top of a snapshot cover. The old 800×500 `img/snap.jpg` is
  no longer written by the Overview. It is still read for older runs and for a game's still.

In the Overview (`web/project.js`), the board's saved pictures paint as soon as the board loads.
`thumbs()` then asks for the versions again, and photographs (through the canvas behind) only the
pages that have no picture of their current version. It takes every page's small picture first and
the full ones after, and sends both back to be kept.

### Measured

`node scripts/overview-bench.mjs [--root <checkout>] [--runs 3]` measures a 14-page site, three
sections a page. It reports the medians of three runs. A build is played into the page: each section
is written to the run's file, so the server's versions move, and handed to the canvas as the stream
would. Headless Chromium, on a MacBook Air (M-series).

| | before (main) | after PR 1 |
|---|---|---|
| first picture, opened cold | 1054 ms | 918 ms |
| all 14 pictures, opened cold | 3326 ms | 3580 ms |
| first picture, opened again | 1023 ms | 522 ms (165 to 685) |
| all 14 pictures, opened again | 3425 ms | 555 ms |
| main thread busy during a build | 27% | 31% |
| panning at rest / during a build | 60 / 58 fps | 60 / 58 fps |

Opening a project again no longer waits for the canvas: the pictures come from disk. A cold open and
a build cost a little more, because the full-size picture is now taken and sent too. PR 3 moves that
work into idle time.

## 2. Skeleton tiles

The board (`server/board.mjs`) gives each page its `plan`: `[{ id, role, h, done }]`, one entry per
planned section (from `layer:plan`), its height in pixels (60 to 4000, else 480), and whether it is
built (`layer:done`). Shared (`'*'`) sections are left out.

A page without a picture is drawn as its skeleton: a block per section, in the section's proportions,
coloured from the project's theme. The hero block shows the build's cover picture when there is one.
The tile's shape is the plan's (at least 1.25 tall for 1 wide), so the stage does not jump when the
picture comes. A page with a picture keeps a pulsing skeleton block over each section not yet built.
Without a plan, the blocks come from the canvas's laid-out sections, else from the usual three.

| | before (PR 1) | after PR 2 |
|---|---|---|
| pages on the stage, opened cold | 640 ms | 298 ms |
| first picture, opened cold | 1027 ms | 867 ms |
| all 14 pictures, opened cold | 3564 ms | 3155 ms |
| first picture, opened again | 547 ms | 174 ms |
| all 14 pictures, opened again | 567 ms | 274 ms |
| main thread busy during a build | 29% | 31% |
| panning at rest / during a build | 60 / 58 fps | 60 / 58 fps |

Every page is on the stage, in its shape and colours, in under a third of a second. The runs vary by
a few hundred milliseconds (a second run of PR 1 opened cold in 898 to 1405 ms).

## 3. Low resolution first, one page at a time

A page's tile shows its small picture first. Its full picture is used once the camera comes close
enough to need more than 256 pixels across (the tiers in `sizePics`); before PR 3 a zoomed-in tile
stretched the small one.

Pages to photograph wait in a queue (`P.want`), small pictures before full ones, and are taken one at
a time:

- A page with no picture at all is taken straight away. A page that changed, and every full picture,
  waits for idle time (`requestIdleCallback`).
- Nothing is taken while the camera moves: a pan, pinch, wheel or glide holds the queue until it has
  rested for 400 ms. The camera's own framing jumps do not count.
- Only tiles in view are taken. The others wait until the camera brings them into view.
- A hidden tab takes nothing; the queue starts again when the tab shows.
- A new picture replaces the tile's picture in place; the stage is drawn again only when a skeleton
  becomes a picture.

| | before (PR 2) | after PR 3 |
|---|---|---|
| first picture, opened cold | 933 ms | 973 ms |
| all 14 pictures, opened cold | 3547 ms | 3540 ms |
| first picture, opened again | 237 ms | 234 ms |
| main thread busy during a build | 30% | 30% |
| pictures taken during a build | 34 | 30 |
| pictures taken while panning, during a build | 8 | 0 |
| panning at rest / during a build | 60 / 58 fps | 60 / 60 fps |

## 4. Slower cursors behind the Overview

- **The canvas behind.** While the Overview or Projects is up, the Design deck's canvas is hidden
  but its loop kept running at 24 frames a second, and at 120 whenever its own camera eased (it
  re-frames the build every 0.7 s). It now runs at 10 behind them: the crew, the panels and the
  camera step ten times a second. The pages still take their sections at 24 a second, since the
  Overview photographs them. The Design deck itself is unchanged: 24, and 120 while its camera moves.
- **The Overview's cursors.** They wander from spot to spot every 1.4 to 2.3 s, eased by CSS, as
  before. While the camera moves they now keep to their spots, re-placed about ten times a second
  with a 0.1 s CSS ease each step (`.cur.track`); before, they stayed where they were on screen until
  their next move.

Measured with the Mac under heavy load from other apps (load average 10 to 30), so the two sides were
run one after the other, three times each. The timings vary by seconds between runs and are left out.

| | before (PR 3) | after PR 4 |
|---|---|---|
| main thread busy during a build | 39% (35 to 41) | 35% (27 to 39) |
| each Overview cursor's moves a second, panning during a build | 0.3 | 10 |
| panning at rest / during a build | 60 / 60 fps | 60 / 60 fps |
| pictures taken while panning, during a build | 0 | 0 |

## 5. The page photographs itself (image-first boards, step 4)

A generated page is sandboxed with `allow-scripts` and no same-origin, so nothing outside it can read it. It has
always photographed itself, but with html-to-image fetched from jsdelivr at run time, once per size, each answer a JPEG
data URL that the Overview decoded and encoded again. Now:

- **In the page.** `web/frame.html` answers `capture { scale, maxHeight, fit }` with one `ImageBitmap` of itself,
  transferred, not copied. It takes it with [snapDOM](https://github.com/zumerlab/snapdom) 3.7.0 (MIT), vendored in
  `web/vendor/snapdom/` by `scripts/vendor.mjs` (the package's own browser build, pinned by its npm integrity). The
  library is not in every page: the first request finds none, and the next one brings its text, which the plugin's
  own server serves. Nothing is fetched from the internet. A page is photographed at most nine widths long, as long
  as the Overview shows it. The painters' marks and the review's scan line stay out of the picture.
- **In a worker.** `web/capture.js` makes each size from that one bitmap with
  `createImageBitmap(…, { resizeWidth, resizeHeight })` and `OffscreenCanvas.convertToBlob()`, as JPEGs, and closes
  every bitmap it is given or makes. The worker is made from a Blob, so it also starts in the Desktop pane's opaque
  origin. A document that cannot start one does the same work on its main thread.
- **One capture, both sizes.** A page with no picture of its current version is photographed once at 0.6. The small
  picture (0.25) and the full one come from it; the full one is kept and drawn in idle time, after the small one is
  on screen. Only a page whose small picture is saved but not its full one is photographed for the full one alone.
  The storage, the versions and the rules above are unchanged: idle time, nothing while the camera moves, only pages
  in view, only a page whose version changed. `capture` can make a 1× picture too (`scales: [1]`); the Overview does
  not store one, since its tiles never need more than the full size.
- **Every other picture of a page** (the reviewer's whole page, Scribble's, the hosted studio's cover, a resting
  page's frozen frame) goes through the same capture (`snapFrame` in `web/canvas/marks.js`), with the reviewer's old
  limit: the whole page, at most 5000 px tall (3000 without a scale).

### Measured

`PLAYWRIGHT_DIR=tools/dev node scripts/overview-bench.mjs [--root <checkout>] --runs 3`. Medians of three runs, the
14-page fixture, headless Chromium on a Windows laptop with other work running (2.3 GB of memory free). Before is an
export of `main` at 1fcf587. The per-page rows open the Overview fresh for each way of taking the pictures, and time
only pages that answered with a picture.

| | before (main) | after |
|---|---|---|
| first picture, opened cold | 1186 ms | 1275 ms |
| all 14 pictures, opened cold | 4318 ms | 3185 ms |
| first picture, opened again | 942 ms | 945 ms |
| main thread busy during a build | 44% | 25% |
| one page, small + full as two captures | 310 ms (141 to 428) | 92 ms (22 to 141) |
| long tasks on the main thread, those 14 pages | 2409 ms | 0 ms |
| one page, both from one capture | — | 125 ms (77 to 241): 110 in the page, 10 in the worker |
| long tasks on the main thread, those 14 pages | — | 52 ms |
| panning at rest / during a build | 60 / 60 fps | 60 / 60 fps |

The time a page's pictures take is a third of what it was, and the studio's main thread is free while they are
taken: html-to-image ran in the studio's own renderer and held it for 2.4 seconds over 14 pages. On these
fixture pages, two in-page captures (92 ms) beat one at the larger scale (125 ms): snapDOM keeps its copy of the page
between two captures, and rasterising at 0.6 costs more than at 0.26. Which is better on the crew's real pages, with
pictures and web fonts, is for the gauge (image-first boards step 1) to settle.
