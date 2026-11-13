# The Plan board

A game's plan before anything costly is made: nine cards, the starter, the systems, sketches, mocks, the world and
close-ups, locked at a shown price ([spec 21](../../specs/21-plan-before-spend.md), [spec 27](../../specs/27-plan-conversation.md),
[spec 38](../../specs/38-game-starters.md); OBJECTS.md: Plan, Lock). A game's Guided way opens it (spec 42): the talk on
the left, the cards taking shape on the right. Statechart: `planBoard` (`board`, `gate`). Code: `web/plan.js`, the
shared board `web/board.js`, `engine/plan.mjs`, `engine/planart.mjs`, `server/plans.mjs`.

## Places and affordances

```
Plan board  (planBoard.board)              crumb: Home › Projects › <plan> › Plan
  top bar
  · breadcrumb: Projects ▸ <plan name> ▾
      <plan name> ▾                 ──(none)──▶ Plan menu
  · the one primary button, which carries the state:
      "Lock" while the plan is still a talk     ──(none)──▶ the chat's Lock: the talk becomes the plan
      "Lock · N credits" / "Lock · N pictures"  ──lock──▶   the Gate
      "Build one" / "Build" once locked         ──build { run }──▶ the Game room
      "Building" while it builds (disabled, same size)
  left panel
  · Chat (the planner asks one question at a time, spec 27)
  board (dotted stage; Esc or a click on the empty stage clears the selection)
  · Plan section: nine cards, each a name and one value (cast shows a count, systems how many are on)
  · Starter section: Engine · Template · Assets, each with its why and who chose it
  · Systems section: one card per system, On or Off
  · Sketches section: Cast and Weapons sheets (pick cells; a note each)
  · Build section (after Lock): front, side, back, the model
  · Mocks section: five in-game frames
  · World section: backdrops, after Lock style
  · Close-ups section: cut-in and portrait per character
  · a picture being painted: its sheen, aria-busy, the painter's crew cursor
  · three waiting cards while a plan loads

Plan menu  (layer)
  · Save as template                ──(none)──▶ toast "Saved as template"

Inspector  (layer, while a card is selected; ×, Esc, a click on the empty stage close it)
  · a card's lines as inputs, saved as they change
  · the cast roster; a system's switch; a starter choice's options with their why
  · a sketch: the picked cell and its note

Gate  (planBoard.gate, a dialog)
  · the parts: what, n × each, cost
  · Coding runs · Pictures
  · [ ] Test one first
  · "Lock · N credits" (or "Lock · N pictures")   ──build { run }──▶ locked; the top bar reads Build
      the price moved                             ──(none)──▶ the new price, nothing locked
  · ×, Esc, a click outside                       ──up──▶ the board
```

## Moves the statechart names

| Press | Event | Goes to |
|---|---|---|
| A game's Guided on Make, or a game's chat on Projects | `plan` | here |
| Lock · N | `lock` | the Gate |
| Build / Build one once locked | `build { run }` | the Game room |
| Esc with nothing selected | `up` | Projects |

## At 390 px

The sections stack in one column, the chat folds behind its button, and the Gate is a full-width dialog. The plan's
name in the crumb shortens with an ellipsis (`web/plan.css:100`).

## Where the code differs

- **The breadcrumb** reads `Projects › <name> ▾` (`web/plan.js:23`), with no `Home` and no room name; at 390 it reads
  only the name. Known violation `plan breadcrumb`.
- **No loading state during a talk.** While the plan is still a talk (no plan id), the board is empty while
  `/api/talk` answers (`web/plan.js:104` draws the three waiting cards only when a plan id exists). Known violation
  `plan loading`.
- **"credits".** The price is in credits for a plan with Meshy parts (`web/plan.js:348`), a word decision 0001
  retired for builds (OBJECTS.md, "credits").
- **The name falls back to `Plan`** before the plan has a title (`web/plan.js:105`), so the crumb can read
  `Projects › Plan`.
