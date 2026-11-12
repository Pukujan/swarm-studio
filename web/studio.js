// The studio controller (docs/ux/PATTERNS.md): Projects (the home, a file browser: web/home.js),
// a project (one canvas: web/project.js), and a room (Design deck, Film studio, Engine room).
// It talks to the canvas only through window.swarm (the hook block at the end of canvas.js).
import { makeHome } from './home.js'
import { makeProject } from './project.js'
import { makeWork } from './work.js'
import { makePlan } from './plan.js'
import { projectRun } from './route.js'
const sw = window.swarm
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
  mode: 'off',
  ico, esc, reduced,
  // the canvas asks this before it opens the latest file behind an empty canvas
  atHome: () => C.mode === 'home'
}
// the old one-screen layout ("Classic view") is gone; forget a browser's old choice
try { localStorage.removeItem('swarm.classic') } catch {}
const STATIONS = { canvas: 'Design deck', video: 'Film studio', app: 'Engine room' }
C.STATIONS = STATIONS

function setMode(m) {
  for (const x of ['home', 'project', 'station', 'plan']) body.classList.toggle(`cosmos-${x}`, m === x)
}

C.go = (m, v) => {
  if (sw.wall) return
  body.classList.add('cosmos')
  // the side panel's own small-chat mode does not apply here
  body.classList.remove('side-min')
  // a replay started from the menu plays in the Design deck: leaving the deck ends it
  if (m !== 'station' || (v && v !== 'canvas')) sw.stopReplay?.()
  C.mode = m
  setMode(m)
  if (m !== 'plan') C.planView?.hide()
  if (m === 'plan') {
    // a game's plan before anything costly is made (spec 21): its own board
    C.homeView.hide()
    C.projectView.hide()
    C.planView.show(v || C.planView.id, { fresh: !!C.planFresh })
    C.planFresh = false
  } else if (m === 'home') {
    body.classList.remove('cosmos-chat')
    C.homeView.show()
    C.projectView.hide()
  } else if (m === 'project') {
    if (sw.view !== 'canvas') sw.setView('canvas')
    // v: the run that was asked for (a card, a version, the address); see projectRun in route.js
    C.projectView.show(projectRun({ asked: v, opening: C.opening, viewing: sw.viewing, live: sw.S?.run }), C.project)
    C.homeView.hide()
  } else if (m === 'station') {
    C.projectView.hide()
    C.homeView.hide()
    if (v && sw.view !== v) sw.setView(v)
  }
  renderBack()
  renderMode()
}

function renderBack() {
  const b = $('.cosmos-back')
  if (!b) return
  const toProject = C.mode === 'station'
  b.innerHTML = `${ico('back')}<span class="t">${toProject ? 'Project' : 'Projects'}</span>`
  b.setAttribute('aria-label', toProject ? 'Back to the project' : 'Back to Projects')
}

// The way home, from any view: the logo always lands on Projects,
// and Esc climbs one level, room → project → Projects, when no panel is open.
C.home = () => { if (sw.wall) return; C.go('home') }
C.up = () => { if (sw.wall) return false; if (C.mode === 'station') { C.go('project'); return true } if (C.mode === 'project' || C.mode === 'plan') { C.go('home'); return true } return false }
// open a plan (spec 21); fresh: the crew write its cards in
C.plan = (id, fresh = false) => { C.planFresh = fresh; C.go('plan', id) }
// open a project: its newest build (or the one asked for); with no run, the build just started
C.open = (run, pid) => {
  C.project = pid || null
  C.load(run)
  C.go('project', run || undefined)
}
// Load a run into the canvas and remember it until it is there: whoever asks "which run is open"
// in between gets this one, not the one the canvas still holds.
C.opening = null
C.load = run => {
  if (!run || run === sw.viewing) return Promise.resolve()
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
  back.onclick = () => C.go(C.mode === 'station' ? 'project' : 'home')
  $('.topbar').prepend(back)
  renderBack()
  // ☰: what the lean top bar folds away
  const menu = $('#more-menu')
  if (menu) {
    menu.insertAdjacentHTML('beforeend', `<div class="cosmos-sep" role="separator"></div>
      <button class="toggle cosmos-only" id="cosmos-sound">${ico('sound')}<span>Sound</span></button>
`)
    // the crew's voices: on or off from the menu
    const sound = $('#cosmos-sound')
    const paint = () => { const on = sw.sound?.() === 'on'; sound.classList.toggle('on', on); sound.querySelector('span').textContent = on ? 'Sound on' : 'Sound off' }
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
// The mode: one menu button in a build's top bar, Canvas, Video, App or Game. Each option does what
// its old button did: the first three open that room, Game opens the game wizard.
const MODES = [['canvas', 'Canvas'], ['video', 'Video'], ['app', 'App'], ['game', 'Game']]
// the game's own room is the App view on the game's run: the menu calls it Game
const onGame = () => !!C.pair?.game && sw.viewing === C.pair.game
const modeNow = () => (sw.view === 'app' && onGame() ? 'game' : sw.view)
// the game's room: the App view on the game's run (the label says Game once that run is open)
C.toGame = () => {
  C.go('station', 'app')
  return C.load(C.pair.game).then(renderMode)
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
    // Game: the project's game, when it has one; else the wizard that makes one
    if (id === 'game') {
      if (!C.pair?.game) return $('#game-btn')?.click()
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
C.chat = on => { body.classList.toggle('cosmos-chat', on); if (on) $('.side .tabs [data-tab="chat"]')?.click() }

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
  chrome()
  C.work = makeWork({ sw, C })
  sw.on(e => {
    if (e.type === 'run:start' || e.type === 'run:done' || e.type === 'reset') setTimeout(() => C.mode === 'home' && C.homeView.refresh(), 600)
  })
  // a build opened by its address shows that build, whatever the server is streaming
  C.go(Q.get('replay') || Q.get('run') ? 'project' : 'home', Q.get('run') || Q.get('replay') || undefined)
}
// fold-button style lives here: it is the only rule that needs the side panel's tab bar
const style = document.createElement('style')
style.textContent = 'body:not(.cosmos) .cosmos-fold{display:none}.cosmos-fold{background:none;border:0;color:var(--muted);cursor:pointer;padding:6px}.cosmos-fold:hover{color:var(--text)}.cosmos-fold .ico{width:15px;height:15px}'
document.head.append(style)

if (sw && !sw.wall) {
  // the mode is known before the canvas's own start-up timers run
  C.mode = Q.get('replay') || Q.get('run') ? 'project' : 'home'
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else setTimeout(start)
}
