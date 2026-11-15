// Board gauge (image-first boards, step 1): how heavy a big board is, measured the same way every time, so a
// pull request that makes the boards slower or hungrier fails instead of shipping.
//
//   node scripts/board-gauge.mjs measure <out.json> [--root <tree>] [--runs 3] [--only overview,deck,next] [--cold]
//   node scripts/board-gauge.mjs compare <base.json> <head.json> [--memory 0.15] [--gate-frame 1.15 | --no-gate-frame]
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
// Every board is fitted to one camera before the path (its own "fit everything": the Overview's Frame all, the
// classic deck's 0, the next deck's fit button), and the path starts once that camera has stopped moving, so base
// and head are measured from the same view; a board whose camera goes somewhere else on its own (Follow framing
// the crew) would otherwise show up as a change in frame time.
// CI measures the pull request's base and head in the same runner, interleaved, and compare FAILS on what the
// runner's speed cannot change: more live frames, a player left after teardown, a film that did not play, a crash,
// and the memory of the board: JS heap, GPU memory, DOM nodes, layers (thresholds below).
// The board's main-thread WORK is gated too, in a form the runner's speed cannot move (see FRAME_STAT below): the
// time the browser's main thread spent in tasks over the path, divided by a CPU calibration made in the same
// recording, the head over the base of each interleaved pair, the median of the pairs, failing past 1.15 (--gate-frame
// <ratio> changes it, --no-gate-frame turns it off). Single frames' percentiles (p50/p95/p99) are printed and never
// failed on: on CI one Overview p95 of the same code moved from 4 to 15 ms (docs/perf/README.md).
// It starts its own throwaway Studio and never touches the 4319 server or the real data folder.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync, crc32 } from 'node:zlib'
import { startStudio, onFreePort } from './studio-child.mjs'

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
// every wait on the browser is bounded: a page or a CDP call that never answers fails its scene, named, instead
// of holding the machine's job queue (a run hung for half an hour on Windows with nothing bounded)
const within = (what, ms, p) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(`${what}: no answer in ${ms / 1000} s`)), ms) })]).finally(() => clearTimeout(t)) }

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
// players still holding media: not torn down. An emptied one (pause, remove src, load) has networkState
// NETWORK_EMPTY; its currentSrc is no sign either way, since Chromium keeps the last address after the load
const PLAYERS = () => [...(window.__media || [])].filter(m => m.networkState !== m.NETWORK_EMPTY).length

// fit: what a person does to see everything; cam: the element whose transform is the camera
const SCENES = [
  { id: 'overview', at: '/?project=RUN&version=RUN', ready: n => document.querySelectorAll('.pj-stage[aria-label="Overview"] .ab.page:not(.wait-in)').length >= n, film: true,
    fit: page => page.click('button[aria-label="Frame all"]', { timeout: 15000 }), cam: '.pj-world' },
  { id: 'deck', at: '/?project=RUN&version=RUN&room=deck', ready: n => (window.swarm?.S?.frames?.length || 0) >= n,
    // the 0 key frames every page and turns Follow off (web/canvas/loop.js); not typed into the chat
    fit: async page => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('0') }, cam: '#world' },
  { id: 'next', at: '/next/?project=RUN&version=RUN&room=deck', ready: n => !!document.querySelector('[role="region"][aria-label="Canvas"]') && document.querySelectorAll('iframe').length >= n,
    fit: page => page.getByRole('button', { name: /fit every page/i }).click({ timeout: 15000 }), cam: '[role="region"][aria-label="Canvas"] [style*="scale("]' }
]

