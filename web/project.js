// A project: one canvas (docs/ux/PATTERNS.md). The top bar carries the breadcrumb (Projects ›
// name ▾), Play and Publish. The left panel lists every file the build made, by kind
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
import { ic, cursor, CREW, PAINTERS, REVIEWER, painterOf } from './icons.js'
import { routeMessage } from './route.js'
import { swEdit } from './edit/patches.js'
import { layerSheet } from './layers.js'

const REF_FROM = { upload: 'Added here', chat: 'A chat', feed: 'The Feed', link: 'A link', plan: 'The plan', film: 'A film' }
const SECTIONS = [['site', 'Site'], ['app', 'App'], ['game', 'Game'], ['film', 'Film'], ['art', 'Art'], ['uploads', 'Uploads'], ['refs', 'References'], ['code', 'Code']]
const fmtTime = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : ''

export function makeProject({ sw, C, root }) {
  const esc = sw.esc, store = sw.store
  const base = () => sw.base || ''
  const hosted = () => document.body.classList.contains('hosted')
  const P = {
    on: false, seen: null, shown: '', proj: null, board: null, uploads: [], refs: [], sending: new Map(),
    sel: null, layer: null, el: null, aspect: new Map(), tab: 'files', q: '', open: store.get('project.open', { code: false }), cam: { x: 0, y: 0, k: 1 }, follow: true, followSig: '', followRun: '', tool: 'move', thumbs: new Map(), sharp: new Map(), stale: new Set(), shot: new Map(), want: { s: new Map(), f: new Map() }, failed: new Set(), camAt: 0, visit: 0,
    standin: new Map(), landed: new Map(), pendingKeys: new Set(), toGame: new Set(), tick: 0,
    // Scribble (spec 29): unsent marks, what Eraser and Clear took (for ⌘Z), the run's sent marks, its drafts
    marks: [], mkN: 0, mkUndo: [], sent: new Map(), drafts: new Map(), drafting: new Map(), reads: new Map(), rendering: new Set()
  }
  // the version shown and its project are the navigation machine's (spec 34). A project opened with
  // no version yet shows the build the canvas holds; one too new to name its project takes it from
  // the project list.
  const nav = C.nav
  Object.defineProperties(P, {
    run: { get: () => nav.view.version || P.seen },
    pid: { get: () => nav.view.project || P.proj?.id || null }
  })
  // P.visit counts the views: a page picture asked for in an earlier one is not drawn or kept in this one
  const forget = () => { P.visit++; P.sel = null; P.framed = false; P.thumbs.clear(); P.sharp.clear(); P.stale.clear(); P.shot.clear(); P.want.s.clear(); P.want.f.clear(); P.failed.clear(); P.thumbTries = 0 }

  root.className = 'project'
  root.hidden = true
  root.innerHTML = `
    <aside class="pj-side" aria-label="Files">
      <div class="pj-tabs" role="tablist"><button class="pj-tab on" data-tab="files" role="tab">Files</button><button class="pj-tab" data-tab="layers" role="tab">Layers</button>
        <button class="ib sm pj-find" aria-label="Search">${ic('search', 16)}</button><button class="ib sm pj-add" aria-label="Add" aria-haspopup="menu">${ic('plus', 16)}</button></div>
      <label class="pj-search" hidden><input type="search" placeholder="Search" aria-label="Search files"></label>
      <form class="pj-search pj-link" hidden autocomplete="off"><input type="text" inputmode="url" name="u" placeholder="Paste a link" aria-label="Reference link" maxlength="1000"></form>
      <div class="pj-list" role="tree"></div>
      <div class="pj-layers" hidden></div>
    </aside>
    <div class="pj-stage" tabindex="-1" aria-label="Overview">
      <div class="pj-world"></div>
      <div class="pj-cursors" aria-hidden="true"></div>
      <div class="pj-drop" hidden><span>${ic('upload', 22)}</span></div>
    </div>
    <aside class="pj-insp" hidden aria-label="Inspector"></aside>
    <div class="pj-dock">
      <button class="ib pj-files-btn" data-tool="files" aria-label="Files" aria-expanded="false">${ic('folder')}</button>
      <button class="ib on" data-tool="move" aria-label="Move">${ic('move')}</button>
      <button class="ib pj-mk" data-tool="scribble" aria-label="Scribble" aria-pressed="false">${ic('pencil')}</button>
      <button class="ib pj-mk" data-tool="eraser" aria-label="Eraser" aria-pressed="false">${ic('eraser')}</button>
      <button class="ib" data-tool="frame" aria-label="Frame all">${ic('frame')}</button>
      <button class="ib pj-follow" data-tool="follow" aria-label="Follow the crew" aria-pressed="true" disabled>${ic('users')}</button>
      <button class="ib" data-tool="text" aria-label="New page">${ic('type')}</button>
      <button class="ib" data-tool="image" aria-label="Upload files">${ic('image')}</button>
      <button class="ib" data-tool="comment" aria-label="Chat">${ic('msg')}</button>
      <form class="pj-ask" autocomplete="off"><button type="button" class="pj-scope" hidden aria-label="Talk to the crew about the whole project"><span></span>${ic('x', 12)}</button><button type="button" class="pj-scope pj-mkchip" hidden aria-label="Clear the marks"><span></span>${ic('x', 12)}</button><input name="q" placeholder="Tell the crew…" aria-label="Tell the crew" maxlength="4000"><button type="submit" class="pj-send" aria-label="Send">${ic('up', 16)}</button></form>
    </div>
    <input type="file" class="pj-file" multiple hidden>
    <input type="file" class="pj-reffile" multiple hidden accept="image/*,video/*,audio/*,.pdf,.txt,.md">`
  const $ = s => root.querySelector(s)
  const listEl = $('.pj-list'), layersEl = $('.pj-layers'), stage = $('.pj-stage'), world = $('.pj-world'), insp = $('.pj-insp'), curEl = $('.pj-cursors')
  const ask = $('.pj-ask'), input = ask.q, fileIn = $('.pj-file')

  // ---------- the top bar: Projects › name ▾ (the crew show as named cursors on the board while they work)
  const crumb = document.createElement('div')
  crumb.className = 'pj-crumb'
  crumb.innerHTML = `<button class="pj-up">Projects</button>${ic('chr', 14)}<button class="pj-name" aria-haspopup="menu"><b></b>${ic('chd', 14)}</button>`
  const bar = document.querySelector('.topbar')
  bar?.querySelector('.spacer')?.before(crumb)
  // what the crew are doing right now, said plainly: "Pip, Mochi painting 3 of 8 · Ren reviewing page 2 of 5"
  // a click on it goes to the work: the pictures being made, or the page being checked
  const liveEl = document.createElement('button')
  liveEl.className = 'pj-now'
  liveEl.setAttribute('aria-live', 'polite')
  liveEl.hidden = true
  liveEl.onclick = () => {
    const b = P.board || {}, w = (b.painting || []).find(x => x.state !== 'failed')
    if (b.review?.active && b.review.current) return zoomTo(`page:${b.review.current}`)
    const sec = world.querySelector('.pj-sec.art')
    if (w && sec) { fit(bounds([sec]), 1, true); return }
    if (b.review?.active) frameAll()
  }
  bar?.querySelector('#play-btn')?.before(liveEl)
  crumb.querySelector('.pj-up').onclick = () => C.go('home')
  crumb.querySelector('.pj-name').onclick = e => projectMenu(e.currentTarget)

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { body: j }); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  async function load() {
    // never the server's current run: an Overview shows the build that was opened or started here
    const run = P.run || sw.viewing || sw.S?.run
    if (!run || run === 'new') { P.board = null; P.boardOf = P.run; render(); return }
    if (run !== nav.view.version) P.seen = run
    const [board, list] = await Promise.all([api(`/api/runs/${encodeURIComponent(run)}/board`).catch(() => null), hosted() ? null : api('/api/projects').catch(() => null)])
    // the view moved to another run while this one loaded: its answer is not drawn over the new one
    if (!P.on || P.run !== run) return
    // a picture that was being made and now is there: it fades in over its stand-in
    const now = new Set((board?.painting || []).filter(w => w.state !== 'failed').map(w => `art:${w.page}/${w.layer}/${w.gen}`))
    for (const k of P.pendingKeys) if (!now.has(k) && board?.art?.some(a => `art:${a.page}/${a.layer}/${a.gen}` === k)) { P.landed.set(k, Date.now()); setTimeout(() => { P.landed.delete(k); P.standin.delete(k.split('/').slice(2).join('/')); if (P.on) renderStage() }, 1600) }
    P.pendingKeys = now
    P.board = board; P.boardOf = run
    // the pages' saved snapshots paint at once, before the canvas behind has drawn anything
    fromDisk(board?.snaps)
    // a site and the game made from it are two runs of one version: the rooms switch between them
    C.pair = board?.game?.run ? { site: run, game: board.game.run } : board?.kind === 'game' ? { site: null, game: run } : { site: run, game: null }
    // a game still being built opens on its build (art painting, code, play test), once per open:
    // going back up from there shows the project
    const building = board?.kind === 'game' ? board.work || board.busy : board?.game?.work
    if (building && C.pair.game && !P.toGame.has(run) && C.mode === 'project') { P.toGame.add(run); C.toGame(); return }
    P.toGame.add(run)
    // the project is the one this run belongs to; the one it was opened from only when the run is
    // too new to be listed (so a name never sits over another project's pages)
    P.proj = list?.projects.find(p => p.versions?.some(v => v.id === run) || p.parts?.[run]) || list?.projects.find(p => p.id === nav.view.project) || null
    // back from a site's game: the project shows the site's version, which holds the game
    const up = P.proj?.parts?.[run]
    if (up && up !== run) { nav.go({ type: 'open.version', version: up, project: P.proj.id }); return }
    P.uploads = P.pid && !hosted() ? (await api(`/api/projects/${encodeURIComponent(P.pid)}/files`).catch(() => ({ files: [] }))).files : []
    P.refs = P.pid && !hosted() ? (await api(`/api/projects/${encodeURIComponent(P.pid)}/refs`).catch(() => ({ refs: [] }))).refs : []
    render()
    clearTimeout(P.timer)
    P.timer = setTimeout(() => P.on && load(), board?.busy ? 2000 : board?.live ? 3000 : 15000)
  }

  // every file, grouped the way the panel and the stage show them
  function groups() {
    const b = P.board || {}
    const g = {}
    if (b.pages?.length) g.site = b.pages.flatMap(p => [{ key: `page:${p.id}`, kind: 'page', name: p.title?.split(/\s[—–|:-]\s/)[0] || p.id, full: p.title, page: p.id, src: P.thumbs.get(p.id) || p.cover, sharp: P.sharp.get(p.id), snap: P.thumbs.has(p.id), cover: p.cover, plan: p.plan }, ...draftsOf(p.id)])
    if (b.app) g.app = [{ key: 'app', kind: 'app', name: 'App' }]
    if (b.game) g.game = [{ key: 'game', kind: 'game', name: b.game.title, pitch: b.game.pitch || '', src: b.game.cover, run: b.game.run || null, work: b.game.work || null }]
    if (b.films?.length) g.film = b.films.map((f, i) => ({ key: `film:${i}`, kind: 'film', name: f.name, src: f.poster, video: f.src, seconds: f.seconds }))
    const arts = (b.art || []).map(a => ({ key: `art:${a.page}/${a.layer}/${a.gen}`, kind: 'art', name: a.name.replace(/^\w/, c => c.toUpperCase()), src: a.src, used: a.used?.split(/\s[—–|:-]\s/)[0], style: a.style, art: a }))
    // pictures still being made: a slot of their own (or over the old picture, when one is painted again)
    for (const w of b.painting || []) {
      const key = `art:${w.page}/${w.layer}/${w.gen}`
      const had = arts.find(x => x.key === key)
      if (had) had.pending = w
      else arts.push({ key, kind: 'art', name: w.name.replace(/^\w/, c => c.toUpperCase()), used: w.used?.split(/\s[—–|:-]\s/)[0], pending: w, art: { page: w.page, layer: w.layer, gen: w.gen, name: w.name } })
    }
    if (arts.length) g.art = arts
    const ups = [...P.uploads.map(u => ({ key: `up:${u.name}`, kind: 'upload', name: u.name, src: /^image\//.test(u.type) ? u.src : null, type: u.type, size: u.size })),
      ...[...P.sending.values()].map(s => ({ key: `up:${s.name}`, kind: 'upload', name: s.name, sending: s.pct, src: s.preview }))]
    if (ups.length) g.uploads = ups
    // the References store (spec 29): pictures, clips and links kept for what they show
    if (P.refs.length) g.refs = P.refs.map(r => ({ key: `rf:${r.id}`, kind: 'ref', name: r.name, src: r.kind === 'image' ? r.src : null, ref: r }))
    if (b.code) g.code = [{ key: 'code', kind: 'code', name: 'App code' }]
    if (P.q) for (const k of Object.keys(g)) { g[k] = g[k].filter(x => x.name.toLowerCase().includes(P.q.toLowerCase())); if (!g[k].length) delete g[k] }
    return g
  }
  const find = key => Object.values(groups()).flat().find(x => x.key === key)
  // a page's drafts (Scribble): beside it, each level with the section it redoes; one being written shows as pending
  function draftsOf(page) {
    const run = P.run
    const done = [...P.drafts.values()].filter(d => d.page === page && d.run === run)
      .map(d => ({ key: `dr:${d.id}`, kind: 'draft', name: `Draft · ${d.role || d.layer}`, page, src: d.image || null, draft: d }))
    const busy = [...P.drafting.values()].filter(d => d.page === page && d.run === run && !done.some(x => x.draft.layer === d.layer))
      .map(d => ({ key: `dr:~${d.page}/${d.layer}`, kind: 'draft', name: `Draft · ${d.role || d.layer}`, page, pending: true, draft: d }))
    return [...done, ...busy]
  }

  // ---------- render
  function render() {
    const name = P.proj?.title || P.board?.title?.split(/\s[—–|:-]\s/)[0] || 'New project'
    crumb.querySelector('.pj-name b').textContent = name
    document.body.classList.toggle('pj-live', !!P.board?.live)
    liveLine()
    renderList()
    renderStage()
    renderInsp()
    thumbs()
  }
  const thumbHtml = x => x.src ? `<span class="t" style="background-image:url('${esc(x.src.startsWith('data:') ? x.src : base() + x.src)}')"></span>`
    : x.kind === 'page' && P.board?.theme?.colors?.length ? `<span class="t tcs" style="--tc-bg:${esc(P.board.theme.colors[0])};--tc-pr:${esc(P.board.theme.colors[1] || P.board.theme.colors[0])}"></span>`
    : `<span class="t ic">${ic({ page: 'site', app: 'code', game: 'game', film: 'film', upload: /^audio\//.test(x.type || '') ? 'music' : 'file', code: 'code', art: 'image', draft: 'pencil', ref: x.ref?.kind === 'link' ? 'ext' : x.ref?.kind === 'audio' ? 'music' : 'file' }[x.kind] || 'file', 14)}</span>`
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
  // A page before its picture comes: a block per planned section, in the project's colours and in
  // the section's planned proportions (a page with no plan, from before plans were kept, gets a
  // usual one). Over a picture taken mid-build, the sections not built yet stay blocks, so each
  // block gives way to the real page as its section is built.
  const USUAL = [{ id: 'hero', role: 'hero', h: 720 }, { id: 'a', h: 520 }, { id: 'b', h: 520 }, { id: 'c', h: 300 }]
  const planOf = x => (x.plan?.length ? x.plan : USUAL)
  // never a thin strip: a page's tile is at least a little taller than wide
  const planRatio = x => Math.max(1.25, planOf(x).reduce((a, l) => a + l.h, 0) / 1280)
  function skeleton(x, over = false) {
    const plan = planOf(x), total = plan.reduce((a, l) => a + l.h, 0)
    const cs = P.board?.theme?.colors || []
    // where each section is on the page: the canvas's own layout once it has one, else the plan's
    const laid = over ? sw.layers?.list(x.page) || [] : []
    let top = 0
    const blocks = plan.map((l, i) => {
      const box = laid.find(y => y.key?.endsWith(`/${l.id}`))?.box
      const b = { l, i, top: box ? box.top : top / total, h: box ? box.height : l.h / total }
      top += l.h
      return b
    }).filter(b => !over || (!b.l.done && x.plan?.length))
    if (over && !blocks.length) return ''
    const vars = cs.length ? `--sk-bg:${esc(cs[0])};--sk-a:${esc(cs[1] || cs[0])};--sk-b:${esc(cs[2] || cs[1] || cs[0])};--sk-fg:${esc(cs[3] || cs.at(-1))}` : ''
    const hero = !over && x.cover ? ` style="background-image:url('${esc(base() + x.cover)}')"` : ''
    return `<div class="sk${over ? ' over' : ''}"${vars ? ` style="${vars}"` : ''}>${blocks.map(b => {
      const first = b.i === 0 || b.l.role === 'hero'
      return `<i class="${first ? 'hero' : b.i % 2 ? 'odd' : ''}${b.l.done ? ' done' : ''}" style="top:${(b.top * 100).toFixed(2)}%;height:${(b.h * 100).toFixed(2)}%"${first ? hero : ''}><b></b></i>`
    }).join('')}</div>`
  }
  // a piece still being made: a thin bar along its foot (it slides when the job cannot say how far)
  const WORK = { site: 'the site', app: 'the app', game: 'the game', film: 'the film' }
  function workBar(w) {
    const pct = w.pct == null ? null : Math.round(w.pct * 100)
    return `<span class="ab-work${pct == null ? ' ind' : ''}" role="progressbar" aria-label="Building ${WORK[w.what] || ''}"${pct == null ? '' : ` aria-valuenow="${pct}"`}><i${pct == null ? '' : ` style="width:${Math.max(4, pct)}%"`}></i></span>`
  }
  function board(x) {
    const sel = P.sel === x.key ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : ''
    const at = u => u ? (u.startsWith('data:') ? u : base() + u) : ''
    // a page shows its small picture first and its full one once the camera comes close (sizePics)
    const low = at(x.src), full = at(x.sharp) || low
    const img = x.kind === 'page' && !x.snap ? skeleton(x)
      : x.src ? `<img src="${esc(picNow(full, low))}" data-full="${esc(full)}"${low !== full ? ` data-low="${esc(low)}"` : ''} alt="" draggable="false" loading="lazy" decoding="async">${x.kind === 'page' ? skeleton(x, true) : ''}`
      : typeCover(x) || `<span class="blank">${ic({ page: 'site', app: 'code', game: 'game', film: 'film', upload: 'file', code: 'code', ref: x.ref?.kind === 'link' ? 'ext' : 'file' }[x.kind] || 'file', 26)}</span>${x.kind === 'ref' && !x.src ? `<span class="ab-cap">${esc(x.name)}</span>` : ''}`
    const extra = x.kind === 'film' ? `<span class="play"></span>${x.seconds ? `<span class="dur">${fmtTime(x.seconds)}</span>` : ''}`
      : x.kind === 'game' ? `${x.work ? workBar(x.work) : '<span class="play"></span>'}<span class="ab-cap">${esc(x.name)}</span>`
        : x.sending != null ? `<span class="upl"><i style="width:${Math.round(x.sending * 100)}%"></i></span>` : ''
    const tall = x.kind === 'page' && ((x.snap && P.aspect.get(x.page)) || (!x.snap && planRatio(x)))
    if (x.kind === 'draft') return draftBoard(x, sel, img)
    const rv = x.kind === 'page' ? reviewOf(x) : null
    const work = x.kind === 'art' && (x.pending || P.landed.has(x.key)) ? painting(x) : ''
    return `<div class="ab ${x.kind}${x.pending ? ` pt-${x.pending.state}` : ''}${rv ? ` rv-${rv.state}` : ''}" data-key="${esc(x.key)}" tabindex="-1"${tall ? ` style="height:${pageH(tall)}px"` : ''}>${x.pending && !x.src ? '' : img}${work}${extra}${x.kind === 'page' ? `<div class="lys">${outline(x)}</div>${rv ? reviewMarks(x, rv) : ''}<svg class="mk" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${markPaths(x.page)}</svg>` : ''}${sel}</div>`
  }
  // ---------- Scribble (spec 29): marks on a page's artboard, kept as fractions of the page
  // a page's artboard shows at most 9 widths of it: y on the artboard = y on the page × this
  const pageK = page => { const r = P.aspect.get(page); return r ? Math.max(1, (124 * r) / pageH(r)) : 1 }
  const ptsPath = (pts, k) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 1000).toFixed(1)} ${(y * k * 1000).toFixed(1)}`).join('')
  function markD(m) {
    const k = pageK(m.page)
    if (m.kind === 'box') { const b = m.box, x0 = b.x * 1000, y0 = b.y * k * 1000, x1 = (b.x + b.w) * 1000, y1 = (b.y + b.h) * k * 1000; return `M${x0} ${y0}H${x1}V${y1}H${x0}Z` }
    return ptsPath(m.pts, k)
  }
  function markPaths(page) {
    const mine = P.marks.filter(m => m.page === page && m.run === P.run)
    const sent = [...P.sent.values()].filter(m => m.page === page && m.run === P.run && m.status === 'open')
    return [...sent.map(m => [m, 'sent']), ...mine.map(m => [m, ''])].map(([m, cls]) => { const d = markD(m); return `<g data-mk="${esc(m.id)}" data-sent="${cls ? 1 : ''}" class="${cls}"><path class="hit" d="${d}"/><path class="halo" d="${d}"/><path class="ln" d="${d}"/></g>` }).join('')
  }
  function drawMarks() {
    for (const a of world.querySelectorAll('.ab.page')) { const x = find(a.dataset.key), svg = a.querySelector('.mk'); if (x && svg) svg.innerHTML = markPaths(x.page) }
    const n = P.marks.filter(m => m.run === P.run).length, chip = $('.pj-mkchip')
    chip.hidden = !n
    if (n) chip.querySelector('span').textContent = `${n} mark${n > 1 ? 's' : ''}`
  }
  function setTool(t) {
    P.tool = P.tool === t && t !== 'move' ? 'move' : t
    for (const b of root.querySelectorAll('.pj-dock [data-tool="move"], .pj-dock .pj-mk')) { const on = b.dataset.tool === P.tool; b.classList.toggle('on', on); if (b.classList.contains('pj-mk')) b.setAttribute('aria-pressed', String(on)) }
    root.classList.toggle('scribbling', P.tool === 'scribble')
    root.classList.toggle('erasing', P.tool === 'eraser')
  }
  // a draft beside its page, level with the section it redoes, drawn at the page's scale
  function draftBoard(x, sel, img) {
    const d = x.draft, r = P.aspect.get(x.page)
    const sec = sw.layers?.list(x.page).find(l => l.key === `${d.page}/${d.layer}` || l.id === d.layer)
    const top = sec?.box && r ? Math.min(pageH(r) - 40, sec.box.top * 124 * r) : 0
    const h = x.pending || !d.height ? Math.max(40, (sec?.box?.height || 0.1) * 124 * (r || 1.9)) : d.height / 1280 * 124
    if (!x.pending && !d.image && !P.rendering.has(d.id) && sw.marks) {
      P.rendering.add(d.id)
      sw.marks.render(d.page, d.html).then(out => { const now = P.drafts.get(d.id); if (now && out) { now.image = out.image; now.height = out.height; if (P.on) { renderStage(); renderList(); if (P.sel === x.key) renderInsp() } } }).finally(() => P.rendering.delete(d.id))
    }
    const inner = x.src ? img : `<span class="blank">${ic('pencil', 18)}</span>`
    return `<div class="ab draft${x.pending ? ' pending' : ''}" data-key="${esc(x.key)}" tabindex="-1" style="margin-top:${top.toFixed(1)}px;height:${h.toFixed(1)}px">${inner}${sel}</div>`
  }

  // ---------- pictures being made: a stand-in (a found picture, tinted toward the theme) or a drawn
  // sketch, the painter's name and "real picture coming", a slim bar; the real one fades in over it.
  // The stand-in is only ever shown here: it is never saved into the build, its cover, export or publish.
  const since = t => Math.max(0, (Date.now() - (t || Date.now())) / 1000)
  function painting(x) {
    const w = x.pending, landed = P.landed.get(x.key)
    const who = painterOf(x.key.slice(4))
    // painted again: the old picture stays under the shimmer; a new slot gets a stand-in or a sketch
    const over = !!x.src && !landed
    const sub = over ? '' : standinFor(x)
    const under = over ? '' : sub && sub !== 'wait' ? `${sketch(x)}<img class="sb" src="${esc(picNow(sub.url))}" data-full="${esc(sub.url)}" alt="" draggable="false" decoding="async" style="animation-delay:-${since(sub.at).toFixed(1)}s">` : sketch(x)
    if (landed) return `<div class="pt landing">${under}</div>`
    const ago = since(w.from || w.t)
    const pct = Math.min(92, Math.round(100 * (1 - Math.exp(-ago / 40))))
    const tag = w.state === 'failed'
      ? `<span class="pt-tag"><b>${esc(who)}</b>no picture</span><button class="pt-again" data-again="${esc(x.key)}">${ic('restore', 12)}Try again</button>`
      : `<span class="pt-tag"><b>${esc(who)}</b>${w.state === 'again' ? 'painting it again' : 'real picture coming'}</span><i class="pt-bar" role="progressbar" aria-label="Painting" aria-valuenow="${pct}"><i style="width:${pct}%"></i></i>`
    const th = P.board?.theme?.colors || []
    return `<div class="pt${over ? ' over' : ''}"${w.state === 'failed' ? '' : ' aria-busy="true"'} style=""--ago:-${ago.toFixed(1)}s${th[1] ? `;--pt-tint:${esc(th[1])}` : ''}">${under}${tag}</div>`
  }
  // a found stand-in for the slot, from the studio's picture service. The sketch shows at once; a new
  // subject can take the service 10-30 s (it searches and tags), so the call never blocks and the
  // stand-in fades in over the sketch when it comes. Kept by the picture's words, in memory only.
  const standinOf = gen => { const s = P.standin.get(gen); return s && s !== 'wait' ? s : null }
  function standinFor(x) {
    const q = x.art?.gen || x.name
    if (P.standin.has(q)) return P.standin.get(q)
    if (hosted()) { P.standin.set(q, null); return null }
    P.standin.set(q, 'wait')
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 60000)
    sw.api(`/api/standin?${new URLSearchParams({ q, w: '512', h: '512', run: P.run || '' })}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(j => {
        clearTimeout(t)
        const url = j?.url ? (/^https?:/.test(j.url) ? j.url : base() + j.url) : null
        P.standin.set(q, url ? { url, credit: j.credit || null, source: j.source || null, at: Date.now() } : null)
        if (url && P.on) renderStage()
      })
    return 'wait'
  }
  // the fallback: a loose drawing of what is coming, from the words that asked for it, drawing itself in
  function sketch(x) {
    const words = String(x.art?.gen || x.name || '').toLowerCase()
    let h = 7; for (const c of x.key) h = (h * 33 + c.charCodeAt(0)) >>> 0
    const r = n => { h = (h * 1103515245 + 12345) >>> 0; return (h % 1000) / 1000 * n }
    const has = re => re.test(words)
    const parts = []
    const horizon = 62 + r(10)
    if (has(/sea|ocean|water|lake|river|beach|wave|tide|harbo/)) {
      parts.push(`<path d="M0 ${horizon} H100"/>`)
      for (let i = 0; i < 3; i++) { const y = horizon + 8 + i * 9; parts.push(`<path d="M${4 + r(8)} ${y} q 8 -4 16 0 t 16 0 t 16 0 t 16 0 t 16 0"/>`) }
    } else if (has(/mountain|forest|landscape|valley|hill|sky|night|star|moon|sunset|sunrise/)) {
      parts.push(`<path d="M0 ${horizon + 6} L${20 + r(10)} ${30 + r(10)} L${45 + r(10)} ${horizon - 6} L${65 + r(10)} ${26 + r(12)} L100 ${horizon + 4}"/>`)
    } else if (has(/city|street|building|shop|store|market|room|interior|cafe|café|bar|restaurant|venue|stall|alley|house/)) {
      let xx = 6
      while (xx < 92) { const w = 10 + r(12), top = 28 + r(28); parts.push(`<path d="M${xx.toFixed(1)} 90 V${top.toFixed(1)} H${(xx + w).toFixed(1)} V90"/>`); xx += w + 3 }
    } else parts.push(`<path d="M0 ${horizon} H100"/>`)
    if (has(/person|people|portrait|chef|player|man|woman|girl|boy|crowd|host|friend|team|barista|face/)) {
      const cx = 40 + r(20)
      parts.push(`<circle cx="${cx.toFixed(1)}" cy="40" r="9"/><path d="M${(cx - 18).toFixed(1)} 86 q 18 -36 36 0"/>`)
    } else if (has(/food|dish|coffee|cup|plate|bowl|tea|wine|drink|cake|bread|noodle|ramen|meal/)) {
      parts.push(`<ellipse cx="50" cy="60" rx="26" ry="9"/><path d="M34 58 q 16 -18 32 0"/>`)
    } else if (has(/product|bottle|bag|box|jar|candle|device|phone|shoe|book/)) {
      parts.push(`<rect x="${(38 + r(6)).toFixed(1)}" y="34" width="22" height="40" rx="3"/>`)
    } else parts.push(`<circle cx="${(22 + r(56)).toFixed(1)}" cy="${(20 + r(14)).toFixed(1)}" r="${(6 + r(5)).toFixed(1)}"/>`)
    return `<svg class="sk" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${parts.join('')}</svg>`
  }

  // ---------- the review on the artboards: the page being checked has a scan line, pages waiting
  // their turn say so, each issue is a pin on its section, a checked page is ticked
  function reviewOf(x) {
    const rv = P.board?.review
    if (!rv) return null
    const p = rv.pages?.find(q => q.id === x.page)
    if (!p) return null
    const fresh = rv.active || Date.now() - (rv.last || 0) < 20000
    if (!fresh) return null
    return p
  }
  function reviewMarks(x, p) {
    const n = (P.board.review.pages.findIndex(q => q.id === x.page) || 0) + 1
    if (p.state === 'queued') return `<span class="rv-tag">Queued ${n}</span>`
    if (p.state === 'checking') return `<div class="rv-scan"><i style="animation-delay:-${((Date.now() % 4000) / 1000).toFixed(2)}s"></i></div><span class="rv-tag on">${esc(REVIEWER)} checking</span>${pins(x, p)}`
    return `<span class="rv-ok" role="img" aria-label="${p.issues.length ? `Reviewed, ${p.issues.length} to fix` : 'Reviewed, looks good'}">${ic('check', 12)}${p.issues.length ? `<b>${p.issues.length}</b>` : ''}</span>${pins(x, p)}`
  }
  function pins(x, p) {
    const ratio = P.aspect.get(x.page)
    if (!p.issues.length || !ratio || !x.snap || !sw.layers) return ''
    const h = pageH(ratio), list = sw.layers.list(x.page)
    return [...new Set(p.issues.map(i => i.layer))].map((layer, i) => {
      const l = list.find(y => y.id === layer || y.key === `${x.page}/${layer}`)
      if (!l?.box) return ''
      return `<span class="rv-pin" style="top:${Math.min(h - 8, l.box.top * 124 * ratio + 4).toFixed(1)}px" aria-label="To fix: ${esc(l.role || layer)}">${i + 1}</span>`
    }).join('')
  }

  // a page is 124 px wide on the stage; its snapshot sets how long it is (a very long page is cut off)
  const pageH = ratio => Math.round(Math.min(124 * ratio, 124 * 9))
  function outline(x) {
    if (!P.layer || P.sel !== x.key || !sw.layers) return ''
    const l = sw.layers.list(x.page).find(y => y.key === P.layer)
    const ratio = P.aspect.get(x.page)
    if (!l?.box || !ratio || !x.snap) return ''
    const h = 124 * ratio
    return `<div class="lsel" draggable="true" data-layer="${esc(l.key)}" data-name="${esc(l.role)}" style="top:${(l.box.top * h).toFixed(1)}px;height:${Math.max(4, l.box.height * h).toFixed(1)}px"></div>`
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
    if (P.boardOf !== P.run || (!P.board && !P.uploads.length && !P.refs.length)) { world.innerHTML = P.boardOf !== P.run ? `<div class="col"><section class="pj-sec site"><span class="al">Site</span><div class="abs">${[0, 1, 2].map(() => `<div class="ab page wait-in" aria-busy="true">${skeleton({})}</div>`).join('')}</div></section></div>` : ''; return }
    const sec = (k, label) => g[k] ? `<section class="pj-sec ${k}"><span class="al">${label}</span><div class="abs">${g[k].map(board).join('')}</div></section>` : ''
    world.innerHTML = `<div class="col">${sec('site', 'Site')}${sec('art', 'Art')}${sec('uploads', 'Uploads')}${sec('refs', 'References')}</div><div class="col">${sec('game', 'Game')}${sec('app', 'App')}${sec('film', 'Film')}${sec('code', 'Code')}</div>`
    applyCam()
    measurePages()
    if (!P.framed && world.offsetWidth) { P.framed = true; frameAll(false) }
    crewAtWork()
    drawMarks()
  }
  function renderInsp() {
    const x = P.sel && find(P.sel)
    insp.hidden = !x
    root.classList.toggle('insp-on', !!x)
    if (!x) return
    // never redraw under someone typing in it
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) return
    if (x.kind === 'page' && P.layer && P.el && sw.layers?.get(P.layer)?.done && !hosted()) { const r = renderElement(x); if (r !== false) return r }
    if (x.kind === 'page' && P.layer && sw.layers?.get(P.layer)) return renderLayer(x)
    P.layer = null
    if (dims.has(x.key)) x.dims = dims.get(x.key)
    const kv = [
      x.dims && ['Size', x.dims],
      x.style && ['Style', x.style],
      x.used && ['Used on', x.used],
      x.kind === 'film' && x.seconds && ['Length', fmtTime(x.seconds)],
      x.kind === 'upload' && x.size && ['File', `${(x.size / 1024 / 1024).toFixed(x.size > 1048576 ? 1 : 2)} MB`],
      x.kind === 'draft' && ['Section', x.draft.role || x.draft.layer],
      x.kind === 'draft' && x.draft.marks?.length && ['Marks', x.draft.marks.join(', ')],
      ...(x.kind === 'draft' ? (x.draft.marks || []).map(id => P.reads.get(id)).filter(Boolean).map(r => [r.mark, r.read]) : []),
      x.kind === 'ref' && ['From', REF_FROM[x.ref.source] || x.ref.source],
      x.kind === 'ref' && x.ref.use && ['Use', x.ref.use],
      x.kind === 'ref' && x.ref.kind === 'link' && ['Link', x.ref.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)]
    ].filter(Boolean)
    const pv = x.kind === 'film' && x.video ? `<video src="${esc(base() + x.video)}" poster="${x.src ? esc(base() + x.src) : ''}" controls preload="none"></video>`
      : x.src ? `<img src="${esc(x.src.startsWith('data:') ? x.src : base() + x.src)}" alt="">` : typeCover(x) ? `<div class="pv-tc">${typeCover(x)}</div>` : `<span class="blank">${ic('file', 28)}</span>`
    const btns = [
      ['page', 'game', 'app', 'code', 'film', 'art'].includes(x.kind) && `<button class="btn ghost" data-act="open">${ic('ext', 15)}Open</button>`,
      (x.kind === 'art' || (x.kind === 'upload' && x.sending == null) || x.kind === 'film') && `<button class="btn ghost" data-act="export">${ic('download', 15)}Export</button>`,
      x.kind === 'page' && `<button class="btn ghost" data-act="zip">${ic('download', 15)}Export</button>`,
      (x.kind === 'art' || (x.kind === 'upload' && x.sending == null)) && !hosted() && `<button class="btn ghost" data-act="replace">${ic('upload', 15)}Replace</button>`,
      x.kind === 'draft' && !x.pending && `<button class="btn" data-act="draft-accept">${ic('check', 15)}Accept</button>`,
      x.kind === 'draft' && !x.pending && `<button class="btn ghost" data-act="draft-dismiss">${ic('x', 15)}Dismiss</button>`,
      x.kind === 'ref' && `<button class="btn ghost" data-act="open">${ic('ext', 15)}Open</button>`,
      x.kind === 'ref' && !hosted() && `<button class="btn ghost" data-act="ref-remove">${ic('trash', 15)}Remove</button>`
    ].filter(Boolean).join('')
    // Use for…: the crew get the reference and the part it is for, like a comment on that section
    const useFor = x.kind === 'ref' && !hosted() && P.board ? `<form class="pj-use" autocomplete="off"><input name="u" placeholder="Use for…" aria-label="Use for" maxlength="80" value="${esc(x.ref.use || '')}"><button class="btn" type="submit">Send</button></form>` : ''
    const secs = x.kind === 'page' && sw.layers ? sw.layers.list(x.page) : []
    const secHtml = secs.length ? `<div class="pj-secs" role="list" aria-label="Sections">${secs.map(l => `<button class="pj-ly" role="listitem" data-layer="${esc(l.key)}" draggable="true">${ic(l.shared ? 'layers' : 'frame', 14)}<span>${esc(l.role)}</span></button>`).join('')}</div>` : ''
    insp.innerHTML = `<h3><span>${esc(x.name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3><div class="pv">${pv}</div>${x.pitch ? `<p class="pj-pitch">${esc(x.pitch)}</p>` : ''}
      ${kv.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}${secHtml}${useFor}<div class="btns">${btns}</div>`
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
      ${edit && l.gens.length ? g('Pictures', l.gens.map((p, i) => `<div class="pj-pic" data-pic="${i}">${p.src ? `<img src="${esc(p.src.startsWith('data:') ? p.src : base() + p.src)}" alt="">` : standinOf(p.gen) ? `<img class="sb" src="${esc(standinOf(p.gen).url)}" alt="">` : `<span class="blank">${ic('image', 20)}</span>`}<textarea rows="2" aria-label="What the picture shows">${esc(p.gen)}</textarea>${!p.src && standinOf(p.gen) ? `<small class="pj-credit">Stand-in · ${esc(standinOf(p.gen).credit || 'from an earlier build')}</small>` : ''}<button class="btn ghost" data-paint="${i}"${p.busy ? ' disabled' : ''}>${ic('image', 15)}${p.busy ? 'Painting' : 'Paint'}</button></div>`).join('')) : ''}
      ${edit ? g('Parts', partsList(l.html)) : ''}
      <div class="btns">${edit ? `<button class="btn ghost" data-act="code">${ic('code', 15)}Code</button>` : ''}<button class="btn ghost" data-act="open">${ic('ext', 15)}Open</button></div>
      ${edit ? `<form class="pj-ask pj-lask" autocomplete="off"><input name="q" placeholder="Tell the crew…" aria-label="Tell the crew about ${esc(l.role)}" maxlength="4000"><button type="submit" class="pj-send" aria-label="Send">${ic('up', 16)}</button></form>` : ''}`
  }
  // ---------- one part of a section, changed by hand (spec 29, "Manual edit"; web/edit/patches.js). Each
  // change is a section version (undo, redo, Versions), and the crew is told to keep it on a rework.
  const PART_IC = { image: 'image', link: 'link', container: 'frame', graphic: 'image', text: 'type' }
  const STYLE_F = { fontSize: ['Size', '18px'], fontWeight: ['Weight', '600'], lineHeight: ['Line', '1.4'], letterSpacing: ['Letters', '0.02em'], color: ['Colour', '#1c1917'], textAlign: ['Align', 'center'], width: ['Width', '100%'], height: ['Height', 'auto'], padding: ['Padding', '12px 20px'], margin: ['Margin', '0 auto'], backgroundColor: ['Fill', '#ffffff'], borderRadius: ['Corners', '8px'], opacity: ['Opacity', '0.9'] }
  function partsList(html) {
    const rows = swEdit.tree(html, 60)
    return rows.length ? `<div class="pj-parts" role="list" aria-label="Parts">${rows.map(r => `<button class="pj-part" role="listitem" data-el="${esc(r.id)}" style="--d:${Math.min(r.depth, 5)}">${ic(PART_IC[r.kind] || 'type', 13)}<span>${esc(r.label)}</span></button>`).join('')}</div>` : ''
  }
  function renderElement(x) {
    const l = sw.layers.get(P.layer), e = swEdit.read(l.html, P.el)
    if (!e) { P.el = null; return false }
    const field = (k, label, v, long) => long ? `<label class="pj-f"><span>${label}</span><textarea rows="${Math.min(5, Math.ceil(v.length / 34) || 2)}" data-ef="${k}">${esc(v)}</textarea></label>` : `<label class="pj-f"><span>${label}</span><input data-ef="${k}" value="${esc(v)}"></label>`
    const g = (title, body) => body ? `<div class="pj-g"><h4>${title}</h4>${body}</div>` : ''
    const F = e.fields
    const pic = e.kind === 'image' && F.src ? `<div class="pj-epic"><img src="${esc(/^(https?:|data:)/.test(F.src) ? F.src : base() + F.src)}" alt=""></div>` : ''
    const content = [
      e.wordsEditable ? field('text', 'Words', F.text, F.text.length > 40) : '',
      e.kind === 'link' ? field('href', 'Link', F.href) : '',
      e.kind === 'image' ? `${pic}${field('src', 'Address', F.src)}${field('alt', 'Alt text', F.alt)}<button class="btn ghost" data-eact="replace">${ic('upload', 15)}Replace</button>` : ''
    ].join('')
    const styles = `<div class="pj-estyle">${Object.entries(STYLE_F).map(([k, [label, ph]]) => `<label class="pj-f"><span>${label}</span><input data-es="${k}" value="${esc(e.styles[k] || '')}" placeholder="${esc(ph)}" spellcheck="false"></label>`).join('')}</div>`
    const attrs = `${Object.entries(e.attributes).map(([k, v]) => `<label class="pj-f"><span>${esc(k)}</span><input data-ea="${esc(k)}" value="${esc(v)}" spellcheck="false"></label>`).join('')}<div class="pj-eattr"><input name="an" placeholder="name" aria-label="New attribute name" spellcheck="false"><input name="av" placeholder="value" aria-label="New attribute value" spellcheck="false"><button class="btn ghost" data-eact="attr">Add</button></div>`
    insp.innerHTML = `<h3><button class="ib sm pj-eback" aria-label="Back to ${esc(l.role)}">${ic('chl', 16)}</button><span>${esc(e.label)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>
      <div class="kv"><span>${esc(e.tag)}</span><b>${esc(l.role)}</b></div>
      ${g('Content', content)}${g('Style', styles)}${g('Attributes', attrs)}
      <div class="btns"><button class="btn ghost" data-eact="up"${e.canUp ? '' : ' disabled'}>Up</button><button class="btn ghost" data-eact="down"${e.canDown ? '' : ' disabled'}>Down</button><button class="btn ghost" data-eact="remove"${e.canRemove ? '' : ' disabled'}>${ic('trash', 15)}Remove</button><button class="btn ghost" data-act="code">${ic('code', 15)}Code</button></div>`
  }
  // a hand change to the picked part: patched, saved as a section version, the panel follows the part
  async function handEdit(x, patch, why) {
    const key = P.layer, l = key && sw.layers.get(key)
    if (!l?.done) return
    const r = swEdit.apply(l.html, { id: P.el, ...patch })
    if (!r.ok) { toast(`<span>${esc(r.error)}</span>`); renderInsp(); return }
    if (r.html === l.html) return
    P.el = r.id
    if (await sw.layers.save(key, r.html, `hand: ${why}`)) edited(x.page)
    else renderInsp()
  }
  function handChange(x, t) {
    const v = n => insp.querySelector(`[data-ef="${n}"]`)?.value
    if (t.dataset.es) return handEdit(x, { kind: 'set-style', styles: { [t.dataset.es]: t.value } }, 'style')
    if (t.dataset.ea) return handEdit(x, { kind: 'set-attributes', attributes: { [t.dataset.ea]: t.value } }, 'attribute')
    const kind = swEdit.read(sw.layers.get(P.layer).html, P.el)?.kind
    if (kind === 'link') return handEdit(x, { kind: 'set-link', text: v('text'), href: v('href') }, 'link')
    if (kind === 'image') return handEdit(x, { kind: 'set-image', src: v('src'), alt: v('alt') }, 'picture')
    return handEdit(x, { kind: 'set-text', value: t.value }, 'words')
  }
  function partClick(e, x) {
    const pt = e.target.closest('[data-el]')
    if (pt) { P.el = pt.dataset.el; renderInsp(); return true }
    if (e.target.closest('.pj-eback')) { P.el = null; renderInsp(); return true }
    const b = e.target.closest('[data-eact]')
    if (!b || !P.el) return false
    const a = b.dataset.eact
    if (a === 'up' || a === 'down') handEdit(x, { kind: 'move-element', dir: a === 'up' ? -1 : 1 }, 'move')
    if (a === 'remove') handEdit(x, { kind: 'remove-element' }, 'remove')
    if (a === 'attr') {
      const n = insp.querySelector('[name="an"]').value.trim(), val = insp.querySelector('[name="av"]').value
      if (n) handEdit(x, { kind: 'set-attributes', attributes: { [n]: val } }, 'attribute')
    }
    if (a === 'replace') {
      // the new picture joins the project's References, and the part points at it
      const fi = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' })
      fi.onchange = async () => { const f = fi.files[0]; const out = f && await refPost('', null, f); if (out?.ref?.src) handEdit(x, { kind: 'set-image', src: out.ref.src }, 'picture') }
      fi.click()
    }
    return true
  }
  // a click inside the picked section on the page picks the part under it (the canvas reads the page)
  function pointPick(a, e) {
    const x = find(a.dataset.key), l = sw.layers.get(P.layer)
    if (!x || !l?.done || hosted() || !sw.marks?.anchor) return false
    const r = a.getBoundingClientRect(), ratio = P.aspect.get(x.page)
    const fx = (e.clientX - r.left) / (r.width || 1), fy = (e.clientY - r.top) / (r.height || 1) * a.offsetHeight / (124 * ratio)
    const key = P.layer
    Promise.resolve(sw.marks.anchor(x.page, { x: Math.max(0, fx - 0.002), y: Math.max(0, fy - 0.0005), w: 0.004, h: 0.001 })).then(t => {
      if (P.layer !== key || t?.section !== key) return
      const id = swEdit.pathId(t.path), el = id && swEdit.read(sw.layers.get(key).html, id)
      if (el && (!t.tag || el.tag === t.tag)) { P.el = id; renderInsp() }
    }).catch(() => {})
    return true
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
    P.el = null
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
    if (P.el && (t.dataset.ef || t.dataset.es || t.dataset.ea)) { handChange(x, t); return }
    if (t.dataset.text != null) L.setText(P.layer, Number(t.dataset.text), t.value).then(ok => ok && edited(x.page))
    if (t.dataset.font) { L.token('font', t.dataset.font, t.value); edited(x.page) }
    if (t.hasAttribute('data-radius')) { L.edit(P.layer, 'radius', t.value); edited(x.page) }
  })
  insp.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return
    if (e.target.matches('.pj-eattr input')) { e.preventDefault(); insp.querySelector('[data-eact="attr"]')?.click(); return }
    if (e.target.matches('[data-text], [data-ef], [data-es], [data-ea]')) { e.preventDefault(); e.target.blur() }
  })
  function layerClick(e) {
    const x = find(P.sel), L = sw.layers
    if (!x || !L) return false
    const ly = e.target.closest('[data-layer]')
    if (ly) { pickLayer(ly.dataset.layer); return true }
    if (e.target.closest('.pj-back')) { pickLayer(null); return true }
    if (!P.layer) return false
    if (partClick(e, x)) return true
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

  // ---------- page snapshots (spec 36): saved to the run's folder per page and content version, in
  // a small size (the Overview at rest) and a full one (zoomed in, and the build's cover). Opening a
  // project paints them from disk; only a page whose content changed is photographed again, by the
  // canvas behind, and its pictures are sent back to be kept.
  // what the server says is saved: { first, pages: { [page]: { v, s?, f? } } }
  const fromDisk = disk => {
    let changed = false
    for (const p of P.board?.pages || []) {
      const d = disk?.pages?.[p.id]
      if (!d?.s) continue
      if (P.thumbs.get(p.id) !== d.s) { P.thumbs.set(p.id, d.s); changed = true }
      if (d.f && P.sharp.get(p.id) !== d.f) { P.sharp.set(p.id, d.f); changed = true } else if (!d.f) P.sharp.delete(p.id)
      P.stale.delete(p.id)
    }
    return changed
  }
  // a JPEG of a picture (the canvas's frozen frames can be PNG)
  async function jpeg(src, q = 0.82) {
    if (/^data:image\/jpeg/.test(src)) return src
    const im = new Image()
    await new Promise(r => { im.onload = r; im.onerror = r; im.src = src })
    if (!im.naturalWidth) return null
    const c = document.createElement('canvas')
    c.width = im.naturalWidth; c.height = im.naturalHeight
    c.getContext('2d').drawImage(im, 0, 0)
    return c.toDataURL('image/jpeg', q)
  }
  const keep = (run, page, v, size, src) => jpeg(src).then(image => image && sw.api(`/api/runs/${encodeURIComponent(run)}/snaps`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page, v, size, image }) })).catch(() => null)
  // Which pages need a picture: the saved ones paint at once; a page with none of its current version
  // waits in P.want for its small picture, then its full one (spec 36, PR 3)
  async function thumbs() {
    if (P.thumbBusy || !P.board?.pages?.length) return
    P.thumbBusy = true
    const run = P.run
    try {
      const disk = await sw.api(`/api/runs/${encodeURIComponent(run)}/snaps`).then(r => (r.ok ? r.json() : null)).catch(() => null)
      if (run !== P.run || !P.on) return
      if (fromDisk(disk)) { renderList(); renderStage() }
      for (const p of P.board.pages) {
        const d = disk?.pages?.[p.id]
        if (d?.s) { P.want.s.delete(p.id); if (d.f) P.want.f.delete(p.id); else P.want.f.set(p.id, d.v); continue }
        // photographed for this version already (its picture was not kept: the page moved on meanwhile)
        if (P.thumbs.has(p.id) && !P.stale.has(p.id) && P.shot.get(p.id) === d?.v) continue
        P.want.s.set(p.id, d?.v || '')
      }
    } finally { P.thumbBusy = false }
    pump()
  }
  // One page at a time: every small picture in view first, then the full ones. Nothing
  // while the camera moves (it picks up when it rests), for a tile out of view, or in a hidden tab.
  // pumping: the view a picture is being taken for (one left over from an earlier view does not hold this one up)
  let pumpT = 0, pumping = -1
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 50))
  // a page with no picture at all is taken straight away; a page that changed, and the full pictures, wait for idle time
  function pump(wait = 0) {
    clearTimeout(pumpT)
    pumpT = setTimeout(() => ([...P.want.s.keys()].some(id => !P.thumbs.has(id)) ? shootNext() : idle(shootNext)), wait)
  }
  const inView = id => {
    const el = world.querySelector(`.ab[data-key="${CSS.escape(`page:${id}`)}"]`)
    if (!el) return false
    const r = el.getBoundingClientRect(), v = stage.getBoundingClientRect()
    return r.width > 0 && r.right > v.left && r.left < v.right && r.bottom > v.top && r.top < v.bottom
  }
  async function shootNext() {
    if (pumping === P.visit || !P.on || !P.board || document.hidden) return
    const rest = performance.now() - P.camAt
    if (rest < 400) return pump(400 - rest)
    const pick = size => [...P.want[size]].find(([id]) => inView(id))
    const size = pick('s') ? 's' : 'f', job = pick(size)
    if (!job) return retry()
    const [id, v] = job, run = P.run, visit = P.visit
    P.want[size].delete(id)
    pumping = visit
    try { await (size === 's' ? shootSmall(run, id, v, visit) : shootFull(run, id, v, visit)) } finally { if (pumping === visit) pumping = -1 }
    if (visit === P.visit && P.on) pump()
  }
  // A picture can take seconds (the frame fetches its fonts first): one asked for before the person went
  // elsewhere and came back to this build is not drawn over, or kept instead of, what this view painted
  const current = (run, visit) => run === P.run && visit === P.visit && P.on
  async function shootSmall(run, id, v, visit) {
    P.stale.delete(id)
    const src = await sw.thumb(id).catch(() => null)
    // a snapshot of a frame still being laid out is a thin strip: wait for a page-shaped one
    const ok = src && await new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalHeight > im.naturalWidth * 0.6); im.onerror = () => r(false); im.src = src })
    if (!current(run, visit)) return
    // a page that changed keeps its last picture until a new one comes (no blank artboard meanwhile)
    if (!ok) { if (P.thumbs.has(id)) P.stale.add(id); P.failed.add(id); return }
    const had = P.thumbs.has(id)
    P.thumbs.set(id, src); P.sharp.delete(id)
    const im = had && world.querySelector(`.ab[data-key="${CSS.escape(`page:${id}`)}"] img[data-full]`)
    if (im) { im.removeAttribute('data-low'); im.dataset.full = src; im.src = src } else { renderList(); renderStage() }
    if (!v) return
    P.shot.set(id, v)
    keep(run, id, v, 's', src)
    P.want.f.set(id, v)
  }
  async function shootFull(run, id, v, visit) {
    const full = await sw.thumb(id, 0.6).catch(() => null)
    if (!full || !current(run, visit)) return
    await keep(run, id, v, 'f', full)
    // the page changed again meanwhile: its new small picture comes first
    const low = P.thumbs.get(id)
    if (!current(run, visit) || !low || P.want.s.has(id) || P.stale.has(id)) return
    P.sharp.set(id, full)
    const im = world.querySelector(`.ab[data-key="${CSS.escape(`page:${id}`)}"] img[data-full]`)
    if (im) { im.dataset.low = low.startsWith('data:') ? low : base() + low; im.dataset.full = full; sizePics() }
  }
  // a page without a picture yet (its frame was still laying out) is tried again a few times;
  // the count starts over whenever the crew finishes a section (layer:done) or the build reloads
  function retry() {
    if (!P.failed.size || (P.thumbTries = (P.thumbTries || 0) + 1) >= 8) return
    P.failed.clear()
    clearTimeout(P.retryT); P.retryT = setTimeout(thumbs, 2500)
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P.on) pump() })

  // ---------- the stage: pan (drag empty space, wheel), zoom (pinch, ⌘ wheel), Frame fits all
  // narrow panes (a phone, Hermes Desktop's side pane): the canvas stays; Files and Layers are a sheet
  const filesSheet = layerSheet(root, $('.pj-side'), $('.pj-files-btn'))
  const narrow = filesSheet.narrow
  const sheet = on => filesSheet.set(on)
  // While the camera moves the world keeps the pixels it has (will-change holds the raster scale) and
  // the pictures keep the copies they show; both are put right once it rests, in one go. The canvas
  // behind is told too, so it does not swap a page or take a screenshot in the middle of a gesture.
  let restT = 0
  // moving: a pan, pinch, wheel or glide (the camera's own framing jumps, and does not hold the pictures back)
  function applyCam(moving = false) {
    const t = `translate(${P.cam.x}px, ${P.cam.y}px) scale(${P.cam.k})`
    if (moving) P.camAt = performance.now()
    world.style.transform = t
    world.classList.add('moving')
    sw.moved?.()
    trackCrew()
    clearTimeout(restT)
    restT = setTimeout(() => { world.classList.remove('moving'); sizePics(); pump() }, 280)
  }
  // Pictures at the size they are drawn: zoomed out, an artboard shows a 256 or 512 px wide copy
  // (web/ui.js small) instead of its full picture, so a whole project on screen holds a few MB of
  // pictures, not every page's full-length snapshot. Zoomed in past that, the full picture comes back.
  const TIERS = [256, 512]
  const picTier = new Map() // full src -> the tier last shown
  const tierFor = im => TIERS.find(t => im.offsetWidth * P.cam.k * (devicePixelRatio || 1) <= t * 0.9) || 0
  // the small saved picture (320 px wide) stands for the 256 tier, and is shown until a sharper copy is ready
  const picNow = (full, low) => { const t = picTier.get(full); return (t === 256 && low) || (t && window.SwarmUI?.small?.(full, t, { by: 'width' })) || low || full }
  function sizePics() {
    const small = window.SwarmUI?.small
    if (!small) return
    for (const im of world.querySelectorAll('img[data-full]')) {
      const full = im.dataset.full, t = tierFor(im)
      if (!im.offsetWidth) continue
      picTier.set(full, t)
      if (t === 256 && im.dataset.low) { if (im.getAttribute('src') !== im.dataset.low) im.src = im.dataset.low; continue }
      if (!t) { if (im.getAttribute('src') !== full) im.src = full; continue }
      const url = small(full, t, { by: 'width', ready: u => { if (im.isConnected && picTier.get(full) === t && im.getAttribute('src') !== u) im.src = u } })
      if (url && im.getAttribute('src') !== url) im.src = url
    }
  }
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
      applyCam(true)
      setFollow(false)
      return
    }
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    if (drag.moved) { P.cam.x = drag.cx + dx; P.cam.y = drag.cy + dy; applyCam(true); stage.classList.add('panning'); setFollow(false) }
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
    applyCam(true)
    setFollow(false)
  }, { passive: false })

  // ---------- selecting and opening
  function select(key, { pan = false } = {}) {
    if (key !== P.sel && P.layer) { P.layer = null; P.el = null; sw.layers?.select(null); scope() }
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
          world.classList.add('ease'); applyCam(true); setTimeout(() => world.classList.remove('ease'), 300)
        }
      }
    }
  }
  function openItem(x) {
    if (!x) return
    if (x.kind === 'page' || x.kind === 'art') { C.go('station', 'canvas'); setTimeout(() => sw.focusPage(x.page || x.art?.page), 60); return }
    if (x.kind === 'film') return C.go('station', 'video')
    // a game made from this site lives in its own run: open that one's App room
    if (x.kind === 'game' && x.run && x.run !== P.run) return C.toGame(x.run)
    if (x.kind === 'game' || x.kind === 'app' || x.kind === 'code') return C.go('station', 'app')
    if (x.kind === 'upload' && x.src) window.open(base() + x.src, '_blank', 'noopener')
    if (x.kind === 'ref') window.open(x.ref.kind === 'link' ? x.ref.url : base() + x.ref.src, '_blank', 'noopener')
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
    if (P.tool !== 'move' && a.classList.contains('page')) return
    clearTimeout(clickT)
    // (not the second click of a double-click, which opens the page's room)
    if (a.classList.contains('page') && e.detail < 2 && (a.dataset.key === P.sel || e.metaKey || e.ctrlKey)) {
      const l = sectionAt(a, e)
      if (l) { if (a.dataset.key !== P.sel) select(a.dataset.key); if (l.key === P.layer && pointPick(a, e)) return; return pickLayer(l.key) }
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
    if (act === 'ref-remove') removeRef(x)
    if (act === 'draft-accept' || act === 'draft-dismiss') {
      e.target.closest('button').disabled = true
      sw.marks.close(x.draft.id, act === 'draft-accept').then(ok => toast(ok ? `${ic('check', 15)}<span>${act === 'draft-accept' ? 'Accepted' : 'Dismissed'}</span>` : '<span>That draft could not close</span>'))
    }
  })
  insp.addEventListener('submit', e => {
    const f = e.target.closest('.pj-use'), x = find(P.sel)
    if (!f || x?.kind !== 'ref') return
    e.preventDefault()
    const use = f.u.value.trim()
    if (!use) return f.u.focus()
    f.querySelector('button').disabled = true
    refPost(`${x.ref.id}/use`, { use, send: true }).then(out => { if (out) toast(`${ic('check', 15)}<span>Sent to the crew</span>`) }).finally(() => { const b = f.querySelector('button'); if (b) b.disabled = false })
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
      ...(p?.versions?.length > 1 ? ['-', ...p.versions.map((v, i) => ({ k: `v:${v.id}`, icon: 'clock', label: `Version ${p.versions.length - i}`, on: v.id === P.run, run: () => nav.go({ type: 'open.version', version: v.id }) }))] : [])
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
  // the tree's keys (web/layers.js) pick here too: Enter, or ↑ ↓ to the next section, goes the same way as a click
  layersEl.addEventListener('keydown', e => {
    const at = e.target.closest('.ly[data-key], .pg-title[data-page]')
    if (!at || e.target.closest('input') || !['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault(); e.stopPropagation()
    const rows = [...layersEl.querySelectorAll('.pg.open .ly[data-key]')], i = rows.indexOf(at)
    const to = e.key === 'Enter' ? at : at.matches('.ly') ? rows[i + (e.key === 'ArrowDown' ? 1 : -1)] : null
    if (!to) return
    const key = to.dataset.key, page = to.dataset.page
    to.click()
    layersEl.querySelector(key ? `.ly[data-key="${CSS.escape(key)}"]` : `.pg-title[data-page="${CSS.escape(page)}"]`)?.focus({ preventScroll: true })
  }, true)
  const search = $('.pj-search'), sInput = search.querySelector('input')
  $('.pj-find').onclick = () => { search.hidden = !search.hidden; if (!search.hidden) sInput.focus(); else { P.q = ''; sInput.value = ''; render() } }
  sInput.oninput = () => { P.q = sInput.value.trim(); renderList(); renderStage() }
  sInput.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); search.hidden = true; P.q = ''; sInput.value = ''; render() } }
  $('.pj-add').onclick = e => showMenu([
    { k: 'page', icon: 'file', label: 'New page', run: newPage },
    ...(hosted() ? [] : [{ k: 'up', icon: 'upload', label: 'Upload files', run: () => fileIn.click() },
      { k: 'ref', icon: 'image', label: 'Reference', run: () => refIn.click() },
      { k: 'link', icon: 'ext', label: 'Link', run: () => { linkEl.hidden = false; linkEl.u.focus() } }])
  ], e.currentTarget)
  function newPage() { select(null); input.value = 'Add a page: '; input.focus() }

  // ---------- References (spec 29): + → Reference or Link; Remove, and Undo in its toast
  const refIn = $('.pj-reffile'), linkEl = $('.pj-link')
  async function refPost(path, body, raw = null) {
    if (!P.pid || hosted()) { toast(`<span>References need a saved project</span>`); return null }
    try {
      const out = raw ? await api(`/api/projects/${encodeURIComponent(P.pid)}/refs?name=${encodeURIComponent(raw.name)}`, { method: 'POST', body: raw })
        : await post(`/api/projects/${encodeURIComponent(P.pid)}/refs${path ? `/${path}` : ''}`, body)
      P.refs = out.refs || P.refs
      P.open.refs = true
      render()
      return out
    } catch (err) { toast(`<span>${esc(err.body?.error || err.message)}</span>`); return null }
  }
  refIn.onchange = async () => {
    const fs = [...refIn.files]
    refIn.value = ''
    let last = null
    for (const f of fs) last = (await refPost('', null, f))?.ref || last
    if (last) select(`rf:${last.id}`)
  }
  linkEl.onsubmit = async e => {
    e.preventDefault()
    const u = linkEl.u.value.trim()
    if (!u) return
    const out = await refPost('link', { url: /^https?:\/\//i.test(u) ? u : `https://${u}` })
    if (out) { linkEl.u.value = ''; linkEl.hidden = true; select(`rf:${out.ref.id}`) }
  }
  linkEl.u.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); linkEl.hidden = true } }
  function removeRef(x) {
    refPost(`${x.ref.id}/remove`).then(out => {
      if (!out) return
      if (P.sel === x.key) select(null)
      toast(`${ic('trash', 15)}<span>Removed</span><button class="btn sm ghost pj-undo">Undo</button>`)
      toastEl?.querySelector('.pj-undo')?.addEventListener('click', () => { toastEl?.remove(); refPost(`${x.ref.id}/restore`).then(o => o && select(x.key)) })
    })
  }

  // ---------- the dock
  $('.pj-dock').addEventListener('click', e => {
    const b = e.target.closest('[data-tool]')
    if (!b) return
    const t = b.dataset.tool
    if (t === 'files') return sheet(!root.classList.contains('files-on'))
    if (t === 'move' || t === 'scribble' || t === 'eraser') return setTool(t)
    if (t === 'frame') { setFollow(false); return frameAll() }
    if (t === 'follow') return setFollow(!P.follow)
    if (t === 'text') return newPage()
    if (t === 'image') return hosted() ? null : fileIn.click()
    if (t === 'comment') return C.chat(!document.body.classList.contains('cosmos-chat'))
  })
  // "Tell the crew…": an edit of the selected page rewrites its section (/fix); about a picture, it is
  // painted again with those words; otherwise the project's next version keeps every page and adds
  // what was asked (web/route.js).
  ask.onsubmit = async e => {
    e.preventDefault()
    const text = input.value.trim()
    const marked = P.marks.filter(m => m.run === P.run)
    if (marked.length) return sendMarks(text, marked)
    if (!text) return input.focus()
    const x = P.sel && find(P.sel)
    if (x?.kind === 'art') return replace(x)
    input.value = ''
    if (x?.kind === 'page' && P.layer && sw.layers?.get(P.layer)?.done) { sw.layers.fix(P.layer, text); toast(`${ic('msg', 15)}<span>On it</span>`); return }
    const route = routeMessage({ text, run: P.run, site: !P.board?.game && P.board?.pages?.length > 0, selected: x?.kind === 'page', hosted: hosted() })
    if (route === 'fix') { sw.focusPage(x.page); sw.submit(`/fix ${text}`); toast(`${ic('msg', 15)}<span>On it</span>`); setTimeout(load, 1500); return }
    // the project's next version: every page kept, the crew builds what was asked. A version with
    // no pages yet (its build failed) is still this project's: the server builds on its brief.
    // Each turn extends the one before it: the open version becomes the run that starts.
    const from = route === 'extend' || (route === 'new' && P.run && P.board?.kind !== 'game' && !hosted()) ? P.run : null
    const send = (t, chat) => Promise.resolve(sw.submit(t, false, P.pid, from, chat ? { chat } : {})).then(r => {
      if (r?.busy) { if (!input.value) input.value = text; toast(`${ic('msg', 15)}<span>Still on the last change</span>`); return }
      // the new version is the one shown: the machine names it, the Overview follows
      if (typeof r === 'string' && r !== P.run) return C.started(r, { project: P.pid, room: 'overview' })
      load()
    })
    // "don't build yet, let's talk" or a question for the crew: the planner answers in the Design
    // deck's chat and nothing is built until the person says build there (engine/talkplan.mjs)
    // no Hermes to answer the model: the chat says so and what to do, before anything starts
    const off = hosted() || !sw.hermesReady ? null : await sw.hermesReady()
    if (off) { C.go('station', 'canvas'); C.chat(true); return void sw.hermesSays(off) }
    const read = hosted() || !sw.readTalk ? 'build' : await sw.readTalk(text)
    if (read === 'build') return send(text)
    C.go('station', 'canvas')
    C.chat(true)
    const build = (t, chat) => { C.go('project'); send(t, chat) }
    if (read === 'talk') sw.talk.start({ text, build, from: P.run })
    else sw.talk.ask(text, () => build(text), () => sw.talk.start({ text, build, from: P.run }))
  }

  // the section the dock is talking about; its × goes back to the whole project
  const scopeEl = $('.pj-scope')
  function scope() {
    const l = P.layer && sw.layers?.get(P.layer)
    scopeEl.hidden = !l
    if (l) { scopeEl.querySelector('span').textContent = l.role; scopeEl.setAttribute('aria-label', `About ${l.role}; clear`) }
  }
  scopeEl.onclick = () => { pickLayer(null); input.focus() }

  function liveLine() {
    const b = P.board || {}
    const parts = []
    const waiting = (b.painting || []).filter(w => w.state !== 'failed')
    if (waiting.length) {
      const names = [...new Set(waiting.map(w => painterOf(`${w.page}/${w.layer}/${w.gen}`)))]
      const { done = 0, total = waiting.length } = b.paintCount || {}
      parts.push(`${names.slice(0, 2).join(', ')}${names.length > 2 ? ' +1' : ''} painting ${Math.min(total, done + 1)} of ${Math.max(total, 1)}`)
    }
    const rv = b.review
    if (rv?.active) {
      const at = rv.current ? rv.pages.findIndex(p => p.id === rv.current) + 1 : Math.min(rv.total, rv.done + 1)
      parts.push(`${REVIEWER} reviewing page ${Math.max(1, at)} of ${rv.total}`)
    }
    liveEl.hidden = !parts.length
    const text = parts.join(' · ')
    if (liveEl.dataset.t !== text) { liveEl.dataset.t = text; liveEl.innerHTML = `<i></i><span>${esc(text)}</span>` }
  }

  // ---------- the crew at work: named cursors over the artboards while a build runs. A painter sits
  // on the picture it is making (and travels between its slots when it has more than one); the
  // reviewer rides the scan line down the page being checked; the rest wander while the build runs
  const jobs = () => {
    const b = P.board || {}, out = new Map()
    for (const w of b.painting || []) {
      if (w.state === 'failed') continue
      const who = painterOf(`${w.page}/${w.layer}/${w.gen}`)
      if (!out.has(who)) out.set(who, [])
      // a picture sent back goes first: the painter goes back to it
      out.get(who)[w.state === 'again' ? 'unshift' : 'push'](`[data-key="${CSS.escape(`art:${w.page}/${w.layer}/${w.gen}`)}"]`)
    }
    if (b.review?.active && b.review.current) out.set(REVIEWER, [`[data-key="${CSS.escape(`page:${b.review.current}`)}"]`])
    return out
  }
  const working = () => !!P.board?.live || jobs().size > 0
  // Follow: while the crew work, the camera keeps what they are on in view. Panning, scrolling or
  // pinching hands the camera back to you for the rest of that build, and the Follow button takes it
  // again. It is never remembered as off: every new build starts with the camera following, so one
  // pan long ago cannot leave later builds filling up off screen. The button keeps its place in the
  // dock and is disabled while nobody is working (docs/ux/RULES.md, rule 29).
  function setFollow(on) {
    if (P.follow === on) return
    P.follow = on
    P.followSig = ''
    const b = root.querySelector('.pj-follow')
    b?.setAttribute('aria-pressed', String(on))
    b?.classList.toggle('on', on)
    if (on) placeCrew()
  }
  function crewAtWork() {
    // a build that has just started (another run, or this one going live again) follows from its first page
    const at = working() ? `${P.run}|${P.board?.live ? 'live' : 'after'}` : ''
    if (at && at !== P.followRun) {
      const [run, phase] = at.split('|'), [wasRun, wasPhase] = P.followRun.split('|')
      if (run !== wasRun || (phase === 'live' && wasPhase !== 'live')) setFollow(true)
      P.followRun = at
    }
    const fb = root.querySelector('.pj-follow')
    if (fb) { fb.disabled = !working(); fb.classList.toggle('on', P.follow && working()); fb.setAttribute('aria-pressed', String(P.follow)) }
    if (!working()) { curEl.innerHTML = ''; P.followSig = ''; return }
    if (!curEl.children.length) curEl.innerHTML = CREW.map(n => cursor(n)).join('')
    if (P.wander) { placeCrew(); return }
    const move = () => {
      if (!P.on || !working()) { P.wander = 0; curEl.innerHTML = ''; return }
      P.tick++
      placeCrew(true)
      P.wander = setTimeout(move, 1400 + Math.random() * 900)
    }
    P.wander = setTimeout(move, 50)
  }
  function placeCrew(roam = false) {
    // while the pages are being laid out the work is on the pages: the picture slots noted so far
    // are painted afterwards, so neither the camera nor the crew leave for the art tiles yet
    const abs = [...world.querySelectorAll('.ab')], live = !!P.board?.live, js = live ? new Map() : jobs()
    // where the work is: the pictures and the page in review, else the newest page of a live build
    const busy = [...new Set([...js.values()].flat())].map(q => world.querySelector(q)).filter(Boolean)
    const pages = abs.filter(a => a.dataset.key?.startsWith('page:'))
    // (the crew build every page at once, so a live build keeps all its pages in view, not just the newest)
    const focus = busy.length ? busy : live ? (pages.length ? pages : abs.slice(-1)) : []
    // each cursor's artboard and spot on it, in world units (from layout, so a camera still easing doesn't skew it)
    const spots = []
    for (const c of curEl.children) {
      const mine = js.get(c.dataset.n)
      let a = null, fx = 0.2 + Math.random() * 0.6, fy = 0.2 + Math.random() * 0.6
      if (mine?.length) {
        a = world.querySelector(mine[Math.floor(P.tick / 2) % mine.length])
        if (c.dataset.n === REVIEWER && a) { fx = 0.7; fy = scanAt() }
        else { fx = 0.62; fy = 0.58 }
      } else if (live && roam) {
        // following, the others gather where the camera is; otherwise they wander the whole canvas
        const pool = P.follow && focus.length ? focus : abs
        a = pool[Math.floor(Math.random() * pool.length)]
      } else if (!live) { c.style.opacity = '0'; continue }
      if (!a) continue
      const r = worldBox(a)
      spots.push([c, r.x + r.w * fx, r.y + Math.min(r.h * fy, r.h - 6)])
    }
    if (P.follow && focus.length) {
      const sig = focus.map(a => a.dataset.key).join('|')
      if (sig !== P.followSig) {
        const bs = focus.map(worldBox).filter(b => b.w)
        if (bs.length) {
          P.followSig = sig
          const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y))
          const b = { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }
          // a long page: its top, at a readable size
          if (b.h > b.w * 1.6) b.h = b.w * 1.6
          fit(b, 1.25, true)
        }
      }
    }
    for (const [c, x, y] of spots) {
      c.style.opacity = ''
      c.classList.remove('track')
      c.dataset.wx = x; c.dataset.wy = y
      c.style.left = `${world.offsetLeft + P.cam.x + x * P.cam.k}px`
      c.style.top = `${world.offsetTop + P.cam.y + y * P.cam.k}px`
    }
  }
  // While the camera moves, the cursors keep to their spots about ten times a second; CSS eases each
  // step (.cur.track), so the crew needs no per-frame work. The Design deck keeps its own smooth cursors.
  function trackCrew() {
    if (!curEl.children.length) return
    const wait = 100 - (performance.now() - (P.trackAt || 0))
    if (wait > 0) { clearTimeout(P.trackT); P.trackT = setTimeout(trackCrew, wait); return }
    P.trackAt = performance.now()
    for (const c of curEl.children) {
      if (c.dataset.wx == null) continue
      c.classList.add('track')
      c.style.left = `${world.offsetLeft + P.cam.x + c.dataset.wx * P.cam.k}px`
      c.style.top = `${world.offsetTop + P.cam.y + c.dataset.wy * P.cam.k}px`
    }
  }
  // an element's box in world units, from layout (offsets up to the world), not from the screen
  function worldBox(el) {
    let x = 0, y = 0, e = el
    while (e && e !== world) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent }
    return e === world ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 }
  }
  // where the review's scan line is on its page, 0..1 (it sweeps down every four seconds)
  const scanAt = () => ((Date.now() / 4000) % 1) * 0.9 + 0.05

  let toastEl = null
  // ---------- Scribble: draw on a page's artboard (a stroke, a ring, or with Shift a box), a note at its end
  const clamp01 = v => Math.max(0, Math.min(1, v))
  world.addEventListener('pointerdown', e => {
    if (P.tool === 'move' || e.button !== 0 || hosted()) return
    const a = e.target.closest('.ab.page'), x = a && find(a.dataset.key)
    if (!x) return
    e.preventDefault(); e.stopPropagation()
    if (P.tool === 'eraser') { const g = e.target.closest('[data-mk]'); if (g) eraseMark(g.dataset.mk, !!g.dataset.sent); return }
    if (!P.run) return toast('<span>Build it first</span>')
    const r = a.getBoundingClientRect(), k = pageK(x.page)
    const at = ev => [clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height / k)]
    const d = { page: x.page, pts: [at(e)], shift: e.shiftKey }
    const svg = a.querySelector('.mk'), live = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    live.innerHTML = '<path class="halo"/><path class="ln"/>'
    svg?.append(live)
    a.setPointerCapture(e.pointerId)
    const move = ev => {
      const p = at(ev), q = d.pts.at(-1)
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < 0.002) return
      d.pts.push(p)
      const path = d.shift ? markD({ kind: 'box', page: x.page, box: boxOf([d.pts[0], p]) }) : ptsPath(d.pts, k)
      for (const el of live.children) el.setAttribute('d', path)
    }
    const up = ev => {
      a.removeEventListener('pointermove', move); a.removeEventListener('pointerup', up); a.removeEventListener('pointercancel', up)
      live.remove()
      if (ev.type === 'pointerup') finishMark(d, ev)
    }
    a.addEventListener('pointermove', move); a.addEventListener('pointerup', up); a.addEventListener('pointercancel', up)
  }, true)
  function boxOf(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    const x0 = Math.min(...xs), y0 = Math.min(...ys)
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
  }
  function finishMark(d, ev) {
    const pts = d.shift ? [d.pts[0], d.pts.at(-1)] : d.pts
    const box = boxOf(pts)
    if (box.w + box.h < 0.01) return
    if (P.marks.length >= 40) return toast('<span>40 marks at most: send these first</span>')
    const [a, b] = [pts[0], pts.at(-1)]
    const closed = pts.length > 8 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.3 * Math.hypot(box.w, box.h)
    const m = { id: `k${++P.mkN}`, run: P.run, page: d.page, kind: d.shift ? 'box' : closed ? 'ring' : 'stroke', pts: d.shift ? [] : pts, box, note: '', target: null }
    P.marks.push(m)
    drawMarks()
    Promise.resolve(sw.marks?.anchor(m.page, box)).then(t => { if (t) m.target = t }).catch(() => {})
    noteAt(m, ev.clientX, ev.clientY)
  }
  // the optional note, at the end of the mark; Enter or a click away closes it
  function noteAt(m, x, y) {
    root.querySelector('.mk-note')?.remove()
    const f = document.createElement('input')
    f.className = 'mk-note'
    f.placeholder = 'Note'
    f.setAttribute('aria-label', 'Note for this mark')
    f.maxLength = 200
    f.style.left = `${Math.min(innerWidth - 230, x + 10)}px`
    f.style.top = `${Math.min(innerHeight - 44, y + 6)}px`
    let shut = false
    const done = () => { if (shut) return; shut = true; m.note = f.value.trim(); f.remove() }
    f.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done() } }
    f.onblur = done
    root.append(f)
    setTimeout(() => f.focus(), 0)
  }
  // Eraser: an unsent mark goes (⌘Z brings it back); a sent one is closed on the run, so it is never sent again
  function eraseMark(id, sent) {
    if (sent) { sw.marks?.erase(id).then(ok => { if (!ok) toast('<span>That mark could not be erased</span>') }); return }
    const m = P.marks.find(x => x.id === id)
    if (!m) return
    P.marks = P.marks.filter(x => x !== m)
    P.mkUndo.push([m])
    drawMarks()
  }
  function clearMarks() {
    const gone = P.marks.filter(m => m.run === P.run)
    if (!gone.length) return
    P.marks = P.marks.filter(m => !gone.includes(m))
    P.mkUndo.push(gone)
    drawMarks()
    toast(`${ic('trash', 15)}<span>Marks cleared</span><button class="btn sm ghost pj-undo">Undo</button>`)
    toastEl?.querySelector('.pj-undo')?.addEventListener('click', () => { toastEl?.remove(); undoMarks() })
  }
  function undoMarks() {
    const back = P.mkUndo.pop()
    if (!back) return false
    P.marks.push(...back)
    drawMarks()
    return true
  }
  $('.pj-mkchip').onclick = () => clearMarks()
  // ⌘Z while Scribble or Eraser is out brings back what Eraser or Clear took, until the marks are sent
  addEventListener('keydown', e => {
    if (!P.on || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z' || P.tool === 'move' || !P.mkUndo.length) return
    if (e.target.closest?.('input, textarea')) return
    e.preventDefault(); e.stopImmediatePropagation()
    undoMarks()
  }, true)

  // Sending: each page's picture with its marks drawn on it, a crop round each mark (its box and a quarter
  // more, at least 256 px), the data and the words. The crew answer with drafts beside the original.
  const loadImg = src => new Promise(ok => { if (!src) return ok(null); const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src })
  function inkMark(g, m, W, H, lw) {
    g.lineCap = g.lineJoin = 'round'
    const path = () => {
      g.beginPath()
      if (m.kind === 'box') g.rect(m.box.x * W, m.box.y * H, m.box.w * W, m.box.h * H)
      else m.pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)))
    }
    path(); g.strokeStyle = 'rgba(11,11,12,.55)'; g.lineWidth = lw * 2; g.stroke()
    path(); g.strokeStyle = '#ff5a36'; g.lineWidth = lw; g.stroke()
  }
  async function sendMarks(text, list) {
    if (P.markBusy || !sw.marks) return
    P.markBusy = true
    root.querySelector('.mk-note')?.blur()
    try {
      const shots = {}, crops = {}
      for (const page of new Set(list.map(m => m.page))) {
        const im = await loadImg(await Promise.resolve(sw.thumb?.(page, 0.6)).catch(() => null) || (P.thumbs.get(page)?.startsWith('data:') ? P.thumbs.get(page) : null))
        if (!im) continue
        const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement('canvas')
        c.width = W; c.height = H
        const g = c.getContext('2d')
        g.drawImage(im, 0, 0)
        for (const m of list.filter(m => m.page === page)) inkMark(g, m, W, H, Math.max(3, W / 240))
        const s = Math.min(1, 1024 / W), o = document.createElement('canvas')
        o.width = Math.round(W * s); o.height = Math.round(Math.min(H * s, 4000))
        o.getContext('2d').drawImage(c, 0, 0, W * s, H * s)
        shots[page] = o.toDataURL('image/jpeg', 0.8)
        for (const m of list.filter(m => m.page === page)) {
          const b = m.box, side = 256 * W / 1280
          let w = Math.max(side, b.w * W * 1.5), h = Math.max(side, b.h * H * 1.5)
          w = Math.min(w, W); h = Math.min(h, H)
          const x0 = Math.max(0, Math.min(W - w, (b.x + b.w / 2) * W - w / 2)), y0 = Math.max(0, Math.min(H - h, (b.y + b.h / 2) * H - h / 2))
          const cc = document.createElement('canvas'), z = Math.min(2, 768 / Math.max(w, h))
          cc.width = Math.round(w * z); cc.height = Math.round(h * z)
          cc.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, cc.width, cc.height)
          crops[m.id] = cc.toDataURL('image/jpeg', 0.85)
        }
      }
      const out = await sw.marks.send({ text, marks: list.map(({ id, kind, page, box, pts, note, target }) => ({ id, kind, page, box, pts, note, target })), shots, crops })
      P.marks = P.marks.filter(m => !list.includes(m))
      P.mkUndo = []
      input.value = ''
      drawMarks()
      toast(`${ic('msg', 15)}<span>${esc((out.reply || 'On it').slice(0, 160))}</span>`)
    } catch (err) { toast(`<span>${esc(err.message || 'The marks did not go')}</span>`) } finally { P.markBusy = false }
  }
  // what the run says about its marks and drafts (live, and replayed when it opens)
  sw.on(e => {
    if (e.type === 'reset') { P.sent.clear(); P.drafts.clear(); P.drafting.clear(); P.reads.clear(); return }
    const run = e.run || sw.viewing
    if (e.type === 'marks') for (const m of e.marks || []) P.sent.set(m.id, { ...m, run, status: 'open' })
    else if (e.type === 'mark:status') { for (const id of e.ids || []) { const m = P.sent.get(id); if (m) m.status = e.status } }
    else if (e.type === 'marks:read') { for (const r of e.reads || []) P.reads.set(r.mark, r) }
    else if (e.type === 'draft:start') P.drafting.set(`${e.page}/${e.layer}`, { page: e.page, layer: e.layer, role: e.role, run })
    else if (e.type === 'draft') { P.drafting.delete(`${e.page}/${e.layer}`); P.drafts.set(e.id, { id: e.id, page: e.page, layer: e.layer, role: e.role, html: e.html, marks: e.marks || [], run, image: null }) }
    else if (e.type === 'draft:failed') { P.drafting.delete(`${e.page}/${e.layer}`); if (P.on && e.message !== 'stopped') toast(`<span>The draft did not come: ${esc(String(e.message || '').slice(0, 80))}</span>`) }
    else if (e.type === 'draft:closed') P.drafts.delete(e.id)
    else return
    if (!P.on) return
    clearTimeout(P.mkSoon)
    P.mkSoon = setTimeout(() => { renderStage(); renderList(); if (P.sel && !find(P.sel)) select(null); else renderInsp() }, 120)
  })

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
    if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 's' || e.key === 'e') && !hosted()) { e.preventDefault(); return setTool(e.key === 's' ? 'scribble' : 'eraser') }
    if (e.key === 'Escape' && P.tool !== 'move') { e.preventDefault(); e.stopPropagation(); return setTool('move') }
    if (e.key === 'Escape' && P.layer) { e.preventDefault(); e.stopPropagation(); pickLayer(null); return }
    if (e.key === 'Escape' && P.sel) { e.preventDefault(); e.stopPropagation(); select(null) }
    if (e.key === 'Enter' && P.sel) { e.preventDefault(); openItem(find(P.sel)) }
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey) frameAll()
    if ((e.key === 'Delete' || e.key === 'Backspace') && P.sel?.startsWith('rf:')) { const x = find(P.sel); if (x) { e.preventDefault(); removeRef(x) } }
    if ((e.key === 'Delete' || e.key === 'Backspace') && P.sel?.startsWith('up:')) { const x = find(P.sel); if (x) { e.preventDefault(); fileOp({ op: 'delete', name: x.name }).then(() => select(null)) } }
  }, true)
  addEventListener('resize', () => { if (P.on) crewAtWork() })
  // a picture that did not come: paint it again from the same words
  world.addEventListener('click', e => {
    const b = e.target.closest('[data-again]')
    if (!b) return
    e.stopPropagation()
    const w = P.board?.painting?.find(x => `art:${x.page}/${x.layer}/${x.gen}` === b.dataset.again)
    if (!w) return
    b.disabled = true
    w.state = 'painting'; w.from = Date.now()
    renderStage(); liveLine()
    Promise.resolve(sw.layers?.paint(`${w.page}/${w.layer}`, w.gen)).then(ok => { if (!ok) toast('That picture could not start again'); load() })
  }, true)
  sw.on(e => {
    if (!P.on) return
    if (/^(image|review)(:|$)/.test(e.type) && (!e.run || e.run === P.run)) { clearTimeout(P.soonP); P.soonP = setTimeout(load, 350) }
    // a run starting elsewhere (another project, another window) does not take over this one;
    // the dock's own turns switch to their run when it starts (above)
    if (e.type === 'run:start' || e.type === 'reset') { if (e.run && !P.run) P.seen = e.run; if (!e.run || e.run === P.run) { P.thumbs.clear(); P.stale.clear(); P.thumbTries = 0; setTimeout(load, 600) } }
    if (e.type === 'image' || e.type === 'page' || e.type === 'video:done' || e.type === 'run:done') { clearTimeout(P.soon); P.soon = setTimeout(load, 800) }
    // a finished section changes its page (a shared one, '*', every page): those are taken again
    if (e.type === 'layer:done') { for (const p of P.board?.pages || []) if (!e.page || e.page === '*' || e.page === p.id) P.stale.add(p.id); P.thumbTries = 0; clearTimeout(P.soonT); P.soonT = setTimeout(thumbs, 2000) }
  })

  // Drag a layer into the chat (spec 29, web/layerlink.js): a section in the inspector's list, or a
  // picked section's outline on its page, drags into the left chat as a chip
  root.addEventListener('dragstart', e => {
    const b = e.target.closest?.('.pj-ly[data-layer], .lsel[data-layer]')
    if (!b) return
    e.stopPropagation()
    sw.layerDrag?.(e, b.dataset.layer, b.dataset.name || b.textContent.trim())
  })
  // where a layer is on screen while the Overview shows (false when it does not): its page's
  // artboard, cut to the layer's band; a shared layer (nav, footer) on the selected page or the first
  sw.overviewRect = key => {
    if (!P.on || root.hidden) return false
    const [pg] = String(key).split('/')
    const page = pg === '*' ? (find(P.sel)?.page || P.board?.pages?.[0]?.id) : pg
    const a = page && world.querySelector(`.ab[data-key="${CSS.escape(`page:${page}`)}"]`)
    if (!a) return null
    const r = a.getBoundingClientRect()
    const l = sw.layers?.list(page).find(y => y.key === key), ratio = P.aspect.get(page)
    if (!l?.box || !ratio) return { left: r.left, top: r.top, width: r.width, height: Math.min(r.height, 40) }
    const full = r.width * ratio, top = Math.min(r.bottom - 4, r.top + l.box.top * full)
    return { left: r.left, top, width: r.width, height: Math.max(4, Math.min(l.box.height * full, r.bottom - top)) }
  }

  return {
    el: root,
    // the machine's version and project (draw passes them); another one starts the view afresh
    show() {
      const shown = `${nav.view.project}|${nav.view.version}`
      if (shown !== P.shown) { P.shown = shown; P.seen = null; forget() }
      root.hidden = false
      P.on = true
      if (P.boardOf !== P.run) render(); load()
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
