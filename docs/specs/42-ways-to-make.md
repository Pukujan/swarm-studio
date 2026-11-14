# 42. The ways to make something

Status: agreed (owner, 2026-11-13). Built in PR make-menu-ways. Superseded for the menu by
[decision 0020](../decisions/0020-ask-before-build.md) on 2026-11-13: Make now has two ways, not five. The rest of
this document is kept as history.

## Now: two ways (decision 0020)

| Way | What the person sees | Then |
|---|---|---|
| **Just make it** (needs words in the box) | One prompt. A new website goes straight to the one question asked before a build: Skip all, Step by step or Pick steps to skip. An App, Video or Game shows the brief in the Design deck's chat. | The answer starts the crew (website), or **Build** does (App, Video, Game; **Keep talking** is the other choice). |
| **Studio** (works with an empty box) | The walk: a Studio project with every step the kind needs (Brand, References, Assets, Plan, Lock). For a Game, the Studio is its Plan board, where the planner's talk asks. | Lock, then Build. |

| Kind | Ways | Why |
|---|---|---|
| Website, App, Video, Game | Just make it, Studio | Each can be built from one prompt or walked. |
| Deck | Studio only | A deck is built from its Studio's Lock (`web/kit-deck.js`). |
| Brand | Studio only | A brand is not built; its Lock is the end. |

Rules:

- **A kind with one way has no menu.** Make goes straight there.
- **With an empty box only Studio is offered**, for every kind, so there is no menu. Just make it needs words.
- **The last way picked is remembered per kind.** A remembered way that is no longer offered (guided, takes,
  scaffold) is forgotten, and the words decide: a game leans Studio, a short or look-led idea leans Studio, a clear,
  longer ask leans Just make it.
- **Nothing builds without the person's press or answer.**

What became of the old five:

| Old way | Now |
|---|---|
| Just build | **Just make it**. |
| Guided | The question's **Step by step** answer. A game's Guided talk is now its Studio. |
| Scaffold (a bare Plan) | Skipping Brand when asked. |
| Three takes | The Brand step's three options. |
| Studio | **Studio**. |

The code for Three takes inside the Studio board (a studio record with mode `takes`) and for a record with only a
Plan step still exists, but nothing in Make opens it. The Make box's guided questions pop is no longer reached from
the menu.

## The problem, in plain words

The owner, testing the Make menu live:

> why are these two buttons the same thing? and why is these buttons on deck mode pulling me to branding again
> instead

and then, about the whole structure:

> we need to differentiate guided path vs just prompt and make something happen vs show 3 choices of them vs the
> skeleton scaffold mode for deck, app builder, website design whatever, vs what studio mode is that guides u
> from branding to design to whatever we need all laid out bare and clickable for whoever wants to click and fill
> them in or delete them

