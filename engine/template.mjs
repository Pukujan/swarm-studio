// Remix (docs/specs/21-plan-before-spend.md): a plan saved as a template, and a new plan made from one.
// A template is a plan without its build state: the cards, the systems, the style, the picked sketch
// cells and the parts it already carries (made characters). A remix lands on the Plan board at the gate,
// priced for this creator: a carried part whose file is present is not charged again.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { planFromAnswers, planPrice, SETTINGS } from './plan.mjs'

export const TEMPLATE_ID = /^t-[a-z0-9]{3,20}$/
const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status })
const copy = x => JSON.parse(JSON.stringify(x ?? null))
const SAFE_FILE = /^[a-z0-9-]{1,80}\.(png|webp|jpe?g|glb)$/

// plan -> template (the files it names are copied by the store)
export function planTemplate(plan, { id = `t-${randomBytes(4).toString('hex')}`, name } = {}) {
  const done = e => e?.state === 'done'
  const sheets = (plan.sheets || []).filter(s => done(s) && s.picks?.length && SAFE_FILE.test(s.file || ''))
    .map(s => ({ kind: s.kind, grid: s.grid, picks: s.picks, notes: s.notes || {}, file: s.file }))
  const parts = (plan.build?.characters || []).filter(c => c.state === 'done' && done(c.model) && SAFE_FILE.test(c.model.file || ''))
    .map(c => ({ kind: 'character', name: c.name, file: c.model.file, views: ['front', 'side', 'back'].map(v => c[v]?.file).filter(f => SAFE_FILE.test(f || '')) }))
  return {
    id, v: 1, kind: 'game',
    name: clean(name, 80) || clean(plan.title, 80) || 'Game',
    from: plan.from || null,
    idea: plan.idea || '', answers: copy(plan.answers), cards: copy(plan.cards), systems: copy(plan.systems),
    style: { name: plan.style?.name || '', locked: !!plan.style?.locked, picks: plan.style?.picks || '' },
    settings: copy(plan.settings || SETTINGS),
    // the plan's shape (genre family, 2D or 3D, engine) travels with it; a template made before shapes has none
    ...(plan.shape ? { shape: copy(plan.shape), art: copy(plan.art), engine: copy(plan.engine) } : {}),
    sheets, parts,
    created: new Date().toISOString()
  }
}

// template -> a new plan (no id yet); has(file) says whether a carried file is really there
export function remixPlan(t, { has = () => false } = {}) {
  if (!t?.cards?.length) throw fail('not a template')
  const base = planFromAnswers({ idea: t.idea, answers: t.answers, title: t.name })
  const plan = {
    ...base,
    from: t.id,
    cards: copy(t.cards),
    systems: copy(t.systems) || base.systems,
    style: { name: t.style?.name || base.style.name, locked: !!t.style?.locked, picks: t.style?.picks || '', refs: [] },
    settings: { ...SETTINGS, ...(t.settings || {}) },
    // a template from before plan shapes (the built-in ARES) keeps the shape it was made with: no shape, 3D by its look
    shape: t.shape ? copy(t.shape) : undefined,
    art: t.shape ? copy(t.art) : undefined,
    engine: t.engine ? copy(t.engine) : base.engine
  }
  // the picked cells come along as finished sheets, so the style and the mocks start from them
  plan.sheets = (t.sheets || []).filter(s => has(s.file)).map((s, i) => ({ id: `s-r${i}${randomBytes(3).toString('hex')}`, kind: s.kind, grid: s.grid, picks: s.picks, notes: s.notes, file: s.file, state: 'done', carried: true }))
  plan.build.characters = (t.parts || []).filter(p => p.kind === 'character' && has(p.file))
    .map(p => ({ name: p.name, slug: clean(p.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-'), state: 'done', carried: true, model: { state: 'done', file: p.file } }))
  return plan
}

// <data>/templates/<id>.json and <data>/templates/<id>/<files>; built-in ones (games/*/plan.json) read-only
export function templateStore(dir, { builtIn = [] } = {}) {
  const file = id => join(dir, `${id}.json`)
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
  const builtins = () => builtIn.map(f => read(f)).filter(t => t && TEMPLATE_ID.test(t.id || '')).map(t => ({ ...t, builtIn: true }))
  return {
    dir,
    files: id => join(dir, id),
    get(id) {
      if (!TEMPLATE_ID.test(String(id || ''))) return null
      return builtins().find(t => t.id === id) || (existsSync(file(id)) ? read(file(id)) : null)
    },
    // saves the template and copies the files it names from the plan's folder
    save(t, fromDir) {
      if (!TEMPLATE_ID.test(t.id)) throw fail('bad template id')
      mkdirSync(join(dir, t.id), { recursive: true })
      const names = [...t.sheets.map(s => s.file), ...t.parts.flatMap(p => [p.file, ...(p.views || [])])]
      for (const n of names) {
        const src = n.endsWith('.glb') ? join(fromDir, 'models', n) : join(fromDir, n)
        if (SAFE_FILE.test(n) && existsSync(src)) copyFileSync(src, join(dir, t.id, basename(n)))
      }
      const tmp = `${file(t.id)}.part`
      writeFileSync(tmp, JSON.stringify(t, null, 1))
      renameSync(tmp, file(t.id))
      return t
    },
    list() {
      const own = existsSync(dir) ? readdirSync(dir).filter(f => /^t-[a-z0-9]+\.json$/.test(f)).map(f => read(join(dir, f))).filter(Boolean) : []
      return [...builtins(), ...own].map(t => ({ id: t.id, name: t.name, idea: t.idea, builtIn: !!t.builtIn, parts: (t.parts || []).length, price: planPrice(remixPlan(t)).credits }))
    }
  }
}
