// Motion parity: a screen moved to the next UI (ui/, served at /next/, issue #404) moves the way it does in the
// current Studio (/), which is the baseline (docs/ux/MOTION.md, "The next UI moves the same"). Both apps play
// the same scenes as the motion check (scripts/motion-check.mjs), plus three flows a person clicks through,
// on the same frozen clock with Math.random seeded, in the same throwaway Studio. For each screen that has
// moved, it compares:
//
//   animations   every CSS animation, transition and Web Animation that starts: its name (or property),
//                duration, iterations and easing, wherever it runs (the port's elements have other classes)
//   cursors      where Hermia's cursor and the crew's cursors are at every step of the clock, within --px
//   reduced      the same again with prefers-reduced-motion: reduce
//
// The end pictures are not compared: a port is not pixel-identical, and the audit gates check how it looks.
// A screen not moved yet (/next/ shows its name and "Open in the Studio") is skipped and said so.
//
//   node scripts/motion-parity.mjs run <dir> [--root <tree>] [--only a,b] [--px 24]   record both apps, compare
//   node scripts/motion-parity.mjs compare <dir> [--px 24] [--update]                 compare what run recorded
//     A difference already known is in docs/ux/motion/parity-known.json, labelled "intended (PR #N)" or "drift"
//     with a why; a new one fails. --update writes what was found there (new ones as "drift", to be labelled).
//   node scripts/motion-parity.mjs clips <dir> [--root <tree>] [--only a,b]           side-by-side videos
//   (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check; clips needs ffmpeg on PATH to put the two side by side)
//
// Like the motion check, each app is recorded twice and a difference counts only when both runs agree, since
// the page frames still draw on the real clock. Nothing is retried.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { studio } from './walkthrough-fixtures.mjs'
import { loadPlaywright, crewRun, SCENES, SEED, FROZEN } from './motion-check.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const [cmd, ...rest] = process.argv.slice(2)
const flag = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d }
const pos = rest.filter((x, i) => !x.startsWith('--') && !rest[i - 1]?.startsWith('--'))
const ONLY = (flag('only', '') || '').split(',').filter(Boolean)
const PX = Number(flag('px', 24))
const wait = ms => new Promise(r => setTimeout(r, ms))

// the flows a person clicks through: the Make menu, the Plan board, the Publish menu, the brand sheet and its picks.
// `act` runs at its time on the clock; the controls are found by role and name, which a port keeps.
const FLOWS = [
  { id: 'make', at: () => '/', ms: 3000, act: [{ t: 500, run: async p => { await p.getByRole('textbox', { name: 'What should the crew build?' }).first().fill('A ferry timetable for an island town', { timeout: 5000 }); await p.getByRole('button', { name: 'Make', exact: true }).first().click({ timeout: 5000 }) } }] },
  { id: 'plan', at: () => '/?room=plan', ms: 3000 },
  { id: 'publish', at: i => `/?project=${i.site}&version=${i.site}&room=deck`, ms: 2500, act: [{ t: 1000, run: p => p.getByRole('button', { name: 'Publish' }).first().click({ timeout: 5000 }) }] },
  { id: 'brand', at: i => `/?room=studio&project=${i.scaffold}&step=brand`, ms: 4000, act: [
    { t: 0, run: p => p.getByRole('button', { name: 'Brand sheet' }).first().press('Enter', { timeout: 5000 }) },
    { t: 2000, run: p => p.locator('.br-pal:not(.on)').first().click({ timeout: 5000 }) },
    { t: 3000, run: p => p.locator('.br-type:not(.on)').first().click({ timeout: 5000 }) }
  ] }
]
const ALL = [...SCENES, ...FLOWS].filter(s => !ONLY.length || ONLY.includes(s.id))
const address = (app, at) => app === 'next' ? `/next/${at.slice(1)}` : at

