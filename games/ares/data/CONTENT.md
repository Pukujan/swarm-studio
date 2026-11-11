# ARES content contract

The web game (`web/game.js`) reads these files. Each file has one owner at a time.
Coordinates are in world pixels: the screen is 1280x720, the ground line is y = 640,
x grows to the right from 0 at the stage start. Platforms are one-way (you land on the
top from above, drop through with down + jump).

## 1. Stage art kits: `assets/stages/<stage>/`

One kit per stage (`ember`, `gold`, `snow`, `crimson`, `ruin`, `inferno`), painted anime-style
in the same soft painted look as the heroines (never 3D, never photo-real).

- `sky.webp`: 3072x1024 (seam blended so it tiles), the far background, no ground in the bottom 15 %.
- `far-*.webp`: cut-out far scenery (islands, towers, ruins), transparent PNG-like webp.
- `ground.webp`: a seamless strip that tiles horizontally; `top` is the walk line, a little into the paved band.
- `pieces/*.webp`: cut-out platforms and props, transparent.
- `fore-*.webp`: foreground silhouettes (vines, chains, rocks) drawn in front of everything.
- `kit.json`:

```json
{
  "stage": "ember",
  "tint": "#ff9a6a",              // light colour for the haze and particles
  "haze": ["rgba(255,170,120,0)", "rgba(120,40,40,0.35)"],
  "weather": "embers",           // none | embers | rain | snow | ash | petals | sparks
  "night": 0.5,                  // optional mood (web/mood.js): dark layer under the fighters
  "moon": { "x": 0.3, "y": 0.36 },  // optional: the painted moon in sky.webp (fractions)
  "storm": true, "wet": true,    // optional: lightning; puddle reflections
  "flicker": 0.5, "heat": 1.0,   // optional: lantern flicker on the haze; heat haze on far scenery
  "ground": { "file": "ground.webp", "top": 18 },          // px from the strip's top to the walk line
  "far": [ { "file": "far-0.webp", "w": 480, "h": 440 } ],
  "fore": [ { "file": "fore-0.webp", "w": 400, "h": 700, "at": "top" } ],   // at: top | bottom
  "pieces": {
    "ledge-0": { "file": "pieces/ledge-0.webp", "role": "ledge", "w": 587, "h": 173, "top": 20, "l": 30, "r": 560 }
  }
}
```

For pieces, `w` and `h` are the image size. `top` is the px from the image top to the
walkable surface, and `l`/`r` are where the walkable surface starts and ends, all in image px.
Roles:

| role | what it is | walk on it |
|---|---|---|
| `ledge` | floating platform, medium | yes |
| `bridge` | long floating platform | yes |
| `step` | small floating stone | yes |
| `stairs` | stairs rising from the ground | yes |
| `column` | tall breakable pillar standing on the ground | top only |
| `prop` | small breakable thing on the ground (brazier, crate, statue) | no |
| `wall` | tall wall piece for wall kicks, stands on the ground | no |

Each kit has at least 2 ledges, 1 bridge, 2 steps, 1 stairs, 1 column, 2 props, 1 wall.

## 2. Stages: `data/stages.json`

```json
{ "stages": [ {
  "id": "ember", "name": "Ember Terraces", "jp": "焔の段丘", "kit": "ember", "length": 7200,
  "zoom": { "calm": 1.25, "fight": 1.0, "crowd": 0.82 },
  "sections": [
    { "kind": "run",   "from": 0,    "to": 1600, "plats": [ { "role": "ledge", "x": 560, "surf": 480, "w": 300 } ],
      "waves": [ { "when": "enter", "enemies": [ { "type": "grunt", "x": 900 } ] } ] },
    { "kind": "chase", "from": 1600, "to": 4200, "wall": { "speed": 230, "color": "#ff5a3c" }, "pits": [ [2100, 2240] ],
      "crumble": [ { "x": 2300, "surf": 520, "w": 180 } ], "chaser": "Lokee" },
    { "kind": "arena", "from": 5900, "to": 7180, "boss": "Lokee" }
  ] } ] }
```

- `plats` entries: `role`, `x`, `surf` (y of the walk line; omit for ground pieces), and an
  optional `w` (wanted width; the engine picks the closest piece and scales it), `hp` for
  breakables, and `kind` (`brazier` makes a breakable prop explode into fire).
- `waves[].when`: `enter` (the section starts) or `{ "x": 1200 }` (when the player passes x).
  The section's right edge is a gate until its waves are cleared.
- `chase`: the screen's left edge moves right at `speed` px/s and pushes the player. Touching
  the wall hurts. `pits` are holes in the ground (fall = small damage and a respawn on the
  last safe ground). `crumble` platforms fall 0.6 s after you land on them. `chaser` is a boss
  handle that runs behind the player throwing attacks (its `chase` mode).
