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
  form: $('#brief-form'), brief: $('#brief'), agentsSel: $('#agents'), dock: $('#dock'), files: $('#files'),
  newFile: $('#new-file'), fileName: $('#file-name'), log: $('#log'), play: $('#play-btn'), player: $('#player'), plFrame: $('#pl-frame'),
  plShell: $('#pl-shell'), plStage: $('#pl-stage'), plPage: $('#pl-page'), plBack: $('#pl-back'),
  plTours: $('#pl-tours'), plTourMenu: $('#pl-tour-menu'), plPersona: $('#pl-persona'), plCursor: $('#pl-cursor'), plThink: $('#pl-think')
}
const api = (path, opts = {}) => fetch(path, { ...opts, headers: { ...opts.headers, 'x-swarm-token': BOOT.token || '' } })
// Per-viewer UI memory. Storage throws inside the Desktop pane's opaque origin, so it is optional.
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`swarm.${k}`)) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch {} }
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
  S = { run, title: '', t0: 0, tEnd: 0, agents: new Map(), frames: [], layers: new Map(), order: [], wires: new Map(), plans: new Map(), planDirty: true, treeDirty: true, done: 0, planned: 0, theme: null, closed: new Set(), cheerUntil: 0 }
  banter.queue = []
  els.world.innerHTML = ''
  els.cursors.innerHTML = ''
  els.wires.innerHTML = ''
  els.feed.innerHTML = '<div class="empty-chat">Describe a product below. A planner picks the pages, then a swarm of agents builds them on the canvas.</div>'
  els.log.innerHTML = ''
  S.progress = null
  els.theme.innerHTML = ''
  els.plan.textContent = ''
  els.timer.textContent = '00.0s'
  els.planState.textContent = run ? 'planning' : 'idle'
  els.dock.hidden = true
  setTitle('')
}

function setTitle(t) {
  S.title = t
  els.fileName.textContent = t || 'Untitled'
  document.title = t ? `${t} · Swarm Studio` : 'Swarm Studio'
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
      if (!viewing) els.agentsSel.value = String(e.agents.length)
      for (const a of e.agents) addAgent(a)
      setTitle(e.brief.slice(0, 60))
      feed(null, e.brief, 'you')
      S.progress = botMsg('Planning the pages…', true)
      if (!viewing) loadFiles()
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
      S.planText = `Planned ${e.pages} pages and ${e.layers} sections in ${(e.ms / 1000).toFixed(1)}s.`
      break
    case 'theme':
      S.theme = e
      renderTheme()
      S.frames.forEach(applyTheme)
      break
    case 'page':
      addFrame(e)
      if (e.index === 0) setTitle(e.title)
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
      // replays (a reopened file, a late join) go to the feed without a burst of bubbles
      if (Date.now() - e.t < 5000) say(a, e.text)
      setTool(a, 'comment', 450)
      feed(a, e.text, '', e.layer)
      break
    }
    case 'layer:done': {
      const l = S.layers.get(key(e.page, e.layer))
      if (!l) break
      l.status = 'done'
      l.ms = e.ms
      // saved runs carry the finished HTML, so a file can be reopened without the stream
      if (e.html) { l.text = e.html; l.ver++ }
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
      summarize(e)
      els.planState.textContent = 'done'
      if (!viewing) { S.cheerUntil = performance.now() + 9000; banter.next = 0; loadFiles() }
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
  const seat = S.agents.size
  const c = dockCell(seat)
  const agent = {
    ...a, el, tagIcon: el.querySelector('.tag svg'), bubble: el.querySelector('.bubble'),
    layer: null, idle: true, tool: 'move', toolUntil: 0, sayUntil: 0, assignedAt: 0,
    seat, docked: true, sx: c.x + (Math.random() - 0.5) * 80, sy: c.y - 40 - Math.random() * 60, wx: 0, wy: 0
  }
  S.agents.set(a.id, agent)
  const rows = Math.ceil(S.agents.size / DOCK.cols)
  els.dock.style.height = `${DOCK.top + rows * DOCK.ch + 22}px`
  els.dock.hidden = false
}

