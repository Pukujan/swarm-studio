// Watch a visitor (web/canvas/player.js, visitor tours): one model call on the server writes 3–4 people who use the
// finished site. Each step names an element on the page they are on, plus 2–3 ways of thinking the same thought.
// Played back, a cursor glides to each element, the page scrolls it into view, and the thought cycles through its
// phrasings while they decide. The player's `visitor` state is the machine's: Watch starts the next visitor, Stop
// (or the end of one) goes back to the prototype.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { pageBody, pageParts } from './playdoc'
import type { DeckModel } from './model'

export interface Tour {
  name: string, who?: string, emoji: string, goal: string, end?: string
  steps: { page: string, do: 'look' | 'hover' | 'click' | 'type', el: string, text?: string, think: string[] }[]
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// the visitors for a build: written once and kept with it on the server; `fresh` writes new ones
export function useTourList(model: DeckModel) {
  const [list, setList] = useState<Tour[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const asked = useRef<Promise<Tour[] | null> | null>(null)
  useEffect(() => { setList(null); setError(''); asked.current = null }, [model.run])
  const load = useCallback((fresh = false): Promise<Tour[] | null> => {
    if (!model.run) return Promise.resolve(null)
    if (asked.current && !fresh) return asked.current
    const pages = model.pages.map(p => ({ id: p.id, title: p.title, items: pageParts(pageBody(model, p.id)).items }))
    setLoading(true)
    setError('')
    const job = fetch(`/api/runs/${encodeURIComponent(model.run)}/tours`, { method: 'POST', headers: { 'x-swarm-token': window.SWARM?.token ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ pages, fresh }) })
      .then(async r => {
        const body = await r.json().catch(() => ({})) as { tours?: Tour[], error?: string }
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
        setList(body.tours ?? [])
        return body.tours ?? []
      })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : String(e)); asked.current = null; return null })
      .finally(() => setLoading(false))
    asked.current = job
    return job
  }, [model])
  return { list, loading, error, load }
}

export interface TourView {
  tour: Tour | null
  at: number
  thought: string
  cursor: { x: number, y: number } | null
  press: number
  ended: boolean
}

const IDLE: TourView = { tour: null, at: 0, thought: '', cursor: null, press: 0, ended: false }

