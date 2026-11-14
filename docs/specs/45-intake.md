# 45. Bring a game or app in

Status: **first slice built** (this spec's PR). Godot projects, crew changes to plain-file projects, the Plan
board reading a brought-in plan, and source going back to GitHub are the next slices, specified below.

The owner, 2026-11-13:
- "i was developing this game with claude before i wanna resume developing this but with our swarm instead now, how do i do this?"
- "why doesnt it load in swarm?"
- "how do i intake the game into here now that it doesnt load? through my github repo for example"
- "can they even be posted and pushed to github as repo? can they be updated?"

Why it did not load: the Studio opens only what it built. A game or app is a run (`runs/<id>/events.jsonl`
plus `runs/<id>/app/`), and nothing made a run from a folder or a repository. ARES was written by hand in
`games/ares/` of this repo, so it had no run.

The four questions ([PRODUCT.md](../PRODUCT.md)): it runs on the person's machine; nobody pays (no model is
called); git and the person's own `gh` login do the fetching; the workspace shows it as a project like any
other. Nothing is copied to a server of ours: the files go from the person's disk or their GitHub to their
own `runs/` folder.

## What the person does

1. **Projects › the Make box's kind menu › Bring in a project** (below the kinds, after a line).
2. A small sheet: **Repository or folder** (`owner/name`, `https://github.com/owner/name`, or a folder's
   path from the top or from `~`), **Subfolder** (the folder inside it; empty for all of it), **Game** or
   **App**, and **Bring in**. Enter sends it. A wrong folder is refused in the sheet, in words.
3. The sheet closes and the project's card is on Projects at once, with the crew's cursors on it and the
   status **Coming in**. A repository is fetched first; then the files are copied.
4. When the files are in, the project opens in its room (the Game room, or the App view). If the person has
   left Projects meanwhile, nothing moves under them: the card says **Brought in**.

For ARES: `Pukujan/swarm-studio` (or `~/dev/projects/hermes hackathon/swarm-studio`), Subfolder `games/ares`,
Game. Its page is `web/index.html` and its art is in `assets/` beside `web/`, so the folder to bring is
`games/ares`, not `games/ares/web`: with `web` alone the sheet says "Its page loads ../assets/ from the folder
above. Bring in that folder (ares) instead".

## The request

`POST /api/intake { repo?, folder?, path?, kind: 'game' | 'app', name?, project? }` → `{ project, run }`
(`server/bringin.mjs`, `engine/bringin.mjs`). `GET /api/intake` is older and unrelated (the Make box's
showcases, `engine/intake.mjs`).

- **repo**: `owner/name` or `https://github.com/owner/name(.git)`. Nothing else: no other host, no ssh, no
  `file:`, no name and password, no port, no query, no `tree/branch/folder` address (the folder goes in
  `path`), nothing starting with `-`.
- **folder**: an absolute path (or `~/…`) to a real folder inside the person's home folder; never the home
  folder itself, never the Studio's own `runs/`. Links are followed before the check, so a link out of the
  home folder is refused.
- **path**: the folder inside. No `..`, no `.git`, no segment starting with `-`; a link out of the project is
  refused.
- **name**: optional. Without it, the folder's own name ("ares" → **ARES**, "night_runner/dist" → **Night
  Runner**), never a folder named for its job (web, src, dist).
- **project**: an existing project's id to join. Without it, a project of the same name is joined
  ([spec 18](18-projects.md): one idea, one project); else the run is its own project.

The answer comes at once, before the files do. A folder is checked first (it exists, it has a page), so a
wrong one makes no run. A repository can only fail after it is fetched; that shows on the card (**Did not
come in**) and in the room, with git's own words.

## What comes in

- **Fetching a repository.** `git clone --depth 1 --single-branch --no-tags --no-recurse-submodules` into a
  temp folder, through `engine/proc.mjs`, with the address after `--`. With a subfolder it is a sparse,
  blobless clone of that folder only (measured on this repo: 25 s and 477 MB for all of it, a few seconds for
  `games/ares`). The person's `gh` login answers for a private repository
  (`credential.helper=!gh auth git-credential`, as `engine/publish.mjs` does); nothing is asked on a terminal
  (`GIT_TERMINAL_PROMPT=0`), Git LFS files are not downloaded, and the temp folder is removed whatever happens.
