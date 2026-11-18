// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the animation loop and keyboard and pointer input.
import { routeMessage } from '../route.js'
import { modeSend, mountChatMode, MODE_LINE } from '../chatmode.js'
import { mountAgentsChip } from '../composer.js'
import { githubDoor, ownerSay } from '../github.js'
import { zoomToSection } from './zoom.js'
import { cam, S, els, setLabel, FRAME_W, commandOps, api, $, BOOT, buildOf } from './core.js'
import { syncSlots, bboxActive, fit, startGesture, gestureStep, toScreen, dockCell, agentTarget, DOCK, runBanter, drawWires, doing, setAuto, focusPage, slotFor } from './deck.js'
import { lite, litePass, frameBusy, togglePanel, toggleModels } from './settings.js'
import { renderAgents, setText, renderToolbar, treeSel, renderTree, renderStatus, botMsg, feed, hermesReady, hermesSays, resumeRun, againRun, failSay } from './panels.js'
import { renderDesign, drawSelBox, exp, design, selectAt, exportRunNow, undo, redo, esc } from './design.js'
import { drawComment, review, cmt, reviewRun, sendLayers } from './marks.js'
import { paintReplay, viewing, files, loadFiles, fileMatch, fileInfo, saveMeta, traceView, fileInto, rec, replaySay } from './replay.js'
import { progressLine, buildProgress, buildLive } from '../replaytalk.js'
import { pub, liveUrl, publishNow } from './publish.js'
import { shownRun, video, VIDEO_STYLES, makeVideo, showRun, runNow } from './film.js'
import { appv, appAsk, setView, buildApp, openGame, openCastOnly, sliceGo, view, stageSay, mediaBlock, mapSay, mapShow, intakeSay } from './rooms.js'
import { tour, stopTour, closePlayer, watchVisitor, setMotion, openPlayer } from './player.js'
import { talk, talkSay, readTalk, talkStart, talkAsk, openAsk } from './talk.js'
import { links, refLines } from './base.js'
import { carryStep, carryMoving } from './carry.js'
import { hosted } from './hosted.js'
import { isResearchStop, stopText, stopItems, againBody, takeOut } from '../researchstop.js'
import { readAsk, askRoute, partButtons } from '../triage.js'

// ---------- loop

