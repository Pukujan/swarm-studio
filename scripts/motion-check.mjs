// Motion check: the Studio moves the same before and after a change that should not change it
// (the split of web/canvas.js into modules, docs/ux/MOTION.md). It plays the same scenes on a frozen
// clock (Playwright's clock: Date, timers, requestAnimationFrame) with Math.random seeded, steps the
// clock, and at every step records two things: what is animating (every CSS animation, transition
// and Web Animation in the page and its frames: name, target, timing) and a picture with the CSS
// animations held still. Two recordings are then compared step by step.
//
//   node scripts/motion-check.mjs record <dir> [--root <tree>] [--only a,b]   record this tree (or another)
//   node scripts/motion-check.mjs compare <dir-a> <dir-b> [--tolerance <pixels>] [--looks a,b]
//     --looks: scenes whose end picture a pull request means to change (its description's "Motion: looks
//     change in a, b" line, docs/ux/MOTION.md); their animations are still compared, only the picture is not
//   node scripts/motion-check.mjs clips <dir> [--only a,b]                   short real-time clips to watch
//   (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check)
//
// CI records the pull request's base and head in the same runner and compares them, so the pictures
// never depend on the machine. It starts its own throwaway Studio (scripts/walkthrough-fixtures.mjs)
// and never touches the 4319 server or the real data folder.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { studio } from './walkthrough-fixtures.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const [cmd, ...rest] = process.argv.slice(2)
const flag = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d }
const pos = rest.filter((x, i) => !x.startsWith('--') && !rest[i - 1]?.startsWith('--'))
const ONLY = (flag('only', '') || '').split(',').filter(Boolean)
const wait = ms => new Promise(r => setTimeout(r, ms))
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: npm i --no-save playwright, or set PLAYWRIGHT_DIR')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}

// a build with a crew of four that talks, gets reviewed, rests and takes a comment: most of what the
// deck animates during a build happens in this one replay
function crewRun(runs, run, t) {
  const crew = [['a0', 'Ada', '#d4d4d8'], ['a1', 'Bo', '#a1a1aa'], ['a2', 'Cy', '#e4e4e7'], ['a3', 'Di', '#71717a']]
  const ev = [{ type: 'run:start', t, run, brief: 'Harbour Lights, a ferry timetable for an island town', agents: crew.map(([id, name, color]) => ({ id, name, color })) }]
  ev.push({ type: 'theme', t: t + 10, run, name: 'Plain', direction: '', vars: { '--background': '#101012', '--foreground': '#ececee', '--primary': '#e4e4e7' } })
  const pages = [['home', 'Harbour Lights'], ['times', 'Timetable'], ['fares', 'Fares']], roles = ['hero', 'features', 'footer']
  pages.forEach(([id, title], i) => ev.push({ type: 'page', t: t + 20 + i, run, id, title, purpose: '', index: i }))
  ev.push({ type: 'plan:done', t: t + 60, run, ms: 60, pages: 3, layers: 9 })
  let n = 0
  pages.forEach(([pid, title], i) => roles.forEach((role, j) => {
    const a = `a${n % 4}`, at = t + 200 + n * 900
    ev.push({ type: 'layer:plan', t: t + 30 + i, run, page: pid, id: role, role, height: j ? 520 : 760 })
    ev.push({ type: 'agent:assign', t: at, run, agent: a, page: pid, layer: role, role })
    if (n % 3 === 0) ev.push({ type: 'agent:say', t: at + 300, run, agent: a, layer: role, text: `Taking the ${role} of ${title}.` })
    ev.push({ type: 'layer:done', t: at + 2400, run, page: pid, layer: role, agent: a, ms: 2100, done: n + 1, planned: 9, html: `<section style="padding:72px 64px;min-height:${j ? 520 : 760}px;background:${['#1d1d1f', '#2a2a2d', '#3a3a3e'][j]};color:#eee;font-family:system-ui"><h2 style="font-size:${j ? 40 : 64}px;margin:0 0 16px">${title}: ${role}</h2><p style="font-size:20px;max-width:640px;opacity:.8">Boats leave the harbour every hour from six.</p><a href="#times" style="color:#eee">See times</a></section>` })
    n++
  }))
  ev.push({ type: 'agent:idle', t: t + 9000, run, agent: 'a0' }, { type: 'agent:idle', t: t + 9100, run, agent: 'a1' })
  ev.push({ type: 'review:start', t: t + 9400, run, page: 'home', model: 'Reviewer' })
  ev.push({ type: 'review:issue', t: t + 10400, run, page: 'home', layer: 'features', agent: 'a2', problem: 'the times are too small to read' })
  ev.push({ type: 'review:done', t: t + 10600, run, page: 'home', verdict: 'one thing to fix', issues: [{ layer: 'features' }] })
  ev.push({ type: 'comment', t: t + 11000, run, text: 'Make the timetable easier to scan', layers: [{ page: 'times', layer: 'hero' }] })
  ev.push({ type: 'comment:take', t: t + 11300, run, agent: 'a3', page: 'times', layer: 'hero', role: 'hero' })
  ev.push({ type: 'run:done', t: t + 12000, run, ms: 12000, planned: 9, done: 9, failed: 0, pages: 3 })
  mkdirSync(join(runs, run))
  writeFileSync(join(runs, run, 'events.jsonl'), ev.map(e => JSON.stringify(e)).join('\n') + '\n')
}

