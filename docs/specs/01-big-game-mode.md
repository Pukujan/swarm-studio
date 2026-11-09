# 1. Big game mode

## Problem

Auto's games step (`GAMES_ASK` in `engine/auto.mjs`) always builds three small mini games on `/play`. A prompt about a game, like "a fast action roguelike", should get **one real game** instead. Mini games are still the right default for any other kind of site.

## What we build

### Picking the mode
- Auto chooses between two modes from the prompt:
  - **`mini`**: the current three mini games. This is the default.
  - **`big`**: one game, given more turns.
- Auto picks `big` when the planner's plan says the product **is** a game ("game", "roguelike", "trial", "demo", "playable", plus a genre word).
- The person can override the choice in the Auto window with a toggle labelled **"Games: 3 mini / 1 big"**.

### The prompt for big mode (`BIG_GAME_ASK`)
- **Where it lives:** `/play`, linked in the nav. The code goes in `src/games/<slug>/`, split into modules: `scene`, `player`, `enemies`, `rooms`, `upgrades`, `ui` and `audio`.
- **Look:** the game wears the site's theme (its CSS variables, fonts and generated images).
- **Room-based action roguelike** (this is the genre template when the prompt names a roguelike):
  - **Controls:**
    - move: WASD or arrows;
    - aim: mouse, or the movement direction on touch;
    - attack: click or J;
    - dash: Space or K, with brief invulnerability;
    - special: hold the attack button to charge it.
    - Touch gets two on-screen buttons.
  - **Rooms:** 6–8 per run, of three kinds:
    - fight rooms that lock until they are cleared;
    - a **blessing room** that offers 1 of 3 upgrades;
    - one shop that spends coins.
  - **Enemies:** 3 types (a fast melee one, a ranged one, and a slow one that charges) and **1 boss with 2 phases**.
  - **Upgrades:** at least 8, and they stack, for example chain lightning, a dash trail, crit chance, lifesteal, attack speed and a bigger special.
  - **Feel** (these are required):
    - screen shake and hit-stop of about 60 ms;
    - enemies flash white when hit, and damage numbers pop up;
    - a dash trail and particles, with a capped pool;
    - sound effects from Web Audio.
  - **Between runs:** shards you collect unlock permanent upgrades in a hub screen, saved in localStorage.
  - **Scores:** the run score is posted to `/api/scores` (the existing leaderboard route).
  - **Credits:** a run costs 1 credit, the same as mini mode, so the $2 credit pack still matters.
- **Performance:** a fixed timestep at 60 fps, entity counts capped, and no layout thrash. It should run smoothly on a laptop's built-in graphics.
- **Art:** room backgrounds, blessing cards, the boss portrait and the title art come from the run's generated images. Characters and enemies are drawn in code with glow and particles. Generated sprite sheets don't animate consistently yet, so we don't use them.

### Turns
- Big mode gets **10 app-engine turns**; mini mode keeps 6.
- The first turn writes the core loop and the controls. Later turns add rooms, enemies, upgrades, the boss, and then polish.
- After every turn the engine's gates must pass: the build passes and `/play` returns 200.

### The Auto panel
- The step label says "🎮 Tidebreak: one big game" instead of "three mini games".
- The code wall shows the game's files while they are being written. That works today with no extra code.

## Done when

- [ ] Auto with the Tidebreak prompt picks `big`, and the "Games" toggle in the Auto window can change it.
- [ ] `/play` loads one game, playable with keyboard and with touch. A run goes room, blessing, rooms, shop, boss, and ends in death or victory.
- [ ] The leaderboard and the 1-credit cost work in the deployed build.
- [ ] Mini mode is unchanged for prompts that aren't games, checked with one regression run.
- [ ] `scripts/check.sh` passes.

## Out of scope

- Multiplayer, saved runs that sync between devices, a level editor, and 3D (see [04-3d.md](04-3d.md)).
