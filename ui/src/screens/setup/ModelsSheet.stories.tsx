// Models in each state worth seeing: under Hermes (the planner and builders are Hermes's, with Change), with no
// model set, outside Hermes (every role typed or picked), the reviewer off, waiting, the server not answering
// and a pick it refused. A model that does not answer is shown where Change leads: Setup's Models row
// (SetupSheet.stories.tsx, ModelsFailing). The server is fixtures.ts; nothing in it is a key.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ModelsSheet } from './ModelsSheet'
import { OPTIONS } from './fixtures'
import { HOLD, stubApi } from './stub'

const TEXT = ['openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'qwen/qwen3-coder']
const VISION = ['openai/gpt-5', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash']
const IMAGE = { pick: null, providers: [{ provider: 'openai-codex', models: ['gpt-image-2-low', 'gpt-image-2-medium'], available: true }, { provider: 'fal', models: [], default: 'flux-2', available: false }] }
const MODELS = {
  roles: {
    planner: { model: 'planner', hermes: 'openai/gpt-5', host: 'api.openai.com', picked: null },
    worker: { model: 'worker', hermes: 'openai/gpt-5-mini', host: 'api.openai.com', picked: null },
    reviewer: { model: 'openai/gpt-4o', hermes: 'openai/gpt-4o', host: 'api.openai.com', picked: null }
  },
  text: TEXT, vision: VISION, lite: null, image: IMAGE
}
const NO_ROLE = { model: '', hermes: '', host: '', picked: null }

const meta = {
  component: ModelsSheet,
  args: { onClose: () => {}, onSetup: () => {} },
  parameters: { api: { 'GET /api/models': MODELS } },
  decorators: [(Story, { parameters }) => { stubApi(parameters.api); return <Story /> }]
} satisfies Meta<typeof ModelsSheet>
export default meta
type Story = StoryObj<typeof meta>

export const UnderHermes: Story = {}
// Hermes answers but no model is set for any role: None, and Change leads to the picker
export const NoModel: Story = {
  parameters: { api: { 'GET /api/models': { ...MODELS, roles: { planner: NO_ROLE, worker: NO_ROLE, reviewer: NO_ROLE }, vision: [], image: { pick: null, providers: [] } }, 'GET /api/setup/models/options': { ...OPTIONS, slots: {}, main: undefined } } }
}
// Hermes's list did not answer: each role is a model id, typed or picked
export const OutsideHermes: Story = {
  parameters: { api: { 'GET /api/models': { ...MODELS, roles: { ...MODELS.roles, worker: { ...MODELS.roles.worker, picked: 'qwen/qwen3-coder' } } }, 'GET /api/setup/models/options': { ok: false, message: 'Hermes did not answer.', providers: [] } } }
}
export const ReviewerOff: Story = { parameters: { api: { 'GET /api/models': { ...MODELS, roles: { ...MODELS.roles, reviewer: { ...MODELS.roles.reviewer, picked: 'off' } }, image: { ...IMAGE, pick: 'off' }, lite: true } } } }
export const Loading: Story = { parameters: { api: { 'GET /api/models': HOLD } } }
export const NotAnswering: Story = { parameters: { api: { 'GET /api/models': undefined } } }
// the server refused a pick (change Lite mode to see it): one line, and the rows read again
export const PickRefused: Story = { parameters: { api: { 'GET /api/models': MODELS, 'POST /api/models': { error: 'bad pick' } } } }
