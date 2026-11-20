import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComboField } from './ComboField'

const MODELS = ['openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'qwen/qwen3-coder']

const meta = { component: ComboField, args: { label: 'Reviewer', value: '', options: MODELS, placeholder: 'model id', onCommit: () => {} } } satisfies Meta<typeof ComboField>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Picked: Story = { args: { value: 'openai/gpt-4o' } }
// a name the list does not have is still an answer
export const Typed: Story = { args: { value: 'my-own/model-1' } }
export const NoList: Story = { args: { options: [] } }
export const Disabled: Story = { args: { isDisabled: true, placeholder: 'off' } }
