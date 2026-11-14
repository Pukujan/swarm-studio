# Godot 4

Glue: engine/godotfirst.mjs, engine/port.mjs, engine/starters.mjs, engine/appjob.mjs, engine/playtest.mjs, engine/playtrace.mjs, engine/playcheck.mjs, engine/aiplayer.mjs, engine/talkplan.mjs, engine/planshape.mjs, starters/strategy-topdown/starter.json, starters/platformer-side/starter.json, starters/addons/swarm_rts/addon.json, starters/addons/feel_platform/addon.json
Status: optional (person connects)

Godot is a game engine under the MIT licence (https://godotengine.org/license/, fetched 2026-11-12). Swarm does not ship or
install it: it runs the person's own Godot 4 binary as a child process (engine/port.mjs:94, README.md:219).

## What it already does

- Opens a project headless, imports its assets and runs the main scene for a set number of frames; Swarm uses
  `--headless --path <dir> --import` and `--quit-after 300` (engine/port.mjs:119-120).
- Exports a project from the command line: `--headless --export-release "Web" build/web/index.html` (engine/godotfirst.mjs:188, gameskills/gamedev/godot-export/SKILL.md:52).
- Exports to Windows, macOS, Linux, Web, Android and iOS once the matching export templates are installed; Swarm only
  writes a Web preset (gameskills/gamedev/godot-export/SKILL.md:27-32, engine/godotfirst.mjs:49-71).
- A single-threaded Web build plays from any static host with no COOP/COEP headers (engine/godotfirst.mjs:48, gameskills/gamedev/godot-export/SKILL.md:37).
- Native add-ons (GDExtension), threads and C# do not run in that Web build (docs/specs/38-game-starters.md:126-129).
- Not used by Swarm yet: 3D, C#, multiplayer, shaders, tilemaps, UI controls. Skills for them ship in
  `gameskills/gamedev/godot-*` (17 folders, Apache-2.0, unmodified copies) but only some are wired (gameskills/README.md:3-10, engine/port.mjs:17, engine/godotfirst.mjs:18).

## How Swarm drives it

**Finding Godot.** `godotBin(env)` takes `SWARM_GODOT`, then `GODOT`, then `godot` / `godot4` on `PATH`
(`godot.exe`, `godot4.exe`, `godot_console.exe` on Windows), then on macOS the app itself,
`Godot.app/Contents/MacOS/Godot` in `/Applications` or `~/Applications` (engine/port.mjs:94-103). Godot's command-line
docs name that binary inside the bundle ([Command line tutorial](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)).
A Mac's Godot is an app, from godotengine.org or `brew install --cask godot`. Homebrew's `godot` link in `/opt/homebrew/bin`
is missing from the `PATH` an app opened from the Dock gets, so `PATH` alone missed it (issue #405; CI's `checks-macos`
job installs the cask and checks that the app is found with `PATH=/usr/bin:/bin`). The launcher keeps both
`SWARM_GODOT` and `GODOT` (plus `PATH`) in the server's environment (launcher.py `KEEP_ENV`; tests/test_manifest.py). The server checks once at start and the planner is told yes, no or unknown (server/server.mjs:1450-1457, engine/talkplan.mjs:282).

**Not installed.** If the plan names Godot and none is found, the chat offers "Godot (install it first)" or "The
browser for now" (engine/talkplan.mjs:207-208); the plan says to install Godot 4 (engine/planshape.mjs:365). At build
time it falls back to the browser and says so in a step (engine/appjob.mjs:409-412). Swarm never downloads Godot (README.md:219).

**Two paths.**
1. **Godot-first** (the big game): `godotFirst(spec)` is true when the spec's target, answers or `starter.engine`
   name Godot and a binary is found (engine/godotfirst.mjs:24-27).
   - `seedGodot` copies the locked starter into `ports/godot/`, writes `project.godot` if missing (Godot 4,
     `gl_compatibility` renderer, 1280×720), always rewrites `export_presets.cfg`, and copies `public/art/` into
     `assets/art/` (engine/godotfirst.mjs:86-95). `syncGodotArt` keeps files the crew changed (engine/godotfirst.mjs:102-124).
   - Each stage prompt is `godotStagePrompt`: the spec, the starter's `CREW.md`, the art brief, `GODOT_RULES`
     (Godot 4.7, GDScript 2, no Godot 3 syntax) and four Godot skills (engine/godotfirst.mjs:138-177).
   - After each stage `godotStage` runs `checkGodot`; errors get one fix turn, then `exportWeb` and `serveStatic` (files from Swarm's own process, no server of its own; a finished web app is served the same way since decision 0017, issue #450)
     on 127.0.0.1 with CORS (engine/appjob.mjs:512-530, engine/godotfirst.mjs:182-222).
   - `exportWeb` returns `{ ok, dir, error? }` and empties `persistentPaths` so the export does not touch
     IndexedDB in a sandboxed frame (engine/godotfirst.mjs:182-204).
2. **Port** (Godot, Unity or Unreal after a web game): `buildPort` asks the crew to write `ports/<target>/` with
   `portPrompt`, checks the files with `checkPort` (`project.godot`, a `.tscn`, a `.gd`), and for Godot runs
   `checkGodot` with one fix turn. A failed port never fails the game (engine/appjob.mjs:345-378, engine/port.mjs:58-91).
   3D models in `public/models/` are copied to `assets/models` (engine/port.mjs:49-56). Unity and Unreal ports are
   source only, never compiled (engine/port.mjs:1-6, README.md:66).

**Starters.** The plan's engine card is "The browser" or "Godot 4" (engine/starters.mjs:17-20). Two starters ship,
both Godot only: `strategy-topdown` with add-on `swarm_rts`, and `platformer-side` with `feel_platform`, both
`source: ours`, MIT, `web: true` (starters/strategy-topdown/starter.json:5, starters/platformer-side/starter.json:5, starters/addons/swarm_rts/addon.json:4-9).
`swarm_rts` is plain GDScript: a MultiMesh unit pool, flow fields, box select, RTS camera, fog of war (starters/addons/swarm_rts/README.md:3-12).
Measured: 500 units at 60 fps in the Web export on an M1 (docs/specs/38-game-starters.md:110-114). A person can bring
an add-on folder up to 5 MB with `bringAddon`; native files mark it `web: false` (engine/starters.mjs:213-226).

**Play-testing.** `playtest(url)` opens the served export in Playwright's Chromium inside a sandboxed iframe
(`allow-scripts`, no same origin), as Hermes shows it (engine/playtest.mjs:167-240). It:
- waits for a canvas, then for `window.__swarm` (a Godot export boots for seconds) (engine/playtest.mjs:240-249);
- fails on Godot's own `#status-notice` start error or a blank one-colour screen (engine/playtest.mjs:252-255);
- clicks a Play/Start button or the canvas, holds each control the spec names and reads the game state to see the
  move happen (engine/playtest.mjs:263-283, engine/playcheck.mjs:23);
- keeps pressing keys and fails a run that ends within 2.5 s or throws errors (engine/playtest.mjs:291-308);
- can film the run to `.webm` with the Web Audio sound muxed by ffmpeg (engine/playtest.mjs:63, 185-202).
  The film gets a poster frame beside it, `playtest-N.poster.jpg`: a frame of the film made with ffmpeg, else the
  title-screen photo the test takes (engine/playtest.mjs, engine/poster.mjs); the App view and the chat show it until the clip plays (web/video.js).

**A failed play test, and the fix request.** The result says whether the game ever drew (`started`: false for no
canvas, one flat colour, or Godot's start notice) and carries `evidence`: the first error the page threw with its
stack and when (before or after the first key), later errors, and the console's errors and warnings
(engine/playtest.mjs:204-232). A film of a game that never drew is a film of an empty page: it is kept on disk as
`blankClip` and never handed on as the play test's `clip` (engine/playtest.mjs:147-163). `engine/playtrace.mjs` reads the stack into frames
(`parseStack`; a page whose script the browser will not describe to the sandboxed frame gets Playwright's rebuilt
stack, counted from 0, which is put back to 1-based), maps each of the game's own frames through the served
file's source map to its source line with `@jridgewell/trace-mapping` when that package is on the machine
(`loadTracer`: the plugin's own, `PLAYWRIGHT_DIR`, or dyad's `node_modules`; without it the served file's line is
given and said to be that; a built bundle or a Godot export gives the code around the column), and writes the
builder's fix request (`fixBrief`): the failure, whether the game drew, the first error with its frames and the
code at each, the console, and where to start reading (engine/playtrace.mjs:29, 46, 71, 135). `playAndFix` plays, sends the crew at what failed, plays
again and films it, up to `FIX_TRIES` (2) times; the second request says which files the first changed and
whether the same error is still thrown (engine/playtrace.mjs:17, 188). Every step in the log says what was tried. What still fails goes to the
next slice as its first job (engine/appjob.mjs `playCarry`), and "fix it" typed at the waiting slice plays and
fixes the same slice again (`start` with `fix: true`, engine/appjob.mjs:162, 509). Not decided: the slice gate and three fix turns of
docs/specs/47-game-builder-loop.md.

A Godot game publishes its state with `JavaScriptBridge.eval("window.__swarm=…")` about ten times a second (engine/playcheck.mjs:62).
`testDodges` flags `.gd` files that check for the test, named with forward slashes on every system (engine/playcheck.mjs:71-87).

**Autoplay.** The Game room's Autoplay switch runs an AI player on the game that is already served
(server/autoplay.mjs, engine/aiplayer.mjs). It is not a test and changes nothing in the build:
- it plays in the same sandboxed iframe as the play test, with an empty page on the game's own origin as the
  parent, so the frame is a secure context for a Godot export (engine/aiplayer.mjs:348-356);
- it reads `window.__swarm`, the state the game already publishes for the play test, before anything else; those
  are the game's own coordinates, so it steers with the keys and aims the mouse at nothing (engine/aiplayer.mjs:141-165);
- its screen reaches the room as a CDP screencast sent on as MJPEG (engine/aiplayer.mjs:343-347, server/autoplay.mjs:67-75);
- Unchecked: it has been run against a small hand-written web game only (tests/aiplayer.test.mjs), never against
  a real Godot Web export.

**The browser path, for contrast.** Without Godot, `plan(answers)` picks three.js for a 3D look, PixiJS for
hand-drawn, else Phaser 3, with matching skills (engine/game.mjs:41-57). It is built by the app engine and played
in the Studio with the same play test (engine/appjob.mjs:329). ARES is a hand-written canvas 2D web game with no
Godot in it (games/ares/web/ENGINE.md:1-10).

**Brought-in projects.** A Godot project made outside the Studio is not opened yet ([spec 45](../specs/45-intake.md) "Not in this slice"). Bring in a project (engine/bringin.mjs `shapeOf`) takes a folder with `project.godot` only when it also has a web page of its own, and then plays that page as plain files; the Godot files come along untouched, and the `intake` event notes `godot: true`. With no page it is refused in words. `serveStatic` (engine/godotfirst.mjs) now answers a folder's address with that folder's `index.html` (a brought-in game opens on `web/`); a Godot export is served from its top as before (tests/bringin.test.mjs "the files server answers a folder…").

## What the person connects

- The Godot 4 editor binary, on `PATH` as `godot`/`godot4` or named by `SWARM_GODOT` or `GODOT` (engine/port.mjs:94-98, launcher.py `KEEP_ENV`). The prompts target 4.7 (engine/godotfirst.mjs:138); the starters say 4.3+ (starters/addons/swarm_rts/addon.json:7).
- Godot's Web export templates, matching the editor version exactly (gameskills/gamedev/godot-export/SKILL.md:27-29, 98-99). Unchecked: Swarm has no code that installs or checks them (no match for "template" in engine/godotfirst.mjs); a missing template should surface as the `exportWeb` error. A real run without templates would settle it.
- For the play test: the `playwright` package (from the plugin, `PLAYWRIGHT_DIR`, or dyad's `node_modules`) and a Chromium (Playwright's, installed Chrome, or a cached headless shell) (engine/playtest.mjs:18-42).
- No keys and no Hermes connector are needed for Godot (plugin.yaml:11-57 lists none).

## Limits inside Swarm

- Godot gets a minimal child environment, no keys (README.md:225).
- Headless only: Swarm never opens the Godot editor window. **Open in Godot** (open `ports/godot/` in the person's
  own editor) is specified but not built (docs/specs/38-game-starters.md:138-139, docs/PLANS.md "Proposed" under Games).
- The Studio preview is the Web export: no GDExtension, threads or C# there (docs/specs/38-game-starters.md:126-136).
- Games must not depend on `user://` storage; the frame is sandboxed (engine/godotfirst.mjs:145, 194-204).
- If Playwright or the browser is missing, or the test itself cannot run, the play test returns `ok: false` with `skipped` (engine/playtest.mjs `playtestRun`). The build goes on: the step says "play test skipped" with the reason, no fix turn is spent on it alone, and the slice is shown as not played. `playPassed` (engine/appjob.mjs) never counts a skipped test as a pass, also after a fix turn, when it is played again (tests/enginegaps.test.mjs).
- Each headless step has a 300 s timeout; the run check 90 s (engine/godotfirst.mjs:187-188, engine/port.mjs:119-120).
- The Feed shows the trailer and art, never hosts the game (docs/PLANS.md, Games section).
- Open Design's edit tools are HTML-only and do not reach a game (docs/PLANS.md, Games section; docs/decisions/0010-open-design-tools.md).

## Open questions

- Open in Godot: not built; comes with the first native starter or add-on (docs/specs/38-game-starters.md:138-139).
- Proposed, not decided: Draw on a paused frame, config sliders, re-roll one asset, compare takes (docs/PLANS.md, Games; DECISIONS.md:250).
- No pinned add-on ships yet (docs/specs/38-game-starters.md:201).
- Unchecked: whether the guided board (spec 22) is finished (docs/PLANS.md, Games).

## Sources

- AGENTS.md, docs/PRODUCT.md, docs/PLANS.md, docs/decisions/README.md, 0002, 0003, 0010, 0011
- ../../../DECISIONS.md (hackathon folder), lines 43, 95, 250
- engine/godotfirst.mjs, engine/port.mjs, engine/starters.mjs, engine/game.mjs, engine/playtest.mjs, engine/playcheck.mjs, engine/appjob.mjs, engine/talkplan.mjs, engine/planshape.mjs, engine/skins.mjs and engine/voice.mjs (no Godot code)
- server/server.mjs:1450-1457, launcher.py:196-228, plugin.yaml, README.md:66, 205-230
- starters/*/starter.json, starters/platformer-side/CREW.md, starters/addons/*/addon.json, starters/addons/swarm_rts/README.md
- gameskills/README.md, gameskills/gamedev/NOTICE, gameskills/gamedev/godot-export/SKILL.md, gameskills/gamedev/godot-gdscript-headless-testing/SKILL.md
- games/ares/web/ENGINE.md
- engine/bringin.mjs, tests/bringin.test.mjs, docs/specs/45-intake.md
- docs/specs/01-big-game-mode.md, 22-guided-game-maker.md, 23-art-on-request.md, 37-studio-first.md, 38-game-starters.md
- https://godotengine.org/license/ (fetched 2026-11-12)
