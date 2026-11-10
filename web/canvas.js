// Swarm Studio canvas. Draws engine events: one frame (iframe) per page, one
// slot per layer, one cursor per agent. Nothing here is scripted: every box,
// cursor move, tool and bubble comes from a real model stream.

import { routeMessage } from './route.js'
import { painterOf, REVIEWER } from './icons.js'

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
  form: $('#brief-form'), brief: $('#brief'), agentsSel: $('#agents'), dock: $('#dock'),
  fileName: $('#file-name'), log: $('#log'), play: $('#play-btn'), player: $('#player'), plFrame: $('#pl-frame'),
  plShell: $('#pl-shell'), plStage: $('#pl-stage'), plPage: $('#pl-page'), plBack: $('#pl-back'), plMotion: $('#pl-motion'),
  dDesign: $('#d-design'), dVars: $('#d-vars'), reviewBtn: $('#review-btn'), videoBtn: $('#video-btn'), exportBtn: $('#export-btn'), publishBtn: $('#publish-btn'), modelsBtn: $('#models-btn'),
  plTours: $('#pl-tours'), plTourMenu: $('#pl-tour-menu'), plPersona: $('#pl-persona'), plCursor: $('#pl-cursor'), plThink: $('#pl-think')
}
// what /swarm commands and the swarm_studio tool can ask the open canvas to do; features add themselves
const commandOps = {}
// ?run=<id> opens a file, ?replay=<id>&speed=N replays it on a timer (no live stream),
// and wall=1 is the compact tile the Swarm Wall (web/wall.html) shows
const Q = new URLSearchParams(location.search)
const WALL = Q.get('wall') === '1'
if (WALL) document.documentElement.classList.add('wall')
// the hosted studio lives under a path (/studio/app); the local one at the root
const BASE = BOOT.base || ''
const api = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { ...opts.headers, 'x-swarm-token': BOOT.token || '' } })
// undo and redo steps (see undo() below)
const history = { undo: [], redo: [] }
// Per-viewer UI memory. Storage throws inside the Desktop pane's opaque origin, so it is optional.
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`swarm.${k}`)) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch {} }
}

// Lucide line icons (ISC, lucide.dev; licence in web/brand/LICENSE-lucide.txt), only the ones the studio uses.
// Emoji stay in chat and agent messages; the chrome uses these.
const LUCIDE = {
  "send":"<path d=\"M14.5 21.5a.5.5 0 00.9-.1L22 3.5a.5.5 0 00-.6-.6L3.6 9.6a.5.5 0 00-.1.9l7.4 3.2a2 2 0 011.1 1.1z\" /><path d=\"M21.9 2.1L11 13\" />",
  "sun":"<circle cx=\"12\" cy=\"12\" r=\"4\" /><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41\" />",
  "moon":"<path d=\"M12 3a6 6 0 009 9 9 9 0 11-9-9z\" />",
  "minus":"<path d=\"M5 12h14\" />",
  "brain-circuit":"<path d=\"M12 13h4\" /><path d=\"M12 18h6a2 2 0 012 2v1\" /><path d=\"M12 8h8\" /><path d=\"M12 9a4.17 4.17 0 01-3 4\" /><path d=\"M16 8V5a2 2 0 012-2\" /><path d=\"M6 18a4 4 0 01-2-7.465\" /><path d=\"M6.004 5.125a4 4 0 00-2.526 5.77\" /><path d=\"M6.294 6.294A3 3 0 1112 5v13a4 4 0 11-7.967-.518\" /><circle cx=\"16\" cy=\"13\" r=\"0.5\" fill=\"currentColor\" /><circle cx=\"18\" cy=\"3\" r=\"0.5\" fill=\"currentColor\" /><circle cx=\"20\" cy=\"21\" r=\"0.5\" fill=\"currentColor\" /><circle cx=\"20\" cy=\"8\" r=\"0.5\" fill=\"currentColor\" />",
  "mouse-pointer-2":"<path d=\"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z\"/>",
  "frame":"<line x1=\"22\" x2=\"2\" y1=\"6\" y2=\"6\"/><line x1=\"22\" x2=\"2\" y1=\"18\" y2=\"18\"/><line x1=\"6\" x2=\"6\" y1=\"2\" y2=\"22\"/><line x1=\"18\" x2=\"18\" y1=\"2\" y2=\"22\"/>",
  "square":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>",
  "type":"<path d=\"M12 4v16\"/><path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\"/><path d=\"M9 20h6\"/>",
  "image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>",
  "spline":"<circle cx=\"19\" cy=\"5\" r=\"2\"/><circle cx=\"5\" cy=\"19\" r=\"2\"/><path d=\"M5 17A12 12 0 0 1 17 5\"/>",
  "message-square":"<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\"/>",
  "zap":"<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\"/>",
  "gamepad-2":"<line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\"/><line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\"/><line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\"/><line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\"/><path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\"/>",
  "undo-2":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>",
  "redo-2":"<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13\"/>",
  "play":"<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>",
  "rocket":"<path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\"/><path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\"/><path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\"/><path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\"/>",
  "chevron-down":"<path d=\"m6 9 6 6 6-6\"/>",
  "menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>",
  "globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>",
  "server":"<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\"/><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\"/><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\"/>",
  "search-check":"<path d=\"m8 11 2 2 4-4\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>",
  "clapperboard":"<path d=\"m12.296 3.464 3.02 3.956\"/><path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\"/><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"m6.18 5.276 3.1 3.899\"/>",
  "download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
  "sliders-horizontal":"<path d=\"M10 5H3\"/><path d=\"M12 19H3\"/><path d=\"M14 3v4\"/><path d=\"M16 17v4\"/><path d=\"M21 12h-9\"/><path d=\"M21 19h-5\"/><path d=\"M21 5h-7\"/><path d=\"M8 10v4\"/><path d=\"M8 12H3\"/>",
  "palette":"<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
  "map":"<path d=\"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z\"/><path d=\"M15 5.764v15\"/><path d=\"M9 3.236v15\"/>",
  "users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>",
  "coffee":"<path d=\"M10 2v2\"/><path d=\"M14 2v2\"/><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\"/><path d=\"M6 2v2\"/>",
  "message-circle":"<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/>",
  "scroll-text":"<path d=\"M15 12h-5\"/><path d=\"M15 8h-5\"/><path d=\"M19 17V5a2 2 0 0 0-2-2H4\"/><path d=\"M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3\"/>",
  "layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>",
  "folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>",
  "panel-left-close":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M9 3v18\"/><path d=\"m16 15-3-3 3-3\"/>",
  "rotate-cw":"<path d=\"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/>",
  "external-link":"<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>",
  "x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
  "arrow-left":"<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>",
  "rotate-ccw":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/>",
  "eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  "sparkles":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>",
  "plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>",
  "check":"<path d=\"M20 6 9 17l-5-5\"/>",
  "monitor":"<rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\"/><line x1=\"8\" x2=\"16\" y1=\"21\" y2=\"21\"/><line x1=\"12\" x2=\"12\" y1=\"17\" y2=\"21\"/>",
  "smartphone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>",
  "tablet":"<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" ry=\"2\"/><line x1=\"12\" x2=\"12.01\" y1=\"18\" y2=\"18\"/>",
  "square-stop":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1\"/>"
}
const icon = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ico = name => icon(LUCIDE[name] || '')
// the static chrome in index.html marks its icons <i data-i="name">
for (const el of document.querySelectorAll('i[data-i]')) { const cls = el.className; el.outerHTML = ico(el.dataset.i).replace('class="ico"', `class="ico${cls ? ` ${cls}` : ''}"`) }
// a button's label lives in its .t span, so changing it keeps the icon
const setLabel = (btn, v) => { const t = btn.querySelector('.t'); if (t) { if (t.textContent !== v) t.textContent = v } else if (btn.textContent !== v) btn.textContent = v }
const TOOLS = [
  { id: 'move', label: 'Move', svg: ico('mouse-pointer-2') },
  { id: 'frame', label: 'Frame', svg: ico('frame') },
  { id: 'rect', label: 'Shape', svg: ico('square') },
  { id: 'text', label: 'Text', svg: ico('type') },
  { id: 'image', label: 'Image', svg: ico('image') },
  { id: 'connect', label: 'Connect', svg: ico('spline') },
  { id: 'comment', label: 'Comment', svg: ico('message-square') }
]
const TOOL = Object.fromEntries(TOOLS.map(t => [t.id, t]))
// The crew (web/crew.js): each agent is a little courier sprite, the same for the same name.
const Crew = window.SwarmCrew || { color: () => '#F2F2F2', ink: () => '#0b0b0c', avatar: () => '' }
// A cursor's head: a small pointer nib in the agent's colour, with its avatar riding beside it.
const ARROW = (color, name) => `<svg class="nib" viewBox="0 0 10 10" aria-hidden="true"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill="${color}" stroke="#0b0b0c" stroke-width="1" stroke-linejoin="round"/></svg><span class="arrow">${Crew.avatar(name, 30)}</span>`
// The planner's mark (Commander Hermia), for her messages in Chat
const HERMIA = `<span class="hermia">${Crew.avatar('Hermia', 18)}</span>`

let S
// studio hook: web/studio.js and web/project.js listen to every event through window.swarm.on
const cosmosHooks = new Set()
const cam = { x: 40, y: 140, s: 0.16, tx: 40, ty: 140, ts: 0.16, auto: true, nextFit: 0 }

function fresh(run = null) {
  S = { run, title: '', t0: 0, tEnd: 0, agents: new Map(), frames: [], layers: new Map(), order: [], wires: new Map(), plans: new Map(), planDirty: true, treeDirty: true, done: 0, planned: 0, theme: null, closed: new Set(), cheerUntil: 0, edits: new Set(), classEdits: [], sel: null, images: new Map(), imgQueued: 0, imgSettled: 0 }
  banter.queue = []
  history.undo = []; history.redo = []; renderUndo()
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
  for (const fn of cosmosHooks) try { fn(e) } catch (err) { console.error(err) } // studio hook (web/studio.js, web/project.js)
  switch (e.type) {
    case 'reset':
      if (S.run !== e.run) fresh(e.run)
      break
    case 'run:start':
      fresh(e.run)
      S.t0 = e.t
      // a game has no canvas build: its spec and the App view are the whole file
      if (e.kind === 'game') { S.kind = 'game'; if (e.from) S.link = { run: e.from, label: `↔ ${e.fromName || 'the site'}` }; setTitle(`🎮 ${e.title || e.brief.slice(0, 60)}`); feed(null, `🎮 ${e.brief}`, 'you'); break }
      if (!viewing) els.agentsSel.value = String(e.agents.length)
      for (const a of e.agents) addAgent(a)
      setTitle(e.brief.slice(0, 60))
      feed(null, e.ask || e.brief, 'you')
      S.extend = e.extend ? { kept: e.kept } : null
      S.progress = botMsg(e.extend ? 'Planning what to add…' : 'Planning the pages…', true)
      if (!viewing) loadFiles()
      break
    case 'plan:delta': {
      const k = e.page || 'sitemap'
      S.plans.set(k, (S.plans.get(k) || '') + e.text)
      S.planDirty = true
      break
    }
    case 'game:linked':
      S.link = { run: e.game, label: `🎮 ${e.title}` }
      renderAppLink()
      break
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
      if (e.app) radioEvent(e)
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
      if (!e.fixed && !e.kept) for (const ce of S.classEdits) restyle(l, ce)
      l.before = null
      fillImages(l)
      if (e.kept) { S.treeDirty = true; break } // carried over from the last version as it was
      if (e.fixed && !e.restored && l.before && live(e)) remember({ kind: 'layer', key: l.key, page: e.page, layer: e.layer, before: l.before, after: e.html, label: `${l.role || e.layer} rewrite` })
      if (e.restored && e.by !== CLIENT && live(e)) feed(null, `${l.role || e.layer} was put back to an earlier version`, 'sys')
      if (e.fixed && !e.restored) { feed(S.agents.get(e.agent), `fixed ${e.layer}`, 'sys', e.layer); chatAgent(S.agents.get(e.agent), `Done: the ${l.role || e.layer} is updated (${((e.ms || 0) / 1000).toFixed(0)}s). /trace shows what I was asked and wrote.`, e.layer) }
      if (e.done != null) S.done = e.done
      S.treeDirty = true
      const a = S.agents.get(e.agent)
      if (a) {
        if (live(e) && !a.act) startGesture(a, 'resize', l)
        if (live(e)) { a.el.classList.remove('hop'); void a.el.offsetWidth; a.el.classList.add('hop'); setTimeout(() => a.el.classList.remove('hop'), 600) }
        a.layer = null
        setTool(a, 'move', 400)
      }
      break
    }
    case 'layer:failed': {
      const l = S.layers.get(key(e.page, e.layer))
      if (l) { l.status = 'failed'; S.treeDirty = true }
      // a failed fix puts the section back as it was
      if (l && e.keep) { l.text = e.keep; l.ver++; l.status = 'done'; chatAgent(S.agents.get(e.agent), `Couldn't make that change: ${e.message}. Try again, or ask for less at once.`, e.layer) }
      const a = S.agents.get(e.agent)
      if (a) a.layer = null
      feed(a, `failed ${e.layer}: ${e.message}`, 'err')
      break
    }
    case 'crew:act':
      radioEvent(e)
      break
    case 'crew:lead': {
      // the app engine's lead agent, speaking as Hermia: thinking out loud and giving orders
      radioEvent(e)
      if (e.kind === 'reason') { feed(null, `🛰️ Hermia ${e.text}`, 'sys'); break } // her reasoning: the log only, no bubble or order
      feed(null, `🛰️ Hermia${e.to ? ` → ${e.to}` : ''}: ${e.text}`, 'sys')
      const to = e.to && [...S.agents.values()].find(x => x.name === e.to)
      if (to && Date.now() - e.t < 5000) say(to, `Hermia: ${e.text.slice(0, 120)}`, 3200)
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
      pics.pending.delete(`${key(e.page, e.layer)}|${e.gen}`); design.last = ''
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
      if (l) { if (l.text) l.before = l.text; l.text = ''; l.ver++; l.status = 'assigned'; S.treeDirty = true }
      break
    }
    case 'export':
      if (Date.now() - e.t < 8000) showExport(e)
      break
    case 'publish:start': case 'publish:stage': case 'publish:done': case 'publish:failed':
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
    case 'trace':
      traceLive(e)
      break
    case 'auto':
      // a replay moves between views as the live run did
      autoEvent(e, Q.get('replay') ? true : undefined)
      break
    case 'game:spec':
      S.spec = e.spec
      botMsg(`🎮 ${e.spec.title}: ${e.spec.pitch || ''} (${e.spec.engine})`)
      break
    case 'app:start': case 'app:step': case 'app:ready': case 'app:done': case 'app:failed': case 'app:deployed':
      appEvent(e)
      break
  }
  // the Auto show watches the same events; a slip there never stops the canvas
  try { reviewShow(e); deployShow(e); chatterHear(e) } catch (err) { console.error(err) }
}

const key = (page, id) => `${page}/${id}`

// ---------- agents

function addAgent(a) {
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
const crewQuiet = () => document.body.classList.contains('crew-quiet')
function say(a, text, ms = 2800) {
  if (crewQuiet()) return
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
  el.innerHTML = `<div class="frame-label"></div><iframe></iframe>`
  el.querySelector('.frame-label').textContent = `Page ${p.index + 1} · ${p.title}`
  el.querySelector('.frame-label').insertAdjacentHTML('beforeend', `<small>/${p.id}</small>`)
  const iframe = el.querySelector('iframe')
  iframe.setAttribute('aria-label', p.title || 'Page')
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
    // a cap as well, in case a page still finds a way to grow itself (40 screens)
    const h = Math.min(36000, Math.max(700, f.geo.height || 0))
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
  els.camHint.setAttribute('aria-pressed', String(v))
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
    sw.style.background = v
    els.theme.append(sw)
  }
}

// Layers: which sections are expanded or hidden (hidden only on the canvas, not in exports).
const layersOpen = new Set(), layersHidden = new Set()
let treeSel = null, treeRun = null

