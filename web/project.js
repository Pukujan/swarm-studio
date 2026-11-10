// A project: one canvas (docs/ux/PATTERNS.md). The top bar carries the breadcrumb (Projects ›
// name ▾), the crew, Play and Publish. The left panel lists every file the build made, by kind
// (Files), or its pages and sections (Layers). The stage shows the same files as artboards in
// sections on one dotted canvas; selecting one opens the inspector, double-clicking opens its
// room. A selected page's sections can be picked too (a click on the page, or the Layers panel):
// the inspector then edits that one by hand (words, fill, type, spacing, pictures, code), and
// "Tell the crew…" changes just it. Edits are saved edit events, so they undo and reach everyone.
// The old line about rooms continues:
// // room (Design deck, Film studio, Engine room). Files dropped from Finder land in the project's
// uploads/ and go to the crew with the next build. The dock: tools and "Tell the crew…".
// A selected page's sections can be picked too (a click on the page, or the Layers panel): the
// inspector then edits that one by hand (words, fill, type, spacing, pictures, its code), and
// "Tell the crew…" changes just it. Each change is a saved edit event, so it undoes, replays and
// reaches anyone else on the same build (room for working together later).
import { ic, cursor, CREW } from './icons.js'
import { routeMessage } from './route.js'

const SECTIONS = [['site', 'Site'], ['app', 'App'], ['game', 'Game'], ['film', 'Film'], ['art', 'Art'], ['uploads', 'Uploads'], ['code', 'Code']]
const fmtTime = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : ''

