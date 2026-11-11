// ARES · fx.js: the painted-look effects kit (FXK). Slashes, hits, lightning swords,
// lingering smoke and the ultimate cut-in panels.
// Loads after game.js and before stage.js. Uses only `ctx`, `W` and `H` from the core
// (each with a fallback), loads its own art from ../assets relative to this file, and
// draws a procedural version of everything while that art is missing. No call throws.
//
//   FXK.slash(x, y, angle, len, {color: 'gold'|'crimson'|'white', heavy, thunder, flip})
//   FXK.hit(x, y, dir, power)       dir: ±1 (facing) or an angle in radians; power 0..3
//   FXK.thunderBlade(x, y, angle, len)
//   FXK.smoke(x, y, n, {color: 'dust'|'dark'|'ember', size, spread, rise, vx})
//   FXK.ultPanel(hero, {name}) -> duration (s), drawn in screen space
//   FXK.update(dt)  FXK.draw() (world space)  FXK.drawScreen() (screen space, last)
'use strict'

const FXK = (() => {
  const TAU = Math.PI * 2
  const rnd = (a, b) => a + Math.random() * (b - a)
  const cl = (v, a, b) => v < a ? a : v > b ? b : v
  const easeOut = k => 1 - (1 - k) * (1 - k) * (1 - k)
  const easeIn = k => k * k * k
  const C = () => (typeof ctx !== 'undefined' ? ctx : null)
  const SW = () => (typeof W !== 'undefined' ? W : 1280), SH = () => (typeof H !== 'undefined' ? H : 720)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
  const safe = (fn, fb) => function () { try { return fn.apply(this, arguments) } catch (e) { if (!safe.warned) { safe.warned = 1; console.warn('FXK:', e) } return fb } }

  // -------------------------------------------------------------- art
  const IMG = {}
  let base = '../assets/'
  try { if (document.currentScript && document.currentScript.src) base = new URL('../assets/', document.currentScript.src).href } catch { }
  if (typeof FXK_BASE === 'string') base = FXK_BASE   // optional override, set before this script
  const STRIPS = ['slash-arc-gold', 'slash-arc-crimson', 'hit-spark', 'thunder-blade', 'smoke-puff']
  const CUTS = ['messenger-eyes', 'messenger-pose', 'messenger-coresunder-pose', 'runner-eyes', 'runner-pose']
  function loadAll(b) {
    if (b) base = b.endsWith('/') ? b : b + '/'
    if (typeof Image === 'undefined') return
    const one = (key, src, then) => { const i = new Image(); i.onload = () => { IMG[key] = i; try { then && then(i) } catch { } }; i.src = src }
    for (const k of STRIPS) one(k, base + 'fx/' + k + '.webp', k === 'smoke-puff' ? bakeSmokeArt : null)
    for (const k of CUTS) one(k, base + 'art/cutins/' + k + '.webp')
  }
  // a strip of square frames side by side (6, or 12 after RIFE); frame centre = slot centre
  function strip(name, f, x, y, size, rot, alpha, sx) {
    const c = C(), img = IMG[name] || (typeof A !== 'undefined' && A.fx && A.fx[name])
    if (!img || !img.width) return false
    const nf = Math.max(1, Math.round(img.width / img.height)), slot = img.width / nf, fr = cl(f * nf / 6 | 0, 0, nf - 1), s = size / slot   // f counts 0-6; strips may have 12 (RIFE)
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(s * (sx || 1), s)
    c.globalAlpha = cl(alpha, 0, 1); c.globalCompositeOperation = 'lighter'
    c.drawImage(img, fr * slot, 0, slot, img.height, -slot / 2, -img.height / 2, slot, img.height)
    c.restore(); return true
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

  // -------------------------------------------------------------- palettes
  const PAL = {
    gold: { glow: '255,140,30', rim: '255,176,48', ink: '170,70,10', core: '255,252,238', spark: '255,215,130' },
    crimson: { glow: '220,20,45', rim: '255,70,80', ink: '120,0,20', core: '255,236,225', spark: '255,120,90' },
    white: { glow: '255,215,170', rim: '255,240,220', ink: '150,100,70', core: '255,255,255', spark: '255,245,220' },
  }
  const pal = c => PAL[c] || PAL.gold

  // -------------------------------------------------------------- pools
  const fxs = []              // timed effects {t, dur, draw(k, e), update?(dt, e)}
  const MAXFX = 220
  const push = e => { e.t = 0; if (fxs.length >= MAXFX) fxs.shift(); fxs.push(e); return e }

  const PMAX = 700, parts = []  // sparks: pooled streaks and embers
  let pi = 0
  for (let i = 0; i < PMAX; i++) parts.push({ on: false })
  function spark(x, y, vx, vy, life, size, color, kind) {
    const p = parts[pi]; pi = (pi + 1) % PMAX
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.life = life; p.size = size; p.color = color; p.kind = kind || 0
    p.g = kind === 1 ? 160 : 900
  }

  const SMAX = 300, puffs = []  // smoke: pooled, the oldest is reused when full
  let si = 0
  for (let i = 0; i < SMAX; i++) puffs.push({ on: false })
  let wind = 0, windT = 0

  // -------------------------------------------------------------- crescent geometry
  // local coords: chord from (-L/2, 0) to (L/2, 0), bulging to -y. Outer and inner edges are
  // quadratic curves with different control heights, so the shape is thick in the middle
  // and razor sharp at both ends. s0..s1 is the drawn part (the sweep).
  function crescent(c, L, bOut, bIn, s0, s1) {
    const N = 22, h = L / 2
    const q = (s, b) => { const u = 1 - s; return [-h * u * u + h * s * s, -2 * u * s * 2 * b] }
    c.beginPath()
    for (let i = 0; i <= N; i++) { const s = s0 + (s1 - s0) * i / N, p = q(s, bOut); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]) }
    for (let i = N; i >= 0; i--) { const s = s0 + (s1 - s0) * i / N, p = q(s, bIn); c.lineTo(p[0], p[1]) }
    c.closePath()
  }
  const arcPt = (L, b, s) => { const u = 1 - s, h = L / 2; return [-h * u * u + h * s * s, -4 * u * s * b] }
  const arcNorm = (L, b, s) => { const dx = L * (1 - s) + L * s, dy = -4 * b * (1 - 2 * s), m = Math.hypot(dx, dy) || 1; return [dy / m, -dx / m] }

  function jag(pts, amp, out) { // jitter a polyline into lightning
    out.length = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], e = i === 0 || i === pts.length - 1 ? 0 : 1
      out.push([p[0] + rnd(-amp, amp) * e, p[1] + rnd(-amp, amp) * e])
    }
    return out
  }
  function strokeBolt(c, pts, w, color, a) {
    c.strokeStyle = `rgba(${color},${a})`; c.lineWidth = w; c.lineJoin = 'miter'; c.lineCap = 'round'
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke()
  }
  function boltLayers(c, pts, scale, a) {
    strokeBolt(c, pts, 14 * scale, '255,120,30', 0.18 * a)
    strokeBolt(c, pts, 6 * scale, '255,200,90', 0.7 * a)
    strokeBolt(c, pts, 2.2 * scale, '255,255,245', a)
  }
  // a lightning path from p0 to p1 by midpoint displacement, plus forks
  function lightning(x0, y0, x1, y1, rough, depth) {
    let pts = [[x0, y0], [x1, y1]]
    for (let d = 0; d < depth; d++) {
      const n = [pts[0]]
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy)
        const o = rnd(-rough, rough) * m
        n.push([(a[0] + b[0]) / 2 - dy / m * o, (a[1] + b[1]) / 2 + dx / m * o], b)
      }
      pts = n
    }
    return pts
  }

  // -------------------------------------------------------------- slash
  function slash(x, y, angle, len, o) {
    o = o || {}
    const P = pal(o.color), heavy = !!o.heavy
    const L = (len || 240) * (heavy ? 1.35 : 1) * rnd(0.92, 1.08)
    const bulge = L * rnd(0.17, 0.27) * (heavy ? 1.15 : 1)
    const inner = rnd(0.5, 0.64)
    const rot = (angle || 0) + rnd(-0.06, 0.06)
    const flip = o.flip ? -1 : 1
    const dur = heavy ? 0.42 : 0.3
    const art = o.color === 'crimson' ? 'slash-arc-crimson' : 'slash-arc-gold'
    const sweepDir = 1
    const bolt = [], bpts = []
    for (let i = 0; i <= 10; i++) bpts.push(arcPt(L, bulge * (1 + inner) / 2, i / 10))
    let bt = 0
    const e = push({
      dur, update(dt) { bt -= dt; if (o.thunder && bt <= 0) { bt = 0.035; jag(bpts, bulge * 0.35, bolt) } },
      draw(k) {
        const c = C()
        c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, flip)
        const head = easeOut(cl(k / 0.32, 0, 1)), tail = easeIn(cl((k - 0.12) / 0.88, 0, 1)) * 0.95
        const fade = 1 - easeIn(cl((k - 0.35) / 0.65, 0, 1))
        const tip = (bOut, bIn, a, s0, s1) => { crescent(c, L, bOut, bIn, s0, s1); c.fillStyle = `rgba(${a})`; c.fill() }
        // afterimages: the same crescent a beat behind, swung back and dimmer
        c.globalCompositeOperation = 'lighter'
        for (let j = 2; j >= 1; j--) {
          c.save(); c.rotate(-0.11 * j * sweepDir); c.scale(1 - 0.03 * j, 1 - 0.05 * j)
          tip(bulge, bulge * inner, `${P.glow},${0.2 * fade / j}`, tail * 0.5, head * 0.95)
          c.restore()
        }
        // ink edge so the arc reads on a bright sky
        c.globalCompositeOperation = 'source-over'
        tip(bulge * 1.07, bulge * inner * 0.97, `${P.ink},${0.28 * fade}`, tail, head)
        c.globalCompositeOperation = 'lighter'
        // painted arc for brush texture
        if (head > 0.45) slashArt(art, 1.5 + k * 4.49, L, bulge, 0.7 * fade)
        // soft glow: the outline stroked wide and faint, then the body
        crescent(c, L, bulge, bulge * inner, tail, head)
        c.lineJoin = 'round'; c.strokeStyle = `rgba(${P.glow},${0.12 * fade})`; c.lineWidth = 16; c.stroke()
        c.strokeStyle = `rgba(${P.glow},${0.2 * fade})`; c.lineWidth = 7; c.stroke()
        c.fillStyle = `rgba(${P.rim},${0.6 * fade})`; c.fill()
        // hot core hugging the outer edge
        tip(bulge * 0.985, bulge * (inner + (1 - inner) * 0.6), `${P.core},${0.85 * fade}`, tail + (head - tail) * 0.08, head)
        // thin speed streaks just outside the arc
        c.strokeStyle = `rgba(${P.core},${0.45 * fade})`; c.lineWidth = 1.4
        for (let j = 1; j <= 2; j++) {
          const bb = bulge * (1 + 0.16 * j), s0 = tail + 0.12 * j, s1 = head - 0.06 * j
          if (s1 <= s0) continue
          c.beginPath(); for (let i = 0; i <= 14; i++) { const p = arcPt(L * (1 - 0.06 * j), bb, s0 + (s1 - s0) * i / 14); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]) } c.stroke()
        }
        if (o.thunder && bolt.length && fade > 0.05) {
          const lo = Math.floor(tail * 10), hi = Math.ceil(head * 10)
          boltLayers(c, bolt.slice(lo, hi + 1), heavy ? 1.2 : 0.9, fade)
        }
        c.restore()
      },
    })
    // sparks fly off the leading edge
    const cs = Math.cos(rot), sn = Math.sin(rot), n = heavy ? 16 : 8
    for (let i = 0; i < n; i++) {
      const s = rnd(0.3, 1), p = arcPt(L, bulge, s), nm = arcNorm(L, bulge, s)
      const lx = p[0], ly = p[1] * flip, nx = nm[0], ny = nm[1] * flip
      const wx = x + lx * cs - ly * sn, wy = y + lx * sn + ly * cs
      const sp = rnd(260, 820), tx = cs, ty = sn
      const vx = (nx * cs - ny * sn) * sp * 0.7 + tx * sp * 0.6, vy = (nx * sn + ny * cs) * sp * 0.7 + ty * sp * 0.6
      spark(wx, wy, vx, vy, rnd(0.18, 0.42), rnd(1.5, 3.2), P.spark, 0)
    }
    if (heavy) { const ax = 0, ay = -bulge * 0.7 * flip; shock(x + ax * cs - ay * sn, y + ax * sn + ay * cs, L * 0.5, P, rot) }
    if (o.thunder) for (let i = 0; i < 6; i++) spark(x + rnd(-L / 2, L / 2) * cs, y + rnd(-L / 2, L / 2) * sn, rnd(-300, 300), rnd(-400, 100), rnd(0.2, 0.4), 2, '255,240,170', 0)
    return e
  }

  // measured from the painted sheets (frame 3): tip-to-tip chord, its midpoint offset from
  // the slot centre, the turn that lays the chord flat with the bulge up, and the bulge/chord
  const ART = { 'slash-arc-gold': { chord: 497, mid: [14.5, 0.5], rot: 0.63, curve: 0.342 }, 'slash-arc-crimson': { chord: 449, mid: [-25.5, -26], rot: 0.695, curve: 0.379 } }
  function slashArt(name, f, L, bulge, alpha) {
    const img = IMG[name] || (typeof A !== 'undefined' && A.fx && A.fx[name]), m = ART[name]
    if (!img || !img.width || !m) return
    const c = C(), nf = Math.max(1, Math.round(img.width / img.height)), slot = img.width / nf, fr = cl(f * nf / 6 | 0, 0, nf - 1)
    const k0 = img.k0 || 1
    c.save(); c.scale(1, cl(bulge / L / m.curve, 0.3, 1.5)); c.rotate(m.rot); c.scale(L / m.chord * k0, L / m.chord * k0)
    c.globalAlpha = cl(alpha, 0, 1); c.globalCompositeOperation = 'lighter'
    c.drawImage(img, fr * slot, 0, slot, img.height, -slot / 2 - m.mid[0] / k0, -img.height / 2 - m.mid[1] / k0, slot, img.height)
    c.restore()
  }

  function shock(x, y, r, P, rot) { // a pressure wave pushed out in front of a heavy arc
    push({
      dur: 0.34, draw(k) {
        const c = C(), e = easeOut(k), f = 1 - k
        c.save(); c.translate(x, y); c.rotate(rot || 0); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'
        for (const [sc, w, a, col] of [[1, 18, 0.25, P.glow], [1, 5, 0.8, P.core], [0.82, 3, 0.5, P.rim]]) {
          const rr = r * (0.3 + 0.9 * e) * sc
          c.strokeStyle = `rgba(${col},${a * f})`; c.lineWidth = w * f + 0.5
          c.beginPath(); c.ellipse(0, 0, rr, rr * 0.5, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke()
        }
        if (k < 0.3) { const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.5); g.addColorStop(0, `rgba(255,250,235,${(1 - k / 0.3) * 0.55})`); g.addColorStop(1, 'rgba(255,190,110,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill() }
        c.restore()
      },
    })
  }

  // -------------------------------------------------------------- hit
  function star(c, n, r0, r1, rot) {
    c.beginPath()
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r1 : r0; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r) }
    c.closePath()
  }
  function hit(x, y, dir, power) {
    const pw = cl(power == null ? 1 : +power || 0, 0, 3), sc = 0.6 + pw * 0.45
    const da = dir === 1 || dir === -1 ? (dir > 0 ? 0 : Math.PI) : +dir || 0
    const rot = rnd(0, TAU), cr = rnd(-0.5, 0.5)
    push({
      dur: 0.22 + pw * 0.05, draw(k) {
        const c = C(), f = 1 - k
        c.save(); c.translate(x, y); c.globalCompositeOperation = 'lighter'
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 90 * sc)
        g.addColorStop(0, `rgba(255,250,235,${f})`); g.addColorStop(0.3, `rgba(255,190,80,${0.5 * f})`); g.addColorStop(1, 'rgba(255,120,40,0)')
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 90 * sc, 0, TAU); c.fill()
        const s = (k < 0.2 ? k / 0.2 : 1) * sc * (1 + k * 0.3)
        c.scale(s, s)
        c.fillStyle = `rgba(255,170,60,${0.7 * f})`; star(c, 4, 100, 8, rot); c.fill()
        c.fillStyle = `rgba(255,255,250,${f})`; star(c, 4, 80, 5, rot); c.fill()
        c.fillStyle = `rgba(255,230,170,${0.7 * f})`; star(c, 4, 46, 5, rot + Math.PI / 4); c.fill()
        c.restore()
      },
    })
    if (IMG['hit-spark']) push({ dur: 0.36, draw(k) { strip('hit-spark', k * 5.99, x, y, 230 * sc, rot, 1 - easeIn(k)) } })
    // short cross slash: two quick thin crescents
    for (const off of [-0.6, 0.6]) push({
      dur: 0.16, draw(k) {
        const c = C(), L = 150 * sc, a = da + off + cr
        c.save(); c.translate(x, y); c.rotate(a); c.globalCompositeOperation = 'lighter'
        const h = easeOut(cl(k / 0.4, 0, 1)), t = easeIn(k)
        c.fillStyle = `rgba(255,190,80,${0.6 * (1 - k)})`; crescent(c, L, L * 0.08, -L * 0.02, t, h); c.fill()
        c.fillStyle = `rgba(255,255,245,${1 - k})`; crescent(c, L, L * 0.05, 0, t, h); c.fill()
        c.restore()
      },
    })
    push({
      dur: 0.3, draw(k) {
        const c = C(), r = (18 + 62 * easeOut(k)) * sc
        c.save(); c.globalCompositeOperation = 'lighter'
        c.strokeStyle = `rgba(255,214,150,${(1 - k) * 0.75})`; c.lineWidth = 6 * (1 - k) * sc + 0.5
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.restore()
      },
    })
    const n = 6 + pw * 6 | 0
    for (let i = 0; i < n; i++) {
      const a = da + rnd(-0.8, 0.8) * (Math.random() < 0.25 ? 2.5 : 1), s = rnd(350, 950) * (0.7 + pw * 0.2)
      spark(x, y, Math.cos(a) * s, Math.sin(a) * s - 120, rnd(0.15, 0.4), rnd(1.5, 3.5), Math.random() < 0.3 ? '255,255,240' : '255,200,110', 0)
    }
    if (pw >= 2) for (let i = 0; i < pw * 3; i++) spark(x, y, rnd(-200, 200) + Math.cos(da) * 150, rnd(-300, -60), rnd(0.5, 1), rnd(2, 3), '255,170,70', 1)
  }

  // -------------------------------------------------------------- thunder blade
  function thunderBlade(x, y, angle, len) {
    const L = len || 420, a = angle || 0, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L
    let main = [], forks = [], bt = 0
    const regen = () => {
      main = lightning(x, y, ex, ey, 0.22, 5)
      forks = []
      for (let i = 0; i < 4; i++) {
        const p = main[2 + (Math.random() * (main.length - 4) | 0)], fa = a + rnd(0.4, 1.0) * (Math.random() < 0.5 ? -1 : 1), fl = L * rnd(0.12, 0.3)
        forks.push(lightning(p[0], p[1], p[0] + Math.cos(fa) * fl, p[1] + Math.sin(fa) * fl, 0.3, 3))
      }
    }
    regen()
    push({
      dur: 0.32, update(dt) { bt -= dt; if (bt <= 0) { bt = rnd(0.03, 0.05); regen() } },
      draw(k) {
        const c = C(), flick = Math.random() < 0.18 ? 0.35 : 1, f = (1 - easeIn(k)) * flick
        c.save(); c.globalCompositeOperation = 'lighter'
        // blade-shaped glow under the bolt
        c.translate(x, y); c.rotate(a)
        const g = c.createLinearGradient(0, 0, L, 0)
        g.addColorStop(0, `rgba(255,250,230,${0.55 * f})`); g.addColorStop(0.85, `rgba(255,190,80,${0.3 * f})`); g.addColorStop(1, 'rgba(255,140,40,0)')
        c.fillStyle = g; c.beginPath(); c.moveTo(0, -5); c.lineTo(L * 0.9, -2.5); c.lineTo(L * 1.02, 0); c.lineTo(L * 0.9, 2.5); c.lineTo(0, 5); c.fill()
        strip('thunder-blade', 1 + k * 4.99, L / 2, 0, L * 1.35, 0, 0.9 * f, 1)
        c.restore(); c.save(); c.globalCompositeOperation = 'lighter'
        boltLayers(c, main, 1.4, f)
        for (const fk of forks) boltLayers(c, fk, 0.7, f * 0.85)
        // tip flash
        const tg = c.createRadialGradient(ex, ey, 0, ex, ey, 60)
        tg.addColorStop(0, `rgba(255,255,240,${f})`); tg.addColorStop(1, 'rgba(255,180,60,0)')
        c.fillStyle = tg; c.beginPath(); c.arc(ex, ey, 60, 0, TAU); c.fill()
        c.restore()
      },
    })
    push({ // afterglow
      dur: 0.75, draw(k) {
        if (k < 0.3) return
        const c = C(), f = 1 - (k - 0.3) / 0.7
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'
        c.strokeStyle = `rgba(255,150,50,${0.25 * f})`; c.lineWidth = 22 * f; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke()
        c.strokeStyle = `rgba(255,230,170,${0.5 * f})`; c.lineWidth = 4 * f; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke()
        c.restore()
      },
    })
    for (let i = 0; i < 14; i++) { const t = Math.random(), s = rnd(100, 500), d = rnd(0, TAU); spark(x + (ex - x) * t, y + (ey - y) * t, Math.cos(d) * s, Math.sin(d) * s, rnd(0.15, 0.35), rnd(1.5, 2.5), '255,235,160', 0) }
  }

  // -------------------------------------------------------------- smoke
  const SMOKE = { dust: [236, 222, 204], dark: [96, 80, 78], ember: [150, 96, 78], blood: [120, 22, 28] }
  let puffArt = null, puffProc = null
  function bakeProc() { // soft lumpy procedural puffs, one set per colour
    puffProc = {}
    for (const k in SMOKE) {
      puffProc[k] = []
      const [r, g, b] = SMOKE[k]
      for (let v = 0; v < 4; v++) {
        const cv = mk(128, 128), c = cv.getContext('2d')
        for (let i = 0; i < 7; i++) {
          const a = rnd(0, TAU), d = i ? rnd(14, 30) : 0, px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d * 0.8, rr = rnd(22, 36)
          const gr = c.createRadialGradient(px, py - rr * 0.3, 0, px, py, rr)
          const hi = Math.min(255, r + 25), sh = 0.78
          gr.addColorStop(0, `rgba(${hi},${Math.min(255, g + 25)},${Math.min(255, b + 25)},0.55)`)
          gr.addColorStop(0.6, `rgba(${r * sh | 0},${g * sh | 0},${b * sh | 0},0.35)`)
          gr.addColorStop(1, `rgba(${r * sh | 0},${g * sh | 0},${b * sh | 0},0)`)
          c.fillStyle = gr; c.beginPath(); c.arc(px, py, rr, 0, TAU); c.fill()
        }
        puffProc[k].push(cv)
      }
    }
  }
  function bakeSmokeArt(img) { // painted puffs on black -> alpha from brightness, tinted per colour
    const slot = img.width / 6, S = 160, out = {}
    for (const k in SMOKE) out[k] = []
    for (let f = 0; f < 6; f++) {
      const src = mk(S, S), sc = src.getContext('2d', { willReadFrequently: true })
      sc.filter = 'blur(2.5px)'; sc.drawImage(img, f * slot, 0, slot, img.height, 0, 0, S, S); sc.filter = 'none'
      const d = sc.getImageData(0, 0, S, S), px = d.data
      for (const k in SMOKE) {
        const [r, g, b] = SMOKE[k], cv = mk(S, S), c = cv.getContext('2d'), o = c.createImageData(S, S), q = o.data
        for (let i = 0; i < px.length; i += 4) {
          const l = Math.max(px[i], px[i + 1], px[i + 2]) / 255, sh = 0.62 + 0.5 * l
          q[i] = Math.min(255, r * sh); q[i + 1] = Math.min(255, g * sh); q[i + 2] = Math.min(255, b * sh)
          q[i + 3] = cl((l - 0.05) * 1.25, 0, 1) * 235
        }
        c.putImageData(o, 0, 0); out[k].push(cv)
      }
    }
    puffArt = out
  }
  function smoke(x, y, n, o) {
    o = o || {}
    const col = SMOKE[o.color] ? o.color : 'dust', size = o.size || 1, spread = o.spread == null ? 30 : o.spread
    const cnt = cl(n == null ? 8 : n | 0, 1, 80)
    for (let i = 0; i < cnt; i++) {
      const p = puffs[si]; si = (si + 1) % SMAX
      p.on = true; p.col = col; p.v = Math.random() * 6 | 0
      p.x = x + rnd(-spread, spread); p.y = y + rnd(-spread * 0.4, spread * 0.4)
      p.vx = (o.vx || 0) + rnd(-60, 60); p.vy = -rnd(10, 45) * (o.rise == null ? 1 : o.rise)
      p.r = rnd(18, 34) * size; p.grow = rnd(18, 40) * size
      p.t = 0; p.life = rnd(2, 5); p.rot = rnd(0, TAU); p.vr = rnd(-0.3, 0.3)
      p.a = rnd(0.45, 0.75) * (col === 'dust' ? 0.9 : 0.7); p.ph = rnd(0, TAU)
    }
    if (col === 'ember') for (let i = 0; i < cnt; i++) spark(x + rnd(-spread, spread), y, rnd(-50, 50), rnd(-160, -40), rnd(0.8, 1.8), rnd(1.5, 2.6), '255,150,60', 1)
  }

  // -------------------------------------------------------------- ultimate cut-in
  const HERO = {
    messenger: { a: '255,196,80', b: '200,16,40', hair: '110,60,40', eye: '150,85,40', face: [0.29, 0.23, 0.51, 0.215] },
    runner: { a: '255,206,120', b: '235,120,150', hair: '240,170,185', eye: '170,100,100', face: [0.335, 0.09, 0.43, 0.18] },
  }
  // a sword can bring its own cut-in pose (the art shows the blade she is holding)
  const POSE = { coresunder: { key: 'messenger-coresunder-pose', face: [0.37, 0.105, 0.24, 0.15] } }
  function poseFor(h) {
    try { if (h === 'messenger' && typeof WEAPON !== 'undefined' && POSE[WEAPON.id] && WEAPON.is(WEAPON.id)) return POSE[WEAPON.id] } catch { }
    return { key: h + '-pose', face: HERO[h].face }
  }
  let ult = null
  function ultPanel(hero, o) {
    const h = HERO[hero] ? hero : 'messenger'
    const lines = []
    for (let i = 0; i < 70; i++) lines.push([rnd(0, TAU), rnd(0.002, 0.012), rnd(0.35, 0.8)])
    const pf = poseFor(h)
    ult = { hero: h, pose: pf.key, face: pf.face, name: (o && o.name) ? String(o.name).replace(/[^\x20-\x7E]/g, '').slice(0, 40) : '', k: 0, last: now(), dur: 1.4, lines }
    return 1.4
  }
  function cover(c, img, sx, sy, sw, sh, x, y, w, h) { // draw a source rect covering a box
    const s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s
    c.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  }
  function para(c, x, y, w, h, sk) { c.beginPath(); c.moveTo(x + sk, y); c.lineTo(x + w + sk, y); c.lineTo(x + w - sk, y + h); c.lineTo(x - sk, y + h); c.closePath() }
  function speedLines(c, cx, cy, U, lines, a, col) {
    c.fillStyle = `rgba(${col},${a})`
    const R0 = Math.hypot(SW(), SH())
    for (const [ang, wdt, inn] of lines) {
      const a2 = ang + rnd(-0.01, 0.01), r0 = R0 * inn * rnd(0.85, 1.1)
      c.beginPath(); c.moveTo(cx + Math.cos(a2) * r0, cy + Math.sin(a2) * r0)
      c.lineTo(cx + Math.cos(a2 - wdt) * R0, cy + Math.sin(a2 - wdt) * R0); c.lineTo(cx + Math.cos(a2 + wdt) * R0, cy + Math.sin(a2 + wdt) * R0); c.fill()
    }
  }
  function drawEyesProc(c, x, y, w, h, H) { // fallback: two painted-ish anime eyes
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#f6d9c8'); g.addColorStop(1, '#e8b9a5'); c.fillStyle = g; c.fillRect(x - 60, y, w + 120, h)
    for (const sx of [-1, 1]) {
      const ex = x + w / 2 + sx * w * 0.2, ey = y + h * 0.58, ew = w * 0.15, eh = h * 0.28
      c.fillStyle = `rgb(${H.hair})`; c.save(); c.translate(ex, ey - eh * 1.5); c.rotate(sx * 0.12); c.fillRect(-ew, -h * 0.03, ew * 2, h * 0.05); c.restore()
      c.fillStyle = '#fff8f2'; c.beginPath(); c.ellipse(ex, ey, ew, eh, 0, 0, TAU); c.fill()
      const ig = c.createRadialGradient(ex, ey - eh * 0.2, 2, ex, ey, eh); ig.addColorStop(0, '#ffd890'); ig.addColorStop(0.5, `rgb(${H.eye})`); ig.addColorStop(1, '#2a1010')
      c.fillStyle = ig; c.beginPath(); c.ellipse(ex, ey, eh * 0.75, eh * 0.95, 0, 0, TAU); c.fill()
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - eh * 0.25, ey - eh * 0.35, eh * 0.18, 0, TAU); c.fill()
      c.strokeStyle = '#2a1414'; c.lineWidth = h * 0.05; c.beginPath(); c.ellipse(ex, ey, ew, eh, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke()
    }
    const hg = c.createLinearGradient(0, y, 0, y + h * 0.35); hg.addColorStop(0, `rgba(${H.hair},1)`); hg.addColorStop(1, `rgba(${H.hair},0)`)
    c.fillStyle = hg; c.fillRect(x - 60, y, w + 120, h * 0.35)
  }
  function heroSprite(hero) { // the core's in-game sheet, if loaded: {img, n, x, y, h}
    try {
      const sh = typeof A !== 'undefined' && A.sheets && A.sheets[hero]
      const sp = sh && (sh.idle || sh['m-idle'] || sh['o-idle'] || sh[Object.keys(sh)[0]])
      return sp && sp.img && sp.img.width ? sp : null
    } catch { return null }
  }
  function drawCrest(c, cx, cy, r, H, k) { // last fallback: a radiant gold crest with a blade
    c.save(); c.translate(cx, cy); c.globalCompositeOperation = 'lighter'
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,250,230,0.9)'); g.addColorStop(0.4, `rgba(${H.a},0.5)`); g.addColorStop(1, 'rgba(255,120,40,0)')
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill()
    c.rotate(k * 0.6); c.fillStyle = 'rgba(255,240,200,0.8)'; star(c, 8, r * 0.95, r * 0.12, 0); c.fill()
    c.strokeStyle = `rgba(${H.a},0.9)`; c.lineWidth = 4
    for (const rr of [0.55, 0.68]) { c.beginPath(); c.arc(0, 0, r * rr, 0, TAU); c.stroke() }
    c.restore()
  }
  function drawPoseFallback(c, hero, cx, H, k) {
    const sp = heroSprite(hero), h = SH()
    if (sp) {
      const slot = sp.img.width / sp.n, s = h * 1.25 / sp.h
      c.drawImage(sp.img, 0, 0, slot, sp.img.height, cx - sp.x * s, h * 1.22 - sp.y * s, slot * s, sp.img.height * s)
    } else drawCrest(c, cx, h * 0.45, h * 0.42, H, k)
  }
  function drawFaceFallback(c, hero, x, y, w, h, H, k) {
    const sp = heroSprite(hero)
    if (sp) { const slot = sp.img.width / sp.n, fw = sp.h * 0.42; cover(c, sp.img, sp.x - fw / 2, sp.y - sp.h * 1.02, fw, fw * 0.6, x - 40, y, w + 80, h) }
    else drawCrest(c, x + w / 2, y + h / 2, h * 0.7, H, k)
  }
  function drawUlt() {
    if (!ult) return
    // its own clock: real time (the core slows the game behind it), capped per frame
    const tn = now(); ult.k += Math.min(0.05, Math.max(0, tn - ult.last)); ult.last = tn
    const c = C(), k = ult.k
    if (k >= ult.dur) { ult = null; return }
    const w = SW(), h = SH(), Hc = HERO[ult.hero]
    const eyes = IMG[ult.hero + '-eyes'], pose = IMG[ult.pose]
    const slam = (t0, d) => easeOut(cl((k - t0) / d, 0, 1))
    const out = cl((k - 1.12) / 0.2, 0, 1)
    // screen kick on each slam
    let kick = 0
    for (const t0 of [0.06, 0.24, 0.42]) { const d = k - t0 - 0.12; if (d > 0 && d < 0.12) kick = Math.max(kick, (1 - d / 0.12) * 10) }
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    if (c.canvas && c.canvas.width !== w) c.scale(c.canvas.width / w, c.canvas.height / h)
    c.translate(rnd(-kick, kick), rnd(-kick, kick))
    // wash
    const wa = cl(k / 0.1, 0, 1) * (1 - out)
    c.globalAlpha = wa
    c.fillStyle = 'rgba(28,4,10,0.72)'; c.fillRect(-20, -20, w + 40, h + 40)
    const wg = c.createLinearGradient(0, h, w, 0)
    wg.addColorStop(0, `rgba(${Hc.b},0.55)`); wg.addColorStop(0.5, 'rgba(120,20,25,0.1)'); wg.addColorStop(1, `rgba(${Hc.a},0.5)`)
    c.globalCompositeOperation = 'lighter'; c.fillStyle = wg; c.fillRect(-20, -20, w + 40, h + 40)
    speedLines(c, w * 0.68, h * 0.42, 1, ult.lines, 0.32, '255,236,200')
    c.globalCompositeOperation = 'source-over'
    // diagonal crimson bands
    c.fillStyle = `rgba(${Hc.b},0.9)`; para(c, -200, h * 0.86, w + 400, 26, -60); c.fill()
    c.fillStyle = `rgba(${Hc.a},0.9)`; para(c, -200, h * 0.86 + 32, w + 400, 6, -60); c.fill()
    c.globalAlpha = 1 - out
    const drift = k * 18
    // panel C: the pose, big on the right; drawn first so the slim panels slam over it
    const pc = slam(0.42, 0.14)
    if (pc > 0) {
      const px = w * 0.52 + (1 - pc) * w * 0.6, pw = w * 0.56
      c.save(); para(c, px, -10, pw, h + 20, 70); c.clip()
      const bg = c.createRadialGradient(px + pw * 0.5, h * 0.35, 10, px + pw * 0.5, h * 0.4, pw)
      bg.addColorStop(0, 'rgba(255,246,220,1)'); bg.addColorStop(0.22, `rgba(${Hc.a},1)`); bg.addColorStop(0.6, `rgba(${Hc.b},1)`); bg.addColorStop(1, 'rgba(40,4,10,1)')
      c.fillStyle = bg; c.fillRect(px - 100, -10, pw + 200, h + 20)
      speedLines(c, px + pw * 0.5, h * 0.35, 1, ult.lines, 0.55, '255,255,240')
      c.restore()
      // the figure breaks out of the frame
      const ph = h * 1.22, tx = px + pw * 0.56 - drift * 0.4
      if (pose && pose.width) { const s = ph / pose.height; c.drawImage(pose, tx - pose.width * s / 2, h - ph + h * 0.16 + (1 - pc) * 80, pose.width * s, ph) }
      else drawPoseFallback(c, ult.hero, tx, Hc, k)
      c.save(); c.lineWidth = 10; c.strokeStyle = '#120406'; para(c, px, -10, pw, h + 20, 70); c.stroke()
      c.lineWidth = 3; c.strokeStyle = `rgb(${Hc.a})`; c.stroke(); c.restore()
    }
    // panel A: the eyes, a wide band across the top
    const pa = slam(0.06, 0.12)
    if (pa > 0) {
      const bx = -80 + (pa - 1) * w * 1.1, by = h * 0.1, bw = w * 0.78, bh = h * 0.3
      c.save(); para(c, bx, by, bw, bh, 48); c.clip()
      c.fillStyle = '#1a0608'; c.fillRect(bx - 60, by, bw + 120, bh)
      if (eyes && eyes.width) cover(c, eyes, eyes.width * 0.02 + drift, eyes.height * 0.36, eyes.width * 0.96, eyes.height * 0.6, bx - 50, by, bw + 100, bh)
      else drawEyesProc(c, bx, by, bw, bh, Hc)
      const sh = c.createLinearGradient(bx, 0, bx + bw, 0); sh.addColorStop(0, `rgba(${Hc.b},0.45)`); sh.addColorStop(0.35, 'rgba(0,0,0,0)'); sh.addColorStop(1, `rgba(${Hc.a},0.25)`)
      c.fillStyle = sh; c.fillRect(bx - 60, by, bw + 120, bh)
      c.restore()
      c.lineWidth = 9; c.strokeStyle = '#120406'; para(c, bx, by, bw, bh, 48); c.stroke(); c.lineWidth = 2.5; c.strokeStyle = `rgb(${Hc.a})`; c.stroke()
    }
    // panel B: the face, lower left
    const pb = slam(0.24, 0.12)
    if (pb > 0) {
      const bx = w * 0.06 + (pb - 1) * w * 0.8, by = h * 0.44 + (1 - pb) * 60, bw = w * 0.4, bh = h * 0.38
      c.save(); para(c, bx, by, bw, bh, 40); c.clip()
      c.fillStyle = `rgb(${Hc.b})`; c.fillRect(bx - 60, by, bw + 120, bh)
      speedLines(c, bx + bw * 0.5, by + bh * 0.5, 1, ult.lines, 0.4, '255,230,200')
      const f = ult.face
      if (pose && pose.width) {
        const fr = [pose.width * f[0], pose.height * f[1], pose.width * f[2], pose.height * f[3]]
        const z = 1 + k * 0.04
        cover(c, pose, fr[0], fr[1], fr[2] / z, fr[3] / z, bx - 40, by, bw + 80, bh)
      } else drawFaceFallback(c, ult.hero, bx, by, bw, bh, Hc, k)
      c.restore()
      c.lineWidth = 9; c.strokeStyle = '#120406'; para(c, bx, by, bw, bh, 40); c.stroke(); c.lineWidth = 2.5; c.strokeStyle = `rgb(${Hc.a})`; c.stroke()
    }
    // slam flashes
    for (const t0 of [0.06, 0.24, 0.42]) { const d = (k - t0 - 0.12) / 0.06; if (d > 0 && d < 1) { c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,240,210,${0.22 * (1 - d)})`; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over' } }
    // move name plate, under the eye band: off by default (the voice says it and the small subtitle shows it)
    if (ult.name && ult.showName && k > 0.48) {
      const a = cl((k - 0.48) / 0.08, 0, 1)
      c.globalAlpha = a * (1 - out)
      c.font = '700 22px "Cinzel", "Shippori Mincho", Georgia, serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; if ('letterSpacing' in c) c.letterSpacing = '3px'
      const tx = w * 0.08 + (1 - a) * -40, ty = h * 0.88 - 22, tw = c.measureText(ult.name.toUpperCase()).width
      c.fillStyle = 'rgba(14,3,5,0.92)'; para(c, tx - 18, ty - 18, tw + 52, 36, 10); c.fill()
      c.fillStyle = `rgb(${Hc.a})`; c.fillRect(tx - 6, ty + 14, tw + 30, 2)
      c.fillStyle = '#fff4e0'
      if ('letterSpacing' in c) c.letterSpacing = '3px'
      c.fillText(ult.name.toUpperCase(), tx + 8, ty)
      if ('letterSpacing' in c) c.letterSpacing = '0px'
    }
    // white flash on exit
    c.globalAlpha = 1
    const fl = k < 1.12 ? 0 : k < 1.24 ? (k - 1.12) / 0.12 : 1 - (k - 1.24) / 0.16
    if (fl > 0) { c.fillStyle = `rgba(255,250,240,${cl(fl, 0, 1)})`; c.fillRect(-20, -20, w + 40, h + 40) }
    c.restore()
  }
  // -------------------------------------------------------------- loop
  function update(dt) {
    dt = cl(+dt || 0, 0, 0.1)
    for (let i = fxs.length - 1; i >= 0; i--) {
      const e = fxs[i]; e.t += dt
      if (e.update) e.update(dt, e)
      if (e.t >= e.dur) fxs.splice(i, 1)
    }
    for (const p of parts) if (p.on) {
      p.t += dt; if (p.t >= p.life) { p.on = false; continue }
      p.vy += p.g * dt; const dr = p.kind ? 0.985 : 0.94; p.vx *= dr; p.vy *= dr
      p.x += p.vx * dt; p.y += p.vy * dt
    }
    windT += dt; wind = 26 + Math.sin(windT * 0.4) * 16
    for (const p of puffs) if (p.on) {
      p.t += dt; if (p.t >= p.life) { p.on = false; continue }
      const k = p.t / p.life
      p.vx += (wind - p.vx) * 0.6 * dt; p.vy *= 1 - 0.4 * dt; p.vy -= 6 * dt
      p.x += (p.vx + Math.sin(p.t * 1.3 + p.ph) * 8) * dt; p.y += p.vy * dt
      p.r += p.grow * dt * (1 - k * 0.7); p.rot += p.vr * dt
    }
  }
  function drawSmoke() {
    const c = C()
    if (!puffProc) bakeProc()
    const red = typeof ECL !== 'undefined' && !!ECL
    c.save(); c.globalCompositeOperation = 'source-over'
    for (const p of puffs) if (p.on) {
      const k = p.t / p.life, a = p.a * cl(p.t / 0.18, 0, 1) * (1 - easeIn(cl((k - 0.3) / 0.7, 0, 1)) * 1)
      if (a <= 0.01) continue
      // during Baker's Crimson Eclipse the arena is red: grey puffs read as dirt, so they turn blood-dark
      const sets = puffArt || puffProc, set = (red && sets.blood) || sets[p.col], img = set[p.v % set.length], s = p.r * 2.6
      // smoke thins out where it would sit over the heroine, so she never reads as faded
      const near = typeof P !== 'undefined' ? Math.hypot(p.x - P.x, (p.y - (P.y - 80)) * 0.8) : 999, keep = near < 170 ? 0.3 + 0.7 * (near / 170) ** 2 : 1
      c.globalAlpha = (red ? a * 0.7 : a) * keep
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(img, -s / 2, -s / 2, s, s); c.restore()
    }
    c.restore()
  }
  function drawParts() {
    const c = C()
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'
    for (const p of parts) if (p.on) {
      const k = p.t / p.life, a = 1 - k
      if (p.kind === 1) { c.fillStyle = `rgba(${p.color},${a})`; c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, TAU); c.fill(); continue }
      c.strokeStyle = `rgba(${p.color},${a})`; c.lineWidth = p.size * (1 - k * 0.6)
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke()
    }
    c.restore()
  }
  function draw() {
    const c = C(); if (!c) return
    drawSmoke()
    for (const e of fxs) { c.save(); try { e.draw(Math.min(1, e.t / e.dur), e) } catch (err) { e.t = e.dur } c.restore() }
    drawParts()
  }
  function drawScreen() { const c = C(); if (!c) return; drawUlt() }

  loadAll()
  return {
    slash: safe(slash, null), hit: safe(hit), thunderBlade: safe(thunderBlade), smoke: safe(smoke),
    ultPanel: safe(ultPanel, 1.4), update: safe(update), draw: safe(draw), drawScreen: safe(drawScreen),
    load: safe(loadAll), clear: safe(() => { fxs.length = 0; for (const p of parts) p.on = false; for (const p of puffs) p.on = false; ult = null }),
    get busy() { return !!ult }, img: IMG,
  }
})()
