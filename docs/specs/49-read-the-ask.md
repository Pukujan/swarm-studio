# 49. Reading what Build mode is asked

Status: **built in the classic Studio's chat, 2026-11-17.** The words are read before anything is built; a change
or a list of parts is said back and offered as buttons, and nothing runs until the person says so.

The owner, 2026-11-16:

> "its supposed to help address complex user request fix issues do multiple things as well ... so build mode is
> contraint to building the whatever they are building right now"

Standing rules it follows: the chat works for everything (anything a button does can be typed; no canned
replies), never say an action happened unless it did, and no new dependency.

## What went wrong

Build mode took the box's free text and fired it straight out as one build brief (`web/canvas/loop.js sendDock` →
`POST /api/run { brief }`). The Rank Juggler session (`EVIDENCE.md`) shows what that cost:

- **"the mocks look turn-based"** — a complaint about the build — went out as a new brief.
- **"i want more visual polish more lighting"** — two things in one line — went out as one brief.
- **"redo the mocks, then fix the look, then add lighting at assembly"** — three things, in that order — went
  out as one paragraph, so the crew could do all, some, or none of it, and the chat never said which.
- Nothing in the chat ever said back what had been understood. Five person messages in that session became no
  action at all (`EVIDENCE.md` failure 2), which is the same failure from the other side: the words were never
  read before they were routed.

## The read

`web/triage.js` — a pure module: no I/O, no DOM, no model.

```js
readAsk(text, ctx) -> {
  kind,               // 'build' | 'change' | 'multi' | 'question' | 'unclear'
  parts,              // [{ what, target }]: one per thing asked, in the order asked; what is the person's words
  needsConfirmation,  // not one whole build: say back what was understood before anything runs
  unclear,            // the words were not decisive: ask, rather than guess
  heard               // one plain line of what was understood ('' for what the chat leaves alone)
}
```

`ctx` is what "here" is: `{ building, hasBuild, kind, preview, fresh }`.

| Kind | What the words are | What the send does |
|---|---|---|
| `build` | A product described: "make a bakery site with a menu", "A game where you dodge falling pianos", "a bakery in Lisbon" | Runs as one brief, exactly as before |
| `change` | A complaint, or one thing asked of what is here: "the mocks look turn-based", "i need better mocks please", "add lighting at assembly" | The chat says "A change to the mock screens, not a new build: …" and offers **Make the change** |
| `multi` | Several things, in order: "redo the mocks, then fix the look, then add lighting at assembly" | The chat says "Three things, in order: …" and offers each part as its own button, plus **Do all of that** |
| `question` | "what is this?", "can u install pillow then?" | Nothing changes. Over a build, the chat says to ask it in Ask mode; with nothing built it is answered/offered a talk as ever |
| `unclear` | Words that ask for something this file will not read: "no rebuild the mocks first", "not sure about it", or a yes ("do it pls") | The chat says it could not tell what to change and offers **Do it anyway**, never a build on a guess |

Rules that decide it:

- **A complaint is a change.** Sharp forms are one on their own ("X looks wrong", "not feeling the X", "theyre not
  being repainted", "i cant test the game live"); softer ones ("more lighting", "kind of bland") need a verb, a look
  word or a named part to be about this build rather than a product being described.
- **A part is the person's words.** `target` names it in the plan's own stages (mocks, sheets, backdrops, lighting,
  the look, the game, the sections, the app…) so the line said back uses the same word the drawer does; words that
  name no stage are still a part, with `target: ''`.
- **Several things are split.** A clause starts at a comma, "then", "after that", "finally" or a listed number
  ("1)", "2."); "and" splits only when both sides ask for something, since "more lighting and a bit more polish" is
  one change. Parts are kept in the order said, and a part said twice is one part.
- **A product described is a build.** "make a bakery site" makes a thing; "make it darker" works on what is here.
- **A question changes nothing.** "can you make the hero darker" is the question form of an ask of this build.

## The send path (`web/canvas/loop.js`)

`sendDock`, after the chat's own routing (talk, rooms, a project's dock) and before any `/api/run`:

1. `readAsk(brief, triageCtx())`. `triageCtx` says whether something is built, what kind, and whether the send was
   already read (a slash command, or a project's dock, which reads its own words in `web/project.js`).
2. `askRoute(read) === 'say'` — a `change`, `multi` or `unclear` — the words join the chat as the person's own, the
   box empties, and the chat says one line: what was understood, then the buttons.
3. **Build**, `question` (with nothing built), and every send made in code (`nextRoute`: a Build button under a
   brief, `window.swarm.submit`) go on exactly as before.

Every button is the box's words, sent again: **Make the change** and **Do all of that** re-send the whole line,
each part button re-sends its own part. So anything a button does can be typed, word for word — and the second time
the words are already on screen above the reply, which is how the loop closes without a hidden switch.

The buttons are the person's own parts, never a canned reply: nothing here writes words the person did not say.
**Never mind** just closes the row.

## Not in this slice

- The planner model as a fallback. `readAsk` takes one (`readAsk(text, ctx, planner)`), and only for words it could
  not read; the chat passes none yet, so those words come back as `unclear` and are asked about. Wiring it needs a
  hook in the planner route (`engine/talkplan.mjs` `discuss`), which four other streams own: the one line is
  `readAsk(brief, triageCtx(), (t, c) => probeAsk(t, c))` where `probeAsk` posts the words and the state and
  returns `{ kind, parts }` or null.
- Running the parts one after another as a sequence. Today **Do all of that** sends the whole line as one brief,
  as ever; each part sent alone is one change.
- The mode switch for any of this in the next UI (`/next/`, `ui/src/chat/`).
- The crew's own turns (what it says it will do next, `engine/gamestep.mjs`) reading the parts. That is another
  stream's file; the parts are exported (`partButtons`) ready for it.
