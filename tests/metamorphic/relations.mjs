// The crew's metamorphic relations (decision 0019 point 3, issue #462): what must hold between two builds, or two
// readings of one build, when there is no single right output to compare against. Each relation takes its inputs
// and returns the ways it broke, [] when it holds. Every break names the inputs that broke it, so a red run says
// which brief, wording, page, section or seed to look at.
//
// The board relations (zoom, live/photo, adding a card) are with the tier manager (#440).
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { brandTheme, brandBrief } from '../../engine/brand.mjs'
import { workerMessages } from '../../engine/prompts.mjs'
import { exportRun } from '../../engine/export.mjs'
import { pageVersions } from '../../server/snaps.mjs'
import { lintSection } from '../../engine/lint/index.mjs'

const broke = (relation, inputs, message) => ({ relation, inputs, message })
export const describe = list => list.map(b => `${b.relation} [${Object.entries(b.inputs).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')}]: ${b.message}`).join('\n')

// ---------- 1. changing only the brand colour changes only colour tokens in the build
const HEX = /#[0-9a-f]{3,8}\b/gi
const isColour = v => /^#[0-9a-f]{3,8}$/i.test(String(v).trim()) || /^(rgb|hsl|oklch)a?\(/i.test(String(v).trim())

export const withAccent = (brand, accent) => ({ ...brand, palettes: brand.palettes.map(p => (p.id === brand.pick.palette ? { ...p, accent } : p)) })

