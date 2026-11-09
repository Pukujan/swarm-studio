// The galaxy home and the cosmos controller (docs/specs/08-identity.md, "Galaxy and orbit").
// The studio opens on a slowly turning spiral galaxy. Every saved build is a star system on
// its arms, placed from its id, coloured from its theme and labelled with its title; the live
// build pulses. "Where to next?" starts a build. Clicking a system flies the camera in, then
// opens that build in its orbit view (web/orbit.js). Classic view (☰) turns all of it off.
//
// It talks to the canvas only through window.swarm (the hook block at the end of canvas.js)
// and loads three.js from web/vendor/three on demand, so the canvas never waits for it.
const sw = window.swarm
const Crew = window.SwarmCrew
const W = window
const body = document.body
const $ = s => document.querySelector(s)
const Q = new URLSearchParams(location.search)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const store = {
  get(k, d) { try { const v = localStorage.getItem(`swarm.${k}`); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch {} }
}
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
// Lucide line icons (ISC; licence in web/brand/LICENSE-lucide.txt)
const ICON = {
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>'
}
const ico = n => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`

// ---------- the palette, read from the :root tokens so WebGL uses the same colours as the CSS
function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback
}
const palette = () => ({
  void: token('--void', '#05051a'), deep: token('--deep', '#0a0a2e'), frame: token('--frame', '#0000F2'), frameHi: token('--frame-hi', '#4646ff'),
  text: token('--text', '#F2F2F2'), muted: token('--muted', '#8b8bb8'), accent: token('--accent', '#F2F200'), ok: token('--ok', '#00F279'),
  info: token('--info', '#00F2F2'), hot: token('--hot', '#F20000'), nebula: token('--nebula', '#7900F2'), nebula2: token('--nebula-2', '#F20079')
})

// ---------- three.js, loaded once for both scenes
let threeP = null
const three = () => (threeP ||= import(new URL('vendor/three/three.module.min.mjs', document.baseURI).href))

// a soft round glow, drawn once, for sprites
function glowTexture(THREE, stops = [[0, 1], [0.25, 0.55], [0.6, 0.12], [1, 0]]) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [at, a] of stops) r.addColorStop(at, `rgba(255,255,255,${a})`)
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// a small seeded random, so the galaxy is the same galaxy every time
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}
const gauss = r => (r() + r() + r() + r() - 2) / 2

// Hermia's ship, drawn in code: an off-white hull with a Hermes-blue stripe, little winged fins
// (the winged sandals again) and a yellow cockpit glow. Original art, no assets.
function shipTexture(THREE, P) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 160
  const g = c.getContext('2d')
  g.translate(128, 84)
  // engine glow
  const eg = g.createRadialGradient(-86, 6, 0, -86, 6, 40)
  eg.addColorStop(0, P.info); eg.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = eg; g.fillRect(-130, -40, 90, 90)
  // wings: three feathers each side
  const wing = flip => {
    g.save(); g.scale(1, flip)
    for (let i = 0; i < 3; i++) {
      g.beginPath()
      g.moveTo(-18 + i * 14, -14)
      g.quadraticCurveTo(-34 + i * 10, -52 + i * 8, -60 + i * 16, -58 + i * 10)
      g.quadraticCurveTo(-30 + i * 12, -36 + i * 6, -4 + i * 14, -16)
      g.closePath()
      g.fillStyle = P.text; g.fill()
      g.lineWidth = 2.4; g.strokeStyle = P.void; g.stroke()
    }
    g.beginPath(); g.moveTo(-60, -58); g.quadraticCurveTo(-50, -52, -44, -47); g.lineTo(-52, -44); g.closePath()
    g.fillStyle = P.frame; g.fill()
    g.restore()
  }
  wing(1); wing(-1)
  // hull
  g.beginPath()
  g.moveTo(-78, 0)
  g.bezierCurveTo(-74, -26, 30, -32, 86, -4)
  g.quadraticCurveTo(92, 0, 86, 4)
  g.bezierCurveTo(30, 32, -74, 26, -78, 0)
  g.fillStyle = P.text; g.fill()
  g.lineWidth = 3; g.strokeStyle = P.void; g.stroke()
  // the blue stripe and the yellow trim (her cape colours)
  g.beginPath(); g.moveTo(-70, 8); g.bezierCurveTo(-20, 18, 40, 14, 80, 3); g.lineWidth = 7; g.strokeStyle = P.frame; g.stroke()
  g.beginPath(); g.moveTo(-66, 14); g.bezierCurveTo(-20, 22, 30, 19, 70, 8); g.lineWidth = 2; g.strokeStyle = P.accent; g.stroke()
  // cockpit
  const cg = g.createRadialGradient(28, -10, 2, 28, -8, 22)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.35, P.accent); cg.addColorStop(1, P.frame)
  g.beginPath(); g.ellipse(26, -9, 22, 13, -0.08, 0, Math.PI * 2); g.fillStyle = cg; g.fill()
  g.lineWidth = 2.4; g.strokeStyle = P.void; g.stroke()
  // a portholes row
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-44 + i * 16, -2, 3.2, 0, Math.PI * 2); g.fillStyle = P.info; g.fill(); g.lineWidth = 1.5; g.stroke() }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------- where a build sits in the galaxy: from its id, so it never moves
const ARMS = 3, TWIST = 0.42
function placeOf(id) {
  const h = Crew.hash(String(id))
  const arm = h % ARMS
  const t = ((h >>> 3) % 997) / 997
  const r = 3.4 + t * 12.5
  const jitter = (((h >>> 13) % 1000) / 1000 - 0.5) * 0.55
  const a = arm * (Math.PI * 2 / ARMS) + r * TWIST + jitter
  const y = (((h >>> 22) % 100) / 100 - 0.5) * 0.7
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r }
}
// a system's colour: its theme's primary, lifted so a dark brand still shines
function colorOf(THREE, f, P) {
  const c = new THREE.Color()
  const pick = f.theme?.colors?.find(x => /^#[0-9a-f]{3,8}$/i.test(x) && x !== f.theme.colors[0]) || f.theme?.colors?.[0]
  try { c.set(pick || Crew.color(f.title || f.id)) } catch { c.set(P.text) }
  const hsl = {}
  c.getHSL(hsl)
  c.setHSL(hsl.h, Math.max(0.55, hsl.s), Math.max(0.6, hsl.l))
  return c
}

// =====================================================================================
// the galaxy scene
// =====================================================================================
function makeGalaxy(root) {
  const G = { on: false, files: [], systems: [], hover: null, flying: null, fps: 0 }
  root.innerHTML = `<canvas aria-label="Your galaxy: every build is a star system" tabindex="-1"></canvas><div class="gx-labels"></div>
    <button class="gx-chart-btn" title="Every build in the galaxy, as a list">${ico('list')}Star chart <em></em></button>
    <div class="gx-chart" hidden role="list"></div>
    <div class="gx-dock">
      <h1 class="gx-title">Where to <em>next</em>?</h1>
      <p class="gx-sub">Hermia and her crew build it. Every world you make becomes a star.</p>
      <div class="gx-chips"></div>
      <form class="gx-form" autocomplete="off"><input name="q" placeholder="A night market in Taipei, a cat café, a puzzle game…" aria-label="Where to next? Describe what to build">
        <button type="button" class="gx-auto" title="Auto: the site, a review, the app, the games, a video and a deploy">${ico('zap')}<span class="t">Auto</span></button>
        <button type="submit" class="gx-go" title="Launch: the crew designs and builds the site">${ico('rocket')}Launch</button></form>
    </div>`
  const canvas = root.querySelector('canvas'), labels = root.querySelector('.gx-labels')
  const chart = root.querySelector('.gx-chart'), chartBtn = root.querySelector('.gx-chart-btn')
  const form = root.querySelector('.gx-form'), input = form.q
  const fpsEl = Q.get('fps') ? Object.assign(document.createElement('div'), { className: 'gx-fps' }) : null
  if (fpsEl) root.append(fpsEl)

  form.onsubmit = e => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return input.focus()
    input.value = ''
    sw.submit(text)
    C.go('orbit')
  }
  form.querySelector('.gx-auto').onclick = () => { sw.submit(input.value.trim(), true); input.value = '' }
  chartBtn.onclick = () => { chart.hidden = !chart.hidden; if (!chart.hidden) chart.querySelector('button')?.focus() }
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !chart.hidden) { chart.hidden = true; chartBtn.focus() } })

  let T, renderer, scene, camera, group, galaxyMat, sysPoints, sysMat, ship, core, ready = false
  const mouse = { x: 0, y: 0, px: -1, py: -1, in: false }
  const HOME = { x: 0, y: 9.5, z: 15 }
  const LOOK_Y = -2.6 // looking a little below the core lifts the disc above the prompt
  const camState = { pos: null, look: null }

  async function init() {
    T = await three()
    const P = palette()
    renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1))
    renderer.setClearColor(new T.Color(P.void), 1)
    scene = new T.Scene()
    camera = new T.PerspectiveCamera(55, 1, 0.1, 400)
    camState.pos = new T.Vector3(HOME.x, HOME.y, HOME.z)
    camState.look = new T.Vector3(0, LOOK_Y, 0)
    camera.position.copy(camState.pos)
    group = new T.Group()
    scene.add(group)

    // --- the spiral: instanced points with an additive glow
    const narrow = innerWidth < 700
    const N = narrow ? 22000 : 46000
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N)
    const r = rng(0x5eed)
    const cCore = new T.Color(P.accent).lerp(new T.Color(P.text), 0.55), cMid = new T.Color(P.frameHi), cOut = new T.Color(P.nebula), cPink = new T.Color(P.nebula2), cWhite = new T.Color(P.text)
    const tmp = new T.Color()
    for (let i = 0; i < N; i++) {
      const arm = i % ARMS
      const rad = 0.25 + Math.pow(r(), 1.55) * 17.5
      const spread = 0.35 + rad * 0.075
      const a = arm * (Math.PI * 2 / ARMS) + rad * TWIST + gauss(r) * (0.55 / (1 + rad * 0.12))
      pos[i * 3] = Math.cos(a) * rad + gauss(r) * spread
      pos[i * 3 + 1] = gauss(r) * (0.55 * Math.exp(-rad / 6) + 0.12)
      pos[i * 3 + 2] = Math.sin(a) * rad + gauss(r) * spread
      const k = Math.min(1, rad / 15)
      if (k < 0.3) tmp.copy(cCore).lerp(cMid, k / 0.3).multiplyScalar(0.55 + k * 1.5)
      else tmp.copy(cMid).lerp(r() < 0.18 ? cPink : cOut, (k - 0.3) / 0.7)
      if (r() < 0.07) tmp.lerp(cWhite, 0.7)
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b
      size[i] = (0.5 + r() * r() * 2.4) * (rad < 1.6 ? 1.6 : 1)
      seed[i] = r() * 6.283
    }
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.BufferAttribute(pos, 3))
    geo.setAttribute('aColor', new T.BufferAttribute(col, 3))
    geo.setAttribute('aSize', new T.BufferAttribute(size, 1))
    geo.setAttribute('aSeed', new T.BufferAttribute(seed, 1))
    galaxyMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uTwinkle: { value: reduced() ? 0 : 1 } },
      vertexShader: `uniform float uTime; uniform float uPx; uniform float uTwinkle; attribute vec3 aColor; attribute float aSize; attribute float aSeed; varying vec3 vColor;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float tw = 1.0 - uTwinkle * 0.35 * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed * 7.0));
          gl_PointSize = aSize * uPx * (26.0 / -mv.z); vColor = aColor * tw; }`,
      fragmentShader: `varying vec3 vColor; void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); a *= a; gl_FragColor = vec4(vColor * a, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    })
    group.add(new T.Points(geo, galaxyMat))

    // --- nebula clouds along the arms, and the bright core
    const glow = glowTexture(T)
    const rn = rng(42)
    for (let i = 0; i < 26; i++) {
      const arm = i % ARMS, rad = 2.5 + rn() * 13
      const a = arm * (Math.PI * 2 / ARMS) + rad * TWIST + gauss(rn) * 0.3
      const m = new T.SpriteMaterial({ map: glow, color: new T.Color(rn() < 0.3 ? P.nebula2 : rn() < 0.6 ? P.nebula : P.frameHi), transparent: true, opacity: 0.09 + rn() * 0.08, depthWrite: false, blending: T.AdditiveBlending })
      const s = new T.Sprite(m)
      s.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad)
      s.scale.setScalar(4 + rn() * 6)
      group.add(s)
    }
    core = new T.Sprite(new T.SpriteMaterial({ map: glow, color: new T.Color(P.accent).lerp(new T.Color(P.text), 0.5), transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }))
    core.scale.setScalar(6)
    scene.add(core)
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glow, color: new T.Color(P.frame), transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending }))
    halo.scale.setScalar(24)
    scene.add(halo)

    // --- Hermia's ship at the core
    ship = new T.Sprite(new T.SpriteMaterial({ map: shipTexture(T, P), transparent: true, depthWrite: false, depthTest: false }))
    ship.scale.set(2.6, 1.625, 1)
    ship.position.set(0, 1.25, 0)
    ship.renderOrder = 5
    scene.add(ship)

    // --- far stars, outside the turning disc, for parallax
    const M = 2600, far = new Float32Array(M * 3), fsize = new Float32Array(M), fcol = new Float32Array(M * 3), fseed = new Float32Array(M)
    const rf = rng(7)
    for (let i = 0; i < M; i++) {
      const u = rf() * 2 - 1, th = rf() * Math.PI * 2, R = 90 + rf() * 60, s = Math.sqrt(1 - u * u)
      far[i * 3] = Math.cos(th) * s * R; far[i * 3 + 1] = u * R; far[i * 3 + 2] = Math.sin(th) * s * R
      fsize[i] = 2 + rf() * 4
      tmp.set(rf() < 0.1 ? P.info : P.text); fcol[i * 3] = tmp.r * 0.8; fcol[i * 3 + 1] = tmp.g * 0.8; fcol[i * 3 + 2] = tmp.b * 0.8
      fseed[i] = rf() * 6.283
    }
    const fgeo = new T.BufferGeometry()
    fgeo.setAttribute('position', new T.BufferAttribute(far, 3))
    fgeo.setAttribute('aColor', new T.BufferAttribute(fcol, 3))
    fgeo.setAttribute('aSize', new T.BufferAttribute(fsize, 1))
    fgeo.setAttribute('aSeed', new T.BufferAttribute(fseed, 1))
    scene.add(new T.Points(fgeo, galaxyMat))

    // --- the star systems (one draw call); live ones pulse in the shader
    sysMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uRing: { value: new T.Color(P.accent) } },
      vertexShader: `uniform float uTime; uniform float uPx; attribute vec3 aColor; attribute float aLive; attribute float aHot; varying vec3 vColor; varying float vLive; varying float vHot;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float pulse = aLive * (0.5 + 0.5 * sin(uTime * 4.0));
          gl_PointSize = (15.0 + aHot * 8.0 + pulse * 10.0) * uPx * (22.0 / -mv.z); vColor = aColor; vLive = aLive * (0.55 + 0.45 * sin(uTime * 4.0)); vHot = aHot; }`,
      fragmentShader: `uniform vec3 uRing; varying vec3 vColor; varying float vLive; varying float vHot;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0;
          float dot = smoothstep(0.26, 0.0, d);
          float glow = smoothstep(1.0, 0.0, d) * 0.42;
          float ring = smoothstep(0.08, 0.0, abs(d - 0.72)) * (0.35 + vHot * 0.65);
          vec3 c = vColor * (glow + dot * 1.6) + vec3(1.0) * dot * 0.6 + mix(vColor, uRing, vLive) * ring + uRing * vLive * smoothstep(0.12, 0.0, abs(d - 0.9));
          float a = clamp(dot + glow + ring, 0.0, 1.0); gl_FragColor = vec4(c, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    })
    ready = true
    resize()
    new ResizeObserver(resize).observe(root)
    buildSystems()
    root.classList.add('ready')
  }

  function resize() {
    if (!renderer) return
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // a phone sees the galaxy from further away, so the whole disc fits
    camera.fov = w < 600 ? 72 : 55
    camera.updateProjectionMatrix()
  }

  function buildSystems() {
    if (!ready) return
    const P = palette()
    if (sysPoints) { group.remove(sysPoints); sysPoints.geometry.dispose() }
    const list = G.files.filter(f => f.pages || f.live || f.kind === 'game')
    const n = list.length
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), live = new Float32Array(n), hot = new Float32Array(n)
    G.systems = list.map((f, i) => {
      const p = placeOf(f.id), c = colorOf(T, f, P)
      pos.set([p.x, p.y, p.z], i * 3)
      col.set([c.r, c.g, c.b], i * 3)
      live[i] = f.live ? 1 : 0
      return { f, i, local: new T.Vector3(p.x, p.y, p.z), color: `#${c.getHexString()}`, sx: 0, sy: 0, vis: false, el: null }
    })
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.BufferAttribute(pos, 3))
    geo.setAttribute('aColor', new T.BufferAttribute(col, 3))
    geo.setAttribute('aLive', new T.BufferAttribute(live, 1))
    geo.setAttribute('aHot', new T.BufferAttribute(hot, 1))
    sysPoints = new T.Points(geo, sysMat)
    sysPoints.renderOrder = 3
    group.add(sysPoints)
    // labels: one button per system; the newest few and the live one always show
    labels.innerHTML = ''
    const byNew = [...G.systems].sort((a, b) => (b.f.t || 0) - (a.f.t || 0))
    byNew.forEach((s, rank) => { s.rank = rank })
    for (const s of G.systems) {
      const b = document.createElement('button')
      b.className = `gx-label off${s.f.live ? ' live' : ''}`
      b.innerHTML = `<span></span><small></small>`
      b.firstChild.textContent = s.f.title || 'Untitled'
      b.lastChild.textContent = [s.f.kind === 'game' ? 'game' : `${s.f.pages} page${s.f.pages === 1 ? '' : 's'}`, new Date(s.f.t).toLocaleDateString([], { month: 'short', day: 'numeric' }), s.f.theme?.name].filter(Boolean).join(' · ')
      b.onclick = () => pick(s)
      b.onfocus = () => { G.hover = s }
      b.onblur = () => { if (G.hover === s) G.hover = null }
      b.onmouseenter = () => { G.hover = s }
      b.onmouseleave = () => { if (G.hover === s) G.hover = null }
      labels.append(b)
      s.el = b
    }
    // the star chart and the chips
    chartBtn.querySelector('em').textContent = n || ''
    chartBtn.hidden = !n
    chart.innerHTML = byNew.map(s => `<button role="listitem" data-id="${esc(s.f.id)}"><i style="color:${s.color};background:${s.color}"></i><span>${esc(s.f.title || 'Untitled')}</span><small>${s.f.live ? 'live' : new Date(s.f.t).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></button>`).join('') || '<small>No worlds yet.</small>'
    for (const b of chart.querySelectorAll('button')) b.onclick = () => { chart.hidden = true; pick(G.systems.find(s => s.f.id === b.dataset.id)) }
    const chips = root.querySelector('.gx-chips')
    const liveS = G.systems.find(s => s.f.live)
    const last = byNew.find(s => !s.f.live && s.f.pages)
    chips.innerHTML = (liveS ? `<button class="gx-live" data-id="${esc(liveS.f.id)}">Live now: ${esc(liveS.f.title)}</button>` : '') + (last ? `<button data-id="${esc(last.f.id)}">Back to ${esc(last.f.title)}</button>` : '')
    for (const b of chips.querySelectorAll('button')) b.onclick = () => pick(G.systems.find(s => s.f.id === b.dataset.id))
  }

  async function refresh() {
    try {
      const res = await sw.api('/api/runs')
      if (!res.ok) return
      const list = await res.json()
      const key = JSON.stringify(list.map(f => [f.id, f.title, f.live, f.pages]))
      if (key === G.key) return
      G.key = key
      G.files = list
      buildSystems()
    } catch {}
  }

  // --- the frame loop: only while the galaxy shows and the tab is visible
  const v3 = () => new T.Vector3()
  let raf = 0, last = 0, clock = 0, frames = 0, fpsAt = 0, wp
  function loop(now) {
    raf = 0
    if (!G.on || document.hidden || !ready) return
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    const still = reduced()
    if (!still && !G.flying) clock += dt
    galaxyMat.uniforms.uTime.value = clock
    sysMat.uniforms.uTime.value = still ? 1.2 : now / 1000
    group.rotation.y = -clock * 0.022
    ship.position.y = 1.25 + (still ? 0 : Math.sin(now / 900) * 0.12)
    core.material.opacity = 0.55 + (still ? 0 : Math.sin(now / 1400) * 0.06)

    // camera: home with a little parallax from the mouse, or the fly-in
    if (G.flying) {
      const fl = G.flying, k = Math.min(1, (now - fl.t0) / fl.ms), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
      camera.position.lerpVectors(fl.fromPos, fl.toPos, e)
      camState.look.lerpVectors(fl.fromLook, fl.toLook, e)
      camera.lookAt(camState.look)
      if (k >= 1 && !fl.done) { fl.done = true; fl.then() }
    } else {
      const tx = HOME.x + (still ? 0 : mouse.x * 1.8), ty = HOME.y + (still ? 0 : -mouse.y * 1.1)
      const kk = 1 - Math.exp(-dt * 2.5)
      camera.position.x += (tx - camera.position.x) * kk
      camera.position.y += (ty - camera.position.y) * kk
      camera.position.z += (HOME.z - camera.position.z) * kk
      camState.look.x *= 1 - kk; camState.look.z *= 1 - kk; camState.look.y += (LOOK_Y - camState.look.y) * kk
      camera.lookAt(camState.look)
    }
    renderer.render(scene, camera)
    placeLabels()

    frames++
    if (now - fpsAt > 1000) { G.fps = Math.round(frames * 1000 / (now - fpsAt || 1)); frames = 0; fpsAt = now; if (fpsEl) fpsEl.textContent = `${G.fps} fps` }
    raf = requestAnimationFrame(loop)
  }
  const kick = () => { if (!raf && G.on && !document.hidden) { last = 0; raf = requestAnimationFrame(loop) } }
  document.addEventListener('visibilitychange', kick)

  // labels follow their stars; the newest eight, the live one and the hovered one show, without overlapping
  function placeLabels() {
    if (!G.systems.length) return
    wp ||= v3()
    const w = canvas.clientWidth, h = canvas.clientHeight
    group.updateMatrixWorld()
    const narrow = w < 600
    const dockH = root.querySelector('.gx-dock').offsetHeight + 34
    const want = []
    let best = null, bestD = narrow ? 26 : 22
    for (const s of G.systems) {
      wp.copy(s.local).applyMatrix4(group.matrixWorld).project(camera)
      s.vis = wp.z < 1 && Math.abs(wp.x) < 1.05 && Math.abs(wp.y) < 1.05
      s.sx = (wp.x + 1) / 2 * w
      s.sy = (1 - wp.y) / 2 * h
      if (!s.vis) continue
      if (s.sy > h - dockH) s.vis = false // never under the prompt
      if (!s.vis) continue
      if (mouse.in) { const d = Math.hypot(s.sx - mouse.px, s.sy - mouse.py); if (d < bestD) { bestD = d; best = s } }
    }
    if (mouse.in && !G.flying) { const was = G.hoverMouse; G.hoverMouse = best; if (was !== best) root.classList.toggle('hot', !!best) }
    const hot = G.hover || G.hoverMouse
    for (const s of G.systems) if (s.vis) want.push(s)
    // priority: hovered, live, newest
    want.sort((a, b) => (b === hot) - (a === hot) || (b.f.live ? 1 : 0) - (a.f.live ? 1 : 0) || a.rank - b.rank)
    // the core and Hermia's ship stay clear
    wp.set(0, 1.25, 0).project(camera)
    const cx = (wp.x + 1) / 2 * w, cy = (1 - wp.y) / 2 * h
    const taken = [{ x0: cx - 70, y0: cy - 40, x1: cx + 70, y1: cy + 30 }], limit = narrow ? 5 : 9
    let shown = 0
    for (const s of G.systems) s.show = false
    for (const s of want) {
      if (s !== hot && !s.f.live && shown >= limit) continue
      s.bw ||= s.el?.offsetWidth || Math.min(260, 14 + (s.f.title || '').length * 9)
      const bw = s.bw, bh = 18
      const box = { x0: s.sx + 6, y0: s.sy - 9, x1: s.sx + 6 + bw, y1: s.sy - 9 + bh }
      if (s !== hot && box.x1 > w - 8) continue
      if (s !== hot && taken.some(t => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0)) continue
      taken.push(box)
      s.show = true
      shown++
    }
    const hotAttr = sysPoints.geometry.getAttribute('aHot')
    let dirty = false
    for (const s of G.systems) {
      const on = s.show && !G.flying
      if (s.el) {
        s.el.style.transform = `translate(${(s.sx + 4).toFixed(1)}px, ${(s.sy - 9).toFixed(1)}px)`
        s.el.classList.toggle('off', !on)
        s.el.classList.toggle('hot', s === hot)
        s.el.tabIndex = on ? 0 : -1
      }
      const hv = s === hot ? 1 : 0
      if (hotAttr.array[s.i] !== hv) { hotAttr.array[s.i] = hv; dirty = true }
    }
    if (dirty) hotAttr.needsUpdate = true
  }

  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect()
    mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top; mouse.in = true
    mouse.x = (mouse.px / r.width) * 2 - 1; mouse.y = (mouse.py / r.height) * 2 - 1
  })
  canvas.addEventListener('pointerleave', () => { mouse.in = false; G.hoverMouse = null; root.classList.remove('hot') })
  canvas.addEventListener('click', () => { const s = G.hover || G.hoverMouse; if (s) pick(s) })

  // fly into a system (about 900 ms), then hand off to the build's orbit view
  function pick(s) {
    if (!s || G.flying) return
    const open = () => { C.go('orbit'); sw.openRun(s.f.id) }
    if (reduced() || !ready) { root.classList.add('out'); return setTimeout(open, 280) }
    group.updateMatrixWorld()
    const world = s.local.clone().applyMatrix4(group.matrixWorld)
    const dir = camera.position.clone().sub(world).normalize()
    G.flying = { t0: performance.now(), ms: 900, fromPos: camera.position.clone(), toPos: world.clone().add(dir.multiplyScalar(1.4)), fromLook: camState.look.clone(), toLook: world, then: () => { root.classList.add('out'); setTimeout(open, 260) } }
    for (const x of G.systems) x.el?.classList.add('off')
    root.classList.add('flying')
  }

  G.show = async () => {
    root.classList.remove('flying')
    root.hidden = false
    void root.offsetWidth
    root.classList.remove('out')
    G.on = true
    if (!ready && !G.loading) {
      G.loading = true
      try { await init() } catch (err) {
        console.error('galaxy: three.js did not load', err)
        root.insertAdjacentHTML('beforeend', '<div class="gx-fail">The galaxy could not start here (WebGL or three.js missing). ☰ → Classic view works as before.</div>')
      }
    }
    // coming back from a build: the camera eases out from close in
    if (ready && G.flying) {
      G.flying = null
      if (!reduced()) camera.position.set(camera.position.x * 0.5, camera.position.y * 0.5 + 2, camera.position.z * 0.5 + 2)
    }
    refresh()
    clearInterval(G.poll)
    G.poll = setInterval(refresh, 12000)
    kick()
    setTimeout(() => { if (G.on && innerWidth > 700 && !document.activeElement?.closest('input, textarea')) input.focus({ preventScroll: true }) }, 60)
  }
  G.hide = () => {
    G.on = false
    clearInterval(G.poll)
    root.classList.add('out')
    setTimeout(() => { if (!G.on) root.hidden = true }, 480)
  }
  G.refresh = refresh
  return G
}

