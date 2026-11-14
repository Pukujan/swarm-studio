# 45. Bring a game or app in

Status: **first slice built**, and **source on GitHub built** (Push, Pull and the door inside a project: "The other
direction", below). Godot projects, crew changes to plain-file projects and the Plan board reading a brought-in
plan are the next slices, specified below.

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
  that has none, `engine/appbuild.mjs` `runEngine`, and depends on no earlier history). One exception, so the
  work can go back: the **whole** of a repository (no subfolder) whose files came in unchanged (nothing left out
  by name) carries on from that repository's newest commit, fetched alone (`git fetch --depth 1`, hooks off;
  `engine/sourcehub.mjs` `joinHistory`). The `intake` event then says `joined: true`. A subfolder, or a
  repository with files that were left out, starts with "Brought in" as before.
- **A Swarm plan.** A `plan.json` in the Plan board's format (kind, cards, a name or idea) in the folder or
  one folder up is copied to `runs/<id>/plan.json`. `games/ares/plan.json` is one. **The Plan board does not
  read it yet**: it is kept so a later slice can open it.

## What is stored

The run's log, the minimum the rooms read plus where it came from:

| Event | What it says |
|---|---|
| `run:start` | `kind` (`game` or `app`), `title`, `intake: true`, an empty `agents` list (no crew designed it), and `from` when it joined a project as its game |
| `intake:start` | `source: { repo, path }` or `{ folder, path }`: what was asked for |
| `app:start` | `intake: true` and this Studio's process: the run is working, like a build (`engine/appjob.mjs` `bring`) |
| `app:step` | counting, copying n of N, starting its history |
| `intake` | `source` with the commit (`sha`; for a folder inside a git repository also `origin: owner/name`), `shape` (`static` or `vite`), `page` (the folder of its `index.html`, `''` or `web/`), `files`, `bytes`, `left` (skipped by name), `links` (not followed), `godot` and `plan` when found |
| `app:done` or `app:failed` | `intake: true`; a failure carries the message |

`runs/<id>/meta.json` names the project and the piece. A game that joins a project with a site or an app gets
`from` and a `game:linked` event on that build (marked `intake: true`), which is what the mode menu's **Game**
reads (`C.pair.game`), so the project's Game opens it. The mark keeps a later app build from wiring reward
links to a game that was never told about them.

A game's `run:start` is of kind `game`, which is what will name its room **Game** in the mode menu once PR #495
lands (the canvas hook's `kind`, `modeOf(room, kind)` in `web/modes.js`; on main today `modeOf` takes the room
alone and the Game room is named by the room).

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
- **No keys for outside code.** A Studio app's own processes are given the person's database and Stripe test
  key (`engine/proc.mjs` `appEnv`). A brought-in project's install, build, dev server and built server get
  none of them (`engine/appjob.mjs` `appEnvFor`), and neither does the engine when it runs that project's build
  (`runEngine` `appKeys: false`). The engine still holds the Studio's own local model key while it works, as
  for every app. So a brought-in app that needs a database key will not find one yet: an owner question.

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

**Crew changes to plain files.** The route is already in the engine. Its runner works on a folder it did not
make: `--workspace <dir>` is "iterate mode: used as-is, never wiped" (`dyad/src/aba/headless_cli.ts:14`, the
flag Swarm passes for every turn), and its result says where the workspace is from: `workspaceOrigin` is
`aba-app` when it could run the build, `foreign` when it could not (`ok: false`), and `adopted` (`ok: true`,
with the `adoptReason`) when `--adopt-reason <text>` was given (`headless_cli.ts:476-500`). So the next slice
is: pass `--adopt-reason` for a brought-in plain-file run, skip the Studio's own install and dev server after
the turn, and reload the files. Read from the code; it needs one real turn on ARES to prove.

**The Plan board reading `plan.json`**, and **projects built by other tools** (Next.js, webpack: refused
today: "built by a tool the Studio does not run yet").

## The other direction: source on GitHub

Built (`engine/sourcehub.mjs`, `server/sourcehub.mjs`, `web/github.js`; tests in `tests/sourcehub.test.mjs` and
`tests/githubdoor.test.mjs`). The owner, 2026-11-14: "stilll dont see anyways to link to imporrt or export github
repos for a project?"

