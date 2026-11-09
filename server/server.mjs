#!/usr/bin/env node
// Swarm Studio local server: serves the canvas, starts runs, and streams every
// engine event to the canvas over Server-Sent Events. Binds to 127.0.0.1 only.
//
//   node server/server.mjs [--port 4319]
//   env: SWARM_API_KEY / SWARM_BASE_URL (or HERMES_CUSTOM_INFERHUB_API_KEY),
//        SWARM_PLANNER_MODEL, SWARM_WORKER_MODEL, SWARM_AGENTS

import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, copyFileSync, createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { basename, dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSwarm } from '../engine/run.mjs'
import { writeTours } from '../engine/tours.mjs'
import { reviewPage, fixSection, routeComment } from '../engine/review.mjs'
import { exportRun } from '../engine/export.mjs'
import { githubLogin, publishGitHub, publishVercel, publishCloudflare } from '../engine/publish.mjs'
import { connect, connections, credentials, PROVIDERS } from '../engine/connect.mjs'
import { MOTION_CSS, SNAPPY, swarmMotion } from '../engine/motion.mjs'
import { layoutSource, swarmLayout } from '../engine/layout.mjs'
import { collect, writeStory, fallbackStory, composition, videoTools, render, stagePictures } from '../engine/video.mjs'

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
const CMD_OPS = new Set(['open', 'play', 'review', 'video', 'fix', 'export', 'motion', 'publish'])
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
  const keys = new Set(sections.map(s => s.key))
  const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)
  // overlaps the canvas measured at desktop and phone width: no model needed to see them
  const measured = (Array.isArray(input.measured) ? input.measured : []).filter(m => m && keys.has(m.section) && m.problem).slice(0, 6)
    .map(m => ({ section: m.section, problem: clip(m.problem, 160), fix: clip(m.fix, 220), measured: true }))
  // the same page at phone width, for a second look
  const phone = input.mobile && /^data:image\/(jpeg|png|webp);base64,/.test(String(input.mobile.image || '')) && Array.isArray(input.mobile.sections)
    ? { image: String(input.mobile.image), sections: input.mobile.sections.filter(s => s && keys.has(s.key)).map(s => ({ key: s.key, role: String(s.role || s.key), top: Math.round(s.top) || 0, height: Math.round(s.height) || 0 })) }
    : null
  const tag = `${id}/${input.page}`
  if (reviewing.has(tag)) throw new Error('this page is already being reviewed')
  reviewing.add(tag)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  try {
    const page = sections.map(s => ({ key: s.key, role: String(s.role || s.key), top: Math.round(s.top) || 0, height: Math.round(s.height) || 0 }))
    send('review:start', { page: input.page, model })
    // a busy or image-blind reviewer hands over to the next vision model on the same endpoint
    const chain = [model, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? REVIEW_FALLBACKS.filter(m => m !== model) : [])]
    const look = async (img, secs, label) => {
      for (const m of chain) {
        try {
          return { ...(await reviewPage({ provider: provider('reviewer'), model: m, brief: start.brief, page: label, sections: secs, image: img, signal: AbortSignal.timeout(60000) })), model: m }
        } catch (err) {
          if (m === chain.at(-1)) throw err
        }
      }
    }
    const title = input.title || input.page
    let result
    try {
      ;[result] = await Promise.all([look(image, page, title), phone?.sections.length ? look(phone.image, phone.sections, `${title} (on a phone, 390px wide)`).then(r => { phone.result = r }, err => { phone.error = String(err.message || err).slice(0, 160) }) : null])
    } catch (err) {
      if (!measured.length) { send('review:done', { page: input.page, model, verdict: `review failed: ${String(err.message || err).slice(0, 120)}`, issues: [] }); throw err }
      result = { verdict: 'the reviewer model failed; fixing the measured overlaps', issues: [], ms: 0, model }
    }
    // measured overlaps first, then what the reviewer saw on desktop and on the phone;
    // one builder per section, with every note for it
    // a vision model squinting at a long screenshot sometimes calls a full page blank;
    // a section with real text in it isn't, so that note is dropped
    const BLANK = /\b(blank|empty|missing|nothing (is )?(visible|rendered|shown)|not (rendered|shown|present)|solid (dark )?(fill|colou?r))\b|\bno\b[^.;]*\b(visible|content|present|shown|rendered)\b/i
    const words = key => (sections.find(x => x.key === key)?.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length
    const real = i => !(BLANK.test(i.problem) && words(i.section) > 80)
    const seen = [...result.issues, ...(phone?.result?.issues || []).map(i => ({ ...i, problem: `On phones: ${i.problem}` }))]
    const dropped = seen.filter(i => !real(i)).length
    const all = [...measured, ...seen.filter(real)]
    const bySection = new Map()
    for (const i of all) {
      const had = bySection.get(i.section)
      if (!had) bySection.set(i.section, { ...i })
      else if (!had.problem.includes(i.problem)) { had.problem += `; ${i.problem}`; had.fix += `; ${i.fix}` }
    }
    const issues = [...bySection.values()].slice(0, 4)
    const verdict = phone?.result ? `${result.verdict} On phones: ${phone.result.verdict}` : result.verdict
    send('review:done', { page: input.page, model: result.model, verdict, issues, ms: result.ms, measured: measured.length, phone: !!phone?.result, phoneError: phone?.error, dropped })
    // each issue goes to a builder, in parallel; the agents are the run's own
    const agents = start.agents || []
    issues.forEach((issue, i) => {
      const s = sections.find(x => x.key === issue.section)
      const layer = s.key.split('/').pop(), pageId = s.key.split('/')[0]
      const agent = agents[(i * 5 + 3) % Math.max(1, agents.length)]?.id
      send('review:issue', { page: pageId, layer, agent, problem: issue.problem, fix: issue.fix })
      rework(send, s, agent, theme, { problem: issue.problem, fix: issue.fix })
    })
    return { ...result, verdict, issues }
  } finally {
    reviewing.delete(tag)
  }
}

