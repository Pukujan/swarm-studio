// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): the Design panel, manual editing, undo and redo, export.
import { pageSeoHtml, wirePageSeo } from '../seo.js'
import { $, S, els, api, cam, FRAME_W, history, BOOT, ico, commandOps } from './core.js'
import { slotFor, applyTheme, live, pick, say } from './deck.js'
import { panels } from './settings.js'
import { picturesHtml, wirePictures, closeable } from './start.js'
import { traceView, viewing } from './replay.js'
import { shownRun } from './film.js'
import { feed, renderTheme, botMsg, toolbarKey, setToolbarKey } from './panels.js'
import { txt, textEdit, cmt } from './marks.js'

// ---------- Design panel
// Figma's right sidebar for the swarm: the Design tab shows the properties of the
// section an agent is building (auto layout, fill, stroke, radius, type, effects),
// read live from the Tailwind classes it is writing; the Variables tab shows the
// design system the planner set up (colour tokens, type families and scale,
// radius) and how often the agents use each token.

export const design = { tab: 'design', tabPinned: false, pinned: null, agent: null, layer: null, at: 0, last: '', lastVars: '', varsAt: 0, prev: new Map(), chg: new Map() }

export function showDtab(name) {
  design.tab = name
  // @ts-ignore
  for (const el of document.querySelectorAll('[data-dtab]')) el.classList.toggle('on', el.dataset.dtab === name)
  design.last = design.lastVars = ''
}

export function loadThemeFonts(t) {
  const fam = n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;600;700`
  const names = [t.fonts?.heading, t.fonts?.body].filter(Boolean)
  if (!names.length) return
  let link = $('#theme-fonts')
  if (!link) { link = document.createElement('link'); link.id = 'theme-fonts'; link.rel = 'stylesheet'; document.head.append(link) }
  link.href = `https://fonts.googleapis.com/css2?${names.map(fam).join('&')}&display=swap`
}

export const TW_SIZE = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60, '7xl': 72, '8xl': 96, '9xl': 128 }
export const TW_WEIGHT = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 }
export const TW_RADIUS = { none: '0', sm: '2', '': '4', md: '6', lg: '8', xl: '12', '2xl': '16', '3xl': '24', full: '∞' }
export const BP = { '': 0, sm: 1, md: 2, lg: 3, xl: 4 }
export const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
export const space = v => (v === 'px' ? 1 : /^\[(.+)\]$/.test(v) ? v.slice(1, -1) : Number(v) * 4)

// The token of a family that applies at desktop width (the widest breakpoint up to xl wins).
export function tw(classes, re) {
  let best = null, rank = -1
  for (const tok of classes.split(/\s+/)) {
    const i = tok.lastIndexOf(':')
    const bp = i < 0 ? '' : tok.slice(0, i)
    if (!(bp in BP)) continue
    const m = tok.slice(i + 1).match(re)
    if (m && BP[bp] >= rank) { best = m; rank = BP[bp] }
  }
  return best
}

