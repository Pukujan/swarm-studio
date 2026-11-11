# 21. Plan before spend

## The problem, in plain words

We built the ARES game by hand on the night of 2026-11-10, and it cost far more than it had to, because the
expensive steps ran before the cheap ones had settled anything:

- the game was decided in a long chat (cast, combat, enemies, bosses, progression, money, story), and none of it
  was written down where the crew could read it;
- the characters were painted at full quality three times before the look settled;
- 3D models were made before anyone had seen the game, so each change of mind cost Meshy credits again;
- weapons, animations, systems (logins, payments, gacha, leaderboard, the autoplay pilot, enemy AI) were asked for
  one by one, each a fresh coding run.

The fix is an order, not a feature: **decide cheaply, see it cheaply, then pay once.** The crew interviews the
creator in a few taps, writes the answers on **Plan cards**, shows rough **sketch sheets** and **mock screenshots**
for pennies, and only then shows **one price** for everything expensive. Nothing that costs credits or a long
coding run starts before that one click.

## The flow

```
+ Create (Game)  →  quick questions  →  Plan cards  →  Sketch sheets  →  Mock screenshots  →  Style lock
                      (7 taps)           (editable)      (medium, picks)   (4–5 frames)         (one click)
                                                                                                    │
            Remix a template (Feed) ───────────────────────────────────────────────────────────────┤
                                                                                                    ▼
                                                                         Lock · 324 credits · 8 runs
                                                                         [☐] Test one first
                                                                                                    │
                    Build: turnarounds → multi-view Meshy → rig → shared animations → props → systems → game
```

1. **Questions.** + Create with the Game kind and Grill me on (the one front door, RULES A1) asks the plan
   questions one at a time: genre, cast, combat, enemies, progression, money, look. Each is chips plus "your own
   words"; "Just plan it" fills the rest with the defaults. No text wall: one question, 4–6 chips.
2. **Plan cards.** The answers become nine cards on the Plan board, written by the crew one after another (their
   cursors type them in): **Cast, Story, Combat, Enemies, Progression, World, Look, Money, Systems**. Every line on
   a card is editable. Editing never spends anything.
3. **Sketch sheets.** One image holds 12–20 rough options in a grid (5 × 4 by default) at medium quality: the
   cast, then weapons. The creator taps cells to pick them and adds a short note per pick ("more skin", "heels").
   A sheet can be drawn again with the notes; each sheet is one cheap image, not twenty.
4. **Mock screenshots.** 4–5 in-game frames (combat, boss, ult, level-up, character select) drawn from the picks,
   so the creator sees the game before it is built.
5. **Style lock.** One click fixes the look: the picked cells and the style name become the reference every later
   picture and model is made from.
7. **The gate.** One primary button carries the price of everything expensive: **Lock · 324 credits · 8 runs**.
   Its sheet lists the parts. A **Test one first** switch builds one character fully (turnarounds, model, rig,
   animations) before the rest; the rest then has its own button with its own price.
8. **Build.** Per locked character: the close-up art (a cut-in and a dialogue portrait), side and back views drawn from the front (the image model, with the front as a
   reference), Meshy **multi-image-to-3D** from the three views at the plan's poly count, the rig, then one shared
   animation set, the props split from the weapon sheet, the systems the plan switched on, and the game itself.
9. **Remix.** A finished plan (ARES) is saved as a template: the cards, the style, the systems and the shared
   parts. Another creator remixes it from the Feed and lands straight on the gate with the price already shown.
6. **Backdrops.** From the locked style, the crew paints 2–4 large panoramas per stage on the World card (a sunset
   colosseum, burning ruins, a red-lightning sky), sized for a skybox (2:1 equirect) or a wide matte strip (4:1).
   The game uses them as its sky and backdrop; 3D is only the arena floor and what stands on it. Pictures only, no
   Meshy.

## The cards