// What is inside a section, as a designer's layer list: headings, text, images, buttons, links, forms.
function layerKids(html = '') {
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

function selectLayer(l) {
  const s = slotFor(l)
  S.sel = l.key
  design.pinned = null
  if (design.tab !== 'design') { design.tabPinned = true; showDtab('design') }
  design.last = ''
  if (s) { setAuto(false); fit({ x0: s.f.x + s.box.left - 60, y0: s.box.top - 80, x1: s.f.x + s.box.right + 60, y1: s.box.top + s.box.height + 80 }, 0.9) }
  renderTree()
}

function hideLayer(l, hide) {
  hide ? layersHidden.add(l.key) : layersHidden.delete(l.key)
  for (const f of l.page === '*' ? S.frames : S.frames.filter(fr => fr.id === l.page)) post(f, { type: 'slot', key: l.key, hidden: hide })
  if (hide && S.sel === l.key) S.sel = null
  renderTree()
}

function renderTree() {
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
      row.innerHTML = `<span class="tw">${l.status === 'done' ? (open ? '▼' : '▶') : ''}</span><span class="dot"></span><span></span><span class="who"></span><button class="eye" aria-label="${hid ? 'Show' : 'Hide'} on the canvas">${hid ? '◌' : '👁'}</button>`
      row.children[2].textContent = l.role
      if (a) {
        row.children[3].textContent = l.status === 'done' ? `${a.name} ${(l.ms / 1000).toFixed(1)}s` : a.name
        if (l.status !== 'done' && l.status !== 'failed') row.children[1].style.background = a.color
        row.children[3].style.color = a.color
      }
      row.onclick = e => {
        if (e.target.classList.contains('eye')) return hideLayer(l, !hid)
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

// The strip at the top left of the canvas: what is happening, and how far along it is.
function renderStatus(working, done) {
  if (!els.status.firstElementChild) els.status.innerHTML = '<span class="st-dot"></span><span class="st-txt"></span><span class="st-num"></span><span class="st-bar"><i></i></span>'
  const total = S.layers.size, pct = total ? done / total : 0
  const state = !total ? (S.run && !S.tEnd ? 'planning' : 'idle') : done >= total ? 'done' : working ? 'working' : 'paused'
  if (els.status.dataset.state !== state) els.status.dataset.state = state
  setText(els.status.children[1], { idle: 'Ready', planning: 'Planning the pages', done: `${S.frames.length} pages built`, working: `${working} agent${working === 1 ? '' : 's'} building`, paused: 'Stopped' }[state])
  setText(els.status.children[2], total ? `${done}/${total}` : '')
  const w = `${(pct * 100).toFixed(1)}%`
  if (els.status.children[3].firstChild.style.width !== w) els.status.children[3].firstChild.style.width = w
}

function renderToolbar() {
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
function feed(a, text, kind = '', where = '') {
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
}

// An agent answering in the Chat tab (a comment it picked up).
function chatAgent(a, text, where = '') {
  const item = document.createElement('div')
  item.className = 'item reply'
  item.style.setProperty('--c', a?.color || 'var(--accent)')
  item.innerHTML = `<b>${a ? `<span class="av">${Crew.avatar(a.name, 18)}</span>` : HERMIA}${esc(a?.name || 'SWARM')}</b>${esc(text)}${where ? `<span class="where">${esc(where)}</span>` : ''}`
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
  item.innerHTML = `<b>${HERMIA}Hermia<small>planner</small></b><span class="txt"></span>`
  item.querySelector('.txt').textContent = text
  push(els.feed, item)
  return item
}

// a follow-up's reply: what was added or changed, and that the rest is as it was
function extendSummary(e, secs) {
  const names = (e.added || []).map(p => p.title)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  const fixed = (e.changed || []).filter(id => id !== 'nav').length
  const did = [names.length ? `Added ${list}` : '', fixed ? `${names.length ? 'changed' : 'Changed'} ${fixed} section${fixed > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')
  const kept = `${e.kept} page${e.kept === 1 ? '' : 's'} already here ${e.kept === 1 ? 'is' : 'are'} kept`
  return `${did || 'Nothing was added'} in ${secs}s${e.failed ? ` (${e.failed} failed)` : ''}. ${names.length ? `The navigation links the new pages; the ${kept}.` : `The ${kept}.`}`
}

function summarize(e) {
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
    const step = Math.abs(a.sx - (a.lx ?? a.sx)) + Math.abs(a.sy - (a.ly ?? a.sy))
    a.lx = a.sx; a.ly = a.sy
    a.moving = step > 0.8 ? now + 220 : a.moving || 0
    a.el.classList.toggle('moving', now < a.moving)
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
    if (S.treeDirty || treeSel !== S.sel) { S.treeDirty = false; renderTree() }
    if (S.planDirty) {
      S.planDirty = false
      els.plan.textContent = [...S.plans].map(([k, v]) => (k === 'sitemap' ? v.slice(-1200) : `\n# ${k}\n${v.slice(-700)}`)).join('\n')
      els.plan.scrollTop = els.plan.scrollHeight
    }
    const done = [...S.layers.values()].filter(l => l.status === 'done').length
    renderStatus(working, done)
    const busyPages = new Set([...S.agents.values()].map(a => a.layer && S.layers.get(a.layer)?.page).filter(Boolean))
    for (const f of S.frames) f.el.classList.toggle('active', busyPages.has(f.id))
    els.play.disabled = !S.frames.length
    // with no reviewer model yet, Review opens Models to pick one instead of sitting greyed out
    els.reviewBtn.disabled = review.busy || !S.done
    setLabel(els.reviewBtn, review.busy ? 'Reviewing…' : 'Review')
    els.exportBtn.disabled = !S.done || exp.busy
    const pubbing = pub.run === shownRun() && pub.state === 'working'
    const deploying = appv.deploying && appv.run === shownRun()
    els.publishBtn.disabled = (!S.done && !pubbing) || deploying
    setLabel(els.publishBtn, pubbing || deploying ? 'Publishing…' : liveUrl() ? 'Live' : 'Publish')
    const mine = video.run === shownRun()
    els.videoBtn.disabled = !S.done && !(mine && video.src)
    setLabel(els.videoBtn, mine && video.busy ? `Video ${video.pct ? `${video.pct | 0}%` : 'writing…'}` : 'Video')
    if (S.progress) {
      const done = [...S.layers.values()].filter(l => l.status === 'done').length
      setText(S.progress.querySelector('.txt'), S.layers.size
        ? `${S.planText ? `${S.planText} ` : ''}${working} agents building · ${done}/${S.layers.size} sections across ${S.frames.length} pages`
        : 'Planning the pages…')
      if (!S.progress.querySelector('.pbar')) S.progress.insertAdjacentHTML('beforeend', '<span class="pbar"><i></i></span>')
      S.progress.querySelector('.pbar i').style.width = `${S.layers.size ? (done / S.layers.size * 100).toFixed(1) : 4}%`
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
  if (e.metaKey || e.ctrlKey || e.altKey) return
  // the Design panel belongs to the Canvas room; a project has its own Layers inspector
  if (e.key === 'd') return document.body.classList.contains('cosmos-project') || document.body.classList.contains('cosmos-home') ? undefined : togglePanel('design')
  if (e.key === 'p' && S.frames.length) return els.player.hidden ? openPlayer() : closePlayer()
  if (!els.player.hidden) return
  if (e.key === 'v' || e.key === 't' || e.key === 'c') return els.toolbar.querySelector(`[data-tool="${{ v: 'move', t: 'text', c: 'comment' }[e.key]}"]`)?.click()
  if (e.key === 'a') setAuto(true)
  if (e.key === '0') { setAuto(false); const b = bboxActive(); S.frames.length && fit({ x0: S.frames[0].x - 560, y0: -140, x1: S.frames.at(-1).x + FRAME_W, y1: Math.max(...S.frames.map(f => f.h)) }) }
})

// Slash commands in the chat box, the same ones as /swarm in Hermes. Anything
// else is a brief for a new build.
const SLASH = [
  ['help', '', 'what you can type here'],
  ['play', '', 'click through the prototype'],
  ['review', '', 'a vision model checks every page; agents fix what it finds'],
  ['fix', '<what to change>', 'an agent rewrites the selected section, or the page'],
  ['video', '[style] [idea]', 'cut a promo video; styles: auto (AI director), promo, kinetic, slideshow, teaser, story'],
  ['app', '[change]', 'the App view: make this design a working app, or change it'],
  ['game', '[idea]', 'make an original browser game: a few questions, then it builds'],
  ['canvas', '', 'back to the canvas view'],
  ['export', '', 'save as static HTML, React + Tailwind and an ABA handoff'],
  ['publish', '[github|vercel|cloudflare|local]', 'put it live and get the link'],
  ['motion', '[on|off]', 'scroll animations in the prototype'],
  ['files', '', 'all your builds, on Projects'],
  ['open', '<n|words>', 'open a build (n: newest first)'],
  ['info', '', 'this build\'s details, tags and note'],
  ['undo', '', 'take back the last change (⌘Z / Ctrl+Z)'],
  ['redo', '', 'put it back again (⇧⌘Z / Ctrl+Y)'],
  ['trace', '[section|on|off]', 'every model call: what each agent was asked and what it answered'],
  ['folder', '<name|none>', 'file this build in a folder'],
  ['models', '', 'pick the planner, builder and reviewer models'],
  ['new', '', 'start a new build, from Projects'],
]

function slashHelp() {
  botMsg(`Commands: ${SLASH.map(([c, a]) => `/${c}${a ? ' ' + a : ''}`).join(' · ')}. Anything else starts a new build.`)
}

async function runSlash(text) {
  const [head, ...rest] = text.slice(1).split(/\s+/)
  const cmd = head.toLowerCase(), arg = rest.join(' ').trim()
  const needRun = () => { if (shownRun()) return true; botMsg(`/${cmd} needs a build open: make one, or /open one.`); return false }
  switch (cmd) {
    case 'help': case '?': return slashHelp()
    case 'play': return needRun() && openPlayer()
    case 'review': return needRun() && reviewRun()
    case 'fix': if (!arg) return botMsg('Say what to change: /fix make the hero darker'); return needRun() && commandOps.fix({ text: arg })
    case 'video': {
      if (!needRun()) return
      const [first, ...more] = arg.split(/\s+/)
      const style = VIDEO_STYLES.some(([k]) => k === first?.toLowerCase()) ? first.toLowerCase() : null
      return makeVideo({ style, idea: (style ? more.join(' ') : arg).trim() || null })
    }
    case 'app': if (!needRun()) return; return arg ? appAsk(arg) : appv.hasApp || appv.state === 'working' ? setView('app') : (setView('app'), buildApp())
    case 'game': return openGame(arg)
    case 'canvas': return setView('canvas')
    case 'export': return needRun() && exportRunNow()
    case 'publish': return needRun() && publishNow(['local', 'vercel', 'cloudflare', 'github'].includes(arg.toLowerCase()) ? arg.toLowerCase() : 'github')
    case 'motion': return commandOps.motion({ on: arg ? arg.toLowerCase() !== 'off' : undefined })
    // every build lives on Projects now; the side panel is Chat and Log only
    case 'files': case 'search': return window.swarmCosmos ? window.swarmCosmos.go('home') : botMsg('Your builds are on Projects.')
    case 'open': {
      if (!files.length) await loadFiles()
      const f = /^\d+$/.test(arg) ? files[Number(arg) - 1] : files.find(x => fileMatch(x, arg.toLowerCase()))
      if (!f) return botMsg(`No build matches “${arg}”. Find it on Projects.`)
      return openRun(f.id)
    }
    case 'info': {
      if (!files.length) await loadFiles()
      const f = files.find(x => x.id === shownRun())
      return f ? fileInfo(f) : botMsg('Open a saved build first.')
    }
    case 'undo': return undo()
    case 'redo': return redo()
    case 'trace': {
      if (!needRun()) return
      if (/^(on|off)$/i.test(arg)) { await saveMeta(shownRun(), { trace: arg.toLowerCase() === 'on' }); return botMsg(`Traces for this build are ${arg.toLowerCase()}.`) }
      const l = !arg && S.sel && S.layers.get(S.sel)
      return traceView(shownRun(), l ? { layer: l.id, title: l.role || l.id } : arg ? { layer: arg, title: arg } : {})
    }
    case 'folder': {
      if (!needRun()) return
      if (!arg) return botMsg('Say which folder: /folder Clients, or /folder none.')
      if (!files.length) await loadFiles()
      await fileInto(shownRun(), /^none$/i.test(arg) ? '' : arg.slice(0, 40))
      return botMsg(/^none$/i.test(arg) ? 'Took this build out of its folder.' : `Filed in ${arg}.`)
    }
    case 'models': return toggleModels()
    case 'new': return window.swarmCosmos ? window.swarmCosmos.go('home') : botMsg('Start a new build from Projects.')
    default: botMsg(`No /${cmd} command.`); return slashHelp()
  }
}

// The command list that pops up while typing /
const slashPop = document.createElement('div')
slashPop.className = 'slash-pop'
slashPop.hidden = true
els.form.append(slashPop)
let slashAt = 0
function slashMatches() {
  const v = els.brief.value
  if (!v.startsWith('/') || /\s/.test(v)) return []
  const q = v.slice(1).toLowerCase()
  return SLASH.filter(([c]) => c.startsWith(q))
}
function renderSlash() {
  const m = slashMatches()
  slashPop.hidden = !m.length
  if (!m.length) return
  slashAt = Math.min(slashAt, m.length - 1)
  slashPop.innerHTML = m.map(([c, a, d], i) => `<div class="sl${i === slashAt ? ' on' : ''}" data-c="${c}"><b>/${c}</b> <span class="sa">${esc(a)}</span><span class="sd">${esc(d)}</span></div>`).join('')
}
function pickSlash(c) {
  const takes = SLASH.find(x => x[0] === c)?.[1]
  els.brief.value = `/${c}${takes ? ' ' : ''}`
  slashPop.hidden = true
  els.brief.focus()
  if (!takes) els.form.requestSubmit()
}
slashPop.addEventListener('mousedown', e => { const d = e.target.closest('[data-c]'); if (d) { e.preventDefault(); pickSlash(d.dataset.c) } })
els.brief.addEventListener('input', () => { slashAt = 0; renderSlash() })
els.brief.addEventListener('blur', () => setTimeout(() => (slashPop.hidden = true), 150))

// A message goes to the open build (web/route.js): an edit of the selected section (/fix), or the
// project's next version, which keeps every page and adds what was asked. window.swarm.submit
// says where its words go: Projects home starts a new project, a project's dock extends it.
let nextRoute = null
els.form.addEventListener('submit', async e => {
  e.preventDefault()
  const brief = els.brief.value.trim()
  if (!brief) return
  if (/^\/[a-z?]/i.test(brief)) {
    els.brief.value = ''
    slashPop.hidden = true
    feed(null, `› ${brief}`, '')
    try { await runSlash(brief) } catch (err) { botMsg(`/${brief.slice(1).split(' ')[0]} failed: ${err.message}`) }
    return
  }
  // the chat follows the view: the app's next change, or an idea for the video
  if (view === 'app' && shownRun()) { els.brief.value = ''; return appAsk(brief) }
  if (view === 'video' && shownRun()) { els.brief.value = ''; feed(null, `🎬 ${brief}`, 'you'); return makeVideo({ idea: brief }) }
  // a guest names themself before the first build (docs/specs/13-hosted-studio.md)
  if (hosted && !(await hosted.ready())) return
  const to = nextRoute || { from: shownRun(), selected: !!S.sel }
  nextRoute = null
  const route = to.fresh ? 'new' : routeMessage({ text: brief, run: to.from, site: S.kind !== 'game' && S.frames.length > 0, selected: to.selected, hosted: !!hosted })
  if (route === 'fix') { els.brief.value = ''; feed(null, `› ${brief}`, 'you'); return commandOps.fix({ text: brief }) }
  setAuto(true)
  const res = await api('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief, agents: Number(els.agentsSel.value), ...(to.project ? { project: to.project } : {}), ...(route === 'extend' ? { from: to.from } : {}) }) }).catch(() => null)
  if (res?.ok) { els.brief.value = ''; hosted?.refresh() }
  else if (hosted && res) hosted.refuse(await res.json().catch(() => ({})))
  else feed(null, `Couldn't start the run${res ? ` (${res.status})` : ''}. Is the canvas server running?`, 'err')
})
els.brief.addEventListener('keydown', e => {
  if (!slashPop.hidden) {
    const m = slashMatches()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); slashAt = (slashAt + (e.key === 'ArrowDown' ? 1 : m.length - 1)) % m.length; return renderSlash() }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && m[slashAt] && els.brief.value.trim() !== `/${m[slashAt][0]}`)) { e.preventDefault(); return pickSlash(m[slashAt][0]) }
    if (e.key === 'Escape') { slashPop.hidden = true; return }
  }
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
body.hint [data-goto]{outline:3px solid #8e8e93cc;outline-offset:2px}
.tour-hover{outline:2px solid #8e8e93aa;outline-offset:3px;filter:brightness(1.06)}
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
      body += `<div class="dval${(design.chg.get(id) || 0) > now ? ' chg' : ''}${editable ? ' edit' : ''}"${editable ? ` data-edit="${r.edit}"` : ''}>${r.label ? `<i>${r.label}</i>` : ''}${r.val}</div>`
    }
    if (sec) body += '</div></div>'
    const where = `${l.page === '*' ? 'shared' : l.page} · ${l.status === 'done' ? 'done' : 'building'}`
    const mode = S.sel ? 'selected ✕' : design.pinned ? 'pinned' : 'following'
    const hint = l.status === 'done' ? '<div class="dhint">Click a value to change this section. Variables change every page.</div>' : `<div class="dhint">Editable when ${esc(owner?.name || 'its agent')} finishes. Click any finished section on the canvas to edit it.</div>`
    html = `<div class="dsel"><span class="dot" style="background:${owner?.color || '#888'}"></span><div><b>${esc(l.role || l.id)}</b><small>${esc(owner?.name || '')} · ${esc(where)}</small></div><span class="pin">${mode}</span></div>${hint}${l.status === 'done' && S.run ? `<div class="drow2"><button class="dtrace" aria-label="Every model call for this section: the prompt and what came back">🔍 Trace</button><button class="dversions" aria-label="Every version this section has had; put any one back">🕘 Versions</button></div>` : ''}${l.status === 'done' ? picturesHtml(l) : ''}${body}`
  }
  if (html !== design.last) {
    design.last = html
    els.dDesign.innerHTML = html
    const pin = els.dDesign.querySelector('.pin')
    if (pin) pin.onclick = () => { if (S.sel) S.sel = null; else design.pinned = design.pinned ? null : design.agent; design.last = '' }
    const tr = els.dDesign.querySelector('.dtrace')
    const vs = els.dDesign.querySelector('.dversions')
    if (vs) vs.onclick = () => { const l = S.layers.get(S.sel || design.layer); if (l) sectionVersions(l, vs) }
    wirePictures(S.layers.get(S.sel || design.layer))
    if (tr) tr.onclick = () => { const l = S.layers.get(S.sel || design.layer); if (l) traceView(S.run, { layer: l.id, title: l.role || l.id }) }
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
  const colors = Object.entries(t.vars || {}).map(([k, v]) => `<div class="dvar edit${anim()}" data-var="${esc(k)}"><span class="sw" style="background:${esc(v)}"></span><div><code>${esc(k.slice(2))}</code><br><small>${esc(v)}</small></div><small>${uses(k.slice(2))}×</small></div>`).join('')
  const fontRow = (role, name) => `<div class="dvar edit${anim()}" data-font="${role}" style="grid-template-columns:44px 1fr auto"><span class="ag" style="font:600 24px/1 '${esc(name)}',serif">Ag</span><div><code>${role}</code><br><small>${esc(name)}</small></div><small>${uses(`font-${role}`)}×</small></div>`
  const sizes = {}
  for (const m of texts.matchAll(/(?:^|\s)(?:(?:sm|md|lg|xl):)?text-(xs|sm|base|lg|xl|[2-9]xl)\b/g)) sizes[m[1]] = (sizes[m[1]] || 0) + 1
  const scale = Object.entries(sizes).sort((a, b) => TW_SIZE[b[0]] - TW_SIZE[a[0]]).slice(0, 7).map(([k, n]) => {
    const px = TW_SIZE[k], heading = px >= 24
    return `<div class="dscale edit" data-size="${k}"><code>${k} · ${px}</code><span style="font:${heading ? 600 : 400} ${Math.min(px, 22)}px '${esc(heading ? t.fonts?.heading : t.fonts?.body)}',sans-serif">${heading ? 'Heading' : 'Body text'}</span><small>${n}×</small></div>`
  }).join('')
  const html = `${fresh ? '<div class="dsetup">Setting up the design system</div>' : ''}
<div class="dsec"><h4>${esc(t.name || 'Theme')}<small>${esc(t.direction || '').slice(0, 40)}</small></h4></div>
<div class="dsec"><h4>Colors<small>${Object.keys(t.vars || {}).length} tokens</small></h4>${colors}</div>
<div class="dsec"><h4>Typography</h4>${fontRow('heading', t.fonts?.heading || 'Georgia')}${fontRow('body', t.fonts?.body || 'Inter')}</div>
<div class="dsec"><h4>Scale<small>whole site</small></h4><div class="dsteps"><span>Type</span><button data-scale="type:-1" aria-label="Every heading one step smaller">−</button><button data-scale="type:1" aria-label="Every heading one step bigger">+</button><span>Spacing</span><button data-scale="space:-1" aria-label="Tighter spacing everywhere">−</button><button data-scale="space:1" aria-label="Looser spacing everywhere">+</button></div></div>
${scale ? `<div class="dsec"><h4>Type scale<small>click to remap</small></h4>${scale}</div>` : ''}
<div class="dsec"><h4>Radius</h4><div class="dvar edit${anim()}" data-radius="" style="grid-template-columns:18px 1fr auto"><span class="sw" style="border-radius:${esc(t.radius || '12px')};border:2px solid var(--accent);background:none"></span><code>radius</code><small>${esc(t.radius || '')} · ${uses('radius')}×</small></div></div>`
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
  if (!edit.quiet) remember(undoFor(e))
  delete e.quiet
  applyEdit(e)
  if (edit.quiet) return saveEdit(run, e)
  feed(null, `You edited the design: ${describeEdit(e)}`, 'sys')
  const owner = e.kind === 'section' && S.agents.get(S.layers.get(e.layer)?.agent)
  const a = owner || pick([...S.agents.values()].filter(x => x.layer) .concat([...S.agents.values()]))
  if (a) setTimeout(() => say(a, pick(REACT[e.kind](e))), 500)
  return saveEdit(run, e)
}
async function saveEdit(run, e) {
  const res = await api(`/api/runs/${encodeURIComponent(run)}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) }).catch(() => null)
  if (!res?.ok) feed(null, 'That edit is shown here but could not be saved with the file.', 'err')
}

// ---------- undo and redo: ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y. Your design edits and the
// agents' rewrites of a section both go back, and stay back when the file reopens.
function remember(step) {
  if (!step) return
  history.undo.push(step)
  if (history.undo.length > 100) history.undo.shift()
  history.redo = []
  renderUndo()
}
// what puts an edit back: the value before it, or the section as it was
function undoFor(e) {
  const t = S.theme || {}
  if (e.kind === 'var') return { kind: 'edit', label: describeEdit(e), back: { kind: 'var', name: e.name, value: t.vars?.[e.name] }, again: { kind: 'var', name: e.name, value: e.value } }
  if (e.kind === 'font') return { kind: 'edit', label: describeEdit(e), back: { kind: 'font', role: e.role, value: t.fonts?.[e.role] }, again: { kind: 'font', role: e.role, value: e.value } }
  if (e.kind === 'radius') return { kind: 'edit', label: describeEdit(e), back: { kind: 'radius', value: t.radius }, again: { kind: 'radius', value: e.value } }
  if (e.kind === 'scale') return { kind: 'edit', label: describeEdit(e), back: { kind: 'scale', axis: e.axis, value: String(-Number(e.value)) }, again: { kind: 'scale', axis: e.axis, value: e.value } }
  if (e.kind === 'size') return { kind: 'edit', label: describeEdit(e), back: { kind: 'size', from: e.value, value: e.from }, again: { kind: 'size', from: e.from, value: e.value } }
  if (e.kind === 'section') {
    const l = S.layers.get(e.layer)
    if (!l?.text) return null
    return { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: null, edit: e, label: describeEdit(e) }
  }
  return null
}
async function restoreLayer(step, html, why) {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  const l = S.layers.get(step.key)
  if (!run || !l || html == null) return
  l.text = html; l.ver++; l.status = 'done'; S.treeDirty = true
  design.last = ''
  await api(`/api/runs/${encodeURIComponent(run)}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: step.page, layer: step.layer, html, by: CLIENT, why }) }).catch(() => null)
}
async function undo() {
  const step = history.undo.pop()
  if (!step) return botMsg('Nothing to undo.')
  if (step.kind === 'edit') { if (step.back.value != null) await commitEdit({ ...step.back, quiet: true }) }
  else {
    // a section edit: keep what it looked like after, for redo
    if (step.after == null) step.after = S.layers.get(step.key)?.text
    await restoreLayer(step, step.before, 'undo')
  }
  history.redo.push(step)
  feed(null, `↶ Undid ${step.label}`, 'sys')
  renderUndo()
}
async function redo() {
  const step = history.redo.pop()
  if (!step) return botMsg('Nothing to redo.')
  if (step.kind === 'edit') await commitEdit({ ...step.again, quiet: true })
  else await restoreLayer(step, step.after, 'redo')
  history.undo.push(step)
  feed(null, `↷ Redid ${step.label}`, 'sys')
  renderUndo()
}
function renderUndo() {
  const u = document.getElementById('undo-btn'), r = document.getElementById('redo-btn')
  if (!u) return
  u.disabled = !history.undo.length
  r.disabled = !history.redo.length
}
document.getElementById('undo-btn').onclick = () => undo()
document.getElementById('redo-btn').onclick = () => redo()
window.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return
  // typing in a field keeps the field's own undo
  if (e.target.closest('input, textarea, select, [contenteditable]')) return
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if ((k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey)) { e.preventDefault(); redo() }
})

// Every version a section has had: as built, each fix, each restore. Any one comes back.
async function sectionVersions(l, at) {
  document.querySelector('.fmenu')?.remove()
  const run = viewing && viewing !== 'new' ? viewing : S.run
  const events = await (await api(`/api/runs/${encodeURIComponent(run)}/events`)).json().catch(() => [])
  const asks = events.filter(e => e.type === 'comment:take' && e.page === l.page && e.layer === l.id)
  // each distinct version once, named after where it first came from (undo and redo only repeat one)
  const seen = new Set()
  const versions = events.filter(e => e.type === 'layer:done' && e.page === l.page && e.layer === l.id && e.html && !seen.has(e.html) && seen.add(e.html))
  const m = document.createElement('div')
  m.className = 'fmenu versions'
  const when = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const what = e => e.restored ? (e.why === 'text' ? 'your text edit' : 'put back') : e.fixed ? `rewrite${(() => { const a = asks.filter(x => x.t <= e.t).at(-1); return a ? `: “${a.text.slice(0, 40)}”` : ' after review' })()}` : 'as built'
  m.innerHTML = `<div class="fmh">Versions of ${esc(l.role || l.id)}</div>${versions.slice().reverse().map((e, i) => `<button data-i="${versions.length - 1 - i}"${e.html === l.text ? ' class="on"' : ''}>${esc(when(e.t))} · ${esc(what(e))} · ${Math.round(e.html.length / 100) / 10}k${e.html === l.text ? ' ✓ now' : ''}</button>`).join('') || '<div class="fmh">No saved versions.</div>'}`
  document.body.append(m)
  const r = at.getBoundingClientRect()
  Object.assign(m.style, { top: `${Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)}px`, left: `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px` })
  const close = () => { m.remove(); removeEventListener('mousedown', away) }
  const away = e => { if (!m.contains(e.target)) close() }
  setTimeout(() => addEventListener('mousedown', away))
  m.onclick = async e => {
    const b = e.target.closest('button[data-i]')
    if (!b) return
    close()
    const v = versions[Number(b.dataset.i)]
    if (v.html === l.text) return
    const step = { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: v.html, label: `${l.role || l.id} back to ${when(v.t)}` }
    remember(step)
    await restoreLayer(step, v.html, 'version')
    feed(null, `🕘 ${l.role || l.id} is back to the ${when(v.t)} version (⌘Z undoes it)`, 'sys')
  }
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
  if (txt.mode && S.sel && S.layers.get(S.sel)?.status === 'done') { txt.mode = false; toolbarKey = ''; els.viewport.classList.remove('texting'); textEdit(S.layers.get(S.sel)) }
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
  exp.el.innerHTML = `<div class="vhead pop-title"><span>Exported, <em>ready</em></span><button class="vclose" aria-label="Close">${ico('x')}</button></div>
    <div class="xrow"><b>html/</b><span>${e.pages} pages, open index.html</span></div>
    <div class="xrow"><b>react/</b><span>${e.sections} section components · Vite + Tailwind · <code>npm i && npm run dev</code></span></div>
    <div class="xrow"><b>aba/</b><span>spec.md + blueprint.json for an app builder</span></div>
    <div class="xpath">${esc(e.dir)}</div>
    <div class="vfoot"><span></span>${e.zip ? `<a class="vagain" href="${zip}" download>Download .zip</a>` : ''}</div>`
  document.body.append(exp.el)
  exp.el.querySelector('.vclose').onclick = () => { exp.el.remove(); exp.el = null }
  closeable(exp.el, () => { exp.el?.remove(); exp.el = null })
  feed(null, `⬇ exported ${e.pages} pages to ${e.dir}`, 'sys')
}

els.exportBtn.onclick = () => exportRunNow()
commandOps.export = () => exportRunNow()

// ---------- publish: a live link on GitHub Pages (the person's gh login), or this computer
const pub = { run: null, state: 'none', stage: '', target: 'github', el: null, hosts: undefined, live: {}, liveTarget: '', message: '', pending: false }
const PUB_STAGES = {
  github: { export: 'Exporting the pages', repo: 'Making the GitHub repo', push: 'Pushing the site', pages: 'Turning on GitHub Pages', building: 'GitHub is building it' },
  vercel: { export: 'Exporting the pages', project: 'Setting up the Vercel project', upload: 'Uploading the files', building: 'Vercel is deploying it' },
  cloudflare: { export: 'Exporting the pages', project: 'Setting up the Pages project', upload: 'Uploading the files', building: 'Cloudflare is going live' },
}

function pubPop(html, title = 'Publish the <em>website</em>') {
  pub.el?.remove()
  pub.el = document.createElement('div')
  pub.el.className = 'export-pop publish-pop'
  pub.el.innerHTML = `<div class="vhead pop-title"><span>${title}</span><button class="vclose" aria-label="Close">${ico('x')}</button></div>${html}`
  document.body.append(pub.el)
  pub.el.querySelector('.vclose').onclick = () => { pub.el.remove(); pub.el = null }
  closeable(pub.el, () => { pub.el?.remove(); pub.el = null }, { extra: ['#pub-menu', '.pubwrap'] })
  return pub.el
}

// Name plus three words at most; never an account name or email (docs/ux/RULES.md).
const HOSTS = {
  github: { label: 'GitHub Pages', how: 'public link', off: 'run gh auth login' },
  vercel: { label: 'Vercel', how: 'public link' },
  cloudflare: { label: 'Cloudflare', how: 'public link' },
  local: { label: 'This computer', how: 'only you' },
}
// the build's link: the newest public one, or the local one if it has no public one
const liveUrl = () => pub.run === shownRun() ? (pub.live[pub.liveTarget] || '') : ''
const shortUrl = u => String(u).replace(/^https?:\/\//, '').replace(/\/$/, '')

// Copy that works inside Hermes's sandboxed frame too: the Clipboard API is refused
// there (no clipboard-write), so fall back to a hidden textarea and execCommand,
// and if that fails as well, select the link so ⌘C works. The button says what happened.
function copyText(text, btn, selectEl) {
  let ok = false
  const legacy = () => {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'
    document.body.append(ta); ta.focus(); ta.select()
    try { ok = document.execCommand('copy') } catch { ok = false }
    ta.remove()
  }
  const done = () => {
    if (!ok && selectEl) { const r = document.createRange(); r.selectNodeContents(selectEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r) }
    if (!btn) return
    const was = btn.dataset.label || (btn.dataset.label = btn.textContent)
    btn.textContent = ok ? 'Copied' : 'Press ⌘C'
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = was }, 1800)
  }
  // inside Hermes (a sandboxed frame): the plugin copies it with the system clipboard
  if (framed) return hostAsk({ type: 'swarm-studio:copy', text }).then(r => { ok = !!r?.ok; if (!ok) legacy(); done() })
  // the legacy path first while the click still counts as a user gesture; the async API after
  legacy()
  if (ok || !navigator.clipboard?.writeText) return done()
  navigator.clipboard.writeText(text).then(() => { ok = true }, () => {}).finally(done)
}
// Hermes's frame can't open a window either: links go out through the plugin
const framed = window.parent !== window
let hostSeq = 0
function hostAsk(msg, ms = 1500) {
  const id = ++hostSeq
  return new Promise(resolve => {
    const t = setTimeout(() => { removeEventListener('message', on); resolve(null) }, ms)
    const on = ev => { if (ev.source === window.parent && ev.data?.type === 'swarm-studio:copied' && ev.data.id === id) { clearTimeout(t); removeEventListener('message', on); resolve(ev.data) } }
    addEventListener('message', on)
    window.parent.postMessage({ ...msg, id }, '*')
  })
}
if (framed) document.addEventListener('click', e => {
  const a = e.target.closest?.('a[target="_blank"][href^="http"]')
  if (!a) return
  e.preventDefault()
  window.parent.postMessage({ type: 'swarm-studio:open', url: a.href }, '*')
}, true)

async function publishMenu(force) {
  if (pub.hosts === undefined || force) {
    if (!pub.el) pubPop('<div class="pstage">Checking…</div>')
    const res = await api('/api/publish').catch(() => null)
    pub.hosts = (await res?.json().catch(() => null)) || {}
  }
  const h = pub.hosts
  const signed = id => (id === 'github' ? h.github : h[id]?.user)
  const opt = (id, on = true) => `<button class="popt" data-target="${id}"${on ? '' : ' disabled'}><b>${HOSTS[id].label}</b><span>${on ? HOSTS[id].how : HOSTS[id].off}</span></button>`
  const row = id => {
    if (signed(id) || id === 'github') return `<div class="prow">${opt(id, !!signed(id))}${signed(id) && id !== 'github' && !h[id]?.env ? `<button class="pdisc" data-disc="${id}" aria-label="Disconnect ${HOSTS[id].label}">Disconnect</button>` : ''}</div>`
    const url = h.providers?.[id]?.tokenUrl || '#'
    return `<details class="pconn"><summary><b>Connect ${HOSTS[id].label}</b><span><a href="${esc(url)}" target="_blank" rel="noopener">Get a token</a></span></summary>
      <form data-conn="${id}"><input type="password" autocomplete="off" spellcheck="false" aria-label="${HOSTS[id].label} token" placeholder="Paste the token"><button>Connect</button></form><div class="perr"></div></details>`
  }
  const el = pubPop(`${['github', 'vercel', 'cloudflare'].map(row).join('')}<div class="prow">${opt('local')}</div>`)
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
      err.textContent = shortReason(out?.error)
    }
  })
}

// one short reason, never a stack or a wall of text
const shortReason = m => {
  const t = String(m || 'the studio server is not answering').split('\n')[0].replace(/^Error:\s*/, '')
  return t.length > 90 ? `${t.slice(0, 88).replace(/\s+\S*$/, '')}…` : t
}

// The three states, always shown: publishing (the steps), live (the link, Copy, Open), failed (why, Retry).
function pubShow() {
  posted.alone = false
  if (pub.state === 'working') {
    const names = PUB_STAGES[pub.target]
    if (!names) return pubPop('<div class="pstage">Publishing…</div>')
    const steps = Object.keys(names), at = Math.max(0, steps.indexOf(pub.stage))
    return pubPop(`<div class="psteps">${steps.map((k, i) => `<div class="${i < at ? 'did' : i === at ? 'now' : ''}">${i < at ? '✓' : i === at ? '◌' : '·'} ${names[k]}</div>`).join('')}</div>`)
  }
  if (pub.state === 'failed') {
    const el = pubPop(`<div class="pstate err"><b>Not published</b><span>${esc(shortReason(pub.message))}</span></div>
      <div class="vfoot"><button class="vagain pother">Other host</button><button class="vagain pretry">Retry</button></div>`)
    el.querySelector('.pretry').onclick = () => publishNow(pub.target)
    el.querySelector('.pother').onclick = () => publishMenu()
    return el
  }
  const url = liveUrl()
  if (!url) return publishMenu()
  const el = pubPop(`<div class="pstate live"><b>Live</b><span>${esc(HOSTS[pub.liveTarget]?.label || '')}${pub.pending ? ' · going live' : ''}</span></div>
    <div class="plink"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(shortUrl(url))}</a></div>
    <div class="vfoot"><button class="vagain pagain">Publish again</button><button class="vagain pcopy">Copy link</button><a class="vagain" href="${esc(url)}" target="_blank" rel="noopener">Open ↗</a></div>
    ${feedRow()}`)
  el.querySelector('.pcopy').onclick = ev => copyText(url, ev.currentTarget, el.querySelector('.plink a'))
  el.querySelector('.pagain').onclick = () => publishMenu()
  wireFeedRow(el)
  return el
}

// Post to Feed, under the Live link: Public (in the feed) or Unlisted (link only), one button.
const posted = { runs: new Map(), busy: false, unlisted: false, note: '', connect: null, alone: false }
function feedPop() {
  posted.alone = true
  const el = pubPop(feedRow(), 'Post to the <em>Feed</em>')
  wireFeedRow(el)
}
const feedRefresh = () => (posted.alone ? feedPop() : pubShow())
function feedRow() {
  const run = shownRun(), done = posted.runs.get(run)
  if (done) return `<div class="pfeed"><div class="pstate live"><b>In the Feed</b><span>${done.unlisted ? 'Unlisted' : 'Public'}</span></div><div class="plink"><a href="${esc(done.url)}" target="_blank" rel="noopener">${esc(shortUrl(done.url))}</a></div></div>`
  if (posted.connect) return `<div class="pfeed"><div class="pstate"><b>Connect Hermes</b><span>${posted.connect.code ? esc(posted.connect.code) : ''}</span></div>
    <div class="vfoot">${posted.connect.url ? `<a class="vagain" href="${esc(posted.connect.url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}<button class="vagain pfpost">Post</button></div></div>`
  return `<div class="pfeed"><div class="pseg" role="radiogroup" aria-label="Who can find it">
      <button role="radio" aria-checked="${!posted.unlisted}" class="${posted.unlisted ? '' : 'on'}" data-v="public">Public</button>
      <button role="radio" aria-checked="${posted.unlisted}" class="${posted.unlisted ? 'on' : ''}" data-v="unlisted">Unlisted</button></div>
    <button class="ui-btn ui-btn-default pfpost" ${posted.busy ? 'disabled' : ''}>${posted.busy ? 'Posting…' : 'Post to Feed'}</button>
    ${posted.note ? `<div class="pstate err"><span>${esc(shortReason(posted.note))}</span></div>` : ''}</div>`
}
function wireFeedRow(el) {
  el.querySelectorAll('.pseg button').forEach(b => { b.onclick = () => { posted.unlisted = b.dataset.v === 'unlisted'; feedRefresh() } })
  const go = el.querySelector('.pfpost')
  if (go) go.onclick = postToFeedNow
}
async function postToFeedNow() {
  const run = shownRun()
  if (!run || posted.busy) return
  Object.assign(posted, { busy: true, note: '' })
  feedRefresh()
  const json = { method: 'POST', headers: { 'content-type': 'application/json' } }
  const post = () => api(`/api/runs/${encodeURIComponent(run)}/feed`, { ...json, body: JSON.stringify({ unlisted: posted.unlisted }) }).then(r => r.json()).catch(() => ({ ok: false }))
  let out = await post()
  if (!out.ok && out.connect) {
    // not linked yet: start (or finish) Connect Hermes; once the code is approved, post straight away
    const c = await api('/api/feed/connect', { ...json, body: '{}' }).then(r => r.json()).catch(() => ({}))
    if (c.connected) out = await post()
    else posted.connect = c
  }
  posted.busy = false
  if (out.ok) {
    posted.connect = null
    posted.runs.set(run, { url: out.url, unlisted: !!out.unlisted || posted.unlisted })
  } else if (!out.connect) posted.note = out.message || 'The Feed did not take it.'
  feedRefresh()
}

async function publishNow(target = 'github') {
  const run = shownRun()
  if (!run) return
  Object.assign(pub, { run, state: 'working', stage: 'export', target, message: '' })
  pubShow()
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, sections }) }).catch(() => null)
  if (!res?.ok) {
    const out = await res?.json().catch(() => ({}))
    Object.assign(pub, { state: 'failed', message: out?.error })
    pubShow()
  }
}

