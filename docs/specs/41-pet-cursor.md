# 41. Hermia's cursor, always there

Status: **Built** (2026-11-13: the owner asked for it to be built, overriding the 2026-11-12 "add it to spec we
dont build yet"). `web/pet.js` (the lines table, the brain and the cursor), `web/pet.css`, `tests/pet.test.mjs`.

The owner, 2026-11-12:
- "cant we have 1 clicker always available 1 cursor even though its not working so it looks like a pet idk lol"
- "and idk make it smart so it speaks from context? or prior chat without needing inference i mean even if it
  does its already from cache right?"

This follows the standing decision "Cursors on every screen" (DECISIONS.md 2.6). Today the Studio's own
screens (the scaffold, the brand sheet, the Plan board, Projects) hide every cursor (`body.cosmos .dock,
body.cosmos .cursor.docked { display: none }`), so the screen where a person plans has none.

## What it is

One cursor that is always on screen, even when nothing is being built: Hermia, the planner. She is the one
voice the person already meets in the chat, so a pet is the same character, not a second one.

- **Where she goes.** She drifts lazily after the person's pointer (behind it, never on it), settles on the
  card the person last touched, and dozes when the person is idle (about 30 seconds). She wakes on an event.
- **What she says.** Short reactions in a speech bubble, never questions, and never a line the chat already
  said. Questions stay in the chat, one open at a time (the guided walk); the two never compete.
- **How often.** At most one bubble about every 20 seconds; a bubble fades after a few seconds. Many events in
  a row make one reaction, not several.
- **When the crew works.** During a build she is one of the cursors at work, as now; this spec is about the
  time in between.

## Smart without a model call

Her lines come from rules: a table of short lines per event, filled from what the screen already knows. The
canvas already has such a table for design changes (`REACT` in `web/canvas.js`: "new font, who dis") and a
voice for it (`web/chatter.js`, off by default).

| Event | What she knows | Example line |
|---|---|---|
| A step reached | the step | (on Brand) "ooh, the fun part" |
| A file dropped | its name and type | "a PDF! reading it" / "nice logo" |
| A link pasted | its site | "pinterest, my favourite rabbit hole" |
| An option picked | its name | "Playful community, good call" |
| A step skipped | the step | "fine, we'll wing it" |
| The brief's own words | words from the idea | "rats!! love that" |
| Idle, then back | how long | "oh hi, I kept your spot" |
| A build done | its name, page count | "all 4 pages up" |

- Lines are short (≤ 40 characters), in the house voice, never a name the person did not choose, never a
  tooltip or an instruction (the calm rules in `docs/ux/RULES.md`).
- The same line is never said twice in a row; each event has several.

### Why not a model for every line

Prompt caching makes re-reading the chat cheaper (about a tenth of the input price), but every line would
still be a fresh call: its output is paid for, it takes a second or more (a pet that reacts late feels
broken), and in the Studio it runs on the person's own model and account (the Studio is local), so it would
spend their tokens on a mascot.

So: rules for every reaction. For a bigger moment (a build finishing, a lock), the planner's own reply, which
is made anyway, may carry one extra short `pet` line in its answer. She never makes a call of her own.

## Rules

- She never blocks a click (`pointer-events: none`), never covers the open card's controls, and keeps clear
  of the docked chat and the inspector.
- Reduced motion: she moves without easing trails and does not bob; she still appears.
- Sound is the existing chatter, off until the person turns it on.
- On a phone she sits at the edge of the board above the chat and does not follow touches.
- One pet only, on every screen of the Studio. What a cursor means on a hosted Feed post stays Open
  (DECISIONS.md 2.6).

## As built

- One module, `web/pet.js`, joined into the studio's script before `web/studio.js` and started beside it, so no
  screen file carries code for her. Screens (and the React port) talk to her with `pet.on(kind, data)`
  (`window.swarmPet`, `swarmCosmos.pet`): `step`, `file`, `link`, `pick`, `skip`, `brief`, `back`, `built`, and
  `loading` / `ready`.
- She notices most events herself: the address (a screen, a Studio step; a step shown as Skipped gives the skip
  line), a drop or a file picked, a link pasted, a click on a palette, type or pack card, the canvas's
  `run:start` / `run:done`, the chat's own lines (so she never repeats one).
- Loading: on every new screen she shows three dots until the view holds no `.wait-in` or `aria-busy`
  placeholder (at most 12 seconds), or a screen calls `on('ready')`. This is also the cursor the brand sheet
  had none of while it loaded.
- During a build (`run:start` to `run:done`) she fades out and the crew's cursors work; a live build that ends
  gives the `built` line.
- Slow things (the owner, 2026-11-13: "slow loading things obviously need skeleton and a cursor like thing
  working on them as the visual"). Each wait shows a skeleton in the shape of what is coming: the shared `wait-in`
  cards, or the Overview's page skeleton (`.sk`). She goes onto it and works on it (a small tap and the dots)
  while the screen loads or the pointer rests, and leaves when the content lands. A screen hands her one with
  `const done = pet.working(el)`. She also finds placeholders herself (`PET_BUSY`). Every placeholder is
  `aria-busy="true"` while it waits, so the audit gates can check that a loading state shows.
- What waits, and how:

  | Surface | Skeleton | Her |
  |---|---|---|
  | Projects, first load | four card skeletons (`web/home.js`) | works on the first |
  | Overview, a build's board loading | three page skeletons; never the last build's pages (`web/project.js`) | works on the first |
  | Plan board, a plan loading | three card skeletons (`web/plan.js`) | works on the first |
  | Studio scaffold, brand sheet | their own `wait-in` card (the brand sheet's skeleton is the brand-fixes branch's) | works on it, marks it `aria-busy` |
  | An Overview page's picture not made yet | its `.sk` page skeleton | works on it while the pointer rests |
  | The app's frame loading | `.app-loading` (`aria-busy`) | works on it |
  | Pictures being painted (Overview art, Plan sheets, mocks) | their sheen; `aria-busy` while painting | not her: the painter's crew cursor already works there |
  | A build | the crew's cursors on the pages | hands over |
  | Setup's model check | its spinner, `aria-busy` | not her: the Setup sheet sits above her layer |
  | Chat replies | the reply's blinking dot | not her: she keeps clear of the chat |
  | Not covered yet | video renders (the film's progress bar), publish and deploy (the button's own state), pack and palette loads on the brand sheet (left to the brand-fixes branch), the Feed (not in this app) | |
- On the Design deck and the other rooms she stays at rest: their docked crew is hidden in the Studio
  (`studio.css`, `body.cosmos .dock`).
- The bubbles are an exception to RULES.md rule 24 ("speech bubbles … stay hidden until you open the crew
  radio"), by the owner's words above: rules-made lines, one at most every 20 seconds.

## Open

- Whether the person can hide her, and where that switch lives (it would be a setting, never a popover).
- Whether the pet line in the planner's reply is worth the extra output tokens, or rules alone are enough.

## Done when

- On the Studio board, Projects and the brand sheet, one Hermia cursor is always visible, follows lazily,
  dozes when idle and wakes on an event.
- Each event in the table gives a line from rules, with no model call (checked in the network log).
- No bubble repeats the chat, no bubble asks a question, at most one every ~20 seconds.
- It never takes a click: every card, button and the chat work with her on top of them.
