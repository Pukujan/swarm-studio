// ARES · Sky Temple: one fast side-scrolling level.
// Two heroines on one body (Tab swaps): the Messenger's sword reflects bullets, the
// Oracle shoots and casts spells that cancel bullets, shake the ground, break the
// temple and leave enemies burning, shocked or charred. Ends with Teknium.
// Everything is read from the game's own folders: data/heroes.json (names, moves,
// lines), assets/skins/<hero>/default (outfit pack), assets/level, assets/boss, voice.
'use strict'

const W = 1280, H = 720, GROUND = 640, WORLD = 3960, ARENA = WORLD - W
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
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('missing ' + src)); i.src = src })
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error('missing ' + u); return r.json() })
const HEROES = ['messenger', 'runner']
const SCALE = { messenger: 0.47, runner: 0.43 }
const A = { sheets: { messenger: {}, runner: {} }, level: {}, boss: {}, fx: {} }
let CFG, ANCH, BOSSMETA

async function load() {
  ;[CFG, ANCH, BOSSMETA] = await Promise.all([getJSON('../data/heroes.json'), getJSON('anchors.json'), getJSON('../assets/boss/boss.json')])
  const jobs = []
  for (const h of HEROES) for (const name of Object.keys(ANCH.sheets[h]))
    jobs.push(loadImg(`../assets/skins/${h}/default/${name}.webp`).then(i => { A.sheets[h][name] = { img: i, ...ANCH.sheets[h][name] } }))
  for (const k of Object.keys(ANCH.pieces)) jobs.push(loadImg(`../assets/level/${k}.webp`).then(i => { A.level[k] = i }))
  jobs.push(loadImg('../assets/level/sky.webp').then(i => { A.level.sky = i }))
  for (const k of Object.keys(BOSSMETA)) jobs.push(loadImg(`../assets/boss/${k}.webp`).then(i => { A.boss[k] = i }))
  for (const k of ['feather-1', 'feather-5']) jobs.push(loadImg(`../assets/fx/${k}.webp`).then(i => { A.fx[k] = i }))
  await Promise.all(jobs)
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
const voices = {}
let voiceBusy = 0
function say(hero, key, force = false) {
  if (!force && voiceBusy > 0) return
  const src = `../assets/voice/${hero}/${key}.mp3`
  const a = voices[src] || (voices[src] = new Audio(src))
  try { a.currentTime = 0; a.volume = 0.9; a.play().catch(() => { }) } catch { }
  voiceBusy = 1.3
}

// ---------------------------------------------------------------- world state
let mode = 'loading', sel = 0, T = 0
let shake = 0, stopT = 0, slowT = 0, flash = 0, flashColor = '255,240,210', dim = 0
const cam = { x: 0, y: 0, min: 0, max: 1300 - W + 200, lock: false }
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
    const h = handBase(); want = ang(h.x, h.y, mouse.x + cam.x, mouse.y + cam.y)
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
const moveName = (hero, k) => CFG.heroes[hero]?.moves?.[k]?.name || ''

function callout(text, x, y, big = false) { if (text) callouts.push({ text, x, y, t: 0, big }) }

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
    wave: { sheet: 'm-wave', dur: 0.46, cancel: 0.32, cd: 1.0, voice: 'wave', sfx: 'heavy', fire: 0.14 },
    counter: { sheet: 'm-counter', dur: 0.4, cancel: 0.4, cd: 0.8, guard: 0.3 },
    spin: { sheet: 'm-spin', dur: 0.72, cancel: 0.62, cd: 2.0, voice: 'spin', sfx: 'heavy', move: 0.7, hits: [{ t0: 0.05, t1: 0.68, x: -170, y: -190, w: 340, h: 200, dmg: 4, every: 0.08, kb: 60 }], spin: true },
  },
  runner: {
    feather: { sheet: 'o-cast', dur: 0.4, cancel: 0.3, cd: 0.7, voice: 'feather', fire: 0.12 },
    sunlance: { sheet: 'o-cast', dur: 1.05, cancel: 1.0, cd: 3.0, voice: 'sunlance', fire: 0.18, move: 0 },
    halo: { sheet: 'o-cast', dur: 0.45, cancel: 0.35, cd: 2.4, voice: 'halo', fire: 0.14 },
    comet: { sheet: 'o-cast', dur: 0.6, cancel: 0.5, cd: 6.0, voice: 'comet', fire: 0.2 },
    wing: { sheet: 'o-cast', dur: 0.35, cancel: 0.25, cd: 8.0, voice: 'wing', fire: 0.1 },
  },
}
const SKILL_KEYS = { messenger: { k: 'wave', l: 'counter', i: 'spin' }, runner: { k: 'feather', l: 'sunlance', i: 'halo', o: 'comet', u: 'wing' } }

function startMove(name) {
  const m = MOVES[P.hero][name]
  if (!m) return false
  if (m.cd) { if (P.cds[name] > 0) return false; P.cds[name] = m.cd }
  P.act = { name, m, t: 0, hitLog: new Map(), fired: false, arcDone: false }
  P.queue = false
  if (m.voice) say(P.hero, m.voice)
  if (m.sfx && !m.arc) SFX[m.sfx]()
  if (m.jump) { P.vy = m.jump; P.ground = false }
  if (m.step && P.ground) P.vx = P.face * m.step
  if (m.lunge) P.vx = P.face * m.lunge
  if (m.slam) { P.vy = 400 }
  if (m.guard) P.guard = m.guard
  const nm = moveName(P.hero, name === 'air2' ? 'air' : name === 'air1' ? 'air' : name === 'dashslash' ? 'dash' : name)
  if (nm && (m.voice || name === 'slash3' || m.cd)) callout(nm, P.x, P.y - 190, name === 'charge' || name === 'comet' || name === 'sunlance')
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
  P.dashT = 0.19; P.dashDir = dir; P.dashCD = 0.32; P.iframe = Math.max(P.iframe, 0.26); P.perfect = 0.14
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
  for (const k of ['coyote', 'buffer', 'dashCD', 'iframe', 'hurtT', 'shootCD', 'drop', 'shield', 'postDash', 'perfect', 'guard']) P[k] = Math.max(0, (P[k] || 0) - dt)
  for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt)
  P.animT += dt
  if (P.dead) { P.vy += 2600 * dt; P.y = Math.min(GROUND, P.y + P.vy * dt); return }

  if (P.hero === 'runner') updateAim(dt)
  if (tap('tab', 'q') && !P.cds.swap) swapHero()
  if (tap(' ')) P.buffer = 0.13
  const dirKey = (Rt ? 1 : 0) - (L ? 1 : 0)
  if (tap('shift', ';') && P.dashCD <= 0 && (P.ground || P.airDash > 0)) startDash(dirKey || (P.hero === 'runner' ? -P.face : P.face))

  // attacks and skills
  if (P.hurtT <= 0) {
    if (P.hero === 'messenger') {
      if (tap('j')) attackPressed()
      if (down('j') && !P.act) P.holdJ += dt
      if (released.has('j')) { if (P.holdJ > 0.42 && (!P.act || P.act.t > P.act.m.cancel)) startMove('charge'); P.holdJ = 0 }
      if (!down('j')) P.holdJ = 0
    } else {
      P.holdJ = 0
      if (down('j') && P.shootCD <= 0 && (!P.act || P.act.m.move !== 0)) { P.shootCD = 0.085; fireFeather() }
    }
    for (const [k, mv] of Object.entries(SKILL_KEYS[P.hero])) if (tap(k)) { if (!P.act || P.act.t >= P.act.m.cancel) startMove(mv) }
    if (tap('r') && P.meter >= 100) ultimate()
  }

  // current move
  const act = P.act
  if (act) {
    act.t += dt
    const m = act.m
    if (m.fire && !act.fired && act.t >= m.fire) { act.fired = true; castSpell(act.name) }
    if (m.arc && !act.arcDone && act.t >= m.arc.at) { act.arcDone = true; slashArc(m.arc); SFX[m.sfx || 'slash']() }
    if (m.spin && Math.random() < 0.5) spinFx()
    if (act.t >= m.cancel && P.queue && m.next) startMove(m.next)
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
    const sp = P.sprint && dirKey ? 650 : 440
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
  P.x = clamp(P.x, cam.lock ? ARENA + 30 : 30, Math.min(gate, WORLD - 30))
  P.wasGround = P.ground; P.ground = false; P.onPlat = false
  if (P.y >= GROUND) { P.y = GROUND; land() }
  else if (P.vy >= 0 && P.drop <= 0) {
    for (const p of plats) if (!p.broken && p.walk && P.x > p.l && P.x < p.r && prev <= p.surf + 2 && P.y >= p.surf) { P.y = p.surf; land(); P.onPlat = true; break }
  }
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
  callout(moveName('messenger', 'slam'), P.x, P.y - 200, true)
}

