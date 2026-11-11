// The Plan board's pictures (docs/specs/21-plan-before-spend.md): sketch sheets, mock screenshots,
// the style lock, World backdrops and the close-up art. Pure: prompts and the plan's picture entries.
// Painting itself happens in server/plans.mjs through imagegen.py (the person's own image login);
// none of this spends Meshy credits.
import { randomBytes } from 'node:crypto'
import { card, roster, is3d, CLOSEUP_RULE } from './plan.mjs'
import { systemsAsk } from './systems.mjs'

const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status })
export const newId = prefix => `${prefix}-${randomBytes(4).toString('hex')}`

export const SHEET_KINDS = ['cast', 'weapons', 'enemies']
export const SHOTS = [
  ['combat', 'mid-combat, the lead launching an enemy into the air, a combo counter and style rank on the HUD'],
  ['boss', 'a boss fight, the boss towering over the party, its health bar across the top'],
  ['ult', 'an ultimate attack cut-in: the painted waist-up art of the lead sliding across the screen, her name beside it'],
  ['levelup', 'the level-up screen: pick one of three upgrade cards over a dimmed arena'],
  ['select', 'character select: the whole cast as painted waist-up portraits in a row, one highlighted']
]
const DEFAULT_STAGES = ['a sunset colosseum', 'burning ruins', 'a sky split by red lightning', 'a moonlit temple', 'a frozen fortress']
export const SHAPES = { equirect: '2:1', strip: '4:1' }

// the one style every picture after the lock is made in
export function styleLine(plan) {
  const look = card(plan, 'look')?.body || {}
  const bits = [clean(look.style) || 'anime cel-shaded', look.palette && `palette: ${clean(look.palette)}`]
  if (plan.style?.locked && plan.style.picks) bits.push(`as picked on the sheets: ${plan.style.picks}`)
  return bits.filter(Boolean).join('; ')
}
const castLine = plan => roster(plan).map(r => [r.name, r.role, r.look, r.weapon && `with ${r.weapon}`].filter(Boolean).map(x => clean(x, 80)).join(', ')).join('; ')
const notesLine = sheet => {
  if (!sheet?.picks?.length) return ''
  return `Keep what was picked: ${sheet.picks.map(c => `option ${c + 1}${sheet.notes?.[c] ? ` (${sheet.notes[c]})` : ''}`).join(', ')}.`
}

// ---------- sketch sheets: one medium picture, a numbered 5 × 4 grid of rough options
export function sheetPrompt(plan, kind, prev) {
  if (!SHEET_KINDS.includes(kind)) throw fail('no such sheet kind')
  const g = prev?.grid || [5, 4]
  const n = g[0] * g[1]
  const what = {
    cast: `${n} different character designs for this cast: ${castLine(plan) || clean(card(plan, 'cast')?.body.rule)}. Full body, front view, standing, each a distinct silhouette and outfit`,
    weapons: `${n} different weapon designs: ${[...new Set(roster(plan).map(r => clean(r.weapon)).filter(Boolean))].join(', ') || 'swords, guns and staves'}. Each weapon alone, side view, on plain ground`,
    enemies: `${n} different enemy designs: ${clean(card(plan, 'enemies')?.body.tiers) || 'minions, elites, bosses'}. Full body, front view, growing in size from minions to bosses`
  }[kind]
  return [
    `A rough concept sketch sheet: a ${g[0]} × ${g[1]} grid of ${n} numbered options (1 to ${n}, left to right, top to bottom), thin white gutters between the cells, a small number in each cell's corner, nothing crossing a cell's edge.`,
    `${what}.`,
    `Game: ${clean(plan.title, 80)}${plan.idea ? `, ${clean(plan.idea, 200)}` : ''}.`,
    `Style: ${styleLine(plan)}. Loose pencil and flat colour, a designer's exploration sheet, not finished art.`,
    notesLine(prev)
  ].filter(Boolean).join(' ')
}

// A sheet entry, painting; drawn again (with its notes) it keeps its id and picks.
export function addSheet(plan, kind) {
  const prompt = sheetPrompt(plan, kind, (plan.sheets || []).find(s => s.kind === kind))
  plan.sheets ||= []
  let s = plan.sheets.find(x => x.kind === kind)
  if (s?.state === 'painting') throw fail('that sheet is being drawn', 409)
  if (!s) { s = { id: newId('s'), kind, grid: [5, 4], picks: [], notes: {} }; plan.sheets.push(s) }
  Object.assign(s, { prompt, quality: 'medium', state: 'painting', started: Date.now(), error: null })
  return [{ list: 'sheets', id: s.id, prompt, quality: 'medium', aspect: 'landscape', refs: [] }]
}

