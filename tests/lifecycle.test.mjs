// Idle shutdown and clean process handling (decision 0017, issue #450): the rules with fake time (engine/lifecycle.mjs), the app
// servers' pool with real processes standing in for dev servers (engine/appjob.mjs), and a real tree-kill: a child
// that started a grandchild is stopped with it, on whatever OS this runs (CI runs it on Linux, macOS and Windows).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { spawn as rawSpawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { idleWatch, previewPool, serialQueue } from '../engine/lifecycle.mjs'
import { start, stopTree } from '../engine/proc.mjs'
import { appJobs, sourceSig, hasServer, corsFront } from '../engine/appjob.mjs'
import { serveStatic } from '../engine/godotfirst.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const wait = ms => new Promise(r => setTimeout(r, ms))
const alive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

// a clock and timers the test moves by hand
function fakeTime() {
  let t = 0, n = 0
  const jobs = new Map()
  return {
    now: () => t,
    timers: { setInterval: (fn, ms) => { jobs.set(++n, { fn, ms, at: t + ms }); return n }, clearInterval: h => jobs.delete(h) },
    advance(ms) {
      const end = t + ms
      for (;;) {
        const next = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        t = next[1].at
        next[1].at += next[1].ms
        next[1].fn()
      }
      t = end
    },
    count: () => jobs.size
  }
}

test('idleWatch: fires once after the idle time, never while busy, and a touch starts the time again', () => {
  const f = fakeTime()
  let busy = false, fired = 0
  const w = idleWatch({ ms: 20 * 60e3, busy: () => busy, onIdle: () => fired++, every: 30e3, now: f.now, timers: f.timers })
  f.advance(19 * 60e3)
  assert.equal(fired, 0)
  w.touch()
  f.advance(19 * 60e3)
  assert.equal(fired, 0, 'a request 19 min in starts the 20 min again')
  busy = true
  f.advance(60 * 60e3)
  assert.equal(fired, 0, 'never while a build, render, job or pane is there')
  busy = false
  f.advance(20 * 60e3 + 30e3)
  assert.equal(fired, 1)
  f.advance(60 * 60e3)
  assert.equal(fired, 1, 'once')
  assert.equal(f.count(), 0, 'its timer is gone')
})

test('idleWatch: 0 minutes is never, and the time is read each check (a Settings change applies at once)', () => {
  const f = fakeTime()
  let ms = 0, fired = 0
  idleWatch({ ms: () => ms, busy: () => false, onIdle: () => fired++, every: 30e3, now: f.now, timers: f.timers })
  f.advance(10 * 3600e3)
  assert.equal(fired, 0)
  ms = 10 * 60e3
  f.advance(30e3)
  assert.equal(fired, 1)
})

test('previewPool: an app nobody looks at stops after the idle time; a viewer\'s heartbeat keeps it; a build keeps it', async () => {
  const f = fakeTime(), stopped = []
  const building = new Set()
  const pool = previewPool({ max: 2, idleMs: 2 * 60e3, now: f.now, busy: id => building.has(id), stop: async (id, why) => { stopped.push([id, why]) } })
  await pool.admit('a')
  await pool.admit('b')
  building.add('b')
  f.advance(60e3)
  pool.seen('a')
  f.advance(90e3)
  await pool.sweep()
  assert.deepEqual(stopped, [], 'a was seen 90 s ago; b is being built')
  f.advance(31e3)
  await pool.sweep()
  assert.deepEqual(stopped, [['a', 'idle']])
  f.advance(3600e3)
  await pool.sweep()
  assert.deepEqual(stopped, [['a', 'idle']], 'b is still being built')
  building.delete('b')
  await pool.sweep()
  assert.deepEqual(stopped, [['a', 'idle'], ['b', 'idle']])
  assert.deepEqual(pool.running(), [])
})

test('previewPool: at most 2 run; a third stops the one seen longest ago, never one being built', async () => {
  const f = fakeTime(), stopped = []
  const building = new Set()
  const pool = previewPool({ max: () => 2, idleMs: 2 * 60e3, now: f.now, busy: id => building.has(id), stop: async id => { stopped.push(id) } })
  await pool.admit('a'); f.advance(1000)
  await pool.admit('b'); f.advance(1000)
  pool.seen('a'); f.advance(1000)
  await pool.admit('c')
  assert.deepEqual(stopped, ['b'], 'b was seen longest ago')
  assert.deepEqual(pool.running().sort(), ['a', 'c'])
  building.add('a'); building.add('c')
  await pool.admit('d')
  assert.deepEqual(stopped, ['b'], 'both others are being built: d runs as a third')
  assert.equal(pool.running().length, 3)
})

