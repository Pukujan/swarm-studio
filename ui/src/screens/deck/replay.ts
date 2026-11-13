// Replay (☰ → Replay in the current deck, web/canvas/replay.js): a finished build played again on its own clock, so
// the crew can be watched at work. Pure: the events to play and when, which DesignDeck's source feeds to the fold.
import type { DeckEvent } from './model'

// A saved run keeps each section's finished HTML but not the stream that wrote it, so a replay would show every
// section popping in whole. This types it back in: the HTML in pieces, spread over the time between the agent
// taking the section and finishing it (web/canvas/replay.js withTyping).
export function withTyping(events: DeckEvent[]): DeckEvent[] {
  const took = new Map<string, number>(), out: { e: DeckEvent, i: number }[] = []
  let last = 0
  for (const e of events) {
    const t = typeof e.t === 'number' ? e.t : last
    last = t
    const k = `${String(e.page)}/${String(e.layer)}`
    if (e.type === 'agent:assign') took.set(k, t)
    const html = typeof e.html === 'string' ? e.html : ''
    if (e.type === 'layer:done' && html && !e.kept && took.has(k)) {
      const t0 = Math.max(took.get(k)!, t - (typeof e.ms === 'number' ? e.ms : 4000))
      const n = Math.min(40, Math.max(6, Math.round(html.length / 220)))
      took.delete(k)
      for (let i = 0; i < n; i++) {
        out.push({ e: { type: 'layer:delta', run: e.run, page: e.page, layer: e.layer, agent: e.agent, text: html.slice(Math.floor(i * html.length / n), Math.floor((i + 1) * html.length / n)), t: t0 + (t - t0) * (i + 0.5) / n }, i: out.length })
      }
    }
    out.push({ e: typeof e.t === 'number' ? e : { ...e, t }, i: out.length })
  }
  return out.sort((x, y) => (x.e.t as number) - (y.e.t as number) || x.i - y.i).map(x => x.e)
}

// When each event plays, in ms from the start, at `speed` times real time. A long quiet gap (a model thinking) is
// cut to 1.5 s, so the replay never looks stuck.
export function schedule(events: DeckEvent[], speed = 1): number[] {
  let clock = 0, prev = typeof events[0]?.t === 'number' ? events[0].t : 0
  return events.map(e => {
    const t = typeof e.t === 'number' ? e.t : prev
    clock += Math.min(Math.max(0, t - prev) / speed, 1500)
    prev = t
    return clock
  })
}