let lastPanels = 0
// The crew's cursors don't need the screen's 60-120 Hz: 24 fps while a build runs (20 with a big
// crew), full rate only while the camera itself moves, so a drag or zoom stays smooth. Behind the
// Overview or Projects this canvas is hidden: 10 fps keeps its pages and crew current (spec 36).
const loopAt = { last: 0, dt: 16.7 }
const behind = () => document.body.classList.contains('cosmos-project') || document.body.classList.contains('cosmos-home')
export function frameLoop(now) {
  const moving = Math.abs(cam.ts - cam.s) > 1e-3 || Math.abs(cam.tx - cam.x) > 1 || Math.abs(cam.ty - cam.y) > 1
  const hid = behind(), fps = hid ? 10 : moving ? 120 : S.agents.size > 8 ? 20 : 24
  if (now - loopAt.last < 1000 / fps - 2) {
    // the pages still take their sections at 24 fps: the Overview photographs them
    if (hid && now - (loopAt.sync || 0) > 40) { loopAt.sync = now; syncSlots(now) }
    return requestAnimationFrame(frameLoop)
  }
  loopAt.dt = Math.min(100, now - (loopAt.last || now - 16.7))
  loopAt.last = loopAt.sync = now
  syncSlots(now)

  if (cam.auto && now > cam.nextFit) {
    const b = bboxActive()
    if (b) fit(b)
    cam.nextFit = now + 700
  }
  // the same glide at any frame rate: the per-60fps factor, raised to the frames that passed
  const ease = k0 => 1 - Math.pow(1 - k0, loopAt.dt / 16.7)
  const k = ease(cam.auto ? 0.06 : 0.25)
  cam.s += (cam.ts - cam.s) * k
  cam.x += (cam.tx - cam.x) * k
  cam.y += (cam.ty - cam.y) * k
  const camKey = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.s.toFixed(4)})`
  if (camKey !== cam.key) {
    cam.key = camKey
    // While the camera moves the world keeps the pixels it has (will-change holds the raster
    // scale), so a zoom or pan slides finished tiles instead of redrawing every page at each
    // step. The hint comes off when the camera rests and the pages redraw sharp, once. It is
    // never left on: a standing will-change pinned every page in GPU memory (canvas.css).
    cam.movedAt = now
    if (!cam.moving) { cam.moving = true; els.world.classList.add('moving') }
    els.world.style.transform = camKey
    const g = 60 * cam.s
    els.viewport.style.backgroundSize = `${g}px ${g}px`
    els.viewport.style.backgroundPosition = `${cam.x}px ${cam.y}px`
  }

  if (cam.moving && now - cam.movedAt > 260) { cam.moving = false; els.world.classList.remove('moving') }

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
      a.sx += (c.x - a.sx) * ease(0.12)
      a.sy += (c.y - a.sy) * ease(0.12)
    } else {
      if (a.docked) { a.wx = (a.sx - cam.x) / cam.s; a.wy = (a.sy - cam.y) / cam.s; a.docked = false }
      const t = agentTarget(a, now)
      if (t) {
        a.wx += (t.x - a.wx) * ease(0.22)
        a.wy += (t.y - a.wy) * ease(0.22)
      }
      const p = toScreen(a.wx, a.wy)
      a.sx = p.x
      a.sy = p.y
    }
    // a cursor far off screen keeps its place but skips its redraw
    const off = a.sx < -200 || a.sy < -200 || a.sx > innerWidth + 200 || a.sy > innerHeight + 200
    if (off && a.off) continue
    a.off = off
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
  carryStep(now)

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
    els.play.disabled = els.playMore.disabled = !S.frames.length
    // with no reviewer model yet, Review opens Models to pick one instead of sitting greyed out
    // (a replay only plays: nothing that acts on the build is offered while it does)
    els.reviewBtn.disabled = review.busy || !S.done || rec.on
    setLabel(els.reviewBtn, review.busy ? 'Reviewing…' : 'Review')
    els.exportBtn.disabled = !S.done || exp.busy || rec.on
    paintReplay()
    const pubbing = pub.run === shownRun() && pub.state === 'working'
    const deploying = appv.deploying && appv.run === shownRun()
    // a website build with no section yet still opens the menu, where Website says why it can not go out
    els.publishBtn.disabled = (!S.done && !pubbing && !buildOf()) || deploying || rec.on
    setLabel(els.publishBtn, pubbing || deploying ? 'Publishing…' : liveUrl() ? 'Live' : 'Publish')
    const mine = video.run === shownRun()
    els.videoBtn.disabled = (!S.done && !(mine && video.src)) || rec.on
    setLabel(els.videoBtn, mine && video.busy ? `Video ${video.pct ? `${video.pct | 0}%` : 'writing…'}` : 'Video')
    if (S.progress) {
      const done = [...S.layers.values()].filter(l => l.status === 'done').length
      // a running website build counts its own work, from the server's state of it (a next version that has
      // planned nothing says it is planning, not "0 agents building · 9/9" of the sections it was handed)
      const b = rec.on ? null : buildOf(), own = buildLive(b) ? b : null
      setText(S.progress.querySelector('.txt'), own ? buildProgress(own, { plan: S.planText, working, pages: S.frames.length }) : progressLine({ replay: rec.on, plan: S.planText, working, done, total: S.layers.size, pages: S.frames.length }))
      if (!S.progress.querySelector('.pbar')) S.progress.insertAdjacentHTML('beforeend', '<span class="pbar"><i></i></span>')
      S.progress.querySelector('.pbar i').style.width = `${own ? (own.planned ? (own.done / own.planned * 100).toFixed(1) : 4) : S.layers.size ? (done / S.layers.size * 100).toFixed(1) : 4}%`
    }
    if (S.t0 && !(viewing && !S.tEnd)) setText(els.timer, `${(((S.tEnd || Date.now()) - S.t0) / 1000).toFixed(1)}s`)
  }
  // nothing moving (camera settled, no cursor at work, no build running): a few frames a second
  // is enough; any input wakes it at once (wakeLoops)
  const still = Math.abs(cam.ts - cam.s) < 1e-4 && Math.abs(cam.tx - cam.x) < 0.2 && Math.abs(cam.ty - cam.y) < 0.2 &&
    !S.frames.some(frameBusy) && !carryMoving() && ![...S.agents.values()].some(a => a.act || a.queued || now < (a.moving || 0) || now < (a.sayUntil || 0))
  nextFrame(frameLoop, still)
}

// Per-frame loops run at the screen's rate only while something moves; at rest they tick a few
// times a second, so a finished canvas stops costing a full 60 fps of DOM work.
const sleepers = new Map()
export function nextFrame(fn, idle, ms = 200) {
  if (!idle) return requestAnimationFrame(fn)
  sleepers.set(fn, setTimeout(() => { sleepers.delete(fn); requestAnimationFrame(fn) }, ms))
}
function wakeLoops() {
  for (const [fn, t] of sleepers) { clearTimeout(t); sleepers.delete(fn); requestAnimationFrame(fn) }
}
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, wakeLoops, { capture: true, passive: true })

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

els.viewport.addEventListener('dblclick', e => zoomToSection(e, { slotFor, setAuto }) || setAuto(true))
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
  // @ts-ignore
  if (e.key === 'v' && !els.player.hidden && !e.target.closest('input, select, textarea')) return watchVisitor()
  // @ts-ignore
  if (e.key === 'm' && !els.player.hidden && !e.target.closest('input, select, textarea')) return setMotion()
  // @ts-ignore
  if (e.target.closest('input, select, textarea')) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  // the Design panel belongs to the Canvas room; a project has its own Layers inspector
  if (e.key === 'd') return document.body.classList.contains('cosmos-project') || document.body.classList.contains('cosmos-home') ? undefined : togglePanel('design')
  // the player plays the open build, so not over Projects or a plan, where no build shows
  if (e.key === 'p' && S.frames.length && !/\bcosmos-(home|plan|brand)\b/.test(document.body.className)) return els.player.hidden ? openPlayer() : closePlayer()
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
  // the modes say here what their menu says (web/chatmode.js MODE_LINE)
  ['ask', '[question]', MODE_LINE.ask],
  ['plan', '[idea]', MODE_LINE.plan],
  ['build', '[brief]', MODE_LINE.build],
  ['fix', '[what to change]', `${MODE_LINE.fix} With words: an agent rewrites the selected section, or the page.`],
  ['video', '[prompt]', 'cut a film from a prompt, e.g. a fast trailer, scary but cute'],
  ['app', '[change]', 'the App view: make this design a working app, or change it'],
  ['game', '[idea]', 'make an original browser game: a few questions, then it builds'],
  ['cast', '', 'make characters from pictures, with Meshy'],
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
    case 'cast': return openCastOnly()
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
      return showRun(f.id)
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
export const slashPop = document.createElement('div')
slashPop.className = 'slash-pop'
slashPop.hidden = true
els.form.append(slashPop)
export let slashAt = 0
export function setSlashAt(v) { return (slashAt = v) }
export function slashMatches() {
  const v = els.brief.value
  if (!v.startsWith('/') || /\s/.test(v)) return []
  const q = v.slice(1).toLowerCase()
  return SLASH.filter(([c]) => c.startsWith(q))
}
export function renderSlash() {
  const m = slashMatches()
  slashPop.hidden = !m.length
  if (!m.length) return
  slashAt = Math.min(slashAt, m.length - 1)
  slashPop.innerHTML = m.map(([c, a, d], i) => `<div class="sl${i === slashAt ? ' on' : ''}" data-c="${c}"><b>/${c}</b> <span class="sa">${esc(a)}</span><span class="sd">${esc(d)}</span></div>`).join('')
}
export function pickSlash(c) {
  const takes = SLASH.find(x => x[0] === c)?.[1]
  els.brief.value = `/${c}${takes ? ' ' : ''}`
  slashPop.hidden = true
  els.brief.focus()
  if (!takes) els.form.requestSubmit()
}
// @ts-ignore
slashPop.addEventListener('mousedown', e => { const d = e.target.closest('[data-c]'); if (d) { e.preventDefault(); pickSlash(d.dataset.c) } })
els.brief.addEventListener('input', () => { slashAt = 0; renderSlash() })
els.brief.addEventListener('blur', () => setTimeout(() => (slashPop.hidden = true), 150))

// A message goes to the open build (web/route.js): an edit of the selected section (/fix), or the
// project's next version, which keeps every page and adds what was asked. window.swarm.submit
// says where its words go: Projects home starts a new project, a project's Overview extends it.
export let nextRoute = null
export function setNextRoute(v) { return (nextRoute = v) }
// one message at a time: while one is being read (talk or build?) or its build is starting, another
// Enter does nothing (two Enters made two chats, or two builds, from one message)
let sending = false, queued = null
els.form.addEventListener('submit', async e => {
  e.preventDefault()
  // a send made in code (window.swarm.submit, a Build button) while one is going waits its turn
  if (sending) {
    if (nextRoute) { const r = nextRoute, v = els.brief.value; nextRoute = null; queued = () => { nextRoute = r; els.brief.value = v; els.form.requestSubmit() } }
    return
  }
  sending = true
  try { await sendDock() } finally { sending = false; const q = queued; queued = null; q?.() }
})
// The chat's mode (web/chatmode.js): a typed switch, and Ask, Plan and Fix take the message. Build, and a
// send made in code (a Build button under a brief, a project's dock: nextRoute), go on below as ever.
const modeHelp = {
  box: els.brief, form: els.form, api, botMsg, feed, hermesReady, hermesSays, failSay, appAsk, talkStart, resume: resumeRun, again: againRun, media: mediaBlock, chart: mapShow,
  quiet: () => { slashPop.hidden = true }, next: v => setNextRoute(v), run: () => shownRun(), runNow: () => runNow(), app: () => appv,
  site: () => S.kind !== 'game' && S.frames.length > 0, kind: () => (S.kind === 'game' ? 'game' : 'site'), chat: () => talk.chat,
  // @ts-ignore
  setup: a => window.SwarmSetup?.open(...a)
}
mountChatMode({ select: $('#chat-mode'), button: els.form.querySelector('button[type="submit"]'), talking: () => talk.on, box: els.brief, agents: $('#agents-btn'), built: () => !!shownRun(), off: !!BOOT.hosted })
// @ts-ignore
mountAgentsChip({ select: els.agentsSel, button: $('#agents-btn') })
// A project's source on GitHub (web/github.js): ☰ › GitHub opens its sheet, and the same moves typed here
// ("push to github", "pull from github", "link owner/name", "where is this on github") are answered in the chat.
// The project is the one open in the Studio, else the run on screen (the server finds its project).
// (esc is handed over as a call: web/canvas/design.js runs after this file in the joined page.)
export const github = githubDoor({ api, esc: s => esc(s), botMsg, youSaid: text => feed(null, text, 'you'), run: () => shownRun() || null, project: () => /** @type {any} */ (window).swarmCosmos?.project || shownRun() || null, off: !!BOOT.hosted })
const githubBtn = $('#github-btn')
if (githubBtn) { if (BOOT.hosted) githubBtn.remove(); else githubBtn.onclick = () => github.open() }
// The Overview is the room (web/project.js): the chat is its one place to type (owner, 2026-11-15), so what is
// selected or marked there decides where the words go. null in every other room.
const overview = () => { const c = /** @type {any} */ (window).swarmCosmos; return c?.mode === 'project' ? c.projectView : null }
const ovLines = { you: t => { feed(null, t, 'you') }, bot: t => { botMsg(t) } }
async function sendDock() {
  // a replay comes first (web/replaytalk.js): "stop", "is this building?", "replay"; anything else ends it, then goes on
  if (!nextRoute && await replaySay(els.brief.value)) return
  // marks drawn on the Overview's pages go with the words, or with none
  if (!nextRoute && overview()?.marked && !/^\/[a-z?]/i.test(els.brief.value.trim())) { if (overview().sendMarks(els.brief.value.trim(), ovLines)) els.brief.value = ''; return }
  // a typed GitHub move is never a brief, in any mode and from any dock
  if (!nextRoute?.fresh && github.say(els.brief.value)) { nextRoute?.done?.(null); nextRoute = null; els.brief.value = ''; return }
  // where builds go on GitHub ("publish to <organization>", "where do builds go"): taken only when the name is the
  // person's account or one of their organizations, with or without a project open
  const typed = els.brief.value
  if (!nextRoute?.fresh && !BOOT.hosted && await ownerSay(typed, { api, said: t => feed(null, t, 'you'), answer: t => { botMsg(t) } })) {
    nextRoute?.done?.(null); nextRoute = null
    if (els.brief.value === typed) els.brief.value = ''
    return
  }
  // the Map, asked for in any mode ("show the map", "what's going on?", "show the enemy AI as a state chart"): shown
  // at once, before a mode or the room could take the words as a change for the builder
  if (!nextRoute && !talk.on && mapSay(els.brief.value.trim())) { els.brief.value = ''; return }
  // a typed answer about a brought-in project: run it or not, its install scripts or not (web/intake.js)
  if (!nextRoute?.fresh && intakeSay(els.brief.value)) { nextRoute?.done?.(null); nextRoute = null; els.brief.value = ''; return }
  if (!nextRoute && await modeSend(modeHelp)) return
  const brief = els.brief.value.trim()
  if (!brief) return
  if (/^\/[a-z?]/i.test(brief)) {
    els.brief.value = ''
    slashPop.hidden = true
    nextRoute?.done?.(null); nextRoute = null
    feed(null, `› ${brief}`, '')
    try { await runSlash(brief) } catch (err) { botMsg(`/${brief.slice(1).split(' ')[0]} failed: ${err.message}`) }
    return
  }
  // the chat follows the view: the app's next change, or an idea for the video
  const skip = () => { nextRoute?.done?.(null); nextRoute = null }
  // a talk with the planner before anything is built: the message is part of it
  // while Hermia is answering, the words wait in the box
  if (talk.on) { skip(); if (talk.busy) return; els.brief.value = ''; talkSay(brief); return }
  // "show the crew", "show the art", "show the game", "follow the build": the room's own switch, never the builder's
  if (stageSay(brief)) { skip(); els.brief.value = ''; return }
  // a big game waiting after a slice: the answer goes into the next slice, from any view
  if (appv.state === 'paused' && shownRun() && appv.run === shownRun()) { skip(); els.brief.value = ''; return sliceGo(brief) }
  if (view === 'app' && shownRun()) { skip(); els.brief.value = ''; return appAsk(brief) }
  if (view === 'video' && shownRun()) { skip(); els.brief.value = ''; feed(null, `🎬 ${brief}`, 'you'); return makeVideo({ idea: brief }) }
  // layers dragged into the chat: the words go to just those sections, like a comment on them
  if (links.count('layer') && shownRun() && !nextRoute?.fresh) { skip(); return sendLayers(brief) }
  // a guest names themself before the first build (docs/specs/13-hosted-studio.md)
  if (hosted && !(await hosted.ready())) return skip()
  // typed on the Overview: a fix of the selected section, a picture painted again, the app's change, a talk
  // with the planner, or the route of the project's next version (web/project.js say)
  const ov = !nextRoute && overview()
  if (ov) {
    const took = await ov.say(brief, ovLines)
    if (took === true) { if (els.brief.value.trim() === brief) els.brief.value = ''; return }
    if (took === 'kept') return
    nextRoute = took
  }
  const to = nextRoute || { from: runNow(), selected: !!S.sel }
  nextRoute = null
  // a project's dock has already decided (web/project.js): its open version is what the words
  // extend, whatever run this canvas happens to be showing
  const route = to.fresh ? 'new' : to.route || routeMessage({ text: brief, run: to.from, site: S.kind !== 'game' && S.frames.length > 0, selected: to.selected, hosted: !!hosted })
  // What the words are asking for, read first (web/triage.js, docs/specs/49-read-the-ask.md): a complaint about
  // this build, or several things in a row, is not a fresh brief. The chat says what it understood and offers the
  // parts; nothing runs until the person presses, or types the same words. A product described, and a send made in
  // code (a Build button, a project's dock), go on exactly as they did.
  {
    const read = readAsk(brief, triageCtx())
    // a question is read only where a build would start: with nothing built, the chat's own routing answers it (or
    // offers the talk) as it always did, and over a build it is not turned into a change (that would build on it)
    if (askRoute(read) === 'say' && !(read.kind === 'question' && route === 'new')) {
      els.brief.value = ''
      feed(null, brief, 'you')
      return saidBack(read, brief)
    }
  }
  if (route === 'fix') { els.brief.value = ''; feed(null, `› ${brief}`, 'you'); to.done?.(null); return commandOps.fix({ text: brief }) }
  // "don't build yet, let's talk" or a question for the crew, typed into a project's dock: the
  // planner answers here and nothing is built until the person says build (engine/talkplan.mjs)
  if (route === 'extend' && !hosted && !to.done) {
    const read = await readTalk(brief)
    if (read !== 'build') {
      els.brief.value = ''
      const from = to.from
      const build = (text, chat) => { nextRoute = { from, route: 'extend', selected: false, chat }; els.brief.value = text; els.form.requestSubmit() }
      return read === 'talk' ? talkStart({ text: brief, build, from }) : talkAsk(brief, () => build(brief), () => talkStart({ text: brief, build, from }))
    }
  }
  // no Hermes to answer the model: say so at once, before anything starts "planning"
  if (!hosted) {
    const off = await hermesReady()
    if (off) { to.done?.(null); return void hermesSays(off) }
  }
  setAuto(true)
  const media = links.take('ref')
  const res = await api('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: refLines(brief, media), agents: Number(els.agentsSel.value), ...(to.project ? { project: to.project } : {}), ...(route === 'extend' || route === 'redo' ? { from: to.from } : {}), ...(route === 'redo' ? { redo: true } : {}), ...(to.pictures ? { pictures: to.pictures } : {}), ...(to.template ? { template: to.template } : {}), ...(to.chat ? { chat: to.chat } : {}), ...(to.research || {}) }) }).catch(() => null)
  const j = res ? await res.clone().json().catch(() => ({})) : {}
  // a new website asks first (docs/decisions/0020-ask-before-build.md): the question waits in its chat, or "don't
  // build yet" opens the talk. Not an error, and not busy. Whoever sent it moves to the deck first (web/home.js)
  if (res?.status === 409 && j.error === 'ask') {
    to.done?.({ ask: j.ask, chat: j.chat || null })
    els.brief.value = ''
    await new Promise(r => setTimeout(r, 0))
    if (j.ask === 'talk') {
      const from = to.from || null
      // from the Make box: the talk is in the Design deck's chat, so it opens there (as the question's chat does)
      if (!from) { window.swarmCosmos?.go?.('station', 'canvas'); window.swarmCosmos?.chat?.(true) }
      return void talkStart({ text: brief, blank: !from, from, build: (text, chat) => { setNextRoute(from ? { from, route: 'extend', selected: false, chat } : { fresh: true, chat }); els.brief.value = text; els.form.requestSubmit() } })
    }
    return void openAsk(j.chat)
  }
  // it looked something up first (decision 0025): what it found is shown, with its source, before the crew uses it
  if (res?.status === 409 && isResearchStop(j)) {
    to.done?.({ research: true })
    els.brief.value = ''
    // from the Make box: the stop is in the Design deck's chat, so it opens there (as the question's chat does)
    if (!to.from && !to.project) window.swarmCosmos?.go?.('station', 'canvas')
    return void researchStop(j, kept => { nextRoute = { ...to, done: to.done && (() => {}), research: againBody(j, kept) }; els.brief.value = brief; els.form.requestSubmit() })
  }
  to.done?.(res?.ok ? j.run || null : res?.status === 409 ? { busy: true, run: j.run || null } : null)
  if (!res?.ok) for (const m of media) links.add(m)
  if (res?.ok) { els.brief.value = ''; hosted?.refresh() }
  // the build the person just started is the one the canvas shows
  if (res?.ok && j.run && j.run !== shownRun()) showRun(j.run, { started: true })
  else if (res?.status === 409) feed(null, 'The crew are still on the last change.', 'err')
  else if (res?.status === 503 && j.hermes) hermesSays(j)
  else if (hosted && res) hosted.refuse(j)
  else feed(null, `Couldn't start the run${res ? ` (${res.status})` : ''}. Is the canvas server running?`, 'err')
}