// ---------- promo video: the planner storyboards the build, HyperFrames renders it
const videos = new Map() // run id -> { state, pct, stage, src, file, seconds, message }
async function makeVideo(id, input = {}) {
  const events = readEvents(id)
  if (!events?.some(e => e.type === 'layer:done')) throw new Error('no such build, or nothing built yet')
  if (videos.get(id)?.state === 'working') return videos.get(id)
  const job = { state: 'working', pct: 0, stage: 'storyboard', t: Date.now() }
  videos.set(id, job)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  const progress = (pct, stage) => {
    Object.assign(job, { pct, stage })
    broadcast({ type: 'video:progress', t: Date.now(), run: id, pct, stage })
  }
  const dir = join(runsDir, id, 'video')
  ;(async () => {
    const c = collect(events, join(runsDir, id))
    const model = modelFor('planner')
    send('video:start', { model, images: c.images.length })
    const tools = videoTools(dataDir, stage => progress(0, stage)) // fetches the renderer while the story is written
    let scenes
    try {
      if (!model || !models.planner.apiKey) throw new Error('no planner model')
      scenes = await writeStory({ provider: provider('planner'), model, c, signal: AbortSignal.timeout(90000) })
    } catch {
      scenes = fallbackStory(c)
    }
    const agents = c.agents
    send('video:story', { scenes: scenes.map((s, i) => ({ kind: s.kind, headline: s.headline, image: s.image ? `/img/${id}/${basename(c.images.find(x => x.n === s.image).file)}` : null, agent: agents[(i * 3 + 1) % Math.max(1, agents.length)]?.id })) })
    mkdirSync(dir, { recursive: true })
    stagePictures(c, dir)
    const comp = composition(scenes, c)
    writeFileSync(join(dir, 'index.html'), comp.html)
    writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(scenes, null, 2))
    const t = await tools
    progress(1, 'rendering')
    const out = join(dir, 'promo.mp4')
    await render({ tools: t, dir, out, quality: ['draft', 'standard', 'high'].includes(input.quality) ? input.quality : 'draft', onProgress: (pct, code) => progress(Math.max(1, pct), code === 'assemble' ? 'assembling' : 'rendering') })
    Object.assign(job, { state: 'done', pct: 100, src: `/video/${id}/promo.mp4?v=${Date.now()}`, file: out, seconds: comp.seconds })
    send('video:done', { src: job.src, file: out, seconds: comp.seconds, ms: Date.now() - job.t })
  })().catch(err => {
    Object.assign(job, { state: 'failed', message: String(err.message || err).slice(0, 300) })
    send('video:failed', { message: job.message })
  })
  return job
}

