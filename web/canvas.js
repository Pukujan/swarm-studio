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
  plShell: $('#pl-shell'), plStage: $('#pl-stage'), plPage: $('#pl-page'), plBack: $('#pl-back'), plMotion: $('#pl-motion'),
  dDesign: $('#d-design'), dVars: $('#d-vars'), reviewBtn: $('#review-btn'), videoBtn: $('#video-btn'), exportBtn: $('#export-btn'), publishBtn: $('#publish-btn'), modelsBtn: $('#models-btn'),
  plTours: $('#pl-tours'), plTourMenu: $('#pl-tour-menu'), plPersona: $('#pl-persona'), plCursor: $('#pl-cursor'), plThink: $('#pl-think')
}
// what /swarm commands and the swarm_studio tool can ask the open canvas to do; features add themselves
const commandOps = {}
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
  S = { run, title: '', t0: 0, tEnd: 0, agents: new Map(), frames: [], layers: new Map(), order: [], wires: new Map(), plans: new Map(), planDirty: true, treeDirty: true, done: 0, planned: 0, theme: null, closed: new Set(), cheerUntil: 0, edits: new Set(), classEdits: [], sel: null, images: new Map(), imgQueued: 0, imgSettled: 0 }
  banter.queue = []
  els.world.innerHTML = '<div class="ghosts" id="ghosts"></div>'
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
      S.themeAt = live(e) ? performance.now() : 0
      loadThemeFonts(e)
      if (S.themeAt && !design.tabPinned) showDtab('vars')
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
      if (live(e)) {
        a.queued = 'marquee'
        // the design system is set: back to the selection's properties
        if (!design.tabPinned && design.tab === 'vars' && performance.now() - (S.themeAt || 0) > 5000) showDtab('design')
      }
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
      S.lastActive = e.agent
      if (a) {
        setTool(a, detectTool(l.text))
        if (live(e) && !a.act && performance.now() > a.restUntil) a.queued = gestureFor(l.text) || a.queued
        if (live(e)) spark(a, e.text)
      }
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
      // whole-site edits made earlier (bigger headings, more spacing) apply to late sections too;
      // a reviewer's fix was written from the edited section, so it has them already
      if (!e.fixed) for (const ce of S.classEdits) restyle(l, ce)
      fillImages(l)
      if (e.fixed) feed(S.agents.get(e.agent), `fixed ${e.layer}`, 'sys', e.layer)
      if (e.done != null) S.done = e.done
      S.treeDirty = true
      const a = S.agents.get(e.agent)
      if (a) {
        if (live(e) && !a.act) startGesture(a, 'resize', l)
        a.layer = null
        setTool(a, 'move', 400)
      }
      break
    }
    case 'layer:failed': {
      const l = S.layers.get(key(e.page, e.layer))
      if (l) { l.status = 'failed'; S.treeDirty = true }
      // a failed fix puts the section back as it was
      if (l && e.keep) { l.text = e.keep; l.ver++; l.status = 'done' }
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
      if (live(e)) autoReview()
      break
    case 'error':
      feed(null, `${e.where}: ${e.message}`, 'err')
      break
    case 'edit':
      applyEdit(e)
      break
    case 'image:queued': {
      const l = S.layers.get(key(e.page, e.layer))
      const a = l && S.agents.get(l.agent)
      if (a && live(e)) { a.painting = { gen: e.gen, key: `${key(e.page, e.layer)}|${e.gen}`, from: performance.now(), until: performance.now() + 180000 }; say(a, `🖼 asking ${e.provider === 'openai-codex' ? 'Codex' : e.provider} for “${e.gen.slice(0, 40)}…”`) }
      if (!S.imgQueued++) feed(null, `🎨 Painting images with ${e.provider}${e.model ? ` · ${e.model}` : ''}`, 'sys')
      break
    }
    case 'image':
    case 'image:failed': {
      S.imgSettled++
      S.images.set(`${key(e.page, e.layer)}|${e.gen}`, e.type === 'image' ? e.src : '')
      const l = S.layers.get(key(e.page, e.layer))
      if (l) fillImages(l)
      // the agent who asked for it stops painting
      for (const a of S.agents.values()) if (a.painting?.key === `${key(e.page, e.layer)}|${e.gen}`) { a.painting = null; if (live(e) && e.type === 'image') say(a, '🖼 photo’s in') }
      if (e.type === 'image:failed') feed(null, `image for ${e.layer} failed: ${e.message}`, 'err')
      break
    }
    case 'review:start':
      scanFrame(e.page, true)
      feed(null, `🔎 ${e.model} is looking at ${frameTitle(e.page)}`, 'sys')
      break
    case 'review:done':
      scanFrame(e.page, false)
      feed(null, `🔎 ${frameTitle(e.page)}${e.phone ? ' (desktop + phone)' : ''}: ${e.verdict || 'reviewed'}${e.issues.length ? ` · ${e.issues.length} to fix` : ' · nothing to fix'}${e.dropped ? ` · ignored ${e.dropped} “blank” note${e.dropped > 1 ? 's' : ''} the page's text disproves` : ''}`, 'sys')
      if (e.phoneError) feed(null, `📱 phone review of ${frameTitle(e.page)} failed: ${e.phoneError}`, 'err')
      break
    case 'review:issue':
      feed(S.agents.get(e.agent), `on it: ${e.problem}`, '', e.layer)
      break
    case 'layer:reset': {
      const l = S.layers.get(key(e.page, e.layer))
      if (l) { l.text = ''; l.ver++; l.status = 'assigned'; S.treeDirty = true }
      break
    }
    case 'export':
      if (Date.now() - e.t < 8000) showExport(e)
      break
    case 'publish:start': case 'publish:stage': case 'publish:done':
      publishEvent(e)
      break
    case 'comment':
      feed(null, `💬 ${e.text}`, 'you')
      break
    case 'comment:take': {
      const a = S.agents.get(e.agent)
      const what = e.reply || `On it, reworking the ${e.role || e.layer}.`
      if (a && Date.now() - e.t < 8000) say(a, what)
      chatAgent(a, what, e.layer)
      break
    }
    case 'comment:none':
      chatAgent(null, 'Not sure which section that is about. Select one on the canvas and comment there.')
      break
    case 'video:start': case 'video:story': case 'video:progress': case 'video:done': case 'video:failed':
      videoEvent(e)
      break
  }
}

const key = (page, id) => `${page}/${id}`

// ---------- agents