Each card is `{ id, name, body }`, `body` is a flat map of short values (a string or a list of strings), and the
Cast card also holds a roster. At rest a card shows its name and one value (Cast: "6", Combat: "Combos"); the rest
is in the inspector.

| Card | Holds | From the question |
|---|---|---|
| Cast | `roster: [{ name, role, look, weapon }]`, `count`, `rule` ("girls only") | cast |
| Story | `premise`, `acts`, `ending` | genre (filled by the planner) |
| Combat | `style` (DMC combos, launcher, air juggle, style rank D–SSS), `ults` (orb-charged cut-ins), `weapons` (switching), `tools` (grenades), `tactic` (hit and run) | combat |
| Enemies | `tiers` (minion, elite, boss), `boss` (3 stages, weapon switch), `final` ("asura arms"), `telegraphs` | enemies |
| Progression | `levelUp` (roguelike 1 of 3), `ngPlus`, `growth` (aura, wings), `pet` | progression |
| World | `setting`, `stages`, `camera` (third person, Star Rail style), `backdrops` (2–4 painted panoramas per stage) | genre |
| Look | `style` (one named anime style), `palette`, `locked` | look |
| Money | `model` (free, premium, free + cosmetics), `gacha`, `subscription`, `carry` (cosmetics carried into the game) | money |
| Systems | one switch per module (below) | money + genre |

The questions and the defaults live in `engine/plan.mjs` (`PLAN_QUESTIONS`, `planFromAnswers`), one source for the
studio, `/swarm plan` and the Hermes skill. A planner model may fill Story and World from the idea; without one the
cards are filled from the chips alone, so the board works offline.

## The cost model

Prices come from Meshy's table (spec 20, Nous's Meshy plugin, as of 2026-10-12) and are kept in one place
(`PRICE` in `engine/meshy.mjs`, `COST` in `engine/plan.mjs`), so a price change is one line.

| Part | How many | Credits each | Notes |
|---|---|---|---|
| Character model | cast size (or 1 when testing first) | 30 | multi-image-to-3D, meshy-6, textured, from front + side + back |
| Rig | per character | 5 | includes walk and run |
| Shared animation set | once | 3 per clip | default 8 clips (idle, light, heavy, launcher, air, dodge, hit, down); one humanoid rig, so every character shares it |
| Weapon or prop | per prop on the weapon sheet | 15 | image-to-3D, meshy-6-lite, textured, one prop per file |
| Agent coding runs | estimated | runs | 2 for the game, 1 per system switched on, 1 for the bosses' AI |
| Pictures | sheets, mocks, backdrops, close-up art, turnarounds | image runs | counted as image runs on the gate and shown, not priced in credits: they come from the person's own Codex/xAI/FAL login |

ARES's plan (6 characters, 8 clips, 6 weapons, 5 systems): 6 × 35 + 24 + 6 × 15 = **324 credits** and about
**8 runs**. Test one first: **59 credits** (one character and the animation set), then **Make the rest · 265**.

`planPrice(plan)` counts every picture the plan will still paint (backdrops, two close-ups and three turnaround
views per character) as `images`, and returns `{ credits, runs, images, parts: [{ what, n, each, credits }], first, rest }`. The server
recomputes it on every lock; the button's number is the ask (spec 20's rule): a lock whose `credits` differs from the
current price is refused with 402 and nothing is locked.

## The gate

- **Nothing expensive before the click.** Every route that spends credits or starts a coding run for a plan
  (`/build`, the Meshy calls, the systems runs) checks `plan.gate.locked` and the price stamped at the lock.
- **Editing after the lock** reopens the gate: the plan is unlocked, the price is shown again, and nothing that was
  already made is thrown away (a made character stays made and is not charged again).
