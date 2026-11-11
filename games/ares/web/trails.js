// ARES sword trails for Baker (hero id `messenger`), layered on the core like moves.js.
//
// Every swing samples the blade (tip and an inner radius) each frame, with a few sub-steps
// computed from the swing curve itself, and keeps a short history. That history is drawn as a
// tapered ribbon with additive glow, a white-hot core on the leading edge and alpha that fades
// with age. Each move has a style:
//
//   molten  light chain 1-3, heavies, dash cut: wide gold-orange ribbon, sparks fling off the
//           tangent and fall with gravity; it widens with each hit of the chain
//   bleed   sword wave, special rend, charged slash: molten plus crimson drips that fall away
//   star    spin: a thin bright streak around her with star glints that pop and linger
//   dust    launcher, air chain, slam: a crimson ribbon that breaks into drifting dust motes
//   dark    counter: a white-gold flash over a deep crimson-black smoky edge
//
// Hook for boons: TRAIL.tier (1-3), or the `blade` boon (TRAIL.level() reads both). Higher tiers add sparks and life; tier 3 adds a second,
// echo ribbon. PERF.low: fewer particles, no sub-steps, no echo.
// Colours: gold, white-hot, orange, crimson, rose. Never blue, purple or green.

const TRAIL = {
  tier: 1, on: true, painted: false,   // painted: also draw the FXK painted crescent under the ribbon
  now: 0, swings: [], motes: [], lastAct: null,
}