export function sectionProps(l) {
  const classes = [...l.text.matchAll(/class="([^"]*)"?/g)].map(m => m[1])
  const root = classes[0] || ''
  const all = classes.join(' ')
  const vars = S.theme?.vars || {}
  const varSw = name => `<span class="sw" style="background:${esc(vars[`--${name}`] || 'transparent')}"></span>${esc(name)}`
  const rows = []
  const EDITABLE = { dir: 'dir', gap: 'gap', align: 'align', pad: 'pad', bg: 'bg', hsize: 'hsize', radius: 'radius' }
  const row = (sec, k, label, val) => val != null && val !== '' && rows.push({ sec, k, label, val, edit: EDITABLE[k] })
  const s = slotFor(l)
  row('Frame', 'w', 'W', s ? Math.round(s.box.width) : 1280)
  row('Frame', 'h', 'H', s ? Math.round(s.box.height) : l.height)
  const lay = classes.slice(0, 5).find(c => tw(c, /^(flex|grid|inline-flex)$/)) || ''
  if (lay) {
    const isGrid = !!tw(lay, /^grid$/)
    const cols = tw(lay, /^grid-cols-(\d+)$/)
    row('Auto layout', 'dir', '', isGrid ? `▦ Grid${cols ? ` · ${cols[1]} cols` : ''}` : tw(lay, /^flex-col$/) && !tw(lay, /^flex-row$/) ? '↓ Vertical' : '→ Horizontal')
    const gap = tw(lay, /^gap-(\S+)$/)
    row('Auto layout', 'gap', 'gap', gap ? space(gap[1]) : 0)
    const al = tw(lay, /^(items|justify)-(\S+)$/)
    row('Auto layout', 'align', 'align', al ? al[2] : 'start')
  }
  const px = tw(root, /^px-(\S+)$/) || tw(root, /^p-(\S+)$/), py = tw(root, /^py-(\S+)$/) || tw(root, /^p-(\S+)$/)
  row('Auto layout', 'pad', 'padding', `${py ? space(py[1]) : 0} · ${px ? space(px[1]) : 0}`)
  const bg = tw(root, /^bg-\[var\(--([\w-]+)\)\]$/)
  row('Fill', 'bg', '', bg ? varSw(bg[1]) : '<span class="sw"></span>no fill')
  const fills = [...new Set([...all.matchAll(/bg-\[var\(--([\w-]+)\)\]/g)].map(m => m[1]))].filter(f => f !== bg?.[1]).slice(0, 3)
  fills.forEach((f, i) => row('Fill', `f${i}`, '', varSw(f)))
  const stroke = all.match(/border-\[var\(--([\w-]+)\)\]/)
  if (stroke) row('Stroke', 'stroke', '', `${varSw(stroke[1])} · ${(all.match(/\bborder-(\d)\b/) || [])[1] || 1}px`)
  const rad = all.match(/\brounded(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[var\(--radius\)\]))?\b/)
  if (rad) row('Stroke', 'radius', 'radius', rad[1]?.startsWith('[') ? S.theme?.radius || 'var' : TW_RADIUS[rad[1] || ''])
  const sizes = [...all.matchAll(/(?:^|\s)(?:(?:sm|md|lg|xl):)?text-(xs|sm|base|lg|xl|[2-9]xl)\b/g)].map(m => TW_SIZE[m[1]])
  if (sizes.length) {
    const big = Math.max(...sizes)
    const count = {}
    sizes.forEach(z => (count[z] = (count[z] || 0) + 1))
    const body = +Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]
    const weights = [...all.matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)].map(m => TW_WEIGHT[m[1]])
    const heading = /font-\[var\(--font-heading\)\]|<h[1-3]/.test(l.text) ? S.theme?.fonts?.heading : null
    row('Typography', 'hfont', '', heading ? `<i>Aa</i>${esc(heading)}` : null)
    row('Typography', 'hsize', 'heading', `${big}${weights.length ? ` · ${Math.max(...weights)}` : ''}`)
    row('Typography', 'bsize', 'body', `${body} · ${S.theme?.fonts?.body ? esc(S.theme.fonts.body) : 'sans'}`)
    const lead = all.match(/\bleading-(\w+)/), track = all.match(/\btracking-(\w+)/)
    if (lead || track) row('Typography', 'lt', '', `${lead ? `leading ${lead[1]}` : ''}${lead && track ? ' · ' : ''}${track ? `tracking ${track[1]}` : ''}`)
  }
  const fx = [...new Set([...all.matchAll(/\b(shadow(?:-\w+)?|backdrop-blur(?:-\w+)?|opacity-\d+|blur(?:-\w+)?)\b/g)].map(m => m[1]))].slice(0, 3)
  fx.forEach((f, i) => row('Effects', `fx${i}`, '', esc(f)))
  row('Layers', 'els', 'elements', (l.text.match(/<[a-z][a-z0-9]*\b/gi) || []).length)
  row('Layers', 'links', 'links', (l.text.match(/data-goto=/g) || []).length)
  return rows
}

export function pickSelection(now) {
  if (S.sel && S.layers.has(S.sel)) { design.layer = S.sel; return { a: null, l: S.layers.get(S.sel) } }
  const has = id => { const a = S.agents.get(id); return a?.layer ? a : null }
  let a = has(design.pinned)
  if (!a && has(design.agent) && now - design.at < 3500) a = has(design.agent)
  if (!a) a = has(S.lastActive) || [...S.agents.values()].find(x => x.layer)
  if (a && a.id !== design.agent) { design.agent = a.id; design.at = now }
  if (a) design.layer = a.layer
  return { a, l: design.layer && S.layers.get(design.layer) }
}

