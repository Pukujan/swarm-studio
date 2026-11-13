# UI and UX rules

Every screen, dialog, menu and control in Swarm Studio and Swarm Feed follows these rules. They exist because
the owner found the same mistakes again and again (2026-11-09, see [REQUIREMENTS.md](REQUIREMENTS.md)): text
everywhere, too many buttons, duplicate ways to do one thing, controls that don't look clickable, checkboxes far
from their labels, panels that won't close, no way back home.

Read this file, [PATTERNS.md](PATTERNS.md), [AUDIENCE.md](AUDIENCE.md) and [INVENTORY.md](INVENTORY.md) before
changing any UI. Run the checklist at the end before opening a PR.

## The standing rules (owner, 2026-11-09)

These win over every rule below that disagrees.

1. **Never tooltips.** No `title=` attribute, no `data-tip`, no hover hint and no tooltip component anywhere in
   the UI. An icon-only control is named by its `aria-label` and nothing else. `scripts/ui-check.mjs` fails on
   any `title=` or `data-tip` in `web/`.
2. **Always minimal text.** A default screen is a headline, one input and one button. No eyebrows (kickers),
   helper sentences, sub-paragraphs or explanatory captions. Clear empty space beats words.
3. **Few colours.** Black, graphite and white, plus **one** accent for the whole plugin, in one CSS variable,
   `--accent` (`tokens/studio.tokens.json`, built into `web/tokens.css`). No per-room, per-view or per-agent colours: the crew is told apart by shade.
   The accent is the text colour: a white button with black text in dark mode, black with white text in light
   mode. The owner may pick a hue later, and that is the one line (every tint is a `color-mix` of `--accent`).
   Red is kept only for errors. Pictures (built pages, planets, art, video) are the only other colour.
4. **Light and dark.** The studio follows the system's `prefers-color-scheme`; ☰ → Light / Dark overrides it
   and is remembered. Light is a white `#ffffff` page, `#f4f4f5` surfaces, `#e4e4e7` lines and `#0b0b0c` text;
   dark is the graphite. Colours come only from the tokens, so a new screen works in both without extra rules.
   Screenshot both modes before merging a UI change.

## Where the rules come from

We don't invent UX from scratch. These rules apply well-known guides to our app:

- **Apple Human Interface Guidelines**: *deference* (the content leads, the controls step back), *clarity*,
  *depth*, and progressive disclosure.
- **Nielsen Norman Group's 10 usability heuristics**: visibility of state, match with the real world, user
  control (undo, exit), consistency, recognition over recall, minimalist design, and helping people recover
  from errors.
- **Laws of UX**: Hick (more choices, slower decisions), Fitts (big, near targets), Jakob (people expect your
  app to work like the ones they know), Tesler (complexity has to live somewhere, so put it in the app, not on
  the user), Doherty (answer in under 400 ms).
- **Refactoring UI**: create hierarchy by turning down what is secondary, not by turning up everything else.
- **WCAG 2.2**: contrast, target size, visible focus, keyboard access.
- **shadcn/ui**: the component anatomy we build on (see rule 13).
- **How Google Maps and Apple Maps handle a complex app**: the map is the whole screen, there's one search box,
  modes only appear once you ask (driving, walking, transit), labels appear as you zoom in, and a sheet peeks,
  then expands, when you pick a place. Controls appear only when they're needed (the compass shows once you
  rotate). Figma, Linear and Stripe add two more patterns: an inspector that only shows the selected thing, and
  ⌘K for everything else.
- **One mature product per screen**: TikTok for Home, Figma for the Design deck, Apple Maps for the orbit, and so
  on. The full sheet, and what we take and leave from each, is in [PATTERNS.md](PATTERNS.md).

## A. Structure

1. **One front door.** Hermes opens the Feed (Home). **+ Create** is the one way to start a build, and its input
   becomes the chat inside the build. No second form, wizard or chat box that also starts or steers a build.
2. **Depth, not width.** Each layer shows 2–4 choices, and there is no limit on depth. One flow opens into 2–3
   flows, those open into more, then into details, then into more details. The deepest paths in
   [SITEMAP.md](SITEMAP.md) are 14 layers. Home, Orbit and Room are landmarks on the way down, not the whole
   stack. You go deeper by clicking the thing itself, not through a menu.
