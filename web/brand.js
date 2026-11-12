// The brand sheet (docs/specs/31-brand-sheet.md): a website's or app's story, palette and type, side by
// side, before any page is designed. The same board as the game's Plan board (web/plan.js): sections of
// artboards on the dotted stage, the inspector on the right only while something is selected, and the
// top bar's one primary button, Lock. The chat stays on the left; Build there builds from the locked sheet.
import { ic } from './icons.js'
import { makeBoard } from './board.js'

export function makeBrand({ sw, C, root }) {
  const esc = sw.esc
  const B = { on: false, chat: null, brand: null, theme: null, sel: null, framed: false, done: null, busy: false }

  // the stage, camera, inspector, Esc and toast are the shared board (web/board.js)
  const bd = makeBoard({ root, cls: 'project plan brand-sheet', label: 'Brand sheet', fit: [0.35, 1], on: () => B.on, selected: () => !!B.sel, clear: () => select(null) })
  const { world, insp } = bd
  const applyCam = bd.applyCam, toast = bd.toast, frameAll = () => bd.frameAll(false)

  // ---------- the top bar: the name, and Lock
  const bar = document.querySelector('.topbar')
  const crumb = document.createElement('div')
  crumb.className = 'br-crumb'
  crumb.innerHTML = `<button class="br-up">Chat</button>${ic('chr', 14)}<b class="br-name">Brand sheet</b>`
  bar?.querySelector('.spacer')?.before(crumb)
  crumb.querySelector('.br-up').onclick = () => back()
  const primary = document.createElement('button')
  primary.className = 'toggle br-primary pri'
  primary.innerHTML = '<span class="t">Lock</span>'
  bar?.querySelector('.spacer')?.after(primary)
  primary.onclick = () => (B.brand?.lockedAt ? call('unlock') : lock())

  // ---------- data
  const api = (path, opts) => sw.api(path, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  const take = v => { B.chat = v.chat; B.brand = v.brand; B.theme = v.theme; fonts(); render() }
  const call = (what, body) => post(`/api/brand/${encodeURIComponent(B.chat)}/${what}`, body).then(take).catch(err => toast(err.message))
  async function lock() {
    await call('lock')
    if (!B.brand?.lockedAt) return
    B.done?.(B.chat, true)
    back()
  }
  function back() { C.go('station', 'canvas') }

  // the type options' fonts, so each pairing shows as itself
  const loaded = new Set()
  function fonts() {
    const fam = f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`
    const want = (B.brand?.types || []).flatMap(t => [t.heading, t.body]).filter(f => f && !loaded.has(f))
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

  function render() {
    const b = B.brand
    if (!b) { world.innerHTML = '<div class="col"><section class="pj-sec"><span class="al">Brand sheet</span><div class="abs"><div class="ab pcard wait-in"><b>Story</b><span></span></div></div></section></div>'; return }
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
    const own = (part, ph) => `<form class="ab br-own" data-own="${part}"><input name="w" placeholder="${ph}" aria-label="${ph}" maxlength="300"></form>`
    // one sheet, read top to bottom: what it is, then its colours, then its type
    world.innerHTML = `<div class="col">
      <section class="pj-sec br-story" data-sec="story"><span class="al">Story</span><div class="abs">${story}</div></section>
      <section class="pj-sec br-pals" data-sec="palette"><span class="al">Palette</span><div class="abs">${pals}${own('palette', 'Your own colours')}</div></section>
      <section class="pj-sec br-types" data-sec="type"><span class="al">Type</span><div class="abs">${types}${own('type', 'Your own fonts')}</div></section></div>`
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
    if (insp.contains(document.activeElement) && document.activeElement.matches('input')) return
    const [part, id] = key.split(':')
    const head = n => `<h3><span>${esc(n)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>`
    if (part === 'story') {
      const n = { what: 'What', who: 'Who', pages: 'Pages' }[id]
      const v = id === 'pages' ? (b.story?.pages || []).join(', ') : b.story?.[id] || ''
      insp.innerHTML = `${head(n)}<label class="pl-f"><span>${n}</span><input data-story="${id}" value="${esc(v)}" maxlength="200"></label>`
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
  insp.addEventListener('click', e => { if (e.target.closest('.pj-x')) select(null) })
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
    const a = e.target.closest('.ab')
    if (!a || a.matches('.br-own')) return
    const key = a.dataset.key
    const [part, id] = key.split(':')
    if ((part === 'palette' || part === 'type') && B.brand.pick?.[part] !== id) call('pick', { part, id }).then(() => select(key))
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
    async open({ chat = null, brief = '', kind = 'site', done = null } = {}) {
      B.done = done
      B.sel = null
      B.framed = false
      if (chat !== B.chat) { B.brand = null; B.chat = chat }
      render()
      B.busy = true
      try { take(await post('/api/brand', { chat, brief, kind })) } catch (err) { toast(err.message) } finally { B.busy = false; render() }
      B.done?.(B.chat, !!B.brand?.lockedAt)
    },
    show() { B.on = true; root.hidden = false; crumb.hidden = false; if (B.brand) { B.framed = false; render() } },
    hide() { B.on = false; root.hidden = true },
    // bring a section ('story', 'palette', 'type') or a card (its key) into view
    focus: (target, animate = true) => bd.focus(target, animate)
  }
}