function say(a, text, ms = 2800) {
  a.bubble.innerHTML = `<span></span>`
  a.bubble.firstChild.textContent = text
  a.sayUntil = performance.now() + ms
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
  el.querySelector('.frame-label').textContent = `Page ${p.index + 1} · ${p.title}`
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
  if (e.source && e.source === els.plFrame.contentWindow) return playerMessage(e.data || {})
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

// ---------- the break room
// Idle cursors leave the canvas for a dock in screen space, each in its own seat,
// and pass the time with canned banter. None of this goes to the chat feed.

const DOCK = { cols: 4, cw: 58, ch: 26, top: 32, left: 14 }
const dockCell = i => ({
  x: els.dock.offsetLeft + DOCK.left + (i % DOCK.cols) * DOCK.cw,
  y: els.dock.offsetTop + DOCK.top + Math.floor(i / DOCK.cols) * DOCK.ch
})

const QUIPS = [
  '☕ third coffee. still not a designer.', 'who keeps putting Comic Sans in the drafts', 'I could have done that hero in 4 tokens',
  '😴', 'is it lunch? it feels like lunch', 'pixel-perfect. emotionally, not literally', '🫠 the padding haunts me',
  'rate my last section 1–10. wrong, it\'s 11', 'did someone say "make the logo bigger"?', 'my gradients have gradients',
  '🤖 beep. boop. kerning.', 'if you need me I\'ll be in the margins', '😤 someone renamed my div "div2"',
  'manifesting a client who says "ship it"', '🧘 centering a div. spiritually.', 'I\'m not idle, I\'m load-balancing'
]
const FIGHTS = [
  [[0, '{b}, your footer is 40% links'], [1, 'and 100% load-bearing']],
  [[0, 'who put the CTA below the fold'], [1, 'it\'s called suspense, {a}']],
  [[0, 'dibs on the next hero section'], [1, 'you can\'t dibs a queue, {a}'], [0, 'watch me']],
  [[0, '{b}, I saw you use #000000'], [1, 'it\'s "near black"'], [0, 'it\'s literally black']],
  [[0, 'rock paper scissors for the pricing page?'], [1, '✊'], [0, '✋ ha'], [1, 'best of three 😠']],
  [[0, 'nice gradient, {b}'], [1, 'thanks, it\'s sarcasm-proof'], [0, 'it isn\'t']],
  [[0, '{b} stop stealing my padding'], [1, 'it was 1rem, it\'s anyone\'s']],
  [[0, 'the planner gave me SIX testimonials'], [1, 'cry me a footer, {a}']],
  [[0, '⚔️ tabs vs spaces, {b}. now.'], [1, 'Tailwind. there are no spaces.'], [0, '...fair']],
  [[0, 'who tells the planner the brief said "minimal"'], [1, 'not it'], [0, 'not it'], [1, '😶']]
]
const CHEERS = ['🎉 shipped!', 'ship it ship it ship it', '🥳 all green', 'that\'s a wrap, folks', '📸 screenshot it before anyone changes it']
const HIGH_FIVES = [[[0, 'high five, {b}'], [1, '✋ (missed)'], [0, 'we don\'t talk about that']]]

const banter = { next: 0, queue: [] }
const pick = list => list[Math.floor(Math.random() * list.length)]

function runBanter(now) {
  for (const b of banter.queue) {
    if (b.at > now || b.said) continue
    b.said = true
    if (!b.agent.docked) continue
    for (const a of S.agents.values()) if (a.docked) a.sayUntil = 0
    say(b.agent, b.text, 1500 + b.text.length * 35)
  }
  banter.queue = banter.queue.filter(b => !b.said)
  if (banter.queue.length || now < banter.next) return
  const cheering = now < S.cheerUntil
  banter.next = now + (cheering ? 900 : 2500) + Math.random() * 2500
  const idle = [...S.agents.values()].filter(a => a.docked && now > a.sayUntil)
  if (!idle.length) return
  const a = pick(idle), b = pick(idle.filter(x => x !== a))
  const script = b && Math.random() < (cheering ? 0.25 : 0.45) ? pick(cheering ? HIGH_FIVES : FIGHTS) : [[0, pick(cheering ? CHEERS : QUIPS)]]
  const who = [a, b || a]
  script.forEach(([i, text], n) => banter.queue.push({
    at: now + n * 1700, agent: who[i], text: text.replace('{a}', a.name).replace('{b}', (b || a).name)
  }))
}

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
  const groups = [{ id: '*', num: 'All', title: 'Shared nav and footer' }, ...S.frames.map(f => ({ id: f.id, num: `Page ${f.index + 1}`, title: f.title }))]
  els.tree.innerHTML = S.frames.length ? '' : '<div class="empty">Pages appear here once the planner names them.</div>'
  for (const g of groups) {
    const layers = S.order.map(k => S.layers.get(k)).filter(l => l.page === g.id)
    if (!layers.length && g.id === '*') continue
    const div = document.createElement('div')
    div.className = `pg${S.closed.has(g.id) ? '' : ' open'}`
    const title = document.createElement('div')
    title.className = 'pg-title'
    title.innerHTML = `<span class="num"></span><span class="ttl"></span><span class="caret">▶</span>`
    title.children[0].textContent = g.num
    title.children[1].textContent = g.title
    title.onclick = e => {
      if (e.target.classList.contains('caret') || g.id === '*') S.closed.has(g.id) ? S.closed.delete(g.id) : S.closed.add(g.id)
      else { S.closed.delete(g.id); focusPage(g.id) }
      renderTree()
    }
    div.append(title)
    const lys = document.createElement('div')
    lys.className = 'lys'
    div.append(lys)
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
      lys.append(row)
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
  els.agentCount.textContent = S.agents.size ? `${working}/${S.agents.size}` : '0'
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

// The Chat tab is the conversation: your briefs and the swarm's progress and
// summaries. Everything the agents and the planner say goes to the Log tab.
function feed(a, text, kind = '', where = '') {
  const box = a || kind === 'sys' ? els.log : els.feed
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
  push(box, item)
}

function push(f, item) {
  f.querySelector('.empty-chat')?.remove()
  const stick = f.scrollHeight - f.scrollTop - f.clientHeight < 60
  f.append(item)
  while (f.children.length > 200) f.firstChild.remove()
  if (stick) f.scrollTop = f.scrollHeight
}

function botMsg(text, working = false) {
  const item = document.createElement('div')
  item.className = `item bot${working ? ' working' : ''}`
  item.innerHTML = '<b>SWARM</b><span class="txt"></span>'
  item.querySelector('.txt').textContent = text
  push(els.feed, item)
  return item
}

function summarize(e) {
  S.progress?.remove()
  S.progress = null
  const secs = (e.ms / 1000).toFixed(1)
  const item = botMsg(`Built ${e.pages} pages and ${e.done} sections in ${secs}s with ${S.agents.size} agents${e.failed ? ` (${e.failed} failed)` : ''}. Open a page, or play the prototype.`)
  const chips = document.createElement('div')
  chips.className = 'chips'
  const play = document.createElement('button')
  play.className = 'primary'
  play.textContent = '▶ Play prototype'
  play.onclick = () => openPlayer()
  const watch = document.createElement('button')
  watch.textContent = '👀 Watch a visitor'
  watch.onclick = e => { e.stopPropagation(); openPlayer(); toggleTourMenu(true) }
  chips.append(play, watch)
  for (const f of S.frames) {
    const b = document.createElement('button')
    b.textContent = `Page ${f.index + 1} · ${f.title}`
    b.onclick = () => focusPage(f.id)
    chips.append(b)
  }
  item.append(chips)
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
    // Switching between screen space (dock) and world space (canvas) converts the
    // current position, so a cursor glides out of the break room instead of jumping.
    if (!a.layer && now > a.toolUntil) {
      if (!a.docked) { const p = toScreen(a.wx, a.wy); a.sx = p.x; a.sy = p.y; a.docked = true }
      const c = dockCell(a.seat)
      a.sx += (c.x - a.sx) * 0.12
      a.sy += (c.y - a.sy) * 0.12
    } else {
      if (a.docked) { a.wx = (a.sx - cam.x) / cam.s; a.wy = (a.sy - cam.y) / cam.s; a.docked = false }
      const t = agentTarget(a, now)
      if (t) {
        a.wx += (t.x - a.wx) * 0.22
        a.wy += (t.y - a.wy) * 0.22
      }
      const p = toScreen(a.wx, a.wy)
      a.sx = p.x
      a.sy = p.y
    }
    a.el.style.transform = `translate(${a.sx}px, ${a.sy}px)`
    a.el.classList.toggle('docked', a.docked)
    a.el.classList.toggle('flip', a.docked && a.seat % DOCK.cols >= 2)
    a.el.classList.toggle('talking', now < a.sayUntil)
  }
  runBanter(now)
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
    els.play.disabled = !S.frames.length
    if (S.progress) {
      const done = [...S.layers.values()].filter(l => l.status === 'done').length
      S.progress.querySelector('.txt').textContent = S.layers.size
        ? `${S.planText ? `${S.planText} ` : ''}${working} agents building · ${done}/${S.layers.size} sections across ${S.frames.length} pages`
        : 'Planning the pages…'
    }
    if (S.t0 && !(viewing && !S.tEnd)) els.timer.textContent = `${(((S.tEnd || Date.now()) - S.t0) / 1000).toFixed(1)}s`
  }
  requestAnimationFrame(frameLoop)
}

