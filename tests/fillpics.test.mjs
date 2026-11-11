import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptySlots, fillPictures, framesToSlots } from '../engine/fillpics.mjs'

function app() {
  const dir = mkdtempSync(join(tmpdir(), 'fp-'))
  mkdirSync(join(dir, 'src', 'components'), { recursive: true })
  writeFileSync(join(dir, 'src', 'components', 'Grid.tsx'), `export default () => (<div>
  <img data-gen="timber boathouse on a canal" alt="Boathouse" className="w-full" />
  <img data-gen="villa facade behind a hedge" alt="Villa" src="" />
  <img data-gen="painted hero" src="/img/1.webp" alt="Hero" />
  <img data-gen={art.dataGen} alt="dynamic" />
  <img data-gen="grey placeholder slot" src="data:image/svg+xml;utf8,%3Csvg" alt="x" />
</div>)`)
  return dir
}

test('finds only the empty, static picture slots', () => {
  assert.deepEqual(emptySlots(app()).map(s => s.gen), ['timber boathouse on a canal', 'villa facade behind a hedge', 'grey placeholder slot'])
})

test('fills empty slots with different photos and keeps their credit', async () => {
  const dir = app()
  const asked = []
  const pick = async ({ q, avoid }) => {
    asked.push([...avoid])
    return { url: `https://cdn.example/${q.split(' ')[0]}.jpg`, credit: `${q} by Sam (Pexels)`, page: 'https://pexels.example/1', source: 'library' }
  }
  const r = await fillPictures(dir, { pick, bytesOf: async () => Buffer.alloc(100, 1) })
  assert.deepEqual(r, { filled: 3, left: 0 })
  const code = readFileSync(join(dir, 'src', 'components', 'Grid.tsx'), 'utf8')
  assert.match(code, /<img src="\/img\/stock\/[0-9a-f]{12}\.jpg" data-standin="stock" data-gen="timber/)
  assert.ok(code.includes('src="/img/1.webp"'))
  assert.ok(code.includes('data-gen={art.dataGen} alt="dynamic" />'))
  assert.ok(!code.includes('data:image/svg+xml'))
  assert.equal(asked[1].length, 1) // the second pick avoids the first photo
  const credits = readFileSync(join(dir, 'public', 'img', 'stock', 'CREDITS.md'), 'utf8')
  assert.match(credits, /villa facade behind a hedge by Sam \(Pexels\)/)
  assert.deepEqual(emptySlots(dir), [])
})

test('a slot with no match stays as it was', async () => {
  const dir = app()
  const r = await fillPictures(dir, { pick: async () => null, bytesOf: async () => null })
  assert.deepEqual(r, { filled: 0, left: 3 })
  assert.ok(!existsSync(join(dir, 'public', 'img', 'stock')))
})

test('an empty picture frame becomes a slot named by its section and card', () => {
  const out = framesToSlots(`<img data-gen="Charcoal study of a facade, warm paper" src="/img/1.webp" />
  <a><div className="overflow-hidden bg-muted aspect-[3/4]"></div><p>Plate II</p><p>Complete 2023</p></a>
  <div className="aspect-square p-4"><span>has content</span></div>`)
  assert.match(out, /<div className="overflow-hidden bg-muted aspect-\[3\/4\]"><img data-gen="Charcoal study of a facade, Plate II Complete 2023" alt="Plate II Complete 2023"/)
  assert.ok(out.includes('<div className="aspect-square p-4"><span>has content</span></div>'))
})

test('when every match is used, a slot repeats a photo instead of staying empty', async () => {
  const dir = app()
  const pick = async ({ avoid }) => (avoid?.size ? null : { url: 'https://cdn.example/one.jpg', credit: 'One by Sam (Pexels)' })
  assert.deepEqual(await fillPictures(dir, { pick, bytesOf: async () => Buffer.alloc(10, 1) }), { filled: 3, left: 0 })
})

test('an exported site gets stand-ins too: static pages with relative paths, and its React copy', async () => {
  const { fillSite } = await import('../engine/fillpics.mjs')
  const root = mkdtempSync(join(tmpdir(), 'fp-site-'))
  mkdirSync(join(root, 'html'), { recursive: true })
  mkdirSync(join(root, 'react', 'src', 'sections'), { recursive: true })
  writeFileSync(join(root, 'html', 'index.html'), `<section><img data-gen="arena at night, neon" alt="Arena" src="data:image/svg+xml;utf8,%3Csvg"><div class="rounded aspect-[3/4]"></div><h3>Boss one</h3><img data-gen="painted" src="img/1.webp" alt="p"></section>`)
  writeFileSync(join(root, 'react', 'src', 'sections', 'Hero.jsx'), `export default () => <img data-gen="arena at night, neon" alt="Arena" src="data:image/svg+xml;utf8,%3Csvg" />`)
  const pick = async ({ q }) => ({ url: `https://cdn.example/${encodeURIComponent(q)}.jpg`, credit: 'Sam (Pexels)', source: 'library' })
  const r = await fillSite(root, { pick, bytesOf: async () => Buffer.alloc(50, 1) })
  assert.equal(r.left, 0)
  assert.equal(r.filled, 3)
  const page = readFileSync(join(root, 'html', 'index.html'), 'utf8')
  assert.ok(!page.includes('data:image/svg+xml'))
  assert.match(page, /<img src="img\/stock\/[0-9a-f]{12}\.jpg" data-standin="stock" data-gen="arena/)
  // the empty frame became a slot, in HTML's own class= attribute
  assert.match(page, /<div class="rounded aspect-\[3\/4\]"><img src="img\/stock\/[0-9a-f]{12}\.jpg" data-standin="stock" data-gen="arena at night, Boss one"[^>]*class="w-full h-full object-cover"/)
  assert.ok(page.includes('src="img/1.webp"'))
  assert.ok(existsSync(join(root, 'html', 'img', 'stock', 'CREDITS.md')))
  assert.match(readFileSync(join(root, 'react', 'src', 'sections', 'Hero.jsx'), 'utf8'), /src="\/img\/stock\/[0-9a-f]{12}\.jpg"/)
  assert.ok(existsSync(join(root, 'react', 'public', 'img', 'stock')))
})
