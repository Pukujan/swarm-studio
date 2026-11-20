// The Film studio, drawn (the classic room is web/canvas/film.js renderVideo, as the Video view shows it): the
// title, the storyboard's head and beats, then one of four bodies: the film with its cuts, its making (the live cut
// once the composition is written, a skeleton before), why it is not there with the one thing to do, or the empty
// form. The form is the same under a finished film ("Make a new cut"). It keeps nothing of the build: the screen
// (../FilmStudio.tsx) hands it the film and what was chosen, and hears every press.
// With `panel` it is the same film as the panel floating over the Design deck (FilmPanel.tsx; the classic .video-pop):
// its head has Open the Film studio and Minimize, and minimized it is only the title and the progress, so the canvas
// and the crew stay in view.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FileTrigger } from 'react-aria-components'
import { boardVideo, dropVideo, playVideo } from '@studio/video'
import { BoardVideo } from '../../primitives/BoardVideo'
import { Button, IconButton, LinkButton, PlainButton } from '../../primitives/Button'
import { Checkbox } from '../../primitives/Checkbox'
import { Command } from '../../primitives/Command'
import { Select } from '../../primitives/Select'
import { TextField } from '../../primitives/TextField'
import { ToggleGroup } from '../../primitives/ToggleGroup'
import { revealLabel } from '../../shared/reveal'
import {
  cutNo, filmShows, filmWhy, liveOn, MEDIA_KINDS, MEDIA_VIA, playing, savedTo, shapesOf, stageSays, VIDEO_STYLES, VOICE_OPTS,
  type Film, type FilmOpts, type Media, type MediaService, type Scene, type Shape, type StyleNotes
} from './model'
import './film.css'

// React Aria's Select keys may not be empty: the first choice of each list ('' to the server) is 'auto' here
const key = (v: string) => v || 'auto'
const unkey = (k: unknown) => (k === 'auto' || k == null ? '' : String(k))
const SHAPES: Record<Shape, string> = { wide: 'Wide', tall: 'Tall', square: 'Square' }
const TITLE = 'font-display text-[26px] leading-none font-extrabold tracking-[.02em] uppercase'
const TITLE_EM = 'font-serif text-[.92em] font-medium tracking-normal text-pink normal-case italic'
const PILL = 'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs'

export interface FilmStudioViewProps {
  film: Film
  // the saved film is still being read: a skeleton, never the empty form
  loading?: boolean
  opts: FilmOpts
  onOpts: (patch: Partial<FilmOpts>) => void
  // the film's outside services, once read (null: none to show yet)
  media: Media | null
  // the last key that could not be connected, in plain words
  mediaError?: string
  onMake: () => void
  onPick: (cut: number) => void
  onAddRef: (file: File) => void
  onReveal: () => void
  onMediaKey: (service: string, key: string | null) => Promise<void> | void
  onMediaAgain: () => void
  // Set up, when Hermes is not there (absent: Try again)
  onSetup?: () => void
  // the live cut's address while it renders (a story hands its own)
  live?: string
  // this window asked for the film: its new cut plays once, out loud
  mine?: boolean
  // drawn as the panel over the Design deck: minimized or not, its Minimize, and Open the Film studio
  panel?: { min: boolean, onMin: () => void, onOpen: () => void }
}

