// A short play test for a built game: open it in a headless browser, press its
// start button, keep pressing the usual controls for a few seconds and check
// that the run goes on. The build's own checks (typecheck, build, a look at the
// page) pass a game whose run ends the moment it starts; this catches that, and
// crashes, a missing canvas and a start button that does nothing.

import { execFile, browserEnv } from './proc.mjs'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { dyadDir } from './appbuild.mjs'
import { runChecks, waitProbe } from './playcheck.mjs'
import { makePoster, posterPath } from './poster.mjs'

const START = /^(play|start|begin|go|new game|tap to (play|start)|press .* to (play|start))|\b(play|start|begin)\b/i
const ENDED = /\b(game over|you (lost|died|fell|crashed|slipped)|try again|play again|retry|gate closed|out of lives|run over)\b/i

export async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  for (const dir of [process.env.PLAYWRIGHT_DIR, dyadDir].filter(Boolean)) {
    try { return createRequire(join(dir, 'package.json'))('playwright') } catch {}
  }
  return null
}

// Playwright's own browser, else installed Chrome, else any headless shell Playwright downloaded before
export async function launch(chromium, extra = {}) {
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
    try { return await chromium.launch({ ...opts, env: browserEnv(), ...extra }) } catch (e) { last = e }
  }
  throw last
}

// The screenshot is one flat colour: almost every sampled pixel is within a few levels of the
// most common one. Decoded by the page itself, so no image library is needed.
async function blank(page, png) {
  return page.evaluate(async b64 => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(160, 100), x = c.getContext('2d')
    x.drawImage(img, 0, 0, 160, 100)
    const d = x.getImageData(0, 0, 160, 100).data, n = d.length / 4, counts = new Map()
    for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3); counts.set(k, (counts.get(k) || 0) + 1) }
    return Math.max(...counts.values()) / n > 0.985
  }, png.toString('base64')).catch(() => false)
}

// The film's sound. Playwright films the picture only, so the page records its own sound:
// every Web Audio graph (a Godot export plays through one) and every <audio>/<video> is
// tapped into one recorder, started at the first sound. Runs in every frame, the game's too.
export const SOUND_TAP = `(() => {
  if (window.__swarmSound) return
  const S = window.__swarmSound = { chunks: [], at: 0, rec: null, ctx: null, dest: null }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC || typeof MediaRecorder === 'undefined') return
  const hub = () => {
    if (S.dest) return S.dest
    S.ctx = new AC(); S.dest = S.ctx.createMediaStreamDestination()
    try { S.ctx.resume() } catch {}
    const type = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t))
    S.rec = new MediaRecorder(S.dest.stream, type ? { mimeType: type } : {})
    S.rec.ondataavailable = e => { if (e.data && e.data.size) S.chunks.push(e.data) }
    S.rec.start(500); S.at = Date.now()
    const wake = () => { try { S.ctx.resume() } catch {} }
    addEventListener('pointerdown', wake, true); addEventListener('keydown', wake, true)
    return S.dest
  }
  const taps = new WeakMap()
  const tapOf = ctx => {
    if (ctx === S.ctx) return null
    if (!taps.has(ctx)) {
      try { const t = ctx.createMediaStreamDestination(); S.ctx || hub(); S.ctx.createMediaStreamSource(t.stream).connect(hub()); taps.set(ctx, t) } catch { taps.set(ctx, null) }
    }
    return taps.get(ctx)
  }
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (to, ...rest) {
    const r = connect.call(this, to, ...rest)
    try { if (to instanceof AudioDestinationNode && this.context !== S.ctx) { const t = tapOf(this.context); if (t) connect.call(this, t, ...rest) } } catch {}
    return r
  }
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...a) {
    try { if (!this.__swarmTap && this.captureStream) { this.__swarmTap = 1; const st = this.captureStream(); const go = () => { if (st.getAudioTracks().length) { hub(); S.ctx.createMediaStreamSource(st).connect(S.dest) } }; st.getAudioTracks().length ? go() : st.addEventListener('addtrack', go, { once: true }) } } catch {}
    return play.apply(this, a)
  }
})()`

