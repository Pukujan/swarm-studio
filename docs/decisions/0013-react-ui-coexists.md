# 0013. The next UI is React, served beside the current Studio at /next/

- Date: 2026-11-13
- Status: accepted

## Context

[PLANS.md](../PLANS.md) §5 decided the move to Vite, React and TypeScript and deferred it until the flows were
designed. The owner said on 2026-11-13 to start it once the prerequisites merged: the object map
([OBJECTS.md](../ux/OBJECTS.md)), the statechart ([docs/ux/statechart/](../ux/statechart/README.md)) and the design
tokens ([0012](0012-design-tokens.md)). Issue #404.

Three constraints shape how:

- Installing the plugin builds nothing and downloads nothing ([AGENTS.md](../../AGENTS.md), the Nous catalog
  rules).
- The Desktop pane's frame has an opaque origin and cannot import a module, so the plugin's server inlines the
  current Studio into one document (`server/page.mjs`).
- Screens move one at a time, and the current Studio keeps working unchanged while they do.

## Decision

*(our wording)*

- **Where it lives.** `ui/` is a Vite + React 19 + TypeScript (strict) app with its own `package.json`, development
  only, every version exact. Its build, `ui/dist/`, is committed. Fixed file names, no hashes, no source maps, so
  the same source builds the same bytes. CI's `ui:check` rebuilds it and fails if a byte differs.
- **How it is served.** The plugin's own server serves it at **`/next/`** (`server/next.mjs`). Like `/`, it is one
  document: the script and styles go inline and the token goes in at serve time, never into `ui/dist/`. Nothing is
  built, fetched or installed for it on the person's machine. A plugin without `ui/dist/` answers 404 there and is
  otherwise unchanged. The hosted studio does not serve `/next/` yet.
- **Where the person is.** The current Studio's navigation machine, `web/nav.js` (spec 34), imported, not copied.
  The UI reaches it as `@studio/nav`, typed by `ui/src/nav/studio-nav.d.ts`. Vite resolves `@studio/nav` to
  `web/nav.js`. Its import of the vendored XState resolves to the same version from npm. So both apps run one
  machine on one library and read and write the same address: `/next/?project=…&version=…&room=deck` and
  `/?project=…&version=…&room=deck` are the same place. The push-or-replace rule for history lives inside
  `web/studio.js`'s controller, so `ui/src/nav/address.ts` restates it; `tests/next.test.mjs` fails if the two
  differ. When the owner approves the designed statechart's names, they replace `web/nav.js`'s in both apps at
  once.
- **Theme.** Style Dictionary builds one more output from the same tokens: `ui/src/theme.css`, a Tailwind v4
  theme in which every utility reads the token's own variable (`bg-void` is `var(--void)`), so the light theme and
  the Hermes host's fonts still reach it. Tailwind's own colours and fonts are cleared. `font.mono` is
  `font-monospace`, because Tailwind would write `--font-mono` onto the page and the tokens read the host's
  `--font-mono`. The UI loads `web/tokens.css` for the variables themselves.
- **Primitives.** React Aria Components (Apache-2.0) under the kit's names: Button, Menu, Dialog, TextField, in
  `ui/src/primitives/`, each with stories. Storybook (MIT, pinned, telemetry off) holds the primitives' stories
  now and each moved screen's mock-up later.
- **Checks.** `tools/dev` gains `typecheck:ui` (TypeScript 7, strict), `deps:ui` (dependency-cruiser with swc,
  because TypeScript 7 has no compiler API for it) and `ui:check`; CI runs them and builds Storybook. `check.sh`
  asks `/next/` for one document with its token.

### How a screen moves

1. The audit gates ([AUDIT.md](../ux/AUDIT.md)) pass on the screen in the current Studio. CI runs them on `/`
   and, with `AUDIT_APP=next`, on `/next/` at the same addresses, each against its own known list.
2. A component named for the screen's object in OBJECTS.md goes in `ui/src/screens/`, with a story that starts the
   machine at the screen's address. It reads the view with `useNav()` and moves with `go()`; it keeps no copy of
   where the person is.
3. It goes in `SCREENS` in `ui/src/screens/index.ts`. Until then `/next/` shows the screen's name and a button to
   the current Studio at the same address.
4. The same audit gates pass on `/next/`, with no violation the current Studio's screen doesn't have. `ui/dist/`
   is rebuilt and committed.
5. Once every screen has moved, `/` serves the new UI and `web/`'s screens retire, in a PR of their own.

[ui/README.md](../../ui/README.md) is the recipe in full.

## Consequences

- The current Studio is untouched: `/` and every file in `web/` stay as they are. Fixes to a screen that has not
  moved still land in `web/`. A screen that has moved and then changes in `web/` is ported again.
- Each port commits a rebuilt `ui/dist/` (about 390 KB of script today, 123 KB gzipped). It goes into the page
  inline, only at `/next/`.
- `ui/node_modules` is a developer's install (Vite, Storybook, Tailwind's native parts, swc). None of it is in the
  plugin or on the person's machine.
- The README's "What it does on your machine" names the libraries in `ui/dist/` and says nothing is downloaded for
  them.
