# ARES web engine: how the files fit

`index.html` loads classic scripts in this order: `game.js` (core: loop, input, player,
camera, hit rules), `sfx.js` (sound effects; it wraps the others at window `load`), `fx.js` (the FXK effects kit, may be missing), `stage.js` (stages, kits,
camera zoom, titan, boons, chant), `boss.js` (boss fights), `enemies.js`, `foe-fx.js`, `boss-spells.js`,
`foe-casts.js`, `spells.js`, `hazards.js`, `personality.js`, `intro.js`, `moves.js`, `trails.js`, `thousand.js`, `skywave.js`, `weapons.js`, `quake.js`, `icons.js`, `drops.js`, `mood.js`, `heroine-status.js`, `look.js`, `pose-fit.js`, `loadout.js`, and then calls
`ARES_BOOT()`. The last fifteen layer on top of the core by reassigning its top-level functions (a classic
script's `function` declaration is a writable `window` property), so the core never calls them
directly. Top-level `const`/`let` such as `FXK`, `CFG` and `RUN` are not on `window`: test them
with `typeof X !== 'undefined'`. Classic scripts share one global scope, so each file uses the
core's globals directly.
Each file has one owner. Don't edit another file; ask for a hook instead.

## Core globals other files may use

- Screen and math: `W` `H` `GROUND` `R(a,b)` `clamp` `lerp` `ang(x0,y0,x1,y1)`, `boxHit(a,b)`
  `circBox(cx,cy,r,box)` `segDist(px,py,x0,y0,x1,y1)`, `ctx` (canvas 2D, already in world
  space while drawing), and `T` (game time, seconds).
- State: `P` (the player: x, y feet, vx, vy, face, ground, hp, hero, aim, meter, iframe),
  `B` (the current boss or null), `enemies` `bullets` `fx` `parts` `decals` `patches` `plats`,
  `cam` (x, y, z zoom). `VW()` and `VH()` are the visible world width and height. `stage`
  is the current stage from stages.json.
- Time: `later(t, fn, tag)` runs fn after t seconds of game time.
- Bullets:
  - `ebullet(x, y, angle, speed, {type, r, dmg, life, accel, cancelable, reflectable})` makes an
    enemy bullet; push it onto `bullets`. `type` is `orb` (default), `heavy` or `doom`.
    `orb` can be reflected and cancelled, and dashing through it works. `heavy` (gold, white
    ring) ignores reflect and cancel, but a dash still passes through it. `doom` (black core,
    crimson rim) ignores reflect, cancel and the dash i-frames, so the player must jump or move.
  - `pbullet(x, y, angle, speed, {dmg, big, feather, home, status, pierce, cancels, life})`
    makes a player bullet; push it onto `bullets`.
- Hits:
  - `damage(e, dmg, {x, y, kb, launch, status, small})`: hurt an enemy or the boss.
  - `applyStatus(e, 'burn' | 'shock' | 'char' | 'freeze')`.
  - `hurtPlayer(dmg, dir)` (respects nothing: check `P.iframe > 0` yourself first, and
    call `perfectDodge()` if `P.perfect > 0`).
  - `hurtbox()`: the player's box.
  - `targets()`: enemies plus the active boss. `nearestTarget(x, y)`.
  - `cancelBullets(x, y, r)`: cancels enemy bullets.
  - `explode(x, y, r, dmg, status)`: also breaks the scenery.
- Effects:
  - `sparks(x, y, n, 'r,g,b')` `burst(x, y, n, color, speed)` `ring(x, y, r, color)` `zapFx(x, y)`.
  - Assign to `shake` `flash` `flashColor` `dim` `slowT` `stopT` to punch an effect.
  - `SFX.slash|heavy|shot|reflect|cancel|boom|zap|hurt|glare|hit|dodge()`, `say(hero, key)`,
    `callout(text, x, y, big)`, `subtitle(text, seconds)`. On-screen text must be English:
    both drop any string that contains Japanese. Pass the `en`, `line_en`, `chant_en` or
    `downLine_en` field. Japanese text is for voices only.
  - An effect is `{t: 0, dur, update(dt)?, draw(k)}` pushed onto `fx`. `draw` gets
    k = t/dur and runs in world space with ctx saved and restored around it.
- Painted art:
  - `A.fx[name]` is an effect strip of 6 frames side by side; it may be missing, so draw a
    procedural fallback. `fxStrip(name, x, y, dur, scale)` makes an effect from a strip.
  - `sheet(sprite, name)` is a sprite sheet `{img, n, x, y, h}` or null; `x, y` are the feet
    anchor inside a 768 slot.
  - `drawSheet(s, frame, x, y, face, scale, alpha)` draws one frame, feet at x, y.
- Ground: `groundAt(x, fromY)` is the y of the walk line under x, at or below fromY: the
  ground, a platform, or Infinity over a pit.

## stage.js

Plays `data/stages.json` section by section (`run`, `chase`, `arena`, `titan`). It also owns the
art kits, the zoom camera, the Oracle's chant and the boon pick. Globals:

- Data: `STAGES` (stages.json), `FIGHTS` (fights.json), `ENEMIES` (enemies.json).
- Current stage: `stage`, `stageIdx`, `kit` (the art kit), `pits`, `chase` (the pushing wall),
  `arena` (`{from, to}` while in an arena), `look` (the stage look: dark, red_moon, storm),
  `TI` (the active titan or null).
- `RUN`: state for one run: `boons`, `spells`, `spell` (chosen index), `carry` (boss HP kept
  between visits), and the boon offer.
- `VW()` and `VH()`: visible world size at the current zoom.
- `sheet(sprite, name)`, `drawSheet(...)`, `groundAt(x, fromY)` and `spawnEnemy(type, x, y)`.
  An unknown type spawns a drone.
- `sectionBeaten(s, killed)`: call it when a section's boss or titan is done.
- Spells: `startChant(id)` returns false if she can't chant now. `spellReady(id)` checks
  cooldown and meter. `cycleSpell()` picks the next known spell (E).
- `BOONS` and `stageClear()`: after each stage the player picks one of three boons.

## boss.js

`startBoss(handle, sec, {chase, until})` reads `FIGHTS[handle]` and sets the global `B`.
With `chase: true` the boss runs behind the player in the chase section. `until` is the x where
it gives up. Main `B` fields: `handle`, `f` (the fight data), `hp` `max`, `mode` (index into
`f.modes`), `active`, `window` (rest time, extra damage taken), `x` `y` (feet), `face`, `h`,
`anim`, `leap`, `run`, `chaser`, `sec` and `box()`.

`PATTERNS` maps a pattern name from CONTENT.md §4 to a function. It starts the attack and
returns how long it lasts in seconds. Then the boss rests for `modes[].rest`. Shared helpers:

- `hitPlayer(dmg, dir)`: hurts the player unless they have i-frames; handles perfect dodges.
- `bossLeap(x, y, dur, h)` and `bossRunTo(x)`: move the boss.
- `AR()`: the arena bounds `{l, r, w}`. Outside an arena it is the visible screen.
- `bossHand()` and `bossMid()`: spawn points for bullets.

## fx.js

`FXK` is the painted effects kit. The core calls it inside `try` and works without it:

- `FXK.slash(x, y, angle, len, {color: 'gold'|'crimson'|'white', heavy, thunder, flip})`
- `FXK.hit(x, y, dir, power)`: `dir` is a facing (+1 or -1) or an angle; `power` is 0 to 3.
- `FXK.thunderBlade(x, y, angle, len)`
- `FXK.smoke(x, y, n, {color: 'dust'|'dark'|'ember', size, spread, rise, vx})`
- `FXK.ultPanel(hero, {name})`: returns the duration in seconds. Drawn in screen space.
- `FXK.update(dt)`, `FXK.draw()` (world space) and `FXK.drawScreen()` (screen space, last).

## enemies.js

Defines `ENEMY_BASES = { <base>: { init(e), update(e, dt), draw(e) } }` for the bases in
`data/CONTENT.md` §3. The core makes `e` from `data/enemies.json`:
`{ type, def, x, y, vx, vy, hp, max, face, t, r, flash, stun, air, burn, shock, charred, spawn, box() }`.
Ground bases keep `y` at the feet; floating ones keep `y` at the centre.

The core does the following, so `update` only does movement and attacks while the enemy is
free to act: spawning, status ticks, juggles in the air (`e.air > 0`), stun, knockback decay,
death, removal, and touch damage (unless `def.noTouch`).

`draw(e)` draws at `e.x, e.y` in world space. Use `sheet(def.sprite, 'idle'|'move'|'attack'|'hurt')`
when it exists, flip by `e.face`, and tint by `def.tint`. Show a readable wind-up before
every attack, and keep Teknium's red eye on every automaton.

Rhythm and pressure (enemies.js):

- Every attack is approach, wind-up (telegraphed), strike, then a recovery (`EN_REC`) in which
  the enemy slumps, dims its eye, vents steam and takes `EN_OPEN` (1.35x) damage.
- Turns: at most two shooters wind up or fire at once (only one while a beam is involved), and at
  most two melee swings. Drones drift away when she closes in; gunners back off.
- Flanking: melee foes share her two sides (`enFlankPlan`). A second grunt on a held side vaults
  over her to the free side; hoppers hop to it; if both sides are held it waits just out of reach.
- Pressure: `damage` is wrapped to count hits per enemy (last 1.5 s, and hits while juggled).
  Past a threshold (6 hits, elites 5, 5 juggle hits, or a long combo) and off cooldown (5.5 s,
  elites 4 s) it
  answers (`enRespond`): a 0.24-0.32 s gold tell with armour (hits do 45 %, no launch), then
  shove (grunts, drones, sentries, casters: a shockwave that throws her back), guard (shield:
  ~1 s brace at 12 %, then a shield shove), backstep (gunners: hop out, shoot at once), leap
  (hoppers: kick-off backflip), counter (hounds: a goring lunge). Dash i-frames, perfect dodge
  and the Messenger's counter beat every answer. Shoves only push (elites add 30 % damage);
  the hound's counter is the one that really hurts. `enKnock(x, y, r, dmg, pow)` is the push.

Bosses (boss.js) count hits the same way; combo-locked (11 hits in 1.5 s, 18 while resting, every
10 s, less in later modes) they burst: a 0.4 s gold armour flash (`B.guard`, half damage), then a
radial shockwave that throws her away (no damage: it breaks her string) and clears her shots. Each pattern opens with a crimson
eye glint; resting bosses sag, dim the glare and vent steam.

## foe-fx.js

`FOE`, the enemy and boss attack effects. Loaded after enemies.js; enemies.js and boss.js call
it through guarded helpers (`fo`, `bfo`), so the game runs without it. It also wraps
`drawBullet` to give enemy bullets a comet trail and a muzzle flash where they leave.
Colours: crimson, gold, warm orange, white-hot. Layers are cached gradient strips and one noise
tile stretched with drawImage; `PERF.low` skips the noise and thins particles.

- `FOE.beamFx({x0, y0, a, len, dur, w, col, src(), angle(t), hit(x0, y0, x1, y1), boss, kind})`:
  a whole beam as an fx entry: pops on, holds (sparks and scorch where it meets the floor, clipped
  by `FOE.clip`), then fades into embers. `src` and `angle` let it follow a hand or sweep.
- `FOE.beam(x0, y0, x1, y1, {w, k, col, end})`: draw one beam (ink, glow, body, flowing
  streaks, white-hot core, end flares). `FOE.charge(x0, y0, a, len, k, {w})`: the telegraph
  (aim line that brightens, lane, growing glow, closing ring, last-instant glint).
  `FOE.gather(x, y, r)` spawns a mote drawn into a charge (call per frame).
- `FOE.clip(x0, y0, a, len)` -> `{x, y, len, hit}`: where a ray meets a walk line, wall or column.
- `FOE.muzzle(x, y, a, col, s)`, `FOE.swipe(x, y, face, reach, {heavy})`,
  `FOE.shock(x, y, r, {ground, flat, col, dur})`, `FOE.tell(x, y, dur, s, col)`,
  `FOE.rim(x, y, rx, ry, k, col)` (inside a draw), `FOE.impact(x, y, dir, power)`,
  `FOE.scorch(x, y, r)`, `FOE.embers(x0, y0, x1, y1, n)`, `FOE.spatter(x, y, a)`, `FOE.glowAt`.

## boss-spells.js

`BOSS_SPELLS`, big boss spells added to `PATTERNS` at load (and `PATTERN_POSE`). Not listed in
fights.json: the `startBoss` wrapper copies the fight (`B.f`) and splices each boss's spells into
its modes (signature in every mode, one more spell per later mode, two in the last). Set
`window.NOSPELLS = 1` before a fight to get the plain data fight. Each boss has one warm colour
family (`HUES`: crimson, ember, gold, rose, white, blaze, spark). `BOSS_SPELLS.SET` is the table:

| boss | colour | spells (signature first) |
|---|---|---|
| Lokee | gold | radiance, nova |
| flownium | ember | firewall |
| Adolan | ember | firewall, storm |
| salt555 | white | radiance |
| HotDawg | gold | storm |
| UKG | gold | maelstrom |
| MikeMonty | blaze | firewall |
| Nicho | spark | **arcs**, storm |
| sovthpaw | white | storm, radiance |
| GhostBear | crimson | **hound**, storm |
| rahlquist | ember | nova, maelstrom |
| Suzu | rose | radiance, storm |
| LocutusOfTheEye | crimson | maelstrom, firewall |
| Teknium | white | **stopped_hour**, radiance, storm, maelstrom |

- `storm`: the screen dims, a floor rune; bolts strike marked spots (0.72 s mark each), every
  third on her. `firewall`: floor seams glow 1.4 s, then pillars hold 3.2 s over the visible floor;
  gold posts mark two gaps (one at the boss's feet). `maelstrom`: a sigil over the boss tracks her
  1 s, locks, then a thick churning beam holds 2.4 s just past her (step toward the boss).
  `radiance`: a halo tracks her, edge lines and a floor patch, then a holy cone (move out).
  `arcs` (Nicho): charge-crackle at the hand, then 5 white-gold darts that spread and curve in,
  staggered (dash through). `nova`: a slow molten orb (about 1/6 screen) arcs to a floor ring and
  bursts on contact or arrival; three in the last mode. `hound` (GhostBear): a fire ring is drawn
  0.8 s with a lane line, a flame beast runs the lane (jump it), and a gold fire pillar with
  lightning veins erupts where it hits her or the wall. `stopped_hour` (Teknium): a clock winds
  up 0.7 s, then `stopT` freezes the world in sepia while only the boss (in colour) blinks around
  her placing 12 weapons with guide lines (ring, rows, cage, fan, always one gap); a tick, colour
  and flash, 0.3 s grace, then they fly. From mode 1 her held shots are re-aimed; the last mode
  stops twice. No damage while frozen.
- The autopilot is steered by a **hint**: an invisible `kind: 'laser'` fx placed just beside her
  (or parked far away when she is safe), so the core's laser dodge walks her toward the gap.
- `PERF.low`: fewer bolts, pillars, darts, petals and weapons (7), one flame layer, a flat sepia
  overlay instead of the blend filter, and no shake stacking.

## foe-casts.js

`FOE_CASTS`, aimed spells for casters and minibosses. It adds kinds to `EN_KINDS`, `EN_KIND_DEF`,
`EN_REC` and `EN_RANGED` (so the ranged token applies) and wraps `enAttacks` to append them by
enemy type (`window.NOCASTS = 1` turns them off). Kinds may set `wind(e, dt, k)`, which
enemies.js calls during the wind-up to draw their own telegraph.

- `firewave` (shield, grunt elites): a floor ring and lane, a breath cone, then rolling fireballs
  both ways (jump them). `ricochet` (caster, caster elite, drone elite): a dashed preview that
  bounces off floor, ceiling and screen sides, then an instant beam along it. `saw` (hopper,
  hound elites): a rolling saw that turns once at the screen edge. `discs` (sentry, gunner elites):
  two discs that fly out and come back. `shards` (ring caster, spiral sentry): 4 to 6 marked floor
  spots, then lobbed shards. `slowfield` (caster elite): a ring that halves her speed for 3.2 s,
  then the next attack follows at once. `sweepbeam` (caster elite): a fan preview, then a beam
  that sweeps down across her (dash through).
- New attack kinds and boss patterns are added at runtime, so `tools/check-content.mjs` and
  fights.json stay unchanged; to put them in data files, add the names to the checker first.

## spells.js

Defines `SPELLS = { <kind>: (spell, o) => void }` for the kinds in CONTENT.md §5.
`o = { x, y (her hand), aim (radians), dir (±1), tier, power (1 + tier * 0.5) }`.

The core handles cooldown, meter, the chant (subtitle, voice, a big gold magic circle and
the camera zoom on her) and the release callout, then calls `SPELLS[spell.kind](spell, o)` at
release. Spells should cancel enemy bullets where they make sense, leave statuses
(burn, shock, char, freeze), break scenery through `explode`, and shake the screen in
proportion to their tier. Use `A.fx[...]` art when present.

## hazards.js

Stage hazards that follow enemy attacks. `afterAttack(what, x, y, o)` is called by boss.js
(slam, rush, pattern) and stage.js (titan slam). It spawns `hazard(kind, x, y, o)` entries in
`HZ`, picked by the stage element (`hazardElement()`: shock on storm or ruin, fire on ember or
red-moon stages, stone otherwise):

- `debris`: a shadow tell, then a falling rock.
- `fire`: a burning floor strip that ticks damage and burns enemies too.
- `shock`: a crackling ring.
- `crack`: eruptions running out along the floor.

`updateHazards(dt)` and `drawHazards()` are called from the core loop and `drawWorld`.

## personality.js

Barks: `bark(id, key, o)` plays `assets/voice/<id>/bark-<key>.mp3` and shows its `line_en`.
`id` is a hero id, a lower-case boss handle, `enemy-<type>` or `asura`. Heroines and bosses go
through the voice queue; machines use a quieter channel and only speak into silence. It wraps
core events (perfect dodge, swap, pit fall, boon, stage clear, low HP, kills, boss rest and hurt,
titan, spawns) and runs `persTick(dt)` each frame. That tick handles:

- The idle tease: after 4 calm seconds she turns to the player, the camera comes in, and the
  `m-tease`/`o-tease` sheet plays.
- The combo gloat, boss taunts, and the boss's line when it wins.
- After a boss falls, the `m-win`/`o-win` pose.

## intro.js

The pre-fight exchange. `startBoss` is wrapped so that, once the boss has landed, `startIntro`
holds the fight. The camera comes in on each speaker, a painted portrait slides in
(`assets/art/portraits/<boss id>.webp`, `assets/art/cutins/<hero>-pose.webp`), and the line
types out under the name. Lines come from `fights.json <handle>.intro`; voices are
`<boss id>/intro-<n>.mp3` and `<hero>/intro-<boss id>-<n>.mp3`. J, space or enter moves on and
Esc skips; autoplay moves on by itself. `INTRO` is set while it plays; the core skips the HUD
then.

## moves.js

The Messenger's signature moves:

- Flash Step: her dash turns her into a gold blur. Enemies she passed through take a delayed cut.
- Hundred Petal Dance: up + L, or L within 1.2 s of a perfect dodge, costs 50 meter. She blinks
  to up to 6 nearby targets (8 hops) and cuts each, then lands home and every cut opens at once.
- Sky Rend: `waveShot` is replaced with a wind-and-lightning crescent that chains a bolt to each
  enemy it hits.

The Oracle's dash is a feather blink: she disappears and reappears 240 px away, stopping short of
walls and pits.

Effect helpers: `boltFx`, `streakFx`, `cutFx`, `windCurls`.
- Moon Flash (月閃): E, aimed with the arrows (any of 8 directions; none = forward), 4.5 s cooldown.
  One teleport slash up to a corner-to-corner distance, stopped by the arena bounds, the ceiling,
  floors and walls. A beat after she lands, everything on the line takes its cut at once.

Afterimages: `ghostPose(sheet, frame)`, `drawGhost({x, y, face, sheet, frame, col, solid}, alpha)`
(her frame tinted gold or rose, cached) and `ghostFx(g, dur, delay)`.

## trails.js

Baker's sword trails. `slashArc` is wrapped: for the Messenger each swing samples the blade tip
and an inner radius every frame (4 sub-steps from the swing curve, 1 under `PERF.low`) and draws a
tapered additive ribbon with a white-hot leading edge. Styles per move (`TRAIL.moveStyle`):
molten (light chain, heavies, dash cut; wider each hit, sparks with gravity), bleed (wave, rend,
charged slash; crimson drips), star (spin; glints around the circle), dust (launcher, air chain,
slam; drifting crimson motes), dark (counter; white-gold flash over a crimson-black smoky edge).
`TRAIL.tier` 1-3 (or the `blade` boon; `TRAIL.level()` reads both): more sparks, longer life, and
an echo ribbon at 3. `TRAIL.on = false` restores the old arc; `TRAIL.painted = true` keeps the FXK
crescent under the ribbon. `TRAIL.swing(name, arc, opts)` starts a trail from other code.
The ribbon is drawn in age bands, each one smooth shape (quadratic curves through the samples,
round joins) in three passes: a wide faint glow, a body with a gradient across the width, and a
thin hot core. Particles are soft round sprites: `TRAIL.soft(rgb, core)` renders a radial-gradient
dot to a small cached canvas once per colour, and `TRAIL.dot(rgb, x, y, r, alpha, {len, a, core})`
draws it (stretched along `a` when `len` is set). `TRAIL.lens(x0, y0, x1, y1, hw, rgb, alpha)`
(defined in thousand.js) draws a line tapered at both ends; the web lines and Moon Flash use it.

## thousand.js

Baker's ultimate, 千閃 Thousand Flash (the core `ultimate()` is wrapped, so R at full meter still
triggers it; the Oracle's is unchanged). `ULT` is set while it plays (the core player update is
skipped). Corner-to-corner legs that pierce and leave a web of molten lines and afterimages, the
giant crescent, then the Crimson Eclipse: a cut on the main target, a dark crescent across a white
sky, a white-out, and `ECL` (a giant blood-red crescent moon rising behind the arena via
`drawLookSky`, about 60 % of the screen wide at level 1 and wider than the screen at max, its body
pre-rendered once per eclipse, with a live tapered rim and slow drips from its lower tip; a
darkened crimson sky, a red tint, ash
and petals, and a half-moon mark on the target, which takes +20 % from every hit while it lasts).
Its size and length (3-10 s) scale with the `moon` boon (ult level) and the sword level. Both
boons are added to `BOONS` here.

## skywave.js

Baker's 天衝濤 Heavenpierce Tide: U (added to `SKILL_KEYS.messenger`, so the core binds it and the
HUD shows its cooldown), 9 s cooldown, move `MOVES.messenger.skywave`. She hops with the sword
raised (slash3), plunges (airslam) and on landing drives it into the floor: hitstop, a big shake,
a flash, a soft ground shock. A gold crack runs ahead along the floor and a wall of light rolls
forward from the impact (about 870-1050 px, stopped by the arena edge), always as tall as the
view. Everything the wall passes takes 5-7 hits, each one launching it higher (bosses take the
damage, no launch); breakable platforms it passes break; enemy bullets in it (not doom) are
cancelled. Drawn from cached soft column sprites (horizontal and vertical falloff, per colour),
`TRAIL.soft`/`TRAIL.dot` blobs and embers, banded ribbons with a vertical alpha gradient,
crimson-gold lightning veins that crawl up, rounded rock chunks and `FXK.smoke` dust.
`TRAIL.level()` 2: wider, brighter, more damage; 3: a rose echo wave 0.32 s behind and more
lightning. `PERF.low`: wider column spacing, 3 ribbons, fewer veins, rocks and embers.
`SKYWAVE.launch({x, gy, face, scale, echo, speed})` raises a wave from other code.
Sound: `SFX.heavy()`, `SFX.boom()`, then the optional `SFX.skywave()`. AUTO uses it on three or
more enemies ahead.

