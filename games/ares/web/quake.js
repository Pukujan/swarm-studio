// 天地崩 Worldfall Rupture: Baker's (hero id `messenger`) ultimate while she carries the
// Coresunder (weapons.js). With the winged greatsword her ultimate stays Thousand Flash.
// Layered on the core and on thousand.js (the core `ultimate()` is wrapped again, so R at full
// meter triggers it).
//
// 1. The portrait cut-in (FXK.ultPanel) with the quake's name.
// 2. She leaps high with the cleaver raised and plunges it into the ground: hitstop, a white-gold
//    flash, every enemy on screen thrown up, the boss struck hard.
// 3. The quake: the whole view shakes hard for about 3 s, easing out. Gold cracks spider out
//    across the whole floor from the blade and over the tops of the platforms.
// 4. Sky-high waves erupt everywhere in a staggered cascade, nearest first, out to the far
//    edges: along the floor and from every platform. Each one is a Heavenpierce Tide wave
//    (skywave.js, SKYWAVE.launch) with its columns, ribbons, lightning veins and rock debris, so
//    enemies are juggled from wave to wave; breakable platforms break.
// 5. Dust settles along the floor, embers drift up, and a short warm afterglow fades.
//
// Scaling: ult level (`moon` boon, like the eclipse) and TRAIL.level(): denser sites, bigger
// waves, a second cascade from level 2, a longer quake, more damage. PERF.low: fewer, wider-spaced
// sites with fewer ribbons and particles. Sound: SFX.heavy(), SFX.boom(), then the optional hook
// SFX.quake(). Colours: white-hot, gold, crimson, rose; never blue, purple or green.

let QK = null