// ---------- input

let drag = null
els.viewport.addEventListener('mousedown', e => {
  if (e.target.closest('.toolbar, .camera-hint, .float')) return
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
  if (e.target.closest('.float')) return
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
  if (e.key === 'Escape' && !els.player.hidden) return tour.on ? stopTour() : closePlayer()
  if (e.key === 'v' && !els.player.hidden) return toggleTourMenu()
  if (e.target.closest('input, select, textarea')) return
  if (e.key === 'p' && S.frames.length) return els.player.hidden ? openPlayer() : closePlayer()
  if (!els.player.hidden) return
  if (e.key === 'a') setAuto(true)
  if (e.key === '0') { setAuto(false); const b = bboxActive(); S.frames.length && fit({ x0: S.frames[0].x - 560, y0: -140, x1: S.frames.at(-1).x + FRAME_W, y1: Math.max(...S.frames.map(f => f.h)) }) }
})

els.form.addEventListener('submit', async e => {
  e.preventDefault()
  const brief = els.brief.value.trim()
  if (!brief) return
  setAuto(true)
  const res = await api('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief, agents: Number(els.agentsSel.value) }) }).catch(() => null)
  if (res?.ok) els.brief.value = ''
  else feed(null, `Couldn't start the run${res ? ` (${res.status})` : ''}. Is the canvas server running?`, 'err')
})
els.brief.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); els.form.requestSubmit() }
})

