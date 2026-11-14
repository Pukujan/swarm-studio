// The inspector (SITEMAP §8 › Inspector, while something is selected): the file's name, its picture or clip, what is
// known of it (size, style, where it is used, length, from), and what can be done with it: Open, Export, Replace,
// Remove; a reference also takes "Use for…", sent to the crew. Closes with × (and Esc, from the Overview).
import { useState, type CSSProperties } from 'react'
import { Button, IconButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { acts, facts, type Act, type Board, type Item } from './model'

const ACT: Record<Act, [string, string]> = { open: ['ext', 'Open'], export: ['download', 'Export'], zip: ['download', 'Export'], replace: ['upload', 'Replace'], 'ref-remove': ['trash', 'Remove'] }

export function Inspector({ x, theme, onClose, onAct, onUseFor }: { x: Item, theme: Board['theme'], onClose: () => void, onAct: (a: Act, x: Item) => void, onUseFor: (x: Item, use: string) => Promise<boolean> }) {
  const [dims, setDims] = useState<Record<string, string>>({})
  const cs = theme?.colors || []
  const preview = x.kind === 'film' && x.video
    ? <video src={x.video} poster={x.src || undefined} controls preload="none" className="block h-full w-full object-contain" />
    : x.src
      ? <img src={x.sharp || x.src} alt="" className="block h-full w-full object-contain" onLoad={e => { const im = e.currentTarget; setDims(d => ({ ...d, [x.key]: `${im.naturalWidth} × ${im.naturalHeight}` })) }} />
      : x.kind === 'page' && cs.length
        ? <div className="relative h-full w-24"><div className="ov-tc" style={{ '--tc-bg': cs[0], '--tc-pr': cs[1] || cs[0], '--tc-fg': cs[3] || cs.at(-1) } as CSSProperties}><i /><b>{x.name}</b><span /></div></div>
        : <Icon name="file" size={28} />
  return (
    <aside className="ov-insp" aria-label="Inspector">
      <h3 className="m-0 mb-1 flex items-center gap-2 font-body text-sm font-semibold">
        <span className="min-w-0 flex-1 truncate">{x.name}</span>
        <IconButton icon="x" label="Close" size={16} onPress={onClose} />
      </h3>
      <div className="grid h-[180px] place-items-center overflow-hidden rounded-[8px] border border-line bg-surface-2 text-dim">{preview}</div>
      {x.pitch && <p className="m-0 font-monospace text-xs text-muted">{x.pitch}</p>}
      {facts(x, dims[x.key]).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-[3px] font-monospace text-xs text-muted">
          <span className="flex-none whitespace-nowrap">{k}</span><b className="min-w-0 truncate text-right font-medium text-text">{v}</b>
        </div>
      ))}
      {x.kind === 'ref' && <UseFor x={x} onUseFor={onUseFor} />}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {acts(x).map(a => <Button key={a} role="ghost" className="flex-1" onPress={() => onAct(a, x)}><Icon name={ACT[a][0]} size={15} />{ACT[a][1]}</Button>)}
      </div>
    </aside>
  )
}

// Use for…: the crew get the reference and the part it is for, like a comment on that section
function UseFor({ x, onUseFor }: { x: Item, onUseFor: (x: Item, use: string) => Promise<boolean> }) {
  const [use, setUse] = useState(x.ref?.use || '')
  const [busy, setBusy] = useState(false)
  return (
    <form className="flex gap-2" autoComplete="off" onSubmit={async e => { e.preventDefault(); if (!use.trim()) return; setBusy(true); await onUseFor(x, use.trim()); setBusy(false) }}>
      <input value={use} onChange={e => setUse(e.target.value)} placeholder="Use for…" aria-label="Use for" maxLength={80}
        className="min-h-10 min-w-0 flex-1 rounded-[10px] border border-line-2 bg-void px-3 font-monospace text-sm text-text outline-none placeholder:text-dim focus:border-frame-hi" />
      <Button type="submit" isDisabled={busy}>Send</Button>
    </form>
  )
}