- **Test one first** locks only `first`; the build stops after one character with **Make the rest · N credits**.
- **One run per part.** A second click joins the running job; a failed paid call is never retried by the engine
  (spec 20's rule); Redo is the person's, by its price.

## The build

### Art at close-ups, 3D at a distance

The image-gen look is the look the creator wants, so the game is made from it wherever the camera is close:

- **Drawn art, close up:** ult cut-ins, the boss intro and stage-change cards, dialogue, character select, the
  level-up screen, HUD portraits and the ending poster all use the painted character art, never a render of the
  3D model.
- **3D, at gameplay distance only:** the Meshy model with the toon shader and outline, and a painted face decal
  cropped from the same art so the face matches the close-ups.
- **Per locked character**, the build step paints its **cut-in** (waist-up action pose, 16:9, empty space on one
  side for the name) and its **dialogue portrait** (waist-up, calm, transparent or plain background) at high
  quality, from the front picture as a reference. They land on the Build section as crew work before any credit is
  spent.
- The game template's build prompt carries this as a rule (`CLOSEUP_RULE` in `engine/plan.mjs`), with the file names
  (`public/art/<name>-cutin.png`, `-portrait.png`, `public/art/backdrops/<stage>-<n>.png`) and how to load them: a
  backdrop as the sky (an equirect on a sky sphere, Godot's `PanoramaSkyMaterial`) or a matte plane behind the arena.

### Turnarounds

For each locked cast member, the image model first draws a clean **front** (full body, A-pose, from the picked cast
sheet), then the **side** and **back** views from that front picture
(`imagegen.py --ref <front>`, the same provider, high quality, "same character, same outfit, full body, A-pose,
plain light background, orthographic"). They go on the Build section as a three-up strip before any credit is spent,
and the creator can redraw one.

### Multi-view Meshy

`POST /openapi/v1/multi-image-to-3d` with `image_urls` (1–4 data URIs: front, side, back) and the same body fields as
`imageTo3dBody` (`ai_model`, `should_texture`, `enable_pbr: false`, the cel `texture_prompt`, `pose_mode: a-pose`,
`should_remesh`, `topology`, `target_formats`), at a configurable `target_polycount` (default **40 000** for a third
person hero, against spec 20's 15 000). It is polled at `GET /openapi/v1/multi-image-to-3d/<id>` with spec 20's
policy, then rigged with spec 20's rig call. `makeCharacter({ images: [...] })` takes this path when there are two or
more views and the single-image path otherwise.

### Shared animations, props

- The animation set is made once on the first character's rig (`POST /openapi/v1/animations`, 3 credits a clip)
  and retargeted to the rest in the engine (they share Meshy's humanoid skeleton), so it is paid once.
- The weapon sheet is split into one picture per cell (`sheetsplit.py`, PIL, the same grid as the sheet), each
  picked prop goes to image-to-3D on its own, and lands as `public/models/props/<name>.glb`.

## Systems as ready modules

The Systems card is a list of switches. Each module is a block of build instructions the coding agent gets, kept in
`engine/systems.mjs`, reusing what already exists:

| Module | Status | Source |
|---|---|---|
| Logins | exists | `AUTH` in `engine/appjob.mjs` (Supabase Auth, else an scrypt guest pass) |
| Payments | exists (one-off) | `SHOP_ASK` and `stripeEnv` in `engine/auto.mjs` (demo checkout, Stripe test mode only) |
| Subscriptions | new, template | Stripe Checkout in `subscription` mode with `sk_test_` only; a demo plan without a key |
| Leaderboard | new, template | `POST /api/scores`, `GET /api/scores?board=`, best per player, server-checked run length |
| Gacha | new, template | spec 16's Oracle rules: published rates, a pity counter, no paid currency without the label; a pull animation |
| Autoplay pilot | exists for ARES | `games/ares/jev` and `pilot.gd`; the web game's autoplay is PR #139's, wired as a switch once it lands |
| Enemy AI | new, template | state machines for minion, elite and a 3-stage boss: idle → telegraph → attack → recover, stage change at health thresholds, weapon switch per stage |
| Loadout | new, template | `GET /api/loadout?player=` returns the cosmetics owned in the app; the game reads it at start |

`systemsAsk(plan)` joins the switched-on blocks into the build prompt. A module marked "new" ships here as its
instruction block (and, for enemy AI, a minimal reference state machine in the block), not as a separate library.

## Remix

A template is a plan without its build state: `{ id, name, from, cards, systems, style, sheets (picked cells only),
parts: [{ kind, name, file }] }`. `POST /api/plans/:id/template` saves one; the built-in ARES template lives in
`games/ares/plan.json`. `POST /api/templates/:id/remix` makes a new plan from it and opens the Plan board at the gate,
with the price for this creator (parts the template already carries, like the animation set, are not charged
again when the files are present).

## The Plan board (UX, per docs/ux)

The Plan board is a project's canvas before its first build, so it follows **Figma's canvas** like the project
(PATTERNS.md) and adds no new zone:

- **Top bar:** breadcrumb `Projects › <plan name>`, and the one primary button on the right. Before the lock it
  is **Lock · 324 credits**; after, **Build**; while testing first, **Make the rest · 265**. The button keeps its
  slot and width in every state (rule 29).
- **Stage:** sections on the dotted canvas: **Plan** (the nine cards), **Sketches** (the sheets), **Mocks**
  (the frames), **World** (the backdrops), **Build** (turnaround strips and models once locked). At rest a card is its name and one value;
  a sheet is its picture with a ring on each picked cell. Names only (rule 8).
- **Inspector** (only while something is selected): a card's lines as inputs; a sheet's picks and the note for
  the selected cell, and **Draw again**; a mock's **Draw again**; the Look card's **Lock style** switch.
- **The gate's sheet:** opened by the primary button. The parts as rows (name, count, credits), the total, the
  `[☐] Test one first` switch beside its label, and one confirm button carrying the price. ×, Esc, outside click.
- **The crew:** while cards are written, sheets, mocks and backdrops painted, or close-up art drawn, the crew's
  cursors sit on the card or picture they work on, with a slim bar; the picture fades in when it lands.
- **Backdrops** sit in their own **World** section after Mocks, one wide picture each.
- **No tooltips, no helper text, no new colour.** States are rings and dots with `aria-label`s.
- Esc steps up: selection → board → Projects.

## Data shapes

```js
// <data>/plans/<id>.json
{
  id: 'p-…', v: 1, title: 'ARES', idea: '…', kind: 'game', created, updated, from: null | '<template id>',
  answers: { genre, cast, combat, enemies, progression, money, look },
  cards: [{ id: 'cast', name: 'Cast', body: { count: '6', rule: 'girls only', roster: [{ name, role, look, weapon }] } }, …],
  systems: { logins: true, payments: true, subscriptions: false, leaderboard: true, gacha: true, pilot: true, enemyAI: true, loadout: true },
  sheets: [{ id, kind: 'cast' | 'weapons', grid: [5, 4], prompt, src, quality: 'medium', picks: [3, 7], notes: { 3: 'heels' }, state }],
  mocks: [{ id, shot: 'combat' | 'boss' | 'ult' | 'levelup' | 'select', src, state }],
  backdrops: [{ id, stage, n, shape: 'equirect' | 'strip', prompt, src, state }],
  style: { name, locked: false, refs: ['/plans/<id>/…png'] },
  settings: { polycount: 40000, clips: 8 },
  gate: { locked: false, testFirst: false, price: null, lockedAt: null, phase: null },
  build: { characters: [{ name, front, cutin, portrait, side, back, job, file, state }], props: [], animations: null }
}
```

## API routes

| Route | Does | Spends |
|---|---|---|
| `GET /api/intake` | adds `plan`: the plan questions | – |
| `GET /api/plans` | the plans, newest first (id, title, locked, price) | – |
| `POST /api/plans` `{ idea, answers }` | a new plan with its cards | – |
| `GET /api/plans/:id` | the plan and its current price | – |
| `POST /api/plans/:id/card` `{ card, body }` | edit one card (reopens the gate if locked) | – |
| `POST /api/plans/:id/systems` `{ id: bool }` | switch modules | – |
| `POST /api/plans/:id/sheet` `{ kind, notes? }` | draw a sketch sheet (one medium image) | an image |
| `POST /api/plans/:id/pick` `{ sheet, cell, on, note? }` | pick a cell, note it | – |
| `POST /api/plans/:id/mocks` | draw the mock screenshots | 4–5 images |
| `POST /api/plans/:id/style` `{ locked }` | lock the look | – |
| `POST /api/plans/:id/backdrops` `{ stage? }` | paint the World card's backdrops from the locked style | 2–4 images a stage |
| `POST /api/plans/:id/closeups` `{ name? }` | paint the cut-in and portrait per character (409 before the lock) | 2 images a character |
| `POST /api/plans/:id/lock` `{ credits, testFirst }` | lock at that price (402 if stale) | – |
| `POST /api/plans/:id/build` | start the build of what is locked (409 if not) | credits, runs |
| `GET /api/plans/:id/build` | the build's state | – |
| `POST /api/plans/:id/template` | save as a template | – |
| `GET /api/templates`, `POST /api/templates/:id/remix` | list, remix into a new plan at the gate | – |

Plan files are served at `/plans/<id>/<file>.png` (the sheet and mock pictures), by name pattern only.

## Test plan

- `tests/plan.test.mjs`: answers → nine cards with the defaults filled; the Cast card's roster from the cast
  answer; editing a card keeps the rest; the price for ARES's answers is 324 credits and 8 runs; test-first splits
  it into 59 and 265; a lock with a stale number is refused and leaves the plan unlocked; an edit after the lock
  reopens it; `assertLocked` throws on an unlocked plan; sheet cell math (cell → box for a 5 × 4 grid); a remix
  starts at the gate with the template's cards.
- `tests/meshy.test.mjs` (mocked fetch, no key, no credits): the multi-image body (`image_urls` 1–4, the shared
  fields, `target_polycount` 40 000 by default and configurable), the multi-image poll route, a full mocked run
  with three views, more than four views refused.
- `tests/systems.test.mjs`: each switched-on module adds its block, logins reuse `AUTH` word for word, an empty
  plan adds nothing.
- `scripts/check.sh`: `GET /api/intake` has `"plan"`; `POST /api/plans` then `POST /lock` with a wrong price
  answers 402; `POST /build` on an unlocked plan answers 409.
- By hand: the Plan board at 1280 and 768, light and dark, the word budget, Esc up, no tooltip.

## Done when

- [ ] The spec (this file).
- [ ] (a) Plan cards from the questions, editable on the board, and the lock gate with its price.
- [x] (b) Sketch sheets with picks and notes, mock screenshots, the style lock.
- [x] (b2) World backdrops and the close-up art rule (cut-in and portrait per character), counted on the gate.
- [x] (c) Turnarounds and multi-view Meshy in `engine/meshy.mjs`, mocked in tests. The build (`POST /build`) paints
  the views and close-ups, then makes and rigs each character in the locked scope; test-one-first reopens the gate
  for the rest. Still to do: the shared animation set (`POST /openapi/v1/animations`) and the weapon props
  (`sheetsplit.py`); they stay on the price but the build does not make them yet.
- [x] (d) The Systems switches in the build prompt: `engine/systems.mjs` `systemsAsk(plan)`, joined with the cards and the
  close-up rule in `gameBrief(plan)` (`GET /api/plans/:id/brief`). Starting the game's coding run from the brief is still to do.
- [ ] (e) ARES as a remixable template.

## Out of scope

- Real Meshy calls or spent credits in tests; a live Stripe key (refused, as everywhere).
- A full animation editor; retargeting is the game engine's.
- Pricing coding runs in money: runs are counted, not priced, until the model bills say what a run costs.
