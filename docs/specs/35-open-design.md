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
