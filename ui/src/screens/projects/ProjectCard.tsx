// A Project on Projects (docs/ux/OBJECTS.md): the build's own hero picture, its title, what it is and how far it
// got, the crew at work on a live one. One button opens it (Shift, ⌘ or Ctrl picks it instead); … and a right-click
// manage it; on its cover, Delete (or in Trash, Restore and Delete forever). A stack's versions are cards too.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CREW } from '@studio/icons'
import { IconButton, PlainButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { KIND, KIND_NAME, ago, type Layout, type Project, type Theme } from './model'

const WHAT: Record<string, string> = { site: 'the site', app: 'the app', game: 'the game', film: 'the film' }

// the cover: the build's hero picture; with none yet, its title set in its own theme
export function Cover({ src, theme, title = '', round = 'rounded-[12px]' }: { src?: string | null, theme?: Theme | null, title?: string, round?: string }) {
  const box = `absolute inset-0 h-full w-full overflow-hidden ${round}`
  if (src) return <img className={`${box} object-cover ${/^\/snaps\//.test(src) ? 'object-top' : ''}`} src={src} alt="" loading="lazy" decoding="async" draggable={false} />
  if (theme?.colors?.length) {
    const [bg, primary, , fg] = theme.colors
    const font = theme.fonts?.heading || theme.fonts?.display || ''
    return (
      <div className={`${box} grid place-items-center p-4`} style={{ background: bg, color: fg || primary }}>
        <b className="line-clamp-2 text-center text-xl font-extrabold uppercase" style={{ fontFamily: font ? `'${String(font).replace(/'/g, '')}'` : undefined }}>{title}</b>
        <span className="absolute bottom-3 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full" style={{ background: primary || fg }} />
      </div>
    )
  }
  return <div className={`${box} grid place-items-center text-dim`}><Icon name="box" size={28} /></div>
}

// the crew at work: named cursors that drift between spots (still when the person asks for less motion)
function Crew({ n }: { n: number }) {
  const [spots, setSpots] = useState(() => CREW.slice(0, n).map(() => ({ x: 8 + Math.random() * 70, y: 10 + Math.random() * 62 })))
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setSpots(s => s.map(p => (Math.random() < 0.5 ? { x: 8 + Math.random() * 70, y: 10 + Math.random() * 62 } : p))), 1400)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]">
      {spots.map((p, i) => (
        <span key={CREW[i]} className="cur absolute z-[6] transition-[left,top] duration-[1400ms] ease-ease motion-reduce:transition-none" data-n={CREW[i]} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className="block h-[18px] w-[18px]"><path d="M2 2 L17 9 L10 11 L7 18 Z" fill="#f4f4f5" stroke="#0b0b0c" strokeWidth="1.2" /></svg>
          <span className="absolute top-3.5 left-3.5 rounded-[5px] bg-[#f4f4f5] px-[7px] py-0.5 font-label text-[11px] font-bold tracking-[.06em] whitespace-nowrap text-[#0b0b0c]">{CREW[i]}</span>
        </span>
      ))}
    </div>
  )
}

const Frame = ({ list }: { list: boolean }) => (
  <div aria-hidden className={`pointer-events-none absolute z-[5] border-[1.5px] border-text ${list ? 'inset-0 rounded-[10px]' : '-inset-[5px]'}`}>
    {!list && ['-left-[5px] -top-[5px]', '-right-[5px] -top-[5px]', '-left-[5px] -bottom-[5px]', '-right-[5px] -bottom-[5px]'].map(c => <i key={c} className={`absolute h-2 w-2 border-[1.5px] border-text bg-void ${c}`} />)}
  </div>
)

export interface CardProps {
  p: Project
  layout: Layout
  selected: boolean
  framed: boolean
  stacked: boolean
  trash: boolean
  folderShown: boolean
  seen: number
  renaming: boolean
  onOpen: (mods: { shift: boolean, meta: boolean }) => void
  onMenu: (at: HTMLElement | { x: number, y: number }) => void
  onAct: (op: 'trash' | 'restore' | 'purge') => void
  onKey: (key: 'delete' | 'menu') => void
  onRename: (title: string | null) => void
  onDragStart: (e: React.DragEvent) => void
}

