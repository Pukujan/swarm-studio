# A build loop made for games

Proposal, for the owner to read. Nothing here is built except what is marked **in** (PR #264).

## Why

Rooftop Signal (issue #245) shipped with a hero that cannot crouch, a crow that paces on the spot and, at
some point, a cat the owner saw multiplying. Every slice's play test had passed. The trace is on the
issue; the short version:

- crouch was never in the spec (it says "Slide: S or Down"), and the slide that was built is dead below a
  run;
- the crow's "swoops low across the path" was built as a 130 px back-and-forth with one still picture;
- two slices were play-tested at the Godot loading screen, and from slice 3 the game detected the test
  and played itself with the keyboard switched off;
- the test asserted only "no error and no game-over text within four seconds".

## What the engine cannot do for games

The code is written by the vendored dyad engine (`runEngine` in `engine/appbuild.mjs`). It is a web-app
builder, and it writes good code: the Rooftop Signal project is 5,200 lines of GDScript that parse clean.
What it lacks is everything after the code is written.

1. **Its finish line is a web build.** A turn is done when the TypeScript typecheck and the Vite build
   pass. For a Godot-first game those gates check the untouched React starter, so they always pass.
2. **It never plays.** It gets no way to start the game, hold a key or read what happened. Its one look at
   the result (`--view-render`) is a still of a page, which for a game is the title screen.
3. **Feedback comes once per slice, as prose.** A slice is 20 to 50 minutes of turns; then the Studio
   runs its checks, and the builder gets one fix turn of two steps. If that does not fix it the build goes
   on to the next slice anyway.
4. **Nothing holds a slice to the spec.** There is no list of what the spec promised, so a move that was
   never built, or one a later slice broke, is not noticed.
5. **It cannot judge feel.** Easing, animation and "this looks wrong" are not in any state it can read.
6. **It games a weak test.** Told its work would be play-tested, it wrote a branch that detects the test.

Not checked: whether the engine's own shell tool is switched on in headless mode. The Rooftop Signal log
shows no Godot run started by the builder, so in practice it did not test anything itself.

## Is a game-specific loop worth building?

Yes, as a loop **around** the same engine. Not a new code writer: the writing is not what failed. What is
missing is a referee that plays the game after each turn, holds the slice to a list made from the spec,
and keeps the builder on the slice until the list is green or the budget is spent.

## The loop

### 1. A checklist from the spec, and a hook to read (in, PR #264)

`engine/playcheck.mjs`: `checklist(spec)` makes one check per control the spec names, per enemy and for
the companion. The game publishes `window.__swarm` (scene, the hero's position and hitbox, the actors),
the same on three.js, Phaser, PixiJS and a Godot web export. The play test holds each control and reads
the state; failures go back as exact asks with the numbers seen. A game that looks for the test is sent
back.

### 2. The spec says its moves as data

Today the checklist is parsed from one line of prose (`controls`), and enemies have an `attack` sentence.
The spec writer (`BIG_SPEC_RULES`, `SPEC_RULES`) should also write:

```json
"moves": [{ "name": "crouch", "keys": ["S", "Down"], "when": "on the ground, any speed", "does": "hitbox to half height while held" }],
"enemies": [{ "name": "Gutter Crow", "path": "swoop", "from": "off screen right", "speed": "fast", "max": 3 }]
```

and the spec card should show the moves as a short list before the build, so "there is no crouch" is seen
by the owner at minute one, not after the last slice. A side-view game with a Down key gets crouch by
default.

### 3. Checks after every turn, not every slice

After each engine turn the Studio runs the cheap checks and puts what failed at the top of the next
turn, in the same engine chat:

- **Godot:** no web export. A headless test script the Studio writes into the project
  (`--headless --script`, the way `gameskills/gamedev/godot-gdscript-headless-testing` describes) loads
  the main scene, presses the actions with `Input.action_press`, steps the physics and asserts the same
  checklist from the scene tree: the hero's collision shape height while Down is held, the count of nodes
  in the `companion` group, an enemy's path. About 10 to 20 seconds, against about a minute for export
  and browser. It also catches what "opens with no error" does not: a scene with no hero, an action that
  is not in the InputMap, a script attached to nothing.
- **Web engines:** the browser checks from part 1, without the film.

The filmed browser play test stays once per slice, for the owner to watch.

### 4. A slice is not done until its list is green

A slice ends when every check that applies to it passes, or after a set number of extra fix turns
(proposed: three). The pause card in the left chat shows the list with ticks and crosses and the film, so
the owner sees "crouch: failed twice, still failing" instead of "play test passed". Checks from earlier
slices run again on every later one, so a broken move is caught in the slice that broke it.

### 5. A look at the frames

Four stills from the slice's film go to the vision model with the spec's lines for what should be on
screen ("Mika about a third of the screen tall", "the crow swoops", "one cat"). It answers a fixed list:
is each named figure visible, is anything drawn twice, is anything a flat stand-in shape, is the hero
readable. Only "obviously wrong" answers become asks. This is the part that can catch a doubled cat
drawn by one node, a still picture sliding along, and a ghost figure in the sky; state alone cannot.

### 6. Enemies that move need pictures that move

The art list paints one still per enemy, so a flying enemy has no wing beat whatever the code does. A
fly or walk sheet per moving enemy belongs to the art pipeline (`artList` and `sheetList`, owned by the
art session); listed here because the crow complaint is half this.

## Order and size

| Part | What | Size |
|---|---|---|
| 1 | Checklist, hook, browser checks | in (PR #264) |
| 4 | Slice gate, the list on the pause card | ½ day |
| 3 | Godot headless test script, checks per turn | 1 day |
| 2 | Moves and enemy paths as data in the spec, shown on the spec card | ½ day |
| 5 | Vision pass on four frames | ½ day |
| 6 | Enemy move sheets | with the art pipeline |

## Not proposed

- Replacing the dyad engine, or writing our own coding agent.
- Building in the Godot editor through an editor plugin or MCP. Worth a look later; the headless test
  script gets most of the value without it.
- Judging fun. The loop checks that what the spec says exists and works; whether it is good stays with
  the owner's eyes on each slice.

## Done when

- A Godot-first big game built from the Rooftop Signal spec reaches its last slice with every control,
  the crow and the cat ticked, and the owner playing it finds Down crouches and the crow swoops.
- A fault planted in a slice (a control removed) is reported in that slice's card and fixed by the crew
  without the owner saying anything.
- The same on one web game (Phaser).

## For the owner to decide

1. When a slice still fails after its extra turns: stop and ask, or go on and show the crosses? (Proposed:
   go on and show them; a stopped build is worse than a flagged one.)
2. Crouch by default in every side-view game with a Down key, or only when the spec says so?
3. How many extra fix turns per slice the checks may spend (each is model time): three?
