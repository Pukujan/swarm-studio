// Saved page snapshots (server/snaps.mjs, spec 36): a page's content version, and its pictures kept
// per version, one of each size, as the Overview and the cover read them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pageVersions, snapStore } from '../server/snaps.mjs'

const run = 'r1'
const base = [
  { type: 'run:start', run, t: 1 },
  { type: 'theme', run, t: 2, vars: { '--background': '#111' } },
  { type: 'page', run, t: 3, id: 'home', title: 'Home' },
  { type: 'page', run, t: 4, id: 'menu', title: 'Menu' },
  { type: 'layer:done', run, t: 5, page: 'home', layer: 'hero', html: '<h1>Hi</h1>' },
  { type: 'layer:done', run, t: 6, page: 'menu', layer: 'list', html: '<ul></ul>' }
]
const store = t => {
  const dir = mkdtempSync(join(tmpdir(), 'snaps-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, run))
  return { dir, s: snapStore(dir) }
}
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

test('a section of one page changes that page only; the theme or a shared section changes all', () => {
  const v0 = pageVersions(base)
  assert.deepEqual([...v0.keys()], ['home', 'menu'])
  assert.match(v0.get('home'), /^[a-f0-9]{12}$/)
  const one = pageVersions([...base, { type: 'layer:done', run, t: 7, page: 'home', layer: 'hero', html: '<h1>Hello</h1>' }])
  assert.notEqual(one.get('home'), v0.get('home'))
  assert.equal(one.get('menu'), v0.get('menu'))
  for (const e of [{ type: 'theme', run, t: 7, vars: {} }, { type: 'layer:done', run, t: 7, page: '*', layer: 'nav', html: '<nav></nav>' }]) {
    const all = pageVersions([...base, e])
    assert.notEqual(all.get('home'), v0.get('home'))
    assert.notEqual(all.get('menu'), v0.get('menu'))
  }
})

test('streamed text and the crew moving are not changes', () => {
  const v0 = pageVersions(base)
  const v1 = pageVersions([...base, { type: 'layer:delta', run, t: 7, page: 'home', layer: 'hero', text: '<p>' }, { type: 'agent:assign', run, t: 8, page: 'home', layer: 'hero' }, { type: 'review:start', run, t: 9, page: 'home' }])
  assert.deepEqual([...v1], [...v0])
})

test('a page is saved per version, read back, and its older pictures go', t => {
  const { dir, s } = store(t)
  const v = pageVersions(base)
  assert.deepEqual(s.list(run, base).pages.home, { v: v.get('home') })
  assert.equal(s.save(run, base, { page: 'home', v: v.get('home'), size: 's', jpeg }), 'ok')
  assert.equal(s.save(run, base, { page: 'home', v: v.get('home'), size: 'f', jpeg }), 'ok')
  const list = s.list(run, base)
  assert.equal(list.first, 'home')
  assert.equal(list.pages.home.s, `/snaps/${run}/home.${v.get('home')}.s.jpg`)
  assert.equal(list.pages.home.f, `/snaps/${run}/home.${v.get('home')}.f.jpg`)
  assert.deepEqual(list.pages.menu, { v: v.get('menu') })
  assert.equal(s.cover(run), list.pages.home.f)
  // the page changes: its saved pictures are of an older version, so none are offered
  const next = [...base, { type: 'layer:done', run, t: 7, page: 'home', layer: 'hero', html: '<h1>Hello</h1>' }]
  const v2 = pageVersions(next).get('home')
  assert.deepEqual(s.list(run, next).pages.home, { v: v2 })
  // a picture of the old version is refused; the new one replaces the old files
  assert.equal(s.save(run, next, { page: 'home', v: v.get('home'), size: 's', jpeg }), 'stale')
  assert.equal(s.save(run, next, { page: 'home', v: v2, size: 's', jpeg }), 'ok')
  assert.deepEqual(readdirSync(join(dir, run, 'snaps')).sort(), ['home.' + v2 + '.s.jpg', 'index.json'])
  assert.equal(s.cover(run), `/snaps/${run}/home.${v2}.s.jpg`)
})

test('bad pages, sizes, versions and file names are refused', t => {
  const { s } = store(t)
  const v = pageVersions(base).get('home')
  assert.equal(s.save(run, base, { page: '../x', v, size: 's', jpeg }), 'bad')
  assert.equal(s.save(run, base, { page: 'home', v, size: 'x', jpeg }), 'bad')
  assert.equal(s.save(run, base, { page: 'home', v: 'zz', size: 's', jpeg }), 'bad')
  assert.equal(s.save(run, base, { page: 'nope', v, size: 's', jpeg }), 'stale')
  assert.equal(s.file(run, '../index.json'), null)
  assert.equal(s.file(run, 'index.json'), null)
  assert.ok(s.file(run, `home.${v}.s.jpg`))
  assert.equal(s.cover('none'), null)
})
