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

test('a document reaches the brief with what was read in it, or why it could not be (#543)', () => {
  const s = store()
  const pdf = s.addFile('p1', { name: 'cedar-brief.pdf', use: 'the menu' }, Buffer.from('%PDF-1.4'))
  assert.match(s.brief('p1'), /Documents the owner gave[\s\S]*- cedar-brief\.pdf \(for the menu\): not read yet/)
  s.setFound('p1', pdf.id, { state: 'ready', what: 'Cedar Cafe brand brief', who: 'locals', pages: ['Home', 'Menu'], words: 'A small cafe by the river. Open 7am to 4pm.' })
  const b = s.brief('p1')
  assert.match(b, /cedar-brief\.pdf \(for the menu\): what: Cedar Cafe brand brief; for: locals; pages: Home, Menu\. It says: A small cafe by the river\. Open 7am to 4pm\./)
  assert.match(b, /never copy their layout/)
  const scan = s.addFile('p1', { name: 'scan.pdf' }, Buffer.from('%PDF-1.4'))
  s.setFound('p1', scan.id, { state: 'failed', note: 'the PDF has no text in it (a scan?)' })
  assert.match(s.brief('p1'), /- scan\.pdf: could not be read \(the PDF has no text in it \(a scan\?\)\)/)
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

test('each reference says what the crew takes from it, exactly as the brief does (issue #543)', () => {
  const s = store()
  const pic = s.addFile('p1', { name: 'mood.png' }, png(4, 4))
  const clip = s.addFile('p1', { name: 'walk.mp4' }, Buffer.from('x'))
  const doc = s.addFile('p1', { name: 'brief.pdf' }, Buffer.from('%PDF'))
  const plain = s.addLink('p1', { url: 'https://plain.example.com' })
  const looked = s.addLink('p1', { url: 'https://look.example.com' })
  s.setLook('p1', looked.id, { state: 'ready', from: { host: 'look.example.com' }, words: { prompt: 'calm and airy', layout: 'one wide column', motion: '' }, tokens: { bg: '#fff', text: '#111', palette: ['#fff', '#111'], fonts: { display: { name: 'Fraunces', kind: 'serif' } }, radius: '' } })
  let t = s.taken('p1')
  assert.deepEqual(t[pic.id].what, ['its look'])
  assert.deepEqual(t[clip.id].what, [], 'a clip reaches no one')
  assert.match(t[clip.id].not, /clips or sounds/)
  assert.deepEqual(t[doc.id], { what: [], not: 'Not read yet.' })
  assert.deepEqual(t[plain.id].what, ['the address'])
  assert.deepEqual(t[looked.id].what, ['style', 'colours', 'type', 'layout'], 'only the parts the look has')
  assert.match(t[looked.id].not, /Never its words/)
  assert.match(s.brief('p1'), /- Layout: one wide column/, 'the layout it says it takes is in the brief')
  s.setFound('p1', doc.id, { state: 'ready', what: 'a menu', who: 'locals', pages: ['Home', 'Menu'], words: 'Soup' })
  assert.deepEqual(s.taken('p1')[doc.id].what, ['words', 'pages', 'who it is for'])
  s.setFound('p1', doc.id, { state: 'failed', note: 'scanned pages' })
  assert.equal(s.taken('p1')[doc.id].not, 'Could not read it (scanned pages).')
  // past the brief's limit: the card says so
  for (let i = 0; i < 12; i++) s.addFile('p1', { name: `more${i}.png` }, png(1, 1))
  const last = s.list('p1').at(-1)
  assert.match(s.taken('p1')[last.id].not, /Only the first 12/)
  assert.ok(!s.brief('p1').includes(last.name))
  // the screens' list carries it
  assert.deepEqual(s.shown('p1').find(r => r.id === pic.id).taken, t[pic.id])
})

test('a reference\'s note can be saved and cleared without telling the crew', async () => {
  const s = store()
  const route = refRoutes({ refs: s, head: () => null, comment: async () => {} })
  const srv = http.createServer((req, res) => { if (!route(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const u = `http://127.0.0.1:${srv.address().port}`
  try {
    const { ref } = await fetch(`${u}/api/projects/p1/refs?name=mood.png`, { method: 'POST', body: png(2, 2) }).then(r => r.json())
    let j = await fetch(`${u}/api/projects/p1/refs/${ref.id}/use`, { method: 'POST', body: JSON.stringify({ use: 'the soft light' }) }).then(r => r.json())
    assert.equal(j.ref.use, 'the soft light'); assert.equal(j.sent, false)
    assert.ok(j.refs[0].taken, 'the list it answers says what is taken')
    j = await fetch(`${u}/api/projects/p1/refs/${ref.id}/use`, { method: 'POST', body: JSON.stringify({ use: '' }) }).then(r => r.json())
    assert.equal(j.ref.use, '')
    assert.equal((await fetch(`${u}/api/projects/p1/refs/${ref.id}/use`, { method: 'POST', body: JSON.stringify({ use: '', send: true }) })).status, 400, 'sending needs a part')
  } finally { srv.close() }
})
