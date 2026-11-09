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
  root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="ob-labels"></div><div class="ob-crew"></div><div class="ob-empty" hidden></div><div class="ob-list"></div>
    <div class="think-log" hidden role="dialog" aria-label="Hermia's thinking"><header><b>Hermia’s <em>thinking</em></b><button class="x" title="Close (Esc)" aria-label="Close">${ico('x')}</button></header><ol></ol></div>
    <div class="comm" role="status" aria-live="polite">
      <div class="comm-thought" hidden title="Hermia's reasoning: click for the full log"></div>
      <img src="brand/hermia-mark.svg" alt="">
      <button class="comm-text" title="Hermia's orders and reasoning: click for the full log"><b>HERMIA</b><span>Standing by.</span></button>
      <button class="comm-btn comm-log" title="Hermia's thinking: everything she reasoned and ordered">${ico('brain')}<span class="t">Thinking</span> <em></em></button>
      <button class="comm-btn comm-chat" title="Open the chat column">${ico('chat')}<span class="t">Chat</span></button>
    </div>`
  document.body.append(root)
  const canvas = root.querySelector('canvas'), labelsEl = root.querySelector('.ob-labels'), crewEl = root.querySelector('.ob-crew')
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
  const openLog = (on = logEl.hidden) => { logEl.hidden = !on; if (on) { renderLog(); logList.scrollTop = logList.scrollHeight } }
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
      el.title = { canvas: 'Design deck: the canvas, every page and section', video: 'Film studio: the promo video', app: 'Engine room: the working app, its code and the code wall' }[view]
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
        void main(){ vec3 L = normalize(-vW); float lit = .5 + .75 * max(dot(vN, L), 0.0);
          float band = .5 + .5 * sin(vUv.y * 22.0 + sin(vUv.x * 12.0) * 1.2);
          vec3 base = mix(uColor * (.75 + band * .35), texture2D(uMap, vUv).rgb * 1.35 + uColor * .18, uHas);
          vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - max(dot(vN, V), 0.0), 2.5);
          gl_FragColor = vec4(base * lit + uColor * .12 + uRim * rim * .9 + vec3(1.0, 1.0, .6) * uGlow * .35, 1.0); }`
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
      p.el.firstChild.textContent = f.title
      p.el.querySelector('.bar i').style.width = `${n ? (d / n * 100).toFixed(0) : 0}%`
      p.el.querySelector('small').textContent = n ? `${d}/${n} sections` : 'planned'
      p.el.classList.toggle('busy', p.busy)
      p.el.title = `${f.title}: open it on the Design deck`
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
        m.el.innerHTML = `${Crew.avatar(name, 28)}<span class="nm" style="background:${w.color};color:${Crew.ink(w.color)}">${esc(name)}</span><div class="ob-bubble" style="--who:${w.color}"></div>`
        m.bubble = m.el.querySelector('.ob-bubble')
        crewEl.append(m.el)
        minions.set(name, m)
        if (ready) m.pos.set(0, 1.8, 0)
      }
      Object.assign(m, w)
    }
    for (const [name, m] of minions) if (!want.has(name)) { m.el.remove(); minions.delete(name) }

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

  function bubble(name, text, ms) {
    const m = minions.get(name)
    if (!m || !text) return
    m.bubble.textContent = String(text).slice(0, 110)
    m.bubbleUntil = performance.now() + ms
    m.el.classList.add('talking')
    // at most three talk at once: the oldest bubble gives way
    const talking = [...minions.values()].filter(x => x.bubbleUntil).sort((a, b) => a.bubbleUntil - b.bubbleUntil)
    for (const x of talking.slice(0, Math.max(0, talking.length - 3))) { x.bubbleUntil = 0; x.el.classList.remove('talking') }
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
    const tx = still ? 0 : mouse.x * 1.4, ty = dist * 0.66 + (still ? 0 : -mouse.y * 0.9), tz = dist * 0.82
    camera.position.x += (tx - camera.position.x) * 0.04
    camera.position.y += (ty - camera.position.y) * 0.04
    camera.position.z += (tz - camera.position.z) * 0.04
    camera.lookAt(0, -far * 0.2, 0)
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
      const a = Math.PI * (0.78 - i * 0.28)
      st.g.position.set(Math.cos(a) * sr, -0.6, Math.sin(a) * sr * 0.8)
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
    O.sunEl.style.transform = `translate(-50%, 0) translate(${sp.x.toFixed(1)}px, ${(sp.y + sunPx + 10).toFixed(1)}px)`
    for (const p of planets.values()) {
      if (!p.mesh) continue
      const q = project(p.mesh.position, w, h)
      const rpx = sunPixels(q.d, h) * p.size / 1.5
      p.el.style.transform = `translate(-50%, 0) translate(${q.x.toFixed(1)}px, ${(q.y + rpx + 4).toFixed(1)}px)`
      p.sx = q.x; p.sy = q.y; p.spx = rpx
      p.el.classList.toggle('off', q.z > 1)
    }
    for (const st of stations) {
      const q = project(st.pos, w, h)
      st.el.style.transform = `translate(-50%, 0) translate(${q.x.toFixed(1)}px, ${(q.y + 24).toFixed(1)}px)`
      st.el.classList.toggle('off', q.z > 1 || q.y > h - 60)
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
      if (m.bubbleUntil && now > m.bubbleUntil) { m.bubbleUntil = 0; m.el.classList.remove('talking') }
      const q = project(m.pos, w, h)
      const sc = Math.max(0.55, Math.min(1.25, 18 / q.d))
      m.el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) scale(${sc.toFixed(3)})`
      m.el.classList.toggle('far', sc < 0.75)
      m.el.style.display = q.z > 1 ? 'none' : ''
    }

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
    sync()
    clearInterval(O.timer)
    O.timer = setInterval(sync, 250)
    kick()
  }
  O.hide = () => {
    O.on = false
    clearInterval(O.timer)
    openLog(false)
    root.hidden = true
  }
  return O
}
