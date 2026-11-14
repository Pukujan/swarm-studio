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
export type Host = 'github' | 'vercel' | 'cloudflare' | 'local'
// Publish (web/canvas/publish.js publishEvent): the steps while it goes, why it failed, or each host's live link
export interface DeckPublish {
  state: 'none' | 'working' | 'failed' | 'done'
  target: Host | null
  stage: string
  message: string
  live: Partial<Record<Host, string>>
  liveTarget: Host | null
  pending: boolean
}
// A section's comment thread: the person's notes and the crew's replies (comment, comment:take)
export interface Note { who: string, you: boolean, text: string, t: number }
// one of the Critic's issues on a section (review:issue), until the section is reworked
export interface Issue { problem: string, agent: string | null, t: number }
// A line of the build for the chat (web/canvas/panels.js feed): what the person asked, the crew's words, and the
// build's own news (planned, done, stopped, failed). `who` is the shared Chat's (src/chat/types.ts ChatLine).
export interface DeckLine { id: string, at: number, who: 'you' | 'hermia' | 'crew' | 'sys' | 'err', text: string, name?: string, layers?: string[] }
// the last Export (the `export` event): where it went and what it holds
export interface DeckExport { pages: number, sections: number, dir: string, zip: boolean }

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
  publish: DeckPublish
  exported: DeckExport | null
  threads: Record<string, Note[]>
  issues: Record<string, Issue>
  lines: DeckLine[]
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
export const NO_PUBLISH: DeckPublish = { state: 'none', target: null, stage: '', message: '', live: {}, liveTarget: null, pending: false }
const HOSTS: Host[] = ['github', 'vercel', 'cloudflare', 'local']
const hostOf = (v: unknown, or: Host | null): Host | null => (HOSTS.includes(v as Host) ? v as Host : or)
// a publish step older than this is history (a saved build reopened), not a publish going on now
const FRESH_MS = 8000
// a section on every page (the nav, the footer) has page '*'
export const belongs = (page: string, l: DeckLayer) => l.page === '*' || l.page === page