// the scenes: an address, and how long to run the clock
const SCENES = [
  { id: 'projects', at: () => '/', ms: 3000 },
  { id: 'overview', at: i => `/?project=${i.site}&version=${i.site2}`, ms: 3000 },
  { id: 'replay', at: i => `/?replay=${i.crew}&speed=2`, ms: 16000 },
  { id: 'mid-build', at: i => `/?project=${i.mid}&version=${i.mid}&room=deck`, ms: 3000 },
  { id: 'deck', at: i => `/?project=${i.site}&version=${i.site}&room=deck`, ms: 3000 },
  { id: 'play', at: i => `/?project=${i.site}&version=${i.site}&room=deck&play=prototype`, ms: 3000 },
  { id: 'visitor', at: i => `/?project=${i.site}&version=${i.site}&room=deck&play=visitor`, ms: 10000 },
  { id: 'app', at: i => `/?project=${i.app}&version=${i.app}&room=app`, ms: 3000 },
  { id: 'film', at: i => `/?project=${i.film}&version=${i.film}&room=video`, ms: 3000 },
  { id: 'game', at: i => `/?project=${i.game}&version=${i.game}&room=game`, ms: 3000 },
  { id: 'studio', at: i => `/?room=studio&project=${i.site}`, ms: 3000 }
].filter(s => !ONLY.length || ONLY.includes(s.id))

