// ARES: the core (loop, input, player, bullets, effects, HUD). Stages, camera, chases, titans
// and boons are in stage.js, bosses in boss.js, enemy behaviour in enemies.js, spells in spells.js,
// effects art in fx.js. See ENGINE.md.
// Two heroines on one body (Tab swaps): the Messenger's sword reflects bullets, the
// Oracle shoots and casts spells that cancel bullets, shake the ground, break the
// temple and leave enemies burning, shocked or charred. Ends with Teknium.
// Everything is read from the game's own folders: data/heroes.json (names, moves,
// lines), assets/skins/<hero>/default (outfit pack), assets/level, assets/boss, voice.
'use strict'

const W = 1280, H = 720, GROUND = 640
let WORLD = 3960, ARENA = WORLD - W, ARW = W
const cv = document.getElementById('game'), ctx = cv.getContext('2d')
const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px' }
addEventListener('resize', fit); fit()
new ResizeObserver(fit).observe(document.documentElement)

const R = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const ang = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0)
const boxHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const circBox = (cx, cy, r, b) => { const x = clamp(cx, b.x, b.x + b.w), y = clamp(cy, b.y, b.y + b.h); return (cx - x) ** 2 + (cy - y) ** 2 < r * r }

// ---------------------------------------------------------------- loading
// images are decoded before they are handed over, so the first draw never stalls a frame
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => (i.decode ? i.decode().catch(() => { }) : Promise.resolve()).then(() => ok(i)); i.onerror = () => no(new Error('missing ' + src)); i.src = src })
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error('missing ' + u); return r.json() })
const HEROES = ['messenger', 'runner']
const SCALE = { messenger: 0.47, runner: 0.43 }
const A = { sheets: { messenger: {}, runner: {} }, level: {}, boss: {}, fx: {} }
let CFG, ANCH, BOSSMETA

async function load() {
  ;[CFG, ANCH, BOSSMETA] = await Promise.all([getJSON('../data/heroes.json'), getJSON('anchors.json'), getJSON('../assets/boss/boss.json')])
  const jobs = []
  for (const h of HEROES) for (const name of Object.keys(ANCH.sheets[h]))
    jobs.push(loadImg(`../assets/skins/${h}/default/${name}.webp`).then(i => { A.sheets[h][name] = { img: i, ...ANCH.sheets[h][name] } }).catch(e => console.warn(String(e))))   // a sheet mid-repaint just stays out
  for (const k of Object.keys(ANCH.pieces)) jobs.push(loadImg(`../assets/level/${k}.webp`).then(i => { A.level[k] = i }))
  jobs.push(loadImg('../assets/level/sky.webp').then(i => { A.level.sky = i }))
  for (const k of Object.keys(BOSSMETA)) jobs.push(loadImg(`../assets/boss/${k}.webp`).then(i => { A.boss[k] = i }))
  for (const k of ['feather-1', 'feather-5']) jobs.push(loadImg(`../assets/fx/${k}.webp`).then(i => { A.fx[k] = shrinkFx(i) }))
  await Promise.all(jobs)
  for (const h of HEROES) shrinkHero(h)
}

// ---------------------------------------------------------------- memory and speed
// The heroine sheets are painted with 768 px cells but she is drawn about 160 px tall, so a
// full set decodes to ~300 MB. At load each hero's sheets are cut down to what the closest
// camera needs (her figure at ~1.7x her normal size), the same factor for every sheet so they
// stay in step; anchors shrink with them and fitScale() makes up the difference.
// ?q=high keeps the painted size; ?q=low cuts deeper. PERF.low thins the effects at run time.
// ?q=high|low wins; otherwise the player's pick from the title (G), else auto
const QUALITY = (location.search.match(/[?&]q=(high|low)\b/) || [])[1] || (() => { try { const v = localStorage.getItem('ares.q'); return v === 'high' || v === 'low' ? v : null } catch { return null } })() || 'auto'
const PERF = { ms: 16.7, slowT: 0, fastT: 0, low: QUALITY === 'low' }
function shrinkHero(h) {
  if (QUALITY === 'high') return
  const S = A.sheets[h], idle = S[h === 'runner' ? 'o-idle' : 'm-idle'] || S.idle; if (!idle?.h) return
  const want = (h === 'runner' ? 162 : 160) * (QUALITY === "low" ? 1.2 : 1.6)   // the canvas is 1280x720 whatever the screen
  const f = Math.min(1, want / idle.h); if (f > 0.92) return
  for (const name in S) {
    const s = S[name], img = s.img, n = Math.max(1, Math.round(img.width / img.height)), cell = Math.round(img.height * f)
    const c = document.createElement('canvas'); c.width = cell * n; c.height = cell
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'
    for (let i = 0; i < n; i++) g.drawImage(img, i * img.height, 0, img.height, img.height, i * cell, 0, cell, cell)
    S[name] = { ...s, img: c, x: s.x * f, y: s.y * f, h: s.h * f, shrunk: f }
  }
}
// effect strips: 768 px cells cut to 512 (384 on ?q=low). img.k0 = painted px per stored px, so
// drawers that size by sheet pixels (fxStrip, spStripRot, slashArt) multiply it back in.
function shrinkFx(img) {
  const cell = QUALITY === 'high' ? 1e9 : QUALITY === 'low' ? 384 : 512
  if (!img?.height || img.height <= cell * 1.1) return img
  const n = Math.max(1, Math.round(img.width / img.height)), c = document.createElement('canvas'), g = c.getContext('2d')
  c.width = cell * n; c.height = cell; g.imageSmoothingQuality = 'high'
  for (let i = 0; i < n; i++) g.drawImage(img, i * img.height, 0, img.height, img.height, i * cell, 0, cell, cell)
  c.k0 = img.height / cell; return c
}
// slow frames for 2 s: drop to light effects; quick frames for 6 s: back up
function perfTick(rawMs) {
  PERF.ms += (Math.min(rawMs, 100) - PERF.ms) * 0.05
  if (QUALITY !== 'auto' || document.hidden) return
  if (PERF.ms > 23) { PERF.slowT += rawMs / 1000; PERF.fastT = 0; if (PERF.slowT > 2) PERF.low = true }
  else if (PERF.ms < 17.5) { PERF.fastT += rawMs / 1000; PERF.slowT = 0; if (PERF.fastT > 6) PERF.low = false }
}

// ---------------------------------------------------------------- input
const keys = new Set(), pressed = new Set(), released = new Set()
const GAME_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab', 'shift']
addEventListener('keydown', e => {
  const k = e.key.toLowerCase()
  if (GAME_KEYS.includes(k)) e.preventDefault()
  if (!keys.has(k)) pressed.add(k)
  keys.add(k); unlockAudio()
})
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); released.add(k) })
addEventListener('blur', () => keys.clear())
const mouse = { x: 0, y: 0, on: false, t: -9 }
cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width * W; mouse.y = (e.clientY - r.top) / r.height * H; mouse.on = true; mouse.t = performance.now() })
cv.addEventListener('mousedown', e => { e.preventDefault(); if (e.button === 0) { if (!keys.has('j')) pressed.add('j'); keys.add('j') } unlockAudio() })
addEventListener('mouseup', e => { if (e.button === 0 && keys.has('j')) { keys.delete('j'); released.add('j') } })
cv.addEventListener('contextmenu', e => e.preventDefault())
const down = (...ks) => ks.some(k => keys.has(k))
const tap = (...ks) => ks.some(k => pressed.has(k))

// ---------------------------------------------------------------- sound
let AC = null, noiseBuf = null
function unlockAudio() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)() } catch { } }
function tone(type, f0, f1, dur, vol = 0.12) {
  if (!AC) return
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(AC.destination); o.start(); o.stop(t + dur)
}
function noise(dur, freq, vol = 0.2, q = 1) {
  if (!AC) return
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 }
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(f).connect(g).connect(AC.destination); s.start(); s.stop(t + dur)
}
const SFX = {
  slash: () => noise(0.12, 2600, 0.22, 0.8),
  heavy: () => { noise(0.25, 900, 0.32, 0.7); tone('sawtooth', 170, 50, 0.25, 0.1) },
  shot: () => tone('triangle', 1500, 800, 0.05, 0.035),
  reflect: () => tone('sine', 1700, 2700, 0.12, 0.1),
  cancel: () => tone('sine', 2200, 1200, 0.08, 0.05),
  boom: () => { noise(0.7, 160, 0.5, 0.5); tone('sine', 90, 28, 0.6, 0.3) },
  zap: () => noise(0.3, 4200, 0.2, 3),
  hurt: () => tone('square', 300, 110, 0.18, 0.08),
  glare: () => tone('sawtooth', 60, 150, 1.0, 0.1),
  hit: () => noise(0.06, 1400, 0.25, 1.5),
  dodge: () => tone('sine', 900, 1800, 0.2, 0.1),
}
// One voice at a time. A story line (force) waits for the one playing to finish, then
// plays; if it waited too long it is dropped. Small barks only play into silence, after a
// quiet gap, and the same bark not again for a while.
const voices = {}
let voiceBusy = 0, voiceNow = null, voiceQ = []
const voiceAgain = {}
const BARK_GAP = { 'bark-kill': 14, 'bark-hurt': 7, 'bark-dodge': 9, counter: 6 }
const voicePlaying = () => voiceNow && !voiceNow.paused && !voiceNow.ended
function say(hero, key, force = false) {
  const src = `../assets/voice/${hero}/${key}.mp3`
  if (!force && (voicePlaying() || voiceBusy > 0 || voiceQ.length || (voiceAgain[key] || 0) > T)) return
  if (force && (voicePlaying() || voiceQ.length)) {
    if (!voiceQ.some(q => q.src === src) && !(voiceNow && voiceNow.src.endsWith(src.slice(2)))) voiceQ.push({ src, at: T })
    if (voiceQ.length > 2) voiceQ.shift()
    return
  }
  playVoice(src, force)
  voiceAgain[key] = T + (BARK_GAP[key] || 4)
}
function playVoice(src, force) {
  const a = voices[src] || (voices[src] = new Audio(src))
  try { a.currentTime = 0; a.volume = 0.9; a.play().catch(() => { }) } catch { }
  voiceNow = a; voiceBusy = force ? 0.4 : 3.5
}
function voiceTick(dt) {
  voiceBusy = Math.max(0, voiceBusy - dt)
  if (voicePlaying() || !voiceQ.length) return
  voiceQ = voiceQ.filter(q => T - q.at < 4)
  const q = voiceQ.shift(); if (q) playVoice(q.src, true)
}

// ---------------------------------------------------------------- world state
let mode = 'loading', sel = /[?&]hero=(runner|oracle)\b/.test(location.search) ? 1 : 0, T = 0
let shake = 0, stopT = 0, slowT = 0, flash = 0, flashColor = '255,240,210', dim = 0
const cam = { x: 0, y: 0, z: 1, min: 0, max: 1300 - W + 200, lock: false, focus: null, kick: 0 }
let plats = [], enemies = [], bullets = [], fx = [], parts = [], decals = [], patches = [], timers = [], callouts = []
let wave = 0, B = null, combo = 0, comboT = 0, gate = 1300
const P = {}

function later(t, fn, tag = '') { timers.push({ t, fn, tag }) }

// ---------------------------------------------------------------- level
function place(name, x, o = {}) {
  const img = A.level[name], a = ANCH.pieces[name], s = o.s || 0.5
  const w = a.w * s, h = a.h * s, top = (a.top + a.h * 0.05) * s
  const y = o.surf != null ? o.surf - top : GROUND - h + (o.sink ?? 14)
  const p = { name, img, x, y, w, h, s, surf: y + top, l: x + a.l * s, r: x + a.r * s, hp: o.hp || 0, max: o.hp || 0, broken: false, respawn: 0, kind: o.kind || 'plat', walk: o.walk !== false, hit: 0 }
  plats.push(p); return p
}
function buildLevel() {
  plats = []
  // zone 1: steps up into the temple
  place('platforms-6', 300, { kind: 'stairs' })
  place('platforms-1', 560, { surf: 480 })
  place('platforms-0', 820, { surf: 380 })
  place('platforms-2', 700, { surf: 250 })
  place('platforms-4', 1170, { kind: 'brazier', hp: 30 })
  // zone 2: breakable columns and a bridge
  place('platforms-3', 1420, { kind: 'column', hp: 60 })
  place('platforms-5', 1560, { surf: 460 })
  place('platforms-2', 1960, { surf: 320 })
  place('platforms-7', 2120, { kind: 'rubble', hp: 40 })
  place('platforms-1', 2280, { surf: 430 })
  place('platforms-3', 2560, { kind: 'column', hp: 60 })
  // the arena
  place('platforms-4', ARENA + 30, { kind: 'brazier', hp: 30 })
  place('platforms-1', ARENA + 90, { surf: 480 })
  place('platforms-0', ARENA + 380, { surf: 340 })
  place('platforms-1', ARENA + 900, { surf: 480 })
  place('platforms-2', ARENA + 140, { surf: 230 })
  place('platforms-2', ARENA + 990, { surf: 230 })
  place('platforms-3', ARENA + 640, { kind: 'column', hp: 70 })
  place('platforms-4', ARENA + 1180, { kind: 'brazier', hp: 30 })
}
const ISLANDS = [['islands-0', 200, 170, 0.55], ['islands-4', 900, 250, 0.5], ['islands-1', 1500, 160, 0.55], ['islands-2', 2100, 240, 0.5], ['islands-3', 2700, 190, 0.5], ['islands-0', 3300, 210, 0.45], ['islands-4', 3900, 150, 0.5]]
const FORE = [['fore-0', 520, -20, 0.55], ['fore-1', 1500, -30, 0.5], ['fore-3', 2050, -10, 0.6], ['fore-0', 2900, -40, 0.5], ['fore-2', 3500, -10, 0.7], ['fore-8', 1000, GROUND - 40, 0.45], ['fore-8', 3200, GROUND - 40, 0.45]]

// ---------------------------------------------------------------- player
function resetPlayer() {
  Object.assign(P, {
    x: 140, y: GROUND, vx: 0, vy: 0, face: 1, ground: true, coyote: 0, buffer: 0, jumps: 1, airDash: 1,
    dashT: 0, dashDir: 1, dashCD: 0, postDash: 0, iframe: 0, perfect: 0, hp: 120, max: 120, meter: 0, hero: HEROES[sel], aim: 0,
    act: null, queue: false, animT: 0, hurtT: 0, holdJ: 0, shootCD: 0, cds: {}, trail: [], drop: 0, shield: 0,
    sprint: false, jumpAnim: null, wasGround: true, dead: false,
  })
}
// where the Oracle points: arrow keys (8 ways) or the mouse; straight ahead when nothing is held
function updateAim(dt) {
  const L = down('arrowleft', 'a'), Rt = down('arrowright', 'd'), U = down('arrowup', 'w'), D = down('arrowdown', 's')
  let want
  if (mouse.on && performance.now() - mouse.t < 4000) {
    const h = handBase(); want = ang(h.x, h.y, mouse.x / cam.z + cam.x, mouse.y / cam.z + cam.y)
  } else {
    let dx = (Rt ? 1 : 0) - (L ? 1 : 0), dy = (D ? 1 : 0) - (U ? 1 : 0)
    if (dy > 0 && P.ground && !dx) dx = P.face          // on the ground, down aims low-forward
    if (!dx && !dy) dx = P.face
    want = Math.atan2(dy, dx)
  }
  if (Math.cos(want) > 0.15) P.face = 1; else if (Math.cos(want) < -0.15) P.face = -1
  let d = Math.atan2(Math.sin(want - P.aim), Math.cos(want - P.aim))
  P.aim += clamp(d, -14 * dt, 14 * dt)
}
const hurtbox = () => ({ x: P.x - 22, y: P.y - 120, w: 44, h: 116 })
const moveName = (hero, k) => CFG.heroes[hero]?.moves?.[k]?.en || ''

