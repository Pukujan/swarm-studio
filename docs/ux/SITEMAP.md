# Site maps and flows

Every screen of Swarm as one tree. Hermes opens the **Feed**, the way Kresilo opens on its home feed; the Studio
is inside it, reached through **+ Create** (a new build) or **Projects** (your builds). The Feed works like
TikTok: one build per screen, swipe for the next, and the build's own visuals and assets do the talking.

Each layer shows 2–4 choices, and the tree goes as deep as it needs to: the deepest paths are 14 layers (see
[RULES.md](RULES.md) rule 2). A dotted line jumps to another branch. Update this file when you add a layer or
move a branch.

Status: **agreed direction** (owner, 2026-11-09). Lens names follow [AUDIENCE.md](AUDIENCE.md).

## 1. The whole product

The same Feed opens from Hermes (with + Create and your Projects) and on the web at swarm.design-bakery.com
(where Remix and + Create hand off to Hermes). The web also has a **hosted studio** at `/studio/app`: a guest
tries a small build with no install, a few a day, then is pointed to the plugin (spec 13).

```mermaid
flowchart LR
  HX["Hermes: /swarm"] --> FEED["Swarm Feed"]
  WEB["swarm.design-bakery.com"] --> FEED
  FEED --> HOME[Home]
  FEED --> DISC[Discover]
  FEED --> PROJ[Projects]
  FEED --> ME[Me]
  FEED --> CR["+ Create"]
  CR --> ORB["Studio: the new project's canvas"]
  PROJ --> GAL["Projects: a file browser"]
  GAL --> ORB2["Studio: that project's canvas"]
  ORB -.->|Share › Post to Feed| HOME
  HOME -.->|Remix| CR
  WEB --> TRY["/studio › Try it here"]
  TRY --> HOSTED["Hosted studio /studio/app: guest build"]
  HOSTED -.->|Post to Feed| HOME
  HOSTED -.->|limit reached| HX
```

## 2. Navigation

Five slots, always in the same place: a bottom bar on a phone, a left rail on a desktop. Four places and one
primary action, + Create, in the middle.

```mermaid
flowchart LR
  APP["Swarm: opens on Home"] --> N1[Home]
  APP --> N2[Discover]
  APP --> N3["+ Create"]
  APP --> N4[Projects]
  APP --> N5[Me]
  N3 --> ST["Studio: the new project's canvas"]
  N4 --> GA["Projects: a file browser"]
```

## 3. Home

One build fills the screen and plays itself (a game demo, a site scrolling, a film clip). The only text is the
maker and the title. No descriptions: the assets and the story are pictures and clips.

```mermaid
flowchart LR
  HOME[Home] --> FY[For you]
  HOME --> FO[Following]
  HOME --> LV[Live]
  FY --> B["A build, full screen"]
  B --> NX["Swipe up: the next build"]
  B --> PL["It plays itself: game demo, site scroll, film clip"]
  B --> RL[Right rail]
  B --> AS["Swipe left: its assets"]
  B --> SY["Tap: its story"]
  B --> RX["Remix (the main button)"]
  RL --> R1[Maker]
  RL --> R2[Like]
  RL --> R3[Talk]
  RL --> R4[Share]
  R3 --> TK1["Pin a note to a spot or a moment"]
  R4 --> SH1["Save to a mood board"]
  R4 --> SH2["Copy link, send"]
  AS --> A1[Pages and screens]
  AS --> A2[Sprites and art]
  AS --> A3[Clips]
  AS --> A4[Palette and type]
  A2 --> A5[One asset, full size]
  A5 --> A6["Use it → + Create"]
  SY --> C1["Chapters as frames"]
  C1 --> C2["Before and after"]
  C2 --> C3["The prompt (tap)"]
  SY --> C4["Time-lapse of the crew building"]
  SY --> C5["Credits: people and agents, and how each part was made"]
  SY --> C6["Remix chain: what it came from, what came from it"]
  RX --> RX1["+ Create, starting from this build"]
  RX --> RX2["Or suggest it back to the maker"]
  RX2 --> RX3["The maker accepts: you're credited"]
  LV --> LV1["A crew building right now"]
  LV1 --> LV2["Its canvas, read only"]
```

