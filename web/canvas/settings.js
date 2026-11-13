// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): lite mode, the models menu, side tabs and floating panels.
import { S, BOOT, els, cam, FRAME_W, api, store, $, ico } from './core.js'
import { belongs } from './deck.js'
import { FRAME_SANDBOX } from './base.js'
import { review, snapFrame } from './marks.js'
import { feed } from './panels.js'
import { esc, design, showDtab } from './design.js'
import { closeable } from './start.js'

// ---------- lite mode
// For machines short on memory: only the page in front of you stays a live
// frame. Every other finished page becomes a flat snapshot and its iframe is
// unloaded; it comes back live as soon as you zoom into it or an agent works on it.

export const lite = { last: 0, busy: false, quiet: 0 }
// Auto: on for small machines, and for everyone once the agents have been done
// for half a minute (a finished build doesn't need every page live).
const liteOn = () => (modelsInfo.lite ?? ((navigator.deviceMemory || 8) <= 4 || (S.frames.length > 1 && performance.now() - lite.quiet > 5000)))

const frameSig = f => [...f.slots.keys()].map(k => S.layers.get(k)?.ver || 0).join('.')
export const frameBusy = f => S.order.some(k => { const l = S.layers.get(k); return belongs(f, l) && l.status !== 'done' && l.status !== 'failed' })

function freeze(f, image) {
  if (f.frozen) return
  const img = document.createElement('img')
  img.className = 'snap'
  img.src = image
  img.style.height = `${f.h}px`
  f.el.append(img)
  f.iframe.remove()
  f.frozen = { img, sig: frameSig(f) }
  // kept past the next thaw: a page that has not changed rests again on this picture, with no new
  // screenshot (the screenshot of a long page is the most expensive thing the canvas does)
  f.rest = { image, sig: f.frozen.sig, h: f.h }
  f.ready = false
}

export function thaw(f) {
  if (!f.frozen) return
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-label', f.title || 'Page')
  iframe.setAttribute('sandbox', FRAME_SANDBOX)
  iframe.style.height = `${f.h}px`
  if (BOOT.frameHtml) iframe.srcdoc = BOOT.frameHtml
  else iframe.src = 'frame.html'
  f.el.insertBefore(iframe, f.frozen.img)
  // the snapshot stays on top until the live page has been drawn again
  const img = f.frozen.img
  setTimeout(() => img.remove(), 1200)
  f.iframe = iframe
  f.slots.clear()
  // the old page's geometry is gone with it; the new one reports its own
  f.geo = { ...f.geo, height: 0 }
  f.frozen = null
}

export async function litePass() {
  if (S.frames.some(frameBusy) || !S.frames.length) lite.quiet = performance.now()
  // Play covers the canvas, so its pages can all rest while you click through
  const playing = !els.player.hidden
  const on = modelsInfo.lite !== false && (playing || liteOn())
  document.body.classList.toggle('lite', on)
  if (!on) { S.frames.forEach(thaw); return }
  // the reviewer needs its pages live
  if (lite.busy || review.busy) return
  // Not while the camera moves, nor just after: bringing a page back live reloads it and resting one
  // takes its screenshot, and either one in the middle of a zoom or pan is a stall of hundreds of ms.
  if (performance.now() - (cam.movedAt || 0) < 900) return
  // the page you are reading: the most visible one, once zoomed in enough to read
  const vw = els.viewport.clientWidth
  let keep = null, best = 0
  // (behind the project's canvas nobody is reading a page here: they can all rest)
  if (cam.s >= 0.2 && !playing && !els.viewport.classList.contains('behind')) for (const f of S.frames) {
    const x0 = f.x * cam.s + cam.x, x1 = x0 + FRAME_W * cam.s
    const seen = Math.min(vw, x1) - Math.max(0, x0)
    if (seen > best) { best = seen; keep = f }
  }
  for (const f of S.frames) {
    const wanted = f === keep || frameBusy(f) || (S.sel && S.sel.startsWith(`${f.id}/`))
    if (f.frozen && (wanted || f.frozen.sig !== frameSig(f))) thaw(f)
    else if (!f.frozen && !wanted && f.ready && f.slots.size) {
      // unchanged since it last rested: the picture it had then
      if (f.rest && f.rest.sig === frameSig(f) && f.rest.h === f.h) { freeze(f, f.rest.image); continue }
      // a screenshot that failed is not tried again every second: it costs seconds each time
      if (f.restFailed && performance.now() - f.restFailed < 60000) continue
      lite.busy = true
      try {
        // sharp on a Retina screen at the zoom where pages rest
        const shot = await snapFrame(f, Math.min(1, 0.5 * (devicePixelRatio || 1)))
        f.restFailed = 0
        if (!frameBusy(f) && f !== keep) freeze(f, shot.image)
      } catch { f.restFailed = performance.now() }
      lite.busy = false
      return // one page per pass keeps it smooth
    }
  }
}