function addAgent(a) {
  const el = document.createElement('div')
  el.className = 'cursor idle'
  el.innerHTML = `${ARROW(a.color)}<div class="tag" style="background:${a.color}">${TOOL.move.svg}<span>${a.name}</span><em class="doing"></em></div><div class="bubble" style="color:${a.color}"></div>`
  els.cursors.append(el)
  const seat = S.agents.size
  const c = dockCell(seat)
  const agent = {
    ...a, el, tagIcon: el.querySelector('.tag svg'), bubble: el.querySelector('.bubble'), doingEl: el.querySelector('.tag .doing'), sparkAt: 0,
    layer: null, idle: true, tool: 'move', toolUntil: 0, sayUntil: 0, assignedAt: 0, act: null, queued: null, restUntil: 0,
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

// The action line on an agent's tag, readable at any zoom: what it is doing now.
const ACT_LABEL = { marquee: 'drawing a frame', shape: 'drawing a shape', component: 'placing a button', swatch: 'picking a colour', pen: 'sketching', wire: 'linking pages', menu: 'setting properties', resize: 'resizing' }
function doing(a, now) {
  if (a.painting && now < a.painting.until) return `· waiting on the photo “${a.painting.gen.slice(0, 18)}…” ${Math.round((now - a.painting.from) / 1000)}s`
  if (a.docked || !a.layer) return ''
  const l = S.layers.get(a.layer)
  if (!l) return ''
  if (a.act?.kind === 'type') return `· typing “${a.act.words.slice(0, 22)}”`
  if (a.act?.kind === 'wire') { const to = (l.text.slice(-400).match(/data-goto="([^"]+)"[^<]*$/) || [])[1]; return `· linking → /${to || '…'}` }
  if (a.act) return `· ${ACT_LABEL[a.act.kind] || 'working'}`
  if (l.status === 'assigned') return `· planning ${l.role}`
  const tail = l.text.slice(-500)
  const tool = detectTool(l.text)
  if (tool === 'text') {
    const words = tail.replace(/<[^>]*>?/g, ' ').replace(/\s+/g, ' ').trim().slice(-24)
    return words ? `· typing “${words}”` : `· writing ${l.role}`
  }
  if (tool === 'image') return '· drawing an icon'
  if (tool === 'connect') return '· adding a link'
  if (tool === 'rect') return `· styling ${(tail.match(/\b(bg-\[var\(--[\w-]+\)\]|rounded-[\w[\]()-]+|shadow-\w+|border-\w+)/g) || ['a box']).pop().replace(/bg-\[var\(--([\w-]+)\)\]/, '$1 fill')}`
  const name = (tail.slice(tail.lastIndexOf('<')).match(/^<([a-z0-9]+)/i) || [])[1]
  return `· laying out ${name === 'section' || !name ? l.role : `<${name}>`}`
}

// Letters that fly off the cursor as an agent types: a small, cheap flourish.
function spark(a, text) {
  const now = performance.now()
  if (now < a.sparkAt || document.body.classList.contains('lite') || a.docked || cam.s < 0.12) return
  const ch = (text.replace(/<[^>]*>?/g, '').match(/[A-Za-z0-9&?!€$]/) || [])[0]
  if (!ch) return
  a.sparkAt = now + 140
  const el = document.createElement('i')
  el.className = 'spark'
  el.textContent = ch
  el.style.color = a.color
  el.style.transform = `translate(${a.sx.toFixed(0)}px, ${a.sy.toFixed(0)}px)`
  el.style.setProperty('--dx', `${(Math.random() * 50 - 25).toFixed(0)}px`)
  els.cursors.append(el)
  setTimeout(() => el.remove(), 800)
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
  els.world.insertBefore(el, els.world.querySelector('#ghosts'))
  S.frames.push(frame)
  S.treeDirty = true
}

function post(f, msg) {
  f.iframe.contentWindow?.postMessage(msg, '*')
}

window.addEventListener('message', e => {
  if (e.source && e.source === els.plFrame.contentWindow) return playerMessage(e.data || {})
  const c = checks.get(e.data?.seq)
  if (c && e.data?.type === 'check' && e.source === c.iframe.contentWindow) return c.done(e.data)
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
  } else if (m.type === 'snap') {
    const w = review.waits.get(m.seq)
    review.waits.delete(m.seq)
    if (w) m.ok ? w.resolve(m) : w.reject(new Error(m.error))
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
  if (!l.text.trim() || l.status === 'assigned') return { x: s.f.x + box.right - 40, y: box.top + Math.max(box.height, l.height) - 30 }
  if (!s.last) return { x: s.f.x + box.left + 40, y: box.top + 40 }
  return { x: s.f.x + s.last[0], y: s.last[1] - 6 }
}

// ---------- design gestures
// What the agent is writing decides what its cursor visibly does on the canvas:
// drag out a frame, draw a shape, drop in a button, pick a colour, sketch an
// illustration, pull a wire to another page, nudge the finished section. Each is
// drawn in world space in the agent's colour, then it goes back to the caret.

const live = e => !viewing && (!e.t || Date.now() - e.t < 5000)
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)

function gestureFor(text) {
  const tail = text.slice(-400)
  const lt = tail.lastIndexOf('<')
  const tag = lt >= 0 ? tail.slice(lt) : ''
  const name = (tag.match(/^<([a-z0-9]+)/i) || [])[1]?.toLowerCase() || ''
  if (tail.lastIndexOf('<svg') > tail.lastIndexOf('</svg>')) return Math.random() < 0.5 ? 'pen' : null
  if (/data-goto="[^"]+"/.test(tag)) return 'wire'
  if (name === 'button' || (name === 'a' && /\b(bg-|rounded|px-)/.test(tag))) return 'component'
  if (/var\(--(primary|accent|muted|card|border)/.test(tag) && Math.random() < 0.4) return 'swatch'
  if (/^(div|section|article|aside|header|footer|ul|nav|form)$/.test(name) && /\b(bg-|border|rounded|shadow|grid|gap-)/.test(tag)) {
    const r = Math.random()
    return r < 0.4 ? 'shape' : r < 0.75 ? 'menu' : null
  }
  // writing the words of a heading or paragraph: sometimes type them in a text box
  const open = tail.match(/<(h[1-4]|p|blockquote)\b[^>]*>([^<]{6,})$/i)
  if (open && Math.random() < 0.35) return 'type'
  return null
}

// Where the agent is writing now, in world coordinates.
function caretOf(l) {
  const s = slotFor(l)
  if (!s) return null
  const b = s.box
  const x = s.last ? s.last[0] : b.left + 60, y = s.last ? s.last[1] : b.top + 60
  return { s, x: s.f.x + Math.max(b.left + 30, Math.min(b.right - 30, x)), y: Math.max(b.top + 20, Math.min(b.top + Math.max(b.height, l.height) - 20, y)) }
}

function ghostFor(a) {
  if (!a.ghost?.isConnected) {
    a.ghost = document.createElement('div')
    a.ghost.className = 'ghost'
    a.ghost.style.setProperty('--c', a.color)
    $('#ghosts')?.append(a.ghost)
  }
  return a.ghost
}

function startGesture(a, kind, l) {
  a.queued = null
  const c = l && caretOf(l)
  if (!c) return
  const { s } = c, b = s.box, fx = s.f.x
  const from = a.docked ? { x: (a.sx - cam.x) / cam.s, y: (a.sy - cam.y) / cam.s } : { x: a.wx, y: a.wy }
  const g = { kind, t0: performance.now(), from, pressed: false }
  if (kind === 'marquee') {
    const h = Math.max(b.height, l.height)
    Object.assign(g, { dur: 900, p0: { x: fx + b.left + 28, y: b.top + 24 }, p1: { x: fx + b.right - 28, y: b.top + h - 24 }, approach: 0.15 })
  } else if (kind === 'shape') {
    const w = rand(260, 520), h = rand(120, 260)
    const x0 = Math.min(c.x, fx + b.right - w - 30)
    Object.assign(g, { dur: 1100, p0: { x: x0, y: c.y + 20 }, p1: { x: x0 + w, y: c.y + 20 + h } })
  } else if (kind === 'component') {
    Object.assign(g, { dur: 1300, p0: { x: fx - 220, y: c.y - 30 }, p1: { x: Math.min(c.x + 40, fx + b.right - 160), y: c.y + 10 }, approach: 0.3 })
  } else if (kind === 'swatch') {
    const vars = S.theme?.vars || {}
    g.colors = ['--primary', '--accent', '--background', '--muted', '--foreground'].map(k => vars[k]).filter(Boolean)
    if (!g.colors.length) return
    g.pick = Math.floor(Math.random() * g.colors.length)
    Object.assign(g, { dur: 1300, p0: { x: c.x, y: c.y }, p1: { x: c.x + 40 + g.pick * 70, y: c.y + 95 } })
  } else if (kind === 'pen') {
    Object.assign(g, { dur: 1500, p0: { x: c.x, y: c.y + 60 }, cx: c.x + rand(40, 120), cy: c.y + 120, r: rand(60, 110), trail: [] })
  } else if (kind === 'wire') {
    const to = (l.text.slice(-400).match(/data-goto="([^"]+)"[^<]*$/) || [])[1]
    const tf = S.frames.find(f => f.id === to)
    if (!tf || tf === s.f) return
    Object.assign(g, { dur: 1400, p0: { x: c.x, y: c.y }, p1: { x: tf.x + 40, y: 80 }, approach: 0.15 })
  } else if (kind === 'type') {
    const words = (l.text.slice(-300).match(/>([^<]{6,})$/) || [])[1]?.trim() || ''
    if (!words) return
    g.words = words.length > 34 ? `${words.slice(0, 34)}…` : words
    Object.assign(g, { dur: 900 + g.words.length * 55, p0: { x: c.x - 20, y: c.y + 40 }, p1: { x: c.x - 20, y: c.y + 40 } })
  } else if (kind === 'menu') {
    const tag = l.text.slice(l.text.lastIndexOf('<'))
    g.items = ['Fill', 'Stroke', 'Corner radius', 'Auto layout', 'Effects']
    g.pick = /rounded/.test(tag) ? 2 : /shadow/.test(tag) ? 4 : /\b(gap-|grid|flex)/.test(tag) ? 3 : /border/.test(tag) ? 1 : 0
    const gap = (tag.match(/\bgap-(\d+)/) || [])[1], rad = (tag.match(/\brounded-(\w+)/) || [])[1]
    g.value = ['fill', 'stroke · 1px', `radius · ${rad || 'md'}`, `${/flex-col|grid/.test(tag) ? '↓' : '→'} gap ${gap ? gap * 4 : 16}`, 'shadow'][g.pick]
    Object.assign(g, { dur: 1700, p0: { x: c.x, y: c.y }, p1: { x: c.x + 60, y: c.y + 72 + g.pick * 62 }, approach: 0.2 })
  } else if (kind === 'resize') {
    const h = b.height
    Object.assign(g, { dur: 1000, box: { x: fx + b.left, y: b.top, w: b.width, h }, p0: { x: fx + b.left + b.width / 2, y: b.top + h }, p1: { x: fx + b.left + b.width / 2, y: b.top + h + 40 }, approach: 0.3 })
  } else return
  g.approach ??= 0.25
  const tool = { marquee: 'frame', shape: 'rect', component: 'rect', swatch: 'rect', pen: 'image', wire: 'connect', type: 'text', menu: 'move', resize: 'move' }[kind]
  // sometimes walk down to the toolbar first and pick the tool
  const btn = tool !== 'move' && Math.random() < 0.4 && els.toolbar.children[TOOLS.findIndex(t => t.id === tool)]
  if (btn) {
    const r = btn.getBoundingClientRect(), v = els.viewport.getBoundingClientRect()
    g.via = { x: (r.left + r.width / 2 - v.left - cam.x) / cam.s, y: (r.top + r.height / 2 - v.top - cam.y) / cam.s }
    g.viaTool = tool
    const extra = 700
    g.approach = (g.approach * g.dur + extra) / (g.dur + extra)
    g.dur += extra
  }
  a.act = g
  a.toolUntil = Math.max(a.toolUntil, g.t0 + g.dur)
  setTool(a, tool, g.dur)
}

// Tool buttons an agent has just clicked, lit in its colour.
const toolFlash = new Map()

// Advance a gesture; returns the cursor's world position, or null when it ends.
function gestureStep(a, now) {
  const g = a.act
  const t = Math.min(1, (now - g.t0) / g.dur)
  const gh = ghostFor(a)
  if (t >= 1) {
    a.act = null
    a.restUntil = now + rand(700, 1800)
    gh.classList.add('fade')
    setTimeout(() => gh.isConnected && gh.classList.contains('fade') && (gh.innerHTML = ''), 400)
    return null
  }
  gh.classList.remove('fade')
  const ap = g.approach
  if (t < ap) {
    const v = t / ap
    g.pressed = false
    if (g.kind === 'resize') drawSelection(gh, g.box, 0)
    else gh.innerHTML = ''
    if (g.via) {
      if (v < 0.5) {
        const k = ease(v / 0.5)
        if (v > 0.42 && !g.clicked) { g.clicked = true; toolFlash.set(g.viaTool, { color: a.color, until: now + 600 }) }
        g.pressed = v > 0.42
        return { x: lerp(g.from.x, g.via.x, k), y: lerp(g.from.y, g.via.y, k) }
      }
      const k = ease((v - 0.5) / 0.5)
      return { x: lerp(g.via.x, g.p0.x, k), y: lerp(g.via.y, g.p0.y, k) }
    }
    const k = ease(v)
    return { x: lerp(g.from.x, g.p0.x, k), y: lerp(g.from.y, g.p0.y, k) }
  }
  const u = (t - ap) / (1 - ap), k = ease(Math.min(1, u / 0.8))
  g.pressed = u < 0.85
  if (g.kind === 'pen') {
    const ang = u * Math.PI * 3.2
    const p = { x: g.cx + Math.cos(ang) * g.r * (0.6 + 0.4 * Math.sin(ang * 1.7)), y: g.cy + Math.sin(ang) * g.r * 0.7 }
    g.trail.push(`${Math.round(p.x)},${Math.round(p.y)}`)
    gh.innerHTML = `<svg class="pen"><polyline points="${g.trail.join(' ')}"/></svg>`
    return p
  }
  const p = { x: lerp(g.p0.x, g.p1.x, k), y: lerp(g.p0.y, g.p1.y, k) }
  if (g.kind === 'marquee' || g.kind === 'shape') {
    const x = Math.min(g.p0.x, p.x), y = Math.min(g.p0.y, p.y), w = Math.abs(p.x - g.p0.x), h = Math.abs(p.y - g.p0.y)
    gh.innerHTML = `<div class="${g.kind}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><span>${Math.round(w)} × ${Math.round(h)}</span></div>`
  } else if (g.kind === 'component') {
    // drag it in, then try a few fills from the theme before settling
    const colors = themeColors().slice(0, 5)
    const dk = ease(Math.min(1, u / 0.45))
    const at = { x: lerp(g.p0.x, g.p1.x, dk), y: lerp(g.p0.y, g.p1.y, dk) }
    g.pressed = u < 0.45 || (u > 0.9 && u < 0.97)
    if (u > 0.5 && colors.length) {
      const i = Math.min(colors.length - 1, Math.floor(((u - 0.5) / 0.4) * colors.length))
      const pal = `<div class="palette" style="left:${g.p1.x + 260}px;top:${g.p1.y - 40}px">${colors.map((c, j) => `<i style="background:${c}" class="${j === i ? 'on' : ''}"></i>`).join('')}</div>`
      gh.innerHTML = `<div class="chip" style="left:${g.p1.x - 20}px;top:${g.p1.y - 34}px;background:${colors[i]}">Button</div>${pal}`
      return { x: g.p1.x + 288 + i * 70, y: g.p1.y - 12 }
    }
    gh.innerHTML = `<div class="chip" style="left:${at.x - 20}px;top:${at.y - 34}px">Button</div>`
    return at
  } else if (g.kind === 'type') {
    g.pressed = u < 0.08
    const n = Math.min(g.words.length, Math.floor(Math.max(0, u - 0.1) / 0.85 * g.words.length))
    const shown = g.words.slice(0, n).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    gh.innerHTML = `<div class="textbox" style="left:${g.p0.x}px;top:${g.p0.y}px">${shown}<i class="caret"></i></div>`
    return { x: g.p0.x + 18 + Math.min(n, 34) * 21, y: g.p0.y + 50 }
  } else if (g.kind === 'menu') {
    const hover = Math.min(g.pick, Math.floor((u / 0.75) * (g.pick + 1)))
    const chosen = u > 0.8
    g.pressed = u > 0.78 && u < 0.88
    const rows = g.items.map((it, i) => `<div class="${i === hover ? 'hov' : ''}${chosen && i === g.pick ? ' pick' : ''}">${it}${chosen && i === g.pick ? `<small>${g.value}</small>` : ''}</div>`).join('')
    gh.innerHTML = `<div class="menu" style="left:${g.p0.x + 20}px;top:${g.p0.y + 20}px">${rows}</div>`
    return { x: g.p0.x + 80, y: g.p0.y + 72 + hover * 62 }
  } else if (g.kind === 'wire') {
    gh.innerHTML = `<svg class="wire"><path d="M${g.p0.x},${g.p0.y} C${g.p0.x + 200},${g.p0.y} ${p.x - 200},${p.y} ${p.x},${p.y}"/><circle cx="${g.p0.x}" cy="${g.p0.y}" r="12"/><circle cx="${p.x}" cy="${p.y}" r="12"/></svg>`
  } else if (g.kind === 'swatch') {
    g.pressed = u > 0.75 && u < 0.9
    const sw = g.colors.map((c, i) => `<i style="background:${c}" class="${u > 0.8 && i === g.pick ? 'on' : ''}"></i>`).join('')
    gh.innerHTML = `<div class="palette" style="left:${g.p0.x}px;top:${g.p0.y + 50}px">${sw}</div>`
  } else if (g.kind === 'resize') {
    const bounce = Math.sin(Math.min(1, u / 0.85) * Math.PI) * 40
    drawSelection(gh, { ...g.box, h: g.box.h + bounce }, 1)
    return { x: g.p0.x, y: g.p0.y + bounce }
  }
  return p
}

function themeColors() {
  const v = S.theme?.vars || {}
  return ['--primary', '--accent', '--foreground', '--muted', '--card', '--background'].map(k => v[k]).filter(Boolean)
}

function drawSelection(gh, b, on) {
  const hs = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]
  gh.innerHTML = `<div class="select${on ? ' on' : ''}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">${hs.map(([x, y]) => `<b style="left:${x * 100}%;top:${y * 100}%"></b>`).join('')}<span>${Math.round(b.w)} × ${Math.round(b.h)}</span></div>`
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
    const d = `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${(a.x + dx).toFixed(1)},${a.y.toFixed(1)} ${(b.x - dx).toFixed(1)},${(b.y - (back ? 120 : 0)).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
    if (d === w.d) continue
    w.d = d
    w.path.setAttribute('d', d)
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

// The panels redraw only when what they show has changed: rebuilding them every
// tick kept the page re-laying itself out ~60 times a second, which on a small
// Mac starved the GPU once the finished pages were on the canvas.
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v }
let agentsKey = '', toolbarKey = ''
function renderAgents() {
  let working = 0
  const sig = [...S.agents.values()].map(a => { const l = a.layer && S.layers.get(a.layer); if (l) working++; return `${a.id}${l?.key}${a.idle}${a.tool}${design.pinned === a.id}` }).join()
  setText(els.agentCount, S.agents.size ? `${working}/${S.agents.size}` : '0')
  if (sig === agentsKey) return working
  agentsKey = sig
  working = 0
  els.agents.innerHTML = ''
  for (const a of S.agents.values()) {
    const l = a.layer && S.layers.get(a.layer)
    if (l) working++
    const row = document.createElement('div')
    row.className = `agent${l ? '' : ' idle'}${design.pinned === a.id ? ' sel' : ''}`
    row.onclick = () => { design.pinned = design.pinned === a.id ? null : a.id; design.at = 0 }
    row.innerHTML = `<span class="dot" style="background:${a.color}"></span><div style="min-width:0"><div class="nm"></div><div class="task"></div></div>${TOOL[a.tool].svg}`
    row.querySelector('.nm').textContent = a.name
    row.querySelector('.task').textContent = l ? `${l.page === '*' ? 'shared' : l.page} · ${l.role}` : a.idle ? 'idle' : 'waiting'
    els.agents.append(row)
  }
  return working
}

function renderToolbar() {
  const by = Object.fromEntries(TOOLS.map(t => [t.id, []]))
  for (const a of S.agents.values()) if (a.layer || performance.now() < a.toolUntil) by[a.tool].push(a)
  const html = TOOLS.map(t => {
    const list = by[t.id]
    const f = toolFlash.get(t.id)
    const lit = f && performance.now() < f.until ? ` style="background:${f.color};color:#0b0d12"` : ''
    return `<div class="tool${list.length ? ' active' : ''}${t.id === 'comment' && cmt.mode ? ' armed' : ''}"${lit} data-tool="${t.id}" title="${t.id === 'comment' ? 'Comment: click a section and tell an agent what to change' : t.label}">${t.svg}${list.length ? `<span class="n">${list.length}</span>` : ''}<div class="who">${list.map(a => `<i style="background:${a.color}"></i>`).join('')}</div><span class="lbl">${t.label}</span></div>`
  }).join('')
  if (html !== toolbarKey) els.toolbar.innerHTML = toolbarKey = html
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

// An agent answering in the Chat tab (a comment it picked up).
function chatAgent(a, text, where = '') {
  const item = document.createElement('div')
  item.className = 'item reply'
  item.style.setProperty('--c', a?.color || 'var(--accent)')
  item.innerHTML = `<b>${esc(a?.name || 'SWARM')}</b>${esc(text)}${where ? `<span class="where">${esc(where)}</span>` : ''}`
  push(els.feed, item)
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
  if (!S.frames.length) return
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
  const camKey = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.s.toFixed(4)})`
  if (camKey !== cam.key) {
    cam.key = camKey
    els.world.style.transform = camKey
    const g = 60 * cam.s
    els.viewport.style.backgroundSize = `${g}px ${g}px`
    els.viewport.style.backgroundPosition = `${cam.x}px ${cam.y}px`
  }

  for (const a of S.agents.values()) {
    // Switching between screen space (dock) and world space (canvas) converts the
    // current position, so a cursor glides out of the break room instead of jumping.
    if (a.queued && a.layer && !a.act) startGesture(a, a.queued, S.layers.get(a.layer))
    if (a.act) {
      if (a.docked) { a.wx = (a.sx - cam.x) / cam.s; a.wy = (a.sy - cam.y) / cam.s; a.docked = false }
      const t = gestureStep(a, now)
      if (t) { a.wx = t.x; a.wy = t.y }
      const p = toScreen(a.wx, a.wy)
      a.sx = p.x
      a.sy = p.y
    } else if (!a.layer && now > a.toolUntil) {
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
    const pos = `translate(${a.sx.toFixed(1)}px, ${a.sy.toFixed(1)}px)`
    if (pos !== a.pos) { a.pos = pos; a.el.style.transform = pos }
    a.el.classList.toggle('docked', a.docked)
    a.el.classList.toggle('flip', a.docked && a.seat % DOCK.cols >= 2)
    a.el.classList.toggle('talking', now < a.sayUntil)
    a.el.classList.toggle('press', !!a.act?.pressed)
  }
  runBanter(now)
  drawWires()

  if (now - lite.last > 1000) { lite.last = now; litePass() }
  if (now - lastPanels > 150) {
    lastPanels = now
    const working = renderAgents()
    for (const a of S.agents.values()) setText(a.doingEl, doing(a, now))
    renderToolbar()
    renderDesign(now)
    drawSelBox()
    drawComment()
    if (S.treeDirty) { S.treeDirty = false; renderTree() }
    if (S.planDirty) {
      S.planDirty = false
      els.plan.textContent = [...S.plans].map(([k, v]) => (k === 'sitemap' ? v.slice(-1200) : `\n# ${k}\n${v.slice(-700)}`)).join('\n')
      els.plan.scrollTop = els.plan.scrollHeight
    }
    const done = [...S.layers.values()].filter(l => l.status === 'done').length
    setText(els.status, `${working} agents working · ${done}/${S.layers.size} layers · ${S.frames.length} pages`)
    els.play.disabled = !S.frames.length
    els.reviewBtn.disabled = review.busy || !reviewerOn() || !S.done
    setText(els.reviewBtn, review.busy ? '🔎 Reviewing…' : '🔎 Review')
    els.exportBtn.disabled = !S.done || exp.busy
    const pubbing = pub.run === shownRun() && pub.state === 'working'
    els.publishBtn.disabled = !S.done || pubbing
    setText(els.publishBtn, pubbing ? '🌐 Publishing…' : '🌐 Publish')
    const mine = video.run === shownRun()
    els.videoBtn.disabled = !S.done && !(mine && video.src)
    setText(els.videoBtn, mine && video.busy ? `🎬 ${video.pct ? `${video.pct | 0}%` : 'Writing…'}` : '🎬 Video')
    if (S.progress) {
      const done = [...S.layers.values()].filter(l => l.status === 'done').length
      setText(S.progress.querySelector('.txt'), S.layers.size
        ? `${S.planText ? `${S.planText} ` : ''}${working} agents building · ${done}/${S.layers.size} sections across ${S.frames.length} pages`
        : 'Planning the pages…')
    }
    if (S.t0 && !(viewing && !S.tEnd)) setText(els.timer, `${(((S.tEnd || Date.now()) - S.t0) / 1000).toFixed(1)}s`)
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
  if (!f) { if (S.sel) { S.sel = null; design.last = '' } return }
  const x = wx - f.x
  const hit = f.geo.gotos.find(({ box: [l, t, w, h] }) => x >= l && x <= l + w && wy >= t && wy <= t + h)
  if (hit && !cmt.mode) focusPage(hit.target)
  else selectAt(f, x, wy)
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
  if (e.key === 'Escape' && S.sel) { S.sel = null; design.last = ''; return }
  if (e.key === 'v' && !els.player.hidden) return toggleTourMenu()
  if (e.key === 'm' && !els.player.hidden && !e.target.closest('input, select, textarea')) return setMotion()
  if (e.target.closest('input, select, textarea')) return
  if (e.key === 'd') return togglePanel('design')
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
const player = { page: null, device: store.get('device', 'desktop'), history: [], motion: store.get('motion', true) }

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

function pageDoc(id, scripts) {
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
${scripts ?? PLAYER_SCRIPT + layoutTag() + motionTags()}</head><body>${html}</body></html>`
}

// The layout guard in Play mode, as in the exports: floated text panels that
// would cover other text at this width move beside the box they sat on.
const layoutTag = () => BOOT.layout ? `<script>addEventListener('load', () => ${BOOT.layout})<\/script>` : ''

// Motion in Play mode: the same reveal the exports get, in the feel the theme asks for.
function motionTags() {
  const m = BOOT.motion
  if (!player.motion || !m) return ''
  const t = S.theme || {}
  const preset = new RegExp(m.snappy).test(`${t.name || ''} ${t.direction || ''}`.toLowerCase()) ? 'snappy' : 'gentle'
  return `<style>${m.css}</style><script>addEventListener('load', () => setTimeout(() => (${m.src})(document.body, ${JSON.stringify(preset)}), 60))<\/script>`
}

function setMotion(on = !player.motion) {
  player.motion = on
  store.set('motion', on)
  els.plMotion.classList.toggle('on', on)
  if (player.page && !els.player.hidden) showPage(player.page, false)
}
commandOps.motion = c => setMotion(c.on === undefined ? !player.motion : !!c.on)

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
  els.viewport.classList.add('behind')
  setDevice(player.device, false)
  showPage(page || S.frames[0].id, false)
  if (S.tEnd) loadTours()
}

function closePlayer() {
  stopTour()
  toggleTourMenu(false)
  els.player.hidden = true
  els.viewport.classList.remove('behind')
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
els.plMotion.onclick = () => setMotion()
els.plMotion.classList.toggle('on', player.motion)
els.plPage.onchange = () => showPage(els.plPage.value)
for (const b of document.querySelectorAll('#pl-device button')) b.onclick = () => setDevice(b.dataset.device)
window.addEventListener('resize', () => !els.player.hidden && fitDevice())

// ---------- Design panel
// Figma's right sidebar for the swarm: the Design tab shows the properties of the
// section an agent is building (auto layout, fill, stroke, radius, type, effects),
// read live from the Tailwind classes it is writing; the Variables tab shows the
// design system the planner set up (colour tokens, type families and scale,
// radius) and how often the agents use each token.

const design = { tab: 'design', tabPinned: false, pinned: null, agent: null, layer: null, at: 0, last: '', lastVars: '', varsAt: 0, prev: new Map(), chg: new Map() }

function showDtab(name) {
  design.tab = name
  for (const el of document.querySelectorAll('[data-dtab]')) el.classList.toggle('on', el.dataset.dtab === name)
  design.last = design.lastVars = ''
}

function loadThemeFonts(t) {
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;600;700`
  const names = [t.fonts?.heading, t.fonts?.body].filter(Boolean)
  if (!names.length) return
  let link = $('#theme-fonts')
  if (!link) { link = document.createElement('link'); link.id = 'theme-fonts'; link.rel = 'stylesheet'; document.head.append(link) }
  link.href = `https://fonts.googleapis.com/css2?${names.map(fam).join('&')}&display=swap`
}

const TW_SIZE = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60, '7xl': 72, '8xl': 96, '9xl': 128 }
const TW_WEIGHT = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 }
const TW_RADIUS = { none: '0', sm: '2', '': '4', md: '6', lg: '8', xl: '12', '2xl': '16', '3xl': '24', full: '∞' }
const BP = { '': 0, sm: 1, md: 2, lg: 3, xl: 4 }
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const space = v => (v === 'px' ? 1 : /^\[(.+)\]$/.test(v) ? v.slice(1, -1) : Number(v) * 4)

// The token of a family that applies at desktop width (the widest breakpoint up to xl wins).
function tw(classes, re) {
  let best = null, rank = -1
  for (const tok of classes.split(/\s+/)) {
    const i = tok.lastIndexOf(':')
    const bp = i < 0 ? '' : tok.slice(0, i)
    if (!(bp in BP)) continue
    const m = tok.slice(i + 1).match(re)
    if (m && BP[bp] >= rank) { best = m; rank = BP[bp] }
  }
  return best
}

function sectionProps(l) {
  const classes = [...l.text.matchAll(/class="([^"]*)"?/g)].map(m => m[1])
  const root = classes[0] || ''
  const all = classes.join(' ')
  const vars = S.theme?.vars || {}
  const varSw = name => `<span class="sw" style="background:${esc(vars[`--${name}`] || 'transparent')}"></span>${esc(name)}`
  const rows = []
  const EDITABLE = { dir: 'dir', gap: 'gap', align: 'align', pad: 'pad', bg: 'bg', hsize: 'hsize', radius: 'radius' }
  const row = (sec, k, label, val) => val != null && val !== '' && rows.push({ sec, k, label, val, edit: EDITABLE[k] })
  const s = slotFor(l)
  row('Frame', 'w', 'W', s ? Math.round(s.box.width) : 1280)
  row('Frame', 'h', 'H', s ? Math.round(s.box.height) : l.height)
  const lay = classes.slice(0, 5).find(c => tw(c, /^(flex|grid|inline-flex)$/)) || ''
  if (lay) {
    const isGrid = !!tw(lay, /^grid$/)
    const cols = tw(lay, /^grid-cols-(\d+)$/)
    row('Auto layout', 'dir', '', isGrid ? `▦ Grid${cols ? ` · ${cols[1]} cols` : ''}` : tw(lay, /^flex-col$/) && !tw(lay, /^flex-row$/) ? '↓ Vertical' : '→ Horizontal')
    const gap = tw(lay, /^gap-(\S+)$/)
    row('Auto layout', 'gap', 'gap', gap ? space(gap[1]) : 0)
    const al = tw(lay, /^(items|justify)-(\S+)$/)
    row('Auto layout', 'align', 'align', al ? al[2] : 'start')
  }
  const px = tw(root, /^px-(\S+)$/) || tw(root, /^p-(\S+)$/), py = tw(root, /^py-(\S+)$/) || tw(root, /^p-(\S+)$/)
  row('Auto layout', 'pad', 'padding', `${py ? space(py[1]) : 0} · ${px ? space(px[1]) : 0}`)
  const bg = tw(root, /^bg-\[var\(--([\w-]+)\)\]$/)
  row('Fill', 'bg', '', bg ? varSw(bg[1]) : '<span class="sw"></span>no fill')
  const fills = [...new Set([...all.matchAll(/bg-\[var\(--([\w-]+)\)\]/g)].map(m => m[1]))].filter(f => f !== bg?.[1]).slice(0, 3)
  fills.forEach((f, i) => row('Fill', `f${i}`, '', varSw(f)))
  const stroke = all.match(/border-\[var\(--([\w-]+)\)\]/)
  if (stroke) row('Stroke', 'stroke', '', `${varSw(stroke[1])} · ${(all.match(/\bborder-(\d)\b/) || [])[1] || 1}px`)
  const rad = all.match(/\brounded(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[var\(--radius\)\]))?\b/)
  if (rad) row('Stroke', 'radius', 'radius', rad[1]?.startsWith('[') ? S.theme?.radius || 'var' : TW_RADIUS[rad[1] || ''])
  const sizes = [...all.matchAll(/(?:^|\s)(?:(?:sm|md|lg|xl):)?text-(xs|sm|base|lg|xl|[2-9]xl)\b/g)].map(m => TW_SIZE[m[1]])
  if (sizes.length) {
    const big = Math.max(...sizes)
    const count = {}
    sizes.forEach(z => (count[z] = (count[z] || 0) + 1))
    const body = +Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]
    const weights = [...all.matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)].map(m => TW_WEIGHT[m[1]])
    const heading = /font-\[var\(--font-heading\)\]|<h[1-3]/.test(l.text) ? S.theme?.fonts?.heading : null
    row('Typography', 'hfont', '', heading ? `<i>Aa</i>${esc(heading)}` : null)
    row('Typography', 'hsize', 'heading', `${big}${weights.length ? ` · ${Math.max(...weights)}` : ''}`)
    row('Typography', 'bsize', 'body', `${body} · ${S.theme?.fonts?.body ? esc(S.theme.fonts.body) : 'sans'}`)
    const lead = all.match(/\bleading-(\w+)/), track = all.match(/\btracking-(\w+)/)
    if (lead || track) row('Typography', 'lt', '', `${lead ? `leading ${lead[1]}` : ''}${lead && track ? ' · ' : ''}${track ? `tracking ${track[1]}` : ''}`)
  }
  const fx = [...new Set([...all.matchAll(/\b(shadow(?:-\w+)?|backdrop-blur(?:-\w+)?|opacity-\d+|blur(?:-\w+)?)\b/g)].map(m => m[1]))].slice(0, 3)
  fx.forEach((f, i) => row('Effects', `fx${i}`, '', esc(f)))
  row('Layers', 'els', 'elements', (l.text.match(/<[a-z][a-z0-9]*\b/gi) || []).length)
  row('Layers', 'links', 'links', (l.text.match(/data-goto=/g) || []).length)
  return rows
}

function pickSelection(now) {
  if (S.sel && S.layers.has(S.sel)) { design.layer = S.sel; return { a: null, l: S.layers.get(S.sel) } }
  const has = id => { const a = S.agents.get(id); return a?.layer ? a : null }
  let a = has(design.pinned)
  if (!a && has(design.agent) && now - design.at < 3500) a = has(design.agent)
  if (!a) a = has(S.lastActive) || [...S.agents.values()].find(x => x.layer)
  if (a && a.id !== design.agent) { design.agent = a.id; design.at = now }
  if (a) design.layer = a.layer
  return { a, l: design.layer && S.layers.get(design.layer) }
}

function renderDesign(now) {
  if (!panels.has('design')) return
  if (design.tab === 'vars') return renderVars(now)
  const { a, l } = pickSelection(now)
  let html
  if (!l) {
    html = `<div class="dempty">${S.layers.size ? 'Click a section on the canvas to edit it, or an agent in the Agents panel to follow its work.' : 'Start a build. While the swarm works, this shows the properties of the section an agent is designing: auto layout, fills, type and effects.'}</div>`
  } else {
    const owner = S.agents.get(l.agent) || a
    const rows = sectionProps(l)
    let body = '', sec = ''
    for (const r of rows) {
      const id = `${l.key}/${r.k}`
      const before = design.prev.get(id)
      if (before !== undefined && before !== r.val) design.chg.set(id, now + 700)
      design.prev.set(id, r.val)
      if (r.sec !== sec) {
        if (sec) body += '</div></div>'
        sec = r.sec
        body += `<div class="dsec"><h4>${sec}</h4><div class="drow${['Fill', 'Effects', 'Typography'].includes(sec) ? ' one' : ''}">`
      }
      const editable = r.edit && l.status === 'done'
      body += `<div class="dval${(design.chg.get(id) || 0) > now ? ' chg' : ''}${editable ? ' edit' : ''}"${editable ? ` data-edit="${r.edit}" title="Change ${r.edit}"` : ''}>${r.label ? `<i>${r.label}</i>` : ''}${r.val}</div>`
    }
    if (sec) body += '</div></div>'
    const where = `${l.page === '*' ? 'shared' : l.page} · ${l.status === 'done' ? 'done' : 'building'}`
    const mode = S.sel ? 'selected ✕' : design.pinned ? 'pinned' : 'following'
    const hint = l.status === 'done' ? '<div class="dhint">Click a value to change this section. Variables change every page.</div>' : `<div class="dhint">Editable when ${esc(owner?.name || 'its agent')} finishes. Click any finished section on the canvas to edit it.</div>`
    html = `<div class="dsel"><span class="dot" style="background:${owner?.color || '#888'}"></span><div><b>${esc(l.role || l.id)}</b><small>${esc(owner?.name || '')} · ${esc(where)}</small></div><span class="pin">${mode}</span></div>${hint}${body}`
  }
  if (html !== design.last) {
    design.last = html
    els.dDesign.innerHTML = html
    const pin = els.dDesign.querySelector('.pin')
    if (pin) pin.onclick = () => { if (S.sel) S.sel = null; else design.pinned = design.pinned ? null : design.agent; design.last = '' }
  }
}

function renderVars(now) {
  if (now - design.varsAt < 900 && !(S.themeAt && now - S.themeAt < 3000)) return
  design.varsAt = now
  const t = S.theme
  if (!t) {
    const html = S.run ? '<div class="dsetup">Setting up the design system</div><div class="dempty">The planner picks colour tokens, type and radius first; the agents build everything from them.</div>' : '<div class="dempty">The design system appears here when a build starts.</div>'
    if (html !== design.lastVars) els.dVars.innerHTML = design.lastVars = html
    return
  }
  const texts = [...S.layers.values()].map(l => l.text).join('\n')
  const uses = name => (texts.match(new RegExp(`var\\(--${name}\\)`, 'g')) || []).length
  const fresh = S.themeAt && now - S.themeAt < 3000
  let i = 0
  const anim = () => (fresh ? ` reveal" style="animation-delay:${i++ * 110}ms` : '')
  const colors = Object.entries(t.vars || {}).map(([k, v]) => `<div class="dvar edit${anim()}" data-var="${esc(k)}" title="Change ${esc(k.slice(2))} on every page"><span class="sw" style="background:${esc(v)}"></span><div><code>${esc(k.slice(2))}</code><br><small>${esc(v)}</small></div><small>${uses(k.slice(2))}×</small></div>`).join('')
  const fontRow = (role, name) => `<div class="dvar edit${anim()}" data-font="${role}" title="Change the ${role} font" style="grid-template-columns:44px 1fr auto"><span class="ag" style="font:600 24px/1 '${esc(name)}',serif">Ag</span><div><code>${role}</code><br><small>${esc(name)}</small></div><small>${uses(`font-${role}`)}×</small></div>`
  const sizes = {}
  for (const m of texts.matchAll(/(?:^|\s)(?:(?:sm|md|lg|xl):)?text-(xs|sm|base|lg|xl|[2-9]xl)\b/g)) sizes[m[1]] = (sizes[m[1]] || 0) + 1
  const scale = Object.entries(sizes).sort((a, b) => TW_SIZE[b[0]] - TW_SIZE[a[0]]).slice(0, 7).map(([k, n]) => {
    const px = TW_SIZE[k], heading = px >= 24
    return `<div class="dscale edit" data-size="${k}" title="Change every text-${k}"><code>${k} · ${px}</code><span style="font:${heading ? 600 : 400} ${Math.min(px, 22)}px '${esc(heading ? t.fonts?.heading : t.fonts?.body)}',sans-serif">${heading ? 'Heading' : 'Body text'}</span><small>${n}×</small></div>`
  }).join('')
  const html = `${fresh ? '<div class="dsetup">Setting up the design system</div>' : ''}
<div class="dsec"><h4>${esc(t.name || 'Theme')}<small>${esc(t.direction || '').slice(0, 40)}</small></h4></div>
<div class="dsec"><h4>Colors<small>${Object.keys(t.vars || {}).length} tokens</small></h4>${colors}</div>
<div class="dsec"><h4>Typography</h4>${fontRow('heading', t.fonts?.heading || 'Georgia')}${fontRow('body', t.fonts?.body || 'Inter')}</div>
<div class="dsec"><h4>Scale<small>whole site</small></h4><div class="dsteps"><span>Type</span><button data-scale="type:-1" title="Every heading one step smaller">−</button><button data-scale="type:1" title="Every heading one step bigger">+</button><span>Spacing</span><button data-scale="space:-1" title="Tighter spacing everywhere">−</button><button data-scale="space:1" title="Looser spacing everywhere">+</button></div></div>
${scale ? `<div class="dsec"><h4>Type scale<small>click to remap</small></h4>${scale}</div>` : ''}
<div class="dsec"><h4>Radius</h4><div class="dvar edit${anim()}" data-radius="" title="Change the radius everywhere" style="grid-template-columns:18px 1fr auto"><span class="sw" style="border-radius:${esc(t.radius || '12px')};border:2px solid var(--accent);background:none"></span><code>radius</code><small>${esc(t.radius || '')} · ${uses('radius')}×</small></div></div>`
  if (html !== design.lastVars) els.dVars.innerHTML = design.lastVars = html
}

// ---------- editing: people change the design next to the agents
// Two kinds of edit. Group edits change the design system and so every page at
// once: a colour token, a font, the radius, one step of the type scale, or the
// whole type or spacing scale up or down. Section edits change one finished
// section: padding, gap, direction, alignment, fill, heading size, corners.
// Each edit is an event saved with the run, so a reopened file replays it.

const CLIENT = Math.random().toString(36).slice(2, 8)
const SIZES = Object.keys(TW_SIZE)
const SPACE = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96']
const FONTS = ['Inter', 'DM Sans', 'Karla', 'Manrope', 'Space Grotesk', 'IBM Plex Sans', 'Work Sans', 'Syne', 'Fraunces', 'Playfair Display', 'DM Serif Display', 'Instrument Serif', 'Libre Baskerville', 'JetBrains Mono']
const SIZE_RE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/
const SPACE_RE = /^(-?)(p|px|py|pt|pb|pl|pr|gap|gap-x|gap-y|space-y|space-x|mt|mb|my)-([\d.]+)$/

// Rewrite the class tokens of every class attribute in some HTML. `fn` gets the
// token without its breakpoint prefix and returns a replacement (or the same).
function mapClasses(html, fn) {
  return html.replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(/\s+/).map(tok => {
    const i = tok.lastIndexOf(':')
    const bp = i < 0 ? '' : tok.slice(0, i)
    if (!(bp in BP)) return tok
    const out = fn(tok.slice(i + 1))
    return out === tok.slice(i + 1) ? tok : out && (bp ? `${bp}:${out}` : out)
  }).filter(Boolean).join(' ')}"`)
}

