// Checks data/stages.json, data/enemies.json and data/fights.json against data/CONTENT.md.
// Usage: node games/ares/tools/check-content.mjs   (exit 1 and a list of problems when something is off)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const BASES = {
  drone: ['fan', 'aimed', 'ring'], sentry: ['ring', 'spiral', 'aimed'], walker: ['melee', 'aimed'],
  shield: ['melee', 'bash'], jumper: ['slam', 'melee'], caster: ['laser', 'ring', 'summon'], charger: ['rush'],
}
export const PATTERNS = ['fan', 'ring', 'spiral', 'rain', 'sweep', 'pillars', 'glare', 'volley', 'spot_sweep', 'rush', 'slam',
  'blink', 'clones', 'summon', 'lances', 'iaido', 'bells', 'freeze', 'wallkick',
  'boulders', 'gold_fall', 'doom_wall']
export const ROLES = ['ledge', 'bridge', 'step', 'stairs', 'column', 'prop', 'wall']
export const GROUND_ROLES = ['stairs', 'column', 'prop', 'wall']
export const SECTIONS = ['run', 'chase', 'arena', 'titan']
export const LOOKS = ['dark', 'red_moon', 'storm']
export const BODIES = ['platform', 'float']
export const KITS = ['ember', 'gold', 'snow', 'crimson', 'ruin', 'inferno']
export const SPRITES = ['automaton-grunt', 'automaton-shield', 'automaton-caster', 'automaton-hound', 'automaton-hopper']
const GROUND = 640, TOP = 60

