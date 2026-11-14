// The right panel's Design tab while a section is picked (PATTERNS.md, Figma's right panel with a selection): the
// section's parts, and one part's words, link, picture and style, changed by hand with Open Design's Edit
// (web/edit/patches.js, decision 0010), as the Overview's Inspector does (web/project.js). Each change is a section
// version: Undo and Redo, Versions, and the crew keeps it on a rework. A field saves when it is left (or on Enter).
import { useEffect, useMemo, useState } from 'react'
import { swEdit, type Part, type Patch } from '@studio/edit'
import { Button } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { TextField } from '../../primitives/TextField'
import type { DeckLayer } from './model'

const PART_ICON: Record<string, string> = { image: 'image', link: 'link', container: 'frame', graphic: 'image', text: 'type' }
// the style fields and an example of each, as the Inspector names them
const STYLE: [string, string, string][] = [
  ['fontSize', 'Size', '18px'], ['fontWeight', 'Weight', '600'], ['lineHeight', 'Line', '1.4'], ['letterSpacing', 'Letters', '0.02em'],
  ['color', 'Colour', '#1c1917'], ['textAlign', 'Align', 'center'], ['width', 'Width', '100%'], ['height', 'Height', 'auto'],
  ['padding', 'Padding', '12px 20px'], ['margin', 'Margin', '0 auto'], ['backgroundColor', 'Fill', '#ffffff'], ['borderRadius', 'Corners', '8px'], ['opacity', 'Opacity', '0.9']
]

export function DesignTab({ layer, part, onPart, onEdit, onClose, issue }: {
  layer: DeckLayer, part: string | null, onPart: (id: string | null) => void, issue?: string,
  onEdit: (patch: Patch, why: string) => void, onClose: () => void
}) {
  const rows = useMemo(() => (layer.status === 'done' ? swEdit.tree(layer.text, 60) : []), [layer.text, layer.status])
  const p = part && layer.status === 'done' ? swEdit.read(layer.text, part) : null
  return (
    <section aria-label="Design" className="flex flex-col gap-3 px-4 py-3">
      <h3 className="flex items-center gap-2 font-label text-sm font-semibold uppercase tracking-[.1em]">
        {p && <Button role="ghost" aria-label="Back to the parts" onPress={() => onPart(null)} className="min-w-8 px-1"><Icon name="chl" size={16} /></Button>}
        <span className="min-w-0 flex-1 truncate">{p ? p.label || p.tag : layer.role}</span>
        <Button role="ghost" aria-label="Close" onPress={onClose} className="min-w-8 px-1"><Icon name="x" size={16} /></Button>
      </h3>
      {issue && <p className="rounded-[8px] border border-hot px-2.5 py-1.5 font-monospace text-[13px]"><b className="text-hot-text">The Critic</b> {issue}</p>}
      {layer.status !== 'done' && <p className="font-monospace text-[13px] text-muted">{layer.status === 'failed' ? 'This section did not finish. Ask the crew to try again.' : 'The crew is still writing this section.'}</p>}
      {layer.status === 'done' && !p && (
        <ul aria-label="Parts" className="flex flex-col">
          {rows.map(r => (
            <li key={r.id}>
              <Button role="ghost" onPress={() => onPart(r.id)} className="w-full justify-start gap-2 font-monospace font-normal! normal-case! tracking-normal!" >
                <span style={{ width: Math.min(r.depth, 5) * 10 }} aria-hidden />
                <Icon name={PART_ICON[r.kind] ?? 'type'} size={13} /><span className="truncate">{r.label}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {p && <PartFields key={`${layer.key}:${p.id}:${layer.ver}`} part={p} onEdit={onEdit} />}
    </section>
  )
}

// a field that saves when it is left or on Enter, only when it changed
function Field({ label, value, placeholder, onSave }: { label: string, value: string, placeholder?: string, onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const save = () => { if (v !== value) onSave(v) }
  return <TextField label={label} value={v} placeholder={placeholder} onChange={setV} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save() }} />
}

function PartFields({ part: p, onEdit }: { part: Part, onEdit: (patch: Patch, why: string) => void }) {
  const F = p.fields
  const set = (patch: Patch, why: string) => onEdit(patch, why)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h4 className="font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Content</h4>
        {p.wordsEditable && p.kind !== 'link' && <Field label="Words" value={F.text ?? ''} onSave={v => set({ kind: 'set-text', id: p.id, value: v }, 'words')} />}
        {p.kind === 'link' && (
          <>
            {p.wordsEditable && <Field label="Words" value={F.text ?? ''} onSave={v => set({ kind: 'set-link', id: p.id, text: v, href: F.href ?? '' }, 'link')} />}
            <Field label="Link" value={F.href ?? ''} onSave={v => set({ kind: 'set-link', id: p.id, text: p.wordsEditable ? F.text : undefined, href: v }, 'link')} />
          </>
        )}
        {p.kind === 'image' && (
          <>
            <Field label="Address" value={F.src ?? ''} onSave={v => set({ kind: 'set-image', id: p.id, src: v, alt: F.alt }, 'picture')} />
            <Field label="Alt text" value={F.alt ?? ''} onSave={v => set({ kind: 'set-image', id: p.id, src: F.src ?? '', alt: v }, 'picture')} />
          </>
        )}
        {!p.wordsEditable && p.kind !== 'image' && p.kind !== 'link' && <p className="font-monospace text-[13px] text-muted">Pick one of its parts to change its words.</p>}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Style</h4>
        <div className="grid grid-cols-2 gap-2">
          {STYLE.map(([k, label, eg]) => <Field key={k} label={label} value={p.styles[k] ?? ''} placeholder={eg} onSave={v => set({ kind: 'set-style', id: p.id, styles: { [k]: v } }, 'style')} />)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button role="secondary" isDisabled={!p.canUp} onPress={() => set({ kind: 'move-element', id: p.id, dir: -1 }, 'move')}>Up</Button>
        <Button role="secondary" isDisabled={!p.canDown} onPress={() => set({ kind: 'move-element', id: p.id, dir: 1 }, 'move')}>Down</Button>
        <Button role="secondary" isDisabled={!p.canRemove} onPress={() => set({ kind: 'remove-element', id: p.id }, 'remove')}><Icon name="trash" size={15} />Remove</Button>
      </div>
    </div>
  )
}
