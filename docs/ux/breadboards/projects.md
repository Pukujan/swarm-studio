# Projects

The Studio's file browser and its top layer ([SITEMAP](../SITEMAP.md) §6, [PATTERNS](../PATTERNS.md): Finder and
Figma's file browser). Statechart: `projects.browser`. Code: `web/home.js`, `server/projects.mjs`.

The Make box sits on this screen but has its own breadboard: [make.md](make.md).

## Places and affordances

```
Projects  (projects.browser)                                  crumb: Home › Projects
  sidebar (at rest)
  · Recent
  · All projects (count)
  · Chats
  · Assets
  · Trash (count)
  · Folders · + New folder
  · a folder (count)                ──(none)──▶ Projects, that folder's cards
  · You (avatar)                    ──(none)──▶ You menu
  · Swarm Feed (globe)              ──home──▶  the Feed's Home (opens the Feed)
  top bar
  · the view's name (heading)
  · Search (icon) · Filter · Sort · Grid view · List view
  · "Empty" (Trash only, when it holds a project)
  stage
  · Make box                        ──make──▶  Make  (make.md)
  · a project card (at rest: cover, title, kind icons, state line; a live one shows crew cursors and progress)
      click / Enter                 ──open.project──▶ the Overview (overview.md)
      a stack (count ≥ 2)           ──(none)──▶ Projects, the stack open: Version n cards, Back
      a plan card                   ──plan──▶   the Plan board (plan-board.md)
      a Studio project              ──studio──▶ the Studio scaffold (studio.md)
      More (⋯) / right-click        ──(none)──▶ Project menu
      Delete (on the cover)         ──(none)──▶ Trash (with Undo in the toast)
      Shift/⌘-click                 ──(none)──▶ Selection bar
      drag onto a folder or Trash   ──(none)──▶ filed, or in Trash
  · empty view: one line and "Make something"   ──(none)──▶ the cursor in the Make box
  · waiting cards (first load)

Project menu  (layer)
  · Open · Open the plan (a game's) · Rename · Duplicate · Move to ▸ · Download · Show in Finder · Delete
  · in Trash: Restore · Delete forever

Selection bar  (layer, 2 or more picked)
  · n selected · Move to · Delete · Clear       (in Trash: Restore · Delete forever)

Chats  (projects.browser, view = chats)                       crumb: Home › Projects › Chats
  · New chat (first row)            ──draft──▶  the Design deck's chat, nothing built
  · a chat (kind icon, title, Locked, age)
      click / Enter                 ──draft──▶  the Design deck's chat where it left off
      a game's chat                 ──plan──▶   the Plan board beside its talk
      More (⋯)                      ──(none)──▶ Rename · Delete
  · empty: "Talks with the planner that built nothing yet"

Assets  (projects.browser, view = assets)                     crumb: Home › Projects › Assets
  · a project heading               ──open.project──▶ the Overview
  · an asset tile (picture, film poster or file; its name)
  · empty: one line and "Make something"

Trash  (projects.browser, view = trash)                       crumb: Home › Projects › Trash
  · a card: Restore · Delete forever
  · Empty                           ──(none)──▶ confirm, then gone
  · empty: "Deleted projects wait here until you empty Trash"

You menu  (layer)
  · Light / Dark · Crew sound (✓) · Models · Setup · Settings
      Setup                         ──setup──▶  Setup (setup-settings.md)
      Settings                      - - ▶       Me › Settings (setup-settings.md)
      Models                        ──(none)──▶ the Models menu
```

## At 390 px

The sidebar is a drawer behind Menu (☰) with a scrim; the Make box and the cards stack in one column. The drawer closes
with ×, Esc, the scrim and a pick.

## Where the code differs

- **No breadcrumb.** The top bar shows the view's name only (`web/home.js:156`). The audit's known list has
  `projects breadcrumb` at both widths.
- **The logo reads "Projects"** and goes to Projects (`web/home.js:40`); rule 7 says it goes Home. The live Studio
  has no Feed of its own, so the globe (`hm-feed`) is the way to Home.
- **Delete on a card moves it to Trash** under the label Delete (`web/home.js:191`, `:480`); SITEMAP says Trash.
- **Boards, Mood boards and Shared with me** (SITEMAP §6, statechart `projects.boards` …) are not in the sidebar:
  they are Feed objects with no Studio code.
- **Settings is a sheet**, not navigation (`openSettings`, `web/settings.js`); the statechart's `me.settings` has no
  live state.
