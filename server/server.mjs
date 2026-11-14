#!/usr/bin/env node
// Swarm Studio local server: serves the canvas, starts runs, and streams every
// engine event to the canvas over Server-Sent Events. Binds to 127.0.0.1 only.
//
//   node server/server.mjs [--port 4319]
//   Model calls go to Hermes through its bridge (engine/hermesllm.mjs). Without Hermes:
//   env: SWARM_STUDIO_API_KEY or SWARM_API_KEY, SWARM_BASE_URL,
//        SWARM_PLANNER_MODEL, SWARM_WORKER_MODEL, SWARM_AGENTS

import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, copyFileSync, createReadStream, mkdtempSync, rmSync, openSync, readSync, closeSync } from 'node:fs'
import { execFile, hermesEnv, pick, respawnSelf } from '../engine/proc.mjs'
import { hermesBridge, imageBody, videoBody } from '../engine/bridge.mjs'
import { hermesLlm, roleModel } from '../engine/hermesllm.mjs'
import { hermesHealth, HERMES_SAYS } from '../engine/hermeshealth.mjs'
import { reasonFromAbort, reasonFromFailure } from '../engine/stopreason.mjs'
import { basename, dirname, extname, join, normalize } from 'node:path'
import { homedir, tmpdir, userInfo } from 'node:os'
import { fileURLToPath } from 'node:url'
import { runSwarm } from '../engine/run.mjs'
import { extendBase, followUp, rehomeImages, baseBrief } from '../engine/extend.mjs'
import { recentLooks } from '../engine/pagetype.mjs'
import { writeTours } from '../engine/tours.mjs'
import { reviewPage, fixSection, routeComment, reviewAgain, REVIEW_PASS, REVIEW_ROUNDS } from '../engine/review.mjs'
import { lintSection } from '../engine/lint/index.mjs'
import { cleanMarks, openMarks, nextMarkId, readMarksMessages, parseReads, fixText, markLine } from '../engine/marks.mjs'
import { handChanges, keepHand } from '../engine/handedit.mjs'
import { exportRun, snapshot } from '../engine/export.mjs'
import { seoPass, currentSeo, cleanSeo, thumbOf } from '../engine/seo.mjs'
import { seoAsk, lookAsk } from '../web/route.js'
import { lookEdits, themeNow } from '../engine/lookask.mjs'
import { standins as standinsMake } from '../engine/standins.mjs'
import { githubLogin, publishGitHub, publishVercel, publishCloudflare } from '../engine/publish.mjs'
import { connect, connections, credentials, PROVIDERS } from '../engine/connect.mjs'
import { MOTION_CSS, SNAPPY, swarmMotion, motionPreset } from '../engine/motion.mjs'
import { speak, mix, VOICES } from '../engine/sound.mjs'
import { layoutSource, swarmLayout } from '../engine/layout.mjs'
import { traced, readTrace } from '../engine/trace.mjs'
import { canvasPage as sharedCanvasPage, webVersion as pageVersion } from './page.mjs'
import { nextPage } from './next.mjs'
import { makeProjects, stateOf, gameProgress } from './projects.mjs'
import { CHAT_ID } from '../engine/chats.mjs'
import { askTurn, askedOf, askOptions, ASK_TEXT } from '../engine/askfirst.mjs'
import { wordsRead } from '../engine/talkplan.mjs'
import { deployName, isScreenName, PIECES } from '../engine/naming.mjs'
import { autoJob, hermesKey } from '../engine/auto.mjs'
import * as art from '../engine/artdirect.mjs'
import { runBoard as boardOf } from './board.mjs'
import { listAssets, assetFiles, lostPictures } from '../engine/assets.mjs'
import { streamChat } from '../engine/llm.mjs'
import { runFacts, writeLaunch, readLaunch, markLaunch } from '../engine/launch.mjs'
import { hermesConnectors } from '../engine/hermes_connect.mjs'
import { planRoutes } from './plans.mjs'
import { talkRoutes } from './talk.mjs'
import { appKitRoutes } from './appkit.mjs'
import { brandRoutes, lockedBrand } from './brand.mjs'
import { requestedBrand } from '../engine/brand.mjs'
import { templates as odTemplates } from '../engine/odlibrary.mjs'
import { storyRoutes } from './story.mjs'
import { deckRoutes } from './deck.mjs'
import { refRoutes } from './refs.mjs'
import { pictureAsk, vagueAsk, gensOf, newPrompt } from '../engine/picask.mjs'
import { fixText as lookFixText } from '../engine/lookmatch.mjs'
import { studioRoutes } from './studio.mjs'
import { studioStore } from '../engine/studio.mjs'
import { assetStore } from '../engine/assetstore.mjs'
import { chatMediaRoutes } from './chatmedia.mjs'
import { pictureMessages, linksIn, readPage, pageRead, withRefs } from '../engine/chatmedia.mjs'
import { refStore } from '../engine/refs.mjs'
import { workshopRoutes } from './workshops.mjs'
import { setupRoutes } from './setup.mjs'
import { pictureRun, isPictures } from '../engine/setup.mjs'
import { ckffPaint, ckffCreds } from '../engine/ckff.mjs'
import { chooseImage, paintWithBackup } from '../engine/paintretry.mjs'
import { library, PACKS as LIB_PACKS } from '../engine/library.mjs'
import { assetLib, readPicks, setPick, pickedItem, creditsFor, SLOT_CATEGORIES, slotKind } from '../engine/assetlib.mjs'
import { makeCharacter as planMakeCharacter, meshyKey as planMeshyKey } from '../engine/meshy.mjs'
import { PLAN_QUESTIONS } from '../engine/plan.mjs'
import { collect, composition, VOICE_LEAD, videoTools, render, stagePictures, TRANSITIONS, fxFor, SHAPES } from '../engine/video.mjs'
import { makePoster, posterFfmpeg } from '../engine/poster.mjs'
import { idleWatch, codeStamp, staleCode } from '../engine/lifecycle.mjs'
import { findFfmpeg } from '../engine/playtest.mjs'
import { writeBoard, fallbackBoard, cueSheet, TEMPLATES, checkBoard } from '../engine/storyboard.mjs'
import { checkKit, kitBoard, kitPrompt, checkStory, storySource, storyBoard } from '../engine/filmkit.mjs'
import { filmRoutes, filmSourceOf, inside } from './film.mjs'
import { scoreWav, elevenScore } from '../engine/score.mjs'
import { decode, analyse, cutToMusic, planLengths, leastLengths, retime } from '../engine/musiccut.mjs'
import { readMedia, readSays, mediaCaps, defaultMedia, takesSays } from '../engine/mediareader.mjs'
import { reviewFilm } from '../engine/filmcritic.mjs'
import { breakdown, merge as mergeRefs, refDir, safeName, kindOf } from '../engine/reference.mjs'
import { mediaKeys, mediaSources, mcpScore, clipJobs, KEYS as MEDIA_KEYS, ELEVEN_MCP } from '../engine/media.mjs'
import { idleOptions, optionOf, idleKey, priceOk, idleStartName, idlePrompt, idleMessages, IDLE_SAY } from '../engine/idle.mjs'
import { heavyConfig, runHeavy, interpOf } from '../engine/heavy.mjs'
import { snapStore } from './snaps.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BOOTED = Date.now()
const webDir = join(root, 'web')
const uiDist = join(root, 'ui', 'dist')
const runsDir = process.env.SWARM_RUNS_DIR || join(root, 'runs')
const dataDir = process.env.SWARM_DATA_DIR || root
const argPort = process.argv.indexOf('--port')
const port = Number(argPort >= 0 ? process.argv[argPort + 1] : process.env.SWARM_PORT || 4319)

// Endpoint and model per role (Nous catalog review, point 2). By default every model call goes to Hermes:
// the studio's own loopback endpoint /llm/v1 (engine/hermesllm.mjs) forwards it to the Hermes bridge, and
// Hermes answers with its own provider, model and key, so no provider key ever reaches this process.
// The one exception is the plugin's own SWARM_STUDIO_API_KEY, when the person set it: then the roles call
// SWARM_STUDIO_BASE_URL with it directly. (SWARM_API_KEY / SWARM_<ROLE>_API_KEY do the same for running
// the server by hand, without Hermes.) Keys stay in memory: they are never written to a run's files.
const DEFAULT_BASE = 'https://api.inferhub.dev/v1'
const DEFAULT_MODEL = 'cb/deepseek-v4.1-flash'
const hermes = hermesBridge()
// Is Hermes there, and if not, why not (closed, or running an older copy of the plugin): asked before a
// build starts, so a build with nobody to answer its model calls is refused at once, with the reason
// (SWARM_HERMES_RUNNING=0|1 stands in for the process check in tests: a test server is never the one a
// running Hermes attaches to, so the real check would call that Hermes outdated)
const health = hermesHealth({ bridge: hermes, root, ...(/^[01]$/.test(process.env.SWARM_HERMES_RUNNING || '') ? { running: async () => process.env.SWARM_HERMES_RUNNING === '1' } : {}) })
// a model call that found no Hermes for its grace period stops the build in flight with Hermes's reason
const hermesGone = why => {
  if (!current || current.done || current.controller.signal.aborted) return
  // Hermes was there when this build started (it was checked), so "not connected" now means it closed
  const said = why.code === 'hermes_closed' ? HERMES_SAYS.gone : why
  current.controller.abort({ ...said, code: 'hermes' })
}
const llm = hermesLlm({ bridge: hermes, port: () => port, broadcast: e => broadcast(e), health, onGone: hermesGone, graceMs: Number(process.env.SWARM_HERMES_GRACE_MS) || 20000 })
const envRole = (role, fallback = DEFAULT_MODEL) => {
  const apiKey = process.env[`SWARM_${role}_API_KEY`] || process.env.SWARM_API_KEY || process.env.SWARM_STUDIO_API_KEY || ''
  if (!apiKey) return { ...llm.provider(), model: role.toLowerCase() }
  return {
    baseUrl: process.env[`SWARM_${role}_BASE_URL`] || process.env.SWARM_BASE_URL || process.env.SWARM_STUDIO_BASE_URL || DEFAULT_BASE,
    apiKey,
    model: process.env[`SWARM_${role}_MODEL`] || process.env[`SWARM_STUDIO_${role}_MODEL`] || fallback
  }
}
// the reviewer follows Hermes's vision model; with a key of its own it has no default
const models = { planner: envRole('PLANNER'), worker: envRole('WORKER'), reviewer: envRole('REVIEWER', '') }
const ROLES = ['planner', 'worker', 'reviewer']
const viaHermes = role => models[role].hermes === true
const provider = role => ({ baseUrl: models[role].baseUrl.replace(/\/$/, ''), apiKey: models[role].apiKey, ...(viaHermes(role) ? { hermes: true } : {}) })
// Before work that calls the model: null when it can go ahead, else the 503 body that says why not
// ({error, code: 'hermes_closed' | 'hermes_updated', message, action, hermes: true}). Only roles that
// go through Hermes are asked about; a build with its own key does not need Hermes.
async function hermesGate() {
  if (!ROLES.some(r => viaHermes(r) && picks[r] !== 'off')) return null
  const h = await health.ready().catch(() => null)
  if (!h || h.ok) return null
  return { error: `${h.message} ${h.action}`, code: `hermes_${h.code}`, message: h.message, action: h.action, hermes: true }
}

// Picks made in the canvas's Models menu. Model names only (each role keeps the
// endpoint and key Hermes gave it), kept in the plugin's data dir, never in
// Hermes's own config. A role without a pick uses what Hermes sends.
const picksFile = join(dataDir, 'models.json')
let picks = {}
try { picks = JSON.parse(readFileSync(picksFile, 'utf8')) } catch {}
const modelFor = role => (picks[role] === 'off' ? '' : viaHermes(role) ? roleModel(role, picks[role]) : picks[role] || models[role].model)
// Settings › Background (decision 0017, issue #450): when an app's server stops with nobody looking (minutes) and when this
// server exits with nothing to do (minutes, 0 never). SWARM_APP_IDLE_MIN / SWARM_SERVER_IDLE_MIN win over the pick.
const STOP_PICKS = { app: [1, 2, 5, 15], server: [10, 20, 60, 0] }
const envMin = k => (process.env[k] !== undefined && process.env[k] !== '' && Number.isFinite(Number(process.env[k])) ? Number(process.env[k]) : null)
const idleStops = () => ({
  app: envMin('SWARM_APP_IDLE_MIN') ?? (STOP_PICKS.app.includes(picks.stops?.app) ? picks.stops.app : 2),
  server: envMin('SWARM_SERVER_IDLE_MIN') ?? (STOP_PICKS.server.includes(picks.stops?.server) ? picks.stops.server : 20)
})

