// ARES bosses: one controller for every fight in data/fights.json.
// A boss stands on the stage (body "platform": runs, leaps between platforms, kicks off
// walls) or hovers (body "float"). Its modes switch by HP: it laughs, says the mode's
// line, the mode name flashes up and the arena can change look (dark, red_moon, storm).
// After each pattern it rests; hits land harder while it rests. A boss can also chase you
// through a chase section (fights[...].chase), where it cannot be hurt.
'use strict'

const BOSS_SHEETS = {   // what each pose is called in a boss's skin folder, best match first
  idle: ['idle'], run: ['run', 'idle'], jump: ['jump', 'idle'], wallkick: ['wallkick', 'jump', 'idle'],
  cast: ['conduct', 'cast', 'attack', 'idle'], attack: ['blade', 'attack', 'cast', 'idle'], dash: ['dash', 'run', 'attack', 'idle'],
  lance: ['lance', 'attack', 'cast', 'idle'], hurt: ['hurt', 'idle'], laugh: ['laugh', 'idle'], throne: ['throne', 'idle'],
}
const PATTERN_POSE = {
  fan: 'cast', ring: 'cast', spiral: 'cast', rain: 'cast', sweep: 'cast', pillars: 'cast', glare: 'laugh', volley: 'attack',
  spot_sweep: 'cast', rush: 'dash', slam: 'jump', blink: 'attack', clones: 'cast', summon: 'laugh', lances: 'lance',
  iaido: 'attack', bells: 'cast', freeze: 'cast', wallkick: 'wallkick',
}
const TEK_FALLBACK = {   // used when fights.json is missing
  body: 'platform', sprite: 'teknium', hp: 3000,
  modes: [
    { from: 1, name: '第一楽章', en: 'First Movement', line_en: '...So you came. Do not bore me.', patterns: ['fan', 'ring', 'sweep', 'pillars', 'glare'], rest: 2.2 },
    { from: 0.5, name: '終楽章', en: 'Finale', line_en: 'I see. You stray from my numbers a little.', patterns: ['spiral', 'lances', 'rush', 'glare', 'rain'], rest: 1.6, stage: 'red_moon' },
  ],
  chase: { patterns: ['lances', 'rush'] },
}
// the old painted Teknium poses, kept for when his sheets have not loaded
const POSES = { enter: 'teknium-smug1-0', cast: 'teknium-smug1-2', attack: 'teknium-smug2-1', laugh: 'teknium-smug1-0', idle: 'teknium-smug2-0' }

const bossPrefix = sprite => (sprite === 'teknium' ? 't-' : '')
const voiceOf = h => String(h || '').toLowerCase()
function bossSheet(anim) {
  if (!B) return null
  for (const n of BOSS_SHEETS[anim] || ['idle']) { const s = sheet(B.sprite, bossPrefix(B.sprite) + n); if (s) return s }
  return null
}
function preloadBoss(handle) {
  const f = FIGHTS[handle]; if (!f?.sprite) return
  const pre = bossPrefix(f.sprite)
  for (const list of Object.values(BOSS_SHEETS)) for (const n of list) sheet(f.sprite, pre + n)
}
const bsp = v => v * (1 + 0.12 * Math.max(0, B?.mode || 0))
function AR() {
  if (arena) return { l: arena.from, r: arena.to, w: arena.to - arena.from }
  return { l: cam.x, r: cam.x + VW(), w: VW() }
}
const bossHand = () => ({ x: B.x + B.face * 40, y: B.y - B.h * 0.62 })
const bossMid = () => ({ x: B.x, y: B.y - B.h * 0.55 })
// the attack effects in foe-fx.js (FOE), when loaded
function bfo(name, ...a) {
  try { if (typeof FOE !== 'undefined' && FOE[name]) return FOE[name](...a) } catch (err) { if (!bfo.w) { bfo.w = 1; console.warn('FOE', name, err) } }
}
function hitPlayer(dmg, dir) {
  if (P.dead) return false
  if (P.iframe > 0) { if (P.perfect > 0) perfectDodge(); return false }
  hurtPlayer(dmg, dir || 1); return true
}

