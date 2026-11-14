import test from 'node:test'
import assert from 'node:assert/strict'
import { pictureState, pictureRun, modelTester, modelError, modelProblem } from '../engine/setup.mjs'

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

test('a failed model check is one plain line and the fix that fits it, never the raw message', async () => {
  const scoped = 'planner: HTTP 502 {"error": {"message": "UnscopedSecretError: Hermes could not read this profile\'s HERMES_CUSTOM_INFERHUB_API_KEY (an internal profile-scoping bug'
  assert.deepEqual(modelProblem(scoped), { line: 'Hermes can\'t read your model key. Restart Hermes.', fix: 'restart' })
  assert.deepEqual(modelProblem('No model yet'), { line: 'No model is set up.', fix: 'hermes' })
  assert.equal(modelProblem('401: Incorrect API key provided').fix, 'hermes')
  assert.equal(modelProblem('404: model cb/x not found').line, 'Hermes doesn\'t have this model.')
  assert.equal(modelProblem('429: rate limit reached').fix, 'again')
  assert.equal(modelProblem('Waiting for Hermes: open Hermes, or run `hermes swarm`, to continue').line, 'Hermes isn\'t connected. Open Hermes.')
  assert.equal(modelProblem('Swarm Studio was updated. Restart Hermes to finish.').fix, 'restart')
  // as Hermes really sends it: a 503 that is not "busy"
  assert.equal(modelProblem('planner: HTTP 503 {"error":{"code":"hermes_updated","message":"Swarm Studio was updated. Restart Hermes to finish.').line, 'Swarm Studio was updated. Restart Hermes.')
  assert.equal(modelProblem('The operation was aborted due to timeout').fix, 'again')
  assert.deepEqual(modelProblem('something nobody has seen'), { line: 'The model didn\'t work.', fix: 'hermes' })
  // the tester says it once, from the first role that failed
  const r = await modelTester({ call: async () => { throw new Error(scoped) } }).test({ planner: { model: 'p', baseUrl: 'https://a', apiKey: 'k' }, worker: { model: 'w', baseUrl: 'https://a', apiKey: 'k' } })
  assert.equal(r.problem.fix, 'restart')
  assert.equal((await modelTester({ call: async () => {} }).test({ planner: { model: 'p', baseUrl: 'https://a', apiKey: 'k' }, worker: { model: 'w', baseUrl: 'https://a', apiKey: 'k' } })).problem, null)
})

test('Let Hermes set this up opens a console on Windows, and a failed check is kept for the avatar', async () => {
  const { setupRoutes } = await import('../server/setup.mjs')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { EventEmitter } = await import('node:events')
  const dir = mkdtempSync(join(tmpdir(), 'su-'))
  const runs = []
  let fail = true
  const opts = { dataDir: dir, roles: () => ({ planner: { model: 'p', baseUrl: 'https://a', apiKey: 'k' }, worker: { model: 'w', baseUrl: 'https://a', apiKey: 'k' } }), call: async () => { if (fail) throw new Error('No answer') }, image: async () => ({ providers: [] }), setPictures: () => {} }
  const make = extra => {
    const handle = setupRoutes({ ...opts, ...extra })
    return (method, path, body) => new Promise(resolve => {
      const req = new EventEmitter(); req.method = method; req.destroy = () => {}
      const res = { writeHead: code => ({ end: s => resolve({ code, data: JSON.parse(s) }) }) }
      handle(req, res, new URL(`http://x${path}`))
      req.emit('data', JSON.stringify(body || {})); req.emit('end')
    })
  }
  const win = make({ platform: 'win32', hermesBin: 'C:\\Program Files\\WindowsApps\\NousResearchInc.HermesAgent_1\\app\\bin\\hermes.exe', run: (cmd, args, o, cb) => { runs.push([cmd, args]); cb(null) } })
  assert.deepEqual((await win('POST', '/api/setup/hermes')).data, { ok: true, command: 'hermes model' })
  // the Store app's own file cannot start outside its package: its `hermes` alias does
  assert.equal(runs[0][0], 'powershell.exe')
  assert.equal(runs[0][1].at(-1), "Start-Process -FilePath cmd.exe -ArgumentList '/k', '\"hermes\" model'")
  const linux = make({ platform: 'linux', run: () => assert.fail('nothing runs on Linux') })
  assert.deepEqual((await linux('POST', '/api/setup/hermes')).data, { ok: false, command: 'hermes model' })
  // a failed check outlives a restart (a new server reads setup.json) until one passes
  assert.equal((await win('GET', '/api/setup')).data.modelsOk, true)
  assert.equal((await win('POST', '/api/setup/models', { again: true })).data.ok, false)
  assert.equal((await make({})('GET', '/api/setup')).data.modelsOk, false)
  fail = false
  assert.equal((await win('POST', '/api/setup/models', { again: true })).data.ok, true)
  assert.equal((await make({})('GET', '/api/setup')).data.modelsOk, true)
})

