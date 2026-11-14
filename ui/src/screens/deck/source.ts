// Where the Design deck's events come from: the saved build (GET /api/runs/<run>/events) and, while it is being
// built, the stream (/events), the same two the current deck reads (web/canvas/replay.js openRun, start.js
// connect). Stories hand the deck a source of their own, so a mock-up needs no server.
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { apply, empty, fold, type DeckEvent, type DeckModel } from './model'
import { schedule, withTyping } from './replay'

export interface DeckSource {
  events(run: string): Promise<DeckEvent[]>
  // every event the server sends; returns the way to stop listening. Optional: a story has no stream.
  stream?(on: (e: DeckEvent) => void): () => void
  // whether `run` is the build the server is making now. Without it (a story) a saved build is not live.
  live?(run: string): Promise<boolean>
}

const token = () => window.SWARM?.token ?? ''

export const serverSource: DeckSource = {
  async events(run) {
    const r = await fetch(`/api/runs/${encodeURIComponent(run)}/events`, { headers: { 'x-swarm-token': token() } })
    if (!r.ok) throw new Error(r.status === 404 ? 'This build is not here any more.' : `The build did not load (HTTP ${r.status}).`)
    return r.json() as Promise<DeckEvent[]>
  },
  stream(on) {
    const es = new EventSource(`/events?k=${encodeURIComponent(token())}`)
    es.onmessage = m => { try { on(JSON.parse(m.data) as DeckEvent) } catch { /* a keep-alive or a torn line */ } }
    return () => es.close()
  },
  async live(run) {
    const r = await fetch('/api/state', { headers: { 'x-swarm-token': token() } })
    const s = r.ok ? await r.json() as { run?: string | null, busy?: boolean } : {}
    return s.run === run && !!s.busy
  }
}

export const DeckSourceContext = createContext<DeckSource>(serverSource)

export type DeckLoad = { model: DeckModel, loading: boolean, error: string | null }

// The build `run` as a model: loaded once, then kept up to date from the stream. The stream replays the server's
// current build from its run:start to a late joiner, so a run:start of this build starts the fold again from it.
// With `replay`, the saved build plays again on its own clock instead (Replay), with no stream; `onReplayEnd` is
// called when it has played to the end.
export function useDeckRun(run: string | null, replay = false, onReplayEnd?: () => void): DeckLoad {
  const source = useContext(DeckSourceContext)
  const [load, setLoad] = useState<DeckLoad>({ model: empty(run), loading: !!run, error: null })
  const queue = useRef<DeckEvent[]>([])
  const ended = useRef(onReplayEnd)
  ended.current = onReplayEnd

  useEffect(() => {
    if (!run) { setLoad({ model: empty(null), loading: false, error: null }); return }
    if (replay) return play(run)
    let live = true, frame = 0
    setLoad({ model: empty(run), loading: true, error: null })
    // stream events wait in a queue until the file is folded, then go in together every 33 ms (a build streams
    // fast). A timer, not requestAnimationFrame, which never runs in a hidden tab: the deck there would stop
    let ready = false
    const flush = () => {
      frame = 0
      const batch = queue.current.splice(0)
      if (!batch.length || !live) return
      setLoad(l => {
        let m = l.model
        for (const e of batch) m = e.run === run && e.type === 'run:start' ? apply(empty(run), e) : apply(m, e)
        return { ...l, model: m }
      })
    }
    const stop = source.stream?.(e => {
      if (e.run !== run) return
      queue.current.push(e)
      if (ready && !frame) frame = window.setTimeout(flush, 33)
    })
    Promise.all([source.events(run), source.live?.(run).catch(() => false) ?? false]).then(([events, building]) => {
      if (!live) return
      let m = fold(events, run)
      // a saved build that never finished and is not being made now stopped half way (web/canvas/replay.js
      // openRun): what it built is kept, and no one is still at work on it
      if (!building && (m.state === 'planning' || m.state === 'building')) m = apply(m, { type: 'run:stopped', run, t: m.tEnd || m.t0 })
      setLoad({ model: m, loading: false, error: null })
      ready = true
      if (queue.current.length) frame = window.setTimeout(flush, 33)
    }, (err: unknown) => {
      if (live) setLoad({ model: empty(run), loading: false, error: err instanceof Error ? err.message : String(err) })
    })
    return () => { live = false; stop?.(); if (frame) clearTimeout(frame); queue.current = [] }
  }, [run, source, replay])

  // Replay: every event at its time, stamped now (the deck treats it as happening), on one timer at a time
  function play(id: string) {
    let live = true, timer = 0
    setLoad({ model: empty(id), loading: true, error: null })
    source.events(id).then(all => {
      if (!live) return
      const events = withTyping(all.filter(e => e.type !== 'cmd')), at = schedule(events), start = performance.now()
      let i = 0, m = empty(id)
      setLoad({ model: m, loading: false, error: null })
      const step = () => {
        if (!live) return
        const now = performance.now() - start
        while (i < events.length && at[i] <= now) m = apply(m, { ...events[i++], t: Date.now() })
        setLoad(l => ({ ...l, model: m }))
        if (i < events.length) timer = window.setTimeout(step, Math.max(16, at[i] - now))
        else ended.current?.()
      }
      step()
    }, (err: unknown) => {
      if (live) setLoad({ model: empty(id), loading: false, error: err instanceof Error ? err.message : String(err) })
    })
    return () => { live = false; clearTimeout(timer) }
  }

  return load
}
