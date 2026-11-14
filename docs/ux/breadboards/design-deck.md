# The Design deck

Where the crew is watched at work and a page is designed. "Canvas" in the mode menu (the owner's choice); Figma's
layout almost one to one (RULES rule 32, PATTERNS "The Design deck follows Figma", SITEMAP §10). A website, app or
video started with Make opens here with Follow on. Statechart: `build.playable.room.deck` (`live`, `replay`), and
`draft` for a chat with nothing built. Code: `web/index.html`, `web/canvas/*.js` (see `web/canvas/README.md`), the
mode menu and Back in `web/studio.js`.

## Places and affordances

```
Design deck  (build.playable.room.deck.live)       crumb: Home › Projects › <project> › Design deck
  top bar
  · Back ("Overview")              ──up──▶ the Overview (overview.md)
  · the build's name (file name)
  · mode menu ("Canvas")           ──room.*──▶ Overview · Video · App · Game
  · work chip · Stop (when agents work)
  · Play ▾ (disabled until a page exists)   ──play / watch──▶ Player
  · Publish ▾ ("Publish", "Publishing…", "Live")  ──share──▶ Publish (publish.md)
  · ☰ (Review, Video, Export, Replay, Models, Design, Planner, Agents, Light, Crew sound)
      Replay                       ──replay──▶ Replay
      Design                       ──(none)──▶ Right panel
  left panel (Layers)
  · All / Shared nav and footer · Page n ▸ its sections (status, the agent working on it, eye, its parts)
  · empty: "Pages appear here once the planner names them."
  canvas
  · status pill: Ready · Planning the pages · n agents building · n pages built · Stopped
  · Follow (on while the crew works; a drag or the wheel turns it off, a double-click on the canvas back on)
  · crew cursors, with names; the Critic's issue flags on sections (removed when fixed)
  · click a section                ──(none)──▶ selected (a linked button flies to its page)
  · comment pin on a done section  ──(none)──▶ Comment composer
  toolbar
  · Move · Frame · Shape · Text · Image · Connect · Comment   (yours: Move, Text, Comment; the rest light up
    while an agent uses them)
  · Chat (pill, when the chat is folded)  ──(none)──▶ Chat

Chat  (side column; folds with ×)
  · Chat | Log | Chats ▾
  · the feed (empty: "Describe a product below…")
  · a talk: Hermia's reply · Build
  · the brief (textarea): Build · New project / Start over · Add here · Brand sheet · Keep talking
      Build                        ──started { run }──▶ the deck, the crew at work, Follow on
      Brand sheet                  ──brand { from: draft }──▶ the brand sheet (brand-sheet.md)
  · the progress line: "Planning the pages…", "n agents building · d/t sections"
  · stopped: how much is kept · Resume
  · composer: "Describe a product" (talking: "Tell Hermia…") · Build (talking: Send)

Comment composer  (layer)       the note · Send                ──(none)──▶ the crew replies in the thread
Right panel  (layer, from ☰ Design)
  · Design tab: the selected section's properties, or the page's Search & share; nothing selected: a hint
  · Variables tab: Theme, Colors, Typography, Scale, Type scale, Radius
Replay  (build.playable.room.deck.replay)   a recording of the build plays, Follow on; the strip reads Replay and how far (the App room's pill too) · Stop ──replay.stop──▶ live
Player  (build.playable.player)  Close · page · Back · Restart · Watch a visitor / Stop watching · visitors ▾ · Motion · Desktop / Mobile
```

## At 390 px

Layers is a sheet behind its button; the chat is a bottom sheet (62 % of the height) and its pill rises above the
dock; the Design panel and the file name are hidden below 980 px; the toolbar moves to the left below 1180 px; the
player drops Back, Restart and Motion below 600 px.

## Where the code differs

- **No breadcrumb.** The top bar shows the build's name (`#file-name`, `web/index.html:29`, uppercase), hidden below
  980 px. Known violation `deck breadcrumb`.
- **No loading state.** Nothing shows while `/api/models`, `/api/auto`, `/api/work` and the build's events load;
  `#status` starts at Ready (`web/index.html:116`); Hermia rests in the deck (`PET_ROOMS` has no `deck`,
  `web/pet.js:153`). Known violation `deck loading`.
- **Not Figma's layout yet** (PATTERNS):
  - no Pages list above Layers;
  - the toolbar has Image and Connect, and no Pen, Hermia (⌘K) or Code;
  - the right panel opens from ☰ instead of always being there, and has a Variables tab where Figma has Prototype;
  - Play and Share are in the top bar, not the right panel.
- **The chat is a third panel** beside Layers and the right panel; RULES rule 28 allows two (Figma's).
- **The top bar scrolls sideways** at ≤ 760 px (`web/canvas.css:1371-1377`) inside itself; the page does not.
- **Known axe findings**: `label`, `label-content-name-mismatch`.
