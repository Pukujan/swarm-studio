// Routes for guided game making (engine/workshop.mjs): a workshop holds a game spec being
// walked one step at a time, each step's options, the pictures painted for them and the picks.
//
//   POST /api/workshops { spec }                      -> a new workshop
//   GET  /api/workshops                               -> the unfinished workshops, newest first
//   GET  /api/workshops/:id                           -> the workshop
//   POST /api/workshops/:id/options { step }          -> asks the planner for the step's options,
//                                                        then paints their pictures in the background
//   POST /api/workshops/:id/paint { step, id }        -> paints one option's picture again
//   POST /api/workshops/:id/sprite { id }             -> a sprite sheet from a hero design
//   POST /api/workshops/:id/choose { step, pick }     -> writes the pick into the spec
//   POST /api/workshops/:id/voice { text, voice }     -> one spoken line (cached)
//   POST /api/workshops/:id/build                     -> builds the game from the walked spec
//   GET  /workshops/<id>/<file>                       -> a picture or a voice line, by name pattern only
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname } from 'node:path'
import { workshopStore, planOptions, paintPrompt, spritePrompt, applyPick, shippedArt, workshopSpec, STEP_IDS, PAINTS, WS_ID } from '../engine/workshop.mjs'

const TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp3: 'audio/mpeg' }

