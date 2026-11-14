// The brand sheet's mock-ups: every state it draws differently, from the routes' own answer shape (fixtures.ts).
// Picks and edits apply to the story's copy, so the cards and the inspector can be tried without a server.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { BrandBoard } from './BrandBoard'
import { PACKS, SHEET, WITH_PACK } from './fixtures'
import type { Brand, BrandActions, BrandPack } from './types'

function Live({ brand: start, packs = PACKS, busy = false, sel: firstSel = null }: { brand: Brand | null, packs?: BrandPack[], busy?: boolean, sel?: string | null }) {
  const [brand, setBrand] = useState(start)
  const [sel, setSel] = useState(firstSel)
  const change = (fn: (b: Brand) => Brand) => { setBrand(b => (b ? fn(b) : b)); return Promise.resolve() }
  const actions: BrandActions = {
    pick: p => change(b => p.part === 'pack' ? { ...WITH_PACK, pick: b.pick } : 'id' in p ? { ...b, pick: { ...b.pick, [p.part]: p.id }, lockedAt: null } : b),
    edit: e => change(b => e.part === 'story' ? { ...b, story: { ...b.story, ...e.values }, lockedAt: null }
      : e.part === 'palette' ? { ...b, palettes: b.palettes.map(x => (x.id === e.id ? { ...x, ...e.values } : x)), lockedAt: null }
        : { ...b, types: b.types.map(x => (x.id === e.id ? { ...x, ...e.values } : x)), lockedAt: null }),
    lock: () => change(b => ({ ...b, lockedAt: Date.now() })),
    unlock: () => change(b => ({ ...b, lockedAt: null }))
  }
  return <div className="h-[calc(100dvh-3.5rem)]"><BrandBoard brand={brand} packs={packs} busy={busy} sel={sel} onSelect={setSel} actions={actions} /></div>
}

const meta = { component: Live, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Live>
export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = { args: { brand: null, busy: true } }
export const Options: Story = { args: { brand: SHEET } }
export const PackTaken: Story = { args: { brand: WITH_PACK } }
export const PaletteInInspector: Story = { args: { brand: SHEET, sel: 'palette:p1' } }
export const StoryInInspector: Story = { args: { brand: SHEET, sel: 'story:what' } }
export const PackInInspector: Story = { args: { brand: SHEET, sel: 'pack:warm-editorial' } }
export const Locked: Story = { args: { brand: { ...SHEET, lockedAt: 1 } } }