function ultimate() {
  P.meter = 0; P.iframe = 2.2; slowT = 0.6; dim = 1.4
  say(P.hero, 'ult', true)
  callout(moveName(P.hero, 'ult'), cam.x + W / 2, 220, true)
  flash = 0.5; flashColor = '255,245,225'
  if (P.hero === 'messenger') {
    for (let i = 0; i < 10; i++) later(0.12 + i * 0.09, () => {
      const x = cam.x + R(150, W - 150), y = R(180, 560)
      fx.push(bigSlash(x, y, R(0, Math.PI), R(260, 420)))
      SFX.slash(); shake = Math.max(shake, 8)
      for (const e of targets()) if (Math.abs(e.x - cam.x - W / 2) < W / 2 + 40) damage(e, 14, { x: e.x, y: e.y })
    })
  } else {
    fx.push(fxStrip('feather-5', P.x, P.y - 160, 1.2, 1.1))
    for (let i = 0; i < 70; i++) later(i * 0.025, () => {
      const x = cam.x + R(40, W - 40)
      bullets.push(pbullet(x, -20, Math.PI / 2 + R(-0.25, 0.25), R(900, 1300), { dmg: 5, feather: true, status: Math.random() < 0.5 ? 'shock' : 'burn', pierce: true }))
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
      const x = t ? t.x + R(-120, 120) : clamp(h0.x + dir * (160 + i * 110) + R(-40, 40), cam.x + 60, cam.x + W - 60)
      fx.push(comet(x))
    })
  } else if (name === 'wing') {
    P.shield = 3.6
    ring(P.x, P.y - 70, 120, '255,240,220')
  }
}

// ---------------------------------------------------------------- bullets
function ebullet(x, y, a, spd, o = {}) { return { x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: o.r || 9, enemy: true, dmg: o.dmg || 12, life: o.life || 7, t: 0, cancelable: o.cancelable !== false, reflectable: o.reflectable !== false, kind: o.kind || 'orb', accel: o.accel || 0 } }
function pbullet(x, y, a, spd, o = {}) { return { x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: o.big ? 12 : 8, enemy: false, dmg: o.dmg || 3, life: o.life || 1.2, t: 0, feather: o.feather, home: o.home || 0, status: o.status, pierce: o.pierce, cancels: o.cancels, reflected: o.reflected, hitSet: new Set() } }