3. **A budget per layer.** At rest a layer shows at most 4 choices, 1 primary action and 4 small edge icons.
   If a layer needs more, add a layer: group the choices, and show the groups first. Everything else comes from
   expanding, selecting or ⌘K. The Design deck's toolbar and panels follow Figma instead (rule 32).
4. **Every control lives in exactly one place.** One chat, one sound control, one way to start a game, one
   publish menu. Before adding a control, look it up in INVENTORY.md.
5. **Places, actions and settings never share a menu.** Places are stations and rooms (you go there). Actions
   live inside the place they act on (Export in the Design deck, Cut in the Film studio). Settings live in one
   ⚙ menu.
6. **The lens decides what exists.** A station or tool the current lens doesn't use is not shown at all, rather
   than disabled or greyed out (see AUDIENCE.md).
7. **Always a way home.** A breadcrumb (`Home › Projects › build › room`), the logo goes to Home, and Esc goes
   up one level. You can always tell where you are.

## B. Text

8. **At rest, names only.** No sentences on screen by default. Input placeholders are 6 words at most. On the
   Feed a build shows only its maker and title: no descriptions, the build's visuals and assets do the talking.
9. **Explanations are deleted, not hidden.** If a sentence is truly needed to decide, it goes one layer down, in
   the sheet you open by tapping the thing. It never goes in a tooltip: there are none (standing rule 1).
10. **Errors are a marker first.** A ⚠ on the thing that failed; the message once you open it; raw errors, JSON
    and stacks only behind "Details".
11. **One big heading per screen at most.** Use the display font only there. No paragraphs in capitals.
12. **States, not prose.** "3/8", a ring or a dot. Every dot, count and badge has an `aria-label` (1–3 words).
    An indicator nobody can read is a bug.

## C. Controls

13. **Build from the kit.** Use the shadcn-style components only: Button, Card, Dialog, Sheet, Popover,
    Tabs, Toggle group, Checkbox, Switch, Label, Input, Textarea, Select, Slider, Progress, Badge,
    Separator, Command (⌘K). No one-off form controls.
14. **Checkboxes and switches sit beside their label** in one row (`[☐] Label`), and clicking the label toggles
    them.
15. **Clickable things look clickable, and other things don't.** One style per role: primary, secondary, ghost,
    icon. In a menu, every item has an icon or none do. Menu headings look like headings and don't react to
    hover.
16. **Targets are at least 40 × 40 px** on desktop and 44 × 44 px on touch.
17. **One primary action per view**, always in the same place. Text on the accent fill is `--accent-ink`.
18. **Every panel closes three ways:** ×, Esc, and a click outside it. Only one sheet or popover is open at a
    time.
19. **Progress is a pill or ring that expands.** A step list is never shown by default.

## D. Space and motion

20. **The canvas is the content.** Controls float at the edges, small and translucent. At rest, no more than
    about a quarter of the space view is covered. The Design deck keeps Figma's two panels (rule 32), and ⌘\
    hides them.
21. **Nothing overlaps.** Bars, pills, panels and stations each keep their own zone at every width.
22. **Direct manipulation.** Drag turns the view, the wheel or a pinch zooms, a click selects, and a double-click
    or Enter goes in. A recentre button appears only after you've moved.
23. **Motion explains change.** Zoom in when you enter, out when you leave. UI motion takes 300 ms at most and
    respects reduced-motion settings.
24. **The crew is alive but quiet.** Hermia, the commander, and the minions fly and work. Hermia gives short
    spoken orders at each phase, under the one Sound control. Speech bubbles and reasoning stay hidden until
    you open the crew radio.

## E. Sizes and access

25. **Desktop first.** Design for 1440, 1280 and 1024 wide. At 768 and 390 it still works: things stack and
    nothing scrolls sideways.
26. **Contrast** is at least 4.5:1 for text and 3:1 for UI parts. A visible focus ring, everything reachable by
    keyboard, and every action reachable from ⌘K.

## F. Quiet by construction