export function FilmStudioView({ film, loading = false, opts, onOpts, media, mediaError, onMake, onPick, onAddRef, onReveal, onMediaKey, onMediaAgain, onSetup, live, mine = false, panel }: FilmStudioViewProps) {
  const shows = loading ? 'loading' : filmShows(film)
  const min = !!panel?.min
  const [notesOpen, setNotesOpen] = useState(false)
  const [shape, setShape] = useState<Shape>('wide')
  const [big, setBig] = useState<{ src: string, at: number } | null>(null)
  const why = filmWhy(film)
  const now = playing(film, shape)
  const shapes = shapesOf(film)
  const player = useRef<HTMLVideoElement>(null)
  // a new cut plays once, out loud, only in the window that asked for it (other open windows of Swarm Studio would
  // play the same sound over it); a browser that will not play sound unasked plays it muted
  const played = useRef('')
  useEffect(() => {
    const v = player.current
    if (shows !== 'film' || min || !v || !now.src || played.current === now.src) return
    if (!mine && !document.hasFocus()) return
    played.current = now.src
    playVideo(v).catch(() => { v.muted = true; playVideo(v).catch(() => {}) })
  }, [shows, min, now.src, mine])
  useEffect(() => { if (shows !== 'film' || min) setBig(null) }, [shows, min])

  const form = (
    <>
      <div className="mt-2.5 flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <TextField label="Describe the film" aria-label="Describe the film" placeholder="Describe the film" bare multiline value={opts.idea} onChange={idea => onOpts({ idea })} />
        </div>
        <FileTrigger acceptedFileTypes={['image/*', 'video/*', 'audio/*']} onSelect={files => { const f = files?.[0]; if (f) onAddRef(f) }}>
          <IconButton icon="plus" label="Add a style reference" className="border border-line bg-panel-2 text-text" />
        </FileTrigger>
      </div>
      {opts.refs.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {opts.refs.map((r, i) => (
            <li key={`${r.name}:${i}`} className="inline-flex max-w-[260px] items-center gap-1 rounded-full border border-line pl-3 text-xs">
              <span className="truncate">{r.name}</span>
              <IconButton icon="x" size={12} label={`Remove ${r.name}`} onPress={() => onOpts({ refs: opts.refs.filter((_, k) => k !== i) })} className="rounded-full" />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex flex-wrap items-end gap-x-3.5 gap-y-2">
        <Select label="Start from" options={VIDEO_STYLES.map(([v, name]) => ({ id: key(v), name }))} selectedKey={key(opts.style)} onSelectionChange={k => onOpts({ style: unkey(k) })} />
        <Select label="Voice" options={VOICE_OPTS.map(([v, name]) => ({ id: key(v), name }))} selectedKey={key(opts.voice)} onSelectionChange={k => onOpts({ voice: unkey(k) })} />
        <Checkbox isSelected={opts.music} onChange={music => onOpts({ music })}>Music</Checkbox>
        {media?.clips?.on && <Checkbox isSelected={opts.clips} onChange={clips => onOpts({ clips })}>Clips</Checkbox>}
      </div>
      {media && <MediaRow media={media} error={mediaError} onKey={onMediaKey} onAgain={onMediaAgain} />}
    </>
  )
  const foot = (word: string, press: () => void = onMake) => <div className="mt-2.5 flex justify-end"><Button role="primary" onPress={press}>{word}</Button></div>

  return (
    <section data-film={shows} data-min={min || undefined} aria-label={panel ? 'Film' : 'Film studio'}
      className={panel
        ? `film-pop absolute right-3.5 bottom-3.5 z-[35] max-h-[calc(100%-28px)] max-w-[calc(100%-28px)] overflow-auto rounded-[12px] border border-panel-edge bg-glass p-3 text-[13px] text-text shadow-[0_24px_70px_rgb(var(--shade-rgb)/.6)] backdrop-blur-[18px] ${min ? 'w-[300px]' : 'w-[520px]'}`
        : 'film-room min-h-0 flex-1 overflow-auto px-7 py-5 text-[13px] text-text'}>
      {panel
        ? (
          <div className={`flex items-center justify-between gap-2 ${min ? 'mb-1' : 'mb-2.5'}`}>
            <h2 className={TITLE}>The promo <em className={TITLE_EM}>video</em></h2>
            <span className="flex items-center gap-1">
              <IconButton icon="ext" size={16} label="Open the Film studio" onPress={panel.onOpen} />
              <IconButton icon={min ? 'up' : 'minus'} size={16} label={min ? 'Expand' : 'Minimize'} aria-expanded={!min} onPress={panel.onMin} />
            </span>
          </div>
        )
        : <h1 className={`mb-3 ${TITLE}`}>The promo <em className={TITLE_EM}>video</em></h1>}
      {!min && (film.board || film.notes) && (
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          {film.board && <><b className="text-sm">{film.board.title}</b><small className="text-muted">{film.board.pace}{film.board.bpm ? ` · ${film.board.bpm} BPM` : ''}</small></>}
          {film.notes && (
            <PlainButton aria-expanded={notesOpen} onPress={() => setNotesOpen(o => !o)} className={`${PILL} ml-auto border-line`}>
              Style{film.notes.palette?.slice(0, 5).map((h, i) => <i key={i} aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: h }} />)}
            </PlainButton>
          )}
          {film.notes && notesOpen && <Notes n={film.notes} />}
        </div>
      )}
      {!min && film.story.length > 0 && (
        <ol aria-label="Storyboard" className="mb-2 flex gap-2 overflow-x-auto pb-2">
          {film.story.map((sc, i) => <SceneCard key={i} sc={sc} />)}
        </ol>
      )}

      {shows === 'film' && !min && (
        <>
          {film.cuts.length > 1 && (
            <div role="group" aria-label="Cuts" className="mb-2.5 flex flex-wrap gap-1.5">
              {film.cuts.map((c, i) => {
                const style = VIDEO_STYLES.find(([k]) => k === c.style)?.[1] || ''
                return (
                  <PlainButton key={c.name} aria-pressed={i === film.pick} aria-label={`Cut ${cutNo(c.name)}${c.idea ? `: ${c.idea}` : ''}`} onPress={() => onPick(i)}
                    className={`${PILL} max-w-[280px] bg-panel-2 ${i === film.pick ? 'border-accent text-text' : 'border-line text-muted'}`}>
                    <b className="text-text">v{cutNo(c.name)}</b>
                    <span className="truncate">{style}{c.idea ? ` · ${c.idea.length > 28 ? `${c.idea.slice(0, 28)}…` : c.idea}` : ''}</span>
                    {c.seconds ? <small className="opacity-70">{Math.round(c.seconds)}s</small> : null}
                  </PlainButton>
                )
              })}
            </div>
          )}
          {now.latest && shapes.length > 1 && <div className="mb-2.5 flex"><ToggleGroup label="Shape" items={shapes.map(k => ({ k, label: SHAPES[k] }))} value={now.shape} onChange={setShape} /></div>}
          <BoardVideo ref={player} src={now.src} label="The promo video" className="block aspect-video max-h-[calc(100dvh-260px)] w-full rounded-[10px] bg-void" />
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
            <span className="[overflow-wrap:anywhere]">Saved to {savedTo(now.file)}</span>
            <span className="flex flex-wrap items-center gap-2">
              <LinkButton role="secondary" href={now.src} download={now.name}>Download</LinkButton>
              <Button role="secondary" onPress={onReveal}>{revealLabel()}</Button>
              <Button role="secondary" onPress={() => { const v = player.current; setBig({ src: now.src, at: v?.currentTime || 0 }); v?.pause() }}>⛶ Big screen</Button>
            </span>
          </div>
          {form}
          {foot('Make a new cut')}
          {big && <BigScreen src={big.src} at={big.at} back={panel ? 'Design deck' : 'Film studio'} onClose={() => setBig(null)} />}
        </>
      )}

      {shows === 'making' && (
        <>
          {/* before the live cut plays, a skeleton in the film's shape, marked busy: Hermia works on it (web/pet.js, #392) */}
          {liveOn(film) && live
            ? !min && <LiveCut src={live} />
            : !min && <div role="status" aria-busy="true" aria-label="The film, on its way" className="wait-in mb-2.5 aspect-video w-full rounded-[6px] bg-[color-mix(in_srgb,var(--text)_7%,transparent)] motion-safe:animate-pulse" />}
          <div role="progressbar" aria-label="The film" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(film.pct)} className="h-1.5 overflow-hidden rounded-[3px] bg-panel-2">
            <i className="block h-full bg-accent transition-[width] duration-[400ms]" style={{ width: `${Math.max(3, film.pct)}%` }} />
          </div>
          <p className={`mt-2 text-xs text-muted ${min ? 'truncate' : ''}`}>{stageSays(film)}</p>
        </>
      )}

      {shows === 'failed' && (
        <>
          {/* the reason in plain words, what to do about it, and the one action: Set up when Hermes is not there */}
          <p role="alert" className="mt-2 text-xs text-hot-text">{why.message}</p>
          {!min && why.action && <p className="mt-2 text-xs text-muted">{why.action.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i} className="font-monospace text-text">{part}</code> : part))}</p>}
          {!min && (why.code === 'hermes' && onSetup ? foot('Set up', onSetup) : foot('Try again'))}
        </>
      )}

      {shows === 'none' && !min && <>{form}{foot('Make the film')}</>}
      {shows === 'loading' && !min && <div role="status" aria-busy="true" aria-label="Loading the film" className="wait-in aspect-video w-full rounded-[6px] bg-[color-mix(in_srgb,var(--text)_7%,transparent)] motion-safe:animate-pulse" />}
    </section>
  )
}