// Every publish event, replayed or live, updates the build's state, so the Live link
// is back after a reload or a server restart (the events are saved with the build).
function publishEvent(e) {
  if (e.run !== shownRun()) return
  if (pub.run !== e.run) Object.assign(pub, { run: e.run, live: {}, state: 'none', liveTarget: '' })
  const fresh = !e.t || Date.now() - e.t < 8000
  if (e.type === 'publish:start' || e.type === 'publish:stage') {
    if (!fresh) return
    Object.assign(pub, { state: 'working', stage: e.stage || 'export', target: e.target || pub.target })
  } else if (e.type === 'publish:failed') {
    Object.assign(pub, { state: 'failed', message: e.message, target: e.target || pub.target })
  } else {
    pub.live[e.target] = e.url
    if (e.target !== 'local' || !pub.liveTarget || pub.liveTarget === 'local') pub.liveTarget = e.target
    Object.assign(pub, { state: 'done', pending: !!e.pending })
    if (fresh) feed(null, `🌐 live: ${e.url}`, 'sys')
  }
  pubButton()
  // a pop that is open follows along; a fresh result opens it, so it never ends silently
  if (fresh || pub.el) pubShow()
}

// The Publish button says the state: Publishing…, Live, or Publish.
function pubButton() {
  const mine = pub.run === shownRun()
  const live = mine && liveUrl() && pub.state !== 'working'
  els.publishBtn.classList.toggle('live', !!live)
  const box = $('#pub-menu .pub-live')
  if (!box) return
  box.hidden = !live
  if (live) {
    const url = liveUrl(), a = box.querySelector('a')
    a.href = url; a.textContent = shortUrl(url)
  }
}

commandOps.publish = c => publishNow(['local', 'vercel', 'cloudflare'].includes(c.target) ? c.target : 'github')

// ---------- comments: tell an agent what to change
// A 💬 pin sits on the selected section; open, it is a little composer. The
// Comment tool in the toolbar arms it: the next section clicked opens it. A
// comment with no section (from /swarm fix) is routed by the planner.
const cmt = { mode: false, open: null, el: null, key: '' }
const txt = { mode: false }
const USER_TOOLS = { move: true, text: true, comment: true }

// ✏️ Text: every piece of text in a section as a field. Saved as the section's new
// version, so ⌘Z undoes it and it stays when the file reopens.
function textEdit(l) {
  document.querySelector('.finfo-wrap')?.remove()
  const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg, script, style')) nodes.push(n)
  if (!nodes.length) return botMsg('That section has no text to edit.')
  const wrap = document.createElement('div')
  wrap.className = 'finfo-wrap'
  wrap.innerHTML = `<div class="finfo textedit"><button class="fix" aria-label="Close">×</button><h3>✏️ Edit text <small></small></h3><div class="te-list"></div><div class="fi-foot"><span class="dim">Tip: ⌘Z undoes it after saving.</span><button class="fi-save">Save</button></div></div>`
  wrap.querySelector('h3 small').textContent = l.role || l.id
  const list = wrap.querySelector('.te-list')
  nodes.forEach((n, i) => {
    const t = n.textContent.trim(), tag = n.parentElement.tagName.toLowerCase()
    const row = document.createElement('label')
    row.innerHTML = `<span>${esc(/^h[1-6]$/.test(tag) ? 'heading' : tag === 'a' || tag === 'button' ? 'button / link' : tag === 'p' ? 'text' : tag)}</span>`
    const f = document.createElement(t.length > 60 ? 'textarea' : 'input')
    f.value = t.replace(/\s+/g, ' ')
    f.dataset.i = i
    if (f.tagName === 'TEXTAREA') f.rows = Math.min(5, Math.ceil(t.length / 70))
    row.append(f)
    list.append(row)
  })
  document.body.append(wrap)
  const close = () => { wrap.remove(); removeEventListener('keydown', key) }
  const key = e => { if (e.key === 'Escape') close() }
  addEventListener('keydown', key)
  wrap.onclick = e => { if (e.target === wrap) close() }
  wrap.querySelector('.fix').onclick = close
  wrap.querySelector('.fi-save').onclick = async () => {
    let changed = 0
    for (const f of list.querySelectorAll('[data-i]')) {
      const n = nodes[Number(f.dataset.i)], old = n.textContent, now = f.value.trim()
      if (now === old.trim().replace(/\s+/g, ' ')) continue
      // keep the spacing around the words
      n.textContent = old.match(/^\s*/)[0] + now + old.match(/\s*$/)[0]
      changed++
    }
    close()
    if (!changed) return
    const step = { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: doc.body.innerHTML.trim(), label: `text in ${l.role || l.id}` }
    remember(step)
    await restoreLayer(step, step.after, 'text')
    feed(null, `✏️ You changed ${changed} piece${changed > 1 ? 's' : ''} of text in ${l.role || l.id}`, 'sys')
  }
  list.querySelector('[data-i]')?.focus()
}

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
      : '<button class="cpin" aria-label="Comment: tell an agent what to change here">💬</button>'
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
  const tool = e.target.closest('[data-tool]')?.dataset.tool
  if (tool === 'move') { cmt.mode = txt.mode = false; toolbarKey = ''; els.viewport.classList.remove('commenting', 'texting'); return }
  if (tool === 'text') {
    cmt.mode = false; els.viewport.classList.remove('commenting')
    const l = S.sel && S.layers.get(S.sel)
    if (l?.status === 'done') { txt.mode = false; toolbarKey = ''; return textEdit(l) }
    txt.mode = !txt.mode; toolbarKey = ''
    els.viewport.classList.toggle('texting', txt.mode)
    if (txt.mode) feed(null, '✏️ Click a section to edit its words.', 'sys')
    return
  }
  if (tool !== 'comment') return
  txt.mode = false; els.viewport.classList.remove('texting')
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
const FN_JS = `function fontEmbedCSS() {
    // html-to-image can't read a stylesheet from another origin (Google Fonts), so a
    // snapshot fell back to system fonts and a resting page seemed to change font.
    // Fetch the faces ourselves (latin only, each file once) and hand them over inlined.
    const href = document.querySelector('link[href*="fonts.googleapis.com"]')?.href || ''
    if (!href) return Promise.resolve('')
    if (fontEmbedCSS.href !== href) {
      fontEmbedCSS.href = href
      const files = new Map()
      const inline = u => files.get(u) || files.set(u, fetch(u).then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b) }))).get(u)
      fontEmbedCSS.css = fetch(href).then(r => r.text()).then(async css => {
        const blocks = css.split(/(?=\\/\\* [\\w-]+ \\*\\/)/).filter(b => !/^\\/\\* /.test(b) || /^\\/\\* latin(-ext)? \\*\\//.test(b))
        const out = await Promise.all(blocks.map(async b => {
          for (const u of new Set([...b.matchAll(/url\\((https:[^)]+)\\)/g)].map(m => m[1]))) b = b.split(u).join(await inline(u))
          return b
        }))
        return out.join('\\n')
      }).catch(() => '')
    }
    return fontEmbedCSS.css
  }`
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
    const css = await (${FN_JS})()
    if (css) opts.fontEmbedCSS = css
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

els.reviewBtn.onclick = e => { if (!reviewerOn()) { e.stopPropagation(); return toggleModels(true) } reviewRun() }

// ---------- promo video
// The planner storyboards the build into a few scenes, each handed to an agent,
// and HyperFrames renders them in the site's theme. The panel shows the
// storyboard, the render, then the video.
const video = { run: null, busy: false, pct: 0, stage: '', story: [], src: '', file: '', message: '', el: null, cuts: [], pick: -1, next: null }
const shownRun = () => (viewing && viewing !== 'new' ? viewing : S.run)

function videoEvent(e) {
  if (video.run !== e.run) Object.assign(video, { run: e.run, busy: false, pct: 0, stage: '', story: [], src: '', file: '', message: '', cuts: [], pick: -1, next: null })
  const fresh = !e.t || Date.now() - e.t < 8000 // a replayed file shows its video quietly
  if (e.type === 'video:start') {
    Object.assign(video, { busy: true, pct: 0, stage: 'storyboard', story: [], src: '', message: '', heard: fresh ? Date.now() : 0, next: { style: e.style, idea: e.idea } })
    if (fresh) feed(null, `🎬 ${e.model || 'the planner'} is storyboarding a ${VIDEO_STYLES.find(([k]) => k === e.style)?.[1].toLowerCase() || 'promo'} video${e.transition ? ` (${e.transition} cuts)` : ''}${e.idea ? `: “${e.idea}”` : ''}`, 'sys')
  } else if (e.type === 'video:story') {
    video.story = e.scenes
    if (fresh) e.scenes.forEach((sc, i) => setTimeout(() => feed(S.agents.get(sc.agent), `scene ${i + 1} · ${sc.kind}: “${sc.headline}”`, ''), i * 350))
    if (fresh && e.cast?.narrator) feed(null, `🎙 cast for the theme: ${e.cast.narrator}${e.cast.second ? ` with ${e.cast.second}` : ''} reading, ${e.music || 'matching'} music`, 'sys')
  } else if (e.type === 'video:progress') {
    Object.assign(video, { busy: true, pct: e.pct, stage: e.stage, heard: Date.now() })
  } else if (e.type === 'video:done') {
    Object.assign(video, { busy: false, pct: 100, src: e.src, file: e.file, stage: 'done' })
    // every cut is kept in the build's video folder; the newest plays, the rest are a click away
    const name = String(e.file || '').split('/').pop()
    if (/-promo-v\d+\.mp4$/.test(name) && !video.cuts.some(c => c.name === name)) video.cuts.push({ name, file: e.file, seconds: e.seconds, ...(video.next || {}) })
    video.next = null
    video.pick = video.cuts.length - 1
    if (fresh) feed(null, `🎬 promo video ready (${Math.round(e.seconds)}s${e.voice ? ', with voiceover' : ''}${e.music ? ', with music' : ''}, made in ${Math.round(e.ms / 1000)}s)`, 'sys')
  } else if (e.type === 'video:note') {
    if (fresh) feed(null, `🎬 ${e.message}`, 'err')
  } else if (e.type === 'video:failed') {
    Object.assign(video, { busy: false, message: e.message, stage: 'failed' })
    if (fresh) feed(null, `🎬 video: ${e.message}`, 'err')
  }
  if (fresh && !video.el && e.type !== 'video:progress' && !(autoM.last?.state === 'working' && view !== 'video')) toggleVideo(true)
  renderVideo()
}

