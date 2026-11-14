// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): Hermia's dock and sign-in connectors.
import { $, HERMIA, ico, Crew, api } from './core.js'
import { workSpot } from './wander.js'
import { radioOn, radio, cw, CW_FRESH, cwZoom, artPhase, CW_CODE, autoM, setAutoMin, CW_TILES, wallNames, cwZoomShow, cwHighlight, cwPlan, heardIn, clock, kTokens, paintv, ART_STATE, artEvent } from './auto.js'
import { crewQuiet } from './deck.js'
import { setText, feed } from './panels.js'
import { esc } from './design.js'
import { playClip, view, appv, appEls, appApi, stageOf } from './rooms.js'
import { shownRun, allowBox, allowWire } from './film.js'
import { nextFrame } from './loop.js'

// ---------- Hermia's dock: the commander's own section under the steps. Her orders and her
// thinking out loud, newest at the bottom like a chat. Folds to its header and slides
// taller or shorter from its top edge; both stay as set in this browser.
const hdock = { el: $('#app-hermia'), key: '' }
;(() => {
  const el = hdock.el
  if (!el) return
  el.innerHTML = `<div class="ah-grip" role="separator" aria-orientation="horizontal" aria-label="Resize Hermia" tabindex="0"></div><button class="ah-head" aria-expanded="true"><span class="cw-radio-av">${HERMIA}</span><b>Hermia</b><em class="ah-kind"></em>${ico('chevron-down')}</button><div class="ah-feed"></div>`
  const side = el.parentElement, head = el.querySelector('.ah-head'), grip = el.querySelector('.ah-grip')
  const save = () => { try { localStorage.setItem('swarm-hermia', JSON.stringify({ h: el.style.getPropertyValue('--ah-h'), min: el.classList.contains('min') })) } catch {} }
  const fold = on => { el.classList.toggle('min', on); head.setAttribute('aria-expanded', String(!on)) }
  const size = h => el.style.setProperty('--ah-h', `${Math.round(Math.max(96, Math.min(h, side.clientHeight - 80)))}px`)
  try { const o = JSON.parse(localStorage.getItem('swarm-hermia') || '{}'); if (o.h) el.style.setProperty('--ah-h', o.h); if (o.min) fold(true) } catch {}
  head.onclick = () => { fold(!el.classList.contains('min')); save() }
  grip.onpointerdown = ev => {
    ev.preventDefault(); grip.setPointerCapture(ev.pointerId)
    const y0 = ev.clientY, h0 = el.getBoundingClientRect().height
    grip.onpointermove = m => size(h0 + y0 - m.clientY)
    grip.onpointerup = () => { grip.onpointermove = grip.onpointerup = null; save() }
  }
  grip.onkeydown = ev => { const d = { ArrowUp: 24, ArrowDown: -24 }[ev.key]; if (d) { ev.preventDefault(); size(el.getBoundingClientRect().height + d); save() } }
})()
function hermiaDock() {
  const el = hdock.el
  if (!el) return
  const feedL = radioOn() ? radio.feed : []
  el.hidden = !feedL.length || crewQuiet()
  const last = feedL.at(-1), key = `${radio.run}|${feedL.length}|${last?.t}|${last?.text.length}`
  if (el.hidden || hdock.key === key) return
  hdock.key = key
  const lead = radio.lead
  setText(el.querySelector('.ah-kind'), lead ? { assign: 'order', ack: 'roger', think: 'thinking' }[lead.kind] || lead.kind : 'thinking')
  el.querySelector('.ah-kind').className = `ah-kind k-${lead?.kind || 'reason'}`
  const box = el.querySelector('.ah-feed'), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60
  box.innerHTML = feedL.map(x => `<p class="ah-msg k-${esc(x.kind)}">${x.to ? `<span class="to">→ <b style="color:${Crew.color(x.to)}">${esc(x.to)}</b></span>` : ''}${esc(x.text)}</p>`).join('')
  if (stick) box.scrollTop = box.scrollHeight
}

