# HyperFrames (film making)

Glue: engine/video.mjs, engine/storyboard.mjs, engine/director.mjs, engine/musiccut.mjs, engine/filmkit.mjs, engine/filmcritic.mjs, engine/footage.mjs, engine/story.mjs, engine/look.mjs, engine/media.mjs, server/server.mjs, web/canvas/film.js
Status: built in

HyperFrames is HeyGen's renderer that turns HTML, CSS, media and seekable animations into MP4 (https://github.com/heygen-com/hyperframes, fetched 2026-11-12). Licence: Apache 2.0, "with no per-render fees or commercial-use thresholds" (same URL). Swarm does not vendor it: it installs the npm package `hyperframes@0.9.26` into the plugin's data folder on first use (engine/video.mjs:18, engine/video.mjs:643).

Swarm's "current renderer" and HyperFrames are the same thing today. Decision 0011 made HyperFrames the default (docs/decisions/0011-hyperframes-default-video.md:20), and the code already renders every film with it (engine/video.mjs:1-4, engine/video.mjs:659-661). What Swarm owns is everything before the render: director, storyboard, look, music cut, mix and critic. No other film engine is wired (grep for `hyperframes` across engine/, server/, web/ finds only video.mjs, footage.mjs, server.mjs:931 and :3937, web/canvas/film.js:14; there is no root package.json).

