// The Plan board (docs/specs/21-plan-before-spend.md): a game's plan before anything costly is made.
// It follows a project's Overview (Figma's, docs/ux/PATTERNS.md): sections of artboards on a dotted
// stage that pans and zooms, the inspector on the right only while something is selected, and the
// top bar's one primary button, which carries the price: "Lock · 324 credits". Nothing expensive
// runs before that click; the server checks the same number again (engine/plan.mjs lockPlan).
import { ic, cursor, CREW, painterOf } from './icons.js'
import { makeBoard } from './board.js'

export function makePlan({ sw, C, root }) {
  const esc = sw.esc
  const base = () => sw.base || ''
  const P = { on: false, id: null, plan: null, sel: null, framed: false, writing: null, saving: null, poll: null, cell: null, draft: false }

  // the stage, camera, inspector, Esc and toast are the shared board (web/board.js)
  const bd = makeBoard({ root, cls: 'project plan', label: 'Plan', fit: [0.3, 1.25], on: () => P.on, selected: () => !!P.sel, clear: () => select(null) })
  const { world, insp } = bd
  const applyCam = bd.applyCam, frameAll = bd.frameAll, toast = bd.toast

  // ---------- the top bar: Projects › name, and the one primary button (the price)
  const bar = document.querySelector('.topbar')
  const crumb = document.createElement('div')
  crumb.className = 'pl-crumb'
  crumb.innerHTML = `<button class="pl-up">Projects</button>${ic('chr', 14)}<button class="pl-menu" aria-haspopup="menu"><b class="pl-name"></b>${ic('chd', 14)}</button>`
  bar?.querySelector('.spacer')?.before(crumb)
  crumb.querySelector('.pl-up').onclick = () => C.go('home')
  // ▾ beside the name: save the plan as a template others remix (spec 21)
  let menu = null
  const closeMenu = () => { menu?.off?.(); menu?.el.remove(); menu = null }
  crumb.querySelector('.pl-menu').onclick = e => {
    if (menu) return closeMenu()
    const a = e.currentTarget, r = a.getBoundingClientRect()
    const el = document.createElement('div')
    el.className = 'hm-menu'
    el.setAttribute('role', 'menu')
    el.innerHTML = `<button role="menuitem" data-k="tpl">${ic('remix', 16)}<span>Save as template</span></button>`
    document.body.append(el)
    el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, r.left))}px`
    el.style.top = `${r.bottom + 6}px`
    menu = { el, off: window.SwarmUI?.layer(el, closeMenu, { extra: [a] }) }
    el.querySelector('button').focus({ preventScroll: true })
    el.onclick = ev => {
      if (!ev.target.closest('[data-k="tpl"]')) return
      closeMenu()
      post(url('template'), { name: P.plan?.title }).then(() => toast('Saved as template')).catch(err => toast(err.message))
    }
  }
  const primary = document.createElement('button')
  primary.className = 'toggle pl-primary'
  primary.innerHTML = '<span class="t"></span>'
  bar?.querySelector('.spacer')?.after(primary)
  // while the plan is still a talk (spec 27), Lock is the chat's Lock
  primary.onclick = () => (P.draft ? sw.talk?.lock?.() : gate())

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, body: j }); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  const url = sub => `/api/plans/${encodeURIComponent(P.id)}${sub ? `/${sub}` : ''}`
  async function load() {
    if (!P.id) return
    try { P.plan = await api(url()) } catch (err) { toast(err.message); return }
    render()
  }
  function take(plan) { P.plan = plan; render() }

  // ---------- render
  const price = () => P.plan?.price || { credits: 0, runs: 0, images: 0, parts: [], first: { credits: 0 }, rest: { credits: 0 } }
  const cardValue = c => {
    const b = c.body || {}
    if (c.id === 'cast') return `${(b.roster || []).length}`
    if (c.id === 'systems') return `${Object.values(b).filter(v => v === 'on').length}`
    const first = Object.values(b).find(v => typeof v === 'string' && v.trim())
    return first ? first.split(/[,.]/)[0].slice(0, 28) : ''
  }
  // ---------- the pictures: sheets, mocks, backdrops, close-ups (engine/planart.mjs)
  // the sheets and shots follow the plan's genre family (engine/planshape.mjs); the action RPG's by default
  const SHEETS = [['cast', 'Cast'], ['weapons', 'Weapons']]
  const SHOTS = [['combat', 'Combat'], ['boss', 'Boss'], ['ult', 'Ult'], ['levelup', 'Level-up'], ['select', 'Select']]
  const named = k => k.replace(/^\w/, c => c.toUpperCase())
  const sheetsOf = p => p?.art?.sheets ? p.art.sheets.slice(0, p.shape?.size === 'tiny' ? 2 : 4).map(k => [k, named(k)]) : SHEETS
  const shotsOf = p => p?.art?.shots ? p.art.shots.map(([k]) => [k, named(k)]) : SHOTS
  const painting = p => p.build?.state === 'building' || [...(p.sheets || []), ...(p.mocks || []), ...(p.backdrops || []), ...(p.build?.sprites || []), ...(p.build?.characters || []).flatMap(c => [c.cutin, c.portrait, c.front, c.side, c.back])].some(e => e?.state === 'painting')
  const sel = key => P.sel === key ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : ''
  // one picture slot: the picture when done, the crew at work while painting, an empty frame before
  function slot(key, cls, name, e, extra = '') {
    const pic = e?.state === 'done' && e.src ? `<img src="${esc(base() + e.src)}" alt="" draggable="false" loading="lazy">` : ''
    const work = e?.state === 'painting' ? `<div class="pl-work" aria-busy="true"></div>${cursor(painterOf(key))}` : ''
    const failed = e?.state === 'failed' ? ' failed' : ''
    return `<div class="ab ppic ${cls}${failed}" data-key="${esc(key)}" tabindex="0" role="button" aria-label="${esc(name)}">${pic}${work}${extra}<em>${esc(name)}</em>${sel(key)}</div>`
  }
  // the made model: its picture when done, the crew at work while Meshy makes it
  function modelSlot(r, m) {
    const key = `md:${r.name}`
    const pic = m?.state === 'done' && m.thumb ? `<img src="${esc(base() + m.thumb)}" alt="" draggable="false" loading="lazy">` : m?.state === 'done' ? `<div class="blank">${ic('box', 22)}</div>` : ''
    const work = m?.state === 'making' ? `<div class="pl-work" aria-busy="true"></div>${cursor(painterOf(key))}` : ''
    return `<div class="ab ppic view model${m?.state === 'failed' ? ' failed' : ''}" data-key="${esc(key)}" tabindex="0" role="button" aria-label="${esc(r.name)} model">${pic}${work}${sel(key)}</div>`
  }
  const rings = s => (s.picks || []).map(c => {
    const [cols, rows] = s.grid || [5, 4]
    const x = (c % cols) / cols * 100, y = Math.floor(c / cols) / rows * 100
    return `<i class="pl-ring${P.sel === `sheet:${s.kind}` && P.cell === c ? ' on' : ''}" style="left:${x}%;top:${y}%;width:${100 / cols}%;height:${100 / rows}%"></i>`
  }).join('')
  function render() {
    const p = P.plan
    if (!p) { world.innerHTML = P.id ? `<div class="col"><section class="pj-sec"><span class="al">Plan</span><div class="abs">${'<div class="ab pcard wait-in" aria-busy="true"><b></b><span></span></div>'.repeat(3)}</div></section></div>` : ''; return }
    crumb.querySelector('.pl-name').textContent = p.title || 'Plan'
    renderPrimary()
    const cards = p.cards.map((c, i) => `<div class="ab pcard${P.writing != null && i >= P.writing ? ' wait' : ''}" data-key="card:${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)}">
      <b>${esc(c.name)}</b><span>${esc(cardValue(c))}</span>${sel(`card:${c.id}`)}${P.writing != null && i === P.writing - 1 ? cursor(CREW[i % CREW.length]) : ''}</div>`).join('')
    const writing = P.writing != null
    const sheets = sheetsOf(p).map(([k, n]) => { const s = (p.sheets || []).find(x => x.kind === k); return slot(`sheet:${k}`, 'sheet', n, s, s?.state === 'done' ? rings(s) : '') }).join('')
    const mocks = shotsOf(p).map(([k, n]) => slot(`mock:${k}`, 'mock', n, (p.mocks || []).find(x => x.shot === k))).join('')
    const bds = (p.backdrops || []).slice().sort((a, b) => a.stage - b.stage || a.n - b.n)
    const worldSec = bds.length ? bds.map(b => slot(`bd:${b.id}`, `bd ${b.shape}`, b.n === 1 ? b.name : '', b)).join('') : slot('bd:new', 'bd equirect', 'Backdrops', null)
    const cast = (p.cards.find(c => c.id === 'cast')?.body.roster || []).filter(r => r?.name)
    const chars = new Map((p.build?.characters || []).map(c => [c.name, c]))
    const shown = p.gate?.locked || (p.build?.characters || []).length
    const flat = !!p.art?.sprites?.length
    const made = new Map((p.build?.sprites || []).map(x => [x.name, x]))
    const views = flat ? (shown || made.size ? p.art.sprites.map(x => slot(`sp:${x.name}`, 'view', x.name, made.get(x.name))).join('') : '') : shown ? cast.map(r => { const c = chars.get(r.name) || {}; return `<div class="pl-grp">${['front', 'side', 'back'].map((v, i) => slot(`vw:${r.name}:${v}`, 'view', i ? '' : r.name, c[v])).join('')}${modelSlot(r, c.model)}</div>` }).join('') : ''
    const closeups = shown && p.shape?.closeups !== false ? cast.map(r => '<div class="pl-grp">' + slot(`cu:${r.name}:cutin`, 'cutin', r.name, chars.get(r.name)?.cutin) + slot(`cu:${r.name}:portrait`, 'portrait', '', chars.get(r.name)?.portrait) + '</div>').join('') : ''
    // the starter (engine/starters.mjs): the engine, a genre template and the art to begin with, then the
    // systems the template carries, each a card with why it is suggested
    const sv = p.starterView
    const stCard = (k, name, c) => `<div class="ab pcard st${c.by === 'person' ? ' mine' : ''}" data-key="st:${k}" tabindex="0" role="button" aria-label="${esc(name)}"><b>${esc(name)}</b><span>${esc(c.name || 'None')}</span><i>${esc(c.why || '')}</i>${sel(`st:${k}`)}</div>`
    const starter = sv && !writing ? `<section class="pj-sec pl-starter" data-sec="starter"><span class="al">Starter</span><div class="abs">${stCard('engine', 'Engine', sv.engine)}${stCard('template', 'Template', sv.template)}${stCard('assets', 'Assets', sv.assets)}</div></section>
      ${sv.systems.length ? `<section class="pj-sec pl-systems" data-sec="systems"><span class="al">Systems</span><div class="abs">${sv.systems.map(x => `<div class="ab pcard st${x.on ? '' : ' off'}" data-key="sys:${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(x.name)}"><b>${esc(x.on ? 'On' : 'Off')}</b><span>${esc(x.name)}</span><i>${esc(x.why)}</i>${sel(`sys:${x.id}`)}</div>`).join('')}</div></section>` : ''}` : ''
    world.innerHTML = `<div class="col"><section class="pj-sec plan-cards" data-sec="cards"><span class="al">Plan</span><div class="abs">${cards}</div></section>${starter}
      ${writing ? '' : `<section class="pj-sec pl-sheets" data-sec="sheets"><span class="al">Sketches</span><div class="abs">${sheets}</div></section>`}
      ${views && !writing ? `<section class="pj-sec pl-build" data-sec="build"><span class="al">Build</span><div class="abs">${views}</div></section>` : ''}</div>
      ${writing ? '' : `<div class="col"><section class="pj-sec pl-mocks" data-sec="mocks"><span class="al">Mocks</span><div class="abs">${mocks}</div></section>
      ${p.shape?.backdrops === false ? '' : `<section class="pj-sec pl-world" data-sec="world"><span class="al">World</span><div class="abs">${worldSec}</div></section>`}
      ${closeups ? `<section class="pj-sec pl-close" data-sec="close"><span class="al">Close-ups</span><div class="abs">${closeups}</div></section>` : ''}</div>`}`
    applyCam()
    const firstKey = p.first && (p.art?.sprites?.length ? `sp:${p.first.name}` : `vw:${p.first.name}:front`)
    if (!P.draft && firstKey && P.checked !== `${p.id}:${p.first.src}` && !P.sel) { P.checked = `${p.id}:${p.first.src}`; P.sel = firstKey }
    if (!P.framed && world.offsetWidth && !writing) { P.framed = true; frameAll(false) }
    renderInsp()
    // while the crew paint, look again every few seconds
    clearTimeout(P.poll)
    if (P.on && !P.draft && painting(p)) P.poll = setTimeout(load, 3000)
  }
  function renderPrimary() {
    const p = P.plan, pr = price()
    const busy = p?.build?.state === 'building'
    const label = !p ? '' : P.draft ? 'Lock' : busy ? 'Building' : p.gate?.locked ? (p.gate.phase === 'first' ? 'Build one' : 'Build') : `Lock · ${cost(pr.credits, pr)}`
    primary.disabled = busy
    primary.querySelector('.t').textContent = label
    primary.classList.toggle('pri', !!p)
    primary.setAttribute('aria-label', label)
  }

  // the crew write the cards in, one after another (a new plan only)
  function writeIn() {
    P.writing = 0
    render()
    const step = () => {
      if (!P.on || !P.plan) { P.writing = null; return }
      P.writing += 1
      if (P.writing > P.plan.cards.length) { P.writing = null; render(); return }
      render()
      setTimeout(step, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320)
    }
    setTimeout(step, 200)
  }

  // ---------- the inspector: the selected card's lines, as inputs; saved as they change
  function renderInsp() {
    const p = P.plan
    const c = P.sel?.startsWith('card:') && p?.cards.find(x => `card:${x.id}` === P.sel)
    const pic = !c && P.sel && p && !P.draft ? (/^(st|sys):/.test(P.sel) ? starterInsp(p, P.sel) : picInsp(p, P.sel)) : ''
    // a draft is changed by saying so in the chat: no inspector until it is locked
    bd.inspector(!P.draft && !!(c || pic))
    if (insp.hidden) return
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return
    if (pic) { insp.innerHTML = pic; return }
    const b = c.body || {}
    let html = ''
    if (c.id === 'systems') {
      html = Object.entries(b).map(([k, v]) => `<label class="pl-sw"><input type="checkbox" data-k="${esc(k)}" ${v === 'on' ? 'checked' : ''}><span>${esc(k)}</span></label>`).join('')
    } else {
      html = Object.entries(b).filter(([k]) => k !== 'roster' && !(c.id === 'cast' && k === 'count') && !(c.id === 'look' && k === 'locked')).map(([k, v]) => `<label class="pl-f"><span>${esc(label(k))}</span><input data-k="${esc(k)}" value="${esc(Array.isArray(v) ? v.join(', ') : v)}" maxlength="400"></label>`).join('')
      if (c.id === 'look') html += styleSwitch(p)
      if (c.id === 'cast') {
        html += `<div class="pl-roster" role="list" aria-label="Cast">${(b.roster || []).map((r, i) => `<div class="pl-r" role="listitem" data-i="${i}">
          <input data-r="name" value="${esc(r.name)}" aria-label="Name" maxlength="40"><input data-r="weapon" value="${esc(r.weapon)}" aria-label="Weapon" maxlength="60">
          <button class="ib sm" data-del="${i}" aria-label="Remove ${esc(r.name)}">${ic('x', 14)}</button>
          <input class="wide" data-r="look" value="${esc(r.look)}" aria-label="Look" placeholder="Look" maxlength="300"></div>`).join('')}</div>
          <button class="btn ghost" data-add>${ic('plus', 15)}Add</button>`
      }
    }
    insp.innerHTML = `<h3><span>${esc(c.name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>${html}`
  }
  // a starter choice: its options, each with why, the one in use marked; a system: why, and on or off
  function starterInsp(p, key) {
    const sv = p.starterView
    if (!sv) return ''
    const [kind, id] = key.split(':')
    if (kind === 'sys') {
      const x = sv.systems.find(y => y.id === id)
      if (!x) return ''
      return head(x.name) + `<p class="pl-sum">${esc(x.why)}</p><label class="pl-sw"><input type="checkbox" data-sys="${esc(x.id)}" ${x.on ? 'checked' : ''} ${x.required ? 'disabled' : ''}><span>${x.required ? 'Part of this template' : 'On'}</span></label>`
    }
    const c = sv[id]
    if (!c) return ''
    const opts = id === 'template' ? [...c.options, { id: '', name: 'None', why: 'an empty project; the crew writes every system', fits: true }] : c.options
    return head({ engine: 'Engine', template: 'Template', assets: 'Assets' }[id]) + `<div class="pl-opts">${opts.map(o => `<button type="button" class="pl-opt${(c.value ?? '') === o.id ? ' on' : ''}" data-st="${id}" data-v="${esc(o.id)}" ${o.fits === false ? 'disabled' : ''}><span>${esc(o.name)}</span><small>${esc(o.fits === false ? `Made for ${sv.engine.value === 'godot' ? 'the browser' : 'Godot 4'}` : o.why)}</small></button>`).join('')}</div>` + (sv.addons.length && id === 'template' ? `<p class="pl-sum pl-addons">${sv.addons.map(a => `${esc(a.name)} ${esc(a.version)} · ${esc(a.licence)}`).join('<br>')}</p>` : '')
  }
  const styleSwitch = p => `<label class="pl-sw"><input type="checkbox" data-style ${p.style?.locked ? 'checked' : ''}><span>Lock style</span></label>`
  const head = name => `<h3><span>${esc(name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>`
  const busy = e => e?.state === 'painting'
  const again = (what, e, label = 'Draw') => `<button class="btn${e?.state === 'done' ? ' ghost' : ' pri'} pl-paint" data-paint="${esc(what)}" ${busy(e) ? 'disabled' : ''}>${esc(e?.state === 'done' || e?.state === 'failed' ? `${label} again` : label)}</button>`
  // a picture's inspector: its picks and note (a sheet), and the one action that paints it
  function picInsp(p, key) {
    const [kind, ...rest] = key.split(':')
    const id = rest.join(':')
    if (kind === 'sheet') {
      const s = (p.sheets || []).find(x => x.kind === id)
      const name = sheetsOf(p).find(x => x[0] === id)?.[1] || id
      const picks = s?.picks || []
      const cell = P.cell != null && picks.includes(P.cell) ? P.cell : null
      return head(name) + (picks.length ? `<div class="pl-picks">${picks.map(c => `<button class="pl-pick${c === cell ? ' on' : ''}" data-cell="${c}">${c + 1}</button>`).join('')}</div>` : '') +
        (cell != null ? `<label class="pl-f"><span>Note</span><input data-note="${cell}" value="${esc(s.notes?.[cell] || '')}" maxlength="120"></label>` : '') +
        again(`sheet:${id}`, s)
    }
    if (kind === 'mock') {
      const m = (p.mocks || []).find(x => x.shot === id)
      const any = (p.mocks || []).length
      return head(shotsOf(p).find(x => x[0] === id)?.[1] || id) + (any ? again(`mock:${id}`, m) : again('mocks', null, 'Draw all'))
    }
    if (kind === 'bd') {
      const b = (p.backdrops || []).find(x => x.id === id)
      return head(b?.name || 'Backdrops') + (p.style?.locked ? '' : styleSwitch(p)) +
        (p.style?.locked ? (b ? again(`bd:${b.stage}`, b, 'Paint') : again('bd:', null, 'Paint')) : '')
    }
    if (kind === 'vw') {
      const [name, v] = [rest.slice(0, -1).join(':'), rest.at(-1)]
      const c = (p.build?.characters || []).find(x => x.name === name)
      return head(name) + check(p, name) + (p.gate?.locked && p.build?.state !== 'building' ? again(`vw:${name}:${v}`, c?.[v]) : '')
    }
    if (kind === 'sp') return head(id) + check(p, id)
    if (kind === 'md') {
      const m = (p.build?.characters || []).find(x => x.name === id)?.model
      return head(id) + (m?.state === 'done' ? `<a class="btn ghost pl-paint" href="${esc(base() + m.src)}" download>Download</a>` : m?.error ? `<p class="pl-err">${esc(m.error)}</p>` : '')
    }
    if (kind === 'cu') {
      const [name, which] = [rest.slice(0, -1).join(':'), rest.at(-1)]
      const c = (p.build?.characters || []).find(x => x.name === name)
      return head(name) + again(`cu:${name}`, c?.[which], 'Paint')
    }
    return ''
  }
  // the first picture is a cheap check of direction: the plan in plain words, and one step back
  const check = (p, name) => p.first?.name !== name ? '' : `<p class="pl-sum">${esc(p.summary || '')}</p>
    <label class="pl-f"><span>What should it be?</span><input data-replan-note maxlength="300"></label>
    <button class="btn ghost pl-paint" data-replan>Not what I asked for</button>`
  const label = k => ({ levelUp: 'Level-ups', ngPlus: 'New Game+', enemyAI: 'Enemy AI' }[k] || k.replace(/([A-Z])/g, ' $1').replace(/^\w/, s => s.toUpperCase()))
  function readCard() {
    const c = P.plan?.cards.find(x => `card:${x.id}` === P.sel)
    if (!c) return null
    const body = {}
    for (const i of insp.querySelectorAll('input[data-k]')) body[i.dataset.k] = i.type === 'checkbox' ? (i.checked ? 'on' : 'off') : i.value
    if (c.id === 'cast') body.roster = [...insp.querySelectorAll('.pl-r')].map(r => Object.fromEntries([...r.querySelectorAll('input[data-r]')].map(i => [i.dataset.r, i.value])))
    return { c, body }
  }
  function saveSoon(now = false) {
    clearTimeout(P.saving)
    const go = async () => {
      const x = readCard()
      if (!x) return
      try {
        const plan = await post(url('card'), { card: x.c.id, body: x.body })
        P.plan = plan
        renderPrimary()
        // the card's value at rest, in place (re-rendering would steal the focus)
        const el = world.querySelector(`.pcard[data-key="card:${CSS.escape(x.c.id)}"] span`)
        const c = plan.cards.find(y => y.id === x.c.id)
        if (el && c) el.textContent = cardValue(c)
      } catch (err) { toast(err.message) }
    }
    if (now) return go()
    P.saving = setTimeout(go, 450)
  }
  insp.addEventListener('input', e => {
    if (e.target.matches('[data-note]')) return noteSoon(e.target)
    if (e.target.matches('input:not([type=checkbox])')) saveSoon()
  })
  insp.addEventListener('change', e => {
    if (e.target.matches('[data-style]')) return act('style', { locked: e.target.checked })
    if (e.target.matches('[data-sys]')) return act('starter', { system: e.target.dataset.sys, on: e.target.checked })
    if (e.target.matches('input[type=checkbox]')) saveSoon(true)
  })
  insp.addEventListener('click', e => {
    if (e.target.closest('.pj-x')) return select(null)
    const st = e.target.closest('[data-st]')
    if (st) return st.classList.contains('on') ? null : act('starter', { key: st.dataset.st, value: st.dataset.v || null })
    const pk = e.target.closest('[data-cell]')
    if (pk) { P.cell = Number(pk.dataset.cell); insp.innerHTML = ''; return render() }
    if (e.target.closest('[data-replan]')) { const n = insp.querySelector('[data-replan-note]'); P.sel = null; return act('replan', { note: n?.value || '' }) }
    const pt = e.target.closest('[data-paint]')
    if (pt) return paintIt(pt.dataset.paint, pt)
    const del = e.target.closest('[data-del]')
    if (del) { del.closest('.pl-r').remove(); saveSoon(true).then(() => { insp.innerHTML = ''; renderInsp() }); return }
    if (e.target.closest('[data-add]')) {
      const c = P.plan.cards.find(x => x.id === 'cast')
      const n = (c.body.roster || []).length + 1
      post(url('card'), { card: 'cast', body: { roster: [...(c.body.roster || []), { name: `Hero ${n}`, role: '', look: '', weapon: '' }] } })
        .then(plan => { P.plan = plan; insp.innerHTML = ''; render() }).catch(err => toast(err.message))
    }
  })

  // ---------- the crew paint: one call each, the pictures land as they finish
  async function act(sub, body) {
    try { P.plan = await post(url(sub), body); insp.innerHTML = ''; render() } catch (err) { toast(err.message); insp.innerHTML = ''; render() }
  }
  function paintIt(what, btn) {
    btn.disabled = true
    const [kind, ...rest] = what.split(':')
    const id = rest.join(':')
    if (kind === 'sheet') return act('sheet', { kind: id })
    if (kind === 'mocks') return act('mocks')
    if (kind === 'mock') return act('mocks', { shots: [id] })
    if (kind === 'bd') return act('backdrops', id === '' ? {} : { stage: Number(id) })
    if (kind === 'cu') return act('closeups', { name: id })
    if (kind === 'vw') return act('view', { name: rest.slice(0, -1).join(':'), view: rest.at(-1) })
  }
  // a sheet: the first click selects it; then a click on a cell picks it (or unpicks it)
  function pickAt(a, e) {
    const s = (P.plan.sheets || []).find(x => `sheet:${x.kind}` === a.dataset.key)
    if (!s || s.state !== 'done') return false
    const r = a.getBoundingClientRect()
    const [cols, rows] = s.grid || [5, 4]
    const cell = Math.min(rows - 1, Math.floor((e.clientY - r.top) / r.height * rows)) * cols + Math.min(cols - 1, Math.floor((e.clientX - r.left) / r.width * cols))
    const on = !(s.picks || []).includes(cell)
    P.cell = on ? cell : null
    act('pick', { sheet: s.id, cell, on })
    return true
  }
  let noting = null
  function noteSoon(input) {
    clearTimeout(noting)
    const s = (P.plan.sheets || []).find(x => `sheet:${x.kind}` === P.sel)
    if (!s) return
    noting = setTimeout(() => post(url('pick'), { sheet: s.id, cell: Number(input.dataset.note), note: input.value }).then(p => { P.plan = p }).catch(err => toast(err.message)), 450)
  }

  // ---------- the gate: the parts, the total, Test one first, and one confirm carrying the price.
  // A plan with no Meshy parts (every 2D plan) costs no credits, so its gate counts pictures instead.
  const cost = (credits, pr) => pr.credits ? `${credits} credits` : `${pr.images} pictures`
  function gate() {
    const p = P.plan
    if (!p) return
    if (p.gate?.locked) return build()
    const pr = price()
    let first = false
    const flat = !pr.credits
    const rows = pr.parts.filter(x => x.n).map(x => `<div class="pl-row"><span>${esc(x.what)}</span><i>${x.n} × ${x.each}</i><b>${x.credits}</b></div>`).join('')
    const d = window.SwarmUI.dialog({
      title: `Lock · ${cost(pr.credits, pr)}`,
      className: 'pl-gate',
      body: `<div class="pl-rows">${rows}<div class="pl-row"><span>Coding runs</span><i></i><b>${pr.runs}</b></div><div class="pl-row"><span>Pictures</span><i></i><b>${pr.images}</b></div></div>
        <label class="pl-sw"><input type="checkbox" class="pl-first" ${(flat ? pr.images > 1 : pr.first.credits && pr.first.credits < pr.credits) ? '' : 'disabled'}><span>Test one first</span></label>`,
      footer: '<button class="btn pri pl-go"></button>'
    })
    const go = d.footer.querySelector('.pl-go')
    const paint = () => { go.textContent = flat ? `Lock · ${first ? 1 : pr.images} ${first ? 'picture' : 'pictures'}` : `Lock · ${first ? pr.first.credits : pr.credits} credits` }
    paint()
    d.body.querySelector('.pl-first').onchange = e => { first = e.target.checked; paint() }
    go.onclick = async () => {
      go.disabled = true
      try {
        take(await post(url('lock'), { credits: first ? pr.first.credits : pr.credits, testFirst: first }))
        d.close('done')
        toast('Locked')
      } catch (err) {
        go.disabled = false
        // the price moved: show the new one, nothing was locked
        if (err.status === 402) { d.close('stale'); await load(); gate() } else toast(err.message)
      }
    }
  }
  async function build() {
    try { take(await post(url('build'))) } catch (err) { toast(err.message) }
  }

  // ---------- select (the stage's gestures are the board's)
  function select(key) {
    if (key !== P.sel) P.cell = null
    P.sel = key
    insp.innerHTML = ''
    render()
  }
  world.addEventListener('click', e => {
    const a = e.target.closest('.ab')
    if (!a) return
    if (a.dataset.key === P.sel && a.classList.contains('sheet') && pickAt(a, e)) return
    select(a.dataset.key)
  })
  world.addEventListener('keydown', e => { const a = e.target.closest('.ab'); if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(a.dataset.key) } })

  return {
    el: root,
    get id() { return P.id },
    get selected() { return !!P.sel },
    async show(id, { fresh = false } = {}) {
      if (id && id !== P.id) { P.id = id; P.plan = null; P.sel = null; P.cell = null; P.framed = false; render() }
      if (id) P.draft = false
      P.on = true
      root.hidden = false
      crumb.hidden = false
      P.ready = load()
      await P.ready
      if (fresh) writeIn()
    },
    hide() { closeMenu(); P.on = false; root.hidden = true; clearTimeout(P.saving); clearTimeout(P.poll) },
    // the plan made from the questions, from Projects' Make box
    async create(idea, answers) {
      const plan = await post('/api/plans', { idea, answers })
      return plan.id
    },
    select,
    // a game talk (spec 27): the board is the plan as it stands, read-only, until the chat locks it
    talk() { Object.assign(P, { id: null, plan: null, sel: null, cell: null, framed: false, draft: true }); render() },
    draft(plan) { if (!P.draft || !plan) return; P.plan = plan; if (P.on) render() },
    get drafting() { return P.draft },
    // the plan the board is showing has loaded
    get ready() { return P.ready || Promise.resolve() },
    // the plan as the board shows it (the game kit reads it: web/kit-game.js)
    get plan() { return P.plan },
    // the top bar's button: the Lock dialog with the price, or Build once locked
    gate,
    // bring a section ('cards', 'sheets', 'build', 'mocks', 'world', 'close') or an artboard (its key) into view
    focus: (target, animate = true) => bd.focus(target, animate)
  }
}
