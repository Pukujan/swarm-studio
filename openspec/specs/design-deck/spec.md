# design-deck Specification

## Purpose

The Design deck is where the crew is watched at work and a page is designed. It follows Figma's layout almost one to
one (RULES rule 32): Layers on the left, the canvas with the crew's cursors, one toolbar, the right panel. A website,
app or video started with Make opens here with Follow on, and the chat holds the talk and the brief before anything is
built. Breadboard: docs/ux/breadboards/design-deck.md. Statechart: `build.playable.room.deck` and `draft`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. The audit opens `?version=<id>&room=deck` for "Alpha Tea".

## Requirements

### Requirement: Breadcrumb

The deck SHALL show a breadcrumb that reads `Home › Projects › <project> › Design deck` at every width (RULES rule 7;
AUDIT.md reads rule 7 as having no exception for the deck).

#### Scenario: At rest
- **WHEN** the deck of "Alpha Tea" has loaded at 1440 wide
- **THEN** the visible breadcrumb reads `Home › Projects › Alpha Tea › Design deck`
- Gate: `breadcrumb`

#### Scenario: At 390
- **WHEN** the deck is open at 390 wide
- **THEN** the breadcrumb still reads to Home
- Gate: `breadcrumb`

#### Scenario: Back
- **WHEN** nothing is selected or open and the person presses Esc
- **THEN** the Overview opens
- Gate: `manual`

### Requirement: Loading

While the build, its events and the work list load, the deck SHALL show a skeleton of the pages it is about to show,
marked `aria-busy="true"`, with Hermia's cursor on it; it SHALL NOT read Ready before it knows.

#### Scenario: Opening a version
- **WHEN** the deck opens and `/api/models`, `/api/auto`, `/api/work` and the events are held back
- **THEN** within 2.5 s a skeleton or busy marker is visible, and the status pill does not read Ready
- Gate: `loading`

#### Scenario: Waiting for Hermes
- **WHEN** Hermes's model is not answering yet
- **THEN** the chat shows `Waiting for Hermes` until it does
- Gate: `manual`

### Requirement: Empty states

A deck with no pages SHALL show the Layers line `Pages appear here once the planner names them.` and nothing on the
canvas but the chat's brief or composer; the chat's empty feed SHALL show one line.

#### Scenario: A new chat
- **WHEN** New chat opens the deck with nothing built
- **THEN** Layers shows its one line, the canvas is empty, the chat's composer reads `Tell Hermia…` and its button
  reads Send
- Gate: `manual`

### Requirement: Watching the crew

While the crew builds, Follow SHALL be on and the camera SHALL move to the agent at work; a drag or the wheel SHALL
turn it off, and a double-click on the canvas SHALL turn it back on. The status pill SHALL say what is happening
(`Planning the pages`, `n agents building`, `n pages built`, `Stopped`).

#### Scenario: A website started with Make
- **WHEN** the person presses Build on a website's brief
- **THEN** the deck shows the crew's named cursors on the pages, Follow is on, and the pill reads `Planning the pages`
  then `n agents building`
- Gate: `manual`

#### Scenario: Stopped
- **WHEN** the person presses Stop
- **THEN** the pill reads `Stopped`, the chat says how much is kept and offers Resume
- Gate: `manual`

### Requirement: Talk and brief before building

Before a build, the chat SHALL hold the talk with Hermia and end in the brief, editable, with Build and Keep talking
(and Brand sheet for a website or app). Nothing SHALL build before Build (decision 0004).

#### Scenario: The brief
- **WHEN** the talk is ready to build
- **THEN** the brief shows as an editable text with Build and Keep talking, and no agent is working
- Gate: `manual`

#### Scenario: A different product
- **WHEN** the brief describes a different product than the open project's
- **THEN** the chat offers New project and Add here instead of Build
- Gate: `manual`

### Requirement: Comments and the Critic

A comment pin on a section SHALL open a composer whose Send goes to the crew, who reply in the thread; the Critic's
issues SHALL show as flags on their sections, at most three, and leave when fixed.

#### Scenario: A comment
- **WHEN** the person pins a comment "Bigger headline" on the hero and presses Send
- **THEN** the pin stays on the hero and a crew reply appears in its thread
- Gate: `manual`

### Requirement: Replay

Replay SHALL play the saved build again with Follow on; Stop replay SHALL put the finished build back; leaving the deck
SHALL stop a replay.

#### Scenario: Replaying
- **WHEN** the person picks Replay in ☰
- **THEN** the pages build again as they were built, and ☰ offers Stop replay
- Gate: `manual`

### Requirement: Accessible and console-clean

#### Scenario: axe and console
- **WHEN** the deck has loaded at 1440 and 390 wide
- **THEN** axe finds nothing outside the known list (built pages in iframes are left out), and no console error or
  400+ response happens
- Gate: `axe`, `console`

### Requirement: 390 px

At 390 px the page SHALL NOT scroll sideways; Layers SHALL be a sheet, the chat a bottom sheet, and the toolbar SHALL
stay reachable.

#### Scenario: No sideways scroll
- **WHEN** the deck has loaded at 390 wide
- **THEN** the page does not scroll sideways
- Gate: `scroll`

#### Scenario: The chat at 390
- **WHEN** the person opens the chat at 390 wide
- **THEN** it opens as a bottom sheet, the canvas stays behind it, and × folds it
- Gate: `manual`
