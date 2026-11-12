# 29. Chats, references and marks

The owner, 2026-11-11:
- "i think we need a store just for chat that doesnt get turned into projets"
- "oh yeah a reference store is missing from the overview panel?"
- "scribble and then talk about it and the next turn agent knwos exactly where to look"
- On dragging a layer into the chat: "the layer and show connecting lines to the chat".

Spec 27 ([27-plan-conversation.md](27-plan-conversation.md)) owns the planner's turn logic:
- reading intent, asking, proposing options, writing the plan;
- Open and Locked, and what Lock re-plans for a game.

This spec owns:
- where a conversation lives, the record it is stored as (§Store), and how it moves into a project;
- the References store;
- marks (Scribble) as model input;
- dragging a layer into the chat;
- manual editing.

The UI rules in [docs/ux/RULES.md](../ux/RULES.md) apply throughout:
- all guidance stays in the left chat;
- minimal text, names only, never a tooltip (`title=`);
- no blue, purple or green in the Studio chrome.

## What exists today

| Thing | Where | What it is |
|---|---|---|
| `~/.hermes/swarm-studio/chatter/` | server.mjs `chatterMake` | A cache of voice clips for fixed crew lines. **Not chat**, and it stays as it is. |
| Deck talk | canvas.js `talk.said`, `POST /api/discuss` (engine/discuss.mjs) | In memory only. A reload loses it. |
| Overview dock | project.js `ask.onsubmit` | Stores nothing. Each message becomes a build (`/api/run`), a fix, or a deck talk. |
| App and game tell | server.mjs `tellBuilder`, engine/talk.mjs | Questions and answers are lost. A confirmed change is kept as `app:told` or `app:redirect` in the run log. |
| Comment pins | canvas.js `sendComment`, `POST /api/runs/<id>/comment` | `comment` and `comment:take` events in the run log. A pin targets a whole section and has no point of its own. |
| Plans | `plans/p-<id>.json`, engine/plan.mjs | Game plans. The three on disk are never built and have no run. One is titled "New game". |
| Projects | `runs/folders.json`, server/projects.mjs | `{runs, name, title, folder, trashed, made}` per project id. `projects/<pid>/uploads/` holds uploads, but none exist yet. |
| Assets | `GET /api/assets` | Put together on each request from `image` events, films and uploads. There is no store behind it. |
| Plan style refs | `plan.style.refs` (plan.mjs, planart.mjs) | The srcs of the picked sheets. |
| Film refs | `runs/<id>/video/refs/`, `refsOf` | Files, links and text for one film. |

No Feed route stores references. Spec 10's "save references" from the Feed is not built yet.

## Store

Everything lives under `$HERMES_HOME/swarm-studio/`.

```
chats/
  <chat id>/
    chat.json        the record below
    media/           originals the person added: pictures, clips, audio
    made/            what the planner made: mood boards, painted options, stills, samples
    marks/           the picture of each sent mark set and its crops
projects/<pid>/
  chats/<chat id>/   the same layout, once the chat is part of a project
  refs/              the project's References store (see References)
  uploads/           kept as today; read as references
```

- A chat id is `c-` followed by 10 hex characters. It is also spec 27's talk id. A chat never has a run id.
- A chat outside `projects/` is a **loose chat**. Loose chats are never listed in Projects.
- When a locked chat builds, its folder **moves** into `projects/<pid>/chats/`. The run's `run:start` records `chat: <id>`. A chat that is already in a project stays where it is when it builds again.
- Writes go to `chat.json.tmp`, which is then renamed. Each chat has one writer at a time, through a per-chat queue in the server.

### The record (`chat.json`)

