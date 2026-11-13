// The next UI's build (docs/decisions/0013-react-ui-coexists.md). `npm run build` writes ui/dist/, which is
// committed: the plugin's server serves it at /next/ with the script and styles inlined (server/next.mjs), so
// installing the plugin builds nothing. File names are fixed and nothing is hashed or mapped, so the same source
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
  // Hermia's cursor (web/pet.js, spec 41) and the line icons and crew names (web/icons.js), the same files the
  // current Studio runs: src/pet/ and src/primitives/Icon.tsx reach them, typed by their .d.ts
  { find: '@studio/pet', replacement: fileURLToPath(new URL('../web/pet.js', import.meta.url)) },
  { find: '@studio/icons', replacement: fileURLToPath(new URL('../web/icons.js', import.meta.url)) },
  { find: '@studio/crew', replacement: fileURLToPath(new URL('../web/crew.js', import.meta.url)) },
  // by path: a bare 'xstate' would be looked up from web/, which has no node_modules
  { find: /^(\.\.?\/)+vendor\/xstate\/xstate\.mjs$/, replacement: fileURLToPath(import.meta.resolve('xstate')) }
]

export default defineConfig({
  base: '/next/',
  plugins: [
    react(),
    tailwindcss(),
    // the page is written with \n on every machine: a Windows checkout's index.html has \r\n, and Vite's own tags
    // go in with \n, so ui/dist/index.html would differ between a Windows build and CI's
    { name: 'swarm:lf', transformIndexHtml: { order: 'post', handler: html => html.replace(/\r\n?/g, '\n') } }
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
