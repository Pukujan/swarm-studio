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

One row, in reading order, that never takes a second line: **mode** (what sending does), then the two quieter pickers, **agents** and **model**, then the **send arrow** at the right. One height and one radius. In the 300 px chat column the agents chip is its number and the model's name is cut with an ellipsis; from about 320 px the word "agents" shows.

- **Send** is an arrow, like the "Tell the crew…" bar's, so the row never says Build twice. Its accessible name says where it sends: `Send: Build`, `Send: Ask`…, and plain `Send` while a talk has the box. Enter and the typed routes send as before.
- **Agents** opens a menu headed "How many builders work at once". It is off (disabled, in place) in Ask and Fix, where nothing is built.
- **Model** opens a menu headed "The model the builders use". It shows a model's own name, never a role's: under Hermes a role's model string is the role itself ("worker", "planner": engine/hermesllm.mjs `roleModel`), so the name comes from the list Setup shows (`GET /api/setup/models/options`: the builder slot, or Hermes's main model while the slot is empty; docs/engines/hermes-and-connections.md, "The Setup model picker"). When that cannot be known the chip says "Hermes’s model". The planner's model is listed only when it is a real, different model. "Other…" opens Models. The list is `builderModels` in web/composer.js.
- **The box's placeholder** follows the mode: "Ask the crew…", "Say what to plan…", "Say what went wrong…". In Build the room's own words stay ("Describe a product…", "Change the app…"), and a talk's "Tell Hermia…" is left alone.

All three chips use one menu (web/composer.js `chipMenu`).

The send button's word is the mode's (Send while a talk with the planner has the box). The mode lasts for the browser session; it is not saved with the project. A hosted studio has no switch.

Typed, the same switch: `/ask`, `/plan` or `/build` (with words after it, they are sent in that mode), `/fix` alone, or a message that is only the switch ("switch to ask mode", "plan mode", "go back to build mode"). A brief that merely mentions a mode ("add a dark mode") is a brief. `/fix <words>` is still the section rewrite it was before the modes.

A send made in code (the Build button under a brief, a project's dock) is never re-routed by the mode: a press already said what to do.

## What each mode does with a message

| Mode | Website | App or game | Nothing built |
|---|---|---|---|
| **Ask** | The planner answers (`POST /api/discuss { ask: true }`, engine/ask.mjs): answer only, no build offered, no talk left open, no chat saved, no link read. | Built: Dyad's own ask mode reads the code (`POST /api/runs/<id>/app/ask`, docs/engines/dyad.md "Ask"); nothing is written, gated or committed. Building: the crew's Talk answers, as before. No engine installed, or it fails: Talk reads the app's files. | The planner answers from the Studio's state and what was said. |
| **Plan** | The planner's talk (`talkStart`), then Build under its brief: the project's next version. | The planner's talk; Build under its brief is the app's next change. Dyad's plan mode is not used (docs/engines/dyad.md says why). | The planner's talk; Build starts a new project. |
| **Build** | What the chat did before the modes. Its routing is not touched. | The same. | The same. |
| **Fix** | The doctor (`POST /api/doctor`, engine/doctor.mjs). | The same. | The same, without a build's log. |

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

## Not in this slice

- Fix installing anything (it names the command).
- Dyad's plan mode for apps and games. Checked headless: `write_plan` works, `planning_questionnaire` ends the runner with no result (docs/engines/dyad.md). It needs an answerer for Dyad's user-input requests first.
- The mode switch in the next UI (`/next/`, ui/src/chat/).
- An Ask or Fix reply is shown in the chat only; it is not kept in a chat's history.
- A re-run for a failed game sprite or cut-out on its own (there is no such route; Build again repaints what is missing).
