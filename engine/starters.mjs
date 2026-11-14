// Game starters (docs/specs/38-game-starters.md): a starter is a folder that ships inside the plugin
// (starters/<id>/starter.json and its project files), holding the systems a genre needs already working,
// so a generated game holds up at scale and the crew builds the game's own scenes on top of them.
// Nothing is downloaded at build time: add-ons live in starters/addons/<id>/ with where they came from.
//
// A plan carries its starter as three choices and a set of systems, each with a reason and who chose it:
//   plan.starter = { engine: {value, why, by}, template: {value, why, by}, assets: {value, why, by},
//                    systems: { [id]: {on, by} } }
// The planner suggests; the person keeps or removes; a person's choice is never overwritten.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STARTERS_DIR = fileURLToPath(new URL('../starters/', import.meta.url))
export const ADDONS_DIR = join(STARTERS_DIR, 'addons')
export const ENGINES = {
  web: { name: 'The browser', why: 'plays right here in the Studio and on any phone, nothing to install' },
  godot: { name: 'Godot 4', why: 'a real engine project you can open, change and ship to desktop or consoles' }
}
export const PAINT = { id: 'paint', name: 'Paint my own', why: 'the crew paints the art for this game once the plan is locked' }
const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/

const readJson = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
let cache = null
// every starter shipped in the plugin, read once
export function starters(dir = STARTERS_DIR) {
  if (cache && dir === STARTERS_DIR) return cache
  const out = !existsSync(dir) ? [] : readdirSync(dir).filter(n => ID.test(n) && n !== 'addons')
    .map(n => readJson(join(dir, n, 'starter.json'))).filter(s => s && ID.test(s.id || ''))
  if (dir === STARTERS_DIR) cache = out
  return out
}
export const starterById = (id, list = starters()) => list.find(s => s.id === id) || null
// an add-on's record: where it came from (ours | pinned | brought), its version, licence and credits
export function addonOf(id, dir = ADDONS_DIR) {
  if (!ID.test(String(id || ''))) return null
  const a = readJson(join(dir, id, 'addon.json'))
  return a ? { id, ...a } : null
}

const engineOf = plan => (plan?.shape?.engine?.target === 'godot' || /godot/i.test(String(plan?.engine?.target || '')) ? 'godot' : 'web')
// the starters that fit a plan's genre family (any engine), best first
export const fitting = (plan, list = starters()) => list.filter(s => (s.families || []).includes(plan?.shape?.family))
const wants = (plan, word) => new RegExp(`\\b${word}`, 'i').test([plan?.idea, plan?.note, JSON.stringify(plan?.cards || [])].join(' '))

// The planner's suggestion for a plan, keeping every choice the person made in `was`.
export function suggestStarter(plan, was = null, list = starters()) {
  const kept = (k, v) => (was?.[k]?.by === 'person' ? was[k] : v)
  const engine = kept('engine', { value: engineOf(plan), why: ENGINES[engineOf(plan)].why, by: 'planner' })
  const fits = fitting(plan, list)
  const forEngine = fits.find(s => (s.engines || []).includes(engine.value))
  const t = forEngine || null
  const template = kept('template', t
    ? { value: t.id, why: t.why, by: 'planner' }
    : { value: null, why: fits.length ? `${fits[0].name} is made for ${fits[0].engines.map(e => ENGINES[e]?.name || e).join(' or ')} only` : 'no starter for this kind of game yet; the crew starts from an empty project', by: 'planner' })
  const tpl = starterById(template.value, list)
  const pack = tpl?.assets?.[0]
  const assets = kept('assets', pack ? { value: pack.id, why: pack.why, by: 'planner' } : { value: PAINT.id, why: PAINT.why, by: 'planner' })
  const systems = {}
  for (const s of tpl?.systems || []) {
    const before = was?.systems?.[s.id]
    systems[s.id] = before?.by === 'person' && !s.required ? before : { on: s.required ? true : typeof s.on === 'string' ? wants(plan, s.on) : s.on !== false, by: 'planner' }
  }
  return { engine, template, assets, systems }
}

