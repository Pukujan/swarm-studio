// Where the app build wall's data comes from: the app's own routes (server/server.mjs runApp: GET /app, /app/files,
// /app/map; POST /app/seen, /app/open, /app/tell), the run's saved events and the server's stream. Stories hand the
// wall a source of their own, so a mock-up needs no server. (The Design deck's source, screens/deck/source.ts, reads
// the same stream; the two can share one once the deck's open slices have landed.)
import { createContext } from 'react'
import type { AppMap, AppState, RunEvent } from './model'

export interface AppSource {
  state(run: string): Promise<AppState>
  // null: the run kept no plan (an app made without the advisor or a kit)
  map(run: string): Promise<AppMap | null>
  events(run: string): Promise<RunEvent[]>
  files(run: string): Promise<{ files: { path: string, size: number }[] }>
  file(run: string, path: string): Promise<{ path: string, text: string }>
  // a viewer is here: the app's server is kept (decision 0017's 2 minutes count from the last one)
  seen?(run: string): Promise<void>
  // the app, served again when it has stopped (cold: a dev server while building, else its build)
  open?(run: string): Promise<AppState>
  // a question to the crew, or to one of them about the window they are on; their answer
  tell?(run: string, text: string, who?: string, on?: string): Promise<{ answer?: string }>
  stream?(on: (e: RunEvent) => void): () => void
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

export const serverAppSource: AppSource = {
  state: run => get(`${base(run)}/app`),
  map: run => get<AppMap | null>(`${base(run)}/app/map`),
  events: run => get(`${base(run)}/events`),
  // a Windows server lists src\pages\x.tsx: one way of writing a path everywhere (it reads either)
  files: run => get<{ files: { path: string, size: number }[] }>(`${base(run)}/app/files`).then(r => ({ files: r.files.map(f => ({ ...f, path: f.path.replace(/\\/g, '/') })) })),
  file: (run, path) => get(`${base(run)}/app/files?path=${encodeURIComponent(path)}`),
  seen: run => post(`${base(run)}/app/seen`).then(() => {}),
  open: run => post(`${base(run)}/app/open`),
  tell: (run, text, who, on) => post(`${base(run)}/app/tell`, { text, ...(who ? { who, on } : {}) }),
  stream(on) {
    const es = new EventSource(`/events?k=${encodeURIComponent(token())}`)
    es.onmessage = m => { try { on(JSON.parse(m.data) as RunEvent) } catch { /* a keep-alive or a torn line */ } }
    return () => es.close()
  }
}

export const AppSourceContext = createContext<AppSource>(serverAppSource)