const stepIn = (list, v, d) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(v) + d))]

// Class-level group edits, applied to a layer's HTML.
function restyle(l, e) {
  if (!l.text || l.status !== 'done') return
  let out = l.text
  if (e.kind === 'size') out = mapClasses(out, t => (t === `text-${e.from}` ? `text-${e.value}` : t))
  if (e.kind === 'scale' && e.axis === 'type') out = mapClasses(out, t => {
    const m = t.match(SIZE_RE)
    return m && TW_SIZE[m[1]] >= 18 ? `text-${stepIn(SIZES, m[1], Number(e.value))}` : t
  })
  if (e.kind === 'scale' && e.axis === 'space') out = mapClasses(out, t => {
    const m = t.match(SPACE_RE)
    return m && SPACE.includes(m[3]) && m[3] !== '0' ? `${m[1]}${m[2]}-${stepIn(SPACE, m[3], Number(e.value) * 2)}` : t
  })
  if (out !== l.text) { l.text = out; l.ver++ }
}

function setCls(el, drop, add) {
  if (!el) return
  const toks = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).filter(tok => {
    const i = tok.lastIndexOf(':')
    return !((i < 0 ? '' : tok.slice(0, i)) in BP && drop.test(tok.slice(i + 1)))
  })
  if (add) toks.push(...add.split(' '))
  el.setAttribute('class', toks.join(' '))
}