// ---------- mock screenshots: 4–5 in-game frames from the picks
export function mockPrompt(plan, shot) {
  const s = SHOTS.find(x => x[0] === shot)
  if (!s) throw fail('no such shot')
  const world = card(plan, 'world')?.body || {}
  return [
    `An in-game screenshot of ${clean(plan.title, 80)}, ${is3d(plan) ? 'a 3D game' : 'a 2D game'}, ${clean(world.camera) || 'third person'} camera: ${s[1]}.`,
    `The cast: ${castLine(plan)}.`,
    world.setting && `Setting: ${clean(world.setting)}.`,
    `Style: ${styleLine(plan)}. ${is3d(plan) ? 'Characters as toon-shaded 3D with an ink outline at gameplay distance, a painted sky behind the arena.' : ''}`,
    ...(plan.sheets || []).map(notesLine).filter(Boolean),
    'A clean, readable HUD. It should look like a real shipped game.'
  ].filter(Boolean).join(' ')
}
const sheetRefs = (plan, dir) => (plan.sheets || []).filter(s => s.state === 'done' && s.file && s.picks?.length).map(s => `${dir}/${s.file}`)
export function addMocks(plan, dir, shots = SHOTS.map(s => s[0])) {
  plan.mocks ||= []
  if (plan.mocks.some(m => m.state === 'painting')) throw fail('the mocks are being drawn', 409)
  const jobs = []
  for (const shot of shots) {
    const prompt = mockPrompt(plan, shot)
    let m = plan.mocks.find(x => x.shot === shot)
    if (!m) { m = { id: newId('m'), shot }; plan.mocks.push(m) }
    Object.assign(m, { prompt, state: 'painting', started: Date.now(), error: null })
    jobs.push({ list: 'mocks', id: m.id, prompt, quality: 'medium', aspect: 'landscape', refs: sheetRefs(plan, dir) })
  }
  return jobs
}

// ---------- the style lock: the picked cells and the style name become the reference
export function lockStyle(plan, locked = true) {
  plan.style ||= { name: '', locked: false, refs: [] }
  const look = card(plan, 'look')
  if (locked) {
    plan.style.name = clean(look?.body.style) || plan.style.name
    plan.style.picks = (plan.sheets || []).filter(s => s.picks?.length).map(s => `${s.kind} ${s.picks.map(c => `${c + 1}${s.notes?.[c] ? ` (${clean(s.notes[c], 40)})` : ''}`).join(', ')}`).join('; ')
    plan.style.refs = (plan.sheets || []).filter(s => s.src && s.picks?.length).map(s => s.src)
  }
  plan.style.locked = !!locked
  if (look) look.body.locked = locked ? 'yes' : 'no'
  return plan
}

