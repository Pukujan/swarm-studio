// @ts-check
// Setup: the one-time sheet (docs/specs/06-onboarding.md). A grouped list after iOS Settings
// (docs/ux/PATTERNS.md): each row is a name and one state, a tap opens it, and every row has a
// default already picked, so Start works at once. Shown once on Projects; later from the user menu.
//
//   Account   Swarm Feed: sign in with Google, GitHub or Discord, then this install is linked to it
//   Models    the planner and builder models Hermes passed, tested with one tiny call each, and the
//             media reader's model with what it can take (spec 32)
//   Pictures  what builds use for pictures: Painted, Stock photos or Drawn
import { ic } from './icons.js'

const PICTURE_ROWS = [
  { k: 'painted', label: 'Painted', note: 'About a minute each' },
  { k: 'stock', label: 'Stock photos', note: 'Built-in library and Pexels · instant' },
  { k: 'drawn', label: 'Drawn', note: 'SVG · fastest, no keys' }
]
const PROVIDERS = [{ k: 'google', label: 'Google' }, { k: 'github', label: 'GitHub' }, { k: 'discord', label: 'Discord' }]

export function makeSetup({ sw }) {
  const esc = sw.esc
  const api = (path, body) => sw.api(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
  let dlg = null
  // what the sheet knows: the server's view, the model test (null while it runs) and the open row
  /** @type {any} */
  const S = { view: null, test: undefined, open: '', hermes: null, opts: null, q: '', all: {}, more: false, keyFor: '', signing: null, picking: '', pickError: '', signError2: '' }

  const mark = (ok, label) => `<span class="su-mark${ok ? '' : ' warn'}" role="img" aria-label="${label}">${ic(ok ? 'check' : 'alert', 16)}</span>`
  const busy = '<span class="su-spin" role="img" aria-label="Testing"></span>'
  const short = m => String(m || '').replace(/^[a-z]+\//, '')

  // the model a role runs on: its Hermes slot, or Hermes's main model while the slot is empty
  const using = role => {
    const o = S.opts, s = o?.slots?.[role]
    if (s?.model) return { provider: s.provider, model: s.model }
    if (o?.main?.model) return o.main
    const m = S.view.models[role]?.model
    return { provider: '', model: m && m !== role ? m : '' }
  }

  // the picker: Hermes's own providers and models (hermes_models.py). Signed-in providers list their
  // models; a tap sets the planner and the builders. Everyone else is one tap in, under More providers:
  // a key box where a key is the only sign-in, the browser where the provider signs in there.
  const SHOWN = 8
  function picker() {
    const o = S.opts
    if (o === null) return `<div class="su-line"><span>Models</span>${busy}</div>`
    if (!o?.ok) return o?.message ? `<p class="su-note">${esc(o.message)}</p>` : ''
    const now = using('worker'), q = S.q.trim().toLowerCase()
    const signed = o.providers.filter(p => p.signedIn).sort((a, b) => (b.slug === now.provider) - (a.slug === now.provider) || (b.current - a.current))
    const groups = signed.map(p => {
      // the model in use comes first, so it is seen without searching
      const models = p.slug === now.provider && p.models.includes(now.model) ? [now.model, ...p.models.filter(m => m !== now.model)] : p.models
      const hit = q ? models.filter(m => m.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) : models
      if (!hit.length) return ''
      const all = q || S.all[p.slug], list = all ? hit : hit.slice(0, SHOWN)
      const on = m => p.slug === now.provider && m === now.model
      return `<div class="su-group"><span class="su-gname">${esc(p.name)}</span>${list.map(m => `<button type="button" class="su-pick" data-pv="${esc(p.slug)}" data-md="${esc(m)}" aria-pressed="${on(m)}"><span>${esc(m)}</span>${S.picking === `${p.slug}/${m}` ? busy : on(m) ? ic('check', 16) : ''}</button>`).join('')}${!all && hit.length > SHOWN ? `<button type="button" class="su-pick su-more" data-all="${esc(p.slug)}">All ${hit.length}</button>` : ''}</div>`
    }).join('')
    const search = `<input type="search" class="ui-input su-q" placeholder="Search models" aria-label="Search models" value="${esc(S.q)}">`
    const list = `<div class="su-models">${groups || `<p class="su-note">${signed.length ? 'No model matches.' : 'Sign in to a provider first.'}</p>`}</div>`
    return `${search}${list}${S.pickError ? `<p class="su-why">${esc(S.pickError)}</p>` : ''}${providers()}`
  }

  function providers() {
    const o = S.opts, g = S.signing
    // the search narrows these too, by name
    const q = S.q.trim().toLowerCase(), all = o.providers.filter(p => !p.signedIn)
    if (!all.length) return ''
    const others = q && all.some(p => p.name.toLowerCase().includes(q)) ? all.filter(p => p.name.toLowerCase().includes(q)) : all
    const signing = g && !g.done ? `<p class="su-note">Finish in your browser.${g.code ? ` Code <b class="fg">${esc(g.code)}</b>` : ''}</p><div class="su-acts">${g.url ? `<a class="ui-btn ui-btn-outline ui-btn-sm" href="${esc(g.url)}" target="_blank" rel="noopener">Open</a>` : busy}<button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-signoff>Cancel</button></div>` : ''
    const one = p => {
      const head = `<div class="su-line"><span class="fg">${esc(p.name)}</span>${S.keyFor === p.slug || g?.slug === p.slug && !g.done ? '' : `<button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-signin="${esc(p.slug)}">Sign in</button>`}</div>`
      const key = S.keyFor === p.slug ? `<div class="su-cmd"><input type="password" class="ui-input su-key" placeholder="API key" aria-label="${esc(p.name)} API key" autocomplete="off"><button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-savekey="${esc(p.slug)}">Save</button></div>` : ''
      return `${head}${key}${g?.slug === p.slug ? signing : ''}`
    }
    const inner = S.more ? `<div class="su-others">${others.map(one).join('')}</div>` : ''
    return `<button type="button" class="ui-btn ui-btn-ghost ui-btn-sm su-toggle" data-moreprov aria-expanded="${!!S.more}">More providers</button>${inner}${S.signError2 ? `<p class="su-why">${esc(S.signError2)}</p>` : ''}`
  }

  async function loadOptions(refresh = false) {
    const r = await sw.api(`/api/setup/models/options${refresh ? '?refresh=1' : ''}`).then(x => x.json()).catch(() => ({ ok: false, message: 'Hermes did not answer.' }))
    S.opts = r
    if (r.signing !== undefined) S.signing = r.signing
    draw()
    return r
  }

  async function pick(provider, model) {
    S.picking = `${provider}/${model}`; S.pickError = ''
    draw()
    const r = await api('/api/setup/models/pick', { provider, model }).catch(() => ({ ok: false, message: 'Hermes did not answer.' }))
    S.picking = ''
    if (r.ok) {
      if (S.opts?.ok) S.opts.slots = r.slots
      S.test = r.test
      dot(r.test?.ok)
    } else S.pickError = r.message || 'Hermes did not save it.'
    draw()
  }

  async function signIn(slug) {
    const p = S.opts?.providers.find(x => x.slug === slug)
    S.signError2 = ''
    if (p?.sign === 'key') { S.keyFor = slug; draw(); dlg.body.querySelector('.su-key')?.focus(); return }
    S.keyFor = ''
    S.signing = { slug, url: '', code: '', done: null }
    draw()
    const r = await api('/api/setup/models/signin', { slug }).catch(() => ({ signing: { slug, done: false, error: 'Hermes did not answer.' } }))
    S.signing = r.signing
    if (r.signing?.done === false) { S.signError2 = r.signing.error || 'The sign-in did not finish.'; S.signing = null }
    draw()
    poll()
  }
  // while a browser sign-in is open, ask Hermes every few seconds whether the provider is signed in
  let polling = null
  function poll() {
    clearTimeout(polling)
    if (!S.signing || S.signing.done || !dlg || dlg.closed) return
    polling = setTimeout(async () => {
      const slug = S.signing?.slug
      const r = await loadOptions(true)
      const g = r.signing
      if (r.providers?.find(x => x.slug === slug)?.signedIn || g?.done) { S.signing = null; draw(); return }
      if (g?.done === false) { S.signError2 = g.error || 'The sign-in did not finish.'; S.signing = null; draw(); return }
      poll()
    }, 3000)
  }

  async function saveKey(slug) {
    const key = /** @type {HTMLInputElement|null} */ (dlg.body.querySelector('.su-key'))?.value || ''
    if (!key.trim()) return
    S.signError2 = ''
    const r = await api('/api/setup/models/signin', { slug, key }).catch(() => ({ ok: false, message: 'Hermes did not answer.' }))
    if (r.ok) { S.keyFor = ''; if (r.options?.ok) S.opts = r.options } else S.signError2 = r.message || 'Hermes did not save the key.'
    draw()
  }

  function modelsRow() {
    const m = S.view.models, t = S.test
    const state = t === null ? busy : t ? mark(t.ok, t.ok ? 'Working' : 'Not working') : ''
    const line = (name, role) => `<div class="su-line"><span>${name}</span><b>${esc(short(using(role).model) || 'None')}</b>${t ? mark(t[role].ok, t[role].ok ? 'Working' : 'Not working') : t === null ? busy : ''}</div>`
    // when it fails: one plain line and the one fix that fits it (engine/setup.mjs modelProblem). Hermes's
    // own model setup only when a model or key is the problem; where no terminal opens, its command.
    // The provider's raw message stays behind Details (rule 10).
    const p = t && !t.ok ? (t.problem || { line: 'The model didn\'t work.', fix: 'hermes' }) : null
    const raw = p ? String((t.planner.ok ? t.worker.error : t.planner.error) || '') : ''
    const btn = (attr, label, strong) => `<button type="button" class="ui-btn ${strong ? 'ui-btn-outline' : 'ui-btn-ghost'} ui-btn-sm" ${attr}>${label}</button>`
    const fix = p
      ? `<p class="su-why">${esc(p.line)}</p><div class="su-acts">${p.fix === 'hermes' ? btn('data-hermes', 'Let Hermes set this up', true) : ''}${btn('data-again', 'Test again', p.fix !== 'hermes')}${raw ? btn(`data-details aria-expanded="${!!S.details}"`, 'Details') : ''}</div>${S.details && raw ? `<p class="su-raw">${esc(raw)}</p>` : ''}${S.hermes && !S.hermes.ok ? `<div class="su-cmd"><code>${esc(S.hermes.command)}</code><button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-copy="${esc(S.hermes.command)}">Copy</button></div>` : ''}`
      : ''
    // the media reader: no test mark (it is not called here), its model and, below, what it can take
    const md = m.media
    const media = md ? `<div class="su-line"><span>Media</span><b>${esc(md.off ? 'Off' : short(md.model) || 'None')}</b></div><p class="su-note">${esc(md.off ? 'Clips and sounds are kept, not read.' : md.model ? (/^nothing/.test(md.takes || '') ? 'It is not known to hear or watch: clips and sounds are kept, not read.' : `It ${md.takes}.`) : 'No model here hears or watches: clips are kept, not read.')}</p>` : ''
    return row('models', 'Models', `<span class="su-val">${esc(short(using('worker').model))}</span>${state}`, `${line('Planner', 'planner')}${line('Builders', 'worker')}${fix}${picker()}${media}`)
  }

  // Account: Swarm Feed, signed in first (Google, GitHub or Discord), then this install is linked to
  // that account. Never a guest: a profile with no sign-in of its own is shown as one, with the fix.
  function accountRow() {
    const a = S.view.account || {}
    const who = a.connected ? `${esc(a.name || a.handle || '')}${a.handle ? ` <span class="su-dim">@${esc(a.handle)}</span>` : ''}` : ''
    const state = a.connected
      ? `<span class="su-val">${a.guest ? 'Guest' : esc(a.handle ? `@${a.handle}` : a.name || 'Signed in')}</span>${mark(!a.guest, a.guest ? 'Guest profile' : 'Signed in')}`
      : a.pending ? `<span class="su-val">Waiting</span>${busy}` : '<span class="su-val">Skipped</span>'
    const providers = `<div class="su-acts su-sign">${PROVIDERS.map(p => `<button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-sign="${p.k}">${p.label}</button>`).join('')}</div>`
    const waiting = a.pending ? `<p class="su-note">Finish in your browser. Code <b class="fg">${esc(a.pending.code || '')}</b></p><div class="su-acts"><button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-reopen>Open again</button><button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-cancel>Cancel</button></div>` : ''
    const inner = a.connected
      ? `<div class="su-line"><span class="fg">${who}</span></div>${a.guest ? `<p class="su-why">A guest profile. Sign in to make it yours.</p>${providers}` : ''}`
      : `${a.pending ? waiting : providers}${S.signError ? `<p class="su-why">${esc(S.signError)}</p>` : ''}`
    return row('account', 'Account', state, `${inner}<p class="su-note">Builds stay on this computer. Publish and Post make them public.</p>`)
  }

  async function sign(provider) {
    S.signError = ''
    const r = await api('/api/setup/account', { provider }).catch(() => ({ ok: false, message: 'The Feed did not answer.' }))
    if (r.account) S.view.account = r.account
    if (!r.ok && r.message) S.signError = r.message
    draw()
    watch()
  }
  // while a sign-in is open in the browser, ask every few seconds whether it came back
  let watching = null
  function watch() {
    clearTimeout(watching)
    if (!S.view?.account?.pending || !dlg || dlg.closed) return
    watching = setTimeout(async () => {
      const r = await api('/api/setup/account', { check: true }).catch(() => null)
      if (r?.account) S.view.account = r.account
      draw()
      watch()
    }, 3000)
  }

  function picturesRow() {
    const p = S.view.pictures, on = PICTURE_ROWS.find(x => x.k === p.mode)
    const painted = p.painted.model ? `${short(p.painted.model)} · ${p.painted.provider}` : 'No image model'
    const note = on.k === 'painted'
      ? `<div class="su-line"><span class="fg">${esc(painted)}</span>${mark(p.painted.ready, p.painted.ready ? 'Ready' : 'Not ready')}</div>${p.painted.error ? `<p class="su-why">${esc(p.painted.error)}</p>` : ''}<p class="su-note">${p.painted.ready ? on.note : 'Stock photos fill in'}</p>`
      : `<p class="su-note">${on.note}</p>`
    const pick = `<div class="ui-toggle-group ui-block" role="radiogroup" aria-label="Pictures">${PICTURE_ROWS.map(x => `<button type="button" class="ui-toggle" role="radio" aria-checked="${x.k === p.mode}" data-pic="${x.k}">${x.label}</button>`).join('')}</div>`
    const warn = p.mode === 'painted' && !p.painted.ready ? mark(false, 'Not ready') : ''
    return row('pictures', 'Pictures', `<span class="su-val">${on.label}</span>${warn}`, `${pick}${note}`)
  }

  const row = (k, name, state, inner) => `<section class="su-row${S.open === k ? ' open' : ''}">
    <button type="button" class="su-head" data-row="${k}" aria-expanded="${S.open === k}"><span class="su-name">${name}</span><span class="su-state">${state}</span>${ic('chd', 16)}</button>
    ${S.open === k ? `<div class="su-body">${inner}</div>` : ''}</section>`

  function draw() {
    if (!dlg || dlg.closed || !S.view) return
    const had = /** @type {HTMLElement|null} */ (dlg.body.querySelector(':focus'))
    const focus = had?.dataset
    const focusQ = had?.classList.contains('su-q'), caret = focusQ ? /** @type {HTMLInputElement} */ (had).selectionStart ?? S.q.length : 0
    // the picker's list scrolls on its own: a redraw keeps its place
    const top = dlg.body.querySelector('.su-models')?.scrollTop || 0
    dlg.body.innerHTML = `<div class="su-list">${accountRow()}${modelsRow()}${picturesRow()}</div>`
    const list = dlg.body.querySelector('.su-models')
    if (list) list.scrollTop = top
    for (const b of dlg.body.querySelectorAll('[data-sign]')) b.onclick = () => sign(b.dataset.sign)
    for (const b of dlg.body.querySelectorAll('[data-row]')) b.onclick = () => { S.open = S.open === b.dataset.row ? '' : b.dataset.row; draw() }
    for (const b of dlg.body.querySelectorAll('[data-pic]')) b.onclick = async () => { S.view = await api('/api/setup', { pictures: b.dataset.pic }).catch(() => S.view); draw() }
    const on = (sel, fn) => { const b = dlg.body.querySelector(sel); if (b) b.onclick = fn }
    on('[data-again]', () => test(true))
    on('[data-hermes]', async () => {
      S.hermes = await api('/api/setup/hermes', {}).catch(() => ({ ok: false, command: 'hermes model' }))
      // a terminal opened: test again when the person comes back to this window (spec 6)
      if (S.hermes.ok) window.addEventListener('focus', () => test(true), { once: true })
      draw()
    })
    on('[data-details]', () => { S.details = !S.details; draw() })
    on('[data-reopen]', () => api('/api/setup/account', { reopen: true }).catch(() => {}))
    on('[data-cancel]', async () => { const r = await api('/api/setup/account', { cancel: true }).catch(() => null); if (r?.account) S.view.account = r.account; draw() })
    on('[data-copy]',e => navigator.clipboard?.writeText(e.currentTarget.dataset.copy).catch(() => {}))
    // the picker
    for (const b of dlg.body.querySelectorAll('[data-pv]')) b.onclick = () => { if (!S.picking) pick(b.dataset.pv, b.dataset.md) }
    for (const b of dlg.body.querySelectorAll('[data-all]')) b.onclick = () => { S.all[b.dataset.all] = true; draw() }
    for (const b of dlg.body.querySelectorAll('[data-signin]')) b.onclick = () => signIn(b.dataset.signin)
    on('[data-moreprov]', () => { S.more = !S.more; draw() })
    on('[data-savekey]', e => saveKey(e.currentTarget.dataset.savekey))
    on('[data-signoff]', async () => { clearTimeout(polling); S.signing = null; draw(); await api('/api/setup/models/signin', { cancel: true }).catch(() => {}) })
    const q = /** @type {HTMLInputElement|null} */ (dlg.body.querySelector('.su-q'))
    if (q) q.oninput = () => { S.q = q.value; draw() }
    const k = /** @type {HTMLInputElement|null} */ (dlg.body.querySelector('.su-key'))
    if (k) k.onkeydown = e => { if (e.key === 'Enter') saveKey(S.keyFor) }
    // a redraw keeps the keyboard where it was
    if (focusQ) { const n = /** @type {HTMLInputElement|null} */ (dlg.body.querySelector('.su-q')); n?.focus({ preventScroll: true }); n?.setSelectionRange(caret, caret) }
    const again = focus && (focus.row ? `[data-row="${focus.row}"]` : focus.pic ? `[data-pic="${focus.pic}"]` : focus.sign ? `[data-sign="${focus.sign}"]` : null)
    if (again) dlg.body.querySelector(again)?.focus({ preventScroll: true })
  }

  async function test(again = false) {
    S.test = null
    draw()
    S.test = await api('/api/setup/models', { again }).catch(() => undefined)
    if (S.test) dot(S.test.ok)
    // a model that does not answer opens its row: the marker first, the message one tap in (rule 10)
    if (S.test && !S.test.ok && !S.open) S.open = 'models'
    draw()
  }

  // the avatar keeps a warning dot while the models do not answer, so closing the sheet never hides it
  // (the server keeps the last check across restarts); its menu's Setup item carries the same marker
  const dot = ok => document.querySelector('.hm-who')?.classList.toggle('warn', ok === false)

  // closing it any way counts as seen: nothing here is required
  const seen = () => { if (S.view && !S.view.seen) { S.view.seen = true; api('/api/setup', { seen: true }).catch(() => {}) } }

  async function open() {
    if (dlg && !dlg.closed) return
    S.view = await api('/api/setup').catch(() => null)
    if (!S.view?.models) return
    Object.assign(S, { open: S.view.account?.pending ? 'account' : '', hermes: null, signError: '', details: false, opts: null, q: '', all: {}, more: false, keyFor: '', signing: null, picking: '', pickError: '', signError2: '' })
    dlg = window.SwarmUI.dialog({ title: 'Setup', className: 'su', body: '', footer: '<button type="button" class="ui-btn ui-btn-default su-start">Start</button>', onClose: seen })
    dlg.footer.querySelector('.su-start').onclick = () => dlg.close('start')
    S.test = S.view.test || undefined
    draw()
    // the test is kept by the server for ten minutes, so opening the sheet again costs nothing
    test()
    watch()
    loadOptions().then(() => poll())
  }

  return {
    open,
    // once, the first time Projects shows
    async first() {
      const v = await api('/api/setup').catch(() => null)
      if (v) dot(v.modelsOk)
      if (v && v.models && v.seen === false) open()
    }
  }
}
