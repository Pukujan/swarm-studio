// Board gauge (image-first boards, step 1): how heavy a big board is, measured the same way every time, so a
// pull request that makes the boards slower or hungrier fails instead of shipping.
//
//   node scripts/board-gauge.mjs measure <out.json> [--root <tree>] [--runs 3] [--only overview,deck,next]
//   node scripts/board-gauge.mjs compare <base.json> <head.json> [--frame 0.10] [--memory 0.15]
//   (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check)
//
// The fixture is one seeded build: 250 pages, 3 of them still being built (an agent on each), 100 pictures
// (each on its page and on the board's Art), and one film. It is opened on three boards, each run in a fresh
// browser: the Overview (/), the Design deck (/ in room deck) and the Design deck of the next UI (/next/).
// On each, a fixed path of wheel pans and ctrl+wheel zooms is played, and recorded:
//   frame time p50/p95/p99 over the path (frames are not held to 60 Hz, so a frame's time is its work),
//   JS heap after a GC and DOM nodes (CDP Performance.getMetrics), compositing layers (CDP LayerTree),
//   GPU-process memory (a memory-infra dump in a Chrome trace), live frames (iframes), and video players
//   alive with the film playing and after leaving the board (an element still holding its media is a player
//   that was never torn down: pause, remove src, load).
// CI measures the pull request's base and head in the same runner, interleaved, and compare fails when the
// head's median is past the thresholds: p95 frame time +10%, memory (JS heap, DOM nodes, GPU) +15%, and any
// more live frames or players left after teardown. docs/perf/board-gauge.json keeps a baseline to read.
// It starts its own throwaway Studio and never touches the 4319 server or the real data folder.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, crc32 } from 'node:zlib'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d }
const pos = rest.filter((x, i) => !x.startsWith('--') && !rest[i - 1]?.startsWith('--'))
const wait = ms => new Promise(r => setTimeout(r, ms))
const median = xs => { const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null }
const round = (x, d = 1) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d
const MB = b => round(b / 1048576)
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: npm i --no-save playwright, or set PLAYWRIGHT_DIR')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}
const freePort = () => new Promise(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) }) })

