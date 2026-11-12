// Plan before spend (docs/specs/21-plan-before-spend.md).
//
// A few quick questions become nine editable Plan cards (Cast, Story, Combat, Enemies,
// Progression, World, Look, Money, Systems). Cheap previews come next (sketch sheets, mock
// screenshots, backdrops), and one Lock button carries the price of everything expensive:
// Meshy credits per character, the rig, one shared animation set, props, and an estimate of
// the coding runs. Nothing expensive runs for a plan until it is locked at the price shown.
//
// Pure functions plus a small file store: no network, no model calls, no credits.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { PRICE } from './meshy.mjs'
import { keyFor } from './keycolor.mjs'
import { shapeOf, familyCards, noShooting, GUNS, planSummary } from './planshape.mjs'

// ---------- the questions: one at a time, 4–6 chips each, or your own words
export const PLAN_QUESTIONS = [
  { id: 'genre', label: 'Genre', q: 'What kind of game?', chips: ['Action RPG', 'Roguelike brawler', 'Boss rush', 'Platformer', 'Arena shooter'], free: true },
  { id: 'cast', label: 'Cast', q: 'Who is in the cast?', chips: ['Girls only', 'Mixed cast', 'One hero', 'Monsters and mechs'], free: true },
  { id: 'size', label: 'Playable characters', q: 'How many playable characters?', chips: ['1', '3', '6', '8'] },
  { id: 'combat', label: 'Combat', q: 'How does fighting feel?', chips: ['Stylish combos', 'Hit and run', 'Shooting', 'Light and casual'], free: true },
  { id: 'enemies', label: 'Enemies', q: 'What do you fight?', chips: ['Minions, elites, bosses', 'Boss rush', 'Endless waves', 'No fights'], free: true },
  { id: 'progression', label: 'Progression', q: 'How do you grow?', chips: ['Pick 1 of 3 level-ups', 'Gear and upgrades', 'Story chapters', 'New Game+'], free: true },
  { id: 'money', label: 'Money', q: 'How does it make money?', chips: ['Free', 'Free + cosmetics', 'Premium', 'Subscription'] },
  { id: 'look', label: 'Look', q: 'What should it look like?', chips: ['Anime cel-shaded', 'Painterly anime', 'Pixel art', 'Flat and bold'], free: true }
]

export const DEFAULTS = { genre: 'Action RPG', cast: 'Mixed cast', size: '3', combat: 'Stylish combos', enemies: 'Minions, elites, bosses', progression: 'Pick 1 of 3 level-ups', money: 'Free', look: 'Anime cel-shaded' }

// The order and names of the cards; one source for the board and the tests.
export const CARDS = [['cast', 'Cast'], ['story', 'Story'], ['combat', 'Combat'], ['enemies', 'Enemies'], ['progression', 'Progression'], ['world', 'World'], ['look', 'Look'], ['money', 'Money'], ['systems', 'Systems']]

// The modules the Systems card switches (engine/systems.mjs holds what each one asks the builder for).
export const SYSTEMS = [['logins', 'Logins'], ['payments', 'Payments'], ['subscriptions', 'Subscriptions'], ['leaderboard', 'Leaderboard'], ['gacha', 'Gacha'], ['pilot', 'Autoplay pilot'], ['enemyAI', 'Enemy AI'], ['loadout', 'Loadout']]

// What the expensive parts cost, in one place (Meshy credits, spec 20's table, as of 2026-10-12).
export const COST = {
  model: (PRICE['meshy-6'] || { textured: 30 }).textured, // multi-image-to-3D, textured
  rig: PRICE.rig ?? 5,
  clip: 3, // one animation clip on the shared rig
  prop: (PRICE['meshy-6-lite'] || { textured: 15 }).textured
}
export const SETTINGS = { polycount: 40000, clips: 8, stages: 3, backdropsPerStage: 3 }
export const ANIMATIONS = ['idle', 'light attack', 'heavy attack', 'launcher', 'air combo', 'dodge', 'hit', 'down']

// Art at close-ups, 3D at a distance (spec 21): the rule the game's build prompt carries.
export const CLOSEUP_RULE = `Art at close-ups, 3D at a distance:
- Wherever the camera is close, use the painted character art, never a render of the 3D model: ult cut-ins (public/art/<name>-cutin.png, 16:9, waist-up action pose, the name in the empty side), boss intro and stage-change cards, dialogue (public/art/<name>-portrait.png), character select, the level-up screen, HUD portraits and the ending poster.
- The 3D models are only for gameplay distance: the toon shader with the ink outline, and a face decal cropped from the same art so the face matches the close-ups.
- The sky and the far backdrop are the painted panoramas in public/art/backdrops/<stage>-<n>.png: a 2:1 equirect on the sky (Godot PanoramaSkyMaterial, or a three.js sphere with the texture on its inside) or a wide strip on a matte plane behind the arena. 3D is only the arena floor and what stands on it.`

