// The Deck kit (docs/specs/37-studio-first.md, docs/specs/35-open-design.md section 7): the Plan step of a deck
// in the Studio. On the shared board: the Outline (a line per slide), the Storyboard (every slide, small, drawn
// in the project's brand and the picked look), the Theme (two or three looks, the planner's pick first), Where
// to start (the title slide, the outline or one key slide) and Export (Present, HTML, PDF).
// The brand is read, never redefined. The slides are drawn by the server (engine/deck.mjs) and shown in
// sandboxed frames with no script. Lock writes the deck into the locked spec; Build writes the HTML and the PDF
// into the project. Nothing is posted anywhere.
//
// Beyond the contract's fields it has, like the App kit: prepare(ctx), plan.answer(ctx, { id, option, text }),
// plan.left(ctx), and it calls ctx.refresh?.() when its cards change. Names are prefixed (deckKit…, dk-)
// because server/page.mjs joins the kits into one script.
import { ic } from './icons.js'

const deckKitState = new Map() // project -> { deck, looks, all, sel, shots, saving, asked }
const deckKitEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const DECK_KIT_STARTS = [{ id: 'title', name: 'Title slide' }, { id: 'outline', name: 'Outline' }, { id: 'key', name: 'One key slide' }]
const DECK_KIT_LAYOUTS = [['title', 'Title'], ['section', 'Section'], ['points', 'Points'], ['steps', 'Steps'], ['stats', 'Numbers'], ['two', 'Two columns'], ['quote', 'Quote'], ['picture', 'Picture'], ['end', 'End']]
// a slide is drawn at 1920 × 1080 and shown at this size on the board
const DECK_KIT_W = 240, DECK_KIT_K = DECK_KIT_W / 1920

function deckKitStyle() {
  if (document.getElementById('dk-style')) return
  const st = document.createElement('style')
  st.id = 'dk-style'
  st.textContent = `
.dk-slide { width: ${DECK_KIT_W}px; padding: 0; background: none; border: 0; display: flex; flex-direction: column; gap: 6px; }
.dk-shot { position: relative; width: ${DECK_KIT_W}px; height: ${DECK_KIT_W * 9 / 16}px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); background: var(--surface-2); }
.dk-shot iframe { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; border: 0; transform: scale(${DECK_KIT_K}); transform-origin: 0 0; pointer-events: none; }
.dk-slide em { font: 500 12px var(--body); font-style: normal; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dk-outline { width: 320px; min-height: 120px; padding: 14px 16px; background: var(--surface); }
.dk-outline ol { margin: 0; padding-left: 22px; font: 13px/1.7 var(--body); color: var(--text); }
.dk-outline li.key { font-weight: 600; }
.dk-card { width: 190px; min-height: 96px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; background: var(--surface); }
.dk-card b { font: 600 15px var(--body); color: var(--text); }
.dk-card span { font: 13px var(--body); color: var(--muted); }
.dk-look.on .dk-shot { outline: 2px solid var(--accent); outline-offset: 2px; }
.dk-ins { display: flex; flex-direction: column; gap: 12px; }
.dk-ins textarea { min-height: 120px; resize: vertical; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: 13px/1.5 var(--body); padding: 8px; }
.dk-ins select { height: 32px; background: var(--deep); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: 13px var(--body); padding: 0 8px; }
.dk-opt { display: flex; align-items: center; gap: 10px; min-height: 40px; cursor: pointer; font: 13px var(--body); color: var(--text); }
.dk-opt input { width: 16px; height: 16px; accent-color: var(--accent); margin: 0; }
.dk-opt small { margin-left: auto; font: 12px var(--body); color: var(--muted); text-align: right; }
.dk-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.dk-present { position: fixed; inset: 0; z-index: 100; background: var(--deep); }
.dk-present iframe { width: 100%; height: 100%; border: 0; display: block; }
.dk-close { position: absolute; top: 12px; right: 12px; z-index: 1; opacity: .5; }
.dk-close:hover, .dk-close:focus-visible { opacity: 1; }
`
  document.head.append(st)
}