export function renderDesign(now) {
  if (!panels.has('design')) return
  if (design.tab === 'vars') return renderVars(now)
  const { a, l } = pickSelection(now)
  let html
  if (!l) {
    // a finished site: the page in view's search title, description and share picture
    const f = S.tEnd && S.kind !== 'game' && pageInView()
    if (f && els.dDesign.querySelector('.dseo')?.contains(document.activeElement)) return
    html = f ? pageSeoHtml({ page: f, seo: S.seo.get(f.id), brand: S.brand || '', pictures: pagePictures(f.id) })
      : `<div class="dempty">${S.layers.size ? 'Click a section on the canvas to edit it, or an agent in the Agents panel to follow its work.' : 'Start a build. While the swarm works, this shows the properties of the section an agent is designing: auto layout, fills, type and effects.'}</div>`
  } else {
    const owner = S.agents.get(l.agent) || a
    const rows = sectionProps(l)
    let body = '', sec = ''
    for (const r of rows) {
      const id = `${l.key}/${r.k}`
      const before = design.prev.get(id)
      if (before !== undefined && before !== r.val) design.chg.set(id, now + 700)
      design.prev.set(id, r.val)
      if (r.sec !== sec) {
        if (sec) body += '</div></div>'
        sec = r.sec
        body += `<div class="dsec"><h4>${sec}</h4><div class="drow${['Fill', 'Effects', 'Typography'].includes(sec) ? ' one' : ''}">`
      }
      const editable = r.edit && l.status === 'done'
      body += `<div class="dval${(design.chg.get(id) || 0) > now ? ' chg' : ''}${editable ? ' edit' : ''}"${editable ? ` data-edit="${r.edit}"` : ''}>${r.label ? `<i>${r.label}</i>` : ''}${r.val}</div>`
    }
    if (sec) body += '</div></div>'
    const where = `${l.page === '*' ? 'shared' : l.page} · ${l.status === 'done' ? 'done' : 'building'}`
    const mode = S.sel ? 'selected ✕' : design.pinned ? 'pinned' : 'following'
    const hint = l.status === 'done' ? '<div class="dhint">Click a value to change this section. Variables change every page.</div>' : `<div class="dhint">Editable when ${esc(owner?.name || 'its agent')} finishes. Click any finished section on the canvas to edit it.</div>`
    html = `<div class="dsel"><span class="dot" style="background:${owner?.color || '#888'}"></span><div><b>${esc(l.role || l.id)}</b><small>${esc(owner?.name || '')} · ${esc(where)}</small></div><span class="pin">${mode}</span></div>${hint}${l.status === 'done' && S.run ? `<div class="drow2"><button class="dtrace" aria-label="Every model call for this section: the prompt and what came back">🔍 Trace</button><button class="dversions" aria-label="Every version this section has had; put any one back">🕘 Versions</button></div>` : ''}${l.status === 'done' ? picturesHtml(l) : ''}${body}`
  }
  if (html !== design.last) {
    design.last = html
    els.dDesign.innerHTML = html
    const pin = els.dDesign.querySelector('.pin')
    if (pin) pin.onclick = () => { if (S.sel) S.sel = null; else design.pinned = design.pinned ? null : design.agent; design.last = '' }
    const tr = els.dDesign.querySelector('.dtrace')
    const vs = els.dDesign.querySelector('.dversions')
    if (vs) vs.onclick = () => { const l = S.layers.get(S.sel || design.layer); if (l) sectionVersions(l, vs) }
    wirePictures(S.layers.get(S.sel || design.layer))
    if (tr) tr.onclick = () => { const l = S.layers.get(S.sel || design.layer); if (l) traceView(S.run, { layer: l.id, title: l.role || l.id }) }
    // @ts-ignore
    wirePageSeo(els.dDesign, { run: shownRun(), api, onError: m => feed(null, `search & share: ${m}`, 'err') })
  }
}

// the page the view is on: the frame under the middle of the canvas, else the nearest
export function pageInView() {
  if (!S.frames.length) return null
  const cx = (els.viewport.clientWidth / 2 - cam.x) / cam.s
  return S.frames.reduce((best, f) => (Math.abs(f.x + FRAME_W / 2 - cx) < Math.abs(best.x + FRAME_W / 2 - cx) ? f : best))
}
export const pagePictures = id => [...S.images.entries()].filter(([k, src]) => src && k.startsWith(`${id}/`)).map(([, src]) => src)

export function renderVars(now) {
  if (now - design.varsAt < 900 && !(S.themeAt && now - S.themeAt < 3000)) return
  design.varsAt = now
  const t = S.theme
  if (!t) {
    const html = S.run ? '<div class="dsetup">Setting up the design system</div><div class="dempty">The planner picks colour tokens, type and radius first; the agents build everything from them.</div>' : '<div class="dempty">The design system appears here when a build starts.</div>'
    if (html !== design.lastVars) els.dVars.innerHTML = design.lastVars = html
    return
  }
  const texts = [...S.layers.values()].map(l => l.text).join('\n')
  const uses = name => (texts.match(new RegExp(`var\\(--${name}\\)`, 'g')) || []).length
  const fresh = S.themeAt && now - S.themeAt < 3000
  let i = 0
  const anim = () => (fresh ? ` reveal" style="animation-delay:${i++ * 110}ms` : '')
  const colors = Object.entries(t.vars || {}).map(([k, v]) => `<div class="dvar edit${anim()}" data-var="${esc(k)}"><span class="sw" style="background:${esc(v)}"></span><div><code>${esc(k.slice(2))}</code><br><small>${esc(v)}</small></div><small>${uses(k.slice(2))}×</small></div>`).join('')
  const fontRow = (role, name) => `<div class="dvar edit${anim()}" data-font="${role}" style="grid-template-columns:44px 1fr auto"><span class="ag" style="font:600 24px/1 '${esc(name)}',serif">Ag</span><div><code>${role}</code><br><small>${esc(name)}</small></div><small>${uses(`font-${role}`)}×</small></div>`
  const sizes = {}
  for (const m of texts.matchAll(/(?:^|\s)(?:(?:sm|md|lg|xl):)?text-(xs|sm|base|lg|xl|[2-9]xl)\b/g)) sizes[m[1]] = (sizes[m[1]] || 0) + 1
  const scale = Object.entries(sizes).sort((a, b) => TW_SIZE[b[0]] - TW_SIZE[a[0]]).slice(0, 7).map(([k, n]) => {
    const px = TW_SIZE[k], heading = px >= 24
    return `<div class="dscale edit" data-size="${k}"><code>${k} · ${px}</code><span style="font:${heading ? 600 : 400} ${Math.min(px, 22)}px '${esc(heading ? t.fonts?.heading : t.fonts?.body)}',sans-serif">${heading ? 'Heading' : 'Body text'}</span><small>${n}×</small></div>`
  }).join('')
  const html = `${fresh ? '<div class="dsetup">Setting up the design system</div>' : ''}
<div class="dsec"><h4>${esc(t.name || 'Theme')}<small>${esc(t.direction || '').slice(0, 40)}</small></h4></div>
<div class="dsec"><h4>Colors<small>${Object.keys(t.vars || {}).length} tokens</small></h4>${colors}</div>
<div class="dsec"><h4>Typography</h4>${fontRow('heading', t.fonts?.heading || 'Georgia')}${fontRow('body', t.fonts?.body || 'Inter')}</div>
<div class="dsec"><h4>Scale<small>whole site</small></h4><div class="dsteps"><span>Type</span><button data-scale="type:-1" aria-label="Every heading one step smaller">−</button><button data-scale="type:1" aria-label="Every heading one step bigger">+</button><span>Spacing</span><button data-scale="space:-1" aria-label="Tighter spacing everywhere">−</button><button data-scale="space:1" aria-label="Looser spacing everywhere">+</button></div></div>
${scale ? `<div class="dsec"><h4>Type scale<small>click to remap</small></h4>${scale}</div>` : ''}
<div class="dsec"><h4>Radius</h4><div class="dvar edit${anim()}" data-radius="" style="grid-template-columns:18px 1fr auto"><span class="sw" style="border-radius:${esc(t.radius || '12px')};border:2px solid var(--accent);background:none"></span><code>radius</code><small>${esc(t.radius || '')} · ${uses('radius')}×</small></div></div>`
  if (html !== design.lastVars) els.dVars.innerHTML = design.lastVars = html
}