- `arena`: the camera stops at the edges, and the boss fight starts when the player walks in.
- `titan`: a colossus attacks from the background while the player fights its waves and takes
  its seals. Shape: `{ "kind": "titan", "from", "to", "titan", "seals": [x or {x, surf, need}], "waves", "boss"? }`.
  `titan` is a handle in fights.json. Each seal is a spot on the floor (`surf` is its walk
  line, default the ground). Standing on it for `need` seconds (default 2.4) takes it. Leaving
  makes the charge fade. Each seal taken hurts the titan, and the last one brings it down. The
  section's gate opens then. `waves` work as in `run`. An optional `boss` handle starts a
  normal boss fight 1.5 s after the titan appears.

```json
{ "kind": "titan", "from": 2400, "to": 4200, "titan": "Asura", "seals": [2900, { "x": 3500, "surf": 520, "need": 3 }],
  "waves": [ { "when": "enter", "enemies": [ { "type": "grunt", "x": 2800 } ] } ] }
```

The titan's fight lives in fights.json. Fields: `sprite` (sheets `a-idle`, `a-raise`, `a-slam`,
`a-sweep`, `a-cast`, `a-hurt`, `a-roar`), `hp`, `attacks` (any of `slam`, `sweep`, `spears`,
`beam`, `summon`, used in order), `every` (seconds between attacks; it speeds up as seals
fall), `en` (the name callout), `line_en` and `downLine_en`.

## 2b. English fields

Everything shown on screen is English. These fields are what the player sees: `en` (names,
mode names, move names), `line_en` (boss lines, barks and intro lines, §4b), `chant_en` (spell chants) and `downLine_en`
(a boss's line when it falls). The Japanese fields (`jp`, `line`, `chant`, `downLine` and the
rest) are for voices only. `callout()` and `subtitle()` drop any string that has Japanese in it.

## 3. Enemies: `data/enemies.json`

```json
{ "enemies": { "grunt": { "base": "walker", "hp": 40, "speed": 160, "dmg": 10,
  "attack": { "kind": "melee", "range": 90, "windup": 0.45, "every": 1.6 },
  "sprite": "automaton-grunt", "scale": 0.4, "statusResist": [] } } }
```

`base` is one of the behaviours the engine knows:

| base | moves | attack kinds it can use |
|---|---|---|
| `drone` | floats near a home point | `fan`, `aimed`, `ring` |
| `sentry` | stands still, turret | `ring`, `spiral`, `aimed` |
| `walker` | walks the ground and platforms, turns at edges | `melee`, `aimed` |
| `shield` | walker with a front shield that blocks hits and bullets; hit it from behind or launch it | `melee`, `bash` |
| `jumper` | hops between platforms toward you | `slam`, `melee` |
| `caster` | blinks to a spot near you, then casts | `laser`, `ring`, `summon` |
| `charger` | waits, telegraphs, then rushes along the ground | `rush` |

`sprite` names a folder under `assets/skins/<sprite>/default/` with sheets `idle`, `move`,
`attack`, `hurt` (6 frames each). Without one the engine draws its own drone shape.

## 4. Boss fights: `data/fights.json`

```json
{ "fights": { "Lokee": {
  "body": "platform",           // platform (runs and jumps the stage) | float
  "sprite": "lokee", "scale": 0.5, "hp": 2400,
  "modes": [
    { "from": 1.0, "name": "第一幕", "weapon": "cane", "line": "Showtime!",
      "patterns": ["spot_sweep", "volley", "rush"], "rest": 2.2 },
    { "from": 0.5, "name": "終幕", "weapon": "confetti", "patterns": ["ring", "rain", "summon"], "rest": 1.6, "stage": "dark" }
  ],
  "chase": { "patterns": ["lances", "rush"] }
} } }
```

When boss HP / max drops below a mode's `from`, the boss switches to that mode. It laughs,
says the line, clears its attacks, and shows the mode name as a big callout. `stage` changes
the look of the arena: `dark`, `red_moon` or `storm`. After each pattern the boss rests
(an attack window) for `rest` seconds and takes extra damage while it rests.

Patterns the engine knows (pick from these; new ones need engine work):
`fan`, `ring`, `spiral`, `rain`, `sweep` (floor wave, jump it), `pillars` (lasers where you
stand), `glare` (unavoidable, dash or counter), `volley` (aimed bursts), `spot_sweep`
(a rotating beam from the boss), `rush` (runs across, telegraphed line), `slam` (jumps onto
your platform, ground shockwave), `blink` (teleports behind you and slashes), `clones`
(two copies that fire, one is real), `summon` (calls 2-3 enemies of a type), `lances`
(spears from the ground under you), `iaido` (a ground-level blade wave plus a high one),
`bells` (expanding rings that you dash through), `freeze` (a slow field), `wallkick`
(kicks off a wall and dives at you), `boulders` (black orbs roll along the floor: jump),
`gold_fall` (gold stones fall on red marks: step aside or dash), `doom_wall` (a wall of black orbs
with one gap: get to it).

Bullet colours tell the player what works against them:

| colour | type | reflect / cancel | dash through |
|---|---|---|---|
| red | `orb` | yes | yes |
| gold with a white ring | `heavy` | no | yes |
| black core, crimson rim | `doom` | no | no: jump or move |

`sprite` names `assets/skins/<sprite>/default/` with sheets `idle`, `run`, `jump`,
`attack`, `cast`, `hurt` (6 frames each). Teknium's sheets are `t-idle`, `t-run`, and so on.