async function deckKitApi(ctx, path, body, method = 'POST') {
  const r = await ctx.sw.api(path, body === undefined ? {} : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
const deckKitKey = ctx => ctx.project || 'draft'
const deckKitOf = ctx => deckKitState.get(deckKitKey(ctx)) || deckKitState.set(deckKitKey(ctx), { deck: null, looks: [], all: [], sel: null, shots: new Map(), saving: null, asked: new Set() }).get(deckKitKey(ctx))
const deckKitWho = ctx => ({ project: ctx.project || undefined, chat: ctx.chat?.id || undefined })

// a change to the deck: kept, drawn again, and saved to the project a moment later
function deckKitSet(ctx, deck) {
  const st = deckKitOf(ctx)
  st.deck = deck
  ctx.refresh?.()
  clearTimeout(st.saving)
  st.saving = setTimeout(async () => {
    try { if (ctx.project) await deckKitApi(ctx, `/api/kit/deck/${encodeURIComponent(ctx.project)}`, { deck: st.deck, looks: st.looks }) } catch (err) { ctx.board?.toast?.(err.message) }
  }, 400)
}

// one slide as a still picture: the server draws it; a sandboxed frame with no script shows it
function deckKitShot(ctx, deck, i) {
  return el => {
    const st = deckKitOf(ctx)
    const key = JSON.stringify([deck.look, deck.slides[i], i, deck.slides.length])
    const put = html => { const f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.setAttribute('tabindex', '-1'); f.setAttribute('aria-hidden', 'true'); f.srcdoc = html; el.replaceChildren(f) }
    if (st.shots.has(key)) return put(st.shots.get(key))
    deckKitApi(ctx, '/api/kit/deck/render', { deck, slide: i, ...deckKitWho(ctx) }).then(r => { st.shots.set(key, r.html); if (el.isConnected) put(r.html) }).catch(() => {})
  }
}
const deckKitSlideCard = (ctx, deck, i, name, cls = '') => el => {
  el.classList.add('dk-slide', ...cls.split(' ').filter(Boolean))
  el.innerHTML = `<div class="dk-shot"></div><em>${deckKitEsc(name)}</em>`
  deckKitShot(ctx, deck, i)(el.querySelector('.dk-shot'))
}
const deckKitCard = (name, value) => el => { el.classList.add('dk-card'); el.innerHTML = `<b>${deckKitEsc(name)}</b><span>${deckKitEsc(value)}</span>` }
const deckKitHead = name => `<h3><span>${deckKitEsc(name)}</span><button class="ib sm pj-x" aria-label="Close">${ic('x', 16)}</button></h3>`
const deckKitField = (label, key, value, max = 160) => `<label class="pl-f"><span>${deckKitEsc(label)}</span><input data-f="${key}" value="${deckKitEsc(value)}" maxlength="${max}"></label>`
const deckKitArea = (label, key, value) => `<label class="pl-f"><span>${deckKitEsc(label)}</span><textarea data-f="${key}">${deckKitEsc(value)}</textarea></label>`
const deckKitTitle = s => s.title || s.quote || DECK_KIT_LAYOUTS.find(([id]) => id === s.layout)?.[1] || 'Slide'

// the items of a slide as lines a person can edit: "Head — text"
const deckKitLines = items => (items || []).map(x => x.text ? `${x.head} — ${x.text}` : x.head).join('\n')
const deckKitItems = text => String(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [head, ...rest] = l.split(/\s+[—–-]\s+/); return { head, text: rest.join(' — ') } })
const deckKitStats = text => String(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [value, ...label] = l.split(/\s+/); return { value, label: label.join(' ') } })

