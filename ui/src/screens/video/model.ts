// The Film studio's model (docs/ux/OBJECTS.md: **Film studio**; the classic one is web/canvas/film.js): the film of
// the open build, folded from its `video:*` events (server/server.mjs makeVideo sends them), the film's job
// (GET /api/runs/<id>/video) and its one state (engine/kindstate.mjs filmState, sent as `parts.film`). Pure: the
// screen keeps one Film and draws it; ui/test/film.test.mjs holds it to the classic room's behaviour.
import type { RunEvent } from '../app/model'

// one beat of the storyboard (engine/storyboard.mjs), as `video:story` carries it
export interface Scene { kind?: string, layer?: string, headline?: string, image?: string, seconds?: number, camera?: string, speed?: number, cue?: string }
// what the style references said (spec 26), as `video:style` carries it
export interface StyleNotes {
  from?: { what?: string }[], palette?: string[], type?: string, pacing?: string, cutRhythm?: { text?: string }, camera?: string, motion?: string, mood?: string
  music?: { tempo?: number, instruments?: string[], structure?: string }
}
// a saved cut in the build's video folder (GET /api/runs/<id>/cuts), with what it was made from when this page heard it
export interface Cut { name: string, file?: string, seconds?: number, style?: string, idea?: string }
// why a film is not there (engine/kindstate.mjs): the reason in plain words, what to do, and its code (`hermes`: Set up)
export interface Reason { code: string, message: string, action: string }
export interface FilmPart { state: 'making' | 'done' | 'failed' | 'stopped', pct?: number, stage?: string, reason?: Reason | null }
// the film's job as the server answers it (GET and POST /api/runs/<id>/video)
export interface FilmStatus { state?: 'none' | 'working' | 'done' | 'failed' | 'stopped', pct?: number, stage?: string, src?: string, tall?: string | null, square?: string | null, file?: string, message?: string }
export type Shape = 'wide' | 'tall' | 'square'

export interface Film {
  run: string | null
  busy: boolean
  pct: number
  stage: string
  story: Scene[]
  board: { title?: string, pace?: string, bpm?: number } | null
  notes: StyleNotes | null
  // the newest cut in its three shapes (wide always; tall and square when the film was made in them)
  src: string
  tall: string
  square: string
  file: string
  // why there is no film, as the page heard it; `reason` is the film's own state's, which wins
  message: string
  reason: Reason | null
  cuts: Cut[]
  pick: number
  // what the film being made was asked for, kept for its cut's label
  next: { style?: string, idea?: string } | null
  // the critic's line (spec 32): what it found by watching and listening
  review: { ok: boolean, says: string } | null
}

export const noFilm = (run: string | null = null): Film => ({
  run, busy: false, pct: 0, stage: '', story: [], board: null, notes: null, src: '', tall: '', square: '', file: '', message: '', reason: null, cuts: [], pick: -1, next: null, review: null
})

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// a saved cut's number: 'river-hours-promo-v3.mp4' → 3
export const cutNo = (name: string) => Number(name.match(/-v(\d+)\.mp4$/)?.[1] ?? 0)

// One `video:*` event of this build into the film (web/canvas/film.js videoEvent)
export function foldFilm(f: Film, e: RunEvent): Film {
  if (e.type === 'video:start') {
    return { ...f, busy: true, pct: 0, stage: 'storyboard', story: [], board: null, notes: null, src: '', tall: '', square: '', message: '', reason: null, review: null, next: { style: str(e.style), idea: str(e.prompt) || str(e.idea) } }
  }
  if (e.type === 'video:style') return { ...f, notes: (e.notes as StyleNotes) ?? null }
  if (e.type === 'video:story') {
    const music = e.music as { bpm?: number } | undefined
    return { ...f, story: Array.isArray(e.scenes) ? e.scenes as Scene[] : [], board: { title: str(e.title), pace: str(e.pace), bpm: num(music?.bpm) || undefined }, notes: (e.notes as StyleNotes | undefined) ?? f.notes }
  }
  if (e.type === 'video:progress') return { ...f, busy: true, pct: num(e.pct), stage: str(e.stage) }
  if (e.type === 'video:done') {
    // every cut is kept in the build's video folder; the newest plays, the rest are a click away
    const name = str(e.file).split(/[\\/]/).pop() || ''
    const cuts = /-promo-v\d+\.mp4$/.test(name) && !f.cuts.some(c => c.name === name) ? [...f.cuts, { name, file: str(e.file), seconds: num(e.seconds), ...(f.next || {}) }] : f.cuts
    return { ...f, busy: false, pct: 100, stage: 'done', src: str(e.src), tall: str(e.tall), square: str(e.square), file: str(e.file), message: '', reason: null, cuts, pick: cuts.length - 1, next: null }
  }
  if (e.type === 'video:review') return { ...f, review: e.state === 'done' && str(e.says) ? { ok: !!e.ok, says: str(e.says) } : null }
  if (e.type === 'video:failed') return { ...f, busy: false, stage: 'failed', message: str(e.message) }
  return f
}

