# 37. Studio first

The owner, 2026-11-12:
- "what about when clicked ask them if theyd like to go studio mode first? and in that studio mode they get
  the scaffold and the default flow where they can brand or gather asset or references or whatever"
- About the game's Plan board: "i really loved that idea as an option instead of just making something
  directly, it felt like a real studio, is there a way to make it a possible option right here"
- "maybe this should be a new feature for branding before website? or even moodboard and references so
  people can bring in ideas first before designing and they can either use the branding + mood board itself
  to directly create video/motion design from it skipping website entirely, or create website from it or app
  from those design … or even a small proposal first before creating them … presentation decks"

The owner asked for all the parts to be built in parallel. This spec is the contract the parallel sessions
build against: the flow, the kit contract, the project's brand, References and Assets, and the navigation
states. Read [docs/ux/RULES.md](../ux/RULES.md) first. In short:
- names only, no tooltips;
- every conversation stays in the left chat;
- nothing builds, publishes or posts until a person presses the button.

## The flow

```
Idea ─▶ the question ─┬─ Build now ───────────────────────────────▶ Build (as today)
                      └─ Studio first ─▶ the scaffold ─▶ Lock ─▶ Build
                                         Brand · References · Assets · Plan · Lock
```

1. **The question.** After Make, one question with two choices: **Studio first** and **Build now**. The
   planner pre-selects the one that fits:
   - Studio first for a game, a vague idea, or an idea where the look matters;
   - Build now for a clear, small ask.

   The answer is remembered per kind. After three Build now in a row for a kind, the question stops for that
   kind, and the kind menu keeps a **Studio first** item as the quiet way back.
2. **The scaffold.** A board (the shared shell, `web/board.js`) with the five steps visible as sections,
   with the chat on the left. The planner says in the chat where to start and why, in one line. The steps:
   - **Brand**: the project's brand (below);
   - **References**: "like this";
   - **Assets**: "use this as given";
   - **Plan**: the kind's own cards (its kit);
   - **Lock**: the proposal, then Lock.

   Steps can be done in any order, and any step can be skipped. Only Lock is required before Build. Each
   step shows its state as a dot: empty, started or done. Its name is its label.
3. **The proposal** is one page before Lock: what will be made, in what order, how long it takes and what
   it costs. Its choices are **Approve**, **Change** and **Stop here**. A proposal alone is a deliverable: it
   can be saved and shared without building. Approve locks it.
