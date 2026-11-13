// The chat's server calls: fetch with the token the plugin's server puts in the page (window.SWARM.token), the
// same header the current Studio sends (web/canvas/core.js). A story passes its own `api` instead.
import type { ChatApi } from './types'

// the server's prefix (the hosted studio's), before every path and every picture the server names
export const base = () => window.SWARM?.base || ''

export const chatApi: ChatApi = (path, init = {}) => {
  const headers = new Headers(init.headers)
  const token = window.SWARM?.token
  if (token) headers.set('x-swarm-token', token)
  return fetch(base() + path, { ...init, headers })
}

// a POST with a JSON body, answered with JSON: the error the server gave, or HTTP n, is thrown
export async function postJson<T = Record<string, unknown>>(api: ChatApi, path: string, body: unknown = {}): Promise<T> {
  const r = await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

export async function getJson<T = Record<string, unknown>>(api: ChatApi, path: string): Promise<T | null> {
  const r = await api(path).catch(() => null)
  return r?.ok ? (await r.json().catch(() => null)) as T | null : null
}
