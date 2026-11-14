# Open Design

Glue: engine/brandpacks.mjs, engine/brand.mjs, engine/odlibrary.mjs, scripts/import-od-library.mjs, engine/prompts.mjs, engine/lint/index.mjs, engine/lint/artifact.mjs, engine/deck.mjs, engine/handedit.mjs, web/edit/patches.js, web/project.js, server/deck.mjs, web/kit-deck.js, scripts/import-od-systems.mjs, scripts/import-od-decks.mjs
Status: built in

Open Design is a whole design app (daemon, CLI, MCP, Electron desktop) at https://github.com/nexu-io/open-design, Apache-2.0 (engine/opendesign/NOTICE:4-8). Swarm does not run it. Swarm ships copies of its data and one ported file, pinned to commits, with licences beside them (docs/specs/35-open-design.md:227-237). Its editing tools (Edit, Comment, Tweaks, Draw) are decided but not yet brought in (docs/decisions/0010-open-design-tools.md:14-19, docs/PLANS.md:84-90).

## What it already does

- Daemon on `127.0.0.1:7456`; `od` CLI and `od mcp` are thin clients of it (docs/specs/35-open-design.md:44-58).
- Delegates its agent loop to a code-agent CLI; Hermes is one adapter, spawned as `hermes acp --accept-hooks` (docs/specs/35-open-design.md:66-72).
- 151 design systems: `manifest.json` + `DESIGN.md` + `tokens.css`; about 85 named after real brands, about 60 generic (docs/specs/35-open-design.md:23, 96-98).
- html-ppt decks (MIT, upstream lewislulu/html-ppt-skill): 36 themes, 15 full decks, one HTML file per deck (docs/specs/35-open-design.md:130-133).
- Export HTML, PDF and PPTX (pptxgenjs, or dom-to-pptx in Electron); PDF/PPTX need the desktop runtime, only HTML works headless (docs/specs/35-open-design.md:52-55, 137-141).
- Edit: injected bridge + `source-patches.ts` inside a 20k-line React host (docs/specs/35-open-design.md:154-161). It also has a `set-token` patch (rewrite a CSS variable) Swarm has not ported (docs/specs/35-open-design.md:169-170).
- Comment AI turns a comment into a scoped prompt; Draw sends a PNG snapshot with marks; Tweaks is a panel the agent writes inside the page between `EDITMODE-BEGIN/END` markers (docs/specs/35-open-design.md:171-177).
- 169 skills, 115 design templates, 272 plugin skills, 107 prompt templates (docs/specs/35-open-design.md:202-203).
- HyperFrames is HeyGen's npm package, not Open Design's; Open Design only pins it (docs/specs/35-open-design.md:190-191); it is the default film engine (docs/decisions/0011-hyperframes-default-video.md:20).

## What Swarm has taken today

| What | Where | From (commit) | Licence |
|---|---|---|---|
| All 152 design systems as brand packs (colours, fonts, radius, first theme line), the brand-named ones too | engine/opendesign/packs.json | open-design `59e4f2a` (engine/opendesign/NOTICE:3-6); the generic ones mostly via bergside/awesome-design-skills `f631a09` (engine/opendesign/CREDITS.md:3) | Apache-2.0 + MIT (engine/opendesign/NOTICE:8-12) |
| Each system's tokens without colours or fonts, a DESIGN.md rules digest and its component groups | engine/opendesign/systems.json | open-design `59e4f2a` (engine/opendesign/NOTICE:14-21) | Apache-2.0 |
| 25 of 36 html-ppt deck themes (shape, colour tokens, decoration rules) | engine/opendesign/decks.json | open-design `bc06128`, `design-templates/html-ppt/` (engine/opendesign/NOTICE:29-32) | MIT, Copyright (c) 2026 lewis (engine/opendesign/LICENSE.html-ppt:1-3) |
| html-ppt class names and type/grid/card sizes, rescaled to 1920 x 1080 | engine/deck.mjs:123-152 | same (engine/opendesign/NOTICE:41-44) | MIT |
| `source-patches.ts` + `types.ts` ported to plain JS | web/edit/patches.js | open-design `6147958` (web/edit/NOTICE:3-5) | Apache-2.0 (web/edit/NOTICE:7) |
| `lint-artifact.ts` (the slop linter) ported to plain JS, rules and messages unchanged; the display-face rule is read in one pass instead of upstream's expression, whose time grew with the square of the document (engine/lint/artifact.mjs `displaySans`, tests/lint.test.mjs) | engine/lint/artifact.mjs | open-design `59e4f2a` (engine/lint/NOTICE:3-6) | Apache-2.0 (engine/lint/LICENSE) |
| Craft and anti-slop rules, condensed into the builders' prompt and the reviewer's; the reviewer's 0-10 score, pass mark 8 and 3 rounds from Critique Theater's defaults (no code) | engine/prompts.mjs, engine/review.mjs | open-design `59e4f2a` (engine/opendesign/NOTICE, last entry) | Apache-2.0; craft/ itself adapts refero_skill (MIT) |
| The library: 169 skills, 115 design templates, 272 plugin skills, 106 prompt templates, each with its licence; texts gzipped | engine/opendesign/library.json, engine/opendesign/library-texts.json.gz | open-design `59e4f2a` (engine/opendesign/NOTICE, the library entry) | Apache-2.0 unless an entry names its own (MIT and others, kept per entry) |
| Two skills, unmodified: `threejs`, `shader-dev` | gameskills/opendesign/ | open-design main `87a4f91` (gameskills/README.md:10, 79-80) | Apache-2.0; upstream MIT (gameskills/opendesign/threejs/LICENSE.upstream:1-3) |

