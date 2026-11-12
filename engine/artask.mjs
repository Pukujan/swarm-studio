// Art asked for during a build. The first art pass paints what the spec names before stage 1;
// a slice that needs a picture nobody painted (a prop, a backdrop, a companion's run sheet)
// asks for it in ART_REQUESTS.json instead of drawing a placeholder. After the slice the
// Studio paints the asks through the same route as the first pass (same image choice and
// backup, same style guide, the hero's picture as reference, the chroma-key cut and check),
// at most a few per slice, then gives the crew one short turn to swap its stand-ins for them.
// Every ask that was taken is kept in ART_ASKED.json, so a resumed build keeps its pictures.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { keyGround } from './keycolor.mjs'
import { MOVES, NO_PEOPLE, FX_LAYOUT, viewOf, sheetItem, companionRun, heroLook } from './game.mjs'

export const ASK_FILE = 'ART_REQUESTS.json'
export const ASKED_FILE = 'ART_ASKED.json'
// a cap per slice and per build, so asking can't run up a bill (SWARM_ART_ASKS sets the slice cap)
// (three painters work at once, about a minute a picture: six asks hold a slice up for two to three minutes)
export const ASKS_PER_STAGE = Math.max(0, Math.min(12, Number(process.env.SWARM_ART_ASKS ?? 6) || 0))
export const ASKS_PER_BUILD = Math.max(ASKS_PER_STAGE, Math.min(60, Number(process.env.SWARM_ART_ASKS_BUILD ?? 24) || 0))
export const ASK_KINDS = ['sprite', 'prop', 'backdrop', 'icon', 'portrait', 'sheet', 'tile', 'ui', 'effect']
const PREFIX = { sprite: 'sprite', prop: 'prop', backdrop: 'place', icon: 'item', portrait: 'portrait', tile: 'tile', ui: 'ui', effect: 'fx' }

const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f"`<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const idOf = file => String(file || '').replace(/^art\//, '').replace(/\.[a-z0-9]+$/i, '')

// Where the crew writes its asks: the app root, and ports/godot/ for a Godot-first game
// (whose crew may not touch anything outside it)
export const askPaths = dir => [join(dir, ASK_FILE), join(dir, 'ports', 'godot', ASK_FILE)]