// No Japanese on screen: the voices are Japanese, every shown text is English. Anything with
// Japanese characters in it is simply not drawn.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/
function callout(text, x, y, big = false) {
  if (!text || CJK.test(text)) return
  // a new name sends any older one still nearby straight into its fade, so two names never stack
  for (const c of callouts) if (Math.abs(c.x - x) < 420 && Math.abs(c.y - y) < 160) c.t = Math.max(c.t, 0.95)
  callouts.push({ text, x, y, t: 0, big })
}

// moves: hit boxes are relative to the feet, x toward the facing side
const MOVES = {
  messenger: {
    slash1: { sheet: 'slash1', dur: 0.3, cancel: 0.15, next: 'slash2', sfx: 'slash', step: 120, hits: [{ t0: 0.05, t1: 0.17, x: 0, y: -150, w: 175, h: 140, dmg: 8, kb: 160 }], arc: { r: 120, a0: -2.0, a1: 0.7, w: 26, at: 0.05 } },
    slash2: { sheet: 'slash2', dur: 0.32, cancel: 0.16, next: 'slash3', sfx: 'slash', step: 140, hits: [{ t0: 0.05, t1: 0.17, x: 0, y: -160, w: 185, h: 150, dmg: 9, kb: 180 }], arc: { r: 125, a0: 0.9, a1: -1.8, w: 28, at: 0.05 } },
    slash3: { sheet: 'slash3', dur: 0.5, cancel: 0.34, sfx: 'heavy', voice: 'slash3', step: 300, hits: [{ t0: 0.1, t1: 0.25, x: -10, y: -190, w: 235, h: 190, dmg: 18, kb: 560, shake: 7, stop: 0.06 }], arc: { r: 165, a0: -2.5, a1: 1.2, w: 44, at: 0.1 } },
    launch: { sheet: 'launcher', dur: 0.42, cancel: 0.26, sfx: 'heavy', voice: 'launch', jump: -900, hits: [{ t0: 0.04, t1: 0.2, x: -10, y: -220, w: 160, h: 220, dmg: 10, launch: -980 }], arc: { r: 140, a0: 1.5, a1: -1.8, w: 32, at: 0.04 } },
    air1: { sheet: 'air1', dur: 0.26, cancel: 0.13, next: 'air2', air: true, hover: true, sfx: 'slash', voice: 'air', hits: [{ t0: 0.04, t1: 0.15, x: -10, y: -160, w: 185, h: 170, dmg: 7, juggle: true }], arc: { r: 115, a0: -1.9, a1: 0.9, w: 24, at: 0.04 } },
    air2: { sheet: 'm-air2', dur: 0.3, cancel: 0.15, next: 'air1', air: true, hover: true, sfx: 'slash', hits: [{ t0: 0.04, t1: 0.17, x: -10, y: -160, w: 185, h: 170, dmg: 8, juggle: true }], arc: { r: 120, a0: 1.0, a1: -1.9, w: 26, at: 0.04 } },
    slam: { sheet: 'airslam', dur: 3, air: true, slam: true, sfx: 'heavy', voice: 'slam', hits: [{ t0: 0, t1: 3, x: -50, y: -150, w: 140, h: 170, dmg: 6, spike: true, every: 0.12 }] },
    dashslash: { sheet: 'dash', dur: 0.34, cancel: 0.22, sfx: 'slash', lunge: 900, hits: [{ t0: 0.02, t1: 0.2, x: -20, y: -140, w: 200, h: 130, dmg: 12, kb: 300 }], arc: { r: 150, a0: -0.4, a1: 0.4, w: 20, at: 0.02, flat: true } },
    charge: { sheet: 'm-charge', dur: 0.6, cancel: 0.46, sfx: 'heavy', voice: 'charge', step: 460, hits: [{ t0: 0.12, t1: 0.3, x: -30, y: -230, w: 330, h: 250, dmg: 40, kb: 800, shake: 12, stop: 0.1 }], arc: { r: 220, a0: -2.7, a1: 1.4, w: 66, at: 0.12 } },
    wave: { sheet: 'm-wave', dur: 0.46, cancel: 0.32, voice: 'wave', sfx: 'heavy', fire: 0.14 },
    // heavy (K): slower, harder, and the third one calls lightning down the blade
    heavy1: { sheet: 'slash3', dur: 0.44, cancel: 0.28, sfx: 'heavy', step: 220, hits: [{ t0: 0.1, t1: 0.24, x: -10, y: -190, w: 225, h: 190, dmg: 14, kb: 420, shake: 6, stop: 0.05 }], arc: { r: 160, a0: -2.4, a1: 1.1, w: 42, at: 0.1 } },
    heavy2: { sheet: 'slash2', dur: 0.46, cancel: 0.3, sfx: 'heavy', step: 240, hits: [{ t0: 0.1, t1: 0.24, x: -10, y: -200, w: 235, h: 200, dmg: 16, kb: 460, shake: 7, stop: 0.06 }], arc: { r: 170, a0: 1.1, a1: -2.3, w: 46, at: 0.1 } },
    thunder: { sheet: 'm-charge', dur: 0.66, cancel: 0.5, sfx: 'heavy', voice: 'charge', step: 380, thunder: true, hits: [{ t0: 0.14, t1: 0.32, x: -30, y: -240, w: 360, h: 260, dmg: 34, kb: 760, shake: 14, stop: 0.1, status: 'shock' }], arc: { r: 230, a0: -2.7, a1: 1.4, w: 66, at: 0.14, thunder: true } },
    // special (L): cuts into anything; at the end of a string it hits harder and brings lightning
    rend: { sheet: 'm-wave', dur: 0.5, cancel: 0.36, voice: 'wave', sfx: 'heavy', fire: 0.14, special: true },
    counter: { sheet: 'm-counter', dur: 0.4, cancel: 0.4, cd: 0.8, guard: 0.3 },
    spin: { sheet: 'm-spin', dur: 0.72, cancel: 0.62, cd: 1.0, voice: 'spin', sfx: 'heavy', move: 0.7, hits: [{ t0: 0.05, t1: 0.68, x: -170, y: -190, w: 340, h: 200, dmg: 4, every: 0.08, kb: 60 }], spin: true },
  },
  runner: {
    feather: { sheet: 'o-cast', dur: 0.4, cancel: 0.3, cd: 0.35, voice: 'feather', fire: 0.12 },
    sunlance: { sheet: 'o-cast', dur: 1.05, cancel: 1.0, cd: 4.5, voice: 'sunlance', fire: 0.18, move: 0 },   // spells.js holds the beam while K stays down
    halo: { sheet: 'o-cast', dur: 0.45, cancel: 0.35, cd: 2.4, voice: 'halo', fire: 0.14 },
    comet: { sheet: 'o-cast', dur: 0.6, cancel: 0.5, cd: 6.0, voice: 'comet', fire: 0.2 },
    wing: { sheet: 'o-cast', dur: 0.35, cancel: 0.25, cd: 8.0, voice: 'wing', fire: 0.1 },
  },
}
// Controls. J light and K heavy make strings; a string ending in K becomes a named finisher.
// L is the special, which cancels out of anything (meter); I guards (counter / wing shield).
//   Messenger: J J J  light chain   J K  Spin   J J K  Sword Wave   J J J K  Charged Slash
//              K K K  heavy chain ending in a lightning blade   hold K  charged slash
//   Oracle:    J      shoot (hold)  K    heavy feather          J J K  Halo   K K  Comet
//              J J J K  Sun Lance   L    chant the chosen spell (E picks)
const SKILL_KEYS = { messenger: { i: 'counter' }, runner: { i: 'wing' } }
const FINISH = {
  messenger: { H: 'heavy1', HH: 'heavy2', HHH: 'thunder', LH: 'spin', LLH: 'wave', LLLH: 'charge', LHH: 'heavy2', LLHH: 'thunder' },
  runner: { H: 'feather', HH: 'comet', LH: 'feather', LLH: 'halo', LLLH: 'sunlance', HHH: 'sunlance' },
}
const SPECIAL_COST = 25
function pushStr(c) { if (!P.str || (P.strT > 0.75 && !P.act)) P.str = []; P.str.push(c); if (P.str.length > 5) P.str.shift(); P.strT = 0 }
function heavyPressed() {
  pushStr('H')
  const s = P.str.join(''), tbl = FINISH[P.hero]
  let mv = tbl[s] || tbl[s.slice(-3)] || tbl[s.slice(-2)] || tbl.H
  if (P.hero === 'messenger' && !P.ground) mv = 'slam'
  if (MOVES[P.hero][mv]?.cd && P.cds[mv] > 0) mv = tbl.H
  if (mv !== tbl.H && mv !== 'heavy2' && mv !== 'slam') P.str = []      // a finisher ends the string
  if (P.act && P.act.t < P.act.m.cancel) { P.queueMove = mv; return }
  if (P.act && P.act.m.air && mv !== 'slam') return
  startMove(mv)
}
function specialPressed() {
  if (P.hero === 'runner') { if (typeof startChant === 'function') { if (startChant()) P.str = [] } return }
  const flourish = P.str.length >= 2 && P.act && !P.act.m.special
  const cost = flourish ? SPECIAL_COST * 0.6 : SPECIAL_COST
  if (P.meter < cost) return
  P.meter -= cost; P.flourish = flourish; P.str = []; P.act = null; P.queueMove = null
  startMove('rend')
  if (flourish) { slowT = Math.max(slowT, 0.18); flash = 0.2; flashColor = '255,240,200' }
}

function startMove(name) {
  const m = MOVES[P.hero][name]
  if (!m) return false
  if (m.cd) { if (P.cds[name] > 0) return false; P.cds[name] = m.cd }
  P.act = { name, m, t: 0, hitLog: new Map(), fired: false, arcDone: false }
  P.queue = false
  if (name !== 'rend') P.queueMove = null
  if (m.voice) { say(P.hero, m.voice); if (!['slash1', 'slash2', 'slash3', 'launch', 'air1', 'air2', 'feather', 'dashslash'].includes(name)) nameSub(moveName(P.hero, name)) }
  if (m.sfx && !m.arc) SFX[m.sfx]()
  if (m.jump) { P.vy = m.jump; P.ground = false }
  if (m.step && P.ground) P.vx = P.face * m.step
  if (m.lunge) P.vx = P.face * m.lunge
  if (m.slam) { P.vy = 400 }
  if (m.guard) P.guard = m.guard
  const nm = moveName(P.hero, name === 'air2' ? 'air' : name === 'air1' ? 'air' : name === 'dashslash' ? 'dash' : name)
  return true
}

function attackPressed() {
  const U = down('arrowup', 'w'), D = down('arrowdown', 's')
  if (P.act) {
    if (P.act.m.next) P.queue = true
    return
  }
  if (!P.ground) return startMove(D ? 'slam' : 'air1')
  if (P.postDash > 0) return startMove('dashslash')
  if (U) return startMove('launch')
  startMove('slash1')
}

function startDash(dir) {
  P.dashT = 0.19; P.dashDir = dir; P.dashCD = 0.32 * Math.pow(0.8, nB('swift')); P.iframe = Math.max(P.iframe, 0.26); P.perfect = 0.14
  P.vy = 0; P.act = null; P.guard = 0
  if (!P.ground) P.airDash--
  if (P.hero === 'runner') { P.face = -dir === 0 ? P.face : P.face } else P.face = dir
  SFX.dodge(); burst(P.x, P.y - 60, 8, '255,235,200', 260)
}

function swapHero() {
  P.cds.swap = 1.0
  sel = 1 - sel; P.hero = HEROES[sel]; P.act = null
  flash = 0.35; flashColor = '255,225,235'
  cancelBullets(P.x, P.y - 60, 240)
  ring(P.x, P.y - 60, 240, '255,220,230')
  say(P.hero, 'bark-start', true)
}

function updatePlayer(dt) {
  const L = down('arrowleft', 'a'), Rt = down('arrowright', 'd'), U = down('arrowup', 'w'), D = down('arrowdown', 's')
  for (const k of ['coyote', 'buffer', 'dashCD', 'iframe', 'hurtT', 'shootCD', 'drop', 'shield', 'postDash', 'perfect', 'guard', 'slow']) P[k] = Math.max(0, (P[k] || 0) - dt)
  P.crouchT = P.ground && !P.act && Math.abs(P.vx) < 60 && down('arrowdown', 's') ? (P.crouchT || 0) + dt : 0
  for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt)
  P.animT += dt
  if (P.dead) { P.vy += 2600 * dt; P.y = Math.min(GROUND, P.y + P.vy * dt); return }

  if (P.hero === 'runner') updateAim(dt)
  if (P.chant) updateChant(dt)
  if (tap('tab', 'q') && !P.cds.swap) swapHero()
  if (tap(' ')) P.buffer = 0.13
  const dirKey = (Rt ? 1 : 0) - (L ? 1 : 0)
  if (tap('shift', ';') && P.dashCD <= 0 && (P.ground || P.airDash > 0)) startDash(dirKey || (P.hero === 'runner' ? -P.face : P.face))

  // attacks and skills
  if (P.hurtT <= 0 && !P.chant) {
    if (P.hero === 'messenger') {
      if (tap('j')) { pushStr('L'); attackPressed() }
      if (down('k')) P.holdJ += dt
      if (tap('k')) heavyPressed()
      if (released.has('k')) { if (P.holdJ > 0.42 && (!P.act || P.act.t > P.act.m.cancel)) { P.act = null; startMove('charge'); P.str = [] } P.holdJ = 0 }
      if (!down('k')) P.holdJ = 0
    } else {
      P.holdJ = 0
      if (tap('j')) pushStr('L')
      if (down('j') && P.shootCD <= 0 && (!P.act || P.act.m.move !== 0)) { P.shootCD = 0.085; fireFeather() }
      if (tap('k')) heavyPressed()
      if (tap('e') && typeof cycleSpell === 'function') cycleSpell()
    }
    P.strT = (P.strT || 0) + dt
    if (tap('l')) specialPressed()
    for (const [k, mv] of Object.entries(SKILL_KEYS[P.hero])) if (tap(k)) { if (!P.act || P.act.t >= P.act.m.cancel) startMove(mv) }
    if (tap('r') && P.meter >= 100) ultimate()
  }

  // current move
  const act = P.act
  if (act) {
    act.t += dt
    const m = act.m
    if (m.fire && !act.fired && act.t >= m.fire) { act.fired = true; if (act.name === 'rend') rendFire(); else castSpell(act.name) }
    if (m.arc && !act.arcDone && act.t >= m.arc.at) { act.arcDone = true; slashArc(m.arc); SFX[m.sfx || 'slash']() }
    if (m.spin && Math.random() < 0.5) spinFx()
    if (act.t >= m.cancel && P.queueMove) { const q = P.queueMove; P.queueMove = null; P.act = null; startMove(q) }
    else if (act.t >= m.cancel && P.queue && m.next) startMove(m.next)
    else if (!m.slam && act.t >= m.dur) P.act = null
    if (P.act && P.act.m.air && P.ground && !P.act.m.slam) P.act = null
  }

  // movement
  const busy = P.act && !P.act.m.air
  if (P.dashT > 0) {
    P.dashT -= dt
    P.vx = P.dashDir * 1150 * (P.dashT > 0.05 ? 1 : 0.55); P.vy = 0
    if (P.trail.length === 0 || T - P.trail[P.trail.length - 1].t > 0.025) P.trail.push(snap())
    if (P.dashT <= 0) { P.vx *= 0.5; P.sprint = P.ground; P.postDash = 0.18 }
  } else if (P.hurtT <= 0) {
    const sp = (P.sprint && dirKey ? 650 : 440) * (P.slow > 0 ? 0.5 : 1) * (P.chant ? 0 : 1) * (1 + 0.08 * nB('swift'))
    const mul = busy ? (P.act.m.move ?? 0.12) : 1
    P.vx += (dirKey * sp * mul - P.vx) * Math.min(1, dt * (P.ground ? (busy ? 7 : 16) : 8))
    if (dirKey && !busy && P.hero !== 'runner') P.face = dirKey
    if (!dirKey) P.sprint = false
  }
  if (P.sprint && Math.random() < 0.3) P.trail.push(snap())

  if (P.buffer > 0 && P.hurtT <= 0 && !(P.act && P.act.m.slam)) {
    if (D && P.ground && P.onPlat) { P.drop = 0.25; P.buffer = 0; P.ground = false; P.y += 2 }
    else if (P.ground || P.coyote > 0) { P.vy = -1010; P.ground = false; P.coyote = 0; P.buffer = 0; P.jumpAnim = 'jump'; dust(P.x, P.y); if (busy) P.act = null }
    else if (P.jumps > 0) { P.jumps--; P.vy = -920; P.buffer = 0; P.jumpAnim = 'djump'; P.animT = 0; burst(P.x, P.y - 40, 12, '255,250,240', 220); if (P.act && !P.act.m.slam) P.act = null }
  }
  if (!down(' ') && P.vy < -380 && !(P.act && P.act.m.jump)) P.vy += 3400 * dt

  if (P.dashT <= 0) {
    const hover = P.act && P.act.m.hover
    if (hover && P.vy > 0) P.vy *= 0.6
    P.vy = Math.min(P.vy + (hover ? 900 : 2600) * dt, 1500)
  }
  if (P.act && P.act.m.slam && P.act.t > 0.12) P.vy = 2000

  const prev = P.y
  P.x += P.vx * dt; P.y += P.vy * dt
  P.x = stage ? clamp(P.x, leftBound(), rightBound()) : clamp(P.x, 30, WORLD - 30)
  // walls: solid sides, a walkable top; jump while sliding down one to kick off it
  P.onWall = 0
  for (const p of plats) if (p.kind === 'wall' && !p.broken && P.y > p.surf + 6 && P.x > p.l - 24 && P.x < p.r + 24) {
    const side = P.x < (p.l + p.r) / 2 ? -1 : 1
    P.x = side < 0 ? p.l - 24 : p.r + 24; P.vx = 0
    if (!P.ground) { P.onWall = side; if (P.vy > 200) P.vy = 200 }
  }
  if (P.onWall && P.buffer > 0 && P.y < GROUND - 4) { P.vy = -950; P.vx = P.onWall * 520; P.face = P.onWall; P.jumps = 1; P.airDash = 1; P.buffer = 0; dust(P.x, P.y - 40); SFX.dodge() }
  P.wasGround = P.ground; P.ground = false; P.onPlat = false
  const floor = inPit(P.x) ? Infinity : GROUND
  if (P.y >= floor) { P.y = floor; land(); P.safeX = P.x }
  else if (P.vy >= 0 && P.drop <= 0) {
    for (const p of plats) if (!p.broken && p.walk && P.x > p.l && P.x < p.r && prev <= p.surf + 2 && P.y >= p.surf) { P.y = p.surf; land(); P.onPlat = true; if (p.kind === 'crumble') { if (!(p.fall > 0)) p.fall = 0.6 } else P.safeX = P.x; break }
  }
  if (P.y > GROUND + 360 && !P.dead) fellInPit()
  if (P.wasGround && !P.ground && P.vy >= 0) P.coyote = 0.1
  while (P.trail.length && T - P.trail[0].t > 0.3) P.trail.shift()

  if (P.act && P.act.m.hits) playerHits(P.act)
}

