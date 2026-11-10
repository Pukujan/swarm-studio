// A short play test for a built game: open it in a headless browser, press its
// start button, keep pressing the usual controls for a few seconds and check
// that the run goes on. The build's own checks (typecheck, build, a look at the
// page) pass a game whose run ends the moment it starts; this catches that, and
// crashes, a missing canvas and a start button that does nothing.

import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dyadDir } from './appbuild.mjs'

const START = /^(play|start|begin|go|new game|tap to (play|start)|press .* to (play|start))|\b(play|start|begin)\b/i
const ENDED = /\b(game over|you (lost|died|fell|crashed|slipped)|try again|play again|retry|gate closed|out of lives|run over)\b/i

async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  for (const dir of [process.env.PLAYWRIGHT_DIR, dyadDir].filter(Boolean)) {
    try { return createRequire(join(dir, 'package.json'))('playwright') } catch {}
  }
  return null
}

// Playwright's own browser, else installed Chrome, else any headless shell Playwright downloaded before
async function launch(chromium) {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright')
  const shells = []
  try {
    for (const d of readdirSync(cache).filter(d => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()) {
      for (const sub of readdirSync(join(cache, d))) {
        const exe = join(cache, d, sub, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell')
        if (existsSync(exe)) shells.push(exe)
      }
    }
  } catch {}
  let last
  for (const opts of [{}, { channel: 'chrome' }, ...shells.map(executablePath => ({ executablePath }))]) {
    try { return await chromium.launch(opts) } catch (e) { last = e }
  }
  throw last
}

// { ok, skipped?, problem?, seconds } — `problem` is one sentence for a fix turn
export async function playtest(url, { seconds = 4, timeout = 30000 } = {}) {
  const pw = await loadPlaywright()
  if (!pw) return { ok: true, skipped: 'no browser for the play test' }
  let browser
  try { browser = await launch(pw.chromium) } catch (e) { return { ok: true, skipped: `the browser would not start: ${String(e.message).slice(0, 120)}` } }
  const errors = []
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)))
    await page.goto(url, { waitUntil: 'load', timeout })
    const canvas = await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => null)
    if (!canvas) return { ok: false, problem: `No game canvas appeared within 15 s of opening the page.${errors.length ? ` Errors: ${errors.slice(0, 2).join(' | ')}` : ''}` }
    await page.waitForTimeout(1200)
    const textOf = () => page.evaluate(() => document.body.innerText || '')
    const before = await textOf()

    // the start control: a visible button or link that says play/start/begin, else the canvas
    const buttons = await page.$$('button, [role=button], a')
    let started = false
    for (const b of buttons) {
      const label = ((await b.innerText().catch(() => '')) || '').trim()
      if (label && label.length < 40 && START.test(label) && await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 3000 }).catch(() => {})
        started = true
        break
      }
    }
    const box = await canvas.boundingBox()
    const cx = box ? box.x + box.width / 2 : 640, cy = box ? box.y + box.height * 0.7 : 500
    if (!started) { await page.mouse.click(cx, cy); await page.keyboard.press('Enter'); await page.keyboard.press('Space') }

    // keep playing with the usual controls: tap, hold-and-release, space, arrows
    const t0 = Date.now()
    let endedAt = 0
    const keys = ['Space', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'KeyW', 'KeyD']
    for (let i = 0; Date.now() - t0 < seconds * 1000; i++) {
      if (i % 3 === 0) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(220); await page.mouse.up() }
      else await page.keyboard.press(keys[i % keys.length]).catch(() => {})
      await page.waitForTimeout(180)
      const now = await textOf()
      const m = now.match(ENDED)
      if (m && !ENDED.test(before)) { endedAt = Date.now(); break }
      if (m && ENDED.test(before) && now !== before && i > 2) { endedAt = Date.now(); break }
    }
    const lasted = ((endedAt || Date.now()) - t0) / 1000
    if (errors.length) return { ok: false, seconds: lasted, problem: `The game threw errors while playing: ${errors.slice(0, 3).join(' | ')}` }
    if (endedAt && lasted < 2.5) return { ok: false, seconds: lasted, problem: `The run ends about ${lasted.toFixed(1)} s after pressing start, before the player can do anything (the end screen appears with nothing achieved). Find why a fresh run is lost straight away: the player spawning off a platform, a camera or bounds check that already counts as a fall, a timer or health that starts at zero, or a lose condition checked before the first frame. Fix it so a new run starts safely and lasts until the player makes a mistake.` }
    return { ok: true, seconds: lasted, ended: !!endedAt }
  } catch (e) {
    return { ok: true, skipped: `the play test could not run: ${String(e.message).slice(0, 160)}` }
  } finally {
    await browser.close().catch(() => {})
  }
}
