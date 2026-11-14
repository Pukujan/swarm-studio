import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import { refStore, imageSize } from '../engine/refs.mjs'
import { refRoutes } from '../server/refs.mjs'

const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
const store = () => {
  const projectsDir = mkdtempSync(join(tmpdir(), 'refs-'))
  mkdirSync(join(projectsDir, 'p1'))
  return refStore({ projectsDir, known: pid => pid === 'p1', uploadsOf: () => [{ name: 'logo.png', src: '/up/p1/logo.png', t: 1 }] })
}

test('imageSize reads PNG and GIF headers', () => {
  assert.deepEqual(imageSize(png(640, 480)), { w: 640, h: 480 })
  const g = Buffer.alloc(24); g.write('GIF89a'); g.writeUInt16LE(30, 6); g.writeUInt16LE(20, 8)
  assert.deepEqual(imageSize(g), { w: 30, h: 20 })
  assert.equal(imageSize(Buffer.from('nope')), null)
})

test('a file and a link go in; remove hides one and restore brings it back', () => {
  const s = store()
  const a = s.addFile('p1', { name: 'mood.png', use: 'hero mood' }, png(800, 600))
  assert.equal(a.kind, 'image'); assert.equal(a.w, 800); assert.equal(a.src, '/ref/p1/mood.png'); assert.equal(a.source, 'upload')
  const b = s.addFile('p1', { name: 'mood.png' }, png(10, 10))
  assert.equal(b.name, 'mood (2).png')
  const l = s.addLink('p1', { url: 'https://www.example.com/look' })
  assert.equal(l.kind, 'link'); assert.equal(l.name, 'example.com'); assert.equal(l.source, 'link')
  assert.equal(s.list('p1').length, 3)
  s.remove('p1', a.id)
  assert.equal(s.list('p1').length, 2)
  assert.equal(s.file('p1', 'mood.png'), null, 'a removed file is not served')
  s.restore('p1', a.id)
  assert.ok(s.file('p1', 'mood.png').file.endsWith('mood.png'))
  assert.equal(s.setUse('p1', l.id, 'the menu').use, 'the menu')
  assert.equal(s.all('p1')[0].source, 'upload', 'uploads are listed with the store')
  assert.equal(s.all('p1').length, 4)
})

test('bad input is refused', () => {
  const s = store()
  assert.throws(() => s.addFile('p1', { name: 'x.exe' }, Buffer.from('x')), /picture/)
  assert.throws(() => s.addLink('p1', { url: 'javascript:alert(1)' }), /not a link/)
  assert.throws(() => s.addFile('nope', { name: 'a.png' }, png(1, 1)), /no such project/)
  assert.throws(() => s.remove('p1', 'r0000'), /no such reference/)
  assert.equal(s.file('p1', '../index.json'), null)
})

test('the brief and the use line name the references', () => {
  const s = store()
  const a = s.addFile('p1', { name: 'shop.jpg', use: 'the hero' }, Buffer.from([0xff, 0xd8, 0xff]))
  s.addLink('p1', { url: 'https://example.com/a' })
  const b = s.brief('p1')
  assert.match(b, /shop\.jpg \(for the hero\): \/ref\/p1\/shop\.jpg/)
  assert.match(b, /https:\/\/example\.com\/a/)
  assert.match(s.useText(a, 'the menu'), /Use the reference picture "shop\.jpg".*for the menu/)
  assert.equal(store().brief('p1'), '')
})

test('the routes add, list, send a use to the crew, and serve the file', async () => {
  const s = store(), sent = []
  let head = null
  const route = refRoutes({ refs: s, head: () => head, comment: async (run, input) => { sent.push([run, input.text]) } })
  const srv = http.createServer((req, res) => { if (!route(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const u = `http://127.0.0.1:${srv.address().port}`
  try {
    let r = await fetch(`${u}/api/projects/p1/refs?name=look.png`, { method: 'POST', body: png(5, 6) }).then(r => r.json())
    assert.equal(r.refs.length, 1)
    const id = r.ref.id
    const f = await fetch(`${u}${r.ref.src}`)
    assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png'); assert.equal(f.headers.get('content-security-policy'), 'sandbox')
    let res = await fetch(`${u}/api/projects/p1/refs/${id}/use`, { method: 'POST', body: JSON.stringify({ use: 'the hero', send: true }) })
    assert.equal(res.status, 409, 'no build yet')
    head = 'run1'
    r = await fetch(`${u}/api/projects/p1/refs/${id}/use`, { method: 'POST', body: JSON.stringify({ use: 'the hero', send: true }) }).then(r => r.json())
    assert.equal(r.sent, true); assert.equal(r.ref.use, 'the hero')
    assert.equal(sent[0][0], 'run1'); assert.match(sent[0][1], /for the hero/)
    r = await fetch(`${u}/api/projects/p1/refs/link`, { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) }).then(r => r.json())
    assert.equal(r.refs.length, 2)
    r = await fetch(`${u}/api/projects/p1/refs/${id}/remove`, { method: 'POST' }).then(r => r.json())
    assert.equal(r.refs.length, 1)
    assert.equal((await fetch(`${u}/api/projects/p1/refs`).then(r => r.json())).refs.length, 1)
    assert.equal((await fetch(`${u}/api/projects/zz/refs/link`, { method: 'POST', body: '{"url":"https://a.b"}' })).status, 404)
  } finally { srv.close() }
})