function layoutEl(root) {
  return [root, ...root.querySelectorAll('*')].slice(0, 8).find(el => /(^|\s)((sm|md|lg|xl):)?(flex|grid|inline-flex)(\s|$)/.test(el.getAttribute('class') || ''))
}

function editSection(l, prop, v) {
  const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return
  const lay = layoutEl(root)
  if (prop === 'pad') {
    // p-N becomes px-N so only the vertical padding changes
    setCls(root, /^p-/, '')
    const p = (root.getAttribute('class') || '').match(/(?:^|\s)p-(\S+)/)
    setCls(root, /^(py|pt|pb)-/, `py-${v}${p ? ` px-${p[1]}` : ''}`)
  }
  if (prop === 'gap') setCls(lay, /^gap-/, `gap-${v}`)
  if (prop === 'dir') {
    const grid = v.startsWith('grid')
    setCls(lay, /^(flex|inline-flex|grid|flex-row|flex-col|flex-row-reverse|flex-col-reverse|grid-cols-\S+)$/, grid ? `grid grid-cols-${v.slice(5)}` : `flex flex-${v}`)
  }
  if (prop === 'align') setCls(lay, /^items-/, `items-${v}`)
  if (prop === 'bg') setCls(root, /^bg-(\[(var|#)|white|black|transparent|[a-z]+-\d{2,3})/, v === 'none' ? '' : `bg-[var(--${v})]`)
  if (prop === 'hsize') {
    const h = root.querySelector('h1, h2, h3') || [...root.querySelectorAll('[class*="text-"]')].sort((a, b) => sizeOf(b) - sizeOf(a))[0]
    setCls(h, SIZE_RE, `text-${v}`)
  }
  if (prop === 'radius') {
    for (const el of [root, ...root.querySelectorAll('[class*="rounded"]')]) {
      if (!/rounded/.test(el.getAttribute('class') || '')) continue
      setCls(el, /^rounded(-.*)?$/, v === 'theme' ? 'rounded-[var(--radius)]' : v === '' ? 'rounded' : `rounded-${v}`)
    }
  }
  l.text = doc.body.innerHTML
  l.ver++
}
const sizeOf = el => Math.max(0, ...(el.getAttribute('class') || '').split(/\s+/).map(t => TW_SIZE[(t.split(':').pop().match(SIZE_RE) || [])[1]] || 0))

function applyEdit(e) {
  if (!e.id || S.edits.has(e.id)) return
  S.edits.add(e.id)
  const t = S.theme
  if (e.kind === 'var' && t) t.vars = { ...t.vars, [e.name]: e.value }
  if (e.kind === 'font' && t) { t.fonts = { ...t.fonts, [e.role]: e.value }; loadThemeFonts(t) }
  if (e.kind === 'radius' && t) t.radius = e.value
  if (['var', 'font', 'radius'].includes(e.kind)) { S.frames.forEach(applyTheme); if (t) renderTheme() }
  if (e.kind === 'size' || e.kind === 'scale') {
    S.classEdits.push(e)
    for (const l of S.layers.values()) restyle(l, e)
  }
  if (e.kind === 'section') { const l = S.layers.get(e.layer); if (l?.status === 'done') editSection(l, e.prop, e.value) }
  design.last = design.lastVars = ''
  design.varsAt = 0
  if (e.by && e.by !== CLIENT && live(e)) feed(null, `Someone else edited the design: ${describeEdit(e)}`, 'sys')
}

function describeEdit(e) {
  return {
    var: () => `${e.name.slice(2)} → ${e.value}`,
    font: () => `${e.role} font → ${e.value}`,
    radius: () => `radius → ${e.value}`,
    size: () => `every text-${e.from} → text-${e.value}`,
    scale: () => `${e.axis === 'type' ? 'type scale' : 'spacing'} ${Number(e.value) > 0 ? 'up' : 'down'} a step`,
    section: () => `${S.layers.get(e.layer)?.role || e.layer}: ${e.prop} → ${e.value}`
  }[e.kind]?.() || e.kind
}

const REACT = {
  var: e => [`ooh, new ${e.name.slice(2)}. matching it`, `${e.value}? bold. I like it`, 'colour change! repainting my bit', 'ok that token just got better'],
  font: e => [`${e.value}, nice pick`, `switching to ${e.value} 👌`, 'new font, who dis'],
  radius: () => ['softer corners, noted', 'rounding everything off', 'corner police approve'],
  size: () => ['type scale changed, adjusting', 'bigger text, love it', 'noted, using the new size'],
  scale: e => [e.axis === 'type' ? 'headings got louder 📣' : 'more breathing room, nice', 'whole system shifted, on it', 'scale change! everyone re-check your sections'],
  section: () => ['hey, that\'s my section 👀', 'oh nice tweak', 'ok fine, that does look better']
}

// A person's edit: apply it here, save it, and let an agent react.
async function commitEdit(edit) {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  if (!run) return
  const e = { ...edit, id: `${CLIENT}${Date.now().toString(36)}`, by: CLIENT, t: Date.now() }
  applyEdit(e)
  feed(null, `You edited the design: ${describeEdit(e)}`, 'sys')
  const owner = e.kind === 'section' && S.agents.get(S.layers.get(e.layer)?.agent)
  const a = owner || pick([...S.agents.values()].filter(x => x.layer) .concat([...S.agents.values()]))
  if (a) setTimeout(() => say(a, pick(REACT[e.kind](e))), 500)
  const res = await api(`/api/runs/${encodeURIComponent(run)}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) }).catch(() => null)
  if (!res?.ok) feed(null, 'That edit is shown here but could not be saved with the file.', 'err')
}

// One small menu for every editable value, Figma style.
const picker = { el: null }
function openPicker(anchor, options, current, onPick) {
  closePicker()
  const el = document.createElement('div')
  el.className = 'dpick'
  for (const o of options) {
    const b = document.createElement('button')
    b.className = o.value === current ? 'on' : ''
    b.innerHTML = `${o.swatch ? `<span class="sw" style="background:${esc(o.swatch)}"></span>` : ''}<span style="${o.style || ''}">${esc(o.label)}</span>${o.note ? `<small>${esc(o.note)}</small>` : ''}`
    b.onclick = ev => { ev.stopPropagation(); closePicker(); if (o.value !== current) onPick(o.value) }
    el.append(b)
  }
  document.body.append(el)
  const r = anchor.getBoundingClientRect()
  el.style.left = `${Math.max(8, Math.min(innerWidth - 228, r.left))}px`
  el.style.top = `${Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 8)}px`
  picker.el = el
}
function closePicker() { picker.el?.remove(); picker.el = null }
document.addEventListener('mousedown', e => { if (picker.el && !picker.el.contains(e.target)) closePicker() })
window.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker() })

const px = v => `${space(v)}px`
const SECTION_OPTIONS = {
  pad: () => ['0', '4', '8', '12', '16', '20', '24', '32'].map(v => ({ value: v, label: `${px(v)} top & bottom` })),
  gap: () => ['0', '2', '4', '6', '8', '10', '12', '16'].map(v => ({ value: v, label: px(v) })),
  dir: () => [['col', '↓ Vertical'], ['row', '→ Horizontal'], ['grid-2', '▦ Grid · 2 cols'], ['grid-3', '▦ Grid · 3 cols'], ['grid-4', '▦ Grid · 4 cols']].map(([value, label]) => ({ value, label })),
  align: () => ['start', 'center', 'end', 'stretch'].map(v => ({ value: v, label: v })),
  bg: () => [{ value: 'none', label: 'no fill' }, ...Object.entries(S.theme?.vars || {}).map(([k, v]) => ({ value: k.slice(2), label: k.slice(2), swatch: v }))],
  hsize: () => ['2xl', '3xl', '4xl', '5xl', '6xl', '7xl'].map(v => ({ value: v, label: `${TW_SIZE[v]}px`, note: `text-${v}` })),
  radius: () => [['none', 'square'], ['md', '6px'], ['xl', '12px'], ['2xl', '16px'], ['3xl', '24px'], ['full', 'pill'], ['theme', `theme radius · ${S.theme?.radius || ''}`]].map(([value, label]) => ({ value, label }))
}

els.dDesign.addEventListener('click', e => {
  const v = e.target.closest('[data-edit]')
  const l = design.layer && S.layers.get(design.layer)
  if (!v || !l || l.status !== 'done') return
  const prop = v.dataset.edit
  openPicker(v, SECTION_OPTIONS[prop](), null, value => commitEdit({ kind: 'section', layer: l.key, prop, value }))
})

const colorInput = Object.assign(document.createElement('input'), { type: 'color', className: 'dcolor' })
document.body.append(colorInput)
let colorEdit = null
colorInput.addEventListener('input', () => {
  // preview while dragging in the colour picker, save when it settles
  if (!colorEdit || !S.theme) return
  S.theme.vars = { ...S.theme.vars, [colorEdit]: colorInput.value }
  S.frames.forEach(applyTheme)
  clearTimeout(colorInput.timer)
  colorInput.timer = setTimeout(() => commitEdit({ kind: 'var', name: colorEdit, value: colorInput.value }), 450)
})

els.dVars.addEventListener('click', e => {
  const t = S.theme
  if (!t || !S.run) return
  const el = e.target.closest('[data-var], [data-font], [data-radius], [data-size], [data-scale]')
  if (!el) return
  if (el.dataset.var) {
    colorEdit = el.dataset.var
    const v = t.vars[colorEdit] || '#000000'
    colorInput.value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'
    const r = el.getBoundingClientRect()
    colorInput.style.left = `${r.left}px`
    colorInput.style.top = `${r.bottom}px`
    colorInput.showPicker ? colorInput.showPicker() : colorInput.click()
  } else if (el.dataset.font) {
    const role = el.dataset.font
    loadPickerFonts()
    openPicker(el, FONTS.map(f => ({ value: f, label: f, style: `font-family:'${f}';font-size:14px` })), t.fonts?.[role], value => commitEdit({ kind: 'font', role, value }))
  } else if (el.dataset.radius !== undefined) {
    openPicker(el, ['0px', '4px', '8px', '12px', '16px', '24px', '999px'].map(v => ({ value: v, label: v === '999px' ? 'pill' : v })), t.radius, value => commitEdit({ kind: 'radius', value }))
  } else if (el.dataset.size) {
    const from = el.dataset.size
    openPicker(el, SIZES.filter(k => k !== from).map(k => ({ value: k, label: `${TW_SIZE[k]}px`, note: `text-${k}` })), null, value => commitEdit({ kind: 'size', from, value }))
  } else if (el.dataset.scale) {
    const [axis, value] = el.dataset.scale.split(':')
    commitEdit({ kind: 'scale', axis, value })
  }
})

function loadPickerFonts() {
  if ($('#picker-fonts')) return
  const link = Object.assign(document.createElement('link'), { id: 'picker-fonts', rel: 'stylesheet' })
  link.href = `https://fonts.googleapis.com/css2?${FONTS.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')}&display=swap`
  document.head.append(link)
}

// Click a section on the canvas to select it; click empty canvas to let go.
function selectAt(f, x, y) {
  const hit = Object.entries(f.geo.slots).find(([, g]) => { const [l, t, w, h] = g.box; return x >= l && x <= l + w && y >= t && y <= t + h })
  S.sel = hit ? hit[0] : null
  if (cmt.mode && S.sel) { cmt.mode = false; cmt.open = S.sel; toolbarKey = ''; els.viewport.classList.remove('commenting') }
  else if (cmt.open !== S.sel) cmt.open = null
  design.pinned = null
  if (S.sel && design.tab !== 'design') { design.tabPinned = true; showDtab('design') }
  design.last = ''
}

function drawSelBox() {
  let box = $('#selbox')
  const l = S.sel && S.layers.get(S.sel)
  const s = l && slotFor(l)
  if (!s) { if (box && !box.hidden) box.hidden = true; return }
  if (!box) { box = Object.assign(document.createElement('div'), { id: 'selbox', className: 'selbox' }); $('#ghosts').append(box) }
  if (box.hidden) box.hidden = false
  Object.assign(box.style, { left: `${s.f.x + s.box.left}px`, top: `${s.box.top}px`, width: `${s.box.width}px`, height: `${s.box.height}px`, borderWidth: `${2 / cam.s}px` })
}

// ---------- export: HTML, React + Tailwind, and the ABA handoff
const exp = { busy: false, el: null }

async function exportRunNow() {
  const run = shownRun()
  if (!run || exp.busy) return
  exp.busy = true
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections }) }).catch(() => null)
  exp.busy = false
  const out = await res?.json().catch(() => ({}))
  if (!res?.ok) feed(null, `export: ${out?.error || 'the canvas server is not answering'}`, 'err')
}

