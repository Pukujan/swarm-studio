// The app builder: dyad's own agent engine (vendored in ../dyad), run headless
// with plain node. It takes a seeded React + shadcn project (a converted design,
// or the bare scaffold for a game), writes and fixes code with the worker model,
// runs the project's typecheck and build, and commits each turn in the app's git.
//
// The engine is built once on first use (pnpm install, then a vite bundle) and
// reused after that. Its log lines become steps the App tab shows as it works.

import { spawn, execFileSync, appEnv } from './proc.mjs'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, watch } from 'node:fs'
import { join, dirname, relative, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const dyadDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dyad')
export const scaffoldDir = join(dyadDir, 'scaffold')
const bundle = join(dyadDir, '.vite', 'build', 'aba_headless.cjs')

export const engineReady = () => existsSync(bundle)

// The bundle is built from dyad's source, so it goes stale when that source changes (a plugin update,
// or work on the runner in dyad/src/aba/). The stamp is a hash of everything the bundle is made from:
// every file under dyad/src, the bundle's vite config and the lockfile. It is written beside the
// bundle after each build; a bundle with another stamp, or none (one built before stamps), is built
// again the next time the engine is used.
const stampFile = `${bundle}.stamp`
export function sourceStamp(dir = dyadDir) {
  const h = createHash('sha1')
  const add = f => { try { h.update(f.slice(dir.length)).update(readFileSync(f)) } catch {} }
  const walk = d => {
    let list = []
    try { list = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of list.sort((a, b) => (a.name < b.name ? -1 : 1))) e.isDirectory() ? walk(join(d, e.name)) : add(join(d, e.name))
  }
  walk(join(dir, 'src'))
  for (const f of ['vite.aba-headless.config.mts', 'pnpm-lock.yaml']) add(join(dir, f))
  return h.digest('hex')
}
// read once per server: dyad's source does not change under a running Studio except by an update,
// and an update restarts it
let stampNow = null
const builtStamp = () => { try { return readFileSync(stampFile, 'utf8').trim() } catch { return '' } }
export const engineFresh = () => engineReady() && builtStamp() === (stampNow ||= sourceStamp())
// engine processes at work right now: the bundle is never built again under one
let running = 0

// dyad's chat modes the runner takes (dyad/src/aba/headless_args.ts). ask and plan are one turn that
// writes no app code; Swarm uses local-agent (a build) and ask (docs/engines/dyad.md).
export const ENGINE_MODES = ['local-agent', 'build', 'ask', 'plan']
// The runner's arguments. --mode is passed only when it is not the default, so a bundle built
// before the flag existed (it refuses any flag it does not know) still builds.
export function engineArgs({ promptFile, workspace, model, gateway, turns = 4, dataDir, viewRender = true, mode = 'local-agent' }) {
  if (!ENGINE_MODES.includes(mode)) throw new Error(`no engine mode "${mode}"`)
  const talk = mode === 'ask' || mode === 'plan'
  return ['--prompt', promptFile, '--workspace', workspace, '--model', model, '--gateway', gateway,
    '--turns', String(talk ? 1 : turns), '--user-data-dir', dataDir, '--json',
    ...(mode === 'local-agent' ? [] : ['--mode', mode]), ...(viewRender && !talk ? ['--view-render'] : [])]
}
// Said at the end of every prompt that builds or plans. dyad's own prompt still tells the model to clarify with
// planning_questionnaire and to set a database up with add_integration (dyad/src/prompts/local_agent_prompt.ts),
// and the runner no longer offers the tools that wait for a person (docs/engines/dyad.md, Limits).
export const ALONE = '(Nobody is here to answer questions during this work. The tools that ask a person, `planning_questionnaire`, `add_integration`, `suggest_plugin` and `exit_plan`, are not available: do not call them. Decide for yourself from the request and go on until it is done.)'
// a path that is never a file: the engine reads no .env (see runEngine)
export const NO_ENV_FILE = join(dyadDir, '.no-env', 'none.env')

// npm-installed tools (pnpm, npx) are .cmd shims on Windows, and Node runs a
// .cmd only through a shell. The arguments passed this way are plain words.
export const WIN = process.platform === 'win32'
export const viaShell = WIN ? { shell: true } : {}

// dugite downloads its own git at install time and that download often fails;
// the system git does the same job.
function gitEnv() {
  if (existsSync(join(dyadDir, 'node_modules', 'dugite', 'git', 'bin', 'git'))) return {}
  try {
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
    return { LOCAL_GIT_DIRECTORY: join(exec, '..', '..') }
  } catch { return {} }
}

function run(cmd, args, opts, onLine) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { ...viaShell, ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const eat = b => {
      tail = (tail + b).slice(-4000)
      for (const l of String(b).split('\n')) if (l.trim()) onLine?.(l)
    }
    p.stdout.on('data', eat); p.stderr.on('data', eat)
    p.on('error', fail)
    p.on('close', code => ok({ code, tail }))
  })
}

