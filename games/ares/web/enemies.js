// ARES enemies: the behaviours behind data/enemies.json (CONTENT.md §3, ENGINE.md).
// Loaded after game.js as a classic script; uses the core's globals directly.
// Private helpers are prefixed `en` so nothing clashes with the core.
//
// Each base is { init(e), update(e, dt), draw(e) }; shield also has blocks(e, fromX).
// Ground bases (walker, shield, jumper, charger) keep e.y at the feet; floating ones
// (drone, sentry, caster) keep e.y at the centre.
//
// Every attack runs the same little state machine on e.st:
//   'idle' -> 'wind' (telegraph, `windup` s, no damage) -> 'strike' -> 'rec' -> 'idle'
// and waits `every` s between attacks (e.cd).

const EN_G = 2600            // gravity, same as the player
const EN_GOLD = '#d9a85a', EN_GOLD_DARK = '#6a4a3a'

// default numbers per attack kind; e.def.attack overrides any of them
const EN_KIND_DEF = {
  fan:    { range: 760, windup: 0.45, every: 2.0, count: 5, speed: 330, spread: 0.2 },
  aimed:  { range: 800, windup: 0.40, every: 1.9, count: 3, speed: 420 },
  ring:   { range: 700, windup: 0.60, every: 2.6, count: 14, speed: 230 },
  spiral: { range: 720, windup: 0.70, every: 3.4, count: 2, speed: 220, dur: 1.4 },
  melee:  { range: 90, windup: 0.45, every: 1.6, speed: 0 },
  bash:   { range: 170, windup: 0.55, every: 2.2, speed: 640 },
  slam:   { range: 520, windup: 0.50, every: 2.6, count: 2, speed: 380 },
  laser:  { range: 1100, windup: 0.80, every: 3.0, dur: 0.45 },
  summon: { range: 900, windup: 0.90, every: 6.0, count: 2, type: 'drone', max: 3 },
  rush:   { range: 620, windup: 0.70, every: 2.8, speed: 950 },
}
const EN_BASE_KIND = { drone: 'fan', sentry: 'ring', walker: 'melee', shield: 'bash', jumper: 'slam', caster: 'laser', charger: 'rush' }
// recovery after each attack: the enemy slumps, its eye dims and it takes more damage (EN_OPEN)
const EN_REC = { rush: 1.0, bash: 0.8, slam: 0.8, laser: 0.75, summon: 0.6, melee: 0.55, fan: 0.45, aimed: 0.45, ring: 0.6, spiral: 0.7 }
const EN_OPEN = 1.35
const EN_RANGED = new Set(['fan', 'aimed', 'ring', 'spiral', 'laser', 'summon'])
const EN_MELEE = new Set(['melee', 'bash', 'rush', 'slam'])
// how each base answers being hit without pause (see enRespond)
const EN_RESP = { walker: 'shove', shield: 'guard', jumper: 'leap', charger: 'counter', drone: 'shove', sentry: 'shove', caster: 'shove' }
const EN_SIZE = {
  drone: { r: 32 }, sentry: { r: 40 }, caster: { r: 34 },
  walker: { w: 50, h: 110 }, shield: { w: 60, h: 115 }, jumper: { w: 56, h: 84 }, charger: { w: 92, h: 82 },
}

// ---------------------------------------------------------------- small helpers
const enSfx = n => { try { if (typeof SFX === 'object' && SFX[n]) SFX[n]() } catch { } }
// the attack effects in foe-fx.js (FOE); the game runs without them
function fo(name, ...a) {
  try { if (typeof FOE !== 'undefined' && FOE[name]) return FOE[name](...a) } catch (err) { if (!fo.w) { fo.w = 1; console.warn('FOE', name, err) } }
}
const enLow = () => typeof PERF !== 'undefined' && PERF.low
const enElite = e => /_elite$/.test(e.type || '')
const enCY = e => e.flt ? e.y : e.y - e.h / 2
// where a beam leaves: the painted caster's casting hand, else the eye
function enGun(e) {
  const k = enK(e)
  if (e.base === 'caster' && enSheet(e, 'idle')) return { x: e.x + e.face * 36 * k, y: e.y - 92 * k }
  return { x: e.x, y: enEyeY(e) }
}
const enOpen = e => e.st === 'rec' || (e.resp && e.resp.ph === 'rec')
const enK = e => (e.def && e.def.scale || 0.4) / 0.4
const enFace = e => { if (!P.dead) e.face = Math.sign(P.x - e.x) || e.face || 1 }
const enDmg = (e, A) => A.dmg || (e.def && e.def.dmg) || 10
const enGround = (x, y) => (typeof groundAt === 'function' ? groundAt(x, y) : (y <= GROUND ? GROUND : Infinity))
const enPC = () => ({ x: P.x, y: P.y - 60 })            // the player's centre
const enEyeY = e => e.flt ? e.y - 4 * enK(e) : e.y - e.h * 0.8
const enBoxOf = (e, x0, x1, top, bot) => ({ x: Math.min(x0, x1), y: top, w: Math.abs(x1 - x0), h: bot - top })
const enView = (e, pad = 120) => {
  const vx = cam.x, vw = typeof VW === 'function' ? VW() : W
  return e.x > vx - pad && e.x < vx + vw + pad
}

function enAttacks(e) {
  const d = e.def || {}, raw = Array.isArray(d.attack) ? d.attack : [d.attack || { kind: EN_BASE_KIND[e.def.base || e.type] || 'fan' }]
  return raw.map(a => ({ ...(EN_KIND_DEF[a.kind] || EN_KIND_DEF.fan), ...a }))
}

// common set-up: sizes, a feet-based box for ground bases, the attack list
function enInit(e, base, floating) {
  e.def = e.def || {}
  const k = enK(e), s = EN_SIZE[base]
  e.base = base; e.flt = floating
  e.face = e.face || -1
  e.hx = e.x; e.hy = e.y
  e.mv = 0; e.vy = e.vy || 0; e.vx = e.vx || 0
  e.st = 'idle'; e.stT = 0
  e.atks = enAttacks(e); e.ai = 0; e.A = e.atks[0]
  // rush without its own speed runs at the type's speed (hound: speed 520)
  for (const a of e.atks) if (a.kind === 'rush' && !(e.def.attack && e.def.attack.speed) && e.def.speed) a.speed = Math.max(600, e.def.speed * 1.6)
  e.cd = R(0.6, 1.2) + (e.A.every || 2) * 0.3
  if (floating) {
    e.r = s.r * k
    e.box = function () { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 } }
  } else {
    e.w = s.w * k; e.h = s.h * k; e.r = e.h / 2   // core default box: x-r..x+r, y-2r..y
    e.box = function () { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h } }
    const g = enGround(e.x, e.y - 4)
    if (g < Infinity && Math.abs(g - e.y) < 60) e.y = g
    e.onGround = e.y === g
  }
  e.cy = floating ? e.y : e.y - e.h / 2
}

function enWants(e) {
  if (P.dead || e.cd > 0 || e.st !== 'idle' || (!e.flt && !e.onGround)) return false
  const A = e.A
  if (!(Math.abs(P.x - e.x) < A.range && Math.abs(P.y - 60 - (e.flt ? e.y : e.y - e.h / 2)) < Math.max(260, A.range * 0.6) && enView(e, 40))) return false
  // take turns: at most two shooters at once (one while a beam is up), at most two melee swings
  const ranged = EN_RANGED.has(A.kind), set = ranged ? EN_RANGED : EN_MELEE
  if (ranged || EN_MELEE.has(A.kind)) {
    let n = 0, beam = false
    for (const o of enemies) if (o !== e && !o.dead && o.A && (o.st === 'wind' || o.st === 'strike') && set.has(o.A.kind)) { n++; if (o.A.kind === 'laser') beam = true }
    if (n >= 2 || (ranged && n >= 1 && (beam || A.kind === 'laser'))) { e.cd = R(0.25, 0.6); return false }
  }
  return true
}