```json
{
  "v": 1,
  "id": "c-3fa117afac",
  "kind": "site",
  "category": "Design",
  "categoryBy": "planner",
  "title": "Tea shop for Leaf & Kettle",
  "created": 1794398817845,
  "updated": 1794398900000,
  "state": "open",
  "lead": "planner",
  "project": null,
  "plan": null,
  "turns": [
    { "id": "t1", "who": "person", "at": 1794398817845, "text": "a tea shop site, don't build yet",
      "refs": ["r1"], "marks": [], "layers": [] },
    { "id": "t2", "who": "planner", "at": 1794398820000, "text": "Two ways to go …",
      "options": [{ "id": "o1", "label": "Calm and paper-like", "why": "…", "made": ["m1"] }],
      "made": ["m1", "m2", "m3"], "reads": [] }
  ],
  "decisions": {
    "audience": { "value": "Tea drinkers in Portland", "why": "said in t1", "by": "person", "turn": "t1" }
  },
  "spec": {
    "brief": "One paragraph the crew builds from",
    "open": ["Do they ship outside Oregon?"],
    "art": [{ "what": "hero photo of loose leaf", "ref": "r1" }],
    "engine": null,
    "time": "about 6 minutes",
    "cost": "$0.40",
    "lockedAt": null
  },
  "refs": [
    { "id": "r1", "kind": "image", "name": "shelf.jpg", "file": "media/shelf.jpg", "w": 1600, "h": 1067,
      "source": "upload", "url": null, "use": "hero mood", "read": { "by": "vision", "model": "…", "text": "…" },
      "turn": "t1", "removed": null }
  ],
  "made": [
    { "id": "m1", "kind": "board", "file": "made/m1.png", "of": ["r1"], "turn": "t2", "model": "…" }
  ],
  "marks": [
    { "id": "k1", "turn": "t5", "on": { "kind": "layer", "run": "…", "page": "home", "layer": "home-hero" },
      "shape": { "type": "stroke", "points": [[0.42, 0.31], [0.5, 0.33]], "box": [0.4, 0.28, 0.14, 0.09] },
      "target": { "selector": "section#home-hero > h1", "path": "0-1-0", "text": "Fresh leaf, every week",
        "region": null },
      "note": "bigger, and on one line", "crop": "marks/k1.png", "status": "open", "draft": null }
  ]
}
```

| Field | Meaning |
|---|---|
| `kind` | `site`, `app`, `game` or `film`: what the conversation is about. Spec 27 reads it. |
| `category` | `Design`, `App`, `Game` or `Video`: how the chat is grouped in a project. The planner sets it from `kind` (`categoryBy: "planner"`). When the person moves it, `categoryBy` becomes `"person"` and the planner never changes it again. |
| `state` | `open` or `locked`. Spec 27 decides what each means. Changing any decision or reference sets it back to `open` and clears `spec.lockedAt`. |
| `lead` | `person` or `planner`: who is leading right now. It is a reading, not a mode the person picks. Spec 27 sets it on each turn. |
| `project`, `plan` | Set when the chat builds: the project id, and for a game the plan id. |
| `turns[]` | Every message in order. `who` is `person`, `planner` or `crew` (a crew reply about a layer). A person's turn lists the refs, marks and layers sent with it. A planner turn lists what it made and its `reads` (how it read each mark: `{mark, read}`). |
| `decisions` | Spec 27's shape. `by` is `person` or `planner`, and `turn` is where it was decided. |
| `spec` | The running spec beside the chat. Lock freezes it, with its art list, engine, time and cost. |
| `refs[]` | This chat's references (see Media). `removed` holds the time it was removed, so undo can bring it back. |
| `made[]` | What the planner made for the chat. |
| `marks[]` | Marks that were sent (see Scribble). Marks still being drawn are not stored here. |

Spec 27 writes `turns`, `decisions`, `spec`, `state` and `lead`. This spec writes the rest.

### Routes

