// ARES foe-fx.js: the effects behind enemy and boss attacks (FOE). Beams with a charge
// telegraph, bullet trails and muzzle flashes, melee swipes, shockwaves, armour flashes and
// impact bursts. Loaded after enemies.js; enemies.js and boss.js call it through their own
// guarded helpers, so the game runs without it.
//
// Colours stay crimson, gold, warm orange and white-hot. Everything is cached: the beam layers
// are a few tiny gradient strips and one noise tile, stretched with drawImage; nothing reads
// pixels back. PERF.low thins particles and skips the noise layer.
//
//   FOE.beam(x0, y0, x1, y1, {w, k, col, flow, seed, end})   draw one beam (inside a draw)
//   FOE.charge(x0, y0, a, len, k, {w, col})                  draw the charge telegraph
//   FOE.gather(x, y, r, col)                                 spawn one gathering mote (per frame)
//   FOE.clip(x0, y0, a, len) -> {x, y, len, hit}             where a beam meets floor or wall
//   FOE.spatter(x, y, a)                                     sparks where a beam is hitting
//   FOE.scorch(x, y, r)                                      a burnt, glowing mark on the floor
//   FOE.embers(x0, y0, x1, y1, n)                            embers left along a faded beam
//   FOE.beamFx({x0, y0, a, len, dur, w, col, owner, hit})    a whole beam as an fx entry
//   FOE.muzzle(x, y, a, col, s)  FOE.swipe(x, y, face, reach, o)  FOE.shock(x, y, r, o)
//   FOE.tell(x, y, dur, s)  FOE.rim(x, y, rx, ry, k, col)  FOE.impact(x, y, dir, power)
'use strict'

