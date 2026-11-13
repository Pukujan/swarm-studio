# brand-sheet Specification

## Purpose

The brand sheet shows a website's or app's story, palettes, type pairings and, from a brand pack, voice, pictures
and a storyboard, side by side before anything is designed. Lock makes the picks the build's theme, and the build is
checked against it (spec 31). Breadboard: docs/ux/breadboards/brand-sheet.md. Statechart: `brandSheet`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. The audit opens the sheet from a website project's Studio scaffold (Enter on the Brand card).

## Requirements

### Requirement: Breadcrumb

The sheet SHALL show a breadcrumb that reads `Home › Projects › <project> › Brand sheet`, or
`Home › Projects › Chat › Brand sheet` for a chat with no project yet (RULES rule 7).

#### Scenario: Opened from the Studio
- **WHEN** the person presses Enter on the Brand card of "Cedar Cafe"'s scaffold
- **THEN** the visible breadcrumb reads `Home › Projects › Cedar Cafe › Brand sheet`
- Gate: `breadcrumb`

#### Scenario: Opened from a chat
- **WHEN** the person presses Brand sheet under a chat's brief, before any project exists
- **THEN** the breadcrumb reads `Home › Projects › Chat › Brand sheet`
- Gate: `manual`

#### Scenario: Going back where it came from
- **WHEN** the sheet was opened from the scaffold's Brand step and the person presses Esc with nothing selected
- **THEN** the scaffold shows again on its Brand step
- Gate: `manual`

### Requirement: Loading

While the options are made, the sheet SHALL show its own sections (Story, Palette, Type) as skeleton cards at their
final sizes, the stage SHALL be `aria-busy="true"`, and Hermia's cursor SHALL be on the first card (spec 41). Nothing
SHALL move when the options land.

#### Scenario: Options being made
- **WHEN** the sheet opens and the brand request is held back
- **THEN** within 2.5 s a busy marker is visible and the Story, Palette and Type skeletons show with Hermia's cursor
  on the first Story card
- Gate: `loading`

#### Scenario: The options land
- **WHEN** the options arrive
- **THEN** each skeleton is replaced by its card in the same place, and the stage's `aria-busy` is `false`
- Gate: `manual`

### Requirement: Options side by side

The sheet SHALL show three palettes, each with a light and a dark sample, and three type pairings, each as a real
heading and paragraph, plus one input each for the person's own colours and fonts (spec 31).

#### Scenario: Picking a palette
- **WHEN** the person clicks the second palette
- **THEN** it is marked picked (`aria-pressed="true"`), the samples of every type pairing redraw in it, and the
  inspector shows its colours
- Gate: `manual`

#### Scenario: Your own words
- **WHEN** the person types "deep green and brass" in Your own colours and presses Enter
- **THEN** a fourth palette made from those words appears and is picked
- Gate: `manual`

#### Scenario: A pack in part
- **WHEN** the person selects a pack and presses Type in the inspector
- **THEN** only the type pairing changes to the pack's; palette, voice and pictures stay as they were
- Gate: `manual`

### Requirement: Lock

Lock SHALL be the top bar's one primary button. Lock SHALL freeze the picks into the theme and go back where the sheet
was opened from; on a locked sheet the same button SHALL read Unlock, at the same size (RULES rule 29).

#### Scenario: Locking from the Studio
- **WHEN** the person presses Lock on a sheet opened from the scaffold
- **THEN** the scaffold shows again, its Brand card shows the picked colours and type, and the Brand dot reads Done
- Gate: `manual`

#### Scenario: Building without the sheet
- **WHEN** the person never opens the sheet and presses Build in the chat
- **THEN** the build starts; the sheet is optional
- Gate: `manual`

### Requirement: Empty state

The sheet SHALL never show an empty board with no explanation: before the options exist it shows the skeleton, and a
failure shows a ⚠ marker with the message one layer down (RULES rule 10).

#### Scenario: The options could not be made
- **WHEN** the model call fails
- **THEN** a toast says what failed in one line, and the stage is no longer marked busy
- Gate: `manual`

### Requirement: Accessible and console-clean

The sheet SHALL have no new axe violation and no console error, page error or failed request. A pack card drawn in
its own colours is the person's content and still needs readable text.

#### Scenario: axe and console
- **WHEN** the sheet has loaded at 1440 and 390 wide
- **THEN** axe finds nothing outside the known list, and no console error or 400+ response happens
- Gate: `axe`, `console`

### Requirement: 390 px

At 390 px the page SHALL NOT scroll sideways, the sections SHALL stack, and the inspector SHALL be a half sheet.

#### Scenario: No sideways scroll
- **WHEN** the sheet has loaded at 390 wide
- **THEN** the page does not scroll sideways
- Gate: `scroll`

#### Scenario: The breadcrumb at 390
- **WHEN** the sheet is open at 390 wide
- **THEN** the breadcrumb still reads to Home, shortening the project's name with an ellipsis rather than dropping a
  part
- Gate: `breadcrumb`