// ---------------------------------------------------------------- start and end
function startBoss(handle, sec, o = {}) {
  const f = FIGHTS[handle] || (handle === 'Teknium' ? TEK_FALLBACK : { ...TEK_FALLBACK, sprite: voiceOf(handle) })
  preloadBoss(handle)
  const hp = Math.round((f.hp || 2000) * (1 + 0.15 * stageIdx))
  const ar = AR()
  B = {
    handle, name: handle.toUpperCase(), f, sprite: f.sprite || voiceOf(handle), float: f.body === 'float',
    x: ar.r + 160, y: GROUND - 420, vx: 0, vy: 0, hp, max: hp, mode: -1, step: 0, active: false, dead: false,
    window: 0, anim: 'jump', animT: 0, flash: 0, burn: 0, shock: 0, charred: 0, stun: 0, tick: 0, charredHits: 0,
    r: 60, t: 0, glare: 0, face: -1, alpha: 1, leap: null, run: null, chaser: !!o.chase, sec, until: o.until || 0,
    h: f.height || heroHeight(), hover: 0,   // bosses stand as tall as the heroines
    box() { return { x: this.x - 48, y: this.y - this.h * 0.9, w: 96, h: this.h * 0.88 } },
  }
  if (RUN.carry[handle] && !B.chaser) B.hp = Math.round(B.max * RUN.carry[handle])
  if (B.chaser) { B.x = cam.x - 200; B.y = GROUND; B.active = true; B.anim = 'run'; later(0.6, () => { say(voiceOf(handle), 'chase'); subtitle(f.modes?.find(m => m.patterns.every(p => (f.chase?.patterns || []).includes(p)))?.line_en || f.modes?.[0]?.line_en || '', 2.4) }); later(1.6, bossNext, 'boss'); return }
  bossLeap(ar.r - 260, GROUND, 0.9, 260)
  later(1.0, () => { const m = f.modes?.[modeFor(B.hp / B.max)]; if (!B.introDone) { subtitle((m?.line_en || ''), 3); say(voiceOf(handle), 'enter') } B.glare = 1; SFX.glare(); B.anim = 'laugh'; B.animT = 0 })
  later(2.8, () => { B.active = true; setMode(modeFor(B.hp / B.max), false); bossNext() }, 'boss')
}
function modeFor(frac) { let i = 0; (B?.f.modes || []).forEach((m, k) => { if (frac <= m.from + 1e-6) i = k }); return i }
function setMode(i, announce) {
  B.mode = i
  const m = B.f.modes[i]; if (!m) return
  if (m.stage) look = m.stage
  if (!announce) { if (m.name) nameSub(m.en || ''); return }   // the voice names the move; a small subtitle, no popup
  timers = timers.filter(t => t.tag !== 'boss')
  for (const b of bullets) if (b.enemy) cancel(b)
  fx = fx.filter(f => !f.boss)
  B.run = null; B.window = 0; B.anim = 'laugh'; B.animT = 0
  subtitle((m.line_en || ''), 2.6); say(voiceOf(B.handle), 'laugh', true)
  later(1.6, () => say(voiceOf(B.handle), 'phase', true))
  flash = 0.5; flashColor = '255,60,60'; shake = 14; B.glare = 2; slowT = 0.5
  later(1.9, bossNext, 'boss')
}
function bossNext() {
  if (!B || B.dead || !B.active) return
  const m = B.f.modes?.[Math.max(0, B.mode)] || {}
  const list = (B.chaser ? B.f.chase?.patterns : m.patterns) || ['fan']
  let name = list[B.step++ % list.length]
  if (!PATTERNS[name]) name = 'fan'
  B.pattern = name; B.anim = PATTERN_POSE[name] || 'cast'; B.animT = 0
  if (!B.chaser) bfo('tell', B.x + B.face * B.h * 0.035, B.y + (B.float ? -140 : 0) - B.h * 0.86, 0.35, 1.1, 'crimson')
  const dur = PATTERNS[name]()
  later(dur, openWindow, 'boss')
  if (typeof afterAttack === 'function' && !B.chaser) later(dur * 0.6, () => afterAttack('pattern', B?.x ?? P.x), 'boss')
}
function openWindow() {
  if (!B || B.dead) return
  const m = B.f.modes?.[Math.max(0, B.mode)] || {}
  B.pattern = 'rest'; B.anim = 'idle'
  B.window = B.chaser ? 1.0 : (m.rest || 2)
  if (!B.chaser && !B.float) { const ar = AR(); bossRunTo(clamp(P.x + (P.x < (ar.l + ar.r) / 2 ? 330 : -330), ar.l + 120, ar.r - 120)) }
  later(B.window, bossNext, 'boss')
}
// he leaves mid-fight; the stage carries his health to the next arena
function bossRetreat() {
  RUN.carry[B.handle] = B.hp / B.max
  timers = timers.filter(t => t.tag !== 'boss')
  for (const b of bullets) if (b.enemy) cancel(b)
  B.active = false; B.anim = 'laugh'
  const m = B.f.modes?.[modeFor(B.until - 0.01)]
  subtitle((m?.line_en || ''), 2.6); say(voiceOf(B.handle), 'chase', true)
  later(1.4, () => { if (!B) return; bossLeap(AR().r + 400, GROUND - 500, 0.9, 300) })
  later(2.4, () => { const s = B?.sec; B = null; sectionBeaten(s, false) })
}
function bossDown() {
  B.dead = true; B.active = false
  timers = timers.filter(t => t.tag !== 'boss')
  for (const b of bullets) if (b.enemy) b.dead = true
  slowT = 1.6; flash = 0.8; flashColor = '255,250,240'; shake = 18
  delete RUN.carry[B.handle]
  subtitle(B.f.downLine_en || (B.handle === 'Teknium' ? '...Heh. I will call today yours.' : ''), 3.2)
  say(voiceOf(B.handle), 'down', true)
  later(2.4, () => say(P.hero, 'bark-win', true))
  B.anim = 'hurt'
  const s = B.sec
  later(2.6, () => { B = null; sectionBeaten(s, true) })
}

// ---------------------------------------------------------------- pressure: the burst
// A boss counts the hits it took in the last 1.5 s. Combo-locked (9 hits, or 16 while it rests)
// and off cooldown, it bursts: a 0.4 s tell (gold armour flash, hits do half), then a radial
// shockwave that throws her away and clears her shots. A dash or a counter beats it.
const BURST = { hits: 11, restHits: 18, tell: 0.4, r: 300, every: 10 }
if (typeof damage === 'function') {
  const bossCoreDamage = damage
  window.damage = function (e, dmg, o = {}) {
    const r = bossCoreDamage(e, dmg, o)
    if (e && e === B && B.active && !B.dead && !B.chaser) bossPressure()
    return r
  }
}
function bossPressure() {
  const h = B.hits || (B.hits = [])
  h.push(T)
  while (h.length && T - h[0] > 1.5) h.shift()
  if (B.burst || B.leap || h.length < (B.window > 0 ? BURST.restHits : BURST.hits)) return
  if (T - (B.burstAt ?? -99) < BURST.every - 0.8 * Math.max(0, B.mode)) return
  B.burst = { t: 0, done: false }; B.burstAt = T; B.guard = true; B.hits = []
  bfo('tell', B.x + B.face * B.h * 0.035, B.y + (B.float ? -140 : 0) - B.h * 0.86, BURST.tell, 1.8, 'gold')
  SFX.glare()
}
function burstTick(dt) {
  const b = B.burst
  if (!b) return
  b.t += dt
  if (B.dead || !B.active) { B.burst = null; B.guard = false; return }
  if (!b.done && b.t >= BURST.tell) {
    b.done = true; B.guard = false
    const c = bossMid(), cy = c.y + (B.float ? -140 : 0)
    bfo('shock', c.x, cy, BURST.r, { ground: B.float ? null : B.y, dur: 0.5 })
    later(0.06, () => bfo('shock', c.x, cy, BURST.r * 0.7, { col: 'gold', dur: 0.4 }))
    shake = Math.max(shake, 12); flash = Math.max(flash, 0.22); flashColor = '255,200,120'; SFX.boom()
    for (const p of bullets) if (!p.enemy && !p.dead && (p.x - c.x) ** 2 + (p.y - cy) ** 2 < BURST.r * BURST.r) { p.dead = true; sparks(p.x, p.y, 3, '255,220,150') }
    if (!P.dead && circBox(c.x, cy, BURST.r, hurtbox())) {
      const dir = Math.sign(P.x - c.x) || 1
      if (P.act && P.act.name === 'counter' && P.guard > 0) counterHit({})
      else if (P.iframe > 0) { if (P.perfect > 0) perfectDodge() }
      else if (typeof enKnock === 'function') enKnock(c.x, cy, BURST.r, 0, 900)   // a push, not a hit: she loses her string, not HP
      else { hurtPlayer(6, dir); P.vx = dir * 900; P.vy = -480; P.ground = false; bfo('impact', P.x, P.y - 60, dir, 3) }
    }
  }
  if (b.t >= BURST.tell + 0.3) B.burst = null
}

