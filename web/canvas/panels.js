// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the panels: theme, layer tree, agents, status, toolbar, and the chat feed with its messages.
import { layerDrag } from '../layerlink.js'
import { S, els, TOOL, TOOLS, Crew, HERMIA, api } from './core.js'
import { slotFor, setAuto, fit, post, focusPage, toolFlash } from './deck.js'
import { design, showDtab, esc } from './design.js'
import { USER_TOOLS, cmt, txt } from './marks.js'
import { links } from './base.js'
import { hosted } from './hosted.js'
import { viewing } from './replay.js'
import { showRun } from './film.js'
import { openPlayer, watchVisitor } from './player.js'

// ---------- panels

export function renderTheme() {
  const t = S.theme
  els.theme.innerHTML = `<div class="name"></div><div class="dir"></div>`
  els.theme.querySelector('.name').textContent = `${t.name || 'Theme'} · ${t.fonts?.heading || ''} / ${t.fonts?.body || ''}`
  els.theme.querySelector('.dir').textContent = t.direction || ''
  for (const [k, v] of Object.entries(t.vars || {})) {
    const sw = document.createElement('div')
    sw.className = 'sw'
    sw.style.background = v
    els.theme.append(sw)
  }
}

// Layers: which sections are expanded or hidden (hidden only on the canvas, not in exports).
export const layersOpen = new Set(), layersHidden = new Set()
export let treeSel = null, treeRun = null

