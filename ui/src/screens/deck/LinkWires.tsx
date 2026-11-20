// The wires on the deck, as the current deck draws them (web/canvas/deck.js linkWires, drawWires; web/canvas.css
// .wires): one line per page-to-page link, from the section that holds the link to the top of the page it goes to,
// in the shade of the agent that wrote it. A wire appears when its section is done: it draws itself in over a
// second and stays bright for 2.6 s, then rests faint. The shared nav is wired from the first page only, and a
// page is wired to another once however many links go there. (Owner, 2026-11-19: "i dont see drawn lines for
// protyping anymore when the swarm is drawing ... i love seeing those lines go everywhere".)
//
// Where the current deck starts a wire at the link's own box, this one starts at its section's right edge: the
// frames here report where each section is, not each link. The paths are written straight to the elements each
// frame, from the camera as it is on screen, so React draws nothing while the canvas moves.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { crew } from './crew'
import type { Cam, Point } from './CrewCursors'
import type { DeckModel } from './model'
import './deck.css'

const FRESH_MS = 2600
type Box = { x: number, y: number, w: number, h: number }
interface Wire { id: string, layer: string, target: string, color: string }

// the wires a build has now: its done sections' links, one per (page -> page)
function wiresOf(m: DeckModel): Wire[] {
  const pages = new Set(m.pages.map(p => p.id)), out = new Map<string, Wire>()
  for (const l of Object.values(m.layers)) {
    if (l.status !== 'done') continue
    const from = l.page === '*' ? m.pages[0]?.id : l.page
    if (!from) continue
    for (const g of l.text.matchAll(/data-goto="([^"]+)"/g)) {
      const to = g[1], id = `${from}->${to}`
      if (to === from || !pages.has(to) || out.has(id)) continue
      const a = l.agent ? m.agents.find(x => x.id === l.agent) : null
      out.set(id, { id, layer: l.key, target: to, color: a ? crew().color(a.name) : 'var(--muted)' })
    }
  }
  return [...out.values()]
}

// `box(key)`: a section's box in world units; `pageTop(id)`: the top left corner of a page's frame
export function LinkWires({ model, cam, box, pageTop }: {
  model: DeckModel, cam: RefObject<Cam>, box: (key: string) => Box | null, pageTop: (id: string) => Point | null
}) {
  const wires = useMemo(() => wiresOf(model), [model])
  const els = useRef(new Map<string, { path: SVGPathElement | null, dot: SVGCircleElement | null, d: string }>())
  const now = useRef({ wires, cam, box, pageTop })
  now.current = { wires, cam, box, pageTop }
  // when each wire was first seen: bright until FRESH_MS after
  const born = useRef(new Map<string, number>())
  const t = Date.now()
  for (const w of wires) if (!born.current.has(w.id)) born.current.set(w.id, t)
  const [, redraw] = useState(0)
  const next = Math.min(...wires.map(w => born.current.get(w.id)! + FRESH_MS).filter(x => x > t))
  useEffect(() => {
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => redraw(n => n + 1), Math.max(0, next - Date.now()) + 20)
    return () => clearTimeout(timer)
  }, [next])

  const any = wires.length > 0
  useEffect(() => {
    if (!any) return
    let raf = 0
    const tick = () => {
      const { wires: list, cam: { current: c }, box: boxOf, pageTop: topOf } = now.current
      for (const w of list) {
        const el = els.current.get(w.id), b = boxOf(w.layer), p = topOf(w.target)
        if (!el?.path || !b || !p) continue
        const ax = c.x + (b.x + b.w) * c.k, ay = c.y + (b.y + Math.min(b.h / 2, 300)) * c.k
        const bx = c.x + p.x * c.k, by = c.y + p.y * c.k
        const dx = Math.max(80, Math.abs(bx - ax) * 0.45), back = bx < ax
        const d = `M${ax.toFixed(1)},${ay.toFixed(1)} C${(ax + dx).toFixed(1)},${ay.toFixed(1)} ${(bx - dx).toFixed(1)},${(by - (back ? 120 : 0)).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`
        if (d === el.d) continue
        el.d = d
        el.path.setAttribute('d', d)
        el.dot?.setAttribute('cx', bx.toFixed(1))
        el.dot?.setAttribute('cy', by.toFixed(1))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [any])

  if (!any) return null
  const keep = (id: string, part: 'path' | 'dot') => (el: SVGPathElement | SVGCircleElement | null) => {
    const e = els.current.get(id) ?? { path: null, dot: null, d: '' }
    if (part === 'path') { e.path = el as SVGPathElement | null; if (!el) e.d = '' } else e.dot = el as SVGCircleElement | null
    if (e.path || e.dot) els.current.set(id, e); else els.current.delete(id)
  }
  return (
    <svg aria-hidden className="deck-wires pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {wires.map(w => {
        const fresh = t - born.current.get(w.id)! < FRESH_MS ? 'fresh' : undefined
        return (
          <g key={w.id} data-wire={w.id}>
            <path ref={keep(w.id, 'path')} pathLength={1} stroke={w.color} className={fresh} />
            <circle ref={keep(w.id, 'dot')} r={4} fill={w.color} className={fresh} />
          </g>
        )
      })}
    </svg>
  )
}
