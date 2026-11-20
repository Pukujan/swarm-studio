// A page's marks, over its artboard (web/project.js markPaths and the Scribble pointer handlers; web/project.css
// .ab .mk): the ones not sent yet, and the run's own open ones, dashed. With Scribble in hand a drag draws a stroke
// (a ring when it comes back to its start; a box with Shift); with Eraser a click on a mark takes it away. With
// neither, the layer lets every pointer through, so the page is picked and opened as before.
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { boxOf, clamp01, markD, type Mark, type Pt, type SentMark } from './scribble'
import type { Tool } from './useScribble'

export function MarkLayer({ page, k, marks, sent, tool, onDraw, onErase }: {
  page: string, k: number, marks: Mark[], sent: SentMark[], tool: Tool,
  // a drag ended: the points as fractions of the page, and where the pointer let go (the note opens there)
  onDraw: (page: string, pts: Pt[], shift: boolean, at: { x: number, y: number }) => void,
  onErase: (id: string, sent: boolean) => void
}) {
  const pad = useRef<HTMLDivElement>(null)
  const drawn = useRef<{ pts: Pt[], shift: boolean } | null>(null)
  const [live, setLive] = useState('')
  const at = (e: RPointerEvent): Pt => {
    const r = pad.current!.getBoundingClientRect()
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height / k)]
  }
  const down = (e: RPointerEvent) => {
    if (tool === 'move' || e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    if (tool === 'eraser') {
      const g = (e.target as Element).closest<SVGGElement>('[data-mk]')
      if (g?.dataset.mk) onErase(g.dataset.mk, g.dataset.sent === '1')
      return
    }
    drawn.current = { pts: [at(e)], shift: e.shiftKey }
    pad.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drawn.current
    if (!d) return
    const p = at(e), q = d.pts[d.pts.length - 1]
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < 0.002) return
    d.pts.push(p)
    setLive(d.shift ? markD({ kind: 'box', pts: [], box: boxOf([d.pts[0], p]) }, k) : markD({ kind: 'stroke', pts: d.pts, box: { x: 0, y: 0, w: 0, h: 0 } }, k))
  }
  const up = (e: RPointerEvent) => {
    const d = drawn.current
    drawn.current = null
    setLive('')
    if (d && e.type === 'pointerup') onDraw(page, d.pts, d.shift, { x: e.clientX, y: e.clientY })
  }
  const all: [Mark | SentMark, boolean][] = [...sent.map(m => [m, true] as [SentMark, boolean]), ...marks.map(m => [m, false] as [Mark, boolean])]
  if (tool === 'move' && !all.length) return null
  return (
    <div ref={pad} className={`ov-mk-pad ${tool}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      // a mark drawn or erased is not a click on the page
      onClick={e => { if (tool !== 'move') e.stopPropagation() }} onDoubleClick={e => { if (tool !== 'move') e.stopPropagation() }}>
      <svg className="ov-mk" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {all.map(([m, isSent]) => {
          const d = markD(m, k)
          return <g key={`${isSent ? 's' : 'u'}${m.id}`} data-mk={m.id} data-sent={isSent ? '1' : ''} className={isSent ? 'sent' : undefined}><path className="hit" d={d} /><path className="halo" d={d} /><path className="ln" d={d} /></g>
        })}
        {live && <g><path className="halo" d={live} /><path className="ln" d={live} /></g>}
      </svg>
    </div>
  )
}
