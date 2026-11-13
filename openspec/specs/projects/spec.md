# projects Specification

## Purpose

Projects is the Studio's file browser and its top layer: every project, chat, asset and deleted project the person
has, and the one Make box that starts something new. It follows Finder and Figma's file browser
(docs/ux/PATTERNS.md). Breadboard: docs/ux/breadboards/projects.md. Statechart: `projects.browser`.

Gate tags name the `ui-audit` check that tests a scenario (docs/ux/AUDIT.md): `breadcrumb`, `axe`, `scroll`,
`console`, `loading`. `manual` means no gate yet; the scenario is walked by hand before a UI PR.

## Requirements

### Requirement: Breadcrumb

The screen SHALL show a breadcrumb that reads `Home › Projects`, and `Home › Projects › <view>` for Chats, Assets,
Trash and a folder (RULES rule 7).

#### Scenario: Projects at rest
- **WHEN** the Studio opens at `/` with no address
- **THEN** the visible breadcrumb reads `Home › Projects`
- Gate: `breadcrumb`

#### Scenario: A view in the sidebar
- **WHEN** the person picks Chats, Assets, Trash or a folder in the sidebar
- **THEN** the breadcrumb reads `Home › Projects › Chats` (or `Assets`, `Trash`, the folder's name)
- Gate: `manual`

#### Scenario: The breadcrumb's parts go where they say
- **WHEN** the person presses `Projects` in the breadcrumb from any view
- **THEN** Recent shows, and Esc from Recent does nothing further inside the Studio
- Gate: `manual`

### Requirement: Loading

While the projects are on their way the screen SHALL show four card skeletons marked `aria-busy="true"`, and
Hermia's cursor SHALL work on the first one (spec 41).

#### Scenario: First load
- **WHEN** `/` opens and the project list is held back
- **THEN** four `.card.wait-in[aria-busy="true"]` skeletons are visible within 2.5 s, in the place the cards will
  take, and no "nothing here" line shows
- Gate: `loading`

#### Scenario: Assets' first visit
- **WHEN** the person opens Assets before its list has come
- **THEN** the same waiting cards show, not the empty line
- Gate: `manual`

#### Scenario: Hermia works on the skeleton
- **WHEN** a skeleton is on screen
- **THEN** Hermia's cursor goes onto the first skeleton and shows her three dots until the cards land, at most 12 s
- Gate: `manual`

### Requirement: Empty views

Each empty view SHALL say in one line what goes there, with its own icon, and Recent, All projects and Assets SHALL
offer one `Make something` button that puts the cursor in the Make box (RULES rules 8 and 9).

#### Scenario: No projects yet
- **WHEN** the person has no projects and opens Recent or All projects
- **THEN** the stage shows one icon, one line and `Make something`, and nothing else
- Gate: `manual`

#### Scenario: A search with no match
- **WHEN** the search or a filter leaves nothing
- **THEN** the stage reads `Nothing matches`, without `Make something`
- Gate: `manual`

#### Scenario: Empty Chats, Trash and folder
- **WHEN** Chats, Trash or a folder holds nothing
- **THEN** Chats reads `Talks with the planner that built nothing yet` under its New chat row, Trash reads `Deleted
  projects wait here until you empty Trash` with no Empty button, and a folder reads `Drag a project here to file it`
- Gate: `manual`

### Requirement: Project cards

A card SHALL show the project's cover, title, kind icons and state line, and nothing else at rest (RULES rule 8). One
idea is one card: a project's versions stack on it (spec 18).

#### Scenario: Opening a project
- **WHEN** the person clicks a card, or focuses it and presses Enter
- **THEN** the project's Overview opens on its newest version
- Gate: `manual`

#### Scenario: A stack of versions
- **WHEN** a card's count badge reads 3 and the person opens the stack
- **THEN** three cards read `Version 3`, `Version 2`, `Version 1`, newest first, with Back to leave the stack
- Gate: `manual`

#### Scenario: Moving to Trash can be undone
- **WHEN** the person deletes a project from its card, its menu, the selection bar or by dragging it onto Trash
- **THEN** the card leaves the view, a toast offers Undo, and the project is in Trash, not gone
- Gate: `manual`

#### Scenario: Deleting forever asks first
- **WHEN** the person presses Delete forever or Empty in Trash
- **THEN** a dialog names what will be deleted and that it cannot be undone, and nothing is deleted until it is
  confirmed
- Gate: `manual`

### Requirement: Chats

Chats SHALL list the talks with the planner that built nothing yet, newest first, under a `New chat` row (spec 29).

#### Scenario: Reopening a chat
- **WHEN** the person opens a website, app or video chat
- **THEN** the Design deck's chat opens where it left off, with nothing built and no project made
- Gate: `manual`

#### Scenario: A game's chat
- **WHEN** the person opens a game's chat
- **THEN** the Plan board opens beside its talk
- Gate: `manual`

### Requirement: Accessible and console-clean

The screen SHALL have no axe WCAG 2.2 A or AA violation in the Studio's own UI and no console error, page error or
failed request.

#### Scenario: axe at both widths
- **WHEN** Projects has loaded at 1440 and at 390 wide
- **THEN** axe finds no violation that is not in `.ui-audit-known-violations.json`
- Gate: `axe`

#### Scenario: No errors
- **WHEN** Projects loads
- **THEN** no console error, page error or response of 400 or more happens
- Gate: `console`

### Requirement: 390 px

At 390 px wide the page SHALL NOT scroll sideways; the sidebar SHALL be a drawer behind Menu and the cards SHALL
stack.

#### Scenario: No sideways scroll
- **WHEN** Projects has loaded at 390 wide
- **THEN** `scrollWidth` equals `clientWidth`
- Gate: `scroll`

#### Scenario: The drawer
- **WHEN** the person presses Menu at 390 wide
- **THEN** the sidebar slides in over a scrim, and ×, Esc, the scrim or a pick closes it
- Gate: `manual`
