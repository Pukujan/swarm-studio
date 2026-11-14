// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): saved runs (files) and traces, replay.
import { REPLAY_WORD, REPLAY_SAYS, replayAsk, appPill } from '../replaytalk.js'
import { api, S, els, ico, setReplayId, Q, WALL, $, replayId, BOOT } from './core.js'
import { feed, botMsg, setText, push } from './panels.js'
import { esc } from './design.js'
import { talkEnd } from './talk.js'
import { connect } from './start.js'
import { fresh } from './base.js'
import { on } from './events.js'
import { setView, view, appEls, resetApp } from './rooms.js'
import { setAuto } from './deck.js'
import { navOf, followPlayer } from './player.js'
import { review } from './marks.js'
import { shownRun } from './film.js'

// ---------- files: every saved run is a file with its own canvas
// `viewing` is null while following the live stream, or the id of a saved run
// (or 'new' for an empty canvas). The live stream is ignored while viewing one.
// Which build the canvas shows is the person's choice alone: a build they opened (openRun) or one
// they started. The stream never changes it by itself: the server replays its current run to every
// new or reconnected canvas, and a build started elsewhere waits in Projects (see connect).

export let viewing = null
export function setViewing(v) { return (viewing = v) }
export let liveId = null
export function setLiveId(v) { return (liveId = v) }
// the build the person last asked for: when it starts streaming, the canvas follows it
export let claimed = null
export let files = []

