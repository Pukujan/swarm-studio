// Open check: the Studio shows the build the person clicked, and only that one.
//
//   node scripts/open-check.mjs   (PLAYWRIGHT_DIR=<folder with node_modules/playwright> if not installed;
//                                  CHROMIUM_PATH=<a Chromium> when Playwright's own is not downloaded)
//
// The owner clicked a project and got the prototype player on another project's site, under a pill
// that said Overview. This starts its own server on a free port with a throwaway data folder and two
// small projects, Alpha Tea (one version) and Bravo Bikes (two), plus a third build the server holds
// as its current run (what it replays to every canvas), then in a headless browser:
//   1. opens Alpha, plays it, goes home, opens Bravo: Bravo's pages, no player, the pill says Overview
//   2. the same through a version tile (Bravo › Version 1)
//   3. a build started elsewhere, and the stream dropping and replaying the server's run, change nothing
//   4. the p key on Projects opens no player behind it
// It never touches the 4319 server or the real data folder.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: npm i --no-save playwright, or set PLAYWRIGHT_DIR to a folder that has it')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}
const { chromium } = await loadPlaywright()

const wait = ms => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) }) })
const fails = []
let passes = 0
const ok = (cond, what) => { if (cond) { passes++; console.log(`  ✓ ${what}`) } else { fails.push(what); console.log(`  ✗ ${what}`) } }