## 4b. Voice lines: barks, intros, personality

Every voiced line is `{ "line": "<Japanese, voice only>", "line_en": "<English subtitle>" }`.
Keep each one short (1.5-3 s spoken). The tease is playful and cute, never sexual.

- **Hero barks**, `heroes.json` → `heroes.<id>.barks`: `start`, `kill`, `hurt`, `win`
  (`runner` also `dodge`), plus `tease-idle`, `tease-idle2`, `tease-idle3` (stood still a few
  seconds, teases the camera; pick one), `tease-dodge` (perfect dodge), `tease-combo` (30+ hits),
  `taunt` (boss is resting), `low` (low HP, defiant), `reply` (right after a boss's entrance
  line), `boon` (upgrade picked), `stage` (stage cleared), `swap-in` (tagged in), `fall` (pit).
  Voice: `assets/voice/<hero>/bark-<key>.mp3`.
- **Boss personality and barks**, `fights.json` → each fight: `personality` (one sentence) and
  `barks: { enter, hurt, rest, taunt, down, win }`.
- **Boss intro**, `fights.json` → each fight: `intro`, 3 lines played with portraits while the
  game is frozen before the fight, alternating and starting and ending with the boss:
  `{ "by": "boss", "line", "line_en" }` and `{ "by": "hero", "messenger": {line, line_en},
  "runner": {line, line_en} }` (the active heroine's version is used).
- **Titan barks**, `fights.json` → `Asura.barks: { enter, attack, seal, down }`.
- **Enemy barks**, `enemies.json` → each type: `barks: { spawn, attack, death }`.

Boss, enemy, titan and intro voices are recorded from `data/cast-voices.json`
(`node engine/voice.mjs games/ares/data/cast-voices.json`), whose lines mirror the data
above. Files: `assets/voice/<id>/<key>.mp3` with

| what | id | key |
|---|---|---|
| boss bark | lower-case fight handle (`lokee`, `teknium`) | `bark-<key>` |
| boss intro line n (1-based index in `intro`) | lower-case fight handle | `intro-<n>` |
| heroine intro line n | `messenger` / `runner` | `intro-<handle lower-case>-<n>` |
| titan bark | `asura` | `bark-<key>` |
| enemy bark | `enemy-<type>` (`enemy-grunt_elite`) | `bark-<key>` |

## 5. Spells: `heroes.json` → `heroes.runner.spells`

Big spells chant an incantation (a subtitle, with the voice if recorded), draw a large
magic circle and zoom the camera in on the heroine, then fire. Spell `kind` values the engine
knows: `bolt_rain` (lightning strikes along a line), `thunder_spear`, `chain` (hops between
enemies), `storm_field` (a shocked zone that keeps striking), `meteor`, `flame_wave`,
`ice_lance`, `wind_blade`, `holy_cross`, `gravity_well`, `summon_blades`. Effect art is
under `assets/fx/<name>.webp` (fx sheets, see `heroes.json` → `fx`).

## 6. Controls

J is light, K is heavy, L is the special, I guards. A string ends when a K finisher fires.

Messenger (sword):
- Light chain: J J J. Launcher: up + J. Air: J in the air, down + J to slam.
- Finishers (FINISH table): K, K K, K K K = heavy1, heavy2, Thunder Blade (lightning down the
  blade). J K = Spin. J J K = Sword Wave. J J J K = Charged Slash. J K K and J J K K = heavy2
  and Thunder Blade.
- Special (L): Rend, costs 25 meter. If a string is running it costs 60 % of that and slows
  time briefly (a flourish). It cancels out of any move.
- Guard (I): Counter. A short guard window that punishes what hits it.

Oracle (caster):
- J shoots (hold). K is a heavy feather. K K is Comet. J K is feather again.
- J J K is Halo. J J J K and K K K are Sun Lance.
- Special (L): chants the chosen spell. E cycles the spells she knows.
- Guard (I): Wing, a shield with an 8 s cooldown.

## 7. Boons and spell unlocks

After each stage the player picks one of three cards. One card is a new spell when any are
left. The rest are boons. Each boon stacks up to `max`.

| id | name | what it does | max |
|---|---|---|---|
| `edge` | Keen Edge | harder hits (also stronger spells) | 4 |
| `swift` | Gale Step | quicker dash | 3 |
| `ember` | Embers | hits burn | 3 |
| `storm` | Stormblessed | hits shock | 3 |
| `vigor` | Unbroken | +30 max life and healing each pick | 4 |
| `mirror` | Mirror | stronger reflects | 3 |
| `focus` | Swift Chant | faster chants and shorter spell cooldowns | 3 |
| `zeal` | Zeal | more meter | 3 |
| `leech` | Lifedrink | kills heal | 3 |

A run starts with the spells `chain` and `spear`. The other spells in `heroes.json` are
unlocked by spell cards: `verdict`, `field`, `cross`, `blades`, `frost`, `dusk`. Each spell has
a `tier` (1 to 3) that sets chant length (0.3 s, 0.8 s or 1.6 s) and a `meter` cost.
