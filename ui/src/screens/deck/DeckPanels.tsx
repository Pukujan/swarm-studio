// The Design deck's panels, in Figma's places (PATTERNS.md, "The Design deck follows Figma"): on the left the
// build's name, its Pages and the chosen page's Layers (a dot on a layer an agent is writing); along the bottom the
// toolbar, where a tool lights up while an agent uses it; on the right the crew, the progress and the zoom, and with
// nothing selected the build's variables, the design tokens the planner set up.
import { useEffect, type ReactNode, type Ref } from 'react'
import { Button } from '../../primitives/Button'
import { Menu, MenuItem } from '../../primitives/Menu'
import { Icon } from '../../primitives/Icon'
import { Layers, type LayerGroup } from '../../shared/Layers'
import { crew } from './crew'
import './deck.css'
import type { DeckModel, ToolId } from './model'

// Layers (the shared tree, src/shared/Layers.tsx), as the breadboard draws the deck's: the nav and footer every page
// shares, then each page with its sections; a dot on the one an agent is writing
function layerGroups(m: DeckModel): LayerGroup[] {
  const row = (k: string) => {
    const l = m.layers[k]
    return { key: k, name: l.status === 'failed' ? `${l.role} · failed` : m.issues[k] ? `${l.role} · the Critic: ${m.issues[k].problem}` : l.role, busy: l.status === 'assigned' || l.status === 'streaming' }
  }
  const shared = m.order.filter(k => m.layers[k].page === '*')
  return [
    ...(shared.length ? [{ id: '*', title: 'Shared nav and footer', rows: shared.map(row) }] : []),
    ...m.pages.map(p => ({ id: p.id, title: `Page ${p.index + 1} · ${p.title}`, rows: m.order.filter(k => m.layers[k].page === p.id).map(row) }))
  ]
}