// ---------- World backdrops: 2–4 painted panoramas a stage, from the locked style
export function stageNames(plan) {
  const w = card(plan, 'world')?.body || {}
  const n = Math.max(1, Math.min(5, parseInt(w.stages, 10) || 3))
  const given = clean(w.setting, 400).split(/\s*[;,]\s*/).filter(Boolean)
  return Array.from({ length: n }, (_, i) => given[i] || DEFAULT_STAGES[i % DEFAULT_STAGES.length])
}
export function backdropPrompt(plan, stage, n, shape) {
  return [
    shape === 'equirect'
      ? `A seamless 360° sky panorama, equirectangular projection (2:1), for a game's skybox: the horizon exactly at the middle, the left and right edges meeting without a seam, no ground objects closer than the far distance.`
      : `A very wide painted matte backdrop strip (4:1) for behind a game arena: the far distance only, the horizon low, nothing in the foreground.`,
    `Stage: ${stage}${n > 1 ? `, view ${n}` : ''}. ${clean(plan.title, 80)}.`,
    `Style: ${styleLine(plan)}. Painted, atmospheric, big shapes; no people, no text, no UI.`
  ].join(' ')
}
export function addBackdrops(plan, { stage } = {}) {
  if (!plan.style?.locked) throw fail('lock the style first', 409)
  plan.backdrops ||= []
  if (plan.backdrops.some(b => b.state === 'painting')) throw fail('the backdrops are being painted', 409)
  const per = Math.max(2, Math.min(4, Number(plan.settings?.backdropsPerStage) || 3))
  const stages = stageNames(plan)
  const pick = stage === undefined || stage === null || stage === '' ? stages.map((s, i) => i) : [Number(stage)]
  if (pick.some(i => !Number.isInteger(i) || i < 0 || i >= stages.length)) throw fail('no such stage')
  const jobs = []
  for (const i of pick) {
    for (let n = 1; n <= per; n++) {
      const shape = n === 1 ? 'equirect' : 'strip'
      const prompt = backdropPrompt(plan, stages[i], n, shape)
      let b = plan.backdrops.find(x => x.stage === i && x.n === n)
      if (!b) { b = { id: newId('b'), stage: i, n }; plan.backdrops.push(b) }
      Object.assign(b, { name: stages[i], shape, prompt, state: 'painting', started: Date.now(), error: null })
      jobs.push({ list: 'backdrops', id: b.id, prompt, quality: 'high', aspect: 'landscape', crop: SHAPES[shape], refs: [] })
    }
  }
  return jobs
}