// ---------- editing: people change the design next to the agents
// Two kinds of edit. Group edits change the design system and so every page at
// once: a colour token, a font, the radius, one step of the type scale, or the
// whole type or spacing scale up or down. Section edits change one finished
// section: padding, gap, direction, alignment, fill, heading size, corners.
// Each edit is an event saved with the run, so a reopened file replays it.

export const CLIENT = Math.random().toString(36).slice(2, 8)
export const SIZES = Object.keys(TW_SIZE)
export const SPACE = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96']
export const FONTS = ['Inter', 'DM Sans', 'Karla', 'Manrope', 'Space Grotesk', 'IBM Plex Sans', 'Work Sans', 'Syne', 'Fraunces', 'Playfair Display', 'DM Serif Display', 'Instrument Serif', 'Libre Baskerville', 'JetBrains Mono']
export const SIZE_RE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/
export const SPACE_RE = /^(-?)(p|px|py|pt|pb|pl|pr|gap|gap-x|gap-y|space-y|space-x|mt|mb|my)-([\d.]+)$/

// Rewrite the class tokens of every class attribute in some HTML. `fn` gets the
// token without its breakpoint prefix and returns a replacement (or the same).
export function mapClasses(html, fn) {
  return html.replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(/\s+/).map(tok => {
    const i = tok.lastIndexOf(':')
    const bp = i < 0 ? '' : tok.slice(0, i)
    if (!(bp in BP)) return tok
    const out = fn(tok.slice(i + 1))
    return out === tok.slice(i + 1) ? tok : out && (bp ? `${bp}:${out}` : out)
  }).filter(Boolean).join(' ')}"`)
}

export const stepIn = (list, v, d) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(v) + d))]

// Class-level group edits, applied to a layer's HTML.
export function restyle(l, e) {
  if (!l.text || l.status !== 'done') return
  let out = l.text
  if (e.kind === 'size') out = mapClasses(out, t => (t === `text-${e.from}` ? `text-${e.value}` : t))
  if (e.kind === 'scale' && e.axis === 'type') out = mapClasses(out, t => {
    const m = t.match(SIZE_RE)
    return m && TW_SIZE[m[1]] >= 18 ? `text-${stepIn(SIZES, m[1], Number(e.value))}` : t
  })
  if (e.kind === 'scale' && e.axis === 'space') out = mapClasses(out, t => {
    const m = t.match(SPACE_RE)
    return m && SPACE.includes(m[3]) && m[3] !== '0' ? `${m[1]}${m[2]}-${stepIn(SPACE, m[3], Number(e.value) * 2)}` : t
  })
  if (out !== l.text) { l.text = out; l.ver++ }
}

export function setCls(el, drop, add) {
  if (!el) return
  const toks = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).filter(tok => {
    const i = tok.lastIndexOf(':')
    return !((i < 0 ? '' : tok.slice(0, i)) in BP && drop.test(tok.slice(i + 1)))
  })
  if (add) toks.push(...add.split(' '))
  el.setAttribute('class', toks.join(' '))
}

export function layoutEl(root) {
  return [root, ...root.querySelectorAll('*')].slice(0, 8).find(el => /(^|\s)((sm|md|lg|xl):)?(flex|grid|inline-flex)(\s|$)/.test(el.getAttribute('class') || ''))
}

