import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { handChanges, keepHand } from '../engine/handedit.mjs'
import { loadPlaywright, launch } from '../engine/playtest.mjs'

const done = (extra) => ({ type: 'layer:done', page: 'home', layer: 'hero', html: '<p>x</p>', ...extra })

test('hand changes since the crew last wrote a section are kept on its rework', () => {
  const events = [
    done({ agent: 'a1' }),
    done({ by: 'c1', restored: true, fixed: true, why: 'hand: words' }),
    done({ agent: 'a2', fixed: true }),
    done({ by: 'c1', restored: true, fixed: true, why: 'hand: style' }),
    done({ by: 'c1', restored: true, fixed: true, why: 'code' }),
    done({ by: 'c1', restored: true, fixed: true, why: 'hand: picture' }),
    done({ by: 'c1', restored: true, fixed: true, why: 'hand: style' }),
    { type: 'layer:done', page: 'home', layer: 'menu', by: 'c1', restored: true, why: 'hand: remove' }
  ]
  assert.deepEqual(handChanges(events, 'home', 'hero'), ['style', 'picture'])
  assert.deepEqual(handChanges(events, 'home', 'menu'), ['remove'])
  assert.deepEqual(handChanges(events, 'about', 'hero'), [])
  assert.equal(keepHand('bigger title', []), 'bigger title')
  assert.match(keepHand('bigger title', ['style', 'picture']), /^bigger title\n\nThe person changed this section by hand \(style, picture\).*Keep them/s)
})

// the patch module runs in a browser (it parses HTML with the DOM); this test skips without one
test('manual edit patches change one part of a section and refuse unsafe ones', { timeout: 60000 }, async () => {
  const pw = await loadPlaywright()
  if (!pw) return
  let browser
  try { browser = await launch(pw.chromium) } catch { return }
  try {
    const page = await browser.newPage()
    const src = readFileSync(new URL('../web/edit/patches.js', import.meta.url), 'utf8').replace(/^export /gm, '')
    await page.setContent('<!doctype html><body></body>')
    await page.addScriptTag({ content: `${src}\nwindow.swEdit = swEdit` })
    const r = await page.evaluate(() => {
      const E = window.swEdit
      const html = '<section class="py-16"><h1 class="text-5xl">Rats <span>&amp;</span> Co</h1><p>Warm rooms.</p><a href="/book" class="btn">Book a visit</a><img src="/img/a.png" alt="A rat"></section>'
      const tree = E.tree(html)
      const h1 = E.read(html, 'path-0-0'), p = E.read(html, 'path-0-1'), a = E.read(html, 'path-0-2'), img = E.read(html, 'path-0-3'), root = E.read(html, 'path-0')
      const text = E.apply(html, { kind: 'set-text', id: 'path-0-1', value: 'Cosy rooms.' })
      const nested = E.apply(html, { kind: 'set-text', id: 'path-0-0', value: 'New' })
      const link = E.apply(html, { kind: 'set-link', id: 'path-0-2', text: 'Visit us', href: 'https://rats.example/book' })
      const evil = E.apply(html, { kind: 'set-link', id: 'path-0-2', text: 'x', href: 'javascript:alert(1)' })
      const pic = E.apply(html, { kind: 'set-image', id: 'path-0-3', src: '/ref/p1/shop.jpg', alt: 'The shop' })
      const style = E.apply(html, { kind: 'set-style', id: 'path-0-1', styles: { fontSize: '20px', color: '#7a2e1d', opacity: '' } })
      const badStyle = E.apply(html, { kind: 'set-style', id: 'path-0-1', styles: { color: 'red; position:fixed' } })
      const attr = E.apply(html, { kind: 'set-attributes', id: 'path-0-2', attributes: { 'aria-label': 'Book', class: '' } })
      const onclick = E.apply(html, { kind: 'set-attributes', id: 'path-0-2', attributes: { onclick: 'x()' } })
      const up = E.apply(html, { kind: 'move-element', id: 'path-0-1', dir: -1 })
      const top = E.apply(html, { kind: 'move-element', id: 'path-0-0', dir: -1 })
      const rm = E.apply(html, { kind: 'remove-element', id: 'path-0-1' })
      const rmRoot = E.apply(html, { kind: 'remove-element', id: 'path-0' })
      const gone = E.apply(html, { kind: 'set-text', id: 'path-0-9', value: 'x' })
      return { tree, h1, p, a, img, root, text, nested, link, evil, pic, style, badStyle, attr, onclick, up, top, rm, rmRoot, gone, pathId: E.pathId([0, 2]) }
    })
    assert.deepEqual(r.tree.map(x => [x.id, x.depth, x.kind]), [['path-0', 0, 'container'], ['path-0-0', 1, 'text'], ['path-0-0-0', 2, 'text'], ['path-0-1', 1, 'text'], ['path-0-2', 1, 'link'], ['path-0-3', 1, 'image']])
    assert.equal(r.h1.wordsEditable, false) // "Rats", "&", "Co" sit in nested markup: Code
    assert.equal(r.p.fields.text, 'Warm rooms.')
    assert.deepEqual(r.a.fields, { text: 'Book a visit', href: '/book' })
    assert.deepEqual(r.img.fields, { src: '/img/a.png', alt: 'A rat' })
    assert.equal(r.root.canRemove, false)
    assert.equal(r.pathId, 'path-0-2')
    assert.ok(r.text.ok); assert.match(r.text.html, /<p>Cosy rooms\.<\/p>/)
    assert.equal(r.nested.ok, false)
    assert.ok(r.link.ok); assert.match(r.link.html, /<a href="https:\/\/rats\.example\/book" class="btn">Visit us<\/a>/)
    assert.equal(r.evil.ok, false)
    assert.ok(r.pic.ok); assert.match(r.pic.html, /<img src="\/ref\/p1\/shop\.jpg" alt="The shop">/)
    assert.ok(r.style.ok); assert.match(r.style.html, /<p style="font-size: 20px; color: rgb\(122, 46, 29\);">Warm rooms\.<\/p>/)
    assert.equal(r.badStyle.ok, false)
    assert.ok(r.attr.ok); assert.match(r.attr.html, /<a href="\/book" aria-label="Book">Book a visit<\/a>/)
    assert.equal(r.onclick.ok, false)
    assert.ok(r.up.ok); assert.equal(r.up.id, 'path-0-0'); assert.match(r.up.html, /<section class="py-16"><p>Warm rooms\.<\/p><h1/)
    assert.equal(r.top.ok, false)
    assert.ok(r.rm.ok); assert.doesNotMatch(r.rm.html, /Warm rooms/)
    assert.equal(r.rmRoot.ok, false)
    assert.equal(r.gone.ok, false)
  } finally { await browser.close() }
})