// =====================================================================================
// the controller: galaxy, orbit, a station (Canvas, Video, App), or classic
// =====================================================================================
const C = W.swarmCosmos = {
  mode: 'off',
  three, palette, glowTexture, ico, esc, reduced,
  // the canvas asks this before it opens the latest file behind an empty canvas
  home: () => C.mode === 'galaxy',
  classic: !!store.get('classic', false),
  get fps() { return C.mode === 'galaxy' ? C.galaxy?.fps : C.orbit?.fps }
}
const STATIONS = { canvas: 'Design deck', video: 'Film studio', app: 'Engine room' }
C.STATIONS = STATIONS

function setMode(m) {
  for (const x of ['galaxy', 'orbit', 'station']) body.classList.toggle(`cosmos-${x}`, m === x)
}

C.go = (m, v) => {
  if (C.classic || sw.wall) return
  body.classList.add('cosmos')
  // the side panel's own small-chat mode does not apply here; it comes back in classic view
  if (body.classList.contains('side-min')) { C.sideMin = true; body.classList.remove('side-min') }
  C.mode = m
  setMode(m)
  if (m === 'galaxy') {
    body.classList.remove('cosmos-chat')
    C.galaxy.show()
    C.orbit?.hide()
  } else if (m === 'orbit') {
    if (sw.view !== 'canvas') sw.setView('canvas')
    C.orbit?.show()
    C.galaxy.hide()
  } else if (m === 'station') {
    C.orbit?.hide()
    C.galaxy.hide()
    if (v && sw.view !== v) sw.setView(v)
  }
  renderBack()
}