| Route | Does |
|---|---|
| `GET /api/chats?loose=1` | Loose chats, newest first: `{id, title, kind, category, state, updated, turns: count}`. |
| `GET /api/chats/<id>` | The record. |
| `POST /api/chats/<id>` | `{title}` renames, `{category}` moves the chat to another group. |
| `DELETE /api/chats/<id>` | Moves the chat to `chats/.trash/<ms>-<id>/`, which keeps it for 30 days. |
| `POST /api/chats/<id>/media?name=` | Adds one file. Answers with the ref. |
| `POST /api/chats/<id>/link {url}` | Adds a link (see Media). |
| `GET /chat-media/<id>/<file>` | Serves the chat's files, from loose chats and project chats alike. |
| `GET /api/projects/<pid>/chats` | The project's chats, grouped by category. |

Spec 27's `/api/talk` and `/api/talk/:id` create and extend the same record.

### Clean-up

- A loose chat with no person turn, older than one day, is removed on start.
- A loose chat with turns is never removed by itself.
- The three unbuilt plans on disk stay where they are. The Studio's first start after this ships makes a loose chat for each one: kind `game`, title from the plan, `plan` set to its id, and a planner turn quoting its idea. "New game" is renamed from its idea ("Army of ants"). The plan files do not move, so nothing breaks.

## Where chats show

