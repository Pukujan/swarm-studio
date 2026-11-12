# 27. The plan is a conversation

Status: agreed (2026-11-11, owner: "ok go"). Built so far: spec 21, `engine/planshape.mjs` (PR 280) and `engine/discuss.mjs`
(PR 281: read intent, one turn, write a brief). This spec grows `discuss.mjs` into `engine/talkplan.mjs`. The chat
store, references, media and marks are spec 29 (`29-chats-references-marks.md`), which uses the turn logic here.

## The problem, in plain words

The owner asked for "a tiny game called army of ants, rts game in godots". The studio asked eight fixed
questions, then filled a fixed action-RPG blueprint, and made an anime girl with pistols. PR 280 replaces that
blueprint with one shape per genre family, which fixes this case. But a table of blueprints is still a
predetermined pipeline. The owner's words:

> the pipeline needs to be better and smart rather than pre determined? so agent and me can have smart
> decision sessions before we even build?

So, before anything is built, painted or paid for, the planner agent and the person **decide together** in the
left chat. The plan is what that conversation decided. The pipeline (which cards exist, what art is painted,
which engine, whether Meshy is involved, the price) is worked out from the locked spec, not chosen ahead of it.

## The loop

```
idea ─► planner reads it ─► one question that matters, with options and trade-offs ─► person answers
           ▲                     (or the person asks something; the planner answers)        │
           └───────────────────────────── decisions so far ◄────────────────────────────────┘
                                     │  enough decided
                                     ▼
                     the plan in plain words  ─►  Lock  ─►  the plan is made from the decisions
                                     │                         (cards, art list, engine, price), then the
                                     └─ Keep talking            cheap previews; nothing costly before Lock
```

