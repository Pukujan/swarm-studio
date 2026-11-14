// Sandbox check (Nous catalog review, point 4): model-written pages cannot reach the studio.
//
//   node scripts/sandbox-check.mjs   (PLAYWRIGHT_DIR / CHROMIUM_PATH as for scripts/open-check.mjs)
//
// Starts its own server on a free port with a throwaway data folder and one build whose section
// tries every trick the old regex clean() let through, then in a headless browser:
//   1. clean() (web/clean.js) strips scripts, on* attributes and javascript: URLs, by the DOM
//   2. every page frame is sandboxed with allow-scripts and no allow-same-origin: its origin is opaque
//   3. nothing in the section ran against the studio, even with clean() bypassed
//   4. page shots still come back from the frames by postMessage; the prototype player plays the page
//   5. /site/ and /video/…/live/ are served with `content-security-policy: sandbox allow-scripts`,
//      and a script there sees an opaque origin
// It never touches the 4319 server or the real data folder.
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startStudio } from './studio-child.mjs'

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
const fails = []
let passes = 0
const ok = (cond, what) => { if (cond) { passes++; console.log(`  ✓ ${what}`) } else { fails.push(what); console.log(`  ✗ ${what}`) } }

// what a model could write: each line reaches for the studio a different way
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const ATTACKS = [
  `<img src="${GIF}" onload="parent.__pwned='img'">`,
  `<img/onload="parent.__pwned='slash'"/src=${GIF}>`, // the old regex wanted a space before on…
  `<svg><script>parent.__pwned='svg'</script></svg>`,
  `<script>parent.__pwned='script'</script>`,
  `<a id="js" href="java&#x09;script:parent.__pwned='href'">go</a>`,
  `<iframe srcdoc="<script>parent.parent.__pwned='srcdoc'</script>"></iframe>`,
  `<template><img src=${GIF} onload="parent.__pwned='template'"></template>`,
  `<form action="javascript:parent.__pwned='form'"><button id="fb">send</button></form>`
].join('\n')