// The engine's native modules (better-sqlite3) are built for one Node version.
// Hermes may start this server on its own, newer Node, so the engine runs on the
// first Node that can load them: this one, then the one on PATH, then common installs.
let nodeFor = null
// every node on PATH, not only the first: Hermes puts its own Node in front
function nodes() {
  const onPath = (process.env.PATH || process.env.Path || '').split(delimiter).filter(Boolean).map(d => join(d, WIN ? 'node.exe' : 'node'))
  const login = WIN ? '' : (() => { try { return execFileSync('/bin/sh', ['-lc', 'command -v node'], { encoding: 'utf8' }).trim() } catch { return '' } })()
  return [process.execPath, ...onPath, login, '/opt/homebrew/bin/node', '/usr/local/bin/node'].filter((x, i, a) => x && a.indexOf(x) === i && existsSync(x))
}
export function engineNode() {
  if (nodeFor) return nodeFor
  const candidates = nodes()
  for (const n of candidates) {
    try {
      execFileSync(n, ['-e', "new (require('better-sqlite3'))(':memory:')"], { cwd: dyadDir, stdio: 'ignore', timeout: 20000 })
      return (nodeFor = n)
    } catch {}
  }
  return (nodeFor = process.execPath)
}

// The Node versions the engine supports (dyad/package.json "engines"), and the first such Node here
const ENGINE_NODE = (() => {
  let range = ''
  try { range = JSON.parse(readFileSync(join(dyadDir, 'package.json'), 'utf8')).engines?.node || '' } catch {}
  const lo = Number((range.match(/>=\s*(\d+)/) || [])[1]) || 0, hi = Number((range.match(/<\s*(\d+)/) || [])[1]) || Infinity
  return { lo, hi, label: range || 'any' }
})()
export const nodeFits = (version, { lo, hi } = ENGINE_NODE) => { const major = Number(String(version).replace(/^v/, '').split('.')[0]); return major >= lo && major < hi }
export function installNode(list = nodes(), versionOf = n => execFileSync(n, ['-v'], { encoding: 'utf8', timeout: 10000 }).trim()) {
  for (const n of list) {
    try { if (nodeFits(versionOf(n))) return n } catch {}
  }
  return null
}

let setting = null, updateFailed = false
// Install and bundle the engine once. The install exits non-zero when dugite's
// git download fails; the modules are still there, so only the bundle decides.
export function setupEngine(onStage = () => {}) {
  if (engineFresh()) return Promise.resolve()
  // a stale bundle is still a working engine: it is left alone while a build runs on it
  const had = engineReady()
  // ...and an update that failed is not tried again on every turn: once per run of the Studio
  if (had && (running || updateFailed)) return Promise.resolve()
  return setting ??= (async () => {
    // the install and the bundle run on a Node the engine accepts (its native modules have no build
    // for a newer one, and pnpm refuses it): Hermes may put its own, newer Node first on PATH
    const node = installNode()
    if (!node) throw new Error(`The app engine needs Node ${ENGINE_NODE.label}, and none was found (this one is ${process.version}). Install Node 24 from nodejs.org, then try again.`)
    const env = { ELECTRON_SKIP_BINARY_DOWNLOAD: '1', CI: '1', PATH: [dirname(node), process.env.PATH || process.env.Path || ''].join(delimiter) }
    onStage(had ? 'updating the app engine' : 'installing the app engine (once, about a minute)')
    const i = await run('pnpm', ['install', '--frozen-lockfile'], { cwd: dyadDir, env })
    onStage('bundling the app engine')
    const b = await run('npx', ['vite', 'build', '--config', 'vite.aba-headless.config.mts'], { cwd: dyadDir, env })
    // the install's own words when it is what failed (a bundle that cannot find its packages says less)
    if (!engineReady()) throw new Error(`engine build failed: ${(i.code ? i.tail : b.tail).slice(-400)}`)
    // stamped only when the bundle was really built from this source
    if (b.code !== 0) throw new Error(`engine build failed: ${b.tail.slice(-400)}`)
    try { writeFileSync(stampFile, (stampNow ||= sourceStamp())) } catch {}
  })().catch(err => {
    // An update that could not be made (no fitting Node, no pnpm, a bundle error) keeps the engine it had:
    // builds go on as before, and a mode the old runner lacks says so itself. Tried again when the Studio next starts.
    if (!had) throw err
    updateFailed = true
    onStage('the app engine could not be updated; going on with the one installed')
  }).finally(() => { setting = null })
}

