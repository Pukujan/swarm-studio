// A build's orbit view (docs/specs/08-identity.md, "Galaxy and orbit"): the build is a sun,
// its pages are planets (wearing a picture of the page once it rests), sections being built
// are small moons, and the crew fly between them doing the work, with speech bubbles.
// Hermia's orders run in the comm-link strip at the bottom, her reasoning in a thought cloud
// above it; a click opens "Hermia's thinking", the full log. Canvas, Video and App are three
// stations round the sun: Design deck, Film studio and Engine room.
//
// It reads the canvas's own state (window.swarm.S) a few times a second and listens to its
// events through window.swarm.on, so it needs nothing else from canvas.js. Below 600 px the
// 3D scene gives way to a plain list of planets.
const sw = window.swarm
const C = window.swarmCosmos
const Crew = window.SwarmCrew
if (sw && C && !sw.wall) C.orbit = makeOrbit()

function makeOrbit() {
  const { ico, esc } = C
  const O = { on: false, fps: 0 }
  const root = document.createElement('div')
  root.className = 'orbit'
  root.hidden = true
  root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="ob-labels"></div><div class="ob-crew"></div><div class="ob-talk"></div><div class="ob-empty" hidden></div><div class="ob-list"></div>
    <button class="ui-btn ui-btn-outline ui-btn-sm ob-recentre" hidden>${ico('target')}Recentre</button>
    <div class="think-log" hidden role="dialog" aria-label="Hermia's thinking"><header><b>Hermia’s <em>thinking</em></b><button class="x" title="Close (Esc)" aria-label="Close">${ico('x')}</button></header><ol></ol></div>
    <div class="comm" role="status" aria-live="polite">
      <div class="comm-thought" hidden></div>
      <img src="brand/hermia-mark.svg" alt="">
      <button class="comm-text"><b>HERMIA</b><span>Standing by.</span></button>
      <button class="comm-btn comm-log" aria-label="Thinking">${ico('brain')}<span class="t">Thinking</span> <em></em></button>
      <button class="comm-btn comm-chat" aria-label="Chat">${ico('chat')}<span class="t">Chat</span></button>
    </div>`
  document.body.append(root)
  const canvas = root.querySelector('canvas'), labelsEl = root.querySelector('.ob-labels'), crewEl = root.querySelector('.ob-crew'), talkEl = root.querySelector('.ob-talk')
  const emptyEl = root.querySelector('.ob-empty'), listEl = root.querySelector('.ob-list')
  const commText = root.querySelector('.comm-text span'), thoughtEl = root.querySelector('.comm-thought')
  const logEl = root.querySelector('.think-log'), logList = logEl.querySelector('ol'), logCount = root.querySelector('.comm-log em')
  const narrow = () => innerWidth <= 600

  // ---------- Hermia's comm-link: orders, and her reasoning kept apart
  const comm = { run: null, log: [], line: '', thought: null }
  function resetComm(run) {
    if (comm.run === run) return
    Object.assign(comm, { run, log: [], line: '', thought: null })
    commText.textContent = 'Standing by.'
    thoughtEl.hidden = true
    renderLog()
  }
  function order(text, fresh, kind = 'order', t = Date.now(), full = '') {
    if (!text) return
    comm.log.push({ kind, text, full, t })
    if (comm.log.length > 400) comm.log.splice(0, comm.log.length - 400)
    if (kind === 'reason') {
      comm.thought = { text: text.replace(/^💭\s*/, ''), t }
      thoughtEl.textContent = comm.thought.text
      thoughtEl.hidden = false
      thoughtEl.classList.toggle('stale', !fresh)
      if (fresh) { thoughtEl.classList.remove('new'); void thoughtEl.offsetWidth; thoughtEl.classList.add('new') }
    } else {
      comm.line = text
      commText.textContent = text
      if (fresh) { commText.classList.remove('new'); void commText.offsetWidth; commText.classList.add('new') }
    }
    if (!logEl.hidden) renderLog()
    logCount.textContent = comm.log.filter(x => x.kind === 'reason').length || ''
  }
  function renderLog() {
    const atEnd = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 40
    logList.innerHTML = comm.log.length
      ? comm.log.map(x => `<li class="${x.kind}"><time>${new Date(x.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${x.kind === 'reason' ? '💭 thinking' : '📡 order'}</time><p>${esc(x.kind === 'reason' ? (x.full || x.text).replace(/^💭\s*/, '') : x.text)}</p></li>`).join('')
      : '<li class="none">Nothing yet. Her reasoning and orders land here while the crew builds.</li>'
    if (atEnd) logList.scrollTop = logList.scrollHeight
  }
  const openLog = (on = logEl.hidden) => {
    logEl.hidden = !on
    if (on) { renderLog(); logList.scrollTop = logList.scrollHeight; window.SwarmUI?.layer(logEl, () => openLog(false), { extra: [root.querySelector('.comm')] }) }
  }
  root.querySelector('.comm-text').onclick = () => openLog()
  root.querySelector('.comm-log').onclick = () => openLog()
  thoughtEl.onclick = () => openLog(true)
  logEl.querySelector('.x').onclick = () => openLog(false)
  root.querySelector('.comm-chat').onclick = () => C.chat(!document.body.classList.contains('cosmos-chat'))
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !logEl.hidden) openLog(false) })
  // thoughts fade to dim once they are a while old
  setInterval(() => { if (comm.thought && Date.now() - comm.thought.t > 14000) thoughtEl.classList.add('stale') }, 2000)

  // ---------- events: what to say, and who hops. A whole file arriving at once (opening a
  // saved build) is history: it fills the log and the strip, but nobody bursts into speech.
  let batch = 0, batchT = 0
  const radio = new Map() // app-engine helpers heard on the radio: name → last time
  const pending = []
  const S = () => sw.S
  const titleOf = id => S()?.frames.find(f => f.id === id)?.title || id
  const nameOf = id => S()?.agents.get(id)?.name
  sw.on(e => {
    const now = performance.now()
    if (now - batchT > 30) { batch = 0 }
    batchT = now
    batch++
    const fresh = (sw.replay || Date.now() - (e.t || 0) < 6000) && batch < 40
    if (e.type === 'reset' || e.type === 'run:start') resetComm(e.run)
    else if (e.run && comm.run !== e.run && !comm.run) resetComm(e.run)
    switch (e.type) {
      case 'run:start':
        if (e.kind === 'game') order(`New mission: a game. ${e.brief}`, fresh, 'order', e.t)
        else order(`New mission: “${(e.brief || '').slice(0, 90)}”. Plotting the pages…`, fresh, 'order', e.t)
        break
      case 'plan:done': order(`Course set: ${e.pages} pages, ${e.layers} sections. Crew, launch!`, fresh, 'order', e.t); break
      case 'agent:assign': {
        const a = nameOf(e.agent), l = S()?.layers.get(`${e.page}/${e.layer}`)
        if (a) order(`${a}, ${l?.role || e.layer} on ${e.page === '*' ? 'every page' : titleOf(e.page)}. Go!`, fresh, 'order', e.t)
        if (fresh && a) pending.push(() => bubble(a, `on it: ${l?.role || e.layer}`, 1800))
        break
      }
      case 'agent:say': {
        const a = nameOf(e.agent) || e.name
        if (fresh && a) pending.push(() => bubble(a, e.text, 3200))
        break
      }
      case 'crew:act':
        if (e.name) { radio.set(e.name, Date.now()); if (fresh) pending.push(() => bubble(e.name, e.text, 2600)) }
        break
      case 'crew:lead':
        if (e.kind === 'reason') order(e.text, fresh, 'reason', e.t || Date.now(), e.full || '')
        else {
          order(e.to ? `${e.to}: ${e.text}` : e.text, fresh, 'order', e.t || Date.now())
          if (e.to) { radio.set(e.to, Date.now()); if (fresh) pending.push(() => bubble(e.to, 'roger!', 1400)) }
        }
        break
      case 'layer:done': {
        if (fresh) pending.push(() => { const a = nameOf(e.agent); if (a) hop(a); doneFlash(`${e.page}/${e.layer}`) })
        break
      }
      case 'run:done': order(`Good work, crew. ${e.done}/${e.planned} sections across ${e.pages} pages in ${((e.ms || 0) / 1000).toFixed(0)}s.`, fresh, 'order', e.t); break
      case 'review:start': order(`Reviewer, look over ${titleOf(e.page)}.`, fresh, 'order', e.t); break
      case 'video:start': order('Film studio, roll camera: cut the promo.', fresh, 'order', e.t); break
      case 'app:start': order('Engine room, build the working app.', fresh, 'order', e.t); break
      case 'app:done': order('Engine room reports: the app is up.', fresh, 'order', e.t); break
      case 'auto': { const cur = e.steps?.find(s => s.state === 'working'); if (cur && cur.id !== O.autoStep) { O.autoStep = cur.id; order(`Next: ${cur.label}.`, fresh, 'order', e.t || Date.now()) } break }
    }
    clearTimeout(O.flushT)
    O.flushT = setTimeout(flush, 0)
  })
  function flush() {
    // a big batch was a whole file replayed at once: drop the chatter
    if (pending.length > 30) { pending.length = 0; return }
    for (const fn of pending.splice(0)) try { fn() } catch {}
  }

  // ---------- the 3D scene
  let T, renderer, scene, camera, sun, sunGlow, sunMat, glowTex, ready = false
  const planets = new Map(), moons = new Map(), minions = new Map(), stations = []
  const v = () => new T.Vector3()
  let tmpV
  async function init() {
    T = await C.three()
    const P = C.palette()
    renderer = new T.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 2, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1))
    renderer.setClearColor(new T.Color(P.void), 1)
    scene = new T.Scene()
    camera = new T.PerspectiveCamera(42, 1, 0.1, 300)
    camera.position.set(0, 15, 21)
    camera.lookAt(0, 0, 0)
    tmpV = v()
    glowTex = C.glowTexture(T)

    // far stars
    const M = 1600, pos = new Float32Array(M * 3)
    for (let i = 0; i < M; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, R = 70 + Math.random() * 50, s = Math.sqrt(1 - u * u)
      pos.set([Math.cos(th) * s * R, u * R, Math.sin(th) * s * R], i * 3)
    }
    const sg = new T.BufferGeometry()
    sg.setAttribute('position', new T.BufferAttribute(pos, 3))
    scene.add(new T.Points(sg, new T.PointsMaterial({ color: new T.Color(P.text), size: 0.35, transparent: true, opacity: 0.7, depthWrite: false })))

    // the sun: a slowly boiling surface in the build's colours, and its corona
    sunMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: new T.Color(P.accent) }, uB: { value: new T.Color(P.frame) }, uHot: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uHot; varying vec3 vN; varying vec3 vP;
        float n3(vec3 p){ return sin(p.x*2.1+uTime*.7)*sin(p.y*2.7-uTime*.5)*sin(p.z*2.3+uTime*.6); }
        void main(){ float n = n3(vP*1.3) * .5 + n3(vP*3.1+4.0) * .3 + n3(vP*6.0) * .2;
          float rim = pow(1.0 - max(dot(vN, vec3(0.0,0.0,1.0)), 0.0), 2.0);
          vec3 c = mix(uA, vec3(1.0), .35 + n*.25); c = mix(c, uB, rim*.55);
          gl_FragColor = vec4(c * (1.05 + uHot*.25 + n*.15), 1.0); }`
    })
    sun = new T.Mesh(new T.SphereGeometry(1.5, 48, 32), sunMat)
    scene.add(sun)
    sunGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: new T.Color(P.accent), transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }))
    sunGlow.scale.setScalar(8)
    scene.add(sunGlow)
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: new T.Color(P.frame), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }))
    halo.scale.setScalar(20)
    scene.add(halo)

    // the three stations
    const st = [
      ['canvas', P.text, () => { const g = new T.Group(); for (let i = 0; i < 3; i++) { const b = new T.BoxGeometry(0.78, 0.5, 0.02); const e = new T.LineSegments(new T.EdgesGeometry(b), new T.LineBasicMaterial({ color: new T.Color(P.text), transparent: true, opacity: 1 - i * 0.28 })); e.position.set(i * 0.12, i * 0.1, -i * 0.12); g.add(e) } g.add(new T.Mesh(new T.PlaneGeometry(0.76, 0.48), new T.MeshBasicMaterial({ color: new T.Color(P.text), transparent: true, opacity: 0.18, side: T.DoubleSide }))); return g }],
      ['video', P.info, () => { const g = new T.Group(); g.add(new T.Mesh(new T.TorusGeometry(0.46, 0.08, 8, 24), new T.MeshBasicMaterial({ color: new T.Color(P.info) }))); for (let i = 0; i < 5; i++) { const m = new T.Mesh(new T.CircleGeometry(0.11, 12), new T.MeshBasicMaterial({ color: new T.Color(P.info), side: T.DoubleSide })); const a = i / 5 * Math.PI * 2; m.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0); g.add(m) } return g }],
      ['app', P.ok, () => { const g = new T.Group(); g.add(new T.Mesh(new T.IcosahedronGeometry(0.42, 0), new T.MeshBasicMaterial({ color: new T.Color(P.ok), wireframe: true }))); g.add(new T.Mesh(new T.SphereGeometry(0.17, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(P.ok) }))); return g }]
    ]
    for (const [view, color, make] of st) {
      const obj = make()
      const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: new T.Color(color), transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending }))
      glow.scale.setScalar(2.4)
      const g = new T.Group()
      g.add(obj, glow)
      scene.add(g)
      const el = document.createElement('button')
      el.className = 'ob-label station off'
      el.style.setProperty('--st', color)
      el.innerHTML = `<i class="dot"></i><span>${C.STATIONS[view]}</span><small></small>`
      el.onclick = () => C.go('station', view)
      labelsEl.append(el)
      stations.push({ view, g, obj, el, pos: v() })
    }
    ready = true
    resize()
    new ResizeObserver(resize).observe(root)
  }

  function resize() {
    if (!renderer) return
    const w = root.clientWidth, h = root.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // keep the outer orbit in view on a narrow window
    camera.fov = w / h < 1.2 ? 56 : 42
    camera.updateProjectionMatrix()
  }

  // ---------- planets, moons and minions follow the canvas's state
  const layout = n => {
    const step = Math.min(2.1, 11 / Math.max(1, n))
    return i => 3.6 + i * step + (n > 6 ? (i % 2) * 0.4 : 0)
  }
  function themeColors() {
    const vars = S()?.theme?.vars || {}
    const pick = k => (/^#[0-9a-f]{3,8}$/i.test(vars[k] || '') ? vars[k] : null)
    const P = C.palette()
    return { primary: pick('--primary') || P.accent, accent: pick('--accent') || P.info, list: ['--primary', '--accent', '--secondary', '--muted', '--foreground'].map(pick).filter(Boolean) }
  }
  function planetMaterial(color) {
    return new T.ShaderMaterial({
      uniforms: { uMap: { value: null }, uHas: { value: 0 }, uColor: { value: new T.Color(color) }, uGlow: { value: 0 }, uRim: { value: new T.Color(C.palette().frameHi) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D uMap; uniform float uHas; uniform vec3 uColor; uniform float uGlow; uniform vec3 uRim; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 L = normalize(-vW); vec3 V = normalize(cameraPosition - vW);
          // the sun lights one side; a soft fill from the camera keeps the far side readable
          float lit = .55 + .65 * max(dot(vN, L), 0.0) + .3 * max(dot(vN, V), 0.0);
          float band = .5 + .5 * sin(vUv.y * 22.0 + sin(vUv.x * 12.0) * 1.2);
          // dark sites (near-black pages) are lifted so the page still reads on the planet
          vec3 t = texture2D(uMap, vUv).rgb; float lum = dot(t, vec3(.299, .587, .114));
          t = mix(t, t * 1.9 + .1, smoothstep(.32, .06, lum));
          vec3 base = mix(uColor * (.75 + band * .35), t * 1.35 + uColor * .18, uHas);
          float rim = pow(1.0 - max(dot(vN, V), 0.0), 2.2);
          gl_FragColor = vec4(base * lit + uColor * .12 + uRim * rim * 1.25 + uColor * rim * .35 + vec3(1.0, 1.0, .6) * uGlow * .35, 1.0); }`
    })
  }
  function ringLine(r, P) {
    const pts = []
    for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)) }
    return new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: new T.Color(P.text), transparent: true, opacity: 0.12 }))
  }

  const pageBusy = (s, id) => [...s.layers.values()].some(l => (l.page === id) && (l.status === 'assigned' || l.status === 'streaming'))
  const pageCount = (s, id) => { let n = 0, d = 0; for (const l of s.layers.values()) if (l.page === id || l.page === '*') { n++; if (l.status === 'done') d++ } return [d, n] }

  function sync() {
    const s = S()
    if (!s) return
    if (comm.run !== (s.run || null) && s.run) resetComm(s.run)
    const tc = themeColors(), P = C.palette()
    if (ready) {
      sunMat.uniforms.uA.value.set(tc.primary)
      sunGlow.material.color.set(tc.primary)
    }
    // planets
    const R = layout(s.frames.length)
    const seen = new Set()
    for (const f of s.frames) {
      seen.add(f.id)
      let p = planets.get(f.id)
      const [d, n] = pageCount(s, f.id)
      if (!p) {
        p = { id: f.id, index: f.index, r: R(f.index), phase: f.index * 2.39996, size: 0.62 + ((Crew.hash(f.id) % 5) * 0.04), pop: 0, sig: '', thumb: null, asked: 0 }
        if (ready) {
          p.mat = planetMaterial(tc.list[f.index % Math.max(1, tc.list.length)] || P.frameHi)
          p.mesh = new T.Mesh(new T.SphereGeometry(1, 40, 28), p.mat)
          p.mesh.scale.setScalar(p.size)
          p.ring = ringLine(p.r, P)
          scene.add(p.mesh, p.ring)
        }
        p.el = document.createElement('button')
        p.el.className = 'ob-label planet off'
        p.el.innerHTML = '<span></span><div class="bar"><i></i></div><small></small>'
        p.el.onclick = () => openPage(f.id)
        labelsEl.append(p.el)
        planets.set(f.id, p)
      }
      if (ready && Math.abs(p.r - R(f.index)) > 0.01) { p.r = R(f.index); scene.remove(p.ring); p.ring = ringLine(p.r, P); scene.add(p.ring) }
      p.title = f.title
      p.done = d; p.total = n; p.busy = pageBusy(s, f.id)
      if (p.el.firstChild.textContent !== f.title) { p.el.firstChild.textContent = f.title; p.lw = 0 }
      p.el.querySelector('.bar i').style.width = `${n ? (d / n * 100).toFixed(0) : 0}%`
      p.el.querySelector('small').textContent = n ? `${d}/${n} sections` : 'planned'
      p.el.classList.toggle('busy', p.busy)
      if (ready && !p.mat.uniforms.uHas.value) p.mat.uniforms.uColor.value.set(tc.list[f.index % Math.max(1, tc.list.length)] || P.frameHi)
    }
    for (const [id, p] of planets) if (!seen.has(id)) { p.el.remove(); if (p.mesh) scene.remove(p.mesh, p.ring); planets.delete(id) }

    // moons: sections being built right now
    const live = new Set()
    for (const l of s.layers.values()) {
      if (l.status !== 'assigned' && l.status !== 'streaming') continue
      live.add(l.key)
      if (moons.has(l.key) || !ready) continue
      const a = l.agent != null ? s.agents.get(l.agent) : null
      const m = new T.Mesh(new T.SphereGeometry(0.15, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(a?.color || P.accent) }))
      const h = Crew.hash(l.key)
      moons.set(l.key, { key: l.key, page: l.page, mesh: m, r: l.page === '*' ? 2.35 : 1.0 + (h % 5) * 0.09, phase: (h % 628) / 100, tilt: ((h >>> 8) % 60 - 30) / 100, speed: 1.1 + (h % 7) * 0.12, born: performance.now(), dying: 0, pos: v() })
      scene.add(m)
    }
    for (const [k, m] of moons) if (!live.has(k) && !m.dying) m.dying = performance.now()

    // minions: the build's agents, and the app engine's helpers heard on the radio
    const want = new Map()
    for (const a of s.agents.values()) want.set(a.name, { name: a.name, color: a.color || Crew.color(a.name), layer: a.layer, idle: a.idle, seat: a.seat || 0 })
    const now = Date.now()
    let k = 0
    for (const [name, t] of radio) { if (now - t > 90000) { radio.delete(name); continue } if (!want.has(name)) want.set(name, { name, color: Crew.color(name), radio: true, seat: 100 + k++ }); else want.get(name).radio = true }
    for (const [name, w] of want) {
      let m = minions.get(name)
      if (!m) {
        m = { name, el: document.createElement('div'), pos: ready ? v() : null, prev: null, bubbleUntil: 0 }
        m.el.className = 'ob-minion'
        m.el.innerHTML = `${Crew.avatar(name, 28)}<span class="nm" style="background:${w.color};color:${Crew.ink(w.color)}">${esc(name)}</span>`
        // bubbles live in their own unscaled layer so they can be placed without overlapping
        m.bubble = document.createElement('div'); m.bubble.className = 'ob-bubble'; m.bubble.style.setProperty('--who', w.color)
        talkEl.append(m.bubble)
        crewEl.append(m.el)
        minions.set(name, m)
        if (ready) m.pos.set(0, 1.8, 0)
      }
      Object.assign(m, w)
    }
    for (const [name, m] of minions) if (!want.has(name)) { m.el.remove(); m.bubble.remove(); minions.delete(name) }

    // the sun's label and the empty state
    O.sunTitle = s.title || (s.run ? 'New build' : 'No build open')
    const status = !s.run && !sw.viewing ? 'Pick a star in the galaxy, or launch a new one' : s.kind === 'game' ? 'a game: its build lives in the Engine room' : !s.planned ? 'Hermia is plotting the course…' : s.tEnd ? `done · ${s.done}/${s.planned} sections · ${s.frames.length} pages` : `building · ${s.done}/${s.planned} sections`
    O.sunStatus = status
    emptyEl.hidden = !!s.frames.length || narrow()
    emptyEl.textContent = !s.run && !sw.viewing ? '' : s.kind === 'game' ? '' : 'Hermia is plotting the course: planets appear as she names the pages.'
    // the stations say what is happening in them, from the studio's own view badges
    for (const st of stations) {
      const badge = document.querySelector(`#views [data-view="${st.view}"] .vbadge`)
      const state = st.view === 'canvas' ? (s.tEnd ? 'done' : s.run ? 'working' : '') : (badge?.className.replace('vbadge', '').trim() || '')
      st.state = state
      st.el.classList.toggle('working', state === 'working')
      st.el.querySelector('small').textContent = state === 'working' ? '● working' : state === 'done' ? 'ready' : state === 'failed' ? 'needs a look' : { canvas: 'canvas', video: 'video', app: 'app + code' }[st.view]
    }
    if (narrow()) renderList()
    thumbs()
  }

  // a resting page's picture becomes its planet's surface (the hero, wrapped twice round)
  const thumbCache = new Map()
  async function thumbs() {
    if (O.thumbBusy || !ready && !narrow()) return
    const s = S()
    const sig = id => `${s.run}|${[...s.layers.values()].filter(l => l.page === id || l.page === '*').map(l => `${l.status}${l.ver}`).join('.')}`
    for (const p of planets.values()) {
      if (p.busy || !p.done) continue
      const want = sig(p.id)
      if (p.sig === want || performance.now() - p.asked < 4000) continue
      p.asked = performance.now()
      O.thumbBusy = true
      try {
        const src = await sw.thumb(p.id)
        if (src) { p.sig = want; await skin(p, src) }
      } catch {}
      O.thumbBusy = false
      return // one page at a time keeps it smooth
    }
  }
  function skin(p, src) {
    return new Promise(res => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = 512; c.height = 256
        const g = c.getContext('2d')
        const crop = Math.min(img.height, img.width * 0.62)
        g.drawImage(img, 0, 0, img.width, crop, 0, 0, 256, 256)
        g.drawImage(img, 0, 0, img.width, crop, 256, 0, 256, 256)
        p.thumb = c.toDataURL('image/jpeg', 0.7)
        thumbCache.set(p.id, p.thumb)
        if (ready && p.mat) {
          const tex = new T.CanvasTexture(c)
          tex.colorSpace = T.SRGBColorSpace
          p.mat.uniforms.uMap.value?.dispose?.()
          p.mat.uniforms.uMap.value = tex
          p.mat.uniforms.uHas.value = 1
        }
        res()
      }
      img.onerror = res
      img.src = src
    })
  }

  // Calm crew talk: at most SAY_MAX bubbles, one per minion, newest wins, each fades after SAY_MS,
  // short text, and placed each frame so they never overlap each other, the sun or its title (placeBubbles).
  const SAY_MAX = 3, SAY_MS = 3500, SAY_LEN = 60
  const short = t => { t = String(t).replace(/\s+/g, ' ').trim(); return t.length > SAY_LEN ? t.slice(0, SAY_LEN - 1).trimEnd() + '…' : t }
  // a bubble that is fading out still holds its spot for the fade, so a new one never lands on it
  function fade(m) { if (m.bubble.classList.contains('on')) { m.fadeBox = m.box; m.fadeUntil = performance.now() + 400 } m.bubble.classList.remove('on'); m.el.classList.remove('talking') }
  function quiet(m) { m.bubbleUntil = 0; m.spot = -1; fade(m) }
  function bubble(name, text) {
    const m = minions.get(name)
    if (!m || !text) return
    const t = short(text)
    if (m.bubble.textContent !== t) { m.bubble.textContent = t; m.bw = 0 }
    m.bubbleAt = performance.now(); m.bubbleUntil = m.bubbleAt + SAY_MS
    const talking = [...minions.values()].filter(x => x.bubbleUntil).sort((a, b) => b.bubbleAt - a.bubbleAt)
    for (const x of talking.slice(SAY_MAX)) quiet(x)
  }
  const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
  function placeBubbles(w, h, keepOut) {
    const talking = [...minions.values()].filter(m => m.bubbleUntil).sort((a, b) => b.bubbleAt - a.bubbleAt)
    if (!talking.length) return
    const now = performance.now()
    const placed = [...minions.values()].filter(m => m.fadeUntil > now && m.fadeBox).map(m => m.fadeBox)
    for (const m of talking) {
      if (!m.bw) { m.bw = m.bubble.offsetWidth; m.bh = m.bubble.offsetHeight }
      const { bw, bh } = m, x = m.sx, y = m.sy, r = 12 * (m.sc || 1)
      const spots = [[x + r, y - r - bh], [x - r - bw, y - r - bh], [x - bw / 2, y - r - 8 - bh], [x + r, y + r + 2], [x - r - bw, y + r + 2]]
      // first try to also leave the bubbles already showing where they are; only if that fails does the newest push one out
      const soft = talking.filter(o => o !== m && o.spot >= 0 && o.box && o.bubble.classList.contains('on')).map(o => o.box)
      const ok = (i, avoid = soft) => {
        const b = { x: spots[i][0], y: spots[i][1], w: bw, h: bh }
        for (const k of avoid) if (hit(b, k, 6)) return null
        if (b.x < 6 || b.y < 6 || b.x + bw > w - 6 || b.y + bh > h - 6) return null
        for (const k of keepOut) if (hit(b, k, 4)) return null
        for (const k of placed) if (hit(b, k, 6)) return null
        return b
      }
      let spot = -1, box = null
      if (m.hidden) spot = -1
      else if (m.spot >= 0 && (box = ok(m.spot))) spot = m.spot   // keep its place while it still fits: no jitter
      else {
        for (let i = 0; i < spots.length && spot < 0; i++) if ((box = ok(i))) spot = i
        for (let i = 0; i < spots.length && spot < 0; i++) if ((box = ok(i, []))) spot = i
      }
      if (spot < 0) { m.spot = -1; fade(m); continue }   // no room: drop it for now
      m.spot = spot; m.box = box; m.fadeUntil = 0; placed.push(box)
      m.bubble.dataset.at = spot
      m.bubble.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`
      m.bubble.classList.add('on'); m.el.classList.add('talking')
    }
  }
  function hop(name) {
    const m = minions.get(name)
    if (!m) return
    m.el.classList.remove('hop'); void m.el.offsetWidth; m.el.classList.add('hop')
    setTimeout(() => m.el.classList.remove('hop'), 600)
  }
  function doneFlash(key) {
    const mo = moons.get(key)
    const p = planets.get(key.split('/')[0])
    if (p) p.pop = 1
    if (mo && !mo.dying) mo.dying = performance.now()
  }
  function openPage(id) {
    C.go('station', 'canvas')
    setTimeout(() => sw.focusPage(id), 80)
  }

  // ---------- the frame loop
  let raf = 0, last = 0, clock = 0, frames = 0, fpsAt = 0
  const mouse = { x: 0, y: 0 }
  root.addEventListener('pointermove', e => { const r = root.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width * 2 - 1; mouse.y = (e.clientY - r.top) / r.height * 2 - 1 })
  // Space can be moved (spec 12, rule 5): drag turns the view, the wheel or a pinch zooms, Recentre
  // brings it back. A press that moves less than a few pixels is still a click on a planet.
  const nav = { yaw: 0, pitch: 0, zoom: 1, ty: 0, tp: 0, tz: 1, ptrs: new Map(), drag: false, moved: false, pinch: 0 }
  const recentreBtn = root.querySelector('.ob-recentre')
  const clampNav = () => { nav.tp = Math.max(-0.55, Math.min(0.5, nav.tp)); nav.tz = Math.max(0.5, Math.min(1.7, nav.tz)) }
  const showRecentre = () => { recentreBtn.hidden = Math.abs(nav.ty) < 0.02 && Math.abs(nav.tp) < 0.02 && Math.abs(nav.tz - 1) < 0.02 }
  recentreBtn.onclick = () => { nav.ty = 0; nav.tp = 0; nav.tz = 1; showRecentre() }
  canvas.style.touchAction = 'none'
  canvas.addEventListener('pointerdown', e => {
    nav.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY })
    if (nav.ptrs.size === 1) { nav.moved = false; nav.drag = true }
    if (nav.ptrs.size === 2) { const [a, b] = [...nav.ptrs.values()]; nav.pinch = Math.hypot(a.x - b.x, a.y - b.y) }
    try { canvas.setPointerCapture(e.pointerId) } catch {}
  })
  canvas.addEventListener('pointermove', e => {
    const p = nav.ptrs.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 5) nav.moved = true
    if (nav.ptrs.size === 2) {
      const [a, b] = [...nav.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y)
      if (nav.pinch) nav.tz *= nav.pinch / Math.max(20, d)
      nav.pinch = d
    } else if (nav.moved) { nav.ty -= dx * 0.006; nav.tp += dy * 0.004 }
    clampNav(); showRecentre()
  })
  const up = e => { nav.ptrs.delete(e.pointerId); if (nav.ptrs.size < 2) nav.pinch = 0; if (!nav.ptrs.size) nav.drag = false }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('wheel', e => { e.preventDefault(); nav.tz *= Math.exp(e.deltaY * 0.0012); clampNav(); showRecentre() }, { passive: false })
  // keepOut: the boxes the stations and labels must stay clear of (rule 4), in the scene's pixels
  function keepOuts() {
    const rr = root.getBoundingClientRect(), out = []
    const add = (el, pad = 6) => { if (!el || el.hidden || !el.getClientRects().length) return; const b = el.getBoundingClientRect(); if (b.width && b.height && b.bottom > rr.top && b.top < rr.bottom) out.push({ x: b.left - rr.left - pad, y: b.top - rr.top - pad, w: b.width + pad * 2, h: b.height + pad * 2 }) }
    add(root.querySelector('.comm')); add(thoughtEl, 14); add(recentreBtn)
    const ap = document.querySelector('.auto-panel'); if (ap && !ap.hidden) add(ap, 8)
    return out
  }
  function project(p, w, h) {
    tmpV.copy(p).project(camera)
    return { x: (tmpV.x + 1) / 2 * w, y: (1 - tmpV.y) / 2 * h, z: tmpV.z, d: camera.position.distanceTo(p) }
  }
  function loop(now) {
    raf = 0
    if (!O.on || document.hidden) return
    if (narrow() || !ready) { raf = requestAnimationFrame(loop); return }
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    const still = C.reduced()
    if (!still) clock += dt
    const s = S()
    const w = root.clientWidth, h = root.clientHeight
    // camera: a slow drift with the mouse
    // the camera backs off as the system grows, so the outer orbit and the stations stay in view
    let far = 6
    for (const p of planets.values()) far = Math.max(far, p.r)
    const dist = (far + 3.4) * 1.8
    const kn = 1 - Math.exp(-dt * (nav.drag ? 18 : 6))
    nav.yaw += (nav.ty - nav.yaw) * kn; nav.pitch += (nav.tp - nav.pitch) * kn; nav.zoom += (nav.tz - nav.zoom) * kn
    const lookY = -far * 0.2, hy = dist * 0.66 - lookY, hz = dist * 0.82
    const r0 = Math.hypot(hy, hz) * nav.zoom, el0 = Math.max(0.12, Math.min(1.45, Math.atan2(hy, hz) + nav.pitch))
    const drift = still || nav.drag ? 0 : 1
    const px = mouse.x * 1.4 * drift, flat = r0 * Math.cos(el0)
    const tx = Math.sin(nav.yaw) * flat + Math.cos(nav.yaw) * px, tz = Math.cos(nav.yaw) * flat - Math.sin(nav.yaw) * px
    const ty = lookY + r0 * Math.sin(el0) - mouse.y * 0.9 * drift
    const kc = nav.drag ? 0.35 : 0.06
    camera.position.x += (tx - camera.position.x) * kc
    camera.position.y += (ty - camera.position.y) * kc
    camera.position.z += (tz - camera.position.z) * kc
    camera.lookAt(0, lookY, 0)
    sunMat.uniforms.uTime.value = clock
    sunMat.uniforms.uHot.value = s?.run && !s.tEnd ? 1 : 0
    sun.rotation.y = clock * 0.1
    sunGlow.scale.setScalar(8 + (still ? 0 : Math.sin(now / 700) * (s?.run && !s.tEnd ? 0.5 : 0.2)))

    // planets on their orbits
    let outer = 6
    for (const p of planets.values()) {
      const a = p.phase + clock * (0.55 / Math.pow(p.r, 1.25))
      p.x = Math.cos(a) * p.r; p.z = Math.sin(a) * p.r
      if (p.mesh) {
        p.mesh.position.set(p.x, 0, p.z)
        p.pop = Math.max(0, p.pop - dt * 1.6)
        p.mesh.scale.setScalar(p.size * (1 + p.pop * 0.18))
        p.mesh.rotation.y = clock * 0.25 + p.phase
        p.mat.uniforms.uGlow.value = p.busy ? 0.5 + 0.5 * Math.sin(now / 300) : p.pop
      }
      outer = Math.max(outer, p.r)
    }
    // moons round their planet (or round the sun for shared sections); done ones sink in
    for (const [k, m] of moons) {
      const p = planets.get(m.page)
      const cx = p ? p.x : 0, cz = p ? p.z : 0
      const a = m.phase + clock * m.speed
      let r = m.r, sc = Math.min(1, (now - m.born) / 400)
      if (m.dying) { const k2 = Math.min(1, (now - m.dying) / 650); r *= 1 - k2; sc *= 1 - k2 * 0.8; if (k2 >= 1) { scene.remove(m.mesh); m.mesh.geometry.dispose(); moons.delete(k); continue } }
      m.mesh.position.set(cx + Math.cos(a) * r, Math.sin(a) * r * m.tilt + (p ? 0 : 0.2), cz + Math.sin(a) * r)
      m.mesh.scale.setScalar(Math.max(0.01, sc))
      m.pos.copy(m.mesh.position)
    }
    // stations: fixed on an outer ring, in front, turning slowly
    const sr = outer + 1.5
    stations.forEach((st, i) => {
      const a = Math.PI * (0.78 - i * 0.28), x0 = Math.cos(a) * sr, z0 = Math.sin(a) * sr * 0.8, cy = Math.cos(nav.yaw), sy = Math.sin(nav.yaw)
      st.g.position.set(x0 * cy + z0 * sy, -0.6, -x0 * sy + z0 * cy)
      if (st.view === 'video') { st.obj.rotation.z = -clock * 0.9; st.obj.rotation.y = 0.35 } else st.obj.rotation.y = clock * 0.6 + i
      st.obj.rotation.x = st.view === 'canvas' ? -0.35 : st.view === 'video' ? -0.75 : 0.5
      st.pos.copy(st.g.position)
    })
    renderer.render(scene, camera)

    // DOM: labels and minions ride on top of the scene
    const sp = project(sun.position, w, h)
    if (!O.sunEl) { O.sunEl = document.createElement('div'); O.sunEl.className = 'ob-label sun'; O.sunEl.innerHTML = '<span></span><small></small>'; labelsEl.prepend(O.sunEl) }
    if (O.sunEl.firstChild.textContent !== O.sunTitle) O.sunEl.firstChild.textContent = O.sunTitle
    if (O.sunEl.lastChild.textContent !== O.sunStatus) O.sunEl.lastChild.textContent = O.sunStatus
    const sunPx = sunPixels(sp.d, h)
    if (O.sunMeasured !== O.sunTitle + O.sunStatus) { O.sunMeasured = O.sunTitle + O.sunStatus; O.sunW = O.sunEl.offsetWidth; O.sunH = O.sunEl.offsetHeight }
    const sunBox = { x: sp.x - O.sunW / 2, y: sp.y + sunPx + 10, w: O.sunW, h: O.sunH }
    const sunDisc = { x: sp.x - sunPx * .8, y: sp.y - sunPx * .8, w: sunPx * 1.6, h: sunPx * 1.6 }
    const outs = keepOuts()
    const labelBoxes = [sunBox, ...outs]
    // stations: under their object if that spot is free, else the nearest free spot; never hidden, never under a bar
    for (const st of stations) {
      const q = project(st.pos, w, h)
      if (!st.lw || st.lt !== st.el.textContent) { st.lt = st.el.textContent; st.lw = st.el.offsetWidth; st.lh = st.el.offsetHeight }
      const bw = st.lw, bh = st.lh
      const fits = b => b.x >= 8 && b.y >= 8 && b.x + b.w <= w - 8 && b.y + b.h <= h - 8 && !labelBoxes.some(k => hit(b, k, 6))
      const bx = Math.max(8, Math.min(w - 8 - bw, q.x - bw / 2)), by = Math.max(8, Math.min(h - 8 - bh, q.y + 24))
      let box = null
      for (let r = 0; r <= 420 && !box; r += 12) {
        for (const [dx, dy] of [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r]]) {
          const b = { x: bx + dx, y: by + dy, w: bw, h: bh }
          if (fits(b)) { box = b; break }
        }
      }
      box ||= { x: bx, y: by, w: bw, h: bh }
      labelBoxes.push(box)
      st.box = box
      st.el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`
      st.el.classList.remove('off')
    }
    O.sunEl.style.transform = `translate(-50%, 0) translate(${sp.x.toFixed(1)}px, ${(sp.y + sunPx + 10).toFixed(1)}px)`
    for (const p of planets.values()) {
      if (!p.mesh) continue
      const q = project(p.mesh.position, w, h)
      const rpx = sunPixels(q.d, h) * p.size / 1.5
      // the label sits under its planet; if that would cover the sun's title (or another label), it moves above the planet, else it hides
      if (!p.lw) { p.lw = p.el.offsetWidth; p.lh = p.el.offsetHeight }
      let ly = q.y + rpx + 4, box = { x: q.x - p.lw / 2, y: ly, w: p.lw, h: p.lh }
      let clash = labelBoxes.some(b => hit(box, b, 4))
      if (clash) { ly = q.y - rpx - 4 - p.lh; box = { ...box, y: ly }; clash = labelBoxes.some(b => hit(box, b, 4)) }
      if (!clash && q.z <= 1) labelBoxes.push(box)
      p.el.style.transform = `translate(-50%, 0) translate(${q.x.toFixed(1)}px, ${ly.toFixed(1)}px)`
      p.sx = q.x; p.sy = q.y; p.spx = rpx
      p.el.classList.toggle('off', q.z > 1 || clash)
    }
    // minions fly to their section's moon, the radio crew to the Engine room, the idle ones park above the sun
    const engine = stations.find(x => x.view === 'app')
    const busyCount = new Map()
    for (const m of minions.values()) {
      const mo = m.layer && moons.get(m.layer)
      const pl = m.layer && planets.get(m.layer.split('/')[0])
      if (mo) tmpV.copy(mo.pos).add({ x: 0, y: 0.55, z: 0 })
      else if (pl && pl.mesh) tmpV.set(pl.x, 0.9, pl.z)
      else if (m.radio && engine && !m.layer) { const n = busyCount.get('r') || 0; busyCount.set('r', n + 1); tmpV.copy(engine.pos).add({ x: Math.cos(n * 1.3 + clock) * 0.9, y: 0.7 + (n % 2) * 0.3, z: Math.sin(n * 1.3 + clock) * 0.5 }) }
      else { const a = (m.seat || 0) * 0.62 + clock * 0.15; tmpV.set(Math.cos(a) * 2.3, 2.1 + ((m.seat || 0) % 3) * 0.25, Math.sin(a) * 2.3) }
      if (!m.pos) m.pos = v().copy(tmpV)
      const before = m.pos.clone()
      const k = still ? 1 : 1 - Math.exp(-dt * 2.4)
      m.pos.lerp(tmpV, k)
      const moving = !still && before.distanceTo(m.pos) / Math.max(dt, 1e-3) > 0.8
      m.el.classList.toggle('moving', moving)
      if (m.bubbleUntil && now > m.bubbleUntil) quiet(m)
      const q = project(m.pos, w, h)
      const sc = Math.max(0.55, Math.min(1.25, 18 / q.d))
      m.el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) scale(${sc.toFixed(3)})`
      m.el.classList.toggle('far', sc < 0.75)
      m.el.style.display = q.z > 1 ? 'none' : ''
      m.sx = q.x; m.sy = q.y; m.sc = sc; m.hidden = q.z > 1
    }
    const thought = thoughtEl && !thoughtEl.hidden ? thoughtEl.getBoundingClientRect() : null, rr = thought && root.getBoundingClientRect()
    placeBubbles(w, h - 64, [sunBox, sunDisc, ...labelBoxes.slice(1), ...(thought ? [{ x: thought.left - rr.left, y: thought.top - rr.top, w: thought.width, h: thought.height }] : [])])
    O.boxes = { stations: stations.map(s => ({ view: s.view, ...s.box })) }

    frames++
    if (now - fpsAt > 1000) { O.fps = Math.round(frames * 1000 / (now - fpsAt || 1)); frames = 0; fpsAt = now }
    raf = requestAnimationFrame(loop)
  }
  // a sphere's on-screen radius in px, for a sphere of radius 1.5 at distance d
  const sunPixels = (d, h) => (1.5 / (d * Math.tan(camera.fov * Math.PI / 360))) * (h / 2)
  const kick = () => { if (!raf && O.on && !document.hidden) { last = 0; raf = requestAnimationFrame(loop) } }
  document.addEventListener('visibilitychange', kick)

  // clicking a planet on the canvas opens it on the Design deck
  canvas.addEventListener('click', e => {
    if (nav.moved) { nav.moved = false; return }
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    let best = null, bd = 40
    for (const p of planets.values()) { const d = Math.hypot(p.sx - x, p.sy - y); if (d < Math.max(bd, p.spx || 0)) { bd = d; best = p } }
    if (best) openPage(best.id)
  })

  // ---------- phones: a list of planets
  function renderList() {
    const s = S()
    const tc = themeColors()
    const stationsHtml = ['canvas', 'video', 'app'].map(view => {
      const st = stations.find(x => x.view === view)
      const color = { canvas: 'var(--text)', video: 'var(--info)', app: 'var(--ok)' }[view]
      return `<button data-view="${view}" style="--st:${color}">${C.STATIONS[view]}<small>${st?.el.querySelector('small').textContent || { canvas: 'canvas', video: 'video', app: 'app + code' }[view]}</small></button>`
    }).join('')
    const planetsHtml = s.frames.map(f => {
      const p = planets.get(f.id)
      const crew = [...s.agents.values()].filter(a => a.layer && a.layer.startsWith(`${f.id}/`)).map(a => Crew.avatar(a.name, 20)).join('')
      const pc = tc.list[f.index % Math.max(1, tc.list.length)] || 'var(--frame-hi)'
      const bg = p?.thumb ? `background-image:url(${p.thumb})` : ''
      return `<button class="ol-planet" data-id="${esc(f.id)}"><i class="pl" style="--pc:${esc(pc)};${bg}"></i><div><b>${esc(f.title)}</b><div class="bar"><i style="width:${p?.total ? (p.done / p.total * 100).toFixed(0) : 0}%"></i></div><small>${p?.total ? `${p.done}/${p.total} sections` : 'planned'}${p?.busy ? ' · building' : ''}</small><div class="crew">${crew}</div></div></button>`
    }).join('')
    const html = `<div class="ol-sun" style="--sun:${esc(tc.primary)}"><i></i><div><b>${esc(O.sunTitle || '')}</b><small>${esc(O.sunStatus || '')}</small></div></div><div class="ol-stations">${stationsHtml}</div>${planetsHtml}`
    if (html === O.listKey) return
    O.listKey = html
    listEl.innerHTML = html
    for (const b of listEl.querySelectorAll('.ol-stations button')) b.onclick = () => C.go('station', b.dataset.view)
    for (const b of listEl.querySelectorAll('.ol-planet')) b.onclick = () => openPage(b.dataset.id)
  }

  O.show = async () => {
    const was = root.hidden
    root.hidden = false
    if (was && !C.reduced()) { root.classList.remove('in'); void root.offsetWidth; root.classList.add('in') }
    O.on = true
    if (!ready && !O.loading) {
      O.loading = true
      try { await init(); for (const p of planets.values()) { p.el.remove() } planets.clear() } catch (err) { console.error('orbit: three.js did not load', err) }
    }
    showRecentre()
    sync()
    clearInterval(O.timer)
    O.timer = setInterval(sync, 250)
    kick()
  }
  O.nav = nav
  O.hide = () => {
    O.on = false
    clearInterval(O.timer)
    openLog(false)
    root.hidden = true
  }
  return O
}
