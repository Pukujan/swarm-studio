// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the views and rooms: Canvas, Video, App, the big game, the app advisor, game mode, cast, art, the bench.
import { dataStore } from '../data.js'
import { noAppYet, goOnAsk } from './wander.js'
import { stageNow, stagePick, stageAsk, stageNone, stageSwitch, playFail } from './stage.js'
import { autoplayRoom } from './autoplay.js'
import { painterOf, cursor } from '../icons.js'
import { openWorkshop } from '../workshop.js'
import { $, els, api, ico, BASE, S, BOOT, HERMIA, commandOps, Crew } from './core.js'
import { toggleVideo, video, shownRun, showRun } from './film.js'
import { cw, CW_CODE, wallNames, paintv, artPhase } from './auto.js'
import { setText, botMsg, feed, push } from './panels.js'
import { esc } from './design.js'
import { saveModel, modelsInfo, loadModels, showTab } from './settings.js'
import { loadFiles, openRun, rec, stopReplay } from './replay.js'
import { appPill } from '../replaytalk.js'
import { HOSTS } from './publish.js'
import { adoptVideos, boardVideo } from '../video.js'

// ---------- views: Canvas | Video | App
// Each view keeps working while you look at another; a dot on its tab says how
// it is doing. The chat follows the view: on App, a message is the app's next
// change; on Video, an idea for a new cut.
export let view = 'canvas'
// the App view's state (web/data.js): reset when another run is shown, keeping the preview mode and width
const appStore = dataStore('app', { run: null, state: 'idle', kind: 'site', steps: [], asks: [], url: null, stage: '', message: '', result: null, deployed: null, mode: 'preview', w: 0, files: null, file: '', hasApp: false, canServe: false, openFailed: false, openSay: false, opening: false, loaded: false, plan: null, slice: null, intake: null }, { keep: ['mode', 'w'] })
/** @type {any} */
export const appv = appStore.state
// a game's art plan as last read (sheetLoad), and the view pinned in the bar's switch (stageOf); both belong to one run
/** @type {{ run: string | null, data: any, t: number, busy: boolean }} */
const sheetv = { run: null, data: null, t: 0, busy: false }
/** @type {{ v: import('./stage.js').StageView | null }} */
const stagePin = { v: null }
export const appEls = { view: $('#appview'), state: $('#app-state'), stage: $('#app-stage'), steps: $('#app-steps'), frame: $('#app-frame'), shell: $('#app-shell'), empty: $('#app-empty'), preview: $('#app-preview'), code: $('#app-code'), tree: $('#app-tree'), file: $('#app-file'), open: $('#app-open'), port: $('#app-port'), stop: $('#app-stop') }
// The Game room's Autoplay switch and the AI player's screen over the game (web/canvas/autoplay.js)
const aiPlayer = autoplayRoom({
  btn: /** @type {HTMLButtonElement | null} */ ($('#app-auto')), cover: $('#app-auto-view'), api, ico, cursor: cursor(painterOf('autoplay')),
  stream: run => `${BASE}/api/runs/${encodeURIComponent(run)}/autoplay/stream?k=${encodeURIComponent(BOOT.token || '')}&t=${Date.now()}`,
  showLive: () => stageSet('live'), botMsg, youSaid: text => feed(null, text, 'you'),
})
const PLACEHOLDER = { canvas: 'Describe a product. The swarm designs and builds its site.', video: 'An idea for the video: “faster, end on the crowd”, “for Instagram”…', app: 'Change the app: “add a FAQ page with search”, “let people pick a seat”…' }

export function setView(v) {
  if (!['canvas', 'video', 'app'].includes(v)) return
  if (game.el) closeGame()
  const was = view
  view = v
  document.body.classList.toggle('view-video', v === 'video')
  document.body.classList.toggle('view-app', v === 'app')
  // @ts-ignore
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('on', b.dataset.view === v)
  appEls.view.hidden = v !== 'app'
  // Autoplay belongs to the room: leaving it ends the play
  if (was === 'app' && v !== 'app') aiPlayer.leave()
  if (v === 'video') toggleVideo(true)
  else if (was === 'video') toggleVideo(false)
  if (v === 'app') loadApp()
  els.brief.placeholder = PLACEHOLDER[v]
  renderBadges()
}
// @ts-ignore
for (const b of document.querySelectorAll('#views button')) b.onclick = () => setView(b.dataset.view)

function renderBadges() {
  const vb = document.querySelector('#views [data-view="video"] .vbadge'), ab = document.querySelector('#views [data-view="app"] .vbadge')
  if (vb) vb.className = `vbadge ${video.busy ? 'working' : video.message ? 'failed' : video.src ? 'done' : ''}`
  if (ab) ab.className = `vbadge ${appv.run === shownRun() ? { working: 'working', done: 'done', failed: 'failed' }[appv.state] || '' : ''}`
}
setInterval(renderBadges, 1000)

export const appApi = (path = '', body) => api(`/api/runs/${encodeURIComponent(appv.run)}/app${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const out = await r.json().catch(() => ({})); if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`); return out })

export function resetApp(run) {
  appStore.reset({ run })
  stagePin.v = null
  appEls.frame.removeAttribute('src')
}

// brought in (docs/specs/45-intake.md): a Vite project nobody has pressed Install and run for yet
const needsRun = () => appv.intake?.done && appv.intake.shape === 'vite' && !appv.intake.ran
// brought in as plain files: the crew cannot change it yet, and the room does not offer to
const fixedIn = () => !!appv.intake?.fixed

async function loadApp() {
  const run = shownRun()
  if (!run) { resetApp(null); return renderApp() }
  if (appv.run !== run) resetApp(run)
  // a replay draws the room from its saved events only: the real app is not read, and never started, while it plays
  if (rec.on) return renderApp()
  try {
    const st = await appApi()
    if (appv.run !== run || rec.on) return
    Object.assign(appv, { at: st.at || null, state: st.state, elsewhere: !!st.elsewhere, kind: st.kind || appv.kind, stage: st.stage || '', message: st.message || '', result: st.result, deployed: st.deployed || appv.deployed, hasApp: !!st.hasApp, canServe: !!st.canServe, loaded: true, engineReady: st.engineReady, intake: st.intake || null })
    if (st.steps?.length >= appv.steps.length) appv.steps = st.steps
    if (st.asks?.length) appv.asks = st.asks
    if (st.state === 'paused' && st.slice) { appv.slice = st.slice; sliceCard(st.slice, run) }
    // the server knows whether the app is running: an address from the log may be a dev server
    // that stopped with a restart, so it opens again rather than showing a dead page
    appv.url = st.url || null
    // an app made before: start its server again. (A big game waiting after a slice is not started by looking at
    // the room: that can mean an install and a build. Its Live option, Play it live or "show the game" start it.
    // A Vite project brought in waits for the person's press: its install and build are code from outside.)
    if (!appv.url && appv.hasApp && appv.state !== 'working' && !needsRun()) openApp(run)
  } catch (err) { appv.message = err.message }
  renderApp()
}
// Start the app's server again (POST …/app/open): the stage shows the "Starting" skeleton meanwhile. A try the
// person asked for (the Live option, Play it live, "show the game") says in the chat why it failed; the room's
// own try stays quiet.
function openApp(run) {
  // never for a replay: starting the app writes app:ready and a new photo into the very run being replayed
  if (appv.opening || appv.run !== run || rec.on) return
  Object.assign(appv, { opening: true, openFailed: false })
  renderApp()
  let again = false
  appApi('/open', {}).then(async o => {
    if (appv.run !== run) return
    if (o.url) return void Object.assign(appv, { url: o.url, tries: 0, openSay: false })
    // it is still starting: ask again in a moment, ten times at most (the skeleton stays meanwhile)
    if ((appv.tries = (appv.tries || 0) + 1) >= 10) throw new Error('It did not start. Open it again to retry.')
    await new Promise(r => setTimeout(r, 2500))
    again = appv.run === run && !appv.url
  }).catch(err => { if (appv.run !== run) return; if (appv.openSay) botMsg(playFail(appv.kind, err.message)); Object.assign(appv, { message: err.message, openFailed: true, openSay: false }) })
    .finally(() => { if (appv.run === run) appv.opening = false; if (again) openApp(run); else renderApp() })
}
// "Play it live" on a slice's chat card, and "show the game" typed: the room shows the Live view, pinned, and
// starts the game's server again if it stopped. When there is nothing to start, the chat says why.
export async function playLive() {
  if (!shownRun()) return
  if (view !== 'app') setView('app')
  if (appv.run !== shownRun()) resetApp(shownRun())
  Object.assign(appv, { openFailed: false, tries: 0 })
  await loadApp()
  if (!stageOf().offers.includes('live')) return botMsg(stageNone('live', stageBuild()))
  stageSet('live')
}

// a build another Studio drives has no live feed here: read the shared log again every few seconds
setInterval(() => { if (view === 'app' && appv.elsewhere && !document.hidden) loadApp() }, 4000)
// someone is looking at the app: its server is kept (engine/appjob.mjs seen); with nobody looking it stops after
// Settings › Background's time, and the next look opens it again
function appSeen() {
  if (view !== 'app' || document.hidden || !appv.run || !appv.url || appv.elsewhere) return
  appApi('/seen', {}).then(o => { if (!o.url) { appv.url = null; loadApp() } }).catch(() => {})
}
setInterval(appSeen, 30000)
document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'app') { if (appv.url) appSeen(); else loadApp() } })