// Model ids each endpoint offers, for the pickers. Fetched once per endpoint.
const modelLists = new Map()
// each listed model's row (its `modality` says what it takes), for the media reader
const modelRows = new Map()
function listModels(role) {
  const m = models[role]
  // through Hermes the model is Hermes's slot; there is no list to pick from
  if (!m.apiKey || viaHermes(role)) return Promise.resolve([])
  if (!modelLists.has(m.baseUrl)) {
    modelLists.set(m.baseUrl, fetch(`${m.baseUrl.replace(/\/$/, '')}/models`, { headers: { authorization: `Bearer ${m.apiKey}` }, signal: AbortSignal.timeout(15000) })
      .then(r => r.json())
      .then(j => { for (const x of j.data || []) if (x?.id) modelRows.set(x.id, x); return (j.data || []).map(x => x.id).filter(Boolean).sort() })
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

// hermes_models.py's helpers (the Setup sheet's model picker), run once in Hermes's Python under the
// profile's HERMES_HOME; `input` goes in on stdin, so a pasted key is never a process argument
const pyModels = (call, input = '', timeout = 60000) => new Promise(resolve => {
  if (!PY) return resolve({ ok: false, message: 'Start Swarm Studio from Hermes to pick a model.' })
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(root)}); import hermes_models; print(json.dumps(hermes_models.${call}))`
  const child = execFile(PY, ['-c', code], { env: pyEnv, cwd: root, timeout, maxBuffer: 4 << 20 }, (err, stdout) => {
    const line = String(stdout || '').trim().split('\n').pop()
    try { resolve(JSON.parse(line)) } catch { resolve({ ok: false, message: err ? String(err.message || err).split('\n')[0] : 'Hermes did not answer.' }) }
  })
  child.stdin?.end(input)
})

// ---------- pictures and clips, through Hermes's own image_generate and video_generate tools
// The Hermes bridge (engine/bridge.mjs, bridge.py, docs/specs/33-hermes-bridge.md): a Hermes process with the
// plugin loaded attaches a loopback bridge, and Hermes paints with the provider and key it is set up with.
// No provider key reaches this server.
const PY = process.env.SWARM_HERMES_PY || ''
// Hermes's Python finds Hermes by HERMES_HOME and its import paths (the Feed and connector helpers)
const pyEnv = hermesEnv({ PYTHONPATH: process.env.SWARM_HERMES_PYTHONPATH || '' })
// the ElevenLabs key pasted in the Film panel (engine/media.mjs)
const mediaKeyStore = mediaKeys(dataDir)
// Generated pages served from this origin (/site/, /video/…/live/) run in an opaque origin (Nous catalog review, point 4)
const SITE_CSP = 'sandbox allow-scripts'
const HERMES_IMAGE = { provider: 'hermes', available: true, models: [], default: '' }
const imagegenHermes = async (args, timeout) => {
  if (args[0] === '--list') {
    const m = await hermes.call('/media', undefined, 10000)
    return { ok: true, providers: [{ ...HERMES_IMAGE, available: !m.absent && m.image?.available !== false }] }
  }
  return hermes.call('/image', imageBody(args), timeout || 300000)
}
// ckff (engine/ckff.mjs) is an image provider of the studio's own: an OpenAI-shaped image API with
// its own key (CKFF_API_KEY). With a key it is listed beside Hermes's image tool, so it can be
// picked in the Images menu and a build can paint with it when Hermes cannot.
const CKFF_MODELS = ['gpt-image-2.5', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2-4k']
const ckffProvider = () => (ckffCreds() ? { provider: 'ckff', available: true, models: CKFF_MODELS, default: process.env.CKFF_MODEL || CKFF_MODELS[0] } : null)
const argAfter = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? String(args[i + 1] || '') : '' }
const imagegen = (args, timeout) => {
  if (args[0] === '--list') return imagegenHermes(args, timeout).then(r => {
    const mine = ckffProvider(), listed = (r?.ok ? r.providers : []).filter(x => x.provider !== 'ckff')
    return mine ? { ok: true, providers: [...listed, mine] } : r
  })
  if (argAfter(args, '--provider') !== 'ckff') return imagegenHermes(args, timeout)
  // the same arguments as a Hermes picture; ckff has no centre-crop, so the picture comes back whole
  const refs = args.flatMap((x, i) => (x === '--ref' && args[i + 1] ? [args[i + 1]] : [])).filter(r => existsSync(r))
  return ckffPaint({ prompt: String(args[args.length - 1] || ''), aspect: argAfter(args, '--aspect') || 'landscape', refs, model: argAfter(args, '--model') || undefined, timeoutMs: timeout || 300000 })
}
// moving clips from a still, through Hermes's own video_generate (the provider Hermes is set up with)
const videogen = async (args, timeout) => {
  if (args[0] === '--list') {
    const m = await hermes.call('/media', undefined, 10000)
    return { ok: true, providers: [{ provider: 'hermes', label: 'Hermes', model: '', available: !m.absent && m.video?.available !== false }] }
  }
  const { out, ...body } = videoBody(args)
  const r = await hermes.call('/video', body, timeout || 600000)
  if (!r.ok || !out) return r
  // the bridge keeps the clip in Hermes's folder; the run gets its own copy
  try { mkdirSync(dirname(out), { recursive: true }); copyFileSync(r.path, out) } catch (err) { return { ok: false, error: `could not keep the clip: ${err.message}` } }
  return { ...r, path: out }
}
let imageProviders = null, videoProviders = null
const loadImageProviders = () => (imageProviders ||= imagegen(['--list'], 60000).then(r => (r.ok ? r.providers : [])))
const loadVideoProviders = () => (videoProviders ||= videogen(['--list'], 60000).then(r => (r.ok ? r.providers : [])))
loadImageProviders()
loadVideoProviders()
// The image model for new builds: the pick, else Hermes's own image tool when a Hermes process is attached.
// A pick that is not signed in falls back to one that is (engine/paintretry.mjs chooseImage), so
// a stale pick never leaves a build without pictures.
async function imageChoice() {
  if (picks.image === 'off') return null
  return chooseImage(await loadImageProviders(), picks.image)
}

// The one-time Setup sheet (docs/specs/06-onboarding.md): what builds use for pictures (the
// `pictures` pick: painted, stock or drawn) and whether the planner and the builders answer.
const setup = setupRoutes({
  dataDir,
  roles: () => ({ planner: { ...models.planner, model: modelFor('planner') }, worker: { ...models.worker, model: modelFor('worker') } }),
  call: (p, model) => streamChat({ baseUrl: p.baseUrl.replace(/\/$/, ''), apiKey: p.apiKey, ...(p.hermes ? { hermes: true } : {}) }, { trace: { kind: 'setup-test' }, model, maxTokens: 16, temperature: 0, messages: [{ role: 'user', content: 'Say ok' }], signal: AbortSignal.timeout(30000) }),
  image: async () => ({ providers: await loadImageProviders(), imagePick: picks.image || null, pick: picks.pictures || null }),
  media: () => mediaState(),
  feed: PY ? call => pyCommand(call, 60000) : null,
  hermesModels: PY ? pyModels : null,
  // a pick in Hermes's slots replaces the canvas's own picks for those roles, so Hermes answers with it
  clearPicks: () => { delete picks.planner; delete picks.worker; try { writeFileSync(picksFile, JSON.stringify(picks, null, 2)) } catch {} },
  hermesEnv: () => pyEnv,
  setPictures: mode => { if (mode) picks.pictures = mode; else delete picks.pictures; try { writeFileSync(picksFile, JSON.stringify(picks, null, 2)) } catch {} }
})
// What one build does for pictures: its own `pictures`, else the Setup pick, else the default
async function picturesFor(own) {
  const choice = await imageChoice()
  const mode = isPictures(own) ? own : (await setup.pictures()).mode
  return { choice, mode, ...pictureRun(mode, choice) }
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
async function checkArt(path, guide, messages = art.checkMessages) {
  const model = modelFor('reviewer')
  if (!model || !models.reviewer.apiKey || !/\.(webp|png|jpe?g)$/i.test(path)) return { ok: true, problems: [], skipped: true }
  const ext = extname(path).slice(1).toLowerCase().replace('jpg', 'jpeg')
  const image = `data:image/${ext};base64,${readFileSync(path).toString('base64')}`
  const chain = [model, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? ART_CHECK_FALLBACKS.filter(m => m !== model) : [])]
  for (const m of chain) {
    try {
      const res = await streamChat(provider('reviewer'), { trace: { kind: 'art-check' }, model: m, messages: messages(guide, image), maxTokens: 300, temperature: 0, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal: AbortSignal.timeout(45000) })
      const verdict = art.parseCheck(res.text)
      if (verdict.unread) continue
      return { ...verdict, model: m }
    } catch {}
  }
  return { ok: true, problems: [], skipped: true }
}
// One picture through the art director. A picture sent back is made once more with
// the reasons in its prompt; the second one stands.
// another image source than the one in use: ckff first, then Hermes, then any other
async function backupImage(choice) {
  const list = (await loadImageProviders()).filter(x => x.available && x.provider !== choice?.provider)
  // ckff first when it has a key: it is the one that still paints when a Hermes login is out of quota
  const p = list.find(x => x.provider === 'ckff') || list.find(x => x.provider === 'hermes') || list[0]
  return p ? { provider: p.provider, model: p.default || '' } : null
}
async function paintArt(choice, guide, { gen, aspect = 'landscape', hero = false, cutout = false, ref = '' }, onSentBack) {
  // ref: a picture to match in style (the hero's sprite, for a figure or prop painted to stand beside it)
  let withRef = !!(ref && existsSync(ref))
  const once = (c, strict) => { const pick = art.tierFor(c, { hero }); return imagegen(['--provider', pick.provider, ...(pick.model ? ['--model', pick.model] : []), '--aspect', aspect, ...(withRef ? ['--ref', ref] : []), art.promptFor(gen, guide, { aspect, strict, cutout })], hero ? 300000 : 150000) }
  // a refusal that isn't out of quota: once more after a pause, then on another provider (engine/paintretry.mjs)
  let first = await paintWithBackup(c => once(c, ''), { choice, backup: () => backupImage(choice), quota: OUT_OF_QUOTA, exists: existsSync })
  // out of quota on a Hermes login: ckff paints it when it has a key, rather than no picture
  if (OUT_OF_QUOTA.test(String(first?.error || '')) && choice?.provider !== 'ckff' && ckffProvider()) {
    const alt = { provider: 'ckff', model: ckffProvider().default }, other = await once(alt, '')
    if (other?.ok && other.path && existsSync(other.path)) first = { ...other, backup: alt }
  }
  // not every provider takes a reference picture: without one, rather than no picture
  if (withRef && (!first.ok || !first.path || !existsSync(first.path)) && !OUT_OF_QUOTA.test(String(first.error || ''))) {
    withRef = false
    first = await paintWithBackup(c => once(c, ''), { choice, backup: () => backupImage(choice), quota: OUT_OF_QUOTA, exists: existsSync })
  }
  if (!first.ok || !first.path || !existsSync(first.path)) return first
  const used = first.backup || choice, pick = art.tierFor(used, { hero })
  const go = strict => once(used, strict)
  const r = { ...first, model: first.model || pick.model }
  const check = await checkArt(r.path, guide)
  if (check.ok) return { ...r, check }
  onSentBack?.(check)
  const again = await go(check.problems.join('; '))
  if (!again.ok || !again.path || !existsSync(again.path)) return { ...r, model: r.model || pick.model, check }
  return { ...again, model: again.model || pick.model, check: await checkArt(again.path, guide), retried: true, backup: first.backup }
}

// One picture for a finished section: a new one asked for in an edit, or a
// replacement. It keeps the <img>'s data-gen as its key, so every canvas, the
// export and the video pick up the newest one.
// asked: a person asked for this picture in a comment, so the chat says when it lands ({ agent })
function paintOne(send, runId, { page, layer, gen, prompt, asked = null }, choice) {
  const who = asked ? { asked: true, agent: asked.agent } : {}
  send('image:queued', { page, layer, gen, provider: choice.provider, model: choice.model, ...who })
  const sentBack = c => send('image:sent-back', { page, layer, gen, problems: c.problems, model: c.model })
  return paintArt(choice, guideFor(runId), { gen: prompt || gen, hero: art.isHero({ layer }) }, sentBack).then(r => {
    if (!r.ok || !r.path || !existsSync(r.path)) return send('image:failed', { page, layer, gen, message: r.error || 'no image', ...who })
    const file = `edit-${Date.now().toString(36)}${extname(r.path) || '.png'}`
    mkdirSync(join(runsDir, runId, 'img'), { recursive: true })
    copyFileSync(r.path, join(runsDir, runId, 'img', file))
    send('image', { page, layer, gen, src: `/img/${runId}/${file}`, model: r.model || choice.model, prompt: prompt || undefined, ...who })
  })
}
// A comment that is only about a section's picture (engine/picask.mjs): the picture is painted again from a new
// prompt and the section's HTML is not touched, so the layout the person had stays. One paint per section at a
// time: asking again while it paints says so instead of starting another.
const repainting = new Set()
async function repaint(runId, send, s, agent, text, gen, choice) {
  const layer = s.key.split('/').pop(), page = s.key.split('/')[0], key = `${runId}|${s.key}`, role = s.role || layer
  if (repainting.has(key)) return send('comment:take', { text, page, layer, role, agent, picture: true, reply: `Still painting the last picture for the ${role}. It lands in a moment.` })
  repainting.add(key)
  send('comment:take', { text, page, layer, role, agent, picture: true, reply: `On it, painting a new picture for the ${role}. About a minute; the layout stays as it is.` })
  try {
    const chat = models.worker.apiKey && modelFor('worker') ? async messages => (await streamChat(provider('worker'), { trace: { kind: 'picture-prompt', agent, page, layer }, model: modelFor('worker'), maxTokens: 220, temperature: 0.7, signal: AbortSignal.timeout(30000), messages })).text : null
    const prompt = await newPrompt({ gen, comment: text, role, chat })
    await paintOne(send, runId, { page, layer, gen, prompt, asked: { agent } }, choice)
  } catch (err) {
    send('image:failed', { page, layer, gen, message: String(err.message || err).slice(0, 200), asked: true, agent })
  } finally { repainting.delete(key) }
}
// After a rewrite: paint the <img data-gen> it added (ones painted before keep their picture).
function paintNew(runId, send, page, layer, html, choice) {
  const had = new Set((readEvents(runId) || []).filter(e => e.type === 'image' && e.page === page && e.layer === layer).map(e => e.gen))
  const gens = [...new Set([...String(html).matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"/g)].map(m => m[1]))].filter(g => !had.has(g)).slice(0, 2)
  for (const gen of gens) paintOne(send, runId, { page, layer, gen }, choice)
}
// Pictures are slow, so they are a step of their own: slots are noted as their sections land (the
// canvas shows a stand-in photo in each), and painting starts once the layout pass is over
// (start(), on run:done). Sections that land after that (a review fix) are painted at once.
function imageQueue(run, emit, choice) {
  const jobs = []
  let active = 0, n = 0, held = true
  const pump = () => {
    while (!held && active < 2 && jobs.length) {
      const job = jobs.shift()
      active++
      const sentBack = c => emit('image:sent-back', { page: job.page, layer: job.layer, gen: job.gen, problems: c.problems, model: c.model })
      paintArt(choice, run.art || art.styleGuide({ brief: run.brief }), { gen: job.gen, aspect: job.aspect, hero: art.isHero({ layer: job.layer, n: job.n }) }, sentBack)
        .then(r => {
          setup.notePaint(choice, r)
          if (!r.ok || !r.path || !existsSync(r.path)) return emit('image:failed', { page: job.page, layer: job.layer, gen: job.gen, message: r.error || 'no image' })
          const file = `${job.n}${extname(r.path) || '.png'}`
          mkdirSync(join(run.dir, 'img'), { recursive: true })
          copyFileSync(r.path, join(run.dir, 'img', file))
          emit('image', { page: job.page, layer: job.layer, gen: job.gen, src: `/img/${run.id}/${file}`, model: r.model || choice.model, style: run.art?.style, checked: r.check && !r.check.skipped ? (r.check.ok ? 'ok' : 'sent back') : undefined })
        })
        .finally(() => { active--; pump() })
    }
  }
  const add = e => {
    for (const m of String(e.html || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"[^>]*>/g)) {
      if (n >= IMG_MAX || /\bsrc=/.test(m[0])) continue
      const box = String(e.html).slice(Math.max(0, m.index - 400), m.index)
      const aspect = /aspect-(square|\[1\/1\])/.test(box) ? 'square' : /aspect-\[(3\/4|2\/3|4\/5|9\/16)\]/.test(box) ? 'portrait' : 'landscape'
      jobs.push({ n: ++n, page: e.page, layer: e.layer, gen: m[1], aspect })
      emit('image:queued', { page: e.page, layer: e.layer, gen: m[1], provider: choice.provider, model: choice.model })
    }
    pump()
  }
  add.start = () => { held = false; pump() }
  // a build that stopped before its layout was done paints nothing: its waiting slots are let go
  add.drop = message => { if (!held) return; for (const job of jobs.splice(0)) emit('image:failed', { page: job.page, layer: job.layer, gen: job.gen, message }) }
  // Stop: pictures not started are let go; one already with the image model is kept when it lands
  add.stop = () => { held = true; for (const job of jobs.splice(0)) emit('image:failed', { page: job.page, layer: job.layer, gen: job.gen, message: 'stopped' }) }
  // a stopped queue is not busy: the one picture already at the provider lands, nothing more starts
  add.busy = () => !held && (active > 0 || jobs.length > 0)
  return add
}
const host = url => { try { return new URL(url).host } catch { return '' } }
const defaultAgents = Number(process.env.SWARM_AGENTS || 8)

// Runs spend the user's API credits, so starting one (and watching one) needs
// this token. The canvas page carries it inline; other websites can't read
// that page (no CORS on it, and the Host check stops DNS rebinding).
const token = process.env.SWARM_TOKEN || randomBytes(24).toString('base64url')
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

let current = null // { id, events: [], controller, done, result, working }

// Stop: one switch per build. The review and fix passes and the film started for a build listen
// to its signal; Stop aborts it (their model calls and renders end there), and work started
// afterwards gets a fresh one. The build itself stops through its own controller.
const stops = new Map()
const stopSignal = id => { let c = stops.get(id); if (!c || c.signal.aborted) stops.set(id, c = new AbortController()); return c.signal }
const stopOr = (sig, ms) => AbortSignal.any([sig, AbortSignal.timeout(ms)])
const fixing = new Map() // run id -> sections being rewritten after a review or a comment
const clients = new Set()

function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) res.write(line)
}

const LATE_PICTURE = new Set(['image', 'image:failed', 'image:sent-back'])
function startRun({ brief, agents, base = null, ask = '', resume = false, project = null, piece = null, pageType = '', pictures = '', brand = null, template = '' }) {
  current?.controller.abort('replaced')
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(runsDir, id)
  mkdirSync(dir, { recursive: true })
  // the start request names a project (its id or its name): the run joins it as a piece (docs/specs/18-projects.md)
  const wanted = typeof project === 'string' ? project.trim().slice(0, 64) : ''
  if (wanted || PIECES.includes(piece)) {
    const pid = wanted ? projects.resolve(wanted) : null
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({
      // a project id that is gone (or in Trash) is not a name
      ...(pid ? { project: pid } : wanted && !/^\d{4}-\d\d-\d\dT[\d-]+Z$/.test(wanted) && !isScreenName(wanted) ? { projectName: wanted.slice(0, 48) } : {}),
      ...(PIECES.includes(piece) ? { piece } : {})
    }))
  }
  const run = { id, dir, events: [], controller: new AbortController(), done: false, result: null, working: new Set(), brief }
  current = run
  // a follow-up keeps the last version's art style, so new pictures match the old ones
  if (base) rehomeImages(base, runsDir, dir, id, { existsSync, mkdirSync, copyFileSync, join })
  if (base?.art) { run.art = Object.fromEntries(Object.entries(base.art).filter(([k]) => !['type', 't', 'run'].includes(k))); guides.set(id, run.art) }
  let images = null

  const emit = (type, data) => {
    // A newer build has started. This one's layout stops there, but a picture it was already having
    // painted still belongs to it: it goes into this build's own file (and to anyone looking at it).
    // Before, these were dropped and a finished build sat at "0 of 8" with its pictures on disk.
    if (current !== run) { if (LATE_PICTURE.has(type)) record(id, { type, t: Date.now(), run: id, ...data }); return }
    // every stop names its cause: the person, a newer build, Hermes gone, or (below) the model
    if (type === 'run:stopped' && !data?.reason) data = { ...data, reason: reasonFromAbort(run.controller.signal.reason) }
    // a build that ended with nothing planned because the planner failed did not finish: it stopped, and
    // the provider's own words say why (a 402 budget cap, a timeout); "0 sections" said nothing
    if (type === 'run:done' && !data?.planned && !data?.extend) {
      const failed = [...run.events].reverse().find(e => e.type === 'error' && (e.where === 'planner' || e.where === 'run'))
      if (failed) { type = 'run:stopped'; data = { ...data, stopped: true, reason: reasonFromFailure(failed.message, { viaHermes: viaHermes('planner') }) } }
    }
    // stopped before its pictures: the slots keep their stand-ins, and run:stopped stays the last word
    if (type === 'run:stopped') images?.drop('stopped')
    // run:start says whether the pictures will be painted: the deck tags a stand-in "real picture coming" only then
    const event = { type, t: Date.now(), run: id, ...data, ...(type === 'run:start' ? { paint: !!run.paint } : {}) }
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
    // the layout pass is over: now the pictures are painted
    if (type === 'run:done' && images) images.start()
    if (type === 'run:stopped') { run.done = true; run.stopped = true; run.working.clear() }
  }

  if (!models.planner.apiKey || !models.worker.apiKey) {
    queueMicrotask(() => emit('error', { where: 'models', message: 'No model key yet. Start a build from Hermes once (/swarm, the chat tool or `hermes swarm`) so it can pass its model settings, or set SWARM_STUDIO_API_KEY.' }))
    return run
  }
  picturesFor(pictures).then(pic => {
    if (current !== run) return
    if (run.controller.signal.aborted) return emit('run:stopped', { ms: 0, planned: 0, done: 0, failed: 0, pages: 0, stopped: true })
    // painted: the slots are painted; stock: stand-in photos keep them; drawn: no slots at all
    run.paint = pic.paint
    if (pic.paint) { run.images = images = imageQueue(run, emit, pic.choice); painters.set(id, images) }
    return withTrace(id, () => runSwarm({
    images: pic.images,
    provider: provider('planner'),
    workerProvider: provider('worker'),
    brief,
    base,
    ask,
    resume: !!base && resume === true,
    brand,
    // the last builds' page types and colours, so this one looks different
    recent: recentLooks(runsDir),
    // a page type the request names (PAGE_TYPES key) wins over the pick
    pageType: typeof pageType === 'string' ? pageType : '',
    // the design template the person picked (engine/odlibrary.mjs), for the planners
    template: typeof template === 'string' ? template : '',
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
    .catch(err => {
      if (run.controller.signal.aborted) return emit('run:stopped', { stopped: true })
      const message = String(err.message || err)
      emit('error', { where: 'run', message })
      images?.drop('the build stopped before its pictures')
      emit('run:stopped', { stopped: true, ms: 0, planned: 0, done: 0, failed: 0, pages: 0, reason: reasonFromFailure(message, { viaHermes: viaHermes('planner') }) })
    })
  return run
}

// Saved runs are the studio's files: each one reopens as its own canvas.
const RUN_ID = /^[\w-]{1,64}$/
const picturesChecked = new Set()
function readEvents(id) {
  const file = join(runsDir, id, 'events.jsonl')
  if (!RUN_ID.test(id) || !existsSync(file)) return null
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
  // once per run: pictures that were painted but lost their event get it back (engine/assets.mjs)
  if (!picturesChecked.has(id) && current?.id !== id) {
    picturesChecked.add(id)
    let img = []
    try { img = readdirSync(join(runsDir, id, 'img')) } catch {}
    const lost = lostPictures({ id, events, img, max: IMG_MAX })
    for (const e of lost) { appendFileSync(file, JSON.stringify(e) + '\n'); events.push(e) }
  }
  return events
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

// Stop one build's work: its layout pass (workers take no more sections, the model calls in flight
// are aborted), the pictures not started yet, review and fix passes, a film, an app or game build.
// What is built is kept. Answers what was stopped; a build that was working gets a stop event.
// every build's picture queue by run id (a newer build does not end an older one's painting)
const painters = new Map()
async function stopRun(id) {
  const what = []
  if (current?.id === id && !current.done && !current.controller.signal.aborted) { current.controller.abort('person'); what.push('build') }
  // the pictures of any build, not only the newest: a project's older version may still be painting
  const pics = painters.get(id)
  if (pics?.busy()) { pics.stop(); what.push('pictures') }
  const halt = stops.get(id)
  if (halt && !halt.signal.aborted) {
    if ([...reviewing].some(t => t.startsWith(`${id}/`))) what.push('review')
    if (fixing.get(id) > 0) what.push('fixes')
    if (videos.get(id)?.state === 'working') what.push('film')
    halt.abort()
  }
  const a = appsNow?.jobs?.get(id)
  if (a?.state === 'working') { await (await apps()).stop(id); what.push(a.kind === 'game' ? 'game' : 'app') }
  // the build's own run:stopped comes from the engine; the rest say so here
  const rest = what.filter(w => w !== 'build')
  if (rest.length) record(id, { type: 'work:stopped', t: Date.now(), run: id, what: rest })
  return what
}
// Stop everything in flight for a build's project (run or project named), or, with neither, all of it
async function stopWork({ run, project } = {}) {
  const ids = new Set()
  if (RUN_ID.test(String(run || ''))) ids.add(run)
  // the project named and the project of the run on screen (they differ right after New project)
  const pids = [...new Set([typeof project === 'string' && project ? project : null, run && RUN_ID.test(run) ? projects.projectOf(run) : null].filter(Boolean))]
  for (const p of pids.map(x => projects.get(x)).filter(Boolean)) for (const id of [...p.versions.map(v => v.id), ...Object.keys(p.parts || {})]) ids.add(id)
  const all = !ids.size && !pids.length
  if (all) {
    if (current) ids.add(current.id)
    for (const id of stops.keys()) ids.add(id)
    for (const [id, a] of appsNow?.jobs || []) if (a.state === 'working') ids.add(id)
  }
  const stopped = []
  const au = auto.state()
  if (au?.state === 'working' && (all || ids.has(au.run))) { auto.stop(); stopped.push({ run: au.run, what: ['auto'] }); if (au.run) ids.add(au.run) }
  for (const id of ids) {
    const what = await stopRun(id)
    if (what.length) stopped.push({ run: id, what })
  }
  return { stopped }
}

// What a run is working on right now, if anything: the site build, an app or game build, a film.
// { what: site | app | game | film, stage, pct (0..1, or null when the job cannot say) }
let appsNow = null // the app jobs, once loaded, so this can stay synchronous
// a Studio process that started a build: still running? (a killed one leaves its app:start behind)
const appAlive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
function workOf(id) {
  if (current?.id === id && !current.done) {
    const plan = current.events.filter(e => e.type === 'layer:plan').length
    return { what: 'site', stage: plan ? 'building pages' : 'planning', pct: Math.min(1, current.events.filter(e => e.type === 'layer:done').length / Math.max(1, plan || 12)) }
  }
  if (painters.get(id)?.busy()) return { what: 'site', stage: 'painting pictures', pct: null }
  if ([...reviewing].some(t => t.startsWith(`${id}/`)) || fixing.get(id) > 0) return { what: 'site', stage: 'reviewing', pct: null }
  const au = auto.state()
  if (au?.state === 'working' && au.run === id && !au.steps.some(s => s.state === 'working' && ['app', 'video'].includes(s.id))) return { what: 'site', stage: au.steps.find(s => s.state === 'working')?.label || 'auto', pct: null }
  const a = appsNow?.jobs?.get(id)
  if (a?.state === 'working') return { what: a.kind === 'game' ? 'game' : 'app', stage: clipStage(a.stage), pct: null, steps: a.steps?.length || 0, ...(a.kind === 'game' ? { progress: gameProgress(a.steps) } : {}) }
  const v = videos.get(id)
  if (v?.state === 'working') return { what: 'film', stage: clipStage(v.stage), pct: Math.min(1, (Number(v.pct) || 0) / 100) }
  return null
}
const clipStage = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60) || null

// A run's file card, from its events plus the person's meta. Cached by the
// events file's size and time, so listing many runs stays quick.
const cards = new Map()
const gameCover = id => { try { const f = readdirSync(join(runsDir, id, 'img')).find(n => /^game-title\.(webp|png|jpe?g)$/.test(n)); return f ? `/img/${id}/${f}` : null } catch { return null } }
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
    // an app build is named by its brief ("ARES Player Hub — ..."), not its first screen ("Sign in")
    const isApp = events.some(e => typeof e.type === 'string' && e.type.startsWith('app:'))
    const sites = {}
    for (const e of events) if (e.type === 'publish:done' && e.url) sites[e.target] = e.url
    // an app's own deploy (Auto or Deploy) is its public link too, so it can be posted to the Feed
    const deployed = events.findLast(e => e.type === 'app:deployed' && e.url && !e.pending)
    if (deployed && !sites.vercel) sites.vercel = deployed.url
    const video = events.findLast(e => e.type === 'video:done')
    card = { key, info: {
      id,
      // never a screen's title ("Sign In to ARES"): the brief's name before that
      title: start.title || (isApp && nameOfBrief(start.brief)) || (!isScreenName(pages[0]?.title) && pages[0]?.title) || nameOfBrief(start.brief) || start.brief.slice(0, 60),
      kind: start.kind || (isApp ? 'app' : 'site'),
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
      // the cover: the share picture the person chose for the home page, else the hero picture
      // the art director made, else the first picture; a game's own title picture once it is painted
      cover: (thumbOf(events)?.chosen && thumbOf(events).src) || (events.find(e => e.type === 'image' && e.src && art.isHero({ layer: e.layer })) || events.find(e => e.type === 'image' && e.src))?.src || gameCover(id),
      game: events.some(e => e.type === 'game:spec') || pages.some(p => /\b(play|game|arcade|trial)\b/i.test(`${p.id} ${p.title}`)),
      app: events.some(e => e.type === 'app:ready' || e.type === 'app:done'),
      planned: events.filter(e => e.type === 'layer:plan').length,
      // the last app build's outcome (as the app jobs read it): working (or stopped), built or failed
      build: (b => (b?.type === 'app:failed' && b.message === 'stopped') || (b?.type === 'app:start' && b.pid && !appAlive(b.pid)) ? 'stopped' : ({ 'app:start': 'working', 'app:done': 'built', 'app:failed': 'failed' })[b?.type] || null)(events.findLast(e => ['app:start', 'app:done', 'app:failed'].includes(e.type))),
      // how far a game build got, from its own steps (another Studio server may be running it)
      gameAt: events.some(e => e.type === 'game:spec') ? gameProgress(events.filter(e => e.type === 'app:step').map(e => e.step)) : null,
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
    cover: card.info.cover || snapsOf().cover(id) || snapOf(id) || (existsSync(join(runsDir, id, 'video', 'p1.webp')) ? `/video/${id}/live/p1.webp` : null),
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

// the pages' saved snapshots (server/snaps.mjs): the Overview paints from them, the cover is the first page's
let snaps = null
const snapsOf = () => (snaps ||= snapStore(runsDir))
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
    const { dir, claim } = shelf(id, 'video'), v = versions(dir, `${fileSlug(id)}-promo${shape === 'wide' ? '' : `-${shape}`}`, '.mp4')
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
  // each run says its project and which piece of it it is, so the Feed posts per project
  const index = projects.runIndex()
  return readdirSync(runsDir).filter(id => RUN_ID.test(id)).sort().reverse().slice(0, 300).flatMap(id => {
    const c = runCard(id)
    if (!c) return []
    const at = index.get(id)
    return [at ? { ...c, project: { id: at.project, name: at.name }, piece: at.piece } : c]
  })
}
// the project's name and the run's piece, for package and deploy names
// a build's version in its project: 1 for the first, 2 for the next…
const versionOf = id => { try { return projects.runIndex().get(id)?.version || 1 } catch { return 1 } }
const nameFor = id => { try { const at = projects.runIndex().get(id); return at ? { name: at.name, kind: at.piece } : null } catch { return null } }

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
// chat: open that chat in the Design deck (its target is the chat's id), where a question waits for the person
const CMD_OPS = new Set(['open', 'play', 'review', 'video', 'fix', 'export', 'motion', 'publish', 'chat'])
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
  // what the slop linter (engine/lint) still finds after each builder's own fix pass: the worst in each
  // section, handed on like the measured overlaps, and a section that ignores the design system's tokens (the
  // rest of a section's findings are P1 advice)
  const linted = sections.flatMap(s => lintSection(s.html, { tokens: theme?.system?.tokens }).filter(f => f.severity === 'P0' || f.id === 'tokens-unused').slice(0, 1)
    .map(f => ({ section: s.key, problem: clip(f.message, 160), fix: clip(f.fix, 220), lint: f.id })))
  // the same page at phone width, for a second look
  const phone = input.mobile && /^data:image\/(jpeg|png|webp);base64,/.test(String(input.mobile.image || '')) && Array.isArray(input.mobile.sections)
    ? { image: String(input.mobile.image), sections: input.mobile.sections.filter(s => s && keys.has(s.key)).map(s => ({ key: s.key, role: String(s.role || s.key), top: Math.round(s.top) || 0, height: Math.round(s.height) || 0 })) }
    : null
  const tag = `${id}/${input.page}`
  if (reviewing.has(tag)) throw new Error('this page is already being reviewed')
  reviewing.add(tag)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  const halt = stopSignal(id)
  try {
    const page = sections.map(s => ({ key: s.key, role: String(s.role || s.key), top: Math.round(s.top) || 0, height: Math.round(s.height) || 0 }))
    send('review:start', { page: input.page, model })
    // a busy or image-blind reviewer hands over to the next vision model on the same endpoint
    const chain = [model, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? REVIEW_FALLBACKS.filter(m => m !== model) : [])]
    const look = async (img, secs, label) => {
      for (const m of chain) {
        try {
          return { ...(await reviewPage({ provider: provider('reviewer'), model: m, brief: start.brief, page: label, sections: secs, image: img, signal: stopOr(halt, 60000) })), model: m }
        } catch (err) {
          if (m === chain.at(-1) || halt.aborted) throw err
        }
      }
    }
    const title = input.title || input.page
    let result
    try {
      ;[result] = await Promise.all([look(image, page, title), phone?.sections.length ? look(phone.image, phone.sections, `${title} (on a phone, 390px wide)`).then(r => { phone.result = r }, err => { phone.error = String(err.message || err).slice(0, 160) }) : null])
    } catch (err) {
      if (halt.aborted) { send('review:done', { page: input.page, model, verdict: 'stopped', issues: [], stopped: true }); return { verdict: 'stopped', issues: [] } }
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
    const all = [...measured, ...seen.filter(real), ...linted]
    const bySection = new Map()
    for (const i of all) {
      const had = bySection.get(i.section)
      if (!had) bySection.set(i.section, { ...i })
      else if (!had.problem.includes(i.problem)) { had.problem += `; ${i.problem}`; had.fix += `; ${i.fix}` }
    }
    const issues = [...bySection.values()].slice(0, 4)
    const verdict = phone?.result ? `${result.verdict} On phones: ${phone.result.verdict}` : result.verdict
    // the page's score is the lower of desktop and phone; under the bar, the canvas reviews it again once fixed
    const scores = [result.score, phone?.result?.score].filter(n => n != null)
    const score = scores.length ? Math.min(...scores) : null
    const round = Math.max(1, Math.min(REVIEW_ROUNDS, Number(input.round) || 1))
    const again = reviewAgain({ score, issues, round })
    send('review:done', { page: input.page, model: result.model, verdict, issues, ms: result.ms, measured: measured.length, linted: linted.length, phone: !!phone?.result, phoneError: phone?.error, dropped, score, pass: REVIEW_PASS, round, again })
    // each issue goes to a builder, in parallel; the agents are the run's own
    const agents = start.agents || []
    issues.forEach((issue, i) => {
      const s = sections.find(x => x.key === issue.section)
      const layer = s.key.split('/').pop(), pageId = s.key.split('/')[0]
      const agent = agents[(i * 5 + 3) % Math.max(1, agents.length)]?.id
      send('review:issue', { page: pageId, layer, agent, problem: issue.problem, fix: issue.fix })
      rework(id, send, s, agent, theme, { problem: issue.problem, fix: issue.fix })
    })
    return { ...result, verdict, issues, score, round, again }
  } finally {
    reviewing.delete(tag)
  }
}

// ---------- promo video: the planner storyboards the build, HyperFrames renders it
const videos = new Map() // run id -> { state, pct, stage, src, file, seconds, message }
// one film renders at a time (engine/video.mjs renders): the next one says so while it waits
const QUEUED = 'waiting for another film to finish rendering'
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
  // a film run (spec 40) has no pages: its brand, references and assets are its material
  const filmRun = events?.find(e => e.type === 'run:start')?.kind === 'film'
  if (!filmRun && !events?.some(e => e.type === 'layer:done')) throw new Error('no such build, or nothing built yet')
  if (videos.get(id)?.state === 'working') return videos.get(id)
  const halt = stopSignal(id)
  const job = { state: 'working', pct: 0, stage: 'storyboard', t: Date.now() }
  videos.set(id, job)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  const progress = (pct, stage) => {
    if (halt.aborted) return
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
    let c = (filmRun && filmSourceOf(readEvents(id) || events, join(runsDir, id))) || collect(readEvents(id) || events, join(runsDir, id))
    const model = modelFor('planner')
    // the Video kit's locked spec, or the build's story (spec 40): their beats are the storyboard, in their words
    const kit = input.kit ? checkKit(input.kit) : null
    const story = input.story === true ? (() => { try { return checkStory(JSON.parse(readFileSync(join(runsDir, id, 'story.json'), 'utf8'))) } catch { return null } })() : input.story ? checkStory(input.story) : null
    if (input.story && !story) throw new Error('no story for this build yet')
    let fixedBoard = null
    if (story) {
      const pid = projects.projectOf(id)
      // a story's picture: a file in the run (img/…, shots/…, footage/…, or its /img/<run>/<file> address),
      // a page's shot from the Story cards (story/screens/<page>-desktop.jpg), or a reference (refs/<file>)
      const runDir = join(runsDir, id)
      const file = pic => (/^refs\//.test(pic.src) && pid ? refs.file(pid, pic.src.slice(5))?.file : null)
        || inside(runDir, String(pic.src || '').replace(new RegExp(`^/img/${id}/`), 'img/'))
        || (pic.kind === 'screen' && /^[\w-]{1,80}$/.test(pic.page || '') ? inside(runDir, `story/screens/${pic.page}-desktop.jpg`) : null)
      const made = storySource(story, c, file)
      c = made.c
      if (story.title) c.brand = story.title
      fixedBoard = storyBoard(story, c, made.at)
    } else if (kit?.beats.length) fixedBoard = kitBoard(kit, c)
    // the prompt shapes the film; a template is only a starting point the writer may borrow from
    const prompt = String(input.prompt || input.idea || (kit ? kitPrompt(kit) : '')).trim().slice(0, 600)
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
      // with an image model, the storyboard may ask for new story stills
      const shooter = await imageChoice().catch(() => null)
      if (fixedBoard) {
        scenes = checkBoard(fixedBoard, c, { prompt, seed, shots: !!shooter })
        if (shooter && scenes.some(sc => sc.shot)) await shootScenes(id, c, scenes, shooter, progress, notes)
        for (const sc of scenes) if (sc.shot) { sc.kind = 'title'; sc.layer = 'type'; delete sc.shot }
      } else {
      if (!model || !models.planner.apiKey) throw new Error('no planner model')
      scenes = await writeBoard({ provider: provider('planner'), model, c, prompt, template, notes, shots: !!shooter, seed, signal: stopOr(halt, 120000) })
      if (halt.aborted) throw new Error('stopped')
      if (shooter && scenes.some(sc => sc.shot)) await shootScenes(id, c, scenes, shooter, progress, notes)
      }
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
    send('video:story', { look: scenes.look, plan: scenes.plan, film: scenes.film || null, title: scenes.title, pace: scenes.pace, clips: c.clips.length, fx: scenes.fx, music: scenes.music, fixes: scenes.fixes, notes, scenes: scenes.map((s, i) => ({ kind: s.kind, layer: s.layer, seconds: s.seconds, camera: s.camera, cut: s.cut, cue: s.cue, sfx: s.sfx, headline: s.headline, accent: s.accent, speed: s.speed, image: picOf(s), agent: agents[(i * 3 + 1) % Math.max(1, agents.length)]?.id })) })
    stagePictures(c, dir)
    const t = await tools
    // a long take sped up for its beat: the footage itself is sped up, and the beat wears the 8× chip
    let fast = 0
    for (const sc of scenes) if (sc.kind === 'clip' && sc.speed > 1) {
      const f = c.clips.find(x => x.n === sc.clip)
      const name = `c${sc.clip}x${sc.speed}-${fast++}.mp4`
      try {
        await new Promise((ok, fail) => execFile(t.ffmpeg, ['-y', '-v', 'error', '-ss', String(sc.from || 0), '-i', f.file, '-t', String(Math.min(60, (sc.seconds + 0.5) * sc.speed)), '-an', '-vf', `setpts=PTS/${sc.speed},fps=30`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', join(dir, name)], { env: { PATH: t.path } }, err => (err ? fail(err) : ok())))
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
    // the music first, then the cuts on it (spec 26): the track is made to the planned lengths,
    // measured, and every cut moves onto its beats, hits, drop and quiet passages
    const planned = planLengths(scenes, voices, VOICE_LEAD)
    let lengths = planned, musicFile = null, fx = [], scoredBy = null, musicCut = null
    const tenv = { PATH: t.path }
    if (input.music !== false) {
      progress(2, 'scoring')
      const seconds0 = planned.reduce((a, b) => a + b, 0), cues0 = cueSheet(scenes, planned)
      // Hermes's secret, else Hermes's ElevenLabs connector, else a pasted key
      const key = process.env.SWARM_ELEVENLABS_KEY || mediaKeyStore.get('elevenlabs')
      const via = media?.music.via
      // a film run's music reference (the Video kit's dropped track) is the score, cut to as it is
      const ref = filmRun && ['mp3', 'wav', 'm4a', 'ogg', 'aac'].map(x => join(dir, `music.${x}`)).find(f => existsSync(f))
      if (ref) { musicFile = ref; scoredBy = 'reference' }
      if (!musicFile && input.eleven !== false && (key || via === 'hermes-mcp')) {
        try {
          progress(2, 'ElevenLabs is scoring the film')
          const e = via === 'hermes-mcp' && !process.env.SWARM_ELEVENLABS_KEY
            ? await mcpScore({ call: connectors.call, server: media.music.server, music: scenes.music, cues: cues0, seconds: seconds0, dir })
            : await elevenScore({ key, music: scenes.music, cues: cues0, seconds: seconds0, dir })
          musicFile = e.music; fx = e.sfx; scoredBy = 'elevenlabs'
        } catch (err) { send('video:note', { message: `ElevenLabs did not score it, so the studio did: ${String(err.message || err).slice(0, 100)}` }) }
      }
      if (!musicFile) { musicFile = join(dir, 'music.wav'); scoreWav({ seconds: seconds0, music: scenes.music, cues: cues0, file: musicFile, seed }); scoredBy = 'studio' }
      try {
        progress(2, 'cutting to the music')
        const { samples, rate } = await decode(t.ffmpeg, musicFile, { env: tenv })
        const a = analyse(samples, rate, { bpm: scenes.music?.bpm })
        const r = cutToMusic(scenes, planned, a, { min: leastLengths(scenes, voices, VOICE_LEAD), maxEnd: scoredBy === 'elevenlabs' || scoredBy === 'reference' ? a.seconds : null })
        lengths = r.lengths; musicCut = r.report
        // the studio's own score is written again to the final cuts, so its booms sit on them; a generated track stays as it is
        if (scoredBy === 'studio') scoreWav({ seconds: lengths.reduce((x, y) => x + y, 0), music: scenes.music, cues: cueSheet(scenes, lengths), file: musicFile, seed })
        else fx = fx.map(x => ({ ...x, at: retime(x.at, planned, lengths) }))
      } catch (err) { musicCut = { kept: `the track could not be measured: ${String(err.message || err).split('\n')[0].slice(0, 100)}` } }
    }
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
    // the square cut for feeds (spec 40), when the kit or the story asks for it
    const square = Array.isArray(input.shapes) && input.shapes.includes('square')
    const squareDir = join(dir, 'square')
    if (square) {
      mkdirSync(squareDir, { recursive: true })
      stagePictures(c, squareDir)
      for (const sc of scenes) if (sc.speedName) copyFileSync(join(dir, sc.speedName), join(squareDir, sc.speedName))
      writeFileSync(join(squareDir, 'index.html'), composition(scenes, c, lengths, transition, comp.look, { shape: 'square' }).html)
      files.square = SHAPES.square.file
    }
    const cues = cueSheet(scenes, lengths)
    writeFileSync(join(dir, 'storyboard.json'), JSON.stringify({ prompt, template: template || null, title: scenes.title, pace: scenes.pace, plan: scenes.plan, film: scenes.film || null, seed, look: comp.look, cast: scenes.cast, voice: scenes.voice, music: scenes.music, cues, fx: scenes.fx, notes, fixes: scenes.fixes, locked: kit || story ? { seconds: kit?.seconds || null, script: (story?.beats || kit?.beats || []).map(b => b.text).filter(Boolean) } : null, files, lengths, planned, musicCut, scoredBy, scenes }, null, 2))
    // the stills and motion lines for Flow (Veo): the flow-video skill animates them into <run>/flow/<still>.mp4,
    // and the next cut plays those clips instead of the stills
    writeFileSync(join(dir, 'flow-prompts.json'), JSON.stringify(scenes.filter(s => s.layer === 'story' && s.image).map(s => { const f = c.images.find(x => x.n === s.image); return { still: f.file, clip: join(runsDir, id, 'flow', `${basename(f.file).replace(/\.[^.]+$/, '')}.mp4`), camera: s.camera, seconds: s.seconds, action: `${(s.camera || 'slow push-in').replace('-', ' ')}, one continuous shot, small motions only, nothing appears or changes shape` } }), null, 2))
    progress(2, 'rendering')
    const quality = ['draft', 'standard', 'high'].includes(input.quality) ? input.quality : 'draft'
    const silent = join(dir, 'promo-silent.mp4'), out = join(dir, SHAPES.wide.file)
    const tallSilent = join(dir, 'promo-tall-silent.mp4'), tallOut = join(dir, SHAPES.tall.file)
    const squareSilent = join(dir, 'promo-square-silent.mp4'), squareOut = join(dir, SHAPES.square.file)
    rmSync(tallOut, { force: true }) // an older tall cut never sits beside a newer wide one
    rmSync(squareOut, { force: true })
    if (halt.aborted) throw new Error('stopped')
    await render({ tools: t, dir, out: silent, quality, signal: halt, onProgress: (pct, code) => progress(Math.max(2, Math.min(64, pct * 0.64)), code === 'queued' ? QUEUED : code === 'assemble' ? 'assembling' : 'rendering') })
    // the phone cut, unless the kit or the story named its shapes without it (the wide cut always renders: it carries the sound)
    let tall = !Array.isArray(input.shapes) || input.shapes.includes('tall')
    if (tall) try {
      await render({ tools: t, dir: tallDir, out: tallSilent, quality, signal: halt, onProgress: (pct, code) => progress(Math.max(64, Math.min(96, 64 + pct * 0.32)), code === 'queued' ? QUEUED : code === 'assemble' ? 'assembling the phone cut' : 'rendering the phone cut') })
    } catch (err) {
      tall = false
      send('video:note', { message: `no phone cut this time: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
    }
    let squared = false
    if (square) {
      try {
        await render({ tools: t, dir: squareDir, out: squareSilent, quality, signal: halt, onProgress: (pct, code) => progress(96, code === 'queued' ? QUEUED : code === 'assemble' ? 'assembling the square cut' : 'rendering the square cut') })
        squared = true
      } catch (err) { send('video:note', { message: `no square cut this time: ${String(err.message || err).split('\n')[0].slice(0, 160)}` }) }
    }
    let sound = false
    try {
      progress(98, 'mixing the sound')
      sound = await mix({ ffmpeg: t.ffmpeg, env: tenv, video: silent, musicFile, voices: voices.map((v, i) => v && { ...v, at: (cues.cuts[i - 1] || 0) + VOICE_LEAD }), fx, silence: cues.silence, out })
    } catch (err) {
      send('video:note', { message: `sound failed, the video is silent: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
    }
    if (!sound) copyFileSync(silent, out)
    // the phone cut takes the wide cut's finished sound as it is (same scenes, same timing)
    if (tall) {
      try {
        if (sound) await new Promise((ok, fail) => execFile(t.ffmpeg, ['-y', '-v', 'error', '-i', tallSilent, '-i', out, '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-shortest', '-movflags', '+faststart', tallOut], { env: { PATH: t.path } }, err => (err ? fail(err) : ok())))
        else copyFileSync(tallSilent, tallOut)
      } catch (err) {
        copyFileSync(tallSilent, tallOut)
        send('video:note', { message: `the phone cut is silent: ${String(err.message || err).split('\n')[0].slice(0, 160)}` })
      }
    }
    // the square cut takes the same finished sound
    if (squared) {
      try {
        if (sound) await new Promise((ok, fail) => execFile(t.ffmpeg, ['-y', '-v', 'error', '-i', squareSilent, '-i', out, '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-shortest', '-movflags', '+faststart', squareOut], { env: { PATH: t.path } }, err => (err ? fail(err) : ok())))
        else copyFileSync(squareSilent, squareOut)
      } catch { copyFileSync(squareSilent, squareOut) }
    }
    // a poster frame beside each cut, for the boards to show until the film is played (engine/poster.mjs)
    for (const f of [out, tall && tallOut, squared && squareOut].filter(Boolean)) await makePoster(f, { ffmpeg: t.ffmpeg })
    const copy = shelveVideo(id)
    if (tall) shelveVideo(id, 'tall')
    if (squared) shelveVideo(id, 'square')
    const v = Date.now()
    const tallSrc = tall ? `/video/${id}/${SHAPES.tall.file}?v=${v}` : null
    const squareSrc = squared ? `/video/${id}/${SHAPES.square.file}?v=${v}` : null
    if (!squared) delete files.square
    Object.assign(job, { state: 'done', pct: 100, src: `/video/${id}/promo.mp4?v=${v}`, tall: tallSrc, square: squareSrc, file: copy || out, tallFile: tall ? tallOut : null, seconds: comp.seconds })
    send('video:done', { src: job.src, tall: tallSrc, square: squareSrc, file: copy || out, saved: out, savedTall: tall ? tallOut : null, files: tall ? files : { wide: files.wide, ...(squared ? { square: files.square } : {}) }, seconds: comp.seconds, ms: Date.now() - job.t, voice: voices.some(Boolean), music: input.music !== false && sound, scoredBy })
    // the critic (spec 26 step 6, spec 32): the finished film is watched and listened to, and what is wrong
    // is named. It runs after the film is handed over, so it never holds the film back.
    if (!halt.aborted) {
      send('video:review', { state: 'running' })
      criticize({ ffmpeg: t.ffmpeg, file: out, dir, music: input.music !== false })
        .then(review => send('video:review', { state: 'done', ...review }))
        .catch(err => send('video:review', { state: 'failed', message: String(err.message || err).split('\n')[0].slice(0, 160) }))
    }
  })().catch(err => {
    Object.assign(job, { state: halt.aborted ? 'stopped' : 'failed', message: halt.aborted ? 'stopped' : String(err.message || err).slice(0, 300) })
    send('video:failed', { message: job.message })
  })
  return job
}

// ---------- the App tab's jobs, loaded the first time someone uses it
let appsP = null
const apps = () => (appsP ||= import('../engine/appjob.mjs').then(m => (appsNow = m.appJobs({ runsDir, record, broadcast, readEvents, provider, modelFor, paint: paintGame, fill: fillApp, nameFor, idleMs: () => idleStops().app * 60000 }))))

// ---------- ⚡ Auto mode: one prompt → design, review, video, app, games, credit shop, data, deploy
// sign-in connectors through Hermes (Supabase): no keys to paste
const connectors = hermesConnectors({ bridge: hermes, broadcast })

// The Film studio's outside services (engine/media.mjs): what Hermes already has, else a
// pasted key, else the built-in path. The canvas learns where each comes from, never a key.
async function mediaNow() {
  const [images, videos, mcp] = await Promise.all([
    loadImageProviders(), loadVideoProviders(),
    Promise.all(ELEVEN_MCP.map(n => connectors.status(n).then(st => [n, st], () => [n, {}]))).then(Object.fromEntries),
  ])
  return mediaSources({ env: pick(['SWARM_ELEVENLABS_KEY']), keys: mediaKeyStore, mcp, images, videos, imagePick: picks.image })
}
// The launch kit's pitch (engine/launch.mjs): one line on what the product is and who it is for,
// written by the planner from the pages the crew planned. Never the person's words to the crew.
async function writePitch(events, id) {
  const model = modelFor('planner')
  if (!model || !models.planner.apiKey) return ''
  const f = runFacts(events, id)
  const pages = events.filter(e => e.type === 'page').map(p => `- ${p.title}${p.purpose ? `: ${p.purpose}` : ''}`).join('\n')
  const r = await streamChat(provider('planner'), {
    trace: { kind: 'launch-pitch' }, model, maxTokens: 80, temperature: 0.4, signal: AbortSignal.timeout(20000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } },
    messages: [{ role: 'system', content: 'Write one plain line, under 110 characters, for a launch post: what this product is and who it is for. No hype words, no emoji, no hashtags, no quotes. Never mention AI, prompts, a crew or a build, and never repeat instructions the person gave.' },
      { role: 'user', content: `Product: ${f.name}\nPages:\n${pages}\nWhat the person asked for: ${f.prompt}` }]
  })
  return String(r.text || '').split('\n')[0].replace(/^["'“]+|["'”]+$/g, '').trim().slice(0, 150)
}
// nothing to launch yet: no live link and no video. A design alone is not a launch.
const launchable = f => !!(f.url || f.video)
async function launchKit(id) {
  const events = readEvents(id) || []
  if (!launchable(runFacts(events, id))) throw Object.assign(new Error('Nothing to launch yet: publish it first.'), { code: 409 })
  let pitch = ''
  try { pitch = await writePitch(events, id) } catch {}
  return writeLaunch(join(runsDir, id), events, id, { pitch })
}
const auto = autoJob({ runsDir, startRun, current: () => current, readEvents, record, broadcast, clients, makeVideo, videos, apps, credentials, dataDir, publishVercel, connectors,
  writeLaunch: launchKit })

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

// ---------- the person talks to the crew while it builds
// Talk (engine/talk.mjs) answers: a crew member whose only job is to talk, so the builder never
// stops for a question. It reads the app's files, looks at the pictures and shows them, and
// writes a change out for the person to confirm. Only a confirmation (confirm: the change)
// reaches the builder: at the start of the next slice, or now (the turn in flight stops and
// the slice starts again with it).
const imgFileOf = src => { const m = String(src || '').split('?')[0].match(/^\/img\/([A-Za-z0-9_-]{1,80})\/([A-Za-z0-9_.-]{1,120})$/); return m ? join(runsDir, m[1], 'img', m[2]) : null }
async function lookAt(src) {
  const model = modelFor('reviewer') || modelFor('planner'), file = imgFileOf(src)
  if (!model || !file || !existsSync(file) || statSync(file).size > 6e6) return null
  const ext = /\.png$/i.test(file) ? 'png' : /\.webp$/i.test(file) ? 'webp' : 'jpeg'
  const res = await streamChat(provider(modelFor('reviewer') ? 'reviewer' : 'planner'), {
    trace: { kind: 'talk-look' }, model, maxTokens: 220, temperature: 0.2, signal: AbortSignal.timeout(40000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Say in two or three plain sentences what this game picture shows: who or what, the pose or layout, the style and colours, and anything that looks wrong.' }, { type: 'image_url', image_url: { url: `data:image/${ext};base64,${readFileSync(file).toString('base64')}` } }] }]
  })
  return String(res.text || '').trim() || null
}
async function tellBuilder(a, id, text, { who = '', on = '', confirm = '', now = false } = {}) {
  // a confirmed change: to the builder, and nothing to answer but where it went
  if (confirm) {
    const r = now ? a.redirect(id, confirm) : a.tell(id, confirm)
    if (!r.queued) return { ...r, answer: 'The crew is not building right now, so there is nothing to send it to: say it in your answer to the slice.' }
    return { ...r, answer: r.now ? 'Sent. The builder stopped its turn and is doing this slice again with your change.' : now ? 'Sent. The builder is between turns, so it takes your change at the start of its next one.' : 'Sent. The builder takes it at the start of the next slice.' }
  }
  const t = String(text || '').trim().slice(0, 1200)
  if (!t) throw new Error('say something to the crew')
  const { processNotes, buildMedia, mediaNotes } = await import('../engine/appjob.mjs')
  const { talk } = await import('../engine/talk.mjs')
  const j = a.jobs.get(id)
  const st = a.state(id)
  const building = (j?.state || st?.state) === 'working'
  const events = readEvents(id) || []
  const lead = events.filter(e => e.type === 'crew:lead' && e.text).slice(-14).map(e => `- ${String(e.text).slice(0, 220)}`)
  const steps = (j?.steps || []).filter(x => x.kind !== 'write').slice(-12).map(x => `- ${String(x.text).slice(0, 160)}`)
  const writes = (j?.steps || []).filter(x => x.kind === 'write').slice(-8).map(x => x.path || x.text).filter(Boolean)
  const spec = events.findLast(e => e.type === 'game:spec')?.spec
  const since = events.findLastIndex(e => e.type === 'app:start' && e.fresh)
  const bigs = events.slice(since + 1).filter(e => e.type === 'app:stage' && e.big)
  const done = bigs.filter(e => e.big.ok && e.big.name).map(e => `slice ${e.big.i + 1} ${e.big.name}${e.big.clip ? ', play test filmed' : ''}`)
  // the status line often reads "next step" or a test: the slice comes from the last "stage n of N" said
  const SLICE = /stage \d+ of \d+/
  const stage = SLICE.test(j?.stage || st?.stage || '') ? (j?.stage || st?.stage)
    : [...(j?.steps || st?.steps || []).map(x => ({ t: x.t || 0, s: x.text || '' })), ...events.filter(e => e.type === 'app:stage').map(e => ({ t: e.t || 0, s: e.stage || '' }))]
      .filter(x => SLICE.test(x.s)).sort((x, y) => y.t - x.t)[0]?.s || ''
  const slices = (spec?.stages || []).map(x => x?.name).filter(Boolean)
  const how = processNotes({ kind: j?.kind || st?.kind || (spec ? 'game' : 'site'), state: j?.state || st?.state, stage, done, slices })
  let files = []
  try { const dir = join(runsDir, id, 'img'); files = readdirSync(dir).map(name => ({ name, mtime: statSync(join(dir, name)).mtimeMs })) } catch {}
  const m = buildMedia({ id, files, slices: bigs.map(e => ({ ...e.big, t: e.t })), steps: j?.steps || [] })
  const snap = snapOf(id)
  const media = { clips: m.clipList, pics: [...(snap ? [{ src: snap.split('?')[0], name: 'the game right now (a still)' }] : []), ...m.picList] }
  const notes = `${how} ${mediaNotes(m, false)}\n\nState: ${j?.state || st?.state || 'idle'}. Stage: ${j?.stage || stage || 'none'}.\nRecent steps:\n${steps.join('\n') || '- none'}\nFiles written last: ${writes.join(', ') || 'none'}\nThe lead's last thoughts:\n${lead.join('\n') || '- none'}`
  const fallback = `${j?.stage ? `Right now: ${j.stage}.` : 'The crew is working.'}`
  const model = modelFor('planner')
  if (!model) return { queued: false, state: st.state, answer: fallback }
  const chat = async messages => (await streamChat(provider('planner'), {
    trace: { kind: 'talk' }, model, maxTokens: 500, temperature: 0.3, signal: AbortSignal.timeout(40000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
  })).text
  try {
    const r = await talk({ chat, look: lookAt, appDir: join(runsDir, id, 'app'), media, text: t, notes, who: String(who || '').slice(0, 40), on: String(on || '').slice(0, 160), title: spec?.title || '', building, deadline: Date.now() + 75000 })
    return { queued: false, state: st.state, answer: r.answer || fallback, ...(r.media ? { media: r.media } : {}), ...(r.proposal ? { proposal: r.proposal } : {}), used: r.used }
  } catch { return { queued: false, state: st.state, answer: fallback } }
}

// ---------- game mode: answers → a spec → a new build whose app is the game
let gameP = null
const gameMod = () => (gameP ||= import('../engine/game.mjs'))
let castP = null
const castMod = () => (castP ||= import('../engine/cast.mjs'))
// The Plan board's pictures (spec 21): sketches and mocks at medium, backdrops and close-up art at
// high, through the same image login as the builds. Image runs only; no Meshy credits.
async function planPaint({ prompt, quality = 'medium', aspect = 'landscape', crop = '', refs = [] }) {
  const choice = await imageChoice()
  // ckff (engine/ckff.mjs) is the fallback when no Hermes image login works (Codex out of quota)
  const fallback = () => (ckffCreds() && !crop ? ckffPaint({ prompt, aspect, refs }) : null)
  if (!choice) return (await fallback()) || { ok: false, error: 'no image model' }
  const model = choice.model
  const args = ['--provider', choice.provider, ...(model ? ['--model', model] : []), '--aspect', aspect, ...(crop ? ['--crop', crop] : [])]
  for (const r of refs.slice(0, 4)) if (existsSync(r)) args.push('--ref', r)
  const r = await imagegen([...args, prompt], quality === 'high' ? 300000 : 180000)
  return r?.ok ? r : (await fallback()) || r
}
planPaint.ready = async () => !!ckffCreds() || !!(await imageChoice())
// The build (spec 21) spends Meshy credits only on a locked plan, inside the price it was locked at.
// whether Godot 4 is on this machine (engine/port.mjs loads the game modules, so it is read once, late)
let godotHere
import('../engine/port.mjs').then(m => { godotHere = !!m.godotBin() }).catch(() => {})
const plans = planRoutes({
  dataDir, builtInTemplates: [join(root, 'games', 'ares', 'plan.json')], paint: planPaint, make: { character: planMakeCharacter, key: () => planMeshyKey() },
  // the planner reads the idea's genre family; Godot asked for is said in the plan, and so is a missing Godot
  planner: () => models.planner.apiKey ? { provider: provider('planner'), model: modelFor('planner') } : null,
  godot: () => godotHere
})
// The planner conversation (docs/specs/27-plan-conversation.md): decide together in the left chat, then lock.
// A locked game chat makes its plan through the Plan board's routes above.
const talks = talkRoutes({
  dataDir, plans, env: () => ({ godot: godotHere }),
  model: () => models.planner.apiKey && modelFor('planner') ? async messages => (await streamChat(provider('planner'), {
    trace: { kind: 'talk' }, model: modelFor('planner'), maxTokens: 700, temperature: 0.3, signal: AbortSignal.timeout(60000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
  })).text : null
})
// Chats (docs/specs/29-chats-references-marks.md): conversations live apart from builds and move into
// their project when they build. On start: empty old chats go, and game plans made before chats existed
// each get a chat that points at them (the plan files stay where they are).
const chats = talks.chats
// the Studio's App kit (docs/specs/37-studio-first.md): the app's users, screens, data and connections
const appKit = appKitRoutes({
  dataDir,
  model: () => models.planner.apiKey && modelFor('planner') ? async messages => (await streamChat(provider('planner'), {
    trace: { kind: 'app-kit' }, model: modelFor('planner'), maxTokens: 2400, temperature: 0.3, signal: AbortSignal.timeout(60000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
  })).text : null,
  supabase: async () => !!(await connectors.list())?.supabase?.signed_in
})
// The brand sheet (docs/specs/31-brand-sheet.md): a website's or app's story, palette and type, locked before it is designed
// A project's References store (docs/specs/29-chats-references-marks.md): the Overview's References group
const refs = refStore({ projectsDir: projects.projectsDir, uploadsOf: pid => projects.uploadsOf(pid), known: pid => !!projects.get(pid) })
// a link's look (decision 0022): walked in the background, one walk per reference at a time. The vision model
// is the reviewer's when it has one, else the planner's; with neither, the look is the measured words only.
const lookWalks = new Set()
function walkLook(pid, ref) {
  const key = `${pid}/${ref.id}`
  if (lookWalks.has(key)) return refs.list(pid).find(x => x.id === ref.id) || null
  const from = { host: ref.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: ref.url, source: ref.source, chat: ref.from || null, at: ref.added }
  const started = Date.now()
  const now = refs.setLook(pid, ref.id, { state: 'walking', step: `Opening ${from.host}`, at: started, from })
  lookWalks.add(key)
  // what the walk is doing now, kept on the look so the Studio shows it under the crew's cursor
  const step = text => { try { refs.setLook(pid, ref.id, { state: 'walking', step: text, at: started, from }) } catch {} }
  ;(async () => {
    try {
      const { walkSite, describeLook } = await import('../engine/sitelook.mjs')
      const w = await walkSite(ref.url, { dataDir, signal: AbortSignal.timeout(150000), onStep: step })
      if (!w.tokens) return refs.setLook(pid, ref.id, { state: 'failed', note: w.note || 'the site did not open', at: Date.now(), from })
      const v = models.reviewer.apiKey && modelFor('reviewer') ? 'reviewer' : models.planner.apiKey && modelFor('planner') ? 'planner' : null
      const chat = v ? async messages => (await streamChat(provider(v), { trace: { kind: 'look' }, model: modelFor(v), maxTokens: 900, temperature: 0.3, signal: AbortSignal.timeout(90000), messages })).text : null
      const live = refs.list(pid).find(x => x.id === ref.id)
      step('Writing the look')
      const words = await describeLook(w, { want: live?.use || ref.use || '', chat })
      refs.setLook(pid, ref.id, { state: 'ready', at: Date.now(), from, pages: w.pages.map(p => p.url), tokens: w.tokens, motion: w.motion, words }, w.pages.flatMap(p => p.shots.slice(0, 3)))
    } catch (err) {
      try { refs.setLook(pid, ref.id, { state: 'failed', note: String(err.message || err).split('\n')[0].slice(0, 160), at: Date.now(), from }) } catch {}
    } finally { lookWalks.delete(key) }
  })()
  return now
}
// the match check (decision 0022): the newest build's own pages, walked like the reference, compared by style.
// It reports only; a difference is fixed when the person presses Fix (refs route, …/fix).
function matchLook(pid, ref, run) {
  const key = `${pid}/${ref.id}/match`
  if (lookWalks.has(key)) return refs.list(pid).find(x => x.id === ref.id) || null
  const started = Date.now()
  const now = refs.setMatch(pid, ref.id, { state: 'checking', step: 'Opening your pages', run, at: started })
  lookWalks.add(key)
  const step = text => { try { refs.setMatch(pid, ref.id, { state: 'checking', step: text, run, at: started }) } catch {} }
  ;(async () => {
    try {
      const { walkBuild, judgeMatch } = await import('../engine/lookmatch.mjs')
      const events = readEvents(run)
      if (!events) throw new Error('that build is gone')
      const out = await exportRun({ events, runId: run, runDir: join(runsDir, run), sections: [], name: nameFor(run)?.name, fill: fillExport(run) })
      const ours = await walkBuild({ htmlDir: join(out.dir, 'html'), files: out.html, dataDir, signal: AbortSignal.timeout(120000), onStep: step })
      if (!ours.tokens) return refs.setMatch(pid, ref.id, { state: 'failed', note: ours.note || 'the pages did not open', run, at: Date.now() })
      const live = refs.list(pid).find(x => x.id === ref.id)
      const L = live.look
      const shots = (L.shots || []).slice(0, 2).map(s => { const f = refs.file(pid, s.split('/').pop()); return f ? readFileSync(f.file) : null }).filter(Boolean)
      const v = models.reviewer.apiKey && modelFor('reviewer') ? 'reviewer' : models.planner.apiKey && modelFor('planner') ? 'planner' : null
      const chat = v ? async messages => (await streamChat(provider(v), { trace: { kind: 'look-match' }, model: modelFor(v), maxTokens: 900, temperature: 0.2, signal: AbortSignal.timeout(90000), messages })).text : null
      step('Comparing')
      const m = await judgeMatch({ ref: { tokens: L.tokens, motion: L.motion, shots }, ours, want: live.use || '', avoid: [L.from?.host, L.from?.url], chat })
      refs.setMatch(pid, ref.id, { state: 'ready', run, at: Date.now(), ...m }, ours.pages.flatMap(p => p.shots.slice(0, 1)).slice(0, 2))
    } catch (err) {
      try { refs.setMatch(pid, ref.id, { state: 'failed', note: String(err.message || err).split('\n')[0].slice(0, 160), run, at: Date.now() }) } catch {}
    } finally { lookWalks.delete(key) }
  })()
  return now
}
const refsRoute = refRoutes({ refs, head: pid => projects.get(pid)?.head || null, comment: (run, input) => comment(run, input), walk: walkLook, match: matchLook, fixText: lookFixText })
// The Studio (docs/specs/37-studio-first.md): a project's studio record, its one brand and its Assets store
const studios = studioStore({ projectsDir: projects.projectsDir })
const projectAssets = assetStore({ projectsDir: projects.projectsDir, known: pid => !!projects.get(pid) })
// what a project's newest build was made with, for its Studio (server/studio.mjs): websites only for now
function builtOf(pid) {
  const head = projects.get(pid)?.head
  const events = head ? readEvents(head) : null
  const start = events?.find(e => e.type === 'run:start')
  const pages = (events || []).filter(e => e.type === 'page' && e.title).map(e => String(e.title).slice(0, 60))
  if (!start || !pages.length) return null
  const th = events.findLast(e => e.type === 'theme')
  return { kind: 'site', idea: baseBrief(start.brief).split('\n\nPages: ')[0].slice(0, 4000), pages: [...new Set(pages)], theme: th ? { accent: th.vars?.['--accent'] || th.vars?.['--primary'] || null, heading: th.fonts?.heading || null, name: th.name || null } : null }
}
const studioRoute = studioRoutes({ studios, assets: projectAssets, refs, projects, chats, builtOf, picturesDefault: async () => (await setup.pictures()).mode })
// a film from a project's brand, References and Assets, no website (spec 40): the Video kit's Build press
const filmRoute = filmRoutes({
  projectsDir: projects.projectsDir, refs, known: pid => !!projects.get(pid),
  makeRun: (pid, events, fill) => {
    const id = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = join(runsDir, id)
    mkdirSync(dir, { recursive: true })
    fill(dir)
    writeFileSync(join(dir, 'events.jsonl'), events.map(e => JSON.stringify({ ...e, run: id })).join('\n') + '\n')
    projects.claim(id, pid)
    return id
  },
  startFilm: (id, input) => makeVideo(id, input)
})
// Media in a chat (spec 29, server/chatmedia.mjs): a picture is read by the reviewer's vision model, with
// reasoning off and the vision fallbacks after it, the same way Scribble's marks are read
async function askVision(messages, { maxTokens = 300, kind = 'chat-media' } = {}) {
  const first = models.reviewer.apiKey && modelFor('reviewer')
  if (!first) return null
  for (const m of [first, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? REVIEW_FALLBACKS.filter(x => x !== first) : [])]) {
    try {
      const res = await streamChat(provider('reviewer'), { trace: { kind }, model: m, messages, maxTokens, temperature: 0.2, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal: AbortSignal.timeout(90000) })
      if (String(res.text || '').trim()) return res.text
    } catch {}
  }
  return null
}
const seePicture = image => askVision(pictureMessages(image))
// The media reader (docs/specs/32-media-reader.md): the `media` pick is a model that hears and/or watches,
// on the reviewer's endpoint and key (the planner's when there is no reviewer). With no pick, the first
// tested one the endpoint offers; 'off' sends no clip or sound to any model. The person's media goes only
// to that model, or to the reviewer's vision model as frames.
const mediaRole = () => (models.reviewer.apiKey ? 'reviewer' : 'planner')
async function mediaModel() {
  if (picks.media === 'off' || !models[mediaRole()].apiKey) return ''
  return picks.media || defaultMedia(await listModels(mediaRole()).catch(() => [])) || ''
}
async function mediaState() {
  const model = await mediaModel()
  const caps = mediaCaps(model, modelRows.get(model))
  return { model, pick: picks.media || null, caps, takes: takesSays(caps), vision: !!(models.reviewer.apiKey && modelFor('reviewer')) }
}
// who: 'media' (the media pick) or 'vision' (the reviewer's vision model, for frames only)
async function askMedia(who, messages, { maxTokens = 600, kind = 'media-read' } = {}) {
  if (who === 'vision') { const t = await askVision(messages, { maxTokens, kind }); if (!t) throw new Error('the vision model did not answer'); return t }
  const model = await mediaModel()
  if (!model) throw new Error('no media model')
  const res = await streamChat(provider(mediaRole()), { trace: { kind }, model, messages, maxTokens, temperature: 0.2, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal: AbortSignal.timeout(150000) })
  return res.text
}
// watch and listen to a finished film; the review is kept beside it as review.json
async function criticize({ ffmpeg, file, dir, music = true }) {
  const board = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), 'swarm-critic-'))
  try {
    const { model, caps, vision } = await mediaState()
    const review = await reviewFilm({ ffmpeg, file, board, tmp, caps, vision, ask: (who, messages) => askMedia(who, messages, { kind: 'film-critic' }), music })
    const kept = { ...review, model: model || null }
    writeFileSync(join(dir, 'review.json'), JSON.stringify(kept, null, 2))
    return kept
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}
// read one clip or sound from a chat: what it shows and sounds like, and what happened
async function readClip(file, kind) {
  const tmp = mkdtempSync(join(tmpdir(), 'swarm-read-'))
  try {
    const { model, caps, vision } = await mediaState()
    const t = await videoTools(dataDir)
    const r = await readMedia({ ffmpeg: t.ffmpeg, file, kind, tmp, caps, vision, ask: askMedia })
    return { ...r, model: r.by === 'media' ? model : r.by === 'vision' ? modelFor('reviewer') : null, says: readSays(r) }
  } catch (err) {
    const r = { by: 'none', why: String(err.message || err).split('\n')[0].slice(0, 120) }
    return { ...r, says: readSays(r) }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}
const chatMediaRoute = chatMediaRoutes({ chats, projectOf: run => RUN_ID.test(String(run || '')) ? projects.projectOf(run) : null, see: seePicture, read: readClip })
const brands = brandRoutes({
  chats,
  projectBrands: studios.brands,
  model: () => models.planner.apiKey && modelFor('planner') ? async messages => (await streamChat(provider('planner'), {
    trace: { kind: 'brand' }, model: modelFor('planner'), maxTokens: 900, temperature: 0.6, signal: AbortSignal.timeout(60000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
  })).text : null
})
// The story (docs/specs/37-story.md): beats written from the project's brand and what was built, drawn
// as cards in three shapes. The brand is the locked sheet of the chat that built this run.
// The project's brand (spec 37: <data>/projects/<pid>/brand.json) first, then the chat's (spec 31).
function brandOfRun(id) {
  const pid = projects.projectOf(id)
  if (pid && /^[\w-]{1,80}$/.test(pid)) { try { const b = JSON.parse(readFileSync(join(dataDir, 'projects', pid, 'brand.json'), 'utf8')); if (b?.story) return b } catch {} }
  const ids = pid ? chats.forProject(pid).groups.flatMap(g => g.chats.map(c => c.id)) : []
  const list = ids.map(c => chats.get(c)).filter(Boolean)
  return (list.find(c => c.run === id && c.brand) || list.find(c => c.brand?.lockedAt) || list.find(c => c.brand))?.brand || null
}
const storyRoute = storyRoutes({
  runsDir, dataDir, readEvents, brandOf: brandOfRun,
  pitchOf: async id => writePitch(readEvents(id) || [], id),
  chat: () => models.planner.apiKey && modelFor('planner') ? async messages => (await streamChat(provider('planner'), {
    trace: { kind: 'story' }, model: modelFor('planner'), maxTokens: 1400, temperature: 0.5, signal: AbortSignal.timeout(60000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
  })).text : null,
  // the page shots a beat's screen uses: a fresh export, every page at desktop and phone size
  shots: async id => {
    const events = readEvents(id)
    if (!events) return []
    // the newest export on disk when there is one (Post to Feed and ⬇ Export leave one); else a fresh one
    const changed = events.findLast(e => e.type === 'layer:done' || e.type === 'theme' || e.type === 'image')?.t || 0
    const last = events.findLast(e => e.type === 'export' && e.t >= changed && e.dir && Array.isArray(e.html) && existsSync(join(e.dir, 'html', e.html[0] || '')))
    const out = last ? { dir: last.dir, html: last.html } : await exportRun({ events, runId: id, runDir: join(runsDir, id), sections: [], name: nameFor(id)?.name, fill: fillExport(id) })
    const { pageShots } = await import('../engine/pageshots.mjs')
    const got = await pageShots({ htmlDir: join(out.dir, 'html'), files: out.html, dataDir })
    const pages = snapshot(events, [], { name: nameFor(id)?.name }).pages
    return out.html.map((file, i) => { const s = got.shots.find(x => x.file === file) || {}; return { page: pages[i]?.id, desktop: s.shot, phone: s.phoneShot } }).filter(s => s.page)
  }
})
// the Deck kit (docs/specs/35-open-design.md section 7): its slides written by the planner, through Hermes
const decks = deckRoutes({
  dataDir, runsDir, chats,
  model: () => models.planner.apiKey && modelFor('planner') ? async messages => (await streamChat(provider('planner'), {
    trace: { kind: 'deck' }, model: modelFor('planner'), maxTokens: 2500, temperature: 0.5, signal: AbortSignal.timeout(90000),
    extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
  })).text : null
})
try {
  chats.cleanup()
  const pd = join(dataDir, 'plans')
  if (existsSync(pd)) chats.importPlans(readdirSync(pd).filter(f => /^p-[a-z0-9]+\.json$/.test(f)).map(f => { try { return JSON.parse(readFileSync(join(pd, f), 'utf8')) } catch { return null } }).filter(Boolean))
} catch (err) { console.warn('chats:', err.message) }
// a chat that started a build: Locked on its brief, moved into the build's project once it has one
function chatBuilt(chatId, runId, pid, brief) {
  const c = chatId && chats.get(chatId)
  if (!c) return
  // Locked only on a brief the talk wrote: a build typed straight in keeps its chat open, with the run
  const talked = (c.turns || []).some(t => t.who === 'planner') || !!c.spec?.brief
  ;(talked ? chats.built(chatId, { run: runId, brief, project: pid || null })
    : chats.update(chatId, x => { x.run = runId }).then(() => (pid ? chats.moveTo(chatId, pid) : null)))
    // a new project (no pid yet): the chat follows the run into it, from wherever the talk was
    .then(() => { if (!pid) setTimeout(() => { const p = projects.projectOf(runId); if (p) chats.moveTo(chatId, p).catch(() => {}) }, 2000) })
    .catch(err => console.warn('chat:', err.message))
}
// a build typed straight into the Make box, or a message in a project's dock, without a talk first:
// the words still go into a chat (a new one, or the project's newest in that group)
function chatFor({ chat, text, kind = 'site', project = null }) {
  try {
    if (chat && chats.get(chat)) return chat
    if (!String(text || '').trim()) return null
    if (project) { const c = chats.forMessage(project, kind); chats.say(c.id, { who: 'person', text }).catch(() => {}); return c.id }
    return chats.create({ kind, text }).id
  } catch { return null }
}
// Ask before a new website build (docs/decisions/0020-ask-before-build.md): the person's words and the planner's
// question go into the chat (the one the build came from, else a new one), in one write, and the reply says so:
//   { error: 'ask', ask: 'skips', chat, text, options, recommended }   the question waits in that chat
//   { error: 'ask', ask: 'talk', chat: null, text }                    "don't build yet": the talk opens instead
// A question already open in that chat is not asked twice.
async function askBeforeBuild({ chatId, typed, pid }) {
  if (wordsRead(typed) === 'talk') return { error: 'ask', ask: 'talk', chat: null, text: "Let's talk it through first." }
  const files = pid ? projects.uploadsOf(pid).length : 0
  const known = chatId && chats.get(chatId) ? chatId : null
  const id = known || chats.create({ kind: 'site', text: typed, project: pid && projects.get(pid) ? pid : null }).id
  const turn = await chats.update(id, c => {
    c.turns ||= []
    const last = [...c.turns].reverse().find(t => t.who === 'planner')
    if (last && askedOf(last) && c.turns.at(-1) === last) return last
    const lastPerson = [...c.turns].reverse().find(t => t.who === 'person')
    if (known && lastPerson?.text !== typed) c.turns.push({ id: `t${c.turns.length + 1}`, who: 'person', at: Date.now(), text: typed.slice(0, 8000), refs: [], marks: [], layers: [] })
    // a new question: an earlier answer (used, or a walk's) no longer counts
    delete c.go
    c.ask = { brief: typed.slice(0, 8000), at: Date.now() }
    const q = askTurn(`t${c.turns.length + 1}`, typed, { files })
    c.turns.push(q)
    return q
  })
  return { error: 'ask', ask: 'skips', chat: id, text: turn.text, options: turn.options, recommended: String(turn.options?.[0]?.id || 'go:pick').slice(3) }
}
// What a project's talk is told is there (engine/talkplan.mjs): its name, the pages its newest site
// version has, the look, and what is running now. Empty outside a project.
function projectState(pid) {
  const p = pid && projects.get(pid)
  if (!p) return ''
  const lines = [`Project: "${String(p.title || p.name || 'untitled').slice(0, 80)}".`]
  const site = (p.versions || []).find(v => (readEvents(v.id) || []).some(e => e.type === 'page'))
  const ev = site ? readEvents(site.id) : null
  if (ev) {
    const pages = [...new Map(ev.filter(e => e.type === 'page').map(e => [e.id, e.title])).values()]
    lines.push(`Built: ${pages.length} page${pages.length === 1 ? '' : 's'} (${pages.slice(0, 12).join('; ')}).`)
    const th = ev.findLast(e => e.type === 'theme')
    if (th?.vars) lines.push(`Its look: "${th.name || 'theme'}", background ${th.vars['--background']}, text ${th.vars['--foreground']}, main colour ${th.vars['--primary']}${th.fonts?.heading ? `, headings in ${th.fonts.heading}` : ''}.`)
    const brief = ev.find(e => e.type === 'run:start')?.brief
    if (brief) lines.push(`It was made from: ${String(brief).split('\n')[0].slice(0, 300)}`)
  } else lines.push('No pages are built yet.')
  const work = (p.versions || []).map(v => workOf(v.id)).filter(Boolean)
  lines.push(work.length ? `Running now: ${work.map(w => `${w.what} (${w.stage || 'working'})`).join(', ')}.` : 'Nothing is running now.')
  return lines.join('\n')
}
// Guided game making (engine/workshop.mjs): the spec walked one step at a time, with pictures
const workshops = workshopRoutes({
  dataDir,
  paint: planPaint,
  planner: () => ({ provider: provider('planner'), model: modelFor('planner') }),
  voices: (() => { try { return JSON.parse(readFileSync(join(root, 'games', 'ares', 'data', 'heroes.json'), 'utf8')).voices || {} } catch { return {} } })(),
  speak: (voice, text, out) => import('../engine/voice.mjs').then(v => v.speakLine(voice, text, out)),
  build: (spec, copy) => startGame(spec, copy)
})
let meshyP = null
const meshyMod = () => (meshyP ||= import('../engine/meshy.mjs'))

// ---------- make a character with Meshy (spec 20)
// The project's own pictures a character can be made from, people first (by the prompt they were painted from).
const ART_FILE = /^(?:\d{1,3}|kept-\d{1,3}|game-[a-z0-9-]{1,48})\.(png|jpe?g|webp)$/
const PERSONISH = /\b(girl|boy|woman|man|character|hero|heroine|portrait|person|warrior|courier|pilot|knight|mage|figure|full[- ]body)\b/i
function meshyArt(from) {
  if (!from || !RUN_ID.test(String(from))) return []
  let files = []
  try { files = readdirSync(join(runsDir, from, 'img')).filter(f => ART_FILE.test(f)) } catch { return [] }
  const prompts = new Map()
  for (const e of readEvents(from) || []) if (e.type === 'image' && e.src && e.prompt) prompts.set(basename(String(e.src)), String(e.prompt))
  return files
    .map(f => ({ src: `/img/${from}/${f}`, person: PERSONISH.test(prompts.get(f) || '') || f.startsWith('game-portrait') }))
    .sort((a, b) => b.person - a.person)
    .slice(0, 12)
}
// The project's picture a character is made from: only /img/<run>/<file> of the project's own art
function meshyImage(src) {
  const art = String(src || '').match(/^\/img\/([\w-]{1,64})\/([\w.-]{1,80})$/)
  if (!art || !RUN_ID.test(art[1]) || !ART_FILE.test(art[2])) throw Object.assign(new Error('pick a picture from the project'), { status: 400 })
  const image = join(runsDir, art[1], 'img', art[2])
  if (!existsSync(image)) throw Object.assign(new Error('that picture is gone'), { status: 400 })
  return image
}
// A picture the person added becomes a role: its bytes must be a real PNG, JPEG or WebP (16 MB at most),
// and its name a short slug from the file's name ("00a-messenger.png" -> role "messenger").
const PIC_MAGIC = [['png', b => b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG'], ['jpg', b => b[0] === 0xff && b[1] === 0xd8], ['webp', b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP']]
function meshyAddArt(input = {}) {
  const from = String(input.from || '')
  if (!RUN_ID.test(from) || !existsSync(join(runsDir, from))) throw Object.assign(new Error('open a build first'), { status: 400 })
  const m = String(input.data || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!m) throw Object.assign(new Error('a PNG, JPEG or WebP picture'), { status: 400 })
  const buf = Buffer.from(m[2], 'base64')
  const kind = PIC_MAGIC.find(([, ok]) => buf.length > 12 && ok(buf))?.[0]
  if (!kind || buf.length > 16 * 1024 * 1024) throw Object.assign(new Error('a PNG, JPEG or WebP picture, 16 MB at most'), { status: 400 })
  const role = String(input.name || 'character').replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[a-z]?[-_ ]+/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38) || 'character'
  const file = `game-cast-${role}.${kind}`
  mkdirSync(join(runsDir, from, 'img'), { recursive: true })
  writeFileSync(join(runsDir, from, 'img', file), buf)
  return { src: `/img/${from}/${file}`, role }
}
// one list of jobs for the studio: one character or several at once, each worked by a crew member
let meshyJobsP = null
const meshyJobs = () => (meshyJobsP ||= meshyMod().then(m => m.meshyJobs({ outDir: join(dataDir, 'models'), resolveArt: meshyImage })))
// stand-ins load lazily; the vision tagger is the reviewer model; Octo's public lane when the studio has a key
let standinP = null
const standinsOf = () => (standinP ||= (() => {
  const octoBase = (hermesKey('OCTO_BASE_URL') || 'https://octodb.design-bakery.com').replace(/\/+$/, '')
  const octoKey = hermesKey('OCTO_SWARM_WS'), pexelsKey = hermesKey('PEXELS_API_KEY'), lease = hermesKey('PEXELS_OCTO_LEASE')
  return standinsMake({ dataDir, runsDir, provider: () => provider('reviewer'), model: () => modelFor('reviewer'),
    octo: octoKey ? { baseUrl: octoBase, key: octoKey, workspaceId: hermesKey('OCTO_SWARM_WORKSPACE_ID') || '9aba6ef6-d196-412f-9344-0efb744b9c6c' } : null,
    pexels: pexelsKey ? { key: pexelsKey } : lease ? { key: lease, proxy: `${octoBase}/api/vault/proxy` } : null })
})())
// The bytes of a picture a stand-in pick names: this studio's own pictures and stand-ins, or a public https photo
function standinBytes(st) {
  return async u => {
    const own = u.match(/^\/img\/([\w:.-]+)\/([\w.-]+)$/)
    if (own) { const f = join(runsDir, own[1], 'img', own[2]); return existsSync(f) ? readFileSync(f) : null }
    const si = u.match(/^\/standin\/([0-9a-f]{16}\.(jpg|png|webp))$/)
    if (si) { const f = st.file(si[1]); return f ? readFileSync(f) : null }
    if (!/^https:\/\//.test(u)) return null
    const r = await fetch(u, { headers: { 'user-agent': 'swarm-studio/1.0' }, signal: AbortSignal.timeout(20000) })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  }
}
// An app's empty picture slots get stand-in photos, copied into the app with their credit
async function fillApp(id, dir, step) {
  const { fillPictures } = await import('../engine/fillpics.mjs')
  const st = standinsOf()
  return fillPictures(dir, { pick: st.pick, bytesOf: standinBytes(st), run: id, step })
}
// A site's export gets the same stand-ins, in its static pages and its React copy
const fillExport = id => async root => {
  const { fillSite } = await import('../engine/fillpics.mjs')
  const st = standinsOf()
  return fillSite(root, { pick: st.pick, bytesOf: standinBytes(st), run: id })
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
// The painters: three of the crew, one per picture at a time, each with its own tile on the
// build's wall. What each is doing goes out live as art:job (never kept with the run).
const PAINTERS = ['Kiki', 'Juno', 'Tofu']
// an image model that is out of quota or credit answers every picture the same way: stop on the first
// what each painter is on right now, per run: a canvas opened mid-art reads it with the assets
const artJobs = new Map()
// the last resort for an icon or backdrop no provider would paint (engine/library.mjs)
const assetLibrary = library({ dataDir })
// the library on purpose (engine/assetlib.mjs): searched and picked from, with packs of one's own
const assets = assetLib({ dataDir })
// the library picture for a slot: the closest packs of the build's style first, then any pack
async function libraryFor(it, style, used) {
  const category = SLOT_CATEGORIES[slotKind(it.id)] || []
  const q = String(it.what || '').replace(/^(icon for|backdrop for|portrait of|[a-z ]+:)\s*/i, '')
  for (const pack of [...(LIB_PACKS[style] || []), '']) {
    const hit = assets.search({ q, category, pack, limit: 1, used })[0]
    if (hit && hit.score >= 3) return assets.file(hit.id)
  }
  return null
}
const OUT_OF_QUOTA = /\b(429|402)\b|usage limit|quota|insufficient|no capacity|rate.?limit|billing|credits?\b/i
// Cut a sprite out, then check it: the cut's own numbers first, and a sprite that looks off
// goes to the reviewer on dark and on magenta. → { ok, path, problems, report }
async function cutAndCheck(src, it, guide) {
  const cut = join(dirname(src), `${it.id}-cut.png`), view = join(dirname(src), `${it.id}-check.png`)
  // the Python that has the image libraries (cutPy below), not whichever python3 is first on the PATH: under
  // Hermes that is Hermes's own bare Python, and the cut failed with "No module named 'PIL'" (2026-11-13)
  const py = (await cutPy()) || (process.platform === 'win32' ? 'python' : 'python3')
  const c = await new Promise(ok => execFile(py, [join(root, 'scripts', 'cutout.py'), src, cut, '--preview', view], { timeout: 90000 }, (err, out, errOut) => ok({ ok: !err, out: String(out || ''), why: String(errOut || err?.message || '').trim() })))
  if (!c.ok || !existsSync(cut)) return { ok: false, cutFailed: true, problems: [c.why.split('\n').pop().slice(0, 120) || 'the cut failed'] }
  let report = {}
  try { report = JSON.parse(c.out.trim().split('\n').pop()) } catch {}
  // measured from the painted picture: the figure sits close to the key it was painted on, and
  // another key is further from its colours (the second try is painted on that one)
  const clash = art.keyClash(report)
  const looksOff = report.clipped || report.halo > 0.004 || !!clash
  // with a reviewer, every sprite is looked at; without one, the numbers decide
  const check = existsSync(view) ? await checkArt(view, guide, (_, image) => art.cutoutMessages(it.what, image)) : { ok: true, skipped: true, problems: [] }
  const problems = [...(check.skipped
    ? [...(report.clipped ? ['cut off by the edge'] : []), ...(report.halo > 0.004 ? ['background left around the figure'] : [])]
    : check.problems), ...(clash ? [clash.problem] : [])]
  return { ok: (check.skipped ? !looksOff : check.ok) && !clash, path: cut, view, problems, report, clash }
}
// The cutters (sheets, single sprites, the key-colour measure) need numpy, scipy and Pillow, which the Python
// first on the PATH may lack (a venv's, or Hermes's own): the first of SWARM_CUT_PY, python3, the system
// Python and Hermes's Python that has them.
let cutPyP = null
const cutPy = () => (cutPyP ||= (async () => {
  const win = process.platform === 'win32'
  for (const py of [process.env.SWARM_CUT_PY, win ? 'python' : 'python3', win ? '' : '/usr/bin/python3', PY].filter(Boolean)) {
    const ok = await new Promise(r => execFile(py, ['-c', 'import numpy, scipy, PIL'], { timeout: 30000 }, err => r(!err)))
    if (ok) return py
  }
  return null
})())
// what a stage is told about a sheet: its frame size and timing, from the cut
const sheetInfo = (it, meta) => (it.kind === 'sheet' && meta ? { count: meta.frames, cell: meta.cell, fps: meta.fps || it.fps, loop: meta.loop ?? it.loop, frames: meta.video ? IDLE_FRAMES : it.frames, ...(meta.blend === 'add' ? { blend: 'add' } : {}) } : {})
const IDLE_FRAMES = 'a looping idle from a video clip: breathing, a small sway of weight, a blink'
// The animated idle's go-ahead (engine/idle.mjs). With a video model signed in, the chat asks once,
// with the picked model's price on the button and the other video models Hermes offers beside it
// (the pick is kept in models.json as `idle`); the build's own input can carry the yes at that
// price ({ idle: { usd, video } }) or a no ('no'). No answer in a few minutes is a no: nothing is
// spent unasked. Without a video model, or on a no, the keys route runs when an in-betweener is
// set up (close painted keyframes, RIFE between them); else the painted idle stays.
const idleAsks = new Map() // run id -> { options, resolve }
const IDLE_ASK_MS = Number(process.env.SWARM_IDLE_ASK_MS) || 5 * 60e3
const idleChoices = async () => idleOptions(await loadVideoProviders().catch(() => []), picks.idle)
async function idleGate(runId, spec, pre, signal) {
  // made before (a Try again): the animated sheet is kept with the run and used again
  try { const m = JSON.parse(readFileSync(join(runsDir, runId, 'img', 'game-sheet-hero-idle.json'), 'utf8')); if (m.video || m.keys) return [] } catch {}
  const g = await gameMod()
  const who = String(spec.hero || 'the hero').split(/[,—.;]/)[0].trim()
  const said = (state, extra = {}) => record(runId, { type: 'game:idle', t: Date.now(), run: runId, state, who, ...extra })
  const interp = interpOf(heavyConfig(dataDir))
  const keys = why => {
    if (!interp) { said('no', { text: why }); return [] }
    said('keys', { text: `${why}; ${interp.name} will fill in the frames between close keyframes` })
    return g.idleSheets(spec, undefined, 'keys')
  }
  const options = pre === 'no' ? [] : await idleChoices()
  if (!options.length) return keys(pre === 'no' ? 'No clip' : 'No video model, so no clip')
  let chosen = null
  if (pre && typeof pre === 'object') { const o = optionOf(options, pre.video); if (priceOk(o, pre.usd)) chosen = o }
  if (!chosen) {
    const def = options[0]
    said('ask', { text: IDLE_SAY.ask(who), line: def.line, usd: def.usd, by: def.by, option: def.id, options: options.map(({ id, by, usd, line }) => ({ id, by, usd, line })), keys: interp?.name || null })
    chosen = await new Promise(resolve => {
      const end = o => { clearTimeout(t); signal?.removeEventListener?.('abort', stop); idleAsks.delete(runId); resolve(o) }
      const stop = () => end(false)
      const t = setTimeout(() => end(null), IDLE_ASK_MS)
      signal?.addEventListener?.('abort', stop)
      idleAsks.set(runId, { options, resolve: end })
    })
  }
  if (!chosen) return signal?.aborted ? [] : keys(chosen === null ? 'No answer, so no clip' : 'No clip')
  said('yes', { text: `Animating ${who}'s idle with ${chosen.by}`, line: chosen.line, usd: chosen.usd, option: chosen.id })
  const more = g.idleSheets(spec)
  for (const m of more) if (m.video) m.option = chosen
  return more
}
function idleAnswer(id, input) {
  const a = idleAsks.get(id)
  if (!a) throw new Error('that question has closed')
  if (input.ok !== true) { a.resolve(false); return { ok: true } }
  const o = optionOf(a.options, input.option)
  if (!o) { const e = new Error('that video model is not offered'); e.status = 400; throw e }
  if (!priceOk(o, input.usd)) { const e = new Error(`the price changed: ${o.line}`); e.status = 402; throw e }
  // the model picked is the next build's default
  picks.idle = { provider: o.provider, model: o.model }
  try { mkdirSync(dataDir, { recursive: true }); writeFileSync(picksFile, JSON.stringify(picks, null, 2)) } catch {}
  a.resolve(o)
  return { ok: true }
}
// have: the art painted before (a mid-build ask): a sheet can be painted over one of those
// sprites and a sprite can take the hero's picture as its reference
async function paintGame(runId, spec, items, appDir, step, signal = null, { have = [], idle = null } = {}) {
  items = [...items]
  const choice = await imageChoice()
  if (!choice) { step({ kind: 'setup', text: 'no image model: the game draws its art in code', ok: false }); return [] }
  const guide = gameGuide(spec)
  step({ kind: 'setup', text: `painting in ${guide.name}` })
  mkdirSync(join(appDir, 'public', 'art'), { recursive: true })
  mkdirSync(join(runsDir, runId, 'img'), { recursive: true })
  const done = new Map(), queue = [...items], libUsed = new Set()
  for (const f of have) { const id = String(f.file || '').replace(/^art\//, '').replace(/\.[a-z0-9]+$/i, ''); if (id && !items.some(i => i.id === id)) done.set(id, f) }
  // a picture painted for this game before (a build stopped by a restart, a Try again)
  // is kept with the run: it is used again, not painted and paid for again
  const kept = (() => { try { return readdirSync(join(runsDir, runId, 'img')).filter(f => /^game-.*\.(png|jpe?g|webp)$/i.test(f) && !/-check\./.test(f)) } catch { return [] } })()
  const reuse = it => {
    const f = kept.find(k => k.replace(/\.[a-z]+$/i, '') === `game-${it.id}`)
    if (!f) return false
    let meta = null
    if (it.kind === 'sheet') { try { meta = JSON.parse(readFileSync(join(runsDir, runId, 'img', `game-${it.id}.json`), 'utf8')) } catch { return false } }
    const file = `art/${it.id}${extname(f)}`
    copyFileSync(join(runsDir, runId, 'img', f), join(appDir, 'public', file))
    done.set(it.id, { file, what: it.what, kind: it.kind, ...(it.look ? { look: it.look } : {}), ...(it.companion ? { companion: true } : {}), ...sheetInfo(it, meta) })
    return true
  }
  // a kit sheet (a UI kit, a set of props) is cut into single files, each a picture of its own
  // in the art the game is told about; the sheet itself is not
  for (const kit of items.filter(i => i.parts)) for (const p of kit.parts) if (!items.some(i => i.id === p.id)) items.push({ ...p, part: kit.id })
  const reuseParts = kit => { for (const p of kit.parts || []) reuse(p) }
  for (const it of [...queue]) if (reuse(it)) { queue.splice(queue.indexOf(it), 1); reuseParts(it) }
  // a library picture taken into the game: copied in under the slot's name, with its credit
  const libUsedIds = new Set(), credits = []
  const takeLib = (it, got, why = '') => {
    const ext = extname(got.file) || '.png', file = `art/${it.id}${ext}`, name = `lib-${it.id}${ext}`
    copyFileSync(got.file, join(appDir, 'public', file))
    copyFileSync(got.file, join(runsDir, runId, 'img', name))
    const r = got.row
    libUsedIds.add(r.id)
    credits.push({ file, from: r.id, pack: r.pack, credit: r.credit, license: r.license, url: r.url })
    done.set(it.id, { file, what: it.what, kind: it.kind, credit: r.credit, library: r.id })
    return name
  }
  // the picks made for this build (runs/<id>/art-picks.json): a picked slot is not painted
  for (const p of readPicks(join(runsDir, runId))) {
    const got = await assets.file(p.asset)
    if (!got) { step({ kind: 'setup', text: `the picked ${p.slot} is not in the library any more: painting it`, ok: false }); continue }
    let it = items.find(i => i.id === p.slot)
    if (!it) { it = pickedItem(p, got.row); items.push(it) }
    const q = queue.indexOf(it)
    if (q >= 0) queue.splice(q, 1)
    takeLib(it, got)
    step({ kind: 'setup', text: `using the picked ${got.row.subject || p.slot} (${got.row.credit}) for the ${it.what}` })
  }
  // the hero's idle from a video clip (engine/idle.mjs): asked for at the clip's price while the
  // rest paints; a yes adds the painted idle (its first frame is animated) and the video one
  let idleWait = null
  if (items.some(i => i.id === 'sprite-hero')) {
    // (the idle's own pictures kept from a build before, such as its keyframes, are used again)
    idleWait = idleGate(runId, spec, idle, signal).then(more => { for (const m of more) if (!items.some(i => i.id === m.id) && !done.has(m.id)) { items.push(m); if (!reuse(m)) queue.push(m) } })
      .catch(err => step({ kind: 'setup', text: `no video idle: ${String(err.message || err).slice(0, 120)}`, ok: false }))
      .finally(() => { idleWait = null })
  }
  // a sheet is painted over its figure's own painted picture (kept before the cut)
  const raws = new Map()
  const imgDir = join(runsDir, runId, 'img'), peeks = readdirSync(imgDir).filter(f => /^peek-.*-raw\./.test(f))
  for (const it of items) { const f = peeks.find(k => k.startsWith(`peek-${it.id}-raw.`)); if (it.kind === 'sprite' && f) raws.set(it.id, join(imgDir, f)) }
  for (const id of done.keys()) { const f = peeks.find(k => k.startsWith(`peek-${id}-raw.`)); if (/^sprite-/.test(id) && f && !raws.has(id)) raws.set(id, join(imgDir, f)) }
  const fresh = items.filter(i => done.has(i.id)).length
  if (fresh) step({ kind: 'setup', text: `using ${fresh} pictures painted before; painting ${queue.length}` })
  let stopped = null // the image model ran out: no more pictures are tried
  const img = name => `/img/${runId}/${name}`
  const live = (slot, it, state, extra = {}) => {
    const e = { type: 'art:job', t: Date.now(), run: runId, slot, who: PAINTERS[slot], id: it.id, what: it.what, kind: it.kind, state, done: done.size, total: items.length, ...extra }
    const slots = artJobs.get(runId) || []
    slots[slot] = { ...e, src: e.src || (slots[slot]?.id === it.id ? slots[slot].src : undefined) }
    artJobs.set(runId, slots)
    broadcast(e)
    const say = { painting: `painting the ${it.what}`, cutting: `cutting out the ${it.what}`, checking: `checking the ${it.what}`, 'sent back': `painting the ${it.what} again` }[state]
    if (say) broadcast({ type: 'crew:act', t: Date.now(), run: runId, name: PAINTERS[slot], text: say, app: true })
  }
  const keep = (it, path) => {
    const file = `art/${it.id}${extname(path) || '.png'}`, name = file.replace('art/', 'game-')
    copyFileSync(path, join(appDir, 'public', file))
    // the Studio keeps a copy with the run, so its art shows beside the game
    copyFileSync(path, join(runsDir, runId, 'img', name))
    return { file, name }
  }
  // a picture on its way (painted, being cut or checked): shown on its painter's tile only
  const peek = (it, path, tag) => {
    const name = `peek-${it.id}-${tag}${extname(path) || '.png'}`
    copyFileSync(path, join(runsDir, runId, 'img', name))
    return img(name)
  }
  // the next picture a painter can start: one that waits on another (a sheet on its sprite)
  // waits while that one is still being painted, and is dropped if it failed
  const busy = new Set()
  const next = async () => {
    for (;;) {
      if (signal?.aborted) return null
      // the image model ran out: no more pictures are tried, but the video idle (another
      // provider, asked for at its own price) and the in-betweening of kept keyframes still go on
      const open = q => !stopped || q.video || q.tween
      // a reference (ref) is waited for while it is being painted, but its failure drops nothing
      const pending = id => busy.has(id) || (!stopped && queue.some(o => o.id === id))
      const i = queue.findIndex(q => open(q) && (!q.after || done.has(q.after)) && (!q.ref || !pending(q.ref)))
      if (i >= 0) { const [it] = queue.splice(i, 1); busy.add(it.id); return it }
      // out of quota: what can no longer be painted is dropped, and with it what waits on it
      if (stopped) for (const q of [...queue]) if (!open(q)) queue.splice(queue.indexOf(q), 1)
      for (const q of [...queue]) if (q.after && !done.has(q.after) && !busy.has(q.after) && !queue.some(o => o.id === q.after)) queue.splice(queue.indexOf(q), 1)
      if (!queue.some(open) && !idleWait) return null
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  const worker = async slot => {
    for (let it; (it = await next()); busy.delete(it.id)) {
      if (it.kind === 'sheet' && it.video) { await videoSheet(slot, it); continue }
      if (it.kind === 'sheet' && it.tween) { await tweenSheet(slot, it); continue }
      if (it.kind === 'sheet') { await paintSheet(slot, it); continue }
      // asked from the library (engine/artask.mjs, "from": "library"): painted only when nothing fits
      if (it.library) {
        const got = await libraryFor(it, guide.style, libUsedIds)
        if (got) {
          const name = takeLib(it, got)
          live(slot, it, 'done', { src: img(name) })
          step({ kind: 'setup', text: `took the ${it.what} from the library: ${got.row.subject} (${got.row.credit})` })
          continue
        }
        step({ kind: 'setup', text: `nothing in the library fits the ${it.what}: painting it` })
      }
      live(slot, it, 'painting')
      const refFile = it.ref && done.get(it.ref)?.file
      const ref = it.ref ? [refFile && join(appDir, 'public', refFile), raws.get(it.ref)].find(f => f && existsSync(f)) : ''
      let r = await paintArt(choice, guide, { gen: it.gen, aspect: it.aspect, hero: it.kind === 'title', cutout: !!it.cutout, ref }, c => live(slot, it, 'sent back', { problems: c.problems })).catch(err => ({ ok: false, error: String(err.message || err) }))
      if (!r.ok || !r.path || !existsSync(r.path)) {
        const why = String(r.error || 'no image')
        if (OUT_OF_QUOTA.test(why) && !stopped) {
          stopped = { provider: choice.provider, model: choice.model || choice.provider, why: why.slice(0, 200) }
          queue.unshift(it)
          live(slot, it, 'failed', { problems: ['out of quota'] })
          step({ kind: 'setup', text: `${stopped.model} is out of quota: stopped painting`, ok: false, art: 'quota' })
          break
        }
        // a picture from the library in a close style, so the game isn't left without it;
        // kept beside the run as lib-<id>, not game-<id>, so a Try again paints it for real
        const lib = await assetLibrary.pick(it, guide.style, libUsed)
        if (lib) {
          const file = `art/${it.id}${extname(lib.path) || '.png'}`, name = `lib-${it.id}${extname(lib.path) || '.png'}`
          copyFileSync(lib.path, join(appDir, 'public', file))
          copyFileSync(lib.path, join(runsDir, runId, 'img', name))
          done.set(it.id, { file, what: it.what, kind: it.kind, credit: lib.credit })
          credits.push({ file, from: lib.from.replace(/^assets\//, ''), pack: lib.from.split('/')[1], credit: lib.credit, license: 'full grant from the author' })
          live(slot, it, 'done', { src: img(name) })
          step({ kind: 'setup', text: `used a library picture for the ${it.what} (${why.slice(0, 80)})` })
          continue
        }
        live(slot, it, 'failed', { problems: [why.slice(0, 80)] })
        step({ kind: 'setup', text: `could not paint the ${it.what}: ${why.slice(0, 120)}`, ok: false })
        continue
      }
      // a sprite is painted on a flat colour: cut it out to a transparent PNG and check the cut;
      // one sent back is painted once more with the reasons, and the second one stands
      if (it.cutout) {
        live(slot, it, 'cutting', { src: peek(it, r.path, 'raw') })
        raws.set(it.id, r.path)
        let c = await cutAndCheck(r.path, it, guide)
        if (!c.cutFailed) live(slot, it, 'checking', { src: peek(it, c.view, 'check') })
        if (!c.ok) {
          live(slot, it, 'sent back', { problems: c.problems })
          // the key colour was the trouble: paint it again on another key, the one measured as
          // furthest from the figure's own colours (else magenta ↔ green)
          const swap = art.keyTrouble(c.problems), gen = swap ? art.swapKey(it.gen, c.clash?.to || (c.report?.best !== c.report?.key ? c.report?.best : undefined)) : it.gen
          step({ kind: 'setup', text: `sent back the ${it.what}: ${c.problems.join(', ') || 'the cut'}${swap ? `; painting it again on ${art.keyOf(gen)}` : ''}` })
          const again = await paintArt(choice, guide, { gen: `${gen}. ${art.SPRITE_RETRY}; fix: ${c.problems.join('; ')}`, aspect: it.aspect, cutout: true, ref }).catch(() => null)
          if (again?.ok && again.path && existsSync(again.path)) {
            live(slot, it, 'cutting', { src: peek(it, again.path, 'raw2') })
            const c2 = await cutAndCheck(again.path, it, guide)
            if (!c2.cutFailed) { c = c2; live(slot, it, 'checking', { src: peek(it, c.view, 'check2') }) }
          }
        }
        if (c.cutFailed) { live(slot, it, 'failed', { problems: c.problems }); step({ kind: 'setup', text: `could not cut out the ${it.what}: ${c.problems[0]}`, ok: false }); continue }
        r = { ...r, path: c.path }
      }
      const { file, name } = keep(it, r.path)
      done.set(it.id, { file, what: it.what, kind: it.kind, ...(it.look ? { look: it.look } : {}), ...(it.companion ? { companion: true } : {}) })
      live(slot, it, 'done', { src: img(name) })
      step({ kind: 'setup', text: `painted the ${it.what}${r.backup ? ` with ${r.backup.provider} (${choice.provider} refused it)` : r.secondTry ? ' on the second try' : ''}` })
    }
  }
  // A sprite sheet: painted over the figure's own picture so it stays on-model, cut into a
  // strip of frames (games/ares/tools/sheets/cut.py), then checked by its numbers and by the
  // reviewer on dark and magenta. One sent back is painted once more; the second one stands.
  const quota = (it, slot, why) => {
    if (!OUT_OF_QUOTA.test(why) || stopped) return false
    stopped = { provider: choice.provider, model: choice.model || choice.provider, why: why.slice(0, 200) }
    live(slot, it, 'failed', { problems: ['out of quota'] })
    step({ kind: 'setup', text: `${stopped.model} is out of quota: stopped painting`, ok: false, art: 'quota' })
    return true
  }
  async function paintSheet(slot, it) {
    // the uncut picture of the figure, else (art kept from an older build) its cut-out sprite
    // a kit or an effect sheet has no figure: the hero's picture (else the title) is its style reference
    const kit = !!(it.kit || it.fx), from = kit ? ['sprite-hero', 'title'] : [it.after]
    const ref = from.flatMap(id => [raws.get(id), done.get(id)?.file && join(appDir, 'public', done.get(id).file)]).find(f => f && existsSync(f))
    if (!ref && !kit) { live(slot, it, 'failed', { problems: ['no picture of the figure to paint from'] }); step({ kind: 'setup', text: `left out the ${it.what}: no picture of the figure to paint from`, ok: false }); return }
    const pick = art.tierFor(choice, { hero: true })
    // the key the sheet is painted on comes from the figure's own picture: the key colour
    // furthest from its colours (the layout's key, guessed from the words, is the fallback)
    const measured = kit ? null : await art.measureKey(ref, { py: (await cutPy()) || undefined })
    let layout = measured && measured.pick !== art.keyOf(it.layout) ? art.swapKey(it.layout, measured.pick) : it.layout
    if (layout !== it.layout) step({ kind: 'setup', text: `the ${it.what} is painted on ${art.keyOf(layout)}: the furthest key from the figure's colours` })
    // a sheet is painted over the figure's own picture, so a refusal is tried once more on the same provider
    const go = strict => paintWithBackup(() => imagegen(['--provider', pick.provider, ...(pick.model ? ['--model', pick.model] : []), '--aspect', 'landscape', ...(kit ? (ref ? ['--ref', ref] : []) : ['--ref', ref, '--edit']), kit ? art.kitPrompt(it, guide, { strict, layout }) : art.sheetPrompt(it, guide, { strict, layout })], 300000), { choice: pick, quota: OUT_OF_QUOTA, exists: existsSync })
    let fixes = ''
    for (let go2 = 0; go2 < 2; go2++) {
      live(slot, it, go2 ? 'sent back' : 'painting', go2 ? { problems: fixes.split('; ') } : {})
      const r = await go(fixes).catch(err => ({ ok: false, error: String(err.message || err) }))
      if (!r.ok || !r.path || !existsSync(r.path)) {
        const why = String(r.error || 'no image')
        if (quota(it, slot, why)) { queue.unshift(it); return }
        live(slot, it, 'failed', { problems: [why.slice(0, 80)] })
        step({ kind: 'setup', text: `could not paint the ${it.what}: ${why.slice(0, 120)}`, ok: false })
        return
      }
      live(slot, it, 'cutting', { src: peek(it, r.path, go2 ? 'raw2' : 'raw') })
      const strip = join(dirname(r.path), `${it.id}-strip.webp`), view = join(dirname(r.path), `${it.id}-check.png`)
      const py = await cutPy()
      if (!py) { live(slot, it, 'failed', { problems: ['cutting sheets needs numpy and scipy'] }); step({ kind: 'setup', text: `could not cut the ${it.what}: no Python with numpy and scipy (set SWARM_CUT_PY)`, ok: false }); return }
      const cut = await new Promise(ok => execFile(py, [join(root, 'games', 'ares', 'tools', 'sheets', 'cut.py'), r.path, strip, ...(it.fx ? ['--fx'] : [])], { timeout: 120000 }, (err, out, errOut) => ok({ ok: !err, out: String(out || ''), why: String(errOut || err?.message || '').trim() })))
      let meta = null
      try { meta = JSON.parse(cut.out.trim().split('\n').pop()) } catch {}
      if (!cut.ok || !meta || !existsSync(strip)) {
        live(slot, it, 'failed', { problems: [cut.why.split('\n').pop().slice(0, 80) || 'the cut failed'] })
        step({ kind: 'setup', text: `could not cut the ${it.what} into frames: ${cut.why.split('\n').pop().slice(0, 120)}`, ok: false })
        return
      }
      await new Promise(ok => execFile(py, [join(root, 'scripts', 'cutout.py'), '--preview-only', strip, view], { timeout: 60000 }, () => ok()))
      if (existsSync(view)) live(slot, it, 'checking', { src: peek(it, view, go2 ? 'check2' : 'check') })
      const qc = meta.qc || {}
      // the cut measures the painted sheet too: figures close to the key they stand on
      const clash = go2 === 0 ? art.keyClash(meta.key) : null
      const numbers = [...(qc.edge?.length ? [`frame ${qc.edge.map(n => n + 1).join(', ')} cut off at the edge`] : []), ...(qc.ok === false && !qc.edge?.length && !it.fx ? [kit ? `only ${qc.frames} of the six pieces are there` : 'frames differ in size'] : []), ...(clash ? [clash.problem] : [])]
      const look = existsSync(view) ? await checkArt(view, guide, (_, image) => (kit ? art.kitMessages(it.what, image, it.frames, !!it.fx) : art.sheetMessages(it.what, image, it.frames))) : { ok: true, skipped: true, problems: [] }
      const problems = [...numbers, ...(look.skipped ? [] : look.problems)]
      if (problems.length && go2 === 0) {
        fixes = problems.join('; ')
        // the key colour was the trouble: the second sheet is painted on the other key
        const swap = art.keyTrouble(problems)
        if (swap) layout = art.swapKey(layout, clash?.to || art.otherKey(meta.key?.scores || measured?.scores, art.keyOf(layout)))
        step({ kind: 'setup', text: `sent back the ${it.what}: ${problems.join(', ')}${swap ? `; painting it again on ${art.keyOf(layout)}` : ''}` })
        continue
      }
      // the reviewer still sees a wrong sheet after the second try: the game keeps the still sprite
      if (!look.skipped && look.problems.length) {
        live(slot, it, 'failed', { problems: look.problems })
        step({ kind: 'setup', text: `left out the ${it.what}: ${look.problems[0]}${kit ? '' : '; the game uses the still sprite'}`, ok: false })
        return
      }
      const { file, name } = keep(it, strip)
      writeFileSync(join(runsDir, runId, 'img', name.replace(/\.[a-z]+$/i, '.json')), JSON.stringify(meta))
      done.set(it.id, { file, what: it.what, kind: it.kind, ...sheetInfo(it, meta) })
      // a kit: each piece becomes a trimmed picture of its own (scripts/kit_split.py)
      let pieces = 0
      if (it.parts) {
        const parts = join(dirname(r.path), `${it.id}-parts`)
        mkdirSync(parts, { recursive: true })
        const sp = await new Promise(ok => execFile(py, [join(root, 'scripts', 'kit_split.py'), strip, parts, ...it.parts.map(p => p.id)], { timeout: 60000 }, (err, out) => { try { ok(err ? null : JSON.parse(String(out).trim().split('\n').pop())) } catch { ok(null) } }))
        for (const p of sp?.pieces || []) {
          const part = it.parts.find(x => x.id === p.name)
          if (!part || !existsSync(p.file)) continue
          done.set(part.id, { file: keep(part, p.file).file, what: part.what, kind: part.kind })
          pieces++
        }
        if (sp?.empty?.length) step({ kind: 'setup', text: `the ${it.what} came out without: ${sp.empty.join(', ')}`, ok: false })
      }
      live(slot, it, 'done', { src: img(name), ...(problems.length ? { problems } : {}) })
      step({ kind: 'setup', text: `painted the ${it.what}: ${it.parts ? `${pieces} pieces` : `${meta.frames} frames`}${problems.length ? ` (kept after a second try: ${problems[0]})` : ''}` })
      return
    }
  }
  // The idle from a video clip: the painted idle's first frame (else the sprite) on the key colour,
  // animated by the video model, then cut into a looping sheet on the heavy machine
  // (scripts/idle_sheet.py through engine/heavy.mjs) and checked frame by frame. It replaces the
  // painted idle only when it passes; otherwise the painted one stays.
  async function videoSheet(slot, it) {
    const say = idleSay(it)
    const fail = async (why, extra = {}) => {
      live(slot, it, 'failed', { problems: [String(why).slice(0, 80)] })
      // the next route: close keyframes and the in-betweener, when one is set up
      // (keyframes kept from a build before are used again, even with the image model out)
      const interp = interpOf(heavyConfig(dataDir)), g = await gameMod()
      const next = interp ? g.idleKeySheets(spec).filter(m => !items.some(i => i.id === m.id)) : []
      const go = next.length && (done.has(next[0].id) || reuse(next[0]) || !stopped)
      say('failed', { text: go ? `${why}; ${interp.name} will fill in the frames between close keyframes` : IDLE_SAY.failed(why), ...extra })
      step({ kind: 'setup', text: `${go ? 'no video idle' : 'kept the painted idle'}: ${why}`, ok: false })
      if (go) for (const m of next) { items.push(m); if (!done.has(m.id)) queue.push(m) }
    }
    const base = done.get(it.ref), sprite = done.get('sprite-hero')
    const strip = base?.file && join(appDir, 'public', base.file)
    const fromStrip = !!(strip && existsSync(strip) && base.cell)
    const src = fromStrip ? strip : sprite?.file && join(appDir, 'public', sprite.file)
    if (!src || !existsSync(src)) return fail('no painted frame to animate')
    const py = await cutPy()
    if (!py) return fail('no Python with numpy and scipy (set SWARM_CUT_PY)')
    const o = it.option, key = idleKey(it.look), aspect = o.aspect
    const startName = idleStartName(runId), start = join(imgDir, startName)
    const made = await new Promise(ok => execFile(py, [join(root, 'scripts', 'idle_sheet.py'), 'start', src, start, '--cell', String(fromStrip ? base.cell[0] : 0), '--key', key.hex, '--aspect', aspect], { timeout: 60000 }, err => ok(!err)))
    if (!made || !existsSync(start)) return fail('could not make the first frame')
    live(slot, it, 'painting', { src: img(startName) })
    say('making', { text: IDLE_SAY.making(o.by), start: img(startName), line: o.line })
    const tag = randomBytes(4).toString('hex'), clipName = `idle-${tag}.mp4`, clip = join(imgDir, clipName)
    const v = await videogen(['--provider', o.provider, ...(o.model ? ['--model', o.model] : []), '--image', start, '--seconds', String(o.seconds), '--aspect', aspect, '--out', clip, idlePrompt({ who: it.who, look: it.look, key, tune: o.tune })], 900000)
    if (!v.ok || !existsSync(clip)) return fail(`the video model made no clip (${String(v.error || 'no answer').slice(0, 100)})`)
    await makePoster(clip, { ffmpeg: posterFfmpeg(dataDir, findFfmpeg) })
    say('clip', { text: IDLE_SAY.clip(), clip: `/img/${runId}/${clipName}`, model: v.model || null })
    live(slot, it, 'cutting', { src: img(startName) })
    const heavy = heavyConfig(dataDir)
    const out = `idle-${tag}.webp`, outs = [out, `idle-${tag}.json`, `idle-${tag}-check.png`, `idle-${tag}-loop.webp`]
    const r = await runHeavy({ config: heavy, script: join(root, 'scripts', 'idle_sheet.py'), files: [join(root, 'games', 'ares', 'tools', 'sheets', 'cut.py'), clip], args: ['sheet', clipName, out, ...(interpOf(heavy)?.args || [])], outputs: outs, outDir: imgDir, timeout: 600000 })
    await idleKeep(slot, it, r, outs, fail, 'the clip could not be cut into a loop', meta => ({
      how: 'the clip', step: `animated the ${it.who} idle from a ${o.by} clip: ${meta.frames} frames at ${meta.fps} fps${meta.video?.rife ? `, ${meta.video.rife} in-between frames on the seam` : ''}`
    }))
  }
  const idleSay = it => (state, extra = {}) => record(runId, { type: 'game:idle', t: Date.now(), run: runId, state, who: it.who, ...extra })
  // a made idle sheet back from the heavy machine: the numbers, then the reviewer on every frame;
  // a pass replaces the painted idle in the game
  async function idleKeep(slot, it, r, outs, fail, cutWhy, said) {
    const say = idleSay(it)
    let meta = null
    try { meta = JSON.parse(readFileSync(join(imgDir, outs[1]), 'utf8')) } catch {}
    if (!r.ok || !meta || !existsSync(join(imgDir, outs[0]))) return fail(`${cutWhy} (${(r.err.trim().split('\n').pop() || 'no sheet').slice(0, 100)})`)
    say('sheet', { text: IDLE_SAY.sheet(meta.frames), sheet: img(outs[3]), check: img(outs[2]), where: r.where, rife: meta.video?.rife || meta.keys?.made || 0 })
    live(slot, it, 'checking', { src: img(outs[2]) })
    const look = await checkArt(join(imgDir, outs[2]), guide, (_, image) => idleMessages(it.what, image))
    const problems = [...(meta.qc?.problems || []), ...(look.skipped ? [] : look.problems)]
    if (problems.length) return fail(problems.slice(0, 2).join(', '), { sheet: img(outs[3]), check: img(outs[2]) })
    const { file, name } = keep({ id: it.replaces }, join(imgDir, outs[0]))
    writeFileSync(join(imgDir, name.replace(/\.[a-z]+$/i, '.json')), JSON.stringify(meta))
    done.set(it.replaces, { file, what: `idle loop of ${it.who}`, kind: 'sheet', ...sheetInfo({ kind: 'sheet' }, meta) })
    live(slot, it, 'done', { src: img(outs[2]) })
    const w = said(meta)
    say('done', { text: IDLE_SAY.done(meta.frames, w.how), sheet: img(outs[3]), check: img(outs[2]), fps: meta.fps, frames: meta.frames, reviewed: !look.skipped })
    step({ kind: 'setup', text: w.step })
  }
  // The keys route: the close keyframes (painted over the sprite, cut like any sheet) back on the
  // key colour, the frames between them made by the in-betweener, checked for ghost blends. A
  // failure (keys too far apart, a ghost) keeps the painted idle.
  async function tweenSheet(slot, it) {
    const say = idleSay(it)
    const fail = why => {
      live(slot, it, 'failed', { problems: [String(why).slice(0, 80)] })
      say('failed', { text: IDLE_SAY.failed(why) })
      step({ kind: 'setup', text: `kept the painted idle: ${why}`, ok: false })
    }
    const heavy = heavyConfig(dataDir), interp = interpOf(heavy)
    if (!interp) return fail('no in-betweener set up')
    const keysFile = done.get(it.after)?.file, strip = keysFile && join(appDir, 'public', keysFile)
    const meta = join(imgDir, `game-${it.after}.json`)
    if (!strip || !existsSync(strip) || !existsSync(meta)) return fail('no keyframes')
    live(slot, it, 'painting', { src: img(`game-${it.after}${extname(strip)}`) })
    say('tween', { text: IDLE_SAY.tween(interp.name), start: img(`game-${it.after}${extname(strip)}`) })
    const tag = randomBytes(4).toString('hex'), out = `idle-${tag}.webp`, outs = [out, `idle-${tag}.json`, `idle-${tag}-check.png`, `idle-${tag}-loop.webp`]
    const sName = `keys-${tag}${extname(strip)}`, mName = `keys-${tag}.json`
    copyFileSync(strip, join(imgDir, sName)); copyFileSync(meta, join(imgDir, mName))
    const r = await runHeavy({ config: heavy, script: join(root, 'scripts', 'idle_sheet.py'), files: [join(root, 'games', 'ares', 'tools', 'sheets', 'cut.py'), join(imgDir, sName), join(imgDir, mName)], args: ['keys', sName, mName, out, '--key', idleKey(it.look).hex, ...interp.args], outputs: outs, outDir: imgDir, timeout: 600000 })
    await idleKeep(slot, it, r, outs, fail, 'the keyframes could not be in-betweened', m => ({
      how: `${m.keys?.keys || 4} keyframes and ${interp.name}`, step: `animated the ${it.who} idle from ${m.keys?.keys || 4} close keyframes with ${interp.name}: ${m.frames} frames at ${m.fps} fps, no ghost blends`
    }))
  }
  await Promise.all(PAINTERS.map((_, i) => worker(i)))
  artJobs.delete(runId)
  // every library picture in the game keeps its credit beside the art
  const cr = creditsFor(credits)
  if (cr) { writeFileSync(join(appDir, 'public', 'art', 'CREDITS.md'), cr.md); writeFileSync(join(appDir, 'public', 'art', 'credits.json'), JSON.stringify(cr.json, null, 1)) }
  // (a kit's sheet is not handed to the game: its pieces are)
  const wanted = items.filter(i => !i.keys && !i.parts)
  const out = wanted.map(i => done.get(i.id)).filter(Boolean)
  // out of quota: the build is told which pictures are missing and which model ran out
  if (stopped) out.stopped = { ...stopped, painted: out.length, missing: wanted.length - out.length }
  return out
}

// a glTF binary (glb, magic "glTF") or a glTF JSON file
function isGltf(file) {
  try {
    const fd = openSync(file, 'r'), b = Buffer.alloc(4)
    try { readSync(fd, b, 0, 4, 0) } finally { closeSync(fd) }
    return /\.glb$/i.test(file) ? b.toString('latin1') === 'glTF' : b.toString('latin1').trimStart().startsWith('{')
  } catch { return false }
}

async function startGame(spec, extraCopy = {}, { idle } = {}) {
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
  // cast made from the project's art (spec 20): Meshy models from the library, sprites from the site's pictures
  const cm = await castMod()
  for (const c of cm.cleanCast(spec.cast)) {
    if (c.source === 'meshy') for (const f of [c.file, ...Object.values(c.clips || {})]) { if (isGltf(join(lib, f))) copy[`public/models/${f}`] = join(lib, f) }
    if (c.source === 'art') { const [, run, f] = c.art.match(/^\/img\/([^/]+)\/(.+)$/); if (existsSync(join(runsDir, run, 'img', f))) copy[`public/models/${cm.spriteFile(c)}`] = join(runsDir, run, 'img', f) }
  }
  Object.assign(copy, extraCopy)
  const a = await apps()
  const credits = cm.castCredits(spec.cast)
  await a.start(id, { kind: 'game', fresh: true, title: spec.title, prompt: g.gamePrompt(spec), files: { 'GAME_SPEC.md': g.specMarkdown(spec), ...(credits ? { 'CREDITS.md': credits } : {}) }, copy, ...(idle !== undefined ? { idle } : {}) })
  // the site remembers its game, so each can open the other
  if (spec.brand?.from && existsSync(join(runsDir, spec.brand.from))) record(spec.brand.from, { type: 'game:linked', t, run: spec.brand.from, game: id, title: String(spec.title).slice(0, 80) })
  broadcast({ type: 'files:changed', t, run: id })
  return { run: id }
}

// The name a brief starts with, before a dash or colon: "ARES Player Hub — the account app ..." -> "ARES Player Hub".
function nameOfBrief(brief = '') {
  const m = String(brief).match(/^\s*([^\n—–:]{2,48}?)\s*(?:—|–| - |:)/)
  return m && m[1].trim().split(/\s+/).length <= 6 ? m[1].trim() : ''
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
  const named = nameFor(id)
  const out = await exportRun({ events, runId: id, runDir: join(runsDir, id), sections: Array.isArray(input.sections) ? input.sections.slice(0, 80) : [], name: named?.name, fill: fillExport(id) })
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
  // a hosted site is named <project>-site, like ares-site
  const hostName = deployName(out.brand, 'site')
  // the site's address goes into its canonical links, share tags, sitemap and robots (engine/seo.mjs)
  const rebase = base => { try { out.rebase(base) } catch (err) { send('error', { where: 'seo', message: String(err.message || err) }) } }
  const go = target === 'vercel' ? publishVercel({ dir, name: hostName, creds, dataDir, rebase, onStage })
    : target === 'cloudflare' ? publishCloudflare({ dir, name: hostName, creds, dataDir, rebase, onStage })
    // each version of a project is its own site: Bot Wiki at <login>.github.io/bot-wiki, its version 2
    // at …/bot-wiki-2, so publishing one never replaces another (owner, 2026-11-12)
    : publishGitHub({ dir, name: versionOf(id) > 1 ? `${out.name}-${versionOf(id)}` : out.name, title, key: id, dataDir, rebase, onStage })
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
async function rework(runId, send, s, agent, theme, args, { draft = null } = {}) {
  const layer = s.key.split('/').pop(), page = s.key.split('/')[0], t0 = Date.now()
  // a draft (Scribble): written beside the original, which stays as it is until the person accepts it
  if (draft) {
    const halt = stopSignal(runId)
    if (halt.aborted) return
    send('draft:start', { page, layer, agent, marks: draft.marks })
    fixing.set(runId, (fixing.get(runId) || 0) + 1)
    return traced({ agent, page, layer }, () => fixSection({ provider: provider('worker'), model: modelFor('worker'), theme, html: s.html, role: s.role || layer, images: false, ...args, signal: halt }))
      .then(html => send('draft', { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, page, layer, agent, role: s.role, html: html.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, ''), marks: draft.marks, ms: Date.now() - t0 }))
      .catch(err => send('draft:failed', { page, layer, agent, marks: draft.marks, message: halt.aborted ? 'stopped' : String(err.message || err).slice(0, 200) }))
      .finally(() => fixing.set(runId, fixing.get(runId) - 1))
  }
  send('agent:assign', { agent, page, layer, role: s.role, fixing: true })
  send('layer:reset', { page, layer, agent })
  // with an image model, a rewrite may add a photo ("add a picture of…"), painted once it is done
  const choice = await imageChoice().catch(() => null)
  const halt = stopSignal(runId)
  if (halt.aborted) return
  fixing.set(runId, (fixing.get(runId) || 0) + 1)
  return traced({ agent, page, layer }, () => fixSection({ provider: provider('worker'), model: modelFor('worker'), theme, html: s.html, role: s.role || layer, images: !!choice, ...args, signal: halt,
    onDelta: d => send('layer:delta', { page, layer, agent, text: d }) }))
    .then(html => { send('layer:done', { page, layer, agent, ms: Date.now() - t0, html, fixed: true }); if (choice) paintNew(runId, send, page, layer, html, choice) })
    .catch(err => send('layer:failed', { page, layer, agent, message: halt.aborted ? 'stopped' : String(err.message || err), keep: s.html }))
    .finally(() => fixing.set(runId, fixing.get(runId) - 1))
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
  const marked = Array.isArray(input.marks) && input.marks.length > 0
  if (!text && !marked) throw new Error('say what to change')
  // the same comment from two open canvases (a /swarm fix reaches every one) is taken once
  const seen = `${id}|${text}|${Array.isArray(input.targets) ? input.targets.join(',') : ''}`
  if (!marked && recentComments.get(seen) > Date.now() - 8000) return { sections: [], reply: '', duplicate: true }
  recentComments.set(seen, Date.now())
  const theme = events.findLast(e => e.type === 'theme')
  // the canvas sends its own copy of the sections (with any edits); otherwise the saved ones
  const given = Array.isArray(input.sections) ? input.sections.filter(s => s && typeof s.key === 'string' && typeof s.html === 'string').slice(0, 60) : []
  const sections = given.length ? given.map(s => ({ key: s.key, role: String(s.role || s.key).slice(0, 80), html: s.html })) : runSections(events)
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  // Scribble: marks drawn on the pages, read by the vision model, answered as drafts beside the original
  if (marked) return markRequest(id, { events, start, theme, sections, text, input, send })
  // "improve the SEO", "a better description for the menu page": the crew's SEO pass
  if (seoAsk(text)) return seoRequest(id, { events, start, theme, given, text, send })
  // the look only ("change the brand colours", "make it darker"), with no section named: the theme changes in
  // place and every page stays as it is
  if (lookAsk(text) && !(Array.isArray(input.targets) && input.targets.length) && typeof input.target !== 'string') return lookRequest(id, { events, start, text, send })
  // layers dragged into the chat (web/layerlink.js): just those sections, and the turn keeps them
  const dragged = Array.isArray(input.targets) ? [...new Set(input.targets.filter(k => typeof k === 'string' && sections.some(s => s.key === k)))].slice(0, 12) : []
  let keys = dragged.length ? dragged : typeof input.target === 'string' && sections.some(s => s.key === input.target) ? [input.target] : null
  let reply = ''
  send('comment', { text, target: keys?.[0] || null, ...(dragged.length ? { layers: dragged.map(k => ({ run: id, page: k.split('/')[0], layer: k.split('/').pop() })) } : {}) })
  if (!keys) {
    const heads = sections.map(s => ({ key: s.key, role: s.role, head: (/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(s.html)?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) }))
    const routed = await routeComment({ provider: provider('planner'), model: modelFor('planner'), text, sections: heads, signal: AbortSignal.timeout(45000) })
    keys = routed.sections
    reply = routed.reply
    if (!keys.length) { send('comment:none', { text }); throw new Error('could not tell which section that is about: select one on the canvas and comment there') }
  }
  const agents = start.agents || []
  // only about the picture: repaint it and leave the section as it is
  // (or a short follow-up right after a picture ask on that section: "much more impactful")
  const lastTake = k => events.findLast(e => e.type === 'comment:take' && `${e.page}/${e.layer}` === k)
  const aboutPicture = k => pictureAsk(text) || (vagueAsk(text) && lastTake(k)?.picture && Date.now() - lastTake(k).t < 15 * 60000)
  const picChoice = keys.some(aboutPicture) ? await imageChoice().catch(() => null) : null
  keys.forEach((k, i) => {
    const s = sections.find(x => x.key === k)
    const agent = agents[(commentTurn++ * 3 + 2) % Math.max(1, agents.length)]?.id
    const gen = picChoice && aboutPicture(k) ? gensOf(s.html)[0] : null
    if (gen) return void repaint(id, send, s, agent, text, gen, picChoice)
    send('comment:take', { text, page: k.split('/')[0], layer: k.split('/').pop(), role: s.role, agent, reply: i === 0 ? reply : '' })
    // a section the person changed by hand (web/edit/patches.js): its builder keeps those changes
    rework(id, send, s, agent, theme, { comment: keepHand(text, handChanges(events, k.split('/')[0], k.split('/').pop())) })
  })
  return { sections: keys, reply }
}

// Scribble (engine/marks.mjs): the marks get ids on this run, their pictures are kept in marks/, the
// vision model reads them (how it read each one is the reply), and each marked section's builder writes
// a draft beside the original. Marks still open from earlier go along. A mark the model could not read
// is asked about instead of changed.
const MARK_PIC = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]{20,4000000}$/
async function markRequest(id, { events, start, theme, sections, text, input, send }) {
  const given = cleanMarks(input.marks)
  if (!given.length) throw new Error('those marks did not come through')
  const known = new Map(sections.map(s => [s.key, s]))
  let n = nextMarkId(events)
  const ids = {}
  const marks = given.map(m => { ids[m.id] = `k${n++}`; return { ...m, id: ids[m.id], target: { ...m.target, section: known.has(m.target.section) ? m.target.section : null } } })
  // the pictures: each page with its marks drawn on it, and a crop around each mark
  const dir = join(runsDir, id, 'marks')
  mkdirSync(dir, { recursive: true })
  const pic = (name, data) => { if (!MARK_PIC.test(String(data || ''))) return null; writeFileSync(join(dir, name), Buffer.from(data.split(',')[1], 'base64')); return data }
  const shots = Object.entries(input.shots || {}).slice(0, 6).flatMap(([page, data]) => /^[\w-]{1,64}$/.test(page) && pic(`${marks[0].id}-${page}.jpg`, data) ? [{ page, image: data }] : [])
  const crops = given.flatMap(m => { const data = input.crops?.[m.id]; return pic(`${ids[m.id]}.jpg`, data) ? [{ id: ids[m.id], image: data }] : [] })
  const open = openMarks(events)
  send('marks', { text, marks, crops: crops.map(c => c.id) })
  const roles = Object.fromEntries(sections.map(s => [s.key, s.role]))
  // the vision model reads them; with none, the builder gets the data lines alone
  let reads = []
  const seeing = models.reviewer.apiKey && modelFor('reviewer')
  if (seeing && (shots.length || crops.length)) {
    // like the art check: no thinking (it ate the answer), and the next vision model when one reads nothing
    const chain = [seeing, ...(host(models.reviewer.baseUrl) === 'api.inferhub.dev' ? REVIEW_FALLBACKS.filter(m => m !== seeing) : [])]
    const messages = readMarksMessages({ text, marks, open, roles, shots, crops })
    for (const m of chain) {
      try {
        const res = await streamChat(provider('reviewer'), { trace: { kind: 'marks' }, model: m, messages, maxTokens: 1500, temperature: 0.2, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal: AbortSignal.timeout(60000) })
        reads = parseReads(res.text, marks)
        if (reads.length) break
        console.error(`marks read: ${m} read nothing:`, String(res.text || '').slice(0, 200))
      } catch (err) { console.error(`marks read: ${m}:`, err.message) }
    }
  }
  const asked = new Set(reads.filter(r => r.ask && !r.change).map(r => r.mark))
  const reply = reads.map(r => (r.ask && !r.change ? `${r.mark}: ${r.ask}` : r.read)).filter(Boolean).join(' ').slice(0, 600)
  send('marks:read', { reads, reply })
  // a mark on no section: the planner works out which one from the words and the mark lines
  const bySection = new Map()
  for (const m of marks) {
    if (asked.has(m.id)) continue
    let k = m.target.section
    if (!k) {
      const heads = sections.map(s => ({ key: s.key, role: s.role, head: (/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(s.html)?.[1] || '').replace(/<[^>]+>/g, '').trim().slice(0, 60) })).filter(s => s.key.startsWith(`${m.page}/`) || s.key.startsWith('*/'))
      k = (await routeComment({ provider: provider('planner'), model: modelFor('planner'), text: `${text} ${markLine(m)}`, sections: heads, signal: AbortSignal.timeout(45000) }).catch(() => ({ sections: [] }))).sections[0] || null
    }
    if (k && known.has(k)) bySection.set(k, [...(bySection.get(k) || []), m])
  }
  const agents = start.agents || []
  const keys = [...bySection.keys()]
  keys.forEach((k, i) => {
    const s = known.get(k), list = bySection.get(k)
    const agent = agents[(commentTurn++ * 3 + 2) % Math.max(1, agents.length)]?.id
    send('comment:take', { text: text || `${list.length} mark${list.length > 1 ? 's' : ''}`, page: k.split('/')[0], layer: k.split('/').pop(), role: s.role, agent, reply: i === 0 ? reply.slice(0, 90) : '', marks: list.map(m => m.id) })
    rework(id, send, s, agent, theme, { comment: keepHand(fixText({ text, marks: list, reads, role: s.role }), handChanges(events, k.split('/')[0], k.split('/').pop())) }, { draft: { marks: list.map(m => m.id) } })
  })
  if (!keys.length && !asked.size) send('comment:none', { text })
  return { sections: keys, reply, reads, ids }
}

// A draft (Scribble) accepted becomes the section's new version; dismissed, it is dropped. Either way the
// marks it answered are closed.
function closeDraft(id, did, accept) {
  const events = readEvents(id)
  if (!events) throw Object.assign(new Error('no such build'), { status: 404 })
  const d = events.findLast(e => e.type === 'draft' && e.id === did)
  if (!d) throw Object.assign(new Error('no such draft'), { status: 404 })
  if (events.some(e => e.type === 'draft:closed' && e.id === did)) throw Object.assign(new Error('that draft is already closed'), { status: 409 })
  const send = (type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  if (accept) send('layer:done', { page: d.page, layer: d.layer, agent: d.agent, html: d.html, fixed: true, draft: did })
  send('draft:closed', { id: did, page: d.page, layer: d.layer, accepted: !!accept })
  if (d.marks?.length) send('mark:status', { ids: d.marks, status: 'closed', draft: accept ? 'accepted' : 'dismissed' })
  return { ok: true }
}

// The SEO pass on request (engine/seo.mjs): one planner call edits titles and descriptions,
// and a builder rewrites at most two sections when the aim needs words the page lacks.
// A look-only ask (engine/lookask.mjs): the planner names the new colours, fonts or corners, and they are
// recorded as the same `edit` events the Design panel makes, so open canvases restyle at once, Undo-able there,
// and exports carry them. A reference link whose look is ready is shown to the planner, for "use the reference's
// colours". Nothing is rebuilt.
async function lookRequest(id, { events, start, text, send }) {
  if (!models.planner.apiKey) throw new Error('no model key yet: start a build from Hermes once')
  const theme = themeNow(events)
  if (!theme?.vars) throw new Error('nothing built yet')
  const agents = start.agents || []
  const agent = agents[(commentTurn++ * 3 + 1) % Math.max(1, agents.length)]?.id
  send('comment', { text, target: null })
  const pid = projects.projectOf(id)
  const reference = pid ? refs.list(pid).find(r => r.kind === 'link' && r.look?.state === 'ready')?.look?.tokens || null : null
  const chat = async messages => (await streamChat(provider('planner'), { trace: { kind: 'look-ask', agent }, model: modelFor('planner'), maxTokens: 700, temperature: 0.3, signal: AbortSignal.timeout(60000), extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages })).text
  const { edits, reply } = await lookEdits({ theme, text, reference, chat })
  if (!edits.length) { send('seo:pass', { text, agent, reply: 'I could not tell what to change in the look. Name the colours or fonts you want.', failed: true }); return { sections: [], reply: '' }
  }
  const stamp = Date.now().toString(36)
  edits.forEach((e, i) => send('edit', { ...e, id: `lk${stamp}${i}` }))
  const said = `${reply || 'The look is changed.'} Every page stays as it is.`
  send('seo:pass', { text, agent, reply: said, changes: edits.map(e => (e.kind === 'var' ? `${e.name.replace(/^--/, '')} ${e.value}` : e.kind === 'font' ? `${e.role} font ${e.value}` : `corners ${e.value}`)) })
  return { sections: [], reply: said }
}

async function seoRequest(id, { events, start, theme, given, text, send }) {
  if (!models.planner.apiKey) throw new Error('no model key yet: start a build from Hermes once')
  const snap = snapshot(events, given, { name: nameFor(id)?.name })
  const pages = currentSeo(snap)
  if (!pages.length) throw new Error('nothing built yet')
  const agents = start.agents || []
  const agent = agents[(commentTurn++ * 3 + 1) % Math.max(1, agents.length)]?.id
  send('seo:start', { text, agent })
  let r
  try {
    r = await seoPass({ streamChat, provider: provider('planner'), model: modelFor('planner'), ask: text, brand: snap.brand, pages, signal: AbortSignal.timeout(60000) })
  } catch (err) {
    send('seo:pass', { text, agent, reply: `SEO pass failed: ${String(err.message || err).slice(0, 140)}`, failed: true })
    throw err
  }
  for (const c of r.changes) send('seo', { page: c.page, ...(c.title ? { title: c.title } : {}), ...(c.description ? { description: c.description } : {}), by: 'crew' })
  send('seo:pass', { text, agent, reply: r.reply, changes: r.summary, copy: r.copy.map(c => c.key) })
  const sections = snap.pages.flatMap(p => p.sections)
  r.copy.forEach((c, i) => {
    const s = sections.find(x => x.key === c.key)
    if (!s) return
    const who = agents[(commentTurn++ * 3 + 2) % Math.max(1, agents.length)]?.id
    send('comment:take', { text, page: c.key.split('/')[0], layer: c.key.split('/').pop(), role: s.role, agent: who, reply: i === 0 ? c.ask.slice(0, 90) : '' })
    rework(id, send, s, who, theme, { comment: keepHand(c.ask, handChanges(events, c.key.split('/')[0], c.key.split('/').pop())) })
  })
  return { sections: r.copy.map(c => c.key), reply: r.reply, seo: r.changes }
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
  // a request is use, but not Hermes's bridge re-attaching every few seconds or a status look (bridge.py, launcher.py)
  if (!POLLS.test(url.pathname)) idle.touch()
  if (!hosts.has(req.headers.host)) {
    res.writeHead(421).end('wrong host')
    return
  }
  // model calls, forwarded to Hermes (engine/hermesllm.mjs); its own key, never a provider's
  if (llm.handle(req, res)) return

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
    // the code changed under this server (an update): the page's parts would no longer fit. With no work
    // running, a new server takes over and the page opens again on it
    if (replaceSelf()) return res.end('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2"><title>Swarm Studio</title><body style="margin:0;background:#0f0f0f">')
    res.end(canvasPage())
    return
  }

  // the Studio's next UI, its screens moving over one at a time (docs/decisions/0013-react-ui-coexists.md). Same
  // address as /: ?project=…&version=…&room=… opens the same place in either
  if (url.pathname === '/next') {
    res.writeHead(302, { location: `/next/${url.search}` }).end()
    return
  }
  if (url.pathname === '/next/' || url.pathname === '/next/index.html') {
    const page = nextPage(uiDist, { token })
    if (!page) return void res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(page)
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
    req.on('end', async () => {
      // no Hermes to answer the model: refused at once, with why, instead of a build that "plans" for a minute
      const gate = await hermesGate()
      if (gate) return void res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify(gate))
      let input = {}
      try {
        input = JSON.parse(body || '{}')
      } catch {}
      delete input.base
      delete input.ask
      delete input.brand
      if (!input.brief) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'brief required' }))
        return
      }
      const typed = String(input.brief).trim(), chatId = typeof input.chat === 'string' && CHAT_ID.test(input.chat) ? input.chat : null
      // redo: this project from scratch, new pages and a new look; its old versions stay restorable
      const redo = input.redo === true
      // sure: a script's explicit "I'm sure" (hermes swarm --build, remix, the evals); never a model's (decision 0020)
      const sure = input.sure === true
      delete input.chat
      delete input.redo
      delete input.sure
      // a message inside an open build belongs to that build's project
      if (typeof input.from === 'string' && typeof input.project !== 'string' && RUN_ID.test(input.from)) input.project = projects.projectOf(input.from) || undefined
      // inside a project, the owner's uploaded pictures go to the crew: builders may place them as they are,
      // and the art director matches the new pictures to them (art.styleGuide reads the brief)
      // links in the person's own words (before anything is added to the brief): pages named as what to make
      const askedLinks = linksIn(String(input.brief || ''), 2)
      if (typeof input.project === 'string') {
        const ups = projects.uploadsOf(input.project).filter(u => /^image\//.test(u.type)).slice(0, 12)
        if (ups.length) input.brief = `${String(input.brief).trim()}\n\nThe owner uploaded these pictures. Use them where they fit, as they are (<img src="…">, no data-gen), and make every new picture match their look:\n${ups.map(u => `- ${u.name}: ${u.src}`).join('\n')}`
        // the project's References store: pictures with what each is for, and links
        const rb = refs.brief(input.project)
        if (rb) input.brief = `${String(input.brief).trim()}\n\n${rb}`
        // and its Assets (spec 37): placed as they are
        const ab = projectAssets.brief(input.project)
        if (ab) input.brief = `${String(input.brief).trim()}\n\n${ab}`
      }
      // "recreate this: <link>": the page is read, so the crew writes from what it says and not from an address.
      // A link kept as a reference is a look to learn from, not this; only public pages are read (spec 29).
      const asLook = typeof input.project === 'string' ? new Set(refs.list(input.project).filter(r => r.kind === 'link').map(r => r.url)) : new Set()
      for (const u of askedLinks) {
        if (asLook.has(u) || asLook.has(`${u}/`)) continue
        const p = await readPage(u).catch(() => null)
        if (p && (p.title || p.text)) input.brief = `${String(input.brief).trim()}\n\nThe owner linked ${u} as what this is about. What that page says (write the site from this; its design is not the reference):\n${[p.title && `Title: ${p.title}`, p.description && `Description: ${p.description}`, p.text && `Words: ${p.text}`].filter(Boolean).join('\n')}`.slice(0, 12000)
      }
      // A message inside an open build (from: its run) is that project's next version: the
      // last version is kept as it stands and the crew adds only what the message asks for
      // (engine/extend.mjs followUp). While the last turn is still building, the next one waits:
      // starting it would stop that build and lose what it was doing.
      const from = !redo && typeof input.from === 'string' && RUN_ID.test(input.from) ? input.from : null
      if (redo) delete input.from
      const building = r => r && !r.done && !r.controller.signal.aborted && !r.events.some(e => e.type === 'error' && (e.where === 'run' || e.where === 'models'))
      if ((from || redo) && building(current) && (current.id === from || (input.project && projects.projectOf(current.id) === input.project))) {
        res.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'busy', run: current.id }))
        return
      }
      const readRun = id => { const events = readEvents(id); if (!events) return null; let plan = null; try { plan = JSON.parse(readFileSync(join(runsDir, id, 'plan.json'), 'utf8')) } catch {} return { events, plan } }
      const next = from ? followUp({ ask: String(input.brief).trim(), from, versions: (input.project && projects.get(input.project)?.versions.map(v => v.id)) || [], read: readRun }) : null
      const base = next?.base || null
      if (next) {
        input.ask = String(input.brief).trim()
        input.brief = next.brief
        if (base) input.base = base
      }
      const pid = typeof input.project === 'string' ? input.project : null
      // Ask before every new website build (docs/decisions/0020-ask-before-build.md): the next version of a
      // build that exists (it resolved to that build, engine/extend.mjs followUp), a redo of a project that has versions, a Studio project's
      // Build (the walk is the answer), a chat whose person answered "Skip all" (once), or a script's sure
      // build. Anything else asks in the chat and builds nothing; an error while asking still asks.
      const goChat = chatId ? chats.get(chatId) : null
      const answered = sure || !!next || (redo && !!pid && (projects.get(pid)?.versions?.length || 0) > 0)
        || (!!pid && !!studios.get(pid)) || (goChat?.go?.path === 'all' && !goChat.go.run)
      if (!answered) {
        const asked = await askBeforeBuild({ chatId, typed, pid }).catch(() => ({ error: 'ask', ask: 'skips', chat: null, text: ASK_TEXT, options: askOptions(null), recommended: 'pick' }))
        return void res.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify(asked))
      }
      // the look, in Open Design's order (decision 0016 point 3): a design system the request names, then the
      // project's (a locked brand sheet, or a Studio project's own brand, spec 37), then the default (the planner's).
      // A follow-up keeps the project's
      const brand = !base ? requestedBrand(input.system, String(input.brief)) || lockedBrand(chats, chatId) || (pid ? lockedBrand(studios.brands, pid) : null) : null
      if (brand) input.brand = brand
      const run = startRun(input)
      // one answer is one build: the chat's "Skip all" is used up by this run
      if (goChat?.go && !next) await chats.update(chatId, c => { if (c.go) c.go.run = run.id }).catch(() => {})
      // "Tell the crew…" inside a project: the new run is that project's next version
      if (pid) projects.claim(run.id, pid)
      // the words go into a chat: the talk that led here, else a new one (or the project's newest)
      const chat = chatFor({ chat: chatId, text: typed, kind: 'site', project: pid })
      chatBuilt(chat, run.id, pid, typed)
      broadcast({ type: 'reset', run: run.id })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ run: run.id, ...(chat ? { chat } : {}), ...(base ? { extend: true, from: next.from } : {}) }))
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
  // Chats (spec 29): loose chats for Studio home, one chat, rename / move to a group / delete, and a
  // project's chats grouped by category. The talk itself goes through /api/discuss.
  // ?run=<id>: the chats of that build's project (the Design deck knows its run, not always its project)
  const settled = () => chats.settle(id => projects.projectOf(id)).catch(() => {})
  if (url.pathname === '/api/chats' && req.method === 'GET') {
    const run = url.searchParams.get('run')
    settled().then(() => {
      const pid = run && RUN_ID.test(run) ? projects.projectOf(run) : null
      json(200, pid ? { project: pid, ...chats.forProject(pid) } : { chats: chats.listLoose().filter(c => c.turns) })
    })
    return
  }
  const chatRoute = url.pathname.match(/^\/api\/chats\/(c-[0-9a-f]{10})$/)
  if (chatRoute) {
    const id = chatRoute[1]
    if (req.method === 'GET') { const c = chats.get(id); return c ? json(200, c) : json(404, { error: 'no such chat' }) }
    const fail = err => json(err.status || 400, { error: String(err.message || err) })
    if (req.method === 'DELETE') return void chats.remove(id).then(r => json(200, r), fail)
    if (req.method === 'POST') return readJson(1e4, input => {
      Promise.resolve()
        .then(() => typeof input.title === 'string' && chats.rename(id, input.title))
        .then(() => typeof input.category === 'string' && chats.setCategory(id, input.category))
        .then(() => json(200, chats.get(id)), fail)
    })
  }
  const projectChats = url.pathname.match(/^\/api\/projects\/([\w-]{1,64})\/chats$/)
  if (projectChats && req.method === 'GET') return void settled().then(() => json(200, chats.forProject(projectChats[1])))
  // Talk first (engine/talkplan.mjs): the Make box asks whether a message means build, talk or unsure,
  // and a talk with the planner runs in the Design deck's chat with nothing built.
  // POST /api/discuss/read { text, kind, answerTo? } -> { intent, by }
  // POST /api/discuss { said: [{ who: 'you' | 'hermia', text }], kind, brief? } -> { reply } | { brief }
  // These stay until the web side moves onto /api/talk (server/talk.mjs), which saves the chat.
  if ((url.pathname === '/api/discuss/read' || url.pathname === '/api/discuss') && req.method === 'POST') {
    const model = modelFor('planner')
    const chat = (maxTokens, ms) => model && models.planner.apiKey ? async messages => (await streamChat(provider('planner'), {
      trace: { kind: 'discuss' }, model, maxTokens, temperature: 0.3, signal: AbortSignal.timeout(ms),
      extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, messages
    })).text : null
    return readJson(1e5, async input => {
      // the talk itself needs the model; reading whether a message is a build or a talk has its own
      // fallback without one, so only the talk is refused when Hermes is not there
      if (url.pathname === '/api/discuss') { const gate = await hermesGate(); if (gate) return json(503, gate) }
      const kind = ['site', 'app', 'film', 'game'].includes(input.kind) ? input.kind : 'site'
      import('../engine/talkplan.mjs').then(async d => {
        if (url.pathname === '/api/discuss/read') return json(200, await d.readIntent({ text: String(input.text || '').slice(0, 4000), answerTo: String(input.answerTo || '').slice(0, 300), kind, chat: chat(8, 9000) }))
        const talk = chat(input.brief ? 400 : 600, 60000)
        if (!talk) return json(503, { error: 'No planner model yet: pick one in Models.' })
        const said = Array.isArray(input.said) ? input.said.slice(-40) : []
        const inRun = typeof input.from === 'string' && RUN_ID.test(input.from) ? input.from : null
        const inPid = typeof input.project === 'string' ? input.project : inRun ? projects.projectOf(inRun) : null
        // media (spec 29): the pictures attached to this turn, and its links read as pages; the planner is
        // told how each one was read, and the ones from earlier turns stay in view
        const had = (typeof input.chat === 'string' && CHAT_ID.test(input.chat) && chats.get(input.chat)?.refs) || []
        const ids = Array.isArray(input.refs) ? input.refs.filter(x => typeof x === 'string').slice(0, 8) : []
        const now = had.filter(r => ids.includes(r.id))
        const last = said.at(-1)
        const fresh = []
        if (!input.brief && last && last.who !== 'hermia') {
          for (const u of linksIn(last.text)) {
            const known = had.find(r => r.kind === 'link' && r.url === u)
            if (known) { now.push(known); continue }
            const read = await readPage(u).then(pageRead).catch(err => ({ by: 'none', text: String(err.message || err).slice(0, 120) }))
            // in a project the link is also walked for its look (below): the planner says so instead of "I can't browse"
            if (inPid && projects.get(inPid)) read.text = `${read.text ? `${read.text}\n` : ''}The crew is opening this site in a browser now to take its look (colours, type, motion); it shows on the References card when done.`.slice(0, 1600)
            const ref = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind: 'link', name: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80), file: null, url: u, src: null, read, at: Date.now() }
            now.push(ref); fresh.push(ref)
          }
        }
        const before = had.filter(r => !now.includes(r)).slice(-6)
        const told = now.length || before.length ? said.map((t, i) => i === said.length - 1 && t.who !== 'hermia' ? { ...t, text: withRefs(t.text, now) + (before.length ? `\n[Attached earlier in this talk]\n${before.map(r => `- ${r.kind === 'link' ? r.url : r.name}: ${r.read?.by === 'none' ? 'not read' : (r.read?.text || '').slice(0, 200)}`).join('\n')}` : '') } : t) : said
        const out = await (input.brief ? d.writeBrief : d.discuss)({ said: told, kind, chat: talk, project: projectState(inPid || (chats.get(input.chat)?.project ?? null)) })
        // the talk is kept in its chat (spec 29): made on the first turn, inside the project when it
        // started in one; the person's newest words and Hermia's answer are added, a brief is the spec's
        let id = typeof input.chat === 'string' && CHAT_ID.test(input.chat) && chats.get(input.chat) ? input.chat : null
        try {
          const pid = typeof input.project === 'string' ? input.project : typeof input.from === 'string' && RUN_ID.test(input.from) ? projects.projectOf(input.from) : null
          if (!id) id = chats.create({ kind, project: pid }).id
          if (fresh.length) await chats.update(id, c => { c.refs = [...(c.refs || []), ...fresh].slice(-60) })
          // a link given in a project's talk goes to its References with what the person wrote around it, and
          // its look is walked (decision 0022); the chat and the turn are kept so the look traces back to them
          const lp = pid || inPid
          if (lp && projects.get(lp)) for (const r of fresh.filter(r => r.kind === 'link')) {
            if (refs.list(lp).some(x => x.kind === 'link' && x.url === r.url)) continue
            const note = String(last.text || '').replace(/\bhttps?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
            try { walkLook(lp, refs.addLink(lp, { url: r.url, use: note, source: 'chat', from: id })) } catch (err) { console.warn('look:', err.message) }
          }
          if (!input.brief && last && last.who !== 'hermia') await chats.say(id, { who: 'person', text: last.text, refs: now.map(r => r.id) })
          if (out.reply) await chats.say(id, { who: 'planner', text: out.reply })
          if (out.brief) await chats.update(id, c => { c.spec = { brief: String(out.brief).slice(0, 8000), open: [], art: [], engine: null, time: null, cost: null, lockedAt: null, ...(c.spec || {}), ...{ brief: String(out.brief).slice(0, 8000) } } })
        } catch (err) { console.warn('chat:', err.message) }
        json(200, id ? { ...out, chat: id } : out)
      }).catch(err => json(502, { error: String(err.message || err) }))
    })
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
  // The asset library (engine/assetlib.mjs): search it, see a picture, add a pack of one's own,
  // and pick a picture for a slot of a build (used instead of painting that slot)
  if (url.pathname === '/api/library' && req.method === 'GET') {
    const q = url.searchParams
    const results = assets.search({ q: q.get('q') || '', category: q.getAll('category').filter(Boolean), pack: q.get('pack') || '', all: q.get('all') === '1', limit: Number(q.get('limit')) || 40 })
    return json(200, { results: results.map(r => ({ ...r, src: `/api/library/file?id=${encodeURIComponent(r.id)}` })) })
  }
  if (url.pathname === '/api/library/packs' && req.method === 'GET') return json(200, { packs: assets.packs() })
  // Open Design's design templates, for the person to pick one for a build (engine/odlibrary.mjs, decision 0016)
  if (url.pathname === '/api/library/templates' && req.method === 'GET') return json(200, { templates: odTemplates() })
  if (url.pathname === '/api/library/file' && req.method === 'GET') {
    assets.file(url.searchParams.get('id')).then(got => {
      if (!got) return json(404, { error: 'no such picture' })
      const type = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(got.file).toLowerCase()] || 'image/jpeg'
      res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' }).end(readFileSync(got.file))
    })
    return
  }
  if (url.pathname === '/api/library/import' && req.method === 'POST') {
    return readJson(4000, input => assets.importPack(input).then(p => json(200, p), err => json(err.status || 400, { error: String(err.message || err) })))
  }
  const libPack = url.pathname.match(/^\/api\/library\/packs\/([a-z0-9_]{1,40})$/)
  if (libPack && req.method === 'DELETE') return assets.removePack(libPack[1]) ? json(200, { ok: true }) : json(404, { error: 'no such pack of your own' })
  const runPicks = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/art\/picks$/)
  if (runPicks) {
    const dir = join(runsDir, runPicks[1])
    if (!existsSync(dir)) return json(404, { error: 'no such build' })
    if (req.method === 'GET') return json(200, { picks: readPicks(dir) })
    if (req.method === 'POST') {
      return readJson(4000, input => {
        if (input.asset && !assets.get(String(input.asset))) return json(404, { error: 'no such picture in the library' })
        json(200, { picks: setPick(dir, { slot: String(input.slot || ''), asset: input.asset || null, what: input.what || '' }), note: 'used the next time this build paints its art (Try again, or the next slice)' })
      })
    }
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
      // the References store: its pictures beside the uploads
      for (const r of refs.list(p.id).filter(r => r.kind === 'image')) out.push({ project: p.id, kind: 'upload', name: r.name, src: r.src, type: 'image/*', t: r.added })
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
    // each page's content version and its saved snapshots of it: the Overview paints these first
    b.snaps = snapsOf().list(id, events)
    return json(200, b)
  }
  // the same, on its own: what the Overview checks before photographing a page again; and a page's
  // picture from the browser, { page, v, size: 's' | 'f', image: a JPEG data URL }
  const runSnaps = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/snaps$/)
  if (runSnaps && req.method === 'GET') {
    const events = readEvents(runSnaps[1])
    if (!events) return json(404, { error: 'no such build' })
    return json(200, snapsOf().list(runSnaps[1], events))
  }
  if (runSnaps && req.method === 'POST') {
    const id = runSnaps[1]
    let body = ''
    req.on('data', c => { body += c; if (body.length > 6e6) req.destroy() })
    req.on('end', () => {
      try {
        const input = JSON.parse(body || '{}')
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(input.image || '')
        if (!m) return json(400, { error: 'send a JPEG data URL' })
        const events = readEvents(id)
        if (!events) return json(404, { error: 'no such build' })
        const out = snapsOf().save(id, events, { page: input.page, v: input.v, size: input.size, jpeg: Buffer.from(m[1], 'base64') })
        if (out === 'bad') return json(400, { error: 'bad page, version or size' })
        if (out === 'stale') return json(409, { error: 'that page has changed since' })
        json(200, { ok: true })
      } catch (err) { json(400, { error: String(err.message || err) }) }
    })
    return
  }
  // a build's own pictures and models, and the ones still to come (the code wall's asset pane)
  const runAssets = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/assets$/)
  if (runAssets && req.method === 'GET') {
    const id = runAssets[1], events = readEvents(id)
    if (!events) return json(404, { error: 'no such build' })
    const spec = events.findLast(e => e.type === 'game:spec')?.spec
    gameMod().then(g => spec ? g.artList(spec) : []).catch(() => []).then(plan => json(200, { ...listAssets({ id, events, files: assetFiles(join(runsDir, id)), plan, pieceName }), painting: (artJobs.get(id) || []).filter(Boolean) }))
    return
  }
  // Stop: everything in flight for a build's project ({run} or {project}), or all of it ({})
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    readJson(4096, input => stopWork(input || {}).then(r => json(200, r), err => json(400, { error: String(err.message || err) })))
    return
  }
  // Resume a stopped website build: the next version keeps every finished section and builds the rest
  const runResume = url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/resume$/)
  if (runResume && req.method === 'POST') {
    const id = runResume[1], events = readEvents(id)
    if (!events) return json(404, { error: 'no such build' })
    if (current?.id === id && !current.done) return json(409, { error: 'busy', run: id })
    let plan = null
    try { plan = JSON.parse(readFileSync(join(runsDir, id, 'plan.json'), 'utf8')) } catch {}
    const base = extendBase(events, plan)
    if (!base) return json(400, { error: 'nothing to resume: no pages were planned yet' })
    return void hermesGate().then(gate => {
      if (gate) return json(503, gate)
      const pid = projects.projectOf(id)
      const run = startRun({ brief: base.brief, base, resume: true, ask: '' })
      if (pid) projects.claim(run.id, pid)
      broadcast({ type: 'reset', run: run.id })
      json(200, { run: run.id, from: id })
    })
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

  // a page's search title, description and share picture, as the person sets them (Design panel)
  const runSeo = url.pathname.match(/^\/api\/runs\/([^/]+)\/seo$/)
  // the build's thumbnail (the home page's share picture) and the pictures it can be swapped for (Publish menu)
  if (runSeo && req.method === 'GET' && RUN_ID.test(runSeo[1])) {
    const events = readEvents(runSeo[1])
    if (!events) return res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no such build' }))
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ thumb: thumbOf(events) }))
  }
  if (runSeo && req.method === 'POST' && RUN_ID.test(runSeo[1])) {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 20000) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const events = readEvents(runSeo[1])
      const page = typeof input.page === 'string' && events?.some(e => e.type === 'page' && e.id === input.page) ? input.page : null
      const fields = cleanSeo({ title: input.title, description: input.description, image: input.image })
      for (const f of ['title', 'description', 'image']) if (input[f] === '') fields[f] = ''
      if (!page || !Object.keys(fields).length) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: page ? 'nothing to change' : 'no such page' }))
      record(runSeo[1], { type: 'seo', t: Date.now(), run: runSeo[1], page, ...fields, by: 'person' })
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
  // Scribble: accept or dismiss a draft, erase a sent mark
  const runDraft = req.method === 'POST' && url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/drafts\/(d[0-9a-z]{4,20})\/(accept|dismiss)$/)
  if (runDraft) {
    try { json(200, closeDraft(runDraft[1], runDraft[2], runDraft[3] === 'accept')) } catch (err) { json(err.status || 400, { error: String(err.message || err) }) }
    return
  }
  const runMarkErase = req.method === 'POST' && url.pathname.match(/^\/api\/runs\/([\w-]{1,64})\/marks\/(k\d{1,4})\/erase$/)
  if (runMarkErase) {
    const ok = !!readEvents(runMarkErase[1]) && record(runMarkErase[1], { type: 'mark:status', t: Date.now(), run: runMarkErase[1], ids: [runMarkErase[2]], status: 'erased' })
    json(ok ? 200 : 404, ok ? { ok } : { error: 'no such build' })
    return
  }
  const runComment = url.pathname.match(/^\/api\/runs\/([^/]+)\/comment$/)
  if (runComment && req.method === 'POST' && RUN_ID.test(runComment[1])) {
    let body = ''
    // marks bring their pictures (a page each and a crop per mark)
    req.on('data', c => { body += c; if (body.length > 16e6) req.destroy() })
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
  // The Hermes bridge (engine/bridge.mjs): a Hermes process says where its loopback bridge is, every 15 s.
  // The server's token guards this route like every other /api/ one.
  if (url.pathname === '/api/hermes/attach' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 4e3) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const was = hermes.status().attached, r = hermes.attach(input)
      // Hermes is back: what it offers for pictures and clips is asked again
      if (r.ok && !was) { imageProviders = null; videoProviders = null }
      // Hermes is back: a canvas waiting on it (a build stopped because Hermes closed) can go on
      if (r.ok && !was) broadcast({ type: 'hermes:back', attached: true })
      res.writeHead(r.ok ? 200 : 400, { 'content-type': 'application/json' }).end(JSON.stringify(r))
    })
    return
  }
  // One picture through Hermes's image tool, for tools outside the server (engine/skins.mjs's command line):
  // { prompt, aspect, refs, edit } -> { ok, path } | { ok:false, error }
  if (url.pathname === '/api/hermes/image' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 2e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const refs = (Array.isArray(input.refs) ? input.refs : []).filter(r => typeof r === 'string' && existsSync(r)).slice(0, 4)
      hermes.call('/image', { prompt: String(input.prompt || '').slice(0, 8000), aspect: String(input.aspect || 'landscape'), refs, edit: !!input.edit }, 300000)
        .then(r => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(r)))
    })
    return
  }
  // whether Hermes is there to answer, and if not why not; ?ready=1 gives a Hermes that is starting up a
  // few seconds to attach (the Make box asks this before it does anything)
  if (url.pathname === '/api/hermes' && req.method === 'GET') {
    const needed = ROLES.some(r => viaHermes(r) && picks[r] !== 'off')
    ;(url.searchParams.get('ready') ? health.ready() : health.now()).catch(() => null).then(h => {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...hermes.status(), needed, health: h }))
    })
    return
  }
  if (url.pathname === '/api/media' && req.method === 'GET') {
    mediaNow().then(m => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(m)), err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }
  if (url.pathname === '/api/media/key' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      const done = () => { imageProviders = null; videoProviders = null; return mediaNow().then(m => reply(200, m)) }
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
      connectors.connect(name, { confirm: input.confirm === true }).then(s => reply(200, s), err => reply(400, { error: String(err.message || err) }))
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
    // the Auto run's step stops too (the build, pictures, review, film, app), not only the steps after it
    if (url.pathname === '/api/auto/stop') { const au = auto.state(); return void (au?.state === 'working' && au.run ? stopWork({ run: au.run }) : Promise.resolve(auto.stop())).then(() => reply(200, auto.state() || { state: 'idle' }), () => reply(200, auto.stop() || { state: 'idle' })) }
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy() })
    req.on('end', async () => {
      const gate = await hermesGate()
      if (gate) return reply(503, gate)
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const chatId = typeof input.chat === 'string' && CHAT_ID.test(input.chat) ? input.chat : null
      delete input.chat
      delete input.brand
      const brand = lockedBrand(chats, chatId)
      if (brand) input.brand = brand
      try {
        const job = auto.start(input)
        // App, Game and Video from the Make box: the words go into a chat that moves into the build's project
        const only = Array.isArray(input.only) ? input.only : []
        const kind = only.includes('games') ? 'game' : only.includes('video') && !only.includes('app') ? 'film' : only.includes('app') ? 'app' : 'site'
        const chat = job?.run ? chatFor({ chat: chatId, text: String(input.prompt || ''), kind }) : null
        if (chat) chatBuilt(chat, job.run, projects.projectOf(job.run), String(input.prompt || ''))
        reply(200, chat ? { ...job, chat } : job)
      } catch (err) { reply(400, { error: String(err.message || err) }) }
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

  // Plan before spend (spec 21): the Plan board's cards, previews and the lock gate (server/plans.mjs)
  if (plans(req, res, url)) return
  if (talks(req, res, url)) return
  if (appKit(req, res, url)) return
  if (brands(req, res, url)) return
  if (/^\/api\/runs\/[^/]+\/story(\/|$)/.test(url.pathname)) { storyRoute(req, res, url); return }
  if (decks(req, res, url)) return
  if (refsRoute(req, res, url)) return
  if (studioRoute(req, res, url)) return
  if (filmRoute(req, res, url)) return
  if (chatMediaRoute(req, res, url)) return
  if (workshops(req, res, url)) return
  if (setup(req, res, url)) return

  // The Make box's showcases and its "grill me" interview (engine/intake.mjs); a Game gets the game interview
  if (url.pathname === '/api/intake' && req.method === 'GET') {
    Promise.all([import('../engine/intake.mjs'), gameMod()])
      .then(([m, g]) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...m.intake(), game: g.QUESTIONS, plan: PLAN_QUESTIONS })))
      .catch(err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }

  // Cast from real models (spec 19). The spec reply names the roles to cast;
  // POST { role: { look, name } | { query }, violent } -> { models, dropped, errors }.
  if (url.pathname === '/api/cast' && req.method === 'POST') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    let body = ''
    req.on('data', c => { body += c; if (body.length > 2e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      const r = input.role && typeof input.role === 'object' ? input.role : {}
      const role = { look: String(r.look || '').slice(0, 400), name: String(r.name || '').slice(0, 80), ...(r.query ? { query: String(r.query).slice(0, 80) } : {}) }
      castMod().then(c => c.searchCast(role, { violent: input.violent !== false, n: 8 }))
        .then(out => reply(200, out)).catch(err => reply(500, { error: String(err.message || err) }))
    })
    return
  }

  // Make with Meshy (spec 20). GET ?from=<site run> -> { ready, cost, art }: whether a key is set (never
  // the key), the price of one character, and the project's pictures to make it from.
  // POST { role, label, art, credits } spends credits, so it starts only when `credits` is the price the
  // person was shown. GET /api/meshy/job?id= -> { state, stage, progress, pick, error }.
  if (url.pathname === '/api/meshy' && req.method === 'GET') {
    meshyMod().then(m => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ready: m.meshyReady(), cost: m.meshyCost(), art: meshyArt(url.searchParams.get('from')) })))
      .catch(err => res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err.message || err) })))
    return
  }
  if (url.pathname === '/api/meshy/job' && req.method === 'GET') {
    meshyJobs().then(q => {
      const j = q.get(url.searchParams.get('id'))
      res.writeHead(j ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(j || { error: 'no such job' }))
    })
    return
  }
  // POST /api/meshy/art { from, name, data } keeps a picture the person added (picked or dropped in the
  // Cast step) in that build's pictures, as game-cast-<name>.<ext>: it becomes one role's art. Free.
  if (url.pathname === '/api/meshy/art' && req.method === 'POST') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    const chunks = []
    let size = 0
    req.on('data', c => { size += c.length; if (size > 24e6) req.destroy(); else chunks.push(c) })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch {}
      try { reply(200, meshyAddArt(input)) } catch (err) { reply(err.status || 400, { error: String(err.message || err) }) }
    })
    return
  }
  // POST /api/meshy { role, label, art, credits } makes one; POST /api/meshy/batch { items, credits }
  // makes several at once, credits being the total on the button. Nothing is spent on a wrong number.
  if ((url.pathname === '/api/meshy' || url.pathname === '/api/meshy/batch') && req.method === 'POST') {
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    let body = ''
    req.on('data', c => { body += c; if (body.length > 8000) req.destroy() })
    req.on('end', async () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      try {
        const q = await meshyJobs()
        reply(200, url.pathname === '/api/meshy' ? q.start(input) : q.batch(input))
      } catch (err) { reply(err.status || 400, { error: String(err.message || err) }) }
    })
    return
  }
  const meshyThumb = url.pathname.match(/^\/models\/(meshy-[a-z0-9-]{1,64}\.png)$/)
  if (meshyThumb) {
    const file = join(dataDir, 'models', meshyThumb[1])
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=31536000, immutable' })
    res.end(readFileSync(file))
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
        ? gameMod().then(g => g.writeSpec({ provider: provider('planner'), model: modelFor('planner'), idea: String(input.idea || '').slice(0, 600), answers: typeof input.answers === 'object' && input.answers ? input.answers : {}, brand: brandOf(input.from), big: input.big === true, signal: AbortSignal.timeout(input.big ? 180000 : 90000) }))
          .then(async spec => {
            // a 3D game with people in it is cast from real models before it is built
            const c = await castMod()
            return { spec, ...(c.needsCast(spec) ? { cast: { roles: c.castRoles(spec), violent: c.hasCombat(spec) } } : {}) }
          })
        : startGame(input.spec, {}, { idle: input.idle })
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
    // a kit written before it knew the product's name and whether anything was live is written again
    if (req.method === 'GET' && !sub) { const kit = readLaunch(dir); return kit?.v >= 2 ? reply(200, kit) : reply(404, { error: 'no launch kit yet' }) }
    if (req.method !== 'POST') return reply(405, { error: 'POST' })
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy() })
    req.on('end', async () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      try {
        if (!sub) return reply(200, await launchKit(id))
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
      } catch (err) { reply(err.code === 409 ? 409 : 400, { error: String(err.message || err) }) }
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

  const runApp = url.pathname.match(/^\/api\/runs\/([^/]+)\/app(?:\/(files|stop|open|seen|deploy|tell|idle))?$/)
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
        if (sub === 'idle') return idleAnswer(id, input)
        if (sub === 'tell') return tellBuilder(a, id, input.text, { who: input.who, on: input.on, confirm: typeof input.confirm === 'string' ? input.confirm.slice(0, 1200) : '', now: input.now === true })
        if (sub === 'open') return a.open(id)
        if (sub === 'seen') return a.seen(id)
        if (sub === 'deploy') {
          const creds = await credentials(dataDir, 'vercel')
          if (!creds) throw new Error(`connect Vercel first: 🌐 Publish on the canvas → Connect, or set ${PROVIDERS.vercel.env}`)
          return a.deploy(id, { creds, dataDir, publishVercel })
        }
        // Try again on a game that never built: build it again from its saved spec
        const spec = (readEvents(id) || []).findLast(e => e.type === 'game:spec')?.spec
        if (spec && !input.prompt && !a.state(id).hasApp) {
          const g = await gameMod()
          input = { kind: 'game', fresh: true, title: spec.title, prompt: g.gamePrompt(spec), files: { 'GAME_SPEC.md': g.specMarkdown(spec) }, ...(input.art === false ? { art: false } : {}), ...(input.note ? { note: String(input.note).slice(0, 1200) } : {}), ...(input.guided === false ? { guided: false } : {}), ...(input.restart === true ? { restart: true } : {}), ...(input.target ? { target: String(input.target).slice(0, 20) } : {}), ...(input.idle !== undefined ? { idle: input.idle } : {}) }
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
      exportRun({ events, runId: id, runDir: join(runsDir, id), sections: Array.isArray(input.sections) ? input.sections.slice(0, 80) : [], name: nameFor(id)?.name, fill: fillExport(id) })
        .then(out => {
          const copy = shelveExport(id, out.zip)
          record(id, { type: 'export', t: Date.now(), run: id, dir: out.dir, zip: out.zip, copy, pages: out.pages, sections: out.sections, html: out.html })
          reply(200, { ...out, copy })
        })
        .catch(err => reply(400, { error: String(err.message || err) }))
    })
    return
  }

  // Post to Feed's page shots (engine/pageshots.mjs): a fresh export, then every page at desktop and
  // phone size. The export is the one the post then uploads, so the shots match its files.
  const runShots = url.pathname.match(/^\/api\/runs\/([^/]+)\/pageshots$/)
  if (runShots && RUN_ID.test(runShots[1]) && req.method === 'POST') {
    const id = runShots[1]
    const reply = (code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
    const events = readEvents(id)
    if (!events) return reply(404, { error: 'no such build' })
    exportRun({ events, runId: id, runDir: join(runsDir, id), sections: [], name: nameFor(id)?.name, fill: fillExport(id) })
      .then(async out => {
        const copy = shelveExport(id, out.zip)
        record(id, { type: 'export', t: Date.now(), run: id, dir: out.dir, zip: out.zip, copy, pages: out.pages, sections: out.sections, html: out.html })
        const { pageShots } = await import('../engine/pageshots.mjs')
        const got = await pageShots({ htmlDir: join(out.dir, 'html'), files: out.html, dataDir }).catch(err => ({ shots: [], note: String(err.message || err).slice(0, 200) }))
        const pages = out.html.map((file, i) => ({ file, path: i === 0 ? '/' : `/${file}`, ...(got.shots.find(s => s.file === file) || {}) }))
        reply(200, { zip: out.zip, pages, note: got.note || null })
      })
      .catch(err => reply(400, { error: String(err.message || err) }))
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
      if (!CMD_OPS.has(input.op) || (input.run !== undefined && !RUN_ID.test(String(input.run))) || (input.op === 'chat' && !CHAT_ID.test(String(input.target)))) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad command' }))
        return
      }
      broadcast({ type: 'cmd', op: input.op, ...(input.run ? { run: input.run } : {}), ...(typeof input.text === 'string' ? { text: input.text.slice(0, 600) } : {}), ...(typeof input.target === 'string' ? { target: input.target.slice(0, 120) } : {}), ...(typeof input.on === 'boolean' ? { on: input.on } : {}) })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, clients: clients.size }))
    })
    return
  }

  if (url.pathname === '/api/models' && req.method === 'GET') {
    Promise.all([listModels('planner'), listModels('reviewer'), loadImageProviders(), idleChoices().catch(() => []), mediaState().catch(() => null)]).then(([text, vision, image, idleOpts, media]) => {
      const roles = Object.fromEntries(ROLES.map(r => [r, { model: modelFor(r), hermes: models[r].model, host: host(models[r].baseUrl), picked: picks[r] || null }]))
      // the idle's video model: the pick and every video model Hermes offers, with its price
      const idle = { pick: picks.idle || null, options: idleOpts, interp: interpOf(heavyConfig(dataDir))?.name || null }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ roles, text, vision, lite: picks.lite ?? null, image: { pick: picks.image || null, providers: image }, idle, media, stops: { ...idleStops(), picks: STOP_PICKS } }))
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
      } else if (input.role === 'media' && (input.model === null || input.model === '' || input.model === 'off' || name(input.model))) {
        // the media reader's model (spec 32): 'off' reads no clip or sound with any model
        if (input.model) picks.media = input.model
        else delete picks.media
      } else if (input.role === 'stops' && (input.app === undefined || STOP_PICKS.app.includes(input.app)) && (input.server === undefined || STOP_PICKS.server.includes(input.server))) {
        // Settings › Background: the app's and the server's idle stops, in minutes
        picks.stops = { ...picks.stops, ...(input.app !== undefined ? { app: input.app } : {}), ...(input.server !== undefined ? { server: input.server } : {}) }
      } else if (input.role === 'lite' && (input.on === null || typeof input.on === 'boolean')) {
        if (input.on === null) delete picks.lite
        else picks.lite = input.on
      } else if (input.role === 'image' && (input.provider === 'off' || input.provider === null || (name(input.provider) && (!input.model || name(input.model))))) {
        if (input.provider === 'off') picks.image = 'off'
        else if (input.provider) picks.image = { provider: input.provider, model: input.model || '' }
        else delete picks.image
      } else if (input.role === 'idle' && (input.provider === 'off' || input.provider === null || (name(input.provider) && (!input.model || name(input.model))))) {
        // the video model the hero's idle is animated with ('off': no clips, the keys route)
        if (input.provider === 'off') picks.idle = 'off'
        else if (input.provider) picks.idle = { provider: input.provider, model: input.model || '' }
        else delete picks.idle
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
      // whether a Hermes process is attached (its bridge does pictures and clips); never its token
      hermes: hermes.status().attached,
      // for the launcher: which process this is, when it started, and whether stopping it would lose work
      pid: process.pid,
      booted: BOOTED,
      busy: workRunning(),
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
  // A stock-library photo, by its file id, from this server. The library's CDN sends no CORS
  // header, so a page holding one of its photos could not be photographed (the page snapshot,
  // its thumbnail, the reviewer's screenshot all read their pictures back). Fetched once, kept
  // in the data dir. The host is fixed and the id is a UUID: nothing else can be asked for.
  const lib = url.pathname.match(/^\/standin\/lib\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  if (lib) {
    const dir = join(dataDir, 'standins', 'lib'), file = join(dir, lib[1])
    const send = buf => { res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' }); res.end(buf) }
    if (existsSync(file)) return send(readFileSync(file))
    fetch(`https://files.design-bakery.com/${lib[1]}`, { signal: AbortSignal.timeout(20000) })
      .then(async r => {
        if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) throw new Error(`HTTP ${r.status}`)
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 12 * 1024 * 1024) throw new Error('too large')
        mkdirSync(dir, { recursive: true })
        writeFileSync(file, buf)
        send(buf)
      })
      .catch(() => res.writeHead(502).end('not found'))
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

  // a clip's poster frame (engine/poster.mjs): written when the clip was made; a clip from before posters gets
  // one the first time it is asked for, when there is an ffmpeg to make it with
  const poster = url.pathname.match(/^\/img\/([\w-]{1,64})\/((playtest-\d{1,3}|idle-[a-f0-9]{8})\.poster\.jpg)$/)
    || url.pathname.match(/^\/video\/([\w-]{1,64})\/((promo(?:-tall|-square)?)\.poster\.jpg)$/)
  if (poster) {
    const dir = join(runsDir, poster[1], url.pathname.startsWith('/img/') ? 'img' : 'video')
    const file = join(dir, poster[2])
    const send = () => {
      if (!existsSync(file)) return res.writeHead(404).end('not found')
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' })
      res.end(readFileSync(file))
    }
    const from = existsSync(file) ? null : [`${poster[3]}.mp4`, `${poster[3]}.webm`].map(n => join(dir, n)).find(f => existsSync(f))
    if (!from) return send()
    makePoster(from, { ffmpeg: posterFfmpeg(dataDir, findFfmpeg), out: file }).then(send, send)
    return
  }

  // a game's filmed play test (engine/playtest.mjs), replayed in the App view
  const clip = url.pathname.match(/^\/img\/([\w-]{1,64})\/(playtest-\d{1,3}\.webm|idle-[a-f0-9]{8}\.mp4)$/)
  if (clip) {
    const file = join(runsDir, clip[1], 'img', clip[2])
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    // a byte range, so the replay can seek past the loading screen
    const body = readFileSync(file), r = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/)
    const head = { 'content-type': clip[2].endsWith('.mp4') ? 'video/mp4' : 'video/webm', 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' }
    if (r && (r[1] || r[2])) {
      const a = r[1] ? +r[1] : Math.max(0, body.length - +r[2]), b = r[1] && r[2] ? Math.min(+r[2], body.length - 1) : body.length - 1
      if (a > b || a >= body.length) return res.writeHead(416, { 'content-range': `bytes */${body.length}` }).end()
      res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${body.length}`, 'content-length': b - a + 1 })
      return res.end(body.subarray(a, b + 1))
    }
    res.writeHead(200, { ...head, 'content-length': body.length })
    res.end(body)
    return
  }
  const img = url.pathname.match(/^\/img\/([\w-]{1,64})\/((?:\d{1,3}|snap|kept-\d{1,3}|(?:edit|video)-[a-z0-9]{1,12}-?\d{0,2}|(?:game|peek|lib|idle)-[a-z0-9-]{1,56})\.(png|jpe?g|webp))$/)
  if (img) {
    const file = join(runsDir, img[1], 'img', img[2])
    if (!existsSync(file)) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': `image/${img[3] === 'jpg' ? 'jpeg' : img[3]}`, 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' })
    res.end(readFileSync(file))
    return
  }

  // the pages' saved snapshots; a file's name holds its version, so it never changes
  const snapFile = url.pathname.match(/^\/snaps\/([\w-]{1,64})\/([^/]{1,100})$/)
  if (snapFile) {
    const file = snapsOf().file(snapFile[1], snapFile[2])
    if (!file || !existsSync(file)) return res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=31536000, immutable', 'access-control-allow-origin': '*' })
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
    // model-written pages on the studio's own origin: sandboxed (scripts run, the origin is opaque, so
    // they cannot read the studio or its token), and open to that opaque origin for their own files
    res.writeHead(200, { 'content-type': types[rel.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-security-policy': SITE_CSP, 'access-control-allow-origin': '*' })
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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': SITE_CSP })
    return res.end(readFileSync(file, 'utf8').replace(/<\/body>/i, () => `${loop}</body>`))
  }

  // A run's promo video, with range requests so the player can seek; an earlier
  // cut by its file name in the build's video folder (…-promo-v2.mp4).
  const vid = url.pathname.match(/^\/video\/([\w-]{1,64})\/(promo(?:-tall|-square)?\.mp4|cut\/([a-z0-9-]{1,60}-promo-v\d{1,4}\.mp4))$/)
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

// app servers and engine runs stop with the studio, each with every process it started (engine/proc.mjs stopTree)
const shutdown = () => { appsP?.then(a => a.close()).finally(() => process.exit(0)); if (!appsP) process.exit(0); setTimeout(() => process.exit(0), 8000).unref() }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown)

// Nothing to do for Settings › Background's time (20 min): no pane open (an /events stream), no request, no
// build, Auto run, film, publish or app build. The server exits; the launcher's ensure_server() starts it again
// on next use (decision 0017, issue #450).
// Work that stopping the server would lose: a site build, an Auto run, a film, a publish, or an app or game being
// built. One answer for everyone who asks: the idle stop, the server replacing itself, and /api/state's `busy`,
// which the launcher reads before it retires a stale server. (`busy` used to leave out films, publishes and
// app and game builds, so a restart that trusted it stopped a game mid-build, 2026-11-13.)
function workRunning() {
  if ((current && !current.done) || (current?.working.size || 0) > 0 || auto.state()?.state === 'working') return true
  if ([...videos.values()].some(v => v.state === 'working') || [...publishes.values()].some(p => p.state === 'working')) return true
  return !!appsNow?.busy()
}
function serverBusy() { return clients.size > 0 || workRunning() }
// An update changed this server's code on disk while it ran. The launcher replaces an idle stale server on
// Hermes's next call (launcher.py stale/_retire), but a pane reloaded before that got new web files from an old
// server. So the server does it itself, once, when the page is asked for and no work is running: the port is
// freed, the same program starts again with the same environment, and this one exits. Hermes's bridge attaches
// to the new one by itself. SWARM_NO_REPLACE=1 turns it off.
let replacing = false
function replaceSelf() {
  if (replacing) return true
  if (process.env.SWARM_NO_REPLACE === '1' || !staleCode(BOOTED, codeStamp([join(root, 'server'), join(root, 'engine')]))) return false
  const working = workRunning()
  if (working) return false
  replacing = true
  console.log('swarm studio: the code changed on disk, starting again on it')
  server.close(() => { try { respawnSelf() } catch (err) { console.error('could not start again:', err.message) } shutdown() })
  server.closeIdleConnections?.()
  setTimeout(() => server.closeAllConnections?.(), 300).unref()
  return true
}
const POLLS = /^\/api\/(state|hermes(\/attach)?)$/
// checked every 30 s, or a quarter of the time when it is shorter (a test sets SWARM_SERVER_IDLE_MIN to seconds)
const idle = idleWatch({ ms: () => idleStops().server * 60000, busy: serverBusy, every: Math.max(200, Math.min(30000, (idleStops().server * 60000) / 4 || 30000)), onIdle: () => {
  console.log(`swarm studio: nothing to do for ${idleStops().server} min, stopping (it starts again on next use)`)
  // the port first: an ensure_server() from now on finds no server and starts a new one at once
  server.close()
  shutdown()
} })
