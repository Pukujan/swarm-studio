// ARES spells.js: the Oracle's named magic. Owner: spells.
// Defines SPELLS = { <kind>: (spell, o) => void } (CONTENT.md §5) and drawMagicCircle().
// o = { x, y (her hand), aim (radians), dir (±1), tier, power }. The core does the chant,
// cooldown and meter, then calls SPELLS[spell.kind](spell, o) at release.
// Palette: golden-white light, crimson accents. Lightning is gold-white, never blue.
// Private helpers are prefixed `sp` (game.js already owns a bare `sp`).

// ---------------------------------------------------------------- small helpers
const SP_GOLD = '255,206,110', SP_WHITE = '255,250,232', SP_CRIMSON = '214,36,52', SP_EMBER = '255,120,50'
const spVW = () => (typeof VW === 'function' ? VW() : W)
const spView = () => ({ l: cam.x, r: cam.x + spVW() })
function spGround(x, fromY = -1e4) {
  if (typeof groundAt === 'function') { const g = groundAt(x, fromY); if (isFinite(g)) return g }
  return GROUND
}
const spSfx = n => { if (typeof SFX !== 'undefined' && SFX[n]) SFX[n]() }
const spShake = v => { shake = Math.max(shake, v) }
const spFlash = (v, c = '255,240,210') => { flash = Math.max(flash, v); flashColor = c }
const spSt = (spell, d) => (spell && spell.status !== undefined ? spell.status || undefined : d)
// a spell's base rarity tier plus its run level (1-3), so upgrades add bolts, forks and size
const spTier = o => (o.tier || 1) + Math.max(0, Math.round(o.lv || 1) - 1)
const spPow = o => o.power || 1 + spTier(o) * 0.5
function spInView(pad = 40) { const v = spView(); return targets().filter(e => e.x > v.l - pad && e.x < v.r + pad) }
function spCenter(e) { const b = e.box(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.min(b.w, b.h) / 2 } }
function spOnSeg(e, x0, y0, x1, y1, w) { const c = spCenter(e); return segDist(c.x, c.y, x0, y0, x1, y1) < w + c.r }
// is painted art for `name` loaded? (spell.fx names what heroes.json asks for; any loaded strip is used)
function spArt(spell, name) { return !!(A.fx && A.fx[name]) }
function spStrip(spell, name, x, y, dur, s) { if (!spArt(spell, name)) return false; fx.push(fxStrip(name, x, y, dur, s)); return true }
// one frame of a strip, rotated (fxStrip can't rotate)
function spStripRot(name, k, x, y, rot, s, alpha = 1) {
  const img = A.fx && A.fx[name]; if (!img) return false
  s *= img.k0 || 1   // strips are stored smaller than painted
  const n = Math.max(1, Math.round(img.width / img.height)), slot = img.width / n, f = Math.min(n - 1, k * n | 0)   // 6, or 11-12 after RIFE
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha
  ctx.drawImage(img, f * slot, 0, slot, img.height, -slot * s / 2, -img.height * s / 2, slot * s, img.height * s)
  ctx.restore(); return true
}
function spHash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
function spEmbers(x, y, n, color, s, g = 600) { for (let i = 0; i < n; i++) { const a = R(0, Math.PI * 2), v = R(s * 0.3, s); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - s * 0.3, life: R(0.5, 1.1), t: 0, size: R(2, 5), color, add: true, g }) } }
function spStreaks(x, y, n, color, a0, spread, s) { for (let i = 0; i < n; i++) { const a = a0 + R(-spread, spread), v = R(s * 0.4, s); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: R(0.15, 0.35), t: 0, size: R(2, 4), color, add: true, streak: true }) } }
function spCancelSeg(x0, y0, x1, y1, r) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / r)); let c = 0; for (let i = 0; i <= n; i++) c += cancelBullets(lerp(x0, x1, i / n), lerp(y0, y1, i / n), r); return c }

