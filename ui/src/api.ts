// The plugin's own API, with the token the server put in the page (server/next.mjs). An error answer becomes a
// thrown Error with the server's message, so a screen shows it once (a toast) and keeps what it had.
const headers = (more: HeadersInit = {}) => ({ ...more, 'x-swarm-token': window.SWARM?.token || '' })

async function answer<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

export const get = <T>(path: string): Promise<T> => fetch(path, { headers: headers() }).then(r => answer<T>(r))

export const post = <T>(path: string, body: unknown = {}): Promise<T> =>
  fetch(path, { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) }).then(r => answer<T>(r))
