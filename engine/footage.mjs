// Real footage for the promo: once the app and its game run, a headless browser
// plays the game on /play with a simple bot and scrolls through the home page,
// and both are recorded to mp4. The video's storyboard then cuts them in as
// "clip" scenes, so the promo shows the real thing, not only pictures.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const run = (cmd, args) => new Promise((ok, fail) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, out, errOut) => (err ? fail(new Error(String(errOut || err.message).slice(-400))) : ok(out))))

// Our own screencast: Chrome sends frames with timestamps, ffmpeg turns them
// into a steady 30 fps mp4 (puppeteer's built-in one needs a newer ffmpeg).
async function record(page, file, ffmpeg) {
  const cdp = await page.createCDPSession()
  const frames = []
  cdp.on('Page.screencastFrame', f => {
    frames.push({ data: f.data, t: f.metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 })
  return async () => {
    await cdp.send('Page.stopScreencast').catch(() => {})
    await cdp.detach().catch(() => {})
    if (frames.length < 10) return false
    const tmp = file.replace(/\.mp4$/, '-frames')
    mkdirSync(tmp, { recursive: true })
    const list = []
    frames.forEach((f, i) => {
      const name = join(tmp, `f${String(i).padStart(5, '0')}.jpg`)
      writeFileSync(name, Buffer.from(f.data, 'base64'))
      const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - f.t) : 1 / 30
      list.push(`file '${name}'`, `duration ${d.toFixed(4)}`)
    })
    list.push(`file '${join(tmp, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`)
    writeFileSync(join(tmp, 'list.txt'), list.join('\n'))
    try {
      await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-vf', 'fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', file])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    return true
  }
}

// The Chrome that HyperFrames already downloaded for rendering.
export function chromePath() {
  const root = join(homedir(), '.cache', 'hyperframes', 'chrome', 'chrome-headless-shell')
  try {
    for (const v of readdirSync(root).sort().reverse()) {
      for (const sub of readdirSync(join(root, v))) {
        const bin = join(root, v, sub, 'chrome-headless-shell')
        if (existsSync(bin)) return bin
      }
    }
  } catch {}
  return null
}

function puppeteer(dataDir) {
  const req = createRequire(join(dataDir, 'video-tools', 'package.json'))
  try { return req('puppeteer-core') } catch { return null }
}

// A page is worth filming only if it rendered: no Vite error overlay, some content.
const broken = page => page.evaluate(() => !!document.querySelector('vite-error-overlay') || document.body.innerText.trim().length < 3 && !document.querySelector('canvas'))

// Keys a bot presses: moves, jumps and actions most browser games use.
const KEYS = ['ArrowRight', 'ArrowRight', 'ArrowUp', 'Space', 'ArrowLeft', 'KeyD', 'KeyW', 'ArrowDown', 'Space', 'KeyA', 'Enter', 'KeyJ']

async function playBot(page, ms) {
  const end = Date.now() + ms
  const vp = page.viewport()
  // start the game: click a start/play button if there is one, then the play area
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, a, [role=button]')].find(x => /^\s*(start|play|begin|new game|enter)/i.test(x.textContent || ''))
    b?.click()
  }).catch(() => {})
  await sleep(600)
  const canvas = await page.$('canvas')
  const box = canvas ? await canvas.boundingBox() : null
  const cx = box ? box.x + box.width / 2 : vp.width / 2, cy = box ? box.y + box.height / 2 : vp.height / 2
  await page.mouse.click(cx, cy).catch(() => {})
  let i = 0
  while (Date.now() < end) {
    const key = KEYS[i % KEYS.length]
    const hold = 120 + (i * 53) % 380
    await page.keyboard.down(key).catch(() => {})
    // aim and click now and then, for click or mouse-aimed games
    if (i % 4 === 2) await page.mouse.click(cx + Math.sin(i) * (box?.width || 400) / 3, cy + Math.cos(i * 1.3) * (box?.height || 300) / 3).catch(() => {})
    await sleep(hold)
    await page.keyboard.up(key).catch(() => {})
    await sleep(40)
    i++
  }
}

async function smoothScroll(page, ms) {
  await page.evaluate(async ms => {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight)
    const t0 = performance.now()
    await new Promise(done => {
      const tick = now => {
        const p = Math.min(1, (now - t0) / ms)
        // ease in and out, and stop at about 3 screens so the hero gets most of the time
        scrollTo(0, Math.min(max, innerHeight * 3) * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2))
        p < 1 ? requestAnimationFrame(tick) : done()
      }
      requestAnimationFrame(tick)
    })
  }, ms)
}

// Films the running app at url into runDir/footage. Returns the clips it kept.
export async function filmBuild({ url, runDir, dataDir, ffmpeg, game = true, onStage = () => {} }) {
  const pp = puppeteer(dataDir), chrome = chromePath()
  if (!pp || !chrome || !url) return { clips: [], note: !url ? 'no running app to film' : 'no browser to film with' }
  const dir = join(runDir, 'footage')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const base = url.replace(/\/$/, '')
  const browser = await pp.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const clips = []
  const shoot = async ({ path, file, what, label, ms, act, from = 0 }) => {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1280, height: 720 })
      const res = await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null)
      if (!res || !res.ok()) return
      await sleep(1500)
      if (await broken(page)) return
      const before = await page.screenshot({ type: 'jpeg', quality: 40 })
      const stop = await record(page, join(dir, file), ffmpeg)
      await act(page, ms)
      await stop()
      const after = await page.screenshot({ type: 'jpeg', quality: 40 })
      // a still screen (the game never started, an empty page) is not footage
      if (before.equals(after) || !existsSync(join(dir, file)) || statSync(join(dir, file)).size < 30000) return rmSync(join(dir, file), { force: true })
      clips.push({ file, what, label, seconds: ms / 1000, from })
    } catch (err) {
      onStage(`could not film ${path}: ${String(err.message || err).slice(0, 120)}`)
    } finally {
      await page.close().catch(() => {})
    }
  }
  try {
    if (game) {
      onStage('filming the game being played')
      await shoot({ path: '/play', file: 'play.mp4', what: 'real gameplay, recorded from the game on the /play page while a bot plays it', label: 'GAMEPLAY', ms: 14000, act: playBot, from: 1.5 })
    }
    onStage('filming the live site')
    await shoot({ path: '/', file: 'site.mp4', what: 'a scroll through the live home page of the built site', label: 'LIVE SITE', ms: 7000, act: smoothScroll })
  } finally {
    await browser.close().catch(() => {})
  }
  writeFileSync(join(dir, 'footage.json'), JSON.stringify({ url: base, t: Date.now(), clips }, null, 2))
  return { clips }
}