function enStart(e) {
  enFace(e)
  const pc = enPC()
  e.st = 'wind'; e.stT = 0; e.hitDone = false; e.fired = 0
  const g0 = e.A.kind === 'laser' ? enGun(e) : { x: e.x, y: enEyeY(e) }
  e.lock = { a: ang(g0.x, g0.y, pc.x, pc.y), x: P.x, y: P.y, dir: e.face }
  if (e.A.kind === 'slam') {
    // land where she stands, but never in a pit: pull the spot back toward itself
    let tx = clamp(P.x, e.x - e.A.range, e.x + e.A.range), gy = enGround(tx, P.y - 4)
    for (let i = 0; i < 6 && gy === Infinity; i++) { tx = lerp(tx, e.x, 0.35); gy = enGround(tx, Math.min(P.y, e.y) - 4) }
    if (gy === Infinity) { tx = e.x; gy = e.y }
    e.lock.x = tx; e.lock.gy = gy
  }
  if (e.A.kind === 'summon') e.lock.spots = Array.from({ length: e.A.count }, (_, i) => ({ x: e.x + (i - (e.A.count - 1) / 2) * 120, y: e.y - 40 }))
}

// a melee-type hit against the player, with counter / i-frame / perfect-dodge rules
function enHit(e, box, dmg, dir) {
  if (e.hitDone || P.dead || !boxHit(box, hurtbox())) return false
  e.hitDone = true
  if (P.act && P.act.name === 'counter' && P.guard > 0 && typeof counterHit === 'function') { counterHit({}); return true }
  if (P.iframe > 0) { if (P.perfect > 0) perfectDodge(); return true }
  hurtPlayer(dmg, dir)
  fo('impact', P.x, P.y - 60, dir, 2)
  return true
}

// a push that throws her back (shockwaves and counters); a dash or a counter still beats it
function enKnock(x, y, r, dmg, pow) {
  if (P.dead || !circBox(x, y, r, hurtbox())) return false
  if (P.act && P.act.name === 'counter' && P.guard > 0 && typeof counterHit === 'function') { counterHit({}); return true }
  if (P.iframe > 0) { if (P.perfect > 0) perfectDodge(); return true }
  const dir = Math.sign(P.x - x) || 1
  if (dmg > 0) hurtPlayer(dmg, dir)
  else { P.act = null; P.hurtT = Math.max(P.hurtT || 0, 0.22); P.iframe = Math.max(P.iframe, 0.5); combo = 0 }
  P.vx = dir * pow; P.vy = Math.min(P.vy || 0, -420); P.ground = false
  fo('impact', P.x, P.y - 60, dir, 2)
  shake = Math.max(shake, 7)
  return true
}

// ---------------------------------------------------------------- ground movement
// vertical physics for feet-based enemies: gravity, landing on walk lines, pits
function enPhys(e, dt) {
  const prev = e.y
  if (e.onGround) {
    const g = enGround(e.x, e.y - 2)
    if (g > e.y + 3) { e.onGround = false }       // walked off, or the platform broke
    else if (g < Infinity) e.y = g
  }
  if (!e.onGround) {
    e.vy = Math.min(e.vy + EN_G * dt, 1600)
    e.y += e.vy * dt
    if (e.vy >= 0) {
      const g = enGround(e.x, prev - 1)
      if (e.y >= g) { e.y = g; const hard = e.vy > 700; e.vy = 0; e.onGround = true; return hard ? 'land' : 'soft' }
    }
    if (e.y > H + 500) { e.dead = true; e.fell = true }   // fell into a pit
  }
  return null
}

// is there floor ahead in direction dir? (no pit, no drop off a ledge)
function enFloorAhead(e, dir) {
  const ax = e.x + dir * (e.w * 0.5 + 8)
  if (typeof WORLD === 'number' && (ax < 20 || ax > WORLD - 20)) return false
  const g = enGround(ax, e.y - 6)
  return g < e.y + 10
}
// would dropping off the edge ahead land somewhere safe (not a pit)?
function enSafeDrop(e, dir) { return enGround(e.x + dir * (e.w * 0.5 + 30), e.y + 20) < Infinity }

// move horizontally with own speed mv plus knockback vx; stops at edges unless allowed
function enMove(e, dt, allowDrop) {
  const v = e.mv + e.vx
  if (e.onGround && v && !enFloorAhead(e, Math.sign(v)) && !(allowDrop && enSafeDrop(e, Math.sign(v))) && Math.abs(e.vx) < 200) {
    e.mv = 0; return false
  }
  e.x += v * dt
  if (typeof WORLD === 'number') e.x = clamp(e.x, 20, WORLD - 20)
  return true
}

// patrol / chase for walkers; returns true when the enemy is near enough to attack
function enWalkAI(e, dt, speed, keep) {
  const dx = P.x - e.x, dy = P.y - e.y
  const chase = !P.dead && Math.abs(dx) < 720 && Math.abs(dy) < 220
  if (chase) {
    const want = Math.abs(dx) > keep ? Math.sign(dx) : (Math.abs(dx) < keep * 0.5 ? -Math.sign(dx) : 0)
    e.face = Math.sign(dx) || e.face
    e.mv = lerp(e.mv, want * speed, Math.min(1, dt * 8))
    const dropOK = dy > 40   // she is below: walking off the ledge is fine if it's not a pit
    if (!enMove(e, dt, dropOK)) e.mv = 0
  } else {
    if (Math.abs(e.x - e.hx) > 220) e.face = Math.sign(e.hx - e.x) || e.face
    e.mv = lerp(e.mv, e.face * speed * 0.45, Math.min(1, dt * 6))
    if (!enMove(e, dt, false)) { e.face = -e.face; e.mv = 0 }
  }
  return chase
}

