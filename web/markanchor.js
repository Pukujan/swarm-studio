// @ts-check
// Scribble (engine/marks.mjs): what a mark points at. A function, as text, that runs inside a copy of the page
// (its sections are the body's children with data-layer) and is given the mark's box as fractions of the page.
// kresilo's rule: the smallest element holding the mark's centre, else the one it covers most of, at least a
// quarter. It answers { layer, selector, path, tag, text, region }. Kept on its own so both Studios run the same
// one: the current deck (web/canvas/marks.js hiddenCopy) and the next UI's Overview (`@studio/markanchor`).
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
