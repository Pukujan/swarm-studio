// The brand sheet's calls to the plugin's server (server/brand.mjs, server/studio.mjs), with the page's token
// (window.SWARM, put in by server/next.mjs). The same calls web/brand.js and web/scaffold.js make.
import type { BrandView } from './types'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', 'x-swarm-token': window.SWARM?.token ?? '', ...init?.headers } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

export interface Studio { project?: { title?: string, name?: string }, studio?: { idea?: string, kind?: string } }

const brand = (project: string, sub = '') => `/api/projects/${encodeURIComponent(project)}/brand${sub ? `/${sub}` : ''}`

// the project and its Studio: its name for the crumb, its idea and kind for the sheet
export const getStudio = (project: string) => api<Studio>(`/api/studio/${encodeURIComponent(project)}`)
// the sheet: made from the idea the first time (the options are a model call, so this is the slow one), then kept
export const openSheet = (project: string, body: { brief: string, kind: 'site' | 'app' }) => api<BrandView>(brand(project), { method: 'POST', body: JSON.stringify(body) })
// pick, edit, lock, unlock: each answers with the new sheet
export const change = (project: string, what: string, body: unknown = {}) => api<BrandView>(brand(project, what), { method: 'POST', body: JSON.stringify(body) })
