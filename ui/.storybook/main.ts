// Storybook for the next UI: the kit's primitives and, as screens move, each screen's mock-up (one of the six design
// artifacts, docs/PLANS.md §5). Development only; nothing of it is committed or served by the plugin.
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'
import { alias } from '../vite.config.ts'

// web/nav.js's vendored XState is the npm one here (vite.config.ts). Node resolves it to xstate.cjs.mjs, a wrapper
// over the CommonJS build that Storybook's dev server serves unconverted (no export named Actor), so the stories
// that start the machine take XState's own ES module instead. The app's build is unchanged.
const xstate = fileURLToPath(new URL('../node_modules/xstate/dist/xstate.esm.js', import.meta.url))
const storyAlias = alias.map(a => (String(a.find).includes('xstate') ? { ...a, replacement: xstate } : a))

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // the Studio's fonts at the path the plugin's server gives them (src/fonts.css)
  staticDirs: [{ from: '../../web/fonts', to: '/fonts' }, { from: '../node_modules/mermaid/dist', to: '/next/vendor' }],
  viteFinal: async c => ({ ...c, resolve: { ...c.resolve, alias: storyAlias } })
}

export default config
