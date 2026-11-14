// The Setup sheet in each state worth seeing: one story per layer of the statechart's #projects.setup (index,
// parts, group, part) and per state a row draws differently (waiting, testing, failed, signing in). The server is
// fixtures.ts; nothing in it is a key.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SetupSheet } from './SetupSheet'
import { TEST_FAILED, VIEW } from './fixtures'
import { HOLD, stubApi } from './stub'

const meta = {
  component: SetupSheet,
  args: { row: '', onClose: () => {}, onModels: () => {} },
  parameters: { api: {} },
  decorators: [(Story, { parameters }) => { stubApi(parameters.api); return <Story /> }]
} satisfies Meta<typeof SetupSheet>
export default meta
type Story = StoryObj<typeof meta>

// the first time Projects shows: every row has its default, Start works at once
export const FirstRun: Story = { parameters: { api: { 'GET /api/setup': { ...VIEW, seen: false, account: {} } } } }
export const Loading: Story = { parameters: { api: { 'GET /api/setup': HOLD } } }
export const Testing: Story = { args: { row: 'models' }, parameters: { api: { 'POST /api/setup/models': HOLD } } }
export const ModelPicker: Story = { args: { row: 'models' } }
export const ModelsFailing: Story = { parameters: { api: { 'GET /api/setup': { ...VIEW, test: TEST_FAILED, modelsOk: false }, 'POST /api/setup/models': TEST_FAILED } } }
export const SigningIn: Story = { args: { row: 'account' }, parameters: { api: { 'GET /api/setup': { ...VIEW, account: { pending: { code: 'WXYZ-1234' } } } } } }
export const PaintedNotReady: Story = { args: { row: 'pictures' }, parameters: { api: { 'GET /api/setup': { ...VIEW, pictures: { mode: 'painted', painted: { ready: false, error: 'No image model is signed in.' } } } } } }
export const Parts: Story = { args: { row: 'parts' } }
export const PartsChecking: Story = { args: { row: 'parts', group: 'every' }, parameters: { api: { 'GET /api/hermes': HOLD, 'GET /api/setup/parts': HOLD } } }
export const Group: Story = { args: { row: 'parts', group: 'app' } }
// a part that failed: the reason once it is open, then its one fix
export const PartFailed: Story = { args: { row: 'parts', group: 'app', part: 'stripe' } }
// a key's fix is the command with <your key> in it, run in Hermes
export const PartKey: Story = { args: { row: 'parts', group: 'game', part: 'meshy' } }
// a connector is added only after a yes to the exact command
export const PartConnect: Story = { args: { row: 'parts', group: 'app', part: 'supabase' } }