// ---------- publish: the static export, on GitHub Pages or hosted by this server
const publishes = new Map() // run id -> { state, target, stage, url, repo, message }
async function publish(id, input = {}) {
  const events = readEvents(id)
  if (!events?.some(e => e.type === 'layer:done')) throw new Error('no such build, or nothing built yet')
  if (publishes.get(id)?.state === 'working') return publishes.get(id)
  const target = ['local', 'vercel', 'cloudflare'].includes(input.target) ? input.target : 'github'
  const creds = PROVIDERS[target] ? await credentials(dataDir, target) : null
  if (PROVIDERS[target] && !creds) throw new Error(`connect ${PROVIDERS[target].label} first: 🌐 Publish on the canvas, or set ${PROVIDERS[target].env}`)
  const out = await exportRun({ events, runId: id, runDir: join(runsDir, id), sections: Array.isArray(input.sections) ? input.sections.slice(0, 80) : [] })
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  const local = `http://127.0.0.1:${port}/site/${id}/`
  const job = { state: 'working', target, stage: 'export', t: Date.now(), local, pages: out.pages }
  publishes.set(id, job)
  send('publish:start', { target })
  const finish = (url, extra = {}) => {
    Object.assign(job, { state: 'done', url, ...extra })
    send('publish:done', { target: job.target, url, local, pages: out.pages, ms: Date.now() - job.t, ...extra })
  }
  if (target === 'local') {
    finish(local)
    return job
  }
  const title = String(out.brand || out.name)
  const onStage = stage => { job.stage = stage; broadcast({ type: 'publish:stage', t: Date.now(), run: id, target, stage }) }
  const dir = join(out.dir, 'html')
  const go = target === 'vercel' ? publishVercel({ dir, name: out.name, creds, dataDir, onStage })
    : target === 'cloudflare' ? publishCloudflare({ dir, name: out.name, creds, dataDir, onStage })
    : publishGitHub({ dir, name: out.name, title, onStage })
  go.then(r => finish(r.url, { repo: r.repo, pending: !!r.pending }))
    .catch(err => {
      // the host didn't work out: the site is still hosted here
      Object.assign(job, { target: 'local', message: String(err.message || err).slice(0, 300) })
      finish(local, { fallback: job.message, tried: target })
    })
  return job
}

// A builder rewrites one finished section live: it is cleared on every canvas,
// streams back in, and on failure the old section returns.
function rework(send, s, agent, theme, args) {
  const layer = s.key.split('/').pop(), page = s.key.split('/')[0], t0 = Date.now()
  send('agent:assign', { agent, page, layer, role: s.role, fixing: true })
  send('layer:reset', { page, layer, agent })
  return fixSection({ provider: provider('worker'), model: modelFor('worker'), theme, html: s.html, role: s.role || layer, ...args,
    onDelta: d => send('layer:delta', { page, layer, agent, text: d }) })
    .then(html => send('layer:done', { page, layer, agent, ms: Date.now() - t0, html, fixed: true }))
    .catch(err => send('layer:failed', { page, layer, agent, message: String(err.message || err), keep: s.html }))
}

// The finished sections of a saved run, as the last event left each one.
function runSections(events) {
  const roles = new Map(events.filter(e => e.type === 'layer:plan').map(e => [`${e.page}/${e.id}`, e.role]))
  const out = new Map()
  for (const e of events) if (e.type === 'layer:done' && e.html) out.set(`${e.page}/${e.layer}`, { key: `${e.page}/${e.layer}`, role: roles.get(`${e.page}/${e.layer}`) || e.layer, html: e.html })
  return [...out.values()]
}

// ---------- comments: a person tells the agents what to change. On a selected
// section it goes straight to a builder; otherwise the planner works out which
// sections it is about.
let commentTurn = 0
const recentComments = new Map()
async function comment(id, input) {
  const events = readEvents(id)
  const start = events?.find(e => e.type === 'run:start')
  if (!start) throw new Error('no such build')
  if (!models.worker.apiKey) throw new Error('no model key yet: start a build from Hermes once')
  const text = String(input.text || '').replace(/\s+/g, ' ').trim().slice(0, 600)
  if (!text) throw new Error('say what to change')
  // the same comment from two open canvases (a /swarm fix reaches every one) is taken once
  const seen = `${id}|${text}`
  if (recentComments.get(seen) > Date.now() - 8000) return { sections: [], reply: '', duplicate: true }
  recentComments.set(seen, Date.now())
  const theme = events.findLast(e => e.type === 'theme')
  // the canvas sends its own copy of the sections (with any edits); otherwise the saved ones
  const given = Array.isArray(input.sections) ? input.sections.filter(s => s && typeof s.key === 'string' && typeof s.html === 'string').slice(0, 60) : []
  const sections = given.length ? given.map(s => ({ key: s.key, role: String(s.role || s.key).slice(0, 80), html: s.html })) : runSections(events)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  let keys = typeof input.target === 'string' && sections.some(s => s.key === input.target) ? [input.target] : null
  let reply = ''
  send('comment', { text, target: keys?.[0] || null })
  if (!keys) {
    const heads = sections.map(s => ({ key: s.key, role: s.role, head: (/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(s.html)?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) }))
    const routed = await routeComment({ provider: provider('planner'), model: modelFor('planner'), text, sections: heads, signal: AbortSignal.timeout(45000) })
    keys = routed.sections
    reply = routed.reply
    if (!keys.length) { send('comment:none', { text }); throw new Error('could not tell which section that is about: select one on the canvas and comment there') }
  }
  const agents = start.agents || []
  keys.forEach((k, i) => {
    const s = sections.find(x => x.key === k)
    const agent = agents[(commentTurn++ * 3 + 2) % Math.max(1, agents.length)]?.id
    send('comment:take', { text, page: k.split('/')[0], layer: k.split('/').pop(), role: s.role, agent, reply: i === 0 ? reply : '' })
    rework(send, s, agent, theme, { comment: text })
  })
  return { sections: keys, reply }
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
  const boot = JSON.stringify({ token, version: webVersion(), frameHtml: read('frame.html'), motion: { css: MOTION_CSS, src: swarmMotion.toString(), snappy: SNAPPY.source }, layout: layoutSource(), guard: swarmLayout.toString() }).replace(/</g, '\\u003c')
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

  const runVideo = url.pathname.match(/^\/api\/runs\/([^/]+)\/video$/)
  if (runVideo && RUN_ID.test(runVideo[1])) {
    const id = runVideo[1]
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method !== 'POST') {
      const file = join(runsDir, id, 'video', 'promo.mp4')
      return reply(200, videos.get(id) || (existsSync(file) ? { state: 'done', pct: 100, file, src: `/video/${id}/promo.mp4?v=${statSync(file).mtimeMs | 0}` } : { state: 'none' }))
    }
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      makeVideo(id, input).then(job => reply(200, job)).catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }

  const runComment = url.pathname.match(/^\/api\/runs\/([^/]+)\/comment$/)
  if (runComment && req.method === 'POST' && RUN_ID.test(runComment[1])) {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 4e6) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      comment(runComment[1], input)
        .then(result => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result)))
        .catch(err => res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    })
    return
  }

  const runPublish = url.pathname.match(/^\/api\/runs\/([^/]+)\/publish$/)
  if (runPublish && RUN_ID.test(runPublish[1])) {
    const id = runPublish[1]
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method !== 'POST') {
      const last = (readEvents(id) || []).filter(e => e.type === 'publish:done').pop()
      return reply(200, publishes.get(id) || (last ? { state: 'done', ...last } : { state: 'none' }))
    }
    let body = ''
    req.on('data', c => { body += c; if (body.length > 8e6) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      publish(id, input).then(job => reply(200, job)).catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }

  // Where a site can be published, and who is signed in there (never a token).
  if (url.pathname === '/api/publish' && req.method === 'GET') {
    Promise.all([githubLogin(), connections(dataDir)])
      .then(([login, conn]) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ github: login, ...conn, providers: PROVIDERS })))
    return
  }

  // Connect (or, with no token, disconnect) a host by its access token.
  if (url.pathname === '/api/connect' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      if (!PROVIDERS[input.provider]) return reply(400, { error: 'unknown provider' })
      connect(dataDir, input.provider, typeof input.token === 'string' ? input.token : null, typeof input.octo === 'string' && /^https:\/\/[\w.-]+$/.test(input.octo) ? input.octo : undefined)
        .then(who => reply(200, { provider: input.provider, connected: who ? { user: who.user } : null }))
        .catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }

  // Export: static HTML, a React + Vite + Tailwind project and an ABA handoff,
  // written to runs/<id>/export/ and zipped.
  const runExport = url.pathname.match(/^\/api\/runs\/([^/]+)\/export(\.zip)?$/)
  if (runExport && RUN_ID.test(runExport[1])) {
    const id = runExport[1]
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (runExport[2]) {
      const dir = join(runsDir, id, 'export')
      const zip = existsSync(dir) && readdirSync(dir).find(f => f.endsWith('.zip'))
      if (!zip) return reply(404, { error: 'not exported yet' })
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${zip}"` })
      createReadStream(join(dir, zip)).pipe(res)
      return
    }
    if (req.method !== 'POST') return reply(405, { error: 'POST to export' })
    let body = ''
    req.on('data', c => { body += c; if (body.length > 8e6) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const events = readEvents(id)
      if (!events) return reply(404, { error: 'no such build' })
      exportRun({ events, runId: id, runDir: join(runsDir, id), sections: Array.isArray(input.sections) ? input.sections.slice(0, 80) : [] })
        .then(out => {
          record(id, { type: 'export', t: Date.now(), run: id, dir: out.dir, zip: out.zip, pages: out.pages, sections: out.sections })
          reply(200, out)
        })
        .catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }

  // Commands from Hermes (/swarm review, the swarm_studio tool) that the open
  // canvas carries out, because it owns the frames.
  if (url.pathname === '/api/cmd' && req.method === 'POST') {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      if (!CMD_OPS.has(input.op) || (input.run !== undefined && !RUN_ID.test(String(input.run)))) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad command' }))
        return
      }
      broadcast({ type: 'cmd', op: input.op, ...(input.run ? { run: input.run } : {}), ...(typeof input.text === 'string' ? { text: input.text.slice(0, 600) } : {}), ...(typeof input.target === 'string' ? { target: input.target.slice(0, 120) } : {}), ...(typeof input.on === 'boolean' ? { on: input.on } : {}) })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, clients: clients.size }))
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

  // Published sites hosted on this computer: the run's static export, open like the images.
  const site = url.pathname.match(/^\/site\/([\w-]{1,64})(\/[\w./-]*)?$/)
  if (site) {
    if (!site[2]) return res.writeHead(301, { location: `/site/${site[1]}/` }).end()
    const base = join(runsDir, site[1], 'export')
    const name = existsSync(base) && readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(base, d.name, 'html')))
      .sort((a, b) => statSync(join(base, b.name)).mtimeMs - statSync(join(base, a.name)).mtimeMs)[0]?.name
    const rel = site[2] === '/' ? 'index.html' : site[2].slice(1)
    if (!name || rel.split('/').includes('..')) return res.writeHead(404).end('not found')
    const file = join(base, name, 'html', rel)
    if (!existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end('not found')
    const types = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', json: 'application/json' }
    res.writeHead(200, { 'content-type': types[rel.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-cache' })
    createReadStream(file).pipe(res)
    return
  }

  // A run's promo video, with range requests so the player can seek.
  const vid = url.pathname.match(/^\/video\/([\w-]{1,64})\/promo\.mp4$/)
  if (vid) {
    const file = join(runsDir, vid[1], 'video', 'promo.mp4')
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    const size = statSync(file).size
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
    const head = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }
    if (!range) {
      res.writeHead(200, { ...head, 'content-length': size })
      createReadStream(file).pipe(res)
      return
    }
    const from = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const to = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (from >= size || from > to) return res.writeHead(416, { 'content-range': `bytes */${size}` }).end()
    res.writeHead(206, { ...head, 'content-length': to - from + 1, 'content-range': `bytes ${from}-${to}/${size}` })
    createReadStream(file, { start: from, end: to }).pipe(res)
    return
  }

  const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  sendFile(res, join(webDir, rel))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`swarm studio on http://127.0.0.1:${port}/  (planner ${models.planner.model}, workers ${models.worker.model})`)
})
