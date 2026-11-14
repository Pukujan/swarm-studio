// The brand sheet (docs/specs/31-brand-sheet.md): a website's or app's story, palette and type, side by
// side, before any page is designed. The same board as the game's Plan board (web/plan.js): sections of
// artboards on the dotted stage, the inspector on the right only while something is selected, and the
// top bar's one primary button, Lock. The chat stays on the left; Build there builds from the locked sheet.
import { ic, cursor } from './icons.js'
import { makeBoard } from './board.js'

export function makeBrand({ sw, C, root }) {
  const esc = sw.esc
  const B = { on: false, chat: null, project: null, brand: null, theme: null, packs: [], sel: null, framed: false, done: null, busy: false }

  // the stage, camera, inspector, Esc and toast are the shared board (web/board.js)
  const bd = makeBoard({ root, cls: 'project plan brand-sheet', label: 'Brand sheet', fit: [0.35, 1], on: () => B.on, selected: () => !!B.sel, clear: () => select(null) })
  const { stage, world, insp } = bd
  const applyCam = bd.applyCam, toast = bd.toast, frameAll = () => bd.frameAll(false)

  // ---------- the top bar: Projects › the project (or the chat) › Brand, and Lock
  const bar = document.querySelector('.topbar')
  const crumb = document.createElement('div')
  crumb.className = 'br-crumb'
  crumb.innerHTML = `<button class="br-home">Projects</button>${ic('chr', 14)}<button class="br-up">Chat</button>${ic('chr', 14)}<b class="br-name">Brand</b>`
  bar?.querySelector('.spacer')?.before(crumb)
  crumb.querySelector('.br-home').onclick = () => C.home()
  crumb.querySelector('.br-up').onclick = () => back()
  const primary = document.createElement('button')
  primary.className = 'toggle br-primary pri'
  primary.innerHTML = '<span class="t">Lock</span>'
  bar?.querySelector('.spacer')?.after(primary)
  primary.onclick = () => (B.brand?.lockedAt ? call('unlock') : lock())

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  const take = v => { B.chat = v.chat; B.brand = v.brand; B.theme = v.theme; B.packs = v.packs || []; fonts(); render() }
  // a chat's sheet, or a Studio project's own brand (spec 37), on the same routes
  const base = () => (B.project ? `/api/projects/${encodeURIComponent(B.project)}/brand` : `/api/brand/${encodeURIComponent(B.chat)}`)
  const call = (what, body) => post(`${base()}/${what}`, body).then(take).catch(err => toast(err.message))
  async function lock() {
    await call('lock')
    if (!B.brand?.lockedAt) return
    B.done?.(B.chat, true)
    back()
  }
  // back to the chat it came from, or to the Studio's scaffold
  function back() { if (B.project) C.up(); else C.go('station', 'canvas') }

  // the type options' fonts, so each pairing shows as itself
  const loaded = new Set()
  function fonts() {
    const fam = f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`
    const want = [...(B.brand?.types || []), ...B.packs.map(k => k.type)].flatMap(t => [t.heading, t.body]).filter(f => f && !loaded.has(f))
    if (!want.length) return
    want.forEach(f => loaded.add(f))
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${[...new Set(want)].map(fam).join('&')}&display=swap`
    document.head.append(link)
  }

  // ---------- render
  const sel = key => B.sel === key ? '<div class="sel"><i></i><i></i><i></i><i></i></div>' : ''
  const palOf = () => (B.brand?.palettes || []).find(p => p.id === B.brand.pick?.palette) || B.brand?.palettes?.[0]
  const typeOf = () => (B.brand?.types || []).find(t => t.id === B.brand.pick?.type) || B.brand?.types?.[0]
  // a sample: a heading, a line, a button and a link, in a palette and type
  const sample = (p, t, dark) => {
    const bg = dark ? p.text : p.bg, fg = dark ? p.bg : p.text
    return `<div class="br-sample" style="--s-bg:${p.bg};--s-fg:${p.text};background:${bg};color:${fg}">
      <b style="font-family:'${esc(t.heading)}'">${esc(headline())}</b>
      <span style="font-family:'${esc(t.body)}'">${esc(line())}</span>
      <div><i class="br-btn" style="background:${p.accent};color:${onColour(p.accent)};font-family:'${esc(t.body)}'">Join</i><u style="color:${dark ? p.bg : p.link};font-family:'${esc(t.body)}'">Read more</u></div></div>`
  }
  // the story's first clause, cut at a word
  const headline = () => { const h = (B.brand?.story?.what || 'Your site').split(/[,.:;]/)[0].trim(); return h.length <= 44 ? h : h.slice(0, 45).replace(/\s+\S*$/, '') }
  const line = () => B.brand?.story?.who ? `For ${B.brand.story.who}`.slice(0, 70) : 'A first line of the page.'
  const onColour = h => { const n = parseInt(String(h).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff' }

  // while the options are made: the sheet's own sections at their own sizes, empty, with the planner's
  // cursor on the first card (as the Plan board shows the crew writing), so nothing moves when they come
  const skeleton = () => {
    const wait = (cls, n, cur = '') => Array.from({ length: n }, (_, i) => `<div class="ab ${cls} br-wait" aria-hidden="true"><div class="pl-work"></div>${i ? '' : cur}</div>`).join('')
    return `<div class="col">
      <section class="pj-sec br-story"><span class="al">Story</span><div class="abs">${wait('pcard', 3, cursor('Hermia'))}</div></section>
      <section class="pj-sec br-pals"><span class="al">Palette</span><div class="abs">${wait('br-pal', 3)}</div></section>
      <section class="pj-sec br-types"><span class="al">Type</span><div class="abs">${wait('br-type', 3)}</div></section></div>`
  }

  function render() {
    const b = B.brand
    stage.setAttribute('aria-busy', String(!b && B.busy))
    if (!b) { primary.disabled = B.busy; world.innerHTML = B.busy ? skeleton() : ''; if (B.busy && world.offsetWidth) frameAll(); else applyCam(); return }
    const locked = !!b.lockedAt
    primary.querySelector('.t').textContent = locked ? 'Unlock' : 'Lock'
    primary.classList.toggle('pri', !locked)
    primary.disabled = B.busy
    const t = typeOf(), p = palOf()
    const s = b.story || {}
    const story = [['what', 'What', s.what], ['who', 'Who', s.who], ['pages', 'Pages', (s.pages || []).join(', ')]].map(([k, n, v]) =>
      `<div class="ab pcard" data-key="story:${k}" tabindex="0" role="button" aria-label="${n}"><b>${n}</b><span>${esc(v || '')}</span>${sel(`story:${k}`)}</div>`).join('')
    const pals = b.palettes.map(x => `<div class="ab br-pal${x.id === b.pick?.palette ? ' on' : ''}" data-key="palette:${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(x.name)}" aria-pressed="${x.id === b.pick?.palette}">
      <div class="br-sw">${['bg', 'text', 'accent', 'link'].map(k => `<i style="background:${x[k]}"></i>`).join('')}</div>
      <div class="br-two">${sample(x, t, false)}${sample(x, t, true)}</div><em>${esc(x.name)}</em>${sel(`palette:${x.id}`)}</div>`).join('')
    const types = b.types.map(x => `<div class="ab br-type${x.id === b.pick?.type ? ' on' : ''}" data-key="type:${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(x.name)}" aria-pressed="${x.id === b.pick?.type}" style="background:${p.bg};color:${p.text}">
      <b style="font-family:'${esc(x.heading)}'">${esc(headline())}</b><span style="font-family:'${esc(x.body)}'">${esc(s.who ? `For ${s.who}. ` : '')}Every page reads in this pairing: the headings above, this paragraph below.</span>
      <em>${esc(x.heading)} · ${esc(x.body)}</em>${sel(`type:${x.id}`)}</div>`).join('')
    // the packs: each card looks like itself (its ground, its type, its photos, its voice and its button)
    const packs = B.packs.map(k => { const kp = k.palette, on = b.pack === k.slug
      return `<div class="ab br-pack${on ? ' on' : ''}${k.suggested ? ' sug' : ''}" data-key="pack:${esc(k.slug)}" tabindex="0" role="button" aria-label="${esc(k.name)}" aria-pressed="${on}" style="background:${kp.bg};color:${kp.text};--r:${esc(k.radius)}">
      <div class="br-pk-pics">${k.pictures.photos.map(x => `<img src="${esc(x.url)}" alt="" draggable="false" loading="lazy">`).join('')}</div>
      <b style="font-family:'${esc(k.type.heading)}'">${esc(k.name)}</b>
      <span style="font-family:'${esc(k.type.body)}'">${esc(k.voice.lines[0])}</span>
      <div class="br-pk-row"><i class="br-btn" style="background:${kp.accent};color:${onColour(kp.accent)};font-family:'${esc(k.type.body)}'">Join</i><u style="color:${kp.link};font-family:'${esc(k.type.body)}'">Read more</u></div>
      ${k.why ? `<em>${esc(k.why)}</em>` : ''}${sel(`pack:${k.slug}`)}</div>` }).join('')
    // what a pack brought: the voice, the pictures and the storyboard, drawn in the picked look
    const look = `background:${p.bg};color:${p.text}`
    const voice = b.voice ? `<div class="ab br-voice" data-key="voice:${esc(b.voice.pack)}" tabindex="0" role="button" aria-label="${esc(b.voice.name)}" style="${look}">${b.voice.lines.map(l => `<b style="font-family:'${esc(t.heading)}'">${esc(l)}</b>`).join('')}<em>${esc(b.voice.name)}</em>${sel(`voice:${b.voice.pack}`)}</div>` : ''
    const pics = b.pictures ? `<div class="ab br-pics" data-key="pictures:${esc(b.pictures.pack)}" tabindex="0" role="button" aria-label="${esc(b.pictures.name)}">${b.pictures.photos.map(x => `<img src="${esc(x.url)}" alt="${esc(x.alt)}" draggable="false" loading="lazy">`).join('')}<em>${esc(b.pictures.name)}</em>${sel(`pictures:${b.pictures.pack}`)}</div>` : ''
    const frames = b.storyboard ? b.storyboard.frames.map((fr, i) => `<div class="ab br-frame" data-key="frame:${i}" tabindex="0" role="button" aria-label="${esc(fr)}" style="${look};--a:${p.accent}"><i></i><b style="font-family:'${esc(t.heading)}'">${esc(fr)}</b><u></u><u></u>${sel(`frame:${i}`)}</div>`).join('') : ''
    const own = (part, ph) => `<form class="ab br-own" data-own="${part}"><input name="w" placeholder="${ph}" aria-label="${ph}" maxlength="300"></form>`
    // one sheet, read top to bottom: what it is, then its colours, then its type
    world.innerHTML = `<div class="col">
      ${packs ? `<section class="pj-sec br-packs" data-sec="packs"><span class="al">Options</span><div class="abs">${packs}</div></section>` : ''}
      <section class="pj-sec br-story" data-sec="story"><span class="al">Story</span><div class="abs">${story}</div></section>
      <section class="pj-sec br-pals" data-sec="palette"><span class="al">Palette</span><div class="abs">${pals}${own('palette', 'Your own colours')}</div></section>
      <section class="pj-sec br-types" data-sec="type"><span class="al">Type</span><div class="abs">${types}${own('type', 'Your own fonts')}</div></section>
      ${voice ? `<section class="pj-sec br-voices" data-sec="voice"><span class="al">Voice</span><div class="abs">${voice}</div></section>` : ''}
      ${pics ? `<section class="pj-sec br-pictures" data-sec="pictures"><span class="al">Pictures</span><div class="abs">${pics}</div></section>` : ''}
      ${frames ? `<section class="pj-sec br-board" data-sec="storyboard"><span class="al">Storyboard</span><div class="abs">${frames}</div></section>` : ''}</div>`
    root.classList.toggle('locked', locked)
    applyCam()
    if (!B.framed && world.offsetWidth) { B.framed = true; frameAll() }
    renderInsp()
  }

  // ---------- the inspector: the selected option's colours or fonts, or the story line
  function renderInsp() {
    const b = B.brand, key = B.sel
    bd.inspector(!!(b && key))
    if (insp.hidden) return
    if (insp.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return
    const [part, id] = key.split(':')
    // a pack: take all of it, or one part (the mix)
    if (part === 'pack') {
      const k = B.packs.find(x => x.slug === id)
      if (!k) return bd.inspector(false)
      insp.innerHTML = `<h3><span>${esc(k.name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>
        <div class="br-parts"><button class="btn pri" data-take="all">Use all</button>${[['palette', 'Palette'], ['type', 'Type'], ['voice', 'Voice'], ['pictures', 'Pictures']].map(([v, n]) => `<button class="btn ghost" data-take="${v}">${n}</button>`).join('')}</div>`
      return
    }
    if (part !== 'story' && part !== 'palette' && part !== 'type') return bd.inspector(false)
    const head = n => `<h3><span>${esc(n)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>`
    if (part === 'story') {
      const n = { what: 'What', who: 'Who', pages: 'Pages' }[id]
      const v = id === 'pages' ? (b.story?.pages || []).join(', ') : b.story?.[id] || ''
      // a long line wraps and the field grows with it; Enter commits, as the input did
      insp.innerHTML = `${head(n)}<label class="pl-f"><span>${n}</span><textarea data-story="${id}" rows="1" maxlength="200">${esc(v)}</textarea></label>`
      grow(insp.querySelector('textarea'))
      return
    }
    if (part === 'palette') {
      const x = b.palettes.find(o => o.id === id)
      if (!x) return void (insp.hidden = true)
      insp.innerHTML = `${head(x.name)}${[['bg', 'Background'], ['text', 'Text'], ['accent', 'Accent'], ['link', 'Links']].map(([k, n]) =>
        `<label class="pl-f br-col"><span>${n}</span><span class="br-in"><input type="color" data-col="${k}" value="${esc(x[k])}" aria-label="${n}"><input data-hex="${k}" value="${esc(x[k])}" maxlength="7" aria-label="${n}"></span></label>`).join('')}`
      return
    }
    const x = b.types.find(o => o.id === id)
    if (!x) return void (insp.hidden = true)
    insp.innerHTML = `${head(x.name)}<label class="pl-f"><span>Headings</span><input data-font="heading" value="${esc(x.heading)}" maxlength="40"></label><label class="pl-f"><span>Body</span><input data-font="body" value="${esc(x.body)}" maxlength="40"></label>`
  }
  insp.addEventListener('click', e => {
    if (e.target.closest('.pj-x')) return select(null)
    const tk = e.target.closest('[data-take]')
    if (tk && B.sel?.startsWith('pack:')) call('pick', { part: 'pack', id: B.sel.slice(5), parts: tk.dataset.take === 'all' ? undefined : [tk.dataset.take] }).then(() => { insp.innerHTML = ''; renderInsp() })
  })
  // a story field fits its text: field-sizing where the browser has it, its scroll height where not
  const sizing = CSS.supports('field-sizing', 'content')
  const grow = el => { if (sizing || !el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` }
  insp.addEventListener('input', e => { if (e.target.matches('textarea')) grow(e.target) })
  insp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches('textarea')) { e.preventDefault(); e.target.blur() } })
  insp.addEventListener('change', e => {
    const [part, id] = (B.sel || '').split(':')
    const el = e.target
    if (el.dataset.story) return call('edit', { part: 'story', values: { [el.dataset.story]: el.value } })
    if (el.dataset.font) return call('edit', { part: 'type', id, values: { [el.dataset.font]: el.value.trim() } })
    const k = el.dataset.col || el.dataset.hex
    if (k && /^#[0-9a-f]{6}$/i.test(el.value.trim())) return call('edit', { part, id, values: { [k]: el.value.trim() } }).then(() => { insp.innerHTML = ''; renderInsp() })
  })

  function select(key) { B.sel = key; insp.innerHTML = ''; render() }
  world.addEventListener('click', e => {
    const a = e.target.closest('.ab[data-key]')
    if (!a) return
    const key = a.dataset.key
    const [part, id] = key.split(':')
    if ((part === 'palette' || part === 'type') && B.brand.pick?.[part] !== id) call('pick', { part, id }).then(() => select(key))
    // a pack the sheet has not taken yet: all of it, at once
    else if (part === 'pack' && B.brand.pack !== id) call('pick', { part: 'pack', id }).then(() => select(key))
    else select(key)
  })
  world.addEventListener('keydown', e => { const a = e.target.closest('.ab[data-key]'); if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); a.click() } })
  world.addEventListener('submit', e => {
    e.preventDefault()
    const f = e.target.closest('.br-own'), w = f?.elements.w.value.trim()
    if (!w) return
    call('pick', { part: f.dataset.own, words: w })
  })

  addEventListener('resize', () => { if (B.on && B.brand) frameAll() })

  return {
    el: root,
    get chat() { return B.chat },
    // open the sheet for a talk's brief: made once per brief, kept on the chat
    async open({ chat = null, project = null, brief = '', kind = 'site', done = null } = {}) {
      B.done = done
      B.sel = null
      B.framed = false
      if (chat !== B.chat || project !== B.project) { B.brand = null; B.chat = chat; B.project = project }
      // the middle crumb: the project's name (it goes back to its Studio), or the chat it came from
      const up = crumb.querySelector('.br-up')
      up.textContent = project ? (up.dataset.pid === project ? up.textContent : '') : 'Chat'
      up.dataset.pid = project || ''
      if (project) api(`/api/studio/${encodeURIComponent(project)}`).then(d => { if (B.project === project) up.textContent = d.project?.title || d.project?.name || 'Studio' }).catch(() => { if (B.project === project && !up.textContent) up.textContent = 'Studio' })
      // Lock waits until the options are there
      B.busy = true
      render()
      try {
        const v = await post(project ? base() : '/api/brand', project ? { brief, kind } : { chat, brief, kind })
        if (project) v.chat = null
        take(v)
      } catch (err) { toast(err.message) } finally { B.busy = false; render() }
      B.done?.(B.chat, !!B.brand?.lockedAt)
    },
    show() { B.on = true; root.hidden = false; crumb.hidden = false; if (B.brand) { B.framed = false; render() } },
    hide() { B.on = false; root.hidden = true },
    // bring a section ('story', 'palette', 'type') or a card (its key) into view
    focus: (target, animate = true) => bd.focus(target, animate)
  }
}
