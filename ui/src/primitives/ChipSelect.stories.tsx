import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChipSelect } from './ChipSelect'

const AGENTS = [4, 5, 6, 8, 12, 16, 20, 24].map(n => ({ id: String(n), label: `${n} agents` }))

function Picker() {
  const [v, setV] = useState('8')
  return <div className="pt-80"><ChipSelect name="Agents" options={AGENTS} value={v} onChange={setV} /></div>
}

const meta = { component: Picker } satisfies Meta<typeof Picker>
export default meta

export const Agents: StoryObj<typeof meta> = {}
