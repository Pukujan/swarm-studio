// A build's film, read and kept up to date for whichever screen draws it: the Film studio (../FilmStudio.tsx) and the
// film panel over the Design deck (FilmPanel.tsx; the classic one is web/canvas/film.js for both). The film comes from
// its own routes (source.ts), read once when the screen opens (its saved events, its job, its one state, its saved
// cuts) and then from the stream's `video:*` events. Make posts what was chosen to POST /api/runs/<id>/video, as the
// classic room does. The film is made by the server with HyperFrames (docs/engines/video.md): nothing here renders,
// scores or checks one.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatLine } from '../../chat'
import type { RunEvent } from '../app/model'
import { filmLines, foldFilm, makeBody, noFilm, withCuts, withPart, withStatus, type Cut, type Film, type FilmAsk, type FilmOpts, type FilmPart, type FilmStatus, type Media } from './model'
import { FilmSourceContext } from './source'

// What the person last chose, kept for them under the classic room's own names (web/canvas/core.js store), so the
// two Studios agree. Never the build, the version or the room: those are the machine's.
const kept = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(`swarm.${k}`) ?? 'null') as T | null) ?? d } catch { return d } }
const keep = (k: string, v: unknown) => { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch { /* private window: this page only */ } }
const KEPT: Partial<Record<keyof FilmOpts, string>> = { voice: 'videoVoice', music: 'videoMusic', clips: 'videoClips', style: 'videoStyle' }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const isFilm = (e: RunEvent) => e.type.startsWith('video:')

export interface FilmHook {
  film: Film
  // the build's name, from its saved events (empty until read, and for a build with no film under `saved: 'film'`)
  title: string
  // the saved film is still being read
  loading: boolean
  // what the film said, for a chat: its news (`sys`), what failed (`err`) and what the person asked (`you`)
  lines: ChatLine[]
  say: (who: ChatLine['who'], text: string) => void
  opts: FilmOpts
  onOpts: (patch: Partial<FilmOpts>) => void
  media: Media | null
  mediaError: string
  // this window asked for the film: its new cut plays out loud here
  mine: boolean
  // this page asked for the film, or heard it start: it is news here, not a saved film opened quietly
  fresh: boolean
  // the live cut's address while the film renders
  live: string | undefined
  make: (ask?: FilmAsk) => Promise<void>
  pick: (cut: number) => void
  addRef: (file: File) => void
  reveal: () => void
  mediaKey: (service: string, key: string | null) => Promise<void>
  mediaAgain: () => void
}

