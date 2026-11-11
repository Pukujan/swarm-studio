// ARES signature moves for the Messenger, layered on the core (classic scripts share one
// global scope, and a top-level function can be reassigned):
//
// - Flash Step: her dash is a blink of gold. She vanishes along the line, and a beat after
//   she lands every enemy she passed through is cut.
// - Hundred Petal Dance: up + L, or L just after a perfect dodge (50 meter). She flashes from
//   enemy to enemy, cutting each, then lands where she started as every cut opens at once.
// - Sky Rend wave: the travelling crescent, now a storm of wind and lightning.
//
// Colours stay in the game's gold, white and crimson.

const OMNI_COST = 50

// ---- small effects
function boltPath(x0, y0, x1, y1, jag = 18, n = 7) {
  const pts = [[x0, y0]]
  for (let i = 1; i < n; i++) { const k = i / n; pts.push([lerp(x0, x1, k) + R(-jag, jag), lerp(y0, y1, k) + R(-jag, jag)]) }
  pts.push([x1, y1]); return pts
}
function strokeBolt(pts, a, w = 3) {
  ctx.globalCompositeOperation = 'lighter'
  for (const [lw, col] of [[w * 4, `rgba(255,200,120,${0.25 * a})`], [w * 1.6, `rgba(255,235,190,${0.7 * a})`], [w * 0.6, `rgba(255,255,250,${a})`]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath()
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
  }
}
function boltFx(x0, y0, x1, y1, dur = 0.22) {
  const pts = boltPath(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.08, 8)
  fx.push({ t: 0, dur, draw(k) { strokeBolt(pts, 1 - k, 3) } })
}
// a straight streak of light between two points (the line she leaves when she blinks)
function streakFx(x0, y0, x1, y1, dur = 0.35, col = '255,225,160', w = 10) {
  fx.push({ t: 0, dur, draw(k) {
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.7, `rgba(${col},${0.8 * (1 - k)})`); g.addColorStop(1, `rgba(255,255,245,${1 - k})`)
    ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.lineWidth = w * (1 - k * 0.6); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  } })
}
// a thin cut line that appears, holds, then splits open
function cutFx(x, y, a, len, col = '255,240,215', hold = 0.1) {
  fx.push({ t: 0, dur: 0.42, draw(k) {
    const open = k < hold / 0.42 ? 0 : (k - hold / 0.42) / (1 - hold / 0.42)
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter'
    const L = len * (0.6 + 0.4 * Math.min(1, k * 6))
    ctx.fillStyle = `rgba(${col},${1 - open})`
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -(2 + open * 9), L / 2, 0); ctx.quadraticCurveTo(0, 2 + open * 9, -L / 2, 0); ctx.fill()
    ctx.restore()
  } })
}
function windCurls(x, y, n, face, col = '255,245,230') {
  for (let i = 0; i < n; i++) {
    const r = R(18, 46), x0 = x + R(-40, 40), y0 = y + R(-90, 90), sp = R(260, 520)
    fx.push({ t: 0, dur: R(0.35, 0.6), draw(k) {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${col},${0.55 * (1 - k)})`; ctx.lineWidth = 2.2 * (1 - k) + 0.6
      ctx.beginPath(); ctx.arc(x0 - face * sp * k * 0.4, y0 - 20 * k, r * (0.6 + k * 0.6), face > 0 ? Math.PI * 0.6 : -Math.PI * 0.4, (face > 0 ? Math.PI * 0.6 : -Math.PI * 0.4) + Math.PI * 1.3 * (0.4 + k)); ctx.stroke()
    } })
  }
}

// ---- Sky Rend wave: wind and lightning
window.waveShot = function () {
  const face = P.face, y = P.y - 95
  let shed = 0, zap = 0, dust = 0
  const o = { t: 0, dur: 1.15, x: P.x + face * 70, hit: new Set(), bolts: [], update(dt) {
    this.x += face * 1150 * dt
    const k = this.t / this.dur, s = 1 + k * 0.35
    const box = { x: this.x - 60 * s, y: y - 140 * s, w: 120 * s, h: 280 * s }
    for (const b of bullets) if (b.enemy && circBox(b.x, b.y, b.r, box)) reflect(b)
    for (const e of targets()) if (!this.hit.has(e) && boxHit(box, e.box())) {
      this.hit.add(e); damage(e, 16, { x: e.x, y: e.y, kb: face * 280 })
      boltFx(this.x, y + R(-60, 60), e.x, e.y - (e.h || 120) * 0.6); zapFx(e.x, e.y - 50); SFX.zap()
      if (Math.random() < 0.5) applyStatus(e, 'shock')
    }
    for (const p of plats) if (p.hp && !p.broken && !this.hit.has(p) && boxHit(box, p)) { this.hit.add(p); hurtPlat(p, 25) }
    // the crescent sheds wind behind it and crackles with lightning
    if ((shed -= dt) <= 0) { shed = 0.03; for (let i = 0; i < 3; i++) parts.push({ x: this.x - face * R(10, 60), y: y + R(-130, 130) * s, vx: -face * R(300, 700), vy: R(-60, 60), life: R(0.2, 0.4), t: 0, size: R(1.5, 3.5), color: '255,240,220', add: true, streak: true }) }
    if ((zap -= dt) <= 0) {
      zap = 0.045
      const a0 = R(-1.1, 1.1), a1 = a0 + R(-0.6, 0.6)
      this.bolts.push({ t: 0, pts: boltPath(Math.cos(a0) * 125 * s - 40, Math.sin(a0) * 125 * s, Math.cos(a1) * (150 + R(0, 60)) * s - 40, Math.sin(a1) * (150 + R(0, 60)) * s, 10, 5) })
    }
    for (const b of this.bolts) b.t += dt
    this.bolts = this.bolts.filter(b => b.t < 0.09)
    if ((dust -= dt) <= 0 && Math.abs(GROUND - P.y) < 260) { dust = 0.07; if (fxk()?.smoke) try { FXK.smoke(this.x, GROUND - 4, 1, { color: 'dust', size: 0.7, spread: 30, rise: 40, vx: face * 120 }) } catch { } }
    if (Math.random() < dt * 8) windCurls(this.x - face * 30, y, 1, face)
  }, draw(k) {
    const s = 1 + k * 0.35, fade = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
    ctx.save(); ctx.translate(this.x, y); ctx.scale(face * s, s); ctx.globalCompositeOperation = 'lighter'
    // wind: wide soft layers behind the edge
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(255,${230 - i * 18},${200 - i * 40},${0.12 * fade})`; ctx.lineWidth = 70 - i * 12
      ctx.beginPath(); ctx.arc(-70 - i * 22, 0, 120, -1.05, 1.05); ctx.stroke()
    }
    // the blade edge: crimson core under gold under white
    const edge = [[34, '200,30,40', 0.5], [20, '255,190,90', 0.75], [9, '255,245,215', 1], [3, '255,255,255', 1]]
    for (const [w, c, a] of edge) { ctx.strokeStyle = `rgba(${c},${a * fade})`; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(-40, 0, 125, -1.15, 1.15); ctx.stroke() }
    // tapered tips
    ctx.fillStyle = `rgba(255,245,220,${fade})`
    for (const sg of [-1, 1]) { const a = 1.15 * sg; ctx.beginPath(); ctx.arc(-40 + Math.cos(a) * 125, Math.sin(a) * 125, 5, 0, Math.PI * 2); ctx.fill() }
    // wind lines raking back from the edge
    ctx.strokeStyle = `rgba(255,250,240,${0.5 * fade})`; ctx.lineWidth = 2
    for (let i = -4; i <= 4; i++) { const a = i * 0.24, r = 125; ctx.beginPath(); ctx.moveTo(-40 + Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(-40 + Math.cos(a) * r - 90 - Math.abs(i) * 14, Math.sin(a) * r * 0.92); ctx.stroke() }
    for (const b of this.bolts) strokeBolt(b.pts, fade * (1 - b.t / 0.09), 2)
    ctx.restore()
  } }
  fx.push(o)
  windCurls(P.x + face * 80, y, 5, face)
  flash = Math.max(flash, 0.08); flashColor = '255,240,210'
}

// ---- Flash Step
{
  const baseDash = window.startDash
  window.startDash = function (dir) {
    const x0 = P.x
    baseDash(dir)
    if (P.hero === 'runner') {
      // the Oracle blinks: gone in a scatter of feathers, back a step away, untouched
      let nx = clamp(P.x + P.dashDir * 240, leftBound(), rightBound())
      for (const p of plats) if (p.kind === 'wall' && !p.broken && P.y > p.surf + 6) {
        if (P.dashDir > 0 && p.l - 24 > x0 && p.l - 24 < nx) nx = p.l - 24
        if (P.dashDir < 0 && p.r + 24 < x0 && p.r + 24 > nx) nx = p.r + 24
      }
      if (inPit(nx) && P.ground) nx = x0 + (nx - x0) * 0.5
      for (let i = 0; i < 10; i++) parts.push({ x: x0 + R(-20, 20), y: P.y - R(30, 150), vx: R(-160, 160), vy: R(-200, 40), life: R(0.5, 0.9), t: 0, size: R(3, 5), color: '255,240,235', add: false })
      streakFx(x0, P.y - 85, nx, P.y - 85, 0.3, '255,215,220', 8)
      P.x = nx; P.dashT = 0.05; P.iframe = Math.max(P.iframe, 0.32)
      ring(P.x, P.y - 80, 70, '255,230,235')
      return
    }
    if (P.hero !== 'messenger') return
    P.fstep = { x: P.x, y: P.y - 85, lx: P.x, marked: new Set(), t: 0 }
    flash = Math.max(flash, 0.06); flashColor = '255,235,200'
    sparks(P.x, P.y - 80, 10, '255,235,190')
  }
}
function flashStepTick(dt) {
  const F = P.fstep; if (!F) return
  F.t += dt
  if (P.dashT > 0) {
    // everything between where she was and where she is now gets marked
    const x0 = Math.min(F.lx, P.x) - 30, x1 = Math.max(F.lx, P.x) + 30
    for (const e of targets()) { const b = e.box(); if (b.x < x1 && b.x + b.w > x0 && b.y < P.y && b.y + b.h > P.y - 170) F.marked.add(e) }
    F.lx = P.x
    return
  }
  if (!F.done) {
    F.done = true
    streakFx(F.x, F.y, P.x, P.y - 85, 0.4, '255,225,160', 12)
    sparks(P.x, P.y - 80, 8, '255,240,210')
    const hits = [...F.marked]
    if (hits.length) later(0.14, () => {
      SFX.slash(); shake = Math.max(shake, 3 + hits.length); stopT = Math.max(stopT, 0.04)
      for (const e of hits) {
        if (e.dead || (e === B && (!B || B.dead))) continue
        const a = R(-0.5, 0.5) + (Math.random() < 0.5 ? 0 : Math.PI)
        cutFx(e.x, e.y - (e.h || 120) * 0.5, a, 170)
        if (fxk()?.slash) try { FXK.slash(e.x, e.y - (e.h || 120) * 0.5, a, 150, { color: 'white' }) } catch { }
        damage(e, 9, { x: e.x, y: e.y, kb: P.dashDir * 120 })
      }
    })
    P.fstep = null
  }
}

// ---- Hundred Petal Dance
function omniReady() { return P.hero === 'messenger' && P.meter >= OMNI_COST && !P.omni && targets().some(e => Math.abs(e.x - P.x) < 900) }
function startOmni() {
  const ts = targets().filter(e => Math.abs(e.x - P.x) < 900).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)).slice(0, 6)
  if (!ts.length) return false
  P.meter -= OMNI_COST; P.act = null; P.queueMove = null; P.str = []
  const hops = []; for (let i = 0; i < 8; i++) hops.push(ts[i % ts.length])
  P.omni = { hops, i: -1, t: 0.12, home: { x: P.x, y: P.y, face: P.face }, cut: new Set(), lx: P.x, ly: P.y - 85 }
  cancelBullets(P.x, P.y - 80, 700)
  for (const e of ts) e.stun = Math.max(e.stun || 0, 2.2)
  flash = 0.3; flashColor = '255,240,215'; dim = Math.max(dim, 1.2)
  cam.focus = { z: (stage?.zoom?.calm || 1.55) + 0.1, t: 2.2 }
  say(P.hero, MOVES.messenger.charge.voice || 'charge', true); nameSub('Hundred Petal Dance')
  return true
}
function omniTick(dt) {
  const O = P.omni
  P.iframe = Math.max(P.iframe, 0.3); P.vx = 0; P.vy = 0; P.animT += dt
  for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt)
  O.t -= dt
  if (O.t > 0) return
  O.i++
  if (O.i < O.hops.length) {
    let e = O.hops[O.i]
    if (e.dead || (e === B && B.dead)) { e = targets().find(t => Math.abs(t.x - O.home.x) < 1000); if (!e) { O.i = O.hops.length; O.t = 0; return } }
    const side = O.i % 2 ? 1 : -1
    const ty = e === B ? B.y : e.y
    const nx = clamp(e.x + side * 80, leftBound(), rightBound()), ny = Math.min(GROUND, ty)
    streakFx(O.lx, O.ly, nx, ny - 85, 0.45, O.i % 2 ? '255,225,160' : '255,150,140', 9)
    P.x = nx; P.y = ny; P.face = -side; O.lx = nx; O.ly = ny - 85
    const a = R(-1.2, 1.2) + (side > 0 ? Math.PI : 0)
    const cy = ty - (e.h || 120) * 0.55
    cutFx(e.x, cy, a, 200, O.i % 2 ? '255,240,215' : '255,170,160', 0.5)
    if (fxk()?.slash) try { FXK.slash(e.x, cy, a, 190, { color: O.i % 2 ? 'gold' : 'crimson' }) } catch { }
    damage(e, 11, { x: e.x, y: e.y, kb: 0, small: O.i % 3 !== 0 })
    e.stun = Math.max(e.stun || 0, 0.6)
    O.cut.add(e)
    SFX.slash(); shake = Math.max(shake, 4); sparks(e.x, cy, 6, '255,235,200')
    for (let j = 0; j < 6; j++) parts.push({ x: e.x + R(-40, 40), y: cy + R(-50, 50), vx: R(-160, 160), vy: R(-220, 40), life: R(0.6, 1.1), t: 0, size: R(3, 5), color: O.i % 2 ? '255,200,205' : '255,235,225', add: false })
    O.t = 0.085
    return
  }
  // the finale: back home, then every cut opens at once
  const H0 = O.home
  streakFx(O.lx, O.ly, H0.x, H0.y - 85, 0.5, '255,240,210', 14)
  P.x = H0.x; P.y = H0.y; P.face = H0.face
  P.omni = null; P.iframe = Math.max(P.iframe, 0.6)
  P.act = null; P.animT = 0
  startMove('slash3')
  later(0.22, () => {
    flash = 0.45; flashColor = '255,235,215'; shake = Math.max(shake, 14); stopT = Math.max(stopT, 0.12); cam.kick = 0.5
    SFX.heavy(); SFX.boom?.()
    for (const e of O.cut) {
      if (e.dead || (e === B && (!B || B.dead))) continue
      const cy = (e === B ? B.y : e.y) - (e.h || 120) * 0.55
      cutFx(e.x, cy, 0.7, 320, '255,245,225', 0.02); cutFx(e.x, cy, -0.7, 320, '255,180,170', 0.02)
      if (fxk()?.hit) try { FXK.hit(e.x, cy, 1, 3) } catch { }
      damage(e, 34, { x: e.x, y: e.y, kb: Math.sign(e.x - P.x) * 500 })
      for (let j = 0; j < 14; j++) parts.push({ x: e.x, y: cy, vx: R(-420, 420), vy: R(-420, 120), life: R(0.7, 1.4), t: 0, size: R(3, 6), color: j % 2 ? '255,195,200' : '255,240,230', add: false })
    }
    if (fxk()?.smoke) try { FXK.smoke(P.x, P.y, 5, { color: 'dust', size: 1.2, spread: 120 }) } catch { }
  })
}
{
  const baseSpecial = window.specialPressed
  window.specialPressed = function () {
    const U = down('arrowup', 'w')
    if (omniReady() && (U || (T - (P.perfectAt || -9)) < 1.2)) { if (startOmni()) return }
    return baseSpecial()
  }
  const basePerfect = window.perfectDodge
  window.perfectDodge = function (...a) { P.perfectAt = T; return basePerfect.apply(this, a) }
  const baseUpdate = window.updatePlayer
  window.updatePlayer = function (dt) {
    if (P.omni && !P.dead) return omniTick(dt)
    baseUpdate(dt)
    flashStepTick(dt)
  }
  // she is a blur while she blinks, and a cutting pose while she dances
  const baseSprite = window.drawSprite
  window.drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
    const me = hero === P.hero && x === P.x && y === P.y
    if (me && P.fstep && P.dashT > 0.03) alpha *= 0.15
    if (me && P.ground && BREEZE_SHEETS.test(sheet) && !P.act) return drawBreezy(hero, sheet, frame, x, y, face, alpha, scale)
    return baseSprite(hero, sheet, frame, x, y, face, alpha, scale)
  }
}

