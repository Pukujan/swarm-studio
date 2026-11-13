# Changelog

What each release of Swarm Studio changes for a person using it. A release is a stable pin apart from main
([decision 0008](docs/decisions/0008-releases-stable-pin.md)): the catalog installs a `release/*` branch, which also
carries the next UI's build ([decision 0018](docs/decisions/0018-next-ui-build-on-release.md)).

## 0.4.0 (2026-11-13)

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

### The crew's work

- **Craft rules** in the builders' prompt, and a scored review that goes again under the bar (#467).
- **The slop linter** on every streamed section: Open Design's rules ported, the builder's fix pass, the reviewer
  (#465).

### Running on your computer

- **Processes run only when needed** ([decision 0017](docs/decisions/0017-processes-run-only-when-needed.md),
  #456):
  - an app's dev server runs only while the crew builds or you edit; a finished app is served built;
  - an app nobody has looked at for 2 minutes stops, and at most 2 run at once;
  - the server exits after 20 minutes with nothing to do and starts again on next use;
  - one film renders at a time;
  - every stop kills the whole process tree. execa 9.6.1 and tree-kill 1.2.2 are bundled; nothing is installed.
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

### Checks

- UI audit gates on every top-level screen: breadcrumb, axe, sideways scroll, console errors, loading state (#419).
- A motion check (#372), made deterministic (#427), and a motion parity gate of `/` against `/next/` (#434).
- check.sh on Windows (#420) and a macOS job that installs the plugin through Hermes (#426).
- Prompt evals gate prompt changes (#466). Property tests for idle shutdown (#456). The mid-build Hermes test waits
  on the stop, not a poll budget (#468).
- The next UI's build is made by CI and committed only on a release (decision 0018, #459).
- A type check for `web/` with no compile step, and dependency rules (#373). `web/canvas.js` is split by area
  (#375, #376, #377).
- Design tokens in W3C format, built with Style Dictionary (#412).
- The Studio walkthrough: every screen at 1440 and 390 wide (#369).

### Docs and decisions

- `docs/PRODUCT.md` (#370). One cited page per engine in `docs/engines/`, read before any claim (#381).
- Decisions 0010 to 0019 and specs 35 and 41 to 44: Open Design's tools, HyperFrames as the default film engine,
  image-first boards, how Swarm is tested, and more (#371, #374, #378, #379, #380, #433, #443, #460).
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
