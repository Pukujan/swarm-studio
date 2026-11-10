#!/usr/bin/env node
// The hosted Swarm Studio (docs/specs/13-hosted-studio.md): anyone tries a real build in the
// browser as a named guest, with no install. It reuses the engine and the canvas page, but not
// server.mjs, which is single-user by design (one run, every event to every canvas, one token).
//
// Here every guest has a cookie session, sees only their own runs live, and is held to limits:
// builds a day (per guest and per IP), one build at a time, a small crew and few pages, a prompt
// length, a request rate, and a daily spending cap for the whole studio, counted from each model
// call's token usage. Anything else the studio can do needs the plugin and answers 403 "install".
//
//   node server/hosted.mjs            env: SWARM_API_KEY, SWARM_BASE_URL, SWARM_PLANNER_MODEL,
//                                     SWARM_WORKER_MODEL, HOSTED_* (see LIMITS), SWARM_FEED_*
// It listens on 0.0.0.0:$PORT (8080) inside its container; the Feed's web container proxies
// https://swarm.design-bakery.com/studio/app/** to it.

import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSwarm } from '../engine/run.mjs'
import { recentLooks } from '../engine/pagetype.mjs'
import { intake } from '../engine/intake.mjs'
import { exportRun } from '../engine/export.mjs'
import { canvasPage, webVersion } from './page.mjs'
import { runBoard } from './board.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webDir = join(root, 'web')
const dataDir = process.env.SWARM_DATA_DIR || join(root, 'hosted-data')
const runsDir = process.env.SWARM_RUNS_DIR || join(dataDir, 'runs')
const port = Number(process.env.PORT || 8080)
const bindHost = process.env.HOST || '127.0.0.1'
const BASE = (process.env.HOSTED_BASE ?? '/studio/app').replace(/\/$/, '')
const PUBLIC = (process.env.HOSTED_PUBLIC_URL || 'https://swarm.design-bakery.com').replace(/\/$/, '')
const num = (name, d) => { const v = Number(process.env[name]); return Number.isFinite(v) && v >= 0 ? v : d }

const LIMITS = {
  builds: num('HOSTED_GUEST_BUILDS', 3), // per guest per UTC day
  ipBuilds: num('HOSTED_IP_BUILDS', 6), // per IP per UTC day
  concurrent: num('HOSTED_CONCURRENT', 4), // builds running at once, whole studio
  agents: num('HOSTED_AGENTS', 6),
  pages: num('HOSTED_PAGES', 2),
  sections: num('HOSTED_SECTIONS', 6),
  promptChars: num('HOSTED_PROMPT_CHARS', 500),
  rpm: num('HOSTED_RPM', 60), // API requests per IP per minute
  dailyUsd: num('HOSTED_DAILY_USD', 3),
  posts: num('HOSTED_GUEST_POSTS', 3) // Feed posts per guest per day
}
// list price per million tokens, so the ledger never counts less than was spent
const PRICE = { in: num('HOSTED_PRICE_IN', 0.15), out: num('HOSTED_PRICE_OUT', 0.6) }
const MODEL = {
  baseUrl: (process.env.SWARM_BASE_URL || 'https://api.inferhub.dev/v1').replace(/\/$/, ''),
  apiKey: process.env.SWARM_API_KEY || '',
  planner: process.env.SWARM_PLANNER_MODEL || 'cb/deepseek-v4.1-flash',
  worker: process.env.SWARM_WORKER_MODEL || process.env.SWARM_PLANNER_MODEL || 'cb/deepseek-v4.1-flash'
}
// Who a guest is comes from Swarm Feed: its guest session cookie (same site), checked against the
// Feed over the private network. Without a Feed (local tries) the studio keeps its own guest cookie.
const FEED = { url: (process.env.SWARM_FEED_INTERNAL_URL || '').replace(/\/$/, ''), cookie: 'swarm_feed_viewer' }
const INSTALL = process.env.HOSTED_INSTALL_URL || `${PUBLIC}/studio#install`
const CLOSED = 'The hosted studio has used today\'s budget. Come back tomorrow, or install the plugin and build with your own model, as much as you like.'
const COOKIE = 'swarm_guest'

