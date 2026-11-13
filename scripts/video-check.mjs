// Board videos hold no player they don't need (web/video.js, image-first boards §3.6), in a real Chromium:
// a board of 10 looping clips is scrolled top to bottom and back, and after every step at most 2 play, players
// are held only near the screen, and the ones scrolled past are torn down (no src, network state empty). Then
// the low-memory budget (1), a hovered clip freed when the pointer leaves, and clips taken out of the page freed.
//
//   node scripts/video-check.mjs            (PLAYWRIGHT_DIR and CHROMIUM_PATH as for open-check)
//
// The clip is recorded in the page (a canvas and MediaRecorder), so the check needs no media file. Chromium's
// own count of the players it created (the Media domain, what chrome://media-internals lists) is printed too.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) throw new Error('Playwright not found: set PLAYWRIGHT_DIR')
  const req = createRequire(join(resolve(dir), 'package.json'))
  try { return req('playwright') } catch { return req('playwright-core') }
}
const { chromium } = await loadPlaywright()
const VIDEO = readFileSync(join(ROOT, 'web', 'video.js'), 'utf8')
const fails = []
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what) }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const cdp = await page.context().newCDPSession(page)
  let created = 0
  cdp.on('Media.playersCreated', e => { created += e.players.length })
  await cdp.send('Media.enable')
  await page.setContent('<!doctype html><body style="margin:0;background:#111"><main id="board"></main></body>')
  await page.addScriptTag({ type: 'module', content: `${VIDEO}\nwindow.V = { boardVideo, adoptVideos, videoStats, videoBudget, dropVideo }` })
  await page.waitForFunction(() => !!window.V)

  // a 2-second clip, recorded here: a moving square
  const ok = await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 320, height: 180 }), g = c.getContext('2d')
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' })
    const parts = []
    rec.ondataavailable = e => parts.push(e.data)
    const done = new Promise(r => (rec.onstop = r))
    rec.start(100)
    const t0 = performance.now()
    await new Promise(r => { const f = () => { const t = performance.now() - t0; g.fillStyle = '#222'; g.fillRect(0, 0, 320, 180); g.fillStyle = '#e0793a'; g.fillRect((t / 8) % 320, 60, 60, 60); t < 2000 ? requestAnimationFrame(f) : r() }; f() })
    rec.stop()
    await done
    window.CLIP = URL.createObjectURL(new Blob(parts, { type: 'video/webm' }))
    return parts.length > 0
  })
  check(ok, 'a clip was recorded in the page')

  // the baseline, without the manager: 10 plain autoplaying <video>s, scrolled to the bottom
  const plain = await page.evaluate(async () => {
    const box = document.createElement('div')
    box.innerHTML = Array.from({ length: 10 }, () => `<video src="${window.CLIP}" autoplay muted loop playsinline style="display:block;width:640px;height:360px;margin:0 0 40px"></video>`).join('')
    document.body.append(box)
    await new Promise(r => setTimeout(r, 1200))
    scrollTo(0, document.body.scrollHeight)
    await new Promise(r => setTimeout(r, 800))
    const vs = [...box.querySelectorAll('video')]
    const out = { held: vs.filter(v => v.networkState !== v.NETWORK_EMPTY).length, playing: vs.filter(v => !v.paused).length }
    for (const v of vs) { v.pause(); v.removeAttribute('src'); v.load() }
    box.remove()
    scrollTo(0, 0)
    return out
  })
  console.log(`  baseline, plain <video autoplay>: ${plain.playing} of 10 playing and ${plain.held} players held after scrolling past them`)

  // the board: 10 looping clips, each 360 px tall, one above the other
  await page.evaluate(() => {
    const board = document.getElementById('board')
    board.innerHTML = Array.from({ length: 10 }, (_, i) => `<video id="v${i}" data-src="${window.CLIP}" data-poster="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-auto muted loop playsinline style="display:block;width:640px;height:360px;margin:0 0 40px"></video>`).join('')
    window.V.adoptVideos(board)
  })
  const stats = () => page.evaluate(() => ({ ...window.V.videoStats(), withSrc: document.querySelectorAll('video[src]').length, live: [...document.querySelectorAll('video')].filter(v => v.networkState !== v.NETWORK_EMPTY).length }))
  await page.waitForTimeout(1200)
  let worst = { playing: 0, held: 0 }
  const step = async label => {
    await page.waitForTimeout(700)
    const s = await stats()
    worst = { playing: Math.max(worst.playing, s.playing), held: Math.max(worst.held, s.held) }
    if (s.playing > 2 || s.held > 4) check(false, `${label}: ${s.playing} playing, ${s.held} held (at most 2 playing, 4 held near a 800 px screen)`)
    return s
  }
  const first = await step('at the top')
  check(first.playing >= 1 && first.playing <= 2, `at the top, ${first.playing} of the 10 play`)
  for (let y = 0; y <= 4000; y += 400) { await page.mouse.wheel(0, 400); await step(`scrolled to ${y + 400}`) }
  const bottom = await stats()
  const top5 = await page.evaluate(() => [0, 1, 2, 3, 4].every(i => { const v = document.getElementById(`v${i}`); return !v.hasAttribute('src') && v.networkState === v.NETWORK_EMPTY && v.paused }))
  check(top5, 'scrolled to the bottom, the first five clips are torn down (paused, no src, network state empty)')
  for (let y = 0; y <= 4000; y += 400) { await page.mouse.wheel(0, -400); await step(`scrolled back to ${4000 - y}`) }
  check(worst.playing <= 2, `while scrolling, at most ${worst.playing} played at once (budget 2)`)
  check(worst.held <= 4, `while scrolling, at most ${worst.held} players were held (of 10 clips)`)
  console.log(`  at the bottom: ${bottom.playing} playing, ${bottom.held} held, ${bottom.withSrc} with a src`)

  // the low-memory budget
  await page.evaluate(() => window.V.videoBudget(1))
  await page.waitForTimeout(800)
  const one = await stats()
  check(one.playing <= 1, `low-memory budget: ${one.playing} playing (at most 1)`)
  await page.evaluate(() => window.V.videoBudget(2))

  // a clip that waits for a hover: a player while hovered, none once the pointer leaves
  await page.evaluate(() => {
    const v = Object.assign(document.createElement('video'), { id: 'hover', muted: true })
    v.style.cssText = 'position:fixed;right:20px;top:20px;width:200px;height:120px'
    document.body.append(v)
    window.V.boardVideo(v, { src: window.CLIP })
  })
  const heldHover = () => page.evaluate(() => document.getElementById('hover').hasAttribute('src'))
  check(!(await heldHover()), 'a clip that waits for a hover holds no player before it')
  await page.mouse.move(1160, 80)
  await page.waitForTimeout(300)
  check(await heldHover(), 'hovered, it gets its player')
  await page.mouse.move(100, 700)
  await page.waitForTimeout(300)
  check(!(await heldHover()), 'left without playing, its player is freed')

  // taken out of the page: still freed (removing the element alone keeps the player)
  await page.evaluate(() => document.getElementById('board').remove())
  await page.waitForTimeout(2600)
  const gone = await stats()
  check(gone.clips <= 1 && gone.held === 0, `clips taken out of the page are freed (${gone.held} held, ${gone.clips} still watched)`)
  check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  console.log(`  Chromium's Media domain (what chrome://media-internals lists) reported ${created} players created`)
} finally {
  await browser.close()
}
if (fails.length) { console.error(`${fails.length} video check(s) failed`); process.exit(1) }
console.log('video check passed')
