// Where the Game room's data comes from: the same routes the classic room calls (web/canvas/rooms.js, autoplay.js).
// The build: GET /app, POST /app (go on, a change, the next slice), /app/stop, /app/open, /app/seen, /app/tell; the
// art plan: GET /assets; the Map: GET /map; the game's one state: GET /state; Autoplay: /autoplay and its stream.
// Stories hand the room a source of their own, so a mock-up needs no server.
import { createContext } from 'react'
import { download, eventStream, frameStream } from '@studio/headerstream'
import type { RunEvent } from '../app/model'
import type { GameMap, GamePart, GameState, SheetCell } from './model'

// what the crew answers (server/server.mjs tellBuilder): words, the newest clip and pictures, or a change written
// out for the builder that waits for a yes
export interface TellAnswer { answer?: string, queued?: boolean, media?: { clip?: string, pics?: { src: string, name?: string }[] } | null, proposal?: { change: string, now?: boolean } | null }
// the AI player, as the server sees it (server/autoplay.mjs view)
export interface AutoView { on?: boolean, live?: boolean, say?: string, line?: string }

export interface GameSource {
  state(run: string): Promise<GameState>
  assets(run: string): Promise<{ sheet?: SheetCell[] }>
  map(run: string): Promise<GameMap | null>
  part(run: string): Promise<GamePart | null>
  events(run: string): Promise<RunEvent[]>
  files(run: string): Promise<{ files: { path: string, size: number }[] }>
  file(run: string, path: string): Promise<{ path: string, text: string }>
  // a viewer is here: the game's server is kept; the answer says whether it still runs
  seen?(run: string): Promise<{ url?: string | null }>
  // start the game's server again; no address yet means it is still starting
  open?(run: string): Promise<{ url?: string | null }>
  tell?(run: string, body: { text?: string, who?: string, on?: string, confirm?: string, now?: boolean }): Promise<TellAnswer>
  // POST /app: build again or go on (no ask), one more change (ask), the next slice (note), the crew at the play
  // test's error (fix), or shapes drawn in code when the image model is out (art: false)
  build?(run: string, body: { ask?: string, sections?: { key: string, html: string }[], note?: string, fix?: boolean, art?: boolean }): Promise<GameState>
  stop?(run: string): Promise<unknown>
  stream?(on: (e: RunEvent) => void): () => void
  // Autoplay: whether this server has a player and one plays (null: it has none), the switch, and its screen
  autoplay?: {
    get(run: string): Promise<AutoView | null>
    set(run: string, body: { start?: boolean, stop?: boolean }): Promise<AutoView>
    frames(run: string, onFrame: (b: Blob) => void, onEnd: () => void): { close: () => void }
  }
  // the same game as an engine project, saved as a zip
  port?(run: string, target: string): Promise<void>
}

const token = () => window.SWARM?.token ?? ''
const base = (run: string) => `/api/runs/${encodeURIComponent(run)}`
async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { 'x-swarm-token': token() } })
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
  return r.json() as Promise<T>
}
async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'x-swarm-token': token(), 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

export const serverGameSource: GameSource = {
  state: run => get(`${base(run)}/app`),
  assets: run => get(`${base(run)}/assets`),
  map: run => get<{ map: GameMap | null }>(`${base(run)}/map`).then(r => r.map),
  part: run => get<{ parts?: { game?: GamePart, app?: GamePart } | null }>(`${base(run)}/state`).then(r => r.parts?.game || r.parts?.app || null),
  events: run => get(`${base(run)}/events`),
  files: run => get<{ files: { path: string, size: number }[] }>(`${base(run)}/app/files`).then(r => ({ files: r.files.map(f => ({ ...f, path: f.path.replace(/\\/g, '/') })) })),
  file: (run, path) => get(`${base(run)}/app/files?path=${encodeURIComponent(path)}`),
  seen: run => post(`${base(run)}/app/seen`),
  open: run => post(`${base(run)}/app/open`),
  tell: (run, body) => post(`${base(run)}/app/tell`, body),
  build: (run, body) => post(`${base(run)}/app`, { ask: '', sections: [], ...body }),
  stop: run => post(`${base(run)}/app/stop`),
  stream(on) {
    // the token in its header, never in the address (web/headerstream.js)
    const es = eventStream('/events', { token: token(), onMessage: m => { try { on(JSON.parse(m.data) as RunEvent) } catch { /* a torn line */ } } })
    return () => es.close()
  },
  autoplay: {
    // a server with no player answers 404: the switch is not offered
    get: run => get<AutoView>(`${base(run)}/autoplay`).catch(() => null),
    set: (run, body) => post(`${base(run)}/autoplay`, body),
    frames: (run, onFrame, onEnd) => frameStream(`${base(run)}/autoplay/stream`, { token: token(), onFrame, onEnd })
  },
  // saved with the token in its header, never ?k= in the link
  port: (run, target) => download(`${location.origin}${base(run)}/port/${encodeURIComponent(target)}.zip`, { token: token(), name: `${target}.zip` })
}

export const GameSourceContext = createContext<GameSource>(serverGameSource)
