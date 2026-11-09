# Swarm Studio: the full studio (spec)

Status: draft, 2026-11-09. This is the plan for turning Swarm Studio from a site
designer into a studio: design → video → full-stack app → game → deploy → sell →
share, all from **one plugin install** and, for models and images, **one Nous
subscription**.

FEATURES.md lists what already ships. This file is what comes next and how it
fits. When a part ships, its row moves to FEATURES.md.

---

## 1. Rules

1. **One plugin.** Everything below lives in `swarm-studio`. No second plugin to
   install. Other Hermes plugins (Meshy) are used when they are there, never
   required.
2. **Lazy everything.** Install is the plugin alone (~50 MB). Every heavy part
   downloads or builds the first time someone uses it, says so on screen with
   its size, and is reused after. A connector is code that sits idle until it
   has a key or login.
3. **Three ways in.** Every feature works on the canvas, as a `/swarm …`
   command, and as a `swarm_studio` tool action the Hermes agent calls from plain
   chat.
4. **Real, not staged.** Steps, screenshots and logs on screen are the engine's
   real output. A failed build says it failed.
5. **The user does money and secrets.** Swarm never types card numbers, live
   payment keys or passwords. Keys are pasted by the user (or come from Hermes's
   secret scope / an Octo vault grant) and are never printed.
6. **Original games only.** "Similar to X" sets the genre and feel. The setting,
   characters, names, story and art are always new. The game prompt says so and
   the interview repeats it back.
7. **Nothing posts without a preview.** Every share or post shows exactly what
   goes where and waits for a click.

## 2. Views

The top bar gets three tabs: **Canvas | Video | App**. Each tab keeps working
when you leave it; a badge on the tab shows its state (● working, ✓ done,
! failed). The chat follows the active tab:

| Tab | The chat means… |
|---|---|
| Canvas | change the design (today's behaviour: comments, `/fix`, new build) |
| Video | re-cut the video (`/video …`) |
| App | change the app: the message goes to the app engine as the next turn |

`/canvas`, `/video`, `/app` switch tabs from the chat.

## 3. App: design → full-stack app

### 3.1 What it makes
A **React 19 + Vite + TypeScript + Tailwind + shadcn/ui** project (dyad's own
starter, 49 shadcn components, react-router), with:
- the design kept exactly: each canvas section becomes
  `src/components/swarm/<Name>.tsx`, each page `src/pages/<Name>.tsx`, the theme
  becomes shadcn's HSL variables in `src/globals.css`, fonts and motion carried
  over (`dyadApp` in `engine/export.mjs`, done);
- a real backend: **Nitro server routes** (`server/api/*`) so the same code runs
  locally and deploys to Vercel as serverless functions. Data in a typed store
  at first; Supabase when connected (§6);
- what the design implies made real: forms that submit and validate, lists and
  prices from data, an admin page for whatever the site collects (orders,
  bookings, sign-ups), Stripe checkout when connected.

### 3.2 The engine
dyad's agent engine, vendored in `dyad/` (Apache-2.0, `src/pro` FSL; see
`dyad/SWARM.md`), run headless with node by `engine/appbuild.mjs`:
- `setupEngine()`: first use only: `pnpm install` (Electron skipped, dugite's
  failing git download tolerated, system git used) then the vite bundle. About a
  minute, ~1.5 GB (to slim: drop Electron/desktop dev deps).
- `runEngine({ workspace, prompt, provider, model, turns })`: spawns the bundle,
  streams steps, resolves with the engine's JSON result (`ok`, `gatesPassed`,
  `turns`, `files`, `commits`).
- Model: the **worker** model Hermes gave Swarm (Nous Portal, InferHub…); the
  engine's egress guard allows only that host.
- Gates: typecheck + build after every turn; failures go back as repair turns
  (up to 4).
- `view_render` lets the engine start the app and screenshot it. Needs the
  seeded project to allow esbuild/@swc builds under pnpm 10+ (`seedProject`,
  done).

### 3.3 The App tab
- **Steps**: a live list: setup, each turn, each file written (from watching the
  folder), app start, gates passed/failed, tokens.
- **Preview**: the app running in an iframe (Vite dev server on a free port,
  started by Swarm after each turn), with phone / tablet / desktop widths and
  ⟳. The screenshots the engine took sit in a strip under it.
- **Code**: the file tree and a read-only viewer; the git log of turns.
- **Deploy**: Vercel (needs the Vercel connector), plus ⬇ zip.
- **Iterate**: type in the chat; each message is one more engine turn on the
  same workspace, committed in its git. ↶ goes back one commit.

### 3.4 Server
| Route | Does |
|---|---|
| `POST /api/runs/:id/app` `{ ask?, kind? }` | start (or continue) the app build for a run |
| `GET /api/runs/:id/app` | state: `idle\|working\|done\|failed`, steps, preview url, shots, result |
| `GET /api/runs/:id/app/files[?path=]` | file list, or one file's text |
| `POST /api/runs/:id/app/stop` | stop the engine |
| `POST /api/runs/:id/app/deploy` `{ host }` | deploy (Vercel first) |

