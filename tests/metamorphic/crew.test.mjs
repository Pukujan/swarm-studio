// The crew's metamorphic relations (decision 0019 point 3, issue #462) on recorded model output: each relation on
// each recorded brief (recorded/, made by record.mjs record). The nightly job checks the same on fresh output.
// A failure lists every break with the inputs that made it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintSection } from '../../engine/lint/index.mjs'
import { BRIEFS, relations } from './suite.mjs'
import { brandColourOnly, describe, keepsCopy, lintStable, reformat, renameKeepsOthers, sameSitemap, textNodes } from './relations.mjs'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'recorded')
const RECS = readdirSync(DIR).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(DIR, f), 'utf8')))

test('every brief has a recording', () => {
  assert.deepEqual(RECS.map(r => r.id).sort(), BRIEFS.map(b => b.id).sort())
})

for (const [name, relation] of Object.entries(relations))
  for (const rec of RECS)
    test(`${name}: holds on ${rec.id} (recorded ${rec.recorded}, ${rec.model})`, async () => {
      const breaks = await relation(rec)
      assert.equal(breaks.length, 0, describe(breaks))
    })

// Each relation catches what it is there for, and says which inputs did it
test('the relations name the inputs that broke them', async () => {
  const rec = RECS[0]
  const brand = BRIEFS.find(b => b.id === rec.id).brand
  const [s] = rec.sections
  // a section that writes the brand's colour itself
  const accent = brand.palettes[0].accent
  const events = [{ type: 'page', id: 'home', title: 'Home', index: 0 }, { type: 'layer:plan', page: 'home', id: 'home-hero', role: 'hero', content: 'Hi' }, { type: 'layer:done', page: 'home', layer: 'home-hero', html: `<section style="color:${accent}"><h1>Hi</h1></section>` }]
  const colour = await brandColourOnly({ name: 'leak', brand, accent: '#123456', events })
  assert.match(describe(colour), new RegExp(`brand-colour \\[build=leak from=${accent} to=#123456 section=home/home-hero\\]`))
  // a build-wide edit moves every page's version alike, so a rename still moves only its own page
  const loose = [{ type: 'page', id: 'a', title: 'A' }, { type: 'page', id: 'b', title: 'B' }, { type: 'edit', kind: 'var', name: '--x', value: '1' }]
  assert.deepEqual(renameKeepsOthers({ name: 't', events: loose, page: 'a', title: 'A2' }), [])
  // a wording that loses a page
  const lost = sameSitemap({ brief: 'b', named: [['home'], ['menu']], wordings: [{ id: 0, text: '{"type":"page","id":"home"}\n{"type":"page","id":"menu"}' }, { id: 1, text: '{"type":"page","id":"home"}' }] })
  assert.match(describe(lost), /sitemap \[brief=b wording=1 against=0 part=pages\]/)
  // a rework that rewrites the given headline
  const words = keepsCopy({ name: 'r', section: 'home-hero', content: 'Headline "Every wheel, every week."', before: '<h1>Every wheel, every week.</h1>', after: '<h1>Each wheel, each week.</h1>' })
  assert.match(describe(words), /rework \[build=r section=home-hero\]: "every wheel, every week\."/)
  // a rework that keeps it under other markup holds
  assert.deepEqual(keepsCopy({ name: 'r', section: 'x', content: 'Headline "Every wheel, every week."', before: '<h1>Every wheel, every week.</h1>', after: '<div class="pt-24"><h1 class="mt-8">Every <span>wheel</span>, every week.</h1></div>' }), [])
  assert.ok(s.html)
})

test('reformatting changes only whitespace between tags and attributes, and attribute order', () => {
  const html = '<section class="p-6 [&>*]:mt-2" data-x="a > b"><h2 id="t" class="text-xl">Two  words</h2>\n<p>One <b>bold</b> line</p><pre>  kept\n  as is</pre><img src="a.png" alt="A"/></section>'
  const seen = new Set()
  for (let seed = 1; seed <= 20; seed++) {
    const out = reformat(html, seed)
    seen.add(out)
    assert.deepEqual(textNodes(out), textNodes(html), `seed ${seed}`)
    assert.ok(out.includes('<pre>  kept\n  as is</pre>'), `seed ${seed}`)
    assert.ok(out.includes('data-x="a > b"') && out.includes('class="p-6 [&>*]:mt-2"'), `seed ${seed}`)
  }
  assert.ok(seen.size > 10)
  assert.deepEqual(lintStable({ name: 'own', section: 'x', html }), [])
})

// The recorded sections trip few rules, so the linter relation also runs on a section that trips most of them
test('linter: holds on a section full of slop, with every rule it trips', () => {
  const slop = `<section class="bg-gradient-to-r from-indigo-500 to-purple-600 py-24" id="s">
  <style>.e { text-transform: uppercase }</style>
  <h2 class="bg-clip-text text-transparent text-5xl" data-x="1">🚀 Ship faster</h2>
  <span class="uppercase text-xs">New</span>
  <div class="backdrop-blur-md bg-white/10 rounded-xl border-l-4 border-[var(--primary)] p-6"><p class="text-gray-500 bg-blue-50 border-slate-200">Zero downtime moves, guaranteed. 10x faster.</p></div>
  <a class="bg-indigo-600 text-white px-4 py-2" href="#">Get started</a>
  <div class="${Array.from({ length: 7 }, (_, i) => `bg-[#12345${i}]`).join(' ')}"></div>
</section>`
  const found = lintSection(slop)
  assert.ok(found.length >= 8, found.map(f => f.id).join(' '))
  const seeds = Array.from({ length: 25 }, (_, i) => i + 1)
  assert.deepEqual(describe(lintStable({ name: 'slop', section: 'slop', html: slop, seeds })), '')
})