// ---------------------------------------------------------------- moving
function bossRunTo(x) { B.run = { x }; B.leap = null }
function bossLeap(x, y, dur = 0.7, h = 220) { B.run = null; B.leap = { x0: B.x, y0: B.y, x1: x, y1: y, t: 0, dur, h }; B.anim = B.anim === 'wallkick' ? 'wallkick' : 'jump'; B.animT = 0 }
function bossSpot(kind) {
  const ar = AR(), inA = p => p.walk && !p.broken && p.l > ar.l + 40 && p.r < ar.r - 40
  if (kind === 'high') {
    const hs = plats.filter(p => inA(p) && p.surf < GROUND - 120 && p.kind !== 'crumble')
    if (hs.length) { const p = hs[(Math.random() * hs.length) | 0]; return { x: (p.l + p.r) / 2, y: p.surf } }
  }
  if (kind === 'far') { const x = P.x < (ar.l + ar.r) / 2 ? ar.r - 160 : ar.l + 160; return { x, y: GROUND } }
  return { x: clamp(P.x + R(-300, 300), ar.l + 120, ar.r - 120), y: GROUND }
}
function bossGo(kind, then) {
  if (B.float) { const s = bossSpot(kind); B.tx = s.x; B.ty = s.y - 140; return then && later(0.35, then, 'boss') }
  const s = bossSpot(kind)
  if (Math.abs(s.y - B.y) > 30 || Math.abs(s.x - B.x) > 500) bossLeap(s.x, s.y, 0.65, 200 + Math.max(0, B.y - s.y) * 0.5)
  else bossRunTo(s.x)
  if (then) later(0.7, then, 'boss')
}
function updateBoss(dt) {
  if (!B) return
  B.t += dt; B.animT += dt
  B.flash = Math.max(0, B.flash - dt); B.window = Math.max(0, B.window - dt); B.glare = Math.max(0, B.glare - dt)
  if (B.leap) {
    const L = B.leap; L.t += dt
    const k = Math.min(1, L.t / L.dur)
    B.x = lerp(L.x0, L.x1, k); B.y = lerp(L.y0, L.y1, k) - 4 * L.h * k * (1 - k)
    B.face = L.x1 > L.x0 ? 1 : -1
    if (k >= 1) { B.leap = null; B.y = L.y1; dust(B.x, B.y); shake = Math.max(shake, 4); if (B.anim === 'jump' || B.anim === 'wallkick') B.anim = 'idle' }
  } else if (B.float) {
    B.x = lerp(B.x, B.tx ?? B.x, Math.min(1, dt * 2.2)); B.y = lerp(B.y, (B.ty ?? GROUND - 140) + Math.sin(B.t * 1.6) * 10, Math.min(1, dt * 2.5))
  } else {
    if (B.run) {
      const d = B.run.x - B.x, sp = 560 * (B.chaser ? 1.1 : 1)
      if (Math.abs(d) < 12) { B.run = null; if (B.anim === 'run') B.anim = 'idle' }
      else { B.x += Math.sign(d) * Math.min(Math.abs(d), sp * dt); B.face = Math.sign(d); if (B.pattern === 'rest' || B.chaser) B.anim = 'run' }
    }
    // fall onto whatever is under him (bosses never fall into pits)
    let gy = GROUND
    for (const p of plats) if (!p.broken && p.walk && B.x > p.l && B.x < p.r && p.surf >= B.y - 4 && p.surf < gy) gy = p.surf
    if (B.y < gy - 1) { B.vy = Math.min(B.vy + 2600 * dt, 1600); B.y = Math.min(gy, B.y + B.vy * dt) } else { B.y = gy; B.vy = 0 }
  }
  if (!B.leap && !B.run && B.anim !== 'dash') B.face = P.x < B.x ? -1 : 1
  if (B.chaser) return updateChaser(dt)
  burstTick(dt)
  // resting: steam off the shoulders (the open window reads without text)
  if (B.window > 0 && !B.dead && Math.random() < (typeof PERF !== 'undefined' && PERF.low ? 0.06 : 0.2)) parts.push({ x: B.x + R(-30, 30), y: B.y + (B.float ? -140 : 0) - B.h * R(0.7, 0.85), vx: R(-25, 25), vy: R(-80, -40), life: R(0.6, 0.9), t: 0, size: R(5, 9), color: '205,185,175', smoke: true })
  if (B.dead) return
  if (B.active) {
    statusTick(B, dt)
    if (B.until && B.hp / B.max <= B.until) return bossRetreat()
    const k = modeFor(B.hp / B.max)
    if (k > B.mode) setMode(k, true)
  }
}
function updateChaser(dt) {
  if (!chase) { B.active = false; return }
  const want = Math.max(chase.x + 170, P.x - 460)
  if (!B.leap) {
    if (P.y < B.y - 180 && Math.random() < dt * 0.8) bossLeap(want, groundAtBoss(want), 0.6, 240)
    else if (Math.abs(want - B.x) > 30) { B.run = { x: want } }
  }
}
function groundAtBoss(x) { let gy = GROUND; for (const p of plats) if (!p.broken && p.walk && x > p.l && x < p.r && p.surf < gy && p.surf > P.y - 40) gy = p.surf; return gy }

