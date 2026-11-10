// UI check for docs/specs/12-flow-map.md: drives a running studio in a headless browser and fails
// on what the owner hit. Run it against a test server with at least one finished build:
//
//   node scripts/ui-check.mjs [--base http://127.0.0.1:4420] [--run <run id>] [--shots docs/specs/screens/flow]
//                             [--widths 1280,768,390]
//
// It needs Playwright with Chromium: the repo has no node_modules, so it uses `playwright` if it
// resolves, else the one at $PLAYWRIGHT_DIR (any folder whose node_modules has it).
//
// Checks, at 1280, 1024 and 768 wide: no two visible clickable boxes overlap on Projects and a
// project's canvas; a click on a card opens its project; a drag on the stage pans it and Frame brings
// it back; a double-click on an artboard opens its room and Esc comes back; the mode menu (Canvas,
// Video, App, Game) works from the keyboard and there is no Auto button or pill; at 390 and 700 the
// canvas stays, Files is a sheet, "Tell the crew…" is on screen and the Chat pill covers nothing;
// the logo and Esc lead home from every view (a room, App, a replay); there is no Classic view; the side panel is Chat and Log;
// ☰ → Sound switches the crew's voices. At 390 wide nothing scrolls sideways.
//
// Tooltips (docs/ux/RULES.md, rule 1): there are none. No title= or data-tip anywhere in web/, and no
// [title] or [data-tip] on any screen it visits. Icon-only controls are named by aria-label.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', process.env.UI_BASE || 'http://127.0.0.1:4420').replace(/\/$/, '')
const SHOTS = arg('shots', '')
let RUN = arg('run', process.env.UI_RUN || '')

async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: npm i -D playwright, or set PLAYWRIGHT_DIR to a folder that has it')
  return createRequire(join(resolve(dir), 'package.json'))('playwright')
}
const { chromium } = await loadPlaywright()

const fails = []
let passes = 0
const ok = (cond, what) => { if (cond) passes++; else { fails.push(what); console.log(`  ✗ ${what}`) } }
const wait = ms => new Promise(r => setTimeout(r, ms))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

// ---------- the tooltip count: title= and data-tip in web/ (its own files, not vendor/fonts/brand)
{
  const ROOT = fileURLToPath(new URL('..', import.meta.url)), TIP = /\btitle=|data-tip/g, KINDS = /\.(js|mjs|html|css)$/
  const count = text => (text.match(TIP) || []).length
  const here = readdirSync(join(ROOT, 'web')).filter(f => KINDS.test(f)).reduce((n, f) => n + count(readFileSync(join(ROOT, 'web', f), 'utf8')), 0)
  let base = 106, from = 'the count when this check was added'
  try {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    base = git('ls-tree', '--name-only', 'origin/main', 'web/').split('\n').filter(f => KINDS.test(f)).reduce((n, f) => n + count(git('show', `origin/main:${f}`)), 0)
    from = 'origin/main'
  } catch {}
  console.log(`tooltips (title= and data-tip in web/): ${from} ${base}, here ${here}`)
  ok(here === 0, `Tooltips: no title= / data-tip in web/ (found ${here})`)
}