// ---------- models menu
// Planner, builders, reviewer and images. A pick is saved by the server in the
// plugin's own data dir; an empty one goes back to what Hermes is set to.

export let modelsInfo = {}
// Under Hermes the planner and builders are Hermes's own slots: their model comes from Hermes's list
// (GET /api/setup/models/options) and is changed in Setup's picker, never typed here (spec 6)
let hermesModels = null
export async function loadModels() {
  const [res, h] = await Promise.all([api('/api/models').catch(() => null), api('/api/setup/models/options').catch(() => null)])
  if (res?.ok) modelsInfo = await res.json()
  const opts = h?.ok ? await h.json().catch(() => null) : null
  hermesModels = opts?.ok ? opts : null
  return modelsInfo
}
const hermesUses = role => {
  const s = hermesModels?.slots?.[role]
  return s?.model ? s : hermesModels?.main?.model ? hermesModels.main : null
}
loadModels()
// Settings › Lite mode saved a pick: read it again
addEventListener('swarm:models', () => { loadModels() })

const ROLE_ROWS = [
  { role: 'planner', label: 'Planner', note: 'plans the pages and the design system', list: 'text' },
  { role: 'worker', label: 'Builders', note: 'every agent that writes a section', list: 'text' },
  { role: 'reviewer', label: 'Reviewer', note: 'looks at screenshots after a build (needs vision)', list: 'vision', off: true }
]
export const models = { el: null }

