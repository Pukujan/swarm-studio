# Instructions for coding agents in this repository

**Read [docs/PRODUCT.md](docs/PRODUCT.md) first:** what Swarm is, what runs where, and the standing rules.

## Engines: read the page, never guess (owner, 2026-11-12)

Swarm drives engines (Dyad, Godot, Meshy, the video and sound engines, Open Design, Hermes and its
connections). Each one has a page in [docs/engines/](docs/engines/README.md): what it already does, how Swarm
drives it, what the person connects, the limits, and the sources for every claim.

- Before you say what an engine can or can't do, or add code or a library around it, read its page. Cite the
  page or its sources in your answer and in the PR.
- If the page doesn't cover it, say "not documented, unchecked", check the engine's own code or docs, and add
  what you found to the page with its source.
- Never build something an engine already does. Swarm hands the engine the brief; it doesn't redo its work.
- CI (`engine-docs`) fails a PR that changes an engine's glue code (the files on its page's `Glue:` line)
  unless the PR updates that page or names it in the description ("Read docs/engines/dyad.md").
- A Claude Code hook (`.claude/settings.json`, `scripts/engine-docs-hook.mjs`) adds "read docs/engines/…"
  to any message that names an engine.

## Dependencies: use mature ones (owner, 2026-11-12)

Use a mature, maintained, widely adopted dependency wherever one solves the problem. Don't reinvent what a
library already does well. Build something custom only when nothing fits, and say why in the PR.

"No npm dependencies", "no build step" and "no framework" describe how the first version was built. They are
not goals, and they are no reason to hand-roll something.

The real constraints that come with a dependency:

- **Pinned, bundled or disclosed.** Anything the plugin downloads or runs on a person's machine is pinned to
  an exact version, bundled, or disclosed (the Nous catalog rules). When you add one, update `plugin.yaml` and
  the README's "What it does on your machine".
- **Size and licence.** Mind the install size and the licence.
- **Nothing new downloaded at build time.** A build may not fetch a new runtime download.

Checks before a PR: `bash scripts/check.sh`; for code in `web/`, also `npm ci --prefix tools/dev` once, then
`npm run --prefix tools/dev typecheck` (files that start with `// @ts-check`; a new web file starts with it) and
`npm run --prefix tools/dev deps` (no new cycles beyond `.dependency-cruiser-known-violations.json`; an area
folder under `web/canvas/` is used only through its `index.js`).
No orphan code: `npm run --prefix tools/dev orphans` fails when a file under `web/`, `engine/` or `server/` is reached
by nothing that runs (the servers, the page's lists in `server/page.mjs`, a test, a script, a pack), and
`npm run --prefix tools/dev orphans:ui` ([knip](https://knip.dev), after `npm ci --prefix ui`) when `ui/` has a file
nothing imports, an export nothing uses or a package nothing needs. To fix a failure, delete the dead code or use
it: a new web module goes in `server/page.mjs`'s list, a new program somebody runs by hand is named as an entry in
`.dependency-cruiser-orphans.mjs`. knip sees only `ui/`: something in `ui/src` that only a test in the root `tests/`
uses is reported, since the page never uses it; test it through what the page does use, or move the test to `ui/test/`.
Never add to the known lists (`.dependency-cruiser-orphans-known.json`, the
`ignoreIssues` in `ui/knip.jsonc`) to pass: they hold what was there when the check arrived and only get shorter.
The Studio's theme variables are design tokens: change `tokens/*.tokens.json`, run `npm run --prefix tools/dev tokens`
and commit `web/tokens.css` and `ui/src/theme.css` with them; never edit either by hand (`tokens:check` fails a stale one).
The Studio is moving to React in `ui/`, served at `/next/` ([decision 0013](docs/decisions/0013-react-ui-coexists.md)).
For code in `ui/`: `npm ci --prefix ui`, then `npm run --prefix tools/dev typecheck:ui`, `deps:ui` and `ui:check`
(`npm run --prefix ui build` makes `ui/dist/` for `/next/`; never commit it: CI builds it and only a release carries it,
[decision 0018](docs/decisions/0018-next-ui-build-on-release.md)). [ui/README.md](ui/README.md) is how a screen moves.
CI's `motion-check` compares the Studio's motion before and after (docs/ux/MOTION.md), and `motion-parity` compares a screen moved to /next/ with / (docs/ux/motion/parity-known.json lists the known differences). CI's `ui-audit` checks
every top-level screen against the rules a machine can check (docs/ux/AUDIT.md). A new violation fails; a
known one is in `.ui-audit-known-violations.json`.

Before changing anything a person sees (anything in `web/`, the Feed's screens, dialogs, menus, copy), read:

1. [docs/ux/RULES.md](docs/ux/RULES.md): the UI and UX rules, and the checklist to run before a UI PR.
2. [docs/ux/PATTERNS.md](docs/ux/PATTERNS.md): which mature product each screen follows (Figma for the Design
   deck), the fixed frame, the social patterns, reference frames and the checks.
3. [docs/ux/AUDIENCE.md](docs/ux/AUDIENCE.md): the two homes, the six lenses and who each is for.
4. [docs/ux/INVENTORY.md](docs/ux/INVENTORY.md): every control, its layer and its lens. Update it when you add,
   move or remove one.
5. [docs/ux/SITEMAP.md](docs/ux/SITEMAP.md): the full tree of screens and the flow for each audience. Update it
   when you add a layer or move a branch.
6. [docs/ux/REQUIREMENTS.md](docs/ux/REQUIREMENTS.md): the owner's own words. They win over any spec that
   disagrees.

Two names, used the same way in code, copy and docs (owner, 2026-11-11): the **Overview** is a project's pages
and files (`web/project.js`); the **Design deck** ("Canvas" in the mode menu) is where the crew is watched at work
and a page is designed (`web/canvas/`, one file per area; [web/canvas/README.md](web/canvas/README.md) says which;
`web/canvas.js` only loads them). Never call the Overview a canvas.

Specs for individual features live in [docs/specs/](docs/specs/README.md).

<!-- oio:issue-log-guidance:start -->
Before filing an observational or operational issue log, read `.oio/ontology/ISSUE_LOG_ONTOLOGY.md`, `.oio/ontology/project.json`, and `.oio/ontology/AGENT_GUIDE.md`. Confirm the exact destination and filing action are authorized. On OIO, ACS, CGM, and PCM, do not submit an issue or write files without explicit human direction for that destination and action. A proposal can remain a local draft until directed. Never treat adoption as permission to write to an adopter or sibling repository.
<!-- oio:issue-log-guidance:end -->