// ---------- in-page helpers
// every clickable thing a person can actually reach: visible, takes pointer events, on screen,
// and the topmost element at its own centre. Then: which of them overlap each other?
const OVERLAPS = () => {
  const SEL = 'button, a[href], input:not([type=hidden]), textarea, select, summary, [role=button], label.ui-check, .comm-thought'
  const vis = el => {
    if (!el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) return false
    for (let x = el; x; x = x.parentElement) if (Number(getComputedStyle(x).opacity) < 0.05) return false
    return getComputedStyle(el).pointerEvents !== 'none'
  }
  const name = el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 3).join('.')}「${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}」`
  const items = []
  for (const el of document.querySelectorAll(SEL)) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue
    const hit = document.elementFromPoint(cx, cy)
    if (!hit || !(hit === el || el.contains(hit) || hit.closest('label') === el.closest('label') && el.closest('label'))) continue
    items.push({ el, r })
  }
  const out = []
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
    if (w > 2 && h > 2) out.push(`${name(a.el)} × ${name(b.el)}`)
  }
  return { n: items.length, out }
}
const hscroll = () => document.documentElement.scrollWidth - innerWidth
// a tooltip on something that already shows words: a hidden explanation, which the rules forbid
const TIPS = () => [...document.querySelectorAll('[title], [data-tip]')]
  .filter(el => el.checkVisibility?.({ visibilityProperty: true }))
  .map(el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 2).join('.')}「${el.innerText.trim().replace(/\s+/g, ' ').slice(0, 20)}」 "${(el.getAttribute('title') ?? el.getAttribute('data-tip')).slice(0, 40)}"`)
async function tips(page, where) {
  const out = await page.evaluate(TIPS)
  ok(!out.length, `${where}: no title or data-tip on anything${out.length ? `\n      ${out.slice(0, 8).join('\n      ')}` : ''}`)
}

async function shot(page, file) { if (SHOTS) await page.screenshot({ path: join(SHOTS, file) }) }
async function overlaps(page, where) {
  const { n, out } = await page.evaluate(OVERLAPS)
  ok(n > 0, `${where}: found clickable things`)
  ok(!out.length, `${where}: no overlapping clickable boxes${out.length ? `\n      ${out.slice(0, 8).join('\n      ')}` : ''}`)
  await tips(page, where)
}
const mode = page => page.evaluate(() => ({ mode: window.swarmCosmos.mode, view: window.swarm.view }))
// a page still busy with an earlier navigation can abort the next one: try once more
const go = (page, url) => page.goto(BASE + url).catch(() => wait(500).then(() => page.goto(BASE + url)))
async function fresh(page, url = '/') {
  await go(page, url)
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await go(page, url)
  await page.waitForFunction(() => window.swarmCosmos?.homeView && window.swarmCosmos.projectView, null, { timeout: 15000 })
  await wait(url.includes('run=') ? 4500 : 1800)
}

// the mode: one menu button (Canvas, Video, App, Game) in a build's top bar, run from the keyboard
async function modeMenu(page, w) {
  await page.evaluate(() => window.swarmCosmos.go('station', 'canvas')); await wait(800)
  ok(await page.isVisible('.mode-btn') && (await page.textContent('.mode-btn .t')) === 'Canvas', `Mode @${w}: the top bar shows the mode by name`)
  ok(!(await page.$('#auto-btn')) && !(await page.isVisible('.auto-panel')), `Mode @${w}: no Auto button or pill`)
  await page.click('.mode-btn'); await wait(250)
  const names = await page.$$eval('.mode-menu [role="option"]', o => o.map(x => x.textContent))
  ok(names.join() === 'Canvas,Video,App,Game' && (await page.getAttribute('.mode-btn', 'aria-expanded')) === 'true', `Mode @${w}: the menu lists Canvas, Video, App, Game (${names.join(', ')})`)
  await tips(page, `Mode menu @${w}`)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await wait(900)
  let m = await mode(page)
  ok(m.mode === 'station' && m.view === 'app' && (await page.textContent('.mode-btn .t')) === 'App', `Mode @${w}: arrows and Enter pick App (${m.mode}/${m.view})`)
  await page.click('.mode-btn'); await wait(250); await page.keyboard.press('Escape'); await wait(250)
  ok(!(await page.isVisible('.mode-menu')) && (await mode(page)).mode === 'station', `Mode @${w}: Esc closes the menu and stays in the room`)
  await page.click('.mode-btn'); await wait(250); await page.click('.mode-menu [data-mode="game"]'); await wait(1200)
  ok(!!(await page.$('.game-pop')), `Mode @${w}: Game opens the game wizard`)
  if (w === 1280 || w === 768) await shot(page, `new-game-${w}.png`)
  await page.keyboard.press('Escape'); await wait(300)
  ok(!(await page.$('.game-pop')), `New game @${w}: closes with Esc`)
  await page.evaluate(() => window.swarmCosmos.go('project')); await wait(600)
}

