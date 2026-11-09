// The app builder: dyad's own agent engine (vendored in ../dyad), run headless
// with plain node. It takes a seeded React + shadcn project (a converted design,
// or the bare scaffold for a game), writes and fixes code with the worker model,
// runs the project's typecheck and build, and commits each turn in the app's git.
//
// The engine is built once on first use (pnpm install, then a vite bundle) and
// reused after that. Its log lines become steps the App tab shows as it works.

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, watch } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const dyadDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dyad')
export const scaffoldDir = join(dyadDir, 'scaffold')
const bundle = join(dyadDir, '.vite', 'build', 'aba_headless.cjs')

export const engineReady = () => existsSync(bundle)

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
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
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

let setting = null
// Install and bundle the engine once. The install exits non-zero when dugite's
// git download fails; the modules are still there, so only the bundle decides.
export function setupEngine(onStage = () => {}) {
  if (engineReady()) return Promise.resolve()
  return setting ??= (async () => {
    const env = { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1', CI: '1' }
    onStage('installing the app engine (once, about a minute)')
    await run('pnpm', ['install', '--frozen-lockfile'], { cwd: dyadDir, env })
    onStage('bundling the app engine')
    const b = await run('npx', ['vite', 'build', '--config', 'vite.aba-headless.config.mts'], { cwd: dyadDir, env })
    if (!engineReady()) throw new Error(`engine build failed: ${b.tail.slice(-400)}`)
  })().finally(() => { setting = null })
}

// One engine log line → a step for the App tab, or nothing.
export function stepOf(line) {
  let m
  if ((m = /\[aba-headless\] (build|repair)[^(]*\(turn (\d+)\)/.exec(line))) return { kind: 'turn', text: m[1] === 'build' ? `turn ${m[2]}: building` : `turn ${m[2]}: fixing what failed`, turn: Number(m[2]) }
  if (/\(app_runtime_service\) › Starting app/.test(line)) return { kind: 'render', text: 'starting the app to look at it' }
  if (/\(app_runtime_service\) › Error running app/.test(line)) return { kind: 'render', text: 'the app did not start', ok: false }
  if ((m = /Projected next request for chat \d+: (\d+) tokens/.exec(line))) return { kind: 'think', text: 'next step', tokens: Number(m[1]) }
  if ((m = /Total tokens used: (\d+)/.exec(line))) return { kind: 'tokens', text: `${m[1]} tokens`, tokens: Number(m[1]) }
  return null
}

// Run the engine on a seeded workspace with a prompt. Resolves with the engine's
// final JSON result ({ ok, gatesPassed, turns, files, commits, ... }).
export async function runEngine({ workspace, prompt, provider, model, turns = 4, viewRender = true, onStep = () => {}, onLog = () => {}, signal }) {
  await setupEngine(t => onStep({ kind: 'setup', text: t }))
  const meta = join(dirname(workspace), '.engine')
  mkdirSync(meta, { recursive: true })
  // dyad's saved chat keeps the model it began with, so each model gets its own data dir
  const promptFile = join(meta, `prompt-${Date.now()}.md`), logFile = join(meta, 'engine.log')
  try { appendFileSync(logFile, `\n===== ${new Date().toISOString()} ${model}\n`) } catch {}
  writeFileSync(promptFile, prompt)
  const args = [bundle, '--prompt', promptFile, '--workspace', workspace, '--model', model, '--gateway', provider.baseUrl,
    '--turns', String(turns), '--user-data-dir', join(meta, `data-${model.replace(/[^\w.-]+/g, '_')}`), '--json']
  if (viewRender) args.push('--view-render')
  // a new workspace has no git yet; the engine's iterate mode wants one commit
  if (!existsSync(join(workspace, '.git'))) {
    const g = (...a) => execFileSync('git', a, { cwd: workspace, stdio: 'ignore' })
    g('init', '-q'); g('add', '-A'); g('-c', 'user.name=Swarm Studio', '-c', 'user.email=swarm@localhost', 'commit', '-qm', 'init')
  }
  let last = null
  // run from the run's own folder: inside dyad/ its packageManager pin makes the
  // engine's pnpm probe fail, and it then falls back to npm on a pnpm project
  const p = spawn(process.execPath, args, {
    cwd: meta,
    env: { ...process.env, ...gitEnv(), ABA_API_KEY: provider.apiKey || '', ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  signal?.addEventListener('abort', () => p.kill('SIGTERM'), { once: true })
  // the engine's log doesn't name the files it writes, so watch the folder
  const seen = new Map()
  const watcher = (() => { try {
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
    const tail = (() => { try { return readFileSync(logFile, 'utf8').split('\n===== ').pop().split('\n').filter(l => /^aba-headless: |Last error|Error: (?!bad port)/.test(l) && !/makeNetworkError|catalog/.test(l)).slice(-2).join(' · ').replace(/^aba-headless: /, '').slice(0, 400) } catch { return '' } })()
    throw new Error(signal?.aborted ? 'stopped' : `the app engine exited (${code}) without a result${tail ? `: ${tail}` : ''}`)
  }
  return last
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
