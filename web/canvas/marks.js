// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): comments, generated images, visual review, Scribble.
import { painterOf } from '../icons.js'
import { S, $, els, api, commandOps, BOOT, WALL, BASE } from './core.js'
import { botMsg, feed, toolbarKey, setToolbarKey } from './panels.js'
import { esc, remember, restoreLayer } from './design.js'
import { viewing } from './replay.js'
import { shownRun } from './film.js'
import { links, refLines, FRAME_SANDBOX } from './base.js'
import { modelsInfo, thaw, toggleModels } from './settings.js'
import { post } from './deck.js'
import { pageDoc } from './player.js'
import { key } from './events.js'
import { ladder } from '../ladder.js'

// ---------- comments: tell an agent what to change
// A 💬 pin sits on the selected section; open, it is a little composer. The
// Comment tool in the toolbar arms it: the next section clicked opens it. A
// comment with no section (from /swarm fix) is routed by the planner.
export const cmt = { mode: false, open: null, el: null, key: '' }
export const txt = { mode: false }
export const USER_TOOLS = { move: true, text: true, comment: true }

// ✏️ Text: every piece of text in a section as a field. Saved as the section's new
// version, so ⌘Z undoes it and it stays when the file reopens.
export function textEdit(l) {
  document.querySelector('.finfo-wrap')?.remove()
  const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg, script, style')) nodes.push(n)
  if (!nodes.length) return botMsg('That section has no text to edit.')
  const wrap = document.createElement('div')
  wrap.className = 'finfo-wrap'
  wrap.innerHTML = `<div class="finfo textedit"><button class="fix" aria-label="Close">×</button><h3>✏️ Edit text <small></small></h3><div class="te-list"></div><div class="fi-foot"><span class="dim">Tip: ⌘Z undoes it after saving.</span><button class="fi-save">Save</button></div></div>`
  wrap.querySelector('h3 small').textContent = l.role || l.id
  const list = wrap.querySelector('.te-list')
  nodes.forEach((n, i) => {
    const t = n.textContent.trim(), tag = n.parentElement.tagName.toLowerCase()
    const row = document.createElement('label')
    row.innerHTML = `<span>${esc(/^h[1-6]$/.test(tag) ? 'heading' : tag === 'a' || tag === 'button' ? 'button / link' : tag === 'p' ? 'text' : tag)}</span>`
    const f = document.createElement(t.length > 60 ? 'textarea' : 'input')
    f.value = t.replace(/\s+/g, ' ')
    // @ts-ignore
    f.dataset.i = i
    // @ts-ignore
    if (f.tagName === 'TEXTAREA') f.rows = Math.min(5, Math.ceil(t.length / 70))
    row.append(f)
    list.append(row)
  })
  document.body.append(wrap)
  const close = () => { wrap.remove(); removeEventListener('keydown', key) }
  const key = e => { if (e.key === 'Escape') close() }
  addEventListener('keydown', key)
  wrap.onclick = e => { if (e.target === wrap) close() }
  // @ts-ignore
  wrap.querySelector('.fix').onclick = close
  // @ts-ignore
  wrap.querySelector('.fi-save').onclick = async () => {
    let changed = 0
    for (const f of list.querySelectorAll('[data-i]')) {
      // @ts-ignore
      const n = nodes[Number(f.dataset.i)], old = n.textContent, now = f.value.trim()
      if (now === old.trim().replace(/\s+/g, ' ')) continue
      // keep the spacing around the words
      n.textContent = old.match(/^\s*/)[0] + now + old.match(/\s*$/)[0]
      changed++
    }
    close()
    if (!changed) return
    const step = { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: doc.body.innerHTML.trim(), label: `text in ${l.role || l.id}` }
    remember(step)
    await restoreLayer(step, step.after, 'text')
    feed(null, `✏️ You changed ${changed} piece${changed > 1 ? 's' : ''} of text in ${l.role || l.id}`, 'sys')
  }
  // @ts-ignore
  list.querySelector('[data-i]')?.focus()
}

