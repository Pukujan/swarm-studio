# 46. The chat's modes: Ask, Plan, Build, Fix

Status: **owner approved the four modes in the chat, 2026-11-13.** First slice built (this page says what is in it and what is left).

The owner, 2026-11-13:
- "cant i switch to another agent basically like our modes … one of them can install and or someone can help plan or someone can ask question basically modes like every other agent app have"
- "what about dyad's agent mode i thought thats what we use for our development?"

Standing rules it follows: the chat works for everything (anything a button does can be typed; every state answers real questions; no canned replies), and anything loading shows a crew cursor with an agent working.

Why now: one night a sprite cut-out failed with "No module named 'PIL'" because the Studio ran a Python without Pillow. Asked "can u install pillow then?", the planner in the chat first said it would, then that it had not. It can only read the build log.

## The switch

One chip, first in the chat box's row: **Ask, Plan, Build, Fix**. Build is the default. Closed, it says the mode's name only.

Open, the menu says what sending does in each mode: the name and one plain line under it (the owner, 2026-11-14: "im not sure what fix mode build mode and what mode does i wish, there was tooltip on hover to help?"). There are no tooltips (docs/ux/RULES.md, standing rule 1), so the explanation is one layer down, in the menu itself (rule 9). The lines (`MODE_LINE`, web/chatmode.js) show only there and beside `/ask`, `/plan`, `/build` and `/fix` in the slash list; nothing pops up when the chat opens or the mode changes.

| Mode | Its line |
|---|---|
| Ask | Answers your question. Changes nothing. |
| Plan | Talks it through. Nothing is built until you say. |
| Build | The crew builds or changes what you describe. |
| Fix | Checks the Studio itself: what failed, what to do. |

It is a menu of radio items (`role="menu"`, `menuitemradio` with `aria-checked`; the button has `aria-haspopup="menu"` and `aria-expanded`). Up and Down go round, Home and End jump, Enter or Space picks, Esc or a click outside closes, and the focus goes back to the button. It opens above the button and stays on screen at 390 px. Nothing in it animates.

## The row

The owner, 2026-11-14, of the row under the chat box ("8 AGENTS", "WORKER", then a second line with "BUILD" beside a filled "BUILD" button): "this needs work what is worker and build? and the arrangement here is bad", and "why does both worker and planner have worker and plan dropdown while build also has it its confusing and repeating the same thing".

One row, in reading order, that never takes a second line: **mode** (what sending does), then the two quieter pickers, **agents** and **model**, then the **send arrow** at the right. One height and one radius. In the 300 px chat column the agents chip is a crew icon and its number and the model's name is cut with an ellipsis; from about 320 px the word "agents" shows.

- **Send** is an arrow, like the "Tell the crew…" bar's, so the row never says Build twice. Its accessible name says where it sends: `Send: Build`, `Send: Ask`…, and plain `Send` while a talk has the box. Enter and the typed routes send as before.
- **Agents** opens a menu headed "How many builders work at once". It is off (disabled, in place) in Ask and Fix, where nothing is built.
- **Model** opens a menu headed "The model the builders use". It shows a model's own name, never a role's: under Hermes a role's model string is the role itself ("worker", "planner": engine/hermesllm.mjs `roleModel`), so the name comes from the list Setup shows (`GET /api/setup/models/options`: the builder slot, or Hermes's main model while the slot is empty; docs/engines/hermes-and-connections.md, "The Setup model picker"). When that cannot be known the chip says "Hermes’s model". The planner's model is listed only when it is a real, different model. "Other…" opens Models. The list is `builderModels` in web/composer.js.
- **The box's placeholder** follows the mode: "Ask the crew…", "Say what to plan…", "Say what went wrong…". In Build the room's own words stay ("Change the app…"), except that over an open build "Describe a product…" becomes "Say what to change…". A talk's "Tell Hermia…" is left alone.

All three chips use one menu (web/composer.js `chipMenu`).

The send button is named for the mode ("The row" below; plain Send while a talk with the planner has the box). The mode lasts for the browser session; it is not saved with the project. A hosted studio has no switch.

Typed, the same switch: `/ask`, `/plan` or `/build` (with words after it, they are sent in that mode), `/fix` alone, or a message that is only the switch ("switch to ask mode", "plan mode", "go back to build mode"). A brief that merely mentions a mode ("add a dark mode") is a brief. `/fix <words>` is still the section rewrite it was before the modes.