// ---------------------------------------------------------------- attack kinds
// each: dur (strike length, s), start(e) at strike start, tick(e, dt) during the strike
const EN_KINDS = {
  fan: {
    dur: 0.1, start(e) {
      const A = e.A, pc = enPC(), x = e.x, y = enEyeY(e), a = ang(x, y, pc.x, pc.y), n = A.count
      for (let i = 0; i < n; i++) bullets.push(ebullet(x, y, a + (i - (n - 1) / 2) * A.spread, A.speed, { dmg: enDmg(e, A) }))
      fo('muzzle', x, y, a, 'crimson', 1.5 * enK(e))
      enSfx('shot')
    },
  },
  aimed: {
    dur: e => e.A.count * 0.14, tick(e) {
      const A = e.A
      while (e.fired < A.count && e.stT >= e.fired * 0.14) {
        const pc = enPC(), y = enEyeY(e)
        bullets.push(ebullet(e.x + e.face * 10, y, ang(e.x, y, pc.x, pc.y), A.speed, { dmg: enDmg(e, A), r: 8 }))
        e.fired++; enSfx('shot')
      }
    },
  },
  ring: {
    dur: 0.1, start(e) {
      const A = e.A, off = R(0, 1), y = e.flt ? e.y : e.y - e.h / 2
      for (let i = 0; i < A.count; i++) bullets.push(ebullet(e.x, y, (i + off) / A.count * Math.PI * 2, A.speed, { r: 8, dmg: enDmg(e, A) }))
      fo('shock', e.x, y, 70 * enK(e), { dur: 0.3 }); enSfx('shot')
    },
  },
  spiral: {
    dur: e => e.A.dur, tick(e) {
      const A = e.A, y = e.flt ? e.y : e.y - e.h / 2
      while (e.stT >= e.fired * 0.08) {
        const base = e.lock.a + e.fired * 0.33
        for (let k = 0; k < A.count; k++) bullets.push(ebullet(e.x, y, base + k / A.count * Math.PI * 2, A.speed, { r: 8, dmg: enDmg(e, A) }))
        e.fired++
        if (e.fired % 3 === 0) enSfx('shot')
      }
    },
  },
  melee: {
    dur: 0.22, start(e) { e.mv = e.face * 260; enSfx('slash'); fo('swipe', e.x + e.face * e.w * 0.3, e.y - e.h * 0.55, e.face, e.A.range + e.w * 0.3) }, tick(e, dt) {
      e.mv *= Math.pow(0.01, dt)
      const A = e.A, f = e.face
      enHit(e, enBoxOf(e, e.x + f * e.w * 0.2, e.x + f * (e.w * 0.3 + A.range), e.y - e.h * 0.95, e.y - 6), enDmg(e, A), f)
    },
  },
  bash: {
    dur: 0.4, start(e) {
      e.mv = e.face * e.A.speed; enSfx('heavy')
      if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(e.x - e.face * e.w * 0.4, e.y - 6, enLow() ? 1 : 3, { color: 'dust', vx: -e.face * 120 }) } catch { }
    }, tick(e) {
      const f = e.face
      if (Math.random() < (enLow() ? 0.2 : 0.5)) parts.push({ x: e.x + f * e.w * 0.85, y: e.y - R(10, e.h * 0.9), vx: -f * R(200, 420), vy: R(-30, 30), life: R(0.1, 0.2), t: 0, size: R(2, 3), color: '255,215,130', add: true, streak: true })
      if (enHit(e, enBoxOf(e, e.x, e.x + f * (e.w * 0.5 + 40), e.y - e.h, e.y - 4), enDmg(e, e.A) * 1.2, f)) { e.mv = 0; shake = Math.max(shake, 5); fo('shock', e.x + f * e.w * 0.8, e.y - e.h * 0.5, 60, { col: 'gold', dur: 0.3 }) }
    },
  },
  slam: {
    // the leap itself; the strike ends when it lands (see enLandSlam)
    dur: 2.5, start(e) {
      const dx = e.lock.x - e.x, up = e.lock.gy < e.y - 40
      e.vy = up ? -1250 : -1050
      const tUp = -e.vy / EN_G, drop = Math.max(0, e.lock.gy - (e.y - e.vy * e.vy / (2 * EN_G)))
      const flight = tUp + Math.sqrt(2 * drop / EN_G)
      e.mv = clamp(dx / Math.max(0.3, flight), -900, 900)
      e.onGround = false; e.slamming = true; enSfx('heavy')
    },
  },
  laser: {
    // the beam is an fx entry (foe-fx.js), so its fade and embers outlive the strike
    dur: e => e.A.dur, start(e) {
      enSfx('zap'); shake = Math.max(shake, 5)
      flash = Math.max(flash, 0.08); flashColor = '255,120,80'
      const a = e.lock.a, w = enBeamW(e), dmg = enDmg(e, e.A) * 1.4, src = enGun(e)
      const hit = (x0, y0, x1, y1) => {
        if (e.hitDone || P.dead) return
        const hb = hurtbox(), cx = hb.x + hb.w / 2
        let d = Infinity
        for (const yy of [hb.y + 10, hb.y + hb.h / 2, hb.y + hb.h - 10]) d = Math.min(d, segDist(cx, yy, x0, y0, x1, y1))
        if (d < 14 + hb.w / 2) {
          e.hitDone = true
          if (P.iframe > 0) { if (P.perfect > 0) perfectDodge() } else { hurtPlayer(dmg, Math.sign(P.x - e.x) || 1); fo('impact', P.x, P.y - 60, Math.sign(P.x - e.x) || 1, 3) }
        }
      }
      const b = typeof FOE !== 'undefined' && FOE.beamFx({ a, len: e.A.range, dur: e.A.dur, w, col: 'crimson', hit,
        src: () => { if (!e.dead) { const g = enGun(e); src.x = g.x; src.y = g.y } return src } })
      if (b) fx.push(b)
      else fx.push({ t: 0, dur: e.A.dur, update() { hit(src.x, src.y, src.x + Math.cos(a) * e.A.range, src.y + Math.sin(a) * e.A.range) }, draw() { } })
      // recoil: the caster is pushed back along the beam
      e.vx -= Math.cos(a) * 160
    },
  },
  summon: {
    dur: 0.5, start(e) {
      e.kids = (e.kids || []).filter(k => k && !k.dead)
      const A = e.A
      for (const s of e.lock.spots) {
        if (e.kids.length >= A.max) break
        ring(s.x, s.y, 80, '255,90,80')
        if (typeof spawnEnemy === 'function') { const k = spawnEnemy(A.type, s.x, s.y); if (k) e.kids.push(k) }
      }
      enSfx('glare')
    },
  },
  rush: {
    dur: 1.6, start(e) {
      e.rushD = 0; e.mv = e.lock.dir * e.A.speed; e.face = e.lock.dir; enSfx('heavy'); shake = Math.max(shake, 3)
      fo('shock', e.x - e.face * e.w * 0.4, e.y - 10, 50, { ground: e.y, flat: 0.5, col: 'gold', dur: 0.3 })
    }, tick(e, dt) {
      if (!enLow() || Math.random() < 0.4) parts.push({ x: e.x + e.face * e.w * 0.5, y: e.y - R(10, e.h * 0.8), vx: -e.face * R(400, 700), vy: 0, life: 0.14, t: 0, size: R(2, 3), color: Math.random() < 0.5 ? '255,215,130' : '255,90,70', add: true, streak: true })
      e.rushD += Math.abs(e.mv) * dt
      const f = e.face
      enHit(e, enBoxOf(e, e.x - f * e.w * 0.4, e.x + f * (e.w * 0.5 + 16), e.y - e.h, e.y - 4), enDmg(e, e.A) * 1.3, f)
      if (Math.random() < 0.6) parts.push({ x: e.x - f * e.w * 0.4, y: e.y - R(4, 20), vx: -f * R(60, 200), vy: R(-80, -10), life: R(0.2, 0.4), t: 0, size: R(4, 8), color: '230,200,180', smoke: true })
      if (e.rushD >= e.A.range * 1.25 || !enFloorAhead(e, f)) { e.mv = 0; e.stT = 99 }
    },
  },
}

// run the attack state machine; returns true while an attack is in progress
function enRunAttack(e, dt) {
  e.stT += dt
  if (e.st === 'idle') { e.cd -= dt; if (enWants(e)) enStart(e); return e.st !== 'idle' }
  const A = e.A, K = EN_KINDS[A.kind] || EN_KINDS.fan
  if (e.st === 'wind') {
    const k = e.stT / Math.max(0.01, A.windup)
    if (A.kind === 'laser') {
      // the beam tracks her for the first half of the charge, then locks: the bright line is honest
      if (k < 0.5 && !P.dead) {
        const pc = enPC(), g = enGun(e), want = ang(g.x, g.y, pc.x, pc.y)
        let d = want - e.lock.a; d = Math.atan2(Math.sin(d), Math.cos(d))
        e.lock.a += clamp(d, -2.4 * dt, 2.4 * dt)
      }
      const g = enGun(e); fo('gather', g.x, g.y, enK(e), 'crimson')
    } else if (A.kind === 'rush') {
      if (Math.random() < (enLow() ? 0.15 : 0.4)) parts.push({ x: e.x - e.lock.dir * e.w * 0.4, y: e.y - 4, vx: -e.lock.dir * R(80, 220), vy: R(-90, -20), life: R(0.3, 0.5), t: 0, size: R(4, 8), color: '230,200,180', smoke: true })
    } else if (A.kind !== 'slam') {
      enFace(e)
      if (EN_RANGED.has(A.kind)) fo('gather', e.x, A.kind === 'ring' || A.kind === 'spiral' ? enCY(e) : enEyeY(e), enK(e) * (A.kind === 'ring' || A.kind === 'spiral' ? 1.6 : 0.8), 'crimson')
    }
    K.wind && K.wind(e, dt, k)   // a kind's own telegraph (foe-casts.js)
    if (e.stT >= A.windup) { e.st = 'strike'; e.stT = 0; K.start && K.start(e) }
  } else if (e.st === 'strike') {
    K.tick && K.tick(e, dt)
    const dur = typeof K.dur === 'function' ? K.dur(e) : K.dur
    if (e.stT >= dur && !e.slamming) { e.st = 'rec'; e.stT = 0; if (A.kind !== 'slam' && A.kind !== 'rush') e.mv *= 0.3 }
  } else if (e.st === 'rec') {
    e.mv *= Math.pow(0.02, dt)
    if (e.stT >= (EN_REC[A.kind] || 0.35)) {
      e.st = 'idle'; e.stT = 0; e.cd = A.every * R(0.85, 1.15)
      e.ai = (e.ai + 1) % e.atks.length; e.A = e.atks[e.ai]
    }
  }
  return e.st !== 'idle'
}