test('serialQueue: one render at a time, in order; the second hears that it waits', async () => {
  const q = serialQueue(1), order = []
  let waited = 0
  const job = (name, ms) => () => new Promise(r => { order.push(`start ${name}`); setTimeout(() => { order.push(`end ${name}`); r(name) }, ms) })
  const a = q.run(job('a', 40))
  const b = q.run(job('b', 10), () => waited++)
  assert.equal(q.busy(), true)
  assert.deepEqual(await Promise.all([a, b]), ['a', 'b'])
  assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b'])
  assert.equal(waited, 1)
  assert.equal(q.busy(), false)
  // a failed job frees its slot
  await assert.rejects(q.run(() => Promise.reject(new Error('render failed'))))
  assert.equal(await q.run(async () => 'next'), 'next')
})

test('stopTree with a fake kill: SIGTERM first, SIGKILL for what is left after the wait', async () => {
  const calls = []
  const p = { pid: 4242, exitCode: null, once: () => {} }
  await stopTree(p, { ms: 30, kill: (pid, sig, cb) => { calls.push([pid, sig]); if (sig === 'SIGKILL') cb() } })
  assert.deepEqual(calls, [[4242, 'SIGTERM'], [4242, 'SIGKILL']])
  // already gone: nothing to kill
  await stopTree({ pid: 1, exitCode: 0, once: () => {} }, { kill: () => assert.fail('killed a finished process') })
})

// a child that starts a grandchild (as a dev server starts esbuild, a render starts Chrome); both wait forever
const parentScript = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1e3)"
const grandchildOf = p => new Promise(r => p.stdout.once('data', b => r(Number(String(b).trim()))))

test('a real stop kills the whole tree: the child and the grandchild it started', async () => {
  const p = start(process.execPath, ['-e', parentScript], { stdout: 'pipe' })
  const grand = await grandchildOf(p)
  assert.ok(alive(p.pid) && alive(grand))
  await stopTree(p)
  for (let i = 0; i < 40 && (alive(p.pid) || alive(grand)); i++) await wait(100)
  assert.equal(alive(p.pid), false, 'the child')
  assert.equal(alive(grand), false, 'the grandchild')
})

test('start() hands the child only its own environment (extendEnv off, childEnv)', async () => {
  process.env.SWARM_TEST_SECRET_KEY = 'not-for-children'
  try {
    const r = await start(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(process.env)))'], { buffer: true, env: { ONLY_THIS: '1' } })
    const keys = JSON.parse(r.stdout)
    assert.ok(keys.includes('ONLY_THIS'))
    assert.ok(!keys.includes('SWARM_TEST_SECRET_KEY'))
  } finally { delete process.env.SWARM_TEST_SECRET_KEY }
})

test('the app pool with real processes: the third app stops the least recently seen with its children; idle ones stop', async () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'pool-'))
  const parked = []
  let t = 0
  const a = appJobs({ runsDir, record: () => {}, broadcast: e => { if (e.type === 'app:parked') parked.push([e.run, e.why]) }, readEvents: () => [], provider: () => ({}), modelFor: () => '', idleMs: 2 * 60e3, maxApps: 2, sweepEvery: 1e9, now: () => t })
  const procs = {}
  try {
    for (const id of ['r1', 'r2', 'r3']) {
      const p = start(process.execPath, ['-e', parentScript], { stdout: 'pipe' })
      procs[id] = { p, grand: await grandchildOf(p) }
      a.jobs.set(id, { id, state: 'done', proc: p, mode: 'dev', url: `http://127.0.0.1:1/${id}`, steps: [], asks: [] })
      await a.pool.admit(id)
      t += 1000
      if (id === 'r2') { a.seen('r1'); t += 1000 }
    }
    assert.deepEqual(parked, [['r2', 'room']], 'r2 was seen longest ago')
    for (let i = 0; i < 40 && (alive(procs.r2.p.pid) || alive(procs.r2.grand)); i++) await wait(100)
    assert.equal(alive(procs.r2.p.pid), false)
    assert.equal(alive(procs.r2.grand), false, 'its children too')
    assert.equal(a.seen('r2').url, null, 'its address is gone: the next open serves it again')
    // r1 is being built: it stays past the idle time; r3 is not
    a.jobs.get('r1').state = 'working'
    t += 3 * 60e3
    await a.pool.sweep()
    assert.deepEqual(parked, [['r2', 'room'], ['r3', 'idle']])
    assert.ok(alive(procs.r1.p.pid), 'r1 is being built')
  } finally {
    for (const { p, grand } of Object.values(procs)) { try { process.kill(grand, 'SIGKILL') } catch {} ; await stopTree(p, { ms: 200 }) }
    await a.close()
    rmSync(runsDir, { recursive: true, force: true })
  }
})