function land() {
  if (!P.wasGround && P.vy > 700) dust(P.x, P.y)
  P.vy = 0; P.ground = true; P.jumps = 1; P.airDash = 1; P.jumpAnim = null
  if (P.act && P.act.m.slam) slamImpact()
}

function snap() { const s = pickAnim(); return { t: T, x: P.x, y: P.y, face: P.face, hero: P.hero, sheet: s.sheet, frame: s.frame } }

// ---------------------------------------------------------------- player attacks
function hitBoxOf(h) { return { x: P.face > 0 ? P.x + h.x : P.x - h.x - h.w, y: P.y + h.y, w: h.w, h: h.h } }

function playerHits(act) {
  for (const h of act.m.hits) {
    if (act.t < h.t0 || act.t > h.t1) continue
    const box = hitBoxOf(h)
    // the sword sends bullets back
    for (const b of bullets) if (b.enemy && !b.dead && circBox(b.x, b.y, b.r + 14, box)) reflect(b)
    for (const e of targets()) {
      if (!boxHit(box, e.box())) continue
      const last = act.hitLog.get(e)
      if (last != null && (!h.every || act.t - last < h.every)) continue
      act.hitLog.set(e, act.t)
      damage(e, h.dmg, { kb: (h.kb || 0) * P.face, launch: h.launch, juggle: h.juggle, spike: h.spike, x: box.x + box.w / 2, y: box.y + box.h / 2 })
      if (h.shake) shake = Math.max(shake, h.shake)
      stopT = Math.max(stopT, h.stop || 0.035)
      if (h.juggle) { P.vy = Math.min(P.vy, -120); P.airDash = 1 }
    }
    for (const p of plats) if (p.hp && !p.broken && boxHit(box, p)) { const last = act.hitLog.get(p); if (last == null || (h.every && act.t - last > h.every)) { act.hitLog.set(p, act.t); hurtPlat(p, h.dmg) } }
  }
}

function slamImpact() {
  P.act = null
  shake = Math.max(shake, 12); SFX.boom()
  ring(P.x, P.y - 10, 260, '255,210,150')
  for (let i = 0; i < 26; i++) parts.push({ x: P.x + R(-40, 40), y: P.y - 4, vx: R(-520, 520), vy: R(-520, -120), life: R(0.4, 0.8), t: 0, size: R(3, 7), color: '220,190,150', g: 1400 })
  const box = { x: P.x - 210, y: P.y - 140, w: 420, h: 150 }
  for (const e of targets()) if (boxHit(box, e.box())) damage(e, 22, { kb: Math.sign(e.x - P.x) * 500, launch: -500 })
  for (const b of bullets) if (b.enemy && circBox(b.x, b.y, b.r, box)) reflect(b)
  for (const p of plats) if (p.hp && !p.broken && boxHit(box, p)) hurtPlat(p, 30)
}

function ultimate() {
  P.meter = 0; P.iframe = 2.2; slowT = 0.6; dim = 1.4
  say(P.hero, 'ult', true); nameSub(moveName(P.hero, 'ult'), 1.8)
  if (fxk()?.ultPanel) { try { const d = FXK.ultPanel(P.hero, { name: moveName(P.hero, 'ult') }); slowT = Math.max(slowT, (d || 1.4) * 0.8) } catch (e) { console.warn('ultPanel', e) } }
  flash = 0.5; flashColor = '255,245,225'
  if (P.hero === 'messenger') {
    for (let i = 0; i < 10; i++) later(0.12 + i * 0.09, () => {
      const x = cam.x + R(150, VW() - 150), y = cam.y + R(0.25, 0.8) * VH()
      fx.push(bigSlash(x, y, R(0, Math.PI), R(260, 420)))
      SFX.slash(); shake = Math.max(shake, 8)
      for (const e of targets()) if (Math.abs(e.x - cam.x - VW() / 2) < VW() / 2 + 40) damage(e, 14, { x: e.x, y: e.y })
    })
  } else {
    fx.push(fxStrip('feather-5', P.x, P.y - 160, 1.2, 1.1))
    for (let i = 0; i < 70; i++) later(i * 0.025, () => {
      const x = cam.x + R(40, VW() - 40)
      bullets.push(pbullet(x, cam.y - 20, Math.PI / 2 + R(-0.25, 0.25), R(900, 1300), { dmg: 5, feather: true, status: Math.random() < 0.5 ? 'shock' : 'burn', pierce: true }))
    })
  }
  for (const b of bullets) if (b.enemy) cancel(b)
}

// ---------------------------------------------------------------- Oracle spells and shots
function handBase() { return { x: P.x + P.face * 20, y: P.y - 100 } }
function handPos() { const b = handBase(); return { x: b.x + Math.cos(P.aim) * 48, y: b.y + Math.sin(P.aim) * 48 } }
const aimed = (e, cone = 0.75) => { const h = handBase(), a = ang(h.x, h.y, e.x, e.y); return Math.abs(Math.atan2(Math.sin(a - P.aim), Math.cos(a - P.aim))) < cone }
function segDist(px, py, x0, y0, x1, y1) { const vx = x1 - x0, vy = y1 - y0, t = clamp(((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy), 0, 1); return Math.hypot(px - x0 - vx * t, py - y0 - vy * t) }
function fireFeather() {
  const h = handPos(), a = P.aim
  bullets.push(pbullet(h.x, h.y + R(-6, 6), a + R(-0.04, 0.04), 1350, { dmg: 3, feather: true }))
  SFX.shot()
  if (Math.random() < 0.4) parts.push({ x: h.x, y: h.y, vx: Math.cos(P.aim) * R(60, 160), vy: Math.sin(P.aim) * R(60, 160), life: 0.25, t: 0, size: R(2, 4), color: '255,230,200', add: true })
}

function castSpell(name) {
  const h = handPos()
  if (name === 'feather') {
    fx.push(fxStrip('feather-1', h.x, h.y, 0.42, 0.45))
    for (let i = 0; i < 9; i++) {
      const a = P.aim + (i - 4) * 0.16
      bullets.push(pbullet(h.x, h.y, a, 760, { dmg: 6, feather: true, home: 5.5, life: 1.6, big: true, cancels: true }))
    }
  } else if (name === 'sunlance') {
    shake = Math.max(shake, 5); SFX.zap()
    fx.push(beam(0.85))
  } else if (name === 'halo') {
    const ts = targets().filter(e => Math.abs(e.x - P.x) < 900 && aimed(e)).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)).slice(0, 3)
    if (!ts.length) { const h = handBase(), c = Math.cos(P.aim), sn = Math.sin(P.aim); const k = sn > 0.2 ? (GROUND - h.y) / sn : 420; ts.push({ x: clamp(h.x + c * Math.min(k, 600), cam.x + 40, cam.x + W - 40), y: GROUND - 60, fake: true }) }
    ts.forEach((e, i) => later(i * 0.08, () => pillar(e.fake ? e.x : e.x, e)))
  } else if (name === 'comet') {
    dim = 1.6
    const near = targets().filter(e => aimed(e, 1.0)), h0 = handBase(), dir = Math.cos(P.aim) >= 0 ? 1 : -1
    for (let i = 0; i < 8; i++) later(0.15 + i * 0.16, () => {
      const t = near.length ? near[i % near.length] : null
      const x = t ? t.x + R(-120, 120) : clamp(h0.x + dir * (160 + i * 110) + R(-40, 40), cam.x + 60, cam.x + VW() - 60)
      fx.push(comet(x))
    })
  } else if (name === 'wing') {
    P.shield = 3.6
    ring(P.x, P.y - 70, 120, '255,240,220')
  }
}

// ---------------------------------------------------------------- bullets
// Enemy bullets come in three colours, and the colour says what you can do about it:
//   red    'orb'    slash it back, cancel it with a spell, or dash through it
//   gold   'heavy'  too heavy to reflect or cancel; dash through it
//   black  'doom'   a black core in a crimson rim: nothing stops it and dashing doesn't help; jump or run
function ebullet(x, y, a, spd, o = {}) {
  const type = o.type || 'orb', hard = type !== 'orb'
  return { x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: o.r || (type === 'orb' ? 9 : type === 'heavy' ? 15 : 13), enemy: true, type,
    dmg: o.dmg || (type === 'doom' ? 18 : type === 'heavy' ? 15 : 12), life: o.life || 7, t: 0,
    cancelable: !hard && o.cancelable !== false, reflectable: !hard && o.reflectable !== false, kind: o.kind || 'orb', accel: o.accel || 0, roll: o.roll }
}
function pbullet(x, y, a, spd, o = {}) { return { x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: o.big ? 12 : 8, enemy: false, dmg: o.dmg || 3, life: o.life || 1.2, t: 0, feather: o.feather, home: o.home || 0, status: o.status, pierce: o.pierce, cancels: o.cancels, reflected: o.reflected, hitSet: new Set() } }

function reflect(b) {
  if (!b.reflectable) return
  b.dead = true
  const t = nearestTarget(b.x, b.y)
  const a = t ? ang(b.x, b.y, t.x, t.y - 20) : (P.face > 0 ? 0 : Math.PI)
  bullets.push(pbullet(b.x, b.y, a, 1100, { dmg: (t === B ? 5 : 10) * (1 + 0.35 * nB('mirror')), reflected: true, life: 2, big: true }))
  SFX.reflect(); stopT = Math.max(stopT, 0.02)
  P.meter = Math.min(100, P.meter + 1.5)
  sparks(b.x, b.y, 8, '255,220,140')
}
function cancel(b) {
  if (!b.cancelable) return false
  b.dead = true
  sparks(b.x, b.y, 4, '255,240,215'); P.meter = Math.min(100, P.meter + 0.4)
  return true
}
function cancelBullets(x, y, r) { let n = 0; for (const b of bullets) if (b.enemy && !b.dead && (b.x - x) ** 2 + (b.y - y) ** 2 < r * r && cancel(b)) n++; if (n) SFX.cancel(); return n }

function updateBullets(dt) {
  const hb = hurtbox()
  for (const b of bullets) {
    if (b.dead) continue
    b.t += dt
    if (b.home && b.t > 0.12) {
      const t = nearestTarget(b.x, b.y)
      if (t) { const want = ang(b.x, b.y, t.x, t.y - 20), cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy); let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); const na = cur + clamp(d, -b.home * dt, b.home * dt); b.vx = Math.cos(na) * sp * 1.01; b.vy = Math.sin(na) * sp * 1.01 }
    }
    if (b.accel) { const sp = Math.hypot(b.vx, b.vy), k = (sp + b.accel * dt) / sp; b.vx *= k; b.vy *= k }
    b.x += b.vx * dt; b.y += b.vy * dt
    if (b.roll) { const g = typeof groundAt === 'function' ? groundAt(b.x, b.y - b.r - 4) : GROUND; b.y = g === Infinity ? b.y + 400 * dt : g - b.r }
    if (b.t > b.life || b.x < cam.x - 200 || b.x > cam.x + VW() + 200 || b.y < cam.y - 400 || b.y > GROUND + 500) { b.dead = true; continue }
    if (b.enemy) {
      if (P.shield > 0 && (b.x - P.x) ** 2 + (b.y - P.y + 70) ** 2 < 125 ** 2 && cancel(b)) continue
      if (P.act && P.act.name === 'counter' && P.guard > 0 && b.reflectable && circBox(b.x, b.y, b.r + 30, hb)) { counterHit(b); continue }
      if (circBox(b.x, b.y, b.r, hb)) {
        if (P.iframe > 0 && !(b.type === 'doom' && T - (P.hurtAt || -9) > 1)) { if (P.perfect > 0) perfectDodge(); continue }
        b.dead = true; hurtPlayer(b.dmg, Math.sign(b.vx) || 1)
      }
    } else {
      for (const e of targets()) {
        if (b.hitSet.has(e)) continue
        if (circBox(b.x, b.y, b.r, e.box())) {
          b.hitSet.add(e)
          damage(e, b.dmg, { x: b.x, y: b.y, status: b.status, small: b.feather && !b.reflected })
          if (!b.pierce) { b.dead = true; break }
        }
      }
      if (!b.dead && (b.cancels || b.reflected)) for (const o of bullets) if (o.enemy && !o.dead && (o.x - b.x) ** 2 + (o.y - b.y) ** 2 < (o.r + b.r + 6) ** 2 && cancel(o)) { if (!b.reflected) { b.dead = true; break } }
      if (!b.dead) for (const p of plats) if (p.hp && !p.broken && b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h) { hurtPlat(p, b.dmg * 0.5); if (!b.pierce) b.dead = true; break }
    }
  }
  bullets = bullets.filter(b => !b.dead)
}

