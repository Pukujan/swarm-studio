// ARES heroine-status.js: statuses enemies put on the heroines (burn, shock, chill and freeze).
// Loaded last. It wraps core globals (hurtPlayer, later, updatePlayer, autopilot, drawSprite,
// drawHUD, hzHurt) and the attack tables (PATTERNS, EN_KINDS), so no data file changes.
//
//   burn    fire attacks: a small damage over time (3 s); a dash or dodge-roll puts it out
//   shock   lightning: one 0.25 s jolt while her hurt i-frames still hold, skill cooldowns run
//           slower for 2 s, then 3 s immune to shock
//   chill   frost: she moves at 65 %; a second chill while chilled (or just after) freezes her
//           for 0.6 s (mashing any key breaks it early), then 3 s immune to chill
//
// Fairness: she holds one status at a time; statuses only land with a hit that really hurt
// (i-frames, the ult, the counter guard and the eclipse block them), burn never takes her
// last HP, and nothing chills while the world is stopped. Colours: warm (ember, white-gold);
// the frost is a pale ivory-cyan on her sprite only, the HUD pips stay ivory and gold.
'use strict'

const HSTAT = (() => {
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const TUNE = {
    burn: { dur: 3.0, every: 0.6, dmg: 2, floor: 1 },                  // 5 ticks: 10 HP of 120
    shock: { dur: 2.0, joltAt: 0.7, jolt: 0.25, cdSlow: 0.3, immune: 3.0 },
    chill: { dur: 2.2, speed: 0.65, window: 1.4 },
    freeze: { dur: 0.6, mash: 0.06, gap: 0.05, immune: 3.0 },
  }
  // which attacks leave what (one table; boss patterns and spells, enemy kinds, hazards)
  const MAP = {
    pattern: { firewall: 'burn', hound: 'burn', nova: 'burn', storm: 'shock', arcs: 'shock', freeze: 'chill' },
    // ember and blaze bosses (boss-spells.js hues) also burn with their heavy body attacks
    emberPattern: { slam: 'burn', rush: 'burn', wallkick: 'burn', lances: 'burn', pillars: 'burn', maelstrom: 'burn' },
    emberHues: ['ember', 'blaze'],
    cast: { firewave: 'burn', ricochet: 'shock', slowfield: 'chill' },
    // enemy kind on a stage id: hounds run hot on the ember and inferno stages
    stageKind: { 'ember:rush': 'burn', 'inferno:rush': 'burn' },
    hazard: { fire: 'burn', shock: 'shock' },
  }

  const S = { kind: null, t: 0, dur: 0, next: 0, jolted: false, src: '', immune: { shock: 0, chill: 0 }, chillEnd: -99, mashAt: -9, puff: 0, arcs: [], arcT: 0 }
  const log = []
  let CTX = null, CSRC = ''

  const ult = () => (typeof ULT !== 'undefined' && !!ULT) || (typeof ECL !== 'undefined' && !!ECL)
  const guarded = () => P.act && P.act.name === 'counter' && P.guard > 0
  const invulnerable = () => P.dead || P.iframe > 0 || ult() || guarded()

  function bossStatus(name) {
    if (MAP.pattern[name]) return MAP.pattern[name]
    const hue = typeof BOSS_SPELLS !== 'undefined' && B ? BOSS_SPELLS.set?.[B.handle]?.hue : null
    return hue && MAP.emberHues.includes(hue) ? MAP.emberPattern[name] || null : null
  }
  function enemyStatus(e, kind) {
    if (MAP.cast[kind]) return MAP.cast[kind]
    const id = typeof stage !== 'undefined' && stage ? stage.id : ''
    return MAP.stageKind[id + ':' + kind] || null
  }

  // ---------------------------------------------------------------- tagging
  // run fn with a status context; fx entries, bullets and timers it makes carry the same tag
  function run(st, src, fn, self, args) {
    const prev = CTX, prevS = CSRC; CTX = st; CSRC = src
    const f0 = fx, n0 = fx.length, b0 = bullets, nb = bullets.length
    try { return fn.apply(self, args) } finally {
      if (fx === f0) for (let i = n0; i < fx.length; i++) tagFx(fx[i], st, src)
      if (bullets === b0) for (let i = nb; i < bullets.length; i++) { const b = bullets[i]; if (b && b.enemy && !b.hst) { b.hst = st; b.hsrc = src } }
      CTX = prev; CSRC = prevS
    }
  }
  function tagFx(f, st, src) {
    if (!f || f._hst) return
    f._hst = st
    const u = f.update
    if (typeof u !== 'function') return
    f.update = function (dt) {
      const s0 = P.slow || 0
      const r = run(st, src, u, this, [dt])
      // a frost or slow field chills her once, the first frame it slows her
      if (st === 'chill' && !this._hsChill && (P.slow || 0) > s0 + 1e-4 && !invulnerable()) { if (apply('chill', src + ' field')) this._hsChill = true }
      return r
    }
  }
  const wrapTimed = (obj, key, stFn, srcFn) => {
    const fn = obj[key]; if (typeof fn !== 'function' || fn._hs) return
    const w = function (...a) { const st = stFn(a); return st ? run(st, srcFn(a), fn, this, a) : fn.apply(this, a) }
    w._hs = true; obj[key] = w
  }

  // ---------------------------------------------------------------- the statuses
  function begin(kind, dur, src) { S.kind = kind; S.t = 0; S.dur = dur; S.next = 0; S.jolted = false; S.src = src; S.arcT = 0 }
  function end(why) {
    if (!S.kind) return
    log.push({ kind: S.kind, src: S.src, at: +(T - S.t).toFixed(2), dur: +S.t.toFixed(3), why })
    if (log.length > 200) log.shift()
    if (S.kind === 'shock') S.immune.shock = TUNE.shock.immune
    if (S.kind === 'chill') S.chillEnd = T
    if (S.kind === 'frozen') { S.immune.chill = TUNE.freeze.immune; S.chillEnd = -99; shatter() }
    if (S.kind === 'burn' && why === 'dash') snuff()
    S.kind = null; S.t = 0
  }
  // returns true when the status took. force skips the i-frame check (tests, scripted hits)
  function apply(kind, src = '', force = false) {
    if (P.dead || !kind) return false
    if (!force && ult()) return false
    if (kind === 'freeze') { if (S.kind && S.kind !== 'chill') return false; if (S.kind) end('frozen'); begin('frozen', TUNE.freeze.dur, src); return true }
    if (S.kind && S.kind !== kind && !(S.kind === 'frozen' && kind === 'chill')) return false   // one at a time
    if (kind === 'burn') { if (S.kind === 'burn') { S.t = Math.min(S.t, 0.3); S.src = src } else begin('burn', TUNE.burn.dur, src); return true }
    if (kind === 'shock') { if (S.kind === 'shock' || S.immune.shock > 0) return false; begin('shock', TUNE.shock.dur, src); zapFx && zapFx(P.x, P.y - 70); return true }
    if (kind === 'chill') {
      if (S.immune.chill > 0 || S.kind === 'frozen' || stopT > 0.1) return false
      if (S.kind === 'chill' || T - S.chillEnd < TUNE.chill.window) { if (S.kind) end('frozen'); begin('frozen', TUNE.freeze.dur, src); freezeFx(); return true }
      begin('chill', TUNE.chill.dur, src); return true
    }
    return false
  }
  function clear() { S.kind = null; S.t = 0; S.immune.shock = 0; S.immune.chill = 0; S.chillEnd = -99 }

  // ---------------------------------------------------------------- per frame
  function tick(dt, x0) {
    S.immune.shock = Math.max(0, S.immune.shock - dt); S.immune.chill = Math.max(0, S.immune.chill - dt)
    if (P.dead) { if (S.kind) end('dead'); return }
    if (!S.kind) return
    S.t += dt
    const k = S.kind
    if (k === 'burn') {
      if (P.dashT > 0) return end('dash')
      if (S.t >= S.next + TUNE.burn.every) {
        S.next += TUNE.burn.every
        if (!ult() && !guarded() && P.hp > TUNE.burn.floor) { P.hp = Math.max(TUNE.burn.floor, P.hp - TUNE.burn.dmg); sparks(P.x + R(-14, 14), P.y - R(40, 100), 3, '255,170,70') }
      }
      if (!low() && Math.random() < dt * 14) parts.push({ x: P.x + R(-18, 18), y: P.y - R(30, 110), vx: R(-30, 30), vy: R(-160, -70), life: R(0.35, 0.6), t: 0, size: R(1.5, 3), color: '255,160,60', add: true })
    } else if (k === 'shock') {
      if (!S.jolted && S.t >= TUNE.shock.joltAt) {
        S.jolted = true
        if (P.dashT <= 0 && !ult() && !guarded()) { P.hurtT = Math.max(P.hurtT || 0, TUNE.shock.jolt); if (P.act && !P.act.m?.slam) P.act = null; P.vx *= 0.3; zapFx && zapFx(P.x, P.y - 70); shake = Math.max(shake, 3) }
      }
      for (const c in P.cds) if (P.cds[c] > 0) P.cds[c] += dt * TUNE.shock.cdSlow
    } else if (k === 'chill') {
      if (P.slow <= 0 && P.dashT <= 0 && x0 != null) P.x = x0 + (P.x - x0) * TUNE.chill.speed
      S.puff -= dt; if (S.puff <= 0) { S.puff = low() ? 1.1 : 0.75; breath() }
    } else if (k === 'frozen') {
      if (x0 != null) P.x = x0
      P.vx = 0; if (P.ground) P.vy = 0; P.dashT = 0; P.act = null
      P.hurtT = Math.max(P.hurtT || 0, 0.05); P.dashCD = Math.max(P.dashCD || 0, 0.05)
      if (pressed.size && T - S.mashAt >= TUNE.freeze.gap) { S.mashAt = T; S.t += TUNE.freeze.mash * pressed.size; shake = Math.max(shake, 1.5) }
    }
    if (S.t >= S.dur) end('time')
  }

  // ---------------------------------------------------------------- little effects
  const dot = (c, x, y, r, a, o) => { if (typeof TRAIL !== 'undefined' && TRAIL.dot) TRAIL.dot(c, x, y, r, a, o); else { ctx.globalAlpha = a; ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 } }
  function snuff() {
    if (typeof FXK !== 'undefined' && FXK.smoke) try { FXK.smoke(P.x, P.y - 70, low() ? 2 : 4, { color: 'dust', size: 0.5, spread: 24 }) } catch { }
    for (let i = 0; i < (low() ? 4 : 9); i++) parts.push({ x: P.x + R(-16, 16), y: P.y - R(40, 100), vx: R(-60, 60), vy: R(-120, -40), life: R(0.3, 0.5), t: 0, size: R(1.5, 3), color: '255,190,110', add: true })
  }
  function breath() {
    const hx = P.x + P.face * 16, hy = P.y - (P.hero === 'runner' ? 128 : 136)
    for (let i = 0; i < (low() ? 2 : 4); i++) parts.push({ x: hx, y: hy + R(-3, 3), vx: P.face * R(30, 70), vy: R(-26, -8), life: R(0.7, 1.0), t: 0, size: R(4, 7), color: '240,248,246', smoke: true })
  }
  function freezeFx() { ring(P.x, P.y - 70, 90, '236,248,246'); sparks(P.x, P.y - 70, 8, '240,250,248') }
  function shatter() { for (let i = 0; i < (low() ? 6 : 14); i++) parts.push({ x: P.x + R(-24, 24), y: P.y - R(10, 120), vx: R(-260, 260), vy: R(-380, -80), life: R(0.35, 0.6), t: 0, size: R(2, 4), color: '232,246,244', g: 1400 }) }

  // her silhouette in one colour, from the same frame drawSprite just drew
  const SIL = document.createElement('canvas'), sg = SIL.getContext('2d')
  let silKey = ''
  function silhouette(hero, sheet, frame, scale, rgb) {
    const s = A.sheets?.[hero]?.[sheet]; if (!s) return null
    const k = SCALE[hero] * scale, slot = s.img.height, w = Math.ceil(slot * k)
    const key = hero + sheet + frame + w + rgb
    if (key !== silKey) {
      if (SIL.width < w || SIL.height < w) { SIL.width = SIL.height = Math.max(w, SIL.width) }
      sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, SIL.width, SIL.height)
      sg.drawImage(s.img, frame * slot, 0, slot, slot, 0, 0, w, w)
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = `rgb(${rgb})`; sg.fillRect(0, 0, w, w)
      silKey = key
    }
    return { ox: -s.x * k, oy: -s.y * k, w }
  }
  function drawSil(sil, x, y, face, alpha, op, dx = 0, dy = 0) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op
    ctx.translate(x + dx, y + dy); ctx.scale(face, 1)
    ctx.drawImage(SIL, 0, 0, sil.w, sil.w, sil.ox, sil.oy, sil.w, sil.w)
    ctx.restore()
  }

  // ---------------------------------------------------------------- the looks
  const FLAMES = [[-14, 0.22], [12, 0.36], [-8, 0.55], [14, 0.68], [-2, 0.86], [4, 0.1], [-16, 0.74]]
  function tongue(x, y, h, w, sway) {
    ctx.beginPath(); ctx.moveTo(x - w, y)
    ctx.bezierCurveTo(x - w * 1.3, y - h * 0.4, x + sway * 0.4 - w * 0.4, y - h * 0.75, x + sway, y - h)
    ctx.bezierCurveTo(x + sway * 0.4 + w * 0.5, y - h * 0.7, x + w * 1.3, y - h * 0.4, x + w, y)
    ctx.quadraticCurveTo(x, y + w * 0.9, x - w, y); ctx.closePath()
  }
  function flame(x, y, h, w, sway, a) {
    ctx.globalCompositeOperation = 'source-over'
    let g = ctx.createLinearGradient(0, y + w, 0, y - h)
    g.addColorStop(0, `rgba(200,40,16,${a * 0.85})`); g.addColorStop(0.5, `rgba(240,90,24,${a * 0.75})`); g.addColorStop(1, 'rgba(200,40,16,0)')
    ctx.fillStyle = g; tongue(x, y, h, w, sway); ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    g = ctx.createLinearGradient(0, y + w, 0, y - h * 0.7)
    g.addColorStop(0, `rgba(255,240,200,${a})`); g.addColorStop(0.45, `rgba(255,170,60,${a * 0.8})`); g.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = g; tongue(x, y + 1, h * 0.62, w * 0.55, sway * 0.7); ctx.fill()
  }
  function drawBurn(x, y, face, bh) {
    const n = low() ? 3 : FLAMES.length, fade = Math.min(1, (S.dur - S.t) / 0.4)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const [fx_, fy] = FLAMES[i], ph = T * 9 + i * 1.7
      const px = x + fx_ * face, py = y - bh * fy - 6
      const h = (18 + 7 * Math.sin(ph) + 4 * Math.sin(ph * 2.3)) * fade, w = 5 + 1.3 * Math.sin(ph * 1.3)
      ctx.globalCompositeOperation = 'lighter'; dot('255,110,30', px, py - 6, 18, 0.4 * fade)
      flame(px, py, h, w, Math.sin(ph * 1.7) * 5, 0.9 * fade)
    }
    ctx.restore()
  }
  function jag(x0, y0, x1, y1, n, amp) {
    const pts = [[x0, y0]]
    for (let i = 1; i < n; i++) { const k = i / n; pts.push([lerp(x0, x1, k) + R(-amp, amp), lerp(y0, y1, k) + R(-amp, amp)]) }
    pts.push([x1, y1]); return pts
  }
  function drawShock(x, y, bh) {
    S.arcT -= 1 / 60
    if (S.arcT <= 0) {
      S.arcT = 0.07; S.arcs = []
      const n = low() ? 2 : 4
      for (let i = 0; i < n; i++) {
        const a = R(0, Math.PI * 2), b = a + R(0.7, 1.5), r = R(14, 26), cy = y - bh * R(0.2, 0.85)
        S.arcs.push(jag(x + Math.cos(a) * r, cy + Math.sin(a) * r * 1.5, x + Math.cos(b) * (r + 8), cy + Math.sin(b) * (r + 8) * 1.5, 4, 5))
      }
    }
    const fade = Math.min(1, (S.dur - S.t) / 0.3)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'
    for (const pts of S.arcs) for (const [w, c, a, op] of [[4, '110,50,8', 0.55, 'source-over'], [7, '255,196,90', 0.35, 'lighter'], [2.6, '255,226,140', 0.9, 'lighter'], [1.2, '255,255,246', 1, 'lighter']]) {
      ctx.globalCompositeOperation = op; ctx.strokeStyle = `rgba(${c},${a * fade})`; ctx.lineWidth = w; ctx.beginPath()
      pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke()
    }
    if (S.arcs[0]) { const [px, py] = S.arcs[0][S.arcs[0].length - 1]; dot('255,226,150', px, py, 7, 0.7 * fade, { core: true }) }
    ctx.restore()
  }
  function drawIce(x, y, face, bh) {
    // the 0.6 s freeze: a faceted crust around her, its rim catching the light
    const k = Math.min(1, S.t / 0.1)
    ctx.save()
    // ice spikes grown from the floor around her feet
    const SP = [[-26, 22, 7], [-14, 34, 8], [-2, 26, 6], [10, 38, 9], [22, 24, 7], [30, 16, 5]]
    for (const [dx, h, w] of SP) {
      const X = x + dx * face, H = h * k
      ctx.fillStyle = 'rgba(214,236,236,0.8)'; ctx.beginPath(); ctx.moveTo(X - w, y + 2); ctx.lineTo(X + w * 0.2, y - H); ctx.lineTo(X + w, y + 2); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,252,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X - w * 0.4, y); ctx.lineTo(X + w * 0.2, y - H); ctx.stroke()
    }
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < (low() ? 1 : 3); i++) dot('240,252,250', x + [12, -14, 4][i] * face, y - bh * [0.82, 0.5, 0.2][i], 8, 0.5 + 0.35 * Math.sin(T * 12 + i * 2), { core: true })
    ctx.restore()
  }
  function drawLook(hero, sheet, frame, x, y, face, scale) {
    const k = S.kind, bh = (typeof heroHeight === 'function' ? heroHeight() : 160) * 0.95
    if (k === 'burn') {
      const sil = silhouette(hero, sheet, frame, scale, '255,120,40')
      const f = Math.min(1, (S.dur - S.t) / 0.4)
      if (sil) { drawSil(sil, x, y, face, 0.1 * f, 'source-over'); drawSil(sil, x, y, face, (0.06 + 0.05 * Math.sin(T * 17)) * f, 'lighter') }
      drawBurn(x, y, face, bh)
    } else if (k === 'shock') {
      const sil = silhouette(hero, sheet, frame, scale, '255,236,170')
      if (sil && Math.sin(T * 41) > 0.55) drawSil(sil, x, y, face, 0.22, 'lighter')
      drawShock(x, y, bh)
    } else if (k === 'chill' || k === 'frozen') {
      const sil = silhouette(hero, sheet, frame, scale, '222,242,242')
      if (sil) drawSil(sil, x, y, face, k === 'frozen' ? 0.55 : 0.26, 'source-over')
      if (k === 'frozen') drawIce(x, y, face, bh)
      else if (!low() && Math.random() < 0.3) dot('240,252,250', x + R(-18, 18), y - R(20, bh), 5, 0.8, { core: true })
    }
  }
  // the frosted rim goes under her: the silhouette nudged out around the sprite
  function drawRim(hero, sheet, frame, x, y, face, scale) {
    const sil = silhouette(hero, sheet, frame, scale, '236,250,250'); if (!sil) return
    const n = low() ? 4 : S.kind === 'frozen' ? 12 : 8, r = S.kind === 'frozen' ? 3.6 : 2.2
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; drawSil(sil, x, y, face, 0.7, 'source-over', Math.cos(a) * r, Math.sin(a) * r) }
  }

  // ---------------------------------------------------------------- HUD pips (icons only)
  function pip(x, y, kind, k, alpha) {
    ctx.save(); ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(30,10,10,0.6)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill()
    if (k != null) { ctx.strokeStyle = kind === 'burn' ? '#f0a050' : '#f4e6c8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke() }
    if (kind === 'burn') {
      const g = ctx.createLinearGradient(0, y + 6, 0, y - 7); g.addColorStop(0, '#fff0c8'); g.addColorStop(0.5, '#f29a3a'); g.addColorStop(1, '#d8452a')
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 6, y - 1, x + 4, y + 4); ctx.quadraticCurveTo(x, y + 7, x - 4, y + 4); ctx.quadraticCurveTo(x - 6, y - 1, x, y - 7); ctx.fill()
    } else if (kind === 'shock') {
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.moveTo(x + 2, y - 7); ctx.lineTo(x - 4, y + 1); ctx.lineTo(x, y + 1); ctx.lineTo(x - 2, y + 7); ctx.lineTo(x + 4, y - 1); ctx.lineTo(x, y - 1); ctx.closePath(); ctx.fill()
    } else {
      ctx.strokeStyle = '#f8f2e4'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 6.5, y - Math.sin(a) * 6.5); ctx.lineTo(x + Math.cos(a) * 6.5, y + Math.sin(a) * 6.5); ctx.stroke() }
      if (kind === 'frozen') { ctx.fillStyle = '#f8f2e4'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2) } ctx.fill() }
    }
    ctx.restore()
  }
  function drawPips() {
    if (typeof SKILL_KEYS === 'undefined' || !SKILL_KEYS[P.hero]) return
    let x = 32 + (Object.keys(SKILL_KEYS[P.hero]).length + 1) * 32 + 14
    const y = 92
    if (S.kind) { pip(x, y, S.kind, 1 - S.t / S.dur, 1); x += 26 }
    if (S.immune.shock > 0 && S.kind !== 'shock') { pip(x, y, 'shock', null, 0.3); x += 26 }
    if (S.immune.chill > 0) { pip(x, y, 'chill', null, 0.3); x += 26 }
  }

  // ---------------------------------------------------------------- hooks
  const hooks = () => {
    if (typeof hurtPlayer === 'function') {
      const core = hurtPlayer
      window.hurtPlayer = function (dmg, dir) {
        const blocked = invulnerable(), hp0 = P.hp
        let st = CTX, src = CSRC
        if (!st) for (const b of bullets) if (b.dead && b.hst && circBox(b.x, b.y, b.r + 6, hurtbox())) { st = b.hst; src = b.hsrc || 'bullet'; break }
        const r = core.apply(this, arguments)
        if (st && !blocked && P.hp < hp0) try { apply(st, src, true) } catch (e) { console.warn('HSTAT', e) }
        return r
      }
    }
    if (typeof later === 'function') {
      const core = later
      window.later = function (t, fn, tag) {
        if (CTX && typeof fn === 'function') { const st = CTX, src = CSRC, g = fn; fn = () => run(st, src, g, null, []) }
        return core(t, fn, tag)
      }
    }
    if (typeof hzHurt === 'function') {
      const core = hzHurt
      window.hzHurt = function (h, dmg) { const st = h && MAP.hazard[h.kind]; return st ? run(st, 'hazard ' + h.kind, core, this, [h, dmg]) : core(h, dmg) }
    }
    if (typeof PATTERNS !== 'undefined') for (const name of Object.keys(PATTERNS)) wrapTimed(PATTERNS, name, () => bossStatus(name), () => 'boss ' + name)
    if (typeof EN_KINDS !== 'undefined') for (const [kind, K] of Object.entries(EN_KINDS)) for (const m of ['start', 'tick'])
      if (K && typeof K[m] === 'function') wrapTimed(K, m, a => enemyStatus(a[0], kind), a => (a[0]?.type || 'enemy') + ' ' + kind)
    if (typeof updatePlayer === 'function') {
      const core = updatePlayer
      window.updatePlayer = function (dt) { const x0 = P.x; const r = core(dt); try { tick(dt, x0) } catch (e) { console.warn('HSTAT', e) } return r }
    }
    if (typeof resetPlayer === 'function') { const core = resetPlayer; window.resetPlayer = function () { const r = core.apply(this, arguments); clear(); return r } }
    if (typeof autopilot === 'function') {
      const core = autopilot
      let mashAt = -9
      window.autopilot = function () {
        core()
        try {
          if (!AUTO.on || mode !== 'play' || P.dead) return
          // burning: dash it out when the dash is free (the dash is also an i-frame)
          if (S.kind === 'burn' && S.t > 0.2 && P.dashCD <= 0 && P.hurtT <= 0 && (P.ground || P.airDash > 0) && !P.chant) vtap('shift')
          // frozen: mash, at a person's pace
          if (S.kind === 'frozen' && T - mashAt > 0.12) { mashAt = T; vtap('j') }
        } catch (e) { console.warn('HSTAT', e) }
      }
    }
    if (typeof drawSprite === 'function') {
      const core = drawSprite
      window.drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
        const me = S.kind && hero === P.hero && x === P.x && y === P.y && alpha > 0.5 && !P.dead
        if (me && (S.kind === 'chill' || S.kind === 'frozen')) try { drawRim(hero, sheet, frame, x, y, face, scale) } catch { }
        const r = core.apply(this, arguments)
        if (me) try { drawLook(hero, sheet, frame, x, y, face, scale) } catch (e) { console.warn('HSTAT', e) }
        return r
      }
    }
    if (typeof drawHUD === 'function') { const core = drawHUD; window.drawHUD = function () { const r = core.apply(this, arguments); try { drawPips() } catch (e) { console.warn('HSTAT', e) } return r } }
  }
  if (!/[?&]hstat=0\b/.test(location.search)) hooks()   // ?hstat=0: no statuses (A/B tests)

  return {
    TUNE, MAP, log, apply, clear,
    get kind() { return S.kind }, get state() { return S },
    // a test hook: start a status straight away (freeze skips the first chill)
    force(kind, src = 'test') { if (S.kind) end('forced'); S.immune.shock = 0; S.immune.chill = 0; return apply(kind, src, true) },
  }
})()