export function drawComment() {
  const l = S.sel && S.layers.get(S.sel)
  const box = $('#selbox')
  if (!l || l.status !== 'done' || !box || box.hidden) {
    if (cmt.el) { cmt.el.remove(); cmt.el = null; cmt.key = '' }
    return
  }
  const open = cmt.open === S.sel
  const want = `${S.sel}|${open}`
  if (cmt.key !== want) {
    cmt.el?.remove()
    cmt.key = want
    cmt.el = document.createElement('div')
    cmt.el.className = `cbox${open ? ' open' : ''}`
    cmt.el.innerHTML = open
      ? `<textarea rows="2" placeholder="Tell an agent what to change in ${esc(l.role || l.id)}…"></textarea><div class="crow"><small>Enter to send · Esc to close</small><button>Send</button></div>`
      : '<button class="cpin" aria-label="Comment: tell an agent what to change here">💬</button>'
    document.body.append(cmt.el)
    if (open) {
      const ta = cmt.el.querySelector('textarea')
      const send = () => { const t = ta.value.trim(); if (t) { sendComment(t, S.sel); cmt.open = null } }
      ta.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
        if (e.key === 'Escape') { e.stopPropagation(); cmt.open = null }
      }
      cmt.el.querySelector('button').onclick = send
      setTimeout(() => ta.focus(), 0)
    } else cmt.el.querySelector('.cpin').onclick = () => { cmt.open = S.sel }
  }
  const r = box.getBoundingClientRect(), vr = els.viewport.getBoundingClientRect()
  const w = open ? 320 : 34
  const x = Math.min(vr.right - w - 8, Math.max(vr.left + 8, r.right - w))
  const y = Math.min(vr.bottom - 110, Math.max(vr.top + 8, r.top + 8))
  cmt.el.style.transform = `translate(${x | 0}px, ${y | 0}px)`
}

export async function sendComment(text, target = null) {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  if (!run) return feed(null, 'Open a build first.', 'err')
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, role: l.role, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, target, sections }) }).catch(() => null)
  if (!res?.ok) {
    const out = await res?.json().catch(() => ({}))
    if (!/which section/.test(out?.error || '')) feed(null, `comment: ${out?.error || 'the canvas server is not answering'}`, 'err')
  }
}

// the message with its layer chips: the crew rework those sections; the turn keeps the layers
export async function sendLayers(text) {
  const run = shownRun(), chips = links.take('layer'), media = links.take('ref')
  text = refLines(text, media)
  els.brief.value = ''
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, role: l.role, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, targets: chips.map(c => c.key), sections }) }).catch(() => null)
  if (res?.ok) return
  const out = await res?.json().catch(() => ({}))
  for (const c of [...chips, ...media]) links.add(c)
  if (!els.brief.value) els.brief.value = text.split('\n')[0]
  feed(null, out?.error || 'The canvas server is not answering.', 'err')
}

commandOps.fix = c => {
  const l = S.sel && S.layers.get(S.sel)
  sendComment(c.text || '', l?.status === 'done' ? S.sel : null)
}

els.toolbar.addEventListener('click', e => {
  const tool = e.target.closest('[data-tool]')?.dataset.tool
  if (tool === 'move') { cmt.mode = txt.mode = false; setToolbarKey(''); els.viewport.classList.remove('commenting', 'texting'); return }
  if (tool === 'text') {
    cmt.mode = false; els.viewport.classList.remove('commenting')
    const l = S.sel && S.layers.get(S.sel)
    if (l?.status === 'done') { txt.mode = false; setToolbarKey(''); return textEdit(l) }
    txt.mode = !txt.mode; setToolbarKey('')
    els.viewport.classList.toggle('texting', txt.mode)
    if (txt.mode) feed(null, '✏️ Click a section to edit its words.', 'sys')
    return
  }
  if (tool !== 'comment') return
  txt.mode = false; els.viewport.classList.remove('texting')
  if (S.sel && S.layers.get(S.sel)?.status === 'done') { cmt.open = S.sel; return }
  cmt.mode = !cmt.mode
  setToolbarKey('')
  els.viewport.classList.toggle('commenting', cmt.mode)
  if (cmt.mode) feed(null, '💬 Click a section to comment on it.', 'sys')
})

