# The Overview

A project's pages and files, as artboards in sections on one dotted stage, with Files and Layers on the left and the
inspector on the right while something is selected (SITEMAP §8, PATTERNS "A project": Figma's canvas; OBJECTS.md:
Overview, never "canvas"). Statechart: `build.playable.room.overview`. Code: `web/project.js`, `web/project.css`,
the shared Layers tree `web/layers.js`, the work chip `web/work.js`, the mode menu in `web/studio.js`.

## Places and affordances

```
Overview  (build.playable.room.overview)          crumb: Home › Projects › <project> › Overview
  top bar
  · Back ("Projects")              ──up──▶ Projects
  · breadcrumb: Projects ▸ <project> ▾
      Projects                     ──projects──▶ Projects
      <project> ▾                  ──(none)──▶ Project menu
  · mode menu ("Overview")         ──(none)──▶ Mode menu
  · work chip (dot, count, bar; when agents work)  ──(none)──▶ Work popover
  · Stop (when agents work; no confirm)            ──(none)──▶ "Stopping", then "Stopped"
  · live line ("Ren reviewing page 2 of 5")        ──(none)──▶ the stage zooms to that page
  · Play ▾                         ──play / watch──▶ Player over the room
  · Publish ▾                      ──share──▶ Publish (publish.md)
  · ☰                              ──(none)──▶ More menu
  left panel
  · Files | Layers (tabs)
  · Search · + (New page, Upload files, Reference, Link)
  · Files: Site, App, Game, Film, Art, Uploads, References, Code (each collapsible, with a count; Code starts closed)
      a row: click selects and pans · double-click or Enter opens · F2 renames · right-click: File menu
  · Layers: a page, its sections
  stage (dotted; drag pans, wheel or pinch zooms)
  · an artboard: a page (review state: queued, scanning, ✓ n, numbered pins), a picture (sketch or stand-in
    while painting; Try again when it failed), a game (work bar), the app, a film, an upload, a reference
      click                        ──(none)──▶ Inspector
      double-click a page or art   ──room.deck──▶  the Design deck on that page (design-deck.md)
      double-click the app or code ──room.app──▶   the Engine room
      double-click a game          ──room.game { run }──▶ the Game room
      double-click a film          ──room.video──▶ the Film studio
      right-click                  ──(none)──▶ File menu
  · crew cursors (Follow one)
  · drop files from the desktop    ──(none)──▶ Uploads, and to the crew
  · skeleton while the board loads: three page skeletons (aria-busy), Hermia on the first
  dock (bottom)
  · Move · Scribble (S) · Eraser (E) · Frame all (F) · Follow · New page · Upload · Chat
  · scope chip ("About <section> ×") · marks chip ("n marks ×")
  · "Tell the crew…" (input) · Send   ──(none)──▶ fix, repaint, extend or a new page; a question opens the deck's chat

Project menu  (layer)        Rename · Duplicate · Version n (the open one ticked)  ──open.project { version }──▶ that version
Mode menu  (layer)           Overview · Canvas ──room.deck──▶ · Video ──room.video──▶ · App ──room.app──▶ · Game ──room.game──▶
More menu  (layer)           Review · Video · Export · Replay ──room.deck, replay──▶ · Models · Design · Planner · Agents · Light · Crew sound
File menu  (layer)           Open · Rename · Duplicate (uploads) · Download · Show in Finder · Delete (uploads)
Work popover  (layer)        a row per job                ──open.project / room.*──▶ its project or room

Inspector  (layer, while an artboard is selected; ×, Esc, a click on the empty stage)
  · default: preview, Size, Style, Used on, Length, File, Section, Marks, From, Use, Link
      Open · Export / Export zip · Replace · Accept / Dismiss (a draft) · Use for… (a reference)
  · a section picked: Back, Text, Fill, Type, Spacing, Pictures (Paint), Parts · Code · "Tell the crew…"
  · a part picked: Content, Style, Attributes · Up · Down · Remove · Code

Player  (build.playable.player: prototype | visitor)
  · Close · page select · Back · Restart · Watch a visitor / Stop watching · Motion · Desktop / Mobile
```

## At 390 px

Files and Layers become a sheet from the dock's Files button; the inspector is a bottom sheet (at most 70 % of the
height) with its own ask line; the dock spans the width without New page and Upload; Play and Publish keep their
icons only; the mode menu is hidden; the live line is a pill under the top bar.

## Where the code differs

- **The breadcrumb** reads `Projects › <project> ▾` (`web/project.js:81-85`) with no `Home` and no room name; at
  ≤ 760 px it hides `Projects ›` and reads only the name. Known violation `overview breadcrumb`.
- **Two ways back.** The Back button (`web/studio.js:187-193`) and the crumb's `Projects` both go to Projects.
- **Empty project.** With no run, or a run that built nothing, the stage is blank: no line, no Make something; only
  the dock shows (`web/project.js:110`, `:425`).
- **The mode menu says Canvas** for the Design deck (owner's choice) and **App** and **Video** for the Engine room and
  Film studio (OBJECTS.md). With no game, Game opens the old wizard (`sw.game()`), which SITEMAP says is gone.
- **☰ mixes places, actions and settings** (Replay, Export, Models, Light, Crew sound), which RULES rule 5 keeps
  apart.
- **Known axe findings**: `aria-required-children` (1440), `label`.