// ---------- state: guests, today's counts and spend. One small JSON file, written atomically.
mkdirSync(runsDir, { recursive: true })
const stateFile = join(dataDir, 'hosted-state.json')
const today = () => new Date().toISOString().slice(0, 10)
let state = { day: today(), usd: 0, calls: 0, builds: 0, guests: {}, ips: {} }
try { state = { ...state, ...JSON.parse(readFileSync(stateFile, 'utf8')) } } catch {}
let saveTimer = null
const save = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { writeFileSync(`${stateFile}.tmp`, JSON.stringify(state)); renameSync(`${stateFile}.tmp`, stateFile) } catch (err) { console.error('state not saved', err.message) }
  }, 200)
}
// A new UTC day resets the counts and the spend; guests and their names stay.
function rollDay() {
  if (state.day === today()) return
  state.day = today(); state.usd = 0; state.calls = 0; state.builds = 0; state.ips = {}
  for (const g of Object.values(state.guests)) { g.builds = 0; g.posts = 0 }
  save()
}
const isOpen = () => (rollDay(), state.usd < LIMITS.dailyUsd && !!MODEL.apiKey)

// ---------- guests: a random token in an HttpOnly cookie; only its SHA-256 is kept
const sha = s => createHash('sha256').update(s).digest('hex')
function cookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
const who = new Map() // sha(feed session) -> { at, viewer }
async function guestOf(req, fresh = false) {
  if (FEED.url) {
    const token = cookies(req)[FEED.cookie]
    if (!token || token.length > 200) return null
    const key = sha(token), hit = who.get(key)
    let viewer = hit && !fresh && Date.now() - hit.at < 30000 ? hit.viewer : undefined
    if (viewer === undefined) {
      viewer = await fetch(`${FEED.url}/api/feed/whoami`, { headers: { cookie: `${FEED.cookie}=${token}` }, signal: AbortSignal.timeout(5000) })
        .then(r => (r.ok ? r.json() : null)).then(j => j?.viewer || null).catch(() => null)
      who.set(key, { at: Date.now(), viewer })
      if (who.size > 5000) who.delete(who.keys().next().value)
    }
    if (!viewer?.id) return null
    const g = (state.guests[viewer.id] ||= { builds: 0, posts: 0, created: Date.now() })
    g.name = viewer.name
    return { hash: viewer.id, ...g }
  }
  const token = cookies(req)[COOKIE]
  if (!token || token.length < 32 || token.length > 128) return null
  const hash = sha(token)
  return state.guests[hash] ? { hash, ...state.guests[hash] } : null
}
function newGuest(res, name) {
  const token = randomBytes(32).toString('base64url'), hash = sha(token)
  state.guests[hash] = { name, created: Date.now(), builds: 0, posts: 0 }
  save()
  const secure = PUBLIC.startsWith('https:') ? '; Secure' : ''
  res.setHeader('set-cookie', `${COOKIE}=${token}; Path=${BASE || '/'}; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`)
  return { hash, ...state.guests[hash] }
}
const cleanName = v => String(v || '').replace(/\s+/g, ' ').trim()
const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u
const guestView = g => g && { name: g.name, left: Math.max(0, LIMITS.builds - (state.day === today() ? g.builds || 0 : 0)), posts: Math.max(0, LIMITS.posts - (g.posts || 0)) }

// ---------- abuse limits: requests per IP per minute, and builds per IP per day
const ipOf = req => String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim().slice(0, 64)
const hits = new Map()
function rateOk(ip) {
  const now = Date.now(), h = hits.get(ip)
  if (!h || now - h.t > 60000) { hits.set(ip, { t: now, n: 1 }); return true }
  return ++h.n <= LIMITS.rpm
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.t > 60000) hits.delete(ip) }, 60000).unref()

// ---------- spend: every model call adds its tokens at list price; at the cap, builds stop
function meter(run) {
  return ({ usage, inputChars, outputChars }) => {
    rollDay()
    const tin = usage?.prompt_tokens ?? Math.ceil(inputChars / 4)
    const tout = usage?.completion_tokens ?? Math.ceil(outputChars / 4)
    const usd = (tin * PRICE.in + tout * PRICE.out) / 1e6
    state.usd += usd; state.calls++
    run.usd += usd
    save()
    if (state.usd >= LIMITS.dailyUsd) for (const r of runs.values()) if (!r.done) stopRun(r, CLOSED)
  }
}

// ---------- runs: each has an owner; its events go only to the owner's open canvases
const RUN_ID = /^[\w-]{1,64}$/
const runs = new Map() // live runs: id -> { id, owner, events, controller, done, usd, working }
const clients = new Set() // { res, owner }
const running = () => [...runs.values()].filter(r => !r.done)