// every animation that starts, without its target: the name (or property), duration, iterations, easing.
// A CSS animation's timing function is on its keyframes; a transition's is its own.
const LOG = `(() => {
  const log = window.__parity = []
  const ms = v => typeof v === 'number' ? Math.round(v / 10) * 10 : String(v)
  const pick = e => e.target.getAnimations?.().find(a => e.type === 'animationstart' ? a.animationName === e.animationName : a.transitionProperty === e.propertyName)
  const css = e => {
    const a = pick(e)
    if (!a) return
    const t = a.effect.getTiming()
    if (t.iterations === Infinity) return
    const ease = e.type === 'animationstart' ? a.effect.getKeyframes()[0]?.easing || t.easing : t.easing
    log.push((e.type === 'animationstart' ? '@' + e.animationName : '~' + e.propertyName) + ' ' + ms(t.duration) + 'ms x' + t.iterations + ' ' + ease)
  }
  addEventListener('animationstart', css, true)
  addEventListener('transitionrun', css, true)
  const animate = Element.prototype.animate
  Element.prototype.animate = function (k, o) { const a = animate.call(this, k, o); const t = a.effect.getTiming(); log.push('js:animate ' + ms(t.duration) + 'ms x' + t.iterations + ' ' + t.easing); return a }
})()`
const TAKE = () => (window.__parity || []).splice(0)
const ENDLESS = () => document.getAnimations().filter(a => a.effect?.getTiming?.().iterations === Infinity).map(a => { const t = a.effect.getTiming(); return `@${a.animationName || a.transitionProperty || 'animate'} endless ${Math.round(Number(t.duration) / 10) * 10 || 0}ms ${a.effect.getKeyframes?.()[0]?.easing || t.easing}` })
// Hermia (.pet, web/pet.js) and the crew (.cursor, web/canvas/deck.js; [data-agent] in ui/src/screens/deck): where each one is, by name
const CURSORS = () => {
  const seen = {}
  return [...document.querySelectorAll('.pet, .cursor, [data-agent]')].filter(el => el.getClientRects().length && getComputedStyle(el).opacity !== '0').map(el => {
    const r = el.getBoundingClientRect()
    const who = el.classList.contains('pet') ? 'Hermia' : el.dataset.agent || el.querySelector('.tag span')?.textContent || 'cursor'
    seen[who] = (seen[who] || 0) + 1
    return { id: seen[who] > 1 ? `${who} ${seen[who]}` : who, x: Math.round(r.left), y: Math.round(r.top) }
  })
}
const NOT_MOVED = p => p.getByRole('link', { name: 'Open in the Studio' }).first().isVisible().catch(() => false)

async function startStudio(root) {
  const T = Date.parse('2026-11-01T09:00:00Z')
  const crew = new Date(T).toISOString().replace(/[:.]/g, '-')
  const s = await studio({ root, setup: ({ runs }) => { crewRun(runs, crew, T); writeFileSync(join(dirname(runs), 'setup.json'), '{"seen":true}') } })
  // a project still in the Studio, for the brand sheet
  const made = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
  return { s, ids: { ...s.ids, crew, scaffold: made.project.id } }
}
const launch = async () => (await loadPlaywright()).chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