## 4. Discover

The social side (open boards, jams, events, makers) is mostly Kresilo's code, already in Swarm Feed, moved into
this tree. What each piece borrows, and from where, is in [PATTERNS.md](PATTERNS.md).

```mermaid
flowchart LR
  DISC[Discover] --> SR[Search]
  DISC --> MK[Makers]
  DISC --> OBS[Open boards]
  DISC --> JE[Jams and events]
  SR --> SR1[Builds]
  SR --> SR2[Assets]
  SR --> PK[Packs]
  PK --> PK1["Sites, apps, games"]
  PK1 --> PA[A pack]
  PA --> PA1[Preview]
  PA --> PA2["Use it → + Create"]
  MK --> PF[A profile]
  PF --> PF1["Showcase: a grid of their builds"]
  PF --> PF2["Credits: builds they helped on"]
  PF --> PF3["Their story, as clips"]
  PF --> PF4[Follow]
  OBS --> OB[An open board]
  OB --> OB1[Wanted roles]
  OB --> OB2[Ask to join]
  OB2 --> OB3["The host accepts → Projects › Boards"]
  JE --> JM[Jams]
  JE --> EV[Events]
  JM --> JW["This week's jam"]
  JM --> JP["Past jams → winners"]
  JM --> JH[Host a jam]
  JW --> JW1[Theme and rules]
  JW --> JW2[Entries]
  JW --> JW3["Vote: one per entry, not your own"]
  JW --> JW4["Join → + Create, lens set by the jam"]
  JH --> JH1["Theme, up to 6 rules, open and close dates"]
  EV --> EV1[Live build sessions]
  EV --> EV2[Meetups]
  EV --> EV3[Host an event]
  EV1 --> EV4["Going → a reminder"]
  EV1 --> EV5["Watch a crew build, live"]
```

## 5. + Create

The one way to start a build. Hermia sits beside the input; the input becomes the chat inside the build.

```mermaid
flowchart LR
  CR["+ Create"] --> IDEA["Hermia and one input: the idea"]
  CR --> SRC["Start from (optional)"]
  SRC --> S1["A build: remix it"]
  SRC --> S2[A file]
  SRC --> S3["A pack or a mood board"]
  IDEA --> LENS["Lens chip, guessed from the idea"]
  LENS --> L0[Just make it]
  LENS --> L1[Design]
  LENS --> L2[Develop]
  LENS --> L3[Game]
  LENS --> L4[Launch]
  LENS -.->|Mix: add a second lens| L5[Design + Develop]
  L0 --> PR[Progress ring]
  PR --> RC[Result card]
  RC --> RC1[Open its canvas]
  RC --> RC2[Post to Feed]
  L1 --> O1["Canvas: Site"]
  L2 --> O2["Canvas: App, Code"]
  L3 --> PQ["Plan questions"] --> PB["Plan board: cards, inspector, Lock · N credits"]
  PB --> O3["Canvas: Game, Film"]
  L4 --> O4["Canvas: Site, Film, Posts"]
  L5 --> O5["Canvas: Site, App, Code"]
```

## 5b. The Plan board (spec 21)

A Game opens here after its questions. Nothing that costs credits runs before the lock.

```mermaid
flowchart LR
  TPL["💡 → a template: Remix"] --> PB
  PB["Projects › plan ▾ (Save as template)"] --> CARDS["Nine cards: name and one value"]
  CARDS --> INS["Inspector: fields, cast roster, system switches"]
  PB --> LOCK["Lock · N credits"]
  LOCK --> GATE["Gate: price by part, runs, pictures, Test one first"]
  GATE --> BUILD["Build / Build one"]
  PB --> SK["Sketches: Cast, Weapons (pick cells, a note each)"]
  PB --> MK["Mocks: five in-game frames"]
  PB --> WD["World: backdrops, after Lock style"]
  BUILD --> CU["Close-ups: cut-in and portrait per character"]
  BUILD --> BV["Build: front, side, back, the model (Download)"]
```