const has = (s, re) => re.test(String(s || ''))
const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const twoD = look => has(look, /pixel|flat|2d/i)
const ROLES = ['Lead', 'Bruiser', 'Gunner', 'Blade', 'Caster', 'Support', 'Rogue', 'Lancer']
const WEAPONS = { 'Stylish combos': ['twin blades', 'greatsword', 'gauntlets', 'scythe', 'katana', 'spear', 'whip blade', 'hammer'], Shooting: ['twin pistols', 'rifle', 'shotgun', 'launcher', 'bow', 'railgun', 'SMG', 'cannon'] }
// "no shooting" is not shooting: only a positive answer gets guns
const weaponsFor = combat => WEAPONS[combat] || WEAPONS[!noShooting({ combat }) && has(combat, /shoot|gun|ranged/i) ? 'Shooting' : 'Stylish combos']
const MELEE = WEAPONS['Stylish combos']

// an answer that forbids something wins over every card: "no shooting" leaves no gun anywhere
function scrub(cards, a) {
  if (!noShooting(a)) return cards
  for (const body of Object.values(cards)) {
    for (const [k, v] of Object.entries(body)) {
      if (k === 'roster') v.forEach((r, i) => { if (GUNS.test(r.weapon)) r.weapon = MELEE[i % MELEE.length]; if (GUNS.test(r.look)) r.look = '' })
      else if (typeof v === 'string' && GUNS.test(v) && v !== a.combat) body[k] = ''
    }
  }
  return cards
}

