// 天衝濤 Heavenpierce Tide: Baker's (hero id `messenger`) ground-slam skill on U, 9 s cooldown.
// Layered on the core like moves.js and thousand.js (classic scripts, one global scope).
//
// 1. Wind-up: she hops and raises the greatsword (slash3 frames), then plunges (airslam frames).
//    Pressed in the air, she drops straight into the plunge.
// 2. Impact on landing: hitstop, a big shake, a flash, a soft ground shock and a gold crack.
// 3. The tide: a wall of light erupts in front of her and rolls forward along the floor, as tall
//    as the whole view (it always reaches past the top of the screen). It is drawn as soft
//    columns (cached gradient sprites: crimson haze, rose, gold, a white-hot core), banded
//    energy ribbons that sway up it, crimson-gold lightning veins that crawl upward, rounded rock
//    chunks, dust (FXK.smoke) at its base and ember sparks.
// 4. Damage: everything the wall passes through takes repeated hits, each one launching it
//    higher (bosses take the damage without the launch). Breakable platforms it passes break.
//
// Sword level (TRAIL.level(), trails.js): tier 2 is wider, brighter and hits harder; tier 3 adds
// a rose echo wave a beat behind and more lightning. PERF.low: fewer columns, ribbons, veins and
// particles. Colours: white-hot, gold, crimson, rose. Never blue, purple or green.
// Sound: SFX.heavy() and SFX.boom() at impact, plus the optional hook SFX.skywave(). Voice: her
// line assets/voice/messenger/skywave.mp3 (heroes.json moves.skywave.line), with the name subtitle.
// Autopilot: AUTO uses it on a group of three or more ahead of her.

const SKYWAVE = { cd: 9, waves: [] }

