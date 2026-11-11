// ARES mood: light and weather on top of a stage kit. Reads the kit's own kit.json fields
// (assets/stages/<kit>/kit.json, fetched once per kit):
//   night 0..1   a dark layer over sky, far scenery, ground and platforms, under the fighters;
//                the fighters get a warm lantern glow at their feet
//   moon {x, y}  where the painted moon sits in sky.webp (fractions): a big soft halo in the
//                sky, and a thin ivory rim on the side of each fighter that faces it
//   storm        lightning now and then: a 2-3 frame white flash, then a darker beat
//   wet          faint puddle reflections: the fighter flipped under the floor line
//   flicker 0..1 the haze breathes +-3 % on a noise curve (braziers, torches, lanterns)
//   heat 0..1    a heat-haze wobble on the far scenery
//   weather      snow, petals and embers also get a near layer in front of the fighters:
//                bigger, slower, blurred
// PERF.low: fewer near particles (6, else 14), no reflections, no rim, no wobble.
// Hooks, all wraps: drawLookSky (moon halo), drawHazards (runs after the ground and platforms
// and before the fighters: night layer, flicker, foot glow), drawSprite and drawSheet (rim,
// reflection), drawOverlay (near layer, lightning), drawFarPiece (stage.js, heat wobble).
'use strict'

const MOOD = { id: null, k: {}, near: [], kind: null, bolt: { next: 5, f: -1 }, inFight: false, last: 0, camX: null }