// ---------- answers -> cards
// env: { godot } whether a Godot binary is on this machine (undefined: not checked);
// hint: the planner model's reading of the idea (engine/planshape.mjs askShape), or null.
export function planFromAnswers({ idea = '', answers = {}, title = '', note = '', force = null } = {}, env = {}, hint = null) {
  const given = Object.fromEntries(Object.entries(answers || {}).map(([k, v]) => [k, clean(v)]).filter(([k, v]) => v && PLAN_QUESTIONS.some(q => q.id === k)))
  const a = { ...DEFAULTS, ...given }
  const shape = shapeOf({ idea, given, answers: a, title, note, force: force || {} }, env, hint)
  const key = keyFor(`${a.look} ${idea}`)
  const base = {
    title: shape.title || 'New game',
    idea: clean(idea, 600),
    answers: a,
    given,
    ...(force ? { decided: force, note: clean(note, 600) } : {}),
    shape,
    engine: shape.engine,
    key,
    sheets: [], mocks: [], backdrops: [],
    style: { name: a.look, locked: false, refs: [] },
    gate: { locked: false, testFirst: false, price: null, lockedAt: null, phase: null },
    build: { characters: [], props: [], animations: null, sprites: [] }
  }
  const settings = { ...SETTINGS, ...(shape.size === 'normal' ? {} : { stages: shape.scale.stages, backdropsPerStage: shape.scale.perStage }) }
  if (shape.family !== 'action') {
    const fam = familyCards({ a, given, idea: clean(idea, 600), note: clean(note, 300), shape, hint })
    const cards = scrub(Object.fromEntries(fam.cards.map(([id, , body]) => [id, body])), a)
    const systems = {
      logins: a.money !== 'Free',
      payments: has(a.money, /cosmetic|premium|gacha/i),
      subscriptions: has(a.money, /subscri/i),
      leaderboard: false,
      gacha: has(a.money, /gacha/i),
      pilot: false,
      enemyAI: false,
      loadout: false,
      ...fam.systems
    }
    const names = [...fam.cards.map(([id, name]) => [id, name]), ['systems', 'Systems']]
    cards.systems = Object.fromEntries(SYSTEMS.map(([k, label]) => [label, systems[k] ? 'on' : 'off']))
    return {
      ...base,
      cards: names.map(([id, name]) => ({ id, name, body: cards[id] })),
      systems,
      settings,
      art: { sheets: fam.sheets, shots: fam.shots.slice(0, shape.scale.mocks), sprites: fam.sprites }
    }
  }
  const n = Math.max(1, Math.min(shape.size === 'normal' || shape.size === 'big' ? 12 : 2, parseInt(a.size, 10) || 3))
  const girls = has(a.cast, /girl|women|female|heroine/i)
  const weapons = weaponsFor(a.combat)
  const roster = Array.from({ length: n }, (_, i) => ({ name: `${girls ? 'Heroine' : 'Hero'} ${i + 1}`, role: ROLES[i % ROLES.length], look: '', weapon: weapons[i % weapons.length] }))
  const combos = has(a.combat, /combo|stylish/i)
  const fights = !has(a.enemies, /no fight/i)
  const bosses = has(a.enemies, /boss/i)
  const cosmetics = has(a.money, /cosmetic|gacha/i)
  const cards = {
    cast: { count: String(n), rule: a.cast, roster },
    story: { premise: clean(idea, 400) || `An original ${a.genre.toLowerCase()} with ${girls ? 'a cast of heroines' : 'a new cast'}`, acts: '3', ending: 'One ending, unlocked by the final boss' },
    combat: combos
      ? { style: 'Combos with a launcher, air juggles and a D–SSS style rank', ults: 'Orb-charged cinematic ults with cut-ins', weapons: 'Switch weapons mid-combo', tools: noShooting(a) ? '' : 'Grenades', tactic: 'Hit and run against strong enemies' }
      : { style: a.combat, ults: 'One charged special', weapons: 'One weapon each', tools: '', tactic: '' },
    enemies: fights
      ? { tiers: bosses ? 'Minions, elites, bosses' : a.enemies, boss: bosses ? '3 stages, switches weapons each stage' : '', final: bosses ? 'A final boss with asura arms' : '', telegraphs: 'Every attack is telegraphed' }
      : { tiers: 'None', boss: '', final: '', telegraphs: '' },
    progression: { levelUp: a.progression, ngPlus: has(a.progression, /new game/i) || combos ? 'New Game+' : '', growth: 'An aura and wings that grow', pet: 'A pet companion' },
    world: { setting: shape.setting || '', stages: String(settings.stages), camera: shape.art === '2d' || twoD(a.look) ? 'Side view' : 'Third person, over the shoulder', backdrops: `${settings.backdropsPerStage} painted panoramas a stage` },
    look: { style: a.look, palette: '', locked: 'no' },
    money: { model: a.money, gacha: cosmetics ? 'Cosmetics only, published rates, a pity counter' : '', subscription: has(a.money, /subscri/i) ? 'Monthly, test mode' : '', carry: cosmetics ? 'Cosmetics carry into the game' : '' }
  }
  const systems = {
    logins: a.money !== 'Free' || fights,
    payments: has(a.money, /cosmetic|premium/i),
    subscriptions: has(a.money, /subscri/i),
    leaderboard: fights,
    gacha: cosmetics,
    pilot: fights,
    enemyAI: fights,
    loadout: cosmetics
  }
  cards.systems = Object.fromEntries(SYSTEMS.map(([k, label]) => [label, systems[k] ? 'on' : 'off']))
  scrub(cards, a)
  return {
    ...base,
    cards: CARDS.map(([id, name]) => ({ id, name, body: cards[id] })),
    systems,
    settings,
    art: { sheets: null, shots: null, sprites: [] }
  }
}

// ---------- re-plan in place: the same plan id, a fresh shape from the idea, the answers and a note
// ("this is not what I asked for"). Pictures and the build of the old shape are dropped (their files
// stay on disk); nothing is spent. A title the person typed is kept.
// A planner conversation locked again (engine/talkplan.mjs) hands in its idea, answers and decisions.
export function replan(plan, { note = '', idea, answers, force, title } = {}, env = {}, hint = null) {
  if (plan.build?.state === 'building') throw Object.assign(new Error('the build is running'), { status: 409 })
  // plans made before the fix kept only the answers merged with the defaults: a default is not an answer
  const given = plan.given || Object.fromEntries(Object.entries(plan.answers || {}).filter(([k, v]) => DEFAULTS[k] !== v))
  const fresh = planFromAnswers({ idea: idea ?? plan.idea, answers: answers ?? given, title: plan.titleSet ? plan.title : (title || ''), note, force: force ?? plan.decided ?? null }, env, hint)
  const was = plan.shape?.family || 'action'
  const keep = { id: plan.id, v: plan.v, kind: plan.kind, created: plan.created, from: plan.from ?? null, titleSet: plan.titleSet }
  for (const k of Object.keys(plan)) delete plan[k]
  Object.assign(plan, keep, fresh, { replanned: { at: new Date().toISOString(), note: clean(note, 300), was } })
  return plan
}

export const card = (plan, id) => plan.cards.find(c => c.id === id)
export const roster = plan => (card(plan, 'cast')?.body.roster || []).filter(r => r && clean(r.name))
export const is3d = plan => plan.shape ? plan.shape.art === '3d' : !twoD(plan.answers?.look || card(plan, 'look')?.body.style)
// the cut-out pictures a 2D plan paints at build time (engine/planart.mjs spriteJobs)
export const sprites = plan => is3d(plan) ? [] : (plan.art?.sprites || [])