function renderBack() {
  const b = $('.cosmos-back')
  if (!b) return
  const to = C.mode === 'station' ? 'orbit' : 'galaxy'
  b.innerHTML = `${ico('back')}<span class="t">${to === 'orbit' ? 'Orbit' : 'Galaxy'}</span>`
  b.title = to === 'orbit' ? 'Back to this build’s orbit' : 'Back to the galaxy: all your builds'
}

// Classic view: today's layout, exactly. Remembered per browser (storage may throw; that is fine).
function setClassic(on) {
  C.classic = on
  store.set('classic', on)
  const btn = $('#cosmos-classic')
  btn?.classList.toggle('on', on)
  if (on) {
    C.galaxy?.hide(); C.orbit?.hide()
    C.mode = 'off'
    body.classList.remove('cosmos', 'cosmos-galaxy', 'cosmos-orbit', 'cosmos-station', 'cosmos-chat')
    if (C.sideMin) body.classList.add('side-min')
  } else {
    C.go(sw.S?.run || sw.viewing ? 'orbit' : 'galaxy')
  }
}

function chrome() {
  // the back button: Galaxy from an orbit, Orbit from a station
  const back = document.createElement('button')
  back.className = 'toggle cosmos-back'
  back.onclick = () => C.go(C.mode === 'station' ? 'orbit' : 'galaxy')
  $('.topbar').prepend(back)
  renderBack()
  // ☰: what the lean top bar folds away, and the classic switch
  const menu = $('#more-menu')
  if (menu) {
    menu.insertAdjacentHTML('beforeend', `<div class="cosmos-sep" role="separator"></div>
      <button class="toggle cosmos-only" id="cosmos-game" title="Make an original browser game">${ico('gamepad')}Game</button>
      <button class="toggle" id="cosmos-classic" title="The studio's classic layout: chat column, canvas and the Canvas / Video / App map. Remembered in this browser.">${ico('layout')}Classic view</button>`)
    $('#cosmos-game').onclick = () => $('#game-btn')?.click()
    $('#cosmos-classic').onclick = () => setClassic(!C.classic)
    $('#cosmos-classic').classList.toggle('on', C.classic)
  }
  // in a station, the chat column comes back with one button
  const chat = document.createElement('button')
  chat.className = 'cosmos-chatbtn'
  chat.title = 'Open the chat, files and layers'
  chat.innerHTML = '<img src="brand/hermia-mark.svg" alt="">Chat'
  chat.onclick = () => C.chat(true)
  body.append(chat)
  // a chat column opened from the orbit closes again from its own tab bar
  const tabs = $('.side .tabs')
  if (tabs) {
    const x = document.createElement('button')
    x.className = 'cosmos-only cosmos-fold'
    x.title = 'Fold the chat back into the comm-link'
    x.setAttribute('aria-label', x.title)
    x.innerHTML = ico('x')
    x.style.marginLeft = 'auto'
    x.onclick = () => C.chat(false)
    tabs.append(x)
  }
}
C.chat = on => { body.classList.toggle('cosmos-chat', on); if (on) $('.side .tabs [data-tab="chat"]')?.click() }