function counterHit(b) {
  b.dead = true; P.guard = 0
  slowT = 0.45; P.iframe = 0.6; flash = 0.25; flashColor = '255,235,200'
  say('messenger', 'counter'); nameSub(moveName('messenger', 'counter'))
  const t = nearestTarget(P.x, P.y)
  if (t && Math.abs(t.x - P.x) < 700) {
    const from = P.x
    P.x = clamp(t.x - P.face * 90, cam.x + 40, cam.x + VW() - 40); P.face = Math.sign(t.x - P.x) || 1
    trailLine(from, P.x, P.y)
    damage(t, 30, { x: t.x, y: t.y, kb: P.face * 300 })
  }
  cancelBullets(P.x, P.y - 60, 220)
  fx.push(bigSlash(P.x + P.face * 60, P.y - 90, P.face > 0 ? -0.5 : Math.PI + 0.5, 260))
  P.meter = Math.min(100, P.meter + 12)
  P.act = null
}

function perfectDodge() {
  P.perfect = 0
  slowT = Math.max(slowT, 0.35); SFX.dodge()
  P.meter = Math.min(100, P.meter + 8)
  ring(P.x, P.y - 60, 140, '255,240,230')
  if (P.hero === 'runner') say('runner', 'bark-dodge')
}

function hurtPlayer(dmg, dir) {
  if (P.dead) return
  if (P.chant) { P.hp -= dmg * 0.7; P.iframe = 0.5; P.hurtAt = T; flash = 0.15; flashColor = '255,70,60'; SFX.hurt(); if (P.hp <= 0) { P.hp = 0; P.dead = true; P.chant = null; later(1.6, () => { mode = 'dead' }) } return }
  P.hp -= dmg; P.iframe = 1.0; P.hurtAt = T; P.hurtT = 0.32; P.act = null; P.dashT = 0
  P.vx = dir * 380; P.vy = -380; P.ground = false
  shake = Math.max(shake, 8); flash = 0.2; flashColor = '255,70,60'; SFX.hurt()
  combo = 0
  say(P.hero, 'bark-hurt')
  if (P.hp <= 0) { P.hp = 0; P.dead = true; later(1.6, () => { mode = 'dead' }) }
}

// ---------------------------------------------------------------- enemies
// fx.js declares FXK with const, so it is not on window; it may also be missing
const fxk = () => (typeof FXK !== 'undefined' ? FXK : null)
function targets() { const t = enemies.filter(e => !e.dead && !e.untargetable); if (B && !B.dead && B.active && !B.chaser) t.push(B); return t }
function nearestTarget(x, y) { let best = null, d = Infinity; for (const e of targets()) { const dd = (e.x - x) ** 2 + (e.y - y) ** 2; if (dd < d) { d = dd; best = e } } return best }

function applyStatus(e, s) {
  if (s === 'burn') { e.burn = Math.max(e.burn, 4); if (e.burn > 0 && e.charredHits++ > 4) e.charred = 5 }
  if (s === 'shock') { e.shock = Math.max(e.shock, 2.2); e.stun = Math.max(e.stun, e === B ? 0.15 : 0.7) }
  if (s === 'char') e.charred = Math.max(e.charred, 6)
}

function damage(e, dmg, o = {}) {
  if (e.dead || (e === B && (!B.active || B.chaser))) return
  if (e.def?.base === 'shield' && typeof ENEMY_BASES !== 'undefined' && ENEMY_BASES.shield.blocks?.(e, o.x ?? P.x)) return
  let m = 1 + 0.25 * nB('edge')
  if (!o.status) { if (Math.random() < 0.12 * nB('ember')) o = { ...o, status: 'burn' }; else if (Math.random() < 0.12 * nB('storm')) o = { ...o, status: 'shock' } }
  if (e.charred > 0) m *= 1.3
  if (e === B && B.window > 0) m *= 1.6
  if (e === B && B.guard) m *= 0.5
  const d = dmg * m
  e.hp -= d; e.flash = 0.08
  if (!o.small) { SFX.hit(); if (fxk()?.hit) try { FXK.hit(o.x ?? e.x, o.y ?? e.y - 40, (o.x ?? P.x) < e.x ? 1 : -1, Math.min(3, Math.round(dmg / 12))) } catch (err) {} }
  sparks(o.x ?? e.x, o.y ?? e.y, o.small ? 3 : 8, e.charred > 0 ? '255,170,110' : '255,235,190')
  if (o.status) applyStatus(e, o.status)
  if (e !== B) {
    if (o.kb) e.vx += o.kb
    if (o.launch) { e.vy = o.launch; e.air = 1.3 }
    if (o.juggle && e.air > 0) { e.vy = -260; e.air = Math.max(e.air, 0.6) }
    if (o.spike && e.air > 0) e.vy = 900
  }
  combo++; comboT = 1.6
  P.meter = Math.min(100, P.meter + d * 0.35 * (1 + 0.3 * nB('zeal')))
  if (e.hp <= 0) kill(e)
}

function kill(e) {
  e.dead = true
  if (e === B) return bossDown()
  shake = Math.max(shake, 6); SFX.boom()
  for (let i = 0; i < 22; i++) parts.push({ x: e.x, y: e.y, vx: R(-420, 420), vy: R(-480, 200), life: R(0.4, 1.0), t: 0, size: R(3, 8), color: i % 3 ? '210,40,40' : '255,200,140', g: 900, add: i % 3 === 0 })
  ring(e.x, e.y, 120, '255,140,110')
  if (Math.random() < 0.25) say(P.hero, 'bark-kill')
  if (nB('leech')) P.hp = Math.min(P.max, P.hp + 2 * nB('leech'))
  if (fxk()?.smoke) FXK.smoke(e.x, e.y, 6, { color: 'dark' })
}

function statusTick(e, dt) {
  e.tick -= dt
  if (e.burn > 0) { e.burn -= dt; if (Math.random() < 0.5) parts.push({ x: e.x + R(-20, 20), y: e.y + R(-10, 20), vx: R(-20, 20), vy: R(-120, -60), life: 0.5, t: 0, size: R(3, 6), color: '255,140,60', add: true }) }
  if (e.shock > 0) { e.shock -= dt; if (Math.random() < 0.25) zapFx(e.x + R(-30, 30), e.y + R(-30, 30)) }
  if (e.charred > 0) e.charred -= dt
  if (e.tick <= 0) {
    e.tick = 0.3
    let d = 0
    if (e.burn > 0) d += 2.4
    if (e.shock > 0) d += 1.6
    if (d) { e.hp -= d * (e.charred > 0 ? 1.3 : 1); e.flash = 0.03; if (e.hp <= 0) kill(e) }
  }
  for (const f of patches) if (f.kind === 'fire' && e.x > f.l && e.x < f.r && Math.abs(e.y - f.y) < 90) applyStatus(e, 'burn')
  for (const f of patches) if (f.kind === 'shock' && (e.x - f.x) ** 2 + (e.y - f.y) ** 2 < 120 ** 2) applyStatus(e, 'shock')
}

// ---------------------------------------------------------------- environment
function hurtPlat(p, dmg) {
  p.hp -= dmg; p.hit = 0.1
  if (p.hp > 0) return
  p.broken = true; p.respawn = 16
  shake = Math.max(shake, 9); SFX.boom()
  const cols = 4, rows = 3
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    parts.push({ chunk: { img: p.img, sx: i * p.img.width / cols, sy: j * p.img.height / rows, sw: p.img.width / cols, sh: p.img.height / rows, s: p.s }, x: p.x + (i + 0.5) * p.w / cols, y: p.y + (j + 0.5) * p.h / rows, vx: R(-300, 300), vy: R(-600, -150), rot: 0, vr: R(-6, 6), life: 1.6, t: 0, g: 1800 })
  }
  for (let i = 0; i < 20; i++) parts.push({ x: p.x + R(0, p.w), y: p.y + R(0, p.h), vx: R(-200, 200), vy: R(-300, 0), life: R(0.6, 1.2), t: 0, size: R(6, 14), color: '200,180,160', g: 200, smoke: true })
  decals.push({ x: p.x + p.w / 2, y: GROUND, r: p.w * 0.7, t: 14, max: 14 })
  if (p.kind === 'brazier') {
    patches.push({ kind: 'fire', l: p.x - 120, r: p.x + p.w + 120, x: p.x + p.w / 2, y: GROUND, t: 6, max: 6 })
    explode(p.x + p.w / 2, p.y + 40, 170, 18, 'burn')
  }
}

function explode(x, y, r, dmg, status) {
  ring(x, y, r, '255,190,120'); shake = Math.max(shake, 10)
  for (let i = 0; i < 30; i++) { const a = R(0, Math.PI * 2), s = R(100, 600); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: R(0.3, 0.8), t: 0, size: R(4, 10), color: i % 2 ? '255,170,80' : '255,230,170', add: true }) }
  for (const e of targets()) if ((e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2) damage(e, dmg, { x: e.x, y: e.y, status, launch: e === B ? 0 : -400 })
  cancelBullets(x, y, r)
  for (const p of plats) if (p.hp && !p.broken && circBox(x, y, r * 0.7, p)) hurtPlat(p, dmg * 1.5)
}

function updateWorld(dt) {
  for (const p of plats) { p.hit = Math.max(0, p.hit - dt); if (p.broken && (p.respawn -= dt) <= 0) { p.broken = false; p.hp = p.max; p.reform = 1 } if (p.reform) p.reform = Math.max(0, p.reform - dt) }
  for (const d of decals) d.t -= dt
  decals = decals.filter(d => d.t > 0)
  for (const f of patches) {
    f.t -= dt
    if (f.kind === 'fire' && Math.random() < 0.9) parts.push({ x: R(f.l, f.r), y: f.y - R(0, 8), vx: R(-20, 20), vy: R(-200, -80), life: R(0.3, 0.7), t: 0, size: R(4, 9), color: Math.random() < 0.5 ? '255,120,40' : '255,200,90', add: true })
    if (f.kind === 'shock' && Math.random() < 0.4) zapFx(f.x + R(-90, 90), f.y - R(0, 120))
  }
  patches = patches.filter(f => f.t > 0)
}

// ---------------------------------------------------------------- effects
function sparks(x, y, n, color) { for (let i = 0; i < n; i++) { const a = R(0, Math.PI * 2), s = R(150, 520); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: R(0.12, 0.3), t: 0, size: R(2, 4), color, add: true, streak: true }) } }
function burst(x, y, n, color, s) { for (let i = 0; i < n; i++) { const a = R(0, Math.PI * 2); parts.push({ x, y, vx: Math.cos(a) * R(s * 0.3, s), vy: Math.sin(a) * R(s * 0.3, s), life: R(0.3, 0.6), t: 0, size: R(2, 5), color, add: true, feather: Math.random() < 0.5 }) } }
function dust(x, y) { for (let i = 0; i < 10; i++) parts.push({ x: x + R(-20, 20), y: y - 4, vx: R(-200, 200), vy: R(-120, -20), life: R(0.3, 0.6), t: 0, size: R(5, 10), color: '230,210,190', smoke: true }) }
function ring(x, y, r, color) { fx.push({ t: 0, dur: 0.4, draw(k) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${color},${1 - k})`; ctx.lineWidth = 10 * (1 - k) + 1; ctx.beginPath(); ctx.arc(x, y, r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke() } }) }
function zapFx(x, y) {
  const pts = [[x, y]]; for (let i = 0; i < 4; i++) pts.push([pts[i][0] + R(-22, 22), pts[i][1] + R(-22, 22)])
  fx.push({ t: 0, dur: 0.12, draw(k) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,250,200,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke() } })
}
function trailLine(x0, x1, y) { fx.push({ t: 0, dur: 0.3, draw(k) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,230,190,0)'); g.addColorStop(1, `rgba(255,240,220,${1 - k})`); ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), y - 90, Math.abs(x1 - x0), 8) } }) }

// a sword arc in front of the Messenger: drawn as a tapered crescent, gold to white
function slashArc(a) {
  if (fxk()?.slash) {
    const mid = (a.a0 + a.a1) / 2, ang_ = P.face > 0 ? mid : Math.PI - mid
    try { FXK.slash(P.x + P.face * 40, P.y - 95, ang_, a.r * 2, { color: a.thunder ? 'white' : a.w > 40 ? 'crimson' : 'gold', heavy: a.w > 40, thunder: a.thunder, face: P.face, a0: a.a0, a1: a.a1, r: a.r }) } catch (e) { console.warn('FXK.slash', e) }
    if (a.thunder && FXK.thunderBlade) FXK.thunderBlade(P.x + P.face * 40, P.y - 95, P.face > 0 ? 0 : Math.PI, a.r * 1.6)
    return
  }
  const x = P.x + P.face * 40, y = P.y - 95, face = P.face
  fx.push({ t: 0, dur: 0.2, follow: true, draw(k) {
    ctx.save(); ctx.translate(P.x + face * 40, P.y - 95); ctx.scale(face, 1)
    ctx.globalCompositeOperation = 'lighter'
    const steps = 14, a0 = a.a0, a1 = lerp(a.a0, a.a1, Math.min(1, k * 2.2))
    for (let i = 0; i < steps; i++) {
      const s0 = lerp(a0, a1, i / steps), s1 = lerp(a0, a1, (i + 1) / steps), f = i / steps
      ctx.strokeStyle = `rgba(255,${200 + 55 * f | 0},${130 + 120 * f | 0},${(1 - k) * (0.25 + 0.75 * f)})`
      ctx.lineWidth = a.w * (0.2 + 0.8 * f) * (1 - k * 0.6)
      ctx.beginPath()
      if (a.flat) { ctx.moveTo(-a.r * 0.4 + f * a.r * 1.6, 0); ctx.lineTo(-a.r * 0.4 + (f + 1 / steps) * a.r * 1.6, 0) }
      else ctx.arc(0, 0, a.r, s0, s1)
      ctx.stroke()
    }
    ctx.restore()
  } })
}
function bigSlash(x, y, rot, len) {
  return { t: 0, dur: 0.35, draw(k) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter'
    const w = 26 * (1 - k)
    const g = ctx.createLinearGradient(-len, 0, len, 0); g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(0.5, `rgba(255,250,235,${1 - k})`); g.addColorStop(1, 'rgba(255,200,120,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-len, 0); ctx.quadraticCurveTo(0, -w, len, 0); ctx.quadraticCurveTo(0, w * 0.4, -len, 0); ctx.fill(); ctx.restore()
  } }
}
function spinFx() { const a = R(0, Math.PI * 2); parts.push({ x: P.x + Math.cos(a) * 150, y: P.y - 90 + Math.sin(a) * 70, vx: -Math.sin(a) * 600, vy: Math.cos(a) * 280, life: 0.18, t: 0, size: 3, color: '255,225,170', add: true, streak: true }) }
function fxStrip(name, x, y, dur, s) {
  const img = A.fx[name]; const n = Math.max(1, Math.round(img.width / img.height)), slot = img.width / n; s *= img.k0 || 1
  return { t: 0, dur, draw(k) { const f = Math.min(n - 1, k * n | 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3; ctx.drawImage(img, f * slot, 0, slot, img.height, x - slot * s / 2, y - img.height * s / 2, slot * s, img.height * s); ctx.globalAlpha = 1 } }
}

// Messenger's 天裂波: a crescent that travels, cuts and sends bullets back
// Special: a double crescent; after a string, lightning also strikes the nearest three.
function rendFire() {
  const fl = P.flourish
  waveShot(); later(0.09, waveShot)
  if (fxk()?.thunderBlade) FXK.thunderBlade(P.x + P.face * 60, P.y - 100, P.face > 0 ? 0 : Math.PI, fl ? 520 : 340)
  if (!fl) return
  const ts = targets().filter(e => Math.abs(e.x - P.x) < 900).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)).slice(0, 3)
  ts.forEach((e, i) => later(0.12 + i * 0.08, () => { if (e.dead) return; zapFx(e.x, e.y - 40); damage(e, 22, { x: e.x, y: e.y, status: 'shock' }); SFX.zap(); shake = Math.max(shake, 6) }))
  P.flourish = false
}
function waveShot() {
  const face = P.face, y = P.y - 90
  const o = { t: 0, dur: 1.2, x: P.x + face * 60, hit: new Set(), update(dt) {
    this.x += face * 1100 * dt
    const box = { x: this.x - 50, y: y - 110, w: 100, h: 220 }
    for (const b of bullets) if (b.enemy && circBox(b.x, b.y, b.r, box)) reflect(b)
    for (const e of targets()) if (!this.hit.has(e) && boxHit(box, e.box())) { this.hit.add(e); damage(e, 16, { x: e.x, y: e.y, kb: face * 260 }) }
    for (const p of plats) if (p.hp && !p.broken && !this.hit.has(p) && boxHit(box, p)) { this.hit.add(p); hurtPlat(p, 25) }
  }, draw(k) {
    ctx.save(); ctx.translate(this.x, y); ctx.scale(face, 1); ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(255,${220 + i * 15},${170 + i * 40},${(1 - k) * (0.4 + i * 0.3)})`; ctx.lineWidth = 22 - i * 7; ctx.beginPath(); ctx.arc(-40, 0, 110, -1.1, 1.1); ctx.stroke() }
    ctx.restore()
  } }
  fx.push(o)
}
const _castSpell = castSpell
castSpell = function (name) { if (name === 'wave') return waveShot(); return _castSpell(name) }