// one card per beat, its length and camera; names only
function SceneCard({ sc }: { sc: Scene }) {
  const layer = sc.layer === 'story' ? 'border-t-accent' : sc.layer === 'proof' ? 'border-t-[color-mix(in_srgb,var(--accent)_55%,transparent)]' : 'border-t-line'
  const black = sc.kind === 'black'
  return (
    <li className={`film-scene relative flex-[0_0_112px] rounded-[6px] border-t-[3px] bg-panel-2 p-1.5 text-[11px] ${layer}`}>
      {sc.image
        ? <img src={sc.image} alt="" className="mb-1 block h-14 w-full rounded-[4px] object-cover" />
        : <span className="mb-1 grid h-14 w-full place-items-center rounded-[4px] bg-surface-2 font-monospace text-[11px] font-bold text-muted uppercase">{black ? '' : sc.kind}</span>}
      <b className="line-clamp-2 leading-tight font-semibold">{sc.headline || (black ? '·' : '')}</b>
      <small className="text-muted">
        {[sc.seconds ? `${Number(sc.seconds).toFixed(1)}s` : '', sc.camera && sc.image ? sc.camera : '', sc.speed && sc.speed > 1 ? `${sc.speed}×` : '', sc.cue || ''].filter(Boolean).join(' · ')}
      </small>
    </li>
  )
}

