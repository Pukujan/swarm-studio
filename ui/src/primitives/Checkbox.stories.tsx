import type { Meta, StoryObj } from '@storybook/react-vite'
import { Checkbox } from './Checkbox'

const meta = { component: Checkbox, args: { children: 'Lock style' } } satisfies Meta<typeof Checkbox>
export default meta
type Story = StoryObj<typeof meta>

export const Off: Story = {}
export const On: Story = { args: { defaultSelected: true } }
export const Disabled: Story = { args: { isDisabled: true, children: 'Part of this template', defaultSelected: true } }
