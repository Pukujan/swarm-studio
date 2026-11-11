// Baker's ultimate, 千閃 Thousand Flash (hero id `messenger`). It keeps the core trigger (R at
// full meter: the core's `ultimate()` is wrapped) and replaces what happens:
//
// 1. A brief time-slow and flash; she vanishes in a burst of petals.
// 2. Corner to corner: 8-12 near-instant legs between points on the arena's edges and corners,
//    criss-crossing the screen (every other leg is aimed through someone). Each leg pierces and
//    hits everything on its line, leaves a molten streak that stays (the web) and a chain of
//    her full-body afterimages, gold to rose. Where she turns, one solid afterimage holds a
//    slash pose until the finale. The legs speed up.
// 3. The ultimate slash: she reappears high in the centre, the screen dims, the afterimages turn
//    to her and flow as light into her blade, which grows a huge edge. A 0.3 s freeze, a flash
//    and the callout, then one giant crescent from a top corner to the opposite bottom corner,
//    a screen-wide shock ring and a white flash frame. A beat later the cut splits, the web
//    bursts into sparks and petals, everything on screen takes the big hit (numbers cascade),
//    and she drops into her win pose.
//
// Invulnerable throughout. TRAIL.tier (trails.js): tier 3 adds legs and echo lines.
// PERF.low: 5 legs, 2 afterimages a leg, fewer sparks; the giant slash stays.
// Colours: gold, white-hot, orange, crimson, rose.

let ULT = null, ECL = null