function showExport(e) {
  exp.el?.remove()
  exp.el = document.createElement('div')
  exp.el.className = 'export-pop'
  const zip = `/api/runs/${encodeURIComponent(e.run)}/export.zip?k=${encodeURIComponent(BOOT.token || '')}`
  exp.el.innerHTML = `<div class="vhead">⬇ Exported<button class="vclose" title="Close">×</button></div>
    <div class="xrow"><b>html/</b><span>${e.pages} pages, open index.html</span></div>
    <div class="xrow"><b>react/</b><span>${e.sections} section components · Vite + Tailwind · <code>npm i && npm run dev</code></span></div>
    <div class="xrow"><b>aba/</b><span>spec.md + blueprint.json for an app builder</span></div>
    <div class="xpath" title="${esc(e.dir)}">${esc(e.dir)}</div>
    <div class="vfoot"><span></span>${e.zip ? `<a class="vagain" href="${zip}" download>Download .zip</a>` : ''}</div>`
  document.body.append(exp.el)
  exp.el.querySelector('.vclose').onclick = () => { exp.el.remove(); exp.el = null }
  feed(null, `⬇ exported ${e.pages} pages to ${e.dir}`, 'sys')
}

els.exportBtn.onclick = () => exportRunNow()
commandOps.export = () => exportRunNow()

// ---------- publish: a live link on GitHub Pages (the person's gh login), or this computer
const pub = { run: null, state: 'none', stage: '', target: 'github', el: null, hosts: undefined }
const PUB_STAGES = {
  github: { export: 'Exporting the pages', repo: 'Making the GitHub repo', push: 'Pushing the site', pages: 'Turning on GitHub Pages', building: 'GitHub is building it' },
  vercel: { export: 'Exporting the pages', project: 'Setting up the Vercel project', upload: 'Uploading the files', building: 'Vercel is deploying it' },
  cloudflare: { export: 'Exporting the pages', project: 'Setting up the Pages project', upload: 'Uploading the files', building: 'Cloudflare is going live' },
}

function pubPop(html) {
  pub.el?.remove()
  pub.el = document.createElement('div')
  pub.el.className = 'export-pop publish-pop'
  pub.el.innerHTML = `<div class="vhead">🌐 Publish<button class="vclose" title="Close">×</button></div>${html}`
  document.body.append(pub.el)
  pub.el.querySelector('.vclose').onclick = () => { pub.el.remove(); pub.el = null }
  return pub.el
}

const HOSTS = {
  github: { label: 'GitHub Pages', how: who => `A public link anyone can open: ${esc(who)}.github.io/… · about a minute`, off: 'Sign in with <code>gh auth login</code> to get a public link' },
  vercel: { label: 'Vercel', how: who => `Your Vercel (${esc(who)}): a …vercel.app link · under a minute`, token: 'Create a token at vercel.com/account/tokens, then paste it here' },
  cloudflare: { label: 'Cloudflare Pages', how: who => `Your Cloudflare (${esc(who)}): a …pages.dev link · under a minute`, token: 'Create a token with Account → Cloudflare Pages → Edit, then paste it here' },
}

async function publishMenu(force) {
  if (pub.hosts === undefined || force) {
    if (!pub.el) pubPop('<div class="pstage">Checking where you are signed in…</div>')
    const res = await api('/api/publish').catch(() => null)
    pub.hosts = (await res?.json().catch(() => null)) || {}
  }
  const h = pub.hosts
  const who = id => (id === 'github' ? h.github : h[id]?.user)
  const row = id => {
    const x = HOSTS[id], u = who(id)
    if (u || id === 'github') return `<div class="prow"><button class="popt" data-target="${id}"${u ? '' : ' disabled'}><b>${x.label}</b><span>${u ? x.how(u) : x.off}${h[id]?.via === 'octo' ? ` · through your Octo vault${h[id].item ? ` (${esc(h[id].item)})` : ''}` : ''}</span></button>${u && id !== 'github' && !h[id]?.env ? `<button class="pdisc" data-disc="${id}" title="Disconnect ${x.label}">×</button>` : ''}</div>`
    const url = h.providers?.[id]?.tokenUrl || '#'
    return `<details class="pconn"><summary><b>Connect ${x.label}</b><span>${x.token.replace(/vercel\.com\/account\/tokens|a token/, m => `<a href="${esc(url)}" target="_blank" rel="noopener">${m}</a>`)}</span></summary>
      <form data-conn="${id}"><input type="password" autocomplete="off" spellcheck="false" placeholder="${x.label} token, or an Octo vault grant"><button>Connect</button></form><div class="phint">An Octo vault grant (octo_vault_…) keeps the token in your vault: Swarm Studio stores only a working key that can reach ${x.label} through Octo's relay.</div><div class="perr"></div></details>`
  }
  const el = pubPop(`${['github', 'vercel', 'cloudflare'].map(row).join('')}
    <div class="prow"><button class="popt" data-target="local"><b>This computer</b><span>Hosted by Swarm Studio at 127.0.0.1 · instant, only you can open it</span></button></div>`)
  el.querySelectorAll('.popt').forEach(b => { b.onclick = () => publishNow(b.dataset.target) })
  el.querySelectorAll('[data-disc]').forEach(b => {
    b.onclick = async () => {
      await api('/api/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: b.dataset.disc }) }).catch(() => null)
      publishMenu(true)
    }
  })
  el.querySelectorAll('form[data-conn]').forEach(f => {
    f.onsubmit = async ev => {
      ev.preventDefault()
      const input = f.querySelector('input'), err = f.parentElement.querySelector('.perr')
      if (!input.value.trim()) return
      f.querySelector('button').textContent = 'Checking…'
      const res = await api('/api/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: f.dataset.conn, token: input.value.trim() }) }).catch(() => null)
      input.value = ''
      const out = await res?.json().catch(() => ({}))
      if (res?.ok) return publishMenu(true)
      f.querySelector('button').textContent = 'Connect'
      err.textContent = out?.error || 'the canvas server is not answering'
    }
  })
}

async function publishNow(target = 'github') {
  const run = shownRun()
  if (!run) return
  Object.assign(pub, { run, state: 'working', stage: 'export', target })
  pubPop('<div class="pstage">Exporting the pages…</div>')
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, sections }) }).catch(() => null)
  if (!res?.ok) {
    pub.state = 'none'
    const out = await res?.json().catch(() => ({}))
    pubPop(`<div class="pstage err">${esc(out?.error || 'the canvas server is not answering')}</div>`)
  }
}