function enLandSlam(e) {
  e.slamming = false; e.st = 'rec'; e.stT = 0; e.mv = 0
  const A = e.A
  shake = Math.max(shake, 9); enSfx('boom')
  fo('shock', e.x, e.y - 10, Math.max(120, e.w * 1.6), { ground: e.y, flat: 0.35 })
  fo('scorch', e.x, e.y, 60)
  if (typeof dust === 'function') dust(e.x, e.y)
  // a ground shock right under the landing, then low waves to jump over
  const r = Math.max(120, e.w * 1.6)
  if (P.ground) enHit(e, { x: e.x - r, y: e.y - 40, w: r * 2, h: 44 }, enDmg(e, A) * 1.2, Math.sign(P.x - e.x) || 1)
  for (let i = 0; i < A.count; i++) for (const s of [-1, 1]) {
    const b = ebullet(e.x + s * 30, e.y - 14, s > 0 ? 0 : Math.PI, A.speed * (1 - i * 0.22), { r: 10, dmg: enDmg(e, A), life: 1.4 })
    bullets.push(b)
  }
}

const enBeamW = e => 26 * enK(e) * (enElite(e) ? 1.25 : 1)

// ---------------------------------------------------------------- pressure: fighting back
// Each enemy counts the hits it took in the last 1.5 s (and hits while juggled). Hit it without
// pause and it answers once its cooldown allows: a gold glint and a closing ring (the tell,
// 0.24-0.32 s, armoured: hits do less and stop launching it), then by base:
//   shove (grunt, drones, sentries, casters): a shockwave that throws her back
//   guard (shield): a brace that shrugs off hits for ~1 s, then a shield shove
//   backstep (gunners): a hop back out of reach, then it shoots at once
//   leap (hoppers): a kick-off backflip away, then it slams soon
//   counter (hounds): a short goring lunge
// After the answer it recovers like after any attack (open). A dash's i-frames, a perfect dodge
// or the Messenger's counter beat every answer.
function enRespKind(e) {
  if (e.base === 'walker' && e.A && (e.A.kind === 'aimed' || e.A.kind === 'fan')) return 'backstep'
  return EN_RESP[e.base] || 'shove'
}
function enPressure(e) {
  const h = e.hits || []
  while (h.length && T - h[0] > 1.5) h.shift()
  return h.length
}
function enPressured(e) {
  if (e.resp || e.dead || e.spawn > 0 || T - (e.respAt ?? -9) < (enElite(e) ? 4 : 5.5)) return false
  if (e.st === 'strike' || e.slamming || e.blink) return false
  const n = enPressure(e)
  return n >= (enElite(e) ? 5 : 6) || (e.airHits || 0) >= 5 || (combo >= 12 && n >= 3)
}
function enRespond(e) {
  const kind = enRespKind(e), el = enElite(e)
  e.resp = { kind, t: 0, ph: 'tell', tell: kind === 'guard' ? (el ? 0.8 : 1.0) : (el ? 0.24 : 0.32), armor: true, mul: kind === 'guard' ? 0.12 : 0.45 }
  e.respAt = T; e.hits = []; e.airHits = 0
  e.air = 0; e.stun = 0; e.vx *= 0.2; e.mv = 0; if (e.vy < 0) e.vy = 0
  e.st = 'idle'; e.stT = 0; e.slamming = false
  enFace(e)
  fo('tell', e.x + (e.flt ? 0 : e.face * e.w * 0.12), enEyeY(e), Math.min(e.resp.tell, 0.4), enK(e) * 1.1, 'gold')
  enSfx('glare')
}
// the answer itself, when the tell ends
function enRespAct(e, r) {
  const k = enK(e), cy = e.flt ? e.y : e.y - e.h * 0.5, dmg = enElite(e) ? Math.round(enDmg(e, e.A) * 0.3) : 0
  r.ph = 'act'; r.t = 0; r.act = 0.1; r.rec = 0.55
  const shove = (x, y, rad, pow, d) => {
    fo('shock', x, y, rad, { ground: e.flt ? null : e.y })
    shake = Math.max(shake, 6); enSfx('boom')
    for (const b of bullets) if (!b.enemy && !b.dead && (b.x - x) ** 2 + (b.y - y) ** 2 < rad * rad) { b.dead = true; sparks(b.x, b.y, 3, '255,220,150') }
    enKnock(x, y, rad, d, pow)
  }
  if (r.kind === 'shove') {
    const rad = (e.base === 'sentry' ? 210 : e.base === 'walker' ? 175 : 150) * Math.max(0.8, k)
    shove(e.x, cy, rad, 760, dmg)
    if (e.base === 'caster') e.wantBlink = true
    if (e.base === 'drone') e.hx += Math.sign(e.x - P.x || 1) * 160
  } else if (r.kind === 'guard') {
    r.armor = false
    shove(e.x + e.face * e.w * 0.6, cy, 150 * k, 820, dmg)
    e.mv = e.face * 240
  } else if (r.kind === 'backstep') {
    const dir = -Math.sign(P.x - e.x) || -e.face
    if (!enFloorAhead(e, dir)) { r.kind = 'shove'; return enRespAct(e, r) }
    e.mv = dir * 950; e.vy = -320; e.onGround = false; r.act = 0.24; r.rec = 0.12; r.armor = false
    if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(e.x, e.y - 6, enLow() ? 1 : 3, { color: 'dust', vx: -dir * 140 }) } catch { }
    enSfx('dodge')
  } else if (r.kind === 'leap') {
    const dir = -Math.sign(P.x - e.x) || -e.face
    const safe = enGround(e.x + dir * 300, e.y - 300) < Infinity
    e.vy = -1000; e.onGround = false; e.mv = safe ? dir * 380 : 0; r.act = 2; r.rec = 0.2; r.armor = false
    shove(e.x, e.y - 20, 120 * k, 620, 0)
  } else if (r.kind === 'counter') {
    e.face = Math.sign(P.x - e.x) || e.face; e.mv = e.face * 1100; e.hitDone = false; r.act = 0.22; r.rec = 0.6
    fo('swipe', e.x + e.face * e.w * 0.4, e.y - e.h * 0.45, e.face, e.w * 1.4, { heavy: true }); enSfx('heavy')
  }
}
// runs the answer; true while it holds the enemy (the base skips its own AI then)
function enRespTick(e, dt) {
  const r = e.resp
  if (!r) return false
  r.t += dt
  if (r.ph === 'tell') {
    e.mv *= Math.pow(0.001, dt)
    if (r.kind === 'guard') enFace(e)
    if (r.t >= r.tell) enRespAct(e, r)
  } else if (r.ph === 'act') {
    if (r.kind === 'counter') {
      e.mv *= Math.pow(0.05, dt)
      const f = e.face
      if (enHit(e, enBoxOf(e, e.x, e.x + f * (e.w * 0.5 + 30), e.y - e.h, e.y - 4), enDmg(e, e.A) * 0.9, f) && !P.dead && P.hurtAt === T) P.vx = f * 700
    }
    const landed = r.kind === 'leap' && e.onGround && r.t > 0.15
    if (r.t >= r.act || landed) { r.ph = 'rec'; r.t = 0; r.armor = false; if (r.kind !== 'leap') e.mv *= 0.2 }
  } else if (r.ph === 'rec') {
    e.mv *= Math.pow(0.02, dt)
    if (r.t >= r.rec) { e.resp = null; e.cd = r.kind === 'backstep' || r.kind === 'leap' ? 0.05 : Math.max(0.5, Math.min(e.cd, 0.9)); if (e.base === 'shield') e.face = Math.sign(P.x - e.x) || e.face }
  }
  if (!e.flt) { if (!e.onGround) { e.x += (e.mv + e.vx) * dt; if (typeof WORLD === 'number') e.x = clamp(e.x, 20, WORLD - 20) } else enMove(e, dt, false) }
  else { e.x += e.vx * dt }
  return true
}