// ---- the standing breeze: a soft, constant wind through her hair and hem while she stands.
// The frame is drawn in thin horizontal strips, each nudged sideways by a wave that travels
// down her figure: a little in the hair, more at the hem, none at the face or the feet.
const BREEZE_SHEETS = /^(m-idle|idle|o-idle|m-tease|o-tease|m-win|o-win|m-breeze|o-breeze)$/
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
function drawBreezy(hero, sheet, frame, x, y, face, alpha, scale) {
  const s = A.sheets[hero][sheet]; if (!s) return
  const k = SCALE[hero] * scale, slot = s.img.height, top = Math.max(0, s.y - s.h)
  const gustK = P.tease?.sheet?.includes('breeze') ? 2.2 : 1
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(face * k, k)
  const sx = frame * slot
  if (top > 0) ctx.drawImage(s.img, sx, 0, slot, top, -s.x, -s.y, slot, top)
  const step = typeof PERF !== 'undefined' && PERF.low ? 8 : 4
  for (let sy = top; sy < s.y; sy += step) {
    const v = (sy - top) / s.h
    const hair = 0.9 * smooth(0.14, 0.34, v) * (1 - smooth(0.42, 0.56, v))
    const hem = smooth(0.5, 0.78, v) * (1 - smooth(0.86, 0.97, v))
    const amp = (hair * 5 + hem * 9) * gustK
    const dx = amp * (Math.sin(T * 2.3 - v * 6) * 0.7 + Math.sin(T * 3.7 - v * 9 + 1.3) * 0.3) - (gustK > 1 ? amp * 0.6 : 0)
    const h = Math.min(step + 1, s.y - sy)
    ctx.drawImage(s.img, sx, sy, slot, h, -s.x + dx, sy - s.y, slot, h)
  }
  ctx.drawImage(s.img, sx, s.y, slot, slot - s.y, -s.x, 0, slot, slot - s.y)
  ctx.restore()
}
{
  const basePick = window.pickAnim
  window.pickAnim = function () {
    if (P.omni) { const sh = P.omni.i % 2 ? 'slash2' : 'slash3', n = A.sheets.messenger?.[sh]?.n || 6; return { sheet: sh, frame: Math.min(n - 1, 2 + (P.omni.i % 2)) } }
    return basePick()
  }
}

