# Plans (2026-11-12)

This page records where each kind of work is headed. Read [PRODUCT.md](PRODUCT.md) and
[decisions/](decisions/README.md) first; they win where this page disagrees.

Every line has a status:

- **Decided:** the owner said it. Build to it.
- **Proposed:** a session's suggestion. Don't build it until the owner says so.
- **Open:** no answer yet.
- **Gap:** known missing work.

The owner's full log is kept outside the repo, in `DECISIONS.md` in the hackathon folder.

## 1. Websites: the guided walk

The guided walk is a prototype on branch `proto/guided-walk`. It is local only and won't merge until the owner
approves it.

- **Decided:** the order is What you have, then Brand, Lock, Plan, Designs, Build.
  - **What you have** is an importer, not a form. It has a Skip button and keeps its drop box after you leave it.
  - **Brand** shows three options, which are the moodboard. People never see the word "pack".
  - **Lock** covers the look only.
  - **Plan** sets the pages and their sections. Behind the site adds the sign-in and admin screens.
  - **Designs** makes three takes (Editorial, Bold, Quiet). You can compare them and pick one.
  - **Build** builds the picked design.
- **Decided:** the walk is one infinite canvas, and the chat docks at the bottom.
- **Decided:** you can change things yourself with tools, as well as by prompting. Any item can open big with a
  toolbox, and changes are kept per item.

### How the moodboard, the brand sheet and Lock relate

- **Decided:**
  - The brand options are the moodboard. Picking one fills the brand sheet, which is the style sheet.
  - Lock freezes the sheet into named variables with `brandTheme`: `--background`, `--foreground`, `--primary`,
    `--accent` and `--link`, the heading and body fonts, and the corner radius.
  - Builds must use those variables, and the reviewer's `checkBrand` flags anything off them.
- **Decided:** Lock first folds in what the person changed by hand on the look (colours, heading font, corners).
  So the locked values are the person's, not the option's defaults. This is prototyped.
- **Decided:** a change to the whole look goes into the variables. A change on one page is that page's own
  exception.
- **Gap:** the reviewer doesn't accept per-page exceptions yet.

### After a design is picked

These are proposed steps:

1. **Small changes before building.** Use Open Design's tools or the chat
   ([decision 0010](decisions/0010-open-design-tools.md)).
   - A change to the whole look goes back into Lock's variables.
   - A change on one page stays that page's own.
   - Draw marks travel with the page.
2. **Build.** It shows what will be built and the cost, and waits for a go. Then it opens the Design deck with the
   crew's cursors. Stop is always available.
   - **Gap:** the build brief must carry:
     - the picked design;
     - the pages and sections;
     - the locked look;
     - each page's exceptions and marks;
     - the Behind the site screens.

     The prototype's brief drops the per-page changes and the marks.
3. **After the build.** Use Open Design's Edit on the real code. Comment and Draw send a spot to the crew. Each
   change is a new version in the Overview.
4. **Play.** Choose Play prototype or Watch a visitor. The review loop runs here too.
5. **Publish.** Add SEO and a thumbnail. Story makes the posts, and the person posts them. The Feed gets one card
   per project.

Still open:

- **Proposed:** when one design is picked, the other two stay dimmed until Build.
- **Proposed:** after-build edits can't change Lock's variables. To change the look, go back through Lock.
- **Open:** does Behind the site build with the pages, or as a second step?

### Where the editing tools work today (main)

They work only in the Overview, on built sites.

- **The Inspector.** Pick a section, then its parts, then Content, Style or Attributes. It is a port of Open
  Design's `source-patches` (`web/edit/patches.js`, `engine/handedit.mjs`).
- **The dock.** Scribble (S) and Eraser (E). Marks go to the reviewer, the crew makes drafts, and the person
  accepts or dismisses each one.

**Gap:** these aren't available yet:

- in the Studio walk;
- Open Design's own Tweaks and Draw (Draw replaces Scribble);
- marks on references;
- an outline on the picked part;
- resize handles.

## 2. Games (specs 01, 22, 23, 37, 38)

- **Decided:** go Make, then Game, then a few quick questions. Then choose Build (one prompt) or Shape it (a
  guided Plan board).
