// The Film studio (docs/ux/OBJECTS.md; the classic one is web/canvas/film.js in the Video view): a build's film, at
// ?version=<run>&room=video. Where the person is comes from the machine; the film from its own routes (video/source.ts),
// read once when the room opens (its saved events, its job, its one state, its saved cuts) and kept up to date from
// the stream's `video:*` events. Make the film posts what was chosen to POST /api/runs/<id>/video, as the classic
// room does; the chat's words are an idea for the next cut. The film is made by the server with HyperFrames
// (docs/engines/video.md): nothing here renders, scores or checks one.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Chat, type ChatLine } from '../chat'
import { useNav } from '../nav/NavProvider'
import { useTrail } from '../shell/Trail'
import { useSheets } from './setup/Sheets'
import type { RunEvent } from './app/model'
import { FilmStudioView } from './video/FilmStudioView'
import { filmLines, foldFilm, makeBody, noFilm, withCuts, withPart, withStatus, type Film, type FilmOpts, type FilmPart, type Media } from './video/model'
import { FilmSourceContext } from './video/source'

// What the person last chose, kept for them under the classic room's own names (web/canvas/core.js store), so the
// two Studios agree. Never the build, the version or the room: those are the machine's.
const kept = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(`swarm.${k}`) ?? 'null') as T | null) ?? d } catch { return d } }
const keep = (k: string, v: unknown) => { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch { /* private window: this page only */ } }
const KEPT: Partial<Record<keyof FilmOpts, string>> = { voice: 'videoVoice', music: 'videoMusic', clips: 'videoClips', style: 'videoStyle' }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const isFilm = (e: RunEvent) => e.type.startsWith('video:')

export function FilmStudio() {
  const { view } = useNav()
  const run = view.run || view.version || null
  const source = useContext(FilmSourceContext)
  const sheets = useSheets()
  const [film, setFilm] = useState<Film>(() => noFilm(run))
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(!!run)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [opts, setOpts] = useState<FilmOpts>(() => ({ voice: kept('videoVoice', ''), music: kept('videoMusic', true), clips: kept('videoClips', true), style: kept('videoStyle', ''), idea: '', refs: [] }))
  const [media, setMedia] = useState<Media | null>(null)
  const [mediaError, setMediaError] = useState('')
  // this window asked for the film: its new cut plays out loud here
  const [mine, setMine] = useState(false)
  // when the film was last heard from (the stream), for the check on a film nobody is making any more
  const heard = useRef(0)
  const filmNow = useRef(film)
  filmNow.current = film

  const line = useCallback((who: ChatLine['who'], text: string) => setLines(ls => [...ls, { id: `${Date.now()}:${ls.length}`, at: Date.now(), who, text }]), [])
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
    setFilm(noFilm(run)); setTitle(''); setLines([]); setMine(false); setLoading(!!run)
    setOpts(o => ({ ...o, idea: '', refs: [] }))
    if (!run) return
    let live = true, loaded = false
    // what the stream said before the saved film was read: folded in after it, in order
    const early: RunEvent[] = []
    const hear = (e: RunEvent) => {
      heard.current = Date.now()
      setFilm(f => foldFilm(f, e))
      for (const l of filmLines(e)) line(l.who, l.text)
    }
    Promise.all([source.events(run).catch(() => [] as RunEvent[]), source.status(run).catch(() => ({})), source.part(run).catch(() => null), source.cuts(run).catch(() => [])]).then(([events, st, part, cuts]) => {
      if (!live) return
      const start = events.find(e => e.type === 'run:start')
      setTitle((str(start?.title) || str(start?.brief)).slice(0, 60))
      // a saved film shows quietly: its storyboard, its cuts and its state, with no lines in the chat but the
      // critic's, which is the one thing about the finished film that is only said there
      const saved = events.filter(isFilm)
      setFilm(withCuts(withPart(withStatus(saved.reduce(foldFilm, noFilm(run)), st), part), cuts))
      const review = saved.findLast(e => e.type === 'video:review' || e.type === 'video:start')
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
  }, [run, source, line, applyPart])

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
  const readMedia = useCallback(() => { source.media().then(setMedia).catch(() => {}) }, [source])
  useEffect(readMedia, [readMedia])
  const onMediaKey = useCallback(async (service: string, key: string | null) => {
    setMediaError('')
    try { setMedia(await source.mediaKey(service, key)) } catch (err) { setMediaError(String((err as Error).message || err).split('\n')[0].slice(0, 160)) }
  }, [source])

  // Make the film, or a new cut: what was chosen, or the chat's own idea (web/canvas/film.js makeVideo)
  const make = useCallback(async (ask: { idea?: string } = {}) => {
    if (!run || filmNow.current.busy) return
    setMine(true)
    try {
      const job = await source.make(run, makeBody(opts, ask))
      // taken: the film is being made from now, whether or not this page hears its events. The room says so at
      // once, and its state says how it goes on or why it stopped
      heard.current = Date.now()
      if (job.state === 'working') setFilm(f => (f.run === run && !f.busy ? { ...f, busy: true, pct: job.pct || 0, stage: job.stage || 'storyboard', message: '', reason: null } : f))
    } catch (err) {
      setFilm(f => (f.run === run ? { ...f, busy: false, message: String((err as Error).message || err), reason: null } : f))
    }
  }, [run, source, opts])

  const onAddRef = useCallback((file: File) => {
    if (!run) return
    source.ref(run, file).then(r => { if (r.name) setOpts(o => ({ ...o, refs: [...o.refs, { name: r.name as string }] })) }).catch(() => {})
  }, [run, source])

  // the chat's words are an idea for the film (web/canvas/loop.js: the Video view's box)
  const onChat = useCallback(({ text }: { text: string }) => {
    line('you', `🎬 ${text}`)
    make({ idea: text })
  }, [line, make])

  useTrail(title || undefined)
  // the film's news is the Log's; what failed, and what the person said, is the chat's too
  const feed = useMemo(() => ({ lines: lines.filter(l => l.who !== 'sys'), log: lines.filter(l => l.who === 'sys' || l.who === 'err') }), [lines])
  const onSetup = useCallback(() => sheets.open('setup'), [sheets])
  // the live cut is the composition's own page, read again for each film that is made
  const live = useMemo(() => (run && film.busy ? `/video/${encodeURIComponent(run)}/live/index.html?v=${Date.now()}` : undefined), [run, film.busy])

  return (
    <>
      {/* the chat is down the left in a wide window, along the bottom in a narrower one (decision 0015, chat/Dock.tsx);
          the room takes what is beside or above it */}
      <div className="flex min-w-0 flex-col overflow-hidden" style={{ height: 'calc(100dvh - 3.5rem - var(--chat-h, 0px))', marginLeft: 'var(--chat-w, 0px)' }}>
        <FilmStudioView film={film} loading={loading} opts={opts} onOpts={onOpts} media={media} mediaError={mediaError} mine={mine} live={live}
          onMake={() => { make() }} onPick={pick => setFilm(f => ({ ...f, pick }))} onAddRef={onAddRef} onReveal={() => { if (run) source.reveal(run).catch(() => {}) }}
          onMediaKey={onMediaKey} onMediaAgain={readMedia} onSetup={onSetup} />
      </div>
      {run && <Chat from={run} project={view.project} lines={feed.lines} log={feed.log} onSubmit={onChat}
        box={{ placeholder: 'An idea for the video…', empty: 'Say an idea for the video: “faster, end on the crowd”, “for Instagram”. Your words make the next cut.', action: 'Send' }} />}
    </>
  )
}
