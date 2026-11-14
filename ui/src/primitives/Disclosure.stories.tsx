import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Busy } from './Busy'
import { Command } from './Command'
import { Disclosure } from './Disclosure'
import { SearchField } from './SearchField'

function Rows({ open }: { open: string }) {
  const [k, set] = useState(open)
  const toggle = (x: string) => () => set(k === x ? '' : x)
  return (
    <div className="max-w-md divide-y divide-edge overflow-hidden rounded-[12px] border border-edge">
      <Disclosure name="Models" state={<><span className="truncate font-body text-[13px] normal-case tracking-normal text-muted">gpt-5</span><Busy label="Testing" /></>} isExpanded={k === 'models'} onToggle={toggle('models')}>
        <SearchField label="Search models" placeholder="Search models" />
      </Disclosure>
      <Disclosure name="Parts" state={<span className="font-body text-[13px] normal-case tracking-normal text-muted">14 of 22</span>} isExpanded={k === 'parts'} onToggle={toggle('parts')}>
        <Command cmd="hermes config set PEXELS_API_KEY <your key>" />
      </Disclosure>
    </div>
  )
}

const meta = { component: Rows, args: { open: '' } } satisfies Meta<typeof Rows>
export default meta
type Story = StoryObj<typeof meta>

export const Shut: Story = {}
export const Open: Story = { args: { open: 'parts' } }