function reflect(b) {
  if (!b.reflectable) return
  b.dead = true
  const t = nearestTarget(b.x, b.y)
  const a = t ? ang(b.x, b.y, t.x, t.y - 20) : (P.face > 0 ? 0 : Math.PI)
  bullets.push(pbullet(b.x, b.y, a, 1100, { dmg: t === B ? 5 : 10, reflected: true, life: 2, big: true }))
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
    if (b.t > b.life || b.x < cam.x - 200 || b.x > cam.x + W + 200 || b.y < -300 || b.y > H + 100) { b.dead = true; continue }
    if (b.enemy) {
      if (P.shield > 0 && (b.x - P.x) ** 2 + (b.y - P.y + 70) ** 2 < 125 ** 2 && cancel(b)) continue
      if (P.act && P.act.name === 'counter' && P.guard > 0 && circBox(b.x, b.y, b.r + 30, hb)) { counterHit(b); continue }
      if (circBox(b.x, b.y, b.r, hb)) {
        if (P.iframe > 0) { if (P.perfect > 0) perfectDodge(); continue }
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
  say('messenger', 'counter', true)
  callout(moveName('messenger', 'counter'), P.x, P.y - 200, true)
  const t = nearestTarget(P.x, P.y)
  if (t && Math.abs(t.x - P.x) < 700) {
    const from = P.x
    P.x = clamp(t.x - P.face * 90, cam.x + 40, cam.x + W - 40); P.face = Math.sign(t.x - P.x) || 1
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
  P.hp -= dmg; P.iframe = 1.0; P.hurtT = 0.32; P.act = null; P.dashT = 0
  P.vx = dir * 380; P.vy = -380; P.ground = false
  shake = Math.max(shake, 8); flash = 0.2; flashColor = '255,70,60'; SFX.hurt()
  combo = 0
  say(P.hero, 'bark-hurt')
  if (P.hp <= 0) { P.hp = 0; P.dead = true; later(1.6, () => { mode = 'dead' }) }
}

// ---------------------------------------------------------------- enemies
function targets() { const t = enemies.filter(e => !e.dead); if (B && !B.dead && B.active) t.push(B); return t }
function nearestTarget(x, y) { let best = null, d = Infinity; for (const e of targets()) { const dd = (e.x - x) ** 2 + (e.y - y) ** 2; if (dd < d) { d = dd; best = e } } return best }

function makeEnemy(type, x, y) {
  const e = {
    type, x, y, hx: x, hy: y, vx: 0, vy: 0, t: R(0, 3), fire: R(0.8, 1.8), hp: type === 'sentry' ? 60 : 32, max: 0, dead: false, flash: 0,
    burn: 0, shock: 0, charred: 0, charredHits: 0, stun: 0, air: 0, tick: 0, r: type === 'sentry' ? 40 : 32,
    box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 } },
  }
  e.max = e.hp
  enemies.push(e); return e
}

function spawnWave(n) {
  wave = n
  if (n === 1) {
    for (const [x, y] of [[700, 300], [980, 220], [1150, 320], [880, 470]]) makeEnemy('drone', x, y)
    gate = 1300
  } else if (n === 2) {
    for (const [x, y] of [[1700, 280], [2000, 200], [2350, 260], [1850, 520]]) makeEnemy('drone', x, y)
    makeEnemy('sentry', 1700, 460 - 40)
    makeEnemy('sentry', 2400, 430 - 40)
    gate = ARENA
  }
  for (const e of enemies) { e.spawn = 0.6; ring(e.x, e.y, 70, '255,120,100') }
}

function applyStatus(e, s) {
  if (s === 'burn') { e.burn = Math.max(e.burn, 4); if (e.burn > 0 && e.charredHits++ > 4) e.charred = 5 }
  if (s === 'shock') { e.shock = Math.max(e.shock, 2.2); e.stun = Math.max(e.stun, e === B ? 0.15 : 0.7) }
  if (s === 'char') e.charred = Math.max(e.charred, 6)
}

function damage(e, dmg, o = {}) {
  if (e.dead || (e === B && !B.active)) return
  let m = 1
  if (e.charred > 0) m *= 1.3
  if (e === B && B.window > 0) m *= 1.6
  if (e === B && B.guard) m *= 0.5
  const d = dmg * m
  e.hp -= d; e.flash = 0.08
  if (!o.small) SFX.hit()
  sparks(o.x ?? e.x, o.y ?? e.y, o.small ? 3 : 8, e.charred > 0 ? '255,170,110' : '255,235,190')
  if (o.status) applyStatus(e, o.status)
  if (e !== B) {
    if (o.kb) e.vx += o.kb
    if (o.launch) { e.vy = o.launch; e.air = 1.3 }
    if (o.juggle && e.air > 0) { e.vy = -260; e.air = Math.max(e.air, 0.6) }
    if (o.spike && e.air > 0) e.vy = 900
  }
  combo++; comboT = 1.6
  P.meter = Math.min(100, P.meter + d * 0.35)
  if (e.hp <= 0) kill(e)
}

function kill(e) {
  e.dead = true
  if (e === B) return bossDown()
  shake = Math.max(shake, 6); SFX.boom()
  for (let i = 0; i < 22; i++) parts.push({ x: e.x, y: e.y, vx: R(-420, 420), vy: R(-480, 200), life: R(0.4, 1.0), t: 0, size: R(3, 8), color: i % 3 ? '210,40,40' : '255,200,140', g: 900, add: i % 3 === 0 })
  ring(e.x, e.y, 120, '255,140,110')
  if (Math.random() < 0.5) say(P.hero, 'bark-kill')
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue
    e.t += dt; e.flash = Math.max(0, e.flash - dt)
    if (e.spawn > 0) { e.spawn -= dt; continue }
    statusTick(e, dt)
    if (e.dead) continue
    e.vx *= Math.pow(0.02, dt)
    if (e.air > 0) {
      e.air -= dt; e.vy += 1500 * dt
      e.x += e.vx * dt; e.y += e.vy * dt
      if (e.y > GROUND - e.r) { e.y = GROUND - e.r; e.vy = 0; if (e.air > 0.2) e.air = 0.2 }
      continue
    }
    if (e.stun > 0) { e.stun -= dt; e.x += e.vx * dt; continue }
    if (e.type === 'drone') {
      const tx = e.hx + Math.sin(e.t * 0.7) * 80, ty = e.hy + Math.sin(e.t * 1.3) * 34
      e.x += (tx - e.x) * Math.min(1, dt * 2) + e.vx * dt; e.y += (ty - e.y) * Math.min(1, dt * 2)
      e.fire -= dt
      if (e.fire <= 0 && Math.abs(e.x - P.x) < 900 && !P.dead) {
        e.fire = R(1.5, 2.3)
        const a = ang(e.x, e.y, P.x, P.y - 60)
        for (let i = -1; i <= 1; i++) bullets.push(ebullet(e.x, e.y, a + i * 0.2, 330))
      }
    } else {
      e.x += e.vx * dt
      e.fire -= dt
      if (e.fire <= 0 && Math.abs(e.x - P.x) < 900 && !P.dead) {
        e.fire = 2.6
        const off = R(0, 1)
        for (let i = 0; i < 14; i++) bullets.push(ebullet(e.x, e.y, (i + off) / 14 * Math.PI * 2, 230, { r: 8 }))
      }
    }
    // touching a drone hurts
    if (!P.dead && P.iframe <= 0 && circBox(e.x, e.y, e.r * 0.7, hurtbox())) hurtPlayer(10, Math.sign(P.x - e.x) || 1)
  }
  enemies = enemies.filter(e => !e.dead)
  if (wave === 1 && !enemies.length) { gate = 2680; later(0.2, () => { if (wave === 1) arrow() }); wave = 1.5 }
  if (wave === 1.5 && P.x > 1350) spawnWave(2)
  if (wave === 2 && !enemies.length) { gate = WORLD; wave = 2.5; arrow() }
  if (wave === 2.5 && P.x > ARENA + 260) startBoss()
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

// ---------------------------------------------------------------- the boss
const POSES = { enter: 'teknium-smug1-0', fan: 'teknium-smug1-2', ring: 'teknium-smug1-1', sweep: 'teknium-smug2-1', pillars: 'teknium-smug1-2', glare: 'teknium-smug1-0', spiral: 'teknium-smug2-2', rain: 'teknium-smug1-1', rest: 'teknium-smug2-0' }
const BOSS_LINES = {
  enter: '……来たか。退屈はさせないでくれよ。',
  phase: 'なるほど。少しは計算を外れてくれる。',
  glare: '見えているよ。すべて。',
  down: '……ふふ。今日は君の勝ちにしておこう。',
}

function startBoss() {
  wave = 3; cam.lock = true
  B = {
    x: ARENA + 980, y: GROUND - 150, tx: ARENA + 980, ty: GROUND - 150, hp: 3000, max: 3000, phase: 1, step: 0, active: false, dead: false,
    window: 0, pose: 'enter', flash: 0, burn: 0, shock: 0, charred: 0, stun: 0, tick: 0, charredHits: 0, r: 70, t: 0, glare: 0, face: -1,
    box() { const h = bossH(); return { x: this.x - 70, y: this.y - h * 0.92, w: 140, h: h * 0.9 } },
  }
  B.y = -500
  later(0.1, () => { B.ty = GROUND - 150 })
  later(1.4, () => { subtitle(BOSS_LINES.enter, 3); B.glare = 1; SFX.glare() })
  later(3.4, () => { B.active = true; bossNext() }, 'boss')
}
const bossH = () => (B && B.pose === 'rest' ? 300 : 380)

function bossNext() {
  if (!B || B.dead) return
  const list = B.phase === 1 ? ['fan', 'ring', 'sweep', 'pillars', 'glare'] : ['spiral', 'rain', 'sweep', 'glare', 'ring', 'pillars', 'fan']
  const name = list[B.step++ % list.length]
  B.pose = name
  const dur = PATTERNS[name]()
  later(dur, openWindow, 'boss')
}
function openWindow() {
  if (!B || B.dead) return
  B.pose = 'rest'; B.window = B.phase === 1 ? 2.4 : 1.7
  B.ty = GROUND - 60; B.tx = clamp(P.x + (P.x < ARENA + W / 2 ? 380 : -380), ARENA + 160, ARENA + W - 160)
  later(B.window, bossNext, 'boss')
}

const sp = (v) => v * (B && B.phase === 2 ? 1.25 : 1)
const PATTERNS = {
  fan() {
    B.tx = ARENA + W - 200; B.ty = GROUND - 170
    for (let v = 0; v < 6; v++) later(0.3 + v * 0.42, () => {
      const a = ang(B.x, B.y - 300, P.x, P.y - 60)
      for (let i = -3; i <= 3; i++) bullets.push(ebullet(B.x - 30, B.y - bossH() * 0.6, a + i * 0.13, sp(380)))
      SFX.shot()
    }, 'boss')
    return 3.1
  },
  ring() {
    B.tx = ARENA + W / 2; B.ty = GROUND - 230
    for (let v = 0; v < 5; v++) later(0.3 + v * 0.45, () => {
      const n = 22, off = v * 0.5
      for (let i = 0; i < n; i++) bullets.push(ebullet(B.x, B.y - bossH() * 0.55, off + i / n * Math.PI * 2, sp(v % 2 ? 210 : 260), { r: 10 }))
    }, 'boss')
    return 3.0
  },
  sweep() {
    // a wall along the floor: jump over it or stand on a platform
    B.tx = ARENA + W / 2; B.ty = GROUND - 250
    const go = (side, at) => {
      later(at, () => fx.push(sweepWarn(side)), 'boss')
      later(at + 0.75, () => fx.push(sweepWave(side)), 'boss')
    }
    go(-1, 0.3); go(1, 1.6)
    if (B.phase === 2) go(-1, 2.6)
    return B.phase === 2 ? 3.8 : 2.8
  },
  pillars() {
    B.tx = ARENA + W - 180; B.ty = GROUND - 140
    const n = B.phase === 2 ? 6 : 4
    for (let i = 0; i < n; i++) later(0.2 + i * 0.32, () => fx.push(laser(clamp(P.x + R(-40, 40), ARENA + 40, ARENA + W - 40))), 'boss')
    return 0.2 + n * 0.32 + 1.0
  },
  glare() {
    // the one you cannot outrun: dash through it (i-frames) or counter it
    B.tx = ARENA + W / 2; B.ty = GROUND - 200
    subtitle(BOSS_LINES.glare, 1.8)
    later(0.2, () => { B.glare = 2; SFX.glare(); dim = 1.8; fx.push(glareLock(1.15)) }, 'boss')
    return 2.4
  },
  spiral() {
    B.tx = ARENA + W / 2; B.ty = GROUND - 220
    let a = 0
    for (let i = 0; i < 50; i++) later(0.2 + i * 0.055, () => { a += 0.23; for (let k = 0; k < 3; k++) bullets.push(ebullet(B.x, B.y - bossH() * 0.55, a + k * Math.PI * 2 / 3, 250, { r: 8 })) }, 'boss')
    return 3.3
  },
  rain() {
    B.tx = ARENA + 200; B.ty = GROUND - 160
    for (let v = 0; v < 7; v++) later(0.2 + v * 0.35, () => {
      const gap = R(ARENA + 150, ARENA + W - 150)
      for (let x = ARENA + 20; x < ARENA + W; x += 64) if (Math.abs(x - gap) > 110) bullets.push(ebullet(x + R(-8, 8), -10, Math.PI / 2, 300, { r: 8, accel: 120 }))
    }, 'boss')
    return 3.0
  },
}

function updateBoss(dt) {
  if (!B) return
  B.t += dt; B.flash = Math.max(0, B.flash - dt); B.window = Math.max(0, B.window - dt); B.glare = Math.max(0, B.glare - dt)
  B.x = lerp(B.x, B.tx, Math.min(1, dt * 2.2)); B.y = lerp(B.y, B.ty + Math.sin(B.t * 1.6) * 10, Math.min(1, dt * 2.5))
  B.face = P.x < B.x ? -1 : 1
  if (B.dead) return
  if (B.active) statusTick(B, dt)
  if (B.active && B.phase === 1 && B.hp < B.max * 0.5) {
    B.phase = 2; timers = timers.filter(t => t.tag !== 'boss'); bullets.forEach(b => b.enemy && cancel(b))
    subtitle(BOSS_LINES.phase, 2.6); flash = 0.4; flashColor = '255,60,60'; shake = 14; B.glare = 2
    later(1.6, bossNext, 'boss')
  }
}

function bossDown() {
  B.dead = true; B.active = false
  timers = timers.filter(t => t.tag !== 'boss')
  for (const b of bullets) if (b.enemy) b.dead = true
  slowT = 1.6; flash = 0.8; flashColor = '255,250,240'; shake = 18
  subtitle(BOSS_LINES.down, 3.2)
  B.pose = 'rest'; B.ty = -600
  say(P.hero, 'bark-win', true)
  later(3.6, () => { mode = 'win' })
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
  const img = A.fx[name]; const n = 6, slot = img.width / n
  return { t: 0, dur, draw(k) { const f = Math.min(n - 1, k * n | 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3; ctx.drawImage(img, f * slot, 0, slot, img.height, x - slot * s / 2, y - img.height * s / 2, slot * s, img.height * s); ctx.globalAlpha = 1 } }
}

// Messenger's 天裂波: a crescent that travels, cuts and sends bullets back
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
function sweepWarn(side) {
  return { t: 0, dur: 0.75, draw(k) {
    ctx.globalCompositeOperation = 'lighter'
    const x0 = side < 0 ? ARENA : ARENA + W - 60
    ctx.fillStyle = `rgba(255,40,40,${0.25 + 0.35 * Math.abs(Math.sin(k * 20))})`
    ctx.fillRect(x0, GROUND - 74, 60, 74)
    ctx.fillStyle = `rgba(255,40,40,${0.12 * (1 - k)})`; ctx.fillRect(ARENA, GROUND - 4, W, 4)
  } }
}
function sweepWave(side) {
  SFX.heavy()
  return { kind: 'sweep', side, t: 0, dur: 1.6, x: side < 0 ? ARENA - 40 : ARENA + W + 40, update(dt) {
    this.x -= side * 1000 * dt
    const box = { x: this.x - 30, y: GROUND - 74, w: 60, h: 74 }
    if (!P.dead && boxHit(box, hurtbox())) { if (P.iframe > 0) { if (P.perfect > 0) perfectDodge() } else hurtPlayer(18, -side) }
  }, draw() {
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createLinearGradient(0, GROUND - 90, 0, GROUND); g.addColorStop(0, 'rgba(255,60,50,0)'); g.addColorStop(1, 'rgba(255,90,70,0.95)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(this.x - 40, GROUND); for (let i = 0; i <= 8; i++) ctx.lineTo(this.x - 40 + i * 10, GROUND - 74 - Math.sin(T * 30 + i) * 10); ctx.lineTo(this.x + 40, GROUND); ctx.fill()
    ctx.fillStyle = 'rgba(255,230,220,0.9)'; ctx.fillRect(this.x - 3, GROUND - 70, 6, 70)
  } }
}
// Teknium: a vertical beam on where you stand
function laser(x) {
  return { kind: 'laser', x, t: 0, dur: 1.05, update() {
    if (this.t > 0.7 && this.t < 0.95 && !P.dead && Math.abs(P.x - x) < 40) { if (P.iframe > 0) { if (P.perfect > 0) perfectDodge() } else hurtPlayer(16, Math.sign(P.x - x) || 1) }
    if (this.t > 0.7 && !this.boomed) { this.boomed = true; shake = Math.max(shake, 5); SFX.zap() }
  }, draw(k) {
    ctx.globalCompositeOperation = 'lighter'
    if (this.t < 0.7) { ctx.fillStyle = `rgba(255,50,50,${0.15 + 0.2 * Math.sin(this.t * 40)})`; ctx.fillRect(x - 2, 0, 4, GROUND); ctx.fillRect(x - 40, GROUND - 3, 80, 3) }
    else { const a = 1 - (this.t - 0.7) / 0.35; ctx.fillStyle = `rgba(255,70,60,${0.5 * a})`; ctx.fillRect(x - 44, 0, 88, GROUND); ctx.fillStyle = `rgba(255,235,225,${a})`; ctx.fillRect(x - 12, 0, 24, GROUND) }
  } }
}
// Teknium: the red glare. A ring closes on you; when it meets you, dash or counter.
function glareLock(dur) {
  return { kind: 'glare', t: 0, dur: dur + 0.35, struck: false, update() {
    if (this.t >= dur && !this.struck) {
      this.struck = true
      flash = 0.45; flashColor = '255,40,40'; shake = 16; SFX.boom()
      if (P.dead) return
      if (P.act && P.act.name === 'counter' && P.guard > 0) counterHit({ dead: false })
      else if (P.iframe > 0) perfectDodge()
      else hurtPlayer(28, -B.face)
    }
  }, draw(k) {
    const t = this.t
    if (t < dur) {
      const r = lerp(380, 46, t / dur)
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(255,40,40,${0.5 + 0.5 * t / dur})`; ctx.lineWidth = 3 + 6 * t / dur
      ctx.beginPath(); ctx.arc(P.x, P.y - 60, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,200,190,0.6)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(P.x, P.y - 60, 46, 0, Math.PI * 2); ctx.stroke()
    } else {
      const a = 1 - (t - dur) / 0.35
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(255,60,50,${0.5 * a})`
      ctx.save(); ctx.translate(P.x, P.y - 60); ctx.rotate(-0.5); ctx.fillRect(-W, -10 * a, W * 2, 20 * a); ctx.restore()
    }
  } }
}

function arrow() { fx.push({ t: 0, dur: 2.5, draw(k) { const x = cam.x + W - 80 + Math.sin(T * 8) * 10; ctx.fillStyle = `rgba(255,230,190,${Math.sin(k * Math.PI)})`; ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x + 30, 360); ctx.lineTo(x, 390); ctx.fill() }, screen: false }) }

let sub = null
function subtitle(text, t) { sub = { text, t, max: t } }

// ---------------------------------------------------------------- animation pick
function pickAnim() {
  const h = P.hero
  const S = A.sheets[h]
  const loop = (name, fps) => ({ sheet: name, frame: Math.floor(P.animT * fps) % (S[name]?.n || 6) })
  const over = (name, t, dur) => ({ sheet: name, frame: Math.min(5, Math.floor(t / Math.max(dur, 0.36) * 6)) })
  if (P.dead || P.hurtT > 0) return over(h === 'messenger' ? 'hurt' : 'o-hurt', 0.2, 0.4)
  if (P.act) {
    const m = P.act.m
    if (m.slam) return { sheet: 'airslam', frame: P.act.t < 0.15 ? Math.floor(P.act.t / 0.05) : 3 }
    if (m.spin) return loop('m-spin', 12)
    if (P.act.name === 'counter') return over('m-counter', P.act.t, m.dur)
    return over(m.sheet, P.act.t, m.sheet === 'o-cast' ? Math.max(m.dur, 0.6) : m.dur)
  }
  if (P.dashT > 0) return h === 'messenger' ? over(P.ground ? 'dash' : 'roll', 0.19 - P.dashT, 0.19) : over('o-dodge', 0.19 - P.dashT, 0.22)
  if (!P.ground) {
    if (h === 'messenger') { if (P.jumpAnim === 'djump') return over('djump', P.animT, 0.45); return { sheet: 'jump', frame: P.vy < -300 ? 1 : P.vy < 200 ? 2 : 4 } }
    return { sheet: 'o-jump', frame: P.vy < -300 ? 1 : P.vy < 200 ? 2 : 4 }
  }
  const moving = Math.abs(P.vx) > 60
  if (h === 'runner') {
    if (down('j')) return moving ? loop('o-run', 9) : loop('o-shoot', 8)
    if (moving) return loop('o-run', 9)
    return loop('o-idle', 4)
  }
  if (P.holdJ > 0.42) return { sheet: 'm-charge', frame: 0 }
  if (moving) return P.sprint ? loop('sprint', 11) : loop('run', 9.5)
  return loop('m-idle', 4)
}

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
  reflect: 'Messenger: swing or spin into the bullets to send them back at the boss.',
  cast: 'Oracle: cast the spell that fits (beam, feathers, halo, comets or wing shield).',
  swap: 'Switch to the other heroine.',
  ult: 'Use the ultimate now (meter is full).',
}
const GOAL = 'Clear the drones, then beat the boss Teknium without dying. Dash makes you invincible; the red glare can only be dashed or countered; jump over floor sweeps; hit hardest while the boss rests.'
const nearBullets = r => bullets.filter(b => b.enemy && (b.x - P.x) ** 2 + (b.y - P.y + 60) ** 2 < r * r)
function tacticsNow() {
  if (mode !== 'play' || P.dead) return {}
  const t = { pressure: TACTICS.pressure }
  if (B && B.active && B.window > 0) t.punish = TACTICS.punish
  if (nearBullets(220).length >= 3) t.evade = TACTICS.evade
  if (P.hero === 'messenger' && nearBullets(260).length >= 2) t.reflect = TACTICS.reflect
  if (P.hero === 'runner' && targets().length && Object.values(SKILL_KEYS.runner).some(m => !(P.cds[m] > 0))) t.cast = TACTICS.cast
  if (!(P.cds.swap > 0)) t.swap = TACTICS.swap
  if (P.meter >= 100) t.ult = TACTICS.ult
  return t
}
function playState() {
  const tg = targets()
  return {
    mode, t: +T.toFixed(1), goal: GOAL, hero: P.hero, hp: Math.round(P.hp), max: P.max, meter: Math.round(P.meter), ground: P.ground,
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
  const tgt = (B && B.active) ? B : nearestTarget(P.x, P.y)
  const tx = tgt ? tgt.x : (cam.lock ? ARENA + W / 2 : P.x + 400), ty = tgt ? (tgt === B ? B.y - bossH() * 0.5 : tgt.y) : P.y - 60
  const dx = tx - P.x, dy = ty - (P.y - 80)
  const go = d => vkey(d > 0 ? 'arrowright' : 'arrowleft')
  const canDash = P.dashCD <= 0 && (P.ground || P.airDash > 0)

  // reflexes first
  for (const f of fx) {
    if (f.kind === 'glare' && !f.struck && f.dur - 0.35 - f.t < 0.1 && canDash) { vtap('shift'); vkey(dx > 0 ? 'arrowleft' : 'arrowright'); return }
    if (f.kind === 'sweep') { const toward = (P.x - f.x) * -f.side > 0; if (toward && Math.abs(P.x - f.x) < 210 && P.y > GROUND - 80) { if (P.ground) vtap(' '); else if (P.jumps > 0 && P.vy > 0) vtap(' '); vkey(' ') } }
    if (f.kind === 'laser' && f.t < 0.75 && Math.abs(P.x - f.x) < 70) { go(P.x > f.x ? 1 : -1); if (f.t > 0.55 && canDash) vtap('shift'); return }
  }
  const close = nearBullets(110)
  if (close.length >= 2 && canDash) { vtap('shift'); go(dx) }
  else if (close.length && P.ground && Math.random() < 0.15) vtap(' ')

  if (tac === 'swap') { vtap('tab'); AUTO.tactic = 'pressure'; return }
  if (tac === 'ult') { vtap('r'); return }
  if (tac === 'evade') {
    const n = nearBullets(260); const cx = n.reduce((a, b) => a + b.x, 0) / (n.length || 1)
    go(P.x > cx ? 1 : -1)
    if (P.ground && Math.random() < 0.1) vtap(' ')
    if (n.length > 4 && canDash) vtap('shift')
    return
  }
  if (P.hero === 'messenger') {
    if (tac === 'reflect') { const n = nearBullets(260); if (n.length) { P.face = Math.sign(n[0].x - P.x) || P.face; if (!(P.cds.spin > 0) && n.length > 3) vtap('i'); else vtap('j') } return }
    // close in; jump to whatever floats above
    if (Math.abs(dx) > 120) go(dx)
    else if (Math.abs(dx) < 50) go(-dx)
    if (dy < -140 && P.ground) vtap(' ')
    else if (dy < -60 && !P.ground && P.vy > 0 && P.jumps > 0) vtap(' ')
    if (Math.abs(dx) < 220 && Math.abs(dy) < 160) {
      if (tac === 'punish' && !(P.cds.wave > 0)) vtap('k')
      else if (P.ground && dy < -80 && !P.act) { vkey('arrowup'); vtap('j') }
      else if (T * 7 % 1 < 0.5) vtap('j')
    } else if (Math.abs(dx) < 900 && Math.abs(dy) < 120 && !(P.cds.wave > 0) && Math.random() < 0.02) vtap('k')
    return
  }
  // Oracle: keep her distance, aim at the target, shoot, cast
  const want = 430
  if (!tgt) { go(1); if (P.ground && Math.random() < 0.03) vtap(' ') }   // nothing in view: walk on to the next gate
  else if (Math.abs(dx) > want + 120) go(dx)
  else if (Math.abs(dx) < want - 120) go(-dx)
  mouse.on = true; mouse.t = performance.now(); mouse.x = tx - cam.x; mouse.y = ty - cam.y
  vkey('j')
  if (tac === 'cast' || tac === 'punish') {
    const r = m => !(P.cds[m] > 0)
    const k = r('wing') && nearBullets(260).length > 5 ? 'u' : r('comet') && (tac === 'punish' || targets().length >= 3) ? 'o' : r('sunlance') ? 'l' : r('halo') ? 'i' : r('feather') ? 'k' : null
    if (k && (!P.act || P.act.t >= P.act.m.cancel)) vtap(k)
  }
  if (dy < -200 && P.ground && Math.random() < 0.05) vtap(' ')
}

// ---------------------------------------------------------------- main loop
function update(rdt) {
  T += rdt
  voiceBusy = Math.max(0, voiceBusy - rdt)
  shake = Math.max(0, shake - rdt * 40)
  flash = Math.max(0, flash - rdt * 2); dim = Math.max(0, dim - rdt)
  if (sub) { sub.t -= rdt; if (sub.t <= 0) sub = null }
  if (stopT > 0) { stopT -= rdt; return }
  let dt = rdt
  if (slowT > 0) { slowT -= rdt; dt *= 0.3 }
  comboT -= dt; if (comboT <= 0) combo = 0
  for (const t of timers) t.t -= dt
  const due = timers.filter(t => t.t <= 0); timers = timers.filter(t => t.t > 0)
  for (const t of due) t.fn()
  updatePlayer(dt)
  updateEnemies(dt)
  updateBoss(dt)
  updateBullets(dt)
  updateWorld(dt)
  for (const f of fx) { f.t += dt; f.update && f.update(dt) }
  fx = fx.filter(f => f.t < f.dur)
  for (const p of parts) { p.t += dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.chunk) p.rot += p.vr * dt; if (p.smoke) { p.vx *= 0.96; p.vy *= 0.96 } }
  parts = parts.filter(p => p.t < p.life)
  for (const c of callouts) c.t += dt
  callouts = callouts.filter(c => c.t < 1.1)
  // camera
  const tx = clamp(P.x - W * 0.42 + P.face * 70, 0, WORLD - W)
  cam.x = cam.lock ? lerp(cam.x, ARENA, Math.min(1, dt * 4)) : lerp(cam.x, Math.min(tx, Math.max(0, gate - W + 60)), Math.min(1, dt * 6))
  cam.y = lerp(cam.y, clamp((P.y - 420) * 0.25, -80, 0), Math.min(1, dt * 4))
}

function drawWorld() {
  const sx = shake ? R(-shake, shake) : 0, sy = shake ? R(-shake, shake) : 0
  // sky
  const sky = A.level.sky, ss = H / sky.height, sw = sky.width * ss
  const off = -(cam.x * 0.08) % sw
  for (let x = off; x < W; x += sw) ctx.drawImage(sky, x, 0, sw, H)
  // far islands
  ctx.save(); ctx.translate(-cam.x * 0.3 + sx * 0.3, -cam.y * 0.3)
  for (const [k, x, y, s] of ISLANDS) { const i = A.level[k]; ctx.globalAlpha = 0.85; ctx.drawImage(i, x, y + Math.sin(T * 0.6 + x) * 6, i.width * s, i.height * s) }
  ctx.globalAlpha = 1; ctx.restore()
  // warm haze
  const hz = ctx.createLinearGradient(0, 300, 0, H); hz.addColorStop(0, 'rgba(255,170,120,0)'); hz.addColorStop(1, 'rgba(120,40,40,0.35)'); ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H)

  ctx.save(); ctx.translate(-cam.x + sx, -cam.y + sy)
  // ground
  const g = A.level['ground-0'], gs = 0.6, gw = g.width * gs
  for (let x = Math.floor(cam.x / gw) * gw; x < cam.x + W + gw; x += gw) ctx.drawImage(g, x, GROUND - 8, gw, g.height * gs)
  // platforms
  for (const p of plats) {
    if (p.broken) continue
    ctx.globalAlpha = p.reform ? 1 - p.reform : 1
    const j = p.hit ? R(-3, 3) : 0
    ctx.drawImage(p.img, p.x + j, p.y, p.w, p.h)
    if (p.max && p.hp < p.max) { ctx.globalCompositeOperation = 'source-atop' }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    if (p.kind === 'brazier') for (let i = 0; i < 2; i++) parts.push({ x: p.x + p.w / 2 + R(-8, 8), y: p.y + 14, vx: R(-15, 15), vy: R(-140, -60), life: 0.4, t: 0, size: R(3, 7), color: '255,160,70', add: true })
  }
  // scorched marks: the temple goes black where it burned, then fades back
  for (const d of decals) {
    const a = Math.min(1, d.t / d.max * 1.5) * 0.75
    const gr = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); gr.addColorStop(0, `rgba(20,8,6,${a})`); gr.addColorStop(1, 'rgba(20,8,6,0)')
    ctx.fillStyle = gr; ctx.fillRect(d.x - d.r, d.y - d.r * 0.5, d.r * 2, d.r * 0.6)
  }
  for (const f of patches) if (f.kind === 'fire') { ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createLinearGradient(0, f.y - 50, 0, f.y); gr.addColorStop(0, 'rgba(255,120,40,0)'); gr.addColorStop(1, `rgba(255,140,50,${0.5 * Math.min(1, f.t)})`); ctx.fillStyle = gr; ctx.fillRect(f.l, f.y - 50, f.r - f.l, 50); ctx.globalCompositeOperation = 'source-over' }

  // boss
  if (B) drawBoss()
  // enemies
  for (const e of enemies) drawEnemy(e)
  // player shadow
  let gy = GROUND
  for (const p of plats) if (!p.broken && p.walk && P.x > p.l && P.x < p.r && p.surf >= P.y - 2 && p.surf < gy) gy = p.surf
  const hgt = Math.min(1, (gy - P.y) / 400)
  ctx.fillStyle = `rgba(30,10,10,${0.35 * (1 - hgt)})`; ctx.beginPath(); ctx.ellipse(P.x, gy - 2, 46 * (1 - hgt * 0.5), 10 * (1 - hgt * 0.5), 0, 0, Math.PI * 2); ctx.fill()
  // afterimages
  for (const t of P.trail) { const a = 0.35 * (1 - (T - t.t) / 0.3); ctx.globalCompositeOperation = 'lighter'; drawSprite(t.hero, t.sheet, t.frame, t.x, t.y, t.face, a * 0.6); ctx.globalCompositeOperation = 'source-over' }
  // player
  if (mode === 'play') {
    const a = pickAnim()
    const blink = P.iframe > 0 && P.hurtT <= 0 && P.dashT <= 0 ? (Math.sin(T * 40) > 0 ? 0.55 : 1) : 1
    if (P.holdJ > 0.42) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,210,140,${0.15 + 0.1 * Math.sin(T * 30)})`; ctx.beginPath(); ctx.arc(P.x, P.y - 70, 90, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over' }
    drawSprite(P.hero, a.sheet, a.frame, P.x, P.y, P.face, blink)
    if (P.hero === 'runner' && !P.dead) { const h = handPos(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,236,200,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x + Math.cos(P.aim) * 40, h.y + Math.sin(P.aim) * 40, 7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h.x + Math.cos(P.aim) * 16, h.y + Math.sin(P.aim) * 16); ctx.lineTo(h.x + Math.cos(P.aim) * 30, h.y + Math.sin(P.aim) * 30); ctx.stroke(); ctx.globalCompositeOperation = 'source-over' }
    if (P.shield > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,240,220,${0.35 + 0.2 * Math.sin(T * 10)})`; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const aa = T * 2 + i * Math.PI / 3; ctx.beginPath(); ctx.ellipse(P.x + Math.cos(aa) * 110, P.y - 70 + Math.sin(aa) * 60, 14, 6, aa, 0, Math.PI * 2); ctx.stroke() } ctx.globalCompositeOperation = 'source-over' }
    if (P.act && P.act.name === 'counter' && P.guard > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,240,210,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y - 70, 80, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over' }
  }
  // bullets
  ctx.globalCompositeOperation = 'lighter'
  for (const b of bullets) drawBullet(b)
  ctx.globalCompositeOperation = 'source-over'
  // effects and particles
  for (const f of fx) { ctx.save(); f.draw(f.t / f.dur); ctx.restore() }
  for (const p of parts) drawPart(p)
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
  for (const c of callouts) drawCallout(c)
  ctx.restore()

  // foreground vines and rocks
  ctx.save(); ctx.translate(-cam.x * 1.15 + sx, -cam.y)
  for (const [k, x, y, s] of FORE) { const i = A.level[k]; ctx.drawImage(i, x, y, i.width * s, i.height * s) }
  ctx.restore()
}

