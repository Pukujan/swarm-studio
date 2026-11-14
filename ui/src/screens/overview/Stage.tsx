// The stage: the same files as the Files panel, as artboards in sections on one dotted board, two columns (pages and
// pictures; the game, app, film and code). The camera is web/project.js's: drag the board to pan, the wheel scrolls,
// ⌘/Ctrl + wheel or a pinch zooms about the pointer (0.15× to 3×), and Frame all fits everything in view. A click
// selects, a double-click opens the file's room, a right-click its menu; a click on the empty board lets go.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Artboard, WaitingPages } from './Artboard'
import { COLUMNS, SECTION_NAME, type Board, type Groups, type Item } from './model'

export interface StageHandle { frameAll(animate?: boolean): void, zoomTo(key: string): void, reveal(key: string): void }
interface Cam { x: number, y: number, k: number }

const narrow = () => matchMedia('(max-width: 760px)').matches
const INSP = 272

export const Stage = forwardRef<StageHandle, {
  groups: Groups, waiting: boolean, theme: Board['theme'], selected: string | null, inspector: boolean,
  aspects: Map<string, number>, onMeasure: (page: string, ratio: number) => void,
  onSelect: (key: string | null) => void, onOpen: (x: Item) => void, onMenu: (x: Item, at: { x: number, y: number }) => void, find: (key: string) => Item | null
}>(function Stage({ groups, waiting, theme, selected, inspector, aspects, onMeasure, onSelect, onOpen, onMenu, find }, ref) {
  const stage = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const cam = useRef<Cam>({ x: 0, y: 0, k: 1 })
  const framed = useRef(false)
  const [sharp, setSharp] = useState(false)

  const apply = useCallback((ease = false) => {
    const w = world.current
    if (!w) return
    w.classList.toggle('ease', ease)
    w.style.transform = `translate(${cam.current.x}px, ${cam.current.y}px) scale(${cam.current.k})`
    // zoomed in past a page's small picture, its full one
    setSharp(cam.current.k > 1.6)
    if (ease) setTimeout(() => w.classList.remove('ease'), 300)
  }, [])

  // the box the artboards and their section names take up, in world units
  const bounds = useCallback((els: Iterable<Element>) => {
    const w = world.current
    if (!w) return null
    const wr = w.getBoundingClientRect(), k = cam.current.k
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (!r.width) continue
      x0 = Math.min(x0, (r.left - wr.left) / k); y0 = Math.min(y0, (r.top - wr.top) / k)
      x1 = Math.max(x1, (r.right - wr.left) / k); y1 = Math.max(y1, (r.bottom - wr.top) / k)
    }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
  }, [])

  const fit = useCallback((b: { x: number, y: number, w: number, h: number } | null, max: number, ease: boolean) => {
    const s = stage.current
    if (!s || !b) return
    const pad = narrow() ? 16 : 40, below = narrow() ? 72 : 90
    const sw = s.clientWidth - (inspector && !narrow() ? INSP : 0) - pad * 2, sh = s.clientHeight - below - pad * 2
    if (sw <= 0 || sh <= 0) return
    const k = Math.min(max, Math.max(0.15, Math.min(sw / b.w, sh / b.h)))
    cam.current = { k, x: pad + (sw - b.w * k) / 2 - b.x * k, y: pad + Math.max(0, (sh - b.h * k) / 2) - b.y * k }
    apply(ease)
  }, [apply, inspector])

  const abOf = (key: string) => world.current?.querySelector(`.ov-ab[data-key="${CSS.escape(key)}"]`) ?? null
  useImperativeHandle(ref, () => ({
    frameAll: (ease = true) => fit(bounds(world.current?.querySelectorAll('.ov-ab, .ov-al') ?? []), 1.25, ease),
    zoomTo: key => {
      const el = abOf(key), b = el && bounds([el])
      // a long page: its top, at a readable size
      if (b && b.h > b.w * 1.4) b.h = b.w * 1.4
      if (b) fit(b, 2, true)
    },
    // pan just enough to bring an artboard clear of the inspector and the dock
    reveal: key => {
      const el = abOf(key), s = stage.current
      if (!el || !s) return
      const r = el.getBoundingClientRect(), sr = s.getBoundingClientRect(), vw = sr.width - INSP
      if (r.left < sr.left + 20 || r.right > sr.left + vw - 20 || r.top < sr.top + 20 || r.bottom > sr.bottom - 100) {
        cam.current.x += sr.left + vw / 2 - (r.left + r.width / 2); cam.current.y += sr.top + (sr.height - 90) / 2 - (r.top + r.height / 2)
        apply(true)
      }
    }
  }), [fit, bounds, apply])

  // framed once, when there is something to frame
  useLayoutEffect(() => {
    if (framed.current || waiting || !world.current?.querySelector('.ov-ab')) { apply(); return }
    framed.current = true
    fit(bounds(world.current.querySelectorAll('.ov-ab, .ov-al')), 1.25, false)
  })

  // the wheel: not passive, so the page itself never scrolls under the board
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = cam.current
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top
        const k = Math.min(3, Math.max(0.15, c.k * Math.exp(-e.deltaY * 0.01)))
        cam.current = { k, x: px - (px - c.x) * k / c.k, y: py - (py - c.y) * k / c.k }
      } else cam.current = { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }
      apply()
    }
    s.addEventListener('wheel', onWheel, { passive: false })
    return () => s.removeEventListener('wheel', onWheel)
  }, [apply])

  // drag to pan (touch pans from an artboard too, and a tap still selects it); two fingers pinch
  const drag = useRef<{ x: number, y: number, cx: number, cy: number, moved: boolean } | null>(null)
  const touches = useRef(new Map<number, { x: number, y: number }>())
  const pinch = useRef<{ d: number, k: number, cx: number, cy: number, mx: number, my: number } | null>(null)
  const down = (e: RPointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()]
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: cam.current.k, cx: cam.current.x, cy: cam.current.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
        drag.current = null
        return
      }
    }
    if (e.button !== 0 || (e.pointerType !== 'touch' && (e.target as Element).closest('.ov-ab'))) return
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false }
    stage.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinch.current
    if (p && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()], r = stage.current!.getBoundingClientRect()
      const k = Math.min(3, Math.max(0.15, p.k * Math.hypot(a.x - b.x, a.y - b.y) / p.d))
      const px = p.mx - r.left, py = p.my - r.top
      cam.current = { k, x: px - (px - p.cx) * k / p.k + ((a.x + b.x) / 2 - p.mx), y: py - (py - p.cy) * k / p.k + ((a.y + b.y) / 2 - p.my) }
      apply()
      return
    }
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.moved) { cam.current = { ...cam.current, x: d.cx + dx, y: d.cy + dy }; apply(); stage.current?.classList.add('panning') }
  }
  const up = (e: RPointerEvent) => {
    touches.current.delete(e.pointerId)
    if (pinch.current) { if (touches.current.size < 2) pinch.current = null; drag.current = null; return }
    const d = drag.current
    drag.current = null
    stage.current?.classList.remove('panning')
    if (!d || d.moved) return
    const a = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest<HTMLElement>('.ov-ab')
    if (e.pointerType === 'touch' && a?.dataset.key) return onSelect(a.dataset.key)
    if (!a && selected) onSelect(null)
  }

  const key = (e: { target: EventTarget }) => (e.target as Element).closest<HTMLElement>('.ov-ab')?.dataset.key
  const sec = (k: keyof Groups) => groups[k] && (
    <section key={k} className={`ov-sec ${k}`}>
      <span className="ov-al">{SECTION_NAME[k]}</span>
      <div className="ov-abs">
        {groups[k]!.map(x => <Artboard key={x.key} x={x} theme={theme} selected={selected === x.key} aspect={x.page ? aspects.get(x.page) : undefined} sharp={sharp} onMeasure={onMeasure} />)}
      </div>
    </section>
  )
  return (
    <div ref={stage} className="ov-stage" aria-label="Overview" aria-busy={waiting || undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e => { touches.current.delete(e.pointerId); pinch.current = null; drag.current = null }}>
      <div ref={world} className="ov-world"
        onClick={e => { const k = key(e); if (k && e.detail < 2) onSelect(k) }}
        onDoubleClick={e => { const k = key(e), x = k && find(k); if (x) onOpen(x) }}
        onContextMenu={e => { const k = key(e), x = k && find(k); if (!x) return; e.preventDefault(); onSelect(x.key); onMenu(x, { x: e.clientX, y: e.clientY }) }}>
        {waiting ? <div className="ov-col"><WaitingPages /></div> : COLUMNS.map((col, i) => <div key={i} className="ov-col">{col.map(sec)}</div>)}
      </div>
    </div>
  )
})
