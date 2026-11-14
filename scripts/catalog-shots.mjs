// The pictures for the Hermes plugin catalog (docs/catalog/README.md): six screens at 1440×900, and the
// 1200×600 banner rendered from docs/catalog/banner.html.
//
//   node scripts/catalog-shots.mjs             the six screens into docs/catalog/
//   node scripts/catalog-shots.mjs --banner    only the banner (banner.html → banner.png)
//   --only home,crew  --out dir  --keep (leave the Studio running and print its address)
//   (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check)
//
// It starts its own throwaway Studio (scripts/walkthrough-fixtures.mjs: its own port and data folder, a model
// that always fails) and seeds one demo project, Lantern & Loaf: a finished site and a second version the crew
// is still building. A screen it cannot reach is skipped with the reason, so a rerun after the UI changes
// says what moved instead of failing. Rerun it right before the catalog repin.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { studio } from './walkthrough-fixtures.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const OUT = resolve(ROOT, arg('out', 'docs/catalog'))
const ONLY = arg('only', '')
const wait = ms => new Promise(r => setTimeout(r, ms))

async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: set PLAYWRIGHT_DIR')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}

// ---------- the demo project: a night bakery's site, done once and being extended by the crew
const CREW = ['Pip', 'Mochi', 'Lumi', 'Nova', 'Zuzu', 'Bean', 'Kiki', 'Tofu'] // engine/run.mjs AGENT_NAMES, in order
const SHADES = ['#f4f4f5', '#d4d4d8', '#b4b4ba', '#a1a1aa', '#8e8e93', '#71717a', '#5a5a60', '#46464b'] // white to graphite
const BRIEF = 'Lantern & Loaf, a night bakery that delivers warm bread after midnight'
const INK = '#2b1d14', CREAM = '#f7efe3', EMBER = '#e0793a', NIGHT = '#16131f'
const serif = "font-family:Georgia,'Times New Roman',serif", sans = 'font-family:system-ui,Segoe UI,sans-serif'
const S = {
  hero: (t, l) => `<section style="${sans};background:linear-gradient(160deg,${NIGHT},#2a1f3a);color:${CREAM};padding:96px 72px;min-height:760px;display:grid;grid-template-columns:1.2fr 1fr;gap:48px;align-items:center"><div><p style="letter-spacing:.2em;text-transform:uppercase;color:${EMBER};font-size:14px;margin:0 0 20px">Open 11 pm – 5 am</p><h1 style="${serif};font-size:76px;line-height:1;margin:0 0 24px">${t}</h1><p style="font-size:22px;opacity:.8;max-width:520px;margin:0 0 36px">${l}</p><a style="display:inline-block;background:${EMBER};color:${NIGHT};padding:18px 30px;border-radius:999px;font-weight:700;font-size:18px">Order tonight's bake</a></div><div style="aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 40% 35%,#f6c27a,#c66a2c 55%,#5a2a12);box-shadow:0 0 120px #e0793a55"></div></section>`,
  menu: t => `<section style="${sans};background:${CREAM};color:${INK};padding:80px 72px;min-height:560px"><h2 style="${serif};font-size:48px;margin:0 0 40px">${t}</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px">${[['Midnight sourdough', '£6', '#c98a4b'], ['Cardamom knots', '£3', '#e3b06b'], ['Rye & fennel', '£5', '#8a5a34']].map(([n, p, c]) => `<div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 8px 30px #2b1d1418"><div style="height:180px;border-radius:14px;background:radial-gradient(circle at 50% 60%,${c},#5a3416)"></div><h3 style="${serif};font-size:26px;margin:20px 0 6px">${n}</h3><p style="margin:0;color:${EMBER};font-weight:700;font-size:20px">${p}</p></div>`).join('')}</div></section>`,
  how: t => `<section style="${sans};background:#efe2cf;color:${INK};padding:80px 72px;min-height:520px"><h2 style="${serif};font-size:48px;margin:0 0 40px">${t}</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:36px">${[['1', 'Pick by 10 pm', 'Choose loaves from tonight\'s list.'], ['2', 'We bake at 1', 'Every order baked to order.'], ['3', 'At your door by 5', 'Warm, wrapped, on the step.']].map(([n, h, p]) => `<div><div style="width:56px;height:56px;border-radius:50%;background:${NIGHT};color:${CREAM};display:grid;place-items:center;${serif};font-size:28px">${n}</div><h3 style="font-size:24px;margin:18px 0 8px">${h}</h3><p style="font-size:18px;opacity:.75;margin:0">${p}</p></div>`).join('')}</div></section>`,
  quote: () => `<section style="${serif};background:${NIGHT};color:${CREAM};padding:96px 72px;min-height:420px;text-align:center"><p style="font-size:40px;font-style:italic;max-width:900px;margin:0 auto 24px">"Still warm at 4 am. The night shift has never eaten better."</p><p style="${sans};color:${EMBER};letter-spacing:.15em;text-transform:uppercase">Ana, A&amp;E nurse</p></section>`,
  footer: t => `<section style="${sans};background:#0e0c14;color:#bdb3a6;padding:56px 72px;min-height:260px;display:flex;justify-content:space-between;align-items:end"><div><p style="${serif};font-size:32px;color:${CREAM};margin:0 0 8px">${t}</p><p style="margin:0">14 Ember Lane · open nightly</p></div><p style="margin:0">Instagram · Order · Wholesale</p></section>`
}
const PAGES = [
  ['home', 'Lantern & Loaf', [['hero', 760], ['menu', 560], ['how', 520], ['quote', 420], ['footer', 260]]],
  ['menu', 'Tonight’s bake', [['hero', 760], ['menu', 560], ['footer', 260]]],
  ['order', 'Order', [['hero', 760], ['how', 520], ['footer', 260]]],
  ['story', 'Our story', [['hero', 760], ['quote', 420], ['footer', 260]]]
]
const html = (role, title) => role === 'hero' ? S.hero(title, 'Warm bread at your door after midnight, for night shifts and night owls.') : S[role](role === 'menu' ? 'Tonight’s bake' : role === 'how' ? 'How it works' : title)