## weapons.js

Baker's sword choice. `WEAPON.list`: `winged` (the winged greatsword, outfit `default`, ultimate
Thousand Flash) and `coresunder` (地核断 Coresunder, outfit `coresunder`, ultimate the quake). On
the heroine select, with Baker picked, up or down switches it; the name and its painted icon
(`iconArt('weapon.<id>')`) sit under her name. Remembered in localStorage `ares.sword`;
`?sword=coresunder` forces it. Picking a sword loads `assets/skins/messenger/<outfit>/`, measures
each sheet with `anchorOf`, redraws it at the default sheet's cell size, height and feet anchor,
and swaps the entries in `A.sheets.messenger` (missing sheets fall back to the nearest one of the
same outfit). `WEAPON.set(id)` (async), `WEAPON.is(id)` (picked and loaded), `WEAPON.loaded()`.

## quake.js

天地崩 Worldfall Rupture, Baker's ultimate while `WEAPON.is('coresunder')` (otherwise
`ultimate()` falls through to Thousand Flash, unchanged). The same portrait panel plays first,
then she leaps to the top of the view and plunges. On impact: hitstop, a white flash, and the
whole map shakes for about 3 s, easing out. Cracks spread along the floor to both view edges and
across every platform in view, and `SKYWAVE.launch` raises short sky waves in a staggered
cascade from the impact outward (and on each platform). Every enemy on screen is launched and
juggled; the boss takes heavy damage, no launch; nearby platforms take damage. It ends with
settling dust, drifting embers and a short warm afterglow. Level = 1 + the `moon` boon: tighter
sites, more damage, a second cascade from level 2. `TRAIL.level()` adds ribbons and brightness;
`PERF.low` spaces the sites out. Sound: `SFX.heavy()`, `SFX.boom()`, then the optional
`SFX.quake()`.

