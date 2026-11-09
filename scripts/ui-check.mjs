// UI check for docs/specs/12-flow-map.md: drives a running studio in a headless browser and fails
// on what the owner hit. Run it against a test server with at least one finished build:
//
//   node scripts/ui-check.mjs [--base http://127.0.0.1:4420] [--run <run id>] [--shots docs/specs/screens/flow]
//                             [--widths 1280,768,390]
//
// It needs Playwright with Chromium: the repo has no node_modules, so it uses `playwright` if it
// resolves, else the one at $PLAYWRIGHT_DIR (any folder whose node_modules has it).
//
// Checks, at 1280, 1024 and 768 wide: no two visible clickable boxes overlap on the Galaxy, the
// Start sheet and the Orbit; every station is the topmost element at its centre and opens its room;
// the Start sheet closes with Esc, an outside click and ×; its prompt box is fully visible and the
// launch-kit checkbox sits by its label; drag turns the galaxy and the orbit, a still click still
// picks; the logo and Esc lead home from every view (Classic, a room, App, a replay); the crew button
// is the one sound control and keeps its size in every state. At 390 wide nothing scrolls sideways.
//
// Tooltips (docs/ux/RULES.md, spec 12 rule 13): a title or data-tip is only ever the 1 to 3 word name
// of an icon-only button. So on every screen it visits, nothing that shows text has one; and the
// number of title= / data-tip in web/ may not go up from origin/main (106 when this check was added).
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
  ok(here <= base, `Tooltips: no more title= / data-tip in web/ than ${from} (${here} > ${base})`)
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
  .filter(el => el.checkVisibility?.({ visibilityProperty: true }) && (el.innerText || '').trim())
  .map(el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 2).join('.')}「${el.innerText.trim().replace(/\s+/g, ' ').slice(0, 20)}」 "${(el.getAttribute('title') ?? el.getAttribute('data-tip')).slice(0, 40)}"`)
async function tips(page, where) {
  const out = await page.evaluate(TIPS)
  ok(!out.length, `${where}: no title or data-tip on anything that shows text${out.length ? `\n      ${out.slice(0, 8).join('\n      ')}` : ''}`)
}

async function shot(page, file) { if (SHOTS) await page.screenshot({ path: join(SHOTS, file) }) }
async function overlaps(page, where) {
  const { n, out } = await page.evaluate(OVERLAPS)
  ok(n > 0, `${where}: found clickable things`)
  ok(!out.length, `${where}: no overlapping clickable boxes${out.length ? `\n      ${out.slice(0, 8).join('\n      ')}` : ''}`)
  await tips(page, where)
}
const mode = page => page.evaluate(() => ({ mode: window.swarmCosmos.mode, view: window.swarm.view, classic: window.swarmCosmos.classic }))
// a page still busy with an earlier navigation can abort the next one: try once more
const go = (page, url) => page.goto(BASE + url).catch(() => wait(500).then(() => page.goto(BASE + url)))
async function fresh(page, url = '/') {
  await go(page, url)
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await go(page, url)
  await page.waitForFunction(() => window.swarmCosmos?.galaxy && (window.swarmCosmos.mode !== 'galaxy' || document.querySelector('.galaxy.ready')), null, { timeout: 15000 })
  await wait(url.includes('run=') ? 4500 : 1800)
}

async function startSheet(page, w) {
  const open = async () => { await page.evaluate(() => window.swarm.submit('', true)); await page.waitForSelector('.auto-pop', { timeout: 4000 }); await wait(300) }
  await open()
  await overlaps(page, `Start sheet @${w}`)
  const m = await page.evaluate(() => {
    const ta = document.querySelector('.auto-pop .auto-prompt'), cb = document.querySelector('.auto-pop .auto-launch input'), tx = document.querySelector('.auto-pop .auto-launch span')
    ta.scrollIntoView({ block: 'center' })
    const a = ta.getBoundingClientRect(), c = cb.getBoundingClientRect(), t = tx.getBoundingClientRect()
    // beside the first line of its words, a few pixels from them
    return { taH: a.height, taW: a.width, gap: t.left - c.right, dy: c.top - t.top, cbW: c.width }
  })
  ok(m.taH >= 80 && m.taW >= 260, `Start sheet @${w}: prompt box fully visible (${Math.round(m.taW)}×${Math.round(m.taH)})`)
  ok(m.cbW <= 24 && m.gap >= 0 && m.gap <= 16 && m.dy >= -6 && m.dy <= 12, `Start sheet @${w}: launch-kit checkbox sits by its label (gap ${Math.round(m.gap)} px, ${Math.round(m.dy)} px down)`)
  if (w === 1280 || w === 768) {
    await page.evaluate(() => document.querySelector('.auto-pop').scrollTop = 0)
    await shot(page, `start-sheet-${w}.png`)
    await page.click('.auto-pop .auto-mode [data-m="pro"]'); await wait(900)
    await shot(page, `start-sheet-pro-${w}.png`)
    await tips(page, `Start sheet, Pro @${w}`)
    await page.click('.auto-pop .auto-mode [data-m="make"]'); await wait(200)
  }
  await page.keyboard.press('Escape'); await wait(200)
  ok(!(await page.$('.auto-pop')), `Start sheet @${w}: closes with Esc`)
  await open()
  // a click outside the sheet: on the empty top bar
  const sp = await page.evaluate(() => { const r = document.querySelector('.topbar .spacer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await page.mouse.click(sp.x, sp.y); await wait(200)
  ok(!(await page.$('.auto-pop')), `Start sheet @${w}: closes with an outside click`)
  await open()
  // the kit's tooltip: an icon-only button's name, after a short wait
  await page.hover('.auto-pop .gclose'); await wait(800)
  ok((await page.evaluate(() => document.querySelector('.ui-tooltip')?.textContent)) === 'Close', `Start sheet @${w}: the × names itself in the kit's tooltip`)
  await page.click('.auto-pop .gclose'); await wait(200)
  ok(!(await page.$('.auto-pop')), `Start sheet @${w}: closes with ×`)
}