// ---------- Play mode
// Each page becomes one real document (theme, shared nav and footer, its own
// sections) in a sandboxed frame at true size, so Tailwind's breakpoints apply:
// the Mobile view is the site at 390px, not a scaled-down desktop. Links built
// with data-goto move between pages; nothing else navigates.

const DEVICES = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 844 } }
const player = { page: null, device: store.get('device', 'desktop'), history: [] }

const PLAYER_SCRIPT = `<script>
addEventListener('click', e => {
  const g = e.target.closest('[data-goto]')
  e.preventDefault()
  if (g) return parent.postMessage({ type: 'goto', target: g.dataset.goto }, '*')
  document.body.classList.add('hint')
  setTimeout(() => document.body.classList.remove('hint'), 700)
}, true)
addEventListener('submit', e => e.preventDefault(), true)
// Tour agent: the canvas can't reach into this frame, so a visitor tour asks it
// to find, scroll to, hover, press and type into elements by their data-tour id.
const wait = ms => new Promise(r => setTimeout(r, ms))
const shown = el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' }
const find = id => {
  const el = document.querySelector('[data-tour="' + id + '"]')
  if (!el || shown(el)) return el
  // a nav link folded away on a phone: another visible link to the same page will do
  const to = el.closest('[data-goto]')?.dataset.goto
  return (to && [...document.querySelectorAll('[data-goto="' + to + '"]')].find(shown)) || null
}
addEventListener('message', async e => {
  const m = e.data || {}
  if (e.source !== parent || m.type !== 'tour') return
  const el = m.el ? find(m.el) : null
  const done = x => parent.postMessage({ type: 'tour:ok', seq: m.seq, ...x }, '*')
  document.querySelectorAll('.tour-hover').forEach(x => x !== el && x.classList.remove('tour-hover'))
  if (m.op === 'locate') {
    if (!el) return done({ box: null })
    const before = scrollY
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    await wait(Math.abs(el.getBoundingClientRect().top - innerHeight / 2) > 40 || scrollY !== before ? 750 : 60)
    const r = el.getBoundingClientRect()
    return done({ box: [r.left, r.top, r.width, r.height] })
  }
  if (m.op === 'hover') el?.classList.add('tour-hover')
  if (m.op === 'press' && el) { el.classList.add('tour-press'); await wait(180); el.classList.remove('tour-press', 'tour-hover') }
  if (m.op === 'type' && el) {
    el.focus()
    const kind = el.tagName === 'SELECT' ? 'select' : el.type
    const set = { date: () => new Date().toISOString().slice(0, 10), time: () => '23:15', 'datetime-local': () => new Date().toISOString().slice(0, 11) + '23:15',
      number: () => (m.text || '').replace(/\D/g, '') || '2', select: () => ([...el.options].find(o => o.text.toLowerCase().includes((m.text || '').toLowerCase())) || el.options[1] || el.options[0])?.value,
      checkbox: () => (el.checked = true, el.value), radio: () => (el.checked = true, el.value) }[kind]
    if (set) { await wait(300); el.value = set() }
    else {
      el.value = ''
      for (const ch of m.text || '') { el.value += ch; await wait(45 + Math.random() * 70) }
    }
  }
  done({})
})
<\/script>`