export function ProjectCard({ p, layout, selected, framed, stacked, trash, folderShown, seen, renaming, onOpen, onMenu, onAct, onKey, onRename, onDragStart }: CardProps) {
  const list = layout === 'list'
  const stack = p.count > 1 && !stacked
  const managed = !stacked && !p.version && !p.plan
  const more = useRef<HTMLButtonElement>(null)
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onKey('delete') }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onKey('menu') }
  }
  const pct = Math.round((p.progress ?? 0.1) * 100)
  return (
    <div data-id={p.id} className={`group relative min-w-0 ${list ? 'flex items-center gap-4 rounded-[10px] px-2 py-1.5 hover:bg-deep' : ''}`}
      draggable={managed && !trash} onDragStart={onDragStart}
      onContextMenu={e => { if (!managed) return; e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }) }}>
      <PlainButton onPress={e => onOpen({ shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })} onKeyDown={key}
        className={`${list ? 'flex min-w-0 flex-1 items-center gap-4' : 'block w-full'} rounded-[12px] data-[hovered]:[&_.cv]:shadow-[0_0_0_1.5px_var(--line-2)]`}>
        <div className={`cv relative isolate aspect-[16/10] bg-surface-2 ${list ? 'w-24 flex-none rounded-[8px]' : 'rounded-[12px]'}`}>
          {stack && !list && <>
            <span aria-hidden className="absolute inset-x-2.5 -top-1.5 -z-10 h-3 rounded-t-[10px] bg-line-2" />
            <span aria-hidden className="absolute inset-x-5 -top-[11px] -z-20 h-3 rounded-t-[10px] bg-surface-2" />
          </>}
          <Cover src={p.cover} theme={p.theme} title={p.title} round={list ? 'rounded-[8px]' : 'rounded-[12px]'} />
          {stack && !list && <span className="absolute top-2 right-2 rounded-[7px] bg-[rgb(11_11_12/.8)] px-2 py-0.5 font-monospace text-xs text-[#f4f4f5]">{p.count}<span className="sr-only"> versions</span></span>}
          {!!p.kinds?.length && !list && (
            <span className="absolute bottom-2 left-2 flex gap-1 rounded-[8px] bg-[rgb(11_11_12/.72)] px-[7px] py-[5px] text-[#f4f4f5]" role="img" aria-label={p.kinds.map(k => KIND_NAME[k]).join(', ')}>
              {p.kinds.map(k => <Icon key={k} name={KIND[k]} size={14} />)}
            </span>
          )}
          {p.live && <>
            <Crew n={2 + (p.id.length % 3)} />
            {p.progress == null && p.work
              ? <div role="progressbar" aria-label={`Building ${WHAT[p.work.what || ''] || ''}`} className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-[12px] bg-[rgb(255_255_255/.15)]"><i className="block h-full w-1/3 animate-pulse bg-[#f4f4f5]" /></div>
              : <div role="progressbar" aria-label="Building" aria-valuenow={pct} className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-[12px] bg-[rgb(255_255_255/.15)]"><i className="block h-full bg-[#f4f4f5]" style={{ width: `${Math.max(6, pct)}%` }} /></div>}
          </>}
        </div>
        <div className={`flex min-w-0 flex-col ${list ? 'flex-1' : 'mt-2.5 pr-10'}`}>
          <b className={`min-w-0 truncate font-display text-base leading-tight font-extrabold tracking-[.02em] uppercase ${renaming ? 'invisible' : ''}`}>{p.title}</b>
          {p.state && <span className="truncate font-monospace text-xs text-muted">{p.state.kind} · {p.state.status}{p.state.host && <span> · {p.state.host}</span>}</span>}
        </div>
        {list && (
          <span className="flex gap-4 font-monospace text-xs text-muted">
            {p.count > 1 && <span className="inline-flex items-center gap-1"><Icon name="layers" size={13} />{p.count}<span className="sr-only"> versions</span></span>}
            {p.folder && folderShown && <span className="inline-flex items-center gap-1"><Icon name="folder" size={13} />{p.folder}</span>}
            <span>{ago(seen)}</span>
          </span>
        )}
      </PlainButton>
      {renaming && <RenameInput value={p.title} onDone={onRename} className={list ? 'absolute top-1/2 left-32 w-[40%] -translate-y-1/2' : 'absolute inset-x-0 top-[calc(62.5%+8px)]'} />}
      {managed && (
        <div className={`absolute flex gap-1 ${list ? 'right-12' : 'top-2 right-2'} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`}>
          {trash
            ? <>
              <IconButton icon="restore" label="Restore" size={16} onPress={() => onAct('restore')} className="bg-[rgb(11_11_12/.72)] text-[#f4f4f5]" />
              <IconButton icon="trash" label="Delete forever" size={16} onPress={() => onAct('purge')} className="bg-[rgb(11_11_12/.72)] text-hot-text" />
            </>
            : <IconButton icon="trash" label="Delete" size={16} onPress={() => onAct('trash')} className="bg-[rgb(11_11_12/.72)] text-hot-text" />}
        </div>
      )}
      {!p.plan && (
        <IconButton ref={more} icon="more" label="More" size={16} aria-haspopup="menu" onPress={() => more.current && onMenu(more.current)}
          className={`absolute ${list ? 'top-1/2 right-1 -translate-y-1/2' : 'right-0 bottom-0'} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`} />
      )}
      {(selected || framed) && <Frame list={list} />}
    </div>
  )
}

// a name typed in place (a project, a chat, a folder): Enter or leaving keeps it, Esc puts the old one back
export function RenameInput({ value, label = 'Name', max = 80, onDone, className }: { value: string, label?: string, max?: number, onDone: (v: string | null) => void, className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const over = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = (save: boolean) => {
    if (over.current) return
    over.current = true
    const v = ref.current?.value.trim() || ''
    onDone(save && v && v !== value ? v : null)
  }
  return (
    <input ref={ref} defaultValue={value} maxLength={max} aria-label={label}
      className={`z-10 rounded-[6px] border border-text bg-deep px-1.5 py-0.5 text-text outline-none ${className ?? ''}`}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true) } if (e.key === 'Escape') { e.preventDefault(); finish(false) } }}
      onBlur={() => finish(true)} onClick={e => e.stopPropagation()} />
  )
}