// The person keeps, changes or removes one choice: { key: 'engine'|'template'|'assets', value } or
// { system, on }. A required system stays on. Changing the template resets its systems to the suggestion.
export function setStarter(plan, change = {}, list = starters()) {
  const st = plan.starter || suggestStarter(plan, null, list)
  if (change.system) {
    const s = starterById(st.template.value, list)?.systems?.find(x => x.id === change.system)
    if (!s) throw Object.assign(new Error('no such system in this starter'), { status: 400 })
    if (s.required && !change.on) throw Object.assign(new Error(`${s.name} is part of this starter`), { status: 409 })
    st.systems[s.id] = { on: !!change.on, by: 'person' }
  } else if (change.key === 'engine') {
    if (!ENGINES[change.value]) throw Object.assign(new Error('the browser or Godot 4'), { status: 400 })
    st.engine = { value: change.value, why: ENGINES[change.value].why, by: 'person' }
    const t = starterById(st.template.value, list)
    if (t && !t.engines.includes(change.value) && st.template.by !== 'person') Object.assign(st, suggestStarter(plan, { engine: st.engine, assets: st.assets }, list))
  } else if (change.key === 'template') {
    const t = change.value == null || change.value === '' ? null : starterById(change.value, list)
    if (change.value && !t) throw Object.assign(new Error('no such starter'), { status: 400 })
    if (t && !t.engines.includes(st.engine.value)) throw Object.assign(new Error(`${t.name} is made for ${t.engines.map(e => ENGINES[e]?.name || e).join(' or ')}`), { status: 409 })
    st.template = t ? { value: t.id, why: t.why, by: 'person' } : { value: null, why: 'the crew starts from an empty project', by: 'person' }
    st.systems = suggestStarter(plan, { ...st, systems: {} }, list).systems
    if (!t && st.assets.value !== PAINT.id) st.assets = { value: PAINT.id, why: PAINT.why, by: 'planner' }
  } else if (change.key === 'assets') {
    const t = starterById(st.template.value, list)
    const pack = change.value === PAINT.id ? PAINT : t?.assets?.find(a => a.id === change.value)
    if (!pack) throw Object.assign(new Error('no such asset pack'), { status: 400 })
    st.assets = { value: pack.id, why: pack.why, by: 'person' }
  } else throw Object.assign(new Error('engine, template, assets or a system'), { status: 400 })
  plan.starter = st
  return st
}

// The board's view of a plan's starter: each choice with its options, and the systems as cards.
export function starterView(plan, list = starters()) {
  const st = plan?.starter
  if (!st) return null
  const t = starterById(st.template.value, list)
  const fits = fitting(plan, list)
  return {
    engine: { ...st.engine, name: ENGINES[st.engine.value]?.name, options: Object.entries(ENGINES).map(([id, e]) => ({ id, name: e.name, why: e.why })) },
    template: { ...st.template, name: t?.name || 'None', options: fits.map(s => ({ id: s.id, name: s.name, why: s.why, fits: s.engines.includes(st.engine.value) })) },
    assets: { ...st.assets, name: st.assets.value === PAINT.id ? PAINT.name : t?.assets?.find(a => a.id === st.assets.value)?.name || st.assets.value, options: [...(t?.assets || []), PAINT].map(a => ({ id: a.id, name: a.name, why: a.why })) },
    systems: (t?.systems || []).map(s => ({ id: s.id, name: s.name, why: s.why, required: !!s.required, on: !!st.systems?.[s.id]?.on, by: st.systems?.[s.id]?.by || 'planner' })),
    addons: (t?.addons || []).map(id => addonOf(id)).filter(Boolean).map(a => ({ id: a.id, name: a.name, version: a.version, source: a.source, licence: a.licence })),
    web: t?.web || ''
  }
}

// What the locked spec records, and the build reads: only this.
export function starterSpec(plan, list = starters()) {
  const st = plan?.starter
  if (!st) return null
  const t = starterById(st.template.value, list)
  return {
    engine: st.engine.value,
    template: t ? { id: t.id, version: t.version } : null,
    assets: st.assets.value,
    systems: (t?.systems || []).filter(s => st.systems?.[s.id]?.on).map(s => s.id),
    addons: (t?.addons || []).map(id => addonOf(id)).filter(Boolean).map(a => ({ id: a.id, version: a.version, source: a.source }))
  }
}

// A starter assembled into a project folder: its engine files, then each add-on under addons/<id>/.
// Files the crew already wrote there are kept (a starter only seeds an empty or new project).
// → the relative paths written
export function assembleStarter(id, dest, { engine = 'godot', list = starters(), force = false } = {}) {
  const t = starterById(id, list)
  if (!t) throw Object.assign(new Error('no such starter'), { status: 400 })
  const written = []
  const copy = (from, to, rel = '') => {
    for (const n of readdirSync(from)) {
      if (n === '.godot' || n === 'build' || n.startsWith('.DS')) continue
      const src = join(from, n), dst = join(to, n), r = rel ? `${rel}/${n}` : n
      if (statSync(src).isDirectory()) { mkdirSync(dst, { recursive: true }); copy(src, dst, r); continue }
      if (!force && existsSync(dst)) continue
      copyFileSync(src, dst)
      written.push(r)
    }
  }
  const root = join(STARTERS_DIR, t.id, engine)
  if (!existsSync(root)) throw Object.assign(new Error(`${t.name} has no ${engine} project`), { status: 409 })
  mkdirSync(dest, { recursive: true })
  copy(root, dest)
  for (const a of t.addons || []) {
    const from = join(ADDONS_DIR, a)
    if (!existsSync(from)) continue
    mkdirSync(join(dest, 'addons', a), { recursive: true })
    copy(from, join(dest, 'addons', a), `addons/${a}`)
  }
  return written
}
// what the crew is told about the starter it builds on (starters/<id>/CREW.md)
export function crewBrief(id, list = starters()) {
  const t = starterById(id, list)
  if (!t) return ''
  try { return readFileSync(join(STARTERS_DIR, t.id, 'CREW.md'), 'utf8').trim() } catch { return '' }
}

