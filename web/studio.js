// The studio controller (docs/ux/PATTERNS.md): Projects (the home, web/home.js), a project
// (web/orbit.js until the project canvas lands), and a room (Design deck, Film studio, Engine room).
// It talks to the canvas only through window.swarm (the hook block at the end of canvas.js).
import { makeHome } from './home.js'
const sw = window.swarm
const Crew = window.SwarmCrew
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
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  target: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>'
}
const ico = n => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`

// ---------- the palette, read from the :root tokens so WebGL uses the same colours as the CSS
function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback
}
// light theme (canvas.css): glows can't add light to a white page, so the scenes draw normally on it
const isLight = () => { const v = token('--void', '#0b0b0c'); return parseInt(v.slice(1, 3), 16) > 128 }
const blending = T => isLight() ? T.NormalBlending : T.AdditiveBlending
const palette = () => ({
  void: token('--void', '#0b0b0c'), deep: token('--deep', '#161618'), frame: token('--frame', '#3a3a3f'), frameHi: token('--frame-hi', '#a1a1a6'),
  text: token('--text', '#f4f4f5'), muted: token('--muted', '#8e8e93'), accent: token('--accent', '#f4f4f5'), pink: token('--pink', '#f4f4f5'), ok: token('--ok', '#00F279'),
  info: token('--info', '#00F2F2'), hot: token('--hot', '#F20000'), nebula: token('--nebula', '#3a3a3f'), nebula2: token('--nebula-2', '#8e8e93'), touch: token('--star-touch', '#f4f4f5')
})

// ---------- three.js, loaded once for both scenes
let threeP = null
const three = () => (threeP ||= import(new URL('vendor/three/three.module.min.mjs', document.baseURI).href))

// a soft round glow, drawn once, for sprites
function glowTexture(THREE, stops = [[0, 1], [0.25, 0.55], [0.6, 0.12], [1, 0]]) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [at, a] of stops) r.addColorStop(at, `rgba(255,255,255,${a})`)
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}



// =====================================================================================
// the controller: Projects (home), a project, a room (Canvas, Video, App), or classic
// =====================================================================================
const C = W.swarmCosmos = {
  mode: 'off',
  three, palette, blending, isLight, glowTexture, ico, esc, reduced,
  // the canvas asks this before it opens the latest file behind an empty canvas
  atHome: () => C.mode === 'home',
  classic: !!store.get('classic', false),
  get fps() { return C.orbit?.fps }
}
const STATIONS = { canvas: 'Design deck', video: 'Film studio', app: 'Engine room' }
C.STATIONS = STATIONS

function setMode(m) {
  for (const x of ['home', 'orbit', 'station']) body.classList.toggle(`cosmos-${x}`, m === x)
}

C.go = (m, v) => {
  if (m === 'galaxy') m = 'home'
  if (m === 'project') m = 'orbit'
  if (C.classic || sw.wall) return
  body.classList.add('cosmos')
  // the side panel's own small-chat mode does not apply here; it comes back in classic view
  if (body.classList.contains('side-min')) { C.sideMin = true; body.classList.remove('side-min') }
  C.mode = m
  setMode(m)
  if (m === 'home') {
    body.classList.remove('cosmos-chat')
    C.homeView.show()
    C.orbit?.hide()
  } else if (m === 'orbit') {
    if (sw.view !== 'canvas') sw.setView('canvas')
    C.orbit?.show()
    C.homeView.hide()
  } else if (m === 'station') {
    C.orbit?.hide()
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

// Classic view: the old layout, exactly. Remembered per browser (storage may throw; that is fine).
function setClassic(on) {
  C.classic = on
  store.set('classic', on)
  $('#cosmos-classic')?.classList.toggle('on', on)
  if (on) {
    C.homeView?.hide(); C.orbit?.hide()
    C.mode = 'off'
    body.classList.remove('cosmos', 'cosmos-home', 'cosmos-orbit', 'cosmos-station', 'cosmos-chat')
    if (C.sideMin) body.classList.add('side-min')
  } else {
    C.go(sw.S?.run || sw.viewing ? 'orbit' : 'home')
  }
}

// The way home, from any view: the logo always lands on Projects (it also leaves Classic view),
// and Esc climbs one level, room → project → Projects, when no panel is open.
C.home = () => { if (sw.wall) return; if (C.classic) setClassic(false); C.go('home') }
C.up = () => { if (C.classic || sw.wall) return false; if (C.mode === 'station') { C.go('orbit'); return true } if (C.mode === 'orbit') { C.go('home'); return true } return false }
// open a project: its newest build (or the one asked for); with no run, the build just started
C.open = (run, pid) => {
  C.project = pid || null
  C.go('orbit')
  if (run && run !== sw.viewing) sw.openRun(run)
}
// anything that answers Esc itself (a panel, a menu, the player, a selection) goes first
const OPEN = '.game-pop, .models-pop, .export-pop, .show-sum, .fmenu, .fname-pop, .ui-overlay, .ui-popover, .combo-list, .player:not([hidden]), .slash-pop:not([hidden]), .think-log:not([hidden]), .hm-menu, #more-menu:not([hidden]), #pub-menu:not([hidden]), .dpick, .finfo-wrap, .video-big, .cbox.open'
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
  back.onclick = () => C.go(C.mode === 'station' ? 'orbit' : 'home')
  $('.topbar').prepend(back)
  renderBack()
  // ☰: what the lean top bar folds away, and the classic switch
  const menu = $('#more-menu')
  if (menu) {
    menu.insertAdjacentHTML('beforeend', `<div class="cosmos-sep" role="separator"></div>
      <button class="toggle cosmos-only" id="cosmos-game">${ico('gamepad')}Game</button>
      <button class="toggle" id="cosmos-classic">${ico('layout')}Classic view</button>`)
    $('#cosmos-game').onclick = () => $('#game-btn')?.click()
    $('#cosmos-classic').onclick = () => setClassic(!C.classic)
    $('#cosmos-classic').classList.toggle('on', C.classic)
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
  chrome()
  sw.on(e => {
    if (e.type === 'run:start' || e.type === 'run:done' || e.type === 'reset') setTimeout(() => C.mode === 'home' && C.homeView.refresh(), 600)
  })
  if (C.classic) return
  C.go(Q.get('replay') || Q.get('run') ? 'orbit' : 'home')
}
// fold-button style lives here: it is the only rule that needs the side panel's tab bar
const style = document.createElement('style')
style.textContent = 'body:not(.cosmos) .cosmos-fold{display:none}.cosmos-fold{background:none;border:0;color:var(--muted);cursor:pointer;padding:6px}.cosmos-fold:hover{color:var(--text)}.cosmos-fold .ico{width:15px;height:15px}'
document.head.append(style)

if (sw && !sw.wall) {
  // the mode is known before the canvas's own start-up timers run
  if (!C.classic) C.mode = Q.get('replay') || Q.get('run') ? 'orbit' : 'home'
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else setTimeout(start)
}