function files(dir) {
  const out = new Map()
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (!/\.(zip|png|jpe?g|webp)$/i.test(f)) out.set(relative(dir, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')) } }
  walk(dir)
  return out
}

// The build, once with each brand: its theme, what the sitemap planner and every builder are told, and the
// exported site, file by file and line by line.
export async function brandColourOnly({ name, brand, accent, events }) {
  const out = [], other = withAccent(brand, accent), inputs = { build: name, from: brand.palettes.find(p => p.id === brand.pick.palette).accent, to: accent }
  const a = brandTheme(brand), b = brandTheme(other)
  for (const k of new Set([...Object.keys(a.vars), ...Object.keys(b.vars)]))
    if (a.vars[k] !== b.vars[k] && !(isColour(a.vars[k]) && isColour(b.vars[k]))) out.push(broke('brand-colour', { ...inputs, token: k }, `${k} changed from ${a.vars[k]} to ${b.vars[k]}, which is not a colour`))
  for (const k of ['name', 'direction', 'fonts', 'radius', 'system'])
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(broke('brand-colour', { ...inputs, field: k }, `the theme's ${k} changed`))
  // the sitemap planner's brand lines differ only in their colours
  if (brandBrief(brand).replace(HEX, '#') !== brandBrief(other).replace(HEX, '#')) out.push(broke('brand-colour', { ...inputs, prompt: 'sitemap' }, 'the planner is told something besides the colours differently'))
  // each builder is told exactly the same: sections read colours through var(), never as numbers
  const pages = events.filter(e => e.type === 'page').map(p => ({ ...p, layers: events.filter(e => e.type === 'layer:plan' && e.page === p.id) }))
  const plan = { pages, shared: [] }
  for (const page of pages) for (const layer of page.layers) {
    const say = theme => JSON.stringify(workerMessages({ theme, plan, page, layer }))
    if (say(a) !== say(b)) out.push(broke('brand-colour', { ...inputs, section: `${page.id}/${layer.id}` }, "the section's builder is told something different"))
  }
  // and no section has the brand colour written into it, where a new brand would not reach
  const own = new Set([brand, other].flatMap(x => x.palettes.filter(p => p.id === x.pick.palette).flatMap(p => [p.bg, p.text, p.accent, p.link])).map(h => h.toLowerCase()))
  for (const e of events) if (e.type === 'layer:done') for (const h of e.html.match(HEX) || []) if (own.has(h.toLowerCase())) out.push(broke('brand-colour', { ...inputs, section: `${e.page}/${e.layer}` }, `the section writes the brand colour ${h} itself`))
  // the exported site: every line that differs sets a colour token
  const site = async theme => {
    const runDir = mkdtempSync(join(tmpdir(), 'meta-brand-'))
    try {
      const evs = [...events.filter(e => e.type !== 'theme'), { type: 'theme', ...theme, by: 'brand' }]
      const { dir } = await exportRun({ events: evs, runId: 'r-meta', runDir, sections: [], name })
      return files(dir)
    } finally { rmSync(runDir, { recursive: true, force: true }) }
  }
  // a line may differ only in colour values, each one of the new theme's colour tokens (the :root block, the
  // page's theme-color, the favicon, the handoff's design tokens)
  const theirs = new Set(Object.values(b.vars).filter(isColour).map(v => v.toLowerCase()))
  const onlyColours = (p, q) => {
    const was = p.match(HEX) || [], now = q.match(HEX) || []
    return p.replace(HEX, '#') === q.replace(HEX, '#') && now.every((h, k) => h === was[k] || theirs.has(h.toLowerCase()))
  }
  const [x, y] = [await site(a), await site(b)]
  for (const f of new Set([...x.keys(), ...y.keys()])) {
    if (!x.has(f) || !y.has(f)) { out.push(broke('brand-colour', { ...inputs, file: f }, 'the file is in one build and not the other')); continue }
    const l = x.get(f).split('\n'), m = y.get(f).split('\n')
    if (l.length !== m.length) { out.push(broke('brand-colour', { ...inputs, file: f }, `${l.length} lines against ${m.length}`)); continue }
    for (let i = 0; i < l.length; i++) if (l[i] !== m[i] && !onlyColours(l[i], m[i])) {
      out.push(broke('brand-colour', { ...inputs, file: f, line: i + 1 }, `"${l[i].trim().slice(0, 100)}" became "${m[i].trim().slice(0, 100)}"`))
      break
    }
  }
  return out
}

// ---------- 2. renaming one page leaves every other page's content version unchanged (spec 36)
export function renameKeepsOthers({ name, events, page, title }) {
  const inputs = { build: name, page, title }
  if (!events.some(e => e.type === 'page' && e.id === page)) return [broke('rename', inputs, 'no such page in the build')]
  const renamed = events.map(e => (e.type === 'page' && e.id === page ? { ...e, title } : e))
  const before = pageVersions(events), after = pageVersions(renamed), out = []
  for (const [id, v] of before) {
    if (id === page && after.get(id) === v) out.push(broke('rename', inputs, 'the renamed page kept its version, so its old picture would be shown'))
    if (id !== page && after.get(id) !== v) out.push(broke('rename', { ...inputs, other: id }, `${id}'s version changed from ${v} to ${after.get(id)}`))
  }
  return out
}

// ---------- 3. the same brief, worded differently, gives the same sitemap structure
// The planner's JSON lines, read as engine/run.mjs reads them (one object per line, a bad line skipped).
export function planLines(text) {
  const out = []
  for (const line of String(text).split('\n')) { const s = line.trim(); if (!s.startsWith('{')) continue; try { out.push(JSON.parse(s)) } catch {} }
  return out
}
// The structure: how many pages, home first, the shared navigation and footer, and which of the pages the brief
// names each page is. The words, colours and section roles are the model's to choose.
export function sitemapStructure(text, named) {
  const lines = planLines(text)
  const pages = lines.filter(o => o.type === 'page')
  const shared = lines.filter(o => o.type === 'layer' && o.page === '*').map(o => o.id).sort()
  const stem = w => w.toLowerCase().replace(/[^a-z]/g, '').replace(/(ies|es|s)$/, '')
  const kind = p => named.find(n => n.some(w => `${p.id} ${p.title}`.toLowerCase().split(/[^a-z]+/).map(stem).includes(stem(w))))?.[0] || 'other'
  return { pages: pages.length, home: pages[0] ? kind(pages[0]) : null, shared, kinds: pages.map(kind).sort(), theme: lines.some(o => o.type === 'theme') }
}
export function sameSitemap({ brief, named, wordings }) {
  const [first, ...rest] = wordings, out = []
  const want = sitemapStructure(first.text, named)
  const missing = named.map(n => n[0]).filter(k => !want.kinds.includes(k))
  if (want.kinds.includes('other') || missing.length) out.push(broke('sitemap', { brief, wording: first.id }, `the pages are ${JSON.stringify(want.kinds)}, where the brief names ${JSON.stringify(named.map(n => n[0]))}`))
  for (const w of rest) {
    const got = sitemapStructure(w.text, named)
    for (const k of Object.keys(want)) if (JSON.stringify(got[k]) !== JSON.stringify(want[k]))
      out.push(broke('sitemap', { brief, wording: w.id, against: first.id, part: k }, `${JSON.stringify(got[k])} where the first wording gave ${JSON.stringify(want[k])}`))
  }
  return out
}

// ---------- 4. a section reworked by the reviewer keeps the copy it was given, word for word
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', times: '×', copy: '©' }
const flat = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITY[e.toLowerCase()] ?? m)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()
// the words a reader sees, one entry per text node (scripts, styles and drawings left out)
export function textNodes(html) {
  const bare = String(html).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  return [...pieces(bare)].map(p => flat(p.text ?? ' ')).filter(t => /[a-z0-9]/i.test(t))
}
export function keepsCopy({ name, section, content, before, after }) {
  const given = flat(content), seen = textNodes(after), all = seen.join(' '), tight = flat([...pieces(String(after))].map(p => p.text ?? '').join(''))
  const kept = t => all.includes(t) || tight.includes(t)
  return textNodes(before).filter(t => given.includes(t) && !kept(t)).map(t => broke('rework', { build: name, section }, `"${t}" was given and built, and the rework lost it`))
}

// ---------- 5. slop-linter findings don't change with whitespace or attribute order
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s + 0x9e3779b9 | 0)) >>> 0) / 2 ** 32 }
const SPACES = [' ', '  ', '\n', '\n  ', '\t', ' \n    ']
// the tags of a piece of HTML, quotes respected (Tailwind classes carry > and /)
function* pieces(html) {
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) { yield { text: html.slice(i) }; return }
    if (lt > i) yield { text: html.slice(i, lt) }
    if (!/[a-z!/]/i.test(html[lt + 1] || '')) { yield { text: '<' }; i = lt + 1; continue }
    let j = lt + 1, q = ''
    for (; j < html.length; j++) { const c = html[j]; if (q) { if (c === q) q = '' } else if (c === '"' || c === "'") q = c; else if (c === '>') break }
    yield { tag: html.slice(lt, j + 1) }
    i = j + 1
  }
}
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g
// The same section written differently: whitespace that is only whitespace changed, the space between a tag's
// attributes changed and their order shuffled. Text a reader sees is never touched.
export function reformat(html, seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)]
  let raw = 0
  let out = ''
  for (const p of pieces(String(html))) {
    if (p.text !== undefined) { out += raw ? p.text : /^\s+$/.test(p.text) ? pick(SPACES) : p.text; continue }
    const m = /^<([a-z][\w-]*)([\s\S]*?)(\/?)>$/i.exec(p.tag)
    if (/^<(script|style|pre|textarea)\b/i.test(p.tag)) raw++
    else if (/^<\/(script|style|pre|textarea)\b/i.test(p.tag)) raw = Math.max(0, raw - 1)
    if (!m) { out += p.tag; continue }
    const attrs = [...m[2].matchAll(ATTR)].map(a => a[0])
    for (let i = attrs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [attrs[i], attrs[j]] = [attrs[j], attrs[i]] }
    out += `<${m[1]}${attrs.map(a => pick(SPACES) + a).join('')}${m[3] ? `${pick(SPACES)}/` : ''}>`
  }
  return out
}
const verdict = list => list.map(f => `${f.severity} ${f.id}`).sort()
export function lintStable({ name, section, html, content = '', seeds = [1, 2, 3, 4, 5] }) {
  const want = verdict(lintSection(html, { content })), out = []
  for (const seed of seeds) {
    const got = verdict(lintSection(reformat(html, seed), { content }))
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      const lost = want.filter(x => !got.includes(x)), gained = got.filter(x => !want.includes(x))
      out.push(broke('linter', { build: name, section, seed }, `${lost.length ? `lost ${lost.join(', ')}` : ''}${lost.length && gained.length ? '; ' : ''}${gained.length ? `gained ${gained.join(', ')}` : ''}`))
    }
  }
  return out
}
