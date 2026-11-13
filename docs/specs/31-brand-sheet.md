# 31. The brand sheet

The owner, 2026-11-12, after the Night Runner session, where the colours a talk agreed never reached the site:
- "do this and option for idk pre chosen picture and mood and feel with brand voice storyboard idk"
- "so we dont waste tokens on something we dontwant"

A website or an app can have a **brand sheet** before any page is designed: a board of cards that settles
what it is, who it is for, and how it looks and sounds. It is optional. The talk's brief offers it, and
**Build** still works without it. What is chosen and locked on the sheet is what the crew builds: the
locked colours and type become the site's theme as they are, and the reviewer checks the build against them.

Spec 27 owns the talk's turns, and spec 29 owns the chat record. The sheet is kept on that record as
`brand`, a field this spec owns. The game's Plan board (spec 21, `web/plan.js`) and the brand sheet are the
same board with different cards: the same dotted stage, labelled sections, artboards and one primary button
in the top bar. The game session owns the Plan board's cards.

The UI rules in [docs/ux/RULES.md](../ux/RULES.md) apply:
- names only, calm;
- no tooltips;
- no blue, purple or green in the Studio chrome. The swatches are the person's colours, not chrome.

## The board

| Section | Cards | What a card shows |
|---|---|---|
| Story | What, Who, Pages | One line each; the pages as their names |
| Palette | 2–3 options side by side | Background, text, accent and link swatches; a light and a dark sample, each with a heading, a line, a button and a link |
| Type | 2–3 options side by side | A real heading in the heading font over a paragraph in the body font |
| Voice *(slice 3)* | 2–3 options | Two sample lines each |
| Pieces *(slice 3)* | Button, card, form field | Drawn in the chosen palette, type and corners |
| Pictures *(slice 3)* | 2–3 styles | Painted samples (engine/artdirect.mjs STYLES) |
| Storyboard *(slice 3)* | One frame per page | A rough frame with its headline |

- Selecting a card opens the inspector on the right, as on the Plan board. For a palette, it holds the four
  colours as inputs. For type, the two font names. For the story, its lines.
- Each section also takes the person's own words, for example "cream, warm grey, terracotta and forest
  green". The words become one more option, and it is picked.
- The primary button is **Lock**. Once the sheet is locked, it reads **Unlock**. Lock needs a palette and a
  type option picked. Back in the chat, the brief's **Build** builds from the locked sheet.
- Changing anything on a locked sheet unlocks it.

## Where it comes from

`engine/brand.mjs`:
- `brandOptions({ brief, chat })`: one planner call returns the story and three palettes and three type
  pairings as JSON. The JSON is validated: colours must be hex, and text must be readable on its
  background (it is fixed when it is not).
  - Colours the brief names (`namedColours`) are in the first palette, and the other options vary around them.
  - With no model, the options come from the named colours and a short built-in list, so the board still
    works offline.
- `paletteFromWords(text)` turns a person's words into a palette.
- `brandTheme(brand)`: the picked palette and type become a full theme. It fills `--background`,
  `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--border`,
  `--accent`, `--card`, `--link` and the fonts.
- `checkBrand(theme, brand)`: the reviewer's check. It returns the locked colours the theme no longer has,
  and a type pairing that changed.

Routes (`server/brand.mjs`):
- `POST /api/brand { chat?, brief, kind }` makes the options. A missing chat is created, for a brief that came from a
  showcase.
- `GET /api/brand/:chat`.
- `POST /api/brand/:chat/pick { part, id | words }`.
- `POST /api/brand/:chat/edit { part, id, values }`.
- `POST /api/brand/:chat/lock` and `/unlock`.

Every write goes through the chat store's per-chat queue.

## Into the build

`/api/run` with a chat whose `brand.lockedAt` is set passes `brand` to `runSwarm`:
- the sitemap call is told the story and that the look is locked;
- the planner's theme is replaced by the locked theme as it is (no `fitTheme`, no recent-look variety);
- after planning, `theme:check` reports `checkBrand`. A follow-up that asks for another look still
  re-themes, and the next version starts from that.

## Slices

1. **Palette, type and story cards with Lock**, the locked look as the theme, and the reviewer's check. This
   closes the Night Runner colour fault: the rat-site brief (cream, warm grey, terracotta, forest green)
   gives a cream site.
