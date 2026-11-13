// The Design deck's build, folded from the engine's events (web/canvas/events.js on(), ported): the pages, their
// sections in order, the crew and what each is doing, the design tokens the planner set. It only reads events, so
// the same fold serves a saved build (GET /api/runs/<run>/events) and the live stream (/events). Nothing here
// touches the page: the frames, cursors and panels draw from it.

export type ToolId = 'move' | 'frame' | 'rect' | 'text' | 'image' | 'connect' | 'comment'
export type LayerStatus = 'planned' | 'assigned' | 'streaming' | 'done' | 'failed'
export type DeckState = 'empty' | 'planning' | 'building' | 'done' | 'stopped'

export interface DeckPage { id: string, title: string, index: number }
export interface DeckLayer {
  key: string, page: string, id: string, role: string, height: number,
  status: LayerStatus, text: string, ver: number, agent: string | null
}
export interface DeckAgent { id: string, name: string, layer: string | null, tool: ToolId, idle: boolean }
export interface DeckTheme { name?: string, vars: Record<string, string>, fonts?: { heading?: string, body?: string }, radius?: string }

export interface DeckModel {
  run: string | null
  kind: 'site' | 'game'
  title: string
  state: DeckState
  pages: DeckPage[]
  layers: Record<string, DeckLayer>
  order: string[]
  agents: DeckAgent[]
  theme: DeckTheme | null
  planned: number
  done: number
  failed: number
  t0: number
  tEnd: number
}

// one engine event, as the server writes it; only the fields the deck reads are named
export interface DeckEvent {
  type: string
  run?: string
  t?: number
  [k: string]: unknown
}

export const key = (page: string, id: string) => `${page}/${id}`
// a section on every page (the nav, the footer) has page '*'
export const belongs = (page: string, l: DeckLayer) => l.page === '*' || l.page === page

export function empty(run: string | null = null): DeckModel {
  return { run, kind: 'site', title: '', state: 'empty', pages: [], layers: {}, order: [], agents: [], theme: null, planned: 0, done: 0, failed: 0, t0: 0, tEnd: 0 }
}