function renderVideo() {
  const el = video.el
  if (!el) return
  // cuts made before this page was open come from the build's video folder
  if (video.run && video.listed !== video.run) {
    video.listed = video.run
    const run = video.run
    api(`/api/runs/${encodeURIComponent(run)}/cuts`).then(r => r.json()).then(({ cuts = [] }) => {
      if (video.run !== run) return
      const v = n => Number(n.match(/-v(\d+)\.mp4$/)[1])
      const known = new Map(video.cuts.map(c => [c.name, c]))
      video.cuts = [...new Map([...cuts.map(c => [c.name, c]), ...known]).values()].sort((a, b) => v(a.name) - v(b.name))
      video.pick = video.cuts.length - 1
      renderVideo()
    }).catch(() => {})
  }
  const stage = { storyboard: 'Writing the storyboard…', rendering: 'Rendering frames in headless Chrome…', assembling: 'Encoding the MP4…', 'recording the voiceover': 'Kokoro is reading the voiceover…', 'mixing the sound': 'Mixing the music and the voice…' }[video.stage] || video.stage
  // progress only moves the bar, so the storyboard cards don't replay their entrance
  // once the composition is written (rendering onward), it plays live in the panel
  const liveOn = video.busy && /render|assembl|mixing/.test(video.stage || '')
  if (liveOn && !video.liveAt) video.liveAt = Date.now()
  if (!video.busy) video.liveAt = 0
  const sig = JSON.stringify([video.run, video.story.length, video.busy, video.src, video.message, video.pick, video.cuts.length, liveOn, !!video.min])
  if (el.dataset.sig === sig) {
    const bar = el.querySelector('.vbar i'), txt = el.querySelector('.vstage')
    if (bar) bar.style.width = `${Math.max(3, video.pct)}%`
    if (txt && video.busy) setText(txt, `${stage}${video.pct ? ` ${video.pct | 0}%` : ''}`)
    return
  }
  el.dataset.sig = sig
  const story = video.story.map((sc, i) => {
    const a = S.agents.get(sc.agent)
    return `<div class="vscene" style="--c:${a?.color || 'var(--muted)'}">${sc.image ? `<img src="${esc(sc.image)}" alt="">` : `<span class="vkind">${esc(sc.kind)}</span>`}<b>${i + 1}. ${esc(sc.headline)}</b><small>${esc(a?.name || '')} · ${esc(sc.kind)}</small></div>`
  }).join('')
  const opts = `<div class="vopts"><label>Style <select class="vstyle">${VIDEO_STYLES.map(([v, l]) => `<option value="${v}" ${videoOpts.style === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Cut <select class="vcut">${VIDEO_CUTS.map(([v, l]) => `<option value="${v}" ${videoOpts.transition === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><input class="videa" placeholder="Your idea for the video (optional): “end on the night market crowd”, “for Instagram, upbeat”" value="${esc(videoOpts.idea || '')}"><div class="vopts"><label>Voice <select class="vvoice">${VOICE_OPTS.map(([v, l]) => `<option value="${v}" ${videoOpts.voice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label><input type="checkbox" class="vmusic" ${videoOpts.music ? 'checked' : ''}> Music</label></div>`
  const cut = video.cuts[video.pick], latest = video.pick < 0 || video.pick === video.cuts.length - 1
  const src = latest ? video.src : `/video/${video.run}/cut/${cut.name}`, file = cut?.file || video.file
  const cuts = video.cuts.length > 1 ? `<div class="vcuts">${video.cuts.map((c, i) => `<button class="${i === video.pick ? 'on' : ''}" data-cut="${i}" aria-label="${esc(c.idea || '')}"><b>v${c.name.match(/-v(\d+)\.mp4$/)[1]}</b> ${esc(VIDEO_STYLES.find(([k]) => k === c.style)?.[1] || '')}${c.idea ? ` · ${esc(c.idea.length > 28 ? `${c.idea.slice(0, 28)}…` : c.idea)}` : ''}${c.seconds ? ` <small>${Math.round(c.seconds)}s</small>` : ''}</button>`).join('')}</div>` : ''
  const body = video.src && !video.busy
    ? `${cuts}<video src="${esc(src)}" controls playsinline></video><div class="vfoot"><span>Saved to ${esc(String(file || 'video/promo.mp4').replace(/^\/(Users|home)\/[^/]+/, '~'))}</span><span class="vacts"><a class="vdl" href="${esc(src)}" download="${esc(cut?.name || 'promo.mp4')}">Download</a><button class="vreveal">Show in Finder</button><button class="vbig">⛶ Big screen</button></span></div>${opts}<div class="vfoot"><span></span><button class="vagain">Make a new cut</button></div>`
    : video.busy
      ? `${liveOn ? `<div class="vlive"><iframe src="/video/${encodeURIComponent(video.run)}/live/index.html?v=${video.liveAt}" aria-label="The video, playing while it renders" scrolling="no"></iframe><span class="vlive-tag">● live: the agents' cut, rendering</span></div>` : ''}<div class="vbar"><i style="width:${Math.max(3, video.pct)}%"></i></div><div class="vstage">${esc(stage)}${video.pct ? ` ${video.pct | 0}%` : ''}</div>`
      : video.message
        ? `<div class="vstage err">${esc(video.message)}</div><div class="vfoot"><span></span><button class="vagain">Try again</button></div>`
        : `<div class="vstage">A short promo of this build: the planner writes the storyboard and a voiceover from your pages and pictures, HyperFrames renders it in your theme, and Kokoro reads it over music made for it, all on this machine.</div>${opts}<div class="vfoot"><span></span><button class="vagain">Make the video</button></div>`
  // minimized: only the title and the progress, so the canvas and the crew stay in view
  el.classList.toggle('min', !!video.min && !document.body.classList.contains('view-video'))
  el.innerHTML = `<div class="vhead pop-title"><span>The promo <em>video</em></span><span class="vhead-acts"><button class="vmin" aria-label="${video.min ? 'Expand' : 'Minimize'}" aria-expanded="${!video.min}">${ico(video.min ? 'up' : 'minus')}</button><button class="vclose" aria-label="Close">${ico('x')}</button></span></div>${story ? `<div class="vstory">${story}</div>` : ''}${body}`
  el.querySelector('.vclose').onclick = () => toggleVideo(false)
  el.querySelector('.vmin').onclick = e => { e.stopPropagation(); video.min = !video.min; renderVideo() }
  const again = el.querySelector('.vagain')
  if (again) again.onclick = () => makeVideo()
  const vid = el.querySelector('video')
  // a new cut plays once, out loud, only in the window that asked for it (other
  // open windows of Swarm Studio would play the same sound over it)
  if (vid && (video.mine || document.hasFocus()) && video.played !== src) { video.played = src; vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}) }) }
  el.querySelector('.vbig')?.addEventListener('click', () => bigScreen(true))
  fitLive()
  for (const b of el.querySelectorAll('[data-cut]')) b.onclick = () => { video.pick = Number(b.dataset.cut); renderVideo() }
  el.querySelector('.vreveal')?.addEventListener('click', () => api(`/api/runs/${encodeURIComponent(video.run || viewing || S.run)}/reveal?what=video`, { method: 'POST' }))
  el.querySelector('.vstyle')?.addEventListener('change', e => { videoOpts.style = e.target.value; store.set('videoStyle', videoOpts.style) })
  el.querySelector('.vcut')?.addEventListener('change', e => { videoOpts.transition = e.target.value; store.set('videoCut', videoOpts.transition) })
  el.querySelector('.videa')?.addEventListener('input', e => { videoOpts.idea = e.target.value })
  el.querySelector('.vvoice')?.addEventListener('change', e => { videoOpts.voice = e.target.value; store.set('videoVoice', videoOpts.voice) })
  el.querySelector('.vmusic')?.addEventListener('change', e => { videoOpts.music = e.target.checked; store.set('videoMusic', videoOpts.music) })
}

// A render the canvas thinks is running but the server no longer has (it
// restarted, or the job died): ask now and then, and stop waiting if so.
setInterval(async () => {
  if (!video.busy || !video.run || Date.now() - (video.heard || 0) < 20000) return
  video.heard = Date.now()
  const job = await api(`/api/runs/${encodeURIComponent(video.run)}/video`).then(r => r.json()).catch(() => null)
  if (!job || job.state === 'working') return
  Object.assign(video, { busy: false, stage: 'failed', message: 'The video stopped before it finished (Swarm Studio restarted). Make it again.' })
  if (video.el) renderVideo()
}, 5000)

// The voiceover: Kokoro, on this machine, in one of its voices; or none.
const VOICE_OPTS = [['', 'Kokoro · fits the theme'], ['af_heart', 'Kokoro · Heart'], ['af_bella', 'Kokoro · Bella'], ['am_michael', 'Kokoro · Michael'], ['bf_emma', 'Kokoro · Emma (UK)'], ['bm_george', 'Kokoro · George (UK)'], ['off', 'No voice']]
const videoOpts = { voice: store.get('videoVoice') ?? '', music: store.get('videoMusic') ?? true, style: store.get('videoStyle') || 'auto', transition: store.get('videoCut') || '', idea: '' }
// video plans and cuts (the server has the same lists, in engine/video.mjs)
const VIDEO_STYLES = [['auto', 'AI director (a new look every time)'], ['promo', 'Promo'], ['kinetic', 'Kinetic type'], ['slideshow', 'Slideshow'], ['teaser', 'Teaser'], ['story', 'Customer story']]
const VIDEO_CUTS = [['', 'Fits the look'], ['wipe', 'Colour wipe'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['slide', 'Slide'], ['flash', 'Flash'], ['iris', 'Iris'], ['blinds', 'Blinds'], ['split', 'Split'], ['push', 'Push'], ['glitch', 'Glitch'], ['whip', 'Whip pan']]

// The video filling the whole pane (and the screen, where the app allows it).
function bigScreen(on) {
  document.querySelector('.video-big')?.remove()
  if (!on || !video.src) return
  const wrap = document.createElement('div')
  wrap.className = 'video-big'
  wrap.innerHTML = `<video src="${esc(video.src)}" controls autoplay playsinline></video><button class="vbclose" aria-label="Back to the canvas (Esc)">×</button>`
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

async function makeVideo({ idea = null, style = null } = {}) {
  const run = shownRun()
  if (!run || video.busy) return
  video.mine = true
  toggleVideo(true)
  const res = await api(`/api/runs/${encodeURIComponent(run)}/video`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice: videoOpts.voice || undefined, music: videoOpts.music, style: style || videoOpts.style || undefined, idea: idea || videoOpts.idea || undefined, transition: videoOpts.transition || undefined, film: 'auto' }) })
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
commandOps.video = c => makeVideo({ idea: c.idea, style: c.style })

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
  iframe.setAttribute('aria-label', f.title || 'Page')
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
        // sharp on a Retina screen at the zoom where pages rest
        const shot = await snapFrame(f, Math.min(1, 0.5 * (devicePixelRatio || 1)))
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
  if (body.role === 'worker' && typeof fillBuildModel === 'function') fillBuildModel()
}

function renderModels() {
  const info = modelsInfo
  const rows = ROLE_ROWS.map(r => {
    const s = info.roles?.[r.role] || {}
    const off = s.picked === 'off'
    return `<label class="mrow"><span class="mlabel">${r.label}<small>${r.note}</small></span>
      <span class="mfield"><input data-role="${r.role}" data-list="${r.list}" autocomplete="off" spellcheck="false" placeholder="${esc(s.hermes || (r.off ? 'off' : 'model id'))}" value="${off ? '' : esc(s.picked || '')}" ${off ? 'disabled' : ''}>
      ${r.off ? `<button data-off="${r.role}" class="${off ? 'on' : ''}">${off ? 'Turn on' : 'Turn off'}</button>` : ''}</span>
      <small class="mnow">${off ? 'off' : s.picked ? `picked · Hermes has ${esc(s.hermes || 'none')}` : s.hermes ? `from Hermes · ${esc(s.host || '')}` : 'not set in Hermes'}</small></label>`
  }).join('')
  const pick = info.image?.pick
  const cur = pick === 'off' ? 'off' : pick ? `${pick.provider}|${pick.model}` : ''
  const opts = (info.image?.providers || []).flatMap(p => (p.models.length ? p.models : [p.default || '']).map(m =>
    `<option value="${esc(`${p.provider}|${m}`)}" ${p.available ? '' : 'disabled'} ${cur === `${p.provider}|${m}` ? 'selected' : ''}>${esc(p.provider)}${m ? ` · ${esc(m)}` : ''}${p.available ? '' : ' (not signed in)'}</option>`)).join('')
  models.el.innerHTML = `<div class="mhead pop-title">Pick the <em>models</em> <small>picks stay in Swarm Studio; Hermes's config is untouched</small></div>${rows}
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

// The model fields' suggestions: our own scrolling list (a <datalist> popup can't
// scroll in some embedded browsers, Hermes Desktop's among them). Type to filter.
function modelCombo(root, signal) {
  let box = null, input = null, at = -1
  const close = () => { box?.remove(); box = null; input = null; at = -1 }
  const show = el => {
    const all = modelsInfo[el.dataset.list] || [], q = el.value.trim().toLowerCase()
    const hits = (q && all.includes(el.value.trim()) ? all : all.filter(m => m.toLowerCase().includes(q))).slice(0, 400)
    if (!box) { box = Object.assign(document.createElement('div'), { className: 'combo-list' }); document.body.append(box) }
    input = el
    const r = el.getBoundingClientRect()
    const below = innerHeight - r.bottom - 12
    Object.assign(box.style, { left: `${r.left}px`, width: `${r.width}px`, ...(below > 180 ? { top: `${r.bottom + 4}px`, bottom: '', maxHeight: `${Math.min(320, below)}px` } : { top: '', bottom: `${innerHeight - r.top + 4}px`, maxHeight: `${Math.min(320, r.top - 12)}px` }) })
    box.innerHTML = hits.length ? hits.map((m, i) => `<div data-m="${esc(m)}" class="${i === at ? 'on' : ''}">${esc(m)}</div>`).join('') : '<small>No match: press Enter to use it as typed</small>'
  }
  const choose = m => { const el = input; close(); el.value = m; el.dispatchEvent(new Event('change', { bubbles: true })) }
  root.addEventListener('focusin', e => { if (e.target.dataset.list) { at = -1; show(e.target) } })
  root.addEventListener('input', e => { if (e.target.dataset.list) { at = -1; show(e.target) } })
  root.addEventListener('focusout', e => { if (e.target === input) setTimeout(() => { if (document.activeElement !== input) close() }, 120) })
  root.addEventListener('keydown', e => {
    if (!box || e.target !== input) return
    const rows = box.querySelectorAll('[data-m]')
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      at = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
      rows.forEach((r, i) => r.classList.toggle('on', i === at))
      rows[at]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && rows[at]) { e.preventDefault(); choose(rows[at].dataset.m) }
    else if (e.key === 'Escape') { e.stopPropagation(); close() }
  })
  document.addEventListener('mousedown', e => {
    const row = box && e.target.closest?.('.combo-list [data-m]')
    if (row) { e.preventDefault(); choose(row.dataset.m) }
    else if (box && !box.contains(e.target) && e.target !== input) close()
  }, { signal })
  root.addEventListener('scroll', close)
}

function toggleModels(open = !models.el) {
  if (!open) { models.ac?.abort(); document.querySelector('.combo-list')?.remove(); models.el?.remove(); models.el = null; els.modelsBtn.classList.remove('on'); return }
  models.el = document.createElement('div')
  models.el.className = 'models-pop'
  document.body.append(models.el)
  const r = (els.modelsBtn.offsetParent ? els.modelsBtn : moreBtn).getBoundingClientRect()
  models.el.style.top = `${r.bottom + 6}px`
  models.el.style.right = `${Math.max(8, innerWidth - r.right)}px`
  els.modelsBtn.classList.add('on')
  closeable(models.el, () => toggleModels(false), { extra: [els.modelsBtn, moreBtn, '.combo-list', '#more-menu'] })
  renderModels()
  loadModels().then(() => models.el && !models.el.contains(document.activeElement) && renderModels())
  models.ac = new AbortController()
  modelCombo(models.el, models.ac.signal)
  models.el.addEventListener('change', e => {
    const t = e.target
    if (t.dataset.role) {
      const m = t.value.trim()
      if (m) store.set('recentModels', [m, ...(store.get('recentModels') || []).filter(x => x !== m)].slice(0, 6))
      saveModel({ role: t.dataset.role, model: m || null })
    }
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
  for (const el of document.querySelectorAll('.side [data-tab]')) el.classList.toggle('on', el.dataset.tab === name)
  store.set('tab', name)
}
for (const b of document.querySelectorAll('.side .tabs button[data-tab]')) b.onclick = () => showTab(b.dataset.tab)

// Design opens by itself when a section (or an agent to follow) is picked, so it isn't kept from before
const panels = new Set(store.get('panels', []).filter(p => p !== 'design'))
function renderPanels() {
  for (const el of document.querySelectorAll('[data-panel]')) el.classList.toggle('on', panels.has(el.dataset.panel))
  document.body.classList.toggle('design-on', panels.has('design'))
  $('.float.agents-card').classList.toggle('below', panels.has('planner'))
}
function togglePanel(p) {
  panels.has(p) ? panels.delete(p) : panels.add(p)
  if (p === 'design') { design.autoOpen = false; design.closedFor = panels.has(p) ? null : S.sel || design.pinned || null }
  store.set('panels', [...panels])
  renderPanels()
}
for (const b of document.querySelectorAll('.toggle[data-panel]')) b.onclick = () => togglePanel(b.dataset.panel)

// The Design panel follows the selection: open while a section or agent is
// picked, closed again after, unless the person opened or closed it themself.
setInterval(() => {
  // the project canvas has its own inspector for a picked section
  const want = document.body.classList.contains('cosmos-project') ? null : S.sel || design.pinned || null
  if (want && !panels.has('design') && design.closedFor !== want) { panels.add('design'); design.autoOpen = true; renderPanels() }
  else if (!want && panels.has('design') && design.autoOpen) { panels.delete('design'); design.autoOpen = false; renderPanels() }
  if (!want) design.closedFor = null
}, 250)
$('#design-close').onclick = () => { if (panels.has('design')) togglePanel('design') }

// ☰ More: the toolbar's less-used buttons
const moreMenu = $('#more-menu'), moreBtn = $('#more-btn')
moreBtn.onclick = e => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; moreBtn.classList.toggle('on', !moreMenu.hidden); if (!moreMenu.hidden) closeable(moreMenu, () => { moreMenu.hidden = true; moreBtn.classList.remove('on') }, { extra: [moreBtn] }) }
moreMenu.addEventListener('click', () => setTimeout(() => { moreMenu.hidden = true; moreBtn.classList.remove('on') }))
document.addEventListener('mousedown', e => { if (!moreMenu.hidden && !e.target.closest('.more')) { moreMenu.hidden = true; moreBtn.classList.remove('on') } })

// ☰ → Light / Dark. The system's choice by default (prefers-color-scheme); a pick here is kept.
// The page's colours follow at once (tokens only now: nothing is drawn from them, so no reload,
// which used to drop a project back to Projects).
const themeBtn = $('#theme-btn'), sysLight = matchMedia('(prefers-color-scheme: light)')
const theme = () => document.documentElement.dataset.theme || (sysLight.matches ? 'light' : 'dark')
function themeLabel() { const next = theme() === 'light' ? 'dark' : 'light'; themeBtn.innerHTML = `${ico(next === 'light' ? 'sun' : 'moon')}${next === 'light' ? 'Light' : 'Dark'}` }
function setTheme(t) {
  const before = theme()
  document.documentElement.dataset.theme = t
  try { localStorage.setItem('swarm-theme', t) } catch {}
  themeLabel()
  if (theme() !== before) dispatchEvent(new CustomEvent('swarm:theme', { detail: theme() }))
}
themeBtn.onclick = () => setTheme(theme() === 'light' ? 'dark' : 'light')
sysLight.addEventListener('change', () => { if (!document.documentElement.dataset.theme) themeLabel() })
themeLabel()

// The side panel can shrink to a small chat over the canvas; the chat stays.
function sideMin(on = !document.body.classList.contains('side-min')) {
  document.body.classList.toggle('side-min', on)
  store.set('sideMin', on)
  if (on) showTab('chat')
  $('#side-min').textContent = on ? '⇥' : '⇤'
  $('#side-min').setAttribute('aria-label', on ? 'Full side panel' : 'Shrink the side panel')
}
$('#side-min').onclick = () => sideMin()
if (store.get('sideMin')) sideMin(true)

// The builders' model, right where a build starts (the rest live in Models)
const buildModel = $('#build-model')
// a short list: the pick, the ones picked lately and the planner's; "Other…" opens the full search in Models
async function fillBuildModel() {
  const info = await loadModels()
  const s = info.roles?.worker || {}
  const recent = store.get('recentModels') || []
  const list = [...new Set([s.picked, ...recent, info.roles?.planner?.picked, info.roles?.planner?.hermes].filter(m => m && m !== 'off' && m !== s.hermes))].slice(0, 8)
  const short = m => m.split('/').pop()
  buildModel.innerHTML = `<option value="">${esc(s.hermes ? short(s.hermes) : 'Hermes default')}</option>${list.map(m => `<option value="${esc(m)}" ${m === s.picked ? 'selected' : ''}>${esc(short(m))}</option>`).join('')}<option value="__other">Other… (${(info.text || []).length} models)</option>`
}
buildModel.onchange = async () => {
  if (buildModel.value === '__other') { fillBuildModel(); return toggleModels(true) }
  if (buildModel.value) store.set('recentModels', [buildModel.value, ...(store.get('recentModels') || []).filter(m => m !== buildModel.value)].slice(0, 6))
  await saveModel({ role: 'worker', model: buildModel.value || null })
}
fillBuildModel()
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
}
const saveMeta = (id, body) => api(`/api/runs/${encodeURIComponent(id)}/meta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

async function fileInto(id, folder) {
  const f = files.find(x => x.id === id)
  if (!f || (f.folder || '') === folder) return
  f.folder = folder || null
  await saveMeta(id, { folder })
  feed(null, folder ? `moved “${f.title}” to ${folder}` : `took “${f.title}” out of its folder`, 'sys')
}

// ---------- traces: every model call an agent made for a build, with the prompt
// it was sent and the raw answer, so you can see why a section came out as it did.
const trace = { run: null, filter: {}, timer: null }
const KIND_LABEL = { sitemap: 'Plan the site', plan: 'Plan a page', build: 'Build', review: 'Review', 'review-fix': 'Fix (review)', fix: 'Fix (your comment)', route: 'Route a comment', tours: 'Visitor tours', video: 'Video storyboard' }

async function traceView(run, filter = {}) {
  document.querySelector('.trace-wrap')?.remove()
  if (!run) return
  trace.run = run
  trace.filter = filter
  const f = files.find(x => x.id === run)
  const wrap = document.createElement('div')
  wrap.className = 'finfo-wrap trace-wrap'
  wrap.innerHTML = `<div class="finfo trace">
    <button class="fix" aria-label="Close">×</button>
    <h3>🔍 Traces <small></small></h3>
    <div class="tr-bar"><input type="search" class="tr-q" placeholder="Filter: a section, page, agent, or build / fix / review"><label class="tr-on"><input type="checkbox"> Record traces</label></div>
    <div class="tr-list"></div>
  </div>`
  document.body.append(wrap)
  const $q = c => wrap.querySelector(c)
  $q('h3 small').textContent = [f?.title, filter.title && `· ${filter.title}`].filter(Boolean).join(' ')
  if (filter.layer) $q('.tr-q').value = filter.layer
  const close = () => { wrap.remove(); trace.run = null; removeEventListener('keydown', key) }
  const key = e => { if (e.key === 'Escape') close() }
  addEventListener('keydown', key)
  wrap.onclick = e => { if (e.target === wrap) close() }
  $q('.fix').onclick = close
  $q('.tr-q').oninput = () => traceList()
  $q('.tr-on input').onchange = async e => { const m = await saveMeta(run, { trace: e.target.checked }); if (f) f.trace = m.trace !== false; traceList() }
  await traceList()
}

async function traceList() {
  const wrap = document.querySelector('.trace-wrap')
  if (!wrap || !trace.run) return
  const got = await (await api(`/api/runs/${encodeURIComponent(trace.run)}/trace`)).json().catch(() => ({ calls: [] }))
  wrap.querySelector('.tr-on input').checked = got.on !== false
  const q = wrap.querySelector('.tr-q').value.trim().toLowerCase()
  const calls = (got.calls || []).filter(c => !q || q.split(/\s+/).every(w => [c.kind, KIND_LABEL[c.kind], c.agent, c.page, c.layer, c.model].join(' ').toLowerCase().includes(w)))
  const list = wrap.querySelector('.tr-list')
  const open = new Set([...list.querySelectorAll('.tr-call.open')].map(el => el.dataset.id))
  const name = id => S.agents?.get?.(id)?.name || id || ''
  list.innerHTML = calls.length ? '' : `<div class="empty">${got.calls?.length ? 'No calls match.' : got.on === false ? 'Traces are off for this build. Tick “Record traces” to keep them from now on.' : 'No model calls traced yet. Builds, fixes, reviews and videos made from now on are traced.'}</div>`
  for (const c of calls.slice().reverse()) {
    const row = document.createElement('div')
    row.className = `tr-call${c.ok ? '' : ' bad'}`
    row.dataset.id = c.id
    const when = new Date(c.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    row.innerHTML = `<div class="tr-head"><b></b><span class="tr-where"></span><span class="tr-num">${(c.ms / 1000).toFixed(1)}s${c.tokens?.out ? ` · ${c.tokens.out} tok` : ''}</span><span class="tr-when">${when}</span></div><div class="tr-prev"></div><div class="tr-body"></div>`
    row.querySelector('b').textContent = `${c.ok ? '' : '⚠ '}${KIND_LABEL[c.kind] || c.kind || 'call'}`
    row.querySelector('.tr-where').textContent = [name(c.agent), c.layer || (c.page && `page ${c.page}`), c.model].filter(Boolean).join(' · ')
    row.querySelector('.tr-prev').textContent = c.ok ? c.preview : c.error
    row.querySelector('.tr-head').onclick = () => traceOpen(row, c.id)
    list.append(row)
    if (open.has(c.id)) traceOpen(row, c.id)
  }
}

async function traceOpen(row, id) {
  if (row.classList.toggle('open') === false) return
  const body = row.querySelector('.tr-body')
  body.textContent = 'Loading…'
  const c = await (await api(`/api/runs/${encodeURIComponent(trace.run)}/trace?call=${encodeURIComponent(id)}`)).json().catch(() => null)
  if (!c?.messages) { body.textContent = 'Could not load this call.'; return }
  const text = v => typeof v === 'string' ? v : (v || []).map(p => p.type === 'image' ? `[picture, ${p.kb} KB]` : p.text || '').join('\n')
  body.innerHTML = `<div class="tr-meta"></div>${c.messages.map((m, i) => `<details${m.role === 'user' ? ' open' : ''}><summary>${esc(m.role === 'system' ? 'Instructions (system)' : m.role === 'user' ? 'Asked (user)' : m.role)} · ${text(m.content).length} chars</summary><pre data-m="${i}"></pre></details>`).join('')}<details open><summary>${c.ok ? 'Answer' : 'Error'} · ${(c.output || c.error || '').length} chars</summary><pre class="tr-out"></pre></details><button class="tr-copy">Copy this call</button>`
  body.querySelector('.tr-meta').textContent = [`model ${c.model}`, c.host, c.ttftMs != null && `first text ${(c.ttftMs / 1000).toFixed(1)}s`, `total ${(c.ms / 1000).toFixed(1)}s`, c.tokens?.in && `${c.tokens.in} tokens in`, c.tokens?.out && `${c.tokens.out} out`, c.reasoningChars && `${c.reasoningChars} chars of hidden reasoning`, `temperature ${c.temperature}`].filter(Boolean).join(' · ')
  c.messages.forEach((m, i) => (body.querySelector(`pre[data-m="${i}"]`).textContent = text(m.content)))
  body.querySelector('.tr-out').textContent = c.ok ? c.output : `${c.error}\n\n${c.output || ''}`
  body.querySelector('.tr-copy').onclick = e => { navigator.clipboard?.writeText(JSON.stringify(c, null, 2)); e.target.textContent = 'Copied' }
}

// a new call while the viewer is open for that build
function traceLive(e) {
  if (e.run !== trace.run) return
  clearTimeout(trace.timer)
  trace.timer = setTimeout(traceList, 400)
}

// Search every field a file has; tag:x, folder:x, on:<host>, has:video|site|images narrow it.
function fileMatch(f, q) {
  if (!q) return true
  const hay = [f.title, f.autoTitle, f.brief, f.folder, f.note, f.id, ...(f.tags || []), ...(f.pageTitles || []), f.theme?.name, f.theme?.direction, f.theme?.fonts?.heading, f.theme?.fonts?.body, f.models?.planner, f.models?.builders, ...Object.values(f.sites || {}), new Date(f.t).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' ').toLowerCase()
  return q.split(/\s+/).filter(Boolean).every(w => {
    const [k, v] = w.includes(':') ? w.split(/:(.*)/) : [null, w]
    if (k === 'tag') return (f.tags || []).some(t => t.includes(v))
    if (k === 'folder') return (f.folder || '').toLowerCase().includes(v)
    if (k === 'on') return (f.published || []).some(p => p.includes(v))
    if (k === 'has') return v === 'video' ? f.video : v === 'site' ? f.published?.length : v === 'images' ? f.images > 0 : v === 'note' ? !!f.note : true
    return hay.includes(w)
  })
}

// A file's card: everything it records, and the person's own name, tags and note.
function fileInfo(f) {
  document.querySelector('.finfo-wrap')?.remove()
  const wrap = document.createElement('div')
  wrap.className = 'finfo-wrap'
  const when = t => new Date(t).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const row = (k, v) => (v || v === 0 ? `<dt>${k}</dt><dd>${v}</dd>` : '')
  const sites = Object.entries(f.sites || {}).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(k)}</a>`).join(' · ')
  wrap.innerHTML = `<div class="finfo">
    <button class="fix" aria-label="Close">×</button>
    <label>Name<input class="fi-title" value="${esc(f.title)}" placeholder="${esc(f.autoTitle)}"></label>
    <label>Tags<input class="fi-tags" value="${esc((f.tags || []).join(', '))}" placeholder="client, food, draft"></label>
    <label>Folder<input class="fi-folder" value="${esc(f.folder || '')}" placeholder="none"></label>
    <label>Note<textarea class="fi-note" rows="3" placeholder="Anything to remember about this build">${esc(f.note || '')}</textarea></label>
    <dl>
      ${row('Brief', esc(f.brief))}
      ${row('Made', when(f.t))}
      ${row('Last change', when(f.updated))}
      ${row('Built', `${f.pages} pages · ${f.layers} sections${f.failed ? ` (${f.failed} failed)` : ''} · ${f.agents} agents${f.ms ? ` · ${(f.ms / 1000).toFixed(1)}s` : ''}`)}
      ${row('Pages', esc((f.pageTitles || []).join(', ')))}
      ${row('Theme', f.theme ? `${f.theme.colors.map(c => `<i class="fsw" style="background:${esc(c)}"></i>`).join('')} ${esc(f.theme.name)} · ${esc(f.theme.fonts?.heading || '')} / ${esc(f.theme.fonts?.body || '')}<br><span class="dim">${esc(f.theme.direction)}</span>` : '')}
      ${row('Models', [f.models?.planner && `planner ${esc(f.models.planner)}`, f.models?.builders && `builders ${esc(f.models.builders)}`].filter(Boolean).join(' · '))}
      ${row('Work since', [f.images && `${f.images} pictures`, f.reviews && `${f.reviews} reviews`, f.fixes && `${f.fixes} issues found`, f.edits && `${f.edits} edits`, f.exports && `${f.exports} exports`].filter(Boolean).join(' · ') || 'none')}
      ${row('Live at', sites)}
      ${row('Video', f.video ? `video/promo.mp4${f.videoSeconds ? ` · ${Math.round(f.videoSeconds)}s` : ''}` : '')}
      ${row('ID', `<code>${esc(f.id)}</code>`)}
    </dl>
    <div class="fi-foot"><button class="fi-reveal">Show in Finder</button><button class="fi-save">Save</button></div>
  </div>`
  document.body.append(wrap)
  const $q = c => wrap.querySelector(c)
  const close = () => { wrap.remove(); removeEventListener('keydown', key) }
  const key = e => { if (e.key === 'Escape') close() }
  addEventListener('keydown', key)
  wrap.onclick = e => { if (e.target === wrap) close() }
  $q('.fix').onclick = close
  $q('.fi-reveal').onclick = () => api(`/api/runs/${encodeURIComponent(f.id)}/reveal`, { method: 'POST' })
  $q('.fi-save').onclick = async () => {
    const body = { title: $q('.fi-title').value, tags: $q('.fi-tags').value, folder: $q('.fi-folder').value, note: $q('.fi-note').value }
    const res = await api(`/api/runs/${encodeURIComponent(f.id)}/meta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const m = await res.json()
    Object.assign(f, { title: m.title || f.autoTitle, tags: m.tags || [], folder: m.folder || null, note: m.note || '' })
    close()
  }
  $q('.fi-title').focus()
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
    if (S.kind === 'game') setView('app')
    else if (!events.some(e => e.type === 'layer:done' && e.html)) botMsg('This file was saved before Swarm Studio kept finished sections, so only its plan is shown.')
  }
  setAuto(true)
}

// Replay a saved run on its own clock, sped up: the Swarm Wall plays four of these side by side.
// Long quiet gaps (a model thinking) are cut to 1.5 s of real time so the tile never looks stuck.
async function replayRun(id, speed = 8) {
  const res = await api(`/api/runs/${encodeURIComponent(id)}/events`).catch(() => null)
  if (!res?.ok) return botMsg('That run could not be loaded.')
  const events = (await res.json()).filter(e => e.type !== 'cmd')
  viewing = id
  fresh(id)
  let clock = 0, prev = events[0]?.t || 0
  const start = performance.now()
  parent.postMessage?.({ wall: 'start', run: id, events: events.length }, '*')
  for (const [i, e] of events.entries()) {
    clock += Math.min(Math.max(0, (e.t || prev) - prev) / speed, 1500)
    prev = e.t || prev
    const wait = clock - (performance.now() - start)
    if (wait > 4) await new Promise(r => setTimeout(r, wait))
    try { on(e) } catch (err) { console.error(err) }
    if (i % 25 === 0) parent.postMessage?.({ wall: 'tick', run: id, i, of: events.length, t: e.t - events[0].t }, '*')
  }
  parent.postMessage?.({ wall: 'done', run: id, ms: (events.at(-1)?.t || 0) - (events[0]?.t || 0) }, '*')
}

// ---------- views: Canvas | Video | App
// Each view keeps working while you look at another; a dot on its tab says how
// it is doing. The chat follows the view: on App, a message is the app's next
// change; on Video, an idea for a new cut.
let view = 'canvas'
const appv = { run: null, state: 'idle', kind: 'site', steps: [], asks: [], url: null, stage: '', message: '', result: null, deployed: null, mode: 'preview', w: 0, files: null, file: '', hasApp: false, opening: false, loaded: false }
const appEls = { view: $('#appview'), state: $('#app-state'), stage: $('#app-stage'), steps: $('#app-steps'), frame: $('#app-frame'), shell: $('#app-shell'), empty: $('#app-empty'), preview: $('#app-preview'), code: $('#app-code'), tree: $('#app-tree'), file: $('#app-file'), open: $('#app-open'), stop: $('#app-stop') }
const PLACEHOLDER = { canvas: 'Describe a product. The swarm designs and builds its site.', video: 'An idea for the video: “faster, end on the crowd”, “for Instagram”…', app: 'Change the app: “add a FAQ page with search”, “let people pick a seat”…' }

function setView(v) {
  if (!['canvas', 'video', 'app'].includes(v)) return
  if (game.el) closeGame()
  const was = view
  view = v
  document.body.classList.toggle('view-video', v === 'video')
  document.body.classList.toggle('view-app', v === 'app')
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('on', b.dataset.view === v)
  appEls.view.hidden = v !== 'app'
  if (v === 'video') toggleVideo(true)
  else if (was === 'video') toggleVideo(false)
  if (v === 'app') loadApp()
  els.brief.placeholder = PLACEHOLDER[v]
  renderBadges()
}
for (const b of document.querySelectorAll('#views button')) b.onclick = () => setView(b.dataset.view)

function renderBadges() {
  const vb = document.querySelector('#views [data-view="video"] .vbadge'), ab = document.querySelector('#views [data-view="app"] .vbadge')
  if (vb) vb.className = `vbadge ${video.busy ? 'working' : video.message ? 'failed' : video.src ? 'done' : ''}`
  if (ab) ab.className = `vbadge ${appv.run === shownRun() ? { working: 'working', done: 'done', failed: 'failed' }[appv.state] || '' : ''}`
}
setInterval(renderBadges, 1000)

const appApi = (path = '', body) => api(`/api/runs/${encodeURIComponent(appv.run)}/app${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const out = await r.json().catch(() => ({})); if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`); return out })

function resetApp(run) {
  Object.assign(appv, { run, state: 'idle', kind: 'site', steps: [], asks: [], url: null, stage: '', message: '', result: null, deployed: null, files: null, file: '', hasApp: false, opening: false, loaded: false, plan: null })
  appEls.frame.removeAttribute('src')
}

async function loadApp() {
  const run = shownRun()
  if (!run) { resetApp(null); return renderApp() }
  if (appv.run !== run) resetApp(run)
  try {
    const st = await appApi()
    if (appv.run !== run) return
    Object.assign(appv, { state: st.state, kind: st.kind || appv.kind, stage: st.stage || '', message: st.message || '', result: st.result, deployed: st.deployed || appv.deployed, hasApp: !!st.hasApp, loaded: true, engineReady: st.engineReady })
    if (st.steps?.length >= appv.steps.length) appv.steps = st.steps
    if (st.asks?.length) appv.asks = st.asks
    // the server knows whether the app is running: an address from the log may be a dev server
    // that stopped with a restart, so it opens again rather than showing a dead page
    appv.url = st.url || null
    // an app made before: start its dev server again
    if (!appv.url && appv.hasApp && appv.state !== 'working' && !appv.opening) {
      appv.opening = true
      renderApp()
      appApi('/open', {}).then(o => { if (appv.run === run && o.url) appv.url = o.url }).catch(err => { appv.message = err.message }).finally(() => { appv.opening = false; renderApp() })
    }
  } catch (err) { appv.message = err.message }
  renderApp()
}

const STEP_ICON = { setup: '⚙︎', turn: '▸', write: '✎', render: '👁', think: '·', tokens: 'Σ', serve: '▶', gate: '✓', ask: '💬' }
function stepsHtml() {
  // the current round in full; earlier rounds fold into one line each
  const all = appv.steps.slice(-300)
  const cut = all.findLastIndex(s => s.kind === 'ask')
  const before = cut > 0 ? all.slice(0, cut).filter(s => s.kind === 'ask') : []
  const rows = before.length ? [`<div class="st earlier"><b>↺</b><span>${before.length} earlier round${before.length === 1 ? '' : 's'}: ${esc(before.slice(-3).map(s => s.text).join(' · '))}</span></div>`] : []
  for (const s of all.slice(Math.max(0, cut))) {
    if (s.kind === 'think') continue
    const bad = s.ok === false || /fail|not start/i.test(s.text)
    rows.push(`<div class="st ${s.kind}${bad ? ' bad' : s.ok ? ' ok' : ''}"><b>${STEP_ICON[s.kind] || '·'}</b><span>${esc(s.kind === 'ask' ? `💬 ${s.text}` : s.text)}</span></div>`)
  }
  return rows.join('') || '<div class="st"><span>Steps show here while the app builds: every file the engine writes, each check, each fix.</span></div>'
}

// The site and its promo game open each other from the App bar.
function renderAppLink() {
  const b = $('#app-link')
  if (!b) return
  b.hidden = !S.link
  if (S.link) { b.textContent = S.link.label; b.onclick = () => openRun(S.link.run) }
}

// The preview loads in the background: a loading screen covers the frame until the app inside
// has loaded (a dev server compiles a big game on its first visit, which shows as a blank page)
let frameWait = 0
function loadFrame() {
  const el = $('#app-loading')
  if (el) {
    el.querySelector('span').textContent = appv.kind === 'game' ? 'Loading the game…' : 'Loading the app…'
    el.hidden = false
  }
  clearTimeout(frameWait)
  frameWait = setTimeout(frameLoaded, 45000) // never stuck: give up covering it
  // a fresh frame each time: one that failed to load (a stopped server) can stay blank after
  const old = appEls.frame, f = old.cloneNode(false)
  f.dataset.src = old.dataset.src || ''
  f.addEventListener('load', frameLoad)
  f.src = frameUrl(appv.url)
  old.replaceWith(f)
  appEls.frame = f
}
// the app's dev server answers on every loopback name, but a page on localhost will not show
// 127.0.0.1 in a frame (and the other way round): use the Studio's own name for it
function frameUrl(u) {
  try {
    const x = new URL(u), loop = /^(localhost|127\.0\.0\.1|\[::1\])$/
    if (loop.test(x.hostname) && loop.test(location.hostname)) x.hostname = location.hostname
    return x.href
  } catch { return u }
}
function frameLoaded() { clearTimeout(frameWait); const el = $('#app-loading'); if (el) el.hidden = true }
function frameLoad(e) { if (e.target === appEls.frame && appEls.frame.src && appEls.frame.src !== 'about:blank') { clearTimeout(frameWait); frameWait = setTimeout(frameLoaded, 700) } }

function renderApp() {
  renderAppLink()
  renderBadges()
  if (view !== 'app') return
  const st = appv.state, working = st === 'working'
  appEls.state.className = `app-state pill ${st}`
  appEls.state.textContent = working ? 'building' : st === 'done' ? (appv.url ? 'running' : 'built') : st === 'failed' ? 'failed' : st === 'stopped' ? 'stopped' : appv.hasApp ? 'built' : 'no app yet'
  setText(appEls.stage, working ? appv.stage : appv.result ? `${appv.result.turns} turn${appv.result.turns === 1 ? '' : 's'} · ${appv.result.files} files · checks ${appv.result.gatesPassed ? 'passed' : 'not passed'}${appv.deployed ? ` · live at ${appv.deployed}` : ''}` : '')
  const stick = appEls.steps.scrollHeight - appEls.steps.scrollTop - appEls.steps.clientHeight < 60
  appEls.steps.innerHTML = stepsHtml()
  if (stick) appEls.steps.scrollTop = appEls.steps.scrollHeight
  appEls.stop.hidden = !working
  if (appv.url) appEls.open.href = appv.url; else appEls.open.removeAttribute('href')
  // the preview, or what to do first
  if (appv.url && appEls.frame.dataset.src !== appv.url) { appEls.frame.dataset.src = appv.url; loadFrame() }
  // a build that failed before it ever worked shows the failure, not the empty starter's blank page
  const empty = !appv.url || (st === 'failed' && !appv.hasApp)
  appEls.empty.hidden = !empty
  if (empty) {
    const run = shownRun()
    appEls.empty.innerHTML = !run
      ? `<h2>No build open</h2><p>Make a site on the canvas, open one from Files, or start a 🎮 Game.</p>`
      : working || appv.opening
        ? `<div class="spin"></div><h2>${appv.opening ? 'Starting the app…' : appv.kind === 'game' ? 'Building the game…' : 'Building the app…'}</h2><p>${esc(appv.stage || 'starting')}</p><p>${appv.engineReady === false ? 'First time: the app engine installs itself once (about a minute, ~1.5 GB). ' : ''}dyad's engine writes the code, runs the typecheck and build after every turn, and fixes what fails. You can go back to the Canvas or Video meanwhile.</p>`
        : st === 'failed'
          ? `<div class="fail-card"><span class="fail-ico">${ico('x')}</span><h2>The ${appv.kind === 'game' ? 'game' : 'app'} didn't <em>build</em></h2><p class="fail-msg">${esc(String(appv.message || 'The engine stopped before the app built.').split('\n')[0].replace(/(\/[\w.@-]+){3,}/g, m => `…/${m.split('/').slice(-2).join('/')}`).slice(0, 220))}</p>${appv.message ? `<details class="fail-more"><summary>Show details</summary><pre>${esc(appv.message)}</pre></details>` : ''}<button class="big" data-build>${ico('rotate-ccw')}Try again</button></div>`
          : appv.hasApp && appv.message
            ? `<div class="fail-card"><span class="fail-ico">${ico('x')}</span><h2>The ${appv.kind === 'game' ? 'game' : 'app'} didn't <em>start</em></h2><p class="fail-msg">${esc(String(appv.message).split('\n')[0].slice(0, 220))}</p><button class="big" data-reopen>${ico('rotate-ccw')}Try again</button></div>`
          : appv.kind === 'game' && !appv.hasApp
            ? `<h2>A game starts with a few questions</h2><button class="big" data-game>🎮 Start a game</button>`
            : `<h2>Turn this design into a working app</h2><p>The design stays exactly as it is. Hermia first asks what runs behind it (dashboards, customers, an admin panel), then the engine builds it all.</p><button class="big" data-build>Build the app</button>`
    appEls.empty.querySelector('[data-build]')?.addEventListener('click', buildApp)
    appEls.empty.querySelector('[data-reopen]')?.addEventListener('click', () => { appv.message = ''; loadApp() })
    appEls.empty.querySelector('[data-game]')?.addEventListener('click', () => openGame())
  }
  appEls.preview.hidden = appv.mode !== 'preview'
  appEls.code.hidden = appv.mode !== 'code'
  appEls.shell.classList.toggle('dev', !!appv.w)
  appEls.shell.style.width = appv.w ? `${appv.w}px` : '100%'
  if (appv.mode === 'code') renderCode()
}

async function renderCode() {
  if (!appv.files) {
    appv.files = []
    try { appv.files = (await appApi('/files')).files } catch { appv.files = [] }
  }
  const groups = new Map()
  for (const f of appv.files) {
    const top = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '.'
    if (!groups.has(top)) groups.set(top, [])
    groups.get(top).push(f)
  }
  appEls.tree.innerHTML = [...groups].map(([g, list]) => `<h4>${esc(g)}</h4>${list.map(f => `<div data-path="${esc(f.path)}" class="${f.path === appv.file ? 'on' : ''}">${esc(f.path.split('/').pop())}</div>`).join('')}`).join('') || '<h4>no files yet</h4>'
  for (const d of appEls.tree.querySelectorAll('[data-path]')) d.onclick = () => showFile(d.dataset.path)
  if (!appv.file && appv.files.length) showFile((appv.files.find(f => f.path === 'src/App.tsx') || appv.files[0]).path)
}
async function showFile(path) {
  appv.file = path
  for (const d of appEls.tree.querySelectorAll('[data-path]')) d.classList.toggle('on', d.dataset.path === path)
  try { appEls.file.textContent = (await appApi(`/files?path=${encodeURIComponent(path)}`)).text } catch (err) { appEls.file.textContent = err.message }
}

for (const b of document.querySelectorAll('#app-mode button')) b.onclick = () => {
  appv.mode = b.dataset.mode
  for (const x of document.querySelectorAll('#app-mode button')) x.classList.toggle('on', x === b)
  if (appv.mode === 'code') appv.files = null
  renderApp()
}
for (const b of document.querySelectorAll('#app-device button')) b.onclick = () => {
  appv.w = Number(b.dataset.w)
  for (const x of document.querySelectorAll('#app-device button')) x.classList.toggle('on', x === b)
  renderApp()
}
$('#app-reload').onclick = () => { if (appv.url) loadFrame() }
appEls.stop.onclick = () => appApi('/stop', {}).catch(() => {})

// The first build of the app, or one more change to it.
async function appAsk(ask, extra = {}) {
  const run = shownRun()
  if (!run) return botMsg('Open a build first: the app is made from its design.')
  if (appv.run !== run) resetApp(run)
  if (view !== 'app') setView('app')
  if (appv.state === 'working') return botMsg('The app is still building; your change can go in when this turn is done.')
  if (ask && !appv.hasApp) return botMsg('Build the app first (the button in the App view), then change it by chatting.')
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text?.trim()).map(l => ({ key: l.key, html: l.text }))
  try {
    const st = await appApi('', { ask, sections, ...extra })
    Object.assign(appv, { state: st.state, kind: st.kind, stage: st.stage, asks: st.asks || appv.asks, message: '' })
    if (ask) feed(null, `💬 to the app: ${ask}`, 'you')
  } catch (err) {
    appv.message = err.message
    botMsg(`App: ${err.message}`)
  }
  renderApp()
}

// ---------- the app advisor
// Before a site becomes a working app, Hermia reads its pages and asks, in the
// chat, what the business needs behind it (users, what gets saved, dashboards,
// a CRM, an admin panel). Each question comes with her recommended answer; the
// answers become an app plan to tick through, and the plan becomes dyad's brief.
const adv = { run: null, qs: [], i: 0, qa: [], busy: false }
function advMsg(html, cls = '') {
  const item = document.createElement('div')
  item.className = `item bot adv ${cls}`
  item.innerHTML = `<b>${HERMIA}Hermia<small>advisor</small></b><div class="txt">${html}</div>`
  push(els.feed, item)
  return item
}
function advOpen(on) {
  document.body.classList.toggle('advising', on)
  if (on) { document.body.classList.add('cosmos-chat'); document.querySelector('.side .tabs [data-tab="chat"]')?.click() }
}
const advSections = () => [...S.layers.values()].filter(l => l.status === 'done' && l.text?.trim()).map(l => ({ key: l.key, html: l.text }))
const advPost = body => api(`/api/runs/${encodeURIComponent(adv.run)}/advise`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections: advSections(), ...body }) }).then(async r => { const out = await r.json().catch(() => ({})); if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`); return out })

async function openAdvisor() {
  const run = shownRun()
  if (!run) return botMsg('Open a build first: the app is made from its design.')
  if (adv.busy) return advOpen(true)
  Object.assign(adv, { run, qs: [], i: 0, qa: [], busy: true })
  advOpen(true)
  const wait = advMsg('Reading your pages to see what the app needs behind them…', 'working')
  try {
    const out = await advPost({})
    wait.remove()
    adv.qs = out.questions || []
    advMsg(`${esc(out.read || '')}<span class="adv-sub">${adv.qs.length} questions. My pick is marked on each; change anything.</span>`)
    advAsk()
  } catch (err) { wait.remove(); adv.busy = false; advMsg(`I couldn't read the pages: ${esc(err.message)}`, 'err') }
}

function advAsk() {
  const q = adv.qs[adv.i]
  if (!q) return advPlan()
  const picks = new Set(q.recommended)
  const card = advMsg(`<p class="adv-q">${esc(q.q)}</p>${q.why ? `<p class="adv-why">${esc(q.why)}</p>` : ''}
    <div class="adv-opts">${q.options.map(o => `<button class="adv-opt" aria-pressed="${picks.has(o)}" data-o="${esc(o)}">${esc(o)}${q.recommended.includes(o) ? '<em>Recommended</em>' : ''}</button>`).join('')}</div>
    <input class="adv-own" placeholder="Or in your own words" aria-label="Your own answer">
    <div class="adv-go"><span class="adv-n">${adv.i + 1} of ${adv.qs.length}</span>${adv.i === 0 && adv.qs.length > 1 ? '<button class="adv-all">Use all my picks</button>' : ''}<button class="adv-next">${adv.i === adv.qs.length - 1 ? 'Write the plan' : 'Next'}</button></div>`, 'ask')
  for (const b of card.querySelectorAll('.adv-opt')) b.onclick = () => {
    const o = b.dataset.o
    if (q.multi) picks.has(o) ? picks.delete(o) : picks.add(o)
    else { picks.clear(); picks.add(o) }
    for (const x of card.querySelectorAll('.adv-opt')) x.setAttribute('aria-pressed', picks.has(x.dataset.o))
  }
  const own = card.querySelector('.adv-own')
  const answer = () => {
    const a = [...picks]
    if (own.value.trim()) a.push(own.value.trim())
    card.classList.add('done')
    card.querySelector('.adv-go').remove(); own.remove()
    for (const x of card.querySelectorAll('.adv-opt')) x.disabled = true
    adv.qa.push({ q: q.q, a })
    adv.i++
  }
  own.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); card.querySelector('.adv-next').click() } }
  card.querySelector('.adv-next').onclick = () => { answer(); advAsk() }
  const all = card.querySelector('.adv-all')
  if (all) all.onclick = () => {
    answer()
    for (const r of adv.qs.slice(adv.i)) adv.qa.push({ q: r.q, a: r.recommended })
    adv.i = adv.qs.length
    advMsg(`<span class="adv-sub">Going with my picks for the other ${adv.qs.length - 1}.</span>`, 'sys')
    advPlan()
  }
}

