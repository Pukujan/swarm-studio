# 43. Image-first boards

Status: agreed (owner, 2026-11-13, [decision 0014](../decisions/0014-image-first-boards.md)). Not built yet: the rollout
in §9 is a series of PRs, each behind a flag and gated by the gauge (§7).

Every Swarm board (the Overview, the Design deck, the Plan board, the Studio scaffold) stays fast and light at any size:
hundreds of pages, a few videos, many pictures. Memory has a fixed budget that a board never goes over, and video
memory in particular stays low.

Designs stay web pages, with Open Design's tools ([0010](../decisions/0010-open-design-tools.md),
[docs/engines/open-design.md](../engines/open-design.md)). Collaboration stays async and agent-first. Neither changes.

Sources: the research report `reports/Infinite canvas rendering OSS.md` in the hackathon folder (396 sources), and the
architecture draft this spec adapts.

## 1. The one idea

**Everything nobody is touching is a picture.** A page you are editing, or one an agent is working on, is a live web
page. Every other page is a photo of itself, at the size the zoom needs, painted with everything else onto one GPU
surface. At most three pages are live at once.

What costs memory is the number of decoded pixels, live pages and video players held at once. The renderer's language
barely matters. A decoded picture costs width × height × 4 bytes, whatever its JPEG weighed:

| What | Memory each |
|---|---|
| Page photo, small (0.25×, 360 × 225) | about 0.3 MB |
| Page photo, sharp (0.6×, 864 × 540) | about 1.9 MB |
| Page photo, full (1×, 1440 × 900) | about 5.2 MB |
| A playing 1080p clip | about 8.3 MB of texture, plus the browser's decoder buffers |
| A live page | a whole document: layout, scripts, fonts, pictures; often its own process (Site Isolation adds 10–13 %) |

200 pages at the small size come to about 65 MB, and at the sharp size about 373 MB. All live, it would be many times
that.

## 2. The pieces

```
              ┌──────────────────────── Browser (the board) ─────────────────────────┐
 React UI ───▶│  Panels, Layers, chat, toolbar     (React 19; never re-renders on pan)  │
              │  Camera store ── pan and zoom outside React (a plain store and rAF)    │
              │      ▼                                                                 │
              │  Tier manager ── per item, every settled frame:                        │
              │      │            hidden · tiny photo · sharp photo · live             │
              │      │            (spatial index, budgets, hysteresis)                 │
              │      ├──────────▶ GPU layer (PixiJS v8 + pixi-viewport)                │
              │      │             photos and video as textures on one canvas          │
              │      ├──────────▶ Live overlay (DOM): 2–3 sandboxed iframes over       │
              │      │             their photos, following the camera                  │
              │      └──────────▶ Video manager: poster → play on focus → teardown     │
              │  Cursors, Hermia, skeletons: HTML and CSS on top, unchanged            │
              │  Snapshot worker ── resizes and encodes photos off the main thread     │
              └───────────────────────────────▲───────────────────────────────────────┘
                                              │ photo (ImageBitmap)
              ┌───────────────────────────────┴──────────────────────┐
              │ Inside each live page: snapDOM or modern-screenshot   │
              │ photographs itself and posts the picture out           │
              └────────────────────────────────────────────────────────┘
                                              │ upload
              ┌───────────────────────────────▼───────────────────────────────────────┐
              │ The plugin's server                                                    │
              │  Snapshot store (server/snaps.mjs): one file per page version and size │
              │  Image service (@napi-rs/image): size ladder, content-hash store,      │
              │  4096 px import cap, ThumbHash                                         │
              └───────────────────────────────────────────────────────────────────────┘
```

### 2.1 Camera store

- Pan and zoom live in a small store updated in `requestAnimationFrame`, not in React state. Figma tripled its scroll
  frame rate by moving viewport data out of Redux, and React Flow 12.11 applies its camera imperatively.
- Components subscribe only to "the camera settled" and the zoom bucket, never to every frame.
- While the camera moves, the board keeps the pixels it has: nothing is photographed again and nothing changes tier
  until it settles.