// freeze: the core may handle 'freeze' in applyStatus; we also stun and draw a frost shell
function spFreeze(e, t) {
  try { applyStatus(e, 'freeze') } catch (_) { }
  const isBoss = e === B
  e.stun = Math.max(e.stun || 0, isBoss ? 0.3 : t)
  e.frozen = Math.max(e.frozen || 0, isBoss ? 0.3 : t)
  if (!isBoss) { e.vx = 0; if (!e.air) e.vy = 0 }
  if (e._spFrost && e._spFrost.t < e._spFrost.dur - 0.1) { e._spFrost.dur = Math.max(e._spFrost.dur, e._spFrost.t + t); return }
  const shards = Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2 + R(-0.2, 0.2), l: R(0.7, 1.25) }))
  const f = { t: 0, dur: isBoss ? 0.6 : t, update() { if (e.dead) this.t = this.dur }, draw(k) {
    const c = spCenter(e), r = c.r * 1.25, al = (1 - Math.max(0, k - 0.8) / 0.2) * 0.85
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(c.x, c.y, r * 0.2, c.x, c.y, r * 1.3); g.addColorStop(0, `rgba(235,245,255,${0.08 * al})`); g.addColorStop(1, `rgba(225,240,255,${0.35 * al})`)
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.3, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(250,252,255,${al})`
    ctx.beginPath()
    for (const s of shards) { const x1 = c.x + Math.cos(s.a) * r * s.l, y1 = c.y + Math.sin(s.a) * r * s.l; ctx.moveTo(c.x + Math.cos(s.a) * r * 0.5, c.y + Math.sin(s.a) * r * 0.5); ctx.lineTo(x1, y1) }
    ctx.stroke()
    ctx.strokeStyle = `rgba(${SP_GOLD},${al * (0.5 + 0.5 * Math.sin(T * 9))})`; ctx.lineWidth = 1.5
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; const px = c.x + Math.cos(a) * r * 1.1, py = c.y + Math.sin(a) * r * 1.1; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) } ctx.closePath(); ctx.stroke()
  } }
  e._spFrost = f; fx.push(f)
}

// ---------------------------------------------------------------- procedural lightning
// a jagged polyline from (x0,y0) to (x1,y1) by midpoint displacement
function spJag(x0, y0, x1, y1, amp = 0.18, depth = 5) {
  let pts = [[x0, y0], [x1, y1]], a = Math.hypot(x1 - x0, y1 - y0) * amp
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, o = R(-a, a)
      out.push([(ax + bx) / 2 - dy / l * o, (ay + by) / 2 + dx / l * o], pts[i])
    }
    pts = out; a *= 0.52
  }
  return pts
}
// a bolt with forks: { main, forks: [pts...] }
function spBoltShape(x0, y0, x1, y1, amp = 0.18, forks = 3) {
  const main = spJag(x0, y0, x1, y1, amp), out = []
  for (let i = 0; i < forks; i++) {
    const p = main[(R(0.15, 0.8) * main.length) | 0], a = ang(x0, y0, x1, y1) + R(-1, 1) * 0.9, l = Math.hypot(x1 - x0, y1 - y0) * R(0.12, 0.3)
    out.push(spJag(p[0], p[1], p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l, 0.3, 3))
  }
  return { main, forks: out }
}
function spLine(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke() }
// glow passes: crimson halo, gold body, white-hot core
function spGlow(pts, w, a, hot = 1) {
  ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(${SP_CRIMSON},${a * 0.22})`; ctx.lineWidth = w * 7; spLine(pts)
  ctx.strokeStyle = `rgba(${SP_GOLD},${a * 0.5})`; ctx.lineWidth = w * 3; spLine(pts)
  ctx.strokeStyle = `rgba(${SP_WHITE},${a * hot})`; ctx.lineWidth = w; spLine(pts)
}
function spDrawBolt(b, w, a) { spGlow(b.main, w, a); for (const f of b.forks) spGlow(f, w * 0.5, a * 0.8) }
function spOrb(x, y, r, a, c = SP_WHITE) {
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(0.35, `rgba(${SP_GOLD},${a * 0.5})`); g.addColorStop(1, `rgba(${SP_CRIMSON},0)`)
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

// a judgment strike from the sky at x: the building block of bolt_rain and storm_field
function spStrike(spell, x, o, opt = {}) {
  const gy = spGround(x), top = (cam.y || 0) - 260, w = opt.w || 1, r = opt.r || 60, dmg = opt.dmg ?? 10 * spPow(o)
  const status = spSt(spell, 'shock')
  let hit = 0
  for (const e of targets()) { const c = spCenter(e); if (Math.abs(c.x - x) < r + c.r && c.y < gy + 40) { damage(e, dmg, { x: c.x, y: c.y, status, small: opt.small }); hit++ } }
  for (let y = gy; y > top + 100; y -= 140) cancelBullets(x, y, r + 30)
  spShake(opt.shake ?? 4 + 2 * spTier(o)); spSfx('zap')
  decals.push({ x, y: gy, r: r * 1.3 * w, t: 6, max: 6 })
  sparks(x, gy - 6, 10, SP_WHITE); spStreaks(x, gy - 4, 12, SP_GOLD, -Math.PI / 2, 1.1, 700)
  if (opt.patch) patches.push({ kind: 'shock', x, y: gy - 20, t: opt.patch, max: opt.patch })
  if (opt.explode) explode(x, gy - 40, opt.explode, dmg * 0.6, status)
  const artName = spArt(spell, 'bolt-strike') ? 'bolt-strike' : spArt(spell, 'gold-lightning') ? 'gold-lightning' : null, w2 = opt.w || 1
  spBoltFx(x, gy, top, { w: w2, forks: 3 + (w2 > 2 ? 3 : 0), branch: w2 > 2 ? 2 : 0, life: 0.38 * Math.max(1, w2 * 0.8), art: artName })
  return hit
}

// a dark storm cloud with gold flickers across [l, r] at the top
function spCloud(spell, l, r, dur, y = null) {
  const cy = y ?? (cam.y || 0) + 40, art = spArt(spell, 'storm-cloud'), puffs = Array.from({ length: Math.ceil((r - l) / 90) + 2 }, (_, i) => ({ x: l - 60 + i * 90 + R(-30, 30), y: cy + R(-30, 30), r: R(70, 130) }))
  fx.push({ t: 0, dur, draw(k) {
    const a = Math.min(1, k * 6) * (1 - Math.max(0, k - 0.75) / 0.25)
    ctx.globalCompositeOperation = 'source-over'
    for (const p of puffs) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, `rgba(30,18,26,${0.75 * a})`); g.addColorStop(1, 'rgba(30,18,26,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill() }
    ctx.globalCompositeOperation = 'lighter'
    if (art) { const img = A.fx['storm-cloud'], s = 0.7, cw = img.height * (img.k0 || 1) * s; for (let x = l; x < r + cw / 2; x += cw * 0.8) spStripRot('storm-cloud', (k * 3) % 1, x, cy, 0, s, a * 0.9) }
    for (const p of puffs) if (Math.random() < 0.08) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 0.8); g.addColorStop(0, `rgba(${SP_GOLD},${0.5 * a})`); g.addColorStop(1, `rgba(${SP_CRIMSON},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2); ctx.fill() }
  } })
}

// a generic magic projectile: moves, pierces or stops, cancels bullets, calls look() to draw
function spShot(opt) {
  const s = { t: 0, dur: opt.life || 1, x: opt.x, y: opt.y, a: opt.a, spd: opt.spd, hit: new Set(), trail: [], done: false, ...opt.extra,
    update(dt) {
      if (this.done) return
      if (opt.home) { const e = nearestTarget(this.x, this.y); if (e) { const d = Math.atan2(Math.sin(ang(this.x, this.y, e.x, e.y) - this.a), Math.cos(ang(this.x, this.y, e.x, e.y) - this.a)); this.a += clamp(d, -opt.home * dt, opt.home * dt) } }
      const px = this.x, py = this.y
      this.x += Math.cos(this.a) * this.spd * dt; this.y += Math.sin(this.a) * this.spd * dt
      this.trail.push([this.x, this.y]); if (this.trail.length > (opt.trail || 10)) this.trail.shift()
      if (opt.cancel) cancelBullets(this.x, this.y, opt.cancel)
      for (const e of targets()) {
        if (this.hit.has(e) || !spOnSeg(e, px, py, this.x, this.y, opt.r || 20)) continue
        this.hit.add(e)
        damage(e, opt.dmg, { x: this.x, y: this.y, status: opt.status, kb: opt.kb ? Math.cos(this.a) * opt.kb : 0, launch: opt.launch })
        opt.onHit && opt.onHit(this, e)
        if (!opt.pierce) return this.end()
      }
      if (this.y > spGround(this.x, this.y - 30) - 4 && Math.sin(this.a) > 0.05) return this.end()
      if (this.t >= this.dur - 0.02) this.end()
    },
    end() { if (this.done) return; this.done = true; this.t = Math.max(this.t, this.dur - (opt.fade || 0.12)); opt.onEnd && opt.onEnd(this) },
    draw(k) { opt.look(this, k) } }
  fx.push(s); return s
}

// ---------------------------------------------------------------- the spells
const SPELLS = {
  // 天譴雷霆: judgment thunder sweeps the screen from her side, then one great strike
  bolt_rain(spell, o) {
    const v = spView(), tier = spTier(o), n = 6 + 4 * tier, dir = o.dir || 1
    dim = Math.max(dim, 1.8); spFlash(0.7); spShake(8 + 3 * tier)
    spCloud(spell, v.l - 100, v.r + 100, 2.6)
    const x0 = dir > 0 ? Math.max(v.l + 60, o.x - 120) : Math.min(v.r - 60, o.x + 120), x1 = dir > 0 ? v.r - 40 : v.l + 40
    for (let i = 0; i < n; i++) later(0.25 + i * (1.3 / n), () => spStrike(spell, lerp(x0, x1, i / (n - 1)) + R(-50, 50), o, { dmg: 7 * spPow(o), patch: i % 3 === 0 ? 2.5 : 0, small: true }))
    // every target in view takes aimed strikes too
    const ts = spInView()
    ts.forEach((e, i) => { for (let j = 0; j < Math.max(1, tier - 1); j++) later(0.35 + i * 0.09 + j * 0.45, () => { if (!e.dead) spStrike(spell, e.x + R(-15, 15), o, { dmg: 9 * spPow(o) }) }) })
    // the verdict: a triple-thick bolt on the strongest target
    later(1.75, () => {
      const t = spInView().sort((a, b) => (b === B) - (a === B) || b.hp - a.hp)[0]
      const x = t ? t.x : clamp(o.x + dir * 420, v.l + 80, v.r - 80)
      spStrike(spell, x, o, { w: 2.6, r: 120, dmg: 22 * spPow(o), shake: 14 + 4 * tier, patch: 3.5, explode: 200 })
      spFlash(1); stopT = Math.max(stopT, 0.07); ring(x, spGround(x) - 60, 260, SP_GOLD)
    })
  },

  // 金雷槍: a gold thunder spear pierces along her aim, then splits into forks
  thunder_spear(spell, o) {
    const tier = spTier(o), dmg = 26 * spPow(o), status = spSt(spell, 'shock'), art = spArt(spell, 'thunder-spear')
    spFlash(0.45); spShake(6 + 3 * tier); spSfx('zap'); spSfx('heavy')
    spStreaks(o.x, o.y, 18, SP_WHITE, o.aim, 0.35, 900); ring(o.x, o.y, 90, SP_GOLD)
    const split = (s) => {
      const nf = 2 + tier, gy = spGround(s.x, s.y - 30)
      spShake(5 + 2 * tier); sparks(s.x, s.y, 14, SP_WHITE); ring(s.x, s.y, 120, SP_GOLD)
      explode(s.x, Math.min(s.y, gy - 10), 90 + 20 * tier, dmg * 0.35, status)
      for (let i = 0; i < nf; i++) {
        const a = s.a + (i - (nf - 1) / 2) * 0.32 + R(-0.05, 0.05)
        spShot({ x: s.x, y: s.y, a, spd: 1700, life: 0.32, r: 18, dmg: dmg * 0.35, status, pierce: true, cancel: 30, trail: 6,
          look(f, k) { if (f.trail.length < 2) return; const al = 1 - k; const t0 = f.trail[0]; spGlow(spJag(t0[0], t0[1], f.x, f.y, 0.25, 3), 2.5, al); spOrb(f.x, f.y, 26, al) } })
      }
    }
    spShot({ x: o.x, y: o.y, a: o.aim, spd: 2600, life: 0.6, r: 34, dmg, status, pierce: true, cancel: 55, kb: 320, trail: 8, fade: 0.15,
      onHit(s, e) { sparks(e.x, e.y, 10, SP_WHITE); spShake(4 + tier); zapFx(e.x, e.y) },
      onEnd: split,
      look(s, k) {
        const al = s.done ? Math.max(0, 1 - (s.t - (s.dur - 0.15)) / 0.15) : 1, c = Math.cos(s.a), sn = Math.sin(s.a)
        const tx = s.x - c * 300, ty = s.y - sn * 300
        ctx.globalCompositeOperation = 'lighter'
        const g = ctx.createLinearGradient(tx, ty, s.x, s.y); g.addColorStop(0, 'rgba(255,200,110,0)'); g.addColorStop(1, `rgba(${SP_WHITE},${al})`)
        ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke()
        for (let i = 0; i < 2; i++) spGlow(spJag(tx, ty, s.x, s.y, 0.12, 4), 2, al * 0.9)
        if (!art || !spStripRot('thunder-spear', (T * 8) % 1, s.x - c * 120, s.y - sn * 120, s.a, 0.55, al)) {
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a)
          ctx.fillStyle = `rgba(${SP_WHITE},${al})`; ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(-10, -13); ctx.lineTo(-24, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill()
          ctx.strokeStyle = `rgba(${SP_CRIMSON},${al * 0.9})`; ctx.lineWidth = 2; ctx.stroke()
          ctx.restore()
        }
        spOrb(s.x, s.y, 70, al * 0.8)
      } })
  },

  // 連雷華: lightning hops target to target with jagged arcs
  chain(spell, o) {
    const tier = spTier(o), status = spSt(spell, 'shock'), hops = 3 + 2 * tier, art = spArt(spell, 'chain-arc')
    let from = { x: o.x, y: o.y }, dmg = 13 * spPow(o)
    const pool = spInView(), chain = []
    // first link: prefer targets in her aim, nearest first
    while (chain.length < hops) {
      const cand = pool.filter(e => !chain.includes(e)).map(e => ({ e, d: Math.hypot(e.x - from.x, e.y - from.y), aim: chain.length ? 0 : (aimed(e, 0.9) ? -400 : 0) })).filter(c => c.d < (chain.length ? 460 : 900)).sort((a, b) => a.d + a.aim - b.d - b.aim)
      if (!cand.length) break
      chain.push(cand[0].e); from = cand[0].e
    }
    spSfx('zap'); spFlash(0.25); spShake(3 + 2 * tier)
    const arc = (ax, ay, bx, by, w) => {
      let b = spBoltShape(ax, ay, bx, by, 0.22, 2), re = 0
      fx.push({ t: 0, dur: 0.32, update(dt) { if ((re -= dt) <= 0) { re = 0.035; b = spBoltShape(ax, ay, bx, by, 0.22, 2) } }, draw(k) { spDrawBolt(b, w, 1 - k * k); spOrb(bx, by, 60, 1 - k) } })
    }
    if (!chain.length) {
      const x1 = o.x + Math.cos(o.aim) * 520, y1 = Math.min(spGround(o.x) - 10, o.y + Math.sin(o.aim) * 520)
      arc(o.x, o.y, x1, y1, 3.5); sparks(x1, y1, 10, SP_WHITE); spCancelSeg(o.x, o.y, x1, y1, 50)
      return
    }
    let px = o.x, py = o.y
    chain.forEach((e, i) => {
      const sx = px, sy = py, d = dmg * Math.pow(0.88, i)
      later(i * 0.075, () => {
        if (e.dead) return
        const c = spCenter(e)
        arc(sx, sy, c.x, c.y, 4 - i * 0.3)
        damage(e, d, { x: c.x, y: c.y, status })
        cancelBullets(c.x, c.y, 90); spSfx('zap'); spShake(3 + tier)
        if (art) fx.push(fxStrip('chain-arc', c.x, c.y, 0.3, 0.35))
        else spStreaks(c.x, c.y, 8, SP_GOLD, R(0, 6.28), 3.14, 500)
        if (i === chain.length - 1) { ring(c.x, c.y, 140, SP_GOLD); sparks(c.x, c.y, 16, SP_WHITE) }
      })
      const c = spCenter(e); px = c.x; py = c.y
    })
  },

  // 雷域 storm_field: the light storm, defined below with the other big spells (SPELLS.storm_field)

  // 黄昏流星: a rain of small stars, then one great falling star that breaks everything
  meteor(spell, o) {
    const tier = spTier(o), v = spView(), dir = o.dir || 1, status = spSt(spell, 'burn'), art = spArt(spell, 'meteor')
    const t = spInView().filter(e => aimed(e, 1.2)).sort((a, b) => (b === B) - (a === B) || b.hp - a.hp)[0] || spInView()[0]
    const X = t ? t.x : clamp(o.x + dir * 480, v.l + 120, v.r - 120)
    dim = Math.max(dim, 2.2); spShake(5 + tier)
    const fall = (x, delay, dur, big) => later(delay, () => {
      const gy = spGround(x, -1e4), sx = x - dir * (big ? 520 : 260), sy = (cam.y || 0) - (big ? 420 : 200)
      fx.push({ t: 0, dur, done: false, update() {
        if (this.t < dur - 0.02 || this.done) return
        this.done = true
        if (big) {
          explode(x, gy - 40, 260 + 30 * tier, 40 * spPow(o), status)
          for (const e of targets()) if (Math.abs(e.x - x) < 320) { applyStatus(e, 'char'); if (status) applyStatus(e, status) }
          patches.push({ kind: 'fire', l: x - 280, r: x + 280, x, y: gy, t: 5, max: 5 })
          decals.push({ x, y: gy, r: 300, t: 14, max: 14 })
          spShake(22 + 4 * tier); spSoftFlash(spLv(o) >= 3 ? 0.35 : spLv(o) >= 2 ? 0.3 : 0.25, '255,220,180', 0.25); stopT = Math.max(stopT, 0.08); slowT = Math.max(slowT, 0.35)
          for (let i = 0; i < 3; i++) later(i * 0.08, () => ring(x, gy - 40, 220 + i * 140, i === 1 ? SP_CRIMSON : SP_GOLD))
          spEmbers(x, gy - 30, 60, SP_EMBER, 900, 900); spEmbers(x, gy - 30, 30, SP_WHITE, 700, 700)
          if (art) fx.push(fxStrip('meteor', x, gy - 160, 0.6, 0.9))
          spImpact(x, gy, spLv(o), spLow())
        } else {
          explode(x, gy - 20, 100, 10 * spPow(o), status)
          decals.push({ x, y: gy, r: 110, t: 8, max: 8 }); spShake(8 + tier); spEmbers(x, gy - 10, 14, SP_EMBER, 500)
        }
        spSfx('boom')
      }, draw(k) {
        const e = k * k, cx = lerp(sx, x, e), cy = lerp(sy, gy - 30, e), r = big ? 46 : 18
        const a0 = ang(sx, sy, x, gy), tl = big ? 420 : 200
        ctx.globalCompositeOperation = 'lighter'
        // ground warning
        ctx.strokeStyle = `rgba(${SP_CRIMSON},${0.4 + 0.5 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, gy - 4, r * 3 * (1.4 - k * 0.4), r * 0.6, 0, 0, Math.PI * 2); ctx.stroke()
        const g = ctx.createLinearGradient(cx - Math.cos(a0) * tl, cy - Math.sin(a0) * tl, cx, cy); g.addColorStop(0, 'rgba(214,36,52,0)'); g.addColorStop(0.6, 'rgba(255,140,60,0.7)'); g.addColorStop(1, `rgba(${SP_WHITE},1)`)
        ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.lineWidth = r * 1.6; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a0) * tl, cy - Math.sin(a0) * tl); ctx.lineTo(cx, cy); ctx.stroke()
        if (!(big && art && spStripRot('meteor', k, cx, cy, a0 - Math.PI / 2 * 0, 0.6, 1))) { spOrb(cx, cy, r * 3, 1); ctx.fillStyle = `rgba(${SP_WHITE},1)`; ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill() }
        if (Math.random() < 0.6) parts.push({ x: cx, y: cy, vx: R(-80, 80) - Math.cos(a0) * 200, vy: R(-80, 80) - Math.sin(a0) * 200, life: 0.5, t: 0, size: R(3, 7), color: SP_EMBER, add: true })
      } })
    })
    const n = 3 + tier
    for (let i = 0; i < n; i++) fall(clamp(X + R(-420, 420), v.l + 40, v.r - 40), 0.1 + i * 0.12, 0.45, false)
    fall(X, 0.35, 0.95, true)
  },

  // 紅蓮波: a wall of crimson-gold fire runs along the ground and leaves it burning
  flame_wave(spell, o) {
    const tier = spTier(o), dir = o.dir || 1, status = spSt(spell, 'burn'), dmg = 20 * spPow(o), art = spArt(spell, 'flame-wave')
    const hgt = 200 + 40 * tier, speed = 980, life = 1.15
    spShake(7 + 2 * tier); spSfx('boom'); spFlash(0.3, '255,200,150')
    const tongues = Array.from({ length: 14 }, (_, i) => ({ o: R(-50, 50), h: R(0.5, 1), p: R(0, 6.28) }))
    fx.push({ t: 0, dur: life, x: o.x + dir * 40, last: o.x, hit: new Set(), update(dt) {
      if (this.t > life - 0.2) return
      this.x += dir * speed * dt
      const gy = spGround(this.x, P.y - 40)
      cancelBullets(this.x, gy - hgt / 2, hgt * 0.6)
      for (const e of targets()) if (!this.hit.has(e) && Math.abs(e.x - this.x) < 70 + e.r && e.y > gy - hgt - 40) { this.hit.add(e); damage(e, dmg, { x: e.x, y: e.y, status, kb: dir * 420, launch: -320 }) }
      if (Math.abs(this.x - this.last) > 90) {
        this.last = this.x
        patches.push({ kind: 'fire', l: this.x - 55, r: this.x + 55, x: this.x, y: gy, t: 2.5 + tier * 0.5, max: 2.5 + tier * 0.5 })
        decals.push({ x: this.x, y: gy, r: 80, t: 8, max: 8 })
      }
      if (Math.random() < 0.9) parts.push({ x: this.x + R(-30, 30), y: gy - R(0, hgt), vx: dir * R(100, 400), vy: R(-300, -80), life: R(0.3, 0.6), t: 0, size: R(3, 8), color: Math.random() < 0.5 ? SP_EMBER : SP_GOLD, add: true })
      if (this.t + dt > life - 0.2) explode(this.x, gy - 60, 140 + 20 * tier, dmg * 0.5, status)
    }, draw(k) {
      const gy = spGround(this.x, P.y - 40), a = 1 - Math.max(0, k - 0.8) / 0.2
      ctx.globalCompositeOperation = 'lighter'
      for (const tg of tongues) {
        const x = this.x + tg.o - dir * 20, h = hgt * tg.h * (0.85 + 0.15 * Math.sin(T * 22 + tg.p)), w = 34
        for (const [s, c, al] of [[1.4, SP_CRIMSON, 0.35], [1, SP_EMBER, 0.55], [0.55, SP_GOLD, 0.8], [0.25, SP_WHITE, 0.9]]) {
          ctx.fillStyle = `rgba(${c},${al * a})`; ctx.beginPath()
          ctx.moveTo(x - w * s, gy); ctx.quadraticCurveTo(x - w * s * 0.6, gy - h * s * 0.6, x + dir * 14 + Math.sin(T * 17 + tg.p) * 8, gy - h * (0.3 + 0.7 * s)); ctx.quadraticCurveTo(x + w * s * 0.6, gy - h * s * 0.5, x + w * s, gy); ctx.closePath(); ctx.fill()
        }
      }
      if (art) spStripRot('flame-wave', (k * 2) % 1, this.x, gy - hgt * 0.5, 0, hgt / 500, a)
      const g = ctx.createLinearGradient(this.x - dir * 400, 0, this.x, 0); g.addColorStop(0, 'rgba(214,36,52,0)'); g.addColorStop(1, `rgba(255,170,80,${0.4 * a})`)
      ctx.fillStyle = g; ctx.fillRect(Math.min(this.x, this.x - dir * 400), gy - 40, 400, 40)
    } })
  },

  // 氷晶槍: crystal lances that pierce and freeze, then shatter
  ice_lance(spell, o) {
    const tier = spTier(o), n = 2 + tier, dmg = 13 * spPow(o), art = spArt(spell, 'ice-lance'), st = spSt(spell, 'freeze')
    spShake(4 + 2 * tier); spSfx('shot'); spFlash(0.2, '240,246,255')
    const shatter = (x, y) => { for (let i = 0; i < 12; i++) { const a = R(0, 6.28), s = R(150, 500); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: R(0.4, 0.8), t: 0, size: R(2, 5), color: i % 3 ? '235,244,255' : SP_GOLD, add: true, g: 900, streak: i % 2 === 0 }) } ring(x, y, 70, '240,246,255') }
    for (let i = 0; i < n; i++) later(i * 0.07, () => {
      const a = o.aim + (i - (n - 1) / 2) * 0.07
      spShot({ x: o.x, y: o.y, a, spd: 2100, life: 0.7, r: 16, dmg, status: st === 'freeze' ? undefined : st, pierce: true, cancel: 26, kb: 120, trail: 6,
        onHit(s, e) { spFreeze(e, 1.1 + 0.35 * tier); shatter(e.x, e.y); spShake(3 + tier) },
        onEnd(s) { shatter(s.x, s.y); decals.push({ x: s.x, y: spGround(s.x, s.y - 30), r: 40, t: 3, max: 3 }) },
        look(s, k) {
          const al = s.done ? 0.4 * (1 - k) : 1
          if (art && spStripRot('ice-lance', (T * 6) % 1, s.x, s.y, s.a, 0.32, al)) return
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.globalCompositeOperation = 'lighter'
          const g = ctx.createLinearGradient(-180, 0, 0, 0); g.addColorStop(0, 'rgba(230,240,255,0)'); g.addColorStop(1, `rgba(240,248,255,${0.6 * al})`)
          ctx.fillStyle = g; ctx.fillRect(-180, -5, 180, 10)
          ctx.fillStyle = `rgba(245,250,255,${0.85 * al})`; ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(10, -10); ctx.lineTo(-40, -7); ctx.lineTo(-52, 0); ctx.lineTo(-40, 7); ctx.lineTo(10, 10); ctx.closePath(); ctx.fill()
          ctx.strokeStyle = `rgba(${SP_GOLD},${al})`; ctx.lineWidth = 1.5; ctx.stroke()
          ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(-52, 0); ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.stroke()
          ctx.restore()
        } })
    })
  },

  // 風刃: crescent wind blades fly along her aim, cut, launch and clear bullets
  wind_blade(spell, o) {
    const tier = spTier(o), n = 2 + tier, dmg = 10 * spPow(o), art = spArt(spell, 'wind-blade'), st = spSt(spell, undefined)
    spShake(3 + 2 * tier); spSfx('slash')
    for (let i = 0; i < n; i++) later(i * 0.085, () => {
      const a = o.aim + (i % 2 ? 1 : -1) * 0.06 * Math.ceil(i / 2), flip = i % 2 ? -1 : 1
      spSfx('slash')
      spShot({ x: o.x, y: o.y, a, spd: 1500, life: 0.75, r: 60, dmg, status: st, pierce: true, cancel: 70, kb: 380, launch: -360, trail: 5,
        onHit(s, e) { spStreaks(e.x, e.y, 8, SP_WHITE, s.a, 0.5, 700) },
        look(s, k) {
          const al = s.done ? 0.5 * (1 - k) : 1 - k * 0.3
          if (art && spStripRot('wind-blade', (k * 6) % 1, s.x, s.y, s.a, 0.35, al)) return
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.scale(1, flip); ctx.globalCompositeOperation = 'lighter'
          for (const [w, c, o2] of [[20, SP_CRIMSON, 0.25], [11, SP_GOLD, 0.55], [4, SP_WHITE, 0.95]]) { ctx.strokeStyle = `rgba(${c},${o2 * al})`; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(-50, 0, 80, -1.15, 1.15); ctx.stroke() }
          ctx.strokeStyle = `rgba(${SP_WHITE},${0.35 * al})`; ctx.lineWidth = 2; ctx.beginPath()
          for (let j = -2; j <= 2; j++) { ctx.moveTo(-60, j * 18); ctx.lineTo(-200 - Math.abs(j) * 20, j * 22) }
          ctx.stroke(); ctx.restore()
        } })
    })
  },

  // 聖十字: a cross of light at the target, both arms across the whole screen
  holy_cross(spell, o) {
    const tier = spTier(o), v = spView(), dmg = 28 * spPow(o), status = spSt(spell, 'char'), art = spArt(spell, 'holy-cross')
    const t = spInView().filter(e => aimed(e, 0.9)).sort((a, b) => Math.abs(a.x - o.x) - Math.abs(b.x - o.x))[0]
    const cx = t ? spCenter(t).x : clamp(o.x + (o.dir || 1) * 450, v.l + 100, v.r - 100)
    const cy = t ? spCenter(t).y : spGround(cx, o.y) - 120
    const top = (cam.y || 0) - 200, bot = spGround(cx, cy) + 20, l = v.l - 100, r = v.r + 100
    spSfx('glare')
    later(0.16, () => {
      for (const e of targets()) if (spOnSeg(e, cx, top, cx, bot, 60) || spOnSeg(e, l, cy, r, cy, 44)) damage(e, dmg, { x: e.x, y: e.y, status })
      spCancelSeg(cx, top, cx, bot, 80); spCancelSeg(l, cy, r, cy, 60)
      explode(cx, cy, 150 + 20 * tier, dmg * 0.3, status)
      decals.push({ x: cx, y: bot - 20, r: 140, t: 10, max: 10 })
      spShake(10 + 4 * tier); spFlash(0.9); stopT = Math.max(stopT, 0.05); spSfx('boom')
      if (art) fx.push(fxStrip('holy-cross', cx, cy, 0.8, 0.9))
      spStreaks(cx, cy, 30, SP_WHITE, 0, 3.14, 900)
    })
    fx.push({ t: 0, dur: 1.2, draw(k) {
      ctx.globalCompositeOperation = 'lighter'
      if (k < 0.13) { const a = k / 0.13; ctx.strokeStyle = `rgba(${SP_CRIMSON},${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bot); ctx.moveTo(l, cy); ctx.lineTo(r, cy); ctx.stroke(); return }
      const q = (k - 0.13) / 0.87, a = q < 0.1 ? 1 : 1 - (q - 0.1) / 0.9, wv = 70 * (1 - q * 0.6) * (1 + tier * 0.15), wh = wv * 0.7
      const gv = ctx.createLinearGradient(cx - wv, 0, cx + wv, 0); gv.addColorStop(0, 'rgba(214,36,52,0)'); gv.addColorStop(0.3, `rgba(${SP_GOLD},${0.6 * a})`); gv.addColorStop(0.5, `rgba(${SP_WHITE},${a})`); gv.addColorStop(0.7, `rgba(${SP_GOLD},${0.6 * a})`); gv.addColorStop(1, 'rgba(214,36,52,0)')
      ctx.fillStyle = gv; ctx.fillRect(cx - wv, top, wv * 2, bot - top)
      const gh = ctx.createLinearGradient(0, cy - wh, 0, cy + wh); gh.addColorStop(0, 'rgba(214,36,52,0)'); gh.addColorStop(0.3, `rgba(${SP_GOLD},${0.6 * a})`); gh.addColorStop(0.5, `rgba(${SP_WHITE},${a})`); gh.addColorStop(0.7, `rgba(${SP_GOLD},${0.6 * a})`); gh.addColorStop(1, 'rgba(214,36,52,0)')
      ctx.fillStyle = gh; ctx.fillRect(l, cy - wh, r - l, wh * 2)
      ctx.strokeStyle = `rgba(${SP_CRIMSON},${0.8 * a})`; ctx.lineWidth = 2
      ctx.strokeRect(cx - wv * 0.55, top, wv * 1.1, bot - top); ctx.strokeRect(l, cy - wh * 0.55, r - l, wh * 1.1)
      spOrb(cx, cy, 240 * (1 - q * 0.4), a)
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(q * 0.6); ctx.fillStyle = `rgba(${SP_WHITE},${a})`
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); const L = i % 2 ? 70 : 150; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(L * (1 - q * 0.5), 0); ctx.lineTo(0, 6); ctx.fill() }
      ctx.restore()
      drawMagicCircle(cx, cy, 120 + 60 * q, 1, q * 2)
    } })
  },

  // 重力井: a singularity drags enemies and bullets in, then implodes
  gravity_well(spell, o) {
    const tier = spTier(o), v = spView(), dur = 2.2 + 0.4 * tier, Rg = 340 + 40 * tier, status = spSt(spell, undefined), art = spArt(spell, 'gravity-well')
    const dist = 420, cx = clamp(o.x + Math.cos(o.aim) * dist, v.l + 120, v.r - 120)
    const cy = Math.min(spGround(cx, o.y - 200) - 150, o.y + Math.sin(o.aim) * dist)
    const motes = Array.from({ length: 60 }, () => ({ a: R(0, 6.28), d: R(40, Rg), s: R(1.5, 4) }))
    spShake(5 + 2 * tier); spSfx('heavy'); dim = Math.max(dim, 1)
    fx.push({ t: 0, dur, tick: 0.25, update(dt) {
      const pull = 1 - this.t / dur * 0.3
      for (const e of targets()) {
        const d = Math.hypot(e.x - cx, e.y - cy); if (d > Rg + e.r || e === B) continue
        const f = clamp(1 - d / Rg, 0.15, 1) * 3.2 * pull * dt
        e.x += (cx - e.x) * f; e.y += (cy - e.y) * f * 0.6; e.vx *= 0.9
        e.stun = Math.max(e.stun || 0, 0.12)
      }
      for (const b of bullets) if (b.enemy && !b.dead) { const d = Math.hypot(b.x - cx, b.y - cy); if (d < Rg) { const a = ang(b.x, b.y, cx, cy); b.vx += Math.cos(a) * 2400 * dt; b.vy += Math.sin(a) * 2400 * dt } }
      cancelBullets(cx, cy, 70)
      if ((this.tick -= dt) <= 0) { this.tick = 0.25; for (const e of targets()) if (Math.hypot(e.x - cx, e.y - cy) < 150 + e.r) damage(e, 2.5 * spPow(o), { x: e.x, y: e.y, small: true, status }) }
      for (const m of motes) { m.a += dt * (900 / (m.d + 40)); m.d -= dt * 120; if (m.d < 20) m.d = Rg }
      if (this.t + dt >= dur - 0.02 && !this.done) {
        this.done = true
        explode(cx, cy, 240 + 30 * tier, 30 * spPow(o), status)
        spShake(16 + 3 * tier); spFlash(0.8); stopT = Math.max(stopT, 0.06)
        ring(cx, cy, 300, SP_WHITE); later(0.06, () => ring(cx, cy, 420, SP_CRIMSON))
        spStreaks(cx, cy, 40, SP_GOLD, 0, 3.14, 1100)
      }
    }, draw(k) {
      const a = Math.min(1, k * 6), rot = T * 3
      if (art) spStripRot('gravity-well', (k * 4) % 1, cx, cy, rot * 0.2, 0.5, a)
      ctx.globalCompositeOperation = 'source-over'
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90); g.addColorStop(0, `rgba(6,2,6,${0.95 * a})`); g.addColorStop(0.6, `rgba(20,6,10,${0.7 * a})`); g.addColorStop(1, 'rgba(20,6,10,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 90, 0, Math.PI * 2); ctx.fill()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i++) { const rr = Rg * (1 - ((k * 3 + i / 3) % 1)); ctx.strokeStyle = `rgba(${SP_CRIMSON},${0.35 * a * (rr / Rg)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke() }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot * 0.3)
      for (const [rx, ry, w, c, al] of [[110, 34, 10, SP_GOLD, 0.5], [104, 30, 3, SP_WHITE, 0.95]]) { ctx.strokeStyle = `rgba(${c},${al * a})`; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke() }
      ctx.restore()
      ctx.fillStyle = `rgba(${SP_GOLD},${0.8 * a})`
      for (const m of motes) { const x = cx + Math.cos(m.a) * m.d, y = cy + Math.sin(m.a) * m.d * 0.55; ctx.fillRect(x - m.s / 2, y - m.s / 2, m.s, m.s) }
      ctx.strokeStyle = `rgba(${SP_WHITE},${0.9 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 58 + Math.sin(T * 20) * 3, 0, Math.PI * 2); ctx.stroke()
    } })
  },

  // 天剣召喚: a halo of spectral swords forms above her, then rains on every target in view
  summon_blades(spell, o) {
    const tier = spTier(o), n = 6 + 2 * tier, dmg = 9 * spPow(o), art = spArt(spell, 'summon-blades'), st = spSt(spell, undefined), hold = 0.5
    spSfx('glare'); spShake(3 + tier)
    if (art) fx.push(fxStrip('summon-blades', P.x, P.y - 230, 0.7, 0.7))
    const slot = i => { const a = Math.PI + (i + 0.5) / n * Math.PI; return { x: P.x + Math.cos(a) * 170, y: P.y - 170 + Math.sin(a) * 110 } }
    const fired = new Array(n).fill(false)
    const drawSword = (x, y, rot, s, al) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(${SP_GOLD},${0.35 * al})`; ctx.beginPath(); ctx.ellipse(10, 0, 70, 16, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(${SP_WHITE},${0.95 * al})`; ctx.beginPath(); ctx.moveTo(62, 0); ctx.lineTo(-18, -6); ctx.lineTo(-18, 6); ctx.closePath(); ctx.fill()
      ctx.fillStyle = `rgba(${SP_CRIMSON},${al})`; ctx.fillRect(-22, -14, 5, 28)
      ctx.fillStyle = `rgba(${SP_GOLD},${al})`; ctx.fillRect(-40, -3, 18, 6); ctx.beginPath(); ctx.arc(-42, 0, 4, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    fx.push({ t: 0, dur: hold + n * 0.07 + 0.1, draw(k) {
      for (let i = 0; i < n; i++) {
        if (fired[i]) continue
        const born = clamp((this.t - i * 0.035) / 0.15, 0, 1); if (born <= 0) continue
        const p = slot(i), bob = Math.sin(T * 6 + i) * 5
        drawSword(p.x, p.y + bob, Math.PI / 2 + Math.sin(T * 3 + i) * 0.05, 0.9 * born, born)
        if (born < 1) spOrb(p.x, p.y, 40, 1 - born)
      }
    } })
    for (let i = 0; i < n; i++) later(hold + i * 0.07, () => {
      fired[i] = true
      const p = slot(i), ts = spInView(), last = i === n - 1
      const t = ts.length ? ts.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[i % ts.length] : null
      const tc = t ? spCenter(t) : null
      const a = tc ? ang(p.x, p.y, tc.x, tc.y) : o.aim + R(-0.15, 0.15)
      spSfx('shot')
      spShot({ x: p.x, y: p.y, a, spd: 2300, life: 0.75, r: last ? 34 : 18, dmg: last ? dmg * 3 : dmg, status: st, pierce: last, cancel: last ? 60 : 30, kb: 200, trail: 6, home: last ? 0 : 3,
        onHit(s, e) { sparks(e.x, e.y, 8, SP_WHITE); if (last) { explode(e.x, e.y, 160, dmg, st); spShake(10 + 2 * tier); spFlash(0.5) } },
        onEnd(s) { spStreaks(s.x, s.y, 6, SP_GOLD, s.a + Math.PI, 0.6, 400) },
        look(s, k) {
          const al = s.done ? 0.5 * (1 - k) : 1
          if (s.trail.length > 1) { const t0 = s.trail[0]; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${SP_GOLD},${0.5 * al})`; ctx.lineWidth = last ? 10 : 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(s.x, s.y); ctx.stroke() }
          drawSword(s.x, s.y, s.a, last ? 1.8 : 1, al)
        } })
    })
  },
}