;(function () {
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const cache = {}
  const warn = (e) => { if (!MOOD.warned) { MOOD.warned = true; console.warn('MOOD', e) } }

  function cur() {
    const id = typeof stage !== 'undefined' && stage ? stage.kit : null
    if (id !== MOOD.id) {
      MOOD.id = id; MOOD.k = cache[id] || {}; MOOD.near = []; MOOD.kind = null
      if (id && !(id in cache)) {
        cache[id] = null
        getJSON(`../assets/stages/${id}/kit.json`).then(k => { cache[id] = k; if (MOOD.id === id) MOOD.k = k }).catch(() => { cache[id] = {} })
      }
    }
    return MOOD.k || {}
  }
  // smooth noise in -1..1
  const noise = t => 0.5 * Math.sin(t * 2.1) + 0.3 * Math.sin(t * 5.3 + 1.7) + 0.2 * Math.sin(t * 11.7 + 0.4)

  // the painted moon on screen, for each tiled copy of the sky in view (same maths as drawWorld)
  function moons() {
    const m = MOOD.k.moon, sky = typeof kit !== 'undefined' && kit && kit.sky
    if (!m || !sky) return []
    const ss = H / sky.height * 1.05, sw = sky.width * ss, off = -(cam.x * 0.06) % sw
    const y = -(cam.y * 0.04) - H * 0.025 + m.y * H * 1.05, out = []
    for (let x = off - sw + m.x * sw; x < W + sw; x += sw) if (x > -H * 0.6 && x < W + H * 0.6) out.push({ x, y })
    return out
  }
  const toWorld = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z })

  // ---------------------------------------------------------------- sky: the moon halo
  const baseSky = window.drawLookSky
  window.drawLookSky = function () {
    MOOD.inFight = false
    if (baseSky) baseSky()
    try {
      const k = cur()
      if (!k.moon) return
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      for (const m of moons()) {
        const r = H * 0.62, g = ctx.createRadialGradient(m.x, m.y, H * 0.05, m.x, m.y, r)
        g.addColorStop(0, 'rgba(255,246,228,0.30)'); g.addColorStop(0.35, 'rgba(255,238,214,0.10)'); g.addColorStop(1, 'rgba(255,238,214,0)')
        ctx.fillStyle = g; ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2)
      }
      ctx.restore()
    } catch (e) { warn(e) }
  }

  // ---------------------------------------------------------------- under the fighters
  function fighters() {
    const out = []
    if (typeof P !== 'undefined' && !P.dead) out.push({ x: P.x, y: P.y })
    for (const e of (typeof enemies !== 'undefined' ? enemies : [])) if (!e.dead) out.push({ x: e.x, y: e.y })
    if (typeof B !== 'undefined' && B && !B.dead) out.push({ x: B.x, y: B.y })
    return out
  }
  const baseHz = window.drawHazards
  window.drawHazards = function () {
    if (baseHz) baseHz()
    try {
      const k = cur(), x0 = cam.x - 80, y0 = cam.y - 80, w = VW() + 160, h = VH() + 160
      ctx.save()
      if (k.night > 0) {
        // the dark layer, thinner around the moon so it still glows
        const ms = moons(), a = Math.min(0.85, k.night * 0.75)
        if (ms.length) {
          const m = toWorld(ms[0].x, ms[0].y), r = H * 0.7 / cam.z, g = ctx.createRadialGradient(m.x, m.y, r * 0.1, m.x, m.y, r)
          g.addColorStop(0, `rgba(8,9,20,${a * 0.35})`); g.addColorStop(1, `rgba(8,9,20,${a})`)
          ctx.fillStyle = g
        } else ctx.fillStyle = `rgba(8,9,20,${a})`
        ctx.fillRect(x0, y0, w, h)
      }
      if (k.flicker > 0) {
        const n = noise(T * 1.3) * 0.03 * Math.min(1, k.flicker * 1.4)
        if (n > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,170,90,${n})` } else ctx.fillStyle = `rgba(20,10,6,${-n})`
        ctx.fillRect(x0, y0, w, h); ctx.globalCompositeOperation = 'source-over'
      }
      if (k.night > 0) {
        // a warm lantern glow at each fighter's feet
        ctx.globalCompositeOperation = 'lighter'
        const a = Math.min(0.4, 0.2 + k.night * 0.3) * (1 + noise(T * 2.4) * 0.08)
        for (const f of fighters()) {
          if (f.x < x0 || f.x > x0 + w) continue
          const fy = Math.min(f.y, typeof groundAt === 'function' ? groundAt(f.x, f.y - 2) : f.y), lift = Math.max(0, fy - f.y)
          const fall = Math.max(0, 1 - lift / 360)
          if (fall <= 0 || !isFinite(fy)) continue
          ctx.save(); ctx.translate(f.x, fy - 4); ctx.scale(1, 0.4)
          const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 150)
          g.addColorStop(0, `rgba(255,190,110,${a * fall})`); g.addColorStop(0.5, `rgba(255,150,70,${a * 0.35 * fall})`); g.addColorStop(1, 'rgba(255,140,60,0)')
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill(); ctx.restore()
          // and a little of it up the body
          const g2 = ctx.createRadialGradient(f.x, f.y - 70, 10, f.x, f.y - 70, 130)
          g2.addColorStop(0, `rgba(255,180,110,${0.07 * fall})`); g2.addColorStop(1, 'rgba(255,180,110,0)')
          ctx.fillStyle = g2; ctx.fillRect(f.x - 130, f.y - 200, 260, 260)
        }
      }
      ctx.restore()
    } catch (e) { ctx.restore(); warn(e) }
    MOOD.inFight = true
  }

  // ---------------------------------------------------------------- the fighters: rim and reflection
  let rimC = null
  function rimOf(s, frame) {
    const slot = s.img.height, cw = Math.max(16, Math.round(Math.min(slot, 360)))
    rimC ||= document.createElement('canvas')
    if (rimC.width !== cw) { rimC.width = cw; rimC.height = cw }
    const g = rimC.getContext('2d')
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cw, cw)
    g.drawImage(s.img, (s.n ? frame % s.n : frame) * slot, 0, slot, slot, 0, 0, cw, cw)
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff4de'; g.fillRect(0, 0, cw, cw)
    return rimC
  }
  function around(s, frame, x, y, face, k, redraw) {
    const K = MOOD.k
    if (!K || low()) return
    if (K.wet && y > GROUND - 300 && !(typeof inPit === 'function' && inPit(x))) {
      ctx.save(); ctx.beginPath(); ctx.rect(cam.x - 200, GROUND, VW() + 400, VH() + 400); ctx.clip()
      ctx.translate(0, GROUND * 2); ctx.scale(1, -0.92)
      redraw(0.16 * Math.max(0, 1 - (GROUND - y) / 300))
      ctx.restore()
    }
    if (K.moon && K.night > 0) {
      const ms = moons()
      if (!ms.length) return
      const sx = (x - cam.x) * cam.z, sy = (y - 80 - cam.y) * cam.z
      let dx = ms[0].x - sx, dy = ms[0].y - sy; const d = Math.hypot(dx, dy) || 1
      const o = 3.2; dx = dx / d * o; dy = dy / d * o
      const slot = s.img.height, c = rimOf(s, frame)
      ctx.save(); ctx.globalAlpha = Math.min(0.85, 0.4 + K.night); ctx.translate(x + dx, y + dy); ctx.scale(face * k, k)
      ctx.drawImage(c, -s.x, -s.y, slot, slot); ctx.restore()
    }
  }
  const okNow = (alpha) => MOOD.inFight && alpha > 0.9 && ctx.globalCompositeOperation === 'source-over' && MOOD.k && (MOOD.k.wet || MOOD.k.moon)
  const baseSprite = window.drawSprite
  window.drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
    if (okNow(alpha)) try {
      const s = A.sheets?.[hero]?.[sheet]
      if (s?.img) around(s, frame, x, y, face, SCALE[hero] * scale, a => baseSprite(hero, sheet, frame, x, y, face, a, scale))
    } catch (e) { warn(e) }
    return baseSprite.apply(this, arguments)
  }
  const baseSheet = window.drawSheet
  window.drawSheet = function (s, frame, x, y, face, scale = 1, alpha = 1) {
    if (s?.img && okNow(alpha)) try { around(s, frame, x, y, face, scale, a => baseSheet(s, frame, x, y, face, scale, a)) } catch (e) { warn(e) }
    return baseSheet.apply(this, arguments)
  }

  // ---------------------------------------------------------------- far scenery: heat haze
  const baseFar = window.drawFarPiece
  window.drawFarPiece = function (img, x, y, w, h) {
    const heat = MOOD.k?.heat
    if (!heat || low() || !img.height) return baseFar ? baseFar(img, x, y, w, h) : ctx.drawImage(img, x, y, w, h)
    const bands = Math.max(6, Math.round(h / 7)), sh = img.height / bands, bh = h / bands
    for (let i = 0; i < bands; i++) {
      const off = Math.sin(T * 3.1 + i * 0.55 + x * 0.01) * 2.2 * heat * (0.4 + 0.6 * i / bands)
      ctx.drawImage(img, 0, i * sh, img.width, sh + 0.5, x + off, y + i * bh, w, bh + 0.5)
    }
  }

  // ---------------------------------------------------------------- in front: near weather, lightning
  const NEAR = { snow: 1, petals: 1, embers: 1 }
  const sprites = {}
  function sprite(kind) {
    if (sprites[kind]) return sprites[kind]
    const c = document.createElement('canvas'); c.width = c.height = 64
    const g = c.getContext('2d')
    try { g.filter = 'blur(3px)' } catch { }
    if (kind === 'petals') {
      g.fillStyle = 'rgba(255,206,212,0.95)'; g.beginPath(); g.ellipse(32, 32, 20, 10, 0.4, 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(255,238,236,0.8)'; g.beginPath(); g.ellipse(28, 30, 8, 4, 0.4, 0, Math.PI * 2); g.fill()
    } else {
      const col = kind === 'embers' ? '255,170,80' : '255,250,246'
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 22)
      r.addColorStop(0, `rgba(${col},1)`); r.addColorStop(0.5, `rgba(${col},0.6)`); r.addColorStop(1, `rgba(${col},0)`)
      g.fillStyle = r; g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.fill()
    }
    return (sprites[kind] = c)
  }
  function spawn(kind, top) {
    const p = { x: R(-60, W + 60), y: top ? R(-80, -20) : R(-40, H + 40), s: R(0.7, 1.3), rot: R(0, 6.3), spin: R(-1.2, 1.2), ph: R(0, 6.3), a: R(0.45, 0.8) }
    if (kind === 'embers') { if (top) p.y = R(H + 20, H + 80); p.vx = R(-15, 25); p.vy = -R(30, 70); p.size = R(14, 26) }
    else if (kind === 'petals') { p.vx = R(30, 70); p.vy = R(28, 55); p.size = R(30, 50) }
    else { p.vx = R(-10, 20); p.vy = R(35, 65); p.size = R(16, 32) }
    return p
  }
  function nearLayer(k, dt) {
    const kind = NEAR[k.weather] ? k.weather : null
    if (kind !== MOOD.kind) { MOOD.kind = kind; MOOD.near = [] }
    if (!kind) return
    const want = low() ? 6 : 14
    while (MOOD.near.length < want) MOOD.near.push(spawn(kind, false))
    if (MOOD.near.length > want) MOOD.near.length = want
    const pan = MOOD.camX == null ? 0 : (cam.x - MOOD.camX) * cam.z * 1.4
    MOOD.camX = cam.x
    const img = sprite(kind)
    ctx.save(); if (kind === 'embers') ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < MOOD.near.length; i++) {
      const p = MOOD.near[i]
      p.x += (p.vx + Math.sin(T * 0.9 + p.ph) * 18) * dt - pan; p.y += p.vy * dt; p.rot += p.spin * dt
      if (p.y > H + 90 || p.y < -100) { MOOD.near[i] = spawn(kind, true); continue }
      if (p.x < -100) p.x += W + 200; else if (p.x > W + 100) p.x -= W + 200
      const s = p.size * p.s * 1.4
      ctx.globalAlpha = p.a * (kind === 'embers' ? 0.7 + 0.3 * Math.sin(T * 6 + p.ph) : 1)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(kind === 'petals' ? p.rot : 0); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore()
    }
    ctx.restore()
  }
  function lightning(k, dt) {
    if (!k.storm) return
    const b = MOOD.bolt
    if (b.f < 0) { b.next -= dt; if (b.next <= 0) { b.f = 0; b.next = R(5, 11); b.two = Math.random() < 0.35 } return }
    const seq = b.two ? [0.3, 0.1, 0.38] : [0.38, 0.24]
    if (b.f < seq.length) { ctx.fillStyle = `rgba(255,250,242,${seq[b.f]})`; ctx.fillRect(0, 0, W, H) }
    else { const d = (b.f - seq.length) / 16; if (d < 1) { ctx.fillStyle = `rgba(4,4,10,${0.3 * (1 - d)})`; ctx.fillRect(0, 0, W, H) } else b.f = -2 }
    b.f++
  }
  const baseOverlay = window.drawOverlay
  window.drawOverlay = function () {
    MOOD.inFight = false
    try {
      const now = performance.now(), dt = Math.min(0.05, MOOD.last ? (now - MOOD.last) / 1000 : 0.016); MOOD.last = now
      const k = cur()
      nearLayer(k, dt)
      lightning(k, dt)
    } catch (e) { warn(e) }
    return baseOverlay.apply(this, arguments)
  }
})()
