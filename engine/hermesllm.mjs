// Model calls through Hermes (Nous catalog review, point 2; docs/specs/33-hermes-bridge.md).
//
// The studio holds no provider key. Its planner, builders and reviewer, and the app engine (dyad), call an
// OpenAI-compatible endpoint on the studio's own loopback port, /llm/v1, with a key that is made fresh for
// each server process and opens only that endpoint. Each call is forwarded to the newest live Hermes bridge
// (bridge.py), which answers it with Hermes's own ctx.llm: Hermes picks the provider, the model and the key.
//
// `model` names the role (planner, worker, reviewer), with a model picked in the studio after a colon
// ("worker:cb/deepseek-v4.1-flash"); Hermes uses the pick only when its operator allows model overrides.
//
// With no bridge attached, a call waits a short grace (a Hermes restarting attaches again within seconds) and
// then fails at once with the reason and what to do (engine/hermeshealth.mjs): Hermes closed, or running a
// copy of the plugin from before an update. `onGone` hears it, so a build stops with that reason instead
// of waiting out its own timeout. Builds are refused before they start when Hermes is not there
// (server.mjs), so the grace only matters when Hermes goes away mid-build.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { HERMES_SAYS } from './hermeshealth.mjs'

export const WAITING = 'Waiting for Hermes: open Hermes, or run `hermes swarm`, to continue'
export const ROLE_MODELS = ['planner', 'worker', 'reviewer']
const PATHS = { 'POST /llm/v1/chat/completions': '/v1/chat/completions', 'GET /llm/v1/models': '/v1/models' }

export function hermesLlm({ bridge, port, broadcast = () => {}, token = randomBytes(24).toString('base64url'), defaultTimeoutMs = 600000, pollMs = 1000, graceMs = 20000, health = null, onGone = () => {} } = {}) {
  const baseUrl = () => `http://127.0.0.1:${port()}/llm/v1`
  let waiting = 0

  const ok = req => {
    if (req.headers.origin) return false // never a web page
    const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
    const want = Buffer.from(token)
    return given.length === want.length && timingSafeEqual(given, want)
  }

  // true when the request was ours (handled), false when the path is not /llm/v1/…
  function handle(req, res) {
    const path = PATHS[`${req.method} ${new URL(req.url, 'http://127.0.0.1').pathname}`]
    if (!path && !new URL(req.url, 'http://127.0.0.1').pathname.startsWith('/llm/')) return false
    const fail = (code, message) => { if (!res.headersSent) res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message } })) }
    if (!ok(req)) { fail(401, 'a Swarm Studio model key is needed'); return true }
    if (!path) { fail(404, 'no such model route'); return true }
    const chunks = []
    let size = 0
    req.on('data', c => { size += c.length; if (size > 48 << 20) req.destroy(); else chunks.push(c) })
    req.on('end', () => forward(req, res, path, Buffer.concat(chunks)).catch(err => fail(502, String(err?.message || err).slice(0, 300))))
    return true
  }

  async function forward(req, res, path, body) {
    const timeoutMs = Math.min(1800000, Number(req.headers['x-swarm-timeout']) || defaultTimeoutMs)
    const gone = new AbortController()
    res.on('close', () => { if (!res.writableFinished) gone.abort() })
    const until = Date.now() + Math.min(timeoutMs, graceMs)
    let told = false
    for (;;) {
      if (gone.signal.aborted) return
      const answer = bridge.status().attached
        ? await bridge.send(path, {
          method: req.method,
          headers: { 'content-type': 'application/json', 'x-swarm-timeout': String(timeoutMs) },
          body: req.method === 'POST' ? body : undefined,
          signal: AbortSignal.any([gone.signal, AbortSignal.timeout(timeoutMs + 15000)])
        })
        : null
      if (answer) {
        if (told && --waiting === 0) broadcast({ type: 'hermes:back' })
        res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') || 'application/json' })
        for await (const chunk of answer.body || []) res.write(chunk)
        res.end()
        return
      }
      if (Date.now() > until) {
        if (told && --waiting === 0) broadcast({ type: 'hermes:back', gone: true })
        const h = (await health?.now().catch(() => null)) || { code: 'closed', ...HERMES_SAYS.closed }
        const why = { code: `hermes_${h.code}`, message: h.message, action: h.action }
        try { onGone(why) } catch {}
        res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { ...why, message: `${why.message} ${why.action}`.trim(), said: why.message, type: 'hermes_unavailable' } }))
        return
      }
      if (!told) { told = true; if (waiting++ === 0) broadcast({ type: 'hermes:waiting', message: WAITING }) }
      await new Promise(r => setTimeout(r, pollMs))
    }
  }

  return {
    handle,
    // the provider a role uses: this endpoint and its key (never a provider's key)
    provider: () => ({ baseUrl: baseUrl(), apiKey: token, hermes: true }),
    waiting: () => waiting > 0
  }
}

// The model string a role sends: the role, and the studio's pick after a colon when there is one.
export const roleModel = (role, pick) => (pick ? `${role}:${pick}` : role)