// ---------------------------------------------------------------- the chant circle
// drawMagicCircle(x, y, r, k, rot): k in 0..1 is how far the circle has drawn itself in
// (rings sweep in, runes fill, then a flare near 1). Additive, procedural, safe every frame.
function drawMagicCircle(x, y, r, k = 1, rot = 0) {
  const a = clamp(k * 2.5, 0, 1), p = clamp(k * 1.6, 0, 1), flare = k > 0.85 ? (k - 0.85) / 0.15 : 0, TAU = Math.PI * 2
  ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15); g.addColorStop(0, `rgba(${SP_WHITE},${0.18 * a + 0.3 * flare})`); g.addColorStop(0.6, `rgba(${SP_GOLD},${0.08 * a})`); g.addColorStop(1, 'rgba(214,36,52,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, TAU); ctx.fill()
  const stroke = (c, al, w) => { ctx.strokeStyle = `rgba(${c},${al})`; ctx.lineWidth = w }
  // outer double ring sweeping in
  ctx.save(); ctx.rotate(rot)
  stroke(SP_GOLD, 0.5 * a, Math.max(2, r * 0.03)); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU * p); ctx.stroke()
  stroke(SP_WHITE, 0.95 * a, Math.max(1, r * 0.008)); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU * p); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, r * 0.94, -TAU * p, 0); ctx.stroke()
  // glyph ticks
  stroke(SP_GOLD, 0.85 * a, Math.max(1, r * 0.006)); ctx.beginPath()
  const nt = 72
  for (let i = 0; i < nt * p; i++) { const t = i / nt * TAU, l = i % 6 === 0 ? 0.84 : 0.89; ctx.moveTo(Math.cos(t) * r * 0.93, Math.sin(t) * r * 0.93); ctx.lineTo(Math.cos(t) * r * l, Math.sin(t) * r * l) }
  ctx.stroke()
  // crimson diamonds at the cardinal points
  ctx.fillStyle = `rgba(${SP_CRIMSON},${0.9 * a})`
  for (let i = 0; i < 4; i++) { const t = i / 4 * TAU, cx = Math.cos(t) * r, cy = Math.sin(t) * r, d = r * 0.04; ctx.beginPath(); ctx.moveTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.lineTo(cx, cy - d); ctx.fill() }
  ctx.restore()
  // rune band, counter-rotating
  const q = clamp((k - 0.2) / 0.5, 0, 1)
  if (q > 0) {
    ctx.save(); ctx.rotate(-rot * 0.6)
    const nr = 24, gs = r * 0.05
    stroke(SP_WHITE, 0.9 * a * q, Math.max(1, r * 0.007))
    for (let i = 0; i < nr * q; i++) {
      const t = i / nr * TAU
      ctx.save(); ctx.rotate(t); ctx.translate(r * 0.78, 0); ctx.rotate(Math.PI / 2)
      ctx.beginPath()
      for (let j = 0; j < 3; j++) { const h0 = spHash(i * 7 + j), h1 = spHash(i * 7 + j + 3), h2 = spHash(i * 13 + j); ctx.moveTo((h0 - 0.5) * gs * 2, (h1 - 0.5) * gs * 2); if (h2 < 0.35) ctx.arc((h0 - 0.5) * gs, (h1 - 0.5) * gs, gs * 0.45, 0, Math.PI * (1 + h2)); else ctx.lineTo((h2 - 0.5) * gs * 2, (spHash(i + j * 31) - 0.5) * gs * 2) }
      ctx.stroke(); ctx.restore()
    }
    stroke(SP_CRIMSON, 0.8 * a * q, Math.max(1, r * 0.008)); ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.stroke()
    stroke(SP_GOLD, 0.8 * a * q, Math.max(1, r * 0.01)); ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, TAU); ctx.stroke()
    ctx.restore()
  }
  // hexagram and its six small circles
  const s = clamp((k - 0.35) / 0.45, 0, 1)
  if (s > 0) {
    ctx.save(); ctx.rotate(rot * 1.4)
    stroke(SP_WHITE, 0.9 * a * s, Math.max(1.2, r * 0.01))
    for (let tri = 0; tri < 2; tri++) { ctx.beginPath(); for (let i = 0; i <= 3; i++) { const t = (i / 3) * TAU + tri * Math.PI / 3 - Math.PI / 2; const px = Math.cos(t) * r * 0.66, py = Math.sin(t) * r * 0.66; i ? ctx.lineTo(lerp(0, px, 1), lerp(0, py, 1)) : ctx.moveTo(px, py) } ctx.globalAlpha = s; ctx.stroke(); ctx.globalAlpha = 1 }
    stroke(SP_GOLD, 0.9 * a * s, Math.max(1, r * 0.008))
    for (let i = 0; i < 6; i++) { const t = i / 6 * TAU - Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(t) * r * 0.66, Math.sin(t) * r * 0.66, r * 0.065, 0, TAU); ctx.stroke() }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.33, 0, TAU); ctx.stroke()
    ctx.restore()
  }
  // eight-pointed star and white-hot core
  const c = clamp((k - 0.55) / 0.3, 0, 1)
  if (c > 0) {
    ctx.save(); ctx.rotate(-rot * 2)
    ctx.fillStyle = `rgba(${SP_WHITE},${0.85 * a * c})`
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); const L = (i % 2 ? 0.18 : 0.3) * r; ctx.beginPath(); ctx.moveTo(0, -r * 0.02); ctx.lineTo(L, 0); ctx.lineTo(0, r * 0.02); ctx.fill() }
    ctx.restore()
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.2); cg.addColorStop(0, `rgba(${SP_WHITE},${a * c})`); cg.addColorStop(1, 'rgba(255,206,110,0)')
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill()
  }
  if (flare > 0) { stroke(SP_WHITE, flare * (1 - flare * 0.5), r * 0.02); ctx.beginPath(); ctx.arc(0, 0, r * (1 + flare * 0.15), 0, TAU); ctx.stroke() }
  ctx.restore()
}

