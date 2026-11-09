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
(where Remix and + Create hand off to Hermes).

```mermaid
flowchart LR
  HX["Hermes: /swarm"] --> FEED["Swarm Feed"]
  WEB["swarm.design-bakery.com"] --> FEED
  FEED --> HOME[Home]
  FEED --> DISC[Discover]
  FEED --> PROJ[Projects]
  FEED --> ME[Me]
  FEED --> CR["+ Create"]
  CR --> ORB["Studio: the new build's orbit"]
  PROJ --> GAL["My builds: the galaxy"]
  GAL --> ORB2["Studio: that build's orbit"]
  ORB -.->|Share › Post to Feed| HOME
  HOME -.->|Remix| CR
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
  N3 --> ST["Studio: the new build's orbit"]
  N4 --> GA["My builds: the galaxy"]
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
  RX --> RX1["+ Create, starting from this build"]
  LV --> LV1["A crew building right now"]
  LV1 --> LV2["Its orbit, read only"]
```

## 4. Discover

```mermaid
flowchart LR
  DISC[Discover] --> SR[Search]
  DISC --> MK[Makers]
  DISC --> JM[Jams]
  DISC --> PK[Packs]
  MK --> PF[A profile]
  PF --> PF1["Showcase: a grid of their builds"]
  PF --> PF2["Their story, as clips"]
  PF --> PF3[Follow]
  PF --> PF4[Badges]
  JM --> JW["This week's jam"]
  JM --> JP["Past jams → winners"]
  JM --> JH[Host a jam]
  JW --> JW1[Theme]
  JW --> JW2[Entries]
  JW --> JW3[Vote]
  JW --> JW4["Join → + Create, lens set by the jam"]
  PK --> PK1[Sites]
  PK --> PK2[Apps]
  PK --> PK3[Games]
  PK3 --> PA[A pack]
  PA --> PA1[Preview]
  PA --> PA2["Use it → + Create"]
```

## 5. + Create

The one way to start a build. Hermia sits beside the input; the input becomes the chat inside the build.

```mermaid
flowchart LR
  CR["+ Create"] --> IDEA["Hermia and one input: the idea"]
  CR --> SRC["Start from (optional)"]
  SRC --> S1["A build: remix it"]
  SRC --> S2[A file]
  SRC --> S3[A pack]
  IDEA --> LENS["Lens chip, guessed from the idea"]
  LENS --> L0[Just make it]
  LENS --> L1[Design]
  LENS --> L2[Develop]
  LENS --> L3[Game]
  LENS --> L4[Launch]
  LENS -.->|Mix: add a second lens| L5[Design + Develop]
  L0 --> PR[Progress ring]
  PR --> RC[Result card]
  RC --> RC1[Open its orbit]
  RC --> RC2[Post to Feed]
  L1 --> O1["Orbit: Design deck"]
  L2 --> O2["Orbit: Engine room"]
  L3 --> O3["Orbit: Game room, Film studio"]
  L4 --> O4["Orbit: Design deck, Film studio, Launch pad"]
  L5 --> O5["Orbit: Design deck, Engine room"]
```

## 6. Projects

```mermaid
flowchart LR
  PROJ[Projects] --> MB["My builds: the galaxy"]
  PROJ --> CB[Collab boards]
  PROJ --> SW[Shared with me]
  MB --> ST[A star: one build]
  MB --> MS["Search, sort, folders"]
  ST --> ORB["Open → its orbit"]
  ST --> RM["Row menu: rename, move, delete"]
  CB --> BO[A board]
  BO --> BC["Cards: ideas, assets, tasks"]
  BO --> BM["Members → invite"]
  BC --> CA[A card]
  CA --> CA1[Comments]
  CA --> CA2["Build it → + Create"]
```

## 7. Me

```mermaid
flowchart LR
  ME[Me] --> PR[My profile]
  ME --> LA[Launch]
  ME --> NO[Notifications]
  ME --> SE[Settings]
  PR --> PR1["Showcase (pinned builds)"]
  PR --> PR2["My story, as clips"]
  PR --> PR3[Followers]
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

## 8. The orbit (one build)

```mermaid
flowchart LR
  OR["Orbit (one build)"] --> SUN["Sun: the build"]
  OR --> STN["Stations (only the lens's 1–3)"]
  OR --> HB["Hermia at the bridge"]
  OR --> IN["Input (now the chat)"]
  SUN --> PRG[Progress ring]
  SUN --> VER[Versions]
  SUN --> SHR[Share]
  STN --> DD[Design deck]
  STN --> ER[Engine room]
  STN --> GR[Game room]
  STN --> FS[Film studio]
  STN --> LP[Launch pad]
  HB --> RAD[Crew radio]
  HB --> ORD["Orders (voice)"]
  IN --> TGT["Target chip: → App, → Film"]
```

The way home is always there and is not a branch: the breadcrumb (`Home › Projects › build › room › …`), the
logo (back to Home) and Esc.

## 9. The sun: progress, versions, share

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

```mermaid
flowchart LR
  DD[Design deck] --> PG[Pages]
  DD --> RV[Review]
  DD --> PY[Play]
  DD --> DM["⋯ Export, Versions, Trace"]
  PG --> PA[A page]
  PA --> SC[A section]
  SC --> EL[An element]
  EL --> C1[Content]
  EL --> C2[Style]
  EL --> C3[Behaviour]
  EL --> CM[Comments pinned here]
  C2 --> ST1[Colour]
  C2 --> ST2[Type]
  C2 --> ST3[Spacing]
  ST1 --> TK[Token]
  TK --> TU[Where else it is used]
  C3 --> B1[On click]
  C3 --> B2[Animation]
  RV --> IS["Issues (3 at most)"]
  IS --> I1[An issue]
  I1 --> I2[Marker on the page]
  I1 --> I3[Why it matters]
  I1 --> I4[Fix it]
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
  WR --> WR2["Orbit: at the bridge"]
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
  a0[Home] --> a1["+ Create"] --> a2[Type the idea] --> a3[Watch the ring] --> a4[Result card] --> a5[Post to Feed]
```

**Design**

```mermaid
flowchart LR
  b0[Home] --> b1["+ Create"] --> b2["Idea, lens: Design"] --> b3[Design deck] --> b4[Pick an element] --> b5[Style it] --> b6[Review] --> b7[Export or post]
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

**Feed visitor**

```mermaid
flowchart LR
  g0[Home] --> g1[Swipe] --> g2[A build that grabs you] --> g3[Its assets and story] --> g4[Remix] --> g5["+ Create"]
```

## 13. How deep it goes

| Path | Layers |
|---|---|
| Swarm › + Create › The idea › Lens chip › Design › Orbit › Design deck › Pages › A page › A section › An element › Style › Colour › Token › Where else it is used | 14 |
| Swarm › Projects › My builds › A star › Its orbit › Sun › Progress › Make › Pages › Designer › Decided › Why › Prompt and model › Raw log | 13 |
| Swarm › + Create › The idea › Lens chip › Game › Orbit › Game room › Tweak › Feel › Gravity › Slider › Value in the code › Who set it and why | 12 |
| Swarm › Home › For you › A build › Its story › Chapters › Before and after › The prompt | 7 |
| Swarm › Home › For you › A build › Its assets › Sprites and art › One asset › Use it in + Create | 7 |