export async function loadFiles() {
  try {
    files = await (await api('/api/runs')).json()
  } catch {
    files = []
  }
}
export const saveMeta = (id, body) => api(`/api/runs/${encodeURIComponent(id)}/meta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

export async function fileInto(id, folder) {
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

export async function traceView(run, filter = {}) {
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
  // @ts-ignore
  wrap.querySelector('.tr-on input').checked = got.on !== false
  // @ts-ignore
  const q = wrap.querySelector('.tr-q').value.trim().toLowerCase()
  const calls = (got.calls || []).filter(c => !q || q.split(/\s+/).every(w => [c.kind, KIND_LABEL[c.kind], c.agent, c.page, c.layer, c.model].join(' ').toLowerCase().includes(w)))
  const list = wrap.querySelector('.tr-list')
  // @ts-ignore
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
    // @ts-ignore
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
export function traceLive(e) {
  if (e.run !== trace.run) return
  clearTimeout(trace.timer)
  trace.timer = setTimeout(traceList, 400)
}

// Search every field a file has; tag:x, folder:x, on:<host>, has:video|site|images narrow it.
export function fileMatch(f, q) {
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
export function fileInfo(f) {
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

let openSeq = 0
export async function openRun(id) {
  const seq = ++openSeq
  claimed = id
  talkEnd()
  // the live build: followed on the stream (one too new for the file list is the live one too)
  if (id === liveId && (files.find(f => f.id === id)?.live || !files.some(f => f.id === id))) {
    viewing = null
    connect()
  } else {
    const res = await api(`/api/runs/${encodeURIComponent(id)}/events`).catch(() => null)
    if (!res?.ok) return
    const events = await res.json()
    // another build was opened while this one loaded: the newer one stands
    if (seq !== openSeq) return
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
  // a player the address names (a reload, Back) opens once its build is here
  if (navOf()) followPlayer(navOf().view)
}

// A saved run keeps each section's finished HTML but not the stream that wrote it, so a replay
// showed every section popping in whole. This types it back in: the HTML in pieces, spread over
// the time between the agent taking the section and finishing it.
function withTyping(events) {
  const took = new Map(), out = []
  let last = 0
  for (const e of events) {
    const t = e.t || last
    last = t
    const k = `${e.page}/${e.layer}`
    if (e.type === 'agent:assign') took.set(k, t)
    if (e.type === 'layer:done' && e.html && !e.kept && took.has(k)) {
      const t0 = Math.max(took.get(k), t - (e.ms || 4000)), n = Math.min(40, Math.max(6, Math.round(e.html.length / 220)))
      took.delete(k)
      for (let i = 0; i < n; i++) out.push({ type: 'layer:delta', run: e.run, page: e.page, layer: e.layer, agent: e.agent, text: e.html.slice(Math.floor(i * e.html.length / n), Math.floor((i + 1) * e.html.length / n)), t: t0 + (t - t0) * (i + 0.5) / n })
    }
    out.push(e.t ? e : { ...e, t })
  }
  return out.map((e, i) => [e, i]).sort((x, y) => x[0].t - y[0].t || x[1] - y[1]).map(x => x[0])
}

// Replay a saved run on its own clock, sped up: the Swarm Wall plays four of these side by side.
// Long quiet gaps (a model thinking) are cut to 1.5 s of real time so the tile never looks stuck.
let replaySeq = 0, replayAsked = false
// The replay now. `on`: one is playing (from the menu, the chat or the address), so the canvas shows the mark and
// starts nothing real (web/canvas/rooms.js opens no app, web/canvas/panels.js marks the lines it adds).
// `at`: how far along, 0 to 1. `event`: a saved event is being drawn right now. `n` counts replays started and
// ended, so a timer set by one (a view change under a step card) does nothing once it is over.
export const rec = { on: false, run: '', at: 0, event: false, n: 0 }
// the real time between two saved events: sped up, and a long quiet gap (a model thinking) cut to 1.5 s
const gapOf = (e, prev, speed) => Math.min(Math.max(0, (e.t || prev) - prev) / speed, 1500)
export async function replayRun(id, speed = 8) {
  const seq = ++replaySeq
  const res = await api(`/api/runs/${encodeURIComponent(id)}/events`).catch(() => null)
  if (!res?.ok) { if (replayAsked) endReplay(); return botMsg('That run could not be loaded.') }
  if (seq !== replaySeq) return
  const events = withTyping((await res.json()).filter(e => e.type !== 'cmd'))
  let clock = 0, prev = events[0]?.t || 0, total = 0
  for (const e of events) { total += gapOf(e, prev, speed); prev = e.t || prev }
  prev = events[0]?.t || 0
  Object.assign(rec, { on: true, run: id, at: 0, n: rec.n + 1 })
  viewing = id
  // the App room starts empty too: its steps are the replay's, counted once
  resetApp(id)
  fresh(id)
  paintMark()
  const start = performance.now()
  parent.postMessage?.({ wall: 'start', run: id, events: events.length }, '*')
  for (const [i, e] of events.entries()) {
    clock += gapOf(e, prev, speed)
    prev = e.t || prev
    const wait = clock - (performance.now() - start)
    if (wait > 4) await new Promise(r => setTimeout(r, wait))
    if (seq !== replaySeq) return // stopped, or another replay started
    rec.at = total ? clock / total : 1
    // stamped now, so the canvas treats it as happening (a saved time would mute the crew)
    rec.event = true
    try { on({ ...e, t: Date.now() }) } catch (err) { console.error(err) } finally { rec.event = false }
    if (i % 25 === 0) parent.postMessage?.({ wall: 'tick', run: id, i, of: events.length, t: e.t - events[0].t }, '*')
  }
  parent.postMessage?.({ wall: 'done', run: id, ms: (events.at(-1)?.t || 0) - (events[0]?.t || 0) }, '*')
  // a replay asked for from the menu or the chat ends on the finished build it started from, opened again whole:
  // nothing the replay drew (its chat lines, the crew at work, the App room's steps) is left looking in progress
  if (replayAsked) return void await backToBuild(id, false)
  // one from the address (the Wall, a capture) stays on its last picture; if that is the App room, the app
  // is read and started now, once, never while the replay played
  rec.on = false
  paintMark()
  if (view === 'app') setView('app')
}

// ☰ → Replay: watch a finished build again exactly as it was built, from its saved run (no model,
// no pictures painted). It is a recording: nothing is built, and nothing is written to the run. It plays in the
// Design deck, where the crew can be watched, with the camera following, at the speed it happened, and goes on
// into the App room when the build did. The same menu item stops it, and so do Stop on the mark, "stop" in the
// chat and leaving the deck; all put the finished build back. A replay from the address (?replay=) shows the
// same mark; leaving the deck does not end it.
export function paintReplay() {
  const b = els.replayBtn
  if (!b) return
  const on = replayAsked
  if (b.dataset.on !== String(on)) { b.dataset.on = String(on); b.innerHTML = `${ico(on ? 'square-stop' : 'rotate-ccw')}${on ? 'Stop replay' : 'Replay'}` }
  b.disabled = !on && !canReplay()
  paintMark()
}
function endReplay() { replayAsked = false; setReplayId(Q.get('replay') || ''); paintReplay() }

// The mark: for the whole replay the canvas strip (#status, web/canvas/panels.js renderStatus) and the App room's
// pill (#app-state, web/canvas/rooms.js renderApp) read Replay and how far along it is, each with Stop beside it.
// This pass keeps the pill's number moving between the room's own renders, and says "Replay" once, politely, to
// a screen reader (the number is not announced as it ticks).
const markLive = $('#replay-live')
function paintMark() {
  if (markLive) setText(markLive, rec.on ? REPLAY_WORD : '')
  if (!rec.on || view !== 'app') return
  appEls.state.classList.add('replay')
  setText(appEls.state, appPill({ replay: true, at: rec.at }))
}
// The finished build again, whole, after a replay: in the deck, where the replay began; `stay` keeps the room
// the person is in (they asked for something there), and the App room then reads the real app.
async function backToBuild(id, stay) {
  const played = rec.on
  rec.on = false
  rec.n++
  if (replayAsked) endReplay()
  paintMark()
  if (!stay && view !== 'canvas') setView('canvas')
  // the App room, when it is next looked at, starts from nothing the replay left: no Replay pill, no card, no Stop
  resetApp(id)
  appEls.state.className = 'app-state pill'
  setText(appEls.state, appPill({}))
  appEls.empty.innerHTML = ''
  appEls.stop.hidden = true
  // what the person asked while it played, and the answers, stay in the chat; the replay's own lines go
  const said = played ? [...els.feed.children].filter(x => x.classList.contains('item') && !x.classList.contains('replayed')) : []
  await openRun(id)
  for (const x of said) push(els.feed, x)
  if (stay && view === 'app' && S.kind !== 'game') setView('app')
}
// "replay" typed, or the menu: false when there is no finished build to play
// (the hosted studio has no Replay: its menu item is not there either)
function canReplay() { return !!S.done && !review.busy && !!shownRun() && !BOOT.hosted }
function startReplay() {
  const id = shownRun()
  if (!id || replayAsked) return
  replayAsked = true
  setReplayId(id)
  paintReplay()
  window.swarmCosmos?.go('station', 'canvas')
  replayRun(id, 1)
  // the camera follows the crew (the replay's own reset comes a moment later, so once more then)
  setAuto(true)
  setTimeout(() => { if (replayAsked) setAuto(true) }, 700)
}
// Stop. By itself it ends a replay started here (the menu, the chat); `any` also ends one from the address (Stop
// on the mark, "stop" typed). Resolves once the finished build is back.
export async function stopReplay({ any = false, stay = false } = {}) {
  if (!replayAsked && !(any && rec.on)) return false
  const id = rec.on ? rec.run : replayId
  replaySeq++
  await backToBuild(id, stay)
  return true
}
if (els.replayBtn) els.replayBtn.onclick = () => (replayAsked ? stopReplay() : startReplay())
// Stop on the mark: beside the strip on the canvas, and the App bar's own Stop while a replay plays (rooms.js)
els.status?.addEventListener('click', e => { if (/** @type {Element} */ (e.target).closest?.('.st-stop')) stopReplay({ any: true }) })

// The chat during and about a replay (web/replaytalk.js replayAsk): true when the message was a replay's and is
// answered; false when the chat goes on with it as ever (after ending the replay first, if one was playing).
/** @param {string} text */
export async function replaySay(text) {
  const to = replayAsk(text, rec.on && !WALL)
  if (!to) return false
  if (to === 'first') { await stopReplay({ any: true, stay: true }); botMsg(REPLAY_SAYS.first); return false }
  els.brief.value = ''
  if (to === 'stop') await stopReplay({ any: true })
  feed(null, String(text).trim(), 'you')
  if (to === 'start') { if (canReplay()) startReplay(); else botMsg(REPLAY_SAYS.none); return true }
  botMsg(to === 'stop' ? REPLAY_SAYS.stopped : REPLAY_SAYS[to])
  return true
}