### 2.2 Spatial index

- **RBush** over every item's rectangle (pages, sections, pictures, videos, notes). It takes inserts and removals as
  agents add things.
- Each settled frame asks for the visible rectangle plus a margin (one screen each way) to know what to prepare.

### 2.3 Tier manager

The heart of it. For each item, one tier:

| Tier | When | What is held |
|---|---|---|
| **Hidden** | Off screen beyond the margin | Nothing; textures released; only the ThumbHash kept |
| **Tiny photo** | On screen, shown at under about 0.3× | The 0.25× photo |
| **Sharp photo** | On screen, zoomed in | The 0.6× photo, or 1× above about 0.8× zoom |
| **Live** | Selected or clicked into, or an agent is working on it | A sandboxed iframe on the live overlay |

- **Photo size by zoom, in power-of-two steps**: screen size × device pixel ratio, rounded up to a power of two, as
  tldraw does; changes are debounced so zooming doesn't thrash.
- **Hysteresis**: an item stays past a threshold for about 300 ms before it changes tier, so edges don't flicker.
- **Live budget**: at most 3. A fourth asking to go live sends the furthest one nobody is touching back to a photo.
  An agent's work comes before browsing.
- **Memory budget in bytes**: the tier manager adds up the texture bytes it holds. Over budget, it downgrades the
  furthest items first (sharp → tiny → hidden).

### 2.4 GPU layer

- **PixiJS v8 + @pixi/react 8 + pixi-viewport 7**: one canvas behind the UI, WebGL by default, WebGPU where it is
  stable.
- Every photo is a sprite. PixiJS culls what is off screen, and its texture collector frees textures not drawn for
  about 60 s. The tier manager also frees a texture the moment its item goes hidden, so the byte budget holds without
  waiting on PixiJS.
- **KTX2 / Basis compressed textures** are evaluated after the layer lands: they keep photos compressed on the GPU, at
  about 4–8× less video memory, the one saving `<img>` can't give.
- Labels, selection outlines, the crew's cursors, Hermia and the skeletons stay DOM, SVG and CSS on top
  ([spec 41](41-pet-cursor.md)). They are few and cheap.

### 2.5 Live overlay

- A DOM layer above the canvas holds the 2–3 live iframes, each `sandbox="allow-scripts"` without
  `allow-same-origin`, as the catalog review requires.
- Each sits exactly over its photo and follows the camera through one CSS transform on the overlay's root;
  `will-change` only while the camera moves.
- **Going live**: make the iframe, wait for its first paint, then fade the photo out, so nothing flashes.
- **Back to a photo**: the page photographs itself (§2.7), the new photo shows, then the iframe is removed. Hiding it
  frees nothing; only removing it lets the browser drop the document and its process.
- Nothing can paint a cross-origin sandboxed page onto a GPU canvas (HTML-in-Canvas refuses cross-origin content by
  design), so the overlay is permanent, not a stopgap.

### 2.6 Video manager

- Off screen or not focused, a video is a **poster frame**: one photo, made once by the server or with WebCodecs.
- Focused or played, it gets one `<video preload="metadata">`, as a PixiJS `VideoSource` texture or a DOM video on the
  overlay.
- **Teardown** when it leaves the screen or loses focus: `pause()`, `removeAttribute('src')`, `load()`. Removing the
  element alone doesn't free the player, and today's boards very likely leak here.
- **Budget**: at most 2 playing (1 in the low-memory profile). Another one pauses the oldest.
- A `VideoFrame` decoded by our own code (scrubbing, posters) is closed straight away.
- The films themselves are HyperFrames' ([decision 0011](../decisions/0011-hyperframes-default-video.md),
  [docs/engines/video.md](../engines/video.md)); this only changes how a board holds the finished clip.

### 2.7 Snapshot pipeline

