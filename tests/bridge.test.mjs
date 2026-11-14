// The server's side of the Hermes bridge (Nous catalog review, point 1): pictures and clips are asked of
// the Hermes process that attached last, with its token; nothing here runs Hermes's Python or holds a key.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hermesBridge, imageBody, videoBody } from '../engine/bridge.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const TOKEN = 'a-bridge-token-0123456789'
const answer = data => ({ status: 200, json: async () => data })

test('only a loopback bridge with a token can attach', () => {
  const h = hermesBridge()
  assert.equal(h.attach({ url: 'http://evil.example:80', token: TOKEN }).ok, false)
  assert.equal(h.attach({ url: 'http://127.0.0.1:5000/x', token: TOKEN }).ok, false)
  assert.equal(h.attach({ url: 'http://127.0.0.1:5000', token: 'short' }).ok, false)
  assert.equal(h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN, pid: 42 }).ok, true)
  assert.deepEqual(h.status(), { attached: true, pids: [42], codes: [null] })
  assert.doesNotMatch(JSON.stringify(h.status()), /token|5000/)
})

test('a call goes to the newest bridge with its token, and moves on when one has gone', async () => {
  const seen = []
  const fetcher = async (url, init) => {
    seen.push([url, init.headers.authorization])
    if (url.startsWith('http://127.0.0.1:6000')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    return answer({ ok: true, path: '/p.png' })
  }
  const h = hermesBridge({ fetcher })
  h.attach({ url: 'http://127.0.0.1:5000', token: 'older-token-0123456789', pid: 1 })
  h.attach({ url: 'http://127.0.0.1:6000', token: TOKEN, pid: 2 })
  assert.deepEqual(await h.call('/image', { prompt: 'x' }), { ok: true, path: '/p.png' })
  assert.deepEqual(seen, [['http://127.0.0.1:6000/image', `Bearer ${TOKEN}`], ['http://127.0.0.1:5000/image', 'Bearer older-token-0123456789']])
  assert.deepEqual(h.status().pids, [1], 'the bridge that refused is dropped')
})

// Hermes quit with a call in flight: fetch says "fetch failed", and why is its cause. Each of these is a
// connection that died, and the bridge behind it is not asked again (a Hermes that is there attaches again)
for (const code of ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'ECONNABORTED']) {
  test(`a bridge whose connection dies under a call (${code}) is dropped, and the call says Hermes is not open`, async () => {
    let calls = 0
    const h = hermesBridge({ fetcher: async () => { calls++; throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code }) }) } })
    h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN, pid: 1 })
    const r = await h.call('/media')
    assert.equal(r.absent, true)
    assert.equal(h.status().attached, false)
    await h.call('/media')
    assert.equal(calls, 1, 'not asked again')
    // the check before a build and a model call drop it the same way
    h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN, pid: 1 })
    await h.ping()
    assert.equal(h.status().attached, false)
    h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN, pid: 1 })
    assert.equal(await h.send('/v1/chat/completions', { method: 'POST' }), null)
    assert.equal(h.status().attached, false)
  })
}

test('a bridge that is only slow is kept: a timeout is not a dead connection', async () => {
  const h = hermesBridge({ fetcher: (url, init) => new Promise((_, no) => init.signal.addEventListener('abort', () => no(init.signal.reason))) })
  h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN, pid: 1 })
  const r = await h.call('/media', undefined, 30, { grace: 0 })
  assert.equal(r.ok, false)
  assert.ok(!r.absent)
  assert.equal(h.status().attached, true)
})

// How long a call may take is its timeout and, by default, 15 s more for the bridge's own timeout to answer
// first. The pictures question is answered from memory and gets none (server.mjs mediaOffer): it was the
// 25 s a build could wait before it started. Read from the time the call asks its signal for,
// so no clock is asked.
test('a call is given its timeout plus the grace, and with grace 0 the timeout alone', async () => {
  const real = AbortSignal.timeout
  const asked = []
  AbortSignal.timeout = ms => { asked.push(ms); return new AbortController().signal }
  try {
    const h = hermesBridge({ fetcher: async () => answer({ ok: true }) })
    h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN, pid: 1 })
    await h.call('/image', { prompt: 'x' }, 10000)
    await h.call('/media', undefined, 3000, { grace: 0 })
    assert.deepEqual(asked, [25000, 3000])
  } finally { AbortSignal.timeout = real }
})

test('a bridge silent for 45 s is dropped; with none, the call says Hermes is not open', async () => {
  let t = 0
  const h = hermesBridge({ fetcher: async () => answer({ ok: true }), now: () => t })
  h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN })
  t = 44000
  assert.equal(h.status().attached, true)
  t = 46000
  assert.equal(h.status().attached, false)
  const r = await h.call('/image', { prompt: 'x' })
  assert.equal(r.ok, false)
  assert.equal(r.absent, true)
  assert.match(r.error, /hermes swarm/)
})

test('a bridge that turns the token away is dropped', async () => {
  const h = hermesBridge({ fetcher: async () => ({ status: 403, json: async () => ({ ok: false }) }) })
  h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN })
  assert.equal((await h.call('/media')).absent, true)
  assert.equal(h.status().attached, false)
})

test('the old picture and clip command lines become bridge bodies; provider and model are Hermes\'s choice', () => {
  assert.deepEqual(imageBody(['--provider', 'openai-codex', '--model', 'gpt-image-2-low', '--aspect', 'portrait', '--ref', '/a.png', '--ref', '/b.png', '--edit', '--crop', '2:1', 'a fern']),
    { refs: ['/a.png', '/b.png'], edit: true, aspect: 'portrait', crop: '2:1', prompt: 'a fern' })
  assert.deepEqual(videoBody(['--provider', 'fal', '--image', '/s.png', '--seconds', '6', '--aspect', '9:16', '--out', '/o.mp4', 'push in']),
    { image: '/s.png', seconds: 6, aspect: '9:16', out: '/o.mp4', prompt: 'push in' })
})

test('the server paints through the bridge, never through a Python helper with Hermes\'s keys', () => {
  const server = readFileSync(`${root}server/server.mjs`, 'utf8')
  assert.match(server, /hermes\.call\('\/image'/)
  assert.match(server, /hermes\.call\('\/video'/)
  assert.doesNotMatch(server, /imagegen\.py|videogen\.py|FAL_KEY|mediaKeyStore\.env/)
  assert.match(server, /url\.pathname === '\/api\/hermes\/attach'/)
  const skins = readFileSync(`${root}engine/skins.mjs`, 'utf8')
  assert.doesNotMatch(skins, /imagegen\.py|SWARM_HERMES_PY/)
})

test('an answer the caller marks as "not this one" moves on to the next bridge', async () => {
  const fetcher = async url => answer(url.startsWith('http://127.0.0.1:6000') ? { ok: false, error: "MCP server 'supabase' is not connected" } : { ok: true, result: '[]' })
  const h = hermesBridge({ fetcher })
  h.attach({ url: 'http://127.0.0.1:5000', token: TOKEN })
  h.attach({ url: 'http://127.0.0.1:6000', token: TOKEN })
  const next = a => /not connected/.test(a.error || '')
  assert.deepEqual(await h.call('/mcp', {}, 1000, { next }), { ok: true, result: '[]' })
  assert.equal(h.status().attached, true, 'a bridge that passed stays attached')
  const only = hermesBridge({ fetcher })
  only.attach({ url: 'http://127.0.0.1:6000', token: TOKEN })
  assert.match((await only.call('/mcp', {}, 1000, { next })).error, /not connected/, 'with no other, its own answer comes back')
})