// Every page's two snapshots, saved on the server as they are for a project that has been opened before: the Overview
// then paints from them and photographs nothing. Without them it photographs the pages in view while the path is
// played, in idle time, a different amount of work in whichever frames it lands in: one p95 of the same code went
// from 4 to 15 ms in a single CI job. The pictures are JPEGs made here at the two sizes the Overview keeps (a small
// one of 360 px and a full one of 864), so decoding costs what it does for a real photograph.
async function seedSnaps(launch, BASE, TOKEN) {
  const browser = await within('launching Chromium', 60000, launch())
  try {
    const page = await within('a page for the pictures', 30000, browser.newPage())
    const pic = await within('making the pictures', 30000, page.evaluate(() => {
      const make = (w, h) => {
        const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = c.getContext('2d')
        const k = g.createLinearGradient(0, 0, w, h)
        k.addColorStop(0, '#2e4057'); k.addColorStop(1, '#c9a227')
        g.fillStyle = k; g.fillRect(0, 0, w, h)
        g.fillStyle = '#eee'
        for (let i = 0; i < 12; i++) g.fillRect(w * 0.08, h * (0.08 + i * 0.075), w * (0.3 + 0.4 * ((i * 37) % 10) / 10), h * 0.03)
        return c.toDataURL('image/jpeg', 0.82)
      }
      return { s: make(360, 225), f: make(864, 540) }
    }))
    const api = (path, body) => within(path, 30000, fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json()))
    const { pages } = await api(`/api/runs/${RUN}/snaps`)
    for (const [id, d] of Object.entries(pages)) for (const size of ['s', 'f']) {
      const out = await api(`/api/runs/${RUN}/snaps`, { page: id, v: d.v, size, image: pic[size] })
      if (!out.ok) throw new Error(`saving ${id} ${size}: ${JSON.stringify(out)}`)
    }
    const after = await api(`/api/runs/${RUN}/snaps`)
    const saved = Object.values(after.pages).filter(d => d.s && d.f).length
    if (saved !== PAGES) throw new Error(`${saved} of ${PAGES} pages have their snapshots`)
  } finally { await within('closing Chromium', 30000, browser.close()).catch(() => {}) }
}