// `saved`: 'always' reads the build's saved events whatever they hold (the Film studio: its name is there);
// 'film' reads them only when the build has a film (the deck's panel: the deck has read them once already)
export function useFilm(run: string | null, { saved = 'always' }: { saved?: 'always' | 'film' } = {}): FilmHook {
  const source = useContext(FilmSourceContext)
  const [film, setFilm] = useState<Film>(() => noFilm(run))
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(!!run)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [opts, setOpts] = useState<FilmOpts>(() => ({ voice: kept('videoVoice', ''), music: kept('videoMusic', true), clips: kept('videoClips', true), style: kept('videoStyle', ''), idea: '', refs: [] }))
  const [media, setMedia] = useState<Media | null>(null)
  const [mediaError, setMediaError] = useState('')
  const [mine, setMine] = useState(false)
  const [fresh, setFresh] = useState(false)
  // when the film was last heard from (the stream), for the check on a film nobody is making any more
  const heard = useRef(0)
  const filmNow = useRef(film)
  filmNow.current = film

  const say = useCallback((who: ChatLine['who'], text: string) => setLines(ls => [...ls, { id: `${Date.now()}:${ls.length}`, at: Date.now(), who, text }]), [])
  const onOpts = useCallback((patch: Partial<FilmOpts>) => {
    for (const [k, v] of Object.entries(patch)) { const name = KEPT[k as keyof FilmOpts]; if (name) keep(name, v) }
    setOpts(o => ({ ...o, ...patch }))
  }, [])

  // the film's job read again: a film that finished, or stopped, while this page heard none of its events
  const readJob = useCallback((id: string) => {
    source.status(id).then(st => setFilm(f => (f.run === id ? withStatus(f, st) : f))).catch(() => {})
  }, [source])
  const applyPart = useCallback((id: string, part: FilmPart | null | undefined) => {
    if (part?.state === 'done' && filmNow.current.busy) return readJob(id)
    setFilm(f => (f.run === id ? withPart(f, part) : f))
  }, [readJob])

  useEffect(() => {
    setFilm(noFilm(run)); setTitle(''); setLines([]); setMine(false); setFresh(false); setLoading(!!run)
    setOpts(o => ({ ...o, idea: '', refs: [] }))
    if (!run) return
    let live = true, loaded = false
    // what the stream said before the saved film was read: folded in after it, in order
    const early: RunEvent[] = []
    const hear = (e: RunEvent) => {
      heard.current = Date.now()
      if (e.type === 'video:start') setFresh(true)
      setFilm(f => foldFilm(f, e))
      for (const l of filmLines(e)) say(l.who, l.text)
    }
    // the film's job and its one state say whether there is a film; the Film studio reads the saved events at once
    const none = Promise.resolve([[] as RunEvent[], [] as Cut[]] as const)
    const read = () => Promise.all([source.events(run).catch(() => [] as RunEvent[]), source.cuts(run).catch(() => [] as Cut[])] as const)
    const eager = saved === 'always' ? read() : null
    Promise.all([source.status(run).catch((): FilmStatus => ({})), source.part(run).catch(() => null)] as const).then(async ([st, part]) => {
      const [events, cuts] = await (eager ?? (part || (st.state && st.state !== 'none') ? read() : none))
      if (!live) return
      const start = events.find(e => e.type === 'run:start')
      setTitle((str(start?.title) || str(start?.brief)).slice(0, 60))
      // a saved film shows quietly: its storyboard, its cuts and its state, with no lines in the chat but the
      // critic's, which is the one thing about the finished film that is only said there
      const old = events.filter(isFilm)
      setFilm(withCuts(withPart(withStatus(old.reduce(foldFilm, noFilm(run)), st), part), cuts))
      const review = old.findLast(e => e.type === 'video:review' || e.type === 'video:start')
      if (review?.type === 'video:review') setLines(filmLines(review).map((l, i) => ({ id: `saved:${i}`, at: review.t || 0, ...l })))
      loaded = true
      setLoading(false)
      for (const e of early.splice(0)) hear(e)
    })
    const stop = source.stream?.(e => {
      if (e.run !== run) return
      // the film's one state rides on the build's (engine/kindstate.mjs)
      if (e.type === 'build:state' && loaded) applyPart(run, (e.parts as { film?: FilmPart | null } | undefined)?.film)
      if (!isFilm(e)) return
      if (loaded) hear(e); else early.push(e)
    })
    return () => { live = false; stop?.() }
  }, [run, source, saved, say, applyPart])

  // A render the page thinks is running but the server no longer has (it restarted, or the job died): ask now and
  // then, and stop waiting if so (web/canvas/film.js)
  useEffect(() => {
    if (!run) return
    const check = window.setInterval(async () => {
      const f = filmNow.current
      if (!f.busy || f.run !== run || Date.now() - heard.current < 20000) return
      heard.current = Date.now()
      const part = await source.part(run).catch(() => null)
      if (part?.state === 'making' || !filmNow.current.busy) return
      if (part?.state === 'failed' || part?.state === 'stopped') return applyPart(run, part)
      const job = await source.status(run).catch(() => null)
      if (!job || job.state === 'working') return
      if (job.state === 'done') return setFilm(x => (x.run === run ? withStatus(x, job) : x))
      setFilm(x => (x.run === run ? { ...x, busy: false, stage: 'failed', message: 'The video stopped before it finished (Swarm Studio restarted). Make it again.' } : x))
    }, 5000)
    return () => clearInterval(check)
  }, [run, source, applyPart])

  // the film's outside services, read once
  const mediaAgain = useCallback(() => { source.media().then(setMedia).catch(() => {}) }, [source])
  useEffect(() => { if (run) mediaAgain() }, [run, mediaAgain])
  const mediaKey = useCallback(async (service: string, key: string | null) => {
    setMediaError('')
    try { setMedia(await source.mediaKey(service, key)) } catch (err) { setMediaError(String((err as Error).message || err).split('\n')[0].slice(0, 160)) }
  }, [source])

  // Make the film, or a new cut: what was chosen, or the chat's or a command's own idea and style (web/canvas/film.js
  // makeVideo)
  const make = useCallback(async (ask: FilmAsk = {}) => {
    if (!run || filmNow.current.busy) return
    setMine(true); setFresh(true)
    try {
      const job = await source.make(run, makeBody(opts, ask))
      // taken: the film is being made from now, whether or not this page hears its events. The screen says so at
      // once, and its state says how it goes on or why it stopped
      heard.current = Date.now()
      if (job.state === 'working') setFilm(f => (f.run === run && !f.busy ? { ...f, busy: true, pct: job.pct || 0, stage: job.stage || 'storyboard', message: '', reason: null } : f))
    } catch (err) {
      setFilm(f => (f.run === run ? { ...f, busy: false, message: String((err as Error).message || err), reason: null } : f))
    }
  }, [run, source, opts])

  const addRef = useCallback((file: File) => {
    if (!run) return
    source.ref(run, file).then(r => { if (r.name) setOpts(o => ({ ...o, refs: [...o.refs, { name: r.name as string }] })) }).catch(() => {})
  }, [run, source])
  const pick = useCallback((cut: number) => setFilm(f => ({ ...f, pick: cut })), [])
  const reveal = useCallback(() => { if (run) source.reveal(run).catch(() => {}) }, [run, source])
  // the live cut is the composition's own page, read again for each film that is made
  const live = useMemo(() => (run && film.busy ? `/video/${encodeURIComponent(run)}/live/index.html?v=${Date.now()}` : undefined), [run, film.busy])

  return { film, title, loading, lines, say, opts, onOpts, media, mediaError, mine, fresh, live, make, pick, addRef, reveal, mediaKey, mediaAgain }
}
