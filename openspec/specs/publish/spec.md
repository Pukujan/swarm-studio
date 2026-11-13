# publish Specification

## Purpose

Publish puts a version online (a website on the person's own host, a working app) and makes it ready to share: Post
to Feed and the launch kit's posts. Swarm never posts for anyone: a post opens the network's own page, and a gateway
message goes through Hermes only after the person confirms the exact text (PRODUCT.md, decision 0005,
docs/engines/hermes-and-connections.md). Breadboard: docs/ux/breadboards/publish.md. Statechart: `build.share`.

Gate tags: `breadcrumb`, `axe`, `scroll`, `console`, `loading` are the `ui-audit` checks (docs/ux/AUDIT.md); `manual`
has no gate yet. Publish's layers are not audited yet; the rooms it opens from are.

## Requirements

### Requirement: One place to publish

Publish SHALL be one button in the top bar of the Overview and every room, in the same place and at the same size in
every state (`Publish`, `Publishing…`, `Live`), and SHALL NOT show on Projects (RULES rules 4 and 29).

#### Scenario: States in place
- **WHEN** the person publishes a website
- **THEN** the button reads `Publishing…` then `Live` without moving or changing size
- Gate: `manual`

#### Scenario: Nothing to publish yet
- **WHEN** the build is not done
- **THEN** Publish is disabled, and opening its menu says in one line why
- Gate: `manual`

### Requirement: Website

The Website layer SHALL show the picked thumbnail with one-click swaps, the hosts with their state, and Publish. A host
that is not connected SHALL connect in place. While publishing it SHALL show each stage; a failure SHALL say `Not
published`, the reason in one line, Other host and Retry.

#### Scenario: Checking hosts
- **WHEN** the person opens Website
- **THEN** it reads `Checking…` with a busy marker until the hosts' states are known
- Gate: `manual`

#### Scenario: Publishing
- **WHEN** the person publishes to Vercel
- **THEN** the stages show ✓, ◌ and · as they pass, then `Live · Vercel`, the link, Copy link, Open ↗ and Post to Feed
- Gate: `manual`

#### Scenario: A failed publish
- **WHEN** the host refuses the deploy
- **THEN** the layer reads `Not published` and one short reason, with Other host and Retry; the raw output is behind
  Details
- Gate: `manual`

### Requirement: Working app

Working app SHALL be offered only when there is an app to deploy, and otherwise SHALL say why in one line
(`The app is still building.`, `Build the app first`).

#### Scenario: No app yet
- **WHEN** the version has no app
- **THEN** Working app is disabled with `Build the app first`
- Gate: `manual`

### Requirement: Post to Feed

Post to Feed SHALL offer Public or Unlisted and one button, read `Posting…` while it posts, and end on `In the Feed`
with the link. An install not linked to the Feed SHALL offer Connect Hermes with its code first.

#### Scenario: Posting
- **WHEN** the person posts a live site as Public
- **THEN** the button reads `Posting…`, then `In the Feed` and the link; one project is one Feed build (spec 18)
- Gate: `manual`

### Requirement: We never post

No control SHALL post to a social network for the person. A network post SHALL open the network's own share page with
the text filled in; a Discord, Slack or Telegram message SHALL show the channel and the exact text and send only on the
person's Send.

#### Scenario: A post to X
- **WHEN** the person presses Post on the X card
- **THEN** X's own share page opens with the text filled in; nothing is posted until the person posts it there
- Gate: `manual`

#### Scenario: A Discord message
- **WHEN** the person presses Post on the Discord card
- **THEN** a confirm shows the channel and the exact text with Cancel and Send; nothing is sent before Send
- Gate: `manual`

#### Scenario: No gateway
- **WHEN** Hermes has no Discord gateway
- **THEN** the card's Post is disabled and reads `Connect Discord in Hermes to send`
- Gate: `manual`

### Requirement: The launch kit only for what is there

The launch kit SHALL be offered only with a live link or a finished video, name the product by its brand, and never
count zeros or say "is live" without the link (REQUIREMENTS 2026-11-11, "Launch only what is there").

#### Scenario: A failed build
- **WHEN** the app step failed and there is no live link
- **THEN** no launch kit is offered
- Gate: `manual`

#### Scenario: Writing the posts
- **WHEN** the person opens the launch kit
- **THEN** it reads `Writing the posts…` with a busy marker until the cards land
- Gate: `manual`

### Requirement: 390 px

At 390 px no Publish layer SHALL make the page scroll sideways; the launch kit SHALL be one column.

#### Scenario: The menu at 390
- **WHEN** the person opens Publish at 390 wide
- **THEN** the menu fits the width and the page does not scroll sideways
- Gate: `manual`