// ================================================================ the big three: light storm, pillar wall, held beam
// Gold, white light and rose pink only. Every layer is a cached glow or band texture stretched
// with drawImage, plus noise-edged paths; PERF.low drops the shimmer, the rain and most motes.
// Each spell reads o.lv (1-3, the run's upgrade level) and grows clearly bigger with it.
const SP_ROSE = '255,150,190'
const SP_TAU = Math.PI * 2
const spLow = () => typeof PERF !== 'undefined' && !!PERF.low
const spLv = o => clamp(Math.round(o.lv || 1), 1, 3)
function spN(x) { const i = Math.floor(x), f = x - i; return lerp(spHash(i), spHash(i + 1), f * f * (3 - 2 * f)) }
function spF(x) { return spN(x) * 0.62 + spN(x * 2.7 + 31.3) * 0.38 }
const SPT = {}
function spTex(key, w, h, paint) { if (!SPT[key]) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); SPT[key] = c } return SPT[key] }
const SP_STOPS = {
  warm: [[0, '255,252,242', 1], [0.16, '255,238,196', 0.85], [0.42, '255,200,120', 0.34], [0.7, '255,140,185', 0.12], [1, '255,140,185', 0]],
  rose: [[0, '255,214,228', 0.9], [0.4, '255,140,185', 0.35], [1, '255,140,185', 0]],
  white: [[0, '255,255,250', 1], [0.45, '255,248,230', 0.55], [1, '255,240,210', 0]],
  ink: [[0, '44,12,24', 0.8], [0.55, '44,12,24', 0.4], [1, '44,12,24', 0]],
  gold: [[0, '255,214,130', 0.85], [0.35, '255,170,110', 0.45], [0.7, '250,120,165', 0.16], [1, '250,120,165', 0]],
}
function spGlowT(kind = 'warm') { return spTex('g-' + kind, 128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [p, c, a] of SP_STOPS[kind]) r.addColorStop(p, `rgba(${c},${a})`); g.fillStyle = r; g.fillRect(0, 0, w, w) }) }
// a soft band whose profile runs across y ('y': 2x128, for beams) or across x ('x': 128x2, for columns)
function spBandT(kind, axis) {
  return spTex('b-' + kind + axis, axis === 'y' ? 2 : 128, axis === 'y' ? 128 : 2, (g, w, h) => {
    const gr = axis === 'y' ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0)
    for (const [p, c, a] of SP_STOPS[kind]) { gr.addColorStop(0.5 - p * 0.5, `rgba(${c},${a})`); gr.addColorStop(0.5 + p * 0.5, `rgba(${c},${a})`) }
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  })
}
function spGlowAt(x, y, rx, ry, a, kind = 'warm') {
  if (a <= 0.01) return
  ctx.globalCompositeOperation = kind === 'ink' ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, a)
  ctx.drawImage(spGlowT(kind), x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = 1
}
// glow passes for a bolt: rose halo, gold body, white-hot core
function spGlow2(pts, w, a) {
  ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(${SP_ROSE},${a * 0.28})`; ctx.lineWidth = w * 6; spLine(pts)
  ctx.strokeStyle = `rgba(${SP_GOLD},${a * 0.6})`; ctx.lineWidth = w * 2.6; spLine(pts)
  ctx.strokeStyle = `rgba(${SP_WHITE},${a})`; ctx.lineWidth = w; spLine(pts)
}
// things drawn on the floor behind her: an fx entry with behind() is drawn just before her sprite
{
  const _ds = drawSprite
  drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1) {
    if (typeof P !== 'undefined' && hero === P.hero && x === P.x && y === P.y && alpha >= 0.5 && (mode === 'play' || mode === 'boon'))
      for (const f of fx) if (f.behind) { ctx.save(); try { f.behind(f.t / f.dur) } catch (_) { } ctx.restore() }
    return _ds.apply(this, arguments)
  }
}

// one lightning strike: a column of light, a jagged forked bolt that re-forms while it lives,
// a flash where it leaves the cloud, a flash and a ring where it lands
function spBoltFx(x, gy, top, opt = {}) {
  const w = opt.w || 1, forks = opt.forks ?? 3, branch = opt.branch || 0, x0 = x + R(-70, 70)
  const make = () => {
    const b = spBoltShape(x0 + R(-20, 20), top, x, gy, 0.11, forks)
    if (branch) { const more = []; for (const f of b.forks) for (let i = 0; i < branch; i++) { const p = f[(R(0.3, 0.9) * f.length) | 0], s = Math.random() < 0.5 ? -1 : 1, l = R(30, 90) * w, a = R(0.3, 1.2); more.push(spJag(p[0], p[1], p[0] + s * Math.cos(a) * l, p[1] + Math.sin(a) * l, 0.3, 2)) } b.forks.push(...more) }
    return b
  }
  let b = make(), re = 0
  const f = { t: 0, dur: opt.life || 0.34, update(dt) { if ((re -= dt) <= 0 && this.t < this.dur * 0.55) { re = 0.045; b = make() } }, draw(k) {
    const a = (k < 0.1 ? 1 : Math.pow(1 - (k - 0.1) / 0.9, 1.3)) * (k < 0.5 ? 0.78 + 0.22 * Math.random() : 1)
    const cw = 80 * w * (1 - k * 0.5)
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 * a
    ctx.drawImage(spBandT('warm', 'x'), x - cw, top, cw * 2, gy - top); ctx.globalAlpha = 1
    if (opt.art) spStripRot(opt.art, k, x, (top + gy) / 2 + 80, 0, Math.max(0.6, (gy - top) / 768) * w * 0.9, a)
    spGlow2(b.main, 4.2 * w, a); for (const fk of b.forks) spGlow2(fk, 2 * w, a * 0.8)
    spGlowAt(x0, top + 20, 150 * w, 60 * w, a * 0.8)
    spGlowAt(x, gy - 8, 170 * w * (1 - k * 0.3), 60 * w, a * 0.85)
    spGlowAt(x, gy - 40 * w, 55 * w, 100 * w, a * 0.4, 'white')
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${SP_GOLD},${a})`; ctx.lineWidth = 4 * w * (1 - k)
    ctx.beginPath(); ctx.ellipse(x, gy - 4, 30 + 190 * w * k, 8 + 30 * w * k, 0, 0, SP_TAU); ctx.stroke()
  } }
  fx.push(f); return f
}