// ---------- the fixture: one seeded build
const RUN = '2026-11-03T09-00-00-000Z'
// (GAUGE_PAGES makes a smaller board, to try the gauge itself on a small machine; never in CI)
const PAGES = Number(process.env.GAUGE_PAGES) || 250, LIVE = 3, PICTURES = Math.min(100, Math.floor(PAGES * 0.4))
// mulberry32, so every run draws the same board
const seeded = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 })
// a PNG with no image library: a two-colour gradient, 640×400
function png(rand, w = 640, h = 400) {
  const [a, b] = [0, 1].map(() => [0, 1, 2].map(() => 40 + Math.floor(rand() * 180)))
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1)
    for (let x = 0; x < w; x++) { const k = (x + y) / (w + h); for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(a[c] * (1 - k) + b[c] * k) }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function fixture(runs, base, film) {
  const rand = seeded(0xb0a4d)
  const t0 = Date.parse('2026-11-03T09:00:00Z')
  const dir = join(runs, RUN)
  mkdirSync(join(dir, 'img'), { recursive: true })
  mkdirSync(join(dir, 'video'), { recursive: true })
  writeFileSync(join(dir, 'video', 'promo.mp4'), film)
  const crew = [['a0', 'Ada', '#d4d4d8'], ['a1', 'Bo', '#a1a1aa'], ['a2', 'Cy', '#e4e4e7']]
  const ev = [{ type: 'run:start', t: t0, run: RUN, brief: 'Lantern Row, a night market with 250 stalls', agents: crew.map(([id, name, color]) => ({ id, name, color })) }]
  ev.push({ type: 'theme', t: t0 + 10, run: RUN, name: 'Night', direction: '', vars: { '--background': '#111114', '--foreground': '#ececee', '--primary': '#e4e4e7' } })
  const ids = Array.from({ length: PAGES }, (_, i) => `p${String(i + 1).padStart(3, '0')}`)
  ids.forEach((id, i) => ev.push({ type: 'page', t: t0 + 20 + i, run: RUN, id, title: `Stall ${i + 1}`, purpose: '', index: i }))
  ev.push({ type: 'plan:done', t: t0 + 400, run: RUN, ms: 400, pages: PAGES, layers: PAGES })
  // a picture on every other page of the first 200: written to the run's img folder, used in the page and listed as art
  const pic = i => i % 2 === 0 && i / 2 < PICTURES ? i / 2 + 1 : 0
  ids.forEach((pid, i) => {
    const at = t0 + 500 + i * 20
    ev.push({ type: 'layer:plan', t: t0 + 300 + i, run: RUN, page: pid, id: 'hero', role: 'hero', height: 720 })
    ev.push({ type: 'agent:assign', t: at, run: RUN, agent: crew[i % 3][0], page: pid, layer: 'hero', role: 'hero' })
    // the last three pages are still being built: an agent on each, no section yet
    if (i >= PAGES - LIVE) return
    const n = pic(i)
    if (n) {
      writeFileSync(join(dir, 'img', `${n}.png`), png(rand))
      ev.push({ type: 'image', t: at + 5, run: RUN, page: pid, layer: `${pid}-hero`, gen: 'a', src: `/img/${RUN}/${n}.png`, prompt: `stall ${i + 1}` })
    }
    const bg = `hsl(${Math.floor(rand() * 360)} 30% 18%)`
    ev.push({ type: 'layer:done', t: at + 10, run: RUN, page: pid, layer: 'hero', agent: crew[i % 3][0], ms: 900, done: i + 1, planned: PAGES, html: `<section style="padding:64px 72px;min-height:720px;background:${bg};color:#eee;font:18px/1.5 system-ui"><h1 style="font-size:56px;margin:0 0 16px">Stall ${i + 1}</h1><p style="max-width:640px">Lanterns, noodles and records until two in the morning.</p>${n ? `<img src="${base}/img/${RUN}/${n}.png" width="640" height="400" alt="Stall ${i + 1}">` : ''}</section>` })
  })
  ev.push({ type: 'video:done', t: t0 + 9000, run: RUN, src: `/video/${RUN}/promo.mp4`, seconds: 4 })
  writeFileSync(join(dir, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(join(runs, 'folders.json'), JSON.stringify({ v: 2, folders: [], projects: { [RUN]: { runs: [RUN], name: 'Lantern Row', title: null, folder: null, trashed: null, made: t0, own: true } } }))
}

// ---------- in every page and frame: the frames drawn, and every media element ever attached (held, so that
// one dropped without being torn down still counts)
const PROBE = `(() => {
  window.__ft = null
  let last = 0
  const tick = t => { if (window.__ft && last) window.__ft.push(t - last); last = t; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const media = window.__media = new Set()
  const take = n => { if (n.nodeType !== 1) return; if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') media.add(n); n.querySelectorAll?.('video, audio').forEach(m => media.add(m)) }
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(take) }).observe(document, { childList: true, subtree: true })
  const make = Document.prototype.createElement
  Document.prototype.createElement = function (n, o) { const el = make.call(this, n, o); if (/^(video|audio)$/i.test(n)) media.add(el); return el }
})()`
// players still holding media: not torn down (an emptied one has networkState NETWORK_EMPTY)
const PLAYERS = () => [...(window.__media || [])].filter(m => m.networkState !== m.NETWORK_EMPTY || m.currentSrc).length

const SCENES = [
  { id: 'overview', at: '/?project=RUN&version=RUN', ready: n => document.querySelectorAll('.pj-stage[aria-label="Overview"] .ab.page:not(.wait-in)').length >= n, film: true },
  { id: 'deck', at: '/?project=RUN&version=RUN&room=deck', ready: n => (window.swarm?.S?.frames?.length || 0) >= n },
  { id: 'next', at: '/next/?project=RUN&version=RUN&room=deck', ready: () => !!document.querySelector('[role="region"][aria-label="Canvas"]') && document.querySelectorAll('iframe').length > 0 }
]

async function measure(out, { root, runs: N, only }) {
  const { chromium } = await loadPlaywright()
  const launch = () => chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] })
  // the film: four seconds recorded from a canvas in the browser (Playwright's Chromium plays WebM, not H.264);
  // the server serves it as promo.mp4 and the browser reads what it is
  let film
  {
    const b = await launch()
    const p = await b.newPage()
    film = Buffer.from(await p.evaluate(async () => {
      const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 }), g = c.getContext('2d')
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), parts = []
      rec.ondataavailable = e => parts.push(e.data)
      const done = new Promise(r => { rec.onstop = r })
      rec.start()
      const t0 = performance.now()
      await new Promise(r => { const f = t => { const k = (t - t0) / 4000; g.fillStyle = `hsl(${k * 360} 50% 30%)`; g.fillRect(0, 0, 640, 360); g.fillStyle = '#eee'; g.fillRect(40 + k * 520, 150, 60, 60); if (k < 1) requestAnimationFrame(f); else r() }; requestAnimationFrame(f) })
      rec.stop(); await done
      return [...new Uint8Array(await new Blob(parts).arrayBuffer())]
    }))
    await b.close()
  }
  const data = mkdtempSync(join(tmpdir(), 'swarm-gauge-'))
  const runsDir = join(data, 'runs')
  mkdirSync(runsDir)
  const fake = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"no model here"}')) })
  const fakePort = await freePort()
  await new Promise(r => fake.listen(fakePort, '127.0.0.1', r))
  const port = await freePort(), TOKEN = 'gauge', BASE = `http://127.0.0.1:${port}`
  fixture(runsDir, BASE, film)
  const env = { ...process.env, SWARM_PORT: String(port), SWARM_TOKEN: TOKEN, SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runsDir, SWARM_OUTPUT_DIR: join(data, 'out'), SWARM_BASE_URL: `http://127.0.0.1:${fakePort}/v1`, SWARM_API_KEY: 'none', SWARM_FEED_URL: 'http://127.0.0.1:9' }
  for (const k of ['SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH', 'HERMES_CUSTOM_INFERHUB_API_KEY', 'SWARM_ELEVENLABS_KEY', 'SWARM_TTS_URL']) delete env[k]
  const server = spawn(process.execPath, [join(root, 'server/server.mjs')], { env, stdio: ['ignore', 'ignore', 'ignore'] })
  const result = { root, runs: N, fixture: { pages: PAGES, live: LIVE, pictures: PICTURES, films: 1 }, scenes: {} }
  try {
    for (let i = 0; i < 100; i++) { if (await fetch(`${BASE}/api/state`).then(r => r.ok, () => false)) break; await wait(150) }
    await fetch(`${BASE}/api/setup`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: JSON.stringify({ seen: true }) }).catch(() => {})
    for (let r = 0; r < N; r++) for (const sc of SCENES.filter(s => !only.length || only.includes(s.id))) {
      // a fresh browser and no saved pictures each time: every run starts from the same place
      rmSync(join(runsDir, RUN, 'snaps'), { recursive: true, force: true })
      const browser = await launch()
      // a page that crashes (out of memory, most likely) is a result, not the end of the gauge
      let m
      try { m = await scene(browser, sc, BASE) } catch (e) { m = { crashed: true, error: String(e?.message || e).split(/\r?\n/)[0].slice(0, 200) } } finally { await browser.close().catch(() => {}) }
      ;(result.scenes[sc.id] ||= { runs: [] }).runs.push(m)
      console.log(`· ${sc.id} run ${r + 1}: ${JSON.stringify(m)}`)
    }
  } finally {
    server.kill()
    fake.close()
    rmSync(data, { recursive: true, force: true })
  }
  for (const s of Object.values(result.scenes)) medians(s)
  writeFileSync(out, JSON.stringify(result, null, 1))
  print(result)
}