A send made in code (the Build button under a brief, a project's dock) is never re-routed by the mode: a press already said what to do.

## What each mode does with a message

| Mode | Website | App or game | Nothing built |
|---|---|---|---|
| **Ask** | The planner answers (`POST /api/discuss { ask: true }`, engine/ask.mjs): answer only, no build offered, no talk left open, no chat saved, no link read. | Built: Dyad's own ask mode reads the code (`POST /api/runs/<id>/app/ask`, docs/engines/dyad.md "Ask"); nothing is written, gated or committed. Building: the crew's Talk answers, as before. No engine installed, or it fails: Talk reads the app's files. | The planner answers from the Studio's state and what was said. |
| **Plan** | The planner's talk (`talkStart`), then Build under its brief: the project's next version. | The planner's talk; Build under its brief is the app's next change. Dyad's plan mode is not used (docs/engines/dyad.md says why). | The planner's talk; Build starts a new project. |
| **Build** | What the chat did before the modes. Its routing is not touched. | The same. | The same. |
| **Fix** | The doctor (`POST /api/doctor`, engine/doctor.mjs). | The same. | The same, without a build's log. |

## Ask: an answer, not the build's counters

The owner, 2026-11-17, in ANSWER ONLY mode: asked "i cant test the game live", the reply was "Right now: using 61 pictures painted before; painting 0." That is the picture queue's own step line, where an answer should be. Ask's prompt had said "answer in one to four short sentences" and never said that the build's counters are not one.

The question is answered in the person's terms. Two things hold it, because a prompt line alone is a hope, which is why engine/honest.mjs checks the answer too:

- **The prompt** (`ANSWER_RULE`, engine/ask.mjs) says plainly that the build's counters and the plan's bookkeeping ("using 61 pictures painted before; painting 0", "5 of 9 sections are built", "3 of 7 steps", a step's name, a progress line) say what the Studio is doing and never what the person asked; that a fact from the project may be used only inside an answer to their question; and that when the honest answer is that it cannot tell from here, it says "I can't tell from here", says why, and names the one thing that would settle it.
- **The check** (`isBookkeeping`, engine/ask.mjs) reads the reply line by line. A line that is the build's counters or the Studio's own step line is not an answer. A reply made only of those is asked again once, with the person's question and the reason ("that reply is the build's own progress, not an answer…"); the pattern is `honestly`'s in engine/honest.mjs. If the model still has only counters, the person is told plainly that there is no answer from here and what would settle it (`NO_ANSWER`), never handed the counters. A sentence that tells the person something is an answer, whatever numbers it carries, and so is a real answer with one line of counters beside it.

Nothing else about Ask changes. The turn's attached picture or file still rides the question (the chips upload it to the chat and the planner is told how it was read, `withRefs`); no link is opened, no chat is saved, no talk is left open, and nothing is offered to build.

## Fix

Fix looks at the Studio's own working parts, not the project. It gathers facts and says what they mean; it changes nothing.

Facts: every part of Setup › Parts with its live state (the Setup sheet's own list and state functions, run on the server); the open build's recent failures, read from its events (a failed section, a failed picture, a failed app build, a failed step; one put right later does not count); which Python the cutters use and which of numpy, scipy and PIL each candidate lacks; whether Hermes is attached; the planner, builder, reviewer, image and video models.

The planner is told: say what failed, whether it is the Studio's tooling, a model or connection, or the project, the cause, and the one next step; never say you did or will do anything yourself; offer only actions from the list. With no model, or no Hermes, the facts are listed plainly.

Actions, each needing the person's press or a typed yes, each a route that already existed:
- open Setup on the part in question;
- paint a failed picture again (`POST /api/runs/<id>/image`);
- finish a website's failed sections (`POST /api/runs/<id>/resume`);
- build again an app or game that never built (`POST /api/runs/<id>/app`).

A failure caused by the Studio's own tooling is not offered a re-run: it would fail the same way. Installing is not in this slice: Fix names the exact command and where to run it.

## Honesty

The crew members who answer in the chat can read and look. None can install a package, restart the Studio or change the computer. The rule is in each answering prompt (Talk during a build, Ask's planner, the doctor) and it is also checked on the answer (engine/honest.mjs): a reply that claims to install, restart or update something is asked again once; if the model still claims it, the plain truth is said instead. The test fixture is the Pillow exchange.

The same rule covers the work the plan does. In a game chat the planner talks about pictures it cannot paint, so its words are checked against the plan file (engine/gamestep.mjs `checkClaims`, run by engine/talkplan.mjs), and a sentence the plan denies is cut whole. The facts it is checked against (`planFacts`) now name every kind of picture a plan paints — the sketch sheets, the close-ups or the cut-outs, the sprites and models, the mock screens and the backdrops — each with its own done, painting and queued count, so a claim about one is never borne out by another kind painting. A first-person claim of an action ("Repainting the mocks", "I am repainting", "I repainted it", "I changed the mocks", "I fixed the backdrop") is false unless that picture is painting now (present) or has landed (done); "Next: repaint the mocks", a question and "I cannot repaint them" are not claims and stay. "The plan is not locked yet" is not a lock claim. The test fixtures are that night's plan and lines (tests/fixtures/rank-juggler, tests/honeststep.test.mjs): "Repainting the mocks so they read as fast side-view arena combat" said when no mock was painted.

The line a turn ends on is never the same one twice in a row: `stepLineFor(chat, step)` gives the step's line, or nothing when the last planner turn already ended on it, so the person is not shown "Painting the backdrops now. It shows on the board as it lands." on nine replies while nothing is painting (rank-juggler, turns 46 to 54). The step and its buttons are unchanged; only the repeated sentence is left out.

## Not in this slice

- Fix installing anything (it names the command).
- Dyad's plan mode for apps and games. Checked headless: `write_plan` works, `planning_questionnaire` ends the runner with no result (docs/engines/dyad.md). It needs an answerer for Dyad's user-input requests first.
- The mode switch in the next UI (`/next/`, ui/src/chat/).
- An Ask or Fix reply is shown in the chat only; it is not kept in a chat's history.
- A re-run for a failed game sprite or cut-out on its own (there is no such route; Build again repaints what is missing).
