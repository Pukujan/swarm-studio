# Swarm Studio web UI: control and entry-point inventory

**Repo:** `/Users/teresa/dev/projects/hermes hackathon/swarm-studio/web/`. Every path below is relative to that folder.

**What was read:**
- `index.html`, `canvas.js` (complete apart from the gaps under "Limits"), `galaxy.js`, `orbit.js`, `show.js`, `chatter.js`, `crew.js`, `wall.html`, `frame.html`
- The hide rules in `galaxy.css` and `canvas.css`

**Limits:**
- The game wizard questions come from `/api/game` and the Pro packs from `/api/packs`. Both are served by the server, which I did not read.
- In `canvas.js` I only skimmed lines 400-834, 1563-1660, 2158-2286 and 2824-2906. They hold:
  - agent-ghost animations
  - frame setup
  - the play-mode guard
  - the edit-history code
  - the review scan
- Those ranges contain no user controls beyond the frame label "Page N · title" (canvas.js:496). They do add feed lines:
  - "Someone else edited the design: …" (canvas.js:2248)
  - "You edited the design: …" (canvas.js:2280)

**How the app starts:** it opens in **galaxy** mode, unless:
- Classic view is remembered in localStorage `swarm.classic`, or
- the URL has `?run=` or `?replay=` (both start in orbit), or
- the URL has `?wall=1` (galaxy.js:651, 660).

**Two CSS rule sets change what shows:**
- In cosmos mode (galaxy, orbit, station), galaxy.css hides much of the classic top bar and side panel. See "Cosmos chrome".
- In wall mode, `canvas.css:1340, 1573` and `galaxy.css:234` hide the chrome.

---

## 1. Top bar (index.html:15-51)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Brand | static | "Swarm Studio"; title "Swarm Studio, run by Commander Hermia" | nothing | classic and galaxy; hidden in orbit and station | index.html:16; galaxy.css:19 |
| #file-name | text | "Untitled" or the build title | shows the title (`setTitle`) | always, except galaxy | index.html:17; canvas.js:133-137; galaxy.css:20 |
| #views (star map) | 3-tab segmented control | Canvas / Video / App; title "Switch views; builds keep running in the others" | `setView('canvas'/'video'/'app')` | classic only (hidden in cosmos) | index.html:18-22; canvas.js:3941; galaxy.css:13 |
| .vbadge on Video and App | badge dot | none | status of that view (see Indicators) | classic | index.html:20-21; canvas.js:3961-3965 |
| #auto-btn | toggle button | "Auto"; title "Auto mode: one prompt, and the swarm designs the site, reviews it, cuts the video, builds the app with mini games and a credit shop, and deploys it" | opens the Auto box (`openAuto`) | always (classic and cosmos) | index.html:23; canvas.js:4646 |
| #game-btn | toggle button | "Game"; title "Make an original browser game: a few questions, then the swarm builds it" | `openGame()` (game wizard) | classic only (hidden in cosmos) | index.html:24; canvas.js:4251; galaxy.css:13 |
| #crew-mute | 3-state cycle button | "Crew" / "Muted" / "Quiet" (default "Muted"); title "Crew sounds and bubbles (M)", then a per-state title from CREW_TITLE | `cycleCrew`: sound and speech bubbles on, off, or quiet | always except wall | index.html:26; canvas.js:5201, 5204-5228 |
| #undo-btn | icon button | title "Undo (⌘Z / Ctrl+Z)", which becomes "Undo {label}…" or "Nothing to undo…" | `undo()` | classic only; disabled when there is no history | index.html:27; canvas.js:2345-2353; galaxy.css:13 |
| #redo-btn | icon button | title "Redo (⇧⌘Z / Ctrl+Y)", with dynamic titles like undo | `redo()` | classic only; disabled when there is no history | index.html:27; canvas.js:2354 |
| #play-btn | button | "Play"; title "Play the prototype (P)" | `openPlayer` | hidden in galaxy; disabled until frames exist | index.html:28; canvas.js:1306, 1949; galaxy.css:20 |
| #publish-btn | menu button | "Publish" or "Publishing…"; title "Put this build online: the website, or the working app" | opens #pub-menu | hidden in galaxy; disabled if the build is not done, or while publishing or deploying | index.html:30; canvas.js:1312-1313, 4471-4485 |
| #more-btn | menu button | "More" with #agent-count; in cosmos only an icon (☰); title "Review, video, export, models and panels" | opens #more-menu | always | index.html:38; canvas.js:3392; galaxy.css:14 |
| .clock #timer | text | "00.0s" | shows elapsed build time | classic only | index.html:50; canvas.js:1325; galaxy.css:13 |
| .cosmos-back | button (added by galaxy.js) | "Galaxy" (in orbit; title "Back to the galaxy: all your builds") or "Orbit" (in a station; title "Back to this build's orbit") | `C.go('galaxy')` or `C.go('orbit')` | orbit and station only | galaxy.js:575-581, 600-605; galaxy.css:16-18 |

## 2. Publish menu #pub-menu (index.html:31-35)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Heading | text | "Put it online" | nothing | menu open | index.html:32 |
| Website option (data-pub=site) | menu item | "Website", with small text "The designed pages, no server. GitHub Pages, Vercel, Cloudflare or this computer." | `publishMenu()` opens the Publish website pop | menu open | index.html:33; canvas.js:4488 |
| Working app option (data-pub=app) | menu item | "Working app", with small text "The site with its server: orders save, /admin works. Live on Vercel." | `setView('app')`, then `deployApp()` | menu open; disabled unless the app exists and is not building | index.html:34; canvas.js:4482, 4489-4491 |
| .pub-why | helper text | "checking…" / "The app is still building." / "Build the app first (App tab)." / "Live at X; this sends the latest." | explains why the option is or is not available | on the app option | canvas.js:4479-4483 |

The menu closes on a mousedown outside it (canvas.js:4493).

## 3. More menu (☰) #more-menu (index.html:39-48, galaxy.js:609-614)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| #review-btn | menu item | "Review" or "Reviewing…"; title "Have the reviewer model look at every page and fix what it finds" | `reviewRun` | always; disabled unless a reviewer model is set and the build is done | index.html:40; canvas.js:1307-1308, 2976 |
| #video-btn | menu item | "Video" / "Video N%" / "Video writing…"; title "Cut a promo video of this build, with a voiceover and music" | toggles the video panel, or starts `makeVideo` | always | index.html:41; canvas.js:1315-1316, 3144 |
| #export-btn | menu item | "Export"; title "Export: static HTML, a React + Tailwind project, and a handoff for an app builder (ABA)" | `exportRunNow` | always; disabled until the build is done | index.html:42; canvas.js:2538 |
| #models-btn | menu item | "Models"; title "Pick the models for planning, building, reviewing and images" | `toggleModels` (Models pop) | always | index.html:43; canvas.js:3352 |
| Design | menu item | "Design"; title "Design properties and variables (D)" | `togglePanel('design')` | always | index.html:44; canvas.js:3378 |
| Planner | menu item | "Planner"; title "Planner: theme and plan stream" | toggles the Planner float | always | index.html:45; canvas.js:3366-3374 |
| Agents | menu item | "Agents"; title "Agents and what each is doing" | toggles the Agents float | always | index.html:46 |
| #breakroom-btn | menu item (toggle) | "Break room"; title "Show or hide the break room, where idle agents wait" | `setBreakroom` | always | index.html:47; canvas.js:4346-4349 |
| separator | divider | none | nothing | cosmos only | galaxy.js:609; galaxy.css:24-26 |
| #cosmos-game | menu item | "Game"; title "Make an original browser game" | clicks #game-btn (game wizard) | cosmos only | galaxy.js:610, 612; galaxy.css:24-25 |
| #cosmos-classic | menu item (toggle) | "Classic view"; title "The studio's classic layout: chat column, canvas and the Canvas / Video / App map. Remembered in this browser." | `setClassic` | cosmos only (see Navigation for how to leave classic) | galaxy.js:611, 613 |

The menu closes after any item click and on a mousedown outside it (canvas.js:3393-3394).

## 4. Side panel chrome (index.html:53-89)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Chat tab | tab | "Chat" | `showTab('chat')` | side panel shown | index.html:55; canvas.js:3358-3363 |
| Log tab | tab | "Log"; title "What each agent is doing" | `showTab('log')` | side panel shown; hidden when the panel is minimised | index.html:56; canvas.css:551 |
| Layers tab (data-tab=pages) | tab | "Layers"; title "Pages, their sections and what is in each: click to select, the eye to hide" | `showTab('pages')` | as for Log | index.html:57 |
| Files tab | tab | "Files" | `showTab('files')` and `loadFiles` | as for Log | index.html:58 |
| #side-min | icon toggle | title "Make the side panel a small chat over the canvas"; when on, glyph ⇥ and title "Back to the full side panel" | `sideMin`: shrinks the side panel to a floating chat | classic only (hidden in cosmos) | index.html:59; canvas.js:3397-3405; galaxy.css:49 |
| .cosmos-fold | icon button | "×"; title "Fold the chat back into the comm-link" | `C.chat(false)` | cosmos, when the chat column is open | galaxy.js:624-634, 655 |
| Resizer grip (side panel and Design panel) | drag handle | title "Drag to resize · double-click to reset" | resizes the panel; double-click resets it | side panel or Design panel shown; hidden when minimised | canvas.js:4317-4343; canvas.css:740 |

The side panel is hidden in cosmos mode. It shows only when the chat column is open in an orbit or station (`cosmos-chat`), never in the galaxy (galaxy.css:31-37).