function codeWall() {
  hermiaDock()
  playClip()
  const on = view === 'app' && appv.state === 'working' && appv.run === shownRun()
  if (!on) {
    cw.shown = false
    if (cw.el) cw.el.hidden = true
    if (appv.state !== 'working') Object.assign(cw, { run: null, seen: 0, queue: [], tiles: [], ...CW_FRESH })
    return
  }
  if (!cw.el) {
    cw.el = document.createElement('div')
    cw.el.className = 'codewall'
    cw.el.innerHTML = `<div class="cw-head"><b class="pop-title">${appv.kind === 'game' ? 'Writing the <em>game</em>' : 'Writing the <em>app</em>'}</b><span class="cw-count"></span></div><div class="cw-plan" hidden></div><div class="cw-grid"></div>`
    // a click on a tile makes it big, the others line up beside it; a second click (or Esc) puts it back
    const g = cw.el.querySelector('.cw-grid')
    g.onclick = ev => { const t = ev.target.closest('.cw-tile'); if (t) cwZoom([...g.children].indexOf(t)) }
    g.onkeydown = ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList?.contains('cw-tile')) { ev.preventDefault(); cwZoom([...g.children].indexOf(ev.target)) } }
    appEls.preview.append(cw.el)
  }
  if (cw.run !== appv.run) {
    Object.assign(cw, { run: appv.run, seen: Math.max(0, appv.steps.length - 30), queue: [], tiles: [], hide: false, ...CW_FRESH })
    cw.el.querySelector('.cw-grid').replaceChildren()
  }
  // art time: three painter tiles and one code tile; code time: three code tiles and the asset pane
  const artNow = artPhase(appv.steps), mode = artNow ? 'art' : 'code'
  if (cw.mode !== mode) {
    cw.mode = mode
    cw.tiles = []
    cw.el.querySelector('.cw-grid').replaceChildren()
    if (mode === 'art') cw.queue = ['GAME_SPEC.md']
    cw.el.querySelector('.cw-head .pop-title').innerHTML = mode === 'art' ? 'Painting the <em>art</em>' : appv.kind === 'game' ? 'Writing the <em>game</em>' : 'Writing the <em>app</em>'
  }
  const codeTile = i => i === CW_CODE
  // the wall shows while the stage shows the crew: by itself, or pinned in the bar's switch (web/canvas/stage.js)
  cw.hide = stageOf().shown !== 'crew'
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
    if (!codeTile(i)) continue
    const t = cw.tiles[i]
    if (t && (t.loading || t.shown < t.text.length || now - t.doneAt < 1500)) continue
    const path = cw.queue.shift()
    cw.tiles[i] = { path, text: '', shown: 0, loading: true, doneAt: 0 }
    const tile = cw.tiles[i]
    appApi(`/files?path=${encodeURIComponent(path)}`).then(r => { tile.text = String(r.text || '').slice(0, 6000) }).catch(() => { tile.text = '' }).finally(() => { tile.loading = false; if (!tile.text) tile.doneAt = 0 })
  }
  // nothing written yet (the crew is reading and planning): an empty code tile shows a file the
  // app already has, scrolling slowly and marked as being read, so the wall is never blank
  if (mode === 'code' && !cw.queue.length && !cw.reads?.length && now - cw.readAt > 20000) {
    cw.readAt = now
    appApi('/files').then(r => { if (cw.run === appv.run) cw.reads = (r.files || []).map(f => f.path).filter(p => /\.(tsx?|jsx?|css|md|gd)$/.test(p) && !/lock|tsbuildinfo|node_modules|\.d\.ts$/.test(p)) }).catch(() => {})
  }
  for (let i = 0; i < CW_TILES && cw.reads?.length && !cw.queue.length; i++) {
    if (!codeTile(i) || cw.tiles[i]) continue
    const up = new Set(cw.tiles.filter(Boolean).map(t => t.path)), pick = cw.reads.filter(p => !up.has(p))
    if (!pick.length) break
    const tile = cw.tiles[i] = { path: pick[(Math.random() * pick.length) | 0], text: '', shown: 0, loading: true, doneAt: 0, read: true, scroll: 0 }
    appApi(`/files?path=${encodeURIComponent(tile.path)}`).then(r => { tile.text = String(r.text || '').slice(0, 6000); tile.shown = tile.text.length }).catch(() => {}).finally(() => { tile.loading = false })
  }
  const grid = cw.el.querySelector('.cw-grid')
  const names = wallNames()
  while (grid.children.length < CW_TILES) {
    const d = document.createElement('div')
    if (!codeTile(grid.children.length) && mode === 'art') {
      d.className = 'cw-tile cw-paint'
      d.innerHTML = '<div class="cw-file"><span class="cw-path"></span><em class="cw-state"></em><em class="cw-who"></em></div>'
        + '<div class="cw-easel"><img class="cw-pic" alt=""><i class="cw-wash"></i><i class="cw-scan"></i><i class="cw-pin"></i></div><p class="cw-why" hidden></p>'
    } else if (!codeTile(grid.children.length)) {
      d.className = 'cw-tile cw-asset empty'
      d.innerHTML = '<div class="cw-file"><span class="cw-path"></span><em class="cw-who"></em></div>'
        + '<div class="cw-stage" aria-hidden="true"><div class="cw-turn"><img class="cw-face" alt=""><img class="cw-face" alt=""></div>'
        + `<div class="cw-cube">${'<i></i>'.repeat(6)}</div><i class="cw-scan"></i><i class="cw-pin"></i></div>`
    } else {
      d.className = 'cw-tile'
      d.innerHTML = '<div class="cw-file"><span class="cw-path"></span><em class="cw-who"></em></div><pre class="cw-code"></pre>'
    }
    d.tabIndex = 0
    grid.append(d)
  }
  cwZoomShow(grid)
  if (mode === 'art') {
    cwAssets()
    for (let i = 0; i < CW_TILES - 1; i++) cwPaintTile(grid.children[i], i, names[i])
  } else for (let k = 0; k < CW_CODE; k++) cwAssetTile(grid.children[k], names[k], now, k)
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
    d.classList.toggle('reading', !!t.read)
    setText(d.querySelector('.cw-path'), t.path)
    cwWho(d, names[i])
    if (t.read) {
      // a file being read: all of it, scrolling down slowly, then back to the top
      const pre = d.querySelector('.cw-code')
      if (d.dataset.path !== t.path || d.dataset.shown !== String(t.shown)) { d.dataset.path = t.path; d.dataset.shown = t.shown; pre.innerHTML = cwHighlight(t.text); t.scroll = 0 }
      t.scroll = t.scroll + 0.6 > pre.scrollHeight - pre.clientHeight + 40 ? 0 : t.scroll + 0.6
      pre.scrollTop = t.scroll | 0
      return
    }
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
  } else if (artNow) {
    cw.planKey = ''
    setText(cw.el.querySelector('.cw-count'), `${artNow.painted}/${artNow.total || '?'} pictures${artNow.failed ? ` · ${artNow.failed} ⚠` : ''}`)
  } else {
    cw.planKey = ''
    setText(cw.el.querySelector('.cw-count'), `${nFiles} file${nFiles === 1 ? '' : 's'} · ${writing} typing · ${appv.stage || ''}`)
  }
}

