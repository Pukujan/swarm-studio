// Layers: what is on a canvas, by section (docs/ux/PATTERNS.md, the left panel; web/layers.js in the current
// Studio). One component for every canvas that lists what is on it: the Studio scaffold now, the Overview and the
// Design deck when they move. A canvas hands it groups; it draws them on React Aria's Tree, so the arrows, Home,
// End, type-ahead and the tree's roles come with it.
//
//   a click selects a row and the canvas flies to it (onSelect); a double-click or Enter opens it (onOpen);
//   F2 or right-click → Rename, Delete or right-click → Delete, only where the canvas says it can (canRename,
//   canRemove); a caret opens or shuts a group, and a click on its name goes to the section (onGroup)
import { useRef, useState, type ReactNode } from 'react'
import { Menu as AriaMenu, Popover, Tree, TreeItem, TreeItemContent, Button as AriaButton, type Key } from 'react-aria-components'
import { MenuItem } from '../primitives/Menu'
import { TextField } from '../primitives/TextField'

export type StepState = 'empty' | 'started' | 'done' | 'skipped'

export interface LayerRow {
  key: string
  name: string
  // an agent or the planner is working on it
  busy?: boolean
}

export interface LayerGroup {
  id: string
  title: string
  rows: LayerRow[]
  // a step's dot: empty, started, done or skipped
  state?: StepState
  busy?: boolean
}

export interface LayersProps {
  groups: LayerGroup[]
  selected?: string | null
  onSelect: (key: string) => void
  onOpen?: (key: string) => void
  onGroup?: (id: string) => void
  canRename?: (key: string) => boolean
  onRename?: (key: string, name: string) => void
  canRemove?: (key: string) => boolean
  onRemove?: (key: string) => void
  // what the tree is called for a screen reader
  label?: string
}

const STATE_NAME: Record<StepState, string> = { empty: 'Empty', started: 'Started', done: 'Done', skipped: 'Skipped' }

// a step's dot, as the board draws it (web/scaffold.css .sc-dot)
export function StepDot({ state }: { state: StepState }) {
  const look: Record<StepState, string> = {
    empty: 'border-muted',
    started: 'border-text bg-[linear-gradient(90deg,var(--text)_50%,transparent_50%)]',
    done: 'border-accent bg-accent',
    skipped: 'border-dashed border-muted opacity-60'
  }
  return <i role="img" aria-label={STATE_NAME[state]} className={`inline-block size-[9px] flex-none rounded-full border-[1.5px] ${look[state]}`} />
}

const Working = () => <span role="img" aria-label="Working" className="size-[7px] flex-none rounded-full bg-text" />