## 5. Chat tab: prompt box, slash commands, chat messages (index.html:62-75)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| #feed (empty state) | helper text | "Describe a product below. A planner picks the pages, then a swarm of agents builds them on the canvas." | nothing | Chat tab, before any message | canvas.js:122 |
| #brief | textarea | placeholder "Describe a product. The swarm designs and builds its site."; in Video view "An idea for the video: “faster, end on the crowd”, “for Instagram”…"; in App view "Change the app: “add a FAQ page with search”, “let people pick a seat”…" | composer: Enter submits, Shift+Enter adds a new line, "/" opens the slash popover | Chat tab | index.html:65; canvas.js:1537-1545, 3923, 3938 |
| #agents | select | "4 / 5 / 6 / 8 / 12 / 16 / 20 / 24 agents" (default 16); title "How many agents build at once" | sets the number of agents for the next build | Chat tab | index.html:67-69 |
| #build-model | select | "Hermes default" or a short model name, recent picks, then "Other… (N models)"; title "The model every builder agent uses. Planner and reviewer: More, then Models", or "builders use X" | sets the builder model; "Other…" opens the Models pop | Chat tab | index.html:70; canvas.js:3408-3424 |
| Submit button | button | "Build" | slash text goes to `runSlash`; in App view `appAsk(text)`; in Video view `makeVideo({idea})`; otherwise POST `/api/run` (brief + agents), which starts a site build | Chat tab | index.html:71; canvas.js:1518-1536 |
| .slash-pop | popover list | the commands and their descriptions | arrow keys, Tab, Enter and Esc work; a click picks a command | while the composer starts with "/" | canvas.js:1489-1516, 1537-1543 |
| .built-for | static text | "Built for Hermes Agent" | nothing | Chat tab | index.html:74 |
| Progress message | chat message | "Planning the pages…", then "N agents building · d/n sections across N pages", with a bar | nothing | during a build | canvas.js:1317-1324 |
| Hermia bot message | chat message | name "Hermia", small label "planner" | nothing | as messages arrive | canvas.js:1188-1195 |
| Agent reply | chat message | agent name and text | nothing | after a comment or fix | canvas.js:1172-1178 |
| Run summary message | chat message | "Built N pages and N sections in Xs with N agents… Open a page, or play the prototype." | nothing | after a build | canvas.js:1197-1220 |
| ↳ chip | chip button | "▶ Play prototype" | `openPlayer` | in the run summary | canvas.js:1197-1220 |
| ↳ chip | chip button | "👀 Watch a visitor" | opens the player and its tour menu | in the run summary | canvas.js:1197-1220 |
| ↳ chips | chip buttons | "Page N · title" | `focusPage` | in the run summary | canvas.js:1197-1220 |

**Slash commands** (SLASH, canvas.js:1402-1423; handlers in runSlash, canvas.js:1429-1486):

| Command | What it does | File:line |
|---|---|---|
| `/help`, `/?` | lists the commands | 1402-1486 |
| `/play` | opens the player | same |
| `/review` | runs a review | same |
| `/fix <what>` | sends a fix instruction | 1437 |
| `/video [style] [idea]` | makes a video | same |
| `/app [change]` | builds or changes the app | 1444 |
| `/game [idea]` | opens the game wizard | 1445 |
| `/canvas` | switches to the Canvas view | same |
| `/export` | exports | same |
| `/publish [github\|vercel\|cloudflare\|local]` | publishes directly, without the menu | same |
| `/motion [on\|off]` | turns play-mode motion on or off | same |
| `/files [words]`, `/search` | searches files | same |
| `/open <n\|words>` | opens a build | same |
| `/info` | shows build details | same |
| `/undo`, `/redo` | undo and redo | same |
| `/trace [section\|on\|off]` | traces | same |
| `/folder <name\|none>` | puts the build in a folder | same |
| `/models` | opens the Models pop | same |
| `/new` | new file | same |

## 6. Log tab (index.html:78)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| #log lines | read-only list | agent and system lines, including "🛰️ Hermia…" lines | nothing | Log tab | canvas.js:282-283, 1150-1169 |

## 7. Layers tab (renderTree, canvas.js:1033-1092)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Empty state | helper text | "Pages appear here once the planner names them." | nothing | no pages yet | canvas.js:1033-1092 |
| Group title | clickable row | "All · Shared nav and footer" or "Page N · title" | `focusPage` | pages exist | same |
| Group caret | toggle | ▶ | collapses or expands the group | pages exist | same |
| Layer row | clickable row | dot, role, and "who" (agent name; time once done) | `selectLayer` (selects the section) | pages exist | same |
| Layer twisty .tw | toggle | ▶ / ▼ | expands the row's children | done layers only | same |
| Eye button | icon toggle | 👁 / ◌; title "Hide on the canvas" or "Show on the canvas" | `hideLayer` | every layer row | same |
| Child rows | clickable rows | H1, Text, Image, … | select the parent layer | when expanded | same |

## 8. Files tab

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| #new-file | button | "New file" | sets viewing to "new", empties the canvas, switches to the Chat tab and focuses #brief (does not start a build) | Files tab | index.html:86; canvas.js:3908-3914 |
| Search | text input | placeholder "Search names, briefs, themes, tags…  (tag:, has:video, on:vercel)" | filters the list | Files tab | canvas.js:3463-3474 |
| .fsort | select | title "Sort"; Newest / Last changed / Oldest / Name / Most pages / My order | sorts the list | Files tab | same |
| .fgroup | select | title "Group"; By day / By folder / By folder, then day / No groups | groups the list | Files tab | same |
| .fnewf | icon button | "＋📁"; title "New folder" | inline name field (placeholder "Folder name", button "OK") | Files tab | canvas.js:3572-3588 |
| Empty states | helper text | "No files yet. Describe a product in Chat to make one." / "Nothing matches." | nothing | no files, or no matches | canvas.js:3475, 3497 |
| Group header | details/summary | day or folder name with a count; "⚠ Unfinished", "Not in a folder", small "changed …", empty "Empty. Drag builds here." | collapses or expands; folders accept dropped builds and can be reordered by drag | Files tab | canvas.js:3498-3519, 3591-3619 |
| Folder ⋯ | icon button | title "Rename or delete this folder" | menu: "Rename…" and "Delete folder (keeps its builds)" | folder groups | canvas.js:3654-3675 |
| File row | clickable, draggable row | title, with the brief as its title; meta "● building", date, "edited …", pages, layers, seconds; badges 🎬, 🌐 N, 📁 folder, #tags; theme swatch (has a title) | click `openRun`; drag to reorder or to move into a folder; right-click opens the file menu | Files tab | canvas.js:3529-3561 |
| .fmore ⋯ | icon button | "⋯"; title "Folder, show in Finder" | opens the file menu | every row | same |

**File menu** (fileMenu, canvas.js:3819-3861):

| Item | What it does |
|---|---|
| Header "Move to folder", then "📁 {folder}" (✓ on the current one) | moves the build to that folder |
| "＋ New folder…" | inline form: placeholder "Folder name", button "Add" |
| "Take out of folder" | removes the build from its folder |
| "Details, tags and note…" | opens fileInfo |
| "🔍 Traces: every model call…" | opens the Trace dialog |
| "● Record traces: on" / "○ Record traces: off" | toggles trace recording |
| "Show in Finder" | reveals the build folder |
| "Show the video in Finder" | reveals the video; only if a video exists |

**fileInfo dialog** (canvas.js:3772-3817):
- × with title "Close". Esc or a backdrop click also closes it.
- Editable fields:
  - Name (placeholder is the auto title)
  - Tags (placeholder "client, food, draft")
  - Folder (placeholder "none")
  - Note textarea (placeholder "Anything to remember about this build")
- Read-only rows: Brief, Made, Last change, Built, Pages, Theme, Models, Work since, Live at, Video, ID.
- Buttons: "Show in Finder" and "Save".

**Trace dialog** (traceView, canvas.js:3682-3748):
- Title "🔍 Traces" and a × button.
- Filter input, placeholder "Filter: a section, page, agent, or build / fix / review".
- Checkbox "Record traces".
- One row per model call; clicking the row head expands it.
- Button "Copy this call".
- Empty texts at canvas.js:3720.

## 9. Canvas viewport (index.html:91-109)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Break room dock | panel | "break room"; idle agent avatars and banter | nothing (display only) | canvas view, unless the break room is off | index.html:94; canvas.js:844-890; canvas.css:761 |
| #dock-hide | icon button | ×; title "Hide the break room (bring it back in More)" | `setBreakroom(false)` | with the dock | index.html:94; canvas.js:4350 |
| Toolbar: Move | tool button | title "Move (V): drag to pan, click a section to select it" | arms the Move tool | canvas view | canvas.js:93-101, 1133-1146, 2651-2655, 2759-2778 |
| Toolbar: Text | tool button | title "Text (T): click a section and edit its words yourself" | arms Text; feed says "✏️ Click a section to edit its words." | canvas view | same |
| Toolbar: Comment | tool button | title "Comment (C): click a section and tell an agent what to change" | arms Comment; feed says "💬 Click a section to comment on it." | canvas view | same |
| Toolbar: Frame, Shape, Image, Connect | indicator-style tool buttons | title "{label}: lights up while an agent uses it. To change something, use 💬 Comment or ✏️ Text." | none for the user; they light up with an agent count | canvas view | same |
| #status | status strip | "Ready" / "Planning the pages" / "N pages built" / "N agents building" / "Stopped", with a dot and a bar | nothing | canvas view | index.html:97; canvas.js:1122-1131 |
| #camera-hint | clickable text | "camera: auto (follows agents)" or "camera: manual · double-click for auto" | toggles the auto camera | canvas view | index.html:98; canvas.js:975-980, 1368 |
| Canvas surface | mouse | none | drag pans; a click on a link jumps to its target page; a click elsewhere selects a section; double-click turns on the auto camera; wheel pans; Ctrl/Cmd+wheel zooms | canvas view | canvas.js:1333-1384 |
| Selection comment pin | icon button | "💬"; title "Comment: tell an agent what to change here" | opens the comment composer | a section is selected | canvas.js:2707-2741 |
| Comment composer | textarea and button | placeholder "Tell an agent what to change in {role}…"; hint "Enter to send · Esc to close"; button "Send" | `sendComment`, which sends a fix to an agent | after the pin is clicked, or a click with the Comment tool | canvas.js:2722-2743 |
| Text edit dialog | dialog | "✏️ Edit text"; one field per text node; "Tip: ⌘Z undoes it after saving."; "Save"; × titled "Close" | saves the text edits | click with the Text tool | canvas.js:2659-2705 |
| Planner float | panel | "Planner" with an #plan-state pill ("idle" by default), theme name and direction, swatches (title "{k} {v}"), plan stream | nothing (display only) | off by default; toggled from More → Planner | index.html:100-104; canvas.js:984-996, 3366-3370 |
| Agents float | panel and clickable rows | "Agents"; each row shows "{page} · role", "idle" or "waiting" | clicking a row follows or pins that agent in the Design panel | off by default; toggled from More → Agents | index.html:105-108; canvas.js:1099-1119 |

