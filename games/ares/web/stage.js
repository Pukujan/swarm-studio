// ARES stages: data/stages.json played section by section.
//   run    walk right through platforms and enemy waves; the section's end is a gate until cleared
//   chase  the screen's left edge pushes right, pits and crumbling platforms, a boss runs behind you
//   arena  the camera stops at the edges and a boss from data/fights.json fights you
//   titan  a colossus attacks from the background; take its seals to bring it down
// Also here: the art kits, the zoom camera, the stage-end boon pick, and the Oracle's big spells.
'use strict'

let STAGES = null, ENEMIES = {}, FIGHTS = {}
const KITS = {}, SHEETS = {}
let stage = null, stageIdx = 0, kit = null, pits = [], chase = null, arena = null, look = null, TI = null, stageT = 0
const RUN = { boons: {}, spells: ['chain', 'spear'], spell: 0, tiers: {}, carry: {}, offer: null, pick: 0, offerT: 0, kind: null, picked: [] }
const VW = () => W / cam.z, VH = () => H / cam.z
const nB = id => RUN.boons[id] || 0

// ---------------------------------------------------------------- loading
async function loadData() {
  const opt = u => getJSON(u).catch(() => null)
  const [s, e, f] = await Promise.all([opt('../data/stages.json'), opt('../data/enemies.json'), opt('../data/fights.json')])
  STAGES = s?.stages?.length ? s.stages : null
  ENEMIES = e?.enemies || {}; FIGHTS = f?.fights || {}
  const roles = { 'platforms-0': 'ledge', 'platforms-1': 'ledge', 'platforms-5': 'bridge', 'platforms-2': 'step', 'platforms-6': 'stairs', 'platforms-3': 'column', 'platforms-4': 'prop', 'platforms-7': 'prop' }
  const pieces = {}
  for (const [k, a] of Object.entries(ANCH.pieces)) if (roles[k]) pieces[k] = { img: A.level[k], role: roles[k], w: a.w, h: a.h, top: a.top + a.h * 0.05, l: a.l, r: a.r, s: 0.5 }
  KITS.temple = {
    stage: 'temple', tint: '#ff9a6a', haze: ['rgba(255,170,120,0)', 'rgba(120,40,40,0.35)'], weather: 'embers',
    sky: A.level.sky, ground: { img: A.level['ground-0'], top: 8, s: 0.6 }, pieces,
    far: ISLANDS.map(([k, x, y, s]) => ({ img: A.level[k], x, y, s })), farSpan: 4200,
    fore: FORE.map(([k, x, y, s]) => ({ img: A.level[k], x, y, s })), foreSpan: 4200,
  }
  // effect strips named in heroes.json (missing ones simply stay procedural)
  const names = new Set([...Object.keys(CFG.fx?.sheets || {}), ...Object.values(CFG.heroes.runner.spells || {}).flatMap(s => s.fx || [])])
  await Promise.all([...names].filter(n => !A.fx[n]).map(n => loadImg(`../assets/fx/${n}.webp`).then(i => { A.fx[n] = shrinkFx(i) }).catch(() => { })))
}
async function loadKit(id) {
  if (!id || KITS[id]) return KITS[id] || KITS.temple
  try {
    const base = `../assets/stages/${id}/`, k = await getJSON(base + 'kit.json')
    const img = f => loadImg(base + f).catch(() => null)
    const [sky, ground] = await Promise.all([img(k.sky || 'sky.webp'), img(k.ground?.file || 'ground.webp')])
    const far = await Promise.all((k.far || []).map(async f => ({ ...f, img: await img(f.file) })))
    const fore = await Promise.all((k.fore || []).map(async f => ({ ...f, img: await img(f.file) })))
    const pieces = {}
    await Promise.all(Object.entries(k.pieces || {}).map(async ([n, p]) => { const i = await img(p.file); if (i) pieces[n] = { ...p, img: i, w: p.w || i.width, h: p.h || i.height } }))
    if (!sky || !ground) throw new Error('kit ' + id + ' has no sky or ground')
    // far scenery spread along the stage; fore pieces every so often
    const farList = [], foreList = []
    far.filter(f => f.img).forEach((f, i, a) => { for (let x = i * 900; x < 12000; x += a.length * 900) farList.push({ img: f.img, x: x + ((x * 7) % 300), y: H * 0.78 - f.img.height * 0.5, s: 0.5 }) })
    fore.filter(f => f.img).forEach((f, i, a) => { for (let x = 500 + i * 1400; x < 14000; x += a.length * 1400) foreList.push({ img: f.img, x, y: f.at === 'bottom' ? GROUND - f.img.height * 0.5 + 40 : -30, s: 0.5 }) })
    KITS[id] = { stage: id, tint: k.tint, haze: k.haze || KITS.temple.haze, weather: k.weather || 'none', sky, ground: { img: ground, top: k.ground?.top || 0, s: 0.6 }, pieces, far: farList, fore: foreList }
  } catch (e) { console.warn('kit', id, e.message); KITS[id] = KITS.temple }
  return KITS[id]
}
// A sprite sheet from assets/skins/<sprite>/default/<name>.webp, with its feet found from the pixels.
function sheet(sprite, name) {
  if (!sprite || !name) return null
  const key = sprite + '/' + name, s = SHEETS[key]
  if (s !== undefined) return s && s.img ? s : null
  SHEETS[key] = { loading: true }
  loadImg(`../assets/skins/${sprite}/default/${name}.webp`).then(img => { SHEETS[key] = { img, ...anchorOf(img) } }).catch(() => { SHEETS[key] = null })
  return null
}
function anchorOf(img) {
  const slot = img.height, n = Math.max(1, Math.round(img.width / slot)), q = 4, w = Math.ceil(slot / q)
  const c = document.createElement('canvas'); c.width = w * n; c.height = w
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height)
  const d = g.getImageData(0, 0, c.width, c.height).data
  let bottom = 0, top = w, xs = 0, xn = 0
  for (let f = 0; f < n; f++) for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    if (d[((y * c.width) + f * w + x) * 4 + 3] < 60) continue
    if (y > bottom) bottom = y
    if (y < top) top = y
  }
  for (let f = 0; f < n; f++) for (let y = Math.max(0, bottom - 6); y <= bottom; y++) for (let x = 0; x < w; x++) if (d[((y * c.width) + f * w + x) * 4 + 3] >= 60) { xs += x; xn++ }
  return { n, x: (xn ? xs / xn : w / 2) * q, y: (bottom + 1) * q, h: Math.max(40, (bottom - top + 1) * q) }
}
function drawSheet(s, frame, x, y, face, scale = 1, alpha = 1) {
  if (!s?.img) return
  const slot = s.img.height
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale((face < 0 ? -1 : 1) * scale, scale)
  ctx.drawImage(s.img, (frame % s.n) * slot, 0, slot, slot, -s.x, -s.y, slot, slot)
  ctx.restore()
}

// ---------------------------------------------------------------- building a stage
const ROLE_SIZE = { ledge: { w: 280 }, bridge: { w: 480 }, step: { w: 150 }, stairs: { h: 230 }, column: { h: 330 }, prop: { h: 120 }, wall: { h: 440 } }
function pickPiece(role, want) {
  let list = Object.entries(kit.pieces).filter(([, p]) => p.role === role)
  if (!list.length) list = Object.entries(KITS.temple.pieces).filter(([, p]) => p.role === (role === 'wall' ? 'column' : role))
  if (!list.length) return null
  if (want) list.sort((a, b) => Math.abs((a[1].r - a[1].l) - want) - Math.abs((b[1].r - b[1].l) - want))
  return list[want ? 0 : (Math.random() * list.length) | 0]
}
function placePiece(role, x, o = {}) {
  const want = o.w || ROLE_SIZE[role]?.w
  const pk = pickPiece(role, o.w ? want : null)
  if (!pk) return null
  const [name, a] = pk
  let s = a.s || 0.5
  if (want && a.r - a.l > 0 && ['ledge', 'bridge', 'step'].includes(role)) s = clamp(want / (a.r - a.l), 0.25, 1.4)
  else if (ROLE_SIZE[role]?.h) s = clamp(ROLE_SIZE[role].h / a.h, 0.2, 1.4)
  const w = a.w * s, h = a.h * s, top = a.top * s
  const ground = ['stairs', 'column', 'prop', 'wall'].includes(role)
  const y = !ground && o.surf != null ? o.surf - top : GROUND - h + 14 * s * 2
  const kind = o.crumble ? 'crumble' : o.kind || (role === 'column' ? 'column' : role === 'wall' ? 'wall' : role === 'prop' ? 'prop' : 'plat')
  const hp = o.hp || (role === 'column' ? 60 : role === 'prop' ? 30 : 0)
  const p = { name, img: a.img, x, y, w, h, s, surf: y + top, l: x + (a.l ?? 0) * s, r: x + (a.r ?? a.w) * s, hp, max: hp, broken: false, respawn: 0, kind, role, walk: role !== 'prop', hit: 0, fall: 0 }
  if (role === 'wall') { p.surf = y + 10; p.l = x + w * 0.2; p.r = x + w * 0.8 }
  plats.push(p); return p
}
function buildStage(i) {
  stage = STAGES[i]; stageIdx = i
  WORLD = stage.length
  plats = []; pits = []; chase = null; arena = null; TI = null; look = null
  stage.sections.forEach((s, k) => {
    s.k = k; s.cleared = false; s.started = false; s.fired = new Set(); s.mine = new Set()
    for (const p of s.plats || []) placePiece(p.role, p.x, p)
    for (const pr of s.pits || []) pits.push(pr)
    for (const c of s.crumble || []) placePiece('step', c.x, { surf: c.surf, w: c.w, crumble: true })
    if (s.kind === 'titan') s.seals = (s.seals || []).map(x => (typeof x === 'number' ? { x } : x)).map(z => ({ ...z, t: 0, done: false }))
  })
  // a boss met in an earlier arena leaves at the mode his chase uses, and comes back later
  const arenas = stage.sections.filter(s => s.kind === 'arena')
  for (const a of arenas) {
    const later_ = arenas.filter(b => b.k > a.k && b.boss === a.boss)
    if (!later_.length) continue
    const f = FIGHTS[a.boss], cp = f?.chase?.patterns || []
    const m = f?.modes?.find(m => m.patterns.every(p => cp.includes(p)))
    a.until = m ? m.from : 0.5
  }
  for (const a of arenas) preloadBoss(a.boss)
  for (const s of stage.sections) if (s.kind === 'titan') preloadTitan(s.titan)
}
function inPit(x) { for (const [a, b] of pits) if (x > a && x < b) return true; return false }
function groundAt(x, fromY = -1e9) {
  let y = inPit(x) ? Infinity : GROUND
  for (const p of plats) if (!p.broken && p.walk && x > p.l && x < p.r && p.surf >= fromY && p.surf < y) y = p.surf
  return y
}
function makeEnemy(type, x, y) {
  const def = ENEMIES[type], base = def && typeof ENEMY_BASES !== 'undefined' ? ENEMY_BASES[def.base] : null
  const float = !base || base.float
  const mul = 1 + 0.22 * stageIdx
  const hp = Math.round((def?.hp || (type === 'sentry' ? 60 : 32)) * mul)
  const e = {
    type, def: base ? def : null, x, y: float ? (y ?? 300) : groundAt(x, y != null ? y - 2 : GROUND - 1), hx: x, hy: y ?? 300, vx: 0, vy: 0,
    t: R(0, 3), fire: R(0.8, 1.8), hp, max: hp, dead: false, flash: 0, face: P.x < x ? -1 : 1,
    burn: 0, shock: 0, charred: 0, charredHits: 0, stun: 0, air: 0, tick: 0, r: def?.r || (type === 'sentry' ? 40 : 34), spawn: 0.6,
    box() { return float ? { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 } : { x: this.x - this.r, y: this.y - this.r * 2, w: this.r * 2, h: this.r * 2 } },
  }
  if (e.y === Infinity) e.y = GROUND
  if (base) try { base.init(e) } catch (err) { console.warn('enemy init', type, err) }
  enemies.push(e)
  ring(e.x, float ? e.y : e.y - e.r, 70, '255,120,100')
  return e
}
function spawnEnemy(type, x, y) { return makeEnemy(ENEMIES[type] ? type : 'drone', x, y) }

