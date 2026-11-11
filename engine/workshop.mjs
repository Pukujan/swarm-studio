// Guided game making ("Shape it", docs/specs/22-guided-game-maker.md, part one): after the
// questions and the spec, the maker walks the game one part at a time. Every step shows its
// options as something to look at or listen to (a painted picture, a moving sprite sheet, a
// level map, a music loop, a voice line), every pick writes one part of the spec, and the
// build gets the picked art as files. The one-prompt build ("Build the game") is unchanged.
//
// Steps: design, story, world, heroes, enemies, levels, sound. Text options come from the
// planner model (one call per step, cheap); pictures from the person's own image login.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { streamChat } from './llm.mjs'
import { blockHit } from './cast.mjs'

export const STEPS = [
  ['design', 'Game'],
  ['story', 'Story'],
  ['world', 'World'],
  ['heroes', 'Hero'],
  ['enemies', 'Enemies'],
  ['levels', 'Levels'],
  ['sound', 'Sound']
]
export const STEP_IDS = STEPS.map(s => s[0])
export const WS_ID = /^w-[a-z0-9]{8,20}$/
// the picture a step paints for each option; levels and sound draw in the browser
export const PAINTS = { story: 'key art', world: 'backdrop', heroes: 'character', enemies: 'enemy' }
export const SPRITE_POSES = ['idle', 'run', 'jump', 'attack', 'hurt', 'win']

const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const safe = s => !blockHit(String(s || ''))

// ---------- the store: <data>/workshops/<id>/ws.json, its pictures next to it
export function workshopStore(dir) {
  mkdirSync(dir, { recursive: true })
  const file = id => join(dir, id, 'ws.json')
  return {
    dir,
    files: id => join(dir, id),
    create(spec) {
      const ws = { id: `w-${randomBytes(5).toString('hex')}`, created: new Date().toISOString(), step: 'design', done: [], spec: { ...spec }, options: {}, picks: {}, art: [] }
      mkdirSync(join(dir, ws.id), { recursive: true })
      return this.save(ws)
    },
    get(id) {
      if (!WS_ID.test(id) || !existsSync(file(id))) return null
      try { return JSON.parse(readFileSync(file(id), 'utf8')) } catch { return null }
    },
    save(ws) { mkdirSync(join(dir, ws.id), { recursive: true }); writeFileSync(file(ws.id), JSON.stringify(ws, null, 1)); return ws },
    list() {
      try { return readdirSync(dir).filter(d => WS_ID.test(d)).map(d => this.get(d)).filter(Boolean).map(w => ({ id: w.id, title: w.spec?.title, step: w.step, done: w.done || [], run: w.run || null, created: w.created })) } catch { return [] }
    }
  }
}

// ---------- the look all pictures share: the spec's look, flat 2D unless it asks for 3D
export function styleOf(spec = {}) {
  const look = cut(spec.look || spec.answers?.look || '2D flat and bold', 120)
  return `${look}. Original game art, anime-family 2D illustration, clean shapes, readable silhouettes, no text, no logos, no watermark, not photographic, not 3D-rendered, not Disney.`
}

// ---------- what the planner is asked for, per step
const ASK = {
  design: `Offer 3 different takes on this game's core design. Each: {"name":"2-4 words","loop":"one sentence: what the player does every 10 seconds","goal":"how a run is won and lost","twist":"the one mechanic that makes it this game","camera":"side-on | top-down | three-quarter | first-person"}`,
  story: `Offer 3 different stories for this game. Each: {"name":"the story's title","logline":"one sentence","hero":"the hero: name and one line","acts":["act 1 in one line","act 2","act 3"],"art":"one sentence describing a key-art picture for it"}`,
  world: `Offer 4 different places the game is set. Each: {"name":"2-4 words","setting":"one sentence","palette":"3-4 colour words","art":"one sentence describing a wide backdrop picture of it, no characters"}`,
  heroes: `Offer 4 different designs for the hero. Each: {"name":"the hero's name","role":"2-3 words","look":"one sentence: silhouette, outfit, colours, weapon or tool","personality":"2-3 words"}`,
  enemies: `Offer 4 enemies, from weakest to the boss. Each: {"name":"its name","kind":"minion | elite | boss","behaviour":"one sentence: how it moves and attacks, so a player can learn it","look":"one sentence: silhouette and colours"}`,
  levels: `Offer 3 level layouts for the first stage. Each: {"name":"2-4 words","idea":"one sentence","map":["16 strings of exactly 32 characters each"]}. Map legend: # solid, . empty, = platform, ^ hazard, S start (exactly one), X exit (exactly one), E enemy, B boss (at most one), C pickup, D door. A side-on game reads the map as a side view (S on the ground at the left, gravity down); a top-down game as a floor plan with walls around. Make the paths reachable.`,
  sound: `Offer 4 music moods for this game, each a short loop the studio plays with a synthesiser, and one line the hero says at the start. Each: {"name":"2-4 words","feel":"one sentence","bpm":60-180,"scale":"major | minor | dorian | pentatonic | phrygian","wave":"square | sawtooth | triangle | sine","drums":"none | soft | driving | breakbeat","line":"the hero's start line, at most 10 words"}`
}
const RULES = `You design original video games in Swarm Studio. Answer with one JSON object {"options":[...]} and nothing else. Every name, character and place is new: never a character, name, world or text from an existing game, film or anime, even if the maker named one for its feel. Keep it fun and readable for players.`

