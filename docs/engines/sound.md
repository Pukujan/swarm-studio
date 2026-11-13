# Sound: music and voice (Kokoro, ElevenLabs, Fish Audio, the studio's score)

Glue: engine/sound.mjs, engine/score.mjs, engine/voice.mjs, engine/media.mjs, engine/musiccut.mjs, engine/mediareader.mjs, engine/filmcritic.mjs, server/server.mjs, launcher.py
Status: built in (Kokoro voice and code-written score); optional, person connects (ElevenLabs, Fish Audio, any OpenAI-compatible TTS)

Four sources. Kokoro: an 82M TTS model run locally through the npm package `kokoro-js@1.2.1` (engine/sound.mjs:1-10); model weights described as "Apache-licensed" (https://github.com/hexgrad/kokoro/tree/main/kokoro.js, fetched 2026-11-12). The studio's score: Swarm's own synth code, no dependency (engine/score.mjs:30-31). ElevenLabs and Fish Audio: outside paid services reached over HTTPS (engine/score.mjs:173-174, engine/voice.mjs:52-66).

## What it already does
- Kokoro runs 100% locally via Transformers.js, on `cpu` in Node, dtypes fp32/fp16/q8/q4/q4f16, 28 English voices (20 US, 8 UK) (https://github.com/hexgrad/kokoro/tree/main/kokoro.js, fetched 2026-11-12). Swarm casts 10 of them (engine/sound.mjs:16-27).
- ElevenLabs: music from a prompt (`/v1/music`), sound effects (`/v1/sound-generation`), TTS (`/v1/text-to-speech/<voice>`) (engine/score.mjs:180-185, engine/voice.mjs:62). Its MCP connector exposes `compose_music` and `text_to_sound_effects` (engine/media.mjs:110-121).
- Fish Audio: TTS at `https://api.fish.audio/v1/tts` with a `reference_id` voice and optional `model` header (engine/voice.mjs:54-59).
- Unchecked: anything else these services offer (voice cloning, other languages); settle from their own API docs.

## How Swarm drives it
Film voiceover (server/server.mjs:1121-1131):
- Voice plays only when the film wants narration or the person picked one; `input.voice: 'off'` silences it (server/server.mjs:1123-1124).
- Who speaks: a picked voice wins; else the storyboard's `cast.narrator` and `cast.second` (model-chosen from `CAST`, kept only if real ids); else the theme's mood maps to `af_bella` (snappy) or `af_heart` (gentle) (server/server.mjs:1125, engine/video.mjs:162-165, engine/sound.mjs:14).
- `speak()` sends every line to `SWARM_TTS_URL` (any OpenAI-compatible `/v1/audio/speech`) when set; otherwise it installs kokoro-js once into `video-tools`, writes a worker, and runs it as a child process that loads `onnx-community/Kokoro-82M-v1.0-ONNX` (q8, cpu) and writes one WAV per line (engine/sound.mjs:33-45, engine/sound.mjs:53-89).
- Returns `{ file, seconds }` per line; beat lengths stretch to fit the line (engine/musiccut.mjs:175-176).

Film music (server/server.mjs:1133-1163). First match wins:
1. A track dropped in the Video kit (`video/music.*`) is used as is (server/server.mjs:1143-1144).
2. ElevenLabs via Hermes's MCP connector (`mcpScore`) or a key (`elevenScore`), with a prompt of tempo, mood, instruments and the timed cue sheet, "No vocals", never a reference's melody (server/server.mjs:1145-1151, engine/score.mjs:162-166).
3. Otherwise `scoreWav()` writes a stereo WAV in code to the cue sheet: sections, booms on hits, true silence in stops, nine synthesised effects (server/server.mjs:1153, engine/score.mjs:31, engine/storyboard.mjs:19).
- Then `decode()`/`analyse()` measure tempo, onsets, drop and quiet passages, and `cutToMusic()` moves the cuts; the studio score is rewritten to the final cuts (server/server.mjs:1155-1162, engine/musiccut.mjs:31-39).
- `mix()` lays music, voice lines and effects under the silent render with ffmpeg; music ducks under voice (sidechain compress), stop windows are muted, a limiter caps at 0.95 (engine/sound.mjs:184-210, server/server.mjs:1218).

Game character voices (not films):
- `node engine/voice.mjs <heroes.json>` records every move, bark, spell and line to `assets/voice/<hero>/<key>.mp3`, provider `fish` or `elevenlabs` per voice (engine/voice.mjs:1-13, engine/voice.mjs:24-50).
- The guided game workshop calls `speakLine` with the voices in games/ares/data/heroes.json (server/server.mjs:1664-1665).

Other uses:
- Crew chatter: a fixed list of nine short lines, read by `SWARM_TTS_URL` or by Kokoro only if it is already installed (server/server.mjs:1345-1360).
- Hearing sound: `readMedia()` and the film critic send a small mp3 (mono, 16 kHz, at most 120 s) to the person's media model, or measure loudness and silence with ffmpeg alone (engine/mediareader.mjs:1-24, engine/mediareader.mjs:117, engine/filmcritic.mjs:1-5).

## What the person connects
- Free, local, no key: Kokoro and the code score (engine/sound.mjs:1-3, engine/media.mjs:11-12). Kokoro needs Node's npm the first time (engine/sound.mjs:78-81).
- ElevenLabs music: `ELEVENLABS_API_KEY` in Hermes's secret scope (plugin.yaml:15), which launcher.py passes to the server as `SWARM_ELEVENLABS_KEY` (launcher.py:219-223); or Hermes's ElevenLabs MCP connector (`elevenlabs`, `eleven-labs`, `elevenlabs-mcp`) (engine/media.mjs:30); or a key pasted in the Film panel, checked against `/v1/models` and stored in `media-keys.json` mode 0600 (engine/media.mjs:9-10, engine/media.mjs:46-50).
- Other TTS: `SWARM_TTS_URL`, `SWARM_TTS_KEY`, `SWARM_TTS_MODEL`, `SWARM_TTS_VOICE` (engine/sound.mjs:50-52, engine/sound.mjs:75-76). Not declared in plugin.yaml (plugin.yaml:12-56).
- Game voices: `FISH_API_KEY` or `ELEVENLABS_API_KEY` in the environment, else `OCTO_VAULT_GRANT` for an Octo vault lease called through the vault proxy (engine/voice.mjs:9-11, engine/voice.mjs:68-102). `FISH_API_KEY` and `OCTO_VAULT_GRANT` are not in plugin.yaml (plugin.yaml:12-56).

## Limits inside Swarm
- Every source above except the local ones is keyed and paid; none is free. Unchecked: whether Fish offers a free model or tier; settle from Fish's pricing page.
- Kokoro speaks English voices only in Swarm's cast (engine/sound.mjs:16-27); the Japanese game lines go through Fish or ElevenLabs (games/ares/README.md:33).
- The first Kokoro run downloads the model by id at run time (engine/sound.mjs:36); README's "What it does on your machine" names HyperFrames and ffmpeg but not Kokoro or its model download (README.md:216). kokoro-js is installed without `--save-exact`, though the spec string is exact (engine/sound.mjs:10, engine/sound.mjs:81).
- `voice.mjs` sends a `curl/8.7.1` user agent because Cloudflare in front of Fish refuses script agents (engine/voice.mjs:21-22), and defaults its vault to `octodb.design-bakery.com` (engine/voice.mjs:20).
- A generated ElevenLabs track keeps its own length; cuts move to it instead (server/server.mjs:1159-1162).
- `music()` in sound.mjs, an older bed, is exported but no caller was found by grep (engine/sound.mjs:102).

## Open questions
- Unchecked: whether Hermes hands `FISH_API_KEY`, `OCTO_VAULT_GRANT` or `SWARM_TTS_*` to the server when they are not declared in plugin.yaml; settle by reading launcher.py's env handling (spec 25 notes plugin.yaml declares few keys: docs/specs/25-connections.md:129).
- Unchecked: kokoro-js's own library licence (the page shows only a badge); settle by reading its LICENSE file.
- Which music engines to offer beyond ElevenLabs is not decided; PRODUCT lists "music tools" as borrowed and optional (docs/PRODUCT.md, "What is borrowed").

## Sources
- AGENTS.md, docs/PRODUCT.md, docs/PLANS.md, docs/decisions/0002, 0003, 0011
- docs/specs/15-prompt-films.md, 26-directed-films.md
- engine/sound.mjs, score.mjs, voice.mjs, media.mjs, mediareader.mjs, musiccut.mjs, filmcritic.mjs, filmscore.mjs, storyboard.mjs, proc.mjs
- server/server.mjs (lines 1121-1218, 1279, 1345-1360, 1545-1557, 1664-1665), launcher.py:219-223, plugin.yaml, README.md, FEATURES.md:59, games/ares/README.md:33
- https://github.com/hexgrad/kokoro/tree/main/kokoro.js (fetched 2026-11-12)