// ---------------------------------------------------------------- enemies (core part; behaviour lives in enemies.js)
function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue
    e.t += dt; e.flash = Math.max(0, e.flash - dt)
    if (e.spawn > 0) { e.spawn -= dt; continue }
    statusTick(e, dt)
    if (e.dead) continue
    const base = e.def && ENEMY_BASES[e.def.base]
    e.vx *= Math.pow(0.02, dt)
    if (e.frozen > 0) e.frozen -= dt
    if (e.air > 0) {
      const prev = e.y
      e.air -= dt; e.vy += 1500 * dt
      e.x += e.vx * dt; e.y += e.vy * dt
      const fl = base && !base.float ? groundAt(e.x, prev - 2) : GROUND - e.r
      if (e.y > fl) { e.y = fl; e.vy = 0; if (e.air > 0.2) e.air = 0.2 }
      if (e.y > GROUND + 600) { e.dead = true; e.fell = true }
      continue
    }
    if (e.stun > 0) { e.stun -= dt; e.x += e.vx * dt; continue }
    if (base) { try { base.update(e, dt) } catch (err) { console.warn('enemy', e.type, err); e.def = null } }
    else legacyEnemy(e, dt)
    if (e.fell) { e.dead = true; continue }
    if (!e.untargetable && !e.def?.noTouch && !P.dead && P.iframe <= 0 && boxHit(e.box(), hurtbox())) hurtPlayer(Math.round((e.def?.dmg || 10) * 0.6), Math.sign(P.x - e.x) || 1)
  }
  enemies = enemies.filter(e => !e.dead)
}
// the two drone kinds the first level had, for when enemies.js is missing
function legacyEnemy(e, dt) {
  if (e.type !== 'sentry') {
    const tx = e.hx + Math.sin(e.t * 0.7) * 80, ty = e.hy + Math.sin(e.t * 1.3) * 34
    e.x += (tx - e.x) * Math.min(1, dt * 2) + e.vx * dt; e.y += (ty - e.y) * Math.min(1, dt * 2)
    if ((e.fire -= dt) <= 0 && Math.abs(e.x - P.x) < 900 && !P.dead) { e.fire = R(1.5, 2.3); const a = ang(e.x, e.y, P.x, P.y - 60); for (let i = -1; i <= 1; i++) bullets.push(ebullet(e.x, e.y, a + i * 0.2, 330)) }
  } else {
    e.x += e.vx * dt
    if ((e.fire -= dt) <= 0 && Math.abs(e.x - P.x) < 900 && !P.dead) { e.fire = 2.6; const off = R(0, 1); for (let i = 0; i < 14; i++) bullets.push(ebullet(e.x, e.y, (i + off) / 14 * Math.PI * 2, 230, { r: 8 })) }
  }
}

// ---------------------------------------------------------------- sections
function curSection() { return stage.sections.find(s => P.x >= s.from && P.x < s.to) || stage.sections.at(-1) }
function updateStage(dt) {
  stageT += dt
  for (const s of stage.sections) {
    if (s.cleared || P.x < s.from + 10) continue
    if (s.kind === 'run' || s.kind === 'titan') {
      if (!s.started) { s.started = true; wave = s.k; if (s.kind === 'titan') startTitan(s) }
      ;(s.waves || []).forEach((w, i) => {
        if (s.fired.has(i)) return
        if (w.when === 'enter' || (w.when?.x != null && P.x >= w.when.x)) { s.fired.add(i); for (const en of w.enemies) s.mine.add(makeEnemy(en.type, en.x, en.y)) }
      })
      const allFired = (s.waves || []).every((w, i) => s.fired.has(i) || (w.when?.x != null && w.when.x > s.to))
      if (s.kind === 'run' && allFired && [...s.mine].every(e => e.dead) && (!s.boss || s.bossDone)) { s.cleared = true; if (s.waves?.length) arrow() }
    }
    if (s.kind === 'chase' && !s.started) startChase(s)
    if (s.kind === 'arena' && !s.started && P.x > s.from + 220) {
      s.started = true; arena = s; cam.lock = true; ARENA = s.from; ARW = s.to - s.from; wave = s.k
      for (const e of enemies) e.dead = true
      startBoss(s.boss, s, { until: s.until })
    }
  }
  // the chase wall
  if (chase) {
    chase.x += chase.speed * dt * (P.dead ? 0 : 1)
    chase.x = Math.max(chase.x, cam.x - 120)
    if (P.x < chase.x + 36) { P.x = chase.x + 36; if (P.iframe <= 0 && !P.dead) hurtPlayer(8, 1) }
    if (Math.random() < 0.8) parts.push({ x: chase.x + R(-10, 20), y: R(cam.y, GROUND), vx: R(40, 200), vy: R(-80, 40), life: R(0.3, 0.7), t: 0, size: R(4, 9), color: Math.random() < 0.5 ? '255,70,50' : '255,180,90', add: true })
    for (const e of enemies) if (e.x < chase.x) e.dead = true
    if (P.x >= chase.s.to - 40) endChase()
  }
  // crumbling platforms
  for (const p of plats) if (p.kind === 'crumble' && p.fall > 0) { p.fall -= dt; p.hit = 0.05; if (p.fall <= 0) { breakPlat(p); p.respawn = 5 } }
  if (TI) updateTitan(dt)
  // weather in view
  const wth = kit.weather, vx = cam.x, vw = VW()
  if (wth && wth !== 'none' && Math.random() < 0.7) {
    const x = vx + R(-50, vw + 50), y = cam.y + R(-40, 40)
    const P_ = { embers: ['255,150,70', 80, -40, 4, true], ash: ['120,100,95', 40, 60, 5, false], rain: ['255,230,220', -60, 900, 2, true], snow: ['255,245,240', 20, 70, 3, false], petals: ['255,190,190', 60, 80, 4, false], sparks: ['255,230,160', 0, 160, 2, true] }[wth]
    if (P_) parts.push({ x, y: wth === 'embers' ? cam.y + VH() + 20 : y, vx: P_[1] + R(-30, 30), vy: (wth === 'embers' ? -R(60, 140) : P_[2] + R(-20, 20)), life: R(2, 4), t: 0, size: R(P_[3] * 0.5, P_[3]), color: P_[0], add: P_[4], feather: wth === 'petals', streak: wth === 'rain', weather: true })
  }
}
// the right edge you may walk to, and the left edge
function rightBound() {
  if (arena) return arena.to - 30
  if (TI) return TI.s.to - 30
  for (const s of stage.sections) if (!s.cleared && s.kind === 'run') return s.to - 30
  return WORLD - 30
}
function leftBound() {
  if (arena) return arena.from + 30
  if (TI) return TI.s.from + 30
  return Math.max(30, chase ? chase.x + 36 : 30)
}
function sectionBeaten(s, killed) {
  if (!s) return
  s.cleared = true; arena = null; cam.lock = false
  const left = stage.sections.filter(x => (x.kind === 'arena' || x.kind === 'titan') && !x.cleared)
  if (!left.length && killed !== false) return later(1.2, stageClear)
  arrow()
}
function breakPlat(p) {
  p.broken = true; p.fall = 0
  SFX.heavy(); shake = Math.max(shake, 5)
  if (p.img) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) parts.push({ chunk: { img: p.img, sx: i * p.img.width / 4, sy: j * p.img.height / 2, sw: p.img.width / 4, sh: p.img.height / 2, s: p.s }, x: p.x + (i + 0.5) * p.w / 4, y: p.y + (j + 0.5) * p.h / 2, vx: R(-120, 120), vy: R(-100, 80), rot: 0, vr: R(-4, 4), life: 1.4, t: 0, g: 1800 })
}
function fellInPit() {
  P.x = clamp(P.safeX || P.x, leftBound() + 60, rightBound()); P.y = groundAt(P.x) - 300; P.vy = 0; P.vx = 0
  if (P.y === Infinity || isNaN(P.y)) P.y = GROUND - 300
  P.hp -= 10; P.iframe = 1.4; P.hurtAt = T; flash = 0.3; flashColor = '255,70,60'; SFX.hurt()
  if (P.hp <= 0) { P.hp = 0; P.dead = true; later(1.6, () => { mode = 'dead' }) }
}
function startChase(s) {
  s.started = true; wave = s.k
  chase = { s, x: Math.max(s.from - 400, cam.x - 100), speed: s.wall?.speed || 230, color: s.wall?.color || '#ff5a3c' }
  callout('RUN', P.x, P.y - 220, true)
  if (s.chaser) startBoss(s.chaser, s, { chase: true })
}
function endChase() {
  const s = chase.s; chase = null; s.cleared = true
  if (B?.chaser) { B.active = false; timers = timers.filter(t => t.tag !== 'boss'); bossLeap(B.x + 700, GROUND - 600, 0.9, 300); later(1.0, () => { if (B?.chaser) B = null }) }
  for (const b of bullets) if (b.enemy) cancel(b)
}

