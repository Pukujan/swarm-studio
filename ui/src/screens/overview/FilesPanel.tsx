// The left panel (SITEMAP §8 › Left panel): Files, every file the build made by section, and Layers, its pages and
// sections. Search filters both the panel and the stage; + offers New page, Upload files, Reference and Link. A row
// selects its file and brings it into view; a double-click or Enter opens it; ↑ ↓ move the selection; F2 renames an
// upload; a right-click opens its menu. Each section folds, and which are shut is kept (swarm.project.open, as in
// web/project.js), Code shut to begin with.
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { IconButton, PlainButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { MenuAt, MenuRow } from '../../primitives/Menu'
import { LayersPanel, type Layers } from './Layers'
import { isShut, SECTIONS, type Board, type Groups, type Item, type Section } from './model'

const ICON: Record<string, string> = { page: 'site', app: 'code', game: 'game', film: 'film', code: 'code', art: 'image' }
const iconOf = (x: Item) => x.kind === 'upload' ? (/^audio\//.test(x.type || '') ? 'music' : 'file') : x.kind === 'ref' ? (x.ref?.kind === 'link' ? 'ext' : x.ref?.kind === 'audio' ? 'music' : 'file') : ICON[x.kind] || 'file'

function Thumb({ x, theme }: { x: Item, theme: Board['theme'] }) {
  const cls = 'grid h-6 w-[34px] flex-none place-items-center rounded-[4px] border border-line bg-surface-2 bg-cover bg-top bg-no-repeat text-muted'
  if (x.src) return <span className={cls} style={{ backgroundImage: `url('${x.src}')` }} />
  if (x.kind === 'page' && theme?.colors?.length) return <span className={`${cls} ov-tcs`} style={{ '--tc-bg': theme.colors[0], '--tc-pr': theme.colors[1] || theme.colors[0] } as CSSProperties} />
  return <span className={cls}><Icon name={iconOf(x)} size={14} /></span>
}

export function FilesPanel({ groups, theme, selected, open, onToggle, q, onSearch, layers, onSelect, onOpen, onMenu, onRename, renaming, onRenamed, onNewPage, onUpload, onReference, onLink }: {
  groups: Groups, theme: Board['theme'], selected: string | null, open: Record<string, boolean>, onToggle: (k: Section) => void,
  q: string, onSearch: (q: string) => void, layers: Layers,
  onSelect: (key: string) => void, onOpen: (x: Item) => void, onMenu: (x: Item, at: { x: number, y: number }) => void,
  onRename: (x: Item) => void, renaming: string | null, onRenamed: (x: Item, to: string | null) => void,
  onNewPage: () => void, onUpload: () => void, onReference: () => void, onLink: () => void
}) {
  const [tab, setTab] = useState<'files' | 'layers'>('files')
  const [finding, setFinding] = useState(false)
  const add = useRef<HTMLButtonElement>(null)
  const [adding, setAdding] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const rows = SECTIONS.filter(([k]) => groups[k] && !isShut(open, k)).flatMap(([k]) => groups[k]!)

  const keys = (e: KeyboardEvent, x: Item) => {
    if (e.key === 'Enter') { e.preventDefault(); onOpen(x) }
    if (e.key === 'F2') { e.preventDefault(); onRename(x) }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = rows[rows.indexOf(x) + (e.key === 'ArrowDown' ? 1 : -1)]
      if (n) { onSelect(n.key); list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(n.key)}"]`)?.focus() }
    }
  }
  const tabClass = (on: boolean) => `min-h-10 cursor-pointer rounded-[8px] px-2.5 font-label text-[13px] font-semibold uppercase tracking-[.1em] outline-none focus-visible:outline-2 focus-visible:outline-frame-hi ${on ? 'bg-surface-2 text-text' : 'text-muted'}`
  return (
    <aside className="ov-side" aria-label="Files">
      <div className="flex items-center gap-0.5 px-2.5 pt-2.5 pb-2">
        <div role="tablist" aria-label="Left panel" className="flex gap-0.5">
          <button type="button" role="tab" aria-selected={tab === 'files'} className={tabClass(tab === 'files')} onClick={() => setTab('files')}>Files</button>
          <button type="button" role="tab" aria-selected={tab === 'layers'} className={tabClass(tab === 'layers')} onClick={() => setTab('layers')}>Layers</button>
        </div>
        <IconButton icon="search" label="Search" size={16} on={finding} className="ml-auto" onPress={() => { if (finding) onSearch(''); setFinding(!finding) }} />
        <IconButton ref={add} icon="plus" label="Add" size={16} aria-haspopup="menu" onPress={() => setAdding(true)} />
        <MenuAt name="Add" triggerRef={add} isOpen={adding} onClose={() => setAdding(false)} onAction={k => {
          setAdding(false)
          if (k === 'page') onNewPage(); if (k === 'up') onUpload(); if (k === 'ref') onReference(); if (k === 'link') onLink()
        }}>
          <MenuRow id="page" icon="file" label="New page" />
          <MenuRow id="up" icon="upload" label="Upload files" />
          <MenuRow id="ref" icon="image" label="Reference" />
          <MenuRow id="link" icon="ext" label="Link" />
        </MenuAt>
      </div>
      {finding && (
        <label className="block px-3 pb-2">
          <input type="search" autoFocus placeholder="Search" aria-label="Search files" value={q} onChange={e => onSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onSearch(''); setFinding(false) } }}
            className="h-8 w-full rounded-[8px] border border-line bg-deep px-2.5 font-monospace text-[12.5px] text-text outline-none focus:border-line-2" />
        </label>
      )}
      {tab === 'layers' ? <LayersPanel {...layers} /> : (
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {SECTIONS.filter(([k]) => groups[k]).map(([k, label]) => {
            const shut = isShut(open, k)
            return (
              <div key={k} className="mt-1.5" role="group" aria-label={label}>
                <PlainButton aria-expanded={!shut} onPress={() => onToggle(k)}
                  className="flex h-[30px] w-full items-center gap-1.5 px-1.5 font-label text-xs font-semibold uppercase tracking-[.12em] text-muted data-[hovered]:text-text">
                  <Icon name={shut ? 'chr' : 'chd'} size={14} /><span>{label}</span>
                  {k !== 'code' && <span className="ml-auto font-monospace text-[11px] tracking-normal text-dim">{groups[k]!.length}</span>}
                </PlainButton>
                {!shut && groups[k]!.map(x => (
                  <div key={x.key} data-key={x.key} tabIndex={0} aria-label={x.name} aria-current={selected === x.key || undefined}
                    className={`ov-row ${selected === x.key ? 'on' : ''}`}
                    onClick={() => onSelect(x.key)} onDoubleClick={() => onOpen(x)} onKeyDown={e => { if (!(e.target as Element).closest('input')) keys(e, x) }}
                    onContextMenu={e => { e.preventDefault(); onSelect(x.key); onMenu(x, { x: e.clientX, y: e.clientY }) }}>
                    <Thumb x={x} theme={theme} />
                    {renaming === x.key ? <Rename x={x} onDone={onRenamed} /> : <span className="min-w-0 flex-1 truncate">{x.name}</span>}
                    {x.sending != null && <span className="ov-ring" style={{ '--p': `${Math.round(x.sending * 100)}%` } as CSSProperties} role="progressbar" aria-label="Uploading" aria-valuenow={Math.round(x.sending * 100)} />}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}

// an upload's name, edited in its row: Enter or leaving keeps it, Esc puts it back; the extension is left out of the
// first selection
function Rename({ x, onDone }: { x: Item, onDone: (x: Item, to: string | null) => void }) {
  const over = useRef(false)
  const done = (to: string | null) => { if (over.current) return; over.current = true; onDone(x, to) }
  return (
    <input autoFocus defaultValue={x.name} maxLength={120} aria-label="Name"
      onFocus={e => { const dot = x.name.lastIndexOf('.'); e.currentTarget.setSelectionRange(0, dot > 0 ? dot : x.name.length) }}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(e.currentTarget.value.trim()) } if (e.key === 'Escape') { e.preventDefault(); done(null) } }}
      onBlur={e => done(e.currentTarget.value.trim())}
      className="min-w-0 flex-1 rounded-[6px] border border-text bg-deep px-1.5 py-0.5 font-monospace text-sm text-text outline-none" />
  )
}
