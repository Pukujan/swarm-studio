// Every story is drawn on the Studio's own page: its tokens, fonts and theme (src/app.css), dark unless the
// toolbar picks light (the same data-theme the ☰ menu sets)
import type { Preview } from '@storybook/react-vite'
import '../src/app.css'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Light or dark',
      toolbar: { title: 'Theme', items: ['dark', 'light'], dynamicTitle: true }
    }
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, { globals }) => {
      document.documentElement.dataset.theme = globals.theme === 'light' ? 'light' : 'dark'
      return <div className="bg-bg p-6 text-text"><Story /></div>
    }
  ],
  parameters: { layout: 'fullscreen' }
}

export default preview
