import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChipSelect, Select } from './Select'

const ROLES = ['logo', 'product', 'photo', 'font', 'pack', 'other'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }))
const AGENTS = [4, 5, 6, 8, 12, 16, 20, 24].map(n => ({ id: String(n), label: `${n} agents` }))

const meta = { component: Select, args: { label: 'Role', options: ROLES } } satisfies Meta<typeof Select>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Picked: Story = { args: { defaultSelectedKey: 'photo' } }
export const Disabled: Story = { args: { defaultSelectedKey: 'logo', isDisabled: true } }

function Agents() {
  const [v, setV] = useState('8')
  return <div className="pt-80"><ChipSelect name="Agents" options={AGENTS} value={v} onChange={setV} /></div>
}
export const Chip: Story = { render: () => <Agents /> }