## Camera and sizes

`?hero=oracle` starts as the Oracle. `fitScale()` sets `SCALE` at boot so each heroine's idle
sheet stands `HERO_PX` world px tall, whatever size it was painted at.

Bosses stand as tall as the heroines (`heroHeight()`, about 160 world px). With one enemy left
and nothing else going on, `updateCamera` frames the duel close. `cam.focus = {z, t, x?, y?}`
holds a close-up for `t` seconds.

## icons.js

Painted icons on the cards. Icons: assetrizz by mojomast (Kyle Durepos), used with permission
(`hand_painted_fantasy`, 160 px WebP in `assets/art/icons/`, cool hues pulled to gold and crimson).
`icons.json` maps game ids to files: `boon.<id>`, `spell.<kind>`, `drop.<kind>`. `iconArt(id)` is the
loaded image or null. `drawIcon` is wrapped: an icon name `art:<game id>|<fallback>` draws the
painted icon (132 px, inside the card's disc) and the code icon until it has loaded. `boonInfo` is
wrapped to mark plain boons that way, and the `SPELL_ICON` entries are rewritten, so the
upgrade-spell, new-spell and pull cards and the pull sockets all use it. Card glow, shine and
text are unchanged.

## drops.js

Item drops (`DROPS.list`). `kill` is wrapped: a plain enemy leaves a health potion (heals 10)
12 % of the time or a gold coin (+6 meter, `RUN.gold`) 10 %, at most one every 2.5 s; an elite
always leaves one (a 16 potion under 70 % life, else gold); at most 8 on the ground; bosses
none. Drops pop, settle on the walk line, bob, glint every 1.6 s (not under `PERF.low`), are
taken on touch with a sparkle and fade after 14 s; a new stage clears them. They ride on
`updateHazards`/`drawHazards`. `?drops=0` turns them off; `DROPS.rate` scales the plain chances.

## mood.js

Light and weather on top of a stage kit (`MOOD`), read from the kit's own `kit.json` (fetched
once per kit): `night` 0..1 lays a dark layer over sky, far scenery, ground and platforms but
under the fighters, with a warm lantern glow at each fighter's feet; `moon {x, y}` (fractions
of `sky.webp`) gives the sky a big soft halo and each fighter a thin ivory rim on the side
facing it; `storm` flashes lightning now and then (2-3 white frames, then a darker beat);
`wet` adds faint puddle reflections under the floor line; `flicker` 0..1 makes the haze
breathe +-3 % on a noise curve; `heat` 0..1 wobbles the far scenery; `weather` snow, petals
and embers also get a bigger, slower, blurred near layer in front of the fighters. `PERF.low`
thins the near layer and drops reflections, rim and wobble. It wraps `drawLookSky`,
`drawHazards` (runs after the platforms, before the fighters), `drawSprite`, `drawSheet`,
`drawOverlay`, and stage.js's `drawFarPiece`. Loaded last, after `drops.js`.

