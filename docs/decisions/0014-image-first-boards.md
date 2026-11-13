# 0014. Image-first boards

- Date: 2026-11-13
- Status: accepted by the owner. Relayed by the session that started this record *(our wording)*. The design is
  [spec 43](../specs/43-image-first-boards.md).

## Context

The boards (the Overview, the Design deck, the Plan board, the Studio scaffold) have to stay fast and light at any
size: hundreds of pages, several videos, many pictures. Today each page is a picture at rest and a live page on
demand ([spec 36](../specs/36-overview-speed.md)), and Lite mode trims work on small machines. Nothing caps how many
pictures, live pages or video players are held at once.

The owner had the question researched: `reports/Infinite canvas rendering OSS.md` in the hackathon folder (396
sources), and an architecture draft built on it. Its finding: memory is set by how many decoded pixels, live pages
and video players are held at once, not by the renderer's language. A decoded picture costs width × height × 4
bytes, whatever its file weighed. No renderer, in any language, can paint a live sandboxed page onto a GPU canvas,
so every fast canvas that shows web content keeps it in the DOM and limits how much is live.

## Decision

*(our wording, from the owner's accepted list)*

- **Designs stay web pages.** [0010](0010-open-design-tools.md), Open Design's editing tools, stands.
- **Collaboration is async and agent-first.** There is no live co-editing. Penpot was considered and not taken, for
  that reason: it is a separate application built around people editing together.
- **Every board is image-first.** Anything nobody is touching is a photo of itself, sized by the zoom. Budgets:
  - at most **3 live pages** and **2 playing videos**;
  - photo textures held to a budget in bytes: **25 % of the adapter's GPU memory, at most 512 MB**;
  - a **low-memory profile**: 256 MB, 2 live pages, 1 video. **Lite mode becomes this profile**; it is no longer a
    mode of its own.
- **PixiJS v8 + @pixi/react + pixi-viewport** paint the photos and the video. Live pages are sandboxed iframes on a
  **DOM overlay** above that canvas.
- **Cursors, Hermia and skeletons stay HTML and CSS** on top, unchanged.
- **Snapshots are taken inside the page**, by snapDOM or modern-screenshot, and resized in a worker.
- **The image service uses `@napi-rs/image`** (Rust; the owner prefers Rust for how it handles memory). It keeps a
  size ladder, stores by content hash so a picture is held once, caps imports at 4096 px, and sends a ThumbHash
  preview with each picture.
- **A CI gauge gates every board PR**: a 250-card fixture board, measured for p95 frame time, JS heap and GPU
  memory.
- **The Plan board and the Studio scaffold** get the tier manager now. They get the PixiJS layer only if the gauge
  shows they need it.
- **Resting pages are still photos.** Animations and hovers play only on a live page.
- **Rust or C++ renderers are watched, not adopted**: vello_gpu, Penpot's render-wasm, Skia (CanvasKit).

## Consequences

- The four open questions in the architecture draft are answered: a still photo at rest is accepted; the budgets
  start at 3 live pages and 2 videos; the image service is `@napi-rs/image`, not sharp; the Plan board and the
  scaffold get the tier manager, and the PixiJS layer only on the gauge's evidence.
- The tier manager, the camera store and the video manager's teardown are our code. No library manages iframe or
  video memory, in any language. Everything else is a mature library ([0003](0003-mature-dependencies.md)).
- Each new dependency (PixiJS, @pixi/react, pixi-viewport, RBush, snapDOM or modern-screenshot, `@napi-rs/image`,
  ThumbHash, TanStack Virtual) is pinned to an exact version and disclosed in `plugin.yaml` and the README when its
  PR lands. `@napi-rs/image` ships prebuilt binaries, so nothing compiles on the person's machine.
- What Play shows, the sandbox rules, how agents build, versions as files, pins and the Feed are unchanged.
- The rollout is a series of PRs, each behind a flag and gated by the gauge (spec 43 §9). The gauge comes first, as
  the baseline.
- A Figma-class renderer comes back only if the Design deck stops being web pages (designs as shapes and data).
  That would need a new decision that supersedes this one.
