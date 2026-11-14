// The chat store (docs/specs/29-chats-references-marks.md §Store). Every conversation with the
// planner lives here, apart from builds: a loose chat is <data>/chats/<id>/chat.json and is never
// listed in Projects; once it builds, its folder moves to <data>/projects/<pid>/chats/<id>/, where a
// project's chats are grouped by category (Design, App, Game, Video). Spec 27 (engine/talkplan.mjs)
// writes turns, decisions, spec, state and lead; this file writes the rest.
// One writer per chat: every change goes through update(), which waits for the one before it, and
// the record is written whole and renamed into place.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

export const CHAT_ID = /^c-[0-9a-f]{10}$/
export const KINDS = ['site', 'app', 'game', 'film']
export const CATEGORY = { site: 'Design', app: 'App', game: 'Game', film: 'Video' }
export const CATEGORIES = ['Design', 'App', 'Game', 'Video']
export const categoryOf = kind => CATEGORY[kind] || 'Design'
const DAY = 864e5
const PID = /^[\w-]{1,64}$/

export function newChat({ kind = 'site', title = '' } = {}, now = Date.now()) {
  const k = KINDS.includes(kind) ? kind : 'site'
  return {
    v: 1, id: `c-${randomBytes(5).toString('hex')}`, kind: k, category: CATEGORY[k], categoryBy: 'planner',
    title: String(title || '').slice(0, 80), titleBy: title ? 'person' : 'planner', created: now, updated: now,
    state: 'open', lead: 'person', project: null, plan: null, run: null,
    turns: [], decisions: {}, spec: null, refs: [], made: [], marks: []
  }
}

// a short name from the first thing said: what it is, not how they asked ("…, let's talk first"),
// its own name when they give one ("a game called army of ants"), cut at a word under 48 characters
export function titleFrom(text = '') {
  const called = /\b(?:called|named)\s+["“']?([^"”',.;:!?\n]{2,40})/i.exec(String(text))
  if (called) return called[1].trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Of|The|And|A|An|In|On|For|To)\b/g, (w, _, i) => (i ? w.toLowerCase() : w))
  let s = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '')
  const parts = s.split(/\s*[,;—–]\s*|\s+-\s+/)
  const kept = parts.filter(p => !/\b(talk|discuss|chat|grill|build|start|plan|wait|hold off|questions?)\b/i.test(p) || /\b(site|app|game|shop|store)\b/i.test(p))
  if (kept.length && kept.length < parts.length) s = kept.join(', ')
  if (!s) return ''
  const cut = s.length <= 48 ? s : `${s.slice(0, 48).replace(/\s+\S*$/, '') || s.slice(0, 48)}…`
  return cut[0].toUpperCase() + cut.slice(1)
}

// the deck talk's names for the two sides (you | hermia) as the record keeps them
export const whoOf = w => (w === 'hermia' || w === 'planner' ? 'planner' : w === 'crew' ? 'crew' : 'person')

