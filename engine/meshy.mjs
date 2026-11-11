// Make a game's character with Meshy (docs/specs/20-meshy-characters.md).
//
// The site's own anime art goes to Meshy image-to-3D with a cel look, the mesh is
// rigged as a humanoid, and the rigged GLB (plus its free walk and run clips) is
// downloaded into the Studio's model library. The person sees the price first and
// nothing is spent without their yes; without a MESHY_API_KEY none of this is
// offered and the cast step falls back to the real-model shortlist (spec 19) or a
// 2.5D billboard sprite cut from the same art.
//
// The API routes, prices, result fields, polling policy and asset-host guard come
// from Nous's official Meshy plugin (NousResearch/hermes-official-plugins, meshy/:
// dashboard/plugin_api.py, src/task-poll.ts, skills/meshy-3d/references/workflows.md,
// MIT). That plugin talks to Meshy through an MCP server the Studio does not run,
// so the few calls this flow needs are made here the same way.

import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join, extname } from 'node:path'
import { homedir } from 'node:os'

export const API = 'https://api.meshy.ai'
export const KEY = 'MESHY_API_KEY'
// Where a signed asset link (and every redirect hop of it) may point (plugin_api._ASSET_HOSTS).
const ASSET_HOSTS = new Set(['assets.meshy.ai'])
const MAX_BYTES = 128 * 1024 * 1024 // a Meshy GLB with 2K textures is ~30 MB

export const ROUTES = { 'image-to-3d': '/openapi/v1/image-to-3d', rigging: '/openapi/v1/rigging', balance: '/openapi/v1/balance' }

// Prices (workflows.md, Meshy's pricing as of 2026-10-12). Image-to-3D with a
// texture on meshy-6 is 30; the rig is 5 and includes the walk and run clips.
export const PRICE = { 'meshy-6': { mesh: 20, textured: 30 }, 'meshy-6-lite': { mesh: 5, textured: 15 }, rig: 5 }
export const AI_MODEL = 'meshy-6'

// The look the mesh is textured in: the site's anime family, never a realistic or 3D-render look.
export const STYLE = 'anime cel-shaded character, flat colours, clean line art, soft two-tone shading, stylised proportions, not realistic, not photoreal'

// What one character costs, shown before every run (and checked again by the server).
export function meshyCost({ aiModel = AI_MODEL, rig = true } = {}) {
  const make = (PRICE[aiModel] || PRICE[AI_MODEL]).textured
  const parts = [{ what: 'model', credits: make }, ...(rig ? [{ what: 'rig', credits: PRICE.rig }] : [])]
  return { credits: parts.reduce((n, p) => n + p.credits, 0), parts, aiModel }
}

// The key, from the server's environment, ~/.hermes/.env, or ~/Documents/projects/.env.
// It is only ever put in an Authorization header: never logged, returned or sent to the browser.
export function meshyKey({ env = process.env, files = [join(homedir(), '.hermes', '.env'), join(homedir(), 'Documents', 'projects', '.env')] } = {}) {
  if (env[KEY]) return String(env[KEY]).trim()
  for (const f of files) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (m && m[1] === KEY && m[2].trim()) return m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return ''
}
export const meshyReady = opts => !!meshyKey(opts)

// An error with the HTTP status Meshy answered, and Meshy's own message (never the key).
export class MeshyError extends Error {
  constructor(message, status = null) { super(message); this.status = status }
}

async function call(path, { key, method = 'GET', body, fetchImpl = fetch, timeout = 30000 }) {
  if (!key) throw new MeshyError('no Meshy key', 401)
  let r
  try {
    r = await fetchImpl(API + path, {
      method,
      headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'user-agent': 'swarm-studio', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', // the key goes to api.meshy.ai and nowhere else
      signal: AbortSignal.timeout(timeout)
    })
  } catch (err) {
    throw new MeshyError(`Meshy did not answer (${err.name === 'TimeoutError' ? 'timeout' : 'network'})`)
  }
  if (!r.ok) {
    let msg = ''
    try { msg = (await r.json()).message || '' } catch {}
    throw new MeshyError(`Meshy ${r.status}${msg ? `: ${String(msg).slice(0, 200)}` : ''}`, r.status)
  }
  return r.json()
}

