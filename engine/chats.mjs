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

// ---------- the chat takes the name of what it is building (EVIDENCE 2026-11-17, failure 5)
// The owner, of a 55-turn chat titled "New game" whose game is called "Rank Juggler": "why is the chat so weird".
// A name the planner gave the build is the chat's name too, so the list says "Rank Juggler" and not "New game".
const NAMED = /^(new (chat|game|site|app|project|talk|build)|untitled|a game|a site|a new (game|site|app))$/i
// a title nobody chose: never set, empty, or one the Studio itself made ("New game", a chat named from the first
// words said). A name the person typed is theirs and is never taken, and neither is one already naming the build.
export function unnamed(chat) {
  const t = String(chat?.title || '').trim()
  if (!t || NAMED.test(t)) return true
  if (chat?.titleBy === 'person') return false
  if (t === String(titleFrom((chat?.turns || []).find(x => x.who === 'person')?.text || '') || '')) return true
  // an old chat file kept no titleBy: a "New game" is the default wherever it came from
  return !chat?.titleBy
}

// The chat's name follows the build's, when the chat has no name of its own. Returns whether it changed, so the
// caller writes the chat once (chatStore.update) and the change is in the list the person sees.
// nameMode 'given': the name was typed, so it is the person's too. 'planner': the planner or the idea gave it.
export function titleFromBuild(chat, name, nameMode = 'planner') {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!chat || !n || NAMED.test(n)) return false
  const own = String(chat.title || '').trim()
  if (own === n) {
    if (nameMode !== 'given' || chat.titleBy === 'person') return false
    chat.titleBy = 'person'
    return false
  }
  if (chat.titleBy === 'person') return false
  // a chat keeps the name it already has, unless that name came from the build and this is the build's name now
  const fromBuild = chat.titleFrom === 'build'
  if (own && !unnamed(chat) && !fromBuild) return false
  chat.title = n
  chat.titleBy = nameMode === 'given' ? 'person' : 'planner'
  chat.titleFrom = 'build'
  return true
}

