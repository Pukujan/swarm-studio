#!/usr/bin/env node
// Swarm Studio local server: serves the canvas, starts runs, and streams every
// engine event to the canvas over Server-Sent Events. Binds to 127.0.0.1 only.
//
//   node server/server.mjs [--port 4319]
//   env: SWARM_API_KEY / SWARM_BASE_URL (or HERMES_CUSTOM_INFERHUB_API_KEY),
//        SWARM_PLANNER_MODEL, SWARM_WORKER_MODEL, SWARM_AGENTS

import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, copyFileSync, createReadStream, mkdtempSync, rmSync, openSync, readSync, closeSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { basename, dirname, extname, join, normalize } from 'node:path'
import { homedir, tmpdir, userInfo } from 'node:os'
import { fileURLToPath } from 'node:url'
import { runSwarm } from '../engine/run.mjs'
import { extendBase, rehomeImages } from '../engine/extend.mjs'
import { recentLooks } from '../engine/pagetype.mjs'
import { writeTours } from '../engine/tours.mjs'
import { reviewPage, fixSection, routeComment } from '../engine/review.mjs'
import { exportRun, snapshot } from '../engine/export.mjs'
import { standins as standinsMake } from '../engine/standins.mjs'
import { githubLogin, publishGitHub, publishVercel, publishCloudflare } from '../engine/publish.mjs'
import { connect, connections, credentials, PROVIDERS } from '../engine/connect.mjs'
import { MOTION_CSS, SNAPPY, swarmMotion, motionPreset } from '../engine/motion.mjs'
import { speak, mix, VOICES } from '../engine/sound.mjs'
import { layoutSource, swarmLayout } from '../engine/layout.mjs'
import { traced, readTrace } from '../engine/trace.mjs'
import { canvasPage as sharedCanvasPage, webVersion as pageVersion } from './page.mjs'
import { makeProjects, stateOf } from './projects.mjs'
import { autoJob, hermesKey } from '../engine/auto.mjs'
import * as art from '../engine/artdirect.mjs'
import { runBoard as boardOf } from './board.mjs'
import { listAssets, assetFiles } from '../engine/assets.mjs'
import { streamChat } from '../engine/llm.mjs'
import { runFacts, writeLaunch, readLaunch, markLaunch } from '../engine/launch.mjs'
import { hermesConnectors } from '../engine/hermes_connect.mjs'
import { collect, composition, VOICE_LEAD, videoTools, render, stagePictures, TRANSITIONS, fxFor, SHAPES } from '../engine/video.mjs'
import { writeBoard, fallbackBoard, cueSheet, TEMPLATES } from '../engine/storyboard.mjs'
import { scoreWav, elevenScore } from '../engine/score.mjs'
import { breakdown, merge as mergeRefs, refDir, safeName, kindOf } from '../engine/reference.mjs'
import { mediaKeys, mediaSources, mcpScore, clipJobs, KEYS as MEDIA_KEYS, ELEVEN_MCP } from '../engine/media.mjs'

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

