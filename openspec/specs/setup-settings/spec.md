# setup-settings Specification

## Purpose

Setup connects what the Studio runs on, once and then on request: the Feed account, the models (tested), and how
pictures are made (spec 6). Settings shows what the Studio is connected to and where its data goes, as grouped lists
one level per tap (spec 25, PATTERNS: iOS Settings). Both are sheets over Projects, not places. The models are
Hermes's (docs/engines/hermes-and-connections.md: Hermes's three model slots, its secret scope). Breadboard:
docs/ux/breadboards/setup-settings.md. Statechart: `projects.setup`, `me.settings`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. Neither sheet is an audited screen yet, so every scenario here is `manual` until one is added.

## Requirements

### Requirement: Setup opens once by itself

Setup SHALL open by itself the first time Projects opens, and never again by itself once closed; afterwards it SHALL
open from the You menu.

#### Scenario: First run
- **WHEN** the Studio opens for the first time
- **THEN** the Setup sheet opens over Projects with Account, Models and Pictures, each a row with its state
- Gate: `manual`

#### Scenario: Closed once
- **WHEN** the person closes Setup with ×, Esc, a click outside or Start, and reloads
- **THEN** Setup does not open by itself again
- Gate: `manual`

### Requirement: The model check

Setup SHALL test the planner's and builders' models through Hermes and show ✓ or ⚠ on each. A failed check SHALL show
one plain line and the one fix that fits it, never the raw message at rest; the raw text SHALL be behind Details
(RULES rule 10).

#### Scenario: Testing
- **WHEN** the model check is running
- **THEN** the Models row's state is a spinner with `aria-label="Testing"` and `aria-busy="true"`
- Gate: `manual`

#### Scenario: A failed check
- **WHEN** the builder's model answers with an error
- **THEN** the Models row opens by itself, shows ⚠, one line, and Let Hermes set this up (when Hermes can fix it),
  Test again and Details
- Gate: `manual`

#### Scenario: Picking another model
- **WHEN** the person picks a model in the picker
- **THEN** that model shows a spinner, then ✓, and the Models row's state names it
- Gate: `manual`

### Requirement: Pictures

Setup SHALL offer Painted, Stock photos and Drawn as one choice of three; Painted SHALL show ⚠ when its model is not
ready, and Stock photos SHALL fill in meanwhile.

#### Scenario: Painted not ready
- **WHEN** Painted is picked and its image model is not ready
- **THEN** the Pictures row shows ⚠ and the note says stock photos fill in
- Gate: `manual`

### Requirement: Settings, one level per tap

Settings SHALL open on its groups (You, Crew, Publish, Data), each with its state; a tap SHALL open one group; `‹
Settings` SHALL go back one level; a row SHALL show a dot when connected and a ring when not, and a tap SHALL show
where that thing's data goes.

#### Scenario: Opening Crew
- **WHEN** the person taps Crew
- **THEN** the sheet shows ‹ Settings, then Planner, Builders, Reviewer, Media reader, Pictures, Film, Stand-in
  photos and 3D, each with its dot and state
- Gate: `manual`

#### Scenario: Esc goes up one level
- **WHEN** a group is open and the person presses Esc
- **THEN** the groups show again; a second Esc closes Settings
- Gate: `manual`

### Requirement: Loading

Settings SHALL show each row's state as busy (`aria-busy="true"`) until its request answers, never an empty state that
reads as "not connected".

#### Scenario: Slow connections
- **WHEN** Settings opens and the connection requests are held back
- **THEN** each row's state shows a busy marker, not a ring
- Gate: `manual`

### Requirement: Closing

Both sheets SHALL close with ×, Esc and a click outside, one sheet at a time (RULES rule 18).

#### Scenario: One sheet at a time
- **WHEN** Settings is open and the person opens Setup from Models › Change
- **THEN** Settings closes and Setup opens on its Models row
- Gate: `manual`

### Requirement: 390 px

At 390 px both sheets SHALL be bottom sheets with no sideways scroll; Data SHALL read in one column.

#### Scenario: Setup at 390
- **WHEN** Setup is open at 390 wide
- **THEN** it is a bottom sheet, the picker scrolls inside itself, and the page does not scroll sideways
- Gate: `manual`