export function askFor(step, spec = {}, picks = {}) {
  if (!ASK[step]) throw Object.assign(new Error('no such step'), { status: 404 })
  const known = [
    `Title: ${cut(spec.title, 80)}`, `Pitch: ${cut(spec.pitch, 300)}`, `Type: ${cut(spec.answers?.type, 40)}`, `Look: ${cut(spec.look, 120)}`,
    `Setting: ${cut(spec.setting, 200)}`, `Hero: ${cut(spec.hero, 200)}`, `Loop: ${cut(spec.loop, 200)}`,
    ...Object.entries(picks).map(([k, v]) => `Picked ${k}: ${cut(JSON.stringify(v), 300)}`)
  ].filter(l => !/: $/.test(l))
  return [{ role: 'system', content: RULES }, { role: 'user', content: `${known.join('\n')}\n\n${ASK[step]}` }]
}

// The planner's answer, cleaned: only the fields a step uses, nothing blocked, maps squared.
export function cleanOptions(step, raw) {
  let list = raw
  if (typeof raw === 'string') {
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
    try { list = JSON.parse(raw.slice(s, e + 1)).options } catch { list = [] }
  } else if (raw && !Array.isArray(raw)) list = raw.options
  const max = step === 'design' || step === 'story' || step === 'levels' ? 3 : 4
  return (Array.isArray(list) ? list : []).filter(o => o && typeof o === 'object' && o.name && safe(JSON.stringify(o)))
    .slice(0, max).map((o, i) => {
      const base = { id: `${step}-${i + 1}`, name: cut(o.name, 48) }
      if (step === 'design') return { ...base, loop: cut(o.loop, 220), goal: cut(o.goal, 200), twist: cut(o.twist, 200), camera: cut(o.camera, 30) }
      if (step === 'story') return { ...base, logline: cut(o.logline, 240), hero: cut(o.hero, 160), acts: (Array.isArray(o.acts) ? o.acts : []).slice(0, 3).map(a => cut(a, 160)), art: cut(o.art, 300) }
      if (step === 'world') return { ...base, setting: cut(o.setting, 240), palette: cut(o.palette, 80), art: cut(o.art, 300) }
      if (step === 'heroes') return { ...base, role: cut(o.role, 40), look: cut(o.look, 260), personality: cut(o.personality, 40) }
      if (step === 'enemies') return { ...base, kind: /boss/i.test(o.kind) ? 'boss' : /elite/i.test(o.kind) ? 'elite' : 'minion', behaviour: cut(o.behaviour, 240), look: cut(o.look, 240) }
      if (step === 'levels') return { ...base, idea: cut(o.idea, 200), map: squareMap(o.map) }
      if (step === 'sound') return { ...base, feel: cut(o.feel, 200), bpm: Math.max(60, Math.min(180, Number(o.bpm) || 110)), scale: ['major', 'minor', 'dorian', 'pentatonic', 'phrygian'].includes(o.scale) ? o.scale : 'minor', wave: ['square', 'sawtooth', 'triangle', 'sine'].includes(o.wave) ? o.wave : 'triangle', drums: ['none', 'soft', 'driving', 'breakbeat'].includes(o.drums) ? o.drums : 'soft', line: cut(o.line, 80) }
      return base
    })
}

// A level map is 16 rows of 32 cells from the legend, with one start and one exit.
const LEGEND = '#.=^SXEBCD'
export function squareMap(rows) {
  const W = 32, H = 16
  const grid = Array.from({ length: H }, (_, y) => {
    const r = String((Array.isArray(rows) ? rows : [])[y] || '')
    return Array.from({ length: W }, (_, x) => (LEGEND.includes(r[x]) ? r[x] : '.'))
  })
  const count = ch => grid.flat().filter(c => c === ch).length
  const firstOf = ch => { for (let y = 0; y < H; y++) { const x = grid[y].indexOf(ch); if (x >= 0) return [x, y] } return null }
  // keep only the first start, exit and boss
  for (const ch of 'SXB') { const f = firstOf(ch); if (f) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === ch && (x !== f[0] || y !== f[1])) grid[y][x] = '.' }
  if (!count('S')) grid[H - 2][1] = 'S'
  if (!count('X')) grid[H - 2][W - 2] = 'X'
  return grid.map(r => r.join(''))
}