// Oracle's 日輪の槍: a beam that burns, chars, cancels bullets and breaks stone
function beam(dur) {
  let a = P.aim
  return { t: 0, dur, tick: 0, update(dt) {
    const d = Math.atan2(Math.sin(P.aim - a), Math.cos(P.aim - a)); a += clamp(d, -2.6 * dt, 2.6 * dt)
    const h = handPos(), x1 = h.x + Math.cos(a) * 1600, y1 = h.y + Math.sin(a) * 1600
    const onRay = (x, y, r) => segDist(x, y, h.x, h.y, x1, y1) < 34 + r
    for (const b of bullets) if (b.enemy && onRay(b.x, b.y, b.r)) cancel(b)
    this.tick -= dt
    if (this.tick <= 0) {
      this.tick = 0.1
      for (const e of targets()) { const bx = e.box(); if (onRay(bx.x + bx.w / 2, bx.y + bx.h / 2, Math.min(bx.w, bx.h) / 2)) { damage(e, 5, { x: e.x, y: e.y, status: 'burn', small: true }); e.charredHits = (e.charredHits || 0) + 1; if (e.charredHits > 6) applyStatus(e, 'char') } }
      for (const p of plats) if (p.hp && !p.broken && onRay(p.x + p.w / 2, p.y + p.h / 2, Math.min(p.w, p.h) / 2)) hurtPlat(p, 8)
      shake = Math.max(shake, 3)
    }
  }, draw(k) {
    const h = handPos(), len = 1600 * Math.min(1, k * 6)
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter'
    const al = 1 - Math.max(0, k - 0.8) / 0.2, wob = 1 + Math.sin(T * 60) * 0.08
    for (const [w, c, o] of [[70, '255,140,60', 0.25], [40, '255,200,120', 0.5], [16, '255,250,235', 0.95]]) { ctx.fillStyle = `rgba(${c},${o * al})`; ctx.fillRect(0, -w * wob / 2, len, w * wob) }
    ctx.fillStyle = `rgba(255,250,235,${al})`; ctx.beginPath(); ctx.arc(0, 0, 26 * wob, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  } }
}

// Oracle's 天光柱: a pillar of light that shocks, chains and leaves a shocked field
function pillar(x, target) {
  const y0 = 0, y1 = GROUND
  SFX.zap(); shake = Math.max(shake, 6)
  cancelBullets(x, (target.y || GROUND) - 40, 150)
  for (const e of targets()) if (Math.abs(e.x - x) < 70 + e.r) damage(e, 14, { x: e.x, y: e.y, status: 'shock' })
  // chain to whoever stands close
  for (const e of targets()) if (Math.abs(e.x - x) >= 70 + e.r && Math.hypot(e.x - x, e.y - (target.y || GROUND)) < 260) { zapFx(e.x, e.y); damage(e, 6, { x: e.x, y: e.y, status: 'shock', small: true }) }
  patches.push({ kind: 'shock', x, y: GROUND - 20, t: 3, max: 3 })
  decals.push({ x, y: GROUND, r: 70, t: 6, max: 6 })
  fx.push({ t: 0, dur: 0.5, draw(k) {
    ctx.globalCompositeOperation = 'lighter'
    const w = 90 * (1 - k * 0.7)
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, `rgba(255,252,235,${1 - k})`); g.addColorStop(1, 'rgba(255,240,180,0)')
    ctx.fillStyle = g; ctx.fillRect(x - w, y0, w * 2, y1 - y0)
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(255,250,210,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); let yy = 0, xx = x; ctx.moveTo(xx, yy); while (yy < y1) { yy += 40; xx = x + R(-30, 30); ctx.lineTo(xx, yy) } ctx.stroke() }
  } })
}

// Oracle's 流星墜: a comet that shakes the whole ground, breaks stone and leaves fire and char
function comet(x) {
  const sx = x - 300, sy = -120
  return { t: 0, dur: 0.42, done: false, update() {
    if (this.t >= this.dur - 0.02 && !this.done) {
      this.done = true
      let y = GROUND
      for (const p of plats) if (!p.broken && p.walk && x > p.l && x < p.r && p.surf < y && p.surf > 200) y = p.surf
      explode(x, y - 20, 160, 22, 'burn')
      for (const e of targets()) if (Math.abs(e.x - x) < 170) applyStatus(e, 'char')
      decals.push({ x, y, r: 150, t: 12, max: 12 })
      patches.push({ kind: 'fire', l: x - 110, r: x + 110, x, y, t: 3.5, max: 3.5 })
      shake = Math.max(shake, 16); SFX.boom()
    }
  }, draw(k) {
    const cx = lerp(sx, x, k), cy = lerp(sy, GROUND - 20, k)
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createLinearGradient(cx - 180, cy - 200, cx, cy); g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, 'rgba(255,230,170,0.95)')
    ctx.strokeStyle = g; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 180, cy - 200); ctx.lineTo(cx, cy); ctx.stroke(); ctx.lineCap = 'butt'
    ctx.fillStyle = 'rgba(255,250,235,1)'; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill()
  } }
}

// Teknium: the floor wall you have to jump
function arrow() { fx.push({ t: 0, dur: 2.5, draw(k) { const x = cam.x + VW() - 80 + Math.sin(T * 8) * 10, y = cam.y + VH() * 0.5; ctx.fillStyle = `rgba(255,230,190,${Math.sin(k * Math.PI)})`; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 30); ctx.fill() }, screen: false }) }

let sub = null
function subtitle(text, t) { if (text && CJK.test(text)) return; sub = { text, t, max: t } }
// the move name under the Japanese voice: small, low, short; boss dialogue keeps the main subtitle line
let nsub = null
const NSUB_SEEN = {}
function nameSub(text, t = 1.3) {
  if (!text || CJK.test(text) || T - (NSUB_SEEN[text] ?? -99) < 6) return
  NSUB_SEEN[text] = T; nsub = { text, t, max: t }
}

// ---------------------------------------------------------------- animation pick
// How long each of the 6 frames is held, as weights. Attacks: a held wind-up, a fast swing, a
// long impact frame, then recovery. Loops: rest on the key poses. heroes.json `holds` overrides.
const HOLDS = { attack: [1.5, 0.7, 0.6, 2.0, 1.2, 1.0], cast: [1.2, 1.4, 0.8, 2.0, 1.0, 1.0], hurt: [2, 1, 1, 1, 1, 1], loop: [1.6, 1, 0.9, 1.6, 1, 0.9], run: [1, 1, 1, 1, 1, 1] }
// a sheet doubled with RIFE in-betweens has 2n (loop) or 2n-1 frames: split each hold across its pair
function holdsOf(hero, name, looping) {
  const w = holdsBase(hero, name, looping), n = A.sheets?.[hero]?.[name]?.n || w.length
  if (n <= w.length) return w
  if (n > w.length * 2) return Array(n).fill(1)   // frames sampled from video are evenly timed
  const out = []; for (let i = 0; i < n; i++) out.push(w[Math.min(w.length - 1, i >> 1)] / 2)
  return out
}
function holdsBase(hero, name, looping) {
  const own = CFG.heroes[hero]?.holds?.[name]
  if (own) return own
  if (/hurt/.test(name)) return HOLDS.hurt
  if (looping) return /run|sprint|spin|shoot/.test(name) ? HOLDS.run : HOLDS.loop
  return /cast|charge|counter/.test(name) ? HOLDS.cast : /jump|dodge|roll|dash/.test(name) ? HOLDS.run : HOLDS.attack
}
function frameAt(k, w) {
  let sum = 0; for (const x of w) sum += x
  let acc = 0; for (let i = 0; i < w.length; i++) { acc += w[i] / sum; if (k < acc) return i }
  return w.length - 1
}
function pickAnim() {
  const h = P.hero
  const S = A.sheets[h]
  const loop = (name, fps) => { const w = holdsOf(h, name, true); return { sheet: name, frame: frameAt((P.animT * fps / 6) % 1, w) } }   // fps of the 6 painted frames: a RIFE-doubled sheet keeps the same tempo
  const over = (name, t, dur) => ({ sheet: name, frame: frameAt(Math.min(0.999, t / Math.max(dur, 0.36)), holdsOf(h, name, false)) })
  if (P.dead || P.hurtT > 0) return over(h === 'messenger' ? 'hurt' : 'o-hurt', 0.2, 0.4)
  if (P.act) {
    const m = P.act.m
    if (m.slam) return { sheet: 'airslam', frame: P.act.t < 0.15 ? Math.floor(P.act.t / 0.05) : 3 }
    if (m.spin) return loop('m-spin', 12)
    if (P.act.name === 'counter') return over('m-counter', P.act.t, m.dur)
    return over(m.sheet, P.act.t, m.sheet === 'o-cast' ? Math.max(m.dur, 0.6) : m.dur)
  }
  if (P.dashT > 0) return h === 'messenger' ? over(P.ground ? 'dash' : 'roll', 0.19 - P.dashT, 0.19) : over('o-dodge', 0.19 - P.dashT, 0.22)
  // crouch: Down while standing still shows the take-off crouch from the jump sheet; a drop through a
  // platform keeps it for a moment as she sinks, so the move reads
  const crouchSheet = h === 'messenger' ? 'jump' : 'o-jump'
  if (!P.ground && P.drop > 0.13 && S?.[crouchSheet]) return { sheet: crouchSheet, frame: 0 }
  if (P.ground && Math.abs(P.vx) < 60 && down('arrowdown', 's') && !(h === 'runner' && down('j')) && S?.[crouchSheet]) return { sheet: crouchSheet, frame: P.crouchT > 0.06 ? 0 : 1 }
  if (!P.ground) {
    if (h === 'messenger') { if (P.jumpAnim === 'djump') return over('djump', P.animT, 0.45); { const f = P.vy < -650 ? 0 : P.vy < -250 ? 1 : P.vy < 180 ? 2 : P.vy < 650 ? 3 : 4; return { sheet: 'jump', frame: (A.sheets.messenger?.jump?.n || 6) > 6 ? f * 2 : f } } }   // 3-4: falling, hair and hem lift
    { const n = A.sheets.runner?.['o-jump']?.n || 6, f = P.vy < -650 ? 1 : P.vy < -200 ? 1 + (P.vy + 650) / 450 : P.vy < 220 ? 2 + (P.vy + 200) / 420 : P.vy < 650 ? 3 + (P.vy - 220) / 430 : Math.min(5, 4 + (P.vy - 650) / 400)
      return { sheet: 'o-jump', frame: n > 6 ? Math.round(f * 2) : Math.ceil(f) } }   // painted 1-2 rising, 3 apex, 4-5 falling; a RIFE sheet adds the in-betweens
  }
  const moving = Math.abs(P.vx) > 60
  if (h === 'runner') {
    if (down('j')) return moving ? loop('o-run', 9) : loop('o-shoot', 8)
    if (moving) return loop('o-run', 9)
    return loop('o-idle', (A.sheets.runner?.['o-idle']?.n || 6) > 12 ? 6 / 2.79 : 4)   // the Veo idle runs at its real 2.79 s
  }
  if (P.holdJ > 0.42) return { sheet: 'm-charge', frame: 0 }
  if (moving) return P.sprint ? loop('sprint', 11) : loop('run', 9.5)
  return loop('m-idle', (A.sheets.messenger?.['m-idle']?.n || 6) > 12 ? 6 / 2.85 : 4)   // the Veo idle runs at its real 2.85 s
}

// how tall the current heroine stands on screen (world px); bosses are drawn to match
function heroHeight() { const h = P?.hero || 'messenger', s = A.sheets?.[h]?.[h === 'runner' ? 'o-idle' : 'm-idle'] || A.sheets?.messenger?.idle; return s ? Math.round(s.h * SCALE[s === A.sheets?.messenger?.idle ? 'messenger' : h]) : 165 }
function drawSprite(hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
  const s = A.sheets[hero][sheet]; if (!s) return
  const k = SCALE[hero] * scale, slot = s.img.height
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(face * k, k)
  ctx.drawImage(s.img, frame * slot, 0, slot, slot, -s.x, -s.y, slot, slot)
  ctx.restore()
}

