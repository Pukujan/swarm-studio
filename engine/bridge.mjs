// The Hermes bridge, the server's side (docs/specs/33-hermes-bridge.md). A Hermes process with the plugin
// loaded runs a small loopback server (bridge.py) and attaches it here: POST /api/hermes/attach
// {url, token, pid, code}, again every 5 s (code: when the Python it loaded was written, engine/hermeshealth.mjs). Pictures, clips, model calls (engine/hermesllm.mjs) and MCP calls are asked of
// the newest live bridge, which does them with Hermes's own tools, so the provider keys stay in Hermes.
//
// Up to 4 bridges are kept, newest first. One silent for 45 s, or one that refuses a connection, is
// dropped, and the call moves on to the next one.

const KEEP = 4
const SILENT_MS = 45000

export function hermesBridge({ fetcher = fetch, now = () => Date.now() } = {}) {
  let bridges = []
  const live = () => (bridges = bridges.filter(b => now() - b.seen < SILENT_MS))

  function attach({ url, token, pid, code } = {}) {
    if (typeof url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url)) return { ok: false, error: 'a loopback bridge address is needed' }
    if (typeof token !== 'string' || token.length < 16) return { ok: false, error: 'a bridge token is needed' }
    bridges = [{ url, token, pid: Number(pid) || null, code: Number.isFinite(code) ? code : null, seen: now() }, ...bridges.filter(b => b.url !== url)].slice(0, KEEP)
    return { ok: true }
  }

  // {ok:false, error, absent:true} when no bridge answers; otherwise the bridge's own JSON answer.
  // `next(answer)` true: that bridge could not do it (an MCP server it has not connected), ask the next.
  async function call(path, body, timeoutMs = 300000, { next = () => false } = {}) {
    console.error('DBG call start', path, live().length, Date.now())
    let passed = null
    for (const b of live().slice()) {
      try {
        const res = await fetcher(b.url + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${b.token}` },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs + 15000)
        })
        if (res.status === 403) { drop(b); continue } // a bridge from a process that has gone and been replaced
        console.error('DBG call got headers', path, Date.now())
        const answer = await res.json()
        if (next(answer)) { passed = answer; continue }
        return answer
      } catch (err) {
        console.error('DBG call err', path, String(err?.cause?.code || err?.code || err?.message), Date.now())
        if (refused(err)) { drop(b); continue }
        return { ok: false, error: String(err?.message || err).slice(0, 200) }
      }
    }
    if (passed) return passed
    return { ok: false, absent: true, error: "Hermes isn't connected: open Hermes Desktop, or run `hermes swarm`, to use its picture and clip tools" }
  }
  // The raw answer of the newest bridge that takes the request (a model call streams through as it is),
  // or null when none does. A bridge that refuses the connection or the token is dropped.
  async function send(path, init = {}) {
    for (const b of live().slice()) {
      try {
        const res = await fetcher(b.url + path, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${b.token}` } })
        if (res.status === 403) { drop(b); continue }
        return res
      } catch (err) {
        if (init.signal?.aborted) throw err
        if (refused(err)) { drop(b); continue }
        throw err
      }
    }
    return null
  }
  const drop = b => { bridges = bridges.filter(x => x !== b) }
  const refused = err => /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|fetch failed/i.test(String(err?.cause?.code || err?.code || err?.message || ''))

  // Before a build: ask each bridge a cheap question (its model list) so one whose Hermes has just closed
  // is dropped now, not 45 s later. A bridge that is only slow to answer is kept.
  async function ping(timeoutMs = 1500) {
    await Promise.all(live().slice().map(async b => {
      try {
        const res = await fetcher(b.url + '/v1/models', { headers: { authorization: `Bearer ${b.token}` }, signal: AbortSignal.timeout(timeoutMs) })
        if (res.status === 403) drop(b)
        else b.seen = now()
        await res.body?.cancel?.()
      } catch (err) { if (refused(err)) drop(b) }
    }))
  }

  return {
    attach,
    call,
    send,
    ping,
    // for /api/state and the canvas: whether Hermes is there, never a token or an address
    status: () => ({ attached: live().length > 0, pids: live().map(b => b.pid).filter(Boolean), codes: live().map(b => b.code) })
  }
}

// imagegen.py's old command line (--provider --model --aspect --ref --edit --crop, then the prompt) as the
// bridge's /image body. The provider and the model are Hermes's own choice now, so those two are dropped.
export function imageBody(args) {
  const out = { refs: [], edit: false, aspect: 'landscape', crop: '', prompt: '' }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--ref') out.refs.push(String(args[++i] || ''))
    else if (a === '--edit') out.edit = true
    else if (a === '--aspect') out.aspect = String(args[++i] || 'landscape')
    else if (a === '--crop') out.crop = String(args[++i] || '')
    else if (a === '--provider' || a === '--model') i++
    else out.prompt = String(a)
  }
  out.refs = out.refs.filter(Boolean)
  return out
}

// videogen.py's old command line (--provider --model --image --seconds --aspect --out, then the prompt)
export function videoBody(args) {
  const out = { image: '', seconds: 4, aspect: '16:9', out: '', prompt: '' }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--image') out.image = String(args[++i] || '')
    else if (a === '--seconds') out.seconds = Number(args[++i]) || 4
    else if (a === '--aspect') out.aspect = String(args[++i] || '16:9')
    else if (a === '--out') out.out = String(args[++i] || '')
    else if (a === '--provider' || a === '--model') i++
    else out.prompt = String(a)
  }
  return out
}