// ---------------------------------------------------------------- 1. light storm (storm_field)
// A rune circle opens on the floor under her and a gold-lit cloud gathers overhead; for about
// 4.5-5.7 s bolts strike all around her at staggered spots and times, and anything inside the
// circle of the storm is struck again every ~0.36 s. Level 2: wider, branching forks, double
// strikes and a closing great strike. Level 3: wider again, a halo around her, a flash with
// strikes, and a charged field that lingers after.
SPELLS.storm_field = function (spell, o) {
  const lv = spLv(o), low = spLow(), status = spSt(spell, 'shock'), pow = spPow(o)
  const Rz = 330 + 60 * lv, dur = 3.9 + 0.6 * lv, every = [0, 0.16, 0.12, 0.085][lv] * (low ? 1.35 : 1), rc = [0, 150, 195, 240][lv]
  const z = { x: P.x, y: P.y }, last = new Map()
  const np = 9 + lv * 2, puffs = Array.from({ length: np }, (_, i) => ({ o: (i / (np - 1) - 0.5) * (Rz * 2 + 280), y: R(-26, 26), r: R(90, 150), p: R(0, 6.28) }))
  spFlash(0.3 + 0.12 * lv); spShake(5 + 2 * lv); spSfx('zap'); dim = Math.max(dim, 0.6 + 0.3 * lv)
  let sfxN = 0
  const strike = (x, gy, big) => {
    const w = (0.8 + 0.18 * lv) * (big ? 1.9 : 1), r = (50 + 8 * lv) * (big ? 2.2 : 1)
    for (const e of targets()) { const c = spCenter(e); if (Math.abs(c.x - x) < r + c.r && c.y < gy + 40) { damage(e, (big ? 18 : 4.2) * pow, { x: c.x, y: c.y, status, small: !big }); last.set(e, T) } }
    for (let y = gy; y > (cam.y || 0); y -= 120) cancelBullets(x, y, r + 24)
    spBoltFx(x, gy, (cam.y || 0) + 30, { w, forks: 1 + lv + (big ? 3 : 0), branch: lv >= 2 ? lv - 1 : 0, life: big ? 0.5 : 0.34, art: !big && Math.random() < 0.3 && spArt(spell, 'bolt-strike') ? 'bolt-strike' : null })
    sparks(x, gy - 6, low ? 4 : 8, SP_WHITE); if (!low) spStreaks(x, gy - 4, 6 + 2 * lv, SP_GOLD, -Math.PI / 2, 1.2, 650)
    spShake(big ? 16 : 2 + lv); if (big || (sfxN++ & 1)) spSfx('zap')
    if (lv >= 3 && (big || Math.random() < 0.2)) spFlash(big ? 0.6 : 0.1, '255,236,220')
    if (big) { explode(x, gy - 40, 190, 8 * pow, status); ring(x, gy - 40, 260, SP_GOLD); stopT = Math.max(stopT, 0.05) }
  }
  const free = () => { let x = z.x + R(-Rz, Rz); if (Math.abs(x - P.x) < 70) x = P.x + (x < P.x ? -1 : 1) * R(90, 160); return x }
  const floor = x => spGround(x, z.y - 60)
  const end = () => {
    if (lv >= 2) {
      const t = targets().filter(e => !e.dead && Math.abs(e.x - z.x) < Rz + 60).sort((a, b) => (b === B) - (a === B) || b.hp - a.hp)[0]
      const x = t ? spCenter(t).x : z.x + (o.dir || 1) * Rz * 0.5
      strike(x, floor(x), true)
    }
    if (lv >= 3) {   // the charged field stays behind for a while
      const gy = spGround(z.x, z.y - 40), cx = z.x, n = low ? 3 : 5
      for (let i = 0; i < n; i++) patches.push({ kind: 'shock', x: cx - Rz + (i + 0.5) * (Rz * 2 / n), y: gy - 20, t: 2.8, max: 2.8 })
      let re = 0, arcs = []
      fx.push({ t: 0, dur: 2.8, update(dt) { if ((re -= dt) > 0) return; re = 0.07; arcs = []; for (let i = 0; i < (low ? 2 : 5); i++) { const x = cx + R(-Rz, Rz); arcs.push(spJag(x, gy - 4, x + R(-120, 120), gy - R(4, 40), 0.35, 3)) } }, draw(k) {
        const a = (1 - k) * 0.9
        spGlowAt(cx, gy, Rz, 26, 0.35 * a)
        for (const p of arcs) spGlow2(p, 1.6, a)
      } })
    }
  }
  fx.push({ t: 0, dur: dur + 0.6, next: 0.22, ended: false,
    update(dt) {
      z.x += (P.x - z.x) * Math.min(1, dt * 4); z.y += (P.y - z.y) * Math.min(1, dt * 4)
      if (this.t > dur) { if (!this.ended) { this.ended = true; end() } return }
      if ((this.next -= dt) > 0) return
      this.next = every * R(0.55, 1.45)
      const due = targets().filter(e => !e.dead && Math.abs(e.x - z.x) < Rz && T - (last.get(e) ?? -9) > 0.36)
      if (due.length) { const c = spCenter(due[(Math.random() * due.length) | 0]); strike(c.x + R(-14, 14), spGround(c.x, c.y - 30)) }
      else { const x = free(); strike(x, floor(x)) }
      if (!low && lv >= 2 && Math.random() < 0.22 * lv) later(R(0.02, 0.08), () => { if (this.t < dur) { const x = free(); strike(x, floor(x)) } })
    },
    draw(k) {
      const a = Math.min(1, this.t * 4) * (this.t > dur ? Math.max(0, 1 - (this.t - dur) / 0.6) : 1)
      const gy = spGround(z.x, z.y - 40), cy = (cam.y || 0) + 40
      // the cloud: dark puffs, lit gold and rose from below where the bolts leave it
      for (const p of puffs) { const r = p.r * (1 + 0.05 * Math.sin(T * 1.5 + p.p)); spGlowAt(z.x + p.o, cy + p.y, r, r * 0.6, 0.85 * a, 'ink') }
      for (const p of puffs) if (Math.random() < 0.08) spGlowAt(z.x + p.o, cy + p.y + 20, p.r * 1.1, p.r * 0.6, 0.5 * a)
      spGlowAt(z.x, cy + 46, Rz + 170, 46, 0.3 * a, 'rose')
      // the floor of the storm and its turning edge
      spGlowAt(z.x, gy, Rz * 1.05, 30 + 4 * lv, 0.42 * a)
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(${SP_ROSE},${0.55 * a})`; ctx.lineWidth = 2; ctx.setLineDash([22, 14]); ctx.lineDashOffset = -T * 80
      ctx.beginPath(); ctx.ellipse(z.x, gy - 3, Rz, 20 + 2 * lv, 0, 0, SP_TAU); ctx.stroke(); ctx.setLineDash([])
      if (!low) {   // fine gold rain
        ctx.strokeStyle = `rgba(${SP_WHITE},${0.3 * a})`; ctx.lineWidth = 1.5; ctx.beginPath()
        for (let i = 0; i < 18 + 10 * lv; i++) { const x = z.x - Rz + spHash(i) * Rz * 2, y = ((spHash(i + 50) * 600 + T * 900) % 600) + gy - 620; ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 34) }
        ctx.stroke()
      }
      if (lv >= 3) {   // a halo of light rings turning around her
        for (let i = 0; i < 3; i++) { const q = (T * 0.7 + i / 3) % 1; ctx.strokeStyle = `rgba(${i === 1 ? SP_ROSE : SP_GOLD},${0.5 * a * Math.sin(q * Math.PI)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(P.x, P.y - 20 - q * 150, 70 + 20 * Math.sin(q * Math.PI), 16, 0, 0, SP_TAU); ctx.stroke() }
      }
    },
    behind() {   // the rune circle flat on the floor under her
      const a = Math.min(1, this.t * 3) * (this.t > dur ? Math.max(0, 1 - (this.t - dur) / 0.6) : 1); if (a <= 0) return
      const gy = spGround(P.x, P.y - 4)
      spGlowAt(P.x, gy, rc * 1.5, rc * 0.36, 0.5 * a)
      ctx.translate(P.x, gy); ctx.scale(1, 0.26); ctx.globalAlpha = a
      drawMagicCircle(0, 0, rc, Math.min(0.84, this.t / 0.6), T * 0.7)
      if (lv >= 2) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${SP_ROSE},${0.7 * a})`; ctx.lineWidth = 3; ctx.setLineDash([8, 10]); ctx.lineDashOffset = T * 40; ctx.beginPath(); ctx.arc(0, 0, rc * 1.32, 0, SP_TAU); ctx.stroke(); ctx.setLineDash([]) }
      if (lv >= 3) { ctx.strokeStyle = `rgba(${SP_GOLD},${0.8 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, rc * 1.5, 0, SP_TAU); ctx.stroke() }
    } })
}