export async function saveModel(body) {
  const res = await api('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  if (!res?.ok) feed(null, 'could not save that model pick', 'err')
  await loadModels()
  if (models.el) renderModels()
  if (body.role === 'worker' && typeof fillBuildModel === 'function') fillBuildModel()
}

function renderModels() {
  const info = modelsInfo
  const rows = ROLE_ROWS.map(r => {
    const s = info.roles?.[r.role] || {}
    const h = r.role !== 'reviewer' && hermesModels ? hermesUses(r.role) : null
    if (h || (r.role !== 'reviewer' && hermesModels)) return `<div class="mrow"><span class="mlabel">${r.label}<small>${r.note}</small></span>
      <span class="mfield"><b class="mnow-model">${esc(h?.model || 'None')}</b><button data-change>Change</button></span>
      <small class="mnow">${h ? `Hermes · ${esc(h.provider)}` : 'not set in Hermes'}</small></div>`
    const off = s.picked === 'off'
    return `<label class="mrow"><span class="mlabel">${r.label}<small>${r.note}</small></span>
      <span class="mfield"><input data-role="${r.role}" data-list="${r.list}" autocomplete="off" spellcheck="false" placeholder="${esc(s.hermes || (r.off ? 'off' : 'model id'))}" value="${off ? '' : esc(s.picked || '')}" ${off ? 'disabled' : ''}>
      ${r.off ? `<button data-off="${r.role}" class="${off ? 'on' : ''}">${off ? 'Turn on' : 'Turn off'}</button>` : ''}</span>
      <small class="mnow">${off ? 'off' : s.picked ? `picked · Hermes has ${esc(s.hermes || 'none')}` : s.hermes ? `from Hermes · ${esc(s.host || '')}` : 'not set in Hermes'}</small></label>`
  }).join('')
  const pick = info.image?.pick
  const cur = pick === 'off' ? 'off' : pick ? `${pick.provider}|${pick.model}` : ''
  const opts = (info.image?.providers || []).flatMap(p => (p.models.length ? p.models : [p.default || '']).map(m =>
    `<option value="${esc(`${p.provider}|${m}`)}" ${p.available ? '' : 'disabled'} ${cur === `${p.provider}|${m}` ? 'selected' : ''}>${esc(p.provider)}${m ? ` · ${esc(m)}` : ''}${p.available ? '' : ' (not signed in)'}</option>`)).join('')
  models.el.innerHTML = `<div class="mhead pop-title">Pick the <em>models</em> <small>${hermesModels ? 'planner and builders are set in Hermes' : 'picks stay in Swarm Studio; Hermes\'s config is untouched'}</small></div>${rows}
    <label class="mrow"><span class="mlabel">Images<small>paints photos and illustrations into the pages, with your Hermes image login</small></span>
      <span class="mfield"><select data-image>
        <option value="" ${cur === '' ? 'selected' : ''}>Auto (Codex login, gpt-image-2-low)</option>
        <option value="off" ${cur === 'off' ? 'selected' : ''}>Off: shapes and SVG only</option>${opts}
      </select></span>
      <small class="mnow">${info.image?.providers ? `${info.image.providers.filter(p => p.available).length} providers signed in` : 'looking for Hermes image providers…'}</small></label>
    <label class="mrow"><span class="mlabel">Lite mode<small>for machines short on memory: one live page at a time, the rest become snapshots</small></span>
      <span class="mfield"><select data-lite>
        <option value="" ${info.lite == null ? 'selected' : ''}>Auto (${(navigator.deviceMemory || 8) <= 4 ? 'on' : 'off'} on this device)</option>
        <option value="on" ${info.lite === true ? 'selected' : ''}>On</option>
        <option value="off" ${info.lite === false ? 'selected' : ''}>Off</option>
      </select></span></label>
    <div class="mfoot">Each image is one call to that provider and uses its quota. Changes apply to the next build.</div>`
}

// The model fields' suggestions: our own scrolling list (a <datalist> popup can't
// scroll in some embedded browsers, Hermes Desktop's among them). Type to filter.
function modelCombo(root, signal) {
  let box = null, input = null, at = -1
  const close = () => { box?.remove(); box = null; input = null; at = -1 }
  const show = el => {
    const all = modelsInfo[el.dataset.list] || [], q = el.value.trim().toLowerCase()
    const hits = (q && all.includes(el.value.trim()) ? all : all.filter(m => m.toLowerCase().includes(q))).slice(0, 400)
    if (!box) { box = Object.assign(document.createElement('div'), { className: 'combo-list' }); document.body.append(box) }
    input = el
    const r = el.getBoundingClientRect()
    const below = innerHeight - r.bottom - 12
    Object.assign(box.style, { left: `${r.left}px`, width: `${r.width}px`, ...(below > 180 ? { top: `${r.bottom + 4}px`, bottom: '', maxHeight: `${Math.min(320, below)}px` } : { top: '', bottom: `${innerHeight - r.top + 4}px`, maxHeight: `${Math.min(320, r.top - 12)}px` }) })
    box.innerHTML = hits.length ? hits.map((m, i) => `<div data-m="${esc(m)}" class="${i === at ? 'on' : ''}">${esc(m)}</div>`).join('') : '<small>No match: press Enter to use it as typed</small>'
  }
  const choose = m => { const el = input; close(); el.value = m; el.dispatchEvent(new Event('change', { bubbles: true })) }
  root.addEventListener('focusin', e => { if (e.target.dataset.list) { at = -1; show(e.target) } })
  root.addEventListener('input', e => { if (e.target.dataset.list) { at = -1; show(e.target) } })
  root.addEventListener('focusout', e => { if (e.target === input) setTimeout(() => { if (document.activeElement !== input) close() }, 120) })
  root.addEventListener('keydown', e => {
    if (!box || e.target !== input) return
    const rows = box.querySelectorAll('[data-m]')
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      at = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
      rows.forEach((r, i) => r.classList.toggle('on', i === at))
      rows[at]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && rows[at]) { e.preventDefault(); choose(rows[at].dataset.m) }
    else if (e.key === 'Escape') { e.stopPropagation(); close() }
  })
  document.addEventListener('mousedown', e => {
    // @ts-ignore
    const row = box && e.target.closest?.('.combo-list [data-m]')
    if (row) { e.preventDefault(); choose(row.dataset.m) }
    else if (box && !box.contains(e.target) && e.target !== input) close()
  }, { signal })
  root.addEventListener('scroll', close)
}

