# overview Specification

## Purpose

The Overview is a project's pages and files: artboards in sections on one stage, Files and Layers on the left, the
inspector on the right while something is selected, and the dock to tell the crew what to change (SITEMAP §8; the
owner, 2026-11-11: "this needs to be called overview"). From here each room opens by double-clicking its artboard.
Breadboard: docs/ux/breadboards/overview.md. Statechart: `build.playable.room.overview`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. The audit opens `?project=<id>&version=<id>` for the website project "Alpha Tea".

## Requirements

### Requirement: Breadcrumb

The Overview SHALL show a breadcrumb that reads `Home › Projects › <project> › Overview` at every width (RULES rule
7). The project's name SHALL open its menu: Rename, Duplicate and its versions.

#### Scenario: At rest
- **WHEN** the Overview of "Alpha Tea" has loaded at 1440 wide
- **THEN** the visible breadcrumb reads `Home › Projects › Alpha Tea › Overview`
- Gate: `breadcrumb`

#### Scenario: At 390
- **WHEN** the same Overview is open at 390 wide
- **THEN** the breadcrumb still reads to Home, shortening the name rather than dropping a part
- Gate: `breadcrumb`

#### Scenario: Versions in the menu
- **WHEN** a project has three versions and the person presses its name
- **THEN** the menu lists Rename, Duplicate, then `Version 3`, `Version 2`, `Version 1` with the open one ticked
- Gate: `manual`

### Requirement: Loading

While a version's board is on its way, the stage SHALL show three page skeletons marked `aria-busy="true"`, never the
last version's pages, and Hermia's cursor SHALL work on the first (spec 41). A page with no picture yet SHALL show a
skeleton per planned section; a picture being painted SHALL be `aria-busy="true"`.

#### Scenario: The board loading
- **WHEN** the Overview opens and the version's events are held back
- **THEN** within 2.5 s three page skeletons with `aria-busy="true"` show in the Site section
- Gate: `loading`

#### Scenario: Pages being built
- **WHEN** the crew is building and a page has no snapshot yet
- **THEN** the page shows a skeleton block per planned section, and the built parts replace them as they land
- Gate: `manual`

### Requirement: Empty project

A project with nothing built SHALL NOT show a blank stage: it shows one line and one way to start (RULES rule 8).

#### Scenario: Nothing built
- **WHEN** a project's version has built nothing
- **THEN** the stage shows one icon, one line and the dock's input focused, and no section headers
- Gate: `manual`

### Requirement: One place per room

Double-clicking an artboard SHALL open its room: a page or a picture the Design deck, the app the Engine room, a game
the Game room, a film the Film studio. Back from a room SHALL read `Overview` and come back here.

#### Scenario: A page into the Design deck
- **WHEN** the person double-clicks the page "Menu"
- **THEN** the Design deck opens focused on "Menu", and Back reads `Overview`
- Gate: `manual`

#### Scenario: Esc from a room
- **WHEN** the Design deck is open from the Overview and nothing is selected or open
- **THEN** Esc returns to the Overview
- Gate: `manual`

### Requirement: Inspector

The inspector SHALL show only while something is selected, slide over the stage without moving it, and close with ×,
Esc or a click on the empty stage (RULES rules 18 and 29).

#### Scenario: Selecting a page
- **WHEN** the person clicks a page artboard
- **THEN** the inspector shows its preview, size, sections and Open, Export zip; the stage does not shift
- Gate: `manual`

#### Scenario: Closing it
- **WHEN** the inspector is open and the person presses Esc
- **THEN** the inspector closes and the selection clears; a second Esc goes to Projects
- Gate: `manual`

### Requirement: Stop

While agents work, the top bar SHALL show the work chip and one Stop. Stop SHALL stop every build of this project at
once, with no confirmation, and say Stopped (REQUIREMENTS 2026-11-11).

#### Scenario: Stopping the crew
- **WHEN** a build is running and the person presses Stop
- **THEN** Stop reads `Stopping`, then `Stopped`; what was built stays; Stop keeps its place and size
- Gate: `manual`

### Requirement: Accessible and console-clean

The screen SHALL have no new axe violation (one not in `.ui-audit-known-violations.json`) and no console error, page
error or failed request.

#### Scenario: axe and console
- **WHEN** the Overview has loaded at 1440 and 390 wide
- **THEN** axe finds nothing outside the known list, and no console error or 400+ response happens
- Gate: `axe`, `console`

### Requirement: 390 px

At 390 px the page SHALL NOT scroll sideways; Files and Layers SHALL be a sheet; the inspector SHALL be a bottom sheet.

#### Scenario: No sideways scroll
- **WHEN** the Overview has loaded at 390 wide
- **THEN** the page does not scroll sideways
- Gate: `scroll`

#### Scenario: Files as a sheet
- **WHEN** the person presses Files in the dock at 390 wide
- **THEN** Files and Layers open as a sheet; picking a row closes it and zooms to that artboard
- Gate: `manual`
