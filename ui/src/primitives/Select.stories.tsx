import type { Meta, StoryObj } from '@storybook/react-vite'
import { Select } from './Select'

const ROLES = ['logo', 'product', 'photo', 'font', 'pack', 'other'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }))

const meta = { component: Select, args: { label: 'Role', options: ROLES } } satisfies Meta<typeof Select>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Picked: Story = { args: { defaultSelectedKey: 'photo' } }
export const Disabled: Story = { args: { defaultSelectedKey: 'logo', isDisabled: true } }
