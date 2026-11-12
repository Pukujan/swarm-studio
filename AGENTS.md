# Instructions for coding agents in this repository

**Read [docs/PRODUCT.md](docs/PRODUCT.md) first:** what Swarm is, what runs where, and the standing rules.

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
`npm run --prefix tools/dev deps` (no cycles; an area under `web/canvas/` is used only through its `index.js`).
CI's `motion-check` compares the Studio's motion before and after (docs/ux/MOTION.md).

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
and a page is designed (`web/canvas.js`). Never call the Overview a canvas.

Specs for individual features live in [docs/specs/](docs/specs/README.md).

<!-- oio:issue-log-guidance:start -->
Before filing an observational or operational issue log, read `.oio/ontology/ISSUE_LOG_ONTOLOGY.md`, `.oio/ontology/project.json`, and `.oio/ontology/AGENT_GUIDE.md`. Confirm the exact destination and filing action are authorized. On OIO, ACS, CGM, and PCM, do not submit an issue or write files without explicit human direction for that destination and action. A proposal can remain a local draft until directed. Never treat adoption as permission to write to an adopter or sibling repository.
<!-- oio:issue-log-guidance:end -->