// ---------- add-ons, in order of trust (spec 38): ours, pinned (vendored at an exact version), brought
export const SOURCES = ['ours', 'pinned', 'brought']
export const ADDON_LIMIT = { ours: 200_000, pinned: 2_000_000, brought: 5_000_000 } // bytes
const NATIVE = /\.(dll|so|dylib|gdextension|framework|wasm)$/i

// every file under an add-on folder, as sorted relative paths
export function addonFiles(dir, rel = '') {
  const out = []
  for (const n of readdirSync(join(dir, rel))) {
    if (n.startsWith('.')) continue
    const r = rel ? `${rel}/${n}` : n
    if (statSync(join(dir, r)).isDirectory()) out.push(...addonFiles(dir, r))
    else out.push(r)
  }
  return out.sort()
}
// one sha256 over the files' paths and bytes (addon.json itself left out): what a pinned add-on records
export function addonSum(dir, files = addonFiles(dir).filter(f => f !== 'addon.json')) {
  const h = createHash('sha256')
  for (const f of [...files].sort()) { h.update(f); h.update('\0'); h.update(readFileSync(join(dir, f))); h.update('\0') }
  return h.digest('hex')
}

// Whether an add-on folder is what its addon.json says. → { ok, problems: [text] }
export function checkAddon(dir) {
  const a = readJson(join(dir, 'addon.json'))
  if (!a) return { ok: false, problems: ['no addon.json'] }
  const problems = []
  if (!SOURCES.includes(a.source)) problems.push(`source is ${a.source}: ours, pinned or brought`)
  for (const k of ['name', 'version', 'licence', 'credits']) if (!a[k]) problems.push(`no ${k}`)
  const files = addonFiles(dir).filter(f => f !== 'addon.json')
  for (const f of a.files || []) if (!files.includes(f)) problems.push(`${f} is listed but missing`)
  const bytes = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0)
  if (bytes > (ADDON_LIMIT[a.source] || 0)) problems.push(`${bytes} bytes, over the ${ADDON_LIMIT[a.source]} for ${a.source}`)
  const native = files.some(f => NATIVE.test(f))
  if (native && !a.native) problems.push('has native files (GDExtension) but says native: false')
  if (native && a.web) problems.push('native files cannot run in the Web export (web must be false)')
  if (a.source === 'pinned') {
    if (!/^https:\/\//.test(a.url || '')) problems.push('a pinned add-on records its https url')
    if (!/^\d+\.\d+(\.\d+)?/.test(a.version || '')) problems.push('a pinned add-on is pinned to an exact version')
    if (a.sha256 !== addonSum(dir, files)) problems.push('sha256 does not match the vendored files')
  }
  return { ok: !problems.length, problems }
}

// An add-on the person brings (dropped in like an asset): copied into the project's addons/<id>/ with
// where it came from. Native files mark it native, so the Web preview gives way to Open in Godot.
// → its addon.json record
export function bringAddon(from, project, { name, url = '', licence = 'unknown', credits = 'the person' } = {}) {
  const id = String(name || basename(from)).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  if (!ID.test(id)) throw Object.assign(new Error('name the add-on'), { status: 400 })
  if (!existsSync(from) || !statSync(from).isDirectory()) throw Object.assign(new Error('an add-on is a folder'), { status: 400 })
  const files = addonFiles(from).filter(f => f !== 'addon.json')
  if (!files.some(f => /(^|\/)plugin\.cfg$|\.gd$|\.gdextension$/.test(f))) throw Object.assign(new Error('not a Godot add-on: no plugin.cfg, script or GDExtension'), { status: 400 })
  const bytes = files.reduce((n, f) => n + statSync(join(from, f)).size, 0)
  if (bytes > ADDON_LIMIT.brought) throw Object.assign(new Error(`too big: ${Math.round(bytes / 1e6)} MB, the limit is 5 MB`), { status: 413 })
  const to = join(project, 'addons', id)
  for (const f of files) { mkdirSync(join(to, f, '..'), { recursive: true }); copyFileSync(join(from, f), join(to, f)) }
  const native = files.some(f => NATIVE.test(f))
  const meta = { name: name || id, version: readJson(join(from, 'addon.json'))?.version || 'as brought', source: 'brought', licence, credits, ...(url ? { url } : {}), web: !native, native, sha256: addonSum(to, files), files }
  writeFileSync(join(to, 'addon.json'), JSON.stringify(meta, null, 1) + '\n')
  return { id, ...meta }
}
