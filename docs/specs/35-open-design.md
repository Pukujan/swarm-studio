# 35. What to take from Open Design

The owner asked (2026-11-12): why rebuild what Open Design already ships and maintains? This spec answers
it after reading their code. It is a recommendation only. Nothing is integrated yet; the owner decides.

- Repo read: `nexu-io/open-design` at **`bc06128813c99fa63f5af53ad2c903c27db057f2`** (2026-11-12, root
  `package.json` 0.25.1; latest release 0.27.1 of 2026-11-10). Apache-2.0, about 107k stars, 12k forks,
  1,395 open issues.
- How: a shallow clone read with grep and cat. I installed nothing and ran none of their code.
  `npm view` and `gh release` were run for package and installer facts, and `hermes acp --help` on this Mac.
- Paths below are in their repo unless they start with `engine/`, `web/` or `docs/` (ours).

## Summary

| Area | Theirs | Ours | Verdict |
|---|---|---|---|
| Driving it from our crew (`od` CLI, MCP) | A daemon on port 7456. The CLI and MCP are thin clients of it. It runs its own agent and makes some model calls itself. | Our server, with model calls through Hermes | **Not now** (at most an "Open in Open Design" hand-off later) |
| Design systems (151) | `manifest.json` + `DESIGN.md` + `tokens.css` per system. About 85 are named after real brands; about 60 are generic styles. | 5 brand packs, plus the brand sheet board | **Use their data only**: the generic styles, as extra packs |
| Decks and export | `html-ppt` (MIT): 36 themes and 15 decks, one HTML file per deck. PPTX and PDF export need their Electron app. | None (planned "like Gamma") | **Use their data only** (themes and templates), plus our own small exporter |
| Edit / Comment / Tweaks / Draw | Edit is an injected bridge plus `source-patches.ts`, inside a 20k-line React host | Manual edit (#309) is already a port of their `source-patches.ts`. We also have comment pins, Variables and Scribble. | **Keep ours**. Re-sync patch kinds from upstream now and then. |
| HyperFrames video | HeyGen's npm `hyperframes`: HTML + GSAP, rendered with headless Chrome + ffmpeg | Director, storyboard, music cuts, film critic | **Keep ours** |
| Skills and templates | 169 skills, 115 design templates, 272 plugin skills | Planner prompts, gameskills | **Use their data only**, picked one at a time with credit (as we already do for 2) |
| Sharing, collaboration, references, storyboards | Collaboration is cloud-only ("vela"), one writer per project, live cursors were cut. Storyboards are a `storyboard.md` the agent writes. | Many agents with visible cursors, the Feed, References, Story cards | **Keep ours** |

**Short answer for the owner:** Open Design is a whole app with its own agent loop, its own project store and
a paid cloud. It is not an engine that sits under ours the way Godot does. What we should take from it is its
**data**: design systems, deck themes and some skills. That data is permissive, plain files, and costs nothing
to run. We already took its edit-mode code, which is the one piece that lifts out cleanly.

## 1. What another agent can drive

**The CLI.** `od` is `apps/daemon/bin/od.mjs`, which loads `../dist/cli.js` (source `apps/daemon/src/cli.ts`,
about 13k lines).

- It is not on npm: `npm view open-design` and `npm view @open-design/daemon` both return 404.
- So you get it one of two ways. One is the desktop installer: 431 MB on Mac arm64, 451 MB on Mac x64,
  466 MB on Windows x64 (GitHub release 0.27.1). The other is building the pnpm monorepo from source: Node 24,
  pnpm 10, with native `better-sqlite3`, `node-pty`, `sharp`, `onnxruntime-node` and `@ffmpeg-installer/ffmpeg`.
- `od` with no subcommand starts the daemon (Express, `127.0.0.1:7456`). Every other subcommand is an HTTP
  client of that daemon. The ones that matter to us:
  - `od project create --name --skill --design-system --json`
  - `od run start --project <id> --message --agent --model --follow --json`
  - `od run watch <runId>` (an ND-JSON event stream on stdout)
  - `od files list|read|write`
  - `od export <file> --format html|pdf|image|pptx --out`
  - `od daemon start --headless`
- **Headless:** partly. The daemon runs with no GUI (`od daemon start --headless`; `deploy/Dockerfile` runs
  `cli.js --no-open`). Export does not: `apps/daemon/src/import-export-routes.ts:1000` says "requires the
  desktop runtime — there is no headless renderer in a bare daemon yet", and answers 501. Only HTML export
  works headless.

**The MCP server.** `od mcp` (`apps/daemon/src/mcp.ts`) is a stdio server that "proxies project tool calls to
the running daemon" and "holds no state". With no daemon running, every call fails with "daemon not reachable".

- Tools: `create_project`, `list_projects`, `get_project`, `list_files`, `get_file`, `search_files`,
  `write_file`, `delete_file`, `create_artifact`, `get_artifact`, `start_run` (returns a runId), `get_run`
  (status, previewUrl, agentMessage), `cancel_run`, `list_skills`, `list_plugins`, `list_agents`,
  `collect_brief`, `confirm_brief`, and `start_vela_login` / `get_vela_login_status` (their cloud account).
- The file tools make no model calls. `start_run` does.

**Hermes and models.** Open Design does not run a model loop of its own. It "delegate[s] the entire agent loop
… to the user's existing code agent CLI" (`docs/agent-adapters.md`).

- Hermes is one of about 30 adapters (`apps/daemon/src/runtimes/defs/hermes.ts`), spawned as
  `hermes acp --accept-hooks`.
- On this Mac, `hermes acp --help` says `--accept-hooks` means "Auto-approve unseen shell hooks without a TTY
  prompt".
- Going the other way, `od mcp install hermes` only prints a YAML snippet and says "Hermes config format is
  unverified" (`mcp-agent-install.ts`).
- The daemon also makes model and API calls of its own: BYOK chat proxy (`routes/chat.ts`), memory extraction
  (`memory-llm.ts`, with ANTHROPIC/OPENAI keys from the environment), `design/finalize-design.ts`, media
  generation, and Tavily research. `media/config.ts` reads the xAI token from `~/.hermes/auth.json`.

**Does that fit the Nous review?** No. Five reasons:

1. Point 2 (model calls through `ctx.llm`): a run would spawn a second Hermes in ACP mode. That Hermes uses its
   own configured provider, not our plugin's slots, and the daemon also calls providers directly.
2. Point 3 (minimal env to children): their daemon passes its own env to the agent.
3. Point 6 (the person approves risky steps): `--accept-hooks` skips the hook prompt.
4. Reading `~/.hermes/auth.json` is exactly the kind of reach into Hermes that the review rejected.
5. Release builds send telemetry by default (`PRIVACY.md`, "on by default"; endpoints `telemetry.open-design.ai`
   and `amr-api.open-design.ai`).

Unverified: what `hermes acp` does with Swarm's plugin loaded, and whether a from-source build carries a
telemetry key.

## 2. Feature by feature

### Design systems: use their data only

- One system is `design-systems/<slug>/manifest.json` (`od-design-system-project/v1`, schema in
  `_schema/manifest.schema.ts`), `DESIGN.md` (nine sections, from visual theme to an agent prompt guide), and
  `tokens.css`. Richer ones add `design-tokens.json`, `tailwind-v4.css`, `components.html` and `preview/`.
  The whole folder is 38 MB, most of it translations and previews.
- **Mapping to our pack** (`engine/brandpacks.mjs`: palette bg/text/accent/link, type heading/body, radius,
  voice, pictures, storyboard):
  - palette: `--bg` → `bg`, `--fg` → `text`, `--accent` → `accent`; for `link` use `--accent` or `--link`
    where it exists
  - type: `--font-display` → `heading`, `--font-body` → `body`
  - radius: `--radius-md` → `radius`
  - the `DESIGN.md` "Do's and Don'ts" and "Agent Prompt Guide" sections become the planner's design notes
- **What is lost:** our packs carry real sample pictures (stock with credit), voice lines and a storyboard.
  Theirs have none of these: no voice field and no logos. Those parts would come from our art director and a
  default voice per category. Many of their fonts are commercial (Stripe's is "Söhne"), so the importer must
  fall back to a font we ship.
- **Which ones:** only the generic styles, about 60. They include brutalism, neobrutalism, minimal, editorial,
  retro, paper, dithered, cafe, doodle, fantasy, cosmic, glassmorphism, claymorphism, bento, spacious, luxury,
  corporate, hud and trading-terminal.
- **Leave out the ~85 named after real brands.** Examples: Stripe, Apple, Linear, Tesla, Ferrari, Nike, OpenAI,
  Claude, and also `pacman` and `tetris`.
  - Their README calls them "aesthetic inspirations, not official assets".
  - A person's site dressed as "Stripe" breaks our own rule (original content only, `docs/specs/README.md`).
    It is also a trademark risk on the Feed.
- **Licence and credit:**
  - The packages are Apache-2.0 as part of the repo, and every manifest says "OpenDesign curated bundled
    fixture". There are no per-system licence files.
  - Exceptions: `kami` credits tw93/kami (MIT); `cloudflare-kumo` is MIT; and some content came from
    VoltAgent/awesome-design-md (MIT) and bergside/awesome-design-skills (no licence stated). Skip any system
    traced to bergside.
  - There is no root NOTICE file, so the obligation is their LICENSE plus a NOTICE of our own naming the source
    commit and what we changed (as `web/edit/NOTICE` does).

### Decks and export: use their data only

- The deck look they ship is `design-templates/html-ppt/` (upstream lewislulu/html-ppt-skill, **MIT**, 8.6 MB):
  - 36 theme CSS files (`assets/themes/`: swiss-grid, editorial-serif, pitch-deck-vc, magazine-bold, nord…)
  - 15 full decks (`templates/full-decks/`: pitch-deck, product-launch, weekly-report…)
  - each deck is one HTML file of `class="slide"` sections, with no JSON
- The "deck skill under its own licence" is `design-templates/guizang-ppt/LICENSE`. It is **MIT** (op7418),
  not a proprietary licence. Their `skills/pptx|docx|pdf` are stubs that link to Anthropic's repo and bundle
  no code.
- Export, in their code:
  - HTML: a Blob or a daemon route.
  - PDF: `window.print()` or Electron `printToPDF` (`apps/desktop/src/main/pdf-export.ts`).
  - PPTX: `pptxgenjs` 4.0.1 with one picture per slide (`apps/daemon/src/deck-export.ts`), or an editable PPTX
    through a vendored `dom-to-pptx` (MIT) injected into Electron.
- **Can our crew make a deck through them?** Only by running their desktop app, and that is the dependency we
  reject in section 1.
- **Can our crew make a deck from their themes? Yes.** Our crew writes `.slide` sections from the locked brand
  (palette, type, voice) and the Story cards, with a theme file as the base. Our page-shot frame already
  rasterises sections. A PPTX of one picture per slide needs only `pptxgenjs` (MIT, 2.6 MB unpacked, depends
  on jszip and image-size), vendored and pinned like `web/vendor/xstate`. PDF is the browser's print.

### Edit, Comment AI, Tweaks, Draw: keep ours

- **How theirs is built:**
  - `apps/web/src/edit-mode/bridge.ts` (1,368 lines) is plain JS injected into the preview's `srcdoc`, and
    talks to the host by `postMessage`.
  - Before injection, `apps/web/src/runtime/srcdoc.ts` (4,433 lines) tags elements with `data-od-id` and
    `data-od-source-path`.
  - The host (`apps/web/src/components/FileViewer.tsx`, 20,759 lines) applies `source-patches.ts` (739 lines)
    to the source HTML through DOMParser, then saves it.
  - It works in a frame with `sandbox="allow-scripts"` and no `allow-same-origin` (`srcdoc.ts:998`), the same
    rule as ours.
- **Ours is already theirs where it counts.** `web/edit/patches.js` is a port of `source-patches.ts` and
  `types.ts` from their commit 6147958, with NOTICE and LICENSE (spec 29).
  - What we did not take: their bridge and host. Those are tied to React and to their srcdoc annotation, and our
    canvas has its own element picker.
  - Replacing #309 with "theirs" would mean adopting that 20k-line host. The person gets nothing new: the patch
    engine is the same one.
  - Worth doing: diff `source-patches.ts` against 6147958 now and then. Their `set-token` patch (rewrite a CSS
    variable) is the natural back end for our Variables.
- **Comment AI = our comment pins.** A comment becomes a prompt block ("Hard scope: change ONLY the elements
  identified below…", `apps/daemon/src/runtimes/chat-prompt-inputs.ts:585`). That is the same idea as ours.
- **Draw** (`PreviewDrawOverlay.tsx`, 2,008 lines) sends a snapshot PNG with marks drawn on it. Scribble
  (`engine/marks.mjs`) goes further: it anchors each mark to the element under it.
- **Tweaks** is a panel the agent writes inside the page (`/*EDITMODE-BEGIN*/…/*EDITMODE-END*/`,
  `packages/contracts/src/prompts/official-system.ts:102`). Our Variables does this from outside the page,
  which is safer in a sandboxed frame.

### HyperFrames video: keep ours

- HyperFrames is HeyGen's npm package `hyperframes`, not Open Design's: their daemon pins 0.8.1, and npm's
  latest is 0.9.39, 25 MB unpacked. The npm licence field says Apache-2.0.
- A video is an HTML file with `data-start` / `data-duration` and a paused GSAP timeline
  (`design-templates/hyperframes/SKILL.md`). It renders with headless Chrome (puppeteer) and ffmpeg, and needs
  Node 22+, sharp and onnxruntime.
- Our film engine already has more of what matters: the director's six kinds (`engine/director.mjs`), a beat
  sheet with cuts on the music (`engine/storyboard.mjs`), and the media reader as the critic.
- HyperFrames could later render motion-graphics type cards as an optional engine. It does not replace the
  director.

### Skills and templates: use their data only, one at a time

- Counts: `skills/` has 169 SKILL.md files, `design-templates/` 115, `plugins/` 272. There are 107 video and
  image prompt templates in `prompt-templates/`, and 13 craft guides in `craft/`.
- Format: SKILL.md with YAML frontmatter, the same shape as our gameskills.
- Ones worth reading for our planners:
  - `brand-guidelines`, `brand-extract`, `brandkit` (MIT)
  - `frontend-design` (Apache-2.0)
  - the `gsap-*` set (MIT)
  - `social-carousel` and `card-*` (posts)
  - `saas-landing`, `pricing-page`, `waitlist-page`
  - `sprite-animation`, `gamified-app`
- Keep our planner prompts and gameskills. They are wired to our engines. Theirs assume their daemon's tools.
  Copy single files with their licence beside them, as `gameskills/opendesign/` already does.

### Other things we are about to build

| Ours, planned or built | Theirs | Verdict |
|---|---|---|
| Story cards and film | `storyboard.md` the agent writes | Keep ours |
| References | A "reference board with page capture" in the desktop app (`RELEASE-NOTES-0.10.0.md`) | Keep ours |
| Sharing | Public share links through their cloud; deploy to the person's Vercel or Cloudflare | Keep the Feed |
| Collaboration and many agents | Cloud-only (`OD_COLLAB_CLOUD_URL`), one writer, "live cursors were cut" (`apps/web/src/collab/collab-client.ts:6`) | Keep ours: this is what sets Swarm apart |
| Brand as the project's foundation | A design system per project | Ours, fed with their generic systems |

## 3. How each "Use theirs" would ship

All three ship as **data copied with credit**. None ships as an engine.

| Piece | Form | On disk | What runs on the person's machine | Nous scan and catalog | Windows | Not installed |
|---|---|---|---|---|---|---|
| Design systems (about 60, English `DESIGN.md` + `tokens.css` + manifest) | Copied once by a dev-only script, pinned to a commit, with LICENSE + NOTICE | Roughly 1–2 MB without translations and previews (estimate) | Nothing: we read JSON/CSS/MD | Static files, nothing fetched or run | Same | Nothing to install |
| Deck themes and templates (`html-ppt`, MIT) | Copied, pinned, MIT licence beside them | 8.6 MB whole; the themes alone are much smaller | The browser renders HTML | Static files | Same | — |
| `pptxgenjs` (only if PPTX is wanted) | Vendored, pinned build, like `web/vendor/xstate` | About 2.6 MB unpacked | JS in our server or page | One more vendored dependency to list; nothing fetched at build | Pure JS | PPTX button hidden; HTML and PDF still work |
| Skills (one at a time) | Copied with licence, as `gameskills/` does | Kilobytes | Nothing: prompt text | Static files | Same | — |

The import script runs on a developer's machine and its output is committed. Nothing is fetched when the person
installs or builds. That is the review's first rule.

If the owner ever wants the full app: treat it like Godot. The person installs the Open Design desktop app,
and Swarm offers "Open in Open Design" through `od project import-folder`. It must never be a dependency, and
Swarm must never drive its runs (section 1).

## 4. Risks

- **Pace:** fast and pre-1.0.
  - Releases 0.25.0 (2026-10-15) to 0.27.1 (2026-11-10), about one a week.
  - `CHANGELOG.md` stopped at 0.9.0; current notes are in `docs/CHANGELOG/`.
  - The `od` CLI promises a major bump for breaking changes (`docs/plugins-spec.md:1282`), but 0.x makes that
    weak.
  - `apps/edit-mode-demo`, which their own spec cites, is gone at this commit.
  - **Data copied at a pin does not break when they move.** A live dependency would.
- **Lock-in:** none for data. Driving their daemon would bring a second idea of a project (`app.sqlite` rows and
  `.od/projects/<id>`) next to ours (spec 18), plus their account for sharing.
- **Brand-named systems:** trademark and look-alike risk on the Feed. Leave them out (section 2).
- **Licences:**
  - Apache-2.0: keep their LICENSE, add a NOTICE saying what we took and changed, and keep their attributions.
  - MIT parts (html-ppt, guizang-ppt, dom-to-pptx, gsap skills): keep each licence file.
  - Things not to take:
    - `tools/pack/resources/win/7zip/` (LGPL, with an unRAR restriction)
    - `apps/web/public/fonts/` (157 font files, some with no licence file, such as JiduMonoPro)
    - the `webgl-*` plugin effects, credited to Codrops, licensing unclear
    - anything traced to bergside (no licence)
- **Their cloud and terms:**
  - Paid "Design Plan" subscriptions: the 0.27.1 notes advertise "Start creating from $8" and referral "Reset
    Cards".
  - Accounts through `amr-api.open-design.ai`; telemetry on by default in release builds.
  - No terms of service in the repo; no CLA (`CONTRIBUTING.md:267`).
  - None of this touches a data-only import. All of it would touch a plugin that drives their app.

## 5. Recommendation

**Adopt, cheapest large win first:**

1. **Generic design systems as brand packs.** About 60 extra looks on the brand sheet for a day's work. They
   are data, credited and pinned.
2. **Deck themes and templates (html-ppt).** This replaces building a deck engine "like Gamma" from nothing. The
   crew writes slides from the locked brand and story. Add PPTX only if the owner wants it (vendored
   `pptxgenjs`).
3. **A periodic re-sync of `source-patches.ts`** into `web/edit/patches.js`, starting with `set-token` for
   Variables.
4. **Single skills as planner context**, one PR each, with their licence.

**Stop building:**
- a deck theme set of our own
- hand-authored brand packs beyond the five, until the imported ones are in

**Keep:**
- our edit, pins, Variables and Scribble
- the film engine
- planners and gameskills
- the many-agent canvas with cursors
- the Feed
- the whole launch from one idea

**Do not:**
- drive `od` or its MCP from the crew
- ship their app
- import the brand-named systems

**First slice, one day:**

- `scripts/import-od-systems.mjs` (dev-only) reads a pinned checkout and writes `engine/brandpacks-od.json`.
  For 12 chosen generic systems it writes palette, type, radius, a design-notes paragraph from `DESIGN.md` and
  a category. It adds a voice and picture tags we write.
- `engine/brandpacks.mjs` merges them after our five.
- `engine/opendesign/LICENSE` and `NOTICE` record the commit and what was changed.
- The brand sheet lists them under "More looks". Fonts fall back to ones we ship.
- Done when: a website build from one imported pack locks, builds and passes the reviewer's brand check.

**Not verified:**
- That `od export` makes PDF or PPTX headless. Their code says it does not; I did not run it.
- What `hermes acp` does with our plugin loaded.
- HyperFrames' licence file itself (only npm's licence field).
- The exact on-disk size of a trimmed design-system import.
- Release dates before 0.25.0.
- Whether any generic system was itself copied from a source without a licence.
- How their source-patches changed since 6147958: the shallow clone has no history.

## 6. Built: the brand packs (2026-11-12)

- **53 looks** are in `engine/opendesign/packs.json`, converted by `scripts/import-od-systems.mjs`. Credits are in
  `engine/opendesign/CREDITS.md`; Open Design's Apache-2.0 `LICENSE`, bergside's MIT `LICENSE.bergside` and a
  `NOTICE` sit beside it. No real brand, product, person or game is among them.
- **Correction to section 2:** most generic systems came to Open Design from `bergside/awesome-design-skills`.
  That repo is **MIT** (Copyright (c) 2026 Bergside), checked at `f631a09`. Its licence ships with ours.
- **Their data is thinner than it looks.**
  - In 18 of the 53, `DESIGN.md` has no colours of its own: they are the upstream placeholder
    (`#3B82F6 / #8B5CF6 / #FFFFFF / #111827`), or missing. The importer reads `tokens.css` for those.
  - In many systems, `tokens.css` is one of a dozen shared fixtures and does not match the system's own
    `DESIGN.md`.
  - What tells the looks apart is mostly their fonts.
- **What our format drops:** the components, spacing and type scales, motion, shadows, the anti-patterns list,
  translations, previews and Tailwind files. Their "Voice & Brand" text is the same boilerplate in every system,
  so it is dropped too.
- **What we wrote ourselves:** a voice, a picture style and a storyboard for each kind of look (11 kinds), plus
  who each look is for and the words that suggest it.
  - Picture styles: mostly film photo; a painted look (gouache, watercolour) for story and art looks; concept art
    for the future looks; pixel art for retro.
  - Anime is on one look only (`od-creative`), never a default.
- **Fonts:** every font is a Google Fonts family. Twelve packs had a font swapped, and each swap is recorded on
  the pack (`dropped`):
  - eleven display faces used as body text got a reading face;
  - Google Sans was not on the importer's list of Google Fonts families, so it became Plus Jakarta Sans.
- **What the person sees:** our five packs first, plus only the two or three looks the planner (or the brief's
  words) suggests, plus the one they picked. The planner reads all 58.

### Re-syncing from upstream later

1. Sparse-checkout Open Design at the new commit, using the commands in the header of
   `scripts/import-od-systems.mjs`. Only `manifest.json`, `DESIGN.md` and `tokens.css` are needed (about 23 MB).
2. Set `COMMIT` in the script, then run `node scripts/import-od-systems.mjs <checkout>`. The script warns when
   the checkout is at another commit.
3. Read the diff of `packs.json`:
   - a system whose colours or fonts changed is a look that changed under people's locked brands;
   - a removed system leaves the pack in `PICK`, and the script prints `missing`.
4. Check whether any new generic system is worth adding to `PICK`. Never add one named after a brand.
5. Update the commit in `NOTICE` and `CREDITS.md` (regenerate `CREDITS.md` with the same table), then run
   `node --test tests/brandpacks.test.mjs`.

Locked brands are copies, so a re-sync changes only new picks, never a brand someone has already locked.

## 7. Built: the Deck kind, data and engine (2026-11-12)

A deck is 16:9 slides made from the project's brand and its story. This part is the data and the engine; the
kit on the board (`web/kit-deck.js`) comes next, on the spec 37 contract.

- **The looks (`engine/opendesign/decks.json`, 24 KB):** html-ppt's themes (MIT, Copyright (c) 2026 lewis,
  shipped in Open Design under `design-templates/html-ppt/`) converted by `scripts/import-od-decks.mjs`.
  - The brand gives the colours and fonts. A look gives the shape: corners, shadows, letter spacing and its
    decoration (a twelve-column grid, a glow, thick borders). Colours in the decoration that were the theme's
    own tokens now point at the brand's.
  - 25 of the 36 themes are kept. The eleven left out (Dracula, Nord, Catppuccin and the like) differ only in
    colour, which the brand replaces. The plain one (Minimal White) is first and takes the brand's corners;
    the others keep their own, so a Bauhaus deck stays square.
  - Each look carries its source path; the commit and licence are in the file's header, `NOTICE`,
    `CREDITS.md` and `LICENSE.html-ppt`.
- **The engine (`engine/deck.mjs`):**
  - The outline, one line per slide, starts from the film storyboard's beats when there are any, else the
    brand sheet's storyboard frames, else the brief. A title slide is always first and the call to act last.
  - Nine layouts in html-ppt's class names: title, section, points, steps, stats, two columns, quote,
    picture, end. Text is escaped; a picture must be `https://` or one of the project's files.
  - The HTML export is one file: styles and the present-mode script inline, fonts from Google Fonts (the
    only thing it fetches, like a built site). Keys: arrows, space, Page Up/Down, Home/End, F for full
    screen, Esc. The slide number is in the address, so a link opens on that slide.
  - The PDF is the same file printed by the headless Chrome that `engine/seo.mjs` finds for page shots: one
    1920 × 1080 page a slide, no new download. No Chrome, no PDF button; nothing breaks.
- **Left out: PowerPoint.** A clean `.pptx` needs a zip writer and a shape-by-shape slide model. A `.pptx`
  made of slide pictures would be easy, but it cannot be edited, which is the only reason to want one. The
  PDF and the HTML cover showing and sending.
- **Not taken from html-ppt:** its runtime (`runtime.js`), animations, presenter window, theme switcher and its
  31 single-page and 15 full-deck templates. The templates are mostly Chinese demo text; our layouts are
  written fresh in the same class names, so the looks' decoration still applies.

Re-syncing is the same as for the packs: sparse-checkout `/design-templates/html-ppt/` too, run
`node scripts/import-od-decks.mjs <checkout>`, read the diff, and run `node --test tests/deck.test.mjs`.

## 8. Built: the Deck kit on the board (2026-11-12)

`web/kit-deck.js` is the Deck's Plan step on the spec 37 contract (`deckKit`, prefixed names, like
`web/kit-app.js`). Like the App kit, it is joined into the page when `web/kits.js` lands with the Studio
scaffold; that file gets one line for it.

