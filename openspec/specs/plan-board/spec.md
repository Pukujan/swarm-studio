# plan-board Specification

## Purpose

The Plan board is a game's plan before anything costly runs: nine cards, the starter, the systems, sketches, mocks and
the world, talked through in the chat and locked at a price the person was shown (specs 21, 27, 38). Breadboard:
docs/ux/breadboards/plan-board.md. Statechart: `planBoard`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. The audit opens the board from Projects with a game talk ("A platformer through a night market").

## Requirements

### Requirement: Breadcrumb

The board SHALL show a breadcrumb that reads `Home › Projects › <plan> › Plan` (RULES rule 7). A plan with no title
yet SHALL read `New game` in its place.

#### Scenario: A new game talk
- **WHEN** a game talk opens the board before the plan has a title
- **THEN** the visible breadcrumb reads `Home › Projects › New game › Plan`
- Gate: `breadcrumb`

#### Scenario: The plan menu
- **WHEN** the person presses the plan's name
- **THEN** a menu opens with Save as template only, and ×, Esc or a click outside closes it
- Gate: `manual`

### Requirement: Loading

While a plan or a talk's first draft is on its way, the board SHALL show three waiting cards marked
`aria-busy="true"`, and Hermia's cursor SHALL work on the first (spec 41). A picture being painted SHALL show its
sheen, `aria-busy="true"`, and the painter's crew cursor.

#### Scenario: A game talk starting
- **WHEN** the board opens from a game talk and `/api/talk` is held back
- **THEN** within 2.5 s three waiting cards with `aria-busy="true"` are visible in the Plan section
- Gate: `loading`

#### Scenario: A saved plan opening
- **WHEN** a plan opens from its project card and `/api/plans/<id>` is held back
- **THEN** three waiting cards show until the nine cards land in their place
- Gate: `loading`

#### Scenario: Pictures painting
- **WHEN** a sketch sheet is being painted
- **THEN** its card shows the sheen and the painter's cursor, and the rest of the board stays usable
- Gate: `manual`

### Requirement: Nothing costly before Lock

No picture beyond the sketches and no coding run SHALL start before Lock. The primary button SHALL carry the price,
and the Gate SHALL show the price by part before the one confirm (spec 21).

#### Scenario: The price on the button
- **WHEN** a plan with Meshy parts has loaded
- **THEN** the primary button reads `Lock · <n> credits`; a plan with none reads `Lock · <n> pictures`
- Gate: `manual`

#### Scenario: The Gate
- **WHEN** the person presses `Lock · <n>`
- **THEN** a dialog lists each part (n × each, cost), coding runs and pictures, offers `Test one first`, and its one
  button repeats the price
- Gate: `manual`

#### Scenario: A stale price
- **WHEN** the price changed between showing and confirming
- **THEN** nothing is locked, and the Gate opens again with the new price
- Gate: `manual`

#### Scenario: Build after Lock
- **WHEN** the plan is locked and the person presses Build
- **THEN** the build starts and the Game room opens
- Gate: `manual`

### Requirement: The talk shapes the board

While the plan is a talk, the board SHALL show the plan as it stands, read-only, and the primary button SHALL read
Lock, which locks the talk into a plan (spec 27).

#### Scenario: An answer fills a card
- **WHEN** the person answers the planner's question about the genre
- **THEN** the matching card's value changes on the board without moving the other cards
- Gate: `manual`

### Requirement: Empty state

The board SHALL never be blank and SHALL never explain itself in sentences (RULES rule 8): until the talk's first
draft lands it shows the three waiting cards, and a card with no value yet shows its name only.

#### Scenario: A fresh talk
- **WHEN** the talk has not answered anything yet
- **THEN** the board shows waiting cards or card names; no helper sentence is visible
- Gate: `manual`

### Requirement: Accessible and console-clean

#### Scenario: axe and console
- **WHEN** the board has loaded at 1440 and 390 wide
- **THEN** axe finds nothing outside the known list, and no console error or 400+ response happens
- Gate: `axe`, `console`

### Requirement: 390 px

At 390 px the page SHALL NOT scroll sideways; sections SHALL stack and the Gate SHALL fit the width.

#### Scenario: No sideways scroll
- **WHEN** the board has loaded at 390 wide
- **THEN** the page does not scroll sideways
- Gate: `scroll`

#### Scenario: The breadcrumb at 390
- **WHEN** the board is open at 390 wide
- **THEN** the breadcrumb still reads to Home, shortening the plan's name rather than dropping a part
- Gate: `breadcrumb`