Events in the run log (replayed like the rest): `app:start`, `app:step`,
`app:shot`, `app:ready {url}`, `app:done {result}`, `app:failed {error}`,
`app:deployed {url}`. Workspace: `runs/<id>/app/`, engine data in
`runs/<id>/.engine/`. Exports copy to `~/Documents/Swarm Studio/<build> · <date>/`
like today.

## 4. Game mode

### 4.1 Entry
**🎮 Game** in the navigation next to the brief box, `/swarm game [idea]`, or
"make me a game…" in Hermes chat. All three start the same interview.

### 4.2 The interview
One question at a time, each with chips and a free-text box; **Just build it**
fills the rest with defaults. Hermes asks the same questions in chat (the
`swarm-design` skill tells it how).

| # | Question | Chips | Default |
|---|---|---|---|
| 1 | What kind of game? | Roguelike · Platformer · Puzzle · Tower defense · Card game · Arcade shooter · Racing · Idle | from the idea |
| 2 | Similar to what? (feel only) | free text, e.g. "Hades", "Celeste" | none |
| 3 | Goal and how you win or lose | Clear rooms and beat a boss · Survive waves · Reach the end · High score | from type |
| 4 | Controls | Keyboard + mouse · Keyboard only · Mouse/touch · Gamepad | Keyboard + mouse |
| 5 | Look | 2D pixel · 2D flat · 3D low-poly · 3D neon · Hand-drawn | from type |
| 6 | Length of a run | 2 min · 5 min · 15 min · endless | 5 min |
| 7 | Setting and hero (optional) | free text | invented |

After the last answer it shows the **spec card** (name, pitch, setting, hero,
enemies, loop, controls, win/lose, look, engine, assets) with ✏️ edit and
**Build**. If question 2 names a real game, the card says "feel of X, original
world" and lists what is new.

### 4.3 Build
- Engine choice from the answers: **Phaser 3** (2D), **three.js** (3D),
  **PixiJS** (2D with heavy effects).
- Workspace: the dyad scaffold (`seedProject`), so the same App tab, steps,
  preview, code, iterate and deploy apply. A game is a run with
  `run:start { kind: 'game', brief, spec }`; it appears in Files with a 🎮 tag.
- Prompt: the spec + the originality rule + 3–5 matching skill files from
  `gameskills/` (e.g. roguelike → `phaser-core`, `roguelike`, `procedural-gen`,
  `game-feel`, `game-ui-ux`; 3D adds `threejs-scene-setup`,
  `threejs-materials-lighting`) + the asset list (§4.4).
- Done means: it builds, starts, a run can be won and lost, there is a title
  screen, a pause, a restart, sound (WebAudio), and it works at the chosen
  controls. The engine's screenshots must show the game, not a blank canvas.

### 4.4 Assets
In order of cost:
1. **Made in code** (always): shapes, materials, lights, canvas-drawn textures,
   particles, shaders, WebAudio sound. No files.
2. **Free CC0 packs** (lazy, per model): Kenney, Quaternius, KayKit characters,
   props and tiles, downloaded only for the models the spec needs into
   `public/models/`, with `CREDITS.md`. Exact download links checked before
   wiring (some packs are zips or Drive links).
3. **Meshy** (when the Hermes Meshy plugin is installed and `MESHY_API_KEY` is
   set): the 2–3 main characters made from the spec's own descriptions, rigged
   and animated. Called **through Hermes**, so Meshy's cost approval prompts stay
   in charge. Never required.
4. **Your files**: drop `.glb` / `.gltf` / `.png` onto the App tab.