## 10. Design panel (index.html:132-140)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Design tab | tab | "Design" | shows section properties | panel open | index.html:134; canvas.js:3425 |
| Variables tab | tab | "Variables" | shows design tokens | panel open | index.html:135 |
| #design-close | icon button | ×; title "Close (opens again when you select a section)" | closes the panel | panel open | index.html:136; canvas.js:3388 |
| Auto open/close | behaviour | none | the panel opens on selection and closes when the selection clears | canvas view | canvas.js:3382-3387 |
| Empty state | helper text | "Click a section on the canvas to edit it, or an agent in the Agents panel to follow its work." / "Start a build. While the swarm works, this shows the properties…" | nothing | nothing selected | canvas.js:2067-2108 |
| Header .pin | clickable pill | "selected ✕" / "pinned" / "following" | clears the selection or toggles the pin | something selected or followed | same |
| Hint | helper text | "Click a value to change this section. Variables change every page." or "Editable when {agent} finishes…" | nothing | something selected | same |
| 🔍 Trace | button | title "Every model call for this section: the prompt and what came back" | opens the Trace dialog filtered to this section | something selected | same |
| 🕘 Versions | button | title "Every version this section has had; put any one back" | menu "Versions of X", with "✓ now" on the current one; picking one restores it | something selected | canvas.js:2365-2395 |
| Editable values (dir, gap, align, pad, bg, hsize, radius) | clickable values | title "Change {prop}" | picker with options (SECTION_OPTIONS) | something selected and done | canvas.js:2399-2437 |
| Read-only rows | text | Frame W/H, Typography, Effects, Layers | nothing | something selected | canvas.js:2067-2108 |
| Pictures heading | text | "Pictures", small "edit the words to change it" | nothing | section selected | canvas.js:4498-4525 |
| Picture prompt | textarea | title "Describe the picture you want" | edits the picture prompt | per picture | same |
| Picture button | button | "🎨 Make it" / "🎨 New picture" / "🎨 Painting…" | POST `/image` (repaints the picture) | per picture | canvas.js:4512-4518 |
| No-photo note | text | "No photo in this section." | nothing | section without images | canvas.js:4498-4525 |
| Add picture | input and button | placeholder "Add a picture of… (optional)"; button "➕ Add", title "The section's builder adds one photo; it is painted when the rewrite is done" | sends a comment to the section's builder | section selected | canvas.js:4522 |
| Variables empty states | helper text | "The design system appears here when a build starts." / "Setting up the design system" + "The planner picks colour tokens, type and radius first…" | nothing | before or at the start of a build | canvas.js:2110-2140 |
| Colour rows | clickable rows | title "Change {name} on every page"; usage count "N×" | native colour input | Variables tab | canvas.js:2110-2140, 2451-2477 |
| Font rows | clickable rows | title "Change the {role} font" | FONTS picker | Variables tab | same |
| Scale: Type − / + | buttons | titles "Every heading one step smaller" / "…bigger" | rescales the type | Variables tab | same |
| Scale: Spacing − / + | buttons | titles "Tighter spacing everywhere" / "Looser spacing everywhere" | rescales spacing | Variables tab | same |
| Type scale rows | clickable rows | "click to remap"; title "Change every text-{k}" | remaps the type scale | Variables tab | same |
| Radius | clickable row | title "Change the radius everywhere" | picker | Variables tab | same |

## 11. Player / Play mode (index.html:142-165; canvas.js:1663-1957)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| #pl-close | icon button | title "Close (Esc)" | closes the player | player open | index.html:142-165 |
| #pl-page | select | title "Page"; "Page N · title" | jumps to that page | player open | same |
| #pl-back | button | "Back" | previous page | player open | same |
| #pl-restart | button | "Restart"; title "Back to page 1" | goes back to page 1 | player open | same |
| #pl-tours | button | "Watch a visitor"; title "Watch someone use the site (V)" | opens the tour menu | player open | same |
| #pl-motion | toggle | "Motion"; title "Motion: sections reveal as they scroll in (M)" | toggles motion | player open | same; canvas.js:1669 |
| #pl-device | segmented control | Desktop / Mobile | sets the frame width | player open | same |
| Tour menu | menu | notes "Writing a few visitors for this site", "Couldn't write visitors: …" with "Try again", "Open again in a moment", "Visitors come once the build is done"; persona buttons (emoji, name, goal); "↻ Write new visitors" | plays a persona tour, or regenerates the personas | tour menu open | canvas.js:1769-1793 |
| Persona bar | bar | progress dots, "Stop", "Next: {emoji} {name} →" | stops the tour or plays the next one | during a tour | canvas.js:1870-1879, 1933 |
| .pl-hint | helper text | "Click links to move between pages · clicking anywhere else shows where the links are" | nothing | player open | index.html:164 |

## 12. App view / Engine room (index.html:111-130; canvas.js:3968-4155)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| #app-state | status pill | "no app yet" / "building" / "running" / "built" / "failed" / "stopped" | nothing | App view | index.html:113; canvas.js:4025 |
| #app-stage | text | "N turns · N files · checks passed · live at …" | nothing | App view | canvas.js:4026 |
| #app-link | button | "🎮 {title}" or "↔ the site"; title "Open the linked build" | `openRun` on the linked site or game | only when the build has a link | index.html:115; canvas.js:4012-4017 |
| #app-mode | segmented control | Preview / Code | switches between the preview and the code tree | App view | index.html:117; canvas.js:4078-4083 |
| #app-device | segmented control | Phone / Tablet / Desktop (390 / 820 / full) | sets the preview width | App view | index.html:118; canvas.js:4084-4088 |
| #app-reload | icon button | title "Reload the app" | reloads the iframe | App view | index.html:119; canvas.js:4089 |
| #app-open | icon link | title "Open the app in its own tab" | opens the app in a new tab | App view | index.html:120 |
| #app-stop | button | "Stop" | POST `/stop` | only while building | index.html:121; canvas.js:4030, 4090 |
| Steps column | list | placeholder "Steps show here while the app builds: every file the engine writes, each check, each fix."; "↺ N earlier rounds" | expands earlier rounds | App view | canvas.js:3997-4009 |
| Empty: no build | text | "No build open" / "Make a site on the canvas, open one from Files, or start a 🎮 Game." | nothing | no run open | canvas.js:4036-4049 |
| Empty: working | text | "Starting the app…" / "Building the game…" / "Building the app…"; "First time: the app engine installs itself once (about a minute, ~1.5 GB)…"; "…You can go back to the Canvas or Video meanwhile." | nothing | while building | same |
| Failed card | card and buttons | "The app didn't finish", "Show details", "Try again" | "Try again" calls `appAsk('')` | app failed | same |
| Game empty state | card and button | "A game starts with a few questions", "🎮 Start a game" | `openGame` | game run without an app | canvas.js:4048 |
| Default empty state | card and button | "Turn this design into a working app", "React + TypeScript + shadcn/ui, with the design kept exactly…", "Build the app" | `appAsk('')` starts the app build | site run with no app | canvas.js:4043-4047 |
| Code tree | clickable rows | file names; "no files yet" | `showFile` | Code mode | canvas.js:4057-4076 |

**Code wall** (canvas.js:5307-5414):
- **Heading:** "Writing the app" or "Writing the game".
- **Counter:** "N files · N typing · stage", or "planning turn N (age)".
- **"Preview" button:** title "Hide the code and look at the app". It hides the wall until the run changes (canvas.js:5322).
- **Hermia radio strip:** order / roger / thinking / reasoning lines.
- **Plan card:** "{name} is planning the next files", "turn N", "N tokens of context", "… since the last file", "Last written".
- **Typing tiles:** 4 tiles with crew cursors (canvas.js:4366-4466).
- **Side effect:** opening the wall minimises the Auto panel (canvas.js:5327).

**Deploy shot** (canvas.js:4857-4980):
- **Build stage:**
  - "Going live", "Vercel is building it"
  - × titled "Close"
  - terminal "vercel · build"
  - stages Upload / Build / Ready
- **Live stage:**
  - "It's live", "the crew is trying it"
  - the URL
  - "Copy" (title "Copy the link")
  - open icon (title "Open it in a new tab")
  - laptop and phone iframes with scripted cursors

