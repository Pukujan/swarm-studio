# 0024. The next UI is the Studio; the classic one stays one click away

- Date: 2026-11-14
- Status: accepted by the owner. The quotes are the owner's words; the rest is *our wording*.
- Decides [0023](0023-switching-on-the-next-ui.md) (proposed: an opt-in preview, then all at once). Follows
  [0013](0013-react-ui-coexists.md) (two apps on one address) and [0018](0018-next-ui-build-on-release.md) (only a
  release carries `ui/dist/`).

## Context

0023 set out three ways to put the next UI in front of people: all at once once every room has moved, room by
room, or an opt-in preview first. Most of the Studio has moved (0023 lists it). The Game room, a game build's App
room, the Film studio and a new project's deck have not.

The owner, on 2026-11-14, about 0023: **"Yes, switch it."** And on what comes next: **"it already looks fine I
think, so I was thinking of working on making it work."**

## Decision

*(our wording)*

- **`/` serves the next UI.** Hermes Desktop opens the Studio at `/`, so this is what people see.
- **The classic Studio stays one click away, at `/classic/`**, at the same address (`?project=…&version=…&room=…`).
  - The account menu (Projects) and ☰ (every other screen) have **Use the classic Studio**. After that, `/` opens
    the classic Studio until **Use the new Studio** in its account menu.
  - The choice is kept in the data folder's `ui.json` (`server/uichoice.mjs`), not a cookie: the Desktop pane's
    frame has an opaque origin, where a cookie doesn't stay.
- **A screen that hasn't moved opens in the classic Studio**, at the same address, instead of the stand-in with
  its name and a button. The Game room is one; so are the Film studio and a new project's deck.
- **Without a built next UI, `/` stays classic.** That's a clone of main that hasn't run `npm run --prefix ui
  build` (0018). Only a release carries the build, so people get the switch when the owner moves the pin, not
  before.
- **Function first, pixel parity second.** "Making it work" comes before the motion and audit polish. The
  functional pass is recorded in `ux-review/next-functional/findings.md` (outside this repository), and its breaks
  are fixed first.

## Consequences

- The throwaway Studios the test suites start (`scripts/walkthrough-fixtures.mjs`) keep the classic Studio at `/`,
  as a person who chose it would. The suites already address the next UI at `/next/`, which keeps working.
- `scripts/check.sh` checks, when the next UI is built:
  - `/` is the next UI and `/classic/` the classic Studio;
  - choosing classic makes `/` the classic Studio.
- Every crossing between the two apps reloads the page (0023): a screen that hasn't moved, and **Use the classic
  Studio**. Each room that moves removes one crossing.
- Retiring `web/` (0013 step 5, 0023 choice 1) is still its own change, once every room has moved.
