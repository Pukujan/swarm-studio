# Swarm Studio: per-screen specs

Status: **draft for review** (2026-11-13). The fourth of the six design artifacts in [docs/PLANS.md](../docs/PLANS.md)
§5. One spec per screen of the Studio, in OpenSpec's format: `specs/<screen>/spec.md` holds a Purpose, then
`### Requirement:` blocks (each a SHALL), each with `#### Scenario:` blocks written as WHEN and THEN.

These specs say what each screen must do, so the move to Vite, React and TypeScript ([decision 0013](../docs/decisions/0013-react-ui-coexists.md))
can port a screen and check it against the same scenarios. They don't replace the feature specs in
[docs/specs/](../docs/specs/README.md), which say why a feature exists and how it is built; these cite them.

## Context

- What Swarm is: [docs/PRODUCT.md](../docs/PRODUCT.md). The UI rules: [docs/ux/RULES.md](../docs/ux/RULES.md).
- Names: [docs/ux/OBJECTS.md](../docs/ux/OBJECTS.md). Every requirement uses its names.
- Places and presses: [docs/ux/breadboards/](../docs/ux/breadboards/README.md), one per screen.
- Moves between screens: [docs/ux/statechart/](../docs/ux/statechart/README.md).

## How a scenario is tested

Each scenario ends with a **Gate** line naming what tests it:

| Gate | Tested by |
|---|---|
| `breadcrumb`, `axe`, `scroll`, `console`, `loading` | the `ui-audit` job ([docs/ux/AUDIT.md](../docs/ux/AUDIT.md), `tools/dev/audit/audit.spec.mjs`), at 1440 and 390 wide |
| `manual` | no gate yet: walked by hand before a UI PR (RULES checklist). Each one is a candidate for the next gate |

A scenario the audit tests today may still fail on main: what fails is listed in `.ui-audit-known-violations.json`
and in each breadboard's **Where the code differs**. The spec is the target; the known list is where the code is.

## Shared requirements

Every screen spec repeats these with its own values, so each file stands alone:

- **Breadcrumb** (rule 7): `Home › Projects › <build> › <room>`; Projects itself reads `Home › Projects`.
- **Loading**: a skeleton in the shape of what is coming, `aria-busy="true"` while it waits, and Hermia's cursor on
  it ([spec 41](../docs/specs/41-pet-cursor.md)).
- **Empty states**: one icon and one line at most, never a paragraph (rules 8 and 9).
- **Accessible and console-clean**: no new axe violation, no console error or failed request.
- **390 px**: no sideways scroll; side panels become sheets.

## The specs

`projects`, `make`, `studio`, `brand-sheet`, `plan-board`, `overview`, `design-deck`, `setup-settings`, `publish`.