function publishEvent(e) {
  if (e.run !== shownRun()) return
  const fresh = !e.t || Date.now() - e.t < 8000
  pub.run = e.run
  if (e.type === 'publish:start' || e.type === 'publish:stage') {
    if (!fresh) return
    Object.assign(pub, { state: 'working', stage: e.stage || 'export', target: e.target || pub.target })
    const names = PUB_STAGES[pub.target]
    if (!names) return
    const steps = Object.keys(names), at = steps.indexOf(pub.stage)
    pubPop(`<div class="psteps">${steps.map((k, i) => `<div class="${i < at ? 'did' : i === at ? 'now' : ''}">${i < at ? '✓' : i === at ? '◌' : '·'} ${names[k]}</div>`).join('')}</div>`)
    return
  }
  Object.assign(pub, { state: 'done', url: e.url })
  if (!fresh) return
  const el = pubPop(`
    <div class="plink"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace(/^https?:\/\//, ''))}</a></div>
    <div class="xrow"><b>${e.target === 'local' ? 'Local' : HOSTS[e.target]?.label.split(' ')[0]}</b><span>${e.target === 'local' ? `${e.pages} pages hosted by Swarm Studio on this computer` : `${e.pages} pages live on ${HOSTS[e.target]?.label} · ${esc(String(e.repo || '').replace(/^\w+:/, ''))}${e.pending ? ' · still going live, give it a minute' : ''}`}</span></div>
    ${e.fallback ? `<div class="pstage err">${HOSTS[e.tried]?.label || 'Publishing'} didn't work: ${esc(e.fallback)}</div>` : ''}
    <div class="vfoot"><button class="vagain pcopy">Copy link</button><a class="vagain" href="${esc(e.url)}" target="_blank" rel="noopener">Open ↗</a></div>`)
  el.querySelector('.pcopy').onclick = ev => { navigator.clipboard?.writeText(e.url).catch(() => {}); ev.target.textContent = 'Copied' }
  feed(null, `🌐 published ${e.pages} pages: ${e.url}`, 'sys')
}

els.publishBtn.onclick = () => publishMenu()
commandOps.publish = c => publishNow(['local', 'vercel', 'cloudflare'].includes(c.target) ? c.target : 'github')

// ---------- comments: tell an agent what to change
// A 💬 pin sits on the selected section; open, it is a little composer. The
// Comment tool in the toolbar arms it: the next section clicked opens it. A
// comment with no section (from /swarm fix) is routed by the planner.
const cmt = { mode: false, open: null, el: null, key: '' }

function drawComment() {
  const l = S.sel && S.layers.get(S.sel)
  const box = $('#selbox')
  if (!l || l.status !== 'done' || !box || box.hidden) {
    if (cmt.el) { cmt.el.remove(); cmt.el = null; cmt.key = '' }
    return
  }
  const open = cmt.open === S.sel
  const want = `${S.sel}|${open}`
  if (cmt.key !== want) {
    cmt.el?.remove()
    cmt.key = want
    cmt.el = document.createElement('div')
    cmt.el.className = `cbox${open ? ' open' : ''}`
    cmt.el.innerHTML = open
      ? `<textarea rows="2" placeholder="Tell an agent what to change in ${esc(l.role || l.id)}…"></textarea><div class="crow"><small>Enter to send · Esc to close</small><button>Send</button></div>`
      : '<button class="cpin" title="Comment: tell an agent what to change here">💬</button>'
    document.body.append(cmt.el)
    if (open) {
      const ta = cmt.el.querySelector('textarea')
      const send = () => { const t = ta.value.trim(); if (t) { sendComment(t, S.sel); cmt.open = null } }
      ta.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
        if (e.key === 'Escape') { e.stopPropagation(); cmt.open = null }
      }
      cmt.el.querySelector('button').onclick = send
      setTimeout(() => ta.focus(), 0)
    } else cmt.el.querySelector('.cpin').onclick = () => { cmt.open = S.sel }
  }
  const r = box.getBoundingClientRect(), vr = els.viewport.getBoundingClientRect()
  const w = open ? 320 : 34
  const x = Math.min(vr.right - w - 8, Math.max(vr.left + 8, r.right - w))
  const y = Math.min(vr.bottom - 110, Math.max(vr.top + 8, r.top + 8))
  cmt.el.style.transform = `translate(${x | 0}px, ${y | 0}px)`
}

async function sendComment(text, target = null) {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  if (!run) return feed(null, 'Open a build first.', 'err')
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, role: l.role, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, target, sections }) }).catch(() => null)
  if (!res?.ok) {
    const out = await res?.json().catch(() => ({}))
    if (!/which section/.test(out?.error || '')) feed(null, `comment: ${out?.error || 'the canvas server is not answering'}`, 'err')
  }
}

commandOps.fix = c => {
  const l = S.sel && S.layers.get(S.sel)
  sendComment(c.text || '', l?.status === 'done' ? S.sel : null)
}

els.toolbar.addEventListener('click', e => {
  if (e.target.closest('[data-tool]')?.dataset.tool !== 'comment') return
  if (S.sel && S.layers.get(S.sel)?.status === 'done') { cmt.open = S.sel; return }
  cmt.mode = !cmt.mode
  toolbarKey = ''
  els.viewport.classList.toggle('commenting', cmt.mode)
  if (cmt.mode) feed(null, '💬 Click a section to comment on it.', 'sys')
})

// ---------- generated images
// Builders leave <img data-gen="…"> without a src; the server paints each one with
// a Hermes image provider and sends its file, which goes into the section here.

// Until a photo arrives, its spot shows a pencil sketch in the theme's colours,
// different for every description, so a page looks finished from the start.
function sketch(desc) {
  const v = S.theme?.vars || {}
  const c = n => esc(v[`--${n}`] || { muted: '#e9e4dc', card: '#faf8f4', accent: '#c96', primary: '#333', 'muted-foreground': '#888' }[n])
  let h = 0
  for (const ch of desc) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const r = n => ((h = (h * 1103515245 + 12345) >>> 0) % 1000) / 1000 * n
  const kind = h % 3
  const pen = `fill="none" stroke="${c('primary')}" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="7 4"`
  const sun = `<circle cx="${290 + r(60)}" cy="${70 + r(30)}" r="${22 + r(14)}" fill="${c('accent')}" fill-opacity=".35"/>`
  const shapes = kind === 0
    ? `${sun}<path d="M0 ${210 + r(20)} L${80 + r(40)} ${130 + r(30)} L${170 + r(30)} ${200} L${250 + r(30)} ${120 + r(30)} L400 ${215}" ${pen}/><path d="M0 250 Q100 ${225 + r(15)} 200 245 T400 240" ${pen}/>`
    : kind === 1
      ? `${sun}<rect x="${70 + r(30)}" y="${110 + r(20)}" width="${110 + r(40)}" height="${90 + r(30)}" rx="10" ${pen}/><circle cx="${270 + r(30)}" cy="${170 + r(20)}" r="${40 + r(15)}" ${pen}/>`
      : `<path d="M${40 + r(30)} 230 C${90 + r(30)} ${90 + r(40)}, ${230 + r(30)} ${90 + r(40)}, ${330 + r(30)} 230" ${pen}/><circle cx="${200 + r(30)}" cy="${120 + r(20)}" r="${30 + r(12)}" fill="${c('accent')}" fill-opacity=".3"/>`
  const label = esc(desc.length > 26 ? `${desc.slice(0, 25)}…` : desc)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${c('muted')}"/><stop offset="1" stop-color="${c('card')}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>${shapes}<text x="200" y="282" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="${c('muted-foreground')}">painting · ${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function fillImages(l) {
  if (l.status !== 'done' || !/data-gen=/.test(l.text)) return
  const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
  let changed = false
  for (const img of doc.body.querySelectorAll('img[data-gen]')) {
    const gen = img.getAttribute('data-gen')
    const src = S.images.get(`${l.key}|${gen}`)
    if (src === undefined || src === '') {
      // waiting, or the photo failed: the sketch stays
      if (!img.getAttribute('src')) { img.setAttribute('src', sketch(gen)); img.setAttribute('data-sketch', ''); changed = true }
      continue
    }
    if (img.getAttribute('src') !== src) { img.setAttribute('src', src); img.removeAttribute('data-sketch'); changed = true }
  }
  if (changed) { l.text = doc.body.innerHTML; l.ver++ }
}

// ---------- visual review
// After a build, each page is photographed in its own frame and sent to the
// reviewer (a vision model). Its notes go to builders, who rewrite those sections live.

const review = { busy: false, seq: 0, waits: new Map(), auto: null }
const frameTitle = id => S.frames.find(f => f.id === id)?.title || id
const reviewerOn = () => !!modelsInfo.roles?.reviewer?.model

function scanFrame(page, on) {
  const f = S.frames.find(fr => fr.id === page)
  if (f?.ready) post(f, { type: 'scan', on })
}

function snapFrame(f, scale) {
  return new Promise((resolve, reject) => {
    const seq = ++review.seq
    review.waits.set(seq, { resolve, reject })
    post(f, { type: 'snap', seq, scale })
    setTimeout(() => { if (review.waits.delete(seq)) reject(new Error('the screenshot timed out')) }, 30000)
  })
}

// A page measured the way a visitor sees it, at a given width: a hidden copy of
// it reports which floated text panels cover other text and, if asked, a
// screenshot. The reviewer only ever saw the 1280px canvas frame before.
const checks = new Map()
function checkPage(id, width, snap) {
  const seq = `c${++review.seq}`
  const script = `<script>addEventListener('load', async () => {
  if (document.fonts) await document.fonts.ready
  await new Promise(r => setTimeout(r, 900))
  const guard = ${BOOT.guard || '() => []'}
  const out = { type: 'check', seq: ${JSON.stringify(seq)}, overlaps: guard(document.body, true), broken: [] }
  // a tag a builder left half-written: its stray words end up as attribute names
  for (const el of document.body.querySelectorAll('*')) for (const a of [...el.attributes]) if (!/^[A-Za-z_:][\\w.:-]*$/.test(a.name)) {
    const layer = el.closest('[data-layer]')?.dataset.layer
    if (layer && !out.broken.some(b => b.layer === layer)) out.broken.push({ layer, tag: el.tagName.toLowerCase(), junk: a.name.slice(0, 40) })
    el.removeAttribute(a.name)
  }
  // a phone page is long and narrow: shot at full size, the top 4200px, so the text stays readable
  const full = document.body.scrollHeight, h = Math.min(full, 4200), r = 1
  out.r = r
  out.sections = [...document.body.children].filter(e => e.dataset.layer).map(e => { const b = e.getBoundingClientRect(); return { layer: e.dataset.layer, top: Math.round(b.top + scrollY), height: Math.round(b.height) } }).filter(x => x.top < h)
  if (${!!snap}) try {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'; s.onload = ok; s.onerror = fail; document.head.append(s) })
    const opts = { width: ${width}, height: h, pixelRatio: r, quality: 0.72, backgroundColor: getComputedStyle(document.body).backgroundColor }
    out.image = await htmlToImage.toJpeg(document.body, opts).catch(() => htmlToImage.toJpeg(document.body, { ...opts, skipFonts: true }))
  } catch (err) { out.snapError = String(err && err.message || err) }
  parent.postMessage(out, '*')
})<\/script>`
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:900px;border:0;pointer-events:none`
  return new Promise(resolve => {
    const done = data => { clearTimeout(timer); checks.delete(seq); iframe.remove(); resolve(data) }
    const timer = setTimeout(() => done(null), 30000)
    checks.set(seq, { iframe, done })
    iframe.srcdoc = pageDoc(id, script)
    document.body.append(iframe)
  })
}

// A section's layer id in a page, as its key: the page's own, else the shared one.
const layerKey = (page, id) => S.layers.has(key(page, id)) ? key(page, id) : key('*', id)

async function reviewRun() {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  if (!run || review.busy) return
  review.busy = true
  try {
    for (const [i, f] of S.frames.entries()) {
      if (f.frozen) thaw(f)
      // a page waking from rest needs its sections drawn before the photo, or the reviewer sees a blank page
      for (let t = 0; t < 60 && !(f.ready && f.slots.size && f.geo.height > 400); t++) await new Promise(r => setTimeout(r, 200))
      await new Promise(r => setTimeout(r, 1200))
      if (!f.ready) continue
      const shot = await snapFrame(f)
      // the shared nav and footer are reviewed once, on the first page
      const sections = [...f.slots.keys()].map(k => S.layers.get(k))
        .filter(l => l && l.status === 'done' && l.text.trim() && (l.page !== '*' || i === 0) && f.geo.slots[l.key])
        .map(l => {
          const b = f.geo.slots[l.key].box
          return { key: l.key, role: l.role, top: Math.round(b[1] * shot.r), height: Math.round(b[3] * shot.r), html: l.text }
        })
        .sort((a, b) => a.top - b.top)
      if (!sections.length) continue
      // measured, at desktop and phone width, one after the other to spare memory
      const desk = await checkPage(f.id, 1280, false)
      const phone = await checkPage(f.id, 390, true)
      const measured = []
      for (const [w, c] of [[1280, desk], [390, phone]]) for (const o of c?.overlaps || []) {
        if (!o.layer) continue
        measured.push({ section: layerKey(f.id, o.layer), problem: `At ${w}px wide, the floated panel “${o.panel}” sits on top of “${o.covers}”`, fix: 'Take that panel out of absolute positioning: put it beside or below the map or picture in the normal flow. Keep absolute only for small pins, badges and decoration.' })
      }
      for (const b of desk?.broken || []) measured.push({ section: layerKey(f.id, b.layer), problem: `Broken markup: a <${b.tag}> tag is half-written (stray “${b.junk}” inside it), and stray text may show on the page`, fix: 'Rewrite the section as clean, complete HTML: every tag closed, no notes or instructions as visible text.' })
      if (!phone?.image) feed(null, `📱 couldn't photograph ${f.title} at phone width${phone?.snapError ? `: ${phone.snapError}` : ''}; reviewing desktop only`, 'err')
      if (measured.length) feed(null, `📐 measured ${measured.length} layout problem${measured.length > 1 ? 's' : ''} on ${f.title} (desktop and phone)`, 'sys')
      const byKey = new Map(sections.map(x => [x.key, x]))
      const mobile = phone?.image ? { image: phone.image, sections: phone.sections.map(x => ({ ...byKey.get(layerKey(f.id, x.layer)), top: x.top, height: x.height })).filter(x => x.key) } : null
      const res = await api(`/api/runs/${encodeURIComponent(run)}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: f.id, title: f.title, image: shot.image, sections, measured, mobile })
      })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        scanFrame(f.id, false)
        feed(null, `review: ${out.error || `HTTP ${res.status}`}`, 'err')
        if (/no reviewer|no such run/.test(out.error || '')) break
      }
    }
  } catch (err) {
    feed(null, `review: ${err.message || err}`, 'err')
  }
  review.busy = false
}

// A live build is reviewed once it is finished and its images have arrived.
function autoReview() {
  if (!reviewerOn() || review.auto === S.run) return
  const run = review.auto = S.run
  const t0 = performance.now()
  const tick = () => {
    if (S.run !== run || viewing) return
    if (S.imgSettled < S.imgQueued && performance.now() - t0 < 150000) return setTimeout(tick, 1500)
    // let the last images load and the frames settle before the photo
    setTimeout(() => S.run === run && !viewing && reviewRun(), 2500)
  }
  tick()
}

els.reviewBtn.onclick = () => reviewRun()

// ---------- promo video
// The planner storyboards the build into a few scenes, each handed to an agent,
// and HyperFrames renders them in the site's theme. The panel shows the
// storyboard, the render, then the video.
const video = { run: null, busy: false, pct: 0, stage: '', story: [], src: '', file: '', message: '', el: null }
const shownRun = () => (viewing && viewing !== 'new' ? viewing : S.run)

function videoEvent(e) {
  if (video.run !== e.run) Object.assign(video, { run: e.run, busy: false, pct: 0, stage: '', story: [], src: '', file: '', message: '' })
  const fresh = !e.t || Date.now() - e.t < 8000 // a replayed file shows its video quietly
  if (e.type === 'video:start') {
    Object.assign(video, { busy: true, pct: 0, stage: 'storyboard', story: [], src: '', message: '' })
    if (fresh) feed(null, `🎬 ${e.model || 'the planner'} is storyboarding a promo video`, 'sys')
  } else if (e.type === 'video:story') {
    video.story = e.scenes
    if (fresh) e.scenes.forEach((sc, i) => setTimeout(() => feed(S.agents.get(sc.agent), `scene ${i + 1} · ${sc.kind}: “${sc.headline}”`, ''), i * 350))
    if (fresh && e.cast?.narrator) feed(null, `🎙 cast for the theme: ${e.cast.narrator}${e.cast.second ? ` with ${e.cast.second}` : ''} reading, ${e.music || 'matching'} music`, 'sys')
  } else if (e.type === 'video:progress') {
    Object.assign(video, { busy: true, pct: e.pct, stage: e.stage })
  } else if (e.type === 'video:done') {
    Object.assign(video, { busy: false, pct: 100, src: e.src, file: e.file, stage: 'done' })
    if (fresh) feed(null, `🎬 promo video ready (${Math.round(e.seconds)}s${e.voice ? ', with voiceover' : ''}${e.music ? ', with music' : ''}, made in ${Math.round(e.ms / 1000)}s)`, 'sys')
  } else if (e.type === 'video:note') {
    if (fresh) feed(null, `🎬 ${e.message}`, 'err')
  } else if (e.type === 'video:failed') {
    Object.assign(video, { busy: false, message: e.message, stage: 'failed' })
    if (fresh) feed(null, `🎬 video: ${e.message}`, 'err')
  }
  if (fresh && !video.el && e.type !== 'video:progress') toggleVideo(true)
  renderVideo()
}

function renderVideo() {
  const el = video.el
  if (!el) return
  const stage = { storyboard: 'Writing the storyboard…', rendering: 'Rendering frames in headless Chrome…', assembling: 'Encoding the MP4…', 'recording the voiceover': 'Kokoro is reading the voiceover…', 'mixing the sound': 'Mixing the music and the voice…' }[video.stage] || video.stage
  // progress only moves the bar, so the storyboard cards don't replay their entrance
  const sig = JSON.stringify([video.run, video.story.length, video.busy, video.src, video.message])
  if (el.dataset.sig === sig) {
    const bar = el.querySelector('.vbar i'), txt = el.querySelector('.vstage')
    if (bar) bar.style.width = `${Math.max(3, video.pct)}%`
    if (txt && video.busy) setText(txt, `${stage}${video.pct ? ` ${video.pct | 0}%` : ''}`)
    return
  }
  el.dataset.sig = sig
  const story = video.story.map((sc, i) => {
    const a = S.agents.get(sc.agent)
    return `<div class="vscene" style="--c:${a?.color || '#888'}">${sc.image ? `<img src="${esc(sc.image)}" alt="">` : `<span class="vkind">${esc(sc.kind)}</span>`}<b>${i + 1}. ${esc(sc.headline)}</b><small>${esc(a?.name || '')} · ${esc(sc.kind)}</small></div>`
  }).join('')
  const opts = `<div class="vopts"><label>Voice <select class="vvoice">${VOICE_OPTS.map(([v, l]) => `<option value="${v}" ${videoOpts.voice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label><input type="checkbox" class="vmusic" ${videoOpts.music ? 'checked' : ''}> Music</label></div>`
  const body = video.src && !video.busy
    ? `<video src="${esc(video.src)}" controls autoplay playsinline></video><div class="vfoot"><span title="${esc(video.file)}">Saved with the build: video/promo.mp4</span><span class="vacts"><a class="vdl" href="${esc(video.src)}" download="promo.mp4">Download</a><button class="vreveal">Show in Finder</button><button class="vbig" title="Fill the whole pane (Esc to leave)">⛶ Big screen</button></span></div>${opts}<div class="vfoot"><span></span><button class="vagain">Make a new cut</button></div>`
    : video.busy
      ? `<div class="vbar"><i style="width:${Math.max(3, video.pct)}%"></i></div><div class="vstage">${esc(stage)}${video.pct ? ` ${video.pct | 0}%` : ''}</div>`
      : video.message
        ? `<div class="vstage err">${esc(video.message)}</div><div class="vfoot"><span></span><button class="vagain">Try again</button></div>`
        : `<div class="vstage">A short promo of this build: the planner writes the storyboard and a voiceover from your pages and pictures, HyperFrames renders it in your theme, and Kokoro reads it over music made for it, all on this machine.</div>${opts}<div class="vfoot"><span></span><button class="vagain">Make the video</button></div>`
  el.innerHTML = `<div class="vhead">🎬 Promo video<button class="vclose" title="Close">×</button></div>${story ? `<div class="vstory">${story}</div>` : ''}${body}`
  el.querySelector('.vclose').onclick = () => toggleVideo(false)
  const again = el.querySelector('.vagain')
  if (again) again.onclick = () => makeVideo()
  const vid = el.querySelector('video')
  // with sound now: play it out loud when the browser allows, muted when it doesn't
  if (vid) vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}) })
  el.querySelector('.vbig')?.addEventListener('click', () => bigScreen(true))
  el.querySelector('.vreveal')?.addEventListener('click', () => api(`/api/runs/${encodeURIComponent(video.run || viewing || S.run)}/reveal?what=video`, { method: 'POST' }))
  el.querySelector('.vvoice')?.addEventListener('change', e => { videoOpts.voice = e.target.value; store.set('videoVoice', videoOpts.voice) })
  el.querySelector('.vmusic')?.addEventListener('change', e => { videoOpts.music = e.target.checked; store.set('videoMusic', videoOpts.music) })
}

// The voiceover: Kokoro, on this machine, in one of its voices; or none.
const VOICE_OPTS = [['', 'Kokoro · fits the theme'], ['af_heart', 'Kokoro · Heart'], ['af_bella', 'Kokoro · Bella'], ['am_michael', 'Kokoro · Michael'], ['bf_emma', 'Kokoro · Emma (UK)'], ['bm_george', 'Kokoro · George (UK)'], ['off', 'No voice']]
const videoOpts = { voice: store.get('videoVoice') ?? '', music: store.get('videoMusic') ?? true }

// The video filling the whole pane (and the screen, where the app allows it).
function bigScreen(on) {
  document.querySelector('.video-big')?.remove()
  if (!on || !video.src) return
  const wrap = document.createElement('div')
  wrap.className = 'video-big'
  wrap.innerHTML = `<video src="${esc(video.src)}" controls autoplay playsinline></video><button class="vbclose" title="Back to the canvas (Esc)">×</button>`
  document.body.append(wrap)
  const v = wrap.querySelector('video')
  const small = video.el?.querySelector('video')
  if (small) { v.currentTime = small.currentTime; small.pause() }
  v.play().catch(() => { v.muted = true; v.play().catch(() => {}) })
  wrap.querySelector('.vbclose').onclick = () => bigScreen(false)
  wrap.requestFullscreen?.().catch(() => {}) // the pane may not allow it; filling the pane is the fallback
  const esc_ = e => { if (e.key === 'Escape' && !document.fullscreenElement) { bigScreen(false); removeEventListener('keydown', esc_) } }
  addEventListener('keydown', esc_)
}

async function makeVideo() {
  const run = shownRun()
  if (!run || video.busy) return
  toggleVideo(true)
  const res = await api(`/api/runs/${encodeURIComponent(run)}/video`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice: videoOpts.voice || undefined, music: videoOpts.music }) })
  if (!res.ok) {
    const out = await res.json().catch(() => ({}))
    Object.assign(video, { run, message: out.error || `HTTP ${res.status}`, busy: false })
    renderVideo()
  }
}

