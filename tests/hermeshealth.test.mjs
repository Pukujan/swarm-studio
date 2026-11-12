// When Hermes is not there (docs/specs/33-hermes-bridge.md, "When Hermes is not there"). Seen on
// 2026-11-12: Hermes Desktop kept the plugin's Python from before the bridge, so the server had nobody to
// answer its model calls; Make "planned" for a minute and ended "Stopped before any page was planned."
// with no reason. Now a build with no Hermes is refused at once with why, a Hermes on an older copy is
// told apart from a closed one, a Hermes that goes away mid-build stops the build with the reason, and
// every stop names its cause.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, utimesSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hermesHealth, hermesRunning, pyStamp, HERMES_SAYS } from '../engine/hermeshealth.mjs'
import { hermesBridge } from '../engine/bridge.mjs'
import { hermesLlm } from '../engine/hermesllm.mjs'
import { streamChat } from '../engine/llm.mjs'
import { reasonFromAbort, reasonFromFailure } from '../engine/stopreason.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

function pluginDir(mtimeS) {
  const dir = mkdtempSync(join(tmpdir(), 'hh-'))
  for (const f of ['__init__.py', 'bridge.py']) { writeFileSync(join(dir, f), '#'); utimesSync(join(dir, f), mtimeS, mtimeS) }
  return dir
}

test('closed: no Hermes running is "Hermes isn\'t connected", at once', async () => {
  const bridge = hermesBridge()
  const h = hermesHealth({ bridge, root: pluginDir(1000), running: async () => false })
  const t0 = Date.now()
  const r = await h.ready()
  assert.ok(Date.now() - t0 < 200)
  assert.deepEqual(r, { ok: false, code: 'closed', ...HERMES_SAYS.closed })
})

test('updated: a Hermes that has run a while and never attaches is running a copy from before the bridge', async () => {
  const h = hermesHealth({ bridge: hermesBridge(), root: pluginDir(1000), running: async () => true })
  const t0 = Date.now()
  const r = await h.ready()
  assert.ok(Date.now() - t0 < 200, 'no wait for a Hermes that is not starting up')
  assert.equal(r.code, 'updated')
  assert.match(r.message, /Restart Hermes to finish/)
  assert.match(r.action, /hermes gateway restart/)
})

test('a Hermes that just started gets a moment to attach before it is called outdated', async () => {
  const bridge = hermesBridge()
  const h = hermesHealth({ bridge, root: pluginDir(1000), running: async () => 'young', settleMs: 2000, pollMs: 20 })
  setTimeout(() => bridge.attach({ url: 'http://127.0.0.1:5999', token: 'bridge-token-0123456789', code: 2000 }), 100)
  assert.deepEqual(await h.ready(), { ok: true, code: 'ok' })
  const late = hermesHealth({ bridge: hermesBridge(), root: pluginDir(1000), running: async () => 'young', settleMs: 120, pollMs: 20 })
  assert.equal((await late.ready()).code, 'updated')
})