1. **Read.** `readIntent` (from `discuss.mjs`) first decides build, talk or unsure. Then the planner reads the idea and says back, in one sentence, what it understood ("A tiny real-time
   strategy game about an ant colony, for Godot 4.").
2. **Ask only what matters.** At most one question at a time, and only those this idea leaves open. There is
   no fixed list of eight. "Army of ants, rts" already answers the genre and the cast. The open questions are
   how many unit types, waves or skirmish, top-down or isometric, and whether Godot is installed.
3. **Options with trade-offs.** Each question has 2–4 options. Each option says what you get, what it costs
   (pictures, Meshy credits, coding runs) and how long it takes. For example: "2D sprites: 15 pictures, no
   credits, ready to try in one build" against "3D models: about 200 credits and a day of building". The
   planner marks the option it recommends and says why in one short clause.
4. **Questions both ways.** The person can ask anything ("what is fog of war?", "can it run in the browser
   too?"). The planner answers, then goes back to the open question.
5. **Either side leads.** The person can lead ("units first, here is a picture of the ants I mean") and the
   planner follows, or say "you decide" and the planner leads with its recommendations. A picture, link,
   video or sound the person adds is read as a reference for the open decision (spec 29). The planner can
   show a mood board back.
6. **The spec in plain words.** Once nothing important is open, the planner writes the spec as a short
   paragraph, the same `planSummary` the Plan board shows. The spec is **Open** while it is being talked about.
   Two chips: **Lock** and **Keep talking**.
7. **Only a locked spec builds.** Locking turns the decisions into the plan (below) and opens the Plan board.
   Nothing is painted or built from an open spec.
8. **Change anything by saying so.** "Make it 3D" or "no queen" later reopens that decision and **unlocks**
   the spec. The planner says what changes, including the new price. Locking again re-plans the same plan in
   place, with the same `replan` as **Not what I asked for** on the first picture.

## Decisions, not answers

A conversation holds **decisions**: `{ key: { value, why, by: 'person' | 'planner', turn } }`. The keys are
open-ended. Some are always asked when they are not clear from the idea, because the pipeline depends on them:

| Decision | Decides | Default when nobody says |
|---|---|---|
| `family` | which cards the plan has | from the idea's words (`familyOf`) |
| `size` | how many of everything, how many maps or levels | `normal`; "tiny" or "small" in the idea |
| `art` | `2d` (sprites, tiles, UI) or `3d` | **`2d`**. 3D only when the person says or picks it |
| `meshy` | whether models, rigs, clips and weapons are made | **off**. It is asked only once `art` is `3d` |
| `engine` | Godot 4, the browser, … | the browser; "in Godot" means Godot 4, and the planner checks it is installed |
| `title` | the name | from the idea ("called army of ants" → Army of Ants) |

Everything else (units, buildings, moves, enemies, money) is whatever the conversation said, written onto the
family's cards. A decision made by the person is never overwritten by the planner. A planner decision the
person has not touched may change when the idea changes.

## From decisions to the plan

`engine/planshape.mjs` already turns `{ idea, answers, hint }` into a plan shape. The conversation feeds it:
the decisions become the answers and the hint (family, size, subject, cast, lists). Its rules then hold
whatever the model said:

- an answer wins over the model ("no shooting" leaves no gun anywhere);
- Meshy parts, and the word "credits", appear only on a plan whose `art` decision is `3d` with Meshy on. A 2D
  plan's gate counts pictures ("Lock · 15 pictures");
- the engine asked for is in the plan and in the game brief, and a missing Godot is said, never worked around
  quietly.

The cards stay the plan's display on the Plan board. Their set comes from the family and their contents from
the decisions, and editing a card is the same as saying that decision in the chat.

## Where to start: the planner suggests, the panel shows

The game Plan board stays (owner: "i did like that panel a lot"). Only the source of its content changes: the
conversation and the locked spec. Its card set fits the game, so an RTS shows Units, Buildings, Resources and
Map, not Cast with heroes and weapons.

After Lock, in game mode, the planner suggests **where to start**, with one line on why, and the person
picks. The suggestions are chips, never the only way: the person can say something else.

| Start | Opens in the panel | Suggested when |
|---|---|---|
| The overall design | the cards and the mock frames | the idea is broad or the person is unsure |
| Character creation | the cast sheet, then the first turnaround or sprite | the game is about a few named heroes |
| Unit creation | the unit sheet (for the ants: worker, soldier, scout, queen) | strategy, army or colony games |
| The world or map | the terrain tiles and the map sheet, or the backdrops | the place is the point (a map, levels, a track) |
| A tiny playable slice | one level or map built at once, sprites drawn in code where none exist yet | "just let me try it", jam and tiny games |

For Army of Ants, the planner suggests **unit creation** ("an RTS is its units: four to draw, then the map")
or **the map**, never character creation. Whatever is picked opens in the panel at once: the unit sheet
painting, the map tiles, the first turnaround. Talk is on the left and the thing takes shape on the right, so
the person sees it before deciding the next step. The next suggestion follows from what is done ("the units
are in, so the map next, or a tiny slice to try them?").

## One planner conversation for every kind (with the Make box)

The Make box's "don't build yet, let's talk" (a site or an app: grill deeper, then a brief with **Build** and
**Keep talking**) is the same loop with a different ending. There is one mechanism, not two:

- `engine/talkplan.mjs` is `engine/discuss.mjs` renamed and grown, with its tests kept passing.
  `readIntent`, `discuss` and `writeBrief` stay. New: `say(chat, input)` → the next turn plus any decisions,
  `lock(chat)` and `unlock(chat, key)`. One planner call per turn, through `streamChat` and the planner role,
  with a JSON reply `{ say, ask?: { key, options: [{ id, label, why, made }] }, decide?: {…}, spec? }` that is
  validated like `readShape`. An option's `why` is its trade-off line (what you get, what it costs, how long it
  takes). The recommended option comes first and says so in its `why`.
- The talk is the **chat record** of spec 29 §Store: `chats/<id>/chat.json`, where the id is `c-<10 hex>` and
  is also the talk id. This spec writes five of its fields, and spec 29 writes the rest (`refs`, `made`,
  `marks`, media, `category`, `project`):
  - `turns[]`: `{ id: 't1', who: 'person' | 'planner' | 'crew', at, text, options? }`. A planner turn's question
    is its `text`, and its `options` are the chips;
  - `decisions`: `{ key: { value, why, by: 'person' | 'planner', turn } }`;
  - `spec`: `{ brief, open[], art[{ what, ref }], engine, time, cost, lockedAt }`;
  - `state`: `open | locked`;
  - `lead`: `person | planner`. "You decide" sets it to the planner, and the person picking or saying
    something of their own sets it back.
  Any change to a decision or a ref sets `state` back to `open` and clears `spec.lockedAt`. A game chat's
  `plan` field holds its plan id after the first lock. Writes go through spec 29's per-chat queue.
- Routes: `POST /api/talk { kind, said }` → a chat; `POST /api/talk/:id { said, refs? }` → the next turn;
  `POST /api/talk/:id/lock` and `/unlock`. These replace `/api/discuss/read` and `/api/discuss`, which stay as
  aliases until the web side moves. A site or app lock starts the build from the spec. A game lock calls
  `planStore.create` (or `replan`, when the chat already has a plan) and opens the Plan board.
- The fixed question lists (`engine/intake.mjs` GUIDES, `PLAN_QUESTIONS`) become the fallback when no planner
  model answers, so the studio still works offline.
- Where the chat lives (spec 29): the first text opens a chat of its own, not a run, not a plan and not listed
  in Projects. On build it moves into the project (`<project>/chats/`), grouped by Design, App, Game and
  Video. A game chat holds its plan id after the first lock.
- Owners: the left-chat UI and the site and app briefs belong to the Make-box session ("catalog PR and UX
  fixes"). `talkplan.mjs`, the game decisions → plan mapping and this spec belong to the game-planner session.

## UI (docs/ux/RULES.md)

All of it is in the left chat: the planner's line, the options as chips (the recommended one first), and a
free-text reply. Names only, no tooltips, no helper sentence at rest. A chip's trade-off is its second line,
shown only on the open question. Lock and Keep talking are the two chips under the plan paragraph. The Plan
board itself is unchanged.

## Worked example: Army of Ants

> **Person:** a tiny game called army of ants , rts game in godots
>
> **Planner:** A tiny real-time strategy game about an ant colony, for Godot 4. Godot 4 is not installed on
> this computer. *Godot (install it first)* · *The browser for now*
>
> **Person:** the browser for now, godot later
>
> **Planner:** How do the fights come? *Endless waves: hold the nest as long as you can (recommended,
> simplest)* · *A rival colony that builds and attacks like you*
>
> **Person:** waves
>
> **Planner:** Drawn or modelled? *2D sprites: about 15 pictures, no credits (recommended for tiny)* ·
> *3D models: about 200 Meshy credits and longer*
>
> **Person:** 2d, and no guns, they bite
>
> **Planner:** Army of Ants: a tiny real-time strategy (RTS) game for the browser, Godot later. 4 units (Ant
> worker, Ant soldier, Ant scout, Ant queen), 3 buildings, 2 resources, 1 map with fog of war, seen top-down.
> Enemy: endless waves of red fire ants. Fights are bites and charges, no guns. Art: 2D sprites on a magenta
> key, about 15 pictures, no credits. *Lock* · *Keep talking*

Lock opens the Plan board with the RTS cards, a gate that reads **Lock · 15 pictures**, and a first
picture of the Ant worker on magenta.


### Slice 1, built (2026-11-11)

- `engine/talkplan.mjs` (discuss.mjs renamed; its tests kept) holds the game turn: `say`, `lock`, `unlock`,
  `planInput`, `openQuestions`, `wordsDecide` and `readTurn`. A planner model, when there is one, answers the
  person's questions and may decide what their words clearly said. It never overrides a decision the person
  made, and its options are validated.
- Without a model, the open questions are asked in order: the kind of game (only when the idea names none),
  Godot when it is asked for and not installed, how the fights come (fighting families only), and drawn or
  modelled with the price of each.
- `engine/chats.mjs` is the part of spec 29's store that this needs: `c-` ids, `chat.json` written to a tmp
  file and renamed, and one writer per chat. A person turn picked from a chip carries `pick` (the chip id).
- `server/talk.mjs` serves `/api/talk`, `/api/talk/:id`, `/lock` and `/unlock`. A game lock makes the plan
  through the Plan board's routes (`fromTalk`), or re-plans the chat's plan in place.
  `planFromAnswers({ force })` lets the decisions (family, size, art, engine) win over the idea's words, and
  the plan keeps them as `decided`.
- The left-chat UI (slice 2) is not built yet, and `/api/discuss` still serves the web side.

## Slices

1. `engine/talkplan.mjs` and the routes, with the game ending into `planStore.create`. Tests: the ants talk
   above runs on a scripted planner, and each decision lands on the plan (half a day).
2. The left-chat turns and chips for a game, behind the Game kind (a day).
3. The Make box's site and app endings on the same talk (Make-box session).
4. "Change X" in the chat re-plans an existing plan in place (half a day).
5. Where to start: the planner's suggestion chips after Lock, each opening its part of the Plan board
   (the unit or cast sheet, map tiles, a tiny slice build) (a day).
