// The server, as the Overview asks it: every request carries the token the server put in the page (window.SWARM), and
// an answer that is not ok throws with the server's own words. Which sections the person shut is kept under the same
// localStorage key as web/project.js's (`swarm.project.open`), so / and /next/ open the same way.
// The same file as Projects' (ui/src/screens/projects/api.ts, feat/port-home); both move to one shared ui/src/api.ts
// once they have merged.
import { useState } from 'react'

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) { super(message) }
}

export const raw = (path: string, opts: RequestInit = {}) =>
  fetch(path, { ...opts, headers: { ...opts.headers as Record<string, string>, 'x-swarm-token': window.SWARM?.token || '' } })

export async function api<T = Record<string, unknown>>(path: string, opts?: RequestInit): Promise<T> {
  const r = await raw(path, opts)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(String(j.error || `HTTP ${r.status}`), r.status, j)
  return j as T
}

export const post = <T = Record<string, unknown>>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export const said = (err: unknown) => String((err as ApiError)?.body?.error || (err as Error)?.message || err)

export const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(`swarm.${k}`); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k: string, v: unknown) { try { localStorage.setItem(`swarm.${k}`, JSON.stringify(v)) } catch { /* the page only */ } }
}

// a choice kept in the browser, read once and written on every change
export function useStored<T>(k: string, d: T): [T, (v: T) => void] {
  const [v, set] = useState<T>(() => store.get(k, d))
  return [v, (x: T) => { store.set(k, x); set(x) }]
}