// Each element a visitor could use or read gets a data-tour id, the same one in
// the inventory the tour writer sees and in the document the player shows.
const TOURABLE = 'a, button, [data-goto], input, textarea, select, h1, h2, h3'
function pageParts(id, html) {
  const cached = S.parts?.get(id)
  if (cached && cached.source === html) return cached
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const items = []
  let n = 0
  for (const el of doc.body.querySelectorAll(TOURABLE)) {
    const tag = el.tagName.toLowerCase()
    const input = tag === 'input' || tag === 'textarea' || tag === 'select'
    const text = (input ? el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name') || el.type : el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!text || (el.closest('[data-goto]') && el.closest('[data-goto]') !== el && !input)) continue
    const tid = `e${++n}`
    el.setAttribute('data-tour', tid)
    const goto = el.closest('[data-goto]')?.dataset.goto
    if (items.length < 60) items.push({ id: tid, kind: input ? 'input' : /^h\d$/.test(tag) ? 'heading' : goto || tag === 'a' ? 'link' : 'button', text, ...(goto ? { goto } : {}) })
  }
  const parts = { source: html, html: doc.body.innerHTML, items }
  ;(S.parts ||= new Map()).set(id, parts)
  return parts
}

function pageDoc(id) {
  const t = S.theme || {}
  const heading = t.fonts?.heading || 'Georgia', body = t.fonts?.body || 'Inter'
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`
  const vars = Object.entries(t.vars || {}).map(([k, v]) => `${k}:${v};`).join('')
  const html = pageParts(id, pageBody(id)).html
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com/3.4.17"><\/script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam(heading)}&${fam(body)}&display=swap">
<style>:root{--radius:${t.radius || '12px'};--font-heading:'${heading}',Georgia,serif;--font-body:'${body}',system-ui,sans-serif;${vars}}
html,body{margin:0;background:var(--background,#fff);color:var(--foreground,#111);font-family:var(--font-body)}
[data-goto]{cursor:pointer}
body.hint [data-goto]{outline:3px solid #7c9cffcc;outline-offset:2px}
.tour-hover{outline:2px solid #7c9cffaa;outline-offset:3px;filter:brightness(1.06)}
.tour-press{transform:scale(.96);transition:transform .1s}</style>
${PLAYER_SCRIPT}</head><body>${html}</body></html>`
}

function fitDevice() {
  const d = DEVICES[player.device]
  const sw = els.plStage.clientWidth - 40, sh = els.plStage.clientHeight - 56
  const mobile = player.device === 'mobile'
  const border = mobile ? 24 : 0
  const scale = Math.min(1, sw / (d.w + border), mobile ? sh / (d.h + border) : 1)
  els.plShell.classList.toggle('mobile', mobile)
  els.plShell.style.width = `${d.w + border}px`
  els.plShell.style.height = `${(mobile ? d.h : sh / scale) + border}px`
  // zoom, not a transform: clicks inside a transformed frame can miss their target
  els.plShell.style.zoom = scale
  player.scale = scale
  els.plShell.style.left = `${(els.plStage.clientWidth / scale - d.w - border) / 2}px`
  els.plShell.style.top = `${20 / scale}px`
}

function showPage(id, push = true) {
  if (!S.frames.some(f => f.id === id)) return
  if (push && player.page && player.page !== id) player.history.push(player.page)
  player.page = id
  els.plPage.value = id
  els.plBack.disabled = !player.history.length
  els.plFrame.style.opacity = 0
  player.loaded = new Promise(resolve => setTimeout(() => {
    els.plFrame.srcdoc = pageDoc(id)
    els.plFrame.onload = () => { els.plFrame.style.opacity = 1; resolve() }
  }, 120))
}

function playerMessage(m) {
  if (m.type === 'goto' && !tour.on) showPage(m.target)
  if (m.type === 'tour:ok') tour.waiting.get(m.seq)?.(m)
}

function openPlayer(page) {
  if (!S.frames.length) return
  els.plPage.innerHTML = ''
  for (const f of S.frames) els.plPage.add(new Option(`Page ${f.index + 1} · ${f.title}`, f.id))
  player.history = []
  els.player.hidden = false
  setDevice(player.device, false)
  showPage(page || S.frames[0].id, false)
  if (S.tEnd) loadTours()
}

function closePlayer() {
  stopTour()
  toggleTourMenu(false)
  els.player.hidden = true
  els.plFrame.srcdoc = ''
}

function setDevice(name, reload = true) {
  if (reload) stopTour()
  player.device = name
  store.set('device', name)
  for (const b of document.querySelectorAll('#pl-device button')) b.classList.toggle('on', b.dataset.device === name)
  fitDevice()
  if (reload && player.page) showPage(player.page, false)
}

// ---------- Visitor tours
// One model call (on the server) writes 3-4 people who use the finished site;
// each step names an element on the page they're on, plus 2-3 ways of thinking
// the same thought. Played back, a cursor glides to each element, the page
// scrolls it into view, and the thought bubble cycles through the phrasings
// while they decide, so it reads like someone muttering while they browse.

const tour = { list: null, loading: null, error: '', on: false, id: 0, seq: 0, waiting: new Map(), x: 0, y: 0 }

function loadTours(fresh = false) {
  if (tour.run !== S.run) Object.assign(tour, { run: S.run, list: null, error: '' })
  if (!S.run || (tour.list && !fresh) || tour.loading) return tour.loading
  const run = S.run
  const pages = S.frames.map(f => ({ id: f.id, title: f.title, items: pageParts(f.id, pageBody(f.id)).items }))
  tour.error = ''
  tour.loading = api(`/api/runs/${encodeURIComponent(run)}/tours`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pages, fresh }) })
    .then(async res => {
      const body = await res.json().catch(() => ({}))
      if (S.run !== run) return
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      tour.list = body.tours
    })
    .catch(err => (tour.error = String(err.message || err)))
    .finally(() => { tour.loading = null; renderTourMenu() })
  renderTourMenu()
  return tour.loading
}

