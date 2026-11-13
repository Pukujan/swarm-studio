// The studio controller (docs/ux/PATTERNS.md): Projects (the home, a file browser: web/home.js),
// a project (one canvas: web/project.js), and a room (Design deck, Film studio, Engine room).
// It talks to the canvas only through window.swarm (the hook block at the end of canvas.js).
import { makeHome } from './home.js'
import { makeProject } from './project.js'
import { makeWork } from './work.js'
import { makePlan } from './plan.js'
import { makeBrand } from './brand.js'
import { makeScaffold } from './scaffold.js'
import { makeNav, toAddress } from './nav.js'
const sw = window.swarm
const W = window
const body = document.body
const $ = s => document.querySelector(s)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const store = {
  get(k, d) { try { const v = localStorage.getItem(`swarm.${k}`); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch {} }
}
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
// Lucide line icons (ISC; licence in web/brand/LICENSE-lucide.txt)
const ICON = {
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sound: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>'
}
const ico = n => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`

// =====================================================================================
// the controller: Projects (home), a project, or a room (Canvas, Video, App)
// =====================================================================================
const C = W.swarmCosmos = {
  ico, esc, reduced,
  // kept for older canvases: in the studio the machine and the address decide what is open
  atHome: () => C.mode !== 'off'
}
// the old one-screen layout ("Classic view") is gone; forget a browser's old choice
try { localStorage.removeItem('swarm.classic') } catch {}
const STATIONS = { canvas: 'Design deck', video: 'Film studio', app: 'Engine room' }
C.STATIONS = STATIONS

function setMode(m) {
  for (const x of ['home', 'project', 'station', 'plan', 'brand', 'studio']) body.classList.toggle(`cosmos-${x}`, m === x)
}

// Where the person is: one machine (web/nav.js, docs/specs/34-navigation-state.md). C.mode, the pill
// and the back button are read from it; C.go turns the old (mode, view) calls into its events.
const nav = C.nav = makeNav({ search: sw && !sw.wall ? location.search : '' })
const MODE_OF = { home: 'home', overview: 'project', plan: 'plan', brand: 'brand', studio: 'studio', draft: 'station', deck: 'station', video: 'station', app: 'station', game: 'station' }
Object.defineProperty(C, 'mode', { get: () => (!sw || sw.wall ? 'off' : MODE_OF[nav.view.room]), enumerable: true })
const inBuild = () => nav.actor.getSnapshot().matches('build')
// the build a room asks for when none is open: the one loading, else the one the canvas holds
const loadingRun = () => C.opening || sw.viewing || sw.S?.run || null
const ROOM_OF = { canvas: 'deck', video: 'video', app: 'app' }

function eventsFor(m, v) {
  const at = nav.view
  if (m === 'home') return [{ type: 'home' }]
  if (m === 'brand') return [{ type: 'brand' }]
  if (m === 'studio') return [{ type: 'studio', project: v?.project, step: v?.step }]
  if (m === 'plan') return [{ type: 'plan', plan: v || C.planView?.id || null }]
  if (m === 'game') return [{ type: 'room', room: 'game', run: v }]
  if (m === 'project') {
    if (inBuild() && (!v || v === at.version)) return [{ type: 'room', room: 'overview' }]
    const version = v || at.version || loadingRun()
    return [{ type: 'open.project', project: C.project ?? (version === at.version ? at.project : null), version }]
  }
  if (m === 'station') {
    const room = ROOM_OF[v] || (inBuild() ? null : 'deck')
    const back = at.room === 'brand' ? [{ type: 'back' }] : []
    if (!room) return back
    // the brand sheet goes back where it came from, then the room
    const from = back.length ? at.from : at.room
    if (['overview', 'deck', 'video', 'app', 'game'].includes(from) || (!back.length && inBuild())) return [...back, { type: 'room', room }]
    const version = loadingRun()
    if (version) return [...back, { type: 'open.project', project: C.project, version }, { type: 'room', room }]
    // a new project talked through on the deck, nothing built yet
    return room === 'deck' ? [...back, { type: 'draft' }] : back
  }
  return []
}

let going = false
C.go = (m, v) => {
  if (sw.wall) return
  going = true
  try { for (const e of eventsFor(m, v)) nav.go(e) } finally { going = false }
  draw(m === 'plan' ? v : undefined)
}
// a move another part sends straight to the machine is drawn the same way
// the player and its page are drawn by the canvas (followPlayer); the rooms only when a room changes
const spot = v => [v.room, v.from, v.project, v.version, v.run, v.plan, v.replay].join('|')
let drawnAt = spot(nav.view)
nav.subscribe(v => { if (!going && spot(v) !== drawnAt) draw() })
nav.subscribe(v => sw.followPlayer?.(v))

// The address carries the machine's state and nothing else (spec 34). A new place (room, project,
// version, plan) is a history entry; the player and its page replace the current one. Back, Forward
// and a reload rebuild the state from the address alone. Other keys (wall, chatter, the hosted
// studio's prompt) are kept as they are.
const NAV_KEYS = ['project', 'version', 'room', 'run', 'plan', 'play', 'page', 'replay', 'step']
// a version is one project's, so a project learned for the version shown is not a new place
// (a Studio's step is not a new place either: moving between steps replaces the entry)
const place = v => [v.room === 'brand' ? v.from : v.room, v.version, v.run, v.plan, v.room === 'studio' ? v.project : ''].join('|')
let restoring = false
let written = nav.view
function writeAddress(v) {
  const q = new URLSearchParams(toAddress(v))
  for (const [k, x] of new URLSearchParams(location.search)) if (!NAV_KEYS.includes(k)) q.append(k, x)
  const search = q.toString() ? `?${q}` : ''
  const before = written
  written = v
  if (search === location.search) return
  const url = `${location.pathname}${search}${location.hash}`
  if (place(v) !== place(before)) history.pushState(null, '', url)
  else history.replaceState(history.state, '', url)
}
nav.subscribe(v => { if (!restoring) writeAddress(v) })
// The canvas loads the build the machine names, whenever that changes (a click, a reload, Back or
// Forward), unless it holds it already (canvas.js holds)
const loadNamed = () => { const { run } = nav.view; if (inBuild() && run && run !== C.opening && !sw.holds(run)) C.load(run) }
nav.subscribe(() => { if (!restoring) loadNamed() })
addEventListener('popstate', () => {
  if (sw.wall) return
  restoring = going = true
  try { nav.restore(location.search) } finally { restoring = going = false }
  written = nav.view
  C.project = nav.view.project
  loadNamed()
  draw()
})

function draw(planId) {
  const { room, version, project, plan } = nav.view
  const m = MODE_OF[room]
  body.classList.add('cosmos')
  // the side panel's own small-chat mode does not apply here
  body.classList.remove('side-min')
  // a replay started from the menu plays in the Design deck: leaving the deck ends it
  if (room !== 'deck' && room !== 'draft') sw.stopReplay?.()
  drawnAt = spot(nav.view)
  queueMicrotask(() => C.work?.paint?.())
  setMode(m)
  if (room !== 'plan') C.planView?.hide()
  if (room !== 'brand') C.brandView?.hide()
  if (room !== 'studio') C.scaffoldView?.hide()
  if (room === 'studio') {
    // a Studio project before anything is built (spec 37): its scaffold beside the chat, on the step the
    // address or the caller named (none: the planner's start)
    C.homeView.hide()
    C.projectView.hide()
    C.chat(true)
    C.scaffoldView.show(project, nav.actor.getSnapshot().context.step)
  } else if (room === 'brand') {
    // a website's or app's brand sheet (spec 31), beside the chat it came from
    C.homeView.hide()
    C.projectView.hide()
    body.classList.add('cosmos-chat')
    C.brandView.show()
  } else if (room === 'plan') {
    // a game's plan before anything costly is made (spec 21): its own board
    C.homeView.hide()
    C.projectView.hide()
    C.planView.show(planId || plan || C.planView.id, { fresh: !!C.planFresh })
    C.planFresh = false
  } else if (room === 'home') {
    body.classList.remove('cosmos-chat')
    C.homeView.show()
    C.projectView.hide()
  } else if (room === 'overview') {
    if (sw.view !== 'canvas') sw.setView('canvas')
    C.projectView.show(version, project)
    C.homeView.hide()
  } else {
    C.projectView.hide()
    C.homeView.hide()
    const want = room === 'deck' || room === 'draft' ? 'canvas' : room === 'game' ? 'app' : room
    if (sw.view !== want) sw.setView(want)
  }
  renderBack()
  renderMode()
}

function renderBack() {
  const b = $('.cosmos-back')
  if (!b) return
  const toProject = inBuild() && nav.view.room !== 'overview'
  b.innerHTML = `${ico('back')}<span class="t">${toProject ? 'Overview' : 'Projects'}</span>`
  b.setAttribute('aria-label', toProject ? 'Back to the Overview' : 'Back to Projects')
}

// The way home, from any view: the logo always lands on Projects,
// and Esc climbs one level, room → project → Projects, when no panel is open.
C.home = () => { if (sw.wall) return; C.go('home') }
C.up = () => {
  if (sw.wall) return false
  const room = nav.view.room
  if (room === 'brand') { nav.go({ type: 'back' }); return true }
  if (room === 'studio') { C.go('home'); return true }
  if (room === 'home') return false
  C.go(inBuild() && room !== 'overview' ? 'project' : 'home')
  return true
}
// open a plan (spec 21); fresh: the crew write its cards in
C.plan = (id, fresh = false) => { C.planFresh = fresh; C.go('plan', id) }
// a part of a plan, from the chat's "where to start" (spec 27): the board on that plan, the part in view and selected
C.planAt = async (id, { focus, select } = {}) => {
  if (C.mode !== 'plan' || C.planView.id !== id || C.planView.drafting) C.go('plan', id)
  await C.planView.ready
  if (select) C.planView.select(select)
  if (focus) C.planView.focus(focus)
}
// a game talk (spec 27): the chat on the left, the plan taking shape on the board; a chat that already
// has its plan opens on it. { text, chat, said, plan }
C.talkGame = ({ text = '', chat = null, said = [], plan = null } = {}) => {
  C.project = null
  if (plan) C.plan(plan)
  else { C.planView.talk(); C.go('plan') }
  C.chat(true)
  sw.talk.start({ kind: 'game', text, chat, said, blank: true })
}
C.planDraft = plan => C.planView.draft(plan)
// a Studio project's scaffold (spec 37), on a step or the planner's start
C.studio = (project, step = null) => { C.project = project; C.go('studio', { project, step }) }
// open the brand sheet for a talk's brief (spec 31): { chat, brief, kind, done(chat, locked) }; with
// { project }, that project's own brand (spec 37)
C.brand = opts => { C.go('brand'); return C.brandView.open(opts) }
// open a project: its newest build (or the one asked for); with no run, the build just started
C.open = (run, pid) => {
  C.project = pid || null
  const loaded = C.load(run)
  C.go('project', run || undefined)
  return loaded
}
// A build the person started (spec 34 `started`): its deck (the Overview in the hosted studio), waited
// for until the stream says it has begun. A new project has no project yet.
C.started = (run, { project = null, room } = {}) => {
  C.project = project
  going = true
  try { nav.go({ type: 'started', run, project, room: room || (body.classList.contains('hosted') ? 'overview' : 'deck') }) } finally { going = false }
  draw()
  loadNamed()
}
// Load a run into the canvas and remember it until it is there: whoever asks "which run is open"
// in between gets this one, not the one the canvas still holds.
C.opening = null
C.load = run => {
  if (!run || run === sw.viewing || run === C.opening) return Promise.resolve()
  C.opening = run
  return Promise.resolve(sw.openRun(run)).finally(() => { if (C.opening === run) C.opening = null })
}
// anything that answers Esc itself (a panel, a menu, the player, a selection) goes first
const OPEN = '.game-pop, .models-pop, .export-pop, .show-sum, .fmenu, .ui-overlay, .ui-popover, .combo-list, .player:not([hidden]), .slash-pop:not([hidden]), .hm-menu, #more-menu:not([hidden]), #pub-menu:not([hidden]), .dpick, .finfo-wrap, .video-big, .cbox.open'
function escUp(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.fullscreenElement) return
  if (W.SwarmUI?.open?.() || document.querySelector(OPEN) || sw.S?.sel) return
  if (C.up()) { e.preventDefault(); e.stopPropagation() }
}

function chrome() {
  // the logo: home to Projects, from every view
  const brand = $('.topbar .brand')
  if (brand) {
    brand.innerHTML = '<span class="sw-logo">SWARM<i></i><i></i><i></i><i></i></span>'
    brand.setAttribute('role', 'button')
    brand.tabIndex = 0
    brand.setAttribute('aria-label', 'Projects')
    brand.onclick = () => C.home()
    brand.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); C.home() } }
  }
  addEventListener('keydown', escUp, true)
  // the back button: Projects from a project, the project from a room
  const back = document.createElement('button')
  back.className = 'toggle cosmos-back'
  back.onclick = () => C.go(inBuild() && nav.view.room !== 'overview' ? 'project' : 'home')
  $('.topbar').prepend(back)
  renderBack()
  // ☰: what the lean top bar folds away
  const menu = $('#more-menu')
  if (menu) {
    menu.insertAdjacentHTML('beforeend', `<div class="cosmos-sep" role="separator"></div>
      <button class="toggle cosmos-only" id="cosmos-sound" aria-pressed="false">${ico('sound')}<span>Crew sound</span></button>
`)
    // the crew's voices and sounds (web/chatter.js): the same switch and words as the user menu's; ✓ while on
    const sound = $('#cosmos-sound')
    const paint = () => { const on = sw.sound?.() === 'on'; sound.classList.toggle('on', on); sound.setAttribute('aria-pressed', String(on)) }
    sound.onclick = () => { sw.sound?.(sw.sound() === 'on' ? 'muted' : 'on'); paint() }
    $('#more-btn')?.addEventListener('click', paint)
    paint()
  }
  modeMenu()
  // in a room, the chat column comes back with one button
  const chat = document.createElement('button')
  chat.className = 'cosmos-chatbtn'
  chat.innerHTML = `${ico('chat')}Chat`
  chat.onclick = () => C.chat(true)
  body.append(chat)
  // a chat column opened from a project closes again from its own tab bar
  const tabs = $('.side .tabs')
  if (tabs) {
    const x = document.createElement('button')
    x.className = 'cosmos-only cosmos-fold'
    x.setAttribute('aria-label', 'Fold chat')
    x.innerHTML = ico('x')
    x.style.marginLeft = 'auto'
    x.onclick = () => C.chat(false)
    tabs.append(x)
  }
}
// The mode: one menu button in a build's top bar, Overview, Canvas, Video, App or Game. Overview is the
// project's pages and files (web/project.js); Canvas, Video and App open that room; Game opens the
// game's room, or the wizard that makes one.
const MODES = [['overview', 'Overview'], ['canvas', 'Canvas'], ['video', 'Video'], ['app', 'App'], ['game', 'Game']]
// the game's own room is the App view on the game's run: the menu calls it Game
const onGame = () => nav.view.room === 'game'
const PILL = { overview: 'overview', deck: 'canvas', draft: 'canvas', video: 'video', app: 'app', game: 'game' }
const modeNow = () => PILL[nav.view.room] || 'overview'
// the game's room: the App view on the game's run (the label says Game once that run is open)
C.toGame = (run = C.pair.game) => {
  C.go('game', run)
  return C.load(run).then(renderMode)
}
function renderMode() {
  const b = $('.mode-btn')
  if (!b) return
  const cur = MODES.find(m => m[0] === modeNow()) || MODES[0]
  b.querySelector('.t').textContent = cur[1]
  b.setAttribute('aria-label', `Mode: ${cur[1]}`)
}
function modeMenu() {
  const spacer = $('.topbar .spacer')
  if (!spacer) return
  const wrap = document.createElement('div')
  wrap.className = 'mode-wrap'
  wrap.innerHTML = `<button class="toggle mode-btn" aria-haspopup="listbox" aria-expanded="false"><span class="t"></span>${ico('caret')}</button>
    <div class="mode-menu" role="listbox" aria-label="Mode" hidden>${MODES.map(([id, n]) => `<button role="option" data-mode="${id}" aria-selected="false">${n}</button>`).join('')}</div>`
  spacer.before(wrap)
  const btn = wrap.querySelector('.mode-btn'), list = wrap.querySelector('.mode-menu')
  const opts = () => [...list.querySelectorAll('[role="option"]')]
  let off = null
  const close = (focus = false) => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); off?.(); off = null; if (focus) btn.focus() }
  const open = () => {
    // fixed to the button: the top bar clips (and would scroll) anything inside it
    const r = btn.getBoundingClientRect()
    list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 158))}px`
    list.style.top = `${r.bottom + 6}px`
    list.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    for (const o of opts()) o.setAttribute('aria-selected', String(o.dataset.mode === modeNow()))
    ;(opts().find(o => o.dataset.mode === modeNow()) || opts()[0]).focus()
    off = W.SwarmUI?.layer(list, () => close(), { extra: [btn] })
  }
  const pick = id => {
    close()
    if (id === 'overview') return C.go('project')
    // Game: the project's game, when it has one; else the wizard that makes one
    if (id === 'game') {
      if (!C.pair?.game) return sw.game?.()
      return C.toGame()
    }
    // the other rooms show the site's run, not the game's (which has no pages or film)
    if (onGame() && C.pair.site) C.load(C.pair.site).then(() => { if (sw.view !== id) sw.setView(id); renderMode() })
    C.go('station', id)
    renderMode()
  }
  btn.onclick = () => (list.hidden ? open() : close())
  btn.onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open() } }
  list.onclick = e => { const o = e.target.closest('[data-mode]'); if (o) pick(o.dataset.mode) }
  list.onkeydown = e => {
    const all = opts(), i = all.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus() }
    else if (e.key === 'Home') { e.preventDefault(); all[0].focus() }
    else if (e.key === 'End') { e.preventDefault(); all.at(-1).focus() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'Tab') close()
  }
  renderMode()
}
C.chat = on => { body.classList.toggle('cosmos-chat', on); if (on) sw.tab?.('chat') }

