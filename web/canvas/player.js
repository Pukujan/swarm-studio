// web/canvas.js, split by area (web/canvas/README.md): Play mode and visitor tours.
import { clean } from '../clean.js'
import { store, S, BOOT, els, commandOps, api, $ } from './core.js'
import { viewing } from './replay.js'
import { closeable } from './start.js'

// ---------- Play mode
// Each page becomes one real document (theme, shared nav and footer, its own
// sections) in a sandboxed frame at true size, so Tailwind's breakpoints apply:
// the Mobile view is the site at 390px, not a scaled-down desktop. Links built
// with data-goto move between pages; nothing else navigates.

export const DEVICES = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 844 } }
export const player = { page: null, device: store.get('device', 'desktop'), history: [], motion: store.get('motion', true) }

export const PLAYER_SCRIPT = `<script>
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
export const TOURABLE = 'a, button, [data-goto], input, textarea, select, h1, h2, h3'
export function pageParts(id, html) {
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

export function pageDoc(id, scripts, given = null) {
  const t = S.theme || {}
  const heading = t.fonts?.heading || 'Georgia', body = t.fonts?.body || 'Inter'
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`
  const vars = Object.entries(t.vars || {}).map(([k, v]) => `${k}:${v};`).join('')
  const html = given ?? pageParts(id, pageBody(id)).html
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com/3.4.17"><\/script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam(heading)}&${fam(body)}&display=swap">
<style>:root{--radius:${t.radius || '12px'};--font-heading:'${heading}',Georgia,serif;--font-body:'${body}',system-ui,sans-serif;${vars}}
html,body{margin:0;background:var(--background,#fff);color:var(--foreground,#111);font-family:var(--font-body)}
[data-goto]{cursor:pointer}
body.hint [data-goto]{outline:3px solid #8e8e93cc;outline-offset:2px}
.tour-hover{outline:2px solid #8e8e93aa;outline-offset:3px;filter:brightness(1.06)}
.tour-press{transform:scale(.96);transition:transform .1s}</style>
${scripts ?? PLAYER_SCRIPT + layoutTag() + motionTags()}</head><body>${html}</body></html>`
}

// The layout guard in Play mode, as in the exports: floated text panels that
// would cover other text at this width move beside the box they sat on.
export const layoutTag = () => BOOT.layout ? `<script>addEventListener('load', () => ${BOOT.layout})<\/script>` : ''

// Motion in Play mode: the same reveal the exports get, in the feel the theme asks for.
export function motionTags() {
  const m = BOOT.motion
  if (!player.motion || !m) return ''
  const t = S.theme || {}
  const preset = new RegExp(m.snappy).test(`${t.name || ''} ${t.direction || ''}`.toLowerCase()) ? 'snappy' : 'gentle'
  return `<style>${m.css}</style><script>addEventListener('load', () => setTimeout(() => (${m.src})(document.body, ${JSON.stringify(preset)}), 60))<\/script>`
}

export function setMotion(on = !player.motion) {
  player.motion = on
  store.set('motion', on)
  els.plMotion.classList.toggle('on', on)
  if (player.page && !els.player.hidden) showPage(player.page, false)
}
commandOps.motion = c => setMotion(c.on === undefined ? !player.motion : !!c.on)

export function fitDevice() {
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

export function showPage(id, push = true) {
  if (!S.frames.some(f => f.id === id)) return
  if (push && player.page && player.page !== id) player.history.push(player.page)
  player.page = id
  const nav = navOf()
  if (nav && nav.view.player !== 'closed' && nav.view.page !== id) nav.go({ type: 'page', page: id })
  els.plPage.value = id
  els.plBack.disabled = !player.history.length
  els.plFrame.style.opacity = 0
  player.loaded = new Promise(resolve => setTimeout(() => {
    const frame = playerDoc(pageDoc(id))
    frame.onload = () => { frame.style.opacity = 1; resolve() }
  }, 120))
}

export function playerMessage(m) {
  if (m.type === 'goto' && !tour.on) showPage(m.target)
  if (m.type === 'tour:ok') tour.waiting.get(m.seq)?.(m)
}

// The player is the navigation machine's (spec 34): opening, closing, watching and its page are
// moves sent to it, and followPlayer draws what it says. Without the studio (the Swarm Wall, a bare
// canvas) the canvas opens and closes it itself.
export const navOf = () => window.swarmCosmos?.nav
// the build the canvas shows (a saved run, or the stream's)
export const heldRun = () => (viewing && viewing !== 'new' ? viewing : S.run)
export function openPlayer(page) {
  if (!S.frames.length) return
  const nav = navOf()
  if (!nav) return showPlayer(page)
  nav.go({ type: 'play', page: page || nav.view.page || S.frames[0].id, pages: S.frames.length })
}
export function closePlayer() {
  const nav = navOf()
  if (nav && nav.view.player !== 'closed') nav.go({ type: 'close' })
  else shutPlayer()
}
export function followPlayer(v) {
  if (v.player === 'closed' || !S.frames.length || (v.run && v.run !== heldRun())) {
    if (!els.player.hidden) shutPlayer()
    return
  }
  if (els.player.hidden) showPlayer(v.page)
  else if (v.page && v.page !== player.page) showPage(v.page)
  const touring = tour.on || tour.starting
  if (v.player === 'visitor' && !touring) startVisitor()
  if (v.player === 'prototype' && touring) stopTour()
}
export function showPlayer(page) {
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

// A new document in the player's frame, without a history entry. Navigating a frame that already has
// a document adds an entry to the page's own history, so Back stepped through the player's pages
// before the studio's and a closed player cut off Forward. A fresh frame's first document adds none,
// so the frame is swapped for a fresh one.
export function playerDoc(html) {
  const old = els.plFrame
  const frame = old.cloneNode(false)
  if (html) frame.srcdoc = html
  else frame.removeAttribute('srcdoc')
  old.replaceWith(frame)
  els.plFrame = frame
  return frame
}
export function shutPlayer() {
  stopTour()
  toggleTourMenu(false)
  els.player.hidden = true
  els.viewport.classList.remove('behind')
  if (els.plFrame.hasAttribute('srcdoc')) playerDoc('')
}

export function setDevice(name, reload = true) {
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

export const tour = { list: null, loading: null, error: '', on: false, id: 0, seq: 0, waiting: new Map(), x: 0, y: 0, starting: 0, next: 0 }

export function loadTours(fresh = false) {
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

export function pageBody(id) {
  const layers = S.order.map(k => S.layers.get(k)).filter(l => l.page === id || l.page === '*')
  const shared = name => layers.filter(l => l.page === '*' && l.id === name)
  const mid = layers.filter(l => l.page === id || (l.page === '*' && l.id !== 'nav' && l.id !== 'footer'))
  return [...shared('nav'), ...mid, ...shared('footer')].map(l => `<div data-layer="${l.id}">${clean(l.text)}</div>`).join('\n')
}

export function renderTourMenu() {
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

export function toggleTourMenu(open = els.plTourMenu.hidden) {
  els.plTourMenu.hidden = !open
  els.plTourList.setAttribute('aria-expanded', String(open))
  if (open) { loadTours(); renderTourMenu() }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))

// Ask the page frame to do something; resolves with its reply.
export function ask(op, extra = {}) {
  const seq = ++tour.seq
  return new Promise(resolve => {
    const timer = setTimeout(() => { tour.waiting.delete(seq); resolve({ box: null }) }, 3000)
    tour.waiting.set(seq, m => { clearTimeout(timer); tour.waiting.delete(seq); resolve(m) })
    els.plFrame.contentWindow?.postMessage({ type: 'tour', op, seq, ...extra }, '*')
  })
}

// A point inside the frame, in window coordinates (the device is zoomed).
export function frameToScreen(x, y) {
  const r = els.plFrame.getBoundingClientRect()
  const k = r.width / els.plFrame.clientWidth || player.scale || 1
  return [r.left + x * k, r.top + y * k]
}

export function placeCursor(x, y) {
  tour.x = x
  tour.y = y
  els.plCursor.style.transform = `translate(${x}px, ${y}px)`
  els.plThink.classList.toggle('left', x > innerWidth - 300)
}

// Glide along a slight arc and ease out, the way a hand moves a mouse.
export function glide(x, y, live) {
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
export function think(lines, emoji, live) {
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

export function press() {
  els.plCursor.classList.add('press')
  const ring = document.createElement('div')
  ring.className = 'ring'
  els.plCursor.append(ring)
  setTimeout(() => { els.plCursor.classList.remove('press'); ring.remove() }, 500)
}

export function personaBar(t, at, text) {
  const p = els.plPersona
  p.hidden = false
  p.innerHTML = '<span></span><span class="who"><b></b> <small></small></span><span class="dots"></span><button>Stop</button>'
  p.firstChild.textContent = t.emoji
  p.querySelector('b').textContent = t.name
  p.querySelector('small').textContent = text
  p.querySelector('.dots').innerHTML = t.steps.map((_, i) => `<i class="${i < at ? 'on' : ''}"></i>`).join('')
  p.querySelector('button').onclick = stopTour
}

// Watch a visitor: the player bar's one start and stop. It starts the next visitor (writing them
// first if there are none yet); while one is on the page it stops them.
export async function watchVisitor() {
  if (tour.on || tour.starting) return stopTour()
  const nav = navOf()
  if (nav) return nav.go({ type: 'watch' })
  return startVisitor()
}
export async function startVisitor() {
  const id = tour.starting = ++tour.id
  paintWatch()
  await loadTours()
  if (tour.starting !== id) return
  tour.starting = 0
  paintWatch()
  if (els.player.hidden) return
  if (tour.list?.length) return playTour(tour.next % tour.list.length)
  // none could be written: the visitor list says why, with Try again
  stopTour()
  toggleTourMenu(true)
}
export function paintWatch() {
  const b = els.plTours, on = tour.on, busy = !!tour.starting
  b.classList.toggle('on', on)
  b.classList.toggle('busy', busy)
  b.setAttribute('aria-busy', String(busy))
  const name = on || busy ? 'Stop watching' : 'Watch a visitor'
  b.querySelector('.t').textContent = name
  b.setAttribute('aria-label', name)
}

export async function playTour(index) {
  const t = tour.list?.[index]
  if (!t) return
  stopTour()
  const id = ++tour.id
  const live = () => tour.on && tour.id === id
  tour.on = true
  if (navOf()?.view.player === 'prototype') navOf().go({ type: 'watch' })
  tour.next = index + 1
  paintWatch()
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
  paintWatch()
  if (navOf()?.view.player === 'visitor') navOf().go({ type: 'stop' })
}

export function stopTour() {
  tour.on = false
  tour.starting = 0
  tour.id++
  paintWatch()
  if (navOf()?.view.player === 'visitor') navOf().go({ type: 'stop' })
  els.plCursor.hidden = true
  els.plThink.innerHTML = ''
  els.plPersona.hidden = true
}

els.plTours.onclick = e => { e.stopPropagation(); toggleTourMenu(false); watchVisitor() }
els.plTourList.onclick = e => { e.stopPropagation(); toggleTourMenu() }
document.addEventListener('click', e => { if (!els.plTourMenu.hidden && !e.target.closest('.tour-pick')) toggleTourMenu(false) })

// Play: a plain click plays the prototype; its caret also offers a visitor who walks through it
els.play.onclick = () => openPlayer()
export const closePlayMenu = (focus = false) => { els.playMenu.hidden = true; els.playMore.setAttribute('aria-expanded', 'false'); playMenuOff?.(); playMenuOff = null; if (focus) els.playMore.focus() }
export let playMenuOff = null
els.playMore.onclick = e => {
  e.stopPropagation()
  if (!els.playMenu.hidden) return closePlayMenu()
  els.playMenu.hidden = false
  els.playMore.setAttribute('aria-expanded', 'true')
  playMenuOff = closeable(els.playMenu, () => closePlayMenu(), { extra: [els.playMore] })
  els.playMenu.querySelector('[data-play]').focus()
}
els.playMenu.onclick = e => {
  const b = e.target.closest('[data-play]')
  if (!b) return
  closePlayMenu()
  openPlayer()
  if (b.dataset.play === 'visitor') watchVisitor()
}
els.playMenu.onkeydown = e => {
  const all = [...els.playMenu.querySelectorAll('[data-play]')], i = all.indexOf(document.activeElement)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus() }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePlayMenu(true) }
  else if (e.key === 'Tab') closePlayMenu()
}
$('#pl-close').onclick = closePlayer
els.plBack.onclick = () => player.history.length && showPage(player.history.pop(), false)
$('#pl-restart').onclick = () => { player.history = []; showPage(S.frames[0].id, false) }
els.plMotion.onclick = () => setMotion()
els.plMotion.classList.toggle('on', player.motion)
els.plPage.onchange = () => showPage(els.plPage.value)
for (const b of document.querySelectorAll('#pl-device button')) b.onclick = () => setDevice(b.dataset.device)
window.addEventListener('resize', () => !els.player.hidden && fitDevice())
