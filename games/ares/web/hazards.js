// ARES stage hazards: what a big attack leaves behind. A boss slam cracks the floor and
// shakes rocks loose, a rush leaves burning tracks on fire stages, the titan's sword splits
// the ground, and late boss modes make the arena fall apart. Every hazard shows a tell first,
// then hurts the player (and burns or shocks enemies standing in it).
//
// Kinds: debris (rock from above, shadow first), fire (a burning strip of floor), shock (a live
// floor ring), crack (a line of eruptions running out from a point). The stage picks the
// element: fire stages burn, storm and ruin stages crackle. See ENGINE.md.

let HZ = []

// the element a stage's leftovers take
function hazardElement() {
  const id = stage?.id || '', lk = typeof look !== 'undefined' ? look : null
  if (lk === 'storm' || id === 'ruin') return 'shock'
  if (id === 'ember' || id === 'inferno' || id === 'crimson' || lk === 'red_moon') return 'fire'
  return 'stone'
}

function hazard(kind, x, y = GROUND, o = {}) {
  if (HZ.length > 40) return
  const h = { kind, x, y, t: 0, tell: o.tell ?? 0.55, dur: o.dur ?? 4, dmg: o.dmg ?? 8, every: o.every ?? 0.6, next: 0, l: o.l ?? x - 90, r: o.r ?? x + 90, hit: false, seed: Math.random() * 100, dir: o.dir || 1 }
  if (kind === 'debris') { h.tell = o.tell ?? 0.85; h.dur = h.tell + 0.4; h.dmg = o.dmg ?? 14; h.size = o.size ?? R(26, 42) }
  if (kind === 'crack') { h.tell = o.tell ?? 0.5; h.len = o.len ?? 420; h.dur = h.tell + 0.9; h.dmg = o.dmg ?? 16 }
  if (kind === 'shock') { h.r = o.r ?? 110; h.dmg = o.dmg ?? 8; h.every = 0.7 }
  HZ.push(h)
  return h
}

// called by bosses and titans after a big attack
function afterAttack(what, x, y = GROUND, o = {}) {
  if (!stage) return
  const el = hazardElement(), m = typeof B !== 'undefined' && B ? B.mode : 0
  if (what === 'slam' || what === 'titan') {
    hazard('crack', x, y, { len: what === 'titan' ? 640 : 380 })
    const n = what === 'titan' ? 3 : m >= 1 ? 2 : 1
    for (let i = 0; i < n; i++) later(0.25 + i * 0.3, () => hazard('debris', clamp(x + R(-380, 380), cam.x + 60, cam.x + VW() - 60)), 'hz')
    if (el === 'fire') later(1.2, () => hazard('fire', x, y, { l: x - 130, r: x + 130, dur: 4.5 }), 'hz')
    if (el === 'shock') later(1.2, () => hazard('shock', x, y, { dur: 3.5 }), 'hz')
  } else if (what === 'rush' && el === 'fire') {
    const a = Math.min(x, o.to), b = Math.max(x, o.to)
    for (let s = a; s < b; s += 260) later(0.2 + (s - a) / 2600, () => hazard('fire', s + 130, y, { l: s, r: s + 260, dur: 3, tell: 0.7 }), 'hz')
  } else if (what === 'pattern' && m >= 2 && Math.random() < 0.55) {
    // late modes: the arena starts to fall apart
    for (let i = 0; i < 2; i++) later(i * 0.4, () => hazard('debris', clamp(P.x + R(-260, 260), cam.x + 60, cam.x + VW() - 60)), 'hz')
  }
}

const onFloor = (h, pad = 0) => P.ground && Math.abs(P.y - h.y) < 10 && P.x > h.l - pad && P.x < h.r + pad
function hzHurt(h, dmg) {
  if (P.dead) return
  if (typeof hitPlayer === 'function') hitPlayer(dmg, Math.sign(P.x - h.x) || 1)
  else if (P.iframe <= 0) hurtPlayer(dmg, Math.sign(P.x - h.x) || 1)
}

