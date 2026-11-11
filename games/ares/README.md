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
- `data/heroes.json`: the two heroines, their role, personality, voice and every move with the Japanese line she calls out. Add a move or a heroine there, then record the new lines with `node ../../engine/voice.mjs data/heroes.json` (Fish Audio or ElevenLabs; key from the environment or an Octo vault lease via `OCTO_VAULT_GRANT`). Files land in `assets/voice/<hero>/<move>.mp3`.
- Sprite sheets and outfits: `node ../../engine/skins.mjs data/heroes.json --hero <id> [--outfit <id>]` paints every sheet of an outfit from its design picture (`art.outfits`), with the same move list and layout rules as every other outfit, cuts the frames (`tools/sheets/cut.py`) and checks them into `assets/skins/<hero>/<outfit>/`. `--fx` does the effect sheets into `assets/fx/`; `--from <folder>` cuts sheets already painted. A move's `fx.levels` sets its effect art, size and power per level.
