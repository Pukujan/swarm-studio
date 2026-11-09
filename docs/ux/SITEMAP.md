# Site maps and flows

Every screen of the Studio and the Feed as one tree. Each layer shows 2–4 choices, and the tree goes as deep as
it needs to: the deepest paths are 13 layers (see [RULES.md](RULES.md) rule 2). A dotted line jumps to another
branch. Update this file when you add a layer or move a branch.

Status: **proposal for the owner to discuss** (2026-11-09). Lens names follow [AUDIENCE.md](AUDIENCE.md).

## 1. The whole product

Two homes: the Studio (private, where you make things) and the Feed (public, where builds are shown off,
told as stories, remixed and worked on together). Hermes opens either one.

```mermaid
flowchart LR
  H[Hermes] --> CMD["/swarm commands"]
  H --> ST[Studio]
  H --> FD["Feed (public site)"]
  CMD --> C1["/swarm: open the studio"]
  CMD --> C2["/swarm feed"]
  CMD --> C3["/swarm remix"]
  ST --> G["Galaxy: Hermia and one input"]
  G --> MK[Make something new]
  G --> OP[Open something I made]
  G --> SE[See what others made]
  G --> SS[Sound and settings]
  FD --> DI[Discover]
  FD --> CO[Community]
  FD --> ME[Me]
  SE -.-> DI
  DI -.->|Remix| MK
  CO -.->|Join a jam| MK
```

At rest the galaxy shows the stars, Hermia beside the one input, and four edge icons. Typing in the input is
**Make something new**; the stars and Search are **Open something I made**; the Feed icon is **See what
others made**; Sound and ⚙ are **Sound and settings**.

## 2. Make something new

```mermaid
flowchart LR
  MK[Make something new] --> JM[Just make it]
  MK --> SM[Steer it myself]
  MK --> PK[Start from a pack]
  MK --> JJ[Join a jam]
  JM --> PR["Progress ring (section 4)"]
  PR --> RC[Result card]
  RC --> RC1["Open → its orbit"]
  RC --> RC2[Share]
  RC --> RC3["Tweak → Steer it myself"]
  SM --> LD[Design]
  SM --> LV[Develop]
  SM --> LG[Game]
  SM --> LL[Launch]
  LD --> O1["Orbit: Design deck"]
  LV --> O2["Orbit: Engine room, Design deck to read"]
  LG --> O3["Orbit: Game room, Film studio"]
  LL --> O4["Orbit: Design deck, Film studio, Launch pad"]
  SM -.->|Mix: add a second lens| O5["Orbit: Design deck, Engine room"]
  PK --> P1[Sites]
  PK --> P2[Apps]
  PK --> P3[Games]
  P3 --> PA[A pack]
  PA --> PV[Preview]
  PA --> PU["Use it → Steer it myself"]
  JJ --> JT["This week's theme"]
  JT --> JL["Steer it, lens set by the jam"]
```

## 3. The orbit (one build)

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

The way home is always there and is not a branch: the breadcrumb (`Galaxy › build › room › …`), the logo and
Esc.

## 4. The sun: progress, versions, share

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
  P3 --> P4[Story draft]
  P4 --> P5[Publish to the Feed]
```

## 5. The rooms

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

## 6. Open something I made, sound and settings

```mermaid
flowchart LR
  OP[Open something I made] --> R[Recent]
  OP --> LN[Live now]
  OP --> AB[All builds]
  AB --> K1[Sites]
  AB --> K2[Apps]
  AB --> K3[Games]
  AB --> K4[Films]
  K3 --> B[A build]
  B --> BO["Open → its orbit"]
  B --> BM[Row menu]
  BM --> M1[Rename]
  BM --> M2[Move to a folder]
  BM --> M3[Delete]
```

```mermaid
flowchart LR
  SS[Sound and settings] --> SO[Sound]
  SS --> SE[Settings]
  SO --> S1[Mute]
  SO --> S2[Volume]
  SO --> S3[Voices]
  S3 --> V1["Hermia's orders"]
  S3 --> V2[Crew chatter]
  SE --> MO[Models]
  SE --> CN[Connections]
  SE --> KY[Keys]
  MO --> RL[A role]
  RL --> PM[Pick a model]
  PM --> CS[Cost and speed]
  CN --> CN1[Supabase]
  CN --> CN2[GitHub]
  CN --> CN3[Feed account]
