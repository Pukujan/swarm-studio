// @ts-check
// Settings (docs/specs/25-connections.md): the studio's own settings and where its data goes. It follows
// iOS Settings, as docs/ux/PATTERNS.md assigns for Me › Settings: grouped lists, one level per tap, names
// and a state.
//
// Layer 1: You, Setup, Lite mode, Background, Data. You is the Feed account and its "Goes to" line. Setup opens the
// Setup sheet on its Parts (web/setup-parts.js: every model, tool, connector, key and program a build
// uses, its state and its fix; Crew and Publish moved there). Lite mode is the pick and what it does.
// Background is when the studio's background work stops by itself (decision 0017, issue #450). Data is where data goes.
import { ic } from './icons.js'

const DATA = [
  ['Builds, settings, keys', 'Stay on this computer or with Hermes'],
  ['Prompts, plans, review screenshots', 'The model provider you picked'],
  ['Picture and clip prompts', 'The image and video provider you picked'],
  ['Clips and sounds you attach, finished films', 'The media model you picked, or none when it is off'],
  ['Words from a picture prompt', 'Openverse and Pexels, for a stand-in photo'],
  ['The canvas page', 'Loads Tailwind and Google Fonts'],
  ['What you publish', 'The host you connected'],
  ['Swarm Feed', 'An install id on connect; then only what you post'],
  ['Everything else', 'Nowhere. No telemetry']
]
const FEED_GOES = 'Swarm Feed: an install id on connect, then only the builds you post'

// Lite mode, as web/canvas/settings.js does it (litePass, liteOn) and web/canvas.css draws it (body.lite)
const LITE = [
  ['What it does', 'Only the page you are reading stays live. Every other finished page becomes a still picture and its memory is freed; it comes back live when you zoom into it or the crew works on it.'],
  ['What stops', 'The background grid, the moving wires and the speech-bubble animations.'],
  ['Auto turns it on', 'When this device has 4 GB of memory or less, when more than one page is on the canvas and the crew has been quiet for 5 seconds, and while Play covers the canvas.'],
  ['On', 'Always, on any device.'],
  ['Off', 'Never, not even in Play. Every page stays live.']
]
// Background: the server's own picks (server/server.mjs STOP_PICKS), in minutes; 0 is never
const STOPS = [
  { k: 'app', name: 'Stop an app nobody is looking at', note: 'Opening it again takes a few seconds.', label: m => `${m} min` },
  { k: 'server', name: 'Close the studio when nothing runs', note: 'It starts again when you next use it.', label: m => (m ? `${m} min` : 'Never') }
]
const LITE_PICKS = [{ k: 'auto', label: 'Auto', on: null }, { k: 'on', label: 'On', on: true }, { k: 'off', label: 'Off', on: false }]
const small = () => (/** @type {any} */ (navigator).deviceMemory || 8) <= 4