// one recording of one app: per scene, per step of the clock, what started and where the cursors are
async function record(out, { root, app, reduced, scenes }) {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const { s, ids } = await startStudio(root)
  const browser = await launch()
  const trace = {}
  try {
    for (const sc of scenes) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: reduced ? 'reduce' : 'no-preference' })
      await ctx.addInitScript(SEED)
      await ctx.addInitScript(LOG)
      await ctx.clock.install({ time: FROZEN })
      await ctx.clock.pauseAt(new Date(FROZEN.getTime() + 1000))
      const page = await ctx.newPage()
      let pending = 0
      const counts = r => r.resourceType() !== 'eventsource'
      page.on('request', r => { if (counts(r)) pending++ })
      page.on('requestfinished', r => { if (counts(r)) pending-- })
      page.on('requestfailed', r => { if (counts(r)) pending-- })
      const settle = async () => {
        for (let i = 0; i < 500 && pending > 0; i++) await wait(20)
        await wait(120)
        for (const f of page.frames()) await f.evaluate(() => document.fonts?.ready.then(() => 0)).catch(() => {})
      }
      await page.goto(s.BASE + address(app, sc.at(ids)), { waitUntil: 'load' })
      await settle()
      const steps = []
      const every = sc.step || 500
      let broke = null
      for (let t = 0; t <= sc.ms; t += every) {
        if (t) await page.clock.runFor(every)
        for (const a of (sc.act || []).filter(a => a.t === t)) await a.run(page).catch(e => { broke ||= `in ${app === 'next' ? '/next/' : '/'} at ${t} ms: ${e.message.split('\n')[0]}` })
        await settle()
        // the stand-in for a screen not moved yet (ui/src/screens/NotMovedYet.tsx), here or after a click
        if (app === 'next' && await NOT_MOVED(page)) { trace[sc.id] = { notMoved: true }; break }
        const sig = []
        for (const [i, f] of page.frames().entries()) {
          sig.push(...(await f.evaluate(TAKE).catch(() => [])).map(x => `${i ? 'frame' : 'page'} ${x}`))
          sig.push(...[...new Set(await f.evaluate(ENDLESS).catch(() => []))].map(x => `${i ? 'frame' : 'page'} ${x}`))
        }
        steps.push({ t, sig: sig.sort(), cursors: await page.evaluate(CURSORS) })
      }
      if (!trace[sc.id]) trace[sc.id] = { steps, broke }
      const r = trace[sc.id]
      console.log(`· ${app}${reduced ? ' reduced' : ''} ${sc.id}: ${r.notMoved ? 'not moved yet' : `${r.steps.length} steps, ${new Set(r.steps.flatMap(x => x.sig)).size} kinds${r.broke ? `; its flow broke ${r.broke}` : ''}`}`)
      await ctx.close()
    }
  } finally {
    await browser.close()
    s.stop()
    writeFileSync(join(out, 'trace.json'), JSON.stringify(trace, null, 1))
  }
  return trace
}

const RUNS = ['current1', 'current2', 'next1', 'next2']
const load = dir => existsSync(join(dir, 'trace.json')) ? JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8')) : {}
const both = (x, y) => x.filter(k => y.includes(k)), either = (x, y) => [...new Set([...x, ...y])]
// a kind that takes no time (a 0 ms transition) moves nothing: left out
const kinds = steps => [...new Set(steps.flatMap(x => x.sig))].filter(k => !/ 0ms x/.test(k)).sort()

// one screen, one pair of recordings per app: what differs in both runs, each with a key that stays the same
// from run to run (docs/ux/motion/parity-known.json) and what was seen
function diff(name, [c1, c2, n1, n2]) {
  const out = []
  const [a1, a2, b1, b2] = [c1, c2, n1, n2].map(r => kinds(r.steps))
  for (const k of both(a1, a2).filter(k => !either(b1, b2).includes(k))) out.push({ key: `${name} only in /: ${k}`, detail: '' })
  for (const k of both(b1, b2).filter(k => !either(a1, a2).includes(k))) out.push({ key: `${name} only in /next/: ${k}`, detail: '' })
  // the cursors, step by step: the nearest of the four pairings, so a difference holds in both runs
  const far = {}
  const steps = Math.min(...[c1, c2, n1, n2].map(r => r.steps.length))
  for (let i = 0; i < steps; i++) {
    const at = r => Object.fromEntries(r.steps[i].cursors.map(c => [c.id, c]))
    const [A1, A2, B1, B2] = [c1, c2, n1, n2].map(at)
    const ids = either(both(Object.keys(A1), Object.keys(A2)), both(Object.keys(B1), Object.keys(B2)))
    for (const who of ids) {
      let d = Infinity
      for (const A of [A1, A2]) for (const B of [B1, B2]) if (A[who] && B[who]) d = Math.min(d, Math.hypot(A[who].x - B[who].x, A[who].y - B[who].y))
      if (d > PX && (!far[who] || d > far[who].d)) far[who] = { d, t: c1.steps[i].t, a: A1[who] || A2[who], b: B1[who] || B2[who] }
    }
  }
  for (const [who, f] of Object.entries(far)) {
    out.push(!f.a ? { key: `${name} cursor ${who}: only in /next/`, detail: `first at ${f.t} ms, ${f.b.x},${f.b.y}` }
      : !f.b ? { key: `${name} cursor ${who}: only in /`, detail: `at ${f.t} ms, ${f.a.x},${f.a.y}` }
      : { key: `${name} cursor ${who}: apart`, detail: `${Math.round(f.d)} px at ${f.t} ms (/ ${f.a.x},${f.a.y}; /next/ ${f.b.x},${f.b.y})` })
  }
  return out
}