export function empty(run: string | null = null): DeckModel {
  return { run, kind: 'site', title: '', state: 'empty', pages: [], layers: {}, order: [], agents: [], theme: null, publish: NO_PUBLISH, exported: null, threads: {}, issues: {}, lines: [], planned: 0, done: 0, failed: 0, t0: 0, tEnd: 0 }
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

const LINES = 300
// the build's line for an event, if it has one (the last 300 are kept)
function lineOf(m: DeckModel, e: DeckEvent): DeckLine | null {
  const at = num(e.t), id = `${e.type}:${at}:${m.lines.length}`
  const agent = agentOf(m, e.agent)?.name
  const where = e.page && e.layer ? [key(str(e.page), str(e.layer))] : undefined
  switch (e.type) {
    case 'run:start': return str(e.ask) || str(e.brief) ? { id, at, who: 'you', text: str(e.ask) || str(e.brief) } : null
    case 'plan:done': return { id, at, who: 'sys', text: `Planned ${num(e.pages)} pages and ${num(e.layers)} sections in ${(num(e.ms) / 1000).toFixed(1)}s.` }
    case 'agent:say': return str(e.text) ? { id, at, who: 'crew', name: agent ?? 'The crew', text: str(e.text), layers: where } : null
    case 'comment': return str(e.text) ? { id, at, who: 'you', text: str(e.text), layers: str(e.target) ? [str(e.target)] : undefined } : null
    case 'comment:take': return { id, at, who: 'crew', name: agent ?? 'The crew', text: str(e.reply) || `On it, reworking the ${str(e.role) || str(e.layer)}.`, layers: where }
    case 'comment:none': return { id, at, who: 'hermia', text: 'Not sure which section that is about. Select one on the canvas and comment there.' }
    case 'layer:failed': return str(e.keep) ? null : { id, at, who: 'err', text: `${str(e.layer)} failed: ${str(e.message) || 'no reason given'}`, layers: where }
    case 'run:done': return { id, at, who: 'sys', text: `Done: ${num(e.done)}/${num(e.planned)} sections across ${num(e.pages)} pages in ${(num(e.ms) / 1000).toFixed(1)}s${num(e.failed) ? `, ${num(e.failed)} failed` : ''}.` }
    case 'run:stopped': return { id, at, who: 'sys', text: 'Stopped. Everything finished is kept.' }
    case 'error': return { id, at, who: 'err', text: `${str(e.where) || 'build'}: ${str(e.message)}` }
    default: return null
  }
}

// Apply one event to a copy of the model, with the build's line for it. Events of another build are not this deck's.
export function apply(m: DeckModel, e: DeckEvent): DeckModel {
  if (m.run && e.run && e.run !== m.run && e.type !== 'run:start' && e.type !== 'reset') return m
  const n = step(m, e)
  const line = lineOf(n, e)
  return line ? { ...n, lines: [...n.lines.slice(-(LINES - 1)), line] } : n
}

function step(m: DeckModel, e: DeckEvent): DeckModel {
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
      // the Critic's issue on it is fixed once it is written again
      if (m.issues[k] && num(e.t) >= m.issues[k].t) { const { [k]: _fixed, ...rest } = m.issues; n.issues = rest }
      // a section changed again (a hand edit, a fix, Undo) is still one section
      n.done = e.done != null ? num(e.done) : l.status === 'done' ? n.done : n.done + 1
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
    case 'publish:start':
    case 'publish:stage': {
      if (typeof e.t === 'number' && Date.now() - e.t > FRESH_MS) return m
      const n = draft(m)
      n.publish = { ...m.publish, state: 'working', stage: str(e.stage) || 'export', target: hostOf(e.target, m.publish.target), message: '' }
      return n
    }
    case 'publish:failed': {
      const n = draft(m)
      n.publish = { ...m.publish, state: 'failed', message: str(e.message), target: hostOf(e.target, m.publish.target) }
      return n
    }
    case 'publish:done': {
      const target = hostOf(e.target, null), url = str(e.url)
      if (!target || !url) return m
      const n = draft(m)
      const live = { ...m.publish.live, [target]: url }
      // a public link wins over this computer's
      const liveTarget = target !== 'local' || !m.publish.liveTarget || m.publish.liveTarget === 'local' ? target : m.publish.liveTarget
      n.publish = { ...m.publish, state: 'done', target, live, liveTarget, pending: !!e.pending, message: '' }
      return n
    }
    case 'comment': {
      // a note on one section (the person's); one the planner routes arrives with the crew's reply
      const k = str(e.target)
      if (!k || !m.layers[k] || !str(e.text)) return m
      const n = draft(m)
      n.threads = { ...m.threads, [k]: [...(m.threads[k] ?? []), { who: 'You', you: true, text: str(e.text), t: num(e.t) }] }
      return n
    }
    case 'comment:take': {
      const k = key(str(e.page), str(e.layer))
      if (!m.layers[k]) return m
      const n = draft(m)
      const a = agentOf(m, e.agent)
      const thread = m.threads[k] ?? []
      // a routed comment has no note of its own yet: the person's words come first
      const mine = thread.some(x => x.you && x.text === str(e.text)) || !str(e.text) ? [] : [{ who: 'You', you: true, text: str(e.text), t: num(e.t) }]
      const reply = str(e.reply) || `On it, reworking the ${str(e.role) || str(e.layer)}.`
      n.threads = { ...m.threads, [k]: [...thread, ...mine, { who: a?.name ?? 'The crew', you: false, text: reply, t: num(e.t) }] }
      return n
    }
    case 'review:issue': {
      const k = key(str(e.page), str(e.layer))
      if (!m.layers[k]) return m
      const n = draft(m)
      n.issues = { ...m.issues, [k]: { problem: str(e.problem), agent: typeof e.agent === 'string' ? e.agent : null, t: num(e.t) } }
      return n
    }
    case 'export': {
      const n = draft(m)
      n.exported = { pages: num(e.pages), sections: num(e.sections), dir: str(e.dir), zip: !!e.zip }
      return n
    }
    default:
      return m
  }
}

// the build's live link: the newest public one, else this computer's
export const liveUrl = (m: DeckModel) => (m.publish.liveTarget ? m.publish.live[m.publish.liveTarget] ?? '' : '')

// the finished sections, as Publish and Export send them (the crew's HTML; the server cleans and builds)
export const doneSections = (m: DeckModel) => m.order.map(k => m.layers[k]).filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, html: l.text }))

export function fold(events: DeckEvent[], run: string | null = null): DeckModel {
  let m = empty(run)
  for (const e of events) m = apply(m, e)
  return m
}

// the sections of one page, in the order the planner gave them
export function layersOf(m: DeckModel, page: string): DeckLayer[] {
  return m.order.map(k => m.layers[k]).filter(l => belongs(page, l))
}