export function editSection(l, prop, v) {
  const doc = new DOMParser().parseFromString(`<body>${l.text}</body>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return
  const lay = layoutEl(root)
  if (prop === 'pad') {
    // p-N becomes px-N so only the vertical padding changes
    setCls(root, /^p-/, '')
    const p = (root.getAttribute('class') || '').match(/(?:^|\s)p-(\S+)/)
    setCls(root, /^(py|pt|pb)-/, `py-${v}${p ? ` px-${p[1]}` : ''}`)
  }
  if (prop === 'gap') setCls(lay, /^gap-/, `gap-${v}`)
  if (prop === 'dir') {
    const grid = v.startsWith('grid')
    setCls(lay, /^(flex|inline-flex|grid|flex-row|flex-col|flex-row-reverse|flex-col-reverse|grid-cols-\S+)$/, grid ? `grid grid-cols-${v.slice(5)}` : `flex flex-${v}`)
  }
  if (prop === 'align') setCls(lay, /^items-/, `items-${v}`)
  if (prop === 'bg') setCls(root, /^bg-(\[(var|#)|white|black|transparent|[a-z]+-\d{2,3})/, v === 'none' ? '' : `bg-[var(--${v})]`)
  if (prop === 'hsize') {
    const h = root.querySelector('h1, h2, h3') || [...root.querySelectorAll('[class*="text-"]')].sort((a, b) => sizeOf(b) - sizeOf(a))[0]
    setCls(h, SIZE_RE, `text-${v}`)
  }
  if (prop === 'radius') {
    for (const el of [root, ...root.querySelectorAll('[class*="rounded"]')]) {
      if (!/rounded/.test(el.getAttribute('class') || '')) continue
      setCls(el, /^rounded(-.*)?$/, v === 'theme' ? 'rounded-[var(--radius)]' : v === '' ? 'rounded' : `rounded-${v}`)
    }
  }
  l.text = doc.body.innerHTML
  l.ver++
}
export const sizeOf = el => Math.max(0, ...(el.getAttribute('class') || '').split(/\s+/).map(t => TW_SIZE[(t.split(':').pop().match(SIZE_RE) || [])[1]] || 0))

export function applyEdit(e) {
  if (!e.id || S.edits.has(e.id)) return
  S.edits.add(e.id)
  const t = S.theme
  if (e.kind === 'var' && t) t.vars = { ...t.vars, [e.name]: e.value }
  if (e.kind === 'font' && t) { t.fonts = { ...t.fonts, [e.role]: e.value }; loadThemeFonts(t) }
  if (e.kind === 'radius' && t) t.radius = e.value
  if (['var', 'font', 'radius'].includes(e.kind)) { S.frames.forEach(applyTheme); if (t) renderTheme() }
  if (e.kind === 'size' || e.kind === 'scale') {
    S.classEdits.push(e)
    for (const l of S.layers.values()) restyle(l, e)
  }
  if (e.kind === 'section') { const l = S.layers.get(e.layer); if (l?.status === 'done') editSection(l, e.prop, e.value) }
  design.last = design.lastVars = ''
  design.varsAt = 0
  if (e.by && e.by !== CLIENT && live(e)) feed(null, `Someone else edited the design: ${describeEdit(e)}`, 'sys')
}

export function describeEdit(e) {
  return {
    var: () => `${e.name.slice(2)} → ${e.value}`,
    font: () => `${e.role} font → ${e.value}`,
    radius: () => `radius → ${e.value}`,
    size: () => `every text-${e.from} → text-${e.value}`,
    scale: () => `${e.axis === 'type' ? 'type scale' : 'spacing'} ${Number(e.value) > 0 ? 'up' : 'down'} a step`,
    section: () => `${S.layers.get(e.layer)?.role || e.layer}: ${e.prop} → ${e.value}`
  }[e.kind]?.() || e.kind
}

export const REACT = {
  var: e => [`ooh, new ${e.name.slice(2)}. matching it`, `${e.value}? bold. I like it`, 'colour change! repainting my bit', 'ok that token just got better'],
  font: e => [`${e.value}, nice pick`, `switching to ${e.value} 👌`, 'new font, who dis'],
  radius: () => ['softer corners, noted', 'rounding everything off', 'corner police approve'],
  size: () => ['type scale changed, adjusting', 'bigger text, love it', 'noted, using the new size'],
  scale: e => [e.axis === 'type' ? 'headings got louder 📣' : 'more breathing room, nice', 'whole system shifted, on it', 'scale change! everyone re-check your sections'],
  section: () => ['hey, that\'s my section 👀', 'oh nice tweak', 'ok fine, that does look better']
}

// A person's edit: apply it here, save it, and let an agent react.
export async function commitEdit(edit) {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  if (!run) return
  const e = { ...edit, id: `${CLIENT}${Date.now().toString(36)}`, by: CLIENT, t: Date.now() }
  if (!edit.quiet) remember(undoFor(e))
  delete e.quiet
  applyEdit(e)
  if (edit.quiet) return saveEdit(run, e)
  feed(null, `You edited the design: ${describeEdit(e)}`, 'sys')
  const owner = e.kind === 'section' && S.agents.get(S.layers.get(e.layer)?.agent)
  const a = owner || pick([...S.agents.values()].filter(x => x.layer) .concat([...S.agents.values()]))
  if (a) setTimeout(() => say(a, pick(REACT[e.kind](e))), 500)
  return saveEdit(run, e)
}
export async function saveEdit(run, e) {
  const res = await api(`/api/runs/${encodeURIComponent(run)}/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) }).catch(() => null)
  if (!res?.ok) feed(null, 'That edit is shown here but could not be saved with the file.', 'err')
}

