// What Projects shows, as plain functions of the server's lists and the person's choices: the same rules as
// web/home.js (refresh, shown, passes, versionCards), so both apps list the same cards. No React here, so
// tests/next-projects.test.mjs runs these in Node.

export interface Theme { colors: string[], fonts?: { heading?: string, display?: string } }
export interface ProjectState { kind: string, status: string, host?: string | null }
export interface Version {
  id: string, title?: string, t?: number, updated?: number, cover?: string | null, theme?: Theme | null,
  kinds?: string[], state?: ProjectState | null, live?: boolean, work?: { what?: string, pct?: number } | null
}
export interface Project {
  id: string, title: string, head: string | null, count: number, made?: number, updated?: number,
  cover?: string | null, theme?: Theme | null, kinds?: string[], state?: ProjectState | null, live?: boolean,
  folder?: string | null, trashed?: boolean, studio?: string | null, versions?: Version[],
  progress?: number | null, work?: { what?: string, pct?: number } | null,
  // a game's plan with no project yet (spec 21), or the plan a project's menu opens
  plan?: boolean, planId?: string
  // a stack's version drawn as a card of its own
  version?: boolean, project?: string
}
export interface Folder { name: string, count?: number }
export interface Plan { id: string, title: string, updated: string, locked?: boolean, cover?: string | null }
export interface Asset { project: string, name: string, kind: string, src?: string, poster?: string, type?: string, page?: string }
export interface Chat { id: string, title: string, kind?: string, state?: string, updated: number }

export type View = 'recent' | 'all' | 'chats' | 'assets' | 'trash' | 'folder'
export type Sort = 'edited' | 'name' | 'created'
export type Layout = 'grid' | 'list'

export const SORTS: [Sort, string][] = [['edited', 'Last edited'], ['name', 'Name'], ['created', 'Created']]
export const KINDS = ['Website', 'App', 'Game', 'Video']
export const STATUSES = ['Draft', 'Building', 'Designed', 'App built', 'App failed', 'Game built', 'Game failed', 'Brought in', 'Live']
export const STATUS_ICON: Record<string, string> = { Draft: 'pencil', Building: 'clock', Designed: 'frame', 'App built': 'code', 'App failed': 'x', 'Game built': 'game', 'Game failed': 'x', Live: 'globe' }
export const KIND_ICON: Record<string, string> = { Website: 'site', App: 'code', Game: 'game', Video: 'film' }
export const KIND = { site: 'site', app: 'code', game: 'game', film: 'film' } as Record<string, string>
export const KIND_NAME = { site: 'Site', app: 'App', game: 'Game', film: 'Film' } as Record<string, string>
export const VIEW_NAME: Record<Exclude<View, 'folder'>, string> = { recent: 'Recent', all: 'All projects', chats: 'Chats', assets: 'Assets', trash: 'Trash' }

const key = (s: unknown) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

// A plan is part of the project of the same name (or that name plus more words): the project's menu opens it.
// Only a plan with no project yet is a card of its own, one per name (a locked one always).
export function withPlans(projects: Project[], plans: Plan[]): Project[] {
  const real = projects.filter(p => !p.plan).map(p => ({ ...p }))
  const home = (k: string) => real.find(p => { const n = key(p.title); return n && (n === k || k.startsWith(`${n} `) || n.startsWith(`${k} `)) })
  const seen = new Set<string>(), loose: Plan[] = []
  for (const x of [...plans].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))) {
    const k = key(x.title), p = k ? home(k) : undefined
    if (p) { p.planId ||= x.id; continue }
    if (!x.locked && seen.has(k)) continue
    seen.add(k); loose.push(x)
  }
  return [...real, ...loose.map(x => ({ id: x.id, plan: true, title: x.title, head: null, count: 1, made: Date.parse(x.updated), updated: Date.parse(x.updated), cover: x.cover ?? null, kinds: ['game'], state: { kind: 'Game', status: x.locked ? 'Locked' : 'Plan' }, versions: [] }))]
}

// A version that failed, or a Draft that never got a section, is not shown once a newer one works: the project
// is its working versions. A newest version that failed does not name the card when an older one works.
const dead = (v?: { state?: ProjectState | null }) => /failed|^Draft$/i.test(String(v?.state?.status || ''))
export function working(projects: Project[]): Project[] {
  return projects.map(p => {
    if (!Array.isArray(p.versions) || p.versions.length < 2) return p
    const out = { ...p }
    const kept = p.versions.filter((v, i) => !(dead(v) && p.versions!.slice(0, i).some(n => !dead(n))))
    if (kept.length && kept.length < p.versions.length) { out.versions = kept; out.count = kept.length }
    const ok = dead(p) ? out.versions!.find(v => !dead(v)) : undefined
    if (ok?.state) out.state = ok.state
    return out
  })
}

