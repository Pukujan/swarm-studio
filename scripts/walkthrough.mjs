// The screen walkthrough (docs/ux/walkthrough): every screen and state a person can reach, in the
// order they meet them, at 1440 and 390 wide, each with what scripts/walkthrough-audit.js finds on it.
//
//   node scripts/walkthrough.mjs [--out docs/ux/walkthrough] [--only desk|phone]
//   (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check)
//
// It starts its own throwaway Studio (scripts/walkthrough-fixtures.mjs) for each width, so the first
// open shows Setup, and writes img/<width>-<nn>-<id>.jpg and shots.json. A step it cannot reach is
// kept as "not reached" with the reason.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { studio } from './walkthrough-fixtures.mjs'
import { STEPS } from './walkthrough-steps.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const OUT = resolve(ROOT, arg('out', 'docs/ux/walkthrough'))
const ONLY = arg('only', '')
const PICK = arg('steps', '')
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: set PLAYWRIGHT_DIR')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}
const { chromium } = await loadPlaywright()
const AUDIT = readFileSync(fileURLToPath(new URL('./walkthrough-audit.js', import.meta.url)), 'utf8')
const wait = ms => new Promise(r => setTimeout(r, ms))

mkdirSync(join(OUT, 'img'), { recursive: true })
const WIDTHS = [
  { key: 'desk', viewport: { width: 1440, height: 900 }, touch: false },
  { key: 'phone', viewport: { width: 390, height: 844 }, touch: true }
].filter(w => !ONLY || w.key === ONLY)

let shots = []
try { shots = JSON.parse(readFileSync(join(OUT, 'shots.json'), 'utf8')) } catch {}
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  for (const W of WIDTHS) {
    const s = await studio()
    const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: 1, isMobile: W.touch, hasTouch: W.touch, colorScheme: 'dark', reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const env = { page, ...s, W, wait, phone: W.touch }
    let n = 0
    try {
      for (const step of STEPS) {
        n++
        if (PICK && !PICK.split(',').includes(step.id)) continue
        if (step.only && step.only !== W.key) continue
        const name = `${W.key}-${String(n).padStart(2, '0')}-${step.id}`
        const rec = { width: W.key, n, id: step.id, title: step.title, flow: step.flow, file: `img/${name}.jpg`, w: W.viewport.width, h: W.viewport.height }
        errors.length = 0
        try {
          await Promise.race([step.run(env), wait(25000).then(() => { throw new Error('took over 25 s') })])
          await wait(step.settle ?? 500)
          await page.screenshot({ path: join(OUT, rec.file), type: 'jpeg', quality: 55 })
          rec.audit = await page.evaluate(`${AUDIT}(${JSON.stringify({ touch: W.touch })})`)
          rec.reached = true
        } catch (err) {
          rec.reached = false
          rec.why = String(err.message || err).split('\n')[0].slice(0, 200)
          try { await page.screenshot({ path: join(OUT, rec.file), type: 'jpeg', quality: 55 }) } catch {}
        }
        if (errors.length) rec.pageErrors = [...errors].slice(0, 3)
        console.log(`${rec.reached ? '✓' : '✗'} ${name}${rec.reached ? '' : `: ${rec.why}`}`)
        shots = shots.filter(x => !(x.width === rec.width && x.id === rec.id))
        shots.push(rec)
        try { await step.after?.(env) } catch {}
      }
    } finally {
      await ctx.close()
      s.stop()
    }
  }
} finally {
  await browser.close()
  shots.sort((a, b) => (a.width === b.width ? a.n - b.n : a.width === 'desk' ? -1 : 1))
  writeFileSync(join(OUT, 'shots.json'), JSON.stringify(shots, null, 1))
}