function updateHazards(dt) {
  for (const h of HZ) {
    h.t += dt
    const live = h.t >= h.tell
    if (h.kind === 'fire') {
      if (live && onFloor(h) && T >= h.next) { h.next = T + h.every; hzHurt(h, h.dmg) }
      if (live) for (const e of enemies) if (!e.dead && e.x > h.l && e.x < h.r && Math.abs(e.y - h.y) < 40) applyStatus(e, 'burn')
      if (live && Math.random() < 0.35) parts.push({ x: R(h.l, h.r), y: h.y - 4, vx: R(-30, 30), vy: R(-220, -90), life: R(0.4, 0.8), t: 0, size: R(2, 4), color: '255,150,70', add: true })
      if (live && fxk()?.smoke && Math.random() < 0.04) FXK.smoke(R(h.l, h.r), h.y - 20, 1, { color: 'ember', size: 0.6 })
    } else if (h.kind === 'shock') {
      const inR = P.ground && Math.abs(P.y - h.y) < 10 && Math.abs(P.x - h.x) < h.r
      if (live && inR && T >= h.next) { h.next = T + h.every; hzHurt(h, h.dmg); zapFx(P.x, P.y - 60) }
      if (live) for (const e of enemies) if (!e.dead && Math.abs(e.x - h.x) < h.r && Math.abs(e.y - h.y) < 40 && Math.random() < dt) applyStatus(e, 'shock')
    } else if (h.kind === 'debris') {
      if (!h.hit && h.t >= h.dur - 0.05) {
        h.hit = true; shake = Math.max(shake, 7); SFX.heavy()
        if (Math.abs(P.x - h.x) < h.size + 28 && P.y > h.y - 200) hzHurt(h, h.dmg)
        for (const e of enemies) if (!e.dead && Math.abs(e.x - h.x) < h.size + 30) damage(e, 20, { x: e.x, y: e.y })
        for (let i = 0; i < 14; i++) parts.push({ x: h.x + R(-h.size, h.size), y: h.y - 6, vx: R(-320, 320), vy: R(-520, -120), life: R(0.4, 0.9), t: 0, size: R(3, 7), color: '190,150,120', g: 1500 })
        if (fxk()?.smoke) FXK.smoke(h.x, h.y - 10, 5, { color: 'dust', size: 1.1, spread: 60 })
        decals.push({ x: h.x, y: h.y, r: h.size * 2.4, t: 6, max: 6 })
      }
    } else if (h.kind === 'crack') {
      // eruptions run outward from the centre, both ways
      const run = clamp((h.t - h.tell) / 0.45, 0, 1), reach = run * h.len / 2
      if (live && !h.hit && P.ground && Math.abs(P.y - h.y) < 10 && Math.abs(P.x - h.x) < reach + 20 && Math.abs(P.x - h.x) > reach - 70) { h.hit = true; hzHurt(h, h.dmg); P.vy = Math.min(P.vy, -520) }
      if (live && run < 1 && Math.random() < 0.8) for (const s of [-1, 1]) parts.push({ x: h.x + s * reach, y: h.y - 4, vx: s * R(40, 160), vy: R(-620, -260), life: R(0.4, 0.7), t: 0, size: R(3, 6), color: hazardElement() === 'fire' ? '255,140,70' : '220,190,150', g: 1400, add: hazardElement() === 'fire' })
    }
  }
  HZ = HZ.filter(h => h.t < h.dur)
}