function send(owner, event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const c of clients) if (c.owner === owner) c.res.write(line)
}
function stopRun(run, message) {
  if (run.done) return
  run.controller.abort()
  run.emit('error', { where: 'run', message })
  run.done = true
}

function startRun(guest, brief, agents) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
  const dir = join(runsDir, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'owner.json'), JSON.stringify({ owner: guest.hash, name: guest.name }))
  const run = { id, owner: guest.hash, events: [], controller: new AbortController(), done: false, usd: 0, working: new Set() }
  runs.set(id, run)
  run.emit = (type, data) => {
    const event = { type, t: Date.now(), run: id, ...data }
    run.events.push(event)
    if (type === 'agent:assign') run.working.add(data.agent)
    if (type === 'layer:done' || type === 'layer:failed') run.working.delete(data.agent)
    if (type === 'run:done') { run.done = true; run.result = data }
    send(run.owner, event)
    if (!type.endsWith(':delta')) appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(event) + '\n')
  }
  send(run.owner, { type: 'reset', run: id })
  const provider = { baseUrl: MODEL.baseUrl, apiKey: MODEL.apiKey, onUsage: meter(run) }
  runSwarm({
    provider, workerProvider: provider, brief, agents, recent: recentLooks(runsDir),
    plannerModel: MODEL.planner, workerModel: MODEL.worker,
    maxPages: LIMITS.pages, maxSections: LIMITS.sections,
    emit: run.emit, signal: run.controller.signal
  })
    .catch(err => run.emit('error', { where: 'run', message: String(err.message || err).slice(0, 300) }))
    .finally(() => {
      run.done = true
      console.log(`run ${id} by ${guest.name}: $${run.usd.toFixed(4)} (today $${state.usd.toFixed(3)})`)
      // the live copy is dropped a while after the run; the saved file stays
      setTimeout(() => runs.delete(id), 10 * 60e3).unref()
    })
  return run
}

function readEvents(id) {
  const file = join(runsDir, id, 'events.jsonl')
  if (!RUN_ID.test(id) || !existsSync(file)) return null
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
}
const ownerOf = id => { try { return JSON.parse(readFileSync(join(runsDir, id, 'owner.json'), 'utf8')) } catch { return null } }

// A run's file card for the Files list and the galaxy (the local server's runCard, cut down).
function runCard(id) {
  const events = readEvents(id)
  const start = events?.find(e => e.type === 'run:start')
  if (!start) return null
  const pages = events.filter(e => e.type === 'page')
  const done = events.find(e => e.type === 'run:done')
  const theme = events.findLast(e => e.type === 'theme') || {}
  const title = pages[0]?.title && theme.name ? theme.name : start.brief.slice(0, 60)
  return {
    id, title, autoTitle: title, kind: 'site', brief: start.brief, t: start.t, updated: events.at(-1)?.t || start.t,
    pages: pages.length, pageTitles: pages.map(p => p.title),
    layers: done?.done ?? events.filter(e => e.type === 'layer:done').length, failed: done?.failed || 0, ms: done?.ms ?? null,
    agents: start.agents?.length || 0, models: { planner: start.plannerModel || null, builders: start.workerModel || null },
    theme: theme.name ? { name: theme.name, direction: theme.direction || '', colors: ['--background', '--primary', '--accent', '--foreground'].map(k => theme.vars?.[k]).filter(Boolean), fonts: theme.fonts || {} } : null,
    images: 0, reviews: 0, fixes: 0, edits: 0, exports: 0, sites: {}, published: [], videoSeconds: null,
    preview: events.some(e => e.type === 'layer:done' && e.html),
    folder: null, tags: [], note: '', trace: false, order: null, traces: false, video: false, videoFile: null,
    live: runs.has(id) && !runs.get(id).done
  }
}
function guestRuns(hash) {
  return readdirSync(runsDir).filter(id => RUN_ID.test(id)).sort().reverse()
    .filter(id => ownerOf(id)?.owner === hash).slice(0, 50).flatMap(id => runCard(id) || [])
}