// ---------------------------------------------------------------- 2. pillar wall (pillar_wall)
// A row of tall pillars of flame-like holy light erupts along the floor ahead of her, one after
// another. They hold ~3.3-3.8 s, flickering, with a heat shimmer over them, burn and push back
// whatever stands in them and burn away bullets, then die out into drifting embers.
// Level 2: more and taller pillars, then a second wave rising between them from the far end.
// Level 3: taller still, and before they die every pillar flares into a crown burst.
function spEase(q) { const c = 1.70158; q -= 1; return 1 + q * q * ((c + 1) * q + c) }
function spFlameCol(x, gy, h, w, seed, a, m) {
  if (h < 4 || a <= 0.01) return
  for (const [ws, col, al, ph, paint] of [[1, '232,104,150', 0.7, 0, 1], [0.66, '255,184,86', 0.78, 13, 1], [0.4, '255,226,150', 0.5, 21, 0], [0.2, SP_WHITE, 0.8, 27, 0]]) {
    ctx.globalCompositeOperation = paint ? 'source-over' : 'lighter'
    const ww = w * ws, g = ctx.createLinearGradient(0, gy, 0, gy - h)
    g.addColorStop(0, `rgba(${col},${al * a})`); g.addColorStop(0.55, `rgba(${col},${al * a * 0.75})`); g.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = g; ctx.beginPath()
    for (let j = 0; j <= m; j++) { const u = j / m, sw = (spF(u * 2.2 - T * 2.1 + seed) - 0.5) * 34 * u, hw = ww * (1 - Math.pow(u, 2.2)) * (0.72 + 0.56 * spF(u * 5 - T * 6.5 + seed + ph)); j ? ctx.lineTo(x + sw - hw, gy - h * u) : ctx.moveTo(x + sw - hw, gy) }
    for (let j = m; j >= 0; j--) { const u = j / m, sw = (spF(u * 2.2 - T * 2.1 + seed) - 0.5) * 34 * u, hw = ww * (1 - Math.pow(u, 2.2)) * (0.72 + 0.56 * spF(u * 5 - T * 6.5 + seed + ph + 50)); ctx.lineTo(x + sw + hw, gy - h * u) }
    ctx.closePath(); ctx.fill()
  }
}
SPELLS.pillar_wall = function (spell, o) {
  const lv = spLv(o), low = spLow(), status = spSt(spell, 'burn'), pow = spPow(o), dir = o.dir || 1
  const n = [0, 7, 9, 11][lv] - (low ? 2 : 0), gap = low ? 120 : 98, H0 = [0, 290, 370, 460][lv], W0 = [0, 40, 46, 54][lv], hold = 3.0 + 0.25 * lv
  const ps = []
  const add = (x, born, hm, die) => { const g = groundAt(x, P.y - 60); if (!isFinite(g)) return; ps.push({ x, gy: g, born, die, h: H0 * hm * R(0.88, 1.08), w: W0 * R(0.9, 1.1), s: R(0, 100), out: false }) }
  for (let i = 0; i < n; i++) add(P.x + dir * (120 + i * gap), 0.05 + i * 0.055, 1, hold + i * 0.045)
  if (lv >= 2) for (let i = n - 2; i >= 0; i--) add(P.x + dir * (120 + gap / 2 + i * gap), 1.0 + (n - 2 - i) * 0.05, 0.8, hold + 0.1 + i * 0.045)
  if (!ps.length) return
  const crownAt = hold - 0.2, mid = ps.reduce((s, p) => s + p.x, 0) / ps.length, span = Math.abs(ps[0].x - mid) + gap
  spShake(6 + 2 * lv); spSfx('boom'); spFlash(0.25 + 0.1 * lv, '255,226,200')
  const life = (p, t, crown) => {
    const g = clamp((t - p.born) / 0.2, 0, 1); if (g <= 0) return null
    const d = clamp((t - p.die) / 0.55, 0, 1)
    const fl = 0.93 + 0.07 * Math.sin(T * 13 + p.s) + (crown > 0 ? 0.3 * crown : 0)
    return { g, d, h: p.h * spEase(g) * (1 - d * 0.85) * fl, w: p.w * (0.6 + 0.4 * g) * (1 - d * 0.6), a: 1 - d }
  }
  const crownK = t => (lv >= 3 && t > crownAt && t < crownAt + 0.7 ? Math.sin((t - crownAt) / 0.7 * Math.PI) : 0)
  fx.push({ t: 0, dur: hold + 0.75 + ps.length * 0.05, tick: 0, crowned: false,
    update(dt) {
      const t = this.t, ck = crownK(t)
      for (const p of ps) {
        const q = life(p, t, ck); if (!q) continue
        if (!p.up) { p.up = true; if (!low) spStreaks(p.x, p.gy - 6, 6, SP_WHITE, -Math.PI / 2, 0.5, 900); sparks(p.x, p.gy - 4, low ? 3 : 6, SP_GOLD) }
        if (q.d < 1) { cancelBullets(p.x, p.gy - q.h * 0.3, q.w + 22); cancelBullets(p.x, p.gy - q.h * 0.72, q.w + 16) }
        if (q.d < 1 && Math.random() < (low ? 0.06 : 0.22)) parts.push({ x: p.x + R(-q.w, q.w) * 0.6, y: p.gy - R(0, q.h * 0.7), vx: R(-30, 30), vy: R(-340, -140), life: R(0.4, 0.8), t: 0, size: R(2, 4.5), color: Math.random() < 0.5 ? SP_GOLD : SP_ROSE, add: true })
        if (q.d > 0 && !p.out) { p.out = true; for (let i = 0; i < (low ? 4 : 12); i++) parts.push({ x: p.x + R(-p.w, p.w) * 0.6, y: p.gy - R(10, p.h * 0.8), vx: R(-50, 50), vy: R(-120, -30), life: R(0.9, 1.8), t: 0, size: R(1.5, 3.5), color: i % 3 ? SP_GOLD : SP_ROSE, add: true, g: -20 }) }
      }
      if ((this.tick -= dt) <= 0) {
        this.tick = 0.2
        const hitNow = new Set()
        for (const p of ps) { const q = life(p, t, ck); if (!q || q.d >= 0.6 || q.h < 40) continue
          for (const e of targets()) { if (hitNow.has(e)) continue; const c = spCenter(e); if (Math.abs(c.x - p.x) < q.w * 0.9 + c.r && c.y > p.gy - q.h - c.r && c.y < p.gy + 30) { hitNow.add(e); damage(e, 3.2 * pow, { x: c.x, y: c.y, status, small: true, kb: dir * 160 }) } } }
      }
      if (lv >= 3 && !this.crowned && t > crownAt + 0.2) {   // the crown burst
        this.crowned = true
        spFlash(0.8, '255,240,225'); spShake(18); stopT = Math.max(stopT, 0.06); spSfx('boom'); spSfx('glare')
        for (const e of targets()) { const c = spCenter(e); if (Math.abs(c.x - mid) < span + 40 && c.y > ps[0].gy - H0 * 1.4) damage(e, 22 * pow, { x: c.x, y: c.y, status, launch: -420 }) }
        cancelBullets(mid, ps[0].gy - H0 * 0.6, span + 120)
        for (const x of [mid - span * 0.6, mid, mid + span * 0.6]) explode(x, groundAt(x, P.y - 60) - 60 || GROUND - 60, 130, 0, status)
        if (!low) spEmbers(mid, ps[0].gy - H0 * 1.1, 40, SP_GOLD, 700, 300)
      }
    },
    draw(k) {
      const t = this.t, ck = crownK(t), m = low ? 8 : 13
      const lives = ps.map(p => life(p, t, ck))
      // heat shimmer: copy the band behind the wall once, then lay it back in wavy strips
      if (!low) {
        let hmax = 0; for (const q of lives) if (q && q.d < 1) hmax = Math.max(hmax, q.h)
        if (hmax > 60) {
          const gy = ps[0].gy, xs = ps.map(p => p.x), m2 = ctx.getTransform(), cv = ctx.canvas
          const X0 = clamp(m2.a * (Math.min(...xs) - 70) + m2.e, 0, cv.width), X1 = clamp(m2.a * (Math.max(...xs) + 70) + m2.e, 0, cv.width)
          const Y0 = clamp(m2.d * (gy - hmax * 1.15) + m2.f, 0, cv.height), Y1 = clamp(m2.d * (gy - 10) + m2.f, 0, cv.height)
          const cw = X1 - X0 | 0, chh = Y1 - Y0 | 0
          if (cw > 8 && chh > 8) {
            const buf = spTex('shim', cv.width, cv.height, () => { }), bg = buf.getContext('2d')
            bg.clearRect(0, 0, cw, chh); bg.drawImage(cv, X0, Y0, cw, chh, 0, 0, cw, chh)
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.85 * Math.min(1, t * 3) * (1 - clamp((t - hold) / 0.6, 0, 1))
            for (let y = 0; y < chh; y += 8) { const off = Math.sin(y * 0.09 + T * 14) * 3 * (1 - y / chh * 0.6); ctx.drawImage(buf, 0, y, cw, 8, X0 + off, Y0 + y, cw, 8) }
            ctx.restore()
          }
        }
      }
      ps.forEach((p, i) => {
        const q = lives[i]; if (!q || q.a <= 0) return
        spGlowAt(p.x, p.gy - q.h * 0.42, q.w * 1.9, q.h * 0.58, 0.42 * q.a, 'ink')   // a dark backing so the light reads on bright skies
        spGlowAt(p.x, p.gy - 4, q.w * 2.6, 26, 0.7 * q.a)
        if (q.g < 1) spGlowAt(p.x, p.gy - 30, 110, 110, 0.8 * (1 - q.g), 'white')   // the eruption flash
        if (!low) spGlowAt(p.x, p.gy - q.h * 0.45, q.w * 2.2, q.h * 0.6, 0.14 * q.a, 'rose')
        spFlameCol(p.x, p.gy, q.h, q.w, p.s, q.a, m)
        spGlowAt(p.x, p.gy - q.h * 0.82, q.w * 1.1, q.w * 1.5, 0.3 * q.a, 'white')
        if (ck > 0) { spGlowAt(p.x, p.gy - q.h, 60 + 60 * ck, 60 + 60 * ck, ck); ctx.fillStyle = `rgba(${SP_WHITE},${ck})`; ctx.save(); ctx.translate(p.x, p.gy - q.h); for (let j = 0; j < 4; j++) { ctx.rotate(Math.PI / 4 + (j ? Math.PI / 4 : 0)); const L = (j % 2 ? 40 : 90) * ck; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(L, 0); ctx.lineTo(0, 3); ctx.lineTo(-L, 0); ctx.fill() } ctx.restore() }
      })
      if (ck > 0) {   // a crown of light over the middle of the wall
        const cy = ps[0].gy - H0 * 1.35, s = 0.6 + 0.4 * ck
        spGlowAt(mid, cy, span * 0.9, 160 * s, 0.6 * ck)
        ctx.save(); ctx.translate(mid, cy); ctx.scale(s, s); ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = `rgba(${SP_WHITE},${ck})`; ctx.strokeStyle = `rgba(${SP_GOLD},${ck})`; ctx.lineWidth = 4
        ctx.beginPath(); ctx.moveTo(-170, 40); for (let j = 0; j <= 6; j++) { const x = -170 + j * (340 / 6), up = j % 2 ? -40 : -110 + Math.abs(j - 3) * 18; ctx.lineTo(x, up) } ctx.lineTo(170, 40); ctx.quadraticCurveTo(0, 62, -170, 40); ctx.closePath()
        ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke()
        for (let j = 0; j <= 6; j += 2) spGlowAt(-170 + j * (340 / 6), -110 + Math.abs(j - 3) * 18, 30, 30, ck, 'white')
        ctx.restore()
      }
    } })
}

