// Layers as each canvas hands it groups: the Studio first's steps, a page's sections while the crew works, and empty.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Layers, type LayerGroup } from './Layers'

const STUDIO: LayerGroup[] = [
  { id: 'brand', title: 'Brand', state: 'started', rows: [{ key: 'brand:open', name: 'Brand sheet' }] },
  { id: 'references', title: 'References', state: 'done', rows: [{ key: 'ref:r1', name: 'Tartine bakery' }, { key: 'ref:r2', name: 'Morning light' }] },
  { id: 'assets', title: 'Assets', state: 'empty', rows: [] },
  { id: 'plan', title: 'Plan', state: 'started', rows: [{ key: 'page:0', name: 'Home' }, { key: 'page:1', name: 'Menu' }, { key: 'page:2', name: 'Visit' }] },
  { id: 'proposal', title: 'Lock', state: 'empty', rows: [{ key: 'lock:idea', name: 'Idea' }] }
]
const DECK: LayerGroup[] = [
  { id: 'home', title: 'Page 1 · Cedar Cafe', busy: true, rows: [{ key: 'home/hero', name: 'hero' }, { key: 'home/menu', name: 'menu', busy: true }, { key: 'home/footer', name: 'footer' }] },
  { id: 'visit', title: 'Page 2 · Visit', rows: [{ key: 'visit/hero', name: 'hero' }] }
]

function Live({ groups: start }: { groups: LayerGroup[] }) {
  const [groups, setGroups] = useState(start)
  const [sel, setSel] = useState<string | null>(null)
  const rename = (key: string, name: string) => setGroups(gs => gs.map(g => ({ ...g, rows: g.rows.map(r => (r.key === key ? { ...r, name } : r)) })))
  const remove = (key: string) => setGroups(gs => gs.map(g => ({ ...g, rows: g.rows.filter(r => r.key !== key) })))
  return (
    <div className="w-72 bg-void p-2">
      <Layers groups={groups} selected={sel} onSelect={setSel} canRename={k => k.startsWith('page:')} onRename={rename} canRemove={k => /^(ref|page):/.test(k)} onRemove={remove} />
    </div>
  )
}

const meta = { component: Live, args: { groups: STUDIO } } satisfies Meta<typeof Live>
export default meta
type Story = StoryObj<typeof meta>

export const StudioFirst: Story = {}
export const DesignDeckWhileBuilding: Story = { args: { groups: DECK } }
export const Empty: Story = { args: { groups: [] } }