// ---------------------------------------------------------------- autoplay (swarm engine/autoplay.mjs, or ?auto / P)
// The game plays itself through the same keys a person presses. A tactic (from Jev, or
// the game's own pick when no answer came in the last 2.5 s) says what to go for; the
// reflexes underneath always jump floor sweeps, step out of lasers and dash the glare.
const AUTO = { on: /[?&]auto\b/.test(location.search), tactic: 'pressure', why: '', at: -99, src: 'self', held: new Set(), next: 0, count: {}, hero: null }
const TACTICS = {
  pressure: 'Attack the nearest enemy or the boss and keep moving.',
  punish: 'The boss is resting (attack window, takes more damage): go all in with the strongest moves.',
  evade: 'Get out of the bullets: dash through them (invincible while dashing) or jump to another platform.',
  reflect: 'Baker: swing or spin into the bullets to send them back at the boss.',
  cast: 'Oracle: cast the spell that fits (beam, feathers, halo, comets or wing shield).',
  swap: 'Switch to the other heroine.',
  ult: 'Use the ultimate now (meter is full).',
}
const GOAL = 'Clear the drones, then beat the boss Teknium without dying. Dash makes you invincible; the red glare can only be dashed or countered; jump over floor sweeps; hit hardest while the boss rests.'
function goalNow() {
  const s = stage && curSection()
  if (!s) return GOAL
  const tail = ' Red orbs can be reflected or dashed; gold ones only dashed; black ones must be jumped or avoided.'
  if (s.kind === 'chase') return 'Run right ahead of the wall; jump the pits; crumbling stones fall soon after you land.' + tail
  if (s.kind === 'titan') return 'Stand on each glowing seal until it fills to bring the titan down, while fighting off its waves.' + tail
  if (s.kind === 'arena') return `Beat the boss ${s.boss || ''} without dying; hit hardest while it rests.` + tail
  return 'Clear the enemies and move right to the next gate.' + tail
}
const nearBullets = r => bullets.filter(b => b.enemy && (b.x - P.x) ** 2 + (b.y - P.y + 60) ** 2 < r * r)
function tacticsNow() {
  if (mode !== 'play' || P.dead) return {}
  const t = { pressure: TACTICS.pressure }
  if (B && B.active && B.window > 0) t.punish = TACTICS.punish
  if (nearBullets(220).length >= 3) t.evade = TACTICS.evade
  if (P.hero === 'messenger' && nearBullets(260).length >= 2) t.reflect = TACTICS.reflect
  if (P.hero === 'runner' && targets().length && Object.values(SKILL_KEYS.runner).some(m => !(P.cds[m] > 0))) t.cast = TACTICS.cast
  if (!(P.cds.swap > 0) && (P.hp < P.max * 0.35 || (P.hero === 'runner' && enemies.filter(e => !e.dead && Math.abs(e.x - P.x) < 200).length >= 2))) t.swap = TACTICS.swap
  if (P.meter >= 100) t.ult = TACTICS.ult
  return t
}
function playState() {
  const tg = targets()
  return {
    mode, t: +T.toFixed(1), goal: goalNow(), stage: stage ? { index: stageIdx, id: stage.id, name: stage.name, section: curSection()?.kind } : null,
    threats: bullets.filter(b => b.enemy && b.type !== 'orb' && Math.abs(b.x - P.x) < 500).slice(0, 8).map(b => ({ kind: b.type, side: b.x < P.x ? 'left' : 'right', dy: Math.round(b.y - P.y), in: +(Math.abs(b.x - P.x) / Math.max(60, Math.abs(b.vx))).toFixed(2), clear: b.type === 'doom' ? 'jump or move' : 'dash or move' })),
    hazards: typeof HZ !== 'undefined' ? HZ.slice(0, 8).map(h => ({ kind: h.kind, dx: Math.round(h.x - P.x), live: h.t >= h.tell, in: +Math.max(0, h.tell - h.t).toFixed(2), clear: h.kind === 'crack' ? 'jump' : 'move away' })) : [],
    pit_ahead: !!(typeof inPit === 'function' && (inPit(P.x + P.face * 120) || inPit(P.x + P.face * 220))),
    chase: typeof chase !== 'undefined' && chase ? { wall_dx: Math.round(chase.x - P.x) } : null,
    titan: typeof TI !== 'undefined' && TI ? { seals_left: TI.s.seals.filter(z => !z.done).map(z => Math.round(z.x - P.x)) } : null,
    result: mode === 'win' || mode === 'dead' ? { mode, seconds: +T.toFixed(1) } : null,
    cds: Object.fromEntries(Object.entries(P.cds || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(1)])), hero: P.hero, hp: Math.round(P.hp), max: P.max, meter: Math.round(P.meter), ground: P.ground,
    ready: Object.entries(SKILL_KEYS[P.hero] || {}).filter(([, m]) => !(P.cds[m] > 0)).map(([, m]) => m),
    wave, boss: B ? { hp: Math.round(B.hp), max: B.max, phase: B.phase, doing: B.pose, resting: B.window > 0, active: B.active } : null,
    enemies: tg.filter(e => e !== B).map(e => ({ kind: e.type, dx: Math.round(e.x - P.x), dy: Math.round(e.y - P.y), hp: Math.round(e.hp), burning: e.burn > 0, shocked: e.shock > 0, charred: e.charred > 0 })),
    bullets_near: nearBullets(260).length, danger: fx.filter(f => f.kind).map(f => f.kind), tactic: AUTO.tactic, src: AUTO.src, combo,
    tactics: tacticsNow(),
  }
}
window.SWARM_PLAY = {
  state: playState,
  act(name, why = '') { if (TACTICS[name]) { AUTO.tactic = name; AUTO.why = why; AUTO.at = T; AUTO.src = 'jev'; AUTO.count[name] = (AUTO.count[name] || 0) + 1 } },
  start(hero) { AUTO.on = true; if (hero) sel = Math.max(0, HEROES.indexOf(hero)); if (mode !== 'play') startGame() },
  auto(on = true) { AUTO.on = on },
}
// plays strings the way a person would: the next key once the current swing can be cancelled
const AUTO_STRINGS = [['j', 'j', 'j'], ['j', 'j', 'k'], ['j', 'k'], ['k', 'k', 'k'], ['j', 'j', 'j', 'k']]
function autoString() {
  if (P.act && P.act.t < P.act.m.cancel * 0.7) return
  if (!AUTO.seq || AUTO.si >= AUTO.seq.length) { if (P.act) return; AUTO.seq = AUTO_STRINGS[(Math.random() * AUTO_STRINGS.length) | 0]; AUTO.si = 0 }
  vtap(AUTO.seq[AUTO.si++])
}
function vkey(k) { keys.add(k); AUTO.held.add(k) }
function vtap(k) { if (!keys.has(k)) pressed.add(k); vkey(k) }
function selfTactic() {
  const t = tacticsNow()
  if (t.ult) return 'ult'
  if (t.punish) return 'punish'
  if (t.evade && P.hp < P.max * 0.5) return 'evade'
  if (t.reflect) return 'reflect'
  if (t.cast && Math.random() < 0.4) return 'cast'
  return 'pressure'
}

