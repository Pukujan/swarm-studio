// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): starting a build, resizable panels, crews, the Publish button, pictures in the Design panel.
import { BASE, BOOT, WALL, S, cosmosHooks, commandOps, els, store, Q, $, Crew, ARROW, TOOL, api } from './core.js'
import { hermesResume, botMsg, resumeRun, renderToolbar, setText, feed, setHermesResume } from './panels.js'
import { hosted } from './hosted.js'
import { fresh } from './base.js'
import { connectorEvent, cwPin } from './dock.js'
import { liveId, viewing, claimed, openRun, replayRun, setLiveId, setViewing } from './replay.js'
import { talk } from './talk.js'
import { on } from './events.js'
import { runNow, shownRun, video } from './film.js'
import { sleep, openPlayer } from './player.js'
import { reviewRun, review, sendComment } from './marks.js'
import { picker, esc, design } from './design.js'
import { models, renderPanels, showTab } from './settings.js'
import { setAuto, pick, crewQuiet } from './deck.js'
import { frameLoop, nextFrame } from './loop.js'
import { game, workedJobs, benchPin, view, appv, appEls, setView, resetApp, deployApp } from './rooms.js'
import { cw, wallNames, CW_TILES, radioOn, radio, heardIn } from './auto.js'
import { pub, pubShow, pubButton, copyText, liveUrl, feedPop, publishMenu } from './publish.js'

// ---------- start

function hermesWait(e) {
  let bar = document.getElementById('hermes-wait')
  // a Hermes attached again: a build it stopped goes on from where it was
  if (e.type === 'hermes:back' && e.attached && hermesResume && !hosted) { const run = hermesResume; setHermesResume(null); botMsg('Hermes is back. Going on with the build.'); resumeRun(run) }
  if (e.type === 'hermes:back') return bar?.remove()
  if (!bar) {
    bar = document.createElement('div')
    bar.id = 'hermes-wait'
    bar.setAttribute('role', 'status')
    document.body.append(bar)
  }
  bar.textContent = e.message || 'Waiting for Hermes'
}

export let es = null
export function connect() {
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
      // model calls wait for Hermes (engine/hermesllm.mjs): the build goes on once it is open
      if (e.type === 'hermes:waiting' || e.type === 'hermes:back') return hermesWait(e)
      if (e.type === 'reset' || e.type === 'run:start') {
        setLiveId(e.run)
        // a talk before building keeps the canvas: a build started elsewhere waits in Projects
        if (talk.on) return
        // Only the build the person asked for, or the one already followed, takes the canvas. Any
        // other (the server's current run replayed on a reconnect, a build from another window) is
        // only news: Projects lists it, and the open build stays as it is.
        // In the studio the navigation machine names the build (spec 34): a canvas holding nothing takes
        // only that one, and the stream itself only tells the machine that a build has begun.
        const nav = window.swarmCosmos?.nav
        if (e.type === 'run:start') nav?.go({ type: 'streamed', run: e.run })
        const followed = !viewing && (S.run === e.run || (!S.run && (!nav || e.run === nav.view.run)))
        if (!followed && e.run !== claimed) {
          if (!viewing && S.run) setViewing(S.run)
          if (e.type === 'run:start') for (const fn of cosmosHooks) try { fn(e) } catch (err) { console.error(err) }
          return
        }
        if (viewing) { setViewing(null); fresh(e.run) }
      }
      // following the live build: an event of another build (a late picture of the build before,
      // an edit made to a saved one in another window) is not this canvas's. A new build's start is:
      // it takes the canvas over (an App's design step, a build started with hermes swarm)
      if (!viewing && e.run && S.run && e.run !== S.run && e.type !== 'run:start' && e.type !== 'reset') return
      // events for the open file (a review or edit while viewing it) apply too
      if (!viewing || (e.run === viewing && e.type !== 'run:start')) on(e)
    } catch (err) {
      console.error(err)
    }
  }
}