4. **Lock** freezes the brand, the references and assets picked, and the kit's spec into the **locked
   spec**. Build reads only the locked spec. The reviewer checks the build against it (spec 31's
   `checkBrand`, plus each kit's own checks). Changing anything after Lock unlocks it, as the Plan board does
   today.
5. **Build** is the kit's own build: Website, App, Game, Video or Deck. A Brand-only project ends at Lock:
   the brand is the deliverable.

**Grill me** stops being a separate switch. It becomes how the planner talks in the Studio, with a depth
choice of **Light** or **Thorough**, set in the scaffold's chat and stored on the studio record.

## The kinds

The Make menu offers Website, App, Game, Video, **Brand** and **Deck**. Each kind is a **kit**. Brand is
the one kit with no Plan step: its Lock is the end.

## The kit contract

One module per kind, so sessions don't collide in `web/home.js`, `web/board.js` or `web/brand.js`:
`web/kit-site.js`, `web/kit-app.js`, `web/kit-game.js`, `web/kit-video.js`, `web/kit-deck.js` and
`web/kit-brand.js`.

- Each module exports one object named `<kind>Kit` (`siteKit`, `appKit`, `gameKit`, `videoKit`,
  `deckKit`, `brandKit`).
- `web/kits.js` lists them: one import line per kind (`import { appKit } from './kit-app.js'`) and its
  name in the list. That is the only shared edit a kit makes.
- `server/page.mjs` joins every `web/kit-<kind>.js` in its own closure, and only `<kind>Kit` leaves it,
  so a kit's helpers stay its own.

```js
// web/kit-app.js
export const appKit = {
  kind: 'app',                     // site · app · game · video · deck · brand
  name: 'App',
  icon: 'code',                    // a name from web/icons.js
  steps: ['brand', 'references', 'assets', 'plan'],   // which scaffold steps it shows (Lock always shows)
  // "where to start": 2–4 choices, the planner pre-selects one and says why in the chat
  starts: [{ id: 'plan', name: 'Screens', why: '…' }, { id: 'brand', name: 'Brand', why: '…' }],
  // optional: which of `starts` the planner picks, from what the project has so far
  suggest: ctx => 'brand',
  // which parts of the project's brand it uses
  reads: ['palette', 'type', 'voice', 'pictures'],
  // optional, async: loads its saved state or drafts one from ctx.studio.idea, once, before its cards
  prepare: async ctx => {},
  // its Plan step: sections of artboards on the shared board
  plan: {
    // a card: cls (its look) or the flags add (a + card) and wide; render(el), with null meaning the
    // kit's own board draws it (the scaffold shows its name); inspect(box) for the inspector, or press()
    sections: ctx => [{ sec: 'Screens', cards: [{ key, name, cls, add, wide, render(el), inspect(box), press() }] }],
    // the chat's questions for this kind (Studio talk, below); [] when the planner asks them (a game)
    questions: ctx => [{ id, q, options: [{ id, name, picture? }], free: true }],
    // a picked option or a typed line in the left chat, back to the kit (wired with the Studio talk)
    answer: (ctx, { id, option } | { text }) => ({ say, options, left }),
    left: ctx => 0,                    // the decisions still open ("N left")
    done: ctx => true | false          // whether the Plan step's dot is "done"
  },
  // minutes 0: not known (a game has no estimate)
  proposal: ctx => ({ items: [{ what, order }], minutes, credits }),
  // optional: a kit with its own gate (the game's priced confirm, checked again by the server); Lock
  // calls it instead of writing the spec itself, and lock(ctx) returns null until it has locked
  gate: async ctx => {},
  // what it writes into the locked spec, under spec.kits[kind]; plain JSON
  lock: ctx => ({ /* its own fields */ }),
  // starts its build from the locked spec; called only from the person's Build press
  build: (spec, ctx) => Promise<{ run }>,
  // optional: what the reviewer checks against the locked spec
  check: (spec, run) => [{ part, ok, note }]
}
```

`ctx` is what the scaffold hands every kit:
- `{ project, studio, brand, refs, assets, chat, sw, C, board, state, look, save, select, say }`;
- `board` is the `makeBoard` instance;
- `state` is the kit's own saved working state (`studio.kit`), and `save(fields)` merges into it
  (`POST /api/studio/:pid/kit`; `null` drops a field) and redraws;
- `look` is the brand's colours and fonts to draw cards in, or null;
- `refresh()` redraws the sections; a kit calls it whenever its cards change;
- `select(key)` selects a card, and `say(text)` (also `sw.say`) posts in the left chat.

A kit never builds the chat, the top bar or the board shell itself.

**The reference implementation is the game.** `web/kit-game.js` wraps today's Plan board (`web/plan.js`,
spec 21):
- its cards are the Plan step;
- its price is the proposal's cost;
- its lock is the plan's lock.

The game session moves it behind this contract without changing what the board does.
- It brings its own board (`web/plan.js` makes its own `makeBoard`), so its cards have `render: null`
  and `inspect` selects the card there.
- Its Lock is its own gate (`gate(ctx)`), and its questions come from the planner in the chat (spec 27).

### A game's starter

A game's Plan step starts with three choices and a set of systems (the game kit, `engine/starters.mjs`,
the `starters/` folder):

- **A choice carries its reason and its owner:** `{ value, why, by: 'planner' | 'person', turn? }`, the
  same shape as spec 27's decisions. The planner suggests; the person keeps or removes. The planner never
  overwrites a choice the person made.
- **The three choices are Plan choices, not Brand:**
  - `engine`: `'web'` (the browser) or `'godot'`;
  - `template`: a starter id, such as `'strategy-topdown'`;
  - `assets`: a pack id, or `'paint'` (paint my own).
- **Systems are switchable parts of a starter:** `{ id, name, why, on, by, required? }`. A required one
  can't be removed.
- **Lock writes the starter into the locked spec:**
  `spec.starter = { engine, template, assets, systems: [ids on], addons: [{ id, version, source }] }`.
  The build reads only that. Changing a starter choice reopens the spec, as any decision does.
- **A starter is a folder that ships inside the plugin:** `starter.json` (id, name, engine, families,
  systems, assets) and its files. The build copies it in before the crew writes. Nothing is downloaded at
  build time (the Nous review).