// One ask → a picture the painters know ({ id, kind, aspect, what, gen, cutout? } or a sheet),
// or { error } saying why it was not taken. `known`: id → look of every figure that has a picture.
export function askItem(spec, ask, known = new Map()) {
  if (!ask || typeof ask !== 'object') return { error: 'not an object' }
  const kind = String(ask.kind || '').toLowerCase()
  if (!ASK_KINDS.includes(kind)) return { error: `kind must be one of ${ASK_KINDS.join(', ')}` }
  const what = text(ask.what, 120), look = text(ask.look, 300)
  if (what.length < 3) return { error: 'says what it is in "what"' }
  const where = text(spec?.setting, 200), side = viewOf(spec) === 'side'
  if (kind === 'sheet') {
    const of = String(ask.of || '').startsWith('sprite-') ? String(ask.of) : `sprite-${slug(ask.of || what)}`
    if (!known.has(of)) return { error: `no painted ${of} to animate: ask for the sprite first` }
    const name = slug(ask.move || 'run') || 'run'
    const owner = of.replace(/^sprite-/, '')
    const pal = known.get(of)
    const move = ask.frames ? { name, fps: Number(ask.fps) > 0 ? Math.min(24, Number(ask.fps)) : 10, loop: !!ask.loop, frames: text(ask.frames, 400) }
      : owner !== 'hero' && name === 'run' ? { name, ...companionRun(`${pal.kind || ''} ${pal.look || ''}`) }
        : MOVES[name] ? { name, ...MOVES[name] } : null
    if (!move) return { error: `the move "${name}" needs its six frames in "frames"` }
    return { ...sheetItem(spec, { owner, who: what, look: look || pal.look || what, move, after: of, what: `${name} sheet of ${what}` }), asked: true }
  }
  // "from": "library" takes a picture from the asset library when one fits, and paints it otherwise
  const lib = String(ask.from || '').toLowerCase() === 'library' && kind !== 'sheet' && kind !== 'effect' ? { library: true } : {}
  const id = `${PREFIX[kind]}-${slug(ask.id ? String(ask.id).replace(/^(sprite|prop|place|item|portrait|tile|ui|fx)-/, '') : what) || 'x'}`
  const base = { id, asked: true, ...lib, what: `${kind === 'backdrop' ? 'backdrop for' : kind === 'icon' ? 'icon for' : kind === 'portrait' ? 'portrait of' : kind === 'ui' ? 'UI piece:' : kind === 'effect' ? 'effect:' : kind === 'tile' ? 'tile of' : `${kind} of`} ${what}` }
  // an effect: six frames of light on black, played once with additive blending
  if (kind === 'effect') {
    const frames = text(ask.frames, 400) || `${what}${look ? `, ${look}` : ''}: it appears, grows to its brightest and fades to nothing`
    return { ...base, kind: 'sheet', fx: true, aspect: 'landscape', sheet: id.replace(/^fx-/, ''), fps: Number(ask.fps) > 0 ? Math.min(24, Number(ask.fps)) : 12, loop: !!ask.loop, frames, layout: FX_LAYOUT, look: `one game effect: ${frames}`, gen: `${what} effect` }
  }
  if (kind === 'tile') return { ...base, kind: 'tile', aspect: 'square', gen: `A seamless repeating game texture tile${where ? ` of ${where}` : ''}: ${what}${look ? `, ${look}` : ''}. It fills the whole square edge to edge and repeats in every direction (the left edge continues the right edge, the top continues the bottom), flat even lighting, no perspective, no horizon, no border, no vignette, no single object that would show the repeat. ${NO_PEOPLE}` }
  if (kind === 'ui') return { ...base, kind: 'ui', aspect: 'square', cutout: true, ref: 'sprite-hero', gen: `A single game interface piece: ${what}${look ? `, ${look}` : ''}. Seen flat-on, the whole piece in frame with space around, bold clean outline, in the materials and colours of the reference picture's world, with no words, letters or numbers on it and no people. ${keyGround(look || what)}` }
  if (kind === 'sprite') return { ...base, kind: 'sprite', aspect: 'square', cutout: true, ref: 'sprite-hero', look: look || what, gen: `Game character sprite: the full body of ${what}${look ? `, ${look}` : ''}. ${side ? 'Side view facing right, mid-stride' : 'Standing, facing the viewer'}, head to feet in frame with space around, bold clean outline, drawn in the same style as the reference picture. ${keyGround(look || what)}` }
  if (kind === 'prop') return { ...base, kind: 'sprite', aspect: 'square', cutout: true, ref: 'sprite-hero', gen: `A single game prop: ${what}${look ? `, ${look}` : ''}. ${side ? 'Seen from the side' : 'Seen from a three-quarter view'}, the whole object in frame with space around, bold clean outline, drawn in the same style as the reference picture, no people. ${keyGround(look || what)}` }
  if (kind === 'backdrop') return { ...base, kind: 'backdrop', aspect: 'landscape', gen: `${side ? 'Side-on view, as a side-scrolling game sees it' : 'Top-down three-quarter view'}: ${what}${look ? `, ${look}` : ''}${where ? `, in ${where}` : ''}. ${side ? 'A wide horizontal stretch, the ground along the lower third, depth behind, clear open space in the middle for the characters' : 'Walls and props at the edges, open floor in the middle'}. ${NO_PEOPLE}` }
  if (kind === 'icon') return { ...base, kind: 'icon', aspect: 'square', gen: `A single emblem for "${what}"${look ? `: ${look}` : ''}. One bold symbol centred on a plain dark circle, readable when small` }
  return { ...base, kind: 'portrait', aspect: 'portrait', gen: `Chest-up character portrait of ${what}${look ? `: ${look}` : ''}. Facing three-quarters, plain dark backdrop${where ? `, from ${where}` : ''}` }
}