// paint({ prompt, aspect, refs }) -> { ok, path, error }; planner() -> { provider, model };
// speak(voiceKey, text, out) -> writes an mp3; build(spec, copy) -> { run }
export function workshopRoutes({ dataDir, paint, planner, speak, voices = {}, build }) {
  const store = workshopStore(join(dataDir, 'workshops'))
  const files = id => store.files(id)
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 2e5) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
  // read, change, save with nothing awaited in between, so a landing picture is never lost
  const step = (id, fn) => { const ws = store.get(id); const out = fn(ws); store.save(ws); return out }
  const view = ws => ({ ...ws, voices: Object.entries(voices).map(([key, v]) => ({ key, about: v.about || key })) })

  // pictures paint two at a time per workshop; each lands in its option as it finishes
  const queues = new Map()
  function queue(id, jobs) {
    const q = queues.get(id) || { jobs: [], busy: 0 }
    queues.set(id, q)
    q.jobs.push(...jobs)
    const next = () => {
      while (q.busy < 2 && q.jobs.length) {
        const job = q.jobs.shift()
        q.busy++
        run(id, job).finally(() => { q.busy--; next() })
      }
    }
    setImmediate(next)
  }
  async function run(id, job) {
    const r = await paint(job).catch(err => ({ ok: false, error: String(err?.message || err) }))
    step(id, ws => {
      const o = (ws.options[job.step] || []).find(x => x.id === job.id)
      if (!o) return
      const slot = job.sprite ? (o.sprite ||= {}) : o
      if (r?.ok && r.path && existsSync(r.path)) {
        const file = `${job.id}${job.sprite ? '-sheet' : ''}-${Date.now().toString(36)}${extname(r.path).toLowerCase() || '.png'}`
        mkdirSync(files(id), { recursive: true })
        copyFileSync(r.path, join(files(id), file))
        Object.assign(slot, { state: 'done', file, src: `/workshops/${id}/${file}`, error: null })
      } else Object.assign(slot, { state: 'failed', error: String(r?.error || 'no picture').slice(0, 200) })
    })
  }
  const paintJob = (ws, stepId, o) => ({ step: stepId, id: o.id, ...paintPrompt(stepId, o, ws.spec, ws.picks), quality: 'medium' })

  function serve(req, res, url) {
    const m = url.pathname.match(/^\/workshops\/(w-[a-z0-9]{8,20})\/([a-z0-9-]{1,80}\.(png|webp|jpe?g|mp3))$/)
    if (!m) return false
    const f = join(files(m[1]), m[2])
    if (!existsSync(f)) { res.writeHead(404).end('not found'); return true }
    res.writeHead(200, { 'content-type': TYPES[m[3]], 'cache-control': 'max-age=31536000, immutable' })
    res.end(readFileSync(f))
    return true
  }

  const act = {
    async options(ws, input) {
      const s = String(input.step || '')
      if (!STEP_IDS.includes(s)) throw Object.assign(new Error('no such step'), { status: 404 })
      const p = planner()
      const list = await planOptions({ provider: p.provider, model: p.model, step: s, ws, signal: AbortSignal.timeout(120000) })
      const painted = PAINTS[s] && paint ? list.map(o => ({ ...o, state: 'painting' })) : list
      const fresh = step(ws.id, w => { w.options[s] = painted; w.step = s; return w })
      if (PAINTS[s] && paint) queue(ws.id, painted.map(o => paintJob(fresh, s, o)))
      return fresh
    },
    paint(ws, input) {
      const s = String(input.step || ''), o = (ws.options[s] || []).find(x => x.id === input.id)
      if (!o || !PAINTS[s]) throw Object.assign(new Error('no such option'), { status: 404 })
      if (o.state === 'painting') return ws
      const fresh = step(ws.id, w => { w.options[s].find(x => x.id === o.id).state = 'painting'; return w })
      queue(ws.id, [paintJob(fresh, s, o)])
      return fresh
    },
    sprite(ws, input) {
      const o = (ws.options.heroes || []).find(x => x.id === input.id)
      if (!o?.file) throw Object.assign(new Error('paint the hero first'), { status: 409 })
      if (o.sprite?.state === 'painting') return ws
      const fresh = step(ws.id, w => { w.options.heroes.find(x => x.id === o.id).sprite = { state: 'painting' }; return w })
      queue(ws.id, [{ step: 'heroes', id: o.id, sprite: true, prompt: spritePrompt(o, ws.spec), aspect: 'landscape', refs: [join(files(ws.id), o.file)], quality: 'medium' }])
      return fresh
    },
    choose(ws, input) { return step(ws.id, w => applyPick(w, String(input.step || ''), input.pick || {})) },
    async voice(ws, input) {
      const key = voices[input.voice] ? input.voice : Object.keys(voices)[0]
      const text = String(input.text || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      if (!key || !text) throw Object.assign(new Error('no voice or no line'), { status: 400 })
      const file = `voice-${createHash('sha1').update(`${key}\n${text}`).digest('hex').slice(0, 16)}.mp3`
      const out = join(files(ws.id), file)
      if (!existsSync(out)) await speak(voices[key], text, out)
      return { ...ws, voiceSrc: `/workshops/${ws.id}/${file}` }
    },
    async build(ws) {
      const copy = Object.fromEntries(shippedArt(ws).filter(a => existsSync(join(files(ws.id), a.file))).map(a => [`public/art/${a.as}`, join(files(ws.id), a.file)]))
      const out = await build(workshopSpec(ws), copy)
      return step(ws.id, w => { w.run = out.run; return w })
    }
  }

  return function handle(req, res, url) {
    if (serve(req, res, url)) return true
    if (url.pathname === '/api/workshops') {
      if (req.method === 'GET') { json(res, 200, { workshops: store.list().filter(w => !w.run).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 20) }); return true }
      if (req.method !== 'POST') { json(res, 405, { error: 'GET or POST' }); return true }
      body(req).then(input => {
        const spec = input.spec && typeof input.spec === 'object' ? input.spec : null
        if (!spec?.title) return json(res, 400, { error: 'no game spec' })
        json(res, 200, view(store.create(spec)))
      })
      return true
    }
    const m = url.pathname.match(/^\/api\/workshops\/([^/]+)(?:\/([a-z]+))?$/)
    if (!m) return false
    const [, id, sub = ''] = m
    const ws = WS_ID.test(id) && store.get(id)
    if (!ws) { json(res, 404, { error: 'no such workshop' }); return true }
    if (req.method === 'GET' && !sub) { json(res, 200, view(ws)); return true }
    if (req.method !== 'POST' || !act[sub]) { json(res, 404, { error: 'no such action' }); return true }
    body(req).then(async input => {
      try {
        if (['options', 'paint', 'sprite'].includes(sub) && PAINTS[input.step || 'heroes'] && !paint) throw Object.assign(new Error('sign in an image model first'), { status: 503 })
        json(res, 200, view(await act[sub](ws, input)))
      } catch (err) { json(res, err.status || 400, { error: String(err.message || err) }) }
    })
    return true
  }
}