const data = mkdtempSync(join(tmpdir(), 'swarm-sandbox-'))
const runs = join(data, 'runs')
mkdirSync(runs)
const T0 = Date.parse('2026-11-01T10:00:00Z')
const RUN = new Date(T0).toISOString().replace(/[:.]/g, '-')
{
  const ev = [{ type: 'run:start', t: T0, run: RUN, brief: 'Sandbox Tea', agents: [{ id: 'a0', name: 'Ada', color: '#FF6B6B' }] }]
  ev.push({ type: 'theme', t: T0 + 10, run: RUN, name: 'Plain', direction: '', vars: { '--background': '#ffffff', '--foreground': '#111111' } })
  ev.push({ type: 'page', t: T0 + 20, run: RUN, id: 'home', title: 'Sandbox Tea', purpose: '', index: 0 })
  ev.push({ type: 'layer:plan', t: T0 + 30, run: RUN, page: 'home', id: 'hero', role: 'hero', height: 400 })
  ev.push({ type: 'agent:assign', t: T0 + 40, run: RUN, agent: 'a0', page: 'home', layer: 'hero', role: 'hero' })
  ev.push({ type: 'plan:done', t: T0 + 50, run: RUN, ms: 50, pages: 1, layers: 1 })
  ev.push({ type: 'layer:done', t: T0 + 1000, run: RUN, page: 'home', layer: 'hero', agent: 'a0', ms: 900, done: 1, planned: 1, html: `<section style="padding:80px"><h1>Sandbox Tea</h1>${ATTACKS}</section>` })
  ev.push({ type: 'run:done', t: T0 + 2000, run: RUN, ms: 2000, planned: 1, done: 1, failed: 0, pages: 1 })
  mkdirSync(join(runs, RUN))
  writeFileSync(join(runs, RUN, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
  // a local export (/site/) and a video composition (/video/…/live/), each with a script that looks at its origin
  const probe = '<script>document.title = "origin:" + self.origin + ";storage:" + (() => { try { localStorage.length; return "yes" } catch { return "no" } })()</script>'
  mkdirSync(join(runs, RUN, 'export', 'site', 'html'), { recursive: true })
  writeFileSync(join(runs, RUN, 'export', 'site', 'html', 'index.html'), `<!doctype html><html><head></head><body>site${probe}</body></html>`)
  mkdirSync(join(runs, RUN, 'video'), { recursive: true })
  writeFileSync(join(runs, RUN, 'video', 'index.html'), `<!doctype html><html><head></head><body>video${probe}</body></html>`)
  writeFileSync(join(runs, 'folders.json'), JSON.stringify({ v: 2, folders: [], projects: { [RUN]: { runs: [RUN], name: 'Sandbox Tea', title: null, folder: null, trashed: null, made: T0, own: true } } }))
}

const TOKEN = 'sandbox-check'
const env = { ...process.env, SWARM_TOKEN: TOKEN, SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runs, SWARM_OUTPUT_DIR: join(data, 'out'), SWARM_BASE_URL: 'http://127.0.0.1:9/v1', SWARM_API_KEY: 'none', SWARM_FEED_URL: 'http://127.0.0.1:9' }
for (const k of ['SWARM_PORT', 'SWARM_HERMES_PY', 'SWARM_HERMES_PYTHONPATH', 'HERMES_CUSTOM_INFERHUB_API_KEY', 'SWARM_ELEVENLABS_KEY', 'SWARM_TTS_URL']) delete env[k]
// on a port of its own, which it says once it listens (scripts/studio-child.mjs)
const studio = await startStudio({ env })
const server = studio.child, BASE = studio.base
await fetch(`${BASE}/api/setup`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': TOKEN }, body: '{"seen":true}' }).catch(() => {})

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.on('pageerror', e => console.log('  page error:', e.message))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.home .card[aria-label="Sandbox Tea"]', { timeout: 15000 })

  console.log('clean(), by the DOM')
  const cleaned = await page.evaluate(async html => (await import('/clean.js')).clean(html), '```html\n' + ATTACKS + '\n```')
  ok(!/<script/i.test(cleaned), 'no <script> is left, in HTML or SVG')
  ok(!/\son[a-z]+\s*=|\/on[a-z]+\s*=/i.test(cleaned), 'no on* attribute is left, however it is written')
  ok(!/javascript|srcdoc/i.test(cleaned), 'no javascript: URL and no srcdoc is left')
  ok(/<h1>|<a id="js">go<\/a>|<button id="fb">send<\/button>/.test(cleaned) && !cleaned.includes('```'), 'the content itself is kept, and the code fence goes')

  console.log('page frames')
  await page.click('.home .card[aria-label="Sandbox Tea"]')
  await page.waitForFunction(r => window.swarm.S?.run === r && window.swarm.S.frames.length === 1 && window.swarm.S.frames[0].ready, RUN, { timeout: 15000 }).catch(() => {})
  await wait(1500)
  const frames = await page.evaluate(() => window.swarm.S.frames.map(f => ({ sandbox: f.iframe.getAttribute('sandbox'), doc: f.iframe.contentDocument === null })))
  ok(frames.length === 1 && frames.every(f => f.sandbox === 'allow-scripts'), `every page frame is sandbox="allow-scripts" (${frames.map(f => f.sandbox).join(', ')})`)
  ok(frames.every(f => f.doc), 'the studio cannot open a frame\'s document: its origin is opaque')
  // clean() bypassed: the raw HTML straight into the frame, the way a slip in clean() would land
  await page.evaluate(html => { const f = window.swarm.S.frames[0]; f.iframe.contentWindow.postMessage({ type: 'slot', key: 'raw', where: 'end' }, '*'); f.iframe.contentWindow.postMessage({ type: 'slot', key: 'raw', html }, '*') }, ATTACKS)
  await wait(1500)
  ok(await page.evaluate(() => window.__pwned === undefined), `nothing in the section reached the studio (${await page.evaluate(() => window.__pwned)})`)

  console.log('features that talk to the frames')
  const shot = await page.evaluate(() => window.swarm.thumb(window.swarm.S.frames[0].id, 0.3).catch(err => 'failed: ' + (err?.message || err?.type || err))).catch(err => String(err))
  ok(typeof shot === 'string' && shot.startsWith('data:image/'), `a page shot comes back by postMessage (${String(shot).slice(0, 30)})`)
  await page.click('#play-btn')
  await page.waitForSelector('#player:not([hidden])', { timeout: 5000 }).catch(() => {})
  await wait(1200)
  const pl = await page.evaluate(() => { const f = document.getElementById('pl-frame'); return { sandbox: f.getAttribute('sandbox'), opaque: f.contentDocument === null, shown: !document.getElementById('player').hidden } })
  ok(pl.shown && pl.sandbox === 'allow-scripts' && pl.opaque, `the prototype player plays the page in a sandboxed frame (${JSON.stringify(pl)})`)
  ok(await page.evaluate(() => window.__pwned === undefined), 'playing the page reached nothing either')

  console.log('/site/ and /video/…/live/')
  for (const [path, what] of [[`/site/${RUN}/`, 'a local site'], [`/video/${RUN}/live/index.html`, 'a video composition']]) {
    const res = await fetch(`${BASE}${path}?k=${TOKEN}`)
    ok(res.headers.get('content-security-policy') === 'sandbox allow-scripts', `${what} is served with content-security-policy: sandbox allow-scripts (${res.headers.get('content-security-policy')})`)
    const p2 = await browser.newPage()
    await p2.goto(`${BASE}${path}?k=${TOKEN}`)
    await wait(400)
    ok((await p2.title()) === 'origin:null;storage:no', `a script in ${what} sees an opaque origin and no storage (${await p2.title()})`)
    await p2.close()
  }
} finally {
  await browser.close()
  server.kill()
  rmSync(data, { recursive: true, force: true })
}
console.log(`${passes} passed, ${fails.length} failed`)
if (fails.length) { console.log(log.slice(-3000)); process.exit(1) }