export interface Choices { view: View, folder: string | null, q: string, filter: string, sort: Sort }
export const live = (ps: Project[]) => ps.filter(p => !p.trashed)
// when the person last saw a project: its last edit, or their last open of it (kept in the browser)
export const seenAt = (p: Project, opened: Record<string, number>) => Math.max(p.updated || 0, opened[p.id] || 0)

// the filter: 'k:Website' (a kind) or 's:Live' (a status); empty shows everything
export const passes = (filter: string) => (p: Project) => {
  if (!filter) return true
  const [t, v] = [filter.slice(0, 1), filter.slice(2)]
  return t === 'k' ? p.state?.kind === v : p.state?.status === v
}

export function shown(ps: Project[], c: Choices, opened: Record<string, number>): Project[] {
  const seen = (p: Project) => seenAt(p, opened)
  let list: Project[]
  if (c.view === 'trash') list = ps.filter(p => p.trashed)
  else if (c.view === 'folder') list = live(ps).filter(p => p.folder === c.folder)
  else if (c.view === 'recent') list = [...live(ps)].sort((a, b) => seen(b) - seen(a)).slice(0, 24)
  else list = live(ps)
  if (c.q) { const q = c.q.toLowerCase(); list = list.filter(p => p.title.toLowerCase().includes(q) || p.versions?.some(v => String(v.title || '').toLowerCase().includes(q))) }
  list = list.filter(passes(c.filter))
  const by = { edited: (a: Project, b: Project) => seen(b) - seen(a), name: (a: Project, b: Project) => a.title.localeCompare(b.title), created: (a: Project, b: Project) => (b.made || 0) - (a.made || 0) }[c.sort]
  return [...list].sort(by)
}

// a stack opened: each version a card of its own, named Version n (newest first), as the breadcrumb's menu says
export const versionCards = (p: Project): Project[] => (p.versions || []).map((v, i, all) => ({
  id: v.id, version: true, project: p.id, title: `Version ${all.length - i}`, head: v.id, cover: v.cover, theme: v.theme, kinds: v.kinds,
  state: v.state || null, count: 1, live: v.live, work: v.work || null, progress: v.work?.pct ?? null, updated: v.updated || v.t, made: v.t
}))

// only the kinds and states the projects really have
export const filterKinds = (ps: Project[]) => KINDS.filter(k => live(ps).some(p => p.state?.kind === k))
export const filterStates = (ps: Project[]) => STATUSES.filter(v => live(ps).some(p => p.state?.status === v))

// Assets: grouped by the project each came from, unfiled projects first, then each folder in the sidebar's order;
// the sort orders the projects too (by name, by when made, else the server's order: newest piece first)
export function assetGroups(assets: Asset[], ps: Project[], folders: Folder[], c: Pick<Choices, 'q' | 'filter' | 'sort'>) {
  const byId = new Map(live(ps).map(p => [p.id, p]))
  let list = assets.filter(a => byId.has(a.project) && passes(c.filter)(byId.get(a.project)!))
  if (c.q) { const q = c.q.toLowerCase(); list = list.filter(a => byId.get(a.project)!.title.toLowerCase().includes(q) || `${a.name} ${a.page || ''}`.toLowerCase().includes(q)) }
  let ids = [...new Set(list.map(a => a.project))]
  if (c.sort === 'name') ids.sort((a, b) => byId.get(a)!.title.localeCompare(byId.get(b)!.title))
  if (c.sort === 'created') ids.sort((a, b) => (byId.get(b)!.made || 0) - (byId.get(a)!.made || 0))
  const out: { folder: string | null, groups: { project: Project, assets: Asset[] }[] }[] = []
  for (const f of [null, ...folders.map(x => x.name)]) {
    const here = ids.filter(id => (byId.get(id)!.folder || null) === f)
    if (here.length) out.push({ folder: f, groups: here.map(id => ({ project: byId.get(id)!, assets: list.filter(a => a.project === id) })) })
  }
  return out
}

// "now", "5m", "3h", "2d", else the date
export function ago(t: number, now = Date.now()) {
  const d = (now - t) / 1000
  return d < 90 ? 'now' : d < 3600 ? `${Math.round(d / 60)}m` : d < 86400 ? `${Math.round(d / 3600)}h` : d < 86400 * 30 ? `${Math.round(d / 86400)}d` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// what Empty Trash and Delete forever said happened (web/home.js purge)
export function purgeSaid(out: { removed?: number, failed?: { id: string, title: string, code?: string, error?: string }[] }) {
  const n = out.removed || 0, failed = out.failed || []
  const gone = n ? `${n} project${n > 1 ? 's' : ''} deleted forever` : ''
  if (!failed.length) return { text: gone || 'Nothing to delete', retry: null }
  const held = failed.every(f => f.code === 'EBUSY' || f.code === 'EPERM')
  const kept = failed.length > 1 ? `${failed.length} stayed in Trash` : `${failed[0].title} stayed in Trash`
  return { text: `${gone ? `${gone}. ` : ''}${kept}: ${held ? 'a file in it is open' : failed[0].error}`, retry: failed.map(f => f.id) }
}
