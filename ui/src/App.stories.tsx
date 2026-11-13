// The frame in a few of the machine's states. A story starts the real machine at an address (the same address the
// Studio would have), so a story is a place the person can actually be, never a state drawn by hand.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from './App'
import { makeNav } from './nav/nav'
import { NavProvider } from './nav/NavProvider'
import { SheetsProvider } from './screens/setup/Sheets'

const meta = {
  component: App,
  parameters: { address: '' },
  decorators: [(Story, { parameters }) => <NavProvider nav={makeNav({ search: parameters.address })}><SheetsProvider first={false}><Story /></SheetsProvider></NavProvider>]
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const Projects: Story = {}
export const Overview: Story = { parameters: { address: '?project=p-ants&version=r-ants-2' } }
export const DesignDeck: Story = { parameters: { address: '?project=p-ants&version=r-ants-2&room=deck' } }
export const PlanBoard: Story = { parameters: { address: '?room=plan&plan=p-ants' } }
export const StudioScaffold: Story = { parameters: { address: '?room=studio&project=p-ants&step=assets' } }