// commands.py's JSON helpers, run once in Hermes's Python: {ok:false, message} when that fails
const pyCommand = (call, timeout) => new Promise(resolve => {
  if (!PY) return resolve({ ok: false, message: 'Start Swarm Studio from Hermes to post to the Feed.' })
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(root)}); import commands; print(json.dumps(commands.${call}))`
  execFile(PY, ['-c', code], { env: pyEnv, cwd: root, timeout, maxBuffer: 1 << 20 }, (err, stdout) => {
    const line = String(stdout || '').trim().split('\n').pop()
    try { resolve(JSON.parse(line)) } catch { resolve({ ok: false, message: err ? String(err.message || err).split('\n')[0] : 'The Feed did not answer.' }) }
  })
})

// ---------- images, from Hermes's own image providers (a Codex login, xAI, FAL…)
// imagegen.py runs in Hermes's Python, so the provider tokens never reach this server.
const PY = process.env.SWARM_HERMES_PY || ''
const pyEnv = { ...process.env, PYTHONPATH: process.env.SWARM_HERMES_PYTHONPATH || '' }
// keys pasted in the Film panel (engine/media.mjs): a FAL key switches on Hermes's own FAL providers
const mediaKeyStore = mediaKeys(dataDir)
const hermesPy = (script, what) => (args, timeout) => new Promise(resolve => {
  if (!PY) return resolve({ ok: false, error: `start Swarm Studio from Hermes to use its ${what} providers` })
  execFile(PY, [join(root, script), ...args], { env: { ...pyEnv, ...mediaKeyStore.env(pyEnv) }, timeout, maxBuffer: 1 << 20 }, (err, stdout) => {
    const line = String(stdout || '').trim().split('\n').pop()
    try { resolve(JSON.parse(line)) } catch { resolve({ ok: false, error: String(err?.message || 'no answer').slice(0, 200) }) }
  })
})
const imagegen = hermesPy('imagegen.py', 'image')
// moving clips from a still, through Hermes's video providers (FAL's Veo 3.1, xAI…)
const videogen = hermesPy('videogen.py', 'video')
let imageProviders = null, videoProviders = null
const loadImageProviders = () => (imageProviders ||= imagegen(['--list'], 60000).then(r => (r.ok ? r.providers : [])))
const loadVideoProviders = () => (videoProviders ||= videogen(['--list'], 60000).then(r => (r.ok ? r.providers : [])))
loadImageProviders()
loadVideoProviders()
// The image model for new builds: the pick, else your Codex login's cheapest tier when it is signed in.
async function imageChoice() {
  if (picks.image === 'off') return null
  const list = await loadImageProviders()
  const want = picks.image || { provider: 'openai-codex', model: 'gpt-image-2-low' }
  const p = list.find(x => x.provider === want.provider && x.available)
  if (p) return { provider: p.provider, model: want.model || p.default || '' }
  // no pick and no Codex login: any image provider Hermes has signed in (a pasted FAL key, xAI…)
  const any = !picks.image && list.find(x => x.available)
  return any ? { provider: any.provider, model: any.default || '' } : null
}

const IMG_MAX = 8

// ---------- the art director (engine/artdirect.mjs): one named style per build,
// the best tier for heroes and posters, and a vision check that sends back a
// picture that drifts into the generic AI look. Without a reviewer model the
// check is skipped; the prompt rules still apply.
const guides = new Map() // run id -> style guide
function guideFor(runId) {
  if (guides.has(runId)) return guides.get(runId)
  const events = readEvents(runId) || []
  const saved = events.findLast(e => e.type === 'art')
  const guide = saved?.guide ? { style: saved.style, name: saved.name, guide: saved.guide, avoid: saved.avoid, bans: saved.bans || [] }
    : art.styleGuide({ brief: events.find(e => e.type === 'run:start')?.brief, theme: events.findLast(e => e.type === 'theme') })
  guides.set(runId, guide)
  return guide
}
const ART_CHECK_FALLBACKS = ['ali/qwen3.8-omni-flash', 'cc/claude-haiku-5-5', 'ag/gemini-3.8-flash-high']
async function checkArt(path, guide) {
  const model = modelFor('reviewer')
  if (!model || !models.reviewer.apiKey || !/\.(webp|png|jpe?g)$/i.test(path)) return { ok: true, problems: [], skipped: true }
  const ext = extname(path).slice(1).toLowerCase().replace('jpg', 'jpeg')
  const image = `data:image/${ext};base64,${readFileSync(path).toString('base64')}`
  const chain = [model, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? ART_CHECK_FALLBACKS.filter(m => m !== model) : [])]
  for (const m of chain) {
    try {
      const res = await streamChat(provider('reviewer'), { trace: { kind: 'art-check' }, model: m, messages: art.checkMessages(guide, image), maxTokens: 300, temperature: 0, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal: AbortSignal.timeout(45000) })
      return { ...art.parseCheck(res.text), model: m }
    } catch {}
  }
  return { ok: true, problems: [], skipped: true }
}
// One picture through the art director. A picture sent back is made once more with
// the reasons in its prompt; the second one stands.
async function paintArt(choice, guide, { gen, aspect = 'landscape', hero = false, cutout = false }, onSentBack) {
  const pick = art.tierFor(choice, { hero })
  const go = strict => imagegen(['--provider', pick.provider, ...(pick.model ? ['--model', pick.model] : []), '--aspect', aspect, art.promptFor(gen, guide, { aspect, strict, cutout })], hero ? 300000 : 150000)
  const r = await go('')
  if (!r.ok || !r.path || !existsSync(r.path)) return r
  const check = await checkArt(r.path, guide)
  if (check.ok) return { ...r, model: r.model || pick.model, check }
  onSentBack?.(check)
  const again = await go(check.problems.join('; '))
  if (!again.ok || !again.path || !existsSync(again.path)) return { ...r, model: r.model || pick.model, check }
  return { ...again, model: again.model || pick.model, check: await checkArt(again.path, guide), retried: true }
}

// One picture for a finished section: a new one asked for in an edit, or a
// replacement. It keeps the <img>'s data-gen as its key, so every canvas, the
// export and the video pick up the newest one.
function paintOne(send, runId, { page, layer, gen, prompt }, choice) {
  send('image:queued', { page, layer, gen, provider: choice.provider, model: choice.model })
  const sentBack = c => send('image:sent-back', { page, layer, gen, problems: c.problems, model: c.model })
  return paintArt(choice, guideFor(runId), { gen: prompt || gen, hero: art.isHero({ layer }) }, sentBack).then(r => {
    if (!r.ok || !r.path || !existsSync(r.path)) return send('image:failed', { page, layer, gen, message: r.error || 'no image' })
    const file = `edit-${Date.now().toString(36)}${extname(r.path) || '.png'}`
    mkdirSync(join(runsDir, runId, 'img'), { recursive: true })
    copyFileSync(r.path, join(runsDir, runId, 'img', file))
    send('image', { page, layer, gen, src: `/img/${runId}/${file}`, model: r.model || choice.model, prompt: prompt || undefined })
  })
}
// After a rewrite: paint the <img data-gen> it added (ones painted before keep their picture).
function paintNew(runId, send, page, layer, html, choice) {
  const had = new Set((readEvents(runId) || []).filter(e => e.type === 'image' && e.page === page && e.layer === layer).map(e => e.gen))
  const gens = [...new Set([...String(html).matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"/g)].map(m => m[1]))].filter(g => !had.has(g)).slice(0, 2)
  for (const gen of gens) paintOne(send, runId, { page, layer, gen }, choice)
}
function imageQueue(run, emit, choice) {
  const jobs = []
  let active = 0, n = 0
  const pump = () => {
    while (active < 2 && jobs.length) {
      const job = jobs.shift()
      active++
      const sentBack = c => emit('image:sent-back', { page: job.page, layer: job.layer, gen: job.gen, problems: c.problems, model: c.model })
      paintArt(choice, run.art || art.styleGuide({ brief: run.brief }), { gen: job.gen, aspect: job.aspect, hero: art.isHero({ layer: job.layer, n: job.n }) }, sentBack)
        .then(r => {
          if (!r.ok || !r.path || !existsSync(r.path)) return emit('image:failed', { page: job.page, layer: job.layer, gen: job.gen, message: r.error || 'no image' })
          const file = `${job.n}${extname(r.path) || '.png'}`
          mkdirSync(join(run.dir, 'img'), { recursive: true })
          copyFileSync(r.path, join(run.dir, 'img', file))
          emit('image', { page: job.page, layer: job.layer, gen: job.gen, src: `/img/${run.id}/${file}`, model: r.model || choice.model, style: run.art?.style, checked: r.check && !r.check.skipped ? (r.check.ok ? 'ok' : 'sent back') : undefined })
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

let current = null // { id, events: [], controller, done, result, working }
const clients = new Set()

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) res.write(line)
}

function startRun({ brief, agents, models: given, base = null, ask = '' }) {
  setModels(given)
  current?.controller.abort()
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(runsDir, id)
  mkdirSync(dir, { recursive: true })
  const run = { id, dir, events: [], controller: new AbortController(), done: false, result: null, working: new Set(), brief }
  current = run
  // a follow-up keeps the last version's art style, so new pictures match the old ones
  if (base) rehomeImages(base, runsDir, dir, id, { existsSync, mkdirSync, copyFileSync, join })
  if (base?.art) { run.art = Object.fromEntries(Object.entries(base.art).filter(([k]) => !['type', 't', 'run'].includes(k))); guides.set(id, run.art) }
  let images = null

  const emit = (type, data) => {
    if (current !== run) return
    const event = { type, t: Date.now(), run: id, ...data }
    run.events.push(event)
    if (type === 'agent:assign') run.working.add(data.agent)
    if (type === 'layer:done' || type === 'layer:failed') run.working.delete(data.agent)
    if (type === 'run:done') run.result = data
    if (type === 'theme' && !run.art) {
      run.art = art.styleGuide({ brief: run.brief, theme: data })
      guides.set(id, run.art)
      queueMicrotask(() => emit('art', run.art))
    }
    broadcast(event)
    if (type !== 'layer:delta' && type !== 'plan:delta') appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(event) + '\n')
    // a section carried over from the last version keeps its pictures: nothing is painted again
    if (type === 'layer:done' && images && !data.kept) images(event)
  }

  if (!models.planner.apiKey || !models.worker.apiKey) {
    queueMicrotask(() => emit('error', { where: 'models', message: 'No model key yet. Start a build from Hermes once (/swarm, the chat tool or `hermes swarm`) so it can pass its model settings, or set SWARM_STUDIO_API_KEY.' }))
    return run
  }
  imageChoice().then(choice => {
    if (current !== run) return
    if (choice) images = imageQueue(run, emit, choice)
    return withTrace(id, () => runSwarm({
    images: !!choice,
    provider: provider('planner'),
    workerProvider: provider('worker'),
    brief,
    base,
    ask,
    // the last builds' page types and colours, so this one looks different
    recent: recentLooks(runsDir),
    agents: agents || defaultAgents,
    plannerModel: modelFor('planner'),
    workerModel: modelFor('worker'),
    emit,
    signal: run.controller.signal
  }))
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

// What the person adds to a run: a folder, their own name for it, tags, a note.
const runMeta = id => { try { return JSON.parse(readFileSync(join(runsDir, id, 'meta.json'), 'utf8')) } catch { return {} } }

// Model calls made for a run are traced into its folder (engine/trace.mjs), unless
// the person turned that off for the project; open canvases hear of each call.
const traceScope = id => ({
  run: id,
  dir: runMeta(id).trace === false ? null : join(runsDir, id),
  sink: rec => broadcast({ type: 'trace', t: rec.t, run: id, call: { id: rec.id, kind: rec.kind, agent: rec.agent, page: rec.page, layer: rec.layer, model: rec.model, ok: rec.ok, ms: rec.ms } })
})
const withTrace = (id, fn) => traced(traceScope(id), fn)

// What a run is working on right now, if anything: the site build, an app or game build, a film.
// { what: site | app | game | film, stage, pct (0..1, or null when the job cannot say) }
let appsNow = null // the app jobs, once loaded, so this can stay synchronous
function workOf(id) {
  if (current?.id === id && !current.done) {
    const plan = current.events.filter(e => e.type === 'layer:plan').length
    return { what: 'site', stage: plan ? 'building pages' : 'planning', pct: Math.min(1, current.events.filter(e => e.type === 'layer:done').length / Math.max(1, plan || 12)) }
  }
  const a = appsNow?.jobs?.get(id)
  if (a?.state === 'working') return { what: a.kind === 'game' ? 'game' : 'app', stage: clipStage(a.stage), pct: null, steps: a.steps?.length || 0 }
  const v = videos.get(id)
  if (v?.state === 'working') return { what: 'film', stage: clipStage(v.stage), pct: Math.min(1, (Number(v.pct) || 0) / 100) }
  return null
}
const clipStage = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60) || null

// A run's file card, from its events plus the person's meta. Cached by the
// events file's size and time, so listing many runs stays quick.
const cards = new Map()
function runCard(id) {
  const file = join(runsDir, id, 'events.jsonl')
  let st
  try { st = statSync(file) } catch { return null }
  const key = `${st.size}:${st.mtimeMs}`
  let card = cards.get(id)
  if (card?.key !== key) {
    const events = readEvents(id)
    const start = events?.find(e => e.type === 'run:start')
    if (!start) return null
    const pages = events.filter(e => e.type === 'page')
    const done = events.find(e => e.type === 'run:done')
    // a game made on its own has no page theme: it wears the brand from its spec
    const brand = events.find(e => e.type === 'game:spec')?.spec?.brand
    const theme = events.findLast(e => e.type === 'theme') || (brand?.vars ? { name: brand.name || 'game', vars: brand.vars, fonts: brand.fonts } : {})
    const sites = {}
    for (const e of events) if (e.type === 'publish:done' && e.url) sites[e.target] = e.url
    const video = events.findLast(e => e.type === 'video:done')
    card = { key, info: {
      id,
      title: start.title || pages[0]?.title || start.brief.slice(0, 60),
      kind: start.kind || 'site',
      // a game made from a site: that site's run, so the game joins its version
      from: start.from || null,
      brief: start.brief,
      t: start.t,
      updated: events.at(-1)?.t || start.t,
      pages: pages.length,
      pageTitles: pages.map(p => p.title),
      layers: done?.done ?? events.filter(e => e.type === 'layer:done').length,
      failed: done?.failed || 0,
      ms: done?.ms ?? null,
      agents: start.agents?.length || 0,
      models: { planner: start.plannerModel || null, builders: start.workerModel || null },
      theme: theme.name ? { name: theme.name, direction: theme.direction || '', colors: ['--background', '--primary', '--accent', '--foreground'].map(k => theme.vars?.[k]).filter(Boolean), fonts: theme.fonts || {} } : null,
      images: events.filter(e => e.type === 'image').length,
      reviews: events.filter(e => e.type === 'review:done').length,
      fixes: events.filter(e => e.type === 'review:issue').length,
      edits: events.filter(e => e.type === 'edit').length,
      exports: events.filter(e => e.type === 'export').length,
      sites,
      published: Object.keys(sites),
      videoSeconds: video?.seconds ?? null,
      preview: events.some(e => e.type === 'layer:done' && e.html),
      // the cover: the hero picture the art director made, else the first picture
      cover: (events.find(e => e.type === 'image' && e.src && art.isHero({ layer: e.layer })) || events.find(e => e.type === 'image' && e.src))?.src || null,
      game: events.some(e => e.type === 'game:spec') || pages.some(p => /\b(play|game|arcade|trial)\b/i.test(`${p.id} ${p.title}`)),
      app: events.some(e => e.type === 'app:ready' || e.type === 'app:done'),
      planned: events.filter(e => e.type === 'layer:plan').length,
      // the last app build's outcome (as the app jobs read it): working (or stopped), built or failed
      build: ({ 'app:start': 'working', 'app:done': 'built', 'app:failed': 'failed' })[events.findLast(e => ['app:start', 'app:done', 'app:failed'].includes(e.type))?.type] || null,
      deployed: events.findLast(e => e.type === 'app:deployed' && e.url)?.url || null,
    } }
    cards.set(id, card)
  }
  const meta = runMeta(id)
  const out = {
    ...card.info,
    autoTitle: card.info.title,
    title: meta.title || card.info.title,
    folder: meta.folder || null,
    tags: meta.tags || [],
    note: meta.note || '',
    trace: meta.trace !== false,
    order: typeof meta.order === 'number' ? meta.order : null,
    traces: existsSync(join(runsDir, id, 'trace.jsonl')),
    video: existsSync(join(runsDir, id, 'video', 'promo.mp4')),
    videoFile: shelveVideo(id),
    // the 9:16 phone cut beside the wide one, when the run has it
    videoTall: existsSync(join(runsDir, id, 'video', SHAPES.tall.file)) ? `/video/${id}/${SHAPES.tall.file}` : null,
    live: current?.id === id && !current.done,
    progress: current?.id === id && !current.done ? Math.min(1, (current.events.filter(e => e.type === 'layer:done').length) / Math.max(1, current.events.filter(e => e.type === 'layer:plan').length || 12)) : null,
    work: workOf(id),
    // the cover: its hero picture, else a snapshot of its first page (saved by the canvas), else a film frame
    cover: card.info.cover || snapOf(id) || (existsSync(join(runsDir, id, 'video', 'p1.webp')) ? `/video/${id}/live/p1.webp` : null),
  }
  out.state = stateOf(out)
  return out
}

// a picture's own name: its page and section in words ("perks-and-partners-hero" on Perks & Partners →
// "Perks & Partners hero"), else picture plus page; the home page says Home, not the build's name
function pieceName(e, pageTitle) {
  const words = s => String(s || '').replace(/[-_]+/g, ' ').trim()
  const pid = String(e.page || '')
  // a long page title often carries the build's name ("Tidebreak — Press Kit"): the page's short id says it better
  const short = t => t && t.length <= 22 && !/ [—–|:] /.test(t) ? t : null
  const page = /^(home|index)$/i.test(pid) ? 'Home' : short(pageTitle[pid]) || (w => w.charAt(0).toUpperCase() + w.slice(1))(words(pid))
  const rest = words(pid && String(e.layer || '').startsWith(`${pid}-`) ? String(e.layer).slice(pid.length + 1) : e.layer)
  if (!rest) return page ? `Picture, ${page}` : 'Picture'
  if (!page || pid === '*') return rest.charAt(0).toUpperCase() + rest.slice(1)
  // "Leaderboard leaderboard hero" says the page once
  return rest.toLowerCase().startsWith(`${page.toLowerCase()} `) ? `${page}${rest.slice(page.length)}` : `${page} ${rest}`
}

// the saved first-page snapshot, versioned so a newer one is not served from cache
function snapOf(id) {
  const f = join(runsDir, id, 'img', 'snap.jpg')
  try { return `/img/${id}/snap.jpg?v=${Math.round(statSync(f).mtimeMs)}` } catch { return null }
}

// What people make goes where they can see it, not only inside the hidden data
// folder: videos to ~/Movies/Swarm Studio/<build>/, exports to ~/Documents/Swarm Studio/<build>/
// (~/Videos on Linux and Windows). SWARM_OUTPUT_DIR puts both under one folder instead.
const titleOf = id => runMeta(id).title || (cards.get(id) || (runCard(id), cards.get(id)))?.info.title || 'build'
const fileSlug = id => String(titleOf(id)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'build'
// One folder per build, named for it and the day it was made. A hidden .swarm-build
// file says whose it is, so a second build with the same name that day gets "(2)".
function shelf(id, kind) {
  const base = process.env.SWARM_OUTPUT_DIR || join(homedir(), kind === 'video' ? (process.platform === 'darwin' ? 'Movies' : 'Videos') : 'Documents')
  const title = String(titleOf(id)).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'build'
  for (let n = 1; ; n++) {
    const dir = join(base, 'Swarm Studio', `${title} · ${id.slice(0, 10)}${n > 1 ? ` (${n})` : ''}`), mark = join(dir, '.swarm-build')
    let owner = null
    try { owner = readFileSync(mark, 'utf8').trim() } catch {}
    if (owner === id || (!owner && !existsSync(dir))) return { dir, claim: () => { mkdirSync(dir, { recursive: true }); if (!owner) writeFileSync(mark, id) } }
    if (n >= 50) return { dir: join(base, 'Swarm Studio', `${title} · ${id}`), claim() { mkdirSync(this.dir, { recursive: true }) } }
  }
}
// Every cut and every export is kept: <name>-promo-v1.mp4, -v2… and <name>-v1.zip, -v2…
function versions(dir, stem, ext) {
  let names = []
  try { names = readdirSync(dir) } catch {}
  const nums = names.map(n => n.startsWith(`${stem}-v`) && n.endsWith(ext) ? Number(n.slice(stem.length + 2, -ext.length)) : NaN).filter(Number.isInteger)
  const last = nums.length ? Math.max(...nums) : 0
  return { last: last ? join(dir, `${stem}-v${last}${ext}`) : null, next: join(dir, `${stem}-v${last + 1}${ext}`) }
}
// The build's video in the visible folder: the newest version, or a new one when
// the build has a cut that is newer than every copy (made now if none exists yet).
function shelveVideo(id, shape = 'wide') {
  const src = join(runsDir, id, 'video', (SHAPES[shape] || SHAPES.wide).file)
  if (!existsSync(src)) return null
  try {
    const { dir, claim } = shelf(id, 'video'), v = versions(dir, `${fileSlug(id)}-promo${shape === 'tall' ? '-tall' : ''}`, '.mp4')
    if (v.last && statSync(v.last).mtimeMs >= statSync(src).mtimeMs) return v.last
    claim()
    copyFileSync(src, v.next)
    return v.next
  } catch { return null }
}
function shelveExport(id, zip) {
  if (!zip || !existsSync(zip)) return null
  try {
    const { dir, claim } = shelf(id, 'export'), v = versions(dir, fileSlug(id), '.zip')
    claim()
    copyFileSync(zip, v.next)
    return v.next
  } catch { return null }
}

// Projects and folders (server/projects.mjs): runs/folders.json v2 groups runs into projects.
const projects = makeProjects({ runsDir, dataDir, runCard, runMeta, isLive: id => !!workOf(id) })
const folderList = () => projects.list().folders.map(f => f.name)
const folderOp = input => projects.folderOp(input)

function listRuns() {
  if (!existsSync(runsDir)) return []
  return readdirSync(runsDir).filter(id => RUN_ID.test(id)).sort().reverse().slice(0, 300).flatMap(id => runCard(id) || [])
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
  const job = withTrace(id, () => writeTours({ provider: provider('planner'), model: modelFor('planner'), brief: start.brief, pages }))
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
const review = (id, input) => withTrace(id, () => reviewNow(id, input))
async function reviewNow(id, input) {
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
      rework(id, send, s, agent, theme, { problem: issue.problem, fix: issue.fix })
    })
    return { ...result, verdict, issues }
  } finally {
    reviewing.delete(tag)
  }
}

// ---------- promo video: the planner storyboards the build, HyperFrames renders it
const videos = new Map() // run id -> { state, pct, stage, src, file, seconds, message }
const makeVideo = (id, input) => withTrace(id, () => videoNow(id, input))
// New pictures for the video: two at a time; a scene whose picture fails becomes a quote.
// The film's style references: files the person added (kept in video/refs) and links in the prompt.
function refsOf(id, input, prompt) {
  const dirOf = join(runsDir, id, 'video', 'refs')
  const out = []
  for (const r of Array.isArray(input.refs) ? input.refs : []) {
    if (r?.name) { const file = join(dirOf, safeName(r.name)); if (existsSync(file)) out.push({ file, name: safeName(r.name), kind: kindOf({ file }) }) }
    else if (/^https?:\/\//.test(r?.url || '')) out.push({ url: r.url, kind: kindOf({ url: r.url }) })
    else if (r?.text) out.push({ text: String(r.text).slice(0, 200), kind: 'game' })
  }
  for (const m of prompt.matchAll(/https?:\/\/[^\s"'<>]+/g)) if (!out.some(r => r.url === m[0])) out.push({ url: m[0], kind: kindOf({ url: m[0] }) })
  return out
}

// Flow (Veo) clips made from the studio's stills: <run>/flow/<still name>.mp4. A story beat
// on a still that has one plays the clip instead (its first seconds, the way the trailer uses them).
function useFlowClips(id, c, scenes) {
  const flow = join(runsDir, id, 'flow')
  if (!existsSync(flow)) return
  for (const sc of scenes) {
    if (sc.layer !== 'story' || !(sc.kind === 'image' || sc.kind === 'split') || !sc.image) continue
    const still = c.images.find(x => x.n === sc.image)
    const file = still && join(flow, `${basename(still.file).replace(/\.[^.]+$/, '')}.mp4`)
    if (!file || !existsSync(file)) continue
    const n = c.clips.length + 1
    c.clips.push({ n, what: still.gen, label: '', seconds: 8, from: 0, file })
    Object.assign(sc, { kind: 'clip', clip: n, from: 0, speed: 1 })
    delete sc.image
  }
}

async function shootScenes(id, c, scenes, choice, progress, notes = null) {
  const todo = scenes.filter(sc => sc.shot)
  const img = join(runsDir, id, 'img')
  mkdirSync(img, { recursive: true })
  let done = 0
  progress(0, `making ${todo.length} pictures`)
  const guide = guideFor(id)
  const one = async sc => {
    // a video frame is a poster: the best tier, the build's own style, and no phones or interfaces
    const r = await paintArt(choice, guide, { gen: `${sc.shot}${notes ? `, ${[notes.mood, notes.palette?.length ? `colours ${notes.palette.slice(0, 4).join(' ')}` : ''].filter(Boolean).join(', ')}` : ''}, filling the frame, no screens, phones or website interfaces`, aspect: 'landscape', hero: true })
    if (r.ok && r.path && existsSync(r.path)) {
      const file = join(img, `video-${Date.now().toString(36)}-${done}${extname(r.path) || '.png'}`)
      copyFileSync(r.path, file)
      const n = c.images.length + 1
      c.images.push({ n, gen: sc.shot.slice(0, 160), page: 'video', file })
      sc.image = n
    } else { sc.kind = 'title'; sc.layer = 'type'; if (!sc.headline) sc.headline = c.brand }
    delete sc.shot
    progress(0, `making pictures (${++done}/${todo.length})`)
  }
  for (let i = 0; i < todo.length; i += 2) await Promise.all(todo.slice(i, i + 2).map(one))
}

async function videoNow(id, input = {}) {
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
    // film the running app first (gameplay on /play, a scroll through the site), so the cut can use it
    if (input.film === 'auto') input.film = (await apps()).state(id).hasApp
    if (input.film) {
      try {
        progress(0, 'opening the app to film it')
        const t = await videoTools(dataDir, stage => progress(0, stage))
        const a = await apps()
        const view = await a.open(id)
        const { filmBuild } = await import('../engine/footage.mjs')
        const shot = await filmBuild({ url: view?.url, runDir: join(runsDir, id), dataDir, ffmpeg: t.ffmpeg, game: input.film !== 'site', onStage: stage => progress(0, stage) })
        send('video:footage', { clips: shot.clips.map(x => x.label), note: shot.note })
      } catch (err) {
        send('video:note', { message: `no footage this time: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
      }
    }
    const c = collect(readEvents(id) || events, join(runsDir, id))
    const model = modelFor('planner')
    // the prompt shapes the film; a template is only a starting point the writer may borrow from
    const prompt = String(input.prompt || input.idea || '').trim().slice(0, 600)
    const template = TEMPLATES[input.template || input.style] ? (input.template || input.style) : ''
    const seed = (Date.now() ^ (Math.random() * 2 ** 31)) >>> 0
    const pinned = TRANSITIONS.includes(input.transition)
    let transition = pinned ? input.transition : 'wipe'
    send('video:start', { model, images: c.images.length, style: template || 'prompt', idea: prompt, prompt, transition, refs: (input.refs || []).length })
    const tools = videoTools(dataDir, stage => progress(0, stage)) // fetches the renderer while the story is written
    mkdirSync(dir, { recursive: true })
    // style references: each broken into a style description, kept with the run; never copied
    let notes = null
    const refs = refsOf(id, input, prompt)
    if (refs.length) {
      progress(0, 'reading the style references')
      const t0 = await tools
      const vision = models.reviewer.apiKey && modelFor('reviewer') ? ['reviewer', modelFor('reviewer')] : ['planner', model]
      const done = []
      for (const ref of refs.slice(0, 3)) {
        try { done.push(await breakdown(ref, { ffmpeg: t0.ffmpeg, provider: models[vision[0]].apiKey ? provider(vision[0]) : null, model: vision[1], signal: AbortSignal.timeout(120000) })) }
        catch (err) { send('video:note', { message: `could not read a reference: ${String(err.message || err).split('\n')[0].slice(0, 120)}` }) }
      }
      if (done.length) {
        notes = mergeRefs(done)
        writeFileSync(join(dir, 'style-notes.json'), JSON.stringify({ notes, refs: done }, null, 2))
        send('video:style', { notes })
      }
    }
    let scenes
    try {
      if (!model || !models.planner.apiKey) throw new Error('no planner model')
      // with an image model, the storyboard may ask for new story stills
      const shooter = await imageChoice().catch(() => null)
      scenes = await writeBoard({ provider: provider('planner'), model, c, prompt, template, notes, shots: !!shooter, seed, signal: AbortSignal.timeout(120000) })
      if (shooter && scenes.some(sc => sc.shot)) await shootScenes(id, c, scenes, shooter, progress, notes)
    } catch (err) {
      scenes = fallbackBoard(c, { prompt, notes, seed, template, fixes: [`no writer this time: ${String(err.message || err).slice(0, 80)}`] })
    }
    // a beat whose painted shot failed has no picture: it becomes a type card
    for (const sc of scenes) if ((sc.kind === 'image' || sc.kind === 'split') && !sc.image) { sc.kind = 'title'; sc.layer = 'type'; if (!sc.headline) sc.headline = c.brand }
    // moving clips: a video model animates a few story stills (Veo through Hermes's FAL, xAI…);
    // clips already in <run>/flow (made with Flow by hand) are used as they are
    const media = await mediaNow().catch(() => null)
    if (media?.clips.on && input.clips !== false) {
      const jobs = clipJobs(scenes, c.images, join(runsDir, id, 'flow'), 3)
      if (jobs.length) {
        progress(1, `${media.clips.by} is animating ${jobs.length} stills`)
        let made = 0
        await Promise.all(jobs.map(j => videogen(['--provider', media.clips.provider, '--image', j.still, '--seconds', String(j.seconds), '--out', j.clip, j.prompt], 600000).then(r => {
          if (r.ok) made++
          else send('video:note', { message: `a still stayed still: ${String(r.error || 'no clip').slice(0, 120)}` })
        })))
        if (made) send('video:clips', { by: media.clips.by, made })
      }
    }
    useFlowClips(id, c, scenes)
    if (pinned) scenes.look.pinned = true
    scenes.fx = fxFor(scenes.fx, prompt)
    const agents = c.agents
    const picOf = s => { const n = s.image || s.images?.[0]; const f = n && c.images.find(x => x.n === n); return f ? `/img/${id}/${basename(f.file)}` : null }
    send('video:story', { look: scenes.look, plan: scenes.plan, title: scenes.title, pace: scenes.pace, clips: c.clips.length, fx: scenes.fx, music: scenes.music, fixes: scenes.fixes, notes, scenes: scenes.map((s, i) => ({ kind: s.kind, layer: s.layer, seconds: s.seconds, camera: s.camera, cut: s.cut, cue: s.cue, sfx: s.sfx, headline: s.headline, accent: s.accent, speed: s.speed, image: picOf(s), agent: agents[(i * 3 + 1) % Math.max(1, agents.length)]?.id })) })
    stagePictures(c, dir)
    const t = await tools
    // a long take sped up for its beat: the footage itself is sped up, and the beat wears the 8× chip
    let fast = 0
    for (const sc of scenes) if (sc.kind === 'clip' && sc.speed > 1) {
      const f = c.clips.find(x => x.n === sc.clip)
      const name = `c${sc.clip}x${sc.speed}-${fast++}.mp4`
      try {
        await new Promise((ok, fail) => execFile(t.ffmpeg, ['-y', '-v', 'error', '-ss', String(sc.from || 0), '-i', f.file, '-t', String(Math.min(60, (sc.seconds + 0.5) * sc.speed)), '-an', '-vf', `setpts=PTS/${sc.speed},fps=30`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', join(dir, name)], { env: { ...process.env, PATH: t.path } }, err => (err ? fail(err) : ok())))
        sc.speedName = name
      } catch { sc.speed = 1 }
    }
    // the voice only when the film wants narration, or the person picked a voice
    const preset = motionPreset(c.theme)
    let voices = []
    const picked = VOICES[input.voice] || (/^[a-z][fm]_[a-z]+$/.test(input.voice || '') ? input.voice : null)
    if (input.voice !== 'off' && (scenes.voice || picked) && scenes.some(s => s.say)) {
      try {
        const cast = scenes.cast || {}, narrator = picked || cast.narrator || VOICES[preset]
        voices = await speak({ dataDir, dir, lines: scenes.map(s => s.say || ''), voice: narrator, voices: picked ? [] : scenes.map(s => (s.who === 'second' && cast.second) || narrator), onStage: stage => progress(1, stage) })
      } catch (err) {
        send('video:note', { message: `no voiceover this time: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
      }
    }
    const lengths = scenes.map((s, i) => Number(Math.max(s.seconds || 2, voices[i]?.seconds ? voices[i].seconds + 0.6 : 0).toFixed(3)))
    const comp = composition(scenes, c, lengths, transition)
    // the tall cut for phones: the same storyboard, look and timing, laid out again for a 9:16 frame
    const tallComp = composition(scenes, c, lengths, transition, comp.look, { shape: 'tall' })
    const tallDir = join(dir, 'tall')
    mkdirSync(tallDir, { recursive: true })
    stagePictures(c, tallDir)
    for (const sc of scenes) if (sc.speedName) copyFileSync(join(dir, sc.speedName), join(tallDir, sc.speedName))
    writeFileSync(join(dir, 'index.html'), comp.html)
    writeFileSync(join(tallDir, 'index.html'), tallComp.html)
    const files = { wide: SHAPES.wide.file, tall: SHAPES.tall.file }
    const cues = cueSheet(scenes, lengths)
    writeFileSync(join(dir, 'storyboard.json'), JSON.stringify({ prompt, template: template || null, title: scenes.title, pace: scenes.pace, plan: scenes.plan, seed, look: comp.look, cast: scenes.cast, voice: scenes.voice, music: scenes.music, cues, fx: scenes.fx, notes, fixes: scenes.fixes, files, lengths, scenes }, null, 2))
    // the stills and motion lines for Flow (Veo): the flow-video skill animates them into <run>/flow/<still>.mp4,
    // and the next cut plays those clips instead of the stills
    writeFileSync(join(dir, 'flow-prompts.json'), JSON.stringify(scenes.filter(s => s.layer === 'story' && s.image).map(s => { const f = c.images.find(x => x.n === s.image); return { still: f.file, clip: join(runsDir, id, 'flow', `${basename(f.file).replace(/\.[^.]+$/, '')}.mp4`), camera: s.camera, seconds: s.seconds, action: `${(s.camera || 'slow push-in').replace('-', ' ')}, one continuous shot, small motions only, nothing appears or changes shape` } }), null, 2))
    progress(2, 'rendering')
    const quality = ['draft', 'standard', 'high'].includes(input.quality) ? input.quality : 'draft'
    const silent = join(dir, 'promo-silent.mp4'), out = join(dir, SHAPES.wide.file)
    const tallSilent = join(dir, 'promo-tall-silent.mp4'), tallOut = join(dir, SHAPES.tall.file)
    rmSync(tallOut, { force: true }) // an older tall cut never sits beside a newer wide one
    await render({ tools: t, dir, out: silent, quality, onProgress: (pct, code) => progress(Math.max(2, Math.min(64, pct * 0.64)), code === 'assemble' ? 'assembling' : 'rendering') })
    let tall = true
    try {
      await render({ tools: t, dir: tallDir, out: tallSilent, quality, onProgress: (pct, code) => progress(Math.max(64, Math.min(96, 64 + pct * 0.32)), code === 'assemble' ? 'assembling the phone cut' : 'rendering the phone cut') })
    } catch (err) {
      tall = false
      send('video:note', { message: `no phone cut this time: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
    }
    // the score to the storyboard's cue sheet: ElevenLabs when the studio has a key, else written here
    progress(97, 'scoring')
    let sound = false, scoredBy = null
    try {
      let musicFile = null, fx = []
      if (input.music !== false) {
        // Hermes's secret, else Hermes's ElevenLabs connector, else a pasted key
        const key = process.env.SWARM_ELEVENLABS_KEY || mediaKeyStore.get('elevenlabs')
        const via = media?.music.via
        if (input.eleven !== false && (key || via === 'hermes-mcp')) {
          try {
            progress(97, 'ElevenLabs is scoring the film')
            const e = via === 'hermes-mcp' && !process.env.SWARM_ELEVENLABS_KEY
              ? await mcpScore({ call: connectors.call, server: media.music.server, music: scenes.music, cues, seconds: comp.seconds, dir })
              : await elevenScore({ key, music: scenes.music, cues, seconds: comp.seconds, dir })
            musicFile = e.music; fx = e.sfx; scoredBy = 'elevenlabs'
          } catch (err) { send('video:note', { message: `ElevenLabs did not score it, so the studio did: ${String(err.message || err).slice(0, 100)}` }) }
        }
        if (!musicFile) { musicFile = join(dir, 'music.wav'); scoreWav({ seconds: comp.seconds, music: scenes.music, cues, file: musicFile, seed }); scoredBy = 'studio' }
      }
      progress(98, 'mixing the sound')
      sound = await mix({ ffmpeg: t.ffmpeg, env: { ...process.env, PATH: t.path }, video: silent, musicFile, voices: voices.map((v, i) => v && { ...v, at: (cues.cuts[i - 1] || 0) + VOICE_LEAD }), fx, silence: cues.silence, out })
    } catch (err) {
      send('video:note', { message: `sound failed, the video is silent: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
    }
    if (!sound) copyFileSync(silent, out)
    // the phone cut takes the wide cut's finished sound as it is (same scenes, same timing)
    if (tall) {
      try {
        if (sound) await new Promise((ok, fail) => execFile(t.ffmpeg, ['-y', '-v', 'error', '-i', tallSilent, '-i', out, '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-shortest', '-movflags', '+faststart', tallOut], { env: { ...process.env, PATH: t.path } }, err => (err ? fail(err) : ok())))
        else copyFileSync(tallSilent, tallOut)
      } catch (err) {
        copyFileSync(tallSilent, tallOut)
        send('video:note', { message: `the phone cut is silent: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
      }
    }
    const copy = shelveVideo(id)
    shelveVideo(id, 'tall')
    const v = Date.now()
    const tallSrc = tall ? `/video/${id}/${SHAPES.tall.file}?v=${v}` : null
    Object.assign(job, { state: 'done', pct: 100, src: `/video/${id}/promo.mp4?v=${v}`, tall: tallSrc, file: copy || out, tallFile: tall ? tallOut : null, seconds: comp.seconds })
    send('video:done', { src: job.src, tall: tallSrc, file: copy || out, saved: out, savedTall: tall ? tallOut : null, files: tall ? files : { wide: files.wide }, seconds: comp.seconds, ms: Date.now() - job.t, voice: voices.some(Boolean), music: input.music !== false && sound, scoredBy })
  })().catch(err => {
    Object.assign(job, { state: 'failed', message: String(err.message || err).slice(0, 300) })
    send('video:failed', { message: job.message })
  })
  return job
}

// ---------- the App tab's jobs, loaded the first time someone uses it
let appsP = null
const apps = () => (appsP ||= import('../engine/appjob.mjs').then(m => (appsNow = m.appJobs({ runsDir, record, broadcast, readEvents, provider, modelFor, paint: paintGame, fill: fillApp }))))

// ---------- ⚡ Auto mode: one prompt → design, review, video, app, games, credit shop, data, deploy
// sign-in connectors through Hermes (Supabase): no keys to paste
const connectors = hermesConnectors({ py: PY, pyEnv, broadcast })

// The Film studio's outside services (engine/media.mjs): what Hermes already has, else a
// pasted key, else the built-in path. The canvas learns where each comes from, never a key.
async function mediaNow() {
  const [images, videos, mcp] = await Promise.all([
    loadImageProviders(), loadVideoProviders(),
    Promise.all(ELEVEN_MCP.map(n => connectors.status(n).then(st => [n, st], () => [n, {}]))).then(Object.fromEntries),
  ])
  return mediaSources({ env: process.env, keys: mediaKeyStore, mcp, images, videos, imagePick: picks.image })
}
const auto = autoJob({ runsDir, startRun, current: () => current, readEvents, record, broadcast, clients, makeVideo, videos, apps, credentials, dataDir, publishVercel, connectors,
  writeLaunch: id => writeLaunch(join(runsDir, id), readEvents(id), id) })

// ---------- the Auto show (spec 07): the summary card's numbers, the launch kit, chatter lines

// Files and lines the app engine wrote: the app's own source, without dependencies or builds.
function appStats(id) {
  const dir = join(runsDir, id, 'app')
  if (!existsSync(dir)) return { files: 0, lines: 0 }
  let files = 0, lines = 0
  const walk = (d, depth = 0) => {
    if (depth > 8) return
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (/^(node_modules|\.git|dist|\.output|\.vercel|\.engine|\.nitro|\.cache|public)$/.test(f.name)) continue
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p, depth + 1)
      else if (/\.(tsx?|jsx?|mjs|css|html|vue|svelte)$/.test(f.name) && !/\.d\.ts$/.test(f.name)) {
        try { const st = statSync(p); if (st.size > 400000) continue; files++; lines += readFileSync(p, 'utf8').split('\n').length } catch {}
      }
    }
  }
  walk(dir)
  return { files, lines }
}

// Messaging targets Hermes's gateway can send to (Discord, Slack, Telegram), from
// `hermes send --list`. Read-only; cached a minute.
const HERMES_BIN = [join(homedir(), '.local', 'bin', 'hermes'), 'hermes'].find(p => p === 'hermes' || existsSync(p))
const gateway = { at: 0, platforms: {} }
function gatewayTargets() {
  if (Date.now() - gateway.at < 60000) return Promise.resolve(gateway.platforms)
  return new Promise(ok => execFile(HERMES_BIN, ['send', '--list', '--json'], { timeout: 20000, maxBuffer: 1 << 20 }, (err, out) => {
    let platforms = {}
    try { platforms = JSON.parse(String(out)).platforms || {} } catch {}
    gateway.at = Date.now()
    gateway.platforms = Object.fromEntries(Object.entries(platforms).filter(([k]) => ['discord', 'slack', 'telegram'].includes(k)))
    ok(gateway.platforms)
  }))
}

// Occasional real words from the crew: a short fixed list, read by the studio's TTS (the
// Pro's TTS job through SWARM_TTS_URL, or Kokoro when the video tools already have it),
// pitched up in the browser, cached by text. Nothing is made for any other text.
const CHATTER_LINES = ['ship it!', 'looks good!', 'boss fight!', 'on it!', 'we did it!', 'nice!', 'Launch!', 'Good work, crew.', 'Next system!']
const chatterDir = join(dataDir, 'chatter')
const chatterBusy = new Set()
const chatterFile = (text, voice) => join(chatterDir, `${createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 16)}.wav`)
const chatterTts = () => !!process.env.SWARM_TTS_URL || existsSync(join(dataDir, 'video-tools', 'node_modules', 'kokoro-js'))
async function chatterMake(text, voice) {
  const file = chatterFile(text, voice)
  if (existsSync(file) || chatterBusy.has(file)) return
  chatterBusy.add(file)
  const dir = mkdtempSync(join(tmpdir(), 'swarm-chatter-'))
  try {
    const [r] = await speak({ dataDir, lines: [text], voice, dir })
    if (r?.file) { mkdirSync(chatterDir, { recursive: true }); copyFileSync(r.file, file) }
  } catch {} finally { chatterBusy.delete(file); try { rmSync(dir, { recursive: true, force: true }) } catch {} }
}

// ---------- game mode: answers → a spec → a new build whose app is the game
let gameP = null
const gameMod = () => (gameP ||= import('../engine/game.mjs'))
// stand-ins load lazily; the vision tagger is the reviewer model; Octo's public lane when the studio has a key
let standinP = null
const standinsOf = () => (standinP ||= (() => {
  const octoBase = (hermesKey('OCTO_BASE_URL') || 'https://octodb.design-bakery.com').replace(/\/+$/, '')
  const octoKey = hermesKey('OCTO_SWARM_WS'), pexelsKey = hermesKey('PEXELS_API_KEY'), lease = hermesKey('PEXELS_OCTO_LEASE')
  return standinsMake({ dataDir, runsDir, provider: () => provider('reviewer'), model: () => modelFor('reviewer'),
    octo: octoKey ? { baseUrl: octoBase, key: octoKey, workspaceId: hermesKey('OCTO_SWARM_WORKSPACE_ID') || '9aba6ef6-d196-412f-9344-0efb744b9c6c' } : null,
    pexels: pexelsKey ? { key: pexelsKey } : lease ? { key: lease, proxy: `${octoBase}/api/vault/proxy` } : null })
})())
// An app's empty picture slots get stand-in photos, copied into the app with their credit
async function fillApp(id, dir, step) {
  const { fillPictures } = await import('../engine/fillpics.mjs')
  const st = standinsOf()
  const bytesOf = async u => {
    const own = u.match(/^\/img\/([\w:.-]+)\/([\w.-]+)$/)
    if (own) { const f = join(runsDir, own[1], 'img', own[2]); return existsSync(f) ? readFileSync(f) : null }
    const si = u.match(/^\/standin\/([0-9a-f]{16}\.(jpg|png|webp))$/)
    if (si) { const f = st.file(si[1]); return f ? readFileSync(f) : null }
    if (!/^https:\/\//.test(u)) return null
    const r = await fetch(u, { headers: { 'user-agent': 'swarm-studio/1.0' }, signal: AbortSignal.timeout(20000) })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  }
  return fillPictures(dir, { pick: st.pick, bytesOf, run: id, step })
}
// A promo game for a build: the site's name, brief, theme, copy and links, so the
// game is set in the brand's world, wears its colours and points back to it.
function brandOf(id) {
  if (!id || !RUN_ID.test(String(id))) return null
  const events = readEvents(id)
  if (!events?.some(e => e.type === 'layer:done')) return null
  const c = collect(events, join(runsDir, id))
  const sites = events.filter(e => e.type === 'publish:done' && e.url && e.target !== 'local').map(e => e.url)
  const app = events.findLast(e => e.type === 'app:deployed')?.url
  return { from: id, name: c.brand, brief: c.brief, vars: c.theme.vars || {}, fonts: c.theme.fonts || {}, direction: c.theme.direction || '', copy: c.copy.slice(0, 1800), url: app || sites.at(-1) || null }
}

// A big game's art: portraits, boon icons, room backdrops and a title picture,
// through the same art director as a site's pictures, into the app's public/art/.
// Styled from the project's own art when it has a drawn style (a film-photo style
// suits a site, not a game's portraits: then the game's own look picks one).
function gameGuide(spec) {
  const site = spec.brand?.from && RUN_ID.test(spec.brand.from) && existsSync(join(runsDir, spec.brand.from)) ? guideFor(spec.brand.from) : null
  if (site && site.style !== 'photo') return site
  return art.styleGuide({ brief: `${spec.look || ''}. ${spec.setting || ''}. Hand-painted style` })
}
async function paintGame(runId, spec, items, appDir, step) {
  const choice = await imageChoice()
  if (!choice) { step({ kind: 'setup', text: 'no image model: the game draws its art in code', ok: false }); return [] }
  const guide = gameGuide(spec)
  step({ kind: 'setup', text: `painting in ${guide.name}` })
  mkdirSync(join(appDir, 'public', 'art'), { recursive: true })
  mkdirSync(join(runsDir, runId, 'img'), { recursive: true })
  const done = new Map(), queue = [...items]
  // a picture painted for this game before (a build stopped by a restart, a Try again)
  // is kept with the run: it is used again, not painted and paid for again
  const kept = (() => { try { return readdirSync(join(runsDir, runId, 'img')).filter(f => f.startsWith('game-')) } catch { return [] } })()
  for (const it of [...queue]) {
    const f = kept.find(k => k.replace(/\.[a-z]+$/i, '') === `game-${it.id}`)
    if (!f) continue
    const file = `art/${it.id}${extname(f)}`
    copyFileSync(join(runsDir, runId, 'img', f), join(appDir, 'public', file))
    done.set(it.id, { file, what: it.what, kind: it.kind })
    queue.splice(queue.indexOf(it), 1)
  }
  if (done.size) step({ kind: 'setup', text: `using ${done.size} pictures painted before; painting ${queue.length}` })
  const worker = async () => {
    for (let it; (it = queue.shift());) {
      const r = await paintArt(choice, guide, { gen: it.gen, aspect: it.aspect, hero: it.kind === 'title', cutout: !!it.cutout }).catch(err => ({ ok: false, error: String(err.message || err) }))
      if (!r.ok || !r.path || !existsSync(r.path)) { step({ kind: 'setup', text: `could not paint the ${it.what}: ${String(r.error || 'no image').slice(0, 120)}`, ok: false }); continue }
      // a sprite is painted on a flat colour: cut it out to a transparent PNG
      if (it.cutout) {
        const cut = join(dirname(r.path), `${it.id}-cut.png`)
        const c = await new Promise(ok => execFile(process.platform === 'win32' ? 'python' : 'python3', [join(root, 'scripts', 'cutout.py'), r.path, cut], { timeout: 60000 }, (err, out, errOut) => ok({ ok: !err, why: String(errOut || err?.message || '').trim() })))
        if (!c.ok || !existsSync(cut)) { step({ kind: 'setup', text: `could not cut out the ${it.what}: ${c.why.split('\n').pop().slice(0, 120)}`, ok: false }); continue }
        r.path = cut
      }
      const file = `art/${it.id}${extname(r.path) || '.png'}`
      copyFileSync(r.path, join(appDir, 'public', file))
      // the Studio keeps a copy with the run, so its art shows beside the game
      copyFileSync(r.path, join(runsDir, runId, 'img', file.replace('art/', 'game-')))
      done.set(it.id, { file, what: it.what, kind: it.kind })
      step({ kind: 'setup', text: `painted the ${it.what}` })
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return items.map(i => done.get(i.id)).filter(Boolean)
}

// a glTF binary (glb, magic "glTF") or a glTF JSON file
function isGltf(file) {
  try {
    const fd = openSync(file, 'r'), b = Buffer.alloc(4)
    try { readSync(fd, b, 0, 4, 0) } finally { closeSync(fd) }
    return /\.glb$/i.test(file) ? b.toString('latin1') === 'glTF' : b.toString('latin1').trimStart().startsWith('{')
  } catch { return false }
}

async function startGame(spec) {
  const g = await gameMod()
  if (!spec?.title || !spec?.loop) throw new Error('no game spec')
  if (spec.models) spec = { ...spec, models: g.gameModels(spec).filter(m => isGltf(join(dataDir, 'models', m.file))) }
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(runsDir, id)
  mkdirSync(dir, { recursive: true })
  const t = Date.now()
  const brief = `${spec.title}: ${spec.pitch || ''}`.slice(0, 400)
  writeFileSync(join(dir, 'events.jsonl'), [
    { type: 'run:start', t, run: id, brief, kind: 'game', title: String(spec.title).slice(0, 80), workerModel: modelFor('worker'), ...(spec.brand?.from ? { from: spec.brand.from, fromName: spec.brand.name } : {}) },
    { type: 'game:spec', t, run: id, spec }
  ].map(e => JSON.stringify(e)).join('\n') + '\n')
  // the spec's 3D models, from the model library (<data>/models/): only real glTF files that are there
  const lib = join(dataDir, 'models')
  const models = g.gameModels(spec)
  const copy = Object.fromEntries(models.map(m => [`public/models/${m.file}`, join(lib, m.file)]))
  const a = await apps()
  await a.start(id, { kind: 'game', fresh: true, title: spec.title, prompt: g.gamePrompt(spec), files: { 'GAME_SPEC.md': g.specMarkdown(spec) }, copy })
  // the site remembers its game, so each can open the other
  if (spec.brand?.from && existsSync(join(runsDir, spec.brand.from))) record(spec.brand.from, { type: 'game:linked', t, run: spec.brand.from, game: id, title: String(spec.title).slice(0, 80) })
  broadcast({ type: 'files:changed', t, run: id })
  return { run: id }
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
      // said out loud, never swapped for the local link: the person asked for a public one
      Object.assign(job, { state: 'failed', message: String(err.message || err).slice(0, 300) })
      send('publish:failed', { target, message: job.message, ms: Date.now() - job.t })
    })
  return job
}

// A builder rewrites one finished section live: it is cleared on every canvas,
// streams back in, and on failure the old section returns.
async function rework(runId, send, s, agent, theme, args) {
  const layer = s.key.split('/').pop(), page = s.key.split('/')[0], t0 = Date.now()
  send('agent:assign', { agent, page, layer, role: s.role, fixing: true })
  send('layer:reset', { page, layer, agent })
  // with an image model, a rewrite may add a photo ("add a picture of…"), painted once it is done
  const choice = await imageChoice().catch(() => null)
  return traced({ agent, page, layer }, () => fixSection({ provider: provider('worker'), model: modelFor('worker'), theme, html: s.html, role: s.role || layer, images: !!choice, ...args,
    onDelta: d => send('layer:delta', { page, layer, agent, text: d }) }))
    .then(html => { send('layer:done', { page, layer, agent, ms: Date.now() - t0, html, fixed: true }); if (choice) paintNew(runId, send, page, layer, html, choice) })
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
const comment = (id, input) => withTrace(id, () => commentNow(id, input))
async function commentNow(id, input) {
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
    rework(id, send, s, agent, theme, { comment: text })
  })
  return { sections: keys, reply }
}

function tokenOk(given) {
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

const webVersion = () => pageVersion(webDir)
const canvasPage = () => sharedCanvasPage(webDir, { token })

function sendFile(res, file) {
  if (!existsSync(file)) {
    res.writeHead(404).end('not found')
    return
  }
  // fonts are fetched in CORS mode, and the Desktop pane's frame has an opaque origin
  // fonts and the vendored three.js (a module import) are fetched in CORS mode
  const cors = extname(file) === '.woff2' || file.startsWith(join(webDir, 'vendor')) ? { 'access-control-allow-origin': '*', 'cache-control': 'max-age=86400' } : { 'cache-control': 'no-store' }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', ...cors })
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

  // the Swarm Wall: 2–4 runs side by side (docs/specs/09-demo-modes.md)
  if (url.pathname === '/wall') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(readFileSync(join(webDir, 'wall.html'), 'utf8').replace('__SWARM_TOKEN__', () => JSON.stringify(token).replace(/</g, '\\u003c')))
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
      delete input.base
      delete input.ask
      if (!input.brief) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'brief required' }))
        return
      }
      // a message inside an open build belongs to that build's project
      if (typeof input.from === 'string' && typeof input.project !== 'string' && RUN_ID.test(input.from)) input.project = projects.projectOf(input.from) || undefined
      // inside a project, the owner's uploaded pictures go to the crew: builders may place them as they are,
      // and the art director matches the new pictures to them (art.styleGuide reads the brief)
      if (typeof input.project === 'string') {
        const ups = projects.uploadsOf(input.project).filter(u => /^image\//.test(u.type)).slice(0, 12)
        if (ups.length) input.brief = `${String(input.brief).trim()}\n\nThe owner uploaded these pictures. Use them where they fit, as they are (<img src="…">, no data-gen), and make every new picture match their look:\n${ups.map(u => `- ${u.name}: ${u.src}`).join('\n')}`
      }
      // A message inside an open build (from: its run) is that project's next version: the
      // last version is kept as it stands and the crew adds only what the message asks for
      const from = typeof input.from === 'string' && RUN_ID.test(input.from) ? input.from : null
      const base = from ? extendBase(readEvents(from), (() => { try { return JSON.parse(readFileSync(join(runsDir, from, 'plan.json'), 'utf8')) } catch { return null } })()) : null
      if (base) {
        input.ask = String(input.brief).trim()
        input.brief = `${base.brief}\n\nFor this version: ${input.ask}`
        input.base = base
      }
      const pid = typeof input.project === 'string' ? input.project : null
      const run = startRun(input)
      // "Tell the crew…" inside a project: the new run is that project's next version
      if (pid) projects.claim(run.id, pid)
      broadcast({ type: 'reset', run: run.id })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ run: run.id, ...(base ? { extend: true, from } : {}) }))
    })
    return
  }

  if (url.pathname === '/api/runs') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(listRuns()))
    return
  }

  if (url.pathname === '/api/folders') {
    if (req.method !== 'POST') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ folders: folderList() })); return }
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(folderOp(input)))
    })
    return
  }

  // ---------- Projects (the file browser): list, and rename / move / trash / restore / duplicate / purge / empty
  const json = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const readJson = (max, fn) => {
    let body = ''
    req.on('data', c => { body += c; if (body.length > max) req.destroy() })
    req.on('end', () => { let input = {}; try { input = JSON.parse(body || '{}') } catch {} try { fn(input) } catch (err) { json(400, { error: String(err.message || err) }) } })
  }
  if (url.pathname === '/api/projects') {
    if (req.method !== 'POST') return json(200, projects.list())
    return readJson(1e5, input => json(200, projects.op(input)))
  }
  // Post to Feed from the canvas, and Connect Hermes when it is not connected yet.
  // feed.py does the work in Hermes's Python, so the feed token never reaches this server.
  const feedPost = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/feed$/)
  if ((feedPost || url.pathname === '/api/feed/connect') && req.method === 'POST') {
    return readJson(1e4, input => {
      const call = feedPost ? `post_json(${JSON.stringify(feedPost[1])}, ${input.unlisted ? 'True' : 'False'})` : 'connect_json()'
      pyCommand(call, 180000).then(out => json(200, out))
    })
  }
  if (url.pathname === '/api/me') {
    let feed = {}
    try { feed = JSON.parse(readFileSync(join(dataDir, 'feed.json'), 'utf8')) } catch {}
    let name = feed.name || feed.handle || ''
    if (!name) { try { name = userInfo().username } catch {} }
    return json(200, { name: String(name).slice(0, 40), handle: feed.handle || null, feed: (process.env.SWARM_FEED_URL || 'https://swarm.design-bakery.com').replace(/\/$/, '') })
  }
  // every picture, film and upload across live projects, newest first (Home › Assets)
  if (url.pathname === '/api/assets') {
    const out = []
    for (const p of projects.list().projects.filter(x => !x.trashed)) {
      for (const v of [...p.versions, ...Object.keys(p.parts || {}).map(id => ({ id, updated: runCard(id)?.updated }))]) {
        const events = readEvents(v.id) || []
        const pageTitle = Object.fromEntries(events.filter(e => e.type === 'page').map(e => [e.id, e.title]))
        for (const e of events.filter(e => e.type === 'image' && e.src)) out.push({ project: p.id, run: v.id, kind: 'art', name: pieceName(e, pageTitle), page: pageTitle[e.page] || null, src: e.src, t: e.t })
        if (existsSync(join(runsDir, v.id, 'video', 'promo.mp4'))) out.push({ project: p.id, run: v.id, kind: 'film', name: 'Promo film', src: `/video/${v.id}/promo.mp4`, poster: existsSync(join(runsDir, v.id, 'video', 'p1.webp')) ? `/video/${v.id}/live/p1.webp` : null, t: v.updated })
      }
      for (const u of projects.uploadsOf(p.id)) out.push({ project: p.id, kind: 'upload', name: u.name, src: u.src, type: u.type, t: u.t })
    }
    return json(200, { assets: out.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 600) })
  }
  const projOne = url.pathname.match(/^\/api\/projects\/([\w-]{1,64})(?:\/(upload|files|reveal))?$/)
  if (projOne) {
    const pid = projOne[1], what = projOne[2]
    if (!what) { const p = projects.get(pid); return p ? json(200, { ...p, files: projects.uploadsOf(pid) }) : json(404, { error: 'no such project' }) }
    if (what === 'upload' && req.method === 'POST') {
      const chunks = []
      let n = 0
      req.on('data', c => { n += c.length; if (n > 200e6) { req.destroy(); return } chunks.push(c) })
      req.on('end', () => { try { json(200, projects.saveUpload(pid, url.searchParams.get('name'), Buffer.concat(chunks), url.searchParams.get('replace') === '1')) } catch (err) { json(400, { error: String(err.message || err) }) } })
      return
    }
    if (what === 'files' && req.method === 'POST') return readJson(4000, input => json(200, { ...projects.uploadOp(pid, input), files: projects.uploadsOf(pid) }))
    if (what === 'files') return json(200, { files: projects.uploadsOf(pid) })
    if (what === 'reveal' && req.method === 'POST') {
      return readJson(4000, input => {
        const f = input.name ? projects.uploadFile(pid, input.name)?.file : null
        const p = projects.get(pid)
        const what = f || (input.run && /^[\w-]{1,64}$/.test(input.run) ? join(runsDir, input.run) : p ? join(runsDir, p.head) : null)
        if (!what || !existsSync(what)) return json(404, { error: 'not found' })
        const [cmd, args] = process.platform === 'darwin' ? ['open', ['-R', what]] : process.platform === 'win32' ? ['explorer', [`/select,${what}`]] : ['xdg-open', [dirname(what)]]
        execFile(cmd, args, () => {})
        json(200, { path: what })
      })
    }
  }

  // Put a run in a folder (or take it out with an empty name).
  // A project's canvas: everything one build made, grouped the way the Files panel shows it
  const runBoard = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/board$/)
  if (runBoard && req.method === 'GET') {
    const id = runBoard[1], events = readEvents(id)
    if (!events) return json(404, { error: 'no such build' })
    const b = boardOf(id, events, runsDir, current?.id === id && !current.done)
    // the game made from this site lives in its own run: it shows here, as part of this version
    const linked = events.findLast(e => e.type === 'game:linked' && e.game)
    if (!b.game && linked && RUN_ID.test(linked.game)) {
      const gev = readEvents(linked.game)
      if (gev) {
        const g = boardOf(linked.game, gev, runsDir, false)
        const work = workOf(linked.game)
        b.game = { ...(g.game || { title: linked.title || 'Game', cover: null }), run: linked.game, work }
        // no title screen yet: the site's key art stands in
        if (!b.game.cover) b.game.cover = b.pages.find(p => p.cover)?.cover || b.art?.[0]?.src || null
        if (work) b.busy = true
      }
    }
    b.work = workOf(id) || b.game?.work || null
    return json(200, b)
  }
  // a build's own pictures and models, and the ones still to come (the code wall's asset pane)
  const runAssets = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/assets$/)
  if (runAssets && req.method === 'GET') {
    const id = runAssets[1], events = readEvents(id)
    if (!events) return json(404, { error: 'no such build' })
    const spec = events.findLast(e => e.type === 'game:spec')?.spec
    gameMod().then(g => spec ? g.artList(spec) : []).catch(() => []).then(plan => json(200, listAssets({ id, events, files: assetFiles(join(runsDir, id)), plan, pieceName })))
    return
  }
  // what the crew are working on right now, across projects: the Studio's queue
  if (url.pathname === '/api/work' && req.method === 'GET') {
    const jobs = []
    for (const p of projects.list().projects.filter(x => !x.trashed)) {
      for (const id of [...p.versions.map(v => v.id), ...Object.keys(p.parts || {})]) {
        const w = workOf(id)
        if (w) jobs.push({ project: p.id, head: (p.parts || {})[id] || id, run: id, title: p.title, cover: p.cover, ...w })
      }
    }
    // an app or game still building that no project lists yet counts too, so a restart never cuts it off
    for (const [id, a] of appsNow?.jobs || []) if (a.state === 'working' && !jobs.some(j => j.run === id)) jobs.push({ project: null, head: id, run: id, title: a.kind, cover: null, ...workOf(id) })
    return json(200, { jobs })
  }
  const runMetaPost = url.pathname.match(/^\/api\/runs\/([^/]+)\/meta$/)
  if (runMetaPost && req.method === 'POST' && RUN_ID.test(runMetaPost[1]) && existsSync(join(runsDir, runMetaPost[1]))) {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      // only the fields sent change; an empty value clears one
      const meta = runMeta(runMetaPost[1]), str = (v, n) => String(v || '').trim().slice(0, n) || null
      if ('folder' in input) meta.folder = str(input.folder, 40)
      if ('title' in input) meta.title = str(input.title, 80)
      if ('note' in input) meta.note = str(input.note, 2000)
      if ('trace' in input) meta.trace = input.trace !== false
      if ('order' in input) meta.order = Number.isFinite(input.order) ? input.order : null
      if ('folder' in input) { const pid = projects.projectOf(runMetaPost[1]); if (pid) projects.op({ op: 'move', id: pid, folder: meta.folder || '' }) }
      if ('tags' in input) meta.tags = [...new Set((Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',')).map(x => String(x).trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 12)
      writeFileSync(join(runsDir, runMetaPost[1], 'meta.json'), JSON.stringify(meta))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(meta))
    })
    return
  }

  // Show a run's folder (or its video) in Finder / the file manager.
  const runReveal = url.pathname.match(/^\/api\/runs\/([^/]+)\/reveal$/)
  if (runReveal && req.method === 'POST' && RUN_ID.test(runReveal[1])) {
    const dir = join(runsDir, runReveal[1]), vid = join(dir, 'video', 'promo.mp4')
    const what = url.searchParams.get('what') === 'video' && existsSync(vid) ? shelveVideo(runReveal[1]) || vid : dir
    if (!existsSync(what)) { res.writeHead(404).end(); return }
    const [cmd, args] = process.platform === 'darwin' ? ['open', ['-R', what]] : process.platform === 'win32' ? ['explorer', [`/select,${what}`]] : ['xdg-open', [dirname(what)]]
    execFile(cmd, args, () => {})
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ path: what }))
    return
  }

  // Every saved cut of a run's video, oldest first.
  const runCuts = url.pathname.match(/^\/api\/runs\/([^/]+)\/cuts$/)
  if (runCuts && RUN_ID.test(runCuts[1])) {
    const dir = shelf(runCuts[1], 'video').dir
    let names = []
    try { names = readdirSync(dir).filter(n => /^[a-z0-9-]{1,60}-promo-v\d{1,4}\.mp4$/.test(n)) } catch {}
    const v = n => Number(n.match(/-v(\d+)\.mp4$/)[1])
    const cuts = names.sort((a, b) => v(a) - v(b)).map(name => ({ name, file: join(dir, name) }))
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ cuts }))
    return
  }

  // The model calls of a run: a light list, filtered by page, layer, agent or kind,
  // or one call in full (?call=<id>) with the messages sent and the raw answer.
  const runTrace = url.pathname.match(/^\/api\/runs\/([^/]+)\/trace$/)
  if (runTrace && RUN_ID.test(runTrace[1])) {
    const dir = join(runsDir, runTrace[1]), q = url.searchParams
    if (!existsSync(dir)) { res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no such run' })); return }
    const one = q.get('call')
    let calls = readTrace(dir, { full: !!one })
    if (one) {
      const c = calls.find(x => x.id === one)
      res.writeHead(c ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(c || { error: 'no such call' }))
      return
    }
    for (const k of ['page', 'layer', 'agent', 'kind']) if (q.get(k)) calls = calls.filter(c => c[k] === q.get(k))
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ on: runMeta(runTrace[1]).trace !== false, calls }))
    return
  }

  // Put a section back as an earlier version had it (undo, redo, Versions). Saved
  // as the section's latest finished state, so it replays when the file reopens.
  const runRestore = url.pathname.match(/^\/api\/runs\/([^/]+)\/restore$/)
  if (runRestore && req.method === 'POST' && RUN_ID.test(runRestore[1])) {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const events = readEvents(runRestore[1])
      const ok = events && typeof input.html === 'string' && input.html.length < 300000 && events.some(e => e.type === 'layer:done' && e.page === input.page && e.layer === input.layer)
      if (!ok) { res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no such section' })); return }
      record(runRestore[1], { type: 'layer:done', t: Date.now(), run: runRestore[1], page: input.page, layer: input.layer, html: input.html, fixed: true, restored: true, by: safe(input.by, 24) ? input.by : undefined, why: String(input.why || '').slice(0, 40) || undefined })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
    })
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
  // a style reference for the film (an image, a video or a piece of music), kept in the run's video/refs
  const runRef = url.pathname.match(/^\/api\/runs\/([^/]+)\/video\/ref$/)
  if (runRef && req.method === 'POST' && RUN_ID.test(runRef[1])) {
    const name = safeName(url.searchParams.get('name') || 'reference')
    if (!/\.(png|jpe?g|webp|gif|avif|mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"an image, a video or a sound file"}')
    const chunks = []
    let n = 0
    req.on('data', ch => { n += ch.length; if (n > 300e6) { req.destroy(); return } chunks.push(ch) })
    req.on('end', () => {
      writeFileSync(join(refDir(join(runsDir, runRef[1])), name), Buffer.concat(chunks))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name, kind: kindOf({ file: name }) }))
    })
    return
  }
  if (runVideo && RUN_ID.test(runVideo[1])) {
    const id = runVideo[1]
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method !== 'POST') {
      const file = join(runsDir, id, 'video', 'promo.mp4')
      const tallFile = join(runsDir, id, 'video', SHAPES.tall.file)
      return reply(200, videos.get(id) || (existsSync(file) ? { state: 'done', pct: 100, file: shelveVideo(id) || file, src: `/video/${id}/promo.mp4?v=${statSync(file).mtimeMs | 0}`, tall: existsSync(tallFile) ? `/video/${id}/${SHAPES.tall.file}?v=${statSync(tallFile).mtimeMs | 0}` : null } : { state: 'none' }))
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

  // a new picture for one <img data-gen> in a finished section
  const runImage = url.pathname.match(/^\/api\/runs\/([^/]+)\/image$/)
  if (runImage && req.method === 'POST' && RUN_ID.test(runImage[1])) {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy() })
    req.on('end', async () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const id = runImage[1], str = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)
      const job = { page: str(input.page, 80), layer: str(input.layer, 120), gen: str(input.gen, 300), prompt: str(input.prompt, 400) }
      const choice = await imageChoice().catch(() => null)
      const fail = (code, error) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify({ error }))
      if (!readEvents(id)) return fail(404, 'no such build')
      if (!job.page || !job.layer || !job.gen) return fail(400, 'which picture?')
      if (!choice) return fail(400, 'no image model: pick one in ☰ More → Models (your Codex login works)')
      paintOne((type, data) => record(id, { type, t: Date.now(), run: id, ...data }), id, job, choice)
      res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, provider: choice.provider }))
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
      // what is live for this build, by host, from its saved events: it survives a restart
      const events = readEvents(id) || [], live = {}
      for (const e of events) if (e.type === 'publish:done' && e.url) live[e.target] = e.url
      const last = events.filter(e => e.type === 'publish:done' || e.type === 'publish:failed').pop()
      return reply(200, { ...(publishes.get(id) || (last ? { state: last.type === 'publish:failed' ? 'failed' : 'done', ...last } : { state: 'none' })), live })
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

  // ⚡ Auto mode: GET its timeline, POST { prompt } to start, /stop to stop
  // The Film studio's services: GET where each comes from; POST /key {service, key|null}
  // to paste (or forget) a key; POST /allow to let the studio use Hermes's ElevenLabs connector.
  if (url.pathname === '/api/media' && req.method === 'GET') {
    mediaNow().then(m => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(m)), err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }
  if ((url.pathname === '/api/media/key' || url.pathname === '/api/media/allow') && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      const done = () => { imageProviders = null; videoProviders = null; return mediaNow().then(m => reply(200, m)) }
      if (url.pathname === '/api/media/allow') {
        const name = ELEVEN_MCP.includes(input.name) ? input.name : null
        if (!name) return reply(400, { error: 'unknown connector' })
        return connectors.allow(name).then(done).catch(err => reply(400, { error: String(err.message || err) }))
      }
      if (!MEDIA_KEYS[input.service]) return reply(400, { error: 'unknown service' })
      mediaKeyStore.set(input.service, typeof input.key === 'string' ? input.key : null).then(done).catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }
  // Hermes sign-in connectors: GET their state, POST {name} to connect (or to cancel a sign-in)
  if (url.pathname === '/api/connectors' || url.pathname === '/api/connectors/connect' || url.pathname === '/api/connectors/cancel') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method === 'GET') { connectors.list().then(all => reply(200, all), err => reply(500, { error: String(err.message || err) })); return }
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const name = String(input.name || '')
      if (url.pathname === '/api/connectors/cancel') { connectors.cancel(name); return reply(200, { ok: true }) }
      connectors.connect(name).then(s => reply(200, s), err => reply(400, { error: String(err.message || err) }))
    })
    return
  }
  // Pro packs (docs/specs/09-demo-modes.md): what the Auto window's Pro side lists
  if (url.pathname === '/api/packs' && req.method === 'GET') {
    import('../engine/packs.mjs').then(m => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ packs: m.listPacks().map(m.packSummary) })))
      .catch(err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }

  if (url.pathname === '/api/auto' || url.pathname === '/api/auto/stop') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method === 'GET') return reply(200, auto.state() || { state: 'idle' })
    if (url.pathname === '/api/auto/stop') return reply(200, auto.stop() || { state: 'idle' })
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      try { reply(200, auto.start(input)) } catch (err) { reply(400, { error: String(err.message || err) }) }
    })
    return
  }

  // Game mode: GET the questions, POST /spec { idea, answers } for the spec card,
  // POST { spec } to build it (a new build, opened in the App view).
  // A snapshot of a build's first page, sent by the canvas, becomes its cover when it has no picture.
  const snapRoute = req.method === 'POST' && url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/snap$/)
  if (snapRoute) {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    const id = snapRoute[1]
    if (!RUN_ID.test(id) || !existsSync(join(runsDir, id, 'events.jsonl'))) return reply(404, { error: 'no such build' })
    let body = ''
    req.on('data', c => { body += c; if (body.length > 3e6) req.destroy() })
    req.on('end', () => {
      try {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(JSON.parse(body || '{}').image || '')
        if (!m) return reply(400, { error: 'send a JPEG data URL' })
        mkdirSync(join(runsDir, id, 'img'), { recursive: true })
        writeFileSync(join(runsDir, id, 'img', 'snap.jpg'), Buffer.from(m[1], 'base64'))
        reply(200, { cover: snapOf(id) })
      } catch (err) { reply(400, { error: String(err.message || err) }) }
    })
    return
  }

  // The Make box's showcases and its "grill me" interview (engine/intake.mjs); a Game gets the game interview
  if (url.pathname === '/api/intake' && req.method === 'GET') {
    Promise.all([import('../engine/intake.mjs'), gameMod()])
      .then(([m, g]) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...m.intake(), game: g.QUESTIONS })))
      .catch(err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }

  if (url.pathname === '/api/game' || url.pathname === '/api/game/spec') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (req.method === 'GET') { gameMod().then(g => reply(200, { questions: g.QUESTIONS })).catch(err => reply(500, { error: String(err.message || err) })); return }
    let body = ''
    req.on('data', c => { body += c; if (body.length > 2e5) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const go = url.pathname === '/api/game/spec'
        ? gameMod().then(g => g.writeSpec({ provider: provider('planner'), model: modelFor('planner'), idea: String(input.idea || '').slice(0, 600), answers: typeof input.answers === 'object' && input.answers ? input.answers : {}, brand: brandOf(input.from), big: input.big === true, signal: AbortSignal.timeout(input.big ? 180000 : 90000) })).then(spec => ({ spec }))
        : startGame(input.spec)
      go.then(out => reply(200, out)).catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }

  // The App tab: the design (or a game spec) as a working app, built by dyad's
  // engine. GET the state, POST { ask } for the first build or one more change,
  // /files for the code, /open to start its dev server again, /stop.
  // The summary card's numbers: from the run's events, plus what the app engine wrote.
  const runShow = url.pathname.match(/^\/api\/runs\/([^/]+)\/show$/)
  if (runShow && RUN_ID.test(runShow[1])) {
    const events = readEvents(runShow[1])
    if (!events) return res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no such run' }))
    const f = runFacts(events, runShow[1])
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...f, ...appStats(runShow[1]), launch: !!readLaunch(join(runsDir, runShow[1])) }))
  }

  // The launch kit. GET reads it, POST writes it (again) from the run's facts, /mark logs
  // what the person did with a post, /send hands one confirmed post to Hermes's gateway.
  // Nothing is ever posted from here on its own: /send needs the person's confirm, the
  // exact text they saw, and a gateway connection for that platform.
  const runLaunch = url.pathname.match(/^\/api\/runs\/([^/]+)\/launch(?:\/(mark|send))?$/)
  if (runLaunch && RUN_ID.test(runLaunch[1])) {
    const [, id, sub] = runLaunch
    const dir = join(runsDir, id)
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    if (!existsSync(join(dir, 'events.jsonl'))) return reply(404, { error: 'no such run' })
    if (req.method === 'GET' && !sub) { const kit = readLaunch(dir); return kit ? reply(200, kit) : reply(404, { error: 'no launch kit yet' }) }
    if (req.method !== 'POST') return reply(405, { error: 'POST' })
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy() })
    req.on('end', async () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      try {
        if (!sub) return reply(200, writeLaunch(dir, readEvents(id), id))
        if (sub === 'mark') return reply(200, markLaunch(dir, input))
        // send: one post, one platform, confirmed by the person in the canvas's confirm box
        const kit = readLaunch(dir)
        const post = kit?.posts.find(p => p.id === input.post)
        if (!post || post.how !== 'gateway') return reply(400, { error: 'only Discord, Slack and Telegram posts go through the gateway' })
        if (input.confirm !== true) return reply(400, { error: 'a send needs the confirm' })
        if (String(input.text) !== post.text) return reply(409, { error: 'the text changed since you confirmed it; check it again' })
        const targets = await gatewayTargets()
        if (!targets[post.network]) return reply(409, { error: `Hermes's gateway has no ${post.label} connection` })
        const target = String(input.target || post.network)
        if (!new RegExp(`^${post.network}(:[\\w#.:@+-]{1,120})?$`).test(target)) return reply(400, { error: 'that is not a target on this platform' })
        const tmp = mkdtempSync(join(tmpdir(), 'swarm-launch-')), file = join(tmp, 'post.txt')
        writeFileSync(file, post.text)
        execFile(HERMES_BIN, ['send', '--to', target, '--file', file, '--json'], { timeout: 60000 }, (err, out, errOut) => {
          rmSync(tmp, { recursive: true, force: true })
          if (err) return reply(502, { error: String(errOut || err.message).split('\n').filter(Boolean).at(-1)?.slice(0, 300) || 'the send failed' })
          reply(200, markLaunch(dir, { post: post.id, action: 'sent', target }))
        })
      } catch (err) { reply(400, { error: String(err.message || err) }) }
    })
    return
  }

  if (url.pathname === '/api/gateway' && req.method === 'GET') {
    gatewayTargets().then(p => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ platforms: p })))
    return
  }

  // A crew line's audio: cached, or made in the background (the canvas babbles meanwhile).
  if (url.pathname === '/api/chatter/say' && req.method === 'GET') {
    const text = CHATTER_LINES.find(l => l === url.searchParams.get('text'))
    const voice = /^hermia$/i.test(url.searchParams.get('who') || '') ? 'af_heart' : 'af_sky'
    if (!text || !chatterTts()) return res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no voice for that' }))
    const file = chatterFile(text, voice)
    if (existsSync(file)) return res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'max-age=86400' }).end(readFileSync(file))
    chatterMake(text, voice)
    return res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ making: true }))
  }

  // The app advisor: POST { sections } for its questions (each with a recommended
  // answer), then { sections, qa: [{ q, a }] } for the app plan the engine builds from.
  const runAdvise = url.pathname.match(/^\/api\/runs\/([^/]+)\/advise$/)
  if (runAdvise && RUN_ID.test(runAdvise[1]) && req.method === 'POST') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    let body = ''
    req.on('data', c => { body += c; if (body.length > 4e6) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const events = readEvents(runAdvise[1])
      if (!events) return reply(404, { error: 'no such build' })
      const snap = snapshot(events, Array.isArray(input.sections) ? input.sections.slice(0, 80) : [])
      if (!snap.pages.some(p => p.sections.length)) return reply(400, { error: 'nothing designed yet' })
      const args = { provider: provider('planner'), model: modelFor('planner'), snap, signal: AbortSignal.timeout(90000) }
      import('../engine/advisor.mjs')
        .then(a => (Array.isArray(input.qa) ? a.writePlan({ ...args, qa: input.qa }).then(plan => ({ plan })) : a.questions(args)))
        .then(out => reply(200, out)).catch(err => reply(500, { error: String(err.message || err) }))
    })
    return
  }

  const runApp = url.pathname.match(/^\/api\/runs\/([^/]+)\/app(?:\/(files|stop|open|deploy))?$/)
  if (runApp && RUN_ID.test(runApp[1])) {
    const [, id, sub] = runApp
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    const fail = err => reply(400, { error: String(err.message || err) })
    if (req.method === 'GET') {
      apps().then(a => reply(200, sub === 'files' ? a.files(id, url.searchParams.get('path')) : a.state(id))).catch(fail)
      return
    }
    let body = ''
    req.on('data', c => { body += c; if (body.length > 8e6) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      apps().then(async a => {
        if (sub === 'stop') return a.stop(id)
        if (sub === 'open') return a.open(id)
        if (sub === 'deploy') {
          const creds = await credentials(dataDir, 'vercel')
          if (!creds) throw new Error(`connect Vercel first: 🌐 Publish on the canvas → Connect, or set ${PROVIDERS.vercel.env}`)
          return a.deploy(id, { creds, dataDir, publishVercel })
        }
        // Try again on a game that never built: build it again from its saved spec
        const spec = (readEvents(id) || []).findLast(e => e.type === 'game:spec')?.spec
        if (spec && !input.prompt && !a.state(id).hasApp) {
          const g = await gameMod()
          input = { kind: 'game', fresh: true, title: spec.title, prompt: g.gamePrompt(spec), files: { 'GAME_SPEC.md': g.specMarkdown(spec) } }
        }
        return a.start(id, input)
      }).then(s => reply(200, s)).catch(fail)
    })
    return
  }

  // An engine port (Godot, Unity, Unreal) the game job wrote to app/ports/<target>/, zipped on request
  const portZip = url.pathname.match(/^\/api\/runs\/([^/]+)\/port\/(godot|unity|unreal)\.zip$/)
  if (portZip && RUN_ID.test(portZip[1])) {
    const [, id, target] = portZip, base = join(runsDir, id, 'app', 'ports')
    if (!existsSync(join(base, target))) return res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no port yet' }))
    const name = `${fileSlug(id)}-${target}.zip`, out = join(base, name)
    execFile('zip', ['-qr', name, target], { cwd: base }, err => {
      if (err) return res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'could not zip the project' }))
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${name}"` })
      createReadStream(out).pipe(res)
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
          const copy = shelveExport(id, out.zip)
          record(id, { type: 'export', t: Date.now(), run: id, dir: out.dir, zip: out.zip, copy, pages: out.pages, sections: out.sections })
          reply(200, { ...out, copy })
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
  // Stand-in pictures: a matching photo for a slot while its real picture is painted.
  // GET /api/standin?q=<the picture's prompt>&w=&h=&run= -> { url, publicUrl, credit, tags, source } or null.
  if (url.pathname === '/api/standin' && req.method === 'GET') {
    standinsOf().pick({ q: String(url.searchParams.get('q') || '').slice(0, 400), w: url.searchParams.get('w'), h: url.searchParams.get('h'), run: url.searchParams.get('run') })
      .then(out => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out)))
      .catch(err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }
  const sti = url.pathname.match(/^\/standin\/([0-9a-f]{16}\.(jpg|png|webp))$/)
  if (sti) {
    const file = standinsOf().file(sti[1])
    if (!file) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': `image/${sti[2] === 'jpg' ? 'jpeg' : sti[2]}`, 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' })
    res.end(readFileSync(file))
    return
  }

  const img = url.pathname.match(/^\/img\/([\w-]{1,64})\/((?:\d{1,3}|snap|kept-\d{1,3}|(?:edit|video)-[a-z0-9]{1,12}-?\d{0,2}|game-[a-z0-9-]{1,48})\.(png|jpe?g|webp))$/)
  if (img) {
    const file = join(runsDir, img[1], 'img', img[2])
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': `image/${img[3] === 'jpg' ? 'jpeg' : img[3]}`, 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' })
    res.end(readFileSync(file))
    return
  }

  // A project's uploads, open like the images (the crew's pages and the art director use them).
  const up = url.pathname.match(/^\/up\/([\w-]{1,64})\/([^/]{1,400})$/)
  if (up) {
    const f = projects.uploadFile(up[1], up[2])
    if (!f) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': f.type, 'cache-control': 'no-cache', 'access-control-allow-origin': '*', 'content-security-policy': 'sandbox' })
    return createReadStream(f.file).pipe(res)
  }

  // A page as it stands, for covers and artboards: the run's sections composed into one static
  // document. Model-written HTML, so it is sandboxed (no scripts, an opaque origin).
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

  // The video's own composition, playing in a loop: the canvas shows it while
  // headless Chrome renders the same page frame by frame.
  const live = url.pathname.match(/^\/video\/([\w-]{1,64})\/live\/(index\.html|p\d{1,3}\.(?:webp|png|jpe?g))$/)
  if (live) {
    const file = join(runsDir, live[1], 'video', live[2])
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    if (live[2] !== 'index.html') return sendFile(res, file)
    // HyperFrames shows each clip only between its data-start and its end; here a
    // tiny stand-in does the same on every frame of the looping timeline
    const loop = `<script>addEventListener('load',()=>{const tl=window.__timelines&&window.__timelines.promo;if(!tl)return;const clips=[...document.querySelectorAll('.clip[data-start]')].map(el=>({el,a:+el.dataset.start,b:+el.dataset.start+ +el.dataset.duration}));const show=()=>{const t=tl.time();for(const c of clips)c.el.style.visibility=t>=c.a&&t<c.b?'visible':'hidden'};tl.eventCallback('onUpdate',show);tl.repeat(-1);tl.play(0);show()})</script>`
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    return res.end(readFileSync(file, 'utf8').replace(/<\/body>/i, () => `${loop}</body>`))
  }

  // A run's promo video, with range requests so the player can seek; an earlier
  // cut by its file name in the build's video folder (…-promo-v2.mp4).
  const vid = url.pathname.match(/^\/video\/([\w-]{1,64})\/(promo(?:-tall)?\.mp4|cut\/([a-z0-9-]{1,60}-promo-v\d{1,4}\.mp4))$/)
  if (vid) {
    const file = vid[3] ? join(shelf(vid[1], 'video').dir, vid[3]) : join(runsDir, vid[1], 'video', vid[2])
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

// A video that was rendering when the server stopped never finishes: say so in
// its run, so the canvas stops waiting and offers to make it again.
function closeStoppedVideos() {
  if (!existsSync(runsDir)) return
  for (const id of readdirSync(runsDir).filter(x => RUN_ID.test(x))) {
    const file = join(runsDir, id, 'events.jsonl')
    try { if (!readFileSync(file, 'utf8').includes('"video:start"')) continue } catch { continue }
    const last = readEvents(id).findLast(e => /^video:(start|done|failed)$/.test(e.type))
    if (last?.type === 'video:start') record(id, { type: 'video:failed', t: Date.now(), run: id, message: 'Swarm Studio restarted before the video finished. Make it again.' })
  }
}
closeStoppedVideos()

server.listen(port, '127.0.0.1', () => {
  console.log(`swarm studio on http://127.0.0.1:${port}/  (planner ${models.planner.model}, workers ${models.worker.model})`)
})

// app dev servers and engine runs stop with the studio
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { appsP?.then(a => a.close()).finally(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref() })