// differences already known, each labelled "intended (PR #N)" or "drift" with a why, like the audit gates'
// known list: a new one fails, a known one that no longer happens is printed to delete
const KNOWN = join(ROOT, 'docs/ux/motion/parity-known.json')
const known = () => existsSync(KNOWN) ? JSON.parse(readFileSync(KNOWN, 'utf8')) : []

function compare(dir, { update = false } = {}) {
  const found = [], report = []
  for (const mode of ['', '-reduced']) {
    const T = RUNS.map(r => load(join(dir, r + mode)))
    for (const id of Object.keys(T[2])) {
      const name = `${id}${mode ? ' reduced' : ''}`
      if (T[2][id].notMoved || T[3][id]?.notMoved) { if (!mode) report.push(`- ${id}: not moved yet, skipped`); continue }
      const runs = T.map(t => t[id])
      if (runs.some(r => !r?.steps?.length)) { found.push({ key: `${name}: not recorded in every run`, detail: '' }); continue }
      const d = diff(name, runs)
      const broke = runs.map(r => r.broke).filter(Boolean)
      if (broke.length) d.push({ key: `${name}: the flow broke`, detail: broke[0] })
      // with reduced motion asked for, nothing moved to the next UI may move that / keeps still
      if (mode) {
        const before = either(kinds(runs[0].steps), kinds(runs[1].steps))
        for (const k of both(kinds(runs[2].steps), kinds(runs[3].steps)).filter(k => k.startsWith('page') && !/ endless /.test(k) && !before.includes(k))) d.push({ key: `${name} moves although reduced motion is asked for: ${k}`, detail: '' })
      }
      found.push(...d)
      report.push(`- ${id}${mode ? ' (reduced motion)' : ''}: ${d.length ? `${d.length} differences` : 'the same'} (${both(kinds(runs[0].steps), kinds(runs[1].steps)).length} kinds of animation in /, ${new Set(runs[0].steps.flatMap(s => s.cursors.map(c => c.id))).size} cursors)`)
    }
  }
  const list = known(), keys = new Set(list.map(k => k.key))
  const fresh = found.filter(f => !keys.has(f.key)), seen = new Set(found.map(f => f.key))
  const lines = found.map(f => { const k = list.find(x => x.key === f.key); return `  ${k ? `[${k.label}]` : '[new]'} ${f.key}${f.detail ? ` (${f.detail})` : ''}` })
  const stale = list.filter(k => !seen.has(k.key) && moved(dir).some(id => k.key.startsWith(`${id} `)))
  const text = `${report.join('\n')}\n${lines.length ? `\nDifferences:\n${lines.join('\n')}\n` : ''}${stale.length ? `\nKnown but not seen any more, delete from docs/ux/motion/parity-known.json:\n${stale.map(k => `  ${k.key}`).join('\n')}\n` : ''}`
  writeFileSync(join(dir, 'report.md'), text)
  console.log(`\n${text}`)
  if (update) {
    const next = found.map(f => list.find(x => x.key === f.key) || { key: f.key, label: 'drift', why: '' })
    const keep = list.filter(k => !seen.has(k.key) && !moved(dir).some(id => k.key.startsWith(`${id} `)))
    writeFileSync(KNOWN, JSON.stringify([...keep, ...next].sort((a, b) => a.key.localeCompare(b.key)), null, 2) + '\n')
    console.log(`wrote ${KNOWN}`)
  } else if (fresh.length) { console.log(`${fresh.length} new: fix them, or label them in docs/ux/motion/parity-known.json`); process.exit(1) }
  else console.log('The moved screens move the same, apart from the known differences.')
}
const moved = dir => Object.entries(load(join(dir, 'next1'))).filter(([, v]) => !v.notMoved).map(([id]) => id)

