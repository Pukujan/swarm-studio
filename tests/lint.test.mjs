// The slop linter (engine/lint, decision 0016, issue #448): each rule fires on the look it names and not on a
// clean section, copy the planner gave is not flagged, the Studio's own CSS has no blue, purple or green,
// and even a long section is linted in milliseconds.
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

test('a big section is linted in a few milliseconds', () => {
  const big = `<section class="py-24">${Array.from({ length: 200 }, (_, i) => `<div class="rounded-[var(--radius)] p-4 bg-[var(--card)]"><h3 style="font-family:var(--font-heading)">Item ${i}</h3><p class="text-[var(--muted-foreground)]">Leaves at ${i % 12 + 6}:00.</p></div>`).join('')}</section>`
  lintSection(big)
  const t = performance.now()
  for (let i = 0; i < 20; i++) lintSection(big)
  assert.ok((performance.now() - t) / 20 < 50, `${((performance.now() - t) / 20).toFixed(1)} ms`)
})
