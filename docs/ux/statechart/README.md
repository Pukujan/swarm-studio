# The Studio's statechart

Status: **draft for review** (2026-11-13). The second of the six design artifacts in [docs/PLANS.md](../../PLANS.md) §5,
which come before the move to Vite, React and TypeScript.

[studio.machine.js](studio.machine.js) is one XState v5 machine with every screen of [SITEMAP.md](../SITEMAP.md)
and the moves between them. It is a design, not the app: the live navigation is [web/nav.js](../../../web/nav.js)
([spec 34](../../specs/34-navigation-state.md)), and nothing in the app imports this file.

- **To view it:** paste the file into [stately.ai/viz](https://stately.ai/viz), or use Stately Studio › Import from
  code. The config is one literal object (no helpers, no spreads, guards and actions named in `setup`), so a static
  import reads all of it.
- **To check it:** `node --test tests/statechart.test.mjs` (also part of `bash scripts/check.sh`).

## What the test holds it to

[tests/statechart.test.mjs](../../../tests/statechart.test.mjs) reads SITEMAP.md itself, so a new branch there fails
the test until the chart has it.

1. **Every SITEMAP screen has a state.** A screen is a node in a SITEMAP chart that opens into something (a line
   goes out of it). A node with no line out is a control or a value on the screen it hangs from; the object map
   lists those, not this chart. Each state names the SITEMAP nodes it holds in `meta.sitemap`, as
   `<section> › <node>`.
2. **Every state names only screens SITEMAP has**, copied word for word.
3. **Every state is reachable** from the start, by the targets of its transitions.
4. **The logo goes Home** (`home`) from every state.
5. **Esc climbs to Home** (`up`, pressed again and again) from every state, one level at a time, never in a circle,
   in at most 12 steps.
6. An open player closes first on Esc; the brand sheet goes back to where it was opened from; + Create sends each
   lens where SITEMAP §5 says.

Not states, on purpose (`NOT_STATES` in the test):

- Hermes's `/swarm` and swarm.design-bakery.com: where a person comes from. Both open the Feed, so the chart starts
  on Home.
- Hermia herself, her look, her voice and where she is: a character on many screens. Clicking her opens the crew
  radio, which is a state (`build.crew`).
- §12, the flows by audience: they walk screens the other sections already have.

## The shape

```
studio                          starts on feed.home
├─ feed                         Swarm Feed's code
│  ├─ home                      For you · Following · Live
│  └─ assets · asset · story · suggest · liveCanvas
├─ discover                     index · search · pack · makers · profile · openBoards · openBoard · jams · jam · hostJam · events
├─ create                       idea · progress · result · planQuestions
├─ projects                     browser · make · guided (questions · brief) · takes · blocks · setup · boards · hostBoard · board · pin · moodBoards · moodBoard · shared
├─ me                           index · profile · notifications · launch · settings (index · models · role · connections)
├─ draft                        a new project talked through, nothing built
├─ planBoard                    board · gate
├─ scaffold                     brand · references · assets · pages · lock  (+ history)
├─ brandSheet
├─ build                        a version is open  (+ deep history)
│  ├─ playable                  parallel, as in web/nav.js
│  │  ├─ room:   overview · deck (live | replay) · app (the Engine room)
│  │  └─ player: closed · prototype · visitor
│  ├─ video (Film studio) · game (play · tweak · details · building) · launch (Launch pad)
│  └─ versions · share · progress · crew
└─ hosted                       tryIt · guestBuild · limitReached
```

91 states, 74 of them leaves. Each one has a `description` (Stately shows it) and a `meta`:

| Field | Meaning |
|---|---|
| `sitemap` | the SITEMAP nodes that live on this screen |
| `live` | the matching state in web/nav.js, or `null` (61 states have none) |
| `owner` | `feed` (Swarm Feed's code), `studio` (this plugin) or `hosted` (`/studio/app`) |
| `terminal` | only on `hosted.limitReached`: the web app ends there and points to Hermes |
| `planned` | a flow agreed but not specified yet (the five ways of making) |

## Events

| Event | Taken in | Goes to |
|---|---|---|
| `home` | everywhere | Home (the logo, and the Home slot) |
| `discover`, `create`, `projects`, `me` | everywhere | that slot of the nav (SITEMAP §2) |
| `up` | every state but Home | one level up: Esc with no panel open (RULES rule 7) |
| `close` | the player | closes it. An open panel answers Esc first (rule 18) |
| `open.project { project, version }` | everywhere | the Overview |
| `started { run }` | everywhere | the Design deck; `pending` is the run |
| `streamed { run }` | everywhere | clears `pending`, nothing else |
| `draft`, `plan` | everywhere | the talk with nothing built; the plan board |
| `brand { from }` | everywhere | the brand sheet; `up` goes back to `from` |
| `studio { project }` | everywhere | the scaffold, on its first step |
| `make { lens }` | `create.idea` | `just` → progress, `design` and `mix` → deck, `develop` → Engine room, `game` → plan questions, `launch` → Launch pad |
| `room.overview`, `room.deck`, `room.app`, `room.video`, `room.game { run }`, `room.launch` | `build` | that room |
| `versions`, `share`, `progress`, `crew` | `build` | that panel of the build |
| `play`, `watch`, `stop`, `page { page }` | the player | as in spec 34 |
| `replay`, `replay.stop` | the deck | replay, or back to live |
| `next` | the scaffold | the next step |
| `built { run }` | the scaffold | the deck |
| `lock`, `build { run }` | the plan board | the gate; the Game room |
| `try.hosted`, `try`, `limit`, `posted` | the hosted studio | its steps; `posted` lands on Home |

### The five ways of making (planned)

The owner wants five ways of making something; [spec 42](../../specs/42-ways-to-make.md) defines them and which
kinds offer which. Here they are sibling flows out of `projects.make`, marked `meta.planned`, each with Esc back to
Make:

| Event from Make | Way | Flow |
|---|---|---|
| `way.just { run }` | Just build: the prompt, then the crew builds now | straight to the deck |
| `way.guided` | Guided: the chat asks questions, then builds | `guided.questions` → `guided.brief` → `build { run }` → deck |
| `way.takes` | Three takes: pick one of three versions | `takes` → `pick { run }` → deck |
| `way.blocks` | Scaffold: the kind's bare structure as blocks to fill or delete | `blocks` → `build { run }` → deck |
| `way.studio { project }` | Studio: every step as a clickable path | the existing `scaffold` (spec 37) |

The owner's "Scaffold" is called `blocks` here, because `scaffold` already names spec 37's Studio first. Which ways
each kind supports, and the Studio's later steps (Story, Design, Publish), wait for the spec.

The rest (`swipe`, `assets`, `story`, `remix`, `search`, `board`, `pin`, `jam`, `join` and so on) are the one way
from a screen to the one below it, named after the SITEMAP node.

## Guards

| Guard | True when |
|---|---|
| `hasBuild` | the event names a version or a project |
| `hasRun` | the event names a run |
| `hasProject` | the event names a project |
| `lensJustMake`, `lensDesign`, `lensDevelop`, `lensGame`, `lensLaunch`, `lensMix` | the lens chip says so (none means Just make it) |
| `fromScaffold`, `fromPlan`, `fromDraft`, `fromBuild` | the brand sheet was opened from there (`fromBuild` also needs a version) |
| `playerClosed` | no player is open, so Esc moves the room and not the player |

## Where it differs from web/nav.js

1. **Home.** Here Home is the Feed's Home and Projects is a place of its own. In web/nav.js the state called `home`
   is Projects, and the logo lands on Projects (web/studio.js:196-198). The live studio has no Feed: the Feed is
   Swarm Feed's app. The object map flags the same name clash.
2. **+ Create is a state here.** Live, Make on Projects starts the build straight away (`started`). Here + Create
   has the idea, the progress ring and result card for Just make it, and the plan questions for a game.
3. **The lens picks the room.** Live, `started` takes a `room`. Here `started` always opens the deck, and
   `create.make` routes by lens.
4. **Rooms are one event each.** Live sends `room { room }` and `replay { on }`. Here they are `room.deck`,
   `room.app` … and `replay` / `replay.stop`, so Stately draws each arrow.
5. **The scaffold's steps follow SITEMAP §5c:** brand, references, assets, pages, lock. Live calls the last two
   `plan` and `proposal` (`STEPS` in web/nav.js). Build is the `built` event, not a step.
6. **Esc in the scaffold goes up one step.** web/nav.js has that move (`back`), but Esc never sends it: `C.up` sends
   `home` from the scaffold (web/studio.js:202), so Esc on References lands on Projects.
7. **The brand sheet uses history.** Live works out `from` from the room on screen and has a guard per room.
   Here the event carries `from`, and Esc goes to the scaffold's or the build's history state, so it lands on the
   exact step or room.
8. **Esc closes the player.** Live, the open player is in the list of things that answer Esc themselves
   (`OPEN` in web/studio.js:256). Here the player takes `up` to `closed`, and the room's `up` waits for it
   (`playerClosed`, from a `playing` flag the player's entry and exit set).
9. **The hosted studio is its own branch.** Live it is the Overview with `body.hosted` set. Here it is
   `hosted` (Try it here, the guest build, the limit).
10. **States live does not have** (61): the Feed, Discover, Me and + Create; Projects' boards, mood boards,
    shared and setup; Settings; the Game room's tabs and build wall; the Launch pad; versions, share, progress and
    the crew radio; the hosted studio's steps; the planned ways of making. Setup and Settings are sheets in the live app (web/setup.js,
    web/settings.js), not navigation.

## Gaps

### SITEMAP screens with no state

None: the test fails on any. The only screens with no state are the ones listed above as not states.

### Ways home (RULES rule 7) and dead ends in the live app

- **The Wall has no way home.** With `sw.wall` set, the logo and Esc do nothing (`C.home`, `C.up` and `C.go`
  return early, web/studio.js:88, 197, 199). It is a display, so that may be right, but SITEMAP does not have it.
- **The logo goes to Projects, not Home.** Rule 7 says the logo goes to Home, and its breadcrumb reads
  `Home › Projects › build › room`; the code's reads `Projects › name ▾`.
- **Esc skips the scaffold's steps** (difference 6).
- **A reload loses a draft and an unsaved plan.** `toAddress` writes neither, so a reload opens Projects (spec 34
  says so). Not a dead end, but the place is lost.
- **The game wizard is still there.** SITEMAP §10: "The 7-step game wizard is gone". web/workshop.js still has the
  7 steps (design to sound), opened as a dialog from the Engine room (web/canvas/rooms.js:776). It closes, so it is
  not a dead end, but code and SITEMAP disagree.
- **The hosted studio's limit leaves the app.** `limitReached` points to Hermes; here Esc goes back to Try it here.

### Found in SITEMAP while charting

- The brand sheet has no node of its own; it appears only inside a §5c label ("the brand card → brand sheet → Lock
  → back"). Its state names no SITEMAP node.
- The player (Play and Watch) is only "Play" in the Overview's top bar.
- Two places for a build's launch: Me › Launch › a build, and the Launch pad room. Rule 4 says one place. Here
  Me › Launch opens the Launch pad.
- Esc is "up a level", not "back": a profile opened from a build's Maker on Home goes up to Makers in Discover.
- "Following" is a leaf in SITEMAP; here it takes the same moves as For you.
- Drill-downs inside a room (the Engine room's folder › file › line, the deck's layer › section › element, the Game
  room's Feel › Gravity › Slider) are selections in one state, not states. Esc clears a selection first, like a
  panel (rule 18).

## Sources

- [SITEMAP.md](../SITEMAP.md) for the screens, [RULES.md](../RULES.md) rules 7 and 18 for Esc and the logo.
- [spec 34](../../specs/34-navigation-state.md) and [web/nav.js](../../../web/nav.js) for the live machine.
- Hermes: the chart starts on the Feed because SITEMAP §1 says Hermes opens it. How Hermes opens the studio's pane
  is not on [docs/engines/hermes-and-connections.md](../../engines/hermes-and-connections.md): not documented,
  unchecked. That page does say Swarm never posts for anyone (docs/PRODUCT.md:60-62), so `posted` is the person's
  own Post.