// One engine log line → a step for the App tab, or nothing.
export function stepOf(line) {
  let m
  if ((m = /\[aba-headless\] (build|repair)[^(]*\(turn (\d+)\)/.exec(line))) return { kind: 'turn', text: m[1] === 'build' ? `turn ${m[2]}: building` : `turn ${m[2]}: fixing what failed`, turn: Number(m[2]) }
  if (/\[aba-headless\] [a-z_]+ needs a person; going on without one/.test(line)) return { kind: 'think', text: 'nobody to ask: deciding alone' }
  if (/\(app_runtime_service\) › Starting app/.test(line)) return { kind: 'render', text: 'starting the app to look at it' }
  if (/\(app_runtime_service\) › Error running app/.test(line)) return { kind: 'render', text: 'the app did not start', ok: false }
  if ((m = /Projected next request for chat \d+: (\d+) tokens/.exec(line))) return { kind: 'think', text: 'next step', tokens: Number(m[1]) }
  if ((m = /Total tokens used: (\d+)/.exec(line))) return { kind: 'tokens', text: `${m[1]} tokens`, tokens: Number(m[1]) }
  return null
}

// Run the engine on a seeded workspace with a prompt. Resolves with the engine's
// final JSON result ({ ok, gatesPassed, turns, files, commits, ... }).
// mode 'ask' (dyad's own ask mode) is one read-only turn on an app that is already there: the result
// is { ok, answer, changed } and nothing is seeded, watched, gated or committed.
// appKeys: false for a project brought in from outside (docs/specs/45-intake.md): its build script runs under the
// engine, and code the Studio did not write is never handed the person's database or payment keys
export async function runEngine({ workspace, prompt, provider, model, turns = 4, viewRender = true, mode = 'local-agent', onStep = () => {}, onLog = () => {}, signal, appKeys = true }) {
  const talk = mode === 'ask' || mode === 'plan'
  if (talk && !['package.json', '.git'].every(f => existsSync(join(workspace, f)))) throw new Error('no app here yet')
  // a stop pressed while the engine was still being set up (or between stages)
  if (signal?.aborted) throw new Error('stopped')
  await setupEngine(t => onStep({ kind: 'setup', text: t }))
  if (signal?.aborted) throw new Error('stopped')
  const meta = join(dirname(workspace), '.engine')
  mkdirSync(meta, { recursive: true })
  // dyad's saved chat keeps the model it began with, so each model gets its own data dir
  const promptFile = join(meta, `prompt-${Date.now()}.md`), logFile = join(meta, 'engine.log')
  try { appendFileSync(logFile, `\n===== ${new Date().toISOString()} ${model}\n`) } catch {}
  writeFileSync(promptFile, mode === 'ask' ? prompt : `${prompt}\n\n${ALONE}`)
  const args = [bundle, ...engineArgs({ promptFile, workspace, model, gateway: provider.baseUrl, turns, dataDir: join(meta, `data-${model.replace(/[^\w.-]+/g, '_')}`), viewRender, mode })]
  // a new workspace has no git yet; the engine's iterate mode wants one commit
  if (!talk && !existsSync(join(workspace, '.git'))) {
    const g = (...a) => execFileSync('git', a, { cwd: workspace, stdio: 'ignore' })
    g('init', '-q'); g('add', '-A'); g('-c', 'user.name=Swarm Studio', '-c', 'user.email=swarm@localhost', 'commit', '-qm', 'init')
  }
  let last = null
  // run from the run's own folder: inside dyad/ its packageManager pin makes the
  // engine's pnpm probe fail, and it then falls back to npm on a pnpm project
  const p = spawn(engineNode(), args, {
    cwd: meta,
    // The engine's model key is the studio's own /llm/v1 key (engine/hermesllm.mjs), never a provider's;
    // the app's keys are there because the engine starts the app to look at it. ABA_ENV_FILE names a file
    // that does not exist, so the engine loads no .env: left alone it walks up from its bundle and, in an
    // installed plugin, the first .env it meets is Hermes's own ($HERMES_HOME/.env, every provider key).
    env: { ...gitEnv(), ...(appKeys ? appEnv() : {}), ABA_API_KEY: provider.apiKey || '', ABA_ENV_FILE: NO_ENV_FILE, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  running++
  const ended = () => { if (p) { running--; p.off('close', ended); p.off('error', ended) } }
  p.once('close', ended)
  p.once('error', ended)
  signal?.addEventListener('abort', () => p.kill('SIGTERM'), { once: true })
  // the engine's log doesn't name the files it writes, so watch the folder
  const seen = new Map()
  const watcher = talk ? null : (() => { try {
    return watch(workspace, { recursive: true }, (_, f) => {
      if (!f || /(^|[\\/])(node_modules|\.git|dist|\.vite|\.output|\.nitro|\.dyad|\.vercel)([\\/]|$)/.test(f) || /(^|[\\/])RUN_META\.json$/.test(f) || !/\.[a-z]{1,5}$/.test(f)) return
      const now = Date.now()
      if (now - (seen.get(f) || 0) < 3000) return
      seen.set(f, now)
      onStep({ kind: 'write', text: f.replace(/\\/g, '/'), file: existsSync(join(workspace, f)) })
    })
  } catch { return null } })()
  let buf = ''
  const eat = b => {
    buf += b
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const l of lines) {
      if (!l.trim()) continue
      try { appendFileSync(logFile, l + '\n') } catch {}
      onLog(l)
      if (l.startsWith('{"ok"')) try { last = JSON.parse(l) } catch {}
      const s = stepOf(l)
      if (s) onStep(s)
    }
  }
  p.stdout.on('data', eat); p.stderr.on('data', eat)
  const code = await new Promise(ok => p.on('close', ok))
  watcher?.close()
  if (buf.startsWith('{"ok"')) try { last = JSON.parse(buf) } catch {}
  if (!last) {
    try { appendFileSync(logFile, `[swarm] the engine exited (${code}) without a result\n`) } catch {}
    throw new Error(signal?.aborted ? 'stopped' : noResult(logTail(logFile)))
  }
  return last
}
// The engine ended and printed no result. The exit code is in the engine's log, not in the chat: the person
// reads what happened, with the engine's own last error when it gave one.
export const noResult = (tail = '') => `The app engine stopped before it finished${tail ? `: ${tail}` : ''}`
// The last error lines of this run in the engine's log. Left out: lines every run prints (the dead ports the
// runner points dyad's own services at, docs/engines/dyad.md; an app with no AI_RULES.md), which explain nothing.
export function logTail(logFile) {
  try {
    return readFileSync(logFile, 'utf8').split('\n===== ').pop().split('\n')
      .filter(l => /^aba-headless: |Last error|Error: (?!bad port)/.test(l) && !/makeNetworkError|catalog|refused a request to "127\.0\.0\.1:9"|AI_RULES\.md/.test(l))
      .slice(-2).join(' · ').replace(/^aba-headless: /, '').slice(0, 400)
  } catch { return '' }
}

// The app's own files, for the code view: source only, small enough to show.
export function appFiles(dir) {
  const out = []
  const walk = d => {
    for (const n of readdirSync(d)) {
      if (/^(node_modules|\.git|dist|\.engine|\.output|\.nitro|\.dyad|\.vercel)$/.test(n) || n === 'pnpm-lock.yaml') continue
      const f = join(d, n), st = statSync(f)
      if (st.isDirectory()) walk(f)
      else if (/\.(tsx?|jsx?|css|json|md|html|ya?ml)$/.test(n) && st.size < 200000) out.push({ path: relative(dir, f), size: st.size })
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

// What a glTF model holds, read from its JSON (no 3D library needed), so the
// model can place and animate uploads it cannot see.
export function gltfInfo(file) {
  try {
    const raw = readFileSync(file)
    let json
    if (raw.readUInt32LE(0) === 0x46546c67) { // binary .glb: header, then a JSON chunk
      const len = raw.readUInt32LE(12)
      json = JSON.parse(raw.subarray(20, 20 + len).toString('utf8'))
    } else json = JSON.parse(raw.toString('utf8'))
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (const m of json.meshes || []) for (const p of m.primitives || []) {
      const a = json.accessors?.[p.attributes?.POSITION]
      if (a?.min && a?.max) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]) }
    }
    const size = min[0] === Infinity ? null : max.map((x, i) => +(x - min[i]).toFixed(2))
    return {
      meshes: (json.meshes || []).length,
      nodes: (json.nodes || []).map(n => n.name).filter(Boolean).slice(0, 12),
      animations: (json.animations || []).map((a, i) => a.name || `clip${i}`),
      size,
      skinned: !!(json.skins || []).length
    }
  } catch { return null }
}