async function advPlan() {
  const wait = advMsg('Writing the app plan…', 'working')
  let plan
  try { plan = (await advPost({ qa: adv.qa })).plan } catch (err) { wait.remove(); adv.busy = false; return advMsg(`The plan didn't come back: ${esc(err.message)}`, 'err') }
  wait.remove()
  const card = advMsg(`<p class="adv-q">The app plan</p>${plan.summary ? `<p class="adv-why">${esc(plan.summary)}</p>` : ''}
    <h5>Screens behind the site</h5>
    <div class="adv-screens">${plan.screens.map((x, i) => `<label class="adv-screen"><input type="checkbox" data-i="${i}" ${x.optional ? '' : 'checked'}><span><b>${esc(x.name)}</b>${x.for ? ` <small>${esc(x.for)}</small>` : ''}<span>${esc(x.what)}</span></span></label>`).join('')}</div>
    ${plan.data?.length ? `<h5>What it keeps</h5><p class="adv-why">${plan.data.map(d => `<b>${esc(d.name)}</b> ${esc(d.fields.join(', '))}`).join('<br>')}</p>` : ''}
    ${plan.roles?.length ? `<h5>Who uses it</h5><p class="adv-why">${plan.roles.map(r => `<b>${esc(r.name)}</b> ${esc(r.can)}`).join('<br>')}</p>` : ''}
    <div class="adv-go"><button class="adv-again">Change answers</button><button class="adv-next">Build the app</button></div>`, 'ask plan')
  card.querySelector('.adv-again').onclick = () => { card.classList.add('done'); card.querySelector('.adv-go').remove(); adv.busy = false; openAdvisor() }
  card.querySelector('.adv-next').onclick = () => {
    const keep = new Set([...card.querySelectorAll('.adv-screen input:checked')].map(x => Number(x.dataset.i)))
    appv.plan = { ...plan, screens: plan.screens.filter((_, i) => keep.has(i)) }
    card.classList.add('done'); card.querySelector('.adv-go').remove()
    for (const x of card.querySelectorAll('input')) x.disabled = true
    adv.busy = false
    advMsg(`Building it: the site as designed, plus ${appv.plan.screens.length} screen${appv.plan.screens.length === 1 ? '' : 's'} behind it.`, 'sys')
    advOpen(false)
    appAsk('', { plan: appv.plan })
  }
}

// a site's first app build goes through the advisor; a game or a retry goes straight on
const buildApp = () => (appv.kind !== 'game' && !appv.hasApp && !appv.plan ? openAdvisor() : appAsk('', appv.plan ? { plan: appv.plan } : {}))

async function deployApp() {
  if (!appv.run) return
  appv.deploying = true
  botMsg('🚀 Deploying the app to Vercel…', true)
  try {
    const out = await appApi('/deploy', {})
    appv.deployed = out.url
    botMsg(`🚀 The app is live: ${out.url}`)
  } catch (err) { botMsg(`Deploy: ${err.message}`) }
  appv.deploying = false
  renderApp()
}

function appEvent(e) {
  if (e.run !== shownRun()) return
  if (appv.run !== e.run) resetApp(e.run)
  const fresh_ = !e.t || Date.now() - e.t < 8000
  if (e.type === 'app:start') {
    Object.assign(appv, { state: 'working', kind: e.kind || appv.kind, stage: 'starting', message: '' })
    if (e.ask && appv.asks.at(-1) !== e.ask) appv.asks.push(e.ask)
    appv.steps.push({ kind: 'ask', text: e.ask || 'build', t: e.t })
    if (fresh_) feed(null, `🧩 ${e.model || 'the engine'} is ${e.fresh ? `building the ${e.kind === 'game' ? 'game' : 'app'}` : 'changing the app'}${e.ask ? `: “${e.ask}”` : ''}`, 'sys')
  } else if (e.type === 'app:step') {
    appv.steps.push(e.step)
    if (e.step.kind !== 'write' && e.step.kind !== 'think') appv.stage = e.step.text
    if (e.step.kind === 'write') appv.files = null
  } else if (e.type === 'app:ready') {
    // only a live event: an old one from the log names a dev server that may be gone
    if (fresh_) appv.url = e.url
  } else if (e.type === 'app:done') {
    Object.assign(appv, { state: 'done', result: e.result, hasApp: true, stage: 'ready' })
    if (e.url && fresh_) appv.url = e.url
    appEls.frame.dataset.src = '' // reload to the new build
    if (fresh_) feed(null, `🧩 the ${appv.kind === 'game' ? 'game' : 'app'} is ready (${e.result?.turns || 1} turn${e.result?.turns === 1 ? '' : 's'}, checks ${e.result?.gatesPassed ? 'passed' : 'not passed'}, ${Math.round((e.ms || 0) / 1000)}s). Open the App view to try it, or chat to change it.`, 'sys')
  } else if (e.type === 'app:failed') {
    Object.assign(appv, { state: 'failed', message: e.message })
    if (fresh_) feed(null, `🧩 app: ${e.message}`, 'err')
  } else if (e.type === 'app:deployed') {
    appv.deployed = e.url
  }
  if (e.type !== 'app:step' || view === 'app') renderApp()
}

commandOps.app = c => (c.view ? setView('app') : appAsk(c.ask || ''))
commandOps.view = c => setView(c.view)

// ---------- 🎮 game mode
// A few questions, one at a time (chips or your own words; "Just build it"
// fills the rest), then the spec card, then the build in the App view.
const game = { el: null, questions: null, i: 0, answers: {}, idea: '', spec: null, busy: false }
async function openGame(idea = '', answers = null, build = false) {
  if (!game.questions?.length) game.questions = (await api('/api/game').then(r => r.ok ? r.json() : {}).catch(() => ({}))).questions || []
  // a site build is open: the game can be its promo game, in its world and colours
  const site = S.kind !== 'game' && S.layers.size ? shownRun() : null
  Object.assign(game, { i: 0, answers: answers || {}, idea: String(idea || '').trim(), spec: null, busy: false, from: site, brand: site ? (S.title || 'this site') : '', promo: !!site })
  game.el?.remove()
  game.el = document.createElement('div')
  game.el.className = 'game-pop'
  document.body.append(game.el)
  $('#game-btn').classList.add('on')
  // closes with ×, Esc and a click outside it, except while the spec is being written
  game.off?.()
  game.off = window.SwarmUI?.layer(game.el, closeGame, { extra: [$('#game-btn')], canClose: () => !game.busy })
  if (answers || build) return gameSpec(build)
  renderGame()
}
const closeGame = () => { game.off?.(); game.off = null; game.el?.remove(); game.el = null; $('#game-btn').classList.remove('on') }

function renderGame() {
  const el = game.el
  if (!el) return
  const qs = game.questions, q = qs[game.i]
  const dots = qs.map((_, i) => `<i class="${i < game.i ? 'done' : i === game.i ? 'on' : ''}"></i>`).join('')
  const head = `<div class="ghead"><b class="kicker">${ico('gamepad-2')}New game</b><button class="gclose" aria-label="Close">${ico('x')}</button></div>`
  if (!qs.length) {
    el.innerHTML = `${head}<div class="gbody"><p>Game mode isn't loaded on this server yet. Restart Swarm Studio (<code>hermes swarm</code>) and try again.</p></div>`
  } else if (game.busy) {
    el.innerHTML = `${head}<div class="gbody"><div class="spin"></div><p>${esc(game.busy)}</p></div>`
  } else if (game.spec) {
    const s = game.spec, list = gameList
    const rows = [['Setting', s.setting], ['Hero', s.hero], ['Enemies', list(s.enemies)], ['Loop', s.loop], ['Progression', s.progression], ['Controls', s.controls], ['Win', s.win], ['Lose', s.lose], ['Look', s.look], ['Sound', s.sound], ['Engine', s.engine]]
    el.innerHTML = `${head}<div class="gspec"><h2 contenteditable="true" data-k="title">${esc(s.title)}</h2><p class="gpitch" contenteditable="true" data-k="pitch">${esc(s.pitch || '')}</p>${s.brand ? `<p class="gorig">🎮 A promo game for ${esc(s.brand.name)}, in its colours${s.brand.url ? `, linking to ${esc(s.brand.url)}` : ''}</p>${s.brand.url ? '' : `<button class="glink gonline" data-online>Put ${esc(s.brand.name)} online first</button>`}` : ''}${s.answers?.like && !/nothing/i.test(s.answers.like) ? `<p class="gorig">Feel of ${esc(s.answers.like)}, original world: ${esc(s.original || '')}</p>` : ''}<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd ${k === 'Engine' ? '' : `contenteditable="true" data-k="${k.toLowerCase()}"`}>${esc(v || '')}</dd>`).join('')}</dl><small>Click any line to change it.</small></div><div class="gfoot"><button class="glink" data-redo>← Change answers</button><button class="big" data-build>Build the game</button></div>`
    el.querySelector('[data-redo]').onclick = () => { game.spec = null; game.i = 0; renderGame() }
    el.querySelector('[data-build]').onclick = () => gameBuild()
    el.querySelector('[data-online]')?.addEventListener('click', () => gameOnline())
  } else {
    const val = game.answers[q.id] || ''
    el.innerHTML = `${head}<div class="gdots">${dots}</div>${game.i === 0 && game.from ? `<label class="gpromo"><input type="checkbox" ${game.promo ? 'checked' : ''}><span>A promo game for <b>${esc(game.brand)}</b>: set in its world, in its colours, with a button back to it</span></label>` : ''}${game.i === 0 ? `<input class="gidea" placeholder="Your idea in a line (optional): “a neon spirit eating its way through a night market”" value="${esc(game.idea)}">` : ''}<h3>${esc(q.q)}</h3><div class="gchips">${q.chips.map(c => `<button class="${val === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div><input class="gfree" placeholder="…or in your own words" value="${q.chips.includes(val) ? '' : esc(val)}"><div class="gfoot">${game.i ? '<button class="glink" data-back>← Back</button>' : '<span></span>'}<span><button class="glink" data-skip>Just build it</button><button class="big" data-next>${game.i === qs.length - 1 ? 'Write the spec' : 'Next'}</button></span></div>`
    const free = el.querySelector('.gfree')
    const take = v => { if (v) game.answers[q.id] = v; else delete game.answers[q.id] }
    const next = () => { take(free.value.trim() || game.answers[q.id]); if (game.i < qs.length - 1) { game.i++; renderGame() } else gameSpec() }
    for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { take(b.dataset.c); free.value = ''; next() }
    free.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next() } }
    el.querySelector('.gidea')?.addEventListener('input', e => { game.idea = e.target.value })
    el.querySelector('.gpromo input')?.addEventListener('change', e => { game.promo = e.target.checked })
    el.querySelector('[data-next]').onclick = next
    el.querySelector('[data-skip]').onclick = () => { take(free.value.trim() || game.answers[q.id]); gameSpec() }
    el.querySelector('[data-back]')?.addEventListener('click', () => { game.i--; renderGame() })
    ;(game.i === 0 ? el.querySelector('.gidea') : free)?.focus()
  }
  el.querySelector('.gclose').onclick = closeGame
}

async function gameSpec(build = false) {
  game.busy = 'The planner is writing the game spec: an original world, hero and enemies…'
  renderGame()
  try {
    const out = await api('/api/game/spec', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: game.idea, answers: game.answers, from: game.promo ? game.from : null }) }).then(r => r.json())
    if (!out.spec) throw new Error(out.error || 'no spec')
    game.spec = out.spec
  } catch (err) {
    game.busy = false
    botMsg(`Game: ${err.message}`)
    return renderGame()
  }
  game.busy = false
  if (build) return gameBuild()
  renderGame()
}

// The promo game links back only to a real address: put the site online first
// (a connected Vercel or Cloudflare, else GitHub Pages), then the link goes in the spec.
async function gameOnline() {
  const brand = game.spec?.brand
  if (!brand?.from) return
  const h = await api('/api/publish').then(r => r.json()).catch(() => ({}))
  const target = h.vercel?.user ? 'vercel' : h.cloudflare?.user ? 'cloudflare' : h.github ? 'github' : null
  if (!target) return botMsg('Game: sign in to a host first (🌐 Publish on the canvas), then try again.')
  game.busy = `Putting ${brand.name} online on ${HOSTS[target].label}…`
  renderGame()
  const path = `/api/runs/${encodeURIComponent(brand.from)}/publish`
  let job = await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target }) }).then(r => r.json()).catch(err => ({ state: 'failed', error: err.message }))
  for (let i = 0; i < 120 && job.state === 'working'; i++) {
    await new Promise(r => setTimeout(r, 2000))
    job = await api(path).then(r => r.json()).catch(() => job)
  }
  game.busy = false
  if (job.state === 'done' && job.url) brand.url = job.url
  else botMsg(`Game: ${brand.name} did not go online: ${job.message || job.error || 'it took too long'}`)
  renderGame()
}

// names of a spec's list (a big spec's entries are objects with a name)
const gameList = v => (Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : x?.name || '')).join(', ') : v || '')