- Dropped from design systems: colours and fonts from the tokens (the brand sheet's palette and type win), the rest of DESIGN.md, components.html, previews, Tailwind files (engine/opendesign/NOTICE:14-23).
- Non-Google fonts swapped, each swap kept in the pack's `dropped` field (engine/opendesign/NOTICE:19-20).
- Voice, picture style, storyboard and "who it is for" are Swarm's, per kind of look (engine/opendesign/NOTICE:21-22, engine/brandpacks.mjs:75-83).
- Not taken from html-ppt: `runtime.js`, animations, presenter window, templates (engine/opendesign/NOTICE:42-44).
- The patch port changes: section fragment instead of a document, child-index path ids, no brand-kit or runtime overrides, an added `move-element` patch, guards on script links, event handlers and style values (web/edit/NOTICE:9-12).

## How Swarm drives it

No Open Design code runs. Swarm reads the copied files.

- Brand packs: `odPacks()` reads packs.json and merges kind defaults; `BRAND_PACKS` puts Swarm's five own packs first (engine/brandpacks.mjs:78-87). The board shows an imported look only when suggested or picked, and shows three options at most, the suggested first and the picked one always among them (engine/brandpacks.mjs:132-141, decision 0015). The planner's "why" never says "pack" to the person: `noPack` turns it into "option" (engine/brandpacks.mjs:129). `applyPack(brand, slug, parts)` fills the brand sheet (engine/brandpacks.mjs:175).
- Decks: `DECK_LOOKS` from decks.json (engine/deck.mjs:21-24). `outlineFrom` builds slides from story beats, storyboard frames or the brief (engine/deck.mjs:37-57). `draftDeck` asks the planner through Hermes for JSON slides, else returns the outline (engine/deck.mjs:221-241). `deckVars` puts the locked brand's colours and fonts over the look's shape (engine/deck.mjs:78-96). `deckHtml` gives one self-contained HTML file with present mode; `deckPdf` prints it with headless Chrome (engine/deck.mjs:168-200). Routes: server/deck.mjs:1-10. Board: web/kit-deck.js (docs/specs/35-open-design.md:399-416).
- Edit (the Overview's Inspector): `swEdit.tree`, `read`, `apply`, `pathId` (web/edit/patches.js:88-178), called from web/project.js:505-577. Patches: set-text, set-link, set-image, set-style, set-attributes, remove-element, move-element (web/edit/patches.js:12-16).
- The slop linter: every section a builder finishes is linted with Open Design's rules plus Swarm's own for Tailwind classes and the Studio's chrome hues (engine/lint/index.mjs:1-8, engine/lint/rules.mjs:1-6); P0 findings send it back to that builder for one fix pass, kept only when it breaks fewer of them (engine/run.mjs, `lintFix`); what is still P0 at review joins the reviewer's issues (server/server.mjs, `linted`). Four upstream rules for whole pages and decks are left out (engine/lint/NOTICE:9-11). Copy the planner gave word for word is not flagged (engine/lint/index.mjs, `COPY`).
- A look from an Open Design system brings its whole system: `brandTheme` puts its tokens beside the colours in the theme's variables, which every page sets (engine/brand.mjs, `systemOf`), and `systemLine` tells each builder the tokens and the rules digest (engine/prompts.mjs). A section that uses none of the tokens is a `tokens-unused` finding, handed to the reviewer (engine/lint/index.mjs, server/server.mjs).
- The library, chosen as Open Design chooses (engine/odlibrary.mjs:1-11): the person picks a design template (a build request's `template`; the list at `GET /api/library/templates`); the sitemap planner reads a short catalogue of the skills that fit the brief, at most 8, none when nothing fits, and names up to 2; only their text, shortened, goes to the page planners, never to the builders (engine/run.mjs, `offered`, `skillTexts`). A prompt template that fits a picture or a clip strongly adds one sentence to its prompt, never against a photo style (engine/artdirect.mjs `promptFor`, engine/media.mjs).
- The look, in Open Design's order: a design system the request names (`system`, a pack slug), then the project's locked brand, then the planner's default (server/server.mjs, `requestedBrand`; engine/brand.mjs).
- Hand changes are saved as section versions; `handChanges` + `keepHand` tell the crew to keep them on a rework (engine/handedit.mjs:7-22, server/server.mjs:2432).
- Re-sync is a dev-only script against a sparse checkout; output is committed, nothing fetched at install (scripts/import-od-systems.mjs:4-12, docs/specs/35-open-design.md:347-360).

## Decided, not brought in yet

- Owner: use Open Design's Edit, Comment, Tweaks and Draw; Draw replaces Scribble (docs/decisions/0010-open-design-tools.md:14-19). This overrules spec 35's "Keep ours" (docs/specs/35-open-design.md:6-9, 25).
- Today only the patch engine is theirs. Comment is Swarm's pins, Scribble is ported from kresilo, not Open Design (engine/marks.mjs:1-3).
- Gaps: no tools in the Studio walk, no Tweaks, no Draw, no marks on references, no outline on the picked part, no resize handles (docs/PLANS.md:84-90).
- Their tools are HTML-only; games and rendered video need their own (docs/decisions/0010-open-design-tools.md:23, docs/PLANS.md:112).

## What the person connects

Nothing. No key, account or download; the data ships in the plugin (docs/specs/35-open-design.md:229-234). plugin.yaml declares nothing for it (plugin.yaml:11-57).

## Limits inside Swarm

- Driving `od` or its MCP is rejected: second Hermes in ACP mode with its own provider, `--accept-hooks`, reads `~/.hermes/auth.json`, telemetry on by default (docs/specs/35-open-design.md:79-87, 296-298).
- No PPTX: engine/deck.mjs leaves it out (engine/deck.mjs:10-11).
- In 18 of 53 systems `DESIGN.md` has placeholder colours; looks differ mostly by font (docs/specs/35-open-design.md:327-331).
- A re-sync changes new picks only; locked brands are copies (docs/specs/35-open-design.md:360).
- The deck crew does not build on the canvas with cursors yet; the planner writes slides in one call (docs/specs/35-open-design.md:417-419).

## Open questions

- How the port of Edit/Comment/Tweaks/Draw is shaped (their bridge and host are React and srcdoc-bound) is not specified anywhere. Unchecked: no spec or PR found; settle with the owner (docs/specs/35-open-design.md:165-168).
- Which engine renders decks, and PPTX/PDF export (PptxGenJS candidate) are open (docs/PLANS.md:142-148).
- Spec 35 section 2 says skip bergside "no licence"; section 6 corrects it to MIT (docs/specs/35-open-design.md:123-124, 324-325).
- Unchecked: how `source-patches.ts` changed since `6147958` (docs/specs/35-open-design.md:317). Settle by diffing upstream.

## Sources

- engine/opendesign/CREDITS.md, NOTICE, LICENSE, LICENSE.bergside, LICENSE.html-ppt, packs.json, decks.json (headers)
- web/edit/patches.js, web/edit/NOTICE, web/edit/LICENSE; engine/handedit.mjs; engine/deck.mjs; engine/brandpacks.mjs; engine/marks.mjs (header)
- server/deck.mjs (header), server/server.mjs:2432, web/project.js:505-577, web/kits.js
- scripts/import-od-systems.mjs (header), gameskills/README.md, gameskills/opendesign/
- docs/specs/35-open-design.md, docs/specs/37-studio-first.md, docs/decisions/0002, 0003, 0010, 0011, docs/PLANS.md, docs/PRODUCT.md, AGENTS.md, plugin.yaml