// narrow panes (a phone, Hermes Desktop's side pane): the canvas stays, Files is a sheet, nothing covers the dock
async function narrow(page, w) {
  const vis = () => page.evaluate(() => [...document.querySelectorAll('.ab')].filter(a => { const b = a.getBoundingClientRect(); return b.width > 4 && b.right > 0 && b.left < innerWidth && b.bottom > 52 && b.top < innerHeight }).length)
  ok((await vis()) > 0 && !(await page.isVisible('.pj-side')), `${w}: a project shows its artboards, not the file list`)
  const ask = await page.evaluate(() => { const r = document.querySelector('.pj-ask').getBoundingClientRect(); return { w: r.width, in: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight } })
  ok(ask.w >= 120 && ask.in, `${w}: "Tell the crew…" is on screen (${Math.round(ask.w)} px wide)`)
  ok(await page.isVisible('.pj-dock [data-tool="move"]') && await page.isVisible('.pj-dock [data-tool="frame"]'), `${w}: the dock keeps Move and Frame`)
  await page.click('.pj-files-btn'); await wait(400)
  ok(await page.isVisible('.pj-side .pj-list .row'), `${w}: the Files button opens the file sheet`)
  await page.click('.pj-list .row >> nth=0'); await wait(700)
  ok(!(await page.evaluate(() => document.querySelector('.project').classList.contains('files-on'))), `${w}: picking a file closes the sheet`)
  const sel = await page.evaluate(() => { const a = document.querySelector('.ab .sel')?.parentElement.getBoundingClientRect(); return a && a.top >= 40 && a.bottom <= innerHeight && a.width > 60 })
  ok(!!sel, `${w}: the picked file is zoomed into view`)
  await page.keyboard.press('Escape'); await wait(300)
  // in a room, the Chat pill and the room's tools never overlap
  for (const v of ['canvas', 'video', 'app']) {
    await page.evaluate(view => window.swarmCosmos.go('station', view), v); await wait(900)
    const hit = await page.evaluate(() => { const c = document.querySelector('.cosmos-chatbtn'); if (!c || !c.offsetParent) return []; const r = c.getBoundingClientRect(); return [...document.querySelectorAll('button, input, textarea, a')].filter(e => !c.contains(e) && e.offsetParent && getComputedStyle(e).visibility !== 'hidden').filter(e => { const b = e.getBoundingClientRect(); return b.width && b.left < r.right - 1 && b.right > r.left + 1 && b.top < r.bottom - 1 && b.bottom > r.top + 1 && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) !== null }).map(e => e.getAttribute('aria-label') || e.className || e.tagName) })
    ok(!hit.length, `${w}: in the ${v} room the Chat pill covers nothing (${hit.join(', ')})`)
  }
  await page.evaluate(() => window.swarmCosmos.go('project')); await wait(600)
}

async function canvasPan(page, w) {
  const at = () => page.evaluate(() => document.querySelector('.pj-world').style.transform)
  // the stage's empty left margin, clear of every artboard and the dock
  const box = await page.evaluate(() => { const r = document.querySelector('.pj-stage').getBoundingClientRect(); return { x: r.left + 24, y: r.top + r.height / 2 } })
  await page.click('.pj-dock [data-tool="frame"]'); await wait(500)
  const t0 = await at()
  await page.mouse.move(box.x, box.y); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + i * 20, box.y - i * 6)
  await page.mouse.up(); await wait(300)
  ok((await at()) !== t0, `Project @${w}: a drag on the stage pans it`)
  const pm = await mode(page)
  ok(pm.mode === 'project', `Project @${w}: a drag does not open anything (${pm.mode}/${pm.view})`)
  await page.click('.pj-dock [data-tool="frame"]'); await wait(500)
  ok((await at()) === t0, `Project @${w}: Frame brings every artboard back into view`)
}

