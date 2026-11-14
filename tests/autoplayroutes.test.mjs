// The Autoplay routes (server/autoplay.mjs), with a stand-in for the player: no browser here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, get } from 'node:http'
import { autoplayRoutes } from '../server/autoplay.mjs'

// a player that waits to be told what to do, so a test decides when a picture or a decision comes
function fakePlayer() {
  const plays = []
  const aiPlay = (url, opts) => new Promise(done => {
    const p = { url, opts, end: report => done(report) }
    opts.signal.addEventListener('abort', () => done({ line: 'stopped' }))
    plays.push(p)
  })
  return { plays, load: async () => ({ aiPlay, jevDecider: ({ key }) => (key ? async () => ({ kind: 'advance' }) : null) }) }
}
async function studio({ urls = { r1: 'http://127.0.0.1:5999/' }, key = '', idle = 20000 } = {}) {
  const events = [], player = fakePlayer()
  const route = autoplayRoutes({ urlOf: async id => urls[id] || null, broadcast: e => events.push(e), key: () => key, idle, load: player.load })
  const srv = createServer((req, res) => { if (!route(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end('other') })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const call = async (path, body) => { const r = await fetch(base + path, body ? { method: 'POST', body: JSON.stringify(body) } : {}); return { status: r.status, body: await r.json().catch(() => null) } }
  return { route, events, player, base, call, close: () => { route.stopAll(); srv.closeAllConnections?.(); srv.close() } }
}
const tick = () => new Promise(r => setTimeout(r, 15))
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

test('nothing plays at rest; a start plays the running game and says each decision', async () => {
  const s = await studio()
  try {
    assert.deepEqual((await s.call('/api/runs/r1/autoplay')).body, { on: false, live: false, say: '', from: '', line: '', jev: false })
    const started = await s.call('/api/runs/r1/autoplay', { start: true })
    assert.equal(started.status, 200)
    assert.deepEqual([started.body.on, started.body.live, started.body.say], [true, false, 'starting'])
    await tick()
    assert.equal(s.player.plays.length, 1)
    assert.equal(s.player.plays[0].url, 'http://127.0.0.1:5999/')
    // no key: scripted moves only
    assert.equal(s.player.plays[0].opts.decide, null)
    // a second start is the same play
    await s.call('/api/runs/r1/autoplay', { start: true })
    await tick()
    assert.equal(s.player.plays.length, 1)
    s.player.plays[0].opts.onFrame(JPEG)
    s.player.plays[0].opts.onSay('going for the crow', 'scripted')
    assert.deepEqual(s.events.map(e => [e.type, e.run, e.on, e.live, e.say]), [['autoplay', 'r1', true, false, 'starting'], ['autoplay', 'r1', true, true, 'starting'], ['autoplay', 'r1', true, true, 'going for the crow']])
    assert.deepEqual((await s.call('/api/runs/r1/autoplay')).body, { on: true, live: true, say: 'going for the crow', from: 'scripted', line: '', jev: false })
    // stop: the player is told, and the last event has no line (the person stopped it)
    const stopped = await s.call('/api/runs/r1/autoplay', { stop: true })
    assert.equal(stopped.status, 200)
    await tick()
    assert.equal(s.player.plays[0].opts.signal.aborted, true)
    assert.deepEqual([s.events.at(-1).on, s.events.at(-1).live, s.events.at(-1).line], [false, false, ''])
    assert.equal((await s.call('/api/runs/r1/autoplay')).body.on, false)
  } finally { s.close() }
})

test('a game that is not running is refused, and other addresses are not these routes', async () => {
  const s = await studio()
  try {
    const r = await s.call('/api/runs/r9/autoplay', { start: true })
    assert.deepEqual([r.status, r.body.error], [400, 'the game is not running'])
    assert.equal(s.player.plays.length, 0)
    assert.equal(s.events.length, 0)
    assert.equal((await s.call('/api/runs/r1/autoplay/stream')).status, 404)
    assert.equal((await fetch(`${s.base}/api/runs/r1/app`)).status, 404)
    assert.equal(await (await fetch(`${s.base}/api/runs/r1/app`)).text(), 'other')
    assert.equal(await (await fetch(`${s.base}/api/runs/bad%20id/autoplay`)).text(), 'other')
    assert.equal((await fetch(`${s.base}/api/runs/r1/autoplay`, { method: 'DELETE' })).status, 405)
  } finally { s.close() }
})

test('one player at a time, and a play that ends by itself says what it did', async () => {
  const s = await studio({ urls: { r1: 'http://127.0.0.1:5999/', r2: 'http://127.0.0.1:5998/' }, key: 'k' })
  try {
    assert.equal((await s.call('/api/runs/r1/autoplay')).body.jev, true)
    await s.call('/api/runs/r1/autoplay', { start: true })
    await tick()
    // with a key, Jev decides
    assert.equal(typeof s.player.plays[0].opts.decide, 'function')
    await s.call('/api/runs/r2/autoplay', { start: true })
    await tick()
    assert.equal(s.player.plays[0].opts.signal.aborted, true)
    assert.equal(s.player.plays[1].opts.signal.aborted, false)
    assert.equal((await s.call('/api/runs/r1/autoplay')).body.on, false)
    s.player.plays[1].end({ line: 'AI player won the game in 12 s · scripted moves' })
    await tick()
    const last = s.events.at(-1)
    assert.deepEqual([last.run, last.on, last.line], ['r2', false, 'AI player won the game in 12 s · scripted moves'])
    assert.equal((await s.call('/api/runs/r2/autoplay')).body.line, 'AI player won the game in 12 s · scripted moves')
  } finally { s.close() }
})

test("the stream is the player's screen as MJPEG: the last picture at once, then each new one", async () => {
  const s = await studio()
  try {
    await s.call('/api/runs/r1/autoplay', { start: true })
    await tick()
    s.player.plays[0].opts.onFrame(JPEG)
    const chunks = []
    const res = await new Promise(ok => get(`${s.base}/api/runs/r1/autoplay/stream`, ok))
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'multipart/x-mixed-replace; boundary=autoplayframe')
    res.on('data', c => chunks.push(c))
    await tick()
    s.player.plays[0].opts.onFrame(Buffer.concat([JPEG, JPEG]))
    await tick()
    const ended = new Promise(r => res.on('end', r))
    await s.call('/api/runs/r1/autoplay', { stop: true })
    await ended
    const all = Buffer.concat(chunks).toString('latin1')
    assert.equal(all.split('--autoplayframe\r\ncontent-type: image/jpeg\r\n').length - 1, 2)
    assert.match(all, /content-length: 9\r\n\r\n\xff\xd8/)
    assert.match(all, /content-length: 18\r\n\r\n\xff\xd8/)
  } finally { s.close() }
})

test('a play nobody watches stops by itself; one with its stream open goes on', async () => {
  const s = await studio({ urls: { r1: 'http://127.0.0.1:5999/', r2: 'http://127.0.0.1:5998/' }, idle: 60 })
  try {
    await s.call('/api/runs/r1/autoplay', { start: true })
    await tick()
    const res = await new Promise(ok => get(`${s.base}/api/runs/r1/autoplay/stream`, ok))
    res.resume()
    await new Promise(r => setTimeout(r, 200))
    assert.equal(s.player.plays[0].opts.signal.aborted, false)
    // the room is closed: its stream goes, and the player with it
    res.destroy()
    await new Promise(r => setTimeout(r, 250))
    assert.equal(s.player.plays[0].opts.signal.aborted, true)
    assert.equal((await s.call('/api/runs/r1/autoplay')).body.on, false)
  } finally { s.close() }
})