function start() {
  if (sw.wall || !sw) return
  const groot = document.createElement('div')
  groot.className = 'galaxy'
  groot.hidden = true
  body.append(groot)
  C.galaxy = makeGalaxy(groot)
  chrome()
  // a station switch made by the studio itself (Auto moving views, /app, a game opening) is followed
  sw.on(e => {
    if (e.type === 'run:start' || e.type === 'run:done' || e.type === 'reset') setTimeout(() => C.galaxy.on && C.galaxy.refresh(), 600)
  })
  if (C.classic) return
  C.go(Q.get('replay') || Q.get('run') ? 'orbit' : 'galaxy')
}
// fold-button style lives here: it is the only galaxy rule that needs the side panel's tab bar
const style = document.createElement('style')
style.textContent = 'body:not(.cosmos) .cosmos-fold{display:none}.cosmos-fold{background:none;border:0;color:var(--muted);cursor:pointer;padding:6px}.cosmos-fold:hover{color:var(--text)}.cosmos-fold .ico{width:15px;height:15px}'
document.head.append(style)

if (sw && !sw.wall) {
  // the mode is known before the canvas's own start-up timers run
  if (!C.classic) C.mode = Q.get('replay') || Q.get('run') ? 'orbit' : 'galaxy'
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else setTimeout(start)
}
