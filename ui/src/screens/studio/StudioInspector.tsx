// The inspector, on the right while something is selected (web/scaffold.js renderInsp): a step's Skip / Bring back
// and Remove, a reference's Use as given and Remove, an asset's Role, Use as reference and Remove, a take's Use this
// take and Mix, the idea in full. A kit's card brings its own controls (inspect(box, ctx)), drawn into the panel.
import { useLayoutEffect, useRef } from 'react'
import { Button } from '../../primitives/Button'
import { Select } from '../../primitives/Select'
import type { KitCard, KitCtx } from '../../legacy'
import { STEP_NAME, type Pack, type StudioData } from './useStudio'

const ROLES = ['logo', 'product', 'photo', 'font', 'pack', 'other'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }))

interface Props {
  sel: string
  d: StudioData
  card?: KitCard
  pack?: Pack
  ctx: () => KitCtx
  version: unknown
  onClose: () => void
  act: {
    skip(step: string, skipped: boolean): void
    removeStep(step: string): void
    refGiven(id: string): void
    removeRef(id: string): void
    assetRole(id: string, role: string): void
    assetRef(id: string): void
    removeAsset(id: string): void
    useTake(slug: string): void
    mix(): void
  }
}

export function nameOf(sel: string, d: StudioData, card?: KitCard, pack?: Pack) {
  const [part, id] = splitKey(sel)
  return card?.name || pack?.name || (part === 'step' ? STEP_NAME[id] : '') || (part === 'ref' ? d.refs.find(r => r.id === id)?.name : part === 'asset' ? d.assets.find(a => a.id === id)?.name : part === 'lock' ? 'Idea' : '') || ''
}
const splitKey = (k: string): [string, string] => { const i = k.indexOf(':'); return i < 0 ? [k, ''] : [k.slice(0, i), k.slice(i + 1)] }

export function StudioInspector({ sel, d, card, pack, ctx, version, onClose, act }: Props) {
  const [part, id] = splitKey(sel)
  const box = useRef<HTMLDivElement>(null)
  // a kit's controls, drawn again when its data changes, but never under the person's typing
  useLayoutEffect(() => {
    const node = box.current
    if (!node || !card?.inspect) return
    if (node.contains(document.activeElement) && document.activeElement?.matches('input, select, textarea')) return
    node.replaceChildren()
    card.inspect(node, ctx())
  }, [card, ctx, version])
  const name = nameOf(sel, d, card, pack)

  return (
    <aside className="pj-insp" aria-label="Inspector">
      <h3 className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{name}</span><Button role="ghost" aria-label="Close" onPress={onClose} className="min-h-8 min-w-8 px-0">×</Button></h3>
      {card ? <div ref={box} className="sc-body" /> : (
        <div className="sc-body flex flex-col gap-3">
          {pack && <>
            <p className="sc-idea-full">{pack.why || pack.for}</p>
            <div className="flex flex-wrap gap-2"><Button role="primary" onPress={() => act.useTake(pack.slug)}>Use this take</Button><Button onPress={act.mix}>Mix</Button></div>
          </>}
          {part === 'step' && (() => {
            const skipped = d.studio.steps[id] === 'skipped'
            return <div className="flex flex-wrap gap-2"><Button onPress={() => act.skip(id, skipped)}>{skipped ? 'Bring back' : 'Skip'}</Button><Button onPress={() => act.removeStep(id)}>Remove</Button></div>
          })()}
          {part === 'ref' && <div className="flex flex-wrap gap-2"><Button onPress={() => act.refGiven(id)}>Use as given</Button><Button onPress={() => act.removeRef(id)}>Remove</Button></div>}
          {part === 'asset' && <>
            <Select label="Role" options={ROLES} selectedKey={d.assets.find(a => a.id === id)?.role || null} onSelectionChange={k => { if (k != null) act.assetRole(id, String(k)) }} />
            <div className="flex flex-wrap gap-2"><Button onPress={() => act.assetRef(id)}>Use as reference</Button><Button onPress={() => act.removeAsset(id)}>Remove</Button></div>
          </>}
          {part === 'lock' && <p className="sc-idea-full">{d.studio.idea}</p>}
        </div>
      )}
    </aside>
  )
}