// Math.random, seeded the same in the page and every frame (mulberry32)
const SEED = `(() => { let a = 0x5eed; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } })()`
// every animation that starts, in the page and every frame: CSS animations and transitions by their
// start events, Web Animations by wrapping animate(). Name, target and timing; never the progress,
// since CSS runs on the real clock. A transition turned round midway is shortened by how far it got,
// so durations are rounded.
const LOG = `(() => {
  const log = window.__motion = []
  const name = el => !el || !el.tagName ? '' : el.id ? '#' + el.id : el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map(c => '.' + c).join('') + (el.parentElement && el.parentElement.id ? '<#' + el.parentElement.id : '')
  const ms = v => typeof v === 'number' ? Math.round(v / 10) * 10 : String(v)
  // endless ones are restarted by every picture taken: they are counted as running, at the end of a step
  const css = e => { const cs = getComputedStyle(e.target); if (e.type === 'animationstart' && cs.animationIterationCount.split(',').every(v => v.trim() === 'infinite')) return; log.push((e.type === 'animationstart' ? '@' + e.animationName + ' ' + cs.animationDuration + ' ' + cs.animationIterationCount : '~' + e.propertyName) + ' ' + name(e.target)) }
  addEventListener('animationstart', css, true)
  addEventListener('transitionrun', css, true)
  const animate = Element.prototype.animate
  Element.prototype.animate = function (k, o) { const a = animate.call(this, k, o); const t = a.effect.getTiming(); log.push('js:animate ' + ms(t.duration) + 'ms x' + t.iterations + ' ' + name(this)); return a }
})()`
const TAKE = () => { const a = (window.__motion || []).splice(0); return a }
// the endless animations running now (a spinner, a caret, the radio's dashes)
const ENDLESS = () => document.getAnimations().filter(a => a.effect?.getTiming?.().iterations === Infinity).map(a => { const el = a.effect.target; return `@${a.animationName || 'animate'} endless ${el?.id ? `#${el.id}` : `${el?.tagName?.toLowerCase()}${el?.classList?.[0] ? `.${el.classList[0]}` : ''}`}` }).sort()
const FROZEN = new Date('2026-11-01T12:00:00Z')

async function record(out, { root = ROOT } = {}) {
  const { chromium } = await loadPlaywright()
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const T = Date.parse('2026-11-01T09:00:00Z')
  const crew = new Date(T).toISOString().replace(/[:.]/g, '-')
  const s = await studio({ root, setup: ({ runs }) => crewRun(runs, crew, T) })
  const ids = { ...s.ids, crew }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const trace = {}
  try {
    for (const sc of SCENES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' })
      await ctx.addInitScript(SEED)
      await ctx.addInitScript(LOG)
      // install lets time run on; pauseAt stops it, so only runFor moves the page's clock
      await ctx.clock.install({ time: FROZEN })
      await ctx.clock.pauseAt(new Date(FROZEN.getTime() + 1000))
      const page = await ctx.newPage()
      let pending = 0
      // the event stream stays open for good: it is not something to wait for
      const counts = r => r.resourceType() !== 'eventsource'
      page.on('request', r => { if (counts(r)) pending++ })
      page.on('requestfinished', r => { if (counts(r)) pending-- })
      page.on('requestfailed', r => { if (counts(r)) pending-- })
      // the page is settled when no request is out and the frames have drawn (real time, not the page's)
      const settle = async () => {
        for (let i = 0; i < 100 && pending > 0; i++) await wait(20)
        await wait(80)
        for (const f of page.frames()) await f.evaluate(() => document.fonts?.ready.then(() => 0)).catch(() => {})
      }
      const steps = []
      mkdirSync(join(out, sc.id))
      await page.goto(s.BASE + sc.at(ids), { waitUntil: 'load' })
      await settle()
      const every = sc.step || 500
      for (let t = 0; t <= sc.ms; t += every) {
        if (t) await page.clock.runFor(every)
        await settle()
        const sig = []
        for (const [i, f] of page.frames().entries()) {
          const a = await f.evaluate(TAKE).catch(() => [])
          sig.push(...a.map(x => `${i ? 'frame' : 'page'} ${x}`))
          const e = await f.evaluate(ENDLESS).catch(() => [])
          sig.push(...[...new Set(e)].map(x => `${i ? 'frame' : 'page'} ${x}`))
        }
        // the frames draw on the real clock: a step is taken once two pictures in a row agree
        let png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' })
        for (let k = 0, same = 0; k < 30 && same < (t ? 1 : 3); k++) {
          await wait(t ? 120 : 250)
          const next = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' })
          same = next.equals(png) ? same + 1 : 0
          png = next
        }
        // the pictures restart the endless animations: those starts are not the page's own
        for (const f of page.frames()) await f.evaluate(TAKE).catch(() => {})
        sig.sort()
        const file = `${String(t).padStart(6, '0')}.png`
        writeFileSync(join(out, sc.id, file), png)
        steps.push({ t, sig, png: createHash('sha1').update(png).digest('hex').slice(0, 16), file })
      }
      trace[sc.id] = { steps }
      console.log(`· ${sc.id}: ${steps.length} steps, ${new Set(steps.flatMap(x => x.sig)).size} distinct animations`)
      await ctx.close()
    }
  } finally {
    await browser.close()
    s.stop()
    writeFileSync(join(out, 'trace.json'), JSON.stringify(trace, null, 1))
  }
}

// pixels that differ between two pictures, counted in the browser (no image library needed)
async function pixelDiff(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src })
    const [x, y] = await Promise.all([load(a), load(b)])
    if (x.width !== y.width || x.height !== y.height) return Infinity
    const px = img => { const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data }
    const p = px(x), q = px(y)
    let n = 0
    for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) n++
    return n
  }, [a, b].map(f => `data:image/png;base64,${readFileSync(f).toString('base64')}`))
}