async function gameBuild() {
  // the card's edits go into the spec
  for (const x of game.el?.querySelectorAll('[data-k]') || []) {
    const k = x.dataset.k, v = x.textContent.trim()
    // a big spec's enemies are objects: keep them unless the line was changed
    if (k === 'enemies') { if (v !== gameList(game.spec.enemies)) game.spec.enemies = v.split(/\s*,\s*/).filter(Boolean) }
    else if (v) game.spec[k] = v
  }
  game.busy = 'Starting the build…'
  renderGame()
  try {
    const out = await api('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: game.spec }) }).then(r => r.json())
    if (!out.run) throw new Error(out.error || 'could not start')
    closeGame()
    await loadFiles()
    await openRun(out.run)
    setView('app')
    botMsg(`🎮 Building “${game.spec.title}” (${game.spec.engine}). The App view shows every file as it is written; the game opens there when it builds. Chat here to change it after.`)
  } catch (err) {
    game.busy = false
    botMsg(`Game: ${err.message}`)
    renderGame()
  }
}

$('#game-btn').onclick = () => openGame()
document.addEventListener('keydown', e => { if (e.key === 'Escape' && game.el && !game.busy) closeGame() })
commandOps.game = c => openGame(c.idea || '', c.answers || null, !!c.build)

// ---------- start

let es = null
function connect() {
  es?.close()
  fresh()
  es = new EventSource(`${BASE}/events?k=${encodeURIComponent(BOOT.token || '')}`)
  es.onmessage = m => {
    try {
      const e = JSON.parse(m.data)
      // a wall tile only watches: the main canvas answers Hermes' commands
      if (e.type === 'cmd') return WALL ? null : command(e)
      // a sign-in belongs to no file
      if (e.type === 'connector') return connectorEvent(e)
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
  const st = await fetch(`${BASE}/api/state`).then(r => r.json()).catch(() => null)
  if (WALL || !st?.version || !BOOT.version || st.version === BOOT.version) return
  const busy = (st.working && !viewing) || !els.player.hidden || picker.el || models.el || review.busy || video.busy || video.el || document.activeElement?.closest?.('input, textarea, select')
  if (!busy) location.reload()
}, 8000)

fresh()
setAuto(true)
renderToolbar()
renderPanels()
showTab(['chat', 'log'].includes(store.get('tab')) ? store.get('tab') : 'chat')
if (Q.get('replay')) replayRun(Q.get('replay'), Number(Q.get('speed')) || 8)
else connect()
if (Q.get('run') && !Q.get('replay')) setTimeout(() => openRun(Q.get('run')), 300)
// Nothing live to replay: open the latest saved file rather than an empty canvas.
setTimeout(async () => {
  if (S.run || viewing || Q.get('run') || Q.get('replay')) return
  if (window.swarmCosmos?.atHome?.()) return // studio hook: Projects opens nothing behind it
  await loadFiles()
  const latest = files.find(f => f.preview)
  if (latest && !S.run && !viewing) openRun(latest.id)
}, 700)
requestAnimationFrame(frameLoop)

// ---------- resizable side panels: drag the inner edge, double-click to reset
for (const [sel, name, min, max, dir] of [['.side', '--side-w', 220, 560, 1], ['.design', '--design-w', 220, 480, -1]]) {
  const panel = $(sel)
  if (!panel) continue
  let saved = null
  try { saved = localStorage.getItem(`swarm${name}`) } catch {}
  if (saved) document.body.style.setProperty(name, `${saved}px`)
  const grip = Object.assign(document.createElement('div'), { className: 'resizer' })
  panel.append(grip)
  grip.addEventListener('pointerdown', e => {
    e.preventDefault()
    grip.setPointerCapture(e.pointerId)
    const x0 = e.clientX, w0 = panel.getBoundingClientRect().width
    grip.classList.add('drag'); document.body.classList.add('resizing')
    const move = ev => {
      const w = Math.round(Math.max(min, Math.min(max, w0 + (ev.clientX - x0) * dir)))
      document.body.style.setProperty(name, `${w}px`)
    }
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.classList.remove('drag'); document.body.classList.remove('resizing')
      try { localStorage.setItem(`swarm${name}`, String(Math.round(panel.getBoundingClientRect().width))) } catch {}
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up, { once: true })
  })
  grip.addEventListener('dblclick', () => { document.body.style.removeProperty(name); try { localStorage.removeItem(`swarm${name}`) } catch {} })
}

// ---------- the break room can be put away (☰ More → Break room); idle cursors hide with it
const breakBtn = $('#breakroom-btn')
const setBreakroom = on => { document.body.classList.toggle('no-breakroom', !on); breakBtn?.classList.toggle('on', on); store.set('breakroom', on) }
setBreakroom(store.get('breakroom', true))
if (breakBtn) breakBtn.onclick = () => setBreakroom(document.body.classList.contains('no-breakroom'))
$('#dock-hide')?.addEventListener('click', () => setBreakroom(false))

// ---------- crews: while an app or game builds, a game spec is written or a video
// renders, a few agents work over that screen, each on one real step at a time.
const CREW_NAMES = (Crew.NAMES || ['Pip', 'Mochi', 'Lumi', 'Nova']).slice(0, 4).map(n => [n, Crew.color(n)])
const crewLayer = document.createElement('div')
crewLayer.className = 'crew-layer'
document.body.append(crewLayer)
const crew = { members: [], key: '', last: 0 }
const radioLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
radioLine.setAttribute('class', 'radio-line')
radioLine.setAttribute('aria-hidden', 'true')
radioLine.innerHTML = '<path/>'
crewLayer.append(radioLine)

// Which screen is busy, where the agents may point, and what they are each doing.
function crewJob() {
  if (game.el && game.busy) return { key: 'game', host: game.el, spots: '.gbody, .spin, h3, .gspec', n: 3, lines: ['inventing the world', 'naming the hero', 'drafting enemies', 'picking the engine', 'tuning game feel', 'writing win and lose'], tool: ['text', 'comment', 'frame'] }
  if (view === 'app' && appv.state === 'working' && appv.run === shownRun() && cw.el && !cw.el.hidden) {
    return cw.thinking
      ? { key: `app-plan|${wallNames().map(n => n[0])}`, names: wallNames(), radio: true, host: appEls.view, spots: '.cw-tile', n: CW_TILES, lines: ['planning the next files', 'rereading the design', 'checking what is there', 'weighing the next step'], tool: ['text', 'text', 'connect', 'frame'], pin: cwPin }
      : { key: `app-code|${wallNames().map(n => n[0])}`, names: wallNames(), radio: true, host: appEls.view, spots: '.cw-tile', n: CW_TILES, lines: ['writing code'], tool: ['text', 'text', 'connect', 'frame'], pin: cwPin }
  }
  if (view === 'app' && appv.state === 'working' && appv.run === shownRun()) {
    const done = appv.steps.filter(s => s.kind === 'write' || s.kind === 'gate' || s.kind === 'render').slice(-6).map(s => s.text.replace(/^(wrote|writing|write)\s+/i, '').slice(0, 34))
    return { key: 'app', host: appEls.view, spots: '#app-steps .st:nth-last-child(-n+5), #app-preview, #app-stage', n: 4, lines: done.length ? done : ['setting up the project', 'reading the design', 'planning routes'], tool: ['text', 'frame', 'connect', 'rect'] }
  }
  if (video.busy && video.el) {
    const scenes = video.story.map((sc, i) => `scene ${i + 1}: ${sc.headline}`.slice(0, 34))
    const stage = { storyboard: ['writing the storyboard', 'picking shots'], rendering: ['rendering frames', 'timing the cuts'], assembling: ['encoding the MP4'], 'recording the voiceover': ['reading the voiceover'], 'mixing the sound': ['mixing music and voice'] }[video.stage] || [video.stage || 'cutting']
    return { key: 'video', host: video.el, spots: '.vlive, .vlive, .vscene, .vbar', n: 3, lines: [...stage, ...scenes], tool: ['image', 'frame', 'connect'] }
  }
  return null
}

function crewMembers(n) {
  // the build's own agents when there are some, so the names match the canvas
  const real = [...S.agents.values()].slice(0, n).map(a => [a.name, a.color])
  return (real.length >= n ? real : [...real, ...CREW_NAMES.filter(([nm]) => !real.some(r => r[0] === nm))]).slice(0, n)
}

// A point on one of the screen's busy parts (or anywhere on it), kept apart from the others.
function crewSpot(job, me) {
  const r = job.host.getBoundingClientRect()
  const spots = [...job.host.querySelectorAll(job.spots)].filter(e => e.offsetParent)
  let p
  for (let i = 0; i < 6; i++) {
    const t = spots.length && Math.random() < 0.6 ? pick(spots).getBoundingClientRect() : r
    if (!t.width || !t.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    p = { x: t.left + t.width * (0.1 + Math.random() * 0.8), y: t.top + t.height * (0.15 + Math.random() * 0.7) }
    if (crew.members.every(m => m === me || Math.hypot(m.tx - p.x, m.ty - p.y) > 160)) break
  }
  return p
}

function crewTick(now) {
  requestAnimationFrame(crewTick)
  const job = crewJob()
  const key = job ? job.key : ''
  if (key !== crew.key) {
    crew.key = key
    for (const m of crew.members) { m.el.classList.add('leaving'); setTimeout(() => m.el.remove(), 500) }
    crew.members = []
    if (job) {
      const r = job.host.getBoundingClientRect()
      crew.members = (job.names || crewMembers(job.n)).map(([name, color], i) => {
        const el = document.createElement('div')
        el.className = 'cursor crew'
        el.innerHTML = `${ARROW(color, name)}<div class="tag" style="background:${color};color:${Crew.ink(color)}">${TOOL[job.tool[i % job.tool.length]].svg}<span>${esc(name)}</span><em class="doing"></em></div><div class="bubble"></div>`
        crewLayer.append(el)
        const x = r.left + r.width / 2 + (i - 1) * 40, y = r.bottom - 20
        return { el, name, doing: el.querySelector('.doing'), bubble: el.querySelector('.bubble'), said: 0, x, y, tx: x, ty: y, next: now + i * 450, line: i, pressAt: 0 }
      })
    }
  }
  if (!job) { radioLine.hidden = true; return }
  let lineTo = null
  for (const [i, m] of crew.members.entries()) {
    // pinned: the cursor rides its file's caret while the code types out
    const pin = job.pin?.(i)
    if (pin) {
      m.tx = pin.x; m.ty = pin.y
      setText(m.doing, pin.text)
      if (pin.typing && now > m.pressAt + 160 && Math.random() < 0.12) m.pressAt = now
    } else if (now > m.next) {
      const p = crewSpot(job, m)
      m.tx = p.x; m.ty = p.y
      m.next = now + 1400 + Math.random() * 2200
      m.pressAt = now + 650
      m.line = (m.line + 1 + Math.floor(Math.random() * 2)) % job.lines.length
      setText(m.doing, job.lines[m.line] || '')
    }
    if (job.radio && radioOn()) {
      // the radio wins: what this helper is really doing, and what it just said
      const act = radio.acts.get(m.name), said = radio.says.get(m.name)
      if (heardIn(act, 15000)) setText(m.doing, act.text)
      const talking = heardIn(said, 5500) && !crewQuiet()
      if (talking && m.said !== said.t) { m.said = said.t; m.bubble.innerHTML = '<span></span>'; m.bubble.firstChild.textContent = said.text.slice(0, 160) }
      m.el.classList.toggle('talking', !!talking)
      if (radio.lead?.to === m.name && heardIn(radio.lead, 7000)) lineTo = m
    }
    m.x += (m.tx - m.x) * 0.08
    m.y += (m.ty - m.y) * 0.08
    m.el.classList.toggle('moving', Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 6)
    m.el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`
    m.el.classList.toggle('press', now > m.pressAt && now < m.pressAt + 160)
  }
  // Hermia's dotted line, from her strip to the helper she is giving an order to
  const from = lineTo && cw.el?.querySelector('.cw-radio:not([hidden]) .cw-radio-av')?.getBoundingClientRect()
  radioLine.hidden = !from?.width
  if (!radioLine.hidden) {
    const x1 = from.left + from.width / 2, y1 = from.bottom, x2 = lineTo.x + 6, y2 = lineTo.y + 4
    radioLine.firstChild.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${(y1 + 80).toFixed(1)} ${x2.toFixed(1)} ${(y2 - 80).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`)
    radioLine.style.setProperty('--c', Crew.color(lineTo.name))
  }
}
requestAnimationFrame(crewTick)

// ---------- one Publish button: the website (static pages) or the working app (with its server)
const pubMenu = $('#pub-menu')
const closePub = () => { pubMenu.hidden = true; els.publishBtn.classList.remove('on') }
els.publishBtn.onclick = async e => {
  e.stopPropagation()
  if (pub.run === shownRun() && pub.state === 'working') return pubShow()
  if (!pubMenu.hidden) return closePub()
  pubButton()
  pubMenu.hidden = false
  els.publishBtn.classList.add('on')
  closeable(pubMenu, closePub, { extra: [els.publishBtn] })
  const opt = pubMenu.querySelector('[data-pub="app"]'), why = opt.querySelector('.pub-why')
  const run = shownRun()
  opt.disabled = true
  setText(why, 'checking…')
  const st = run ? await api(`/api/runs/${encodeURIComponent(run)}/app`).then(r => r.ok ? r.json() : {}).catch(() => ({})) : {}
  if (run !== shownRun()) return
  opt.disabled = !st.hasApp || st.state === 'working'
  setText(why, st.state === 'working' ? 'The app is still building.' : !st.hasApp ? 'Build the app first (App mode).' : st.deployed ? `Live at ${st.deployed}; this sends the latest.` : '')
  opt.dataset.has = st.hasApp ? '1' : ''
}
pubMenu.querySelector('.pub-copy').onclick = ev => { ev.stopPropagation(); copyText(liveUrl(), ev.currentTarget, pubMenu.querySelector('.pub-live a')) }
for (const b of pubMenu.querySelectorAll('[data-pub]')) b.onclick = () => {
  closePub()
  if (b.dataset.pub === 'feed') return feedPop()
  if (b.dataset.pub === 'site') return pub.state === 'failed' && pub.run === shownRun() ? pubShow() : publishMenu()
  if (view !== 'app') setView('app')
  if (appv.run !== shownRun()) resetApp(shownRun())
  deployApp()
}
document.addEventListener('mousedown', e => { if (!pubMenu.hidden && !e.target.closest('.pubwrap')) closePub() })

// ---------- pictures in the Design panel: swap any generated photo, or ask for one
const pics = { pending: new Set() }
const gensOf = l => [...new Set([...String(l.text || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')))]
function picturesHtml(l) {
  const gens = gensOf(l)
  const rows = gens.map((g, i) => {
    const k = `${l.key}|${g}`, src = S.images.get(k), busy = pics.pending.has(k) || [...S.agents.values()].some(a => a.painting?.key === k)
    return `<div class="dpic" data-i="${i}">${src ? `<img src="${esc(src)}" alt="">` : `<span class="dpic-none">${busy ? '…' : 'no picture yet'}</span>`}<textarea rows="2" aria-label="Describe the picture you want">${esc(g)}</textarea><button class="dpic-go"${busy ? ' disabled' : ''}>${busy ? '🎨 Painting…' : src ? '🎨 New picture' : '🎨 Make it'}</button></div>`
  }).join('')
  return `<div class="dsec dpics"><h4>Pictures<small>${gens.length ? 'edit the words to change it' : ''}</small></h4>${rows || '<div class="dpic-empty">No photo in this section.</div>'}<div class="dpic-addrow"><input class="dpic-what" placeholder="Add a picture of… (optional)"><button class="dpic-add" aria-label="The section's builder adds one photo; it is painted when the rewrite is done">➕ Add</button></div></div>`
}
function wirePictures(l) {
  const box = els.dDesign.querySelector('.dpics')
  if (!box || !l) return
  const gens = gensOf(l)
  for (const row of box.querySelectorAll('.dpic')) {
    const gen = gens[Number(row.dataset.i)], k = `${l.key}|${gen}`
    row.querySelector('.dpic-go').onclick = async () => {
      const run = shownRun()
      if (!run) return
      pics.pending.add(k); design.last = ''
      const prompt = row.querySelector('textarea').value.trim()
      const res = await api(`/api/runs/${encodeURIComponent(run)}/image`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: l.page, layer: l.id, gen, prompt: prompt !== gen ? prompt : '' }) }).catch(() => null)
      if (!res?.ok) { pics.pending.delete(k); design.last = ''; feed(null, `picture: ${(await res?.json().catch(() => ({})))?.error || 'the canvas server is not answering'}`, 'err') }
    }
  }
  const what = box.querySelector('.dpic-what')
  const add = () => { const w = what.value.trim(); what.value = ''; sendComment(`Add one real photo to this section${w ? `: ${w}` : ', of what it is about'}. Keep everything else.`, l.key) }
  box.querySelector('.dpic-add').onclick = add
  what.onkeydown = e => { if (e.key === 'Enter') add() }
}

// the live preview is a 1920×1080 page, scaled to the panel's width
new ResizeObserver(() => fitLive()).observe(document.body)
function fitLive() {
  for (const box of document.querySelectorAll('.vlive')) {
    const f = box.querySelector('iframe')
    if (f) f.style.transform = `scale(${box.clientWidth / 1920})`
  }
}
setInterval(fitLive, 1000)

// every panel closes three ways: its ×, Esc and a click outside it (spec 12, rule 10; web/ui.js)
function closeable(el, close, opt) { return window.SwarmUI?.layer(el, close, opt) || (() => {}) }

// ---------- ⚡ Auto mode
// One prompt, then a timeline of the whole flow pinned over the studio. The
// studio follows along: the canvas while it designs, Video while it cuts, App
// while it builds, so a recording shows each part working.
const autoM = { pop: null, panel: null, last: null, step: '', min: false }
// minimised or not is remembered per browser (storage may be blocked: then it just starts open)
// folded to its one-line pill unless the person opened it before (spec 12, rule 7)
autoM.min = true
try { autoM.min = localStorage.getItem('swarm.autoMin') !== '0' } catch {}
function setAutoMin(on, remember = true) {
  autoM.min = on
  if (remember) try { localStorage.setItem('swarm.autoMin', on ? '1' : '0') } catch {}
  renderAutoPanel()
}
const AUTO_VIEW = { design: 'canvas', review: 'canvas', video: 'video', app: 'app', tools: 'app', games: 'app', shop: 'app', data: 'app', checks: 'app', deploy: 'app', launch: 'app' }
// step states as drawn icons: a ring, a spinning arc, a check, a dash, a cross
const AUTO_ICON = {
  wait: icon('<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/>'),
  working: icon('<circle cx="12" cy="12" r="8" opacity=".25"/><path d="M12 4a8 8 0 0 1 8 8"/>'),
  done: icon('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.2 9.6"/>'),
  skipped: icon('<path d="M7 12h10"/>'),
  failed: icon('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>')
}

// Auto mode's dialog (Make / Pro and the packs) is gone from the studio; the engine, /api/auto and the
// pack files stay, and a run started elsewhere still reports here.

function autoEvent(e, live = Date.now() - (e.t || 0) < 15000) {
  if (!e?.steps) return
  // a saved run replays its timeline; only a live one moves the studio around
  if (!live && e.run !== shownRun()) return
  const prev = autoM.last
  autoM.last = e
  const now = e.steps.find(s => s.state === 'working')
  if (live && e.state === 'working' && now && now.id !== autoM.step) {
    autoM.step = now.id
    if (!e.run || e.run === shownRun() || !viewing) {
      const v = AUTO_VIEW[now.id]
      // a step card covers the change (spec 07 A1); the view switches under it
      showStep(e, now, () => {
        if (v && v !== view) setView(v)
        if (v !== 'video' && video.el) toggleVideo(false)
      })
    }
  }
  showLiveTab(e)
  if (live && !WALL && (!e.run || e.run === shownRun() || !viewing)) {
    // the deploy shot: the build log while Vercel builds, then the live site
    const dep = e.steps.find(s => s.id === 'deploy')
    if (dep?.state === 'working' && e.run) dsOpen(e.run)
    if (dep?.state === 'done' && e.url && ds.run === e.run) { ds.games = e.steps.some(s => s.id === 'games' && s.state === 'done'); setTimeout(() => dsLive(e.url), 600) }
    // the run is over: the summary card, after the live site has had a moment on screen
    if (prev?.state === 'working' && e.state !== 'working' && prev.run === e.run) setTimeout(() => showSummary(autoM.last), ds.el && e.url ? 9000 : 1200)
  }
  renderAutoPanel()
}

function renderAutoPanel() {
  const e = autoM.last
  if (!e) return
  if (!autoM.panel) {
    autoM.panel = document.createElement('div')
    autoM.panel.className = 'auto-panel'
    document.body.append(autoM.panel)
  }
  const p = autoM.panel
  p.hidden = false
  const secs = ms => { const t = Math.round(ms / 1000); return t >= 60 ? `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s` : `${t}s` }
  // the working step says what its tab is doing right now
  const live = s => s.state !== 'working' || e.run !== shownRun() ? s.note : s.id === 'video' && video.busy && video.stage ? video.stage : AUTO_VIEW[s.id] === 'app' && appv.run === e.run && appv.state === 'working' && appv.stage ? appv.stage : s.note
  const total = e.state === 'working' ? Date.now() - e.t0 : e.ms
  p.className = `auto-panel ${e.state}${autoM.min ? ' min' : ''}`
  const cur = e.steps.find(s => s.state === 'working')
  const doneN = e.steps.filter(s => s.state === 'done' || s.state === 'skipped').length
  autoM.open ||= new Set()
  const nowLabel = cur ? cur.label : e.state === 'done' ? 'done' : e.state === 'failed' ? 'stopped on a step' : e.state
  p.innerHTML = autoM.min
    ? `<div class="ap-head" role="button" tabindex="0" aria-label="Expand the Auto panel"><b>${ico('zap')}Auto</b><span class="ap-dot">·</span><span class="ap-now">${esc(nowLabel)}</span><span class="ap-dot">·</span><span class="ap-time">${secs(total || 0)}</span></div><div class="ap-meter"><i style="width:${(doneN / e.steps.length * 100).toFixed(1)}%"></i></div>`
    : `<div class="ap-head"><b>${ico('zap')}Auto</b><span class="ap-time">${secs(total || 0)}</span>${e.state === 'working' ? '<button class="ap-stop">Stop</button>' : `<button class="ap-close" aria-label="Hide">${ico('x')}</button>`}<button class="ap-min" aria-label="Minimise">${ico('minus')}</button></div>
    <div class="ap-meter"><i style="width:${(doneN / e.steps.length * 100).toFixed(1)}%"></i></div>
    <div class="ap-prompt">${esc(e.prompt || '')}</div>
    <ol>${e.steps.map(s => { const note = live(s), long = note && note.length > 90; return `<li class="${s.state}${autoM.open.has(s.id) ? ' open' : ''}" data-step="${esc(s.id)}"><i>${AUTO_ICON[s.state] || AUTO_ICON.wait}</i><span>${esc(s.label)}${note ? `<small>${linkify(note)}</small>${long ? `<button class="ap-more">${autoM.open.has(s.id) ? 'Less' : 'More'}</button>` : ''}` : ''}</span><em>${s.state === 'working' && s.t0 ? secs(Date.now() - s.t0) : s.ms ? secs(s.ms) : ''}</em></li>` }).join('')}</ol>
    ${e.url ? `<a class="ap-live" href="${esc(e.url)}" target="_blank" rel="noopener">${ico('globe')}Open the live app</a>` : e.state === 'failed' && e.message ? `<div class="ap-msg">${esc(e.message)}</div>` : ''}
    ${e.state !== 'working' && e.run ? `<div class="ap-show"><button class="ap-sum">${ico('sparkles')}Summary</button><button class="ap-kit">${ico('message-square')}Launch kit</button></div>` : ''}`
  for (const b of p.querySelectorAll('.ap-more')) b.onclick = ev => { ev.stopPropagation(); const id = b.closest('li').dataset.step; autoM.open.has(id) ? autoM.open.delete(id) : autoM.open.add(id); renderAutoPanel() }
  p.querySelector('.ap-stop')?.addEventListener('click', ev => { ev.stopPropagation(); api('/api/auto/stop', { method: 'POST' }) })
  // the header folds it to one line, out of the way of what it is showing
  const head = p.querySelector('.ap-head')
  head.onclick = ev => { if (ev.target.closest('button:not(.ap-min)')) return; setAutoMin(!autoM.min) }
  head.onkeydown = ev => { if (autoM.min && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); setAutoMin(false) } }
  p.querySelector('.ap-close')?.addEventListener('click', () => { p.hidden = true })
  // open, it closes with Esc or a click elsewhere: folded while it works, hidden once it is over
  if (!autoM.min) closeable(p, () => (autoM.last?.state === 'working' ? setAutoMin(true) : (p.hidden = true)), { isOpen: () => !autoM.min && !p.hidden, extra: ['#auto-btn'] })
  p.querySelector('.ap-sum')?.addEventListener('click', ev => { ev.stopPropagation(); showSummary(e) })
  p.querySelector('.ap-kit')?.addEventListener('click', ev => { ev.stopPropagation(); openLaunch(e.run) })
}
const linkify = t => esc(t).replace(/https?:\/\/[^\s<"]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
// the clocks tick between events
setInterval(() => { if (autoM.last?.state === 'working' && autoM.panel && !autoM.panel.hidden) renderAutoPanel() }, 1000)
if (!Q.get('replay')) api('/api/auto').then(r => r.ok ? r.json() : null).then(e => { if (e?.steps && (e.state === 'working' || Date.now() - e.t0 < 3600000)) autoEvent(e, e.state === 'working') }).catch(() => {})

// ---------- the Auto show (spec 07): step cards, the reviewer, the deploy shot, the summary,
// the launch kit and the crew's chatter. All of it only watches: none of it changes a build.
const Chatter = window.SwarmChatter || null
const Show = window.SwarmShow || null
const REPLAY = Q.get('replay')
// live, or a replay being watched (?replay=): the show plays for both, a reopened file stays quiet
const showLive = e => live(e) || (!!REPLAY && viewing === REPLAY && !WALL)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const STEP_SHOW = {
  design: ['Designing the', 'site', 'palette'], review: ['Reviewing every', 'page', 'search-check'], app: ['Building the', 'app', 'server'],
  tools: ['Running the', 'tools', 'sliders-horizontal'], games: ['Adding the', 'games', 'gamepad-2'], shop: ['Opening the', 'shop', 'zap'],
  data: ['Wiring the', 'data', 'layers'], checks: ['Checking it', 'works', 'check'], video: ['Cutting the', 'promo', 'clapperboard'],
  deploy: ['Taking it', 'live', 'rocket'], launch: ['Writing the', 'launch kit', 'message-square']
}
const pill = (name, color = Crew.color(name)) => `<span class="sc-pill" style="--c:${color};--ci:${Crew.ink(color)}">${name === 'Hermia' ? HERMIA : Crew.avatar(name, 22)}<b>${esc(name)}</b></span>`
// who works on a step, as the canvas knows them
function stepCrew(id) {
  if (id === 'review') return [['Reviewer', 'var(--info)'], ...crewMembers(2)]
  if (id === 'deploy' || id === 'launch') return [['Hermia', 'var(--frame-hi)'], ...crewMembers(id === 'launch' ? 1 : 2)]
  if (AUTO_VIEW[id] === 'app') return wallNames().slice(0, 4)
  return crewMembers(id === 'design' ? 5 : 3)
}

// A. Step transitions: a full-width card slides in for 1.2 s (step number, the step in display
// type, its icon and crew, Hermia pointing on), the view changes under it, then
// the card slides away. Under prefers-reduced-motion: no card, the new view fades in.
function showStep(e, step, change) {
  const i = e.steps.findIndex(s => s.id === step.id)
  Chatter?.fanfare()
  if (reduced() || WALL) {
    change()
    for (const el of [els.viewport, appEls.view]) if (el && !el.hidden) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' })
    return
  }
  const [verb, word, ic] = STEP_SHOW[step.id] || [step.label.replace(/^\S+\s/, ''), '', 'zap']
  document.querySelector('.show-card')?.remove()
  const el = document.createElement('div')
  el.className = 'show-card'
  el.setAttribute('role', 'status')
  el.innerHTML = `<div class="sc-in"><span class="sc-hermia">${Crew.avatar('Hermia', 96)}</span>
    <div class="sc-main"><div class="sc-step">STEP ${i + 1} / ${e.steps.length}</div>
    <div class="sc-title"><span class="sc-ico">${ico(ic)}</span>${esc(verb)}${word ? ` <em>${esc(word)}</em>` : ''}</div>
    <div class="sc-crew">${stepCrew(step.id).map(([n, c]) => pill(n, c)).join('')}</div></div></div>`
  document.body.append(el)
  // the view changes while the card covers it; the card then slides away and the view fades in
  setTimeout(() => { change(); document.body.classList.add('show-fade'); setTimeout(() => document.body.classList.remove('show-fade'), 500) }, 520)
  setTimeout(() => el.classList.add('out'), 1200)
  setTimeout(() => el.remove(), 1650)
}

// The live view tab pulses while Auto works in it.
function showLiveTab(e) {
  const cur = e.state === 'working' && e.steps.find(s => s.state === 'working')
  const v = cur && AUTO_VIEW[cur.id]
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('live', !!v && b.dataset.view === v)
}

// A2. The reviewer: a cursor in its own colour hovers over the page being checked and draws a
// dashed box round each section it flags; a fix landing flashes the box green and clears it.
const rv = { el: null, page: null, flags: new Map(), x: 0, y: 0, tx: 0, ty: 0, hop: 0, raf: 0, quietAt: 0 }
function rvEnsure() {
  if (rv.el) return rv.el
  rv.el = document.createElement('div')
  rv.el.className = 'cursor rv-cursor'
  rv.el.innerHTML = `${ARROW('var(--info)', 'Reviewer')}<div class="tag">${ico('search-check')}<span>Reviewer</span><em class="doing"></em></div>`
  els.cursors.append(rv.el)
  return rv.el
}
// a point on a section of the page under review, in world space
function rvSpot(page, layerKey) {
  const f = S.frames.find(fr => fr.id === page)
  if (!f) return null
  const keys = layerKey ? [layerKey] : Object.keys(f.geo.slots || {})
  if (!keys.length) return { x: f.x + 640, y: 300 }
  const k = keys[rv.hop++ % keys.length], g = f.geo.slots[k]
  if (!g) return { x: f.x + 640, y: 300 }
  const [left, top, width, height] = g.box
  return { x: f.x + left + width * (0.25 + ((rv.hop * 37) % 50) / 100), y: top + Math.min(height, 600) * 0.45 }
}
function rvTick() {
  rv.raf = 0
  if (!rv.el) return
  if (Date.now() - rv.quietAt > 0 && rv.quietAt && !rv.flags.size) { rv.el.classList.add('leaving'); setTimeout(() => { rv.el?.remove(); rv.el = null }, 600); rv.page = null; return }
  rv.x += (rv.tx - rv.x) * 0.12; rv.y += (rv.ty - rv.y) * 0.12
  const p = toScreen(rv.x, rv.y)
  rv.el.style.transform = `translate(${p.x}px, ${p.y}px)`
  rv.el.classList.toggle('moving', Math.hypot(rv.tx - rv.x, rv.ty - rv.y) > 8)
  els.world.style.setProperty('--inv', String(1 / Math.max(0.05, cam.s)))
  rv.raf = requestAnimationFrame(rvTick)
}
function rvMove(page, layerKey, doing) {
  rvEnsure()
  rv.quietAt = 0
  rv.el.classList.remove('leaving')
  const s = rvSpot(page, layerKey)
  if (s) { if (!rv.page) { rv.x = s.x - 200; rv.y = s.y - 200 } rv.tx = s.x; rv.ty = s.y }
  rv.page = page
  if (doing) rv.el.querySelector('.doing').textContent = doing
  rv.el.classList.remove('press'); void rv.el.offsetWidth; rv.el.classList.add('press')
  clearInterval(rv.wander)
  // it keeps looking around the page until the verdict comes
  rv.wander = setInterval(() => { if (rv.page === page) { const n = rvSpot(page); if (n) { rv.tx = n.x; rv.ty = n.y } } }, 1100)
  if (!rv.raf) rv.raf = requestAnimationFrame(rvTick)
}
function rvFlag(e) {
  const l = S.layers.get(key(e.page, e.layer))
  const s = l && slotFor(l)
  if (!s) return
  rv.flags.get(l.key)?.remove()
  const box = document.createElement('div')
  box.className = 'rv-flag'
  box.style.cssText = `left:${s.box.left}px;top:${s.box.top}px;width:${s.box.width}px;height:${Math.max(s.box.height, 60)}px`
  box.innerHTML = `<span>${esc(e.problem || 'flagged')}</span>`
  s.f.el.append(box)
  rv.flags.set(l.key, box)
  rvMove(e.page, l.key, 'flagging a section')
}
function rvFixed(e) {
  const k = key(e.page, e.layer), box = rv.flags.get(k)
  if (!box) return
  rv.flags.delete(k)
  box.classList.add('fixed')
  setTimeout(() => box.remove(), 1100)
  if (!rv.flags.size && !rv.page) rv.quietAt = Date.now()
}
function reviewShow(e) {
  if (!showLive(e) || WALL) return
  if (e.type === 'review:start') rvMove(e.page, null, `checking ${frameTitle(e.page)}`)
  else if (e.type === 'review:issue') rvFlag(e)
  else if (e.type === 'review:done') { clearInterval(rv.wander); if (rv.page === e.page) { rv.page = null; rv.quietAt = Date.now() + 1500 } if (rv.el) rv.el.querySelector('.doing').textContent = e.issues?.length ? `${e.issues.length} to fix` : 'looks good' }
  else if (e.type === 'layer:done' && e.fixed) rvFixed(e)
}

// A3. The deploy shot. While Vercel builds: a terminal tile with the build log and an edge
// graphic that pulses at each stage. When it is ready: the live site in a laptop and a phone,
// with the crew's cursors clicking around it.
const ds = { el: null, run: null, mode: '', lines: [], stage: '', url: '', timers: [], games: false }
const DS_STAGES = [['upload', 'Upload'], ['building', 'Build'], ['ready', 'Ready']]
function dsClear() { ds.timers.forEach(clearTimeout); ds.timers = [] }
function dsClose() { dsClear(); ds.el?.remove(); Object.assign(ds, { el: null, run: null, mode: '', lines: [], stage: '', url: '' }) }
function dsOpen(run) {
  if (ds.el && ds.run === run) return
  dsClose()
  ds.run = run
  ds.el = document.createElement('div')
  ds.el.className = 'deployshot'
  appEls.view.append(ds.el) // the whole App view, over the steps column and the preview
  if (cw.el) cw.el.hidden = true
  dsBuild()
}
function dsBuild() {
  ds.mode = 'build'
  ds.el.className = 'deployshot build'
  ds.el.innerHTML = `<div class="ds-head"><b class="pop-title">Going <em>live</em></b><span class="ds-sub">Vercel is building it</span><button class="ds-x" aria-label="Close">${ico('x')}</button></div>
    <div class="ds-grid"><div class="ds-term" role="log" aria-live="polite"><div class="ds-tbar"><i></i><i></i><i></i><span>vercel · build</span></div><pre class="ds-log"></pre></div>
    <div class="ds-globe"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="g-ring" cx="100" cy="100" r="78"/><ellipse class="g-lat" cx="100" cy="100" rx="78" ry="30"/><ellipse class="g-lat" cx="100" cy="100" rx="30" ry="78"/><ellipse class="g-lat" cx="100" cy="100" rx="58" ry="78"/><line class="g-lat" x1="22" y1="100" x2="178" y2="100"/>
    ${[[60, 64], [138, 70], [150, 128], [84, 146], [100, 100]].map(([x, y], i) => `<circle class="g-node n${i}" cx="${x}" cy="${y}" r="5"/>`).join('')}<path class="g-arc" d="M60 64Q100 30 138 70M138 70Q170 100 150 128M150 128Q120 160 84 146M84 146Q50 110 60 64"/></svg>
    <ol class="ds-stages">${DS_STAGES.map(([id, label]) => `<li data-s="${id}"><i></i>${label}</li>`).join('')}</ol></div></div>`
  ds.el.querySelector('.ds-x').onclick = dsClose
  dsRender()
}
function dsLog(lines) {
  for (const l of [].concat(lines)) if (l && ds.lines.at(-1) !== l) ds.lines.push(String(l).slice(0, 200))
  ds.lines = ds.lines.slice(-60)
  dsRender()
}
function dsRender() {
  if (!ds.el || ds.mode !== 'build') return
  const pre = ds.el.querySelector('.ds-log')
  pre.innerHTML = ds.lines.map(l => `<span>${esc(l)}</span>`).join('\n') + '<i class="ds-caret"></i>'
  pre.scrollTop = pre.scrollHeight
  const at = DS_STAGES.findIndex(([id]) => id === ds.stage)
  ds.el.querySelectorAll('.ds-stages li').forEach((li, i) => { li.className = i < at ? 'done' : i === at ? 'on' : '' })
  ds.el.querySelector('.ds-globe').dataset.stage = ds.stage || 'upload'
}
function dsStage(stage) {
  const s = /ready/.test(stage) ? 'ready' : /build/.test(stage) ? 'building' : 'upload'
  if (s !== ds.stage) { ds.stage = s; ds.el?.querySelector('.ds-globe')?.classList.remove('pulse'); void ds.el?.offsetWidth; ds.el?.querySelector('.ds-globe')?.classList.add('pulse') }
  dsRender()
}
// the shot's crew, with a pill each
const dsCursor = (name, color) => `<div class="ds-cur" data-name="${esc(name)}">${ARROW(color, name)}<div class="tag" style="background:${color};color:${Crew.ink(color)}"><span>${esc(name)}</span><em class="doing"></em></div></div>`
function dsLive(url) {
  if (!ds.el || ds.mode === 'live') return
  dsClear()
  ds.mode = 'live'; ds.url = url; ds.stage = 'ready'
  const crew3 = crewMembers(3)
  ds.el.className = 'deployshot live'
  ds.el.innerHTML = `<div class="ds-head"><b class="pop-title">It's <em>live</em></b><span class="ds-sub">the crew is trying it</span><button class="ds-x" aria-label="Close">${ico('x')}</button></div>
    <div class="ds-stage"><div class="ds-laptop"><div class="ds-lid"><div class="ds-bar"><span class="ds-dots"><i></i><i></i><i></i></span><span class="ds-url">${esc(url)}</span><button class="ds-copy" aria-label="Copy the link">Copy</button><a class="ds-open" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open it in a new tab">${ico('external-link')}</a></div>
      <div class="ds-screen"><div class="ds-scroll"><iframe aria-label="The live site" src="${esc(url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms"></iframe></div><i class="ds-click"></i></div></div><div class="ds-base"></div></div>
    <div class="ds-phone"><div class="ds-screen"><div class="ds-scroll"><iframe aria-label="The live site on a phone" src="${esc(url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms"></iframe></div><i class="ds-click"></i></div></div>
    <div class="ds-curs">${crew3.map(([n, c]) => dsCursor(n, c)).join('')}</div></div>`
  ds.el.querySelector('.ds-x').onclick = dsClose
  ds.el.querySelector('.ds-copy').onclick = ev => { navigator.clipboard?.writeText(url).then(() => { ev.target.textContent = 'Copied' }, () => { ev.target.textContent = 'Copy failed' }) }
  dsFit()
  Chatter?.cheer(crewMembers(8).map(c => c[0]))
  ds.timers.push(setTimeout(() => Chatter?.line('Hermia', 'Launch!'), 1900))
  if (!reduced()) dsScript(crew3.map(c => c[0]))
}
// the laptop shows a 1280-wide page and the phone a 390-wide one, both scaled to their screens
function dsFit() {
  if (!ds.el || ds.mode !== 'live') return
  for (const [sel, w] of [['.ds-laptop .ds-screen', 1280], ['.ds-phone .ds-screen', 390]]) {
    const s = ds.el.querySelector(sel)
    const f = s?.querySelector('iframe')
    if (!f || !s.clientWidth) continue
    const k = s.clientWidth / w
    Object.assign(f.style, { width: `${w}px`, height: `${Math.round(s.clientHeight / k * 1.6)}px`, transform: `scale(${k})` })
  }
}
new ResizeObserver(dsFit).observe(appEls.preview)
// The cursors' little tour: scroll the hero, open /play, press Play; then the phone; then again.
function dsScript(names) {
  const stage = ds.el.querySelector('.ds-stage')
  const curs = [...ds.el.querySelectorAll('.ds-cur')]
  const lap = ds.el.querySelector('.ds-laptop .ds-screen'), ph = ds.el.querySelector('.ds-phone .ds-screen')
  const pos = (el, fx, fy) => { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy } }
  const go = (c, p, doing) => { c.style.transform = `translate(${p.x}px, ${p.y}px)`; c.classList.add('moving'); setTimeout(() => c.classList.remove('moving'), 700); if (doing != null) c.querySelector('.doing').textContent = doing }
  const click = (c, screen, fx, fy) => {
    c.classList.remove('press'); void c.offsetWidth; c.classList.add('press')
    const dot = screen.querySelector('.ds-click'), r = screen.getBoundingClientRect()
    dot.style.left = `${r.width * fx}px`; dot.style.top = `${r.height * fy}px`
    dot.classList.remove('go'); void dot.offsetWidth; dot.classList.add('go')
  }
  const scroll = (screen, frac) => { const sc = screen.querySelector('.ds-scroll'); sc.style.transform = `translateY(-${frac * 37.5}%)` }
  const play = `${ds.url.replace(/\/?$/, '/')}play`
  const at = (ms, f) => ds.timers.push(setTimeout(() => { if (ds.mode === 'live' && ds.el?.isConnected) f() }, ms))
  const [a, b, c] = curs
  curs.forEach((cu, i) => go(cu, { x: 40 + i * 60, y: stage.clientHeight - 40 }, ''))
  const tour = t0 => {
    at(t0 + 400, () => go(a, pos(lap, 0.5, 0.55), 'scrolling the hero'))
    at(t0 + 1300, () => { scroll(lap, 0.5); Chatter?.play('start', a.dataset.name) })
    at(t0 + 2600, () => scroll(lap, 1))
    at(t0 + 3400, () => go(b, pos(lap, 0.3, 0.06), ds.games ? 'opening /play' : 'opening a page'))
    at(t0 + 4300, () => {
      click(b, lap, 0.3, 0.06)
      if (ds.games) { ds.el.querySelector('.ds-url').textContent = play; lap.querySelector('iframe').src = play; scroll(lap, 0) }
      else scroll(lap, 0)
    })
    at(t0 + 5600, () => go(c, pos(lap, 0.5, 0.5), ds.games ? 'pressing Play' : 'clicking around'))
    at(t0 + 6600, () => { click(c, lap, 0.5, 0.5); Chatter?.play('done', c.dataset.name) })
    at(t0 + 7600, () => go(a, pos(ph, 0.5, 0.6), 'trying it on a phone'))
    at(t0 + 8400, () => { click(a, ph, 0.5, 0.6); scroll(ph, 0.6) })
    at(t0 + 9800, () => { scroll(ph, 0); go(b, pos(lap, 0.8, 0.3), 'looks good') })
    at(t0 + 11200, () => {
      if (ds.games) { ds.el.querySelector('.ds-url').textContent = ds.url; lap.querySelector('iframe').src = frameUrl(ds.url) }
      tour(0)
    })
  }
  tour(0)
}
function deployShow(e) {
  // a deploy's stages and Vercel's build log (saved with the run), while the shot is open
  if (!ds.el || e.run !== ds.run) return
  if (e.type === 'app:stage' && /^deploy:/.test(e.stage || '')) {
    dsStage(e.stage)
    dsLog([...(e.log ? [] : [`› ${e.stage.replace(/^deploy:\s*/, '')}`]), ...(e.log || [])])
  } else if (e.type === 'app:deployed' && e.url) { dsStage('ready'); dsLog(`✓ ready: ${e.url}`); setTimeout(() => dsLive(e.url), 700) }
}

// A4. The final screen: the time and the time per step, the counts, the live link and its QR code.
async function showSummary(e) {
  if (!e?.run) return
  document.querySelector('.show-sum')?.remove()
  const r = await api(`/api/runs/${encodeURIComponent(e.run)}/show`).catch(() => null)
  const f = r?.ok ? await r.json() : {}
  const url = e.url || f.url || null
  const total = e.ms || e.steps.reduce((n, s) => n + (s.ms || 0), 0) || 1
  const secs = ms => { const t = Math.round((ms || 0) / 1000); return t >= 60 ? `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s` : `${t}s` }
  const games = e.steps.some(s => s.id === 'games' && s.state === 'done')
  const el = document.createElement('div')
  el.className = 'show-sum'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', 'Auto summary')
  let qr = ''
  try { qr = url && Show ? Show.qrSvg(url, `QR code for ${url}`) : '' } catch {}
  const counts = [['agents', f.agents], ['pages', f.pages], ['sections', f.sections], ['images', f.images], ['files', f.files], ['lines', f.lines]].filter(([, n]) => n != null)
  const crewNames = crewMembers(Math.min(8, f.agents || 6))
  el.innerHTML = `<div class="ss-card"><button class="ss-x" aria-label="Close">${ico('x')}</button>
    <div class="ss-kicker">${ico('zap')}Auto · ${e.state === 'done' ? 'shipped' : 'stopped'}</div>
    <h2 class="ss-title">${e.state === 'done' ? 'One prompt. The <em>whole</em> thing.' : 'Stopped on <em>a step</em>.'}</h2>
    <div class="ss-total"><b>${secs(total)}</b><span>from prompt to ${url ? 'live link' : 'the last step'}</span></div>
    <div class="ss-bar" role="img" aria-label="Time per step">${e.steps.map(s => `<i class="${s.state}" style="flex:${Math.max(s.ms || 0, total * 0.012)}"></i>`).join('')}</div>
    <ol class="ss-steps">${e.steps.map(s => `<li class="${s.state}"><span class="ss-ico">${ico((STEP_SHOW[s.id] || [])[2] || 'zap')}</span><span>${esc(s.label.replace(/^\S+\s/, ''))}</span><em>${s.ms ? secs(s.ms) : s.state === 'skipped' ? 'skipped' : '—'}</em></li>`).join('')}</ol>
    <div class="ss-counts">${counts.map(([k, n]) => `<div><b>${Number(n).toLocaleString()}</b><span>${k}</span></div>`).join('')}</div>
    <div class="ss-crew">${HERMIA}${crewNames.map(([n]) => Crew.avatar(n, 24)).join('')}<span>Hermia and ${f.agents || crewNames.length} crew</span></div>
    ${url ? `<div class="ss-live"><div class="ss-qr">${qr}</div><div class="ss-link"><small>Live at</small><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><button class="ss-copy">Copy link</button></div></div>` : ''}
    <div class="ss-actions">${url && games ? `<a class="primary ss-play" href="${esc(url.replace(/\/?$/, '/'))}play" target="_blank" rel="noopener">${ico('gamepad-2')}Play the game</a>` : ''}${url ? `<a class="ss-open" href="${esc(url)}" target="_blank" rel="noopener">${ico('globe')}Open the site</a>` : ''}<button class="ss-launch">${ico('message-square')}Open the launch kit</button></div></div>`
  document.body.append(el)
  const close = () => el.remove()
  el.querySelector('.ss-x').onclick = close
  closeable(el.querySelector('.ss-card'), close)
  el.onclick = ev => { if (ev.target === el) close() }
  el.querySelector('.ss-copy')?.addEventListener('click', ev => navigator.clipboard?.writeText(url).then(() => { ev.target.textContent = 'Copied' }, () => {}))
  el.querySelector('.ss-launch').onclick = () => { close(); openLaunch(e.run) }
}

// C. The launch kit: a card per network with Post / Edit / Skip. Post opens the network's own
// share page, prefilled; the person presses Post there. Discord, Slack and Telegram go through
// Hermes's gateway, and only after a confirm box with the exact text, channel and attachments.
// Nothing is ever sent by itself.
const NET_ICON = { x: '𝕏', linkedin: 'in', threads: '@', bluesky: '🦋', instagram: '◎', tiktok: '♪', discord: '◆', slack: '#', telegram: '➤' }
async function openLaunch(run) {
  if (!run) return
  document.querySelector('.launch-pop')?.remove()
  const el = document.createElement('div')
  el.className = 'game-pop launch-pop'
  el.innerHTML = `<div class="ghead"><b class="kicker">${ico('message-square')}Launch kit</b><button class="gclose" aria-label="Close">${ico('x')}</button></div><p class="lk-wait">Writing the posts…</p>`
  document.body.append(el)
  el.querySelector('.gclose').onclick = () => el.remove()
  closeable(el, () => el.remove(), { extra: ['.ui-overlay'] })
  let res = await api(`/api/runs/${encodeURIComponent(run)}/launch`).catch(() => null)
  if (res?.status === 404) res = await api(`/api/runs/${encodeURIComponent(run)}/launch`, { method: 'POST' }).catch(() => null)
  const kit = res?.ok ? await res.json() : null
  if (!kit) { el.querySelector('.lk-wait').textContent = 'The launch kit could not be written.'; return }
  const gw = (await api('/api/gateway').then(r => r.json()).catch(() => ({}))).platforms || {}
  renderLaunch(el, run, kit, gw)
}
function renderLaunch(el, run, kit, gw) {
  const mark = (post, action, text) => api(`/api/runs/${encodeURIComponent(run)}/launch/mark`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ post, action, text }) }).then(r => r.ok ? r.json() : null).catch(() => null)
  const url = kit.facts.url
  const media = kit.media.filter(m => m.kind !== 'link')
  el.innerHTML = `<div class="ghead"><b class="kicker">${ico('message-square')}Launch kit</b><button class="gclose" aria-label="Close">${ico('x')}</button></div>
    <h3>Tell people. <em>You</em> press Post.</h3>
    <p class="lk-note">Written from this run's facts${url ? ` and its live link` : ''}. Post opens each network's own page with the text filled in; you post it there. Nothing is sent from here without your click.</p>
    ${media.length ? `<div class="lk-media"><span>Media to attach</span>${media.map(m => `<a href="${esc(m.src)}" download target="_blank" rel="noopener" data-kind="${m.kind}">${m.kind === 'image' ? `<img src="${esc(m.src)}" alt="">` : ico('clapperboard')}<small>${esc(m.label)}</small></a>`).join('')}</div>` : ''}
    <div class="lk-cards">${kit.posts.map(p => launchCard(p, gw)).join('')}</div>`
  el.querySelector('.gclose').onclick = () => el.remove()
  for (const card of el.querySelectorAll('.lk-card')) {
    const p = kit.posts.find(x => x.id === card.dataset.id)
    const parts = () => [...card.querySelectorAll('textarea')].map(t => t.value)
    const status = s => { p.status = s; card.dataset.status = s; card.querySelector('.lk-status').textContent = s === 'ready' ? '' : s }
    const count = () => { for (const t of card.querySelectorAll('textarea')) t.nextElementSibling.textContent = `${t.value.length}/${p.thread ? 280 : p.limit}` }
    count()
    card.querySelectorAll('textarea').forEach(t => t.addEventListener('input', count))
    card.querySelector('.lk-edit').onclick = async ev => {
      const editing = card.classList.toggle('editing')
      card.querySelectorAll('textarea').forEach(t => { t.readOnly = !editing })
      ev.currentTarget.textContent = editing ? 'Save' : 'Edit'
      if (editing) card.querySelector('textarea').focus()
      else {
        const v = parts()
        const out = await mark(p.id, 'edited', p.thread ? v : v[0])
        const np = out?.posts.find(x => x.id === p.id)
        if (np) Object.assign(p, np)
      }
    }
    card.querySelector('.lk-skip').onclick = () => { mark(p.id, 'skipped'); status('skipped') }
    const post = card.querySelector('.lk-post')
    if (p.how === 'intent') {
      let part = 0
      post.onclick = () => {
        const texts = p.thread ? parts() : [parts()[0]]
        const text = texts[part] || texts[0]
        // the link rides on the last post of a thread, or on the only one
        const link = !p.thread || part === texts.length - 1 ? kit.facts.url : ''
        const u = Show?.shareUrl(p.network, text, link)
        if (!u) return
        window.open(u, '_blank', 'noopener')
        mark(p.id, 'opened'); status('opened')
        if (p.thread && part < texts.length - 1) { part++; post.textContent = `Post ${part + 1}/${texts.length}` }
      }
    } else if (p.how === 'download') {
      post.onclick = () => {
        navigator.clipboard?.writeText(parts()[0]).catch(() => {})
        const v = media.find(m => m.kind === 'video') || media[0]
        if (v) { const a = document.createElement('a'); a.href = v.src; a.download = ''; a.click() }
        post.textContent = 'Caption copied'
        mark(p.id, 'downloaded'); status('opened')
      }
    } else if (p.how === 'gateway') {
      card.querySelector('.lk-copy').onclick = ev => navigator.clipboard?.writeText(parts()[0]).then(() => { ev.target.textContent = 'Copied'; mark(p.id, 'copied') }, () => {})
      post.onclick = () => launchConfirm(run, p, parts()[0], gw[p.network] || [], kit, out => { if (out) status('sent') })
    }
  }
}
function launchCard(p, gw) {
  const texts = p.thread || [p.text]
  const gwOn = p.how === 'gateway' && gw[p.network]
  const postLabel = p.how === 'intent' ? (p.thread ? `Post 1/${texts.length}` : 'Post') : p.how === 'download' ? 'Download video + copy caption' : gwOn ? 'Post…' : `Connect ${p.label} in Hermes to send`
  return `<div class="lk-card" data-id="${esc(p.id)}" data-status="${esc(p.status)}"><div class="lk-head"><span class="lk-net">${NET_ICON[p.network] || '•'}</span><b>${esc(p.label)}</b>${p.thread ? `<small>thread of ${texts.length}</small>` : ''}<em class="lk-status">${p.status === 'ready' ? '' : esc(p.status)}</em></div>
    ${texts.map((t, i) => `<label class="lk-text">${p.thread ? `<span class="lk-n">${i + 1}</span>` : ''}<textarea readonly rows="${Math.min(8, Math.max(2, Math.ceil(t.length / 46)))}" aria-label="${esc(p.label)} post${p.thread ? ` ${i + 1}` : ''}">${esc(t)}</textarea><small class="lk-count"></small></label>`).join('')}
    <div class="lk-btns"><button class="primary lk-post"${p.how === 'gateway' && !gwOn ? ' disabled' : ''}>${esc(postLabel)}</button>${p.how === 'gateway' ? '<button class="lk-copy">Copy</button>' : ''}<button class="lk-edit">Edit</button><button class="lk-skip">Skip</button></div></div>`
}
// the one way a post leaves through Hermes: this box, with the exact text, the channel and the attachments, then Send
function launchConfirm(run, p, text, targets, kit, done) {
  document.querySelector('.lk-confirm')?.remove()
  const box = document.createElement('div')
  box.className = 'lk-confirm'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  const opts = (Array.isArray(targets) ? targets : []).map(t => typeof t === 'string' ? t : t.target || t.id || t.name).filter(Boolean)
  box.innerHTML = `<div class="lkc-card"><h4>Send to ${esc(p.label)}?</h4>
    <label>Channel <select class="lkc-target">${[p.network, ...opts.filter(o => o !== p.network)].map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
    <div class="lkc-label">Exactly this text</div><pre class="lkc-text">${esc(text)}</pre>
    <div class="lkc-label">Attachments</div><p class="lkc-att">None. The link is in the text${kit.media.some(m => m.kind !== 'link') ? '; media stays here to attach by hand' : ''}.</p>
    <p class="lkc-err" hidden></p>
    <div class="lkc-btns"><button class="lkc-cancel">Cancel</button><button class="primary lkc-send">Send</button></div></div>`
  document.body.append(box)
  const close = () => box.remove()
  box.querySelector('.lkc-cancel').onclick = close
  box.querySelector('.lkc-cancel').focus()
  box.querySelector('.lkc-send').onclick = async ev => {
    ev.currentTarget.disabled = true
    const r = await api(`/api/runs/${encodeURIComponent(run)}/launch/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ post: p.id, text, target: box.querySelector('.lkc-target').value, confirm: true }) }).catch(() => null)
    const out = await r?.json().catch(() => ({}))
    if (!r?.ok) { const er = box.querySelector('.lkc-err'); er.hidden = false; er.textContent = out?.error || 'the send failed'; ev.currentTarget.disabled = false; return }
    done(out); close()
  }
}

// B. Chatter: the same events the canvas draws, as sounds. Off unless the person turns it on.
const chat = { failed: new Set(), said: new Set() }
function chatterHear(e) {
  if (!Chatter?.on || !showLive(e)) return
  const nameOf = id => S.agents.get(id)?.name
  const once = (k, f) => { if (!chat.said.has(k)) { chat.said.add(k); f() } }
  switch (e.type) {
    case 'run:start': Chatter.run(e.run); chat.failed.clear(); chat.said.clear(); break
    case 'agent:assign': {
      const k = key(e.page, e.layer)
      if (chat.failed.delete(k)) Chatter.play('retry', nameOf(e.agent))
      else Chatter.play('start', nameOf(e.agent))
      break
    }
    case 'layer:done':
      Chatter.play('done', nameOf(e.agent))
      if (e.fixed) once('fix', () => setTimeout(() => Chatter.line(nameOf(e.agent) || 'Pip', 'looks good!'), 600))
      break
    case 'layer:failed': chat.failed.add(key(e.page, e.layer)); Chatter.play('fail', nameOf(e.agent)); break
    case 'review:issue': Chatter.play('gasp', REVIEWER); break
    // pictures and the review, as sounds: the painter starts, finishes, tries again or trips; the reviewer checks
    case 'image:queued': Chatter.play('start', painterOf(`${e.page}/${e.layer}/${e.gen}`)); break
    case 'image': if (e.layer && e.gen) Chatter.play('done', painterOf(`${e.page}/${e.layer}/${e.gen}`)); break
    case 'image:sent-back': Chatter.play('retry', painterOf(`${e.page}/${e.layer}/${e.gen}`)); break
    case 'image:failed': Chatter.play('fail', painterOf(`${e.page}/${e.layer}/${e.gen}`)); break
    case 'review:start': Chatter.play('start', REVIEWER); break
    case 'review:done': Chatter.play(e.issues?.length ? 'fail' : 'done', REVIEWER); break
    case 'crew:lead': if (e.kind === 'assign') Chatter.babble('Hermia', e.text); break
    case 'agent:say': if (e.app) Chatter.babble(e.name, e.text); break
    case 'app:step': if (e.step?.kind === 'write') { const n = wallNames(); Chatter.play('start', n[(appv.steps.length) % n.length]?.[0]) } break
    case 'auto': {
      const cur = e.steps?.find(s => s.state === 'working')
      if (cur?.id === 'games' && e.games === 'big') once('boss', () => setTimeout(() => Chatter.line(crewMembers(2)[1]?.[0] || 'Mochi', 'boss fight!'), 1500))
      if (cur?.id === 'deploy') once('ship', () => setTimeout(() => Chatter.line(crewMembers(1)[0]?.[0] || 'Pip', 'ship it!'), 1500))
      break
    }
  }
}
// the agent who is talking moves its mouth
if (Chatter) {
  Chatter.setup({ fetch: path => api(path) })
  Chatter.onTalk((name, ms) => {
    const els_ = [...S.agents.values()].filter(a => a.name === name).map(a => a.el)
    if (name === 'Reviewer' && rv.el) els_.push(rv.el)
    for (const el of document.querySelectorAll(`.ds-cur[data-name="${CSS.escape(name)}"]`)) els_.push(el)
    for (const el of els_) { el.classList.add('babble'); clearTimeout(el._babble); el._babble = setTimeout(() => el.classList.remove('babble'), Math.min(4000, ms + 80)) }
  })
}
// when the crew is on, ask the studio's voice for its few real lines ahead of time
if (Chatter && !WALL) {
  let primed = false
  Chatter.watch(s => {
    if (s.on && !primed) { primed = true; for (const [w, t] of [['Pip', 'ship it!'], ['Pip', 'looks good!'], ['Pip', 'boss fight!'], ['Hermia', 'Launch!']]) api(`/api/chatter/say?text=${encodeURIComponent(t)}&who=${w}`).catch(() => {}) }
  })
  // the audio may only start after a click or key: a saved "on" waits for the first one
  addEventListener('pointerdown', () => { if (Chatter.on) Chatter.setOn(true) }, { once: true })
}

// The crew button in the top bar is the one sound control (spec 12, rule 11). A click opens its
// popover: the three crew states and the volume. The M key steps through the states:
// on (voices and sounds) → sounds off → quiet (no sounds, no bubbles). Quiet also hides the speech
// bubbles on the canvas and Hermia's strip and the helpers' bubbles on the code wall. Remembered in
// this browser. The button keeps its width whichever word it shows.
const CREW_KEY = 'swarm.crew'
const CREW_MODES = ['on', 'muted', 'quiet']
const CREW_WORD = { on: 'Crew', muted: 'Muted', quiet: 'Quiet' }
const crewBtn = document.getElementById('crew-mute')
let crewMode = 'muted'
let soundPop = null // the crew button's popover, while it is open
function setCrewMode(m, { save = true, chatter = true } = {}) {
  if (!CREW_MODES.includes(m)) m = 'muted'
  crewMode = m
  if (save) try { localStorage.setItem(CREW_KEY, m) } catch {}
  document.body.classList.toggle('crew-quiet', m === 'quiet')
  if (m === 'quiet') for (const a of S.agents.values()) { a.sayUntil = 0; if (a.bubble) a.bubble.textContent = '' }
  if (chatter && Chatter && Chatter.on !== (m === 'on')) Chatter.setOn(m === 'on')
  if (crewBtn) {
    crewBtn.dataset.mode = m
    crewBtn.setAttribute('aria-label', `Crew sound: ${CREW_WORD[m].toLowerCase()}`)
    const t = crewBtn.querySelector('.t'); if (t) t.textContent = CREW_WORD[m]
  }
  renderSoundPop()
}
const cycleCrew = () => {
  setCrewMode(CREW_MODES[(CREW_MODES.indexOf(crewMode) + 1) % CREW_MODES.length])
  if (crewMode === 'on') Chatter?.babble('Hermia', 'hello crew')
}
if (WALL) { if (crewBtn) crewBtn.hidden = true } else {
  let saved = null
  try { saved = localStorage.getItem(CREW_KEY) } catch {}
  // a saved quiet stays quiet; otherwise the chatter's own switch says on or sounds off
  setCrewMode(saved === 'quiet' && Q.get('chatter') !== '1' ? 'quiet' : Chatter?.on ? 'on' : 'muted', { save: false })
  if (crewBtn) crewBtn.onclick = openSoundPop
  // the chatter's own switch moves the button too: on is on, off is sounds off (quiet stays quiet)
  Chatter?.watch(s => {
    if (s.on && crewMode !== 'on') setCrewMode('on', { chatter: false })
    else if (!s.on && crewMode === 'on') setCrewMode('muted', { chatter: false })
  })
  addEventListener('keydown', e => {
    if (e.key !== 'm' && e.key !== 'M') return
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, select, textarea, [contenteditable]')) return
    if (!els.player.hidden) return // the player uses M for its motion switch
    cycleCrew()
  })
}
// the crew button's popover: the three states and the volume, nothing else
function renderSoundPop() {
  if (!soundPop || soundPop.closed) return
  for (const b of soundPop.el.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === crewMode))
  const vol = soundPop.el.querySelector('.ui-slider')
  if (vol && Chatter) { vol.value = String(Math.round((Chatter.volume ?? 0.6) * 100)); window.SwarmUI?.slider(vol) }
}
function openSoundPop(e) {
  e?.stopPropagation()
  if (soundPop && !soundPop.closed) return soundPop.close('toggle')
  if (!window.SwarmUI) return cycleCrew()
  soundPop = window.SwarmUI.popover(crewBtn, `<div class="ui-toggle-group ui-block" role="radiogroup" aria-label="Crew sound">${CREW_MODES.map(m => `<button class="ui-toggle" role="radio" data-mode="${m}">${{ on: 'On', muted: 'Muted', quiet: 'Quiet' }[m]}</button>`).join('')}</div>
    ${Chatter ? '<label class="ui-field sound-vol"><span class="ui-label">Volume</span><input class="ui-slider" type="range" min="0" max="100" step="5"></label>' : ''}`, { className: 'sound-pop' })
  for (const b of soundPop.el.querySelectorAll('[data-mode]')) b.onclick = () => { setCrewMode(b.dataset.mode); if (crewMode === 'on') Chatter?.babble('Hermia', 'hello crew') }
  const vol = soundPop.el.querySelector('.ui-slider')
  if (vol) vol.oninput = () => Chatter.setVolume(Number(vol.value) / 100)
  renderSoundPop()
}
Chatter?.watch?.(() => renderSoundPop())

// ---------- the code wall: while the engine builds an app or a game, the files it
// writes type out in tiles, one agent per tile with its cursor on the caret.
const CW_TILES = 4
// ---------- crew radio: the app engine's lead (spoken by Hermia) gives orders, helpers answer
// and work. On the code wall: Hermia's strip on top with a dotted line to the helper she is
// talking to, each helper's reply as a bubble on its cursor, and what it is doing right now
// (crew:act, live only) as its name-pill status.
const radio = { run: null, lead: null, reason: null, acts: new Map(), says: new Map(), order: [] }
function radioEvent(e) {
  const run = e.run || appv.run || shownRun()
  if (radio.run !== run) Object.assign(radio, { run, lead: null, reason: null, acts: new Map(), says: new Map(), order: [] })
  const t = e.t || Date.now()
  const meet = n => { if (n && n !== 'Hermia' && !radio.order.includes(n)) radio.order.push(n) }
  // the lead's reasoning (kind 'reason', "💭 …"): a dimmer thought line in her strip, never an order
  if (e.type === 'crew:lead' && e.kind === 'reason') radio.reason = { text: String(e.text || '').replace(/^💭\s*/u, ''), full: e.full || '', t }
  else if (e.type === 'crew:lead') { radio.lead = { text: e.text, to: e.to, kind: e.kind || 'think', t }; meet(e.to) }
  else if (e.type === 'crew:act') { radio.acts.set(e.name, { text: e.text, t }); meet(e.name) }
  else if (e.type === 'agent:say') { radio.says.set(e.name, { text: e.text, kind: e.kind, t }); meet(e.name) }
}
const radioOn = () => radio.run && radio.run === appv.run
// the wall's crew: the helpers the radio has heard from first, then the build's agents
function wallNames() {
  const heard = radioOn() ? radio.order.slice(0, CW_TILES).map(n => [n, Crew.color(n)]) : []
  return [...heard, ...crewMembers(CW_TILES + heard.length).filter(([n]) => !heard.some(h => h[0] === n))].slice(0, CW_TILES)
}
const heardIn = (x, ms) => x && Date.now() - x.t < ms
const cw = { el: null, run: null, seen: 0, queue: [], tiles: [], hide: false, shown: false, thinking: false, planKey: '' }
const clock = ms => { const t = Math.max(0, Math.round(ms / 1000)); return t >= 60 ? `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s` : `${t}s` }
const kTokens = n => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
// Between batches the engine is thinking (its "next step" line): nothing is written for a
// minute or more, so the wall says who is planning, for how long, and with how much context.
function cwPlan(steps) {
  const last = steps.findLast(s => s.kind !== 'tokens' && s.kind !== 'ask')
  if (!(last ? last.kind === 'think' : appv.stage === 'next step')) return null
  const think = steps.findLast(s => s.kind === 'think')
  const write = steps.findLast(s => s.kind === 'write')
  const turn = steps.findLast(s => s.kind === 'turn')?.turn || 1
  const files = [...new Set(steps.filter(s => s.kind === 'write').map(s => s.text).reverse())].slice(0, 4)
  return { since: write?.t || think?.t || cw.planSince || Date.now(), tokens: think?.tokens || 0, turn, files }
}
function cwHighlight(text) {
  // comments, strings, keywords and tags; everything escaped piece by piece
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\.)*`?)|(<\/?[A-Za-z][\w.]*)|\b(import|from|export|default|const|let|var|function|return|async|await|if|else|for|while|new|class|extends|type|interface|true|false|null|undefined)\b/g
  let out = '', last = 0, m
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index))
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 't' : 'k'
    out += `<i class="cw-${cls}">${esc(m[0])}</i>`
    last = re.lastIndex
  }
  return out + esc(text.slice(last))
}

