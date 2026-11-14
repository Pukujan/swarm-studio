# 0018. The next UI's build is made by CI and committed only on a release

- Date: 2026-11-13
- Status: accepted
- Changes: [decision 0013](0013-react-ui-coexists.md)'s "Its build, `ui/dist/`, is committed"

## Context

Decision 0013 committed `ui/dist/` with every change to `ui/`, so installing the plugin builds nothing. On
2026-11-13 eleven screen ports were open at once. Every merge rebuilt the two minified files in `ui/dist/`, so every
other port conflicted with main, and a PR that was rebuilt conflicted again by the time its CI finished. A built file
can't be merged, only rebuilt. The owner asked for this to stop before the merge train went on.

Two facts settle where the build can live:

- The catalog installs a release branch (`release/0.3.x`, [decision 0008](0008-releases-stable-pin.md)), and
  `hermes plugins install` clones it, so only tracked files reach a person's machine. The pinned commit must carry
  the built files.
- Main requires the `checks` status before anything lands on it. A commit that CI pushes with its own token gets no
  status (its pushes start no workflow), so main refuses it.

## Decision

*(our wording)*

- **Main and pull requests carry no `ui/dist/`.** It is in `ui/.gitignore`. A port commits source only.
- **CI builds it** wherever `/next/` is served or read: `checks` (Linux, Windows, macOS) and `ui-audit` run
  `npm ci --prefix ui && npm run --prefix ui build` first and set `SWARM_NEED_UI`, so `scripts/check.sh` and
  `tests/next.test.mjs` fail if it is missing. Without that flag (a fresh clone), they skip `/next/` and say so.
- **`ui:check` builds and inspects.** On a branch it builds `ui/dist/` and checks that it makes the one-document
  `/next/` page. On a release branch, which carries the build, it fails if the committed files differ from a fresh
  build.
- **A release commits it.** Moving the pin (its own reviewed change, 0008) merges main into the release branch, then
  runs `node scripts/release-ui.mjs`, which builds `ui/dist/` and commits it there. It refuses to commit on main. The
  `release` workflow fails a push to `release/**` whose `ui/dist/` is missing or stale. **Installing the plugin still
  builds and downloads nothing:** the pinned commit holds the files, as before.
- **The macOS job installs what a release would.** It runs `scripts/release-ui.mjs` in its own checkout before
  `hermes plugins install`, so every pull request is checked against an installed copy that carries `ui/dist/`.

### Not chosen

- **`ui/dist/** merge=ours` and a rebuild in CI.** A merge driver lives in each clone's git config. GitHub's merge
  button and its "this branch has conflicts" don't use it, so the PRs would still conflict.
- **CI commits the build to main after each merge.** Main would refuse the push (above). Each merge would also
  become two commits, and a PR opened in between would conflict with the bot's commit.

## Consequences

- Ports no longer conflict on `ui/dist/`. They still meet in a few shared source files (`ui/src/screens/index.ts`,
  `ui/vite.config.ts`, `ui/tsconfig.json`, `.ui-audit-known-violations.next.json`), which a real merge resolves;
  making each port touch only its own files there is a separate change.
- A clone of main answers 404 at `/next/` until `npm run --prefix ui build` runs. `/` is unaffected, and `/next/` has
  no door for a person until a room is switched on.
- Moving the pin takes one more command.
- `engine-docs` now diffs from main as it is, not from the commit a pull request was opened against, so a branch
  that merges main in is charged only with its own changes.