// the latest play test, filmed: the clip loops from the first key, with the key it pressed
const clip = { el: null, src: '', keys: [], at: 0, shut: '' }
// While the code wall is up, the play test is one of its windows (the first tile, over that
// tile's pictures); otherwise a small card over the game, which × hides.
export function playClip() {
  const s = appv.run === shownRun() ? appv.steps.findLast(x => x.clip) : null
  // its window on the wall: the first while the crew writes code, the code window while it paints
  // (the painters keep theirs); off the wall it is the small card over the game
  const grid = cw.el && !cw.el.hidden ? cw.el.querySelector('.cw-grid') : null
  const tile = grid ? (cw.mode === 'code' ? grid.children[0] : cw.mode === 'art' ? grid.children[CW_CODE] : null) || null : null
  for (const t of cw.el?.querySelectorAll('.cw-tile.has-play') || []) if (t !== tile || !s) t.classList.remove('has-play')
  if (!s || (!tile && clip.shut === s.clip)) { if (clip.el) clip.el.hidden = true; return }
  if (!clip.el) {
    clip.el = document.createElement('div')
    clip.el.className = 'playclip'
    clip.el.innerHTML = `<div class="pc-head"><b>Play test</b><span class="pc-key"></span><button class="pc-x" aria-label="Hide the play test">${ico('x')}</button></div><video muted playsinline></video>`
    clip.el.querySelector('.pc-x').onclick = () => { clip.shut = clip.src; clip.el.hidden = true }
    const v = clip.el.querySelector('video')
    v.addEventListener('loadedmetadata', () => { v.currentTime = clip.at })
    v.addEventListener('ended', () => { v.currentTime = clip.at; v.play().catch(() => {}) })
    v.addEventListener('timeupdate', () => {
      const k = clip.keys.findLast(x => x.t <= v.currentTime + 0.05)
      setText(clip.el.querySelector('.pc-key'), k ? k.k : '')
    })
  }
  const host = tile || appEls.preview
  // on screen it plays (web/video.js), within the page's budget; hidden or off screen, it is its poster
  if (clip.el.parentElement !== host) host.append(clip.el)
  tile?.classList.add('has-play')
  clip.el.classList.toggle('in-wall', !!tile)
  clip.el.hidden = false
  clip.el.classList.toggle('failed', s.ok === false)
  if (clip.src !== s.clip) {
    clip.src = s.clip
    clip.keys = (s.keys || []).filter(x => typeof x.t === 'number')
    clip.at = Math.max(0, (clip.keys[0]?.t || 0) - 1)
    boardVideo(clip.el.querySelector('video'), { src: BASE + s.clip, auto: true })
  }
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
export function renderAppLink() {
  const b = $('#app-link')
  if (!b) return
  b.hidden = !S.link
  if (S.link) { b.textContent = S.link.label; b.onclick = () => showRun(S.link.run) }
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
  const src = frameUrl(appv.url)
  f.setAttribute('sandbox', appSandbox(src)) // before the address, so the first load is sandboxed too
  f.src = src
  old.replaceWith(f)
  appEls.frame = f
}
// the app's dev server answers on every loopback name, but a page on localhost will not show
// 127.0.0.1 in a frame (and the other way round): use the Studio's own name for it
export function frameUrl(u) {
  try {
    const x = new URL(u), loop = /^(localhost|127\.0\.0\.1|\[::1\])$/
    if (loop.test(x.hostname) && loop.test(location.hostname)) x.hostname = location.hostname
    return x.href
  } catch { return u }
}
// The app and the game run on their own port, so their origin is never the studio's: they keep their own
// storage (an app's sign-in needs it) but cannot steer the studio's tab. Should the address ever be the
// studio's own origin, the frame gets an opaque one instead (Nous catalog review, point 4).
function appSandbox(src) {
  let same = true
  try { same = new URL(src, location.href).origin === location.origin } catch {}
  return same ? 'allow-scripts allow-forms' : 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals'
}
function frameLoaded() { clearTimeout(frameWait); const el = $('#app-loading'); if (el) el.hidden = true }
function frameLoad(e) { if (e.target === appEls.frame && appEls.frame.src && appEls.frame.src !== 'about:blank') { clearTimeout(frameWait); frameWait = setTimeout(frameLoaded, 700) } }

function renderApp() {
  // while the crew builds the box talks to it; a game's own examples are a game's
  if (view === 'app') els.brief.placeholder = fixedIn() ? 'Brought in: the crew cannot change it yet' : appv.state === 'working' ? 'Ask the crew, or say what to change…' : appv.kind === 'game' ? 'Change the game: “make the jump higher”, “add a boss”…' : PLACEHOLDER.app
  renderAppLink()
  renderBadges()
  if (view !== 'app') return
  // a build another Studio drives comes from the shared run log: the server says so
  const st = appv.state, working = st === 'working', elsewhere = !!appv.elsewhere
  // a replay's pill reads Replay and how far along it is, never "building" or "running" (web/replaytalk.js)
  appEls.state.className = `app-state pill ${st}${rec.on ? ' replay' : ''}`
  appEls.state.textContent = appPill({ replay: rec.on, at: rec.at, state: st, url: appv.url, hasApp: appv.hasApp })
  setText(appEls.stage, working ? appv.stage : appv.result ? `${appv.result.turns} turn${appv.result.turns === 1 ? '' : 's'} · ${appv.result.files} files · checks ${appv.result.gatesPassed ? 'passed' : 'not passed'}${appv.deployed ? ` · live at ${appv.deployed}` : ''}` : '')
  const stick = appEls.steps.scrollHeight - appEls.steps.scrollTop - appEls.steps.clientHeight < 60
  appEls.steps.innerHTML = stepsHtml()
  if (stick) appEls.steps.scrollTop = appEls.steps.scrollHeight
  // Stop ends the build; while a replay plays it is there throughout and ends the replay
  appEls.stop.hidden = rec.on ? false : !working || elsewhere
  if (appv.url) appEls.open.href = appv.url; else appEls.open.removeAttribute('href')
  // the same game as a Godot, Unity or Unreal project, when the job wrote one
  const port = appv.result?.port
  appEls.port.hidden = !port?.files
  if (port?.files) {
    appEls.port.href = `${location.origin}/api/runs/${encodeURIComponent(appv.run)}/port/${port.target}.zip?k=${encodeURIComponent(BOOT.token || '')}`
    appEls.port.textContent = port.label
    appEls.port.setAttribute('aria-label', `Download the ${port.label} project`)
  }
  // the preview, or what to do first
  if (appv.url && appEls.frame.dataset.src !== appv.url) { appEls.frame.dataset.src = appv.url; loadFrame() }
  // a build that failed before it ever worked shows the failure, not the empty starter's blank page
  // what fills the stage: it follows the build, or holds the view pinned in the bar's switch (web/canvas/stage.js)
  const now = stageOf(), empty = now.empty, sheet = now.sheet && !!shownRun()
  stageSwitch($('#app-stageview'), now, v => stageSet(stagePick(stagePin.v, v)))
  if (now.open && shownRun() && !document.hidden) return openApp(shownRun())
  appEls.empty.hidden = !empty
  if (appv.kind === 'game' && shownRun()) sheetLoad(shownRun(), working || sheet)
  if (!sheet) { appEls.empty.classList.remove('sheet'); for (const a of ['tabindex', 'role', 'aria-label']) appEls.empty.removeAttribute(a) }
  if (sheet) artSheet()
  else if (empty) {
    const run = shownRun()
    appEls.empty.innerHTML = !run
      ? `<h2>No build open</h2><p>Make a site on the canvas, open one from Files, or start a 🎮 Game.</p>`
      // a replay: the recording's build, never "Building the app…" or "Starting the app…" (nothing is being started)
      : rec.on
        ? `<h2>The ${appv.kind === 'game' ? 'game' : 'app'} ${working ? 'being' : 'is'} <em>built</em></h2>${working ? `<p>${esc(appv.stage || '')}</p>` : ''}`
      // an app opened again after its server stopped (decision 0017, issue #450): the shape of a page while it starts, cold
      : (appv.opening || (appv.hasApp && !appv.message && st !== 'failed' && st !== 'stopped' && (appv.tries || 0) < 10)) && !working
        ? `<div class="app-skel" role="status" aria-busy="true" aria-label="Starting the ${appv.kind === 'game' ? 'game' : 'app'}"><i class="bar"></i><i class="hero"></i><span><i></i><i></i><i></i></span><em class="as-bot" aria-hidden="true">${cursor(painterOf('app'))}</em></div><p>Starting the ${appv.kind === 'game' ? 'game' : 'app'}…</p>`
      // being brought in: the shape of a page with a crew cursor on it, and the step it is on (no engine works here)
      : working && appv.intake
        ? `<div class="app-skel bring-skel" role="status" aria-busy="true" aria-label="Bringing it in"><i class="bar"></i><i class="hero"></i><span><i></i><i></i><i></i></span>${cursor('Pip')}</div><p>${esc(appv.stage || 'bringing it in')}</p>`
      : needsRun() && !appv.message
        ? `<h2>Brought in</h2><button class="big" data-run>${ico('play')}Install and run</button>`
      : working
        ? `<div class="spin"></div><h2>${appv.kind === 'game' ? 'Building the game…' : 'Building the app…'}</h2><p>${esc(appv.stage || 'starting')}</p><p>${appv.engineReady === false ? 'First time: the app engine installs itself once (about a minute, ~1.5 GB). ' : ''}dyad's engine writes the code, runs the typecheck and build after every turn, and fixes what fails. You can go back to the Canvas or Video meanwhile.</p>`
        // it did not come in: why, and no Try again (it is brought in again from Projects)
        : st === 'failed' && appv.intake && !appv.intake.done
          ? `<div class="fail-card"><span class="fail-ico">${ico('x')}</span><h2>It did not <em>come in</em></h2><p class="fail-msg">${esc(String(appv.message || '').split('\n')[0].slice(0, 260))}</p></div>`
        : st === 'failed' && appv.result?.artStop
          ? artStopCard(appv.result.artStop)
        : st === 'stopped' || (st === 'failed' && appv.message === 'stopped')
          ? `<div class="fail-card stopped"><h2><em>Stopped</em></h2><p class="fail-msg">${esc(stopSummary())}</p><button class="big" data-build>${ico('rotate-ccw')}Go on</button></div>`
        : st === 'failed'
          ? `<div class="fail-card"><span class="fail-ico">${ico('x')}</span><h2>The ${appv.kind === 'game' ? 'game' : 'app'} didn't <em>build</em></h2><p class="fail-msg">${esc(String(appv.message || 'The engine stopped before the app built.').split('\n')[0].replace(/(\/[\w.@-]+){3,}/g, m => `…/${m.split('/').slice(-2).join('/')}`).slice(0, 220))}</p>${appv.message ? `<details class="fail-more"><summary>Show details</summary><pre>${esc(appv.message)}</pre></details>` : ''}<button class="big" data-build>${ico('rotate-ccw')}Try again</button></div>`
          : (appv.hasApp || appv.openFailed) && appv.message
            ? `<div class="fail-card"><span class="fail-ico">${ico('x')}</span><h2>The ${appv.kind === 'game' ? 'game' : 'app'} didn't <em>start</em></h2><p class="fail-msg">${esc(String(appv.message).split('\n')[0].slice(0, 220))}</p><button class="big" data-reopen>${ico('rotate-ccw')}Try again</button></div>`
          : appv.kind === 'game' && !appv.hasApp
            ? `<h2>A game starts with a few questions</h2><button class="big" data-game>🎮 Start a game</button>`
            : `<h2>Turn this design into a working app</h2><p>The design stays exactly as it is. Hermia first asks what runs behind it (dashboards, customers, an admin panel), then the engine builds it all.</p><button class="big" data-build>Build the app</button>`
    appEls.empty.querySelector('[data-build]')?.addEventListener('click', buildApp)
    // out of quota: another image model, then build again (pictures already painted are kept)
    for (const b of appEls.empty.querySelectorAll('[data-image]')) b.addEventListener('click', async () => { b.disabled = true; await saveModel({ role: 'image', provider: b.dataset.image, model: b.dataset.model || '' }); buildApp() })
    appEls.empty.querySelector('[data-incode]')?.addEventListener('click', () => appAsk('', { art: false }))
    appEls.empty.querySelector('[data-reopen]')?.addEventListener('click', () => { Object.assign(appv, { message: '', openFailed: false, tries: 0 }); loadApp() })
    // the person's own press: the project's packages are installed and its build runs, then it opens
    appEls.empty.querySelector('[data-run]')?.addEventListener('click', () => {
      appv.opening = true
      renderApp()
      appApi('/open', { run: true }).then(o => { if (o.url) appv.url = o.url; if (appv.intake) appv.intake.ran = true }).catch(err => { appv.message = err.message }).finally(() => { appv.opening = false; renderApp() })
    })
    appEls.empty.querySelector('[data-game]')?.addEventListener('click', () => openGame())
  }
  // Autoplay belongs to the live game (web/canvas/autoplay.js): there once it runs, stopped when the stage leaves it
  aiPlayer.render({ run: shownRun() && appv.run === shownRun() ? appv.run : null, kind: appv.kind, url: appv.url, live: now.shown === 'live' && !now.empty && appv.mode === 'preview' })
  playClip()
  appEls.preview.hidden = appv.mode !== 'preview'
  appEls.code.hidden = appv.mode !== 'code'
  appEls.shell.classList.toggle('dev', !!appv.w)
  appEls.shell.style.width = appv.w ? `${appv.w}px` : '100%'
  if (appv.mode === 'code') renderCode()
}

// A game being built: its whole art plan as one sheet, each picture landing in its cell as the
// crew paints it, the cell being painted showing who is on it. Read again every 4 s while shown.
// A game's art plan is read once when the room opens (it decides whether the switch offers Art), then again
// every 4 s while the build works or the sheet is on screen.
function sheetLoad(run, live) {
  if (sheetv.run !== run) Object.assign(sheetv, { run, data: null, t: 0 })
  if (sheetv.busy || (sheetv.t && !(live && Date.now() - sheetv.t > 4000))) return
  sheetv.busy = true
  api(`/api/runs/${encodeURIComponent(run)}/assets`).then(r => (r.ok ? r.json() : null)).then(d => { if (sheetv.run === run && d) sheetv.data = d }).catch(() => {})
    .finally(() => { sheetv.busy = false; sheetv.t = Date.now(); if (sheetv.run === run && view === 'app') renderApp() })
}
// The stage now (web/canvas/stage.js): which views the switch offers, which one shows, and the pin, dropped
// here once its view is gone. The wall (web/canvas/dock.js codeWall) hides itself unless the crew is shown.
const stageBuild = () => ({ working: appv.state === 'working' && appv.run === shownRun(), state: appv.state, kind: appv.kind, hasApp: !!appv.hasApp, url: appv.url, canServe: !!appv.canServe, opening: !!appv.opening, openFailed: !!appv.openFailed || needsRun(), steps: appv.steps.length, painted: sheetv.run === appv.run ? (sheetv.data?.sheet || []).filter(c => c.src).length : 0 })
export function stageOf() {
  const now = stageNow(stageBuild(), stagePin.v)
  stagePin.v = now.pin
  return now
}
// Preview or Code: the stage's views live in Preview
function appMode(m) {
  appv.mode = m
  for (const x of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#app-mode button'))) x.classList.toggle('on', x.dataset.mode === m)
  if (m === 'code') appv.files = null
}
/** Pin a view (or null: follow the build again) and show it.  @param {import('./stage.js').StageView | null} v */
function stageSet(v) {
  stagePin.v = v
  // Live, asked for: if the app has to be started and cannot be, the chat says why
  if (v === 'live' && !appv.url) appv.openSay = true
  if (appv.mode !== 'preview') appMode('preview')
  renderApp()
}
// The switch, typed in the chat: "show the crew", "show the art", "show the game", "follow the build". A message
// that is one of these is answered here and never reaches the builder.
export function stageSay(text) {
  // Autoplay, typed: "play it for me", "stop playing"
  if (view === 'app' && shownRun() && aiPlayer.say(text)) return true
  const want = view === 'app' && shownRun() ? stageAsk(text) : null
  if (!want) return false
  feed(null, text, 'you')
  if (want === 'follow') stageSet(null)
  // the game or the app: started again if its server stopped (the "Starting" skeleton), or the chat says why not
  else if (want === 'live') playLive()
  else if (stageOf().offers.includes(want)) stageSet(want)
  else botMsg(stageNone(want, stageBuild()))
  return true
}
function artSheet() {
  const working = appv.state === 'working', mid = working || !appv.hasApp
  const cells = sheetv.data?.sheet || []
  const done = cells.filter(c => c.src).length
  const next = mid ? cells.find(c => !c.src) : null
  const last = mid ? appv.steps[appv.steps.length - 1]?.text || appv.stage || '' : ''
  const head = !mid ? `The art · ${done}/${cells.length}` : !cells.length ? 'Building the game' : done < cells.length ? `Painting the art · ${done}/${cells.length}` : 'Building the game'
  const cell = c => {
    const on = c === next
    const who = on ? painterOf(c.id) : ''
    return `<figure class="as-cell ${c.aspect || 'square'}${c.src ? ' done' : on ? ' on' : ''}">${c.src ? `<img src="${esc(BASE + c.src)}" alt="" loading="lazy">` : on ? `<span class="as-bot">${cursor(who)}</span>` : ''}<figcaption>${esc(c.name)}</figcaption></figure>`
  }
  appEls.empty.innerHTML = `<div class="art-sheet"><h2>${esc(head)}</h2>${last ? `<p class="as-line">${esc(last)}</p>` : ''}<div class="as-grid">${cells.map(cell).join('')}</div></div>`
  appEls.empty.classList.add('sheet')
  // the sheet scrolls: it takes the keyboard
  appEls.empty.tabIndex = 0
  appEls.empty.setAttribute('role', 'region')
  appEls.empty.setAttribute('aria-label', 'Art')
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

// @ts-ignore
for (const b of document.querySelectorAll('#app-mode button')) b.onclick = () => {
  // @ts-ignore
  appMode(b.dataset.mode)
  renderApp()
}
// @ts-ignore
for (const b of document.querySelectorAll('#app-device button')) b.onclick = () => {
  // @ts-ignore
  appv.w = Number(b.dataset.w)
  for (const x of document.querySelectorAll('#app-device button')) x.classList.toggle('on', x === b)
  renderApp()
}
$('#app-reload').onclick = () => { if (appv.url) loadFrame() }
// the steps column folds away, and stays folded the next time (this browser only)
const stepsMin = on => {
  appEls.view.classList.toggle('steps-min', on)
  const b = $('#app-steps-btn')
  b.setAttribute('aria-pressed', String(on))
  b.setAttribute('aria-label', on ? 'Show the steps' : 'Hide the steps')
  try { localStorage.setItem('swarm-steps-min', on ? '1' : '') } catch {}
}
try { if (localStorage.getItem('swarm-steps-min')) stepsMin(true) } catch {}
$('#app-steps-btn').onclick = () => stepsMin(!appEls.view.classList.contains('steps-min'))
appEls.stop.onclick = () => (rec.on ? void stopReplay({ any: true }) : appApi('/stop', {}).catch(() => {}))

// The first build of the app, or one more change to it.
export async function appAsk(ask, extra = {}) {
  // a replay is only a recording: it ends before anything is asked of the real crew
  if (rec.on) await stopReplay({ any: true, stay: true })
  const run = shownRun()
  if (!run) return botMsg('Open a build first: the app is made from its design.')
  if (appv.run !== run) resetApp(run)
  if (view !== 'app') setView('app')
  // while it builds, the crew still listens: a question gets an answer from what it is doing,
  // a change is queued for the start of the next stage
  if (appv.state === 'working') return tellCrew(ask)
  if (fixedIn()) return botMsg('This one was brought in as plain files. It plays here and its code is in Code; the crew cannot change it yet.')
  if (appv.intake && !ask) return
  // the chat works for a stopped build too: "go on", "continue", "resume" pick it up again; anything else gets a true answer
  if (ask && !appv.hasApp) { if (!goOnAsk(ask, appv)) return botMsg(noAppYet(appv)); ask = '' }
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

async function tellCrew(text) {
  const t = String(text || '').trim()
  if (!t) return botMsg('The crew is building. Ask what it is doing, or say what to change next.')
  feed(null, t, 'you')
  // a question to one of the crew by name ("Pip, what are you on?"): their window answers on the wall
  const names = cw.el && !cw.el.hidden ? wallNames() : []
  const k = names.findIndex(([n]) => n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t))
  const who = k >= 0 ? names[k][0] : ''
  const on = k < 0 ? '' : k === CW_CODE ? `writing ${cw.tiles[k]?.path || 'code'}` : cw.mode === 'art' ? `painting ${paintv.slots[k]?.what || 'art'}` : k === 0 ? 'the play test window' : `the picture ${cw.av[k]?.name || ''}`.trim()
  cwSay(k, who ? '…' : '', true)
  // Talk looks things up before it answers (files, pictures), which can take a few seconds
  const wait = botMsg('…', true)
  try {
    const r = await appApi('/tell', { text: t, ...(who ? { who, on } : {}) }).finally(() => wait.remove())
    const answer = r.answer || (r.queued ? 'Got it: that goes to the crew at the start of the next slice.' : 'The crew is working.')
    cwSay(k, answer)
    const item = botMsg(who ? `${who}: ${answer}` : answer)
    if (r.media) item.append(mediaBlock(r.media))
    if (r.proposal) item.append(changeBlock(r.proposal))
  } catch (err) { cwSay(k, ''); botMsg(`App: ${err.message}`) }
}
// a change Talk wrote out for the builder: sent only when the person confirms it, at the next
// slice, or now (the builder's turn stops and the slice starts again with it)
function changeBlock(p) {
  const box = document.createElement('div')
  box.className = 'tell-change'
  const q = document.createElement('p')
  q.textContent = p.change
  const row = document.createElement('div')
  const btn = (label, now) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.onclick = async () => {
      // @ts-ignore
      for (const x of row.children) x.disabled = true
      // @ts-ignore
      try { const r = await appApi('/tell', { confirm: p.change, now }); box.classList.add('sent'); botMsg(r.answer) } catch (err) { for (const x of row.children) x.disabled = false; botMsg(`App: ${err.message}`) }
    }
    return b
  }
  const next = btn('Next slice', false), now = btn('Now', true)
  ;(p.now ? now : next).classList.add('main')
  row.append(...(p.now ? [now, next] : [next, now]))
  box.append(q, row)
  return box
}
// what Hermia shows when asked to see the build: the newest play test clip and pictures
export function mediaBlock(m) {
  const box = document.createElement('div')
  box.className = 'tell-media'
  if (m.clip) {
    const v = document.createElement('video')
    Object.assign(v, { muted: true, loop: true, playsInline: true })
    box.append(boardVideo(v, { src: BASE + m.clip, auto: true }))
  }
  for (const p of (m.pics || []).slice(0, 4)) {
    const i = document.createElement('img')
    Object.assign(i, { src: BASE + p.src, alt: p.name || '', loading: 'lazy' })
    box.append(i)
  }
  return box
}
// a crew member's answer, said in their own window for a while (k -1: over the wall's title)
function cwSay(k, words, thinking = false) {
  const host = k >= 0 ? cw.el?.querySelector('.cw-grid')?.children[k] : cw.el?.querySelector('.cw-head')
  if (!host) return
  let b = host.querySelector(':scope > .cw-say')
  // with the chat column open the answer is already there: it is not said a second time over the wall
  if (!words || (!thinking && document.body.classList.contains('cosmos-chat'))) { b?.remove(); return }
  if (!b) { b = document.createElement('p'); b.className = 'cw-say'; host.append(b) }
  b.classList.toggle('thinking', thinking)
  setText(b, words)
  clearTimeout(b._t)
  if (!thinking) b._t = setTimeout(() => b.remove(), 14000)
}

// ---------- a big game, slice by slice, in the chat
// After each slice the build waits: Hermia shows what the bots played (their filmed run and a
// still), points at the live game in the App view, and asks what to change. A suggestion or
// the person's own words start the next slice with that note.
function sliceCard(s, run = shownRun()) {
  if (!s || !run) return
  const key = `${run}:${s.i}:${s.clip || ''}`
  if (els.feed.querySelector(`.slice-card[data-key="${CSS.escape(key)}"]`)) return
  const item = document.createElement('div')
  item.className = 'item bot slice-card'
  item.dataset.key = key
  item.dataset.run = run
  item.dataset.i = s.i
  const vid = s.clip ? `<video class="sc-clip" data-src="${esc(BASE + s.clip)}" data-auto muted playsinline loop></video>` : ''
  const pic = s.shot ? `<img class="sc-shot" src="${esc(BASE + s.shot)}" alt="">` : ''
  item.innerHTML = `<b>${HERMIA}Hermia<small>slice ${s.i + 1} of ${s.n}</small></b>`
    + `<div class="sc-media">${vid || pic}${vid && pic ? pic : ''}</div>`
    + `<span class="txt"></span>`
    + `<button class="sc-live">${ico('play')}<span>Play it live</span></button>`
    + `<div class="sc-ideas">${(s.ideas || []).map((t, j) => `<button data-j="${j}">${esc(t)}</button>`).join('')}</div>`
  adoptVideos(item)
  item.querySelector('.txt').textContent = s.ask || `Slice ${s.i + 1} is built. Anything to change?`
  // @ts-ignore
  item.querySelector('.sc-live').onclick = () => (run === shownRun() ? playLive() : setView('app'))
  // @ts-ignore
  for (const b of item.querySelectorAll('.sc-ideas button')) b.onclick = () => sliceGo(s.ideas[+b.dataset.j])
  push(els.feed, item)
}
// The hero's idle from a video clip (engine/idle.mjs), in the chat: Hermia asks once with the
// clip's price on the button, then the same card shows the first frame, the clip and the loop
// as they come in. One card per build, updated in place (a reopened build shows where it got to).
export function idleCard(e) {
  if (!e.run) return
  let item = els.feed.querySelector(`.idle-card[data-run="${CSS.escape(e.run)}"]`)
  if (!item) {
    item = document.createElement('div')
    item.className = 'item bot idle-card'
    item.dataset.run = e.run
    item.innerHTML = `<b>${HERMIA}Hermia<small>idle</small></b><div class="ic-media"></div><span class="txt"></span><div class="ic-acts"></div>`
    push(els.feed, item)
  }
  item.dataset.state = e.state
  item.querySelector('.txt').textContent = e.text || ''
  const media = item.querySelector('.ic-media'), acts = item.querySelector('.ic-acts')
  acts.replaceChildren()
  const show = (kind, src) => {
    if (!src) return
    let el = media.querySelector(`.ic-${kind}`)
    if (!el) {
      el = document.createElement(kind === 'clip' ? 'video' : 'img')
      el.className = `ic-${kind}`
      if (kind === 'clip') Object.assign(el, { muted: true, autoplay: true, loop: true, playsInline: true })
      else el.alt = ''
      media.append(el)
    }
    if (el.dataset.src !== src) { el.dataset.src = src; el.src = BASE + src }
  }
  // the first frame while the model works, then the clip in its place, then the loop beside it
  // (the keys route: the painted keyframes while the in-betweener works)
  if (e.state === 'making' || e.state === 'tween') { media.querySelector('.ic-start')?.replaceWith(); show('start', e.start) }
  if (e.clip) { media.querySelector('.ic-start')?.replaceWith(); show('clip', e.clip) }
  if (e.sheet) show('sheet', e.sheet)
  if (e.state !== 'ask') return
  // the video models Hermes offers, the picked one first: the button carries the chosen one's price
  const options = e.options?.length ? e.options : [{ id: e.option, by: e.by, usd: e.usd, line: e.line }]
  let pick = options[0]
  const go = document.createElement('button')
  go.className = 'primary'
  const no = document.createElement('button')
  no.textContent = e.keys ? 'No clip' : 'Keep painted'
  const line = document.createElement('small')
  line.className = 'ic-line'
  const set = o => { pick = o; go.textContent = `Animate · $${Number(o.usd).toFixed(2)}`; line.textContent = o.line || '' }
  set(pick)
  let model = null
  if (options.length > 1) {
    model = document.createElement('select')
    model.className = 'ic-model'
    model.setAttribute('aria-label', 'Video model')
    for (const o of options) model.append(new Option(o.by, o.id))
    model.onchange = () => set(options.find(o => o.id === model.value) || options[0])
  }
  const answer = ok => {
    go.disabled = no.disabled = true
    if (model) model.disabled = true
    api(`/api/runs/${encodeURIComponent(e.run)}/app/idle`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok, usd: pick.usd, option: pick.id }) })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`) })
      .catch(err => { item.querySelector('.txt').textContent = `⚠ ${err.message}`; go.disabled = no.disabled = false; if (model) model.disabled = false })
  }
  go.onclick = () => answer(true)
  no.onclick = () => answer(false)
  acts.append(...(model ? [model] : []), go, no, line)
}
export async function sliceGo(text) {
  const s = appv.slice
  if (appv.state !== 'paused' || !s) return botMsg('The game is not waiting on a slice right now.')
  // the first suggestion is "go on": no note, the next slice as planned
  const note = /^looks good/i.test(text) ? '' : String(text || '').trim()
  feed(null, text, 'you')
  for (const c of els.feed.querySelectorAll('.slice-card .sc-ideas')) c.remove()
  await appAsk('', note ? { note } : {})
}

// ---------- the app advisor
// Before a site becomes a working app, Hermia reads its pages and asks, in the
// chat, what the business needs behind it (users, what gets saved, dashboards,
// a CRM, an admin panel). Each question comes with her recommended answer; the
// answers become an app plan to tick through, and the plan becomes dyad's brief.
/** @type {any} */
const adv = dataStore('advisor', { run: null, qs: [], i: 0, qa: [], busy: false }).state
function advMsg(html, cls = '') {
  const item = document.createElement('div')
  item.className = `item bot adv ${cls}`
  item.innerHTML = `<b>${HERMIA}Hermia<small>advisor</small></b><div class="txt">${html}</div>`
  push(els.feed, item)
  return item
}
function advOpen(on) {
  document.body.classList.toggle('advising', on)
  if (on) { document.body.classList.add('cosmos-chat'); showTab('chat') }
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
  // @ts-ignore
  for (const b of card.querySelectorAll('.adv-opt')) b.onclick = () => {
    // @ts-ignore
    const o = b.dataset.o
    if (q.multi) picks.has(o) ? picks.delete(o) : picks.add(o)
    else { picks.clear(); picks.add(o) }
    // @ts-ignore
    for (const x of card.querySelectorAll('.adv-opt')) x.setAttribute('aria-pressed', picks.has(x.dataset.o))
  }
  const own = card.querySelector('.adv-own')
  const answer = () => {
    const a = [...picks]
    // @ts-ignore
    if (own.value.trim()) a.push(own.value.trim())
    card.classList.add('done')
    card.querySelector('.adv-go').remove(); own.remove()
    // @ts-ignore
    for (const x of card.querySelectorAll('.adv-opt')) x.disabled = true
    adv.qa.push({ q: q.q, a })
    adv.i++
  }
  // @ts-ignore
  own.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); card.querySelector('.adv-next').click() } }
  // @ts-ignore
  card.querySelector('.adv-next').onclick = () => { answer(); advAsk() }
  const all = card.querySelector('.adv-all')
  // @ts-ignore
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
  // @ts-ignore
  card.querySelector('.adv-again').onclick = () => { card.classList.add('done'); card.querySelector('.adv-go').remove(); adv.busy = false; openAdvisor() }
  // @ts-ignore
  card.querySelector('.adv-next').onclick = () => {
    // @ts-ignore
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
export const buildApp = () => (appv.kind !== 'game' && !appv.hasApp && !appv.plan ? openAdvisor() : appAsk('', appv.plan ? { plan: appv.plan } : {}))

// The image model ran out before any art landed: say which, offer the other image models
// Hermes has signed in, and building with shapes drawn in code.
function artStopCard(stop) {
  // @ts-ignore
  if (!modelsInfo?.image && !artStopCard.asked) { artStopCard.asked = true; loadModels().then(() => renderApp()) }
  const others = (modelsInfo?.image?.providers || []).filter(p => p.available && p.provider !== stop.provider)
  return `<div class="fail-card"><span class="fail-ico">${ico('image')}</span><h2>No <em>art</em></h2>`
    + `<p class="fail-msg">${esc(stop.model)} is out of quota</p>`
    + (others.length ? `<div class="fail-pick" role="group" aria-label="Image model">${others.map(p => `<button class="fail-model" data-image="${esc(p.provider)}" data-model="${esc(p.default || '')}">${esc(p.provider)}</button>`).join('')}</div>` : '')
    + `<div class="fail-acts"><button class="big" data-build>${ico('rotate-ccw')}Try again</button><button class="fail-alt" data-incode>Draw in code</button></div></div>`
}
// what a stopped build had done: its pictures and its stages
function stopSummary() {
  const steps = appv.steps || [], art = artPhase(steps)
  const painted = steps.filter(s => /^painted the /.test(s.text || '')).length
  const stage = steps.findLast(s => /^stage \d+ of/.test(s.text || ''))?.text.match(/^stage (\d+ of \d+)/)?.[1]
  return [painted || art ? `${painted}${art?.total ? `/${art.total}` : ''} pictures` : '', stage ? `stage ${stage}` : ''].filter(Boolean).join(' · ') || 'nothing built yet'
}

export async function deployApp() {
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

export function appEvent(e) {
  if (e.run !== shownRun()) return
  if (e.type === 'autoplay') return aiPlayer.event(e)
  if (appv.run !== e.run) resetApp(e.run)
  const fresh_ = !e.t || Date.now() - e.t < 8000
  // a replayed event is stamped now, but its address is the recording's: a server long gone, never shown
  const real = fresh_ && !rec.on
  if (e.type === 'app:start') {
    Object.assign(appv, { state: 'working', kind: e.kind || appv.kind, stage: 'starting', message: '' })
    stagePin.v = null // a new build: the stage follows it again
    // a build from scratch: the painters' tiles from an earlier build (another game's art) go
    if (e.fresh) paintv.slots = []
    if (e.ask && appv.asks.at(-1) !== e.ask) appv.asks.push(e.ask)
    appv.steps.push({ kind: 'ask', text: e.ask || 'build', t: e.t })
    if (fresh_) feed(null, `🧩 ${e.model || 'the engine'} is ${e.fresh ? `building the ${e.kind === 'game' ? 'game' : 'app'}` : 'changing the app'}${e.ask ? `: “${e.ask}”` : ''}`, 'sys')
  } else if (e.type === 'app:step') {
    appv.steps.push(e.step)
    if (e.step.kind !== 'write' && e.step.kind !== 'think') appv.stage = e.step.text
    { const m = /^stage (\d+) of (\d+)/.exec(e.step.text || ''); if (m) appv.at = [+m[1], +m[2]] }
    if (e.step.kind === 'write') appv.files = null
  } else if (e.type === 'app:ready') {
    // only a live event: an old one from the log names a dev server that may be gone
    if (real) appv.url = e.url
    // served built now, on the same address: the frame loads it again
    if (real && e.built) appEls.frame.dataset.src = ''
  } else if (e.type === 'app:parked') {
    // its server stopped (no viewer for a while, or room for another app): open again when it is looked at
    appv.url = null
    appEls.frame.dataset.src = ''
    if (view === 'app' && !document.hidden) loadApp()
  } else if (e.type === 'app:done') {
    Object.assign(appv, { state: 'done', result: e.result, hasApp: true, stage: 'ready' })
    if (e.url && real) appv.url = e.url
    appEls.frame.dataset.src = '' // reload to the new build
    // brought in: no engine turned, so nothing to count; the room reads what came (its shape, its page)
    if (e.intake) { if (fresh_ && view === 'app') loadApp() } else
    if (fresh_) feed(null, `🧩 the ${appv.kind === 'game' ? 'game' : 'app'} is ready (${e.result?.turns || 1} turn${e.result?.turns === 1 ? '' : 's'}, checks ${e.result?.gatesPassed ? 'passed' : 'not passed'}, ${Math.round((e.ms || 0) / 1000)}s). Open the App view to try it, or chat to change it.`, 'sys')
  } else if (e.type === 'app:paused') {
    // a big game stops after each slice and asks in the chat (sliceCard)
    Object.assign(appv, { state: 'paused', result: e.result, slice: e.slice, stage: '' })
    if (e.url && real) appv.url = e.url
    sliceCard(e.slice, e.run)
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
/** @type {any} */
export const game = dataStore('game', { el: null, questions: null, i: 0, answers: {}, idea: '', spec: null, busy: false, cast: null }).state
export async function openGame(idea = '', answers = null, build = false) {
  // @ts-ignore
  if (!game.questions?.length) game.questions = (await api('/api/game').then(r => r.ok ? r.json() : {}).catch(() => ({}))).questions || []
  // a site build is open: the game can be its promo game, in its world and colours
  const site = S.kind !== 'game' && S.layers.size ? shownRun() : null
  Object.assign(game, { i: 0, answers: answers || {}, idea: String(idea || '').trim(), spec: null, busy: false, cast: null, from: site, brand: site ? (S.title || 'this site') : '', promo: !!site })
  game.el?.remove()
  game.el = document.createElement('div')
  game.el.className = 'game-pop'
  document.body.append(game.el)
  $('#game-btn').classList.add('on')
  // closes with ×, Esc and a click outside it, except while the spec is being written
  game.off?.()
  game.off = window.SwarmUI?.layer(game.el, closeGame, { extra: [$('#game-btn')], canClose: () => !game.busy })
  if (answers || build) return gameSpec(build)
  // an unfinished Shape it walk can be picked up from here
  game.resume = (await api('/api/workshops').then(r => (r.ok ? r.json() : null)).catch(() => null))?.workshops?.[0] || null
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
  } else if (game.spec && game.cast?.open) {
    renderCast(el, head)
    return
  } else if (game.spec) {
    const s = game.spec, list = gameList
    const rows = [['Setting', s.setting], ['Hero', s.hero], ['Enemies', list(s.enemies)], ['Loop', s.loop], ['Progression', s.progression], ['Controls', s.controls], ['Win', s.win], ['Lose', s.lose], ['Look', s.look], ['Sound', s.sound], ['Engine', s.engine]]
    el.innerHTML = `${head}<div class="gspec"><h2 contenteditable="true" data-k="title">${esc(s.title)}</h2><p class="gpitch" contenteditable="true" data-k="pitch">${esc(s.pitch || '')}</p>${s.brand ? `<p class="gorig">🎮 A promo game for ${esc(s.brand.name)}, in its colours${s.brand.url ? `, linking to ${esc(s.brand.url)}` : ''}</p>${s.brand.url ? '' : `<button class="glink gonline" data-online>Put ${esc(s.brand.name)} online first</button>`}` : ''}${s.answers?.like && !/nothing/i.test(s.answers.like) ? `<p class="gorig">Feel of ${esc(s.answers.like)}, original world: ${esc(s.original || '')}</p>` : ''}<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd ${k === 'Engine' ? '' : `contenteditable="true" data-k="${k.toLowerCase()}"`}>${esc(v || '')}</dd>`).join('')}</dl><small>Click any line to change it.</small></div><div class="gfoot"><button class="glink" data-redo>← Change answers</button><span><button class="glink" data-shape>Shape it</button><button class="big" data-build>Build the game</button></span></div>`
    el.querySelector('[data-redo]').onclick = () => { game.spec = null; game.i = 0; renderGame() }
    el.querySelector('[data-build]').onclick = () => (game.cast && !game.cast.done ? openCast() : gameBuild())
    el.querySelector('[data-shape]').onclick = () => gameShape()
    el.querySelector('[data-online]')?.addEventListener('click', () => gameOnline())
  } else {
    const val = game.answers[q.id] || ''
    const W = game.i === 0 && game.resume
    const STEPN = ['design', 'story', 'world', 'heroes', 'enemies', 'levels', 'sound']
    el.innerHTML = `${head}${W ? `<button class="gresume" data-resume>${ico('rotate-ccw')}<span>Continue <b>${esc(W.title || 'the game')}</b></span><em>${Math.max(1, STEPN.indexOf(W.step) + 1)}/7</em></button>` : ''}<div class="gdots">${dots}</div>${game.i === 0 && game.from ? `<label class="gpromo"><input type="checkbox" ${game.promo ? 'checked' : ''}><span>A promo game for <b>${esc(game.brand)}</b>: set in its world, in its colours, with a button back to it</span></label>` : ''}${game.i === 0 ? `<input class="gidea" placeholder="Your idea in a line (optional): “a neon spirit eating its way through a night market”" value="${esc(game.idea)}">` : ''}<h3>${esc(q.q)}</h3><div class="gchips">${q.chips.map(c => `<button class="${val === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div><input class="gfree" placeholder="…or in your own words" value="${q.chips.includes(val) ? '' : esc(val)}"><div class="gfoot">${game.i ? '<button class="glink" data-back>← Back</button>' : '<span></span>'}<span><button class="glink" data-skip>Just build it</button><button class="big" data-next>${game.i === qs.length - 1 ? 'Write the spec' : 'Next'}</button></span></div>`
    const free = el.querySelector('.gfree')
    const take = v => { if (v) game.answers[q.id] = v; else delete game.answers[q.id] }
    const next = () => { take(free.value.trim() || game.answers[q.id]); if (game.i < qs.length - 1) { game.i++; renderGame() } else gameSpec() }
    for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { take(b.dataset.c); free.value = ''; next() }
    free.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next() } }
    el.querySelector('.gidea')?.addEventListener('input', e => { game.idea = e.target.value })
    el.querySelector('.gpromo input')?.addEventListener('change', e => { game.promo = e.target.checked })
    el.querySelector('[data-next]').onclick = next
    el.querySelector('[data-resume]')?.addEventListener('click', () => {
      const id = game.resume.id
      closeGame()
      // @ts-ignore
      openWorkshop({ api, ico, id, onBuilt: async (run, built) => { await loadFiles(); await openRun(run); setView('app'); botMsg(`🎮 Building “${built?.title || 'the game'}” with the art, story, levels and sound you picked.`) } })
    })
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
    // a 3D game with people in it: cast from real models before the build
    game.cast = out.cast?.roles?.length ? { ...out.cast, role: 0, lists: {}, picks: {}, open: false, done: false, sel: null } : null
  } catch (err) {
    game.busy = false
    botMsg(`Game: ${err.message}`)
    return renderGame()
  }
  game.busy = false
  if (build) return gameBuild()
  renderGame()
}