// ---------------------------------------------------------------- patterns
// Each pattern starts its attacks with later(..., 'boss') and returns how long it lasts.
const tell = (x, y, w, h, dur, o = {}) => fx.push({ boss: true, t: 0, dur, draw(k) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,40,40,${(o.a || 0.22) + 0.25 * Math.abs(Math.sin(k * 18))})`; ctx.fillRect(x, y, w, h) } })
const PATTERNS = {
  // black orbs roll along the floor from the boss's side: jump them (later modes add a high one: stay low)
  boulders() {
    bossGo('near')
    const n = B.mode > 0 ? 4 : 3
    for (let v = 0; v < n; v++) later(0.6 + v * 0.75, () => {
      const dir = Math.sign(P.x - B.x) || 1, x = B.x + dir * 40
      bullets.push(ebullet(x, GROUND - 16, dir > 0 ? 0 : Math.PI, bsp(420), { type: 'doom', r: 16, roll: true, life: 5 }))
      if (B.mode > 1 && v % 2) bullets.push(ebullet(x, GROUND - 190, dir > 0 ? 0 : Math.PI, bsp(380), { type: 'doom', r: 13, life: 5 }))
      SFX.heavy(); dust(x, GROUND)
    }, 'boss')
    return 0.6 + n * 0.75 + 0.8
  },
  // gold stones fall on red marks under you: they can't be reflected; dash through or step aside
  gold_fall() {
    bossGo('high')
    const n = B.mode > 0 ? 9 : 6
    for (let i = 0; i < n; i++) later(0.3 + i * 0.28, () => {
      const x = clamp(P.x + R(-140, 140), AR().l + 40, AR().r - 40)
      tell(x - 26, cam.y, 52, GROUND - cam.y, 0.55, { a: 0.12 })
      later(0.55, () => bullets.push(ebullet(x, cam.y - 30, Math.PI / 2, bsp(620), { type: 'heavy', accel: 400 })), 'boss')
    }, 'boss')
    return 0.3 + n * 0.28 + 1.0
  },
  // a wall of black orbs with one gap: get to the gap
  doom_wall() {
    bossGo('far')
    const waves = B.mode > 0 ? 3 : 2
    for (let v = 0; v < waves; v++) later(0.5 + v * 1.3, () => {
      const dir = Math.sign(P.x - B.x) || 1, x = B.x + dir * 60
      const gap = [GROUND - 60, GROUND - 230, GROUND - 400][(Math.random() * 3) | 0]
      for (let y = GROUND - 20; y > GROUND - 520; y -= 42) if (Math.abs(y - gap) > 75) bullets.push(ebullet(x, y, dir > 0 ? 0 : Math.PI, bsp(300), { type: 'doom', r: 12, life: 6 }))
      SFX.glare()
    }, 'boss')
    return 0.5 + waves * 1.3 + 0.8
  },
  fan() {
    bossGo('high')
    for (let v = 0; v < 6; v++) later(0.5 + v * 0.42, () => {
      const h = bossHand(), a = ang(h.x, h.y, P.x, P.y - 60)
      for (let i = -3; i <= 3; i++) bullets.push(ebullet(h.x, h.y, a + i * 0.13, bsp(380)))
      bfo('muzzle', h.x, h.y, a, 'crimson', 2); SFX.shot()
    }, 'boss')
    return 3.2
  },
  ring() {
    bossGo('near')
    for (let v = 0; v < 5; v++) later(0.4 + v * 0.45, () => {
      const c = bossMid(), n = 22, off = v * 0.5
      for (let i = 0; i < n; i++) bullets.push(ebullet(c.x, c.y, off + i / n * Math.PI * 2, bsp(v % 2 ? 210 : 260), { r: 10, type: B.mode > 0 && i % 5 === 0 ? "heavy" : "orb" }))
    }, 'boss')
    return 3.0
  },
  spiral() {
    bossGo('high')
    let a = 0
    for (let i = 0; i < 50; i++) later(0.4 + i * 0.055, () => { const c = bossMid(); a += 0.23; for (let k = 0; k < 3; k++) bullets.push(ebullet(c.x, c.y, a + k * Math.PI * 2 / 3, bsp(250), { r: 8 })) }, 'boss')
    return 3.4
  },
  rain() {
    const ar = AR()
    for (let v = 0; v < 7; v++) later(0.3 + v * 0.35, () => {
      const gap = R(ar.l + 150, ar.r - 150), top = cam.y - 20
      for (let x = ar.l + 20; x < ar.r; x += 64) if (Math.abs(x - gap) > 110) bullets.push(ebullet(x + R(-8, 8), top, Math.PI / 2, bsp(300), { r: 8, accel: 120 }))
    }, 'boss')
    return 3.0
  },
  sweep() {
    bossGo('high')
    const go = (side, at) => { later(at, () => fx.push(sweepWarn(side)), 'boss'); later(at + 0.75, () => fx.push(sweepWave(side)), 'boss') }
    go(-1, 0.3); go(1, 1.6); if (B.mode > 0) go(-1, 2.6)
    return B.mode > 0 ? 3.8 : 2.8
  },
  pillars() {
    const ar = AR(), n = B.mode > 0 ? 6 : 4
    for (let i = 0; i < n; i++) later(0.2 + i * 0.32, () => fx.push(laser(clamp(P.x + R(-40, 40), ar.l + 40, ar.r - 40))), 'boss')
    return 0.2 + n * 0.32 + 1.0
  },
  glare() {
    later(0.2, () => { B.glare = 2; SFX.glare(); dim = 1.8; fx.push(glareLock(1.15)) }, 'boss')
    return 2.4
  },
  volley() {
    for (let v = 0; v < 3; v++) later(0.35 + v * 0.55, () => {
      const h = bossHand(), a = ang(h.x, h.y, P.x, P.y - 60)
      for (let i = 0; i < 5; i++) later(i * 0.06, () => bullets.push(ebullet(h.x, h.y, a + R(-0.05, 0.05), bsp(620), { r: 8 })), 'boss')
      bfo('muzzle', h.x, h.y, a, 'crimson', 1.6); SFX.shot()
    }, 'boss')
    return 2.2
  },
  spot_sweep() {
    // a beam from his hand turns across the arena: jump it, dash through it or hide behind height.
    // 0.7 s of charge (motes gather in his hand, the aim line brightens), then the sweep.
    const dir = P.x > B.x ? 1 : -1, a0 = dir > 0 ? -0.9 : Math.PI + 0.9, a1 = dir > 0 ? 0.5 : Math.PI - 0.5
    const angle = t => lerp(a0, a1, clamp((t - 0.7) / 1.9, 0, 1))
    const hit = (x0, y0, x1, y1) => {
      if (segDist(P.x, P.y - 60, x0, y0, x1, y1) < 40 && hitPlayer(14, dir)) bfo('impact', P.x, P.y - 60, dir, 3)
      for (const b of bullets) if (!b.enemy && segDist(b.x, b.y, x0, y0, x1, y1) < 24) b.dead = true
    }
    let beam = null
    fx.push({ boss: true, kind: 'beam', t: 0, dur: 2.6, update(dt) {
      if (!B) return
      const h = bossHand()
      if (this.t < 0.7) { bfo('gather', h.x, h.y, 1.4, 'crimson'); return }
      if (!beam) {
        SFX.zap(); shake = Math.max(shake, 8); flash = Math.max(flash, 0.12); flashColor = '255,120,80'
        beam = typeof FOE !== 'undefined' ? FOE.beamFx({ boss: true, len: 1800, dur: 1.9, w: 30, col: 'crimson', src: () => (B ? bossHand() : h), angle: t => angle(t + 0.7), hit }) : null
        if (beam) fx.push(beam)
      }
      if (!beam) { const a = angle(this.t); hit(h.x, h.y, h.x + Math.cos(a) * 1800, h.y + Math.sin(a) * 1800) }
      else if (Math.random() < dt * 20) shake = Math.max(shake, 2.5)
    }, draw(k) {
      if (!B) return
      const t = this.t, h = bossHand()
      if (t < 0.7) {
        if (typeof FOE !== 'undefined') { const c = FOE.clip(h.x, h.y, a0, 1800); FOE.charge(h.x, h.y, a0, c.len, t / 0.7, { w: 30 }) }
        else { ctx.translate(h.x, h.y); ctx.rotate(a0); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,50,50,${0.2 + 0.2 * Math.sin(t * 40)})`; ctx.fillRect(0, -2, 1800, 4) }
      } else if (!beam) {
        const a = angle(t); ctx.translate(h.x, h.y); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter'
        for (const [w, c] of [[60, '255,60,50,0.25'], [28, '255,120,100,0.6'], [10, '255,240,230,0.95']]) { ctx.fillStyle = `rgba(${c})`; ctx.fillRect(0, -w / 2, 1800, w) }
      }
    } })
    return 2.8
  },
  rush() {
    // the floor line flashes, then he crosses the arena at full speed: jump over him
    const ar = AR(), from = B.x, to = from < (ar.l + ar.r) / 2 ? ar.r - 100 : ar.l + 100, y = groundAtBoss(B.x)
    if (B.chaser) { tell(Math.min(B.x, P.x + 300), GROUND - 120, Math.abs(P.x + 300 - B.x), 120, 0.6) }
    else tell(Math.min(from, to), y - 130, Math.abs(to - from), 130, 0.6)
    later(0.6, () => {
      B.anim = 'dash'; SFX.heavy()
      const end = B.chaser ? P.x + 520 : to, dir = Math.sign(end - B.x)
      fx.push({ boss: true, kind: 'rush', t: 0, dur: 2, hit: false, update(dt) {
        if (!B) return
        B.run = null; B.x += dir * 1500 * dt; B.face = dir
        if (Math.random() < 0.6) parts.push({ x: B.x - dir * 30, y: B.y - R(20, 160), vx: -dir * R(200, 500), vy: 0, life: 0.25, t: 0, size: 3, color: '255,80,70', add: true, streak: true })
        if (!this.hit && boxHit(B.box(), hurtbox()) && hitPlayer(18, dir)) this.hit = true
        if ((dir > 0 && B.x >= end) || (dir < 0 && B.x <= end)) { this.t = this.dur; B.anim = 'idle'; shake = Math.max(shake, 6); if (typeof afterAttack === 'function' && !B.chaser) afterAttack('rush', from, y, { to: B.x }) }
      }, draw() { } })
    }, 'boss')
    return 1.8
  },
  slam() {
    // he leaps onto your platform; the landing sends a shockwave along it
    let y = GROUND; for (const p of plats) if (!p.broken && p.walk && P.x > p.l && P.x < p.r && p.surf >= P.y - 2 && p.surf < y) y = p.surf
    const x = P.x
    fx.push({ boss: true, t: 0, dur: 0.85, draw(k) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,50,50,${0.4 + 0.5 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 120 * (1.2 - k * 0.4), 18, 0, 0, Math.PI * 2); ctx.stroke() } })
    bossLeap(x, y, 0.85, 360)
    later(0.86, () => {
      shake = 14; SFX.boom(); bfo('shock', x, y - 10, 280, { ground: y, flat: 0.32 }); bfo('scorch', x, y, 90)
      if (P.ground && Math.abs(P.y - y) < 6 && Math.abs(P.x - x) < 300) hitPlayer(20, Math.sign(P.x - x) || 1)
      for (let i = 0; i < 8; i++) bullets.push(ebullet(x, y - 20, Math.PI + i / 7 * Math.PI, bsp(300), { r: 8 }))
      for (const p of plats) if (p.hp && !p.broken && circBox(x, y, 200, p)) hurtPlat(p, 40)
      if (typeof afterAttack === 'function') afterAttack('slam', x, y)
    }, 'boss')
    return 1.7
  },
  blink() {
    // gone, then behind you with a slash
    for (let n = 0; n < (B.mode > 1 ? 3 : 2); n++) {
      const t0 = n * 1.1
      later(t0, () => { B.alpha = 0; burst(B.x, B.y - 120, 14, '255,60,60', 300); SFX.dodge() }, 'boss')
      later(t0 + 0.45, () => {
        B.x = clamp(P.x - P.face * 130, AR().l + 60, AR().r - 60); B.y = groundAtBoss(B.x); B.face = Math.sign(P.x - B.x) || 1; B.alpha = 1; B.anim = 'attack'; B.animT = 0
        ring(B.x, B.y - 120, 90, '255,60,60')
      }, 'boss')
      later(t0 + 0.8, () => {
        const box = { x: B.face > 0 ? B.x : B.x - 230, y: B.y - 200, w: 230, h: 190 }
        fx.push(bigSlash(B.x + B.face * 110, B.y - 110, B.face > 0 ? -0.4 : Math.PI + 0.4, 220))
        SFX.slash(); if (boxHit(box, hurtbox())) hitPlayer(16, B.face)
      }, 'boss')
    }
    return B.mode > 1 ? 3.6 : 2.5
  },
  clones() {
    // two copies fire with him; only the real one can be hurt
    const ar = AR(), spots = [ar.l + ar.w * 0.2, ar.l + ar.w * 0.8]
    for (const x of spots) {
      const c = { boss: true, t: 0, dur: 3.4, x, y: groundAtBoss(x), update() { }, draw(k) { const s = bossSheet('cast'); if (!s) return; ctx.globalAlpha = 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.2)); drawSheet(s, (this.t * 8 | 0) % s.n, this.x, this.y, P.x < this.x ? -1 : 1, B ? B.k : 0.5, 0.45) } }
      fx.push(c)
      for (let v = 0; v < 3; v++) later(0.6 + v * 0.8, () => { const a = ang(c.x, c.y - 160, P.x, P.y - 60); for (let i = -2; i <= 2; i++) bullets.push(ebullet(c.x, c.y - 160, a + i * 0.16, bsp(330))) }, 'boss')
    }
    for (let v = 0; v < 3; v++) later(0.6 + v * 0.8, () => { const h = bossHand(), a = ang(h.x, h.y, P.x, P.y - 60); for (let i = -2; i <= 2; i++) bullets.push(ebullet(h.x, h.y, a + i * 0.16, bsp(330))) }, 'boss')
    return 3.4
  },
  summon() {
    const types = summonTypes(), n = B.mode > 1 ? 3 : 2
    for (let i = 0; i < n; i++) later(0.4 + i * 0.3, () => { const x = clamp(B.x + R(-300, 300), AR().l + 80, AR().r - 80); spawnEnemy(types[i % types.length], x, GROUND - 260) }, 'boss')
    return 2.0
  },
  lances() {
    // spears burst up from the floor under you, one after another
    const n = B.mode > 2 ? 6 : 4
    for (let i = 0; i < n; i++) later(0.2 + i * 0.36, () => fx.push(lance(P.x + R(-20, 20))), 'boss')
    return 0.2 + n * 0.36 + 0.9
  },
  iaido() {
    // a low blade wave (jump) then a high one (stay low or dash)
    const dir = P.x > B.x ? 1 : -1
    later(0.5, () => fx.push(bladeWave(B.x, B.y - 40, dir)), 'boss')
    later(1.3, () => fx.push(bladeWave(B.x, B.y - 170, dir)), 'boss')
    if (B.mode > 1) later(2.0, () => fx.push(bladeWave(B.x, B.y - 40, dir)), 'boss')
    return B.mode > 1 ? 2.8 : 2.2
  },
  bells() {
    for (let i = 0; i < 3; i++) later(0.3 + i * 0.75, () => fx.push(bell(B.x, B.y - B.h * 0.5)), 'boss')
    return 3.2
  },
  freeze() {
    const x = P.x, y = P.y
    fx.push({ boss: true, kind: 'frost', t: 0, dur: 3.4, update() { if (this.t > 0.5 && Math.hypot(P.x - x, P.y - 60 - (y - 60)) < 240) P.slow = 0.2 }, draw(k) {
      ctx.globalCompositeOperation = 'lighter'
      const a = this.t < 0.5 ? this.t : Math.min(1, (this.dur - this.t) * 2)
      const g = ctx.createRadialGradient(x, y - 60, 10, x, y - 60, 240); g.addColorStop(0, `rgba(255,235,240,${0.25 * a})`); g.addColorStop(1, 'rgba(255,200,210,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 60, 240, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(255,220,230,${0.5 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 60, 240, 0, Math.PI * 2); ctx.stroke()
    } })
    for (let v = 0; v < 4; v++) later(0.8 + v * 0.5, () => { const h = bossHand(), a = ang(h.x, h.y, P.x, P.y - 60); for (let i = -1; i <= 1; i++) bullets.push(ebullet(h.x, h.y, a + i * 0.1, bsp(360))) }, 'boss')
    return 3.2
  },
  wallkick() {
    // run to the arena wall, kick off it and dive at you
    const ar = AR(), side = P.x > (ar.l + ar.r) / 2 ? -1 : 1, wx = side < 0 ? ar.l + 50 : ar.r - 50
    bossLeap(wx, GROUND - 300, 0.55, 120); B.anim = 'wallkick'
    later(0.6, () => { B.anim = 'wallkick'; B.face = -side; const tx = P.x, ty = groundAtBoss(P.x); fx.push({ boss: true, t: 0, dur: 0.35, draw(k) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,40,40,${0.6 * (1 - k) + 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(wx, GROUND - 420); ctx.lineTo(tx, ty); ctx.stroke() } }); later(0.35, () => { bossLeap(tx, ty, 0.35, 30); B.anim = 'wallkick' }, 'boss'); later(0.72, () => { shake = 12; SFX.boom(); ring(tx, ty - 10, 220, '255,80,60'); if (Math.abs(P.x - tx) < 160 && Math.abs(P.y - ty) < 120) hitPlayer(20, Math.sign(P.x - tx) || 1); for (let i = 0; i < 10; i++) bullets.push(ebullet(tx, ty - 20, Math.PI + i / 9 * Math.PI, bsp(280), { r: 8 })) }, 'boss') }, 'boss')
    return 1.9
  },
}
function summonTypes() {
  const seen = new Set()
  for (const s of stage?.sections || []) for (const w of s.waves || []) for (const e of w.enemies || []) if (ENEMIES[e.type]) seen.add(e.type)
  const list = [...seen]
  return list.length ? list : ['drone']
}