{
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const tierOf = () => typeof TRAIL !== 'undefined' && TRAIL.level ? TRAIL.level() : 1
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3)
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const GOLD = '255,180,70', WHITE = '255,245,225', CRIMSON = '200,25,45', ROSE = '255,120,140', EMBER = '255,200,120'
  const ORANGE = '255,140,50', CORAL = '255,150,110', COL_LIFE = 1.3
  // Additive light only in warm, green-heavy colours (gold, orange, white): red or rose added over
  // a blue sky turns lavender. The crimson and rose body is drawn over normally (source-over),
  // inside a gold-orange haze, so its soft edges never fringe purple.

  // ---- the move: a hop, then the plunge; the eruption fires on landing (see tick)
  MOVES.messenger.skywave = { sheet: 'slash3', dur: 2.2, cancel: 2.2, cd: SKYWAVE.cd, move: 0, jump: -560, voice: 'skywave', hits: [] }
  SKILL_KEYS.messenger.u = 'skywave'   // the core binds the key and draws the cooldown on the HUD

  // ---- soft column sprites: a horizontal falloff times a vertical one (bright at the base,
  // fading to nothing at the top), rendered once per colour
  const COLS = new Map()
  function colSprite(rgb, core) {
    const key = rgb + (core ? '+' : '')
    let c = COLS.get(key); if (c) return c
    const w = 32, h = 128
    c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d'), im = g.createImageData(w, h), [r0, g0, b0] = rgb.split(',').map(Number)
    const e = Math.exp(-3.4)
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h, vert = sm(0, 0.62, v) * (1 - sm(0.84, 1, v))
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / (w / 2) - 1, hz = Math.max(0, (Math.exp(-3.4 * u * u) - e) / (1 - e))
        const wh = core ? Math.pow(hz, 3) * 0.85 : 0, i = (y * w + x) * 4
        im.data[i] = lerp(r0, 255, wh); im.data[i + 1] = lerp(g0, 252, wh); im.data[i + 2] = lerp(b0, 240, wh)
        im.data[i + 3] = 255 * hz * vert
      }
    }
    g.putImageData(im, 0, 0)
    COLS.set(key, c); return c
  }
  function column(rgb, x, base, top, hw, a, core) {
    if (a <= 0.004 || base - top < 4) return
    ctx.globalAlpha = Math.min(1, a)
    ctx.drawImage(colSprite(rgb, core), x - hw, top, hw * 2, (base - top) * 1.04 + hw * 0.5)
    ctx.globalAlpha = 1
  }
  // a soft ellipse from the cached round dots (trails.js)
  function blob(rgb, x, y, rx, ry, a, core) {
    if (a <= 0.004 || typeof TRAIL === 'undefined' || !TRAIL.soft) return
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(TRAIL.soft(rgb, core), x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = 1
  }
  const dot = (...a) => typeof TRAIL !== 'undefined' && TRAIL.dot && TRAIL.dot(...a)
  function polyline(pts, upto = 1) {
    const n = Math.max(2, Math.ceil(pts.length * upto))
    ctx.beginPath(); for (let i = 0; i < n && i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1])
  }
  function jagUp(x, y0, y1, n, jag) {
    const pts = [[x, y0]]
    for (let i = 1; i <= n; i++) { const k = i / n; pts.push([x + R(-jag, jag) * (0.4 + k), lerp(y0, y1, k) + R(-8, 8)]) }
    return pts
  }

  // ---- one travelling wave
  function makeWave(o) {
    const tr = tierOf(), L = low()
    const gy = o.gy, face = o.face, scale = o.scale || 1
    const ar = typeof AR === 'function' ? AR() : null
    const edge = face > 0 ? Math.min(rightBound(), ar ? ar.r : Infinity) : Math.max(leftBound(), ar ? ar.l : -Infinity)
    const range = o.range ? Math.max(40, Math.min(o.range, Math.abs(edge - o.x))) : Math.max(160, Math.min((780 + 90 * tr) * scale, Math.abs(edge - o.x)))
    const W_ = {
      t: 0, x0: o.x, face, gy, front: o.x, range, speed: 760 * (o.speed || 1), scale, echo: !!o.echo,
      hw: (66 + 12 * (tr - 1)) * scale, bright: (1 + 0.22 * (tr - 1)) * (o.echo ? 0.7 : 1),
      tint: o.echo ? ROSE : GOLD,
      cols: [], ribbons: [], veins: [], rocks: [], embers: [], crack: [], branches: [],
      spacing: L ? 46 : 26, lastCol: o.x - face * 30, vein: 0, rock: 0, emb: 0, puff: 0,
      hitLog: new Map(), maxHits: o.maxHits || (o.echo ? 3 : 4 + tr), rate: o.rate || 1, dmgMul: o.dmg || 1, plats: new Set(), done: false,
      life: 0, dur: 0,
    }
    W_.travel = range / W_.speed; W_.dur = W_.travel + COL_LIFE + 0.1
    // the crack: a jagged gold line along the floor, with short branches
    let cx = o.x, cy = gy - 1
    while (Math.abs(cx - o.x) < range + 30) { W_.crack.push([cx, cy]); cx += face * R(14, 30); cy = gy - 1 + R(-3, 3) }
    if (!o.echo) for (let i = 0; i < (L ? 3 : 7); i++) {
      const at = W_.crack[(Math.random() * W_.crack.length) | 0], pts = [at]
      let bx = at[0], by = at[1]
      for (let j = 0; j < 4; j++) { bx += face * R(6, 18) + R(-6, 6); by += R(-1, 4); pts.push([bx, by]) }
      W_.branches.push({ pts, d: Math.abs(at[0] - o.x) })
    }
    // ribbons: banded streamers that sway up the wall, riding near the front
    const nR = o.ribbons != null ? (L ? Math.min(2, o.ribbons) : o.ribbons) : L ? 3 : 5 + 2 * tr
    for (let i = 0; i < nR; i++) W_.ribbons.push({ off: R(-20, 280), ph: R(0, 6.28), amp: R(16, 46) * scale, fq: R(0.006, 0.013), w: R(5, 12) * scale, col: [GOLD, '255,200,110', WHITE, GOLD, ORANGE][i % 5], h: R(0.92, 1.12), lean: R(20, 70) })
    return W_
  }
  const topY = () => cam.y - 60

  function stepWave(w, dt) {
    w.t += dt
    const L = low(), tr = tierOf(), face = w.face, top = topY()
    const prevFront = w.front
    if (w.t < w.travel) w.front = w.x0 + face * Math.min(w.range, w.speed * w.t)
    const fade = w.t < w.travel ? 1 : Math.max(0, 1 - (w.t - w.travel) / 0.9)
    // new columns where the front passed
    while (w.t < w.travel + 0.02 && (w.front - w.lastCol) * face >= w.spacing) {
      w.lastCol += face * w.spacing
      w.cols.push({ x: w.lastCol + R(-6, 6), t: 0, h: R(0.82, 1.08), sw: R(0, 6.28) })
    }
    for (const c of w.cols) c.t += dt
    w.cols = w.cols.filter(c => c.t < COL_LIFE)
    // particles at the front
    const live = w.t < w.travel
    if (live && (w.vein -= dt) <= 0) {
      w.vein = (L ? 0.09 : 0.05) / (tr >= 3 ? 1.7 : 1) / w.rate
      const x = w.front - face * R(0, 150) * w.scale
      const y1 = top + R(0, (w.gy - top) * 0.35)
      const v = { t: 0, life: R(0.18, 0.3), pts: jagUp(x, w.gy - R(0, 40), y1, L ? 7 : 11, 18 * w.scale), col: Math.random() < 0.5 ? CRIMSON : '255,150,60' }
      if (!L && Math.random() < 0.5) { const j = v.pts[(v.pts.length * R(0.3, 0.7)) | 0]; v.br = jagUp(j[0], j[1], j[1] - R(80, 220), 4, 22).map(([a, b]) => [a + face * R(10, 50), b]) }
      w.veins.push(v)
    }
    for (const v of w.veins) v.t += dt
    w.veins = w.veins.filter(v => v.t < v.life)
    if (live && (w.rock -= dt) <= 0) {
      w.rock = (L ? 0.09 : 0.035) / w.rate
      const n = w.echo ? 1 : 2
      for (let i = 0; i < n; i++) {
        const sz = R(4, 13) * w.scale, rad = []
        for (let j = 0; j < 7; j++) rad.push(R(0.7, 1.15))
        w.rocks.push({ x: w.front + R(-30, 30), y: w.gy - 4, vx: face * R(40, 260) + R(-120, 120), vy: -R(700, 1500), g: 1700, rot: R(0, 6.28), vr: R(-8, 8), sz, rad, t: 0, life: R(1.0, 1.6) })
      }
    }
    if (live && (w.emb -= dt) <= 0) {
      w.emb = (L ? 0.05 : 0.016) / w.rate
      w.embers.push({ x: w.front - face * R(0, 120) + R(-30, 30), y: w.gy - R(0, (w.gy - top) * 0.8), vx: R(-80, 80) + face * 60, vy: -R(160, 520), t: 0, life: R(0.5, 1.1), sz: R(1.4, 3), col: Math.random() < 0.3 ? WHITE : Math.random() < 0.5 ? EMBER : CORAL })
    }
    if (live && (w.puff -= dt) <= 0) {
      w.puff = (L ? 0.16 : 0.09) / w.rate
      if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(w.front, w.gy - 8, L ? 1 : 2, { color: 'dust', size: 1.6 * w.scale, spread: 70, rise: 0.5, vx: face * 70 }) } catch { }
    }
    for (const r of w.rocks) { r.t += dt; r.vy += r.g * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt; if (r.y > w.gy - 3 && r.vy > 0) { r.y = w.gy - 3; r.vy *= -0.28; r.vx *= 0.5; r.vr *= 0.5 } }
    w.rocks = w.rocks.filter(r => r.t < r.life)
    for (const m of w.embers) { m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.vy -= 60 * dt; m.vx *= 1 - 1.2 * dt }
    w.embers = w.embers.filter(m => m.t < m.life)
    const cap = L ? 50 : 160
    if (w.embers.length > cap) w.embers.splice(0, w.embers.length - cap)
    if (w.rocks.length > cap / 2) w.rocks.splice(0, w.rocks.length - cap / 2)

    // damage: the hot band just behind the front
    if (w.t < w.travel + 0.25) {
      const zl = Math.min(w.front - face * 190 * w.scale, w.front + face * 40), zr = Math.max(w.front - face * 190 * w.scale, w.front + face * 40)
      for (const e of targets()) {
        const b = e.box(); if (b.x > zr || b.x + b.w < zl) continue
        const h = w.hitLog.get(e) || { n: 0, last: -9 }
        if (h.n >= w.maxHits || w.t - h.last < 0.1) continue
        h.n++; h.last = w.t; w.hitLog.set(e, h)
        const boss = e === B
        const dmg = (boss ? 9 + 2.5 * tr : 7 + 1.5 * tr) * (w.echo ? 0.7 : 1) * w.dmgMul
        damage(e, dmg, { x: e.x, y: b.y + b.h * 0.5, kb: boss ? 0 : face * 40, launch: boss ? 0 : (h.n === 1 ? -1050 : -620), small: h.n > 1 && h.n < w.maxHits })
        if (!boss) e.air = Math.max(e.air || 0, 1.4)
        if (h.n === 1 || Math.random() < 0.3) sparks(e.x, b.y + b.h * 0.5, 6, '255,225,170')
      }
      for (const p of plats) if (p.hp && !p.broken && !w.plats.has(p) && p.x < zr && p.x + p.w > zl) { w.plats.add(p); hurtPlat(p, 60) }
      for (const bl of bullets) if (bl.enemy && !bl.dead && bl.type !== 'doom' && bl.x > zl && bl.x < zr && bl.y < w.gy) bl.dead = true
    }
    w.fade = fade
    if (w.t >= w.dur) w.done = true
  }

  function drawWave(w) {
    const L = low(), face = w.face, gy = w.gy, top = topY(), H0 = gy - top, f = w.fade ?? 1
    if (f <= 0.003) return
    const tr = tierOf(), br = w.bright
    // the crack (under everything): dark seam, gold glow, white-hot thread
    const cl = clamp(Math.abs(w.front - w.x0) / (w.range + 30), 0, 1), ca = f * (w.echo ? 0.5 : 1)
    if (cl > 0.01 && w.crack.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = `rgba(70,14,10,${0.45 * ca})`; ctx.lineWidth = 5; polyline(w.crack, cl); ctx.stroke()
      ctx.globalCompositeOperation = 'lighter'
      for (const [lw, c, a] of [[16, CRIMSON, 0.22], [7, GOLD, 0.6], [2.2, WHITE, 0.95]]) { ctx.strokeStyle = `rgba(${c},${a * ca})`; ctx.lineWidth = lw; polyline(w.crack, cl); ctx.stroke() }
      for (const b of w.branches) if (b.d < Math.abs(w.front - w.x0)) for (const [lw, c, a] of [[6, GOLD, 0.35], [1.6, WHITE, 0.8]]) { ctx.strokeStyle = `rgba(${c},${a * ca})`; ctx.lineWidth = lw; polyline(b.pts); ctx.stroke() }
    }
    const life = c => { const k = c.t, rise = ease(k / 0.14), decay = k < 0.3 ? 1 : 1 - ease((k - 0.3) / (COL_LIFE - 0.3)); return { k, rise, decay } }
    // the body, drawn over normally: a gold-orange haze, then crimson, then rose inside it
    ctx.globalCompositeOperation = 'source-over'
    const body = w.echo ? ROSE : CRIMSON, inner = w.echo ? '255,170,150' : ROSE
    for (const c of w.cols) {
      const { k, rise, decay } = life(c), a = decay * Math.min(1, k / 0.05) * f
      const hgt = H0 * c.h * rise * (0.5 + 0.5 * decay) * 1.2, sx = Math.sin(T * 5 + c.sw) * 6, tp = gy - hgt
      column(ORANGE, c.x + sx, gy, tp, w.hw * 2.0, 0.34 * a)
      column(body, c.x - sx, gy, tp + hgt * 0.03, w.hw * 1.2, 0.5 * a)
      column(inner, c.x + sx * 0.5, gy, tp + hgt * 0.08, w.hw * 0.75, 0.42 * a)
    }
    if (w.t < w.travel + 0.1) {
      column(ORANGE, w.front, gy, top - 40, w.hw * 2.6, 0.4 * f)
      column(body, w.front - face * 10, gy, top - 30, w.hw * 1.6, 0.6 * f)
      column(inner, w.front - face * 16, gy, top - 10, w.hw * 1.0, 0.5 * f)
    }
    // light on top: gold glow and a narrow white-hot core
    ctx.globalCompositeOperation = 'lighter'
    blob(GOLD, w.front - face * 50, gy - 4, 190 * w.scale, 40 * w.scale, 0.4 * f * br, true)
    for (const c of w.cols) {
      const { k, rise, decay } = life(c), a = decay * Math.min(1, k / 0.05) * f * br
      const hgt = H0 * c.h * rise * (0.5 + 0.5 * decay) * 1.2, tp = gy - hgt
      column(GOLD, c.x, gy, tp + hgt * 0.1, w.hw * 0.7, 0.3 * a)
      if (decay > 0.3) column(WHITE, c.x, gy, tp + hgt * 0.22, w.hw * 0.26, 0.4 * a * decay, true)
    }
    if (w.t < w.travel + 0.1) {
      const a = f * br, sx = Math.sin(T * 9) * 6
      column(GOLD, w.front - face * 18 + sx, gy, top, w.hw * 0.95, 0.42 * a)
      column(WHITE, w.front - face * 22, gy, top + H0 * 0.1, w.hw * 0.36, 0.6 * a, true)
      blob(WHITE, w.front - face * 20, gy - 16, 46 * w.scale, 30 * w.scale, 0.45 * a, true)
    }
    // ribbons: banded streamers swaying up the wall, fading out toward the top
    if (w.t < w.travel + 0.6) {
      const ra = f * (w.t < w.travel ? 1 : 1 - (w.t - w.travel) / 0.6) * br
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const steps = L ? 10 : 16
      for (const r of w.ribbons) {
        const bx = w.front - face * r.off, hgt = H0 * r.h * 1.1
        const pts = []
        for (let i = 0; i <= steps; i++) {
          const k = i / steps, y = gy - hgt * k
          pts.push([bx + Math.sin(y * r.fq + T * 7 + r.ph) * r.amp * (0.3 + k) - face * r.lean * k * k, y])
        }
        for (const [lw, c, a] of [[r.w * 3.2, r.col, 0.1], [r.w * 1.5, r.col, 0.32], [r.w * 0.5, WHITE, 0.7]]) {
          const g = ctx.createLinearGradient(0, gy, 0, gy - hgt)
          g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.08, `rgba(${c},${a * ra})`); g.addColorStop(0.6, `rgba(${c},${a * ra * 0.7})`); g.addColorStop(1, `rgba(${c},0)`)
          ctx.strokeStyle = g; ctx.lineWidth = lw
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
          for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
          ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke()
        }
      }
    }
    // lightning veins crawling up
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const v of w.veins) {
      const k = v.t / v.life, grow = Math.min(1, k / 0.45), a = (1 - Math.max(0, k - 0.45) / 0.55) * f
      const LY = v.col === CRIMSON ? [[7, CRIMSON, 0.45, 'source-over'], [10, ORANGE, 0.18, 'lighter'], [2.6, '255,190,100', 0.8, 'lighter'], [1.1, WHITE, 0.9, 'lighter']] : [[10, ORANGE, 0.22, 'lighter'], [3.6, '255,200,110', 0.75, 'lighter'], [1.3, WHITE, 1, 'lighter']]
      for (const [lw, c, o, op] of LY) {
        ctx.globalCompositeOperation = op; ctx.strokeStyle = `rgba(${c},${o * a})`; ctx.lineWidth = lw
        polyline(v.pts, grow); ctx.stroke()
        if (v.br && grow > 0.6) { polyline(v.br, (grow - 0.6) / 0.4); ctx.stroke() }
      }
      const hd = v.pts[Math.min(v.pts.length - 1, Math.ceil(v.pts.length * grow) - 1)]
      ctx.globalCompositeOperation = 'lighter'
      if (hd) dot('255,220,170', hd[0], hd[1], 9, 0.8 * a, { core: true })
    }
    // embers
    for (const m of w.embers) {
      const k = m.t / m.life, a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * f
      dot(m.col, m.x, m.y, m.sz * 2.4, 0.85 * a, { len: Math.max(m.sz * 3, Math.hypot(m.vx, m.vy) * 0.035), a: Math.atan2(m.vy, m.vx), core: true })
    }
    // rocks: rounded chunks with a warm glow behind, drawn over normally so they read as stone
    for (const r of w.rocks) {
      const k = r.t / r.life, a = Math.min(1, (1 - k) * 3)
      ctx.globalCompositeOperation = 'lighter'; dot('255,150,60', r.x, r.y, r.sz * 2.4, 0.4 * a * (1 - k))
      ctx.globalCompositeOperation = 'source-over'
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot); ctx.globalAlpha = a
      const g = ctx.createRadialGradient(-r.sz * 0.3, -r.sz * 0.3, 0, 0, 0, r.sz * 1.2)
      g.addColorStop(0, 'rgb(150,104,78)'); g.addColorStop(0.6, 'rgb(96,62,48)'); g.addColorStop(1, 'rgb(58,34,28)')
      ctx.fillStyle = g; ctx.beginPath()
      const n = r.rad.length, P_ = i => { const an = i / n * Math.PI * 2; return [Math.cos(an) * r.sz * r.rad[i % n], Math.sin(an) * r.sz * r.rad[i % n]] }
      let p0 = P_(0), p1 = P_(1); ctx.moveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
      for (let i = 1; i <= n; i++) { const a_ = P_(i), b_ = P_(i + 1); ctx.quadraticCurveTo(a_[0], a_[1], (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2) }
      ctx.fill()
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5 * (1 - k)
      ctx.strokeStyle = `rgb(${GOLD})`; ctx.lineWidth = 1.2; ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
  }

  // one fx entry draws every live wave
  const MGR = { t: 0, dur: Infinity, skyMgr: true,
    update(dt) { for (const w of SKYWAVE.waves) stepWave(w, dt); SKYWAVE.waves = SKYWAVE.waves.filter(w => !w.done) },
    draw() { for (const w of SKYWAVE.waves) drawWave(w) },
  }
  function launchWave(o) {
    SKYWAVE.waves.push(makeWave(o))
    if (!fx.includes(MGR)) { MGR.t = 0; fx.push(MGR) }
  }
  SKYWAVE.launch = launchWave   // other code may raise a wave: {x, gy, face, scale, echo, speed, range, maxHits, ribbons, rate, dmg}

  // the impact
  function erupt() {
    const tr = tierOf(), face = P.face, x = P.x + face * 46, gy = P.y
    shake = Math.max(shake, 20 + 4 * tr); stopT = Math.max(stopT, 0.11); flash = Math.max(flash, 0.32); flashColor = '255,236,205'
    cam.kick = Math.max(cam.kick || 0, 0.5)
    P.iframe = Math.max(P.iframe, 0.4)
    SFX.heavy(); SFX.boom?.()
    if (typeof SFX !== 'undefined' && SFX.skywave) SFX.skywave()
    ring(x, gy - 20, 220, '255,215,160')
    if (typeof FXK !== 'undefined') {
      if (FXK.smoke) try { FXK.smoke(x, gy - 8, low() ? 4 : 9, { color: 'dust', size: 1.4, spread: 90, rise: 0.8 }) } catch { }
      if (FXK.hit) try { FXK.hit(x, gy - 30, face, 3) } catch { }
    }
    // a soft ground shock: a flattened glow that swells out from the blade
    fx.push({ t: 0, dur: 0.45, draw(k) {
      ctx.globalCompositeOperation = 'lighter'
      const e = ease(k), a = 1 - k
      blob(GOLD, x, gy - 4, 60 + 300 * e, 16 + 50 * e, 0.6 * a, true)
      blob(ORANGE, x, gy - 4, 90 + 380 * e, 24 + 70 * e, 0.4 * a)
      blob(WHITE, x, gy - 30, 70 * (1 - k * 0.5), 70 * (1 - k * 0.5), 0.8 * a, true)
    } })
    for (let i = 0; i < (low() ? 8 : 18); i++) parts.push({ x: x + R(-30, 30), y: gy - 4, vx: R(-420, 420), vy: R(-620, -160), life: R(0.4, 0.8), t: 0, size: R(2, 4), color: i % 3 ? '255,215,150' : '255,245,225', add: true, g: 1400 })
    launchWave({ x, gy, face })
    if (tr >= 3) later(0.32, () => launchWave({ x, gy, face, echo: true, scale: 0.85, speed: 1.08 }))
  }

  // ---- hooks into the core
  const baseUpdate = window.updatePlayer
  window.updatePlayer = function (dt) {
    baseUpdate(dt)
    const a = P.act
    if (!a || a.name !== 'skywave' || P.hero !== 'messenger') return
    if (!a.hit) {
      if (a.t > 0.2 && P.vy > -100) P.vy = Math.max(P.vy, 1300)   // the plunge
      if (!a.plunge && a.t > 0.18 && typeof TRAIL !== 'undefined' && TRAIL.swing && TRAIL.on) { a.plunge = true; try { TRAIL.swing('skywave', { r: 170, a0: -2.3, a1: 1.35, w: 46, sweep: 0.14 }, { style: 'bleed' }) } catch { } }
      if (P.ground && a.t > 0.12) { a.hit = a.t; erupt() }
      else if (a.t > 1.6) P.act = null                              // never landed (a pit): no wave
    } else if (a.t - a.hit > 0.42) P.act = null
  }
  const basePick = window.pickAnim
  window.pickAnim = function () {
    const a = P.act
    if (a && a.name === 'skywave' && P.hero === 'messenger' && !(P.dead || P.hurtT > 0)) {
      const n3 = A.sheets.messenger?.slash3?.n || 6, ns = A.sheets.messenger?.airslam?.n || 6
      if (!a.hit && P.vy < 250 && !a.plunge) return { sheet: 'slash3', frame: Math.min(n3 - 1, Math.floor(clamp(a.t / 0.2, 0, 1) * n3 * 0.25)) }
      if (!a.hit) return { sheet: 'airslam', frame: Math.min(ns - 1, Math.floor(ns * 0.4)) }
      return { sheet: 'airslam', frame: Math.min(ns - 1, Math.floor(ns * 0.55 + (a.t - a.hit) / 0.42 * ns * 0.45)) }
    }
    return basePick()
  }
  // autopilot: three or more ahead (or the boss and company) and it is ready
  const baseAuto = window.autopilot
  window.autopilot = function () {
    baseAuto()
    if (!AUTO.on || mode !== 'play' || P.dead || P.hero !== 'messenger' || P.cds.skywave > 0 || !P.ground || P.act || P.omni) return
    if (typeof ULT !== 'undefined' && ULT) return
    const ahead = targets().filter(e => (e.x - P.x) * P.face > 40 && (e.x - P.x) * P.face < 760)
    if (ahead.length >= 3 || (ahead.includes(B) && ahead.length >= 2)) vtap('u')
  }
}