// the recorded sound, as base64 webm, and when it started (ms since the epoch); null if silent
async function takeSound(frame) {
  return frame.evaluate(() => new Promise(done => {
    const S = window.__swarmSound
    if (!S || !S.rec) return done(null)
    const finish = async () => {
      if (!S.chunks.length) return done(null)
      const b = new Uint8Array(await new Blob(S.chunks).arrayBuffer())
      let s = ''
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
      done({ b64: btoa(s), at: S.at })
    }
    if (S.rec.state === 'inactive') return finish()
    S.rec.onstop = finish
    S.rec.stop()
  })).catch(() => null)
}

// ffmpeg: SWARM_FFMPEG, then the PATH, then the one Hermes ships with
export function findFfmpeg(env = process.env) {
  if (env.SWARM_FFMPEG && existsSync(env.SWARM_FFMPEG)) return env.SWARM_FFMPEG
  for (const d of String(env.PATH || '').split(delimiter).filter(Boolean)) { const f = join(d, 'ffmpeg'); if (existsSync(f)) return f }
  for (const d of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) { const f = join(d, 'ffmpeg'); if (existsSync(f)) return f }
  try {
    const tools = join(homedir(), '.hermes', 'tools')
    for (const d of readdirSync(tools).filter(d => /^ffmpeg-/.test(d)).sort().reverse()) { const f = join(tools, d, 'ffmpeg'); if (existsSync(f)) return f }
  } catch {}
  return null
}