What was already true, and still is:
- Every app and game run's `app/` is its own local git repository with a commit per change and no remote
  (`engine/appbuild.mjs` `runEngine` makes the first commit; the engine commits each turn).
- **Publish › Website** makes one public repository per site that holds only the exported pages and replaces
  it on every publish (`engine/publish.mjs` `publishGitHub`, a force push). That is the published site, not
  the source, and it is a different repository from the one below.

### The door

One entry, **GitHub**, in a project's ☰ menu (after Export) and on its card's menu on Projects. It opens one
small sheet that says what is true in a few plain lines, and has the moves:

| The project | The sheet says | Moves |
|---|---|---|
| has an app or a game, never pushed | **Not on GitHub**, or **Brought in from owner/name/folder** | **Repository** (the project's name, to edit; `owner/name` links one that exists), **Private / Public**, **Push**; **Pull** when it was brought in from a repository |
| is linked | **owner/name** (a link) and **Private** or **Public**; **Pushed 3 min ago** or **Pulled …**; then **Changes not pushed**, **New commits to pull** or **Up to date** | **Pull**, **Push** (Pull leads when GitHub has new commits) |
| is linked, but this version has a history of its own | the same, and **This version needs a repository of its own** | **Repository**, **Private / Public**, **Push**, **Pull** |
| has no app or game yet | **No app or game here yet** | **Repository**, **Subfolder**, **Game / App**, **Bring in** (into this project, as its next version) |
| anything on its way | a crew cursor (Pip) and the step: checking, making, pushing to, pulling from | the buttons wait |

Opening the sheet asks GitHub once what its newest commit is (`git ls-remote`, 12 seconds at most); without an
answer the sheet says so and never says "Up to date". No `gh` login: **Not signed in: run gh auth login**.
A project with both an app and a game shows a **Game / App** toggle: each piece has its own repository. The
piece shown first is the open run's, else the newest.

The same moves typed in the chat, from the Design deck's chat or a project's "Tell the crew…" (only a message
that is one of these, whole): **push to github**, **pull from github**, **link owner/name**, **where is this on
github**. The answer is in the chat, with the crew's cursor while it works, and ends with the repository's link.

### Push

`POST /api/projects/<id>/github { action: 'push', repo?, public?, piece? }`.
- The run's own history goes to a repository under the person's `gh` login: `git push <address> HEAD:refs/heads/<branch>`,
  by address, with no remote written into the project's git config, hooks off, and the gh login as the only
  credential helper. **Never `--force`.**
- **The first push** makes the repository (`gh repo create`, **private** unless Public was picked; its
  description says "made with Swarm Studio") from the name in the field, only when that name is free. A name
  the person typed that is taken is refused; it is never taken over. When no name was given (the field left as
  it was, or "push to github" typed) and the project's own name is taken, which it is once Publish › Website has
  made `<login>/<name>` for the site's pages, the next free one is made: `<name>-source`, then `-source-2` to `-5`.
- **Or links one the person names** (`owner/name` or its https address), only when it is empty or its newest
  commit is already in this project's history. Otherwise: "already holds other work".
- **Later pushes** go to the same repository, remembered per project and piece in the Studio's data folder
  (`github-source.json`: the repository, private or public, the last commit sent and when). Changes not yet in a
  commit are committed first ("Changes made in Swarm Studio"); untracked packages, build output and key files
  are kept out of that commit by `.git/info/exclude`, so no file of the project changes. A key file that would
  still get into that commit (another spelling, or one already tracked and changed) stops the push before the
  commit is made, and the changes are left as they were: the Studio never commits a key file itself.
- **The repository has commits the project lacks**: refused in words ("Pull them first"), and Pull leads.
- **Keys.** Every file name in the commits being sent is read (`git rev-list --objects`, so a `.env` committed
  once and deleted later still counts). A key file (`.env`, `.env.*` except `.env.example`/`.sample`/`.template`,
  `.npmrc`, `.netrc`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `id_rsa` and its kin: intake's
  key names plus the endings) stops the push with the names, before any repository is made. What the app
  scaffold's own `.gitignore` covers: `node_modules`, `dist`, `*.local`; **not** `.env`, which is why the push
  checks. There is no way in the Studio yet to take a key file out of a history: an owner question.
- While the crew is working on the run, a push is refused ("try again when they are done").

### Pull

`POST … { action: 'pull' }`, for a project that is linked or was brought in from a repository (the `intake`
event's `repo`, `path`, `sha`; a folder inside a git repository records its `origin`).
- GitHub is asked for its newest commit. The same one as last time, or one already in the project's history:
  **Nothing new on owner/name**, and no run is made.
- For a subfolder, GitHub is asked whether anything under it changed between the two commits (`gh api
  repos/…/compare`); when nothing did: **Nothing new in games/ares on owner/name**. When GitHub does not say
  (more than 300 files changed, or no answer), the pull goes ahead.
- Otherwise the repository comes in through intake itself (`bringIn`, the same limits, the same names left out,
  nothing run) as **the project's next version**: a new run in the same project. The whole of a repository
  carries its history on (above), so the next push is an ordinary one on top of what was pulled.
- **Nothing is merged.** Changes made here and not pushed stay in the older version; the new version is what
  GitHub has.
- **What a pulled version is.** It is a brought-in run, with everything that means above: a pulled **game**
  joins the project's site as its game (the Overview keeps its pages). A pulled **app** is a version of its own
  with the app only: the earlier version's designed pages are not in it, it is given none of the person's
  database or Stripe keys, a Vite project waits for **Install and run**, and it is never built over. For an app
  the Studio built itself that is a real cost of pulling, and the reason Push is the ordinary direction for
  work made here. Seen in the walk-through: the card's status becomes **App · Brought in**.
- A version whose history could not be carried on (files were left out on the way in) cannot be pushed to that
  repository; the sheet says so and offers a repository of its own.

### Bring in from inside

`POST … { action: 'bring', repo, path?, kind }`, only for a project with no app or game source: the repository
comes into **this** project (its name is the project's). ARES: open the ARES project, GitHub, `Pukujan/swarm-studio`,
Subfolder `games/ares`, Game. A subfolder is pull-only: its first push makes a repository of its own
(`<login>/ares`), never the one it is a folder of. Projects › **Bring in a project** is unchanged.

### Who may start it

- The person's own click or typed words in the Studio, or `/swarm github [n] [push|pull] [owner/name|name] [public]`.
- **The model** (the `swarm_studio` tool, `action: github`, `move: push`) goes through Hermes's approval
  prompt first, as publish, deploy and post do (`commands.py` `outward`, `approval_hook`), and is refused in a
  cron job with nobody there. A rule each, so an "always" for one is never another: a private push
  (`swarm-studio:github:push:private`), a new public repository (`…:public`), and each named repository its own
  (`…:named:<owner/name>`).
  `move: status` and `move: pull` are not asked about: nothing leaves the computer but the question, and
  nothing that comes in is run.
- **Never on the hosted studio**: `server/hosted.mjs` answers 403 to GET and POST (`scripts/check.sh` checks
  it), the menu entry is not there, and the typed moves are ordinary messages.
- The server is not replaced or stopped for being idle while a push or a pull runs (`workRunning`).

### Not verified, and not built

- **Not verified against the real GitHub.** The tests and the walk-through use bare repositories in a folder
  and a stand-in `gh`. `gh repo create`, the credential helper on a private repository, the compare request and
  GitHub's own refusal words have not been run for real.
- No merge, no branches (the repository's default branch only), no pull requests, no unlink in the sheet
  (linking another repository by name replaces the link).
- A project brought in from Projects before this slice, whole, has a "Brought in" history: it can be pulled,
  and pushed only to a repository of its own until a pull carries the history on.

## Done when

- [x] ARES comes in from `games/ares` (the folder and the repository) and plays in the Game room with its art.
- [x] A wrong repository string, a folder outside the home folder, a link out, and too many files or bytes are
      each refused in words (`tests/bringin.test.mjs`).
- [x] A brought-in run is never built over, and a plain-file one refuses follow-ups without calling the engine.
- [x] The hosted studio refuses the request.
- [x] Push source and Pull: the door in a project's menu, the typed moves, the refusals (`tests/sourcehub.test.mjs`).
- [ ] The same against the real GitHub, once, by the owner.
- [ ] Godot projects, crew changes to plain files, the Plan board import.
