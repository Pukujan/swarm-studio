// Where the Studio's data comes from: the plugin's server, with the token the page was given (window.SWARM.token,
// server/next.mjs), the same way the current Studio asks (web/canvas/core.js api()). A story gives its own, so the
// screen's mock-ups need no server.
import { createContext, useContext, type ReactNode } from 'react'

export type Fetch = (path: string, init?: RequestInit) => Promise<Response>

declare global { interface Window { SWARM?: { token?: string, base?: string } } }

export const serverFetch: Fetch = (path, init = {}) =>
  fetch((window.SWARM?.base || '') + path, { ...init, headers: { ...init.headers, 'x-swarm-token': window.SWARM?.token || '' } })

const SourceContext = createContext<Fetch>(serverFetch)
export const SourceProvider = ({ fetch, children }: { fetch: Fetch, children: ReactNode }) => <SourceContext value={fetch}>{children}</SourceContext>
export const useFetch = () => useContext(SourceContext)

// a JSON answer, or the server's error as an Error
export async function json<T = unknown>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}