// What is inside a section, as a designer's layer list: headings, text, images, buttons, links, forms.
export function layerKids(html = '') {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out = []
  for (const el of doc.body.querySelectorAll('h1,h2,h3,h4,p,img,button,a,input,select,textarea,ul,ol,table,form,svg,iframe')) {
    if (el.closest('a,button,svg,table,form') && el.closest('a,button,svg,table,form') !== el) continue
    const tag = el.tagName.toLowerCase()
    const label = tag === 'img' ? (el.getAttribute('alt') || 'image') : tag === 'svg' ? 'icon' : tag === 'input' || tag === 'textarea' ? (el.getAttribute('placeholder') || el.getAttribute('name') || tag) : (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)
    out.push({ tag: { h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', p: 'Text', img: 'Image', button: 'Button', a: 'Link', ul: 'List', ol: 'List', table: 'Table', form: 'Form', svg: 'Icon', iframe: 'Embed' }[tag] || 'Field', label: label || tag })
    if (out.length >= 14) break
  }
  return out
}

export function selectLayer(l) {
  const s = slotFor(l)
  S.sel = l.key
  design.pinned = null
  if (design.tab !== 'design') { design.tabPinned = true; showDtab('design') }
  design.last = ''
  if (s) { setAuto(false); fit({ x0: s.f.x + s.box.left - 60, y0: s.box.top - 80, x1: s.f.x + s.box.right + 60, y1: s.box.top + s.box.height + 80 }, 0.9) }
  renderTree()
}

export function hideLayer(l, hide) {
  hide ? layersHidden.add(l.key) : layersHidden.delete(l.key)
  for (const f of l.page === '*' ? S.frames : S.frames.filter(fr => fr.id === l.page)) post(f, { type: 'slot', key: l.key, hidden: hide })
  if (hide && S.sel === l.key) S.sel = null
  renderTree()
}

export function renderTree() {
  if (treeRun !== S.run) { treeRun = S.run; layersOpen.clear(); layersHidden.clear() }
  treeSel = S.sel
  const groups = [{ id: '*', num: 'All', title: 'Shared nav and footer' }, ...S.frames.map(f => ({ id: f.id, num: `Page ${f.index + 1}`, title: f.title }))]
  els.tree.innerHTML = S.frames.length ? '' : '<div class="empty">Pages appear here once the planner names them.</div>'
  for (const g of groups) {
    const layers = S.order.map(k => S.layers.get(k)).filter(l => l.page === g.id)
    if (!layers.length && g.id === '*') continue
    const div = document.createElement('div')
    div.className = `pg${S.closed.has(g.id) ? '' : ' open'}`
    const title = document.createElement('div')
    title.className = 'pg-title'
    title.dataset.page = g.id
    title.innerHTML = `<span class="num"></span><span class="ttl"></span><span class="caret">▶</span>`
    title.children[0].textContent = g.num
    title.children[1].textContent = g.title
    title.onclick = e => {
      // @ts-ignore
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
      const open = layersOpen.has(l.key), hid = layersHidden.has(l.key)
      const row = document.createElement('div')
      row.className = `ly ${l.status}${S.sel === l.key ? ' sel' : ''}${hid ? ' hid' : ''}`
      row.dataset.key = l.key
      row.draggable = true
      row.ondragstart = e => layerDrag(e, l.key, l.role || l.id)
      row.innerHTML = `<span class="tw">${l.status === 'done' ? (open ? '▼' : '▶') : ''}</span><span class="dot"></span><span></span><span class="who"></span><button class="eye" aria-label="${hid ? 'Show' : 'Hide'} on the canvas">${hid ? '◌' : '👁'}</button>`
      row.children[2].textContent = l.role
      if (a) {
        row.children[3].textContent = l.status === 'done' ? `${a.name} ${(l.ms / 1000).toFixed(1)}s` : a.name
        // @ts-ignore
        if (l.status !== 'done' && l.status !== 'failed') row.children[1].style.background = a.color
        // @ts-ignore
        row.children[3].style.color = a.color
      }
      row.onclick = e => {
        // @ts-ignore
        if (e.target.classList.contains('eye')) return hideLayer(l, !hid)
        // @ts-ignore
        if (e.target.classList.contains('tw')) { open ? layersOpen.delete(l.key) : layersOpen.add(l.key); return renderTree() }
        selectLayer(l)
      }
      lys.append(row)
      if (open && l.status === 'done') {
        const kids = document.createElement('div')
        kids.className = 'kids'
        for (const k of layerKids(l.text)) {
          const d = document.createElement('div')
          d.className = 'kid'
          d.innerHTML = '<i></i><span></span>'
          d.firstChild.textContent = k.tag
          d.lastChild.textContent = k.label
          d.onclick = () => selectLayer(l)
          kids.append(d)
        }
        lys.append(kids)
      }
    }
    els.tree.append(div)
  }
}

// The panels redraw only when what they show has changed: rebuilding them every
// tick kept the page re-laying itself out ~60 times a second, which on a small
// Mac starved the GPU once the finished pages were on the canvas.
export const setText = (el, v) => { if (el.textContent !== v) el.textContent = v }
export let agentsKey = '', toolbarKey = ''
export function setToolbarKey(v) { return (toolbarKey = v) }
export function renderAgents() {
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

// The strip at the top left of the canvas: what is happening, and how far along it is.
export function renderStatus(working, done) {
  if (!els.status.firstElementChild) els.status.innerHTML = '<span class="st-dot"></span><span class="st-txt"></span><span class="st-num"></span><span class="st-bar"><i></i></span>'
  const total = S.layers.size, pct = total ? done / total : 0
  const state = !total ? (S.run && !S.tEnd ? 'planning' : 'idle') : done >= total ? 'done' : working ? 'working' : 'paused'
  if (els.status.dataset.state !== state) els.status.dataset.state = state
  setText(els.status.children[1], { idle: 'Ready', planning: 'Planning the pages', done: `${S.frames.length} pages built`, working: `${working} agent${working === 1 ? '' : 's'} building`, paused: 'Stopped' }[state])
  setText(els.status.children[2], total ? `${done}/${total}` : '')
  const w = `${(pct * 100).toFixed(1)}%`
  if (els.status.children[3].firstChild.style.width !== w) els.status.children[3].firstChild.style.width = w
}

export function renderToolbar() {
  const by = Object.fromEntries(TOOLS.map(t => [t.id, []]))
  for (const a of S.agents.values()) if (a.layer || performance.now() < a.toolUntil) by[a.tool].push(a)
  const html = TOOLS.map(t => {
    const list = by[t.id]
    const f = toolFlash.get(t.id)
    const lit = f && performance.now() < f.until ? ` style="background:${f.color};color:${Crew.ink(f.color)}"` : ''
    // Move, Text and Comment are yours; the rest light up while an agent uses them
    const mine = USER_TOOLS[t.id]
    const armed = (t.id === 'comment' && cmt.mode) || (t.id === 'text' && txt.mode) || (t.id === 'move' && !cmt.mode && !txt.mode)
    return `${t.id === 'frame' ? '<span class="tsep"></span>' : ''}<div class="tool${mine ? ' mine' : ' agent-only'}${list.length ? ' active' : ''}${armed ? ' armed' : ''}"${lit} data-tool="${t.id}">${t.svg}${list.length ? `<span class="n">${list.length}</span>` : ''}<div class="who">${list.map(a => `<i style="background:${a.color}"></i>`).join('')}</div><span class="lbl">${t.label}</span></div>`
  }).join('')
  if (html !== toolbarKey) els.toolbar.innerHTML = toolbarKey = html
}

// The Chat tab is the conversation: your briefs and the swarm's progress and
// summaries. Everything the agents and the planner say goes to the Log tab.
export function feed(a, text, kind = '', where = '') {
  const box = a || kind === 'sys' ? els.log : els.feed
  const item = document.createElement('div')
  item.className = `item ${kind}`
  if (a) {
    item.insertAdjacentHTML('beforeend', `<span class="av">${Crew.avatar(a.name, 16)}</span>`)
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
  return item
}

// An agent answering in the Chat tab (a comment it picked up).
// keys: the layers the reply is about; hovering it draws their lines (web/layerlink.js)
export function chatAgent(a, text, where = '', keys = null) {
  const item = document.createElement('div')
  item.className = 'item reply'
  item.style.setProperty('--c', a?.color || 'var(--accent)')
  item.innerHTML = `<b>${a ? `<span class="av">${Crew.avatar(a.name, 18)}</span>` : HERMIA}${esc(a?.name || 'SWARM')}</b>${esc(text)}${where ? `<span class="where">${esc(where)}</span>` : ''}`
  if (keys) links.mark(item, keys)
  push(els.feed, item)
  return item
}

export function push(f, item) {
  f.querySelector('.empty-chat')?.remove()
  const stick = f.scrollHeight - f.scrollTop - f.clientHeight < 60
  f.append(item)
  while (f.children.length > 200) f.firstChild.remove()
  if (stick) f.scrollTop = f.scrollHeight
}

// Hermia in the Log, as a chat: each line a message from her, the newest at the bottom.
// Her thinking out loud arrives in fragments; one joins her last thought while it is fresh,
// so it reads as one message rather than a wall of lines.
export function logSay(e) {
  const f = els.log, last = f.lastElementChild, t = e.t || Date.now(), reason = e.kind === 'reason'
  const txt = last?.classList.contains('reason') ? last.querySelector('.txt') : null
  if (reason && txt && t - Number(last.dataset.t) < 20000 && txt.textContent.length < 1400) {
    const stick = f.scrollHeight - f.scrollTop - f.clientHeight < 80
    txt.append(` ${e.text}`)
    last.dataset.t = t
    if (stick) f.scrollTop = f.scrollHeight
    return
  }
  const item = document.createElement('div')
  item.className = `item say${reason ? ' reason' : ''}`
  item.dataset.t = t
  item.innerHTML = `<b>${HERMIA}Hermia${e.to ? `<span class="to">→</span><span style="color:${Crew.color(e.to)}">${esc(e.to)}</span>` : ''}</b><span class="txt"></span>`
  item.querySelector('.txt').textContent = e.text
  push(f, item)
}

// Stopped: what is kept, and the way on (say what to change in the dock, or Resume)
export const STOPPED = { pictures: 'pictures', review: 'review', fixes: 'fixes', film: 'film', app: 'app build', game: 'game build', auto: 'auto run' }
// Every stop names its cause (server/server.mjs, engine/stopreason.mjs): e.reason is {code, message, action}
// with code person | replaced | hermes | model | timeout. Stopped by the person reads as before; any other
// cause says what happened and the one thing to do. A build Hermes stopped goes on by itself when it is back.
export const STOP_PILL = { person: 'stopped', replaced: 'stopped', hermes: 'stopped: no Hermes', model: 'stopped: model', timeout: 'stopped: timed out' }
export let hermesResume = null
export function setHermesResume(v) { return (hermesResume = v) }
export function stoppedMsg(e) {
  const built = [...S.layers.values()].filter(l => l.status === 'done').length, total = S.layers.size
  const why = e.reason && e.reason.code !== 'person' ? e.reason : null
  window.swarmCosmos?.chat?.(true)
  const kept = total ? `${built} of ${total} sections are built and kept.` : ''
  const item = botMsg(why ? [why.message, kept].filter(Boolean).join(' ') : total ? `Stopped. ${kept} Say what to change, or Resume.` : 'Stopped before any page was planned.')
  if (why?.action) item.querySelector('.txt').append(document.createElement('br'), actionLine(why.action))
  const run = S.run
  const canResume = total && built < total && !hosted
  // Hermes closed mid-build: Resume happens by itself once a Hermes attaches (hermes:back)
  if (why?.code === 'hermes' && canResume) hermesResume = run
  const acts = document.createElement('div')
  acts.className = 'chips'
  if (canResume) {
    acts.innerHTML = '<button class="primary">Resume</button>'
    // @ts-ignore
    acts.firstChild.onclick = () => { acts.remove(); resumeRun(run) }
  } else if (why?.code === 'hermes') {
    // nothing to resume: say whether Hermes is there now, so Make can be pressed again
    acts.innerHTML = '<button>Check again</button>'
    // @ts-ignore
    acts.firstChild.onclick = async () => {
      const h = await hermesReady()
      acts.remove()
      if (!h) return botMsg('Hermes is connected. Send the message again to build.')
      hermesSays(h)
    }
  } else return
  item.append(acts)
}
export async function resumeRun(run) {
  if (hermesResume === run) hermesResume = null
  const res = await api(`/api/runs/${encodeURIComponent(run)}/resume`, { method: 'POST' }).catch(() => null)
  const j = res ? await res.json().catch(() => ({})) : {}
  if (res?.status === 503 && j.hermes) { hermesResume = run; return hermesSays(j) }
  if (!res?.ok) return feed(null, `Couldn't resume: ${j.error || res?.status || 'no server'}`, 'err')
  if (viewing && window.swarmCosmos?.nav) showRun(j.run, { started: true })
}
// an action with `commands` in it: the commands set as code
export function actionLine(text) {
  const span = document.createElement('span')
  span.className = 'act'
  String(text).split('`').forEach((part, i) => {
    if (!part) return
    const n = i % 2 ? document.createElement('code') : document.createTextNode(part)
    if (i % 2) n.textContent = part
    span.append(n)
  })
  return span
}
// Before a build or a talk: is Hermes there to answer? null when it is (or not needed), else {message, action}.
// A Hermes that is starting up gets a few seconds to attach first (GET /api/hermes?ready=1).
export async function hermesReady() {
  const j = await api('/api/hermes?ready=1').then(r => (r.ok ? r.json() : null)).catch(() => null)
  if (!j || !j.needed || !j.health || j.health.ok) return null
  return { message: j.health.message, action: j.health.action, code: j.health.code }
}
// one calm line in the chat with the one thing to do, and a way to look again
export function hermesSays(h) {
  window.swarmCosmos?.chat?.(true)
  const item = botMsg(h.message)
  if (h.action) item.querySelector('.txt').append(document.createElement('br'), actionLine(h.action))
  item.classList.add('hermes-off')
  const acts = document.createElement('div')
  acts.className = 'chips'
  acts.innerHTML = '<button>Check again</button>'
  // @ts-ignore
  acts.firstChild.onclick = async () => {
    const again = await hermesReady()
    acts.remove()
    if (!again) return botMsg('Hermes is connected. Send the message again to build.')
    hermesSays(again)
  }
  item.append(acts)
  return item
}

export function botMsg(text, working = false) {
  const item = document.createElement('div')
  item.className = `item bot${working ? ' working' : ''}`
  item.innerHTML = `<b>${HERMIA}Hermia<small>planner</small></b><span class="txt"></span>`
  item.querySelector('.txt').textContent = text
  push(els.feed, item)
  return item
}

// a follow-up's reply: what was added or changed, and that the rest is as it was
export function extendSummary(e, secs) {
  // a resumed build (after Stop, or Hermes closing) finished the sections that were left
  if (e.resume) return `Finished the build: ${e.done} section${e.done === 1 ? '' : 's'} in ${secs}s${e.failed ? ` (${e.failed} failed)` : ''}. All ${e.pages} page${e.pages === 1 ? '' : 's'} are built.`
  const names = (e.added || []).map(p => p.title)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  const fixed = (e.changed || []).filter(id => id !== 'nav').length
  const did = [names.length ? `Added ${list}` : '', fixed ? `${names.length ? 'changed' : 'Changed'} ${fixed} section${fixed > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')
  const kept = `${e.kept} page${e.kept === 1 ? '' : 's'} already here ${e.kept === 1 ? 'is' : 'are'} kept`
  return `${did || 'Nothing was added'} in ${secs}s${e.failed ? ` (${e.failed} failed)` : ''}. ${names.length ? `The navigation links the new pages; the ${kept}.` : `The ${kept}.`}`
}

export function summarize(e) {
  S.progress?.remove()
  S.progress = null
  const secs = (e.ms / 1000).toFixed(1)
  const item = botMsg(e.extend ? extendSummary(e, secs) : `Built ${e.pages} pages and ${e.done} sections in ${secs}s with ${S.agents.size} agents${e.failed ? ` (${e.failed} failed)` : ''}. Open a page, or play the prototype.`)
  if (!S.frames.length) return
  const chips = document.createElement('div')
  chips.className = 'chips'
  const play = document.createElement('button')
  play.className = 'primary'
  play.textContent = '▶ Play prototype'
  play.onclick = () => openPlayer()
  const watch = document.createElement('button')
  watch.textContent = '👀 Watch a visitor'
  watch.onclick = e => { e.stopPropagation(); openPlayer(); watchVisitor() }
  chips.append(play, watch)
  for (const f of S.frames) {
    const b = document.createElement('button')
    b.textContent = `Page ${f.index + 1} · ${f.title}`
    b.onclick = () => focusPage(f.id)
    chips.append(b)
  }
  item.append(chips)
}
