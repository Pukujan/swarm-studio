# The UI audit gates

CI's `ui-audit` job opens every top-level screen of a throwaway Studio in Chromium, at 1440 and 390 wide, and
checks the rules in [RULES.md](RULES.md) that a machine can check. The same checks must pass before and after the
move to Vite, React and TypeScript ([PLANS.md](../PLANS.md) §5).

- The suite: [tools/dev/audit/audit.spec.mjs](../../tools/dev/audit/audit.spec.mjs). Playwright Test and
  `@axe-core/playwright`, pinned in `tools/dev/package.json` (development only; the plugin installs nothing
  from it).
- The Studio: the walkthrough's ([scripts/walkthrough-fixtures.mjs](../../scripts/walkthrough-fixtures.mjs)),
  plus one project still in the Studio. Its own port and data folder, and a model that always fails.
- The screens: Projects, a project's Overview, the Design deck, the App, Game and Film rooms, the Studio, the
  Plan board and the brand sheet (opened from the Studio).

## What is checked

| Check | Rule | Fails when |
| --- | --- | --- |
| breadcrumb | 7 | The visible breadcrumb is not `Home › Projects › build › room` (Projects itself: `Home › Projects`). |
| axe | 26 | axe-core finds a WCAG 2.0–2.2 A or AA violation in the Studio's own UI. Built pages (iframes) are the person's content and are left out. |
| scroll | 25 | The page scrolls sideways. |
| console | | A console error, an uncaught page error or a request that answers 400 or more. |
| loading | | The screen's data is held back for 2.5 s and no skeleton or busy marker (`aria-busy`, `role=progressbar`, `.sk`, `.skeleton`, `.wait-in`, `.spin`) shows meanwhile. |
| words | [0015](../decisions/0015-studio-walk-and-chat.md) | The page's visible text says "pack" or "packs". People see options. |
| chat | [0015](../decisions/0015-studio-walk-and-chat.md) | In the next UI (`AUDIT_APP=next`), a chat on screen is not docked along the bottom at the full width. |

Two expected breadcrumbs are our reading of the rules, not the owner's words. Projects reads `Home › Projects`
because Home is the Feed (rule 1). The Design deck keeps Figma's frame (rule 32), but rule 7 has no exception for
it, so it reads like every other room.

A test, "the loading check sees a skeleton", holds back a build's events on the Overview, which always shows a
skeleton then. If it fails, the loading check is broken, not the screens.

## The next UI at /next/

The Studio is moving to React one screen at a time ([decision 0013](../decisions/0013-react-ui-coexists.md)).
`AUDIT_APP=next` runs the same screens at the same addresses under `/next/`, against their own known list,
[.ui-audit-known-violations.next.json](../../.ui-audit-known-violations.next.json). CI runs both.

- Until a screen moves, `/next/` shows a stand-in for it: the screen's name and a button to the current Studio.
  Its known violations are the stand-in's, not the screen's.
- When a screen moves, give it a `nextReady` selector in the suite, run `AUDIT_APP=next` with `audit:update`,
  and compare the screen's entries with the current Studio's. The port may fix violations, never add one
  ([ui/README.md](../../ui/README.md)).
- The brand sheet has no address of its own, so it joins the `/next/` run when its way in has moved.
- Plan opens at `?room=plan` there: the current Studio's run opens it from a game talk.

## Known violations

What the app breaks today is listed in [.ui-audit-known-violations.json](../../.ui-audit-known-violations.json),
like `.dependency-cruiser-known-violations.json`. A violation keeps its entry until it's fixed. Each entry's key
is the screen, the width, the check and, for axe, the rule. Its detail says what was seen.

- **A new violation fails the run.** Fix it. If the owner accepts it, run the update below.
- **A known violation that no longer happens** is printed as `fixed:` and the run passes. Delete its entry.
- **Update the list** after a fix or an accepted change. Run the whole suite, not a part:

  ```
  npm run --prefix tools/dev audit:update
  ```

  On the owner's machine, use the queue with an absolute path:

  ```
  D:\MANAGED\devrun\devrun.cmd queue npm run --prefix D:\development\swarm-studio-repo\tools\dev audit:update
  ```

Every run writes what each screen found to `test-results/audit-found/`, and CI uploads it when the job fails.

To run it locally: `npm ci --prefix tools/dev`, then `npx playwright install chromium-headless-shell` in
`tools/dev`, then `npm run --prefix tools/dev audit`. The install must use the pinned Playwright in `tools/dev`,
or it downloads a Chromium that the pinned version can't use.

## Not yet automated

These rules have no gate yet. Each is a gap to close ([decision 0009](../decisions/0009-ux-rules-are-checks.md)).

- **Rule 7, the rest of it:** the logo goes Home, and Esc goes up one level. `scripts/open-check.mjs` checks Esc
  inside a project.
- **Rule 3:** at most 4 choices, 1 primary action and 4 edge icons per layer.
- **Rules 8 and 30:** names only at rest, and at most 15 words of interface text. `scripts/walkthrough-audit.js`
  counts words and sentences but gates nothing.
- **Rule 16:** targets of 40 px (44 on touch). axe's `target-size` checks WCAG's 24 px, not ours.
  `walkthrough-audit.js` measures ours but gates nothing.
- **Rule 18:** every panel closes with ×, Esc and a click outside, and one sheet at a time.
- **Rule 21:** nothing overlaps. `scripts/ui-check.mjs` checks this on Projects and a project. It needs a
  running server, and CI doesn't run it.
- **Rule 29:** buttons don't move, and layout shift stays below 0.01.
- **Standing rules 3 and 4:** few colours, and light and dark from the tokens. This suite runs in dark only.
- **Decision 0009:**
  - nothing opens by itself;
  - no internal or sample names;
  - numbers carry units;
  - a setting never sits in a list of things to make;
  - every stop says why.
- **Rule 25 at 1280, 1024 and 768:** this suite checks 1440 and 390 only.
- **Loading states:** only the screen's first load is checked. Loading after a click inside a screen isn't.
