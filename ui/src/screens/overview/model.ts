// The Overview's rules, as web/project.js has them: every file a build made, grouped into the Files panel's sections
// and the stage's, each artboard's size, what the inspector says of each, and where opening one goes. Plain functions
// over the server's answers (`/api/runs/:run/board`, `/api/projects`, a project's files and references), so Node
// tests them as they are (tests/next-overview.test.mjs) and both apps group and size the same files the same way.

export interface PlanRow { id: string, role?: string, h: number, done?: boolean }
export interface Page { id: string, title?: string, cover?: string | null, plan?: PlanRow[] }
export interface Art { src: string, page: string, layer: string, gen: number, name: string, used?: string, style?: string | null, hero?: boolean }
export interface Painting { page: string, layer: string, gen: number, name: string, used?: string, state: string, message?: string }
export interface Film { name: string, src: string, tall?: string | null, poster?: string | null, seconds?: number | null }
export interface Work { what?: string, pct?: number | null }
export interface Snaps { first?: string | null, pages?: Record<string, { v: string, s?: string, f?: string }> }
export interface Board {
  id: string, title?: string, kind?: string, live?: boolean, busy?: boolean,
  pages?: Page[], art?: Art[], painting?: Painting[], films?: Film[], style?: string | null,
  theme?: { colors: string[], fonts?: Record<string, string> | null } | null,
  game?: { title: string, pitch?: string, cover?: string | null, run?: string | null, work?: Work | null } | null,
  app?: boolean, code?: boolean, work?: Work | null, snaps?: Snaps
}
export interface Upload { name: string, type?: string, size?: number, src?: string }
export interface Ref { id: string, kind: string, name: string, src?: string, url?: string, use?: string, source?: string }
export interface Version { id: string }
export interface Project { id: string, title?: string, head?: string | null, versions?: Version[], parts?: Record<string, string> }

export type Kind = 'page' | 'app' | 'game' | 'film' | 'art' | 'upload' | 'ref' | 'code'
export interface Item {
  key: string, kind: Kind, name: string,
  full?: string, page?: string, src?: string | null, sharp?: string | null, snap?: boolean, cover?: string | null, plan?: PlanRow[],
  pitch?: string, run?: string | null, work?: Work | null, video?: string, seconds?: number | null,
  used?: string, style?: string | null, art?: Pick<Art, 'page' | 'layer' | 'gen' | 'name'>, pending?: Painting,
  type?: string, size?: number, sending?: number, ref?: Ref
}
// 'story' (spec 39) is listed so the order stays web/project.js's; its lane is not moved here yet, so nothing fills it
export type Section = 'site' | 'story' | 'app' | 'game' | 'film' | 'art' | 'uploads' | 'refs' | 'code'
export type Groups = Partial<Record<Section, Item[]>>

// the Files panel's order, and each section's name
export const SECTIONS: [Section, string][] = [['site', 'Site'], ['story', 'Story'], ['app', 'App'], ['game', 'Game'], ['film', 'Film'], ['art', 'Art'], ['uploads', 'Uploads'], ['refs', 'References'], ['code', 'Code']]
// the stage: two columns, pages and pictures on the left, the made things on the right
export const COLUMNS: Section[][] = [['site', 'art', 'uploads', 'refs'], ['game', 'app', 'film', 'code']]
export const SECTION_NAME = Object.fromEntries(SECTIONS) as Record<Section, string>
export const REF_FROM: Record<string, string> = { upload: 'Added here', chat: 'A chat', feed: 'The Feed', link: 'A link', plan: 'The plan', film: 'A film' }

// "Alpha Tea — tea for night shifts" is "Alpha Tea" in a list
export const shortTitle = (t = '') => t.split(/\s[—–|:-]\s/)[0]
const cap = (s: string) => s.replace(/^\w/, c => c.toUpperCase())
export const fmtTime = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

export interface Sending { name: string, pct: number, preview?: string | null }