function pageBody(id) {
  const layers = S.order.map(k => S.layers.get(k)).filter(l => l.page === id || l.page === '*')
  const shared = name => layers.filter(l => l.page === '*' && l.id === name)
  const mid = layers.filter(l => l.page === id || (l.page === '*' && l.id !== 'nav' && l.id !== 'footer'))
  return [...shared('nav'), ...mid, ...shared('footer')].map(l => `<div data-layer="${l.id}">${clean(l.text)}</div>`).join('\n')
}

function renderTourMenu() {
  const m = els.plTourMenu
  m.innerHTML = ''
  const note = (text, cls = '') => { const d = document.createElement('div'); d.className = `note ${cls}`; d.textContent = text; m.append(d) }
  if (tour.loading) return note('Writing a few visitors for this site', 'working')
  if (tour.error) {
    note(`Couldn't write visitors: ${tour.error}`)
    const b = document.createElement('button'); b.textContent = 'Try again'; b.onclick = () => loadTours(true); m.append(b)
    return
  }
  if (!tour.list) return note(S.tEnd ? 'Open again in a moment' : 'Visitors come once the build is done')
  tour.list.forEach((t, i) => {
    const b = document.createElement('button')
    b.innerHTML = '<span class="em"></span><span><b></b><small></small></span>'
    b.querySelector('.em').textContent = t.emoji
    b.querySelector('b').textContent = `${t.name}${t.who ? `, ${t.who}` : ''}`
    b.querySelector('small').textContent = t.goal
    b.onclick = () => { toggleTourMenu(false); playTour(i) }
    m.append(b)
  })
  const again = document.createElement('button')
  again.innerHTML = '<span class="em">↻</span><span><small>Write new visitors</small></span>'
  again.onclick = () => { tour.list = null; loadTours(true) }
  m.append(again)
}

