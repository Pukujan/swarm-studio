# 27. The plan is a conversation

Status: proposal (2026-11-11). Nothing in it is built yet beyond what spec 21 and `engine/planshape.mjs` hold.

## The problem, in plain words

The owner asked for "a tiny game called army of ants, rts game in godots". The studio asked eight fixed
questions, then filled a fixed action-RPG blueprint, and made an anime girl with pistols. PR 280 replaces that
blueprint with one shape per genre family, which fixes this case. But a table of blueprints is still a
predetermined pipeline. The owner's words:

> the pipeline needs to be better and smart rather than pre determined? so agent and me can have smart
> decision sessions before we even build?

So, before anything is built, painted or paid for, the planner agent and the person **decide together** in the
left chat. The plan is what that conversation decided. The pipeline (which cards exist, what art is painted,
which engine, whether Meshy is involved, the price) is worked out from the approved plan, not chosen ahead of it.

## The loop

```
idea ─► planner reads it ─► one question that matters, with options and trade-offs ─► person answers
           ▲                     (or the person asks something; the planner answers)        │
           └───────────────────────────── decisions so far ◄────────────────────────────────┘
                                     │  enough decided
                                     ▼
                     the plan in plain words  ─►  Approve  ─►  the plan is made from the decisions
                                     │                         (cards, art list, engine, price), then the
                                     └─ Keep talking            cheap previews; nothing costly before Lock
```

1. **Read.** The planner reads the idea and says back, in one sentence, what it understood ("A tiny real-time
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
5. **The plan in plain words.** Once nothing important is open, the planner writes the plan as a short
   paragraph, the same `planSummary` the Plan board shows. Two buttons: **Approve** and **Keep talking**.
6. **Approve is the only start.** Approving turns the decisions into the plan (below) and opens the Plan
   board. Nothing is painted or built before it.
7. **Change anything by saying so.** "Make it 3D" or "no queen" in the chat later reopens that decision. The
   planner says what it changes, including the new price, and the plan is re-planned in place. This is the
   same `replan` as **Not what I asked for** on the first picture.

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
conversation and the approved plan. Its card set fits the game, so an RTS shows Units, Buildings, Resources and
Map, not Cast with heroes and weapons.

After Approve, in game mode, the planner suggests **where to start**, with one line on why, and the person
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

- `engine/talkplan.mjs`: `start({ kind, idea })`, `say(talk, text)` → `{ turns, decisions, brief, state }`,
  `approve(talk)`. One planner call per turn, through `streamChat` and the planner role, with a JSON reply
  `{ say, ask?: { key, q, options: [{ label, gets, costs, time, recommended? }] }, decide?: {…}, brief? }`
  that is validated like `readShape`.
- Routes: `POST /api/talk { kind, idea }` → a talk; `POST /api/talk/:id { say }` → the next turn;
  `POST /api/talk/:id/approve`. A site or app approve starts the build from the brief. A game approve calls
  `planStore.create` with the decisions and opens the Plan board.
- The fixed question lists (`engine/intake.mjs` GUIDES, `PLAN_QUESTIONS`) become the fallback when no planner
  model answers, so the studio still works offline.
- Where the talk lives (the Make-box session's chat store): the first text opens a chat-only session, which
  moves into the project when a build starts. Chats are grouped by Design, App, Game and Video. A game talk is
  in the Game group and is joined to its plan id after Approve.
- Owners: the left-chat UI and the site and app briefs belong to the Make-box session ("catalog PR and UX
  fixes"). `talkplan.mjs`, the game decisions → plan mapping and this spec belong to the game-planner session.

## UI (docs/ux/RULES.md)

All of it is in the left chat: the planner's line, the options as chips (the recommended one first), and a
free-text reply. Names only, no tooltips, no helper sentence at rest. A chip's trade-off is its second line,
shown only on the open question. Approve and Keep talking are the two chips under the plan paragraph. The Plan
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
> key, about 15 pictures, no credits. *Approve* · *Keep talking*

Approve opens the Plan board with the RTS cards, a gate that reads **Lock · 15 pictures**, and a first
picture of the Ant worker on magenta.

## Slices

1. `engine/talkplan.mjs` and the routes, with the game ending into `planStore.create`. Tests: the ants talk
   above runs on a scripted planner, and each decision lands on the plan (half a day).
2. The left-chat turns and chips for a game, behind the Game kind (a day).
3. The Make box's site and app endings on the same talk (Make-box session).
4. "Change X" in the chat re-plans an existing plan in place (half a day).
5. Where to start: the planner's suggestion chips after Approve, each opening its part of the Plan board
   (the unit or cast sheet, map tiles, a tiny slice build) (a day).
