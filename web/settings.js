// Settings (docs/specs/25-connections.md, slice 1): one place that says what the studio is connected
// to and where its data goes. Read-only for now: every state comes from an endpoint that already
// exists, and nothing here connects, changes or stores anything. It follows iOS Settings, as
// docs/ux/PATTERNS.md assigns for Me › Settings: grouped lists, one level per tap, names and a state.
//
// Layer 1: You, Crew, Publish, Data. Layer 2: a group's connections, each a name and a state
// (a filled dot is connected, a ring is not). A row opens to its one "Goes to" line (layer 3).
import { ic } from './icons.js'

// where each thing sends data, in the README's words ("What it does on your machine")
const GOES = {
  feed: 'Swarm Feed: an install id on connect, then only the builds you post',
  model: 'The model provider you picked: your prompt, the plan, page screenshots for review',
  image: 'The image provider you picked: picture prompts',
  film: 'The provider you picked: film prompts and clips',
  standin: 'Openverse and Pexels: words from a picture prompt',
  meshy: 'Meshy: the picture a 3D character is made from',
  github: 'GitHub Pages: the site you publish, in a public repo',
  vercel: 'Vercel: the site or app you publish',
  cloudflare: 'Cloudflare Pages: the site you publish',
  supabase: 'Your own Supabase project: an app\'s data',
  gateway: 'The channels you set up in Hermes: launch posts you send'
}
const DATA = [
  ['Builds, settings, keys', 'Stay on this computer or with Hermes'],
  ['Prompts, plans, review screenshots', 'The model provider you picked'],
  ['Picture and clip prompts', 'The image and video provider you picked'],
  ['Words from a picture prompt', 'Openverse and Pexels, for a stand-in photo'],
  ['The canvas page', 'Loads Tailwind and Google Fonts'],
  ['What you publish', 'The host you connected'],
  ['Swarm Feed', 'An install id on connect; then only what you post'],
  ['Everything else', 'Nowhere. No telemetry']
]