// the silent film and its sound → one webm, the sound delayed to where it started in the film
function mux(ffmpeg, video, audio, delayMs, out) {
  const d = Math.max(0, Math.round(delayMs))
  return new Promise((ok, fail) => execFile(ffmpeg, ['-y', '-v', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', `adelay=${d}:all=1,apad`, '-c:a', 'libopus', '-b:a', '96k', '-shortest', out], { timeout: 60000 }, err => (err ? fail(err) : ok(out))))
}

// { ok, skipped?, problem?, seconds } (a play test that could not run is ok: false with `skipped`, never a pass) — `problem` is one sentence for a fix turn
// shot: a file to save the title screen to (the game's cover), as a JPEG
// clip: a path to film the test to (.webm); the result then has clip and the keys pressed, in order
// checks: the spec's play checks (engine/playcheck.mjs checklist): each control is held and the game's
// own state (window.__swarm) read to see the move happen; the result then has checks, and what
// failed is in problem as asks for the builder
export async function playtest(url, opts = {}) {
  const box = {}
  const r = await playtestRun(url, opts, box)
  return { ...r, ...(box.filmed || {}), ...(box.checks ? { checks: box.checks } : {}) }
}
async function playtestRun(url, { seconds = 4, timeout = 30000, shot = null, clip = null, secure = false, ffmpeg = undefined, checks = null, probeWait = 25000, playwright = undefined } = {}, box = {}) {
  let film = async () => ({}), vdir = null, g = null
  const kept = box // (the canvas's own box takes the name further down)
  // `playwright` is a test's stand-in for the package (null: none on this machine)
  const pw = playwright === undefined ? await loadPlaywright() : playwright
  if (!pw) return { ok: false, skipped: 'no browser for the play test' }
  let browser
  // sound plays without a click first, so the film can record it
  try { browser = await launch(pw.chromium, { args: ['--autoplay-policy=no-user-gesture-required'] }) } catch (e) { return { ok: false, skipped: `the browser would not start: ${String(e.message).slice(0, 120)}` } }
  const errors = [], blocked = []
  try {
    vdir = clip ? mkdtempSync(join(tmpdir(), 'playtest-')) : null
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(vdir ? { recordVideo: { dir: vdir, size: { width: 640, height: 400 } } } : {}) })
    if (vdir) await ctx.addInitScript(SOUND_TAP).catch(() => {})
    const page = await ctx.newPage()
    const pressed = [], t00 = Date.now()
    const press = k => pressed.push({ k, t: +((Date.now() - t00) / 1000).toFixed(2) })
    // the film is saved however the test ends
    film = async () => {
      if (!vdir) return {}
      try {
        const sound = g ? await takeSound(g) : null
        const v = page.video(); await ctx.close(); const f = await v?.path()
        if (!f || !existsSync(f)) return {}
        const ff = ffmpeg === undefined ? findFfmpeg() : ffmpeg
        let sounded = false
        if (sound && ff) {
          try { const a = join(vdir, 'sound.webm'); writeFileSync(a, Buffer.from(sound.b64, 'base64')); await mux(ff, f, a, sound.at - t00, join(vdir, 'with-sound.webm')); copyFileSync(join(vdir, 'with-sound.webm'), clip); sounded = true } catch {}
        }
        if (!sounded) copyFileSync(f, clip)
        // its poster: a frame of the film itself, over the title-screen photo taken below (kept when there is no ffmpeg)
        if (ff) await makePoster(clip, { ffmpeg: ff })
        return { clip, keys: pressed.slice(0, 80), sound: sounded, ...(existsSync(posterPath(clip)) ? { poster: posterPath(clip) } : {}) }
      } catch {}
      return {}
    }
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)))
    page.on('console', m => {
      if (m.type() !== 'error') return
      const t = m.text()
      if (/^Uncaught/.test(t)) errors.push(t.slice(0, 200))
      else if (/CORS|SecurityError|Failed to load module|localStorage|sessionStorage|indexedDB/i.test(t)) blocked.push(t.slice(0, 200))
    })
    // Hermes shows the Studio, and so the game, in a sandboxed frame (scripts only, origin null):
    // play it the same way, so a game that only works in a plain tab fails here too
    // secure: the outer page sits on the game's own origin first, so the frame is a secure context
    // (a Godot web export refuses to start without one; Hermes and the feed are secure parents)
    if (secure) await page.goto(new URL('/__frame', url).href, { timeout }).catch(() => {})
    await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe sandbox="allow-scripts allow-forms" src="${String(url).replace(/"/g, '&quot;')}" style="display:block;width:100vw;height:100vh;border:0"></iframe>`, { waitUntil: 'load', timeout })
    g = await (await page.$('iframe')).contentFrame()
    const why = () => [...new Set([...errors, ...blocked])].slice(0, 3).join(' | ')
    const canvas = await g.waitForSelector('canvas', { timeout: 15000 }).catch(() => null)
    if (!canvas) return { ok: false, problem: `No game canvas appeared within 15 s of opening the page inside a sandboxed frame (allow-scripts, no same origin), the way Hermes shows it.${why() ? ` Errors: ${why()}` : ''}${blocked.length ? ' Storage (localStorage, sessionStorage, IndexedDB) throws in a sandboxed frame: wrap every use in try/catch and fall back to memory.' : ''}` }
    // a game with play checks says when it is up (a Godot export boots for seconds: without this the
    // test pressed its keys at the loading screen and passed)
    const probed = checks?.length ? await waitProbe(page, g, probeWait) : false
    await page.waitForTimeout(1200)
    // a Godot export that cannot start shows its own notice over the canvas
    const notice = await g.evaluate(() => { const n = document.getElementById('status-notice'); return n && n.offsetParent !== null ? n.innerText.trim() : '' }).catch(() => '')
    if (notice) return { ok: false, problem: `The Godot web export did not start: ${notice.replace(/\s+/g, ' ').slice(0, 300)}` }
    const png = await page.screenshot({ type: 'png' }).catch(() => null)
    if (png && await blank(page, png)) return { ok: false, problem: `The game's screen is blank: one flat colour about a second after it opened, with no title, text or scene drawn.${why() ? ` Errors: ${why()}` : ''} Make the title screen draw straight away (title, start button, a scene behind), and check the canvas is sized to its container and the render loop runs.` }
    if (shot) await page.screenshot({ path: shot, type: 'jpeg', quality: 72 }).catch(() => {})
    if (clip) await page.screenshot({ path: posterPath(clip), type: 'jpeg', quality: 70 }).catch(() => {})
    const textOf = () => g.evaluate(() => document.body.innerText || '')
    const before = await textOf()

    // the start control: a visible button or link that says play/start/begin, else the canvas
    const buttons = await g.$$('button, [role=button], a')
    let started = false
    for (const b of buttons) {
      const label = ((await b.innerText().catch(() => '')) || '').trim()
      if (label && label.length < 40 && START.test(label) && await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 3000 }).catch(() => {})
        press(label.slice(0, 20))
        started = true
        break
      }
    }
    const box = await canvas.boundingBox()
    const cx = box ? box.x + box.width / 2 : 640, cy = box ? box.y + box.height * 0.7 : 500
    if (!started) { await page.mouse.click(cx, cy); await page.keyboard.press('Enter'); await page.keyboard.press('Space'); press('Click'); press('Enter'); press('Space') }

    // the spec's checks: each control held, the state read
    let checked = null
    if (checks?.length) {
      checked = probed
        ? await runChecks({ page, frame: g, checks, press })
        : { probe: false, checks: checks.map(c => ({ ...c, ok: null, saw: 'the game publishes no state' })), problems: ['The game does not publish window.__swarm, so the play test could not check a single control. Add the play-test hook: { scene, hero: { x, y, w, h, ground }, actors: [{ id, kind, name, x, y }] }, refreshed as the game runs (a Godot game: JavaScriptBridge.eval("window.__swarm=" + JSON.stringify(state), true) about ten times a second in the web build).'] }
      kept.checks = checked.checks.map(({ id, kind, name, say, ok, saw }) => ({ id, kind, ...(name ? { name } : {}), say, ok, saw }))
    }

    // keep playing with the usual controls: tap, hold-and-release, space, arrows
    if (checked?.probe) seconds = Math.min(seconds, 2)
    const t0 = Date.now()
    let endedAt = 0
    const keys = ['Space', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'KeyW', 'KeyD']
    for (let i = 0; Date.now() - t0 < seconds * 1000; i++) {
      if (i % 3 === 0) { press('Hold'); await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(220); await page.mouse.up() }
      else { press(keys[i % keys.length]); await page.keyboard.press(keys[i % keys.length]).catch(() => {}) }
      await page.waitForTimeout(180)
      const now = await textOf()
      const m = now.match(ENDED)
      if (m && !ENDED.test(before)) { endedAt = Date.now(); break }
      if (m && ENDED.test(before) && now !== before && i > 2) { endedAt = Date.now(); break }
    }
    const lasted = ((endedAt || Date.now()) - t0) / 1000
    if (errors.length) return { ok: false, seconds: lasted, problem: `The game threw errors while playing: ${why()}` }
    if (endedAt && lasted < 2.5 && !checked?.probe) return { ok: false, seconds: lasted, problem: `The run ends about ${lasted.toFixed(1)} s after pressing start, before the player can do anything (the end screen appears with nothing achieved). Find why a fresh run is lost straight away: the player spawning off a platform, a camera or bounds check that already counts as a fall, a timer or health that starts at zero, or a lose condition checked before the first frame. Fix it so a new run starts safely and lasts until the player makes a mistake.` }
    if (checked?.problems.length) return { ok: false, seconds: lasted, problem: checked.problems.length === 1 ? checked.problems[0] : `The play test held each control and read the game's state; ${checked.problems.length} things are wrong:\n${checked.problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}` }
    return { ok: true, seconds: lasted, ended: !!endedAt }
  } catch (e) {
    return { ok: false, skipped: `the play test could not run: ${String(e.message).slice(0, 160)}` }
  } finally {
    box.filmed = await film().catch(() => ({}))
    if (vdir) rmSync(vdir, { recursive: true, force: true })
    await browser.close().catch(() => {})
  }
}