// `sheet`: below 768 px the panel is a sheet over the canvas, opened from the Layers button (SITEMAP §10); × or Esc
// closes it (Esc before the frame's, which goes up a level)
export function LeftPanel({ model, page, onPage, onLayer, selected, sheet, onClose, id }: {
  model: DeckModel, page: string | null, onPage: (id: string) => void, onLayer: (key: string) => void, selected: string | null,
  sheet: boolean, onClose: () => void, id?: string
}) {
  useEffect(() => {
    if (!sheet) return
    // only while it is a sheet: at 768 px and wider the panel is always there and Esc is the frame's
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !matchMedia('(max-width: 767px)').matches) return
      e.preventDefault()
      onClose()
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [sheet, onClose])
  return (
    <aside id={id} aria-label="Pages and layers" className={`flex w-[260px] flex-none flex-col overflow-y-auto border-r border-edge bg-deep max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-[0_14px_40px_rgb(var(--shade-rgb)/.6)] ${sheet ? '' : 'max-md:hidden'}`}>
      <div className="flex items-center border-b border-edge pr-1">
        <h2 className="min-w-0 flex-1 truncate px-4 py-3 font-label text-sm font-semibold uppercase tracking-[.1em]">{model.title || 'Untitled'}</h2>
        {sheet && <Button role="ghost" aria-label="Close Layers" onPress={onClose} className="md:hidden"><Icon name="x" size={16} /></Button>}
      </div>
      <section aria-labelledby="deck-pages" className="border-b border-edge px-2 py-3">
        <h3 id="deck-pages" className="px-2 pb-2 font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Pages</h3>
        {!model.pages.length && <p className="px-2 font-monospace text-[13px] text-muted">Pages appear here once the planner names them.</p>}
        <ul className="flex flex-col gap-0.5">
          {model.pages.map(p => (
            <li key={p.id}>
              <Button role="ghost" aria-current={p.id === page ? 'true' : undefined} onPress={() => onPage(p.id)}
                className={`w-full justify-start font-monospace normal-case! font-normal! tracking-normal! ${p.id === page ? 'bg-panel-2!' : ''}`}>
                <span className="truncate">{p.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {model.pages.length > 0 && (
        <section aria-labelledby="deck-layers" className="px-2 py-3">
          <h3 id="deck-layers" className="px-2 pb-2 font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Layers</h3>
          <Layers label="Layers" groups={layerGroups(model)} selected={selected}
            onSelect={onLayer}
            onGroup={id => { if (model.pages.some(p => p.id === id)) onPage(id) }} />
        </section>
      )}
    </aside>
  )
}

// the tools as the current deck names them (web/canvas/core.js TOOLS), with the Studio's line icons
const TOOLS: { id: ToolId, label: string, icon: string }[] = [
  { id: 'move', label: 'Move', icon: 'move' },
  { id: 'frame', label: 'Frame', icon: 'frame' },
  { id: 'rect', label: 'Shape', icon: 'box' },
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'connect', label: 'Connect', icon: 'link' },
  { id: 'comment', label: 'Comment', icon: 'msg' }
]

// The person's own tools (web/canvas/panels.js USER_TOOLS, web/canvas/marks.js): Move (pick and pan), Text (the
// picked section's words, or the next section clicked) and Comment (the same, its comment). V, T and C press them.
export const MINE = ['move', 'text', 'comment'] as const
export type MyTool = typeof MINE[number]

// The toolbar: the person's three tools, pressable, and every tool lit while an agent holds it (the rest are the
// crew's alone, as in the current deck)
export function Toolbar({ model, tool, onTool }: { model: DeckModel, tool: MyTool, onTool: (t: MyTool) => void }) {
  const hint = tool === 'text' ? 'Click a section to change its words' : tool === 'comment' ? 'Click a section to comment on it' : ''
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
      <p role="status" className={`rounded-[8px] border border-edge bg-deep px-2.5 py-1 font-monospace text-[13px] ${hint ? '' : 'sr-only'}`}>{hint}</p>
      <ul aria-label="Tools" className="flex items-center gap-1 rounded-[12px] border border-edge bg-deep p-1.5 shadow-[0_14px_40px_rgb(var(--shade-rgb)/.5)]">
        {TOOLS.map(t => {
          const who = model.agents.filter(a => a.layer && a.tool === t.id)
          const names = who.map(a => a.name)
          const label = names.length ? `${t.label}: ${names.join(', ')}` : t.label
          const dots = who.length > 0 && (
            <span aria-hidden className="absolute right-1 bottom-1 flex gap-0.5">
              {who.slice(0, 3).map(a => <i key={a.id} className="size-1.5 rounded-full" style={{ background: crew().color(a.name) }} />)}
            </span>
          )
          const mine = (MINE as readonly string[]).includes(t.id) ? t.id as MyTool : null
          return (
            <li key={t.id} aria-label={mine ? undefined : label} className="relative">
              {mine
                ? (
                    <Button role="ghost" aria-label={label} aria-pressed={tool === mine} aria-keyshortcuts={mine[0].toUpperCase()} onPress={() => onTool(mine)}
                      className={`relative size-10 min-w-10 px-0 ${tool === mine ? 'bg-panel-2! text-text outline-1 outline-frame-hi' : who.length ? 'bg-panel-2 text-text' : 'text-muted'}`}>
                      <Icon name={t.icon} size={18} />{dots}
                    </Button>
                  )
                : <span className={`relative grid size-10 place-items-center rounded-[8px] ${who.length ? 'bg-panel-2 text-text' : 'text-dim'}`}><Icon name={t.icon} size={18} />{dots}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// the status pill's words (openspec/specs/design-deck/spec.md, "Watching the crew")
export function progress(m: DeckModel, unfinished = false): string {
  const n = m.agents.filter(a => a.layer).length
  if (unfinished) return `Stopped before it finished · ${m.done} of ${m.planned} sections`
  const pages = (k: number) => `${k} page${k === 1 ? '' : 's'}`
  switch (m.state) {
    case 'empty': return 'Ready'
    case 'planning': return 'Planning the pages'
    case 'building': return n ? `${n} agent${n === 1 ? '' : 's'} building · ${m.done} of ${m.planned} sections` : `Building · ${m.done} of ${m.planned} sections`
    case 'done': return m.failed ? `${pages(m.pages.length)} built · ${m.failed} section${m.failed === 1 ? '' : 's'} failed` : `${pages(m.pages.length)} built`
    case 'stopped': return `Stopped · ${m.done} of ${m.planned} sections kept`
  }
}

// The build's status pill on the canvas (web/canvas.css .status, web/canvas/panels.js renderStatus): a dot that
// pulses while the crew works, what is happening, the sections done of those planned, and a bar that fills
export function StatusPill({ model, unfinished }: { model: DeckModel, unfinished: boolean }) {
  const state = unfinished || model.state === 'stopped' || model.state === 'empty' ? 'idle' : model.state === 'done' ? 'done' : model.state === 'planning' ? 'planning' : 'working'
  const pct = model.planned ? Math.round(100 * model.done / model.planned) : 0
  return (
    <div role="status" className="deck-status" data-state={state}>
      <span aria-hidden className="st-dot" />
      <span className="st-txt">{progress(model, unfinished)}</span>
      <span aria-hidden className="st-bar"><i style={{ width: `${state === 'planning' ? 0 : pct}%` }} /></span>
    </div>
  )
}

// the top row (Figma's): who is here, Play, Replay and the zoom. Play is the deck's one primary action (rule 17).
// Publish's label is its state (the breadboard's "Publish", "Publishing…", "Live"); Replay and Export, both acts on
// the build, are in the ⋯ menu beside it
// With a section picked, `design` (its Design tab) takes the variables' place, as Figma's right panel does
export function RightPanel({ model, zoom, onFit, canPlay, onPlay, replay, onPublish, onExport, design, history, publishRef }: {
  model: DeckModel, zoom: number, onFit: () => void, canPlay: boolean, onPlay: () => void,
  replay: { on: boolean, can: boolean, toggle: () => void }, onPublish: () => void, onExport: () => void,
  design?: ReactNode, history: { canUndo: boolean, canRedo: boolean, undo: () => void, redo: () => void, undoLabel?: string, redoLabel?: string, error: string },
  publishRef?: Ref<HTMLButtonElement>
}) {
  const pubLabel = model.publish.state === 'working' ? 'Publishing…' : model.publish.liveTarget && model.publish.state !== 'failed' ? 'Live' : 'Publish'
  const vars = Object.entries(model.theme?.vars ?? {})
  const fonts = model.theme?.fonts
  return (
    <aside aria-label="Design" className="flex w-[264px] flex-none flex-col overflow-y-auto border-l border-edge bg-deep max-md:hidden">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <ul aria-label="Crew" className="flex -space-x-1.5">
          {model.agents.map(a => (
            <li key={a.id} aria-label={a.layer ? `${a.name}, working` : a.name} className="size-6" dangerouslySetInnerHTML={{ __html: crew().avatar(a.name, 24) }} />
          ))}
        </ul>
        <Button role="ghost" onPress={onFit} aria-label={`Zoom ${Math.round(zoom * 100)}%, fit every page`} className="ml-auto px-2 font-monospace font-normal! normal-case! tracking-normal!">
          {Math.round(zoom * 100)}%
        </Button>
      </div>
      <div className="flex gap-2 border-b border-edge px-3 py-2">
        <Button role="primary" isDisabled={!canPlay} onPress={onPlay} className="flex-1"><Icon name="play" size={16} />Play</Button>
        {/* Publish as the current Studio's (web/canvas.css .toggle): a glass pill whose fill and edge ease in on hover */}
        <Button ref={publishRef} role="secondary" isDisabled={!canPlay} onPress={onPublish} className="deck-toggle"><Icon name="globe" size={16} />{pubLabel}</Button>
        <Menu label={<Icon name="more" size={18} />} name="Build" disabledKeys={[...(replay.can ? [] : ['replay']), ...(canPlay ? [] : ['export'])]}
          onAction={k => (k === 'replay' ? replay.toggle() : onExport())}>
          <MenuItem id="replay">{replay.on ? 'Stop replay' : 'Replay'}</MenuItem>
          <MenuItem id="export">Export</MenuItem>
        </Menu>
      </div>
      <div className="flex items-center gap-1 border-b border-edge px-3 py-1.5">
        <Button role="ghost" aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : 'Undo'} isDisabled={!history.canUndo} onPress={history.undo}><Icon name="restore" size={16} /></Button>
        <Button role="ghost" aria-label={history.redoLabel ? `Redo ${history.redoLabel}` : 'Redo'} isDisabled={!history.canRedo} onPress={history.redo}><Icon name="restore" size={16} className="-scale-x-100" /></Button>
        {history.error && <span role="alert" className="min-w-0 truncate font-monospace text-xs text-hot-text">{history.error}</span>}
      </div>
      {design}
      <section aria-labelledby="deck-vars" className={`px-4 py-3 ${design ? 'hidden' : ''}`}>
        <h3 id="deck-vars" className="pb-2 font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Variables</h3>
        {!vars.length && <p className="font-monospace text-[13px] text-muted">The planner sets these up first.</p>}
        <dl className="flex flex-col gap-1.5 font-monospace text-[13px]">
          {vars.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span aria-hidden className="size-4 flex-none rounded-[4px] border border-line-2" style={{ background: v }} />
              <dt className="min-w-0 flex-1 truncate">{k.replace(/^--/, '')}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
          {fonts?.heading && <div className="flex gap-2"><dt className="flex-1">heading</dt><dd className="text-muted">{fonts.heading}</dd></div>}
          {fonts?.body && <div className="flex gap-2"><dt className="flex-1">body</dt><dd className="text-muted">{fonts.body}</dd></div>}
          {model.theme?.radius && <div className="flex gap-2"><dt className="flex-1">radius</dt><dd className="text-muted">{model.theme.radius}</dd></div>}
        </dl>
      </section>
    </aside>
  )
}