// ---------- undo and redo: ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y. Your design edits and the
// agents' rewrites of a section both go back, and stay back when the file reopens.
export function remember(step) {
  if (!step) return
  history.undo.push(step)
  if (history.undo.length > 100) history.undo.shift()
  history.redo = []
  renderUndo()
}
// what puts an edit back: the value before it, or the section as it was
export function undoFor(e) {
  const t = S.theme || {}
  if (e.kind === 'var') return { kind: 'edit', label: describeEdit(e), back: { kind: 'var', name: e.name, value: t.vars?.[e.name] }, again: { kind: 'var', name: e.name, value: e.value } }
  if (e.kind === 'font') return { kind: 'edit', label: describeEdit(e), back: { kind: 'font', role: e.role, value: t.fonts?.[e.role] }, again: { kind: 'font', role: e.role, value: e.value } }
  if (e.kind === 'radius') return { kind: 'edit', label: describeEdit(e), back: { kind: 'radius', value: t.radius }, again: { kind: 'radius', value: e.value } }
  if (e.kind === 'scale') return { kind: 'edit', label: describeEdit(e), back: { kind: 'scale', axis: e.axis, value: String(-Number(e.value)) }, again: { kind: 'scale', axis: e.axis, value: e.value } }
  if (e.kind === 'size') return { kind: 'edit', label: describeEdit(e), back: { kind: 'size', from: e.value, value: e.from }, again: { kind: 'size', from: e.from, value: e.value } }
  if (e.kind === 'section') {
    const l = S.layers.get(e.layer)
    if (!l?.text) return null
    return { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: null, edit: e, label: describeEdit(e) }
  }
  return null
}
export async function restoreLayer(step, html, why) {
  const run = viewing && viewing !== 'new' ? viewing : S.run
  const l = S.layers.get(step.key)
  if (!run || !l || html == null) return
  l.text = html; l.ver++; l.status = 'done'; S.treeDirty = true
  design.last = ''
  await api(`/api/runs/${encodeURIComponent(run)}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: step.page, layer: step.layer, html, by: CLIENT, why }) }).catch(() => null)
}
export async function undo() {
  const step = history.undo.pop()
  if (!step) return botMsg('Nothing to undo.')
  if (step.kind === 'edit') { if (step.back.value != null) await commitEdit({ ...step.back, quiet: true }) }
  else {
    // a section edit: keep what it looked like after, for redo
    if (step.after == null) step.after = S.layers.get(step.key)?.text
    await restoreLayer(step, step.before, 'undo')
  }
  history.redo.push(step)
  feed(null, `↶ Undid ${step.label}`, 'sys')
  renderUndo()
}
export async function redo() {
  const step = history.redo.pop()
  if (!step) return botMsg('Nothing to redo.')
  if (step.kind === 'edit') await commitEdit({ ...step.again, quiet: true })
  else await restoreLayer(step, step.after, 'redo')
  history.undo.push(step)
  feed(null, `↷ Redid ${step.label}`, 'sys')
  renderUndo()
}
export function renderUndo() {
  const u = document.getElementById('undo-btn'), r = document.getElementById('redo-btn')
  if (!u) return
  // @ts-ignore
  u.disabled = !history.undo.length
  // @ts-ignore
  r.disabled = !history.redo.length
}
document.getElementById('undo-btn').onclick = () => undo()
document.getElementById('redo-btn').onclick = () => redo()
window.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return
  // typing in a field keeps the field's own undo
  // @ts-ignore
  if (e.target.closest('input, textarea, select, [contenteditable]')) return
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if ((k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey)) { e.preventDefault(); redo() }
})

// Every version a section has had: as built, each fix, each restore. Any one comes back.
export async function sectionVersions(l, at) {
  document.querySelector('.fmenu')?.remove()
  const run = viewing && viewing !== 'new' ? viewing : S.run
  const events = await (await api(`/api/runs/${encodeURIComponent(run)}/events`)).json().catch(() => [])
  const asks = events.filter(e => e.type === 'comment:take' && e.page === l.page && e.layer === l.id)
  // each distinct version once, named after where it first came from (undo and redo only repeat one)
  const seen = new Set()
  const versions = events.filter(e => e.type === 'layer:done' && e.page === l.page && e.layer === l.id && e.html && !seen.has(e.html) && seen.add(e.html))
  const m = document.createElement('div')
  m.className = 'fmenu versions'
  const when = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const what = e => e.restored ? (e.why === 'text' ? 'your text edit' : 'put back') : e.fixed ? `rewrite${(() => { const a = asks.filter(x => x.t <= e.t).at(-1); return a ? `: “${a.text.slice(0, 40)}”` : ' after review' })()}` : 'as built'
  m.innerHTML = `<div class="fmh">Versions of ${esc(l.role || l.id)}</div>${versions.slice().reverse().map((e, i) => `<button data-i="${versions.length - 1 - i}"${e.html === l.text ? ' class="on"' : ''}>${esc(when(e.t))} · ${esc(what(e))} · ${Math.round(e.html.length / 100) / 10}k${e.html === l.text ? ' ✓ now' : ''}</button>`).join('') || '<div class="fmh">No saved versions.</div>'}`
  document.body.append(m)
  const r = at.getBoundingClientRect()
  Object.assign(m.style, { top: `${Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)}px`, left: `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px` })
  const close = () => { m.remove(); removeEventListener('mousedown', away) }
  const away = e => { if (!m.contains(e.target)) close() }
  setTimeout(() => addEventListener('mousedown', away))
  m.onclick = async e => {
    // @ts-ignore
    const b = e.target.closest('button[data-i]')
    if (!b) return
    close()
    const v = versions[Number(b.dataset.i)]
    if (v.html === l.text) return
    const step = { kind: 'layer', key: l.key, page: l.page, layer: l.id, before: l.text, after: v.html, label: `${l.role || l.id} back to ${when(v.t)}` }
    remember(step)
    await restoreLayer(step, v.html, 'version')
    feed(null, `🕘 ${l.role || l.id} is back to the ${when(v.t)} version (⌘Z undoes it)`, 'sys')
  }
}

// One small menu for every editable value, Figma style.
export const picker = { el: null }
export function openPicker(anchor, options, current, onPick) {
  closePicker()
  const el = document.createElement('div')
  el.className = 'dpick'
  for (const o of options) {
    const b = document.createElement('button')
    b.className = o.value === current ? 'on' : ''
    b.innerHTML = `${o.swatch ? `<span class="sw" style="background:${esc(o.swatch)}"></span>` : ''}<span style="${o.style || ''}">${esc(o.label)}</span>${o.note ? `<small>${esc(o.note)}</small>` : ''}`
    b.onclick = ev => { ev.stopPropagation(); closePicker(); if (o.value !== current) onPick(o.value) }
    el.append(b)
  }
  document.body.append(el)
  const r = anchor.getBoundingClientRect()
  el.style.left = `${Math.max(8, Math.min(innerWidth - 228, r.left))}px`
  el.style.top = `${Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 8)}px`
  picker.el = el
}
export function closePicker() { picker.el?.remove(); picker.el = null }
document.addEventListener('mousedown', e => { if (picker.el && !picker.el.contains(e.target)) closePicker() })
window.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker() })

export const px = v => `${space(v)}px`
export const SECTION_OPTIONS = {
  pad: () => ['0', '4', '8', '12', '16', '20', '24', '32'].map(v => ({ value: v, label: `${px(v)} top & bottom` })),
  gap: () => ['0', '2', '4', '6', '8', '10', '12', '16'].map(v => ({ value: v, label: px(v) })),
  dir: () => [['col', '↓ Vertical'], ['row', '→ Horizontal'], ['grid-2', '▦ Grid · 2 cols'], ['grid-3', '▦ Grid · 3 cols'], ['grid-4', '▦ Grid · 4 cols']].map(([value, label]) => ({ value, label })),
  align: () => ['start', 'center', 'end', 'stretch'].map(v => ({ value: v, label: v })),
  bg: () => [{ value: 'none', label: 'no fill' }, ...Object.entries(S.theme?.vars || {}).map(([k, v]) => ({ value: k.slice(2), label: k.slice(2), swatch: v }))],
  hsize: () => ['2xl', '3xl', '4xl', '5xl', '6xl', '7xl'].map(v => ({ value: v, label: `${TW_SIZE[v]}px`, note: `text-${v}` })),
  radius: () => [['none', 'square'], ['md', '6px'], ['xl', '12px'], ['2xl', '16px'], ['3xl', '24px'], ['full', 'pill'], ['theme', `theme radius · ${S.theme?.radius || ''}`]].map(([value, label]) => ({ value, label }))
}

els.dDesign.addEventListener('click', e => {
  const v = e.target.closest('[data-edit]')
  const l = design.layer && S.layers.get(design.layer)
  if (!v || !l || l.status !== 'done') return
  const prop = v.dataset.edit
  openPicker(v, SECTION_OPTIONS[prop](), null, value => commitEdit({ kind: 'section', layer: l.key, prop, value }))
})

/** @type {HTMLInputElement & { timer?: any }} */
export const colorInput = Object.assign(document.createElement('input'), { type: 'color', className: 'dcolor' })
document.body.append(colorInput)
export let colorEdit = null
colorInput.addEventListener('input', () => {
  // preview while dragging in the colour picker, save when it settles
  if (!colorEdit || !S.theme) return
  S.theme.vars = { ...S.theme.vars, [colorEdit]: colorInput.value }
  S.frames.forEach(applyTheme)
  clearTimeout(colorInput.timer)
  colorInput.timer = setTimeout(() => commitEdit({ kind: 'var', name: colorEdit, value: colorInput.value }), 450)
})

els.dVars.addEventListener('click', e => {
  const t = S.theme
  if (!t || !S.run) return
  const el = e.target.closest('[data-var], [data-font], [data-radius], [data-size], [data-scale]')
  if (!el) return
  if (el.dataset.var) {
    colorEdit = el.dataset.var
    const v = t.vars[colorEdit] || '#000000'
    colorInput.value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'
    const r = el.getBoundingClientRect()
    colorInput.style.left = `${r.left}px`
    colorInput.style.top = `${r.bottom}px`
    colorInput.showPicker ? colorInput.showPicker() : colorInput.click()
  } else if (el.dataset.font) {
    const role = el.dataset.font
    loadPickerFonts()
    openPicker(el, FONTS.map(f => ({ value: f, label: f, style: `font-family:'${f}';font-size:14px` })), t.fonts?.[role], value => commitEdit({ kind: 'font', role, value }))
  } else if (el.dataset.radius !== undefined) {
    openPicker(el, ['0px', '4px', '8px', '12px', '16px', '24px', '999px'].map(v => ({ value: v, label: v === '999px' ? 'pill' : v })), t.radius, value => commitEdit({ kind: 'radius', value }))
  } else if (el.dataset.size) {
    const from = el.dataset.size
    openPicker(el, SIZES.filter(k => k !== from).map(k => ({ value: k, label: `${TW_SIZE[k]}px`, note: `text-${k}` })), null, value => commitEdit({ kind: 'size', from, value }))
  } else if (el.dataset.scale) {
    const [axis, value] = el.dataset.scale.split(':')
    commitEdit({ kind: 'scale', axis, value })
  }
})

export function loadPickerFonts() {
  if ($('#picker-fonts')) return
  const link = Object.assign(document.createElement('link'), { id: 'picker-fonts', rel: 'stylesheet' })
  link.href = `https://fonts.googleapis.com/css2?${FONTS.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')}&display=swap`
  document.head.append(link)
}