{
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const tierOf = () => typeof TRAIL !== 'undefined' && TRAIL.level ? TRAIL.level() : 1
  const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3)
  const PETAL = ['255,190,200', '255,225,215', '255,160,170']

  const pose = ghostPose   // moves.js: ghostPose, drawGhost

  // the box she dashes around: the visible arena, from near the ceiling to the floor
  function box() {
    const ar = typeof AR === 'function' ? AR() : { l: cam.x, r: cam.x + VW() }
    const l = Math.max(cam.x + 50, ar.l + 30), r = Math.min(cam.x + VW() - 50, ar.r - 30)
    const t = cam.y + VH() * 0.12, b = Math.min(GROUND, cam.y + VH()) - 60
    return { l, r, t, b, w: r - l, h: b - t }
  }
  function edgePt(bx, side, f) {
    if (side === 0) return { x: lerp(bx.l, bx.r, f), y: bx.t, side }
    if (side === 1) return { x: bx.r, y: lerp(bx.t, bx.b, f), side }
    if (side === 2) return { x: lerp(bx.r, bx.l, f), y: bx.b, side }
    return { x: bx.l, y: lerp(bx.b, bx.t, f), side }
  }
  // where a ray from inside the box leaves it
  function exitPt(bx, x, y, dx, dy) {
    const tx = dx > 0 ? (bx.r - x) / dx : dx < 0 ? (bx.l - x) / dx : Infinity
    const ty = dy > 0 ? (bx.b - y) / dy : dy < 0 ? (bx.t - y) / dy : Infinity
    const t = Math.min(tx, ty)
    return { x: x + dx * t, y: y + dy * t, side: tx < ty ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0) }
  }
  const mid = e => { const b = e.box(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2 } }
  function nextPt(U, i) {
    const bx = U.box, A_ = U.at
    const ts = targets().filter(e => !e.dead)
    if (i % 2 === 1 && ts.length) {
      // aimed: from here through someone, out the far side
      for (let n = 0; n < 4; n++) {
        const e = ts[(Math.random() * ts.length) | 0], m = mid(e)
        const dx = m.x - A_.x, dy = m.y - A_.y, d = Math.hypot(dx, dy)
        if (d < 60) continue
        const p = exitPt(bx, m.x, m.y, dx / d, dy / d)
        if (Math.hypot(p.x - A_.x, p.y - A_.y) > Math.min(bx.w, bx.h) * 0.6) return p
      }
    }
    // a corner or edge point on another side, alternating across and around
    for (let n = 0; n < 8; n++) {
      const side = (A_.side + (i % 3 === 0 ? 2 : (Math.random() < 0.5 ? 1 : 3))) % 4
      const f = Math.random() < 0.45 ? (Math.random() < 0.5 ? 0 : 1) : R(0.12, 0.88)
      const p = edgePt(bx, side, f)
      if (Math.hypot(p.x - A_.x, p.y - A_.y) > Math.min(bx.w, bx.h) * 0.7) return p
    }
    return edgePt(bx, (A_.side + 2) % 4, R(0, 1))
  }

  function start() {
    const tr = tierOf()
    const legs = low() ? 5 : 10 + (tr >= 2 ? 1 : 0) + (tr >= 3 ? 2 : 0)
    P.meter = 0; P.act = null; P.queueMove = null; P.str = []; P.iframe = Math.max(P.iframe, 3)
    P.tease = null
    say('messenger', 'ult', true)   // ぜーんぶ斬っちゃえ！せんせん！
    for (const b of bullets) if (b.enemy) cancel(b)
    for (const e of targets()) e.stun = Math.max(e.stun || 0, 3.2)
    const z = cam.z
    cam.focus = { z, t: 9, x: cam.x + VW() / 2, y: cam.y + VH() * 0.45 }
    const bx = box()
    const side = P.x - bx.l < bx.r - P.x ? 3 : 1
    ULT = { t: 0, phase: 'pre', pt: 0, box: bx, legs, leg: -1, legT: 0, legDur: 0, at: { x: side === 3 ? bx.l : bx.r, y: bx.b, side },
      lines: [], ghosts: [], motes: [], hitAll: new Set(), tr, home: { x: P.x, y: P.y }, blade: 0, face: P.face }
    slowT = Math.max(slowT, 0.2); flash = Math.max(flash, 0.5); flashColor = '255,240,225'; dim = Math.max(dim, 0.6)
    SFX.slash()
    const n = low() ? 12 : 28
    for (let i = 0; i < n; i++) parts.push({ x: P.x + R(-30, 30), y: P.y - R(30, 150), vx: R(-320, 320), vy: R(-360, 60), life: R(0.6, 1.2), t: 0, size: R(3, 6), color: PETAL[i % 3], add: false, feather: true })
    sparks(P.x, P.y - 90, low() ? 8 : 18, '255,235,190')
    if (!fx.includes(MGR)) fx.push(MGR)
  }

  function runLeg(U, i) {
    const A_ = U.at, B_ = nextPt(U, i)
    U.leg = i; U.legT = 0
    U.legDur = lerp(0.19, 0.075, i / Math.max(1, U.legs - 1))
    const ln = { x0: A_.x, y0: A_.y, x1: B_.x, y1: B_.y, b: U.t, draw: U.legDur * 0.4 }
    U.lines.push(ln)
    const face = Math.sign(B_.x - A_.x) || 1
    // the chain of afterimages along the line
    const n = low() ? 2 : 5 + (U.tr >= 2 ? 1 : 0) + (U.tr >= 3 ? 2 : 0)
    const dash = pose('dash', 2), cut = pose(i % 2 ? 'slash2' : 'slash1', 3)
    for (let j = 0; j < n; j++) {
      const f = (j + 0.5) / n, p = j % 2 ? cut : dash
      U.ghosts.push({ x: lerp(A_.x, B_.x, f), y: lerp(A_.y, B_.y, f) + 85, face, sheet: p.sheet, frame: p.frame, b: U.t + ln.draw * f, life: 0.6, col: j / Math.max(1, n - 1) < 0.5 ? '255,180,80' : '240,90,110' })
    }
    // the corner where she turns: a solid afterimage that stays until the finale
    const hold = pose('slash3', 3)
    U.ghosts.push({ x: B_.x, y: B_.y + 85, face, sheet: hold.sheet, frame: hold.frame, b: U.t + ln.draw, life: Infinity, solid: true, col: '255,215,150' })
    // everything on the line is cut
    let hits = 0
    for (const e of targets()) {
      if (e.dead) continue
      const m = mid(e)
      if (segDist(m.x, m.y, A_.x, A_.y, B_.x, B_.y) > m.r + 40) continue
      U.hitAll.add(e); hits++
      const dmg = 7 + U.tr
      damage(e, dmg, { x: e.x, y: e.y, kb: 0, small: true })
      e.stun = Math.max(e.stun || 0, 1.5)
      numFx(m.x + R(-20, 20), m.y - m.r * 0.6, dmg, false)
      sparks(m.x, m.y, low() ? 4 : 9, '255,230,180')
      if (fxk()?.hit) try { FXK.hit(m.x, m.y, Math.atan2(B_.y - A_.y, B_.x - A_.x), 1) } catch { }
    }
    shake = Math.max(shake, hits ? 5 : 2)
    SFX.slash()
    P.x = B_.x; P.y = B_.y + 85; P.face = face; P.vx = 0; P.vy = 0
    U.at = B_
  }

  // floating damage numbers (digits only)
  function numFx(x, y, n, big) {
    const s = big ? 46 : 24, vx = R(-30, 30)
    fx.push({ t: 0, dur: big ? 1.1 : 0.7, draw(k) {
      const a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, k - 0.6) / 0.4, yy = y - easeOut(k) * (big ? 70 : 40), xx = x + vx * k
      const sc = big && k < 0.15 ? 1.6 - k * 4 : 1
      ctx.globalAlpha = a; ctx.font = `800 ${s * sc | 0}px Cinzel, serif`; ctx.textAlign = 'center'
      ctx.lineWidth = big ? 6 : 4; ctx.strokeStyle = 'rgba(70,8,14,0.9)'; ctx.strokeText(String(n), xx, yy)
      const g = ctx.createLinearGradient(0, yy - s, 0, yy); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, big ? '#ffb070' : '#f6cc80')
      ctx.fillStyle = g; ctx.fillText(String(n), xx, yy)
    } })
  }

  // the blade she raises in the centre
  const hand = () => ({ x: P.x + ULT.face * 24, y: P.y - 112 })
  const bladeAng = () => -Math.PI / 2 - ULT.face * 0.45

  function tick(dt) {
    const U = ULT
    U.t += dt; U.pt += dt
    P.iframe = Math.max(P.iframe, 0.4); P.vx = 0; P.vy = 0; P.animT += dt; P.act = null
    for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt)
    for (const e of targets()) e.stun = Math.max(e.stun || 0, 0.5)
    if (U.phase === 'pre') { if (U.pt > 0.12) { U.phase = 'legs'; U.pt = 0; runLeg(U, 0) } return }
    if (U.phase === 'legs') {
      U.legT += dt
      if (U.legT >= U.legDur) {
        if (U.leg + 1 < U.legs) runLeg(U, U.leg + 1)
        else { U.phase = 'gather'; U.pt = 0; gatherStart(U) }
      }
      return
    }
    if (U.phase === 'gather') {
      dim = Math.max(dim, 1.3)
      U.blade = easeOut(U.pt / 0.6)
      // light flows from each afterimage into the blade
      const h = hand(), a = bladeAng(), tipL = 640 * U.blade
      for (const g of U.ghosts) if (g.solid && !g.gone && Math.random() < dt * (low() ? 14 : 34)) {
        const tx = h.x + Math.cos(a) * tipL * R(0.2, 1), ty = h.y + Math.sin(a) * tipL * R(0.2, 1)
        U.motes.push({ x0: g.x + R(-20, 20), y0: g.y - R(40, 140), x1: tx, y1: ty, t: 0, life: R(0.22, 0.4), c: Math.random() < 0.5 ? '255,220,150' : '255,160,160', bend: R(-120, 120) })
      }
      if (U.pt >= 0.6) { U.phase = 'slash'; U.pt = 0; stopT = 0.3; flash = 0.7; flashColor = '255,240,210'; SFX.heavy(); U.slashPending = true }
      return
    }
    if (U.phase === 'slash') {
      if (U.slashPending) { U.slashPending = false; giantSlash(U) }
      dim = Math.max(dim, 0.4)
      if (U.pt >= 0.3) { U.phase = 'split'; U.pt = 0; split(U) }
      return
    }
    if (U.phase === 'split') {
      if (U.pt >= 0.28) { if (!eclipseStart(U)) finish(U) }
      return
    }
    if (U.phase === 'ecl1') { dim = Math.max(dim, 0.8); if (U.pt >= 0.34) { U.phase = 'ecl2'; U.pt = 0; eclipseCut(U) } return }
    if (U.phase === 'ecl2') { if (U.pt >= U.wave.dur) { eclipseRise(U); finish(U) } }
  }

  function gatherStart(U) {
    const bx = U.box
    P.x = (bx.l + bx.r) / 2; P.y = bx.t + 200; U.face = P.x < (U.home.x) ? 1 : (U.home.x < P.x ? -1 : P.face); P.face = U.face
    U.visible = true
    for (const g of U.ghosts) if (g.solid) { g.face = Math.sign(P.x - g.x) || g.face; g.fade = U.t }
    burst(P.x, P.y - 90, low() ? 10 : 22, '255,235,200', 380)
    ring(P.x, P.y - 90, 120, '255,230,190')
  }

  function giantSlash(U) {
    const bx = { l: cam.x, r: cam.x + VW(), t: cam.y, b: cam.y + VH() }
    const f = U.face
    const s = { x0: f > 0 ? bx.l - 40 : bx.r + 40, y0: bx.t - 40, x1: f > 0 ? bx.r + 40 : bx.l - 40, y1: bx.b + 40 }
    U.cut = s; U.cutT = U.t; U.blade = 0
    flash = 1; flashColor = '255,255,255'; shake = Math.max(shake, 30); cam.kick = 0.4
    SFX.heavy(); SFX.boom?.()
    for (const b of bullets) if (b.enemy) cancel(b)
    const cx = (bx.l + bx.r) / 2, cy = (bx.t + bx.b) / 2, R0 = Math.hypot(VW(), VH()) * 0.6
    fx.push({ t: 0, dur: 0.6, draw(k) {
      ctx.globalCompositeOperation = 'lighter'
      const r = R0 * (0.15 + 0.85 * easeOut(k))
      for (const [w, c, a] of [[60, '200,30,40', 0.35], [26, '255,180,80', 0.6], [8, '255,250,235', 0.95]]) { ctx.strokeStyle = `rgba(${c},${a * (1 - k)})`; ctx.lineWidth = w * (1 - k * 0.7); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke() }
    } })
    if (fxk()?.slash) try { FXK.slash(cx, cy, Math.atan2(s.y1 - s.y0, s.x1 - s.x0), Math.hypot(s.x1 - s.x0, s.y1 - s.y0) * 0.55, { color: 'gold', heavy: true }) } catch { }
  }

  function split(U) {
    shake = Math.max(shake, 18); stopT = Math.max(stopT, 0.06)
    // every line of the web bursts
    const per = low() ? 3 : 9
    for (const ln of U.lines) for (let i = 0; i < per; i++) {
      const f = Math.random(), x = lerp(ln.x0, ln.x1, f), y = lerp(ln.y0, ln.y1, f)
      parts.push({ x, y, vx: R(-380, 380), vy: R(-420, 120), life: R(0.3, 0.7), t: 0, size: R(2, 4), color: i % 2 ? '255,200,110' : '230,60,70', add: true, streak: true, g: 900 })
      if (i % 3 === 0) parts.push({ x, y, vx: R(-160, 160), vy: R(-200, 20), life: R(1.2, 2.0), t: 0, size: R(3, 6), color: PETAL[i % 3], add: false, feather: true, g: 120 })
    }
    for (const g of U.ghosts) g.gone = true
    // the big hit on everything on screen (and everything the web touched)
    const v = { l: cam.x, r: cam.x + VW() }
    const hit = targets().filter(e => !e.dead && (U.hitAll.has(e) || (e.x > v.l - 40 && e.x < v.r + 40)))
    hit.forEach((e, i) => {
      const m = mid(e), dmg = 90 + 15 * (U.tr - 1)
      damage(e, dmg, { x: e.x, y: e.y, kb: Math.sign(e.x - P.x || 1) * 520, launch: e === B ? 0 : -700 })
      later(i * 0.06, () => numFx(m.x, m.y - m.r * 0.8, dmg, true))
      if (fxk()?.hit) try { FXK.hit(m.x, m.y, Math.sign(e.x - P.x) || 1, 3) } catch { }
      sparks(m.x, m.y, low() ? 6 : 16, '255,225,170')
    })
    flash = Math.max(flash, 0.5); flashColor = '255,235,215'
    SFX.boom?.()
  }

  function finish(U) {
    U.phase = 'done'
    const x = clamp(P.x, leftBound(), rightBound())
    P.x = x; P.vy = 1800; P.ground = false; P.iframe = Math.max(P.iframe, 1.2)
    if (cam.focus) cam.focus.t = 0.35
    ULT.visible = true; ULT.drop = true
    const landing = () => {
      if (!P.ground) return later(0.05, landing)
      dust(P.x, P.y); shake = Math.max(shake, 8)
      if (fxk()?.smoke) try { FXK.smoke(P.x, P.y, 3, { color: 'dust', size: 1, spread: 90 }) } catch { }
      for (let i = 0; i < (low() ? 8 : 20); i++) parts.push({ x: P.x + R(-300, 300), y: P.y - R(200, 520), vx: R(-60, 60), vy: R(30, 90), life: R(1.6, 2.6), t: 0, size: R(3, 6), color: PETAL[i % 3], add: false, feather: true })
      const sh = A.sheets.messenger?.['m-win'] ? 'm-win' : A.sheets.messenger?.['m-tease'] ? 'm-tease' : null
      if (sh) P.tease = { t: 0, sheet: sh, keep: true }
    }
    // let the core take her back now; the web and ghosts fade on their own
    U.end = U.t
    later(0.05, landing)
    ULT.live = false
  }

  // ---- the Crimson Eclipse: one more cut at the main target, a gigantic dark crescent across
  // a white sky, a white-out, then an eclipse ring hangs over the target and the arena turns red.
  // Its size and length scale with her ult level (boon `moon`) and her sword level (TRAIL).
  function eclLevel() {
    const ult = 1 + (typeof nB === 'function' ? nB('moon') : 0), sw = tierOf()
    return { ult, sw, s: clamp(((ult - 1) / 3 + (sw - 1) / 2) / 2, 0, 1) }
  }
  function mainTarget() {
    if (B && B.active && !B.dead && !B.chaser) return B
    const v = { l: cam.x, r: cam.x + VW() }
    return targets().filter(e => !e.dead && e.x > v.l && e.x < v.r).sort((a, b) => (b.hp || 0) - (a.hp || 0))[0] || null
  }
  function eclipseStart(U) {
    // with nobody left standing the last cut still lands, on the centre of the arena
    const t = mainTarget() || { x: (U.box.l + U.box.r) / 2, y: GROUND, h: 150, fake: true }
    const face = Math.sign(t.x - P.x) || U.face
    const nx = clamp(t.x - face * 160, leftBound(), rightBound()), ty = Math.min(GROUND, t === B ? B.y : t.y)
    ghostFx({ x: P.x, y: P.y, face: P.face, sheet: 'slash3', frame: 4, col: '255,140,150' }, 0.5)
    P.x = nx; P.y = Math.min(groundAt(nx, ty - 200), ty); if (!(P.y < Infinity)) P.y = GROUND
    P.face = U.face = Math.sign(t.x - P.x) || face
    U.visible = true; U.blade = 0; U.phase = 'ecl1'; U.pt = 0; U.eclT = t
    // torn wings: random notches, fixed for this cast
    U.wing = []; for (let i = 0; i < 6; i++) U.wing.push({ a: -1.75 - i * 0.24, len: R(0.75, 1.15), notch: [R(0.3, 0.6), R(0.6, 0.85)].map(f => [f, R(0.08, 0.22)]) })
    dim = Math.max(dim, 1); SFX.glare?.()
    streakFx(cam.x + VW() / 2, cam.y + 200, P.x, P.y - 85, 0.3, '255,120,130', 8)
    return true
  }
  function eclipseCut(U) {
    const L = eclLevel(), t = U.eclT, h = t.h || 140
    const cx = t.x, cy = (t === B ? B.y : t.y) - h * 0.55
    U.mark = { x: cx, y: cy, r: 90 + h * 0.4 + L.s * 60 }
    const vh = VH()
    U.wave = { t0: U.t, dur: 0.5 + 0.15 * L.s, R: vh * (0.75 + 1.1 * L.s), th: vh * (0.75 + 1.1 * L.s) * 1.1, face: U.face, cy: cam.y + vh * 0.5,
      streaks: Array.from({ length: low() ? 8 : 22 }, () => ({ y: R(0, 1), x: R(-0.3, 1), len: R(160, 520), w: R(1, 3.5), c: Math.random() < 0.3 ? '200,40,55' : '220,170,170' })) }
    if (!t.dead && !t.fake) {
      const dmg = Math.round(60 * (1 + L.s))
      damage(t, dmg, { x: t.x, y: t.y, kb: U.face * 300, launch: t === B ? 0 : -500 })
      numFx(cx, cy - 40, dmg, true)
      if (fxk()?.hit) try { FXK.hit(cx, cy, U.face, 3) } catch { }
    }
    cutFx(cx, cy, U.face > 0 ? -0.5 : Math.PI + 0.5, U.mark.r * 2.4, '255,200,190', 0.03)
    shake = Math.max(shake, 22); SFX.heavy(); SFX.boom?.()
  }
  function eclipseRise(U) {
    const L = eclLevel(), m = U.mark
    ECL = { t: 0, dur: 3 + 7 * L.s, s: L.s, x: m.x, y0: m.y, y: m.y - 260 - L.s * 120, target: U.eclT.fake ? null : U.eclT, mark: m, motes: [], drips: [], white: 0 }
    decals.push({ x: m.x, y: GROUND, r: 170 + L.s * 160, t: ECL.dur, max: ECL.dur })
    ring(m.x, GROUND - 10, 260 + L.s * 200, '255,120,110')
    shake = Math.max(shake, 14)
    if (!fx.includes(EMGR)) fx.push(EMGR)
  }

  // the gigantic crescent and the white sky behind it (drawn over the world)
  function drawWave(U) {
    const w = U.wave, age = U.t - w.t0; if (age < 0 || age > w.dur + 0.02) return
    const k = age / w.dur, vl = cam.x, vt = cam.y, vw = VW(), vh = VH()
    const wa = (k < 0.08 ? k / 0.08 : 1) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(255,240,236,${0.88 * wa})`; ctx.fillRect(vl - 20, vt - 20, vw + 40, vh + 40)
    for (const s of w.streaks) {
      const x = vl + ((s.x + k * 2.2 * w.face) % 1.4 + 1.4) % 1.4 * vw - 0.2 * vw, y = vt + s.y * vh
      ctx.strokeStyle = `rgba(${s.c},${0.55 * wa})`; ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - w.face * s.len, y); ctx.stroke()
    }
    // the crescent sweeps from behind her side across and out the far side
    const Rr = w.R, th = w.th, span = vw + Rr * 1.4
    const cx = w.face > 0 ? vl - Rr * 0.4 + span * easeOut(k) : vl + vw + Rr * 0.4 - span * easeOut(k)
    const th0 = 1.15, ex = Rr * Math.cos(th0), ey = Rr * Math.sin(th0)
    const r2 = Math.hypot(ex + th, ey), t2 = Math.atan2(ey, ex + th)
    ctx.save(); ctx.translate(cx, w.cy); ctx.scale(w.face, 1)
    const shape = off => { ctx.beginPath(); ctx.arc(off, 0, Rr, -th0, th0); ctx.arc(off - th, 0, r2, t2, -t2, true); ctx.closePath() }
    for (let i = 3; i >= 1; i--) { shape(-th * 0.45 * i); ctx.fillStyle = `rgba(40,4,10,${0.22 / i})`; ctx.fill() }
    shape(0); ctx.fillStyle = 'rgba(14,2,6,0.96)'; ctx.fill()
    ctx.lineCap = 'round'
    if (!low()) { ctx.globalCompositeOperation = 'lighter'; for (const [lw, o] of [[90, 0.06], [50, 0.1]]) { ctx.strokeStyle = `rgba(230,30,45,${o * wa})`; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, Rr, -th0, th0); ctx.stroke() } ctx.globalCompositeOperation = 'source-over' }
    for (const [lw, c, o] of [[26, '150,10,28', 0.9], [10, '225,40,55', 0.95], [3, '255,220,210', 1]]) { ctx.strokeStyle = `rgba(${c},${o})`; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, Rr - lw / 2, -th0 * 0.98, th0 * 0.98); ctx.stroke() }
    ctx.restore()
  }
  function drawWings(U) {
    if (!U.wing || !(U.phase === 'ecl1' || U.phase === 'ecl2')) return
    const g = U.phase === 'ecl1' ? easeOut(U.pt / 0.3) : 1 - clamp(U.pt / 0.3, 0, 1)
    if (g <= 0) return
    const bx = P.x - U.face * 14, by = P.y - 118, S = (200 + 90 * eclLevel().s) * g
    ctx.save(); ctx.translate(bx, by); ctx.scale(U.face, 1)
    const fl = Math.sin(T * 9) * 0.05
    for (const f of U.wing) {
      const a = f.a + fl, L = S * f.len, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, wd = L * 0.17
      ctx.beginPath(); ctx.moveTo(0, 0)
      ctx.lineTo(ca * L * 0.3 + nx * wd, sa * L * 0.3 + ny * wd)
      for (const [p, d] of f.notch) { ctx.lineTo(ca * L * p + nx * wd * 0.9, sa * L * p + ny * wd * 0.9); ctx.lineTo(ca * L * (p + 0.04) + nx * wd * (0.9 - d * 3), sa * L * (p + 0.04) + ny * wd * (0.9 - d * 3)) }
      ctx.lineTo(ca * L, sa * L); ctx.lineTo(ca * L * 0.5 - nx * wd * 0.3, sa * L * 0.5 - ny * wd * 0.3); ctx.closePath()
      ctx.fillStyle = 'rgba(16,2,6,0.82)'; ctx.fill()
      ctx.strokeStyle = 'rgba(190,20,35,0.8)'; ctx.lineWidth = 2; ctx.stroke()
    }
    ctx.restore()
    // crimson light on her and at the blade
    ctx.globalCompositeOperation = 'lighter'
    const gl = ctx.createRadialGradient(P.x, P.y - 90, 10, P.x, P.y - 90, 200)
    gl.addColorStop(0, `rgba(255,70,70,${0.35 * g})`); gl.addColorStop(1, 'rgba(160,0,20,0)')
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(P.x, P.y - 90, 200, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  // ---- the eclipse itself: lives on after the ult, up to 10 s
  const EMGR = { t: 0, dur: Infinity, eclMgr: true,
    update(dt) {
      const E = ECL; if (!E) return
      E.t += dt
      if (E.t >= E.dur) { ECL = null; return }
      const env = eclEnv(E)
      // slow crimson petals and ash
      if (Math.random() < dt * (low() ? 5 : 18) * env) {
        const ash = Math.random() < 0.45
        E.motes.push({ x: cam.x + R(0, VW()), y: cam.y - 10, vx: R(-30, 30), vy: R(40, 90), t: 0, life: R(3, 5), s: ash ? R(1.5, 3) : R(3, 6), ash, ph: R(0, 6) })
      }
      for (const m of E.motes) { m.t += dt; m.x += (m.vx + Math.sin(m.t * 1.7 + m.ph) * 25) * dt; m.y += m.vy * dt }
      E.motes = E.motes.filter(m => m.t < m.life)
      moonDrips(E, dt)
    },
    draw() {
      const E = ECL; if (!E) return
      const env = eclEnv(E), vl = cam.x, vt = cam.y, vw = VW(), vh = VH()
      // the white-out: one bright frame, then a fade over 0.25 s
      if (E.t < 0.25) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(255,248,245,${1 - E.t / 0.25})`; ctx.fillRect(vl - 20, vt - 20, vw + 40, vh + 40) }
      // the red
      if (low()) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(150,15,25,${0.28 * env})`; ctx.fillRect(vl - 20, vt - 20, vw + 40, vh + 40) }
      else {
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${Math.round(255 - 135 * env)},${Math.round(255 - 125 * env)},1)`; ctx.fillRect(vl - 20, vt - 20, vw + 40, vh + 40)
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(40,0,8,${0.08 * env})`; ctx.fillRect(vl - 20, vt - 20, vw + 40, vh + 40)
      }
      // the half-moon mark on the target
      const t = E.target, m = E.mark
      if (t && !t.dead) { m.x = t.x; m.y = (t === B ? B.y : t.y) - (t.h || 140) * 0.55 }
      if (!(t && t.dead)) {
        const a = env * (0.75 + 0.25 * Math.sin(T * 6))
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(-0.5)
        ctx.globalCompositeOperation = 'lighter'
        const r = m.r
        ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.arc(-r * 0.35, 0, r * 1.06, Math.PI / 2 - 0.33, -Math.PI / 2 + 0.33, true); ctx.closePath()
        const mg = ctx.createLinearGradient(r, 0, r * 0.55, 0)
        mg.addColorStop(0, `rgba(230,30,45,${0.5 * a})`); mg.addColorStop(1, `rgba(170,10,30,0)`)
        ctx.fillStyle = mg; ctx.fill()
        // the rim: stacked arcs, shorter as they get hotter, so it tapers into both tips
        ctx.lineCap = 'round'
        for (const [f, lw, c, o] of [[0.97, 12, '230,40,50', 0.12], [0.9, 5, '255,90,70', 0.35], [0.75, 2.2, '255,200,180', 0.75], [0.5, 1.2, '255,250,240', 0.9]]) {
          ctx.strokeStyle = `rgba(${c},${o * a})`; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, r - lw * 0.3, -Math.PI / 2 * f, Math.PI / 2 * f); ctx.stroke()
        }
        ctx.restore()
      }
      // petals and ash
      for (const p of E.motes) {
        const a = Math.min(1, p.t / 0.4) * (1 - p.t / p.life) * env
        ctx.globalCompositeOperation = p.ash ? 'source-over' : 'lighter'
        ctx.fillStyle = p.ash ? `rgba(40,8,12,${0.7 * a})` : `rgba(230,60,75,${0.75 * a})`
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s * (p.ash ? 1 : 1.8), p.s * 0.7, p.t * 1.3 + p.ph, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    },
  }
  const eclEnv = E => Math.min(1, E.t / 0.4) * (E.t > E.dur * 0.6 ? Math.max(0, 1 - (E.t - E.dur * 0.6) / (E.dur * 0.4)) : 1)
  // ---- the blood moon: a giant crimson crescent rising behind the arena (drawn with the sky)
  // geometry in screen space; d = the offset of the shadow disc (toward the upper left), so the
  // lit side faces down-right and the lower tip hangs at the lower left
  function moonGeo(E) {
    const r = W * lerp(0.3, 0.68, E.s), rise = easeOut(clamp(E.t / 1.4, 0, 1))
    const x = W * lerp(0.56, 0.5, E.s), y = H * lerp(0.5, 0.56, E.s) - r + H * 0.45 * (1 - rise)
    const dx = -0.17 * r, dy = -0.25 * r, dl = Math.hypot(dx, dy), da = Math.atan2(dy, dx)
    const half = Math.acos(dl / (2 * r))             // tips at da ± half
    return { r, x, y, dx, dy, da, half, rise }
  }
  // the moon body, pre-rendered once per eclipse at reduced resolution (it is all soft gradients)
  function moonArt(E, G) {
    if (E.art) return E.art
    const sc = low() ? 0.3 : 0.5, r = G.r * sc, pad = r * 1.4, S = Math.ceil(pad * 2)
    const c = document.createElement('canvas'); c.width = c.height = S
    const g = c.getContext('2d'), cx = S / 2, cy = S / 2, lx = -G.dx / Math.hypot(G.dx, G.dy), ly = -G.dy / Math.hypot(G.dx, G.dy)
    // outer haze, heavier on the lit side
    let gr = g.createRadialGradient(cx + lx * r * 0.12, cy + ly * r * 0.12, r * 0.85, cx, cy, pad)
    gr.addColorStop(0, 'rgba(230,30,45,0.55)'); gr.addColorStop(0.35, 'rgba(170,12,30,0.22)'); gr.addColorStop(1, 'rgba(90,0,15,0)')
    g.fillStyle = gr; g.fillRect(0, 0, S, S)
    // the lit disc: bright red at the lit edge, deep blood toward the shadow
    gr = g.createRadialGradient(cx + lx * r * 0.75, cy + ly * r * 0.75, 0, cx + lx * r * 0.2, cy + ly * r * 0.2, r * 1.25)
    gr.addColorStop(0, 'rgba(255,95,70,1)'); gr.addColorStop(0.3, 'rgba(235,35,45,1)'); gr.addColorStop(0.65, 'rgba(150,8,28,1)'); gr.addColorStop(1, 'rgba(80,0,16,1)')
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill()
    // the dark side: a soft-edged shadow disc in dark crimson (the eclipse ring), clipped to the moon
    g.save(); g.beginPath(); g.arc(cx, cy, r + 1, 0, Math.PI * 2); g.clip()
    const sx = cx + G.dx * sc, sy = cy + G.dy * sc
    gr = g.createRadialGradient(sx, sy, 0, sx, sy, r * 1.05)
    gr.addColorStop(0, 'rgba(34,3,9,1)'); gr.addColorStop(0.8, 'rgba(44,4,12,1)'); gr.addColorStop(0.93, 'rgba(60,5,15,0.97)'); gr.addColorStop(1, 'rgba(60,5,15,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, r * 1.05, 0, Math.PI * 2); g.fill()
    g.restore()
    // the faint red ring around the dark side
    g.strokeStyle = 'rgba(170,20,35,0.35)'; g.lineWidth = Math.max(1, r * 0.012); g.beginPath(); g.arc(cx, cy, r * 0.995, 0, Math.PI * 2); g.stroke()
    E.art = { c, sc, S }
    return E.art
  }
  function drawMoon() {
    const E = ECL; if (!E) return
    const env = eclEnv(E); if (env <= 0.003) return
    const G = moonGeo(E), breathe = 0.93 + 0.07 * Math.sin(E.t * 1.3)
    ctx.save(); ctx.globalCompositeOperation = 'source-over'
    // the sky darkens to crimson, so the dark side melts into it
    let gr = ctx.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, `rgba(30,2,8,${0.82 * env})`); gr.addColorStop(0.6, `rgba(60,4,14,${0.7 * env})`); gr.addColorStop(1, `rgba(110,10,22,${0.55 * env})`)
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H)
    // the moon body
    const A = moonArt(E, G), sz = A.S / A.sc
    ctx.globalAlpha = env * G.rise ** 0.5
    ctx.drawImage(A.c, G.x - sz / 2, G.y - sz / 2, sz, sz)
    ctx.globalAlpha = 1
    // the thin hot rim along the lit edge: stacked arcs, each shorter than the last, so it tapers
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'
    const mid = G.da + Math.PI, span = Math.PI - G.half, k = env * breathe
    const rim = low() ? [[0.9, 10, '255,60,50', 0.22], [0.55, 2.5, '255,215,190', 0.8]]
      : [[0.98, 22, '240,40,45', 0.1], [0.92, 9, '255,70,55', 0.25], [0.8, 4, '255,140,110', 0.55], [0.6, 2, '255,225,205', 0.85], [0.35, 1.2, '255,250,240', 0.9]]
    for (const [f, lw, c, o] of rim) {
      ctx.strokeStyle = `rgba(${c},${o * k})`; ctx.lineWidth = lw * lerp(1, 1.6, E.s)
      ctx.beginPath(); ctx.arc(G.x, G.y, G.r - lw * 0.3, mid - span * f, mid + span * f); ctx.stroke()
    }
    // slow drips and wisps falling from the lower tip
    for (const d of E.drips) {
      const a = Math.min(1, d.t / 0.6) * (1 - d.t / d.life) * env
      const x = G.x + Math.cos(d.ang) * G.r + d.ox, y = G.y + Math.sin(d.ang) * G.r + d.oy
      if (d.wisp) TRAIL.dot('200,25,40', x, y, d.s * 4, 0.16 * a)
      else { TRAIL.dot('220,25,40', x, y, d.s * 2, 0.12 * a); TRAIL.dot('255,70,60', x, y, d.s * 0.7, 0.85 * a, { len: d.s * (1.5 + Math.min(4, d.vy / 12)), a: Math.PI / 2 }) }
    }
    ctx.restore()
  }
  function moonDrips(E, dt) {
    if (!E.drips) E.drips = []
    const G = moonGeo(E), env = eclEnv(E)
    if (G.rise > 0.6 && Math.random() < dt * (low() ? 0.7 : 1.8) * env && E.drips.length < 14) {
      // from the lower tip, a little way along the lit edge
      const tip = G.da - G.half + 2 * Math.PI
      const wisp = Math.random() < 0.35
      E.drips.push({ ang: tip + R(0.02, 0.35), ox: 0, oy: 0, vy: R(14, 32), t: 0, life: R(2.6, 4.2), s: R(2.5, 4.5) * lerp(1, 1.5, E.s), wisp, vx: wisp ? R(-8, 8) : 0 })
    }
    for (const d of E.drips) { d.t += dt; d.vy += dt * (d.wisp ? 2 : 22); d.oy += d.vy * dt; d.ox += d.vx * dt }
    E.drips = E.drips.filter(d => d.t < d.life)
  }

  // ---- drawing (one fx entry)
  // a lens: zero width at both ends, curved sides, a gradient across the width
  function lens(x0, y0, x1, y1, hw, c, o) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 1 || o <= 0.004) return
    const nx = -dy / L, ny = dx / L, mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    const g = ctx.createLinearGradient(mx - nx * hw, my - ny * hw, mx + nx * hw, my + ny * hw)
    g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},${o})`); g.addColorStop(1, `rgba(${c},0)`)
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(mx + nx * hw * 2, my + ny * hw * 2, x1, y1); ctx.quadraticCurveTo(mx - nx * hw * 2, my - ny * hw * 2, x0, y0); ctx.fill()
  }
  TRAIL.lens = lens   // moves.js (Moon Flash) draws its line with it too
  function line(ln, a, w, echo) {
    const k = clamp((ULT.t - ln.b) / ln.draw, 0, 1), hx = lerp(ln.x0, ln.x1, k), hy = lerp(ln.y0, ln.y1, k)
    ctx.globalCompositeOperation = 'lighter'
    const off = echo ? 10 : 0, nx = -(ln.y1 - ln.y0), ny = ln.x1 - ln.x0, nl = Math.hypot(nx, ny) || 1
    const ox = nx / nl * off, oy = ny / nl * off
    const pulse = 0.88 + 0.12 * Math.sin(T * 9 + ln.x0)
    // while it is still being drawn the head end stays open (no taper there yet)
    const ex = k < 1 ? hx + (hx - ln.x0) * 0.15 : hx, ey = k < 1 ? hy + (hy - ln.y0) * 0.15 : hy
    const L = echo ? [[9, '255,110,120', 0.22], [2.5, '255,190,185', 0.55]]
      : low() ? [[12, '255,120,45', 0.3], [3.5, '255,220,150', 0.9], [1.2, '255,255,245', 1]]
      : [[26, '230,60,40', 0.14], [13, '255,130,50', 0.3], [6, '255,190,100', 0.6], [2.6, '255,235,175', 0.9], [1.1, '255,255,248', 1]]
    for (const [hw, c, o] of L) lens(ln.x0 + ox, ln.y0 + oy, ex + ox, ey + oy, hw * w, c, o * a * pulse)
    if (k < 1 && !echo) { TRAIL.dot('255,150,60', hx, hy, 26 * w, 0.5 * a); TRAIL.dot('255,240,200', hx, hy, 9 * w, a, { core: true }) }
  }
  function drawCut(U) {
    const s = U.cut, age = U.t - U.cutT, open = U.phase === 'split' || U.phase === 'done' ? clamp((U.t - U.cutT - 0.3) / 0.5, 0, 1) : 0
    const k = easeOut(age / 0.12), fade = 1 - clamp((age - 0.35) / 0.6, 0, 1)
    if (fade <= 0) return
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx)
    ctx.save(); ctx.translate(s.x0, s.y0); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter'
    const bulge = L * 0.16, len = L * k
    const cres = (bo, bi, y) => { ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(len / 2, y - bo * 2, len, y); ctx.quadraticCurveTo(len / 2, y - bi * 2, 0, y); ctx.closePath() }
    for (const side of open > 0 ? [-1, 1] : [0]) {
      const y = side * open * 70
      const al = fade * (open > 0 ? 1 - open * 0.6 : 1)
      if (!low()) { cres(bulge * 1.25, bulge * 0.1, y); ctx.fillStyle = `rgba(200,30,40,${0.12 * al})`; ctx.fill(); cres(bulge * 1.17, bulge * 0.22, y); ctx.fillStyle = `rgba(220,40,45,${0.18 * al})`; ctx.fill() }
      cres(bulge * 1.1, bulge * 0.35, y); ctx.fillStyle = `rgba(190,25,40,${0.45 * al})`; ctx.fill()
      cres(bulge, bulge * 0.55, y); ctx.fillStyle = `rgba(255,150,60,${0.55 * al})`; ctx.fill()
      cres(bulge * 0.97, bulge * 0.78, y); ctx.fillStyle = `rgba(255,220,140,${0.8 * al})`; ctx.fill()
      cres(bulge * 0.95, bulge * 0.9, y); ctx.fillStyle = `rgba(255,255,248,${al})`; ctx.fill()
      ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(255,255,250,${al})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(len / 2, y - bulge * 1.9, len, y); ctx.stroke()
    }
    ctx.restore()
  }
  function drawBlade(U) {
    if (!U.blade) return
    const h = hand(), a = bladeAng(), L = 640 * U.blade, w = 34 * U.blade
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a); ctx.globalCompositeOperation = 'lighter'
    const wob = 1 + Math.sin(T * 50) * 0.06
    for (const [ww, c, o] of [[w * 3.2, '255,110,50', 0.18], [w * 1.6, '255,180,90', 0.45], [w * 0.7, '255,230,170', 0.8], [w * 0.25, '255,255,250', 1]]) {
      const g = ctx.createLinearGradient(0, 0, L, 0); g.addColorStop(0, `rgba(${c},${o})`); g.addColorStop(0.85, `rgba(${c},${o})`); g.addColorStop(1, `rgba(${c},0)`)
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -ww * wob / 2); ctx.lineTo(L, 0); ctx.lineTo(0, ww * wob / 2); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }
  const MGR = { t: 0, dur: Infinity, ultMgr: true,
    behind() { if (ULT) drawWings(ULT) },
    update(dt) {
      if (!ULT) return
      for (const m of ULT.motes) m.t += dt
      ULT.motes = ULT.motes.filter(m => m.t < m.life)
      if (ULT.phase === 'done') { ULT.t += dt; if (ULT.t - ULT.end > 1.2) ULT = null }
    },
    draw() {
      const U = ULT; if (!U) return
      const endFade = U.phase === 'done' ? clamp(1 - (U.t - U.end) / 0.4, 0, 1) : 1
      for (const g of U.ghosts) {
        let a
        if (g.solid) a = g.gone ? 0 : g.fade != null ? clamp(1 - (U.t - g.fade) / 0.55, 0, 1) : (U.t >= g.b ? 1 : 0)
        else a = U.t < g.b ? 0 : clamp(1 - (U.t - g.b) / g.life, 0, 1) * 0.85
        drawGhost(g, a)
      }
      const webA = U.phase === 'split' ? clamp(1 - U.pt / 0.2, 0, 1) : U.phase === 'done' ? 0 : 1
      if (webA > 0) for (const ln of U.lines) { line(ln, webA, 1, false); if (U.tr >= 3 && !low()) line(ln, webA, 1, true) }
      ctx.globalCompositeOperation = 'lighter'
      for (const m of U.motes) {
        const k = easeOut(m.t / m.life), x = lerp(m.x0, m.x1, k) + Math.sin(k * Math.PI) * m.bend * 0.4, y = lerp(m.y0, m.y1, k) - Math.sin(k * Math.PI) * m.bend * 0.3
        TRAIL.dot(m.c, x, y, m.r || (m.r = R(4, 9)), 0.9 * (1 - k * 0.5), { core: true })
      }
      drawBlade(U)
      if (U.cut) drawCut(U)
      if (U.wave) drawWave(U)
      ctx.globalCompositeOperation = 'source-over'
      void endFade
    },
  }

  // ---- hooks
  const baseUlt = window.ultimate
  // the portrait cut-in (her cute pose and tease, FXK.ultPanel) plays first, then the dashes
  let PANEL = 0
  window.ultimate = function () {
    if (P.hero !== 'messenger' || ULT || PANEL) return baseUlt()
    let d = 0
    try { if (fxk()?.ultPanel) d = FXK.ultPanel('messenger', { name: moveName('messenger', 'ult') }) || 1.4 } catch (e) { console.warn('ultPanel', e); d = 0 }
    P.meter = 0; P.iframe = Math.max(P.iframe, d + 1); P.act = null; P.queueMove = null
    for (const e of targets()) e.stun = Math.max(e.stun || 0, d + 0.5)
    if (!d) { try { start() } catch (e) { console.warn('ULT', e); ULT = null; return baseUlt() } return }
    PANEL = performance.now() + d * 1000
  }
  const baseUpdate = window.updatePlayer
  window.updatePlayer = function (dt) {
    if (PANEL) {
      P.vx = 0; P.vy = Math.min(P.vy, 0); P.iframe = Math.max(P.iframe, 0.4)
      if (performance.now() < PANEL) return
      PANEL = 0
      try { start() } catch (e) { console.warn('ULT', e); ULT = null }
    }
    if (ULT && ULT.phase !== 'done' && !P.dead) {
      if (!fx.includes(MGR)) fx.push(MGR)
      try { return tick(dt) } catch (e) { console.warn('ULT', e); ULT = null; if (cam.focus) cam.focus.t = 0.2 }
    }
    baseUpdate(dt)
  }
  {
    const u = window.updatePlayer
    window.updatePlayer = function (dt) { if (ECL && !fx.includes(EMGR)) fx.push(EMGR); return u(dt) }
  }
  // the eclipse ring behind the arena
  const baseSky = window.drawLookSky
  window.drawLookSky = function () { baseSky(); if (ECL) try { drawMoon() } catch (e) { console.warn('ECL', e) } }
  // while the eclipse lasts, her hits on the marked target cut 20 % deeper
  const baseDamage = window.damage
  window.damage = function (e, dmg, o) { if (ECL && e === ECL.target && P.hero === 'messenger') dmg *= 1.2; return baseDamage(e, dmg, o) }
  // two boons feed it: her ult level and her sword level (TRAIL.tier)
  if (typeof BOONS !== 'undefined') {
    BOONS.moon = BOONS.moon || { name: 'Crimson Moon', en: 'bigger ultimate', icon: 'sun', max: 3 }
    BOONS.blade = BOONS.blade || { name: 'Molten Blade', en: 'brighter sword', icon: 'sword', max: 2 }
  }
  const baseSprite = window.drawSprite
  window.drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
    if (ULT && ULT.phase !== 'done' && !ULT.visible && hero === P.hero && x === P.x && y === P.y) return
    return baseSprite(hero, sheet, frame, x, y, face, alpha, scale)
  }
  const basePick = window.pickAnim
  window.pickAnim = function () {
    if (ULT && ULT.phase !== 'done' && P.hero === 'messenger') {
      if (ULT.phase === 'gather') return pose('slash3', 1)
      if (ULT.phase === 'slash' || ULT.phase === 'split') return pose('slash3', 4)
      if (ULT.phase === 'ecl1') return pose('m-charge', 1)
      if (ULT.phase === 'ecl2') return pose('m-charge', 4)
      return pose('dash', 2)
    }
    return basePick()
  }
}
