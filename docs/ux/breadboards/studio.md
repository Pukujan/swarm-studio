# The Studio scaffold

A Studio project before its first build: the kind's steps as sections on one board, a step path across the top, the
chat and Layers on the left ([spec 37](../../specs/37-studio-first.md), [spec 42](../../specs/42-ways-to-make.md),
SITEMAP §5c). Statechart: `scaffold` (steps `brand · references · assets · pages · lock`). Code: `web/scaffold.js`,
the shared board `web/board.js`, the kits `web/kit-*.js`, `engine/studio.mjs`, `server/studio.mjs`.

Reached from Make by **Studio**, **Scaffold** (only the Plan step) or **Three takes** (Takes first), and from a
Studio project's card on Projects.

## Places and affordances

```
Studio scaffold  (scaffold.<step>)                 crumb: Home › Projects › <project> › Studio
  top bar
  · breadcrumb: Projects ▸ <project>
  · Build (the one primary button; the kit's, hidden when the kit has none)
                                    ──built { run }──▶ the Design deck (design-deck.md)
  step path (at rest)
  · a step chip: state dot (Empty, Started, Done, Skipped) and name
                                    ──next / up──▶ that step (the board brings it into view; inspector: step actions)
  · Lock chip                       ──(none)──▶ the Lock section
  · + <Name> (a removed step)       ──(none)──▶ the step is back, in the kit's order
  left panel
  · Chat (the planner: "Start with X", and why)
  · Layers: a group per section, its cards as rows (arrows, Enter, F2 rename, Delete)
  · Layers (icon, ≤ 760 px)         ──(none)──▶ Layers sheet
  board (dotted stage: drag pans, wheel or pinch zooms, Esc or a click on the empty stage clears)
  · Three takes section (mode takes): three take cards
  · Brand section: the brand card   ──brand { from: scaffold }──▶ the brand sheet (brand-sheet.md)
  · References section: a reference card · + Add reference · drop files here
  · Assets section: an asset card · + Add asset · drop files here
  · Plan section: the kit's own cards (a website's pages, an app's screens, a deck's outline, a film's storyboard)
  · Lock section: the Idea card
  · waiting card (first load, aria-busy)

Inspector  (layer, while a card or a step chip is selected; ×, Esc, a click on the empty stage close it)
  · a step: Skip / Bring back · Remove           (Lock has none)
  · a take: its line · Use this take             ──(none)──▶ it becomes the project's brand; mode becomes studio
            · Mix                                ──brand { from: scaffold }──▶ the brand sheet
  · a reference: Use as given (→ Assets) · Remove
  · an asset: Role (logo, product, photo, font, pack, other) · Use as reference (→ References) · Remove
  · a kit card: the kit's own controls (rename, remove, fields)
  · the Idea: the idea in full
```

## Moves the statechart names

| Press | Event | Goes to |
|---|---|---|
| A step chip, or a card inside a step | `next` / `up` (the address follows the step) | that step |
| Esc with nothing selected | `up` | the step before; from the first, Projects |
| The brand card, Mix | `brand { from: 'scaffold' }` | the brand sheet; its Esc comes back to this step (history) |
| Build | `built { run }` | the Design deck, the crew at work |

## At 390 px

The left panel becomes the Layers sheet behind its button; the step path scrolls inside itself, never the page; the
inspector is a half sheet over the stage.

## Where the code differs

- **The breadcrumb** reads `Projects › <project>` (`web/scaffold.js:48`), with no `Home` and no room name. Known
  violation `studio breadcrumb`.
- **The crumb's last word.** The spec follows AUDIT.md's expected `… › Studio`; OBJECTS.md proposes **Studio first**
  for the scaffold, so that the bare word keeps meaning the plugin. The owner's call.
- **Esc on a step goes to Projects**, not to the step before: `C.up` sends `home` from the scaffold
  (statechart README, difference 6).
- **Step names.** The code's steps are `plan` and `proposal` (`web/nav.js:22`), shown as Plan and Lock
  (`web/scaffold.js:18`); SITEMAP and the statechart say `pages` and `lock`. The Plan step's content is the kit's
  (pages for a website, screens for an app), so its chip reads Plan for every kind.
- **The waiting card's class `wait-in`** at `web/scaffold.js:173` is the shared skeleton, with `aria-busy`; spec 41
  says Hermia works on it.
- **Known axe findings** on this screen: `label`, `label-content-name-mismatch`, and `button-name` at 390
  (`.ui-audit-known-violations.json`).