// Click a section on the canvas to select it; click empty canvas to let go.
export function selectAt(f, x, y) {
  const hit = Object.entries(f.geo.slots).find(([, g]) => { const [l, t, w, h] = g.box; return x >= l && x <= l + w && y >= t && y <= t + h })
  S.sel = hit ? hit[0] : null
  if (txt.mode && S.sel && S.layers.get(S.sel)?.status === 'done') { txt.mode = false; setToolbarKey(''); els.viewport.classList.remove('texting'); textEdit(S.layers.get(S.sel)) }
  if (cmt.mode && S.sel) { cmt.mode = false; cmt.open = S.sel; setToolbarKey(''); els.viewport.classList.remove('commenting') }
  else if (cmt.open !== S.sel) cmt.open = null
  design.pinned = null
  if (S.sel && design.tab !== 'design') { design.tabPinned = true; showDtab('design') }
  design.last = ''
}

export function drawSelBox() {
  let box = $('#selbox')
  const l = S.sel && S.layers.get(S.sel)
  const s = l && slotFor(l)
  if (!s) { if (box && !box.hidden) box.hidden = true; return }
  if (!box) { box = Object.assign(document.createElement('div'), { id: 'selbox', className: 'selbox' }); $('#ghosts').append(box) }
  if (box.hidden) box.hidden = false
  Object.assign(box.style, { left: `${s.f.x + s.box.left}px`, top: `${s.box.top}px`, width: `${s.box.width}px`, height: `${s.box.height}px`, borderWidth: `${2 / cam.s}px` })
}

