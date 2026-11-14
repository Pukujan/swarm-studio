// Projects' sidebar: the logo (back to Recent), the views (Recent, All projects, Chats, Assets, Trash), the folders
// (+ makes one; right-click renames or deletes one), and you at the bottom with the Feed beside you. A card dragged
// onto a folder moves there, onto Trash goes to Trash. On a phone it is a drawer behind ☰.
import { useRef, useState } from 'react'
import { Button, IconButton, PlainButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { MenuAt, MenuRow, MenuSeparator } from '../../primitives/Menu'
import { RenameInput } from './ProjectCard'
import type { Folder, View } from './model'

export const DRAG_TYPE = 'application/x-swarm-projects'

export interface Me { name?: string, feed?: string }
export interface SidebarProps {
  view: View, folder: string | null, stacked: boolean, counts: { all: number, trash: number }, folders: Folder[], me: Me | null
  adding: boolean, onAdding: (on: boolean) => void
  onGo: (view: View, folder?: string | null) => void
  onNewFolder: (name: string | null) => void
  onRenameFolder: (from: string, to: string) => void
  onDeleteFolder: (name: string) => void
  onDrop: (ids: string[], to: { trash: true } | { folder: string }) => void
  account: React.ReactNode
}

export function Logo() {
  return (
    <span className="relative inline-block px-2 py-[3px] font-display text-[22px] leading-none font-extrabold tracking-[.02em] text-text before:absolute before:inset-0 before:border-[1.5px] before:border-text before:content-['']">
      SWARM
      {['-left-[3px] -top-[3px]', '-right-[3px] -top-[3px]', '-left-[3px] -bottom-[3px]', '-right-[3px] -bottom-[3px]'].map(c => <i key={c} className={`absolute h-1.5 w-1.5 border-[1.5px] border-text bg-void ${c}`} />)}
    </span>
  )
}

const ROW = 'flex h-10 w-full items-center gap-3 rounded-[9px] px-2.5 text-[13.5px] text-muted data-[hovered]:text-text'

export function Sidebar({ view, folder, stacked, counts, folders, me, adding, onAdding, onGo, onNewFolder, onRenameFolder, onDeleteFolder, onDrop, account }: SidebarProps) {
  const [over, setOver] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ name: string, x: number, y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const point = useRef<HTMLSpanElement>(null)
  const drop = (key: string, to: { trash: true } | { folder: string }) => ({
    onDragOver: (e: React.DragEvent) => { if (!e.dataTransfer.types.includes(DRAG_TYPE)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(key) },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(null) },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(null)
      let ids: string[] = []
      try { ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) } catch { /* not ours */ }
      if (ids.length) onDrop(ids, to)
    }
  })
  const item = (v: View, icon: string, label: string, count?: number) => (
    <div key={v} {...(v === 'trash' ? drop('trash', { trash: true }) : {})} className={over === 'trash' && v === 'trash' ? 'rounded-[9px] outline-[1.5px] outline-offset-[-2px] outline-text outline-dashed' : ''}>
      <PlainButton onPress={() => onGo(v)} aria-current={view === v && !stacked ? 'page' : undefined}
        className={`${ROW} ${view === v && !stacked ? 'bg-surface-2 !text-text' : ''}`}>
        <Icon name={icon} /><span className="min-w-0 flex-1 truncate">{label}</span>
        {!!count && <span className="font-monospace text-xs text-dim">{count}<span className="sr-only"> projects</span></span>}
      </PlainButton>
    </div>
  )
  return (
    <aside aria-label="Projects" className="flex h-full w-[248px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-line bg-void px-3.5 py-5">
      <PlainButton aria-label="Swarm, Projects" onPress={() => onGo('recent')} className="mb-5 self-start px-2 py-1"><Logo /></PlainButton>
      <nav aria-label="Views" className="flex flex-col gap-0.5">
        {item('recent', 'clock', 'Recent')}
        {item('all', 'grid', 'All projects', counts.all)}
        {item('chats', 'msg', 'Chats')}
        {item('assets', 'image', 'Assets')}
        {item('trash', 'trash', 'Trash', counts.trash)}
      </nav>
      <div className="mx-2.5 mt-5 mb-1.5 flex items-center justify-between">
        <span className="font-label text-[13px] font-semibold tracking-[.12em] text-muted uppercase">Folders</span>
        <IconButton icon="plus" label="New folder" size={16} onPress={() => onAdding(true)} />
      </div>
      <div className="flex flex-col gap-0.5">
        {folders.map(f => (
          <div key={f.name} {...drop(`f:${f.name}`, { folder: f.name })}
            className={over === `f:${f.name}` ? 'rounded-[9px] outline-[1.5px] outline-offset-[-2px] outline-text outline-dashed' : ''}
            onContextMenu={e => { e.preventDefault(); setMenu({ name: f.name, x: e.clientX, y: e.clientY }) }}>
            {renaming === f.name
              ? <div className={ROW}><Icon name="folder" /><RenameInput value={f.name} label="Folder name" max={40} className="min-w-0 flex-1" onDone={v => { setRenaming(null); if (v) onRenameFolder(f.name, v) }} /></div>
              : (
                <PlainButton onPress={() => onGo('folder', f.name)} aria-current={view === 'folder' && folder === f.name && !stacked ? 'page' : undefined}
                  className={`${ROW} ${view === 'folder' && folder === f.name && !stacked ? 'bg-surface-2 !text-text' : ''}`}>
                  <Icon name="folder" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {!!f.count && <span className="font-monospace text-xs text-dim">{f.count}<span className="sr-only"> projects</span></span>}
                </PlainButton>
              )}
          </div>
        ))}
        {adding && <div className={ROW}><Icon name="folder" /><RenameInput value="" label="Folder name" max={40} className="min-w-0 flex-1" onDone={v => { onAdding(false); onNewFolder(v) }} /></div>}
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-2.5">
        {account}
        <a href={me?.feed || 'https://swarm.design-bakery.com'} target="_blank" rel="noopener" aria-label="Swarm Feed"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[10px] text-muted outline-none hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-frame-hi">
          <Icon name="globe" />
        </a>
      </div>
      <span ref={point} aria-hidden className="fixed h-0 w-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
      <MenuAt name={`Folder ${menu?.name ?? ''}`} triggerRef={point} isOpen={!!menu} onClose={() => setMenu(null)} placement="bottom start"
        onAction={k => { const n = menu!.name; if (k === 'rename') setRenaming(n); else onDeleteFolder(n) }}>
        <MenuRow id="rename" icon="type" label="Rename" />
        <MenuSeparator />
        <MenuRow id="del" icon="trash" label="Delete folder" red />
      </MenuAt>
    </aside>
  )
}

// you: the first letter of your name, then your name; the menu holds the theme, Crew sound, Models, Setup, Settings
export function Who({ me, onPress, ref }: { me: Me | null, onPress: () => void, ref: React.Ref<HTMLButtonElement> }) {
  const name = me?.name || 'You'
  return (
    <Button ref={ref} role="ghost" aria-label={`You, ${name}`} aria-haspopup="menu" onPress={onPress}
      className="!h-auto min-w-0 flex-1 !justify-start !gap-2.5 !px-2.5 !py-1.5 !font-body !text-[13px] !font-normal !tracking-normal !normal-case text-muted">
      <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface-2 text-xs font-semibold text-text">{name.slice(0, 1).toUpperCase()}</span>
      <span className="truncate">{name}</span>
    </Button>
  )
}