// every hit on an enemy goes through here: count the pressure, soften armoured hits, reward
// hits in a recovery, and start the answer when it has had enough
if (typeof damage === 'function') {
  const enCoreDamage = damage
  window.damage = function (e, dmg, o = {}) {
    if (!e || e === B || !e.base || e.dead) return enCoreDamage(e, dmg, o)
    ;(e.hits || (e.hits = [])).push(T)
    e.airHits = e.air > 0 ? (e.airHits || 0) + 1 : 0
    if (e.resp && e.resp.armor) {
      dmg *= e.resp.mul
      o = { ...o, kb: 0, launch: 0, juggle: false, spike: false }
      const x = o.x ?? e.x, y = o.y ?? enCY(e)
      sparks(x, y, enLow() ? 3 : 6, '255,220,150')
      if (T - (e.tinkAt || -9) > 0.12) { e.tinkAt = T; enSfx('reflect') }
    } else if (enOpen(e)) {
      dmg *= EN_OPEN
      if (!o.small) sparks(o.x ?? e.x, o.y ?? enCY(e), enLow() ? 2 : 5, '255,200,110')
    }
    const r = enCoreDamage(e, dmg, o)
    if (!e.dead && enPressured(e)) enRespond(e)
    return r
  }
}

// ---------------------------------------------------------------- drawing
function enSheet(e, name) {
  if (!e.def.sprite || typeof sheet !== 'function' || typeof drawSheet !== 'function') return null
  return sheet(e.def.sprite, name) || null
}

// a sheet frame with def.tint laid over its painted pixels (cached per image, frame, tint)
const enTintCache = new WeakMap()
function enTinted(s, frame, tint) {
  if (typeof document === 'undefined' || !s.img) return null
  const key = frame + '|' + tint
  let m = enTintCache.get(s.img); if (!m) { m = new Map(); enTintCache.set(s.img, m) }
  if (m.has(key)) return m.get(key)
  let c = null
  try {
    const slot = s.img.height
    c = document.createElement('canvas'); c.width = slot; c.height = slot
    const g = c.getContext('2d')
    g.drawImage(s.img, frame * slot, 0, slot, slot, 0, 0, slot, slot)
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.38; g.fillStyle = tint; g.fillRect(0, 0, slot, slot)
  } catch { c = null }
  m.set(key, c); return c
}

function enAnimName(e) {
  if (e.flash > 0 || e.stun > 0 || e.air > 0) return 'hurt'
  if (e.st === 'wind' || e.st === 'strike') return 'attack'
  if (Math.abs(e.mv) > 20 || (e.flt && e.blink)) return 'move'
  return 'idle'
}

function enFilter(e, wind) {
  const f = []
  if (e.flash > 0) f.push('brightness(2.6)')
  else if (e.charred > 0) f.push('brightness(0.42) saturate(0.4)')
  else if (e.resp && e.resp.armor) f.push('brightness(1.45)')
  else if (enOpen(e) && !enLow()) f.push('brightness(0.72) saturate(0.75)')
  if (wind > 0) { const a = (0.5 + 0.5 * Math.abs(Math.sin(T * 30))) * Math.min(1, 0.4 + wind); f.push(`drop-shadow(0 0 2px rgba(255,30,30,${a})) drop-shadow(0 0 3px rgba(255,30,30,${a}))`) }
  return f.length ? f.join(' ') : 'none'
}

// body pose: a slump in a recovery (tilted forward, sagging), a crouch and tremble while bracing
function enPose(e) {
  const open = enOpen(e), brace = e.resp && e.resp.armor
  if (!open && !brace) return
  const px = e.x, py = e.flt ? e.y : e.y
  ctx.translate(px, py)
  if (open) {
    const q = e.resp && e.resp.ph === 'rec' ? Math.min(1, e.resp.t * 6) : Math.min(1, e.stT * 6)
    if (e.flt) { ctx.translate(0, 10 * q); ctx.rotate(e.face * 0.18 * q) }
    else { ctx.rotate(e.face * 0.09 * q); ctx.scale(1 + 0.04 * q, 1 - 0.08 * q) }
  } else {
    ctx.translate(R(-1.5, 1.5), 0)
    if (!e.flt) ctx.scale(1.05, 0.95)
  }
  ctx.translate(-px, -py)
}
// what the state looks like around the body: steam venting while it recovers, the armour
// shimmer while it braces
function enStateLook(e, alpha) {
  const cy = enCY(e), rr = e.flt ? e.r : Math.max(e.w, e.h) * 0.5
  if (enOpen(e) && Math.random() < (enLow() ? 0.05 : 0.16)) {
    const top = e.flt ? e.y - e.r * 0.6 : e.y - e.h * 0.85
    parts.push({ x: e.x + R(-rr * 0.4, rr * 0.4), y: top, vx: R(-20, 20), vy: R(-70, -35), life: R(0.5, 0.8), t: 0, size: R(4, 8), color: '200,180,170', smoke: true })
  }
  if (e.resp && e.resp.armor && typeof FOE !== 'undefined') {
    ctx.save(); ctx.globalAlpha = alpha
    FOE.rim(e.x, cy, (e.flt ? e.r * 1.2 : e.w * 0.85), (e.flt ? e.r * 1.2 : e.h * 0.62), e.resp.kind === 'guard' ? 1 : 0.8, 'gold')
    ctx.restore()
  }
}

// telegraph strength 0..1 during the wind-up (also 1 during the strike)
const enWind = e => e.st === 'wind' ? clamp(e.stT / Math.max(0.01, e.A.windup), 0, 1) : e.st === 'strike' ? 1 : 0

