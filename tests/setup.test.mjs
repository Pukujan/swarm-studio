import test from 'node:test'
import assert from 'node:assert/strict'
import { pictureState, pictureRun, modelTester, modelError } from '../engine/setup.mjs'

const codex = { provider: 'openai-codex', available: true, models: ['gpt-image-2-low'], default: 'gpt-image-2-low' }
const xai = { provider: 'xai', available: false, models: ['grok-image'], default: 'grok-image' }

test('the default is painted when an image model is ready, else drawn', () => {
  assert.equal(pictureState({ providers: [codex] }).mode, 'painted')
  assert.equal(pictureState({ providers: [xai] }).mode, 'drawn')
  assert.equal(pictureState({ providers: [] }).mode, 'drawn')
})

test('an image model whose last paint was refused is not ready', () => {
  const s = pictureState({ providers: [codex], last: { provider: 'openai-codex', ok: false, error: 'HTTP 429 usage limit has been reached' } })
  assert.equal(s.mode, 'drawn')
  assert.equal(s.painted.ready, false)
  assert.match(s.painted.error, /usage limit/)
  // another provider's refusal says nothing about this one
  assert.equal(pictureState({ providers: [codex], last: { provider: 'xai', ok: false } }).mode, 'painted')
  assert.equal(pictureState({ providers: [codex], last: { provider: 'openai-codex', ok: true } }).mode, 'painted')
})

test('a pick is kept, whatever the image model is doing', () => {
  assert.equal(pictureState({ providers: [], pick: 'stock' }).mode, 'stock')
  assert.equal(pictureState({ providers: [codex], pick: 'drawn' }).mode, 'drawn')
  const s = pictureState({ providers: [], pick: 'painted' })
  assert.equal(s.mode, 'painted')
  assert.equal(s.painted.ready, false)
  assert.equal(pictureState({ providers: [codex], pick: 'sideways' }).mode, 'painted')
})

test('the Models menu\'s "off" means drawn until a Pictures pick is made', () => {
  assert.equal(pictureState({ providers: [codex], imagePick: 'off' }).mode, 'drawn')
  assert.equal(pictureState({ providers: [codex], imagePick: 'off', pick: 'stock' }).mode, 'stock')
})

test('what a build does with each mode', () => {
  const choice = { provider: 'openai-codex', model: 'gpt-image-2-low' }
  assert.deepEqual(pictureRun('drawn', choice), { images: false, paint: false })
  assert.deepEqual(pictureRun('stock', choice), { images: true, paint: false })
  assert.deepEqual(pictureRun('painted', choice), { images: true, paint: true })
  // painted with no image model: the slots stay and stock photos fill them, never empty
  assert.deepEqual(pictureRun('painted', null), { images: true, paint: false })
})

test('the model test calls each role once and keeps the answer', async () => {
  let calls = 0, t = 1000
  const tester = modelTester({ call: async (p, m) => { calls++; if (m === 'bad') throw new Error('bad: HTTP 401 {"error":{"message":"Invalid API key"}}') }, now: () => t })
  const roles = { planner: { model: 'plan', baseUrl: 'https://a', apiKey: 'k' }, worker: { model: 'build', baseUrl: 'https://a', apiKey: 'k' } }
  const r = await tester.test(roles)
  assert.equal(r.ok, true)
  assert.equal(calls, 2)
  await tester.test(roles)
  assert.equal(calls, 2)
  t += 11 * 60e3
  await tester.test(roles)
  assert.equal(calls, 4)
  await tester.test(roles, { again: true })
  assert.equal(calls, 6)
  const bad = await tester.test({ ...roles, worker: { ...roles.worker, model: 'bad' } })
  assert.equal(bad.ok, false)
  assert.equal(bad.worker.error, '401: Invalid API key')
  assert.equal(bad.planner.ok, true)
})

test('no key is a failed test, with no call made', async () => {
  let calls = 0
  const r = await modelTester({ call: async () => { calls++ } }).test({ planner: { model: 'x', baseUrl: 'https://a', apiKey: '' }, worker: null })
  assert.equal(r.ok, false)
  assert.equal(calls, 0)
  assert.equal(r.planner.error, 'No model yet')
})

test('a model error never carries a key', () => {
  assert.doesNotMatch(modelError(new Error('refused for Bearer sk-abcdefghijklmnop1234')), /abcdefghijklmnop/)
  assert.equal(modelError(''), 'No answer')
})

test('the Account row: who this install posts as, never the token, and only known sign-ins', async () => {
  const { setupRoutes } = await import('../server/setup.mjs')
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { EventEmitter } = await import('node:events')
  const dir = mkdtempSync(join(tmpdir(), 'su-'))
  const calls = []
  const handle = setupRoutes({ dataDir: dir, roles: () => ({}), call: async () => {}, image: async () => ({ providers: [] }), setPictures: () => {}, feed: async c => { calls.push(c); return { ok: true } } })
  const ask = (method, path, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.destroy = () => {}
    const res = { writeHead: code => ({ end: s => resolve({ code, data: JSON.parse(s) }) }) }
    handle(req, res, new URL(`http://x${path}`))
    req.emit('data', JSON.stringify(body || {})); req.emit('end')
  })
  assert.deepEqual((await ask('GET', '/api/setup')).data.account, { connected: false, name: '', handle: '', guest: false, pending: null })
  writeFileSync(join(dir, 'feed.json'), JSON.stringify({ pending: { userCode: 'WXYZ-2345', provider: 'google', expiresAt: Date.now() / 1000 + 600 } }))
  const r = await ask('POST', '/api/setup/account', { provider: 'google' })
  assert.equal(calls[0], 'account_json("provider", "google")')
  assert.deepEqual(r.data.account.pending, { code: 'WXYZ-2345', provider: 'google' })
  assert.equal((await ask('POST', '/api/setup/account', { provider: 'myspace' })).code, 400)
  assert.equal(calls.length, 1)
  writeFileSync(join(dir, 'feed.json'), JSON.stringify({ token: 'sfp_secret', handle: 'comet', name: 'Comet', guest: true }))
  const v = await ask('GET', '/api/setup')
  assert.deepEqual(v.data.account, { connected: true, name: 'Comet', handle: 'comet', guest: true, pending: null })
  assert.doesNotMatch(JSON.stringify(v.data), /sfp_secret/)
})

test('the Models row carries the media reader: its model and what it takes, or off, or nothing', async () => {
  const { setupRoutes } = await import('../server/setup.mjs')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { EventEmitter } = await import('node:events')
  let md = { model: 'mimotp/mimo-v2.6-flash', pick: null, takes: 'hears sound, sees frames of a clip', caps: { audio: true } }
  const handle = setupRoutes({ dataDir: mkdtempSync(join(tmpdir(), 'su-')), roles: () => ({}), call: async () => {}, image: async () => ({ providers: [] }), setPictures: () => {}, media: async () => md })
  const get = () => new Promise(resolve => {
    const req = new EventEmitter(); req.method = 'GET'; req.destroy = () => {}
    handle(req, { writeHead: () => ({ end: s => resolve(JSON.parse(s)) }) }, new URL('http://x/api/setup'))
  })
  assert.deepEqual((await get()).models.media, { model: 'mimotp/mimo-v2.6-flash', takes: 'hears sound, sees frames of a clip', off: false })
  md = { model: '', pick: 'off', takes: '' }
  assert.equal((await get()).models.media.off, true)
  md = null
  assert.equal((await get()).models.media, null)
})
