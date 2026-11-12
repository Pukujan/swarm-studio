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
  const S = { view: null, test: undefined, open: '', hermes: null }

  const mark = (ok, label) => `<span class="su-mark${ok ? '' : ' warn'}" role="img" aria-label="${label}">${ic(ok ? 'check' : 'alert', 16)}</span>`
  const busy = '<span class="su-spin" role="img" aria-label="Testing"></span>'
  const short = m => String(m || '').replace(/^[a-z]+\//, '')

  function modelsRow() {
    const m = S.view.models, t = S.test
    const state = t === null ? busy : t ? mark(t.ok, t.ok ? 'Working' : 'Not working') : ''
    const line = (name, role) => `<div class="su-line"><span>${name}</span><b>${esc(short(m[role].model) || 'None')}</b>${t ? mark(t[role].ok, t[role].ok ? 'Working' : 'Not working') : t === null ? busy : ''}</div>`
    const why = t && !t.ok ? esc(t.worker.error || t.planner.error || '') : ''
    // one action when it fails: Hermes's own model setup. Where no terminal could be opened, its command.
    const fix = t && !t.ok
      ? `${why ? `<p class="su-why">${why}</p>` : ''}<div class="su-acts"><button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-hermes>Let Hermes set this up</button><button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-again>Test again</button></div>${S.hermes && !S.hermes.ok ? `<div class="su-cmd"><code>${esc(S.hermes.command)}</code><button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" data-copy="${esc(S.hermes.command)}">Copy</button></div>` : ''}`
      : ''
    // the media reader: no test mark (it is not called here), its model and, below, what it can take
    const md = m.media
    const media = md ? `<div class="su-line"><span>Media</span><b>${esc(md.off ? 'Off' : short(md.model) || 'None')}</b></div><p class="su-note">${esc(md.off ? 'Clips and sounds are kept, not read.' : md.model ? (/^nothing/.test(md.takes || '') ? 'It is not known to hear or watch: clips and sounds are kept, not read.' : `It ${md.takes}.`) : 'No model here hears or watches: clips are kept, not read.')}</p>` : ''
    return row('models', 'Models', `<span class="su-val">${esc(short(m.worker.model))}</span>${state}`, `${line('Planner', 'planner')}${line('Builders', 'worker')}${media}${fix}`)
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
    const focus = dlg.body.querySelector(':focus')?.dataset
    dlg.body.innerHTML = `<div class="su-list">${accountRow()}${modelsRow()}${picturesRow()}</div>`
    for (const b of dlg.body.querySelectorAll('[data-sign]')) b.onclick = () => sign(b.dataset.sign)
    for (const b of dlg.body.querySelectorAll('[data-row]')) b.onclick = () => { S.open = S.open === b.dataset.row ? '' : b.dataset.row; draw() }
    for (const b of dlg.body.querySelectorAll('[data-pic]')) b.onclick = async () => { S.view = await api('/api/setup', { pictures: b.dataset.pic }).catch(() => S.view); draw() }
    const on = (sel, fn) => { const b = dlg.body.querySelector(sel); if (b) b.onclick = fn }
    on('[data-again]', () => test(true))
    on('[data-hermes]', async () => { S.hermes = await api('/api/setup/hermes', {}).catch(() => ({ ok: false, command: 'hermes model' })); draw() })
    on('[data-reopen]', () => api('/api/setup/account', { reopen: true }).catch(() => {}))
    on('[data-cancel]', async () => { const r = await api('/api/setup/account', { cancel: true }).catch(() => null); if (r?.account) S.view.account = r.account; draw() })
    on('[data-copy]',e => navigator.clipboard?.writeText(e.currentTarget.dataset.copy).catch(() => {}))
    // a redraw keeps the keyboard where it was
    const again = focus && (focus.row ? `[data-row="${focus.row}"]` : focus.pic ? `[data-pic="${focus.pic}"]` : focus.sign ? `[data-sign="${focus.sign}"]` : null)
    if (again) dlg.body.querySelector(again)?.focus({ preventScroll: true })
  }

  async function test(again = false) {
    S.test = null
    draw()
    S.test = await api('/api/setup/models', { again }).catch(() => undefined)
    // a model that does not answer opens its row: the marker first, the message one tap in (rule 10)
    if (S.test && !S.test.ok && !S.open) S.open = 'models'
    draw()
  }

  // closing it any way counts as seen: nothing here is required
  const seen = () => { if (S.view && !S.view.seen) { S.view.seen = true; api('/api/setup', { seen: true }).catch(() => {}) } }

  async function open() {
    if (dlg && !dlg.closed) return
    S.view = await api('/api/setup').catch(() => null)
    if (!S.view?.models) return
    Object.assign(S, { open: S.view.account?.pending ? 'account' : '', hermes: null, signError: '' })
    dlg = window.SwarmUI.dialog({ title: 'Setup', className: 'su', body: '', footer: '<button type="button" class="ui-btn ui-btn-default su-start">Start</button>', onClose: seen })
    dlg.footer.querySelector('.su-start').onclick = () => dlg.close('start')
    S.test = S.view.test || undefined
    draw()
    // the test is kept by the server for ten minutes, so opening the sheet again costs nothing
    test()
    watch()
  }

  return {
    open,
    // once, the first time Projects shows
    async first() {
      const v = await api('/api/setup').catch(() => null)
      if (v && v.models && v.seen === false) open()
    }
  }
}
