// The Studio's scaffold (docs/specs/37-studio-first.md): a Studio project before anything is built. The
// shared board (web/board.js) with the kind's steps as sections, each named, with a dot for its state:
// Brand, References, Assets, Plan (the kit's own cards) and Lock. The chat stays on the left, where the
// planner says where to start. Steps go in any order and any can be skipped; Build is the person's press.
// (web/studio.js is the studio controller; this is one of its views, like web/plan.js and web/brand.js.)
//
//   ctx, what every kit is handed: { project, studio, brand, refs, assets, chat, sw, C, board, state,
//   look, save(data), select(key), say(text) }. state is the kit's own saved state; look the brand's
//   picked colours and fonts ({ bg, text, accent, link, heading, body }) or null.
import { ic } from './icons.js'
import { makeBoard } from './board.js'
import { KITS } from './kits.js'

const STEP_NAME = { brand: 'Brand', references: 'References', assets: 'Assets', plan: 'Plan', proposal: 'Lock' }
const STATE_NAME = { empty: 'Empty', started: 'Started', done: 'Done', skipped: 'Skipped' }
const CHAT_KIND = { site: 'site', app: 'app', game: 'game', video: 'film', deck: 'site', brand: 'site' }

export function makeScaffold({ sw, C, root }) {
  const esc = sw.esc
  const A = { on: false, pid: null, d: null, sel: null, framed: false, busy: false, talked: null, cards: new Map() }

  const bd = makeBoard({ root, cls: 'project plan scaffold', label: 'Studio', fit: [0.35, 1], on: () => A.on, selected: () => !!A.sel, clear: () => select(null) })
  const { world, insp } = bd

  // ---------- the top bar: Projects › the project's name, and Build
  const bar = document.querySelector('.topbar')
  const crumb = document.createElement('div')
  crumb.className = 'sc-crumb'
  crumb.innerHTML = `<button class="sc-up">Projects</button>${ic('chr', 14)}<b class="sc-name"></b>`
  bar?.querySelector('.spacer')?.before(crumb)
  crumb.querySelector('.sc-up').onclick = () => C.go('home')
  const primary = document.createElement('button')
  primary.className = 'toggle sc-primary pri'
  primary.innerHTML = '<span class="t">Build</span>'
  bar?.querySelector('.spacer')?.after(primary)
  primary.onclick = () => build()

  // one file picker for both stores
  const picker = document.createElement('input')
  picker.type = 'file'
  picker.multiple = true
  picker.hidden = true
  root.append(picker)
  picker.onchange = () => { upload(picker.dataset.to, [...picker.files]); picker.value = '' }

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  const kit = () => KITS[A.d?.studio.kind] || KITS.site
  const at = p => `/api/studio/${encodeURIComponent(A.pid)}${p}`
  const proj = p => `/api/projects/${encodeURIComponent(A.pid)}${p}`
  function take(d) { if (d.project?.id === A.pid) { A.d = { ...A.d, ...d }; render() } }
  const fail = err => bd.toast(err.message)
  async function load() {
    const pid = A.pid
    try {
      const d = await api(at(''))
      if (pid !== A.pid) return
      A.d = d
      // a kit that loads or drafts its own state does it once, before its cards are drawn
      if (kit().prepare && A.prepared !== pid && d.studio.idea) { A.prepared = pid; await kit().prepare(ctx()) }
      if (pid === A.pid) render()
    } catch (err) { fail(err) }
  }

  // the brand's picked palette and type, for the kits' samples
  function look(b) {
    if (!b?.palettes?.length) return null
    const p = b.palettes.find(x => x.id === b.pick?.palette) || b.palettes[0]
    const t = (b.types || []).find(x => x.id === b.pick?.type) || b.types?.[0] || {}
    return { bg: p.bg, text: p.text, accent: p.accent, link: p.link, heading: t.heading || '', body: t.body || '' }
  }
  function ctx() {
    const d = A.d
    return {
      project: d.project, studio: d.studio, brand: d.brand, refs: d.refs, assets: d.assets, chat: d.studio.chat, sw, C, board: bd,
      state: d.studio.kit || {}, look: look(d.brand),
      save: data => post(at('/kit'), { data }).then(take).catch(fail),
      select: key => select(key),
      refresh: () => { if (A.on) render() },
      say: text => sw.say?.(text)
    }
  }

  // ---------- each step's state: what is there, unless the person skipped it
  function stateOf(step) {
    const d = A.d, kept = d.studio.steps[step]
    if (kept === 'skipped') return 'skipped'
    if (step === 'brand') return d.brand?.lockedAt ? 'done' : d.brand ? 'started' : 'empty'
    if (step === 'references') return d.refs.length ? 'done' : 'empty'
    if (step === 'assets') return d.assets.length ? 'done' : 'empty'
    if (step === 'plan') return kit().plan?.done?.(ctx()) ? 'done' : Object.keys(d.studio.kit || {}).length ? 'started' : 'empty'
    if (step === 'proposal') return d.studio.locked ? 'done' : d.studio.proposal ? 'started' : 'empty'
    return 'empty'
  }
  // the record follows what the board shows
  function sync() {
    for (const s of Object.keys(A.d.studio.steps)) {
      const now = stateOf(s)
      if (now !== A.d.studio.steps[s]) { A.d.studio.steps[s] = now; post(at('/step'), { step: s, state: now }).catch(() => {}) }
    }
  }

  // ---------- render
  const sel = key => (A.sel === key ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : '')
  const card = (key, name, cls, inner = '') => `<div class="ab ${cls}" data-key="${esc(key)}" tabindex="0" role="button" aria-label="${esc(name)}">${inner}${sel(key)}</div>`
  const addCard = (key, name) => card(key, name, 'sc-add', `${ic('plus', 18)}<span>${esc(name)}</span>`)
  const thumb = (kind, x) => {
    const inner = x.kind === 'image' && x.src ? `<img src="${esc((sw.base || '') + x.src)}" alt="" draggable="false" loading="lazy">`
      : `<div class="sc-file">${ic(x.kind === 'link' ? 'link' : x.kind === 'video' ? 'film' : x.kind === 'audio' ? 'music' : x.kind === 'font' ? 'type' : 'file', 22)}</div>`
    return card(`${kind}:${x.id}`, x.name, 'sc-thumb', `${inner}<em>${esc(x.role || x.name)}</em>`)
  }
  function brandCard() {
    const b = A.d.brand, L = look(b)
    if (!b) return card('brand:open', 'Brand sheet', 'pcard sc-brand-new', `<b>Brand sheet</b><span>${ic('sliders', 22)}</span>`)
    return card('brand:open', 'Brand sheet', 'sc-brand', `<div class="br-sw">${['bg', 'text', 'accent', 'link'].map(k => `<i style="background:${esc(L[k])}"></i>`).join('')}</div>
      <div class="sc-type" style="background:${esc(L.bg)};color:${esc(L.text)}"><b style="font-family:'${esc(L.heading)}'">Aa</b><span style="font-family:'${esc(L.body)}'">${esc(L.heading)} · ${esc(L.body)}</span></div><em>${b.lockedAt ? 'Locked' : 'Open'}</em>`)
  }

  function render() {
    if (!A.d) { world.innerHTML = '<div class="col"><section class="pj-sec"><span class="al">Studio</span><div class="abs"><div class="ab pcard wait-in"><b>Brand</b><span></span></div></div></section></div>'; return }
    sync()
    const k = kit(), c = ctx(), d = A.d
    crumb.querySelector('.sc-name').textContent = d.project.title || d.project.name
    primary.hidden = !k.build
    primary.disabled = A.busy
    A.cards.clear()
    const head = step => { const st = stateOf(step); return `<span class="al"><i class="sc-dot ${st}" role="img" aria-label="${STATE_NAME[st]}"></i>${STEP_NAME[step]}</span>` }
    const sec = (step, inner, cls = '') => `<section class="pj-sec sc-step ${cls}" data-sec="${step}">${head(step)}<div class="abs">${inner}</div></section>`
    const parts = []
    for (const step of k.steps) {
      if (step === 'brand') parts.push(sec('brand', brandCard()))
      if (step === 'references') parts.push(sec('references', `${d.refs.map(r => thumb('ref', r)).join('')}${addCard('ref:add', 'Add reference')}`))
      if (step === 'assets') parts.push(sec('assets', `${d.assets.map(a => thumb('asset', a)).join('')}${addCard('asset:add', 'Add asset')}`))
      if (step === 'plan' && k.plan) {
        const cards = k.plan.sections(c).flatMap(s => s.cards)
        for (const x of cards) A.cards.set(x.key, x)
        // a card's look: its cls, or add (a + card) and wide; with no render, its name (the kit's own board draws it)
        const look = x => `${x.cls || (x.add ? 'sc-add' : 'pcard')}${x.wide ? ' sc-wide' : ''}`
        parts.push(sec('plan', cards.map(x => card(x.key, x.name, look(x), x.render ? '' : `<b>${esc(x.name)}</b>`)).join(''), `sc-plan-${k.kind}`))
      }
    }
    parts.push(sec('proposal', card('lock:idea', 'Idea', 'pcard sc-idea', `<b>Idea</b><span>${esc(d.studio.idea)}</span>`)))
    world.innerHTML = `<div class="col">${parts.join('')}</div>`
    // the kit draws its own cards
    for (const [key, x] of A.cards) { const el = world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`); if (el) { x.render?.(el, c); if (A.sel === key) el.insertAdjacentHTML('beforeend', sel(key)) } }
    bd.applyCam()
    if (!A.framed && world.offsetWidth) { A.framed = true; bd.frameAll(false) }
    renderInsp()
  }

  // ---------- the inspector: the selected card's own controls
  function renderInsp() {
    const key = A.sel
    bd.inspector(!!(A.d && key))
    if (insp.hidden) return
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, select')) return
    const [part, id] = key.split(':')
    const x = A.cards.get(key)
    const name = x?.name || (part === 'ref' ? A.d.refs.find(r => r.id === id)?.name : part === 'asset' ? A.d.assets.find(a => a.id === id)?.name : part === 'lock' ? 'Idea' : '')
    if (!name) return select(null)
    insp.innerHTML = `<h3><span>${esc(name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><div class="sc-body"></div>`
    const box = insp.querySelector('.sc-body')
    insp.querySelector('.pj-x').onclick = () => select(null)
    if (x) return x.inspect?.(box, ctx())
    if (part === 'ref') {
      box.innerHTML = `<div class="sc-acts"><button class="btn ghost" data-a="given">${ic('pin', 15)}Use as given</button><button class="btn ghost" data-a="remove">${ic('trash', 15)}Remove</button></div>`
      box.onclick = e => {
        const a = e.target.closest('[data-a]')?.dataset.a
        if (a === 'given') post(proj('/assets'), { ref: id }).then(j => { A.d.refs = j.refs; A.d.assets = j.assets; select(`asset:${j.asset.id}`) }).catch(fail)
        if (a === 'remove') post(proj(`/refs/${id}/remove`)).then(j => { A.d.refs = j.refs; select(null) }).catch(fail)
      }
      return
    }
    if (part === 'asset') {
      const as = A.d.assets.find(a => a.id === id)
      box.innerHTML = `<label class="pl-f"><span>Role</span><select data-role>${['logo', 'product', 'photo', 'font', 'pack', 'other'].map(r => `<option value="${r}"${r === as.role ? ' selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></label>
        <div class="sc-acts"><button class="btn ghost" data-a="ref">${ic('image', 15)}Use as reference</button><button class="btn ghost" data-a="remove">${ic('trash', 15)}Remove</button></div>`
      box.querySelector('[data-role]').onchange = e => post(proj(`/assets/${id}/role`), { role: e.target.value }).then(j => { A.d.assets = j.assets; render() }).catch(fail)
      box.onclick = e => {
        const a = e.target.closest('[data-a]')?.dataset.a
        if (a === 'ref') post(proj(`/assets/${id}/reference`)).then(j => { A.d.refs = j.refs; A.d.assets = j.assets; select(`ref:${j.ref.id}`) }).catch(fail)
        if (a === 'remove') api(proj(`/assets/${id}`), { method: 'DELETE' }).then(j => { A.d.assets = j.assets; select(null) }).catch(fail)
      }
      return
    }
    if (part === 'lock') box.innerHTML = `<p class="sc-idea-full">${esc(A.d.studio.idea)}</p>`
  }

  function select(key) {
    A.sel = key
    insp.innerHTML = ''
    // the step it is in is where the person is (the address follows)
    const step = key && world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`)?.closest('[data-sec]')?.dataset.sec
    if (step && C.nav.view.room === 'studio' && C.nav.view.step !== step) C.nav.go({ type: 'studio.step', step })
    render()
  }
  function press(el) {
    const key = el.dataset.key
    const x = A.cards.get(key)
    if (x?.press) return x.press(ctx())
    if (key === 'brand:open') return openBrand()
    if (key === 'ref:add' || key === 'asset:add') { picker.dataset.to = key.split(':')[0]; return picker.click() }
    select(key)
  }
  world.addEventListener('click', e => { const a = e.target.closest('.ab[data-key]'); if (a) press(a) })
  world.addEventListener('keydown', e => { const a = e.target.closest('.ab[data-key]'); if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); press(a) } })
  // files dropped on References or Assets go to that store
  root.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files') && e.target.closest?.('[data-sec="references"], [data-sec="assets"]')) e.preventDefault() })
  root.addEventListener('drop', e => {
    const s = e.target.closest?.('[data-sec="references"], [data-sec="assets"]')
    if (!s || !e.dataTransfer?.files?.length) return
    e.preventDefault()
    upload(s.dataset.sec === 'assets' ? 'asset' : 'ref', [...e.dataTransfer.files])
  })

  async function upload(to, files) {
    for (const f of files.slice(0, 12)) {
      const q = `?name=${encodeURIComponent(f.name)}&source=upload`
      try {
        const j = await api(proj(to === 'asset' ? `/assets${q}` : `/refs${q}`), { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f })
        if (to === 'asset') A.d.assets = j.assets; else A.d.refs = j.refs
        render()
      } catch (err) { fail(err) }
    }
  }

  // ---------- the brand sheet, on the project's own brand
  function openBrand() {
    const d = A.d
    C.brand({ project: A.pid, brief: d.studio.idea, kind: d.studio.kind === 'app' ? 'app' : 'site', done: () => {} })
  }

  // ---------- the chat on the left: the talk on the Studio's chat, and the planner's start
  // where the planner says to start: one of the kit's starts, from what the project has so far
  function startOf() {
    const k = kit()
    const first = k.suggest?.(ctx()) || A.d.studio.start
    return k.starts.find(s => s.id === first) || k.starts[0] || null
  }
  function talk() {
    const d = A.d
    if (!sw.talk || A.talked === A.pid) return
    A.talked = A.pid
    const k = kit()
    // opened with an empty box: the chat asks, and the first words become the idea (and the project's name)
    const pid = A.pid
    const heard = text => {
      if (A.d?.studio.idea || pid !== A.pid) return
      post(at('/idea'), { idea: text }).then(() => { A.prepared = null; return load() }).catch(fail)
    }
    sw.talk.start({ kind: CHAT_KIND[d.studio.kind] || 'site', chat: d.studio.chat, blank: true, said: d.studio.idea ? [{ who: 'you', text: d.studio.idea }] : [], heard, build: brief => (k.build ? build(brief) : openBrand()) })
    if (!d.studio.idea) return sw.say?.('What are you making?')
    // a kit with prepare() posts its own planner line
    const st = k.prepare ? null : startOf()
    if (st) sw.say?.(st.why ? `Start with ${st.name}: ${st.why}.` : `Start with ${st.name}.`)
  }

  // ---------- Build: the person's press, through the kit
  async function build(idea) {
    const k = kit(), c = ctx()
    if (!k.build || A.busy) return
    A.busy = true
    render()
    try {
      const spec = { idea: idea || c.studio.idea, brand: A.d.brand, refs: A.d.refs.map(r => r.id), assets: A.d.assets.map(a => a.id), kits: { [k.kind]: k.lock?.(c) || {} } }
      const out = await k.build(spec, c)
      if (out?.run) C.started(out.run, { project: A.pid })
    } catch (err) { fail(err) } finally { A.busy = false; if (A.on) render() }
  }

  addEventListener('resize', () => { if (A.on && A.d) bd.frameAll(false) })

  return {
    el: root,
    get project() { return A.pid },
    // open the scaffold on a project, with one step in view (the planner's start when none is named)
    async show(pid, step = null) {
      A.on = true
      root.hidden = false
      if (pid !== A.pid) { A.pid = pid; A.d = null; A.sel = null; A.talked = null }
      A.framed = false
      render()
      await load()
      if (A.pid !== pid || !A.on || !A.d) return
      talk()
      // the step named (the address, Back), else the planner's start, which the address then names
      const to = step || startOf()?.id
      if (!to) return
      if (!step && C.nav.view.room === 'studio') C.nav.go({ type: 'studio.step', step: to })
      bd.focus(to, false)
    },
    hide() { A.on = false; root.hidden = true },
    focus: (target, animate = true) => bd.focus(target, animate)
  }
}