// What a stream is "doing" right now, read off its tail (web/canvas/deck.js detectTool).
export function detectTool(text: string): ToolId {
  if (text.lastIndexOf('<svg') > text.lastIndexOf('</svg>')) return 'image'
  const lt = text.lastIndexOf('<')
  if (lt < 0) return 'frame'
  const inTag = text.indexOf('>', lt) < 0
  const tag = text.slice(lt)
  const name = (tag.match(/^<\/?([a-z0-9]+)/i) || [])[1]?.toLowerCase() || ''
  if (/data-goto/.test(tag)) return 'connect'
  if (!inTag) return 'text'
  if (/^(h[1-6]|p|span|a|li|label|strong|em|small|blockquote|button)$/.test(name)) return 'text'
  if (/^(path|circle|rect|ellipse|line|polyline|polygon|g|img)$/.test(name)) return 'image'
  if (/\b(bg-|border|rounded|shadow)/.test(tag)) return 'rect'
  return 'frame'
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// a copy the next event may change; untouched pages, layers and agents are shared with the one before
function draft(m: DeckModel): DeckModel {
  return { ...m, pages: [...m.pages], layers: { ...m.layers }, order: [...m.order], agents: [...m.agents] }
}

function setLayer(m: DeckModel, k: string, patch: Partial<DeckLayer>) {
  const l = m.layers[k]
  if (l) m.layers[k] = { ...l, ...patch }
}

function setAgent(m: DeckModel, id: string, patch: Partial<DeckAgent>) {
  const i = m.agents.findIndex(a => a.id === id)
  if (i >= 0) m.agents[i] = { ...m.agents[i], ...patch }
}

const agentOf = (m: DeckModel, id: unknown) => m.agents.find(a => a.id === id)

// Apply one event to a copy of the model. Events of another build are not this deck's.
export function apply(m: DeckModel, e: DeckEvent): DeckModel {
  if (m.run && e.run && e.run !== m.run && e.type !== 'run:start' && e.type !== 'reset') return m
  switch (e.type) {
    case 'reset':
      return e.run && e.run !== m.run ? empty(e.run) : m
    case 'run:start': {
      const n = empty(e.run ?? m.run)
      n.t0 = num(e.t)
      n.state = 'planning'
      n.kind = e.kind === 'game' ? 'game' : 'site'
      n.title = (str(e.title) || str(e.brief)).slice(0, 60)
      const agents = Array.isArray(e.agents) ? e.agents as { id: string, name: string }[] : []
      n.agents = agents.map(a => ({ id: String(a.id), name: String(a.name), layer: null, tool: 'move', idle: true }))
      return n
    }
    case 'theme': {
      const n = draft(m)
      n.theme = { name: str(e.name), vars: (e.vars ?? {}) as Record<string, string>, fonts: e.fonts as DeckTheme['fonts'], radius: str(e.radius) || undefined }
      return n
    }
    case 'page': {
      const id = str(e.id)
      if (!id || m.pages.some(p => p.id === id)) return m
      const n = draft(m)
      n.pages.push({ id, title: str(e.title) || id, index: num(e.index) })
      n.pages.sort((a, b) => a.index - b.index)
      // the first page's title stands in until a run names itself
      if (n.pages[0]?.id === id && !n.title) n.title = n.pages[0].title
      return n
    }
    case 'layer:plan': {
      const k = key(str(e.page), str(e.id))
      if (m.layers[k]) return m
      const n = draft(m)
      n.layers[k] = { key: k, page: str(e.page), id: str(e.id), role: str(e.role) || str(e.id), height: Math.max(160, Math.min(900, num(e.height) || 360)), status: 'planned', text: '', ver: 0, agent: null }
      n.order.push(k)
      n.planned = Math.max(n.planned, n.order.length)
      return n
    }
    case 'plan:done': {
      const n = draft(m)
      n.state = 'building'
      if (num(e.layers)) n.planned = num(e.layers)
      return n
    }
    case 'agent:assign': {
      const k = key(str(e.page), str(e.layer))
      if (!m.layers[k] || !agentOf(m, e.agent)) return m
      const n = draft(m)
      if (n.state === 'planning') n.state = 'building'
      setLayer(n, k, { status: 'assigned', agent: String(e.agent) })
      setAgent(n, String(e.agent), { layer: k, idle: false, tool: 'frame' })
      return n
    }
    case 'layer:delta': {
      const k = key(str(e.page), str(e.layer))
      const l = m.layers[k]
      if (!l) return m
      const n = draft(m)
      const text = l.text + str(e.text)
      setLayer(n, k, { text, ver: l.ver + 1, status: l.status === 'assigned' ? 'streaming' : l.status })
      if (agentOf(n, e.agent)) setAgent(n, String(e.agent), { tool: detectTool(text) })
      return n
    }
    case 'agent:say': {
      if (!agentOf(m, e.agent)) return m
      const n = draft(m)
      setAgent(n, String(e.agent), { tool: 'comment' })
      return n
    }
    case 'layer:done': {
      const k = key(str(e.page), str(e.layer))
      const l = m.layers[k]
      if (!l) return m
      const n = draft(m)
      // saved runs carry the finished HTML, so a file opens without the stream
      const html = str(e.html)
      setLayer(n, k, html ? { status: 'done', text: html, ver: l.ver + 1 } : { status: 'done' })
      n.done = e.done != null ? num(e.done) : n.done + 1
      if (agentOf(n, e.agent)) setAgent(n, String(e.agent), { layer: null, tool: 'move' })
      return n
    }
    case 'layer:failed': {
      const k = key(str(e.page), str(e.layer))
      const l = m.layers[k]
      if (!l) return m
      const n = draft(m)
      // a failed fix puts the section back as it was
      const keep = str(e.keep)
      setLayer(n, k, keep ? { status: 'done', text: keep, ver: l.ver + 1 } : { status: 'failed' })
      if (!keep) n.failed++
      if (agentOf(n, e.agent)) setAgent(n, String(e.agent), { layer: null })
      return n
    }
    case 'agent:idle': {
      if (!agentOf(m, e.agent)) return m
      const n = draft(m)
      setAgent(n, String(e.agent), { idle: true, layer: null, tool: 'move' })
      return n
    }
    case 'run:done': {
      const n = draft(m)
      n.state = 'done'
      n.tEnd = num(e.t)
      if (e.done != null) n.done = num(e.done)
      if (e.failed != null) n.failed = num(e.failed)
      for (const a of n.agents) setAgent(n, a.id, { idle: true, layer: null, tool: 'move' })
      return n
    }
    case 'run:stopped': {
      // Stop: what is built is kept; a section caught half way is let go
      const n = draft(m)
      n.state = 'stopped'
      n.tEnd = num(e.t)
      for (const a of n.agents) setAgent(n, a.id, { idle: true, layer: null, tool: 'move' })
      for (const k of n.order) {
        const l = n.layers[k]
        if (l.status === 'assigned' || l.status === 'streaming') setLayer(n, k, { status: 'planned', agent: null, text: '' })
      }
      return n
    }
    default:
      return m
  }
}

export function fold(events: DeckEvent[], run: string | null = null): DeckModel {
  let m = empty(run)
  for (const e of events) m = apply(m, e)
  return m
}

// the sections of one page, in the order the planner gave them
export function layersOf(m: DeckModel, page: string): DeckLayer[] {
  return m.order.map(k => m.layers[k]).filter(l => belongs(page, l))
}