// A painter's tile: the picture they are on, as it goes from a wash of paint to the painted
// picture, its cut-out on dark and magenta while it is checked, and a ⚠ with the reviewer's
// words when it is sent back. Before the first word from a painter: the next picture's name.
function cwPaintTile(d, i, member) {
  if (!d) return
  cwWho(d, member)
  const sl = paintv.run === cw.run ? paintv.slots[i] : null
  const state = sl?.state || 'waiting'
  d.dataset.state = state
  setText(d.querySelector('.cw-path'), sl?.what || cw.assets?.next?.[i] || 'Art')
  const chip = d.querySelector('.cw-state')
  setText(chip, ART_STATE[state] || '')
  chip.setAttribute('aria-label', ART_STATE[state] || 'waiting')
  const pic = d.querySelector('.cw-pic'), src = sl?.src || ''
  if (pic.dataset.src !== src) {
    pic.dataset.src = src
    pic.classList.remove('on')
    if (src) {
      const im = new Image()
      im.onload = () => {
        if (pic.dataset.src !== src) return
        pic.src = src
        pic.classList.add('on')
        d.classList.remove('scan'); void d.offsetWidth; d.classList.add('scan')
      }
      im.src = src
    }
  }
  const why = d.querySelector('.cw-why'), words = state === 'sent back' || state === 'failed' ? (sl.problems || []).join(' · ') : ''
  why.hidden = !words
  setText(why, words ? `⚠ ${words}` : '')
}

