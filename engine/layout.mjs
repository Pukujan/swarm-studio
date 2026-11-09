// A layout guard for a finished site. Builders sometimes float a text panel (a
// legend, a card, a caption) over a fixed-size box such as a map, with
// position:absolute. It fits at the width they pictured and lands on top of
// other text at the next. This finds those panels and moves them into the
// normal flow, just above or below the box they floated over, at any width.
// One source for Play mode, the HTML export and the React export.

// Runs in the page. Idempotent: call it again after a resize or a new page.
export function swarmLayout(root) {
  const doc = root.ownerDocument || root
  const view = doc.defaultView
  // a real sentence or name, not a pin number or a one-word label
  const prose = el => [...el.querySelectorAll('*'), el].some(x => [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length >= 12))
  const area = r => Math.max(0, r.width) * Math.max(0, r.height)
  const meet = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  // on screen: not hidden, not faded out, not inside a closed <details> menu
  const shown = el => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !el.closest('details:not([open])') && view.getComputedStyle(el).display !== 'none'

  // every visible run of text in a section, with its box
  function texts(section) {
    const out = [], walk = doc.createTreeWalker(section, 4)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !shown(n.parentElement)) continue
      const r = doc.createRange()
      r.selectNodeContents(n)
      const b = r.getBoundingClientRect()
      if (area(b) > 0) out.push({ node: n, box: b })
    }
    return out
  }

  let moved = 0
  for (const section of [...root.children]) {
    // menus and dropdowns in the nav are meant to sit over the page
    if (/^(SCRIPT|STYLE|LINK|TEMPLATE|NAV|HEADER)$/.test(section.tagName) || section.dataset.layer === 'nav') continue
    // text panels the design positions absolutely, outermost first
    const floats = [...section.querySelectorAll('*')].filter(el => !el.dataset.swarmFlow && view.getComputedStyle(el).position === 'absolute' && shown(el) && prose(el))
    const outer = floats.filter(el => !floats.some(o => o !== el && o.contains(el)))
    if (!outer.length) continue
    const runs = texts(section)
    const after = new Map()
    for (const el of outer) {
      const box = el.getBoundingClientRect()
      // a badge poking out of its card is fine; a panel on top of other text is not
      if (!runs.some(t => !el.contains(t.node) && meet(box, t.box) > 0.25 * area(t.box))) continue
      const host = el.offsetParent, hb = host?.getBoundingClientRect()
      el.dataset.swarmFlow = '1'
      Object.assign(el.style, { position: 'relative', inset: 'auto', transform: 'none', width: 'auto', maxWidth: '100%', zIndex: 'auto' })
      moved++
      // inside the section, the panel leaves the box and sits just above or below it
      if (!host || host === section || !section.contains(host) || host.contains(section)) continue
      if (box.top + box.height / 2 < hb.top + hb.height / 2 && !after.has(host)) {
        host.before(el)
        el.style.margin = '0 0 16px'
      } else {
        ;(after.get(host) || host).after(el)
        after.set(host, el)
        el.style.margin = '16px 0 0'
      }
    }
  }
  return moved
}

// As text, for pages that get the guard inline: once the page and its fonts are
// in, then again after the window changes size.
export const layoutSource = () => `(() => {
  const guard = ${swarmLayout.toString()}
  const run = () => guard(document.body)
  run()
  document.fonts && document.fonts.ready.then(run)
  let t
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 150) })
})()`
