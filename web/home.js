// Projects: the studio's home, a file browser after Figma's and Canva's (docs/ux/PATTERNS.md).
// A sidebar (Recent, All projects, Assets, Trash, Folders, you), one input that starts a build,
// and a grid of project cards: the build's own hero picture, its title and what it made.
// Right-click or … manages a project; drag a card onto a folder; Shift/⌘-click picks several.
// Re-runs of one idea stack on one card (server/projects.mjs groups them).
import { ic, cursor, logo, CREW } from './icons.js'
import { makeSetup } from './setup.js'
import { openSettings } from './settings.js'
import { makeWays, makeModeOf, makeStudioStep } from './makeways.js'

const KIND = { site: 'site', app: 'code', game: 'game', film: 'film' }
const KIND_NAME = { site: 'Site', app: 'App', game: 'Game', film: 'Film' }
const SORTS = [['edited', 'Last edited'], ['name', 'Name'], ['created', 'Created']]
// the filter beside sort: what a build is, or how far it got (the server's own words in project.state)
const KINDS = ['Website', 'App', 'Game', 'Video']
const STATUSES = ['Draft', 'Building', 'Designed', 'App built', 'App failed', 'Game built', 'Game failed', 'Live']
const STATUS_ICON = { Draft: 'pencil', Building: 'clock', Designed: 'frame', 'App built': 'code', 'App failed': 'x', 'Game built': 'game', 'Game failed': 'x', Live: 'globe' }
const KIND_ICON = { Website: 'site', App: 'code', Game: 'game', Video: 'film' }