## heroine-status.js

`HSTAT`, statuses enemies put on her (loaded last). Attacks are tagged in one table, `HSTAT.MAP`
(no data-file fields, so `tools/check-content.mjs` is unchanged): boss patterns and spells
(`firewall`, `hound`, `nova` burn; `storm`, `arcs` shock; `freeze` chills; ember and blaze bosses
also burn with `slam`, `rush`, `wallkick`, `lances`, `pillars`, `maelstrom`), enemy kinds
(`firewave` burns, `ricochet` shocks, `slowfield` chills; hound rushes burn on the ember and
inferno stages) and hazards (`fire`, `shock`). `PATTERNS[*]` and `EN_KINDS[*].start/tick` are
wrapped to run under that status; fx entries, bullets and `later` timers made inside carry the
tag, and the wrapped `hurtPlayer` applies it when the hit really took HP (`hzHurt` too).

- burn: 3 s, 2 HP every 0.6 s (never below 1 HP); a dash or dodge-roll puts it out.
- shock: a 0.25 s jolt at 0.7 s (still inside the hit's i-frames), skill cooldowns run at 70 %
  for 2 s, then 3 s immune to shock.
- chill: 2.2 s at 65 % move speed (not on top of `P.slow`); a second chill while chilled or within
  1.4 s freezes her 0.6 s (each key press takes 0.06 s off), then 3 s immune to chill. A frost or
  slow field chills once, the first frame it slows her. Nothing chills while `stopT` holds.
- One status at a time; blocked by i-frames, `ULT`, `ECL` and the counter guard.
- Looks (on her sprite only, via a wrapped `drawSprite`): ember tint and flickering flames, white-gold
  arcs, an ivory-cyan frosted rim with breath puffs, an ice crust when frozen. HUD pips (icons
  only) sit right of the skill circles, under the HP bar; dim pips mark immunity. `PERF.low` thins all of it.
- Autopilot: dashes out of burn when the dash is free, mashes when frozen.
- API: `HSTAT.apply(kind, src, force)`, `HSTAT.force(kind)` (tests; `freeze` skips the chill),
  `HSTAT.clear()`, `HSTAT.kind`, `HSTAT.log` (`{kind, src, at, dur, why}` per status), `HSTAT.TUNE`.

## sfx.js

Sound effects from CC0 files in `assets/sfx/` (credits in `assets/sfx/CREDITS.md`), on the core's
`AC`. The bank loads lazily on the first `unlockAudio()`. Each `SFX.*` the core calls (`slash`,
`heavy`, `shot`, `reflect`, `cancel`, `boom`, `zap`, `hurt`, `glare`, `hit`, `dodge`) is reassigned
to a router that picks a file from who is acting (Baker, Oracle, an enemy kind, a boss pattern, an
Oracle spell, a Thousand Flash phase); if a file is missing it falls back to the old synth.
`SFX.skywave()` (Heavenpierce Tide) and `SFX.quake()` (the second-sword quake) are new; callers
guard them with `if (SFX.x)`. New hooks wrap globals at `load` (damage, kill, flashCut, land,
ultimate, startChant, castSpell, every `SPELLS[kind]`, `EN_KINDS[kind]`, `PATTERNS[name]`, ...)
and it rides the core's `frame` (no loop of its own), so the clock is the frame time.
- API: `SFXR.play(name, {vol, rate, pan, x, jitter, delay})` returns `'ok' | 'skip' | 'missing'`;
  `SFXR.loop(name, {vol, fade, alive})` returns `{stop(fade)}`; `SFXR.BANK` is
  `name: [variants, vol, cap, cooldown s, pitch jitter]`; `SFXR.setVolume(0..1)` (kept in
  localStorage `ares-sfx-vol`).
- Every sound has a cap on voices at once and a cooldown (caps halve under `PERF.low`), pans by
  screen x, and the master ducks to 70% while `voicePlaying()`.
- URL: `?sfx=0` mutes, `?sfxvol=0.5`, `?sfxlog` records
  `SFXLOG {events, skipped, maxLive, cap, errors, loaded}` (voices too) for tests.

## pose-fit.js

Loaded after `look.js`, so its canvas transform covers the outline, rim and status layers. It wraps
`pickAnim` and `drawSprite` for the heroine only:

- Idle breaks (`m-tease`, `m-breeze`, `m-win` and the Oracle's `o-` ones) are painted taller than the idle;
  they are drawn at the idle's height, scaled about her feet.
- Into or out of a break, the old pose fades out over the new one for 0.18 s, and the idle resumes on the
  frame nearest the break's last pose (`BACK`, measured from the default sheets).
- The crouch (jump sheet frames 0-1 on the ground) is moved down so its lowest opaque row sits where the
  idle's does. It is measured from the loaded image, so every outfit gets its own offset.

## loadout.js

Baker wears what the player equipped in the ARES Player Hub. The Hub's "Equip and play" opens the
game with `?hub=<origin>&player=<id>&loadout=<signed copy>`; at boot `loadout.js` asks
`<hub>/api/loadout?player=<id>` (read-only, CORS) and applies the sword (`WEAPON.set`), the trail
colours and the finisher colours (it recolours each new `TRAIL.swings` entry; trails.js is not
edited). The Hub down: the link's copy, then the last loadout this browser saw, then defaults.
`?loadout=0` turns it off. `LOADOUT` holds what was applied and where it came from (`src`).