async function toggleVideo(open = !video.el) {
  if (!open) { video.el?.remove(); video.el = null; return }
  if (!video.el) {
    video.el = document.createElement('div')
    video.el.className = 'video-pop'
    document.body.append(video.el)
  }
  const run = shownRun()
  if (run && video.run !== run) {
    // a file opened from disk: ask whether it already has a video
    const st = await api(`/api/runs/${encodeURIComponent(run)}/video`).then(r => r.json()).catch(() => ({}))
    Object.assign(video, { run, busy: st.state === 'working', pct: st.pct || 0, stage: st.stage || '', story: [], src: st.src || '', file: st.file || '', message: st.state === 'failed' ? st.message : '' })
  }
  renderVideo()
}

els.videoBtn.onclick = () => (video.el ? toggleVideo(false) : video.src || video.busy ? toggleVideo(true) : makeVideo())
commandOps.video = () => makeVideo()

// ---------- lite mode
// For machines short on memory: only the page in front of you stays a live
// frame. Every other finished page becomes a flat snapshot and its iframe is
// unloaded; it comes back live as soon as you zoom into it or an agent works on it.

const lite = { last: 0, busy: false, quiet: 0 }
// Auto: on for small machines, and for everyone once the agents have been done
// for half a minute (a finished build doesn't need every page live).
const liteOn = () => (modelsInfo.lite ?? ((navigator.deviceMemory || 8) <= 4 || (S.frames.length > 1 && performance.now() - lite.quiet > 30000)))

const frameSig = f => [...f.slots.keys()].map(k => S.layers.get(k)?.ver || 0).join('.')
const frameBusy = f => S.order.some(k => { const l = S.layers.get(k); return belongs(f, l) && l.status !== 'done' && l.status !== 'failed' })

function freeze(f, image) {
  if (f.frozen) return
  const img = document.createElement('img')
  img.className = 'snap'
  img.src = image
  img.style.height = `${f.h}px`
  f.el.append(img)
  f.iframe.remove()
  f.frozen = { img, sig: frameSig(f) }
  f.ready = false
}

function thaw(f) {
  if (!f.frozen) return
  const iframe = document.createElement('iframe')
  iframe.title = f.title
  iframe.style.height = `${f.h}px`
  if (BOOT.frameHtml) iframe.srcdoc = BOOT.frameHtml
  else iframe.src = 'frame.html'
  f.el.insertBefore(iframe, f.frozen.img)
  // the snapshot stays on top until the live page has been drawn again
  const img = f.frozen.img
  setTimeout(() => img.remove(), 1200)
  f.iframe = iframe
  f.slots.clear()
  // the old page's geometry is gone with it; the new one reports its own
  f.geo = { ...f.geo, height: 0 }
  f.frozen = null
}

async function litePass() {
  if (S.frames.some(frameBusy) || !S.frames.length) lite.quiet = performance.now()
  // Play covers the canvas, so its pages can all rest while you click through
  const playing = !els.player.hidden
  const on = modelsInfo.lite !== false && (playing || liteOn())
  document.body.classList.toggle('lite', on)
  if (!on) { S.frames.forEach(thaw); return }
  // the reviewer needs its pages live
  if (lite.busy || review.busy) return
  // the page you are reading: the most visible one, once zoomed in enough to read
  const vw = els.viewport.clientWidth
  let keep = null, best = 0
  if (cam.s >= 0.2 && !playing) for (const f of S.frames) {
    const x0 = f.x * cam.s + cam.x, x1 = x0 + FRAME_W * cam.s
    const seen = Math.min(vw, x1) - Math.max(0, x0)
    if (seen > best) { best = seen; keep = f }
  }
  for (const f of S.frames) {
    const wanted = f === keep || frameBusy(f) || (S.sel && S.sel.startsWith(`${f.id}/`))
    if (f.frozen && (wanted || f.frozen.sig !== frameSig(f))) thaw(f)
    else if (!f.frozen && !wanted && f.ready && f.slots.size) {
      lite.busy = true
      try {
        const shot = await snapFrame(f, 0.5)
        if (!frameBusy(f) && f !== keep) freeze(f, shot.image)
      } catch {}
      lite.busy = false
      return // one page per pass keeps it smooth
    }
  }
}

// ---------- models menu
// Planner, builders, reviewer and images. A pick is saved by the server in the
// plugin's own data dir; an empty one goes back to what Hermes is set to.

let modelsInfo = {}
async function loadModels() {
  const res = await api('/api/models').catch(() => null)
  if (res?.ok) modelsInfo = await res.json()
  return modelsInfo
}
loadModels()

const ROLE_ROWS = [
  { role: 'planner', label: 'Planner', note: 'plans the pages and the design system', list: 'text' },
  { role: 'worker', label: 'Builders', note: 'every agent that writes a section', list: 'text' },
  { role: 'reviewer', label: 'Reviewer', note: 'looks at screenshots after a build (needs vision)', list: 'vision', off: true }
]
const models = { el: null }