Make offered **Studio**, **Brand sheet** and **Build now**. For every kind with a Studio kit, the first two opened
the same screen, the Studio on its Brand step. So did a Deck, which should start from what it says. Several
ways to make something already existed in the code (the guided prompt, the brief before a build, the Studio,
the Plan board's talk), but the menu offered only some of them, and under names that did not say where they go.

## The five ways (before decision 0020)

| Way | What the person sees | Then |
|---|---|---|
| **Just build** | The brief, in the Design deck's chat, with **Build** and **Keep talking**. No questions. | Build starts the crew. |
| **Guided** | The questions the prompt left open, one at a time (chips or your own words), then the brief to edit. | Build starts the crew. |
| **Three takes** | Three directions for the idea side by side, each in its own look (colours, type, photos, voice). | Use one: it becomes the project's brand, and the Studio goes on. Mix opens the brand sheet; the takes stay until one is used. |
| **Scaffold** | The kind's structure laid out bare: a website's pages, an app's screens, a deck's outline and slides, a film's storyboard. Every block can be clicked, filled, reordered or deleted. | Lock, then Build. |
| **Studio** | Every step the kind needs as a path across the top of the board: Brand, References, Assets, Plan, Lock. Each step opens on a click. Any step can be skipped, removed or brought back, in any order. Not a wizard. | Lock, then Build. |

Rules for all five:

- **Nothing builds without the person's press** (spec 37, the kit contract). Just build still ends at the
  brief's **Build**; it skips the questions, not the press.
- **Just build, Guided and Three takes need words** in the box. With an empty box, Make offers only the ways
  that can ask: the Studio's chat asks "What are you making?" (spec 37), and a game's Guided talk asks too.
- **A kind with one way has no menu.** Make goes straight there.
- **The last way picked is remembered per kind** and pre-selected next time. With nothing remembered, the words
  decide: a short or look-led idea leans Studio; a clear, longer ask leans Just build (`studioFits`, spec 37).
- Each item is the way's plain name. No two items in one kind's menu lead to the same screen.

## Kind by way

✓ built. — not offered (not built, or it does not apply; the reason is in the cell).

| Kind | Just build | Guided | Three takes | Scaffold | Studio |
|---|---|---|---|---|---|
| Website | ✓ | ✓ the site questions | ✓ | ✓ Pages | ✓ |
| App | ✓ | ✓ the app questions | ✓ | ✓ Screens | ✓ |
| Video | ✓ | ✓ the film questions | ✓ | ✓ Storyboard | ✓ |
| Deck | — a deck is built from its Studio's Lock (`web/kit-deck.js`) | — no deck questions yet | ✓ | ✓ Outline and slides | ✓ |
| Brand | — a brand is not built; its Lock is the end | — no brand questions yet | ✓ | — a brand has no Plan step | ✓ |
| Game | ✓ | ✓ the plan conversation on the Plan board (spec 27) | — not built | — the Plan board, reached by Guided | — the Plan board, reached by Guided |

A game's scaffold and studio are its Plan board (specs 21, 22, 27): the talk on the left, the cards taking
shape on the right. Guided opens it, so it is offered once, as Guided.

## How each way maps onto the code

| Way | Code | Specs |
|---|---|---|
| Just build | `confirmBuild` in `web/home.js`: the talk's brief in the Design deck's chat (`sw.talk.start`), whose Build calls `start` → `sw.submit` (a website) or `POST /api/auto` (App, Video, Game). | 27 (talk first), 37 (Build now) |
| Guided | `guide` in `web/home.js`: `GUIDES[site / app / film]` from `engine/intake.mjs`, only the questions the prompt has not answered, then `drawBrief` (Build, Keep talking). A Game: `C.talkGame`, the planner asking one question at a time on the Plan board. | 06 (the guided prompt), 22, 27 |
| Three takes | A Studio project made with `mode: 'takes'`; its brand made from the idea (`POST /api/projects/:pid/brand`, spec 31). The board's **Takes** section shows the first three pack cards (`packCards`: the planner's picks first, else the brief's words, padded to three). Use → `pick { part: 'pack' }`, the record's mode becomes `studio`. Mix → the brand sheet. | 31, 35 (packs), 37 |
| Scaffold | A Studio project made with `steps: ['plan']`, opened on Plan: the kit's own cards (`kit.plan.sections`). The other steps are removed, and the path can bring each one back. | 37, 40 (film) |
| Studio | A Studio project with every step the kit names (`kit.steps`), the step path above the board (`web/scaffold.js`). | 37 |

What changed from spec 37:

- Spec 37's question on Make (Studio first or Build now) became this menu. **Build now** is now **Just build**.
  **Studio first** is now two ways, Scaffold and Studio. The depth (Light, Thorough) stays on the studio
  record; Thorough's questions are now their own way, Guided.
- The brand sheet is no longer a way of its own. Three takes and the Studio's Brand step both open it.
- A Studio step can be **removed** as well as skipped: `POST /api/studio/:pid/step { step, state: 'removed' }`
  takes it off the record, and `state: 'empty'` puts a removed step back. Lock is never removed.
- The studio record keeps `mode` (`studio`, `scaffold` or `takes`): how the project was begun.

## The Studio's step path

A row across the top of the board, in the main area (the left panel is the chat and Layers). One chip per step
on the record, in the kit's order, then Lock, then a dashed **+ Name** chip for each removed step.

- A chip is the step's state dot (empty, started, done, skipped; each dot has its `aria-label`) and its name.
- Click: the board brings that step into view, and the inspector shows its actions: **Skip** or **Bring back**,
  and **Remove**. Lock has no actions.
- **+ Name** puts the step back.
- No motion of its own (docs/ux/MOTION.md).

Publish is not a Studio step. It stays where it is today, in the build rooms (the Launch pad and Put it
online), after the first build.

## Not built yet

- Three takes as three whole builds. The server runs one build at a time, so three takes are three directions
  before anything is built, not three finished sites.
- Three takes for a game.
- Just build and Guided for a Deck; Guided for a Brand.
- A game's scaffold and studio inside the Studio board: the game kit reads the Plan board's own state
  (`C.planView`), so a game keeps its Plan board.