export function makeProject({ sw, C, root }) {
  const esc = sw.esc, store = sw.store
  const base = () => sw.base || ''
  const hosted = () => document.body.classList.contains('hosted')
  const P = {
    on: false, pid: null, run: null, proj: null, board: null, uploads: [], sending: new Map(),
    sel: null, layer: null, aspect: new Map(), tab: 'files', q: '', open: store.get('project.open', { code: false }), cam: { x: 0, y: 0, k: 1 }, tool: 'move', thumbs: new Map()
  }

  root.className = 'project'
  root.hidden = true
  root.innerHTML = `
    <aside class="pj-side" aria-label="Files">
      <div class="pj-tabs" role="tablist"><button class="pj-tab on" data-tab="files" role="tab">Files</button><button class="pj-tab" data-tab="layers" role="tab">Layers</button>
        <button class="ib sm pj-find" aria-label="Search">${ic('search', 16)}</button><button class="ib sm pj-add" aria-label="Add" aria-haspopup="menu">${ic('plus', 16)}</button></div>
      <label class="pj-search" hidden><input type="search" placeholder="Search" aria-label="Search files"></label>
      <div class="pj-list" role="tree"></div>
      <div class="pj-layers" hidden></div>
    </aside>
    <div class="pj-stage" tabindex="-1" aria-label="Canvas">
      <div class="pj-world"></div>
      <div class="pj-cursors" aria-hidden="true"></div>
      <div class="pj-drop" hidden><span>${ic('upload', 22)}</span></div>
    </div>
    <aside class="pj-insp" hidden aria-label="Inspector"></aside>
    <div class="pj-dock">
      <button class="ib pj-files-btn" data-tool="files" aria-label="Files" aria-expanded="false">${ic('folder')}</button>
      <button class="ib on" data-tool="move" aria-label="Move">${ic('move')}</button>
      <button class="ib" data-tool="frame" aria-label="Frame all">${ic('frame')}</button>
      <button class="ib" data-tool="text" aria-label="New page">${ic('type')}</button>
      <button class="ib" data-tool="image" aria-label="Upload files">${ic('image')}</button>
      <button class="ib" data-tool="comment" aria-label="Chat">${ic('msg')}</button>
      <form class="pj-ask" autocomplete="off"><button type="button" class="pj-scope" hidden aria-label="Talk to the crew about the whole project"><span></span>${ic('x', 12)}</button><input name="q" placeholder="Tell the crew…" aria-label="Tell the crew" maxlength="4000"><button type="submit" class="pj-send" aria-label="Send">${ic('up', 16)}</button></form>
    </div>
    <input type="file" class="pj-file" multiple hidden>`
  const $ = s => root.querySelector(s)
  const listEl = $('.pj-list'), layersEl = $('.pj-layers'), stage = $('.pj-stage'), world = $('.pj-world'), insp = $('.pj-insp'), curEl = $('.pj-cursors')
  const ask = $('.pj-ask'), input = ask.q, fileIn = $('.pj-file')

  // ---------- the top bar: Projects › name ▾ and the crew
  const crumb = document.createElement('div')
  crumb.className = 'pj-crumb'
  crumb.innerHTML = `<button class="pj-up">Projects</button>${ic('chr', 14)}<button class="pj-name" aria-haspopup="menu"><b></b>${ic('chd', 14)}</button>`
  const crew = document.createElement('div')
  crew.className = 'pj-crew'
  crew.setAttribute('aria-label', 'The crew')
  crew.innerHTML = CREW.map(n => `<span aria-label="${n}">${n[0]}</span>`).join('')
  const bar = document.querySelector('.topbar')
  bar?.querySelector('.spacer')?.before(crumb)
  bar?.querySelector('#play-btn')?.before(crew)
  crumb.querySelector('.pj-up').onclick = () => C.go('home')
  crumb.querySelector('.pj-name').onclick = e => projectMenu(e.currentTarget)

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { body: j }); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  async function load() {
    const run = P.run || sw.viewing || sw.S?.run || sw.liveId
    if (!run || run === 'new') { P.board = null; render(); return }
    P.run = run
    const [board, list] = await Promise.all([api(`/api/runs/${encodeURIComponent(run)}/board`).catch(() => null), hosted() ? null : api('/api/projects').catch(() => null)])
    if (!P.on) return
    P.board = board
    P.proj = list?.projects.find(p => p.id === P.pid) || list?.projects.find(p => p.versions?.some(v => v.id === run)) || null
    if (P.proj) P.pid = P.proj.id
    P.uploads = P.pid && !hosted() ? (await api(`/api/projects/${encodeURIComponent(P.pid)}/files`).catch(() => ({ files: [] }))).files : []
    render()
    clearTimeout(P.timer)
    P.timer = setTimeout(() => P.on && load(), board?.live ? 3000 : 15000)
  }

  // every file, grouped the way the panel and the stage show them
  function groups() {
    const b = P.board || {}
    const g = {}
    if (b.pages?.length) g.site = b.pages.map(p => ({ key: `page:${p.id}`, kind: 'page', name: p.title?.split(/\s[—–|:-]\s/)[0] || p.id, full: p.title, page: p.id, src: P.thumbs.get(p.id) || p.cover, snap: P.thumbs.has(p.id) }))
    if (b.app) g.app = [{ key: 'app', kind: 'app', name: 'App' }]
    if (b.game) g.game = [{ key: 'game', kind: 'game', name: b.game.title, src: b.game.cover }]
    if (b.films?.length) g.film = b.films.map((f, i) => ({ key: `film:${i}`, kind: 'film', name: f.name, src: f.poster, video: f.src, seconds: f.seconds }))
    if (b.art?.length) g.art = b.art.map(a => ({ key: `art:${a.page}/${a.layer}/${a.gen}`, kind: 'art', name: a.name.replace(/^\w/, c => c.toUpperCase()), src: a.src, used: a.used?.split(/\s[—–|:-]\s/)[0], style: a.style, art: a }))
    const ups = [...P.uploads.map(u => ({ key: `up:${u.name}`, kind: 'upload', name: u.name, src: /^image\//.test(u.type) ? u.src : null, type: u.type, size: u.size })),
      ...[...P.sending.values()].map(s => ({ key: `up:${s.name}`, kind: 'upload', name: s.name, sending: s.pct, src: s.preview }))]
    if (ups.length) g.uploads = ups
    if (b.code) g.code = [{ key: 'code', kind: 'code', name: 'App code' }]
    if (P.q) for (const k of Object.keys(g)) { g[k] = g[k].filter(x => x.name.toLowerCase().includes(P.q.toLowerCase())); if (!g[k].length) delete g[k] }
    return g
  }
  const find = key => Object.values(groups()).flat().find(x => x.key === key)

  // ---------- render
  function render() {
    const name = P.proj?.title || P.board?.title?.split(/\s[—–|:-]\s/)[0] || 'New project'
    crumb.querySelector('.pj-name b').textContent = name
    document.body.classList.toggle('pj-live', !!P.board?.live)
    renderList()
    renderStage()
    renderInsp()
    thumbs()
  }
  const thumbHtml = x => x.src ? `<span class="t" style="background-image:url('${esc(x.src.startsWith('data:') ? x.src : base() + x.src)}')"></span>`
    : x.kind === 'page' && P.board?.theme?.colors?.length ? `<span class="t tcs" style="--tc-bg:${esc(P.board.theme.colors[0])};--tc-pr:${esc(P.board.theme.colors[1] || P.board.theme.colors[0])}"></span>`
    : `<span class="t ic">${ic({ page: 'site', app: 'code', game: 'game', film: 'film', upload: /^audio\//.test(x.type || '') ? 'music' : 'file', code: 'code', art: 'image' }[x.kind] || 'file', 14)}</span>`
  function renderList() {
    const g = groups()
    listEl.innerHTML = SECTIONS.filter(([k]) => g[k]).map(([k, label]) => {
      const shut = P.open[k] === false || (k === 'code' && !P.open[k])
      const rows = shut ? '' : g[k].map(x => `<div class="row${P.sel === x.key ? ' on' : ''}" role="treeitem" tabindex="0" data-key="${esc(x.key)}" draggable="false">${thumbHtml(x)}<span class="nm">${esc(x.name)}</span>${x.sending != null ? `<span class="ring" style="--p:${Math.round(x.sending * 100)}%" role="progressbar" aria-label="Uploading" aria-valuenow="${Math.round(x.sending * 100)}"></span>` : ''}</div>`).join('')
      return `<div class="sec" data-sec="${k}"><button class="sec-h" aria-expanded="${!shut}">${ic(shut ? 'chr' : 'chd', 14)}<span>${label}</span>${k === 'code' ? '' : `<span class="n">${g[k].length}</span>`}</button>${rows}</div>`
    }).join('')
  }
  // a page with no picture yet: its theme's colours and heading font make a type cover
  function typeCover(x) {
    const th = P.board?.theme
    if (x.kind !== 'page' || !th?.colors?.length) return ''
    return `<div class="tc" style="--tc-bg:${esc(th.colors[0])};--tc-pr:${esc(th.colors[1] || th.colors[0])};--tc-fg:${esc(th.colors[3] || th.colors.at(-1))};--tc-font:'${esc(th.fonts?.heading || th.fonts?.display || '')}'"><i></i><b>${esc(x.name)}</b><span></span></div>`
  }
  function board(x) {
    const sel = P.sel === x.key ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : ''
    const img = x.src ? `<img src="${esc(x.src.startsWith('data:') ? x.src : base() + x.src)}" alt="" draggable="false" loading="lazy">`
      : typeCover(x) || `<span class="blank">${ic({ page: 'site', app: 'code', game: 'game', film: 'film', upload: 'file', code: 'code' }[x.kind] || 'file', 26)}</span>`
    const extra = x.kind === 'film' ? `<span class="play"></span>${x.seconds ? `<span class="dur">${fmtTime(x.seconds)}</span>` : ''}`
      : x.kind === 'game' ? '<span class="play"></span>'
        : x.sending != null ? `<span class="upl"><i style="width:${Math.round(x.sending * 100)}%"></i></span>` : ''
    const tall = x.kind === 'page' && x.snap && P.aspect.get(x.page)
    return `<div class="ab ${x.kind}" data-key="${esc(x.key)}" tabindex="-1"${tall ? ` style="height:${pageH(tall)}px"` : ''}>${img}${extra}${x.kind === 'page' ? `<div class="lys">${outline(x)}</div>` : ''}${sel}</div>`
  }
  // a page is 124 px wide on the stage; its snapshot sets how long it is (a very long page is cut off)
  const pageH = ratio => Math.round(Math.min(124 * ratio, 124 * 9))
  function outline(x) {
    if (!P.layer || P.sel !== x.key || !sw.layers) return ''
    const l = sw.layers.list(x.page).find(y => y.key === P.layer)
    const ratio = P.aspect.get(x.page)
    if (!l?.box || !ratio || !x.snap) return ''
    const h = 124 * ratio
    return `<div class="lsel" style="top:${(l.box.top * h).toFixed(1)}px;height:${Math.max(4, l.box.height * h).toFixed(1)}px"></div>`
  }
  function drawOutline() {
    for (const a of world.querySelectorAll('.ab.page')) { const lys = a.querySelector('.lys'); if (lys) lys.innerHTML = outline(find(a.dataset.key) || {}) }
  }
  // a snapshot that loads tells the page's length; the page grows to it in place
  function measurePages() {
    for (const im of world.querySelectorAll('.ab.page img')) {
      const a = im.closest('.ab'), x = find(a.dataset.key)
      if (!x?.snap) continue
      const set = () => {
        if (!im.naturalWidth) return
        const r = im.naturalHeight / im.naturalWidth
        if (Math.abs((P.aspect.get(x.page) || 0) - r) < 0.01) return
        P.aspect.set(x.page, r)
        a.style.height = `${pageH(r)}px`
        drawOutline()
      }
      if (im.complete) set(); else im.addEventListener('load', set, { once: true })
    }
  }
  function renderStage() {
    const g = groups()
    if (!P.board && !P.uploads.length) { world.innerHTML = ''; return }
    const sec = (k, label) => g[k] ? `<section class="pj-sec ${k}"><span class="al">${label}</span><div class="abs">${g[k].map(board).join('')}</div></section>` : ''
    world.innerHTML = `<div class="col">${sec('site', 'Site')}${sec('art', 'Art')}${sec('uploads', 'Uploads')}</div><div class="col">${sec('game', 'Game')}${sec('app', 'App')}${sec('film', 'Film')}${sec('code', 'Code')}</div>`
    applyCam()
    measurePages()
    if (!P.framed && world.offsetWidth) { P.framed = true; frameAll(false) }
    crewAtWork()
  }
  function renderInsp() {
    const x = P.sel && find(P.sel)
    insp.hidden = !x
    root.classList.toggle('insp-on', !!x)
    if (!x) return
    // never redraw under someone typing in it
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) return
    if (x.kind === 'page' && P.layer && sw.layers?.get(P.layer)) return renderLayer(x)
    P.layer = null
    if (dims.has(x.key)) x.dims = dims.get(x.key)
    const kv = [
      x.dims && ['Size', x.dims],
      x.style && ['Style', x.style],
      x.used && ['Used on', x.used],
      x.kind === 'film' && x.seconds && ['Length', fmtTime(x.seconds)],
      x.kind === 'upload' && x.size && ['File', `${(x.size / 1024 / 1024).toFixed(x.size > 1048576 ? 1 : 2)} MB`]
    ].filter(Boolean)
    const pv = x.kind === 'film' && x.video ? `<video src="${esc(base() + x.video)}" poster="${x.src ? esc(base() + x.src) : ''}" controls preload="none"></video>`
      : x.src ? `<img src="${esc(x.src.startsWith('data:') ? x.src : base() + x.src)}" alt="">` : typeCover(x) ? `<div class="pv-tc">${typeCover(x)}</div>` : `<span class="blank">${ic('file', 28)}</span>`
    const btns = [
      ['page', 'game', 'app', 'code', 'film', 'art'].includes(x.kind) && `<button class="btn ghost" data-act="open">${ic('ext', 15)}Open</button>`,
      (x.kind === 'art' || (x.kind === 'upload' && x.sending == null) || x.kind === 'film') && `<button class="btn ghost" data-act="export">${ic('download', 15)}Export</button>`,
      x.kind === 'page' && `<button class="btn ghost" data-act="zip">${ic('download', 15)}Export</button>`,
      (x.kind === 'art' || (x.kind === 'upload' && x.sending == null)) && !hosted() && `<button class="btn ghost" data-act="replace">${ic('upload', 15)}Replace</button>`
    ].filter(Boolean).join('')
    const secs = x.kind === 'page' && sw.layers ? sw.layers.list(x.page) : []
    const secHtml = secs.length ? `<div class="pj-secs" role="list" aria-label="Sections">${secs.map(l => `<button class="pj-ly" role="listitem" data-layer="${esc(l.key)}">${ic(l.shared ? 'layers' : 'frame', 14)}<span>${esc(l.role)}</span></button>`).join('')}</div>` : ''
    insp.innerHTML = `<h3><span>${esc(x.name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><div class="pv">${pv}</div>
      ${kv.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}${secHtml}<div class="btns">${btns}</div>`
    const im = insp.querySelector('.pv img')
    if (im && !x.dims) im.onload = () => { dims.set(x.key, `${im.naturalWidth} × ${im.naturalHeight}`); if (P.sel === x.key) renderInspSoon() }
  }
  // ---------- one section of a page: its words, fill, type, spacing, pictures and code
  const step = (list, v, d) => list[Math.max(0, Math.min(list.length - 1, (list.indexOf(v) < 0 ? 0 : list.indexOf(v)) + d))]
  function renderLayer(x) {
    const L = sw.layers, l = L.get(P.layer)
    const edit = l.done && !hosted()
    const cur = L.current(P.layer), th = L.theme || {}, sc = L.scales
    const texts = edit ? L.texts(P.layer).slice(0, 14) : []
    const colors = Object.entries(th.vars || {}).filter(([k]) => !/radius|font/.test(k))
    const stepper = (k, label, v) => `<div class="pj-step"><span>${label}</span><button class="ib sm" data-step="${k}:-1" aria-label="${label} smaller">${ic('minus', 14)}</button><b>${esc(v)}</b><button class="ib sm" data-step="${k}:1" aria-label="${label} bigger">${ic('plus', 14)}</button></div>`
    const px = v => v == null ? '' : String(Number(v) * 4 || v)
    const g = (title, body) => body ? `<div class="pj-g"><h4>${title}</h4>${body}</div>` : ''
    insp.innerHTML = `<h3><button class="ib sm pj-back" aria-label="Back to ${esc(x.name)}">${ic('chl', 16)}</button><span>${esc(l.role)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>
      ${edit ? '' : `<div class="kv"><span>${l.done ? 'View only' : 'Building'}</span><b></b></div>`}
      ${g('Text', texts.map(t => t.text.length > 56 ? `<label class="pj-f"><span>${t.kind}</span><textarea rows="${Math.min(5, Math.ceil(t.text.length / 34))}" data-text="${t.i}">${esc(t.text)}</textarea></label>` : `<label class="pj-f"><span>${t.kind}</span><input data-text="${t.i}" value="${esc(t.text)}"></label>`).join(''))}
      ${edit && colors.length ? g('Fill', `<div class="pj-sws">${colors.map(([k, v]) => `<button class="pj-sw${cur.bg === k.slice(2) ? ' on' : ''}" data-bg="${esc(k.slice(2))}" aria-label="${esc(k.slice(2))}" style="--c:${esc(v)}"></button>`).join('')}<button class="pj-sw none${cur.bg ? '' : ' on'}" data-bg="none" aria-label="No fill"></button></div>`) : ''}
      ${edit ? g('Type', `${cur.hsize ? stepper('hsize', 'Heading', cur.hsize) : ''}${['heading', 'body'].map(r => `<label class="pj-f row"><span>${r === 'heading' ? 'Heading' : 'Body'}</span><select data-font="${r}" aria-label="${r === 'heading' ? 'Heading' : 'Body'} font, every page">${[...new Set([th.fonts?.[r], ...sc.fonts].filter(Boolean))].map(f => `<option${f === th.fonts?.[r] ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>`).join('')}`) : ''}
      ${edit ? g('Spacing', `${stepper('pad', 'Padding', px(cur.py))}${cur.gap != null ? stepper('gap', 'Gap', px(cur.gap)) : ''}${cur.radius != null ? `<label class="pj-f row"><span>Corners</span><select data-radius aria-label="Corners">${sc.radius.map(r => `<option value="${r}"${r === (cur.radius || '') ? ' selected' : ''}>${r === 'theme' ? 'Theme' : r || 'base'}</option>`).join('')}</select></label>` : ''}`) : ''}
      ${edit && l.gens.length ? g('Pictures', l.gens.map((p, i) => `<div class="pj-pic" data-pic="${i}">${p.src ? `<img src="${esc(p.src.startsWith('data:') ? p.src : base() + p.src)}" alt="">` : `<span class="blank">${ic('image', 20)}</span>`}<textarea rows="2" aria-label="What the picture shows">${esc(p.gen)}</textarea><button class="btn ghost" data-paint="${i}"${p.busy ? ' disabled' : ''}>${ic('image', 15)}${p.busy ? 'Painting' : 'Paint'}</button></div>`).join('')) : ''}
      <div class="btns">${edit ? `<button class="btn ghost" data-act="code">${ic('code', 15)}Code</button>` : ''}<button class="btn ghost" data-act="open">${ic('ext', 15)}Open</button></div>
      ${edit ? `<form class="pj-ask pj-lask" autocomplete="off"><input name="q" placeholder="Tell the crew…" aria-label="Tell the crew about ${esc(l.role)}" maxlength="4000"><button type="submit" class="pj-send" aria-label="Send">${ic('up', 16)}</button></form>` : ''}`
  }
  // narrow panes: the dock sits under the inspector sheet, so a picked section has its own line
  insp.addEventListener('submit', e => {
    e.preventDefault()
    const q = e.target.q, text = q?.value.trim()
    if (!text || !P.layer) return
    q.value = ''
    sw.layers.fix(P.layer, text)
    toast(`${ic('msg', 15)}<span>On it</span>`)
  })
  function pickLayer(key) {
    P.layer = key || null
    sw.layers?.select(P.layer)
    renderInsp()
    drawOutline()
    scope()
    if (P.layer && narrow()) requestAnimationFrame(() => { const o = world.querySelector('.lsel'); if (o) fit(bounds([o]), 2, true) })
  }
  // after a hand edit: the inspector shows the new values and the page's picture catches up
  function edited(page) {
    setTimeout(() => { if (P.layer) renderInsp() }, 60)
    clearTimeout(P.snapT)
    P.snapT = setTimeout(async () => {
      const src = await sw.thumb(page, 0.26).catch(() => null)
      if (!src || !P.on) return
      P.thumbs.set(page, src)
      const im = world.querySelector(`.ab[data-key="${CSS.escape(`page:${page}`)}"] img`)
      if (im) im.src = src; else renderStage()
    }, 1200)
  }
  insp.addEventListener('change', e => {
    const x = find(P.sel), L = sw.layers
    if (!x || !P.layer || !L) return
    const t = e.target
    if (t.dataset.text != null) L.setText(P.layer, Number(t.dataset.text), t.value).then(ok => ok && edited(x.page))
    if (t.dataset.font) { L.token('font', t.dataset.font, t.value); edited(x.page) }
    if (t.hasAttribute('data-radius')) { L.edit(P.layer, 'radius', t.value); edited(x.page) }
  })
  insp.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[data-text]')) { e.preventDefault(); e.target.blur() } })
  function layerClick(e) {
    const x = find(P.sel), L = sw.layers
    if (!x || !L) return false
    const ly = e.target.closest('[data-layer]')
    if (ly) { pickLayer(ly.dataset.layer); return true }
    if (e.target.closest('.pj-back')) { pickLayer(null); return true }
    if (!P.layer) return false
    const bg = e.target.closest('[data-bg]')
    if (bg) { L.edit(P.layer, 'bg', bg.dataset.bg); edited(x.page); return true }
    const st = e.target.closest('[data-step]')
    if (st) {
      const [k, d] = st.dataset.step.split(':'), cur = L.current(P.layer)
      const v = k === 'hsize' ? step(L.scales.sizes, cur.hsize, +d) : step(L.scales.space, k === 'pad' ? cur.py : cur.gap, +d * 2)
      L.edit(P.layer, k, v); edited(x.page); return true
    }
    const pt = e.target.closest('[data-paint]')
    if (pt) {
      const row = pt.closest('.pj-pic'), p = L.get(P.layer).gens[Number(pt.dataset.paint)]
      pt.disabled = true
      L.paint(P.layer, p.gen, row.querySelector('textarea').value.trim()).then(ok => { if (!ok) { pt.disabled = false; toast(`<span>That picture could not start</span>`) } })
      return true
    }
    const b = e.target.closest('[data-act="code"]')
    if (b) { codeEditor(x); return true }
    return false
  }

  // the section's HTML in an editor: Save (or ⌘S / Ctrl+S) puts it on the page straight away
  function codeEditor(x) {
    const L = sw.layers, key = P.layer, l = L.get(key)
    const wrap = document.createElement('div')
    wrap.className = 'pj-code'
    wrap.innerHTML = `<div class="pj-code-box" role="dialog" aria-label="Code for ${esc(l.role)}"><h3><span>${esc(l.role)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><textarea spellcheck="false" aria-label="HTML">${esc(l.html)}</textarea><div class="btns"><button class="btn ghost" data-c="cancel">Cancel</button><button class="btn pri" data-c="save">Save</button></div></div>`
    document.body.append(wrap)
    const ta = wrap.querySelector('textarea')
    let off = null
    const close = () => { off?.(); wrap.remove() }
    off = window.SwarmUI?.layer(wrap.firstElementChild, close)
    const save = async () => {
      const ok = await L.save(key, ta.value, 'code')
      close()
      if (ok) { toast(`${ic('check', 15)}<span>Saved</span>`); edited(x.page) }
    }
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.pj-x, [data-c="cancel"]')) close(); if (e.target.closest('[data-c="save"]')) save() })
    ta.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save() }
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end') }
    })
    ta.focus(); ta.setSelectionRange(0, 0)
  }

  const dims = new Map()
  let inspT = 0
  const renderInspSoon = () => { clearTimeout(inspT); inspT = setTimeout(() => { const x = find(P.sel); if (x) { x.dims = dims.get(x.key); renderInspKv(x) } }, 0) }
  function renderInspKv(x) {
    const first = insp.querySelector('.kv')
    if (insp.querySelector('.kv-size')) return
    const row = document.createElement('div')
    row.className = 'kv kv-size'
    row.innerHTML = `<span>Size</span><b>${esc(x.dims)}</b>`
    if (first) first.before(row); else (insp.querySelector('.pj-secs') || insp.querySelector('.btns')).before(row)
  }

  // a page's real look, once the canvas behind has drawn it
  // the first page's snapshot becomes the build's cover on Projects (a picture cover still wins there)
  async function saveCover(src) {
    const run = P.run
    if (!run || P.saved?.has(run)) return
    ;(P.saved ||= new Set()).add(run)
    const im = new Image()
    await new Promise(r => { im.onload = r; im.onerror = r; im.src = src })
    if (!im.naturalWidth) return
    const c = document.createElement('canvas'), w = 800, h = 500
    c.width = w; c.height = h
    const k = w / im.naturalWidth
    c.getContext('2d').drawImage(im, 0, 0, im.naturalWidth, Math.min(im.naturalHeight, h / k), 0, 0, w, Math.min(h, im.naturalHeight * k))
    sw.api(`/api/runs/${encodeURIComponent(run)}/snap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/jpeg', 0.82) }) }).catch(() => {})
  }
  async function thumbs() {
    if (P.thumbBusy || !P.board?.pages?.length) return
    P.thumbBusy = true
    try {
      for (const p of P.board.pages) {
        // the build's card on Projects: the first page's picture, else its snapshot (once per build)
        if (p === P.board.pages[0] && (p.cover || P.thumbs.has(p.id))) saveCover(p.cover ? base() + p.cover : P.thumbs.get(p.id))
        if (P.thumbs.has(p.id)) continue
        const src = await sw.thumb(p.id).catch(() => null)
        // a snapshot of a frame still being laid out is a thin strip: wait for a page-shaped one
        const ok = src && await new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalHeight > im.naturalWidth * 0.6); im.onerror = () => r(false); im.src = src })
        if (ok && P.on) { P.thumbs.set(p.id, src); renderList(); renderStage(); if (p === P.board.pages[0]) saveCover(await sw.thumb(p.id, 0.6).catch(() => null) || src) }
      }
    } finally { P.thumbBusy = false }
    if (P.on && P.board.pages.some(p => !P.thumbs.has(p.id)) && (P.thumbTries = (P.thumbTries || 0) + 1) < 8) setTimeout(thumbs, 2500)
  }

  // ---------- the stage: pan (drag empty space, wheel), zoom (pinch, ⌘ wheel), Frame fits all
  // narrow panes (a phone, Hermes Desktop's side pane): the canvas stays; Files and Layers are a sheet
  const narrow = () => matchMedia('(max-width: 760px)').matches
  let offSheet = null
  function sheet(on) {
    root.classList.toggle('files-on', on)
    root.querySelector('.pj-files-btn')?.setAttribute('aria-expanded', String(on))
    offSheet?.(); offSheet = null
    if (on) offSheet = window.SwarmUI?.layer(root.querySelector('.pj-side'), () => sheet(false), { extra: [root.querySelector('.pj-files-btn')] })
  }
  function applyCam() { world.style.transform = `translate(${P.cam.x}px, ${P.cam.y}px) scale(${P.cam.k})` }
  // the box the artboards and their section names take up, in world units
  function bounds(els) {
    const wr = world.getBoundingClientRect(), k = P.cam.k
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (!r.width) continue
      x0 = Math.min(x0, (r.left - wr.left) / k); y0 = Math.min(y0, (r.top - wr.top) / k)
      x1 = Math.max(x1, (r.right - wr.left) / k); y1 = Math.max(y1, (r.bottom - wr.top) / k)
    }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
  }
  const dockH = () => (narrow() ? 72 : 90)
  function fit(b, max, animate) {
    const pad = narrow() ? 16 : 40
    const below = narrow() && !insp.hidden ? insp.offsetHeight : dockH()
    const sw_ = stage.clientWidth - (insp.hidden || narrow() ? 0 : 272) - pad * 2, sh = stage.clientHeight - below - pad * 2
    if (!b || sw_ <= 0 || sh <= 0) return
    const k = Math.min(max, Math.max(0.15, Math.min(sw_ / b.w, sh / b.h)))
    P.cam = { k, x: pad + (sw_ - b.w * k) / 2 - b.x * k, y: pad + Math.max(0, (sh - b.h * k) / 2) - b.y * k }
    world.classList.toggle('ease', animate)
    applyCam()
    setTimeout(() => world.classList.remove('ease'), 300)
  }
  function zoomTo(key) {
    const el = world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`)
    const b = el && bounds([el])
    // a long page: its top, at a readable size
    if (b && b.h > b.w * 1.4) b.h = b.w * 1.4
    if (b) fit(b, 2, true)
  }
  function frameAll(animate = true) {
    const b = bounds(world.querySelectorAll('.ab, .pj-sec > .al'))
    if (b) return fit(b, 1.25, animate)
    const sw_ = stage.clientWidth - (insp.hidden ? 0 : 272), sh = stage.clientHeight - 90
    const w = world.scrollWidth, h = world.scrollHeight
    if (!w || !h || sw_ <= 0) return
    const k = Math.min(1.25, Math.max(0.2, Math.min(sw_ / w, sh / h)))
    P.cam = { k, x: Math.max(0, (sw_ - w * k) / 2), y: Math.max(0, Math.min(24, (sh - h * k) / 2)) }
    world.classList.toggle('ease', animate)
    applyCam()
    setTimeout(() => world.classList.remove('ease'), 300)
  }
  let drag = null
  const touches = new Map()
  let pinch = null
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size === 2) {
        const [a, b] = [...touches.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: P.cam.k, cx: P.cam.x, cy: P.cam.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
        drag = null
        return
      }
    }
    if (e.button !== 0 || e.target.closest('.pj-dock, .pj-insp') || (e.pointerType !== 'touch' && e.target.closest('.ab'))) return
    drag = { x: e.clientX, y: e.clientY, cx: P.cam.x, cy: P.cam.y, moved: false }
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()], r = stage.getBoundingClientRect()
      const k = Math.min(3, Math.max(0.15, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d))
      const px = pinch.mx - r.left, py = pinch.my - r.top
      P.cam = { k, x: px - (px - pinch.cx) * k / pinch.k + ((a.x + b.x) / 2 - pinch.mx), y: py - (py - pinch.cy) * k / pinch.k + ((a.y + b.y) / 2 - pinch.my) }
      applyCam()
      return
    }
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    if (drag.moved) { P.cam.x = drag.cx + dx; P.cam.y = drag.cy + dy; applyCam(); stage.classList.add('panning') }
  })
  const endDrag = e => {
    touches.delete(e.pointerId)
    if (pinch) { if (touches.size < 2) pinch = null; drag = null; return }
    // a tap on an artboard (touch starts a pan there too) selects it
    if (drag && !drag.moved && e.pointerType === 'touch') { const a = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ab'); if (a) { drag = null; stage.classList.remove('panning'); return } }
    if (drag && !drag.moved && P.sel) select(null)
    drag = null; stage.classList.remove('panning')
  }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', e => { touches.delete(e.pointerId); pinch = null; drag = null; stage.classList.remove('panning') })
  stage.addEventListener('wheel', e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
      const k = Math.min(3, Math.max(0.15, P.cam.k * Math.exp(-e.deltaY * 0.01)))
      P.cam.x = px - (px - P.cam.x) * k / P.cam.k; P.cam.y = py - (py - P.cam.y) * k / P.cam.k; P.cam.k = k
    } else { P.cam.x -= e.deltaX; P.cam.y -= e.deltaY }
    applyCam()
  }, { passive: false })

  // ---------- selecting and opening
  function select(key, { pan = false } = {}) {
    if (key !== P.sel && P.layer) { P.layer = null; sw.layers?.select(null); scope() }
    P.sel = key
    // in place: re-rendering would reload every picture on the stage
    for (const r of listEl.querySelectorAll('.row')) r.classList.toggle('on', r.dataset.key === key)
    for (const a of world.querySelectorAll('.ab')) {
      const on = a.dataset.key === key, s = a.querySelector(':scope > .sel')
      if (on && !s) a.insertAdjacentHTML('beforeend', '<div class="sel"><i></i><i></i><i></i><i></i></div>')
      if (!on && s) s.remove()
    }
    renderInsp()
    if (pan && key) {
      const el = world.querySelector(`.ab[data-key="${CSS.escape(key)}"]`)
      if (el) {
        const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect()
        const vw = s.width - (insp.hidden ? 0 : 272)
        if (r.left < s.left + 20 || r.right > s.left + vw - 20 || r.top < s.top + 20 || r.bottom > s.bottom - 100) {
          P.cam.x += s.left + vw / 2 - (r.left + r.width / 2); P.cam.y += s.top + (s.height - 90) / 2 - (r.top + r.height / 2)
          world.classList.add('ease'); applyCam(); setTimeout(() => world.classList.remove('ease'), 300)
        }
      }
    }
  }
  function openItem(x) {
    if (!x) return
    if (x.kind === 'page' || x.kind === 'art') { C.go('station', 'canvas'); setTimeout(() => sw.focusPage(x.page || x.art?.page), 60); return }
    if (x.kind === 'film') return C.go('station', 'video')
    if (x.kind === 'game' || x.kind === 'app' || x.kind === 'code') return C.go('station', 'app')
    if (x.kind === 'upload' && x.src) window.open(base() + x.src, '_blank', 'noopener')
  }
  // an artboard the inspector would slide over: wait out a double-click, then select and pan it clear
  let clickT = 0
  const sectionAt = (a, e) => {
    const x = find(a.dataset.key), ratio = x && P.aspect.get(x.page)
    if (x?.kind !== 'page' || !x.snap || !ratio || !sw.layers) return null
    const y = (e.clientY - a.getBoundingClientRect().top) / (a.getBoundingClientRect().height || 1) * a.offsetHeight / (124 * ratio)
    return sw.layers.list(x.page).filter(l => l.box && y >= l.box.top && y < l.box.top + l.box.height).pop() || null
  }
  world.addEventListener('click', e => {
    const a = e.target.closest('.ab'); if (!a) return
    clearTimeout(clickT)
    // (not the second click of a double-click, which opens the page's room)
    if (a.classList.contains('page') && e.detail < 2 && (a.dataset.key === P.sel || e.metaKey || e.ctrlKey)) {
      const l = sectionAt(a, e)
      if (l) { if (a.dataset.key !== P.sel) select(a.dataset.key); return pickLayer(l.key) }
    }
    const r = a.getBoundingClientRect(), s = stage.getBoundingClientRect()
    if (insp.hidden && r.right > s.right - 292) clickT = setTimeout(() => select(a.dataset.key, { pan: true }), 280)
    else select(a.dataset.key)
  })
  world.addEventListener('pointermove', e => {
    const a = e.target.closest('.ab.page')
    const hov = world.querySelector('.lhov')
    if (!a || a.dataset.key !== P.sel || e.pointerType === 'touch') { hov?.remove(); return }
    const l = sectionAt(a, e), ratio = P.aspect.get(find(a.dataset.key)?.page)
    if (!l || l.key === P.layer) { hov?.remove(); return }
    const el = hov || Object.assign(document.createElement('div'), { className: 'lhov' })
    el.style.top = `${(l.box.top * 124 * ratio).toFixed(1)}px`; el.style.height = `${(l.box.height * 124 * ratio).toFixed(1)}px`
    if (el.parentElement !== a.querySelector('.lys')) a.querySelector('.lys')?.append(el)
  })
  world.addEventListener('pointerleave', () => world.querySelector('.lhov')?.remove())
  world.addEventListener('dblclick', e => { const a = e.target.closest('.ab'); if (a) { clearTimeout(clickT); openItem(find(a.dataset.key)) } })
  world.addEventListener('contextmenu', e => { const a = e.target.closest('.ab'); if (!a) return; e.preventDefault(); select(a.dataset.key); fileMenu(find(a.dataset.key), null, { x: e.clientX, y: e.clientY }) })
  listEl.addEventListener('click', e => {
    const h = e.target.closest('.sec-h')
    if (h) { const k = h.parentElement.dataset.sec; const shut = P.open[k] === false || (k === 'code' && !P.open[k]); P.open[k] = shut; store.set('project.open', P.open); renderList(); return }
    const r = e.target.closest('.row')
    if (r && !e.target.closest('input')) {
      if (narrow()) { select(r.dataset.key); sheet(false); requestAnimationFrame(() => zoomTo(r.dataset.key)) }
      else select(r.dataset.key, { pan: true })
    }
  })
  listEl.addEventListener('dblclick', e => { const r = e.target.closest('.row'); if (r && !e.target.closest('input')) openItem(find(r.dataset.key)) })
  listEl.addEventListener('keydown', e => {
    const r = e.target.closest('.row')
    if (!r || e.target.closest('input')) return
    if (e.key === 'Enter') { e.preventDefault(); openItem(find(r.dataset.key)) }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const rows = [...listEl.querySelectorAll('.row')], i = rows.indexOf(r); const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { select(n.dataset.key, { pan: true }); listEl.querySelector(`.row[data-key="${CSS.escape(n.dataset.key)}"]`)?.focus() } }
    if (e.key === 'F2') { e.preventDefault(); rename(find(r.dataset.key)) }
  })
  listEl.addEventListener('contextmenu', e => { const r = e.target.closest('.row'); if (!r) return; e.preventDefault(); select(r.dataset.key); fileMenu(find(r.dataset.key), null, { x: e.clientX, y: e.clientY }) })
  insp.addEventListener('click', e => {
    if (e.target.closest('.pj-x')) return select(null)
    if (layerClick(e)) return
    const b = e.target.closest('[data-act]'), x = find(P.sel)
    if (!b || !x) return
    const act = b.dataset.act
    if (act === 'open') openItem(x)
    if (act === 'export') saveFile(x)
    if (act === 'zip') exportZip()
    if (act === 'replace') replace(x)
  })

  // ---------- the file menu
  let menu = null
  function closeMenu() { menu?.off?.(); menu?.el.remove(); menu = null }
  function showMenu(items, anchor, at) {
    closeMenu()
    const el = document.createElement('div')
    el.className = 'hm-menu'
    el.setAttribute('role', 'menu')
    el.innerHTML = items.map(it => it === '-' ? '<hr>' : `<button role="menuitem" class="${it.red ? 'red' : ''}${it.on ? ' on' : ''}" data-k="${esc(it.k)}">${ic(it.icon, 16)}<span>${esc(it.label)}</span>${it.on ? `<span class="k">${ic('check', 14)}</span>` : ''}</button>`).join('')
    document.body.append(el)
    const r = anchor ? anchor.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y }
    const w = el.offsetWidth, h = el.offsetHeight
    let x = anchor ? r.left : at.x, y = anchor ? r.bottom + 6 : at.y
    x = Math.max(8, Math.min(innerWidth - w - 8, x)); if (y + h > innerHeight - 8) y = Math.max(8, (anchor ? r.top - 6 : at.y) - h)
    el.style.left = `${x}px`; el.style.top = `${y}px`
    menu = { el }
    menu.off = window.SwarmUI?.layer(el, closeMenu, { extra: [anchor].filter(Boolean) })
    el.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; const it = items.find(x => x !== '-' && x.k === b.dataset.k); closeMenu(); it.run() }
    el.addEventListener('keydown', e => {
      const bs = [...el.querySelectorAll('button')], i = bs.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus() }
    })
    el.querySelector('button')?.focus({ preventScroll: true })
  }
  function fileMenu(x, anchor, at) {
    if (!x) return
    const up = x.kind === 'upload' && x.sending == null && !hosted()
    const items = [
      x.kind !== 'upload' || x.src ? { k: 'open', icon: 'ext', label: 'Open', run: () => openItem(x) } : null,
      up ? { k: 'rename', icon: 'type', label: 'Rename', run: () => rename(x) } : null,
      up ? { k: 'dup', icon: 'layers', label: 'Duplicate', run: () => fileOp({ op: 'duplicate', name: x.name }) } : null,
      ['art', 'upload', 'film'].includes(x.kind) && x.sending == null ? { k: 'dl', icon: 'download', label: 'Download', run: () => saveFile(x) } : x.kind === 'page' ? { k: 'dl', icon: 'download', label: 'Download', run: () => exportZip() } : null,
      !hosted() && x.sending == null ? { k: 'show', icon: 'file', label: 'Show in Finder', run: () => post(`/api/projects/${encodeURIComponent(P.pid)}/reveal`, x.kind === 'upload' ? { name: x.name } : { run: P.run }).catch(() => {}) } : null,
      ...(up ? ['-', { k: 'del', icon: 'trash', label: 'Delete', red: true, run: () => fileOp({ op: 'delete', name: x.name }).then(() => { if (P.sel === x.key) select(null); toast(`${ic('trash', 15)}<span>Deleted</span>`) }) }] : [])
    ].filter(Boolean)
    if (items.length) showMenu(items, anchor, at)
  }
  async function fileOp(body) {
    try { const out = await post(`/api/projects/${encodeURIComponent(P.pid)}/files`, body); P.uploads = out.files || P.uploads; render(); return out } catch (err) { toast(`<span>${esc(err.body?.error || err.message)}</span>`) }
  }
  function rename(x) {
    if (!x || x.kind !== 'upload' || hosted()) return
    const host = listEl.querySelector(`.row[data-key="${CSS.escape(x.key)}"] .nm`)
    if (!host) return
    host.innerHTML = `<input class="hm-rename" value="${esc(x.name)}" maxlength="120" aria-label="Name">`
    const i = host.querySelector('input')
    const dot = x.name.lastIndexOf('.')
    i.focus(); i.setSelectionRange(0, dot > 0 ? dot : x.name.length)
    let over = false
    const done = save => {
      if (over) return; over = true
      const v = i.value.trim()
      if (save && v && v !== x.name) fileOp({ op: 'rename', name: x.name, to: v }).then(out => { if (out) { P.sel = `up:${out.name || v}`; render() } })
      else renderList()
    }
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(true) } if (e.key === 'Escape') { e.preventDefault(); done(false) } }
    i.onblur = () => done(true)
  }
  function saveFile(x) {
    const src = x.kind === 'film' ? x.video : x.kind === 'upload' ? x.src || `/up/${P.pid}/${encodeURIComponent(x.name)}` : x.src
    if (!src) return
    const a = Object.assign(document.createElement('a'), { href: base() + src, download: x.kind === 'upload' ? x.name : `${(x.name || 'file').replace(/[^\w.-]+/g, '-')}${(src.match(/\.\w+(?=$|\?)/) || [''])[0]}` })
    document.body.append(a); a.click(); a.remove()
  }
  async function exportZip() {
    toast(`${ic('download', 15)}<span>Preparing</span>`)
    try {
      const r = await sw.api(`/api/runs/${encodeURIComponent(P.run)}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'export failed')
      const z = await sw.api(`/api/runs/${encodeURIComponent(P.run)}/export.zip`)
      if (!z.ok) throw new Error('export failed')
      const name = (z.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'build.zip'
      const url = URL.createObjectURL(await z.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(`${ic('check', 15)}<span>${esc(name)}</span>`)
    } catch (err) { toast(`<span>${esc(err.message)}</span>`) }
  }
  // Replace: a picture is painted again (the words in "Tell the crew…" steer it); an upload takes a new file
  function replace(x) {
    if (x.kind === 'upload') { P.replacing = x.name; fileIn.multiple = false; fileIn.click(); return }
    if (x.kind === 'art') {
      const prompt = input.value.trim()
      post(`/api/runs/${encodeURIComponent(P.run)}/image`, { page: x.art.page, layer: x.art.layer, gen: x.art.gen, prompt })
        .then(() => { input.value = ''; toast(`${ic('image', 15)}<span>Painting</span>`); setTimeout(load, 1500) })
        .catch(err => toast(`<span>${esc(err.body?.error || err.message)}</span>`))
    }
  }

  // ---------- breadcrumb menu: rename, duplicate, versions
  function projectMenu(anchor) {
    if (!P.pid || hosted()) return
    const p = P.proj
    const items = [
      { k: 'rename', icon: 'type', label: 'Rename', run: renameProject },
      { k: 'dup', icon: 'layers', label: 'Duplicate', run: () => post('/api/projects', { op: 'duplicate', ids: [P.pid] }).then(out => { const np = out.projects.find(x => x.id === out.id); if (np) C.open(np.head, np.id) }).catch(() => {}) },
      ...(p?.versions?.length > 1 ? ['-', ...p.versions.map((v, i) => ({ k: `v:${v.id}`, icon: 'clock', label: `Version ${p.versions.length - i}`, on: v.id === P.run, run: () => C.open(v.id, P.pid) }))] : [])
    ]
    showMenu(items, anchor)
  }
  function renameProject() {
    const b = crumb.querySelector('.pj-name b')
    const was = b.textContent
    b.innerHTML = `<input class="hm-rename" value="${esc(was)}" maxlength="80" aria-label="Project name">`
    const i = b.querySelector('input')
    i.focus(); i.select()
    let over = false
    const done = save => {
      if (over) return; over = true
      const v = i.value.trim()
      b.textContent = save && v ? v : was
      if (save && v && v !== was) post('/api/projects', { op: 'rename', ids: [P.pid], title: v }).then(() => load()).catch(() => {})
    }
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(true) } if (e.key === 'Escape') { e.preventDefault(); done(false) } }
    i.onclick = e => e.stopPropagation()
    i.onblur = () => done(true)
  }

  // ---------- uploads: + → Upload files, the Image tool, or files dropped on the panel or the stage
  function upload(files, as = null) {
    if (!P.pid || hosted()) return toast(`<span>Uploads need a saved project</span>`)
    for (const f of files) {
      const name = as || f.name
      const s = { name, pct: 0, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null }
      P.sending.set(name, s)
      const x = new XMLHttpRequest()
      x.open('POST', `${base()}/api/projects/${encodeURIComponent(P.pid)}/upload?name=${encodeURIComponent(name)}${as ? '&replace=1' : ''}`)
      x.setRequestHeader('x-swarm-token', (window.SWARM || {}).token || '')
      x.upload.onprogress = e => { if (e.lengthComputable) { s.pct = e.loaded / e.total; const ring = listEl.querySelector(`.row[data-key="up:${CSS.escape(name)}"] .ring`); if (ring) ring.style.setProperty('--p', `${Math.round(s.pct * 100)}%`); const bar = world.querySelector(`.ab[data-key="up:${CSS.escape(name)}"] .upl i`); if (bar) bar.style.width = `${Math.round(s.pct * 100)}%` } }
      x.onloadend = async () => {
        P.sending.delete(name)
        if (s.preview) setTimeout(() => URL.revokeObjectURL(s.preview), 4000)
        let out = {}
        try { out = JSON.parse(x.responseText) } catch {}
        if (x.status !== 200) toast(`<span>${esc(out.error || `${name} did not upload`)}</span>`)
        P.uploads = (await api(`/api/projects/${encodeURIComponent(P.pid)}/files`).catch(() => ({ files: P.uploads }))).files
        if (out.name) P.sel = `up:${out.name}`
        render()
      }
      x.send(f)
    }
    P.open.uploads = true
    render()
  }
  fileIn.onchange = () => { const fs = [...fileIn.files]; if (fs.length) upload(fs, P.replacing && fs.length === 1 ? P.replacing : null); P.replacing = null; fileIn.multiple = true; fileIn.value = '' }
  const dropEl = $('.pj-drop')
  let dragDepth = 0
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
  root.addEventListener('dragenter', e => { if (!hasFiles(e) || hosted()) return; e.preventDefault(); dragDepth++; dropEl.hidden = false })
  root.addEventListener('dragover', e => { if (!hasFiles(e) || hosted()) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
  root.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; dropEl.hidden = true } })
  root.addEventListener('drop', e => { if (!hasFiles(e) || hosted()) return; e.preventDefault(); dragDepth = 0; dropEl.hidden = true; upload([...e.dataTransfer.files]) })

  // ---------- the panel's tabs, search and + menu
  $('.pj-tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]')
    if (!t) return
    P.tab = t.dataset.tab
    root.querySelectorAll('.pj-tabs .pj-tab').forEach(b => b.classList.toggle('on', b === t))
    listEl.hidden = P.tab !== 'files'; layersEl.hidden = P.tab !== 'layers'
    if (P.tab === 'layers') { const tree = document.getElementById('tree'); if (tree && tree.parentElement !== layersEl) { P.treeHome = tree.parentElement; layersEl.append(tree) } }
  })
  layersEl.addEventListener('click', e => {
    if (e.target.closest('.eye, .tw, .caret')) return
    const row = e.target.closest('.ly[data-key]'), pg = e.target.closest('.pg-title[data-page]')
    if (!row && !pg) return
    e.stopPropagation()
    const pages = P.board?.pages || []
    if (pg) { if (pg.dataset.page !== '*') select(`page:${pg.dataset.page}`, { pan: true }); return }
    const l = sw.layers?.get(row.dataset.key)
    if (!l) return
    const page = l.page === '*' ? (find(P.sel)?.page || pages[0]?.id) : l.page
    if (!page) return
    if (P.sel !== `page:${page}`) select(`page:${page}`, { pan: true })
    pickLayer(row.dataset.key)
    if (narrow()) sheet(false)
  }, true)
  const search = $('.pj-search'), sInput = search.querySelector('input')
  $('.pj-find').onclick = () => { search.hidden = !search.hidden; if (!search.hidden) sInput.focus(); else { P.q = ''; sInput.value = ''; render() } }
  sInput.oninput = () => { P.q = sInput.value.trim(); renderList(); renderStage() }
  sInput.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); search.hidden = true; P.q = ''; sInput.value = ''; render() } }
  $('.pj-add').onclick = e => showMenu([
    { k: 'page', icon: 'file', label: 'New page', run: newPage },
    ...(hosted() ? [] : [{ k: 'up', icon: 'upload', label: 'Upload files', run: () => fileIn.click() }])
  ], e.currentTarget)
  function newPage() { select(null); input.value = 'Add a page: '; input.focus() }

  // ---------- the dock
  $('.pj-dock').addEventListener('click', e => {
    const b = e.target.closest('[data-tool]')
    if (!b) return
    const t = b.dataset.tool
    if (t === 'files') return sheet(!root.classList.contains('files-on'))
    if (t === 'frame') return frameAll()
    if (t === 'text') return newPage()
    if (t === 'image') return hosted() ? null : fileIn.click()
    if (t === 'comment') return C.chat(!document.body.classList.contains('cosmos-chat'))
  })
  // "Tell the crew…": an edit of the selected page rewrites its section (/fix); about a picture, it is
  // painted again with those words; otherwise the project's next version keeps every page and adds
  // what was asked (web/route.js).
  ask.onsubmit = e => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return input.focus()
    const x = P.sel && find(P.sel)
    if (x?.kind === 'art') return replace(x)
    input.value = ''
    if (x?.kind === 'page' && P.layer && sw.layers?.get(P.layer)?.done) { sw.layers.fix(P.layer, text); toast(`${ic('msg', 15)}<span>On it</span>`); return }
    const route = routeMessage({ text, run: P.run, site: !P.board?.game && P.board?.pages?.length > 0, selected: x?.kind === 'page', hosted: hosted() })
    if (route === 'fix') { sw.focusPage(x.page); sw.submit(`/fix ${text}`); toast(`${ic('msg', 15)}<span>On it</span>`); setTimeout(load, 1500); return }
    // the project's next version: every page kept, the crew builds what was asked
    sw.submit(text, false, P.pid, route === 'extend' ? P.run : null)
    P.run = null; P.framed = false
    setTimeout(() => { P.run = sw.S?.run || null; load() }, 1200)
  }

  // the section the dock is talking about; its × goes back to the whole project
  const scopeEl = $('.pj-scope')
  function scope() {
    const l = P.layer && sw.layers?.get(P.layer)
    scopeEl.hidden = !l
    if (l) { scopeEl.querySelector('span').textContent = l.role; scopeEl.setAttribute('aria-label', `About ${l.role}; clear`) }
  }
  scopeEl.onclick = () => { pickLayer(null); input.focus() }

  // ---------- the crew at work: named cursors over the artboards while a build runs
  function crewAtWork() {
    const live = !!P.board?.live
    if (!live) { curEl.innerHTML = ''; return }
    if (!curEl.children.length) curEl.innerHTML = CREW.map(n => cursor(n)).join('')
    if (P.wander) return
    const move = () => {
      if (!P.on || !P.board?.live) { P.wander = 0; curEl.innerHTML = ''; return }
      const abs = [...world.querySelectorAll('.ab')], s = stage.getBoundingClientRect()
      for (const c of curEl.children) {
        const a = abs[Math.floor(Math.random() * abs.length)]
        if (!a) continue
        const r = a.getBoundingClientRect()
        c.style.left = `${r.left - s.left + r.width * (0.2 + Math.random() * 0.6)}px`
        c.style.top = `${r.top - s.top + r.height * (0.2 + Math.random() * 0.6)}px`
      }
      P.wander = setTimeout(move, 1400 + Math.random() * 900)
    }
    P.wander = setTimeout(move, 50)
  }

  let toastEl = null
  function toast(html) {
    toastEl?.remove()
    const t = toastEl = document.createElement('div')
    t.className = 'hm-toast'
    t.setAttribute('role', 'status')
    t.innerHTML = html
    root.append(t)
    setTimeout(() => t.remove(), 3000)
  }

  addEventListener('keydown', e => {
    if (!P.on || e.defaultPrevented || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (window.SwarmUI?.open?.() || document.querySelector('.hm-menu')) return
    if (e.key === 'Escape' && P.layer) { e.preventDefault(); e.stopPropagation(); pickLayer(null); return }
    if (e.key === 'Escape' && P.sel) { e.preventDefault(); e.stopPropagation(); select(null) }
    if (e.key === 'Enter' && P.sel) { e.preventDefault(); openItem(find(P.sel)) }
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey) frameAll()
    if ((e.key === 'Delete' || e.key === 'Backspace') && P.sel?.startsWith('up:')) { const x = find(P.sel); if (x) { e.preventDefault(); fileOp({ op: 'delete', name: x.name }).then(() => select(null)) } }
  }, true)
  addEventListener('resize', () => { if (P.on) crewAtWork() })
  sw.on(e => {
    if (!P.on) return
    if (e.type === 'run:start' || e.type === 'reset') { if (e.run) P.run = e.run; P.thumbs.clear(); setTimeout(load, 600) }
    if (e.type === 'image' || e.type === 'page' || e.type === 'video:done' || e.type === 'run:done') { clearTimeout(P.soon); P.soon = setTimeout(load, 800) }
    if (e.type === 'layer:done') { P.thumbs.clear(); clearTimeout(P.soonT); P.soonT = setTimeout(thumbs, 2000) }
  })

  return {
    el: root,
    show(run, pid) {
      if (pid !== undefined && pid !== P.pid) { P.pid = pid; P.sel = null; P.framed = false; P.thumbs.clear() }
      if (run && run !== P.run) { P.run = run; P.sel = null; P.framed = false; P.thumbs.clear() }
      if (!run && pid === null) { P.run = null; P.framed = false }
      root.hidden = false
      P.on = true
      load()
    },
    hide() {
      P.on = false
      clearTimeout(P.timer); clearTimeout(P.wander); P.wander = 0
      closeMenu()
      if (P.treeHome) { const tree = document.getElementById('tree'); if (tree) P.treeHome.append(tree); P.treeHome = null; P.tab = 'files'; root.querySelectorAll('.pj-tabs .pj-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === 'files')); listEl.hidden = false; layersEl.hidden = true }
      root.hidden = true
    },
    get pid() { return P.pid },
    get run() { return P.run }
  }
}