async function saveModel(body) {
  const res = await api('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  if (!res?.ok) feed(null, 'could not save that model pick', 'err')
  await loadModels()
  if (models.el) renderModels()
}

function renderModels() {
  const info = modelsInfo
  const lists = ['text', 'vision'].map(n => `<datalist id="ml-${n}">${(info[n] || []).map(m => `<option value="${esc(m)}">`).join('')}</datalist>`).join('')
  const rows = ROLE_ROWS.map(r => {
    const s = info.roles?.[r.role] || {}
    const off = s.picked === 'off'
    return `<label class="mrow"><span class="mlabel">${r.label}<small>${r.note}</small></span>
      <span class="mfield"><input data-role="${r.role}" list="ml-${r.list}" spellcheck="false" placeholder="${esc(s.hermes || (r.off ? 'off' : 'model id'))}" value="${off ? '' : esc(s.picked || '')}" ${off ? 'disabled' : ''}>
      ${r.off ? `<button data-off="${r.role}" class="${off ? 'on' : ''}">${off ? 'Turn on' : 'Turn off'}</button>` : ''}</span>
      <small class="mnow">${off ? 'off' : s.picked ? `picked · Hermes has ${esc(s.hermes || 'none')}` : s.hermes ? `from Hermes · ${esc(s.host || '')}` : 'not set in Hermes'}</small></label>`
  }).join('')
  const pick = info.image?.pick
  const cur = pick === 'off' ? 'off' : pick ? `${pick.provider}|${pick.model}` : ''
  const opts = (info.image?.providers || []).flatMap(p => (p.models.length ? p.models : [p.default || '']).map(m =>
    `<option value="${esc(`${p.provider}|${m}`)}" ${p.available ? '' : 'disabled'} ${cur === `${p.provider}|${m}` ? 'selected' : ''}>${esc(p.provider)}${m ? ` · ${esc(m)}` : ''}${p.available ? '' : ' (not signed in)'}</option>`)).join('')
  models.el.innerHTML = `${lists}<div class="mhead">Models <small>picks stay in Swarm Studio; Hermes's config is untouched</small></div>${rows}
    <label class="mrow"><span class="mlabel">Images<small>paints photos and illustrations into the pages, with your Hermes image login</small></span>
      <span class="mfield"><select data-image>
        <option value="" ${cur === '' ? 'selected' : ''}>Auto (Codex login, gpt-image-2-low)</option>
        <option value="off" ${cur === 'off' ? 'selected' : ''}>Off: shapes and SVG only</option>${opts}
      </select></span>
      <small class="mnow">${info.image?.providers ? `${info.image.providers.filter(p => p.available).length} providers signed in` : 'looking for Hermes image providers…'}</small></label>
    <label class="mrow"><span class="mlabel">Lite mode<small>for machines short on memory: one live page at a time, the rest become snapshots</small></span>
      <span class="mfield"><select data-lite>
        <option value="" ${info.lite == null ? 'selected' : ''}>Auto (${(navigator.deviceMemory || 8) <= 4 ? 'on' : 'off'} on this device)</option>
        <option value="on" ${info.lite === true ? 'selected' : ''}>On</option>
        <option value="off" ${info.lite === false ? 'selected' : ''}>Off</option>
      </select></span></label>
    <div class="mfoot">Each image is one call to that provider and uses its quota. Changes apply to the next build.</div>`
}

function toggleModels(open = !models.el) {
  if (!open) { models.el?.remove(); models.el = null; els.modelsBtn.classList.remove('on'); return }
  models.el = document.createElement('div')
  models.el.className = 'models-pop'
  document.body.append(models.el)
  const r = els.modelsBtn.getBoundingClientRect()
  models.el.style.top = `${r.bottom + 6}px`
  models.el.style.right = `${Math.max(8, innerWidth - r.right)}px`
  els.modelsBtn.classList.add('on')
  renderModels()
  loadModels().then(() => models.el && !models.el.contains(document.activeElement) && renderModels())
  models.el.addEventListener('change', e => {
    const t = e.target
    if (t.dataset.role) saveModel({ role: t.dataset.role, model: t.value.trim() || null })
    if (t.dataset.lite !== undefined) saveModel({ role: 'lite', on: t.value === '' ? null : t.value === 'on' })
    if (t.dataset.image !== undefined) {
      const [provider, model] = t.value.split('|')
      saveModel({ role: 'image', provider: t.value === 'off' ? 'off' : provider || null, model: model || '' })
    }
  })
  models.el.addEventListener('click', e => {
    const b = e.target.closest('[data-off]')
    if (!b) return
    e.preventDefault()
    const role = b.dataset.off
    saveModel({ role, model: modelsInfo.roles?.[role]?.picked === 'off' ? null : 'off' })
  })
}
els.modelsBtn.onclick = e => { e.stopPropagation(); toggleModels() }
document.addEventListener('mousedown', e => { if (models.el && !models.el.contains(e.target) && e.target !== els.modelsBtn) toggleModels(false) })
window.addEventListener('keydown', e => { if (e.key === 'Escape' && models.el) toggleModels(false) })

// ---------- side tabs and floating panels

function showTab(name) {
  for (const el of document.querySelectorAll('[data-tab]')) el.classList.toggle('on', el.dataset.tab === name)
  store.set('tab', name)
  if (name === 'files') loadFiles()
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => showTab(b.dataset.tab)

const panels = new Set(store.get('panels', ['design']))
function renderPanels() {
  for (const el of document.querySelectorAll('[data-panel]')) el.classList.toggle('on', panels.has(el.dataset.panel))
  document.body.classList.toggle('design-on', panels.has('design'))
  $('.float.agents-card').classList.toggle('below', panels.has('planner'))
}
function togglePanel(p) {
  panels.has(p) ? panels.delete(p) : panels.add(p)
  store.set('panels', [...panels])
  renderPanels()
}
for (const b of document.querySelectorAll('.toggle[data-panel]')) b.onclick = () => togglePanel(b.dataset.panel)
for (const b of document.querySelectorAll('.dtabs button')) b.onclick = () => { design.tabPinned = true; showDtab(b.dataset.dtab) }

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

// Sorted, searchable, and grouped: by day, or by folders the person makes.
const fileView = { q: '', sort: store.get('fileSort') || 'new', group: store.get('fileGroup') || 'day', closed: new Set(store.get('fileClosed') || []) }

function dayLabel(t) {
  const d = new Date(t), today = new Date(), y = new Date(Date.now() - 864e5)
  const same = (a, b) => a.toDateString() === b.toDateString()
  return same(d, today) ? 'Today' : same(d, y) ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function renderFiles() {
  const shown = viewing && viewing !== 'new' ? viewing : S.run
  if (!els.files.previousElementSibling?.classList.contains('file-tools')) {
    const bar = document.createElement('div')
    bar.className = 'file-tools'
    bar.innerHTML = `<input type="search" placeholder="Search files" class="fq"><select class="fsort" title="Sort"><option value="new">Newest</option><option value="old">Oldest</option><option value="name">Name</option><option value="size">Most pages</option></select><select class="fgroup" title="Group"><option value="day">By day</option><option value="folder">By folder</option><option value="none">No groups</option></select>`
    els.files.before(bar)
    bar.querySelector('.fq').oninput = e => { fileView.q = e.target.value.toLowerCase(); renderFiles() }
    bar.querySelector('.fsort').value = fileView.sort
    bar.querySelector('.fgroup').value = fileView.group
    bar.querySelector('.fsort').onchange = e => { fileView.sort = e.target.value; store.set('fileSort', fileView.sort); renderFiles() }
    bar.querySelector('.fgroup').onchange = e => { fileView.group = e.target.value; store.set('fileGroup', fileView.group); renderFiles() }
  }
  els.files.innerHTML = files.length ? '' : '<div class="empty">No files yet. Describe a product in Chat to make one.</div>'
  const list = files.filter(f => !fileView.q || `${f.title} ${f.brief} ${f.folder || ''}`.toLowerCase().includes(fileView.q))
  const by = { new: (a, b) => b.t - a.t, old: (a, b) => a.t - b.t, name: (a, b) => a.title.localeCompare(b.title), size: (a, b) => b.pages - a.pages || b.t - a.t }[fileView.sort]
  list.sort(by)
  // runs that never got a page go in their own group, out of the way
  const groupOf = f => (!f.pages && !f.live ? '⚠ Unfinished' : fileView.group === 'day' ? dayLabel(f.t) : fileView.group === 'folder' ? (f.folder ? `📁 ${f.folder}` : 'Not in a folder') : '')
  const groups = new Map()
  for (const f of list) { const g = groupOf(f); groups.has(g) || groups.set(g, []); groups.get(g).push(f) }
  // loose files, then unfinished ones, at the bottom
  for (const g of ['Not in a folder', '⚠ Unfinished']) if (groups.has(g)) { const u = groups.get(g); groups.delete(g); groups.set(g, u) }
  if (!list.length && files.length) els.files.innerHTML = '<div class="empty">Nothing matches.</div>'
  for (const [name, items] of groups) {
    let box = els.files
    if (name) {
      const det = document.createElement('details')
      det.className = 'fgroup'
      det.open = !fileView.closed.has(name) && !(name === '⚠ Unfinished' && !fileView.closed.has('!' + name))
      det.innerHTML = `<summary><span></span><em>${items.length}</em></summary>`
      det.querySelector('span').textContent = name
      det.ontoggle = () => {
        fileView.closed.delete(name); fileView.closed.delete('!' + name)
        if (!det.open) fileView.closed.add(name)
        else if (name === '⚠ Unfinished') fileView.closed.add('!' + name)
        store.set('fileClosed', [...fileView.closed])
      }
      els.files.append(det)
      box = det
    }
    for (const f of items) box.append(fileItem(f, shown))
  }
}

function fileItem(f, shown) {
  const item = document.createElement('div')
  item.className = `file${f.id === shown ? ' on' : ''}`
  item.innerHTML = `<div class="ttl"><span></span><button class="fmore" title="Folder, show in Finder">⋯</button></div><div class="meta"></div>`
  item.querySelector('.ttl span').textContent = f.title
  item.title = f.brief
  const when = new Date(f.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const meta = item.lastChild
  if (f.live) meta.innerHTML = '<span class="live">● building</span> · '
  meta.append(`${when} · ${f.pages} pages · ${f.layers} layers${f.ms ? ` · ${(f.ms / 1000).toFixed(0)}s` : ''}`)
  const badges = [f.video && '🎬', f.published?.length && `🌐 ${f.published.length}`, fileView.group !== 'folder' && f.folder && `📁 ${f.folder}`].filter(Boolean)
  if (badges.length) { const b = document.createElement('span'); b.className = 'fbadges'; b.textContent = badges.join('  '); meta.append(b) }
  item.onclick = () => openRun(f.id)
  item.querySelector('.fmore').onclick = e => { e.stopPropagation(); fileMenu(f, e.target) }
  return item
}

function fileMenu(f, at) {
  document.querySelector('.fmenu')?.remove()
  const m = document.createElement('div')
  m.className = 'fmenu'
  const folders = [...new Set(files.map(x => x.folder).filter(Boolean))].sort()
  m.innerHTML = `<div class="fmh">Move to folder</div>${folders.map(n => `<button data-f="${esc(n)}">📁 ${esc(n)}${n === f.folder ? ' ✓' : ''}</button>`).join('')}<button data-new>＋ New folder…</button>${f.folder ? '<button data-f="">Take out of folder</button>' : ''}<hr><button data-reveal>Show in Finder</button>${f.video ? '<button data-reveal="video">Show the video in Finder</button>' : ''}`
  document.body.append(m)
  const r = at.getBoundingClientRect()
  Object.assign(m.style, { top: `${Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)}px`, left: `${Math.max(8, r.right - m.offsetWidth)}px` })
  const close = () => { m.remove(); removeEventListener('mousedown', away) }
  const away = e => { if (!m.contains(e.target)) close() }
  setTimeout(() => addEventListener('mousedown', away))
  m.onclick = async e => {
    const b = e.target.closest('button')
    if (!b) return
    let folder = b.dataset.f
    if (b.hasAttribute('data-new')) folder = prompt('Folder name')?.trim()
    if (b.hasAttribute('data-reveal')) {
      close()
      return api(`/api/runs/${encodeURIComponent(f.id)}/reveal${b.dataset.reveal ? '?what=video' : ''}`, { method: 'POST' })
    }
    close()
    if (folder === undefined || folder === null) return
    await api(`/api/runs/${encodeURIComponent(f.id)}/meta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder }) })
    f.folder = folder || null
    if (folder && fileView.group !== 'folder') { fileView.group = 'folder'; store.set('fileGroup', 'folder'); const g = document.querySelector('.file-tools .fgroup'); if (g) g.value = 'folder' }
    renderFiles()
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
      if (e.type === 'cmd') return command(e)
      if (e.type === 'reset' || e.type === 'run:start') {
        liveId = e.run
        if (viewing) { viewing = null; fresh(e.run) }
      }
      // events for the open file (a review or edit while viewing it) apply too
      if (!viewing || (e.run === viewing && e.type !== 'run:start')) on(e)
    } catch (err) {
      console.error(err)
    }
  }
}

// Commands sent from Hermes (/swarm review, the swarm_studio tool).
async function command(c) {
  const open = c.run && c.run !== (viewing && viewing !== 'new' ? viewing : S.run)
  if (open) { await openRun(c.run); await new Promise(r => setTimeout(r, 4000)) }
  if (c.op === 'play') openPlayer()
  if (c.op === 'review') reviewRun()
  if (c.op in commandOps) commandOps[c.op](c)
}

// A newer canvas on disk: reload once nothing is building and nobody is mid-edit.
setInterval(async () => {
  const st = await fetch('/api/state').then(r => r.json()).catch(() => null)
  if (!st?.version || !BOOT.version || st.version === BOOT.version) return
  const busy = (st.working && !viewing) || !els.player.hidden || picker.el || models.el || review.busy || video.busy || video.el || document.activeElement?.closest?.('input, textarea, select')
  if (!busy) location.reload()
}, 8000)

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