27. **One frame, fixed zones.** Every screen is built from the same zones (see [PATTERNS.md](PATTERNS.md)):
    - the nav: five slots, a left rail on desktop and a bottom bar on a phone;
    - the top bar: the breadcrumb on the left, the one primary button on the right;
    - the stage: the content;
    - the inspector: on the right, only while something is selected;
    - the input;
    - one sheet at a time;
    - one toast spot.

    Every control belongs to exactly one zone. Home hides the top bar so the build fills the screen. The Design
    deck uses Figma's frame (rule 32).
28. **Two sidebars at most.** The nav and the inspector, or in the Design deck, Figma's left and right panels.
    Nothing else becomes a sidebar, a dock or a docked strip. Anything that needs room opens as the next layer,
    never as another panel.
29. **Buttons don't move.** A control keeps its slot, size and place in every state: idle, working, hovered,
    selected, panel open.
    - A state change happens inside the button: the icon or label swaps, or a spinner replaces the icon.
    - Buttons have a fixed width, so "Build" becoming "Building…" moves nothing.
    - Within a screen, a slot control that doesn't apply right now is disabled, not removed. Rule 6 still
      decides which controls exist for a lens.
    - The inspector and sheets slide over the stage instead of shrinking it.
    - Toasts appear in their one spot and never push content.
    - Layout shift stays below 0.01.
30. **A word budget.** At rest, a screen shows at most 15 words of interface text: labels, placeholders and
    button text. Content doesn't count: build titles, maker names, page and layer names, values. In the Design
    deck, panel section names and property names count as content, as in Figma, but sentences don't.
31. **Borrow, don't invent.** Each screen follows one mature product that people already know (PATTERNS.md). We
    take its layout, tool order, gestures and shortcut keys, never its look: our icons, colours, fonts and art are
    our own. A new landmark screen gets an approved reference frame before it is built.
32. **The Design deck follows Figma.** It is the one room with a full toolset, and it follows Figma's layout and
    tools almost one to one:
    - the left panel: the logo menu, pages, layers;
    - the canvas, with the crew's cursors;
    - one bottom toolbar;
    - the right panel: the crew, Play and Share, plus the Design and Prototype tabs.

    Figma's shortcut keys work, and ⌘\ hides both panels. The full map is in PATTERNS.md.

## Checklist before any UI PR

- [ ] Each screen you touched fits rule 3's budget (count the visible actions at rest).
- [ ] No helper sentence is visible by default (rule 8).
- [ ] No `title=`, `data-tip` or tooltip anywhere (standing rule 1).
- [ ] Default screens are a headline, one input and one button (standing rule 2).
- [ ] No colour but black, graphite, white and `var(--accent)` (standing rule 3).
- [ ] It looks right in light and in dark; no hard-coded colour outside the tokens (standing rule 4).
- [ ] At most 15 words of interface text at rest (rule 30).
- [ ] The screen uses only the frame's zones; no new sidebar, dock or strip (rules 27 and 28).
- [ ] The nav and the primary button keep their place and size in every state (rule 29).
- [ ] The screen matches its approved reference frame, if it has one (rule 31).
- [ ] No new duplicate control; INVENTORY.md is updated with each new or moved control's layer and lens.
- [ ] SITEMAP.md is updated if you added a layer or moved a branch.
- [ ] Only kit components; checkboxes sit beside their labels.
- [ ] Every new panel closes with ×, Esc and an outside click; the logo and Esc take you home from every view.
- [ ] `node scripts/ui-check.mjs` passes (overlaps, clickability, closing, way home, no sideways scroll, and
      the checks PATTERNS.md lists as landed).
- [ ] `npm run --prefix tools/dev audit` passes: no new breadcrumb, axe, scroll, console or loading violation
      beyond `.ui-audit-known-violations.json` ([AUDIT.md](AUDIT.md)).
- [ ] `node scripts/ui-review.mjs` passes: the studio's own design review (`engine/review.mjs`) finds no real
      issue on the screens you touched.
- [ ] You looked at the 1280 and 768 screenshots yourself, and the PR shows before and after.
- [ ] You walked the main flow of each lens your change touches, end to end.