// ---------- 🎭 cast from real models (spec 19)
// A numbered picture shortlist per role, from VRoid Hub and Sketchfab, licence
// checked by the server. At rest a card is its picture and name; the open card
// shows the creator and the licence. One pick per role, then the build.
function readSpecEdits() {
  for (const x of game.el?.querySelectorAll('[data-k]') || []) {
    const k = x.dataset.k, v = x.textContent.trim()
    if (k === 'enemies') { if (v !== gameList(game.spec.enemies)) game.spec.enemies = v.split(/\s*,\s*/).filter(Boolean) }
    else if (v) game.spec[k] = v
  }
}
function openCast() {
  readSpecEdits()
  game.cast.open = true
  renderGame()
  castSearch()
  ownArt()
}
// ---------- 🧊 the project's own art as a character (spec 20): made with Meshy when a key is set,
// else the art itself as a 2.5D sprite. Meshy spends credits: the price is on the button.
async function ownArt() {
  const c = game.cast
  if (c.meshy) return
  c.meshy = { art: [] }
  c.own = c.own || {}
  const out = await api(`/api/meshy?from=${encodeURIComponent(castFrom())}`).then(r => r.json()).catch(() => ({}))
  c.meshy = { ready: !!out.ready, cost: out.cost?.credits || 0, art: [...new Set([...(out.art || []).map(a => a.src), ...Object.values(c.own).map(o => o.art)])] }
  // each role starts on its own picture (people first), not all on the first one
  c.roles.forEach((r, i) => { if (c.meshy.art.length) c.own[r.id] ||= { art: c.meshy.art[i % c.meshy.art.length], job: null } })
  if (game.cast === c) renderGame()
}
const castFrom = () => game.spec?.brand?.from || game.from || ''