// ---- her afterimages, shared by the Flash-step cut and the ultimate (thousand.js): each frame is
// tinted once into a small cached canvas, then drawn with additive glow
const GHOST_CACHE = new Map()
function ghostTint(sheet, frame, col) {
  const key = sheet + ':' + frame + ':' + col
  if (GHOST_CACHE.has(key)) return GHOST_CACHE.get(key)
  const s = A.sheets.messenger?.[sheet]; if (!s) return null
  const k = SCALE.messenger, slot = s.img.height, sz = Math.max(8, Math.ceil(slot * k))
  const c = document.createElement('canvas'); c.width = c.height = sz
  const g = c.getContext('2d')
  g.drawImage(s.img, frame * slot, 0, slot, slot, 0, 0, sz, sz)
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(${col},0.88)`; g.fillRect(0, 0, sz, sz)
  const out = { c, ox: s.x * k, oy: s.y * k }
  GHOST_CACHE.set(key, out); return out
}
const ghostPose = (name, f) => { const s = A.sheets.messenger?.[name]; return s ? { sheet: name, frame: Math.min(s.n - 1, f) } : { sheet: 'm-idle', frame: 0 } }
// g = {x, y (feet), face, sheet, frame, col, solid?}; a = alpha
function drawGhost(g, a) {
  if (a <= 0.01) return
  const t = ghostTint(g.sheet, g.frame, g.col)
  if (g.solid && A.sheets.messenger?.[g.sheet]) drawSprite('messenger', g.sheet, g.frame, g.x, g.y, g.face, 0.85 * a)
  if (!t) return
  ctx.save(); ctx.translate(g.x, g.y); ctx.scale(g.face, 1); ctx.globalCompositeOperation = 'lighter'
  if (g.solid) { ctx.globalAlpha = 0.45 * a; ctx.drawImage(t.c, -t.ox, -t.oy) }
  else {
    // a coloured silhouette that reads on bright skies, then a soft additive glow over it
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.5; ctx.drawImage(t.c, -t.ox, -t.oy)
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.28; ctx.drawImage(t.c, -t.ox, -t.oy)
    ctx.globalAlpha = a * 0.12; ctx.drawImage(t.c, -t.ox - 5, -t.oy - 5, t.c.width + 10, t.c.height + 10)
  }
  ctx.restore()
}
function ghostFx(g, dur = 0.6, delay = 0) {
  fx.push({ t: 0, dur: dur + delay, draw(k) { const t = k * (dur + delay) - delay; if (t >= 0) drawGhost(g, (1 - t / dur) * 0.85) } })
}

// ---- 月閃 Moon Flash (key E, aimed with the arrows): one teleport slash in the held direction
// (horizontal, up, down or diagonal), up to a corner-to-corner distance. She stops at the arena
// bounds, the ceiling, floors and walls. A long crimson-gold line and 3-4 afterimages stay
// behind; a beat after she has passed, everything on the line takes its cut at once.
const FLASHCUT_CD = 4.5
function flashCut() {
  const ux = (down('arrowright', 'd') ? 1 : 0) - (down('arrowleft', 'a') ? 1 : 0)
  let uy = (down('arrowdown', 's') ? 1 : 0) - (down('arrowup', 'w') ? 1 : 0)
  if (uy > 0 && P.ground) uy = 0
  let dx = ux, dy = uy
  if (!dx && !dy) dx = P.face
  const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl
  const maxD = Math.hypot(VW(), VH()) * 0.85, top = cam.y + 140
  const x0 = P.x, y0 = P.y
  let x = x0, y = y0
  for (let d = 0; d < maxD; d += 16) {
    const nx = x + dx * 16, ny = y + dy * 16
    if (nx < leftBound() || nx > rightBound() || ny < top) break
    const g = groundAt(nx, y - 4)
    if (ny > g) { if (g < Infinity) y = g; break }
    let wall = false
    for (const p of plats) if (p.kind === 'wall' && !p.broken && ny > p.surf + 6 && nx > p.l - 24 && nx < p.r + 24) wall = true
    if (wall) break
    x = nx; y = ny
  }
  if (Math.hypot(x - x0, y - y0) < 60) return false
  P.cds.flashcut = FLASHCUT_CD; nameSub(moveName('messenger', 'flashcut'))
  P.act = null; P.queueMove = null; P.str = []
  const face = Math.sign(x - x0) || P.face
  const air = y < groundAt(x, y - 2) - 2
  P.x = x; P.y = y; P.face = face; P.vx = face * 120; P.vy = air ? -260 : 0
  if (air) P.ground = false
  P.iframe = Math.max(P.iframe, 0.3)
  const ly0 = y0 - 85, ly1 = y - 85
  // the line
  fx.push({ t: 0, dur: 0.75, draw(k) {
    const grow = Math.min(1, k / 0.08), hx = lerp(x0, x, grow), hy = lerp(ly0, ly1, grow), a = 1 - Math.max(0, k - 0.3) / 0.7
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'
    const LY = [[34, '200,25,40', 0.3], [14, '255,120,60', 0.45], [6, '255,210,130', 0.85], [2, '255,255,245', 1]]
    if (typeof TRAIL !== 'undefined' && TRAIL.lens) {
      // tapered at both ends (soft lens layers), open at the head while it is still growing
      const ex = grow < 1 ? hx + (hx - x0) * 0.15 : hx, ey = grow < 1 ? hy + (hy - ly0) * 0.15 : hy
      for (const [w, c, o] of [[24, '200,25,40', 0.22], ...LY.map(([w, c, o]) => [w * 0.55, c, o])]) TRAIL.lens(x0, ly0, ex, ey, w * (1 - k * 0.5), c, o * a)
      if (grow < 1) TRAIL.dot('255,240,200', hx, hy, 12, a, { core: true })
    } else for (const [w, c, o] of LY) {
      ctx.strokeStyle = `rgba(${c},${o * a})`; ctx.lineWidth = w * (1 - k * 0.5); ctx.beginPath(); ctx.moveTo(x0, ly0); ctx.lineTo(hx, hy); ctx.stroke()
    }
  } })
  // afterimages along the path
  const n = typeof PERF !== 'undefined' && PERF.low ? 3 : 4
  for (let i = 0; i < n; i++) {
    const f = i / n, p = i % 2 ? ghostPose('slash1', 3) : ghostPose('dash', 2)
    ghostFx({ x: lerp(x0, x, f), y: lerp(y0, y, f), face, sheet: p.sheet, frame: p.frame, col: i / (n - 1) < 0.5 ? '255,180,80' : '240,90,110' }, 0.5, f * 0.04)
  }
  for (let i = 0; i < 10; i++) parts.push({ x: x0 + R(-20, 20), y: y0 - R(30, 150), vx: R(-160, 160), vy: R(-220, 40), life: R(0.5, 0.9), t: 0, size: R(3, 5), color: i % 2 ? '255,190,200' : '255,235,225', add: false, feather: true })
  sparks(x, y - 85, 8, '255,235,200'); SFX.dodge?.()
  flash = Math.max(flash, 0.08); flashColor = '255,225,210'
  // the cut lands after she has passed
  const hits = targets().filter(e => { if (e.dead) return false; const b = e.box(); return segDist(b.x + b.w / 2, b.y + b.h / 2, x0, ly0, x, ly1) < Math.max(b.w, b.h) / 2 + 30 })
  later(0.2, () => {
    if (!hits.length) return
    SFX.slash(); shake = Math.max(shake, 5 + hits.length); stopT = Math.max(stopT, 0.05)
    const a = Math.atan2(ly1 - ly0, x - x0)
    for (const e of hits) {
      if (e.dead || (e === B && (!B || B.dead))) continue
      const b = e.box(), cx = b.x + b.w / 2, cy = b.y + b.h / 2
      cutFx(cx, cy, a, 230, '255,235,210', 0.02)
      if (fxk()?.hit) try { FXK.hit(cx, cy, a, 2) } catch { }
      sparks(cx, cy, 10, '255,215,170')
      damage(e, 22, { x: e.x, y: e.y, kb: face * 220 })
    }
  })
  return true
}
{
  const baseUpdate = window.updatePlayer
  window.updatePlayer = function (dt) {
    if (P.hero === 'messenger' && !P.omni && !P.dead && P.hurtT <= 0 && !P.chant && tap('e') && !(P.cds.flashcut > 0)
      && !(typeof ULT !== 'undefined' && ULT && ULT.phase !== 'done') && (!P.act || P.act.t >= P.act.m.cancel)) flashCut()
    baseUpdate(dt)
  }
}