## 13. Video / Film studio panel .video-pop (renderVideo, canvas.js:3015-3077)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Header and close | text and icon button | "The promo video"; × titled "Close" | closes the panel (× hidden when in the Video view) | panel open | canvas.js:3015-3077; canvas.css:645 |
| Storyboard | cards | scene cards | nothing | once written | same |
| Style | select | AI director (a new look every time) / Promo / Kinetic type / Slideshow / Teaser / Customer story | sets the video style (remembered) | idle or done | canvas.js:3094 |
| Cut | select | Fits the look / Colour wipe / Fade / Zoom / Slide / Flash / Iris / Blinds / Split / Push / Glitch / Whip pan | sets the transition | idle or done | canvas.js:3095 |
| Idea | text input | placeholder "Your idea for the video (optional): “end on the night market crowd”, “for Instagram, upbeat”" | idea for the cut | idle or done | canvas.js:3015-3077 |
| Voice | select | Kokoro · fits the theme / Heart / Bella / Michael / Emma (UK) / George (UK) / No voice | voiceover choice | idle or done | canvas.js:3091 |
| Music | checkbox | "Music" | music on or off | idle or done | canvas.js:3015-3077 |
| Idle text and start button | text and button | "A short promo of this build: the planner writes the storyboard and a voiceover…"; "Make the video" | `makeVideo` | no video yet | canvas.js:3054-3063 |
| Busy | live iframe, bar, text | "● live: the agents' cut, rendering"; stage text: Writing the storyboard… / Rendering frames in headless Chrome… / Encoding the MP4… / Kokoro is reading the voiceover… / Mixing the music and the voice… | nothing | rendering | canvas.js:3031 |
| Cut list | buttons | "vN style · idea · Ns" | switches the cut shown | done | canvas.js:3015-3077 |
| Player | video | the video | plays the video | done | same |
| Done actions | text and buttons | "Saved to …", "Download", "Show in Finder", "⛶ Big screen" (title "Fill the whole pane (Esc to leave)"), "Make a new cut" | download, reveal, fullscreen overlay, or a new `makeVideo` | done | same |
| Failed | text and button | message, "Try again" | retries `makeVideo` | failed | same |
| Big-screen overlay | overlay | × titled "Back to the canvas (Esc)" | closes the overlay | big screen | canvas.js:3098-3113 |

**How the panel opens:**
- `setView('video')` (canvas.js:3935)
- More → Video
- `/video`
- composer submit in the Video view
- automatically on a fresh video event (canvas.js:3011)

## 14. Export pop (canvas.js:2522-2536)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Header | text and × | "Exported, ready" | × closes | after export | canvas.js:2522-2536 |
| Rows | text | html/, react/, aba/, and the export path | nothing | after export | same |
| Download | button | "Download .zip" | downloads the export zip | after export | same |

## 15. Publish website pop / Connections (canvas.js:2541-2643)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Header | text | "Publish the website", small "the designed pages, no server" | nothing | pop open | canvas.js:2541-2643 |
| Checking note | text | "Checking where you are signed in…" | nothing | while loading | same |
| Host rows | buttons | GitHub Pages / Vercel / Cloudflare Pages, each with "how" text from HOSTS; GitHub signed out: "Sign in with gh auth login to get a public link" | publishes to that host | pop open | canvas.js:2559-2563, 2582 |
| Disconnect | icon button | ×; title "Disconnect {X}" | forgets the saved token | host connected | same |
| Connect {X} | details/summary, password input, button | token help text; placeholder "{label} token, or an Octo vault grant"; "Connect" / "Checking…"; hint "An Octo vault grant (octo_vault_…) keeps the token in your vault…" | saves and verifies the token | host not connected | same |
| This computer | button | "This computer": "Hosted by Swarm Studio at 127.0.0.1 · instant, only you can open it" | local publish | pop open | canvas.js:2605 |
| Progress | step list | PUB_STAGES marked ✓ / ◌ / · | nothing | while publishing | canvas.js:2543-2547 |
| Done | link and buttons | the link, "Copy link", "Open ↗" | copy or open | done | canvas.js:2541-2643 |