// ---------- editing: never spends, and reopens the gate when the plan was locked
export function editCard(plan, id, body = {}) {
  const c = card(plan, id)
  if (!c) throw Object.assign(new Error('no such card'), { status: 404 })
  if (id === 'systems') return setSystems(plan, Object.fromEntries(SYSTEMS.map(([k, label]) => [k, has(body[label] ?? body[k], /^(on|true|yes)$/i) || body[k] === true])))
  const next = { ...c.body }
  for (const [k, v] of Object.entries(body || {})) {
    if (!(k in c.body) && Object.keys(c.body).length >= 12) continue
    if (k === 'roster') next.roster = (Array.isArray(v) ? v : []).slice(0, 12).map(r => ({ name: clean(r?.name, 40), role: clean(r?.role, 40), look: clean(r?.look, 300), weapon: clean(r?.weapon, 60) }))
    else next[clean(k, 32)] = Array.isArray(v) ? v.map(x => clean(x, 120)).slice(0, 12) : clean(v, 400)
  }
  if (id === 'cast') next.count = String(next.roster?.length ?? next.count)
  c.body = next
  return reopen(plan)
}
export function setSystems(plan, on = {}) {
  for (const [k] of SYSTEMS) if (k in on) plan.systems[k] = !!on[k]
  const c = card(plan, 'systems')
  if (c) c.body = Object.fromEntries(SYSTEMS.map(([k, label]) => [label, plan.systems[k] ? 'on' : 'off']))
  return reopen(plan)
}
function reopen(plan) {
  if (plan.gate?.locked) plan.gate = { ...plan.gate, locked: false, lockedAt: null, phase: null, reopened: true }
  return plan
}

// ---------- the price of everything expensive
// A character already made is not charged again; the animation set is paid once.
export function planPrice(plan) {
  const cast = roster(plan)
  const made = new Set((plan.build?.characters || []).filter(c => c.state === 'done').map(c => c.name))
  const todo = is3d(plan) ? cast.filter(r => !made.has(r.name)) : []
  const animsDone = !!plan.build?.animations?.done
  const clips = is3d(plan) && cast.length && !animsDone ? Number(plan.settings?.clips ?? SETTINGS.clips) : 0
  const propsDone = new Set((plan.build?.props || []).filter(p => p.state === 'done').map(p => p.name))
  const props = is3d(plan) ? [...new Set(cast.map(r => clean(r.weapon)).filter(Boolean))].filter(w => !propsDone.has(w)) : []
  const parts = [
    { what: 'Characters', n: todo.length, each: COST.model, credits: todo.length * COST.model },
    { what: 'Rigs', n: todo.length, each: COST.rig, credits: todo.length * COST.rig },
    { what: 'Animations', n: clips, each: COST.clip, credits: clips * COST.clip },
    { what: 'Weapons', n: props.length, each: COST.prop, credits: props.length * COST.prop }
  ]
  const credits = parts.reduce((s, p) => s + p.credits, 0)
  const sys = SYSTEMS.filter(([k]) => plan.systems?.[k]).length
  const bosses = has(card(plan, 'enemies')?.body.boss, /\w/)
  const runs = 2 + sys + (bosses ? 1 : 0)
  const stages = Math.max(1, parseInt(card(plan, 'world')?.body.stages, 10) || Number(plan.settings?.stages) || SETTINGS.stages)
  const shape = plan.shape || {}
  // pictures still to paint (image runs on the person's own login, not credits)
  const done = list => (list || []).filter(x => x.state === 'done').length
  const art = new Map((plan.build?.characters || []).map(c => [c.name, c]))
  const madeSprites = new Set((plan.build?.sprites || []).filter(x => x.state === 'done').map(x => x.name))
  const pics = {
    sheets: Math.max(0, (plan.art?.sheets ? Math.min(plan.art.sheets.length, shape.size === 'tiny' ? 2 : 4) : 2) - done(plan.sheets)),
    mocks: Math.max(0, (plan.art?.shots?.length ?? 5) - done(plan.mocks)),
    backdrops: shape.backdrops === false ? 0 : Math.max(0, stages * Number(plan.settings?.backdropsPerStage ?? SETTINGS.backdropsPerStage) - done(plan.backdrops)),
    closeups: shape.closeups === false ? 0 : cast.reduce((n, r) => n + ['cutin', 'portrait'].filter(w => art.get(r.name)?.[w]?.state !== 'done').length, 0),
    turnarounds: todo.reduce((n, r) => n + ['front', 'side', 'back'].filter(v => art.get(r.name)?.[v]?.state !== 'done').length, 0),
    ...(sprites(plan).length ? { sprites: sprites(plan).filter(x => !madeSprites.has(x.name)).length } : {})
  }
  const images = Object.values(pics).reduce((s, n) => s + n, 0)
  const one = todo.length ? COST.model + COST.rig : 0
  const firstCredits = one + clips * COST.clip
  return { credits, runs, images, pics, parts, first: { credits: firstCredits, characters: todo.length ? 1 : 0 }, rest: { credits: credits - firstCredits } }
}

