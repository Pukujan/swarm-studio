// @ts-check
// Double-click a section on the Design deck: the camera zooms to it and puts it in the middle of the canvas as it
// is in view now (the owner, 2026-11-13: "double clicking a section should zoom in… and put it in middle of
// canvas as focus… current view of canvas"). A double-click on empty canvas still turns Follow back on.
import { S, els, cam } from './core.js'
import { slotFor, setAuto } from './deck.js'

/**
 * Where a section sits on the deck: the layer under a point in the viewport, as a box in world units; null on
 * empty canvas. frameWidth is the deck's page width.
 * @param {{ clientX: number, clientY: number }} e  @param {number} frameWidth
 */
export function sectionAt(e, frameWidth) {
  const vr = els.viewport.getBoundingClientRect()
  const wx = (e.clientX - vr.left - cam.x) / cam.s, wy = (e.clientY - vr.top - cam.y) / cam.s
  for (const l of S.layers.values()) {
    const s = slotFor(l)
    if (!s) continue
    const left = s.f.x + (s.box.left || 0), top = s.box.top, w = (s.box.right - s.box.left) || frameWidth, h = Math.max(s.box.height || 0, 40)
    if (wx >= left && wx <= left + w && wy >= top && wy <= top + h) return { key: l.key, x: left, y: top, w, h }
  }
  return null
}

/**
 * The camera that shows a box whole, in the middle of the viewport, never past 1:1.
 * @param {{ x: number, y: number, w: number, h: number }} b  @param {number} vw  @param {number} vh
 */
export function zoomFor(b, vw, vh) {
  const s = Math.max(0.06, Math.min(1, Math.min(vw / (b.w * 1.12), vh / (b.h * 1.2))))
  return { s, x: vw / 2 - (b.x + b.w / 2) * s, y: vh / 2 - (b.y + b.h / 2) * s }
}

/** The double-click: true when it zoomed to a section.  @param {MouseEvent} e  @param {number} [frameWidth] */
export function zoomToSection(e, frameWidth = 1280) {
  const b = sectionAt(e, frameWidth)
  if (!b) return false
  setAuto(false)
  const aim = () => { const z = zoomFor(b, els.viewport.clientWidth, els.viewport.clientHeight); cam.ts = z.s; cam.tx = z.x; cam.ty = z.y }
  aim()
  S.sel = b.key
  // selecting it opens the Design panel, which narrows the canvas: aim again at the canvas as it is then
  setTimeout(() => { if (S.sel === b.key && !cam.auto) aim() }, 160)
  return true
}
