// Where the Film studio's data comes from: the film's own routes (server/server.mjs: GET and POST
// /api/runs/<id>/video, POST /video/ref, GET /cuts, POST /reveal?what=video, GET /state for its one state), the
// outside services (GET /api/media, POST /api/media/key), the run's saved events and the server's stream. The same
// routes the classic room calls (web/canvas/film.js); nothing is asked of HyperFrames from here
// (docs/engines/video.md: Swarm's server drives it). Stories hand the room a source of their own.
import { createContext } from 'react'
import { eventStream } from '@studio/headerstream'
import type { RunEvent } from '../app/model'
import type { Cut, FilmPart, FilmStatus, Media } from './model'

export interface FilmSource {
  events(run: string): Promise<RunEvent[]>
  status(run: string): Promise<FilmStatus>
  // the film's one state, or null when no film was ever asked for
  part(run: string): Promise<FilmPart | null>
  cuts(run: string): Promise<Cut[]>
  // make the film (or a new cut): the job, or the server's reason it could not start
  make(run: string, body: object): Promise<FilmStatus>
  // a style reference (an image, a video or a sound), kept with the build
  ref(run: string, file: File): Promise<{ name?: string }>
  // show the film's file in the file manager of the machine the Studio runs on
  reveal(run: string): Promise<void>
  media(): Promise<Media | null>
  // a pasted key switches a service on; null forgets it
  mediaKey(service: string, key: string | null): Promise<Media>
  stream?(on: (e: RunEvent) => void): () => void
}

const token = () => window.SWARM?.token ?? ''
const at = (path: string) => (window.SWARM?.base || '') + path
const base = (run: string) => `/api/runs/${encodeURIComponent(run)}`
async function get<T>(path: string): Promise<T> {
  const r = await fetch(at(path), { headers: { 'x-swarm-token': token() } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}
async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(at(path), { method: 'POST', headers: { 'x-swarm-token': token(), 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

export const serverFilmSource: FilmSource = {
  events: run => get(`${base(run)}/events`),
  status: run => get(`${base(run)}/video`),
  part: run => get<{ parts?: { film?: FilmPart | null } }>(`${base(run)}/state`).then(j => j.parts?.film ?? null),
  cuts: run => get<{ cuts?: Cut[] }>(`${base(run)}/cuts`).then(j => j.cuts ?? []),
  make: (run, body) => post(`${base(run)}/video`, body),
  async ref(run, file) {
    const r = await fetch(at(`${base(run)}/video/ref?name=${encodeURIComponent(file.name)}`), { method: 'POST', headers: { 'x-swarm-token': token() }, body: file })
    return r.json() as Promise<{ name?: string }>
  },
  reveal: run => fetch(at(`${base(run)}/reveal?what=video`), { method: 'POST', headers: { 'x-swarm-token': token() } }).then(() => {}),
  media: () => get<Media>('/api/media').catch(() => null),
  mediaKey: (service, key) => post('/api/media/key', { service, key }),
  stream(on) {
    // the token in its header, never in the address (web/headerstream.js)
    const es = eventStream(at('/events'), { token: token(), onMessage: m => { try { on(JSON.parse(m.data) as RunEvent) } catch { /* a torn line */ } } })
    return () => es.close()
  }
}

export const FilmSourceContext = createContext<FilmSource>(serverFilmSource)
