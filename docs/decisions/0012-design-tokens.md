# 0012. The Studio's theme is design tokens, built with Style Dictionary

- Date: 2026-11-13
- Status: accepted

## Context

[PLANS.md](../PLANS.md) §5 lists design tokens in W3C format with Style Dictionary as one of the governance steps
before the move to Vite, React and TypeScript. The Studio's theme lived as hand-written CSS variables at the top of
`web/canvas.css`, with a few more in `web/home.css` and `web/studio.css`. The React and Tailwind theme will need
the same values from one source.

## Decision

*(our wording)*

- The Studio's own theme variables live in `tokens/studio.tokens.json` (dark, the default) and
  `tokens/studio.light.tokens.json` (only what light changes), in the W3C Design Tokens format.
- Style Dictionary (Apache-2.0, pinned to 5.8.0 in `tools/dev`, development only) builds them into
  `web/tokens.css` with `tools/dev/tokens.mjs`. The app loads that file first, before `canvas.css`.
- `web/tokens.css` is committed, so installing the plugin runs no build. CI's `tokens:check` fails if it isn't a
  fresh build of the token files.
- Every variable keeps its name and value. A token's CSS variable is its own name (`color.void` is `--void`), and
  the build runs no value transform, so `#F20000` stays `#F20000`. A reference (`{color.text}`) becomes
  `var(--text)`, so the light theme's `--text` still reaches `--accent`.
- Values the W3C format has no type for stay CSS strings, written as before: the rgb channels (`11 11 12`), the
  `rgb(var(--glass-rgb) / .03)` mixes, the font stacks, and the `var(--font-mono, …)` and `var(--font-sans, …)`
  fallbacks that let the Hermes dashboard's own fonts win (docs/engines/hermes-and-connections.md). Hex colours
  carry `$type: color`.

## Consequences

- To change the theme, edit the token files and run `npm run --prefix tools/dev tokens`. Never edit
  `web/tokens.css` by hand. `scripts/contrast.mjs` reads `web/tokens.css`.
- Not in this set yet:
  - Lock's variables (`brandTheme` in `engine/brand.mjs`: `--background`, `--foreground`, `--primary`, `--accent`,
    `--link`, the fonts, the radius). They are per-project values made at run time from the person's brand sheet,
    not the Studio's theme. Their names can become a token schema later.
  - The UI kit's `--ui-*` variables in `web/ui.css`. Each one is `var(--x, #fallback)`, and a W3C reference has no
    fallback. They are the semantic tier to add when the Tailwind theme is built.
  - `web/frame.html` and `web/wall.html` theme other documents (the designed sites and the Wall), not the Studio.
- The Tailwind theme can be one more Style Dictionary platform over the same files.
