import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ToggleGroup } from './ToggleGroup'

const ITEMS = [{ k: 'auto', label: 'Auto' }, { k: 'on', label: 'On' }, { k: 'off', label: 'Off' }] as const
type K = typeof ITEMS[number]['k']

function Lite({ start }: { start: K }) {
  const [v, set] = useState<K>(start)
  return <div className="max-w-md"><ToggleGroup label="Lite mode" items={ITEMS} value={v} onChange={set} /></div>
}

const meta = { component: Lite, args: { start: 'auto' } } satisfies Meta<typeof Lite>
export default meta
type Story = StoryObj<typeof meta>

export const Auto: Story = {}
export const On: Story = { args: { start: 'on' } }
