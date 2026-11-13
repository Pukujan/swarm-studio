// The Design deck's panels, in Figma's places (PATTERNS.md, "The Design deck follows Figma"): on the left the
// build's name, its Pages and the chosen page's Layers (a dot on a layer an agent is writing); along the bottom the
// toolbar, where a tool lights up while an agent uses it; on the right the crew, the progress and the zoom, and with
// nothing selected the build's variables, the design tokens the planner set up.
import { Button } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { crew } from './crew'
import { layersOf, type DeckModel, type LayerStatus, type ToolId } from './model'

const STATUS: Record<LayerStatus, string> = { planned: 'planned', assigned: 'starting', streaming: 'writing', done: 'done', failed: 'failed' }

export function LeftPanel({ model, page, onPage }: { model: DeckModel, page: string | null, onPage: (id: string) => void }) {
  const layers = page ? layersOf(model, page) : []
  const shown = model.pages.find(p => p.id === page)
  return (
    <aside aria-label="Pages and layers" className="flex w-[260px] flex-none flex-col overflow-y-auto border-r border-edge bg-deep max-md:hidden">
      <h2 className="truncate border-b border-edge px-4 py-3 font-label text-sm font-semibold uppercase tracking-[.1em]">{model.title || 'Untitled'}</h2>
      <section aria-labelledby="deck-pages" className="border-b border-edge px-2 py-3">
        <h3 id="deck-pages" className="px-2 pb-2 font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Pages</h3>
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
      {shown && (
        <section aria-labelledby="deck-layers" className="px-2 py-3">
          <h3 id="deck-layers" className="px-2 pb-2 font-label text-xs font-semibold uppercase tracking-[.12em] text-muted">Layers</h3>
          <ul className="flex flex-col">
            {layers.map(l => {
              const a = model.agents.find(x => x.id === l.agent)
              const busy = l.status === 'assigned' || l.status === 'streaming'
              return (
                <li key={l.key} className="flex min-h-9 items-center gap-2 px-2 font-monospace text-[13px]">
                  <span aria-hidden className={`size-2 flex-none rounded-full ${busy ? '' : 'invisible'}`} style={busy && a ? { background: crew().color(a.name) } : undefined} />
                  <span className="min-w-0 flex-1 truncate">{l.role}</span>
                  <span className={`text-xs ${l.status === 'failed' ? 'text-hot-text' : 'text-muted'}`}>{busy && a ? `${a.name} ${STATUS[l.status]}` : STATUS[l.status]}</span>
                </li>
              )
            })}
          </ul>
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

// Which tool each working agent holds. Display only in this slice: the person's own tools (Text, Comment) come
// with the editing and the marks.
export function Toolbar({ model }: { model: DeckModel }) {
  return (
    <ul aria-label="Tools" className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[12px] border border-edge bg-deep p-1.5 shadow-[0_14px_40px_rgb(var(--shade-rgb)/.5)]">
      {TOOLS.map(t => {
        const who = model.agents.filter(a => a.layer && a.tool === t.id)
        const names = who.map(a => a.name)
        return (
          <li key={t.id} aria-label={names.length ? `${t.label}: ${names.join(', ')}` : t.label}
            className={`relative grid size-10 place-items-center rounded-[8px] ${who.length ? 'bg-panel-2 text-text' : 'text-muted'}`}>
            <Icon name={t.icon} size={18} />
            {who.length > 0 && (
              <span aria-hidden className="absolute right-1 bottom-1 flex gap-0.5">
                {who.slice(0, 3).map(a => <i key={a.id} className="size-1.5 rounded-full" style={{ background: crew().color(a.name) }} />)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function progress(m: DeckModel): string {
  switch (m.state) {
    case 'empty': return 'No build yet'
    case 'planning': return 'Planning the pages'
    case 'building': return `Building · ${m.done} of ${m.planned} sections`
    case 'done': return m.failed ? `Done · ${m.done} of ${m.planned} sections, ${m.failed} failed` : `Done · ${m.done} of ${m.planned} sections`
    case 'stopped': return `Stopped · ${m.done} of ${m.planned} sections kept`
  }
}

export function RightPanel({ model, zoom, onFit }: { model: DeckModel, zoom: number, onFit: () => void }) {
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
      <p role="status" className="border-b border-edge px-4 py-2.5 font-monospace text-[13px] text-muted">{progress(model)}</p>
      <section aria-labelledby="deck-vars" className="px-4 py-3">
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