```

## 7. The Feed: the social side

The public site at swarm.design-bakery.com: show off builds, tell how they were made, remix, run jams, plan
together on boards, and market what you made. Its top bar has three choices: Discover, Community, Me.

```mermaid
flowchart LR
  FD["Feed"] --> DI[Discover]
  FD --> CO[Community]
  FD --> ME[Me]
  DI --> FY[For you]
  DI --> FO[Following]
  DI --> LV["Live now: watch a crew build"]
  DI --> SR[Search]
  FY --> BP[A build page]
  BP --> BP1[Play or view it]
  BP --> BP2[Its story]
  BP --> BP3[Remix]
  BP --> BP4[Talk]
  BP2 --> CH[Chapters]
  BP2 --> NA["Hermia narrates (voice)"]
  CH --> CH1["Idea → plan → build → fixes → launch"]
  CH1 --> CH2["A chapter: before and after"]
  CH2 --> CH3[The prompt behind it]
  BP3 --> RX[Opens the studio with this build]
  BP4 --> TK1[Comments]
  BP4 --> TK2[Reactions]
  BP4 --> TK3["Credits: maker, crew, packs"]
  CO --> MKR[Makers]
  CO --> JM[Jams]
  CO --> CB[Collab boards]
  MKR --> PF[A profile]
  PF --> PF1["Showcase (pinned builds)"]
  PF --> PF2[Their story]
  PF --> PF3[Follow]
  PF --> PF4[Badges]
  JM --> JW["This week's jam"]
  JM --> JP["Past jams → winners"]
  JW --> JW1[Theme and rules]
  JW --> JW2[Entries]
  JW --> JW3[Vote]
  JW --> JW4["Join → the studio"]
  CB --> BO[A board]
  BO --> BO1["Cards: ideas, assets, tasks"]
  BO --> BO5[Members]
  BO1 --> BO2[A card]
  BO2 --> BO3[Comments]
  BO2 --> BO4["Build it → the studio"]
  ME --> MP[My builds]
  ME --> ML["Launch: posts, promo, stats"]
  ME --> MN[Notifications]
  ME --> MS[Settings]
  ML --> ML1["Stats: views, plays, remixes"]
  MS --> MS1["Studio token (MCP)"]
```

## 8. Hermia, the commander

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
  WR --> WR1["Galaxy: beside the one input"]
  WR --> WR2["Orbit: at the bridge"]
  WR --> WR3["Rooms: a small badge"]
  WR --> WR4["Feed: narrates build stories"]
  VC --> VC1["Short orders at each phase"]
  VC --> VC2["Pre-made voice lines"]
  VC --> VC3["Follows the one Sound control"]
  HC --> CR[Crew radio]
  CR --> CR1[Her reasoning]
  CR --> CR2[Agents at their stations]
  CR --> CR3[Crew chatter]
  CR1 --> CR4["Raw log (⌘K)"]
```

## 9. Flows by audience

The main path for each audience, start to finish.

**Just make it**

```mermaid
flowchart LR
  a1[Type the idea] --> a2[Build] --> a3[Watch the ring] --> a4[Result card] --> a5[Share]
```

**Design**

```mermaid
flowchart LR
  b1[Type the idea] --> b2["Lens: Design"] --> b3[Design deck] --> b4[Pick an element] --> b5[Style it] --> b6[Review] --> b7[Export]
```

**Develop**

```mermaid
flowchart LR
  c1[Type the idea] --> c2["Lens: Develop"] --> c3[Engine room] --> c4[Checks] --> c5[Fix what fails] --> c6[Deploy]
```

**Game**

```mermaid
flowchart LR
  d1[Type the idea] --> d2["Lens: Game"] --> d3[Game room] --> d4[Play] --> d5[Tweak the feel] --> d6[Publish to Arcade]
```

**Mix**

```mermaid
flowchart LR
  e1[Type the idea] --> e2["Lenses: Design + Develop"] --> e3[Design deck] --> e4[Engine room] --> e5[Open the app]
```

**Launch**

```mermaid
flowchart LR
  f1[Type the idea] --> f2["Lens: Launch"] --> f3[Site] --> f4[Promo video] --> f5[Posts] --> f6[Post to Feed]
```

**Feed visitor**

```mermaid
flowchart LR
  g1[For you] --> g2[A build page] --> g3[Its story] --> g4[Remix] --> g5[The studio]
```

## 10. How deep it goes

| Path | Layers |
|---|---|
| Galaxy › Make › Steer › Design › Orbit › Design deck › Pages › A page › A section › An element › Style › Colour › Token › Where else it is used | 13 |
| Galaxy › Make › Steer › Design › Orbit › Sun › Progress › Make › Pages › Designer › Decided › Why › Prompt and model › Raw log | 13 |
| Galaxy › Make › Steer › Game › Orbit › Game room › Tweak › Feel › Gravity › Slider › Value in the code › Who set it and why | 11 |
| Galaxy › Make › Steer › Launch › Orbit › Sun › Share › Publish › Website › Address › Custom domain › DNS steps | 11 |
| Feed › Discover › For you › A build page › Its story › Chapters › Idea to launch › A chapter › The prompt behind it | 8 |