async function measure(out, { root, runs: N, only, cold }) {
  const { chromium } = await loadPlaywright()
  const launch = () => chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] })
  // the film: four seconds recorded from a canvas in the browser (Playwright's Chromium plays WebM, not H.264);
  // the server serves it as promo.mp4 and the browser reads what it is
  let film
  {
    const b = await within('launching Chromium', 60000, launch())
    const p = await within('a page for the film', 30000, b.newPage())
    film = Buffer.from(await within('recording the film', 60000, p.evaluate(async () => {
      const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 }), g = c.getContext('2d')
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), parts = []
      rec.ondataavailable = e => parts.push(e.data)
      const done = new Promise(r => { rec.onstop = r })
      rec.start()
      const t0 = performance.now()
      await new Promise(r => { const f = t => { const k = (t - t0) / 4000; g.fillStyle = `hsl(${k * 360} 50% 30%)`; g.fillRect(0, 0, 640, 360); g.fillStyle = '#eee'; g.fillRect(40 + k * 520, 150, 60, 60); if (k < 1) requestAnimationFrame(f); else r() }; requestAnimationFrame(f) })
      rec.stop(); await done
      return [...new Uint8Array(await new Blob(parts).arrayBuffer())]
    })))
    await within('closing Chromium', 30000, b.close()).catch(() => {})
  }
  const data = mkdtempSync(join(tmpdir(), 'swarm-gauge-'))
  const runsDir = join(data, 'runs')
  mkdirSync(runsDir)
  // the classic Studio at `/`, as the gauge measures it (decision 0024: `/` is the next UI unless the person chose it)
  writeFileSync(join(data, 'ui.json'), JSON.stringify({ ui: 'classic' }))
  const fake = createServer((req, res) => { req.resume(); req.on('end', () => res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"no model here"}')) })
  // on a port the system picks and the fake keeps (asked for and let go, another process could take it first)
  await new Promise(r => fake.listen(0, '127.0.0.1', r))
  const fakePort = fake.address().port
  const TOKEN = 'gauge'
  const env = { ...process.env, SWARM_TOKEN: TOKEN, SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runsDir, SWARM_OUTPUT_DIR: join(data, 'out'), SWARM_BASE_URL: `http://127.0.0.1:${fakePort}/v1`, SWARM_API_KEY: 'none', SWARM_FEED_URL: 'http://127.0.0.1:9' }
  // GAUGE_REQLOG: the server says each request as it arrives (scripts/gauge-reqlog.mjs), for finding what hung it
  if (process.env.GAUGE_REQLOG) env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --import=${pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'gauge-reqlog.mjs')).href}`.trim()
  for (const k of ['SWARM_PORT', 'SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH', 'HERMES_CUSTOM_INFERHUB_API_KEY', 'SWARM_ELEVENLABS_KEY', 'SWARM_TTS_URL']) delete env[k]
  // The fixture's pictures carry the server's address, so the port is picked before the server starts; when
  // another process took it in between, the fixture is written and the server started again on another
  // (scripts/studio-child.mjs)
  const { child: server, base: BASE, log: serverLog } = await onFreePort(port => { fixture(runsDir, `http://127.0.0.1:${port}`, film); return startStudio({ root, env, port, show: !!process.env.GAUGE_SHOW }) })
  studio = server
  const result = { root, runs: N, fixture: { pages: PAGES, live: LIVE, pictures: PICTURES, films: 1, filmBytes: film.length }, scenes: {} }
  try {
    await fetch(`${BASE}/api/setup`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: JSON.stringify({ seen: true }) }).catch(() => {})
    if (!cold) await seedSnaps(launch, BASE, TOKEN)
    for (let r = 0; r < N; r++) for (const sc of SCENES.filter(s => !only.length || only.includes(s.id))) {
      // a fresh browser each time; the pictures are saved (seedSnaps) unless --cold asks for none, which
      // makes the Overview photograph them while the path is played
      if (cold) rmSync(join(runsDir, RUN, 'snaps'), { recursive: true, force: true })
      const browser = await within('launching Chromium', 60000, launch())
      // a page that crashes (out of memory, most likely) or stops answering is a result, not the end of the gauge
      let m
      try { m = await within(`the ${sc.id} board`, 300000, scene(browser, sc, BASE)) } catch (e) {
        // whether the Studio's server still answers says which side is stuck, the server or the page
        const t0 = Date.now()
        const answer = await within('the server', 8000, fetch(`${BASE}/api/state`).then(r => r.status)).then(s => `answers ${s} in ${Date.now() - t0} ms`, e => `does not answer (${String(e?.message || e).slice(0, 60)})`)
        const alive = server.exitCode === null && server.signalCode === null ? 'running' : `exited (code ${server.exitCode}, signal ${server.signalCode})`
        // and what it is doing (where `ps` exists): its CPU and memory, and the commands of its children, which is
        // what a server blocked on a synchronous child process is waiting for
        let ps = ''
        try { ps = execFileSync('ps', ['-o', '%cpu=,rss=', '-p', String(server.pid)], { encoding: 'utf8', timeout: 3000 }).trim() } catch {}
        try { ps += `; children: ${execFileSync('ps', ['-A', '-o', 'ppid=,pid=,etime=,command='], { encoding: 'utf8', timeout: 5000, maxBuffer: 2e7 }).split('\n').filter(l => l.trim().split(/\s+/)[0] === String(server.pid)).map(l => l.trim().slice(0, 220)).join(' | ') || 'none'}` } catch {}
        m = { crashed: true, error: String(e?.message || e).split(/\r?\n/)[0].slice(0, 200), server: `${alive}; ${answer}`, ps, log: serverLog().trim().split('\n').slice(-14).map(l => l.slice(0, 160)) }
      } finally { await within('closing Chromium', 30000, browser.close()).catch(() => {}) }
      ;(result.scenes[sc.id] ||= { runs: [] }).runs.push(m)
      console.log(`· ${sc.id} run ${r + 1}: ${JSON.stringify({ ...m, ft: undefined })}`)
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
  // The Studio asks for the build's story when it opens one with a film, and the server answers by exporting the
  // whole site first: a headless Chrome run, synchronously, for each page with no picture (about 4 s each; here 150
  // of 250), which freezes the server for minutes. It has nothing to do with the board's frames, so it is not asked.
  await page.route(url => /^\/api\/runs\/[^/]+\/story(\/|$)/.test(url.pathname), route => route.fulfill({ status: 200, json: {} }))
  const cdp = await ctx.newCDPSession(page)
  await within('Performance.enable', 15000, cdp.send('Performance.enable'))
  const t0 = Date.now()
  await page.goto(BASE + sc.at.replace(/RUN/g, RUN), { waitUntil: 'load', timeout: 60000 })
  const ready = await page.waitForFunction(sc.ready, PAGES, { timeout: 90000, polling: 250 }).then(() => Date.now() - t0, () => null)
  // the board settles: its pictures and frames load until its DOM stops growing (the same node count for 2 s,
  // read every 500 ms); a fixed wait caught /next/ part-way through mounting its pages in some runs
  const nodesNow = async () => (await within('Performance.getMetrics', 15000, cdp.send('Performance.getMetrics'))).metrics.find(x => x.name === 'Nodes')?.value
  for (let last = -1, same = 0, i = 0; i < 120 && same < 4; i++) { await wait(500); const n = await nodesNow(); same = n === last ? same + 1 : 0; last = n }
  // then the film plays where a person plays it (from its row in the Files list: on a 250-page board its tile
  // is far off the stage), and the gauge waits until it is playing, not for a fixed time
  let filmPlaying = null, filmWhy = null
  if (sc.film) {
    const clicked = await page.click('.pj-list .row[data-key="film:0"]', { timeout: 30000 }).then(() => true, e => String(e.message).split(/\r?\n/)[0])
    await page.waitForSelector('.pj-insp video', { timeout: 30000 }).catch(() => {})
    // a board video holds no player until it is hovered, focused or pressed (web/video.js): the pointer goes
    // over it, as a person's does, and it plays once it has its source
    const hovered = await page.hover('.pj-insp video', { timeout: 15000 }).then(() => true, e => String(e.message).split(/\r?\n/)[0])
    await page.waitForFunction(() => !!document.querySelector('.pj-insp video')?.currentSrc, null, { timeout: 15000, polling: 100 }).catch(() => {})
    const played = await within('playing the film', 15000, page.evaluate(() => { const v = document.querySelector('.pj-insp video'); if (!v) return 'no video'; v.muted = true; v.loop = true; return v.play().then(() => 'ok', e => `play: ${e.name} ${e.message}`) })).catch(e => e.message)
    filmPlaying = await page.waitForFunction(() => { const v = document.querySelector('.pj-insp video'); return v && !v.paused && v.readyState >= 2 && v.currentTime > 0 }, null, { timeout: 30000, polling: 100 }).then(() => 1, () => 0)
    // when it did not play, where it stopped: the Files row, the inspector, or the media itself
    if (!filmPlaying) filmWhy = { clicked, hovered, played, ...await within('reading the film', 15000, page.evaluate(() => { const v = document.querySelector('.pj-insp video'); return { row: !!document.querySelector('.pj-list .row[data-key="film:0"]'), sel: window.swarmCosmos?.projectView ? document.querySelector('.pj-list .row.on')?.dataset.key || null : null, video: !!v, src: v?.currentSrc || v?.getAttribute('src') || null, readyState: v?.readyState ?? null, networkState: v?.networkState ?? null, error: v?.error ? `${v.error.code} ${v.error.message}` : null } })).catch(e => ({ read: e.message })) }
  }
  // every board starts from the same view: fitted, and the camera still for 1.5 s (it glides there, and Follow, where
  // it is on, moves it again as the crew work); what it settled on is recorded
  await within('fitting the board', 30000, sc.fit(page)).catch(() => {})
  let camera = '', still = 0
  for (let i = 0; i < 60 && still < 5; i++) {
    await wait(300)
    const now = await within('reading the camera', 10000, page.evaluate(sel => document.querySelector(sel)?.style.transform || '', sc.cam)).catch(() => '')
    still = now && now === camera ? still + 1 : 0
    camera = now
  }
  // the path: pan right and down, zoom out to see it all, zoom in on a corner, pan back; the same every time. It is
  // played twice and the second pass is the one recorded: the first one makes the board do what it does only the
  // first time it is moved (decoding the pictures it shows, laying out what comes into view), which is most of the
  // slow frames of a single pass and lands in them by timing, not by the code
  const box = await within('the window size', 15000, page.evaluate(() => ({ w: innerWidth, h: innerHeight })))
  await page.mouse.move(box.w / 2, box.h / 2)
  const steps = [...Array(30)].map(() => [0, 40, 80, false]).concat([...Array(12)].map(() => [0, 0, 120, true]), [...Array(16)].map(() => [0, 0, -90, true]), [...Array(30)].map(() => [0, -40, -80, false]))
  const walk = async () => {
    for (const [, dx, dy, zoom] of steps) {
      if (zoom) await page.keyboard.down('Control')
      await within('a wheel step', 15000, page.mouse.wheel(dx, dy))
      if (zoom) await page.keyboard.up('Control')
      await wait(30)
    }
    await wait(500)
  }
  // the browser's own counters (CDP Performance.getMetrics) and how fast this machine runs a fixed piece of script
  // right now: the best of five runs of the same loop. Counts of layouts and style recalculations do not depend on how
  // fast the machine is; the times and the loop do, and say by how much
  const counters = async () => Object.fromEntries((await within('Performance.getMetrics', 15000, cdp.send('Performance.getMetrics'))).metrics.map(x => [x.name, x.value]))
  const calibrate = () => within('the calibration', 20000, page.evaluate(() => { let best = Infinity; for (let k = 0; k < 5; k++) { const t = performance.now(); let x = 0; for (let i = 0; i < 3e6; i++) x += Math.sqrt(i) * 1.0001; if (x < 0) console.log(x); best = Math.min(best, performance.now() - t) } return best }))
  await walk()
  await wait(1500)
  const c0 = await counters(), speed0 = await calibrate()
  await within('starting the frame count', 15000, page.evaluate(() => { window.__ft = [] }))
  await walk()
  const ft = await within('reading the frame times', 15000, page.evaluate(() => { const f = window.__ft || []; window.__ft = null; return f }))
  const c1 = await counters(), speed1 = await calibrate()
  const d = k => (c1[k] ?? 0) - (c0[k] ?? 0)
  // memory once the path is done, after a GC
  await within('HeapProfiler.collectGarbage', 30000, cdp.send('HeapProfiler.collectGarbage')).catch(() => {})
  const metric = async name => (await within('Performance.getMetrics', 15000, cdp.send('Performance.getMetrics'))).metrics.find(x => x.name === name)?.value ?? null
  const heap = await metric('JSHeapUsedSize'), nodes = await metric('Nodes')
  const layers = await layerCount(cdp)
  const gpu = await within('the memory dump', 45000, gpuMemory(browser)).catch(() => null)
  const frames = page.frames()
  const iframes = frames.length - 1
  // (each frame asked on its own clock: one page that stopped answering is skipped, not waited on)
  const playersOf = async () => { let n = 0; for (const f of page.frames()) n += await within("a frame's players", 5000, f.evaluate(PLAYERS)).catch(() => 0); return n }
  const players = await playersOf()
  // leaving the board for Projects (the Studio's own move): what it leaves behind
  let after = null
  if (sc.id !== 'next') {
    await within('leaving the board', 15000, page.evaluate(() => window.swarmCosmos?.nav?.go?.({ type: 'home' })))
    await wait(2000)
    after = await playersOf()
  }
  await within('closing the page', 30000, ctx.close()).catch(() => {})
  // (the frame times themselves too, to the 0.1 ms: compare takes its percentiles over every run's frames)
  return { readyMs: ready, camera, filmPlaying, filmWhy, ft: ft.map(x => round(x)), frames: ft.length, frame: { p50: round(pct(ft, 0.5)), p95: round(pct(ft, 0.95)), p99: round(pct(ft, 0.99)) }, calibMs: round(Math.min(speed0, speed1), 2), layouts: d('LayoutCount'), restyles: d('RecalcStyleCount'), scriptMs: round(d('ScriptDuration') * 1000), layoutMs: round(d('LayoutDuration') * 1000), styleMs: round(d('RecalcStyleDuration') * 1000), taskMs: round(d('TaskDuration') * 1000), jsHeapMB: MB(heap), nodes, layers, gpuMB: gpu?.process ?? null, gpuAllocMB: gpu?.alloc ?? null, iframes, players, playersAfter: after }
}