// world-space warnings: lines, markers, circles
function enDrawWarn(e) {
  const A = e.A, k = enWind(e), pulse = 0.5 + 0.5 * Math.sin(T * 36)
  if (e.st !== 'wind' && e.st !== 'strike') return
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  if (A.kind === 'laser') {
    // the charge (the beam itself is an fx entry from foe-fx.js)
    if (e.st === 'wind') {
      const g = enGun(e), x0 = g.x, y0 = g.y, a = e.lock.a
      if (typeof FOE !== 'undefined') { const c = FOE.clip(x0, y0, a, A.range); FOE.charge(x0, y0, a, c.len, k, { w: enBeamW(e) }) }
      else {
        const L = A.range, x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L
        ctx.strokeStyle = `rgba(255,50,50,${0.25 + 0.45 * k * pulse})`; ctx.lineWidth = 2 + 3 * k
        ctx.setLineDash([18, 10]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([])
      }
    }
  } else if ((A.kind === 'fan' || A.kind === 'aimed') && e.st === 'wind' && typeof FOE !== 'undefined') {
    FOE.glowAt(e.x + (e.flt ? 0 : e.face * e.w * 0.12), enEyeY(e), (10 + 22 * k) * enK(e), '255,66,48', 0.3 + 0.6 * k)
  } else if (A.kind === 'rush' && e.st === 'wind') {
    const f = e.lock.dir, x0 = e.x + f * e.w * 0.5, x1 = e.x + f * A.range * 1.25, y = e.y - e.h * 0.45
    ctx.fillStyle = `rgba(255,40,40,${0.12 + 0.25 * k})`; ctx.fillRect(Math.min(x0, x1), y - e.h * 0.4, Math.abs(x1 - x0), e.h * 0.8)
    ctx.strokeStyle = `rgba(255,60,60,${0.4 + 0.5 * k * pulse})`; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    for (let i = 1; i <= 4; i++) { const cx = lerp(x0, x1, i / 5); ctx.beginPath(); ctx.moveTo(cx - f * 14, y - 14); ctx.lineTo(cx, y); ctx.lineTo(cx - f * 14, y + 14); ctx.stroke() }
  } else if (A.kind === 'slam') {
    const x = e.lock.x, y = e.lock.gy, r = 60 + 40 * (1 - k)
    ctx.strokeStyle = `rgba(255,50,50,${0.35 + 0.45 * pulse})`; ctx.lineWidth = 3
    ctx.beginPath(); ctx.ellipse(x, y - 2, r, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(255,40,40,0.15)'; ctx.fill()
  } else if ((A.kind === 'melee' || A.kind === 'bash') && e.st === 'wind') {
    const f = e.face, reach = A.kind === 'bash' ? e.w * 0.5 + A.speed * 0.4 : e.w * 0.3 + A.range
    ctx.fillStyle = `rgba(255,40,40,${0.08 + 0.18 * k})`
    ctx.beginPath(); ctx.moveTo(e.x, e.y - e.h * 0.55); ctx.arc(e.x, e.y - e.h * 0.55, reach, f > 0 ? -0.9 : Math.PI - 0.9, f > 0 ? 0.9 : Math.PI + 0.9); ctx.closePath(); ctx.fill()
  } else if (A.kind === 'summon' && e.st === 'wind') {
    for (const s of e.lock.spots) {
      ctx.strokeStyle = `rgba(255,60,60,${0.3 + 0.5 * k})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(s.x, s.y, 46 * k, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = T * 2 + i * Math.PI * 0.8; const px = s.x + Math.cos(a) * 46 * k, py = s.y + Math.sin(a) * 46 * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) } ctx.closePath(); ctx.stroke()
    }
  } else if ((A.kind === 'ring' || A.kind === 'spiral') && e.st === 'wind') {
    const y = e.flt ? e.y : e.y - e.h / 2
    ctx.strokeStyle = `rgba(255,60,60,${0.2 + 0.5 * k})`; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(e.x, y, (e.r || 40) * (2.6 - 1.4 * k), 0, Math.PI * 2); ctx.stroke()
    if (typeof FOE !== 'undefined') FOE.glowAt(e.x, y, (e.r || 40) * (0.6 + 0.9 * k), '255,66,48', 0.25 + 0.5 * k)
  }
  ctx.restore()
}

// Teknium's red eye glare: glowing dot plus a thin lens streak at head height.
// In a recovery it gutters: small, dim and flickering (the "hit me now" read).
function enEye(e, wind) {
  const k = enK(e), y = enEyeY(e), x = e.x + (e.flt ? 0 : e.face * e.w * 0.12)
  const r = (5 + 4 * wind) * k
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  if (enOpen(e)) ctx.globalAlpha *= 0.25 + 0.15 * Math.abs(Math.sin(T * 13))
  ctx.fillStyle = `rgba(255,40,40,${0.25 + 0.3 * wind})`; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,40,40,0.95)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,220,210,0.9)'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = `rgba(255,90,80,${0.5 + 0.4 * wind})`; ctx.fillRect(x - 18 * k - 20 * wind, y - 1, (36 * k + 40 * wind), 2)
  ctx.restore()
}

// procedural bodies (no sprite): dark crimson, gold trim; local coords, feet or centre at 0,0
function enShape(e, wind) {
  const k = enK(e), dark = e.charred > 0
  const body = e.flash > 0 ? '#fff2e8' : dark ? '#2a1a16' : '#5a1218'
  const trim = dark ? EN_GOLD_DARK : (e.def.tint || EN_GOLD)
  const red = wind > 0 ? `rgba(255,40,40,${0.5 + 0.5 * Math.abs(Math.sin(T * 30))})` : null
  const fillStroke = () => {
    ctx.fillStyle = body; ctx.fill()
    if (red) { ctx.strokeStyle = red; ctx.lineWidth = 7; ctx.stroke() }
    ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.stroke()
  }
  const b = e.base, r = e.r
  if (b === 'drone' || b === 'caster') {
    ctx.rotate(Math.sin(e.t * 2) * 0.15)
    ctx.fillStyle = 'rgba(255,70,60,0.2)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath()
    if (b === 'drone') { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0) }
    else { ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.8, -r * 0.1); ctx.lineTo(r * 0.45, r * 1.1); ctx.lineTo(-r * 0.45, r * 1.1); ctx.lineTo(-r * 0.8, -r * 0.1) }
    ctx.closePath(); fillStroke()
    ctx.strokeStyle = 'rgba(217,168,90,0.8)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.35, e.t * (b === 'caster' ? 2.5 : 1), 0, Math.PI * 2); ctx.stroke()
    if (b === 'caster') { ctx.beginPath(); ctx.arc(0, 0, r * 1.6, e.t * 1.5, e.t * 1.5 + 2.2); ctx.stroke() }
  } else if (b === 'sentry') {
    ctx.beginPath(); ctx.moveTo(-26 * k, r); ctx.lineTo(-16 * k, -r); ctx.lineTo(16 * k, -r); ctx.lineTo(26 * k, r); ctx.closePath(); fillStroke()
    ctx.strokeStyle = 'rgba(217,168,90,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -8 * k, 36 * k, e.t * 2, e.t * 2 + 4); ctx.stroke()
  } else {
    // ground bodies: feet at 0,0, facing +x (caller flips)
    const w = e.w, h = e.h, step = Math.abs(e.mv) > 20 ? Math.sin(e.t * 14) * 6 * k : 0
    const crouch = (b === 'jumper' && e.st === 'wind') ? 0.8 : 1
    ctx.save(); ctx.scale(1, crouch)
    ctx.strokeStyle = trim; ctx.lineWidth = 4 * k
    ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.3); ctx.lineTo(-w * 0.25 + step, 0); ctx.moveTo(w * 0.2, -h * 0.3); ctx.lineTo(w * 0.25 - step, 0); ctx.stroke()
    ctx.beginPath()
    if (b === 'charger') { ctx.moveTo(-w * 0.5, -h * 0.25); ctx.lineTo(-w * 0.35, -h * 0.9); ctx.lineTo(w * 0.3, -h * 0.8); ctx.lineTo(w * 0.55, -h * 0.35); ctx.lineTo(w * 0.3, -h * 0.2) }
    else if (b === 'jumper') { ctx.moveTo(0, -h); ctx.lineTo(w * 0.5, -h * 0.6); ctx.lineTo(0, -h * 0.22); ctx.lineTo(-w * 0.5, -h * 0.6) }
    else { ctx.moveTo(-w * 0.42, -h * 0.28); ctx.lineTo(-w * 0.3, -h); ctx.lineTo(w * 0.3, -h); ctx.lineTo(w * 0.42, -h * 0.28) }
    ctx.closePath(); fillStroke()
    if (b === 'charger') { ctx.strokeStyle = trim; ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.moveTo(w * 0.3, -h * 0.8); ctx.quadraticCurveTo(w * 0.7, -h * 1.05, w * 0.75, -h * 0.75); ctx.stroke() }
    ctx.restore()
  }
}

// the shield slab, always drawn on the front side (local coords, facing +x)
function enShieldSlab(e) {
  const w = e.w, h = e.h, block = e.blockT > 0
  ctx.save()
  ctx.fillStyle = block ? '#fff0d8' : e.charred > 0 ? '#3a2a22' : '#7a1a20'
  ctx.strokeStyle = EN_GOLD; ctx.lineWidth = 4 * enK(e)
  ctx.beginPath(); ctx.moveTo(w * 0.5, -h * 1.02); ctx.lineTo(w * 0.85, -h * 0.9); ctx.lineTo(w * 0.85, -h * 0.15); ctx.lineTo(w * 0.5, -h * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(w * 0.67, -h * 0.85); ctx.lineTo(w * 0.67, -h * 0.2); ctx.stroke()
  if (e.st === 'wind' && e.A.kind === 'bash') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,50,50,${0.5 + 0.5 * Math.abs(Math.sin(T * 30))})`; ctx.lineWidth = 6; ctx.stroke() }
  ctx.restore()
}

function enDraw(e) {
  const sp = e.spawn > 0 ? 1 - e.spawn / 0.6 : 1
  const alpha = sp * (e.fade != null ? e.fade : 1)
  if (alpha <= 0.01) return
  const wind = enWind(e)
  enDrawWarn(e)
  ctx.save(); ctx.globalAlpha = alpha
  enPose(e)
  const s = enSheet(e, enAnimName(e)) || enSheet(e, 'idle')
  if (s) {
    const name = enAnimName(e), n = s.n || 6
    let frame
    if (name === 'attack' && e.A) {
      const dur = EN_KINDS[e.A.kind] ? (typeof EN_KINDS[e.A.kind].dur === 'function' ? EN_KINDS[e.A.kind].dur(e) : EN_KINDS[e.A.kind].dur) : 0.2
      const total = e.A.windup + Math.min(dur, 0.6), at = e.st === 'wind' ? e.stT : e.A.windup + e.stT
      frame = Math.min(n - 1, Math.floor(at / total * n))
    } else frame = Math.floor(e.t * 10) % n
    ctx.filter = enFilter(e, wind)
    const fy = e.flt ? e.y + e.r : e.y
    const tinted = e.def.tint && e.flash <= 0 && enTinted(s, frame, e.def.tint)
    if (tinted) {
      const k = e.def.scale || 0.4
      ctx.translate(e.x, fy); ctx.scale(e.face * k, k); ctx.drawImage(tinted, -s.x, -s.y)
    } else drawSheet(s, frame, e.x, fy, e.face, e.def.scale || 0.4, alpha)
    ctx.filter = 'none'
  } else {
    ctx.translate(e.x, e.y)
    if (!e.flt) ctx.scale(e.face, 1)
    enShape(e, wind)
    if (e.base === 'shield') enShieldSlab(e)
  }
  ctx.restore()
  if (s && e.base === 'shield') { ctx.save(); ctx.globalAlpha = alpha * 0.6; ctx.translate(e.x, e.y); ctx.scale(e.face, 1); enShieldSlab(e); ctx.restore() }

  ctx.save(); ctx.globalAlpha = alpha
  enPose(e)
  enEye(e, wind)
  ctx.restore()
  enStateLook(e, alpha)
  ctx.save(); ctx.globalAlpha = alpha
  // status looks
  const cy = e.flt ? e.y : e.y - e.h / 2, rr = e.flt ? e.r : Math.max(e.w, e.h) * 0.55
  if (e.burn > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,40,0.25)'; ctx.beginPath(); ctx.arc(e.x, cy, rr, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over' }
  if (e.shock > 0) { ctx.strokeStyle = 'rgba(255,250,200,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, cy, rr + 6 + Math.sin(T * 50) * 3, 0, Math.PI * 2); ctx.stroke() }
  if (e.stun > 0 || (e.st === 'rec' && e.A && e.A.kind === 'rush')) {
    ctx.fillStyle = 'rgba(255,230,170,0.9)'
    for (let i = 0; i < 3; i++) { const a = T * 5 + i * 2.1; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 18, cy - rr - 8 + Math.sin(a) * 5, 3, 0, Math.PI * 2); ctx.fill() }
  }
  // health, only once hurt
  if (e.max && e.hp < e.max) {
    const top = e.flt ? e.y - e.r - 16 : e.y - e.h - 16
    ctx.fillStyle = 'rgba(30,10,10,0.6)'; ctx.fillRect(e.x - 28, top, 56, 4)
    ctx.fillStyle = '#f2c070'; ctx.fillRect(e.x - 28, top, 56 * Math.max(0, e.hp / e.max), 4)
  }
  ctx.restore()
}

// ---------------------------------------------------------------- the bases
// shooters keep their distance: a drone that she closes on drifts its home point away
function enFloatUpdate(e, dt) {
  if (enRespTick(e, dt)) { e.y += Math.sin(e.t * 3) * 10 * dt; return }
  const d = Math.abs(P.x - e.x)
  if (!P.dead && d < 240 && e.st === 'idle') {
    const vx = cam.x, vw = typeof VW === 'function' ? VW() : W
    e.hx = clamp(e.hx + Math.sign(e.x - P.x || 1) * 170 * dt, vx + 60, vx + vw - 60)
    if (P.y - 60 < e.hy + 80) e.hy = Math.max(110, e.hy - 60 * dt)
  }
  const tx = e.hx + Math.sin(e.t * 0.7) * 80, ty = e.hy + Math.sin(e.t * 1.3) * 34
  const hold = e.st === 'wind' || e.st === 'strike' ? 0.3 : 1   // hover steadier while attacking
  e.x += (tx - e.x) * Math.min(1, dt * 2 * hold) + e.vx * dt
  e.y += (ty - e.y) * Math.min(1, dt * 2 * hold)
  enFace(e)
  enRunAttack(e, dt)
}

function enGroundCommon(e, dt) {
  const r = enPhys(e, dt)
  e.cy = e.y - e.h / 2
  return r
}

// Melee foes share her two sides. The nearest one on a side holds it; a second one on the same
// side vaults over her to the free side, or (if both are held) waits just out of reach for a
// while before crowding in.
function enFlankPlan(e) {
  const mine = Math.sign(e.x - P.x) || 1, ad = Math.abs(e.x - P.x)
  let rival = false, farHeld = false
  for (const o of enemies) {
    if (o === e || o.dead || !o.A || !EN_MELEE.has(o.A.kind) || o.flt) continue
    const od = Math.abs(o.x - P.x)
    if (od > 420 || Math.abs(o.y - P.y) > 120) continue
    if (Math.sign(o.x - P.x) === mine) { if (od < ad) rival = true }
    else farHeld = true
  }
  if (!rival) return { side: mine, wait: false }
  if (!farHeld) return { side: -mine, wait: false }
  return { side: mine, wait: (e.t % 4) < 2.4 }
}
function enMeleeAI(e, dt, speed) {
  if ((e.planT = (e.planT || 0) - dt) <= 0) { e.planT = 0.35; e.plan = enFlankPlan(e) }
  const pl = e.plan || { side: Math.sign(e.x - P.x) || 1, wait: false }
  const mine = Math.sign(e.x - P.x) || 1, dx = P.x - e.x, ad = Math.abs(dx)
  if (pl.side !== mine && e.onGround && P.ground && ad > 120 && ad < 280 && Math.abs(P.y - e.y) < 40 && T - (e.vaultAt ?? -9) > 3.5) {
    const land = P.x + pl.side * 130
    if (enGround(land, e.y - 40) < Infinity && Math.abs(enGround(land, e.y - 40) - e.y) < 30) {
      e.vaultAt = T; e.vault = true; e.vy = -1050; e.onGround = false; e.mv = (land - e.x) / 0.8
      if (typeof dust === 'function') dust(e.x, e.y)
      return
    }
  }
  enWalkAI(e, dt, speed, pl.wait ? e.A.range * 2.3 : e.A.range * 0.8)
}

const ENEMY_BASES = {
  drone: {
    float: true,
    init(e) { enInit(e, 'drone', true) },
    update(e, dt) { enFloatUpdate(e, dt) },
    draw(e) { enDraw(e) },
  },

  sentry: {
    float: true,
    init(e) { enInit(e, 'sentry', true) },
    update(e, dt) { if (enRespTick(e, dt)) return; e.x += e.vx * dt; enFace(e); enRunAttack(e, dt) },
    draw(e) { enDraw(e) },
  },

  walker: {
    init(e) { enInit(e, 'walker', false) },
    update(e, dt) {
      if (enRespTick(e, dt)) { enGroundCommon(e, dt); return }
      if (e.vault) {
        e.x += (e.mv + e.vx) * dt
        if (typeof WORLD === 'number') e.x = clamp(e.x, 20, WORLD - 20)
        enGroundCommon(e, dt)
        if (e.onGround) { e.vault = false; e.mv = 0; enFace(e); e.cd = Math.min(e.cd, 0.3); if (typeof dust === 'function') dust(e.x, e.y) }
        return
      }
      const busy = enRunAttack(e, dt)
      if (!busy) {
        const ranged = e.A.kind === 'aimed' || e.A.kind === 'fan'
        if (ranged) enWalkAI(e, dt, e.def.speed || 160, e.A.range * 0.55)
        else enMeleeAI(e, dt, e.def.speed || 160)
      } else enMove(e, dt, false)
      enGroundCommon(e, dt)
    },
    draw(e) { enDraw(e) },
  },

  shield: {
    init(e) { enInit(e, 'shield', false); e.blockFront = true; e.turnT = 0; e.blockT = 0 },
    update(e, dt) {
      e.blockT = Math.max(0, e.blockT - dt)
      if (enRespTick(e, dt)) { e.turnT = 0; enGroundCommon(e, dt); return }
      // turns slowly, so dashing past it opens the back
      const behind = !P.dead && Math.sign(P.x - e.x) !== e.face && Math.abs(P.x - e.x) > 10
      e.turnT = behind ? e.turnT + dt : 0
      if (behind && e.st === 'idle') e.cd = Math.max(e.cd, 0.2)   // never bashes away from her
      const face = e.face
      const busy = enRunAttack(e, dt)
      e.face = face
      if (e.turnT > 0.55 && e.st !== 'strike') { e.face = -e.face; e.turnT = 0 }
      if (!busy) {
        const dx = P.x - e.x, speed = (e.def.speed || 110)
        const chase = !P.dead && Math.abs(dx) < 700 && Math.abs(P.y - e.y) < 220
        const want = chase && Math.sign(dx) === e.face && Math.abs(dx) > e.A.range * 0.7 ? e.face : 0
        if (!chase) { if (Math.abs(e.x - e.hx) > 200) e.face = Math.sign(e.hx - e.x) || e.face; e.mv = lerp(e.mv, e.face * speed * 0.4, Math.min(1, dt * 6)) }
        else e.mv = lerp(e.mv, want * speed, Math.min(1, dt * 8))
        if (!enMove(e, dt, chase && P.y - e.y > 40) && !chase) { e.face = -e.face; e.turnT = 0 }
      } else enMove(e, dt, false)
      enGroundCommon(e, dt)
    },
    // the core asks this before damage and before a bullet hits: true = blocked
    blocks(e, fromX) {
      if (!e.blockFront || e.air > 0 || e.stun > 0 || e.dead || e.charred > 0 && e.st === 'rec') return false
      if ((fromX - e.x) * e.face <= 0) return false
      if (e.blockT <= 0.05) { sparks(e.x + e.face * e.w * 0.7, e.y - e.h * 0.55, 6, '255,220,150'); enSfx('reflect') }
      e.blockT = 0.12
      return true
    },
    draw(e) { enDraw(e) },
  },

  jumper: {
    init(e) { enInit(e, 'jumper', false); e.hopT = R(0.4, 0.9) },
    update(e, dt) {
      if (enRespTick(e, dt)) { enGroundCommon(e, dt); return }
      const wasAir = !e.onGround
      const busy = enRunAttack(e, dt)
      if (busy && e.A.kind === 'slam') { if (!e.onGround) e.x += (e.mv + e.vx) * dt }
      else if (busy) enMove(e, dt, false)
      else if (e.onGround) {
        e.mv = 0
        e.hopT -= dt
        if (e.hopT <= 0 && !P.dead && Math.abs(P.x - e.x) < 900) {
          e.hopT = R(0.5, 0.9); enFace(e)
          const hop = e.def.speed || 280
          // flank: aim for her free side when another melee foe already holds this one
          const pl = enFlankPlan(e)
          let dx = clamp(P.x + (pl.side !== (Math.sign(e.x - P.x) || 1) ? pl.side * 110 : 0) - e.x, -hop, hop)
          // never hop into a pit: shorten the hop until it lands on something
          while (Math.abs(dx) > 40 && enGround(e.x + dx, Math.min(e.y, P.y) - 300) === Infinity) dx *= 0.6
          if (Math.abs(dx) > 40 || P.y < e.y - 60) {
            e.vy = P.y < e.y - 60 ? -1150 : -780; e.onGround = false
            e.mv = dx / (e.vy < -1000 ? 0.85 : 0.6)
          }
        }
      } else e.x += (e.mv + e.vx) * dt
      const landed = enGroundCommon(e, dt)
      if (wasAir && e.onGround) {
        if (e.slamming) enLandSlam(e)
        else { e.mv = 0; if (landed === 'land' && typeof dust === 'function') dust(e.x, e.y) }
      }
    },
    draw(e) { enDraw(e) },
  },

  caster: {
    float: true,
    init(e) { enInit(e, 'caster', true); e.blink = null; e.fade = 1; e.castCD = R(0.6, 1.2) },
    update(e, dt) {
      // blinking: fade out, move, fade in; no attacking meanwhile
      if (e.blink) {
        const b = e.blink; b.t += dt
        if (b.t < 0.3) e.fade = 1 - b.t / 0.3
        else {
          if (!b.moved) { b.moved = true; e.x = b.x; e.y = b.y; e.hx = b.x; e.hy = b.y; ring(e.x, e.y, 90, '255,80,80'); enSfx('zap') }
          e.fade = Math.min(1, (b.t - 0.3) / 0.3)
          if (b.t >= 0.6) { e.blink = null; e.fade = 1; e.untargetable = false; e.cd = Math.min(e.cd, 0.25) }
        }
        return
      }
      if (enRespTick(e, dt)) return
      e.y += Math.sin(e.t * 2) * 12 * dt
      e.x += e.vx * dt
      enFace(e)
      const was = e.st
      enRunAttack(e, dt)
      // after each cast, blink to a new spot 300-500 px from her
      if (was === 'rec' && e.st === 'idle') e.wantBlink = true
      const d = Math.abs(P.x - e.x)
      if (e.st === 'idle' && !P.dead && (e.wantBlink || d < 220 || d > 900)) {
        e.wantBlink = false
        const side = Math.random() < 0.5 ? -1 : 1
        const vx = cam.x, vw = typeof VW === 'function' ? VW() : W
        let x = P.x + side * R(300, 500)
        if (x < vx + 60 || x > vx + vw - 60) x = P.x - side * R(300, 500)
        x = clamp(x, vx + 60, vx + vw - 60)
        const y = clamp(P.y - R(120, 240), 110, GROUND - 120)
        e.blink = { t: 0, x, y, moved: false }; e.untargetable = true
        ring(e.x, e.y, 90, '255,80,80')
        e.cd = Math.max(e.cd, 0.35)
      }
    },
    draw(e) { enDraw(e) },
  },

  charger: {
    init(e) { enInit(e, 'charger', false) },
    update(e, dt) {
      if (enRespTick(e, dt)) { enGroundCommon(e, dt); return }
      const busy = enRunAttack(e, dt)
      if (busy) { if (!enMove(e, dt, false) && e.st === 'strike' && e.A.kind === 'rush') { e.mv = 0; e.stT = 99 } }
      else {
        // waits; shuffles to face her and edges closer if she is far
        enFace(e)
        const dx = P.x - e.x, near = !P.dead && Math.abs(dx) < 900 && Math.abs(P.y - e.y) < 200
        e.mv = lerp(e.mv, near && Math.abs(dx) > e.A.range ? Math.sign(dx) * 90 : 0, Math.min(1, dt * 5))
        enMove(e, dt, false)
      }
      enGroundCommon(e, dt)
    },
    draw(e) { enDraw(e) },
  },
}
