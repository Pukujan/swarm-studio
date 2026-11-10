// UI check for docs/specs/12-flow-map.md: drives a running studio in a headless browser and fails
// on what the owner hit. Run it against a test server with at least one finished build:
//
//   node scripts/ui-check.mjs [--base http://127.0.0.1:4420] [--run <run id>] [--shots docs/specs/screens/flow]
//                             [--widths 1280,768,390]
//
// It needs Playwright with Chromium: the repo has no node_modules, so it uses `playwright` if it
// resolves, else the one at $PLAYWRIGHT_DIR (any folder whose node_modules has it).
//
// Checks, at 1280, 1024 and 768 wide: no two visible clickable boxes overlap on Projects, the
// Start sheet and a project's canvas; a click on a card opens its project; a drag on the stage pans
// it and Frame brings it back; a double-click on an artboard opens its room and Esc comes back; the
// Start sheet closes with Esc, an outside click and ×; the launch-kit checkbox sits by its label;
// the logo and Esc lead home from every view (Classic, a room, App, a replay); ☰ → Sound switches the
// crew's voices. At 390 wide nothing scrolls sideways.
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
const mode = page => page.evaluate(() => ({ mode: window.swarmCosmos.mode, view: window.swarm.view, classic: window.swarmCosmos.classic }))
// a page still busy with an earlier navigation can abort the next one: try once more
const go = (page, url) => page.goto(BASE + url).catch(() => wait(500).then(() => page.goto(BASE + url)))
async function fresh(page, url = '/') {
  await go(page, url)
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await go(page, url)
  await page.waitForFunction(() => window.swarmCosmos?.homeView && window.swarmCosmos.projectView, null, { timeout: 15000 })
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
  // no tooltips (docs/ux/RULES.md): the × is named by its aria-label only
  await page.hover('.auto-pop .gclose'); await wait(800)
  ok(!(await page.$('.ui-tooltip')), `Start sheet @${w}: the × shows no tooltip`)
  await page.click('.auto-pop .gclose'); await wait(200)
  ok(!(await page.$('.auto-pop')), `Start sheet @${w}: closes with ×`)
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
    ['Classic view', () => document.querySelector('#cosmos-classic').click()],
  ]
  for (const [name, enter] of views) {
    await page.evaluate(enter); await wait(900)
    // in a project the breadcrumb's Projects is the way home (the logo shows everywhere else)
    await page.click(name === 'project' ? '.pj-up' : '.topbar .brand'); await wait(900)
    const m = await mode(page)
    ok(m.mode === 'home' && !m.classic, `Home @${w}: the logo goes to Projects from ${name} (${m.mode}${m.classic ? ', classic' : ''})`)
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
    await overlaps(page, `Projects @${w}`)
    if (w === 1280 || w === 768) await shot(page, `projects-${w}.png`)
    await startSheet(page, w)
    await cardPick(page, w)

    await fresh(page, `/?run=${encodeURIComponent(RUN)}`)
    ok((await mode(page)).mode === 'project', `Project @${w}: ?run= opens the project`)
    await overlaps(page, `Project @${w}`)
    if (w === 1280 || w === 768) {
      await shot(page, `project-${w}.png`)
      if (await page.$('.auto-panel.min .ap-head')) {
        await page.click('.auto-panel .ap-head'); await wait(400)
        await overlaps(page, `Project with the Auto panel open @${w}`)
        await shot(page, `project-auto-open-${w}.png`)
        if (await page.$('.auto-panel .ap-sum')) { await page.click('.auto-panel .ap-sum'); await wait(1200); await shot(page, `show-card-${w}.png`); await page.keyboard.press('Escape'); await wait(300); ok(!(await page.$('.show-sum')), `Show card @${w}: closes with Esc`) }
        await page.mouse.click(Math.round(w * 0.3), Math.round(h * 0.3)); await wait(400)
        ok(await page.evaluate(() => document.querySelector('.auto-panel').classList.contains('min') || document.querySelector('.auto-panel').hidden), `Project @${w}: the open Auto panel folds on an outside click`)
      }
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
      await page.evaluate(() => document.querySelector('#game-btn').click()); await wait(1200)
      await shot(page, `new-game-${w}.png`)
      await tips(page, `New game @${w}`)
      const g = await page.evaluate(() => { const c = document.querySelector('.game-pop .gpromo input'), t = document.querySelector('.game-pop .gpromo span'); if (!c) return null; const a = c.getBoundingClientRect(), b = t.getBoundingClientRect(); return { gap: b.left - a.right, w: a.width } })
      if (g) ok(g.w <= 24 && g.gap >= 0 && g.gap <= 16, `New game @${w}: the promo checkbox sits by its label (gap ${Math.round(g.gap)} px)`)
      await page.keyboard.press('Escape'); await wait(300)
      ok(!(await page.$('.game-pop')), `New game @${w}: closes with Esc`)
    }
    await canvasPan(page, w)
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
  await page.evaluate(() => window.swarm.submit('', true)); await wait(500)
  ok(await page.evaluate(hscroll) <= 0, '390: the Start sheet does not scroll sideways')
  await fresh(page, `/?run=${encodeURIComponent(RUN)}`)
  ok(await page.evaluate(hscroll) <= 0, '390: a project does not scroll sideways')
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
  ok((await mode(page)).mode === 'home', '390: the logo goes home from Classic App view')
  await page.close()
} catch (e) {
  if (e !== 'done') throw e
} finally {
  await browser.close()
}
console.log(fails.length ? `\nui-check: ${fails.length} failed, ${passes} passed` : `\nui-check: all ${passes} checks passed`)
process.exit(fails.length ? 1 : 0)