async function layerCount(cdp) {
  const got = new Promise(r => { cdp.once('LayerTree.layerTreeDidChange', e => r(e.layers?.length ?? null)); setTimeout(() => r(null), 3000) })
  await within('LayerTree.enable', 15000, cdp.send('LayerTree.enable')).catch(() => {})
  const n = await got
  await within('LayerTree.disable', 15000, cdp.send('LayerTree.disable')).catch(() => {})
  return n
}

// GPU memory from a memory-infra dump: the GPU process's private footprint, and every process's 'gpu' allocator
async function gpuMemory(browser) {
  const cdp = await browser.newBrowserCDPSession()
  const events = []
  cdp.on('Tracing.dataCollected', e => events.push(...e.value))
  const complete = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  try {
    await within('Tracing.start', 15000, cdp.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' }))
    await within('Tracing.requestMemoryDump', 20000, cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' }))
    await within('Tracing.end', 15000, cdp.send('Tracing.end'))
    await Promise.race([complete, wait(10000)])
  } catch { return null } finally { await within('detaching', 5000, cdp.detach()).catch(() => {}) }
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
    console.log(`  ${id.padEnd(8)} frame p50/p95/p99 ${m.frame.p50}/${m.frame.p95}/${m.frame.p99} ms · JS heap ${m.jsHeapMB} MB · ${m.nodes} nodes · ${m.layers} layers · GPU process ${m.gpuMB ?? '?'} MB (gpu allocators ${m.gpuAllocMB ?? '?'} MB) · ${m.iframes} frames · players ${m.players}${m.playersAfter == null ? '' : `, ${m.playersAfter} after leaving`}${m.filmPlaying == null ? '' : m.filmPlaying ? ' · film playing' : ' · film did not play'} · ready in ${m.readyMs} ms${m.crashes ? ` · crashed in ${m.crashes} of ${s.runs.length} runs` : ''}`)
  }
}

// a regression: the head's median past the threshold, for each scene measured on both sides
// (several measure files a side, comma-separated: their runs are pooled; CI interleaves base and head)
// the frame percentiles are taken over every run's frames together (one run's p95 of a few ms moves more than
// 10% on the same code); the rest is each run's number, the median of them
const medians = s => {
  const ok = s.runs.filter(r => !r.crashed), first = ok[0] || {}
  const keys = Object.keys(first).filter(k => !['ft', 'frame', 'filmWhy'].includes(k))
  const ft = ok.flatMap(r => r.ft || [])
  s.median = { ...Object.fromEntries(keys.map(k => [k, median(ok.map(x => x[k]))])), frame: ft.length ? { p50: pct(ft, 0.5), p95: pct(ft, 0.95), p99: pct(ft, 0.99) } : null, crashes: s.runs.length - ok.length }
  return s
}
function pool(files) {
  const all = files.split(',').map(f => JSON.parse(readFileSync(resolve(f), 'utf8')))
  const out = { ...all[0], runs: all.reduce((n, r) => n + r.runs, 0), scenes: {} }
  for (const r of all) for (const [id, s] of Object.entries(r.scenes)) (out.scenes[id] ||= { runs: [] }).runs.push(...s.runs)
  for (const s of Object.values(out.scenes)) medians(s)
  return out
}
// What fails: only things the runner's speed cannot change. Counts (live frames, players, crashes, layers, nodes)
// and memory (heap, GPU) barely move between measurements of the same code, so their thresholds can be tight;
// frame time can't, so it is shown and not failed on (the head over the base is printed, and the camera each board
// settled on, to see two views that differ).
const GATES = [
  // what, key, rule: 'no more' (never above the base), or a share the head may exceed the base by with a floor
  { what: 'crashes', key: 'crashes', rule: 'none' },
  { what: 'live frames', key: 'iframes', rule: 'none' },
  { what: 'players left after leaving', key: 'playersAfter', rule: 'none' },
  { what: 'DOM nodes', key: 'nodes', rule: 0.10, floor: 200 },
  // two numbers that take one of two values from one recording to the next on the same code (the Overview's layers
  // were 20 in 324 recordings and 15 in 36; its GPU allocators 34 and 27, by when a picture was composited): the head's
  // median is held to the base's highest, so the lower mode on the base side is not a regression of the head (a
  // failure of the PR that changed nothing, one trial in forty)
  { what: 'layers', key: 'layers', rule: 0.20, floor: 2, base: 'max' },
  { what: 'JS heap MB', key: 'jsHeapMB', rule: 'memory', floor: 8 },
  { what: 'GPU process MB', key: 'gpuMB', rule: 'memory', floor: 2 },
  { what: 'GPU allocators MB', key: 'gpuAllocMB', rule: 'memory', floor: 2, base: 'max' }
]
// The main thread's work over the scripted path, in a form the runner's speed cannot move much: the browser's own count of
// the time its main thread spent in tasks over the path (taskMs: script, layout, style, paint), divided by the CPU
// calibration made in the same recording (calibMs, a fixed piece of work timed in that browser). For the base and head
// recordings made one after the other (b1 h1 b2 h2 b3 h3) the median of the head over the base of each pair is the
// statistic: a pair is two recordings a minute apart on one machine, and the median of three drops a pair a noisy
// minute spoiled. A heavier board does more work on the same path; a slower runner does the same work slower in both
// the task time and the calibration. It is not a percentile of single frames: those moved ±50% between recordings of
// the same code on the Overview (p75 of frames, tried first, failed 5 of 20 fresh trials), the total did not
// (docs/perf/README.md has the evidence: 120 board-trials of main against main read 0.94 to 1.10).
const FRAME_STAT = r => (r.taskMs > 0 && r.calibMs > 0) ? r.taskMs / r.calibMs : null
function pairedFrame(a, b) {
  const x = a.runs.filter(r => !r.crashed).map(FRAME_STAT), y = b.runs.filter(r => !r.crashed).map(FRAME_STAT)
  const n = Math.min(x.length, y.length)
  const pairs = []
  for (let i = 0; i < n; i++) if (x[i] > 0 && y[i] != null) pairs.push(y[i] / x[i])
  return pairs.length >= 2 ? { pairs, ratio: median(pairs) } : null
}
// the head may take this much longer than the base, in the statistic above
const FRAME_GATE = 1.15
function compare(a, b, memT, gateFrame) {
  const A = pool(a), B = pool(b)
  print(A); print(B)
  const fails = [], md = ['## Board gauge', '', `Base against head, ${A.runs} and ${B.runs} measurements each, medians. **Failing checks** are counts and memory; **frame time is report-only** (it moves more between measurements of the same code than any threshold could hold).`, '', '| board | check | base | head | |', '|---|---|---:|---:|---|']
  for (const id of Object.keys(B.scenes)) {
    const x = A.scenes[id]?.median, y = B.scenes[id].median
    if (!x) { console.log(`  ${id}: not on the base, not compared`); continue }
    const row = []
    const r1 = v => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)
    const add = (what, p0, q0, bad, note = '') => { const p = r1(p0), q = r1(q0); row.push(`${what} ${p} → ${q}${bad ? ' ✗' : ''}`); md.push(`| ${id} | ${what} | ${p ?? 'n/a'} | ${q ?? 'n/a'} | ${bad ? '✗' : note} |`) }
    for (const g of GATES) {
      const own = g.base === 'max' ? A.scenes[id].runs.filter(r => !r.crashed && r[g.key] != null).map(r => r[g.key]) : []
      const p = own.length ? Math.max(...own) : x[g.key], q = y[g.key]
      if (p == null || q == null) { add(g.what, p, q, false, 'not measured'); continue }
      const t = g.rule === 'memory' ? memT : g.rule
      const bad = t === 'none' ? q > p : q > p * (1 + t) && q - p >= (g.floor || 0)
      add(g.what, p, q, bad)
      if (bad) fails.push(`${id}: ${g.what} ${p} → ${q} (${t === 'none' ? 'no more than the base' : `over +${Math.round(t * 100)}%`})`)
    }
    // the film plays on a board that has one, or its players are not measured
    if (y.filmPlaying === 0) { row.push('film did not play ✗'); md.push(`| ${id} | film | | | did not play ✗ |`); fails.push(`${id}: the film did not play, so its players were not measured`) }
    // main-thread work, speed-normalised and paired: gated at gateFrame (FRAME_GATE unless --gate-frame says otherwise, 0 turns it off)
    const pf = pairedFrame(A.scenes[id], B.scenes[id])
    if (pf) {
      const bad = gateFrame > 0 && pf.ratio > gateFrame
      row.push(`main-thread work ${pf.ratio.toFixed(2)}× the base (pairs ${pf.pairs.map(v => v.toFixed(2)).join(', ')})${bad ? ' ✗' : ''}`)
      md.push(`| ${id} | main-thread work, head over base (task time ÷ CPU calibration, median of ${pf.pairs.length} pairs) | | | ${pf.ratio.toFixed(2)}× (${pf.pairs.map(v => v.toFixed(2)).join(', ')})${bad ? ' ✗' : ''} |`)
      if (bad) fails.push(`${id}: main-thread work ${pf.ratio.toFixed(2)}× the base (over ${gateFrame}×; pairs ${pf.pairs.map(v => v.toFixed(2)).join(', ')})`)
    }
    // the raw percentiles: shown only
    if (x.frame && y.frame) {
      const ratio = y.frame.p95 / x.frame.p95
      row.push(`frame p95 ${x.frame.p95.toFixed(1)} → ${y.frame.p95.toFixed(1)} ms (report only)`)
      md.push(`| ${id} | frame p50 / p95 / p99 (ms) | ${x.frame.p50.toFixed(1)} / ${x.frame.p95.toFixed(1)} / ${x.frame.p99.toFixed(1)} | ${y.frame.p50.toFixed(1)} / ${y.frame.p95.toFixed(1)} / ${y.frame.p99.toFixed(1)} | report only, head ${ratio.toFixed(2)}× |`)
    }
    // the camera each side settled on: the same view, or the comparison is of two views
    const cam = (r, k) => A.scenes[id].runs.concat(B.scenes[id].runs).filter(m => !m.crashed && m.camera).map(m => m.camera)
    const cams = [...new Set(cam())]
    if (cams.length > 1) md.push(`| ${id} | camera | ${cams.length} different views | | see the recordings |`)
    console.log(`${fails.some(f => f.startsWith(id + ':')) ? '✗' : '✓'} ${id}: ${row.join(' · ')}`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) { try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n') } catch {} }
  if (fails.length) { console.log(`\n${fails.join('\n')}`); process.exit(1) }
  console.log('\nNo board got heavier or leaked (frame time is report-only).')
}

// and the whole run has a deadline (--deadline minutes, 25 by default): past it the gauge says so and exits
let studio = null
if (cmd === 'measure') setTimeout(() => { console.log(`the gauge ran past its ${flag('deadline', 25)} minute deadline`); studio?.kill(); process.exit(3) }, Number(flag('deadline', 25)) * 60000).unref()
if (cmd === 'measure' && pos[0]) await measure(resolve(pos[0]), { root: resolve(flag('root', fileURLToPath(new URL('..', import.meta.url)))), runs: Number(flag('runs', 3)), only: (flag('only', '') || '').split(',').filter(Boolean), cold: rest.includes('--cold') })
else if (cmd === 'compare' && pos[1]) compare(pos[0], pos[1], Number(flag('memory', 0.15)), rest.includes('--no-gate-frame') ? 0 : flag('gate-frame', null) ? Number(flag('gate-frame')) : FRAME_GATE)
else { console.log('node scripts/board-gauge.mjs measure <out.json> [--root <tree>] [--runs 3] [--only a,b] | compare <base.json> <head.json>'); process.exit(2) }