// anchor: what it opens from when that isn't ☰ (Projects' user menu, which has no ☰ of its own)
export function toggleModels(open = !models.el, anchor = null) {
  if (!open) { models.ac?.abort(); document.querySelector('.combo-list')?.remove(); models.el?.remove(); models.el = null; els.modelsBtn.classList.remove('on'); return }
  if (models.el) return
  models.el = document.createElement('div')
  models.el.className = 'models-pop'
  document.body.append(models.el)
  if (anchor) {
    // beside the anchor, opening upward when it sits low on the screen (the user menu is bottom left)
    const r = anchor.getBoundingClientRect()
    models.el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - models.el.offsetWidth - 8))}px`
    if (r.top > innerHeight / 2) Object.assign(models.el.style, { bottom: `${innerHeight - r.top + 6}px`, maxHeight: `${r.top - 14}px` })
    else models.el.style.top = `${r.bottom + 6}px`
  } else {
    const r = (els.modelsBtn.offsetParent ? els.modelsBtn : moreBtn).getBoundingClientRect()
    models.el.style.top = `${r.bottom + 6}px`
    models.el.style.right = `${Math.max(8, innerWidth - r.right)}px`
    els.modelsBtn.classList.add('on')
  }
  closeable(models.el, () => toggleModels(false), { extra: [els.modelsBtn, moreBtn, '.combo-list', '#more-menu', anchor].filter(Boolean) })
  renderModels()
  loadModels().then(() => models.el && !models.el.contains(document.activeElement) && renderModels())
  models.ac = new AbortController()
  modelCombo(models.el, models.ac.signal)
  models.el.addEventListener('change', e => {
    const t = e.target
    if (t.dataset.role) {
      const m = t.value.trim()
      if (m) store.set('recentModels', [m, ...(store.get('recentModels') || []).filter(x => x !== m)].slice(0, 6))
      saveModel({ role: t.dataset.role, model: m || null })
    }
    if (t.dataset.lite !== undefined) saveModel({ role: 'lite', on: t.value === '' ? null : t.value === 'on' })
    if (t.dataset.image !== undefined) {
      const [provider, model] = t.value.split('|')
      saveModel({ role: 'image', provider: t.value === 'off' ? 'off' : provider || null, model: model || '' })
    }
  })
  models.el.addEventListener('click', e => {
    if (e.target.closest('[data-change]')) { e.preventDefault(); toggleModels(false); window.SwarmSetup?.open('models'); return }
    const b = e.target.closest('[data-off]')
    if (!b) return
    e.preventDefault()
    const role = b.dataset.off
    saveModel({ role, model: modelsInfo.roles?.[role]?.picked === 'off' ? null : 'off' })
  })
}
els.modelsBtn.onclick = e => { e.stopPropagation(); toggleModels() }
document.addEventListener('mousedown', e => { if (models.el && !models.el.contains(e.target) && e.target !== els.modelsBtn) toggleModels(false) })
window.addEventListener('keydown', e => { if (e.key === 'Escape' && models.el) toggleModels(false) })

// ---------- side tabs and floating panels

export function showTab(name) {
  // @ts-ignore
  for (const el of document.querySelectorAll('.side [data-tab]')) el.classList.toggle('on', el.dataset.tab === name)
  store.set('tab', name)
}
// @ts-ignore
for (const b of document.querySelectorAll('.side .tabs button[data-tab]')) b.onclick = () => showTab(b.dataset.tab)

// Design opens by itself when a section (or an agent to follow) is picked, so it isn't kept from before
export const panels = new Set(store.get('panels', []).filter(p => p !== 'design'))
export function renderPanels() {
  // @ts-ignore
  for (const el of document.querySelectorAll('[data-panel]')) el.classList.toggle('on', panels.has(el.dataset.panel))
  document.body.classList.toggle('design-on', panels.has('design'))
  $('.float.agents-card').classList.toggle('below', panels.has('planner'))
}
export function togglePanel(p) {
  panels.has(p) ? panels.delete(p) : panels.add(p)
  if (p === 'design') { design.autoOpen = false; design.closedFor = panels.has(p) ? null : S.sel || design.pinned || null }
  store.set('panels', [...panels])
  renderPanels()
}
// @ts-ignore
for (const b of document.querySelectorAll('.toggle[data-panel]')) b.onclick = () => togglePanel(b.dataset.panel)

// The Design panel follows the selection: open while a section or agent is
// picked, closed again after, unless the person opened or closed it themself.
setInterval(() => {
  // the project canvas has its own inspector for a picked section
  const want = document.body.classList.contains('cosmos-project') ? null : S.sel || design.pinned || null
  if (want && !panels.has('design') && design.closedFor !== want) { panels.add('design'); design.autoOpen = true; renderPanels() }
  else if (!want && panels.has('design') && design.autoOpen) { panels.delete('design'); design.autoOpen = false; renderPanels() }
  if (!want) design.closedFor = null
}, 250)
$('#design-close').onclick = () => { if (panels.has('design')) togglePanel('design') }

// ☰ More: the toolbar's less-used buttons
const moreMenu = $('#more-menu'), moreBtn = $('#more-btn')
moreBtn.onclick = e => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; moreBtn.classList.toggle('on', !moreMenu.hidden); if (!moreMenu.hidden) closeable(moreMenu, () => { moreMenu.hidden = true; moreBtn.classList.remove('on') }, { extra: [moreBtn] }) }
moreMenu.addEventListener('click', () => setTimeout(() => { moreMenu.hidden = true; moreBtn.classList.remove('on') }))
// @ts-ignore
document.addEventListener('mousedown', e => { if (!moreMenu.hidden && !e.target.closest('.more')) { moreMenu.hidden = true; moreBtn.classList.remove('on') } })

// ☰ → Light / Dark. The system's choice by default (prefers-color-scheme); a pick here is kept.
// The page's colours follow at once (tokens only now: nothing is drawn from them, so no reload,
// which used to drop a project back to Projects).
const themeBtn = $('#theme-btn'), sysLight = matchMedia('(prefers-color-scheme: light)')
const theme = () => document.documentElement.dataset.theme || (sysLight.matches ? 'light' : 'dark')
function themeLabel() { const next = theme() === 'light' ? 'dark' : 'light'; themeBtn.innerHTML = `${ico(next === 'light' ? 'sun' : 'moon')}${next === 'light' ? 'Light' : 'Dark'}` }
export const toggleTheme = () => setTheme(theme() === 'light' ? 'dark' : 'light')
function setTheme(t) {
  const before = theme()
  document.documentElement.dataset.theme = t
  try { localStorage.setItem('swarm-theme', t) } catch {}
  themeLabel()
  if (theme() !== before) dispatchEvent(new CustomEvent('swarm:theme', { detail: theme() }))
}
themeBtn.onclick = toggleTheme
sysLight.addEventListener('change', () => { if (!document.documentElement.dataset.theme) themeLabel() })
themeLabel()

// The side panel can shrink to a small chat over the canvas; the chat stays.
function sideMin(on = !document.body.classList.contains('side-min')) {
  document.body.classList.toggle('side-min', on)
  store.set('sideMin', on)
  if (on) showTab('chat')
  $('#side-min').textContent = on ? '⇥' : '⇤'
  $('#side-min').setAttribute('aria-label', on ? 'Full side panel' : 'Shrink the side panel')
}
$('#side-min').onclick = () => sideMin()
if (store.get('sideMin')) sideMin(true)

// The builders' model, right where a build starts (the rest live in Models)
const buildModel = $('#build-model')
// a short list: the pick, the ones picked lately and the planner's; "Other…" opens the full search in Models
async function fillBuildModel() {
  const info = await loadModels()
  const s = info.roles?.worker || {}
  const recent = store.get('recentModels') || []
  const list = [...new Set([s.picked, ...recent, info.roles?.planner?.picked, info.roles?.planner?.hermes].filter(m => m && m !== 'off' && m !== s.hermes))].slice(0, 8)
  const short = m => m.split('/').pop()
  buildModel.innerHTML = `<option value="">${esc(s.hermes ? short(s.hermes) : 'Hermes default')}</option>${list.map(m => `<option value="${esc(m)}" ${m === s.picked ? 'selected' : ''}>${esc(short(m))}</option>`).join('')}<option value="__other">Other… (${(info.text || []).length} models)</option>`
}
buildModel.onchange = async () => {
  if (buildModel.value === '__other') { fillBuildModel(); return toggleModels(true) }
  if (buildModel.value) store.set('recentModels', [buildModel.value, ...(store.get('recentModels') || []).filter(m => m !== buildModel.value)].slice(0, 6))
  await saveModel({ role: 'worker', model: buildModel.value || null })
}
fillBuildModel()
// @ts-ignore
for (const b of document.querySelectorAll('.dtabs button')) b.onclick = () => { design.tabPinned = true; showDtab(b.dataset.dtab) }
