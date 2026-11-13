# studio Specification

## Purpose

The Studio scaffold is a Studio project before its first build: every step the kind needs (Brand, References, Assets,
Plan, Lock) as sections on one board, a step path across the top, the chat and Layers on the left. Nothing builds
until the person presses Build (specs 37 and 42). Breadboard: docs/ux/breadboards/studio.md. Statechart: `scaffold`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. The audit opens this screen at `?room=studio&project=<id>&step=brand` for a website project.

## Requirements

### Requirement: Breadcrumb

The scaffold SHALL show a breadcrumb that reads `Home › Projects › <project> › Studio` (RULES rule 7).

#### Scenario: The scaffold at rest
- **WHEN** the scaffold opens for the project "Cedar Cafe"
- **THEN** the visible breadcrumb reads `Home › Projects › Cedar Cafe › Studio`
- Gate: `breadcrumb`

#### Scenario: Esc goes up one step
- **WHEN** the References step is in view, nothing is selected and the person presses Esc
- **THEN** the Brand step comes into view; Esc again opens Projects
- Gate: `manual`

### Requirement: Loading

While the project's studio record is on its way, the board SHALL show one waiting card marked `aria-busy="true"`,
and Hermia's cursor SHALL work on it (spec 41). Three takes SHALL show three waiting cards until the looks are made.

#### Scenario: First load
- **WHEN** the scaffold opens and `/api/studio/<id>` is held back
- **THEN** a waiting card with `aria-busy="true"` is visible within 2.5 s
- Gate: `loading`

#### Scenario: Three takes being made
- **WHEN** a project begun as Three takes opens before its brand exists
- **THEN** the Three takes section shows three waiting cards, then three take cards, and the board brings that
  section into view
- Gate: `manual`

### Requirement: Step path

The step path SHALL show one chip per step on the record, in the kit's order, then Lock, then a `+ <Name>` chip for
each removed step. Each chip SHALL carry a state dot whose `aria-label` is Empty, Started, Done or Skipped.

#### Scenario: Opening a step
- **WHEN** the person clicks the Assets chip
- **THEN** the board brings the Assets section into view, the address's `step` becomes `assets`, and the inspector
  shows Skip and Remove
- Gate: `manual`

#### Scenario: Removing and bringing back a step
- **WHEN** the person removes References and then presses `+ References`
- **THEN** References leaves the board and the path, a `+ References` chip appears at the end, and pressing it puts
  References back between Brand and Assets with an Empty dot
- Gate: `manual`

#### Scenario: Lock cannot be removed
- **WHEN** the person selects the Lock chip
- **THEN** no Skip or Remove is offered
- Gate: `manual`

#### Scenario: A Scaffold project
- **WHEN** a project begun as Scaffold opens
- **THEN** the path shows Plan and Lock, and `+ Brand`, `+ References`, `+ Assets`
- Gate: `manual`

### Requirement: Empty steps

An empty step SHALL show only its add card (References, Assets) or its start card (Brand), with no explanatory text
(RULES rule 8).

#### Scenario: A new project
- **WHEN** a new website project opens in the Studio
- **THEN** Brand shows one `Brand sheet` card, References shows `Add reference`, Assets shows `Add asset`, and each
  dot reads Empty
- Gate: `manual`

#### Scenario: Files dropped on a step
- **WHEN** the person drops two images on the Assets section
- **THEN** both appear as asset cards, the dot reads Done, and nothing goes to References
- Gate: `manual`

### Requirement: Build is the person's press

Build SHALL be the top bar's one primary button, and nothing SHALL build until it is pressed (spec 37, decision 0004).

#### Scenario: Build opens the Design deck
- **WHEN** the person presses Build on a website project
- **THEN** the crew starts and the Design deck opens with Follow on
- Gate: `manual`

#### Scenario: Build does not move
- **WHEN** a build is starting
- **THEN** Build is disabled in place, at the same size (RULES rule 29)
- Gate: `manual`

### Requirement: Accessible and console-clean

The scaffold SHALL have no new axe violation and no console error, page error or failed request.

#### Scenario: axe and console
- **WHEN** the scaffold has loaded at 1440 and 390 wide
- **THEN** axe finds nothing outside the known list, and no console error or 400+ response happens
- Gate: `axe`, `console`

### Requirement: 390 px

At 390 px the page SHALL NOT scroll sideways. Layers SHALL be a sheet behind its button, and the inspector a half
sheet.

#### Scenario: No sideways scroll
- **WHEN** the scaffold has loaded at 390 wide
- **THEN** the page does not scroll sideways; the step path scrolls inside itself if it must
- Gate: `scroll`

#### Scenario: Layers as a sheet
- **WHEN** the person presses Layers at 390 wide
- **THEN** the Layers sheet opens, and ×, Esc or a click outside closes it
- Gate: `manual`