// ---------- two chats that would read the same are told apart (same evidence)
// Two of the owner's chats were both "Rooftop Signal", and later two more both named after a first sentence, so
// neither could be picked out of the list. Pure over rows ({ id, title, kind, updated }), in the order given: the
// first of a set of the same name keeps it, and each next one says which it is — "Rooftop Signal · 14 Nov", or, for
// two chats named the same day, "Rooftop Signal · 14 Nov, 9:20". Rows with an id of their own that repeats nowhere
// are untouched, so an old list renders exactly as before.
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const KIND_WORD = { game: 'a game', site: 'a site', app: 'an app', film: 'a film' }
// a row's date from its own fields: `updated` is ms, or the ISO string an older plan's file kept
export function rowWhen(row) {
  const t = row?.updated
  const n = typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(t) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
const dayOf = ms => { const d = new Date(ms); return `${d.getDate()} ${MONTH[d.getMonth()]}` }
const hourOf = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export function distinguish(rows = []) {
  const list = Array.isArray(rows) ? rows.filter(r => r && r.id) : []
  const sets = new Map()
  for (const r of list) {
    const key = String(r.title || '').trim().toLowerCase()
    if (!key) continue
    if (!sets.has(key)) sets.set(key, [])
    sets.get(key).push(r)
  }
  return list.map(r => {
    const same = sets.get(String(r.title || '').trim().toLowerCase()) || []
    if (same.length < 2) return r
    const when = rowWhen(r)
    let suffix
    if (when) {
      const day = dayOf(when)
      suffix = same.filter(o => o !== r && (rowWhen(o) ? dayOf(rowWhen(o)) === day : false)).length ? `${day}, ${hourOf(when)}` : day
    }
    // a chat with no date at all: what it is building
    if (!suffix) suffix = KIND_WORD[r.kind] || ''
    // two chats made the same minute: what it is building after the time, so they still read differently
    const twin = when && same.some(o => o !== r && rowWhen(o) === when)
    if (twin && KIND_WORD[r.kind]) suffix = `${suffix}, ${KIND_WORD[r.kind]}`
    return suffix ? { ...r, title: `${String(r.title).trim()} · ${suffix}` } : r
  })
}

// chatStore(dataDir) or chatStore({ dataDir, now, onMove })
export function chatStore(arg) {
  const dataDir = typeof arg === 'string' ? arg : arg.dataDir
  const now = (typeof arg === 'object' && arg.now) || Date.now
  // onMove(chat, pid): a chat joined a project (a game talk's plan carries its art references there)
  const onMove = (typeof arg === 'object' && arg.onMove) || null
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
      const kept = write(chat)
      return out === undefined ? kept : out
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
    // cards: what a helper tool found (engine/helpers.mjs), each with its action, kept here so a pick is looked up on the turn
    for (const k of ['options', 'refs', 'marks', 'layers', 'made', 'reads', 'cards']) if (Array.isArray(t[k]) && t[k].length) turn[k] = t[k]
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
  // The chat takes the build's name (titleFromBuild above). Returns whether it changed, so a caller can say it.
  function nameFromBuild(id, name, nameMode = 'planner') {
    if (!ok(id) || !String(name || '').trim()) return Promise.resolve(false)
    return update(id, chat => titleFromBuild(chat, name, nameMode))
  }
  // the chat whose plan is this build's, loose or in a project (what /api/talk/plan/:id answers)
  function ofPlan(planId) {
    if (!planId) return null
    const hit = listDir(dir).find(c => c.plan === planId) || (existsSync(projectsDir) ? (() => { for (const pid of readdirSync(projectsDir)) { const c = listDir(inProject(pid)).find(x => x.plan === planId); if (c) return c } return null })() : null)
    return hit ? get(hit.id) : null
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
    }).then(out => { try { onMove?.(get(id), pid) } catch {} return out })
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
  // loose chats (not in a project), newest first; two named the same are told apart (distinguish)
  const listLoose = () => distinguish(newest(listDir(dir).filter(c => !c.project)).map(row))
  // a project's chats, grouped by category, each group newest first; empty groups are left out
  function forProject(pid) {
    if (!PID.test(String(pid || ''))) return { groups: [] }
    const all = newest(listDir(inProject(pid)))
    return { groups: CATEGORIES.map(name => ({ name, chats: distinguish(all.filter(c => c.category === name).map(row)) })).filter(g => g.chats.length) }
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

  // the chat a plan talks in (the Plan board's dock, web/planchat.js): the one that points at it, loose or in a
  // project; a plan with none (a template remix, one from before chats, a built one) gets one, as importPlans makes
  function forPlan(plan) {
    if (!plan?.id) return null
    let hit = listDir(dir).find(c => c.plan === plan.id)
    if (!hit && existsSync(projectsDir)) for (const pid of readdirSync(projectsDir)) if ((hit = listDir(inProject(pid)).find(c => c.plan === plan.id))) break
    if (hit) return get(hit.id)
    const [made] = importPlans([{ ...plan, build: null }])
    return made ? get(made) : null
  }

  return { dir, get, create, update, say, rename, setCategory, built, moveTo, settle, remove, listLoose, forProject, forMessage, cleanup, importPlans, forPlan, nameFromBuild, ofPlan, locate }
}

// ---------- a decision the planner read is said as read, not assumed (same evidence)
// The owner's chat recorded "roster locked: Hero 1, Hero 2, Hero 3" and `decisions` holding `by: 'planner'`,
// `why: 'the planner read it'`, with the chat never saying it had read it. This says it, in the turn where it
// applies: one quiet line naming each decision the planner read, so the person can correct any of them by typing.
const DECISION_LABEL = { family: 'Game', size: 'Size', art: 'Art', engine: 'Engine', title: 'Name', enemies: 'Enemies', combat: 'Combat', look: 'Look', money: 'Money', progression: 'Progression', cast: 'Cast' }
export function readLine(chat, { turn = null } = {}) {
  const d = chat?.decisions
  if (!d || typeof d !== 'object') return ''
  const picked = Object.entries(d)
    .filter(([, v]) => v && v.by === 'planner' && String(v.value ?? '').trim())
    .filter(([, v]) => !turn || v.turn === turn)
    .map(([k, v]) => `${DECISION_LABEL[k] || k}: ${String(v.value).trim()}`)
  if (!picked.length) return ''
  return `I read that from what you said: ${picked.join('; ')}. Type it differently and it changes.`
}
// a turn's text as it is shown, with that line where the planner read something and did not already say so.
// Old chats and turns the planner wrote are shown unchanged, and a text that already says it gets no second line.
export function readsSaid(text = '', chat = null, { turn = null } = {}) {
  const body = String(text || '').trim()
  if (!body || /i read/i.test(body)) return body
  const line = readLine(chat, { turn })
  return line ? `${body} ${line}` : body
}

export const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }
