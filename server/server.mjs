#!/usr/bin/env node
// Swarm Studio local server: serves the canvas, starts runs, and streams every
// engine event to the canvas over Server-Sent Events. Binds to 127.0.0.1 only.
//
//   node server/server.mjs [--port 4319]
//   env: SWARM_API_KEY / SWARM_BASE_URL (or HERMES_CUSTOM_INFERHUB_API_KEY),
//        SWARM_PLANNER_MODEL, SWARM_WORKER_MODEL, SWARM_AGENTS

import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSwarm } from '../engine/run.mjs'
import { writeTours } from '../engine/tours.mjs'
import { reviewPage, fixSection } from '../engine/review.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webDir = join(root, 'web')
const runsDir = process.env.SWARM_RUNS_DIR || join(root, 'runs')
const dataDir = process.env.SWARM_DATA_DIR || root
const argPort = process.argv.indexOf('--port')
const port = Number(argPort >= 0 ? process.argv[argPort + 1] : process.env.SWARM_PORT || 4319)

// Endpoint and model per role. Hermes resolves them from its own model slots and
// sends them with each run (see launcher.py); the environment gives the defaults
// that the canvas's own Build button uses before the first such run. Keys stay in
// memory: they are never written to a run's files or sent back out.
const DEFAULT_BASE = 'https://api.inferhub.dev/v1'
const DEFAULT_MODEL = 'cb/deepseek-v4.1-flash'
const envRole = (role, fallback = DEFAULT_MODEL) => ({
  baseUrl: process.env[`SWARM_${role}_BASE_URL`] || process.env.SWARM_BASE_URL || DEFAULT_BASE,
  apiKey: process.env[`SWARM_${role}_API_KEY`] || process.env.SWARM_API_KEY || process.env.HERMES_CUSTOM_INFERHUB_API_KEY || '',
  model: process.env[`SWARM_${role}_MODEL`] || fallback
})
// the reviewer follows Hermes's vision model; it has no default of its own
let models = { planner: envRole('PLANNER'), worker: envRole('WORKER'), reviewer: envRole('REVIEWER', '') }
const ROLES = ['planner', 'worker', 'reviewer']

function setModels(given) {
  const next = { ...models }
  for (const role of ROLES) {
    const m = given?.[role]
    if (!m || typeof m !== 'object') continue
    const baseUrl = String(m.base_url || '').replace(/\/$/, '')
    if (!/^https?:\/\//.test(baseUrl) || !m.api_key || !m.model) continue
    next[role] = { baseUrl, apiKey: String(m.api_key), model: String(m.model) }
  }
  models = next
}
const provider = role => ({ baseUrl: models[role].baseUrl.replace(/\/$/, ''), apiKey: models[role].apiKey })

// Picks made in the canvas's Models menu. Model names only (each role keeps the
// endpoint and key Hermes gave it), kept in the plugin's data dir, never in
// Hermes's own config. A role without a pick uses what Hermes sends.
const picksFile = join(dataDir, 'models.json')
let picks = {}
try { picks = JSON.parse(readFileSync(picksFile, 'utf8')) } catch {}
const modelFor = role => (picks[role] === 'off' ? '' : picks[role] || models[role].model)

// Model ids each endpoint offers, for the pickers. Fetched once per endpoint.
const modelLists = new Map()
function listModels(role) {
  const m = models[role]
  if (!m.apiKey) return Promise.resolve([])
  if (!modelLists.has(m.baseUrl)) {
    modelLists.set(m.baseUrl, fetch(`${m.baseUrl.replace(/\/$/, '')}/models`, { headers: { authorization: `Bearer ${m.apiKey}` }, signal: AbortSignal.timeout(15000) })
      .then(r => r.json())
      .then(j => (j.data || []).map(x => x.id).filter(Boolean).sort())
      .catch(() => { modelLists.delete(m.baseUrl); return [] }))
  }
  return modelLists.get(m.baseUrl)
}

// ---------- images, from Hermes's own image providers (a Codex login, xAI, FAL…)
// imagegen.py runs in Hermes's Python, so the provider tokens never reach this server.
const PY = process.env.SWARM_HERMES_PY || ''
const pyEnv = { ...process.env, PYTHONPATH: process.env.SWARM_HERMES_PYTHONPATH || '' }
const imagegen = (args, timeout) => new Promise(resolve => {
  if (!PY) return resolve({ ok: false, error: 'start Swarm Studio from Hermes to use its image providers' })
  execFile(PY, [join(root, 'imagegen.py'), ...args], { env: pyEnv, timeout, maxBuffer: 1 << 20 }, (err, stdout) => {
    const line = String(stdout || '').trim().split('\n').pop()
    try { resolve(JSON.parse(line)) } catch { resolve({ ok: false, error: String(err?.message || 'no answer').slice(0, 200) }) }
  })
})
let imageProviders = null
const loadImageProviders = () => (imageProviders ||= imagegen(['--list'], 60000).then(r => (r.ok ? r.providers : [])))
loadImageProviders()
// The image model for new builds: the pick, else your Codex login's cheapest tier when it is signed in.
async function imageChoice() {
  if (picks.image === 'off') return null
  const list = await loadImageProviders()
  const want = picks.image || { provider: 'openai-codex', model: 'gpt-image-2-low' }
  const p = list.find(x => x.provider === want.provider && x.available)
  return p ? { provider: p.provider, model: want.model || p.default || '' } : null
}

const IMG_MAX = 8
function imageQueue(run, emit, choice) {
  const jobs = []
  let active = 0, n = 0
  const pump = () => {
    while (active < 2 && jobs.length) {
      const job = jobs.shift()
      active++
      const prompt = `${job.gen}. ${run.style || ''}`.slice(0, 600)
      imagegen(['--provider', choice.provider, ...(choice.model ? ['--model', choice.model] : []), '--aspect', job.aspect, prompt], 150000)
        .then(r => {
          if (!r.ok || !r.path || !existsSync(r.path)) return emit('image:failed', { page: job.page, layer: job.layer, gen: job.gen, message: r.error || 'no image' })
          const file = `${job.n}${extname(r.path) || '.png'}`
          mkdirSync(join(run.dir, 'img'), { recursive: true })
          copyFileSync(r.path, join(run.dir, 'img', file))
          emit('image', { page: job.page, layer: job.layer, gen: job.gen, src: `/img/${run.id}/${file}`, model: r.model || choice.model })
        })
        .finally(() => { active--; pump() })
    }
  }
  return e => {
    for (const m of String(e.html || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"[^>]*>/g)) {
      if (n >= IMG_MAX || /\bsrc=/.test(m[0])) continue
      const box = String(e.html).slice(Math.max(0, m.index - 400), m.index)
      const aspect = /aspect-(square|\[1\/1\])/.test(box) ? 'square' : /aspect-\[(3\/4|2\/3|4\/5|9\/16)\]/.test(box) ? 'portrait' : 'landscape'
      jobs.push({ n: ++n, page: e.page, layer: e.layer, gen: m[1], aspect })
      emit('image:queued', { page: e.page, layer: e.layer, gen: m[1], provider: choice.provider, model: choice.model })
    }
    pump()
  }
}
const host = url => { try { return new URL(url).host } catch { return '' } }
const defaultAgents = Number(process.env.SWARM_AGENTS || 16)

// Runs spend the user's API credits, so starting one (and watching one) needs
// this token. The canvas page carries it inline; other websites can't read
// that page (no CORS on it, and the Host check stops DNS rebinding).
const token = process.env.SWARM_TOKEN || randomBytes(24).toString('base64url')
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }

let current = null // { id, events: [], controller, done, result, working }
const clients = new Set()

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) res.write(line)
}

function startRun({ brief, agents, models: given }) {
  setModels(given)
  current?.controller.abort()
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(runsDir, id)
  mkdirSync(dir, { recursive: true })
  const run = { id, dir, events: [], controller: new AbortController(), done: false, result: null, working: new Set() }
  current = run
  let images = null

  const emit = (type, data) => {
    if (current !== run) return
    const event = { type, t: Date.now(), run: id, ...data }
    run.events.push(event)
    if (type === 'agent:assign') run.working.add(data.agent)
    if (type === 'layer:done' || type === 'layer:failed') run.working.delete(data.agent)
    if (type === 'run:done') run.result = data
    if (type === 'theme') run.style = `Art direction: ${data.direction || ''}`.slice(0, 300)
    broadcast(event)
    if (type !== 'layer:delta' && type !== 'plan:delta') appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(event) + '\n')
    if (type === 'layer:done' && images) images(event)
  }

  if (!models.planner.apiKey || !models.worker.apiKey) {
    queueMicrotask(() => emit('error', { where: 'models', message: 'No model key yet. Start a build from Hermes once (/swarm, the chat tool or `hermes swarm`) so it can pass its model settings, or set SWARM_STUDIO_API_KEY.' }))
    return run
  }
  imageChoice().then(choice => {
    if (current !== run) return
    if (choice) images = imageQueue(run, emit, choice)
    return runSwarm({
    images: !!choice,
    provider: provider('planner'),
    workerProvider: provider('worker'),
    brief,
    agents: agents || defaultAgents,
    plannerModel: modelFor('planner'),
    workerModel: modelFor('worker'),
    emit,
    signal: run.controller.signal
  })
    .then(({ plan }) => {
      run.done = true
      writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
    })
  })
    .catch(err => emit('error', { where: 'run', message: String(err.message || err) }))
  return run
}

// Saved runs are the studio's files: each one reopens as its own canvas.
const RUN_ID = /^[\w-]{1,64}$/
function readEvents(id) {
  const file = join(runsDir, id, 'events.jsonl')
  if (!RUN_ID.test(id) || !existsSync(file)) return null
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
}

// Add an event to a saved run (an edit, a review, an image): written to its file,
// kept with the live run so late joiners replay it, and sent to every canvas.
function record(id, event) {
  const file = join(runsDir, id, 'events.jsonl')
  if (!existsSync(file)) return false
  if (!event.type.endsWith(':delta')) appendFileSync(file, JSON.stringify(event) + '\n')
  if (current?.id === id) current.events.push(event)
  broadcast(event)
  return true
}

const EDIT_KINDS = new Set(['var', 'font', 'radius', 'size', 'scale', 'section'])
const safe = (v, n) => typeof v === 'string' && v.length <= n && !/[<>{};"\\]/.test(v)
function checkEdit(e) {
  if (!EDIT_KINDS.has(e.kind) || !safe(e.id, 24) || !safe(e.value, 60)) return null
  for (const k of ['name', 'role', 'from', 'axis', 'layer', 'prop', 'by']) if (e[k] !== undefined && !safe(e[k], 120)) return null
  const keep = ['kind', 'id', 'value', 'name', 'role', 'from', 'axis', 'layer', 'prop', 'by']
  return Object.fromEntries(keep.filter(k => e[k] !== undefined).map(k => [k, e[k]]))
}

function listRuns() {
  if (!existsSync(runsDir)) return []
  return readdirSync(runsDir).filter(id => RUN_ID.test(id)).sort().reverse().slice(0, 60).flatMap(id => {
    const events = readEvents(id)
    const start = events?.find(e => e.type === 'run:start')
    if (!start) return []
    const pages = events.filter(e => e.type === 'page')
    const done = events.find(e => e.type === 'run:done')
    return [{
      id,
      title: pages[0]?.title || start.brief.slice(0, 60),
      brief: start.brief,
      t: start.t,
      pages: pages.length,
      layers: done?.done ?? events.filter(e => e.type === 'layer:done').length,
      ms: done?.ms ?? null,
      live: current?.id === id && !current.done,
      preview: events.some(e => e.type === 'layer:done' && e.html)
    }]
  })
}

// Visitor tours for a finished run, written once and kept with the run. The
// canvas sends the inventory of each page, since it builds the pages.
const touring = new Map()
function tours(id, input) {
  const file = join(runsDir, id, 'tours.json')
  if (existsSync(file) && !input.fresh) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')))
  if (touring.has(id)) return touring.get(id)
  const start = readEvents(id)?.find(e => e.type === 'run:start')
  const pages = Array.isArray(input.pages) ? input.pages.filter(p => p && p.id && Array.isArray(p.items)).slice(0, 8) : []
  if (!start || !pages.length) return Promise.reject(new Error('no such run, or no pages sent'))
  if (!models.planner.apiKey) return Promise.reject(new Error('no model key yet: start a build from Hermes once'))
  const job = writeTours({ provider: provider('planner'), model: modelFor('planner'), brief: start.brief, pages })
    .then(result => {
      writeFileSync(file, JSON.stringify(result, null, 2))
      return result
    })
    .finally(() => touring.delete(id))
  touring.set(id, job)
  return job
}

// ---------- visual review: the reviewer model looks at a screenshot of a finished
// page (taken by the canvas, which owns the frames) and builders fix what it finds.
const reviewing = new Set()
const REVIEW_FALLBACKS = ['ali/qwen3.8-omni-flash', 'cc/claude-haiku-5-5', 'ag/gemini-3.8-flash-high']
async function review(id, input) {
  const events = readEvents(id)
  const start = events?.find(e => e.type === 'run:start')
  const theme = events?.findLast(e => e.type === 'theme')
  const model = modelFor('reviewer')
  if (!start) throw new Error('no such run')
  if (!model || !models.reviewer.apiKey) throw new Error('no reviewer model: pick one in Models, or set a vision model in Hermes')
  const image = String(input.image || '')
  const sections = (Array.isArray(input.sections) ? input.sections : []).filter(s => s && typeof s.key === 'string' && typeof s.html === 'string').slice(0, 24)
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || !sections.length || typeof input.page !== 'string') throw new Error('send a page, its sections and a screenshot')
  const tag = `${id}/${input.page}`
  if (reviewing.has(tag)) throw new Error('this page is already being reviewed')
  reviewing.add(tag)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  try {
    const page = sections.map(s => ({ key: s.key, role: String(s.role || s.key), top: Math.round(s.top) || 0, height: Math.round(s.height) || 0 }))
    send('review:start', { page: input.page, model })
    // a busy or image-blind reviewer hands over to the next vision model on the same endpoint
    const chain = [model, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? REVIEW_FALLBACKS.filter(m => m !== model) : [])]
    let result, used
    for (const m of chain) {
      try {
        result = await reviewPage({ provider: provider('reviewer'), model: m, brief: start.brief, page: input.title || input.page, sections: page, image, signal: AbortSignal.timeout(60000) })
        used = m
        break
      } catch (err) {
        if (m === chain.at(-1)) { send('review:done', { page: input.page, model: m, verdict: `review failed: ${String(err.message || err).slice(0, 120)}`, issues: [] }); throw err }
      }
    }
    send('review:done', { page: input.page, model: used, verdict: result.verdict, issues: result.issues, ms: result.ms })
    // each issue goes to a builder, in parallel; the agents are the run's own
    const agents = start.agents || []
    result.issues.forEach((issue, i) => {
      const s = sections.find(x => x.key === issue.section)
      const layer = s.key.split('/').pop(), pageId = s.key.split('/')[0]
      const agent = agents[(i * 5 + 3) % Math.max(1, agents.length)]?.id
      const t0 = Date.now()
      send('review:issue', { page: pageId, layer, agent, problem: issue.problem, fix: issue.fix })
      send('agent:assign', { agent, page: pageId, layer, role: s.role, fixing: true })
      send('layer:reset', { page: pageId, layer, agent })
      fixSection({ provider: provider('worker'), model: modelFor('worker'), theme, html: s.html, role: s.role || layer, problem: issue.problem, fix: issue.fix,
        onDelta: d => send('layer:delta', { page: pageId, layer, agent, text: d }) })
        .then(html => send('layer:done', { page: pageId, layer, agent, ms: Date.now() - t0, html, fixed: true }))
        .catch(err => send('layer:failed', { page: pageId, layer, agent, message: String(err.message || err), keep: s.html }))
    })
    return result
  } finally {
    reviewing.delete(tag)
  }
}

function tokenOk(given) {
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

// The canvas as one document (styles, script, frame template and token inline), so it
// also works inside the Desktop pane's sandboxed frame, whose origin is opaque.
// Changes whenever a canvas file does. An open canvas compares it with its own and
// reloads itself when idle, because Hermes's pane keeps a page open indefinitely.
const webVersion = () => String(Math.max(...readdirSync(webDir).map(f => statSync(join(webDir, f)).mtimeMs)) | 0)

function canvasPage() {
  const read = f => readFileSync(join(webDir, f), 'utf8')
  const boot = JSON.stringify({ token, version: webVersion(), frameHtml: read('frame.html') }).replace(/</g, '\\u003c')
  return read('index.html')
    .replace('<link rel="stylesheet" href="canvas.css">', () => `<style>${read('canvas.css')}</style>`)
    .replace('<script type="module" src="canvas.js"></script>', () => `<script>window.SWARM = ${boot}</script>\n<script type="module">${read('canvas.js')}</script>`)
}

function sendFile(res, file) {
  if (!existsSync(file)) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(readFileSync(file))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (!hosts.has(req.headers.host)) {
    res.writeHead(421).end('wrong host')
    return
  }

  // The API answers any origin (the Desktop pane's is opaque) but needs the token.
  const api = url.pathname === '/events' || url.pathname.startsWith('/api/')
  if (api) {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', 'content-type, x-swarm-token')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    const given = req.headers['x-swarm-token'] || url.searchParams.get('k')
    if (url.pathname !== '/api/state' && !tokenOk(given)) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'token required' }))
      return
    }
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(canvasPage())
    return
  }

  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write(': hello\n\n')
    // Late joiners replay the current run so the canvas can always rebuild itself.
    // A finished run skips the streaming deltas: each layer:done carries its final HTML.
    for (const e of current?.events || []) {
      if (current.done && e.type.endsWith(':delta')) continue
      res.write(`data: ${JSON.stringify(e)}\n\n`)
    }
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  if (url.pathname === '/api/run' && req.method === 'POST') {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try {
        input = JSON.parse(body || '{}')
      } catch {}
      if (!input.brief) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'brief required' }))
        return
      }
      const run = startRun(input)
      broadcast({ type: 'reset', run: run.id })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ run: run.id }))
    })
    return
  }

  if (url.pathname === '/api/runs') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(listRuns()))
    return
  }

  const runEvents = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/)
  if (runEvents) {
    const events = readEvents(runEvents[1])
    if (!events) {
      res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no such run' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(events))
    return
  }

  // A person's edit in the Design panel: saved with the run so it replays when the
  // file is reopened, and broadcast so every open canvas applies it.
  const runEdit = url.pathname.match(/^\/api\/runs\/([^/]+)\/edit$/)
  if (runEdit && req.method === 'POST' && RUN_ID.test(runEdit[1])) {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try {
        input = JSON.parse(body || '{}')
      } catch {}
      const edit = checkEdit(input)
      const file = join(runsDir, runEdit[1], 'events.jsonl')
      if (!edit || !existsSync(file)) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: edit ? 'no such run' : 'bad edit' }))
        return
      }
      record(runEdit[1], { type: 'edit', t: Date.now(), run: runEdit[1], ...edit })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
    })
    return
  }

  const runReview = url.pathname.match(/^\/api\/runs\/([^/]+)\/review$/)
  if (runReview && req.method === 'POST' && RUN_ID.test(runReview[1])) {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 8e6) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      review(runReview[1], input)
        .then(result => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result)))
        .catch(err => res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    })
    return
  }

  if (url.pathname === '/api/models' && req.method === 'GET') {
    Promise.all([listModels('planner'), listModels('reviewer'), loadImageProviders()]).then(([text, vision, image]) => {
      const roles = Object.fromEntries(ROLES.map(r => [r, { model: modelFor(r), hermes: models[r].model, host: host(models[r].baseUrl), picked: picks[r] || null }]))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ roles, text, vision, lite: picks.lite ?? null, image: { pick: picks.image || null, providers: image } }))
    })
    return
  }

  if (url.pathname === '/api/models' && req.method === 'POST') {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const name = v => typeof v === 'string' && /^[\w./:@+-]{1,120}$/.test(v)
      if (ROLES.includes(input.role) && (input.model === null || input.model === '' || name(input.model))) {
        if (input.model) picks[input.role] = input.model
        else delete picks[input.role]
      } else if (input.role === 'lite' && (input.on === null || typeof input.on === 'boolean')) {
        if (input.on === null) delete picks.lite
        else picks.lite = input.on
      } else if (input.role === 'image' && (input.provider === 'off' || input.provider === null || (name(input.provider) && (!input.model || name(input.model))))) {
        if (input.provider === 'off') picks.image = 'off'
        else if (input.provider) picks.image = { provider: input.provider, model: input.model || '' }
        else delete picks.image
      } else {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad pick' }))
        return
      }
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(picksFile, JSON.stringify(picks, null, 2))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, picks }))
    })
    return
  }

  const runTours = url.pathname.match(/^\/api\/runs\/([^/]+)\/tours$/)
  if (runTours && req.method === 'POST' && RUN_ID.test(runTours[1])) {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try {
        input = JSON.parse(body || '{}')
      } catch {}
      tours(runTours[1], input)
        .then(result => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result)))
        .catch(err => res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    })
    return
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      app: 'swarm-studio',
      version: webVersion(),
      run: current?.id || null,
      done: current?.done ?? null,
      working: current?.working.size || 0,
      result: current?.result || null,
      plannerModel: modelFor('planner'),
      workerModel: modelFor('worker'),
      plannerHost: host(models.planner.baseUrl),
      workerHost: host(models.worker.baseUrl),
      reviewerModel: modelFor('reviewer')
    }))
    return
  }

  // Generated images. Open like the page files: an image is no secret, and the
  // frames load them as plain <img> tags, which can't send the token.
  const img = url.pathname.match(/^\/img\/([\w-]{1,64})\/(\d{1,3}\.(png|jpe?g|webp))$/)
  if (img) {
    const file = join(runsDir, img[1], 'img', img[2])
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': `image/${img[3] === 'jpg' ? 'jpeg' : img[3]}`, 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' })
    res.end(readFileSync(file))
    return
  }

  const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  sendFile(res, join(webDir, rel))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`swarm studio on http://127.0.0.1:${port}/  (planner ${models.planner.model}, workers ${models.worker.model})`)
})