// Runs older than a week go; the hosted studio is for trying, the plugin is for keeping.
function sweep() {
  const old = Date.now() - 7 * 24 * 3600e3
  for (const id of readdirSync(runsDir)) {
    try { if (RUN_ID.test(id) && !runs.has(id) && statSync(join(runsDir, id)).mtimeMs < old) rmSync(join(runsDir, id), { recursive: true, force: true }) } catch {}
  }
}
setInterval(sweep, 3600e3).unref()
sweep()

// ---------- posting to Swarm Feed: the studio exports the pages and serves them; the canvas then
// posts the card to the Feed itself (POST /api/feed/builds, as the guest, same site), so the
// credit is the guest's own Feed account
async function siteFor(id) {
  const events = readEvents(id)
  if (!events?.some(e => e.type === 'run:done')) throw Object.assign(new Error('Wait for the build to finish, then post it.'), { status: 409 })
  const out = await exportRun({ events, runId: id, runDir: join(runsDir, id), sections: [] })
  const start = events.find(e => e.type === 'run:start'), done = events.find(e => e.type === 'run:done')
  return {
    title: String(out.brand || start.brief).replace(/\s+/g, ' ').trim().slice(0, 80) || 'A Swarm Studio build',
    kind: 'site', prompt: start.brief.slice(0, 4000), buildMs: Math.round(done?.ms || 0), agents: Math.max(1, start.agents?.length || 1),
    liveUrl: `${PUBLIC}${BASE}/site/${id}/`, runId: id
  }
}

// ---------- HTTP
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
const body = (req, max = 3e6) => new Promise(resolve => {
  let s = '', n = 0
  req.on('data', c => { n += c.length; if (n <= max) s += c })
  req.on('end', () => { if (n > max) return resolve(null); try { resolve(JSON.parse(s || '{}')) } catch { resolve({}) } })
})
const install = what => ({ error: 'install', title: 'This needs the plugin', message: `${what} runs on your own computer with Swarm Studio for Hermes Agent, with your own models. Install the plugin to use it.` })
// What the canvas asks for by itself on load gets a quiet empty answer, not a refusal
const QUIET = { '/api/auto': { state: 'idle' }, '/api/folders': { folders: [] }, '/api/packs': { packs: [] }, '/api/connectors': { connectors: [] }, '/api/gateway': { platforms: {} }, '/api/publish': {}, '/api/game': { questions: [] } }