function toggleTourMenu(open = els.plTourMenu.hidden) {
  els.plTourMenu.hidden = !open
  if (open) { loadTours(); renderTourMenu() }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Ask the page frame to do something; resolves with its reply.
function ask(op, extra = {}) {
  const seq = ++tour.seq
  return new Promise(resolve => {
    const timer = setTimeout(() => { tour.waiting.delete(seq); resolve({ box: null }) }, 3000)
    tour.waiting.set(seq, m => { clearTimeout(timer); tour.waiting.delete(seq); resolve(m) })
    els.plFrame.contentWindow?.postMessage({ type: 'tour', op, seq, ...extra }, '*')
  })
}

// A point inside the frame, in window coordinates (the device is zoomed).
function frameToScreen(x, y) {
  const r = els.plFrame.getBoundingClientRect()
  const k = r.width / els.plFrame.clientWidth || player.scale || 1
  return [r.left + x * k, r.top + y * k]
}

function placeCursor(x, y) {
  tour.x = x
  tour.y = y
  els.plCursor.style.transform = `translate(${x}px, ${y}px)`
  els.plThink.classList.toggle('left', x > innerWidth - 300)
}

// Glide along a slight arc and ease out, the way a hand moves a mouse.
function glide(x, y, live) {
  const x0 = tour.x, y0 = tour.y, d = Math.hypot(x - x0, y - y0)
  if (d < 2) return Promise.resolve()
  const ms = Math.min(1100, 380 + d * 0.9), bend = (Math.random() < 0.5 ? -1 : 1) * Math.min(60, d * 0.12)
  const nx = -(y - y0) / d, ny = (x - x0) / d
  const t0 = performance.now()
  return new Promise(resolve => {
    const step = now => {
      if (!live()) return resolve()
      const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const arc = Math.sin(Math.PI * e) * bend
      placeCursor(x0 + (x - x0) * e + nx * arc, y0 + (y - y0) * e + ny * arc)
      t < 1 ? requestAnimationFrame(step) : resolve()
    }
    requestAnimationFrame(step)
  })
}

// Cycle a step's phrasings of one thought until the step is over.
function think(lines, emoji, live) {
  let i = 0, stop = false
  const show = () => {
    els.plThink.classList.add('swap')
    setTimeout(() => {
      els.plThink.innerHTML = '<span class="em"></span><span></span>'
      els.plThink.firstChild.textContent = emoji
      els.plThink.lastChild.textContent = lines[i % lines.length]
      els.plThink.classList.remove('swap')
    }, 160)
  }
  show()
  const timer = setInterval(() => { if (stop || !live()) return clearInterval(timer); if (lines.length > 1) { i++; show() } }, 1500)
  return { end: () => { stop = true; clearInterval(timer) }, min: lines.length * 1500 }
}

function press() {
  els.plCursor.classList.add('press')
  const ring = document.createElement('div')
  ring.className = 'ring'
  els.plCursor.append(ring)
  setTimeout(() => { els.plCursor.classList.remove('press'); ring.remove() }, 500)
}

function personaBar(t, at, text) {
  const p = els.plPersona
  p.hidden = false
  p.innerHTML = '<span></span><span class="who"><b></b> <small></small></span><span class="dots"></span><button>Stop</button>'
  p.firstChild.textContent = t.emoji
  p.querySelector('b').textContent = t.name
  p.querySelector('small').textContent = text
  p.querySelector('.dots').innerHTML = t.steps.map((_, i) => `<i class="${i < at ? 'on' : ''}"></i>`).join('')
  p.querySelector('button').onclick = stopTour
}

async function playTour(index) {
  const t = tour.list?.[index]
  if (!t) return
  stopTour()
  const id = ++tour.id
  const live = () => tour.on && tour.id === id
  tour.on = true
  player.history = []
  showPage(t.steps[0].page, false)
  await player.loaded
  await sleep(500)
  const st = els.plStage.getBoundingClientRect()
  placeCursor(st.left + st.width / 2, st.bottom - 60)
  els.plCursor.hidden = false
  for (let i = 0; i < t.steps.length && live(); i++) {
    const s = t.steps[i]
    personaBar(t, i + 1, t.goal)
    if (s.page !== player.page) { showPage(s.page); await player.loaded; await sleep(450) }
    const thought = think(s.think.length ? s.think : ['hm…'], t.emoji, live)
    const began = performance.now()
    await sleep(500)
    const { box } = live() ? await ask('locate', { el: s.el }) : {}
    if (!live()) break
    if (box) {
      const [x, y] = frameToScreen(box[0] + Math.min(box[2] * 0.5, 40 + Math.random() * 30), box[1] + box[3] * 0.55)
      await glide(x, y, live)
    } else {
      // folded away (a phone nav, say): look where a menu would be
      const r = els.plFrame.getBoundingClientRect()
      await glide(r.right - 36, r.top + 30, live)
    }
    if (!live()) break
    if (s.do === 'hover' || s.do === 'click') await ask('hover', { el: s.el })
    if (s.do === 'type') { press(); await sleep(250); await ask('type', { el: s.el, text: s.text }) }
    await sleep(Math.max(0, thought.min - (performance.now() - began) - (s.do === 'click' ? 300 : 0)))
    if (s.do === 'click' && live()) {
      press()
      await ask('press', { el: s.el })
      await sleep(350)
    }
    thought.end()
  }
  if (!live()) return
  personaBar(t, t.steps.length, t.end || 'done')
  els.plThink.innerHTML = '<span class="em"></span><span></span>'
  els.plThink.firstChild.textContent = t.emoji
  els.plThink.lastChild.textContent = t.end || 'okay, done'
  await sleep(3200)
  if (!live()) return
  const next = tour.list[(index + 1) % tour.list.length]
  els.plCursor.hidden = true
  const bar = els.plPersona
  bar.querySelector('button').textContent = `Next: ${next.emoji} ${next.name} →`
  bar.querySelector('button').onclick = () => playTour((index + 1) % tour.list.length)
  tour.on = false
}

function stopTour() {
  tour.on = false
  tour.id++
  els.plCursor.hidden = true
  els.plThink.innerHTML = ''
  els.plPersona.hidden = true
}

els.plTours.onclick = e => { e.stopPropagation(); toggleTourMenu() }
document.addEventListener('click', e => { if (!els.plTourMenu.hidden && !e.target.closest('.tour-pick')) toggleTourMenu(false) })

els.play.onclick = () => openPlayer()
$('#pl-close').onclick = closePlayer
els.plBack.onclick = () => player.history.length && showPage(player.history.pop(), false)
$('#pl-restart').onclick = () => { player.history = []; showPage(S.frames[0].id, false) }
els.plPage.onchange = () => showPage(els.plPage.value)
for (const b of document.querySelectorAll('#pl-device button')) b.onclick = () => setDevice(b.dataset.device)
window.addEventListener('resize', () => !els.player.hidden && fitDevice())

// ---------- side tabs and floating panels

function showTab(name) {
  for (const el of document.querySelectorAll('[data-tab]')) el.classList.toggle('on', el.dataset.tab === name)
  store.set('tab', name)
  if (name === 'files') loadFiles()
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => showTab(b.dataset.tab)

const panels = new Set(store.get('panels', []))
function renderPanels() {
  for (const el of document.querySelectorAll('[data-panel]')) el.classList.toggle('on', panels.has(el.dataset.panel))
  $('.float.agents-card').classList.toggle('below', panels.has('planner'))
}
for (const b of document.querySelectorAll('.toggle[data-panel]')) b.onclick = () => {
  const p = b.dataset.panel
  panels.has(p) ? panels.delete(p) : panels.add(p)
  store.set('panels', [...panels])
  renderPanels()
}

// ---------- files: every saved run is a file with its own canvas
// `viewing` is null while following the live stream, or the id of a saved run
// (or 'new' for an empty canvas). The live stream is ignored while viewing one,
// until a new run starts.

let viewing = null
let liveId = null
let files = []

async function loadFiles() {
  try {
    files = await (await api('/api/runs')).json()
  } catch {
    files = []
  }
  renderFiles()
}

function renderFiles() {
  const shown = viewing && viewing !== 'new' ? viewing : S.run
  els.files.innerHTML = files.length ? '' : '<div class="empty">No files yet. Describe a product in Chat to make one.</div>'
  for (const f of files) {
    const item = document.createElement('div')
    item.className = `file${f.id === shown ? ' on' : ''}`
    item.innerHTML = `<div class="ttl"></div><div class="meta"></div>`
    item.firstChild.textContent = f.title
    item.title = f.brief
    const when = new Date(f.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const meta = item.lastChild
    if (f.live) meta.innerHTML = '<span class="live">● building</span> · '
    meta.append(`${when} · ${f.pages} pages · ${f.layers} layers${f.ms ? ` · ${(f.ms / 1000).toFixed(0)}s` : ''}`)
    item.onclick = () => openRun(f.id)
    els.files.append(item)
  }
}

async function openRun(id) {
  if (id === liveId && files.find(f => f.id === id)?.live) {
    viewing = null
    connect()
  } else {
    const res = await api(`/api/runs/${encodeURIComponent(id)}/events`).catch(() => null)
    if (!res?.ok) return
    const events = await res.json()
    viewing = id
    fresh(id)
    for (const e of events) {
      try { on(e) } catch (err) { console.error(err) }
    }
    if (!S.tEnd && events.length) S.tEnd = events.at(-1).t
    if (S.t0) els.timer.textContent = `${((S.tEnd - S.t0) / 1000).toFixed(1)}s`
    if (S.progress) { S.progress.classList.remove('working'); S.progress.querySelector('.txt').textContent = 'This run stopped before it finished.' }
    if (!events.some(e => e.type === 'layer:done' && e.html)) botMsg('This file was saved before Swarm Studio kept finished sections, so only its plan is shown.')
  }
  setAuto(true)
  renderFiles()
}

els.newFile.onclick = () => {
  viewing = 'new'
  fresh()
  renderFiles()
  showTab('chat')
  els.brief.focus()
}

// ---------- start

let es = null
function connect() {
  es?.close()
  fresh()
  es = new EventSource(`/events?k=${encodeURIComponent(BOOT.token || '')}`)
  es.onmessage = m => {
    try {
      const e = JSON.parse(m.data)
      if (e.type === 'reset' || e.type === 'run:start') {
        liveId = e.run
        if (viewing) { viewing = null; fresh(e.run) }
      }
      if (!viewing) on(e)
    } catch (err) {
      console.error(err)
    }
  }
}

fresh()
setAuto(true)
renderToolbar()
renderPanels()
showTab(store.get('tab', 'chat'))
connect()
// Nothing live to replay: open the latest saved file rather than an empty canvas.
setTimeout(async () => {
  if (S.run || viewing) return
  await loadFiles()
  const latest = files.find(f => f.preview)
  if (latest && !S.run && !viewing) openRun(latest.id)
}, 700)
requestAnimationFrame(frameLoop)