async function scene(browser, sc, BASE) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  await ctx.addInitScript(PROBE)
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const t0 = Date.now()
  await page.goto(BASE + sc.at.replace(/RUN/g, RUN), { waitUntil: 'load' })
  const ready = await page.waitForFunction(sc.ready, PAGES, { timeout: 90000, polling: 250 }).then(() => Date.now() - t0, () => null)
  // the board settles: its pictures and frames load; then the film plays where a person plays it
  await wait(5000)
  // (from its row in the Files list: on a 250-page board its tile is far off the stage)
  let filmPlaying = null
  if (sc.film) {
    await page.click('.pj-list .row[data-key="film:0"]', { timeout: 10000 }).catch(() => {})
    await page.waitForSelector('.pj-insp video', { timeout: 10000 }).catch(() => {})
    await page.evaluate(() => { const v = document.querySelector('.pj-insp video'); if (v) { v.muted = true; v.loop = true; return v.play().catch(() => {}) } })
    await wait(1500)
    filmPlaying = await page.evaluate(() => { const v = document.querySelector('.pj-insp video'); return v && !v.paused && v.readyState >= 2 && v.currentTime > 0 ? 1 : 0 })
  }
  // the path: pan right and down, zoom out to see it all, zoom in on a corner, pan back; the same every time
  const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await page.mouse.move(box.w / 2, box.h / 2)
  await page.evaluate(() => { window.__ft = [] })
  const steps = [...Array(30)].map(() => [0, 40, 80, false]).concat([...Array(12)].map(() => [0, 0, 120, true]), [...Array(16)].map(() => [0, 0, -90, true]), [...Array(30)].map(() => [0, -40, -80, false]))
  for (const [, dx, dy, zoom] of steps) {
    if (zoom) await page.keyboard.down('Control')
    await page.mouse.wheel(dx, dy)
    if (zoom) await page.keyboard.up('Control')
    await wait(30)
  }
  await wait(500)
  const ft = await page.evaluate(() => { const f = window.__ft || []; window.__ft = null; return f })
  // memory once the path is done, after a GC
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
  const metric = async name => (await cdp.send('Performance.getMetrics')).metrics.find(x => x.name === name)?.value ?? null
  const heap = await metric('JSHeapUsedSize'), nodes = await metric('Nodes')
  const layers = await layerCount(cdp)
  const gpu = await gpuMemory(browser)
  const frames = page.frames()
  const iframes = frames.length - 1
  const playersOf = async () => { let n = 0; for (const f of page.frames()) n += await f.evaluate(PLAYERS).catch(() => 0); return n }
  const players = await playersOf()
  // leaving the board for Projects (the Studio's own move): what it leaves behind
  let after = null
  if (sc.id !== 'next') {
    await page.evaluate(() => window.swarmCosmos?.nav?.go?.({ type: 'home' }))
    await wait(2000)
    after = await playersOf()
  }
  await ctx.close()
  return { readyMs: ready, filmPlaying, frames: ft.length, frame: { p50: round(pct(ft, 0.5)), p95: round(pct(ft, 0.95)), p99: round(pct(ft, 0.99)) }, jsHeapMB: MB(heap), nodes, layers, gpuMB: gpu?.process ?? null, gpuAllocMB: gpu?.alloc ?? null, iframes, players, playersAfter: after }
}