## What it already does
- Renders HTML compositions to video by seeking each frame in headless Chrome and encoding with FFmpeg (https://github.com/heygen-com/hyperframes, fetched 2026-11-12).
- Animation: GSAP, CSS, Lottie, Three.js, Anime.js, WAAPI or a custom frame adapter (same URL).
- Audio: `<audio>` elements with timing and `data-volume`; its producer does "capture, encode, and audio mix" (same URL). Swarm does not use this; it mixes with ffmpeg itself (engine/sound.mjs:187).
- Formats: mp4, webm, mov, gif, png-sequence, hls; WebM and MOV keep transparency (https://hyperframes.heygen.com/packages/cli, fetched 2026-11-12). Swarm only makes mp4 (engine/video.mjs:23).
- Render flags beyond what Swarm passes: `--workers` (1-24, one Chrome each, about 256 MB), `--docker` for deterministic output, `--gpu`, `--variables`, `--batch`, `--start/--end`, `--hdr` (same URL).
- Other CLI commands: `init`, `preview` (live reload), `lint`, `doctor`, `browser ensure`, `add`, `auth login`, `share` (both URLs above).
- Chrome is found on the system or downloaded into `~/.cache/hyperframes` (`HYPERFRAMES_CACHE_DIR` moves it) (https://hyperframes.heygen.com/packages/cli, fetched 2026-11-12).

## How Swarm drives it
1. Footage (optional): `filmBuild` opens the running app with puppeteer-core and HyperFrames' own cached chrome-headless-shell, plays the game with a key-mashing bot and scrolls the site, and records mp4 through ffmpeg (engine/footage.mjs:14-60, engine/footage.mjs:117-124; called at server/server.mjs:1013-1014).
2. Source `c`: `collect()` reads a build's brand, pages, copy, pictures and footage (engine/video.mjs:43); with no website, `brandSource`, `kitBoard` and `storySource` build the same shape from a brand, the Video kit or `story.json` (engine/filmkit.mjs:1-14, engine/filmkit.mjs:29, engine/story.mjs:5-8).
3. Director: `direct()` picks one of six kinds (demo, mood, character, gameplay, music, announce) with acts and grammar; it never throws and falls back to rules (engine/director.mjs:17, engine/director.mjs:205).
4. Storyboard: `writeBoard()` asks the planner model for beats (kind, layer, camera, cut, cue, sfx); `checkBoard()` repairs anything the renderer can't play; `fallbackBoard()` needs no model (engine/storyboard.mjs:151, engine/storyboard.mjs:399, engine/storyboard.mjs:495; called at server/server.mjs:1077).
5. Flow/Veo clips made by hand into `<run>/flow/` replace stills (server/server.mjs:950-962).
6. Voice, then music, then `cutToMusic()` moves every cut onto the measured beat (server/server.mjs:1126-1162, engine/musiccut.mjs:125). See docs/engines/sound.md.
7. Composition: `composition()` writes one HTML file with `data-start`/`data-duration` clips and a paused GSAP timeline on `window.__timelines` (engine/video.mjs:385, engine/video.mjs:576-587), for wide, tall and square shapes (engine/video.mjs:23, server/server.mjs:1166-1183).
8. Render: `videoTools()` installs once; `render()` spawns `hyperframes render <dir> -o <out> -q <quality> -f 30` and reads `@hf-progress` lines (engine/video.mjs:629-675). One render runs at a time across every film (`renders`, a `serialQueue(1)` from engine/lifecycle.mjs); the next one waits and says so ("waiting for another film to finish rendering", server/server.mjs `QUEUED`). It is started with execa (`start()`, engine/proc.mjs), and a stop kills it with the Chrome and ffmpeg it started (`stopTree`, tree-kill; decision 0017, issue #450). Quality is `draft` unless `standard` or `high` is asked (server/server.mjs:1192).
9. Mix the silent render with voice, music and effects (server/server.mjs:1218), then the critic: `reviewFilm()` measures black, silence, loudness, cuts against beats and voice recall with ffmpeg and optional models (engine/filmcritic.mjs:12-24, engine/filmcritic.mjs:104; server/server.mjs:1545).
10. Poster frames: once the cuts are final, `makePoster()` writes `promo.poster.jpg` (and `-tall`, `-square`) beside each cut with the same pinned ffmpeg, one JPEG frame half a second in (server/server.mjs:1261, engine/poster.mjs). The play test's film and the idle clips get one the same way, with the machine's ffmpeg or, for the play test, its title-screen photo when there is none (engine/playtest.mjs, server/server.mjs:3902 serves them and makes a missing one on first request). The boards show the poster until a film is played, hovered or focused, load with `preload="metadata"`, tear the player down off screen (`pause()`, `removeAttribute('src')`, `load()`) and let at most 2 play at once, 1 on a low-memory machine (web/video.js, used by web/canvas/film.js, web/canvas/rooms.js and web/project.js; `/next/` through ui/src/primitives/BoardVideo.tsx; checked in a browser by scripts/video-check.mjs). This is Swarm's own code: HyperFrames renders the film, and has no part in showing it.
11. `engine/filmscore.mjs` scores a regression set of storyboards (kind match, likeness, cuts on beat) for scripts/film-set.mjs (engine/filmscore.mjs:1-4).

## What the person connects
- Nothing for the render itself. First use runs `npm install --save-exact hyperframes@0.9.26`, plus `@ffmpeg-installer/ffmpeg@1.1.0` and `@ffprobe-installer/ffprobe@2.1.2` when ffmpeg/ffprobe are not on PATH; those binaries are checked against recorded SHA-256 sums (engine/video.mjs:602-656). Needs Node's npm and Chrome (README.md:216, README.md:235).
- HyperFrames' docs list Node.js 22+ and FFmpeg as requirements (https://github.com/heygen-com/hyperframes, fetched 2026-11-12).
- Optional: ElevenLabs for music (`ELEVENLABS_API_KEY`, plugin.yaml:15); moving clips through a signed-in Hermes video provider (docs/specs/15-prompt-films.md:75).

## Limits inside Swarm
- The render child gets only PATH, the base env, `HYPERFRAMES_SKIP_SKILLS=1`, `HYPERFRAMES_NO_TELEMETRY=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, `DO_NOT_TRACK=1` and `NO_COLOR=1` (engine/video.mjs `renderEnv`, engine/proc.mjs:12-24; tests/enginegaps.test.mjs). HyperFrames collects command names, render performance and a detected coding agent's name unless opted out (https://hyperframes.heygen.com/packages/cli, fetched 2026-11-12). The pinned 0.9.26 does carry that code and reads these names: `telemetryRuntimeOverride()` turns reports off for `HYPERFRAMES_NO_TELEMETRY` or `DO_NOT_TRACK`, and `updateCheckDisabled()` for `HYPERFRAMES_NO_UPDATE_CHECK=1` (read 2026-11-14 in the installed package, `hyperframes@0.9.26/dist/chunk-CMQZP52Y.js` and `dist/chunk-AIJMFLLS.js`). So Swarm's renders report nothing (owner, 2026-11-13: "Yes, fix them").
- The composition loads GSAP from cdn.jsdelivr.net and fonts from Google Fonts at render time, so a render needs the network (engine/video.mjs:519-520).
- A platform with no recorded checksum needs ffmpeg and ffprobe on PATH (engine/video.mjs:599-622).
- Footage needs `puppeteer-core` inside `video-tools`; Unchecked: which package brings it in (it is not in the install list at engine/video.mjs:643; settle by reading hyperframes@0.9.26's dependencies).
- Only eleven fixed scene kinds and ten camera moves exist; composed layouts and the per-shot route are spec'd as "next" (engine/storyboard.mjs:15-17, docs/specs/26-directed-films.md:93-110).
- At most 3 paid clips are animated per cut (docs/specs/15-prompt-films.md:83).

## Open questions
- Which other engines to offer is open (docs/decisions/0011-hyperframes-default-video.md:24). Candidates named in docs/PLANS.md:128-131, none wired and none checked here:
  - Remotion: Open. PLANS says it needs a company licence above a certain size; Unchecked here.
  - Revideo or Motion Canvas: Open. PLANS says MIT; Unchecked here.
  - Theatre.js: Open. PLANS says Apache, with a timeline editor; Unchecked here.
- 0011 says Swarm shows what each engine needs downloaded before the person picks (docs/decisions/0011-hyperframes-default-video.md:21-22); no picker exists in code (grep above).
- Proposed: editable storyboard, Draw on a paused frame, sliders for pace, length and music (docs/PLANS.md:132).
- Unchecked: whether Swarm should move from 0.9.26 to a newer HyperFrames; settle by comparing the changelog.

## Sources
- AGENTS.md, docs/PRODUCT.md, docs/PLANS.md, docs/decisions/README.md, 0002, 0003, 0010, 0011
- docs/specs/15-prompt-films.md, 24-video-idle.md, 26-directed-films.md, 39-story.md, 40-video-kit.md
- engine/video.mjs, footage.mjs, director.mjs, filmkit.mjs, filmcritic.mjs, storyboard.mjs, musiccut.mjs, story.mjs, filmscore.mjs, sound.mjs, proc.mjs
- server/server.mjs (lines 931-1220, 1545), README.md (lines 210-235), plugin.yaml
- https://github.com/heygen-com/hyperframes (fetched 2026-11-12)
- https://hyperframes.heygen.com/packages/cli (fetched 2026-11-12)