// The film's job, read when the room opens or when the page heard none of a film's events (toggleVideo, toggleVideoRead)
export function withStatus(f: Film, st: FilmStatus): Film {
  return {
    ...f, busy: st.state === 'working', pct: st.pct || 0, stage: st.stage || (st.state === 'working' ? 'storyboard' : f.stage === 'storyboard' ? '' : f.stage),
    src: st.src || f.src, tall: st.tall || f.tall, square: st.square || f.square, file: st.file || f.file,
    message: st.state === 'failed' ? st.message || 'The film did not finish.' : st.state === 'working' || st.state === 'done' ? '' : f.message
  }
}

// The film's one state (web/canvas/film.js filmPart): a film being made reads as being made, and one that failed or
// could not start says why. `done` while the page thinks it is busy is not settled here: the screen reads the job.
export function withPart(f: Film, p: FilmPart | null | undefined): Film {
  if (!p) return f
  if (p.state === 'making') return f.busy ? f : { ...f, busy: true, pct: p.pct || 0, stage: p.stage || 'storyboard', message: '', reason: null }
  if (p.state === 'failed' || p.state === 'stopped') return { ...f, busy: false, stage: 'failed', message: f.message && !f.busy ? f.message : p.reason?.message || 'stopped', reason: p.state === 'failed' ? p.reason ?? null : null }
  return f
}

// The cuts made before this page was open, with the ones it heard, oldest first; the newest is picked
export function withCuts(f: Film, listed: Cut[]): Film {
  const known = new Map(f.cuts.map(c => [c.name, c]))
  const cuts = [...new Map([...listed.map(c => [c.name, c] as const), ...known]).values()].sort((a, b) => cutNo(a.name) - cutNo(b.name))
  return { ...f, cuts, pick: cuts.length - 1 }
}

// why the film on screen is not there: its state's reason, else what the page heard
export const filmWhy = (f: Film): Reason => f.reason ?? { code: '', message: f.message, action: '' }

// what the room draws: the film, its making, why it is not there, or the empty form
export type FilmShows = 'film' | 'making' | 'failed' | 'none'
export const filmShows = (f: Film): FilmShows => (f.src && !f.busy ? 'film' : f.busy ? 'making' : f.message ? 'failed' : 'none')

const STAGE: Record<string, string> = {
  storyboard: 'Writing the storyboard…', 'reading the style references': 'Reading the references…', scoring: 'Scoring the film…', rendering: 'Rendering frames in headless Chrome…',
  assembling: 'Encoding the MP4…', 'recording the voiceover': 'Kokoro is reading the voiceover…', 'mixing the sound': 'Mixing the music and the voice…'
}
export const stageSays = (f: Film) => `${STAGE[f.stage] || f.stage}${f.pct ? ` ${Math.floor(f.pct)}%` : ''}`
// once the composition is written (rendering onward), it plays live in the room
export const liveOn = (f: Film) => f.busy && /render|assembl|mixing/.test(f.stage)

// The cut that plays: the newest in the shape picked (a shape the film was not made in falls back to wide), or an
// older saved cut, which is kept wide only
export function playing(f: Film, shape: Shape): { src: string, name: string, file: string, shape: Shape, latest: boolean } {
  const cut = f.cuts[f.pick], latest = f.pick < 0 || f.pick === f.cuts.length - 1
  if (!latest && cut && f.run) return { src: `/video/${f.run}/cut/${cut.name}`, name: cut.name, file: cut.file || f.file, shape: 'wide', latest }
  const s: Shape = shape !== 'wide' && f[shape] ? shape : 'wide'
  return { src: s === 'wide' ? f.src : f[s], name: s === 'wide' ? cut?.name || 'promo.mp4' : `promo-${s}.mp4`, file: cut?.file || f.file, shape: s, latest }
}
// the shapes the newest cut was made in (one: no picker)
export const shapesOf = (f: Film): Shape[] => (['wide', 'tall', 'square'] as const).filter(s => s === 'wide' || !!f[s])