// what the style references said, one tap down
function Notes({ n }: { n: StyleNotes }) {
  const rows: [string, string | undefined][] = [
    ['From', (n.from || []).map(x => x.what).filter(Boolean).join(', ')], ['Type', n.type], ['Pacing', n.pacing], ['Cuts', n.cutRhythm?.text], ['Camera', n.camera], ['Motion', n.motion], ['Mood', n.mood],
    ['Music', n.music ? [n.music.tempo ? `${n.music.tempo} BPM` : '', n.music.instruments?.join(', '), n.music.structure].filter(Boolean).join(' · ') : '']
  ]
  return (
    <dl className="mt-1 grid basis-full grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="m-0">{v}</dd></div>)}
    </dl>
  )
}

// The agents' cut, playing while it renders: the composition's own page (1920 × 1080), scaled to the room's width
function LiveCut({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / 1920)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="relative my-2 aspect-video w-full overflow-hidden rounded-[10px] bg-void">
      <iframe sandbox="allow-scripts" src={src} title="The video, playing while it renders" scrolling="no" className="pointer-events-none absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left border-0" style={{ transform: `scale(${scale})` }} />
      <span className="absolute top-2 left-2.5 rounded-full bg-[rgb(var(--shade-rgb)/.58)] px-2 py-[3px] text-[11px] font-semibold text-text first-letter:text-hot">● live: the agents' cut, rendering</span>
    </div>
  )
}

