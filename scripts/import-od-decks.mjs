#!/usr/bin/env node
// Open Design's deck themes (html-ppt, MIT) as deck looks (docs/specs/35-open-design.md, the Deck kind).
//
// A developer runs this by hand against a checkout of nexu-io/open-design at the pinned commit; its output,
// engine/opendesign/decks.json, is committed. Nothing is fetched or run when the plugin is installed or used.
//
//   node scripts/import-od-decks.mjs <open-design checkout>
//   (sparse-checkout '/design-templates/html-ppt/' next to what scripts/import-od-systems.mjs needs)
//
// A deck is styled by the project's locked brand: its colours and fonts. So what a theme brings is its
// structure: corners, shadows, letter spacing and its decoration rules (a grid behind the slide, a rule above a
// card). Each theme's own colours are kept too, for a deck made without a brand. In the decoration rules, every
// colour that is one of the theme's own tokens is pointed back at that token (#111 → var(--text-1)), so the
// brand's colours flow into the decoration as well. Themes that differ only in colour are one look under a
// brand, so only the themes with a look of their own are kept (FEEL).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const COMMIT = 'bc06128813c99fa63f5af53ad2c903c27db057f2'
const ROOT = 'design-templates/html-ppt'
// the tokens a theme sets that describe its structure (the rest are colours and fonts)
const SHAPE = ['radius', 'radius-sm', 'radius-lg', 'shadow', 'shadow-lg', 'letter-tight']
const COLOURS = ['bg', 'bg-soft', 'surface', 'surface-2', 'border', 'border-strong', 'text-1', 'text-2', 'text-3', 'accent', 'accent-2', 'accent-3']

// One-line description of each kept look, ours (their README's theme notes are in Chinese and English mixed)
const FEEL = {
  'minimal-white': 'Plain and quiet: soft cards, lots of room',
  'academic-paper': 'A paper: serif, thin rules, no shadows',
  aurora: 'Glowing light behind dark slides',
  bauhaus: 'Bauhaus: square corners, heavy type',
  blueprint: 'A blueprint: a grid behind every slide',
  'corporate-clean': 'Corporate: clean cards with a top rule',
  'cyberpunk-neon': 'Neon edges and scan lines',
  'editorial-serif': 'Editorial: serif headings, thin rules',
  'engineering-whiteprint': 'An engineering drawing: grid and dimension lines',
  glassmorphism: 'Frosted glass cards over colour',
  'japanese-minimal': 'Japanese minimal: wide margins, hairlines',
  'magazine-bold': 'A magazine: big serif, heavy rules',
  'memphis-pop': 'Memphis pop: shapes and hard shadows',
  midcentury: 'Mid-century: warm, rounded, calm',
  'neo-brutalism': 'Neo-brutalist: thick borders, hard shadows',
  'news-broadcast': 'A news broadcast: bars and tickers',
  'pitch-deck-vc': 'A pitch deck: crisp cards, one accent',
  'rainbow-gradient': 'A rainbow edge on clean slides',
  'retro-tv': 'Retro TV: rounded screen, warm grain',
  'sharp-mono': 'Sharp mono: square, black rules',
  'swiss-grid': 'Swiss grid: twelve columns, a rule on every card',
  'terminal-green': 'A terminal: mono type, a glow',
  vaporwave: 'Vaporwave: a sunset grid',
  'y2k-chrome': 'Y2K chrome: shine and bevels',
  'soft-pastel': 'Soft pastel: round and light'
}

const hex = s => { const h = s.toLowerCase().slice(1); return `#${h.length === 3 ? [...h].map(c => c + c).join('') : h}` }
const name = s => s.replace(/(^|-)(\w)/g, (_, d, c) => `${d ? ' ' : ''}${c.toUpperCase()}`).replace(/\bVc\b/, 'VC').replace(/\bY2k\b/, 'Y2K').replace(/\bTv\b/, 'TV')

export function convertTheme(css, slug) {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] || ''
  const tokens = {}
  for (const m of root.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].replace(/\s+/g, ' ').trim()
  // decoration: everything after the :root block, without comments, imports or font faces
  let rules = css.slice(css.indexOf('}', css.indexOf(':root')) + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '').replace(/@font-face\s*\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim()
  // a colour that is one of the theme's tokens becomes that token, so the brand's colours reach the decoration
  const byHex = new Map()
  for (const k of COLOURS) if (/^#[0-9a-f]{3,6}$/i.test(tokens[k] || '') && !byHex.has(hex(tokens[k]))) byHex.set(hex(tokens[k]), k)
  // their page background (a grid, a glow) goes on each 16:9 slide, which is what is shown and printed
  rules = rules.replace(/(^|[},]\s*)(?:html|body)(?:\s*,\s*(?:html|body))?\s*\{/g, '$1.deck>.slide{')
  rules = rules.replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, h => byHex.has(hex(h)) ? `var(--${byHex.get(hex(h))})` : h)
  const shape = Object.fromEntries(SHAPE.filter(k => tokens[k]).map(k => [k, tokens[k]]))
  const colours = Object.fromEntries(COLOURS.filter(k => tokens[k]).map(k => [k, tokens[k]]))
  const fontOf = k => (tokens[k] || '').split(',')[0].replace(/['"]/g, '').trim()
  return { slug, name: name(slug), feel: FEEL[slug] || '', shape, rules, colours, fonts: { heading: fontOf('font-display'), body: fontOf('font-sans') }, source: `${ROOT}/assets/themes/${slug}.css` }
}

export function importAll(root) {
  const dir = join(root, ROOT, 'assets', 'themes')
  const out = [], seen = new Map(), dropped = []
  // minimal-white first: the plain default
  const files = readdirSync(dir).filter(f => f.endsWith('.css')).sort((a, b) => (b === 'minimal-white.css') - (a === 'minimal-white.css') || a.localeCompare(b))
  for (const f of files) {
    const t = convertTheme(readFileSync(join(dir, f), 'utf8'), f.replace(/\.css$/, ''))
    // a theme with no decoration of its own differs from the plain one only in colour: under a brand it is
    // the same look, so only the ones with a feel of their own (FEEL) are kept
    if (!FEEL[t.slug]) { dropped.push(`${t.slug} (${t.rules ? 'not picked' : 'colours only'})`); continue }
    const key = JSON.stringify([t.shape, t.rules])
    if (seen.has(key)) { dropped.push(`${t.slug} (same as ${seen.get(key)})`); continue }
    seen.set(key, t.slug)
    out.push(t)
  }
  return { themes: out, dropped }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) { console.error('usage: node scripts/import-od-decks.mjs <open-design checkout>'); process.exit(2) }
  let at = ''
  try { at = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch {}
  if (at !== COMMIT) console.error(`warning: the checkout is at ${at || 'an unknown commit'}, not ${COMMIT}`)
  const { themes, dropped } = importAll(root)
  for (const d of dropped) console.error(`left out: ${d}`)
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'opendesign', 'decks.json')
  const line = x => JSON.stringify(x)
  writeFileSync(file, `{"source": ${line({ repo: 'nexu-io/open-design', commit: COMMIT, path: `${ROOT}/`, upstream: 'lewislulu/html-ppt-skill', licence: 'MIT (html-ppt, Copyright (c) 2026 lewis)' })},\n"themes": [\n${themes.map(line).join(',\n')}\n]}\n`)
  console.log(`${themes.length} deck looks → ${file}`)
}
