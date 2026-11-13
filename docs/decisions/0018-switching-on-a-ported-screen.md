# 0018. A ported screen is switched on by the owner, one room at a time

- Date: 2026-11-13
- Status: accepted

## Context

[Decision 0013](0013-react-ui-coexists.md) puts the next UI at `/next/`, beside the current Studio, and moves screens
over one at a time. The Brand sheet is the first to move (#404). Moving a screen into `ui/` does not yet change what
anyone sees at `/`: someone has to decide when a person gets the new screen, and how the old one is kept.

## Decision

*(our wording)*

- **One list, on the server.** `LIVE` in `server/next.mjs` names the rooms the next UI draws for everyone
  (`'brand'`, later `'home'`, `'plan'`…). The current Studio gets it in its page as `SWARM.next`. When the person
  enters a room on the list, `web/next.js` sends them to `/next/` at the same address. The machine and the address
  are shared (spec 34), so they land on the same project and step.
- **It is empty until the owner says otherwise.** Switching a screen on is a one-line PR that adds its room to
  `LIVE`, opened when the owner asks. `tests/next.test.mjs` fails while the list is not empty, so that PR also
  changes the test, which makes it visible in review.
- **Before a room goes on the list:**
  - the screen has moved: it is in `ui/src/screens/` and listed in `SCREENS`;
  - the audit gates pass on `/next/`, and on the screen they find nothing the current Studio's screen doesn't have
    (`tests/next.test.mjs`, "a moved screen has no violation on /next/…");
  - its way home works. Where the screen's Back and Esc lead must be live too, or the owner accepts the extra hop:
    the Brand sheet's Lock and Esc go back to the Studio scaffold, and until the scaffold moves, `/next/` shows its
    stand-in with **Open in the Studio**.
- **Only a screen with an address can go.** A Brand sheet opened from a chat has no address (the chat is not in the
  address), so it stays in the current Studio whatever `LIVE` says. A project's sheet, opened from its Studio, got an
  address for this port: `?room=brand&project=<id>&step=<step>` (`web/nav.js`). On a reload the current Studio
  reopens it there (`web/next.js`), as its Brand card does.
- **The old screen stays** in `web/` after its room is switched on, so taking a room off the list is the rollback.
  Its code goes in a PR of its own, only when the owner says so.
- **Where it applies.** The local Studio. The hosted studio's page carries no `next` key, so it never switches.

## Consequences

- Nothing changes for anyone until `LIVE` has a room in it. `/next/?room=brand&project=<id>` is the preview meanwhile.
- `web/next.js` is the only new code in the current Studio, and it is typed. `web/studio.js` is at the untyped-lines
  cap (`scripts/check.sh`), so nothing is added there.
- Not checked yet: going from `/` to `/next/` inside the Hermes Desktop pane's frame. It is the same server and a
  plain navigation, but the frame's opaque origin has not been tried with it.
- A screen that has moved but is not on the list still gets fixes in `web/` first. A fix there that the moved screen
  lacks is ported again before its room goes on the list.