## 6. Projects

```mermaid
flowchart LR
  PROJ[Projects: a file browser] --> MB["Recent, All projects"]
  PROJ --> AS[Assets]
  PROJ --> TR[Trash]
  PROJ --> FO["Folders +"]
  PROJ --> ASK["What should the crew build? → Make"]
  ASK --> SC["💡 Showcase builds: name + steps → runs"]
  ASK --> GR["A vague prompt → Grill: one question at a time → Build"]
  ASK --> KM["Kind menu: Website, App, Game, Video, Grill me"]
  PROJ --> BD[Boards]
  PROJ --> MO[Mood boards]
  PROJ --> SW[Shared with me]
  MB --> ST["A card: picture, title, kind icons"]
  MB --> MS["Search, sort, grid or list, multi-select"]
  ST --> ORB["Open → its canvas"]
  ST --> RM["Right-click or ⋯: open, rename, duplicate, move, download, Trash"]
  ST --> VS["A stack: its versions"]
  ST -.->|drag| FO
  BD --> BO[A board]
  BD --> BN[Host a board]
  BN --> BN1["Cover and wanted roles"]
  BN --> BN2["Private, Public or Open"]
  BO --> BW["Its builds and assets"]
  BO --> BP[People]
  BO --> BI[Idea pins]
  BO --> BA[Activity]
  BP --> BP1["Requests to join → accept"]
  BP --> BP2["Invite link: edit or comment"]
  BP --> BP3["Credits, confirmed by each person"]
  BI --> PIN[A pin on a spot]
  PIN --> PIN1[Reply]
  PIN --> PIN2[Accept or decline]
  PIN --> PIN3["Build it → + Create"]
  MO --> MOB[A mood board]
  MOB --> MOI["Builds, assets, clips, palettes"]
  MOB --> MOS["Start from it → + Create"]
  MOB --> MOV["Private or Public"]
  SW --> SWB["Builds and boards you were invited to"]
```

## 7. Me

```mermaid
flowchart LR
  ME[Me] --> PR[My profile]
  ME --> LA[Launch]
  ME --> NO[Notifications]
  ME --> SE[Settings]
  PR --> PR1["Showcase (pinned builds)"]
  PR --> PR2["Credits: builds I helped on"]
  PR --> PR3["My story, as clips"]
  PR --> PR4[Followers]
  NO --> NO1["Requests to join my boards"]
  NO --> NO2["Credits to confirm"]
  NO --> NO3["Changes suggested to my builds"]
  LA --> LA1[A build]
  LA1 --> LA2[Posts]
  LA1 --> LA3[Promo video]
  LA1 --> LA4["Stats: views, plays, remixes"]
  SE --> SE1["Sound: mute, volume, voices"]
  SE --> SE2[Models]
  SE --> SE3[Connections]
  SE --> SE4[Keys]
  SE2 --> SE5[A role]
  SE5 --> SE6[Pick a model]
  SE6 --> SE7[Cost and speed]
  SE3 --> SE8["Supabase, GitHub, Feed account"]
```

## 8. A project: one canvas

```mermaid
flowchart LR
  PJ["A project"] --> TOP["Top bar: Projects › name ▾, the crew, Play, Publish"]
  PJ --> LEFT["Left panel"]
  PJ --> STG["Stage: artboards in sections"]
  PJ --> INS["Inspector (while something is selected)"]
  PJ --> DOCK["Dock: Move, Frame, Text, Image, Comment, Tell the crew…"]
  TOP --> VER["▾ Rename, Duplicate, Versions"]
  TOP --> MORE["☰ Review, Video, Export, Replay"]
  MORE --> RPD["Replay → Design deck"]
  LEFT --> FIL["Files: Site, App, Game, Film, Art, Uploads, Code"]
  LEFT --> LAY["Layers: pages and sections"]
  FIL --> FM["Right-click: Open, Rename, Duplicate, Download, Show in Finder, Delete"]
  FIL --> UP["+ → New page, Upload files; or drop from Finder"]
  STG --> DD["Double-click a page → Design deck"]
  STG --> ER["Double-click the app or game → Engine room"]
  PJ --> GB["A game still building opens on its build (Engine room) once; Back shows the canvas"]
  PJ --> WB["A website just started with Make opens in the Design deck (Follow on); Back shows the canvas"]
  STG --> FS["Double-click a film → Film studio"]
  INS --> EXP["Size, Style, Used on; Export, Replace"]
  DOCK --> CREW["The crew: fix the selected page, repaint the selected picture, or build the next version"]
```