// every file, grouped the way the panel and the stage show them (web/project.js groups())
export function groups(board: Board | null, uploads: Upload[] = [], refs: Ref[] = [], q = '', sending: Sending[] = []): Groups {
  const b = board || ({} as Partial<Board>)
  const snap = b.snaps?.pages || {}
  const g: Groups = {}
  if (b.pages?.length) g.site = b.pages.map((p): Item => ({ key: `page:${p.id}`, kind: 'page', name: shortTitle(p.title) || p.id, full: p.title, page: p.id, src: snap[p.id]?.s || p.cover || null, sharp: snap[p.id]?.f || null, snap: !!snap[p.id]?.s, cover: p.cover ?? null, plan: p.plan }))
  if (b.app) g.app = [{ key: 'app', kind: 'app', name: 'App' }]
  if (b.game) g.game = [{ key: 'game', kind: 'game', name: b.game.title, pitch: b.game.pitch || '', src: b.game.cover ?? null, run: b.game.run || null, work: b.game.work || null }]
  if (b.films?.length) g.film = b.films.map((f, i): Item => ({ key: `film:${i}`, kind: 'film', name: f.name, src: f.poster ?? null, video: f.src, seconds: f.seconds ?? null }))
  const arts: Item[] = (b.art || []).map((a): Item => ({ key: `art:${a.page}/${a.layer}/${a.gen}`, kind: 'art', name: cap(a.name), src: a.src, used: a.used ? shortTitle(a.used) : undefined, style: a.style, art: a }))
  // pictures still being made: a slot of their own, or over the old picture when one is painted again
  for (const w of b.painting || []) {
    const key = `art:${w.page}/${w.layer}/${w.gen}`
    const had = arts.find(x => x.key === key)
    if (had) had.pending = w
    else arts.push({ key, kind: 'art', name: cap(w.name), used: w.used ? shortTitle(w.used) : undefined, pending: w, art: { page: w.page, layer: w.layer, gen: w.gen, name: w.name } })
  }
  if (arts.length) g.art = arts
  const ups: Item[] = [
    ...uploads.map(u => ({ key: `up:${u.name}`, kind: 'upload' as const, name: u.name, src: /^image\//.test(u.type || '') ? u.src : null, type: u.type, size: u.size })),
    ...sending.map(s => ({ key: `up:${s.name}`, kind: 'upload' as const, name: s.name, sending: s.pct, src: s.preview ?? null }))
  ]
  if (ups.length) g.uploads = ups
  if (refs.length) g.refs = refs.map((r): Item => ({ key: `rf:${r.id}`, kind: 'ref', name: r.name, src: r.kind === 'image' ? r.src : null, ref: r }))
  if (b.code) g.code = [{ key: 'code', kind: 'code', name: 'App code' }]
  if (q) for (const k of Object.keys(g) as Section[]) { g[k] = g[k]!.filter(x => x.name.toLowerCase().includes(q.toLowerCase())); if (!g[k]!.length) delete g[k] }
  return g
}

export const findItem = (g: Groups, key: string | null) => (key ? Object.values(g).flat().find(x => x!.key === key) ?? null : null)

// a section is shut when the person shut it; Code starts shut
export const isShut = (open: Record<string, boolean>, k: Section) => open[k] === false || (k === 'code' && !open[k])

// ---------- sizes on the stage (web/project.css .ab.*, web/project.js pageH)
export const PAGE_W = 124
// a page is 124 wide and as long as it is, up to nine widths
export const pageH = (ratio: number) => Math.round(Math.min(PAGE_W * ratio, PAGE_W * 9))
export const USUAL: PlanRow[] = [{ id: 'hero', role: 'hero', h: 720 }, { id: 'a', h: 520 }, { id: 'b', h: 520 }, { id: 'c', h: 300 }]
export const planOf = (x: Pick<Item, 'plan'>) => (x.plan?.length ? x.plan : USUAL)
// never a thin strip: a page's tile is at least a little taller than wide
export const planRatio = (x: Pick<Item, 'plan'>) => Math.max(1.25, planOf(x).reduce((a, l) => a + l.h, 0) / 1280)
export const SIZE: Record<Kind, [number, number]> = { page: [PAGE_W, 233], game: [300, 169], app: [300, 169], code: [300, 169], film: [142, 80], art: [112, 112], upload: [112, 112], ref: [112, 112] }
// an artboard's size: a page grows to its snapshot's length once it is known, else to its plan's
export function boardSize(x: Item, aspect?: number): [number, number] {
  if (x.kind !== 'page') return SIZE[x.kind]
  const r = x.snap ? aspect : planRatio(x)
  return [PAGE_W, r ? pageH(r) : SIZE.page[1]]
}

// a page before its picture: a block per planned section, in its planned proportions (spec 36)
export function skeletonBlocks(x: Pick<Item, 'plan'>) {
  const plan = planOf(x), total = plan.reduce((a, l) => a + l.h, 0)
  let top = 0
  return plan.map((l, i) => {
    const b = { id: l.id, hero: i === 0 || l.role === 'hero', odd: i % 2 === 1, done: !!l.done, top: top / total, h: l.h / total }
    top += l.h
    return b
  })
}

// ---------- the inspector: what it says of a file, and what it offers
export function facts(x: Item, dims?: string): [string, string][] {
  return ([
    dims ? ['Size', dims] : null,
    x.style ? ['Style', x.style] : null,
    x.used ? ['Used on', x.used] : null,
    x.kind === 'film' && x.seconds ? ['Length', fmtTime(x.seconds)] : null,
    x.kind === 'upload' && x.size ? ['File', `${(x.size / 1024 / 1024).toFixed(x.size > 1048576 ? 1 : 2)} MB`] : null,
    x.kind === 'ref' && x.ref ? ['From', REF_FROM[x.ref.source || ''] || x.ref.source || ''] : null,
    x.kind === 'ref' && x.ref?.use ? ['Use', x.ref.use] : null,
    x.kind === 'ref' && x.ref?.kind === 'link' && x.ref.url ? ['Link', x.ref.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)] : null
  ] as ([string, string] | null)[]).filter((r): r is [string, string] => !!r && !!r[1])
}

export type Act = 'open' | 'export' | 'zip' | 'replace' | 'ref-remove'
export function acts(x: Item, hosted = false): Act[] {
  const up = x.kind === 'upload' && x.sending == null
  return ([
    (['page', 'game', 'app', 'code', 'film', 'art', 'ref'] as Kind[]).includes(x.kind) ? 'open' : null,
    x.kind === 'art' || up || x.kind === 'film' ? 'export' : null,
    x.kind === 'page' ? 'zip' : null,
    (x.kind === 'art' || up) && !hosted ? 'replace' : null,
    x.kind === 'ref' && !hosted ? 'ref-remove' : null
  ] as (Act | null)[]).filter((a): a is Act => !!a)
}

// ---------- opening a file: the room it lives in (an event for the machine), or a new tab
export type Opening = { event: { type: string, [k: string]: unknown }, page?: string } | { tab: string } | null
export function opening(x: Item, run: string | null, base = ''): Opening {
  if (x.kind === 'page' || x.kind === 'art') return { event: { type: 'room', room: 'deck' }, page: x.page || x.art?.page }
  if (x.kind === 'film') return { event: { type: 'room', room: 'video' } }
  // a game made from this site lives in its own run: its room is that run's
  if (x.kind === 'game' && x.run && x.run !== run) return { event: { type: 'room', room: 'game', run: x.run } }
  if (x.kind === 'game' || x.kind === 'app' || x.kind === 'code') return { event: { type: 'room', room: 'app' } }
  if (x.kind === 'upload' && x.src) return { tab: base + x.src }
  if (x.kind === 'ref' && x.ref) return { tab: x.ref.kind === 'link' ? x.ref.url || '' : base + (x.ref.src || '') }
  return null
}

// where a file is saved from, and the name it is saved as (web/project.js saveFile)
export function download(x: Item, pid: string | null): { href: string, name: string } | null {
  const src = x.kind === 'film' ? x.video : x.kind === 'upload' ? x.src || (pid ? `/up/${pid}/${encodeURIComponent(x.name)}` : null) : x.src
  if (!src) return null
  return { href: src, name: x.kind === 'upload' ? x.name : `${(x.name || 'file').replace(/[^\w.-]+/g, '-')}${(src.match(/\.\w+(?=$|\?)/) || [''])[0]}` }
}

// ---------- which project and what to show (web/project.js load())
// The project is the one this run belongs to; the one it was opened from only when the run is too new to be listed,
// so a name never sits over another project's pages.
export const projectOf = (list: Project[], run: string, opened: string | null) =>
  list.find(p => p.versions?.some(v => v.id === run) || p.parts?.[run]) || list.find(p => p.id === opened) || null

// What the Overview does on its own after loading, before it draws: a game still being built opens on its build once
// per open (`room game`), and back from a site's game the project shows the site's version (`open.version`).
export function moveAfterLoad(board: Board | null, project: Project | null, run: string, seenGame: boolean) {
  const pairGame = board?.game?.run || (board?.kind === 'game' ? run : null)
  const building = board?.kind === 'game' ? board.work || board.busy : board?.game?.work
  if (building && pairGame && !seenGame) return { type: 'room', room: 'game', run: pairGame }
  const up = project?.parts?.[run]
  if (project && up && up !== run) return { type: 'open.version', version: up, project: project.id }
  return null
}

// how soon to look again: often while something is happening, rarely when nothing is
export const pollMs = (b: Board | null) => (b?.busy ? 2000 : b?.live ? 3000 : 15000)

export const projectName = (project: Project | null, board: Board | null) => project?.title || shortTitle(board?.title) || 'New project'