// "Saved to ~/…": the person's home folder is not spelled out
export const savedTo = (file: string) => String(file || 'video/promo.mp4').replace(/^\/(Users|home)\/[^/]+/, '~')

// The lines a film's event adds to the chat (web/canvas/film.js videoEvent's feed lines): the storyboard's beats one
// by one, the cast, the finished film, the critic's line, a failure
export function filmLines(e: RunEvent): { who: 'sys' | 'err', text: string }[] {
  const idea = str(e.prompt) || str(e.idea)
  const sys = (text: string) => [{ who: 'sys' as const, text }], err = (text: string) => [{ who: 'err' as const, text }]
  if (e.type === 'video:start') return sys(`🎬 ${str(e.model) || 'the planner'} is storyboarding a film${idea ? `: “${idea}”` : ''}`)
  if (e.type === 'video:story') {
    const cast = e.cast as { narrator?: string, second?: string } | undefined
    const scenes = Array.isArray(e.scenes) ? e.scenes as Scene[] : []
    return [
      ...scenes.map((sc, i) => ({ who: 'sys' as const, text: `scene ${i + 1} · ${sc.kind}: “${sc.headline}”` })),
      ...(cast?.narrator ? sys(`🎙 cast for the theme: ${cast.narrator}${cast.second ? ` with ${cast.second}` : ''} reading, ${str(e.music) || 'matching'} music`) : [])
    ]
  }
  if (e.type === 'video:done') return sys(`🎬 promo video ready (${Math.round(num(e.seconds))}s${e.voice ? ', with voiceover' : ''}${e.music ? ', with music' : ''}, made in ${Math.round(num(e.ms) / 1000)}s)`)
  if (e.type === 'video:clips') return sys(`🎬 ${str(e.by)} animated ${num(e.made)} stills`)
  if (e.type === 'video:note') return err(`🎬 ${str(e.message)}`)
  // the critic (spec 32) watched and listened to the finished film: one line with what it found
  if (e.type === 'video:review' && e.state === 'done' && str(e.says)) return e.ok ? sys(`🎬 checked by watching and listening: ${str(e.says)}`) : err(`🎬 checked by watching and listening: ${str(e.says)}`)
  if (e.type === 'video:review' && e.state === 'failed') return err(`🎬 the film was not checked: ${str(e.message) || 'the check failed'}`)
  if (e.type === 'video:failed') return err(`🎬 video: ${str(e.message)}`)
  return []
}

// ---------- what a film is made with (the server has the same lists, in engine/video.mjs)
export const VIDEO_STYLES: readonly (readonly [string, string])[] = [['', 'The prompt'], ['trailer', 'Movie trailer'], ['promo', 'Promo'], ['kinetic', 'Kinetic type'], ['slideshow', 'Slideshow'], ['teaser', 'Teaser'], ['story', 'Customer story'], ['calm', 'Calm film']]
// The voiceover: Kokoro, on this machine, in one of its voices; or none
export const VOICE_OPTS: readonly (readonly [string, string])[] = [['', 'Kokoro · fits the theme'], ['af_heart', 'Kokoro · Heart'], ['af_bella', 'Kokoro · Bella'], ['am_michael', 'Kokoro · Michael'], ['bf_emma', 'Kokoro · Emma (UK)'], ['bm_george', 'Kokoro · George (UK)'], ['off', 'No voice']]
export interface FilmOpts { voice: string, music: boolean, clips: boolean, style: string, idea: string, refs: { name: string }[] }
// what POST /api/runs/<id>/video takes (web/canvas/film.js makeVideo); `ask` is the chat's or a command's own idea and style
export const makeBody = (o: FilmOpts, ask: { idea?: string, style?: string } = {}) => ({
  voice: o.voice || undefined, music: o.music, template: ask.style || o.style || undefined, prompt: ask.idea || o.idea || undefined, refs: o.refs, clips: o.clips, film: 'auto'
})

// ---------- the film's outside services (GET /api/media): music (ElevenLabs), clips (Veo…), pictures
export interface MediaService { label: string, by: string, on: boolean, via?: string, pasted?: boolean, key?: string, keyLabel?: string, keyUrl?: string, hint?: string, grant?: boolean, allow?: string }
export type Media = Partial<Record<'music' | 'clips' | 'pictures', MediaService>>
export const MEDIA_KINDS = ['music', 'clips', 'pictures'] as const
export const MEDIA_VIA: Record<string, string> = { hermes: 'Hermes', 'hermes-mcp': 'Hermes connector', key: 'Your key', 'built-in': 'Built in' }