- **Copying.** Files only, into `runs/<id>/app/`. Left out by name: `node_modules`, `.git`, build output
  (`dist`, `build`, `out`, `.output`, `.next`, `.vite`, …), caches (`.godot`, `.import`), and files that hold
  keys (`.env`, `.env.*` except `.env.example`, `.npmrc`). A link to a file inside the folder is copied as
  that file; a link that leaves the folder, or names a folder, is not followed (counted in the record).
- **Limits.** 200 MB and 20,000 files, counted before anything is copied. Over either, the refusal says
  which ("More than 200 MB: bring in a smaller folder"). `games/ares` is 169 MB and 1,398 files.
- **Nothing is run.** No install, no script, no build, and git is not run inside the person's folder (its
  commit and origin are read from `.git/HEAD` and `.git/config`).
- **History.** The project's own `.git` stays out of `app/`. The run starts its own history there with one
  commit, "Brought in", as every Studio app has its own (the app engine makes the first commit of a workspace
  that has none, `engine/appbuild.mjs` `runEngine`, and depends on no earlier history).
- **A Swarm plan.** A `plan.json` in the Plan board's format (kind, cards, a name or idea) in the folder or
  one folder up is copied to `runs/<id>/plan.json`. `games/ares/plan.json` is one. **The Plan board does not
  read it yet**: it is kept so a later slice can open it.

## What is stored

The run's log, the minimum the rooms read plus where it came from:

| Event | What it says |
|---|---|
| `run:start` | `kind` (`game` or `app`), `title`, `intake: true`, and `from` when it joined a project as its game |
| `intake:start` | `source: { repo, path }` or `{ folder, path }`: what was asked for |
| `app:start` | `intake: true` and this Studio's process: the run is working, like a build (`engine/appjob.mjs` `bring`) |
| `app:step` | counting, copying n of N, starting its history |
| `intake` | `source` with the commit (`sha`; for a folder inside a git repository also `origin: owner/name`), `shape` (`static` or `vite`), `page` (the folder of its `index.html`, `''` or `web/`), `files`, `bytes`, `left` (skipped by name), `links` (not followed), `godot` and `plan` when found |
| `app:done` or `app:failed` | `intake: true`; a failure carries the message |

`runs/<id>/meta.json` names the project and the piece. A game that joins a project with a site or an app gets
`from` and a `game:linked` event on that build (marked `intake: true`), which is what the mode menu's **Game**
reads (`C.pair.game`), so the project's Game opens it. The mark keeps a later app build from wiring reward
links to a game that was never told about them.

There is no `game:spec`: the Studio did not plan this game, and nothing pretends it did. Every reader of the
spec already handles a game without one.

## How it plays

- **Plain files** (`shape: static`): `app/` is served as files from the Studio's own process on `127.0.0.1`
  (`engine/godotfirst.mjs` `serveStatic`, which now answers a folder with its `index.html`), opened on the page
  that was found. No process is started. It stops and reopens with the rest (decision 0017).