export function Layers({ groups, selected = null, onSelect, onOpen, onGroup, canRename, onRename, canRemove, onRemove, label = 'Layers' }: LayersProps) {
  const [shut, setShut] = useState<Set<Key>>(() => new Set())
  const expanded = new Set(groups.map(g => g.id).filter(id => !shut.has(id)))
  // the row a menu or a rename is open on, and the element it is anchored to
  const [menuAt, setMenuAt] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const anchors = useRef(new Map<string, HTMLElement>())
  const rows = new Map(groups.flatMap(g => g.rows.map(r => [r.key, r] as const)))
  const isRow = (k: Key) => rows.has(String(k))
  const may = { rename: (k: string) => !!onRename && (canRename?.(k) ?? true), remove: (k: string) => !!onRemove && (canRemove?.(k) ?? true) }

  // the row an event is on (React Aria gives each item its id as data-key)
  const rowOf = (e: React.SyntheticEvent) => { const k = (e.target as HTMLElement).closest?.('[data-key]')?.getAttribute('data-key'); return k && rows.has(k) ? k : null }
  const onKey = (e: React.KeyboardEvent) => {
    const key = rowOf(e)
    if (!key || (e.target as HTMLElement).closest('input')) return
    if (e.key === 'F2' && may.rename(key)) { e.preventDefault(); setRenaming(key) }
    if ((e.key === 'Delete' || e.key === 'Backspace') && may.remove(key)) { e.preventDefault(); onRemove?.(key) }
  }
  const onMenu = (e: React.MouseEvent) => {
    const key = rowOf(e)
    if (!key || (!may.rename(key) && !may.remove(key))) return
    e.preventDefault()
    onSelect(key)
    setMenuAt(key)
  }

  return (
    <div onKeyDown={onKey} onContextMenu={onMenu}>
      <Tree
        aria-label={label}
        selectionMode="single"
        selectionBehavior="replace"
        disallowEmptySelection={false}
        selectedKeys={selected && rows.has(selected) ? [selected] : []}
        onSelectionChange={keys => { const k = [...keys][0]; if (k != null && isRow(k)) onSelect(String(k)) }}
        expandedKeys={expanded}
        onExpandedChange={keys => setShut(new Set(groups.map(g => g.id).filter(id => !keys.has(id))))}
        onAction={k => { if (isRow(k)) onOpen?.(String(k)); else onGroup?.(String(k)) }}
        className="flex flex-col gap-0.5 outline-none"
      >
        {groups.map(g => (
          <TreeItem key={g.id} id={g.id} textValue={g.title} className="outline-none">
            <TreeItemContent>
              {({ isExpanded, isFocusVisible }) => (
                <div className={`flex min-h-8 items-center gap-2 rounded-[7px] px-2 font-label text-sm font-semibold uppercase tracking-[.04em] text-text ${isFocusVisible ? 'shadow-[inset_0_0_0_1.5px_var(--text)]' : ''}`}>
                  {g.state && <StepDot state={g.state} />}
                  <span className="mr-auto truncate">{g.title}</span>
                  {g.busy && <Working />}
                  <span className="font-monospace text-[11px] font-normal tracking-normal text-dim">{g.rows.length}</span>
                  {g.rows.length > 0 && <AriaButton slot="chevron" aria-label={isExpanded ? `Shut ${g.title}` : `Open ${g.title}`} className="grid size-6 cursor-pointer place-items-center rounded-[6px] text-[10px] text-muted outline-none data-[hovered]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:outline-frame-hi">
                    <span aria-hidden className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  </AriaButton>}
                </div>
              )}
            </TreeItemContent>
            {g.rows.map(r => (
              <TreeItem key={r.key} id={r.key} textValue={r.name}
                className="cursor-pointer rounded-[6px] text-[13px] text-muted outline-none data-[hovered]:bg-panel-2 data-[selected]:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] data-[selected]:text-text data-[focus-visible]:shadow-[inset_0_0_0_1.5px_var(--text)]">
                <TreeItemContent>
                  <div ref={el => { if (el) anchors.current.set(r.key, el); else anchors.current.delete(r.key) }} className="flex min-h-7 items-center gap-2 pl-6 pr-2">
                    {r.busy ? <Working /> : <span aria-hidden className="size-2 flex-none rounded-full bg-line-2" />}
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  </div>
                </TreeItemContent>
              </TreeItem>
            ))}
          </TreeItem>
        ))}
      </Tree>
      {menuAt && (
        <RowPopover anchor={anchors.current.get(menuAt)} onClose={() => setMenuAt(null)}>
          <AriaMenu aria-label="Layer" autoFocus="first" className="outline-none" onAction={a => {
            const key = menuAt
            setMenuAt(null)
            if (a === 'rename') setRenaming(key)
            if (a === 'remove') onRemove?.(key)
          }}>
            {may.rename(menuAt) && <MenuItem id="rename">Rename</MenuItem>}
            {may.remove(menuAt) && <MenuItem id="remove">Delete</MenuItem>}
          </AriaMenu>
        </RowPopover>
      )}
      {renaming && (
        <RowPopover anchor={anchors.current.get(renaming)} onClose={() => setRenaming(null)}>
          <form className="p-2" onSubmit={e => {
            e.preventDefault()
            const v = String(new FormData(e.currentTarget).get('name') || '').trim()
            const key = renaming
            setRenaming(null)
            if (v && v !== rows.get(key)?.name) onRename?.(key, v.slice(0, 60))
          }}>
            <TextField label="Name" name="name" defaultValue={rows.get(renaming)?.name} autoFocus maxLength={60} />
          </form>
        </RowPopover>
      )}
    </div>
  )
}

function RowPopover({ anchor, onClose, children }: { anchor?: HTMLElement, onClose: () => void, children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(anchor ?? null)
  ref.current = anchor ?? null
  return (
    <Popover triggerRef={ref} isOpen onOpenChange={open => { if (!open) onClose() }} placement="bottom start" offset={4}
      className="min-w-44 rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
      {children}
    </Popover>
  )
}
