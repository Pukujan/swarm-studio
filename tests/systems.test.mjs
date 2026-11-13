// Open Design's full design systems (decision 0016 point 1, issue #447): every system is imported at the pinned
// commit with its tokens, rules and components; a look from one puts its tokens on the page and in the builders'
// prompt, and the linter flags a section that uses none of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMMIT, tokensOf, rulesOf } from '../scripts/import-od-systems.mjs'
import { OD_PACKS, applyPack, systemOf } from '../engine/brandpacks.mjs'
import { brandTheme } from '../engine/brand.mjs'
import { workerMessages, systemLine } from '../engine/prompts.mjs'
import { lintSection } from '../engine/lint/index.mjs'

const json = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
const systems = json('engine/opendesign/systems.json')

test('every Open Design system is imported, at the commit the NOTICE names', () => {
  assert.ok(OD_PACKS.length >= 151, `${OD_PACKS.length} packs`)
  assert.equal(Object.keys(systems.systems).length, OD_PACKS.length)
  assert.equal(systems.source.commit, COMMIT)
  assert.equal(json('engine/opendesign/packs.json').source.commit, COMMIT)
  assert.ok(readFileSync(new URL('../engine/opendesign/NOTICE', import.meta.url), 'utf8').includes(COMMIT))
  // the brand-named ones too (the owner: "I want these")
  for (const slug of ['od-airbnb', 'od-notion', 'od-stripe']) assert.ok(systemOf(slug), slug)
})

test('a system keeps its tokens, never a colour, a font or a name Swarm already sets', () => {
  for (const [slug, s] of Object.entries(systems.systems)) {
    assert.ok(Object.keys(s.tokens).length, `${slug}: no tokens`)
    for (const [k, v] of Object.entries(s.tokens)) {
      assert.ok(!/^--(background|foreground|primary|muted|border|accent|card|link|radius|font-)/.test(k) || k.startsWith('--radius-'), `${slug}: ${k}`)
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b|rgba?\(|oklch\(|color-mix\(/i, `${slug}: ${k} is a colour`)
    }
  }
  assert.deepEqual(tokensOf(':root {\n  --space-4: 16px; /* a note */\n  --bg: #fff;\n  --accent: #f00;\n  --font-body: Inter;\n  --shadow: 0 1px 2px rgba(0,0,0,.1);\n}'), { '--space-4': '16px' })
})

test("a system's rules are its theme line and its first do's and don'ts, or its anti-patterns", () => {
  const md = "# X\n\n## 1. Visual Theme & Atmosphere\n\nCalm and **clear**.\n\n## 7. Do's and Don'ts\n\n### Do\n- Use space.\n\n### Don't\n- Don't shout.\n"
  assert.deepEqual(rulesOf(md), { theme: 'Calm and clear.', do: ['Use space.'], dont: ["Don't shout."] })
  assert.deepEqual(rulesOf('## 1. Visual Theme\n\nPlain.\n\n## 9. Anti-patterns\n\n- No glow.\n').dont, ['No glow.'])
  assert.ok(Object.values(systems.systems).filter(s => s.rules.do.length || s.rules.dont.length).length >= 120)
})

test("a look from Open Design puts its tokens on the page and in the builders' prompt; Swarm's own looks do not", () => {
  const brand = { palettes: [], types: [], pick: {}, brief: 'a holiday flat', story: {} }
  applyPack(brand, 'od-airbnb')
  const theme = brandTheme(brand)
  assert.equal(theme.system.slug, 'od-airbnb')
  assert.equal(theme.vars['--space-4'], systemOf('od-airbnb').tokens['--space-4'])
  // the brand sheet's colours win: the tokens carry none
  assert.equal(theme.vars['--primary'], brand.palettes[0].accent)
  const page = { id: 'home', title: 'Home', layers: [{ id: 'hero', role: 'hero' }] }
  const system = workerMessages({ theme, plan: { pages: [page] }, page, layer: { ...page.layers[0], page: 'home', content: '' } })[0].content
  assert.ok(system.includes(systemLine(theme)) && system.includes('--space-4: '), 'the token block')
  assert.equal(systemLine({ vars: {} }), '')
})

test('the linter flags a section that uses none of the tokens', () => {
  const tokens = ['--space-4', '--radius-md']
  assert.ok(lintSection('<section class="p-6">x</section>', { tokens }).some(f => f.id === 'tokens-unused'))
  assert.ok(!lintSection('<section class="p-[var(--space-4)]">x</section>', { tokens }).some(f => f.id === 'tokens-unused'))
  assert.ok(!lintSection('<section class="p-6">x</section>').some(f => f.id === 'tokens-unused'))
})
