// Publish, Post to Feed and Export: the calls the current deck makes (web/canvas/publish.js, design.js exportRunNow),
// with the page's token (window.SWARM), and copying a link where the Clipboard API is refused.
import type { Host } from './model'

export class ApiError extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { headers: { 'x-swarm-token': window.SWARM?.token ?? '', 'content-type': 'application/json' } }
  if (body !== undefined) { init.method = 'POST'; init.body = JSON.stringify(body) }
  const r = await fetch(path, init).catch(() => null)
  const j = await r?.json().catch(() => ({})) as T & { error?: string } | undefined
  if (!r?.ok) throw new ApiError(shortReason(j?.error))
  return j as T
}

// one short reason, never a stack or a wall of text
export function shortReason(m: unknown): string {
  const t = String(m || 'the studio server is not answering').split('\n')[0].replace(/^Error:\s*/, '')
  return t.length > 90 ? `${t.slice(0, 88).replace(/\s+\S*$/, '')}…` : t
}

// Name plus three words at most; never an account name or email (docs/ux/RULES.md)
export const HOSTS: Record<Host, { label: string, how: string, off?: string }> = {
  github: { label: 'GitHub Pages', how: 'public link', off: 'run gh auth login' },
  vercel: { label: 'Vercel', how: 'public link' },
  cloudflare: { label: 'Cloudflare', how: 'public link' },
  local: { label: 'This computer', how: 'only you' }
}

// each host's steps, in the order the server names them (publish:stage)
export const STAGES: Partial<Record<Host, Record<string, string>>> = {
  github: { export: 'Exporting the pages', repo: 'Making the GitHub repo', push: 'Pushing the site', pages: 'Turning on GitHub Pages', building: 'GitHub is building it' },
  vercel: { export: 'Exporting the pages', project: 'Setting up the Vercel project', upload: 'Uploading the files', building: 'Vercel is deploying it' },
  cloudflare: { export: 'Exporting the pages', project: 'Setting up the Pages project', upload: 'Uploading the files', building: 'Cloudflare is going live' }
}

// GET /api/publish: who is signed in where (GitHub through gh; the others by a token the person connected)
export interface Hosts {
  github?: string | null
  vercel?: { user?: string, env?: boolean } | null
  cloudflare?: { user?: string, env?: boolean } | null
  providers?: Partial<Record<Host, { tokenUrl?: string }>>
}
export const getHosts = () => call<Hosts>('/api/publish')
export const connectHost = (provider: Host, token: string | null) => call<{ connected: { user: string } | null }>('/api/connect', token ? { provider, token } : { provider })

const runPath = (run: string, sub: string) => `/api/runs/${encodeURIComponent(run)}/${sub}`
type Sections = { key: string, html: string }[]
// the result arrives as publish:* events on the stream (and in the saved build)
export const publish = (run: string, target: Host, sections: Sections) => call<unknown>(runPath(run, 'publish'), { target, sections })
export const exportRun = (run: string, sections: Sections) => call<{ pages: number, sections: number, dir: string, zip?: string }>(runPath(run, 'export'), { sections })
// the export's zip, a download (a link, so it carries the token the way /events does)
export const zipUrl = (run: string) => `${runPath(run, 'export.zip')}?k=${encodeURIComponent(window.SWARM?.token ?? '')}`

// Post to Feed: public or unlisted; not linked yet, it answers `connect` and Connect Hermes starts
export interface Posted { ok: boolean, url?: string, unlisted?: boolean, message?: string, connect?: boolean }
// (its answer is read whatever the status: a refusal says why, or that Hermes is not connected yet)
export const postToFeed = (run: string, unlisted: boolean): Promise<Posted> =>
  fetch(runPath(run, 'feed'), { method: 'POST', headers: { 'x-swarm-token': window.SWARM?.token ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ unlisted }) })
    .then(r => r.json() as Promise<Posted>).catch(() => ({ ok: false }))
export const feedConnect = () => call<{ connected?: boolean, code?: string, url?: string }>('/api/feed/connect', {})

// Copy that works inside Hermes's sandboxed frame too, where the Clipboard API is refused: a hidden textarea and
// execCommand first (while the click still counts), then the async API. Returns whether it copied.
export async function copyText(text: string): Promise<boolean> {
  let ok = false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'
  document.body.append(ta)
  ta.select()
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  if (ok || !navigator.clipboard?.writeText) return ok
  return navigator.clipboard.writeText(text).then(() => true, () => false)
}

export const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')