// a tile's name chip: the courier working on it
function cwWho(d, member) {
  const [name, color] = member || ['', '#888']
  const who = d.querySelector('.cw-who')
  if (who.dataset.name !== name) { who.dataset.name = name; who.innerHTML = name ? `${Crew.avatar(name, 16)}<span>${esc(name)}</span>` : ''; who.style.background = color; who.style.color = Crew.ink(color) }
}

// The asset pane: the build's own pictures (GET /api/runs/:id/assets), one every few
// seconds, cross-fading on a slowly turning card with a scan sweep at each change. Models
// are listed by the server but not drawn: the Studio does not load three.js. Nothing painted
// yet: the next picture's name over a turning wireframe cube, never an empty pane.
function cwAssets() {
  if (cw.assetsLoading || Date.now() - cw.assetsAt < (cw.mode === 'art' ? 4000 : 12000)) return
  cw.assetsLoading = true
  const run = cw.run
  api(`/api/runs/${encodeURIComponent(run)}/assets`).then(r => r.ok ? r.json() : null)
    .then(j => {
      if (!j || cw.run !== run) return
      cw.assets = { pics: (j.assets || []).filter(a => a.kind === 'art' && a.src), next: j.next || [] }
      // the painters' jobs, for a canvas that missed their live events (opened mid-art, a reload)
      for (const e of j.painting || []) if (paintv.run !== run || !paintv.slots[e.slot] || paintv.slots[e.slot].t < e.t) artEvent(e)
    })
    .catch(() => {})
    .finally(() => { cw.assetsLoading = false; cw.assetsAt = Date.now() })
}
// The code wall's three picture windows, newest first: each is a slow slideshow through the
// latest few pictures only (never a loop through every old one), and a picture just made
// jumps to the front. k 0 is the play test (the filmed clip covers it once a slice has one;
// before that, the latest pictures under a "plays after this slice" note); k 1 and 2 share
// the latest pictures between them. A picture being painted right now takes window 1.
const CW_NEW = 5 * 60e3, CW_SHOW = 6, CW_EVERY = 5200
// the picture window k shows now from the latest few, turning every CW_EVERY (staggered)
function cwSlide(a, k, pool, now) {
  if (!pool.length) return null
  const top = pool[0].src
  if (a.top !== top) { a.top = top; a.n = 0; a.turn = now + CW_EVERY + k * 1700 }
  else if (now >= (a.turn || 0)) { a.n = (a.n || 0) + 1; a.turn = now + CW_EVERY }
  // k 1 and 2 take turns over the pool (the newest on 1, the next on 2); k 0 walks all of it
  const own = k === 0 ? pool : pool.filter((_, i) => i % 2 === (k === 1 ? 0 : 1))
  const list = own.length ? own : pool
  return list[(a.n || 0) % list.length]
}
function cwRanked() {
  const pics = cw.assets?.pics || []
  // newest first; pictures with no time keep the art plan's order, after the timed ones
  return pics.map((p, i) => ({ ...p, i })).sort((x, y) => (y.t || 0) - (x.t || 0) || y.i - x.i)
}
function cwLive() {
  if (paintv.run !== cw.run) return null
  return paintv.slots.filter(sl => sl && ['painting', 'cutting', 'checking', 'sent back'].includes(sl.state)).sort((x, y) => (y.t || 0) - (x.t || 0))[0] || null
}
function cwAssetTile(d, member, now, k = 0) {
  if (!d) return
  cwAssets()
  cwWho(d, member)
  const ranked = cwRanked(), live = k === 1 ? cwLive() : null
  const a = cw.av[k] ||= { src: '', name: '' }
  // the slice from the status line, else the build's last "stage n of N" step (the line often reads "next step")
  const slice = appv.at ? [null, ...appv.at] : String(appv.stage || '').match(/stage (\d+) of (\d+)/) || String(appv.steps.findLast(x => /^stage \d+ of \d+/.test(x.text || ''))?.text || '').match(/stage (\d+) of (\d+)/)
  let pic = null, label = '', state = ''
  const pool = ranked.slice(0, CW_SHOW)
  if (k === 0) {
    pic = cwSlide(a, 0, pool, now)
    label = d.classList.contains('no-start') ? 'Play test · the game did not start' : d.classList.contains('has-play') ? 'Play test' : `Play test · plays after ${slice ? `slice ${slice[1]} of ${slice[2]}` : 'this slice'}`
    state = 'waiting'
  } else if (live) {
    pic = live.src ? { src: live.src, name: live.what } : null
    label = live.what
    state = ART_STATE[live.state] || 'painting'
  } else {
    // with something painting in window 1, window 2 has the latest finished pictures to itself
    pic = cwSlide(a, cwLive() ? 0 : k, pool, now)
    label = pic?.name || cw.assets?.next?.[k - 1] || 'Art'
    state = pic && pic.t && Date.now() - pic.t < CW_NEW ? 'new' : ''
  }
  d.classList.toggle('empty', !pic)
  d.classList.toggle('play-wait', k === 0 && !d.classList.contains('has-play'))
  d.dataset.state = state
  setText(d.querySelector('.cw-path'), label)
  let chip = d.querySelector('.cw-state')
  if (!chip) { chip = document.createElement('em'); chip.className = 'cw-state'; d.querySelector('.cw-file').insertBefore(chip, d.querySelector('.cw-who')) }
  setText(chip, state === 'waiting' ? '' : state)
  a.name = label
  if (!pic || a.src === pic.src) return
  a.src = pic.src
  // the hidden face takes the new picture once it has loaded, then the faces trade places
  const faces = [...d.querySelectorAll('.cw-face')], next = faces.find(f => !f.classList.contains('on')) || faces[0]
  const im = new Image()
  im.onload = () => {
    if (a.src !== pic.src) return
    next.src = pic.src
    for (const f of faces) f.classList.toggle('on', f === next)
    d.classList.remove('scan'); void d.offsetWidth; d.classList.add('scan')
  }
  im.src = pic.src
}