// ---------------------------------------------------------------- 3. held beam (sun_beam, and the Sun Lance move)
// A thick beam from her hand along her aim, held for as long as the key is held (min to max s).
// It turns with her aim (arrows or mouse, so it goes diagonal), stops on floors and walls, and
// burns along its length. Layers, back to front: a dark ink band for contrast, a wide soft
// cone of glow, a ragged rose body and a ragged gold body whose edges churn along the length,
// lit edge lines, swirling strands, a blinding white core, the muzzle burst at her hand and the
// impact splash where it lands. Level 2 adds travelling swirl rings and a muzzle rune circle;
// level 3 adds two side rays that sweep beside it and a bigger impact bloom.
function spClip(x0, y0, a, L) {
  if (typeof FOE !== 'undefined' && FOE.clip) { try { const c = FOE.clip(x0, y0, a, L); if (c && isFinite(c.len)) return c } catch (_) { } }
  const c = Math.cos(a), s = Math.sin(a)
  for (let d = 30; d < L; d += 30) { const x = x0 + c * d, y = y0 + s * d; if (s > 0.02 && y >= spGround(x, y - 30)) return { x, y, len: d, hit: true } }
  return { x: x0 + c * L, y: y0 + s * L, len: L, hit: false }
}
// while the chanted ray is held she has super armour: hits hurt but don't break the beam
let SP_ARMOR = -1
{
  const _hurt = hurtPlayer
  hurtPlayer = function () { const keep = SP_ARMOR > T && P.act, r = _hurt.apply(this, arguments); if (keep && !P.dead) { P.act = keep; P.hurtT = 0 } return r }
}
function spRay(o) {
  const lv = clamp(o.lv || 1, 1, 3), Rb = [0, 34, 46, 58][lv] * (o.scale || 1), sd = R(0, 100)
  const side = lv >= 3 ? [{ d: 1 }, { d: -1 }] : []
  const st = { t: 0, dur: o.max + 0.8, a: P.aim, len: 0, end: null, tick: 0, ign: 0.22, stopAt: null, scorch: 0,
    stop() { if (this.stopAt === null) { this.stopAt = this.t; this.dur = this.t + 0.4 } },
    update(dt) {
      const h = handPos(), live = this.t - this.ign
      if (this.stopAt === null) {
        const own = !o.act || (P.act && P.act.name === o.act)
        SP_ARMOR = o.armor ? T + 0.1 : SP_ARMOR
        if (!own || P.dead || (P.hurtT > 0 && !o.armor) || live >= o.max || (live >= o.min && !o.held())) this.stop()
        else if (P.act && P.act.name === o.act) P.act.t = Math.min(P.act.t, o.pin ?? 0.62)
      }
      const d = Math.atan2(Math.sin(P.aim - this.a), Math.cos(P.aim - this.a)); this.a += clamp(d, -2.2 * dt, 2.2 * dt)
      this.end = spClip(h.x, h.y, this.a, 1800); this.len = this.end.len
      for (const s of side) { s.a = this.a + s.d * (0.2 + 0.07 * Math.sin(T * 2.3 + s.d)); s.end = spClip(h.x, h.y, s.a, 1500) }
      if (live < 0 || this.stopAt !== null) return
      const x1 = this.end.x, y1 = this.end.y, R0 = Rb * 0.95
      spCancelSeg(h.x, h.y, x1, y1, R0 + 10)
      for (const s of side) spCancelSeg(h.x, h.y, s.end.x, s.end.y, Rb * 0.5)
      if ((this.tick -= dt) <= 0) {
        this.tick = 0.08
        for (const e of targets()) {
          let on = spOnSeg(e, h.x, h.y, x1, y1, R0), mul = 1
          if (!on) for (const s of side) if (spOnSeg(e, h.x, h.y, s.end.x, s.end.y, Rb * 0.45)) { on = true; mul = 0.5 }
          if (!on) continue
          const c = spCenter(e)
          damage(e, o.dmg * mul, { x: c.x, y: c.y, status: o.status, small: true, kb: Math.cos(this.a) * 70 })
          e.charredHits = (e.charredHits || 0) + 1; if (e.charredHits > 8) applyStatus(e, 'char')
        }
        for (const p of plats) if (p.hp && !p.broken && segDist(p.x + p.w / 2, p.y + p.h / 2, h.x, h.y, x1, y1) < R0 + Math.min(p.w, p.h) / 2) hurtPlat(p, 6)
        spShake(2 + lv)
      }
      // spray and scorch at the impact, motes off the muzzle
      const low = spLow()
      if (!low || Math.random() < 0.4) { spStreaks(x1, y1, 2, Math.random() < 0.5 ? SP_WHITE : SP_GOLD, this.a + Math.PI, 1.1, 800); if (Math.random() < 0.5) parts.push({ x: x1, y: y1, vx: R(-120, 120), vy: R(-260, -60), life: R(0.5, 1), t: 0, size: R(2, 4), color: SP_ROSE, add: true, g: 200 }) }
      if (!low && Math.random() < 0.35) parts.push({ x: h.x + R(-10, 10), y: h.y + R(-10, 10), vx: Math.cos(this.a + R(-1, 1)) * R(60, 200), vy: Math.sin(this.a + R(-1, 1)) * R(60, 200) - 40, life: 0.4, t: 0, size: R(1.5, 3), color: SP_WHITE, add: true })
    },
    draw(k) {
      const h = handPos(), t = this.t, low = spLow()
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(this.a)
      if (t < this.ign) {   // the charge: light gathers at her hand
        const q = t / this.ign
        spGlowAt(0, 0, Rb * (1 + 2.2 * q), Rb * (1 + 2.2 * q), 0.4 + 0.6 * q)
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${SP_GOLD},${q})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, Rb * 3 * (1 - q) + 8, 0, SP_TAU); ctx.stroke()
        ctx.restore(); return
      }
      const off = this.stopAt !== null ? clamp(1 - (t - this.stopAt) / 0.4, 0, 1) : 1
      const q = (t - this.ign) / 0.16, wf = (q < 1 ? 0.3 + q : 1 + 0.32 * Math.exp(-(q - 1) * 2.5)) * (0.25 + 0.75 * off) * (1 + 0.05 * Math.sin(T * 47))
      const Rr = Rb * wf, L = this.len * Math.min(1, 0.25 + q * 0.75), stp = low ? 44 : 26
      // ink for contrast against bright skies
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.5 * off; ctx.drawImage(spBandT('ink', 'y'), 0, -Rr * 2.3, L, Rr * 4.6); ctx.globalAlpha = 1
      // the soft cone, widening away from her
      ctx.globalCompositeOperation = 'lighter'
      const ns = low ? 3 : 6
      for (let i = 0; i < ns; i++) { const hh = Rr * (2.2 + 1.8 * (i + 0.5) / ns); ctx.globalAlpha = 0.3 * off; ctx.drawImage(spBandT('gold', 'y'), L * i / ns, -hh, L / ns + 1, hh * 2) }
      ctx.globalAlpha = 1
      // ragged bodies: rose, then gold; the edges churn along the length
      const body = (rs, ph, col, al, edge, paint) => {
        ctx.globalCompositeOperation = paint ? 'source-over' : 'lighter'
        const taper = x => Math.min(1, 0.5 + x / 160) * (x > L - 60 ? 0.6 + 0.4 * (L - x) / 60 : 1)
        ctx.beginPath()
        for (let x = 0; x <= L; x += stp) ctx.lineTo(x, -Rr * rs * taper(x) * (0.78 + 0.5 * spF(x * 0.011 - T * 7.5 + sd + ph)))
        ctx.lineTo(L, 0)
        for (let x = L - (L % stp); x >= 0; x -= stp) ctx.lineTo(x, Rr * rs * taper(x) * (0.78 + 0.5 * spF(x * 0.011 - T * 8.3 + sd + ph + 40)))
        ctx.closePath(); ctx.fillStyle = `rgba(${col},${al * off})`; ctx.fill()
        if (edge) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,232,210,${0.55 * off})`; ctx.lineWidth = 2.5; ctx.stroke() }
      }
      body(1.05, 0, '232,104,150', 0.72, true, true)
      body(0.72, 17, '255,184,86', 0.82, true, true)
      body(0.46, 33, '255,226,150', 0.5, false, false)
      ctx.globalCompositeOperation = 'lighter'
      // swirling strands
      ctx.lineCap = 'round'
      for (let s = 0; s < (low ? 2 : lv + 2); s++) {
        ctx.strokeStyle = `rgba(${s % 2 ? SP_WHITE : '255,226,170'},${0.42 * off})`; ctx.lineWidth = 2.5; ctx.beginPath()
        for (let x = 0; x <= L; x += stp) { const y = Math.sin(x * 0.02 - T * 24 + s * 2.1) * Rr * 0.58 * (0.55 + 0.45 * spN(x * 0.01 + s * 7 - T * 3)) * Math.min(1, x / 90); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
        ctx.stroke()
      }
      if (lv >= 2) {   // rings of light travelling out along it
        for (let x = (T * 1500) % 230; x < L - 40; x += 230) { const f = Math.min(1, x / 200) * off; ctx.strokeStyle = `rgba(${SP_GOLD},${0.55 * f})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, 0, Rr * 0.26, Rr * 1.2, 0, 0, SP_TAU); ctx.stroke(); ctx.strokeStyle = `rgba(${SP_WHITE},${0.7 * f})`; ctx.lineWidth = 1.5; ctx.stroke() }
      }
      // the white-hot core
      ctx.globalAlpha = 0.9 * off; ctx.drawImage(spBandT('white', 'y'), 0, -Rr * 0.42, L, Rr * 0.84); ctx.globalAlpha = 1
      ctx.fillStyle = `rgba(255,255,250,${0.95 * off})`; ctx.fillRect(0, -Rr * (0.09 + 0.02 * Math.sin(T * 60)), L, Rr * (0.18 + 0.04 * Math.sin(T * 60)))
      // the muzzle burst, kept off her body
      spGlowAt(Rr * 0.4, 0, Rr * 1.9, Rr * 1.9, 0.8 * off, 'gold'); spGlowAt(Rr * 0.3, 0, Rr * 0.9, Rr * 0.9, off, 'white')
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${SP_WHITE},${0.75 * off})`
      for (let i = 0; i < 8; i++) { const an = i / 8 * SP_TAU + T * 3, l = Rr * (1.5 + 0.9 * spN(i * 3 + T * 8)); ctx.save(); ctx.rotate(an); ctx.beginPath(); ctx.moveTo(0, -Rr * 0.12); ctx.lineTo(l, 0); ctx.lineTo(0, Rr * 0.12); ctx.fill(); ctx.restore() }
      if (lv >= 2) { ctx.save(); ctx.translate(16, 0); ctx.scale(0.3, 1); ctx.globalAlpha = off; drawMagicCircle(0, 0, Rr * 2, 0.84, T * 2); ctx.restore() }
      // the impact splash
      const big = lv >= 3 ? 1.6 : 1
      spGlowAt(L, 0, Rr * 3.4 * big, Rr * 3.4 * big, 0.8 * off, 'gold'); spGlowAt(L, 0, Rr * 1.4, Rr * 1.4, off, 'white')
      if (lv >= 3) { spGlowAt(L, 0, Rr * 6, Rr * 6, 0.35 * off * (0.8 + 0.2 * Math.sin(T * 9)), 'rose'); for (let i = 0; i < 2; i++) { const rq = (T * 3 + i / 2) % 1; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${SP_GOLD},${(1 - rq) * off})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(L, 0, Rr * (0.5 + 2.5 * rq) * 0.4, Rr * (0.5 + 2.5 * rq), 0, 0, SP_TAU); ctx.stroke() } }
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,240,215,${0.8 * off})`
      for (let i = 0; i < 7; i++) { const an = Math.PI + (i / 6 - 0.5) * 2.2, l = Rr * (1.2 + 1.4 * spN(i * 5 + T * 10)) * big; ctx.save(); ctx.translate(L, 0); ctx.rotate(an); ctx.beginPath(); ctx.moveTo(0, -Rr * 0.16); ctx.lineTo(l, 0); ctx.lineTo(0, Rr * 0.16); ctx.fill(); ctx.restore() }
      ctx.restore()
      // level 3: two side rays sweeping beside the beam
      for (const s of side) {
        if (!s.end) continue
        const Ls = s.end.len * Math.min(1, q * 0.6), rs = Rb * 0.42 * wf
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(s.a); ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.5 * off; ctx.drawImage(spBandT('rose', 'y'), 0, -rs * 2.4, Ls, rs * 4.8)
        ctx.globalAlpha = 0.8 * off; ctx.drawImage(spBandT('gold', 'y'), 0, -rs * 1.1, Ls, rs * 2.2)
        ctx.globalAlpha = off; ctx.drawImage(spBandT('white', 'y'), 0, -rs * 0.4, Ls, rs * 0.8); ctx.globalAlpha = 1
        spGlowAt(Ls, 0, rs * 3, rs * 3, off)
        ctx.restore()
      }
    } }
  return st
}
// the Sun Lance move (J J J K): a level-1 beam, held while K stays down (1.1 to 2 s)
beam = function () { return spRay({ lv: 1, scale: 0.85, min: 1.1, max: 2.0, held: () => down('k'), act: 'sunlance', dmg: 3.2, status: 'burn', pin: 0.62 }) }
// the chanted ray: she plants her feet and holds the beam while L (or K) stays down
SPELLS.sun_beam = function (spell, o) {
  const lv = spLv(o), m = { ...MOVES.runner.sunlance, cancel: 99, fire: 0, cd: 0, voice: null }
  P.act = { name: 'ray', m, t: 0.4, hitLog: new Map(), fired: true, arcDone: true }
  spSfx('zap'); spSfx('boom'); spShake(8 + 2 * lv); spFlash(0.35 + 0.1 * lv)
  fx.push(spRay({ lv, min: 2.2 + 0.3 * lv, max: 3.2 + 0.4 * lv, held: () => down('l') || down('k'), act: 'ray', armor: true, dmg: (1.6 + 0.5 * lv) * spPow(o), status: spSt(spell, 'burn'), pin: 0.62 }))
}