function codeWall() {
  const on = view === 'app' && appv.state === 'working' && appv.run === shownRun()
  if (!on) {
    cw.shown = false
    if (cw.el) cw.el.hidden = true
    if (appv.state !== 'working') Object.assign(cw, { run: null, seen: 0, queue: [], tiles: [] })
    return
  }
  if (!cw.el) {
    cw.el = document.createElement('div')
    cw.el.className = 'codewall'
    cw.el.innerHTML = `<div class="cw-head"><b class="pop-title">${appv.kind === 'game' ? 'Writing the <em>game</em>' : 'Writing the <em>app</em>'}</b><span class="cw-count"></span><button class="cw-peek" aria-label="Hide the code and look at the app">${ico('eye')}Preview</button></div><div class="cw-radio" hidden></div><div class="cw-plan" hidden></div><div class="cw-grid"></div>`
    cw.el.querySelector('.cw-peek').onclick = () => { cw.hide = true; cw.el.hidden = true }
    appEls.preview.append(cw.el)
  }
  if (cw.run !== appv.run) Object.assign(cw, { run: appv.run, seen: Math.max(0, appv.steps.length - 30), queue: [], tiles: [], hide: false })
  cw.el.hidden = cw.hide
  // the wall just came up while Auto is running: fold the Auto panel to its pill so it does not cover the code
  if (!cw.hide && !cw.shown) {
    cw.shown = true
    if (autoM.last?.state === 'working' && !autoM.min) setAutoMin(true, false)
  }
  // newly written files join the queue (newest wins; a file already up is retyped)
  const steps = appv.steps
  for (; cw.seen < steps.length; cw.seen++) {
    const s = steps[cw.seen]
    if (s.kind !== 'write' || s.file === false || !/\.(tsx?|jsx?|css|json|md|html)$/.test(s.text) || /lock|tsbuildinfo/.test(s.text)) continue
    cw.queue = [...cw.queue.filter(f => f !== s.text), s.text].slice(-12)
  }
  // a free tile (empty, or done typing for a moment) takes the next file
  const now = performance.now()
  for (let i = 0; i < CW_TILES && cw.queue.length; i++) {
    const t = cw.tiles[i]
    if (t && (t.loading || t.shown < t.text.length || now - t.doneAt < 1500)) continue
    const path = cw.queue.shift()
    cw.tiles[i] = { path, text: '', shown: 0, loading: true, doneAt: 0 }
    const tile = cw.tiles[i]
    appApi(`/files?path=${encodeURIComponent(path)}`).then(r => { tile.text = String(r.text || '').slice(0, 6000) }).catch(() => { tile.text = '' }).finally(() => { tile.loading = false; if (!tile.text) tile.doneAt = 0 })
  }
  const grid = cw.el.querySelector('.cw-grid')
  const names = wallNames()
  // Hermia's strip: her newest line, and who it is for
  const strip = cw.el.querySelector('.cw-radio'), lead = radioOn() ? radio.lead : null
  // her reasoning shows under her newest line while it is fresh (or alone, before her first line)
  const reason = radioOn() && heardIn(radio.reason, 20000) && (!lead || radio.reason.t >= lead.t - 1000) ? radio.reason : null
  strip.hidden = !(lead || reason) || crewQuiet()
  const stamp = `${lead?.t || 0}/${reason?.t || 0}`
  if ((lead || reason) && strip.dataset.t !== stamp) {
    strip.dataset.t = stamp
    const kind = lead ? { assign: 'order', ack: 'roger', think: 'thinking' }[lead.kind] || lead.kind : 'reasoning'
    strip.className = `cw-radio ${lead ? lead.kind : 'reason'}`
    strip.innerHTML = `<span class="cw-radio-av">${HERMIA}</span><div class="cw-radio-main"><div class="cw-radio-who"><b>Hermia</b>${lead?.to ? `<span class="to">→</span><b style="color:${Crew.color(lead.to)}">${esc(lead.to)}</b>` : ''}<em>${esc(kind)}</em></div>${lead ? `<p>${esc(lead.text)}</p>` : ''}${reason ? `<p class="cw-reason">💭 ${esc(reason.text)}</p>` : ''}</div>`
  }
  while (grid.children.length < CW_TILES) {
    const d = document.createElement('div')
    d.className = 'cw-tile'
    d.innerHTML = '<div class="cw-file"><span class="cw-path"></span><em class="cw-who"></em></div><pre class="cw-code"></pre>'
    grid.append(d)
  }
  let writing = 0
  cw.tiles.forEach((t, i) => {
    const d = grid.children[i]
    if (!t) return
    if (!t.loading && t.shown < t.text.length) {
      t.shown = Math.min(t.text.length, t.shown + Math.max(3, Math.ceil(t.text.length / 260)))
      if (t.shown >= t.text.length) t.doneAt = now
      writing++
    }
    d.classList.toggle('typing', !t.loading && t.shown < t.text.length)
    setText(d.querySelector('.cw-path'), t.path)
    const [name, color] = names[i] || ['', '#888']
    const who = d.querySelector('.cw-who')
    if (who.dataset.name !== name) { who.dataset.name = name; who.innerHTML = name ? `${Crew.avatar(name, 16)}<span>${esc(name)}</span>` : ''; who.style.background = color; who.style.color = Crew.ink(color) }
    if (d.dataset.shown !== String(t.shown) || d.dataset.path !== t.path) {
      d.dataset.shown = t.shown; d.dataset.path = t.path
      // the last lines, so the caret stays in view
      const typed = t.text.slice(0, t.shown), lines = typed.split('\n')
      const from = Math.max(0, lines.length - 26)
      const pre = d.querySelector('.cw-code')
      pre.innerHTML = cwHighlight(lines.slice(from).join('\n')) + '<b class="cw-caret"></b>'
      pre.scrollTop = pre.scrollHeight
    }
  })
  const nFiles = new Set(steps.filter(s => s.kind === 'write').map(s => s.text)).size
  const plan = cwPlan(steps), planEl = cw.el.querySelector('.cw-plan')
  if (plan && !cw.thinking) cw.planSince = Date.now()
  cw.thinking = !!plan
  planEl.hidden = !plan
  if (plan) {
    const acts = radioOn() ? [...radio.acts.entries()].filter(([, x]) => heardIn(x, 60000)).sort((x, y) => y[1].t - x[1].t) : []
    const name = acts[0]?.[0] || names[0]?.[0] || 'Pip', age = clock(Date.now() - plan.since)
    const key = `${name}|${plan.turn}|${plan.tokens}|${plan.files.join()}`
    if (cw.planKey !== key) {
      cw.planKey = key
      planEl.innerHTML = `<span class="cw-plan-av">${Crew.avatar(name, 40)}</span>`
        + `<div class="cw-plan-main"><b class="pop-title"><span>${esc(name)}</span> is planning the next <em>files</em></b>`
        + `<div class="cw-plan-meta"><span>${ico('brain-circuit')}turn ${plan.turn}</span>${plan.tokens ? `<span>${kTokens(plan.tokens)} tokens of context</span>` : ''}<span class="cw-plan-age"></span></div>`
        + `<div class="cw-plan-act"></div><div class="cw-plan-bar"><i></i></div></div>`
        + (plan.files.length ? `<div class="cw-plan-files"><small>Last written</small>${plan.files.map(f => `<code>${esc(f.split('/').slice(-2).join('/'))}</code>`).join('')}</div>` : '')
    }
    setText(planEl.querySelector('.cw-plan-age'), `${age} since the last file`)
    setText(planEl.querySelector('.cw-plan-act'), acts[0] ? `${acts[0][0]}: ${acts[0][1].text}` : '')
    setText(cw.el.querySelector('.cw-count'), `${nFiles} file${nFiles === 1 ? '' : 's'} · planning turn ${plan.turn} (${age})`)
  } else {
    cw.planKey = ''
    setText(cw.el.querySelector('.cw-count'), `${nFiles} file${nFiles === 1 ? '' : 's'} · ${writing} typing · ${appv.stage || ''}`)
  }
}

