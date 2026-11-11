# ARES

The flagship demo game from [docs/specs/16-ares-demo.md](../../docs/specs/16-ares-demo.md): a fast first-person
arena boss rush in Godot 4, where the bosses are members of the Nous Hermes hackathon Discord and Jev plays it.
Hand-coded, not studio-generated.

## Run (Windows PC, Godot 4.7)

1. Copy the CC0 KayKit models in: `powershell -File tools/get-models.ps1` (models are not committed; see CREDITS.md).
2. Import once: `godot --headless --path . --import`.
3. Play: `godot --path .` Options go after `--`:
   - `--boss=Teknium` pick a boss (default sovthpaw), `--ladder` fight all 14 in order
   - `--auto` the scripted pilot plays, `--jev` Jev plays (opens the bridge on 127.0.0.1:47800)
   - `--cards` tour of all 14 name cards, `--credits` the credits, `--skip-title`
4. Record: `godot --path . --write-movie out.avi --fixed-fps 30 --quit-after 1800 --resolution 1920x1080 -- --jev --skip-title`

## Jev

`jev/ares-jev.mjs` reads the game state from the bridge, asks Jev (`typesafe/jev-1.14`, OpenRouter Decisions API)
which tactic to use (pressure, finish, rip, burn, punch, weak point, evade) and on which target, and sends it back.
The in-game pilot aims, strafes and dashes between decisions, and falls back to scripted tactics if Jev is quiet
for 2.5 s. From the Mac: `ssh -N -L 47800:127.0.0.1:47800 windows`, then `JEV_KEY=... node jev/ares-jev.mjs`.
Clear times print as `CLEAR <handle> <seconds>` and land in `user://clears.json`.

## Data

- `data/bosses.json`: the roster. Rename or remove a boss in one edit.
- `data/items.json`: the cosmetic items shared with the player app, and what is equipped.