// ---------------------------------------------------------------- autopilot platforming
// Where a heroine can stand: floor runs (cut by pits and walls) and every walkable top. A route
// is a chain of them, each step a jump (one jump lifts ~195, a double ~355), a wall kick up a
// tall wall, a drop through a platform or a walk off its edge. Routes come from the stage's
// own platform data every frame, so broken columns and fallen crumble stones drop out.
const NAV = { JUMP: 185, DJUMP: 345, ban: new Map(), from: null, edge: null, prog: null, stuckN: 0, un: null, skip: null }
const navKey = s => Math.round(s.l) + ':' + Math.round(s.y)
function navSurfaces() {
  const lo = stage ? leftBound() : 30, hi = stage ? rightBound() : WORLD - 30, out = [], cuts = []
  for (const [a, b] of (typeof pits !== 'undefined' ? pits : [])) cuts.push([a, b])
  for (const p of plats) if (p.kind === 'wall' && !p.broken) cuts.push([p.l - 24, p.r + 24])
  cuts.sort((a, b) => a[0] - b[0])
  let x = lo
  for (const [a, b] of cuts) { if (b <= x) continue; if (a > x) out.push({ l: x, r: Math.min(a, hi), y: GROUND, floor: true }); x = Math.max(x, b) }
  if (x < hi) out.push({ l: x, r: hi, y: GROUND, floor: true })
  // tops, cut where a wall rises through them
  for (const p of plats) if (!p.broken && p.walk && p.r - p.l > 40 && !(p.kind === 'crumble' && p.fall > 0) && p.surf < GROUND - 20) {
    let segs = [[Math.max(lo, p.l + 10), Math.min(hi, p.r - 10)]]
    if (p.kind !== 'wall') for (const w of plats) if (w.kind === 'wall' && !w.broken && w.surf < p.surf - 6) segs = segs.flatMap(([a, b]) => b <= w.l - 24 || a >= w.r + 24 ? [[a, b]] : [[a, w.l - 24], [w.r + 24, b]])
    for (const [a, b] of segs) out.push({ l: a, r: b, y: p.surf, p, wall: p.kind === 'wall' })
  }
  return out.filter(s => s.r > s.l + 10)
}
// the surface under (x, y): the highest top at or below y
function navAt(S, x, y) {
  let best = -1
  for (let i = 0; i < S.length; i++) { const s = S[i]; if (x >= s.l - 14 && x <= s.r + 14 && s.y >= y - 10 && (best < 0 || s.y < S[best].y)) best = i }
  if (best >= 0) return best
  // off every top (against a wall, over a gap): the nearest one at or below
  let bd = Infinity
  for (let i = 0; i < S.length; i++) { const s = S[i], d = Math.max(0, s.l - x, x - s.r) + Math.abs(s.y - y) * 0.3; if (s.y >= y - 10 && d < bd) { bd = d; best = i } }
  return best
}
// a wall standing between two tops, taller than both, blocks the way across
function navWallBetween(A, B) {
  const a = B.l > A.r ? A.r : B.r, b = B.l > A.r ? B.l : A.l
  if (b <= a) return false
  for (const p of plats) if (p.kind === 'wall' && !p.broken && p !== B.p && p !== A.p && p.r + 24 > a && p.l - 24 < b && p.surf < Math.min(A.y, B.y) - 40) return true
  return false
}
function navCost(A, B) {
  if (NAV.ban.get(navKey(B)) > T) return Infinity
  const gap = Math.max(0, B.l - A.r, A.l - B.r), up = A.y - B.y
  if (navWallBetween(A, B)) return Infinity
  if (up > 8) {
    if (up > NAV.DJUMP) return B.wall && gap < 70 && up < 560 ? 3 + up / 300 : Infinity   // kick up the wall's face
    if (gap > (up <= NAV.JUMP ? 260 : 190)) return Infinity
    return 1 + up / 300 + gap / 300
  }
  if (up < -8) return gap > 320 ? Infinity : 0.6 + gap / 300 - up / 1500
  return gap > 280 ? Infinity : 1 + gap / 250
}
function navRoute(S, a, b) {
  const n = S.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false)
  dist[a] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || u === b) break
    done[u] = true
    for (let v = 0; v < n; v++) if (!done[v] && v !== u) { const c = navCost(S[u], S[v]); if (dist[u] + c < dist[v]) { dist[v] = dist[u] + c; prev[v] = u } }
  }
  if (dist[b] === Infinity) return null
  const path = [b]
  while (path[0] !== a) path.unshift(prev[path[0]])
  return path
}
// a foe's box, its middle, and whether it hangs in the air out of reach of a standing swing
function navFoe(e) {
  if (!e) return null
  const b = e.box ? e.box() : { x: e.x - 40, y: e.y - 120, w: 80, h: 120 }
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, bot = b.y + b.h
  return { e, b, cx, cy, bot, air: bot < groundAt(cx, b.y) - 110 }
}
// the top to fight from: the one a walker stands on, or for a flyer the top a little under it
function navGoal(S, f) {
  const at = navAt(S, f.cx, f.bot)
  if (!f.air) return at
  const fy = f.cy + 60   // feet here put the air swing across its middle
  let best = -1, bc = Infinity
  for (let i = 0; i < S.length; i++) {
    const s = S[i]
    if (s.r < f.cx - 150 || s.l > f.cx + 150) continue
    const h = s.y - fy
    if (h < -30 || h > NAV.DJUMP + 60) continue
    const c = Math.abs(h - 130) + Math.max(0, s.l - f.cx, f.cx - s.r) * 0.6
    if (c < bc) { bc = c; best = i }
  }
  return best >= 0 ? best : at
}
// walk, jump, double jump, kick or drop toward standing at x on top g; true once there
function navGo(S, g, gx) {
  const go = d => { if (Math.abs(d) > 10) vkey(d > 0 ? 'arrowright' : 'arrowleft') }
  if (!P.ground) {
    const E = NAV.edge
    if (!E) return false
    const over = P.x > E.l + 6 && P.x < E.r - 6
    go(E.lx - P.x)
    if (E.up) {
      if (P.vy < 0) vkey(' ')                                       // hold for full height
      if (P.y > E.y + 2 && P.vy > -160 && P.jumps > 0) vtap(' ')    // still under it near the top of the arc: jump again
      if (P.onWall && P.y > E.y) vtap(' ')                          // sliding down a wall: kick, swing back in, kick again
      // above it but off to the side: dash across; over a narrow top, float down onto it with an air swing
      if (AUTO.dashOn && P.y < E.y - 6 && !over && Math.abs(E.lx - P.x) > 150 && P.airDash > 0 && P.dashCD <= 0 && P.vy > -250) vtap('shift')
      if (P.hero === 'messenger' && E.wall && P.y < E.y - 2 && over && P.vy > 300 && !P.act) vtap('j')
    }
    return false
  }
  const here = navAt(S, P.x, P.y)
  NAV.edge = null
  if (here < 0 || g < 0) return false
  if (here === g || (S[here].y < S[g].y && S[g].y - S[here].y < 40 && P.x > S[g].l && P.x < S[g].r)) { go(clamp(gx, S[g].l + 20, S[g].r - 20) - P.x); return true }
  const path = navRoute(S, here, g)
  if (!path || path.length < 2) { go(gx - P.x); return false }
  const A = S[here], N = S[path[1]], last = path[1] === g
  const lx = clamp(last ? gx : clamp(P.x, N.l, N.r), N.l + 30, N.r - 30)
  const ddx = lx - P.x, up = A.y - N.y
  const atEdge = (ddx > 0 ? A.r - P.x : P.x - A.l) < 26
  NAV.step = navKey(N)
  if (up > 8) {
    const kick = up > NAV.DJUMP
    const wx = kick ? (N.l + N.r) / 2 : lx
    const reach = kick ? 70 : up <= NAV.JUMP ? 130 : 210
    const under = P.x > N.l - 10 && P.x < N.r + 10
    go(kick ? wx - P.x : ddx)
    if (Math.abs(kick ? wx - P.x : ddx) < reach || under || atEdge) { vtap(' '); vkey(' '); NAV.edge = { lx, y: N.y, l: N.l, r: N.r, up: true, kick, wx, wall: N.wall } }
  } else if (up < -8) {
    // down: walk off the edge onto the part that sticks out; drop through only when it lies wholly under,
    // and far enough under that the drop does not carry her past it
    const outL = N.l < A.l - 40, outR = N.r > A.r + 40
    if (outL || outR) {
      const ex = outR && (!outL || Math.abs(A.r - P.x) < Math.abs(A.l - P.x)) ? Math.min(N.r - 30, A.r + 50) : Math.max(N.l + 30, A.l - 50)
      go(ex - P.x); NAV.edge = { lx: ex, y: N.y, l: N.l, r: N.r, up: false }
    } else {
      if (!A.floor && !A.wall && P.x > N.l + 10 && P.x < N.r - 10) { vkey('arrowdown'); vtap(' ') }
      else go(ddx)
      NAV.edge = { lx, y: N.y, l: N.l, r: N.r, up: false }
    }
  } else {
    go(ddx)
    if (atEdge) { vtap(' '); vkey(' ') }
    NAV.edge = { lx, y: N.y, l: N.l, r: N.r, up: true }
  }
  return false
}
// no closer, no hits, hardly moved for a second: count it, close off the step being tried and
// shake loose (jump high, back off, dash, drop) before planning again
// a boss fight in reach is not 'stuck': dodging, a rest window or an untargetable phase all look like no progress
function navBusyBoss(d) {
  if (typeof B === 'undefined' || !B || B.dead) return false
  if (AUTO.tactic === 'evade' || AUTO.tactic === 'reflect' || B.untargetable || B.window > 0) return true
  return d < 420
}
function navStuck(d, hpSum) {
  const S = NAV.prog
  if (!S || hpSum < S.hp - 0.5 || d < S.d - 40 || Math.hypot(P.x - S.x, P.y - S.y) > 150 || P.chant || (typeof INTRO !== 'undefined' && INTRO) || navBusyBoss(d)) { NAV.prog = { t: T, d, x: P.x, y: P.y, hp: hpSum }; return }
  S.hp = Math.min(S.hp, hpSum)
  if (T - S.t < 1) return
  NAV.stuckN++; AUTO.stuck = NAV.stuckN
  if (NAV.step) NAV.ban.set(NAV.step, T + 4)
  NAV.un = { t: T, until: T + 0.8, how: NAV.stuckN % 4 }
  NAV.prog = null
}
function navUnstick(dx) {
  const go = d => vkey(d > 0 ? 'arrowright' : 'arrowleft')
  const u = NAV.un, k = T - u.t
  if (u.how === 0) { go(dx); if (P.ground) vtap(' '); else if (P.vy > -150 && P.jumps > 0) vtap(' '); if (P.vy < 0) vkey(' ') }
  else if (u.how === 1) { go(k < 0.45 ? -dx : dx); if (k > 0.45 && P.ground) vtap(' '); if (P.vy < 0) vkey(' ') }
  else if (u.how === 2) { go(dx); if (P.dashCD <= 0 && (P.ground || P.airDash > 0)) vtap('shift'); else if (P.ground) vtap(' ') }
  else { if (P.ground && P.onPlat) { vkey('arrowdown'); vtap(' ') } else { go(-dx); if (P.ground) vtap(' ') } }
  if (P.onWall) vtap(' ')
}
// Baker in the air: rise to it, face it, string air swings (they float her and keep it up)
function bakerAir(f, adx, side, canDash) {
  const go = d => vkey(d > 0 ? 'arrowright' : 'arrowleft')
  const top = P.y - 160, low = P.y + 10   // the air swing's reach, feet-relative
  const inY = f.b.y < low && f.bot > top, inX = adx < 200 + f.b.w / 2
  if (adx > 70 || P.face !== side) go(side)   // never step back: turning away aims the swing away
  if (P.vy < 0 && f.b.y + f.b.h < P.y - 60) vkey(' ')
  if (f.bot < top + 20 && P.vy > -200 && P.jumps > 0 && !(P.act && P.act.t < P.act.m.cancel)) { vtap(' '); return }
  if (!inY && f.bot < top && adx > 150 && adx < 420 && canDash && P.vy > -100 && P.jumps === 0) { vtap('shift'); go(side); return }
  if (inX && inY) { if (adx > 20) go(side); if (!P.act || P.act.t >= P.act.m.cancel * 0.7) vtap('j') }
  else if (inY && adx < 420 && canDash) { vtap('shift'); go(side) }
}
function autopilot() {
  for (const k of AUTO.held) if (!['j'].includes(k) || !AUTO.keepJ) keys.delete(k)
  AUTO.held.clear()
  if (!AUTO.on) return
  if (tap('p')) { AUTO.on = false; return }
  if (mode === 'title') { vtap('j'); return }
  if (mode !== 'play' || P.dead) return
  if (T - AUTO.at > 2.5 && T > AUTO.next) { AUTO.tactic = selfTactic(); AUTO.src = 'self'; AUTO.next = T + 0.9 }
  let tac = AUTO.tactic
  if (!tacticsNow()[tac]) tac = 'pressure'
  // the target: the boss when it is up, else the nearest foe (one that just stalled her is skipped a while)
  let tgt = (B && B.active) ? B : null
  if (!tgt) { let d = Infinity; for (const e of targets()) { if (NAV.skip && NAV.skip.e === e && NAV.skip.until > T) continue; const dd = (e.x - P.x) ** 2 + ((e.y - P.y) * 1.6) ** 2; if (dd < d) { d = dd; tgt = e } } }
  if (!tgt) tgt = nearestTarget(P.x, P.y)
  const F = navFoe(tgt)
  const tx = F ? F.cx : (cam.lock ? ARENA + ARW / 2 : P.x + 400), ty = F ? F.cy : P.y - 60
  const dx = tx - P.x, dy = ty - (P.y - 80)
  const go = d => vkey(d > 0 ? 'arrowright' : 'arrowleft')
  const canDash = P.dashCD <= 0 && (P.ground || P.airDash > 0)
  const S = navSurfaces()

  // no progress for a second: try another way
  if (F || !cam.lock) navStuck(Math.hypot(dx, dy), targets().reduce((a, e) => a + (e.hp || 0), 0)); else NAV.prog = null

  // the ground: jump pits, keep moving over a hole, kick off a wall she is sliding down
  const fwd = P.face
  if (P.ground && !inPit(P.x) && (inPit(P.x + fwd * 80) || inPit(P.x + fwd * 140))) { vtap(' '); vkey(fwd > 0 ? 'arrowright' : 'arrowleft') }
  if (!P.ground && inPit(P.x)) { go(fwd); if (P.jumps > 0 && P.vy > 120) vtap(' ') }
  if (P.onWall && !(NAV.edge && NAV.edge.up)) { vtap(' '); vkey(P.onWall < 0 ? 'arrowleft' : 'arrowright') }
  // black orbs: nothing stops them, so get over them or into the gap
  const dooms = bullets.filter(b => b.enemy && b.type === 'doom' && Math.abs(b.x - P.x) < 360 && (b.x - P.x) * b.vx < 0)
  if (dooms.length) {
    const near = dooms.reduce((a, b) => Math.abs(b.x - P.x) < Math.abs(a.x - P.x) ? b : a)
    const col = dooms.filter(b => Math.abs(b.x - near.x) < 30).map(b => b.y).sort((a, b) => b - a)
    let gap = null
    for (let i = 0; i < col.length - 1; i++) if (col[i] - col[i + 1] > 100) { gap = (col[i] + col[i + 1]) / 2; break }
    const tth = Math.abs(near.x - P.x) / Math.max(60, Math.abs(near.vx))
    const low = near.y > P.y - 110 && near.y > GROUND - 60
    if (gap !== null) { if (gap < P.y - 120 && tth < 0.6) { if (P.ground) vtap(' '); else if (P.vy > 0 && P.jumps > 0 && gap < P.y - 60) vtap(' '); vkey(' ') } }
    else if (low && tth < 0.38) { if (P.ground) vtap(' '); vkey(' ') }
    else if (!low && Math.abs(near.y - (P.y - 60)) < 80 && tth < 0.5) { go(P.x > near.x ? 1 : -1) }
  }
  // what attacks leave behind: step out of fire and live floor, out from under falling rock, jump the crack
  if (typeof HZ !== 'undefined') for (const h of HZ) {
    if (h.kind === 'debris' && !h.hit && Math.abs(P.x - h.x) < h.size + 60) { go(P.x > h.x ? 1 : -1); return }
    if (h.kind === 'crack' && h.t > h.tell - 0.15 && h.t < h.tell + 0.5 && P.ground && Math.abs(P.x - h.x) < h.len / 2 + 20) vtap(' ')
    if (P.ground && ((h.kind === 'fire' && P.x > h.l - 30 && P.x < h.r + 30) || (h.kind === 'shock' && Math.abs(P.x - h.x) < h.r + 30))) { go(P.x > (h.l + h.r) / 2 ? 1 : -1); return }
  }
  // the chase: run
  if (typeof chase !== 'undefined' && chase && !B?.active) { vkey('arrowright'); if (P.ground && Math.random() < 0.02) vtap(' '); if (Math.abs(dx) < 200 && tgt && tgt !== B) autoString(); return }
  // a titan: stand on the next seal and fight from there
  if (typeof TI !== 'undefined' && TI && !TI.down && !(B && B.active)) {
    const z = TI.s.seals.filter(z => !z.done).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x))[0]
    if (z) {
      const zy = z.surf || GROUND
      if (Math.abs(z.x - P.x) > 40) go(z.x - P.x)
      if (zy < P.y - 20 && P.ground && Math.abs(z.x - P.x) < 260) vtap(' ')
      if (tgt && Math.abs(dx) < 220) autoString()
      return
    }
  }

  // reflexes first
  for (const f of fx) {
    if (f.kind === 'glare' && !f.struck && f.dur - 0.35 - f.t < 0.1 && canDash) { vtap('shift'); vkey(dx > 0 ? 'arrowleft' : 'arrowright'); return }
    if (f.kind === 'sweep') { const toward = (P.x - f.x) * -f.side > 0; if (toward && Math.abs(P.x - f.x) < 210 && P.y > GROUND - 80) { if (P.ground) vtap(' '); else if (P.jumps > 0 && P.vy > 0) vtap(' '); vkey(' ') } }
    if (f.kind === 'laser' && f.t < 0.75 && Math.abs(P.x - f.x) < 70) { go(P.x > f.x ? 1 : -1); if (f.t > 0.55 && canDash) vtap('shift'); return }
  }
  const close = nearBullets(110)
  if (close.length >= 2 && canDash) { vtap('shift'); go(dx) }
  else if (close.length && P.ground && Math.random() < 0.15) vtap(' ')

  if (NAV.un && T < NAV.un.until) { if (NAV.un.how === 1 && tgt && tgt !== B) NAV.skip = { e: tgt, until: T + 2.5 }; navUnstick(dx || 1); return }
  if (tac === 'swap') { vtap('tab'); AUTO.tactic = 'pressure'; return }
  if (tac === 'ult') { if (targets().some(e => Math.abs(e.x - P.x) < 640 && Math.abs(e.y - P.y) < 420)) { vtap('r'); return } tac = 'pressure' }
  if (tac === 'evade') {
    const n = nearBullets(260); const cx = n.reduce((a, b) => a + b.x, 0) / (n.length || 1)
    go(P.x > cx ? 1 : -1)
    if (P.ground && Math.random() < 0.1) vtap(' ')
    if (n.length > 4 && canDash) vtap('shift')
    return
  }
  if (P.hero === 'messenger') {
    if (tac === 'reflect') { const n = nearBullets(260); if (n.length) { P.face = Math.sign(n[0].x - P.x) || P.face; if (n.length > 3) { AUTO.seq = ['j', 'k']; AUTO.si = 0 } autoString() } return }
    if (!F) { navGo(S, navAt(S, clamp(tx, P.x - 600, P.x + 600), GROUND), tx); return }   // nothing in view: on to the next gate
    const side = Math.sign(F.cx - P.x) || P.face, adx = Math.abs(F.cx - P.x)
    // a shield turns slowly: dash or jump past it and hit its back
    const front = F.e.blockFront && F.e.air <= 0 && !(F.e.stun > 0) && (P.x - F.e.x) * F.e.face > 0
    if (front && adx < 320 && Math.abs(F.bot - P.y) < 90) {
      go(side)
      if (canDash && adx < 260) vtap('shift')
      else if (P.ground) { vtap(' '); vkey(' ') }
      else { if (P.vy < 0) vkey(' '); if (P.vy > -100 && P.jumps > 0) vtap(' ') }
      return
    }
    if (!P.ground) {
      // airborne: fight what is up here, or finish the jump the route started
      if (F.air || F.e.air > 0 || (adx < 260 && Math.abs(F.cy - (P.y - 80)) < 200)) { bakerAir(F, adx, side, canDash); if (P.vy < 0 && F.cy < P.y - 120) vkey(' '); return }
      navGo(S, -1, tx); return
    }
    // close enough to swing from where she stands?
    const reachUp = P.y - F.bot                              // >0: its feet are above hers
    const groundSwing = adx < 190 + F.b.w / 2 && F.bot > P.y - 150 && F.b.y < P.y - 10
    if (groundSwing && reachUp < 40) {
      if (adx > 120 || P.face !== side) go(side)
      if (tac === 'punish' && P.meter >= SPECIAL_COST && P.str?.length >= 2) vtap('l')
      else autoString()
      return
    }
    // above her and close: launcher (it jumps her up with it), or a jump into air swings
    if (adx < 230 && reachUp > -10 && F.b.y < P.y - 60 && P.y - F.bot < NAV.DJUMP + 150) {
      if (adx > 60) go(side)
      if (adx < 140 && F.b.y > P.y - 220 && !P.act) { vkey('arrowup'); vtap('j') }
      else if (!P.act || P.act.t >= P.act.m.cancel) { vtap(' '); vkey(' ') }
      return
    }
    // otherwise walk the route to the top it is on (or under it, for a flyer)
    const g = navGoal(S, F)
    const gx = F.cx - side * 90
    if (navGo(S, g, gx)) { if (adx > 120) go(side) }
    if (adx < 900 && Math.abs(dy) < 120 && Math.random() < 0.01) { AUTO.seq = ['j', 'j', 'k']; AUTO.si = 0; autoString() }
    return
  }
  // Oracle: keep her distance on a top she can shoot from, aim at the target, shoot, cast
  const want = 430
  if (!F) navGo(S, navAt(S, clamp(tx, P.x - 600, P.x + 600), GROUND), tx)   // nothing in view: walk on to the next gate
  else if (!P.ground) navGo(S, -1, tx)
  else {
    const here = navAt(S, P.x, P.y), H = S[here]
    const far = Math.abs(dx) > want + 120, near = Math.abs(dx) < want - 160
    const high = F.cy < P.y - 520                     // too steep to aim well: climb toward it
    if (far || high || !H) navGo(S, navGoal(S, F), F.cx - Math.sign(dx || 1) * want * (high ? 0.4 : 1))
    else if (near) {
      // back off, but never off the edge of her top into a pit or wall: hop over the foe instead
      const away = -Math.sign(dx || 1), room = away > 0 ? H.r - P.x : P.x - H.l
      if (room > 60) go(away); else if (P.ground && Math.random() < 0.05) { vtap(' '); vkey(' '); go(-away) }
    }
  }
  mouse.on = true; mouse.t = performance.now(); mouse.x = (tx - cam.x) * cam.z; mouse.y = (ty - cam.y) * cam.z
  vkey('j')
  if (tac === 'cast' || tac === 'punish') {
    const r = m => !(P.cds[m] > 0)
    if (r('wing') && nearBullets(260).length > 5) vtap('i')
    else if (typeof spellReady === 'function' && RUN.spells.length && spellReady(RUN.spells[RUN.spell]) && !P.chant && Math.random() < 0.05) vtap('l')
    else if (!P.act || P.act.t >= P.act.m.cancel) { if (!AUTO.seq || AUTO.si >= AUTO.seq.length) { AUTO.seq = r('comet') && (tac === 'punish' || targets().length >= 3) ? ['k', 'k'] : r('halo') ? ['j', 'j', 'k'] : ['k']; AUTO.si = 0 } autoString() }
  }
}

// ---------------------------------------------------------------- main loop
function update(rdt) {
  T += rdt
  voiceTick(rdt)
  shake = Math.max(0, shake - rdt * 40)
  flash = Math.max(0, flash - rdt * 2); dim = Math.max(0, dim - rdt)
  if (sub) { sub.t -= rdt; if (sub.t <= 0) sub = null }
  if (nsub) { nsub.t -= rdt; if (nsub.t <= 0) nsub = null }
  if (typeof INTRO !== 'undefined' && INTRO) { introTick(rdt); updateCamera(rdt); return }   // a boss intro holds the fight
  if (stopT > 0) { stopT -= rdt; return }
  let dt = rdt
  if (slowT > 0) { slowT -= rdt; dt *= 0.3 }
  comboT -= dt; if (comboT <= 0) combo = 0
  for (const t of timers) t.t -= dt
  const due = timers.filter(t => t.t <= 0); timers = timers.filter(t => t.t > 0)
  for (const t of due) t.fn()
  updatePlayer(dt)
  if (stage) updateStage(dt)
  if (typeof updateHazards === 'function') updateHazards(dt)
  if (typeof persTick === 'function') persTick(dt)
  updateEnemies(dt)
  if (B) updateBoss(dt)
  updateBullets(dt)
  updateWorld(dt)
  for (const f of fx) { f.t += dt; f.update && f.update(dt) }
  fx = fx.filter(f => f.t < f.dur)
  for (const p of parts) { p.t += dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.chunk) p.rot += p.vr * dt; if (p.smoke) { p.vx *= 0.96; p.vy *= 0.96 } }
  parts = parts.filter(p => p.t < p.life)
  if (parts.length > (PERF.low ? 160 : 420)) parts.splice(0, parts.length - (PERF.low ? 160 : 420))
  for (const c of callouts) c.t += dt
  callouts = callouts.filter(c => c.t < 1.1)
  if (fxk()?.update) try { FXK.update(dt) } catch (e) { console.warn('FXK', e) }
  updateCamera(rdt)
}