// a run's events: every page and layer planned, the crew assigned; `done` layers finished, the rest mid-stream
function seedRun({ runs, run, t, crew, done }) {
  const agents = crew.map((name, i) => ({ id: `a${i}`, name, color: SHADES[i] }))
  const ev = [{ type: 'run:start', t, run, brief: BRIEF, agents }]
  ev.push({ type: 'theme', t: t + 10, run, name: 'Ember', direction: 'warm night bakery', vars: { '--background': NIGHT, '--foreground': CREAM, '--primary': EMBER } })
  PAGES.forEach(([pid, title], i) => ev.push({ type: 'page', t: t + 20 + i, run, id: pid, title, purpose: '', index: i }))
  const all = PAGES.flatMap(([pid, title, roles]) => roles.map(([role, height]) => ({ pid, title, role, height })))
  ev.push({ type: 'plan:done', t: t + 50, run, ms: 50, pages: PAGES.length, layers: all.length })
  all.forEach((l, n) => ev.push({ type: 'layer:plan', t: t + 30, run, page: l.pid, id: `${l.role}`, role: l.role, height: l.height }))
  all.forEach((l, n) => {
    const agent = `a${n % agents.length}`
    ev.push({ type: 'agent:assign', t: t + 100 + n * 10, run, agent, page: l.pid, layer: l.role, role: l.role })
    const full = html(l.role, l.title)
    if (n < done) ev.push({ type: 'layer:done', t: t + 600 + n * 400, run, page: l.pid, layer: l.role, agent, ms: 400, done: n + 1, planned: all.length, html: full })
    else if (n < done + agents.length) ev.push({ type: 'layer:delta', t: t + 600 + n * 400, run, page: l.pid, layer: l.role, agent, text: full.slice(0, Math.round(full.length * (0.35 + 0.08 * (n % 6)))) })
  })
  if (done >= all.length) ev.push({ type: 'run:done', t: t + 30000, run, ms: 30000, planned: all.length, done: all.length, failed: 0, pages: PAGES.length })
  mkdirSync(join(runs, run))
  writeFileSync(join(runs, run, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
}

const demo = {}
const setup = ({ runs, rid }) => {
  demo.site = rid(20); demo.build = rid(21)
  seedRun({ runs, run: demo.site, t: Date.parse('2026-11-12T22:00:00Z'), crew: CREW, done: 99 })
  seedRun({ runs, run: demo.build, t: Date.now() - 60e3, crew: CREW, done: 6 })
  const f = JSON.parse(readFileSync(join(runs, 'folders.json'), 'utf8'))
  f.projects[demo.site] = { runs: [demo.site, demo.build], name: 'Lantern & Loaf', title: null, folder: null, trashed: null, made: Date.now() - 60e3, own: true }
  writeFileSync(join(runs, 'folders.json'), JSON.stringify(f))
}

// ---------- the screens, in the catalog's order
const vis = (page, sel, timeout = 8000) => page.locator(sel).first().waitFor({ state: 'visible', timeout })
const click = async (page, sel, timeout) => { await vis(page, sel, timeout); await page.locator(sel).first().click() }
const open = async (env, addr, root) => { await env.page.goto(env.BASE + addr); await vis(env.page, root, 15000); await wait(800) }
const deck = (env, run) => open(env, `/?version=${run}&room=deck`, '#viewport')
const hermesOn = page => page.evaluate(() => { window.swarm.hermesReady = async () => null })

const SHOTS = [
  // first open: Setup comes up by itself (captured first, before it is dismissed)
  { id: 'setup', title: 'Setup', run: async env => {
    await env.page.goto(env.BASE + '/'); await vis(env.page, '.ui-dialog.su', 15000)
    await env.page.locator('.su-head[data-row="models"]').first().click({ timeout: 3000 }).catch(() => {})
  }, settle: 1500 },
  { id: 'home', title: 'Projects', run: async env => { await env.page.locator('.su-start, .ui-dialog-close').first().click({ timeout: 3000 }).catch(() => {}); await open(env, '/', '.home') }, settle: 1500 },
  { id: 'studio', title: 'The Studio scaffold, with Layers', run: async env => {
    // a Studio project of its own (spec 37): the scaffold is for a project before anything is built
    if (!demo.studio) demo.studio = (await env.api('/api/studio', { kind: 'site', idea: BRIEF, depth: 'thorough' })).project?.id
    await open(env, `/?room=studio&project=${demo.studio}`, '.scaffold')
    await env.page.locator('[data-tab="layers"], .sc-layers, button:has-text("Layers")').first().click({ timeout: 2500 }).catch(() => {})
  }, settle: 2500 },
  { id: 'brand', title: 'The brand sheet', run: async env => {
    await open(env, '/', '.home'); await hermesOn(env.page)
    await env.page.evaluate(b => window.swarmCosmos.brand({ brief: b, kind: 'site' }), BRIEF)
    await vis(env.page, '.brand-sheet', 10000)
  }, settle: 5000 },
  { id: 'crew', title: 'The crew building on the Design deck', run: env => deck(env, demo.build), settle: 3500 },
  { id: 'site', title: 'A finished site', run: async env => { await deck(env, demo.site); await click(env.page, '#play-btn'); await vis(env.page, '#player') }, settle: 2500 }
]

async function shots(chromium) {
  const s = await studio({ setup })
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' })
  // The throwaway Studio's model always fails and its name would be this computer's user: the pictures show
  // the model check passing (Setup's "Working") and a demo name instead. Nothing else is stubbed.
  await ctx.route('**/api/setup/models', r => r.request().method() === 'POST'
    ? r.fulfill({ json: { ok: true, planner: { ok: true }, worker: { ok: true } } }) : r.fallback())
  await ctx.route('**/api/me', r => r.fulfill({ json: { name: 'Ana', handle: null, feed: 'http://127.0.0.1:9' } }))
  const page = await ctx.newPage()
  const env = { page, ...s }
  const made = []
  try {
    for (const shot of SHOTS) {
      if (ONLY && !ONLY.split(',').includes(shot.id)) continue
      try {
        await Promise.race([shot.run(env), wait(30000).then(() => { throw new Error('took over 30 s') })])
        await wait(shot.settle || 800)
        await page.evaluate(() => document.fonts.ready)
        // the throwaway Studio's model always fails: its toasts are not part of the picture
        await page.addStyleTag({ content: '.hm-toast,.toast,.ui-toast{display:none!important}' }).catch(() => {})
        const file = join(OUT, `${shot.id}.png`)
        await page.screenshot({ path: file })
        made.push(shot.id)
        console.log(`✓ ${shot.id}  ${shot.title}`)
      } catch (err) {
        console.log(`✗ ${shot.id}  not reached: ${String(err.message || err).split('\n')[0]}`)
      }
    }
  } finally {
    await browser.close()
    if (args.includes('--keep')) console.log(`Studio left running at ${s.BASE} (token walkthrough)`)
    else s.stop()
  }
  return made
}

async function banner(chromium) {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(join(ROOT, 'docs/catalog/banner.html')).href)
  await page.evaluate(() => document.fonts.ready)
  await wait(300)
  await page.screenshot({ path: join(OUT, 'banner.png') })
  await browser.close()
  console.log('✓ banner  1200×600')
}

const { chromium } = await loadPlaywright()
mkdirSync(OUT, { recursive: true })
if (args.includes('--banner')) await banner(chromium)
else {
  const made = await shots(chromium)
  if (!ONLY && made.length < SHOTS.length) process.exitCode = 1
}
