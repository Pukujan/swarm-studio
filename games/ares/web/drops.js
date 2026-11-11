// drops.js: small item drops. Icons: assetrizz by mojomast (Kyle Durepos), used with permission.
// A defeated enemy sometimes leaves a painted health potion (heals 10) or a gold coin (+6 meter,
// counted in RUN.gold); an elite always leaves one (a stronger potion, 16, when she is under
// 70 % life, else gold). Plain drops: 12 % potion, 10 % gold, at most one every 2.5 s, at most
// 8 on the ground. Bosses drop nothing. A drop pops out, settles on the walk line under it,
// bobs and glints (no glint under PERF.low), and is taken on touch with a little sparkle. It
// fades after 14 s and is cleared when a stage starts. The core `kill` is wrapped for the hook;
// updates and draws ride on `updateHazards` / `drawHazards` (world space, behind the enemies).
// `?drops=0` turns them off; `DROPS.rate` scales the plain chances (the browser test sets it).
const DROPS = { list: [], on: !/[?&]drops=0/.test(location.search), rate: 1, last: -99, stage: null, LIFE: 14 }

function dropSpawn(kind, x, y, o = {}) {
  if (DROPS.list.length >= 8) return null
  const d = { kind, x, y, vx: R(-90, 90), vy: R(-420, -300), t: 0, rest: false, heal: o.heal || 10, seed: Math.random() * 7 }
  DROPS.list.push(d)
  return d
}

;(function () {
  const low = () => typeof PERF !== 'undefined' && PERF.low
  const isElite = e => /elite/.test(e.type || '') || !!e.def?.elite
  if (typeof kill === 'function') {
    const baseKill = kill
    kill = function (e) {
      const boss = e === B, was = e.dead
      const r = baseKill.apply(this, arguments)
      if (!DROPS.on || boss || was || !e || mode !== 'play') return r
      const base = e.def && typeof ENEMY_BASES !== 'undefined' ? ENEMY_BASES[e.def.base] : null
      const y = e.y - (!base || base.float ? 0 : 40)
      if (isElite(e)) {
        if (P.hp < P.max * 0.7) dropSpawn('potion', e.x, y, { heal: 16 }); else dropSpawn('gold', e.x, y)
      } else if (T - DROPS.last > 2.5) {
        const q = Math.random()
        if (q < 0.12 * DROPS.rate) { dropSpawn('potion', e.x, y); DROPS.last = T }
        else if (q < 0.22 * DROPS.rate) { dropSpawn('gold', e.x, y); DROPS.last = T }
      }
      return r
    }
  }

  function take(d) {
    if (d.kind === 'potion') P.hp = Math.min(P.max, P.hp + d.heal)
    else { P.meter = Math.min(100, P.meter + 6); RUN.gold = (RUN.gold || 0) + 1 }
    const col = d.kind === 'potion' ? '255,120,110' : '255,214,120'
    burst(d.x, d.y - 26, low() ? 6 : 12, col, 260)
    for (let i = 0; i < (low() ? 3 : 7); i++) parts.push({ x: d.x + R(-14, 14), y: d.y - 26 + R(-14, 14), vx: R(-40, 40), vy: R(-200, -90), life: R(0.4, 0.7), t: 0, size: R(2, 4), color: '255,246,220', add: true })
    ring(d.x, d.y - 26, 46, col)
    try { tone('sine', d.kind === 'potion' ? 660 : 990, d.kind === 'potion' ? 990 : 1480, 0.14, 0.05) } catch (err) {}
  }

  function updateDrops(dt) {
    if (DROPS.stage !== stage) { DROPS.stage = stage; DROPS.list = [] }
    for (const d of DROPS.list) {
      d.t += dt
      if (!d.rest) {
        d.vy += 1400 * dt; d.x += d.vx * dt; d.y += d.vy * dt
        const g = groundAt(d.x, d.y - 12)
        if (d.vy > 0 && g < Infinity && d.y >= g) { d.y = g; d.rest = true }
        if (d.y > GROUND + 500) d.t = DROPS.LIFE
      }
      // taken on touch: her body box, with a little give
      if (d.t > 0.35 && !P.dead && Math.abs(P.x - d.x) < 46 && d.y - 26 > P.y - 150 && d.y - 26 < P.y + 20) { take(d); d.t = DROPS.LIFE }
    }
    DROPS.list = DROPS.list.filter(d => d.t < DROPS.LIFE)
  }

  function drawDrop(d) {
    const im = typeof iconArt === 'function' ? iconArt('drop.' + d.kind) : null
    const bob = d.rest ? Math.sin(T * 3 + d.seed) * 5 : 0, s = d.kind === 'gold' ? 34 : 42
    const cx = d.x, cy = d.y - 26 - bob - (d.rest ? 8 : 0)
    const fade = Math.min(1, d.t / 0.15) * (d.t > DROPS.LIFE - 2 ? 0.5 + 0.5 * Math.cos((d.t - DROPS.LIFE + 2) * 12) : 1)
    ctx.save(); ctx.globalAlpha = fade
    // a soft floor shadow and a warm halo
    if (d.rest) { ctx.fillStyle = 'rgba(30,10,10,0.35)'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, 16 - bob, 4, 0, 0, Math.PI * 2); ctx.fill() }
    ctx.globalCompositeOperation = 'lighter'
    const col = d.kind === 'potion' ? '255,90,80' : '255,200,110'
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.9); g.addColorStop(0, `rgba(${col},0.32)`); g.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = g; ctx.fillRect(cx - s, cy - s, s * 2, s * 2)
    ctx.globalCompositeOperation = 'source-over'
    if (im) ctx.drawImage(im, cx - s / 2, cy - s / 2, s, s)
    else {   // code fallback: a red flask or a gold disc
      ctx.fillStyle = d.kind === 'potion' ? '#d8303a' : '#f2c070'; ctx.strokeStyle = '#fff1dc'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy + (d.kind === 'potion' ? 4 : 0), s * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (d.kind === 'potion') ctx.fillRect(cx - 4, cy - s * 0.4, 8, 10)
    }
    // the glint: a four-point star that blooms at one corner every 1.6 s
    if (!low()) {
      const k = ((T + d.seed) % 1.6) / 0.35
      if (k < 1) {
        const a = Math.sin(k * Math.PI), gx = cx + s * 0.22, gy = cy - s * 0.24, L = 4 + 10 * a
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,248,226,${0.9 * a})`
        ctx.beginPath(); ctx.moveTo(gx, gy - L); ctx.lineTo(gx + 2, gy - 2); ctx.lineTo(gx + L, gy); ctx.lineTo(gx + 2, gy + 2); ctx.lineTo(gx, gy + L); ctx.lineTo(gx - 2, gy + 2); ctx.lineTo(gx - L, gy); ctx.lineTo(gx - 2, gy - 2); ctx.closePath(); ctx.fill()
      }
    }
    ctx.restore()
  }

  const baseUpd = typeof updateHazards === 'function' ? updateHazards : null
  updateHazards = function (dt) { if (baseUpd) baseUpd(dt); if (DROPS.on) updateDrops(dt) }
  const baseDraw = typeof drawHazards === 'function' ? drawHazards : null
  drawHazards = function () { if (baseDraw) baseDraw(); if (DROPS.on) for (const d of DROPS.list) drawDrop(d) }
})()