test('the model picker: Hermes\'s own list; a pick and a key go through Hermes\'s CLI; the browser signs in', async () => {
  const { setupRoutes } = await import('../server/setup.mjs')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { EventEmitter } = await import('node:events')
  const calls = [], cli = []
  let cleared = 0
  const hermesModels = async call => {
    calls.push(call)
    if (call.startsWith('options_json')) return { ok: true, main: { provider: 'inferhub', model: 'cb/flash' }, slots: {}, providers: [{ slug: 'nous', signedIn: true, models: ['a'] }, { slug: 'anthropic', signedIn: false, sign: 'key', keyEnv: 'ANTHROPIC_API_KEY', models: [] }] }
    if (call === 'slots_json()') return { ok: true, slots: { planner: { slot: 'swarm_studio_planner', provider: 'nous', model: 'b', keep: {}, base_url: '' }, worker: { slot: 'swarm_studio_builder', provider: 'custom', model: 'm', keep: { timeout: 45 }, base_url: 'https://own' } } }
  }
  const run = (cmd, args, o, cb) => { cli.push([cmd, args]); cb(null, '', '') }
  // what `hermes auth add minimax-oauth` prints: the portal first, then the sign-in link and its code
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill() { this.killed = true } })
  const started = []
  const start = (cmd, args, o) => { started.push([cmd, args, o.env.PYTHONUNBUFFERED]); setTimeout(() => child.stdout.emit('data', 'Portal: https://api.example.io\n\nTo continue:\n  1. Open: https://example.io/oauth-authorize?user_code=5KBH-F8VV\n  2. If prompted, enter code: 5KBH-F8VV\n'), 5); return child }
  const handle = setupRoutes({ dataDir: mkdtempSync(join(tmpdir(), 'su-')), roles: () => ({ planner: { model: 'p', baseUrl: 'https://a', apiKey: 'k' }, worker: { model: 'w', baseUrl: 'https://a', apiKey: 'k' } }), call: async () => {}, image: async () => ({ providers: [] }), setPictures: () => {}, hermesModels, clearPicks: () => cleared++, hermesBin: '/h/hermes', run, start })
  const ask = (method, path, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.destroy = () => {}
    handle(req, { writeHead: code => ({ end: s => resolve({ code, data: JSON.parse(s) }) }) }, new URL(`http://x${path}`))
    req.emit('data', JSON.stringify(body || {})); req.emit('end')
  })
  const o = (await ask('GET', '/api/setup/models/options')).data
  assert.equal(o.providers[0].slug, 'nous')
  assert.equal(o.signing, null)
  await ask('GET', '/api/setup/models/options')
  assert.equal(calls.filter(c => c.startsWith('options')).length, 1, 'kept a minute')
  // a pick: the same provider changes the model; a new one replaces the slot, keeping its other settings
  const p = (await ask('POST', '/api/setup/models/pick', { provider: 'nous', model: 'a' })).data
  assert.equal(p.ok, true)
  assert.deepEqual(cli, [
    ['/h/hermes', ['config', 'set', 'auxiliary.swarm_studio_planner.model', 'a']],
    ['/h/hermes', ['config', 'set', 'auxiliary.swarm_studio_builder', '{"timeout":45,"provider":"nous","model":"a"}']]
  ])
  assert.equal(cleared, 1)
  assert.equal(p.test.ok, true)
  assert.deepEqual(p.slots.worker, { provider: 'nous', model: 'a' })
  // nothing that reads as a flag or breaks out of the value
  for (const model of ['--force', 'a b', 'a"b', '']) assert.equal((await ask('POST', '/api/setup/models/pick', { provider: 'nous', model })).data.ok, false, model)
  assert.equal((await ask('POST', '/api/setup/models/pick', { provider: '../x', model: 'a' })).data.ok, false)
  assert.equal(cli.length, 2)
  // a key: saved under the name Hermes's list gives, never one from the page
  assert.equal((await ask('POST', '/api/setup/models/signin', { slug: 'anthropic', key: 'sk-x', keyEnv: 'PATH' })).data.ok, true)
  assert.deepEqual(cli.at(-1), ['/h/hermes', ['config', 'set', 'ANTHROPIC_API_KEY', 'sk-x']])
  assert.equal((await ask('POST', '/api/setup/models/signin', { slug: 'nous', key: 'sk-x' })).data.ok, false, 'nous signs in another way')
  assert.equal((await ask('POST', '/api/setup/models/signin', { slug: '../x; rm' })).code, 400)
  // the browser: Hermes's own sign-in, its link and code read from what it prints
  const s = (await ask('POST', '/api/setup/models/signin', { slug: 'minimax-oauth' })).data.signing
  assert.deepEqual(started[0], ['/h/hermes', ['auth', 'add', 'minimax-oauth', '--type', 'oauth'], '1'])
  assert.equal(s.url, 'https://example.io/oauth-authorize?user_code=5KBH-F8VV')
  assert.equal(s.code, '5KBH-F8VV')
  assert.equal(s.done, null)
  assert.deepEqual((await ask('POST', '/api/setup/models/signin', { cancel: true })).data, { signing: null })
  assert.equal(child.killed, true)
})