- **Taken inside the page.** The sandboxed page can't be read from outside: every outside DOM-to-image library returns
  blank. A small capture script (**snapDOM** or **modern-screenshot**) goes into each generated page; asked, it
  photographs its own document and `postMessage`s a transferable `ImageBitmap` out.
- **Resized in a worker**: `createImageBitmap(…, { resizeWidth, resizeHeight })` and `OffscreenCanvas.convertToBlob()`
  make the 0.25×, 0.6× and 1× JPEGs (or WebP) off the main thread. Every bitmap is `close()`d.
- **When**: after an agent finishes a section, after a hand edit, or when the page drops from live; only in idle time
  and never while the camera moves (spec 36's rule, kept).
- **Stored by version** in `server/snaps.mjs`, as spec 36 does: one file per page version and size, cached as
  immutable, older versions deleted.

### 2.8 Image service

- **One service for every picture**: page photos, generated art, stock stand-ins, uploads and the Assets library.
- **Size ladder**: `/img/<hash>?w=256` answers a cached resize, in power-of-two steps (64, 128, 256, 512, 1024, 2048)
  plus the original.
- **Stored by content hash**, so a picture used in 50 places is stored and decoded once.
- **Import cap**: anything over 4096 px is scaled down, as Figma does.
- **ThumbHash** (about 30 bytes) per picture, sent with the board's data, so every tile shows a blurred preview at
  once.
- **`@napi-rs/image`** (Rust, prebuilt binaries, pinned): nothing compiles on the person's machine. It is disclosed in
  `plugin.yaml` and the README's "What it does on your machine" when its PR lands.
- **Generated pages** get `srcset` and `sizes` pointing at the ladder, so a live page loads pictures at the size it
  shows.

### 2.9 Lists

Layers, Projects, Assets and Chats draw only their visible rows, with **TanStack Virtual**.

## 3. Budgets

Starting numbers; the gauge tunes them.

| Budget | Normal | Low memory (4 GB or less) |
|---|---|---|
| Live pages | 3 | 2 |
| Playing videos | 2 | 1 |
| Photo textures held | 25 % of the adapter's GPU memory, at most 512 MB | 256 MB |
| Margin prepared around the screen | 1 screen | 0.5 screen |
| Tier change delay | 300 ms | 300 ms |

**How the texture budget is found.** No browser reports an adapter's video memory: WebGL names the renderer and no
more, and WebGPU's adapter gives limits, not memory. So the budget is 25 % of the device memory the browser reports
(`navigator.deviceMemory`, which tops out at 8), at most 512 MB, and the low-memory profile at 4 GB or less, or when
nothing is reported and the browser asks to save data. `?board-mb=` and `?board-live=` override it for a trial
(`ui/src/board/tiers.ts` `budgetsFor`, `ui/src/board/useTiers.ts`). The gauge tunes it.

**Lite mode becomes the low-memory column.** Today it turns on by itself below 4 GB (`navigator.deviceMemory`,
`web/canvas/settings.js:19`) or when the person picks it; both now pick this profile instead of a mode of its own.

## 4. Which board gets what

| Board | Tier manager | PixiJS layer | Live overlay | Video manager |
|---|---|---|---|---|
| Overview | yes | yes | yes | yes |
| Design deck | yes | yes | yes | yes |
| Plan board | yes | only if the gauge shows it needs it | no (cards, no live pages) | for clips, if any |
| Studio scaffold | yes | only if the gauge shows it needs it | no | for clips, if any |

## 5. Resting pages

A resting page is a still photo. Its animations and hovers play only when it is live: when it is selected, clicked
into, or an agent is working on it. Play shows the real page, as now.

## 6. What's mature and what's ours

| Mature, adopted | Ours to write (small, specific) |
|---|---|
| PixiJS v8, @pixi/react, pixi-viewport | The tier manager (§2.3) |
| RBush | The camera store |
| snapDOM or modern-screenshot | The capture bridge (`postMessage`) |
| `@napi-rs/image`, ThumbHash | The image service's routes and the hash store |
| TanStack Virtual | The video manager's teardown rules |
| Playwright, Chrome traces | The gauge's fixture and thresholds |

No library manages iframe or video memory for us, in any language, so the tier manager and the video manager are the
custom part that can't be avoided ([0003](../decisions/0003-mature-dependencies.md)).

## 7. The gauge

- **Fixture board**: 250 page cards, 3 live pages, 1 playing video, 100 pictures, panned and zoomed along a scripted
  path in Playwright.
- **It asserts**:
  - frame time at p50, p95 and p99 (not average FPS);
  - JS heap and DOM node count (CDP `Performance.getMetrics`);
  - layer count;
  - GPU-process memory (a memory-infra dump in a Chrome trace);
  - live iframes within budget, and players torn down.
- **Runs in CI** on every PR that touches a board, beside `ui-audit` ([AUDIT.md](../ux/AUDIT.md)) and `motion-check`.
  A regression past its thresholds fails the PR.
- **In the field**: `performance.measureUserAgentSpecificMemory()` where the page is cross-origin isolated, with
  warnings at 60 % and 75 % of the budget, as Figma does.

## 8. What doesn't change

- The design format (web pages), Open Design's tools, the sandbox rules and how agents build.
- What Play shows: the real page.
- Async collaboration: versions as files, pins, boards, the Feed. No live co-editing (0014: Penpot considered and not
  taken).
- Rust and C++ renderers (vello_gpu, Penpot's render-wasm, Skia) are watched, not adopted. They come back only if the
  Design deck stops being web pages.

## 9. Rollout

Each step is its own PR, on its own branch, behind a flag, and gated by the gauge from step 1 on. Steps 2–4 help
today's boards in `web/` as well as the React port ([0013](../decisions/0013-react-ui-coexists.md)).

| Step | Branch | What | Done when |
|---|---|---|---|
| 1 | `ci/board-gauge` | The fixture board and CI thresholds, measured on today's boards as the baseline | CI runs the gauge on every board PR and stores the baseline |
| 2 | `fix/video-teardown` | Posters and the teardown rules (§2.6) in today's boards and in `/next/` | The gauge shows no player left after a video leaves the screen |
| 3 | `feat/image-service` | `@napi-rs/image`: the size ladder, the hash store, the 4096 px cap, ThumbHash; generated pages use the ladder | Every board picture comes from `/img/<hash>?w=`; disclosed in `plugin.yaml` and the README |
| 4 | `feat/inpage-capture` | The capture script inside each generated page and the snapshot worker, replacing today's capture, keeping spec 36's storage | Photos of sandboxed pages are no longer blank; nothing is captured while the camera moves |
| 5 | `feat/tier-manager` | The camera store, RBush and the tier manager in the React port, still drawing photos as `<img>`; the Plan board and the scaffold get it here | The gauge holds the live and byte budgets on the fixture |
| 6 | the ports: `port/pixi-overview`, then `port/pixi-deck` | The PixiJS layer for the Overview and the Design deck: photos and video as textures, the live overlay on top; then KTX2 is evaluated. The Plan board and the scaffold follow (`port/pixi-plan`, `port/pixi-scaffold`) only if the gauge shows they need it | p95 frame time and GPU memory on the fixture beat step 5's |
| 7 | `feat/budgets-default` | The budgets become the default for everyone, and Lite mode becomes the low-memory profile | Lite mode's switch picks the profile; no separate lite pass |

## 10. The questions the draft left open

Answered by the owner on 2026-11-13 (decision 0014):

1. **Is a still photo for resting pages acceptable?** Yes. Animations and hovers play only once a page is live.
2. **Budgets?** Start with 3 live pages and 2 playing videos (2 and 1 in the low-memory profile), and a texture budget
   of 25 % of the adapter's memory, at most 512 MB (256 MB low memory).
3. **`@napi-rs/image` or sharp?** `@napi-rs/image`: Rust, for how it handles memory.
4. **The PixiJS layer for the Plan board and the scaffold too?** The tier manager now; the PixiJS layer only if the
   gauge shows they need it.
