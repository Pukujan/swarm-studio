// The slop linter (engine/lint, decision 0016, issue #448): each rule fires on the look it names and not on a
// clean section, copy the planner gave is not flagged, the Studio's own CSS has no blue, purple or green,
// and the time to lint a section grows in step with its size.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { lintArtifact, renderFindingsForAgent } from '../engine/lint/artifact.mjs'
import { lintSection, forBuilder, chromeFindings } from '../engine/lint/index.mjs'

const ids = list => list.map(f => f.id)
const CLEAN = `<section class="bg-[var(--background)] text-[var(--foreground)] py-24 px-6">
  <div class="max-w-6xl mx-auto grid gap-8 md:grid-cols-2">
    <h2 style="font-family:var(--font-heading)" class="text-4xl">Boats every hour from six</h2>
    <p class="text-[var(--muted-foreground)]">The harbour ferry runs all year.</p>
    <span class="uppercase tracking-widest text-xs text-[var(--accent)]">Timetable</span>
    <a data-goto="times" class="rounded-[var(--radius)] bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-3">See times</a>
  </div>
</section>`

test('a clean section has no findings', () => {
  assert.deepEqual(lintSection(CLEAN), [])
})

// Open Design's rules, as ported (artifact.mjs): one case each
const UPSTREAM = {
  'purple-gradient': '<div style="background:linear-gradient(90deg,#7c3aed,#fff)"></div>',
  'trust-gradient': '<div style="background:linear-gradient(90deg,#3b82f6,#06b6d4)"></div>',
  'ai-default-indigo': '<style>.cta{background:#6366f1}</style>',
  'emoji-icon': '<h3>🚀 Launch</h3>',
  'left-accent-card': '<style>.card{border-left:4px solid red;border-radius:12px}</style>',
  'sans-display': '<style>h1{font-family:Inter,sans-serif}</style>',
  'invented-metric': '<p>10× faster than before</p>',
  'filler-copy': '<p>Lorem ipsum</p>',
  'scroll-into-view': '<button onclick="x.scrollIntoView()">Go</button>',
  'all-caps-no-tracking': '<style>.eyebrow{text-transform:uppercase}</style>',
  'external-image': '<img src="https://images.unsplash.com/photo-1">',
  'raw-hex': `<style>${Array.from({ length: 13 }, (_, i) => `.c${i}{color:#11111${i % 10}}`).join('')}</style>`,
  'accent-overuse': Array.from({ length: 7 }, () => '<b style="color:var(--accent)">x</b>').join('')
}
for (const [id, html] of Object.entries(UPSTREAM)) {
  test(`upstream rule ${id}`, () => assert.ok(ids(lintArtifact(html)).includes(id), JSON.stringify(lintArtifact(html))))
}

test('upstream: indigo declared as the theme accent is the design system, not a default', () => {
  assert.ok(!ids(lintArtifact('<style>:root{--accent:#6366f1}</style><a style="color:var(--accent)">x</a>')).includes('ai-default-indigo'))
})

test('upstream: uppercase with enough tracking passes', () => {
  assert.ok(!ids(lintArtifact('<style>.e{text-transform:uppercase;letter-spacing:.08em}</style>')).includes('all-caps-no-tracking'))
})

test('upstream: the agent message lists P0 first, with its fix', () => {
  const text = renderFindingsForAgent(lintArtifact('<style>.e{text-transform:uppercase}</style><h3>🚀 Go</h3>'))
  assert.ok(text.indexOf('[P0] emoji-icon') < text.indexOf('[P1] all-caps-no-tracking'))
  assert.match(text, /Fix: /)
})

// Swarm's rules for Tailwind sections (rules.mjs)
const SWARM = {
  'purple-gradient': '<section class="bg-gradient-to-r from-indigo-500 to-purple-600"></section>',
  'trust-gradient': '<section class="bg-gradient-to-r from-blue-500 to-cyan-400"></section>',
  'ai-default-indigo': '<a class="bg-indigo-600 text-white">Go</a>',
  'gradient-text': '<h2 class="bg-clip-text text-transparent">Hi</h2>',
  'left-accent-card': '<div class="rounded-xl border-l-4 border-[var(--primary)] p-6">x</div>',
  'all-caps-no-tracking': '<span class="uppercase text-xs">New</span>',
  'glassmorphism': '<div class="backdrop-blur-md bg-white/10">x</div>',
  'off-theme-colour': '<p class="text-gray-500 bg-blue-50 border-slate-200">x</p>',
  'raw-hex': `<div class="${Array.from({ length: 7 }, (_, i) => `bg-[#12345${i}]`).join(' ')}"></div>`
}
for (const [id, html] of Object.entries(SWARM)) {
  test(`swarm rule ${id}`, () => assert.ok(ids(lintSection(html)).includes(id), JSON.stringify(lintSection(html))))
}

test('swarm: uppercase with tracking-widest or an em value of 0.06 or more passes', () => {
  for (const c of ['uppercase tracking-widest', 'uppercase tracking-wider', 'uppercase tracking-[0.08em]', 'uppercase tracking-[.1em]']) {
    assert.ok(!ids(lintSection(`<span class="${c}">x</span>`)).includes('all-caps-no-tracking'), c)
  }
  assert.ok(ids(lintSection('<span class="uppercase tracking-[0.02em]">x</span>')).includes('all-caps-no-tracking'))
})

test('a rule is reported once, P0 first, and page-only upstream rules are left out', () => {
  const found = lintSection('<style>h1{font-family:Inter}</style><section><h3 class="uppercase">🚀 Go</h3><h2 class="bg-clip-text text-transparent">x</h2></section>')
  assert.equal(new Set(ids(found)).size, found.length)
  assert.ok(!ids(found).includes('sans-display'))
  assert.ok(!ids(found).includes('missing-section-anchor'))
  assert.deepEqual(found.map(f => f.severity), [...found.map(f => f.severity)].sort())
})

test('copy the planner gave word for word is not flagged; copy the builder added is', () => {
  const html = '<section><p>Zero downtime moves, guaranteed.</p></section>'
  assert.ok(ids(lintSection(html)).includes('invented-metric'))
  assert.ok(!ids(lintSection(html, { content: 'Body: "Zero downtime moves, guaranteed."' })).includes('invented-metric'))
})

test('the builder gets the findings as one problem and one fix', () => {
  const { problem, fix } = forBuilder(lintSection('<h2 class="bg-clip-text text-transparent">x</h2>'))
  assert.match(problem, /^\[P0\] Gradient text/)
  assert.match(fix, /one theme colour/)
})

test("the Studio's own CSS has no blue, purple or green", () => {
  const dir = new URL('../web/', import.meta.url)
  const found = readdirSync(dir).filter(f => f.endsWith('.css')).flatMap(f => chromeFindings(readFileSync(new URL(f, dir), 'utf8'), `web/${f}`))
  assert.deepEqual(found.map(f => f.message), [])
  assert.equal(chromeFindings('.x{color:#2563eb}').length, 1)
  assert.equal(chromeFindings('.x{color:#16a34a;background:rgb(147, 51, 234)}').length, 2)
  assert.equal(chromeFindings('.x{color:#71717a;background:#f59e0b}').length, 0)
})

// How long a lint takes is not asked of the clock: on a busy machine the same work took 1.7 s against a 50 ms
// limit (the owner's MacBook Air, 2026-11-14). What is asked is how the work grows: four times the section,
// about four times the CPU time of this process (process.cpuUsage, the least of three samples, so a pause for
// someone else's work is not counted). One rule used to read the rest of the document from every heading, so
// four times the section cost sixteen times the time (measured: 800 cards 390 ms, 3,200 cards 5,837 ms; now
// 3 ms and 12 ms). The line between the two is drawn at eight.
const cards = n => `<section class="py-24">${Array.from({ length: n }, (_, i) => `<div class="rounded-[var(--radius)] p-4 bg-[var(--card)]"><h3 style="font-family:var(--font-heading)">Item ${i}</h3><p class="text-[var(--muted-foreground)]">Leaves at ${i % 12 + 6}:00.</p></div>`).join('')}</section>`
// A sample is many lints in a row, about a tenth of a second of work: Windows counts a process's CPU time in
// steps of 15.6 ms, and one lint of 3 ms read as 0.
const cpuMs = fn => { const from = process.cpuUsage(); fn(); const used = process.cpuUsage(from); return (used.user + used.system) / 1000 }
const perLint = (html, times) => Math.min(...[0, 1, 2].map(() => cpuMs(() => { for (let i = 0; i < times; i++) lintSection(html) }))) / times
test('four times the section takes about four times the work to lint, not sixteen', () => {
  const small = cards(800), big = cards(3200)
  lintSection(small); lintSection(big)
  const a = perLint(small, 40), b = perLint(big, 10)
  assert.ok(a > 0 && b / a < 8, `800 cards ${a.toFixed(2)} ms of CPU a lint, 3,200 cards ${b.toFixed(2)} ms: ${(b / a).toFixed(1)} times, where in step with the size is 4 and with its square 16`)
})

// the display-face rule reads the document once (engine/lint/artifact.mjs displaySans); upstream's one
// expression is kept here to say the two agree, on the cases the rule is for and on shuffled pieces of them
test('the display-face rule finds what upstream\'s expression finds, and the same words', () => {
  const upstream = /(?:h1|h2|h3|\.h-?(?:hero|xl|lg|md))[^{}]*\{[^}]*font-family\s*:\s*["']?(?:Inter|Roboto|Arial|-apple-system|system-ui|SF\s+Pro)/i
  const clip = s => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > 200 ? t.slice(0, 197) + '…' : t }
  const same = html => {
    const want = upstream.exec(html), got = lintArtifact(html).find(f => f.id === 'sans-display')
    assert.equal(got ? got.snippet : null, want ? clip(want[0]) : null, html.slice(0, 300))
  }
  for (const html of [
    '<style>h1{font-family:Inter,sans-serif}</style>',
    '<style>h1, h2 , .h-hero { color: red; font-family: "Roboto" }</style>',
    '<style>.hxl{font-family:system-ui}</style><h1>x</h1>',
    '<style>h1{font-family:Georgia} p{font-family:Inter}</style>',
    '<style>p{font-family:Inter} h2{color:red}</style><h2>a</h2>{font-family:Arial}',
    '<h3>Title</h3><style>.x{font-family:Inter}</style>',
    '<style>h3{font-family:Georgia;} h3 b{font-family: SF  Pro}</style>',
    '<h1>only words</h1>', 'h1 { font-family: Inter', '}h2{font-family:arial}', ''
  ]) same(html)
  // a few thousand documents put together from the pieces that matter, in an order a seed fixes
  let seed = 0x5eed
  const rnd = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n }
  const bits = ['h1', 'h2', 'H3', '.h-hero', '.hxl', '.h-md', 'p', ' ', ',', '{', '}', '{', '}', 'font-family:', 'font-family : "', 'Inter', 'Georgia', 'system-ui', 'SF  Pro', 'color:red;', '<b>', '\n']
  for (let i = 0; i < 4000; i++) same(Array.from({ length: 1 + rnd(14) }, () => bits[rnd(bits.length)]).join(''))
})
