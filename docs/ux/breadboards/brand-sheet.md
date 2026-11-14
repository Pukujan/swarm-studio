# The brand sheet

Before a website or app is designed: the story, palettes, type pairings and, from a brand pack, voice, pictures and a
storyboard, side by side. Lock makes the picks the build's theme ([spec 31](../../specs/31-brand-sheet.md),
OBJECTS.md: Brand sheet, Brand pack, Theme, Lock). Statechart: `brandSheet`. Code: `web/brand.js`, the shared board
`web/board.js`, `engine/brand.mjs`, `engine/brandpacks.mjs`, `server/brand.mjs`.

It has no address of its own. It opens from the Studio scaffold's Brand card or a take's Mix, from the brief's
**Brand sheet** button in a chat, and from Make on a Brand.

## Places and affordances

```
Brand sheet  (brandSheet)                 crumb: Home › Projects › <project> › Brand sheet
                                          (a chat's sheet: Home › Projects › Chat › Brand sheet)
  top bar
  · breadcrumb: Projects ▸ <project or Chat> ▸ Brand sheet
      Projects                      ──projects──▶ Projects
      <project or Chat>             ──up──▶       where it was opened from (scaffold step, chat, Plan board, room)
  · Lock / Unlock (the one primary button)
      Lock                          ──up──▶       the picks become the theme; back where it was opened from
      Unlock                        ──(none)──▶   the sheet is editable again
  left panel
  · Chat (the talk it came from)
  board (dotted stage; Esc or a click on the empty stage clears the selection)
  · Packs section: a brand pack card (its ground, type, photos, a voice line, its button and link)
  · Story section: What · Who · Pages
  · Palette section: three palettes, each with a light and a dark sample · "Your own colours" (input)
  · Type section: three pairings, each as a real heading and paragraph · "Your own fonts" (input)
  · Voice section (from a pack): its lines in the picked look
  · Pictures section (from a pack): its photos
  · Storyboard section (from a pack): one rough frame per kind of page
  · skeleton while the options are made: Story, Palette, Type at their own sizes, Hermia's cursor on the first

Inspector  (layer, while a card is selected; ×, Esc, a click on the empty stage close it)
  · a pack: Use all · Palette · Type · Voice · Pictures      (take all of it, or one part: the mix)
  · a story line: its field (What, Who or Pages), a textarea that grows; Enter commits
  · a palette: its colours, editable
  · a type pairing: its heading and body fonts, editable
```

## Moves the statechart names

| Press | Event | Goes to |
|---|---|---|
| The brand card or Mix in the scaffold | `brand { from: 'scaffold' }` | here |
| Brand sheet in a chat's brief | `brand { from: 'draft' }` | here |
| Esc with nothing selected, the crumb's middle part, or Lock | `up` | back where it was opened from (the scaffold's step through history) |
| The crumb's Projects | `projects` | Projects |

## At 390 px

The crumb drops its `Projects ›` part (it hides below 720 px) and keeps `<project> › Brand sheet`; the sections stack
in one column on the stage; the inspector is a half sheet.

## Where the code differs

- **The last crumb reads `Brand`** (`web/brand.js:21`), not `Brand sheet`; the audit expects `Brand sheet`. The
  known list still records the older `Studio › Brand sheet` crumb, from before PR #413.
- **The Packs section is labelled `Packs`** (`web/brand.js:121`). PLANS §1 says people never see the word pack
  (OBJECTS.md, Brand pack: Open).
- **Below 720 px the crumb hides `Projects`**, so it no longer starts at Home; rule 7 has no width exception.
- **Known axe findings**: `color-contrast` (pack cards drawn in their own colours), `label`,
  `label-content-name-mismatch`.
