// The Overview's camera (spec 36; image-first boards §3.7): a page with no saved picture of its current version is
// photographed here, as web/project.js does it in the current Studio. The page runs once in a frame of its own, off
// screen (the Design deck's PageFrame, sandboxed with allow-scripts only, fed from the build's events), photographs
// itself when its sections are in and it has stopped growing (web/capture.js: snapDOM inside the frame, a worker
// makes each size), and the frame goes. Both sizes are kept on the server (POST /api/runs/<run>/snaps; a page that
// changed meanwhile is refused) and drawn at once. Which page, and when, is snaps.ts's.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { dataUrl, makeCapture } from '@studio/capture'
import { BoardHostContext } from '../../board/host'
import { iframeHost } from '../../board/iframeHost'
import { PageFrame } from '../deck/PageFrame'
import { fold, layersOf, type DeckModel } from '../deck/model'
import { serverSource } from '../deck/source'
import { post } from './api'
import type { Board } from './model'
import type { StageHandle } from './Stage'
import { FULL, REST_MS, RETRY_MS, SMALL, TRIES, pageShaped, pick, wanted, type Job, type Kept } from './snaps'

// the frame's sections are in and it has not grown for this long: it is photographed
const SETTLE_MS = 300
// a page that never settles is let go after this long (and tried again with the rest)
const GIVE_UP_MS = 20000
const enc = encodeURIComponent
const idle = (f: () => void) => (window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 1500 }) : window.setTimeout(f, 50))

// the build as the frames need it, with the page versions it was read at
interface Read { run: string, vs: Record<string, string>, m: DeckModel }

export function useSnapshots(run: string | null, board: Board | null, stage: RefObject<StageHandle | null>): { kept: ReadonlyMap<string, Kept>, booth: ReactNode } {
  const [kept, setKept] = useState<ReadonlyMap<string, Kept>>(() => new Map())
  const [job, setJob] = useState<Job | null>(null)
  const [read, setRead] = useState<Read | null>(null)
  const failed = useRef(new Set<string>())
  const tries = useRef(0)
  const open = useRef(run)
  open.current = run
  const latest = useRef(board)
  latest.current = board
  const capture = useMemo(() => makeCapture({ base: '' }), [])
  const host = useMemo(() => iframeHost(), [])
  useEffect(() => () => capture.close(), [capture])

  // another version opened: nothing taken for the last one is drawn on it
  useEffect(() => { setKept(new Map()); setJob(null); setRead(null); failed.current.clear(); tries.current = 0 }, [run])

  const want = useMemo(() => wanted(board, kept), [board, kept])
  const any = want.s.size + want.f.size > 0

  // the next picture: when the camera has rested, in idle time, in a visible tab (a story has no server: none)
  useEffect(() => {
    if (!run || job || !any || !window.SWARM?.token) return
    let t = 0, gone = false
    const next = (wait: number) => { t = window.setTimeout(tick, wait) }
    function tick() {
      if (gone) return
      if (document.hidden) return next(1000)
      const rest = performance.now() - (stage.current?.movedAt() ?? 0)
      if (rest < REST_MS) return next(REST_MS - rest)
      const j = pick(want, p => stage.current?.inView(`page:${p}`) ?? false, failed.current)
      if (j) { idle(() => { if (!gone) setJob(j) }); return }
      // a page that came out a thin strip is tried again a few times; a page out of view waits for the camera
      if (failed.current.size && tries.current < TRIES) { tries.current++; failed.current.clear(); return next(RETRY_MS) }
      next(1000)
    }
    next(0)
    return () => { gone = true; clearTimeout(t) }
  }, [run, job, want, any, stage])

  const fail = useCallback((page: string) => { failed.current.add(page); setJob(null) }, [])

  // the build's events, read again when the page to photograph has changed since they were read
  useEffect(() => {
    if (!run || !job || (read?.run === run && read.vs[job.page] === job.v)) return
    let live = true
    const vs = Object.fromEntries(Object.entries(latest.current?.snaps?.pages || {}).map(([id, d]) => [id, d.v]))
    serverSource.events(run).then(events => {
      if (!live || open.current !== run) return
      setRead({ run, vs, m: fold(events, run) })
      // the page changed again before the events were read: the next pick has its new version
      if (vs[job.page] !== job.v) setJob(null)
    }, () => { if (live) fail(job.page) })
    return () => { live = false }
  }, [run, job, read, fail])

  const ok = !!job && read?.run === run && read.vs[job.page] === job.v
  const page = ok ? read!.m.pages.find(p => p.id === job!.page) ?? null : null
  useEffect(() => { if (ok && !page) fail(job!.page) }, [ok, page, job, fail])
  const layers = useMemo(() => (page && read ? layersOf(read.m, page.id) : []), [page, read])

  // the frame tells where its sections are whenever it grows
  const grewAt = useRef(0)
  const onGeo = useCallback(() => { grewAt.current = performance.now() }, [])

  useEffect(() => {
    if (!run || !job || !page) return
    let gone = false
    const t0 = performance.now()
    grewAt.current = 0
    const shoot = async () => {
      const win = host.frame(job.page)?.contentWindow
      if (!win) return null
      const out = await capture.shoot(win, { scales: job.scales })
      // a frame still being laid out photographs as a thin strip
      if (job.scales.includes(SMALL) && !pageShaped(out.width, out.height)) return null
      const urls = new Map<number, string>()
      for (const s of job.scales) urls.set(s, await dataUrl(out.jpegs.get(s)!))
      return urls
    }
    const keep = (size: 's' | 'f', image: string) => post(`/api/runs/${enc(run)}/snaps`, { page: job.page, v: job.v, size, image }).catch(() => null)
    const wait = window.setInterval(() => {
      const now = performance.now()
      if (now - t0 > GIVE_UP_MS) { clearInterval(wait); fail(job.page); return }
      if (!grewAt.current || now - grewAt.current < SETTLE_MS) return
      clearInterval(wait)
      shoot().then(async urls => {
        if (gone || open.current !== run) return
        if (!urls) return fail(job.page)
        const s = urls.get(SMALL), f = urls.get(FULL)
        if (s) await keep('s', s)
        if (f) await keep('f', f)
        if (gone || open.current !== run) return
        const small = s ?? latest.current?.snaps?.pages?.[job.page]?.s
        setKept(m => new Map(m).set(job.page, small ? { v: job.v, s: small, ...(f ? { f } : {}) } : { v: job.v }))
        setJob(null)
      }, () => { if (!gone) fail(job.page) })
    }, 200)
    return () => { gone = true; clearInterval(wait) }
  }, [run, job, page, host, capture, fail])

  const booth = page && read && job
    ? (
      <div className="ov-booth" aria-hidden inert>
        <BoardHostContext value={host}>
          <PageFrame key={`${page.id}:${job.v}`} page={page} layers={layers} agents={read.m.agents} theme={read.m.theme} onGeo={onGeo} />
        </BoardHostContext>
      </div>
    )
    : null
  return { kept, booth }
}