const FOE = (() => {
  const TAU = Math.PI * 2
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const rnd = (a, b) => a + Math.random() * (b - a)
  const easeOut = k => 1 - (1 - k) * (1 - k)
  const PAL = {
    crimson: { glow: '210,24,30', body: '230,40,36', hot: '255,244,228', spark: '255,150,90', ink: '110,0,14' },
    gold: { glow: '255,120,24', body: '255,192,84', hot: '255,250,236', spark: '255,215,130', ink: '120,50,0' },
    ember: { glow: '230,70,20', body: '255,140,60', hot: '255,236,200', spark: '255,170,90', ink: '110,30,0' },
  }
  const pal = c => PAL[c] || PAL.crimson

  // -------------------------------------------------------------- cached sprites
  const cache = {}
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  // a 2 x 64 vertical gradient: clear at the edges, `a` in the middle (stretched along a beam)
  function strip(rgb, a, flat) {
    const key = 's' + rgb + a + (flat ? 'f' : '')
    if (cache[key]) return cache[key]
    const c = mk(2, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64)
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(flat ? 0.22 : 0.3, `rgba(${rgb},${a * 0.55})`)
    gr.addColorStop(0.5, `rgba(${rgb},${a})`); gr.addColorStop(flat ? 0.78 : 0.7, `rgba(${rgb},${a * 0.55})`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.fillRect(0, 0, 2, 64)
    return (cache[key] = c)
  }
  // a soft round glow, 64 x 64
  function glow(rgb) {
    const key = 'g' + rgb
    if (cache[key]) return cache[key]
    const c = mk(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.3, `rgba(${rgb},0.45)`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
    return (cache[key] = c)
  }
  // flowing light: streaks that tile left to right, scrolled along the beam
  function noise() {
    if (cache.noise) return cache.noise
    const c = mk(256, 64), g = c.getContext('2d')
    for (let i = 0; i < 46; i++) {
      const x = rnd(0, 256), y = 32 + rnd(-1, 1) * rnd(0, 26), rx = rnd(12, 70), ry = rnd(1.2, 5), a = rnd(0.12, 0.5)
      g.fillStyle = `rgba(255,${(rnd(200, 245)) | 0},${(rnd(170, 220)) | 0},${a})`
      for (const o of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + o, y, rx, ry, 0, 0, TAU); g.fill() }
    }
    return (cache.noise = c)
  }
  // a tapered comet tail, head at the right edge (for bullet trails)
  function comet(col) {
    const key = 'c' + col
    if (cache[key]) return cache[key]
    const p = pal(col), c = mk(128, 32), g = c.getContext('2d')
    const gr = g.createLinearGradient(0, 0, 128, 0)
    gr.addColorStop(0, `rgba(${p.body},0)`); gr.addColorStop(0.65, `rgba(${p.body},0.35)`); gr.addColorStop(1, `rgba(${p.body},0.85)`)
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(80, 4, 122, 5); g.arc(118, 16, 11, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(80, 28, 0, 16); g.fill()
    const gh = g.createLinearGradient(40, 0, 128, 0); gh.addColorStop(0, `rgba(${p.hot},0)`); gh.addColorStop(1, `rgba(${p.hot},0.9)`)
    g.fillStyle = gh; g.beginPath(); g.moveTo(40, 16); g.quadraticCurveTo(90, 11, 120, 12); g.lineTo(120, 20); g.quadraticCurveTo(90, 21, 40, 16); g.fill()
    return (cache[key] = c)
  }
  function glowAt(x, y, r, rgb, a) {
    if (r <= 0 || a <= 0) return
    const c = ctx, ga = c.globalAlpha
    c.globalAlpha = Math.min(1, a) * ga; c.drawImage(glow(rgb), x - r, y - r, r * 2, r * 2); c.globalAlpha = ga
  }
  const push = p => { if (typeof parts !== 'undefined') parts.push(p) }

  // -------------------------------------------------------------- beams
  // the layered beam itself: outer glow, coloured body, flowing streaks, white-hot core
  function beam(x0, y0, x1, y1, o = {}) {
    const c = ctx, L = Math.hypot(x1 - x0, y1 - y0)
    if (L < 2) return
    const k = o.k ?? 1, p = pal(o.col), seed = o.seed || 0
    const fl = 1 + 0.1 * Math.sin(T * 63 + seed) + 0.07 * Math.sin(T * 101 + seed * 1.7)
    const w = (o.w || 26) * k * fl
    if (w < 0.5) return
    c.save(); c.translate(x0, y0); c.rotate(Math.atan2(y1 - y0, x1 - x0))
    const a0 = c.globalAlpha
    // a dark crimson ink under the light, so the beam reads as red on a bright sky
    c.globalCompositeOperation = 'source-over'
    c.globalAlpha = a0 * 0.55; c.drawImage(strip(p.ink, 0.8), 0, -w * 1.5, L, w * 3)
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = a0 * 0.6; c.drawImage(strip(p.glow, 0.5), 0, -w * 2, L, w * 4)
    c.globalAlpha = a0 * 0.95; c.drawImage(strip(p.body, 0.9, true), 0, -w * 0.72, L, w * 1.44)
    if (!low()) {
      const th = w * 1.15, tw = 256 * th / 64 * 2.6, off = -((T * (o.flow || 1500) + seed * 97) % tw), tex = noise()
      c.globalAlpha = a0 * 0.7
      for (let x = off; x < L; x += tw) {
        const d0 = Math.max(0, x), d1 = Math.min(L, x + tw)
        if (d1 - d0 < 1) continue
        c.drawImage(tex, (d0 - x) / tw * 256, 0, (d1 - d0) / tw * 256, 64, d0, -th / 2, d1 - d0, th)
      }
    }
    c.globalAlpha = a0; c.drawImage(strip(p.hot, 1, true), 0, -w * 0.18, L, w * 0.36)
    // the source and the far end flare
    glowAt(0, 0, w * 2.6, p.body, 0.9); glowAt(0, 0, w * 1.1, p.hot, 1)
    if (o.end) { glowAt(L, 0, w * 2.4, p.body, 0.85); glowAt(L, 0, w * 0.9, p.hot, 0.9) }
    c.restore()
  }

  // the charge: a thin aim line that brightens, a lane that shows the beam's width, a glow that
  // grows at the source and a ring closing on it. k runs 0..1 over the wind-up.
  function charge(x0, y0, a, len, k, o = {}) {
    const c = ctx, p = pal(o.col), w = o.w || 26
    c.save(); c.globalCompositeOperation = 'lighter'
    c.translate(x0, y0); c.rotate(a)
    if (k > 0.5) { const q = (k - 0.5) / 0.5; c.globalAlpha = 0.07 + 0.1 * q * (0.6 + 0.4 * Math.sin(T * 30)); c.drawImage(strip(p.body, 1, true), 0, -w * 0.75, len, w * 1.5) }
    const lw = 0.8 + 2.2 * k * k, flick = k > 0.8 ? (Math.sin(T * 75) > 0 ? 1 : 0.5) : 1
    c.globalAlpha = (0.18 + 0.75 * k * k) * flick
    c.drawImage(strip(k > 0.7 ? p.hot : p.body, 1, true), 0, -lw * 1.5, len, lw * 3)
    // bright dashes running out along the line, faster as it fills
    const sp = 500 + 2200 * k
    c.globalAlpha = 0.35 + 0.5 * k
    for (let i = 0; i < 3; i++) { const px = (T * sp + i * len / 3) % len; c.drawImage(strip(p.hot, 1), px, -lw * 2, 40 + 60 * k, lw * 4) }
    c.restore()
    c.save(); c.globalCompositeOperation = 'lighter'
    glowAt(x0, y0, 10 + 40 * k * (0.9 + 0.1 * Math.sin(T * 40)), p.body, 0.35 + 0.6 * k)
    glowAt(x0, y0, 4 + 12 * k, p.hot, 0.4 + 0.6 * k)
    c.strokeStyle = `rgba(${p.hot},${0.25 + 0.6 * k})`; c.lineWidth = 1 + 2 * k
    c.beginPath(); c.arc(x0, y0, 8 + (1 - k) * 64, 0, TAU); c.stroke()
    if (k > 0.85) {   // last instant: a four-point glint
      const s = 22 + 30 * (k - 0.85) / 0.15
      c.fillStyle = `rgba(${p.hot},0.9)`
      c.beginPath(); c.moveTo(x0 - s, y0); c.lineTo(x0, y0 - 2); c.lineTo(x0 + s, y0); c.lineTo(x0, y0 + 2); c.fill()
      c.beginPath(); c.moveTo(x0, y0 - s * 0.7); c.lineTo(x0 + 2, y0); c.lineTo(x0, y0 + s * 0.7); c.lineTo(x0 - 2, y0); c.fill()
    }
    c.restore()
  }

  // one mote drifting into the source; call each frame of a wind-up
  function gather(x, y, r = 1, col) {
    if (Math.random() > (low() ? 0.3 : 0.75)) return
    const p = pal(col), a = rnd(0, TAU), d = rnd(55, 110) * r, life = rnd(0.2, 0.34)
    push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d / life, vy: -Math.sin(a) * d / life, life, t: 0, size: rnd(1.5, 3), color: Math.random() < 0.5 ? p.hot : p.spark, add: true, streak: true })
  }

  // march along the beam until it meets a walk line from above, a wall or a column
  function clip(x0, y0, a, len) {
    const dx = Math.cos(a), dy = Math.sin(a), step = 18
    let px = x0, py = y0
    for (let d = step; d <= len; d += step) {
      const x = x0 + dx * d, y = y0 + dy * d
      if (dy > 0.02 && typeof groundAt === 'function') {
        const g = groundAt(x, py - 1)
        if (g < Infinity && y >= g) { const back = (y - g) / Math.max(0.05, dy); return { x: x - dx * back, y: g, len: d - back, hit: 'floor' } }
      } else if (y >= GROUND && dy > 0) return { x, y: GROUND, len: d, hit: 'floor' }
      if (typeof plats !== 'undefined') for (const p of plats) if (!p.broken && (p.role === 'wall' || p.role === 'column') && x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) return { x, y, len: d, hit: 'wall' }
      px = x; py = y
    }
    return { x: x0 + dx * len, y: y0 + dy * len, len, hit: null }
  }

  // sparks kicking off where a beam is hitting (call each frame)
  function spatter(x, y, a, col) {
    const p = pal(col), n = low() ? 1 : 2
    for (let i = 0; i < n; i++) {
      const b = a + Math.PI + rnd(-1.1, 1.1), s = rnd(220, 620)
      push({ x, y, vx: Math.cos(b) * s, vy: Math.sin(b) * s - 160, life: rnd(0.18, 0.42), t: 0, size: rnd(1.5, 3), color: Math.random() < 0.4 ? p.hot : p.spark, add: true, streak: true, g: 1500 })
    }
    if (Math.random() < (low() ? 0.1 : 0.3)) push({ x: x + rnd(-10, 10), y: y - 4, vx: rnd(-40, 40), vy: rnd(-90, -40), life: rnd(0.4, 0.7), t: 0, size: rnd(6, 11), color: '70,40,34', smoke: true })
  }

  // a burnt mark that glows for a moment
  function scorch(x, y, r = 46) {
    if (typeof decals !== 'undefined') decals.push({ x, y, r, t: 4, max: 4 })
    if (typeof fx !== 'undefined') fx.push({ t: 0, dur: 1.4, draw(k) {
      ctx.globalCompositeOperation = 'lighter'
      const a = (1 - k) * (1 - k)
      ctx.globalAlpha = a; ctx.drawImage(glow('255,110,40'), x - r, y - r * 0.28, r * 2, r * 0.56)
      ctx.globalAlpha = a * 0.8; ctx.drawImage(glow('255,220,170'), x - r * 0.35, y - r * 0.1, r * 0.7, r * 0.2)
    } })
  }

  function embers(x0, y0, x1, y1, n = 10) {
    if (low()) n = Math.ceil(n / 3)
    for (let i = 0; i < n; i++) {
      const q = Math.random()
      push({ x: lerp(x0, x1, q) + rnd(-6, 6), y: lerp(y0, y1, q) + rnd(-6, 6), vx: rnd(-30, 30), vy: rnd(-90, -20), life: rnd(0.5, 1.1), t: 0, size: rnd(1.4, 2.8), color: Math.random() < 0.5 ? '255,180,90' : '255,120,60', add: true })
    }
  }

  // a whole beam as an fx entry: pops on, holds with spatter at the end, fades to embers.
  // o.src() can return the live source {x, y} (else the beam stays where it was fired);
  // o.angle(t) can turn it; o.hit(x0, y0, x1, y1) is called each frame while it can hurt.
  function beamFx(o) {
    const hold = o.dur || 0.4, fade = 0.32, col = o.col || 'crimson', seed = Math.random() * 10
    let lastScorch = -1
    return { t: 0, dur: hold + fade, boss: !!o.boss, kind: o.kind, x: o.x, update(dt) {
      const s = o.src ? o.src() : null, x0 = s ? s.x : o.x0, y0 = s ? s.y : o.y0, a = o.angle ? o.angle(this.t) : o.a
      const e = clip(x0, y0, a, o.len)
      this.seg = { x0, y0, a, e }
      if (this.t < hold) {
        if (e.hit) {
          spatter(e.x, e.y, a, col)
          if (this.t - lastScorch > (o.angle ? 0.09 : 9) && e.hit === 'floor') { lastScorch = this.t; scorch(e.x, e.y, o.angle ? 34 : 50) }
        }
        if (o.hit) o.hit(x0, y0, e.x, e.y)
      } else if (!this.faded) { this.faded = true; embers(x0, y0, e.x, e.y, 14) }
    }, draw() {
      if (!this.seg) return
      const { x0, y0, e } = this.seg, t = this.t
      const k = t < 0.05 ? 0.4 + 12 * t : t < hold ? 1 : Math.max(0, 1 - (t - hold) / fade)
      const w = (o.w || 26) * (t < hold ? 1 : 0.6 + 0.4 * k)
      beam(x0, y0, e.x, e.y, { w, k: t < hold ? Math.min(1, k) : k * k, col, seed, end: !!e.hit })
      if (t < 0.12) { ctx.globalCompositeOperation = 'lighter'; glowAt(x0, y0, (o.w || 26) * 4 * (1 - t / 0.12), pal(col).hot, 0.8) }
    } }
  }

  // -------------------------------------------------------------- small attack effects
  function muzzle(x, y, a, col, s = 1) {
    if (typeof fx === 'undefined') return
    const p = pal(col)
    fx.push({ t: 0, dur: 0.11, draw(k) {
      const c = ctx, q = 1 - k
      c.globalCompositeOperation = 'lighter'
      glowAt(x, y, 26 * s * (0.6 + 0.4 * q), p.body, q)
      c.translate(x, y); c.rotate(a); c.fillStyle = `rgba(${p.hot},${q})`
      const l = 30 * s * (0.5 + k), h = 4 * s * q
      c.beginPath(); c.moveTo(-l * 0.25, 0); c.lineTo(0, -h); c.lineTo(l, 0); c.lineTo(0, h); c.fill()
      c.beginPath(); c.moveTo(0, -l * 0.35); c.lineTo(h * 0.6, 0); c.lineTo(0, l * 0.35); c.lineTo(-h * 0.6, 0); c.fill()
    } })
  }

  // a melee crescent: a crimson sweep with a hot edge (the painted slash when FXK is there)
  function swipe(x, y, face, reach, o = {}) {
    if (typeof fx === 'undefined') return
    const p = pal(o.col)
    let painted = false
    if (typeof FXK !== 'undefined' && FXK.slash) try { FXK.slash(x + face * reach * 0.35, y, face > 0 ? -0.25 : Math.PI + 0.25, reach * 1.5, { color: 'crimson', heavy: !!o.heavy, flip: face < 0 }); painted = true } catch { }
    fx.push({ t: 0, dur: 0.2, draw(k) {
      const c = ctx, pr = easeOut(Math.min(1, k * 1.8)), q = 1 - k, r = reach * 0.85
      c.globalCompositeOperation = 'lighter'
      c.translate(x - face * reach * 0.15, y); c.scale(face, 1)
      const a0 = -1.25, a1 = lerp(a0, 1.0, pr)
      if (!painted) { c.strokeStyle = `rgba(${p.body},${0.7 * q})`; c.lineWidth = 18 * q + 2; c.beginPath(); c.arc(0, 0, r, a0, a1); c.stroke() }
      c.strokeStyle = `rgba(${p.hot},${q})`; c.lineWidth = 3.5 * q + 1; c.beginPath(); c.arc(0, 0, r + 6, Math.max(a0, a1 - 1.1), a1); c.stroke()
    } })
  }

  // a push-back shockwave: flash, two rings, radial streaks, dust on the floor
  function shock(x, y, r, o = {}) {
    if (typeof fx === 'undefined') return
    const p = pal(o.col), dur = o.dur || 0.42
    fx.push({ t: 0, dur, draw(k) {
      const c = ctx, e = easeOut(k), q = 1 - k
      c.globalCompositeOperation = 'lighter'
      if (k < 0.3) glowAt(x, y, r * (0.5 + e), p.body, (0.3 - k) * 2.4)
      c.strokeStyle = `rgba(${p.body},${0.85 * q})`; c.lineWidth = 26 * q + 2
      c.beginPath(); c.ellipse(x, y, r * e, r * e * (o.flat || 1), 0, 0, TAU); c.stroke()
      c.strokeStyle = `rgba(${p.hot},${q})`; c.lineWidth = 3 * q + 1
      c.beginPath(); c.ellipse(x, y, r * e * 0.98, r * e * (o.flat || 1) * 0.98, 0, 0, TAU); c.stroke()
      const k2 = Math.max(0, (k - 0.12) / 0.88)
      if (k2 > 0) { c.strokeStyle = `rgba(${p.spark},${0.5 * (1 - k2)})`; c.lineWidth = 8 * (1 - k2) + 1; c.beginPath(); c.ellipse(x, y, r * 0.75 * easeOut(k2), r * 0.75 * easeOut(k2) * (o.flat || 1), 0, 0, TAU); c.stroke() }
    } })
    const n = low() ? 6 : 14
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd(-0.15, 0.15), s = rnd(500, 900)
      push({ x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s * (o.flat || 1), life: rnd(0.15, 0.28), t: 0, size: rnd(2, 3.5), color: i % 3 ? p.spark : p.hot, add: true, streak: true })
    }
    if (o.ground != null) {
      if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(x, o.ground, low() ? 2 : 4, { color: 'dust', spread: r * 0.6 }) } catch { }
      fx.push({ t: 0, dur: 0.5, draw(k) { const c = ctx; c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(${p.spark},${0.7 * (1 - k)})`; c.lineWidth = 6 * (1 - k) + 1; c.beginPath(); c.ellipse(x, o.ground - 2, r * 1.2 * easeOut(k), 14 * easeOut(k) + 4, 0, 0, TAU); c.stroke() } })
    }
  }

  // the short tell before a counter: a star glint and a ring closing in, over `dur` seconds
  function tell(x, y, dur, s = 1, col = 'gold') {
    if (typeof fx === 'undefined') return
    const p = pal(col)
    fx.push({ t: 0, dur, draw(k) {
      const c = ctx, q = Math.sin(Math.PI * Math.min(1, k * 1.15))
      c.globalCompositeOperation = 'lighter'
      glowAt(x, y, 34 * s * (0.6 + q), p.body, 0.55 * q)
      const l = 46 * s * q, h = 3 * s
      c.fillStyle = `rgba(${p.hot},${q})`
      c.beginPath(); c.moveTo(x - l, y); c.lineTo(x, y - h); c.lineTo(x + l, y); c.lineTo(x, y + h); c.fill()
      c.beginPath(); c.moveTo(x, y - l * 0.6); c.lineTo(x + h, y); c.lineTo(x, y + l * 0.6); c.lineTo(x - h, y); c.fill()
      c.strokeStyle = `rgba(${p.body},${0.3 + 0.6 * k})`; c.lineWidth = 2 + 2 * k
      c.beginPath(); c.arc(x, y, 12 + 90 * s * (1 - k), 0, TAU); c.stroke()
    } })
  }

  // an armour shimmer around a body (call inside a draw while the guard is up)
  function rim(x, y, rx, ry, k = 1, col = 'gold') {
    const c = ctx, p = pal(col), pulse = 0.65 + 0.35 * Math.sin(T * 24)
    c.save(); c.globalCompositeOperation = 'lighter'
    c.globalAlpha = 0.5 * k * pulse; c.drawImage(glow(p.body), x - rx * 1.3, y - ry * 1.3, rx * 2.6, ry * 2.6)
    c.globalAlpha = 1
    c.strokeStyle = `rgba(${p.hot},${0.55 * k * pulse})`; c.lineWidth = 2
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.stroke()
    // plates of light turning around it
    c.strokeStyle = `rgba(${p.body},${0.8 * k})`; c.lineWidth = 4
    for (let i = 0; i < 3; i++) { const a = T * 3 + i * TAU / 3; c.beginPath(); c.ellipse(x, y, rx * 1.08, ry * 1.08, 0, a, a + 0.7); c.stroke() }
    c.restore()
  }

  // a hit landing on the heroine
  function impact(x, y, dir, power = 1) {
    if (typeof FXK !== 'undefined' && FXK.hit) try { FXK.hit(x, y, dir, Math.min(3, power)) } catch { }
    const n = low() ? 4 : 9
    for (let i = 0; i < n; i++) { const a = (dir > 0 ? 0 : Math.PI) + rnd(-1, 1), s = rnd(200, 560); push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rnd(0.15, 0.35), t: 0, size: rnd(2, 3.5), color: i % 2 ? '255,150,90' : '255,240,220', add: true, streak: true }) }
  }

  // -------------------------------------------------------------- enemy bullets: trails and a flash where they leave
  const mz = []
  function trail(b) {
    if (b.type === 'doom') return
    const sp = Math.hypot(b.vx, b.vy)
    if (b.ox === undefined) {
      b.ox = b.x; b.oy = b.y
      let near = false
      for (const m of mz) if (T - m.t < 0.06 && Math.abs(m.x - b.x) < 34 && Math.abs(m.y - b.y) < 34) { near = true; break }
      if (!near && typeof cam !== 'undefined' && b.y > cam.y) { mz.push({ x: b.x, y: b.y, t: T }); if (mz.length > 10) mz.shift(); muzzle(b.x, b.y, Math.atan2(b.vy, b.vx), b.type === 'heavy' ? 'gold' : 'crimson', b.r / 9) }
    }
    if (sp < 40) return
    const c = ctx, len = Math.min(150, 18 + sp * 0.12) * Math.max(0.7, b.r / 9), h = b.r * 2.6
    c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx))
    c.globalAlpha = Math.min(1, b.t * 14) * 0.9
    c.drawImage(comet(b.type === 'heavy' ? 'gold' : 'crimson'), -len, -h / 2, len + b.r * 0.7, h)
    c.restore()
  }
  if (typeof drawBullet === 'function') {
    const coreDrawBullet = drawBullet
    window.drawBullet = function (b) {
      if (b && b.enemy) try { trail(b) } catch (err) { if (!trail.w) { trail.w = 1; console.warn('FOE trail', err) } }
      coreDrawBullet(b)
    }
  }

  return { beam, charge, gather, clip, spatter, scorch, embers, beamFx, muzzle, swipe, shock, tell, rim, impact, glowAt, pal }
})()