test('a bridge whose Hermes closed a moment ago is found out before a build, not 45 s later', async () => {
  const gone = createServer()
  await new Promise(r => gone.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${gone.address().port}`
  await new Promise(r => gone.close(r))
  const bridge = hermesBridge()
  bridge.attach({ url, token: 'bridge-token-0123456789', code: 2000 })
  assert.equal(bridge.status().attached, true)
  const r = await hermesHealth({ bridge, root: pluginDir(1000), running: async () => false }).ready()
  assert.equal(r.code, 'closed')
  assert.equal(bridge.status().attached, false)
})

test('the stale-Python case: an attached bridge whose loaded code is older than the files on disk', async () => {
  const bridge = hermesBridge()
  bridge.attach({ url: 'http://127.0.0.1:5999', token: 'bridge-token-0123456789', code: 1000 })
  assert.deepEqual(bridge.status().codes, [1000])
  const stale = await hermesHealth({ bridge, root: pluginDir(5000), running: async () => true }).now()
  assert.equal(stale.code, 'updated')
  assert.equal(stale.ok, true, 'it still answers; the person is told to restart')
  assert.deepEqual(await hermesHealth({ bridge, root: pluginDir(1000), running: async () => true }).now(), { ok: true, code: 'ok' })
  // a bridge too old to send its stamp is not judged
  const old = hermesBridge()
  old.attach({ url: 'http://127.0.0.1:5999', token: 'bridge-token-0123456789' })
  assert.equal((await hermesHealth({ bridge: old, root: pluginDir(5000) }).now()).code, 'ok')
  assert.equal(pyStamp(pluginDir(1234)), 1234)
})

test('a running Hermes is found by its gateway.pid only (Desktop runs it as python3 -c …), never by reading process lists', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hh-home-'))
  assert.equal(await hermesRunning({ home }), false, 'no gateway.pid')
  writeFileSync(join(home, 'gateway.pid'), JSON.stringify({ pid: process.pid, kind: 'hermes-gateway' }))
  assert.equal(await hermesRunning({ home, self: 1 }), 'young')
  assert.equal(await hermesRunning({ home, self: 1, now: () => Date.now() + 60000 }), true)
  assert.equal(await hermesRunning({ home }), false, 'this process is not a Hermes')
  writeFileSync(join(home, 'gateway.pid'), JSON.stringify({ pid: 2 ** 22 + 7 }))
  assert.equal(await hermesRunning({ home }), false, 'a gateway.pid left behind by a dead gateway')
  writeFileSync(join(home, 'gateway.pid'), 'not json')
  assert.equal(await hermesRunning({ home }), false)
  assert.doesNotMatch(readFileSync(new URL('../engine/hermeshealth.mjs', import.meta.url), 'utf8'), /\bps\b['"]|execFile|child_process/, 'no process list is read')
})

test('a call that finds no Hermes fails after its grace with the reason, and onGone hears it', async () => {
  const bridge = hermesBridge()
  const gone = []
  let port = 0
  const health = hermesHealth({ bridge, root: pluginDir(1000), running: async () => false })
  const llm = hermesLlm({ bridge, port: () => port, pollMs: 20, graceMs: 150, health, onGone: why => gone.push(why) })
  const server = createServer((req, res) => { if (!llm.handle(req, res)) res.writeHead(404).end() })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  port = server.address().port
  try {
    const t0 = Date.now()
    const err = await streamChat(llm.provider(), { model: 'planner', messages: [] }).then(() => null, e => e)
    assert.ok(Date.now() - t0 < 2000)
    assert.equal(err.status, 503)
    assert.deepEqual(err.hermes, { code: 'hermes_closed', ...HERMES_SAYS.closed })
    assert.deepEqual(gone, [{ code: 'hermes_closed', ...HERMES_SAYS.closed }])
  } finally { await new Promise(r => server.close(r)) }
})

test('every stop names its cause; the provider\'s own words are kept', () => {
  assert.equal(reasonFromAbort('person').code, 'person')
  assert.equal(reasonFromAbort(undefined).code, 'person')
  assert.equal(reasonFromAbort('replaced').code, 'replaced')
  assert.deepEqual(reasonFromAbort({ code: 'hermes', message: 'm', action: 'a' }), { code: 'hermes', message: 'm', action: 'a' })
  const cap = reasonFromFailure('planner: HTTP 402 {"error":{"message":"Budget cap reached for this key","type":"budget"}}')
  assert.equal(cap.code, 'model')
  assert.match(cap.message, /Budget cap reached for this key/)
  assert.match(cap.action, /credit or budget/)
  // a body cut off part way still gives the provider's words
  assert.match(reasonFromFailure('planner: HTTP 429 {"error":{"message":"Rate limit: slow down","code":42,"more":"xxxxxxxx').message, /Rate limit: slow down/)
  assert.equal(reasonFromFailure('the planner took too long (timed out)').code, 'timeout')
  assert.equal(reasonFromFailure('planner: terminated', { viaHermes: true }).code, 'hermes')
  assert.equal(reasonFromFailure(`planner: HTTP 503 {"error":{"message":"Hermes isn't connected. Open…","code":"hermes_closed"}}`).code, 'hermes')
})

// ---------- the real server, on its own port and data folder, with no model key

async function freePort() {
  const s = createServer()
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const p = s.address().port
  await new Promise(r => s.close(r))
  return p
}

async function startServer(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hh-srv-'))
  const port = await freePort()
  const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: join(dir, 'data'), SWARM_RUNS_DIR: join(dir, 'data', 'runs'), SWARM_OUTPUT_DIR: join(dir, 'out'), HERMES_HOME: join(dir, 'hermes'), SWARM_HERMES_RUNNING: '0', ...extra }
  for (const k of Object.keys(env)) if (/_API_KEY$/.test(k) || /^SWARM_(PLANNER|WORKER|REVIEWER)_/.test(k)) delete env[k]
  const child = spawn(process.execPath, [join(root, 'server', 'server.mjs'), '--port', String(port)], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''
  child.stderr.on('data', b => { log += b })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 80; i++) { if (await fetch(base + '/').then(() => true, () => false)) break; await new Promise(r => setTimeout(r, 100)) }
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { 'x-swarm-token': 't', 'content-type': 'application/json', ...(init.headers || {}) } })
  const stop = () => { child.kill(); try { rmSync(dir, { recursive: true, force: true }) } catch {} }
  return { base, call, stop, dir, log: () => log }
}

const runEvents = (s, id) => { try { return readFileSync(join(s.dir, 'data', 'runs', id, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }

test('a server with no Hermes refuses a build in under a second, with the reason, and nothing starts', async () => {
  const s = await startServer()
  try {
    await s.call('/api/state')
    const t0 = Date.now()
    const res = await s.call('/api/run', { method: 'POST', body: JSON.stringify({ brief: 'A one-page site for a plant shop' }) })
    const ms = Date.now() - t0
    const j = await res.json()
    assert.equal(res.status, 503)
    assert.ok(ms < 1000, `refused in ${ms} ms`)
    assert.equal(j.code, 'hermes_closed')
    assert.equal(j.hermes, true)
    assert.equal(j.message, "Hermes isn't connected.")
    assert.match(j.action, /Open Hermes Desktop/)
    const state = await (await s.call('/api/state')).json()
    assert.ok(!state.run, 'no build was started')
    const auto = await s.call('/api/auto', { method: 'POST', body: JSON.stringify({ prompt: 'a plant shop' }) })
    assert.equal(auto.status, 503)
    const h = await (await s.call('/api/hermes?ready=1')).json()
    assert.equal(h.needed, true)
    assert.equal(h.health.code, 'closed')
  } finally { s.stop() }
})

test('a Hermes that disappears mid-build stops the build with the reason; when one attaches again the canvas is told', async () => {
  const s = await startServer({ SWARM_HERMES_GRACE_MS: '300' })
  // a fake bridge that takes the model calls and never answers, then goes away
  const held = []
  const bridge = createServer((req, res) => { held.push(res); req.resume() })
  await new Promise(r => bridge.listen(0, '127.0.0.1', r))
  const events = []
  const ctl = new AbortController()
  const sse = fetch(`${s.base}/events?k=t`, { signal: ctl.signal }).then(async r => {
    let buf = ''
    for await (const chunk of r.body) {
      buf += Buffer.from(chunk).toString()
      for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) { const line = buf.slice(0, i); if (line.startsWith('data: ')) try { events.push(JSON.parse(line.slice(6))) } catch {} }
    }
  }).catch(() => {})
  try {
    const at = await s.call('/api/hermes/attach', { method: 'POST', body: JSON.stringify({ url: `http://127.0.0.1:${bridge.address().port}`, token: 'bridge-token-0123456789', pid: 4242, code: 1e10 }) })
    assert.equal(at.status, 200)
    const res = await s.call('/api/run', { method: 'POST', body: JSON.stringify({ brief: 'A one-page site for a plant shop' }) })
    assert.equal(res.status, 200)
    const { run } = await res.json()
    for (let i = 0; i < 50 && !held.length; i++) await new Promise(r => setTimeout(r, 100))
    assert.ok(held.length, 'the build called the model through the bridge')
    // Hermes closes: the call in flight breaks and the bridge refuses the next ones
    for (const r of held) r.socket?.destroy()
    await new Promise(r => bridge.close(r))
    bridge.closeAllConnections?.()
    let stopped = null
    for (let i = 0; i < 100 && !stopped; i++) {
      await new Promise(r => setTimeout(r, 100))
      const lines = runEvents(s, run)
      stopped = lines.find(e => e.type === 'run:stopped')
      assert.ok(!lines.some(e => e.type === 'run:done'), 'a build that planned nothing did not "finish"')
    }
    assert.ok(stopped, 'the build stopped')
    assert.equal(stopped.reason.code, 'hermes')
    assert.match(stopped.reason.message, /Hermes closed during the build/)
    assert.ok(stopped.reason.action)
    // Hermes is back: the canvas hears it (and resumes a build it stopped)
    const again = createServer((req, res) => res.writeHead(200).end('{}'))
    await new Promise(r => again.listen(0, '127.0.0.1', r))
    await s.call('/api/hermes/attach', { method: 'POST', body: JSON.stringify({ url: `http://127.0.0.1:${again.address().port}`, token: 'bridge-token-0123456789', pid: 4243, code: 1e10 }) })
    for (let i = 0; i < 30 && !events.some(e => e.type === 'hermes:back' && e.attached); i++) await new Promise(r => setTimeout(r, 50))
    assert.ok(events.some(e => e.type === 'hermes:back' && e.attached))
    again.close()
  } finally { ctl.abort(); await sse; bridge.close(); s.stop() }
})