function drawBullet(b) {
  if (b.enemy) {
    const r = b.r
    const red = b.cancelable ? '255,60,60' : '200,20,30'
    ctx.fillStyle = `rgba(${red},0.35)`; ctx.beginPath(); ctx.arc(b.x, b.y, r * 2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = `rgba(${red},0.9)`; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill()
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

function drawBoss() {
  const key = POSES[B.pose] || POSES.rest, img = A.boss[key], meta = BOSSMETA[key]
  const h = bossH(), s = h / img.height, w = img.width * s
  const face = -B.face  // the paintings look a little to their left
  // shadow
  ctx.fillStyle = 'rgba(30,8,8,0.3)'; ctx.beginPath(); ctx.ellipse(B.x, GROUND - 2, 90, 14, 0, 0, Math.PI * 2); ctx.fill()
  ctx.save(); ctx.translate(B.x, B.y); ctx.scale(face < 0 ? -1 : 1, 1)
  if (B.window > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,220,150,${0.12 + 0.08 * Math.sin(T * 8)})`; ctx.beginPath(); ctx.ellipse(0, -h / 2, w * 0.7, h * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over' }
  if (B.charred > 0) ctx.filter = 'brightness(0.55) sepia(0.4)'
  ctx.drawImage(img, -w / 2, -h, w, h)
  ctx.filter = 'none'
  if (B.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(img, -w / 2, -h, w, h); ctx.globalAlpha = 1 }
  // the red glare: one eye, anime lens streak
  if (meta.eye) {
    const ex = -w / 2 + meta.eye[0] * w, ey = -h + Math.max(0.04, meta.eye[1]) * h
    const gl = 0.5 + 0.5 * Math.min(1, B.glare) + 0.15 * Math.sin(T * 6)
    ctx.globalCompositeOperation = 'lighter'
    const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, 26 + 20 * gl); gr.addColorStop(0, `rgba(255,70,60,${0.9 * gl})`); gr.addColorStop(1, 'rgba(255,30,30,0)')
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ex, ey, 26 + 20 * gl, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = `rgba(255,120,110,${0.7 * gl})`; ctx.fillRect(ex - 60 * gl - 10, ey - 1, 120 * gl + 20, 2)
    ctx.fillStyle = `rgba(255,240,235,${gl})`; ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill()
  }
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
  if (AUTO.on) { ctx.textAlign = 'right'; ctx.font = '700 12px Cinzel, serif'; ctx.fillStyle = 'rgba(255,241,220,0.7)'; ctx.fillText((AUTO.src === 'jev' ? 'JEV · ' : 'AUTO · ') + AUTO.tactic.toUpperCase(), W - 32, 44) }
  if (combo > 2) {
    ctx.textAlign = 'right'; ctx.font = '800 44px "Shippori Mincho", serif'; ctx.fillStyle = '#fff1dc'
    ctx.fillText(combo, W - 40, 200); ctx.font = '700 14px Cinzel, serif'; ctx.fillStyle = '#e8b860'; ctx.fillText('HITS', W - 40, 220)
  }
  // the boss
  if (B && B.active) {
    ctx.textAlign = 'center'; ctx.font = '700 16px Cinzel, serif'; ctx.fillStyle = '#fff1dc'; ctx.fillText('TEKNIUM', W / 2, 40)
    ctx.fillStyle = 'rgba(30,10,10,0.6)'; ctx.fillRect(W / 2 - 300, 50, 600, 6)
    ctx.fillStyle = B.window > 0 ? '#ffe2a8' : '#c8282e'; ctx.fillRect(W / 2 - 300, 50, 600 * Math.max(0, B.hp / B.max), 6)
  }
  if (sub) {
    const a = Math.min(1, sub.t * 2, (sub.max - sub.t) * 4)
    ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '600 26px "Shippori Mincho", serif'
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,5,5,0.8)'; ctx.strokeText(sub.text, W / 2, H - 50)
    ctx.fillStyle = '#fff1dc'; ctx.fillText(sub.text, W / 2, H - 50); ctx.globalAlpha = 1
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
  ctx.font = '600 22px "Shippori Mincho", serif'; ctx.fillStyle = '#e8b860'; ctx.fillText('天空神殿', W / 2, 146)
  const opts = [['messenger', 'm-loading', W / 2 - 250], ['runner', 'o-loading', W / 2 + 250]]
  for (const [h, sheet, x] of opts) {
    const on = HEROES[sel] === h
    const f = Math.floor(titleT * 4.5) % 6
    if (on) { const g = ctx.createRadialGradient(x, 470, 10, x, 470, 240); g.addColorStop(0, 'rgba(255,210,150,0.35)'); g.addColorStop(1, 'rgba(255,210,150,0)'); ctx.fillStyle = g; ctx.fillRect(x - 260, 220, 520, 440) }
    drawSprite(h, sheet, on ? f : 0, x, 600, h === 'runner' ? -1 : 1, on ? 1 : 0.45, 0.95)
    ctx.font = '700 22px Cinzel, serif'; ctx.fillStyle = on ? '#fff1dc' : 'rgba(255,241,220,0.4)'; ctx.fillText(CFG.heroes[h].name, x, 650)
  }
  ctx.font = '600 13px Cinzel, serif'; ctx.fillStyle = 'rgba(255,241,220,0.7)'
  ctx.fillText('←→ move   ↑↓ / mouse aim   SPACE jump   SHIFT dash   J attack   K L I O U skills   R ultimate   TAB swap', W / 2, H - 28)
  if (tap('arrowleft', 'a')) sel = 0
  if (tap('arrowright', 'd')) sel = 1
  if (tap('j', 'enter', ' ')) startGame()
}

function startGame() {
  mode = 'play'
  buildLevel(); enemies = []; bullets = []; fx = []; parts = []; decals = []; patches = []; timers = []; callouts = []
  B = null; combo = 0; cam.x = 0; cam.lock = false; gate = 1300
  resetPlayer()
  say(P.hero, 'bark-start', true)
  later(0.8, () => spawnWave(1))
}

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
  const dt = Math.min(0.033, (now - last) / 1000); last = now
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingQuality = 'high'
  autopilot()
  if (mode === 'loading') { ctx.fillStyle = '#1a0f0f'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#e8b860'; ctx.font = '600 18px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillText('ARES', W / 2, H / 2) }
  else if (mode === 'title') drawTitle(dt)
  else if (mode === 'play') { if (tap('p') && !AUTO.on) { AUTO.on = true; pressed.delete('p') } update(dt); drawWorld(); drawOverlay(); drawHUD() }
  else if (mode === 'win' || mode === 'dead') drawEnd(mode === 'win')
  pressed.clear(); released.clear()
  requestAnimationFrame(frame)
}

load().then(() => { buildLevel(); resetPlayer(); mode = 'title' }).catch(e => { mode = 'error'; console.error(e); ctx.fillStyle = '#fff'; ctx.fillText(String(e), 40, 40) })
requestAnimationFrame(frame)
// test hook: lets the browser test drive the game
window.ARES = { P, get B() { return B }, get enemies() { return enemies }, get bullets() { return bullets }, startGame, startBoss: () => { wave = 2.5; gate = WORLD; P.x = ARENA + 300; startBoss() }, get mode() { return mode } }