function deckKitInspect(ctx, what, i) {
  return el => {
    const st = deckKitOf(ctx), d = st.deck
    let html = ''
    if (what === 'outline') {
      html = deckKitHead('Outline') + deckKitArea('One line a slide', 'outline', d.slides.map(deckKitTitle).join('\n'))
    } else if (what === 'slide') {
      const s = d.slides[i]
      if (!s) return
      const items = s.layout === 'points' ? deckKitArea('Points', 'points', deckKitLines(s.points)) : s.layout === 'steps' ? deckKitArea('Steps', 'steps', deckKitLines(s.steps))
        : s.layout === 'stats' ? deckKitArea('Numbers', 'stats', (s.stats || []).map(x => `${x.value} ${x.label}`).join('\n'))
        : s.layout === 'quote' ? deckKitArea('Quote', 'quote', s.quote || '') + deckKitField('By', 'by', s.by, 60)
        : s.layout === 'two' ? deckKitArea('Two columns', 'two', deckKitLines([s.left, s.right].filter(Boolean))) : ''
      html = deckKitHead(`Slide ${i + 1}`) +
        `<label class="pl-f"><span>Layout</span><select data-f="layout">${DECK_KIT_LAYOUTS.map(([id, n]) => `<option value="${id}"${id === s.layout ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` +
        deckKitField('Kicker', 'kicker', s.kicker, 40) + deckKitField('Title', 'title', s.title, 90) + deckKitArea('Line', 'lede', s.lede || '') + items + deckKitArea('Notes', 'notes', s.notes || '') +
        `<div class="dk-btns"><button class="ib sm" data-move="-1" aria-label="Earlier">${ic('chl', 16)}</button><button class="ib sm" data-move="1" aria-label="Later">${ic('chr', 16)}</button><button class="btn ghost" data-add>${ic('plus', 15)}Add</button><button class="btn ghost" data-remove>${ic('trash', 15)}Remove</button></div>`
    } else if (what === 'look') {
      html = deckKitHead('Look') + st.all.map(t => `<label class="dk-opt"><input type="radio" name="dk-l" data-look="${deckKitEsc(t.slug)}" ${d.look === t.slug ? 'checked' : ''}><span>${deckKitEsc(t.name)}</span><small>${deckKitEsc(t.feel)}</small></label>`).join('')
    } else if (what === 'start') {
      html = deckKitHead('Where to start') + DECK_KIT_STARTS.map(s => `<label class="dk-opt"><input type="radio" name="dk-s" data-start="${s.id}" ${d.start === s.id ? 'checked' : ''}><span>${s.name}</span></label>`).join('') +
        (d.start === 'key' ? `<label class="pl-f"><span>Key slide</span><select data-f="key">${d.slides.map((s, k) => `<option value="${k}"${k === d.key ? ' selected' : ''}>${k + 1}. ${deckKitEsc(deckKitTitle(s))}</option>`).join('')}</select></label>` : '')
    }
    el.innerHTML = `<div class="dk-ins">${html}</div>`
    deckKitWire(ctx, el, what, i)
  }
}

function deckKitWire(ctx, el, what, i) {
  const st = deckKitOf(ctx)
  const edit = fn => { const d = structuredClone(st.deck); fn(d); deckKitSet(ctx, d) }
  let t = null
  const field = x => {
    const f = x.dataset.f, v = x.value
    if (f === 'outline') return edit(d => {
      const lines = v.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 40)
      // the end slide stays last: a line added at the bottom is a new slide before it
      const end = d.slides.at(-1)?.layout === 'end' ? d.slides.at(-1) : null
      const body = end ? d.slides.slice(0, -1) : d.slides
      d.slides = lines.map((l, k) => { const s = end && k === lines.length - 1 && lines.length > 1 ? end : body[k] || { layout: 'section' }; return s.layout === 'quote' && !s.title ? { ...s, quote: l } : { ...s, title: l } })
    })
    if (f === 'key') return edit(d => { d.key = Number(v) })
    edit(d => {
      const s = d.slides[i]
      if (f === 'points' || f === 'steps') s[f] = deckKitItems(v)
      else if (f === 'stats') s.stats = deckKitStats(v)
      else if (f === 'two') { const [a, b] = deckKitItems(v); s.left = a || { head: '' }; s.right = b || { head: '' } }
      else s[f] = v
    })
  }
  el.oninput = e => { const x = e.target; if (!x.dataset.f || x.tagName === 'SELECT') return; clearTimeout(t); t = setTimeout(() => field(x), 500) }
  el.onchange = e => {
    const x = e.target
    if (x.tagName === 'SELECT') return field(x)
    if (x.dataset.look) return edit(d => { d.look = x.dataset.look })
    if (x.dataset.start) return edit(d => { d.start = x.dataset.start })
  }
  el.onclick = e => {
    if (e.target.closest('.pj-x')) return ctx.board?.inspector?.(false)
    const mv = e.target.closest('[data-move]')
    if (mv) return edit(d => { const j = Math.max(0, Math.min(d.slides.length - 1, i + Number(mv.dataset.move))); d.slides.splice(j, 0, ...d.slides.splice(i, 1)) })
    if (e.target.closest('[data-add]')) return edit(d => { d.slides.splice(i + 1, 0, { layout: 'section', title: 'New slide' }) })
    if (e.target.closest('[data-remove]') && st.deck.slides.length > 1) { ctx.board?.inspector?.(false); return edit(d => { d.slides.splice(i, 1) }) }
  }
}

// Export: written into the project from the person's press; Present opens the HTML on its own, where its keys work
async function deckKitExport(ctx, format) {
  if (!ctx.project) return ctx.board?.toast?.('Make the project first')
  const st = deckKitOf(ctx)
  clearTimeout(st.saving)
  await deckKitApi(ctx, `/api/kit/deck/${encodeURIComponent(ctx.project)}`, { deck: st.deck, looks: st.looks })
  return deckKitApi(ctx, `/api/kit/deck/${encodeURIComponent(ctx.project)}/export`, { format: format === 'pdf' ? 'pdf' : 'html', ...deckKitWho(ctx) })
}
// the exported file, fetched with the studio's token
async function deckKitFile(ctx, format) {
  const r = await deckKitExport(ctx, format)
  const got = await ctx.sw.api(r.url)
  if (!got.ok) throw new Error(`HTTP ${got.status}`)
  return got.blob()
}
async function deckKitDownload(ctx, format) {
  const url = URL.createObjectURL(await deckKitFile(ctx, format))
  const name = `${String(deckKitOf(ctx).deck.title || 'deck').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'deck'}.${format}`
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
// Present: the deck over the whole window in a sandboxed frame (scripts, no same origin); its own keys
// work, F goes full screen, Esc (or Close) comes back
async function deckKitPresent(ctx, at) {
  const html = await (await deckKitFile(ctx, 'html')).text()
  const box = document.createElement('div')
  box.className = 'dk-present'
  box.innerHTML = `<button class="ib dk-close" aria-label="Close">${ic('x', 18)}</button>`
  const f = document.createElement('iframe')
  f.setAttribute('sandbox', 'allow-scripts')
  f.setAttribute('allow', 'fullscreen')
  f.setAttribute('title', deckKitOf(ctx).deck.title || 'Deck')
  f.srcdoc = html.replace('<body>', `<body><script>window.DECK_AT=${Number(at) || 0}</script>`)
  box.prepend(f)
  const close = () => { box.remove(); removeEventListener('message', onMsg); removeEventListener('keydown', onKey) }
  const onMsg = e => { if (e.source === f.contentWindow && e.data?.deck === 'close') close() }
  const onKey = e => { if (e.key === 'Escape') close() }
  addEventListener('message', onMsg)
  addEventListener('keydown', onKey)
  box.querySelector('.dk-close').onclick = close
  document.body.append(box)
  f.onload = () => f.focus()
}
const deckKitAction = (ctx, key, name, icon, run) => ({ key, name,
  render: el => { el.classList.add('dk-card'); el.innerHTML = `<b>${ic(icon, 16)} ${deckKitEsc(name)}</b>` },
  inspect: el => { el.innerHTML = ''; ctx.board?.inspector?.(false); run().catch(err => ctx.board?.toast?.(err.message)) } })

export const deckKit = {
  kind: 'deck',
  name: 'Deck',
  icon: 'frame',
  steps: ['brand', 'references', 'assets', 'plan'],
  starts: DECK_KIT_STARTS,
  reads: ['palette', 'type', 'voice', 'pictures'],
  // the deck as it stands for this project: saved, else the outline at once and the planner's slides after
  async prepare(ctx) {
    deckKitStyle()
    const st = deckKitOf(ctx)
    if (!st.all.length) st.all = (await deckKitApi(ctx, '/api/kit/deck/looks').catch(() => ({ looks: [] }))).looks
    if (st.deck) return st
    if (ctx.project) {
      const saved = await deckKitApi(ctx, `/api/kit/deck/${encodeURIComponent(ctx.project)}`).catch(() => null)
      if (saved?.deck) { st.deck = saved.deck; st.looks = saved.looks?.length ? saved.looks : [saved.deck.look]; return st }
    }
    const idea = ctx.studio?.idea || ctx.chat?.turns?.find(t => t.who === 'person')?.text || ''
    // the story's beats (spec 39) when the project has them: the outline starts from them
    const ask = { brief: idea, beats: ctx.story?.beats || ctx.studio?.beats || [], run: ctx.studio?.run || ctx.run || undefined, ...deckKitWho(ctx) }
    const quick = await deckKitApi(ctx, '/api/kit/deck/draft', { ...ask, quick: true })
    st.looks = quick.looks
    deckKitSet(ctx, quick.deck)
    const first = st.deck
    deckKitApi(ctx, '/api/kit/deck/draft', ask).then(out => {
      if (st.deck !== first) return // never over an edit
      deckKitSet(ctx, { ...out.deck, look: first.look, start: first.start })
      ctx.sw?.say?.(out.say)
    }).catch(() => {})
    return st
  },
  plan: {
    sections(ctx) {
      deckKitStyle()
      const st = deckKitOf(ctx), d = st.deck
      if (!d) { deckKit.prepare(ctx).then(() => ctx.refresh?.()).catch(err => ctx.board?.toast?.(err.message)); return [] }
      const shown = [...new Set([...st.looks, d.look])].map(slug => st.all.find(t => t.slug === slug)).filter(Boolean)
      const lead = { ...d, slides: [d.slides[0]] }
      return [
        { sec: 'Outline', cards: [{ key: 'outline', name: 'Outline', render: el => { el.classList.add('dk-outline'); el.innerHTML = `<ol>${d.slides.map((s, k) => `<li${d.start === 'key' && k === d.key ? ' class="key"' : ''}>${deckKitEsc(deckKitTitle(s))}</li>`).join('')}</ol>` }, inspect: deckKitInspect(ctx, 'outline') }] },
        { sec: 'Storyboard', cards: d.slides.map((s, k) => ({ key: `slide:${k}`, name: `${k + 1}. ${deckKitTitle(s)}`, render: deckKitSlideCard(ctx, d, k, `${k + 1}. ${deckKitTitle(s)}`), inspect: deckKitInspect(ctx, 'slide', k) })) },
        { sec: 'Theme', cards: [...shown.map(t => ({ key: `look:${t.slug}`, name: t.name, render: deckKitSlideCard(ctx, { ...lead, look: t.slug }, 0, t.name, `dk-look${t.slug === d.look ? ' on' : ''}`), inspect: el => { el.innerHTML = ''; deckKitSet(ctx, { ...d, look: t.slug }); deckKitInspect(ctx, 'look')(el) } })),
          { key: 'look:more', name: 'More looks', render: deckKitCard('More looks', `${st.all.length} looks`), inspect: deckKitInspect(ctx, 'look') }] },
        { sec: 'Start', cards: [{ key: 'start', name: 'Where to start', render: deckKitCard('Where to start', DECK_KIT_STARTS.find(s => s.id === d.start)?.name || ''), inspect: deckKitInspect(ctx, 'start') }] },
        { sec: 'Export', cards: [
          deckKitAction(ctx, 'export:present', 'Present', 'play', () => deckKitPresent(ctx, d.start === 'key' ? d.key : 0)),
          deckKitAction(ctx, 'export:html', 'HTML', 'download', () => deckKitDownload(ctx, 'html')),
          deckKitAction(ctx, 'export:pdf', 'PDF', 'file', () => deckKitDownload(ctx, 'pdf'))
        ] }
      ]
    },
    // the left chat's questions: the look, then where to start, each asked once
    questions(ctx) {
      const st = deckKitOf(ctx), d = st.deck
      if (!d) return []
      const q = []
      if (!st.asked.has('look')) q.push({ id: 'look', q: 'Look', options: st.looks.map(slug => ({ id: slug, name: st.all.find(t => t.slug === slug)?.name || slug })), free: false })
      if (!st.asked.has('start')) q.push({ id: 'start', q: 'Where to start', options: DECK_KIT_STARTS, free: false })
      return q
    },
    async answer(ctx, { id = '', option = '' } = {}) {
      const st = deckKitOf(ctx)
      if (!st.deck || !id) return { say: '' }
      st.asked.add(id)
      if (id === 'look' && st.all.some(t => t.slug === option)) deckKitSet(ctx, { ...st.deck, look: option })
      if (id === 'start' && DECK_KIT_STARTS.some(s => s.id === option)) deckKitSet(ctx, { ...st.deck, start: option })
      return { say: '', left: deckKit.plan.left(ctx) }
    },
    done: ctx => !!deckKitOf(ctx).deck && deckKit.plan.left(ctx) === 0,
    left: ctx => ['look', 'start'].filter(x => !deckKitOf(ctx).asked.has(x)).length
  },
  proposal(ctx) {
    const d = deckKitOf(ctx).deck
    return d ? { items: [{ what: `${d.slides.length} slides`, order: 1 }, { what: 'HTML and PDF', order: 2 }], minutes: 1, credits: 0 } : { items: [], minutes: 0, credits: 0 }
  },
  // what goes under spec.kits.deck: the deck itself
  lock: ctx => ({ deck: deckKitOf(ctx).deck }),
  // the person's Build press only: the locked deck written out as HTML and PDF in the project
  async build(spec, ctx) {
    const d = spec?.kits?.deck?.deck
    if (!d) throw new Error('lock the deck first')
    if (!ctx.project) throw new Error('Make the project first')
    deckKitOf(ctx).deck = d
    const html = await deckKitExport(ctx, 'html')
    const pdf = await deckKitExport(ctx, 'pdf').catch(() => null)
    return { run: null, files: [html.url, pdf?.url].filter(Boolean) }
  },
  check(spec) {
    const d = spec?.kits?.deck?.deck
    return d ? [{ part: 'slides', ok: d.slides.length >= 2, note: `${d.slides.length} slides` }, { part: 'look', ok: !!d.look, note: d.look }] : []
  }
}
