// ARES boss-spells.js: the big screen-filling boss spells. Loaded after foe-fx.js; adds
// patterns to boss.js's PATTERNS and slots each boss's signature spells into its later modes
// when the fight starts (fights.json stays as it is). Every spell has a tell you can read
// (floor marks, a charge glow, a ground line) and a safe place you can learn:
//
//   storm      lightning strikes at staggered spots; each one marks its spot first; step off it
//   firewall   fire pillars erupt across the floor and hold; the gaps are at the boss's feet
//              and at one marked spot
//   maelstrom  a thick smoky beam from a sigil above the boss, aimed past you; get under it
//              (close to the boss)
//   radiance   a holy cone from a halo in the sky over where you stand; run out past its edges
//   arcs       fans of homing lightning darts (gold: dash through them); Nicho's signature
//   nova       a slow molten orb bursts where its floor ring shows (late modes: three); step out
//   hound      a fire ring opens, a flame beast runs the lit floor lane (jump it) and erupts
//              into a gold pillar where it hits; GhostBear's signature
//   stopped_hour  bursts of knives, cards and orbs leave the boss's hand, brake and lock in a
//              sepia stop with aim lines; colour snaps back and they launch group by group:
//              dash the knives, slash the orbs back, outrun the wall; Teknium's signature
//
// Each boss has its own colour family (SPELL_HUE). Warm only: crimson, ember, gold, rose,
// white-hot. While a spell threatens her, an invisible `kind: 'laser'` hint says which way is
// out, so the autoplay's laser reflex steps the right way. PERF.low thins the layers.
'use strict'