// the crew's cursor for tile i sits on that tile's caret
function cwPin(i) {
  const t = cw.tiles[i], d = cw.el?.querySelector('.cw-grid')?.children[i]
  const caret = d?.querySelector('.cw-caret')
  if (!t || !caret || (cw.thinking && t.shown >= t.text.length)) return null
  const r = caret.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { x: r.left + 2, y: r.top + 4, text: t.path.split('/').pop(), typing: t.shown < t.text.length }
}
;(function cwLoop() { try { codeWall() } catch (err) { console.error(err) } requestAnimationFrame(cwLoop) })()

// ---------- 🔌 sign-in connectors (Supabase), through Hermes: Connect opens the provider's
// sign-in page; Hermes keeps the token, the canvas only learns who is connected.
const conn = { all: null, busy: new Set() }
async function renderConnectors() {
  const box = autoM.pop?.querySelector('.auto-conn')
  if (!box) return
  if (!conn.all) {
    box.innerHTML = '<small>checking your sign-ins…</small>'
    conn.all = await api('/api/connectors').then(r => r.json()).catch(() => ({}))
    if (!autoM.pop?.contains(box)) return
  }
  box.innerHTML = Object.entries(conn.all).filter(([, c]) => c && !c.error).map(([name, c]) => {
    const state = c.signed_in && c.allowed ? `<span class="ac-ok">✓ connected</span>`
      : c.signingIn || conn.busy.has(name) ? `<span class="ac-wait">waiting for you to approve in the browser…</span>${c.authUrl ? ` <a href="${esc(c.authUrl)}" target="_blank" rel="noopener">open sign-in</a>` : ''}`
      : `<button class="ac-go" data-name="${esc(name)}">🔌 Connect ${esc(c.label)}</button>`
    return `<div class="ac-row"><b>${esc(c.label)}</b>${state}<small>${c.signed_in && c.allowed ? 'Auto makes a free project and its table for you' : 'sign in once; no keys to copy'}</small></div>`
  }).join('')
  for (const b of box.querySelectorAll('.ac-go')) b.onclick = async () => {
    const name = b.dataset.name
    conn.busy.add(name); renderConnectors()
    const res = await api('/api/connectors/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
    const out = await res?.json().catch(() => ({}))
    conn.busy.delete(name)
    if (!res?.ok) { feed(null, `connect: ${out?.error || 'the canvas server is not answering'}`, 'err') }
    else conn.all = { ...conn.all, [name]: { ...conn.all[name], ...out } }
    renderConnectors()
  }
}
function connectorEvent(e) {
  if (!conn.all) return
  const c = conn.all[e.name] || {}
  conn.all[e.name] = { ...c, signingIn: e.state === 'signing-in', authUrl: e.authUrl || c.authUrl, ...(e.state === 'connected' ? { signed_in: true, allowed: true } : {}) }
  if (e.state === 'connected') feed(null, `🔌 ${c.label || e.name} connected through Hermes`)
  if (e.state === 'failed') feed(null, `🔌 ${c.label || e.name} sign-in did not finish`, 'err')
  renderConnectors()
}

// ---------- studio hook: what web/studio.js, web/home.js and web/project.js may read and call.
// Kept to this one block so the canvas and the studio views merge cleanly.
window.swarm = {
  get S() { return S }, get view() { return view }, get viewing() { return viewing }, get liveId() { return liveId }, get files() { return files },
  replay: !!Q.get('replay'), wall: WALL, base: BASE, store, api, esc,
  on: fn => cosmosHooks.add(fn),
  openRun, setView, loadFiles, focusPage, openPlayer,
  // the crew's sound: 'on', 'muted' or 'quiet' (☰ → Sound in the studio)
  sound(m) { if (m && !WALL) setCrewMode(m); return crewMode },
  // a page's picture for its artboard: the resting snapshot, or a small fresh one
  async thumb(id, scale = 0.25) {
    const f = S.frames.find(x => x.id === id)
    if (!f) return null
    if (f.frozen && scale <= 0.25) return f.frozen.img.src
    if (!f.ready || !f.slots.size) return f.frozen?.img.src || null
    return (await snapFrame(f, scale)).image
  },
  // a page's sections for the project canvas's inspector: pick one, change it by hand, open its
  // code, or tell the crew about just that one. Every change is a saved edit event, so it undoes,
  // replays when the file reopens and reaches anyone else looking at the same build.
  layers: {
    // in page order, each with where it sits on the page (0..1 of the page's height) once laid out
    list(page) {
      const f = S.frames.find(x => x.id === page)
      const hgt = f ? Math.max(f.h || 0, f.geo.height || 0) : 0
      return S.order.map(k => S.layers.get(k)).filter(l => l && (l.page === page || l.page === '*')).map(l => {
        const g = f?.geo.slots[l.key]
        return { key: l.key, id: l.id, role: l.role || l.id, shared: l.page === '*', done: l.status === 'done', box: g && hgt ? { top: g.box[1] / hgt, height: g.box[3] / hgt } : null }
      }).sort((a, b) => (a.box?.top ?? 9) - (b.box?.top ?? 9))
    },
    get(key) {
      const l = S.layers.get(key)
      if (!l) return null
      return { key, id: l.id, page: l.page, role: l.role || l.id, done: l.status === 'done', html: l.text, props: sectionProps(l), kids: layerKids(l.text), gens: gensOf(l).map(g => ({ gen: g, src: S.images.get(`${l.key}|${g}`) || null, busy: pics.pending.has(`${l.key}|${g}`) })) }
    },
    get theme() { return S.theme },
    // one finished section: pad, gap, dir, align, bg, hsize or radius (the Design panel's edits)
    edit(key, prop, value) { const l = S.layers.get(key); if (l?.status === 'done') return commitEdit({ kind: 'section', layer: key, prop, value }) },
    // a design token: a colour (--name) or a font (heading / body); it changes every page
    token(kind, name, value) { return kind === 'font' ? commitEdit({ kind: 'font', role: name, value }) : commitEdit({ kind: 'var', name, value }) },
    // its words, in order, and a way to change them
    texts(key) {
      const l = S.layers.get(key)
      if (!l) return []
      const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
      const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), out = []
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg, script, style')) {
        const tag = n.parentElement.tagName.toLowerCase()
        out.push({ i: out.length, text: n.textContent.trim().replace(/\s+/g, ' '), kind: /^h[1-6]$/.test(tag) ? 'Heading' : tag === 'a' || tag === 'button' ? 'Button' : 'Text' })
      }
      return out
    },
    async setText(key, i, value) {
      const l = S.layers.get(key)
      if (l?.status !== 'done') return false
      const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
      const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
      let n = walk.nextNode(), at = 0
      for (; n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg, script, style')) { if (at === i) break; at++ }
      if (!n || n.textContent.trim().replace(/\s+/g, ' ') === value.trim()) return false
      const old = n.textContent
      n.textContent = old.match(/^\s*/)[0] + value.trim() + old.match(/\s*$/)[0]
      return window.swarm.layers.save(key, doc.body.innerHTML.trim(), 'text')
    },
    // the whole section's HTML, from the code editor
    async save(key, html, why = 'code') {
      const l = S.layers.get(key)
      if (!l || html == null || html === l.text) return false
      const step = { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: html, label: `${why} in ${l.role || l.id}` }
      remember(step)
      await restoreLayer(step, html, why)
      return true
    },
    // tell the crew about this section only: its builder rewrites it
    fix(key, text) { return sendComment(text, S.layers.get(key)?.status === 'done' ? key : null) },
    // paint one of its pictures again, from new words
    async paint(key, gen, prompt) {
      const l = S.layers.get(key), run = shownRun()
      if (!l || !run) return false
      const k = `${l.key}|${gen}`
      pics.pending.add(k)
      const res = await api(`/api/runs/${encodeURIComponent(run)}/image`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: l.page, layer: l.id, gen, prompt: prompt && prompt !== gen ? prompt : '' }) }).catch(() => null)
      if (!res?.ok) pics.pending.delete(k)
      return !!res?.ok
    },
    select(key) { S.sel = key && S.layers.has(key) ? key : null; design.last = ''; renderTree() },
    scales: { space: SPACE, sizes: SIZES, fonts: FONTS, radius: ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full', 'theme'] },
    // the values the hand edits step from: vertical padding, gap and heading size as Tailwind steps
    current(key) {
      const l = S.layers.get(key)
      if (!l?.text) return {}
      const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
      const root = doc.body.firstElementChild
      if (!root) return {}
      const cls = el => el?.getAttribute('class') || ''
      const py = tw(cls(root), /^py-(\S+)$/) || tw(cls(root), /^p-(\S+)$/)
      const lay = layoutEl(root)
      const gap = lay && tw(cls(lay), /^gap-(\S+)$/)
      const h = root.querySelector('h1, h2, h3') || [...root.querySelectorAll('[class*="text-"]')].sort((a, b) => sizeOf(b) - sizeOf(a))[0]
      const hs = h && tw(cls(h), SIZE_RE)
      const bg = tw(cls(root), /^bg-\[var\(--([\w-]+)\)\]$/)
      const rad = [root, ...root.querySelectorAll('[class*="rounded"]')].map(cls).join(' ').match(/(?:^|\s)rounded(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[var\(--radius\)\]))?(?=\s|$)/)
      return { py: py?.[1] ?? '0', gap: lay ? gap?.[1] ?? '0' : null, hsize: hs?.[1] || null, bg: bg?.[1] || null, radius: rad ? (rad[1]?.startsWith('[') ? 'theme' : rad[1] || '') : null }
    }
  },
  // start a build from Projects or a project's dock (the second argument, once Auto, is ignored).
  // Without a project (Projects home) it is a new project; with one, `from` is the open version it extends
  submit(text, auto = false, project = null, from = null) {
    els.brief.value = text
    nextRoute = project || from ? { project, from, selected: false } : { fresh: true }
    if (view !== 'canvas') setView('canvas')
    els.form.requestSubmit()
  }
}

// ---------- the hosted studio (docs/specs/13-hosted-studio.md): anyone can try a build in the
// browser as a named guest, with a small crew, a few builds a day and a daily spending cap.
// Everything the hosted server can't do (video, apps, publishing, models) is hidden by body.hosted.
const hosted = BOOT.hosted && (() => {
  const H = BOOT.hosted, ui = window.SwarmUI
  document.body.classList.add('hosted')
  let me = H.guest || null, open = H.open !== false
  const plugin = `<a class="ui-btn ui-btn-outline ui-btn-sm" href="${esc(H.install)}" target="_blank" rel="noopener">Install the plugin</a>`
  // the crew picker offers only what a guest may use
  for (const o of [...els.agentsSel.options]) if (Number(o.value) > H.limits.agents) o.remove()
  els.agentsSel.value = String(H.limits.agents)
  els.brief.maxLength = H.limits.promptChars
  els.brief.placeholder = `Describe a product (up to ${H.limits.promptChars} characters). A crew of ${H.limits.agents} builds its site.`

  const bar = document.createElement('div')
  bar.className = 'guest-bar'
  document.querySelector('.topbar .spacer').after(bar)
  let posted = new Set(), posting = false
  const shown = () => (viewing && viewing !== 'new' ? viewing : S?.run)
  const finished = () => shown() && S?.tEnd && S.frames.length
  function draw() {
    const left = me ? me.left : H.limits.builds
    const can = finished() && !posted.has(shown()) && !posting
    bar.innerHTML = `${me?.name ? `<span class="g-name">${esc(me.name)}</span>` : ''}`
      + `<span class="g-left">${open ? `${left} of ${H.limits.builds} builds left today` : 'Done for today'}</span>`
      + `<button class="ui-btn ${can ? 'ui-btn-default' : 'ui-btn-outline'} ui-btn-sm g-post" ${can ? '' : 'disabled'} aria-label="Post this build to Swarm Feed">${posting ? 'Posting…' : posted.has(shown()) ? 'Posted' : 'Post to Feed'}</button>`
      + plugin
    bar.querySelector('.g-post').onclick = postToFeed
  }
  async function refresh() {
    const st = await api('/api/state').then(r => r.json()).catch(() => null)
    if (st) { me = st.guest || me; open = st.open !== false }
    draw()
  }

  // a name, once: it is the credit on the Feed and on this computer's cookie
  // With the Feed, a guest is the Feed's guest (one name on both): the Feed makes one on the first
  // visit with a generated name ("Comet Otter"), and the guest confirms or changes it here, once.
  const feedApi = (path, opts) => fetch(`/api/feed${path}`, { credentials: 'same-origin', ...opts }).then(r => r.json().then(j => ({ ok: r.ok, ...j }))).catch(() => ({ ok: false }))
  function ready() {
    if (me?.name && (!H.feedIdentity || store.get('guestNamed', false))) return Promise.resolve(true)
    return new Promise(async resolve => {
      let done = false
      const d = ui.dialog({
        kicker: 'Try Swarm Studio', title: 'What should the crew <em>call you</em>?',
        desc: `Guests get ${H.limits.builds} builds a day with a crew of ${H.limits.agents}. Your name goes on anything you post to the Feed.`,
        body: `<form class="ui-field g-form"><label class="ui-label" for="g-name">Guest name</label><input id="g-name" class="ui-input" maxlength="24" autocomplete="nickname" placeholder="e.g. Ada" required><p class="g-err" hidden></p></form>`,
        footer: `<button class="ui-btn ui-btn-default g-go">Start building</button>`,
        onClose: () => { if (!done) resolve(false) }
      })
      const input = d.body.querySelector('input'), err = d.body.querySelector('.g-err')
      setTimeout(() => input.focus(), 30)
      const fail = m => { err.textContent = m || 'That did not work. Try again.'; err.hidden = false }
      if (H.feedIdentity) feedApi('/me').then(j => { if (j.viewer?.name && !input.value) { input.value = j.viewer.name; input.select() } })
      const go = async e => {
        e?.preventDefault()
        const name = input.value.replace(/\s+/g, ' ').trim()
        if (H.feedIdentity) {
          if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u.test(name)) return fail('Use 2 to 24 letters or digits (spaces, - and _ are fine).')
          await feedApi('/me')
          const j = await feedApi('/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
          if (!j.ok) return fail(j.message)
          const st = await api('/api/state?fresh=1').then(r => r.json()).catch(() => null)
          if (!st?.guest) return fail('The studio could not see your guest name. Reload the page and try again.')
          me = st.guest
          store.set('guestNamed', true)
        } else {
          const res = await api('/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
          const j = await res?.json().catch(() => ({}))
          if (!res?.ok) return fail(j?.message)
          me = j.guest
        }
        done = true; d.close('ok'); draw()
        // the event stream opened before the cookie existed: open it again as this guest
        connect()
        await new Promise(r => { es.addEventListener('open', r, { once: true }); setTimeout(r, 2500) })
        resolve(true)
      }
      d.body.querySelector('form').onsubmit = go
      d.footer.querySelector('.g-go').onclick = go
    })
  }

  // a limit, the cap or a feature that needs the plugin: say which, and the way to more
  function refuse(j = {}) {
    if (j.error === 'closed') open = false
    if (j.guest) me = j.guest
    draw()
    ui.dialog({
      kicker: j.error === 'install' ? 'Needs the plugin' : 'Hosted studio',
      title: esc(j.title || 'Not right now'),
      desc: esc(j.message || 'That did not work.'),
      footer: `${plugin}<a class="ui-btn ui-btn-ghost ui-btn-sm" href="${esc(H.feed)}">See the Feed</a>`
    })
  }

  // the Feed takes a poster of at most 2 MB: 640 px wide, the top of the page, as JPEG
  function poster(src) {
    return new Promise((ok, fail) => {
      const img = new Image()
      img.onload = () => {
        const w = 640, k = w / img.naturalWidth, h = Math.min(Math.round(img.naturalHeight * k), 1600)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, img.naturalHeight * k)
        ok(c.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = () => fail(new Error('the poster did not load'))
      img.src = src
    })
  }

  async function postToFeed() {
    if (!finished() || posting) return
    posting = true; draw()
    try {
      // a resting page is frozen into a picture (its frame emptied), so that picture is the poster
      const first = S.frames[0]
      const raw = first?.frozen ? first.frozen.img.src : (await snapFrame(first, 0.5).catch(() => null))?.image
      const shot = raw ? { image: await poster(raw).catch(() => null) } : null
      const run = shown()
      if (!shot?.image) return refuse({ title: 'Could not post', message: 'The canvas could not take a picture of the build. Try again.' })
      // the studio puts the pages online, then the Feed takes the card from this browser, as this guest
      const res = await api(`/api/runs/${encodeURIComponent(run)}/site`, { method: 'POST' })
      const site = await res.json().catch(() => ({}))
      if (!res.ok) return refuse(site)
      if (!H.feedIdentity) return refuse({ title: 'No Feed here', message: `The pages are online at ${site.card.liveUrl}, but this studio is not connected to Swarm Feed.` })
      const j = await feedApi('/builds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...site.card, poster: shot.image }) })
      if (!j.ok) return refuse({ title: 'Could not post', message: j.message || 'The Feed did not take it.' })
      posted.add(run)
      feed(null, `Posted to Swarm Feed: ${j.url}`, 'sys')
      window.open(j.url, '_blank', 'noopener')
    } catch (err) {
      refuse({ title: 'Could not post', message: String(err.message || err) })
    } finally { posting = false; draw() }
  }

  // ?prompt= from the Feed's /studio page fills both prompt boxes
  const given = (Q.get('prompt') || '').slice(0, H.limits.promptChars)
  if (given) {
    els.brief.value = given
    const fill = () => { const i = document.querySelector('.hm-ask input'); if (i && !i.value) i.value = given; return !!i }
    if (!fill()) setTimeout(fill, 600)
  }
  cosmosHooks.add(e => { if (e?.type === 'run:done' || e?.type === 'reset' || e?.type === 'run:start') { if (e.type === 'run:done') refresh(); else draw() } })
  draw()
  if (!open) setTimeout(() => refuse({ error: 'closed', title: 'Done for today', message: H.closedMessage }), 400)
  return { ready, refresh, refuse }
})()