- **Decided:** the starter picks four things:
  - the engine: browser or Godot 4;
  - a template;
  - an art pack, or paint your own;
  - which systems are on or off.

  This is built.
- **Decided:** guided shaping (spec 22) uses playable slices that write `heroes.json`. Its tools are built
  (`engine/voice.mjs`, `engine/skins.mjs`). Whether the guided board itself is finished hasn't been checked.
- **Decided:** Lock shows the price.
- **Decided:** the build is staged:
  1. The art is painted first, as anime-family sprite sheets on magenta.
  2. Art can be asked for in the middle of the build.
  3. Bots play-test it.
  4. Each stage gets a go-ahead in the chat.
- **Decided:** the Feed shows the trailer and the art. It never hosts the game.
- **Gap:** Open Design's tools are HTML-only, so they don't reach a game.
- **Proposed:**
  - Draw on a paused frame.
  - Sliders over the game's config.
  - Swap or re-roll a single asset.
  - Open in Godot (in spec 38, not built).
  - Compare two or three takes.

## 3. Video (specs 15, 26, 39, 40)

- **Decided:** the Video kit has Script, Storyboard, Music, Voice, Length and shape, and a Look taken from the
  brand. A film can be made with no website.
- **Decided:** the Director makes six kinds of film: demo, mood, character, gameplay, music and announce. It cuts
  on the music's beats, and a film critic reviews the result. Story's film is made from story beats.
- **Decided:** HyperFrames is the default engine, and the person can pick another
  ([decision 0011](decisions/0011-hyperframes-default-video.md)).
- **Open:** which other engines to offer. Candidates:
  - Remotion (needs a company licence above a certain size);
  - Revideo or Motion Canvas (MIT);
  - Theatre.js (Apache, with a timeline editor).
- **Proposed:** an editable storyboard, Draw on a paused frame, and sliders for pace, length and music.

## 4. Decks (spec 37, the Deck kit)

- **Decided:** use Open Design's html-ppt themes as data (MIT, one HTML file per deck). Open Design's Edit,
  Tweaks and Draw work on them because they are HTML.
- **Decided:** not Gamma. The owner doesn't like it, and it doesn't fit:
  - its decks live on Gamma's own site;
  - no Hermes plugin for it is known (not checked);
  - Swarm could only embed or export its decks.
- **Open:** which engine renders decks. Candidates:
  - Open Design html-ppt (best fit);
  - reveal.js (MIT);
  - Slidev or Marp (MIT, written in Markdown);
  - Presenton (Apache, a self-hosted alternative to Gamma).
- **Open:** PPTX and PDF export. PptxGenJS (MIT) is a candidate. Spec 35 proposes our own small exporter, which
  goes against [0003](decisions/0003-mature-dependencies.md).
- **Gap:**
  - no kit for single graphics (posters, social images);
  - no way to compare takes of a deck.

## 5. How the UI is governed

This follows the research report `reports/Agent era UI governance workflows.md` in the hackathon folder.

- **Done (main):**
  - XState for navigation (#321, #322, #331);
  - type checking with TypeScript 7 and dependency-cruiser (#373, #376);
  - the canvas file split (#375 to #377);
  - `docs/decisions/`.
- **In progress:**
  - the first of the six design artifacts, the object map and glossary:
    [docs/ux/OBJECTS.md](ux/OBJECTS.md), a draft for the owner to review. Its name picks are proposals.
- **Not started:**
  - Playwright audit gates in CI;
  - the other five design artifacts:
    - a statechart in Stately;
    - breadboards;
    - per-screen specs in OpenSpec;
    - Storybook mock-ups;
    - an independent review;
  - React Aria;
  - design tokens in W3C format with Style Dictionary (Lock's variables are the first candidate);
  - feature flags with OpenFeature;
  - Danger JS;
  - screenshot review with Argos or Chromatic. Only the owner approves these.
- **Decided, deferred:** move to Vite, React and TypeScript once the flows are designed.
- The guided-walk prototype hand-writes screens and menus. It is a flow mock-up only. The real version is built
  from the six artifacts with mature libraries.

## 6. The guided-walk branch

**Gap:** two checks fail on `proto/guided-walk`. Fix them when the walk is approved.

- The untyped-lines count is over its cap.
- Four tests still expect the old step order: `nav.test.mjs` and `studio.test.mjs`.