const BOSS_SPELLS = (() => {
  const TAU = Math.PI * 2
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const rnd = (a, b) => a + Math.random() * (b - a)
  const ease = k => 1 - (1 - k) * (1 - k)
  const HUES = {
    crimson: { core: '255,246,238', hot: '255,178,140', body: '228,32,40', glow: '255,54,40', ink: '86,0,12', spark: '255,140,90' },
    ember: { core: '255,250,232', hot: '255,214,130', body: '255,120,24', glow: '255,86,12', ink: '96,24,0', spark: '255,180,90' },
    gold: { core: '255,255,242', hot: '255,236,160', body: '255,186,50', glow: '255,160,36', ink: '104,56,0', spark: '255,220,130' },
    rose: { core: '255,246,246', hot: '255,196,204', body: '236,72,112', glow: '255,84,118', ink: '96,10,38', spark: '255,160,170' },
    white: { core: '255,255,255', hot: '255,250,226', body: '255,224,150', glow: '255,196,110', ink: '90,48,10', spark: '255,236,190' },
    blaze: { core: '255,250,222', hot: '255,200,100', body: '255,72,20', glow: '255,60,0', ink: '90,10,0', spark: '255,170,70' },
    spark: { core: '255,255,250', hot: '255,246,196', body: '255,214,110', glow: '255,186,70', ink: '70,40,0', spark: '255,240,170' },
  }
  // each boss's spells (slotted into modes 2+; `sig` also goes in the first mode) and colour
  const SET = {
    Lokee: { hue: 'gold', spells: ['radiance', 'nova'] },
    flownium: { hue: 'ember', spells: ['firewall'] },
    Adolan: { hue: 'ember', spells: ['firewall', 'storm'] },
    salt555: { hue: 'white', spells: ['radiance'] },
    HotDawg: { hue: 'gold', spells: ['storm'] },
    UKG: { hue: 'gold', spells: ['maelstrom'] },
    MikeMonty: { hue: 'blaze', spells: ['firewall'] },
    Nicho: { hue: 'spark', spells: ['arcs', 'storm'], sig: 'arcs' },
    sovthpaw: { hue: 'white', spells: ['storm', 'radiance'] },
    GhostBear: { hue: 'crimson', spells: ['hound', 'storm'], sig: 'hound' },
    rahlquist: { hue: 'ember', spells: ['nova', 'maelstrom'] },
    Suzu: { hue: 'rose', spells: ['radiance', 'storm'] },
    LocutusOfTheEye: { hue: 'crimson', spells: ['maelstrom', 'firewall'] },
    Teknium: { hue: 'white', spells: ['stopped_hour', 'storm', 'radiance', 'maelstrom'], sig: 'stopped_hour' },
  }
  const hue = () => HUES[(B && SET[B.handle]?.hue) || 'crimson']
  // soft smoke from the shared sprite cache (fx.js); never flat circles
  const smoke = (x, y, color, size, vx = 0) => { if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(x, y, 1, { color, size, vx, spread: 10 }) } catch { } }
  const glowAt = (x, y, r, rgb, a) => { if (typeof FOE !== 'undefined') FOE.glowAt(x, y, r, rgb, a) }
  const push = p => parts.push(p)
  const mult = () => 1 + 0.15 * Math.max(0, B?.mode || 0)
  const live = () => B && !B.dead && B.active
  const hurt = (d, dir) => live() && hitPlayer(Math.round(d * mult()), dir)
  // the floor (or platform top) under x, seen from height y
  const floorAt = (x, y = cam.y) => { const g = typeof groundAt === 'function' ? groundAt(x, y) : GROUND; return g === Infinity ? GROUND : Math.min(g, GROUND) }

  // -------------------------------------------------------------- cached sprites
  const cache = {}
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  // a fire column: white-hot at the foot, the body colour, then smoke-clear at the top
  function flame(p) {
    const key = 'f' + p.body
    if (cache[key]) return cache[key]
    const c = mk(64, 256), g = c.getContext('2d')
    const v = g.createLinearGradient(0, 256, 0, 0)
    v.addColorStop(0, `rgba(${p.core},1)`); v.addColorStop(0.12, `rgba(${p.hot},0.95)`); v.addColorStop(0.4, `rgba(${p.body},0.8)`)
    v.addColorStop(0.75, `rgba(${p.glow},0.35)`); v.addColorStop(1, `rgba(${p.glow},0)`)
    g.fillStyle = v; g.fillRect(0, 0, 64, 256)
    // round off the sides: fade to clear at both edges
    g.globalCompositeOperation = 'destination-in'
    const hgr = g.createLinearGradient(0, 0, 64, 0)
    hgr.addColorStop(0, 'rgba(0,0,0,0)'); hgr.addColorStop(0.3, 'rgba(0,0,0,0.85)'); hgr.addColorStop(0.5, 'rgba(0,0,0,1)'); hgr.addColorStop(0.7, 'rgba(0,0,0,0.85)'); hgr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = hgr; g.fillRect(0, 0, 64, 256)
    return (cache[key] = c)
  }
  // a puff of churning smoke-light (for the maelstrom body); `ink` puffs darken the edges
  function puff(rgb, a) {
    const key = 'p' + rgb + a
    if (cache[key]) return cache[key]
    const c = mk(64, 64), g = c.getContext('2d')
    for (let i = 0; i < 7; i++) {
      const x = 32 + rnd(-10, 10), y = 32 + rnd(-10, 10), r = rnd(10, 20), gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`)
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
    }
    return (cache[key] = c)
  }

  // -------------------------------------------------------------- lightning
  // a jagged path by midpoint displacement; forks hang off it
  function bolt(x0, y0, x1, y1, rough, depth) {
    let pts = [[x0, y0], [x1, y1]]
    for (let d = 0; d < depth; d++) {
      const n = [pts[0]]
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, o = rnd(-rough, rough) * m
        n.push([(a[0] + b[0]) / 2 - dy / m * o, (a[1] + b[1]) / 2 + dx / m * o], b)
      }
      pts = n
    }
    return pts
  }
  function forks(pts, n, len) {
    const out = []
    for (let i = 0; i < n; i++) {
      const j = 2 + ((Math.random() * (pts.length - 4)) | 0), p = pts[j], q = pts[j + 1] || p
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + rnd(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1), l = len * rnd(0.5, 1)
      out.push(bolt(p[0], p[1], p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l, 0.3, 3))
    }
    return out
  }
  function stroke(pts, w, rgb, a) {
    const c = ctx
    c.strokeStyle = `rgba(${rgb},${a})`; c.lineWidth = w; c.lineJoin = 'miter'; c.lineCap = 'round'
    c.beginPath(); for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]); c.stroke()
  }
  function drawBolt(pts, fk, s, a, p) {
    stroke(pts, 26 * s, p.glow, 0.16 * a)
    stroke(pts, 10 * s, p.body, 0.6 * a)
    stroke(pts, 3.4 * s, p.core, a)
    for (const f of fk) { stroke(f, 6 * s, p.body, 0.45 * a); stroke(f, 1.8 * s, p.core, 0.9 * a) }
  }
  function sparksAt(x, y, n, p, up = 1) {
    if (low()) n = Math.ceil(n / 3)
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 * up + rnd(-1.4, 1.4), s = rnd(260, 820)
      push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.2, 0.5), t: 0, size: rnd(1.6, 3.2), color: i % 3 ? p.spark : p.core, add: true, streak: true, g: 1700 })
    }
  }

  // the autoplay hint: a `kind: 'laser'` entry with no look, set each frame so that stepping
  // away from its x leads out of the danger (or parked far away when she is safe)
  function hint(owner, outDir) {
    const h = { boss: true, kind: 'laser', x: -1e5, t: 0.2, dur: 99, update() {
      if (owner.done || !live()) { this.t = 99; return }
      this.t = 0.2
      const d = outDir()
      this.x = d ? P.x - d * 30 : -1e5
    }, draw() { } }
    fx.push(h)
    return h
  }

  // -------------------------------------------------------------- storm
  // a rune circle on the floor, the sky darkens, and bolts strike one spot at a time
  function strike(x, p, s) {
    const y = floorAt(x, P.y - 300 < cam.y ? cam.y : P.y - 300), top = cam.y - 60
    let pts = null, fk = [], jag = 0
    fx.push({ boss: true, kind: 'laser', x, t: 0, dur: 1.05, update(dt) {
      if (this.t < 0.72) { if (!low() && Math.random() < 0.35) push({ x: x + rnd(-40, 40), y: y - 2, vx: 0, vy: rnd(-200, -90), life: 0.35, t: 0, size: rnd(1.5, 2.5), color: p.spark, add: true, streak: true }) ; return }
      if (!pts) {
        pts = bolt(x + rnd(-60, 60), top, x, y, 0.2, low() ? 4 : 6); fk = branches(pts, s)
        flash = Math.max(flash, low() ? 0.22 : 0.34); flashColor = p.core; shake = Math.max(shake, low() ? 5 : 8); SFX.zap()
        sparksAt(x, y - 4, 18, p); if (typeof FOE !== 'undefined') { FOE.scorch(x, y, 64); FOE.shock(x, y - 4, 90, { ground: y, flat: 0.3, dur: 0.35, col: 'gold' }) }
        // rock chips and dust from the pool
        PP.floor = y; PP.burst(5, x, y - 2, low() ? 3 : 10, 180, 520, -Math.PI / 2, 1.1, 0.5, 1.0, 2, 5); if (!low()) PP.burst(4, x, y - 6, 6, 40, 160, -Math.PI / 2, 1.4, 0.5, 0.9, 5, 10)
      }
      jag -= dt
      if (jag <= 0 && !low() && this.t < 0.9) { jag = 0.045; pts = bolt(pts[0][0], top, x, y, 0.2, 6); fk = branches(pts, s) }
      if (this.t > 0.5 && !this.crack) { this.crack = true; sfx('crackle', { x, vol: 0.5 }) }
      if (this.t < 0.86 && !this.hit && Math.abs(P.x - x) < 54 * s && P.y <= y + 4 && P.y > top) { this.hit = hurt(14, Math.sign(P.x - x) || 1) }
    }, draw() {
      const c = ctx
      c.globalCompositeOperation = 'lighter'
      if (this.t < 0.72) {
        const k = this.t / 0.72, pulse = 0.6 + 0.4 * Math.sin(this.t * 40)
        // the mark: a closing ring and a glow on the floor, a faint line from the sky
        c.strokeStyle = `rgba(${p.body},${0.35 + 0.55 * k})`; c.lineWidth = 2 + 3 * k
        c.beginPath(); c.ellipse(x, y - 2, (54 + 60 * (1 - k)) * s, (11 + 8 * (1 - k)) * s, 0, 0, TAU); c.stroke()
        glowAt(x, y - 4, 70 * s, p.glow, 0.35 * k * pulse)
        if (k > 0.45) { c.fillStyle = `rgba(${p.hot},${0.1 + 0.25 * (k - 0.45) * pulse})`; c.fillRect(x - 1.5, top, 3, y - top) }
        return
      }
      const q = this.t < 0.86 ? 1 : Math.max(0, 1 - (this.t - 0.86) / 0.19)
      // the sky lights up for a moment as it lands
      if (this.t < 0.84) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); const g = c.createLinearGradient(0, 0, 0, H * 0.7); g.addColorStop(0, `rgba(${p.hot},${(low() ? 0.12 : 0.24) * (1 - (this.t - 0.72) / 0.12)})`); g.addColorStop(1, `rgba(${p.hot},0)`); c.fillStyle = g; c.fillRect(0, 0, W, H * 0.7); c.restore() }
      if (pts) drawBolt(pts, fk, s, q, p)
      glowAt(x, y - 6, 120 * s, p.glow, 0.7 * q); glowAt(x, y - 6, 40 * s, p.core, q)
    } })
  }
  // the branches of a strike: forks off the main bolt, smaller forks off those, and two arcs that
  // run along the floor from where it lands
  function branches(pts, s) {
    if (low()) return forks(pts, 1, 120)
    const f = forks(pts, 5, 200 * s), e = pts[pts.length - 1]
    for (const b of f.slice(0, 2)) f.push(...forks(b, 1, 80))
    for (const d of [-1, 1]) f.push(bolt(e[0], e[1] - 2, e[0] + d * rnd(90, 170) * s, e[1] - rnd(0, 8), 0.3, 3))
    return f
  }
  function storm() {
    const p = hue(), ar = AR(), cx = (ar.l + ar.r) / 2, n = (low() ? 10 : 13) + 2 * Math.max(0, B.mode), dur = 4.6
    const own = { done: false }
    SFX.glare(); later(dur + 0.8, () => { own.done = true }, 'boss')
    // the rune circle and the dark sky, for the whole spell
    fx.push({ boss: true, t: 0, dur: dur + 1, update() { dim = Math.max(dim, 0.9 * Math.min(1, this.t * 2) * Math.min(1, (this.dur - this.t) * 2)) }, draw(k) {
      const c = ctx, a = Math.min(1, this.t * 2) * Math.min(1, (this.dur - this.t) * 1.5), rx = ar.w * 0.46, y = GROUND - 2
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = `rgba(${p.body},${0.5 * a})`; c.lineWidth = 3
      c.beginPath(); c.ellipse(cx, y, rx, 30, 0, 0, TAU); c.stroke()
      c.strokeStyle = `rgba(${p.hot},${0.35 * a})`; c.lineWidth = 1.5
      c.beginPath(); c.ellipse(cx, y, rx * 0.86, 24, 0, 0, TAU); c.stroke()
      const ticks = low() ? 16 : 32, r0 = this.t * 0.6
      c.fillStyle = `rgba(${p.hot},${0.6 * a})`
      for (let i = 0; i < ticks; i++) { const t = r0 + i / ticks * TAU, ex = cx + Math.cos(t) * rx * 0.93, ey = y + Math.sin(t) * 27; c.fillRect(ex - 2, ey - (i % 4 ? 2 : 6), 4, i % 4 ? 4 : 12) }
    } })
    // bolts: staggered in time and space; every third one comes for her
    let last = []
    for (let i = 0; i < n; i++) later(0.5 + i * (dur - 0.9) / n + rnd(-0.06, 0.06), () => {
      if (!live()) return
      let x
      if (i % 3 === 1) x = P.x + rnd(-20, 20)
      else { for (let tries = 0; tries < 6; tries++) { x = rnd(ar.l + 60, ar.r - 60); if (last.every(l => Math.abs(l - x) > 140)) break } }
      x = clamp(x, ar.l + 40, ar.r - 40); last = [x, ...last].slice(0, 3)
      strike(x, p, 1 + 0.1 * Math.max(0, B.mode))
    }, 'boss')
    return dur + 0.6
  }

  // a fire wall baked at half size: a solid body (normal blend, so it reads on bright stages) and a
  // brighter core per column, a few frames with different sway for the flicker
  function bakeWall(cols, img, vl, vr, H) {
    const S = 0.5, out = [], soot = flame({ core: '70,24,18', hot: '60,22,18', body: '48,18,16', glow: '40,16,14' })
    for (let n = 0; n < (low() ? 2 : 3); n++) {
      const cw = Math.ceil((vr - vl) * S), ch = Math.ceil(H * 1.1 * S), cv = mk(cw, ch), g = cv.getContext('2d')
      for (const q of cols) {
        const fl = 1 + rnd(-0.08, 0.08), h = H * q.h * fl * S, w = 104 * fl * S, x = (q.x - vl) * S + rnd(-4, 4)
        // a dark smoke silhouette first, so the fire stands off bright orange stages
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.6
        g.drawImage(soot, x - w * 0.65, ch - h * 1.04, w * 1.3, h * 1.04)
        g.globalAlpha = 0.95
        g.drawImage(img, x - w / 2, ch - h, w, h)
        if (!low()) { g.globalAlpha = 0.45; g.drawImage(img, x - w * 0.7 + rnd(-3, 3), ch - h * 0.75, w * 1.4, h * 0.75) }
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7
        g.drawImage(img, x - w * 0.22, ch - h * 0.85, w * 0.44, h * 0.85)
      }
      out.push(cv)
    }
    return out
  }

  // -------------------------------------------------------------- firewall
  function firewall() {
    const p = hue(), ar = AR(), tell = 1.4, hold = 3.2, out = 0.6, dur = tell + hold + out
    B.run = null; B.leap = null
    // only the visible floor burns (cheap, and every pillar is readable); one gap at her feet side of the boss,
    // one more somewhere else on screen, both clearly wide enough to stand in
    const bx = B.x, gw = 95, vl = Math.max(ar.l, cam.x - 220), vr = Math.min(ar.r, cam.x + VW() + 220)
    // a second gap only where it fits (a small arena keeps just the one at the boss's feet)
    let g2 = null
    for (let tries = 0; tries < 16 && g2 == null; tries++) { const x = rnd(Math.max(ar.l + 110, cam.x + 90), Math.min(ar.r - 110, cam.x + VW() - 90)); if (Math.abs(x - bx) > 320) g2 = x }
    const gaps = [[bx - gw, bx + gw]]
    if (g2 != null) gaps.push([g2 - 85, g2 + 85])
    const inGap = x => gaps.some(([a, b]) => x > a && x < b)
    const cols = []
    for (let x = vl + 30; x < vr - 10; x += low() ? 96 : 72) if (!gaps.some(([a, b]) => x > a - 50 && x < b + 50)) cols.push({ x, h: rnd(0.8, 1.05), ph: rnd(0, TAU) })
    const own = { done: false }
    hint(own, () => {
      if (inGap(P.x)) return 0
      let best = null
      for (const [a, b] of gaps) for (const e of [a + 40, b - 40]) if (best == null || Math.abs(e - P.x) < Math.abs(best - P.x)) best = e
      return Math.sign(best - P.x)
    })
    SFX.glare()
    const H = GROUND - cam.y + 80
    fx.push({ boss: true, t: 0, dur, cols, update(dt) {
      const t = this.t
      if (t < tell) {
        if (Math.random() < (low() ? 0.3 : 0.8)) { const c = cols[(Math.random() * cols.length) | 0]; if (c) push({ x: c.x + rnd(-14, 14), y: GROUND - 3, vx: rnd(-20, 20), vy: rnd(-260, -120), life: rnd(0.3, 0.6), t: 0, size: rnd(1.5, 3), color: p.spark, add: true }) }
        return
      }
      if (!this.lit) { this.lit = true; shake = Math.max(shake, 10); flash = Math.max(flash, 0.2); flashColor = p.hot; SFX.boom(); for (const c of cols) if (Math.random() < 0.5) sparksAt(c.x, GROUND - 6, 3, p) }
      if (t < tell + hold && !inGap(P.x) && P.y > GROUND - H) {
        const near = cols.some(c => Math.abs(c.x - P.x) < 66)
        if (near) hurt(11, Math.sign(P.x - bx) || 1)
      }
      if (t > tell + hold && !this.ash) { this.ash = true; for (const c of cols) if (typeof FOE !== 'undefined') FOE.embers(c.x, GROUND - 300, c.x, GROUND, 4) }
      if (!low() && Math.random() < 0.6) { const c = cols[(Math.random() * cols.length) | 0]; if (c) push({ x: c.x + rnd(-20, 20), y: GROUND - rnd(40, 400), vx: rnd(-30, 30), vy: rnd(-160, -60), life: rnd(0.4, 0.9), t: 0, size: rnd(1.5, 3), color: Math.random() < 0.5 ? p.spark : p.hot, add: true }) }
    }, draw() {
      const c = ctx, t = this.t, img = flame(p)
      c.globalCompositeOperation = 'lighter'
      if (t < tell) {
        // the tell: the floor seams glow under every pillar, brighter as it comes; the gaps get gold posts
        const k = t / tell, pulse = 0.65 + 0.35 * Math.sin(t * 26)
        for (const q of cols) { glowAt(q.x, GROUND - 2, 44, p.glow, (0.25 + 0.6 * k) * pulse); c.fillStyle = `rgba(${p.hot},${0.3 + 0.6 * k})`; c.fillRect(q.x - 26, GROUND - 3, 52, 3) }
        if (k > 0.5) for (const q of cols) { const h = 60 + 120 * (k - 0.5); c.globalAlpha = 0.3 * (k - 0.5) * pulse; c.drawImage(img, q.x - 26, GROUND - h, 52, h); c.globalAlpha = 1 }
        for (const [a, b] of gaps) for (const e of [a, b]) { c.fillStyle = `rgba(255,240,200,${0.4 + 0.4 * pulse})`; c.fillRect(e - 1.5, GROUND - 26, 3, 26) }
        c.globalCompositeOperation = 'source-over'
        return
      }
      const u = t - tell, grow = ease(Math.min(1, u / 0.25)), fade = t > tell + hold ? Math.max(0, 1 - (t - tell - hold) / out) : 1
      // the wall is baked once into a few half-size frames (one blit a frame after that) and they flicker
      const frames = this.frames || (this.frames = bakeWall(cols, img, vl, vr, H))
      const f = frames[((T * 14) | 0) % frames.length], hh = H * 1.1 * grow * (0.4 + 0.6 * fade)
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = fade
      c.drawImage(f, vl, GROUND - hh, vr - vl, hh)
      c.globalAlpha = 1
      c.globalCompositeOperation = 'source-over'
    } })
    later(dur, () => { own.done = true }, 'boss')
    return dur + 0.3
  }

  // -------------------------------------------------------------- maelstrom
  // a sigil opens above the boss and a thick churning beam hammers the floor past her
  function maelstrom() {
    const p = hue(), tell = 1.0, hold = 2.4, out = 0.35, dur = tell + hold + out
    B.run = null
    const src = () => { const m = bossMid(); return { x: m.x + B.face * 20, y: m.y + (B.float ? -140 : 0) - B.h * 0.55 - 170 } }
    const w = 60 + 8 * Math.max(0, B.mode)
    let dir = Math.sign(P.x - B.x) || 1, aim = { x: P.x + dir * 120, y: floorAt(P.x + dir * 120, P.y - 200) }
    const own = { done: false }
    const seg = () => { const s = src(); return [s.x, s.y, aim.x, aim.y] }
    const danger = () => { const [x0, y0, x1, y1] = seg(); return segDist(P.x, P.y - 80, x0, y0, x1, y1) < w / 2 + 90 || Math.hypot(P.x - x1, P.y - y1) < 140 }
    hint(own, () => danger() ? -dir : 0)
    SFX.glare()
    let puffs = []
    fx.push({ boss: true, t: 0, dur, update(dt) {
      const t = this.t, s = src()
      if (t < tell * 0.7) { dir = Math.sign(P.x - B.x) || dir; const tx = P.x + dir * 120; aim.x = lerp(aim.x, tx, Math.min(1, dt * 6)); aim.y = floorAt(aim.x, P.y - 200) }
      if (t < tell) { if (typeof FOE !== 'undefined' && Math.random() < 0.7) FOE.gather(s.x, s.y, 1.6, 'gold'); return }
      if (!this.fired) {
        this.fired = true; shake = Math.max(shake, 9); flash = Math.max(flash, 0.25); flashColor = p.hot; SFX.boom(); SFX.zap()
        sparksAt(s.x, s.y, 18, p, -1)
        if (typeof FOE !== 'undefined') { FOE.shock(s.x, s.y, 120, { col: 'gold', dur: 0.4 }); FOE.scorch(aim.x, aim.y, 90) }
      }
      const live_ = t < tell + hold
      if (live_) {
        const [x0, y0, x1, y1] = seg()
        if (segDist(P.x, P.y - 80, x0, y0, x1, y1) < w / 2 + 26 || Math.hypot(P.x - x1, P.y - 60 - y1) < 100) hurt(12, dir)
        if (Math.random() < 0.8) sparksAt(x1 + rnd(-20, 20), y1 - 4, 2, p)
        if (!low() && Math.random() < 0.3) smoke(x1 + rnd(-40, 40), y1 - 10, 'dark', 1)
        shake = Math.max(shake, 3)
        this.ring = (this.ring || 0) - dt
        if (this.ring <= 0 && typeof FOE !== 'undefined') { this.ring = 0.45; FOE.shock(x1, y1 - 4, 110, { ground: y1, flat: 0.28, dur: 0.4 }) }
      } else if (!this.ash) { this.ash = true; const [x0, y0, x1, y1] = seg(); if (typeof FOE !== 'undefined') FOE.embers(x0, y0, x1, y1, 22) }
      // the churn: puffs ride the beam from the sigil to the floor
      const n = low() ? 8 : 18
      while (puffs.length < n) puffs.push({ q: Math.random(), o: rnd(-1, 1), s: rnd(0.7, 1.3), sp: rnd(0.9, 1.5), r: rnd(0, TAU) })
      for (const f of puffs) { f.q += dt * f.sp; f.r += dt * 3; if (f.q > 1) { f.q -= 1; f.o = rnd(-1, 1) } }
    }, draw() {
      const c = ctx, t = this.t, [x0, y0, x1, y1] = seg(), a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0)
      c.globalCompositeOperation = 'lighter'
      // the sigil: two counter-turning rings and a hot eye
      const sk = Math.min(1, t / tell), sf = t > tell + hold ? Math.max(0, 1 - (t - tell - hold) / out) : 1
      c.save(); c.translate(x0, y0)
      c.strokeStyle = `rgba(${p.body},${0.8 * sf})`; c.lineWidth = 3
      c.rotate(t * 2.4); c.beginPath(); c.arc(0, 0, 46 * sk, 0, TAU * 0.85); c.stroke()
      c.rotate(-t * 4.8); c.strokeStyle = `rgba(${p.hot},${0.7 * sf})`; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 30 * sk, 0.3, TAU * 0.7); c.stroke()
      c.restore()
      glowAt(x0, y0, 90 * sk, p.glow, 0.6 * sf); glowAt(x0, y0, 26 * sk, p.core, sf)
      if (t < tell) {
        // the tell: the aim line, brighter as it locks, and the ground line where it will land
        const k = t / tell
        if (typeof FOE !== 'undefined') { FOE.charge(x0, y0, a, L, k, { w: w * 0.8, col: hueToFoe() }); c.globalCompositeOperation = 'lighter' }
        c.fillStyle = `rgba(${p.hot},${0.25 + 0.6 * k * (0.7 + 0.3 * Math.sin(t * 40))})`
        const ga = Math.min(aim.x, aim.x - dir * 220), gb = Math.max(aim.x + dir * 50, aim.x - dir * 220)
        c.fillRect(Math.min(ga, gb), aim.y - 3, Math.abs(gb - ga), 3)
        glowAt(aim.x, aim.y - 4, 80, p.glow, 0.5 * k)
        return
      }
      const pop = Math.min(1, (t - tell) / 0.1), ww = w * (0.7 + 0.3 * pop) * (0.5 + 0.5 * sf) * (1 + 0.08 * Math.sin(T * 57) + 0.05 * Math.sin(T * 93))
      // a wide glow cone from the sigil to the floor
      c.save(); c.translate(x0, y0); c.rotate(a)
      c.fillStyle = `rgba(${p.glow},${0.14 * sf})`
      c.beginPath(); c.moveTo(0, -ww * 0.4); c.lineTo(L, -ww * 1.9); c.lineTo(L, ww * 1.9); c.lineTo(0, ww * 0.4); c.fill()
      // smoky body: dark puffs on the edges, coloured churn inside (ragged, moving)
      const dark = puff(p.ink, 0.5), body = puff(p.body, 0.55), hot = puff(p.hot, 0.5)
      c.globalCompositeOperation = 'source-over'
      for (const f of puffs) { const r = ww * 0.9 * f.s; c.globalAlpha = 0.35 * sf; c.drawImage(dark, f.q * L - r, f.o * ww * 0.55 - r, r * 2, r * 2) }
      c.globalCompositeOperation = 'lighter'
      for (const f of puffs) { const r = ww * 0.75 * f.s; c.globalAlpha = 0.8 * sf; c.drawImage(body, f.q * L - r, f.o * ww * 0.3 - r, r * 2, r * 2) }
      c.globalAlpha = 1
      c.restore()
      if (typeof FOE !== 'undefined') { FOE.beam(x0, y0, x1, y1, { w: ww * 0.55, k: sf, col: hueToFoe(), end: true, seed: 3 }); c.globalCompositeOperation = 'lighter' }
      // core and the splash on the floor
      c.save(); c.translate(x0, y0); c.rotate(a)
      for (const f of puffs) { if (f.q > 0.9) continue; const r = ww * 0.3; c.globalAlpha = 0.6 * sf; c.drawImage(hot, f.q * L - r, f.o * ww * 0.08 - r, r * 2, r * 2) }
      c.globalAlpha = 1; c.restore()
      glowAt(x1, y1 - 10, 170, p.glow, 0.7 * sf); glowAt(x1, y1 - 6, 60, p.core, sf)
      c.globalCompositeOperation = 'lighter'
    } })
    later(dur, () => { own.done = true }, 'boss')
    return dur + 0.3
  }
  // the FOE palette nearest this boss's hue (for the beam core and charge line)
  const hueToFoe = () => { const h = (B && SET[B.handle]?.hue) || 'crimson'; return h === 'ember' || h === 'blaze' ? 'ember' : h === 'crimson' || h === 'rose' ? 'crimson' : 'gold' }

  // -------------------------------------------------------------- radiance
  // a halo over where she stands, then a blinding cone of light; its edges are safe
  function radiance() {
    const p = hue(), tell = 1.15, hold = 1.6, out = 0.4, dur = tell + hold + out
    const ar = AR(), W = 230 + 30 * Math.max(0, B.mode), top = cam.y + 70, tw = 34
    let cx = clamp(P.x, ar.l + W * 0.6, ar.r - W * 0.6)
    const own = { done: false }
    const floorY = GROUND
    const half = y => lerp(tw, W, clamp((y - top) / (floorY - top), 0, 1))
    const inside = (pad = 0) => Math.abs(P.x - cx) < half(P.y - 80) + pad
    hint(own, () => inside(70) ? (Math.sign(P.x - cx) || 1) : 0)
    SFX.glare()
    fx.push({ boss: true, t: 0, dur, update(dt) {
      const t = this.t
      if (t < tell * 0.55) cx = lerp(cx, clamp(P.x, ar.l + W * 0.6, ar.r - W * 0.6), Math.min(1, dt * 4))
      if (t < tell) { if (typeof FOE !== 'undefined' && Math.random() < 0.6) FOE.gather(cx, top, 1.8, 'gold'); return }
      if (!this.lit) { this.lit = true; flash = Math.max(flash, 0.45); flashColor = p.core; shake = Math.max(shake, 10); SFX.boom(); SFX.zap(); if (typeof FOE !== 'undefined') FOE.shock(cx, floorY - 4, W * 1.1, { ground: floorY, flat: 0.22, dur: 0.5, col: 'gold' }) }
      if (t < tell + hold) {
        if (inside(10) && P.y > top) hurt(16, Math.sign(P.x - cx) || 1)
        flash = Math.max(flash, 0.08); flashColor = p.core
        if (Math.random() < (low() ? 0.4 : 1)) { const y = rnd(top, floorY), x = cx + rnd(-1, 1) * half(y) * 0.9; push({ x, y, vx: 0, vy: rnd(500, 900), life: rnd(0.15, 0.3), t: 0, size: rnd(1.5, 3), color: p.core, add: true, streak: true }) }
        if (Math.random() < 0.7) sparksAt(cx + rnd(-W, W) * 0.9, floorY - 2, 2, p)
      } else if (!this.ash) { this.ash = true; if (typeof FOE !== 'undefined') FOE.embers(cx - W, floorY - 40, cx + W, floorY, 24) }
    }, draw() {
      const c = ctx, t = this.t
      c.globalCompositeOperation = 'lighter'
      const hk = Math.min(1, t / tell), sf = t > tell + hold ? Math.max(0, 1 - (t - tell - hold) / out) : 1
      // the halo: a spinning ring of light with ticks
      c.save(); c.translate(cx, top)
      c.strokeStyle = `rgba(${p.hot},${0.9 * sf})`; c.lineWidth = 4
      c.beginPath(); c.ellipse(0, 0, 70 * hk + 10, 16 * hk + 4, 0, 0, TAU); c.stroke()
      c.strokeStyle = `rgba(${p.body},${0.6 * sf})`; c.lineWidth = 2
      c.beginPath(); c.ellipse(0, 0, 100 * hk, 24 * hk, 0, 0, TAU); c.stroke()
      const n = low() ? 8 : 16
      c.fillStyle = `rgba(${p.core},${0.8 * sf})`
      for (let i = 0; i < n; i++) { const a = t * 1.5 + i / n * TAU; c.fillRect(Math.cos(a) * 100 * hk - 2, Math.sin(a) * 24 * hk - 2, 4, 4) }
      c.restore()
      glowAt(cx, top, 120 * hk, p.glow, 0.6 * sf); glowAt(cx, top, 34 * hk, p.core, sf)
      if (t < tell) {
        // the tell: the floor patch glows and both edges draw down from the halo
        const k = t / tell, pulse = 0.65 + 0.35 * Math.sin(t * 30)
        c.fillStyle = `rgba(${p.body},${0.12 + 0.2 * k * pulse})`
        c.beginPath(); c.moveTo(cx - tw, top); c.lineTo(cx - W, floorY); c.lineTo(cx + W, floorY); c.lineTo(cx + tw, top); c.fill()
        c.strokeStyle = `rgba(${p.hot},${0.3 + 0.6 * k})`; c.lineWidth = 2 + 2 * k
        c.beginPath(); c.moveTo(cx - tw, top); c.lineTo(cx - W, floorY); c.moveTo(cx + tw, top); c.lineTo(cx + W, floorY); c.stroke()
        c.fillStyle = `rgba(${p.core},${0.4 + 0.5 * k})`; c.fillRect(cx - W, floorY - 4, W * 2, 4)
        return
      }
      const pop = Math.min(1, (t - tell) / 0.08), fl = 1 + 0.04 * Math.sin(T * 61) + 0.03 * Math.sin(T * 97), Wd = W * fl * (0.85 + 0.15 * pop)
      // outer cone, inner cone, then the blinding core column
      c.fillStyle = `rgba(${p.glow},${0.22 * sf})`
      c.beginPath(); c.moveTo(cx - tw * 1.6, top); c.lineTo(cx - Wd * 1.12, floorY + 10); c.lineTo(cx + Wd * 1.12, floorY + 10); c.lineTo(cx + tw * 1.6, top); c.fill()
      c.fillStyle = `rgba(${p.body},${0.4 * sf})`
      c.beginPath(); c.moveTo(cx - tw, top); c.lineTo(cx - Wd, floorY); c.lineTo(cx + Wd, floorY); c.lineTo(cx + tw, top); c.fill()
      c.fillStyle = `rgba(${p.hot},${0.5 * sf})`
      c.beginPath(); c.moveTo(cx - tw * 0.6, top); c.lineTo(cx - Wd * 0.5, floorY); c.lineTo(cx + Wd * 0.5, floorY); c.lineTo(cx + tw * 0.6, top); c.fill()
      c.fillStyle = `rgba(${p.core},${0.9 * sf})`
      c.beginPath(); c.moveTo(cx - tw * 0.35, top); c.lineTo(cx - Wd * 0.16, floorY); c.lineTo(cx + Wd * 0.16, floorY); c.lineTo(cx + tw * 0.35, top); c.fill()
      // bright edges, so the safe line is sharp
      c.strokeStyle = `rgba(${p.core},${0.7 * sf})`; c.lineWidth = 3
      c.beginPath(); c.moveTo(cx - tw, top); c.lineTo(cx - Wd, floorY); c.moveTo(cx + tw, top); c.lineTo(cx + Wd, floorY); c.stroke()
      glowAt(cx, floorY - 10, Wd * 1.2, p.glow, 0.6 * sf); glowAt(cx, floorY - 6, Wd * 0.5, p.core, 0.9 * sf)
    } })
    later(dur, () => { own.done = true }, 'boss')
    return dur + 0.3
  }

  // -------------------------------------------------------------- arcs (homing lightning)
  // a charge spark at the hand, then a fan of darts that spread, curve in, then fly straight
  function arcs() {
    const p = hue(), volleys = 3 + (B.mode > 1 ? 1 : 0), per = low() ? 4 : 5
    bossGo('high')
    for (let v = 0; v < volleys; v++) {
      const at = 0.75 + v * 0.95
      later(at - 0.45, () => {
        if (!live()) return
        // the charge: crackles around the hand for 0.45 s
        fx.push({ boss: true, t: 0, dur: 0.45, draw(k) {
          const h = bossHand(), c = ctx
          c.globalCompositeOperation = 'lighter'
          glowAt(h.x, h.y, 30 + 50 * k, p.glow, 0.4 + 0.5 * k); glowAt(h.x, h.y, 12 + 10 * k, p.core, 0.9)
          const n = low() ? 2 : 4
          for (let i = 0; i < n; i++) { const a = rnd(0, TAU), r = 24 + 40 * (1 - k); stroke(bolt(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, h.x, h.y, 0.35, 3), 2, p.core, 0.9) }
        } })
        SFX.zap()
      }, 'boss')
      later(at, () => {
        if (!live()) return
        const h = bossHand(), a0 = ang(h.x, h.y, P.x, P.y - 70)
        if (typeof FOE !== 'undefined') FOE.muzzle(h.x, h.y, a0, 'gold', 2.2)
        flash = Math.max(flash, 0.1); flashColor = p.hot; SFX.shot(); SFX.zap()
        const darts = []
        for (let i = 0; i < per; i++) {
          const s = (i - (per - 1) / 2) / ((per - 1) / 2), a = a0 + s * 1.05 + rnd(-0.08, 0.08)
          const b = ebullet(h.x, h.y, a, bsp(560), { type: 'heavy', r: 11, dmg: 10, life: 3.4 })
          b.dart = p; b.turnAt = 0.22 + Math.abs(s) * 0.08 + i * 0.03; b.turnEnd = b.turnAt + 0.7; b.tr = []; b.seed = Math.random() * 99
          bullets.push(b); darts.push(b)
        }
        // steering: spread, then curve toward her, then fly straight (so a dash or a step beats it)
        fx.push({ boss: true, t: 0, dur: 3.6, update(dt) {
          for (const b of darts) {
            if (b.dead) { if (!b.popped) { b.popped = true; sparksAt(b.x, b.y, 10, p, 0); glowPop(b.x, b.y, p) } continue }
            if (b.t > b.turnAt && b.t < b.turnEnd) {
              const want = ang(b.x, b.y, P.x, P.y - 70), cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy)
              let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d))
              const na = cur + clamp(d, -5 * dt, 5 * dt)
              b.vx = Math.cos(na) * sp * (1 + dt * 0.6); b.vy = Math.sin(na) * sp * (1 + dt * 0.6)
            }
            b.tr.unshift([b.x, b.y]); if (b.tr.length > (low() ? 5 : 9)) b.tr.pop()
          }
        } })
      }, 'boss')
    }
    return 0.75 + volleys * 0.95 + 0.6
  }
  function glowPop(x, y, p) {
    fx.push({ t: 0, dur: 0.22, draw(k) { ctx.globalCompositeOperation = 'lighter'; glowAt(x, y, 30 + 60 * k, p.glow, 1 - k); glowAt(x, y, 14, p.core, 1 - k) } })
  }
  // a dart: a forked crackle trail, an electric halo and a white arrow-head core
  function drawDart(b) {
    const p = b.dart, c = ctx, a = Math.atan2(b.vy, b.vx)
    c.globalCompositeOperation = 'lighter'
    if (b.tr && b.tr.length > 1) {
      const pts = b.tr.map(([x, y], i) => [x + (i ? rnd(-6, 6) : 0), y + (i ? rnd(-6, 6) : 0)])
      stroke(pts, 9, p.glow, 0.3); stroke(pts, 3.5, p.body, 0.8); stroke(pts, 1.4, p.core, 1)
      if (!low() && Math.random() < 0.5) { const q = pts[(pts.length / 2) | 0], fa = a + Math.PI + rnd(-1, 1); stroke(bolt(q[0], q[1], q[0] + Math.cos(fa) * 30, q[1] + Math.sin(fa) * 30, 0.4, 2), 1.4, p.core, 0.8) }
    }
    glowAt(b.x, b.y, 30 + 6 * Math.sin(T * 50 + b.seed), p.glow, 0.7); glowAt(b.x, b.y, 12, p.core, 1)
    c.save(); c.translate(b.x, b.y); c.rotate(a)
    c.fillStyle = `rgba(${p.core},1)`
    c.beginPath(); c.moveTo(14, 0); c.lineTo(-6, -8); c.lineTo(-2, 0); c.lineTo(-6, 8); c.closePath(); c.fill()
    c.restore()
  }
  if (typeof drawBullet === 'function') {
    const coreDraw = drawBullet
    window.drawBullet = function (b) {
      if (!b) return coreDraw(b)
      if (b.hour) return   // the stopped hour draws its own shots in batches
      if (b.hourR) return drawHourRefl(b)
      if (b.dart) return drawDart(b)
      if (b.enemy && B && B.handle === 'Teknium' && (b.type === 'orb' || b.type === 'heavy')) return drawTek(b)
      return coreDraw(b)
    }
  }

  // -------------------------------------------------------------- nova (detonation orb)
  // a charge in the hand and a ring on the floor where it will burst; a slow molten orb flies
  // there and bursts on contact or on arrival. Late modes throw three, each overlapping the last.
  function petal(img, x, y, a, len, w, alpha) {
    const c = ctx
    c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2); c.globalAlpha = alpha
    c.drawImage(img, -w / 2, -len, w, len); c.restore()
  }
  function nova() {
    const p = HUES.ember, last = (B.f.modes?.length || 1) - 1, n = B.mode >= Math.max(1, last) ? 3 : 1
    const R0 = 200 + 20 * Math.max(0, B.mode)
    bossGo('far')
    for (let i = 0; i < n; i++) later(0.5 + i * 0.5, () => {
      if (!live()) return
      const h0 = bossHand(), off = n > 1 ? (i - 1) * 170 : 0
      const tx = clamp(P.x + off, AR().l + 80, AR().r - 80), ty = floorAt(tx, P.y - 200)
      const own = { done: false }
      hint(own, () => Math.hypot(P.x - tx, P.y - 60 - (ty - 60)) < R0 + 50 ? (Math.sign(P.x - tx) || 1) : 0)
      const fly = 1.2, charge = 0.5
      let ox = h0.x, oy = h0.y, burst = -1
      SFX.glare()
      fx.push({ boss: true, t: 0, dur: charge + fly + 1.0, update(dt) {
        const t = this.t
        if (t < charge) { const h = bossHand(); ox = h.x; oy = h.y; if (typeof FOE !== 'undefined' && Math.random() < 0.6) FOE.gather(ox, oy, 1.4, 'ember'); return }
        if (burst < 0) {
          const k = Math.min(1, (t - charge) / fly), h = bossHand()
          this.x0 ??= h.x; this.y0 ??= h.y
          ox = lerp(this.x0, tx, k); oy = lerp(this.y0, ty - 70, k) - 90 * Math.sin(Math.PI * k)
          if (!low() && Math.random() < 0.9) push({ x: ox + rnd(-20, 20), y: oy + rnd(-20, 20), vx: rnd(-60, 60), vy: rnd(-90, 10), life: rnd(0.4, 0.8), t: 0, size: rnd(1.6, 3.2), color: Math.random() < 0.5 ? p.spark : p.hot, add: true })
          if (Math.random() < (low() ? 0.08 : 0.2)) smoke(ox + rnd(-30, 30), oy + rnd(-30, 30), 'ember', 0.8)
          if (k >= 1 || Math.hypot(P.x - ox, P.y - 80 - oy) < 70) {
            burst = t; own.done = true
            flash = Math.max(flash, 0.35); flashColor = p.hot; shake = Math.max(shake, low() ? 6 : 13); SFX.boom(); SFX.heavy()
            if (typeof FOE !== 'undefined') { FOE.shock(ox, oy, R0, { ground: ty, dur: 0.5, col: 'ember' }); FOE.scorch(ox, ty, R0 * 0.5) }
            sparksAt(ox, oy, 26, p, 0)
            if (Math.hypot(P.x - ox, P.y - 80 - oy) < R0) hurt(18, Math.sign(P.x - ox) || 1)
            this.petals = Array.from({ length: low() ? 8 : 14 }, (_, j) => ({ a: j / (low() ? 8 : 14) * TAU + rnd(-0.15, 0.15), l: rnd(0.8, 1.15) }))
          }
        }
      }, draw() {
        const c = ctx, t = this.t
        c.globalCompositeOperation = 'lighter'
        // the floor ring where it will burst
        if (burst < 0) {
          const k = Math.min(1, t / (charge + fly)), pulse = 0.65 + 0.35 * Math.sin(t * (14 + 26 * k))
          c.strokeStyle = `rgba(${p.body},${0.35 + 0.5 * k})`; c.lineWidth = 2 + 3 * k
          c.beginPath(); c.ellipse(tx, ty - 2, R0, R0 * 0.16, 0, 0, TAU); c.stroke()
          c.strokeStyle = `rgba(${p.hot},${0.3 + 0.5 * k * pulse})`; c.lineWidth = 2
          c.beginPath(); c.ellipse(tx, ty - 2, R0 * (1 - 0.8 * k), R0 * 0.16 * (1 - 0.8 * k), 0, 0, TAU); c.stroke()
          glowAt(tx, ty - 4, R0 * 0.9, p.glow, 0.18 + 0.2 * k * pulse)
        }
        if (t < charge) { const k = t / charge; glowAt(ox, oy, 30 + 50 * k, p.glow, 0.5 + 0.4 * k); glowAt(ox, oy, 12 + 14 * k, p.core, 0.9); return }
        if (burst < 0) {
          // the orb: smoke-dark rim, fire body, white-hot heart (about a sixth of the screen)
          const r = 60 * (1 + 0.05 * Math.sin(T * 37)), img = flame(p)
          c.globalCompositeOperation = 'source-over'; glowAt(ox, oy, r * 1.25, p.ink, 0.22)
          c.globalCompositeOperation = 'lighter'
          glowAt(ox, oy, r * 2.2, p.glow, 0.5)
          if (!low()) for (let j = 0; j < 6; j++) petal(img, ox, oy, T * 3 + j * TAU / 6, r * 1.2, r * 0.7, 0.35)
          glowAt(ox, oy, r * 1.1, p.body, 0.95); glowAt(ox, oy, r * 0.6, p.hot, 1); glowAt(ox, oy, r * 0.3, p.core, 1)
          return
        }
        // the burst: fire petals thrown out, a white flash core, then smoke
        const u = (t - burst) / 0.8, e = ease(Math.min(1, u)), q = Math.max(0, 1 - u)
        if (q <= 0) return
        const img = flame(p)
        glowAt(ox, oy, R0 * (0.6 + 0.8 * e), p.glow, 0.8 * q)
        for (const pt of this.petals || []) petal(img, ox, oy, pt.a, R0 * pt.l * (0.3 + 0.9 * e), 90 * q + 20, 0.9 * q)
        glowAt(ox, oy, R0 * 0.5 * (1 - u * 0.5), p.hot, q); glowAt(ox, oy, 60 * q, p.core, q)
      } })
    }, 'boss')
    return 0.5 + n * 0.5 + 1.9
  }

  // -------------------------------------------------------------- hound
  // a fire ring drawn in front of the boss, a lane line on the floor; a beast of flame and smoke
  // leaps out and runs the lane as a comet (jump it); where it hits, a gold fire pillar erupts
  function hound() {
    const p = HUES.ember, g = HUES.gold, ar = AR(), draw0 = 0.8
    B.run = null
    const d = Math.sign(P.x - B.x) || 1, x0 = B.x + d * 110, y = floorAt(B.x, B.y - 40)
    const ringY = y - 100
    SFX.glare()
    const pillar = (px) => {
      const own = { done: false }
      hint(own, () => Math.abs(P.x - px) < 110 ? (Math.sign(P.x - px) || 1) : 0)
      flash = Math.max(flash, 0.3); flashColor = g.hot; shake = Math.max(shake, low() ? 6 : 12); SFX.boom(); SFX.zap()
      if (typeof FOE !== 'undefined') FOE.shock(px, y - 4, 160, { ground: y, flat: 0.3, col: 'gold' })
      let veins = [], vt = 0
      fx.push({ boss: true, t: 0, dur: 1.3, update(dt) {
        if (this.t < 0.9 && Math.abs(P.x - px) < 80) hurt(14, Math.sign(P.x - px) || 1)
        vt -= dt
        if (vt <= 0) { vt = low() ? 0.12 : 0.05; veins = []; for (let i = 0; i < (low() ? 1 : 3); i++) veins.push(bolt(px + rnd(-40, 40), cam.y - 40, px + rnd(-40, 40), y, 0.12, 5)) }
        if (this.t > 0.9 && !this.ash) { this.ash = true; if (typeof FOE !== 'undefined') FOE.embers(px, cam.y + 100, px, y, 20); own.done = true }
        if (Math.random() < 0.7) sparksAt(px + rnd(-50, 50), y - 4, 2, g)
      }, draw() {
        const c = ctx, t = this.t, grow = ease(Math.min(1, t / 0.15)), q = t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.4)
        const H = (y - cam.y + 60) * grow, w = 170 * (1 + 0.06 * Math.sin(T * 40)), img = flame(g)
        c.globalCompositeOperation = 'lighter'
        glowAt(px, y - H * 0.5, H * 0.55, g.glow, 0.3 * q)
        for (let i = 0; i < (low() ? 1 : 3); i++) { c.globalAlpha = (0.8 - i * 0.18) * q; c.drawImage(img, px - w * (1 - i * 0.25) / 2 + Math.sin(T * 9 + i) * 8, y - H, w * (1 - i * 0.25), H) }
        c.globalAlpha = 1
        for (const v of veins) { stroke(v, 5, g.body, 0.5 * q); stroke(v, 1.6, g.core, 0.95 * q) }
        glowAt(px, y - 10, 110, g.core, 0.7 * q)
      } })
    }
    // the ring: drawn stroke by stroke for draw0 seconds; the lane line glows along the floor
    fx.push({ boss: true, t: 0, dur: draw0 + 0.4, draw() {
      const c = ctx, k = Math.min(1, this.t / draw0), q = this.t < draw0 ? 1 : Math.max(0, 1 - (this.t - draw0) / 0.4)
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = `rgba(${p.body},${0.9 * q})`; c.lineWidth = 6
      c.beginPath(); c.ellipse(x0, ringY, 46, 100, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke()
      c.strokeStyle = `rgba(${p.core},${q})`; c.lineWidth = 2
      c.beginPath(); c.ellipse(x0, ringY, 46, 100, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke()
      glowAt(x0, ringY, 120, p.glow, 0.4 * k * q)
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 30), x1 = d > 0 ? ar.r : ar.l
      c.fillStyle = `rgba(${p.hot},${(0.2 + 0.5 * k) * pulse * q})`; c.fillRect(Math.min(x0, x1), y - 3, Math.abs(x1 - x0), 3)
    } })
    later(draw0, () => {
      if (!live()) return
      SFX.heavy(); shake = Math.max(shake, low() ? 3 : 6)
      const wall = d > 0 ? ar.r - 40 : ar.l + 40, trail = []
      fx.push({ boss: true, kind: 'sweep', side: -d, x: x0, t: 0, dur: 4, update(dt) {
        if (this.gone) { this.t = this.dur; return }
        this.x += d * 1100 * dt
        const hy = y - 55 - Math.max(0, 60 * Math.sin(Math.min(1, this.t / 0.3) * Math.PI))   // a leap out of the ring, then it runs
        this.hy = hy
        trail.unshift([this.x, hy]); if (trail.length > (low() ? 8 : 16)) trail.pop()
        if (!low()) smoke(this.x - d * 30, hy + rnd(-20, 20), 'dark', 1, -d * 80)
        const box = { x: this.x - 50, y: y - 90, w: 100, h: 90 }
        const hitHer = !P.dead && boxHit(box, hurtbox()) && P.iframe <= 0
        if (hitHer || (this.x - wall) * d >= 0) { if (hitHer) hurt(16, d); this.gone = true; pillar(hitHer ? P.x : wall) }
      }, draw() {
        if (this.gone) return
        const c = ctx, hx = this.x, hy = this.hy ?? y - 55
        c.globalCompositeOperation = 'lighter'
        // the comet tail
        for (let i = trail.length - 1; i > 0; i--) { const [tx, ty] = trail[i], k = 1 - i / trail.length; glowAt(tx, ty, 50 * k + 10, p.glow, 0.45 * k); glowAt(tx, ty, 18 * k + 4, p.hot, 0.5 * k) }
        // the beast: a body of flame and smoke, ears, a jaw, two white-hot eyes
        c.save(); c.translate(hx, hy); c.scale(d, 1)
        c.globalCompositeOperation = 'source-over'; glowAt(-10, 0, 70, p.ink, 0.55)
        c.globalCompositeOperation = 'lighter'
        glowAt(0, 0, 80, p.glow, 0.6)
        c.fillStyle = `rgba(${p.body},0.9)`
        const run = Math.sin(T * 30)
        c.beginPath(); c.ellipse(-8, 0, 58, 26 + 3 * run, 0, 0, TAU); c.fill()                          // body
        c.beginPath(); c.ellipse(46, -12, 26, 18, -0.2, 0, TAU); c.fill()                              // head
        c.beginPath(); c.moveTo(38, -26); c.lineTo(32, -56); c.lineTo(50, -30); c.fill()               // ears
        c.beginPath(); c.moveTo(52, -26); c.lineTo(56, -54); c.lineTo(64, -24); c.fill()
        c.beginPath(); c.moveTo(56, -2); c.lineTo(86, 2 + 4 * run); c.lineTo(58, 8); c.fill()           // jaw
        for (const lx of [-40, -20, 14, 30]) { c.beginPath(); c.ellipse(lx + run * (lx > 0 ? 8 : -8), 26, 8, 18, (lx > 0 ? 0.5 : -0.5) * run, 0, TAU); c.fill() }
        c.fillStyle = `rgba(${p.hot},0.9)`; c.beginPath(); c.ellipse(-4, -4, 40, 12, 0, 0, TAU); c.fill()
        glowAt(56, -16, 12, p.core, 1); glowAt(44, -18, 9, p.core, 1)
        c.restore()
      } })
    }, 'boss')
    return draw0 + 2.4
  }

  // -------------------------------------------------------------- stopped hour
  // Teknium's signature. A wind-up in normal time (the watch comes out, the ticks speed up), then
  // the world stops. He blinks to three spots round the heroine, and at each one a burst of
  // knives, cards and orbs leaves his hand at speed, brakes hard over ~0.15 s and locks in the
  // air with a ripple and a faint aim line. Everything except him and his clock goes sepia
  // (colour drained, warm grade, film grain, vignette, a slow shimmer). Then the watch snaps shut:
  // colour comes back at once with a shockwave and the clock breaks; after a 0.3 s grace the groups
  // launch one after another, each going from zero to full speed along its line. Three kinds, and
  // each has its own answer:
  //   knives, cards  thin gold steel, fast: dash through them, or be out of the ring in time
  //   orbs           big crimson glass with a gold clock ring, slow: slash them back at him
  //   wall           a black-and-crimson wall rolling in from one side: run past the gold line on
  //                  the floor where it stops (a dash does not save you)
  // The first cast is knives only, the next adds orbs, and the final mode adds the wall. There is
  // always a way out: the rings leave the run lane open, the rain leaves a marked spot, and the
  // wall stops short of that spot. Everything is drawn in batches (sprites made once, one path per
  // kind), and the breaks come from a fixed particle pool (the oldest particles are reused).
  const HOUR = { wind: 0.7, stop: 1.95, grace: 0.3, bursts: [0, 0.7, 1.3] }
  // his own poses for it (t-hourwind / t-hourstop / t-hourend), picked frame by frame: the
  // wind-up draws the watch and snaps (only the frames where the watch stays in one hand), each
  // blink in the stop is a calm step then a throwing gesture, the release shuts the watch and
  // folds his arms. Never the run or dash sheets.
  const HOUR_POSE = { wind: [0, 1, 3, 4, 4], stop: [[1, 0], [5, 2], [3, 4]], end: [0, 1, 2, 3, 5, 5] }
  const hourPose = (anim, f) => { B.anim = anim; B.animT = f / 10 + 0.05 }
  function tick(f0) { if (typeof tone === 'function') tone('square', f0, f0 * 0.7, 0.04, 0.05) }
  const sfx = (n, o) => { if (typeof SFXR !== 'undefined') try { SFXR.play(n, o) } catch { } }
  // hitboxes are well inside the sprites
  const KIND = {
    knife: { type: 'heavy', r: 5, dmg: 9, spd: 1050 },
    card: { type: 'heavy', r: 6, dmg: 9, spd: 920 },
    orb: { type: 'orb', r: 13, dmg: 12, spd: 430 },
    wall: { type: 'doom', r: 13, dmg: 16, spd: 250 },
  }
  let HW = null   // the live wave (the autoplay reads it)

  // ---- sprites, made once
  let SPR = null
  function canvas(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c }
  function softGlow(g, x, y, rx, ry, rgb, a) { g.save(); g.translate(x, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore() }
  function sprites() {
    if (SPR) return SPR
    SPR = {
      // a throwing knife along +x; its centre is (40, 12) and the tip reaches x = 70
      knife: canvas(74, 24, g => {
        softGlow(g, 46, 12, 30, 9, '255,206,110', 0.55)
        g.beginPath(); g.moveTo(71, 12); g.lineTo(40, 6.5); g.lineTo(31, 8); g.lineTo(31, 16); g.lineTo(40, 17.5); g.closePath()
        const lg = g.createLinearGradient(31, 0, 71, 0); lg.addColorStop(0, '#e9cf96'); lg.addColorStop(1, '#ffffff')
        g.fillStyle = lg; g.fill(); g.strokeStyle = '#3a1a06'; g.lineWidth = 1.6; g.stroke()
        g.strokeStyle = 'rgba(190,130,50,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(33, 12); g.lineTo(66, 12); g.stroke()
        g.fillStyle = '#e0a83a'; g.fillRect(27, 4, 4, 16); g.strokeStyle = '#3a1a06'; g.lineWidth = 1; g.strokeRect(27, 4, 4, 16)
        g.fillStyle = '#9e1420'; g.fillRect(13, 9, 14, 6)
        g.fillStyle = '#e0a83a'; g.beginPath(); g.arc(11, 12, 3.5, 0, TAU); g.fill()
      }),
      // a playing card, centre (20, 15)
      card: canvas(40, 30, g => {
        softGlow(g, 20, 15, 20, 15, '255,206,110', 0.5)
        g.fillStyle = '#f8ead0'; g.fillRect(8, 4, 24, 22); g.strokeStyle = '#5a3008'; g.lineWidth = 1.5; g.strokeRect(8, 4, 24, 22)
        g.strokeStyle = '#d8a03a'; g.lineWidth = 1; g.strokeRect(10.5, 6.5, 19, 17)
        g.fillStyle = '#b0121e'; g.beginPath(); g.moveTo(20, 9); g.lineTo(25, 15); g.lineTo(20, 21); g.lineTo(15, 15); g.closePath(); g.fill()
      }),
      // the big crimson glass orb with a gold clock ring, centre (48, 48)
      orb: canvas(96, 96, g => {
        const c = 48, gr = g.createRadialGradient(c - 6, c - 7, 1, c, c, 24)
        gr.addColorStop(0, '#fffaf2'); gr.addColorStop(0.28, '#ffc8b4'); gr.addColorStop(0.62, '#e8202c'); gr.addColorStop(1, '#6a0010')
        g.fillStyle = gr; g.beginPath(); g.arc(c, c, 24, 0, TAU); g.fill()
        g.strokeStyle = '#2a0006'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 24.5, 0, TAU); g.stroke()
        g.strokeStyle = '#ffd27a'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, 29, 0, TAU); g.stroke()
        g.lineWidth = 2.4; g.beginPath()
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r0 = i % 3 ? 32 : 31, r1 = i % 3 ? 35 : 39; g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1) }
        g.stroke()
      }),
      glow: canvas(128, 128, g => softGlow(g, 64, 64, 64, 64, '255,70,40', 0.7)),
      gold: canvas(128, 128, g => softGlow(g, 64, 64, 64, 64, '255,200,110', 0.8)),
      // a block of the rolling wall: a black core in a crimson rim (black = jump or run, as always)
      wall: canvas(48, 48, g => {
        softGlow(g, 24, 24, 24, 24, '200,20,36', 0.7)
        g.fillStyle = '#12020a'; g.beginPath(); g.arc(24, 24, 14, 0, TAU); g.fill()
        g.strokeStyle = 'rgba(255,90,90,0.95)'; g.lineWidth = 2; g.beginPath(); g.arc(24, 24, 15, 0, TAU); g.stroke()
        g.strokeStyle = '#ffd27a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(24, 14); g.lineTo(24, 24); g.lineTo(31, 24); g.stroke()
      }),
      vig: canvas(320, 180, g => { const gr = g.createRadialGradient(160, 90, 50, 160, 90, 190); gr.addColorStop(0, 'rgba(40,20,6,0)'); gr.addColorStop(0.6, 'rgba(40,20,6,0.25)'); gr.addColorStop(1, 'rgba(26,12,2,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, 320, 180) }),
      grain: [0, 1, 2].map(() => canvas(128, 128, g => { const im = g.createImageData(128, 128); for (let i = 0; i < im.data.length; i += 4) { const v = 128 + ((Math.random() * 2 - 1) * 70) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 } g.putImageData(im, 0, 0) })),
    }
    SPR.pat = SPR.grain.map(c => ctx.createPattern(c, 'repeat'))
    return SPR
  }
  // draw sprite `img` at world (x, y) rotated by r, centred on (cx, cy) of the image, scale s;
  // the matrix is built by hand from the camera matrix m (no save/restore per shot)
  function blit(m, img, x, y, r, cx, cy, s) {
    const co = Math.cos(r) * s, si = Math.sin(r) * s
    ctx.setTransform(m.a * co + m.c * si, m.b * co + m.d * si, -m.a * si + m.c * co, -m.b * si + m.d * co, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f)
    ctx.drawImage(img, -cx, -cy)
  }

  // ---- the particle pool for the breaks: fixed size, the oldest are reused, one batched path
  // per kind and fade step, no shadowBlur
  const PP = (() => {
    const N = 1400, X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N), TT = new Float32Array(N), LF = new Float32Array(N), SZ = new Float32Array(N), K = new Uint8Array(N)
    // kinds: 0 gold spark, 1 crimson spark, 2 steel shard, 3 crimson glass, 4 dust, 5 rock chip
    const G = [1500, 1500, 1900, 1700, -40, 1900], COL = ['255,224,150', '255,96,60', '255,240,214', '226,36,46', '150,118,84', '110,82,60']
    const A = [1, 0.62, 0.3]
    let head = 0, host = null, alive = 0
    const api = { floor: GROUND, get alive() { return alive } }
    const cap = () => low() ? 380 : N
    function hostUp() { if (!host || !fx.includes(host)) { host = { t: 0, dur: 99, update(dt) { step(dt); if (!alive) this.t = this.dur }, draw() { draw() } }; fx.push(host) } }
    api.add = (k, x, y, vx, vy, life, size) => { hostUp(); const i = head; head = (head + 1) % cap(); X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy; TT[i] = 0; LF[i] = life; SZ[i] = size; K[i] = k; alive = Math.max(alive, 1) }
    // n particles of kind k from (x, y): speed sp, direction dir +- spread
    api.burst = (k, x, y, n, sp0, sp1, dir, spread, l0, l1, s0, s1) => { for (let i = 0; i < n; i++) { const a = dir + rnd(-spread, spread), s = rnd(sp0, sp1); api.add(k, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(l0, l1), rnd(s0, s1)) } }
    function step(dt) {
      const n = cap(), fl = api.floor
      let c = 0
      for (let i = 0; i < n; i++) {
        if (TT[i] >= LF[i]) continue
        TT[i] += dt; c++
        const k = K[i]
        VY[i] += G[k] * dt; X[i] += VX[i] * dt; Y[i] += VY[i] * dt
        if (k === 4) { VX[i] *= 1 - 2 * dt; VY[i] *= 1 - 2 * dt }
        else if (Y[i] > fl && (k === 2 || k === 3 || k === 5)) { Y[i] = fl; VY[i] *= -0.32; VX[i] *= 0.55 }
      }
      alive = c
    }
    function draw() {
      const n = cap(), paths = []
      for (let k = 0; k < 6; k++) paths.push([new Path2D(), new Path2D(), new Path2D()])
      for (let i = 0; i < n; i++) {
        if (TT[i] >= LF[i]) continue
        const q = 1 - TT[i] / LF[i], b = q > 0.66 ? 0 : q > 0.33 ? 1 : 2, k = K[i], p = paths[k][b], s = SZ[i]
        if (k < 2) { p.moveTo(X[i], Y[i]); p.lineTo(X[i] - VX[i] * 0.022, Y[i] - VY[i] * 0.022) }
        else if (k === 4) p.rect(X[i] - s, Y[i] - s, s * 2, s * 2)
        else { const a = TT[i] * 14 + i, co = Math.cos(a) * s, si = Math.sin(a) * s; p.moveTo(X[i] + co, Y[i] + si); p.lineTo(X[i] - co * 0.6 - si * 0.7, Y[i] - si * 0.6 + co * 0.7); p.lineTo(X[i] - co * 0.4 + si * 0.8, Y[i] - si * 0.4 - co * 0.8); p.closePath() }
      }
      const c = ctx
      c.lineCap = 'round'
      for (let k = 0; k < 6; k++) for (let b = 0; b < 3; b++) {
        const p = paths[k][b]
        if (k < 2) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(${COL[k]},${A[b]})`; c.lineWidth = 2.2; c.stroke(p) }
        else { c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgba(${COL[k]},${A[b] * (k === 4 ? 0.4 : 0.95)})`; c.fill(p) }
      }
      c.globalCompositeOperation = 'source-over'
    }
    return api
  })()

  // ---- the plan: every shot's slot, aim and launch time, from where she stands now
  function hourPlan(lvl) {
    const lo = low(), P0 = { x: P.x, y: P.y }, fl = x => floorAt(x, P0.y - 40), fy = fl(P0.x)
    const ar = AR(), top = cam.y + 24
    let L = Math.max(cam.x + 30, ar.l + 30), R = Math.min(cam.x + VW() - 30, ar.r - 30)
    // the open floor she can run on: up to the nearest standing wall on each side
    if (typeof plats !== 'undefined') for (const p of plats) if (p.kind === 'wall' && !p.broken) { if (p.r < P0.x) L = Math.max(L, p.r + 34); else if (p.l > P0.x) R = Math.min(R, p.l - 34) }
    // the way out: toward the side with more room; the safe spot gx is there
    const d = (R - P0.x) >= (P0.x - L) ? 1 : -1, room = d > 0 ? R - P0.x : P0.x - L
    let gx = clamp(P0.x + d * clamp(room - 150, 170, 300), L + 90, R - 90)
    if (typeof inPit === 'function') for (let i = 0; i < 12 && inPit(gx); i++) gx -= d * 30
    const shots = []
    const add = (g, kind, x, y, a, go, burst) => { if (x < cam.x - 120 || x > cam.x + VW() + 120 || y < top || y > fy - 14) return null; const s = { g, kind, sx: x, sy: y, a, go, burst, curve: rnd(-1, 1) * 70, fd: rnd(0.3, 0.38) }; shots.push(s); return s }
    // a ring: upper arcs aimed at a point; the low sector on the way-out side stays open, so the
    // run lane at her height is clear in both directions
    const ring = (g, cx, cy, n, go, burst) => (lo ? [270, 330] : [255, 300, 345]).forEach((r, j) => {
      const ry = Math.min(r * 0.76, cy - top - 8 - j * 10)   // flatter under a low ceiling, never cut off
      for (let i = 0; i < n; i++) {
        const a = -Math.PI + 0.42 + (i + (j % 2) * 0.5) / n * (Math.PI - 0.84)
        if (Math.cos(a) * d > 0 && Math.abs(Math.sin(a)) < Math.sin(1.05)) continue
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * ry
        add(g, i % 4 === 2 ? 'card' : 'knife', x, y, ang(x, y, cx, cy), go, burst)
      }
    })
    ring(1, P0.x, P0.y - 60, lo ? 22 : 38, 0.3, 0)
    // the rain: two crossing sheets of knives into the floor, everywhere but the safe spot
    const th = 0.95, ct = Math.cos(th), st = Math.sin(th), step = lo ? 56 : 40
    let lane = 0
    for (let tx = L + 10; tx <= R - 10; tx += step, lane++) {
      if (Math.abs(tx - gx) < 90) continue
      const ty = fl(tx)
      for (const s of [-1, 1]) for (let j = 0; j < (lo ? 1 : 2); j++) {
        if (lo && s !== (lane % 2 ? 1 : -1)) continue
        const len = Math.min(430, (ty - top - 10) / st) - j * 80, sx = tx - s * ct * len, sy = ty - st * len
        // never low over the safe spot
        if (Math.min(sx, tx) < gx + 40 && Math.max(sx, tx) > gx - 40 && (Math.abs(gx - tx) - 40) * st / ct < 170) continue
        add(2, 'knife', sx, sy, ang(sx, sy, tx, ty), 1.0, 1)
      }
    }
    // the orbs: an arc above the safe spot, aimed at it, one after another (slash them back)
    if (lvl >= 1) { const no = lo ? 5 : 10; for (let i = 0; i < no; i++) { const a = -2.55 + i / (no - 1) * 2.0, x = gx + Math.cos(a) * 400, y = Math.max(top + 20, fy - 70 + Math.sin(a) * 280); add(3, 'orb', x, y, ang(x, y, gx + rnd(-24, 24), fy - 70), 1.25 + i * 0.07, 1) } }
    // the last ring closes on the safe spot itself (dash it)
    ring(4, gx, fy - 60, lo ? 18 : 34, 2.5, 2)
    // the wall: from the far side, it stops at the gold line short of the safe spot (run)
    let xe = null
    if (lvl >= 2) {
      const dist = d > 0 ? P0.x - L : R - P0.x, x0 = P0.x - d * Math.max(240, Math.min(dist + 60, 520))
      xe = gx - d * 120
      for (let y = fy - 14; y > fy - 310; y -= lo ? 40 : 26) { const s = add(5, 'wall', x0, y, d > 0 ? 0 : Math.PI, 0.35, 2); if (s) { s.curve = 0; s.xe = xe } }
    }
    return { shots, gx, d, fy, xe, lvl, P0, lastGo: Math.max(...shots.map(s => s.go)) }
  }

  function stoppedHour() {
    const last = (B.f.modes?.length || 1) - 1
    const lvl = window.HOUR_LVL ?? (B.mode >= Math.max(1, last) ? 2 : B.hourN ? 1 : 0)
    B.hourN = (B.hourN || 0) + 1
    later(0, () => { if (live()) hourStop(lvl) }, 'boss')
    return HOUR.wind + HOUR.stop + 2.9
  }
  function hourStop(lvl) {
    B.run = null
    // the wind-up runs in normal time (a hand up, the clock blooms, ticks speed up)
    let nextTick = 0
    hourPose('hourwind', 0)
    fx.push({ boss: true, t: 0, dur: HOUR.wind, update() {
      const w = HOUR_POSE.wind; hourPose('hourwind', w[Math.min(w.length - 1, (this.t / HOUR.wind * w.length) | 0)])
      if (this.t >= nextTick) { tick(1500 + 1500 * this.t / HOUR.wind); nextTick = this.t + 0.18 * (1 - this.t / HOUR.wind) + 0.04 }
    }, draw(k) {
      drawClock(B.x, B.y + (B.float ? -140 : 0) - B.h * 0.6, ease(k), 1, T)
      // he stands in front of his clock, drawn solid (the clock leaves the blend on 'lighter')
      ctx.globalCompositeOperation = 'source-over'; ctx.save(); try { drawBoss() } catch { } ctx.restore()
    } })
    later(HOUR.wind, () => { if (live()) startWave(lvl) }, 'boss')
  }
  function startWave(lvl) {
    const w = hourPlan(lvl)
    HW = w
    sprites()
    w.s0 = T; w.fired = [false, false, false]; w.locked = [false, false, false]; w.refl = []; w.si = 0
    // stop the world: the core skips every update while stopT > 0, so the stop is drawn from T
    stopT = HOUR.stop + 0.02
    w.stash = parts; parts = []
    w.held = B.mode >= 1 ? bullets.filter(b => b.enemy && !b.dead && b.type !== 'doom' && !b.hour) : []
    PP.floor = w.fy
    // the blink spots: his own spot first, then one on each side of her, all on screen
    const view = [Math.max(AR().l + 100, cam.x + 140), Math.min(AR().r - 100, cam.x + VW() - 140)]
    const spots = [B.x]
    for (const dd of [280, -280, 340, -340, 420, -420, 220, -220]) { const x = P.x + dd * (spots.length === 1 ? Math.sign(B.x - P.x) || 1 : -Math.sign(spots[1] - P.x) || 1); if (spots.length < 3 && x > view[0] && x < view[1] && spots.every(o => Math.abs(o - x) > 140)) spots.push(x) }
    while (spots.length < 3) spots.push(clamp(P.x + (spots.length % 2 ? 300 : -300), view[0], view[1]))
    w.spots = spots
    w.fx = { boss: true, t: 0, dur: 99, update(dt) { if (w.released && !w.over) waveStep(w, dt) }, draw() { waveDraw(w, this) } }
    fx.push(w.fx)
  }

  const hand = () => ({ x: B.x + (B.face || 1) * 44, y: B.y + (B.float ? -140 : 0) - (B.h || 280) * 0.6 })
  function shotPos(w, s) {
    if (s.b) return !s.b.dead
    if (s.ox == null) return false
    const u = T - w.s0 - s.ls
    if (u < 0) return false
    const k = Math.min(1, u / s.fd), e = 1 - (1 - k) ** 4, dx = s.sx - s.ox, dy = s.sy - s.oy, m = Math.hypot(dx, dy) || 1, o = Math.sin(Math.PI * k) * s.curve
    s.x = s.ox + dx * e - dy / m * o; s.y = s.oy + dy * e + dx / m * o; s.k = k
    s.rot = s.kind === 'card' ? s.a + (1 - e) * 16 : s.kind === 'wall' ? 0 : Math.atan2(dy, dx) + (s.a - Math.atan2(dy, dx)) * k * k
    if (k >= 1 && s.lock == null) s.lock = T
    return true
  }

  function waveDraw(w, self) {
    const c = ctx
    if (w.over) { self.t = self.dur; if (HW === w) HW = null; window.HOUR_BEAT = null; return }
    if (!w.released) {
      const u = T - w.s0
      if (u >= HOUR.stop) { release(w) }
      else {
        // which spot he is at: a blink at each burst after the first
        const si = u < HOUR.bursts[1] - 0.15 ? 0 : u < HOUR.bursts[2] - 0.15 ? 1 : 2
        if (si !== w.si) { w.si = si; glowAt(B.x, B.y - B.h * 0.5, 80, '255,160,36', 0.6); B.x = w.spots[si]; B.y = groundAtBoss(B.x); B.vy = 0; B.face = P.x < B.x ? -1 : 1; tick(700) }
        hourPose('hourstop', HOUR_POSE.stop[si][u >= HOUR.bursts[si] - 0.02 ? 1 : 0])
        // the bursts leave his hand
        for (let i = 0; i < 3; i++) if (!w.fired[i] && u >= HOUR.bursts[i]) {
          w.fired[i] = true
          const h = hand(), list = w.shots.filter(s => s.burst === i)
          list.forEach((s, j) => { s.ox = s.kind === 'wall' ? s.sx : h.x; s.oy = s.kind === 'wall' ? w.fy + 10 : h.y; s.ls = HOUR.bursts[i] + j / Math.max(1, list.length) * 0.16 })
          w['flash' + i] = { x: h.x, y: h.y, t: T }
          sfx('o_blade', { x: h.x, vol: 0.8 }); sfx('card_deal', { x: h.x, delay: 0.05 })
        }
        const beatSummon = HOUR.bursts.some(b => u >= b && u < b + 0.55)
        window.HOUR_BEAT = beatSummon ? 'summon' : 'freeze'
        // the world drains to sepia as the first burst locks
        const kS = clamp((u - 0.3) / 0.1, 0, 1)
        // the sparks that were in the air hang there, graded with the rest of the world
        c.globalCompositeOperation = 'source-over'
        for (const q of w.stash) { c.globalAlpha = 0.5; drawPart(q) }
        c.globalAlpha = 1
        grade(kS, u)
        // the sweep ring that stops it all
        const ru = u - 0.3
        if (ru > 0 && ru < 0.5) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,236,160,${1 - ru * 2})`; c.lineWidth = 10 * (1 - ru * 2) + 2; c.beginPath(); c.arc(B.x, B.y - B.h * 0.6, 60 + 2400 * ease(ru * 2), 0, TAU); c.stroke() }
        if (!w.lockSnd && ru > 0) { w.lockSnd = true; SFX.glare(); tick(900) }
        // he and his clock stay in colour
        drawClock(B.x, B.y + (B.float ? -140 : 0) - B.h * 0.6, 1, 0.7, w.s0)
        c.globalCompositeOperation = 'source-over'; c.save(); try { drawBoss() } catch { } c.restore()
        // the held shots from before the stop get their new lines too
        for (const b of w.held) if (!b.dead) aimLine(b.x, b.y, ang(b.x, b.y, P.x, P.y - 80), 0.7, '255,214,120')
        for (const s of w.shots) shotPos(w, s)
        drawMarks(w, kS)
        drawShots(w)
        for (let i = 0; i < 3; i++) { const f = w['flash' + i]; if (f && T - f.t < 0.2) muzzle(f.x, f.y, (T - f.t) / 0.2) }
      }
      return
    }
    // after the release: the snap, then the shots in flight (moved by the core, driven by waveStep)
    const r = w.rt
    window.HOUR_BEAT = w.broken ? 'break' : 'release'
    if (r < 0.45) {
      const q = r / 0.45, x = w.cx, y = w.cy
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = `rgba(255,244,220,${1 - q})`; c.lineWidth = 14 * (1 - q) + 2; c.beginPath(); c.arc(x, y, 40 + 2200 * ease(q), 0, TAU); c.stroke()
      c.strokeStyle = `rgba(255,80,60,${0.6 * (1 - q)})`; c.lineWidth = 5; c.beginPath(); c.arc(x, y, 30 + 2050 * ease(q), 0, TAU); c.stroke()
      if (q < 0.4) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(255,248,232,${0.35 * (1 - q / 0.4)})`; c.fillRect(0, 0, W, H); c.restore() }
    }
    drawMarks(w, 1)
    drawShots(w)
  }

  // the screen grade for the stop: drained colour, a warm sepia, grain, a vignette and a slow
  // shimmer (low quality: a sepia veil and the vignette)
  function grade(k, u) {
    if (k <= 0) return
    const c = ctx, S = sprites()
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = k
    if (low()) { c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(112,84,52,0.58)'; c.fillRect(0, 0, W, H) }
    else {
      c.globalCompositeOperation = 'saturation'; c.fillStyle = '#808080'; c.fillRect(0, 0, W, H)
      c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(242,204,150)'; c.fillRect(0, 0, W, H)
      c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgb(44,26,10)'; c.fillRect(0, 0, W, H)
      // film grain, a new frame of it 24 times a second
      const f = (T * 24) | 0, ox = (f * 37) % 128, oy = (f * 71) % 128
      c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.42 * k; c.fillStyle = S.pat[f % 3]
      c.translate(-ox, -oy); c.fillRect(0, 0, W + 128, H + 128); c.translate(ox, oy)
      // the frozen shimmer: a slow bright band over the stopped world
      const x = ((u * 0.5) % 1.4 - 0.2) * W, g = c.createLinearGradient(x - 220, 0, x + 220, H * 0.5)
      g.addColorStop(0, 'rgba(255,236,190,0)'); g.addColorStop(0.5, 'rgba(255,236,190,0.13)'); g.addColorStop(1, 'rgba(255,236,190,0)')
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = k; c.fillStyle = g; c.fillRect(0, 0, W, H)
      // two film scratches
      c.fillStyle = 'rgba(255,240,210,0.16)'; for (let i = 0; i < 2; i++) c.fillRect(((f * (i ? 131 : 57)) % 97) / 97 * W, 0, 1.5, H)
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = k; c.drawImage(S.vig, 0, 0, W, H)
    c.restore()
  }
  function muzzle(x, y, q) {
    const c = ctx
    c.globalCompositeOperation = 'lighter'
    glowAt(x, y, 90 * (1 - q * 0.5), '255,230,170', 1 - q)
    c.strokeStyle = `rgba(255,246,220,${1 - q})`; c.lineWidth = 2.5; c.beginPath()
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2, r0 = 20 + 40 * q, r1 = r0 + 50 * (1 - q); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1) }
    c.stroke()
  }
  // the floor marks: the safe spot (a gold ring) and, with the wall, the gold line where it stops
  function drawMarks(w, k) {
    const c = ctx, pulse = 0.6 + 0.4 * Math.sin(T * 8)
    c.globalCompositeOperation = 'lighter'
    if (!w.released || w.rt < 2.6) {
      c.strokeStyle = `rgba(255,214,120,${0.55 * k * pulse})`; c.lineWidth = 2.5
      c.beginPath(); c.ellipse(w.gx, w.fy - 3, 54, 10, 0, 0, TAU); c.stroke()
    }
    if (w.xe != null && w.shots.some(s => s.kind === 'wall' && (s.ox != null) && !s.done)) {
      c.fillStyle = `rgba(255,214,120,${0.75 * k})`; c.fillRect(w.xe - 2, w.fy - 70, 4, 70)
      c.strokeStyle = `rgba(255,214,120,${0.5 * k})`; c.lineWidth = 2; c.beginPath()
      for (let i = 1; i <= 3; i++) { const x = w.xe - w.d * (i * 26 + ((T * 60) % 26)); c.moveTo(x - w.d * 8, w.fy - 12); c.lineTo(x, w.fy - 4); c.lineTo(x - w.d * 8, w.fy + 4) }
      c.stroke()
    }
  }
  function aimLine(x, y, a, k, rgb) {
    const c = ctx, sn = Math.sin(a), L = sn > 0.05 ? Math.min(1100, ((HW ? HW.fy : GROUND) - y) / sn) : 1100
    c.globalCompositeOperation = 'source-over'; c.strokeStyle = `rgba(40,20,6,${0.4 * k})`; c.lineWidth = 3
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + sn * L); c.stroke()
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(${rgb},${0.6 * k})`; c.lineWidth = 1.2
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + sn * L); c.stroke()
  }
  // every shot of the wave in a handful of calls: aim lines (two paths per colour), ripples, trails,
  // then the sprites
  function drawShots(w) {
    const c = ctx, S = sprites(), lo = low()
    const next = w.released ? Math.min(...w.shots.filter(s => s.b && !s.done && w.rt < s.go).map(s => s.go)) : w.shots[0]?.go
    const lines = { kb: new Path2D(), kd: new Path2D(), ob: new Path2D(), od: new Path2D() }, under = new Path2D(), rip = new Path2D(), tk = new Path2D(), to = new Path2D()
    const pulse = 0.5 + 0.5 * Math.sin(T * 40)
    const live = []
    for (const s of w.shots) {
      let x, y, rot, moving
      if (s.b) { if (s.done || s.b.dead) continue; x = s.b.x; y = s.b.y; moving = w.rt >= s.go; rot = s.kind === 'card' ? s.a + (moving ? (w.rt - s.go) * 30 : 0) : s.kind === 'wall' ? 0 : s.a }
      else { if (s.x == null || s.ox == null || T - w.s0 < s.ls) continue; x = s.x; y = s.y; rot = s.rot; moving = s.k < 1 }
      live.push([s, x, y, rot])
      // the aim line, from the moment it locks until it flies
      const locked = s.b ? w.rt < s.go : s.k >= 1
      if (locked && s.kind !== 'wall') {
        const bright = s.go === next, sn = Math.sin(s.a), L = sn > 0.05 ? Math.min(1100, (w.fy - y) / sn) : 1100, ex = x + Math.cos(s.a) * L, ey = y + sn * L
        const p = s.kind === 'orb' ? (bright ? lines.ob : lines.od) : (bright ? lines.kb : lines.kd)
        p.moveTo(x, y); p.lineTo(ex, ey)
        if (bright) { under.moveTo(x, y); under.lineTo(ex, ey) }
      }
      // the time ripple as it locks
      if (!s.b && s.lock != null && T - s.lock < 0.3) { const q = (T - s.lock) / 0.3, rr = 4 + 26 * q; rip.moveTo(x + rr, y); rip.arc(x, y, rr, 0, TAU) }
      // trails while it moves
      if (moving && s.kind !== 'wall') {
        let vx, vy
        if (s.b) { vx = s.b.vx; vy = s.b.vy } else { vx = (s.sx - s.ox) * 4 * (1 - s.k) ** 3 / s.fd; vy = (s.sy - s.oy) * 4 * (1 - s.k) ** 3 / s.fd }
        const sp = Math.hypot(vx, vy), l = Math.min(s.kind === 'orb' ? 70 : 90, sp * 0.05)
        if (sp > 30) { const p = s.kind === 'orb' ? to : tk; p.moveTo(x, y); p.lineTo(x - vx / sp * l, y - vy / sp * l) }
      }
    }
    c.lineCap = 'round'
    c.globalCompositeOperation = 'source-over'; c.strokeStyle = 'rgba(40,20,6,0.3)'; c.lineWidth = 2.5; c.stroke(under)
    c.globalCompositeOperation = 'lighter'
    const kb = w.released ? 0.5 + 0.4 * pulse : 0.34
    c.lineWidth = 1
    c.strokeStyle = `rgba(255,214,120,${kb})`; c.stroke(lines.kb)
    c.strokeStyle = 'rgba(255,214,120,0.12)'; c.stroke(lines.kd)
    c.lineWidth = 2
    c.strokeStyle = `rgba(255,90,70,${kb})`; c.stroke(lines.ob)
    c.strokeStyle = 'rgba(255,90,70,0.24)'; c.stroke(lines.od)
    c.strokeStyle = 'rgba(255,236,190,0.6)'; c.lineWidth = 1.5; c.stroke(rip)
    c.strokeStyle = 'rgba(255,214,130,0.5)'; c.lineWidth = 2; c.stroke(tk)
    c.strokeStyle = 'rgba(255,70,50,0.35)'; c.lineWidth = 14; c.stroke(to)
    // the wall's band, behind its blocks
    const walls = live.filter(([s]) => s.kind === 'wall')
    if (walls.length) {
      const x = walls[0][1], top = Math.min(...walls.map(v => v[2])) - 24, g = c.createLinearGradient(x - 40, 0, x + 40, 0)
      g.addColorStop(0, 'rgba(120,0,16,0)'); g.addColorStop(0.5, 'rgba(70,0,12,0.55)'); g.addColorStop(1, 'rgba(120,0,16,0)')
      c.globalCompositeOperation = 'source-over'; c.fillStyle = g; c.fillRect(x - 40, top, 80, w.fy - top)
    }
    const m = c.getTransform()
    // glows first (added), then the bodies (drawn over, so they read on any sky and on sepia)
    if (!lo) { c.globalCompositeOperation = 'lighter'; for (const [s, x, y] of live) if (s.kind === 'orb') blit(m, S.glow, x, y, 0, 64, 64, 0.75) }
    c.globalCompositeOperation = 'source-over'
    for (const [s, x, y, rot] of live) {
      if (s.kind === 'knife') blit(m, S.knife, x, y, rot, 40, 12, 0.62)
      else if (s.kind === 'card') blit(m, S.card, x, y, rot, 20, 15, 0.7)
      else if (s.kind === 'orb') blit(m, S.orb, x, y, T * 0.8 + s.sx, 48, 48, 0.8)
      else blit(m, S.wall, x, y, 0, 24, 24, 1)
    }
    c.setTransform(m)
  }

  function release(w) {
    w.released = true; w.rt = 0
    tick(400); SFX.zap(); sfx('boom', { vol: 0.5 })
    // the release: the watch snaps shut, a glove tug, arms folded; then back to his idle
    hourPose('hourend', 0)
    fx.push({ boss: true, t: 0, dur: 1.4, update() {
      if (B.anim !== 'hourend') return
      const e = HOUR_POSE.end
      if (this.t >= this.dur - 0.05) { B.anim = 'idle'; B.animT = 0 } else hourPose('hourend', e[Math.min(e.length - 1, (this.t / 1.2 * e.length) | 0)])
    }, draw() { } })   // a draw is required: the fx loop ends any fx whose draw throws
    flash = Math.max(flash, 0.5); flashColor = '255,246,226'; shake = Math.max(shake, low() ? 4 : 9)
    if (w.stash) { parts = w.stash.concat(parts); w.stash = null }
    for (const b of w.held) { const a = ang(b.x, b.y, P.x, P.y - 80), sp = Math.max(260, Math.hypot(b.vx, b.vy)); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp }
    // the clock breaks
    w.cx = B.x; w.cy = B.y + (B.float ? -140 : 0) - B.h * 0.6
    const lo = low()
    for (let i = 0; i < (lo ? 14 : 44); i++) { const a = rnd(0, TAU), r = 190 * rnd(0.6, 1); PP.add(i % 3 ? 2 : 0, w.cx + Math.cos(a) * r, w.cy + Math.sin(a) * r, Math.cos(a) * rnd(200, 600), Math.sin(a) * rnd(200, 600) - 200, rnd(0.6, 1.2), rnd(3, 6)) }
    // every shot becomes a real bullet, still for its grace
    for (const s of w.shots) {
      if (s.ox == null) continue
      const K = KIND[s.kind], b = ebullet(s.sx, s.sy, s.a, 0, { type: K.type, r: K.r, dmg: K.dmg, life: s.go + 3.5 })
      b.vx = 0; b.vy = 0; b.hour = s.kind; s.b = b; s.full = bsp(K.spd)
      bullets.push(b)
    }
  }
  function waveStep(w, dt) {
    w.rt += dt
    const lo = low(), ar = AR()
    let left = 0
    for (const s of w.shots) {
      const b = s.b
      if (!b || s.done) continue
      if (b.dead) { s.done = true; broke(w, s, b); continue }
      left++
      if (w.rt < s.go) { b.vx = 0; b.vy = 0; continue }
      if (!s.went) { s.went = true; if (s.kind === 'orb') sfx('o_shot', { x: b.x, vol: 0.5 }); else if (!w['snd' + s.g]) { w['snd' + s.g] = true; sfx('o_blade', { x: b.x }) } }
      // from zero to full speed in 0.16 s
      const k = Math.min(1, (w.rt - s.go) / 0.16), sp = s.full * k * k
      b.vx = Math.cos(s.a) * sp; b.vy = Math.sin(s.a) * sp
      if (s.kind === 'wall') {
        if ((b.x - s.xe) * w.d >= 0) { b.dead = true; s.done = true; for (let i = 0; i < (lo ? 2 : 5); i++) PP.add(i % 2 ? 4 : 5, b.x, b.y, rnd(-120, 120), rnd(-260, 40), rnd(0.4, 0.9), rnd(3, 7)); if (!w.crumble) { w.crumble = true; sfx('debris', { x: b.x }) } }
        else if (!lo && b.y > w.fy - 20 && Math.random() < 0.6) PP.add(4, b.x - w.d * 20, w.fy - 4, -w.d * rnd(40, 120), rnd(-60, -10), rnd(0.4, 0.8), rnd(4, 8))
      } else if (b.y >= w.fy - 2) { b.dead = true; s.done = true; floorBreak(w, s, b) }
      else if (b.x < ar.l + 4 || b.x > ar.r - 4) { b.dead = true; s.done = true; PP.burst(0, b.x, b.y, lo ? 2 : 5, 120, 420, b.x < ar.l + 4 ? 0 : Math.PI, 1.2, 0.15, 0.35, 1, 2) }
    }
    // reflected orbs: follow them back to him and shatter them where they land
    for (const o of w.refl) if (o.dead || !bullets.includes(o)) { o.gone = true; shatter(o.x, o.y, 1.4) }
    w.refl = w.refl.filter(o => !o.gone)
    if ((!left && !w.refl.length) || w.rt > w.lastGo + 3.5) w.over = true
  }
  function floorBreak(w, s, b) {
    w.broken = true
    const lo = low(), x = b.x, y = w.fy - 2
    if (s.kind === 'orb') { shatter(x, y, 1); if (typeof FOE !== 'undefined') FOE.scorch(x, w.fy, 34); return }
    PP.burst(0, x, y, lo ? 2 : 5, 160, 520, -Math.PI / 2, 1.3, 0.15, 0.4, 1, 2)
    PP.burst(2, x, y, lo ? 1 : 2, 120, 380, -Math.PI / 2, 1.1, 0.4, 0.8, 2, 4)
    if (!lo) PP.add(4, x, y, rnd(-40, 40), rnd(-80, -20), rnd(0.4, 0.7), rnd(3, 6))
    sfx('hit_metal', { x, vol: 0.25 })
  }
  function shatter(x, y, s) {
    const lo = low()
    PP.burst(3, x, y, Math.round((lo ? 4 : 12) * s), 160, 520, -Math.PI / 2, Math.PI, 0.5, 1.0, 2.5, 5)
    PP.burst(1, x, y, Math.round((lo ? 3 : 9) * s), 200, 620, -Math.PI / 2, Math.PI, 0.15, 0.4, 1, 2)
    PP.burst(0, x, y, lo ? 1 : 4, 100, 300, -Math.PI / 2, Math.PI, 0.2, 0.4, 1, 2)
    sfx('o_crash', { x, vol: 0.45 })
  }
  // a shot that died to something else: the sword (orbs go back at him), a spell, or her
  function broke(w, s, b) {
    if (b.x < cam.x - 60 || b.x > cam.x + VW() + 60) return
    if (s.kind === 'orb') {
      const o = bullets.find(o => !o.enemy && o.reflected && !o.hourR && Math.abs(o.x - b.x) < 40 && Math.abs(o.y - b.y) < 40)
      if (o) { o.hourR = true; w.refl.push(o) }
      shatter(b.x, b.y, 0.6)
    } else PP.burst(0, b.x, b.y, low() ? 2 : 5, 140, 420, 0, Math.PI, 0.15, 0.35, 1, 2)
  }
  // a reflected orb on its way back: brighter, gold-ringed
  function drawHourRefl(b) {
    const S = sprites(), m = ctx.getTransform()
    ctx.globalCompositeOperation = 'lighter'; blit(m, S.gold, b.x, b.y, 0, 64, 64, 0.8)
    ctx.globalCompositeOperation = 'source-over'; blit(m, S.orb, b.x, b.y, T * 6, 48, 48, 0.8)
    ctx.setTransform(m); ctx.globalCompositeOperation = 'lighter'
  }
  // Teknium's ordinary shots (fan, ring, spiral, lances, rain) get the same look: gold knives for
  // the heavy ones, crimson clock orbs for the red ones, each with a short trail
  function drawTek(b) {
    const S = sprites(), m = ctx.getTransform(), sp = Math.hypot(b.vx, b.vy), a = Math.atan2(b.vy, b.vx)
    if (sp > 30) { const l = Math.min(70, sp * 0.06); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = b.type === 'heavy' ? 'rgba(255,214,130,0.55)' : 'rgba(255,70,50,0.35)'; ctx.lineWidth = b.type === 'heavy' ? 3 : b.r * 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * l, b.y - Math.sin(a) * l); ctx.stroke() }
    if (b.type === 'heavy') { ctx.globalCompositeOperation = 'source-over'; blit(m, S.knife, b.x, b.y, a, 40, 12, Math.max(1, b.r / 9)) }
    else { if (!low()) { ctx.globalCompositeOperation = 'lighter'; blit(m, S.glow, b.x, b.y, 0, 64, 64, b.r / 18) } ctx.globalCompositeOperation = 'source-over'; blit(m, S.orb, b.x, b.y, T * 0.8 + b.x * 0.01, 48, 48, b.r / 15) }
    ctx.setTransform(m); ctx.globalCompositeOperation = 'lighter'
  }
  // the autoplay for the wave: go to the safe spot (past the wall's line), dash a knife that is
  // about to land, slash an orb back (Messenger) or dash it, and never stand in the wall's way
  function hourPilot(w) {
    const go = d => vkey(d > 0 ? 'arrowright' : 'arrowleft')
    const canDash = P.dashCD <= 0 && (P.ground || P.airDash > 0)
    const cx = P.x, cy = P.y - 60
    let kT = 9, oT = 9, ob = null
    for (const s of w.shots) {
      const b = s.b
      if (!b || b.dead || s.done || s.kind === 'wall') continue
      const sp2 = b.vx * b.vx + b.vy * b.vy
      if (sp2 < 1600) continue
      const rx = b.x - cx, ry = b.y - cy, tt = -(rx * b.vx + ry * b.vy) / sp2
      if (tt < 0 || tt > 0.5) continue
      const mx = rx + b.vx * tt, my = (ry + b.vy * tt) * 0.5
      if (Math.hypot(mx, my) > 30 + b.r) continue
      if (s.kind === 'orb') { if (tt < oT) { oT = tt; ob = b } } else kT = Math.min(kT, tt)
    }
    const dir = Math.sign(w.gx - P.x) || w.d
    if (kT < 0.11 && canDash) { vtap('shift'); go(dir); return }
    if (ob && oT < 0.26) {
      if (P.hero === 'messenger') { P.face = Math.sign(ob.x - P.x) || P.face; vtap('j'); return }
      if (canDash && oT < 0.12) { vtap('shift'); go(dir); return }
    }
    if (Math.abs(w.gx - P.x) > 22) go(w.gx - P.x)
  }
  // the clock face: rings, twelve numeral marks (gold), two hands
  function drawClock(x, y, k, a, t0) {
    if (k <= 0) return
    const c = ctx, r = 190 * k
    c.globalCompositeOperation = 'lighter'
    glowAt(x, y, r * 1.3, '255,170,60', 0.25 * a)
    c.strokeStyle = `rgba(255,214,120,${0.8 * a})`; c.lineWidth = 4
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke()
    c.strokeStyle = `rgba(200,40,40,${0.5 * a})`; c.lineWidth = 2
    c.beginPath(); c.arc(x, y, r * 0.86, 0, TAU); c.stroke()
    c.fillStyle = `rgba(255,232,170,${0.9 * a})`; c.font = `600 ${Math.round(20 * k)}px Cinzel, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'
    const NUM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
    for (let i = 0; i < 12; i++) { const q = i / 12 * TAU - Math.PI / 2; c.fillText(NUM[i], x + Math.cos(q) * r * 0.74, y + Math.sin(q) * r * 0.74) }
    const ha = (t0 * 0.7) % TAU - Math.PI / 2, ma = (t0 * 6) % TAU - Math.PI / 2
    c.strokeStyle = `rgba(255,240,200,${a})`; c.lineCap = 'round'
    c.lineWidth = 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ha) * r * 0.45, y + Math.sin(ha) * r * 0.45); c.stroke()
    c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ma) * r * 0.7, y + Math.sin(ma) * r * 0.7); c.stroke()
    glowAt(x, y, 14, '255,250,236', a)
  }

  // -------------------------------------------------------------- wiring
  const NEW = { storm, firewall, maelstrom, radiance, arcs, nova, hound, stopped_hour: stoppedHour }
  if (typeof PATTERNS !== 'undefined') Object.assign(PATTERNS, NEW)
  if (typeof PATTERN_POSE !== 'undefined') Object.assign(PATTERN_POSE, { storm: 'cast', firewall: 'cast', maelstrom: 'cast', radiance: 'laugh', arcs: 'cast', nova: 'cast', hound: 'cast', stopped_hour: 'hourwind' })
  if (typeof BOSS_SHEETS !== 'undefined') Object.assign(BOSS_SHEETS, { hourwind: ['hourwind', 'laugh', 'idle'], hourstop: ['hourstop', 'idle'], hourend: ['hourend', 'idle'] })
  // slot the spells into the boss's modes at the start of the fight (a copy: FIGHTS is untouched)
  function withSpells(handle, f) {
    const s = SET[handle]
    if (!s || !f || !f.modes) return f
    let j = 0
    const modes = f.modes.map((m, i) => {
      const add = []
      if (s.sig && !m.patterns.includes(s.sig)) add.push(s.sig)
      if (i > 0) { const sp = s.spells.filter(x => x !== s.sig); const pick = sp[j++ % sp.length]; if (pick && !add.includes(pick)) add.push(pick); if (i === f.modes.length - 1 && sp.length > 1) { const p2 = sp[j++ % sp.length]; if (!add.includes(p2)) add.push(p2) } }
      if (!add.length) return m
      const pats = m.patterns.slice()
      add.forEach((x, k) => pats.splice(Math.min(pats.length, 1 + k * 2), 0, x))
      return { ...m, patterns: pats }
    })
    return { ...f, modes }
  }
  if (typeof startBoss === 'function') {
    const coreStart = startBoss
    window.startBoss = function (handle, sec, o) {
      const r = coreStart(handle, sec, o)
      if (B && B.handle === handle && !window.NOSPELLS) B.f = withSpells(handle, B.f)
      if (B && B.handle === 'Teknium') try { sprites() } catch { }   // made before the fight, not mid-spell
      return r
    }
  }
  // the autoplay takes the stopped hour's wave itself (the core reflexes don't know its kinds)
  if (typeof autopilot === 'function') {
    const coreAuto = autopilot
    window.autopilot = function () {
      const w = HW
      if (!w || !w.released || w.over || !AUTO.on || mode !== 'play' || P.dead || stopT > 0 || !fx.includes(w.fx)) return coreAuto()
      for (const k of AUTO.held) if (!['j'].includes(k) || !AUTO.keepJ) keys.delete(k)
      AUTO.held.clear()
      if (tap('p')) { AUTO.on = false; return }
      hourPilot(w)
    }
  }
  return { ...NEW, hues: HUES, set: SET, withSpells, pool: PP, get wave() { return HW } }
})()