test('a finished app is built again only when its files change; an app with server routes is told apart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sig-'))
  try {
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src', 'App.tsx'), 'one')
    const a = sourceSig(dir)
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'x', 'i.js'), 'x')
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'index.html'), 'built')
    writeFileSync(join(dir, '.swarm-built.json'), '{}')
    assert.equal(sourceSig(dir), a, 'packages and build output do not count')
    writeFileSync(join(dir, 'src', 'App.tsx'), 'two!')
    assert.notEqual(sourceSig(dir), a, 'an edit does')
    assert.equal(hasServer(dir), false)
    mkdirSync(join(dir, 'server', 'routes', 'api'), { recursive: true })
    assert.equal(hasServer(dir), true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const freePort = () => new Promise(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) }) })

test('a built app\'s files: client-side routes get index.html, and the types a page needs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id=root></div>')
  writeFileSync(join(dir, 'logo.svg'), '<svg/>')
  const srv = await serveStatic(dir, await freePort(), { spa: true })
  try {
    const route = await fetch(`${srv.url}dashboard/orders`)
    assert.equal(route.status, 200)
    assert.match(await route.text(), /id=root/)
    const svg = await fetch(`${srv.url}logo.svg`)
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml')
    assert.equal(svg.headers.get('access-control-allow-origin'), '*')
    assert.equal((await fetch(`${srv.url}missing.js`)).status, 404, 'a missing file is still a 404')
  } finally { await srv.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('a built server sits behind a front that adds CORS (the sandboxed frame loads its module scripts)', async () => {
  const inner = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end(`hello ${req.url}`))
  const innerPort = await freePort()
  await new Promise(r => inner.listen(innerPort, '127.0.0.1', r))
  const front = await corsFront(await freePort(), innerPort)
  try {
    const r = await fetch(`${front.url}api/hello`)
    assert.equal(await r.text(), 'hello /api/hello')
    assert.equal(r.headers.get('access-control-allow-origin'), '*')
  } finally { await front.close(); inner.close() }
})

test('the server exits by itself after its idle time with nothing open, and not while a pane is open', async () => {
  const run = async extra => {
    const dir = mkdtempSync(join(tmpdir(), 'idle-srv-'))
    const port = await freePort()
    const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: join(dir, 'data'), SWARM_RUNS_DIR: join(dir, 'data', 'runs'), SWARM_OUTPUT_DIR: join(dir, 'out'), HERMES_HOME: join(dir, 'hermes'), SWARM_SERVER_IDLE_MIN: '0.03', ...extra }
    const child = rawSpawn(process.execPath, [join(root, 'server', 'server.mjs'), '--port', String(port)], { env, stdio: 'ignore' })
    const exited = new Promise(r => child.once('exit', code => r(code)))
    const base = `http://127.0.0.1:${port}`
    for (let i = 0; i < 80; i++) { if (await fetch(base + '/api/state').then(() => true, () => false)) break; await wait(100) }
    return { child, exited, base, dir }
  }
  const quiet = await run()
  try {
    const code = await Promise.race([quiet.exited, wait(15000).then(() => 'still running')])
    assert.equal(code, 0, 'exited cleanly after about 2 s with nothing to do')
  } finally { quiet.child.kill(); rmSync(quiet.dir, { recursive: true, force: true }) }

  const open = await run()
  const ctl = new AbortController()
  try {
    // a pane: the canvas's event stream
    const sse = fetch(`${open.base}/events?k=t`, { signal: ctl.signal }).then(r => r.body?.getReader().read()).catch(() => {})
    const code = await Promise.race([open.exited, wait(5000).then(() => 'still running')])
    assert.equal(code, 'still running', 'a pane keeps it')
    ctl.abort()
    await sse
    assert.equal(await Promise.race([open.exited, wait(15000).then(() => 'still running')]), 0, 'and once it closes, it goes')
  } finally { ctl.abort(); open.child.kill(); rmSync(open.dir, { recursive: true, force: true }) }
  assert.ok(!existsSync(quiet.dir))
})