{
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const tierOf = () => typeof TRAIL !== 'undefined' && TRAIL.level ? TRAIL.level() : 1
  const ultLv = () => 1 + (typeof nB === 'function' ? nB('moon') : 0)
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3)
  const GOLD = '255,180,70', WHITE = '255,245,225', CRIMSON = '200,25,45', ORANGE = '255,140,50'
  const dot = (...a) => typeof TRAIL !== 'undefined' && TRAIL.dot && TRAIL.dot(...a)
  const pose = (s, f) => (typeof ghostPose === 'function' ? ghostPose(s, f) : { sheet: s, frame: f })
  const G = 3000

  const view = () => {
    const ar = typeof AR === 'function' ? AR() : { l: cam.x, r: cam.x + VW() }
    return { l: Math.max(cam.x, ar.l) + 20, r: Math.min(cam.x + VW(), ar.r) - 20 }
  }

  // a jagged crack from (x, y) along dir; segments carry their distance from the impact
  function crackLine(x, y, dx, len, d0, jy = 3) {
    const pts = []; let cx = x, cy = y, d = d0
    pts.push([cx, cy, d])
    while (Math.abs(cx - x) < len) { const st = R(14, 30); cx += dx * st; cy = y + R(-jy, jy); d += st; pts.push([cx, cy, d]) }
    return pts
  }
  function buildCracks(x0, gy, vw) {
    const cracks = [], L = low()
    for (const dx of [-1, 1]) {
      const len = Math.max(0, dx > 0 ? vw.r + 60 - x0 : x0 - vw.l + 60)
      const main = crackLine(x0, gy - 1, dx, len, 0)
      cracks.push({ pts: main, w: 1 })
      // spider branches along the main line
      for (let i = 3; i < main.length; i += L ? 9 : 5) {
        const [bx, by, bd] = main[i], pts = [[bx, by, bd]]
        let cx = bx, cy = by, d = bd
        const dir = dx * (Math.random() < 0.75 ? 1 : -1), drop = R(-1, 3)
        for (let j = 0; j < 4 + (Math.random() * 4 | 0); j++) { const st = R(8, 20); cx += dir * st + R(-5, 5); cy += drop + R(-2, 2); d += st; pts.push([cx, cy, d]) }
        cracks.push({ pts, w: 0.6 })
      }
    }
    // a star of short cracks right under the blade
    for (let i = 0; i < (L ? 5 : 9); i++) {
      const a = R(-0.5, 0.5) + (i % 2 ? 0 : Math.PI), pts = [[x0, gy - 1, 0]]
      let cx = x0, cy = gy - 1, d = 0
      for (let j = 0; j < 5; j++) { const st = R(10, 22); cx += Math.cos(a) * st + R(-4, 4); cy += Math.abs(Math.sin(a)) * st * 0.25 + R(-2, 2); d += st; pts.push([cx, cy, d]) }
      cracks.push({ pts, w: 0.8 })
    }
    // over the tops of the platforms in view
    for (const p of plats) {
      if (p.broken || !p.walk || p.r < vw.l || p.l > vw.r || p.surf > GROUND - 10) continue
      const mx = R(p.l + 20, p.r - 20), d0 = Math.hypot(mx - x0, p.surf - gy)
      for (const dx of [-1, 1]) {
        const len = dx > 0 ? p.r - 8 - mx : mx - p.l - 8
        if (len > 10) cracks.push({ pts: crackLine(mx, p.surf + 2, dx, len, d0, 2), w: 0.7 })
      }
      // down the face
      const pts = [[mx, p.surf + 2, d0]]; let cy = p.surf + 2, cx = mx, d = d0
      for (let j = 0; j < 4; j++) { cy += R(8, 16); cx += R(-6, 6); d += 12; pts.push([cx, cy, d]) }
      cracks.push({ pts, w: 0.6 })
    }
    return cracks
  }
  function strokeCrack(c, reach, a) {
    const n = c.pts.findIndex(p => p[2] > reach)
    const m = n < 0 ? c.pts.length : n
    if (m < 2) return
    const path = () => { ctx.beginPath(); for (let i = 0; i < m; i++) i ? ctx.lineTo(c.pts[i][0], c.pts[i][1]) : ctx.moveTo(c.pts[i][0], c.pts[i][1]) }
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = `rgba(60,12,8,${0.5 * a})`; ctx.lineWidth = 5 * c.w + 1; path(); ctx.stroke()
    ctx.globalCompositeOperation = 'lighter'
    for (const [lw, col, o] of [[16 * c.w, ORANGE, 0.16], [6 * c.w + 1, GOLD, 0.6], [2 * c.w + 0.6, WHITE, 0.9]]) { ctx.strokeStyle = `rgba(${col},${o * a})`; ctx.lineWidth = lw; path(); ctx.stroke() }
  }

  function start() {
    const lv = ultLv(), tr = tierOf()
    const top = cam.y + VH() * 0.16
    const h = Math.max(160, P.y - top)
    QK = { phase: 'leap', t: 0, home: { x: P.x, y: P.y }, face: P.face, lv, tr, embers: [], glow: 0, cracks: null, sites: [], done: false }
    P.act = null; P.queueMove = null; P.str = []; P.vx = 0; P.vy = -Math.sqrt(2 * G * h); P.ground = false
    P.iframe = Math.max(P.iframe, 4)
    for (const b of bullets) if (b.enemy && b.type !== 'doom') b.dead = true
    for (const e of targets()) e.stun = Math.max(e.stun || 0, 1.2)
    cam.focus = { z: cam.z, t: 6, x: cam.x + VW() / 2, y: cam.y + VH() * 0.45 }
    SFX.slash?.(); flash = Math.max(flash, 0.25); flashColor = '255,235,205'
    dust(P.x, P.y)
    if (!fx.includes(MGR)) fx.push(MGR)
  }

  function impact() {
    const Q = QK, lv = Q.lv, tr = Q.tr, L = low()
    Q.phase = 'hold'; Q.t = 0; Q.qt = 0
    Q.dur = 3 + 0.25 * (lv - 1)
    const x0 = P.x + Q.face * 40, gy = Q.home.y, vw = view()
    Q.x0 = x0; Q.gy = gy; Q.vw = vw
    stopT = Math.max(stopT, 0.16); flash = Math.max(flash, 0.7); flashColor = '255,240,215'; dim = Math.max(dim, 0.5)
    shake = Math.max(shake, 34); cam.kick = Math.max(cam.kick || 0, 0.8)
    SFX.heavy(); SFX.boom?.()
    if (typeof SFX !== 'undefined' && SFX.quake) SFX.quake()
    ring(x0, gy - 20, 320, '255,220,170')
    if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(x0, gy - 8, L ? 6 : 14, { color: 'dust', size: 1.7, spread: 140, rise: 0.9 }) } catch { }
    Q.cracks = buildCracks(x0, gy, vw)
    // everyone on screen is thrown up; the boss takes the blow
    for (const e of targets()) {
      if (e.dead) continue
      if (e.x < cam.x - 60 || e.x > cam.x + VW() + 60) continue
      if (e === B) damage(e, 28 + 12 * lv + 4 * tr, { x: e.x, y: e.y - (e.h || 200) * 0.5 })
      else { damage(e, 10 + 3 * lv, { x: e.x, y: e.y - 40, launch: -950, kb: Math.sign(e.x - x0) * 60 }); e.air = Math.max(e.air || 0, 1.6) }
    }
    for (const p of plats) if (p.hp && !p.broken && Math.abs((p.l + p.r) / 2 - x0) < 260) hurtPlat(p, 30)
    // the cascade: floor sites across the whole view, nearest first, then every platform
    const sp = L ? 270 : Math.max(120, 190 - 18 * (lv - 1) - 8 * (tr - 1))
    const sites = []
    for (let x = vw.l + R(10, sp * 0.5); x < vw.r; x += sp * R(0.85, 1.15)) sites.push({ x, gy, plat: false })
    for (const p of plats) if (!p.broken && p.walk && p.surf < GROUND - 10 && p.r > vw.l && p.l < vw.r) sites.push({ x: clamp((p.l + p.r) / 2 + R(-20, 20), vw.l, vw.r), gy: p.surf, plat: true })
    for (const s of sites) s.at = 0.12 + Math.hypot(s.x - x0, (s.gy - gy) * 0.6) / 1500 + R(0, 0.12)
    if (lv >= 2) for (const s of sites.filter((_, i) => i % 2 === 0)) sites.push({ ...s, x: s.x + R(-50, 50), at: s.at + 0.85, second: true })
    Q.sites = sites.sort((a, b) => a.at - b.at)
  }

  function erupt(s) {
    const Q = QK, L = low()
    if (typeof SKYWAVE === 'undefined' || !SKYWAVE.launch) return
    const face = s.x >= Q.x0 ? 1 : -1
    SKYWAVE.launch({
      x: s.x, gy: s.gy, face, scale: (s.plat ? 0.62 : 0.78) * (1 + 0.07 * (Q.lv - 1)) * (s.second ? 0.85 : 1),
      range: R(80, 160) * (s.plat ? 0.7 : 1), speed: 0.55, maxHits: s.second ? 2 : 3, ribbons: L ? 1 : 2 + (Q.tr >= 3 ? 1 : 0),
      rate: L ? 0.25 : 0.4, dmg: 0.8 + 0.1 * (Q.lv - 1),
    })
    if (Math.random() < 0.5) SFX.boom?.()
  }

  function tick(dt) {
    const Q = QK
    Q.t += dt
    if (Q.phase === 'leap' || Q.phase === 'plunge') {
      P.iframe = Math.max(P.iframe, 0.5); P.animT += dt
      if (Q.phase === 'leap') { P.vy += G * dt; if (P.vy > -120) { Q.phase = 'plunge'; P.vy = 2900; sparks(P.x, P.y - 120, 10, '255,225,170') } }
      P.y += P.vy * dt
      if (Q.phase === 'plunge' && P.y >= Q.home.y) { P.y = Q.home.y; P.vy = 0; P.ground = true; impact() }
      return true
    }
    if (Q.phase === 'hold') { P.vx = 0; P.vy = 0; if (Q.t > 0.45) Q.phase = 'quake'; else return true }
    return false
  }

  // the quake keeps running while she is free again
  function quakeStep(dt) {
    const Q = QK; if (!Q || Q.qt == null) return
    Q.qt += dt
    const k = Q.qt / Q.dur
    if (k < 1) shake = Math.max(shake, 30 * Math.pow(1 - k, 1.6) + 2)
    for (const s of Q.sites) if (!s.done && Q.qt >= s.at) { s.done = true; erupt(s) }
    const L = low(), vw = Q.vw
    // embers drift up all over, more once the dust settles
    const rate = (L ? 14 : 40) * (k < 1 ? 1 : 0.6)
    const nE = rate * dt, cnt = Math.floor(nE) + (Math.random() < nE % 1 ? 1 : 0)
    if (k < 1.3) for (let i = cnt; i > 0; i--) Q.embers.push({ x: R(vw.l, vw.r), y: Q.gy - R(0, 60), vx: R(-30, 30), vy: -R(40, 160), t: 0, life: R(1.2, 2.4), sz: R(1.3, 2.8), col: Math.random() < 0.3 ? WHITE : Math.random() < 0.6 ? GOLD : '255,150,110', ph: R(0, 6) })
    for (const m of Q.embers) { m.t += dt; m.x += (m.vx + Math.sin(m.t * 2 + m.ph) * 20) * dt; m.y += m.vy * dt; m.vy *= 1 - 0.4 * dt }
    Q.embers = Q.embers.filter(m => m.t < m.life)
    if (Q.embers.length > (L ? 60 : 200)) Q.embers.splice(0, Q.embers.length - (L ? 60 : 200))
    // the dust settles along the floor
    if (!Q.settled && k > 0.72) {
      Q.settled = true
      if (typeof FXK !== 'undefined' && FXK.smoke) for (let x = vw.l; x < vw.r; x += L ? 260 : 150) try { FXK.smoke(x + R(-30, 30), Q.gy - 6, L ? 1 : 2, { color: 'dust', size: 1.6, spread: 70, rise: 0.25, vx: R(-20, 20) }) } catch { }
    }
    if (k >= 1 && !Q.glowAt) Q.glowAt = Q.qt
    if (Q.qt > Q.dur + 1.6) { QK = null; if (cam.focus) cam.focus.t = Math.min(cam.focus.t, 0.3) }
  }

  const MGR = { t: 0, dur: Infinity, quakeMgr: true,
    update(dt) { if (QK && QK.phase !== 'leap' && QK.phase !== 'plunge') quakeStep(dt) },
    draw() {
      const Q = QK; if (!Q || Q.qt == null) return
      const k = Q.qt / Q.dur
      // cracks: reveal outward fast, glow pulses, then cool
      if (Q.cracks) {
        const reach = Q.qt * 1700, cool = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.6), pulse = 0.85 + 0.15 * Math.sin(T * 12)
        for (const c of Q.cracks) strokeCrack(c, reach, cool * pulse)
      }
      // embers
      ctx.globalCompositeOperation = 'lighter'
      for (const m of Q.embers) { const e = m.t / m.life, a = e < 0.15 ? e / 0.15 : 1 - (e - 0.15) / 0.85; dot(m.col, m.x, m.y, m.sz * 2.2, 0.8 * a, { core: true }) }
      // afterglow: a warm light rising off the floor that fades
      const ga = Q.glowAt != null ? Math.max(0, 1 - (Q.qt - Q.glowAt) / 1.5) * 0.5 : Math.min(1, Q.qt / 0.5) * 0.35
      if (ga > 0.01) {
        const top = cam.y, g = ctx.createLinearGradient(0, Q.gy, 0, top)
        g.addColorStop(0, `rgba(255,160,70,${0.5 * ga})`); g.addColorStop(0.35, `rgba(255,120,60,${0.16 * ga})`); g.addColorStop(1, 'rgba(255,120,60,0)')
        ctx.fillStyle = g; ctx.fillRect(cam.x, top, VW(), Q.gy - top + 30)
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
    },
  }

  // ---- hooks
  const baseUlt = window.ultimate
  let PANEL = 0
  const mine = () => P.hero === 'messenger' && typeof WEAPON !== 'undefined' && WEAPON.is('coresunder')
  window.ultimate = function () {
    if (!mine() || QK || PANEL) return baseUlt()
    let d = 0
    try { if (fxk()?.ultPanel) d = FXK.ultPanel('messenger', { name: moveName('messenger', 'quake') }) || 1.4 } catch (e) { console.warn('ultPanel', e); d = 0 }
    say('messenger', 'ult', true); if (typeof nameSub === 'function') nameSub(moveName('messenger', 'quake'), 1.8)
    P.meter = 0; P.iframe = Math.max(P.iframe, d + 1); P.act = null; P.queueMove = null
    for (const e of targets()) e.stun = Math.max(e.stun || 0, d + 0.5)
    if (!d) { start(); return }
    PANEL = performance.now() + d * 1000
  }
  const baseUpdate = window.updatePlayer
  window.updatePlayer = function (dt) {
    if (PANEL) {
      P.vx = 0; P.vy = Math.min(P.vy, 0); P.iframe = Math.max(P.iframe, 0.4)
      if (performance.now() < PANEL) return
      PANEL = 0
      try { start() } catch (e) { console.warn('QUAKE', e); QK = null }
    }
    if (QK && !P.dead) {
      if (!fx.includes(MGR)) fx.push(MGR)
      try { if (tick(dt)) { for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt); return } } catch (e) { console.warn('QUAKE', e); QK = null }
    }
    baseUpdate(dt)
  }
  const basePick = window.pickAnim
  window.pickAnim = function () {
    const Q = QK
    if (Q && P.hero === 'messenger' && !P.dead) {
      if (Q.phase === 'leap') return P.vy < -700 ? pose('launcher', 3) : pose('slash3', 1)
      if (Q.phase === 'plunge') { const n = A.sheets.messenger?.airslam?.n || 6; return { sheet: 'airslam', frame: Math.min(n - 1, Math.floor(n * 0.4)) } }
      if (Q.phase === 'hold') { const n = A.sheets.messenger?.airslam?.n || 6; return { sheet: 'airslam', frame: n - 1 } }
    }
    return basePick()
  }
}