2. **Packs**: ready-made sets of picture style, mood and feel, voice and storyboard, shown as a gallery of
   cards that look like themselves. Examples: warm editorial, clean product, bold event, quiet portfolio,
   playful community.
   - Picking a pack fills the board, every part stays swappable, and a mix works.
   - The planner pre-selects two or three packs, each with a one-line reason.
   - Packs are data, and they reuse the Feed's packs (`packs.get.ts`, `pack`/`packSlug` on builds) rather
     than a second concept. Their pictures are the art director's STYLES and the stock library.
   - Websites mostly get realistic people or a mature painted look. Anime is one option, not the default.
3. **Voice, pieces, picture samples and the storyboard strip.** References and Scribble (spec 29) work on
   the board.

### Slice 1, built (2026-11-12)

- `engine/brand.mjs`, `server/brand.mjs` (routes on the shared chat store), `web/brand.js` and `web/brand.css`. The board
  is the mode `brand` in web/studio.js, opened with `C.brand({ chat, brief, kind, done })`.
- The talk's brief, and the Make box's guided brief, offer **Brand sheet** for a website or app.
- `/api/run` and `/api/auto` read the chat's locked sheet on the server. The request cannot pass one in.
  `runSwarm({ brand })` takes the locked theme as it is, and `theme:check` carries `brand: { off, fonts }`.
- Checked live on a test server with the rat-site brief. The planner's first palette was cream, warm grey,
  terracotta and forest green. Locked, the build's theme was `#f6f1e7` with terracotta buttons and forest-green
  links, in DM Serif Display and Karla. The check found nothing missing, and the build planned the sheet's six
  pages.
- Not yet: the planner suggesting the sheet, and an app build's own screens (the App pipeline's design step
  builds the site from the sheet; appjob's screens do not read it yet).

### Slice 2, built (2026-11-12)

- `engine/brandpacks.mjs` holds five packs as data: Warm editorial, Clean product, Bold event, Quiet portfolio and
  Playful community. Each pack has:
  - a palette;
  - a type pairing;
  - corners;
  - a voice with two sample lines;
  - a picture style (Film photo, from STYLES) with a mood and subjects;
  - a storyboard of four frames.
- Slugs have the Feed's pack form (`swarm.packs.slug`). The Studio does not post `pack` to the Feed yet: the Feed
  accepts only slugs it lists.
- The sample pictures are three photos per pack from the shipped stock library (engine/stock/library.json).
  - They are picked by the pack's mood, subjects and people, and by the brief's words.
  - No photo appears on two packs, and a pack never shows two takes of the same shot.
  - No model call and no credits are used.
- The board's planner call also returns `packs: [{ slug, why }]`. Only real slugs are kept, two or three of them.
  With no model, the brief's words choose them.
  - The suggested packs come first, each with its reason under the card.
- The board has a **Packs** gallery on top. Each card is drawn in the pack's own ground, type, photos, voice line,
  button and corners.
  - Clicking a pack uses all of it.
  - The inspector offers **Use all**, or one part: **Palette**, **Type**, **Voice** or **Pictures**. That is the mix.
  - A pack's palette and type join the sheet's options, so any option can still be picked.
- A pack that is used shows **Voice**, **Pictures** and **Storyboard** sections.
  - `POST /api/brand/:chat/pick { part: 'pack', id, parts? }` uses a pack, or only the parts named.
  - The view carries `packs`, the cards.
- The locked brief tells the build the voice (its lines) and the picture style (the STYLES guide). The art
  director's `pickStyle` reads it as Film photo.
- Not yet:
  - a painted pack (a mature painted look) needs painted samples, which are slice 3's Pictures;
  - editing the voice and the storyboard frames.


### In the next UI (2026-11-13)

- The sheet is the first screen moved to React (`ui/src/screens/brand/`, #404; decisions 0013 and 0014), drawn at
  `/next/?room=brand&project=<id>&step=<step>` from the same routes. It is not what people see until the owner
  switches the room on.
- A project's sheet, opened from its Studio, now has that address in both apps (`web/nav.js`), and a reload
  reopens it (`web/next.js`). A sheet opened from a chat still has none.
