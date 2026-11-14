// The server for the sheets' stories: `fetch` answers from fixtures.ts, with a story's own answers on top.
// HOLD never answers, for a row that is still waiting.
import { ROUTES } from './fixtures'

export const HOLD = Symbol('hold')

export function stubApi(over: Record<string, unknown> = {}) {
  const routes = { ...ROUTES, ...over }
  window.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input), location.href)
    const v = routes[`${init?.method || 'GET'} ${url.pathname}`]
    if (v === HOLD) return new Promise<Response>(() => {})
    return v === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
  }
}