// the crew's cursor for tile i sits on that tile's caret (the asset pane: beside its card)
export function cwPin(i) {
  if (cw.mode === 'art' && i < CW_TILES - 1) {
    const sl = paintv.run === cw.run ? paintv.slots[i] : null
    const pin = cw.el?.querySelector('.cw-grid')?.children[i]?.querySelector('.cw-pin')?.getBoundingClientRect()
    return pin?.width ? { ...workSpot({ x: pin.left, y: pin.top }, cw.el?.querySelector('.cw-grid')?.children[i], i, sl?.state === 'painting' || sl?.state === 'checking' || sl?.state === 'cutting'), text: sl ? `${ART_STATE[sl.state] || ''} ${sl.what}`.trim() : 'waiting', typing: sl?.state === 'painting' } : null
  }
  if (cw.mode !== 'art' && i !== CW_CODE) {
    const d = cw.el?.querySelector('.cw-grid')?.children[i], pin = d?.querySelector('.cw-pin')?.getBoundingClientRect()
    return pin?.width ? { ...workSpot({ x: pin.left, y: pin.top }, d, i, true), text: d.classList.contains('has-play') ? 'play testing' : cw.av[i]?.name || 'Art', typing: true } : null
  }
  const t = cw.tiles[i], d = cw.el?.querySelector('.cw-grid')?.children[i]
  // while painting, the code window is the play test's (playClip): its cursor sits on the clip's header
  if (d?.classList.contains('has-play')) { const r = d.getBoundingClientRect(); return r.width ? { x: r.left + 24, y: r.top + 14, text: 'play testing', typing: true } : null }
  const caret = d?.querySelector('.cw-caret')
  if (!t || !caret || (cw.thinking && t.shown >= t.text.length)) return null
  const r = caret.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { x: r.left + 2, y: r.top + 4, text: t.path.split('/').pop(), typing: t.shown < t.text.length }
}
;(function cwLoop() { try { codeWall() } catch (err) { console.error(err) } nextFrame(cwLoop, !(view === 'app' && appv.state === 'working'), 400) })()

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
      : c.asked && c.installed && !c.allowed && c.allow ? allowBox(c.allow, `Let Swarm Studio use ${c.label}: run this once, then sign in`)
      : c.signingIn || conn.busy.has(name) ? `<span class="ac-wait">waiting for you to approve in the browser…</span>${c.authUrl ? ` <a href="${esc(c.authUrl)}" target="_blank" rel="noopener">open sign-in</a>` : ''}`
      : `<button class="ac-go" data-name="${esc(name)}">🔌 Connect ${esc(c.label)}</button>`
    return `<div class="ac-row"><b>${esc(c.label)}</b>${state}<small>${c.signed_in && c.allowed ? 'Auto makes a free project and its table for you' : 'sign in once; no keys to copy'}</small></div>`
  }).join('')
  for (const b of box.querySelectorAll('.ac-go')) b.onclick = async () => {
    const name = b.dataset.name
    conn.busy.add(name); renderConnectors()
    const ask = body => api('/api/connectors/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    let res = await ask({ name })
    let out = await res?.json().catch(() => ({}))
    // adding a connector to Hermes is the person's yes, asked here first
    if (res?.ok && out?.confirm) {
      if (confirm(out.confirm)) { res = await ask({ name, confirm: true }); out = await res?.json().catch(() => ({})) }
      else { conn.busy.delete(name); return renderConnectors() }
    }
    if (out && typeof out === 'object') out.asked = true
    conn.busy.delete(name)
    if (!res?.ok) { feed(null, `connect: ${out?.error || 'the canvas server is not answering'}`, 'err') }
    else conn.all = { ...conn.all, [name]: { ...conn.all[name], ...out } }
    renderConnectors()
  }
  allowWire(box, () => { conn.all = null; renderConnectors() })
}
export function connectorEvent(e) {
  if (!conn.all) return
  const c = conn.all[e.name] || {}
  conn.all[e.name] = { ...c, signingIn: e.state === 'signing-in', authUrl: e.authUrl || c.authUrl, ...(e.state === 'connected' ? { signed_in: true, allowed: true } : {}) }
  if (e.state === 'connected') feed(null, `🔌 ${c.label || e.name} connected through Hermes`)
  if (e.state === 'failed') feed(null, `🔌 ${c.label || e.name} sign-in did not finish`, 'err')
  renderConnectors()
}