// ---------------------------------------------------------------- aimed pull spells
// a crescent blade pointing along +x: the outer arc, and an inner arc from a centre set back by th*r
function spMoonPath(r, th) {
  const A = 1.2, tx = r * Math.cos(A) + th * r, ty = r * Math.sin(A), r2 = Math.hypot(tx, ty), b = Math.atan2(ty, tx)
  ctx.beginPath(); ctx.arc(0, 0, r, -A, A); ctx.arc(-th * r, 0, r2, b, -b, true); ctx.closePath()
}
function spMoon(x, y, rot, r, a, hot = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1
  spGlowAt(r * 0.55, 0, r * 1.05, r * 1.25, 0.55 * a, 'rose')
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(232,104,150,${0.75 * a})`; spMoonPath(r, 0.48); ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = `rgba(255,184,86,${0.8 * a})`; spMoonPath(r * 0.99, 0.3); ctx.fill()
  ctx.fillStyle = `rgba(255,250,236,${0.9 * a * hot})`; spMoonPath(r * 0.985, 0.14); ctx.fill()
  ctx.strokeStyle = `rgba(255,255,250,${0.95 * a})`; ctx.lineWidth = Math.max(2, r * 0.03); ctx.beginPath(); ctx.arc(0, 0, r, -1.2, 1.2); ctx.stroke()
  ctx.restore()
}

// 薔薇月輪 great_crescent: a great rose-gold crescent flies out along her aim, hangs, and returns to her hand.
// Level 2 leaves afterimages and petals; level 3 throws three in a fan and bursts when they come home.
SPELLS.great_crescent = function (spell, o) {
  const lv = spLv(o), low = spLow(), st = spSt(spell, undefined), dmg = (7 + 2 * lv) * spPow(o)
  const n = lv >= 3 ? 3 : 1, R0 = [0, 110, 140, 165][lv], D = 760 + 90 * lv, ghosts = lv >= 2 ? (low ? 3 : 7) : 0
  spSfx('slash'); spShake(5 + 2 * lv); spFlash(0.25, '255,220,200')
  ring(o.x, o.y, 120 + 30 * lv, SP_GOLD); spStreaks(o.x, o.y, 10 + 4 * lv, SP_WHITE, o.aim, 0.5, 900)
  let home = 0
  for (let i = 0; i < n; i++) {
    const a0 = o.aim + (i - (n - 1) / 2) * 0.3, main = i === (n - 1) / 2, r = R0 * (main ? 1 : 0.78)
    later(i * 0.05, () => {
      const c = { t: 0, dur: 3.2, x: o.x, y: o.y, px: o.x, py: o.y, rot: a0, ph: 0, hist: [], last: new Map(), back: false, spd: 0,
        update(dt) {
          const ox = this.x, oy = this.y, out = 0.62
          if (!this.back) {
            const q = Math.min(1, this.t / out), e = 1 - Math.pow(1 - q, 2.4)
            this.x = o.x + Math.cos(a0) * D * e; this.y = o.y + Math.sin(a0) * D * e
            this.y = Math.min(this.y, spGround(this.x, this.y - 40) - r * 0.5)
            if (this.t > out + 0.16) { this.back = true; this.spd = 300 }
          } else {
            const tx = P.x, ty = P.y - 70, d = Math.hypot(tx - this.x, ty - this.y)
            this.spd = Math.min(2600, this.spd + 3400 * dt)
            const st2 = Math.min(d, this.spd * dt); this.x += (tx - this.x) / (d || 1) * st2; this.y += (ty - this.y) / (d || 1) * st2
            if (d < 50 || this.t > this.dur - 0.05) return this.catch()
          }
          const vx = this.x - ox, vy = this.y - oy
          if (vx * vx + vy * vy > 4) this.rot = Math.atan2(vy, vx)
          if (ghosts) { this.hist.unshift([this.x, this.y, this.rot]); if (this.hist.length > ghosts * 2) this.hist.pop() }
          cancelBullets(this.x, this.y, r * 0.75)
          for (const e of targets()) {
            if (T - (this.last.get(e) || -9) < 0.16 || !spOnSeg(e, ox, oy, this.x, this.y, r * 0.7)) continue
            this.last.set(e, T); damage(e, dmg, { x: e.x, y: e.y, status: st, kb: Math.cos(this.rot) * 260 })
            sparks(e.x, e.y - 30, 8, SP_WHITE); spShake(2 + lv)
          }
          if (!low || Math.random() < 0.4) for (const s of [-1, 1]) {
            const tx = this.x + Math.cos(this.rot + s * 1.2) * r, ty = this.y + Math.sin(this.rot + s * 1.2) * r
            parts.push({ x: tx, y: ty, vx: R(-60, 60), vy: R(-80, 20), life: R(0.3, 0.7), t: 0, size: R(2, 4.5), color: Math.random() < 0.5 ? SP_ROSE : SP_GOLD, add: true, g: 120 })
          }
        },
        catch() {
          if (this.done) return; this.done = true; this.t = this.dur - 0.15
          sparks(P.x, P.y - 70, 10, SP_WHITE); ring(P.x, P.y - 70, 90, SP_ROSE)
          if (lv >= 3 && !home++) {
            explode(P.x, P.y - 70, 260, dmg * 1.6, st); spShake(12); spFlash(0.6, '255,230,215'); stopT = Math.max(stopT, 0.05)
            ring(P.x, P.y - 70, 320, SP_GOLD); later(0.06, () => ring(P.x, P.y - 70, 420, SP_ROSE))
            spStreaks(P.x, P.y - 70, low ? 16 : 36, SP_ROSE, 0, Math.PI, 1100)
          }
        },
        draw(k) {
          const a = this.done ? Math.max(0, (this.dur - this.t) / 0.15) : Math.min(1, this.t / 0.06)
          for (let g = ghosts - 1; g >= 0; g--) { const h = this.hist[g * 2 + 1]; if (h) spMoon(h[0], h[1], h[2], r * (1 - g * 0.04), a * 0.42 * (1 - g / ghosts), 0.3) }
          spGlowAt(this.x, this.y, r * 1.6, r * 1.6, 0.35 * a, 'gold')
          spMoon(this.x, this.y, this.rot, r, a)
        } }
      fx.push(c)
    })
  }
}

// 花嵐 petal_tornado: a rose-gold whirlwind rises where she aims, drifts at the nearest foe and pulls
// everything in, shredding with petals. Level 2 is taller and wider; level 3 raises two that end in a petal burst.
SPELLS.petal_tornado = function (spell, o) {
  const lv = spLv(o), low = spLow(), st = spSt(spell, undefined), v = spView(), dir = Math.cos(o.aim) >= 0 ? 1 : -1
  const H = [0, 400, 500, 600][lv], W = [0, 105, 135, 165][lv], dur = 3 + 0.5 * lv, spd = 80 + 40 * lv
  const pow = spPow(o), np = low ? 36 : 60 + 30 * lv, rings = low ? 9 : 15
  spSfx('slash'); spShake(4 + 2 * lv); dim = Math.max(dim, 0.8)
  const spawn = (x0, w, h, side) => {
    const ps = Array.from({ length: np }, () => ({ h: R(0, 1), a: R(0, SP_TAU), r: R(0.6, 1.5), s: R(3.5, 8.5), sp: R(2, 9), up: R(0.18, 0.5), rot: R(0, 6), spin: R(-9, 9) }))
    fx.push({ t: 0, dur, cx: clamp(x0, v.l + 60, v.r - 60), tick: 0, seed: R(0, 50), vel: 0,
      update(dt) {
        const gy = spGround(this.cx, o.y - 80), grow = Math.min(1, this.t / 0.45), w2 = w * grow
        const e0 = nearestTarget(this.cx, gy - 100), want = e0 && Math.abs(e0.x - this.cx) < 600 ? Math.sign(e0.x - this.cx) : (side ? -dir : dir)
        this.vel += (want * spd - this.vel) * Math.min(1, dt * 2.5)
        this.cx = clamp(this.cx + this.vel * dt, v.l + 40, v.r - 40)
        for (const e of targets()) {
          const dx = this.cx - e.x; if (Math.abs(dx) > w2 * 2.8 || e.y < gy - h - 40 || e.y > gy + 60) continue
          if (e !== B) { e.x += dx * Math.min(1, 2.6 * dt); e.vx *= 0.85; e.stun = Math.max(e.stun || 0, 0.1) }
        }
        spCancelSeg(this.cx, gy, this.cx, gy - h, w2 * 0.6)
        if ((this.tick -= dt) <= 0) {
          this.tick = 0.15
          for (const e of targets()) if (Math.abs(e.x - this.cx) < w2 + 30 && e.y > gy - h && e.y < gy + 60) damage(e, (1.6 + 0.4 * lv) * pow, { x: e.x, y: e.y - 40, small: true, status: st })
        }
        for (const p of ps) { p.a += dt * p.sp * (1.4 - p.h * 0.5); p.h += dt * p.up; p.rot += dt * p.spin; if (p.h > 1) { p.h = 0; p.a = R(0, SP_TAU) } }
        if (!low && Math.random() < 0.5) parts.push({ x: this.cx + R(-w2, w2) * 1.3, y: gy - R(0, 12), vx: R(-160, 160), vy: R(-140, -40), life: R(0.3, 0.6), t: 0, size: R(2, 4), color: SP_GOLD, add: true, g: 300 })
        if (this.t + dt >= dur - 0.02 && !this.done) {
          this.done = true
          const by = gy - h * 0.45
          explode(this.cx, by, w * 2 + 40 * lv, (6 + 4 * lv) * pow, st)
          for (const e of targets()) if (e !== B && Math.abs(e.x - this.cx) < w * 1.6) damage(e, 0.1, { x: e.x, y: e.y, launch: -(500 + 120 * lv), small: true })
          spShake(8 + 3 * lv); ring(this.cx, by, 160 + 60 * lv, SP_ROSE)
          if (lv >= 2) { spFlash(0.4 + 0.2 * lv, '255,228,220'); later(0.05, () => ring(this.cx, by, 260 + 80 * lv, SP_GOLD)) }
          for (let i = 0; i < (low ? 18 : 30 + 18 * lv); i++) { const a = R(0, SP_TAU), sp = R(300, 900 + 200 * lv); parts.push({ x: this.cx + R(-w, w) * 0.4, y: by + R(-h, h) * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, life: R(0.5, 1.1), t: 0, size: R(3, 6), color: i % 3 ? SP_ROSE : SP_WHITE, add: true, g: 200 }) }
        }
      },
      draw(k) {
        const gy = spGround(this.cx, o.y - 80), a = Math.min(1, this.t / 0.3) * (1 - Math.max(0, (k - 0.88) / 0.12)), grow = Math.min(1, this.t / 0.45)
        const hh = h * (0.4 + 0.6 * grow), cx = this.cx, sd = this.seed, lean = clamp(this.vel / 220, -1, 1)
        // the funnel spine: tapered, wobbling with noise and leaning back against the drift
        const at = q => ({ x: cx + (spF(q * 2.2 + T * 0.9 + sd) - 0.5) * w * 0.7 * q + Math.sin(T * 2.1 + q * 3.5 + sd) * w * 0.18 * q - lean * hh * 0.22 * q * q,
          y: gy - hh * q, w: w * grow * (0.24 + 0.95 * Math.pow(q, 1.3)) * (0.85 + 0.3 * spN(q * 5 - T * 1.3 + sd)) })
        // floor dust and the dark funnel backing with ragged edges
        spGlowAt(cx, gy - 10, w * 2.2, 46, 0.7 * a, 'rose')
        ctx.globalCompositeOperation = 'source-over'
        const L = [], Rt = [], nn = low ? 10 : 16
        for (let i = 0; i <= nn; i++) { const q = i / nn, p = at(q), j = 0.12 * p.w; L.push([p.x - p.w - j * spN(q * 9 + T * 3 + sd), p.y]); Rt.push([p.x + p.w + j * spN(q * 9 - T * 3 + sd + 40), p.y]) }
        ctx.beginPath(); L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = Rt.length - 1; i >= 0; i--) ctx.lineTo(Rt[i][0], Rt[i][1]); ctx.closePath()
        const g = ctx.createLinearGradient(0, gy, 0, gy - hh); g.addColorStop(0, `rgba(150,40,80,${0.55 * a})`); g.addColorStop(0.6, `rgba(214,86,132,${0.34 * a})`); g.addColorStop(1, `rgba(255,170,150,0)`)
        ctx.fillStyle = g; ctx.fill()
        ctx.globalCompositeOperation = 'lighter'
        // a soft glow column up the middle
        const ns = low ? 6 : 10
        for (let i = 0; i < ns; i++) {
          const q0 = i / ns, q1 = (i + 1) / ns, p0 = at(q0), p1 = at(q1), cw = (p0.w + p1.w) * 0.5
          ctx.globalAlpha = 0.34 * a * (1 - q0 * 0.5); ctx.drawImage(spBandT('rose', 'x'), (p0.x + p1.x) / 2 - cw * 0.75, p1.y, cw * 1.5, p0.y - p1.y + 1)
          ctx.globalAlpha = 0.3 * a * (1 - q0 * 0.6); ctx.drawImage(spBandT('white', 'x'), (p0.x + p1.x) / 2 - cw * 0.28, p1.y, cw * 0.56, p0.y - p1.y + 1)
        }
        ctx.globalAlpha = 1
        // wind bands: broken arcs and streaks whose width, weight and brightness all come from noise
        ctx.lineCap = 'round'
        const nb = low ? 14 : 30
        for (let i = 0; i < nb; i++) {
          const hs = spHash(i * 13 + 5), q = ((i + hs * 0.7) / nb + T * (0.22 + 0.12 * hs)) % 1
          const p = at(q), n1 = spN(i * 3.7 + T * 1.7 + sd), n2 = spN(i * 5.1 - T * 2.3 + sd + 9), wv = p.w * (0.75 + 0.45 * n1), ry = wv * (0.14 + 0.12 * n2)
          const tilt = -lean * 0.18 + (n2 - 0.5) * 0.22, spin = T * (5 + 6 * hs) + i * 2.1, fade = Math.min(1, q * 6) * Math.min(1, (1 - q) * 4)
          const col = hs < 0.45 ? SP_ROSE : hs < 0.8 ? '255,184,86' : SP_WHITE, al = (0.4 + 0.55 * n1) * a * fade
          // one long front arc of varying length
          const s0 = -0.2 + (spin % SP_TAU) * 0.06 + n2 * 0.5, len = 1.1 + 2.2 * n1
          ctx.strokeStyle = `rgba(${col},${al})`; ctx.lineWidth = (2.5 + 9 * q) * (0.45 + 1.1 * n2); ctx.beginPath(); ctx.ellipse(p.x, p.y, wv, ry, tilt, s0, Math.min(Math.PI + 0.2, s0 + len)); ctx.stroke()
          if (n1 > 0.55) { ctx.strokeStyle = `rgba(255,250,236,${al * 0.8})`; ctx.lineWidth = 1.5 + 2 * q; ctx.beginPath(); ctx.ellipse(p.x, p.y, wv * 0.98, ry, tilt, s0 + len * 0.3, s0 + len * 0.7); ctx.stroke() }
          // short whipping streaks round the back and the sides
          for (let j = 0; j < (low ? 1 : 2); j++) {
            const b0 = spin + j * 2.6, bl = 0.25 + 0.4 * spN(i + j * 7 + T * 3)
            ctx.strokeStyle = `rgba(${col},${al * (Math.sin(b0 + bl / 2) > 0 ? 0.9 : 0.35)})`; ctx.lineWidth = 1 + 3 * q * n1
            ctx.beginPath(); ctx.ellipse(p.x, p.y - 4 * j, wv * (1.02 + 0.12 * j), ry, tilt, b0, b0 + bl); ctx.stroke()
          }
        }
        // petals
        for (const p of ps) {
          const c = at(p.h), x = c.x + Math.cos(p.a) * c.w * p.r, y = c.y + Math.sin(p.a) * c.w * 0.22 * p.r, front = Math.sin(p.a) > 0
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillStyle = front ? `rgba(255,${p.sp > 6 ? 236 : 170},${p.sp > 6 ? 226 : 200},${(0.6 + 0.04 * p.sp) * a})` : `rgba(255,140,185,${0.35 * a})`
          ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, SP_TAU); ctx.fill(); ctx.restore()
        }
      } })
  }
  const x0 = o.x + dir * (lv >= 3 ? 260 : 340)
  if (lv >= 3) { spawn(x0 - 40, W, H, 0); later(0.18, () => spawn(o.x - dir * 330, W * 0.8, H * 0.85, 1)) }
  else spawn(x0, W, H, 0)
}

// a full-screen tint that is capped and fades smoothly (no strobe), drawn over the world in screen space
function spSoftFlash(a, col = '255,230,200', dur = 0.25) {
  fx.push({ t: 0, dur, draw(k) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(${col},${a * Math.pow(1 - k, 1.6)})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore()
  } })
}
// the brightness of a big crash kept local: a dark backing, a white-hot core, shock rings and streaks
function spImpact(x, gy, lv, low) {
  const cy = gy - 50, big = 1 + 0.2 * (lv - 1)
  spStreaks(x, cy, low ? 14 : 26 + 8 * lv, SP_WHITE, -Math.PI / 2, 1.5, 1500 * big)
  spStreaks(x, cy, low ? 8 : 16 + 6 * lv, SP_GOLD, -Math.PI / 2, 1.3, 1100 * big)
  spStreaks(x, gy - 8, low ? 6 : 12, SP_ROSE, Math.PI, 0.25, 1200); spStreaks(x, gy - 8, low ? 6 : 12, SP_ROSE, 0, 0.25, 1200)
  fx.push({ t: 0, dur: 0.85, draw(k) {
    const q = 1 - k, e = 1 - Math.pow(1 - Math.min(1, k / 0.6), 3)
    // dark ring so the core reads on a bright sky
    spGlowAt(x, cy, 240 * big, 190 * big, 0.45 * q, 'ink')
    ctx.globalCompositeOperation = 'lighter'
    spGlowAt(x, cy, (200 + 120 * e) * big, (160 + 80 * e) * big, 0.75 * q, 'gold')
    spGlowAt(x, cy, 110 * big * (1 - 0.5 * k), 95 * big * (1 - 0.5 * k), Math.min(1, q * 1.4), 'white')
    // the shock rings: one standing, one flat on the floor
    const rr = (60 + 380 * e) * big
    ctx.strokeStyle = `rgba(255,236,200,${0.9 * q})`; ctx.lineWidth = 3 + 14 * q; ctx.beginPath(); ctx.arc(x, cy, rr, 0, SP_TAU); ctx.stroke()
    ctx.strokeStyle = `rgba(${SP_ROSE},${0.55 * q})`; ctx.lineWidth = 2 + 6 * q; ctx.beginPath(); ctx.arc(x, cy, rr * 0.82, 0, SP_TAU); ctx.stroke()
    ctx.strokeStyle = `rgba(${SP_WHITE},${q})`; ctx.lineWidth = 2 + 8 * q; ctx.beginPath(); ctx.ellipse(x, gy - 6, (90 + 640 * e) * big, (18 + 50 * e) * big, 0, 0, SP_TAU); ctx.stroke()
    // a short spray of light spikes from the core
    if (k < 0.5) { ctx.lineCap = 'round'; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i - 4.5) * 0.3, l = (140 + 260 * spHash(i * 7 + 3)) * big * (0.4 + k); ctx.strokeStyle = `rgba(255,246,226,${0.8 * (1 - k * 2)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 40, cy + Math.sin(a) * 40); ctx.lineTo(x + Math.cos(a) * l, cy + Math.sin(a) * l); ctx.stroke() } }
  } })
}