The way home is always there and is not a branch: the breadcrumb (`Projects › project ▾`, then Back from a room), the
logo (back to Home) and Esc.

## 9. Progress, versions, share

```mermaid
flowchart LR
  PRG[Progress ring] --> PH1[Plan]
  PRG --> PH2[Make]
  PRG --> PH3[Ship]
  PRG --> STOP[Stop the build]
  PH2 --> T1[Pages]
  PH2 --> T2[App]
  PH2 --> T3[Footage]
  T1 --> A1[Designer]
  T1 --> A2[Critic]
  T1 --> A3[Fixer]
  A1 --> D1[Doing now]
  A1 --> D2[Decided]
  A1 --> D3[Made]
  D2 --> D4[Why]
  D4 --> D5[Prompt and model]
  D5 --> D6["Raw log (⌘K)"]
```

```mermaid
flowchart LR
  VER[Versions] --> V1[A version]
  V1 --> V2[Compare]
  V1 --> V3[Restore]
  V2 --> V4[Changes per page]
  V4 --> V5[Who changed it and why]
  SHR[Share] --> S1[Link]
  SHR --> S2[Publish]
  SHR --> S3[Promote]
  S2 --> W1[Website]
  S2 --> W2[Working app]
  S2 --> W3[Arcade]
  W1 --> W4[Address]
  W1 --> W5[Card look]
  W1 --> W6[Go live]
  W4 --> W7[Custom domain]
  W7 --> W8[DNS steps]
  S3 --> P1[Launch posts]
  S3 --> P2[Promo video]
  S3 --> P3[Post to Feed]
  P3 --> P4["Pick the cover clip and assets"]
  P4 --> P5[Post to Home]
```

## 10. The rooms

### Design deck

The one room with a full toolset. It follows Figma's layout and tools almost one to one (see
[PATTERNS.md](PATTERNS.md)): two panels, the canvas and one toolbar. The panels are zones, not layers.

It is also the one room where the crew can be watched at work, so a website started with Make on Projects opens
here, with the Follow camera on and the progress chip in view (owner, 2026-11-11: a build finished before anyone
had opened a page). Back goes to the project's canvas. A page double-clicked on that canvas opens here too.

```mermaid
flowchart LR
  DD[Design deck] --> LP[Left panel]
  DD --> CV[Canvas]
  DD --> TB[Toolbar]
  DD --> RP[Right panel]
  LP --> LM[Logo menu]
  LP --> PG[Pages]
  LP --> LY[Layers]
  LM --> LM1["Home, Discover, + Create, Projects, Me"]
  LM --> LM2[Versions]
  LM --> LM3[Export all]
  PG --> PA[A page]
  LY --> SC[A section]
  SC --> EL[An element]
  EL -.->|selects| DT
  CV --> CU[Crew cursors]
  CV --> PIN[Comment pins]
  CU --> FO[Follow one agent]
  CV --> RPL["Replay (☰): the saved build plays again, Follow on; Stop replay puts the finished build back"]
  FO --> TR[What it did]
  PIN --> YT["Yours: the crew replies"]
  PIN --> CI["The Critic's issues (3 at most)"]
  CI --> FX[Fix it]
  TB --> T1["Move, Frame, Shape, Pen, Text"]
  TB --> T2[Comment]
  TB --> T3["Hermia (⌘K)"]
  TB --> T4[Code]
  T2 -.-> PIN
  RP --> TOP["Crew, progress, Play, Share"]
  RP --> NS["Nothing selected: page and variables"]
  RP --> DT[Design tab]
  RP --> PT[Prototype tab]
  DT --> LA["Layout: position, auto layout"]
  DT --> AP["Appearance: fill, stroke, effects"]
  DT --> TY[Type]
  DT --> EX[Export]
  AP --> FI[Fill]
  FI --> TK["Token (a variable)"]
  NS --> TK
  TK --> TU[Where else it is used]
  PT --> OC[On click]
  PT --> AN[Animation]
```

