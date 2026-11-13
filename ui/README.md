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
| `src/pet/` | Hermia's cursor (`web/pet.js`, as `@studio/pet`), wrapped and started once by the frame: never start another |
| `src/api.ts` | `get` and `post` to the plugin's API, with the token |
| `src/board/` | the board shell the brand sheet and the Plan board share (`web/board.js`'s job): `Board`, `Section`, `Artboard`, `useToast` |
| `src/primitives/` | the kit on React Aria: Button, Menu, Dialog, TextField, each with stories |
| `src/screens/` | the screens, by the machine's room, named from OBJECTS.md; `SCREENS` lists the ones that moved. `brand/` is the first, and the pattern |
| `src/shell/` | the frame: the top bar, and `useTopBar()`, through which a screen gives its breadcrumb and its one primary |
| `src/theme.css` | generated: the Tailwind theme from `tokens/` (never edit it) |
| `dist/` | generated and committed: what `/next/` serves |

Utilities use the Studio's tokens only: `bg-void`, `text-muted`, `border-edge`, `font-label`, `font-display`,
`font-monospace`. Tailwind's own colours and fonts don't exist here. A screen whose look lives in the current Studio's
stylesheets may port that CSS beside it with the same class names, tokens only (`board/board.css`, `screens/brand/brand.css`):
it keeps parity exact, and the DOM hooks below keep working.

## Moving one screen

Read [AGENTS.md](../AGENTS.md)'s list for anything a person sees (RULES, PATTERNS, AUDIENCE, INVENTORY,
SITEMAP, REQUIREMENTS) first, and the screen's spec in `docs/specs/`.

1. **It has an address.** `/next/` opens a screen from its address alone. A screen the current Studio only opens
   from another one (the brand sheet did) first gets an address in `web/nav.js` (`toAddress`, `fromAddress`, a test in
   `tests/nav.test.mjs`), and the current Studio learns to reopen it on a reload (`web/next.js`: `web/studio.js` is at
   the untyped-lines cap, so add nothing there).
2. **The gates pass before.** Run the audit gates ([docs/ux/AUDIT.md](../docs/ux/AUDIT.md)) and keep the screen's
   entries from `.ui-audit-known-violations.json`. The screen moves as it is: no redesign in the same PR.
3. **One component per object, by its OBJECTS.md name.** `src/screens/Overview.tsx` for the Overview, not
   `Project.tsx`. Its parts take OBJECTS.md's names too (a `VersionTile`, a `BrandSheet`). A name OBJECTS.md marks
   **Open** is settled with the owner before the port, not in it.
4. **A container and a view.** The screen (`BrandSheet.tsx`) reads the machine and the API and hands a pure view
   (`BrandBoard.tsx`) what to draw and what to call. The view's stories need no server.
5. **Its state comes from the machine.** Read where the person is with `useNav().view` (`room`, `project`,
   `version`, `run`, `player`, `page`…) and move with `useNav().go({ type: … })`, the events of spec 34. Keep no
   copy of the project, version or room in component state, a store or `localStorage`. A move the machine refuses
   is logged and not drawn. Data from the server comes through `src/api.ts`. The breadcrumb and the one primary
   action go in the top bar with `useTopBar({ crumb, primary })`, ported as they are today, never redrawn in the
   screen.
6. **Keep the hooks the Studio's other code reads.** Hermia's cursor and the audit gates read the DOM: artboards are
   `.ab[data-key]` (use `board/Artboard`), sections `[data-sec]`, the inspector `.pj-insp`, a skeleton's crew cursor
   `.cur[data-n]`, a loading area `aria-busy="true"`, the breadcrumb `nav[aria-label="Breadcrumb"]`.
7. **Built from the primitives.** Buttons, menus, dialogs and fields come from `src/primitives/`; a control the kit
   lacks is added there first, on React Aria, with its story.
8. **A story per state worth seeing,** on the view, from fixtures in the routes' own answer shape
   (`screens/brand/BrandBoard.stories.tsx`): loading, full, each part in the inspector, locked. A story that needs
   the frame starts the real machine at an address (`src/App.stories.tsx`). These are the Storybook
   mock-ups, one of the six design artifacts.
9. **List it.** Add the component to `SCREENS` in `src/screens/index.ts`. Until it is there, `/next/` shows the
   screen's name and a button to the current Studio at the same address.
10. **The gates pass after**, on `/next/` at the same addresses: give the screen its `address` and a `nextReady`
   selector in `tools/dev/audit/audit.spec.mjs` and run `AUDIT_APP=next npm run --prefix tools/dev audit:update`.
   Its entries in `.ui-audit-known-violations.next.json` may be fewer than step 1's, never more: add the screen to
   the parity test in `tests/next.test.mjs`. Run
   `typecheck:ui`, `deps:ui`, `npm run --prefix ui build` and `ui:check`, and commit `ui/dist/`.
11. **Leave the current screen as it is.** It stays, and stays what people see, until the owner switches the room on
    ([decision 0018](../docs/decisions/0018-switching-on-a-ported-screen.md): one line in `server/next.mjs`'s
    `LIVE`, in its own PR). Retiring it is another PR again. Update INVENTORY.md if a control moved.
