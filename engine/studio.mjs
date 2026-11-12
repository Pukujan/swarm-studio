// The Studio (docs/specs/37-studio-first.md): a project's studio record and its one brand.
//
//   projects/<pid>/studio.json   { v, kind, idea, depth, chat, steps, start, kit, proposal, locked }
//   (kit: the kind's kit's own working state, plain JSON it keeps between visits, e.g. a site's pages)
//   projects/<pid>/brand.json    the brand sheet (spec 31's shape), one per project
//
// Every write is read, changed and written in one go (no await between), so two calls never interleave.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const PID = /^[\w-]{1,64}$/
export const STEPS = ['brand', 'references', 'assets', 'plan']
export const STEP_STATES = ['empty', 'started', 'done', 'skipped']
export const DEPTHS = ['light', 'thorough']
export const STUDIO_KINDS = ['site', 'app', 'game', 'video', 'deck', 'brand']

const readJson = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
const writeJson = (f, v) => { const tmp = `${f}.tmp`; writeFileSync(tmp, JSON.stringify(v, null, 1)); renameSync(tmp, f) }
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })

// a new record: every step empty, the planner's start the first step the kind shows
export function newStudio({ kind = 'site', idea = '', depth = 'light', chat = null, steps = STEPS, start = null } = {}) {
  const k = STUDIO_KINDS.includes(kind) ? kind : 'site'
  const shown = STEPS.filter(s => steps.includes(s))
  return {
    v: 1, kind: k, idea: String(idea || '').trim().slice(0, 4000), depth: DEPTHS.includes(depth) ? depth : 'light', chat,
    steps: Object.fromEntries(shown.map(s => [s, 'empty'])), start: shown.includes(start) ? start : shown[0] || null,
    kit: {}, proposal: null, locked: null, made: Date.now()
  }
}

// projectsDir: where projects/<pid> live
export function studioStore({ projectsDir }) {
  const at = (pid, f) => join(projectsDir, pid, f)
  const need = pid => { if (!PID.test(String(pid || ''))) throw bad('no such project', 404) }

  function get(pid) {
    if (!PID.test(String(pid || ''))) return null
    return readJson(at(pid, 'studio.json'))
  }
  function make(pid, input) {
    need(pid)
    mkdirSync(join(projectsDir, pid), { recursive: true })
    const s = newStudio(input)
    writeJson(at(pid, 'studio.json'), s)
    return s
  }
  function update(pid, fn) {
    const s = get(pid)
    if (!s) throw bad('no studio for this project', 404)
    fn(s)
    s.updated = Date.now()
    writeJson(at(pid, 'studio.json'), s)
    return s
  }
  const step = (pid, name, state) => update(pid, s => {
    if (!(name in s.steps)) throw bad('no such step')
    if (!STEP_STATES.includes(state)) throw bad('empty, started, done or skipped')
    s.steps[name] = state
  })
  // the kit's own state: fields merged in (null drops one), at most 20 kB of JSON
  const kit = (pid, data) => update(pid, s => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad('an object')
    const next = { ...(s.kit || {}) }
    for (const [k, v] of Object.entries(data)) { if (v === null) delete next[k]; else next[k] = v }
    if (JSON.stringify(next).length > 20000) throw bad('too big', 413)
    s.kit = next
  })
  const depth = (pid, d) => update(pid, s => { if (!DEPTHS.includes(d)) throw bad('light or thorough'); s.depth = d })

  // the project's one brand, in the brand sheet's routes' store shape: get(id) -> { id, brand }, update(id, fn)
  const brands = {
    get(pid) {
      if (!PID.test(String(pid || '')) || !existsSync(join(projectsDir, pid))) return null
      return { id: pid, brand: readJson(at(pid, 'brand.json')) }
    },
    update(pid, fn) {
      const rec = brands.get(pid)
      if (!rec) return Promise.reject(bad('no such project', 404))
      try { fn(rec) } catch (err) { return Promise.reject(err) }
      if (rec.brand) writeJson(at(pid, 'brand.json'), rec.brand)
      return Promise.resolve(rec)
    }
  }
  return { get, make, update, step, depth, kit, brands }
}

// The brand a kit reads: the project's first, then the chat's (spec 31, a talk with no project yet)
export function brandOf({ project = null, chat = null, studios, chats }) {
  return (project && studios?.brands.get(project)?.brand) || (chat && chats?.get(chat)?.brand) || null
}
