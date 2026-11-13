// The board the Studio first is drawn on (web/board.js in the current Studio): a dotted stage that pans (drag the
// empty stage, the wheel) and zooms (ctrl or ⌘ + wheel), with the sections and their cards on it. It keeps the
// current Studio's classes (web/project.css, plan.css, scaffold.css), so the cards the kits draw look as they do there.
//
//   focus(target): a section's name (its data-sec), a card's key, or an element, fitted with a margin, never past 1:1
//   frameAll(): the whole board in view, beside the inspector when it is open
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Board } from './useStudio'

const INSP = 272

export const StudioBoard = forwardRef<Board, { inspector: boolean, fit?: [number, number], onEmptyClick?: () => void, children: ReactNode, onDropFiles?: (to: 'ref' | 'asset', files: File[]) => void }>(
  function StudioBoard({ inspector, fit = [0.35, 1], onEmptyClick, onDropFiles, children }, ref) {
    const stage = useRef<HTMLDivElement>(null)
    const world = useRef<HTMLDivElement>(null)
    const cam = useRef({ x: 0, y: 0, k: 1 })
    const [easing, setEasing] = useState(false)
    const place = useCallback(() => {
      if (world.current) world.current.style.transform = `translate(${cam.current.x}px, ${cam.current.y}px) scale(${cam.current.k})`
    }, [])
    const apply = useCallback((animate = false) => {
      if (animate) { setEasing(true); setTimeout(() => setEasing(false), 300) }
      place()
    }, [place])
    const room = () => (stage.current?.clientWidth ?? 0) - (inspector ? INSP : 0)

    const api: Board = {
      frameAll(animate = true) {
        const s = stage.current, w = world.current
        if (!s || !w) return
        const w0 = room(), h0 = s.clientHeight - 40, ww = w.scrollWidth, hh = w.scrollHeight
        if (!ww || !hh || w0 <= 0) return
        const k = Math.min(fit[1], Math.max(fit[0], Math.min(w0 / ww, h0 / hh)))
        cam.current = { k, x: Math.max(0, (w0 - ww * k) / 2), y: Math.max(0, Math.min(40, (h0 - hh * k) / 2)) }
        apply(animate)
      },
      focus(target, animate = true) {
        const s = stage.current, w = world.current
        if (!s || !w) return false
        const el = typeof target === 'string'
          ? w.querySelector<HTMLElement>(`.pj-sec[data-sec="${CSS.escape(target)}"]`) || w.querySelector<HTMLElement>(`.ab[data-key="${CSS.escape(target)}"]`)
          : target
        if (!el || !w.contains(el)) return false
        // the element's place in world units (the world's transform scales what the rects report)
        const wr = w.getBoundingClientRect(), r = el.getBoundingClientRect(), k0 = cam.current.k || 1
        const x = (r.left - wr.left) / k0, y = (r.top - wr.top) / k0, ew = r.width / k0, eh = r.height / k0
        const w0 = room(), h0 = s.clientHeight
        if (!ew || !eh || w0 <= 0) return false
        const k = Math.min(1, Math.max(fit[0], Math.min((w0 - 80) / ew, (h0 - 80) / eh)))
        // centred across, its top near the top of the stage, so what follows it is in view too
        cam.current = { k, x: (w0 - ew * k) / 2 - x * k, y: 40 - y * k }
        apply(animate)
        return true
      }
    }
    useImperativeHandle(ref, () => api)
    // a render keeps the camera where it is
    useLayoutEffect(place)

    // drag the empty stage to pan, wheel to scroll, ctrl/⌘ + wheel to zoom
    useEffect(() => {
      const s = stage.current
      if (!s) return
      let drag: { x: number, y: number, cx: number, cy: number, moved: boolean } | null = null
      const down = (e: PointerEvent) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.ab, .pj-insp, button')) return
        drag = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false }
        s.setPointerCapture(e.pointerId)
      }
      const move = (e: PointerEvent) => {
        if (!drag) return
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        if (drag.moved) { cam.current.x = drag.cx + dx; cam.current.y = drag.cy + dy; apply(); s.classList.add('panning') }
      }
      const up = () => { if (drag && !drag.moved) onEmptyClick?.(); drag = null; s.classList.remove('panning') }
      const wheel = (e: WheelEvent) => {
        e.preventDefault()
        const c = cam.current
        if (e.ctrlKey || e.metaKey) {
          const r = s.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
          const k = Math.min(3, Math.max(0.2, c.k * Math.exp(-e.deltaY * 0.01)))
          c.x = px - (px - c.x) * k / c.k; c.y = py - (py - c.y) * k / c.k; c.k = k
        } else { c.x -= e.deltaX; c.y -= e.deltaY }
        apply()
      }
      s.addEventListener('pointerdown', down)
      s.addEventListener('pointermove', move)
      s.addEventListener('pointerup', up)
      s.addEventListener('wheel', wheel, { passive: false })
      return () => { s.removeEventListener('pointerdown', down); s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('wheel', wheel) }
    }, [apply, onEmptyClick])

    // files dropped on References or Assets go to that store
    const sectionOf = (e: React.DragEvent) => (e.target as HTMLElement).closest?.<HTMLElement>('[data-sec="references"], [data-sec="assets"]')
    return (
      <div ref={stage} className="pj-stage" tabIndex={-1} aria-label="Studio"
        onDragOver={e => { if (e.dataTransfer.types.includes('Files') && sectionOf(e)) e.preventDefault() }}
        onDrop={e => { const s = sectionOf(e); if (!s || !e.dataTransfer.files.length) return; e.preventDefault(); onDropFiles?.(s.dataset.sec === 'assets' ? 'asset' : 'ref', [...e.dataTransfer.files]) }}>
        <div ref={world} className={`pj-world${easing ? ' ease' : ''}`}>{children}</div>
      </div>
    )
  }
)