// Pictures the person adds (picked or dropped): each one becomes a role, named from its file
// ("00a-messenger.png" -> Messenger), with that picture as its art.
const roleLabel = name => String(name).replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[a-z]?[-_ ]+/i, '').replace(/[-_]+/g, ' ').trim().replace(/^./, ch => ch.toUpperCase()) || 'Character'
async function castAdd(files) {
  const c = game.cast
  const pics = [...files].filter(f => /^image\/(png|jpeg|webp)$/.test(f.type)).slice(0, 16)
  if (!pics.length || !castFrom()) return
  c.adding = pics.length
  renderGame()
  for (const f of pics) {
    const data = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(''); fr.readAsDataURL(f) })
    const out = data ? await api('/api/meshy/art', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: castFrom(), name: f.name, data }) }).then(r => r.json()).catch(() => ({})) : {}
    c.adding--
    if (!out.src) { botMsg(`Cast: ${f.name}: ${out.error || 'not added'}`); continue }
    let id = out.role, n = 2
    while (c.roles.some(r => r.id === id)) id = `${out.role}-${n++}`
    c.roles.push({ id, label: roleLabel(f.name), name: roleLabel(f.name) })
    c.own[id] = { art: out.src, job: null }
    if (!c.meshy.art.includes(out.src)) c.meshy.art.push(out.src)
    if (c.roles.length === 1) c.role = 0
    if (game.cast === c) renderGame()
  }
  c.adding = 0
  if (game.cast === c) renderGame()
}

