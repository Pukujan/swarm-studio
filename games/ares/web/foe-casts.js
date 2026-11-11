// ARES foe-casts.js: aimed spells for casters and elite (miniboss) enemies. Loaded after
// boss-spells.js; adds attack kinds to enemies.js (EN_KINDS) and hands them out by enemy type
// at spawn (CASTS), next to the attack in enemies.json. Each has its own telegraph in `wind`:
//
//   firewave   breathes at the floor; the splash splits into fireballs rolling both ways (jump)
//   ricochet   a thin ray that bounces 2-3 times; its path shows as a faint line first
//   saw        a saw rolls along the floor, turns at the edge of the screen once (jump it)
//   discs      two discs fly out and come back (dodge twice; gold: dash through)
//   shards     shards arc over and land on marked spots
//   slowfield  a ring under her that slows her inside it; always followed by another attack
//   sweepbeam  a big beam turns from the sky down to the floor (dash through as it passes)
//
// Warm colours only. PERF.low thins particles and skips the extra layers.
'use strict'

const FOE_CASTS = (() => {
  const TAU = Math.PI * 2
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const rnd = (a, b) => a + Math.random() * (b - a)
  const glowAt = (x, y, r, rgb, a) => { if (typeof FOE !== 'undefined') FOE.glowAt(x, y, r, rgb, a) }
  const f = (name, ...a) => { try { if (typeof FOE !== 'undefined' && FOE[name]) return FOE[name](...a) } catch { } }
  const C = { core: '255,248,236', hot: '255,206,120', body: '255,110,30', glow: '255,70,20', crim: '230,36,40', gold: '255,196,80', ink: '60,20,14' }
  const alive = e => e && !e.dead
  const first = e => { if (e.lock.told) return false; e.lock.told = true; return true }
  // the autoplay hint (see boss-spells.js): a no-look `kind: 'laser'` entry that points the way out
  function hint(until, outDir, tFn) {
    fx.push({ kind: 'laser', x: -1e5, t: 0.2, dur: 99, update() {
      if (until()) { this.t = 99; return }
      const d = outDir(); this.x = d ? P.x - d * 30 : -1e5; this.t = tFn ? tFn() : 0.2
    }, draw() { } })
  }

  // -------------------------------------------------------------- firewave
  // a fireball drawn over a doom orb: the dark core still says "jump it, can't reflect"
  function drawFireball(b) {
    const c = ctx, r = b.r, sp = b.t * 14 * Math.sign(b.vx || 1)
    c.globalCompositeOperation = 'lighter'
    glowAt(b.x, b.y, r * 3.2, C.glow, 0.6); glowAt(b.x - Math.sign(b.vx) * r, b.y - r * 0.3, r * 2.2, C.body, 0.5)
    for (let i = 0; i < (low() ? 2 : 4); i++) { const a = sp + i * TAU / 4; glowAt(b.x + Math.cos(a) * r * 0.9, b.y + Math.sin(a) * r * 0.9, r * 0.9, C.hot, 0.6) }
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = '#2a0608'; c.beginPath(); c.arc(b.x, b.y, r * 0.8, 0, TAU); c.fill()
    c.strokeStyle = 'rgba(255,120,60,0.95)'; c.lineWidth = 2.5; c.beginPath(); c.arc(b.x, b.y, r * 0.85, 0, TAU); c.stroke()
    c.globalCompositeOperation = 'lighter'
    if (!low() && Math.random() < 0.6) parts.push({ x: b.x - Math.sign(b.vx) * r, y: b.y + rnd(-r, r) * 0.5, vx: -b.vx * 0.1, vy: rnd(-90, -30), life: rnd(0.3, 0.6), t: 0, size: rnd(1.5, 3), color: Math.random() < 0.5 ? C.hot : C.body, add: true })
  }
  const firewave = {
    dur: 0.5,
    wind(e, dt, k) {
      // the floor spot it will breathe on glows; flames lick at its mouth
      const dir = e.face, x = clamp(e.x + dir * 160 * enK(e), e.x - 400, e.x + 400), gy = enGround(x, e.y - 20)
      e.lock.fx = x; e.lock.gy = gy === Infinity ? e.y : gy
      if (first(e)) fx.push({ t: 0, dur: e.A.windup, draw(q) { const c = ctx; c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(${C.body},${0.3 + 0.6 * q})`; c.lineWidth = 2 + 3 * q; c.beginPath(); c.ellipse(e.lock.fx, e.lock.gy - 2, 70 - 30 * q, 12 - 4 * q, 0, 0, TAU); c.stroke(); glowAt(e.lock.fx, e.lock.gy - 4, 80, C.glow, 0.4 * q); c.fillStyle = `rgba(${C.hot},${0.3 * q})`; c.fillRect(e.lock.fx - 420, e.lock.gy - 3, 840, 3) } })
      glowAt(e.x + e.face * 30 * enK(e), enEyeY(e), 26 + 30 * k, C.glow, 0.5 * k)
    },
    start(e) {
      const x0 = e.x + e.face * 30 * enK(e), y0 = enEyeY(e), x1 = e.lock.fx, y1 = e.lock.gy
      // the breath: a short cone of flame from the mouth to the floor
      fx.push({ t: 0, dur: 0.4, draw(q) {
        const c = ctx, a = (1 - q)
        c.globalCompositeOperation = 'lighter'
        for (let i = 0; i < (low() ? 4 : 9); i++) { const s = i / 8, x = lerp(x0, x1, s), y = lerp(y0, y1, s); glowAt(x, y, 18 + 50 * s, i % 2 ? C.body : C.hot, 0.7 * a) }
        glowAt(x1, y1 - 10, 120, C.glow, 0.7 * a)
      } })
      f('shock', x1, y1 - 4, 110, { ground: y1, flat: 0.3, col: 'ember' }); f('scorch', x1, y1, 50)
      shake = Math.max(shake, 5); enSfx('boom')
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) later(i * 0.32, () => {
        const b = ebullet(x1 + s * 20, y1 - 15, s > 0 ? 0 : Math.PI, 330 - i * 60, { type: 'doom', r: 15, roll: true, life: 3.2, dmg: enDmg(e, e.A) })
        b.fireball = true; bullets.push(b)
      })
    },
  }

  // -------------------------------------------------------------- ricochet
  // the path: straight from the eye toward her, reflected off the floor, the screen's top and sides
  function bouncePath(x, y, a, n) {
    const pts = [[x, y]], L = cam.x, R_ = cam.x + VW(), Tp = cam.y + 20
    let dx = Math.cos(a), dy = Math.sin(a), left = 2600
    for (let i = 0; i <= n && left > 0; i++) {
      let t = left, hit = null
      if (dy > 0) { const tt = (GROUND - y) / dy; if (tt > 0.5 && tt < t) { t = tt; hit = 'y' } }
      if (dy < 0) { const tt = (Tp - y) / dy; if (tt > 0.5 && tt < t) { t = tt; hit = 'y' } }
      if (dx > 0) { const tt = (R_ - x) / dx; if (tt > 0.5 && tt < t) { t = tt; hit = 'x' } }
      if (dx < 0) { const tt = (L - x) / dx; if (tt > 0.5 && tt < t) { t = tt; hit = 'x' } }
      x += dx * t; y += dy * t; left -= t; pts.push([x, y])
      if (hit === 'y') dy = -dy; else if (hit === 'x') dx = -dx; else break
    }
    return pts
  }
  const nearPath = (pts, px, py) => { let m = 1e9; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return m }
  const ricochet = {
    dur: 0.3,
    wind(e, dt, k) {
      const x = e.x, y = enEyeY(e)
      if (k < 0.6) { const pc = enPC(); e.lock.a = ang(x, y, pc.x, pc.y) }
      e.lock.path = bouncePath(x, y, e.lock.a, 2 + (enElite(e) ? 1 : 0))
      if (first(e)) {
        const lock = e.lock
        fx.push({ t: 0, dur: e.A.windup, draw(q) {
          const p = lock.path; if (!p) return
          const c = ctx
          c.globalCompositeOperation = 'lighter'
          c.strokeStyle = `rgba(${C.hot},${0.15 + 0.4 * q})`; c.lineWidth = 1 + q
          c.setLineDash([8, 10]); c.lineDashOffset = -T * 120
          c.beginPath(); p.forEach((pt, i) => i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1])); c.stroke(); c.setLineDash([])
          for (let i = 1; i < p.length - 1; i++) glowAt(p[i][0], p[i][1], 20 + 20 * q, C.glow, 0.4 * q)
        } })
      }
      glowAt(x, y, 14 + 24 * k, C.crim, 0.6 * k)
    },
    start(e) {
      const p = e.lock.path || bouncePath(e.x, enEyeY(e), e.lock.a, 2), dmg = enDmg(e, e.A)
      enSfx('zap'); shake = Math.max(shake, 3)
      if (nearPath(p, P.x, P.y - 70) < 34 * enK(e) + 18 && !P.dead) {
        if (P.iframe > 0) { if (P.perfect > 0) perfectDodge() } else hurtPlayer(dmg, Math.sign(P.x - e.x) || 1)
      }
      for (let i = 1; i < p.length; i++) f('spatter', p[i][0], p[i][1], Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]), 'crimson')
      fx.push({ t: 0, dur: 0.28, draw(q) {
        const c = ctx
        for (let i = 1; i < p.length; i++) if (typeof FOE !== 'undefined') FOE.beam(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], { w: 12 * enK(e), k: 1 - q, seed: i })
        c.globalCompositeOperation = 'lighter'
        for (let i = 1; i < p.length; i++) glowAt(p[i][0], p[i][1], 40, C.hot, 1 - q)
      } })
    },
  }

  // -------------------------------------------------------------- saw
  function drawSaw(b) {
    const c = ctx, r = b.r, a = b.t * 18 * Math.sign(b.vx || 1)
    c.save(); c.translate(b.x, b.y); c.rotate(a)
    c.globalCompositeOperation = 'lighter'; glowAt(0, 0, r * 2.2, C.glow, 0.5)
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = '#2b1a16'; c.beginPath()
    const n = 10
    for (let i = 0; i < n * 2; i++) { const q = i / (n * 2) * TAU, rr = i % 2 ? r * 0.78 : r * 1.12; i ? c.lineTo(Math.cos(q) * rr, Math.sin(q) * rr) : c.moveTo(Math.cos(q) * rr, Math.sin(q) * rr) }
    c.closePath(); c.fill()
    c.strokeStyle = 'rgba(255,150,70,0.95)'; c.lineWidth = 2; c.stroke()
    c.fillStyle = '#c8962e'; c.beginPath(); c.arc(0, 0, r * 0.3, 0, TAU); c.fill()
    c.restore()
    if (b.roll && Math.random() < (low() ? 0.3 : 0.8)) parts.push({ x: b.x - Math.sign(b.vx) * r * 0.6, y: b.y + r * 0.9, vx: -b.vx * rnd(0.2, 0.6), vy: rnd(-260, -120), life: rnd(0.15, 0.35), t: 0, size: rnd(1.5, 2.5), color: C.hot, add: true, streak: true, g: 1500 })
  }
  const saw = {
    dur: 0.3,
    wind(e, dt, k) {
      if (first(e)) { const dir = e.face, y = e.y; fx.push({ t: 0, dur: e.A.windup, draw(q) { const c = ctx; c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(${C.hot},${0.2 + 0.5 * q})`; c.fillRect(Math.min(e.x, e.x + dir * 900), y - 3, 900, 3); glowAt(e.x + dir * 40, y - 20, 40 * q, C.glow, 0.6 * q) } }) }
      if (Math.random() < 0.5) parts.push({ x: e.x + e.face * 40, y: e.y - 10, vx: rnd(-80, 80), vy: rnd(-200, -80), life: 0.25, t: 0, size: 2, color: C.hot, add: true, streak: true, g: 1200 })
    },
    start(e) {
      const b = ebullet(e.x + e.face * 40, e.y - 22, e.face > 0 ? 0 : Math.PI, 460, { type: 'doom', r: 22, roll: true, life: 4.5, dmg: enDmg(e, e.A) })
      b.saw = true; b.turns = 1; bullets.push(b); enSfx('heavy')
      // it turns back once at the edge of the screen (wait for it to pass, or jump it again)
      fx.push({ t: 0, dur: 4.5, update() { if (b.dead) { this.t = 99; return } if (b.turns > 0 && (b.x < cam.x + 30 || b.x > cam.x + VW() - 30)) { b.turns--; b.vx = -b.vx; f('spatter', b.x, b.y, b.vx > 0 ? Math.PI : 0, 'ember') } }, draw() { } })
    },
  }

  // -------------------------------------------------------------- discs
  function drawDisc(b) {
    const c = ctx, r = b.r
    c.save(); c.translate(b.x, b.y); c.rotate(b.t * 22)
    c.globalCompositeOperation = 'lighter'; glowAt(0, 0, r * 2.4, C.gold, 0.5)
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = '#f2c862'; c.beginPath(); c.ellipse(0, 0, r, r * 0.42, 0, 0, TAU); c.fill()
    c.strokeStyle = '#8a1a14'; c.lineWidth = 2; c.stroke()
    c.fillStyle = '#fff6dc'; c.fillRect(-r * 0.9, -1, r * 1.8, 2)
    c.restore()
  }
  const discs = {
    dur: 0.25,
    wind(e, dt, k) { const y = enEyeY(e); glowAt(e.x - 16, y, 10 + 16 * k, C.gold, 0.8 * k); glowAt(e.x + 16, y, 10 + 16 * k, C.gold, 0.8 * k) },
    start(e) {
      const pc = enPC(), x = e.x, y = enEyeY(e), a = ang(x, y, pc.x, pc.y), out = []
      for (const s of [-1, 1]) { const b = ebullet(x, y, a + s * 0.35, 640, { type: 'heavy', r: 13, life: 3.5, dmg: enDmg(e, e.A) }); b.disc = true; bullets.push(b); out.push(b) }
      enSfx('shot')
      // out for 0.6 s, slow, then home back to the thrower (or where it stood)
      const hx = e.x, hy = y
      fx.push({ t: 0, dur: 3.4, update(dt) {
        for (const b of out) {
          if (b.dead) continue
          const tx = alive(e) ? e.x : hx, ty = alive(e) ? enEyeY(e) : hy
          if (this.t < 0.6) { b.vx *= Math.pow(0.35, dt); b.vy *= Math.pow(0.35, dt) }
          else { const w = ang(b.x, b.y, tx, ty), sp = Math.min(700, Math.hypot(b.vx, b.vy) + 1400 * dt); b.vx = lerp(b.vx, Math.cos(w) * sp, Math.min(1, dt * 5)); b.vy = lerp(b.vy, Math.sin(w) * sp, Math.min(1, dt * 5)); if (Math.hypot(b.x - tx, b.y - ty) < 30) b.dead = true }
        }
      }, draw() { } })
    },
  }

  // -------------------------------------------------------------- shards
  const shards = {
    dur: 0.5,
    wind(e, dt, k) {
      if (first(e)) {
        const n = enElite(e) ? 6 : 4, spots = []
        for (let i = 0; i < n; i++) { const x = clamp(P.x + (i - (n - 1) / 2) * 110 + rnd(-20, 20), cam.x + 40, cam.x + VW() - 40); const g = enGround(x, P.y - 300); spots.push({ x, y: g === Infinity ? GROUND : g }) }
        e.lock.spots = spots
        fx.push({ t: 0, dur: e.A.windup + 1.3, draw() { const c = ctx, q = Math.min(1, this.t / e.A.windup), pulse = 0.6 + 0.4 * Math.sin(T * 24); c.globalCompositeOperation = 'lighter'; for (const s of spots) { if (s.landed) continue; c.strokeStyle = `rgba(${C.crim},${(0.35 + 0.5 * q) * pulse})`; c.lineWidth = 2.5; c.beginPath(); c.ellipse(s.x, s.y - 2, 34, 8, 0, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(s.x - 10, s.y - 2); c.lineTo(s.x + 10, s.y - 2); c.moveTo(s.x, s.y - 6); c.lineTo(s.x, s.y + 2); c.stroke() } } })
      }
      glowAt(e.x, enCY(e) - 30, 20 + 30 * k, C.crim, 0.6 * k)
    },
    start(e) {
      const x0 = e.x, y0 = enCY(e) - 30, g = 1500
      enSfx('shot')
      e.lock.spots.forEach((s, i) => later(i * 0.08, () => {
        const tt = 0.95 + i * 0.05, vx = (s.x - x0) / tt, vy = (s.y - 10 - y0 - 0.5 * g * tt * tt) / tt
        const b = ebullet(x0, y0, 0, 0, { type: 'heavy', r: 10, life: tt + 0.2, dmg: enDmg(e, e.A) }); b.vx = vx; b.vy = vy; b.shard = true; b.spot = s; bullets.push(b)
        fx.push({ t: 0, dur: tt + 0.3, update(dt) { if (!b.dead) b.vy += g * dt; else if (!s.landed) { s.landed = true; f('shock', s.x, s.y - 4, 50, { ground: s.y, flat: 0.3, dur: 0.3 }); if (Math.abs(P.x - s.x) < 38 && Math.abs(P.y - s.y) < 30 && P.iframe <= 0 && !P.dead) hurtPlayer(enDmg(e, e.A), Math.sign(P.x - s.x) || 1) } }, draw() { } })
      }))
    },
  }
  function drawShard(b) {
    const c = ctx, a = Math.atan2(b.vy, b.vx)
    c.save(); c.translate(b.x, b.y); c.rotate(a)
    c.globalCompositeOperation = 'lighter'; glowAt(-6, 0, 22, C.crim, 0.6)
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = '#ffe9d2'; c.beginPath(); c.moveTo(16, 0); c.lineTo(-8, -6); c.lineTo(-4, 0); c.lineTo(-8, 6); c.closePath(); c.fill()
    c.strokeStyle = '#b01822'; c.lineWidth = 1.5; c.stroke()
    c.restore()
  }

  // -------------------------------------------------------------- slow field
  const slowfield = {
    dur: 0.2,
    wind(e, dt, k) { if (first(e)) { e.lock.sx = P.x; e.lock.sy = P.ground ? P.y : enGround(P.x, P.y) } const c = e.lock; glowAt(e.x, enCY(e), 20 + 20 * k, C.gold, 0.5 * k); if (c.sx != null) fx.push({ t: 0, dur: 0.02, draw() { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${C.gold},${0.3 + 0.5 * k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.sx, (c.sy === Infinity ? GROUND : c.sy) - 2, 170 * (0.4 + 0.6 * k), 26 * (0.4 + 0.6 * k), 0, 0, TAU); ctx.stroke() } }) },
    start(e) {
      const x = e.lock.sx, y = e.lock.sy === Infinity ? GROUND : e.lock.sy, r = 170
      enSfx('glare')
      fx.push({ t: 0, dur: 3.2, update() { if (Math.abs(P.x - x) < r && Math.abs(P.y - y) < 140) P.slow = Math.max(P.slow || 0, 0.15) }, draw() {
        const c = ctx, a = Math.min(1, this.t * 4) * Math.min(1, (this.dur - this.t) * 2)
        c.globalCompositeOperation = 'lighter'
        glowAt(x, y - 40, r, C.gold, 0.22 * a)
        c.strokeStyle = `rgba(${C.gold},${0.7 * a})`; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y - 2, r, 26, 0, 0, TAU); c.stroke()
        c.strokeStyle = `rgba(${C.hot},${0.5 * a})`; c.lineWidth = 1.5
        for (let i = 0; i < 3; i++) { const q = (this.t * 0.6 + i / 3) % 1; c.beginPath(); c.ellipse(x, y - 2 - q * 120, r * (1 - q * 0.3), 26 * (1 - q * 0.3), 0, 0, TAU); c.stroke() }
      } })
    },
  }

  // -------------------------------------------------------------- sweep beam
  const sweepbeam = {
    dur: 1.5,
    wind(e, dt, k) {
      const g = typeof enGun === 'function' ? enGun(e) : { x: e.x, y: enEyeY(e) }, up = -Math.PI / 2 + e.face * 0.15, down = e.face > 0 ? 0.32 : Math.PI - 0.32
      if (first(e)) {
        e.lock.a0 = up; e.lock.a1 = down
        fx.push({ t: 0, dur: e.A.windup, draw(q) {
          const c = ctx, gg = typeof enGun === 'function' ? enGun(e) : { x: e.x, y: enEyeY(e) }
          c.globalCompositeOperation = 'lighter'
          // the arc it will sweep, drawn as a fan of faint lines and the end line on the floor
          c.strokeStyle = `rgba(${C.hot},${0.15 + 0.35 * q})`; c.lineWidth = 1.5
          for (let i = 0; i <= 6; i++) { const a = lerp(up, down, i / 6); c.beginPath(); c.moveTo(gg.x, gg.y); c.lineTo(gg.x + Math.cos(a) * 700, gg.y + Math.sin(a) * 700); c.stroke() }
          c.strokeStyle = `rgba(${C.crim},${0.3 + 0.6 * q})`; c.lineWidth = 2.5
          c.beginPath(); c.arc(gg.x, gg.y, 120 + 30 * q, Math.min(up, down), Math.max(up, down)); c.stroke()
        } })
      }
      f('gather', g.x, g.y, enK(e) * 1.2, 'crimson')
    },
    start(e) {
      const lock = e.lock, dur = 1.3, a = t => lerp(lock.a0, lock.a1, Math.min(1, t / dur) ** 1.2)
      const g = () => typeof enGun === 'function' && alive(e) ? enGun(e) : { x: e.x, y: enEyeY(e) }
      const angleToHer = () => { const s = g(); return ang(s.x, s.y, P.x, P.y - 70) }
      let tb = 0
      // the hint asks for a dash just as the beam reaches her
      hint(() => tb > dur || !alive(e), () => { const d = Math.atan2(Math.sin(a(tb) - angleToHer()), Math.cos(a(tb) - angleToHer())); return Math.abs(d) < 0.5 ? (Math.sign(P.x - e.x) || 1) : 0 }, () => { const d = Math.abs(Math.atan2(Math.sin(a(tb) - angleToHer()), Math.cos(a(tb) - angleToHer()))); return d < 0.25 ? 0.6 : 0.2 })
      fx.push({ t: 0, dur, update(dt) { tb = this.t }, draw() { } })
      if (typeof FOE !== 'undefined') FOE.beamFx({ x0: g().x, y0: g().y, a: a(0), len: 1400, dur, w: 28 * enK(e) * (enElite(e) ? 1.2 : 1), src: g, angle: t => a(t), hit: (x0, y0, x1, y1) => { if (!P.dead && segDist(P.x, P.y - 70, x0, y0, x1, y1) < 40 * enK(e)) { if (P.iframe > 0) { if (P.perfect > 0) perfectDodge() } else hurtPlayer(enDmg(e, e.A), e.face) } } })
      enSfx('zap'); shake = Math.max(shake, 4)
    },
  }

  // -------------------------------------------------------------- wiring
  const KINDS = { firewave, ricochet, saw, discs, shards, slowfield, sweepbeam }
  const DEF = {
    firewave: { range: 520, windup: 0.75, every: 3.2, dmg: 12 }, ricochet: { range: 900, windup: 0.85, every: 3.2 },
    saw: { range: 900, windup: 0.6, every: 3.4 }, discs: { range: 700, windup: 0.5, every: 3.0 },
    shards: { range: 800, windup: 0.8, every: 3.0 }, slowfield: { range: 700, windup: 0.6, every: 0.4 },   // short: the next attack follows at once
    sweepbeam: { range: 900, windup: 0.9, every: 3.6 },
  }
  const REC = { firewave: 0.8, ricochet: 0.6, saw: 0.7, discs: 0.6, shards: 0.6, slowfield: 0.15, sweepbeam: 0.9 }
  // who gets which (next to their own attack from enemies.json)
  const CASTS = {
    caster: ['ricochet'], caster_ring: ['shards'], caster_elite: ['slowfield', 'sweepbeam', 'ricochet'],
    sentry_spiral: ['shards'], sentry_elite: ['discs'], gunner_elite: ['discs'], drone_elite: ['ricochet'],
    shield_elite: ['firewave'], hopper_elite: ['saw'], grunt_elite: ['firewave'], hound_elite: ['saw'],
  }
  if (typeof EN_KINDS !== 'undefined') Object.assign(EN_KINDS, KINDS)
  if (typeof EN_KIND_DEF !== 'undefined') Object.assign(EN_KIND_DEF, DEF)
  if (typeof EN_REC !== 'undefined') Object.assign(EN_REC, REC)
  if (typeof EN_RANGED !== 'undefined') for (const k of ['ricochet', 'discs', 'shards', 'sweepbeam', 'slowfield']) EN_RANGED.add(k)
  if (typeof enAttacks === 'function') {
    const core = enAttacks
    window.enAttacks = function (e) {
      const list = core(e), more = CASTS[e.type]
      if (!more || window.NOCASTS) return list
      return list.concat(more.map(k => ({ ...DEF[k], kind: k, dmg: (e.def && e.def.dmg) || 10 })))
    }
  }
  if (typeof drawBullet === 'function') {
    const coreDraw = drawBullet
    window.drawBullet = function (b) {
      if (b && b.enemy) { if (b.fireball) return drawFireball(b); if (b.saw) return drawSaw(b); if (b.disc) return drawDisc(b); if (b.shard) return drawShard(b) }
      return coreDraw(b)
    }
  }
  return { kinds: KINDS, casts: CASTS }
})()
