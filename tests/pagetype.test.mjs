// node --test tests/pagetype.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PAGE_TYPES, pickPageType, recentLooks, lookBrief, pickLook, isDark, hueName } from '../engine/pagetype.mjs'
import { workerMessages, pagePlannerMessages } from '../engine/prompts.mjs'

test('a brief gets the page type that fits it', () => {
  assert.equal(pickPageType('a pixel platformer about a mole mail carrier', [], () => 0), 'arcade')
  assert.equal(pickPageType('flight search to compare fares', [], () => 0), 'tool')
})

test('the last three types are skipped', () => {
  for (let i = 0; i < 50; i++) {
    const k = pickPageType('a ramen counter in Osaka', ['editorial', 'shop', 'poster'])
    assert.ok(!['editorial', 'shop', 'poster'].includes(k), k)
    assert.ok(PAGE_TYPES[k])
  }
})

test('colours: dark and hue names', () => {
  assert.equal(isDark('#0b0b0c'), true)
  assert.equal(isDark('#f6efe3'), false)
  assert.equal(hueName('#e8742c'), 'orange or amber')
  assert.equal(hueName('#1f6feb'), 'blue')
})

test('recent runs are read newest first, and steer the palette', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pt-'))
  const run = (id, type, bg, primary) => {
    mkdirSync(join(dir, id))
    writeFileSync(join(dir, id, 'events.jsonl'), [
      { type: 'pagetype', key: type },
      { type: 'theme', vars: { '--background': bg, '--primary': primary } }
    ].map(e => JSON.stringify(e)).join('\n'))
  }
  run('2026-11-01T00', 'shop', '#f5f0e6', '#2266dd')
  run('2026-11-02T00', 'poster', '#101010', '#ff8a00')
  run('2026-11-03T00', 'zine', '#0d1b1e', '#f0a020')
  const looks = recentLooks(dir)
  assert.deepEqual(looks.map(l => l.type), ['zine', 'poster', 'shop'])
  const look = pickLook(looks, () => 0)
  assert.notEqual(look.ground, 'dark')
  assert.ok(!['orange or amber', 'blue'].includes(look.hue))
  const text = lookBrief('index', looks, look)
  assert.match(text, /Required for this build's theme/)
  assert.match(text, /Page type: Index/)
})

test('builders and page planners get the page type', () => {
  const plan = { pageType: 'zine', pages: [{ id: 'home', title: 'Home', purpose: 'x', layers: [] }], shared: [{ id: 'nav', content: 'n' }] }
  const w = workerMessages({ theme: { name: 't', direction: 'd' }, plan, page: plan.pages[0], layer: { id: 'home-cover', role: 'cover', page: 'home', content: 'c' } })
  assert.match(w[0].content, /Page type: Zine/)
  const p = pagePlannerMessages({ brief: 'b', theme: {}, plan, page: plan.pages[0] })
  assert.match(p[1].content, /Sections, in order: cover, cut-and-paste/)
  assert.match(p[0].content, /two-beat fragment/)
})

test('a fragment cut short is closed, and prose around it is dropped', async () => {
  const { tidyFragment } = await import('../engine/tidy.mjs')
  assert.equal(tidyFragment("I'll start with the shell.\n<section><div><p>hi</p>"), '<section><div><p>hi</p></div></section>')
  assert.equal(tidyFragment('<section><div class="a">x</div></section>\nDone.'), '<section><div class="a">x</div></section>')
  assert.equal(tidyFragment('<section><div><img src="a"><svg><path d="M0"/></svg><span class="tex'), '<section><div><img src="a"><svg><path d="M0"/></svg></div></section>')
  assert.equal(tidyFragment('<!-- say: hi --><nav><a href="#">x</a></nav>'), '<!-- say: hi --><nav><a href="#">x</a></nav>')
})

test('cream counts as cream, and the next build is given another ground and main colour', async () => {
  const { groundOf, pickLook, fitTheme } = await import('../engine/pagetype.mjs')
  for (const c of ['#F4F1EA', '#F7F4ED', '#F6F2EA', '#FBF4E4', '#faf7f2']) assert.equal(groundOf(c), 'cream', c)
  assert.equal(groundOf('#ffffff'), 'white')
  assert.equal(groundOf('#F7F8F9'), 'white')
  assert.equal(groundOf('#0D0B0A'), 'dark')
  const recent = [{ background: '#F4F1EA', primary: '#E8442A' }, { background: '#F6F2EA', primary: '#8C6B3F' }]
  for (let i = 0; i < 40; i++) {
    const look = pickLook(recent)
    assert.ok(['dark', 'white', 'colour'].includes(look.ground))
    assert.ok(!['red', 'orange or amber'].includes(look.hue), look.hue)
  }
  assert.match(lookBrief('poster', recent, { ground: 'dark', hue: 'blue' }), /Required for this build's theme: --background is a dark/)
  assert.deepEqual(pickLook(recent, Math.random, 'a black and gold jazz bar'), { ground: '', hue: '' })
  const t = fitTheme({ name: 'x', vars: { '--background': '#F4F1EA', '--primary': '#1f6feb', '--foreground': '#111' } }, { ground: 'dark' })
  assert.equal(groundOf(t.vars['--background']), 'dark')
  assert.equal(t.vars['--primary'], '#1f6feb')
  const same = { vars: { '--background': '#0b0b0c', '--primary': '#fff' } }
  assert.equal(fitTheme(same, { ground: 'dark' }), same)
  const col = fitTheme({ vars: { '--background': '#F4F1EA', '--primary': '#E8442A' } }, { ground: 'colour' })
  assert.equal(groundOf(col.vars['--background']), 'colour')
})

test('the zine type leads with pictures, not boxed cards with offset shadows', () => {
  const g = PAGE_TYPES.zine.grid
  assert.match(g, /pictures first/)
  assert.doesNotMatch(g, /shadow-\[/)
  assert.match(g, /never hard offset drop shadows/)
})