async function artboards(page, w) {
  for (const [sel, view] of [['.ab.page', 'canvas'], ['.ab.film', 'video'], ['.ab.app, .ab.game', 'app']]) {
    const r = await page.evaluate(q => { const el = document.querySelector(q); if (!el) return null; el.scrollIntoView(); const b = el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2, hit = document.elementFromPoint(x, y); return { x, y, top: !!hit && (hit === el || el.contains(hit)) } }, sel)
    if (!r) continue
    ok(r.top, `Project @${w}: ${sel} is the topmost element at its centre`)
    await page.mouse.dblclick(r.x, r.y); await wait(1200)
    const m = await mode(page)
    ok(m.mode === 'station' && m.view === view, `Project @${w}: a double-click on ${sel} opens its room (${m.mode}/${m.view})`)
    if (w === 1280 || w === 768) await shot(page, `room-${view}-${w}.png`)
    await tips(page, `${view} room @${w}`)
    await page.keyboard.press('Escape'); await wait(900)
    if ((await mode(page)).mode === 'station') { await page.keyboard.press('Escape'); await wait(900) }
    ok((await mode(page)).mode === 'project', `Project @${w}: Esc in the ${view} room goes back to the project`)
    // the inspector slides over the stage: Esc clears the selection before the next artboard
    if (await page.isVisible('.pj-insp')) { await page.keyboard.press('Escape'); await wait(300) }
    ok((await mode(page)).mode === 'project' && !(await page.isVisible('.pj-insp')), `Project @${w}: Esc clears the selection and stays in the project`)
  }
}

// a page's sections: a click on the selected page picks the one under it, the inspector edits it,
// the dock talks about it, the Layers panel picks too, and Esc steps back to the page (nothing saved)
async function sections(page, w) {
  await page.evaluate(() => { const a = document.querySelector('.ab.page'); a?.scrollIntoView() })
  const a = await page.$('.ab.page')
  if (!a) return
  await a.click(); await wait(500)
  const rows = await page.$$eval('.pj-insp .pj-ly', r => r.length)
  ok(rows > 0, `Sections @${w}: a selected page lists its sections (${rows})`)
  const b = await a.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.35); await wait(600)
  const got = await page.evaluate(() => ({ back: !!document.querySelector('.pj-insp .pj-back'), outline: !!document.querySelector('.ab .lsel'), text: document.querySelectorAll('.pj-insp [data-text]').length, code: !!document.querySelector('.pj-insp [data-act="code"]'), scope: !document.querySelector('.pj-scope')?.hidden, design: document.body.classList.contains('design-on'), pin: !!document.querySelector('.cbox') && getComputedStyle(document.querySelector('.cbox')).display !== 'none' }))
  ok(got.back && got.outline && got.text > 0 && got.code, `Sections @${w}: a click on the page picks a section: outlined, its words, Code (${JSON.stringify(got)})`)
  ok(got.scope && !got.design && !got.pin, `Sections @${w}: the dock is scoped to it, and the room's Design panel and comment pin stay away`)
  await page.click('.pj-insp [data-act="code"]'); await wait(300)
  ok(await page.isVisible('.pj-code textarea'), `Sections @${w}: Code opens the section's HTML`)
  await page.keyboard.press('Escape'); await wait(300)
  ok(!(await page.$('.pj-code')), `Sections @${w}: Esc closes the code editor`)
  await page.keyboard.press('Escape'); await wait(300)
  ok(!(await page.$('.pj-insp .pj-back')) && await page.isVisible('.pj-insp'), `Sections @${w}: Esc steps back from the section to its page`)
  // the Layers panel picks a section on this canvas too
  await page.click('.pj-tab[data-tab="layers"]'); await wait(300)
  await page.click('.pj-layers .ly[data-key] >> nth=2'); await wait(500)
  ok(!!(await page.$('.pj-insp .pj-back')) && (await mode(page)).mode === 'project', `Sections @${w}: a Layers row picks that section in the inspector`)
  await page.click('.pj-tab[data-tab="files"]')
  await page.keyboard.press('Escape'); await wait(200); await page.keyboard.press('Escape'); await wait(300)
}