// ---------- the pictures
export function paintPrompt(step, option, spec = {}, picks = {}) {
  const style = styleOf(spec)
  const world = picks.world ? ` Set in ${picks.world.name}: ${picks.world.setting} Palette: ${picks.world.palette}.` : ''
  if (step === 'story') return { prompt: `Key art for an original game, "${cut(spec.title, 60)}": ${option.art || option.logline}${world} ${style}`, aspect: 'landscape' }
  if (step === 'world') return { prompt: `A wide game backdrop with no characters: ${option.art || option.setting} Palette: ${option.palette}. Layered depth for parallax, the playable ground along the bottom third. ${style}`, aspect: 'landscape' }
  if (step === 'heroes') return { prompt: `Character design of an original game hero, full body, standing, centred on a plain light grey background: ${option.name}, ${option.role}. ${option.look} Personality: ${option.personality}.${world} ${style}`, aspect: 'portrait' }
  if (step === 'enemies') return { prompt: `Design of an original game ${option.kind === 'boss' ? 'boss' : 'enemy'}, full body, centred on a plain light grey background: ${option.name}. ${option.look} It ${option.behaviour}${world} ${style}`, aspect: 'square' }
  throw Object.assign(new Error('this step has no pictures'), { status: 400 })
}

// The sprite sheet painted from the picked hero design: 3 × 2 poses on flat grey, for the
// studio's moving preview and the game. The design picture goes in as the reference.
export function spritePrompt(hero, spec = {}) {
  return `A game sprite sheet of this exact character (same face, hair, outfit and colours as the reference), a 3 by 2 grid of six equal cells on a flat light grey background, one full-body pose per cell, all facing right, same size and baseline in every cell, generous empty margin around each figure, no cell borders, no text: top row ${SPRITE_POSES.slice(0, 3).join(', ')}; bottom row ${SPRITE_POSES.slice(3).join(', ')}. ${hero.name}, ${hero.role}. ${styleOf(spec)}`
}

// ---------- a pick writes its part of the spec
export function applyPick(ws, step, pick) {
  if (!STEP_IDS.includes(step)) throw Object.assign(new Error('no such step'), { status: 404 })
  const s = ws.spec
  const opts = ws.options[step] || []
  const chosen = pick?.id ? opts.find(o => o.id === pick.id) : null
  const own = pick?.own ? cut(pick.own, 400) : ''
  if (!chosen && !own && step !== 'enemies' && !(step === 'heroes' && pick?.cast)) throw Object.assign(new Error('pick one of the options'), { status: 400 })
  const o = chosen || { name: own.split(/[.:,]/)[0].slice(0, 48) || 'Own idea', own }
  if (own && !safe(own)) throw Object.assign(new Error('that idea uses a name the studio does not build'), { status: 400 })
  if (step === 'design') Object.assign(s, { loop: o.loop || own, ...(o.goal ? { win: o.goal } : {}), ...(o.twist ? { twist: o.twist } : {}), ...(o.camera ? { camera: o.camera } : {}) })
  if (step === 'story') Object.assign(s, { story: { name: o.name, logline: o.logline || own, acts: o.acts || [] }, ...(o.hero ? { hero: o.hero } : {}), ...(o.logline ? { pitch: o.logline } : {}) })
  if (step === 'world') Object.assign(s, { setting: o.setting || own, ...(o.palette ? { palette: o.palette } : {}) })
  if (step === 'heroes') {
    if (pick?.cast) { s.cast = [pick.cast].filter(Boolean); s.hero = `${pick.cast.label || pick.cast.name || 'the hero'} (a found 3D model)` }
    else s.hero = `${o.name}${o.role ? `, ${o.role}` : ''}. ${o.look || own}${o.personality ? ` Personality: ${o.personality}.` : ''}`
  }
  if (step === 'enemies') {
    const ids = Array.isArray(pick?.ids) ? pick.ids : chosen ? [chosen.id] : []
    const list = opts.filter(x => ids.includes(x.id))
    if (!list.length && !own) throw Object.assign(new Error('pick at least one enemy'), { status: 400 })
    s.enemies = [...list.map(e => ({ name: e.name, kind: e.kind, behaviour: e.behaviour })), ...(own ? [{ name: o.name, kind: 'minion', behaviour: own }] : [])]
  }
  if (step === 'levels') s.levels = [{ name: o.name, idea: o.idea || own, map: o.map || [] }].filter(l => l.map.length || l.idea)
  if (step === 'sound') Object.assign(s, { sound: `${o.name}: ${o.feel || own}`, music: chosen ? { bpm: o.bpm, scale: o.scale, wave: o.wave, drums: o.drums } : undefined, ...(o.line ? { startLine: o.line } : {}) })
  ws.picks[step] = step === 'enemies' ? { ids: pick?.ids || [] } : chosen ? { ...chosen } : pick?.cast ? { cast: pick.cast } : { own }
  if (!ws.done.includes(step)) ws.done.push(step)
  const next = STEP_IDS[STEP_IDS.indexOf(step) + 1]
  ws.step = next || step
  return ws
}

