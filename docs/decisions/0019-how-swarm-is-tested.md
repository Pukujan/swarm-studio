# 0019. How Swarm is tested: specs, behaviour, metamorphic relations, properties and prompt evals

- Date: 2026-11-13
- Status: accepted by the owner ("Go"). *Our wording*. 0018 is reserved for the brand port's "switching on a
  ported screen".
- Builds on [0007](0007-crew-is-the-product.md) (the crew is product, with test sets) and
  [0009](0009-ux-rules-are-checks.md) (UX rules are checks).

## Context

Most of what Swarm makes comes from models, so there's rarely one right output to compare against. The repo
already has:
- specs and decision records;
- per-screen OpenSpec specs written as `WHEN … THEN …` scenarios (#424), which nothing runs yet;
- `ui-audit` gates, a motion check and the board gauge;
- crew bench runs (`bench/`).

What's missing is a way to test the crew's output and the boards' rules without a fixed expected answer.

## Decision

1. **Spec-driven (SDD), closed loop.** Every PR that changes behaviour names the spec requirement or decision it
   meets. CI fails if an OpenSpec scenario has no test bound to it. Scenarios marked `pending #N` are allowed until
   that issue closes.
2. **Behaviour-driven (BDD): the scenarios run.**
   - The OpenSpec `#### Scenario:` blocks become Playwright tests, using a maintained runner (`playwright-bdd`,
     pinned), so the owner's rules are checked in their own words. Examples: chat at the bottom, no "pack",
     skeleton while loading, the breadcrumb trail.
   - They run on `/` and `/next/`.
3. **Metamorphic validation**, for model output and board behaviour. A suite of relations that must always hold.
   - **Crew:**
     - changing only the brand colour changes only colour tokens in the build;
     - renaming one page leaves every other page's content version unchanged (spec 36);
     - the same brief, worded differently, gives the same sitemap structure;
     - a section reworked by the reviewer keeps the copy it was given, word for word.
   - **Boards:**
     - zooming in or out never breaks the budgets, and every item stays reachable;
     - live → photo → live renders the same within a pixel-diff tolerance;
     - adding a card never changes another card's tier unless the budget forces it.
   - **Linter:** findings don't change with whitespace or attribute order.
   - It runs in CI on fixtures and recorded model output, and nightly against live models.
4. **Property-based tests**, with **fast-check** (pinned), for the deterministic rules:
   - the tier manager and its budgets;
   - the image size ladder and dedup;
   - idle shutdown (the timers and the at-most-2/at-most-1 limits);
   - the hysteresis rules.
5. **Prompt evals gate prompt changes.**
   - Any change to a crew prompt, including the Open Design intake (decision 0016), runs the crew's test sets
     before and after. It reports quality (the reviewer's score and the slop-linter findings), build time and
     token count.
   - A regression past the thresholds fails the PR. This makes 0007's "comes with a test set" enforceable.

## Consequences

- New: `tests/metamorphic/`, `tests/property/`, `tests/bdd/` (generated from `openspec/specs/`), and
  `bench/evals/`. Each gets a CI job.
- `playwright-bdd` and `fast-check` are dev dependencies only: pinned, never shipped to the person's machine.
- The work is split across the sessions that own each area: the tier manager, idle shutdown, the crew and prompts,
  and CI. See the linked issues.