// Plays one visitor in the player's frame. `frame` is the page's iframe, `stage` the box the cursor is drawn in,
// `show(page)` opens a page and resolves once it has loaded.
export function useTourPlayer(frame: RefObject<HTMLIFrameElement | null>, stage: RefObject<HTMLElement | null>, show: (page: string) => Promise<void>) {
  const [view, setView] = useState<TourView>(IDLE)
  const run = useRef(0)
  const seq = useRef(0)
  const waiting = useRef(new Map<number, (m: { box?: [number, number, number, number] | null }) => void>())
  const pos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data as { type?: string, seq?: number } | null
      if (m?.type === 'tour:ok' && m.seq) waiting.current.get(m.seq)?.(m as { box?: [number, number, number, number] | null })
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [frame])

  // ask the page to do something; its reply, or nothing after 3 s
  const ask = (op: string, extra: object = {}) => new Promise<{ box?: [number, number, number, number] | null }>(resolve => {
    const n = ++seq.current
    const t = setTimeout(() => { waiting.current.delete(n); resolve({ box: null }) }, 3000)
    waiting.current.set(n, m => { clearTimeout(t); waiting.current.delete(n); resolve(m) })
    frame.current?.contentWindow?.postMessage({ type: 'tour', op, seq: n, still: still(), ...extra }, '*')
  })

  // a point inside the frame, in the stage's coordinates (the device is zoomed)
  const toStage = (x: number, y: number) => {
    const f = frame.current?.getBoundingClientRect(), s = stage.current?.getBoundingClientRect()
    if (!f || !s || !frame.current) return { x: 0, y: 0 }
    const k = f.width / (frame.current.clientWidth || 1)
    return { x: f.left - s.left + x * k, y: f.top - s.top + y * k }
  }
  const place = (x: number, y: number) => { pos.current = { x, y }; setView(v => ({ ...v, cursor: { x, y } })) }

  // glide along a slight arc and ease out, the way a hand moves a mouse; a jump under reduced motion
  const glide = (x: number, y: number, live: () => boolean) => new Promise<void>(resolve => {
    const { x: x0, y: y0 } = pos.current, d = Math.hypot(x - x0, y - y0)
    if (d < 2 || still()) { place(x, y); return resolve() }
    const ms = Math.min(1100, 380 + d * 0.9), bend = (Math.random() < 0.5 ? -1 : 1) * Math.min(60, d * 0.12)
    const nx = -(y - y0) / d, ny = (x - x0) / d, t0 = performance.now()
    let over = false
    const end = () => { if (over) return; over = true; clearTimeout(guard); if (live()) place(x, y); resolve() }
    // the frames draw the arc; the timer lands it on time where no frame runs (a hidden tab)
    const guard = setTimeout(end, ms + 50)
    const step = (now: number) => {
      if (over) return
      if (!live()) return end()
      const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const arc = Math.sin(Math.PI * e) * bend
      place(x0 + (x - x0) * e + nx * arc, y0 + (y - y0) * e + ny * arc)
      if (t < 1) requestAnimationFrame(step)
      else end()
    }
    requestAnimationFrame(step)
  })

  const stop = useCallback(() => { run.current++; setView(IDLE) }, [])

  const play = useCallback(async (t: Tour, onEnd: () => void) => {
    const id = ++run.current
    const live = () => run.current === id
    setView({ ...IDLE, tour: t, at: 0 })
    await show(t.steps[0].page)
    await sleep(500)
    const s0 = stage.current?.getBoundingClientRect()
    if (s0) place(s0.width / 2, s0.height - 60)
    for (let i = 0; i < t.steps.length && live(); i++) {
      const s = t.steps[i]
      setView(v => ({ ...v, at: i + 1 }))
      await show(s.page)
      // the thought's phrasings, one every 1.5 s until the step is over
      const lines = s.think.length ? s.think : ['hm…']
      let line = 0
      setView(v => ({ ...v, thought: lines[0] }))
      const cycle = setInterval(() => { if (!live()) return clearInterval(cycle); if (lines.length > 1) setView(v => ({ ...v, thought: lines[++line % lines.length] })) }, 1500)
      const began = performance.now()
      await sleep(500)
      const { box } = live() ? await ask('locate', { el: s.el }) : { box: null }
      if (!live()) { clearInterval(cycle); break }
      const f = frame.current?.getBoundingClientRect(), st = stage.current?.getBoundingClientRect()
      if (box) {
        const p = toStage(box[0] + Math.min(box[2] * 0.5, 40 + Math.random() * 30), box[1] + box[3] * 0.55)
        await glide(p.x, p.y, live)
      } else if (f && st) {
        // folded away (a phone nav, say): look where a menu would be
        await glide(f.right - st.left - 36, f.top - st.top + 30, live)
      }
      if (!live()) { clearInterval(cycle); break }
      if (s.do === 'hover' || s.do === 'click') await ask('hover', { el: s.el })
      if (s.do === 'type') { setView(v => ({ ...v, press: v.press + 1 })); await sleep(250); await ask('type', { el: s.el, text: s.text }) }
      await sleep(Math.max(0, lines.length * 1500 - (performance.now() - began) - (s.do === 'click' ? 300 : 0)))
      if (s.do === 'click' && live()) {
        setView(v => ({ ...v, press: v.press + 1 }))
        await ask('press', { el: s.el })
        await sleep(350)
      }
      clearInterval(cycle)
    }
    if (!live()) return
    setView(v => ({ ...v, at: t.steps.length, thought: t.end || 'okay, done' }))
    await sleep(3200)
    if (!live()) return
    setView(v => ({ ...v, cursor: null, ended: true }))
    onEnd()
  }, [show, stage])

  return { view, play, stop }
}
