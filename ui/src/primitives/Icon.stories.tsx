import type { Meta, StoryObj } from '@storybook/react-vite'
import { Icon } from './Icon'

const meta = { component: Icon, args: { name: 'plus' } } satisfies Meta<typeof Icon>
export default meta
type Story = StoryObj<typeof meta>

export const Plus: Story = {}
export const Close: Story = { args: { name: 'x' } }
export const Large: Story = { args: { name: 'box', size: 32 } }