// ---------- the gate
export function lockPlan(plan, { credits, testFirst = false } = {}) {
  const price = planPrice(plan)
  const ask = testFirst ? price.first.credits : price.credits
  if (Number(credits) !== ask) throw Object.assign(new Error(`the price is ${ask} credits now`), { status: 402, price })
  plan.gate = { locked: true, testFirst: !!testFirst, price, lockedAt: new Date().toISOString(), phase: testFirst ? 'first' : 'all', credits: ask }
  return plan
}
// Every route that spends for a plan calls this first.
export function assertLocked(plan) {
  if (!plan?.gate?.locked) throw Object.assign(new Error('lock the plan first'), { status: 409 })
  return plan.gate
}

// ---------- sketch sheets: one picture, a grid of options; cell -> box in 0..1
export function cellBox(grid = [5, 4], cell = 0) {
  const [cols, rows] = grid
  const i = Math.max(0, Math.min(cols * rows - 1, cell | 0))
  return { x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows }
}
export function pickCell(plan, { sheet, cell, on = true, note } = {}) {
  const s = (plan.sheets || []).find(x => x.id === sheet)
  if (!s) throw Object.assign(new Error('no such sheet'), { status: 404 })
  const max = s.grid[0] * s.grid[1]
  const c = Number(cell)
  if (!Number.isInteger(c) || c < 0 || c >= max) throw Object.assign(new Error('no such cell'), { status: 400 })
  const picks = new Set(s.picks || [])
  if (on) picks.add(c); else picks.delete(c)
  s.picks = [...picks].sort((x, y) => x - y)
  s.notes ||= {}
  if (note !== undefined) { const t = clean(note, 120); if (t) s.notes[c] = t; else delete s.notes[c] }
  if (!on) delete s.notes[c]
  return plan
}

// ---------- the store: <data>/plans/<id>.json, written whole and renamed into place
export const PLAN_ID = /^p-[a-z0-9]{6,20}$/
export function planStore(dir) {
  const file = id => join(dir, `${id}.json`)
  const ok = id => PLAN_ID.test(String(id || ''))
  return {
    dir,
    get(id) { if (!ok(id) || !existsSync(file(id))) return null; try { return JSON.parse(readFileSync(file(id), 'utf8')) } catch { return null } },
    save(plan) {
      if (!ok(plan.id)) throw new Error('bad plan id')
      mkdirSync(dir, { recursive: true })
      plan.updated = new Date().toISOString()
      const tmp = `${file(plan.id)}.part`
      writeFileSync(tmp, JSON.stringify(plan, null, 1))
      renameSync(tmp, file(plan.id))
      return plan
    },
    create(input = {}, env = {}, hint = null) {
      const plan = { id: `p-${randomBytes(5).toString('hex')}`, v: 1, kind: 'game', created: new Date().toISOString(), from: input.from || null, ...planFromAnswers(input, env, hint) }
      return this.save(plan)
    },
    list() {
      if (!existsSync(dir)) return []
      return readdirSync(dir).filter(f => /^p-[a-z0-9]+\.json$/.test(f)).map(f => this.get(f.slice(0, -5))).filter(Boolean)
        .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
        .map(p => ({ id: p.id, title: p.title, updated: p.updated, locked: !!p.gate?.locked, cover: p.sheets?.find(s => s.src)?.src || null, price: planPrice(p) }))
    }
  }
}

// What the board needs: the plan and its price right now.
// The first picture (a cheap check of direction, gate phase "first"): shown with the plan in plain words.
export function firstPicture(plan) {
  const s = (plan.build?.sprites || [])[0]
  if (s?.state === 'done' && s.src) return { name: s.name, src: s.src }
  const c = (plan.build?.characters || []).find(x => x.front?.state === 'done' && x.front.src)
  return c ? { name: c.name, src: c.front.src } : null
}
export const planView = plan => ({ ...plan, price: planPrice(plan), summary: planSummary(plan), first: firstPicture(plan) })