async function layerCount(cdp) {
  const got = new Promise(r => { cdp.once('LayerTree.layerTreeDidChange', e => r(e.layers?.length ?? null)); setTimeout(() => r(null), 3000) })
  await cdp.send('LayerTree.enable').catch(() => {})
  const n = await got
  await cdp.send('LayerTree.disable').catch(() => {})
  return n
}

// GPU memory from a memory-infra dump: the GPU process's private footprint, and every process's 'gpu' allocator
async function gpuMemory(browser) {
  const cdp = await browser.newBrowserCDPSession()
  const events = []
  cdp.on('Tracing.dataCollected', e => events.push(...e.value))
  const complete = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  try {
    await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' })
    await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' })
    await cdp.send('Tracing.end')
    await Promise.race([complete, wait(10000)])
  } catch { return null } finally { await cdp.detach().catch(() => {}) }
  const name = new Map(events.filter(e => e.ph === 'M' && e.name === 'process_name').map(e => [e.pid, e.args?.name || '']))
  const hex = v => typeof v === 'string' ? parseInt(v, 16) : Number(v) || 0
  const dumps = events.filter(e => e.ph === 'v' && e.args?.dumps)
  // a process writes its totals and its allocators in separate dump events
  const gpuPid = [...name].find(([, n]) => /^gpu process$/i.test(n))?.[0]
  const totals = dumps.find(d => d.pid === gpuPid && d.args.dumps.process_totals)?.args.dumps.process_totals
  let alloc = 0
  for (const d of dumps) alloc += hex(d.args.dumps.allocators?.gpu?.attrs?.size?.value)
  return { process: totals ? MB(hex(totals.private_footprint_bytes) || hex(totals.resident_set_bytes)) : null, alloc: MB(alloc) }
}