- **The Make box.** The first text typed opens a loose chat. The chips and buttons under the box are suggestions only. Sending text that spec 27 reads as a build ("just build it") still builds at once: the chat is made, locked from that one message, and moved into the new project. So every project has the chat that started it.
- **Studio home.** One quiet entry, **Chats**, beside Recent and All projects. It lists the loose chats, each by its title, with Open and Locked shown as a small mark. A chat can be opened, renamed (double-click the name) and deleted (in the row's ⋯ menu).
- **A project.** The left chat opens the project's newest chat. At the top of the chat, the chat's name opens a list of the project's chats grouped as Design, App, Game and Video. Each group shows only once it has a chat. A chat can be dragged to another group. **New chat** is the list's last row.
- The left chat is where all of this shows. Nothing opens a second chat window.

## Media in and out

### In

| What | How it is read |
|---|---|
| Picture (jpeg, png, webp, gif first frame; up to 12 MB, longest side kept at 2048) | Sent to the vision model chosen in Setup. |
| Video file (mp4, mov, webm; up to 200 MB, 3 minutes) | Sent to the omni model when one is set. Otherwise, 8 sampled frames go to the vision model, and the sound goes to the transcriber when there is one. |
| Audio (mp3, wav, m4a; up to 50 MB, 10 minutes) | Sent to the omni model when one is set. Otherwise, to the transcriber. Otherwise it is kept but not read. |
| YouTube link | The title, the description and the captions when they are published. A frame is sampled only when the omni model can take the link. |
| Other link | The page's title, description, main text and its main picture (the picture goes to the vision model). |

- **Reading honestly.** Each ref's `read.by` says how it was read: `vision`, `omni`, `frames`, `transcript`, `page` or `none`. The planner's prompt includes that, and its reply must say so in plain words ("I looked at 8 frames from it"; "I only have the video's title"). A ref read with `none` is never described as seen or heard.
- **Privacy line.** Media goes only to the model the person chose for it in Setup. When that model is not set, the media is kept and shown, and the chat says once that it was not read. Originals stay in the chat's `media/`. They are never uploaded to the Feed unless the person posts them.

### Models

Setup gets a third model row, **Looks and listens**, under Planner and Builder:
- It is an omni model, or empty.
- The vision model is the Planner when the Planner takes pictures; otherwise a model picked in that row.
- Each model row shows what the model accepts: Text, Pictures, Video, Sound.

Where those come from:
- what Hermes reports for the model (`modalities` or `input_modalities` in the provider's model list) when it reports it;
- otherwise one tiny check call when the model is picked (a 1-pixel picture), with the answer kept in `models.json`.

This is in spec 6's Setup sheet (web/setup.js). That session owns it, and it gets a short brief when the slice starts.

### Out

- The planner can make:
  - a **mood board**: 4 to 6 of the chat's pictures and painted tiles on one card;
  - **painted options**: 2 or 3 small pictures, one for each option it proposes;
  - a **still**;
  - for a film, a short **clip** or a **sound sample**, but only after asking, since these cost money.
- Pictures are painted with the art queue the Studio already has. This spec sends it jobs and does not change it.
- About three pictures for each block of text. A planner turn with more than three is shown as a row of three and a "+2".
- Everything made is kept in `made/` and listed in `made[]`. An option's pictures go with the option.

### Carried into the locked spec

- Lock copies the chat's live refs and the made items the person picked into the project's References store, with `use` filled in (for example "hero mood", "palette").
- The crew's brief lists them, the same way uploads are listed today.

### Media in a chat, built (2026-11-12)

- `engine/chatmedia.mjs` and `server/chatmedia.mjs`.
- **Dropping or pasting files.** A picture, clip or sound dropped or pasted on the left chat becomes a chip in the message box, in the same row as the layer chips.
  - In a website or app talk, the file is kept in the chat's `media/` and listed in `refs`. `POST /api/chats/:id/media` takes the file; the id `new` makes the chat first. `/chatmedia/:id/:file` serves it, sandboxed.
  - A picture of 5 MB or less is read on the way in by the reviewer's vision model, with reasoning off and the vision fallbacks after it.
  - A clip or a sound is kept and marked `by: 'none'`.
- **Links in a talk message.** Each one is read as a page: its title, description and words. The reader only opens public addresses. Every address a link resolves to is checked, and again after each redirect, so a link never reaches the machine's own services, the tailnet or a private network. Only ports 80 and 443 are allowed.
- **Telling the planner.** `/api/discuss` adds to the person's newest turn one honest line per attachment, for example "The vision model looked at it…", "Its page was read (not seen)…" or "kept but not read". It also lists what was attached earlier, and tells the planner to say how it read each one. The person's turn keeps its `refs`.
- **In a project.** The file joins the project's References with source `chat`. The message names it for the crew, and the crew's brief lists it.
- **Checked live on a test server:**
  - In a talk, a screenshot of the booking form was described by the vision model, and the planner answered "I looked at the picture: a clean booking form in deep teal…".
  - For example.com, the planner answered "I only read the words on the link you sent".
  - In a project, the dropped picture showed as a chip, joined References, and was named in the build's brief.
- **Not yet:**
  - a game talk (server/talk.mjs belongs to the game session);
  - the media model row in Setup (spec 6's file); sampled frames and the sound of clips are read since spec 32;
  - the mood board and painted options (they need jobs on the art queue);
  - Lock copying a chat's refs into the project's References.

## References

One store per project, at `projects/<pid>/refs/`:

```
refs/index.json   [{ id, kind, name, file, url, w, h, source, use, read, from, added, removed }]
refs/<file>
```

`source` says where it came from: `upload`, `chat`, `feed`, `link`, `plan` or `film`. `from` is the chat id, run id or post id.

**One store, many doors.** Each place that holds references today reads and writes this store:

| Today | After |
|---|---|
| `projects/<pid>/uploads/` | Read as references with source `upload`. New uploads go to `refs/`. Old files stay where they are and are listed in the index. |
| `plan.style.refs` | Holds ref ids. Plan sheets the person picks are added as source `plan`. |
| `runs/<id>/video/refs/` and `refsOf` | Film refs are added with source `film`. `refsOf` reads the project's store first. |
| Feed "save as reference" (spec 10, not built yet) | Writes here, with source `feed`. |
| Home › Assets | Lists the refs of every project, along with pictures and films as it does now. |
| The film ref input `.vreffile` and the cast drop | Write here too. The cast drop still sends its file to Meshy as today. |

The Overview's Files panel gets a **References** group after Uploads:
- Each row shows a thumbnail and a name.
- Opening one shows it large, with its source, its use and the chat it came from.
- **+** adds a reference, and dropping a file anywhere on the Overview also adds one.
- A reference can be removed, and undo brings it back.
- **Use for…** picks a section ("the hero", "the menu"). That sends the crew the reference and the section as a chat message, like a comment pin.

### References, built (2026-11-12)

- `engine/refs.mjs` is the store: `refStore({ projectsDir, uploadsOf, known })` with `list`, `all`, `addFile`, `addLink`,
  `remove`, `restore`, `setUse`, `file`, `brief` and `useText`. A picture's size is read from its header.
- `server/refs.mjs` serves it:
  - `GET /api/projects/:pid/refs`;
  - `POST /api/projects/:pid/refs?name=` with the file's bytes, and `POST …/refs/link { url }`;
  - `POST …/refs/:id/remove`, `…/restore` and `…/use { use, send }`. With `send`, the line goes to the project's newest
    build through the comment route; with no build yet it answers 409;
  - `GET /ref/:pid/:file`, sandboxed like `/up/`. A removed reference's file is not served.
- The Overview has a **References** group after Uploads, in the Files panel and on the stage. **+** offers
  **Reference** (files) and **Link**. The inspector shows where it came from, its size and its use, with **Use for…**
  and **Send**, **Open** and **Remove**. Remove's toast has **Undo**, and Delete removes the selected one.
- The crew's brief lists the store's pictures and links, with their use. Home › Assets lists the pictures.
- Uploads stay in `uploads/` and in their own group: `all()` reads them as references with source `upload`.
  Dropping a file on the Overview still uploads it.
- Not yet:
  - `plan.style.refs`, the film refs and the Feed writing to the store (their sessions' files);
  - pictures and links in a chat read by the vision model, and the mood board (the media-in-chat slice);
  - Lock copying a chat's refs into the store.

## Scribble: marks the agent can read

Ported from kresilo, which is the owner's own code (`~/dev/projects/kresilo`, `src/creative/canvasMarks.ts`, `canvasDraft.ts`, `server/creative/canvasVector.ts`):
- the logic is copied;
- the Excalidraw canvas is not, because our canvas is pages in iframes.

### Drawing

- **Scribble** joins `USER_TOOLS` (canvas.js) with the key `s`. It also shows in the Overview and on a reference opened large.
- It draws a stroke, a box or a ring.
- After a mark is drawn, a small field opens at the end of the mark for an optional note. Enter closes it.
- Mark colours: the Studio's ink, cream and its one accent. Kresilo's lime and violet are not used.
- At most 40 unsent marks in a chat.

### What a mark points at

This is finer than a layer. When the drawing ends, `anchorFor` runs in the page's iframe:
- On a page, it picks the element whose box holds the mark's centre, smallest first (kresilo's rule). If none does, it picks the one with the largest overlap share, at least 0.25. It records:
  - `selector`: an id selector when the element has an id, otherwise a short path from the section;
  - `path`: child indexes from the section;
  - `text`: the first 120 characters.
- When that element is a picture (`img`, a background image or a canvas), it also records `region`: the mark's box as fractions of the picture.
- On a reference, `target` is only a `region`.
- On an app or game screen, it is `region` on the last screenshot.
- `box` and `points` are fractions of the surface they were drawn on, so zoom does not change them.

### What the model gets

When the person sends a message with marks, the planner's (or the crew's) request has three parts:
1. **Pictures.** One picture of each surface with all its marks drawn on it, plus a crop around each mark (its box plus 25%, at least 256 px). These are written to `marks/` and sent as images.
2. **Data.** A block in the text, one line per mark:
   `Mark k1 (stroke) on page home, section home-hero, element "section#home-hero > h1" ("Fresh leaf, every week"): bigger, and on one line`
   A mark on a picture adds `region x 0.40 y 0.28 w 0.14 h 0.09 of the hero photo`.
3. **Still open.** The same lines for earlier marks in this chat whose `status` is `open`, under "Marks still open from earlier".

The prompt says:
- Read each mark. Say in one line how you read it ("k1: you want the heading larger and on one line").
- Change exactly those targets and nothing else.
- When a mark is unclear, ask about that mark instead of guessing.

The planner's `reads` keep those lines.

### Drafts

- On a page, a mark's change comes back as a **draft beside the original**: a copy of the section with the change, shown to the right of it on the canvas. This joins the comment pins: a pin can have a draft.
- **Accept** swaps the draft in as a new section version. **Dismiss** drops it.
- Either way, the marks the draft answered get `status: "closed"` and `draft: "accepted"` or `"dismissed"`.
- A mark no draft answers stays open until the person erases it or says it is done.

### Sketch to layout (later slice)

- A sketch made of marks on an empty frame can be sent as **Make clean**.
- It goes to the vision model as one picture plus its notes. The model answers with sections in our HTML, not SVG, so the result is ordinary layers.
- From kresilo's prompt:
  - handwriting becomes placeholder text such as "[Title]";
  - text the model can read stays as written;
  - nothing is invented.

### Eraser, Clear and undo

- **Eraser** (`e`) removes one mark. A selected mark is also removed with Delete.
- **Clear** removes every unsent mark in this chat.
- An erased or cleared mark leaves no trace:
  - it is not in the next request's pictures, crops, data or "still open" lines;
  - its crop file is deleted when the message is sent;
  - it is never sent.
- Erasing an earlier, sent mark sets its `status` to `"erased"`. That drops it from "still open". Its turn still shows that it was sent.
- Undo (⌘Z) brings back the last erased or cleared marks, until the message is sent.
- The message box shows what is attached as chips: "2 marks", each ref, each layer. Removing a chip removes what it stands for.

### Tests

- A message with one mark on a heading produces a model request that holds the mark's selector, its text, its note and a crop image.
- An earlier open mark is listed under "still open". After it is erased, it is not.
- After Eraser or Clear, the request holds no picture, crop, line or id of the removed marks, and `marks/` has no file for them.
- Undo after Clear brings the marks back, and the next request holds them.
- Accepting or dismissing a draft closes its marks.

### Scribble, built (2026-11-12)

- `engine/marks.mjs` cleans the marks, writes each mark's line, keeps the open ones and builds the reader's
  request. `web/canvas.js` `swarm.marks` finds what a mark points at in the page's hidden copy (kresilo's
  rule) and draws a section for a draft.
- The Overview's dock has **Scribble** (S) and **Eraser** (E); Escape goes back to Move. Shift draws a box,
  a closed loop is a ring, and a note field opens after each mark. The message box shows "N marks"; clicking
  it clears them, with Undo, and ⌘Z brings back erased or cleared marks until they are sent.
- Sending: one picture per page with the marks drawn on it and a crop per mark go to the reviewer model,
  with reasoning off and the vision fallbacks after it (it read nothing with thinking on). Its read of each
  mark comes back as the reply; the builder gets the lines and the reads as text, never the pictures.
- Each marked section is rebuilt as a **draft** beside its page, level with the section. Its inspector has
  **Accept** (the draft becomes the section) and **Dismiss**; either closes its marks.
- Checked live on a test server: a ring on the booking form's PARTY SIZE label, noted "bigger, and on one
  line". The reader named that label, asked whether the other labels the ring touched should change, and the
  draft came back beside the page; Accept closed the mark.
- Not yet: marks on references, pins that carry a draft, Scribble in the page editor's toolbar, and sketch to
  layout.

## Drag a layer into the chat

Comes after Scribble.

- Dragging a layer (from the canvas or the Layers list) onto the left chat adds a chip to the message box, with the layer's name.
- A thin line joins the layer to the chip. It is drawn with the deck's wire helpers (`linkWires` and `drawWires`, canvas.js) on the same overlay.
- Several layers can be attached.
- Hovering a chip highlights its line. Removing the chip removes the line.
- A sent turn keeps `layers: [{run, page, layer}]`. Hovering that past message draws its lines again.
- A crew reply about a layer (`comment:take`, or a draft) draws the same line from the reply to the layer.
- Lines are drawn only for layers in view. A layer off screen shows a short line to the screen edge.

### Drag a layer, built (2026-11-12)

- `web/layerlink.js`. A layer drags from three places: the Layers list, the Overview inspector's section list, and a picked section's outline on its page.
- Dropping it anywhere on the left chat adds a chip, at most 12. A drag that starts while the chat is shut opens it.
- Each chip has a thin line to its layer, drawn on a fixed overlay.
  - The line ends at the layer's band on the Overview's artboard, or at its frame in the Design deck.
  - A layer off screen ends at the screen's edge with a dashed line.
  - Hovering a chip highlights its line. Removing a chip removes its line.
- Sending with chips posts the words as a comment on just those sections (`targets`). The `comment` event keeps `layers: [{run, page, layer}]`.
- That turn, the crew's `comment:take` replies and a new `draft` note in the chat all carry their layers. Hovering any of them draws the lines again.
- I did not reuse the deck's `linkWires` and `drawWires`. They draw page-to-page links inside the deck's own coordinates. These lines go from the chat to either view, so they are drawn in screen coordinates.
- Checked live on a test server. I dragged search-panel from the inspector and results from the Layers list. Both lines ended on their bands. "make this one warmer" sent `targets: ["book/book-search-panel"]`, the turn kept the layer, and hovering it drew the line again.

## Manual editing

The model is Open Design's manual edit mode (`nexu-io/open-design`, Apache-2.0: `specs/current/manual-edit-mode-requirements.md`, PR #1448 and #1516). It has four ways in:
- **Edit**, by hand, with no AI;
- **Comment AI**, which is our comment pins and marks;
- **Tweaks**, which is our theme;
- **Draw**, which is our Scribble.

`apps/edit-mode-demo` is not in their repo at HEAD. The working code is `apps/web/src/edit-mode/`.

### Decision: port the core, build the panel ourselves

- **Port** `types.ts` and `source-patches.ts` (about 960 lines, no framework, browser `DOMParser` only). They hold the patch kinds:
  - `set-text`, `set-link`, `set-image`, `set-style`, `set-attributes`, `set-outer-html`, `remove-element`;
  - the guards: protected attributes, keeping the id after an HTML swap, refusing to remove the root.
- **Port parts of `bridge.ts`**: picking a target, its details, and the message protocol. Rename the `od-` prefixes to `sw-`.
- **Build ourselves** the panel, the Layers rows and the history, in plain JS like the rest of web/. Theirs is 1.2k lines of React tied to their i18n and icons, with its state inside a 20k-line file.

Licence:
- Apache-2.0 code can be used under our FSL-1.1-ALv2. The repo already carries Apache code in `dyad/`, with its LICENSE kept.
- The ported files go in `web/edit/` with the Apache LICENSE text, a NOTICE naming the open-design authors, and a "modified" line at the top of each changed file.
- The catalog scan has to pass with those files in. Check that on the slice's PR.

Ids:
- The builder already writes our HTML, so it stamps `data-sw-id` on each meaningful element (headings, text, links, pictures, buttons, groups).
- An index path is the fallback only for old builds.

### The minimum

- **Select** an element from the canvas, or from the Layers list (a section opens to its elements).
- **Edit** its content (text, link, picture and alt), its style (type, colour, spacing, size, background, border, opacity) and its attributes.
- **Remove** it.
- **Drop or replace a picture.** Replacing a picture adds it to References.
- **Reorder and resize** inside auto layout (flex or grid parents): move up or down among siblings, set width or height.
- **Saving.** Each saved edit becomes a new section version (`layer:edit` with `by: "person"`). Undo and redo work per section.
- **Kept apart.** A person's edits and the crew's edits are separate versions with who made them. The crew's next rework of that section starts from the person's version, and its prompt says what the person changed so it is not undone.
- `USER_TOOLS` gets a tool only when it really works end to end. Today it has move, text and comment; Scribble and Edit join when their slices land.

### Manual edit, built (2026-11-12)

- **The port.** `web/edit/patches.js` adapts `source-patches.ts` and `types.ts` (Open Design commit 6147958) to plain JS, wrapped in one name (`swEdit`) because the studio's modules are joined into one script. The Apache LICENSE and a NOTICE (what was taken, what changed) sit beside it. Kinds: `set-text`, `set-link`, `set-image`, `set-style`, `set-attributes`, `remove-element`, and our own `move-element` (up or down among siblings). Guards kept: words inside nested markup go to Code, the section's only element can't be removed. Added: `javascript:` links, `on…` attributes, the canvas's own `data-layer`/`data-gen` and style values with `<>{};"` are refused. `set-outer-html` was left out: Code already edits the whole section.
- **Ids are index paths**, `path-0-2` inside the section's fragment, the same path the point-to-element reader (`ANCHOR_JS`) returns. No `data-sw-id` stamping: it would need every builder prompt changed, and a path is enough while the panel re-reads the part after each change (a move hands back the part's new path).
- **The panel** is the Overview inspector. A picked section lists its **Parts** (indented; boxes named Section, Box, Form, List…; words and pictures by their words or alt). A part opens **Content** (words, link, picture address and alt, Replace), **Style** (size, weight, line, letters, colour, align, width, height, padding, margin, fill, corners, opacity), **Attributes** (each one, plus name/value Add), and Up, Down, Remove, Code. Clicking inside the picked section on the page picks the part under the pointer.
- **Replace** uploads the picture to the project's References and points the part at its `/ref/…` address, the same address the crew is given for reference pictures.
- **Saving** goes through `swarm.layers.save`, so each change is a section version (`layer:done`, `restored`, `by` the canvas, `why` "hand: words" / "hand: style" / …), with undo, redo and Versions as for Code.
- **The crew keeps it.** `engine/handedit.mjs` collects the hand changes made since the crew last wrote that section; a comment, a dragged layer, a Scribble draft or an SEO rewrite of it tells the builder "The person changed this section by hand (words, style)… Keep them". The HTML it gets already has them.
- Tests: `tests/handedit.test.mjs` (the crew note, and every patch kind in a real browser; skips without Playwright).
- **Not yet:** the left Layers list opening to parts, dropping a picture straight onto a part, resize handles on the canvas, an outline on the picked part, and `USER_TOOLS` (the old canvas rail; the Overview is where editing lives). There is no separate catalog scan in CI; `scripts/check.sh` passes with `web/edit/` in.