// Commands sent from Hermes (/swarm review, the swarm_studio tool).
async function command(c) {
  const studio = window.swarmCosmos
  if (studio?.nav && (c.op === 'open' || c.op === 'play')) {
    // open and play show the build: the machine opens its project unless a room of it is open, and
    // the player plays once its pages are here (never a player hidden behind Projects)
    const run = c.run || runNow() || shownRun()
    if (run && run !== runNow()) await studio.open(run)
    for (let i = 0; i < 40 && c.op === 'play' && !S.frames.length; i++) await sleep(100)
  } else if (c.run && c.run !== shownRun()) { await openRun(c.run); await new Promise(r => setTimeout(r, 4000)) }
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
// the studio loads the build its address names (web/studio.js); without it, ?run= opens that build
if (Q.get('run') && !Q.get('replay')) setTimeout(() => { if (!window.swarmCosmos?.nav) openRun(Q.get('run')) }, 300)
requestAnimationFrame(frameLoop)

// ---------- resizable side panels: drag the inner edge, double-click to reset
for (const [sel, name, min, max, dir] of [['.side', '--side-w', 220, 560, 1], ['.design', '--design-w', 220, 480, -1]]) {
  // @ts-ignore
  const panel = $(sel)
  if (!panel) continue
  let saved = null
  try { saved = localStorage.getItem(`swarm${name}`) } catch {}
  // @ts-ignore
  if (saved) document.body.style.setProperty(name, `${saved}px`)
  const grip = Object.assign(document.createElement('div'), { className: 'resizer' })
  panel.append(grip)
  grip.addEventListener('pointerdown', e => {
    e.preventDefault()
    grip.setPointerCapture(e.pointerId)
    const x0 = e.clientX, w0 = panel.getBoundingClientRect().width
    grip.classList.add('drag'); document.body.classList.add('resizing')
    const move = ev => {
      // @ts-ignore
      const w = Math.round(Math.max(min, Math.min(max, w0 + (ev.clientX - x0) * dir)))
      // @ts-ignore
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
  // @ts-ignore
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
  // Meshy characters being made: one crew member per job, on its tile of the Cast step's bench
  const making = game.el && game.cast?.open && !game.busy ? workedJobs() : []
  if (making.length) {
    const names = making.map((x, i) => x.o.job.worker || ['Pebble', 'Mochi', 'Tofu', 'Bean', 'Puff', 'Sprout'][i % 6])
    return { key: `meshy|${making.map(x => x.r.id).join(',')}`, names: names.map(n => [n, Crew.color(n)]), host: game.el, spots: '.cforge', n: making.length, lines: [''], tool: ['rect'], pin: benchPin, keep: true, cls: 'bench' }
  }
  if (game.el && game.busy) return { key: 'game', host: game.el, spots: '.gbody, .spin, h3, .gspec', n: 3, lines: ['inventing the world', 'naming the hero', 'drafting enemies', 'picking the engine', 'tuning game feel', 'writing win and lose'], tool: ['text', 'comment', 'frame'] }
  if (view === 'app' && appv.state === 'working' && appv.run === shownRun() && cw.el && !cw.el.hidden) {
    return cw.thinking
      ? { key: `app-plan|${wallNames().map(n => n[0])}`, names: wallNames(), radio: true, host: appEls.view, spots: '.cw-tile:not(.cw-off)', n: CW_TILES, lines: ['planning the next files', 'rereading the design', 'checking what is there', 'weighing the next step'], tool: ['text', 'text', 'connect', 'frame'], pin: cwPin }
      : { key: `app-${cw.mode || 'code'}|${wallNames().map(n => n[0])}`, names: wallNames(), radio: true, host: appEls.view, spots: '.cw-tile:not(.cw-off)', n: CW_TILES, lines: [cw.mode === 'art' ? 'painting' : 'writing code'], tool: cw.mode === 'art' ? ['image', 'image', 'image', 'text'] : ['text', 'text', 'connect', 'frame'], pin: cwPin }
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

export function crewMembers(n) {
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
  const job = crewJob()
  // no crew on screen: look again a few times a second instead of every frame
  nextFrame(crewTick, !job && !crew.members.length, 300)
  const key = job ? job.key : ''
  if (key !== crew.key) {
    crew.key = key
    // a job that keeps its crew (the Meshy bench): whoever is still working stays where they are
    const stay = job?.keep ? new Set((job.names || []).map(([n]) => n)) : new Set()
    const kept = new Map(crew.members.filter(m => stay.has(m.name)).map(m => [m.name, m]))
    for (const m of crew.members) if (!kept.has(m.name)) { m.el.classList.add('leaving'); setTimeout(() => m.el.remove(), 500) }
    crew.members = []
    if (job) {
      const r = job.host.getBoundingClientRect()
      crew.members = (job.names || crewMembers(job.n)).map(([name, color], i) => {
        if (kept.has(name)) return kept.get(name)
        const el = document.createElement('div')
        el.className = `cursor crew${job.cls ? ` ${job.cls}` : ''}`
        el.innerHTML = `${ARROW(color, name)}<div class="tag" style="background:${color};color:${Crew.ink(color)}">${TOOL[job.tool[i % job.tool.length]].svg}<span>${esc(name)}</span><em class="doing"></em></div><div class="bubble"></div>`
        crewLayer.append(el)
        const x = r.left + r.width / 2 + (i - 1) * 40, y = r.bottom - 20
        return { el, name, doing: el.querySelector('.doing'), bubble: el.querySelector('.bubble'), said: 0, x, y, tx: x, ty: y, next: now + i * 450, line: i, pressAt: 0 }
      })
    }
  }
  // @ts-ignore
  if (!job) { radioLine.hidden = true; return }
  let lineTo = null
  for (const [i, m] of crew.members.entries()) {
    // pinned: the cursor rides its file's caret while the code types out
    const pin = job.pin?.(i)
    if (pin && 'carry' in pin) {
      // a courier carrying a made model (a small picture of it) to the library
      if (pin.carry && !m.carry) { m.carry = document.createElement('img'); m.carry.className = 'carry'; m.carry.alt = ''; m.el.append(m.carry) }
      if (m.carry) { if (pin.carry && m.carry.getAttribute('src') !== pin.carry) m.carry.src = pin.carry; m.carry.hidden = !pin.carry }
    } else if (m.carry) m.carry.hidden = true
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
  const from = lineTo && document.querySelector('#app-hermia:not([hidden]):not(.min) .ah-head .cw-radio-av')?.getBoundingClientRect()
  // @ts-ignore
  radioLine.hidden = !from?.width
  // @ts-ignore
  if (!radioLine.hidden) {
    const x1 = from.left + from.width / 2, y1 = from.bottom, x2 = lineTo.x + 6, y2 = lineTo.y + 4
    // @ts-ignore
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
  /** @type {any} the app's state, as the server reports it */
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
// @ts-ignore
document.addEventListener('mousedown', e => { if (!pubMenu.hidden && !e.target.closest('.pubwrap')) closePub() })

// ---------- pictures in the Design panel: swap any generated photo, or ask for one
export const pics = { pending: new Set() }
export const gensOf = l => [...new Set([...String(l.text || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')))]
export function picturesHtml(l) {
  const gens = gensOf(l)
  const rows = gens.map((g, i) => {
    const k = `${l.key}|${g}`, src = S.images.get(k), busy = pics.pending.has(k) || [...S.agents.values()].some(a => a.painting?.key === k)
    return `<div class="dpic" data-i="${i}">${src ? `<img src="${esc(src)}" alt="">` : `<span class="dpic-none">${busy ? '…' : 'no picture yet'}</span>`}<textarea rows="2" aria-label="Describe the picture you want">${esc(g)}</textarea><button class="dpic-go"${busy ? ' disabled' : ''}>${busy ? '🎨 Painting…' : src ? '🎨 New picture' : '🎨 Make it'}</button></div>`
  }).join('')
  return `<div class="dsec dpics"><h4>Pictures<small>${gens.length ? 'edit the words to change it' : ''}</small></h4>${rows || '<div class="dpic-empty">No photo in this section.</div>'}<div class="dpic-addrow"><input class="dpic-what" placeholder="Add a picture of… (optional)"><button class="dpic-add" aria-label="The section's builder adds one photo; it is painted when the rewrite is done">➕ Add</button></div></div>`
}
export function wirePictures(l) {
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
export function fitLive() {
  for (const box of document.querySelectorAll('.vlive')) {
    const f = box.querySelector('iframe')
    if (f) f.style.transform = `scale(${box.clientWidth / 1920})`
  }
}
setInterval(fitLive, 1000)

// every panel closes three ways: its ×, Esc and a click outside it (spec 12, rule 10; web/ui.js)
export function closeable(el, close, opt) { return window.SwarmUI?.layer(el, close, opt) || (() => {}) }