function boot(guest) {
  return {
    token: '', base: BASE,
    hosted: { guest: guestView(guest), open: isOpen(), feedIdentity: !!FEED.url, limits: { builds: LIMITS.builds, agents: LIMITS.agents, pages: LIMITS.pages, promptChars: LIMITS.promptChars }, install: INSTALL, feed: PUBLIC, closedMessage: CLOSED }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://studio')
  // the proxy may pass the path with or without the /studio/app prefix
  let path = url.pathname
  if (BASE && (path === BASE || path.startsWith(`${BASE}/`))) path = path.slice(BASE.length) || '/'
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')

  if (path === '/healthz') return json(res, 200, { ok: true, open: isOpen(), running: running().length })

  const ip = ipOf(req)
  const isApi = path === '/events' || path.startsWith('/api/')
  if (isApi && !rateOk(ip)) return json(res, 429, { error: 'rate', title: 'Slow down a little', message: 'Too many requests in a minute. Wait a moment, then try again.' })
  // writes only from our own pages (a browser always sends Origin on a cross-site POST)
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== PUBLIC && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return json(res, 403, { error: 'origin' })
  rollDay()
  const guest = await guestOf(req, url.searchParams.get('fresh') === '1')

  if (path === '/' || path === '/index.html') {
    if (url.pathname === BASE) return res.writeHead(301, { location: `${BASE}/${url.search}` }).end()
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'SAMEORIGIN' })
    return res.end(canvasPage(webDir, boot(guest)))
  }

  if (path === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write(': hello\n\n')
    if (!guest) return req.on('close', () => {})
    // a canvas opened mid-build replays the guest's live run
    const live = [...runs.values()].filter(r => r.owner === guest.hash).at(-1)
    for (const e of live?.events || []) if (!(live.done && e.type.endsWith(':delta'))) res.write(`data: ${JSON.stringify(e)}\n\n`)
    const c = { res, owner: guest.hash }
    clients.add(c)
    const ping = setInterval(() => res.write(': ping\n\n'), 25000)
    req.on('close', () => { clearInterval(ping); clients.delete(c) })
    return
  }

  if (path === '/api/state') {
    const live = guest && [...runs.values()].filter(r => r.owner === guest.hash).at(-1)
    return json(res, 200, {
      app: 'swarm-studio', hosted: true, version: webVersion(webDir), open: isOpen(), guest: guestView(guest),
      run: live?.id || null, done: live ? live.done : null, working: live?.working.size || 0, result: live?.result || null,
      plannerModel: MODEL.planner, workerModel: MODEL.worker, plannerHost: new URL(MODEL.baseUrl).host, workerHost: new URL(MODEL.baseUrl).host, reviewerModel: ''
    })
  }

  // local tries only: with a Feed, the name is set on the Feed (POST /api/feed/me)
  if (path === '/api/guest' && req.method === 'POST' && !FEED.url) {
    const input = await body(req, 4000)
    const name = cleanName(input?.name)
    if (!NAME_OK.test(name)) return json(res, 400, { error: 'name', message: 'Use 2 to 24 letters or digits (spaces, - and _ are fine).' })
    if (guest) { state.guests[guest.hash].name = name; save(); return json(res, 200, { guest: guestView({ ...guest, name }) }) }
    return json(res, 200, { guest: guestView(newGuest(res, name)) })
  }

  if (path === '/api/run' && req.method === 'POST') {
    const input = await body(req, 20000)
    if (!guest) return json(res, 401, { error: 'guest', title: 'Pick a guest name', message: 'Tell the crew what to call you first.' })
    if (!isOpen()) return json(res, 503, { error: 'closed', title: 'Done for today', message: CLOSED, guest: guestView(guest) })
    const brief = String(input?.brief || '').replace(/\s+/g, ' ').trim()
    if (brief.length < 8) return json(res, 400, { error: 'brief', title: 'Say a little more', message: 'Describe the product in a sentence or two.' })
    if (brief.length > LIMITS.promptChars) return json(res, 400, { error: 'brief', title: 'A shorter prompt', message: `Guest prompts are up to ${LIMITS.promptChars} characters. The plugin takes any length.` })
    if (/^\//.test(brief)) return json(res, 403, install('Slash commands'))
    const g = state.guests[guest.hash]
    if ((g.builds || 0) >= LIMITS.builds) return json(res, 429, { error: 'limit', title: 'That was today\'s last build', message: `Guests get ${LIMITS.builds} builds a day. Come back tomorrow, or install the plugin and build as much as you like with your own model.`, guest: guestView(guest) })
    if ((state.ips[ip] || 0) >= LIMITS.ipBuilds) return json(res, 429, { error: 'limit', title: 'This network has had its builds', message: 'Builds from this network are used up for today. Come back tomorrow, or install the plugin.', guest: guestView(guest) })
    if (running().some(r => r.owner === guest.hash)) return json(res, 409, { error: 'busy', title: 'One build at a time', message: 'Your crew is still building. Wait for it to finish, then start the next one.' })
    if (running().length >= LIMITS.concurrent) return json(res, 503, { error: 'full', title: 'The studio is busy', message: 'Every crew is out building. Try again in a minute.' })
    g.builds = (g.builds || 0) + 1
    state.ips[ip] = (state.ips[ip] || 0) + 1
    state.builds++
    save()
    const agents = Math.max(2, Math.min(LIMITS.agents, Number(input.agents) || LIMITS.agents))
    const run = startRun(guest, brief, agents)
    return json(res, 200, { run: run.id, guest: guestView(state.guests[guest.hash] && { ...guest, ...state.guests[guest.hash] }) })
  }

  if (path === '/api/runs' && req.method === 'GET') return json(res, 200, guest ? guestRuns(guest.hash) : [])

  const runEvents = path.match(/^\/api\/runs\/([^/]+)\/events$/)
  if (runEvents && req.method === 'GET') {
    // builds are public, like the Feed: anyone with the link can open one
    const events = readEvents(runEvents[1])
    return events ? json(res, 200, events) : json(res, 404, { error: 'no such run' })
  }

  // a build's pictures, public like its events
  const img = path.match(/^\/img\/([\w-]{1,64})\/((?:\d{1,3}|kept-\d{1,3}|(?:edit|video)-[a-z0-9]{1,12}-?\d{0,2})\.(png|jpe?g|webp))$/)
  if (img && req.method === 'GET') {
    const file = join(runsDir, img[1], 'img', img[2])
    if (!RUN_ID.test(img[1]) || !existsSync(file)) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': `image/${img[3] === 'jpg' ? 'jpeg' : img[3]}`, 'cache-control': 'max-age=31536000, immutable' })
    return createReadStream(file).pipe(res)
  }

  // a build's canvas, public like its events
  const runBoardGet = path.match(/^\/api\/runs\/([^/]+)\/board$/)
  if (runBoardGet && req.method === 'GET') {
    const id = runBoardGet[1], events = readEvents(id)
    if (!events) return json(res, 404, { error: 'no such run' })
    const live = runs.get(id)
    return json(res, 200, { ...runBoard(id, events, runsDir, !!live && !live.done), code: false })
  }

  const runSite = path.match(/^\/api\/runs\/([^/]+)\/site$/)
  if (runSite && req.method === 'POST') {
    const id = runSite[1]
    req.resume()
    if (!guest || ownerOf(id)?.owner !== guest.hash) return json(res, 403, { error: 'owner', title: 'Not yours', message: 'Only the guest who built it can post it.' })
    const g = state.guests[guest.hash]
    if ((g.posts || 0) >= LIMITS.posts) return json(res, 429, { error: 'limit', title: 'Enough posts for today', message: `Guests post up to ${LIMITS.posts} builds a day.` })
    try {
      const card = await siteFor(id)
      g.posts = (g.posts || 0) + 1
      save()
      return json(res, 200, { ok: true, card })
    } catch (err) {
      return json(res, err.status || 500, { error: 'post', title: 'Could not post', message: String(err.message || err).slice(0, 300) })
    }
  }

  // design-panel edits stay in this browser for guests; the plugin saves them with the build
  if (/^\/api\/runs\/[^/]+\/(edit|restore)$/.test(path) && req.method === 'POST') { req.resume(); return json(res, 200, { ok: true, saved: false }) }

  // the Make box: the showcases a guest can build (websites) and the grill-me interview
  if (path === '/api/intake' && req.method === 'GET') return json(res, 200, intake({ hosted: true }))
  if (QUIET[path] && req.method === 'GET') return json(res, 200, QUIET[path])
  if (path === '/api/models' && req.method === 'GET') return json(res, 200, { roles: { planner: { model: MODEL.planner, picked: null }, worker: { model: MODEL.worker, picked: null }, reviewer: { model: '', picked: null } }, text: [], vision: [], lite: null, image: { pick: 'off', providers: [] } })
  if (isApi) { req.resume(); return json(res, 403, install(/video/.test(path) ? 'Video' : /app/.test(path) ? 'The working app' : /publish|export/.test(path) ? 'Publishing' : /review|comment|tours/.test(path) ? 'This agent step' : 'This')) }

  // A finished build's pages, exported when it is posted. Model-written HTML from anyone, so it
  // runs sandboxed in an opaque origin: it can't read the Feed's or the studio's cookies or APIs.
  const site = path.match(/^\/site\/([\w-]{1,64})(\/[\w./-]*)?$/)
  if (site) {
    if (!site[2]) return res.writeHead(301, { location: `${BASE}/site/${site[1]}/` }).end()
    const base = join(runsDir, site[1], 'export')
    const name = existsSync(base) && readdirSync(base, { withFileTypes: true }).find(d => d.isDirectory() && existsSync(join(base, d.name, 'html')))?.name
    const rel = site[2] === '/' ? 'index.html' : site[2].slice(1)
    if (!name || rel.split('/').includes('..')) return res.writeHead(404).end('not found')
    const file = join(base, name, 'html', rel)
    if (!existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-security-policy': 'sandbox allow-scripts allow-forms allow-popups' })
    return createReadStream(file).pipe(res)
  }

  // the canvas's own files (fonts, brand art, three.js)
  const rel = normalize(path).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  const file = join(webDir, rel)
  if (!file.startsWith(webDir) || !existsSync(file) || !statSync(file).isFile() || /\.html$/.test(file)) return res.writeHead(404).end('not found')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' })
  createReadStream(file).pipe(res)
})

server.listen(port, bindHost, () => {
  console.log(`hosted swarm studio on http://${bindHost}:${port}${BASE}/ (planner ${MODEL.planner}, workers ${MODEL.worker}, key ${MODEL.apiKey ? 'set' : 'MISSING'}, cap $${LIMITS.dailyUsd}/day)`)
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  clearTimeout(saveTimer)
  try { writeFileSync(stateFile, JSON.stringify(state)) } catch {}
  process.exit(0)
})