// The asks a slice left, read and cleared. have: the art painted so far ({ file, ... });
// asked: how many were taken in this build before. → { items, refused: [{ what, why }] }
export function takeAsks(dir, spec, { have = [], asked = 0, cap = ASKS_PER_STAGE, total = ASKS_PER_BUILD } = {}) {
  const raw = []
  for (const p of askPaths(dir)) {
    if (!existsSync(p)) continue
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'))
      raw.push(...(Array.isArray(j) ? j : Array.isArray(j?.asks) ? j.asks : []))
    } catch { raw.push({ broken: true }) }
    writeFileSync(p, '[]\n')
  }
  const haveIds = new Set(have.map(f => idOf(f.file)))
  // every figure with a picture: the hero (and its companion), and sprites asked before
  const known = new Map([['sprite-hero', { look: heroLook(spec) }]])
  for (const f of have) if (/^sprite-/.test(idOf(f.file))) known.set(idOf(f.file), { look: f.look || f.what || '', kind: f.kind })
  const items = [], refused = []
  const room = Math.max(0, Math.min(cap, total - asked))
  for (const ask of raw) {
    const what = text(ask?.what, 60) || 'an ask'
    if (ask?.broken) { refused.push({ what: ASK_FILE, why: 'it is not valid JSON' }); continue }
    // a sprite asked in the same file can be animated in the same file
    const it = askItem(spec, ask, new Map([...known, ...items.filter(i => i.kind === 'sprite').map(i => [i.id, { look: i.look || i.what }])]))
    if (it.error) { refused.push({ what, why: it.error }); continue }
    if (haveIds.has(it.id) || items.some(i => i.id === it.id)) { refused.push({ what, why: `${it.id} is painted already` }); continue }
    if (items.length >= room) { refused.push({ what, why: room < cap ? `this build has had its ${total} asked pictures` : `at most ${cap} pictures per slice` }); continue }
    items.push(it)
  }
  return { items, refused }
}

// The asks that were taken, kept so a resumed build paints (or reuses) them with the first pass
export function askedBefore(dir) {
  try { const j = JSON.parse(readFileSync(join(dir, ASKED_FILE), 'utf8')); return Array.isArray(j) ? j.filter(i => i?.id && i?.kind) : [] } catch { return [] }
}
export function keepAsked(dir, items) {
  const all = askedBefore(dir)
  for (const it of items) if (!all.some(a => a.id === it.id)) all.push(it)
  writeFileSync(join(dir, ASKED_FILE), JSON.stringify(all, null, 1) + '\n')
  return all
}

// What a stage is told about asking. godot: the file sits in ports/godot/.
export function askBrief({ godot = false, cap = ASKS_PER_STAGE } = {}) {
  if (!cap) return ''
  const file = godot ? `ports/godot/${ASK_FILE}` : ASK_FILE
  return `- Need a picture that is not in the painted art above (a prop, an obstacle, a backdrop, an icon, a new character, a run sheet for a sprite, a repeating tile, an interface piece, an effect)? Ask for it instead of settling for a drawn shape: write ${file} as a JSON list, at most ${cap} per slice, for example [{"kind": "prop", "what": "a rusty rooftop water tower"}, {"kind": "sheet", "of": "sprite-kumo", "move": "run"}]. kind is one of ${ASK_KINDS.join(', ')}; "what" says what it is and "look" adds detail; a sheet names the sprite it animates in "of" and its "move" (run, jump, slide, climb, fix, hurt, idle, walk, or any move with its six poses in "frames"); an effect is six frames of light on black, drawn with additive blending (say how it plays out in "frames"). Add "from": "library" to take a ready-made picture from the studio's asset library (about 14,600 pictures in many styles; credits are kept in public/art/CREDITS.md) when one fits, instead of painting it. The Studio paints them in the game's style when this slice ends and gives you a short turn to use them; draw a stand-in until then. ${ASKED_FILE} lists what was asked before: never ask twice.`
}
