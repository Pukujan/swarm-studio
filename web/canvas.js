// Swarm Studio canvas. Draws engine events: one frame (iframe) per page, one
// slot per layer, one cursor per agent. Nothing here is scripted: every box,
// cursor move, tool and bubble comes from a real model stream.

const $ = s => document.querySelector(s)
// Inlined by the server: the API token and the page-frame template. Frames are
// built from srcdoc so they share this document's origin even when it is opaque
// (inside the Desktop pane's sandboxed frame).
const BOOT = window.SWARM || {}
const FRAME_W = 1280
const GAP = 260
const els = {
  viewport: $('#viewport'), world: $('#world'), wires: $('#wires'), cursors: $('#cursors'), toolbar: $('#toolbar'),
  status: $('#status'), camHint: $('#camera-hint'), timer: $('#timer'), plan: $('#plan-stream'), planState: $('#plan-state'),
  theme: $('#theme'), tree: $('#tree'), agents: $('#agents-list'), agentCount: $('#agent-count'), feed: $('#feed'),
  form: $('#brief-form'), brief: $('#brief'), agentsSel: $('#agents')
}

const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const TOOLS = [
  { id: 'move', label: 'Move', svg: icon('<path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor"/>') },
  { id: 'frame', label: 'Frame', svg: icon('<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>') },
  { id: 'rect', label: 'Shape', svg: icon('<rect x="4" y="5" width="16" height="14" rx="2"/>') },
  { id: 'text', label: 'Text', svg: icon('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>') },
  { id: 'image', label: 'Image', svg: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>') },
  { id: 'connect', label: 'Connect', svg: icon('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18c6 0 4-12 10-12"/>') },
  { id: 'comment', label: 'Comment', svg: icon('<path d="M4 5h16v11H9l-5 4z"/>') }
]
const TOOL = Object.fromEntries(TOOLS.map(t => [t.id, t]))
const ARROW = color => `<svg class="arrow" viewBox="0 0 20 20"><path d="M2 1l15 8.2-6.6 1.6L7.4 18z" fill="${color}" stroke="#0b0d12" stroke-width="1.4" stroke-linejoin="round"/></svg>`

let S
const cam = { x: 40, y: 140, s: 0.16, tx: 40, ty: 140, ts: 0.16, auto: true, nextFit: 0 }

function fresh(run = null) {
  S = { run, t0: 0, tEnd: 0, agents: new Map(), frames: [], layers: new Map(), order: [], wires: new Map(), plans: new Map(), planDirty: true, treeDirty: true, done: 0, planned: 0, theme: null }
  els.world.innerHTML = ''
  els.cursors.innerHTML = ''
  els.wires.innerHTML = ''
  els.feed.innerHTML = ''
  els.theme.innerHTML = ''
  els.planState.textContent = run ? 'planning' : 'idle'
}

// ---------- events

function on(e) {
  switch (e.type) {
    case 'reset':
      if (S.run !== e.run) fresh(e.run)
      break
    case 'run:start':
      fresh(e.run)
      S.t0 = e.t
      els.brief.value = e.brief
      els.agentsSel.value = String(e.agents.length)
      for (const a of e.agents) addAgent(a)
      feed(null, `Brief: ${e.brief}`, 'sys')
      break
    case 'plan:delta': {
      const k = e.page || 'sitemap'
      S.plans.set(k, (S.plans.get(k) || '') + e.text)
      S.planDirty = true
      break
    }
    case 'sitemap:done':
      els.planState.textContent = `sitemap ${(e.ms / 1000).toFixed(1)}s`
      break
    case 'page:planning': {
      const f = S.frames.find(fr => fr.id === e.page)
      feed(null, `Planner is drafting ${f ? f.title : e.page}`, 'sys')
      break
    }
    case 'plan:done':
      els.planState.textContent = `${e.pages} pages · ${e.layers} layers`
      feed(null, `Plan finished: ${e.pages} pages, ${e.layers} layers in ${(e.ms / 1000).toFixed(1)}s`, 'sys')
      break
    case 'theme':
      S.theme = e
      renderTheme()
      S.frames.forEach(applyTheme)
      break
    case 'page':
      addFrame(e)
      break
    case 'layer:plan':
      addLayer(e)
      break
    case 'agent:assign': {
      const a = S.agents.get(e.agent)
      const l = S.layers.get(key(e.page, e.layer))
      if (!a || !l) break
      a.layer = l.key
      a.idle = false
      a.assignedAt = performance.now()
      setTool(a, 'frame', 750)
      l.status = 'assigned'
      l.agent = a.id
      S.treeDirty = true
      break
    }
    case 'layer:delta': {
      const l = S.layers.get(key(e.page, e.layer))
      const a = S.agents.get(e.agent)
      if (!l) break
      l.text += e.text
      l.ver++
      if (l.status === 'assigned') { l.status = 'streaming'; S.treeDirty = true }
      if (a) setTool(a, detectTool(l.text))
      break
    }
    case 'agent:say': {
      const a = S.agents.get(e.agent)
      if (!a) break
      a.say = e.text
      a.sayUntil = performance.now() + 2800
      a.bubble.innerHTML = `<span></span>`
      a.bubble.firstChild.textContent = e.text
      setTool(a, 'comment', 450)
      feed(a, e.text, '', e.layer)
      break
    }
    case 'layer:done': {
      const l = S.layers.get(key(e.page, e.layer))
      if (!l) break
      l.status = 'done'
      l.ms = e.ms
      S.done = e.done
      S.treeDirty = true
      const a = S.agents.get(e.agent)
      if (a) { a.layer = null; setTool(a, 'move', 400) }
      break
    }
    case 'layer:failed': {
      const l = S.layers.get(key(e.page, e.layer))
      if (l) { l.status = 'failed'; S.treeDirty = true }
      const a = S.agents.get(e.agent)
      if (a) a.layer = null
      feed(a, `failed ${e.layer}: ${e.message}`, 'err')
      break
    }
    case 'agent:idle': {
      const a = S.agents.get(e.agent)
      if (a) { a.idle = true; a.layer = null; a.tool = 'move' }
      break
    }
    case 'run:done':
      S.tEnd = e.t
      feed(null, `Done: ${e.done}/${e.planned} layers across ${e.pages} pages in ${(e.ms / 1000).toFixed(1)}s${e.failed ? `, ${e.failed} failed` : ''}`, 'sys')
      els.planState.textContent = 'done'
      break
    case 'error':
      feed(null, `${e.where}: ${e.message}`, 'err')
      break
  }
}

const key = (page, id) => `${page}/${id}`

// ---------- agents

function addAgent(a) {
  const el = document.createElement('div')
  el.className = 'cursor idle'
  el.innerHTML = `${ARROW(a.color)}<div class="tag" style="background:${a.color}">${TOOL.move.svg}<span>${a.name}</span></div><div class="bubble" style="color:${a.color}"></div>`
  els.cursors.append(el)
  const vw = els.viewport.clientWidth
  const agent = {
    ...a, el, tagIcon: el.querySelector('.tag svg'), bubble: el.querySelector('.bubble'),
    layer: null, idle: true, tool: 'move', toolUntil: 0, sayUntil: 0, assignedAt: 0,
    wx: (vw / 2 - cam.x) / cam.s + (Math.random() - 0.5) * 2000, wy: (300 - cam.y) / cam.s + (Math.random() - 0.5) * 800
  }
  S.agents.set(a.id, agent)
}

function setTool(a, tool, holdMs = 0) {
  const now = performance.now()
  if (!holdMs && now < a.toolUntil) return
  if (holdMs) a.toolUntil = now + holdMs
  if (a.tool !== tool) {
    a.tool = tool
    a.tagIcon.outerHTML = TOOL[tool].svg
    a.tagIcon = a.el.querySelector('.tag svg')
  }
}

// What a stream is "doing" right now, read off its tail.
function detectTool(text) {
  if (text.lastIndexOf('<svg') > text.lastIndexOf('</svg>')) return 'image'
  const lt = text.lastIndexOf('<')
  if (lt < 0) return 'frame'
  const inTag = text.indexOf('>', lt) < 0
  // the tag being written, or the one whose text content is being written
  const tag = text.slice(lt)
  const name = (tag.match(/^<\/?([a-z0-9]+)/i) || [])[1]?.toLowerCase() || ''
  if (/data-goto/.test(tag)) return 'connect'
  if (!inTag) return 'text'
  if (/^(h[1-6]|p|span|a|li|label|strong|em|small|blockquote|button)$/.test(name)) return 'text'
  if (/^(path|circle|rect|ellipse|line|polyline|polygon|g|img)$/.test(name)) return 'image'
  if (/\b(bg-|border|rounded|shadow)/.test(tag)) return 'rect'
  return 'frame'
}

// ---------- frames and layers
// Each page is an iframe driven by messages (see frame.html): this side sends
// theme and slot updates, the frame reports its geometry back as `geo`.

function addFrame(p) {
  if (S.frames.some(f => f.id === p.id)) return
  const el = document.createElement('div')
  el.className = 'frame'
  const x = p.index * (FRAME_W + GAP)
  el.style.left = `${x}px`
  el.innerHTML = `<div class="frame-label"></div><iframe title=""></iframe>`
  el.querySelector('.frame-label').textContent = p.title
  el.querySelector('.frame-label').insertAdjacentHTML('beforeend', `<small>/${p.id}</small>`)
  const iframe = el.querySelector('iframe')
  iframe.title = p.title
  if (BOOT.frameHtml) iframe.srcdoc = BOOT.frameHtml
  else iframe.src = 'frame.html'
  const frame = { id: p.id, title: p.title, index: p.index, x, h: 700, el, iframe, ready: false, slots: new Map(), geo: { slots: {}, gotos: [] } }
  els.world.append(el)
  S.frames.push(frame)
  S.treeDirty = true
}

function post(f, msg) {
  f.iframe.contentWindow?.postMessage(msg, '*')
}

window.addEventListener('message', e => {
  const f = S.frames.find(fr => fr.iframe.contentWindow === e.source)
  if (!f) return
  const m = e.data || {}
  if (m.type === 'ready') {
    f.ready = true
    f.slots.clear()
    applyTheme(f)
    for (const k of S.order) ensureSlot(f, S.layers.get(k))
  } else if (m.type === 'geo') {
    f.geo = m
    linkWires(f)
  }
})

function addLayer(e) {
  const k = key(e.page, e.id)
  if (S.layers.has(k)) return
  const l = { key: k, page: e.page, id: e.id, role: e.role, height: Math.max(160, Math.min(900, Number(e.height) || 360)), links: e.links || [], text: '', ver: 0, status: 'planned', agent: null }
  S.layers.set(k, l)
  S.order.push(k)
  S.planned++
  S.treeDirty = true
  for (const f of S.frames) ensureSlot(f, l)
}

const belongs = (f, l) => l.page === '*' || l.page === f.id

function ensureSlot(f, l) {
  if (!f.ready || !l || !belongs(f, l) || f.slots.has(l.key)) return
  const where = l.page === '*' && l.id === 'nav' ? 'start' : l.page === '*' && l.id === 'footer' ? 'end' : 'before-footer'
  post(f, { type: 'slot', key: l.key, where })
  f.slots.set(l.key, { ver: -1, status: null, t: 0 })
}

function applyTheme(f) {
  if (f.ready && S.theme) post(f, { type: 'theme', theme: { vars: S.theme.vars, fonts: S.theme.fonts, radius: S.theme.radius } })
}

function clean(t) {
  return t
    .replace(/^\s*```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/<script[\s\S]*?(<\/script>|$)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

function syncSlots(now) {
  for (const f of S.frames) {
    if (!f.ready) continue
    for (const [k, slot] of f.slots) {
      const l = S.layers.get(k)
      const a = l.agent && S.agents.get(l.agent)
      const msg = { type: 'slot', key: k }
      if (slot.status !== l.status) {
        const prev = slot.status
        slot.status = l.status
        msg.cls = { planned: 'wire planned', assigned: 'wire', streaming: 'streaming', done: '', failed: 'wire failed' }[l.status]
        if (l.status === 'assigned') msg.anim = 'drawing'
        if (l.status === 'done' && prev) msg.anim = 'flash'
        msg.h = l.height
        if (a) msg.color = a.color
        msg.label = `${l.role} · ${a ? a.name : 'queued'}`
      }
      if (slot.ver !== l.ver && (l.status === 'done' || now - slot.t > 90)) {
        msg.html = clean(l.text)
        slot.ver = l.ver
        slot.t = now
      }
      if (Object.keys(msg).length > 2) post(f, msg)
    }
    const h = Math.max(700, f.geo.height || 0)
    if (h !== f.h) {
      f.h = h
      f.iframe.style.height = `${h}px`
    }
  }
}

// ---------- geometry (all from the frames' reports)

function slotFor(l) {
  const f = l.page === '*' ? S.frames[0] : S.frames.find(fr => fr.id === l.page)
  const g = f?.geo.slots[l.key]
  if (!g) return null
  const [left, top, width, height] = g.box
  return { f, box: { left, top, width, height, right: left + width }, last: g.last }
}

// Where an agent's cursor should be, in world coordinates.
function agentTarget(a, now) {
  const l = a.layer && S.layers.get(a.layer)
  if (!l) return null
  const s = slotFor(l)
  if (!s) return null
  const box = s.box
  if (!l.text.trim() || l.status === 'assigned') {
    // dragging out the frame for its layer: top-left to bottom-right
    const p = Math.min(1, (now - a.assignedAt) / 650)
    const e = 1 - Math.pow(1 - p, 3)
    return { x: s.f.x + box.left + 30 + e * (box.width - 60), y: box.top + 30 + e * (Math.max(box.height, l.height) - 60) }
  }
  if (!s.last) return { x: s.f.x + box.left + 40, y: box.top + 40 }
  return { x: s.f.x + s.last[0], y: s.last[1] - 6 }
}

// Idle agents wait on a bench left of the first page instead of floating around.
function benchSpot(a) {
  if (a.layer || now() < a.toolUntil || !S.frames.length) return null
  const i = [...S.agents.keys()].indexOf(a.id)
  return { x: -520 + (i % 2) * 260, y: 120 + Math.floor(i / 2) * 150 }
}
const now = () => performance.now()

const toScreen = (x, y) => ({ x: x * cam.s + cam.x, y: y * cam.s + cam.y })

// ---------- wires: one per (page -> page) link, drawn once the linking layer is done

function linkWires(f) {
  for (const g of f.geo.gotos) {
    const l = S.layers.get(g.key)
    if (!l || l.status !== 'done') continue
    if (l.page === '*' && f !== S.frames[0]) continue // shared nav: wire it from the home page only
    if (g.target === f.id || !S.frames.some(fr => fr.id === g.target)) continue
    const k = `${f.id}->${g.target}`
    if (S.wires.has(k)) continue
    const a = l.agent && S.agents.get(l.agent)
    const color = a?.color || '#7c9cff'
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('pathLength', '1')
    path.setAttribute('stroke', color)
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot.setAttribute('r', '4')
    dot.setAttribute('fill', color)
    els.wires.append(path, dot)
    path.classList.add('fresh')
    dot.classList.add('fresh')
    setTimeout(() => { path.classList.remove('fresh'); dot.classList.remove('fresh') }, 2600)
    S.wires.set(k, { f, key: g.key, target: g.target, path, dot })
  }
}

function drawWires() {
  for (const w of S.wires.values()) {
    const t = S.frames.find(f => f.id === w.target)
    const g = w.f.geo.gotos.find(x => x.key === w.key && x.target === w.target) || w.f.geo.gotos.find(x => x.target === w.target)
    if (!t || !g) continue
    const [left, top, width, height] = g.box
    const a = toScreen(w.f.x + left + width, top + height / 2)
    const b = toScreen(t.x, 40)
    const dx = Math.max(80, Math.abs(b.x - a.x) * 0.45)
    const back = b.x < a.x
    w.path.setAttribute('d', `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y - (back ? 120 : 0)} ${b.x},${b.y}`)
    w.dot.setAttribute('cx', b.x)
    w.dot.setAttribute('cy', b.y)
  }
}

// ---------- camera

function bboxActive() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = (ax, ay, bx, by) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by) }
  for (const a of S.agents.values()) {
    if (!a.layer) continue
    const s = slotFor(S.layers.get(a.layer))
    if (!s) continue
    const b = s.box
    add(s.f.x + b.left, b.top, s.f.x + b.right, b.top + Math.max(b.height, 300))
  }
  if (x0 === Infinity) for (const f of S.frames) add(f.x, -120, f.x + FRAME_W, f.h)
  if (x0 === Infinity) return null
  return { x0, y0: y0 - 160, x1, y1: y1 + 80 }
}

function fit(b, maxScale = 0.5) {
  const vw = els.viewport.clientWidth, vh = els.viewport.clientHeight - 90
  let w = Math.max(b.x1 - b.x0, 1500), h = Math.max(b.y1 - b.y0, 900)
  const s = Math.max(0.06, Math.min(maxScale, Math.min(vw / (w * 1.08), vh / (h * 1.08))))
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
  cam.ts = s
  cam.tx = vw / 2 - cx * s
  cam.ty = (vh / 2 + 10) - cy * s
}

function focusPage(id) {
  const f = S.frames.find(fr => fr.id === id)
  if (!f) return
  setAuto(false)
  fit({ x0: f.x - 80, y0: -140, x1: f.x + FRAME_W + 80, y1: 900 }, 0.7)
  for (const fr of S.frames) fr.el.classList.toggle('focus', fr === f)
  setTimeout(() => f.el.classList.remove('focus'), 1400)
}

function setAuto(v) {
  cam.auto = v
  els.camHint.textContent = v ? 'camera: auto (follows agents)' : 'camera: manual · double-click for auto'
  els.camHint.classList.toggle('auto', v)
  cam.nextFit = 0
}

// ---------- panels

function renderTheme() {
  const t = S.theme
  els.theme.innerHTML = `<div class="name"></div><div class="dir"></div>`
  els.theme.querySelector('.name').textContent = `${t.name || 'Theme'} · ${t.fonts?.heading || ''} / ${t.fonts?.body || ''}`
  els.theme.querySelector('.dir').textContent = t.direction || ''
  for (const [k, v] of Object.entries(t.vars || {})) {
    const sw = document.createElement('div')
    sw.className = 'sw'
    sw.title = `${k} ${v}`
    sw.style.background = v
    els.theme.append(sw)
  }
}

function renderTree() {
  const groups = [{ id: '*', title: 'Shared (every page)' }, ...S.frames.map(f => ({ id: f.id, title: f.title }))]
  els.tree.innerHTML = ''
  for (const g of groups) {
    const layers = S.order.map(k => S.layers.get(k)).filter(l => l.page === g.id)
    if (!layers.length && g.id === '*') continue
    const div = document.createElement('div')
    div.className = 'pg'
    const title = document.createElement('div')
    title.className = 'pg-title'
    title.textContent = g.title
    if (g.id !== '*') title.onclick = () => focusPage(g.id)
    div.append(title)
    for (const l of layers) {
      const a = l.agent && S.agents.get(l.agent)
      const row = document.createElement('div')
      row.className = `ly ${l.status}`
      row.innerHTML = `<span class="dot"></span><span></span><span class="who"></span>`
      row.children[1].textContent = l.role
      if (a) {
        row.children[2].textContent = l.status === 'done' ? `${a.name} ${(l.ms / 1000).toFixed(1)}s` : a.name
        if (l.status !== 'done' && l.status !== 'failed') row.firstChild.style.background = a.color
        row.children[2].style.color = a.color
      }
      div.append(row)
    }
    els.tree.append(div)
  }
}

function renderAgents() {
  els.agents.innerHTML = ''
  let working = 0
  for (const a of S.agents.values()) {
    const l = a.layer && S.layers.get(a.layer)
    if (l) working++
    const row = document.createElement('div')
    row.className = `agent${l ? '' : ' idle'}`
    row.innerHTML = `<span class="dot" style="background:${a.color}"></span><div style="min-width:0"><div class="nm"></div><div class="task"></div></div>${TOOL[a.tool].svg}`
    row.querySelector('.nm').textContent = a.name
    row.querySelector('.task').textContent = l ? `${l.page === '*' ? 'shared' : l.page} · ${l.role}` : a.idle ? 'idle' : 'waiting'
    els.agents.append(row)
  }
  els.agentCount.textContent = `${working}/${S.agents.size} working`
  return working
}

function renderToolbar() {
  const by = Object.fromEntries(TOOLS.map(t => [t.id, []]))
  for (const a of S.agents.values()) if (a.layer || performance.now() < a.toolUntil) by[a.tool].push(a)
  els.toolbar.innerHTML = TOOLS.map(t => {
    const list = by[t.id]
    return `<div class="tool${list.length ? ' active' : ''}" title="${t.label}">${t.svg}${list.length ? `<span class="n">${list.length}</span>` : ''}<div class="who">${list.map(a => `<i style="background:${a.color}"></i>`).join('')}</div><span class="lbl">${t.label}</span></div>`
  }).join('')
}

function feed(a, text, kind = '', where = '') {
  const item = document.createElement('div')
  item.className = `item ${kind}`
  if (a) {
    const b = document.createElement('b')
    b.style.color = a.color
    b.textContent = `${a.name} `
    item.append(b)
  }
  item.append(document.createTextNode(text))
  if (where) {
    const w = document.createElement('span')
    w.className = 'where'
    w.textContent = where
    item.append(w)
  }
  els.feed.prepend(item)
  while (els.feed.children.length > 80) els.feed.lastChild.remove()
}

// ---------- loop

let lastPanels = 0
function frameLoop(now) {
  syncSlots(now)

  if (cam.auto && now > cam.nextFit) {
    const b = bboxActive()
    if (b) fit(b)
    cam.nextFit = now + 700
  }
  const k = cam.auto ? 0.06 : 0.25
  cam.s += (cam.ts - cam.s) * k
  cam.x += (cam.tx - cam.x) * k
  cam.y += (cam.ty - cam.y) * k
  els.world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`
  const g = 60 * cam.s
  els.viewport.style.backgroundSize = `${g}px ${g}px`
  els.viewport.style.backgroundPosition = `${cam.x}px ${cam.y}px`

  for (const a of S.agents.values()) {
    const t = agentTarget(a, now) || benchSpot(a)
    if (t) {
      a.wx += (t.x - a.wx) * 0.22
      a.wy += (t.y - a.wy) * 0.22
    }
    const p = toScreen(a.wx, a.wy)
    a.el.style.transform = `translate(${p.x}px, ${p.y}px)`
    a.el.classList.toggle('idle', !a.layer && now > a.toolUntil)
    a.el.classList.toggle('talking', now < a.sayUntil)
  }
  drawWires()

  if (now - lastPanels > 150) {
    lastPanels = now
    const working = renderAgents()
    renderToolbar()
    if (S.treeDirty) { S.treeDirty = false; renderTree() }
    if (S.planDirty) {
      S.planDirty = false
      els.plan.textContent = [...S.plans].map(([k, v]) => (k === 'sitemap' ? v.slice(-1200) : `\n# ${k}\n${v.slice(-700)}`)).join('\n')
      els.plan.scrollTop = els.plan.scrollHeight
    }
    const done = [...S.layers.values()].filter(l => l.status === 'done').length
    els.status.textContent = `${working} agents working · ${done}/${S.layers.size} layers · ${S.frames.length} pages`
    if (S.t0) els.timer.textContent = `${(((S.tEnd || Date.now()) - S.t0) / 1000).toFixed(1)}s`
  }
  requestAnimationFrame(frameLoop)
}

// ---------- input

let drag = null
els.viewport.addEventListener('mousedown', e => {
  if (e.target.closest('.toolbar, .camera-hint')) return
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }
  els.viewport.classList.add('dragging')
})
window.addEventListener('mousemove', e => {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
  if (!drag.moved) return
  setAuto(false)
  cam.x = cam.tx = drag.cx + dx
  cam.y = cam.ty = drag.cy + dy
})
window.addEventListener('mouseup', e => {
  if (!drag) return
  const wasClick = !drag.moved
  drag = null
  els.viewport.classList.remove('dragging')
  if (wasClick) prototypeClick(e)
})