// ---------- the bench: every Meshy job of this cast, each worked by its own crew member
const castJobs = (c = game.cast) => (c?.roles || []).map((r, i) => ({ r, i, o: c.own?.[r.id] })).filter(x => x.o?.job)
const makingJobs = c => castJobs(c).filter(x => x.o.job.state === 'running')
// the ones a crew member is working right now (the rest wait in line, their worker's mark on the tile)
export const workedJobs = c => makingJobs(c).filter(x => x.o.job.stage !== 'queued')
// the roles "Make all" would make: a picture, nothing made or being made
const makeable = c => (c.meshy?.ready ? c.roles.filter(r => c.own?.[r.id]?.art && !['running', 'done'].includes(c.own[r.id].job?.state)) : [])
async function meshyMake(r) {
  const c = game.cast, o = c.own[r.id]
  o.job = { state: 'running', stage: 'queued', progress: 0, worker: 'Pebble' }
  renderGame()
  const job = await api('/api/meshy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: r.id, label: r.label, art: o.art, credits: c.meshy.cost }) }).then(x => x.json()).catch(err => ({ error: err.message }))
  o.job = job.id ? job : { state: 'failed', error: job.error || 'Meshy did not start' }
  meshyPoll(c)
}
// Make all: one click, one price for every role on the button, and the server checks that total
async function meshyAll() {
  const c = game.cast, roles = makeable(c)
  if (roles.length < 2) return
  for (const r of roles) c.own[r.id].job = { state: 'running', stage: 'queued', progress: 0, worker: '' }
  renderGame()
  const out = await api('/api/meshy/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: roles.map(r => ({ role: r.id, label: r.label, art: c.own[r.id].art })), credits: roles.length * c.meshy.cost }) }).then(x => x.json()).catch(err => ({ error: err.message }))
  for (const r of roles) c.own[r.id].job = out.jobs?.find(j => j.role === r.id.replace(/[^\w-]/g, '').slice(0, 40)) || { state: 'failed', error: out.error || 'Meshy did not start' }
  meshyPoll(c)
}
// one poll for every job; the bench is patched in place, the step re-drawn only when a job ends
async function meshyPoll(c) {
  if (c.polling) return
  c.polling = true
  if (game.cast === c) renderGame()
  while (game.cast === c && makingJobs(c).length) {
    await new Promise(res => setTimeout(res, 2500))
    let ended = false
    await Promise.all(makingJobs(c).map(async ({ o }) => {
      if (!o.job.id) return
      const j = await api(`/api/meshy/job?id=${o.job.id}`).then(x => (x.ok ? x.json() : null)).catch(() => null)
      if (!j) return
      if (j.state !== 'running') { ended = true; j.endedAt = Date.now() }
      if (j.stage !== o.job.stage) j.stageAt = Date.now()
      else j.stageAt = o.job.stageAt
      o.job = j
    }))
    if (game.cast !== c) break
    if (ended) renderGame()
    else benchPatch()
  }
  c.polling = false
}

// Pictures on the bench are small copies (256 px at most, webp, web/ui.js), made once and kept:
// never the full-size art. Until a copy is ready the tile shows nothing rather than the big picture.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
function small(src, max = 256) {
  // @ts-ignore
  const ready = url => { for (const img of document.querySelectorAll('img[data-small]')) if (img.dataset.small === src && Number(img.dataset.max || 256) === max) img.src = url }
  return window.SwarmUI?.small ? window.SwarmUI.small(src, max, { ready }) || BLANK : src || BLANK
}
const smallImg = (src, max = 256, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${esc(small(src, max))}" data-small="${esc(src)}" data-max="${max}" alt="" loading="lazy" decoding="async">`

const STAGE_WORD = { queued: 'waiting', model: 'sculpting', rig: 'rigging', download: 'carrying' }
// A clay figure under a turning wire mesh; bones for the rig. Small SVG, transform and opacity only.
const WIRE = '<svg class="fg-wire" viewBox="0 0 60 100" aria-hidden="true"><g class="fg-lat"><ellipse cx="30" cy="16" rx="11" ry="3"/><ellipse cx="30" cy="36" rx="16" ry="4"/><ellipse cx="30" cy="56" rx="14" ry="4"/><ellipse cx="30" cy="78" rx="12" ry="3.5"/></g><g class="fg-mer"><ellipse cx="30" cy="16" rx="11" ry="11"/><ellipse cx="30" cy="57" rx="16" ry="38"/></g><g class="fg-mer b"><ellipse cx="30" cy="16" rx="11" ry="11"/><ellipse cx="30" cy="57" rx="16" ry="38"/></g></svg>'
// joints in the 60x100 box: head, neck, shoulders, elbows, hands, hips, knees, feet
const JOINTS = [[30, 14], [30, 27], [19, 31], [41, 31], [14, 46], [46, 46], [12, 60], [48, 60], [30, 52], [24, 56], [36, 56], [23, 74], [37, 74], [22, 92], [38, 92]]
const BONES = [[0, 1], [1, 8], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [8, 9], [8, 10], [9, 11], [10, 12], [11, 13], [12, 14]]
const RIG = `<svg class="fg-bones" viewBox="0 0 60 100" aria-hidden="true">${BONES.map(([a, b], i) => `<line style="--i:${i}" x1="${JOINTS[a][0]}" y1="${JOINTS[a][1]}" x2="${JOINTS[b][0]}" y2="${JOINTS[b][1]}"/>`).join('')}${JOINTS.map(([x, y], i) => `<circle style="--i:${i}" cx="${x}" cy="${y}" r="1.8"/>`).join('')}</svg>`
function benchTile({ r, o }) {
  const j = o.job, p = Math.max(0, Math.min(100, Number(j.progress) || 0)) / 100
  const stage = j.state === 'failed' ? 'failed' : j.stage || 'queued'
  const ago = ((Date.now() - (j.stageAt || Date.now())) / 1000).toFixed(1)
  return `<button type="button" class="fg st-${stage}" role="listitem" data-job="${esc(j.id || r.id)}" data-role-id="${esc(r.id)}" style="--p:${stage === 'model' ? p : 1};--ago:-${ago}s" aria-label="${esc(r.label)}, ${esc(STAGE_WORD[stage] || 'failed')}"><span class="fg-stage">${WIRE}<span class="fg-fill"><span>${smallImg(o.art, 256, 'fg-clay')}</span></span>${RIG}${smallImg(o.art, 256, 'fg-made')}${stage === 'failed' ? '<span class="fg-warn" aria-hidden="true">⚠</span>' : ''}${stage === 'queued' && j.worker ? `<span class="fg-who" aria-hidden="true">${Crew.avatar(j.worker, 20)}</span>` : ''}</span><b>${esc(r.label)}</b></button>`
}
function benchHtml(c) {
  const jobs = castJobs(c)
  if (!jobs.length) return ''
  const work = jobs.filter(x => x.o.job.state !== 'done'), made = jobs.filter(x => x.o.job.state === 'done')
  const fresh = made.some(x => Date.now() - (x.o.job.endedAt || 0) < 1600)
  const lib = `<div class="fg-lib${fresh ? ' got' : ''}" role="group" aria-label="Model library, ${made.length}"><span class="fg-shelf">${ico('box')}<span class="t">${made.length}</span></span>${made.slice(-3).map(({ r, o }) => `<button type="button" data-role-id="${esc(r.id)}" aria-label="${esc(r.label)}">${smallImg(o.job.pick?.thumbSrc || o.art, 64)}</button>`).join('')}</div>`
  return `<div class="cforge"><div class="fg-row" role="list" aria-label="Making">${work.map(benchTile).join('')}</div>${lib}</div>`
}
// a poll patches the tiles in place, so their motion runs on without a restart
function benchPatch() {
  const box = game.el?.querySelector('.cforge'), c = game.cast
  if (!box || !c) return
  for (const x of castJobs(c)) {
    if (x.o.job.state !== 'running') continue
    const t = box.querySelector(`.fg[data-role-id="${CSS.escape(x.r.id)}"]`)
    if (!t) continue
    const st = `st-${x.o.job.stage || 'queued'}`
    if (!t.classList.contains(st)) { t.outerHTML = benchTile(x); continue }
    t.style.setProperty('--p', x.o.job.stage === 'model' ? String((Number(x.o.job.progress) || 0) / 100) : '1')
  }
  benchWatch()
}
// offscreen, the bench rests: its animations pause until it scrolls back into view
let benchSeen = null
function benchWatch() {
  const box = game.el?.querySelector('.cforge')
  if (!box || box.dataset.watched) return
  box.dataset.watched = '1'
  benchSeen?.disconnect()
  benchSeen = new IntersectionObserver(es => { for (const e of es) e.target.classList.toggle('rest', !e.isIntersecting) })
  benchSeen.observe(box)
}
// Where each job's crew member is: on its tile while it sculpts and rigs, then carrying the model
// to the library. One cursor per running job, the same names the server gave the jobs.
export function benchPin(i) {
  const x = workedJobs()[i]
  const box = game.el?.querySelector('.cforge')
  if (!x || !box || box.classList.contains('rest')) return null
  const t = box.querySelector(`.fg[data-role-id="${CSS.escape(x.r.id)}"] .fg-stage`)?.getBoundingClientRect()
  if (!t?.width) return null
  const now = performance.now(), j = x.o.job, stage = j.stage || 'queued', text = ''
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (stage === 'queued' || calm) return { x: t.right - 10, y: t.bottom - 14, text }
  if (stage === 'model') {
    // along the line where the clay is rising, side to side
    const p = Math.max(0.08, Math.min(0.95, (Number(j.progress) || 0) / 100))
    return { x: t.left + t.width * (0.5 + 0.32 * Math.sin(now / 900 + i * 1.7)), y: t.top + t.height * (1 - p), text, typing: true }
  }
  if (stage === 'rig') {
    // joint to joint, the way the bones go in
    const [jx, jy] = JOINTS[Math.floor(now / 1100 + i * 3) % JOINTS.length]
    return { x: t.left + t.width * jx / 60, y: t.top + t.height * jy / 100, text, typing: true }
  }
  // saving: pick the model up at the tile, carry it to the library, come back for the next part
  const lib = box.querySelector('.fg-shelf')?.getBoundingClientRect()
  const phase = (now / 3200 + i * 0.3) % 1
  if (!lib?.width || phase < 0.3) return { x: t.left + t.width / 2, y: t.top + t.height * 0.6, text, carry: null }
  return { x: lib.left + lib.width / 2, y: lib.top + lib.height / 2, text, carry: small(x.o.art, 256) }
}

async function castSearch() {
  const c = game.cast, r = c.roles[c.role]
  if (!r || c.lists[r.id] || c.only) return
  c.lists[r.id] = { busy: true, models: [] }
  try {
    const out = await api('/api/cast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: r, violent: c.violent }) }).then(x => x.json())
    c.lists[r.id] = { models: out.models || [], error: out.error || (out.models?.length ? '' : (out.errors || []).join(' · ')) }
  } catch (err) {
    c.lists[r.id] = { models: [], error: err.message }
  }
  if (game.cast === c) renderGame()
}
function renderCast(el, head) {
  const c = game.cast, r = c.roles[c.role]
  const addBtn = `<button class="glink cadd" data-add>${ico('plus')}<span class="t">Pictures</span></button><input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>`
  const foot = c.only ? `<div class="gfoot"><span></span><span>${c.adding ? '<div class="spin" aria-label="Adding"></div>' : ''}</span></div>`
    : `<div class="gfoot"><button class="glink" data-back>← Spec</button><span><button class="glink" data-skip>Skip</button><button class="big" data-build>Build the game</button></span></div>`
  if (!r) {
    // no roles yet (/cast on a build): the pictures the person adds become the cast
    el.innerHTML = `${head}<h3>Cast</h3><div class="gbody cdrop">${c.adding ? '<div class="spin" aria-label="Adding"></div>' : `<button class="big" data-add>${ico('image')}<span class="t">Add pictures</span></button><input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>`}</div>${foot}`
  } else {
    const list = c.only ? { models: [] } : c.lists[r.id] || { busy: true, models: [] }
    const pick = c.picks[r.id]
    const tabs = `<div class="gchips ctabs" role="tablist">${c.roles.map((x, i) => `<button role="tab" aria-selected="${i === c.role}" class="${i === c.role ? 'on' : ''}" data-role="${i}">${c.picks[x.id] ? ico('check') : ''}${esc(x.label)}</button>`).join('')}${addBtn}</div>`
    const sel = list.models.find(m => `${m.source}:${m.id}` === c.sel)
    const cards = list.busy ? '<div class="gbody"><div class="spin" aria-label="Searching"></div></div>'
      : list.models.length ? `<div class="cgrid">${list.models.map(m => {
        const k = `${m.source}:${m.id}`
        return `<button class="ccard${pick?.key === k ? ' on' : ''}${c.sel === k ? ' open' : ''}" data-pick="${esc(k)}" aria-label="${m.n}. ${esc(m.name)}"><span class="cn">${m.n}</span>${m.preview ? `<img src="${esc(m.preview)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<i></i>'}<b>${esc(m.name)}</b></button>`
      }).join('')}</div>`
      : c.only ? '' : `<div class="gbody"><span aria-hidden="true">⚠</span><span>${list.error ? 'No answer' : 'Nothing fits'}</span></div>`
    // the project's own art: one more card, first in the grid
    const m = c.meshy, o = m?.art.length ? (c.own[r.id] ||= { art: m.art[c.role % m.art.length], job: null }) : null
    const ownCard = o ? `<button class="ccard own${pick?.key === 'own' ? ' on' : ''}${c.sel === 'own' ? ' open' : ''}" data-own aria-label="${m.ready ? 'Meshy' : 'Sprite'}"><span class="cn">${ico(m.ready ? 'box' : 'image')}</span>${smallImg(o.job?.pick?.thumbSrc || o.art)}<b>${m.ready ? 'Meshy' : 'Sprite'}</b></button>` : ''
    const withOwn = ownCard ? (cards.startsWith('<div class="cgrid">') ? cards.replace('<div class="cgrid">', `<div class="cgrid">${ownCard}`) : `<div class="cgrid">${ownCard}</div>${list.busy ? '' : cards}`) : cards
    const arts = o && m.art.length > 1 ? `<div class="cart">${m.art.map(a => `<button class="${a === o.art ? 'on' : ''}" data-art="${esc(a)}" aria-label="Picture">${smallImg(a, 128)}</button>`).join('')}</div>` : ''
    const j = o?.job
    const all = makeable(c)
    const allBtn = all.length > 1 ? `<button class="glink" data-make-all>Make all ${all.length} · ${all.length * m.cost} credits</button>` : ''
    const ownInfo = c.sel !== 'own' || !o ? ''
      : !m.ready ? `<div class="cinfo"><b>Sprite</b>${arts}</div>`
      : j?.state === 'running' ? (allBtn ? `<div class="cinfo"><b>Meshy</b><span class="cact">${allBtn}</span></div>` : '')
      : j?.state === 'done' ? `<div class="cinfo"><b>Meshy</b><div class="cmade">${j.pick.thumbSrc ? smallImg(j.pick.thumbSrc) : ''}</div><span class="cact"><button class="glink" data-make>${ico('refresh-cw')}Redo · ${m.cost} credits</button><button class="glink" data-accept>${pick?.key === 'own' ? ico('check') : ''}Accept</button>${allBtn}</span></div>`
      : `<div class="cinfo"><b>Meshy</b>${arts}${j?.state === 'failed' ? `<p><span aria-hidden="true">⚠</span> ${esc(j.error || '')}</p>` : ''}<span class="cact"><button class="glink" data-make>Make · ${m.cost} credits</button>${allBtn}</span></div>`
    const info = sel ? `<div class="cinfo"><b>${esc(sel.name)}</b><dl><dt>By</dt><dd>${esc(sel.creator)}</dd><dt>Licence</dt><dd>${esc(sel.licence.credit)}${sel.licence.restyle ? '' : ' · own look kept'}</dd><dt>Triangles</dt><dd>${Number(sel.triangles).toLocaleString()}</dd></dl><a class="glink" href="${esc(sel.url)}" target="_blank" rel="noopener">${ico('external-link')}${sel.source === 'vroid' ? 'VRoid Hub' : 'Sketchfab'}</a></div>` : ''
    el.innerHTML = `${head}<h3>${esc(r.name || r.label)}</h3>${tabs}${benchHtml(c)}${withOwn}${ownInfo}${info}${foot}`
    for (const b of el.querySelectorAll('[data-role]')) b.onclick = () => { c.role = Number(b.dataset.role); c.sel = null; renderGame(); castSearch() }
    el.querySelector('[data-own]')?.addEventListener('click', () => {
      c.sel = 'own'
      // without a key the art is the pick at once (free); a Meshy model waits for Accept
      if (!m.ready) c.picks[r.id] = { key: 'own', role: r.id, label: r.label, source: 'art', format: 'sprite', art: o.art, name: `${r.label} (sprite)`, creator: 'this project' }
      renderGame()
    })
    for (const b of el.querySelectorAll('[data-art]')) b.onclick = () => {
      o.art = b.dataset.art
      if (!m.ready && c.picks[r.id]?.key === 'own') c.picks[r.id].art = o.art
      renderGame()
    }
    el.querySelector('[data-make]')?.addEventListener('click', () => meshyMake(r))
    el.querySelector('[data-make-all]')?.addEventListener('click', () => meshyAll())
    el.querySelector('[data-accept]')?.addEventListener('click', () => { c.picks[r.id] = { key: 'own', ...o.job.pick }; renderGame() })
    // a tile on the bench or a model in the library opens its role's Meshy card (delegated: a poll
    // swaps a tile without a re-draw)
    el.onclick = e => {
      const b = e.target.closest('.cforge [data-role-id]')
      const i = b ? c.roles.findIndex(x => x.id === b.dataset.roleId) : -1
      if (i >= 0) { c.role = i; c.sel = 'own'; renderGame() }
    }
    for (const b of el.querySelectorAll('.ccard[data-pick]')) b.onclick = () => {
      const m = list.models.find(x => `${x.source}:${x.id}` === b.dataset.pick)
      c.sel = b.dataset.pick
      c.picks[r.id] = { key: b.dataset.pick, role: r.id, label: r.label, ...m }
      renderGame()
    }
  }
  const files = el.querySelector('[data-files]')
  for (const b of el.querySelectorAll('[data-add]')) b.onclick = () => files?.click()
  if (files) files.onchange = () => castAdd(files.files)
  el.ondragover = e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault() }
  el.ondrop = e => { if (e.dataTransfer?.files?.length) { e.preventDefault(); castAdd(e.dataTransfer.files) } }
  el.querySelector('[data-back]')?.addEventListener('click', () => { c.open = false; c.sel = null; renderGame() })
  el.querySelector('[data-skip]')?.addEventListener('click', () => { c.done = true; c.open = false; gameBuild() })
  el.querySelector('[data-build]')?.addEventListener('click', () => { c.done = true; c.open = false; gameBuild() })
  el.querySelector('.gclose').onclick = closeGame
  benchWatch()
}
// /cast: the Cast step on its own, for the build that is open: no questions and no spec, just the
// characters, from the pictures the person adds (or the build's own art).
export async function openCastOnly() {
  const run = shownRun()
  if (!run) return botMsg('/cast needs a build open.')
  await openGame()
  Object.assign(game, { from: run, spec: { title: S.title || 'Cast', brand: null }, cast: { roles: [], lists: {}, picks: {}, own: {}, open: true, done: false, sel: null, only: true, role: 0 } })
  renderGame()
  ownArt()
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

// Shape it: the spec walked step by step with pictures (web/workshop.js), then the same build
async function gameShape() {
  readSpecEdits()
  const spec = { ...game.spec }
  closeGame()
  // an unfinished walk of the same game opens where it was left
  const key = String(spec.title || '').trim().toLowerCase()
  const open = await api('/api/workshops').then(r => (r.ok ? r.json() : null)).catch(() => null)
  const id = (open?.workshops || []).find(w => String(w.title || '').trim().toLowerCase() === key)?.id
  // @ts-ignore
  openWorkshop({
    api, ico, spec, id,
    onBuilt: async (run, built) => {
      await loadFiles()
      await showRun(run, { started: true, room: 'app' })
      setView('app')
      botMsg(`🎮 Building “${built?.title || spec.title}” with the art, story, levels and sound you picked. The App view shows every file as it is written.`)
    }
  })
}

async function gameBuild() {
  // the card's edits go into the spec (a big spec's enemies stay objects unless that line changed)
  readSpecEdits()
  // the picked cast, one model per role
  if (game.cast) game.spec.cast = Object.values(game.cast.picks).map(({ key, n, preview, thumbSrc, ...m }) => m)
  game.busy = 'Starting the build…'
  renderGame()
  try {
    const out = await api('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: game.spec }) }).then(r => r.json())
    if (!out.run) throw new Error(out.error || 'could not start')
    closeGame()
    await loadFiles()
    await showRun(out.run, { started: true, room: 'app' })
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
