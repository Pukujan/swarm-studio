// A throwaway Studio for the screen walkthrough (docs/ux/walkthrough): its own port, its own data
// folder, a model that always fails, and five small projects (a site with a visitor, an app, a game,
// a film, and a site caught mid-build for the replay).
//
//   node scripts/walkthrough-fixtures.mjs        starts it and prints the address (Ctrl-C ends it)
//   import { studio } from './walkthrough-fixtures.mjs'   → { BASE, ids, api, stop }
//
// It never touches the 4319 server or the real data folder.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const wait = ms => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) }) })

const T0 = Date.parse('2026-11-01T10:00:00Z')
const rid = n => new Date(T0 + n * 3600e3).toISOString().replace(/[:.]/g, '-')

const SHADES = ['#1d1d1f', '#2a2a2d', '#3a3a3e']
function section(title, line, i) {
  return `<section style="padding:72px 64px;min-height:${i ? 520 : 760}px;background:${SHADES[i % 3]};color:#eee;font-family:system-ui"><h${i ? 2 : 1} style="font-size:${i ? 40 : 64}px;margin:0 0 16px">${title}</h${i ? 2 : 1}><p style="font-size:20px;max-width:640px;opacity:.8">${line}</p></section>`
}
function site(runs, run, { brief, name, t, kind, pages, done = true, extra = [] }) {
  const ev = [{ type: 'run:start', t, run, brief, ...(kind ? { kind } : {}), agents: [{ id: 'a0', name: 'Ada', color: '#d4d4d8' }, { id: 'a1', name: 'Bo', color: '#a1a1aa' }] }]
  ev.push({ type: 'theme', t: t + 10, run, name: 'Plain', direction: '', vars: { '--background': '#111111', '--foreground': '#eeeeee', '--primary': '#e4e4e7' } })
  pages.forEach(([pid, title], i) => ev.push({ type: 'page', t: t + 20 + i, run, id: pid, title, purpose: '', index: i }))
  const roles = ['hero', 'features', 'footer']
  let n = 0
  const planned = pages.length * roles.length
  ev.push({ type: 'plan:done', t: t + 50, run, ms: 50, pages: pages.length, layers: planned })
  pages.forEach(([pid, title], i) => roles.forEach((role, j) => {
    ev.push({ type: 'layer:plan', t: t + 30 + i, run, page: pid, id: role, role, height: j ? 520 : 760 })
    ev.push({ type: 'agent:assign', t: t + 100 + n * 10, run, agent: `a${n % 2}`, page: pid, layer: role, role })
    if (done || n < planned / 2) ev.push({ type: 'layer:done', t: t + 600 + n * 400, run, page: pid, layer: role, agent: `a${n % 2}`, ms: 400, done: n + 1, planned, html: section(j ? `${title}: ${role}` : title, brief, j) })
    n++
  }))
  ev.push(...extra.map(e => ({ run, t: t + 9000, ...e })))
  if (done) ev.push({ type: 'run:done', t: t + 10000, run, ms: 10000, planned, done: planned, failed: 0, pages: pages.length })
  mkdirSync(join(runs, run))
  writeFileSync(join(runs, run, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
}

// noHermes: no model of its own and an empty Hermes home, so every role goes through a Hermes that is not
// running (the "no Hermes" screens)
// root: the tree whose server and web/ to run (the motion check runs the base branch's too)
export async function studio({ quiet = true, noHermes = false, root = ROOT, setup } = {}) {
  const data = mkdtempSync(join(tmpdir(), 'swarm-walk-'))
  const runs = join(data, 'runs')
  mkdirSync(runs)
  const ids = { site: rid(0), site2: rid(1), app: rid(2), game: rid(3), film: rid(4), mid: rid(5), old: rid(6) }
  site(runs, ids.site, { brief: 'Alpha Tea, a tea subscription for night-shift workers', name: 'Alpha Tea', t: T0, pages: [['home', 'Alpha Tea'], ['plans', 'Plans'], ['about', 'About']] })
  site(runs, ids.site2, { brief: 'Alpha Tea, a tea subscription for night-shift workers, with gift boxes', name: 'Alpha Tea', t: T0 + 3600e3, pages: [['home', 'Alpha Tea'], ['plans', 'Plans'], ['gifts', 'Gift boxes']] })
  site(runs, ids.app, { brief: 'Shift Log, an app where nurses swap shifts', name: 'Shift Log', t: T0 + 7200e3, kind: 'app', pages: [['signin', 'Sign in'], ['board', 'Shift board']], extra: [{ type: 'app:step', step: 'design', state: 'done' }] })
  site(runs, ids.game, { brief: 'Lantern Run, a small platformer through a night market', name: 'Lantern Run', t: T0 + 3 * 3600e3, kind: 'game', pages: [['home', 'Lantern Run']], extra: [{ type: 'game:spec', spec: { title: 'Lantern Run', genre: 'platformer', brand: { name: 'Lantern', vars: { '--background': '#111', '--foreground': '#eee' } } } }] })
  site(runs, ids.film, { brief: 'River Hours, a 30 second film for a riverside cafe', name: 'River Hours', t: T0 + 4 * 3600e3, kind: 'video', pages: [['home', 'River Hours']], extra: [{ type: 'video:start' }, { type: 'video:failed', error: 'no footage model' }] })
  site(runs, ids.mid, { brief: 'Cedar Cafe, a small cafe by the river', name: 'Cedar Cafe', t: T0 + 5 * 3600e3, pages: [['home', 'Cedar Cafe'], ['menu', 'Menu'], ['visit', 'Visit']], done: false })
  site(runs, ids.old, { brief: 'Old Pier, a page for a closed pier', name: 'Old Pier', t: T0 + 6 * 3600e3, pages: [['home', 'Old Pier']] })
  writeFileSync(join(runs, ids.site, 'tours.json'), JSON.stringify({ tours: [{ name: 'Mia', who: 'night nurse', emoji: '🙂', goal: 'a tea for after shifts', end: 'okay, that works', steps: [
    { page: 'home', do: 'look', el: 'l0', think: ['hm, tea'] }, { page: 'plans', do: 'look', el: 'l0', think: ['which plan'] }, { page: 'about', do: 'look', el: 'l0', think: ['who makes it'] }] }] }))
  const proj = (r, name, made) => ({ runs: r, name, title: null, folder: null, trashed: null, made, own: true })
  writeFileSync(join(runs, 'folders.json'), JSON.stringify({ v: 2, folders: ['Clients'], projects: {
    [ids.site]: { ...proj([ids.site, ids.site2], 'Alpha Tea', T0), folder: 'Clients' },
    [ids.app]: proj([ids.app], 'Shift Log', T0 + 7200e3),
    [ids.game]: proj([ids.game], 'Lantern Run', T0 + 3 * 3600e3),
    [ids.film]: proj([ids.film], 'River Hours', T0 + 4 * 3600e3),
    [ids.mid]: proj([ids.mid], 'Cedar Cafe', T0 + 5 * 3600e3),
    [ids.old]: { ...proj([ids.old], 'Old Pier', T0 + 6 * 3600e3), trashed: T0 + 7 * 3600e3 }
  } }))

  setup?.({ runs, site, T0, rid })
  const fake = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"no model here"}')) })
  const fakePort = await freePort()
  await new Promise(r => fake.listen(fakePort, '127.0.0.1', r))
  const port = (!noHermes && Number(process.env.WALK_PORT)) || await freePort(), TOKEN = 'walkthrough'
  const BASE = `http://127.0.0.1:${port}`
  const env = { ...process.env, SWARM_PORT: String(port), SWARM_TOKEN: TOKEN, SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runs, SWARM_OUTPUT_DIR: join(data, 'out'), SWARM_BASE_URL: `http://127.0.0.1:${fakePort}/v1`, SWARM_API_KEY: 'none', SWARM_FEED_URL: 'http://127.0.0.1:9' }
  if (noHermes) { delete env.SWARM_BASE_URL; delete env.SWARM_API_KEY; env.HERMES_HOME = join(data, 'hermes'); mkdirSync(env.HERMES_HOME) }
  for (const k of ['SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH', 'HERMES_CUSTOM_INFERHUB_API_KEY', 'SWARM_ELEVENLABS_KEY', 'SWARM_TTS_URL']) delete env[k]
  const server = spawn(process.execPath, [join(root, 'server/server.mjs')], { env, stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'] })
  const api = (path, body) => fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json())
  for (let i = 0; i < 100; i++) { if (await fetch(`${BASE}/api/state`).then(r => r.ok, () => false)) break; await wait(150) }
  const stop = () => { server.kill(); fake.close(); rmSync(data, { recursive: true, force: true }) }
  return { BASE, ids, api, stop, data }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await studio({ quiet: false })
  console.log(`walkthrough studio: ${s.BASE}  (data ${s.data})`)
  console.log(JSON.stringify(s.ids))
  const end = () => { s.stop(); process.exit(0) }
  process.on('SIGINT', end); process.on('SIGTERM', end)
}