function print(r) {
  console.log(`\nBoard gauge, ${r.fixture.pages} pages (${r.fixture.live} being built), ${r.fixture.pictures} pictures, ${r.fixture.films} film; ${r.runs} runs, medians`)
  for (const [id, s] of Object.entries(r.scenes)) {
    const m = s.median
    if (!m.frame) { console.log(`  ${id.padEnd(8)} crashed in every run (${s.runs[0]?.error})`); continue }
    console.log(`  ${id.padEnd(8)} frame p50/p95/p99 ${m.frame.p50}/${m.frame.p95}/${m.frame.p99} ms · JS heap ${m.jsHeapMB} MB · ${m.nodes} nodes · ${m.layers} layers · GPU process ${m.gpuMB ?? '?'} MB (gpu allocators ${m.gpuAllocMB ?? '?'} MB) · ${m.iframes} frames · players ${m.players}${m.playersAfter == null ? '' : `, ${m.playersAfter} after leaving`} ${m.filmPlaying == null ? '' : m.filmPlaying ? ' · film playing' : ' · film did not play'} · ready in ${m.readyMs} ms${m.crashes ? ` · crashed in ${m.crashes} of ${s.runs.length} runs` : ''}`)
  }
}

// a regression: the head's median past the threshold, for each scene measured on both sides
// (several measure files a side, comma-separated: their runs are pooled; CI interleaves base and head)
const medians = s => {
  const ok = s.runs.filter(r => !r.crashed), first = ok[0] || {}
  s.median = { ...Object.fromEntries(Object.keys(first).map(k => [k, typeof first[k] === 'object' && first[k] ? Object.fromEntries(Object.keys(first[k]).map(q => [q, median(ok.map(x => x[k]?.[q]))])) : median(ok.map(x => x[k]))])), crashes: s.runs.length - ok.length }
  return s
}
function pool(files) {
  const all = files.split(',').map(f => JSON.parse(readFileSync(resolve(f), 'utf8')))
  const out = { ...all[0], runs: all.reduce((n, r) => n + r.runs, 0), scenes: {} }
  for (const r of all) for (const [id, s] of Object.entries(r.scenes)) (out.scenes[id] ||= { runs: [] }).runs.push(...s.runs)
  for (const s of Object.values(out.scenes)) medians(s)
  return out
}
function compare(a, b, frameT, memT) {
  const A = pool(a), B = pool(b)
  print(A); print(B)
  const fails = []
  for (const id of Object.keys(B.scenes)) {
    const x = A.scenes[id]?.median, y = B.scenes[id].median
    if (!x) { console.log(`  ${id}: not on the base, not compared`); continue }
    const row = []
    const over = (what, k, t, get = m => m[k]) => {
      const p = get(x), q = get(y)
      if (p == null || q == null) return row.push(`${what} n/a`)
      const bad = t == null ? q > p : q > p * (1 + t)
      row.push(`${what} ${p} → ${q}${bad ? ' ✗' : ''}`)
      if (bad) fails.push(`${id}: ${what} ${p} → ${q} (${t == null ? 'no more than the base' : `over +${Math.round(t * 100)}%`})`)
    }
    over('crashes', 'crashes', null)
    // the film plays on a board that has one, or its players are not measured
    if (y.filmPlaying === 0) { row.push('film did not play ✗'); fails.push(`${id}: the film did not play, so its players were not measured`) }
    over('frame p95 ms', 'p95', frameT, m => m.frame?.p95)
    over('JS heap MB', 'jsHeapMB', memT)
    over('DOM nodes', 'nodes', memT)
    over('GPU MB', 'gpuMB', memT)
    over('live frames', 'iframes', null)
    over('players after leaving', 'playersAfter', null)
    console.log(`${fails.some(f => f.startsWith(`${id}:`)) ? '✗' : '✓'} ${id}: ${row.join(' · ')}`)
  }
  if (fails.length) { console.log(`\n${fails.join('\n')}`); process.exit(1) }
  console.log('\nNo board got slower or heavier.')
}

if (cmd === 'measure' && pos[0]) await measure(resolve(pos[0]), { root: resolve(flag('root', fileURLToPath(new URL('..', import.meta.url)))), runs: Number(flag('runs', 3)), only: (flag('only', '') || '').split(',').filter(Boolean) })
else if (cmd === 'compare' && pos[1]) compare(pos[0], pos[1], Number(flag('frame', 0.10)), Number(flag('memory', 0.15)))
else { console.log('node scripts/board-gauge.mjs measure <out.json> [--root <tree>] [--runs 3] [--only a,b] | compare <base.json> <head.json>'); process.exit(2) }
