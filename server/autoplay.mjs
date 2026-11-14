// Autoplay (the Game room's switch): an AI player plays a run's game in a headless browser
// (engine/aiplayer.mjs) and its screen streams to the room.
//
//   GET  /api/runs/<id>/autoplay          { on, live, say, from, line, jev }
//   POST /api/runs/<id>/autoplay          { start: true } or { stop: true } → the same
//   GET  /api/runs/<id>/autoplay/stream   the player's screen, as MJPEG (multipart/x-mixed-replace)
//
// One player at a time: each is a whole browser. Every new decision goes out as an `autoplay`
// event ({ run, on, live, say, from }); `live` turns true with the first picture, and the last
// event of a play has on: false and one line saying what the player did.
//
//   urlOf(id)   the address the run's game is served on now, or null: the player never starts a game
//   key()       an OpenRouter key for Jev, or '' for scripted moves only
//   load()      the player's module, read on the first play
//   idle        a play nobody watches (no open stream) for this long stops by itself: the room was left or closed
const RUN_ID = /^[\w-]{1,64}$/
const BOUNDARY = 'autoplayframe'

export function autoplayRoutes({ urlOf, broadcast = () => {}, key = () => '', seconds = 300, idle = 20000, load = () => import('../engine/aiplayer.mjs') }) {
  const plays = new Map()
  const view = id => {
    const p = plays.get(id)
    return p ? { on: !p.done, live: !p.done && !!p.frame, say: p.done ? '' : p.say, from: p.from, line: p.report?.line || '', jev: p.jev } : { on: false, live: false, say: '', from: '', line: '', jev: !!key() }
  }
  const tell = (id, p, more = {}) => broadcast({ type: 'autoplay', t: Date.now(), run: id, on: !p.done, live: !p.done && !!p.frame, say: p.say, from: p.from, ...more })
  const writeFrame = (res, buf) => {
    res.write(`--${BOUNDARY}\r\ncontent-type: image/jpeg\r\ncontent-length: ${buf.length}\r\n\r\n`)
    res.write(buf)
    res.write('\r\n')
  }
  const stop = id => { plays.get(id)?.controller.abort() }
  const stopAll = () => { for (const id of plays.keys()) stop(id) }

  async function start(id) {
    if (plays.get(id) && !plays.get(id).done) return
    const url = await urlOf(id)
    if (!url) throw new Error('the game is not running')
    for (const [other, p] of plays) if (!p.done && other !== id) stop(other)
    // (a second press that arrived while the address was read)
    if (plays.get(id) && !plays.get(id).done) return
    const p = { controller: new AbortController(), clients: new Set(), frame: null, say: 'starting', from: '', done: false, jev: !!key(), report: null }
    plays.set(id, p)
    tell(id, p)
    let alone = Date.now()
    const watch = setInterval(() => { if (p.clients.size) alone = Date.now(); else if (Date.now() - alone >= idle) p.controller.abort() }, Math.min(5000, Math.max(10, idle / 4)))
    watch.unref?.()
    const run = async () => {
      const { aiPlay, jevDecider } = await load()
      return aiPlay(url, {
        seconds, decide: jevDecider({ key: key() }), signal: p.controller.signal,
        onFrame: buf => { const first = !p.frame; p.frame = buf; for (const res of p.clients) writeFrame(res, buf); if (first) tell(id, p) },
        onSay: (say, from) => { Object.assign(p, { say, from }); tell(id, p) },
      })
    }
    run().then(report => { p.report = report }, err => { p.report = { line: `The AI player did not play: ${String(err.message || err).slice(0, 200)}` } }).finally(() => {
      p.done = true
      clearInterval(watch)
      // the stream ends as a multipart body does, so the room's <img> sees an end and not a broken load
      for (const res of p.clients) res.end(`--${BOUNDARY}--\r\n`)
      p.clients.clear()
      p.frame = null
      // a play the person stopped says nothing more; one that ended by itself says what it did
      tell(id, p, { line: p.controller.signal.aborted ? '' : p.report?.line || '' })
    })
  }

  function stream(id, req, res) {
    const p = plays.get(id)
    if (!p || p.done) return void res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no autoplay running' }))
    res.writeHead(200, { 'content-type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`, 'cache-control': 'no-store', connection: 'close' })
    res.flushHeaders()
    p.clients.add(res)
    if (p.frame) writeFrame(res, p.frame)
    req.on('close', () => p.clients.delete(res))
  }

  // true when the request was one of these routes (and is answered, now or soon)
  function route(req, res, url) {
    const m = url.pathname.match(/^\/api\/runs\/([^/]+)\/autoplay(\/stream)?$/)
    if (!m || !RUN_ID.test(m[1])) return false
    const id = m[1]
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (m[2]) { if (req.method !== 'GET') reply(405, { error: 'GET only' }); else stream(id, req, res); return true }
    if (req.method === 'GET') { reply(200, view(id)); return true }
    if (req.method !== 'POST') { reply(405, { error: 'GET or POST' }); return true }
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      Promise.resolve(input?.stop ? stop(id) : start(id)).then(() => reply(200, view(id)), err => reply(400, { error: String(err.message || err).slice(0, 300) }))
    })
    return true
  }
  return Object.assign(route, { view, stop, stopAll })
}
