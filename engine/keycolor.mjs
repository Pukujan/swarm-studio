// The flat colour painted sprites and sprite sheets stand on, so they key out cleanly (the
// cutters read it from the corners: scripts/cutout.py, games/ares/tools/sheets/cut.py).
// Three keys, in the order they are preferred: magenta, green, blue.
//
// The key is chosen from a picture whenever there is one: `measureKey` asks the cutter to
// measure the figure's own colours and name the key furthest from them (a sheet is painted on
// the key measured from its figure's sprite; a sprite whose cut shows it sits close to its key
// is painted again on the measured one). Before any picture exists, `keyFor` guesses from the
// words: green when the description says pink or purple, else magenta.
import { execFile } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const KEYS = { magenta: '#FF00FF', green: '#00FF00', blue: '#0000FF' }
export const keyNamed = name => (KEYS[name] ? { name, hex: KEYS[name] } : { name: 'magenta', hex: KEYS.magenta })
export const keyFor = (look = '') => keyNamed(/pink|magenta|fuchsia|purple|violet|lilac|lavender|mauve|\brose\b/i.test(String(look)) ? 'green' : 'magenta')
export const keyBackground = (look, key = keyFor(look)) => `a perfectly flat solid ${key.name} (${key.hex}) chroma-key background, one even colour edge to edge with no gradient, and no ${key.name} anywhere on the character`
export const keyGround = (look, key) => `On ${keyBackground(look, key)}: no floor, no shadow, no scenery, nothing else in the picture`

// When the key colour itself was the trouble (left on the figure, a coloured rim, a figure in
// that colour), the second try is painted on another key: the one measured as furthest from
// the figure when there is a measurement, else magenta ↔ green.
export const KEY_TROUBLE = /magenta|pink|fuchsia|purple|green|rim|fringe|halo|spill|leftover|background (left|patch|show)|left around|close to the/i
export const keyTrouble = problems => (problems || []).some(p => KEY_TROUBLE.test(String(p)))
const HEX = /#(FF00FF|00FF00|0000FF)/i
export const keyOf = text => { const m = String(text || '').match(HEX); return Object.keys(KEYS).find(k => KEYS[k] === `#${m?.[1].toUpperCase()}`) || 'magenta' }
// Only the key's own words change ("magenta (#FF00FF)", "no magenta"): a figure's green cloak
// or blue coat keeps its colour.
export function swapKey(text, to) {
  const s = String(text || '')
  if (!HEX.test(s)) return `${s.replace(/\.?\s*$/, '')}. On ${keyBackground('', keyNamed(to || 'green'))}`
  const from = keyOf(s), next = keyNamed(KEYS[to] && to !== from ? to : from === 'magenta' ? 'green' : 'magenta')
  return s
    .replace(new RegExp(`\\b${from}(\\s*\\(${KEYS[from]}\\))`, 'gi'), `${next.name}$1`)
    .replace(new RegExp(`\\b(no|solid|flat|is|the) ${from}\\b`, 'gi'), `$1 ${next.name}`)
    .replace(new RegExp(KEYS[from], 'gi'), next.hex)
}

// A measured picture says the figure sits close to the key it stands on, and names a key that
// is further away: the problem to send it back with, and the key to paint it on. `m` is the
// cutter's report ({ key, clash, best }) or a sheet's ({ name, clash, best }).
export const CLASH = 0.03
export function keyClash(m) {
  const on = m?.key || m?.name
  if (!on || !KEYS[m.best] || m.best === on || !(m.clash > CLASH)) return null
  return { on, to: m.best, problem: `the figure's own colours are close to the ${on} background` }
}
// The other key to try when the first was the trouble: the best-scoring one that is not `not`
export const otherKey = (scores, not) => Object.keys(KEYS).filter(k => k !== not).sort((a, b) => (scores?.[a] ?? 0) - (scores?.[b] ?? 0))[0]

// Measure a picture (a cut-out sprite, or a figure on a flat background) and name the key
// furthest from the figure's colours → { pick, scores, key, clash }, or null when it cannot be
// measured (no Python, no Pillow, not a picture): the caller keeps the key it had.
const CUTOUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'cutout.py')
export function measureKey(file, { py = process.platform === 'win32' ? 'python' : 'python3', run = execFile } = {}) {
  return new Promise(ok => run(py, [CUTOUT, '--pick', file], { timeout: 60000 }, (err, out) => {
    try { const m = JSON.parse(String(out || '').trim().split('\n').pop()); ok(!err && KEYS[m.pick] ? m : null) } catch { ok(null) }
  }))
}