- **Add-ons say where they came from:** `source: 'ours' | 'pinned' | 'brought'`, an exact version, the
  licence and credits, and a sha256 and url for pinned ones. One the person brings is dropped in like an
  asset and kept with the project.
- **A pack is an asset with the role `pack`.** It is "use this as given": it skips painting and is never
  redrawn. Its record keeps `pack: { id, source, version, licence, credits, sha256, url, engines, native }`.
  `native: true` means the web preview can't run it, and **Open in Godot** is the main action (spec 38).
- **The crew builds on the starter.** The build prompt names the starter's APIs. The crew adds the game's
  own scenes and scripts and doesn't rewrite the systems.

## The project's brand

There is one brand per project. Every kit and every output reads it: colours, type, voice and picture style.

- **Where it is stored:** `<data>/projects/<pid>/brand.json`, in spec 31's shape (story, palette, type,
  packs, `lockedAt`) plus `voice` and `pictures`.
- **Reading it:** `brandOf({ project, chat })` reads the project's brand first, then the chat's
  `chat.brand` (spec 31, for a talk that has no project yet).
- **When the project is made:** a chat's brand moves into the project the first time the project exists.
- **A quick build** (Build now) quietly makes a minimal brand from what the planner picked: the theme's
  palette and type, `quick: true`. The next Studio session starts from it, not from nothing.
- **Kits read only.** Changes go through the brand sheet's routes (spec 31), which become per-project:
  `/api/brand/:chat…` also answers to `/api/projects/:pid/brand…`.

## References and Assets: two stores

| | References | Assets |
|---|---|---|
| Means | "like this": mood, examples, inspiration | "use this as given": a logo, product photos, a game's starter pack |
| The crew | reads them and makes its own | puts them in as they are, never redrawn or recoloured |
| Store | `projects/<pid>/refs/` (spec 29, `engine/refs.mjs`) | `projects/<pid>/assets/` (new, `engine/assetstore.mjs`) |
| Index | `refs/index.json` | `assets/index.json`: `[{ id, kind, name, file, w, h, source, role, added, removed }]` |

- `role` says what an asset is: `logo`, `product`, `photo`, `font`, `pack` or `other`.
- `source` says where it came from: `upload`, `chat`, `feed` or `pack`.
- Moving a file between the stores is one action on the card: **Use as given** and **Use as reference**.
- Routes: `GET /api/projects/:pid/assets`, `POST /api/projects/:pid/assets` (an upload, or `{ ref }` to
  move a reference over), and `DELETE /api/projects/:pid/assets/:id`. A delete keeps `removed`, so undo
  works.

## The studio record

The Studio starts by making the project, so there is somewhere to keep the brand, references and assets.
It is a project with no runs yet, listed in Projects with the status **Studio**.

```js
// <data>/projects/<pid>/studio.json
{
  v: 1, kind: 'site', idea: '…', depth: 'light' | 'thorough', chat: '<chat id>',
  steps: { brand: 'empty' | 'started' | 'done' | 'skipped', references: …, assets: …, plan: … },
  start: 'brand',                       // where the planner suggested starting
  proposal: { items, minutes, credits, at } | null,
  locked: { at, spec: { brand, refs: [ids], assets: [ids], kits: { site: {…} } } } | null
}
```