function drawBullet(b) {
  if (b.enemy) {
    const r = b.r
    if (b.type === 'doom') {   // drawn over normally, not added, so the black reads on any sky
      ctx.globalCompositeOperation = 'source-over'
      const a = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy)
      ctx.fillStyle = 'rgba(40,0,6,0.35)'; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(b.x - Math.cos(a) * i * r * 0.9 * Math.min(1, sp / 300), b.y - Math.sin(a) * i * r * 0.9 * Math.min(1, sp / 300), r * (1 - i * 0.2), 0, Math.PI * 2); ctx.fill() }
      ctx.fillStyle = `rgba(200,20,36,${0.55 + 0.3 * Math.sin(T * 20 + b.x)})`; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.45, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#12020a'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(255,90,90,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.05, 0, Math.PI * 2); ctx.stroke()
      if (b.roll) { ctx.strokeStyle = 'rgba(255,60,60,0.8)'; ctx.beginPath(); const sp_ = b.t * 12 * Math.sign(b.vx); ctx.moveTo(b.x + Math.cos(sp_) * r * 0.8, b.y + Math.sin(sp_) * r * 0.8); ctx.lineTo(b.x - Math.cos(sp_) * r * 0.8, b.y - Math.sin(sp_) * r * 0.8); ctx.stroke() }
      ctx.globalCompositeOperation = 'lighter'
      return
    }
    const col = b.type === 'heavy' ? '255,190,70' : b.cancelable ? '255,60,60' : '200,20,30'
    ctx.fillStyle = `rgba(${col},0.35)`; ctx.beginPath(); ctx.arc(b.x, b.y, r * 2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = `rgba(${col},0.9)`; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill()
    if (b.type === 'heavy') { ctx.strokeStyle = 'rgba(255,250,225,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.3, 0, Math.PI * 2); ctx.stroke() }
    ctx.fillStyle = 'rgba(255,235,230,1)'; ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.45, 0, Math.PI * 2); ctx.fill()
  } else if (b.feather) {
    const a = Math.atan2(b.vy, b.vx)
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a)
    ctx.fillStyle = 'rgba(255,220,180,0.35)'; ctx.fillRect(-34, -3, 34, 6)
    ctx.fillStyle = 'rgba(255,250,240,0.95)'; ctx.beginPath(); ctx.ellipse(0, 0, b.r * 1.5, b.r * 0.45, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255,200,110,0.45)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,250,230,1)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, Math.PI * 2); ctx.fill()
  }
}

function drawPart(p) {
  const k = p.t / p.life
  if (p.chunk) {
    const c = p.chunk
    ctx.save(); ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3; ctx.translate(p.x, p.y); ctx.rotate(p.rot)
    ctx.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, -c.sw * c.s / 2, -c.sh * c.s / 2, c.sw * c.s, c.sh * c.s); ctx.restore(); return
  }
  ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'
  if (p.streak) { ctx.strokeStyle = `rgba(${p.color},${1 - k})`; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); return }
  ctx.fillStyle = `rgba(${p.color},${(p.smoke ? 0.5 : 1) * (1 - k)})`
  ctx.beginPath()
  if (p.feather) ctx.ellipse(p.x, p.y, p.size * 2, p.size * 0.6, p.vx * 0.01, 0, Math.PI * 2)
  else ctx.arc(p.x, p.y, p.size * (p.smoke ? 1 + k : 1), 0, Math.PI * 2)
  ctx.fill()
}

function drawCallout(c) {
  const k = c.t / 1.1, a = k < 0.1 ? k / 0.1 : 1 - Math.max(0, k - 0.6) / 0.4
  ctx.save(); ctx.globalAlpha = a
  ctx.font = `800 ${c.big ? 52 : 34}px "Shippori Mincho", serif`; ctx.textAlign = 'center'
  const y = c.y - k * 30
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(60,10,10,0.85)'; ctx.strokeText(c.text, c.x, y)
  const g = ctx.createLinearGradient(0, y - 40, 0, y); g.addColorStop(0, '#fff6e6'); g.addColorStop(1, '#f2c070')
  ctx.fillStyle = g; ctx.fillText(c.text, c.x, y)
  ctx.restore()
}

function drawEnemy(e) {
  const sp = e.spawn > 0 ? 1 - e.spawn / 0.6 : 1
  ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = sp
  const dark = e.charred > 0
  const body = e.flash > 0 ? '#fff2e8' : dark ? '#2a1a16' : '#5a1218'
  if (e.type === 'drone') {
    ctx.rotate(Math.sin(e.t * 2) * 0.15)
    ctx.fillStyle = 'rgba(255,70,60,0.2)'; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = dark ? '#6a4a3a' : '#d9a85a'; ctx.lineWidth = 3; ctx.stroke()
    ctx.strokeStyle = 'rgba(217,168,90,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.25, e.r * 0.35, e.t, 0, Math.PI * 2); ctx.stroke()
  } else {
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-26, e.r); ctx.lineTo(-16, -e.r); ctx.lineTo(16, -e.r); ctx.lineTo(26, e.r); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = dark ? '#6a4a3a' : '#d9a85a'; ctx.lineWidth = 3; ctx.stroke()
    ctx.strokeStyle = 'rgba(217,168,90,0.7)'; ctx.beginPath(); ctx.arc(0, -8, 36, e.t * 2, e.t * 2 + 4); ctx.stroke()
  }
  // the eye: Teknium's red glare in every drone
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = 'rgba(255,40,40,0.9)'; ctx.beginPath(); ctx.arc(0, -4, 6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,90,80,0.5)'; ctx.fillRect(-18, -5, 36, 2)
  ctx.globalCompositeOperation = 'source-over'
  if (e.burn > 0) { ctx.fillStyle = 'rgba(255,120,40,0.25)'; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill() }
  if (e.shock > 0) { ctx.strokeStyle = 'rgba(255,250,200,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 6 + Math.sin(T * 50) * 3, 0, Math.PI * 2); ctx.stroke() }
  // health, only once hurt
  if (e.hp < e.max) { ctx.fillStyle = 'rgba(30,10,10,0.6)'; ctx.fillRect(-28, -e.r - 16, 56, 4); ctx.fillStyle = '#f2c070'; ctx.fillRect(-28, -e.r - 16, 56 * Math.max(0, e.hp / e.max), 4) }
  ctx.restore()
}

function drawHUD() {
  // the heroine: name, health, meter, skills
  const name = CFG.heroes[P.hero].name
  ctx.save()
  ctx.font = '700 18px Cinzel, serif'; ctx.fillStyle = '#fff1dc'; ctx.textAlign = 'left'; ctx.fillText(name, 32, 44)
  ctx.fillStyle = 'rgba(30,10,10,0.55)'; ctx.fillRect(32, 54, 260, 8)
  ctx.fillStyle = '#e84a3c'; ctx.fillRect(32, 54, 260 * P.hp / P.max, 8)
  ctx.fillStyle = 'rgba(30,10,10,0.55)'; ctx.fillRect(32, 66, 260, 4)
  ctx.fillStyle = P.meter >= 100 ? `rgba(255,236,190,${0.7 + 0.3 * Math.sin(T * 10)})` : '#e8b860'; ctx.fillRect(32, 66, 260 * P.meter / 100, 4)
  let x = 32
  ctx.font = '700 12px Cinzel, serif'; ctx.textAlign = 'center'
  for (const [k, mv] of Object.entries(SKILL_KEYS[P.hero])) {
    const cd = P.cds[mv] || 0, full = MOVES[P.hero][mv].cd || 1
    ctx.fillStyle = 'rgba(30,10,10,0.55)'; ctx.beginPath(); ctx.arc(x + 12, 92, 12, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = cd > 0 ? 'rgba(232,184,96,0.4)' : '#e8b860'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 12, 92, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / full)); ctx.stroke()
    ctx.fillStyle = cd > 0 ? 'rgba(255,241,220,0.4)' : '#fff1dc'; ctx.fillText(k.toUpperCase(), x + 12, 96)
    x += 32
  }
  { const ok = P.hero === 'runner' ? (typeof spellReady === 'function' && RUN.spells.length && spellReady(RUN.spells[RUN.spell])) : P.meter >= SPECIAL_COST
    ctx.fillStyle = 'rgba(30,10,10,0.55)'; ctx.beginPath(); ctx.arc(x + 12, 92, 12, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = ok ? '#e8b860' : 'rgba(232,184,96,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 12, 92, 12, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = ok ? '#fff1dc' : 'rgba(255,241,220,0.4)'; ctx.fillText('L', x + 12, 96) }
  if (AUTO.on) { ctx.textAlign = 'right'; ctx.font = '700 12px Cinzel, serif'; ctx.fillStyle = 'rgba(255,241,220,0.7)'; ctx.fillText((AUTO.src === 'jev' ? 'JEV · ' : 'AUTO · ') + AUTO.tactic.toUpperCase(), W - 32, 44) }
  if (combo > 2) {
    ctx.textAlign = 'right'; ctx.font = '800 44px "Shippori Mincho", serif'; ctx.fillStyle = '#fff1dc'
    ctx.fillText(combo, W - 40, 200); ctx.font = '700 14px Cinzel, serif'; ctx.fillStyle = '#e8b860'; ctx.fillText('HITS', W - 40, 220)
  }
  // the boss
  if (B && B.active) {
    ctx.textAlign = 'center'; ctx.font = '700 16px Cinzel, serif'; ctx.fillStyle = '#fff1dc'; ctx.fillText((B.f?.en || B.handle || 'TEKNIUM').toString().toUpperCase(), W / 2, 40)
    ctx.fillStyle = 'rgba(30,10,10,0.6)'; ctx.fillRect(W / 2 - 300, 50, 600, 6)
    ctx.fillStyle = B.window > 0 ? '#ffe2a8' : '#c8282e'; ctx.fillRect(W / 2 - 300, 50, 600 * Math.max(0, B.hp / B.max), 6)
  }
  if (sub) {
    const a = Math.min(1, sub.t * 2, (sub.max - sub.t) * 4)
    ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '600 26px "Shippori Mincho", serif'
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,5,5,0.8)'; ctx.strokeText(sub.text, W / 2, H - 50)
    ctx.fillStyle = '#fff1dc'; ctx.fillText(sub.text, W / 2, H - 50); ctx.globalAlpha = 1
  }
  if (nsub) {
    const a = Math.min(1, nsub.t * 3, (nsub.max - nsub.t) * 6), y = sub ? H - 88 : H - 46
    ctx.globalAlpha = a * 0.92; ctx.textAlign = 'center'; ctx.font = 'italic 500 17px "Shippori Mincho", serif'
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,5,5,0.7)'; ctx.strokeText(nsub.text, W / 2, y)
    ctx.fillStyle = '#f4e6d0'; ctx.fillText(nsub.text, W / 2, y); ctx.globalAlpha = 1
  }
  ctx.restore()
}

function drawOverlay() {
  if (dim > 0) { ctx.fillStyle = `rgba(20,5,8,${Math.min(0.45, dim * 0.4)})`; ctx.fillRect(0, 0, W, H) }
  if (flash > 0) { ctx.fillStyle = `rgba(${flashColor},${Math.min(0.6, flash)})`; ctx.fillRect(0, 0, W, H) }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(25,5,5,0.55)')
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
}

// ---------------------------------------------------------------- title, end screens
let titleT = 0
function drawTitle(dt) {
  titleT += dt
  drawWorld()
  ctx.fillStyle = 'rgba(20,6,6,0.55)'; ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff1dc'
  ctx.font = '700 64px Cinzel, serif'; ctx.fillText('ARES', W / 2, 110)
  ctx.font = '600 22px "Shippori Mincho", serif'; ctx.fillStyle = '#e8b860'; ctx.fillText('SKY TEMPLE', W / 2, 146)
  const opts = [['messenger', 'm-loading', W / 2 - 250], ['runner', 'o-loading', W / 2 + 250]]
  for (const [h, sheet, x] of opts) {
    const on = HEROES[sel] === h
    const n = A.sheets?.[h]?.[sheet]?.n || 6, f = Math.floor(titleT * 4.5 * n / 6) % n
    if (on) { const g = ctx.createRadialGradient(x, 470, 10, x, 470, 240); g.addColorStop(0, 'rgba(255,210,150,0.35)'); g.addColorStop(1, 'rgba(255,210,150,0)'); ctx.fillStyle = g; ctx.fillRect(x - 260, 220, 520, 440) }
    drawSprite(h, sheet, on ? f : 0, x, 600, h === 'runner' ? -1 : 1, on ? 1 : 0.45, 0.95)
    ctx.font = '700 22px Cinzel, serif'; ctx.fillStyle = on ? '#fff1dc' : 'rgba(255,241,220,0.4)'; ctx.fillText(CFG.heroes[h].name, x, 650)
  }
  ctx.font = '600 13px Cinzel, serif'; ctx.fillStyle = 'rgba(255,241,220,0.7)'
  ctx.fillText('←→ move   ↑↓ / mouse aim   SPACE jump   ↓SPACE drop   SHIFT dash   J light   K heavy   L special   ↑L petal dance   E moon flash   U sky tide   I guard   R ultimate   TAB swap', W / 2, H - 28)
  if (tap('arrowleft', 'a')) sel = 0
  if (tap('arrowright', 'd')) sel = 1
  if (tap('j', 'enter', ' ')) startGame()
}

function startGame() { startRun() }

function drawEnd(win) {
  drawWorld(); drawOverlay()
  ctx.fillStyle = 'rgba(20,6,6,0.5)'; ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff1dc'; ctx.font = '700 56px Cinzel, serif'
  ctx.fillText(win ? 'VICTORY' : 'FALLEN', W / 2, H / 2 - 10)
  ctx.font = '600 16px Cinzel, serif'; ctx.fillStyle = '#e8b860'; ctx.fillText('J', W / 2, H / 2 + 40)
  if (tap('j', 'enter')) mode = 'title'
}

let last = performance.now()
function frame(now) {
  perfTick(now - last)
  const dt = Math.min(0.033, (now - last) / 1000); last = now
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingQuality = 'high'
  autopilot()
  if (mode === 'loading') { ctx.fillStyle = '#1a0f0f'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#e8b860'; ctx.font = '600 18px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillText('ARES', W / 2, H / 2) }
  else if (mode === 'title') drawTitle(dt)
  else if (mode === 'play') { if (tap('p') && !AUTO.on) { AUTO.on = true; pressed.delete('p') } update(dt); drawWorld(); drawOverlay(); if (!(typeof INTRO !== 'undefined' && INTRO)) drawHUD(); if (typeof drawIntro === 'function') drawIntro() }
  else if (mode === 'boon') { drawBoon(dt) }
  if (fxk()?.drawScreen && (mode === 'play' || mode === 'boon')) try { ctx.setTransform(1, 0, 0, 1, 0, 0); FXK.drawScreen() } catch (e) { console.warn('FXK', e) }
  else if (mode === 'win' || mode === 'dead') drawEnd(mode === 'win')
  pressed.clear(); released.clear()
  requestAnimationFrame(frame)
}

// index.html calls ARES_BOOT() once every script has loaded
// both heroines stand about this tall in world px, whatever size their sheets were painted at
const HERO_PX = { messenger: 160, runner: 162 }
function fitScale() {
  for (const [h, idle] of [['messenger', 'm-idle'], ['runner', 'o-idle']]) { const s = A.sheets?.[h]?.[idle] || A.sheets?.[h]?.idle; if (s?.h) SCALE[h] = HERO_PX[h] / s.h }
}
function ARES_BOOT() {
  load().then(loadData).then(() => { fitScale(); buildLevel(); resetPlayer(); kit = KITS.temple; mode = 'title'; loadKit(STAGES?.[0]?.kit).then(k => { if (mode === 'title' && k) kit = k }).catch(() => {}); if (/[?&]stage=/.test(location.search) && AUTO.on) startGame() })
    .catch(e => { mode = 'error'; console.error(e); ctx.fillStyle = '#fff'; ctx.fillText(String(e), 40, 40) })
  requestAnimationFrame(frame)
}
// test hook: lets the browser test drive the game
window.ARES = { P, get B() { return B }, get enemies() { return enemies }, get bullets() { return bullets }, startGame, get mode() { return mode }, get stage() { return stage }, get stageIdx() { return stageIdx }, get cam() { return cam }, get RUN() { return RUN },
  goStage: i => startStage(i), goTo: x => { for (const s of stage.sections) if (s.to <= x) s.cleared = true; P.x = x; P.y = GROUND - 200 } }
