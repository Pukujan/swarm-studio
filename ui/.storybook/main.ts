// Storybook for the next UI: the kit's primitives and, as screens move, each screen's mock-up (one of the six design
// artifacts, docs/PLANS.md §5). Development only; nothing of it is committed or served by the plugin.
import type { StorybookConfig } from '@storybook/react-vite'
import { alias } from '../vite.config.ts'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // the Studio's fonts at the path the plugin's server gives them (src/fonts.css)
  staticDirs: [{ from: '../../web/fonts', to: '/fonts' }, { from: '../node_modules/mermaid/dist', to: '/next/vendor' }],
  viteFinal: async c => ({ ...c, resolve: { ...c.resolve, alias } })
}

export default config
