// @ts-check
// The Studio's scaffold (docs/specs/37-studio-first.md): a Studio project before anything is built. The
// shared board (web/board.js) with the kind's steps as sections, each named, with a dot for its state:
// Brand, References, Assets, Plan (the kit's own cards) and Lock. The chat stays on the left, where the
// planner says where to start. Steps go in any order and any can be skipped; Build is the person's press.
// The step path across the top (docs/specs/42-ways-to-make.md) shows the record's steps: each opens on a click,
// and can be skipped, removed or brought back. A project begun as Three takes shows its Takes first: three
// looks to use one of, or mix in the brand sheet. A Scaffold is a Studio with only its Plan step.
// (web/studio.js is the studio controller; this is one of its views, like web/plan.js and web/brand.js.)
//
//   ctx, what every kit is handed: { project, studio, brand, refs, assets, chat, sw, C, board, state,
//   look, save(data), select(key), say(text) }. state is the kit's own saved state; look the brand's
//   picked colours and fonts ({ bg, text, accent, link, heading, body }) or null.
import { ic } from './icons.js'
import { matchHtml, matchClick, lookBusy, lookWorker, workLine, workHtml, lookPhase, lookSays, LOOK_POLL } from './lookmatch.js'
import { makeBoard } from './board.js'
import { KITS } from './kits.js'
import { layerTree, layerSheet } from './layers.js'

// what a project's builds use for pictures (web/setup.js's three)
const PICS = { painted: 'Painted', stock: 'Stock photos', drawn: 'Drawn' }
const STEP_NAME = { brand: 'Brand', references: 'References', assets: 'Assets', plan: 'Plan', proposal: 'Lock' }
const TAKES = 3
const STATE_NAME = { empty: 'Empty', started: 'Started', done: 'Done', skipped: 'Skipped' }
const CHAT_KIND = { site: 'site', app: 'app', game: 'game', video: 'film', deck: 'site', brand: 'site' }
// an asset's role as the person reads it: the role 'pack' (a set of brand files) is never called that (decision 0015)
const ROLE_NAME = { pack: 'Brand kit' }