// ---------- polling (src/task-poll.ts, as one awaited loop)
export const RUNNING = new Set(['PENDING', 'IN_PROGRESS'])
export const POLL_MS = 3000
export const MAX_BACKOFF_MS = 60000
export const EARLY_404_MS = 90000
export function classifyFailure(status, sinceStart) {
  if (status === null || status === undefined || status >= 500 || status === 408 || status === 429) return 'transient'
  if (status === 404) return sinceStart < EARLY_404_MS ? 'transient' : 'permanent'
  return status >= 400 ? 'permanent' : 'transient'
}
export const backoffMs = failures => Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.max(0, failures - 1))
const realClock = { now: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)) }

// Wait for a task to leave PENDING / IN_PROGRESS. A timeout leaves the task running
// on Meshy's side (workflows.md rule 2): the caller can poll the same id again.
export async function waitTask(route, id, { key, fetchImpl, clock = realClock, limitMs = 15 * 60000, onProgress } = {}) {
  const start = clock.now()
  let failures = 0
  for (;;) {
    let t
    try {
      t = await call(`${ROUTES[route]}/${encodeURIComponent(id)}`, { key, fetchImpl })
    } catch (err) {
      failures += 1
      if (classifyFailure(err.status, clock.now() - start) === 'permanent' || clock.now() - start > limitMs) throw err
      await clock.sleep(backoffMs(failures))
      continue
    }
    failures = 0
    onProgress?.(t)
    if (!RUNNING.has(t.status)) {
      if (t.status !== 'SUCCEEDED') throw new MeshyError(`Meshy ${route} ${String(t.status).toLowerCase()}${t.task_error?.message ? `: ${String(t.task_error.message).slice(0, 200)}` : ''}`)
      return t
    }
    if (clock.now() - start > limitMs) throw new MeshyError(`Meshy ${route} still running`)
    await clock.sleep(POLL_MS)
  }
}

// ---------- the two paid calls
// Image-to-3D: one picture of the character, textured in the cel look, posed for rigging.
export function imageTo3dBody(imageUrl, { aiModel = AI_MODEL, polycount = 15000 } = {}) {
  return {
    image_url: imageUrl,
    ai_model: aiModel,
    should_texture: true,
    enable_pbr: false, // flat anime colours, not physically based materials
    texture_prompt: STYLE,
    pose_mode: 'a-pose', // rigging needs open arms
    should_remesh: true,
    topology: 'triangle',
    target_polycount: polycount, // ~15k for a character (the plugin's detail level)
    target_formats: ['glb']
  }
}
export const rigBody = (inputTaskId, heightMeters = 1.7) => ({ input_task_id: inputTaskId, height_meters: heightMeters })

// The rigged character and its free clips (plugin_api._result_urls, rigging fields).
export function rigOutputs(task = {}) {
  const r = task.result || {}
  const anim = r.basic_animations || {}
  return { glb: r.rigged_character_glb_url || null, walk: anim.walking_glb_url || null, run: anim.running_glb_url || null }
}

// ---------- downloads, only from Meshy's asset host, every redirect hop checked
export const assetAllowed = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' && ASSET_HOSTS.has(x.hostname) } catch { return false } }
export async function download(url, dest, { fetchImpl = fetch, cap = MAX_BYTES } = {}) {
  let at = url
  for (let hop = 0; hop < 5; hop++) {
    if (!assetAllowed(at)) throw new MeshyError('download off Meshy\'s asset host')
    const r = await fetchImpl(at, { redirect: 'manual', signal: AbortSignal.timeout(120000) })
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { at = new URL(r.headers.get('location'), at).href; continue }
    if (!r.ok) throw new MeshyError(`download ${r.status}`, r.status)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > cap) throw new MeshyError('download too big')
    const tmp = `${dest}.part`
    writeFileSync(tmp, buf)
    renameSync(tmp, dest)
    return { file: dest, bytes: buf.length }
  }
  throw new MeshyError('too many redirects')
}