// ---------- reading the ask (web/triage.js, docs/specs/49-read-the-ask.md)
// What "here" is, for readAsk: a game's "the look" is its art and a website's is its theme, and something built is
// what a complaint is about. A send on the Overview (a project's dock) has already been read there (web/project.js
// say), so it is not read again: the dock's own route decides.
/** @type {() => { hasBuild: boolean, kind: string, preview: boolean }} */
function triageCtx() {
  const ov = overview()
  return {
    hasBuild: !!(shownRun() || ov?.board?.kind) && S.frames.length > 0,
    kind: S.kind === 'game' ? 'game' : ov?.board?.app ? 'app' : 'site',
    // a slash command is the chat's own (runSlash), and a project's dock read its own words (web/project.js say)
    preview: /^\/[a-z?]/i.test(els.brief.value.trim()) || !!ov
  }
}

// What the chat understood, in one plain line, with the parts as buttons. The words stay in the chat as the
// person's own; nothing runs until they press, or type the same thing again (anything a button does can be
// typed: each button is just the box's words for its part, sent). A question changes nothing and is answered in
// Ask mode; words this file will not guess about say why, and offer Do it anyway.
/** @param {{ kind: string, parts: { what: string, target?: string }[], heard: string, unclear?: boolean }} read @param {string} brief */
function saidBack(read, brief) {
  // the box's words for a part, sent: anything a button here does can be typed, word for word
  const again = what => { els.brief.value = what; els.form.requestSubmit() }
  const line = read.kind === 'multi' ? read.heard : `I would ${read.parts[0].what.replace(/[.]+$/, '')}. Is that a change to this build, or something new?`
  const item = botMsg(read.unclear ? "I couldn't tell what to change from that. Say which part, or have it built as you said it." : line)
  item.classList.add('ask-read')
  const acts = document.createElement('div')
  acts.className = 'chips'
  const add = (label, run, primary = false) => {
    const b = document.createElement('button')
    b.type = 'button'
    if (primary) b.className = 'primary'
    b.textContent = label
    b.onclick = () => { acts.remove(); run() }
    acts.append(b)
    return b
  }
  if (read.kind === 'multi') {
    for (const p of partButtons(read.parts)) add(p.label, () => again(p.what))
    add('Do all of that', () => again(brief), true)
  } else if (read.kind === 'change') {
    add('Make the change', () => again(brief), true)
  } else {
    add('Do it anyway', () => again(brief))
  }
  add('Never mind', () => {})
  item.append(acts)
  return item
}

