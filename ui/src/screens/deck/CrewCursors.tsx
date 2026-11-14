// The crew's cursors on the deck, as the current deck draws and moves them (web/canvas/deck.js addAgent, say;
// web/canvas/loop.js): the arrow in the agent's shade, a tag with its name, a speech bubble for a moment after it
// speaks. Each frame a cursor eases a fifth of the way (0.22) toward where its agent is writing, so it glides; a new
// one starts from its seat in the break room's corner. Only agents at work are drawn. Positions are written straight
// to the elements, so React draws nothing per frame.
import { useEffect, useRef, type RefObject } from 'react'
import { crew } from './crew'
import type { DeckAgent, DeckLayer, DeckModel } from './model'
import './deck.css'

export type Point = { x: number, y: number }
export type Cam = { x: number, y: number, k: number }

// the break room's seats (web/canvas/deck.js DOCK), from the canvas's bottom right corner
const DOCK = { cols: 4, cw: 58, ch: 26, top: 32, left: 14, w: 248, h: 128, edge: 14 }
const seatOf = (i: number, w: number, h: number): Point => ({
  x: w - DOCK.edge - DOCK.w + DOCK.left + (i % DOCK.cols) * DOCK.cw,
  y: h - DOCK.edge - DOCK.h + DOCK.top + Math.floor(i / DOCK.cols) * DOCK.ch
})
const SAY_MS = 2800

// `cam`: the camera as it is on screen this frame (DeckStage eases it while Follow moves it)
export function CrewCursors({ model, cam, stage, target }: {
  model: DeckModel, cam: RefObject<Cam>, stage: RefObject<HTMLElement | null>, target: (a: DeckAgent) => Point | null
}) {
  const els = useRef(new Map<string, HTMLDivElement>())
  const pos = useRef(new Map<string, Point>())
  // what the frame loop reads: the newest model, camera and targets
  const now = useRef({ model, cam, target })
  now.current = { model, cam, target }

  // the letters that fly off a cursor as its agent types (web/canvas/deck.js spark): one a 140 ms at most, a letter
  // from what it just wrote, never under reduced motion or zoomed far out
  const layer = useRef<HTMLDivElement>(null)
  const typed = useRef(new Map<string, { ver: number, at: number }>())
  const spark = (a: DeckAgent, p: Point, l: DeckLayer, k: number) => {
    const was = typed.current.get(a.id), at = performance.now()
    if (was && l.ver > was.ver && at - was.at < 140) return
    typed.current.set(a.id, { ver: l.ver, at: was && l.ver === was.ver ? was.at : at })
    if (!was || l.ver <= was.ver || k < 0.12 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ch = (l.text.slice(-80).replace(/<[^>]*>?/g, '').match(/[A-Za-z0-9&?!€$]/g) || []).pop()
    if (!ch || !layer.current) return
    const el = document.createElement('i')
    el.className = 'spark'
    el.textContent = ch
    el.style.color = crew().color(a.name)
    el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`
    el.style.setProperty('--dx', `${(Math.random() * 50 - 25).toFixed(0)}px`)
    layer.current.append(el)
    setTimeout(() => el.remove(), 800)
  }

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const { model: m, cam: { current: c }, target: at } = now.current
      const s = stage.current
      for (const [i, a] of m.agents.entries()) {
        const el = els.current.get(a.id)
        if (!el) { pos.current.delete(a.id); continue }
        const t = at(a)
        if (!t) continue
        const to = { x: c.x + t.x * c.k, y: c.y + t.y * c.k }
        let p = pos.current.get(a.id)
        if (!p) { p = s ? seatOf(i, s.clientWidth, s.clientHeight) : to; pos.current.set(a.id, p) }
        p.x += (to.x - p.x) * 0.22
        p.y += (to.y - p.y) * 0.22
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
        const l = a.layer ? m.layers[a.layer] : null
        if (l) spark(a, p, l, c.k)
        el.classList.toggle('talking', !!a.said && Date.now() - a.said.t < SAY_MS)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage])

  return (
    <div ref={layer} aria-hidden className="deck-crew pointer-events-none absolute inset-0">
      {model.agents.filter(a => a.layer && target(a)).map(a => {
        const c = crew().color(a.name)
        return (
          <div key={a.id} data-agent={a.name} className="cursor" ref={el => { if (el) els.current.set(a.id, el); else els.current.delete(a.id) }}>
            <svg className="nib" viewBox="0 0 10 10" width="14" height="14"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill={c} stroke="#0b0b0c" strokeWidth="1" strokeLinejoin="round" /></svg>
            <div className="tag" style={{ background: c, color: crew().ink(c) }}><span>{a.name}</span><em className="doing" /></div>
            <div className="bubble" style={{ color: c }}><span>{a.said?.text}</span></div>
          </div>
        )
      })}
    </div>
  )
}