export function makeScaffold({ sw, C, root }) {
  const esc = sw.esc
  const A = { on: false, pid: null, d: null, sel: null, framed: false, busy: false, wantsBuild: false, asking: null, talked: null, cards: new Map(), takes: null }

  const bd = makeBoard({ root, cls: 'project plan scaffold', label: 'Studio', fit: [0.35, 1], on: () => A.on, selected: () => !!A.sel, clear: () => select(null) })
  const { world, insp } = bd
  // the step path, over the board's top edge (the left panel is the chat's)
  const path = document.createElement('nav')
  path.className = 'sc-path'
  path.setAttribute('aria-label', 'Steps')
  root.append(path)

  // ---------- the left panel: Layers, every section on the board and what is in it (web/layers.js, the
  // same tree as the Overview's and the Design deck's). In a narrow pane it is a sheet from the Layers button.
  root.insertAdjacentHTML('afterbegin', `<aside class="pj-side" aria-label="Layers"><div class="pj-tabs" role="tablist"><span class="pj-tab on" role="tab" aria-selected="true">Layers</span></div><div class="pj-layers tree"></div></aside>`)
  root.insertAdjacentHTML('beforeend', `<button class="ib pj-files-btn sc-layers-btn" aria-label="Layers" aria-expanded="false">${ic('layers')}</button>`)
  const side = root.querySelector('.pj-side'), tree = root.querySelector('.pj-layers'), sheet = layerSheet(root, side, root.querySelector('.sc-layers-btn'))
  root.querySelector('.sc-layers-btn').onclick = () => sheet.set(!sheet.on)
  const shut = new Set()

  // ---------- the top bar: Projects › the project's name, and Build
  const bar = document.querySelector('.topbar')
  const crumb = document.createElement('div')
  crumb.className = 'sc-crumb'
  crumb.innerHTML = `<button class="sc-up">Projects</button>${ic('chr', 14)}<b class="sc-name"></b>`
  bar?.querySelector('.spacer')?.before(crumb)
  const up = /** @type {HTMLElement} */ (crumb.querySelector('.sc-up'))
  up.onclick = () => C.go('home')
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
      sayLooks()
      // Three takes: the first three looks of the project's brand (the planner's picks first, then the brief's
      // words), the brand made from the idea first; three waiting cards until then
      if (d.studio.mode === 'takes' && d.studio.idea && A.takes?.pid !== pid) {
        A.takes = { pid, packs: [] }
        const made = d.brand ? api(proj('/brand')) : post(proj('/brand'), { brief: d.studio.idea, kind: d.studio.kind === 'app' ? 'app' : 'site' })
        made.then(j => { if (A.takes?.pid !== pid) return; A.takes.packs = (j.packs || []).slice(0, TAKES); return load().then(() => { if (A.on && A.pid === pid) bd.focus('takes', false) }) }).catch(fail)
      }
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
    const shot = x.kind === 'link' && x.look?.shots?.[0]
    if (lookBusy(x) && !A.lookTimer) setTimeout(watchLooks)
    const inner = shot ? `<img src="${esc((sw.base || '') + shot)}" alt="" draggable="false" loading="lazy">`
      : x.kind === 'image' && x.src ? `<img src="${esc((sw.base || '') + x.src)}" alt="" draggable="false" loading="lazy">`
      : `<div class="sc-file">${ic(x.kind === 'link' ? 'link' : x.kind === 'video' ? 'film' : x.kind === 'audio' ? 'music' : x.kind === 'font' ? 'type' : 'file', 22)}</div>`
    // someone on the crew is reading the link or comparing it: the sheen and their named cursor on the card
    const work = kind === 'ref' ? workHtml(x) : ''
    return card(`${kind}:${x.id}`, x.name, `sc-thumb${work ? ' sc-walking' : ''}`, `${inner}<em>${esc(x.role || x.name)}</em>${work}`)
  }
  function brandCard() {
    const b = A.d.brand, L = look(b)
    if (!b) return card('brand:open', 'Brand sheet', 'pcard sc-brand-new', `<b>Brand sheet</b><span>${ic('sliders', 22)}</span>`)
    return card('brand:open', 'Brand sheet', 'sc-brand', `<div class="br-sw">${['bg', 'text', 'accent', 'link'].map(k => `<i style="background:${esc(L[k])}"></i>`).join('')}</div>
      <div class="sc-type" style="background:${esc(L.bg)};color:${esc(L.text)}"><b style="font-family:'${esc(L.heading)}'">Aa</b><span style="font-family:'${esc(L.body)}'">${esc(L.heading)} · ${esc(L.body)}</span></div><em>${b.lockedAt ? 'Locked' : 'Open'}</em>`)
  }

  // a take: the look as a small page, its ground, a photo, its heading in its own type, a line in its voice and its colours
  function takeCard(p) {
    const L = p.palette, head = String(A.d.studio.idea || p.name).split(/\s+/).slice(0, 6).join(' ')
    const pic = p.pictures?.photos?.[0]?.url
    return card(`take:${p.slug}`, p.name, 'sc-take', `<div class="sc-take-page" style="background:${esc(L.bg)};color:${esc(L.text)}">
      ${pic ? `<img src="${esc(pic)}" alt="" draggable="false" loading="lazy">` : ''}<b style="font-family:'${esc(p.type.heading)}'">${esc(head)}</b>
      <span style="font-family:'${esc(p.type.body)}'">${esc(p.voice?.lines?.[0] || p.for)}</span><i style="background:${esc(L.accent)}"></i></div>
      <div class="br-sw">${['bg', 'text', 'accent', 'link'].map(k => `<i style="background:${esc(L[k])}"></i>`).join('')}</div><em>${esc(p.name)}</em>`)
  }
  // the step path: a chip per step on the record (its dot and name), Lock, then + for each removed step
  function renderPath() {
    const k = kit(), kept = A.d.studio.steps
    const chip = s => { const st = stateOf(s); return `<button class="sc-chip${A.sel === `step:${s}` ? ' on' : ''}" data-step="${s}"><i class="sc-dot ${st}" role="img" aria-label="${STATE_NAME[st]}"></i>${STEP_NAME[s]}</button>` }
    path.innerHTML = [...k.steps.filter(s => s in kept), 'proposal'].map(chip).join('')
      + k.steps.filter(s => !(s in kept)).map(s => `<button class="sc-chip sc-gone" data-add="${s}" aria-label="Add ${STEP_NAME[s]}">${ic('plus', 14)}${STEP_NAME[s]}</button>`).join('')
  }
  path.onclick = e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button')
    if (!b || !A.d) return
    const add = b.dataset.add, step = b.dataset.step
    if (add) return post(at('/step'), { step: add, state: 'empty' }).then(take).then(() => bd.focus(add)).catch(fail)
    if (step !== 'proposal') select(`step:${step}`)
    bd.focus(step)
  }

  function render() {
    if (!A.d) { world.innerHTML = '<div class="col"><section class="pj-sec"><span class="al">Studio</span><div class="abs"><div class="ab pcard wait-in" aria-busy="true"><b>Brand</b><span></span></div></div></section></div>'; renderLayers(); return }
    sync()
    const k = kit(), c = ctx(), d = A.d
    crumb.querySelector('.sc-name').textContent = d.project.title || d.project.name
    primary.hidden = !k.build
    primary.disabled = A.busy
    A.cards.clear()
    const head = step => { const st = stateOf(step); return `<span class="al"><i class="sc-dot ${st}" role="img" aria-label="${STATE_NAME[st]}"></i>${STEP_NAME[step]}</span>` }
    const sec = (step, inner, cls = '') => `<section class="pj-sec sc-step ${cls}" data-sec="${step}">${head(step)}<div class="abs">${inner}</div></section>`
    const parts = []
    if (d.studio.mode === 'takes' && A.takes) parts.push(`<section class="pj-sec sc-step sc-takes" data-sec="takes"><span class="al">Three takes</span><div class="abs">${A.takes.packs.length ? A.takes.packs.map(takeCard).join('') : '<div class="ab sc-take wait-in"></div>'.repeat(TAKES)}</div></section>`)
    for (const step of k.steps.filter(s => s in d.studio.steps)) {
      if (step === 'brand') parts.push(sec('brand', brandCard()))
      if (step === 'references') parts.push(sec('references', `${d.refs.map(r => thumb('ref', r)).join('')}${addCard('ref:add', 'Add reference')}${addCard('ref:link', 'Add link')}`))
      if (step === 'assets') parts.push(sec('assets', `${d.assets.map(a => thumb('asset', a)).join('')}${addCard('asset:add', 'Add asset')}`))
      if (step === 'plan' && k.plan) {
        const cards = k.plan.sections(c).flatMap(s => s.cards)
        for (const x of cards) A.cards.set(x.key, x)
        // a card's look: its cls, or add (a + card) and wide; with no render, its name (the kit's own board draws it)
        const look = x => `${x.cls || (x.add ? 'sc-add' : 'pcard')}${x.wide ? ' sc-wide' : ''}`
        parts.push(sec('plan', cards.map(x => card(x.key, x.name, look(x), x.render ? '' : `<b>${esc(x.name)}</b>`)).join(''), `sc-plan-${k.kind}`))
      }
    }
    // The board (the owner, on the game's Plan board: "it looks better and much easy to track"): each step a
    // section, in rows; Lock, last, holds the idea and what is set so far as fact cards. A fact card goes to its step.
    const on = s => s in d.studio.steps
    const fact = (step, name, value, extra = '') => `<div class="ab pcard sc-fact" data-key="fact:${step}:${name}" tabindex="0" role="button"><b>${name}</b><span>${esc(value)}</span>${extra}</div>`
    // with no brand sheet yet, a built project shows the type and accent its newest version has
    const was = d.built?.theme || null
    const L = look(d.brand), seen = d.refs.find(r => r.look?.state === 'ready')?.look
    const nPlan = [...A.cards.values()].filter(x => !x.add && x.cls !== 'sc-add').length
    const facts = [
      on('plan') && k.plan && fact('plan', k.kind === 'site' ? 'Pages' : 'Plan', nPlan || k.kind !== 'site' ? String(nPlan) : 'Crew decides'),
      on('brand') && fact('brand', 'Type', L?.heading || was?.heading || 'Not set'),
      on('brand') && fact('brand', 'Accent', L?.accent || was?.accent || 'Not set', L?.accent || was?.accent ? `<i class="sc-fsw" style="background:${esc(L?.accent || was.accent)}"></i>` : ''),
      on('references') && fact('references', 'References', String(d.refs.length)),
      on('assets') && fact('assets', 'Assets', String(d.assets.length)),
      k.kind === 'site' && fact('pictures', 'Pictures', PICS[d.studio.kit?.pictures] || 'Not chosen'),
      seen?.words?.motion && fact('references', 'Motion', seen.words.motion),
      seen?.words?.threeD && fact('references', '3D', 'Flat stand-in'),
    ].filter(Boolean).join('')
    // an empty idea says what to do (the chat asks the same); pressing it goes to the chat box
    const ideaText = d.studio.idea ? `<span>${esc(d.studio.idea)}</span>` : '<span class="sc-none">Tell Hermia what you are making</span>'
    // these cards are named by the words they show, with no separate label (axe label-content-name-mismatch)
    const lock = sec('proposal', `<div class="ab pcard sc-idea" data-key="lock:idea" tabindex="0" role="button"><b>Idea</b>${ideaText}${sel('lock:idea')}</div>` + facts, 'sc-facts')
    // Read like the steps: left to right, then the next row (the owner: "shouldnt things go from left to right
    // and then row to row?"). Row 1: Brand, References, Assets. Row 2: Plan, then Lock, the summary, last.
    const is = (/** @type {string} */ p, /** @type {string} */ re) => new RegExp(`data-sec="(${re})"`).test(p.slice(0, 120))
    const rows = [parts.filter(p => is(p, 'takes')), parts.filter(p => is(p, 'brand|references|assets')), [...parts.filter(p => is(p, 'plan')), lock]].filter(r => r.length)
    world.innerHTML = `<div class="col">${rows.map(r => `<div class="sc-row">${r.join('')}</div>`).join('')}</div>`
    // the kit draws its own cards
    for (const [key, x] of A.cards) { const el = world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`); if (el) { x.render?.(el, c); if (A.sel === key) el.insertAdjacentHTML('beforeend', sel(key)) } }
    bd.applyCam()
    if (!A.framed && world.offsetWidth) { A.framed = true; bd.frameAll(false) }
    renderLayers()
    renderPath()
    renderInsp()
  }

  // ---------- Layers: a group per section on the board, its cards as rows ("Add" cards are not layers)
  function layerGroups() {
    const k = kit(), c = ctx(), d = A.d
    const row = (key, name, x = null) => ({ key, name, sel: A.sel === key, dot: x?.busy ? 'var(--text)' : '' })
    const group = (id, title, rows, more = {}) => ({ id, title, rows, count: rows.length, open: !shut.has(id), state: stateOf(more.step || id), ...more })
    const out = []
    if (d.studio.mode === 'takes' && A.takes?.packs.length) out.push({ id: 'takes', title: 'Three takes', open: !shut.has('takes'), count: A.takes.packs.length, rows: A.takes.packs.map(p => row(`take:${p.slug}`, p.name)) })
    // the steps on the record, as the board shows them (a removed step is gone from both)
    for (const step of k.steps.filter(s => s in d.studio.steps)) {
      if (step === 'brand') out.push(group('brand', STEP_NAME.brand, [row('brand:open', 'Brand sheet')]))
      if (step === 'references') out.push(group('references', STEP_NAME.references, d.refs.map(r => row(`ref:${r.id}`, r.name))))
      if (step === 'assets') out.push(group('assets', STEP_NAME.assets, d.assets.map(a => row(`asset:${a.id}`, a.name))))
      if (step === 'plan' && k.plan) {
        const secs = k.plan.sections(c).map(s => ({ ...s, cards: s.cards.filter(x => !x.add && x.cls !== 'sc-add') }))
        const name = STEP_NAME.plan
        // a kit still drafting its plan (it has none yet) is the planner at work: a dot on the step
        const drafting = !secs.length && !!k.prepare && !!d.studio.idea
        if (secs.length <= 1) out.push(group('plan', name, (secs[0]?.cards || []).map(x => row(x.key, x.name, x)), { busy: drafting || secs[0]?.cards.some(x => x.busy) }))
        else for (const s of secs) out.push(group(`plan:${s.sec}`, s.sec, s.cards.map(x => row(x.key, x.name, x)), { step: 'plan', busy: s.cards.some(x => x.busy) }))
      }
    }
    out.push(group('proposal', STEP_NAME.proposal, [row('lock:idea', 'Idea')]))
    return out
  }
  const cardEl = key => world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`)
  // what the inspector opens on (the Brand card opens the brand sheet instead)
  const selectable = key => A.cards.has(key) || /^(ref|asset|lock|take|pics):/.test(key)
  function renderLayers() {
    if (!A.d) { tree.replaceChildren(); return }
    layerTree(tree, layerGroups(), {
      group(id, caret) {
        if (caret) { shut.has(id) ? shut.delete(id) : shut.add(id); return renderLayers() }
        shut.delete(id)
        if (sheet.narrow()) sheet.set(false)
        const el = world.querySelector(`[data-sec="${CSS.escape(id.split(':')[0])}"]`)
        if (el) bd.focus(el)
        renderLayers()
      },
      // fly to it and select it
      row(key) {
        if (sheet.narrow()) sheet.set(false)
        if (selectable(key) && A.sel !== key) select(key)
        const el = cardEl(key)
        if (el) { bd.focus(el); el.focus({ preventScroll: true }) }
      },
      open(key) { const el = cardEl(key); if (el) press(el) },
      drag: (e, key, name) => sw.layerDrag?.(e, key, name),
      canRename: key => !!A.cards.get(key)?.rename,
      rename: (key, name) => A.cards.get(key)?.rename?.(name),
      canRemove: key => /^(ref|asset):/.test(key) || !!A.cards.get(key)?.remove,
      remove(key) {
        const [part, id] = key.split(':'), x = A.cards.get(key)
        if (x?.remove) return x.remove()
        if (part === 'ref') post(proj(`/refs/${id}/remove`)).then(j => { A.d.refs = j.refs; if (A.sel === key) select(null); else render() }).catch(fail)
        if (part === 'asset') api(proj(`/assets/${id}`), { method: 'DELETE' }).then(j => { A.d.assets = j.assets; if (A.sel === key) select(null); else render() }).catch(fail)
      }
    })
  }
  // where a card is on screen, for a chip dragged into the chat (web/layerlink.js draws its line)
  sw.studioRect = key => {
    if (!A.on || root.hidden) return false
    const r = cardEl(key)?.getBoundingClientRect()
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
  }

  // ---------- a link's look (decision 0022): the site walked in a browser, its shots, colours and type, the
  // style words, and where it came from. The shots are only for seeing; they are never placed in a build.
  function addLinkForm() {
    insp.innerHTML = `<h3><span>Add link</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><div class="sc-body"><input class="hm-free" name="url" type="url" placeholder="https://" aria-label="Link"><textarea class="hm-free" name="use" rows="3" placeholder="What you like about it" aria-label="What you like about it"></textarea><div class="sc-acts"><button class="btn pri" data-a="add">${ic('plus', 15)}Add</button></div></div>`
    insp.querySelector('.pj-x').onclick = () => select(null)
    const url = insp.querySelector('[name=url]'), use = insp.querySelector('[name=use]')
    url.focus()
    insp.querySelector('[data-a=add]').onclick = () => {
      if (!url.value.trim()) return url.focus()
      post(proj('/refs/link'), { url: url.value.trim(), use: use.value.trim() }).then(j => { A.d.refs = j.refs; select(`ref:${j.ref.id}`); watchLooks() }).catch(fail)
    }
  }
  // Hermia says one chat line when a link's reading or comparing starts and one when it is done. A state is
  // said once: A.looks keeps each link's last seen one, and the links there when the Studio opened say nothing.
  function sayLooks() {
    const first = !A.looks, seen = A.looks || (A.looks = new Map())
    for (const r of A.d?.refs || []) {
      if (r.kind !== 'link') continue
      const line = first ? '' : lookSays(seen.get(r.id) || '', r)
      seen.set(r.id, lookPhase(r))
      if (line) sw.say?.(line)
    }
  }
  // a link's look or match without the step it is on: the same while only the step moves
  const lookShape = refs => JSON.stringify(refs, (k, v) => (k === 'step' ? undefined : v))
  function watchLooks() {
    clearTimeout(A.lookTimer)
    sayLooks()
    if (!A.d?.refs?.some(r => lookBusy(r))) { A.lookTimer = null; return }
    A.lookTimer = setTimeout(() => api(proj('/refs')).then(j => {
      const same = lookShape(j.refs) === lookShape(A.d.refs)
      A.d.refs = j.refs
      // only the step moved: its line is changed in place, so the card's cursor and sheen and a note being typed carry on
      if (same) { const r = j.refs.find(x => `ref:${x.id}` === A.sel), w = r && lookWorker(r), el = w && insp.querySelector(w.job === 'match' ? '.lm-state' : '.lk-state'); if (el) el.textContent = workLine(w) } else render()
      watchLooks()
    }).catch(() => {}), LOOK_POLL)
  }
  function lookInsp(box, r) {
    const L = r.look || {}, w = L.words || {}, t = L.tokens || {}, f = t.fonts || {}
    const when = r.added ? new Date(r.added).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
    const from = `${r.source === 'chat' ? 'Chat' : 'References'}${when ? ` · ${when}` : ''}`
    const shots = (L.shots || []).slice(0, 6).map(s => `<img src="${esc((sw.base || '') + s)}" alt="" loading="lazy">`).join('')
    const sw2 = (t.palette || []).map(c => `<i style="background:${esc(c)}"></i>`).join('')
    const line = (k, v) => (v ? `<p class="lk-row"><b>${k}</b><span>${esc(v)}</span></p>` : '')
    box.innerHTML = `${L.state === 'walking' ? `<p class="lk-state" aria-live="polite">${esc(workLine(lookWorker(r)))}</p>` : L.state === 'failed' ? `<p class="lk-state">${esc(L.note || 'Could not open it')}</p>` : ''}
      ${shots ? `<div class="lk-shots">${shots}</div>` : ''}
      ${sw2 ? `<div class="br-sw lk-sw">${sw2}</div>` : ''}
      ${w.prompt ? `<p class="sc-idea-full">${esc(w.prompt)}</p>` : ''}
      ${line('Type', w.type || (f.display?.name ? `${f.display.name} · ${f.body?.name || ''}` : ''))}${line('Motion', w.motion)}${line('3D', w.threeD)}
      <textarea class="hm-free" name="use" rows="2" placeholder="What you like about it" aria-label="What you like about it">${esc(r.use || '')}</textarea>
      ${matchHtml(r, { base: sw.base || '', built: !!A.d.project?.head })}
      <p class="lk-from">${esc(from)} · <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(L.from?.host || r.name)}</a></p>
      <div class="sc-acts">${L.state === 'ready' && t.bg ? `<button class="btn pri" data-a="brand">${ic('check', 15)}Use this look</button>` : ''}<button class="btn ghost" data-a="look"${L.state === 'walking' ? ' disabled' : ''}>${ic('restore', 15)}Look again</button><button class="btn ghost" data-a="remove">${ic('trash', 15)}Remove</button></div>`
    box.onclick = e => {
      const m = matchClick(e, (path, body) => post(proj(`/refs/${path}`), body))
      if (m) return m.then(j => { A.d.refs = j.refs; if (!j.sent) render(); watchLooks() }).catch(fail)
      const a = e.target.closest('[data-a]')?.dataset.a
      // Use this look: the reference's colours and type become the project's brand, and the Brand step shows them
      if (a === 'brand') {
        const b = /** @type {HTMLButtonElement} */ (e.target.closest('[data-a]'))
        b.disabled = true
        return post(proj('/brand/pick'), { part: 'look', look: L.tokens, host: L.from?.host || r.name, brief: A.d.studio.idea || r.name }).then(() => load()).then(() => { select(null); bd.focus('brand') }).catch(err => { b.disabled = false; fail(err) })
      }
      if (a === 'look') post(proj(`/refs/${r.id}/look`), { use: box.querySelector('[name=use]').value }).then(j => { A.d.refs = j.refs; render(); watchLooks() }).catch(fail)
      if (a === 'remove') post(proj(`/refs/${r.id}/remove`)).then(j => { A.d.refs = j.refs; select(null) }).catch(fail)
    }
    watchLooks()
  }

  // ---------- the inspector: the selected card's own controls
  function renderInsp() {
    const key = A.sel
    bd.inspector(!!(A.d && key))
    if (insp.hidden) return
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, select')) return
    const [part, id] = key.split(':')
    const x = A.cards.get(key)
    const pack = part === 'take' ? A.takes?.packs.find(p => p.slug === id) : null
    const name = x?.name || pack?.name || (part === 'step' ? STEP_NAME[id] : '') || (part === 'ref' ? A.d.refs.find(r => r.id === id)?.name : part === 'asset' ? A.d.assets.find(a => a.id === id)?.name : part === 'lock' ? 'Idea' : part === 'pics' ? 'Pictures' : '')
    if (key === 'ref:link') return addLinkForm()
    if (!name) return select(null)
    insp.innerHTML = `<h3><span>${esc(name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><div class="sc-body"></div>`
    const box = insp.querySelector('.sc-body')
    insp.querySelector('.pj-x').onclick = () => select(null)
    if (x) return x.inspect?.(box, ctx())
    if (pack) {
      box.innerHTML = `<p class="sc-idea-full">${esc(pack.why || pack.for)}</p><div class="sc-acts"><button class="btn pri" data-a="use">${ic('check', 15)}Use this take</button><button class="btn ghost" data-a="mix">${ic('remix', 15)}Mix</button></div>`
      box.onclick = e => {
        const a = e.target.closest('[data-a]')?.dataset.a
        // used: it is the project's brand, and the Studio goes on from its Brand step
        if (a === 'use') post(proj('/brand/pick'), { part: 'pack', id: pack.slug }).then(() => post(at('/mode'), { mode: 'studio' })).then(d => { A.sel = null; take(d); bd.focus('brand') }).catch(fail)
        if (a === 'mix') openBrand()
      }
      return
    }
    if (part === 'step') {
      const skipped = A.d.studio.steps[id] === 'skipped'
      box.innerHTML = `<div class="sc-acts"><button class="btn ghost" data-a="skip">${ic(skipped ? 'restore' : 'x', 15)}${skipped ? 'Bring back' : 'Skip'}</button><button class="btn ghost" data-a="remove">${ic('trash', 15)}Remove</button></div>`
      box.onclick = e => {
        const a = e.target.closest('[data-a]')?.dataset.a
        if (a === 'skip') post(at('/step'), { step: id, state: skipped ? 'empty' : 'skipped' }).then(take).catch(fail)
        if (a === 'remove') post(at('/step'), { step: id, state: 'removed' }).then(d => { A.sel = null; take(d) }).catch(fail)
      }
      return
    }
    if (part === 'ref' && A.d.refs.find(r => r.id === id)?.kind === 'link') return lookInsp(box, A.d.refs.find(r => r.id === id))
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
      box.innerHTML = `<label class="pl-f"><span>Role</span><select data-role>${['logo', 'product', 'photo', 'font', 'pack', 'other'].map(r => `<option value="${r}"${r === as.role ? ' selected' : ''}>${ROLE_NAME[r] || r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></label>
        <div class="sc-acts"><button class="btn ghost" data-a="ref">${ic('image', 15)}Use as reference</button><button class="btn ghost" data-a="remove">${ic('trash', 15)}Remove</button></div>`
      box.querySelector('[data-role]').onchange = e => post(proj(`/assets/${id}/role`), { role: e.target.value }).then(j => { A.d.assets = j.assets; render() }).catch(fail)
      box.onclick = e => {
        const a = e.target.closest('[data-a]')?.dataset.a
        if (a === 'ref') post(proj(`/assets/${id}/reference`)).then(j => { A.d.refs = j.refs; A.d.assets = j.assets; select(`ref:${j.ref.id}`) }).catch(fail)
        if (a === 'remove') api(proj(`/assets/${id}`), { method: 'DELETE' }).then(j => { A.d.assets = j.assets; select(null) }).catch(fail)
      }
      return
    }
    // Pictures: what this project's builds use, chosen here (and asked before the first build): painted by the
    // image model, stock photos, or drawn as SVG. The same three as Setup; the choice is the project's.
    if (part === 'pics') {
      const now = A.d.studio.kit?.pictures
      box.innerHTML = `<div class="sc-acts sc-pics">${Object.entries(PICS).map(([v, n]) => `<button class="btn ${v === now ? 'pri' : 'ghost'}" data-pic="${v}">${n}</button>`).join('')}</div>`
      box.onclick = e => {
        const v = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-pic]'))?.dataset.pic
        if (!v) return
        post('/api/setup', { pictures: v }).catch(() => {}).then(() => post(at('/kit'), { data: { pictures: v } })).then(d => { take(d); if (A.asking === 'pictures') A.asking = null; if (A.wantsBuild) { A.wantsBuild = false; select(null); build() } }).catch(fail)
      }
      return
    }
    if (part === 'lock') box.innerHTML = `<p class="sc-idea-full">${esc(A.d.studio.idea)}</p>`
  }

  function select(key) {
    A.sel = key
    insp.innerHTML = ''
    // the step it is in is where the person is (the address follows)
    const step = key?.startsWith('step:') ? key.slice(5) : key && world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`)?.closest('[data-sec]')?.dataset.sec
    if (step && C.nav.view.room === 'studio' && C.nav.view.step !== step) C.nav.go({ type: 'studio.step', step })
    render()
  }
  function press(el) {
    const key = el.dataset.key
    const x = A.cards.get(key)
    if (x?.press) return x.press(ctx())
    if (key === 'fact:pictures:Pictures') return select('pics:choose')
    if (key?.startsWith('fact:')) { const step = key.split(':')[1]; bd.focus(step); if (C.nav.view.step !== step) C.nav.go({ type: 'studio.step', step }); return }
    if (key === 'lock:idea' && !A.d.studio.idea) { /** @type {HTMLElement | null} */ (document.querySelector('#brief'))?.focus(); C.chat?.(true); return }
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
    // a step the person skipped (asked before the build, decision 0020) or removed is never where to start
    const steps = A.d.studio.steps || {}
    const live = k.starts.filter(s => s.id in steps && steps[s.id] !== 'skipped')
    const first = [k.suggest?.(ctx()), A.d.studio.start].find(id => live.some(s => s.id === id))
    return live.find(s => s.id === first) || live[0] || k.starts[0] || null
  }
  async function talk() {
    const d = A.d
    if (!sw.talk || A.talked === A.pid) return
    A.talked = A.pid
    const k = kit()
    // opened with an empty box: the chat asks, and the first words become the idea (and the project's name)
    const pid = A.pid
    const heard = text => {
      if (pid !== A.pid) return
      if (A.d?.studio.idea) return answer(text)
      post(at('/idea'), { idea: text }).then(() => { A.prepared = null; return load() }).catch(fail)
    }
    sw.talk.start({ kind: CHAT_KIND[d.studio.kind] || 'site', chat: d.studio.chat, blank: true, said: d.studio.idea ? [{ who: 'you', text: d.studio.idea }] : [], heard, build: brief => (k.build ? build(brief) : openBrand()) })
    if (!d.studio.idea) return sw.say?.('What are you making?')
    // a kit with prepare() posts its own planner line
    const st = k.prepare ? null : startOf()
    // where a website starts on its pages, the chat's first line is the question itself
    if (leads() && st?.id === 'plan') {
      const j = await post(at('/ask'), {}).catch(() => null)
      if (pid !== A.pid || !A.on) return
      if (j?.ask?.next === 'pages') { A.asking = 'pages'; return sw.say?.(j.ask.text) }
    }
    if (st) sw.say?.(st.why ? `Start with ${st.name}: ${st.why}.` : `Start with ${st.name}.`)
  }

  // ---------- the chat leads (docs/decisions/0020-ask-before-build.md, engine/askfirst.mjs): before a website's
  // build, Hermia asks what the person has not said, one question at a time, each answered by typing: which
  // pages (or "you choose": the crew decides), then pictures (painted, stock photos or drawn). "Skip all, just
  // build" takes the recommended defaults and says what it picked. The server reads the words and sets the same
  // state the board's cards set (the pages, the Pictures card); a line that is no answer goes to Hermia as before.
  const leads = () => kit().kind === 'site'
  /** @param {string} text @returns {Promise<string | null> | undefined} */
  function answer(text) {
    if (!leads() || A.busy) return
    const pid = A.pid
    return post(at('/ask'), { said: text, asked: A.asking, building: A.wantsBuild }).then(j => {
      const a = j?.ask
      if (pid !== A.pid || !a?.read) return null
      A.asking = a.next || null
      A.wantsBuild = !!a.building
      take(j)
      // the same as the Pictures card: the choice is Setup's too
      if (a.set?.pictures) post('/api/setup', { pictures: a.set.pictures }).catch(() => {})
      if (a.next === 'pictures' && a.building) select('pics:choose')
      else if (A.sel === 'pics:choose') select(null)
      if (a.build) setTimeout(() => build(), 0)
      return a.text || null
    }).catch(() => null)
  }

  // ---------- Build: the person's press, through the kit
  async function build(idea) {
    const k = kit(), c = ctx()
    if (!k.build || A.busy) return
    // Nothing is built from no idea. (A Studio opened with an empty box once built a made-up site from its
    // reference's look alone, 2026-11-13.) Words typed in the chat box but not sent yet are the idea.
    if (!String(idea || c.studio.idea || '').trim()) {
      const box = /** @type {HTMLTextAreaElement | null} */ (document.querySelector('#brief'))
      const typed = String(box?.value || '').trim()
      if (!typed) { bd.toast('Say what to make first'); sw.say?.('What are you making?'); box?.focus(); return }
      await post(at('/idea'), { idea: typed }).then(take)
      if (box) box.value = ''
      idea = typed
    }
    // What the person has not said is asked first, in the chat, one question at a time: the pages before a
    // first build, then the pictures (also the board's Pictures card). The build goes on from the answer.
    if (leads()) {
      const j = await post(at('/ask'), { building: true }).catch(() => null)
      const next = j?.ask?.next || (c.state.pictures ? null : 'pictures')
      if (next) {
        A.wantsBuild = true
        A.asking = next
        if (next === 'pictures') select('pics:choose')
        sw.say?.(j?.ask?.text || 'Pictures: painted, stock photos or drawn?')
        /** @type {HTMLElement | null} */ (document.querySelector('#brief'))?.focus()
        return
      }
    }
    A.wantsBuild = false
    A.asking = null
    if (c.state.pictures) await post('/api/setup', { pictures: c.state.pictures }).catch(() => {})
    A.busy = true
    render()
    try {
      const spec = { idea: idea || c.studio.idea, brand: A.d.brand, refs: A.d.refs.map(r => r.id), assets: A.d.assets.map(a => a.id), kits: { [k.kind]: k.lock?.(c) || {} } }
      const out = await k.build(spec, c)
      if (out?.run) C.started(out.run, { project: A.pid })
    } catch (err) { fail(err) } finally { A.busy = false; if (A.on) render() }
  }

  addEventListener('resize', () => { if (A.on && A.d) bd.frameAll(false) })
  // the stage also changes size when the chat column folds or opens: the board is framed again
  if (typeof ResizeObserver === 'function') { let w0 = 0; new ResizeObserver(() => { const w = bd.stage.clientWidth; if (A.on && A.d && w && w0 && Math.abs(w - w0) > 40) bd.frameAll(); w0 = w || w0 }).observe(bd.stage) }

  return {
    el: root,
    get project() { return A.pid },
    // the project's brand sheet, once the Studio has loaded (the mode menu's Brand)
    async brand() { for (let i = 0; i < 60 && A.on && !A.d; i++) await new Promise(r => setTimeout(r, 100)); if (A.on && A.d) openBrand() },
    // the project's newest build, when it has one (the mode menu goes to its rooms from here)
    get head() { return A.d?.project?.head || null },
    // open the scaffold on a project: the whole board, or the step the address names
    async show(pid, step = null) {
      A.on = true
      root.hidden = false
      if (pid !== A.pid) { A.pid = pid; A.d = null; A.looks = null; A.sel = null; A.talked = null; A.asking = null; A.wantsBuild = false; path.innerHTML = '' }
      A.framed = false
      render()
      await load()
      if (A.pid !== pid || !A.on || !A.d) return
      talk()
      // Three takes: its looks first
      if (A.d.studio.mode === 'takes' && A.takes) return bd.focus('takes', false)
      // the step named (the address, Back) is brought into view; with none, the whole board, so everything
      // that is set and everything still empty is seen at once
      if (!step) return bd.frameAll(false)
      bd.focus(step, false)
    },
    hide() { A.on = false; root.hidden = true },
    focus: (target, animate = true) => bd.focus(target, animate)
  }
}