## 16. Models pop (canvas.js:3235-3354)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Header | text | "Pick the models", small "picks stay in Swarm Studio; Hermes's config is untouched" | nothing | pop open | canvas.js:3235-3354 |
| Planner row | combo input | "Planner": "plans the pages and the design system"; placeholder is the Hermes model or "model id" | sets the planner model | pop open | same |
| Builders row | combo input | "Builders": "every agent that writes a section" | sets the builder model (same setting as #build-model) | pop open | same |
| Reviewer row | combo input and toggle | "Reviewer": "looks at screenshots after a build (needs vision)"; "Turn off" / "Turn on" | sets or disables the reviewer | pop open | same |
| Combo suggestion list | list | model ids; "No match: press Enter to use it as typed" | picks a model | while typing | same |
| Row status | text | "picked · Hermes has X" / "from Hermes · host" / "not set in Hermes" / "off" | nothing | per row | same |
| Images | select | "Auto (Codex login, gpt-image-2-low)", "Off: shapes and SVG only", providers (with "(not signed in)" where needed); small "paints photos and illustrations…"; status "N providers signed in" | sets the image provider | pop open | same |
| Lite mode | select | Auto (on/off on this device) / On / Off | sets lite mode | pop open | same |
| Footer | text | "Each image is one call to that provider and uses its quota. Changes apply to the next build." | nothing | pop open | same |

The pop closes on Esc or a click outside it.

## 17. New game wizard .game-pop (canvas.js:4157-4253)

| Step | Control | Kind | Label/text shown | What it does | File:line |
|---|---|---|---|---|---|
| all | Header and × | text and button | "New game" | × closes; Esc closes unless busy; `setView` also closes it | canvas.js:4157-4253, 3927 |
| step 0 | Promo checkbox | checkbox | "A promo game for {brand}: set in its world, in its colours, with a button back to it" | ties the game to the open site; shown only when a site build is open | same |
| step 0 | Idea | text input | placeholder "Your idea in a line (optional): “a neon spirit eating its way through a night market”" | the seed idea | same |
| each question | Progress | dots | none | shows the step | same |
| each question | Question | h3 | the question text from `/api/game` (not read) | nothing | same |
| each question | Answer chips | chip buttons | answers from the server | answer and move to the next step | same |
| each question | Free answer | text input | placeholder "…or in your own words" | Enter moves to the next step | same |
| step 1 and later | Back | button | "← Back" | previous step | same |
| each question | Just build it | button | "Just build it" | skips to the spec | same |
| each question | Next / Write the spec | button | "Next"; on the last step "Write the spec" | moves on, or asks the planner for the spec | same |
| busy | Spinner | text | "The planner is writing the game spec: an original world, hero and enemies…" / "Starting the build…" | nothing | same |
| spec | Title and pitch | editable text | the spec | edit it | same |
| spec | Optional lines | text | "A promo game for …", "Feel of …" | nothing | same |
| spec | Spec rows | click-to-edit rows | Setting, Hero, Enemies, Loop, Progression, Controls, Win, Lose, Look, Sound (Engine is fixed); "Click any line to change it." | edit a row | same |
| spec | Change answers | button | "← Change answers" | back to the questions | same |
| spec | Build the game | button | "Build the game" | POST `/api/game`, then `openRun`, then `setView('app')` | canvas.js:4227-4249 |
| error | Error | text | "Game mode isn't loaded on this server yet. Restart Swarm Studio (hermes swarm) and try again." | nothing | canvas.js:4157-4253 |

## 18. Auto box (Make / Pro) .auto-pop (openAuto, canvas.js:4559-4645)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Header and × | text and button | "Auto mode" | × closes | box open | canvas.js:4559-4645 |
| Mode | radio (2) | "✨ Make" ("one prompt, a fun result") / "💼 Pro" ("a pack for your market") | switches Make or Pro | box open | same |
| Heading | text | "One prompt. The whole thing." | nothing | box open | same |
| Make chips | chip buttons | "🎮 a game trial page", "🎸 my band's tour site", "🛍 a pop-up shop", "🎂 a birthday quest" | fill the prompt | Make mode | canvas.js:4597 |
| Plan list | read-only list | Design the site / Review every page / Build the working app / Add three mini games on /play (or Build one big game) / Sell a $2 credit pack (demo checkout, fake card) / Keep the data in Supabase / Film the game and cut a promo / Deploy to Vercel | nothing | Make mode | canvas.js:4569, 4586-4589 |
| Games | radio (3) | Auto / 3 mini / 1 big | sets the game plan | Make mode | canvas.js:4586-4589 |
| Connectors | rows, link, button | "checking your sign-ins…", "✓ connected", "waiting for you to approve in the browser…", "open sign-in", "🔌 Connect {label}"; smalls "Auto makes a free project and its table for you" / "sign in once; no keys to copy" | starts an OAuth sign-in for that service | box open | canvas.js:5430-5454 |
| Prompt | textarea | placeholder "A night market in Taipei: street food, a festival weekend in March, tickets and a vendor map" (prefilled from #brief); in Pro the placeholder is the pack pitch | the brief | box open | canvas.js:4559-4645 |
| Launch kit | checkbox | "📣 Also write a launch kit at the end: posts for X, LinkedIn and the rest."; small "Nothing is posted until you press Post on each one." | adds a launch-kit step | box open | same |
| Run it all | button | "Run it all"; small "Takes a while: the app and the games are real builds. Keep this window open; the review needs it." | POST `/api/auto`; ⌘/Ctrl+Enter does the same | box open | canvas.js:4628-4640 |
| Pro packs | buttons | "loading packs…", "No packs found."; each pack shows icon + name and its pitch | picks a pack; Make chips and Games are hidden | Pro mode | canvas.js:4600-4627 |
| Pack intake | selects and inputs | one per pack question; placeholder is the default; "You get: …" | answers fill the pack; the plan list is replaced | a pack is picked | canvas.js:4610 |

If an Auto run is already working, `openAuto` only shows the Auto panel (canvas.js:4560).

## 19. Auto panel .auto-panel (renderAutoPanel, canvas.js:4679-4719)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Minimised pill | button | "Auto · {now} · {time}" with a meter; title "Expand the Auto panel" | expands the panel | minimised | canvas.js:4679-4719 |
| Expanded head | clickable header | title "Minimise" | minimises | expanded | same |
| Stop | button | "Stop"; title "Stop after the current step" | POST `/api/auto/stop` | while working | same |
| Hide | icon button | ×; title "Hide" | hides the panel | when not working | same |
| Minimise | button | "−"; title "Minimise" | minimises | expanded | same |
| Meter | bar | title "N of M steps" | nothing | always | same |
| Prompt | text | the run prompt | nothing | expanded | same |
| Steps | list | state icons, notes, "More" / "Less" | expand or collapse a step's notes | expanded | canvas.js:4551-4557 |
| Open the live app | button or link | "Open the live app" | opens the deployed URL | when live | canvas.js:4679-4719 |
| Error | text | error message | nothing | failed | same |
| Summary | button | "Summary" | opens the summary card | after the run ends | same |
| Launch kit | button | "Launch kit" | opens the launch kit | after the run ends | same |

## 20. Auto show overlays

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Show card | non-interactive card, about 1.2 s | "STEP i / n", verb + word (STEP_SHOW), crew pills | nothing | on each Auto step change; not under reduced motion or on the wall | canvas.js:4729-4734, 4747-4769; canvas.css:1573 |
| Live tab pulse | class on a #views tab | none | marks the view Auto is working in | classic, during Auto | canvas.js:4772-4776 |
| Reviewer cursor and flag boxes | overlay | cursor plus boxes around flagged areas | nothing | during a review | canvas.js:4780-4852 |
| Frame scan pill | pill inside the page frame | "🔎 reviewing · Ns" | nothing | during a review | frame.html:227 |

## 21. Summary card .show-sum (showSummary, canvas.js:4983-5016)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Close | icon button and backdrop | × titled "Close" | closes | open | canvas.js:4983-5016 |
| Kicker and title | text | "Auto · shipped" / "Auto · stopped"; "One prompt. The whole thing." / "Stopped on a step." | nothing | open | same |
| Total | text | the time, with "from prompt to live link" or "…to the last step" | nothing | open | same |
| Step bar | segmented bar | each segment's title is "label · time" | nothing (hover shows the title) | open | same |
| Steps list, counts, crew | text | agents, pages, sections, images, files, lines; "Hermia and N crew" | nothing | open | same |
| QR and link | QR svg, link, button | QR code (show.js:155-161), "Live at" link, "Copy link" | copies the link | when there is a URL | same; show.js:155 |
| Play the game | button | "Play the game" | opens the game URL | URL present and a games step ran | same |
| Open the site | button | "Open the site" | opens the URL | URL present | same |
| Open the launch kit | button | "Open the launch kit" | opens the launch kit | kit present | same |

Hidden on the wall (canvas.css:1573).

## 22. Launch kit .launch-pop (canvas.js:5018-5129)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Header and × | text and button | "Launch kit" | closes | open | canvas.js:5018-5129 |
| Loading and failure | text | "Writing the posts…" / "The launch kit could not be written." | nothing | loading or failed | same |
| Heading and note | text | "Tell people. You press Post."; "Written from this run's facts… Nothing is sent from here without your click." | nothing | loaded | same |
| Media to attach | download links | file names | download | loaded | same |
| Network card text | read-only textarea and counter | the post text, "n/limit" | nothing (editable after Edit) | per network (NET_ICON) | canvas.js:5022 |
| Post | button | "Post" / "Post 1/N" / "Download video + copy caption" / "Post…" / "Connect {label} in Hermes to send" (disabled) | opens the network's share page (show.js:166-174), or the gateway confirm | per card | same; show.js:166-174 |
| Copy | button | "Copy" | copies the text | gateway cards | same |
| Edit / Save | toggle button | "Edit" → "Save" | edits the post text | per card | same |
| Skip | button | "Skip" | marks the card skipped | per card | same |
| Status | text | status label | nothing | per card | same |
| Gateway confirm | dialog | "Send to X?", Channel select, "Exactly this text", "Attachments" ("None. The link is in the text…"), "Cancel", "Send" | sends through the Hermes gateway | after Post on a gateway card | canvas.js:5105-5129 |

## 23. Sound dock (canvas.js:5172-5193, 5242-5252)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| .sd-toggle | toggle | "Chatter"; title "Crew chatter: the agents babble as they work (on/off)" | turns chatter on or off (kept in sync with #crew-mute) | bottom-left of the current view; not on the wall | canvas.js:5172-5193, 5229-5233; canvas.css:1573 |
| .sd-vol | range 0-100 | aria "Chatter volume"; title "Volume N%" | sets the chatter volume | same | same |

## 24. Galaxy home (galaxy.js:148-532)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| Galaxy canvas | WebGL canvas | aria-label "Your galaxy: every build is a star system" | a click on a star picks that build | galaxy mode | galaxy.js:485 |
| .gx-chart-btn | button with count | "Star chart" plus a count; title "Every build in the galaxy, as a list" | opens the star-chart list | galaxy, when builds exist | galaxy.js:151, 176, 355-356 |
| .gx-chart list | list of buttons | colour dot, title, "live" or a date; empty "No worlds yet." | picks a build; Esc closes the list | chart open | galaxy.js:177, 357-358 |
| Heading | text | "Where to next?" | nothing | galaxy | galaxy.js:154 |
| Subtitle | text | "Hermia and her crew build it. Every world you make becomes a star." | nothing | galaxy | galaxy.js:155 |
| Chips | chip buttons | "Live now: {title}", "Back to {title}" | pick that build | when a live run or a last-viewed run exists | galaxy.js:359-363 |
| Prompt | text input | placeholder "A night market in Taipei, a cat café, a puzzle game…"; aria "Where to next? Describe what to build" | the brief | galaxy | galaxy.js:148-175 |
| .gx-auto | button | "Auto" (text hidden on narrow screens); title "Auto: the site, a review, the app, the games, a video and a deploy" | `sw.submit(text, true)`, then `openAuto`; stays in galaxy mode (no `C.go`) | galaxy | galaxy.js:158, 175; galaxy.css:217 |
| .gx-go | button | "Launch"; title "Launch: the crew designs and builds the site" | `sw.submit(text)` (site build), then `C.go('orbit')` | galaxy | galaxy.js:159, 167-174; canvas.js:5480-5485 |
| Star labels | buttons | title and "N pages · date · theme" or "game"; at most 9 (5 on narrow screens) plus the live and hovered ones | pick that build | galaxy | galaxy.js:340-353, 449-462 |
| Pick behaviour | behaviour | none | flies in for about 900 ms, then `C.go('orbit')` and `sw.openRun` | after a pick | galaxy.js:488-498 |
| Failure text | text | "The galaxy could not start here (WebGL or three.js missing). ☰ → Classic view works as before." | nothing | when WebGL or three.js fails | galaxy.js:510 |

The build list refreshes every 12 s (galaxy.js:519-520).

## 25. Cosmos chrome (galaxy.js:537-663; galaxy.css:12-49)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| .cosmos-chatbtn | button with Hermia avatar | "Chat"; title "Open the chat, files and layers" | `C.chat(true)` opens the side column | station mode, when the chat is closed | galaxy.js:617-622; galaxy.css:43-48 |
| .cosmos-fold | icon button | see section 4 | `C.chat(false)` | cosmos, when the chat is open | galaxy.js:624-634 |
| .cosmos-back | button | see section 1 | back one level | orbit and station | galaxy.js:600-605 |
| More → Game / Classic view | menu items | see section 3 | see section 3 | cosmos | galaxy.js:609-614 |

**Top bar in cosmos mode** (galaxy.css:13-20):
- Hidden in every cosmos mode:
  - the #views star map
  - #game-btn
  - undo/redo
  - the clock
  - the "More" text and count (icon only)
- Also hidden in galaxy mode: the file name, Play and Publish.
- Also hidden in orbit and station: the brand.
- What remains: the back button, build name, Auto, Play, Publish, crew-mute and ☰.

**Side column in cosmos mode:**
- It is hidden unless `cosmos-chat` is on.
- In galaxy mode it is never shown (galaxy.css:31-37).
- #side-min is hidden in cosmos (galaxy.css:49).

**Mode switching rules:**
- `C.go` returns early in classic view and on the wall (galaxy.js:553).
- Orbit mode forces the canvas view (galaxy.js:564).
- Stations map to views (galaxy.js:545):

| Station | View |
|---|---|
| Design deck | canvas |
| Film studio | video |
| Engine room | app |

## 26. Orbit view (orbit.js)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| .comm-thought | clickable thought cloud | title "Hermia's reasoning: click for the full log" | opens the think log | orbit, when there is reasoning | orbit.js:24-30, 73-78 |
| .comm-text | clickable text | "HERMIA Standing by."; title "Hermia's orders and reasoning: click for the full log" | toggles the think log | orbit | same |
| .comm-log | button with count | "Thinking" plus a count; title "Hermia's thinking: everything she reasoned and ordered" | toggles the think log | orbit | same; orbit.js:63 |
| .comm-chat | button | "Chat"; title "Open the chat column" | toggles `cosmos-chat` | orbit | same |
| Think-log dialog | dialog | "Hermia's thinking"; × titled "Close (Esc)"; empty "Nothing yet. Her reasoning and orders land here while the crew builds." | closes | when opened | orbit.js:23, 65-78 |
| Planet labels | buttons | page title, progress bar, "d/n sections" or "planned"; title "{title}: open it on the Design deck" | `openPage`: `C.go('station','canvas')`, then `focusPage` | orbit, pages exist | orbit.js:293-307, 475-478 |
| Planet (3D click) | canvas click | none | same as a planet label | orbit | orbit.js:616-621 |
| Station label: Design deck | button | title "Design deck: the canvas, every page and section"; status | `C.go('station','canvas')` | orbit | orbit.js:206-211, 356-362 |
| Station label: Film studio | button | title "Film studio: the promo video"; status | `C.go('station','video')` | orbit | same |
| Station label: Engine room | button | title "Engine room: the working app, its code and the code wall"; status | `C.go('station','app')` | orbit | same |
| Station status | text | "● working" / "ready" / "needs a look" / "canvas" / "video" / "app + code" | nothing | orbit | same |
| Sun label status | text | "Pick a star in the galaxy, or launch a new one" / "a game: its build lives in the Engine room" / "Hermia is plotting the course…" / "done · …" / "building · …" | nothing | orbit | orbit.js:350-351 |
| Empty text | text | "Hermia is plotting the course: planets appear as she names the pages." | nothing | orbit, no pages yet | orbit.js:354 |
| Minions | animated avatars with bubbles | speech text | nothing | orbit | orbit.js |
| Narrow list (600 px or less) | list | sun card, station buttons, planet buttons ("· building") | same actions as the labels | narrow screens | orbit.js:624-645; galaxy.css:192, 225 |

## 27. Stations

A station is the classic studio view (canvas, video or app) shown in cosmos mode. The 3D scene is hidden and the lean top bar is used.
- There are no station-specific controls beyond the .cosmos-chatbtn and the "Orbit" back button.
- The #views tabs are hidden here, so moving between stations goes through orbit.
- Slash commands and the composer can still call `setView` when the chat is open.

## 28. Wall (wall.html)

| Control | Kind | Label/text shown | What it does | When visible | File:line |
|---|---|---|---|---|---|
| URL | parameters | `/wall?runs=a,b,c,d&speed=8`, `/wall?live=1`; with no runs, the 4 newest non-game runs | picks the tiles | wall page | wall.html |
| Tile | iframe | contents of `/?replay=…&wall=1` or `/?run=…&wall=1` | nothing (display only) | wall | wall.html |
| Tile tag | text | title and a "0:00" timer; progress bar; ✓ when finished | nothing | wall | wall.html |
| .open overlay | full-tile link | title "Open this canvas" | opens `/?run=id` in a new tab | wall | wall.html:55-56 |
| Footer #cap | text | "Swarm Wall"; when all tiles finish "N builds. One Hermes. N min."; note "live" or "replayed at N× · each build recorded separately · times are real" | nothing | wall | wall.html:30, 78, 82 |
| Empty text | text | "No saved runs yet. Run Auto first, then open the wall." | nothing | no runs | wall.html:46 |

**In `?wall=1` tiles:**
- Hidden by CSS (canvas.css:1340, 1573; galaxy.css:234):
  - top bar, side panel, Design panel, game wizard, side-min
  - sound dock, show card, summary card
  - galaxy, orbit and chat button
- Chatter is forced off (chatter.js:23).

## 29. Keyboard shortcuts (all)

| Key | Action | Scope | File:line |
|---|---|---|---|
| Enter | send the composer | #brief | canvas.js:1537-1545 |
| Shift+Enter | new line | #brief | same |
| Arrows, Tab, Enter, Esc | navigate, pick or close the slash popover | while it is open | canvas.js:1537-1543 |
| Esc | close the player or stop a tour; deselect | global | canvas.js:1385-1398 |
| V | in the player: tour menu; otherwise the Move tool | global | same |
| M | in the player: motion; otherwise cycle crew sound (#crew-mute) | global | canvas.js:1385-1398, 5234-5239 |
| T / C | Text / Comment tool | canvas | canvas.js:1385-1398 |
| D | Design panel | global | same |
| P | open or close the player | global | same |
| A | auto camera | canvas | same |
| 0 | fit all pages | canvas | same |
| ⌘Z / Ctrl+Z | undo | global, including cosmos where the buttons are hidden | canvas.js:2355-2362 |
| ⇧⌘Z / Ctrl+Y | redo | global | same |
| Enter | send a comment | comment composer | canvas.js:2722-2743 |
| Esc | close the composer, dialogs, Models, game wizard (unless busy), big screen, think log, star chart | per dialog | various |
| ⌘/Ctrl+Enter | Run it all | Auto box | canvas.js:4628-4640 |
| Enter | next step | game wizard free input | canvas.js:4157-4253 |
| Enter | use the typed model id | Models combo | canvas.js:3235-3354 |

## 30. URL parameters and remembered settings

**URL parameters:**
- `?run=` and `?replay=&speed=` (both start in orbit)
- `?wall=1`
- `?chatter=1|0` (chatter.js)
- `?fps=` (galaxy)

**localStorage keys:**
- tab, panels, sideMin, device, motion, breakroom
- fileSort, fileGroup, fileClosed
- videoStyle, videoCut, videoVoice, videoMusic
- recentModels
- swarm.crew, swarm.autoMin, swarm.chatter, swarm.classic
- swarm--side-w, swarm--design-w

**Hermes `cmd` events over SSE** (canvas.js:4258-4288) can trigger:
- play and review
- commandOps:
  - motion (1669)
  - export (2539)
  - publish (2643)
  - fix (2754)
  - video (3145)
  - app/view (4154-4155)
  - game (4253)

## 31. Other files

- **frame.html:** no user controls apart from the review scan pill (frame.html:227).
- **show.js:** the QR encoder and the share URLs for x, linkedin, threads and bluesky. No UI of its own.
- **chatter.js:** sound only, no UI. Controlled by `?chatter=` and the sound dock.
- **crew.js:** avatars only.

---

# Entry points

### Ways to start a build or a job

| # | Entry point | Starts | File:line |
|---|---|---|---|
| 1 | Chat composer "Build" button or Enter (Canvas view) | site build (POST `/api/run`) | index.html:71; canvas.js:1518-1536 |
| 2 | Galaxy "Launch" | site build via `sw.submit`, then orbit | galaxy.js:159, 167-174; canvas.js:5480-5485 |
| 3 | Galaxy "Auto" | `sw.submit(text, true)` + Auto box | galaxy.js:158, 175 |
| 4 | Top bar "Auto" → Auto box "Run it all" (Make or Pro pack), or ⌘/Ctrl+Enter | full Auto pipeline (POST `/api/auto`) | canvas.js:4628-4646 |
| 5 | Top bar "Game" (classic) → wizard → "Build the game" | game build (POST `/api/game`) | canvas.js:4227-4251 |
| 6 | More → "Game" (cosmos) → wizard | game build | galaxy.js:610, 612 |
| 7 | `/game [idea]` → wizard | game build | canvas.js:1445 |
| 8 | App empty state "🎮 Start a game" → wizard | game build | canvas.js:4048 |
| 9 | Hermes cmd `game` | game wizard | canvas.js:4253 |
| 10 | App view "Build the app" | app build (`appAsk('')`) | canvas.js:4043-4047 |
| 11 | App failed card "Try again" | app build | same |
| 12 | Composer in the App view | app change (`appAsk(text)`) | canvas.js:1530 |
| 13 | `/app [change]` | app build or change | canvas.js:1444 |
| 14 | Publish → "Working app" | app deploy to Vercel (`deployApp`) | canvas.js:4486-4492 |
| 15 | More → "Video" (no video yet) | video (`makeVideo`) | canvas.js:3144 |
| 16 | Video panel "Make the video" / "Make a new cut" / "Try again" | video | canvas.js:3054-3063 |
| 17 | Composer in the Video view | video with an idea | canvas.js:1531 |
| 18 | `/video [style] [idea]`; Hermes cmd `video` | video | canvas.js:1402-1486, 3145 |
| 19 | More → "Review"; `/review`; Hermes cmd `review` | review | canvas.js:2976 |
| 20 | Automatic review after a run | review | canvas.js:299, 2963 |
| 21 | Comment composer "Send" | section fix | canvas.js:2722-2743 |
| 22 | `/fix <what>`; Hermes cmd `fix` | fix | canvas.js:1437, 2754 |
| 23 | Design → Pictures "➕ Add" | fix (adds a photo) | canvas.js:4522 |
| 24 | Design → Pictures "🎨 Make it" / "New picture" | image (POST `/image`) | canvas.js:4512-4518 |
| 25 | Text edit dialog "Save" | direct text edit, no agent | canvas.js:2659-2705 |
| 26 | Design property pickers, Variables edits, Versions restore | direct design edit | canvas.js:2365-2477 |
| 27 | More → "Export"; `/export`; Hermes cmd | export | canvas.js:2538-2539 |
| 28 | Publish → "Website" → host or "This computer" | site publish | canvas.js:2582, 2605 |
| 29 | `/publish [host]`; Hermes cmd | site publish without the menu (default github) | canvas.js:1402-1486, 2643 |
| 30 | Launch kit (Auto checkbox, Auto panel button, summary button) | launch-kit posts | canvas.js:5023-5032 |
| 31 | Player tour menu "↻ Write new visitors" / "Try again" | visitor personas | canvas.js:1790 |

**Not a build start:**
- "New file" (canvas.js:3908) and `/new` only clear the canvas and focus the composer.

### Ways to send a chat or instruction

| Way | Notes | File:line |
|---|---|---|
| Chat composer #brief | meaning depends on the view: site build / video idea / app change, or a slash command | canvas.js:1518-1545 |
| Slash commands (20) | via the composer | canvas.js:1402-1486 |
| Comment composer | per section, to an agent | canvas.js:2722-2743 |
| Text edit dialog | direct edit | canvas.js:2659-2705 |
| Picture prompt textarea and "Add a picture of…" input | — | canvas.js:4498-4525 |
| Video idea input | Video panel | canvas.js:3015-3077 |
| Game wizard | idea input, chips, free text, editable spec rows | canvas.js:4157-4253 |
| Auto prompt textarea and Pro pack intake fields | — | canvas.js:4559-4645 |
| Galaxy prompt input | — | galaxy.js:148-175 |
| Launch kit "Edit" text, then "Send" in the gateway confirm | — | canvas.js:5105-5129 |
| Hermes cmd events | not a UI control | canvas.js:4282-4288 |

# Duplicates

Controls that do the same thing, or overlap:

| Function | Controls | File:line |
|---|---|---|
| Auto | top bar "Auto" (canvas.js:4646); galaxy "Auto" (galaxy.js:158) | — |
| Game wizard | top bar "Game" (classic); More → "Game" (cosmos); `/game`; App empty "🎮 Start a game"; Hermes cmd | canvas.js:4251, 1445, 4048, 4253; galaxy.js:610 |
| Video | #views "Video" tab; More → "Video"; Film studio station; `/video`; composer in the Video view; auto-open on a video event | canvas.js:3935, 3144, 1531, 3011; orbit.js:356-362 |
| App | #views "App" tab; Engine room station; `/app`; Publish → "Working app" (switches to App view); "Build the game" (switches to App) | canvas.js:1444, 4489, 4249 |
| Canvas | #views "Canvas" tab; Design deck station; planet click; `/canvas` | orbit.js:475-478 |
| Play prototype | Play button; P key; `/play`; chat chip "▶ Play prototype"; Hermes cmd | canvas.js:1306, 1385-1398, 1197-1220 |
| Watch a visitor | player "Watch a visitor"; V in the player; chat chip "👀 Watch a visitor" | — |
| Undo / redo | buttons; ⌘Z / ⇧⌘Z; `/undo`, `/redo`. Design "🕘 Versions" overlaps (per-section restore) | canvas.js:2353-2362, 2365-2395 |
| Break room | More → "Break room" toggle; dock × | canvas.js:4346-4350 |
| Design panel | More → "Design"; D key; × close; auto-open on selection | canvas.js:3378-3388 |
| Models | More → "Models"; `/models`; #build-model "Other…" | canvas.js:3408-3424 |
| Builder model | set in two places: #build-model in the chat tab and the Builders row in Models | canvas.js:3408-3424, 3235-3354 |
| Model pick for the planner | More → Models only. The #build-model title points there | — |
| Open the chat column | orbit "Chat" (.comm-chat); .cosmos-chatbtn "Chat" in stations. Closing: .cosmos-fold × and .comm-chat toggle | — |
| Hermia's reasoning | .comm-thought, .comm-text, .comm-log "Thinking" all open the same think log; the Log tab and chat show related lines | orbit.js:24-30, 73-78 |
| Sound | #crew-mute (3 states) and sound dock "Chatter" toggle, kept in sync; the volume slider is only in the dock | canvas.js:5229-5233 |
| Build lists / opening a build | Files tab rows; galaxy stars; galaxy star labels; Star chart list; "Live now" / "Back to" chips; `/files`, `/open`; #app-link; wall tile "Open this canvas" | — |
| Publish website | Publish → "Website" → pop; `/publish [host]` publishes without the pop | — |
| Traces | Design "🔍 Trace"; file menu "🔍 Traces…"; `/trace` | — |
| Record traces | file menu item; Trace dialog checkbox; `/trace on\|off` | — |
| Folder assignment | file menu "Move to folder"; fileInfo Folder field; `/folder`; drag a row onto a folder; ＋📁 new folder; file-menu "＋ New folder…" | — |
| Build details | file menu "Details, tags and note…"; `/info` | — |
| Show in Finder | file menu; fileInfo dialog; video panel; file menu "Show the video in Finder" | — |
| Summary / launch kit | Auto panel "Summary" / "Launch kit"; summary card "Open the launch kit"; Auto box checkbox (adds the kit step) | — |
| Copy link | Publish website pop "Copy link"; deploy shot "Copy"; summary card "Copy link"; launch-kit "Copy" (copies the text) | — |
| Open live app | Auto panel "Open the live app"; summary "Open the site" / "Play the game"; #app-open; deploy shot open icon; publish "Open ↗" | — |
| Stop | App bar "Stop" (`/stop`); Auto panel "Stop" (`/api/auto/stop`); player persona "Stop" (tour). Different targets, same label | — |
| Build progress | status strip; chat progress message; #agent-count; #timer; Auto meter; orbit sun status; planet bars; station status; .vbadge; Files "● building" | — |
| Back to the galaxy | .cosmos-back (two steps from a station); turning Classic view off | — |
| Close the player | #pl-close; Esc; P | — |

# Visible text

Helper sentences shown by default, without hovering. Long ones are cut at about 12 words.

**Galaxy (the default first screen):**
- "Where to next?" (galaxy.js:154)
- "Hermia and her crew build it. Every world you make becomes a star." (galaxy.js:155)
- Input placeholder: "A night market in Taipei, a cat café, a puzzle game…" (galaxy.js:148-175)
- Failure only: "The galaxy could not start here (WebGL or three.js missing)…" (galaxy.js:510)

**Orbit:**
- "HERMIA Standing by." (orbit.js:24-30)
- "Pick a star in the galaxy, or launch a new one" (orbit.js:350)
- "Hermia is plotting the course: planets appear as she names the pages." (orbit.js:354)
- Think log empty: "Nothing yet. Her reasoning and orders land here while the crew builds." (orbit.js:65-78)

**Chat tab / side panel:**
- "Describe a product below. A planner picks the pages, then a swarm…" (canvas.js:122)
- Placeholder: "Describe a product. The swarm designs and builds its site." (index.html:65)
- "Built for Hermes Agent" (index.html:74)
- Layers empty: "Pages appear here once the planner names them." (canvas.js:1033-1092)
- Files empty: "No files yet. Describe a product in Chat to make one." (canvas.js:3475)
- Files search placeholder: "Search names, briefs, themes, tags… (tag:, has:video, on:vercel)" (canvas.js:3463-3474)
- Empty folder: "Empty. Drag builds here." (canvas.js:3498-3519)

**Canvas:**
- Status "Ready" (index.html:97)
- "camera: auto (follows agents)" / "camera: manual · double-click for auto" (canvas.js:975-980)
- "break room" (index.html:94)
- Planner pill "idle", if the float is on (index.html:101)

**Design panel:**
- "Click a section on the canvas to edit it, or an agent in…" (canvas.js:2067-2108)
- "Start a build. While the swarm works, this shows the properties…" (same)
- "Click a value to change this section. Variables change every page." (same)
- "The design system appears here when a build starts." (canvas.js:2110-2140)
- "The planner picks colour tokens, type and radius first…" (same)
- Pictures: "edit the words to change it" (canvas.js:4498-4525)
- "No photo in this section." (same)

**Player:**
- "Click links to move between pages · clicking anywhere else shows where the links are" (index.html:164)
- "Visitors come once the build is done" (canvas.js:1769-1793)
- "Writing a few visitors for this site" (same)

**App view:**
- "No build open" / "Make a site on the canvas, open one from Files, or start a 🎮 Game." (canvas.js:4036-4049)
- "Turn this design into a working app" / "React + TypeScript + shadcn/ui, with the design kept exactly…" (same)
- "A game starts with a few questions" (canvas.js:4048)
- "First time: the app engine installs itself once (about a minute, ~1.5 GB)…" (canvas.js:4036-4049)
- "…You can go back to the Canvas or Video meanwhile." (same)
- "Steps show here while the app builds: every file the engine writes…" (canvas.js:3997-4009)

**Video panel:**
- "A short promo of this build: the planner writes the storyboard and a voiceover…" (canvas.js:3015-3077)
- Idea placeholder: "Your idea for the video (optional): “end on the night market crowd”…" (same)

**Publish menu:**
- "Put it online" (index.html:32)
- "The designed pages, no server. GitHub Pages, Vercel, Cloudflare or this computer." (index.html:33)
- "The site with its server: orders save, /admin works. Live on Vercel." (index.html:34)
- "Build the first app (App tab)." variants (canvas.js:4479-4483)

**Publish website pop:**
- "the designed pages, no server" (canvas.js:2541-2643)
- "Checking where you are signed in…" (same)
- "Sign in with gh auth login to get a public link" (same)
- "Hosted by Swarm Studio at 127.0.0.1 · instant, only you can open it" (same)
- "An Octo vault grant (octo_vault_…) keeps the token in your vault…" (same)

**Models pop:**
- "picks stay in Swarm Studio; Hermes's config is untouched" (canvas.js:3235-3354)
- "plans the pages and the design system" (same)
- "every agent that writes a section" (same)
- "looks at screenshots after a build (needs vision)" (same)
- "paints photos and illustrations…" (same)
- "Each image is one call to that provider and uses its quota…" (same)
- "Changes apply to the next build." (same)

**Game wizard:**
- "A promo game for {brand}: set in its world, in its colours…" (canvas.js:4157-4253)
- "Your idea in a line (optional): “a neon spirit eating its way…”" (same)
- "The planner is writing the game spec: an original world, hero and enemies…" (same)
- "Click any line to change it." (same)

**Auto box:**
- "one prompt, a fun result" / "a pack for your market" (canvas.js:4559-4645)
- "One prompt. The whole thing." (same)
- the plan list items (canvas.js:4569)
- "Auto makes a free project and its table for you" / "sign in once; no keys to copy" (canvas.js:5430-5454)
- "📣 Also write a launch kit at the end: posts for X…" (canvas.js:4559-4645)
- "Nothing is posted until you press Post on each one." (same)
- "Takes a while: the app and the games are real builds…" (same)
- "Keep this window open; the review needs it." (same)

**Code wall:**
- "Writing the app" / "Writing the game" (canvas.js:5307-5414)
- "{name} is planning the next files" (same)

**Deploy shot:**
- "Going live", "Vercel is building it", "It's live", "the crew is trying it" (canvas.js:4857-4980)

**Summary card:**
- "One prompt. The whole thing." / "Stopped on a step." (canvas.js:4983-5016)
- "from prompt to live link" (same)
- "Hermia and N crew" (same)

**Launch kit:**
- "Tell people. You press Post." (canvas.js:5018-5129)
- "Written from this run's facts… Nothing is sent from here without your click." (same)

**Wall:**
- "No saved runs yet. Run Auto first, then open the wall." (wall.html:46)
- "replayed at N× · each build recorded separately · times are real" (wall.html:78-82)

# Navigation

**Galaxy → orbit:**
- galaxy "Launch" (galaxy.js:167-174)
- a star click, a star label, a Star chart row, a "Live now" / "Back to" chip. Each flies in, then `C.go('orbit')` + `openRun` (galaxy.js:488-498)
- galaxy "Auto" does **not** leave the galaxy (galaxy.js:175)

**Orbit → station:**
- station labels Design deck / Film studio / Engine room (orbit.js:356-362)
- planet label or planet click goes to Design deck + `focusPage` (orbit.js:475-478, 616-621)
- narrow-screen list buttons (orbit.js:624-645)

**Station → orbit → galaxy:**
- the top-bar .cosmos-back button: "Orbit" in a station, "Galaxy" in orbit (galaxy.js:575-581, 600-605)
- there is no single control from a station straight to the galaxy

**Between Canvas, Video and App:**
- **Classic view:**
  - the #views tabs (canvas.js:3941)
  - `/canvas`, `/video`, `/app`
  - Publish → Working app
  - Build the game
  - Auto steps
  - Hermes `view` cmd
  - all of these call `setView` (canvas.js:3920-3941)
- **Cosmos view:** the #views tabs are hidden (galaxy.css:13). You switch by going back to orbit and picking another station. `setView` can still be triggered by slash commands (when the chat is open), Publish → Working app, the game build or Auto.
- **Side effects:** `setView` closes the game wizard (canvas.js:3927). Opening the Video view opens the video panel (canvas.js:3935).

**Classic view:**
- On: More (☰) → "Classic view" (cosmos only, galaxy.js:611-613).
- Off: the same item. Turning it off goes to orbit if a run is open, else galaxy (galaxy.js:584-597).
- Stored in localStorage `swarm.classic`, so classic persists across reloads.
- While classic is on, `C.go` returns early (galaxy.js:553).
- The .cosmos-back button is hidden (only shows with `cosmos-orbit`/`cosmos-station` classes).
- **No control in the classic chrome leads to the galaxy, apart from the "Classic view" item in More.**
- It is in the classic More menu DOM (galaxy.js:609-614), but CSS shows `.cosmos-only` items only under `body.cosmos` (galaxy.css:24-25).
- setClassic removes the cosmos classes, so the "Classic view" toggle is hidden in classic view. I found no other control that turns classic off.

**Replay:**
- `?replay=&speed=` opens in orbit (galaxy.js:651, 660).
- I found no in-app control to start a replay. The wall builds replay URLs for its tiles.

**Overlays:**

| Overlay | Closed by |
|---|---|
| Player | #pl-close, Esc, P |
| Video big screen | ×, Esc |
| Think log | ×, Esc |
| Star chart | Esc, toggle |
| Dialogs (fileInfo, Trace, text edit, Models, game wizard, Auto box, summary, launch kit, export, publish) | × or Esc, varies per dialog |

**Views with no way back to the galaxy:**
1. Classic view. `C.go` is blocked, the back button is hidden, and the Classic toggle is `.cosmos-only` (galaxy.css:24-25; galaxy.js:553, 584-597).
2. `wall.html` and its `?wall=1` tiles. The galaxy, orbit and chat button are hidden (galaxy.css:234), and `C.go` returns early on the wall (galaxy.js:553). The tile overlay opens `/?run=id` in a new tab (wall.html:55-56).
3. After galaxy "Auto" the user stays in the galaxy with the Auto box open. That is not a dead end, but no view change happens (galaxy.js:175).

# Indicators

| Indicator | Where | Meaning | File:line |
|---|---|---|---|
| #agent-count | More button (classic only) | "working/total" agents, or "0" | canvas.js:1102; galaxy.css:14 |
| #status dot, text and bar | canvas status strip | build state; "done/total" sections | canvas.js:1122-1131 |
| .vbadge | Video and App tabs | working / failed / done for that view | canvas.js:3961-3965 |
| .live tab pulse | #views tab | the view Auto is working in | canvas.js:4772-4776 |
| Toolbar .n count and who-dots | agent-only tools | how many agents are using that tool, and who | canvas.js:1143 |
| #plan-state pill | Planner float | idle / planning / done states | index.html:101; canvas.js:128, 170, 178, 297 |
| #timer | top bar (classic) | elapsed build seconds "00.0s" | canvas.js:1325 |
| Undo / redo disabled state | top bar | no history | canvas.js:2345-2354 |
| Star chart count | galaxy | number of builds | galaxy.js:355 |
| Live star pulse | galaxy | a run is building | galaxy.js:286, 325 |
| "live" / date in the Star chart | galaxy list | live run, or creation date | galaxy.js:357-358 |
| Star label "N pages · date · theme" or "game" | galaxy | build facts | galaxy.js:340-353 |
| "Thinking" count | orbit comm strip | number of Hermia reasoning entries | orbit.js:63 |
| Planet bar "d/n sections" or "planned" | orbit | sections done per page | orbit.js:293-307 |
| Station status "● working" / "ready" / "needs a look" | orbit | per-view state | orbit.js:356-362 |
| Sun status "done · …" / "building · …" | orbit | run state | orbit.js:350-351 |
| Layers .dot colour | Layers rows | which agent built or is building it | canvas.js:1033-1092 |
| Layers "who" plus time | Layers rows | builder and build time | same |
| Files "● building" | file row | run in progress | canvas.js:3529-3561 |
| Files badges 🎬, 🌐 N, 📁, #tags, swatch | file row | has a video; published N places; folder; tags; theme | same |
| Group counts, "⚠ Unfinished" | Files groups | items per group; unfinished runs | canvas.js:3498-3519 |
| Auto meter "N of M steps" and step icons | Auto panel and pill | pipeline progress, step states | canvas.js:4551-4557, 4679-4719 |
| Show card "STEP i / n" | overlay | current Auto step | canvas.js:4747-4769 |
| Game wizard dots | wizard | question step | canvas.js:4157-4253 |
| Persona progress dots | player tour bar | tour progress | canvas.js:1870-1879 |
| #app-state pill and #app-stage | App bar | app build state; turns, files, checks, live URL | canvas.js:4025-4026 |
| Code wall .cw-count | code wall | files written, agents typing, stage | canvas.js:5307-5414 |
| Deploy stages Upload / Build / Ready | deploy shot | Vercel deploy progress | canvas.js:4857-4980 |
| Publish steps ✓ / ◌ / · | Publish pop | done / in progress / pending | canvas.js:2543-2547 |
| Models row status, "N providers signed in" | Models pop | model source and image sign-ins | canvas.js:3235-3354 |
| Connector "✓ connected" | Auto box | service sign-in state | canvas.js:5430-5454 |
| Launch-kit status and "n/limit" | launch kit card | post state; character count against the limit | canvas.js:5018-5129 |
| Design .chg flash; Variables "N×" | Design panel | value just changed; token usage count | canvas.js:2067-2140 |
| Design header pill "selected" / "pinned" / "following" | Design panel | selection mode | canvas.js:2067-2108 |
| Versions "✓ now" | Versions menu | current version | canvas.js:2365-2395 |
| File menu ✓ / "● Record traces: on" | file menu | current folder; trace recording on or off | canvas.js:3819-3861 |
| Button labels "Reviewing…", "Video N%", "Video writing…", "Publishing…", "🎨 Painting…" | various | job in progress | canvas.js:1307-1316, 4512-4518 |
| Video "● live: the agents' cut, rendering" and bar | video panel | render in progress | canvas.js:3015-3077 |
| Frame scan pill "🔎 reviewing · Ns" | page frame | review in progress | frame.html:227 |
| Chat progress bar | chat | build progress | canvas.js:1317-1324 |
| #camera-hint `.auto` | canvas | auto camera on | canvas.js:975-980 |
| #crew-mute data-mode; sound dock `.on` | top bar and dock | sound state | canvas.js:5204-5233 |
| Wall tile timer, bar, ✓ | wall | replay or live progress; finished | wall.html |
| Agents float "idle" / "waiting" / "{page} · role" | Agents float | agent task state | canvas.js:1099-1119 |