- **Outline:** a line per slide; editing the lines renames, adds and removes slides, and the end slide stays
  last. It starts from the build's story (spec 39, `runs/<id>/story.json`) when the Studio passes `run`, else
  the brief's own list, then the planner's slides replace it unless the person has already edited.
- **Storyboard:** every slide, small. The server draws each one (`/api/kit/deck/render`) and the board shows it
  in a sandboxed frame with no script. The inspector edits the layout, text, points, steps, numbers, quote and
  notes, and moves, adds or removes the slide.
- **Theme:** the two or three looks the brief's words suggest (the planner's pick first), each drawn as the
  title slide in the project's brand, plus More looks with all 25.
- **Start:** Title slide, Outline or One key slide; the key slide is where Present opens.
- **Export:** Present covers the window with the deck in a frame sandboxed to scripts only; its keys work, F goes
  full screen, Esc or Close come back. HTML and PDF are written into `projects/<pid>/deck/` and downloaded
  with the studio's token (the API needs it, so a plain link would not open).
- **Lock and Build:** Lock puts the deck under `spec.kits.deck`; Build writes the HTML and the PDF. Nothing is
  posted.
- **Not done here:** the crew building the slides on the canvas with cursors, as it builds pages. Today the
  planner writes the slides in one call through Hermes and the board shows them as they land. Showing the
  crew at work needs the canvas build to know a deck, which is the canvas session's to add.