async function dragTurns(page, which, w) {
  const before = await page.evaluate(k => window.swarmCosmos[k].nav.ty, which)
  const box = await page.evaluate(k => { const r = document.querySelector(k === 'galaxy' ? '.galaxy canvas' : '.orbit canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.12, y: r.top + r.height * 0.35 } }, which)
  await page.mouse.move(box.x, box.y); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + i * 22, box.y + i * 3)
  await page.mouse.up(); await wait(300)
  const st = await page.evaluate(k => ({ ty: window.swarmCosmos[k].nav.ty, mode: window.swarmCosmos.mode, re: !document.querySelector(k === 'galaxy' ? '.gx-recentre' : '.ob-recentre').hidden }), which)
  ok(Math.abs(st.ty - before) > 0.3, `${which} @${w}: drag turns the view`)
  ok(st.mode === which, `${which} @${w}: a drag does not pick anything`)
  ok(st.re, `${which} @${w}: Recentre shows after a drag`)
  await page.click(which === 'galaxy' ? '.gx-recentre' : '.ob-recentre'); await wait(900)
  ok(await page.evaluate(k => Math.abs(window.swarmCosmos[k].nav.ty) < 0.01, which), `${which} @${w}: Recentre brings it back`)
  const z0 = await page.evaluate(k => window.swarmCosmos[k].nav.tz, which)
  await page.mouse.move(box.x + 300, box.y); await page.mouse.wheel(0, 400); await wait(200)
  const z1 = await page.evaluate(k => window.swarmCosmos[k].nav.tz, which)
  ok(z1 !== z0 && z1 <= 1.71, `${which} @${w}: the wheel zooms, within limits`)
  await page.click(which === 'galaxy' ? '.gx-recentre' : '.ob-recentre').catch(() => {}); await wait(600)
}

async function stations(page, w) {
  const views = ['canvas', 'video', 'app']
  for (const v of views) {
    const r = await page.evaluate(view => {
      const el = [...document.querySelectorAll('.ob-label.station')][['canvas', 'video', 'app'].indexOf(view)]
      const b = el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2, hit = document.elementFromPoint(x, y)
      return { x, y, top: !!hit && (hit === el || el.contains(hit)), w: b.width, h: b.height, label: el.textContent }
    }, v)
    ok(r.top, `Orbit @${w}: ${r.label} is the topmost element at its centre`)
    ok(r.h >= 40, `Orbit @${w}: ${r.label} has a 40 px hit area`)
    await page.mouse.click(r.x, r.y); await wait(1200)
    const m = await mode(page)
    ok(m.mode === 'station' && m.view === v, `Orbit @${w}: a click on ${r.label} opens its room (${m.mode}/${m.view})`)
    if (w === 1280 || w === 768) await shot(page, `room-${v}-${w}.png`)
    await tips(page, `${r.label} @${w}`)
    await page.keyboard.press('Escape'); await wait(900)
    ok((await mode(page)).mode === 'orbit', `Orbit @${w}: Esc in ${r.label} goes back to the orbit`)
  }
}

async function galaxyPick(page, w) {
  const find = () => page.evaluate(() => { const x = window.swarmCosmos.galaxy.systems.find(s => s.show); return x && { x: x.sx, y: x.sy } })
  let s = await find()
  // with only a few builds every star may sit off screen: turn the galaxy by dragging until one shows
  for (let i = 0; !s && i < 14; i++) {
    const y = Math.round(page.viewportSize().height * 0.3)
    await page.mouse.move(60, y); await page.mouse.down()
    for (let k = 1; k <= 5; k++) await page.mouse.move(60 + k * 20, y)
    await page.mouse.up(); await wait(500)
    s = await find()
  }
  ok(!!s, `Galaxy @${w}: a star is showing`)
  if (!s) return
  // like a person: point at the star (the galaxy turns slowly, so aim again if it moved), then click
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(s.x, s.y); await wait(250)
    const hot = await page.evaluate(() => { const G = window.swarmCosmos.galaxy, x = G.hoverMouse || G.hover; return x && { x: x.sx, y: x.sy } })
    if (hot) { s = hot; break }
    s = (await find()) || s
  }
  const at = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}` : 'nothing' }, [s.x, s.y])
  await page.mouse.click(s.x, s.y); await wait(2200)
  const m = await mode(page)
  ok(m.mode === 'orbit', `Galaxy @${w}: a still click on a star opens its orbit (clicked ${at} at ${Math.round(s.x)},${Math.round(s.y)}; now ${m.mode})`)
}

async function home(page, w) {
  // from each view: the logo lands on the galaxy
  const views = [
    ['orbit', () => window.swarmCosmos.go('orbit')],
    ['Design deck', () => window.swarmCosmos.go('station', 'canvas')],
    ['App view', () => window.swarmCosmos.go('station', 'app')],
    ['Film studio', () => window.swarmCosmos.go('station', 'video')],
    ['Classic view', () => document.querySelector('#cosmos-classic').click()],
  ]
  for (const [name, enter] of views) {
    await page.evaluate(enter); await wait(900)
    await page.click('.topbar .brand'); await wait(900)
    const m = await mode(page)
    ok(m.mode === 'galaxy' && !m.classic, `Home @${w}: the logo goes to the galaxy from ${name} (${m.mode}${m.classic ? ', classic' : ''})`)
  }
  // Esc climbs: room → orbit → galaxy
  await page.evaluate(() => window.swarmCosmos.go('orbit')); await wait(400)
  await page.evaluate(() => window.swarmCosmos.go('station', 'app')); await wait(900)
  await page.mouse.click(5, 300).catch(() => {})
  await page.keyboard.press('Escape'); await wait(500)
  const a = await mode(page)
  await page.keyboard.press('Escape'); await wait(900)
  const b = await mode(page)
  ok(a.mode === 'orbit' && b.mode === 'galaxy', `Home @${w}: Esc goes room → orbit → galaxy (${a.mode} → ${b.mode})`)
  // Classic view can be switched off from where you are: the ☰ menu has it
  await page.evaluate(() => document.querySelector('#cosmos-classic').click()); await wait(600)
  await tips(page, `Classic view @${w}`)
  const vis = await page.evaluate(() => { document.querySelector('#more-btn').click(); const b = document.querySelector('#cosmos-classic'); const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('#cosmos-classic') === b })
  ok(vis, `Home @${w}: Classic view's own switch is reachable in Classic view`)
  await page.click('#cosmos-classic'); await wait(900)
  ok(!(await mode(page)).classic, `Home @${w}: Classic view switches back off`)
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
    await overlaps(page, `Galaxy @${w}`)
    if (w === 1280 || w === 768) await shot(page, `galaxy-${w}.png`)
    await dragTurns(page, 'galaxy', w)
    await startSheet(page, w)
    await galaxyPick(page, w)

    await fresh(page, `/?run=${encodeURIComponent(RUN)}`)
    ok((await mode(page)).mode === 'orbit', `Orbit @${w}: ?run= opens the orbit`)
    await overlaps(page, `Orbit @${w}`)
    if (w === 1280 || w === 768) {
      await shot(page, `orbit-${w}.png`)
      if (await page.$('.auto-panel.min .ap-head')) {
        await page.click('.auto-panel .ap-head'); await wait(400)
        await overlaps(page, `Orbit with the Auto panel open @${w}`)
        await shot(page, `orbit-auto-open-${w}.png`)
        if (await page.$('.auto-panel .ap-sum')) { await page.click('.auto-panel .ap-sum'); await wait(1200); await shot(page, `show-card-${w}.png`); await page.keyboard.press('Escape'); await wait(300); ok(!(await page.$('.show-sum')), `Show card @${w}: closes with Esc`) }
        await page.mouse.click(Math.round(w * 0.3), Math.round(h * 0.3)); await wait(400)
        ok(await page.evaluate(() => document.querySelector('.auto-panel').classList.contains('min') || document.querySelector('.auto-panel').hidden), `Orbit @${w}: the open Auto panel folds on an outside click`)
      }
      // one sound control: the crew button opens the modes and the volume, and never changes size
      const crew = () => page.evaluate(() => { const b = document.querySelector('#crew-mute'), r = b.getBoundingClientRect(), n = b.nextElementSibling?.getBoundingClientRect(); return { w: Math.round(r.width), x: Math.round(r.left), nx: Math.round(n?.left ?? 0), mode: b.dataset.mode } })
      const c0 = await crew()
      await page.click('#crew-mute'); await wait(300)
      ok(!!(await page.$('.sound-pop .ui-slider')) && (await page.$$('.sound-pop [data-mode]')).length === 3, `Sound @${w}: the crew button opens its modes and the volume`)
      ok(!(await page.$('.sound-dock, #sound-more')), `Sound @${w}: no second sound control`)
      await tips(page, `Sound @${w}`)
      await shot(page, `sound-${w}.png`)
      const seen = []
      for (const m of ['on', 'quiet', 'muted']) { await page.click(`.sound-pop [data-mode="${m}"]`); await wait(120); seen.push(await crew()) }
      ok(seen.map(s => s.mode).join() === 'on,quiet,muted', `Sound @${w}: each mode in the popover takes (${seen.map(s => s.mode).join()})`)
      ok(seen.every(s => s.w === c0.w && s.x === c0.x && s.nx === c0.nx), `Sound @${w}: the crew button and its neighbours stay put in every mode (${[c0, ...seen].map(s => `${s.w}@${s.x}`).join(' ')})`)
      await page.keyboard.press('Escape'); await wait(200)
      ok(!(await page.$('.sound-pop')), `Sound @${w}: its popover closes with Esc`)
      await page.keyboard.press('m'); await wait(150)
      ok((await crew()).mode === 'quiet', `Sound @${w}: the M key still steps the crew mode`)
      await page.keyboard.press('m'); await page.keyboard.press('m'); await wait(150)
      await page.evaluate(() => document.querySelector('#more-btn').click()); await wait(300)
      await tips(page, `☰ menu @${w}`)
      await page.keyboard.press('Escape'); await wait(200)
      await page.evaluate(() => document.querySelector('#game-btn').click()); await wait(1200)
      await shot(page, `new-game-${w}.png`)
      await tips(page, `New game @${w}`)
      const g = await page.evaluate(() => { const c = document.querySelector('.game-pop .gpromo input'), t = document.querySelector('.game-pop .gpromo span'); if (!c) return null; const a = c.getBoundingClientRect(), b = t.getBoundingClientRect(); return { gap: b.left - a.right, w: a.width } })
      if (g) ok(g.w <= 24 && g.gap >= 0 && g.gap <= 16, `New game @${w}: the promo checkbox sits by its label (gap ${Math.round(g.gap)} px)`)
      await page.keyboard.press('Escape'); await wait(300)
      ok(!(await page.$('.game-pop')), `New game @${w}: closes with Esc`)
    }
    await dragTurns(page, 'orbit', w)
    await stations(page, w)
    await home(page, w)
    // a replay opens the orbit and the logo still goes home
    await fresh(page, `/?replay=${encodeURIComponent(RUN)}`)
    await page.click('.topbar .brand'); await wait(900)
    ok((await mode(page)).mode === 'galaxy', `Home @${w}: the logo goes to the galaxy from a replay`)
    await page.close()
  }

  if (WIDTHS.length && !WIDTHS.includes(390)) throw 'done'
  console.log('· 390×844')
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await fresh(page)
  ok(await page.evaluate(hscroll) <= 0, '390: the galaxy does not scroll sideways')
  await page.evaluate(() => window.swarm.submit('', true)); await wait(500)
  ok(await page.evaluate(hscroll) <= 0, '390: the Start sheet does not scroll sideways')
  await fresh(page, `/?run=${encodeURIComponent(RUN)}`)
  ok(await page.evaluate(hscroll) <= 0, '390: the orbit does not scroll sideways')
  for (const v of ['canvas', 'video', 'app']) {
    await page.evaluate(view => window.swarmCosmos.go('station', view), v); await wait(900)
    ok(await page.evaluate(hscroll) <= 0, `390: the ${v} room does not scroll sideways`)
  }
  await page.evaluate(() => document.querySelector('#cosmos-classic').click()); await wait(500)
  await page.evaluate(() => document.querySelector('#views [data-view="app"]').click()); await wait(900)
  const tb = await page.evaluate(() => { const t = document.querySelector('.topbar').getBoundingClientRect(), s = document.querySelector('.side').getBoundingClientRect(); return { tw: t.width, sTop: s.top, tBottom: t.bottom } })
  ok(tb.tw >= 380 && tb.sTop >= tb.tBottom - 1, `390: in Classic App view the side panel stays under the top bar (top bar ${Math.round(tb.tw)} px wide)`)
  ok(await page.evaluate(hscroll) <= 0, '390: Classic App view does not scroll sideways')
  await page.click('.topbar .brand'); await wait(900)
  ok((await mode(page)).mode === 'galaxy', '390: the logo goes home from Classic App view')
  await page.close()
} catch (e) {
  if (e !== 'done') throw e
} finally {
  await browser.close()
}
console.log(fails.length ? `\nui-check: ${fails.length} failed, ${passes} passed` : `\nui-check: all ${passes} checks passed`)
process.exit(fails.length ? 1 : 0)