// ---------- two small projects on disk
const data = mkdtempSync(join(tmpdir(), 'swarm-open-'))
const runs = join(data, 'runs')
mkdirSync(runs)
const T0 = Date.parse('2026-11-01T10:00:00Z')
const id = n => new Date(T0 + n * 3600e3).toISOString().replace(/[:.]/g, '-')
const A1 = id(0), B1 = id(1), B2 = id(2)
function build(run, brief, name, t) {
  const ev = [{ type: 'run:start', t, run, brief, agents: [{ id: 'a0', name: 'Ada', color: '#FF6B6B' }] }]
  ev.push({ type: 'theme', t: t + 10, run, name: 'Plain', direction: '', vars: { '--background': '#111111', '--foreground': '#eeeeee' } })
  const pages = [['home', `${name} Home`], ['more', `${name} More`]]
  pages.forEach(([pid, title], i) => ev.push({ type: 'page', t: t + 20 + i, run, id: pid, title, purpose: '', index: i }))
  pages.forEach(([pid, title], i) => {
    ev.push({ type: 'layer:plan', t: t + 30 + i, run, page: pid, id: 'hero', role: 'hero', height: 400 })
    ev.push({ type: 'agent:assign', t: t + 40 + i, run, agent: 'a0', page: pid, layer: 'hero', role: 'hero' })
    ev.push({ type: 'layer:done', t: t + 1000 + i, run, page: pid, layer: 'hero', agent: 'a0', ms: 900, done: i + 1, planned: 2, html: `<section style="padding:80px;background:#222;color:#eee"><h1>${title}</h1><p>${brief}</p></section>` })
  })
  ev.push({ type: 'plan:done', t: t + 50, run, ms: 50, pages: 2, layers: 2 })
  ev.push({ type: 'run:done', t: t + 2000, run, ms: 2000, planned: 2, done: 2, failed: 0, pages: 2 })
  mkdirSync(join(runs, run))
  writeFileSync(join(runs, run, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
}
build(A1, 'Alpha Tea, a tea subscription for night-shift workers', 'Alpha Tea', T0)
build(B1, 'Bravo Bikes, a bike repair shop', 'Bravo Bikes', T0 + 3600e3)
build(B2, 'Bravo Bikes, a bike repair shop with rentals', 'Bravo Bikes', T0 + 7200e3)
const proj = (runIds, name, made) => ({ runs: runIds, name, title: null, folder: null, trashed: null, made, own: true })
writeFileSync(join(runs, 'folders.json'), JSON.stringify({ v: 2, folders: [], projects: { [A1]: proj([A1], 'Alpha Tea', T0), [B1]: proj([B1, B2], 'Bravo Bikes', T0 + 3600e3) } }))

// ---------- a model that always fails: a build started elsewhere starts, fails and stays the server's run
const fake = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"no model here"}')) })
const fakePort = await freePort()
await new Promise(r => fake.listen(fakePort, '127.0.0.1', r))

const port = await freePort(), TOKEN = 'open-check'
const BASE = `http://127.0.0.1:${port}`
const env = { ...process.env, SWARM_PORT: String(port), SWARM_TOKEN: TOKEN, SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runs, SWARM_OUTPUT_DIR: join(data, 'out'), SWARM_BASE_URL: `http://127.0.0.1:${fakePort}/v1`, SWARM_API_KEY: 'none', SWARM_FEED_URL: 'http://127.0.0.1:9' }
for (const k of ['SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH', 'HERMES_CUSTOM_INFERHUB_API_KEY', 'SWARM_ELEVENLABS_KEY', 'SWARM_TTS_URL']) delete env[k]
const server = spawn(process.execPath, [join(ROOT, 'server/server.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
server.stdout.on('data', d => { log += d })
server.stderr.on('data', d => { log += d })
const api = (path, body) => fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json())
for (let i = 0; i < 100; i++) { if (await fetch(`${BASE}/api/state`).then(r => r.ok, () => false)) break; await wait(150) }

// the third build: started elsewhere before the page opens, so the server replays it to the canvas
const elsewhere = async brief => {
  const out = await api('/api/run', { brief, agents: 2 }).catch(() => ({}))
  for (let i = 0; i < 40; i++) { const st = await api('/api/state').catch(() => ({})); if (st.run === out.run && !st.working) break; await wait(250) }
  return out.run
}
await api('/api/setup', { seen: true }).catch(() => {}) // the one-time Setup sheet stays shut
const C1 = await elsewhere('Neon Alley Nights, a night market after dark')

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.on('pageerror', e => console.log('  page error:', e.message))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.home .card[aria-label="Alpha Tea"]', { timeout: 15000 })

  const state = () => page.evaluate(() => ({
    run: window.swarm.S?.run || null, viewing: window.swarm.viewing,
    frames: window.swarm.S?.frames.map(f => f.title) || [],
    player: !document.getElementById('player').hidden,
    playerPages: [...document.querySelectorAll('#pl-page option')].map(o => o.textContent),
    mode: window.swarmCosmos.mode,
    pill: document.querySelector('.mode-btn .t')?.textContent || '',
    overview: window.swarmCosmos.projectView.run,
    crumb: document.querySelector('.pj-crumb .pj-name')?.textContent?.trim() || ''
  }))
  const settle = async run => { await page.waitForFunction(r => window.swarm.S?.run === r && window.swarm.S.frames.length === 2, run, { timeout: 10000 }).catch(() => {}); await wait(600) }
  const home = async () => {
    await page.click('.pj-crumb .pj-up')
    await page.waitForSelector('.home .card', { timeout: 10000 })
    // Projects comes back on the versions it showed last: up to every project
    if (await page.locator('.home .hm-back').isVisible()) await page.click('.home .hm-back')
    await page.waitForSelector('.home .card[aria-label="Bravo Bikes"]', { timeout: 10000 })
  }
  const shows = async (run, name, what) => {
    const s = await state()
    ok(s.run === run && s.overview === run, `${what}: the canvas and the Overview hold ${name} (${s.run === run ? 'yes' : s.run}, ${s.overview === run ? 'yes' : s.overview})`)
    ok(s.frames.length > 0 && s.frames.every(t => t.startsWith(name)), `${what}: its pages are ${name}'s (${s.frames.join(', ')})`)
    ok(!s.player, `${what}: no player`)
    ok(s.mode === 'project' && s.pill === 'Overview', `${what}: the pill says Overview on the Overview (${s.mode}, ${s.pill})`)
  }

  console.log('open A, play, home, open B')
  await page.click('.home .card[aria-label="Alpha Tea"]')
  await settle(A1)
  await shows(A1, 'Alpha Tea', 'Alpha opened')
  await page.click('#play-btn')
  await page.waitForSelector('#player:not([hidden])', { timeout: 5000 }).catch(() => {})
  ok((await state()).player, 'Play opens the player on Alpha')
  await home()
  ok(!(await state()).player, 'Projects closes the player')
  await page.click('.home .card[aria-label="Bravo Bikes"]') // two versions: the stack opens
  await page.waitForSelector('.home .card[aria-label="Version 2"]', { timeout: 5000 })
  await page.click('.home .card[aria-label="Version 2"]')
  await settle(B2)
  await shows(B2, 'Bravo Bikes', 'Bravo opened')

  console.log('the same through a version tile')
  await page.click('#play-btn')
  await page.waitForSelector('#player:not([hidden])', { timeout: 5000 }).catch(() => {})
  await home()
  await page.click('.home .card[aria-label="Bravo Bikes"]')
  await page.waitForSelector('.home .card[aria-label="Version 1"]', { timeout: 5000 })
  await page.click('.home .card[aria-label="Version 1"]')
  await settle(B1)
  await shows(B1, 'Bravo Bikes', 'Version 1 opened')

  console.log('the stream changes nothing by itself')
  const C2 = await elsewhere('Neon Alley Nights again, from another window')
  await wait(1200)
  await shows(B1, 'Bravo Bikes', `a build started elsewhere (${C2 ? 'started' : 'did not start'})`)
  await page.context().setOffline(true)
  await wait(1500)
  await page.context().setOffline(false)
  await wait(6000) // the stream reconnects (about 3 s) and the server replays its run
  await shows(B1, 'Bravo Bikes', 'the stream reconnected')

  console.log('p on Projects')
  await home()
  await page.locator('.home').click({ position: { x: 640, y: 780 } }).catch(() => {})
  await page.keyboard.press('p')
  await wait(300)
  ok(!(await state()).player, 'p on Projects opens no player behind it')
  await page.click('.home .card[aria-label="Alpha Tea"]')
  await settle(A1)
  await shows(A1, 'Alpha Tea', 'Alpha opened after p')
  void C1
} finally {
  await browser.close()
  server.kill()
  fake.close()
  rmSync(data, { recursive: true, force: true })
}
console.log(`\n${passes} passed, ${fails.length} failed`)
if (fails.length) { console.log(log.split('\n').slice(-20).join('\n')); process.exit(1) }