// ---------- export: HTML, React + Tailwind, and the ABA handoff
export const exp = { busy: false, el: null }

export async function exportRunNow() {
  const run = shownRun()
  if (!run || exp.busy) return
  exp.busy = true
  const sections = [...S.layers.values()].filter(l => l.status === 'done' && l.text.trim()).map(l => ({ key: l.key, html: l.text }))
  const res = await api(`/api/runs/${encodeURIComponent(run)}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections }) }).catch(() => null)
  exp.busy = false
  const out = await res?.json().catch(() => ({}))
  if (!res?.ok) feed(null, `export: ${out?.error || 'the canvas server is not answering'}`, 'err')
}

export function showExport(e) {
  exp.el?.remove()
  exp.el = document.createElement('div')
  exp.el.className = 'export-pop'
  const zip = `/api/runs/${encodeURIComponent(e.run)}/export.zip?k=${encodeURIComponent(BOOT.token || '')}`
  exp.el.innerHTML = `<div class="vhead pop-title"><span>Exported, <em>ready</em></span><button class="vclose" aria-label="Close">${ico('x')}</button></div>
    <div class="xrow"><b>html/</b><span>${e.pages} pages, open index.html</span></div>
    <div class="xrow"><b>react/</b><span>${e.sections} section components · Vite + Tailwind · <code>npm i && npm run dev</code></span></div>
    <div class="xrow"><b>aba/</b><span>spec.md + blueprint.json for an app builder</span></div>
    <div class="xpath">${esc(e.dir)}</div>
    <div class="vfoot"><span></span>${e.zip ? `<a class="vagain" href="${zip}" download>Download .zip</a>` : ''}</div>`
  document.body.append(exp.el)
  exp.el.querySelector('.vclose').onclick = () => { exp.el.remove(); exp.el = null }
  closeable(exp.el, () => { exp.el?.remove(); exp.el = null })
  feed(null, `⬇ exported ${e.pages} pages to ${e.dir}`, 'sys')
}

els.exportBtn.onclick = () => exportRunNow()
commandOps.export = () => exportRunNow()