Every model is summarised for the prompt by `gltfInfo` (size, parts, animation
clips) so the text model can place and animate what it cannot see. 2D games get
sprites from code or the image provider (the Nous gateway's image models).

## 5. Connectors

One **Connectors** panel (☰ More → Connectors, `/swarm connect [name]`). Each
card: what it does, what it needs, connected or not, test, disconnect. Code for a
connector is imported only when its card opens or it is used.

| Connector | Does | Needs | When |
|---|---|---|---|
| **Hermes models** | planner, builders, reviewer, app engine | Hermes's model (a Nous subscription covers it) | ships |
| **Image provider** | site photos, video stills, game sprites | Hermes image provider (Nous gateway, Codex login, FAL…) | ships |
| **Voice** | video voiceover | none (Kokoro local) or any OpenAI-compatible TTS | ships |
| **GitHub Pages** | publish the static site | `gh` login | ships |
| **Vercel** | publish the site; **deploy the full-stack app and games** (REST upload, remote build, env vars set from connected services) | access token or Octo grant | now |
| **Cloudflare Pages** | publish the static site | token | ships |
| **Meshy** | AI 3D characters for games | Meshy plugin + key | now |
| **3D packs** | CC0 models | none | now |
| **Stripe** | checkout in the app; test mode first; a live $2 ticket as proof (done by the user) | secret + publishable key, pasted by the user; set as Vercel env vars, never in code | next |
| **Social share** | post the promo and links: X, LinkedIn, Facebook, Reddit, Threads, Bluesky intent links that open the user's logged-in browser; the video file next to it to drag in | none | next |
| **Marketing pack** | the promo as 9:16, 1:1, 16:9, captions file, per-network copy | none | next |
| **Hermes gateways** | post to Discord / Telegram / Slack through Hermes's own gateways, with preview and confirm | the gateway set up in Hermes | later |
| **Supabase** | database and login for the app (dyad's Supabase support) | personal access token + project | later |
| **Poly Pizza** | search low-poly models by word | free API key | later |
| **Figma** | export a design as layers (quick path); import later | Figma token | after the hackathon |

Secrets: kept in the plugin's data dir like today's Vercel token, or read via
Hermes's `get_secret` for declared env vars. Shown masked. Never in exports,
traces or logs.

## 6. Lazy loading and sizes

| Part | Size | Lands |
|---|---|---|
| Plugin (code, dyad source, game skills) | ~50 MB | install |
| App engine packages + bundle | ~1.5 GB | first app or game build |
| Video tools (renderer, ffmpeg) | ~650 MB | first video |
| Kokoro voice | ~80 MB | first voiceover |
| App dependencies per project | ~200 MB, shared pnpm store | each app's first start |
| 3D models | per model | when a game needs it |

The first use of each shows "first time: downloading X (size)" with progress.
The README's disclosure lists every download and host.

## 7. Commands and tool actions

| Command | Tool action | Does |
|---|---|---|
| `/swarm app [n] [ask]` | `app` | build the app for a build, or one more change |
| `/swarm app [n] stop` | `app_stop` | stop it |
| `/swarm deploy [n] [vercel]` | `deploy` | deploy the app |
| `/swarm game [idea]` | `game` | start the interview (Hermes asks the questions in chat) |
| `/swarm game build <spec json>` | `game_build` | build from answers |
| `/swarm connect [name]` | `connect` | list or open connectors |
| `/swarm share [n]` | `share` | the share card for a build's video and links |

The `swarm_studio` tool schema enum gets the same actions; `skills/swarm-design/SKILL.md`
tells Hermes when to use them and how to run the game interview.

## 8. Licence and catalog

- Swarm Studio: FSL-1.1-ALv2 (Apache after 2 years). dyad: Apache-2.0 with
  `src/pro` FSL. Game skills: Apache-2.0 / MIT with their notices
  (`gameskills/README.md`).
- No compiled binaries in the repo: the engine is built on the user's machine.
- README discloses: npm downloads at setup, model gateway calls, image/TTS
  calls, deploy hosts, 3D pack hosts, Meshy (through its own plugin), the dev
  servers Swarm starts on localhost.

## 9. Tests (done means)

1. **Neon Alley Nights → app**: from a finished build, App → working app in the
   iframe with the design intact, ticket form saving orders through a Nitro
   route, an admin page listing them; gates passed; `view_render` screenshots in
   the strip.
2. **Iterate**: "add a FAQ page with search" → one more turn, new route works.
3. **Deploy**: the app on `…vercel.app`, the API route answering there.
4. **Roguelike**: interview with "similar to Hades" → original spec (e.g. a
   neon alley spirit clearing night-market rooms, picking street-food
   blessings) → three.js or Phaser build that plays, wins, loses, restarts.
5. **Stripe**: test-mode checkout completes; then the user's own live $2 ticket,
   shown in the app's orders and Stripe's dashboard.
6. All of the above also from `/swarm …` and from Hermes chat.

Throwaway copies only; never the user's real builds.

## 10. Order for the deadline (2026-11-11 17:00 EST)

1. App engine + server routes + App tab (Neon test 1–2).
2. Game mode + assets from code + CC0 packs (test 4); Meshy if installed.
3. Vercel deploy for apps (test 3).
4. Stripe test mode, then the live $2 ticket (test 5).
5. Share links + marketing pack.
6. 90 s video, README, catalog PR (needs the owner's OK).

Cut from the bottom of the connector list first. Never cut: the swarm build,
the App tab with a working app, one playable game.

## 11. Open questions

- Does the Nous Portal model handle long engine turns as well as
  `cb/deepseek-v4.1-flash`? One test run before the video.
- Can the engine install drop Electron/desktop deps and still bundle? (size)
- Which CC0 packs have direct GLB downloads (no zip/Drive)?
- Does the worker model read screenshots? If not, `view_render` still proves
  the app starts, and console errors carry the feedback.