- **A Vite project** (`shape: vite`: a `package.json` that depends on `vite`): the App view shows **Install
  and run** first. Its packages and its build are code from outside, so they run only on that press (recorded
  as `intake:run`), with `pnpm install --ignore-scripts` (no package's install hook runs), then `vite build`,
  then served the way the Studio serves its own finished apps (spec 44).

## What the crew can do with it afterwards

Said plainly, because the owner's wish is to go on developing it here:

- **Plain files: nothing yet.** The app engine checks every turn by running the project's `build` script, and a
  folder with no `package.json` is "not an ABA app": the turn is reported as failed
  (`dyad/src/aba/headless_cli.ts` `runGates`; read from the code, not from a run). After a turn the Studio
  also runs `pnpm install` and Vite on it (`engine/appjob.mjs` `serve`). So a follow-up is refused in words
  ("brought in as plain files. The crew cannot change those yet"), the room's input says so instead of offering
  changes, and it is never sent to the engine. **ARES's web game is plain files**: today it plays here and its
  code shows in Code; the crew cannot change it.
- **A Vite project: a follow-up is sent**, with a prompt of its own (read the files first, keep its structure;
  not the Studio's "keep the converted design" and "add a Nitro server" rules). **Not tested with a model**:
  the request is built and the engine is the one that edits every Studio app, but no real turn has been run on
  a brought-in project.
- **Never built over.** A first build or a start over on a brought-in run is refused: it would write the
  Studio's starter into the person's files.
- Publish, Deploy to Vercel, the play test and films on a brought-in run: unchecked.

## Rules it keeps

- Local only. `server/hosted.mjs` answers 403 to `POST /api/intake` (`scripts/check.sh` checks it), and the
  kind menu is not shown there.
- The person's own git and `gh`; no token is read or stored by the Studio.
- Names only: one menu entry, one sheet with two fields, a toggle and a button. No tooltip.
- Anything loading shows the crew at work: the card has their cursors while it comes in, and the room shows
  a page's shape with a cursor on it and the step it is on.

## Not in this slice

**Godot projects.** `games/ares/` is also a Godot 4 project (`project.godot`, `scenes/`, `scripts/`); it comes
along as files and is not opened. What it would take ([docs/engines/godot.md](../engines/godot.md)):
- the person's own Godot 4 (`engine/port.mjs` `godotBin`; none on the MacBook Air, so this is a job for the
  Windows PC or the Pro) and Web export templates matching it;
- the project copied to `app/ports/godot/`, where a Godot-first game lives (`engine/godotfirst.mjs`), then
  `checkGodot` (import and a 300-frame headless run), `exportWeb`, and the export served as files;
- a refusal when the project uses GDExtension, threads or C#, which the Web export cannot run;
- **Open in Godot** (spec 38, not built) as the way to edit by hand.
A project with `project.godot` and no page of its own is refused today, in words.

**Crew changes to plain files.** The engine has an `--adopt-reason` flag that records a workspace it cannot
gate as adopted instead of failed (`dyad/src/aba/headless_cli.ts`). With it, a turn on plain files could pass;
the Studio would then skip its install and dev server and reload the files. Needs a real run to prove.

**The Plan board reading `plan.json`**, and **projects built by other tools** (Next.js, webpack: refused
today: "built by a tool the Studio does not run yet").

## The other direction: source on GitHub

What is true today:
- Every app and game run's `app/` is its own local git repository with a commit per change and no remote
  (`engine/appbuild.mjs` `runEngine` makes the first commit; the engine commits each turn; a brought-in run
  starts with "Brought in").
- **Publish › Website** makes one public repository per site that holds only the exported pages and replaces
  it on every publish (`engine/publish.mjs` `publishGitHub`: `gh repo create --public`, then
  `git push -f`). That is the published site, not the source.
- A working app deploys to Vercel (`engine/appjob.mjs` `deploy`).
- Nothing pushes an app's or a game's source to GitHub, and nothing pulls changes back.

The next slice:
- **Push source.** The run's own git history to a repository under the person's `gh` login: private by
  default, the same repository on every later push (remembered with the run, as `publishGitHub` remembers a
  site's), never a force push, never one the Studio did not make or the person did not name.
- **Pull.** For a run brought in from a repository: fetch the origin recorded in its `intake` event (`repo`,
  `path`, `sha`), and bring the new commits in as the project's next version (a new run in the same project,
  with the same limits and the same nothing-is-run rule). A folder inside a git repository records its
  `origin` too, so it can pull the same way.

## Done when

- [x] ARES comes in from `games/ares` (the folder and the repository) and plays in the Game room with its art.
- [x] A wrong repository string, a folder outside the home folder, a link out, and too many files or bytes are
      each refused in words (`tests/bringin.test.mjs`).
- [x] A brought-in run is never built over, and a plain-file one refuses follow-ups without calling the engine.
- [x] The hosted studio refuses the request.
- [ ] Godot projects, crew changes to plain files, the Plan board import, Push source and Pull.
