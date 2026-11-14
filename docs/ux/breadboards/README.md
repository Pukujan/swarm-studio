# Breadboards

Status: **draft for review** (2026-11-13). The third of the six design artifacts in [docs/PLANS.md](../../PLANS.md) §5.
The per-screen specs that go with them are in [openspec/specs/](../../../openspec/specs/).

A breadboard is a screen's wiring without its look (Shape Up, chapter 4: places, affordances and connection lines).
It says what a person can reach and press on a screen, and where each press goes. It says nothing about layout,
colour or size: that is the job of the mock-ups, the fifth artifact.

## How to read one

```
Projects                         ← a place: somewhere you can be (a statechart state)
  · Make box (input)             ← an affordance: something you can read, type into or press
  · Make  ──make──▶ Make menu    ← a connection line: the press, the statechart event, where it goes
```

- **Place.** A screen, or a layer on it that holds the person's attention (a menu, a sheet, the inspector). Each
  place names its state in [docs/ux/statechart/studio.machine.js](../statechart/studio.machine.js) where it has one.
  A menu or a sheet with no state is marked *(layer)*: it closes with ×, Esc and a click outside (RULES rule 18) and
  is not navigation.
- **Affordance.** Named as [OBJECTS.md](../OBJECTS.md) names it. A control's visible label is in quotes when it
  differs from the object's name. *(at rest)* marks what shows before anything is selected or opened; everything
  else appears on a press, a selection or a hover-free expansion (RULES rule 8).
- **Connection line.** `──event──▶ Place`. The event is the statechart's; `(none)` means the move happens inside one
  state (a selection, a layer opening). A dashed `- - ▶` is a move the statechart has and the code does not yet.
- **Every place** also has the frame's three ways out, which are not repeated: the logo (`home`), Esc (`up`, one level)
  and the breadcrumb's parts.

Each file ends with **Where the code differs**: what today's code does that the breadboard doesn't, with its file and
line. These are follow-ups, not changes made here.

## The screens

| Screen | Breadboard | Spec | Statechart state |
|---|---|---|---|
| Projects (Recent, All projects, Chats, Assets, Trash, folders) | [projects.md](projects.md) | [projects](../../../openspec/specs/projects/spec.md) | `projects.browser` |
| Make (the Make box, the kind menu, the two ways) | [make.md](make.md) | [make](../../../openspec/specs/make/spec.md) | `projects.make` and the ways |
| The Studio scaffold (step path, Layers) | [studio.md](studio.md) | [studio](../../../openspec/specs/studio/spec.md) | `scaffold` |
| The brand sheet | [brand-sheet.md](brand-sheet.md) | [brand-sheet](../../../openspec/specs/brand-sheet/spec.md) | `brandSheet` |
| The Plan board | [plan-board.md](plan-board.md) | [plan-board](../../../openspec/specs/plan-board/spec.md) | `planBoard` |
| The Overview | [overview.md](overview.md) | [overview](../../../openspec/specs/overview/spec.md) | `build.playable.room.overview` |
| The Design deck | [design-deck.md](design-deck.md) | [design-deck](../../../openspec/specs/design-deck/spec.md) | `build.playable.room.deck` |
| Setup and Settings | [setup-settings.md](setup-settings.md) | [setup-settings](../../../openspec/specs/setup-settings/spec.md) | `projects.setup`, `me.settings` |
| Publish | [publish.md](publish.md) | [publish](../../../openspec/specs/publish/spec.md) | `build.share` |

## Sources

[SITEMAP.md](../SITEMAP.md) for the tree, [RULES.md](../RULES.md) for the frame, [OBJECTS.md](../OBJECTS.md) for the
names, [the statechart](../statechart/README.md) for the events, [spec 42](../../specs/42-ways-to-make.md) for the ways
to make, [spec 41](../../specs/41-pet-cursor.md) for loading, and the code each file cites.