// ---------------------------------------------------------------- titan interludes
// The colossus stands behind the stage. Its attacks land on your lane, telegraphed in red.
// Stand in a seal's circle until it fills: each seal taken costs it part of its life.
const TITAN_SHEETS = { idle: 'a-idle', raise: 'a-raise', slam: 'a-slam', sweep: 'a-sweep', cast: 'a-cast', hurt: 'a-hurt', roar: 'a-roar' }
function preloadTitan(h) { const f = FIGHTS[h]; for (const n of Object.values(TITAN_SHEETS)) sheet(f?.sprite || 'asura', n) }
function startTitan(s) {
  const f = FIGHTS[s.titan] || { sprite: 'asura', hp: 4000, attacks: ['slam', 'sweep', 'spears', 'beam'], every: 2.2, name: 'Asura', en: 'ASURA', line: '' }
  TI = { s, f, handle: s.titan, sprite: f.sprite || 'asura', hp: 1, anim: 'roar', animT: 0, next: 2.6, step: 0, eye: 1, down: 0, x: (s.from + s.to) / 2 }
  callout(f.en || s.titan, cam.x + VW() / 2, cam.y + VH() * 0.3, true)
  subtitle(f.line_en || '', 3); shake = 12; flash = 0.3; flashColor = '255,80,60'; SFX.glare()
  if (s.boss) later(1.5, () => startBoss(s.boss, s, {}))
}
function updateTitan(dt) {
  const t = TI; t.animT += dt; t.eye = Math.max(0.4, t.eye - dt)
  if (t.down) { t.down -= dt; if (t.down <= 0) { const s = t.s; TI = null; s.cleared = true; s.bossDone = true; sectionBeaten(s, true) } return }
  // seals
  for (const z of t.s.seals) {
    if (z.done) continue
    const y = z.surf || GROUND, on = Math.abs(P.x - z.x) < 70 && Math.abs(P.y - y) < 8 && P.ground && !P.dead
    z.t = clamp(z.t + (on ? dt : -dt * 0.5), 0, z.need || 2.4)
    if (on && Math.random() < 0.5) parts.push({ x: z.x + R(-60, 60), y, vx: 0, vy: R(-260, -120), life: 0.6, t: 0, size: R(2, 4), color: '255,225,160', add: true })
    if (z.t >= (z.need || 2.4)) sealTaken(z)
  }
  t.hp = t.s.seals.filter(z => !z.done).length / Math.max(1, t.s.seals.length)
  if ((t.next -= dt) <= 0 && !P.dead) {
    const list = t.f.attacks || ['slam', 'sweep', 'spears', 'beam']
    const name = list[t.step++ % list.length]
    t.next = (t.f.every || 2.2) * (0.7 + 0.3 * t.hp) + (TITAN_ATTACKS[name]?.() || 0)
  }
}
function sealTaken(z) {
  z.done = true
  const t = TI
  t.anim = 'hurt'; t.animT = 0; t.eye = 2
  SFX.boom(); shake = 16; flash = 0.5; flashColor = '255,240,200'; slowT = 0.4
  
  const sx = z.x, sy = z.surf || GROUND
  fx.push({ t: 0, dur: 1.0, draw(k) {   // a pillar of light from the seal up into the colossus
    ctx.globalCompositeOperation = 'lighter'
    const w = 70 * (1 - k * 0.6), top = cam.y - 100
    const g = ctx.createLinearGradient(sx - w, 0, sx + w, 0); g.addColorStop(0, 'rgba(255,230,170,0)'); g.addColorStop(0.5, `rgba(255,252,235,${1 - k})`); g.addColorStop(1, 'rgba(255,230,170,0)')
    ctx.fillStyle = g; ctx.fillRect(sx - w, top, w * 2, sy - top)
  } })
  cancelBullets(sx, sy - 100, 400)
  P.meter = Math.min(100, P.meter + 25)
  if (t.s.seals.every(s => s.done)) { t.anim = 'roar'; t.animT = 0; t.down = 3.2; subtitle(t.f.downLine_en || '', 3); for (const b of bullets) if (b.enemy) cancel(b); for (const e of enemies) if (t.s.mine.has(e)) damage(e, 999, {}) }
  else later(0.9, () => { if (TI) { TI.anim = 'roar'; TI.animT = 0 } })
}
const TITAN_ATTACKS = {
  slam() {   // the great sword comes down on a stretch of floor
    const x = clamp(P.x + R(-60, 60), cam.x + 140, cam.x + VW() - 140), w = 240
    TI.anim = 'raise'; TI.animT = 0
    fx.push({ t: 0, dur: 1.15, kind: 'laser', x, draw(k) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,40,40,${0.12 + 0.25 * Math.abs(Math.sin(k * 16))})`; ctx.fillRect(x - w / 2, cam.y - 200, w, GROUND - cam.y + 200); ctx.fillStyle = 'rgba(255,60,50,0.6)'; ctx.fillRect(x - w / 2, GROUND - 4, w, 4) } })
    later(1.1, () => {
      if (!TI) return
      TI.anim = 'slam'; TI.animT = 0; TI.eye = 1.5
      shake = 22; SFX.boom(); flash = 0.25; flashColor = '255,90,60'
      if (Math.abs(P.x - x) < w / 2 + 10) hitPlayer(24, Math.sign(P.x - x) || 1)
      for (const e of enemies) if (Math.abs(e.x - x) < w / 2) damage(e, 40, { x: e.x, y: e.y })
      for (const p of plats) if (p.hp && !p.broken && p.x < x + w / 2 && p.x + p.w > x - w / 2) hurtPlat(p, 80)
      decals.push({ x, y: GROUND, r: 220, t: 10, max: 10 })
      if (typeof afterAttack === 'function') afterAttack('titan', x, GROUND)
      fx.push({ t: 0, dur: 0.5, draw(k) { ctx.globalCompositeOperation = 'lighter'; const a = 1 - k; ctx.fillStyle = `rgba(255,230,200,${a})`; ctx.fillRect(x - 30 * a, cam.y - 200, 60 * a, GROUND - cam.y + 200); ctx.fillStyle = `rgba(255,90,60,${0.5 * a})`; ctx.fillRect(x - w / 2, cam.y - 200, w, GROUND - cam.y + 200) } })
      for (let i = 0; i < 30; i++) parts.push({ x: x + R(-w / 2, w / 2), y: GROUND - 4, vx: R(-500, 500), vy: R(-700, -200), life: R(0.5, 1), t: 0, size: R(4, 9), color: '210,180,150', g: 1500 })
    })
    return 1.3
  },
  sweep() {   // the low arms sweep the floor: jump
    TI.anim = 'sweep'; TI.animT = 0
    const side = P.x > cam.x + VW() / 2 ? -1 : 1
    fx.push(sweepWarn(side)); later(0.75, () => fx.push(sweepWave(side)))
    return 1.2
  },
  spears() {   // spears rain from the halo onto red marks
    TI.anim = 'cast'; TI.animT = 0
    for (let i = 0; i < 7; i++) later(0.3 + i * 0.18, () => fx.push(laser(clamp(P.x + (i - 3) * 110 + R(-30, 30), cam.x + 40, cam.x + VW() - 40))))
    return 1.6
  },
  beam() {   // the red eye: dash through it or counter it
    TI.anim = 'roar'; TI.animT = 0; TI.eye = 3
    later(0.2, () => { SFX.glare(); dim = 1.6; fx.push(glareLock(1.2)) })
    return 1.8
  },
  summon() {
    TI.anim = 'cast'; TI.animT = 0
    const types = summonTypes()
    for (let i = 0; i < 2; i++) later(0.5 + i * 0.4, () => TI && TI.s.mine.add(spawnEnemy(types[i % types.length], clamp(P.x + (i ? 380 : -380), cam.x + 80, cam.x + VW() - 80), GROUND - 260)))
    return 1.2
  },
}
function drawTitan() {
  const t = TI; if (!t) return
  // it stands behind the stage: parallax, a little smaller when you zoom out, softened by haze
  const par = 0.45, sx = W / 2 + (t.x - (cam.x + VW() / 2)) * par * cam.z
  const hh = H * 1.2 * (0.8 + 0.2 * cam.z), by = H * 1.02 + (t.down > 0 ? (3.2 - t.down) * 120 : 0)
  const s = sheet(t.sprite, TITAN_SHEETS[t.anim] || 'a-idle') || sheet(t.sprite, 'a-idle')
  const breathe = Math.sin(T * 1.2) * 6
  ctx.save()
  if (t.down > 0) ctx.globalAlpha = clamp(t.down / 3.2, 0, 1)
  if (s) {
    const once = t.anim !== 'idle', f = once ? Math.min(s.n - 1, (t.animT * 8) | 0) : ((t.animT * 5) | 0) % s.n
    if (once && t.animT > 1.6) { t.anim = 'idle'; t.animT = 0 }
    drawSheet(s, f, sx, by + breathe, 1, hh / s.h, 1)
  } else {
    // silhouette: six arms, a halo, one red eye
    ctx.translate(sx, by + breathe); const k = hh / 700
    ctx.scale(k, k)
    ctx.fillStyle = 'rgba(70,14,18,0.95)'
    ctx.beginPath(); ctx.moveTo(-170, 0); ctx.lineTo(-110, -430); ctx.lineTo(-60, -520); ctx.arc(0, -560, 60, Math.PI, 0); ctx.lineTo(110, -430); ctx.lineTo(170, 0); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(217,168,90,0.8)'; ctx.lineWidth = 6; ctx.stroke()
    for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { const a = -0.5 - i * 0.45 + Math.sin(T + i) * 0.08; ctx.save(); ctx.translate(sd * 70, -420 + i * 40); ctx.rotate(sd > 0 ? a : Math.PI - a); ctx.fillRect(0, -14, 260, 28); ctx.fillStyle = 'rgba(232,184,96,0.9)'; ctx.fillRect(250, -40, 16, 80); ctx.fillStyle = 'rgba(70,14,18,0.95)'; ctx.restore() }
    ctx.strokeStyle = 'rgba(255,220,150,0.6)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -580, 150, 0, Math.PI * 2); ctx.stroke()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  ctx.restore()
  // the eye, then haze in front of it so it sits back in the air
  const ex = sx, ey = by + breathe - hh * 0.86
  ctx.globalCompositeOperation = 'lighter'
  const r = 30 + 30 * Math.min(1, t.eye)
  const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r); g.addColorStop(0, `rgba(255,70,60,${0.5 + 0.3 * Math.min(1, t.eye)})`); g.addColorStop(1, 'rgba(255,30,30,0)')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = `rgba(255,120,110,${0.5 * Math.min(1, t.eye)})`; ctx.fillRect(ex - r * 2.5, ey - 1, r * 5, 2)
  ctx.globalCompositeOperation = 'source-over'
  const hz = ctx.createLinearGradient(0, H * 0.35, 0, H); hz.addColorStop(0, 'rgba(60,15,15,0)'); hz.addColorStop(1, 'rgba(60,15,15,0.45)'); ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H)
}
function drawSeals() {
  if (!TI) return
  for (const z of TI.s.seals) {
    const y = z.surf || GROUND, k = z.t / (z.need || 2.4)
    ctx.save(); ctx.translate(z.x, y); ctx.globalCompositeOperation = 'lighter'
    if (z.done) { ctx.fillStyle = 'rgba(255,230,170,0.15)'; ctx.beginPath(); ctx.ellipse(0, 0, 70, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); continue }
    ctx.scale(1, 0.24)
    if (typeof drawMagicCircle === 'function') drawMagicCircle(0, 0, 80, 0.6 + 0.4 * k, T * 0.6)
    else { ctx.strokeStyle = 'rgba(255,220,150,0.8)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.stroke() }
    ctx.strokeStyle = 'rgba(255,250,235,0.95)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, 92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke()
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.restore()
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createLinearGradient(0, y - 260, 0, y); g.addColorStop(0, 'rgba(255,220,150,0)'); g.addColorStop(1, `rgba(255,230,170,${0.18 + 0.4 * k})`)
    ctx.fillStyle = g; ctx.fillRect(z.x - 26, y - 260, 52, 260); ctx.restore()
  }
}

// ---------------------------------------------------------------- camera
const CAM_CLOSE = /[?&]cam=wide/.test(location.search) ? 1 : 1.28
// Zoom in on the heroine when it's calm, out as the screen fills, and wide enough to keep a
// boss in frame. Big spells pull in close on her while she chants.
function updateCamera(dt) {
  const Z0 = stage?.zoom || { calm: 1.55, fight: 1.18, crowd: 0.92 }, K = CAM_CLOSE
  // fights sit closer than the stage data asks, so the painted art reads at full size (?cam=wide for the old framing)
  const Z = { calm: Z0.calm, fight: Math.min(Z0.calm, Z0.fight * K), crowd: Math.min(Z0.calm, Z0.crowd * K) }
  const live = targets().filter(e => Math.abs(e.x - P.x) < 1100)
  let z = live.length === 0 ? Z.calm : live.length >= 5 ? Z.crowd : Z.fight
  if (bullets.filter(b => b.enemy).length > 40) z = Math.min(z, Z.crowd)
  if (chase || TI) z = Math.min(z, Z.crowd)
  P.idleT = Math.abs(P.vx) < 20 && !P.act && P.ground ? (P.idleT || 0) + dt : 0
  if (!live.length && P.idleT > 2.5 && !chase) z += 0.2            // standing still: a closer look at her
  let cx = P.x + P.face * 110 / cam.z, cy = P.y - 110
  const lo = arena ? W / (arena.to - arena.from) : 0.6
  // one on one (a boss alone, or the last enemy): come in close and frame the two of them
  const duel = live.length === 1 && !chase && !TI && bullets.filter(b => b.enemy).length < 30 && !(B?.chaser)
  if (duel) {
    const e = live[0], span = Math.abs(e.x - P.x) + 440
    z = clamp(W / span, Z.fight, Z.calm + 0.15)
    cx = lerp(P.x, e.x, 0.45); cy = lerp(P.y, e === B ? B.y : e.y, 0.3) - 105
  } else if (B && !B.dead && (B.active || B.leap) && !B.chaser) {
    const span = Math.abs(B.x - P.x) + 520
    z = Math.min(z, Math.max(W / span, lo, Z.crowd * 0.92))
    cx = lerp(P.x, B.x, 0.35)
  }
  if (arena) z = Math.max(z, lo)
  if (cam.focus) {
    cam.focus.t -= dt
    z = cam.focus.z; cx = cam.focus.x ?? P.x; cy = cam.focus.y ?? P.y - 120
    if (cam.focus.t <= 0) { cam.focus = null; cam.kick = 0.5 }
  }
  if (cam.kick > 0) { cam.kick -= dt; z *= 0.88 }
  cam.z = lerp(cam.z, z, Math.min(1, dt * (z > cam.z ? (cam.focus ? 4 : 1.4) : 2.4)))
  const vw = VW(), vh = VH()
  let L = arena ? arena.from : 0, Rr = arena ? arena.to : Math.min(WORLD, rightBound() + 90)
  if (TI) { L = TI.s.from; Rr = TI.s.to }
  if (chase) L = Math.max(L, chase.x - 60)
  let tx = cx - vw / 2
  tx = Rr - L <= vw ? (L + Rr) / 2 - vw / 2 : clamp(tx, L, Rr - vw)
  cam.x = lerp(cam.x, tx, Math.min(1, dt * (cam.focus ? 5 : 6)))
  const base = GROUND + 80 - vh
  const ty = clamp(Math.min(base, cy - vh * 0.45), base - 420, base)
  cam.y = lerp(cam.y, ty, Math.min(1, dt * 4))
}

// ---------------------------------------------------------------- drawing the world
function drawFarPiece(img, x, y, w, h) { ctx.drawImage(img, x, y, w, h) }   // mood.js wraps it (heat haze)
function drawWorld() {
  const z = cam.z, sx = shake ? R(-shake, shake) : 0, sy = shake ? R(-shake, shake) : 0
  const K = kit || KITS.temple
  // sky
  const sky = K.sky, ss = H / sky.height * 1.05, sw = sky.width * ss
  const off = -(cam.x * 0.06) % sw
  for (let x = off - sw; x < W; x += sw) ctx.drawImage(sky, x, -(cam.y * 0.04) - H * 0.025, sw, H * 1.05)
  drawLookSky()
  // far scenery
  const pz = 1 + (z - 1) * 0.35
  ctx.save(); ctx.translate(W / 2, H * 0.9); ctx.scale(pz, pz); ctx.translate(-W / 2, -H * 0.9); ctx.translate(-cam.x * 0.3 + sx * 0.3, -(cam.y + 0) * 0.3)
  const span = K.farSpan || 1e9
  for (const f of K.far) for (let o = 0; o < WORLD + span; o += span) { const x = f.x + o; if (x * 1 + f.img.width * f.s < cam.x * 0.3 - 200 || x > cam.x * 0.3 + W / pz + 400) continue; ctx.globalAlpha = 0.85; drawFarPiece(f.img, x, f.y + Math.sin(T * 0.6 + x) * 6, f.img.width * f.s, f.img.height * f.s) }
  ctx.globalAlpha = 1; ctx.restore()
  if (TI) drawTitan()
  // haze
  const hz = ctx.createLinearGradient(0, 300, 0, H); hz.addColorStop(0, K.haze[0]); hz.addColorStop(1, K.haze[1]); ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H)
  if (typeof pushBack === 'function') pushBack(K)   // look.js: the background steps back behind the fighters

  ctx.save(); ctx.scale(z, z); ctx.translate(-cam.x + sx, -cam.y + sy)
  const vw = VW()
  // ground, with holes where the pits are
  const gimg = K.ground.img, gs = K.ground.s, gw = gimg.width * gs, gy = GROUND - K.ground.top * gs
  ctx.save()
  if (pits.length) {
    ctx.beginPath(); let x0 = cam.x - 100
    for (const [a, b] of [...pits].sort((p, q) => p[0] - q[0])) { if (b < x0) continue; ctx.rect(x0, gy - 40, Math.max(0, a - x0), H * 2); x0 = b }
    ctx.rect(x0, gy - 40, cam.x + vw + 200 - x0, H * 2); ctx.clip()
  }
  for (let x = Math.floor(cam.x / gw) * gw; x < cam.x + vw + gw; x += gw) ctx.drawImage(gimg, x, gy, gw, gimg.height * gs)
  ctx.fillStyle = '#2a1410'; ctx.fillRect(cam.x - 100, gy + gimg.height * gs - 2, vw + 300, H)
  ctx.restore()
  for (const [a, b] of pits) { if (b < cam.x || a > cam.x + vw) continue; const g = ctx.createLinearGradient(0, GROUND - 10, 0, GROUND + 260); g.addColorStop(0, 'rgba(20,6,6,0.2)'); g.addColorStop(1, 'rgba(10,2,2,0.95)'); ctx.fillStyle = g; ctx.fillRect(a, GROUND - 10, b - a, 300 + VH()) }
  // platforms and props
  for (const p of plats) {
    if (p.broken || p.x > cam.x + vw + 50 || p.x + p.w < cam.x - 50) continue
    ctx.globalAlpha = p.reform ? 1 - p.reform : 1
    const j = p.hit ? R(-3, 3) : 0
    if (p.img) ctx.drawImage(p.img, p.x + j, p.y + (p.kind === 'crumble' && p.fall > 0 ? R(0, 3) : 0), p.w, p.h)
    else { ctx.fillStyle = '#4a2a22'; ctx.fillRect(p.x, p.y, p.w, p.h) }
    if (p.kind === 'crumble') { ctx.strokeStyle = `rgba(255,120,80,${p.fall > 0 ? 0.8 : 0.35})`; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(p.l, p.surf + 2); ctx.lineTo(p.r, p.surf + 2); ctx.stroke(); ctx.setLineDash([]) }
    ctx.globalAlpha = 1
    if (p.kind === 'brazier' && Math.random() < 0.7) parts.push({ x: p.x + p.w / 2 + R(-8, 8), y: p.y + 14, vx: R(-15, 15), vy: R(-140, -60), life: 0.4, t: 0, size: R(3, 7), color: '255,160,70', add: true })
  }
  for (const d of decals) {
    const a = Math.min(1, d.t / d.max * 1.5) * 0.75
    // a soft flat ellipse: the round gradient used to be cut by a short rect, which left hard-edged dark bars
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, d.r); gr.addColorStop(0, `rgba(20,8,6,${a})`); gr.addColorStop(0.6, `rgba(20,8,6,${a * 0.45})`); gr.addColorStop(1, 'rgba(20,8,6,0)')
    ctx.save(); ctx.translate(d.x, d.y); ctx.scale(1, 0.22); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
  for (const f of patches) if (f.kind === 'fire') { ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createLinearGradient(0, f.y - 50, 0, f.y); gr.addColorStop(0, 'rgba(255,120,40,0)'); gr.addColorStop(1, `rgba(255,140,50,${0.5 * Math.min(1, f.t)})`); ctx.fillStyle = gr; ctx.fillRect(f.l, f.y - 50, f.r - f.l, 50); ctx.globalCompositeOperation = 'source-over' }
  drawSeals()
  // the chase wall: a crimson storm closing from the left
  if (chase) {
    ctx.globalCompositeOperation = 'lighter'
    const x = chase.x, g = ctx.createLinearGradient(x - 260, 0, x + 40, 0); g.addColorStop(0, 'rgba(255,40,30,0.85)'); g.addColorStop(0.8, 'rgba(255,90,60,0.55)'); g.addColorStop(1, 'rgba(255,120,80,0)')
    ctx.fillStyle = g; ctx.fillRect(x - 260, cam.y - 50, 300, VH() + 100)
    ctx.strokeStyle = 'rgba(255,230,200,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); for (let y = cam.y - 50; y < cam.y + VH() + 50; y += 30) ctx.lineTo(x + Math.sin(y * 0.05 + T * 12) * 10, y); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }
  if (typeof drawHazards === 'function') drawHazards()
  if (B) drawBoss()
  for (const e of enemies) {
    const base = e.def && ENEMY_BASES[e.def.base]
    if (base) { try { ctx.save(); base.draw(e); ctx.restore() } catch (err) { ctx.restore(); drawEnemy(e) } } else drawEnemy(e)
  }
  // the heroine: shadow, afterimages, chant circle, sprite
  const fy = groundAt(P.x, P.y - 2), sh = Math.min(1, (fy - P.y) / 400)
  if (fy < Infinity) { ctx.fillStyle = `rgba(30,10,10,${0.35 * (1 - sh)})`; ctx.beginPath(); ctx.ellipse(P.x, fy - 2, 46 * (1 - sh * 0.5), 10 * (1 - sh * 0.5), 0, 0, Math.PI * 2); ctx.fill() }
  for (const t of P.trail) { const a = 0.35 * (1 - (T - t.t) / 0.3); ctx.globalCompositeOperation = 'lighter'; drawSprite(t.hero, t.sheet, t.frame, t.x, t.y, t.face, a * 0.6); ctx.globalCompositeOperation = 'source-over' }
  if (mode === 'play' || mode === 'boon') {
    if (P.chant) drawChant(true)
    const a = pickAnim()
    // only after a real hit, and a soft pulse instead of a see-through strobe (moves that grant
    // invincibility, like the ult, counter or dash, no longer make her flicker)
    const hurtWin = P.iframe > 0 && P.hurtT <= 0 && P.dashT <= 0 && !P.chant && T - (P.hurtAt ?? -99) < 1.1
    const blink = hurtWin ? 0.82 + 0.18 * (0.5 + 0.5 * Math.cos(T * 18)) : 1
    if (P.holdJ > 0.42) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,210,140,${0.15 + 0.1 * Math.sin(T * 30)})`; ctx.beginPath(); ctx.arc(P.x, P.y - 70, 90, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over' }
    drawSprite(P.hero, a.sheet, a.frame, P.x, P.y, P.face, blink)
    if (P.chant) drawChant(false)
    if (P.hero === 'runner' && !P.dead && !P.chant) { const h = handPos(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,236,200,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x + Math.cos(P.aim) * 40, h.y + Math.sin(P.aim) * 40, 7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h.x + Math.cos(P.aim) * 16, h.y + Math.sin(P.aim) * 16); ctx.lineTo(h.x + Math.cos(P.aim) * 30, h.y + Math.sin(P.aim) * 30); ctx.stroke(); ctx.globalCompositeOperation = 'source-over' }
    if (P.shield > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,240,220,${0.35 + 0.2 * Math.sin(T * 10)})`; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { const aa = T * 2 + i * Math.PI / 3; ctx.beginPath(); ctx.ellipse(P.x + Math.cos(aa) * 110, P.y - 70 + Math.sin(aa) * 60, 14, 6, aa, 0, Math.PI * 2); ctx.stroke() } ctx.globalCompositeOperation = 'source-over' }
    if (P.act && P.act.name === 'counter' && P.guard > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,240,210,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y - 70, 80, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over' }
  }
  ctx.globalCompositeOperation = 'lighter'
  for (const b of bullets) drawBullet(b)
  ctx.globalCompositeOperation = 'source-over'
  for (const f of fx) { ctx.save(); try { f.draw(f.t / f.dur) } catch (err) { f.t = f.dur } ctx.restore() }
  if (fxk()?.draw) { ctx.save(); try { FXK.draw() } catch (err) { console.warn('FXK', err) } ctx.restore() }
  for (const p of parts) drawPart(p)
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
  for (const c of callouts) drawCallout(c)
  ctx.restore()
  // foreground
  ctx.save(); ctx.scale(z, z); ctx.translate(-cam.x * 1.15 + sx, -cam.y)
  const fspan = K.foreSpan || 1e9
  for (const f of K.fore) for (let o = 0; o < WORLD * 1.2; o += fspan) { const x = f.x + o; if (x > cam.x * 1.15 + vw + 100 || x + f.img.width * f.s < cam.x * 1.15 - 100) continue; ctx.drawImage(f.img, x, f.y, f.img.width * f.s, f.img.height * f.s) }
  ctx.restore()
}
function drawLookSky() {
  if (look === 'red_moon') {
    const x = W * 0.72, y = H * 0.22, g = ctx.createRadialGradient(x, y, 20, x, y, 200); g.addColorStop(0, 'rgba(255,90,70,0.95)'); g.addColorStop(0.45, 'rgba(200,30,30,0.6)'); g.addColorStop(1, 'rgba(120,10,10,0)')
    ctx.fillStyle = 'rgba(90,10,10,0.35)'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 200, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,150,120,0.9)'; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill()
  } else if (look === 'dark') { ctx.fillStyle = 'rgba(25,6,10,0.55)'; ctx.fillRect(0, 0, W, H) }
  else if (look === 'storm') {
    ctx.fillStyle = 'rgba(40,20,20,0.45)'; ctx.fillRect(0, 0, W, H)
    if (Math.random() < 0.01) { flash = Math.max(flash, 0.25); flashColor = '255,240,210'; SFX.zap() }
  }
}

// ---------------------------------------------------------------- the Oracle's big spells
// E picks a spell, F casts it: she chants (the circle opens, the camera comes in close), then it fires.
const spellDef = id => CFG.heroes.runner.spells?.[id]
// the run's upgrade level of a spell, 1 to 3: spells.js draws each level bigger (o.lv)
const SPELL_MAX = 3
const spellLv = id => clamp(RUN.tiers?.[id] || 1, 1, SPELL_MAX)
function cycleSpell() { if (RUN.spells.length) { RUN.spell = (RUN.spell + 1) % RUN.spells.length; const s = spellDef(RUN.spells[RUN.spell]); if (s) callout(s.en || '', P.x, P.y - 200) } }
function spellReady(id) { const s = spellDef(id); return s && !(P.cds['sp:' + id] > 0) && P.meter >= (s.meter || 0) }
function startChant(id = RUN.spells[RUN.spell]) {
  const s = spellDef(id)
  if (!s || P.chant || P.hero !== 'runner' || !spellReady(id)) return false
  const tier = s.tier || 1, dur = [0.25, 0.3, 0.8, 1.6][tier] * Math.pow(0.8, nB('focus'))
  P.chant = { id, s, t: 0, dur, tier }
  P.act = null; P.meter -= s.meter || 0
  if (tier >= 2) { if (s.voice !== false) say('runner', `spell-${id}-chant`, true); subtitle(s.chant_en || '', dur + 0.6); dim = Math.max(dim, tier >= 3 ? 1.6 : 0.8) }
  const Z = stage?.zoom || { calm: 1.25 }
  cam.focus = { z: Math.max(s.zoom || 1.1, Z.calm) + (tier >= 3 ? 0.35 : tier >= 2 ? 0.2 : 0.05), t: dur + 0.1 }
  if (tier >= 3) slowT = Math.max(slowT, dur * 0.5)
  return true
}
function updateChant(dt) {
  const c = P.chant; c.t += dt
  P.vx *= 0.8; if (!P.ground) P.vy = Math.min(P.vy, 60)
  if (Math.random() < 0.6) { const a = R(0, Math.PI * 2), r = R(60, 140); parts.push({ x: P.x + Math.cos(a) * r, y: P.y - 80 + Math.sin(a) * r * 0.6, vx: -Math.cos(a) * r * 2, vy: -Math.sin(a) * r * 1.2, life: 0.4, t: 0, size: R(2, 4), color: '255,230,170', add: true }) }
  if (c.t < c.dur) return
  P.chant = null
  const s = c.s, h = handPos(), power = (1 + c.tier * 0.5) * (1 + 0.25 * nB('edge'))
  P.cds['sp:' + c.id] = (s.cd || 6) * Math.pow(0.75, nB('focus'))
  if (s.voice !== false) say('runner', `spell-${c.id}`, true)
  nameSub(s.en || '', 1.6)
  // Setting Star keeps its release tint soft so the arena stays readable before the crash
  if (s.kind === 'meteor' && typeof spSoftFlash === 'function') spSoftFlash(0.2, '255,240,210', 0.25)
  else { flash = 0.25 + 0.1 * c.tier; flashColor = '255,240,210' }
  shake = Math.max(shake, 4 * c.tier)
  const lv = spellLv(c.id)
  const o = { x: h.x, y: h.y, aim: P.aim, dir: P.face, tier: c.tier, lv, power: power * (1 + 0.25 * (lv - 1)) }
  try { if (typeof SPELLS !== 'undefined' && SPELLS[s.kind]) return SPELLS[s.kind](s, o) } catch (err) { console.warn('spell', s.kind, err) }
  // no spells.js: pillars of light on what she aims at
  const ts = targets().sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)).slice(0, 2 + c.tier)
  ts.forEach((e, i) => later(i * 0.1, () => pillar(e.x, e)))
}
function drawChant(behind) {
  const c = P.chant, k = Math.min(1, c.t / c.dur), r = 90 + 50 * c.tier + 22 * (spellLv(c.id) - 1)
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  if (behind) {   // flat on the ground under her
    ctx.translate(P.x, P.y); ctx.scale(1, 0.28)
    if (typeof drawMagicCircle === 'function') drawMagicCircle(0, 0, r * 1.3, k, T * 0.8)
    else { ctx.strokeStyle = `rgba(255,220,150,${0.8 * k})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, r * 1.3 * k, 0, Math.PI * 2); ctx.stroke() }
  } else if (c.tier >= 2) {   // upright in front of her hand
    const h = handPos(); ctx.translate(h.x + Math.cos(P.aim) * 40, h.y + Math.sin(P.aim) * 40); ctx.rotate(P.aim); ctx.scale(0.3, 1)
    if (typeof drawMagicCircle === 'function') drawMagicCircle(0, 0, r * 0.8, k, -T * 1.4)
    else { ctx.strokeStyle = `rgba(255,230,170,${k})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r * 0.8 * k, 0, Math.PI * 2); ctx.stroke() }
  }
  ctx.restore()
}

// ---------------------------------------------------------------- boons: pick one of three after each stage
const BOONS = {
  edge: { name: 'Keen Edge', en: 'harder hits', icon: 'sword', max: 4 },
  swift: { name: 'Gale Step', en: 'quicker dash', icon: 'wing', max: 3 },
  ember: { name: 'Embers', en: 'hits burn', icon: 'flame', max: 3 },
  storm: { name: 'Stormblessed', en: 'hits shock', icon: 'bolt', max: 3 },
  vigor: { name: 'Unbroken', en: 'more life', icon: 'heart', max: 4 },
  mirror: { name: 'Mirror', en: 'stronger reflects', icon: 'ring', max: 3 },
  focus: { name: 'Swift Chant', en: 'faster spells', icon: 'circle', max: 3 },
  zeal: { name: 'Zeal', en: 'more meter', icon: 'sun', max: 3 },
  leech: { name: 'Lifedrink', en: 'kills heal', icon: 'drop', max: 3 },
}
// The offer mixes the build: an upgrade for a spell she carries (up:<id>, to the next level),
// a new spell (spell:<id>: added while she carries one, else it takes the chosen spell's place),
// and boons.
function boonOffer() {
  const pool = Object.entries(BOONS).filter(([id, b]) => nB(id) < b.max).map(([id]) => id)
  const spells = pullable().filter(id => !RUN.spells.includes(id)).map(id => 'spell:' + id)
  const ups = RUN.spells.filter(id => spellLv(id) < SPELL_MAX).map(id => 'up:' + id)
  const pick = []
  if (ups.length) pick.push(ups.splice((Math.random() * ups.length) | 0, 1)[0])
  if (spells.length && Math.random() < 0.75) pick.push(spells[(Math.random() * spells.length) | 0])
  if (ups.length && Math.random() < 0.35) pick.push(ups[0])
  while (pick.length < 3 && pool.length) pick.push(pool.splice((Math.random() * pool.length) | 0, 1)[0])
  return pick.sort(() => Math.random() - 0.5)
}
const SPELL_ICON = { bolt_rain: 'bolt', thunder_spear: 'spear', chain: 'bolt', storm_field: 'storm', holy_cross: 'cross', summon_blades: 'sword', ice_lance: 'spear', meteor: 'flame', pillar_wall: 'pillars', sun_beam: 'beam', great_crescent: 'moon', petal_tornado: 'petal', flame_wave: 'flame', wind_blade: 'wing', gravity_well: 'ring' }
function boonInfo(id) {
  if (id.startsWith('up:')) { const sid = id.slice(3), s = spellDef(sid), lv = spellLv(sid); return { name: s?.en || 'Spell', en: '', icon: SPELL_ICON[s?.kind] || 'tome', pips: lv, next: true } }
  if (id.startsWith('spell:')) {
    const s = spellDef(id.slice(6)), old = RUN.spells.length >= 2 ? spellDef(RUN.spells[RUN.spell]) : null
    return { name: s?.en || 'New Spell', en: old ? 'in place of ' + (old.en || '') : 'new spell', icon: SPELL_ICON[s?.kind] || 'tome', pips: 0 }
  }
  return BOONS[id]
}
function takeBoon(id) {
  if (id.startsWith('up:')) { const sid = id.slice(3); RUN.tiers[sid] = spellLv(sid) + 1; RUN.spell = Math.max(0, RUN.spells.indexOf(sid)) }
  else if (id.startsWith('spell:')) { const sid = id.slice(6); RUN.tiers[sid] = 1; if (RUN.spells.length >= 2) RUN.spells[RUN.spell] = sid; else { RUN.spells.push(sid); RUN.spell = RUN.spells.length - 1 } }
  else RUN.boons[id] = nB(id) + 1
  if (id === 'vigor') { P.max += 30; P.hp += 30 }
}
function stageClear() {
  if (stageIdx >= STAGES.length - 1) { mode = 'win'; return }
  RUN.offer = boonOffer(); RUN.pick = 1; RUN.offerT = 0
  mode = 'boon'
  say(P.hero, 'bark-win', true)
}
function drawBoon(dt) {
  if (RUN.kind === 'pull') return drawPull(dt)
  RUN.offerT += dt
  T += dt
  for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt }
  parts = parts.filter(p => p.t < p.life)
  drawWorld(); drawOverlay()
  ctx.fillStyle = 'rgba(25,8,8,0.55)'; ctx.fillRect(0, 0, W, H)
  // her, lit from above, like the level-up screen
  const g = ctx.createRadialGradient(W / 2, 250, 10, W / 2, 250, 240); g.addColorStop(0, 'rgba(255,220,160,0.35)'); g.addColorStop(1, 'rgba(255,220,160,0)'); ctx.fillStyle = g; ctx.fillRect(W / 2 - 260, 20, 520, 420)
  { const nm = P.hero === 'runner' ? 'o-idle' : 'm-idle', n = A.sheets?.[P.hero]?.[nm]?.n || 6; drawSprite(P.hero, nm, ((RUN.offerT * n / (n > 12 ? 2.79 : 1.5)) | 0) % n, W / 2, 330, 1, 1, 0.75) }
  const n = RUN.offer.length, cw = 250, chh = 330, gap = 46, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2
  const looks = [['#f6dc9a', '#c08a3a', '#3a1a0c'], ['#a3202a', '#5a0c12', '#fff1dc'], ['#f4ece2', '#cfb79a', '#3a1a0c']]
  RUN.offer.forEach((id, i) => {
    const b = boonInfo(id), on = RUN.pick === i, x = x0 + i * (cw + gap), y = 360 - (on ? 14 : 0), [c0, c1, ink] = looks[i % 3]
    const k = Math.min(1, Math.max(0, RUN.offerT * 3 - i * 0.4))
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 60)
    if (on) { ctx.shadowColor = 'rgba(255,210,140,0.9)'; ctx.shadowBlur = 30 }
    const cg = ctx.createLinearGradient(0, y, 0, y + chh); cg.addColorStop(0, c0); cg.addColorStop(1, c1)
    ctx.fillStyle = cg; cardPath(x, y, cw, chh); ctx.fill(); ctx.shadowBlur = 0
    ctx.strokeStyle = '#e8c070'; ctx.lineWidth = on ? 5 : 3; cardPath(x, y, cw, chh); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,240,210,0.5)'; ctx.lineWidth = 1.5; cardPath(x + 10, y + 10, cw - 20, chh - 20); ctx.stroke()
    ctx.fillStyle = '#c8282e'; for (const yy of [y + 4, y + chh - 4]) { ctx.beginPath(); ctx.moveTo(x + cw / 2, yy - 12); ctx.lineTo(x + cw / 2 + 10, yy); ctx.lineTo(x + cw / 2, yy + 12); ctx.lineTo(x + cw / 2 - 10, yy); ctx.fill() }
    const cx = x + cw / 2, cy = y + 120
    ctx.fillStyle = 'rgba(120,20,24,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 4; ctx.stroke()
    drawIcon(b.icon, cx, cy)
    ctx.textAlign = 'center'; ctx.fillStyle = ink; fitFont(b.name, 26, cw - 40); ctx.fillText(b.name, cx, y + 240)
    ctx.font = '600 14px Cinzel, serif'; ctx.globalAlpha = k * 0.8; ctx.fillText(b.en.toUpperCase(), cx, y + 270)
    if (b.next) tierPips(cx, y + 292, b.pips, 1, 1.2)
    else { const have = id.startsWith('spell:') ? 0 : nB(id)
      for (let j = 0; j < have; j++) { ctx.fillStyle = '#c8282e'; ctx.beginPath(); ctx.arc(cx - (have - 1) * 9 + j * 18, y + 296, 5, 0, Math.PI * 2); ctx.fill() } }
    ctx.restore()
  })
  if (tap('arrowleft', 'a')) RUN.pick = (RUN.pick + n - 1) % n
  if (tap('arrowright', 'd')) RUN.pick = (RUN.pick + 1) % n
  if (mouse.on) RUN.offer.forEach((_, i) => { const x = x0 + i * (cw + gap); if (mouse.x > x && mouse.x < x + cw && mouse.y > 340 && mouse.y < 700) RUN.pick = i })
  if (RUN.offerT > 0.8 && (tap('j', 'enter', ' ') || (AUTO.on && RUN.offerT > 1.6))) {
    takeBoon(RUN.offer[RUN.pick])
    P.hp = Math.min(P.max, P.hp + P.max * 0.4)
    startStage(stageIdx + 1)
  }
}
function cardPath(x, y, w, h) {
  const c = 26
  ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.quadraticCurveTo(x + w, y, x + w, y + c); ctx.lineTo(x + w, y + h - c * 2)
  ctx.quadraticCurveTo(x + w, y + h - c, x + w / 2 + 30, y + h - 10); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x + w / 2 - 30, y + h - 10)
  ctx.quadraticCurveTo(x, y + h - c, x, y + h - c * 2); ctx.lineTo(x, y + c); ctx.quadraticCurveTo(x, y, x + c, y); ctx.closePath()
}
function drawIcon(icon, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = '#fff1dc'; ctx.fillStyle = '#f2c070'; ctx.lineWidth = 5
  const P2 = (pts, fill) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); if (fill) { ctx.closePath(); ctx.fill() } else ctx.stroke() }
  if (icon === 'sword') { ctx.rotate(-0.7); P2([[-6, 30], [-6, -36], [0, -46], [6, -36], [6, 30]], true); P2([[-20, 30], [20, 30]]); P2([[0, 30], [0, 44]]) }
  else if (icon === 'wing') { for (const s of [-1, 1]) { ctx.save(); ctx.scale(s, 1); for (let i = 0; i < 4; i++) P2([[6, -10 + i * 8], [40 - i * 6, -30 + i * 14]]); ctx.restore() } }
  else if (icon === 'flame') { P2([[0, -42], [18, -10], [22, 14], [10, 34], [-10, 34], [-22, 14], [-14, -6], [-6, 4]], true) }
  else if (icon === 'bolt') { P2([[8, -44], [-16, 4], [2, 4], [-8, 44], [18, -8], [0, -8]], true) }
  else if (icon === 'heart') { ctx.beginPath(); ctx.moveTo(0, 34); ctx.bezierCurveTo(-46, 4, -26, -38, 0, -14); ctx.bezierCurveTo(26, -38, 46, 4, 0, 34); ctx.fill() }
  else if (icon === 'ring') { ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke() }
  else if (icon === 'circle') { ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.stroke(); P2([[0, -36], [31, 18], [-31, 18], [0, -36]]); P2([[0, 36], [31, -18], [-31, -18], [0, 36]]) }
  else if (icon === 'sun') { ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P2([[Math.cos(a) * 24, Math.sin(a) * 24], [Math.cos(a) * 40, Math.sin(a) * 40]]) } }
  else if (icon === 'drop') { ctx.fillStyle = '#e84a3c'; P2([[0, -40], [22, 6], [14, 30], [-14, 30], [-22, 6]], true) }
  else if (icon === 'storm') { ctx.beginPath(); ctx.ellipse(0, -24, 38, 14, 0, 0, Math.PI * 2); ctx.fill(); P2([[-10, -12], [-20, 8], [-8, 8], [-16, 34]]); P2([[14, -12], [6, 10], [18, 10], [10, 36]]) }
  else if (icon === 'pillars') { for (const x of [-26, 0, 26]) P2([[x - 8, 38], [x - 6, 0], [x, x ? -26 : -44], [x + 6, 0], [x + 8, 38]], true); P2([[-40, 38], [40, 38]]) }
  else if (icon === 'beam') { ctx.beginPath(); ctx.arc(-26, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-22, -9, 64, 18); P2([[-22, -22], [44, -16]]); P2([[-22, 22], [44, 16]]) }
  else if (icon === 'cross') { ctx.fillRect(-7, -42, 14, 84); ctx.fillRect(-36, -12, 72, 14); ctx.beginPath(); ctx.arc(0, -5, 20, 0, Math.PI * 2); ctx.stroke() }
  else if (icon === 'moon') { ctx.beginPath(); ctx.arc(0, 0, 40, -1.2, 1.2); ctx.arc(-18, 0, 50, 0.84, -0.84, true); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 40, -1.2, 1.2); ctx.stroke() }
  else if (icon === 'petal') { for (let i = 0; i < 5; i++) { ctx.save(); ctx.rotate(i / 5 * Math.PI * 2); ctx.beginPath(); ctx.ellipse(0, -22, 11, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore() } ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke() }
  else if (icon === 'spear') { ctx.rotate(-0.8); P2([[0, -46], [9, -24], [3, -24], [3, 40], [-3, 40], [-3, -24], [-9, -24]], true) }
  else { ctx.fillRect(-28, -34, 56, 68); ctx.strokeRect(-28, -34, 56, 68); P2([[0, -34], [0, 34]]); ctx.fillStyle = '#c8282e'; ctx.beginPath(); ctx.arc(14, 0, 7, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
}

// ---------------------------------------------------------------- run and stage start
function startRun() {
  RUN.boons = {}; RUN.spells = ['chain', 'spear'].filter(id => spellDef(id)); RUN.spell = 0; RUN.carry = {}; RUN.tiers = {}; RUN.kind = null
  if (!RUN.spells.length) RUN.spells = Object.keys(CFG.heroes.runner.spells || {}).slice(0, 2)
  // ?spells=field,wall&tier=3 sets the loadout (and its level) and skips the pull
  const q = new URLSearchParams(location.search), want = (q.get('spells') || '').split(',').filter(id => spellDef(id))
  if (want.length) { RUN.spells = want; for (const id of want) RUN.tiers[id] = clamp(+q.get('tier') || 1, 1, SPELL_MAX) }
  RUN.pullNext = !want.length && q.get('pull') !== '0'
  resetPlayer()
  startStage(Math.max(0, Math.min((STAGES?.length || 1) - 1, +(new URLSearchParams(location.search).get('stage') || 0) || 0)))
}
async function startStage(i) {
  mode = 'loading'
  const keep = { hp: P.hp, max: P.max, meter: P.meter, hero: P.hero }
  enemies = []; bullets = []; fx = []; parts = []; decals = []; patches = []; timers = []; callouts = []; if (typeof HZ !== 'undefined') HZ = []
  B = null; combo = 0; cam.lock = false; cam.focus = null; stageT = 0
  if (!STAGES) { kit = KITS.temple; STAGES = [templeStage()] }
  kit = await loadKit(STAGES[i].kit)
  buildStage(i)
  Object.assign(P, { x: 140, y: GROUND, vx: 0, vy: 0, face: 1, act: null, chant: null, dead: false, safeX: 140, trail: [], cds: {} }, keep.max ? keep : {})
  cam.x = 0; cam.z = (stage.zoom?.calm || 1.25) + 0.3; cam.y = GROUND + 80 - VH()
  mode = 'play'
  say(P.hero, 'bark-start', true)
  callout((stage.name || '').toUpperCase(), P.x + 260, GROUND - 330, true)
  cam.focus = { z: (stage.zoom?.calm || 1.25) + 0.35, t: 1.4 }
  if (RUN.pullNext && P.hero === 'runner') startPull()
  RUN.pullNext = false
}
// a card title shrinks until it fits inside the card (long spell names ran off the edge)
function fitFont(t, px, w, weight = 700) { let n = px; do { ctx.font = `${weight} ${n}px Cinzel, serif` } while (ctx.measureText(t).width > w && --n > 12) }

// the first level, for when stages.json is missing
function templeStage() {
  return { id: 'temple', name: 'Sky Temple', jp: '天空神殿', kit: null, length: 3960, zoom: { calm: 1.55, fight: 1.18, crowd: 0.92 }, sections: [
    { kind: 'run', from: 0, to: 1300, plats: [{ role: 'stairs', x: 300 }, { role: 'ledge', x: 560, surf: 480 }, { role: 'ledge', x: 820, surf: 380 }, { role: 'step', x: 700, surf: 250 }, { role: 'prop', x: 1170, kind: 'brazier', hp: 30 }], waves: [{ when: 'enter', enemies: [{ type: 'drone', x: 700, y: 300 }, { type: 'drone', x: 980, y: 220 }, { type: 'drone', x: 1150, y: 320 }, { type: 'drone', x: 880, y: 470 }] }] },
    { kind: 'run', from: 1300, to: 2680, plats: [{ role: 'column', x: 1420, hp: 60 }, { role: 'bridge', x: 1560, surf: 460 }, { role: 'step', x: 1960, surf: 320 }, { role: 'ledge', x: 2280, surf: 430 }, { role: 'column', x: 2560, hp: 60 }], waves: [{ when: 'enter', enemies: [{ type: 'drone', x: 1700, y: 280 }, { type: 'drone', x: 2000, y: 200 }, { type: 'drone', x: 2350, y: 260 }, { type: 'sentry', x: 1700, y: 420 }, { type: 'sentry', x: 2400, y: 390 }] }] },
    { kind: 'arena', from: 2680, to: 3960, boss: 'Teknium', plats: [{ role: 'ledge', x: 2770, surf: 480 }, { role: 'ledge', x: 3060, surf: 340 }, { role: 'ledge', x: 3580, surf: 480 }, { role: 'step', x: 2820, surf: 230 }, { role: 'step', x: 3670, surf: 230 }, { role: 'column', x: 3320, hp: 70 }] },
  ] }
}

// ---------------------------------------------------------------- the pull: her opening spells
// At the start of a run the Oracle is dealt three spells from her whole book, face down. They
// flip over one by one, with a shine and a glow for their rarity (the spell's tier: 1 common,
// 2 rare, 3 grand). She takes two; J takes the lit card, K or Esc keeps what she has (or the lit
// card) and starts. Two sockets at the top fill as she takes them. Autoplay takes the rarest.
function pullable() { return Object.keys(CFG.heroes.runner.spells || {}).filter(id => spellDef(id).pull !== false && (typeof SPELLS === 'undefined' || SPELLS[spellDef(id).kind])) }
function startPull() {
  const ids = pullable(), deal = []
  const weight = id => [0, 5, 3, 1.4][spellDef(id).tier || 1]
  while (deal.length < Math.min(3, ids.length)) {
    const left = ids.filter(id => !deal.includes(id)), sum = left.reduce((a, id) => a + weight(id), 0)
    let r = Math.random() * sum; for (const id of left) { r -= weight(id); if (r <= 0) { deal.push(id); break } }
  }
  RUN.offer = deal; RUN.picked = []; RUN.pick = 1; RUN.offerT = 0; RUN.kind = 'pull'; RUN.pullEnd = 0
  mode = 'boon'
}
function endPull() {
  if (!RUN.picked.length) RUN.picked.push(RUN.offer[RUN.pick])
  RUN.spells = RUN.picked.slice(0, 2); RUN.spell = 0
  for (const id of RUN.spells) RUN.tiers[id] = 1
  RUN.kind = null; mode = 'play'
  const s = spellDef(RUN.spells[0]); if (s) callout(s.en || '', P.x, P.y - 220, true)
}
const PULL_LOOK = { 1: ['#f6efe4', '#d8c3a4', '#3a1a0c', '255,236,210'], 2: ['#f7d4dc', '#c46a84', '#3a0c18', '255,150,190'], 3: ['#fbe6a8', '#c8902e', '#3a1a0c', '255,214,120'] }
function tierPips(cx, cy, n, glowNext = 0, s = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s)
  for (let j = 0; j < SPELL_MAX; j++) {
    const x = (j - (SPELL_MAX - 1) / 2) * 16, on = j < n, nx = glowNext && j === n
    ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 6); ctx.lineTo(x - 5, 0); ctx.closePath()
    if (on) { ctx.fillStyle = '#f2c070'; ctx.fill() }
    else if (nx) { ctx.fillStyle = `rgba(255,236,190,${0.55 + 0.45 * Math.sin(T * 8)})`; ctx.shadowColor = 'rgba(255,220,150,0.9)'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0 }
    else { ctx.strokeStyle = 'rgba(242,192,112,0.6)'; ctx.lineWidth = 1.5; ctx.stroke() }
  }
  ctx.restore()
}
function drawPull(dt) {
  RUN.offerT += dt; T += dt
  for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt }
  parts = parts.filter(p => p.t < p.life)
  drawWorld(); drawOverlay()
  ctx.fillStyle = 'rgba(25,8,8,0.62)'; ctx.fillRect(0, 0, W, H)
  const t = RUN.offerT, n = RUN.offer.length, cw = 250, chh = 330, gap = 46, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, top = 250
  // the two sockets she fills
  for (let j = 0; j < 2; j++) {
    const x = W / 2 + (j - 0.5) * 70, y = 150, got = RUN.picked[j]
    ctx.save(); ctx.translate(x, y)
    ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(60,14,20,0.8)'
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(24, 0); ctx.lineTo(0, 24); ctx.lineTo(-24, 0); ctx.closePath(); ctx.fill(); ctx.stroke()
    if (got) { ctx.shadowColor = 'rgba(255,220,150,0.9)'; ctx.shadowBlur = 20; ctx.scale(0.42, 0.42); drawIcon(SPELL_ICON[spellDef(got).kind] || 'tome', 0, 0) }
    ctx.restore()
  }
  RUN.offer.forEach((id, i) => {
    const s = spellDef(id), r = clamp(s.tier || 1, 1, 3), [c0, c1, ink, glow] = PULL_LOOK[r]
    const at = 0.35 + i * 0.3, q = clamp((t - at) / 0.32, 0, 1), face = q >= 0.5, sx = Math.abs(Math.cos(q * Math.PI))
    const took = RUN.picked.includes(id), on = RUN.pick === i && face
    const x = x0 + i * (cw + gap), y = top - (took ? 26 : on ? 12 : 0), cx = x + cw / 2, since = t - at - 0.16
    const k = clamp(t * 4 - i * 0.5, 0, 1)
    ctx.save(); ctx.globalAlpha = k; ctx.translate(cx, y + chh / 2 + (1 - k) * 50); ctx.scale(Math.max(0.02, sx), 1); ctx.translate(-cx, -(y + chh / 2))
    if (face && r >= 3) {   // grand: turning rays behind the card
      ctx.save(); ctx.translate(cx, y + chh / 2); ctx.rotate(T * 0.4); ctx.globalCompositeOperation = 'lighter'
      for (let j = 0; j < 12; j++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = `rgba(${glow},${0.16 + 0.06 * Math.sin(T * 3 + j)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(330, -26); ctx.lineTo(330, 26); ctx.fill() }
      ctx.restore()
    }
    ctx.shadowColor = face ? `rgba(${glow},${r >= 2 ? 0.95 : 0.6})` : 'rgba(0,0,0,0.6)'; ctx.shadowBlur = face ? (on || took ? 42 : 18 + 10 * r) : 12
    if (!face) {   // the back: dark rose with a gold seal
      const bg = ctx.createLinearGradient(0, y, 0, y + chh); bg.addColorStop(0, '#5a1420'); bg.addColorStop(1, '#2a080e')
      ctx.fillStyle = bg; cardPath(x, y, cw, chh); ctx.fill(); ctx.shadowBlur = 0
      ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 3; cardPath(x, y, cw, chh); ctx.stroke()
      ctx.strokeStyle = 'rgba(232,192,112,0.7)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, y + chh / 2 - 10, 62, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, y + chh / 2 - 10, 46, 0, Math.PI * 2); ctx.stroke()
      for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2 + T; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 46, y + chh / 2 - 10 + Math.sin(a) * 46); ctx.lineTo(cx + Math.cos(a) * 62, y + chh / 2 - 10 + Math.sin(a) * 62); ctx.stroke() }
    } else {
      const cg = ctx.createLinearGradient(0, y, 0, y + chh); cg.addColorStop(0, c0); cg.addColorStop(1, c1)
      ctx.fillStyle = cg; cardPath(x, y, cw, chh); ctx.fill(); ctx.shadowBlur = 0
      ctx.strokeStyle = '#e8c070'; ctx.lineWidth = on || took ? 5 : 3; cardPath(x, y, cw, chh); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,240,210,0.5)'; ctx.lineWidth = 1.5; cardPath(x + 10, y + 10, cw - 20, chh - 20); ctx.stroke()
      const iy = y + 120
      ctx.fillStyle = 'rgba(120,20,24,0.85)'; ctx.beginPath(); ctx.arc(cx, iy, 70, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 4; ctx.stroke()
      drawIcon(SPELL_ICON[s.kind] || 'tome', cx, iy)
      ctx.textAlign = 'center'; ctx.fillStyle = ink; fitFont(s.en || '', 24, cw - 36); ctx.fillText(s.en || '', cx, y + 240)
      // rarity: 1-3 diamonds
      for (let j = 0; j < r; j++) { const px = cx + (j - (r - 1) / 2) * 20, py = y + 276; ctx.fillStyle = r >= 3 ? '#c8902e' : r === 2 ? '#c0446a' : '#a08060'; ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px + 7, py); ctx.lineTo(px, py + 8); ctx.lineTo(px - 7, py); ctx.fill() }
      // the shine: one bright sweep across the card as it lands
      if (since > 0 && since < 0.7) {
        ctx.save(); cardPath(x, y, cw, chh); ctx.clip(); ctx.globalCompositeOperation = 'lighter'
        const sxp = x - 120 + (cw + 240) * (since / 0.7), sg = ctx.createLinearGradient(sxp - 60, y, sxp + 60, y + 80)
        sg.addColorStop(0, 'rgba(255,250,235,0)'); sg.addColorStop(0.5, 'rgba(255,250,235,0.75)'); sg.addColorStop(1, 'rgba(255,250,235,0)')
        ctx.fillStyle = sg; ctx.fillRect(x, y, cw, chh); ctx.restore()
      }
      if (took) { ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, iy, 82 + 3 * Math.sin(T * 6), 0, Math.PI * 2); ctx.stroke() }
    }
    ctx.restore()
    // the moment it turns over: a burst for its rarity
    if (since > 0 && since < 0.5) { const b = 1 - since / 0.5; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, top + chh / 2, 0, cx, top + chh / 2, 200 + 60 * r); g.addColorStop(0, `rgba(255,250,235,${0.6 * b})`); g.addColorStop(0.4, `rgba(${glow},${0.35 * b * r})`); g.addColorStop(1, `rgba(${glow},0)`); ctx.fillStyle = g; ctx.fillRect(cx - 400, top - 200, 800, chh + 400); ctx.restore() }
  })
  if (RUN.pullEnd > 0) { RUN.pullEnd -= dt; if (RUN.pullEnd <= 0) endPull(); return }
  const ready = t > 0.35 + (n - 1) * 0.3 + 0.3
  const free = RUN.offer.map((_, i) => i).filter(i => !RUN.picked.includes(RUN.offer[i]))
  if (tap('arrowleft', 'a')) RUN.pick = (RUN.pick + n - 1) % n
  if (tap('arrowright', 'd')) RUN.pick = (RUN.pick + 1) % n
  if (mouse.on) RUN.offer.forEach((_, i) => { const x = x0 + i * (cw + gap); if (mouse.x > x && mouse.x < x + cw && mouse.y > top && mouse.y < top + chh) RUN.pick = i })
  if (tap('escape', 'k') && t > 0.2) return endPull()
  if (!ready) return
  if (AUTO.on && t > 1.7 + RUN.picked.length * 0.6 && free.length) RUN.pick = free.sort((a, b) => (spellDef(RUN.offer[b]).tier || 1) - (spellDef(RUN.offer[a]).tier || 1))[0]
  if (tap('j', 'enter', ' ') || (AUTO.on && t > 1.7 + RUN.picked.length * 0.6)) {
    const id = RUN.offer[RUN.pick]
    if (!RUN.picked.includes(id)) { RUN.picked.push(id); flash = Math.max(flash, 0.15); flashColor = '255,236,200'; if (typeof SFX !== 'undefined' && SFX.glare) SFX.glare() }
    const next = RUN.offer.map((_, i) => i).filter(i => !RUN.picked.includes(RUN.offer[i]))[0]
    if (next !== undefined) RUN.pick = next
    if (RUN.picked.length >= 2) RUN.pullEnd = 0.45
  }
}

// the spell's level on the HUD: three small diamonds under the L ring, and a soft ring at the top level
{
  const _hud = drawHUD
  drawHUD = function () {
    _hud.apply(this, arguments)
    if (P.hero !== 'runner' || !RUN.spells.length) return
    const id = RUN.spells[RUN.spell], lv = spellLv(id), x = 32 + 32 * Object.keys(SKILL_KEYS[P.hero] || {}).length + 12
    ctx.save()
    tierPips(x, 114, lv, 0, 0.62)
    if (lv >= SPELL_MAX) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,214,140,${0.45 + 0.25 * Math.sin(T * 4)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, 92, 16, 0, Math.PI * 2); ctx.stroke() }
    if (RUN.spells.length > 1) for (let j = 0; j < RUN.spells.length; j++) { ctx.fillStyle = j === RUN.spell ? '#f2c070' : 'rgba(242,192,112,0.35)'; ctx.beginPath(); ctx.arc(x + 22, 86 + j * 10, 2.6, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }
}
