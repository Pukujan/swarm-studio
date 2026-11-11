# Jev

`ares-jev.mjs` plays the Godot build over the TCP bridge (see `../README.md`).

## Jev on the web build

`web-jev.mjs` plays the web build in Chromium through `window.SWARM_PLAY`: it reads `state()`, asks Jev
(`typesafe/jev-1.14`, OpenRouter Decisions API, key in `JEV_KEY`) to pick one of `state.tactics`, and calls
`act(name, why)`, at most about 2.5 decisions a second. The in-game pilot aims, jumps and dashes in between and takes
over with its own tactics whenever Jev is quiet for 2.5 s, so API errors only cost decisions. It attaches to the
Chromium on `127.0.0.1:9222` (`~/bin/claude-chrome`) if that is up, otherwise it launches Chromium headful.
Run from `games/ares`, with the dev server on port 8777 serving this folder:

```sh
JEV_KEY=... node jev/web-jev.mjs --stage 1 --hero messenger --seconds 180
node jev/web-jev.mjs --dry --stage 2 --seconds 20 --shot /tmp/ares.png   # random allowed tactic, no API call
node jev/web-jev.mjs --url 'http://localhost:8777/web/index.html?auto&stage=3' --headless --every 600
```

Other options: `--model`, `--cdp <url>`, `--keep` (leave the launched browser open). It prints each decision and one
JSON line at the end (mode, hp, boss, Jev answered/failed/median ms, tactic counts, page errors).
