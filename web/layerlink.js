// Drag a layer into the chat (docs/specs/29-chats-references-marks.md, "Drag a layer into the chat").
// A layer dragged from the Layers list, the Overview's section list or a picked section's outline onto
// the left chat becomes a chip in the message box, and a thin line joins the chip to the layer where it
// is on screen. A sent turn and a crew reply about a layer keep their layers: hovering one draws its
// lines again. A layer off screen gets a line to the screen's edge.
//
//   layerLink({ form, feed, rect, open }) -> { take(), count(), mark(item, keys) }
//     rect(key): the layer's box on screen, { left, top, width, height }, or null when it is not drawn
//     open(): show the left chat (a drag that starts while it is shut)
export const LAYER_TYPE = 'application/x-swarm-layer'
const LL_NS = 'http://www.w3.org/2000/svg'
const llEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// what a drag source puts on the drag: { key, name }
export function layerDrag(e, key, name) {
  e.dataTransfer.setData(LAYER_TYPE, JSON.stringify({ key, name }))
  e.dataTransfer.setData('text/plain', name)
  e.dataTransfer.effectAllowed = 'copy'
  document.dispatchEvent(new CustomEvent('swarm:layerdrag'))
}

export function layerLink({ form, feed, rect, open = () => {} }) {
  const chips = []
  let hover = null, hot = null, raf = 0
  const box = document.createElement('div')
  box.className = 'lchips'
  box.hidden = true
  form.prepend(box)
  const svg = document.createElementNS(LL_NS, 'svg')
  svg.classList.add('lwires')
  svg.setAttribute('aria-hidden', 'true')
  document.body.append(svg)

  function paint() {
    box.hidden = !chips.length
    box.innerHTML = chips.map(c => `<span class="lchip" data-key="${llEsc(c.key)}"><span>${llEsc(c.name)}</span><button type="button" aria-label="Remove ${llEsc(c.name)}">×</button></span>`).join('')
    wake()
  }
  function add(c) {
    if (!c?.key || chips.some(x => x.key === c.key) || chips.length >= 12) return
    chips.push({ key: String(c.key), name: String(c.name || c.key.split('/').pop()).slice(0, 60) })
    paint()
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'), chip = e.target.closest('.lchip')
    if (!b || !chip) return
    const i = chips.findIndex(c => c.key === chip.dataset.key)
    if (i >= 0) chips.splice(i, 1)
    if (hot === chip.dataset.key) hot = null
    paint()
  })
  box.addEventListener('mouseover', e => { const k = e.target.closest('.lchip')?.dataset.key || null; if (k !== hot) { hot = k; wake() } })
  box.addEventListener('mouseleave', () => { hot = null; wake() })

  // the drop: anywhere on the left chat
  const side = form.closest('.side') || form
  const ours = e => [...(e.dataTransfer?.types || [])].includes(LAYER_TYPE)
  side.addEventListener('dragover', e => { if (!ours(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; side.classList.add('ldrop') })
  side.addEventListener('dragleave', e => { if (!side.contains(e.relatedTarget)) side.classList.remove('ldrop') })
  side.addEventListener('drop', e => {
    side.classList.remove('ldrop')
    if (!ours(e)) return
    e.preventDefault()
    try { add(JSON.parse(e.dataTransfer.getData(LAYER_TYPE))) } catch {}
    form.querySelector('textarea')?.focus()
  })
  // a layer drag that starts while the chat is shut opens it, so there is somewhere to drop
  document.addEventListener('swarm:layerdrag', () => { if (!side.offsetParent) setTimeout(open, 0) })
  document.addEventListener('dragend', () => side.classList.remove('ldrop'))

  // a past turn or a crew reply that names layers: hovering it draws them again
  feed.addEventListener('mouseover', e => { const it = e.target.closest('.item[data-layers]'); if (it !== hover) { hover = it; wake() } })
  feed.addEventListener('mouseleave', () => { hover = null; wake() })

  // the lines: one per chip (and per layer of a hovered turn), from the chip's right edge to the
  // layer's left edge, a gentle curve; a layer off screen ends at the edge of the screen
  function lines() {
    const out = []
    for (const el of box.querySelectorAll('.lchip')) out.push({ from: el, key: el.dataset.key, hot: el.dataset.key === hot })
    if (hover?.isConnected) for (const key of hover.dataset.layers.split(' ').filter(Boolean)) out.push({ from: hover, key, hot: true })
    return out
  }
  function draw() {
    raf = 0
    const list = lines()
    const W = innerWidth, H = innerHeight, pad = 6
    const keep = new Set()
    const sideR = side.getBoundingClientRect().right
    for (const [i, l] of list.entries()) {
      const a = l.from.getBoundingClientRect()
      if (!a.width) continue
      const ax = a.right, ay = a.top + a.height / 2
      const r = rect(l.key)
      let bx, by, edge = false
      if (r && r.width) {
        bx = r.left; by = r.top + Math.min(r.height / 2, 60)
        const lo = Math.max(sideR + pad, pad)
        if (bx < lo || bx > W - pad || by < pad || by > H - pad) { edge = true; bx = Math.min(W - pad, Math.max(lo, bx)); by = Math.min(H - pad, Math.max(pad, by)) }
      } else { edge = true; bx = sideR + 28; by = ay }
      const dx = Math.max(30, Math.abs(bx - ax) * 0.4)
      const d = `M${ax.toFixed(1)},${ay.toFixed(1)} C${(ax + dx).toFixed(1)},${ay.toFixed(1)} ${(bx - dx).toFixed(1)},${by.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`
      const id = `l${i}`
      keep.add(id)
      let g = svg.querySelector(`g[data-id="${id}"]`)
      if (!g) { g = document.createElementNS(LL_NS, 'g'); g.dataset.id = id; g.innerHTML = '<path/><circle r="3"/>'; svg.append(g) }
      g.setAttribute('class', `${l.hot ? 'hot' : ''}${edge ? ' edge' : ''}`)
      g.dataset.key = l.key
      g.firstChild.setAttribute('d', d)
      g.lastChild.setAttribute('cx', bx.toFixed(1))
      g.lastChild.setAttribute('cy', by.toFixed(1))
    }
    for (const g of [...svg.children]) if (!keep.has(g.dataset.id)) g.remove()
    // keep following the canvas while anything is drawn (it pans and zooms under the lines)
    if (list.length) raf = requestAnimationFrame(draw)
  }
  function wake() { if (!raf) raf = requestAnimationFrame(draw) }

  return {
    add,
    count: () => chips.length,
    // the chips, for a send: the box empties and its lines go
    take() { const out = chips.splice(0); hot = null; paint(); return out },
    // a feed item about these layers: hovering it draws their lines
    mark(item, keys) { const k = (keys || []).filter(Boolean); if (k.length) { item.dataset.layers = k.join(' '); item.classList.add('has-layers') } }
  }
}