export function makeHome({ sw, C, root }) {
  const esc = sw.esc
  const store = sw.store
  const hosted = () => document.body.classList.contains('hosted')
  const H = {
    on: false, view: store.get('home.view', 'recent'), folder: store.get('home.folder', null), stack: null,
    sort: store.get('home.sort', 'edited'), filter: store.get('home.filter', ''), layout: store.get('home.layout', 'grid'), q: '', searching: false,
    sel: new Set(), last: null, data: { folders: [], projects: [] }, assets: null, me: null, loaded: false
  }
  const opened = store.get('home.opened', {})
  // the one-time Setup sheet (docs/specs/06-onboarding.md); the plugin only
  const setup = makeSetup({ sw })
  // Settings (web/settings.js) opens the same sheet when its Crew rows become editable
  window.SwarmSetup = { open: row => setup.open(row) }
  let setupAsked = false

  root.className = 'home'
  root.hidden = true
  root.innerHTML = `
    <aside class="hm-side" aria-label="Projects">
      <button class="hm-logo" aria-label="Projects">${logo()}</button>
      <nav class="hm-nav"></nav>
      <div class="hm-sub"><span class="cap">Folders</span><button class="ib sm hm-addf" aria-label="New folder">${ic('plus', 16)}</button></div>
      <div class="hm-folders"></div>
      <div class="hm-me"><button class="hm-who" aria-label="You"><span class="av"></span><span class="nm"></span></button><a class="ib hm-feed" aria-label="Swarm Feed" target="_blank" rel="noopener">${ic('globe')}</a></div>
    </aside>
    <div class="hm-scrim" hidden></div>
    <main class="hm-main">
      <div class="hm-top"><button class="ib hm-burger" aria-label="Menu">${ic('menu')}</button>${logo()}</div>
      <form class="hm-ask" autocomplete="off"><button type="button" class="hm-kind" aria-label="What to make" aria-haspopup="menu"></button><input name="q" placeholder="What should the crew build?" aria-label="What should the crew build?" maxlength="4000">
        <button type="button" class="ib hm-ideas" aria-label="Examples" aria-haspopup="dialog">${ic('idea', 18)}</button><button type="submit" class="btn pri hm-make">${ic('up', 16)}Make</button></form>
      <div class="hm-pop" hidden></div>
      <div class="hm-bar"></div>
      <div class="hm-body grid">${'<div class="card wait-in" aria-busy="true"><div class="cv"></div><div class="nm"><b></b></div></div>'.repeat(4)}</div>
      <div class="hm-selbar" hidden></div>
    </main>`
  const $ = s => root.querySelector(s)
  const side = $('.hm-side'), nav = $('.hm-nav'), foldersEl = $('.hm-folders'), bar = $('.hm-bar'), bodyEl = $('.hm-body'), selbar = $('.hm-selbar')
  const form = $('.hm-ask'), input = form.q

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, body: j }); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  async function refresh() {
    try {
      H.data = await api('/api/projects')
    } catch {
      // the hosted studio has no projects store: each of the guest's runs is its own project
      const runs = await api('/api/runs').catch(() => [])
      H.data = { folders: [], projects: (Array.isArray(runs) ? runs : []).map(r => ({ id: r.id, title: String(r.title || '').split(/\s[—–|:-]\s/)[0], head: r.id, count: 1, made: r.t, updated: r.updated || r.t, cover: r.cover || null, theme: r.cover ? null : r.theme, kinds: [r.pages > 0 && 'site', r.video && 'film'].filter(Boolean), state: r.state || null, live: !!r.live, versions: [{ id: r.id, title: r.title, t: r.t, updated: r.updated, cover: r.cover || null, theme: r.theme, kinds: [], live: !!r.live }] })) }
    }
    // a game's plan (spec 21) is a project before its first build: it opens on the Plan board
    if (!hosted()) {
      // a plan is part of the project of the same name (or that name plus more words): the project's
      // menu opens it. Only a plan with no project yet is a card of its own, one per name.
      const key = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
      const real = H.data.projects.filter(p => !p.plan)
      const home = k => real.find(p => { const n = key(p.title); return n && (n === k || k.startsWith(`${n} `) || n.startsWith(`${k} `)) })
      const seen = new Set(), loose = []
      const plans = ((await api('/api/plans').catch(() => null))?.plans || []).sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
      for (const x of plans) {
        const k = key(x.title), p = k && home(k)
        if (p) { p.planId ||= x.id; continue }
        if (!x.locked && seen.has(k)) continue
        seen.add(k); loose.push(x)
      }
      H.data.projects = [...real, ...loose.map(x => ({ id: x.id, plan: true, title: x.title, head: null, count: 1, made: Date.parse(x.updated), updated: Date.parse(x.updated), cover: x.cover, kinds: ['game'], state: { kind: 'Game', status: x.locked ? 'Locked' : 'Plan' }, versions: [] }))]
    }
    // a version that failed, or a Draft that never got a section (an empty tile), is not shown once
    // a newer one works: the project is its working versions
    const dead = v => /failed|^Draft$/i.test(String(v?.state?.status || ''))
    for (const p of H.data.projects) {
      if (!Array.isArray(p.versions) || p.versions.length < 2) continue
      const kept = p.versions.filter((v, i) => !(dead(v) && p.versions.slice(0, i).some(n => !dead(n))))
      if (kept.length && kept.length < p.versions.length) { p.versions = kept; p.count = kept.length }
      // a newest version that failed does not name the card when an older one works
      const ok = dead(p) && p.versions.find(v => !dead(v))
      if (ok?.state) p.state = ok.state
    }
    H.loaded = true
    if (H.view === 'assets') H.assets = await api('/api/assets').then(j => j.assets).catch(() => [])
    if (H.view === 'chats') loadChats()
    if (H.view === 'folder' && !H.data.folders.some(f => f.name === H.folder)) go('recent')
    render()
    clearTimeout(H.timer)
    H.timer = setTimeout(() => H.on && refresh(), H.data.projects.some(p => p.live) ? 4000 : 20000)
  }
  async function loadMe() {
    H.me = await api('/api/me').catch(() => null)
    const name = H.me?.name || 'You'
    $('.hm-who .nm').textContent = name
    $('.hm-who .av').textContent = name.slice(0, 1).toUpperCase()
    $('.hm-feed').href = H.me?.feed || 'https://swarm.design-bakery.com'
  }

  // ---------- which projects this view shows
  const live = () => H.data.projects.filter(p => !p.trashed)
  const seen = p => Math.max(p.updated || 0, opened[p.id] || 0)
  function shown() {
    let list
    if (H.view === 'trash') list = H.data.projects.filter(p => p.trashed)
    else if (H.view === 'folder') list = live().filter(p => p.folder === H.folder)
    else if (H.view === 'recent') list = [...live()].sort((a, b) => seen(b) - seen(a)).slice(0, 24)
    else list = live()
    if (H.q) { const q = H.q.toLowerCase(); list = list.filter(p => p.title.toLowerCase().includes(q) || p.versions?.some(v => String(v.title || '').toLowerCase().includes(q))) }
    list = list.filter(passes)
    const by = { edited: (a, b) => seen(b) - seen(a), name: (a, b) => a.title.localeCompare(b.title), created: (a, b) => (b.made || 0) - (a.made || 0) }[H.sort]
    return [...list].sort(by)
  }
  // the filter: 'k:Website' (kind) or 's:Live' (status); empty shows everything
  const passes = p => {
    if (!H.filter) return true
    const [t, v] = [H.filter.slice(0, 1), H.filter.slice(2)]
    return t === 'k' ? p.state?.kind === v : p.state?.status === v
  }
  const filterName = () => H.filter.slice(2)
  const titleOf = () => H.stack ? (H.data.projects.find(p => p.id === H.stack)?.title || 'Versions') : H.view === 'folder' ? H.folder : { recent: 'Recent', all: 'All projects', chats: 'Chats', assets: 'Assets', trash: 'Trash' }[H.view]

  // ---------- render
  function render() {
    renderSide()
    renderBar()
    if (H.view === 'assets' && !H.stack) renderAssets()
    else if (H.view === 'chats' && !H.stack) renderChats()
    else renderCards()
    renderSelbar()
  }
  function renderSide() {
    const n = live().length, t = H.data.projects.filter(p => p.trashed).length
    const item = (v, icon, label, count) => `<button class="nv${H.view === v && !H.stack ? ' on' : ''}" data-v="${v}">${ic(icon)}<span>${label}</span>${count ? `<span class="n" aria-label="${count} projects">${count}</span>` : ''}</button>`
    nav.innerHTML = item('recent', 'clock', 'Recent') + item('all', 'grid', 'All projects', n) + (hosted() ? '' : item('chats', 'msg', 'Chats') + item('assets', 'image', 'Assets') + item('trash', 'trash', 'Trash', t))
    foldersEl.innerHTML = H.data.folders.map(f => `<button class="nv${H.view === 'folder' && H.folder === f.name && !H.stack ? ' on' : ''}" data-folder="${esc(f.name)}">${ic('folder')}<span>${esc(f.name)}</span>${f.count ? `<span class="n" aria-label="${f.count} projects">${f.count}</span>` : ''}</button>`).join('')
    root.classList.toggle('no-folders', hosted())
  }
  function renderBar() {
    const trash = H.view === 'trash' && !H.stack
    bar.innerHTML = `${H.stack ? `<button class="ib hm-back" aria-label="Back">${ic('chl')}</button>` : ''}<h2>${esc(titleOf())}</h2>
      <label class="hm-search${H.searching || H.q ? ' open' : ''}"><input type="search" placeholder="Search" aria-label="Search projects" value="${esc(H.q)}"></label>
      ${trash && shown().length ? `<button class="btn ghost hm-empty">${ic('trash', 15)}Empty</button>` : ''}
      <button class="ib hm-find${H.searching || H.q ? ' on' : ''}" aria-label="Search">${ic('search')}</button>
      ${H.filter && !H.stack ? `<button class="hm-chip" aria-label="Clear filter ${esc(filterName())}">${esc(filterName())}${ic('x', 13)}</button>` : ''}
      ${H.view === 'chats' && !H.stack ? '' : `${H.stack ? '' : `<button class="ib hm-filter${H.filter ? ' on' : ''}" aria-label="Filter" aria-haspopup="menu">${ic('filter')}</button>`}
      <button class="ib hm-sort" aria-label="Sort" aria-haspopup="menu">${ic('sort')}</button>
      <button class="ib hm-grid${H.layout === 'grid' ? ' on' : ''}" aria-label="Grid view">${ic('grid')}</button>
      <button class="ib hm-list${H.layout === 'list' ? ' on' : ''}" aria-label="List view">${ic('list')}</button>`}`
    const s = bar.querySelector('.hm-search input')
    s.oninput = () => { H.q = s.value.trim(); H.view === 'assets' && !H.stack ? renderAssets() : H.view === 'chats' && !H.stack ? renderChats() : renderCards() }
    s.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); H.q = ''; H.searching = false; render() } }
    if (H.searching) setTimeout(() => s.focus(), 0)
  }

  // the cover: the build's hero picture; with none yet, its title set in its own theme
  const typeCover = (title, th) => {
    const [bg, primary, accent, fg] = th.colors
    const font = th.fonts?.heading || th.fonts?.display || ''
    return `<div class="tc" style="--tc-bg:${esc(bg)};--tc-fg:${esc(fg || primary)};--tc-pr:${esc(primary || fg)}${font ? `;--tc-font:'${esc(String(font).replace(/'/g, ''))}'` : ''}"><i></i><b>${esc(title)}</b><span></span></div>`
  }
  const cover = (src, th, title = '') => src
    ? `<img class="im${/^\/snaps\//.test(src) ? ' top' : ''}" src="${esc((sw.base || '') + src)}" alt="" loading="lazy" decoding="async" draggable="false">`
    : th?.colors?.length ? typeCover(title, th)
      : `<div class="blank">${ic('box', 28)}</div>`
  const kinds = list => list?.length ? `<span class="kinds" aria-label="${list.map(k => KIND_NAME[k]).join(', ')}">${list.map(k => ic(KIND[k], 14)).join('')}</span>` : ''
  const crew = p => p.live ? `<div class="crew">${CREW.slice(0, 2 + (p.id.length % 3)).map(n => cursor(n)).join('')}</div>${p.progress == null && p.work ? `<div class="prog ind" role="progressbar" aria-label="Building ${WHAT[p.work.what] || ''}"><i></i></div>` : `<div class="prog" role="progressbar" aria-label="Building" aria-valuenow="${Math.round((p.progress ?? 0.1) * 100)}"><i style="width:${Math.max(6, Math.round((p.progress ?? 0.1) * 100))}%"></i></div>`}` : ''
  const WHAT = { site: 'the site', app: 'the app', game: 'the game', film: 'the film' }
  // what it is and how far it got, one quiet line: "App · Live · tidebreak-app.vercel.app"
  const stateLine = p => p.state ? `<span class="st">${esc(p.state.kind)} · ${esc(p.state.status)}${p.state.host ? `<span class="h"> · ${esc(p.state.host)}</span>` : ''}</span>` : ''
  const ago = t => { const d = (Date.now() - t) / 1000; return d < 90 ? 'now' : d < 3600 ? `${Math.round(d / 60)}m` : d < 86400 ? `${Math.round(d / 3600)}h` : d < 86400 * 30 ? `${Math.round(d / 86400)}d` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }

  // a card's own buttons, on its cover: Delete (to Trash) and Open, or in Trash, Restore and Delete forever
  const acts = p => hosted() || H.stack || p.version || p.plan ? '' : H.view === 'trash'
    ? `<div class="acts"><button class="ib sm" data-act="restore" aria-label="Restore">${ic('restore', 16)}</button><button class="ib sm red" data-act="purge" aria-label="Delete forever">${ic('trash', 16)}</button></div>`
    : `<div class="acts"><button class="ib sm red" data-act="trash" aria-label="Delete">${ic('trash', 16)}</button></div>`
  function card(p) {
    const stack = p.count > 1 && !H.stack
    const sel = H.sel.has(p.id)
    return `<div class="card${sel ? ' selc' : ''}${p.live ? ' live' : ''}" data-id="${esc(p.id)}" draggable="${!hosted() && !p.plan && H.view !== 'trash'}" tabindex="0" role="button" aria-label="${esc(p.title)}">
      <div class="cv${stack ? ' stack' : ''}">${cover(p.cover, p.theme, p.title)}${stack ? `<span class="badge" aria-label="${p.count} versions">${p.count}</span>` : ''}${kinds(p.kinds)}${crew(p)}${acts(p)}</div>
      ${sel ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : ''}
      <div class="nm"><b>${esc(p.title)}</b>${hosted() || p.plan ? '' : `<button class="ib sm more" aria-label="More" aria-haspopup="menu">${ic('more', 16)}</button>`}</div>
      ${stateLine(p)}
      ${H.layout === 'list' ? `<span class="meta">${p.count > 1 ? `<span aria-label="${p.count} versions">${ic('layers', 13)}${p.count}</span>` : ''}${p.folder && H.view !== 'folder' ? `<span>${ic('folder', 13)}${esc(p.folder)}</span>` : ''}<span>${ago(seen(p))}</span></span>` : ''}
    </div>`
  }
  // a stack opened: each version is a card of its own, named Version n (as in the breadcrumb's menu):
  // "Night Runner 3, 2, 1" read as three projects
  const versionCards = p => p.versions.map((v, i) => ({ id: v.id, version: true, project: p.id, title: `Version ${p.versions.length - i}`, cover: v.cover, theme: v.theme, kinds: v.kinds, state: v.state || null, count: 1, live: v.live, work: v.work || null, progress: v.work?.pct ?? null, updated: v.updated || v.t, made: v.t }))
  // an empty view says in one line what goes there; Make something puts the cursor in the Make box
  const none = (icon, line, make = false) => `<div class="hm-none">${ic(icon, 28)}<p>${line}</p>${make && !hosted() ? `<button type="button" class="btn ghost hm-first">${ic('plus', 15)}Make something</button>` : ''}</div>`
  const narrowed = () => !!(H.q || H.filter)
  const NONE = {
    recent: ['clock', 'Projects you open show up here', true],
    all: ['grid', 'Every project the crew builds lives here', true],
    folder: ['folder', 'Drag a project here to file it'],
    trash: ['trash', 'Deleted projects wait here until you empty Trash']
  }
  function renderCards() {
    let list
    if (H.stack) { const p = H.data.projects.find(x => x.id === H.stack); list = p ? versionCards(p) : [] }
    else list = shown()
    bodyEl.className = `hm-body ${H.layout}`
    bodyEl.innerHTML = list.length ? list.map(card).join('') : H.stack ? '' : narrowed() ? none('search', 'Nothing matches') : none(...(NONE[H.view] || NONE.all))
    bodyEl.querySelectorAll('.card.live .crew').forEach(wander)
  }
  // Assets: grouped by the project each piece came from, in the same folders as Projects;
  // a project's heading opens it, and each tile says its own name (its page and section, or the file's name)
  function renderAssets() {
    const byId = new Map(H.data.projects.filter(p => !p.trashed).map(p => [p.id, p]))
    let list = (H.assets || []).filter(a => byId.has(a.project) && passes(byId.get(a.project)))
    if (H.q) { const q = H.q.toLowerCase(); list = list.filter(a => byId.get(a.project).title.toLowerCase().includes(q) || `${a.name} ${a.page || ''}`.toLowerCase().includes(q)) }
    const groups = new Map()
    for (const a of list) { if (!groups.has(a.project)) groups.set(a.project, []); groups.get(a.project).push(a) }
    const flat = []
    const tile = a => {
      const i = flat.push(a) - 1
      const img = a.kind === 'film' ? a.poster : a.kind === 'upload' && !/^image\//.test(a.type || '') ? null : a.src
      return `<div class="card asset" data-asset="${i}" data-project="${esc(a.project)}" tabindex="0" role="button" aria-label="${esc(a.name)}">
        <div class="cv">${img ? `<img class="im" src="${esc((sw.base || '') + img)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<div class="blank">${ic(a.kind === 'film' ? 'film' : 'file', 28)}</div>`}${a.kind === 'film' ? `<span class="kinds" aria-label="Film">${ic('film', 14)}</span>` : a.kind === 'upload' ? `<span class="kinds" aria-label="Upload">${ic('upload', 14)}</span>` : ''}</div>
        <div class="nm"><b>${esc(a.name)}</b></div></div>`
    }
    const group = id => {
      const p = byId.get(id)
      return `<section class="as-group"><button class="as-head" data-project="${esc(id)}" aria-label="Open ${esc(p.title)}"><b>${esc(p.title)}</b>${ic('chr', 16)}</button>
        <div class="as-tiles ${H.layout}">${groups.get(id).map(tile).join('')}</div></section>`
    }
    // unfiled projects first, then each folder in the sidebar's order
    // the sort orders the projects too: by name, by when made, else newest piece first (the server's order)
    if (H.sort === 'name') { const ids = [...groups.keys()].sort((a, b) => byId.get(a).title.localeCompare(byId.get(b).title)); ids.forEach(id => { const g = groups.get(id); groups.delete(id); groups.set(id, g) }) }
    if (H.sort === 'created') { const ids = [...groups.keys()].sort((a, b) => (byId.get(b).made || 0) - (byId.get(a).made || 0)); ids.forEach(id => { const g = groups.get(id); groups.delete(id); groups.set(id, g) }) }
    const folders = [null, ...H.data.folders.map(f => f.name)]
    let html = ''
    for (const f of folders) {
      const ids = [...groups.keys()].filter(id => (byId.get(id).folder || null) === f)
      if (!ids.length) continue
      html += `${f ? `<h3 class="as-folder">${ic('folder', 15)}<span>${esc(f)}</span></h3>` : ''}${ids.map(group).join('')}`
    }
    bodyEl.className = 'hm-body assets'
    bodyEl.innerHTML = html || (narrowed() ? none('search', 'Nothing matches') : none('image', 'Pictures, sections, films and files from every project, to reuse in later builds', true))
    H.assetList = flat
  }
  // Chats (spec 29): talks with the planner that have not built anything, newest first. One opens in
  // the Design deck's chat where it left off; a chat that builds moves into its project.
  const CHAT_ICON = { site: 'site', app: 'code', game: 'game', film: 'film' }
  function loadChats() { api('/api/chats').then(j => { H.chats = j.chats || []; if (H.view === 'chats' && !H.stack) renderChats() }).catch(() => {}) }
  function renderChats() {
    let list = H.chats || []
    if (H.q) { const q = H.q.toLowerCase(); list = list.filter(c => c.title.toLowerCase().includes(q)) }
    bodyEl.className = 'hm-body chats'
    // New chat first: a new idea starts here, outside every project
    bodyEl.innerHTML = `<div class="chat-row chat-new" data-new tabindex="0" role="button">${ic('plus', 16)}<b class="cr-nm">New chat</b></div>` + list.map(c => `<div class="chat-row" data-chat="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.title)}">
      ${ic(CHAT_ICON[c.kind] || 'msg', 16)}<b class="cr-nm">${esc(c.title)}</b>${c.state === 'locked' ? `<span class="cr-st">Locked</span>` : ''}<span class="cr-t">${ago(c.updated)}</span>
      <button class="ib sm more" aria-label="More" aria-haspopup="menu">${ic('more', 16)}</button></div>`).join('')
      + (list.length ? '' : H.q ? none('search', 'Nothing matches') : none('msg', 'Talks with the planner that built nothing yet'))
  }
  async function openChat(id) {
    const chat = await api(`/api/chats/${encodeURIComponent(id)}`).catch(() => null)
    if (!chat?.id) { loadChats(); return }
    // a game chat opens beside its board: the plan when it has one, else the draft (spec 27)
    if (chat.kind === 'game') return C.talkGame({ chat: chat.id, said: sw.talk.saidOf(chat), plan: chat.plan })
    const m = MAKES.find(x => x.k === ({ film: 'video' }[chat.kind] || chat.kind)) || MAKES[0]
    const run = m.k === 'site' ? null : { games: m.games, only: m.only }
    C.project = null
    C.go('station', 'canvas')
    C.chat(true)
    sw.talk.start({ kind: chat.kind, blank: true, chat: chat.id, said: sw.talk.saidOf(chat), build: (brief, c) => start(brief, run, {}, c) })
  }
  C.openChat = openChat
  function newChat() {
    C.project = null
    C.go('station', 'canvas')
    C.chat(true)
    sw.talk.start({ kind: 'site', blank: true, build: (brief, c) => start(brief, null, {}, c) })
  }
  function renameChat(id) {
    const b = bodyEl.querySelector(`.chat-row[data-chat="${CSS.escape(id)}"] .cr-nm`)
    const c = (H.chats || []).find(x => x.id === id)
    if (b && c) inlineName(b, c.title, v => post(`/api/chats/${encodeURIComponent(id)}`, { title: v }).then(loadChats).catch(err => toast(`<span>${esc(err.message)}</span>`)))
  }
  const deleteChat = id => api(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(loadChats).catch(err => toast(`<span>${esc(err.message)}</span>`))
  bodyEl.addEventListener('click', e => {
    const r = e.target.closest('.chat-row')
    if (!r || e.target.closest('.hm-rename')) return
    e.stopImmediatePropagation()
    if (r.dataset.new != null) return newChat()
    const id = r.dataset.chat
    if (e.target.closest('.more')) return showMenu([{ k: 'rename', icon: 'pencil', label: 'Rename', run: () => renameChat(id) }, { k: 'del', icon: 'trash', label: 'Delete', red: true, run: () => deleteChat(id) }], e.target.closest('.more'))
    openChat(id)
  }, true)
  bodyEl.addEventListener('click', e => { if (e.target.closest('.hm-first')) { drawer(false); input.focus() } })
  bodyEl.addEventListener('dblclick', e => { const n = e.target.closest('.chat-row:not(.chat-new) .cr-nm'); if (n) { e.preventDefault(); renameChat(n.closest('.chat-row').dataset.chat) } })
  bodyEl.addEventListener('keydown', e => {
    const r = e.target.closest('.chat-row')
    if (!r || e.target.closest('input')) return
    if (r.dataset.new != null) { if (e.key === 'Enter') { e.preventDefault(); newChat() } return }
    if (e.key === 'Enter') { e.preventDefault(); openChat(r.dataset.chat) }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteChat(r.dataset.chat) }
  }, true)

  // the crew at work on a live build's cover: named cursors that drift between spots
  function wander(box) {
    for (const c of box.querySelectorAll('.cur')) {
      const move = () => { if (!c.isConnected) return; c.style.left = `${8 + Math.random() * 70}%`; c.style.top = `${10 + Math.random() * 62}%`; setTimeout(move, 1200 + Math.random() * 1600) }
      move()
    }
  }

  function renderSelbar() {
    const n = H.sel.size
    selbar.hidden = n < 2
    if (n < 2) return
    selbar.innerHTML = `<b aria-label="${n} selected">${n}</b>${H.view === 'trash'
      ? `<button class="ib" data-bulk="restore" aria-label="Restore">${ic('restore')}</button><button class="ib" data-bulk="purge" aria-label="Delete forever">${ic('trash')}</button>`
      : `<button class="ib" data-bulk="move" aria-label="Move to" aria-haspopup="menu">${ic('folder')}</button><button class="ib" data-bulk="trash" aria-label="Delete">${ic('trash')}</button>`}<button class="ib" data-bulk="clear" aria-label="Clear selection">${ic('x')}</button>`
  }

  // ---------- navigation
  function go(view, folder = null) {
    H.view = view; H.folder = folder; H.stack = null; H.sel.clear(); H.q = ''; H.searching = false
    store.set('home.view', view); store.set('home.folder', folder)
    drawer(false)
    if (view === 'assets') { H.assets = H.assets || []; api('/api/assets').then(j => { H.assets = j.assets; if (H.view === 'assets') render() }).catch(() => {}) }
    if (view === 'chats') loadChats()
    render()
    bodyEl.scrollTop = 0
  }
  nav.onclick = e => { const b = e.target.closest('[data-v]'); if (b) go(b.dataset.v) }
  foldersEl.onclick = e => { const b = e.target.closest('[data-folder]'); if (b && !b.querySelector('input')) go('folder', b.dataset.folder) }
  $('.hm-logo').onclick = () => go('recent')

  function openProject(p, version = null) {
    if (!p) return
    if (p.plan) return C.plan(p.id)
    opened[p.id] = Date.now()
    // a Studio project with nothing built yet opens on its scaffold (spec 37)
    if (p.studio && !p.head) { store.set('home.opened', opened); return C.studio(p.id) }
    store.set('home.opened', opened)
    C.open(version || p.head, p.id)
  }
  function open(id) {
    if (H.view === 'trash') return
    if (H.stack) { const p = H.data.projects.find(x => x.id === H.stack); return openProject(p, id) }
    const p = H.data.projects.find(x => x.id === id)
    if (!p) return
    if (p.count > 1) { H.stack = p.id; H.sel.clear(); render(); bodyEl.scrollTop = 0; return }
    openProject(p)
  }

  // ---------- the cards: click opens, Shift/⌘ picks, right-click or … manages
  bodyEl.addEventListener('click', e => {
    const head = e.target.closest('.as-head')
    if (head) return openProject(H.data.projects.find(x => x.id === head.dataset.project))
    const a = e.target.closest('.card.asset')
    if (a) { const p = H.data.projects.find(x => x.id === a.dataset.project); return openProject(p) }
    const c = e.target.closest('.card')
    if (!c) { if (H.sel.size) { H.sel.clear(); renderCards(); renderSelbar() } return }
    if (e.target.closest('.more')) return menuFor(c.dataset.id, e.target.closest('.more'))
    const btn = e.target.closest('[data-act]')
    if (btn) return act(btn.dataset.act, [c.dataset.id])
    if (e.target.closest('.hm-rename')) return
    if ((e.shiftKey || e.metaKey || e.ctrlKey) && !H.stack) {
      const id = c.dataset.id
      if (e.shiftKey && H.last) {
        const ids = shown().map(p => p.id), a = ids.indexOf(H.last), b = ids.indexOf(id)
        if (a >= 0 && b >= 0) for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) H.sel.add(x)
      } else if (H.sel.has(id)) H.sel.delete(id)
      else H.sel.add(id)
      H.last = id
      renderCards(); renderSelbar()
      return
    }
    open(c.dataset.id)
  })
  bodyEl.addEventListener('keydown', e => {
    const c = e.target.closest('.card')
    if (!c || e.target.closest('input')) return
    if (e.key === 'Enter') { e.preventDefault(); c.click() }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !hosted() && !H.stack) { e.preventDefault(); act(H.view === 'trash' ? 'purge' : 'trash', idsFor(c.dataset.id)) }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); menuFor(c.dataset.id, c) }
  })
  bodyEl.addEventListener('contextmenu', e => {
    const c = e.target.closest('.card:not(.asset)')
    if (!c || hosted() || /^p-/.test(c.dataset.id)) return
    e.preventDefault()
    menuFor(c.dataset.id, null, { x: e.clientX, y: e.clientY })
  })
  const idsFor = id => (H.sel.has(id) && H.sel.size > 1 ? [...H.sel] : [id])

  // ---------- menus: the one context menu (Move to opens its own list beside it)
  let menu = null
  function closeMenu() { menu?.off?.(); menu?.el.remove(); menu?.sub?.remove(); menu = null; bodyEl.querySelectorAll('.card.ctx').forEach(c => { c.classList.remove('ctx'); c.querySelector('.sel.tmp')?.remove() }) }
  function showMenu(items, anchor, at) {
    closeMenu()
    const el = document.createElement('div')
    el.className = 'hm-menu'
    el.setAttribute('role', 'menu')
    el.innerHTML = items.map(it => it === '-' ? '<hr>' : `<button role="menuitem" class="${it.red ? 'red' : ''}${it.sub ? ' has-sub' : ''}${it.on ? ' on' : ''}" data-k="${esc(it.k)}">${ic(it.icon, 16)}<span>${esc(it.label)}</span>${it.sub ? `<span class="k">${ic('chr', 14)}</span>` : it.on ? `<span class="k">${ic('check', 14)}</span>` : ''}</button>`).join('')
    document.body.append(el)
    const r = anchor ? anchor.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y }
    const w = el.offsetWidth, h = el.offsetHeight
    let x = anchor ? r.right - w : at.x, y = anchor ? r.bottom + 6 : at.y
    x = Math.max(8, Math.min(innerWidth - w - 8, x)); if (y + h > innerHeight - 8) y = Math.max(8, (anchor ? r.top - 6 : at.y) - h)
    el.style.left = `${x}px`; el.style.top = `${y}px`
    menu = { el, items, sub: null }
    menu.off = window.SwarmUI?.layer(el, closeMenu, { extra: [anchor, '.hm-sub-menu'].filter(Boolean) })
    el.onclick = e => {
      const b = e.target.closest('button[data-k]')
      if (!b) return
      const it = items.find(x => x !== '-' && x.k === b.dataset.k)
      if (it.sub) return it.sub(b)
      closeMenu()
      it.run()
    }
    el.addEventListener('pointerover', e => { const b = e.target.closest('button.has-sub'); if (b) items.find(x => x.k === b.dataset.k)?.sub(b); else if (e.target.closest('button')) { menu?.sub?.remove(); if (menu) menu.sub = null } })
    el.addEventListener('keydown', e => {
      const bs = [...el.querySelectorAll('button')], i = bs.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus() }
      if (e.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) { e.preventDefault(); document.activeElement.click(); menu?.sub?.querySelector('button')?.focus() }
    })
    el.querySelector('button')?.focus({ preventScroll: true })
    return el
  }
  function subMenu(anchorBtn, items) {
    menu.sub?.remove()
    const el = document.createElement('div')
    el.className = 'hm-menu hm-sub-menu'
    el.setAttribute('role', 'menu')
    el.innerHTML = items.map(it => it === '-' ? '<hr>' : `<button role="menuitem" data-k="${esc(it.k)}"${it.on ? ' class="on"' : ''}>${ic(it.icon, 16)}<span>${esc(it.label)}</span>${it.on ? `<span class="k">${ic('check', 14)}</span>` : ''}</button>`).join('')
    document.body.append(el)
    const r = anchorBtn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight
    let x = r.right + 4
    if (x + w > innerWidth - 8) x = r.left - w - 4
    el.style.left = `${Math.max(8, x)}px`; el.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, r.top - 6))}px`
    el.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; const it = items.find(x => x !== '-' && x.k === b.dataset.k); closeMenu(); it.run() }
    el.addEventListener('keydown', e => {
      const bs = [...el.querySelectorAll('button')], i = bs.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); el.remove(); menu.sub = null; anchorBtn.focus() }
    })
    menu.sub = el
  }
  function moveItems(ids) {
    const cur = ids.length === 1 ? H.data.projects.find(p => p.id === ids[0])?.folder : null
    return [
      ...H.data.folders.map(f => ({ k: `f:${f.name}`, icon: 'folder', label: f.name, on: cur === f.name, run: () => act('move', ids, { folder: f.name }) })),
      ...(H.data.folders.length ? ['-'] : []),
      { k: 'new', icon: 'plus', label: 'New folder', run: () => newFolder(ids) },
      ...(ids.some(id => H.data.projects.find(p => p.id === id)?.folder) ? [{ k: 'out', icon: 'x', label: 'No folder', run: () => act('move', ids, { folder: '' }) }] : [])
    ]
  }
  function menuFor(id, anchor, at) {
    if (H.stack) return versionMenu(id, anchor, at)
    if (!H.sel.has(id)) { H.sel.clear(); renderCards(); renderSelbar() }
    const ids = idsFor(id), many = ids.length > 1
    const p = H.data.projects.find(x => x.id === id)
    if (!p) return
    if (H.view === 'trash') return showMenu([
      { k: 'restore', icon: 'restore', label: 'Restore', run: () => act('restore', ids) },
      '-',
      { k: 'purge', icon: 'trash', label: 'Delete forever', red: true, run: () => act('purge', ids) }
    ], anchor, at)
    const items = many ? [
      { k: 'move', icon: 'folder', label: 'Move to', sub: b => subMenu(b, moveItems(ids)) },
      '-',
      { k: 'trash', icon: 'trash', label: 'Delete', red: true, run: () => act('trash', ids) }
    ] : [
      { k: 'open', icon: 'ext', label: 'Open', run: () => open(id) },
      ...(p.planId ? [{ k: 'plan', icon: 'layers', label: 'Open the plan', run: () => C.plan(p.planId) }] : []),
      { k: 'rename', icon: 'type', label: 'Rename', run: () => rename(id) },
      { k: 'dup', icon: 'layers', label: 'Duplicate', run: () => act('duplicate', [id]) },
      { k: 'move', icon: 'folder', label: 'Move to', sub: b => subMenu(b, moveItems(ids)) },
      { k: 'dl', icon: 'download', label: 'Download', run: () => download(p.head) },
      { k: 'show', icon: 'file', label: 'Show in Finder', run: () => post(`/api/projects/${encodeURIComponent(id)}/reveal`, {}).catch(() => {}) },
      '-',
      { k: 'trash', icon: 'trash', label: 'Delete', red: true, run: () => act('trash', ids) }
    ]
    showMenu(items, anchor, at)
    // the card the menu is for wears the selection frame while it is open
    const c = bodyEl.querySelector(`.card[data-id="${CSS.escape(id)}"]`)
    if (c && !many && !c.querySelector('.sel')) { c.classList.add('ctx'); c.querySelector('.cv').insertAdjacentHTML('afterend', '<div class="sel tmp"><i></i><i></i><i></i><i></i></div>') }
  }
  function versionMenu(run, anchor, at) {
    const p = H.data.projects.find(x => x.id === H.stack)
    showMenu([
      { k: 'open', icon: 'ext', label: 'Open', run: () => openProject(p, run) },
      { k: 'split', icon: 'layers', label: 'Make its own project', run: () => act('split', [p.id], { run }) },
      { k: 'dl', icon: 'download', label: 'Download', run: () => download(run) },
      { k: 'show', icon: 'file', label: 'Show in Finder', run: () => post(`/api/projects/${encodeURIComponent(p.id)}/reveal`, { run }).catch(() => {}) }
    ], anchor, at)
  }
  // only the kinds and states the projects really have
  function filterMenu(b) {
    const ps = live()
    const pick = f => () => { H.filter = H.filter === f ? '' : f; store.set('home.filter', H.filter); render() }
    const kinds = KINDS.filter(k => ps.some(p => p.state?.kind === k)).map(k => ({ k: `k:${k}`, icon: KIND_ICON[k], label: k, on: H.filter === `k:${k}`, run: pick(`k:${k}`) }))
    const states = STATUSES.filter(v => ps.some(p => p.state?.status === v)).map(v => ({ k: `s:${v}`, icon: STATUS_ICON[v], label: v, on: H.filter === `s:${v}`, run: pick(`s:${v}`) }))
    showMenu([{ k: 'all', icon: 'grid', label: 'Everything', on: !H.filter, run: pick('') }, '-', ...kinds, ...(states.length ? ['-', ...states] : [])], b)
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.classList.contains('hm-back')) { H.stack = null; render(); return }
    if (b.classList.contains('hm-find')) { H.searching = !(H.searching || H.q); if (!H.searching) H.q = ''; render(); return }
    if (b.classList.contains('hm-grid') || b.classList.contains('hm-list')) { H.layout = b.classList.contains('hm-grid') ? 'grid' : 'list'; store.set('home.layout', H.layout); render(); return }
    if (b.classList.contains('hm-sort')) return showMenu(SORTS.map(([k, label]) => ({ k, icon: k === 'name' ? 'type' : k === 'created' ? 'cal' : 'clock', label, on: H.sort === k, run: () => { H.sort = k; store.set('home.sort', k); render() } })), b)
    if (b.classList.contains('hm-chip')) { H.filter = ''; store.set('home.filter', ''); render(); return }
    if (b.classList.contains('hm-filter')) return filterMenu(b)
    if (b.classList.contains('hm-empty')) return emptyTrash()
  })
  selbar.addEventListener('click', e => {
    const b = e.target.closest('[data-bulk]')
    if (!b) return
    const ids = [...H.sel], k = b.dataset.bulk
    if (k === 'clear') { H.sel.clear(); render(); return }
    if (k === 'move') { showMenu(moveItems(ids).map(it => it === '-' ? it : it), b); return }
    act(k, ids)
  })

  // ---------- actions
  async function act(op, ids, extra = {}) {
    if (!ids.length) return
    if (op === 'purge') { if (await confirmDelete(ids.length, false)) purge(ids); return }
    try {
      const out = await post('/api/projects', { op, ids, ...extra })
      H.data = { folders: out.folders, projects: out.projects }
      H.sel.clear()
      if (op === 'split' && H.stack && !H.data.projects.find(p => p.id === H.stack && p.count > 1)) H.stack = null
      render()
      if (op === 'trash') toast(`${ic('trash', 15)}<span>${ids.length > 1 ? `${ids.length} in Trash` : 'In Trash'}</span>`, 'Undo', () => act('restore', ids))
      if (op === 'duplicate' && out.id) setTimeout(() => rename(out.id), 50)
    } catch (err) { toast(`<span>${esc(err.body?.error || err.message)}</span>`) }
  }
  // Delete forever and Empty Trash cannot be undone: the button stays off until "delete" is typed
  function confirmDelete(n, all) {
    return new Promise(resolve => {
      const ui = window.SwarmUI
      if (!ui) return resolve(prompt('Type delete to delete for good') === 'delete')
      let ok = false
      const d = ui.dialog({
        title: all ? 'Empty Trash?' : `Delete ${n > 1 ? `${n} projects` : 'this project'} for good?`,
        desc: `${n > 1 || all ? `${n} project${n > 1 ? 's' : ''} and their files` : 'Its files'} can't be brought back. Type <b>delete</b> to confirm.`,
        body: '<input class="ui-input hm-typed" autocomplete="off" spellcheck="false" aria-label="Type delete to confirm" placeholder="delete">',
        footer: `<button class="ui-btn ui-btn-ghost ui-btn-sm hm-no">Cancel</button><button class="ui-btn ui-btn-destructive ui-btn-sm hm-yes" disabled>${all ? 'Empty Trash' : 'Delete'}</button>`,
        onClose: () => resolve(ok)
      })
      const typed = d.el.querySelector('.hm-typed'), yes = d.footer.querySelector('.hm-yes')
      const ready = () => typed.value.trim().toLowerCase() === 'delete'
      typed.oninput = () => { yes.disabled = !ready() }
      typed.onkeydown = e => { if (e.key === 'Enter' && ready()) { ok = true; d.close('ok') } }
      d.footer.querySelector('.hm-no').onclick = () => d.close('cancel')
      yes.onclick = () => { if (ready()) { ok = true; d.close('ok') } }
      setTimeout(() => typed.focus(), 30)
    })
  }
  async function emptyTrash() {
    const n = H.data.projects.filter(p => p.trashed).length
    if (n && (await confirmDelete(n, true))) purge(null)
  }
  // Delete forever (ids) or Empty Trash (null), once confirmed: the toast says how many went. A project the
  // server could not remove (a file in it held open) stays in Trash, named, with Retry; so does a failed call
  async function purge(ids) {
    let out
    try { out = await post('/api/projects', ids ? { op: 'purge', ids } : { op: 'empty' }) } catch (err) {
      toast(`<span>${esc(err.body?.error || err.message)}</span>`, 'Retry', () => purge(ids))
      return
    }
    H.data = { folders: out.folders, projects: out.projects }
    H.sel.clear()
    closeMenu()
    render()
    const n = out.removed || 0, failed = out.failed || []
    const gone = n ? `${n} project${n > 1 ? 's' : ''} deleted forever` : ''
    if (!failed.length) return toast(`${ic('check', 15)}<span>${gone || 'Nothing to delete'}</span>`)
    const held = failed.every(f => f.code === 'EBUSY' || f.code === 'EPERM')
    const kept = failed.length > 1 ? `${failed.length} stayed in Trash` : `${failed[0].title} stayed in Trash`
    toast(`<span>${gone ? `${gone}. ` : ''}${esc(kept)}: ${esc(held ? 'a file in it is open' : failed[0].error)}</span>`, 'Retry', () => purge(failed.map(f => f.id)))
  }
  async function download(run) {
    toast(`${ic('download', 15)}<span>Preparing</span>`)
    try {
      const r = await sw.api(`/api/runs/${encodeURIComponent(run)}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'export failed')
      const z = await sw.api(`/api/runs/${encodeURIComponent(run)}/export.zip`)
      if (!z.ok) throw new Error('export failed')
      const name = (z.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'build.zip'
      const url = URL.createObjectURL(await z.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      toast(`${ic('check', 15)}<span>${esc(name)}</span>`)
    } catch (err) { toast(`<span>${esc(err.message)}</span>`) }
  }

  // ---------- inline names: a project, a new folder, a folder renamed
  function inlineName(host, value, done) {
    const was = host.innerHTML
    host.innerHTML = `<input class="hm-rename" value="${esc(value)}" maxlength="80" aria-label="Name">`
    const i = host.querySelector('input')
    i.focus(); i.select()
    let over = false
    const finish = save => { if (over) return; over = true; const v = i.value.trim(); host.innerHTML = was; if (save && v && v !== value) done(v); else if (save === 'blank') done(null) }
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true) } if (e.key === 'Escape') { e.preventDefault(); finish(false) } }
    i.onblur = () => finish(true)
    i.onclick = e => e.stopPropagation()
  }
  function rename(id) {
    const b = bodyEl.querySelector(`.card[data-id="${CSS.escape(id)}"] .nm b`)
    const p = H.data.projects.find(x => x.id === id)
    if (!b || !p) return
    inlineName(b, p.title, v => act('rename', [id], { title: v }))
  }
  function newFolder(ids = []) {
    const row = document.createElement('div')
    row.className = 'nv'
    row.innerHTML = `${ic('folder')}<span></span>`
    foldersEl.append(row)
    const span = row.querySelector('span')
    span.textContent = ''
    span.innerHTML = '<input class="hm-rename" maxlength="40" aria-label="Folder name">'
    const i = span.querySelector('input')
    i.focus()
    let over = false
    const finish = async save => {
      if (over) return; over = true
      const v = i.value.trim()
      row.remove()
      if (!save || !v) return
      await post('/api/folders', { op: 'add', name: v }).catch(() => {})
      if (ids.length) await act('move', ids, { folder: v })
      else await refresh()
    }
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false) }
    i.onblur = () => finish(true)
  }
  $('.hm-addf').onclick = () => newFolder()
  foldersEl.addEventListener('contextmenu', e => {
    const b = e.target.closest('[data-folder]')
    if (!b) return
    e.preventDefault()
    const name = b.dataset.folder
    showMenu([
      { k: 'rename', icon: 'type', label: 'Rename', run: () => inlineName(b.querySelector('span'), name, async v => { await post('/api/folders', { op: 'rename', from: name, to: v }); if (H.folder === name) { H.folder = v; store.set('home.folder', v) } refresh() }) },
      '-',
      { k: 'del', icon: 'trash', label: 'Delete folder', red: true, run: async () => { await post('/api/folders', { op: 'delete', name }); if (H.folder === name) go('recent'); refresh() } }
    ], null, { x: e.clientX, y: e.clientY })
  })

  // ---------- drag a card onto a folder (or onto Trash)
  bodyEl.addEventListener('dragstart', e => {
    const c = e.target.closest('.card[draggable="true"]')
    if (!c || H.stack) return e.preventDefault()
    const ids = idsFor(c.dataset.id)
    e.dataTransfer.setData('application/x-swarm-projects', JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
    const img = c.querySelector('.cv')
    if (img) e.dataTransfer.setDragImage(img, 40, 30)
    root.classList.add('dragging')
  })
  bodyEl.addEventListener('dragend', () => { root.classList.remove('dragging'); side.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')) })
  const dropTarget = e => e.target.closest('.hm-folders [data-folder], .hm-nav [data-v="trash"]')
  side.addEventListener('dragover', e => {
    const t = dropTarget(e)
    if (!t || !e.dataTransfer.types.includes('application/x-swarm-projects')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    side.querySelectorAll('.drop').forEach(x => x !== t && x.classList.remove('drop'))
    t.classList.add('drop')
  })
  side.addEventListener('dragleave', e => { const t = dropTarget(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop') })
  side.addEventListener('drop', e => {
    const t = dropTarget(e)
    if (!t) return
    e.preventDefault()
    t.classList.remove('drop')
    root.classList.remove('dragging')
    let ids = []
    try { ids = JSON.parse(e.dataTransfer.getData('application/x-swarm-projects')) } catch {}
    if (t.dataset.v === 'trash') act('trash', ids)
    else act('move', ids, { folder: t.dataset.folder })
  })

  // ---------- the one input: pick what to make (Website, App, Game, Video), then Make.
  // A website builds live on the canvas; App, Game and Video run the steps they need, one after another.
  const MAKES = [
    { k: 'site', icon: 'site', label: 'Website' },
    { k: 'app', icon: 'code', label: 'App', only: ['app', 'data', 'deploy'], games: 'none' },
    { k: 'game', icon: 'game', label: 'Game', only: ['app', 'games', 'deploy'], games: 'big' },
    { k: 'video', icon: 'film', label: 'Video', only: ['review', 'video'], games: 'none' },
    // spec 37: a brand on its own (its Lock is the end), and a deck once its kit registers itself
    { k: 'brand', icon: 'sliders', label: 'Brand' },
    { k: 'deck', icon: 'layers', label: 'Deck', kit: true }
  ]
  // a kind whose kit has not landed yet is not shown (docs/ux/RULES.md rule 6)
  const offered = () => MAKES.filter(m => !m.kit || window.swarmKits?.[m.k])
  let make = offered().find(m => m.k === store.get('home.make', 'site')) || MAKES[0]
  const kindBtn = $('.hm-kind')
  const showKind = () => { kindBtn.innerHTML = `${ic(make.icon, 16)}<span>${make.label}</span>${ic('chd', 14)}` }
  showKind()
  if (hosted()) kindBtn.hidden = true  // the hosted studio makes websites only
  // the way to begin last picked for a kind (Make's menu pre-selects it). The Studio's depth (what Grill
  // me was) is Light or Thorough, kept from before; the menu does not ask it.
  const modeOf = k => store.get(`home.mode.${k}`, null)
  let depth = store.get('home.depth', 'light') === 'thorough' ? 'thorough' : 'light'
  kindBtn.onclick = () => { showKind(); return showMenu([
    // only things to make (how pictures are made is Setup's, not a kind)
    ...offered().map(m => ({ k: m.k, icon: m.icon, label: m.label, on: m === make, run: () => { make = m; store.set('home.make', m.k); showKind(); closePop(); showIdeas(); input.focus() } })),
  ], kindBtn) }

  // what the Make box asks the server for once: the showcases and the interview (engine/intake.mjs)
  let intakeP = null
  const intake = () => (intakeP ||= api('/api/intake').catch(() => { intakeP = null; return { showcases: [], questions: [], words: 12 } }))

  // start a build: a website builds live on the canvas; App, Game and Video run their steps in order
  async function start(text, run = make.k === 'site' ? null : { games: make.games, only: make.only }, sets = {}, chat = null) {
    closePop()
    if (!run || hosted()) {
      input.value = ''
      // The project opens on the build this box started. The canvas may still hold the build before
      // it (the server replays its last run to every canvas), and a project never lets a run that
      // started elsewhere take it over, so the new run is handed to it by id.
      const made = await sw.submit(text, false, null, null, chat ? { ...sets, chat } : sets)
      if (made === null && hosted()) return // refused (a limit, the name dialog closed): its dialog says why
      // A website the crew has just started opens in the Design deck, the one room where the swarm
      // can be watched at work (its Follow camera is on for a new build). Back shows the project's
      // Overview, as from any room. The hosted studio keeps its Overview.
      if (typeof made === 'string') return C.started(made)
      // Not started: Projects stays, with the words back in the box. Another build running is
      // shown on the deck on request; anything else has said why in the chat (Hermes, a talk)
      if (!input.value) input.value = text
      if (made?.busy) toast('<span>A build is running. Yours can start when it ends.</span>', made.run ? 'Watch it' : null, made.run ? () => C.started(made.run, { room: 'deck' }) : null)
      return
    }
    try {
      // App and Video start with the same page design as a website (engine/auto.mjs design step), so
      // they open the same way: the new build's project, then the Design deck while the crew designs.
      // The reply names that build's run; without it the project would show the build before it.
      sw.talk?.end()
      const job = await post('/api/auto', { prompt: text, ...run, ...(chat ? { chat } : {}) })
      input.value = ''
      // the canvas is handed the new build by id, so it follows that build when it starts streaming
      if (job?.run) C.started(job.run, { room: 'deck' })
      else C.open(null)
    } catch (err) { toast(`<span>${esc(err.body?.error || err.message)}</span>`) }
  }

  // Make: one small menu of the kind's ways to make it (web/makeways.js, docs/specs/42-ways-to-make.md): Just
  // build, Guided, Three takes, Scaffold, Studio, as the kind offers them; a kind with one way goes straight
  // there. The last way picked for this kind, else what the words suggest, is pre-selected, quietly.
  const makeBtn = $('.hm-make')
  form.onsubmit = e => {
    e.preventDefault()
    const text = input.value.trim()
    closePop()
    // the hosted studio builds websites as it always did
    if (hosted()) return text ? confirmBuild(text) : input.focus()
    const ways = makeWays(make.k, !!text)
    if (ways.length === 1) return begin(ways[0], text)
    const fit = make.k === 'game' ? 'guided' : text && !studioFits(text) ? 'now' : 'studio'
    const pick = [makeModeOf(modeOf(make.k)), fit].find(k => ways.some(w => w.k === k)) || ways[0].k
    showMenu(ways.map(w => ({ k: w.k, icon: w.icon, label: w.label, on: w.k === pick, run: () => begin(w, text) })), makeBtn)
    document.querySelector('.hm-menu button.on, .hm-menu button')?.focus({ preventScroll: true })
  }
  async function begin(way, text) {
    // no Hermes to answer the model: one calm line and what to do, before anything starts (the words stay)
    const off = !sw.hermesReady ? null : await sw.hermesReady()
    if (off) return toast(`<span>${esc(off.message)} ${esc(String(off.action || '').replace(/`/g, ''))}</span>`, 'Check again', () => begin(way, text))
    G.sheet = false
    store.set(`home.mode.${make.k}`, way.k)
    if (way.k === 'now') return buildNow(text)
    // a game's questions are its Plan board's talk (spec 27); the rest ask in Make's pop, then the brief
    if (way.k === 'guided' && make.k === 'game') { input.value = ''; return C.talkGame({ text }) }
    if (way.k === 'guided') return guide(text)
    return studioFirst(text, way)
  }

  // ---------- Studio or Build now (spec 37)
  // the Studio fits a game, a vague idea, or one where the look matters
  const LOOKS = /\b(look|feel|vibe|mood|brand(ing)?|style|aesthetic|colou?rs?|logo|palette|typography|font|premium|elegant|beautiful|moody|minimal|bold)\b/i
  function studioFits(text) {
    if (make.k === 'game') return true
    const words = text.split(/\s+/).filter(Boolean).length
    return words < 8 || LOOKS.test(text)
  }
  function buildNow(text) {
    closePop()
    // a game skipped its Plan board; the talk's Build still starts it (nothing builds without a press)
    confirmBuild(text)
  }
  // Three takes, Scaffold or Studio (spec 42): a Studio project made in that mode, opened beside its chat (an
  // empty box's chat asks what it is first). Three takes opens on its looks (web/scaffold.js); Scaffold has
  // only its Plan step. A game's is its Plan board. Without a kit (the hosted studio):
  // the brand sheet, the talk, or Thorough's questions first
  async function studioFirst(text, way = { k: 'studio' }) {
    closePop()
    if (make.k === 'game') { input.value = ''; return C.talkGame({ text }) }
    // a kind with a Studio kit (spec 37): its project is made now, and its scaffold opens beside the chat
    if (!hosted() && window.swarmKits?.[make.k]) {
      try {
        const kit = window.swarmKits[make.k]
        const j = await post('/api/studio', { kind: make.k, idea: text, mode: way.k, depth, steps: way.steps || kit.steps })
        input.value = ''
        return C.studio(j.project.id, way.step || makeStudioStep(make.k))
      } catch (err) { return toast(`<span>${esc(err.body?.error || err.message)}</span>`) }
    }
    if (make.k === 'brand') { input.value = ''; return window.swarmCosmos?.brand?.({ brief: text, kind: 'site' }) }
    if (make.k === 'video') return talkFirst(text)
    if (depth === 'thorough') { G.sheet = true; return guide(text) }
    confirmBuild(text, undefined, {}, null, true)
  }

  // ---------- talk first: a new project with nothing built opens in the Design deck, and Hermia
  // (the planner) talks it through in its chat. The person's words are the first message; Build
  // there writes the brief to read and edit, and only its Build starts the crew.
  // Before a build spends tokens: what it is about to make, in its own words, with Build and Keep
  // talking (the deck's chat, engine/talkplan.mjs for the talk). Nothing starts until Build.
  // The hosted studio's guests are limited already, and build as they always did.
  function confirmBuild(text, run = make.k === 'site' ? null : { games: make.games, only: make.only }, sets = {}, steps = null, sheet = false) {
    if (hosted() || !sw.talk) return start(text, run, sets)
    closePop()
    input.value = ''
    C.project = null
    C.go('station', 'canvas')
    C.chat(true)
    const kind = !run ? 'site' : run.games === 'big' ? 'game' : guideKind() === 'film' ? 'film' : 'app'
    const what = steps?.length ? steps.join(' · ') : { site: 'Website', app: 'App', game: 'Game', film: 'Video' }[kind]
    sw.talk.start({ kind, blank: true, brief: text, what, sheet, build: (brief, chat) => start(brief, run, sets, chat) })
  }
  function talkFirst(text) {
    const run = make.k === 'site' ? null : { games: make.games, only: make.only }
    const sets = G.guided ? guideSets(G.answers, G.qs) : {}
    closePop()
    input.value = ''
    C.project = null
    C.go('station', 'canvas')
    C.chat(true)
    sw.talk.start({ text, kind: guideKind(), blank: true, build: (brief, chat) => start(brief, run, sets, chat) })
  }
  // an answer in your own words that is a question, or says not to build yet, is not brief text:
  // the talk opens with the prompt, the answers so far and those words (null when it is an answer)
  async function answerTalks(v, q) {
    if (!v || hosted() || !sw.readTalk || q.chips.includes(v)) return false
    if (!/\?/.test(v) && v.split(/\s+/).length < 5) return false
    if ((await sw.readTalk(v, q.q, guideKind())) === 'build') return false
    talkFirst([G.guided ? guideBrief(G.text, G.answers, G.qs) : G.text, v].filter(Boolean).join('\n\n'))
    return true
  }

  // ---------- the pop under the Make box: the showcases, or the interview. One at a time;
  // it closes with ×, Esc and a click outside, and the prompt stays in the box.
  const pop = $('.hm-pop'), ideasBtn = $('.hm-ideas')
  let popOff = null
  function openPop(cls, html) {
    pop.className = `hm-pop ${cls}`
    pop.innerHTML = `<button type="button" class="ib hm-pop-x" aria-label="Close">${ic('x', 16)}</button>${html}`
    pop.style.top = `${form.offsetTop + form.offsetHeight + 8}px`
    pop.hidden = false
    pop.querySelector('.hm-pop-x').onclick = closePop
    if (!popOff) popOff = window.SwarmUI?.layer(pop, closePop, { extra: [form] })
  }
  function closePop() { popOff?.(); popOff = null; pop.hidden = true; pop.innerHTML = ''; ideasBtn.classList.remove('on') }

  // the lightbulb's examples (only when it is pressed): a few for the kind picked, headed Examples, one
  // click puts the words in the box to edit. No packs, no samples by name, no prices, no step chips.
  const EXAMPLES = { site: 'site', app: 'app', game: 'game', video: 'film', brand: 'brand' }
  const exampleKey = () => (hosted() ? 'site' : EXAMPLES[make.k] || null)
  // a kind with no examples has no lightbulb
  function showIdeas() { ideasBtn.hidden = !exampleKey() }
  showIdeas()
  async function showcases() {
    if (!pop.hidden && pop.classList.contains('show')) return closePop()
    const key = exampleKey()
    const list = key ? ((await intake()).starters?.[key] || []).slice(0, 4) : []
    if (!list.length) return input.focus()
    openPop('show', `<h3>Examples</h3><div class="hm-show" role="list" aria-label="Examples">${list.map((p, i) => `<button type="button" class="hm-sc hm-st" role="listitem" data-st="${i}">${ic('idea', 18)}<span class="nm">${esc(p)}</span>${ic('chr', 15)}</button>`).join('')}</div>`)
    ideasBtn.classList.add('on')
    pop.querySelector('.hm-sc')?.focus({ preventScroll: true })
    for (const b of pop.querySelectorAll('.hm-sc')) b.onclick = () => {
      input.value = list[Number(b.dataset.st)]
      closePop()
      input.focus()
      input.setSelectionRange?.(input.value.length, input.value.length)
    }
  }
  ideasBtn.onclick = () => showcases()

  // the guided prompt (docs/specs/06-onboarding.md): the questions the prompt has not answered, one at a
  // time (chips or your own words), then the brief, one short paragraph to edit, then the build.
  // A Game asks the game interview in the same pop (QUESTIONS in engine/game.mjs), then its Plan board.
  const guideKind = () => (hosted() ? 'site' : { site: 'site', app: 'app', video: 'film', game: 'game' }[make.k] || 'site')
  async function guide(text) {
    const d = await intake()
    const qs = guidePending(d.guides?.[guideKind()] || [], text)
    if (!qs.length) return confirmBuild(text, undefined, {}, null, !!G.sheet)
    Object.assign(G, { text, qs, i: 0, answers: {}, plan: false, guided: true })
    drawGrill()
  }
  // guide:start: the same as pending, guideBrief and guideSets in engine/intake.mjs (tests/intake.test.mjs runs both)
  function guidePending(qs, text) {
    const left = qs.filter(q => !(q.covers && new RegExp(q.covers, 'i').test(String(text || ''))))
    return left.some(q => !q.sets) ? left : []
  }
  function guideBrief(prompt, answers, qs) {
    const base = String(prompt || '').trim()
    const said = qs.filter(q => !q.sets)
      .map(q => [q.label || q.q.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, ''), String(answers[q.id] || '').trim()])
      .filter(([, v]) => v && !/^(surprise me|nothing in particular)$/i.test(v))
      .map(([k, v]) => `${k}: ${v.replace(/[.\s]+$/, '')}.`)
    return [base && !/[.!?]$/.test(base) && said.length ? `${base}.` : base, ...said].filter(Boolean).join(' ')
  }
  function guideSets(answers, qs) {
    const chips = { Painted: 'painted', 'Stock photos': 'stock', Drawn: 'drawn' }, out = {}
    for (const q of qs) if (q.sets === 'pictures' && chips[answers[q.id]]) out.pictures = chips[answers[q.id]]
    return out
  }
  // guide:end
  const G = { text: '', qs: [], i: 0, answers: {}, plan: false, guided: false, sheet: false }
  async function grill(text) {
    const d = await intake()
    const plan = make.k === 'game' && d.plan?.length && !hosted()
    const qs = plan ? d.plan : make.k === 'game' && d.game?.length ? d.game : d.questions || []
    if (!qs.length) return confirmBuild(text)
    Object.assign(G, { text, qs, i: 0, answers: {}, plan, guided: false })
    drawGrill()
  }
  function brief() {
    const lines = G.qs.map(q => [q.label || q.q.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, ''), String(G.answers[q.id] || '').trim()])
      .filter(([, v]) => v && !/^(surprise me|nothing in particular)$/i.test(v)).map(([k, v]) => `- ${k}: ${v}`)
    return lines.length ? `${G.text}\n\nLocked with the person (build exactly this):\n${lines.join('\n')}` : G.text
  }
  function drawGrill() {
    const q = G.qs[G.i], val = G.answers[q.id] || '', last = G.i === G.qs.length - 1
    openPop('grill', `<div class="hm-dots" aria-label="Question ${G.i + 1} of ${G.qs.length}">${G.qs.map((_, i) => `<i class="${i < G.i ? 'done' : i === G.i ? 'on' : ''}"></i>`).join('')}</div>
      <h3>${esc(q.q)}</h3>
      <div class="hm-chips">${q.chips.map(c => `<button type="button" class="${val === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <input class="hm-free" aria-label="Your own words" placeholder="Or in your own words" maxlength="300" value="${q.chips.includes(val) ? '' : esc(val)}">
      <div class="hm-gfoot">${G.i ? `<button type="button" class="btn ghost" data-back>${ic('chl', 14)}Back</button>` : '<span></span>'}<span><button type="button" class="btn ghost" data-skip>${G.plan ? 'Just plan' : 'Just build'}</button><button type="button" class="btn pri" data-next>${last && !G.guided ? (G.plan ? 'Plan' : 'Build') : 'Next'}</button></span></div>`)
    const free = pop.querySelector('.hm-free')
    const take = v => { if (v) G.answers[q.id] = v; else delete G.answers[q.id] }
    const done = () => (G.plan ? toPlan() : G.guided ? drawBrief() : start(brief()))
    const next = async () => { const v = free.value.trim(); if (await answerTalks(v, q)) return; take(v || G.answers[q.id]); if (!last) { G.i++; drawGrill() } else done() }
    for (const b of pop.querySelectorAll('[data-c]')) b.onclick = () => { take(b.dataset.c); free.value = ''; next() }
    free.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next() } }
    pop.querySelector('[data-next]').onclick = next
    // Just build means now: no brief step, the unanswered questions take their defaults
    pop.querySelector('[data-skip]').onclick = async () => { const v = free.value.trim(); if (await answerTalks(v, q)) return; take(v || G.answers[q.id]); G.guided ? build(guideBrief(G.text, G.answers, G.qs)) : done() }
    pop.querySelector('[data-back]')?.addEventListener('click', () => { G.i--; drawGrill() })
    free.focus({ preventScroll: true })
  }

  // the brief before the build: one short paragraph, editable; Build starts it
  const build = text => start(text, undefined, guideSets(G.answers, G.qs))
  function drawBrief() {
    const text = guideBrief(G.text, G.answers, G.qs)
    openPop('grill', `<div class="hm-dots" aria-label="The brief">${G.qs.map(() => '<i class="done"></i>').join('')}<i class="on"></i></div>
      <h3>The brief</h3>
      <textarea class="hm-free hm-brief" aria-label="The brief" maxlength="4000" rows="4">${esc(text)}</textarea>
      <div class="hm-gfoot"><button type="button" class="btn ghost" data-back>${ic('chl', 14)}Back</button><span>${!G.sheet && !hosted() && (guideKind() === 'site' || guideKind() === 'app') ? '<button type="button" class="btn ghost" data-sheet>Brand sheet</button>' : ''}<button type="button" class="btn ghost" data-talk>Keep talking</button><button type="button" class="btn pri" data-go>${G.sheet ? `${ic('chr', 16)}Brand sheet` : `${ic('up', 16)}Build`}</button></span></div>`)
    const box = pop.querySelector('.hm-brief')
    // in the Studio (spec 37) the brief goes on to the brand sheet; Build is the talk's, after it
    const go = () => { const t = box.value.trim(); if (t) G.sheet ? confirmBuild(t, undefined, guideSets(G.answers, G.qs), null, true) : build(t) }
    pop.querySelector('[data-go]').onclick = go
    pop.querySelector('[data-talk]').onclick = () => { const t = box.value.trim(); if (t) talkFirst(t) }
    // the brand sheet first (spec 31): the brief goes to the chat, the sheet opens beside it
    pop.querySelector('[data-sheet]')?.addEventListener('click', () => { const t = box.value.trim(); if (t) confirmBuild(t, undefined, guideSets(G.answers, G.qs), null, true) })
    box.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go() } }
    pop.querySelector('[data-back]').onclick = () => { G.i = G.qs.length - 1; drawGrill() }
    box.focus({ preventScroll: true })
  }

  // the answers become a plan, and the Plan board opens with the crew writing its cards (spec 21)
  async function toPlan() {
    try {
      const id = await C.planView.create(G.text, G.answers)
      closePop()
      input.value = ''
      C.plan(id, true)
    } catch (err) { toast(`<span>${esc(err.body?.error || err.message)}</span>`) }
  }

  // ---------- you: theme, sound and models live in your menu; the globe opens the Feed
  $('.hm-who').onclick = e => {
    const light = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light'
    const sound = sw.sound?.() || 'muted', who = e.currentTarget
    showMenu([
      { k: 'theme', icon: light ? 'moon' : 'sun', label: light ? 'Dark' : 'Light', run: () => sw.theme?.() },
      // the crew's voices and sounds (web/chatter.js), the same switch as ☰ → Crew sound; ✓ while on
      { k: 'sound', icon: 'sound', label: 'Crew sound', on: sound === 'on', run: () => sw.sound?.(sound === 'on' ? 'muted' : 'on') },
      ...(hosted() ? [] : [{ k: 'models', icon: 'sliders', label: 'Models', run: () => sw.models?.(who) }, { k: 'setup', ...($('.hm-who').classList.contains('warn') ? { icon: 'alert' } : { icon: 'check' }), label: 'Setup', run: () => setup.open() },
        // what the studio is connected to and where its data goes (docs/specs/25-connections.md)
        { k: 'settings', icon: 'link', label: 'Settings', run: () => openSettings({ sw, esc }) }])
    ], who)
  }

  // ---------- phones: the sidebar is a drawer
  const scrim = $('.hm-scrim')
  let offDrawer = null
  function drawer(on) {
    root.classList.toggle('drawer', on)
    scrim.hidden = !on
    offDrawer?.(); offDrawer = null
    if (on) offDrawer = window.SwarmUI?.layer(side, () => drawer(false), { extra: ['.hm-burger', '.hm-menu'] })
  }
  $('.hm-burger').onclick = () => drawer(!root.classList.contains('drawer'))
  scrim.onclick = () => drawer(false)

  // ---------- a small toast: what happened, and Undo when it can be undone
  let toastEl = null
  function toast(html, action, fn) {
    toastEl?.remove()
    const t = toastEl = document.createElement('div')
    t.className = 'hm-toast'
    t.setAttribute('role', 'status')
    t.innerHTML = `${html}${action ? `<button class="btn ghost sm">${esc(action)}</button>` : ''}`
    root.append(t)
    if (action) t.querySelector('button').onclick = () => { t.remove(); fn() }
    setTimeout(() => t.remove(), action ? 6000 : 3000)
  }

  addEventListener('keydown', e => {
    if (!H.on || e.defaultPrevented) return
    if (e.key === 'Escape' && !window.SwarmUI?.open?.()) {
      if (H.sel.size) { H.sel.clear(); render(); e.preventDefault() }
      else if (H.stack) { H.stack = null; render(); e.preventDefault() }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !e.target.closest('input, textarea') && !H.stack && H.view !== 'assets') { e.preventDefault(); for (const p of shown()) H.sel.add(p.id); render() }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.target.closest('input, textarea')) { e.preventDefault(); H.searching = true; render() }
  })

  // START on the Feed's /studio page hands its prompt over as ?prompt=. That press was the go:
  // the build starts here at once, with no second Make and no questions. The prompt leaves the
  // address so a reload does not spend another build. A studio that is closed for the day keeps it in the box.
  let given = hosted() ? (new URLSearchParams(location.search).get('prompt') || '').trim().slice(0, window.SWARM?.hosted?.limits?.promptChars || 500) : ''
  function handover() {
    const text = given
    given = ''
    if (!text) return
    const u = new URL(location.href)
    u.searchParams.delete('prompt')
    history.replaceState(history.state, '', u)
    if (window.SWARM?.hosted?.open === false) { input.value = text; return }
    start(text, null)
  }

  return {
    el: root,
    get data() { return H.data },
    refresh,
    show() {
      root.hidden = false
      H.on = true
      if (!H.me) loadMe()
      refresh()
      if (given) setTimeout(handover, 0) // after this view change has finished
      if (!setupAsked && !hosted()) { setupAsked = true; setup.first() }
      setTimeout(() => { if (H.on && innerWidth > 760 && !document.activeElement?.closest('input, textarea')) input.focus({ preventScroll: true }) }, 60)
    },
    hide() { H.on = false; clearTimeout(H.timer); closeMenu(); closePop(); drawer(false); root.hidden = true }
  }
}
