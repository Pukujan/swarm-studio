// The board shell shared by the game's Plan board (web/plan.js) and the brand sheet (web/brand.js): the
// dotted stage that pans and zooms, the world of sections and artboards on it, the inspector on the right
// (shown only while something is selected), Esc and a click on the empty stage to clear the selection, and
// one toast spot. Each board keeps its own cards, its own selection and its own render; this file only
// moves the camera and reports gestures back.
//
//   const bd = makeBoard({ root, cls, label, fit, on, selected, clear })
//     root      the board's element (it is filled with the stage and the inspector)
//     cls       root's classes, e.g. 'project plan'
//     label     the stage's aria-label
//     fit       [min, max] zoom when framing the whole board
//     on()      true while the board is showing (Esc is ignored otherwise)
//     selected() true while something is selected
//     clear()   clear the selection (Esc, or a click on the empty stage)
//   bd.stage, bd.world, bd.insp   the elements
//   bd.cam                        { x, y, k }
//   bd.applyCam()                 apply bd.cam to the world
//   bd.frameAll(animate)          fit the whole world in view, beside the inspector when it is open
//   bd.focus(target, animate)     bring one section or artboard into view: a section's name (its
//                                 data-sec), an artboard's data-key, or an element; false when not there
//   bd.inspector(open)            show or hide the inspector (root gets .insp-on)
//   bd.toast(text)
export function makeBoard({ root, cls = 'project', label = 'Board', fit = [0.3, 1.25], on = () => true, selected = () => false, clear = () => {} }) {
  root.className = cls
  root.hidden = true
  root.innerHTML = `
    <div class="pj-stage" tabindex="-1" aria-label="${label}">
      <div class="pj-world"></div>
    </div>
    <aside class="pj-insp" hidden aria-label="Inspector"></aside>`
  const stage = root.querySelector('.pj-stage'), world = root.querySelector('.pj-world'), insp = root.querySelector('.pj-insp')
  const bd = { stage, world, insp, cam: { x: 0, y: 0, k: 1 } }
  const INSP = 272

  bd.applyCam = () => { world.style.transform = `translate(${bd.cam.x}px, ${bd.cam.y}px) scale(${bd.cam.k})` }
  const ease = animate => {
    world.classList.toggle('ease', !!animate)
    bd.applyCam()
    setTimeout(() => world.classList.remove('ease'), 300)
  }
  bd.frameAll = (animate = true) => {
    const w0 = stage.clientWidth - (insp.hidden ? 0 : INSP), h0 = stage.clientHeight - 40
    const w = world.scrollWidth, h = world.scrollHeight
    if (!w || !h || w0 <= 0) return
    const k = Math.min(fit[1], Math.max(fit[0], Math.min(w0 / w, h0 / h)))
    bd.cam = { k, x: Math.max(0, (w0 - w * k) / 2), y: Math.max(0, Math.min(40, (h0 - h * k) / 2)) }
    ease(animate)
  }
  // a section by name, an artboard by key, or an element: it fits with a margin, never zoomed past 1
  bd.focus = (target, animate = true) => {
    const el = typeof target === 'string'
      ? world.querySelector(`.pj-sec[data-sec="${CSS.escape(target)}"]`) || world.querySelector(`.ab[data-key="${CSS.escape(target)}"]`)
      : target
    if (!el || !world.contains(el)) return false
    // the element's place in world units (the world's transform scales what the rects report)
    const wr = world.getBoundingClientRect(), r = el.getBoundingClientRect(), k0 = bd.cam.k || 1
    const x = (r.left - wr.left) / k0, y = (r.top - wr.top) / k0, w = r.width / k0, h = r.height / k0
    const w0 = stage.clientWidth - (insp.hidden ? 0 : INSP), h0 = stage.clientHeight
    if (!w || !h || w0 <= 0) return false
    const k = Math.min(1, Math.max(fit[0], Math.min((w0 - 80) / w, (h0 - 80) / h)))
    // centred across, its top near the top of the stage, so what follows it is in view too
    bd.cam = { k, x: (w0 - w * k) / 2 - x * k, y: 40 - y * k }
    ease(animate)
    return true
  }
  bd.inspector = open => {
    insp.hidden = !open
    root.classList.toggle('insp-on', !!open)
  }

  // ---------- the Overview's gestures: drag the empty stage to pan, wheel to scroll, ctrl/⌘ + wheel to zoom
  let drag = null
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.pj-insp, .ab')) return
    drag = { x: e.clientX, y: e.clientY, cx: bd.cam.x, cy: bd.cam.y, moved: false }
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', e => {
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    if (drag.moved) { bd.cam.x = drag.cx + dx; bd.cam.y = drag.cy + dy; bd.applyCam(); stage.classList.add('panning') }
  })
  stage.addEventListener('pointerup', () => { if (drag && !drag.moved && selected()) clear(); drag = null; stage.classList.remove('panning') })
  stage.addEventListener('wheel', e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
      const k = Math.min(3, Math.max(0.2, bd.cam.k * Math.exp(-e.deltaY * 0.01)))
      bd.cam.x = px - (px - bd.cam.x) * k / bd.cam.k; bd.cam.y = py - (py - bd.cam.y) * k / bd.cam.k; bd.cam.k = k
    } else { bd.cam.x -= e.deltaX; bd.cam.y -= e.deltaY }
    bd.applyCam()
  }, { passive: false })
  addEventListener('keydown', e => {
    if (!on() || e.key !== 'Escape' || e.defaultPrevented || window.SwarmUI?.open?.()) return
    if (e.target.closest?.('input, textarea')) return
    if (selected()) { e.preventDefault(); clear() }
  }, true)

  // ---------- one toast spot
  let toastEl = null
  bd.toast = text => {
    toastEl?.remove()
    const t = toastEl = document.createElement('div')
    t.className = 'hm-toast'
    t.setAttribute('role', 'status')
    t.textContent = text
    root.append(t)
    setTimeout(() => t.remove(), 3000)
  }
  return bd
}
