# web/canvas/: the Design deck, by area

`web/canvas.js` was one 7,709-line file. It is now split by area into the files here. `web/canvas.js` only
loads them. **Edit the area's file, not `web/canvas.js`.** The table says which file holds what.

| File | What it holds |
| --- | --- |
| `core.js` | The shared ground every area uses: `$`, `els` (the page's elements), the address (`Q`, `WALL`), `api`, `store` (per-viewer storage), the icons (`ico`, `setLabel`, `TOOLS`), the crew look (`Crew`, `ARROW`, `HERMIA`), the build state `S` (`setS`), `replayId` (`setReplayId`) and the camera `cam`. Typed (`// @ts-check`). |
| `base.js` | The build on the canvas: `fresh`, `setTitle`, `navBrand` (the `navbrand:` lines that `tests/launch.test.mjs` compares with `engine/naming.mjs`), the frame sandbox, and media dragged into the chat. |
| `carry.js` | A picture being painted: its card beside the page, held by its painter's cursor, then carried to its slot. Imports only `core.js`. |
| `events.js` | Engine events drawn on the canvas (`on`). |
| `deck.js` | Agents and their cursors, frames and layers, geometry, design gestures, the break room, wires and the camera moves (`fit`, `focusPage`). |
| `panels.js` | The panels: theme, layer tree, agents, status, toolbar, and the chat feed (`feed`, `botMsg`). |
| `loop.js` | The frame loop and the keyboard and pointer input, the brief form and slash commands. |
| `talk.js` | Talks before a build: talk first, the game talk, Chats. |
| `../chatmode.js` | The chat's modes (spec 46): the switch, the typed switch, and where Ask, Plan and Fix send a message. Not in this folder: it imports only the icons, so node tests it; `loop.js` hands it what it needs. |
| `player.js` | Play mode and visitor tours. |
| `design.js` | The Design panel, editing next to the agents, undo and redo, export. |
| `publish.js` | Publishing a live link. |
| `marks.js` | Comments, generated images, visual review, Scribble. |
| `film.js` | The promo video and the film's outside services. |
| `settings.js` | Lite mode, the models menu, side tabs and floating panels. |
| `replay.js` | Saved runs (files), traces and replay. |
| `rooms.js` | The views (Canvas, Video, App), the big game, the app advisor, game mode, cast, the project's art, the bench. |
| `start.js` | Starting a build, resizable panels, crews, the Publish button, pictures in the Design panel. |
| `auto.js` | Auto mode and the Auto show, the code wall, crew radio, the art wall. |
| `dock.js` | Hermia's dock and sign-in connectors. |
| `hook.js` | `window.swarm`: what `web/studio.js`, `web/home.js` and `web/project.js` may read and call. |
| `hosted.js` | The hosted studio. |

How it runs:

- The page never loads these as separate modules. `server/page.mjs` joins `core.js`, these files in the order
  above, and then `canvas.js` into one inline script. It drops `import` lines and `export` keywords. So the
  browser runs the same code in the same order as the one file did.
- Each file still imports what it uses. That keeps the type check (`tools/dev`, `npm run typecheck`) and the
  dependency rules (`npm run deps`) honest.
- A top-level `let` that another file changes has a setter next to it (`setViewing`, `setNextRoute`,
  `setToolbarKey`, `setSlashAt`, `setHermesResume`, `setLiveId`, `setS`, `setReplayId`). An ES module cannot
  assign another module's binding. Use the setter.
- Names are shared across the whole page: two files must not declare the same top-level name.
- Every file here is type-checked (`// @ts-check`). The `// @ts-ignore` lines (about 100) mark the DOM reads that
  JSDoc comments alone cannot type (`querySelector` results, event targets). Replace one when you touch that
  code, with a typed variable. Do not add new ones.
- A new file here starts with `// @ts-check`. Add it to the list in `server/page.mjs` and to `canvas.js`, in
  the order it must run.
- The areas still import each other in cycles. `.dependency-cruiser-known-violations.json` lists those cycles
  as known. A new cycle fails `npm run deps`. Shrink the list as the areas get smaller public surfaces.
- `tests/canvas-source.mjs` gives tests the canvas's whole source in load order.
- `docs/ux/MOTION.md` lists everything that moves, with its file and line here. CI's `motion-check` proves a
  change keeps the motion.