// ---------- generated images
// Builders leave <img data-gen="…"> without a src; the server paints each one with
// a Hermes image provider and sends its file, which goes into the section here.

// Until a photo arrives, its spot shows a pencil sketch in the theme's colours,
// different for every description, so a page looks finished from the start.
function sketch(desc) {
  const v = S.theme?.vars || {}
  const c = n => esc(v[`--${n}`] || { muted: '#e9e4dc', card: '#faf8f4', accent: '#c96', primary: '#333', 'muted-foreground': '#888' }[n])
  let h = 0
  for (const ch of desc) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const r = n => ((h = (h * 1103515245 + 12345) >>> 0) % 1000) / 1000 * n
  const kind = h % 3
  const pen = `fill="none" stroke="${c('primary')}" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="7 4"`
  const sun = `<circle cx="${290 + r(60)}" cy="${70 + r(30)}" r="${22 + r(14)}" fill="${c('accent')}" fill-opacity=".35"/>`
  const shapes = kind === 0
    ? `${sun}<path d="M0 ${210 + r(20)} L${80 + r(40)} ${130 + r(30)} L${170 + r(30)} ${200} L${250 + r(30)} ${120 + r(30)} L400 ${215}" ${pen}/><path d="M0 250 Q100 ${225 + r(15)} 200 245 T400 240" ${pen}/>`
    : kind === 1
      ? `${sun}<rect x="${70 + r(30)}" y="${110 + r(20)}" width="${110 + r(40)}" height="${90 + r(30)}" rx="10" ${pen}/><circle cx="${270 + r(30)}" cy="${170 + r(20)}" r="${40 + r(15)}" ${pen}/>`
      : `<path d="M${40 + r(30)} 230 C${90 + r(30)} ${90 + r(40)}, ${230 + r(30)} ${90 + r(40)}, ${330 + r(30)} 230" ${pen}/><circle cx="${200 + r(30)}" cy="${120 + r(20)}" r="${30 + r(12)}" fill="${c('accent')}" fill-opacity=".3"/>`
  const label = esc(desc.length > 26 ? `${desc.slice(0, 25)}…` : desc)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${c('muted')}"/><stop offset="1" stop-color="${c('card')}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>${shapes}<text x="200" y="282" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="${c('muted-foreground')}">painting · ${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// A stand-in photo for a slot whose real picture is still to come (or could not be painted): the
// closest match from the stock library, earlier builds, Pexels or Openverse (/api/standin,
// engine/standins.mjs). Finding one can take a while, so the sketch shows first and the photo
// takes its place when it comes. It lives only here on the canvas: the saved build keeps the
// empty slot, and the painted picture replaces the stand-in the moment it lands.
const standins = new Map() // the picture's prompt -> its url, null (none found) or 'wait'
function standinFor(gen) {
  if (BOOT.hosted || WALL) return null // the hosted studio has no stand-in source
  const had = standins.get(gen)
  if (had !== undefined) return had === 'wait' ? null : had
  standins.set(gen, 'wait')
  const run = viewing && viewing !== 'new' ? viewing : S.run
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 60000)
  api(`/api/standin?${new URLSearchParams({ q: gen, w: '768', h: '512', run: run || '' })}`, { signal: ac.signal })
    .then(r => (r.ok ? r.json() : null)).catch(() => null)
    .then(j => {
      clearTimeout(t)
      // a stock-library photo comes through this server (/standin/lib/<id>): its CDN sends no CORS
      // header, and a page holding a picture it cannot read back cannot be photographed
      const libId = String(j?.url || '').match(/^https:\/\/files\.design-bakery\.com\/([0-9a-f-]{36})$/)?.[1]
      const url = libId ? `${BASE}/standin/lib/${libId}` : j?.url ? (/^https?:/.test(j.url) ? j.url : BASE + j.url) : null
      standins.set(gen, url)
      if (url) for (const l of S.layers.values()) if (l.status === 'done' && l.text.includes('data-sketch')) fillImages(l)
    })
  return null
}

export function fillImages(l) {
  if (l.status !== 'done' || !/data-gen=/.test(l.text)) return
  const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
  let changed = false
  for (const img of doc.body.querySelectorAll('img[data-gen]')) {
    const gen = img.getAttribute('data-gen')
    const src = S.images.get(`${l.key}|${gen}`)
    if (src === undefined || src === '') {
      // waiting, or the photo failed: a stand-in photo holds the slot, and the sketch until one is found.
      // The frame marks it with the painter's name and "real picture coming" (web/frame.html), so a
      // stand-in never passes for the finished site.
      // A stock-photo build keeps its stand-ins for good, so they get no tag.
      if (S.paint !== false) {
        const who = painterOf(`${l.key}/${gen}`), state = src === '' ? 'failed' : 'coming'
        if (img.getAttribute('data-painter') !== who) { img.setAttribute('data-painter', who); changed = true }
        if (img.getAttribute('data-pt') !== state) { img.setAttribute('data-pt', state); changed = true }
      }
      const hold = standinFor(gen)
      if (hold) { if (img.getAttribute('src') !== hold) { img.setAttribute('src', hold); ladder(img, hold); img.setAttribute('data-sketch', 'photo'); changed = true } }
      else if (!img.getAttribute('src')) { img.setAttribute('src', sketch(gen)); img.setAttribute('data-sketch', ''); changed = true }
      continue
    }
    if (img.getAttribute('src') !== src || img.hasAttribute('data-pt')) { img.setAttribute('src', src); ladder(img, src); for (const a of ['data-sketch', 'data-painter', 'data-pt']) img.removeAttribute(a); changed = true }
  }
  if (changed) { l.text = doc.body.innerHTML; l.ver++ }
}

// ---------- visual review
// After a build, each page is photographed in its own frame and sent to the
// reviewer (a vision model). Its notes go to builders, who rewrite those sections live.

export const review = { busy: false, seq: 0, waits: new Map(), auto: null }
export const frameTitle = id => S.frames.find(f => f.id === id)?.title || id
const reviewerOn = () => !!modelsInfo.roles?.reviewer?.model

export function scanFrame(page, on) {
  const f = S.frames.find(fr => fr.id === page)
  if (f?.ready) post(f, { type: 'scan', on })
}

export function snapFrame(f, scale) {
  return new Promise((resolve, reject) => {
    const seq = ++review.seq
    review.waits.set(seq, { resolve, reject })
    post(f, { type: 'snap', seq, scale })
    setTimeout(() => { if (review.waits.delete(seq)) reject(new Error('the screenshot timed out')) }, 30000)
  })
}

// A page measured the way a visitor sees it, at a given width: a hidden copy of
// it reports which floated text panels cover other text and, if asked, a
// screenshot. The reviewer only ever saw the 1280px canvas frame before.
export const checks = new Map()
const FN_JS = `function fontEmbedCSS() {
    // html-to-image can't read a stylesheet from another origin (Google Fonts), so a
    // snapshot fell back to system fonts and a resting page seemed to change font.
    // Fetch the faces ourselves (latin only, each file once) and hand them over inlined.
    const href = document.querySelector('link[href*="fonts.googleapis.com"]')?.href || ''
    if (!href) return Promise.resolve('')
    if (fontEmbedCSS.href !== href) {
      fontEmbedCSS.href = href
      const files = new Map()
      const inline = u => files.get(u) || files.set(u, fetch(u).then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b) }))).get(u)
      fontEmbedCSS.css = fetch(href).then(r => r.text()).then(async css => {
        const blocks = css.split(/(?=\\/\\* [\\w-]+ \\*\\/)/).filter(b => !/^\\/\\* /.test(b) || /^\\/\\* latin(-ext)? \\*\\//.test(b))
        const out = await Promise.all(blocks.map(async b => {
          for (const u of new Set([...b.matchAll(/url\\((https:[^)]+)\\)/g)].map(m => m[1]))) b = b.split(u).join(await inline(u))
          return b
        }))
        return out.join('\\n')
      }).catch(() => '')
    }
    return fontEmbedCSS.css
  }`
function checkPage(id, width, snap) {
  const seq = `c${++review.seq}`
  const script = `<script>addEventListener('load', async () => {
  if (document.fonts) await document.fonts.ready
  await new Promise(r => setTimeout(r, 900))
  const guard = ${BOOT.guard || '() => []'}
  const out = { type: 'check', seq: ${JSON.stringify(seq)}, overlaps: guard(document.body, true), broken: [] }
  // a tag a builder left half-written: its stray words end up as attribute names
  for (const el of document.body.querySelectorAll('*')) for (const a of [...el.attributes]) if (!/^[A-Za-z_:][\\w.:-]*$/.test(a.name)) {
    const layer = el.closest('[data-layer]')?.dataset.layer
    if (layer && !out.broken.some(b => b.layer === layer)) out.broken.push({ layer, tag: el.tagName.toLowerCase(), junk: a.name.slice(0, 40) })
    el.removeAttribute(a.name)
  }
  // a phone page is long and narrow: shot at full size, the top 4200px, so the text stays readable
  const full = document.body.scrollHeight, h = Math.min(full, 4200), r = 1
  out.r = r
  out.sections = [...document.body.children].filter(e => e.dataset.layer).map(e => { const b = e.getBoundingClientRect(); return { layer: e.dataset.layer, top: Math.round(b.top + scrollY), height: Math.round(b.height) } }).filter(x => x.top < h)
  if (${!!snap}) try {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'; s.onload = ok; s.onerror = fail; document.head.append(s) })
    const opts = { width: ${width}, height: h, pixelRatio: r, quality: 0.72, backgroundColor: getComputedStyle(document.body).backgroundColor }
    const css = await (${FN_JS})()
    if (css) opts.fontEmbedCSS = css
    out.image = await htmlToImage.toJpeg(document.body, opts).catch(() => htmlToImage.toJpeg(document.body, { ...opts, skipFonts: true }))
  } catch (err) { out.snapError = String(err && err.message || err) }
  parent.postMessage(out, '*')
})<\/script>`
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', FRAME_SANDBOX)
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:900px;border:0;pointer-events:none`
  return new Promise(resolve => {
    const done = data => { clearTimeout(timer); checks.delete(seq); iframe.remove(); resolve(data) }
    const timer = setTimeout(() => done(null), 30000)
    checks.set(seq, { iframe, done })
    iframe.srcdoc = pageDoc(id, script)
    document.body.append(iframe)
  })
}

// ---------- Scribble (engine/marks.mjs): a hidden copy of the page finds what a mark points at (kresilo's
// rule: the smallest element holding the mark's centre, else the one it covers most of, at least a
// quarter), and draws a draft section on its own for its picture beside the original.
export const ANCHOR_JS = `(box) => {
  const H = document.body.scrollHeight, W = document.documentElement.clientWidth
  const m = { x0: box.x * W, y0: box.y * H, x1: (box.x + box.w) * W, y1: (box.y + box.h) * H }
  const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2
  const of = el => { const r = el.getBoundingClientRect(); return { x0: r.left + scrollX, y0: r.top + scrollY, x1: r.right + scrollX, y1: r.bottom + scrollY } }
  const area = b => Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0))
  const holds = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
  const over = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? w * h : 0 }
  const sects = [...document.body.children].filter(e => e.dataset.layer)
  const things = sects.flatMap(s => [...s.querySelectorAll('*')]).filter(e => !e.closest('svg') || e.tagName.toLowerCase() === 'svg').filter(e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden' })
  let pick = null
  for (const e of things) { const b = of(e); if (holds(b, cx, cy) && (!pick || area(b) <= area(of(pick)))) pick = e }
  if (!pick) { let best = 0; for (const e of things) { const b = of(e), share = over(m, b) / Math.min(area(m), area(b)); if (share > best && share >= 0.25) { best = share; pick = e } } }
  const sect = pick ? pick.closest('[data-layer]') : sects.find(s => holds(of(s), cx, cy)) || null
  const out = { layer: sect?.dataset.layer || null }
  if (!pick || !sect) return out
  const path = [], parts = []
  for (let el = pick; el && el !== sect; el = el.parentElement) {
    const p = el.parentElement
    path.unshift([...p.children].indexOf(el))
    if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break }
    const tag = el.tagName.toLowerCase(), same = [...p.children].filter(c => c.tagName === el.tagName)
    parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(el) + 1) + ')' : tag)
  }
  out.selector = parts.slice(-5).join(' > ')
  out.path = path
  out.tag = pick.tagName.toLowerCase()
  out.text = (pick.innerText || pick.getAttribute('alt') || pick.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 120)
  const bg = getComputedStyle(pick).backgroundImage
  if (out.tag === 'img' || out.tag === 'canvas' || (bg && bg !== 'none')) {
    const b = of(pick), w = b.x1 - b.x0, h = b.y1 - b.y0
    const c = v => Math.max(0, Math.min(1, v))
    out.region = { x: c((m.x0 - b.x0) / w), y: c((m.y0 - b.y0) / h), w: c((m.x1 - m.x0) / w), h: c((m.y1 - m.y0) / h) }
  }
  return out
}`
// a hidden copy of a page (or of one section) at desktop width; `body` runs in it once it has loaded
export function hiddenCopy(id, run, { body = null, timeout = 30000 } = {}) {
  const seq = `m${++review.seq}`
  const script = `<script>addEventListener('load', async () => {
  if (document.fonts) await document.fonts.ready
  await new Promise(r => setTimeout(r, 700))
  let out = {}
  try { out = await (${run})() } catch (err) { out = { error: String(err && err.message || err) } }
  parent.postMessage({ ...out, type: 'check', seq: ${JSON.stringify(seq)} }, '*')
})<\/script>`
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', FRAME_SANDBOX)
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0;pointer-events:none'
  return new Promise(resolve => {
    const done = data => { clearTimeout(timer); checks.delete(seq); iframe.remove(); resolve(data) }
    const timer = setTimeout(() => done(null), timeout)
    checks.set(seq, { iframe, done })
    iframe.srcdoc = pageDoc(id, script, body)
    document.body.append(iframe)
  })
}
export const SNAP_SECTION = `async () => {
  await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'; s.onload = ok; s.onerror = fail; document.head.append(s) })
  const h = Math.min(document.body.scrollHeight, 3000)
  const opts = { width: 1280, height: h, pixelRatio: 0.5, quality: 0.8, backgroundColor: getComputedStyle(document.body).backgroundColor }
  const css = await (${FN_JS})()
  if (css) opts.fontEmbedCSS = css
  return { image: await htmlToImage.toJpeg(document.body, opts).catch(() => htmlToImage.toJpeg(document.body, { ...opts, skipFonts: true })), height: h }
}`

// A section's layer id in a page, as its key: the page's own, else the shared one.
export const layerKey = (page, id) => S.layers.has(key(page, id)) ? key(page, id) : key('*', id)

export async function reviewRun() {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  if (!run || review.busy) return
  review.busy = true
  // the scored review (engine/review.mjs): a page under the bar has its fixes made, then it is
  // photographed and reviewed again, until it passes or the server's round limit says stop
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const fixing = keys => keys.some(k => ['assigned', 'streaming'].includes(S.layers.get(k)?.status))
  try {
    pages: for (const [i, f] of S.frames.entries()) for (let round = 1; ; round++) {
      if (f.frozen) thaw(f)
      // a page waking from rest needs its sections drawn before the photo, or the reviewer sees a blank page
      for (let t = 0; t < 60 && !(f.ready && f.slots.size && f.geo.height > 400); t++) await wait(200)
      await wait(1200)
      if (!f.ready) break
      const shot = await snapFrame(f)
      // the shared nav and footer are reviewed once, on the first page
      const sections = [...f.slots.keys()].map(k => S.layers.get(k))
        .filter(l => l && l.status === 'done' && l.text.trim() && (l.page !== '*' || i === 0) && f.geo.slots[l.key])
        .map(l => {
          const b = f.geo.slots[l.key].box
          return { key: l.key, role: l.role, top: Math.round(b[1] * shot.r), height: Math.round(b[3] * shot.r), html: l.text }
        })
        .sort((a, b) => a.top - b.top)
      if (!sections.length) break
      // measured, at desktop and phone width, one after the other to spare memory
      const desk = await checkPage(f.id, 1280, false)
      const phone = await checkPage(f.id, 390, true)
      const measured = []
      for (const [w, c] of [[1280, desk], [390, phone]]) for (const o of c?.overlaps || []) {
        if (!o.layer) continue
        measured.push({ section: layerKey(f.id, o.layer), problem: `At ${w}px wide, the floated panel “${o.panel}” sits on top of “${o.covers}”`, fix: 'Take that panel out of absolute positioning: put it beside or below the map or picture in the normal flow. Keep absolute only for small pins, badges and decoration.' })
      }
      for (const b of desk?.broken || []) measured.push({ section: layerKey(f.id, b.layer), problem: `Broken markup: a <${b.tag}> tag is half-written (stray “${b.junk}” inside it), and stray text may show on the page`, fix: 'Rewrite the section as clean, complete HTML: every tag closed, no notes or instructions as visible text.' })
      if (!phone?.image) feed(null, `📱 couldn't photograph ${f.title} at phone width${phone?.snapError ? `: ${phone.snapError}` : ''}; reviewing desktop only`, 'err')
      if (measured.length) feed(null, `📐 measured ${measured.length} layout problem${measured.length > 1 ? 's' : ''} on ${f.title} (desktop and phone)`, 'sys')
      const byKey = new Map(sections.map(x => [x.key, x]))
      const mobile = phone?.image ? { image: phone.image, sections: phone.sections.map(x => ({ ...byKey.get(layerKey(f.id, x.layer)), top: x.top, height: x.height })).filter(x => x.key) } : null
      const res = await api(`/api/runs/${encodeURIComponent(run)}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: f.id, title: f.title, image: shot.image, sections, measured, mobile, round })
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        scanFrame(f.id, false)
        feed(null, `review: ${out.error || `HTTP ${res.status}`}`, 'err')
        if (/no reviewer|no such run/.test(out.error || '')) break pages
        break
      }
      if (!out.again) break
      // the fixes start as the reply comes back: wait for them to begin, then to finish
      const keys = (out.issues || []).map(x => x.section)
      feed(null, `🔎 ${f.title} scored ${out.score}/10: fixing, then round ${round + 1}`, 'sys')
      for (let t = 0; t < 25 && !fixing(keys); t++) await wait(200)
      for (let t = 0; t < 900 && fixing(keys); t++) await wait(200)
    }
  } catch (err) {
    feed(null, `review: ${err.message || err}`, 'err')
  }
  review.busy = false
}

// A live build is reviewed once it is finished and its images have arrived.
export function autoReview() {
  if (!reviewerOn() || review.auto === S.run) return
  const run = review.auto = S.run
  const t0 = performance.now()
  const tick = () => {
    if (S.run !== run || viewing) return
    if (S.imgSettled < S.imgQueued && performance.now() - t0 < 150000) return setTimeout(tick, 1500)
    // let the last images load and the frames settle before the photo
    setTimeout(() => S.run === run && !viewing && reviewRun(), 2500)
  }
  tick()
}

els.reviewBtn.onclick = e => { if (!reviewerOn()) { e.stopPropagation(); return toggleModels(true) } reviewRun() }
