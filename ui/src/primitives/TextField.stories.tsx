import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextField } from './TextField'

const meta = { component: TextField, args: { label: 'Name', placeholder: 'A climbing gym in Cornwall' } } satisfies Meta<typeof TextField>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Filled: Story = { args: { defaultValue: 'Army of Ants' } }
export const Invalid: Story = { args: { isRequired: true, isInvalid: true, validationBehavior: 'aria', errorMessage: 'Needs a name' } }