async function cardPick(page, w) {
  const c = await page.$('.home .card:not(.asset)')
  ok(!!c, `Projects @${w}: a project card is showing`)
  if (!c) return
  await c.click(); await wait(2200)
  ok((await mode(page)).mode === 'project', `Projects @${w}: a click on a card opens its project`)
  await page.evaluate(() => window.swarmCosmos.go('home')); await wait(600)
}

async function home(page, w) {
  // from each view: the logo lands on Projects
  const views = [
    ['project', () => window.swarmCosmos.go('project')],
    ['Design deck', () => window.swarmCosmos.go('station', 'canvas')],
    ['App view', () => window.swarmCosmos.go('station', 'app')],
    ['Film studio', () => window.swarmCosmos.go('station', 'video')],
  ]
  for (const [name, enter] of views) {
    await page.evaluate(enter); await wait(900)
    // in a project the breadcrumb's Projects is the way home (the logo shows everywhere else)
    await page.click(name === 'project' ? '.pj-up' : '.topbar .brand'); await wait(900)
    const m = await mode(page)
    ok(m.mode === 'home', `Home @${w}: the logo goes to Projects from ${name} (${m.mode})`)
  }
  // Esc climbs: room → project → Projects
  await page.evaluate(() => window.swarmCosmos.go('project')); await wait(400)
  await page.evaluate(() => window.swarmCosmos.go('station', 'app')); await wait(900)
  await page.mouse.click(5, 300).catch(() => {})
  await page.keyboard.press('Escape'); await wait(500)
  const a = await mode(page)
  await page.keyboard.press('Escape'); await wait(900)
  const b = await mode(page)
  ok(a.mode === 'project' && b.mode === 'home', `Home @${w}: Esc goes room → project → Projects (${a.mode} → ${b.mode})`)
  // the old layout is gone: ☰ has no Classic view, and nothing shows the star map
  const gone = await page.evaluate(() => { document.querySelector('#more-btn').click(); const r = !document.querySelector('#cosmos-classic') && !document.querySelector('.starmap, .warp, .node'); document.querySelector('#more-btn').click(); return r })
  ok(gone, `Home @${w}: there is no Classic view and no star map`)
  // the side panel is Chat and Log only: builds live on Projects, layers on the project canvas
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.side .tabs [data-tab]')].map(b => b.dataset.tab).join(',') + (document.querySelector('#new-file, #files, .file-tools') ? ',old-files' : ''))
  ok(tabs === 'chat,log', `Home @${w}: the side panel has Chat and Log only (${tabs})`)
  // /new goes to Projects
  const nw = await page.evaluate(async () => { window.swarmCosmos.go('project'); await new Promise(r => setTimeout(r, 400)); const b = document.querySelector('#brief'); b.value = '/new'; document.querySelector('#brief-form').requestSubmit(); await new Promise(r => setTimeout(r, 500)); return document.body.classList.contains('cosmos-home') })
  ok(nw, `Home @${w}: /new goes to Projects`)
}