// The video filling the whole pane (and the screen, where the app allows it), from where the small one was
function BigScreen({ src, at, back, onClose }: { src: string, at: number, back: string, onClose: () => void }) {
  const wrap = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const v = video.current, el = wrap.current
    if (!v || !el) return
    boardVideo(v, { src, at })
    playVideo(v).catch(() => { v.muted = true; playVideo(v).catch(() => {}) })
    // the pane may not allow it; filling the pane is the fallback
    el.requestFullscreen?.().catch(() => {})
    close.current?.focus()
    // Esc leaves full screen first (the browser's own), then closes this; the frame's Esc leaves it alone (a dialog)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); onClose() } }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      dropVideo(v)
      if (document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {})
    }
  }, [src, at, onClose])
  return (
    <div ref={wrap} role="dialog" aria-modal="true" aria-label="The promo video, big" className="fixed inset-0 z-[200] flex items-center justify-center bg-void">
      <video ref={video} controls playsInline className="size-full object-contain" />
      <IconButton ref={close} icon="x" label={`Back to the ${back} (Esc)`} onPress={onClose} className="absolute top-3.5 right-4 rounded-full bg-[rgb(var(--glass-rgb)/.14)] text-text" />
    </div>
  )
}

// The film's outside services: Hermes's own secrets, connectors and providers are used as they are; otherwise a key
// pasted here switches one on; with nothing, the studio's own score and camera moves. Which MCP servers Swarm
// Studio may call is the person's grant in Hermes (Nous catalog review, point 5): the room shows the one command
// to run, and never runs it.
function MediaRow({ media, error, onKey, onAgain }: { media: Media, error?: string, onKey: (service: string, key: string | null) => Promise<void> | void, onAgain: () => void }) {
  const [open, setOpen] = useState<(typeof MEDIA_KINDS)[number] | ''>('')
  const m: MediaService | undefined = open ? media[open] : undefined
  const forget = m?.pasted && m.key ? <Button role="secondary" onPress={() => { onKey(m.key as string, null) }}>Forget key</Button> : null
  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {MEDIA_KINDS.map(k => {
          const s = media[k]
          return s && (
            <PlainButton key={k} aria-expanded={open === k} onPress={() => setOpen(o => (o === k ? '' : k))}
              className={`${PILL} items-baseline ${s.on ? 'border-solid text-text' : 'border-dashed text-muted'} ${open === k ? 'border-accent' : 'border-line'}`}>
              <b className="font-semibold">{s.label}</b><span className="text-muted">{s.by}</span>
            </PlainButton>
          )
        })}
      </div>
      {m && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          {m.on && m.via !== 'key'
            ? <><span>{MEDIA_VIA[m.via || ''] || ''}</span>{forget}</>
            : m.on
              ? <><span>{MEDIA_VIA.key}</span>{forget}</>
              : !m.key
                ? <span>{m.hint || ''}</span>
                : (
                  <>
                    {m.grant && m.allow && (
                      <div className="flex basis-full flex-col gap-1.5">
                        <span>To use Hermes's {m.keyLabel}, run this once:</span>
                        <Command cmd={m.allow} />
                        <div><Button role="secondary" onPress={onAgain}>Check again</Button></div>
                      </div>
                    )}
                    <KeyForm service={m} onKey={onKey} />
                    {m.keyUrl && <a href={m.keyUrl} target="_blank" rel="noopener" className="text-accent">Get a key</a>}
                  </>
                )}
          {error && <p role="alert" className="basis-full text-hot-text">{error}</p>}
        </div>
      )}
    </>
  )
}

function KeyForm({ service, onKey }: { service: MediaService, onKey: (service: string, key: string | null) => Promise<void> | void }) {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const key = value.trim()
    if (!key || !service.key) return
    setValue(''); setChecking(true)
    try { await onKey(service.key, key) } finally { setChecking(false) }
  }
  return (
    <form onSubmit={submit} className="flex min-w-[200px] flex-1 items-end gap-1.5">
      <div className="min-w-0 flex-1"><TextField label={`${service.keyLabel} key`} aria-label={`${service.keyLabel} key`} placeholder={`${service.keyLabel} key`} type="password" autoComplete="off" bare value={value} onChange={setValue} /></div>
      <Button role="primary" type="submit" isDisabled={checking}>{checking ? 'Checking…' : 'Connect'}</Button>
    </form>
  )
}
