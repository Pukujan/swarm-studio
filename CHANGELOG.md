# Changelog

What each release of Swarm Studio changes for a person using it. A release is a stable pin apart from main
([decision 0008](docs/decisions/0008-releases-stable-pin.md)): the catalog installs a `release/*` branch, which also
carries the next UI's build ([decision 0018](docs/decisions/0018-next-ui-build-on-release.md)).

## 0.4.0 (2026-11-14)

Everything merged to main since 0.3.1 branched from it (43b4bbd, 2026-11-12). The fixes 0.3.1 already carried
are marked *(in 0.3.1)*.

### Making something

- **Make offers the ways to begin** in one menu: Just build, Guided, Three takes, Scaffold and Studio (spec 42,
  #417; first as Studio, Brand sheet and Build now, #366). Studio first asks before it builds (spec 37, #341, #338).
  An empty box works, and a Build now that doesn't start stays on Projects (#359).
- **The Studio scaffold**: five steps, the Website kit, References and Assets (spec 37, #354), as a state of the
  navigation machine (#356).
- **Kits on the Studio board**:
  - the App kit (an app's users, screen map, data and connections, built from its lock; #342), which reads only
    declared keys and hands one to the app only when its locked plan uses it (#361);
  - the game kit on the Plan board, which builds only once locked (#349, #362);
  - the Deck kit (#350);
  - the Video kit (#357, #363).
- **Decks**: looks from html-ppt and the deck engine, with an outline, slides, one HTML file that presents itself,
  and PDF (spec 35, #344).
- **Brand packs** from Open Design: 53 generic looks, suggested two or three at a time (#339).
- **Story, slice 1**: every build's story as beats and designed cards (spec 39, #343).
- **Films with no website**: from the brand, References and Assets; the Story film; a square cut (spec 40, #346).
- **Game starters**: a choice on the Plan board, with why, that goes into the locked spec (#340). The strategy
  starter, seeded into Godot builds and measured at 500 units in Godot and in the Web export (#345, #347), and the
  side-view platformer (#353).
- **The lightbulb** shows a few examples for the kind picked, and nothing opens by itself (#360).
- **The chat asks before every build**: skip all and build now, go step by step, or pick the steps to skip. Make's
  menu is now two ways, Just make it and Studio ([decision 0020](docs/decisions/0020-ask-before-build.md), #479).
- **Chat modes**: Ask, Plan, Build and Fix, one switch in the chat box (spec 46, #501).
- **Copy the look from a link**: the crew opens the site in a real browser and walks it, 2D first
  ([decision 0022](docs/decisions/0022-copy-the-look-from-a-link.md), #480).
- **The match check** shows Reference beside Yours with the top style differences, and fixes them on your word
  (#484).
- **A reference's look can be the brand**, and a colour, font or brand ask changes only the look: every page stays
  as it is (#487, #488).
- **Bring a game or app in**: a GitHub repository or a folder becomes a project the Studio opens (spec 45, #496).
- **Open Design's design systems**: all 152, with their tokens, rules and components, used by the builders (#470).
  Its skills and templates are chosen the way Open Design chooses them (#476).
- **Story, slices 2 to 4**: the Story lane on the Overview, with edit, and the Launch kit written from the story
  (#352); Post to Feed carries the story and its cards, phone first (#364); each Launch kit post gets its story
  card in the network's shape, and Share (#365).
- **Post to Feed signs in first**, the same as Setup, instead of a quiet Connect code (#277).
- **A comment about a picture** repaints it and keeps the layout, and Undo takes back a crew rewrite (#483).
- **Sprites** are cut out with the Python that has Pillow, not whichever `python3` comes first (#498).
- **The ARES demo game's autopilot** routes over platforms and fights foes in the air (#225).

### The Studio

- **Hermia's cursor** on every Studio screen, and loading skeletons she works on (spec 41, #418).
- **Layers** on the left of the Studio scaffold, the Design deck and the Overview, one shared tree (#416).
- **Projects**: Models opens from the user menu, one Crew sound switch, Empty Trash says what it did, and empty
  views say so (#414).
- **The brand sheet**: a Projects › name › Brand crumb, a loading skeleton, and story fields that wrap (#413).
- **Setup**: pick the model from Hermes's own list (#386). A failed model check says what is wrong and the one fix
  that fits (#385). Setup › Parts lists what each part needs, by what you make (#421).
- **Settings**: Lite mode explained (#421); **Background** sets when an idle app and the server stop (#456).
- **The canvas's Models panel** shows Hermes's planner and builder model, and Change opens the picker (#387).
- **Board videos** show a poster frame until played, load metadata only, are torn down off screen, and at most 2
  play at once (#436).
- **The Overview**: the canvas behind it steps at 10 fps, and its cursors follow the camera at 10 Hz (spec 36,
  #348).
- **The Studio is a board** like the game's Plan board: facts top left, two columns, opened whole (#485). It opens
  from a built project too, and the mode menu lists Studio and Brand (#487).
- **The Chat button** brings a folded chat back in the Studio and on the brand sheet (#481).
- **Every wait shows a crew member at work**: a link being read, the match check, a picture being painted (#493).
- **The Design deck**: double-click a section to zoom in and centre it (#489). Undo and Redo sit in the tool dock,
  not the top bar (#490).
- **The App room**: one switch for the stage, Crew · Art · Live, and Play it live starts a stopped game (#500). A
  built app that is still starting says so and keeps trying (#492).
- **The Game view**: cursors move while they work, a reply is said once, and a game's room is named Game (#495).
- **Boards**, each behind a flag and off by default: the tier manager with its camera store behind `?board=tiers`
  (spec 43 step 5, #440), and the PixiJS layer for the Design deck, with videos and the live overlay, behind
  `?board=pixi` (spec 43 step 6, #471).

### The crew's work

- **Craft rules** in the builders' prompt, and a scored review that goes again under the bar (#467).
- **The slop linter** on every streamed section: Open Design's rules ported, the builder's fix pass, the reviewer
  (#465).
- **The crew animates through Hermes too**: a section that arrives whole is played out in small pieces (#482).

### Running on your computer

- **Processes run only when needed** ([decision 0017](docs/decisions/0017-processes-run-only-when-needed.md),
  #456):
  - an app's dev server runs only while the crew builds or you edit; a finished app is served built;
  - an app nobody has looked at for 2 minutes stops, and at most 2 run at once;
  - the server exits after 20 minutes with nothing to do and starts again on next use;
  - one film renders at a time;
  - every stop kills the whole process tree. execa 9.6.1 and tree-kill 1.2.2 are bundled; nothing is installed.
- **The server replaces itself** when its code changed on disk, so an update never leaves a half-old page (#486).
  Busy counts films, publishes and app and game builds, so a restart never stops one (#494).
- **The image service**: one store by content hash, a size ladder at `/img/<hash>?w=`, a 4096 px cap and ThumbHash
  placeholders (#437). @napi-rs/image 1.16.0 and thumbhash 0.1.1 are installed on first use, never at plugin
  install; `SWARM_IMAGE_SERVICE=0` turns it off.
- **plugin.yaml declares the `pre_tool_call` hook**, the approval gate for publish, deploy and post (#478).
- **When Hermes isn't there**, the Studio says so at once and says why, and every stop names its cause (#351, *in
  0.3.1*). Opening the Studio page in Hermes Desktop attaches Hermes at once (#355, *in 0.3.1*).
- **The app engine** installs on a Node it supports, not Hermes's Node 26 (#368, *in 0.3.1*). A multiplexed Hermes
  binds the profile's keys for model calls (#384).
- **Windows**: the ElevenLabs MCP path, path style in plan references and play-test names (#383); every file checked
  out with LF (#420).
- **macOS**: Godot is found as `Godot.app` when it isn't on `PATH` (#426).
- **The exported deck is sandboxed**, and the Hermes check reads only `gateway.pid` (#358, *in 0.3.1*).

### The next Studio (`/next/`)

The Studio is moving to React one screen at a time ([decision 0013](docs/decisions/0013-react-ui-coexists.md)).
`/next/` has no door yet: nothing a person can reach links to it ([decision 0008](docs/decisions/0008-releases-stable-pin.md)).

- The scaffold: React 19, TypeScript, XState and React Aria (#422).
- The Studio scaffold (StudioFirst) with the shared Layers (#423).
- The Design deck: the shell (#432), Play and Replay (#438), and Publish, Post to Feed, Export and the shared Layers
  (#441).
- The BoardHost seam, with slice 1's frames as its first host (decision 0014, #455).
- The Design deck: the chat, docked along the bottom (#472), comment threads and the Critic's flags (#454), and
  Watch a visitor (#442).
- The chat docks along the bottom on every screen, with no word pack (decision 0015, #458).
- Setup and Settings (#430). Home, Overview, Plan and Brand (#473).
- The app build wall, four windows (spec 44, #477).

### Checks

- UI audit gates on every top-level screen: breadcrumb, axe, sideways scroll, console errors, loading state (#419).
- A motion check (#372), made deterministic (#427), and a motion parity gate of `/` against `/next/` (#434).
- check.sh on Windows (#420) and a macOS job that installs the plugin through Hermes (#426).
- Prompt evals gate prompt changes (#466). Property tests for idle shutdown (#456). The mid-build Hermes test waits
  on the stop, not a poll budget (#468).
- The OpenSpec scenarios run as Playwright tests (playwright-bdd, decision 0019, #474). Metamorphic relations for
  the crew and the slop linter, on recorded output in CI and live models nightly (#475).
- A board gauge: how heavy a 250-page board is (#453).
- A pull request is compared with the main it is merged with (#497). Main's Mac job passes again, and a new push
  stops the run before it (#499).
- The next UI's build is made by CI and committed only on a release (decision 0018, #459).
- A type check for `web/` with no compile step, and dependency rules (#373). `web/canvas.js` is split by area
  (#375, #376, #377).
- Design tokens in W3C format, built with Style Dictionary (#412).
- The Studio walkthrough: every screen at 1440 and 390 wide (#369).

### Docs and decisions

- `docs/PRODUCT.md` (#370). One cited page per engine in `docs/engines/`, read before any claim (#381).
- Decisions 0010 to 0019 and specs 35 and 41 to 44: Open Design's tools, HyperFrames as the default film engine,
  image-first boards, how Swarm is tested, and more (#371, #374, #378, #379, #380, #433, #443, #460). Decisions
  0020 and 0022 and specs 45 and 46 came with their features (#479, #480, #496, #501).
- UX artefacts: the object map and glossary (#388), the statechart (#411), breadboards and per-screen specs (#424).
- AGENTS.md: use mature dependencies (#367).
- Catalog pictures: a 1200×600 banner and six screens, made by one script (#415).

## 0.3.1 (2026-11-12)

The stable re-pin for the catalog, on `release/0.3.x`. Fixes on top of 43b4bbd:
- Hermes re-attaches every 5 s, and opening the Studio page attaches at once (#351, #355).
- The health check reads only `gateway.pid` (#358).
- The app engine installs on a supported Node (#368).

## 0.3.0 (2026-11-11)

The version for the first catalog pin (#274).