// ---------------------------------------------------------------- pattern effects
function sweepWarn(side) {
  const ar = AR()
  return { boss: true, t: 0, dur: 0.75, draw(k) {
    ctx.globalCompositeOperation = 'lighter'
    const x0 = side < 0 ? ar.l : ar.r - 60
    ctx.fillStyle = `rgba(255,40,40,${0.25 + 0.35 * Math.abs(Math.sin(k * 20))})`; ctx.fillRect(x0, GROUND - 74, 60, 74)
    ctx.fillStyle = `rgba(255,40,40,${0.12 * (1 - k)})`; ctx.fillRect(ar.l, GROUND - 4, ar.w, 4)
  } }
}
function sweepWave(side) {
  SFX.heavy()
  const ar = AR()
  return { boss: true, kind: 'sweep', side, t: 0, dur: ar.w / 1000 + 0.3, x: side < 0 ? ar.l - 40 : ar.r + 40, update(dt) {
    this.x -= side * 1000 * dt
    const box = { x: this.x - 30, y: GROUND - 74, w: 60, h: 74 }
    if (boxHit(box, hurtbox())) hitPlayer(18, -side)
  }, draw() {
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createLinearGradient(0, GROUND - 90, 0, GROUND); g.addColorStop(0, 'rgba(255,60,50,0)'); g.addColorStop(1, 'rgba(255,90,70,0.95)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(this.x - 40, GROUND); for (let i = 0; i <= 8; i++) ctx.lineTo(this.x - 40 + i * 10, GROUND - 74 - Math.sin(T * 30 + i) * 10); ctx.lineTo(this.x + 40, GROUND); ctx.fill()
    ctx.fillStyle = 'rgba(255,230,220,0.9)'; ctx.fillRect(this.x - 3, GROUND - 70, 6, 70)
  } }
}
function laser(x) {
  // a pillar of light from the sky: a thin line and a ring on the floor, then the beam lands
  const top = cam.y - 200
  return { boss: true, kind: 'laser', x, t: 0, dur: 1.3, update() {
    if (this.t > 0.7 && this.t < 0.95 && Math.abs(P.x - x) < 40 && hitPlayer(16, Math.sign(P.x - x) || 1)) bfo('impact', P.x, P.y - 60, Math.sign(P.x - x) || 1, 2)
    if (this.t < 0.7 && Math.random() < 0.5) bfo('gather', x, GROUND - 10, 0.9, 'crimson')
    if (this.t > 0.7 && !this.boomed) { this.boomed = true; shake = Math.max(shake, 6); SFX.zap(); bfo('scorch', x, GROUND, 56); bfo('shock', x, GROUND - 6, 70, { ground: GROUND, flat: 0.3, dur: 0.35 }) }
    if (this.t > 0.7 && this.t < 0.95) bfo('spatter', x, GROUND - 2, Math.PI / 2)
    if (this.t > 0.95 && !this.embered) { this.embered = true; bfo('embers', x, top + 200, x, GROUND, 12) }
  }, draw() {
    ctx.globalCompositeOperation = 'lighter'
    const has = typeof FOE !== 'undefined'
    if (this.t < 0.7) {
      const k = this.t / 0.7
      if (has) { FOE.charge(x, top, Math.PI / 2, GROUND - top, k, { w: 44 }); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,90,60,${0.3 + 0.5 * k})`; ctx.lineWidth = 2 + 2 * k; ctx.beginPath(); ctx.ellipse(x, GROUND - 2, 44 + 30 * (1 - k), 9, 0, 0, Math.PI * 2); ctx.stroke() }
      else { ctx.fillStyle = `rgba(255,50,50,${0.15 + 0.2 * Math.sin(this.t * 40)})`; ctx.fillRect(x - 2, top, 4, GROUND - top); ctx.fillRect(x - 40, GROUND - 3, 80, 3) }
    } else {
      const q = this.t < 0.95 ? 1 : Math.max(0, 1 - (this.t - 0.95) / 0.35)
      if (has) FOE.beam(x, top, x, GROUND, { w: 40 * (this.t < 0.95 ? 1 : 0.5 + 0.5 * q), k: this.t < 0.75 ? 0.5 + 10 * (this.t - 0.7) : q, end: true, seed: x })
      else { ctx.fillStyle = `rgba(255,70,60,${0.5 * q})`; ctx.fillRect(x - 44, top, 88, GROUND - top); ctx.fillStyle = `rgba(255,235,225,${q})`; ctx.fillRect(x - 12, top, 24, GROUND - top) }
    }
  } }
}
function glareLock(dur) {
  return { boss: true, kind: 'glare', t: 0, dur: dur + 0.35, struck: false, update() {
    if (this.t >= dur && !this.struck) {
      this.struck = true
      flash = 0.45; flashColor = '255,40,40'; shake = 16; SFX.boom()
      if (P.dead) return
      if (P.act && P.act.name === 'counter' && P.guard > 0) counterHit({ dead: false })
      else if (P.iframe > 0) perfectDodge()
      else hurtPlayer(28, -(B?.face || 1))
    }
  }, draw() {
    const t = this.t
    ctx.globalCompositeOperation = 'lighter'
    if (t < dur) {
      const r = lerp(380, 46, t / dur)
      ctx.strokeStyle = `rgba(255,40,40,${0.5 + 0.5 * t / dur})`; ctx.lineWidth = 3 + 6 * t / dur
      ctx.beginPath(); ctx.arc(P.x, P.y - 60, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,200,190,0.6)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(P.x, P.y - 60, 46, 0, Math.PI * 2); ctx.stroke()
    } else {
      const a = 1 - (t - dur) / 0.35
      if (typeof FOE !== 'undefined') { const c = Math.cos(-0.5) * W, s_ = Math.sin(-0.5) * W; FOE.beam(P.x - c, P.y - 60 - s_, P.x + c, P.y - 60 + s_, { w: 22, k: a, seed: 3 }) }
      else { ctx.fillStyle = `rgba(255,60,50,${0.5 * a})`; ctx.translate(P.x, P.y - 60); ctx.rotate(-0.5); ctx.fillRect(-W, -10 * a, W * 2, 20 * a) }
    }
  } }
}
function lance(x) {
  let y = GROUND; for (const p of plats) if (!p.broken && p.walk && x > p.l && x < p.r && p.surf >= P.y - 2 && p.surf < y) y = p.surf
  return { boss: true, kind: 'lance', x, t: 0, dur: 1.0, update() {
    if (this.t > 0.55 && this.t < 0.8 && Math.abs(P.x - x) < 34 && P.y > y - 230 && P.y <= y + 4) hitPlayer(15, Math.sign(P.x - x) || 1)
    if (this.t > 0.55 && !this.boomed) { this.boomed = true; SFX.heavy(); shake = Math.max(shake, 4); for (let i = 0; i < 8; i++) parts.push({ x: x + R(-20, 20), y, vx: R(-160, 160), vy: R(-420, -120), life: 0.5, t: 0, size: R(3, 6), color: '200,170,150', g: 1400 }) }
  }, draw() {
    ctx.globalCompositeOperation = 'lighter'
    if (this.t < 0.55) { ctx.fillStyle = `rgba(255,40,40,${0.3 + 0.3 * Math.sin(this.t * 40)})`; ctx.beginPath(); ctx.ellipse(x, y, 40, 8, 0, 0, Math.PI * 2); ctx.fill(); return }
    const k = Math.min(1, (this.t - 0.55) / 0.08), a = 1 - Math.max(0, this.t - 0.8) / 0.2, hgt = 230 * k
    ctx.fillStyle = `rgba(255,70,60,${0.45 * a})`; ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.lineTo(x, y - hgt - 30); ctx.lineTo(x + 26, y); ctx.fill()
    ctx.fillStyle = `rgba(255,240,230,${a})`; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x, y - hgt); ctx.lineTo(x + 8, y); ctx.fill()
  } }
}
function bladeWave(x0, y, dir) {
  SFX.slash()
  return { boss: true, kind: 'blade', y, dir, t: 0, dur: 1.6, x: x0, hit: false, update(dt) {
    this.x += dir * 1100 * dt
    if (!this.hit && Math.abs(this.x - P.x) < 40 && Math.abs((P.y - 60) - y) < 70) { if (hitPlayer(16, dir)) this.hit = true }
    for (const b of bullets) if (!b.enemy && Math.abs(b.x - this.x) < 40 && Math.abs(b.y - y) < 80) b.dead = true
  }, draw(k) {
    ctx.translate(this.x, y); ctx.scale(dir, 1); ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(255,${60 + i * 70},${60 + i * 70},${(1 - k) * (0.4 + i * 0.3)})`; ctx.lineWidth = 18 - i * 6; ctx.beginPath(); ctx.arc(-40, 0, 80, -1.0, 1.0); ctx.stroke() }
  } }
}
function bell(x, y) {
  SFX.glare()
  return { boss: true, kind: 'bell', x, y, t: 0, dur: 2.6, hit: false, update() {
    const r = this.t * 420, d = Math.hypot(P.x - x, P.y - 60 - y)
    if (!this.hit && Math.abs(d - r) < 22) { if (hitPlayer(14, Math.sign(P.x - x) || 1)) this.hit = true }
  }, draw(k) {
    const r = this.t * 420
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,70,60,${0.8 * (1 - k)})`; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = `rgba(255,230,220,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  } }
}

// ---------------------------------------------------------------- drawing
function drawBoss() {
  if (!B) return
  const s = bossSheet(B.anim)
  const base = bossSheet('idle')
  if (!s || !base) return drawBossFallback()
  B.k = B.h / base.h
  const n = s.n || 6
  const once = ['attack', 'cast', 'lance', 'hurt', 'laugh', 'dash', 'wallkick'].includes(B.anim)
  const fps = B.anim === 'run' ? 12 : B.anim === 'idle' ? 6 : 10
  let f = once ? Math.min(n - 1, (B.animT * fps) | 0) : ((B.animT * fps) | 0) % n
  if (B.anim === 'jump') f = B.leap ? Math.min(n - 1, 1 + ((B.leap.t / B.leap.dur) * (n - 2)) | 0) : n - 1
  if (B.anim === 'cast' && B.animT > 0.6) f = 2 + (((B.animT * 6) | 0) % 2)
  const hover = B.float ? -140 : 0
  // shadow
  ctx.fillStyle = 'rgba(30,8,8,0.3)'; ctx.beginPath(); ctx.ellipse(B.x, groundAtBoss(B.x) - 2, 70, 12, 0, 0, Math.PI * 2); ctx.fill()
  if (B.window > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,220,150,${0.12 + 0.08 * Math.sin(T * 8)})`; ctx.beginPath(); ctx.ellipse(B.x, B.y + hover - B.h / 2, B.h * 0.35, B.h * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over' }
  // a rest slump: he sags a little at the knees
  const sag = B.window > 0 && !B.float ? 0.965 : 1
  ctx.save(); if (sag < 1) { ctx.translate(B.x, B.y); ctx.scale(1, sag); ctx.translate(-B.x, -B.y) }
  // charred: set inside the save (set before it, the restore below put it back and it tinted the whole scene)
  if (B.charred > 0) ctx.filter = 'brightness(0.55) sepia(0.4)'
  drawSheet(s, f, B.x, B.y + hover, B.face, B.k, B.alpha)
  ctx.filter = 'none'
  if (B.flash > 0) { ctx.globalCompositeOperation = 'lighter'; drawSheet(s, f, B.x, B.y + hover, B.face, B.k, 0.35 * B.alpha); ctx.globalCompositeOperation = 'source-over' }
  if (B.burst && !B.burst.done) { ctx.globalCompositeOperation = 'lighter'; drawSheet(s, f, B.x, B.y + hover, B.face, B.k, (0.3 + 0.25 * Math.sin(T * 40)) * B.alpha); ctx.globalCompositeOperation = 'source-over' }
  ctx.restore()
  if (B.burst && !B.burst.done) bfo('rim', B.x, B.y + hover - B.h * 0.5, B.h * 0.36, B.h * 0.56, 1, 'gold')
  if (B.sprite === 'teknium' && B.alpha > 0.5) drawGlare(B.x + B.face * B.h * 0.035, B.y + hover - B.h * 0.86 * sag)
}
function drawGlare(ex, ey) {
  const gl = (0.5 + 0.5 * Math.min(1, B.glare) + 0.15 * Math.sin(T * 6)) * (B.window > 0 ? 0.4 + 0.1 * Math.sin(T * 13) : 1)
  ctx.globalCompositeOperation = 'lighter'
  const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, 18 + 16 * gl); gr.addColorStop(0, `rgba(255,70,60,${0.9 * gl})`); gr.addColorStop(1, 'rgba(255,30,30,0)')
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ex, ey, 18 + 16 * gl, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = `rgba(255,120,110,${0.7 * gl})`; ctx.fillRect(ex - 44 * gl - 8, ey - 1, 88 * gl + 16, 2)
  ctx.fillStyle = `rgba(255,240,235,${gl})`; ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}
// before a boss's sheets exist: Teknium's painted poses, or a dark silhouette for the rest
function drawBossFallback() {
  const key = POSES[B.anim] || POSES.idle, img = B.sprite === 'teknium' && A.boss[key], meta = img && BOSSMETA[key]
  ctx.save(); ctx.globalAlpha = B.alpha
  if (img) {
    const h = B.h * 1.25, s = h / img.height, w = img.width * s
    ctx.translate(B.x, B.y); ctx.scale(B.face > 0 ? 1 : -1, 1)
    if (B.charred > 0) ctx.filter = 'brightness(0.55) sepia(0.4)'
    ctx.drawImage(img, -w / 2, -h, w, h); ctx.filter = 'none'
    if (B.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(img, -w / 2, -h, w, h) }
    ctx.restore()
    if (meta?.eye) drawGlare(B.x + (B.face > 0 ? 1 : -1) * (-w / 2 + meta.eye[0] * w), B.y - h + Math.max(0.04, meta.eye[1]) * h)
    return
  }
  const h = B.h, y = B.y + (B.float ? -140 : 0)
  ctx.translate(B.x, y)
  ctx.fillStyle = B.flash > 0 ? '#fff0e6' : B.charred > 0 ? '#2a1814' : '#3a0d12'
  ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-34, -h * 0.7); ctx.arc(0, -h * 0.82, 26, Math.PI, 0); ctx.lineTo(34, -h * 0.7); ctx.lineTo(50, 0); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#d9a85a'; ctx.lineWidth = 3; ctx.stroke()
  ctx.restore()
  drawGlare(B.x + B.face * 8, y - h * 0.83)
}