export function openSettings({ sw, esc }) {
  const ui = window.SwarmUI
  if (!ui) return
  const get = path => sw.api(path).then(r => (r.ok ? r.json() : null)).catch(() => null)
  const d = ui.dialog({ title: 'Settings', className: 'set', body: '<div class="set-list" role="list"></div>' })
  const list = d.body.querySelector('.set-list')
  // each state fills in when its own answer comes (some ask Hermes and take seconds): the sheet never waits
  const S = {}
  let at = null, open = ''

  // one row: a name, and its state on the right (an account, a model, or nothing but the dot)
  const row = (k, name, { on = null, state = '', more = false } = {}) => `<button type="button" class="set-row" role="listitem" data-k="${esc(k)}"${more ? ' aria-haspopup="true"' : ' aria-expanded="false"'}>
    ${on === null ? '' : `<i class="set-dot${on ? ' on' : ''}" aria-label="${on ? 'Connected' : 'Not connected'}"></i>`}<b>${esc(name)}</b><span>${esc(state)}</span>${more ? ic('chr', 14) : ''}</button>`

  function groups() {
    const m = S.models?.roles || {}, img = S.models?.image || {}
    const imgOn = (img.providers || []).some(p => p.available)
    const crew = [
      ['model:planner', 'Planner', { on: !!m.planner?.model, state: m.planner?.model || '' }, GOES.model],
      ['model:worker', 'Builders', { on: !!m.worker?.model, state: m.worker?.model || '' }, GOES.model],
      ['model:reviewer', 'Reviewer', { on: !!m.reviewer?.model, state: m.reviewer?.model || '' }, GOES.model],
      ['image', 'Pictures', { on: img.pick !== 'off' && imgOn, state: img.pick === 'off' ? 'Off' : (img.providers || []).filter(p => p.available).map(p => p.provider).join(', ') }, GOES.image],
      ['film', 'Film', { on: !!(S.media?.music?.on || S.media?.clips?.on), state: [S.media?.music?.on && S.media.music.by, S.media?.clips?.on && S.media.clips.by].filter(Boolean).join(', ') }, GOES.film],
      ['standin', 'Stand-in photos', { on: true, state: 'Openverse' }, GOES.standin],
      ['meshy', '3D', { on: !!S.meshy?.ready }, GOES.meshy]
    ]
    const pub = S.publish || {}, sb = S.connectors?.supabase
    // the gateway's platforms come as a list or as a map by name
    const gp = S.gateway?.platforms, plats = (Array.isArray(gp) ? gp : Object.keys(gp || {})).map(p => String(p?.name || p))
    const publish = [
      ['github', 'GitHub Pages', { on: !!pub.github, state: pub.github || '' }, GOES.github],
      ['vercel', 'Vercel', { on: !!pub.vercel, state: pub.vercel?.user || '' }, GOES.vercel],
      ['cloudflare', 'Cloudflare Pages', { on: !!pub.cloudflare, state: pub.cloudflare?.user || '' }, GOES.cloudflare],
      ['supabase', 'Supabase', { on: !!sb?.signed_in }, GOES.supabase],
      ['gateway', 'Gateways', { on: plats.length > 0, state: plats.join(', ') }, GOES.gateway]
    ]
    // a Feed account has a handle; without one the server answers the computer's user name, which is not an account
    const you = [['feed', 'Swarm Feed', { on: !!S.me?.handle, state: S.me?.handle ? S.me.name || `@${S.me.handle}` : '' }, GOES.feed]]
    return { you, crew, publish }
  }
  const count = rows => `${rows.filter(r => r[2].on).length} of ${rows.length}`

  function draw() {
    const g = groups()
    if (!at) {
      d.setHead('', 'Settings')
      list.innerHTML = row('you', 'You', { state: g.you[0][2].state || 'Not signed in', more: true })
        + row('crew', 'Crew', { state: count(g.crew), more: true })
        + row('publish', 'Publish', { state: count(g.publish), more: true })
        + row('data', 'Data', { more: true })
      return
    }
    const back = `<button type="button" class="set-row set-back" data-k="">${ic('chl', 14)}<b>Settings</b></button>`
    if (at === 'data') {
      d.setHead('', 'Data')
      list.innerHTML = back + `<dl class="set-data">${DATA.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      return
    }
    d.setHead('', { you: 'You', crew: 'Crew', publish: 'Publish' }[at])
    list.innerHTML = back + g[at].map(([k, name, st, goes]) => `${row(k, name, st)}<p class="set-goes" data-for="${esc(k)}"${open === k ? '' : ' hidden'}>${esc(goes)}</p>`).join('')
    if (open) list.querySelector(`.set-row[data-k="${CSS.escape(open)}"]`)?.setAttribute('aria-expanded', 'true')
  }
  list.onclick = e => {
    const b = e.target.closest('.set-row')
    if (!b) return
    const k = b.dataset.k
    if (!at || !k) { at = k || null; open = ''; draw(); list.querySelector('.set-row')?.focus({ preventScroll: true }); return }
    // layer 3: the one line that says where this connection's data goes
    open = open === k ? '' : k
    draw()
    list.querySelector(`.set-row[data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true })
  }

  draw()
  list.querySelector('.set-row')?.focus({ preventScroll: true })
  // an answer that comes in changes the states in place: the rows are never rebuilt under a click
  function patch() {
    const g = groups()
    const now = at ? (g[at] || []).map(([k, , st]) => [k, st]) : [['you', { state: g.you[0][2].state || 'Not signed in' }], ['crew', { state: count(g.crew) }], ['publish', { state: count(g.publish) }]]
    for (const [k, st] of now) {
      const r = list.querySelector(`.set-row[data-k="${CSS.escape(k)}"]`)
      if (!r) continue
      const dot = r.querySelector('.set-dot'), sp = r.querySelector('span')
      if (dot && st.on !== undefined && st.on !== null) { dot.classList.toggle('on', !!st.on); dot.setAttribute('aria-label', st.on ? 'Connected' : 'Not connected') }
      if (sp && sp.textContent !== (st.state || '')) sp.textContent = st.state || ''
    }
  }
  for (const k of ['me', 'models', 'media', 'publish', 'connectors', 'meshy', 'gateway']) get(`/api/${k}`).then(v => { if (!d.closed) { S[k] = v; patch() } })
  return d
}
