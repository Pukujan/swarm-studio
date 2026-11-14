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
//   5. Play and Watch a visitor
//   6. in every room the navigation machine, the pill and the back button agree, and Esc climbs
//   7. the address: Back and Forward, and a reload in each room
//   8. Make, then another project: the new build opens in the deck, and opening another keeps it
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
    ev.push({ type: 'layer:done', t: t + 1000 + i, run, page: pid, layer: 'hero', agent: 'a0', ms: 900, done: i + 1, planned: 2, html: `<section style="padding:80px;min-height:1100px;background:#222;color:#eee"><h1>${title}</h1><p>${brief}</p></section>` })
  })
  ev.push({ type: 'plan:done', t: t + 50, run, ms: 50, pages: 2, layers: 2 })
  ev.push({ type: 'run:done', t: t + 2000, run, ms: 2000, planned: 2, done: 2, failed: 0, pages: 2 })
  mkdirSync(join(runs, run))
  writeFileSync(join(runs, run, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
}
build(A1, 'Alpha Tea, a tea subscription for night-shift workers', 'Alpha Tea', T0)
build(B1, 'Bravo Bikes, a bike repair shop', 'Bravo Bikes', T0 + 3600e3)
build(B2, 'Bravo Bikes, a bike repair shop with rentals', 'Bravo Bikes', T0 + 7200e3)
// one visitor already written for Alpha (they are kept with the run), so Watch a visitor needs no model
writeFileSync(join(runs, A1, 'tours.json'), JSON.stringify({ tours: [{ name: 'Mia', who: 'night nurse', emoji: '🙂', goal: 'a tea for after shifts', end: 'okay, that works', steps: [
  { page: 'home', do: 'look', el: 'l0', think: ['hm, tea'] }, { page: 'home', do: 'hover', el: 'l1', think: ['what is this'] }, { page: 'more', do: 'look', el: 'l0', think: ['more of it'] }] }] }))
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
  // a script's build says it is sure: no question in the chat first (docs/decisions/0020-ask-before-build.md)
  const out = await api('/api/run', { brief, agents: 2, sure: true }).catch(() => ({}))
  for (let i = 0; i < 40; i++) { const st = await api('/api/state').catch(() => ({})); if (st.run === out.run && !st.working) break; await wait(250) }
  return out.run
}
await api('/api/setup', { seen: true }).catch(() => {}) // the one-time Setup sheet stays shut
const C1 = await elsewhere('Neon Alley Nights, a night market after dark')

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.on('pageerror', e => console.log('  page error:', e.message))
  // a move the navigation machine does not have is logged as nav: no …
  page.on('console', m => { if (m.text().startsWith('nav:')) console.log(`  ${m.text()}`) })
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
    // Projects comes back on the versions it showed last (drawn a moment later): up to every project
    await wait(400)
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
  // before its picture, a page is a block per planned section: never a title card or a thin strip
  // (its pages, once the board has come: until then the stage holds three loading cards, .wait-in)
  await page.waitForSelector('.pj-stage[aria-label="Overview"] .ab.page:not(.wait-in)', { timeout: 5000 }).catch(() => {})
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.pj-stage[aria-label="Overview"] .ab.page:not(.wait-in)')].map(a => ({ sk: a.querySelectorAll('.sk:not(.over) i').length, img: !!a.querySelector(':scope > img'), tc: !!a.querySelector('.tc'), ratio: a.offsetHeight / a.offsetWidth })))
  ok(tiles.length === 2 && tiles.every(t => (t.sk || t.img) && !t.tc && t.ratio >= 1.2), `before their pictures, pages are skeletons from the plan (${JSON.stringify(tiles)})`)
  await settle(A1)
  await shows(A1, 'Alpha Tea', 'Alpha opened')
  // the Overview photographs each page once and keeps both sizes in the run's folder (spec 36)
  let disk = null
  for (let i = 0; i < 40; i++) { disk = await api(`/api/runs/${A1}/snaps`).catch(() => null); if (disk && Object.values(disk.pages).every(d => d.s && d.f)) break; await wait(250) }
  ok(disk && Object.keys(disk.pages).length === 2 && Object.values(disk.pages).every(d => d.s && d.f), `each page's snapshot is saved in two sizes (${JSON.stringify(Object.values(disk?.pages || {}).map(d => Object.keys(d).join('')))})`)
  const listed = await api('/api/projects').catch(() => ({}))
  const card = (listed.projects || []).find(p => p.head === A1 || p.versions?.some(v => v.id === A1))
  ok(String(card?.cover || card?.versions?.[0]?.cover || '').startsWith(`/snaps/${A1}/home.`), `the build's cover is its first page's saved snapshot (${card?.cover})`)
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

  // opened again, the pages paint from the saved files
  await home()
  await page.click('.home .card[aria-label="Alpha Tea"]')
  // (Alpha's pages: right after the click the stage can still hold Bravo's, with Bravo's saved pictures)
  await page.waitForFunction(run => { const ims = [...document.querySelectorAll('.pj-stage .ab.page img')]; return ims.length >= 2 && ims.every(im => !im.getAttribute('src').includes('/snaps/') || im.getAttribute('src').includes(`/snaps/${run}/`)) }, A1, { timeout: 5000 }).catch(() => {})
  const srcs = await page.evaluate(() => [...document.querySelectorAll('.pj-stage .ab.page img')].map(im => im.getAttribute('src')))
  ok(srcs.length === 2 && srcs.every(x => x.includes(`/snaps/`)), `opened again, Alpha's pages paint from their saved snapshots (${srcs.map(x => x.split('/').pop()).join(', ')})`)
  // the small picture first, the full one for when the camera comes close
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.pj-stage .ab.page img')].map(im => [im.dataset.low, im.dataset.full].map(u => String(u).split('.').slice(-2, -1)[0]).join('')))
  ok(sizes.length === 2 && sizes.every(x => x === 'sf'), `each page has its small picture first and its full one after (${sizes.join(', ')})`)
  await settle(A1)
  await home()
  await page.click('.home .card[aria-label="Bravo Bikes"]')
  await page.waitForSelector('.home .card[aria-label="Version 2"]', { timeout: 5000 })
  await page.click('.home .card[aria-label="Version 2"]')
  await settle(B2)

  console.log('the same through a version tile')
  await page.click('#play-btn')
  await page.waitForSelector('#player:not([hidden])', { timeout: 5000 }).catch(() => {})
  await home()
  await page.click('.home .card[aria-label="Bravo Bikes"]')
  await page.waitForSelector('.home .card[aria-label="Version 1"]', { timeout: 5000 })
  await page.click('.home .card[aria-label="Version 1"]')
  await settle(B1)
  await shows(B1, 'Bravo Bikes', 'Version 1 opened')

  // a version picked from inside the project (the name's menu): the machine's version, the canvas
  // and the address follow, and the project stays
  await page.click('.pj-crumb .pj-name')
  await page.click('.hm-menu [data-k="v:' + B2 + '"]')
  await settle(B2)
  const tile = await page.evaluate(() => ({ version: window.swarmCosmos.nav.view.version, project: window.swarmCosmos.nav.view.project, room: window.swarmCosmos.nav.view.room, run: window.swarm.S?.run, address: location.search }))
  ok(tile.version === B2 && tile.run === B2 && tile.room === 'overview' && tile.address.includes(`version=${B2}`) && !!tile.project, `a version from inside the project opens it there (${tile.room}, ${tile.run === B2 ? 'version 2' : tile.run})`)
  await shows(B2, 'Bravo Bikes', 'Version 2 from inside the project')
  await page.goBack(); await settle(B1)
  await shows(B1, 'Bravo Bikes', 'Back is Version 1 again')

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

  console.log('Hermes plays a build while Projects shows')
  await home()
  await api('/api/cmd', { op: 'play', run: B2 })
  await page.waitForSelector('#player:not([hidden])', { timeout: 10000 }).catch(() => {})
  const hp = await page.evaluate(() => ({ room: window.swarmCosmos.nav.view.room, version: window.swarmCosmos.nav.view.version, player: window.swarmCosmos.nav.view.player, shown: !document.getElementById('player').hidden, home: !!document.querySelector('.home .card')?.checkVisibility?.(), pages: [...document.querySelectorAll('#pl-page option')].map(o => o.textContent) }))
  ok(hp.room === 'overview' && hp.version === B2 && hp.player === 'prototype' && hp.shown && !hp.home && hp.pages.length && hp.pages.every(t => t.includes('Bravo')), `a Hermes play at Projects opens Bravo and plays it, not behind Projects (${hp.room}, ${hp.player}, ${hp.pages.join(', ')})`)
  await page.click('#pl-close')
  await home()
  await page.click('.home .card[aria-label="Alpha Tea"]')
  await settle(A1)

  console.log('Play and Watch a visitor')
  const watch = () => page.evaluate(() => ({ label: document.getElementById('pl-tours').getAttribute('aria-label'), text: document.querySelector('#pl-tours .t').textContent, walking: !document.getElementById('pl-persona').hidden, player: !document.getElementById('player').hidden }))
  await page.click('#play-more')
  const items = await page.locator('#play-menu [data-play]').allTextContents()
  const shot = name => process.env.SHOTS ? page.screenshot({ path: join(process.env.SHOTS, `${name}.png`) }) : null
  await wait(400)
  await shot('play-menu')
  ok(items.map(t => t.trim()).join(' | ') === 'Play prototype | Watch a visitor', `Play's caret offers Play prototype and Watch a visitor (${items.join(' | ')})`)
  await page.click('#play-menu [data-play="visitor"]')
  await page.waitForFunction(() => !document.getElementById('pl-persona').hidden, null, { timeout: 8000 }).catch(() => {})
  await wait(1500)
  await shot('watching')
  let w = await watch()
  ok(w.player && w.walking, 'Watch a visitor opens the player and a visitor walks the page')
  ok(w.label === 'Stop watching' && w.text === 'Stop watching', `while one walks, the bar's control reads Stop watching (${w.text})`)
  await page.click('#pl-tours')
  w = await watch()
  ok(!w.walking && w.label === 'Watch a visitor', `Stop watching stops them (${w.text})`)
  await page.click('#pl-tours')
  await page.waitForFunction(() => !document.getElementById('pl-persona').hidden, null, { timeout: 8000 }).catch(() => {})
  ok((await watch()).walking, 'Watch a visitor in the bar starts one again')
  await page.click('#pl-close')
  await page.click('#play-btn')
  await wait(800)
  w = await watch()
  ok(w.player && !w.walking && w.label === 'Watch a visitor', 'a plain click on Play plays the prototype, no visitor')
  await page.click('#pl-close')

  console.log('the pill and the back button match the screen in every room')
  await home()
  await page.click('.home .card[aria-label="Alpha Tea"]')
  await settle(A1)
  const screen = () => page.evaluate(() => ({
    room: window.swarmCosmos.nav.view.room, mode: window.swarmCosmos.mode, version: window.swarmCosmos.nav.view.version,
    pill: document.querySelector('.mode-btn .t')?.textContent || '',
    back: document.querySelector('.cosmos-back .t')?.textContent || '',
    project: !!document.querySelector('.pj-crumb')?.checkVisibility?.(),
    home: !!document.querySelector('.home .card')?.checkVisibility?.(),
    crumb: document.querySelector('.pj-crumb .pj-name')?.textContent?.trim() || ''
  }))
  const ROOMS = [['canvas', 'deck', 'Canvas'], ['video', 'video', 'Video'], ['app', 'app', 'App'], ['overview', 'overview', 'Overview']]
  for (const [mode, room, label] of ROOMS) {
    await page.click('.mode-btn')
    await page.click(`.mode-menu [data-mode="${mode}"]`)
    await wait(700)
    const s = await screen()
    const back = room === 'overview' ? 'Projects' : 'Overview'
    ok(s.room === room && s.pill === label && s.back === back && s.version === A1, `${label}: the machine, the pill and the back button agree (${s.room}, ${s.pill}, ${s.back})`)
    ok(room === 'overview' ? s.project && s.crumb === 'Alpha Tea' : !s.project && !s.home, `${label}: only its own screen shows (${room === 'overview' ? s.crumb : `project ${s.project}, home ${s.home}`})`)
  }
  await page.click('.mode-btn')
  await page.click('.mode-menu [data-mode="canvas"]')
  await wait(500)
  await page.keyboard.press('Escape')
  await wait(500)
  let up = await screen()
  ok(up.room === 'overview' && up.pill === 'Overview' && up.project, `Esc in the deck goes to the Overview (${up.room}, ${up.pill})`)
  await page.keyboard.press('Escape')
  await wait(700)
  up = await screen()
  ok(up.room === 'home' && up.mode === 'home' && up.home && !up.project, `Esc on the Overview goes to Projects (${up.room})`)

  console.log('Back, Forward and a reload')
  const pickRoom = async mode => { await page.click('.mode-btn'); await page.click(`.mode-menu [data-mode="${mode}"]`); await wait(700) }
  const where = async () => ({ ...(await screen()), address: await page.evaluate(() => location.search), run: await page.evaluate(() => window.swarm.S?.run || null) })
  await page.click('.home .card[aria-label="Alpha Tea"]')
  await settle(A1)
  let at = await where()
  ok(at.address === `?project=${at.address.match(/project=([^&]*)/)?.[1]}&version=${A1}` && at.room === 'overview', `opening a project writes it to the address (${at.address})`)
  // the player's pages and closing it add nothing to Back (a frame's navigations used to)
  const len0 = await page.evaluate(() => history.length)
  await page.click('#play-btn'); await wait(900)
  await page.selectOption('#pl-page', { index: 1 }); await wait(700)
  await page.click('#pl-close'); await wait(300)
  const len1 = await page.evaluate(() => history.length)
  ok(len1 === len0, `playing two pages and closing the player add nothing to Back (${len0} → ${len1})`)
  // the player is the machine's: what it says is what shows, a reload keeps it, a room move closes it
  const playing = () => page.evaluate(() => ({ shown: !document.getElementById('player').hidden, page: document.getElementById('pl-page').value, nav: window.swarmCosmos.nav.view.player, navPage: window.swarmCosmos.nav.view.page, address: location.search }))
  await page.click('#play-btn'); await wait(900)
  await page.selectOption('#pl-page', { index: 1 }); await wait(700)
  let pl = await playing()
  ok(pl.shown && pl.nav === 'prototype' && pl.navPage === pl.page && pl.address.includes('play=prototype') && pl.address.includes(`page=${pl.page}`), `the player and its page are the machine's and the address's (${pl.nav}, ${pl.address})`)
  await page.reload()
  await page.waitForFunction(() => window.swarmCosmos?.nav && window.swarm?.S, null, { timeout: 15000 })
  await settle(A1)
  await page.waitForSelector('#player:not([hidden])', { timeout: 5000 }).catch(() => {})
  const was = pl.page
  pl = await playing()
  ok(pl.shown && pl.page === was && pl.nav === 'prototype', `a reload keeps the player on its page (${pl.shown ? pl.page : 'closed'})`)
  await page.evaluate(() => window.swarmCosmos.nav.go({ type: 'close' })); await wait(300)
  pl = await playing()
  ok(!pl.shown && !pl.address.includes('play='), `the machine closing the player closes it (${pl.shown ? 'open' : 'closed'})`)
  await page.click('#play-btn'); await wait(700)
  await pickRoom('canvas')
  pl = await playing()
  ok(!pl.shown && pl.nav === 'closed', `a room move closes the player (${pl.shown ? 'open' : 'closed'}, ${pl.nav})`)
  await page.goBack(); await wait(700) // back to the Overview, so the steps below start from it
  await pickRoom('canvas')
  await pickRoom('video')
  at = await where()
  ok(at.address.endsWith('&room=video'), `a room is in the address (${at.address})`)
  await page.goBack(); await wait(700)
  at = await where()
  ok(at.room === 'deck' && at.pill === 'Canvas' && at.address.endsWith('&room=deck'), `Back from the Film studio is the Design deck (${at.room}, ${at.pill})`)
  await page.goBack(); await wait(700)
  at = await where()
  ok(at.room === 'overview' && at.pill === 'Overview' && at.project && at.crumb === 'Alpha Tea', `Back again is Alpha's Overview (${at.room}, ${at.crumb})`)
  await page.goBack(); await wait(900)
  at = await where()
  ok(at.room === 'home' && at.home && !at.project && at.address === '', `Back again is Projects (${at.room}, '${at.address}')`)
  await page.goForward(); await wait(900)
  at = await where()
  ok(at.room === 'overview' && at.version === A1 && at.crumb === 'Alpha Tea', `Forward is Alpha's Overview again (${at.room}, ${at.crumb})`)
  // a reload in each room shows exactly that room, on that build
  await home()
  await page.click('.home .card[aria-label="Bravo Bikes"]')
  await page.waitForSelector('.home .card[aria-label="Version 2"]', { timeout: 5000 })
  await page.click('.home .card[aria-label="Version 2"]')
  await settle(B2)
  at = await where()
  ok(at.room === 'overview' && at.version === B2, `Bravo opens on its Overview (${at.room}, ${at.version === B2 ? 'Bravo' : at.version})`)
  for (const [mode, room, label] of ROOMS) {
    if (room !== 'overview') await pickRoom(mode)
    const before = await page.evaluate(() => location.search)
    await page.reload()
    await page.waitForFunction(() => window.swarmCosmos?.nav && window.swarm?.S, null, { timeout: 15000 })
    await settle(B2)
    at = await where()
    ok(at.room === room && at.pill === label && at.version === B2 && at.run === B2 && at.address === before, `a reload in ${label} shows ${label} on Bravo's build (${at.room}, ${at.pill}, ${at.run === B2 ? 'Bravo' : at.run})`)
    if (room === 'overview') ok(at.crumb === 'Bravo Bikes' && at.project, `a reload on the Overview shows Bravo's Overview (${at.crumb})`)
    if (room !== 'overview') await pickRoom('overview')
  }

  console.log('Make, then another project')
  await home()
  // what Projects' Make box does once the person says Build (web/home.js start): the canvas submits the
  // brief, the chat asks first (decision 0020) and the person answers Skip all; then the build starts and the
  // studio is told the build the person started
  const made = await page.evaluate(async () => {
    const brief = 'Cedar Cafe, a small cafe by the river'
    const asked = await window.swarm.submit(brief)
    if (!asked?.ask || !asked.chat) return null
    await window.swarm.api(`/api/talk/${asked.chat}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pick: 'go:all' }) })
    await new Promise(r => setTimeout(r, 800))
    const run = await window.swarm.submit(brief, false, null, null, { chat: asked.chat })
    window.swarmCosmos.started(run)
    return run
  })
  await page.waitForFunction(r => window.swarm.S?.run === r, made, { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => !window.swarmCosmos.nav.view.pending, null, { timeout: 10000 }).catch(() => {})
  at = await where()
  ok(typeof made === 'string' && at.room === 'deck' && at.version === made && at.run === made, `Make opens the new build in the Design deck (${at.room}, ${at.run === made ? 'the new build' : at.run})`)
  ok(!(await page.evaluate(() => window.swarmCosmos.nav.view.pending)), 'its start on the stream clears the wait')
  // the question's chat is open with the caret in its box (decision 0020), and Esc in a text box stays there
  // (web/studio.js escUp): leave the box first, as a click on the deck does, then Esc goes up to the Overview
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.keyboard.press('Escape'); await wait(400)
  await home()
  await page.click('.home .card[aria-label="Alpha Tea"]')
  await settle(A1)
  await wait(2500)
  await shows(A1, 'Alpha Tea', 'Alpha opened while the new build goes on')

  console.log('the debug dump')
  const dump = await page.evaluate(() => window.swarmState())
  ok(['nav', 'app', 'advisor', 'game'].every(k => dump[k]) && dump.nav.context.version === A1 && 'mode' in dump.app, `window.swarmState() has the machine and the data stores (${Object.keys(dump).join(', ')})`)
  void C1
} finally {
  await browser.close()
  server.kill()
  fake.close()
  rmSync(data, { recursive: true, force: true })
}
console.log(`\n${passes} passed, ${fails.length} failed`)
if (fails.length) { console.log(log.split('\n').slice(-20).join('\n')); process.exit(1) }