// chatStore(dataDir) or chatStore({ dataDir, now })
export function chatStore(arg) {
  const dataDir = typeof arg === 'string' ? arg : arg.dataDir
  const now = (typeof arg === 'object' && arg.now) || Date.now
  const dir = join(dataDir, 'chats')
  const projectsDir = join(dataDir, 'projects')
  const trash = join(dir, '.trash')
  const inProject = pid => join(projectsDir, pid, 'chats')
  const ok = id => CHAT_ID.test(String(id || ''))

  // where a chat's folder is: loose first, then each project's chats
  function locate(id) {
    if (!ok(id)) return null
    if (existsSync(join(dir, id, 'chat.json'))) return join(dir, id)
    if (!existsSync(projectsDir)) return null
    for (const pid of readdirSync(projectsDir)) {
      const d = join(inProject(pid), id)
      if (existsSync(join(d, 'chat.json'))) return d
    }
    return null
  }
  const readAt = d => { try { return JSON.parse(readFileSync(join(d, 'chat.json'), 'utf8')) } catch { return null } }
  function write(chat, at = null) {
    const d = at || locate(chat.id) || (chat.project && PID.test(chat.project) ? join(inProject(chat.project), chat.id) : join(dir, chat.id))
    mkdirSync(d, { recursive: true })
    const f = join(d, 'chat.json')
    writeFileSync(`${f}.tmp`, JSON.stringify(chat, null, 1))
    renameSync(`${f}.tmp`, f)
    return chat
  }
  const get = id => { const d = locate(id); return d ? readAt(d) : null }

  // fn(chat) changes the record (it may be async); the result is written whole, then renamed into place.
  // Each update waits for the one before it on the same chat.
  const queues = new Map()
  function update(id, fn) {
    if (!ok(id)) return Promise.reject(Object.assign(new Error('bad chat id'), { status: 400 }))
    const run = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
      const chat = get(id)
      if (!chat) throw Object.assign(new Error('no such chat'), { status: 404 })
      const out = await fn(chat)
      chat.updated = now()
      write(chat)
      return out === undefined ? chat : out
    })
    queues.set(id, run)
    run.finally(() => { if (queues.get(id) === run) queues.delete(id) }).catch(() => {})
    return run
  }

  // a new chat: loose, or straight inside a project when it starts there; the first words name it
  function create({ kind = 'site', title = '', text = '', project = null } = {}) {
    const chat = newChat({ kind, title }, now())
    while (locate(chat.id)) chat.id = `c-${randomBytes(5).toString('hex')}`
    if (text) { chat.title ||= titleFrom(text); chat.turns.push(turnOf({ who: 'person', text }, chat)) }
    if (project && PID.test(project)) { chat.project = project; return write(chat, join(inProject(project), chat.id)) }
    return write(chat, join(dir, chat.id))
  }

  function turnOf(t, chat) {
    const turn = { id: `t${chat.turns.length + 1}`, who: whoOf(t.who), at: now(), text: String(t.text || '').slice(0, 8000), refs: [], marks: [], layers: [] }
    if (turn.who === 'planner') Object.assign(turn, { made: [], reads: [] })
    for (const k of ['options', 'refs', 'marks', 'layers', 'made', 'reads']) if (Array.isArray(t[k]) && t[k].length) turn[k] = t[k]
    return turn
  }
  // add a turn; a person's first words also name a chat nobody named yet
  function say(id, t) {
    return update(id, chat => {
      if (!String(t.text || '').trim()) return
      chat.turns.push(turnOf(t, chat))
      if (!chat.title && whoOf(t.who) === 'person') chat.title = titleFrom(t.text)
    })
  }
  function rename(id, title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!t) return Promise.reject(Object.assign(new Error('a name is needed'), { status: 400 }))
    return update(id, chat => { chat.title = t; chat.titleBy = 'person' })
  }
  function setCategory(id, category) {
    if (!CATEGORIES.includes(category)) return Promise.reject(Object.assign(new Error('unknown group'), { status: 400 }))
    return update(id, chat => { chat.category = category; chat.categoryBy = 'person' })
  }
  // a chat that started a build: Locked on the brief the crew builds from, with the run it started
  function built(id, { run, brief = '', project = null } = {}) {
    return update(id, chat => {
      chat.spec ||= { brief: '', open: [], art: [], engine: null, time: null, cost: null, lockedAt: null }
      if (brief) chat.spec.brief = String(brief).slice(0, 8000)
      chat.state = 'locked'
      chat.spec.lockedAt = now()
      if (run) chat.run = run
    }).then(() => (project ? moveTo(id, project) : get(id)))
  }
  // into a project's chats; a chat already in that project stays where it is
  function moveTo(id, pid) {
    if (!PID.test(String(pid || ''))) return Promise.reject(Object.assign(new Error('bad project'), { status: 400 }))
    return update(id, chat => {
      const from = locate(id), to = join(inProject(pid), id)
      if (from && from !== to) { mkdirSync(inProject(pid), { recursive: true }); renameSync(from, to) }
      chat.project = pid
    })
  }
  // loose chats that built before their run had a project: moved once it has one
  async function settle(projectOf) {
    for (const c of listDir(dir)) {
      if (!c.run) continue
      const pid = projectOf(c.run)
      if (pid) await moveTo(c.id, pid).catch(() => {})
    }
  }
  // to the trash, kept 30 days
  function remove(id) {
    return update(id, () => {}).then(() => {
      const d = locate(id)
      if (!d) throw Object.assign(new Error('no such chat'), { status: 404 })
      mkdirSync(trash, { recursive: true })
      renameSync(d, join(trash, `${now()}-${id}`))
      return { ok: true }
    })
  }

  function listDir(d) {
    if (!existsSync(d)) return []
    return readdirSync(d).filter(ok).map(n => readAt(join(d, n))).filter(Boolean)
  }
  const row = c => ({ id: c.id, kind: c.kind, category: c.category, title: c.title || 'New chat', state: c.state, plan: c.plan, updated: c.updated, turns: (c.turns || []).length, project: c.project || null })
  const newest = list => list.sort((a, b) => (b.updated || 0) - (a.updated || 0))
  // loose chats (not in a project), newest first
  const listLoose = () => newest(listDir(dir).filter(c => !c.project)).map(row)
  // a project's chats, grouped by category, each group newest first; empty groups are left out
  function forProject(pid) {
    if (!PID.test(String(pid || ''))) return { groups: [] }
    const all = newest(listDir(inProject(pid)))
    return { groups: CATEGORIES.map(name => ({ name, chats: all.filter(c => c.category === name).map(row) })).filter(g => g.chats.length) }
  }
  // the chat a project's next message belongs to: its newest in that group, or a new one there
  function forMessage(pid, kind = 'site') {
    const cat = categoryOf(kind)
    return newest(listDir(inProject(pid))).find(x => x.category === cat) || create({ kind, project: pid })
  }

  // on start: a loose chat nobody said anything in, a day old, goes; the trash keeps 30 days
  function cleanup() {
    for (const c of listDir(dir)) if (!(c.turns || []).some(t => t.who === 'person') && now() - (c.created || 0) > DAY) { try { rmSync(join(dir, c.id), { recursive: true, force: true }) } catch {} }
    if (existsSync(trash)) for (const n of readdirSync(trash)) {
      const at = Number(n.split('-')[0])
      if (at && now() - at > 30 * DAY) { try { rmSync(join(trash, n), { recursive: true, force: true }) } catch {} }
    }
  }

  // game plans made before chats existed (plans/p-*.json, never built): each gets a loose game chat
  // that points at it. The plan files stay where they are. Done once per plan.
  function importPlans(plans = []) {
    const known = new Set(listDir(dir).map(c => c.plan).filter(Boolean))
    if (existsSync(projectsDir)) for (const pid of readdirSync(projectsDir)) for (const c of listDir(inProject(pid))) if (c.plan) known.add(c.plan)
    const made = []
    for (const p of plans) {
      if (!p?.id || known.has(p.id) || p.build?.run) continue
      const idea = String(p.idea || '').trim()
      const chat = create({ kind: 'game', title: p.title && p.title !== 'New game' ? p.title : titleFrom(idea) || 'A game' })
      chat.plan = p.id
      chat.titleBy = 'planner'
      if (idea) chat.turns.push(turnOf({ who: 'person', text: idea }, chat))
      chat.created = Date.parse(p.created) || chat.created
      write(chat)
      made.push(chat.id)
    }
    return made
  }

  return { dir, get, create, update, say, rename, setCategory, built, moveTo, settle, remove, listLoose, forProject, forMessage, cleanup, importPlans, locate }
}

export const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }
