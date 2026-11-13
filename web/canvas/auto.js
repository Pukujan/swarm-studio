// web/canvas.js, split by area (web/canvas/README.md): Auto mode and the Auto show, the code wall, crew radio, the art wall.
import { REVIEWER, painterOf } from '../icons.js'
import { icon, WALL, ico, Q, api, replayId, Crew, HERMIA, els, ARROW, S, cam } from './core.js'
import { shownRun, video, toggleVideo } from './film.js'
import { viewing } from './replay.js'
import { view, setView, appv, appEls, frameUrl } from './rooms.js'
import { esc } from './design.js'
import { closeable, crewMembers } from './start.js'
import { live, toScreen, slotFor } from './deck.js'
import { key } from './events.js'
import { frameTitle } from './marks.js'

// ---------- ⚡ Auto mode
// One prompt, then a timeline of the whole flow pinned over the studio. The
// studio follows along: the canvas while it designs, Video while it cuts, App
// while it builds, so a recording shows each part working.
export const autoM = { pop: null, panel: null, last: null, step: '', min: false }
// minimised or not is remembered per browser (storage may be blocked: then it just starts open)
// folded to its one-line pill unless the person opened it before (spec 12, rule 7)
autoM.min = true
try { autoM.min = localStorage.getItem('swarm.autoMin') !== '0' } catch {}
export function setAutoMin(on, remember = true) {
  autoM.min = on
  if (remember) try { localStorage.setItem('swarm.autoMin', on ? '1' : '0') } catch {}
  renderAutoPanel()
}
export const AUTO_VIEW = { design: 'canvas', review: 'canvas', video: 'video', app: 'app', tools: 'app', games: 'app', shop: 'app', data: 'app', checks: 'app', deploy: 'app', launch: 'app' }
// step states as drawn icons: a ring, a spinning arc, a check, a dash, a cross
export const AUTO_ICON = {
  wait: icon('<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/>'),
  working: icon('<circle cx="12" cy="12" r="8" opacity=".25"/><path d="M12 4a8 8 0 0 1 8 8"/>'),
  done: icon('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.2 9.6"/>'),
  skipped: icon('<path d="M7 12h10"/>'),
  failed: icon('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>')
}

// Auto mode's dialog (Make / Pro and the packs) is gone from the studio; the engine, /api/auto and the
// pack files stay, and a run started elsewhere still reports here.

export function autoEvent(e, live = Date.now() - (e.t || 0) < 15000) {
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
    if (prev?.state === 'working' && e.state === 'done' && e.url && prev.run === e.run) setTimeout(() => showSummary(autoM.last), ds.el ? 9000 : 1200)
  }
  renderAutoPanel()
}

export function renderAutoPanel() {
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
    : `<div class="ap-head"><b>${ico('zap')}Auto</b><span class="ap-time">${secs(total || 0)}</span><button class="ap-close" aria-label="Hide">${ico('x')}</button><button class="ap-min" aria-label="Minimise">${ico('minus')}</button></div>
    <div class="ap-meter"><i style="width:${(doneN / e.steps.length * 100).toFixed(1)}%"></i></div>
    <div class="ap-prompt">${esc(e.prompt || '')}</div>
    <ol>${e.steps.map(s => { const note = live(s), long = note && note.length > 90; return `<li class="${s.state}${autoM.open.has(s.id) ? ' open' : ''}" data-step="${esc(s.id)}"><i>${AUTO_ICON[s.state] || AUTO_ICON.wait}</i><span>${esc(s.label)}${note ? `<small>${linkify(note)}</small>${long ? `<button class="ap-more">${autoM.open.has(s.id) ? 'Less' : 'More'}</button>` : ''}` : ''}</span><em>${s.state === 'working' && s.t0 ? secs(Date.now() - s.t0) : s.ms ? secs(s.ms) : ''}</em></li>` }).join('')}</ol>
    ${e.url ? `<a class="ap-live" href="${esc(e.url)}" target="_blank" rel="noopener">${ico('globe')}Open the live app</a>` : e.state === 'failed' && e.message ? `<div class="ap-msg">${esc(e.message)}</div>` : ''}
    ${e.state !== 'working' && e.run ? `<div class="ap-show"><button class="ap-sum">${ico('sparkles')}Summary</button>${launchable(e) ? `<button class="ap-kit">${ico('message-square')}Launch kit</button>` : ''}</div>` : ''}`
  for (const b of p.querySelectorAll('.ap-more')) b.onclick = ev => { ev.stopPropagation(); const id = b.closest('li').dataset.step; autoM.open.has(id) ? autoM.open.delete(id) : autoM.open.add(id); renderAutoPanel() }
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
// something to launch: a live link, or a finished promo video (a design alone is not a launch)
export const launchable = e => !!(e?.url || e?.steps?.some(s => s.id === 'video' && s.state === 'done'))
export const linkify = t => esc(t).replace(/https?:\/\/[^\s<"]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
// the clocks tick between events
setInterval(() => { if (autoM.last?.state === 'working' && autoM.panel && !autoM.panel.hidden) renderAutoPanel() }, 1000)
if (!Q.get('replay')) api('/api/auto').then(r => r.ok ? r.json() : null).then(e => { if (e?.steps && (e.state === 'working' || Date.now() - e.t0 < 3600000)) autoEvent(e, e.state === 'working') }).catch(() => {})

// ---------- the Auto show (spec 07): step cards, the reviewer, the deploy shot, the summary,
// the launch kit and the crew's chatter. All of it only watches: none of it changes a build.
export const Chatter = window.SwarmChatter || null
export const Show = window.SwarmShow || null
// live, or a replay being watched (?replay= or ☰ → Replay): the show plays for both, a reopened file stays quiet
export const showLive = e => live(e) || (!!replayId && viewing === replayId && !WALL)
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const STEP_SHOW = {
  design: ['Designing the', 'site', 'palette'], review: ['Reviewing every', 'page', 'search-check'], app: ['Building the', 'app', 'server'],
  tools: ['Running the', 'tools', 'sliders-horizontal'], games: ['Adding the', 'games', 'gamepad-2'], shop: ['Opening the', 'shop', 'zap'],
  data: ['Wiring the', 'data', 'layers'], checks: ['Checking it', 'works', 'check'], video: ['Cutting the', 'promo', 'clapperboard'],
  deploy: ['Taking it', 'live', 'rocket'], launch: ['Writing the', 'launch kit', 'message-square']
}
export const pill = (name, color = Crew.color(name)) => `<span class="sc-pill" style="--c:${color};--ci:${Crew.ink(color)}">${name === 'Hermia' ? HERMIA : Crew.avatar(name, 22)}<b>${esc(name)}</b></span>`
// who works on a step, as the canvas knows them
export function stepCrew(id) {
  if (id === 'review') return [['Reviewer', 'var(--info)'], ...crewMembers(2)]
  if (id === 'deploy' || id === 'launch') return [['Hermia', 'var(--frame-hi)'], ...crewMembers(id === 'launch' ? 1 : 2)]
  if (AUTO_VIEW[id] === 'app') return wallNames().slice(0, 4)
  return crewMembers(id === 'design' ? 5 : 3)
}

// A. Step transitions: a full-width card slides in for 1.2 s (step number, the step in display
// type, its icon and crew, Hermia pointing on), the view changes under it, then
// the card slides away. Under prefers-reduced-motion: no card, the new view fades in.
export function showStep(e, step, change) {
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
export function showLiveTab(e) {
  const cur = e.state === 'working' && e.steps.find(s => s.state === 'working')
  const v = cur && AUTO_VIEW[cur.id]
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('live', !!v && b.dataset.view === v)
}

// A2. The reviewer: a cursor in its own colour hovers over the page being checked and draws a
// dashed box round each section it flags; a fix landing flashes the box green and clears it.
export const rv = { el: null, page: null, flags: new Map(), x: 0, y: 0, tx: 0, ty: 0, hop: 0, raf: 0, quietAt: 0 }
export function rvEnsure() {
  if (rv.el) return rv.el
  rv.el = document.createElement('div')
  rv.el.className = 'cursor rv-cursor'
  rv.el.innerHTML = `${ARROW('var(--info)', 'Reviewer')}<div class="tag">${ico('search-check')}<span>Reviewer</span><em class="doing"></em></div>`
  els.cursors.append(rv.el)
  return rv.el
}
// a point on a section of the page under review, in world space
export function rvSpot(page, layerKey) {
  const f = S.frames.find(fr => fr.id === page)
  if (!f) return null
  const keys = layerKey ? [layerKey] : Object.keys(f.geo.slots || {})
  if (!keys.length) return { x: f.x + 640, y: 300 }
  const k = keys[rv.hop++ % keys.length], g = f.geo.slots[k]
  if (!g) return { x: f.x + 640, y: 300 }
  const [left, top, width, height] = g.box
  return { x: f.x + left + width * (0.25 + ((rv.hop * 37) % 50) / 100), y: top + Math.min(height, 600) * 0.45 }
}
export function rvTick() {
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
export function rvMove(page, layerKey, doing) {
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
export function rvFlag(e) {
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
export function rvFixed(e) {
  const k = key(e.page, e.layer), box = rv.flags.get(k)
  if (!box) return
  rv.flags.delete(k)
  box.classList.add('fixed')
  setTimeout(() => box.remove(), 1100)
  if (!rv.flags.size && !rv.page) rv.quietAt = Date.now()
}
export function reviewShow(e) {
  if (!showLive(e) || WALL) return
  if (e.type === 'review:start') rvMove(e.page, null, `checking ${frameTitle(e.page)}`)
  else if (e.type === 'review:issue') rvFlag(e)
  else if (e.type === 'review:done') { clearInterval(rv.wander); if (rv.page === e.page) { rv.page = null; rv.quietAt = Date.now() + 1500 } if (rv.el) rv.el.querySelector('.doing').textContent = e.issues?.length ? `${e.issues.length} to fix` : 'looks good' }
  else if (e.type === 'layer:done' && e.fixed) rvFixed(e)
}

// A3. The deploy shot. While Vercel builds: a terminal tile with the build log and an edge
// graphic that pulses at each stage. When it is ready: the live site in a laptop and a phone,
// with the crew's cursors clicking around it.
export const ds = { el: null, run: null, mode: '', lines: [], stage: '', url: '', timers: [], games: false }
export const DS_STAGES = [['upload', 'Upload'], ['building', 'Build'], ['ready', 'Ready']]
export function dsClear() { ds.timers.forEach(clearTimeout); ds.timers = [] }
export function dsClose() { dsClear(); ds.el?.remove(); Object.assign(ds, { el: null, run: null, mode: '', lines: [], stage: '', url: '' }) }
export function dsOpen(run) {
  if (ds.el && ds.run === run) return
  dsClose()
  ds.run = run
  ds.el = document.createElement('div')
  ds.el.className = 'deployshot'
  appEls.view.append(ds.el) // the whole App view, over the steps column and the preview
  if (cw.el) cw.el.hidden = true
  dsBuild()
}
export function dsBuild() {
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
export function dsLog(lines) {
  for (const l of [].concat(lines)) if (l && ds.lines.at(-1) !== l) ds.lines.push(String(l).slice(0, 200))
  ds.lines = ds.lines.slice(-60)
  dsRender()
}
export function dsRender() {
  if (!ds.el || ds.mode !== 'build') return
  const pre = ds.el.querySelector('.ds-log')
  pre.innerHTML = ds.lines.map(l => `<span>${esc(l)}</span>`).join('\n') + '<i class="ds-caret"></i>'
  pre.scrollTop = pre.scrollHeight
  const at = DS_STAGES.findIndex(([id]) => id === ds.stage)
  ds.el.querySelectorAll('.ds-stages li').forEach((li, i) => { li.className = i < at ? 'done' : i === at ? 'on' : '' })
  ds.el.querySelector('.ds-globe').dataset.stage = ds.stage || 'upload'
}
export function dsStage(stage) {
  const s = /ready/.test(stage) ? 'ready' : /build/.test(stage) ? 'building' : 'upload'
  if (s !== ds.stage) { ds.stage = s; ds.el?.querySelector('.ds-globe')?.classList.remove('pulse'); void ds.el?.offsetWidth; ds.el?.querySelector('.ds-globe')?.classList.add('pulse') }
  dsRender()
}
// the shot's crew, with a pill each
export const dsCursor = (name, color) => `<div class="ds-cur" data-name="${esc(name)}">${ARROW(color, name)}<div class="tag" style="background:${color};color:${Crew.ink(color)}"><span>${esc(name)}</span><em class="doing"></em></div></div>`
export function dsLive(url) {
  if (!ds.el || ds.mode === 'live') return
  dsClear()
  ds.mode = 'live'; ds.url = url; ds.stage = 'ready'
  const crew3 = crewMembers(3)
  ds.el.className = 'deployshot live'
  ds.el.innerHTML = `<div class="ds-head"><b class="pop-title">It's <em>live</em></b><span class="ds-sub">the crew is trying it</span><button class="ds-x" aria-label="Close">${ico('x')}</button></div>
    <div class="ds-stage"><div class="ds-laptop"><div class="ds-lid"><div class="ds-bar"><span class="ds-dots"><i></i><i></i><i></i></span><span class="ds-url">${esc(url)}</span><button class="ds-copy" aria-label="Copy the link">Copy</button><a class="ds-open" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open it in a new tab">${ico('external-link')}</a></div>
      <div class="ds-screen"><div class="ds-scroll"><iframe aria-label="The live site" src="${esc(url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms"></iframe></div><i class="ds-click"></i></div></div><div class="ds-base"></div></div>
    <div class="ds-phone"><div class="ds-screen"><div class="ds-scroll"><iframe aria-label="The live site on a phone" src="${esc(url)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms"></iframe></div><i class="ds-click"></i></div></div>
    <div class="ds-curs">${crew3.map(([n, c]) => dsCursor(n, c)).join('')}</div></div>`
  ds.el.querySelector('.ds-x').onclick = dsClose
  ds.el.querySelector('.ds-copy').onclick = ev => { navigator.clipboard?.writeText(url).then(() => { ev.target.textContent = 'Copied' }, () => { ev.target.textContent = 'Copy failed' }) }
  dsFit()
  Chatter?.cheer(crewMembers(8).map(c => c[0]))
  ds.timers.push(setTimeout(() => Chatter?.line('Hermia', 'Launch!'), 1900))
  if (!reduced()) dsScript(crew3.map(c => c[0]))
}
// the laptop shows a 1280-wide page and the phone a 390-wide one, both scaled to their screens
export function dsFit() {
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
export function dsScript(names) {
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
export function deployShow(e) {
  // a deploy's stages and Vercel's build log (saved with the run), while the shot is open
  if (!ds.el || e.run !== ds.run) return
  if (e.type === 'app:stage' && /^deploy:/.test(e.stage || '')) {
    dsStage(e.stage)
    dsLog([...(e.log ? [] : [`› ${e.stage.replace(/^deploy:\s*/, '')}`]), ...(e.log || [])])
  } else if (e.type === 'app:deployed' && e.url) { dsStage('ready'); dsLog(`✓ ready: ${e.url}`); setTimeout(() => dsLive(e.url), 700) }
}

// A4. The final screen: the time and the time per step, the counts, the live link and its QR code.
export async function showSummary(e) {
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
    <div class="ss-actions">${url && games ? `<a class="primary ss-play" href="${esc(url.replace(/\/?$/, '/'))}play" target="_blank" rel="noopener">${ico('gamepad-2')}Play the game</a>` : ''}${url ? `<a class="ss-open" href="${esc(url)}" target="_blank" rel="noopener">${ico('globe')}Open the site</a>` : ''}${launchable({ ...e, url }) ? `<button class="ss-launch">${ico('message-square')}Open the launch kit</button>` : ''}</div></div>`
  document.body.append(el)
  const close = () => el.remove()
  el.querySelector('.ss-x').onclick = close
  closeable(el.querySelector('.ss-card'), close)
  el.onclick = ev => { if (ev.target === el) close() }
  el.querySelector('.ss-copy')?.addEventListener('click', ev => navigator.clipboard?.writeText(url).then(() => { ev.target.textContent = 'Copied' }, () => {}))
  el.querySelector('.ss-launch')?.addEventListener('click', () => { close(); openLaunch(e.run) })
}

// C. The launch kit: a card per network with Post / Edit / Skip. Post opens the network's own
// share page, prefilled; the person presses Post there. Discord, Slack and Telegram go through
// Hermes's gateway, and only after a confirm box with the exact text, channel and attachments.
// Nothing is ever sent by itself.
export const NET_ICON = { x: '𝕏', linkedin: 'in', threads: '@', bluesky: '🦋', instagram: '◎', tiktok: '♪', discord: '◆', slack: '#', telegram: '➤' }
export async function openLaunch(run) {
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
  if (!kit) { el.querySelector('.lk-wait').textContent = (res && (await res.json().catch(() => ({}))).error) || 'The launch kit could not be written.'; return }
  const gw = (await api('/api/gateway').then(r => r.json()).catch(() => ({}))).platforms || {}
  renderLaunch(el, run, kit, gw)
}
export function renderLaunch(el, run, kit, gw) {
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
export function launchCard(p, gw) {
  const texts = p.thread || [p.text]
  const gwOn = p.how === 'gateway' && gw[p.network]
  const postLabel = p.how === 'intent' ? (p.thread ? `Post 1/${texts.length}` : 'Post') : p.how === 'download' ? 'Download video + copy caption' : gwOn ? 'Post…' : `Connect ${p.label} in Hermes to send`
  return `<div class="lk-card" data-id="${esc(p.id)}" data-status="${esc(p.status)}"><div class="lk-head"><span class="lk-net">${NET_ICON[p.network] || '•'}</span><b>${esc(p.label)}</b>${p.thread ? `<small>thread of ${texts.length}</small>` : ''}<em class="lk-status">${p.status === 'ready' ? '' : esc(p.status)}</em></div>
    ${texts.map((t, i) => `<label class="lk-text">${p.thread ? `<span class="lk-n">${i + 1}</span>` : ''}<textarea readonly rows="${Math.min(8, Math.max(2, Math.ceil(t.length / 46)))}" aria-label="${esc(p.label)} post${p.thread ? ` ${i + 1}` : ''}">${esc(t)}</textarea><small class="lk-count"></small></label>`).join('')}
    <div class="lk-btns"><button class="primary lk-post"${p.how === 'gateway' && !gwOn ? ' disabled' : ''}>${esc(postLabel)}</button>${p.how === 'gateway' ? '<button class="lk-copy">Copy</button>' : ''}<button class="lk-edit">Edit</button><button class="lk-skip">Skip</button></div></div>`
}
// the one way a post leaves through Hermes: this box, with the exact text, the channel and the attachments, then Send
export function launchConfirm(run, p, text, targets, kit, done) {
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
export const chat = { failed: new Set(), said: new Set() }
export function chatterHear(e) {
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
export const CREW_KEY = 'swarm.crew'
export const CREW_MODES = ['on', 'muted', 'quiet']
export const CREW_WORD = { on: 'Crew', muted: 'Muted', quiet: 'Quiet' }
export const crewBtn = document.getElementById('crew-mute')
export let crewMode = 'muted'
export let soundPop = null // the crew button's popover, while it is open
export function setCrewMode(m, { save = true, chatter = true } = {}) {
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
export const cycleCrew = () => {
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
export function renderSoundPop() {
  if (!soundPop || soundPop.closed) return
  for (const b of soundPop.el.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === crewMode))
  const vol = soundPop.el.querySelector('.ui-slider')
  if (vol && Chatter) { vol.value = String(Math.round((Chatter.volume ?? 0.6) * 100)); window.SwarmUI?.slider(vol) }
}
export function openSoundPop(e) {
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
// writes type out in tiles, one agent per tile with its cursor on the caret. The last
// tile is the asset pane, always: the build's pictures turning on a card, one after another.
export const CW_TILES = 4
export const CW_CODE = CW_TILES - 1 // the one code tile, in both modes; the other three are pictures
export const CW_TURN = 2600 // ms per asset
// ---------- crew radio: the app engine's lead (spoken by Hermia) gives orders, helpers answer
// and work. On the code wall: Hermia's strip on top with a dotted line to the helper she is
// talking to, each helper's reply as a bubble on its cursor, and what it is doing right now
// (crew:act, live only) as its name-pill status.
export const radio = { run: null, lead: null, reason: null, acts: new Map(), says: new Map(), order: [], feed: [] }
// Hermia's history for her dock: her thinking fragments join into one line while fresh
// the engine's own boilerplate (file-size notes, where the chat backup is) is not her talking
export const DOCK_NOISE = /^(Note: This file may be large|If you need to retrieve earlier parts of the conversation)/
export function dockLine(x) {
  if (DOCK_NOISE.test(String(x.text || '').trim())) return
  const last = radio.feed.at(-1)
  if (x.kind === 'reason' && last?.kind === 'reason' && x.t - last.t < 20000 && last.text.length < 1400) { last.text += ` ${x.text}`; last.t = x.t; last.n = (last.n || 1) + 1; return }
  radio.feed.push(x)
  if (radio.feed.length > 60) radio.feed.shift()
}
export function radioEvent(e) {
  const run = e.run || appv.run || shownRun()
  if (radio.run !== run) Object.assign(radio, { run, lead: null, reason: null, acts: new Map(), says: new Map(), order: [], feed: [] })
  const t = e.t || Date.now()
  const meet = n => { if (n && n !== 'Hermia' && !radio.order.includes(n)) radio.order.push(n) }
  // the lead's reasoning (kind 'reason', "💭 …"): a dimmer thought line in her strip, never an order
  if (e.type === 'crew:lead' && e.kind === 'reason') { radio.reason = { text: String(e.text || '').replace(/^💭\s*/u, ''), full: e.full || '', t }; dockLine({ kind: 'reason', text: radio.reason.text, t }) }
  else if (e.type === 'crew:lead') { radio.lead = { text: e.text, to: e.to, kind: e.kind || 'think', t }; meet(e.to); dockLine({ ...radio.lead }) }
  else if (e.type === 'crew:act') { radio.acts.set(e.name, { text: e.text, t }); meet(e.name) }
  else if (e.type === 'agent:say') { radio.says.set(e.name, { text: e.text, kind: e.kind, t }); meet(e.name) }
}
export const radioOn = () => radio.run && radio.run === appv.run
// the wall's crew: the helpers the radio has heard from first, then the build's agents
export function wallNames() {
  if (cw.mode === 'art') return [...ART_TILES.map(n => [n, Crew.color(n)]), ...crewMembers(4).filter(([n]) => !ART_TILES.includes(n))].slice(0, CW_TILES)
  const heard = radioOn() ? radio.order.slice(0, CW_TILES).map(n => [n, Crew.color(n)]) : []
  return [...heard, ...crewMembers(CW_TILES + heard.length).filter(([n]) => !heard.some(h => h[0] === n))].slice(0, CW_TILES)
}
export const heardIn = (x, ms) => x && Date.now() - x.t < ms
export const cw = { el: null, run: null, seen: 0, queue: [], tiles: [], big: -1, hide: false, shown: false, thinking: false, planKey: '', assets: null, assetsAt: 0, av: [] }
export const CW_FRESH = { assets: null, assetsAt: 0, av: [], mode: '', reads: null, readAt: 0 }
// ---------- the art wall: while a game's art is painted, the wall is mostly pictures. Three
// painters (the server's PAINTERS) each get a tile with the picture they are on: painting,
// cut out, checked, sent back, done. The last tile stays code. When the code starts, the
// wall turns back to three code tiles and the asset pane.
export const ART_TILES = ['Kiki', 'Juno', 'Tofu']
export const ART_STATE = { painting: 'painting', cutting: 'cutting', checking: 'checking', 'sent back': 'again', done: 'done', failed: 'failed' }
export const paintv = { run: null, slots: [] }
export function artEvent(e) {
  if (paintv.run !== e.run) Object.assign(paintv, { run: e.run, slots: [] })
  const prev = paintv.slots[e.slot]
  paintv.slots[e.slot] = { who: e.who, id: e.id, what: e.what, state: e.state, src: e.src || (prev?.id === e.id ? prev.src : ''), problems: e.problems || [], t: e.t || Date.now() }
}
// art time: the build said it is painting, and no code stage or turn has started since
export function artPhase(steps) {
  const at = steps.findLastIndex(s => /^painting the game's art/.test(s.text || ''))
  if (at < 0) return null
  const after = steps.slice(at + 1)
  if (after.some(s => s.kind === 'turn' || s.kind === 'write' || /^stage \d+ of/.test(s.text || ''))) return null
  const total = Number(/(\d+) pictures/.exec(steps[at].text)?.[1]) || 0
  const kept = Number(/using (\d+) pictures painted before/.exec(after.find(s => /^using \d+ pictures/.test(s.text || ''))?.text || '')?.[1]) || 0
  return { total, painted: kept + after.filter(s => /^painted the /.test(s.text || '')).length, failed: after.filter(s => s.ok === false).length }
}
export const clock = ms => { const t = Math.max(0, Math.round(ms / 1000)); return t >= 60 ? `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s` : `${t}s` }
export const kTokens = n => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
// Between batches the engine is thinking (its "next step" line): nothing is written for a
// minute or more, so the wall says who is planning, for how long, and with how much context.
export function cwPlan(steps) {
  const last = steps.findLast(s => s.kind !== 'tokens' && s.kind !== 'ask')
  if (!(last ? last.kind === 'think' : appv.stage === 'next step')) return null
  const think = steps.findLast(s => s.kind === 'think')
  const write = steps.findLast(s => s.kind === 'write')
  const turn = steps.findLast(s => s.kind === 'turn')?.turn || 1
  const files = [...new Set(steps.filter(s => s.kind === 'write').map(s => s.text).reverse())].slice(0, 4)
  return { since: write?.t || think?.t || cw.planSince || Date.now(), tokens: think?.tokens || 0, turn, files }
}
export function cwHighlight(text) {
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

export function cwZoom(i) {
  cw.big = cw.big === i ? -1 : i
  const g = cw.el?.querySelector('.cw-grid')
  if (g) cwZoomShow(g)
}
export function cwZoomShow(g) {
  g.classList.toggle('zoom', cw.big >= 0)
  ;[...g.children].forEach((d, i) => { d.classList.toggle('big', i === cw.big); d.setAttribute('aria-expanded', String(i === cw.big)) })
}
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || cw.big < 0 || !cw.el || cw.el.hidden) return
  e.stopImmediatePropagation()
  cwZoom(cw.big)
}, true)
