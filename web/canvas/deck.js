// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the Design deck: agents and their cursors, frames and layers, geometry, design gestures, the break room, wires, the camera.
import { clean } from '../clean.js'
import { Crew, ARROW, TOOL, els, S, cam, FRAME_W, GAP, BOOT, replayId, $, TOOLS } from './core.js'
import { FRAME_SANDBOX } from './base.js'
import { playerMessage } from './player.js'
import { checks } from './marks.js'
import { key } from './events.js'
import { viewing } from './replay.js'
import { Chatter } from './auto.js'

// ---------- agents

export function addAgent(a) {
  a = { ...a, color: Crew.color(a.name) }
  const el = document.createElement('div')
  el.className = 'cursor idle'
  el.innerHTML = `${ARROW(a.color, a.name)}<div class="tag" style="background:${a.color};color:${Crew.ink(a.color)}">${TOOL.move.svg}<span>${a.name}</span><em class="doing"></em></div><div class="bubble" style="color:${a.color}"></div>`
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

// "quiet" (the top bar's crew button): no chatter bubbles anywhere
export const crewQuiet = () => document.body.classList.contains('crew-quiet')
export function say(a, text, ms = 2800) {
  if (crewQuiet()) return
  a.bubble.innerHTML = `<span></span>`
  a.bubble.firstChild.textContent = text
  a.sayUntil = performance.now() + ms
}

export function setTool(a, tool, holdMs = 0) {
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
export function doing(a, now) {
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
export function spark(a, text) {
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
export function detectTool(text) {
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

export function addFrame(p) {
  if (S.frames.some(f => f.id === p.id)) return
  const el = document.createElement('div')
  el.className = 'frame'
  const x = p.index * (FRAME_W + GAP)
  el.style.left = `${x}px`
  el.innerHTML = `<div class="frame-label"></div><iframe sandbox="allow-scripts"></iframe>`
  el.querySelector('.frame-label').textContent = `Page ${p.index + 1} · ${p.title}`
  el.querySelector('.frame-label').insertAdjacentHTML('beforeend', `<small>/${p.id}</small>`)
  const iframe = el.querySelector('iframe')
  iframe.setAttribute('aria-label', p.title || 'Page')
  iframe.setAttribute('sandbox', FRAME_SANDBOX)
  if (BOOT.frameHtml) iframe.srcdoc = BOOT.frameHtml
  else iframe.src = 'frame.html'
  const frame = { id: p.id, title: p.title, index: p.index, x, h: 700, el, iframe, ready: false, slots: new Map(), geo: { slots: {}, gotos: [] } }
  els.world.insertBefore(el, els.world.querySelector('#ghosts'))
  S.frames.push(frame)
  S.treeDirty = true
}

export function post(f, msg) {
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
  }
  // a page's pictures (`capture`) are answered to web/capture.js, which listens for its own requests
})

export function addLayer(e) {
  const k = key(e.page, e.id)
  if (S.layers.has(k)) return
  const l = { key: k, page: e.page, id: e.id, role: e.role, height: Math.max(160, Math.min(900, Number(e.height) || 360)), links: e.links || [], text: '', ver: 0, status: 'planned', agent: null }
  S.layers.set(k, l)
  S.order.push(k)
  S.planned++
  S.treeDirty = true
  for (const f of S.frames) ensureSlot(f, l)
}

export const belongs = (f, l) => l.page === '*' || l.page === f.id

function ensureSlot(f, l) {
  if (!f.ready || !l || !belongs(f, l) || f.slots.has(l.key)) return
  const where = l.page === '*' && l.id === 'nav' ? 'start' : l.page === '*' && l.id === 'footer' ? 'end' : 'before-footer'
  post(f, { type: 'slot', key: l.key, where })
  f.slots.set(l.key, { ver: -1, status: null, t: 0 })
}

export function applyTheme(f) {
  if (f.ready && S.theme) post(f, { type: 'theme', theme: { vars: S.theme.vars, fonts: S.theme.fonts, radius: S.theme.radius } })
}

export function syncSlots(now) {
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
    // a cap as well, in case a page still finds a way to grow itself (40 screens)
    const h = Math.min(36000, Math.max(700, f.geo.height || 0))
    if (h !== f.h) {
      f.h = h
      f.iframe.style.height = `${h}px`
    }
  }
}

// ---------- geometry (all from the frames' reports)

export function slotFor(l) {
  const f = l.page === '*' ? S.frames[0] : S.frames.find(fr => fr.id === l.page)
  const g = f?.geo.slots[l.key]
  if (!g) return null
  const [left, top, width, height] = g.box
  return { f, box: { left, top, width, height, right: left + width }, last: g.last }
}

// Where an agent's cursor should be, in world coordinates.
export function agentTarget(a, now) {
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

// a replay (?replay=) plays a saved run as if it were live: bubbles, sparks and gestures included
export const live = e => (!viewing || !!replayId) && (!e.t || Date.now() - e.t < 5000)
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)

export function gestureFor(text) {
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

export function startGesture(a, kind, l) {
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
export const toolFlash = new Map()

// Advance a gesture; returns the cursor's world position, or null when it ends.
export function gestureStep(a, now) {
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

export const DOCK = { cols: 4, cw: 58, ch: 26, top: 32, left: 14 }
export const dockCell = i => ({
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

export const banter = { next: 0, queue: [] }
export const pick = list => list[Math.floor(Math.random() * list.length)]

export function runBanter(now) {
  for (const b of banter.queue) {
    if (b.at > now || b.said) continue
    b.said = true
    if (!b.agent.docked) continue
    for (const a of S.agents.values()) if (a.docked) a.sayUntil = 0
    say(b.agent, b.text, 1500 + b.text.length * 35)
    if (Chatter?.on && !viewing) Chatter.babble(b.agent.name, b.text)
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

export const toScreen = (x, y) => ({ x: x * cam.s + cam.x, y: y * cam.s + cam.y })

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
    const color = a?.color || '#a1a1a6'
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

export function drawWires() {
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

export function bboxActive() {
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

export function fit(b, maxScale = 0.5) {
  const vw = els.viewport.clientWidth, vh = els.viewport.clientHeight - 90
  let w = Math.max(b.x1 - b.x0, 1500), h = Math.max(b.y1 - b.y0, 900)
  const s = Math.max(0.06, Math.min(maxScale, Math.min(vw / (w * 1.08), vh / (h * 1.08))))
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
  cam.ts = s
  cam.tx = vw / 2 - cx * s
  cam.ty = (vh / 2 + 10) - cy * s
}

export function focusPage(id) {
  const f = S.frames.find(fr => fr.id === id)
  if (!f) return
  setAuto(false)
  fit({ x0: f.x - 80, y0: -140, x1: f.x + FRAME_W + 80, y1: 900 }, 0.7)
  for (const fr of S.frames) fr.el.classList.toggle('focus', fr === f)
  setTimeout(() => f.el.classList.remove('focus'), 1400)
}

export function setAuto(v) {
  cam.auto = v
  els.camHint.setAttribute('aria-pressed', String(v))
  els.camHint.classList.toggle('auto', v)
  cam.nextFit = 0
}