// one kind of animation: the target keeps its first class only (later ones are states, like .m-in)
const kind = x => x.replace(/^((?:page|frame) \S+(?: \S+ \S+)?) ([a-z0-9]+(?:\.[\w-]+)?)(?:\.[\w-]+)*/, '$1 $2')
const kinds = steps => [...new Set(steps.flatMap(x => x.sig.map(kind)))].sort()

const load = dir => JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8'))
const both = (x, y) => x.filter(k => y.includes(k)), either = (x, y) => [...new Set([...x, ...y])]

async function compare(before, after, tolerance = 2000, looks = []) {
  const [A1, A2] = before.map(load), [B1, B2] = after.map(load)
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const page = await browser.newPage()
  const fails = []
  try {
    for (const id of Object.keys(B1)) {
      const runs = [A1, A2, B1, B2].map(t => t[id]?.steps)
      if (runs.some(r => !r?.length)) { fails.push(`${id}: not recorded in every run`); continue }
      const [a1, a2, b1, b2] = runs.map(kinds)
      const lost = both(a1, a2).filter(k => !either(b1, b2).includes(k)), gained = both(b1, b2).filter(k => !either(a1, a2).includes(k))
      let bad = 0
      if (lost.length || gained.length) { bad++; fails.push(`${id}: the animations differ\n    ran before, not after: ${lost.join('\n                           ') || '-'}\n    ran after, not before: ${gained.join('\n                           ') || '-'}`) }
      // the picture it ends on: it differs only when neither after-run matches either before-run
      const end = (dir, r) => join(dir, id, r.at(-1).file)
      const pairs = [0, 1].flatMap(i => [2, 3].map(j => [i, j]))
      let n = Infinity
      for (const [i, j] of pairs) {
        n = Math.min(n, runs[i].at(-1).png === runs[j].at(-1).png ? 0 : await pixelDiff(page, end(before[i], runs[i]), end(after[j - 2], runs[j])))
        if (n <= tolerance) break
      }
      if (n > tolerance && looks.includes(id)) console.log(`  ${id}: the picture it ends on differs by ${n} pixels, as the pull request says it should`)
      else if (n > tolerance) { bad++; fails.push(`${id}: the picture it ends on differs by ${n} pixels (${end(after[0], runs[2])} against ${end(before[0], runs[0])})`) }
      console.log(`${bad ? '✗' : '✓'} ${id}: ${both(a1, a2).length} kinds of animation${bad ? ', differs' : ', the same'}`)
    }
  } finally { await browser.close() }
  if (fails.length) { console.log(`\n${fails.join('\n')}`); process.exit(1) }
  console.log('\nThe motion is the same.')
}

// short real-time clips at 640 wide, to watch (docs/ux/motion/clips)
async function clips(out) {
  const { chromium } = await loadPlaywright()
  mkdirSync(out, { recursive: true })
  const T = Date.parse('2026-11-01T09:00:00Z')
  const crew = new Date(T).toISOString().replace(/[:.]/g, '-')
  const s = await studio({ setup: ({ runs }) => crewRun(runs, crew, T) })
  const ids = { ...s.ids, crew }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const tmp = join(out, '.raw')
  try {
    for (const sc of SCENES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', recordVideo: { dir: tmp, size: { width: 640, height: 400 } } })
      const page = await ctx.newPage()
      await page.goto(s.BASE + sc.at(ids), { waitUntil: 'load' })
      await wait(Math.min(sc.ms, 8000))
      const v = page.video()
      await ctx.close()
      renameSync(await v.path(), join(out, `${sc.id}.webm`))
      console.log(`· ${sc.id}.webm`)
    }
  } finally {
    await browser.close()
    s.stop()
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log(readdirSync(out).join(' '))
}

if (cmd === 'record' && pos[0]) await record(resolve(pos[0]), { root: resolve(flag('root', ROOT)) })
else if (cmd === 'compare' && pos[1]) await compare(pos[0].split(',').map(d => resolve(d)), pos[1].split(',').map(d => resolve(d)), Number(flag('tolerance', 2000)), (flag('looks', '') || '').split(',').map(x => x.trim()).filter(Boolean))
else if (cmd === 'clips' && pos[0]) await clips(resolve(pos[0]))
else { console.log('node scripts/motion-check.mjs record <dir> [--root <tree>] | compare <a> <b> | clips <dir>'); process.exit(2) }
