# The next UI

The Studio, moving to Vite, React 19, TypeScript (strict), XState and React Aria one screen at a time
([decision 0013](../docs/decisions/0013-react-ui-coexists.md), issue #404). The plugin's server serves the
committed build, `ui/dist/`, at **`/next/`**, beside the current Studio at `/`. Installing the plugin builds and
downloads nothing for it.

## Work on it

```bash
npm ci --prefix ui
```

| Command | What it does |
|---|---|
| `npm run --prefix ui dev` | Vite on `127.0.0.1:5317/next/`, with no server behind it (no API, no token). Stop it when done |
| `npm run --prefix ui build` | writes `ui/dist/`; commit it with the change |
| `npm run --prefix ui storybook` | Storybook on port 6006. Stop it when done |
| `npm run --prefix tools/dev typecheck:ui` | the strict type check |
| `npm run --prefix tools/dev deps:ui` | the dependency rules (`ui/.dependency-cruiser.cjs`) |
| `npm run --prefix tools/dev ui:check` | fails if `ui/dist/` is not what the source builds |
| `npm run --prefix tools/dev tokens` | rebuilds `web/tokens.css` and `src/theme.css` from `tokens/` |

To see it as the person will, start the plugin's server and open `http://127.0.0.1:4319/next/`.

## What is where

| Path | What |
|---|---|
| `src/nav/` | the current Studio's machine (`web/nav.js`, as `@studio/nav`), `useNav()`, and the address |
| `src/primitives/` | the kit on React Aria: Button, Menu, Dialog, TextField, each with stories |
| `src/screens/` | the screens, by the machine's room, named from OBJECTS.md; `SCREENS` lists the ones that moved |
| `src/shell/` | the frame: the top bar, and `useTrail()`, which a screen uses to give it the build's name and its one action |
| `src/shared/` | parts several screens use, each with stories: `Layers` (the canvas's left panel) |
| `src/legacy/` | the current Studio's pieces hosted as they are until they move: the kits (`@studio/kits`), Hermia's cursor (`@studio/pet`) and the stylesheets they draw with |
| `src/theme.css` | generated: the Tailwind theme from `tokens/` (never edit it) |
| `dist/` | generated and committed: what `/next/` serves |

Utilities use the Studio's tokens only: `bg-void`, `text-muted`, `border-edge`, `font-label`, `font-display`,
`font-monospace`. Tailwind's own colours and fonts don't exist here.

## Moving one screen

Read [AGENTS.md](../AGENTS.md)'s list for anything a person sees (RULES, PATTERNS, AUDIENCE, INVENTORY,
SITEMAP, REQUIREMENTS) first, and the screen's spec in `docs/specs/`.

1. **The gates pass before.** Run the audit gates ([docs/ux/AUDIT.md](../docs/ux/AUDIT.md)) and keep the screen's
   entries from `.ui-audit-known-violations.json`. The screen moves as it is: no redesign in the same PR.
2. **One component per object, by its OBJECTS.md name.** `src/screens/Overview.tsx` for the Overview, not
   `Project.tsx`. Its parts take OBJECTS.md's names too (a `VersionTile`, a `BrandSheet`). A name OBJECTS.md marks
   **Open** is settled with the owner before the port, not in it.
3. **Its state comes from the machine.** Read where the person is with `useNav().view` (`room`, `project`,
   `version`, `run`, `player`, `page`…) and move with `useNav().go({ type: … })`, the events of spec 34. Keep no
   copy of the project, version or room in component state, a store or `localStorage`. A move the machine refuses
   is logged and not drawn. Data from the server is fetched with the token in `window.SWARM.token`.
4. **Built from the primitives.** Buttons, menus, dialogs and fields come from `src/primitives/`; a control the kit
   lacks is added there first, on React Aria, with its story.
5. **A story per state worth seeing.** `src/screens/Overview.stories.tsx` starts the real machine at an address
   (`makeNav({ search: '?project=…&version=…' })` in a `NavProvider`, as `src/App.stories.tsx` does), plus a
   story for each state the screen draws differently (empty, loading, error, full). These are the Storybook
   mock-ups, one of the six design artifacts.
6. **List it.** Add the component to `SCREENS` in `src/screens/index.ts`. Until it is there, `/next/` shows the
   screen's name and a button to the current Studio at the same address.
7. **The gates pass after**, on `/next/` at the same addresses: give the screen a `nextReady` selector in
   `tools/dev/audit/audit.spec.mjs` and run `AUDIT_APP=next npm run --prefix tools/dev audit:update`. Its entries in
   `.ui-audit-known-violations.next.json` may be fewer than step 1's, never more. Run
   `typecheck:ui`, `deps:ui`, `npm run --prefix ui build` and `ui:check`, and commit `ui/dist/`.
8. **Leave `web/` alone.** The current screen stays until every screen has moved; retiring `web/` is its own PR.
   Update INVENTORY.md if a control moved.
