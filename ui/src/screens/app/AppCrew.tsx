// The crew on the app build wall (spec 44, "Cursors and skeletons"; #529): while the app is built, each window shows
// its crew member's cursor, with what they are doing right now (crew:act) on its name; Hermia's strip says the order
// she gave last (crew:lead), and a dotted line runs from her to the helper she gave it to while it is fresh (7 s), as
// the current Studio's code wall does (web/canvas/start.js crewTick, web/canvas.css .radio-line). Her thinking is a
// dimmer line in the strip, never an order. Reduced motion: the cursors still show, the line does not move.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { crew as crewOf } from '../deck/crew'
import { FRESH, heard, type Radio } from './radio'
import './appcrew.css'

// the wall's windows, in the crew's order (AppWallView's ids)
export const WINDOW_IDS = ['map', 'live', 'code', 'shipped'] as const

type Spot = { x: number, y: number }

// Hermia's strip over the wall: her last order (to whom, and what), or her thinking
export function HermiaStrip({ radio, avatar }: { radio: Radio, avatar: RefObject<HTMLSpanElement | null> }) {
  const lead = radio.lead, reason = radio.reason
  if (!lead && !reason) return null
  return (
    <div className="app-radio" role="status" aria-live="polite">
      <span ref={avatar} className="app-radio-av" aria-hidden>H</span>
      <p className="m-0 min-w-0 flex-1">
        <b>Hermia</b>{lead?.to ? <span className="app-radio-to"> → {lead.to}</span> : null}
        {lead && <span className="app-radio-text">{lead.text}</span>}
        {reason && <span className="app-radio-reason">{reason.text}</span>}
      </p>
    </div>
  )
}

// the cursors, one per window, and Hermia's line to the one she is talking to
export function AppCrew({ names, radio, host, avatar, building }: {
  names: string[], radio: Radio, host: RefObject<HTMLDivElement | null>, avatar: RefObject<HTMLSpanElement | null>, building: boolean
}) {
  const [spots, setSpots] = useState<(Spot | null)[]>([])
  const [, tick] = useState(0)
  const lead = radio.lead
  const live = building || heard(lead, FRESH.lead)

  // where each window's cursor rests: low on its right, inside it, relative to the wall's box
  const measure = useRef(() => {})
  measure.current = () => {
    const h = host.current
    if (!h) return
    const box = h.getBoundingClientRect()
    setSpots(WINDOW_IDS.map((id, i) => {
      const w = h.querySelector<HTMLElement>(`[data-window="${id}"]`)
      if (!w || !w.getClientRects().length) return null
      const r = w.getBoundingClientRect()
      return { x: r.right - box.left - 150 - (i % 2) * 24, y: r.bottom - box.top - 56 }
    }))
  }
  // after the commit (a passive effect): the wall's ref is its parent's, attached after this layer's layout effects
  useEffect(() => {
    measure.current()
    const h = host.current
    if (!h) return
    const o = new ResizeObserver(() => measure.current())
    o.observe(h)
    return () => o.disconnect()
  }, [host, names.length, building])

  // freshness runs out without an event: look again while anything is fresh
  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(t)
  }, [live])

  const color = (n: string) => crewOf().color(n)
  const to = lead && heard(lead, FRESH.lead) ? names.indexOf(lead.to) : -1
  const end = to >= 0 ? spots[to] : null
  const av = avatar.current, h = host.current
  let line: string | null = null
  if (end && av && h) {
    const a = av.getBoundingClientRect(), b = h.getBoundingClientRect()
    const x1 = a.left - b.left + a.width / 2, y1 = a.bottom - b.top, x2 = end.x + 6, y2 = end.y + 4
    line = `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${(y1 + 80).toFixed(1)} ${x2.toFixed(1)} ${(y2 - 80).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  return (
    <div className="app-crew" aria-hidden>
      {building && names.slice(0, WINDOW_IDS.length).map((n, i) => {
        const s = spots[i]
        if (!s) return null
        const act = radio.acts[n]
        return (
          <div key={n} data-agent={n} className="app-cursor" style={{ transform: `translate(${s.x}px, ${s.y}px)`, ['--c' as string]: color(n) }}>
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1l5.5 13 2-5.5 5.5-2z" /></svg>
            <span className="app-cursor-tag">{n}{heard(act, FRESH.act) ? <i> · {act.text}</i> : null}</span>
          </div>
        )
      })}
      {line && <svg className="app-radio-line" style={{ ['--c' as string]: color(lead!.to) }}><path d={line} /></svg>}
    </div>
  )
}
