// The Plan board's calls to the plugin's server (server/plans.mjs), with the page's token (window.SWARM, put in at
// serve time by server/next.mjs). The same calls web/plan.js makes.
import type { Plan } from './types'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', 'x-swarm-token': window.SWARM?.token ?? '', ...init?.headers } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError((j as { error?: string }).error || `HTTP ${r.status}`, r.status)
  return j as T
}

const url = (id: string, sub = '') => `/api/plans/${encodeURIComponent(id)}${sub ? `/${sub}` : ''}`

export const getPlan = (id: string) => api<Plan>(url(id))
export const post = (id: string, sub: string, body: unknown = {}) => api<Plan>(url(id, sub), { method: 'POST', body: JSON.stringify(body) })
// the plan as a template others remix (spec 21)
export const saveTemplate = (id: string, name?: string) => api<unknown>(url(id, 'template'), { method: 'POST', body: JSON.stringify({ name }) })