{
  const low = () => typeof PERF !== 'undefined' && PERF.low
  // the sword level: TRAIL.tier, raised by the `blade` boon (thousand.js adds it to BOONS)
  const tier = () => clamp(Math.max(Math.round(TRAIL.tier || 1), 1 + (typeof nB === 'function' ? nB('blade') : 0)), 1, 3)
  TRAIL.level = tier
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3)
  const STY = {
    molten: { life: 0.27, inner: 0.42, glow: '255,110,30', body0: '220,70,25', body1: '255,175,60', core: '255,250,235', sparks: 70 },
    bleed: { life: 0.32, inner: 0.4, glow: '255,90,50', body0: '170,20,35', body1: '255,180,80', core: '255,248,230', sparks: 50, drips: 60, under: '190,20,40' },
    star: { life: 0.17, inner: 0.82, glow: '255,190,120', body0: '255,150,110', body1: '255,236,180', core: '255,255,250', glints: 40 },
    dust: { life: 0.3, inner: 0.5, glow: '220,50,60', body0: '150,20,35', body1: '255,140,130', core: '255,225,215', motes: 90 },
    dark: { life: 0.34, inner: 0.35, glow: '255,150,90', body0: '200,60,40', body1: '255,205,130', core: '255,255,255', smoke: true, sparks: 50 },
  }
  const MOVE_STYLE = {
    slash1: 'molten', slash2: 'molten', slash3: 'molten', heavy1: 'molten', heavy2: 'molten', thunder: 'molten', dashslash: 'molten',
    charge: 'bleed', wave: 'bleed', rend: 'bleed',
    launch: 'dust', air1: 'dust', air2: 'dust', slam: 'dust',
    spin: 'star', counter: 'dark',
  }
  // the light chain gets wider each hit
  const WIDEN = { slash1: 1, slash2: 1.25, slash3: 1.6, heavy1: 1.3, heavy2: 1.4, thunder: 1.5, charge: 1.5 }
  // moves without an arc of their own still swing the blade
  const NO_ARC = {
    wave: { r: 175, a0: -2.5, a1: 1.15, w: 50, at: 0.07, sweep: 0.11 },
    rend: { r: 185, a0: -2.6, a1: 1.2, w: 54, at: 0.07, sweep: 0.11 },
  }

  // a swing: pivot follows her, the angle runs a0 -> a1 over `sweep` seconds
  function swing(name, a, o = {}) {
    const st = STY[o.style || MOVE_STYLE[name] || 'molten']
    const hit = MOVES.messenger[name]?.hits?.[0]
    const sweep = o.sweep || a.sweep || clamp(hit ? (hit.t1 - hit.t0) * 0.75 : 0.1, 0.07, 0.16)
    const s = {
      name, st, a, face: o.face ?? P.face, act: o.free ? null : P.act, free: !!o.free, t: 0, sweep,
      dur: o.dur || sweep, w: (a.w || 30) * (WIDEN[name] || 1) * (o.widen || 1),
      pivot: o.pivot || (() => ({ x: P.x + this_face() * 40, y: P.y - 95 })),
      angle: o.angle || (t => lerp(a.a0, a.a1, ease(t / sweep))),
      rad: o.rad || (() => a.r * 1.08), ellipse: o.ellipse || 1,
      pts: [], done: false, emit: 0,
    }
    function this_face() { return s.face }
    TRAIL.swings.push(s)
    sample(s, 0)
    return s
  }
  function point(s, t, pv) {
    const ang_ = s.angle(t), r = s.rad(t)
    const cx = Math.cos(ang_), cy = Math.sin(ang_) * s.ellipse
    return { tx: pv.x + s.face * cx * r, ty: pv.y + cy * r, ix: pv.x + s.face * cx * r * s.st.inner, iy: pv.y + cy * r * s.st.inner, px: pv.x, py: pv.y, b: TRAIL.now, ang: ang_ }
  }
  function sample(s, dt) {
    const pv = s.pivot()
    const last = s.lastPv || pv, t0 = s.t - dt
    const n = low() || dt === 0 ? 1 : 4
    for (let i = 1; i <= n; i++) {
      const f = i / n, t = t0 + dt * f
      const p = point(s, Math.min(t, s.dur), { x: lerp(last.x, pv.x, f), y: lerp(last.y, pv.y, f) })
      p.b = TRAIL.now - dt * (1 - f)
      s.pts.push(p)
    }
    s.lastPv = pv
  }

  // particles: sparks, drips, glints, motes, smoke
  const cap = () => (low() ? 90 : 360)
  function mote(m) { if (TRAIL.motes.length < cap()) TRAIL.motes.push(Object.assign({ t: 0, vx: 0, vy: 0, g: 0, drag: 0 }, m)) }
  function emitFor(s, dt) {
    const st = s.st, tr = tier(), mul = (low() ? 0.4 : 1) * (1 + (tr - 1) * 0.6)
    const n = s.pts.length; if (n < 2) return
    const p = s.pts[n - 1], q = s.pts[Math.max(0, n - 3)]
    let tx = p.tx - q.tx, ty = p.ty - q.ty; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl
    const along = () => { const k = Math.random() ** 0.6; return { x: lerp(p.ix, p.tx, k), y: lerp(p.iy, p.ty, k) } }
    const count = rate => { s.emit += rate * mul * dt; const c = s.emit | 0; s.emit -= c; return c }
    if (st.sparks) for (let i = count(st.sparks * (s.w / 30)); i > 0; i--) {
      const sp = R(320, 820)
      mote({ kind: 'spark', x: p.tx + R(-6, 6), y: p.ty + R(-6, 6), vx: tx * sp + R(-90, 90), vy: ty * sp + R(-160, 40), g: 1700, life: R(0.22, 0.5) * (1 + (tr - 1) * 0.2), size: R(1.4, 2.8), col: Math.random() < 0.4 ? '255,250,225' : '255,190,90' })
    }
    if (st.drips) for (let i = count(st.drips); i > 0; i--) {
      const a = along()
      mote({ kind: 'drip', x: a.x, y: a.y, vx: tx * R(40, 140), vy: R(-40, 60), g: 1100, life: R(0.5, 0.9), size: R(2, 3.8), col: Math.random() < 0.3 ? '255,90,80' : '215,25,45' })
    }
    if (st.glints) for (let i = count(st.glints); i > 0; i--) {
      const j = s.pts[(Math.random() * n) | 0]
      mote({ kind: 'glint', x: j.tx + R(-10, 10), y: j.ty + R(-10, 10), vx: R(-20, 20), vy: R(-30, 10), life: R(0.32, 0.6) * (1 + (tr - 1) * 0.25), size: R(6, 14) * (Math.random() < 0.15 ? 1.7 : 1), rot: R(0, 1), col: ['255,255,250', '255,225,160', '255,180,190'][(Math.random() * 3) | 0] })
    }
    if (st.motes) for (let i = count(st.motes); i > 0; i--) {
      const a = along()
      mote({ kind: 'dust', x: a.x, y: a.y, vx: tx * R(30, 120) + R(-40, 40), vy: ty * R(20, 80) + R(-70, -10), drag: 1.8, g: -30, life: R(0.7, 1.4) * (1 + (tr - 1) * 0.25), size: R(1.6, 4.2), col: Math.random() < 0.35 ? '255,150,140' : '200,40,55', ph: R(0, 6) })
    }
    if (st.smoke) for (let i = count(46); i > 0; i--) {
      const a = along()
      mote({ kind: 'smoke', x: a.x, y: a.y, vx: R(-50, 50), vy: R(-80, -20), drag: 2, life: R(0.45, 0.8), size: R(10, 20) })
    }
  }

  // per frame, after she moves (so the samples sit on the blade where she is now)
  function tick(dt) {
    TRAIL.now += dt
    if (P.hero !== 'messenger') TRAIL.lastAct = null
    const act = P.act
    if (P.hero === 'messenger' && TRAIL.on && act && act !== TRAIL.lastAct) {
      TRAIL.lastAct = act
      if (act.name === 'spin') startSpin(act)
      else if (act.name === 'slam') startSlam(act)
    }
    if (P.hero === 'messenger' && TRAIL.on && act && NO_ARC[act.name] && !act.trail && act.t >= NO_ARC[act.name].at) { act.trail = true; swing(act.name, NO_ARC[act.name]) }
    for (const s of TRAIL.swings) {
      if (s.done) continue
      s.t += dt
      if ((!s.free && P.act !== s.act) || s.t > s.dur + 0.02) { s.done = true; continue }
      sample(s, dt); emitFor(s, dt)
    }
    const life = st => st.life * (1 + (tier() - 1) * 0.25)
    for (const s of TRAIL.swings) { const L = life(s.st); s.L = L; while (s.pts.length && TRAIL.now - s.pts[0].b > L) s.pts.shift() }
    TRAIL.swings = TRAIL.swings.filter(s => !s.done || s.pts.length > 1)
    if (!fx.includes(MGR)) fx.push(MGR)
  }
  function stepMotes(dt) {
    for (const m of TRAIL.motes) {
      m.t += dt; m.vy += m.g * dt
      if (m.drag) { const d = Math.exp(-m.drag * dt); m.vx *= d; m.vy *= d }
      m.x += m.vx * dt; m.y += m.vy * dt
      if (m.kind === 'drip' && m.y > GROUND - 2 && !m.splat) { m.splat = true; m.vy = 0; m.vx = 0; m.g = 0; m.t = Math.max(m.t, m.life * 0.7) }
    }
    TRAIL.motes = TRAIL.motes.filter(m => m.t < m.life)
  }

  // spin: the blade circles her (an ellipse in front and behind), three turns
  function startSpin(act) {
    const m = act.m, turns = 3, a0 = R(0, Math.PI * 2)
    swing('spin', { r: 150, w: 18, a0, a1: a0 + Math.PI * 2 * turns }, {
      style: 'star', sweep: m.dur * 0.92, dur: m.dur * 0.92,
      pivot: () => ({ x: P.x, y: P.y - 90 }), angle: t => a0 + (t / (m.dur * 0.92)) * Math.PI * 2 * turns,
      rad: () => 150, ellipse: 0.47,
    })
  }
  // slam: the blade points down as she falls, a long vertical dust ribbon
  function startSlam(act) {
    swing('slam', { r: 120, w: 34, a0: 1.25, a1: 1.45 }, {
      style: 'dust', sweep: 3, dur: 3,
      pivot: () => ({ x: P.x + P.face * 30, y: P.y - 120 }), angle: t => 1.25 + Math.sin(t * 20) * 0.05, rad: () => 130,
    })
  }

  // soft round sprites: a radial-gradient dot per colour, rendered once and drawn with drawImage
  // (also used by moves.js and thousand.js through TRAIL.soft / TRAIL.dot)
  const DOTS = new Map()
  function soft(col, core) {
    const key = col + (core ? '+' : '')
    let c = DOTS.get(key); if (c) return c
    c = document.createElement('canvas'); c.width = c.height = 64
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    if (core) { gr.addColorStop(0, 'rgba(255,255,248,1)'); gr.addColorStop(0.22, `rgba(${col},0.9)`) } else gr.addColorStop(0, `rgba(${col},1)`)
    gr.addColorStop(0.5, `rgba(${col},0.35)`); gr.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
    DOTS.set(key, c); return c
  }
  // draw a soft dot of radius r (stretched to len along angle a, if given)
  function dot(col, x, y, r, alpha, o = {}) {
    if (alpha <= 0.004 || r <= 0.2) return
    const c = soft(col, o.core)
    ctx.globalAlpha = Math.min(1, alpha)
    if (o.len > r * 1.2) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.a || 0)
      ctx.drawImage(c, -o.len + r, -r, o.len + r, r * 2); ctx.restore()
    } else ctx.drawImage(c, x - r, y - r, r * 2, r * 2)
    ctx.globalAlpha = 1
  }
  TRAIL.soft = soft; TRAIL.dot = dot

  // a smooth path through points: quadratic curves through the midpoints
  function smoothTo(pts, fx_, fy_, first) {
    const n = pts.length
    if (first) ctx.moveTo(fx_(pts[0]), fy_(pts[0])); else ctx.lineTo(fx_(pts[0]), fy_(pts[0]))
    if (n === 2) { ctx.lineTo(fx_(pts[1]), fy_(pts[1])); return }
    for (let i = 1; i < n - 1; i++) {
      const mx = (fx_(pts[i]) + fx_(pts[i + 1])) / 2, my = (fy_(pts[i]) + fy_(pts[i + 1])) / 2
      ctx.quadraticCurveTo(fx_(pts[i]), fy_(pts[i]), mx, my)
    }
    ctx.lineTo(fx_(pts[n - 1]), fy_(pts[n - 1]))
  }
  const TX = p => p.tx, TY = p => p.ty, IX = p => p.ix, IY = p => p.iy

  // ---- drawing
  // The ribbon is cut into a few age bands; each band is one smooth shape (curved edges, no
  // per-sample seams) drawn as glow, body (a gradient across the width) and a thin hot core.
  function ribbon(s, o = {}) {
    const pts = s.pts, n = pts.length; if (n < 2) return
    const st = s.st, L = s.L || st.life, w = s.w * (o.wmul || 1), al = o.alpha ?? 1
    const sh = o.shrink || 0
    let E = []
    for (let i = 0; i < n; i++) {
      let p = pts[i]
      if (sh) p = { tx: lerp(p.tx, p.px, sh), ty: lerp(p.ty, p.py, sh), ix: lerp(p.ix, p.px, sh), iy: lerp(p.iy, p.py, sh), b: p.b }
      const age = clamp((TRAIL.now - p.b) / L, 0, 1), pos = i / (n - 1)
      // head (newest) is full width; the inner edge is pulled toward the tip as it tapers
      const taper = Math.pow(pos, 0.8) * (1 - age * 0.55)
      const reach = clamp((w * 2.6) / Math.max(1, Math.hypot(p.tx - p.ix, p.ty - p.iy)), 0.15, 1)
      const k = taper * reach
      E.push({ tx: p.tx, ty: p.ty, ix: lerp(p.tx, p.ix, k), iy: lerp(p.ty, p.iy, k), a: Math.pow(1 - age, 1.5) * Math.min(1, pos * 2.5 + 0.1), pos })
    }
    // one smoothing pass over both edges (keeps the ends)
    if (n > 3) E = E.map((e, i) => {
      if (i === 0 || i === n - 1) return e
      const a = E[i - 1], c = E[i + 1], m = (u, v, x) => u * 0.25 + v * 0.5 + x * 0.25
      return { ...e, tx: m(a.tx, e.tx, c.tx), ty: m(a.ty, e.ty, c.ty), ix: m(a.ix, e.ix, c.ix), iy: m(a.iy, e.iy, c.iy) }
    })
    const nb = Math.max(1, Math.min(low() ? 4 : 9, n - 1))
    const bands = []
    for (let b = 0; b < nb; b++) {
      const i0 = Math.floor(b * (n - 1) / nb), i1 = Math.floor((b + 1) * (n - 1) / nb)
      const seg = E.slice(i0, i1 + 1); if (seg.length < 2) continue
      const A_ = seg.reduce((q, e) => q + e.a, 0) / seg.length * al
      if (A_ < 0.015) continue
      const mid = seg[seg.length >> 1]
      bands.push({ seg, A: A_, pos: seg[seg.length - 1].pos, mid })
    }
    const shape = (seg, ex = 0) => {
      ctx.beginPath(); smoothTo(seg, TX, TY, true)
      const back = seg.slice().reverse()
      smoothTo(back, p => p.ix + (p.ix - p.tx) * ex, p => p.iy + (p.iy - p.ty) * ex, false)
      ctx.closePath()
    }
    const across = (m, ex, stops) => {
      const g = ctx.createLinearGradient(m.tx, m.ty, m.ix + (m.ix - m.tx) * ex, m.iy + (m.iy - m.ty) * ex)
      for (const [f, c] of stops) g.addColorStop(f, c)
      return g
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    // under-layers (source-over): a faint ink so it reads on bright skies, or the dark smoky edge
    ctx.globalCompositeOperation = 'source-over'
    for (const b of bands) {
      if (st.smoke) { shape(b.seg, 0.6); ctx.fillStyle = across(b.mid, 0.6, [[0, `rgba(30,4,8,${0.85 * b.A})`], [0.7, `rgba(40,6,10,${0.5 * b.A})`], [1, 'rgba(40,6,10,0)']]); ctx.fill() }
      else if (!o.echo) { shape(b.seg, 0.15); ctx.fillStyle = across(b.mid, 0.15, [[0, `rgba(80,14,12,${0.3 * b.A})`], [1, 'rgba(80,14,12,0)']]); ctx.fill() }
      if (st.under) { shape(b.seg, 0.3); ctx.fillStyle = across(b.mid, 0.3, [[0, `rgba(${st.under},${0.4 * b.A})`], [1, `rgba(${st.under},0)`]]); ctx.fill() }
    }
    ctx.globalCompositeOperation = 'lighter'
    const b0 = st.body0, b1 = o.tint || st.body1
    for (const b of bands) {
      // glow: a wide, faint, rounded stroke along the edge
      if (!low()) {
        ctx.beginPath(); smoothTo(b.seg, p => (p.tx * 2 + p.ix) / 3, p => (p.ty * 2 + p.iy) / 3, true)
        ctx.strokeStyle = `rgba(${st.glow},${0.12 * b.A})`; ctx.lineWidth = w * (0.6 + 0.6 * b.pos); ctx.stroke()
      }
      // body: bright at the leading edge, deep and clear toward the inside
      shape(b.seg)
      ctx.fillStyle = across(b.mid, 0, [[0, `rgba(${b1},${0.75 * b.A})`], [0.35, `rgba(${b1},${0.5 * b.A})`], [0.75, `rgba(${b0},${0.32 * b.A})`], [1, `rgba(${b0},0)`]])
      ctx.fill()
    }
    // hot core: one smooth line along the leading edge, thicker toward the head
    if (!o.noCore) for (const b of bands) {
      ctx.beginPath(); smoothTo(b.seg, TX, TY, true)
      ctx.strokeStyle = `rgba(${b1},${0.4 * b.A})`; ctx.lineWidth = Math.max(1.2, w * 0.32 * b.pos); ctx.stroke()
      ctx.strokeStyle = `rgba(${st.core},${0.95 * b.A})`; ctx.lineWidth = Math.max(0.8, w * 0.12 * (0.3 + b.pos * 0.7)); ctx.stroke()
    }
    // the blade tip: a soft white-hot bead while the swing is live
    if (!s.done && !o.echo) {
      const h = E[n - 1], r = Math.max(5, w * 0.45)
      dot(st.glow, h.tx, h.ty, r * 2.4, 0.5 * al); dot(st.body1, h.tx, h.ty, r, 0.9 * al, { core: true })
    }
  }
  function star(x, y, s, rot, a, col) {
    dot(col, x, y, s * 1.1, 0.6 * a)
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
    // rays: thin lenses with curved sides, fading to their points
    const ray = (len, wd, c, alpha) => {
      const g = ctx.createLinearGradient(-len, 0, len, 0)
      g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},${alpha})`); g.addColorStop(1, `rgba(${c},0)`)
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-len, 0); ctx.quadraticCurveTo(0, -wd, len, 0); ctx.quadraticCurveTo(0, wd, -len, 0); ctx.fill()
    }
    ray(s, s * 0.16, '255,255,250', a); ctx.rotate(Math.PI / 2); ray(s, s * 0.16, '255,255,250', a)
    ctx.rotate(Math.PI / 4); ray(s * 0.5, s * 0.1, col, 0.7 * a); ctx.rotate(Math.PI / 2); ray(s * 0.5, s * 0.1, col, 0.7 * a)
    ctx.restore()
    dot('255,255,250', x, y, s * 0.22, a, { core: true })
  }
  function drawMotes() {
    for (const m of TRAIL.motes) {
      const k = m.t / m.life
      if (m.kind === 'smoke') { ctx.globalCompositeOperation = 'source-over'; dot('45,8,12', m.x, m.y, m.size * (1.4 + k * 2), 0.32 * (1 - k)); continue }
      ctx.globalCompositeOperation = 'lighter'
      if (m.kind === 'spark') {
        const a = 1 - k, sp = Math.hypot(m.vx, m.vy), ln = Math.max(m.size * 2, sp * 0.03)
        dot(m.col, m.x, m.y, m.size * 2.2, 0.8 * a, { len: ln, a: Math.atan2(m.vy, m.vx), core: true })
      } else if (m.kind === 'drip') {
        const a = 1 - k * k, sp = Math.hypot(m.vx, m.vy), ang_ = Math.atan2(m.vy, m.vx)
        const ln = m.size * clamp(sp / 120, 1.2, 4)
        dot(m.col, m.x, m.y, m.size * 3, 0.3 * a)
        dot(m.col, m.x, m.y, m.size * 1.3, 0.95 * a, { len: ln * 1.4, a: ang_, core: true })
      } else if (m.kind === 'glint') {
        const pop = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85
        const tw = 0.8 + 0.2 * Math.sin(m.t * 18 + m.rot * 9)
        star(m.x, m.y, m.size * (0.4 + pop * 0.8), m.rot + m.t * 1.2, pop * tw, m.col)
      } else if (m.kind === 'dust') {
        const a = (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * (0.8 + 0.2 * Math.sin(m.t * 5 + m.ph))
        dot(m.col, m.x, m.y, m.size * 3, 0.4 * a); dot('255,190,175', m.x, m.y, m.size * 0.9, 0.85 * a, { core: true })
      }
    }
    ctx.globalAlpha = 1
  }
  const MGR = { t: 0, dur: Infinity, trailMgr: true,
    update(dt) { stepMotes(dt) },
    draw() {
      for (const s of TRAIL.swings) {
        // tier 3: an echo ribbon a step inside the blade, in rose
        if (tier() >= 3 && !low()) ribbon(s, { shrink: 0.16, alpha: 0.45, wmul: 0.8, tint: '255,120,130', noCore: true, echo: true })
        ribbon(s)
      }
      drawMotes()
      ctx.globalCompositeOperation = 'source-over'
    },
  }
  TRAIL.swing = swing
  TRAIL.styles = STY
  TRAIL.moveStyle = MOVE_STYLE

  // ---- hooks into the core
  const baseUpdate = window.updatePlayer
  window.updatePlayer = function (dt) { baseUpdate(dt); try { tick(dt) } catch (e) { console.warn('TRAIL', e) } }

  const baseArc = window.slashArc
  window.slashArc = function (a) {
    if (P.hero !== 'messenger' || !TRAIL.on || !P.act) return baseArc(a)
    if (TRAIL.painted) baseArc(a)
    else if (a.thunder && fxk()?.thunderBlade) try { FXK.thunderBlade(P.x + P.face * 40, P.y - 95, P.face > 0 ? 0 : Math.PI, a.r * 1.6) } catch { }
    swing(P.act.name, a)
  }
  // the spin's old streak particles give way to the star trail
  const baseSpinFx = window.spinFx
  window.spinFx = function () { if (P.hero === 'messenger' && TRAIL.on) return; return baseSpinFx() }

  // counter: a white-gold flash and a dark-rimmed cut across where she lands
  const baseCounter = window.counterHit
  window.counterHit = function (b) {
    baseCounter(b)
    if (P.hero !== 'messenger' || !TRAIL.on) return
    const x = P.x + P.face * 40, y = P.y - 95
    swing('counter', { r: 200, w: 56, a0: -2.6, a1: 1.3 }, { style: 'dark', free: true, sweep: 0.12, pivot: () => ({ x, y }) })
    fx.push({ t: 0, dur: 0.28, draw(k) {
      ctx.globalCompositeOperation = 'lighter'
      const r = 60 + 220 * ease(k), g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(255,255,245,${0.6 * (1 - k)})`); g.addColorStop(0.4, `rgba(255,200,120,${0.3 * (1 - k)})`); g.addColorStop(1, 'rgba(255,170,80,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(255,240,200,${1 - k})`; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.stroke()
    } })
  }
}
