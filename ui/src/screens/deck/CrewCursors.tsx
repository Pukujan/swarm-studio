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
// a cursor that has finished a section: its resize there, then its fade
const RESIZE_MS = 1000, FADE_MS = 600
// the marquee (web/canvas/deck.js): how long, how much of it is the walk to the corner, and its box in world units
const MARQUEE = { dur: 900, approach: 0.15, w: 420, h: 180 }
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
type Gesture = { layer: string, t0: number, p0: Point, p1: Point, ghost: HTMLDivElement | null }

// `cam`: the camera as it is on screen this frame (DeckStage eases it while Follow moves it)
// `box(key)`: a section's box in world units, for the resize a cursor makes on the section it has just finished
// `spot(page, n)`: the n-th place the reviewer looks at on a page under review (a section, a little way in)
export function CrewCursors({ model, cam, stage, target, box, spot }: {
  model: DeckModel, cam: RefObject<Cam>, stage: RefObject<HTMLElement | null>, target: (a: DeckAgent) => Point | null,
  box?: (key: string) => { x: number, y: number, w: number, h: number } | null,
  spot?: (page: string, n: number) => Point | null
}) {
  const els = useRef(new Map<string, HTMLDivElement>())
  const pos = useRef(new Map<string, Point>())
  // what the frame loop reads: the newest model, camera and targets
  const now = useRef({ model, cam, target, box, spot })
  now.current = { model, cam, target, box, spot }
  // The Critic's reviewer (web/canvas/auto.js rvMove, rvTick): while a page is under review its cursor comes in from
  // 200 px up and left of a spot on it, looks somewhere else on the page every 1.1 s, easing 0.12 a frame; 1.5 s after
  // the review ends it fades and goes
  const rv = useRef<{ el: HTMLDivElement | null, p: Point | null, to: Point | null, page: string | null, hop: number, at: number }>({ el: null, p: null, to: null, page: null, hop: 0, at: 0 })

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
      const { model: m, cam: { current: c }, target: at, box: boxOf } = now.current
      const s = stage.current
      for (const [i, a] of m.agents.entries()) {
        const el = els.current.get(a.id)
        if (!el) { pos.current.delete(a.id); continue }
        let t = at(a)
        // just finished a section: the resize it makes there (web/canvas/deck.js startGesture 'resize': 1 s from the
        // middle of the section's bottom edge to 40 px below it), then it fades
        const off = leaving.current.get(a.id)
        if (!t && off) {
          const b = boxOf?.(off.layer)
          const v = Math.min(1, (Date.now() - off.t0) / RESIZE_MS)
          if (b) t = { x: b.x + b.w / 2, y: b.y + b.h + 40 * ease(v) }
        }
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
      // the reviewer
      const r = rv.current, page = m.reviewing[0] ?? null
      if (r.el && page && now.current.spot) {
        if (page !== r.page || performance.now() - r.at > 1100) {
          const to = now.current.spot(page, r.hop++)
          if (to) { if (!r.p || page !== r.page) r.p = { x: to.x - 200, y: to.y - 200 }; r.to = to }
          r.page = page
          r.at = performance.now()
        }
        if (r.p && r.to) {
          r.p.x += (r.to.x - r.p.x) * 0.12; r.p.y += (r.to.y - r.p.y) * 0.12
          r.el.style.transform = `translate(${(c.x + r.p.x * c.k).toFixed(1)}px, ${(c.y + r.p.y * c.k).toFixed(1)}px)`
        }
      } else if (r.el && r.p) r.el.style.transform = `translate(${(c.x + r.p.x * c.k).toFixed(1)}px, ${(c.y + r.p.y * c.k).toFixed(1)}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage])

  // the reviewer is on screen while a page is under review, and for 1.5 s after (then 600 ms to fade)
  const since = model.reviewing.length ? 0 : Date.now() - model.reviewEnd
  const reviewer = model.reviewing.length > 0 || (model.reviewEnd > 0 && since < 2100)
  const reviewerFading = !model.reviewing.length && since >= 1500
  useEffect(() => {
    if (model.reviewing.length || !model.reviewEnd || since >= 2100) return
    const t = setTimeout(() => redraw(n => n + 1), (since < 1500 ? 1500 : 2100) - since + 20)
    return () => clearTimeout(t)
  })
  useEffect(() => { if (!reviewer) Object.assign(rv.current, { p: null, to: null, page: null }) }, [reviewer])

  // An agent that stops writing: its cursor stays for the resize on the section it finished (1 s), then fades out
  // where it is (the current deck's .cursor opacity .6s) and goes. Decided while drawing, so the same element stays;
  // a timer draws again when the fade starts and when it is over.
  const working = model.agents.filter(a => a.layer && target(a)).map(a => a.id)
  const was = useRef<string[]>([])
  const wrote = useRef(new Map<string, string>())
  const leaving = useRef(new Map<string, { layer: string, t0: number }>())
  const nowMs = Date.now()
  for (const id of was.current) {
    const l = wrote.current.get(id)
    if (!working.includes(id) && !leaving.current.has(id) && l) leaving.current.set(id, { layer: l, t0: nowMs })
  }
  for (const id of working) leaving.current.delete(id)
  for (const [id, o] of leaving.current) if (o.t0 + RESIZE_MS + FADE_MS <= nowMs) leaving.current.delete(id)
  for (const a of model.agents) if (a.layer) wrote.current.set(a.id, a.layer)
  was.current = working
  const fading = (id: string) => { const o = leaving.current.get(id); return !!o && nowMs >= o.t0 + RESIZE_MS }
  const [, redraw] = useState(0)
  const next = Math.min(...[...leaving.current.values()].map(o => (nowMs < o.t0 + RESIZE_MS ? o.t0 + RESIZE_MS : o.t0 + RESIZE_MS + FADE_MS)))
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
          <div key={a.id} data-agent={a.name} className={`cursor ${fading(a.id) ? 'leaving' : ''}`} ref={el => {
            if (!el) { els.current.delete(a.id); return }
            els.current.set(a.id, el)
            // placed at its seat before it is first drawn, never at the corner for a frame
            const s = stage.current
            if (!pos.current.has(a.id) && s) {
              const p = seatOf(model.agents.indexOf(a), s.clientWidth, s.clientHeight)
              pos.current.set(a.id, p)
              el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
            }
          }}>
            <svg className="nib" viewBox="0 0 10 10" width="14" height="14"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill={c} stroke="#0b0b0c" strokeWidth="1" strokeLinejoin="round" /></svg>
            <div className="tag" style={{ background: c, color: crew().ink(c) }}><span>{a.name}</span><em className="doing" /></div>
            <div className="bubble" style={{ color: c }}><span>{a.said?.text}</span></div>
          </div>
        )
      })}
      {reviewer && (
        <div data-agent="Reviewer" className={`cursor ${reviewerFading ? 'leaving' : ''}`} ref={el => { rv.current.el = el }}>
          <svg className="nib" viewBox="0 0 10 10" width="14" height="14"><path d="M.6.6L9.2 4 5 5 4 9.2z" fill="var(--info)" stroke="#0b0b0c" strokeWidth="1" strokeLinejoin="round" /></svg>
          <div className="tag" style={{ background: 'var(--info)', color: 'var(--accent-ink)' }}><span>Reviewer</span></div>
        </div>
      )}
    </div>
  )
}
