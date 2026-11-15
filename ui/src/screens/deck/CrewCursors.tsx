// The crew's cursors on the deck, as the current deck draws and moves them (web/canvas/deck.js addAgent, say;
// web/canvas/loop.js): the arrow in the agent's shade, a tag with its name, a speech bubble for a moment after it
// speaks. Each frame a cursor eases a fifth of the way (0.22) toward where its agent is writing, so it glides; a new
// one starts from its seat in the break room's corner. Only agents at work are drawn. Positions are written straight
// to the elements, so React draws nothing per frame.
//
// Taking a new section, a cursor drags a marquee over where it will write, as the current deck's gesture does
// (web/canvas/deck.js startGesture 'marquee', web/canvas.css .ghost): 900 ms, the first 15% walking to its corner,
// the arrow pressed while it drags, and the dashed box fading out over 350 ms when it lets go.
import { useEffect, useRef, useState, type RefObject } from 'react'
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
// the marquee (web/canvas/deck.js): how long, how much of it is the walk to the corner, and its box in world units
const MARQUEE = { dur: 900, approach: 0.15, w: 420, h: 180 }
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
type Gesture = { layer: string, t0: number, p0: Point, p1: Point, ghost: HTMLDivElement | null }

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
  const gestures = useRef(new Map<string, Gesture>())
  // the marquee's dashed box, in screen pixels from world points
  const ghostAt = (g: Gesture, to: Point, c: Cam, color: string) => {
    if (!g.ghost && layer.current) {
      g.ghost = document.createElement('div')
      g.ghost.className = 'ghost'
      g.ghost.style.setProperty('--c', color)
      g.ghost.innerHTML = '<div class="marquee"></div>'
      layer.current.prepend(g.ghost)
    }
    const box = g.ghost?.firstElementChild as HTMLElement | null
    if (!box) return
    const x0 = c.x + Math.min(g.p0.x, to.x) * c.k, y0 = c.y + Math.min(g.p0.y, to.y) * c.k
    Object.assign(box.style, { left: `${x0.toFixed(0)}px`, top: `${y0.toFixed(0)}px`, width: `${(Math.abs(to.x - g.p0.x) * c.k).toFixed(0)}px`, height: `${(Math.abs(to.y - g.p0.y) * c.k).toFixed(0)}px` })
  }
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
        let t = at(a)
        if (!t) continue
        // a new section: the marquee over it, then back to following the words
        let g = gestures.current.get(a.id)
        // only a section taken while the cursor is on screen: a build opened half way (its agents already in their
        // sections) draws no marquee, as the current deck draws none
        if (a.layer && !g) gestures.current.set(a.id, g = { layer: a.layer, t0: -Infinity, p0: t, p1: t, ghost: null })
        if (a.layer && g?.layer !== a.layer) {
          if (g?.ghost) g.ghost.remove()
          g = { layer: a.layer, t0: performance.now(), p0: { x: t.x - 24, y: t.y - 20 }, p1: { x: t.x - 24 + MARQUEE.w, y: t.y - 20 + MARQUEE.h }, ghost: null }
          gestures.current.set(a.id, g)
        }
        let pressed = false
        const v = g ? (performance.now() - g.t0) / MARQUEE.dur : 2
        if (g && v < 1) {
          const u = Math.max(0, (v - MARQUEE.approach) / (1 - MARQUEE.approach)), k = ease(Math.min(1, u / 0.8))
          t = v < MARQUEE.approach ? g.p0 : { x: g.p0.x + (g.p1.x - g.p0.x) * k, y: g.p0.y + (g.p1.y - g.p0.y) * k }
          pressed = v >= MARQUEE.approach && u < 0.85
          if (v >= MARQUEE.approach) ghostAt(g, t, c, crew().color(a.name))
        } else if (g?.ghost && !g.ghost.classList.contains('fade')) {
          const gh = g.ghost
          gh.classList.add('fade')
          setTimeout(() => gh.remove(), 400)
        }
        el.classList.toggle('press', pressed)
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

  // An agent that stops writing: its cursor fades out where it was (the current deck's .cursor opacity .6s) and goes.
  // Decided while drawing, so the same element stays and fades; a timer draws again once the fade is over.
  const working = model.agents.filter(a => a.layer && target(a)).map(a => a.id)
  const was = useRef<string[]>([])
  const leaving = useRef(new Map<string, number>())
  const nowMs = Date.now()
  for (const id of was.current) if (!working.includes(id) && !leaving.current.has(id)) leaving.current.set(id, nowMs + 600)
  for (const id of working) leaving.current.delete(id)
  for (const [id, until] of leaving.current) if (until <= nowMs) leaving.current.delete(id)
  was.current = working
  const [, redraw] = useState(0)
  const next = Math.min(...leaving.current.values())
  useEffect(() => {
    if (!Number.isFinite(next)) return
    const t = setTimeout(() => redraw(n => n + 1), Math.max(0, next - Date.now()) + 20)
    return () => clearTimeout(t)
  }, [next])
  const shown = model.agents.filter(a => working.includes(a.id) || leaving.current.has(a.id))

  return (
    <div ref={layer} aria-hidden className="deck-crew pointer-events-none absolute inset-0">
      {shown.map(a => {
        const c = crew().color(a.name)
        return (
          <div key={a.id} data-agent={a.name} className={`cursor ${working.includes(a.id) ? '' : 'leaving'}`} ref={el => { if (el) els.current.set(a.id, el); else els.current.delete(a.id) }}>
            <svg className="nib" viewBox="0 0 10 10" width="14" height="14"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill={c} stroke="#0b0b0c" strokeWidth="1" strokeLinejoin="round" /></svg>
            <div className="tag" style={{ background: c, color: crew().ink(c) }}><span>{a.name}</span><em className="doing" /></div>
            <div className="bubble" style={{ color: c }}><span>{a.said?.text}</span></div>
          </div>
        )
      })}
    </div>
  )
}