### Engine room

```mermaid
flowchart LR
  ER[Engine room] --> PV[Preview]
  ER --> FL[Files]
  ER --> CK[Checks]
  ER --> EM["⋯ Deploy, Data"]
  FL --> F1[A folder]
  F1 --> F2[A file]
  F2 --> F3[A line]
  F3 --> F4[History of the line]
  CK --> K1[Passing]
  CK --> K2[Failing]
  K2 --> K3[A check]
  K3 --> K4[Error marker]
  K4 --> K5[Fix it]
  K4 --> K6["Raw output (⌘K)"]
  EM --> DP[Deploy]
  EM --> DA["Data (Supabase)"]
  DA --> DT[A table]
  DT --> DR[Rows]
```

### Game room

```mermaid
flowchart LR
  GR[Game room] --> PL[Play]
  GR --> TW[Tweak]
  GR --> GD[Details]
  GR --> AR["⋯ Publish to Arcade"]
  PL --> PM[Pause menu]
  PM --> PM1[Restart]
  PM --> PM2[Speed]
  PM --> PM3[Report a bug]
  PM3 --> BG1[Pin the spot]
  BG1 --> BG2[Fixer takes it]
  BG2 --> BG3["The fix, side by side"]
  TW --> FE[Feel]
  TW --> LO[Look]
  TW --> RU[Rules]
  FE --> FE1[Speed]
  FE --> FE2[Gravity]
  FE --> FE3[Controls]
  FE2 --> SL[Slider]
  SL --> VC[Value in the code]
  VC --> WH[Who set it and why]
  LO --> LO1[Art style]
  LO --> LO2[Palette]
  RU --> RU1[Levels]
  RU --> RU2[Score]
  GD --> GD1[Code]
  GD --> GD2[Assets]
  GD --> GD3[Logs]
```

The 7-step game wizard is gone. Its questions become the Tweak branch, asked after the first playable build.

A game build's wall follows what the crew is doing: three painters and one code tile while the art is painted, four code tiles after. When the build stops:

```mermaid
flowchart LR
  B[Build] --> A[Painting the art]
  A --> C[Writing the game]
  A -->|image model out of quota| Q["No art: model out of quota"]
  Q --> Q1[Another image model]
  Q --> Q2[Try again]
  Q --> Q3[Draw in code]
  Q1 --> A
  B -->|Stop| S["Stopped: N/M pictures · stage x of 5"]
  S --> S1[Go on]
  S1 --> A
```

### Film studio and Launch pad

```mermaid
flowchart LR
  FS[Film studio] --> WA[Watch]
  FS --> NC[New cut]
  FS --> SH[Shots]
  NC --> N1[Length]
  NC --> N2[Tone]
  NC --> N3[Music]
  SH --> S1[A shot]
  S1 --> S2[Prompt and source]
  S2 --> S3["Frame check (⌘K)"]
  LP[Launch pad] --> L1[Site]
  LP --> L2[Promo video]
  LP --> L3[Posts]
  L3 --> L4[A channel]
  L4 --> L5[A post]
  L5 --> L6[Edit]
  L5 --> L7[Schedule]
  L7 --> L8[Time and channel]
  L2 -.-> FS
```

## 11. Hermia, the commander

Hermia leads the crew. She is our own character: the owner's reference was an ink-style anime portrait, and we
take the look (bold black ink on white, flat, one accent colour, a cyber headset), not that character, per the
original-content rule.