export function openSettings({ sw, esc }) {
  const ui = window.SwarmUI
  if (!ui) return
  const get = path => sw.api(path).then(r => (r.ok ? r.json() : null)).catch(() => null)
  const d = ui.dialog({ title: 'Settings', className: 'set', body: '<div class="set-list" role="list"></div>' })
  const list = d.body.querySelector('.set-list')
  // each state fills in when its own answer comes: the sheet never waits
  const S = { me: null, lite: undefined, stops: null }
  let at = null, open = false

  // one row: a name, and its state on the right (an account, a pick, or nothing but the dot)
  const row = (k, name, { on = null, state = '', more = false } = {}) => `<button type="button" class="set-row" role="listitem" data-k="${esc(k)}"${more ? ' aria-haspopup="true"' : ' aria-expanded="false"'}>
    ${on === null ? '' : `<i class="set-dot${on ? ' on' : ''}" aria-label="${on ? 'Connected' : 'Not connected'}"></i>`}<b>${esc(name)}</b><span>${esc(state)}</span>${more ? ic('chr', 14) : ''}</button>`

  // a Feed account has a handle; without one the server answers the computer's user name, which is not an account
  const you = () => (S.me?.handle ? S.me.name || `@${S.me.handle}` : '')
  const stopsState = () => (S.stops ? `${S.stops.app} min · ${S.stops.server ? `${S.stops.server} min` : 'never'}` : '')
  const liteState = () => S.lite === undefined ? '' : S.lite === true ? 'On' : S.lite === false ? 'Off' : `Auto · ${small() ? 'on' : 'off'} here`

  function draw() {
    if (!at) {
      d.setHead('', 'Settings')
      list.innerHTML = row('you', 'You', { state: you() || 'Not signed in', more: true })
        + row('setup', 'Setup', { more: true })
        + row('lite', 'Lite mode', { state: liteState(), more: true })
        + row('stops', 'Background', { state: stopsState(), more: true })
        + row('data', 'Data', { more: true })
      return
    }
    const back = `<button type="button" class="set-row set-back" data-k="">${ic('chl', 14)}<b>Settings</b></button>`
    if (at === 'data') {
      d.setHead('', 'Data')
      list.innerHTML = back + `<dl class="set-data">${DATA.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      return
    }
    if (at === 'stops') {
      d.setHead('', 'Background')
      list.innerHTML = back + (S.stops ? STOPS.map(x => `<div class="set-stop"><b id="set-stop-${x.k}">${esc(x.name)}</b><div class="ui-toggle-group ui-block" role="radiogroup" aria-labelledby="set-stop-${x.k}">${S.stops.picks[x.k].map(m => `<button type="button" class="ui-toggle" role="radio" aria-checked="${m === S.stops[x.k]}" data-stop="${x.k}" data-min="${m}">${esc(x.label(m))}</button>`).join('')}</div><p class="set-goes">${esc(x.note)}</p></div>`).join('') : '')
      return
    }
    if (at === 'lite') {
      d.setHead('', 'Lite mode')
      const now = S.lite === true ? 'on' : S.lite === false ? 'off' : 'auto'
      list.innerHTML = back + `<div class="ui-toggle-group ui-block set-lite" role="radiogroup" aria-label="Lite mode">${LITE_PICKS.map(p => `<button type="button" class="ui-toggle" role="radio" aria-checked="${p.k === now}" data-lite="${p.k}">${p.label}</button>`).join('')}</div>`
        + `<dl class="set-data set-litedl">${LITE.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      return
    }
    d.setHead('', 'You')
    list.innerHTML = back + `${row('feed', 'Swarm Feed', { on: !!S.me?.handle, state: you() })}<p class="set-goes"${open ? '' : ' hidden'}>${esc(FEED_GOES)}</p>`
    if (open) list.querySelector('.set-row[data-k="feed"]')?.setAttribute('aria-expanded', 'true')
  }

  async function pickLite(k) {
    const p = LITE_PICKS.find(x => x.k === k)
    if (!p) return
    S.lite = p.on
    draw()
    list.querySelector(`[data-lite="${k}"]`)?.focus({ preventScroll: true })
    await sw.api('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'lite', on: p.on }) }).catch(() => null)
    // the Design deck reads the pick again (web/canvas/settings.js loadModels)
    dispatchEvent(new CustomEvent('swarm:models'))
  }

  async function pickStop(k, m) {
    if (!S.stops) return
    S.stops = { ...S.stops, [k]: m }
    draw()
    list.querySelector(`[data-stop="${k}"][data-min="${m}"]`)?.focus({ preventScroll: true })
    await sw.api('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'stops', [k]: m }) }).catch(() => null)
  }

  list.onclick = e => {
    const l = e.target.closest('[data-lite]')
    if (l) { pickLite(l.dataset.lite); return }
    const st = e.target.closest('[data-stop]')
    if (st) { pickStop(st.dataset.stop, Number(st.dataset.min)); return }
    const b = e.target.closest('.set-row')
    if (!b) return
    const k = b.dataset.k
    // one sheet at a time: Settings closes and Setup opens on its Parts
    if (!at && k === 'setup') { d.close(); window.SwarmSetup?.open('parts'); return }
    if (!at || !k) { at = k || null; open = false; draw(); list.querySelector('.set-row')?.focus({ preventScroll: true }); return }
    // layer 3: the one line that says where the account's data goes
    open = !open
    draw()
    list.querySelector(`.set-row[data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true })
  }

  draw()
  list.querySelector('.set-row')?.focus({ preventScroll: true })
  get('/api/me').then(v => { if (!d.closed) { S.me = v; if (!at || at === 'you') draw() } })
  get('/api/models').then(v => { if (!d.closed) { S.lite = v ? v.lite ?? null : null; S.stops = v?.stops || null; if (!at || at === 'lite' || at === 'stops') draw() } })
  return d
}