async function run(dir, root) {
  mkdirSync(dir, { recursive: true })
  // /next/ first: the screens not moved yet are seen at once and not recorded again
  const first = await record(join(dir, 'next1'), { root, app: 'next', reduced: false, scenes: ALL })
  const moved = ALL.filter(s => !first[s.id]?.notMoved)
  console.log(`moved: ${moved.map(s => s.id).join(', ') || 'none'}`)
  for (const [r, app, reduced] of [['current1', 'current', false], ['current2', 'current', false], ['next2', 'next', false],
    ['current1-reduced', 'current', true], ['current2-reduced', 'current', true], ['next1-reduced', 'next', true], ['next2-reduced', 'next', true]]) {
    if (!moved.length) { mkdirSync(join(dir, r), { recursive: true }); writeFileSync(join(dir, r, 'trace.json'), '{}'); continue }
    await record(join(dir, r), { root, app, reduced, scenes: moved })
  }
  // next1 keeps the not-moved marks; the others only have what moved
  compare(dir, { update: rest.includes('--update') })
}

// real-time videos of each scene in both apps, 640 wide, and the two side by side (ffmpeg's hstack)
async function clips(out, root) {
  mkdirSync(out, { recursive: true })
  const { s, ids } = await startStudio(root)
  const browser = await launch()
  const tmp = join(out, '.raw')
  const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0
  try {
    for (const sc of ALL) {
      const got = {}
      // /next/ first: a screen not moved yet is not recorded in / either
      for (const app of ['next', 'current']) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', recordVideo: { dir: tmp, size: { width: 640, height: 400 } } })
        const page = await ctx.newPage()
        const start = Date.now()
        await page.goto(s.BASE + address(app, sc.at(ids)), { waitUntil: 'load' })
        for (const a of sc.act || []) { await wait(Math.max(0, a.t - (Date.now() - start))); await a.run(page).catch(() => {}) }
        await wait(Math.max(0, Math.min(sc.ms, 8000) - (Date.now() - start)))
        const notMoved = app === 'next' && await NOT_MOVED(page)
        const v = page.video()
        await ctx.close()
        if (notMoved) { rmSync(await v.path(), { force: true }); break }
        renameSync(await v.path(), got[app] = join(out, `${sc.id}-${app}.webm`))
      }
      if (!got.next) { console.log(`· ${sc.id}: not moved yet`); continue }
      if (!ffmpeg) { console.log(`· ${sc.id}-current.webm, ${sc.id}-next.webm (no ffmpeg: not put side by side)`); continue }
      // left the current Studio, right the next UI; VP9 at a low rate, so a set stays small enough to commit
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', got.current, '-i', got.next, '-filter_complex', '[0:v][1:v]hstack=inputs=2:shortest=1', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-an', join(out, `${sc.id}.webm`)])
      if (r.status) throw new Error(`ffmpeg: ${r.stderr}`)
      console.log(`· ${sc.id}.webm (left /, right /next/)`)
    }
  } finally {
    await browser.close()
    s.stop()
    rmSync(tmp, { recursive: true, force: true })
  }
}

const root = resolve(flag('root', ROOT))
if (cmd === 'run' && pos[0]) await run(resolve(pos[0]), root)
else if (cmd === 'compare' && pos[0]) compare(resolve(pos[0]), { update: rest.includes('--update') })
else if (cmd === 'clips' && pos[0]) await clips(resolve(pos[0]), root)
else { console.log('node scripts/motion-parity.mjs run <dir> [--root <tree>] [--only a,b] [--px 24] | compare <dir> | clips <dir>'); process.exit(2) }
