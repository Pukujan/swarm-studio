// @ts-check
// The canvas's shared ground (the web/canvas.js split, docs/ux/MOTION.md): the page's elements, the
// address, the API, per-viewer storage, the icons, the build state S and the camera. Every canvas area
// imports these; nothing here imports an area. S and replayId are reassigned only through their setters.
/** @type {(s: string) => any} */
export const $ = s => document.querySelector(s)
// Inlined by the server: the API token and the page-frame template.
export const BOOT = window.SWARM || {}
export const FRAME_W = 1280
export const GAP = 260
export const els = {
  viewport: $('#viewport'), world: $('#world'), wires: $('#wires'), cursors: $('#cursors'), toolbar: $('#toolbar'),
  status: $('#status'), camHint: $('#camera-hint'), timer: $('#timer'), plan: $('#plan-stream'), planState: $('#plan-state'),
  theme: $('#theme'), tree: $('#tree'), agents: $('#agents-list'), agentCount: $('#agent-count'), feed: $('#feed'),
  form: $('#brief-form'), brief: $('#brief'), agentsSel: $('#agents'), dock: $('#dock'),
  fileName: $('#file-name'), log: $('#log'), play: $('#play-btn'), player: $('#player'), plFrame: $('#pl-frame'),
  plShell: $('#pl-shell'), plStage: $('#pl-stage'), plPage: $('#pl-page'), plBack: $('#pl-back'), plMotion: $('#pl-motion'),
  dDesign: $('#d-design'), dVars: $('#d-vars'), reviewBtn: $('#review-btn'), videoBtn: $('#video-btn'), exportBtn: $('#export-btn'), replayBtn: $('#replay-btn'), publishBtn: $('#publish-btn'), modelsBtn: $('#models-btn'),
  plTours: $('#pl-tours'), plTourList: $('#pl-tour-list'), playMore: $('#play-more'), playMenu: $('#play-menu'), plTourMenu: $('#pl-tour-menu'), plPersona: $('#pl-persona'), plCursor: $('#pl-cursor'), plThink: $('#pl-think')
}
// what /swarm commands and the swarm_studio tool can ask the open canvas to do; features add themselves
export const commandOps = {}
// ?run=<id> opens a file, ?replay=<id>&speed=N replays it on a timer (no live stream),
// and wall=1 is the compact tile the Swarm Wall (web/wall.html) shows
export const Q = new URLSearchParams(location.search)
// the run being replayed: from the address (?replay=, the Wall and capture scripts) or from ☰ → Replay
export let replayId = Q.get('replay') || ''
export function setReplayId(v) { replayId = v }
export const WALL = Q.get('wall') === '1'
if (WALL) document.documentElement.classList.add('wall')
// the hosted studio lives under a path (/studio/app); the local one at the root
export const BASE = BOOT.base || ''
export const api = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { ...opts.headers, 'x-swarm-token': BOOT.token || '' } })
// undo and redo steps (see undo() below)
export const history = { undo: [], redo: [] }
// Per-viewer UI memory. Storage throws inside the Desktop pane's opaque origin, so it is optional.
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`swarm.${k}`)) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch {} }
}

// Lucide line icons (ISC, lucide.dev; licence in web/brand/LICENSE-lucide.txt), only the ones the studio uses.
// Emoji stay in chat and agent messages; the chrome uses these.
const LUCIDE = {
  "box":"<path d=\"M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z\" /><path d=\"M3.3 7l8.7 5 8.7-5\" /><path d=\"M12 22V12\" />",
  "refresh-cw":"<path d=\"M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8\" /><path d=\"M21 3v5h-5\" /><path d=\"M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16\" /><path d=\"M8 16H3v5\" />",
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
  "maximize-2":"<path d=\"M15 3h6v6\"/><path d=\"m21 3-7 7\"/><path d=\"m3 21 7-7\"/><path d=\"M9 21H3v-6\"/>",
  "minimize-2":"<path d=\"m14 10 7-7\"/><path d=\"M20 10h-6V4\"/><path d=\"m3 21 7-7\"/><path d=\"M4 14h6v6\"/>",
  "square-stop":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1\"/>"
}
export const icon = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
export const ico = name => icon(LUCIDE[name] || '')
// the static chrome in index.html marks its icons <i data-i="name">
for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('i[data-i]'))) { const cls = el.className; el.outerHTML = ico(el.dataset.i).replace('class="ico"', `class="ico${cls ? ` ${cls}` : ''}"`) }
// a button's label lives in its .t span, so changing it keeps the icon
export const setLabel = (btn, v) => { const t = btn.querySelector('.t'); if (t) { if (t.textContent !== v) t.textContent = v } else if (btn.textContent !== v) btn.textContent = v }
export const TOOLS = [
  { id: 'move', label: 'Move', svg: ico('mouse-pointer-2') },
  { id: 'frame', label: 'Frame', svg: ico('frame') },
  { id: 'rect', label: 'Shape', svg: ico('square') },
  { id: 'text', label: 'Text', svg: ico('type') },
  { id: 'image', label: 'Image', svg: ico('image') },
  { id: 'connect', label: 'Connect', svg: ico('spline') },
  { id: 'comment', label: 'Comment', svg: ico('message-square') }
]
export const TOOL = Object.fromEntries(TOOLS.map(t => [t.id, t]))
// The crew (web/crew.js): each agent is a little courier sprite, the same for the same name.
export const Crew = window.SwarmCrew || { color: () => '#F2F2F2', ink: () => '#0b0b0c', avatar: () => '' }
// A cursor's head: a small pointer nib in the agent's colour, with its avatar riding beside it.
export const ARROW = (color, name) => `<svg class="nib" viewBox="0 0 10 10" aria-hidden="true"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill="${color}" stroke="#0b0b0c" stroke-width="1" stroke-linejoin="round"/></svg><span class="arrow">${Crew.avatar(name, 30)}</span>`
// The planner's mark (Commander Hermia), for her messages in Chat
export const HERMIA = `<span class="hermia">${Crew.avatar('Hermia', 18)}</span>`

/** @type {any} the build on the canvas; fresh() makes it anew through setS */
export let S
export function setS(v) { S = v }
// studio hook: web/studio.js and web/project.js listen to every event through window.swarm.on
export const cosmosHooks = new Set()
export const cam = { x: 40, y: 140, s: 0.16, tx: 40, ty: 140, ts: 0.16, auto: true, nextFit: 0 }
