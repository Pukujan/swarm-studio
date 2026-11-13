// The board shell (web/board.js, ported): the dotted stage that pans and zooms, the world of sections and
// artboards on it, the inspector on the right only while something is selected, and Esc or a click on the empty
// stage to clear the selection. The brand sheet and the Plan board share it, as they do in the current Studio.
// Each board keeps its own cards, selection and data; this only moves the camera and reports gestures back.
//
// Its DOM keeps the current Studio's hooks, which Hermia's cursor (web/pet.js) and the audit gates read: the
// stage .pj-stage (aria-busy while the board's data is on its way), artboards .ab[data-key], sections
// .pj-sec[data-sec], the inspector .pj-insp.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import './board.css'

export interface BoardHandle {
  frameAll(animate?: boolean): void
  // a section's name (its data-sec) or an artboard's data-key: it comes into view; false when not there
  focus(target: string, animate?: boolean): boolean
}

const INSP = 272

export function Board({ ref, label, className = '', fit = [0.3, 1.25], selected, onClear, busy = false, inspector = null, children }: {
  ref?: Ref<BoardHandle>
  label: string
  className?: string
  fit?: [number, number]
  selected: boolean
  onClear: () => void
  busy?: boolean
  inspector?: ReactNode
  children: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 })
  const [ease, setEase] = useState(false)
  const camRef = useRef(cam)
  camRef.current = cam
  const open = inspector != null

  const move = (next: typeof cam, animate: boolean) => {
    setEase(animate)
    setCam(next)
    if (animate) setTimeout(() => setEase(false), 300)
  }
  const room = () => ({ w0: (stage.current?.clientWidth || 0) - (open ? INSP : 0), h0: stage.current?.clientHeight || 0 })

  function frameAll(animate = true) {
    const w = world.current?.offsetWidth || 0, h = world.current?.offsetHeight || 0
    const { w0, h0 } = room()
    if (!w || !h || w0 <= 0) return
    const k = Math.min(fit[1], Math.max(fit[0], Math.min(w0 / w, (h0 - 40) / h)))
    move({ k, x: Math.max(0, (w0 - w * k) / 2), y: Math.max(0, Math.min(40, (h0 - 40 - h * k) / 2)) }, animate)
  }
  function focus(target: string, animate = true) {
    const w = world.current
    const el = w?.querySelector(`.pj-sec[data-sec="${CSS.escape(target)}"]`) || w?.querySelector(`.ab[data-key="${CSS.escape(target)}"]`)
    if (!w || !el) return false
    const wr = w.getBoundingClientRect(), r = el.getBoundingClientRect(), k0 = camRef.current.k || 1
    const x = (r.left - wr.left) / k0, y = (r.top - wr.top) / k0, ew = r.width / k0, eh = r.height / k0
    const { w0, h0 } = room()
    if (!ew || !eh || w0 <= 0) return false
    const k = Math.min(1, Math.max(fit[0], Math.min((w0 - 80) / ew, (h0 - 80) / eh)))
    move({ k, x: (w0 - ew * k) / 2 - x * k, y: 40 - y * k }, animate)
    return true
  }
  useImperativeHandle(ref, () => ({ frameAll, focus }))

  // the window's size changes the frame
  useEffect(() => {
    const onResize = () => frameAll(false)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  })

  // the Overview's gestures: drag the empty stage to pan, wheel to scroll, ctrl/⌘ + wheel to zoom
  const drag = useRef<{ x: number, y: number, cx: number, cy: number, moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)
  useLayoutEffect(() => {
    const s = stage.current
    if (!s) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = camRef.current
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
        const k = Math.min(3, Math.max(0.2, c.k * Math.exp(-e.deltaY * 0.01)))
        setCam({ x: px - (px - c.x) * k / c.k, y: py - (py - c.y) * k / c.k, k })
      } else setCam({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY })
    }
    s.addEventListener('wheel', onWheel, { passive: false })
    return () => s.removeEventListener('wheel', onWheel)
  }, [])

  // Esc clears the selection (a field keeps its own Esc); the frame's Esc (up one level) waits for the next press
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !selected) return
      if (e.target instanceof Element && e.target.closest('input, textarea')) return
      e.preventDefault()
      onClear()
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [selected, onClear])

  return (
    <div className={`project ${open ? 'insp-on' : ''} ${className}`}>
      <div
        ref={stage}
        className={`pj-stage${panning ? ' panning' : ''}`}
        tabIndex={-1}
        aria-label={label}
        aria-busy={busy}
        onPointerDown={e => {
          if (e.button !== 0 || (e.target as Element).closest('.pj-insp, .ab')) return
          drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x, dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          if (d.moved) { setCam({ ...camRef.current, x: d.cx + dx, y: d.cy + dy }); setPanning(true) }
        }}
        onPointerUp={() => { if (drag.current && !drag.current.moved && selected) onClear(); drag.current = null; setPanning(false) }}
      >
        <div ref={world} className={`pj-world${ease ? ' ease' : ''}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {children}
        </div>
      </div>
      <aside className="pj-insp" hidden={!open} aria-label="Inspector">{inspector}</aside>
    </div>
  )
}

// One section of a board: its name over its artboards
export function Section({ name, label, className = '', children }: { name?: string, label: string, className?: string, children: ReactNode }) {
  return (
    <section className={`pj-sec ${className}`} data-sec={name}>
      <span className="al">{label}</span>
      <div className="abs">{children}</div>
    </section>
  )
}

// the four handles of the selected artboard
export const Handles = () => <div className="sel"><i /><i /><i /><i /></div>