Routes (`server/studio.mjs`):
- `POST /api/studio { kind, idea }` returns `{ project, chat }`;
- `GET /api/studio/:pid`;
- `POST /api/studio/:pid/step { step, state }`;
- `POST /api/studio/:pid/depth { depth }`;
- `POST /api/studio/:pid/proposal` (the kit's proposal, saved);
- `POST /api/studio/:pid/lock { credits }` (409 when the price moved, as the Plan board does) and
  `/unlock`;
- `POST /api/studio/:pid/build`: the person's press. It hands the locked spec to the kit's build.

## Navigation: states in the machine

The scaffold is part of the navigation machine (spec 34, `web/nav.js`), not loose variables. It is added
together with the Onboarding session, which owns the machine:

```
nav
└─ studio                       context.project, context.step
   ├─ brand · references · assets · plan · proposal
```

- **Events:**
  - `studio { project, step? }` enters the scaffold, on the suggested step when there is no `step`;
  - `studio.step { step }` moves between steps;
  - a build started from the Studio goes to `build` through today's `started`.
- **The address:** `?room=studio&project=<pid>&step=<step>`, like every other room's.
- **Esc** goes up a step and then to Home. The breadcrumb reads `Projects › name › step`.
- **Today's `brand` and `plan` states** stay as they are until their boards move behind kits. Then they
  become `studio.brand` and `studio.plan`.

## Talking in the Studio

All of it is in the left chat:
- **One question at a time**, each with visual options (cards, swatches, a picture) plus free text.
- **Pushback** when two answers conflict ("calm" and "neon everywhere"), in one line with a choice.
- **The board fills** as answers land. A count of the decisions left shows as a state ("4 left").
- **"You decide the rest"** lets the planner finish the open ones and show them for a yes.
- **Depth:**
  - Light asks the few questions that change the most;
  - Thorough goes through every card.

## The lightbulb

There is a lightbulb on the Make box. It shows ideas as cards, each with a real thumbnail: a pack's colours
and a rough first frame.

- **With something typed:** ideas built on it. **Shuffle** gives new ones, and **Mix** joins two picked
  cards into one.
- **With nothing typed:** one question, "What do you have?", with a few choices: An idea, A brand, Pictures
  and A site to redo.
- **The idea cards come from three places:**
  - the person's own brands and projects;
  - the planner's ideas from what was typed;
  - the Feed's **People are making…**, which is read-only and never posts.

## Who builds what

| Part | Session | Files |
|---|---|---|
| This spec, the question, the scaffold, the Website kit, the proposal and Lock, the lightbulb, the Studio talk | Studio first (this one) | `web/scaffold.js` (beside the studio controller `web/studio.js`), `web/kits.js`, `web/kit-site.js`, `web/kit-brand.js`, `server/studio.mjs`, `engine/assetstore.mjs`, `engine/studio.mjs` |
| The `studio` states in the machine | Onboarding (`local_433b12aa-bfec-4733-a7fc-799ca3c525cd`) with Studio first | `web/nav.js` |
| App kit | game-art-pipeline (`local_d942daf3-5e93-4b16-859f-19350f268328`) | `web/kit-app.js` |
| Video kit, Story film | video-director (`local_6e540b29-6ca4-46c0-a129-924b821f037a`) | `web/kit-video.js` |
| Story cards | build-seo (`local_25e22543-f403-4b22-9cda-14f1f7afe388`) | cards a kit can import, `web/kit-cards-story.js` |
| Deck kind, Open Design data | open-design-eval-2 (`local_fe7a9e1c-57d2-45d1-8970-298a4b232fdf`) | `web/kit-deck.js` |
| Game kit (the Plan board behind the contract), game starters | game-builder-loop (`local_e718470c-6699-42cd-a0fd-5e3a754265db`) | `web/kit-game.js` |

Until `web/scaffold.js` lands, a kit can be built and tested on its own:
- `makeBoard` is the board;
- a stub `ctx` holds an empty brand, refs and assets;
- `kits.js` is the one line it adds.

## Rules every kit keeps

- Names only, no tooltips, and no colour but the tokens and `--accent`. The person's swatches and pictures
  are content.
- Every conversation stays in the left chat. A kit adds no chat box, sidebar or dock.
- Nothing builds, publishes or posts without the person's press. A model's suggestion is never a press.
- The Nous review rules:
  - no `{...process.env}` to a child process;
  - frames are sandboxed without `allow-same-origin` and talk by `postMessage`;
  - no HTML cleaning by regex;
  - model calls go through Hermes.
- Test data stays tiny and temporary run folders are deleted afterwards. The owner's 4319 server and data
  folder are never used.

## Slices

1. **The question on Make.** Studio first or Build now, pre-selected, remembered per kind, with the
   three-in-a-row rule. Brand and Deck are added to the kinds, and Grill me becomes the Studio's depth.
2. **The scaffold.** The board with the five steps, the chat on the left and the planner's start. The
   References and Assets steps are on their stores, and the Website kit is the brand sheet plus a
   storyboard strip of the pages.
3. **The proposal and Lock.** Approve, Change and Stop here; the locked spec; Build from it; and the
   reviewer's check against it.
4. **The lightbulb and the Studio talk.** Questions one at a time, pushback, the count and You decide the
   rest.
5. **The kits.** Each kit is its own session's PRs, against this contract.