```mermaid
flowchart LR
  HM["Hermia, the commander"] --> LK[Look]
  HM --> WR[Where she is]
  HM --> VC[Voice]
  HM --> HC[Click her]
  LK --> LK1["Ink-style portrait, cyber headset"]
  LK --> LK2["Moves: blink, hair sway, scan line, lips with voice"]
  LK --> LK3["Moods: standing by, ordering, thinking, cheering, alarm"]
  WR --> WR1["+ Create: beside the one input"]
  WR --> WR2["A project: the first of the crew chips"]
  WR --> WR3["Rooms: a small badge"]
  WR --> WR4["Home: narrates a build's story"]
  VC --> VC1["Short orders at each phase"]
  VC --> VC2["Pre-made voice lines"]
  VC --> VC3["Follows the one Sound control"]
  HC --> CR[Crew radio]
  CR --> CR1[Her reasoning]
  CR --> CR2[Agents at their stations]
  CR --> CR3[Crew chatter]
  CR1 --> CR4["Raw log (⌘K)"]
```

## 12. Flows by audience

The main path for each audience, start to finish. Every builder starts on Home and ends back on Home.

**Just make it**

```mermaid
flowchart LR
  a0[Home] --> a1["+ Create"] --> a2[Type the idea] --> a3["Watch the crew (a website: in the Design deck)"] --> a4[Result card] --> a5[Post to Feed]
```

**Design**

```mermaid
flowchart LR
  b0[Home] --> b1["+ Create"] --> b2["Idea, lens: Design"] --> b3[Design deck] --> b4[Pick a layer] --> b5["Design tab: style it"] --> b6["Fix the Critic's pins"] --> b7[Share or post]
```

**Develop**

```mermaid
flowchart LR
  c0[Home] --> c1["+ Create"] --> c2["Idea, lens: Develop"] --> c3[Engine room] --> c4[Checks] --> c5[Fix what fails] --> c6[Deploy]
```

**Game**

```mermaid
flowchart LR
  d0[Home] --> d1["+ Create"] --> d2["Idea, lens: Game"] --> d3[Game room] --> d4[Play] --> d5[Tweak the feel] --> d6[Post to Feed]
```

**Mix**

```mermaid
flowchart LR
  e0[Home] --> e1["+ Create"] --> e2["Idea, lenses: Design + Develop"] --> e3[Design deck] --> e4[Engine room] --> e5[Open the app]
```

**Launch**

```mermaid
flowchart LR
  f0[Home] --> f1["+ Create"] --> f2["Idea, lens: Launch"] --> f3[Site] --> f4[Promo video] --> f5[Posts] --> f6[Post to Feed]
```

**Collaborator**

```mermaid
flowchart LR
  h0[Discover] --> h1[Open boards] --> h2[A board] --> h3[Ask to join] --> h4[The host accepts] --> h5[Pin an idea] --> h6["Build it → + Create"] --> h7["Credited on the build"]
```

**Jam entrant**

```mermaid
flowchart LR
  i0[Discover] --> i1[Jams] --> i2["This week's jam"] --> i3["Join → + Create"] --> i4[Build] --> i5[Post as an entry] --> i6[Votes] --> i7[Winners on Home]
```

**Feed visitor**

```mermaid
flowchart LR
  g0[Home] --> g1[Swipe] --> g2[A build that grabs you] --> g3[Its assets and story] --> g4[Remix] --> g5["+ Create"]
```

## 13. How deep it goes

| Path | Layers |
|---|---|
| Swarm › + Create › The idea › Lens chip › Design › Its canvas › Design deck › Layers › A section › An element › Design tab › Appearance › Fill › Token › Where else it is used | 14 |
| Swarm › Projects › A card › Its canvas › Progress › Make › Pages › Designer › Decided › Why › Prompt and model › Raw log | 13 |
| Swarm › + Create › The idea › Lens chip › Game › Its canvas › Game room › Tweak › Feel › Gravity › Slider › Value in the code › Who set it and why | 12 |
| Swarm › Home › For you › A build › Its story › Chapters › Before and after › The prompt | 7 |
| Swarm › Home › For you › A build › Its assets › Sprites and art › One asset › Use it in + Create | 7 |
