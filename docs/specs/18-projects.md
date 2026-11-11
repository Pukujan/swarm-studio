# 18. One idea, one project, one name

A person asked for "ARES" with a website and a player app. It became two Studio projects and two Feed posts, and the app was named after its first screen: the title, the `package.json` name and the Vercel project all became "Sign In to ARES". The rule: **one idea is one project with one name, everywhere. Nothing is ever named after a screen.**

## The project name

Each project has one `name` (`engine/naming.mjs`, stored in `runs/folders.json` as `projects.<pid>.name`):

1. the name the start request gave (`project` in the run or Auto start body);
2. the brand from the brief: the words before `—`, `–`, ` - `, `:` or `,`, or a capitalised name at the start, with piece words taken off the end ("ARES Player Hub — …" → **ARES**, "Atelier Nord client portal for …" → **Atelier Nord**), or a name after "for", "called" or "named";
3. a brand the run gave itself (a game spec's brand), then the run's own start title;
4. the brief's first words ("a tiny ramen bar in Osaka" → "Tiny Ramen Bar").

Never a page or screen title. A **screen word** (sign in, log in, sign up, home, dashboard, welcome, untitled, index, admin, account, profile, settings…, also "Sign In to ARES", "Welcome to Tempo", "Admin panel") is never used as a project, package or deploy name. A rename sets the name too, unless the new title is a screen word. A run keeps its own piece title ("ARES Player Hub"); the project name is shared.

## Joining a project

A new run joins an existing project that is not in Trash when:

- the start request names it: `project` (its id or its name) in `POST /api/run` or `POST /api/auto`; optional `piece` (`site`, `app`, `game`, `film`) says which piece it is; or
- its brief's brand matches a project's name exactly (case-insensitive).

Otherwise the old "same idea asked again" match still applies, but only when the brief names no other brand. A run joins as a **piece** of its kind; a run of a kind the project already has is that piece's next version. A game made from a site (`card.from`) stays a part of that site's version.

The project card (`GET /api/projects`, `GET /api/projects/<id>`) adds `name` and `pieces: [{ kind, runId, title, live, versions }]`, one per kind, each its newest run; `live` is its public URL or `null`. Each entry in `versions` says its `piece`. `GET /api/runs` adds `project: { id, name }` and `piece` to each run.

## Names everywhere

- Export and app package name: the project name's slug (`ares`).
- Vercel (and Cloudflare) project: `<project>-<kind>`, `ares-app`, `ares-site`, `ares-game`.
- Feed title: the project name.

## The Feed contract (`POST /api/feed/builds`)

Optional fields, on top of today's body:

| Field | When | What |
|---|---|---|
| `project: { name }` | the first post of a project | the project's one name (also the post's `title`) |
| `piece: { kind, title, liveUrl, poster, runId }` | every post | the piece this run is: `kind` is `site`, `app`, `game` or `film`; `title` the run's own title; `poster` a data URL |
| `into: <buildId>` | a later piece of a project already on the Feed | the head build the piece goes into (no `project` field then) |

The Feed stores the pieces on the head build and shows **one card with tabs**, one tab per piece. Answering an `into` post, it returns the head build: `{ ok, id: <the into id>, url, uploadUrl? }` (`uploadUrl`, if given, takes this piece's export zip). The first post answers as today, `{ ok, id, url, uploadUrl }`.

The plugin (`feed.py`) remembers `projects: { <project id>: <feed build id> }` in `feed.json`. Until the Feed knows these fields, posting still works: a `400` (or an unknown-field answer) makes it send today's single post without `project`, `piece` and `into`. A `404` on `into` (the head build is gone) starts the project's post again.