// Prototype mode: clicking a linked button on any page flies to its target page.
function prototypeClick(e) {
  const vr = els.viewport.getBoundingClientRect()
  const wx = (e.clientX - vr.left - cam.x) / cam.s, wy = (e.clientY - vr.top - cam.y) / cam.s
  const f = S.frames.find(fr => wx >= fr.x && wx <= fr.x + FRAME_W && wy >= 0 && wy <= fr.h)
  if (!f) return
  const x = wx - f.x
  const hit = f.geo.gotos.find(({ box: [l, t, w, h] }) => x >= l && x <= l + w && wy >= t && wy <= t + h)
  if (hit) focusPage(hit.target)
}

els.viewport.addEventListener('dblclick', () => setAuto(true))
els.camHint.addEventListener('click', () => setAuto(!cam.auto))
els.viewport.addEventListener('wheel', e => {
  e.preventDefault()
  setAuto(false)
  const vr = els.viewport.getBoundingClientRect()
  if (e.ctrlKey || e.metaKey) {
    const mx = e.clientX - vr.left, my = e.clientY - vr.top
    const ns = Math.max(0.04, Math.min(1.5, cam.s * Math.exp(-e.deltaY * 0.01)))
    cam.x = cam.tx = mx - ((mx - cam.x) / cam.s) * ns
    cam.y = cam.ty = my - ((my - cam.y) / cam.s) * ns
    cam.s = cam.ts = ns
  } else {
    cam.x = cam.tx = cam.x - e.deltaX
    cam.y = cam.ty = cam.y - e.deltaY
  }
}, { passive: false })
window.addEventListener('keydown', e => {
  if (e.target.closest('input, select')) return
  if (e.key === 'a') setAuto(true)
  if (e.key === '0') { setAuto(false); const b = bboxActive(); S.frames.length && fit({ x0: S.frames[0].x - 560, y0: -140, x1: S.frames.at(-1).x + FRAME_W, y1: Math.max(...S.frames.map(f => f.h)) }) }
})

els.form.addEventListener('submit', async e => {
  e.preventDefault()
  const brief = els.brief.value.trim()
  if (!brief) return
  setAuto(true)
  await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': BOOT.token || '' }, body: JSON.stringify({ brief, agents: Number(els.agentsSel.value) }) })
})

// ---------- start

fresh()
setAuto(true)
renderToolbar()
const es = new EventSource(`/events?k=${encodeURIComponent(BOOT.token || '')}`)
es.onmessage = m => {
  try { on(JSON.parse(m.data)) } catch (err) { console.error(err) }
}
requestAnimationFrame(frameLoop)
