# Motion inventory

Everything in the Studio web UI that moves, with the code that owns it. It exists so that the split of `web/canvas.js` (7,709 lines) into modules can be checked against a fixed list: the split changes where code lives, not what moves, when, or how fast. A row is only useful if its `file:line` is right: when a line moves in a split, update the row in the same change. Line numbers are for commit `13a92df`. Scope is `web/` without `web/vendor/`; the engine's Play-mode scroll reveal (`engine/motion.mjs`, injected at `web/canvas/player.js:115`) is outside it and only noted.

## How a change is shown to keep the motion

1. **The motion check** (`scripts/motion-check.mjs`, run by CI on every pull request as `motion-check`). It plays eleven scenes (Projects, an Overview, a replay of a crew of four building, reviewing and taking a comment, a half-done build, the deck, Play, a visitor's tour, and the App, Video, Game and Studio rooms) on Playwright's clock, paused so only the checker moves it, with `Math.random` seeded in the page and every frame. It logs every animation that starts (CSS animations and transitions by their start events, `element.animate` by wrapping it: name, target, duration) and the endless ones running, and keeps the picture each scene ends on. The page frames still draw on the real clock, so each side is recorded twice and a difference counts only when both runs agree: an animation that ran in both runs before and in neither after (or the reverse), or an end picture that matches neither run before. Recording the same code four times passes; turning off the reviewer's scan and the crew's speech bubbles fails with `frame @scan … #scan` and `page ~transform div.bubble` listed as "ran before, not after".
2. **The split itself is a move.** The split moved code without changing it. The few lines that had to change are listed in its pull request: an import, an export, and an assignment to a `let` that another file owns, which now calls that file's setter. Since the split, the `file:line` references here point into `web/canvas/` ([web/canvas/README.md](../../web/canvas/README.md)).
3. **Clips to watch** (`docs/ux/motion/clips/`): Projects, the replay, a half-done build, Play and a visitor's tour, 640 wide, recorded from this commit with `node scripts/motion-check.mjs clips <dir>`. Record them again after a split to compare by eye.

The motion check does not see the speed of JS-driven movement (a cursor gliding a little faster ends in the same place), so a split must not touch the numbers in the JS clocks and gestures below; the move-only rule is what covers them.

How to read the tables. "Owned by" gives the keyframes or rule first, then the JS that triggers it (`css | js`). Reduced motion: "global" means the blanket rule at `web/canvas.css:1403` (`*` gets `animation-duration .01ms`, `animation-iteration-count 1`, `transition-duration .01ms`, all `!important`). It covers the whole app page but not the page frames, which are separate documents (`web/frame.html`, the Play frame, the exports). "none" means nothing is done for it beyond that. JS-driven movement (camera glide, cursor travel, tours, loops) is not touched by any reduced-motion rule unless a row says so.

## Design deck and camera

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| World pan and zoom (`#world` transform, viewport grid `backgroundSize/Position`) | every frameLoop step while `cam.t*` differs from `cam.*`; set by wheel, drag, Fit, Auto camera | Exponential glide, factor 0.06 per 60 fps frame in Auto camera, 0.25 when the person drives it; made frame-rate independent with `Math.pow(1-k, dt/16.7)` | `web/canvas/loop.js:44-63` (`ease`, `camKey`) | not handled (JS) |
| Auto camera refit | `cam.auto` on; build running | `fit(bboxActive())` at most every 700 ms; replay re-asserts it once at +700 ms | `web/canvas/deck.js:557-580` (`bboxActive`, `fit`), `web/canvas/loop.js:38-42` | not handled |
| `will-change: transform` hint on the world | `.moving` added when the camera key changes, removed 260 ms after it rests | 260 ms hold | `web/canvas.css:171` ; `web/canvas/loop.js:52-64` | n/a (no visual change) |
| Page focus ring (Focus page, from Projects) | `focusPage()` adds `.frame.focus` | removed after 1400 ms; no CSS transition on the box-shadow | `web/canvas.css:174`, `1092` ; `web/canvas/deck.js:582-589` | not handled |
| Page frame "active" mark while an agent works in it | `renderAgents` pass toggles `.frame.active` | every 150 ms panel pass (`web/canvas/loop.js:112`); no animation of its own | `web/canvas/loop.js:129` | n/a |
| Page sections taking shape (`drawing`, `flash` inside the frame) | `msg.anim` sent to the frame when a layer is assigned / done | see Page frames | `web/canvas/deck.js:195-196` | see Page frames |
| Wires between pages: draw in | a `data-goto` link layer is `done`; `linkWires` adds `.fresh` | `wire-in` 1 s ease-out forwards (dashoffset 1 to 0); `.fresh` removed after 2600 ms; opacity transition 1.2 s | `web/canvas.css:180-181`, `183` ; `web/canvas/deck.js:512-534` | global; `lite` mode also sets `animation: none` (`web/canvas.css:423`) |
| Wire path and end dot follow the pages | every frameLoop step | `d` attribute rewritten only when it changed | `web/canvas/deck.js:536-554` (`drawWires`), called at `web/canvas/loop.js:109` | not handled |
| Agent cursor travel (world space) | agent has `act` (gesture) or a layer | position eased per frame: 0.22 toward the caret target (`agentTarget`), gestures follow their own timeline (below); written as `transform: translate()` only when it changed; off-screen cursors skip the write | `web/canvas/loop.js:67-106` | not handled |
| Cursor gestures: marquee, shape, component, swatch, pen, wire, type, menu, resize | `gestureFor(text)` picks one from the tail of the streamed HTML; `startGesture` runs it | `dur` per kind: marquee 900, shape 1100, component 1300, swatch 1300, pen 1500, wire 1400, type 900+55/char, menu 1700, resize 1000 ms; +700 ms when it walks to the toolbar first; cubic ease-in-out; rest 700-1800 ms after | `web/canvas/deck.js:251-443` (`gestureFor`, `startGesture`, `gestureStep`, `ease`) | not handled |
| Gesture ghost (the drawn box, pen trail, text box, menu in the agent colour) | during a gesture; `.ghost.fade` at its end | opacity transition .35 s; contents cleared 400 ms after fade; caret `blink` 1 s steps(2) infinite | `web/canvas.css:199-200`, `217` ; `web/canvas/deck.js:280-285`, `web/canvas/deck.js:360-363`, `web/canvas/deck.js:445` (`drawSelection`) | global |
| Toolbar tool lit when an agent clicks it | gesture with `via`; `toolFlash` | 600 ms flash, read on the 150 ms panel pass | `web/canvas/deck.js:352`, `web/canvas/deck.js:376`, `web/canvas/panels.js:173` ; `web/canvas.css:240`, `1140` (colour/background .16-.2 s) | global |
| Cursor arrow press, tag and bubble | `.press` from `a.act.pressed`; `.talking` while `now < a.sayUntil` | arrow `transform` .1 s; bubble `opacity`/`transform` .25 s; bubble text time `say(…, ms=2800)` | `web/canvas.css:193-197`, `223`, `1117-1119` ; `web/canvas/deck.js:34`, `web/canvas/loop.js:104-106` | global |
| Cursor arrow bob while docked | `.cursor.docked` | `bob` 2.6 s ease-in-out infinite. `bob` is defined twice; the later one (-4 deg, line 1129) wins | `web/canvas.css:237`, `1129` (uses at `232`, `1124`) ; `web/canvas/loop.js:103` | global |
| Letters flying off a typing cursor | `spark(a, text)` per streamed delta; skipped when docked, `lite`, or `cam.s < 0.12` | at most one per 140 ms per agent; `spark` .8 s ease-out forwards; `--dx` random -25..25 px; node removed at 800 ms | `web/canvas.css:429-430` ; `web/canvas/deck.js:77-91` | global |
| Section `hop` class on a finished layer | `layer:done` | class added for 600 ms; **no CSS rule uses `.hop`** (dead toggle) | `web/canvas/events.js:142` | n/a |

## Crew cursors and break room

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Cursors walk to and from the dock | agent has no layer and `now > toolUntil` (idle) | ease 0.12 per 60 fps frame toward `dockCell(seat)`; the world/screen coordinate swap keeps it continuous | `web/canvas/loop.js:77-81`, `web/canvas/deck.js:454-459` | not handled |
| Dock cursor fade | `.cursor` opacity; `.cursor.docked:not(.talking)` is .8 | opacity transition .6 s | `web/canvas.css:186`, `234` | global |
| New agent appears at a random seat offset | `addAgent` | start `sx = dock x +-40`, `sy = dock y - 40..-100` (random); no CSS animation | `web/canvas/deck.js:13-29` (random at `web/canvas/deck.js:24`) | not handled |
| Banter bubbles | idle docked agents; `runBanter` each frame | next line after 2500-5000 ms (900-3400 ms while cheering); fights are 1700 ms per line; 45 % chance of a two-agent script (25 % when cheering) | `web/canvas/deck.js:485-508` ; bubbles as above | global (bubble transition) |
| Break room hidden / shown | More menu, `#dock-hide` | `no-breakroom` class on body; no transition | `web/canvas/start.js:145-150` | n/a |
| Crew over app / game / film screens: arrive | `crewTick` sees a new job key | `crew-in` .4 s ease-out (fade) | `web/canvas.css:883` (`crew-in` at `885`) ; `web/canvas/start.js:215-240` | global |
| Crew: leave | job key changes | `.leaving` sets opacity 0 (transition .6 s from `.cursor`); node removed at 500 ms | `web/canvas.css:884` ; `web/canvas/start.js:221` | global |
| Crew: travel and typing press | every `crewTick` frame | ease 0.08 per frame, **not** dt-corrected (speed depends on frame rate); new spot every 1400-3600 ms (random); press pulse 160 ms; `moving` when more than 6 px away | `web/canvas/start.js:211-282` (move at `web/canvas/start.js:267-268`, spots at `web/canvas/start.js:198-208`) | not handled (only the Meshy bench pin: `web/canvas/rooms.js:946`, cursor sits at the tile corner) |
| Courier carry image under a bench cursor | `pin.carry` | no animation, shown/hidden | `web/canvas/start.js:244-250` | n/a |
| Hermia radio line (dotted) | an order is heard in the last 7 s | `radio-dash` .8 s linear infinite; path rewritten every crewTick frame | `web/canvas.css:1447` (keyframes `1448`) ; `web/canvas/start.js:272-280` | global |
| Reviewer cursor (hovers over the page under review) | `rvMove` on review events | ease 0.12 per frame (not dt-corrected); re-aims every 1100 ms; `leaving` removes it after 600 ms; `--inv` set each frame so boxes keep their pixel width | `web/canvas.css:1500` ; `web/canvas/auto.js:171-216` (`rvTick` `web/canvas/auto.js:193`, wander `web/canvas/auto.js:215`) | not handled |
| Reviewer boxes: appear, then green flash and clear | `review:flag`, then fix lands | `rv-in` .35 s scale 1.04 to 1; `rv-fixed` 1.1 s ease-out (ring grows, fades); box removed at 1100 ms | `web/canvas.css:1501-1506` ; `web/canvas/auto.js:218-236` (`web/canvas/auto.js:235`, `web/canvas/auto.js:236`) | global |
| Hermia's cursor (the pet, spec 41): travel | pointer moves (she trails it by 26/30 px), the pointer rests 1.7 s near the last-touched card (she walks to its top-right corner and follows it while the board pans), a resize, a new screen | ease 0.075 per 60 fps frame, dt-corrected; rAF only while more than 0.6 px from the target, never in a hidden tab; on a phone (≤ 760 px) she sits at the board's right edge above the chat and does not follow touches | `web/pet.js:206-228` (`step`, `go`, `rest`) | JS: snaps to the target, no easing (`web/pet.js:221`) |
| Hermia's cursor: float and doze | always; `.doze` after 30 s with no pointer or key | `pet-bob` 2.6 s ease-in-out infinite; `pet-doze` 4.2 s infinite; avatar opacity and the `z` .3 s | `web/pet.css:13-19` ; `web/pet.js:231-241` (`wake`) | `web/pet.css:34-36` (no animation) and global |
| Hermia's cursor: loading dots | `.loading` from a new screen until its view holds no `.wait-in` or `aria-busy` (checked every 250 ms, at most 12 s), or `pet.on('ready')` | `pet-dot` 1 s infinite, .15 s stagger; opacity .2 s | `web/pet.css:21-28` ; `web/pet.js:242-274` | `web/pet.css:34-36` and global |
| Hermia's cursor: bubble and hand-over | `.talking` for 3.6 s per line (a burst of events within 0.9 s, at most 2.5 s, makes one; at most one bubble per 20 s); `.away` from `run:start` to `run:done` | bubble `opacity`/`transform` .25 s; the cursor's opacity .3 s | `web/pet.css:29-33`, `3-5` ; `web/pet.js:279-301` | global |

## Chat, feed and dock

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Feed item arrives | `feed()` / `push()` | `in` .3 s ease-out (fade, 4 px rise); autoscroll jumps (no smooth) when within 60 px of the bottom | `web/canvas.css:97`, `112` ; `web/canvas/panels.js:185-226` | global |
| "Working" dot on a bot item | `item.className = 'item bot working'` | `blink` 1 s infinite (opacity .2). `blink` is defined twice; the later one (to 0, line 970) wins | `web/canvas.css:105-106`, `970` ; `web/canvas/panels.js:332` | global |
| Progress bar in the feed | the 150 ms panel pass sets `.pbar i` width | width transition .5 s | `web/canvas.css:1066` ; `web/canvas/loop.js:149` | global |
| Status bar and dot | `renderStatus` sets `data-state`; width | dot `pulse` 1.2 s infinite while working/planning; bar width .5 s; shimmer 1.4 s linear infinite across the bar | `web/canvas.css:1100`, `1106-1111` ; `web/canvas/panels.js:157-166` | global |
| Composer, buttons, chips, segments, tabs: hover and focus | pointer / keyboard | 160 ms colour, border, transform (`.toggle`, `.seg button`, `.tabs button`, `.composer`, submit, `.tool`, `.vclose`, 1193-1195 big buttons): 11 rules | `web/canvas.css:1001`, `1017`, `1044`, `1073`, `1079`, `1140`, `1164`, `1195` | global |
| Tree caret turns | page group opened | transform .2 s | `web/canvas.css:143` | global |
| More menu and floating popovers open | click | `pop` .2 s (fade, 6 px rise) on `.more-menu`, `.float`, `.models-pop`, `.video-pop:not(.vlive)`, `.export-pop`, `.finfo` | `web/canvas.css:1038`, `1029`, `1153` ; `web/canvas/design.js:589`, `web/canvas/publish.js:20`, `web/canvas/marks.js:32`, `web/canvas/film.js:265`, `web/canvas/settings.js:197`, `web/canvas/replay.js:59`, `web/canvas/replay.js:145` | global |
| Slash popup closes late | blur on the brief | 150 ms timer, no animation | `web/canvas/loop.js:359` | n/a |

## Player, Play and visitor tours

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Page frame fades while a page loads | `showPage` sets opacity 0, loads, then 1 | 120 ms delay, then `opacity` .18 s | `web/canvas.css:288` ; `web/canvas/player.js:155-159` | global |
| Device shell resize (desktop / phone) | `setDevice`, `fitDevice` | width/height/left/top written at once, no transition | `web/canvas/player.js:131-145` | n/a |
| Play page motion (scroll reveals in the page) | Play with motion switch on (`M`) | from `engine/motion.mjs`, injected into the page; preset `snappy` or `gentle` from the theme | `web/canvas/player.js:114-121`, `web/canvas/player.js:123-129` ; `engine/motion.mjs:20`, `web/canvas/core.js:22` | handled in the engine: media rule at `engine/motion.mjs:20` and a script bail-out at `:33` |
| Hint outline on `data-goto` after a dead click | click in the Play frame | outline for 700 ms, no animation | `web/canvas/player.js:105`, `web/canvas/player.js:22` | n/a |
| Tour cursor glide | each tour step: `glide(x, y, live)` | `380 + 0.9*distance` ms, max 1100 ms; cubic ease-in-out; sideways arc, sign random (`bend`, max 60 px); rAF per step | `web/canvas/player.js:331-347` (random at `web/canvas/player.js:334`), `web/canvas/player.js:323` (`placeCursor`) | not handled |
| Tour cursor press ring and press scale | `press` step | arrow scale .12 s; `ring` .5 s ease-out forwards; removed at 500 ms | `web/canvas.css:312-315` ; `web/canvas/player.js:369-371` | global |
| Tour thought bubble | `think()` cycles phrasings | swap: opacity/transform .25 s, 160 ms to change text; new phrasing every 1500 ms (setInterval) | `web/canvas.css:317-318` ; `web/canvas/player.js:350-363` | global |
| Tour: hover / press on the page element; smooth scroll; typing into fields | tour ops | `.tour-hover` outline; `.tour-press` scale .96 over .1 s (180 ms hold); `scrollIntoView({behavior:'smooth'})` then 750 ms (or 60 ms) wait; typing 45-115 ms per character (random), 300 ms before a select | `web/canvas/player.js:105-106` (CSS in the frame), `web/canvas/player.js:41-61` (random at `web/canvas/player.js:61`) | not handled |
| Tour waits | each step | 450 ms after a page change, 500 ms before locating | `web/canvas/player.js:304`, `web/canvas/player.js:440-442` | not handled |
| "Watching" spinner on the tours button; "working" ellipsis in the tour menu | `tour.starting`; note state `working` | `spin` .8 s linear infinite; `blink` 1 s steps(2) | `web/canvas.css:2004`, `299` ; `web/canvas/player.js:276`, `web/canvas/player.js:409` | global |
| Play clip card (Video clip over Play / in the wall) | `playclip` created | `in` .25 s; none when `.in-wall` | `web/canvas.css:1884`, `1908` ; `web/canvas/rooms.js:97`, `web/canvas/rooms.js:111` | global |

## Panels (Design, Variables, side tabs, resizing)

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Design panel opens and closes | selection changes | polled every 250 ms (`setInterval`); panel is shown or hidden, no transition | `web/canvas/settings.js:258-265`, `renderPanels` | n/a |
| Design values flash when edited | `design.chg` set after an edit; `.dval.chg` | border and background transition .4 s | `web/canvas.css:343`, `346` ; `web/canvas/design.js:146` | global |
| Variables rows reveal after a fresh theme | `S.themeAt` within 3 s | `reveal` .45 s ease-out both (8 px from left), stagger 110 ms per row, set inline | `web/canvas.css:352-353` ; `web/canvas/design.js:189-204` | global |
| "Setting up the design system" ellipsis | no theme yet | `blink` 1 s steps(2) infinite | `web/canvas.css:362` ; `web/canvas/design.js:181`, `web/canvas/design.js:198` | global |
| Side panels resize (drag the inner edge) | `.resizer` pointer capture | `--side-w` (220-560) and `--design-w` (220-480) set per move event, no transition; saved to localStorage; double-click resets | `web/canvas/start.js:116-143` | n/a |
| Side tabs and floating panels | tab click | `.tabs button` colour .16 s only; panels switch with `hidden` | `web/canvas.css:1044` ; `web/canvas/settings.js:233-317` | global |
| Hermia strip fold | fold button | chevron `transform` .2 s; strip height via `--ah-h` custom property (no transition) | `web/canvas.css:680` ; `web/canvas/dock.js:18-23` | global |
| Hermia feed messages | `ah-msg` rendered | `in` .25 s; autoscroll jumps when within 60 px | `web/canvas.css:686` ; `web/canvas/dock.js:36-46` | global |
| Steps panel hidden (app) | `steps-min` | chevron mirrored; grid collapses, no transition | `web/canvas.css:659-660`, `690` ; `web/canvas/rooms.js:310-316` | n/a |
| Models picker list scroll into view | arrow keys | `scrollIntoView({block:'nearest'})`, no smooth | `web/canvas/settings.js:182` | n/a |
| Lite mode (frozen pages) | every 1 s `litePass`, not within 900 ms of camera movement | `body.lite`: grid background off, wire/bubble animation off, spark off; page iframe swapped for an image | `web/canvas.css:421-423` ; `web/canvas/settings.js:10-97` (`litePass` `web/canvas/settings.js:57`), `web/canvas/loop.js:111` | n/a (it removes motion) |

## Comments, marks and Scribble

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Comment pin / box follows the selected section | every 150 ms panel pass: `drawComment` writes `transform` | stepped at about 6.7 Hz, no transition; pin hover scales 1.08 | `web/canvas/marks.js:105`, `web/canvas/loop.js:119` ; `web/canvas.css:459` | global (hover only) |
| Scribble strokes on a page (Overview) | pointer drag in the Overview with the pen/ring/box tool | drawn live by pointer events, no animation | `web/project.js:1489-1500` (`world.addEventListener('pointerdown'…)`) | n/a |
| Draft section pending (written while Scribble redoes a level) | `.ab.draft.pending` | `mk-pulse` 1.4 s ease-in-out infinite (opacity to .35) | `web/project.css:302-303` ; `web/project.js:294` | `web/project.css:304` (animation none) |
| Hidden copy of the page finds the anchor | Scribble send | 900 and 700 ms settle waits, 1200 ms after load; no visible motion | `web/canvas/marks.js:289`, `web/canvas/marks.js:368`, `web/canvas/marks.js:406` | n/a |

## Manual edit

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Colour picker and combo popups placed | edit of a variable / font | positioned once from the target rect; colour commit debounced 450 ms | `web/canvas/design.js:476-477`, `web/canvas/design.js:525-526`, `web/canvas/design.js:512` | n/a |
| Edit-text dialog | opened | `pop` .2 s (`.finfo`) | `web/canvas.css:1153` ; `web/canvas/marks.js:32` | global |
| Undo / redo | key | no animation; the layer re-renders | `web/canvas/design.js:357-570` | n/a |
| Selection box | every 150 ms panel pass (`drawSelBox`) | stepped, no transition | `web/canvas/loop.js:118` | n/a |

## Publish, export and launch kit / Auto show

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Export and Publish panels open | click | `pop` .2 s | `web/canvas.css:1153` ; `web/canvas/design.js:589`, `web/canvas/publish.js:20` | global |
| Publish button label returns | after a copy / action | `setTimeout` 1800 ms restores the label | `web/canvas/publish.js:56` | n/a |
| Auto panel (steps list) opens; working step shimmer and spinner | Auto runs; `renderAutoPanel` each second while working | panel `in` .25 s; `li.working` background `shimmer` 1.6 s linear infinite and `::after` shimmer 1.4 s; spinner icon `spin` 1 s | `web/canvas.css:918`, `936`, `1230`, `1244`, `1491`, `1108` ; `web/canvas/auto.js:70-113` (interval `web/canvas/auto.js:112`) | global |
| Auto meter bar | step progress | width .5 s plus shimmer | `web/canvas.css:1213`, `1108` | global |
| Show card (step transition) slides in, holds, slides away | `showStep` on each Auto step | `sc-in` .38 s (translateX 42%, skew), shimmer 1.4 s over it, Hermia `sc-point` .9 s with .2 s delay; at 520 ms the view changes and body gets `show-fade` (.45 s, removed at 500 ms); `out` at 1200 ms (`sc-out` .42 s); removed at 1650 ms | `web/canvas.css:1470-1473`, `1484-1488` ; `web/canvas/auto.js:140-163` | handled in JS: with reduced motion or the wall, no card; the new view fades in over 320 ms with the Web Animations API (`web/canvas/auto.js:143-146`, `web/canvas/auto.js:121`); `.show-card, .ds-cur { display:none }` at `web/canvas.css:1693-1696` |
| Live tab badge pulse | `renderBadges` | `pulse` 1.2 s infinite on `.vbadge.working`; class refreshed every 1000 ms (setInterval) | `web/canvas.css:635`, `639` ; `web/canvas/rooms.js:42-47` | global |
| Deploy shot: log lines, caret, globe, stage dots | `deployShow` (stages `ds.stage`) | panel `in` .25 s; log line `in` .2 s; caret `blink` 1 s; globe arcs `radio-dash` .9 s; globe `ds-pulse` .7 s on each stage change (class re-added with a reflow); stage dot `pulse` 1 s | `web/canvas.css:1510`, `1521-1522`, `1527`, `1532-1533`, `1538` ; `web/canvas/auto.js:289-294` (`web/canvas/auto.js:291`), `web/canvas/auto.js:366-386` | global |
| Deploy shot: laptop/phone tour of the live site | `dsScript(names)` after the deploy | cursors glide `transform` .8 s; click dot `ds-click` .6 s ease-out; screen scroll `transform` 1.1 s; the script is a chain of `setTimeout`s from 400 ms to 11200 ms, then repeats | `web/canvas.css:1553-1562` ; `web/canvas/auto.js:327-364` (timers `web/canvas/auto.js:341`), `web/canvas/auto.js:337-339` | script not started when reduced (`web/canvas/auto.js:312`); `.ds-cur` hidden, `.ds-scroll` transition none (`web/canvas.css:1693-1696`) |
| Summary card bars | `showSummary` | panel `in` .3 s; bars `ss-grow` .8 s from scaleX 0 | `web/canvas.css:1571`, `1584-1588` ; `web/canvas/auto.js:386` | global |
| Launch pop (game) | publish | `in` .25 s (`.game-pop`) | `web/canvas.css:732` ; `web/canvas/auto.js:421` | global |
| Hand-off: summary and live view arrive after the deploy | `app:deployed` | `dsLive` after 700 ms; summary after 1200 ms (9000 ms when the deploy shot is showing) | `web/canvas/auto.js:63-65`, `web/canvas/auto.js:372` | n/a |
| Chatter fanfare and cheers | step change, done | audio only (see Randomness) | `web/chatter.js:210` | n/a |

## Replay

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Replayed build: sections type back in | `withTyping` splits a saved layer into 6-40 deltas spread over its build time | event clock `(t - prev)/speed`, quiet gaps capped at 1500 ms; ☰ Replay uses speed 1, the wall `?speed=` (default 8, 1-60) | `web/canvas/replay.js:222-238`, `web/canvas/replay.js:243-270` | not handled |
| Replay button label | `paintReplay` in the 150 ms pass | text swap, no animation | `web/canvas/replay.js:273-279` | n/a |
| Camera follows the replay | `startReplay` | `setAuto(true)` now and at +700 ms | `web/canvas/replay.js:281-292` | not handled |
| Wall tile progress bar | `wall:tick` message every 25 events | `width` transition .4 s linear; clock text updated | `web/wall.html:20`, `67-73` ; `web/canvas/replay.js:267` | none (no media rule in `wall.html`) |

## Models, settings and Setup

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Models picker | open | `pop` .2 s | `web/canvas.css:1153` ; `web/canvas/settings.js:197` | global |
| Setup / Settings dialogs and popovers (`SwarmUI`) | `ui.js` dialog, popover | overlay `ui-fade` .18 s ease-out; dialog `ui-rise` .2 s (8 px rise, scale .985); popover uses `ui-rise` | `web/ui.css:81-90`, `103-104`, `187` ; `web/ui.js:39-46` | `web/ui.css:206` (animation none on overlay, dialog, popover) |
| Switch, collapsible chevron, progress bar | click | switch background and knob .16 s; chevron .16 s; `.ui-progress > i` width .3 s | `web/ui.css:132-133`, `161`, `173` | global |
| Setup step: spinner, chevron | a check is running | `su-spin` .8 s linear infinite; head chevron .16 s | `web/setup.css:21-22`, `13` ; `web/setup.js:73` (poll) | `web/setup.css:23` (both off) |
| Buttons and fields in settings: hover/focus | pointer | 160 ms background, border, colour, box-shadow | `web/ui.css:51` | global |

## App, game and film rooms (code wall, art wall, crew radio, bench)

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| App room: building spinner; loading spinner; steps; device width | app view working / loading | `spin` 1 s linear infinite (`.app-empty .spin`, `.app-loading .spin`, `.game-pop .spin`); step `in` .25 s; `.app-shell` width .3 s ease when the device preset changes | `web/canvas.css:719-720`, `753`, `1797`, `697`, `710` ; `web/canvas/rooms.js:223`, `web/canvas/rooms.js:246`, `web/canvas/rooms.js:149-184` | global |
| Game room: panel in; character cards hover | `game.el` opens; hover | `in` .25 s; card border/transform .15 s | `web/canvas.css:732`, `766` ; `web/canvas/rooms.js:697` | `web/canvas.css:776` (transition none, no hover lift) |
| Bench (Meshy character jobs): clay fill rises, wire meridians turn, bones appear, made model lifts, library shelf bumps | per job `stage` (`st-model/rig/download`) and `--p` set by the poll; `--ago` offset set in markup so a re-render does not restart the loop | fill `transform` .8 s ease-out; `fg-turn` 3.2 s linear infinite (second meridian offset -1.6 s); `fg-bone` .4 s with .22 s stagger per bone; `fg-lift` 3.2 s ease-in-out infinite; `fg-got` .6 s on `.fg-lib.got`; offscreen tiles paused by `IntersectionObserver` adding `.rest` (`animation-play-state: paused`) | `web/canvas.css:795-828` (`801`, `811`, `814`, `827`, `820`) ; `web/canvas/rooms.js:894-926`, `web/canvas/rooms.js:934`, `web/canvas/rooms.js:910` | `web/canvas.css:834-838` (turn, lift, got, bones, fill transition off); the bench cursor pin sits still (`web/canvas/rooms.js:946`) |
| Code wall: panel in; plan card; plan avatar bob; scan bar | `appv.state === 'working'`, `cw.el` | panel `in` .25 s; plan `in` .3 s; `plan-bob` 2.4 s infinite; `plan-scan` 1.8 s infinite; `cw-think` 1 s alternate on the "thinking" line | `web/canvas.css:943`, `1294`, `1297`, `1307-1308`, `1906-1907` ; `web/canvas/dock.js:61`, `web/canvas/rooms.js:403-413` | global |
| Code wall: files type out and scroll | `codeWall()` each loop turn | each turn adds `max(3, ceil(len/260))` characters per tile; read-only tiles scroll 0.6 px per turn and wrap to the top; caret `blink` 1 s steps(1); tile border .3 s; grid column change .25 s on zoom | `web/canvas.css:950`, `955`, `969` ; `web/canvas/dock.js:49`, `web/canvas/dock.js:156-181`, `web/canvas/dock.js:356` (loop) | global; typing itself is JS and not reduced |
| Art wall: picture faces cross-fade, 3D turn, empty cube, scan sweep | new picture loaded into a tile | face `opacity` .7 s; `cw-turn` 7 s ease-in-out infinite alternate; `cw-cube` 11 s linear infinite when empty; `cw-scan` 1.1 s once (re-triggered by removing and re-adding `.scan` with a reflow); painting wash `cw-wash` 3.2 s alternate, checking scan 1.6 s infinite; `.cw-pic` opacity/transform .3 s | `web/canvas.css:1322-1372` (`1324`, `1329`, `1332`, `1358`, `1365-1367`) ; `web/canvas/dock.js:209-236` (`web/canvas/dock.js:229`), `web/canvas/dock.js:290-334` (`web/canvas/dock.js:331`) | `web/canvas.css:1374-1378` (turn, cube, scan, wash off; face fade stays .7 s) |
| Art wall: pictures rotate in a window | `cwSlide` | a new picture every 5200 ms per window (`CW_EVERY`), windows staggered by 1700 ms; shows the newest 6 | `web/canvas/dock.js:269-279` | not handled |
| Crew radio | `radio.acts` / `radio.says` | strip dotted line (above, Crew cursors); bubble text; `babble` class toggled on avatars for up to 4000 ms; **no CSS rule uses `.babble`** (dead toggle) | `web/canvas/auto.js:566-572`, `web/canvas/start.js:272-280` | see above |
| Film room: scene cards stagger in; progress bar | video render | `vin` .4 s (8 px rise), delay .35 s per card, up to 2.1 s (`:nth-child` 2..7+); `.vbar i` width .4 s; scenes also reach the feed 350 ms apart | `web/canvas.css:438-440`, `448` ; `web/canvas/film.js:50`, `web/canvas/film.js:104` | global |
| Art studio cells (Art Studio / art painting in the app room) | a cell is being painted, then lands | `as-shine` 1.4 s infinite on `.on`; the painter (`.as-bot`) `as-move` 2.6 s infinite; image `as-land` .5 s; caption opacity .15 s | `web/canvas.css:1865-1874` (`1870-1873`) ; `web/canvas/rooms.js:268` | `web/canvas.css:1875` (bot, shine, image off) |
| Advisor card, idle card | opened | no CSS animation; poll-driven | `web/canvas/rooms.js:515-686`, `web/canvas/rooms.js:448` | n/a |

## Overview and Projects (`web/project.js`, `web/home.js`, `web/project.css`, `web/home.css`)

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Projects (home) crew cursors on a live card | `wander(box)` per `.cur` | each cursor re-aims every 1200-2800 ms (random left 8-78 %, top 10-72 %); `left`/`top` transition 1.4 s | `web/home.css:28` ; `web/home.js:306-311` (random `308`) | `web/home.css:31` (transition none) |
| Projects: indeterminate progress | live card without a percentage | `hm-prog` 1.6 s ease-in-out infinite; with a percentage, width .6 s | `web/home.css:204-205`, `86` ; `web/home.js:181` | `web/home.css:206` |
| Projects: card actions appear on hover; chevron | hover; open section | opacity .12 s; chevron `transform` .12 s | `web/home.css:156`, `187` | global |
| Projects: phone sidebar drawer | ☰ on phones (max 760 px), `.home.drawer` | `transform` .25 s | `web/home.css:130-131` ; `web/home.js:983-990` | not covered by `web/home.css:31` or `:206`; global rule only |
| Projects data refresh (re-renders cards) | poll | 4000 ms while any project is live, else 20000 ms (setTimeout chain) | `web/home.js:104` | n/a |
| Overview camera (`.pj-world`) glide | `fit`, `frameAll`, `zoomTo`, `board.js` `ease` | `.ease` class: `transform` .3 s ease; removed after 300 ms; `.moving` hint held 280 ms after a gesture | `web/project.css:58`, `60` ; `web/project.js:862-891`, `826`, `965`, `board.js:36-40` | `web/project.css:208` |
| Overview: file sheet on phones | `sheet(on)` | `.pj-side` transform .22 s | `web/project.css:191` ; `web/project.js:807-812` | `web/project.css:206` |
| Overview: crew cursors | a build is working; `placeCrew` | place every 1400-2300 ms (random spot 20-80 % of a page); while the camera moves they are corrected about 10 times a second and `.cur.track` eases `left`/`top` .1 s linear | `web/project.css:108` ; `web/project.js:1396-1475` (random `1412`, `1429`; track `1466-1476`) | `web/project.css:109` |
| Overview: reviewer scan sweep | a page in `checking` review | `rv-sweep` 4 s linear infinite; delay set from `Date.now() % 4000` so it matches the cursor | `web/project.css:246-247` ; `web/project.js:379`, `1486` (`scanAt`) | `web/project.css:266` |
| Overview: picture slots being painted | pending art | `pt-shine` 2.4 s linear infinite; sketch strokes `pt-draw` 7 / 9 / 11 s forwards (delay `--ago`); bar `pt-buf` 1.3 s linear and width 1.8 s linear; stand-in `pt-in` .8 s | `web/project.css:214-232` | `web/project.css:266-268` (shine, bar shimmer off; strokes shown drawn) |
| Overview: picture lands | `P.landed` | `pt-in` 1.4 s ease on the new image over its stand-in; kept 1600 ms then re-rendered | `web/project.css:238` ; `web/project.js:116`, `308` | global |
| Overview: "building" bars on artboards | live work | indeterminate `ab-work` 1.6 s infinite; width .6 s | `web/project.css:272-273` ; `web/project.js:238` | `web/project.css:275` |
| Overview: skeleton and "now" dot | skeleton over a still-painting image; now-working beat | `sk-wait` 1.6 s alternate; `pj-beat` 1.2 s infinite | `web/project.css:86-87`, `259-260` ; `web/project.js` | `web/project.css:88`, `266` |
| Overview: upload bar; plan cards fade in as they are written | upload; plan generation | upload width .2 s linear; `.ab.pcard.wait` to visible: opacity/transform .3 s, one card per 320 ms (0 ms when reduced) | `web/project.css:102` ; `web/plan.css:22`, `37` ; `web/plan.js:161-163` | `web/plan.css:39` and `web/plan.js:161` |
| Plan: sheen on a card being painted; the brand sheet's cards while its options are made | `.pl-work` | `pl-sheen` 2.4 s linear infinite | `web/plan.css:75-76` ; `web/brand.js` skeleton | `web/plan.css:77` |
| Overview data refresh | poll | 2000 ms busy, 3000 ms live, else 15000 ms (setTimeout chain); `image`/`review` events re-load after 350 ms, others after 800 ms | `web/project.js:138`, `1692-1698` | n/a |

## Page frames (`web/frame.html`)

These run inside each frame (an iframe with its own origin, or the Play frame), so the global reduced-motion rule does not reach them.

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Slot draws in (clip-path wipe) | slot message `anim: 'drawing'` when a layer is assigned | `draw` .6 s cubic-bezier(.2,.8,.2,1) both; class removed after 650 ms | `web/frame.html:53-54`, `133` ; `web/canvas/deck.js:195` | none |
| Slot flash when a layer finishes | `anim: 'flash'` | `flash` 1.1 s ease-out; class removed after 1100 ms | `web/frame.html:56-57`, `133` ; `web/canvas/deck.js:196` | none |
| Writing caret at the end of streamed text | `.streaming` slot with text | `caret` 1 s steps(2) infinite; position written on each report | `web/frame.html:59-60`, `160-168` | none |
| Painting image shimmer, then develop | `img[data-gen]` without `src`, then `src` arrives | `paint` 1.6 s linear infinite; real image `develop` .9 s ease-out (blur 14 px, saturate .3 to none); not on sketches | `web/frame.html:62-67` | none |
| "Real picture coming" mark with a run bar | `.pt-mark` over a pending image | `pt-run` 1.6 s ease-in-out infinite | `web/frame.html:73`, `77`, `180` | `web/frame.html:78` (static 60 % bar) |
| Reviewer scan band and seconds pill | `scan` message | `scan` 2.4 s cubic-bezier(.45,0,.55,1) infinite; pill text updated every 1000 ms (setInterval) | `web/frame.html:81-83`, `258-264` ; `web/canvas/marks.js:248` | none |
| Geometry report timer | always | every 80 ms while the page changes; after 25 still ticks, every 480 ms | `web/frame.html:280-283` | n/a |

## The rest (ui.css, studio.css, plan.css, workshop, setup, brand, wall)

| What moves | When | How long / how often | Owned by | Reduced motion |
|---|---|---|---|---|
| Work chip dot and bar (top bar) | background jobs listed by `work.js` | `wk-pulse` 1.4 s infinite; indeterminate `wk-slide` 1.6 s ease-in-out infinite; width .6 s; mode button icon .15 s | `web/studio.css:94`, `99-100`, `110-111`, `74` ; `web/work.js:38`, `51` | `web/studio.css:112` |
| Work poll | always | 3000 ms with jobs, else 15000 ms | `web/work.js:91` | n/a |
| Workshop: panel in; spinners; shine; sound wave bars; sprite sheet; step ring; slice cards | workshop open; a picture is painting; sound plays | panel `in` .2 s; `spin` 1 s; `as-shine` 1.4 s infinite on `.ws-wait`; `ws-bar` .9 s ease-in-out infinite on `.ws-wave.on i`, delays -.3 s and -.6 s; sprite frame every 450 ms (setInterval, six poses); ring `stroke-dasharray` .3 s; slice border/transform .15 s | `web/workshop.css:2`, `44`, `51-53`, `78`, `12`, `32` ; `web/workshop.js:98-104`, `232-236`, `152` | `web/workshop.css:79` (shine off) and `web/workshop.js:232` (sprite does not step); `ws-wave` and `ws-bar` not covered except by the global rule |
| Workshop poll while painting | `painting()` | every 3000 ms | `web/workshop.js:61-65` | n/a |
| Workshop sound loop | Play sound | schedules `beat * 8` seconds of audio at a time (setInterval) | `web/workshop.js:296-305` | n/a |
| Brand panel | n/a | no keyframes or transitions in `web/brand.css`; the three SVGs in `web/brand/` have no animation | `web/brand.css`, `web/brand/*.svg` | n/a |
| Scaffold, Setup chrome | n/a | `web/scaffold.css` has no motion | `web/scaffold.css` | n/a |
| Version check, reload | always | every 8000 ms: `location.reload()` once idle | `web/canvas/start.js:98-105` | n/a |
| Wall tiles | `wall.html` | iframe tiles run the replay in `?replay=` mode; bar width .4 s linear | `web/wall.html:20`, `67-73` | none |
| Live preview scale | a `.vlive` box resizes | `transform: scale()` rewritten on ResizeObserver and every 1000 ms | `web/canvas/start.js:350-356` | n/a |
| Toasts | board and home | removed after 3000 ms (6000 ms with an action); no animation | `web/board.js:109`, `web/home.js:1005`, `web/project.js:1662` | n/a |

## JS clocks

Every `requestAnimationFrame` loop and `setInterval` in `web/*.js` and `web/*.html`.

| Clock | Rate | What it moves | Where |
|---|---|---|---|
| `frameLoop` (rAF, throttled by hand) | target 24 fps while a build runs, 20 with more than 8 agents, 120 while the camera moves (`moving`), 10 behind the Overview or Projects (`cosmos-project` / `cosmos-home`; it still calls `syncSlots` every 40 ms there); at rest `nextFrame` drops to a 200 ms timer; `wakeLoops` on pointerdown, pointermove, wheel, keydown | camera, viewport grid, wires, every agent cursor, banter; every 150 ms a panel pass (agents list, doing text, toolbar, Design panel, selection box, comment box, tree, status, buttons, replay button, progress bar, timer); every 1000 ms `litePass` | `web/canvas/loop.js:18-157` (`frameLoop` `web/canvas/loop.js:26`, start `web/canvas/start.js:114`; `nextFrame` `web/canvas/loop.js:163`; `wakeLoops` `web/canvas/loop.js:167-170`) |
| `nextFrame` / `sleepers` | rAF when something moves, else `setTimeout` of 200 ms (default) | shared helper for `frameLoop`, `crewTick`, `cwLoop` | `web/canvas/loop.js:162-170` |
| `crewTick` (rAF through `nextFrame`) | every rAF while a crew job exists; otherwise every 300 ms | crew cursors, radio line | `web/canvas/start.js:211-282` (start `web/canvas/start.js:282`, idle `web/canvas/start.js:214`) |
| `cwLoop` (rAF through `nextFrame`) | every rAF while `view === 'app'` and the app is working; otherwise every 400 ms | code and art wall tiles (typing, scroll, picture turns) | `web/canvas/dock.js:356` |
| `rvTick` (rAF) | every rAF while the reviewer cursor exists; stops when it leaves | reviewer cursor, `--inv` | `web/canvas/auto.js:193-202`, started `web/canvas/auto.js:216` |
| `glide` step (rAF) | per rAF for 380-1100 ms per tour move | tour cursor | `web/canvas/player.js:331-347` |
| Hermia's cursor `step` (rAF) | every rAF while she is more than 0.6 px from her target; stops at rest and in a hidden tab | the pet | `web/pet.js:206-218` |
| `draw` in layerlink (rAF) | every rAF while any line is drawn (`wake()` restarts it) | dashed lines from chips to layers | `web/layerlink.js:95-128` |
| One-shot rAF | once | `appKitArrows` after render (`web/kit-app.js:111`); Overview narrow-screen fit and zoom (`web/project.js:598`, `1019`) | |
| `think` phrase timer | 1500 ms | tour thought bubble | `web/canvas/player.js:362` |
| Design panel follower | 250 ms | opens and closes the Design panel | `web/canvas/settings.js:258` |
| `renderBadges` | 1000 ms | Video and App tab badges (pulse class) | `web/canvas/rooms.js:47` |
| `fitLive` | 1000 ms (and on ResizeObserver) | live preview iframe scale | `web/canvas/start.js:356` |
| Auto panel refresh | 1000 ms while working | re-renders the step list | `web/canvas/auto.js:112` |
| Reviewer wander | 1100 ms | new target spot for the reviewer | `web/canvas/auto.js:215` |
| Video orphan poll | 5000 ms (asks the server at most every 20 s) | failed-state only | `web/canvas/film.js:215` |
| App elsewhere poll | 4000 ms | reloads the app view | `web/canvas/rooms.js:81` |
| Version poll | 8000 ms | page reload when a newer canvas exists | `web/canvas/start.js:98` |
| Workshop painting poll | 3000 ms | re-renders the workshop | `web/workshop.js:61` |
| Workshop sprite step | 450 ms per sprite sheet (none when reduced) | sprite background position, 6 poses | `web/workshop.js:235` |
| Workshop sound scheduler | `beat * 8` s | Web Audio notes, not visual | `web/workshop.js:305` |
| Frame: review pill | 1000 ms while the scan is on | pill text | `web/frame.html:263` |
| Frame: geometry report | 80 ms while the page changes; about 480 ms after 25 still ticks | reports slot boxes to the canvas | `web/frame.html:280` |

Not intervals but they run on a clock: setTimeout chains for data polls (`web/home.js:104`, `web/project.js:138`, `web/work.js:91`, `web/plan.js:140`), the Overview crew (`web/project.js:1412`, `1470`), the Projects cursors (`web/home.js:308`), the Deploy-shot script (`web/canvas/auto.js:341`), and the per-step timers of the Auto show (`web/canvas/auto.js:159-161`).

## Randomness

`Math.random` that changes motion or layout in `web/*.js`. The checker should seed these (replace `Math.random` before load). Audio-only uses are listed last so they are not mistaken for motion.

| File:line | What it varies |
|---|---|
| `web/pet.js:116` | which of an event's lines Hermia's cursor says (text only, no motion) |
| `web/canvas/deck.js:24` | start offset of a new agent cursor above its dock seat |
| `web/canvas/deck.js:88` | `--dx`, horizontal drift of each `spark` letter |
| `web/canvas/deck.js:256` | whether an `<svg>` tail gets a `pen` gesture (50 %) |
| `web/canvas/deck.js:259` | `swatch` gesture (40 %) |
| `web/canvas/deck.js:261` | `shape` / `menu` / none for a styled box (40 / 35 / 25 %) |
| `web/canvas/deck.js:266` | `type` gesture while writing a heading or paragraph (35 %) |
| `web/canvas/deck.js:249` | `rand(a, b)` used for gesture sizes (shape width/height, pen radius, rest time 700-1800 ms) at `web/canvas/deck.js:296-300`, `web/canvas/deck.js:316`, `web/canvas/deck.js:360` |
| `web/canvas/deck.js:309` | which colour a `swatch` gesture picks |
| `web/canvas/deck.js:337` | whether the cursor walks to the toolbar first (40 %) |
| `web/canvas/deck.js:483` | `pick(list)`: banter, who speaks, which quip (used by `runBanter` at `987`, `991`) |
| `web/canvas/deck.js:497`, `web/canvas/deck.js:501` | gap before the next banter line; fight or high five (45 % or 25 %) |
| `web/canvas/player.js:61` | per-character typing delay in tours (45-115 ms) |
| `web/canvas/player.js:334` | side of the arc and bend direction in `glide` |
| `web/canvas/player.js:443` | tour click point inside the target box |
| `web/canvas/start.js:203`, `web/canvas/start.js:205` | crew cursor spot choice (60 % one of the busy parts) and position |
| `web/canvas/start.js:249` | crew typing press (12 % per frame once 160 ms have passed) |
| `web/canvas/start.js:253`, `web/canvas/start.js:255` | crew next-spot delay (1400-3600 ms) and which line it says |
| `web/canvas/dock.js:118` | which file a read-only code tile shows |
| `web/home.js:308` | Projects cursor spots and re-aim delay |
| `web/project.js:1412` | Overview crew re-aim delay |
| `web/project.js:1429`, `1437` | Overview crew spot on a page, and which page they roam to |
| `web/canvas/design.js:215` | `CLIENT` id (not motion) |
| `web/chatter.js:89`, `97`, `239` | audio only: noise buffers, loop start, sparkle fanfare |
| `web/workshop.js:283` | audio only: noise for the sound loop |

`Date.now()` and `performance.now()` also steer motion (the review scan delay in `web/project.js:379` and `scanAt` at `1486`, gesture clocks); a seeded run needs a fake clock as well as a fixed `Math.random`.

## Surprises, for whoever splits the file

- Dead toggles: `.hop` (`web/canvas/events.js:142`) and `.babble` (`web/canvas/auto.js:571`) are added to elements but no stylesheet rule uses them. Keep or drop them, but do it on purpose.
- `@keyframes blink` and `@keyframes bob` are each defined twice in `web/canvas.css` (`106`/`970`, `237`/`1129`). The later definition wins for every user. A split of the CSS must keep that order.
- No keyframes are unused: every `@keyframes` is referenced by an `animation`.
- JS-driven motion has no reduced-motion handling except the Auto show card (`web/canvas/auto.js:143`), the deploy-shot tour (`web/canvas/auto.js:312`), the bench cursor (`web/canvas/rooms.js:946`), the Plan card stagger (`web/plan.js:161`) and the workshop sprite (`web/workshop.js:232`). The camera glide, cursor travel, tour glide, crew and reviewer cursors, code-wall typing and replay still move under the blanket CSS rule.
- The page frames (`web/frame.html`) have a reduced-motion rule for one animation only (`pt-run`); `draw`, `flash`, `caret`, `paint`, `develop` and `scan` keep running there.
- `crewTick` (0.08) and `rvTick` (0.12) ease per rAF frame without the `dt` correction that `frameLoop` has, so their speed follows the screen's frame rate. A checker comparing them has to fix the frame rate.
- `crewTick` and `cwLoop` run at the full rAF rate while active, not at 24 fps like `frameLoop`.
- `engine/motion.mjs` (outside `web/`) injects the Play-mode scroll reveal; it checks `prefers-reduced-motion` itself.

## Counts

63 `@keyframes` (39 `web/canvas.css`, 9 `web/project.css`, 7 `web/frame.html`, 2 each `web/studio.css` and `web/ui.css`, 1 each `web/home.css`, `web/plan.css`, `web/setup.css`, `web/workshop.css`); 2 of the 39 repeat a name; 0 unused. 68 `transition:` declarations (39 `web/canvas.css`, 9 `web/project.css`, 6 `web/home.css`, 5 `web/ui.css`, 2 each `web/plan.css`, `web/setup.css`, `web/studio.css`, `web/workshop.css`, 1 `web/wall.html`; 9 of them are `none` inside reduced-motion blocks), plus one injected into the Play frame (`web/canvas/player.js:106`). 21 `prefers-reduced-motion` blocks in CSS and frame.html, 6 JS checks. 5 standing rAF loops (`frameLoop`, `crewTick`, `cwLoop`, `rvTick`, layerlink `draw`), 1 per-move rAF loop (`glide`) and 3 one-shot rAF calls. 14 `setInterval`s (9 in `web/canvas.js`, 3 in `web/workshop.js`, 2 in `web/frame.html`). 1 Web Animations call (`web/canvas/auto.js:145`). 25 `Math.random` sites that change motion or layout, 4 audio-only.