## Slices

1. **Chat store.** The record, routes, the Make box opening a chat, the home **Chats** entry, a project's chats by category, the move into a project on build, clean-up, and the old plans brought in. Spec 27's `/api/talk` writes to it. Refs, marks and made items stay empty for now. 1 day.
2. **References.** The project store, the Files group, adding from + and drop, Use for…, and the existing stores read through it. Pictures and links in a chat, read by the vision model, with honest reading. A mood board out. Open and Locked shown in the spec beside the chat (spec 27's logic). 1½ days. That is the owner's "first slice" for media.
3. **Scribble on references and pages.** Marks, targets, the request with pictures and data, still open, Eraser, Clear, undo, and the tests. Then drafts beside the original, joined with comment pins. 1½ days.
4. **Sketch to layout.** ½ day.
5. **Drag a layer into the chat**, with lines. ½ day.
6. **Media, the rest.** Video, audio, the omni model row in Setup, painted options, clips and samples. 1 day.
7. **Manual editing.** Port, ids, the panel, versions, undo. 2 days.

## Done when

- A chat started from the Make box survives a reload and shows under Chats on home, not in Projects.
- Building it moves it into the project, where it shows under its category.
- A picture and a link added to a chat are read, and the planner says how it read them. A mood board comes back.
- Lock carries the refs into the project's References, and the crew's brief lists them.
- A circle on a heading, sent with "bigger", produces a request with the heading's selector, text and crop. The draft beside it changes only that heading. Accepting it closes the mark.
- Eraser and Clear leave no trace in the next request.
- A layer dragged into the chat shows a chip and a line. Hovering a past message shows its line again.
- A person's text edit is a section version that the crew's next rework keeps.
