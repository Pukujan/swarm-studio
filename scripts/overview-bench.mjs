// The Overview on a 14-page project, measured (spec 36): time to the first picture and to every
// page's picture, opened cold and opened again; the page's CPU while a build lands sections; and the
// frame rate while panning. Not a check: it prints numbers for a PR, before and after a change.
//
//   PLAYWRIGHT_DIR=… CHROMIUM_PATH=… node scripts/overview-bench.mjs [--root <a checkout>] [--runs 3]
//
// --root measures another checkout's server and web (say an export of main), with this fixture.
// The build is played into the page: each section is written to the run's file (so the server's
// versions move as in a real build) and handed to the canvas as the stream would.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const ROOT = resolve(arg('--root', fileURLToPath(new URL('..', import.meta.url))))
const RUNS = Number(arg('--runs', 3))
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: set PLAYWRIGHT_DIR to a folder that has it')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}
const { chromium } = await loadPlaywright()
const wait = ms => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) }) })
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN }

// ---------- a 14-page site, three sections a page, in its own theme
const data = mkdtempSync(join(tmpdir(), 'swarm-bench-'))
const runs = join(data, 'runs')
mkdirSync(runs)
const RUN = '2026-11-02T09-00-00-000Z'
const NAMES = ['Home', 'Menu', 'Rooms', 'Events', 'Gallery', 'About', 'Team', 'Press', 'Journal', 'Gifts', 'Visit', 'Careers', 'Contact', 'FAQ']
const COLORS = ['#1d2b3a', '#2e4057', '#c9a227', '#8c2f39', '#3d5a40', '#5b3a29']
const ROLES = ['hero', 'body', 'footer']
const section = (page, i, role, n = 0) => `<section style="min-height:${role === 'hero' ? 720 : 520}px;padding:72px 96px;background:${COLORS[(page + i + n) % COLORS.length]};color:#f4efe6;font:18px/1.5 Georgia,serif"><h${role === 'hero' ? 1 : 2} style="margin:0 0 24px;font-size:${role === 'hero' ? 64 : 40}px">${NAMES[page]} ${role}${n ? ` (take ${n + 1})` : ''}</h${role === 'hero' ? 1 : 2}><p style="max-width:640px">${'Pier Fourteen keeps its lamps lit past midnight. '.repeat(6)}</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px">${[0, 1, 2].map(k => `<div style="height:160px;border-radius:12px;background:rgba(255,255,255,${0.08 + k * 0.05})"></div>`).join('')}</div></section>`
const ids = NAMES.map(n => n.toLowerCase())
const t0 = Date.parse('2026-11-02T09:00:00Z')
const events = [{ type: 'run:start', t: t0, run: RUN, brief: 'Pier Fourteen, a harbour hotel and bar', agents: [{ id: 'a0', name: 'Ada', color: '#FF6B6B' }, { id: 'a1', name: 'Bo', color: '#F5A623' }] }]
events.push({ type: 'theme', t: t0 + 10, run: RUN, name: 'Harbour', direction: '', vars: { '--background': '#1d2b3a', '--foreground': '#f4efe6' }, colors: ['#1d2b3a', '#c9a227'] })
ids.forEach((id, i) => events.push({ type: 'page', t: t0 + 20 + i, run: RUN, id, title: `Pier Fourteen ${NAMES[i]}`, purpose: '', index: i }))
let done = 0
ids.forEach((pid, i) => ROLES.forEach((role, j) => {
  events.push({ type: 'layer:plan', t: t0 + 100 + i * 3 + j, run: RUN, page: pid, id: role, role, height: role === 'hero' ? 720 : 520 })
  events.push({ type: 'layer:done', t: t0 + 1000 + i * 3 + j, run: RUN, page: pid, layer: role, agent: `a${j % 2}`, ms: 900, done: ++done, planned: 42, html: section(i, j, role) })
}))
events.push({ type: 'plan:done', t: t0 + 90, run: RUN, ms: 90, pages: 14, layers: 42 })
events.push({ type: 'run:done', t: t0 + 5000, run: RUN, ms: 5000, planned: 42, done: 42, failed: 0, pages: 14 })
mkdirSync(join(runs, RUN))
const FILE = join(runs, RUN, 'events.jsonl')
writeFileSync(FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n')
writeFileSync(join(runs, 'folders.json'), JSON.stringify({ v: 2, folders: [], projects: { [RUN]: { runs: [RUN], name: 'Pier Fourteen', title: null, folder: null, trashed: null, made: t0, own: true } } }))

const fake = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"no model here"}')) })
const fakePort = await freePort()
await new Promise(r => fake.listen(fakePort, '127.0.0.1', r))
const port = await freePort(), TOKEN = 'bench'
const BASE = `http://127.0.0.1:${port}`
const env = { ...process.env, SWARM_PORT: String(port), SWARM_TOKEN: TOKEN, SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runs, SWARM_OUTPUT_DIR: join(data, 'out'), SWARM_BASE_URL: `http://127.0.0.1:${fakePort}/v1`, SWARM_API_KEY: 'none', SWARM_FEED_URL: 'http://127.0.0.1:9' }
for (const k of ['SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH', 'HERMES_CUSTOM_INFERHUB_API_KEY', 'SWARM_ELEVENLABS_KEY', 'SWARM_TTS_URL']) delete env[k]
const server = spawn(process.execPath, [join(ROOT, 'server/server.mjs')], { env, stdio: ['ignore', 'ignore', 'ignore'] })
const api = (path, body) => fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json())
for (let i = 0; i < 100; i++) { if (await fetch(`${BASE}/api/state`).then(r => r.ok, () => false)) break; await wait(150) }
await api('/api/setup', { seen: true }).catch(() => {})

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const out = { drawn: [], cold: [], all: [], warm: [], warmAll: [], cpu: [], fpsRest: [], fpsBuild: [], shots: [], panShots: [], curHz: [] }
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // the stream, as the canvas hears it: the bench hands it the build's sections
  await ctx.addInitScript(() => {
    const ES = window.EventSource
    window.__streams = []
    window.EventSource = class extends ES { constructor(...a) { super(...a); window.__streams.push(this) } }
    window.__emit = e => { for (const s of window.__streams) s.onmessage?.({ data: JSON.stringify(e) }) }
    // what the page draws: frames, and the long tasks the main thread ran
    window.__frames = 0
    const tick = () => { window.__frames++; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const taskTime = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value
  // the build's board says it is live while the bench plays it, so the crew work on the Overview
  let live = false
  await page.route(`**/api/runs/${RUN}/board`, async route => {
    const res = await route.fetch()
    const j = await res.json()
    await route.fulfill({ response: res, json: { ...j, live } })
  })
  let shots = 0
  if (process.env.BENCH_DEBUG) page.on('console', m => m.text().startsWith('DBG') && console.log(m.text()))
  page.on('request', r => { if (/\/snaps\?|\/snaps$/.test(r.url()) && r.method() === 'POST') shots++ })
  const address = `${BASE}/?version=${RUN}`
  // ms from navigation to the first page picture, and to all 14
  const pictures = async () => {
    // anything page-shaped on the stage: a skeleton, a title card or a picture
    const drawn = await page.waitForFunction(() => document.querySelector('.pj-stage[aria-label="Overview"] .ab.page') && performance.now(), null, { timeout: 60000, polling: 'raf' }).then(h => h.jsonValue()).catch(() => NaN)
    const first = await page.waitForFunction(() => [...document.querySelectorAll('.pj-stage .ab.page img')].some(im => im.complete && im.naturalWidth) && performance.now(), null, { timeout: 60000, polling: 'raf' }).then(h => h.jsonValue()).catch(() => NaN)
    const all = await page.waitForFunction(n => [...document.querySelectorAll('.pj-stage .ab.page img')].filter(im => im.complete && im.naturalWidth).length >= n && performance.now(), 14, { timeout: 90000, polling: 'raf' }).then(h => h.jsonValue()).catch(() => NaN)
    return { drawn, first, all }
  }
  const fps = async ms => {
    const box = await page.locator('.pj-stage[aria-label="Overview"]').boundingBox()
    const f0 = await page.evaluate(() => window.__frames), w0 = Date.now()
    await page.mouse.move(box.x + box.width - 60, box.y + box.height - 60)
    await page.mouse.down()
    const steps = Math.round(ms / 16)
    for (let i = 0; i < steps; i++) {
      const k = i / steps, a = k * Math.PI * 4
      await page.mouse.move(box.x + box.width / 2 + Math.cos(a) * 300, box.y + box.height / 2 + Math.sin(a) * 200)
    }
    await page.mouse.up()
    return Math.round((await page.evaluate(() => window.__frames) - f0) / ((Date.now() - w0) / 1000))
  }
  // moves a second of each Overview cursor (a move writes left and top), over ms
  const writes = (sel, ms) => page.evaluate(([sel, ms]) => new Promise(r => {
    const root = document.querySelector(sel)
    if (!root) return r(0)
    let n = 0
    const mo = new MutationObserver(m => { n += m.length })
    mo.observe(root, { attributes: true, attributeFilter: ['style'], subtree: true })
    setTimeout(() => { mo.disconnect(); r(Math.round(n / 2 / Math.max(1, root.children.length) / (ms / 1000) * 10) / 10) }, ms)
  }), [sel, ms])
  for (let r = 0; r < RUNS; r++) {
    // a fresh start: no saved pictures yet
    rmSync(join(runs, RUN, 'snaps'), { recursive: true, force: true })
    rmSync(join(runs, RUN, 'img'), { recursive: true, force: true })
    await page.goto(address)
    if (process.env.BENCH_SHOTS && !r) { await page.waitForSelector('.pj-stage .ab.page', { timeout: 10000 }).catch(() => {}); await page.screenshot({ path: join(process.env.BENCH_SHOTS, 'cold.png') }) }
    const cold = await pictures()
    if (process.env.BENCH_DEBUG) console.log(await page.evaluate(() => ({ room: window.swarmCosmos?.nav?.view, body: document.body.className, abs: document.querySelectorAll('.pj-stage .ab').length, imgs: document.querySelectorAll('.pj-stage .ab.page img').length })))
    out.drawn.push(cold.drawn); out.cold.push(cold.first); out.all.push(cold.all)
    await wait(3000) // the pictures are kept
    await page.goto(address)
    const warm = await pictures()
    out.warm.push(warm.first); out.warmAll.push(warm.all)
    await wait(1500)
    out.fpsRest.push(await fps(3000))
    // a build lands a section every 300 ms on every page (another take of each), for 14 s, while you pan
    live = true
    await page.evaluate(() => window.swarmCosmos?.projectView?.show()) // the board again, live
    shots = 0
    const c0 = await taskTime(), w0 = Date.now()
    let n = 0
    const play = (async () => {
      for (const [i, pid] of ids.entries()) for (const [j, role] of ROLES.entries()) {
        if (Date.now() - w0 > 14000) return
        const e = { type: 'layer:done', t: Date.now(), run: RUN, page: pid, layer: role, agent: `a${j % 2}`, ms: 300, done: ++n, planned: 42, html: section(i, j, role, r + 1) }
        appendFileSync(FILE, JSON.stringify(e) + '\n')
        await page.evaluate(x => { window.__emit({ type: 'agent:assign', t: x.t, run: x.run, agent: x.agent, page: x.page, layer: x.layer, role: x.layer }); window.__emit(x) }, e)
        await wait(300)
      }
    })()
    await wait(4000)
    const s0 = shots, cur = writes('.pj-cursors', 3000)
    out.fpsBuild.push(await fps(3000))
    out.curHz.push(await cur)
    out.panShots.push(shots - s0)
    await play
    const left = 14000 - (Date.now() - w0)
    if (left > 0) await wait(left)
    out.cpu.push(Math.round(((await taskTime()) - c0) / ((Date.now() - w0) / 1000) * 100))
    out.shots.push(shots)
    live = false
    await wait(2000)
  }
  // One page's pictures, timed page by page: its small and full picture as two captures (window.swarm.thumb, the
  // path every checkout has), and, where the checkout has it, both from one capture (window.swarm.capture). Each way
  // starts on a fresh load of the Overview, so neither finds the other's caches warm; a page whose frame has not
  // drawn yet is asked again, and only an answer with a picture is timed. The main thread's long tasks are summed.
  // 0.26, not 0.25: thumb hands back a resting page's frozen picture at 0.25 and under, without photographing it.
  const timed = async way => {
    await page.goto(address)
    await pictures()
    await wait(2000)
    return page.evaluate(async ([ids, way]) => {
      const sw = window.swarm
      let long = 0
      const po = new PerformanceObserver(l => { for (const e of l.getEntries()) long += e.duration })
      po.observe({ type: 'longtask' })
      const shoot = way === 'one' ? id => sw.capture(id, [0.25, 0.6]) : async id => { const s = await sw.thumb(id, 0.26); return s && await sw.thumb(id, 0.6) }
      // the library loads once, before anything is timed
      await shoot(ids[0]).catch(() => null)
      long = 0
      const ms = [], parts = []
      for (const id of ids) {
        for (let tries = 0; tries < 20; tries++) {
          const t = performance.now()
          const got = await shoot(id).catch(() => null)
          if (got) { ms.push(performance.now() - t); if (got.ms) parts.push(got.ms); break }
          await new Promise(r => setTimeout(r, 300))
        }
      }
      await new Promise(r => setTimeout(r, 500))
      po.disconnect()
      return { ms, parts, long }
    }, [ids, way])
  }
  out.each = { pair: await timed('pair') }
  if (await page.evaluate(() => !!window.swarm.capture)) out.each.one = await timed('one')
} finally {
  await browser.close()
  server.kill()
  fake.close()
  rmSync(data, { recursive: true, force: true })
}
const ms = x => `${Math.round(x)} ms`
console.log(`Overview, 14 pages, ${RUNS} runs (medians), ${ROOT === resolve(fileURLToPath(new URL('..', import.meta.url))) ? 'this checkout' : ROOT}`)
console.log(`  pages on the stage, opened cold ${ms(median(out.drawn))}`)
console.log(`  first picture, opened cold      ${ms(median(out.cold))}   all 14: ${ms(median(out.all))}`)
console.log(`  first picture, opened again     ${ms(median(out.warm))}   all 14: ${ms(median(out.warmAll))}`)
console.log(`  main thread busy during a build ${median(out.cpu)}%   pictures sent: ${median(out.shots)}`)
console.log(`  frame rate panning, at rest     ${median(out.fpsRest)} fps`)
console.log(`  frame rate panning, building    ${median(out.fpsBuild)} fps   pictures sent while panning: ${median(out.panShots)}`)
console.log(`  each cursor's moves a second, panning during a build  ${median(out.curHz)}`)
const span = xs => `${ms(median(xs))} (${ms(Math.min(...xs))} to ${ms(Math.max(...xs))}, ${xs.length} pages)`
if (out.each?.pair) console.log(`  one page, small + full as two captures  ${span(out.each.pair.ms)}   long tasks: ${ms(out.each.pair.long)}`)
if (out.each?.one) {
  const { ms: each, parts, long } = out.each.one
  console.log(`  one page, both from one capture         ${span(each)}   long tasks: ${ms(long)}`)
  if (parts.length) console.log(`    of which in the page ${ms(median(parts.map(p => p.page)))}, in the worker ${ms(median(parts.map(p => p.resize)))}`)
}
if (process.env.BENCH_JSON) console.log(JSON.stringify(out))
console.log(JSON.stringify(out))
