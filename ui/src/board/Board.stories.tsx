// The board shell the Plan board and the brand sheet share: the dotted stage (drag to pan, wheel to scroll, ctrl/⌘ +
// wheel to zoom), sections of artboards, the selection frame, and the inspector only while something is selected.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Artboard, Board, Column, InspectorHead, Section } from './Board'

function Demo({ selected: start = null, toast = null }: { selected?: string | null, toast?: string | null }) {
  const [sel, setSel] = useState<string | null>(start)
  const ab = (id: string) => <Artboard key={id} id={id} selected={sel === id} onSelect={setSel} className="h-[118px] w-[210px] p-4 font-label uppercase">{id}</Artboard>
  return (
    <Board label="Board" selected={!!sel} onClear={() => setSel(null)} toast={toast}
      inspector={sel && <InspectorHead name={sel} onClose={() => setSel(null)} />}>
      <Column>
        <Section name="one" label="One">{['Cast', 'Story', 'Combat'].map(ab)}</Section>
        <Section name="two" label="Two">{['World', 'Look'].map(ab)}</Section>
      </Column>
    </Board>
  )
}

const meta = { component: Demo } satisfies Meta<typeof Demo>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const Selected: Story = { args: { selected: 'Story' } }
export const WithToast: Story = { args: { toast: 'Saved as template' } }
