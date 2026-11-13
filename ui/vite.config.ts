// The next UI's build (docs/decisions/0013-react-ui-coexists.md). `npm run build` writes ui/dist/, which CI builds on
// every branch and only a release commits (docs/decisions/0018-next-ui-build-on-release.md): the plugin's server serves
// it at /next/ with the script and styles inlined (server/next.mjs), so installing the plugin builds nothing. File names are fixed and nothing is hashed or mapped, so the same source
// builds the same bytes (`npm run check` compares them).
import { fileURLToPath } from 'node:url'
import { defineConfig, type AliasOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repo = fileURLToPath(new URL('..', import.meta.url))

// Shared with .storybook/main.ts. The current Studio's navigation machine, imported, not copied (src/nav/nav.ts);
// it imports the vendored XState (web/vendor/xstate/), which here is the same version from npm, pinned in
// package.json (tests/next.test.mjs checks the two agree), so both apps run one machine on one library.
export const alias: AliasOptions = [
  { find: '@studio/nav', replacement: fileURLToPath(new URL('../web/nav.js', import.meta.url)) },
  // Setup › Parts: the current Studio's table of parts (src/screens/setup/studio-setup-parts.d.ts types it)
  { find: '@studio/setup-parts', replacement: fileURLToPath(new URL('../web/setup-parts.js', import.meta.url)) },
  // the Studio's kits (spec 37: web/kit-*.js, listed by web/kits.js) and Hermia's cursor (spec 41, web/pet.js), hosted
  // as they are, not rewritten (src/legacy/)
  { find: '@studio/kits', replacement: fileURLToPath(new URL('../web/kits.js', import.meta.url)) },
  { find: '@studio/pet', replacement: fileURLToPath(new URL('../web/pet.js', import.meta.url)) },
  // the line icons and crew names (web/icons.js) and the crew's marks (web/crew.js), the same files the current
  // Studio runs: src/primitives/Icon.tsx and src/screens/deck/ reach them, typed by their .d.ts
  { find: '@studio/icons', replacement: fileURLToPath(new URL('../web/icons.js', import.meta.url)) },
  { find: '@studio/crew', replacement: fileURLToPath(new URL('../web/crew.js', import.meta.url)) },
  // by path: a bare 'xstate' would be looked up from web/, which has no node_modules
  { find: /^(\.\.?\/)+vendor\/xstate\/xstate\.mjs$/, replacement: fileURLToPath(import.meta.resolve('xstate')) },
  // the sanitiser the current deck runs on every section before a frame shows it (web/clean.js): the Design deck's
  // frames get the same HTML (src/screens/deck/)
  { find: '@studio/clean', replacement: fileURLToPath(new URL('../web/clean.js', import.meta.url)) },
  // the board video rules (web/video.js): posters, preload, teardown and the page's budget of playing clips, one
  // copy for both apps (src/primitives/BoardVideo.tsx)
  { find: '@studio/video', replacement: fileURLToPath(new URL('../web/video.js', import.meta.url)) },
  // Open Design's Edit, ported (web/edit/patches.js, decision 0010): one part of a finished section changed by hand
  { find: '@studio/edit', replacement: fileURLToPath(new URL('../web/edit/patches.js', import.meta.url)) }
]

export default defineConfig({
  base: '/next/',
  plugins: [
    react(),
    tailwindcss(),
    // the page is written with \n on every machine: a Windows checkout's index.html has \r\n, and Vite's own tags
    // go in with \n, so ui/dist/index.html would differ between a Windows build and CI's
    { name: 'swarm:lf', transformIndexHtml: { order: 'post', handler: html => html.replace(/\r\n?/g, '\n') } },
    // the current Studio's stylesheets that src/legacy/ hosts load their fonts relative to web/; here they come from
    // the server's /fonts/, as src/fonts.css's do, never copied into ui/dist/
    { name: 'swarm:web-fonts', enforce: 'pre', transform: (code, id) => (/[\\/]web[\\/][^\\/]+\.css$/.test(id) ? code.replace(/url\(\s*['"]?fonts\//g, 'url(/fonts/') : null) }
  ],
  resolve: { alias },
  // web/nav.js and web/tokens.css live outside ui/
  server: { fs: { allow: [repo] }, port: 5317, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    rolldownOptions: {
      output: { entryFileNames: 'assets/next.js', assetFileNames: 'assets/next[extname]' }
    }
  }
})
