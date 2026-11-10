// The studio controller (docs/ux/PATTERNS.md): Projects (the home, a file browser: web/home.js),
// a project (one canvas: web/project.js), and a room (Design deck, Film studio, Engine room).
// It talks to the canvas only through window.swarm (the hook block at the end of canvas.js).
import { makeHome } from './home.js'
import { makeProject } from './project.js'
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
  for (const x of ['home', 'project', 'station']) body.classList.toggle(`cosmos-${x}`, m === x)
}

C.go = (m, v) => {
  if (sw.wall) return
  body.classList.add('cosmos')
  // the side panel's own small-chat mode does not apply here
  body.classList.remove('side-min')
  C.mode = m
  setMode(m)
  if (m === 'home') {
    body.classList.remove('cosmos-chat')
    C.homeView.show()
    C.projectView.hide()
  } else if (m === 'project') {
    if (sw.view !== 'canvas') sw.setView('canvas')
    C.projectView.show(sw.viewing || sw.S?.run || null, C.project)
    C.homeView.hide()
  } else if (m === 'station') {
    C.projectView.hide()
    C.homeView.hide()
    if (v && sw.view !== v) sw.setView(v)
  }
  renderBack()
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
C.up = () => { if (sw.wall) return false; if (C.mode === 'station') { C.go('project'); return true } if (C.mode === 'project') { C.go('home'); return true } return false }
// open a project: its newest build (or the one asked for); with no run, the build just started
C.open = (run, pid) => {
  C.project = pid || null
  if (run && run !== sw.viewing) sw.openRun(run)
  C.go('project')
}
// anything that answers Esc itself (a panel, a menu, the player, a selection) goes first
const OPEN = '.game-pop, .models-pop, .export-pop, .show-sum, .fmenu, .fname-pop, .ui-overlay, .ui-popover, .combo-list, .player:not([hidden]), .slash-pop:not([hidden]), .hm-menu, #more-menu:not([hidden]), #pub-menu:not([hidden]), .dpick, .finfo-wrap, .video-big, .cbox.open'
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
      <button class="toggle cosmos-only" id="cosmos-game">${ico('gamepad')}Game</button>`)
    $('#cosmos-game').onclick = () => $('#game-btn')?.click()
    // the crew's voices: on or off from the menu
    const sound = $('#cosmos-sound')
    const paint = () => { const on = sw.sound?.() === 'on'; sound.classList.toggle('on', on); sound.querySelector('span').textContent = on ? 'Sound on' : 'Sound off' }
    sound.onclick = () => { sw.sound?.(sw.sound() === 'on' ? 'muted' : 'on'); paint() }
    $('#more-btn')?.addEventListener('click', paint)
    paint()
  }
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
C.chat = on => { body.classList.toggle('cosmos-chat', on); if (on) $('.side .tabs [data-tab="chat"]')?.click() }

function start() {
  if (sw.wall || !sw) return
  const root = document.createElement('div')
  body.append(root)
  C.homeView = makeHome({ sw, C, root })
  const proot = document.createElement('div')
  body.append(proot)
  C.projectView = makeProject({ sw, C, root: proot })
  chrome()
  sw.on(e => {
    if (e.type === 'run:start' || e.type === 'run:done' || e.type === 'reset') setTimeout(() => C.mode === 'home' && C.homeView.refresh(), 600)
  })
  C.go(Q.get('replay') || Q.get('run') ? 'project' : 'home')
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