const browser = await chromium.launch()
try {
  // a finished build to look at
  if (!RUN) {
    const p = await browser.newPage()
    await p.goto(BASE + '/')
    await p.waitForFunction(() => window.swarm, null, { timeout: 15000 })
    RUN = await p.evaluate(async () => (await (await window.swarm.api('/api/runs')).json()).find(f => f.pages > 1 && !f.live)?.id || '')
    await p.close()
  }
  if (!RUN) throw new Error('no finished build on this server: copy one into its runs folder, or pass --run')
  console.log(`ui-check: ${BASE}, build ${RUN}`)

  const WIDTHS = (arg('widths', '') || '').split(',').filter(Boolean).map(Number)
  for (const [w, h] of [[1280, 800], [1024, 768], [768, 1024]].filter(([w]) => !WIDTHS.length || WIDTHS.includes(w))) {
    console.log(`· ${w}×${h}`)
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    page.on('pageerror', e => ok(false, `@${w}: page error ${e.message}`))
    await fresh(page)
    await overlaps(page, `Projects @${w}`)
    if (w === 1280 || w === 768) await shot(page, `projects-${w}.png`)
    await cardPick(page, w)

    await fresh(page, `/?run=${encodeURIComponent(RUN)}`)
    ok((await mode(page)).mode === 'project', `Project @${w}: ?run= opens the project`)
    await overlaps(page, `Project @${w}`)
    if (w === 1280 || w === 768) {
      await shot(page, `project-${w}.png`)
      // one sound control: ☰ → Sound switches the crew's voices on and off
      const snd = () => page.evaluate(() => window.swarm.sound())
      const s0 = await snd()
      await page.evaluate(() => document.querySelector('#more-btn').click()); await wait(300)
      await page.click('#cosmos-sound'); await wait(200)
      ok((await snd()) !== s0, `Sound @${w}: ☰ → Sound switches the crew's voices (${s0} → ${await snd()})`)
      ok(!(await page.$('.sound-dock, #sound-more')) && !(await page.isVisible('#crew-mute')), `Sound @${w}: no second sound control in the studio`)
      await page.evaluate(m => window.swarm.sound(m), s0)
      if (await page.isVisible('#more-menu')) { await page.keyboard.press('Escape'); await wait(200) }
      await page.evaluate(() => document.querySelector('#more-btn').click()); await wait(300)
      await tips(page, `☰ menu @${w}`)
      await page.keyboard.press('Escape'); await wait(200)
    }
    await modeMenu(page, w)
    await canvasPan(page, w)
    await sections(page, w)
    await artboards(page, w)
    await home(page, w)
    // a replay opens the project and the logo still goes home
    await fresh(page, `/?replay=${encodeURIComponent(RUN)}`)
    await page.click('.pj-up'); await wait(900)
    ok((await mode(page)).mode === 'home', `Home @${w}: the logo goes to Projects from a replay`)
    await page.close()
  }

  if (WIDTHS.length && !WIDTHS.includes(390)) throw 'done'
  console.log('· 390×844')
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await fresh(page)
  ok(await page.evaluate(hscroll) <= 0, '390: Projects does not scroll sideways')
  await fresh(page, `/?run=${encodeURIComponent(RUN)}`)
  ok(await page.evaluate(hscroll) <= 0, '390: a project does not scroll sideways')
  for (const v of ['canvas', 'video', 'app']) {
    await page.evaluate(view => window.swarmCosmos.go('station', view), v); await wait(900)
    ok(await page.evaluate(hscroll) <= 0, `390: the ${v} room does not scroll sideways`)
  }
  await page.evaluate(() => window.swarmCosmos.go('project')); await wait(1200)
  await narrow(page, 390)
  await page.close()
  // Hermes Desktop's side pane is often 500 to 700 px wide
  console.log('· 700×800')
  const pane = await browser.newPage({ viewport: { width: 700, height: 800 } })
  await fresh(pane, `/?run=${encodeURIComponent(RUN)}`)
  ok(await pane.evaluate(hscroll) <= 0, '700: a project does not scroll sideways')
  await narrow(pane, 700)
  await pane.close()
} catch (e) {
  if (e !== 'done') throw e
} finally {
  await browser.close()
}
console.log(fails.length ? `\nui-check: ${fails.length} failed, ${passes} passed` : `\nui-check: all ${passes} checks passed`)
process.exit(fails.length ? 1 : 0)