// ---------- what the build gets
// The art that ships with the game: the picked backdrop, key art, hero design, its sprite
// sheet and the picked enemies' designs, as public/art/<name>.<ext>.
export function shippedArt(ws) {
  const out = []
  const of = (step, id) => (ws.options[step] || []).find(o => o.id === id)
  const add = (o, name, what) => { if (o?.file) out.push({ file: o.file, as: `${name}${o.file.match(/\.\w+$/)[0]}`, what }) }
  add(of('story', ws.picks.story?.id), 'key-art', 'title screen key art')
  add(of('world', ws.picks.world?.id), 'backdrop', 'the stage backdrop (parallax background)')
  const hero = of('heroes', ws.picks.heroes?.id)
  add(hero, 'hero', 'the hero design (portrait for menus)')
  if (hero?.sprite?.file) out.push({ file: hero.sprite.file, as: `hero-sheet${hero.sprite.file.match(/\.\w+$/)[0]}`, what: `the hero's sprite sheet: 3 columns × 2 rows of equal cells on flat light grey, poses ${SPRITE_POSES.join(', ')} (left to right, top to bottom); key out the grey` })
  for (const id of ws.picks.enemies?.ids || []) { const e = of('enemies', id); add(e, `enemy-${slug(e?.name)}`, `${e?.name} (${e?.kind}), single sprite on light grey; key out the grey`) }
  return out
}
const slug = s => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'x'

// The spec the build gets: the walked spec plus the art list and the maps.
export function workshopSpec(ws) {
  const art = shippedArt(ws).map(a => ({ as: a.as, what: a.what }))
  return { ...ws.spec, workshop: { id: ws.id, art } }
}

// Lines for GAME_SPEC.md from a walked spec.
export function workshopMarkdown(spec = {}) {
  const out = []
  if (spec.twist) out.push(`- **Twist:** ${spec.twist}`)
  if (spec.camera) out.push(`- **Camera:** ${spec.camera}`)
  if (spec.palette) out.push(`- **Palette:** ${spec.palette}`)
  if (spec.story) out.push(`\n## Story: ${spec.story.name}\n\n${spec.story.logline}\n\n${(spec.story.acts || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}`)
  if (Array.isArray(spec.enemies) && spec.enemies.some(e => e?.behaviour)) out.push(`\n## Enemies\n\n${spec.enemies.map(e => `- **${e.name}** (${e.kind || 'minion'}): ${e.behaviour || ''}`).join('\n')}`)
  for (const l of spec.levels || []) if (l.map?.length) out.push(`\n## Level: ${l.name}\n\n${l.idea}\n\nLegend: # solid, . empty, = platform, ^ hazard, S start, X exit, E enemy, B boss, C pickup, D door. Build the first stage from this map, one cell per tile.\n\n\`\`\`\n${l.map.join('\n')}\n\`\`\``)
  if (spec.music) out.push(`\n## Music\n\nA synthesised loop: ${spec.music.bpm} bpm, ${spec.music.scale} scale, ${spec.music.wave} lead, ${spec.music.drums} drums.${spec.startLine ? ` The hero's first line: “${spec.startLine}”.` : ''}`)
  if (spec.workshop?.art?.length) out.push(`\n## Art (in public/art/)\n\n${spec.workshop.art.map(a => `- art/${a.as}: ${a.what}`).join('\n')}\n\nUse these pictures instead of drawing those things in code.`)
  return out.length ? `${out.join('\n')}\n` : ''
}

// ---------- one planner call for a step's options
export async function planOptions({ provider, model, step, ws, signal }) {
  const res = await streamChat(provider, { trace: { kind: `workshop-${step}` }, model, maxTokens: step === 'levels' ? 2600 : 1200, temperature: 0.9, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal, messages: askFor(step, ws.spec, ws.picks) })
  const list = cleanOptions(step, res.text)
  if (!list.length) throw new Error('the planner sent no usable options')
  return list
}