// ---------- close-up art per locked character: a cut-in and a dialogue portrait (high)
export function closeupPrompt(plan, r, which) {
  const head = which === 'cutin'
    ? `An ultimate-attack cut-in illustration, 16:9: ${clean(r.name, 60)} waist-up in a dynamic action pose, ${clean(r.weapon, 60) || 'her weapon'} raised, the figure on the left two thirds, the right third empty and calm for the name, speed lines.`
    : `A dialogue portrait: ${clean(r.name, 60)} waist-up, calm and in character, facing slightly to the side, on a plain flat background.`
  return [head, `Character: ${[r.role, r.look, r.weapon && `with ${r.weapon}`].filter(Boolean).map(x => clean(x, 80)).join(', ')}.`,
    `Style: ${styleLine(plan)}. Finished painted character art, the same face and outfit as the reference sheet.`].join(' ')
}
const fileName = name => clean(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hero'
export function addCloseups(plan, dir, { name, missing = false } = {}) {
  if (!plan.gate?.locked) throw fail('lock the plan first', 409)
  plan.build ||= { characters: [], props: [], animations: null }
  const cast = roster(plan).filter(r => !name || r.name === name)
  if (!cast.length) throw fail('no such character', 404)
  const refs = (plan.sheets || []).filter(s => s.kind === 'cast' && s.file && s.state === 'done').map(s => `${dir}/${s.file}`)
  const jobs = []
  for (const r of plan.gate.phase === 'first' && !name ? cast.slice(0, 1) : cast) {
    let c = plan.build.characters.find(x => x.name === r.name)
    if (!c) { c = { name: r.name, slug: fileName(r.name), state: 'planned' }; plan.build.characters.push(c) }
    for (const which of ['cutin', 'portrait']) {
      if (c[which]?.state === 'painting' || (missing && c[which]?.state === 'done')) continue
      const id = newId(which === 'cutin' ? 'c' : 'f')
      c[which] = { id, state: 'painting', started: Date.now(), error: null }
      jobs.push({ list: 'closeups', id, prompt: closeupPrompt(plan, r, which), quality: 'high', aspect: which === 'cutin' ? 'landscape' : 'portrait', crop: which === 'cutin' ? '16:9' : '', refs })
    }
  }
  return jobs
}

// Where a finished picture lands in the plan: the entry for a job id.
export function entryFor(plan, list, id) {
  if (list === 'closeups' || list === 'views') {
    for (const c of plan.build?.characters || []) for (const w of ['cutin', 'portrait', 'front', 'side', 'back']) if (c[w]?.id === id) return c[w]
    return null
  }
  return (plan[list] || []).find(x => x.id === id) || null
}

// A picture left painting by a server that stopped is shown as failed after a while.
export function settleStale(plan, now = Date.now(), maxMs = 15 * 60 * 1000) {
  const all = [...(plan.sheets || []), ...(plan.mocks || []), ...(plan.backdrops || []), ...(plan.build?.characters || []).flatMap(c => [c.cutin, c.portrait, c.front, c.side, c.back]).filter(Boolean)]
  for (const e of all) if (e.state === 'painting' && now - (e.started || 0) > maxMs) Object.assign(e, { state: 'failed', error: 'stopped' })
  // a model (Meshy: the mesh, then the rig) gets three times as long
  for (const c of plan.build?.characters || []) if (c.model?.state === 'making' && now - (c.model.started || 0) > maxMs * 3) Object.assign(c.model, { state: 'failed', error: 'stopped' })
  return plan
}

// ---------- the game's build brief: the close-up rule and the files it may load
export function artBrief(plan) {
  const done = e => e?.state === 'done'
  const files = []
  for (const c of plan.build?.characters || []) {
    if (done(c.cutin)) files.push(`public/art/${c.slug}-cutin.png`)
    if (done(c.portrait)) files.push(`public/art/${c.slug}-portrait.png`)
  }
  for (const b of (plan.backdrops || []).filter(done)) files.push(`public/art/backdrops/${b.stage + 1}-${b.n}.png (${b.shape}, ${b.name})`)
  return [CLOSEUP_RULE, files.length ? `The painted art in this build:\n${files.map(f => `- ${f}`).join('\n')}` : ''].filter(Boolean).join('\n\n')
}

// ---------- turnarounds (spec 21, Build): front from the cast sheet, then side and back drawn
// with the front as the reference, so Meshy's multi-image-to-3D gets one character from three sides.
export const VIEWS = ['front', 'side', 'back']
export function turnaroundPrompt(plan, r, view) {
  const pose = { front: 'front view', side: 'side view, facing left, in profile', back: 'back view, seen from behind' }[view]
  return [
    `A character turnaround picture: ${clean(r.name, 60)}, full body, ${pose}, A-pose (arms out and down at 45°, feet apart), orthographic, plain light grey background, nothing else in the picture, the whole figure inside the frame with a margin.`,
    view === 'front' ? `Character: ${[r.role, r.look, r.weapon && `holding nothing; her ${r.weapon} is made separately`].filter(Boolean).map(x => clean(x, 120)).join(', ')}.` : 'The same character as the reference picture: the same face, hair, outfit, colours and proportions.',
    `Style: ${styleLine(plan)}. Clean flat colours and line art, no dramatic lighting, no shadows on the ground.`
  ].join(' ')
}
// The characters this build covers: the first only while the gate is at "test one first".
export function buildScope(plan, name) {
  const cast = roster(plan)
  if (name) return cast.filter(r => r.name === name)
  return plan.gate?.phase === 'first' ? cast.slice(0, 1) : cast
}
export function charEntry(plan, r) {
  plan.build ||= { characters: [], props: [], animations: null }
  let c = plan.build.characters.find(x => x.name === r.name)
  if (!c) { c = { name: r.name, slug: fileName(r.name), state: 'planned' }; plan.build.characters.push(c) }
  return c
}
// one picture job for a character's view; the front's reference is the cast sheet, the others' the front
export function viewJob(plan, dir, r, view) {
  const c = charEntry(plan, r)
  const id = newId(view[0] === 'f' ? 'v' : view[0] === 's' ? 'w' : 'k')
  c[view] = { id, state: 'painting', started: Date.now(), error: null }
  const refs = view === 'front'
    ? (plan.sheets || []).filter(s => s.kind === 'cast' && s.file && s.state === 'done').map(s => `${dir}/${s.file}`)
    : c.front?.file ? [`${dir}/${c.front.file}`] : []
  return { list: 'views', id, prompt: turnaroundPrompt(plan, r, view), quality: 'high', aspect: 'portrait', refs }
}

// ---------- the whole game brief: the cards, the switched-on systems, the art rule and files
export function gameBrief(plan) {
  const lines = plan.cards.map(c => {
    const b = { ...c.body }
    if (c.id === 'cast') b.roster = (b.roster || []).map(r => [r.name, r.role, r.look, r.weapon].filter(Boolean).join(' / ')).join('; ')
    return `${c.name}: ${Object.entries(b).filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k} ${String(v).trim()}`).join('; ')}`
  })
  return [`Make the game "${clean(plan.title, 80)}"${plan.idea ? `: ${clean(plan.idea, 400)}` : ''}.`, `The plan:\n${lines.join('\n')}`, systemsAsk(plan), artBrief(plan)].filter(Boolean).join('\n\n')
}
