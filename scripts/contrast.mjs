// node scripts/contrast.mjs: WCAG AA check of the studio's token pairs and the crew pills (4.5 text, 3 for large text / UI)
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
const W = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(`${W}/web/tokens.css`, 'utf8'), block = sel => css.slice(css.indexOf(sel), css.indexOf('\n}', css.indexOf(sel)))
const DARK = block(':root {'), LIGHT = block(':root[data-theme="light"] {')
let root = DARK // the light block overrides the dark one, so a light token is looked up there first
const tok = n => {
  const re = new RegExp(`--${n}:\\s*(?:var\\(--([\\w-]+)\\)|(?:var\\([^,]+,\\s*)?(#[0-9A-Fa-f]{6}))`)
  const m = re.exec(root) || re.exec(DARK)
  if (!m) throw new Error('no token ' + n)
  return m[1] ? tok(m[1]) : m[2]
}
globalThis.window = {}; eval(readFileSync(`${W}/web/crew.js`, 'utf8'))
const { contrast, color, ink, NAMES } = window.SwarmCrew
const mix = (fg, bg, a) => '#' + [1, 3, 5].map(i => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('')
let bad = 0
for (const [mode, r] of [['dark', DARK], ['light', LIGHT]]) {
root = r
const void_ = tok('void'), deep = tok('deep'), panel = mix(tok('text'), deep, .08)
const pairs = [
  ['text on void', tok('text'), void_, 4.5], ['text on deep', tok('text'), deep, 4.5], ['text on raised glass', tok('text'), panel, 4.5],
  ['muted on void', tok('muted'), void_, 4.5], ['muted on deep', tok('muted'), deep, 4.5], ['muted on raised glass', tok('muted'), panel, 4.5],
  ['code on void', tok('code'), void_, 4.5], ['accent on void', tok('accent'), void_, 4.5], ['accent-ink on accent', tok('accent-ink'), tok('accent'), 4.5],
  ['text on frame (primary pill)', tok('text'), tok('frame'), 4.5], ['hot-text on void', tok('hot-text'), void_, 4.5], ['ok on void', tok('ok'), void_, 4.5],
  ['info on void', tok('info'), void_, 4.5], ['frame-hi ring on void (UI)', tok('frame-hi'), void_, 3], ['frame line on void (UI)', tok('frame'), void_, 1],
]
if (mode === 'dark') for (const n of NAMES) { const c = color(n); pairs.push([`pill ${n} ${c}`, ink(c), c, 4.5]) }
for (const [name, fg, bg, need] of pairs) { const r = contrast(fg, bg); const ok = r >= need; if (!ok) bad++; console.log(`${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (needs ${need})  ${mode}  ${name}  ${fg} on ${bg}`) }
}
console.log(bad ? `${bad} pair(s) below AA` : 'all pairs meet WCAG AA'); process.exit(bad ? 1 : 0)