// A local picture as a data URI Meshy accepts (png / jpg / webp).
export function dataUri(file) {
  const ext = extname(file).slice(1).toLowerCase()
  const type = ext === 'jpg' ? 'jpeg' : ext
  if (!['png', 'jpeg', 'webp'].includes(type)) throw new MeshyError('picture must be png, jpg or webp')
  return `data:image/${type};base64,${readFileSync(file).toString('base64')}`
}

const slug = s => String(s || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'hero'

// The whole run for one role: art -> textured mesh -> rig -> files in outDir.
// Returns { file, clips, thumb, tasks, credits }. Spends credits: call it only after the person said yes.
export async function makeCharacter({ image, role = 'hero', outDir, key = meshyKey(), fetchImpl = fetch, clock, onStep = () => {}, stamp = Date.now().toString(36) }) {
  if (!key) throw new MeshyError('no Meshy key', 401)
  mkdirSync(outDir, { recursive: true })
  const cost = meshyCost()
  onStep({ stage: 'model', progress: 0 })
  const made = await call(ROUTES['image-to-3d'], { key, method: 'POST', body: imageTo3dBody(image.startsWith('data:') ? image : dataUri(image)), fetchImpl })
  const meshId = made.result
  if (!meshId) throw new MeshyError('Meshy gave no task id')
  const mesh = await waitTask('image-to-3d', meshId, { key, fetchImpl, clock, onProgress: t => onStep({ stage: 'model', progress: t.progress || 0 }) })
  onStep({ stage: 'rig', progress: 0 })
  const rigged = await call(ROUTES.rigging, { key, method: 'POST', body: rigBody(meshId), fetchImpl })
  const rigId = rigged.result
  if (!rigId) throw new MeshyError('Meshy gave no rig task id')
  const rig = await waitTask('rigging', rigId, { key, fetchImpl, clock, onProgress: t => onStep({ stage: 'rig', progress: t.progress || 0 }) })
  const out = rigOutputs(rig)
  if (!out.glb) throw new MeshyError('the rig came back without a model')
  onStep({ stage: 'download', progress: 0 })
  const base = `meshy-${slug(role)}-${stamp}`
  const file = `${base}.glb`
  await download(out.glb, join(outDir, file), { fetchImpl })
  const clips = {}
  for (const k of ['walk', 'run']) if (out[k]) { clips[k] = `${base}-${k}.glb`; await download(out[k], join(outDir, clips[k]), { fetchImpl }) }
  let thumb = null
  if (mesh.thumbnail_url && assetAllowed(mesh.thumbnail_url)) {
    try { thumb = `${base}.png`; await download(mesh.thumbnail_url, join(outDir, thumb), { fetchImpl, cap: 8 * 1024 * 1024 }) } catch { thumb = null }
  }
  onStep({ stage: 'done', progress: 100 })
  return { file, clips, thumb, tasks: { mesh: meshId, rig: rigId }, credits: cost.credits }
}

// ---------- cast entries for the two art-made sources (they join spec 19's cleanCast)
// Made with Meshy from the project's own art: the person's model, no outside credit.
export const meshyPick = ({ role, label, file, clips = {}, thumb }) => ({
  role, label, name: `${label || role} (Meshy)`, creator: 'this project', source: 'meshy', format: 'gltf', rigged: true, file, clips, thumb,
  licence: { restyle: true, creditRequired: false, credit: 'Made from the project\'s own art with Meshy' }
})
// The no-key fallback: the art itself, standing in the 3D world as a camera-facing sprite.
export const spritePick = ({ role, label, art }) => ({
  role, label, name: `${label || role} (sprite)`, creator: 'this project', source: 'art', format: 'sprite', art,
  licence: { restyle: false, creditRequired: false, credit: 'The project\'s own art' }
})

// ---------- the Studio's Meshy jobs: one or several characters at once, each the person's yes
// A crew member works each job on the canvas (web/canvas.js, the Cast step's bench), so every job
// carries the name of the one making it. At most PARALLEL run on Meshy at once; the rest wait in
// line (stage 'queued'), already confirmed by the click, and start as a place frees up.
export const PARALLEL = 3
export const BATCH_MAX = 16 // about half a Pro month (1,000 credits) at most in one click
// The sculptors who make characters, in the order they take a job (names from web/crew.js).
export const SCULPTORS = ['Pebble', 'Mochi', 'Tofu', 'Bean', 'Puff', 'Sprout']
const cleanRole = r => String(r || 'hero').replace(/[^\w-]/g, '').slice(0, 40) || 'hero'
const refuse = (message, status) => Object.assign(new Error(message), { status })

// resolveArt(art) -> the picture's file on disk, or throws (only the project's own pictures).
// key() is read on every ask, so a key added later is picked up; it only goes into makeCharacter.
export function meshyJobs({ outDir, resolveArt, key = () => meshyKey(), fetchImpl = fetch, clock, make = makeCharacter, newId = () => Math.random().toString(16).slice(2, 14), parallel = PARALLEL } = {}) {
  const jobs = new Map()
  const line = []
  const live = () => [...jobs.values()].filter(j => j.state === 'running')
  const busy = () => live().filter(j => j.stage !== 'queued').length

  function run(job, image, k) {
    Object.assign(job, { stage: 'model', progress: 0, startedAt: Date.now() })
    Promise.resolve()
      .then(() => make({ image, role: job.role, key: k, outDir, fetchImpl, clock, onStep: s => Object.assign(job, s) }))
      .then(r => Object.assign(job, { state: 'done', stage: 'done', progress: 100, pick: { ...meshyPick({ role: job.role, label: job.label, ...r }), thumbSrc: r.thumb ? `/models/${r.thumb}` : null } }))
      .catch(err => Object.assign(job, { state: 'failed', error: String(err.message || err).slice(0, 240) }))
      .finally(next)
  }
  function next() {
    while (line.length && busy() < parallel) {
      const { job, image, k } = line.shift()
      run(job, image, k)
    }
  }
  // every item is checked before anything is spent: one bad item refuses the whole ask
  function check(items) {
    const seen = new Set()
    return items.map(it => {
      const role = cleanRole(it?.role)
      if (seen.has(role)) throw refuse(`${role} is asked twice`, 400)
      seen.add(role)
      const art = String(it?.art || '')
      return { role, label: String(it?.label || role).slice(0, 40), art, image: resolveArt(art) }
    })
  }
  function begin(items, k) {
    return items.map(it => {
      // one paid run per role at a time: asking again joins the first instead of paying twice
      const running = live().find(j => j.role === it.role)
      if (running) return running
      const used = new Set(live().map(j => j.worker))
      const worker = SCULPTORS.find(n => !used.has(n)) || SCULPTORS[jobs.size % SCULPTORS.length]
      const job = { id: newId(), role: it.role, label: it.label, art: it.art, worker, state: 'running', stage: 'queued', progress: 0, credits: meshyCost().credits, pick: null, error: null, at: Date.now() }
      jobs.set(job.id, job)
      line.push({ job, image: it.image, k })
      return job
    })
  }
  // one character: { role, label, art, credits }, credits being the price the person was shown
  function start(input = {}) {
    const k = key()
    if (!k) throw refuse('no Meshy key', 409)
    const cost = meshyCost().credits
    if (Number(input.credits) !== cost) throw refuse(`confirm ${cost} credits first`, 402)
    const [job] = begin(check([input]), k)
    next()
    return job
  }
  // several at once: { items: [{ role, label, art }], credits }, credits being the total on the button
  // (one price per item). A role already being made joins its run and spends nothing more, so a batch
  // never spends more than the number the person clicked.
  function batch(input = {}) {
    const k = key()
    if (!k) throw refuse('no Meshy key', 409)
    const items = Array.isArray(input.items) ? input.items : []
    if (!items.length) throw refuse('nothing to make', 400)
    if (items.length > BATCH_MAX) throw refuse(`${BATCH_MAX} characters at most`, 400)
    const total = meshyCost().credits * items.length
    if (Number(input.credits) !== total) throw refuse(`confirm ${total} credits first`, 402)
    const ok = check(items)
    const before = new Set(jobs.keys())
    const out = begin(ok, k)
    next()
    return { jobs: out, credits: total, spent: out.filter(j => !before.has(j.id)).length * meshyCost().credits }
  }
  return { jobs, start, batch, get: id => jobs.get(String(id || '')) || null }
}