// Hermia's line, each page it found with its link and what was taken, ✕ to take one out, and Build with what is left
/** @param {any} j @param {(kept: any[]) => void} build */
function researchStop(j, build) {
  window.swarmCosmos?.chat?.(true)
  const item = botMsg(stopText(j))
  item.classList.add('research-stop')
  let kept = stopItems(j)
  const list = document.createElement('ul')
  list.className = 'found'
  const draw = () => {
    list.replaceChildren(...kept.map(k => {
      const li = document.createElement('li')
      li.innerHTML = `<a target="_blank" rel="noopener noreferrer"></a><span class="took"></span><button class="out" aria-label="Take it out" title="Take it out">✕</button>`
      const a = /** @type {HTMLAnchorElement} */ (li.querySelector('a'))
      const took = /** @type {HTMLElement} */ (li.querySelector('.took'))
      const out = /** @type {HTMLButtonElement} */ (li.querySelector('.out'))
      a.href = k.url
      a.textContent = `${k.title} · ${k.host}`
      took.textContent = k.took
      out.onclick = async () => {
        await takeOut(j, k, (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).catch(() => {})
        kept = kept.filter(x => x !== k)
        draw()
      }
      return li
    }))
    go.textContent = kept.length ? 'Build with these' : 'Build without them'
  }
  const acts = document.createElement('div')
  acts.className = 'chips'
  const go = document.createElement('button')
  go.onclick = () => { acts.remove(); list.querySelectorAll('button').forEach(b => b.remove()); build(kept) }
  acts.append(go)
  draw()
  item.append(list, acts)
  return item
}