test('the person\'s Stop and a newer build are named as such', async () => {
  const s = await startServer()
  // answers what pictures it offers (none), holds the model calls
  const bridge = createServer((req, res) => { req.resume(); if (!req.url.includes('/v1/')) res.writeHead(200, { 'content-type': 'application/json' }).end('{"image":false,"video":false}') })
  await new Promise(r => bridge.listen(0, '127.0.0.1', r))
  try {
    await s.call('/api/hermes/attach', { method: 'POST', body: JSON.stringify({ url: `http://127.0.0.1:${bridge.address().port}`, token: 'bridge-token-0123456789', pid: 4244, code: 1e10 }) })
    const first = (await (await s.call('/api/run', { method: 'POST', body: JSON.stringify({ brief: 'A site for a plant shop' }) })).json()).run
    await new Promise(r => setTimeout(r, 300))
    const second = (await (await s.call('/api/run', { method: 'POST', body: JSON.stringify({ brief: 'A site for a bakery' }) })).json()).run
    await new Promise(r => setTimeout(r, 300))
    await s.call('/api/stop', { method: 'POST', body: JSON.stringify({ run: second }) })
    const stopOf = id => runEvents(s, id).find(e => e.type === 'run:stopped') || null
    let a = null, b = null
    for (let i = 0; i < 50 && !(a && b); i++) { await new Promise(r => setTimeout(r, 100)); b = stopOf(second); a = stopOf(first) }
    assert.equal(b?.reason?.code, 'person')
    // the first build's last word was written while it was still current, or not at all: either way
    // it was never a stop with no cause
    if (a) assert.ok(a.reason?.code)
  } finally { bridge.closeAllConnections?.(); bridge.close(); s.stop() }
})
