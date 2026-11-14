// Settings at each layer of the statechart's #me.settings: the index, You, Lite mode (Auto, On, Off) and Data.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingsSheet } from './SettingsSheet'
import { HOLD, stubApi } from './stub'

const meta = {
  component: SettingsSheet,
  args: { onClose: () => {}, onSetup: () => {} },
  parameters: { api: {} },
  decorators: [(Story, { parameters }) => { stubApi(parameters.api); return <Story /> }]
} satisfies Meta<typeof SettingsSheet>
export default meta
type Story = StoryObj<typeof meta>

export const Index: Story = {}
export const Waiting: Story = { parameters: { api: { 'GET /api/me': HOLD, 'GET /api/models': HOLD } } }
export const NotSignedIn: Story = { parameters: { api: { 'GET /api/me': { name: 'pat' } } } }
export const You: Story = { args: { at: 'you' } }
export const LiteAuto: Story = { args: { at: 'lite' } }
export const LiteOn: Story = { args: { at: 'lite' }, parameters: { api: { 'GET /api/models': { lite: true } } } }
export const Data: Story = { args: { at: 'data' } }
