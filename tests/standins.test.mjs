import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { standins, stem, words } from '../engine/standins.mjs'

const jpeg = new Uint8Array(30000).fill(7)
const imageRes = () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })

test('words drops filler and style words', () => {
  assert.deepEqual(words('A cinematic photo of a barista pouring latte art, warm light'), ['barista', 'pouring', 'latte', 'art'])
})

test('an earlier build picture is picked, never for its own build', async () => {
  const runs = mkdtempSync(join(tmpdir(), 'st-runs-'))
  mkdirSync(join(runs, 'r1'))
  writeFileSync(join(runs, 'r1', 'events.jsonl'), JSON.stringify({ type: 'image', src: '/img/r1/1.webp', gen: 'barista pouring latte in a bakery' }) + '\n')
  const st = standins({ dataDir: mkdtempSync(join(tmpdir(), 'st-')), runsDir: runs, libraryFile: '/nonexistent', fetchImpl: async () => { throw new Error('offline') } })
  assert.equal((await st.pick({ q: 'barista pouring latte', w: 1600, h: 900 })).url, '/img/r1/1.webp')
  assert.equal(await st.pick({ q: 'barista pouring latte', run: 'r1' }), null)
})

test('Pexels through the Octo proxy sends the working key and keeps credit', async () => {
  const seen = []
  const fetchImpl = async (url, opts = {}) => {
    seen.push({ url: String(url), auth: opts.headers?.authorization })
    if (String(url).includes('/api/vault/proxy/https://api.pexels.com/v1/search')) {
      return Response.json({ photos: [{ id: 1, width: 4000, height: 2600, alt: 'Barista pouring milk', photographer: 'Sam Lee', url: 'https://www.pexels.com/photo/1/', src: { large2x: 'https://images.pexels.com/1.jpeg' } }] })
    }
    if (String(url) === 'https://images.pexels.com/1.jpeg') return imageRes()
    throw new Error(`unexpected ${url}`)
  }
  const st = standins({ dataDir: mkdtempSync(join(tmpdir(), 'st-')), runsDir: '/nonexistent', libraryFile: '/nonexistent', pexels: { key: 'lease-key', proxy: 'https://octo.example/api/vault/proxy' }, fetchImpl })
  const r = await st.pick({ q: 'barista pouring latte', w: 1600, h: 900 })
  assert.equal(r.source, 'pexels')
  assert.match(r.url, /^\/standin\/[0-9a-f]{16}\.jpg$/)
  assert.equal(r.credit, 'Barista pouring milk by Sam Lee (Pexels)')
  assert.equal(seen[0].auth, 'Bearer lease-key')
  assert.match(seen[0].url, /orientation=landscape/)
  assert.ok(st.file(r.url.split('/').pop()))
  assert.equal(st.file('../index.json'), null)
})

test('the shipped library matches on structured tags, with stemming, before any search', async () => {
  const lib = join(mkdtempSync(join(tmpdir(), 'st-lib-')), 'library.json')
  writeFileSync(lib, JSON.stringify({ photos: [
    { id: 'px1', url: 'https://cdn.example/1', aspect: 'wide', quality: 4, caption: 'A baker shapes dough at a floury bench', place: 'bakery kitchen', subjects: ['baker', 'dough'], businesses: ['bakery'], tags: ['bread', 'baking', 'flour'], credit: 'c1 (Pexels)' },
    { id: 'px2', url: 'https://cdn.example/2', aspect: 'wide', quality: 5, caption: 'Cyclists ride through a city street', place: 'city street', subjects: ['cyclist'], businesses: ['bike shop'], tags: ['bicycle', 'city', 'commute'], credit: 'c2 (Pexels)' }
  ] }))
  const st = standins({ dataDir: mkdtempSync(join(tmpdir(), 'st-')), runsDir: '/nonexistent', libraryFile: lib, fetchImpl: async () => { throw new Error('no search expected') } })
  assert.equal(stem('bakeries'), 'bakery')
  const r = await st.pick({ q: 'Bakers kneading dough in a small bakery', w: 1600, h: 900 })
  assert.equal(r.url, 'https://cdn.example/1')
  assert.equal(r.source, 'library')
  assert.equal((await st.pick({ q: 'cyclists commuting across the city', w: 1600, h: 900 })).url, 'https://cdn.example/2')
})

test('an index saved with keys as {} still ranks after a restart', async () => {
  const data = mkdtempSync(join(tmpdir(), 'st-'))
  mkdirSync(join(data, 'standins'))
  writeFileSync(join(data, 'standins', 'index.json'), JSON.stringify([{ id: 'a', src: 'pexels', url: '/standin/a.jpg', q: ['boathouse canal'], tags: ['boathouse', 'canal', 'harbour'], quality: 4, keys: {} }]))
  const st = standins({ dataDir: data, runsDir: '/nonexistent', libraryFile: '/nonexistent', fetchImpl: async () => { throw new Error('offline') } })
  assert.equal((await st.pick({ q: 'timber boathouse on a canal harbour' })).url, '/standin/a.jpg')
})