export function check({ stages, enemies, fights, bosses }) {
  const errs = []
  const bad = (m) => errs.push(m)
  const E = enemies.enemies || {}, F = fights.fights || {}
  const ladder = bosses.bosses.map(b => b.handle)
  const byHandle = Object.fromEntries(bosses.bosses.map(b => [b.handle, b]))

  // enemies
  for (const [id, en] of Object.entries(E)) {
    const kinds = BASES[en.base]
    if (!kinds) { bad(`enemy ${id}: unknown base ${en.base}`); continue }
    if (!en.attack || !kinds.includes(en.attack.kind)) bad(`enemy ${id}: base ${en.base} cannot use attack ${en.attack?.kind}`)
    for (const k of ['hp', 'speed', 'dmg']) if (typeof en[k] !== 'number' || en[k] < 0) bad(`enemy ${id}: ${k} must be a number`)
    if (!(en.hp > 0)) bad(`enemy ${id}: hp must be > 0`)
    for (const k of ['range', 'windup', 'every']) if (!(en.attack?.[k] > 0)) bad(`enemy ${id}: attack.${k} must be > 0`)
    if (en.sprite && !SPRITES.includes(en.sprite)) bad(`enemy ${id}: unknown sprite ${en.sprite}`)
    if (en.sprite && !(en.scale > 0)) bad(`enemy ${id}: a sprite needs a scale`)
    if (!en.sprite && !['drone', 'sentry'].includes(en.base)) bad(`enemy ${id}: only drones and sentries may go without a sprite`)
  }

  // fights
  for (const h of ladder) if (!F[h]) bad(`fights: no entry for boss ${h}`)
  for (const [h, f] of Object.entries(F)) {
    if (f.titan) {   // a titan: background colossus, no modes (CONTENT.md §2)
      const TA = ['slam', 'sweep', 'spears', 'beam', 'summon']
      if (!f.sprite) bad(`titan ${h}: needs a sprite`)
      for (const a of f.attacks || []) if (!TA.includes(a)) bad(`titan ${h}: unknown attack ${a}`)
      if (!(f.attacks || []).length) bad(`titan ${h}: needs attacks`)
      continue
    }
    if (!byHandle[h]) bad(`fight ${h}: not in bosses.json`)
    if (!BODIES.includes(f.body)) bad(`fight ${h}: body must be platform or float`)
    const want = h.toLowerCase()
    if (f.sprite !== want) bad(`fight ${h}: sprite should be ${want}`)
    if (!(f.scale > 0) || !(f.hp > 0)) bad(`fight ${h}: scale and hp must be > 0`)
    const modes = f.modes || []
    if (modes.length < 2 || modes.length > 4) bad(`fight ${h}: wants 2-4 modes, has ${modes.length}`)
    if (modes[0]?.from !== 1) bad(`fight ${h}: first mode must start at from 1.0`)
    modes.forEach((m, i) => {
      if (i && !(m.from < modes[i - 1].from)) bad(`fight ${h}: modes must be sorted by from, descending`)
      if (!(m.from > 0 && m.from <= 1)) bad(`fight ${h} mode ${i}: from must be in (0, 1]`)
      if (!m.name || !/[぀-ヿ一-鿿]/.test(m.name)) bad(`fight ${h} mode ${i}: name should be Japanese`)
      if (!m.weapon) bad(`fight ${h} mode ${i}: no weapon`)
      if (m.line && !/[぀-ヿ一-鿿]/.test(m.line)) bad(`fight ${h} mode ${i}: line should be Japanese`)
      if (!m.patterns?.length) bad(`fight ${h} mode ${i}: no patterns`)
      for (const p of m.patterns || []) if (!PATTERNS.includes(p)) bad(`fight ${h} mode ${i}: unknown pattern ${p}`)
      if (!(m.rest > 0)) bad(`fight ${h} mode ${i}: rest must be > 0`)
      if (m.stage && !LOOKS.includes(m.stage)) bad(`fight ${h} mode ${i}: unknown stage look ${m.stage}`)
    })
    if (!modes[0]?.line) bad(`fight ${h}: the first mode needs a line`)
    if (f.chase) for (const p of f.chase.patterns || []) if (!PATTERNS.includes(p)) bad(`fight ${h} chase: unknown pattern ${p}`)
    if (f.chase && !f.chase.patterns?.length) bad(`fight ${h} chase: no patterns`)
  }

  // stages
  const list = stages.stages || []
  if (list.map(s => s.id).join() !== KITS.join()) bad(`stages: want ${KITS.join(' > ')} in that order`)
  const seen = []
  for (const s of list) {
    const at = `stage ${s.id}`
    if (s.kit !== s.id || !KITS.includes(s.kit)) bad(`${at}: kit must match the id`)
    if (!(s.length >= 6000 && s.length <= 9000)) bad(`${at}: length ${s.length} outside 6000-9000`)
    const z = s.zoom || {}
    if (!(z.calm >= z.fight && z.fight >= z.crowd && z.crowd > 0)) bad(`${at}: zoom wants calm >= fight >= crowd > 0`)
    const secs = s.sections || []
    let edge = 0
    for (const [i, sec] of secs.entries()) {
      const sa = `${at} section ${i} (${sec.kind} ${sec.from}-${sec.to})`
      if (!SECTIONS.includes(sec.kind)) bad(`${sa}: unknown kind`)
      if (sec.from !== edge) bad(`${sa}: starts at ${sec.from}, the last one ended at ${edge} (gap or overlap)`)
      if (!(sec.to > sec.from)) bad(`${sa}: empty`)
      edge = sec.to
      const inside = (x) => x >= sec.from && x <= sec.to
      for (const p of sec.plats || []) {
        if (!ROLES.includes(p.role)) bad(`${sa}: unknown role ${p.role}`)
        if (!inside(p.x)) bad(`${sa}: ${p.role} at x ${p.x} outside the section`)
        if (GROUND_ROLES.includes(p.role)) { if (p.surf !== undefined) bad(`${sa}: ground piece ${p.role} takes no surf`) }
        else if (!(p.surf >= TOP && p.surf < GROUND)) bad(`${sa}: ${p.role} surf ${p.surf} outside ${TOP}-${GROUND}`)
        if (p.w !== undefined && !(p.w > 0)) bad(`${sa}: bad width`)
        if (p.w !== undefined && !inside(p.x + p.w)) bad(`${sa}: ${p.role} at ${p.x} + ${p.w} runs past the section`)
        if (p.kind && p.kind !== 'brazier') bad(`${sa}: unknown plat kind ${p.kind}`)
      }
      for (const w of sec.waves || []) {
        if (w.when !== 'enter' && !(w.when && inside(w.when.x))) bad(`${sa}: wave when must be "enter" or { x } inside the section`)
        if (!w.enemies?.length) bad(`${sa}: empty wave`)
        for (const en of w.enemies || []) {
          if (!E[en.type]) bad(`${sa}: unknown enemy ${en.type}`)
          if (!inside(en.x)) bad(`${sa}: enemy ${en.type} at x ${en.x} outside the section`)
          if (en.y !== undefined && !(en.y >= TOP && en.y < GROUND)) bad(`${sa}: enemy ${en.type} y ${en.y} off screen`)
        }
      }
      if (sec.waves && sec.kind !== 'run' && sec.kind !== 'titan') bad(`${sa}: only run sections hold waves`)
      if (sec.kind === 'chase') {
        if (!(sec.wall?.speed > 0)) bad(`${sa}: chase needs wall.speed`)
        let last = sec.from
        for (const pit of sec.pits || []) {
          const [a, b] = pit
          if (!(a > last && b > a && b < sec.to)) bad(`${sa}: pit ${a}-${b} must be inside, sorted and apart`)
          if (b - a > 260) bad(`${sa}: pit ${a}-${b} wider than a jump plus a dash`)
          last = b
        }
        for (const c of sec.crumble || []) {
          if (!inside(c.x) || !inside(c.x + (c.w || 0))) bad(`${sa}: crumble at ${c.x} outside the section`)
          if (!(c.surf >= TOP && c.surf < GROUND)) bad(`${sa}: crumble surf ${c.surf} out of range`)
        }
        if (sec.chaser) {
          if (!F[sec.chaser]) bad(`${sa}: chaser ${sec.chaser} has no fight`)
          else if (!F[sec.chaser].chase) bad(`${sa}: chaser ${sec.chaser} has no chase block`)
          if (byHandle[sec.chaser]?.stage !== s.id) bad(`${sa}: chaser ${sec.chaser} belongs to stage ${byHandle[sec.chaser]?.stage}`)
        }
      }
      if (sec.kind === 'arena') {
        if (!sec.boss) bad(`${sa}: arena without a boss`)
        else {
          if (!F[sec.boss]) bad(`${sa}: boss ${sec.boss} has no fight`)
          if (!byHandle[sec.boss]) bad(`${sa}: boss ${sec.boss} not in bosses.json`)
          else if (byHandle[sec.boss].stage !== s.id) bad(`${sa}: boss ${sec.boss} belongs to stage ${byHandle[sec.boss].stage}`)
          if (!seen.includes(sec.boss)) seen.push(sec.boss)
        }
        if (sec.to - sec.from < 1280) bad(`${sa}: arena narrower than the screen`)
      }
    }
    if (edge !== s.length) bad(`${at}: sections end at ${edge}, length is ${s.length}`)
    if (secs.at(-1)?.kind !== 'arena') bad(`${at}: must end on the stage boss arena`)
    if (s.id !== 'ember' && !secs.some(x => x.kind === 'chase')) bad(`${at}: needs a chase section`)
  }
  for (const h of ladder) if (!seen.includes(h)) bad(`stages: boss ${h} never gets an arena`)
  // within a stage, bosses meet in ladder order, Teknium last of all
  for (const s of list) {
    const order = (s.sections || []).filter(x => x.kind === 'arena').map(x => x.boss).filter((b, i, a) => a.indexOf(b) === i)
    const sorted = [...order].sort((a, b) => ladder.indexOf(a) - ladder.indexOf(b))
    if (order.join() !== sorted.join()) bad(`stage ${s.id}: bosses out of ladder order (${order.join(', ')})`)
  }
  const lastArena = list.at(-1)?.sections?.at(-1)
  if (lastArena?.boss !== ladder.at(-1)) bad(`stages: the final arena must be ${ladder.at(-1)}`)
  return errs
}

export function load(dir = fileURLToPath(new URL('../data/', import.meta.url))) {
  const j = (f) => JSON.parse(readFileSync(dir + f, 'utf8'))
  return { stages: j('stages.json'), enemies: j('enemies.json'), fights: j('fights.json'), bosses: j('bosses.json') }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errs = check(load())
  if (errs.length) { console.error(errs.join('\n')); process.exit(1) }
  console.log('content ok')
}
