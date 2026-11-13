# make Specification

## Purpose

Make is the one way to start something in the Studio: the Make box on Projects, the kind menu, and the five ways to
make (Just build, Guided, Three takes, Scaffold, Studio), each offered only for the kinds that support it. Nothing
builds without the person's press (specs 42 and 27, decision 0004). Breadboard: docs/ux/breadboards/make.md.
Statechart: `projects.make` and its ways.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. Make lives on Projects, so its page-level gates are Projects'.

## Requirements

### Requirement: One box, one primary button

Projects SHALL show one Make box: the kind, an input reading `What should the crew build?`, Examples for a kind that
has them, and Make. No other control on Projects SHALL start a build (RULES rules 1 and 4).

#### Scenario: At rest
- **WHEN** Projects has loaded
- **THEN** the Make box shows the last kind picked, an empty input with its placeholder, and Make; no menu or pop is
  open
- Gate: `manual`

#### Scenario: Examples
- **WHEN** the person presses Examples for a Website
- **THEN** a pop headed `Examples` lists at most four ideas; one click puts its words in the box to edit and closes the
  pop; ×, Esc or a click outside closes it too
- Gate: `manual`

### Requirement: The ways each kind offers

Make SHALL offer exactly the ways spec 42's table gives for the kind, each by its plain name, and no two items SHALL
lead to the same screen. A kind left with one way SHALL go straight there with no menu.

#### Scenario: A website with words
- **WHEN** the kind is Website, the box reads "A tea shop in Kyoto with an online menu", and the person presses Make
- **THEN** a menu offers Just build, Guided, Three takes, Scaffold and Studio, with one pre-selected
- Gate: `manual`

#### Scenario: An empty box
- **WHEN** the box is empty and the kind is Website
- **THEN** Make offers only Scaffold and Studio
- Gate: `manual`

#### Scenario: A brand
- **WHEN** the kind is Brand
- **THEN** Make offers Three takes and Studio only
- Gate: `manual`

#### Scenario: Remembered per kind
- **WHEN** the person last picked Scaffold for an App and presses Make on an App again
- **THEN** Scaffold is pre-selected
- Gate: `manual`

### Requirement: Nothing builds without a press

Just build SHALL open the brief in the Design deck's chat with Build and Keep talking; the crew SHALL start only on
Build. For a new website, Just build is the press: it SHALL go straight to the question before a new website (below),
and the crew SHALL start only on its answer. A stop or a wish to talk, in the prompt or an answer, SHALL never start a
build (REQUIREMENTS 2026-11-11).

#### Scenario: Just build
- **WHEN** the person picks Just build
- **THEN** the Design deck's chat shows the brief and the steps it will take, with Build and Keep talking (for a new
  website: the question before the build, with its three answers), and no agent is working
- Gate: `manual`

#### Scenario: "Don't build yet"
- **WHEN** the box reads "a habit tracker, don't build yet, let's talk" and the person picks Just build
- **THEN** the chat talks; Build appears only after the brief is written
- Gate: `manual`

### Requirement: The question before a new website

Before a new website builds, the planner SHALL ask one question in the chat, `Before I build: skip the steps, or go
through them?`, with three answers, the recommended one first with a short reason: Skip all, build now; Step by
step; Pick steps to skip. The recommendation SHALL come from the person's words alone. Pick steps to skip SHALL ask
which: Skip Brand, Skip Plan, or Skip both, build now. A typed answer SHALL count the same as a pick; Hermes's
model SHALL never answer it. Nothing SHALL build until the person answers (decision 0020, slice 1).

#### Scenario: Asked before a new site
- **WHEN** the person makes a new website from the Make box or the chat
- **THEN** the chat asks the question with three answers, the recommended one first with its reason, and no agent
  is working
- Gate: `manual`

#### Scenario: Skip all, build now
- **WHEN** the person picks Skip all, build now (or types "just build it")
- **THEN** the crew starts that one build; the next new site asks again
- Gate: `manual`

#### Scenario: Pick steps to skip
- **WHEN** the person picks Pick steps to skip, then Skip Brand
- **THEN** the Studio opens on Plan with Brand marked skipped
- Gate: `manual`

#### Scenario: Already answered
- **WHEN** the person presses Build in a Studio project, or changes a site that is already built
- **THEN** the build starts without the question
- Gate: `manual`

### Requirement: Guided

Guided SHALL ask only the questions the words left open, one at a time, as chips or the person's own words, then show
the brief to edit with Build, Keep talking and, for a website or app, Brand sheet. A game's Guided SHALL open its Plan
board's talk instead.

#### Scenario: Only the open questions
- **WHEN** the words already name the audience
- **THEN** Guided does not ask who it is for
- Gate: `manual`

#### Scenario: A question as an answer
- **WHEN** the person types a question into an answer
- **THEN** the Design deck's chat opens and answers it; it is not added to the brief
- Gate: `manual`

### Requirement: Loading and refusals

Make SHALL say in one line why it cannot start, keep the words in the box, and offer the one fix: Check again when
Hermes is not answering, Watch it when another build is running.

#### Scenario: Hermes not answering
- **WHEN** the person presses Make and Hermes's model does not answer
- **THEN** a toast gives the reason and the fix with Check again, nothing starts, and the words stay
- Gate: `manual`

#### Scenario: Another build running
- **WHEN** a build is running and the person starts another with Just build's Build
- **THEN** a toast reads `A build is running. Yours can start when it ends.` with Watch it
- Gate: `manual`

#### Scenario: Three takes being made
- **WHEN** the person picks Three takes
- **THEN** the Studio scaffold opens on its Takes with three waiting cards marked `aria-busy="true"` until the looks
  land
- Gate: `manual`

### Requirement: 390 px

At 390 px the Make box SHALL stay one row with no sideways scroll, and the menus and pops SHALL fit the width.

#### Scenario: The box at 390
- **WHEN** Projects is open at 390 wide
- **THEN** the kind, the input and Make sit in one row, and the page does not scroll sideways
- Gate: `scroll`

#### Scenario: Menus at 390
- **WHEN** the person opens the Make menu at 390 wide
- **THEN** every item is reachable without scrolling sideways, and each target is at least 44 px tall
- Gate: `manual`