function drawHazards() {
  for (const h of HZ) {
    const k = h.t / h.dur, tell = h.t < h.tell, a = Math.min(1, h.t / 0.2) * Math.min(1, (h.dur - h.t) / 0.4)
    ctx.save()
    if (h.kind === 'fire') {
      ctx.globalCompositeOperation = 'lighter'
      const w = h.r - h.l, grow = tell ? h.t / h.tell : 1
      // a red line under the floor while it catches, then tongues of flame
      ctx.fillStyle = `rgba(255,70,40,${0.35 * a})`; ctx.fillRect(h.l, h.y - 3, w, 4)
      for (let x = h.l + 10; x < h.r; x += 22) {
        const fl = (34 + 26 * Math.sin(T * 9 + x * 0.13 + h.seed)) * grow * (tell ? 0.45 : 1)
        const g = ctx.createLinearGradient(0, h.y, 0, h.y - fl)
        g.addColorStop(0, `rgba(255,200,110,${0.85 * a})`); g.addColorStop(0.5, `rgba(255,110,50,${0.55 * a})`); g.addColorStop(1, 'rgba(200,30,20,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 13, h.y); ctx.quadraticCurveTo(x - 6 + Math.sin(T * 7 + x) * 5, h.y - fl * 0.6, x + Math.sin(T * 5 + x) * 6, h.y - fl); ctx.quadraticCurveTo(x + 8, h.y - fl * 0.5, x + 13, h.y); ctx.fill()
      }
    } else if (h.kind === 'shock') {
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = tell ? `rgba(255,220,150,${0.3 + 0.4 * Math.abs(Math.sin(h.t * 20))})` : `rgba(255,240,200,${0.7 * a})`
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, 14, 0, 0, Math.PI * 2); ctx.stroke()
      if (!tell) for (let i = 0; i < 4; i++) {
        const x0 = h.x + R(-h.r, h.r); ctx.strokeStyle = `rgba(255,250,220,${R(0.4, 0.9) * a})`; ctx.lineWidth = R(1, 2.5)
        ctx.beginPath(); ctx.moveTo(x0, h.y); let x = x0, y = h.y; for (let j = 0; j < 4; j++) { x += R(-14, 14); y -= R(10, 22); ctx.lineTo(x, y) } ctx.stroke()
      }
    } else if (h.kind === 'debris') {
      const f = clamp((h.t - h.tell) / 0.4, 0, 1)
      // shadow grows on the floor, then the rock drops into it
      const sh = clamp(h.t / h.tell, 0, 1)
      ctx.fillStyle = `rgba(40,10,10,${0.25 + 0.3 * sh})`; ctx.beginPath(); ctx.ellipse(h.x, h.y - 2, h.size * (0.6 + 0.8 * sh), 8 + 4 * sh, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `rgba(255,70,50,${0.5 * sh})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(h.x, h.y - 2, h.size * 1.4, 12, 0, 0, Math.PI * 2); ctx.stroke()
      if (h.t >= h.tell) {
        const top = cam.y - 80, y = lerp(top, h.y - h.size * 0.7, f * f)
        ctx.translate(h.x, y); ctx.rotate(h.seed + h.t * 4)
        ctx.fillStyle = '#5a3a2c'; ctx.strokeStyle = '#2a1410'; ctx.lineWidth = 3
        ctx.beginPath(); for (let i = 0; i < 7; i++) { const an = i / 7 * Math.PI * 2, rr = h.size * (0.75 + 0.25 * Math.sin(h.seed * 3 + i * 2.1)); ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) } ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,220,170,0.25)'; ctx.beginPath(); ctx.arc(-h.size * 0.25, -h.size * 0.3, h.size * 0.3, 0, Math.PI * 2); ctx.fill()
      }
    } else if (h.kind === 'crack') {
      const run = clamp((h.t - h.tell) / 0.45, 0, 1), fade = 1 - clamp((h.t - h.tell - 0.45) / 0.45, 0, 1)
      ctx.globalCompositeOperation = 'lighter'
      const fire = hazardElement() === 'fire'
      if (tell) { ctx.strokeStyle = `rgba(255,60,40,${0.3 + 0.5 * Math.abs(Math.sin(h.t * 18))})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(h.x - h.len / 2, h.y - 2); ctx.lineTo(h.x + h.len / 2, h.y - 2); ctx.stroke() }
      else for (const s of [-1, 1]) {
        ctx.strokeStyle = fire ? `rgba(255,150,70,${0.9 * fade})` : `rgba(255,230,190,${0.8 * fade})`; ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(h.x, h.y - 2); for (let d = 0; d <= run * h.len / 2; d += 18) ctx.lineTo(h.x + s * d, h.y - 2 - Math.abs(Math.sin(d * 0.3 + h.seed)) * 6); ctx.stroke()
        // the eruption at the front of the crack
        const fx_ = h.x + s * run * h.len / 2, ht = 90 * fade * (run < 1 ? 1 : 0.4)
        const g = ctx.createLinearGradient(0, h.y, 0, h.y - ht); g.addColorStop(0, fire ? `rgba(255,170,90,${0.9 * fade})` : `rgba(255,235,200,${0.8 * fade})`); g.addColorStop(1, 'rgba(255,80,40,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx_ - 22, h.y); ctx.lineTo(fx_, h.y - ht); ctx.lineTo(fx_ + 22, h.y); ctx.fill()
      }
    }
    ctx.restore()
  }
}