function start() {
  if (sw.wall || !sw) return
  const root = document.createElement('div')
  body.append(root)
  C.homeView = makeHome({ sw, C, root })
  const proot = document.createElement('div')
  body.append(proot)
  C.projectView = makeProject({ sw, C, root: proot })
  const plroot = document.createElement('div')
  body.append(plroot)
  C.planView = makePlan({ sw, C, root: plroot })
  const broot = document.createElement('div')
  body.append(broot)
  C.brandView = makeBrand({ sw, C, root: broot })
  const sroot = document.createElement('div')
  body.append(sroot)
  C.scaffoldView = makeScaffold({ sw, C, root: sroot })
  chrome()
  C.work = makeWork({ sw, C })
  sw.on(e => {
    if (e.type === 'run:start' || e.type === 'run:done' || e.type === 'reset') setTimeout(() => C.mode === 'home' && C.homeView.refresh(), 600)
  })
  // the screen the address names (the machine was made from it), whatever the server is streaming
  C.project = nav.view.project
  loadNamed()
  draw()
}
// fold-button style lives here: it is the only rule that needs the side panel's tab bar
const style = document.createElement('style')
style.textContent = 'body:not(.cosmos) .cosmos-fold{display:none}.cosmos-fold{background:none;border:0;color:var(--muted);cursor:pointer;padding:6px}.cosmos-fold:hover{color:var(--text)}.cosmos-fold .ico{width:15px;height:15px}'
document.head.append(style)

if (sw && !sw.wall) {
  // the mode (C.mode, read from the machine) is known before the canvas's own start-up timers run.
  // A module runs once the page is parsed, so start now: a timer here raced the first replies from
  // the server, and the Studio booted before or after them by chance (scripts/motion-check.mjs)
  start()
}
