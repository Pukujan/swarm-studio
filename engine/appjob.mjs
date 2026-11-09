// The App tab's jobs: a build's design (or a game spec) becomes a working app
// with dyad's engine, one turn per ask, and runs on a local dev server so the
// tab can show it. The server imports this file only when someone opens the
// App tab, so a studio that never builds an app never loads it.

import { spawn, execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, normalize } from 'node:path'
import { snapshot, dyadApp, seedProject } from './export.mjs'
import { runEngine, appFiles, scaffoldDir, engineReady } from './appbuild.mjs'

const KEEP = `This project already holds a finished design made in Swarm Studio: every section is a component in src/components/swarm/, every page is in src/pages/, and the theme lives in the CSS variables in src/globals.css. The look is decided. Keep that markup, those Tailwind classes and those variables. Change a section only where it needs real behaviour, and then keep its look. New pages and components use the same variables and shadcn/ui components so they match. Don't read every section first: the page list below says what each page holds; open only the files you are about to change.`

const BACKEND = `Server code: call enable_nitro first, then put API routes in server/routes/api/ (Nitro file routes, e.g. server/routes/api/orders.post.ts, served at /api/orders) and keep data in a small typed server-side store module, so the same code runs here and deploys to Vercel. Never put secrets in client code.`

// What the design implies, made real: the default first turn for a website.
export function sitePrompt(snap, ask) {
  const pages = snap.pages.map((p, i) => {
    const roles = p.sections.filter(s => s.page !== '*').map(s => s.role).slice(0, 14).join('; ')
    return `- ${i === 0 ? '/' : `/${p.id}`} ${p.title}${p.purpose ? `: ${p.purpose}` : ''}${roles ? ` (sections: ${roles})` : ''}`
  }).join('\n')
  const want = ask ? `Do this: ${ask}` : `Make it a working app. Read the pages and decide what has to be real:
1. Every form submits to a server route, validates (zod + react-hook-form, shadcn Form), and shows a success state in the theme.
2. Lists, prices, plans, schedules, menus or stock the design shows come from GET routes over the store, typed, with a loading state.
3. Anything a visitor buys, books, applies for or signs up to is saved, with an id, and lowers stock where it has any.
4. An /admin page (not linked from the nav) with a shadcn Table of everything saved and a short summary (counts, revenue where there are prices).
5. Buttons with data-goto already route between pages; keep them working.`
  return `${KEEP}

${snap.brand}: ${snap.brief || ''}

Pages:
${pages}

${want}

${BACKEND}

Finish with a working build: the typecheck and build must pass.`
}

const BUSY = /out of quota|rate.?limit|cooling down|capacity|busy|429|overloaded|no available provider|exhausted/i
const APP_FALLBACKS = ['cb/deepseek-v4.1-flash', 'deepseek-v4.1-flash', 'gemini-3.8-flash', 'claude-haiku-5.5']

const freePort = () => new Promise((ok, fail) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) })
  s.on('error', fail)
})

const sh = (cmd, args, cwd, ms = 300000) => new Promise(ok => execFile(cmd, args, { cwd, timeout: ms, maxBuffer: 1 << 22, env: { ...process.env, CI: '1' } }, (err, stdout, stderr) => ok({ ok: !err, out: String(stdout) + String(stderr) })))

export function appJobs({ runsDir, record, broadcast, readEvents, provider, modelFor }) {
  const jobs = new Map() // run id -> job
  const send = (id, type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  const dirOf = id => join(runsDir, id, 'app')

  function state(id) {
    const j = jobs.get(id)
    if (j) return view(j)
    // a finished app from before a restart: rebuild the state from the log
    const events = readEvents(id) || []
    const last = events.findLast(e => e.type?.startsWith('app:') && e.type !== 'app:step')
    const steps = events.filter(e => e.type === 'app:step').slice(-200).map(e => e.step)
    if (!last) return { state: 'idle', engineReady: engineReady() }
    return { state: last.type === 'app:failed' ? 'failed' : last.type === 'app:start' ? 'stopped' : 'done', kind: events.find(e => e.type === 'app:start')?.kind || 'site', steps, result: events.findLast(e => e.type === 'app:done')?.result || null, message: last.message, deployed: events.findLast(e => e.type === 'app:deployed')?.url || null, hasApp: existsSync(join(dirOf(id), 'package.json')), engineReady: engineReady() }
  }
  const view = j => ({ state: j.state, kind: j.kind, stage: j.stage, steps: j.steps.slice(-200), url: j.url || null, result: j.result, message: j.message, asks: j.asks, deployed: j.deployed || null, hasApp: true, engineReady: engineReady() })

  // Start the first build, or one more turn on the same app.
  async function start(id, input = {}) {
    const events = readEvents(id)
    if (!events) throw new Error('no such build')
    let j = jobs.get(id)
    if (j?.state === 'working') return view(j)
    if ([...jobs.values()].some(x => x.state === 'working')) throw new Error('another app is building; wait for it or stop it')
    const dir = dirOf(id)
    const kind = input.kind || j?.kind || events.find(e => e.type === 'app:start')?.kind || (events.some(e => e.type === 'run:start' && e.kind === 'game') ? 'game' : 'site')
    const fresh = !existsSync(join(dir, 'package.json')) || input.fresh
    const ask = String(input.ask || '').trim().slice(0, 4000)
    let prompt
    if (fresh) {
      // a new app starts a new engine chat: the old one's history (and its
      // failures) would steer the model
      const meta = join(runsDir, id, '.engine')
      if (existsSync(meta)) for (const d of readdirSync(meta)) if (d.startsWith('data-')) rmSync(join(meta, d), { recursive: true, force: true })
      if (kind === 'game') {
        if (!input.prompt) throw new Error('a game needs its spec')
        seedProject(scaffoldDir, dir, input.title || 'game')
        for (const [name, text] of Object.entries(input.files || {})) if (/^[\w.-]+$/.test(name)) writeFileSync(join(dir, name), String(text))
        prompt = input.prompt
      } else {
        const snap = snapshot(events, Array.isArray(input.sections) ? input.sections.slice(0, 80) : [])
        if (!snap.pages.some(p => p.sections.length)) throw new Error('nothing built yet')
        dyadApp(snap, dir, { runId: id, runDir: join(runsDir, id), scaffold: scaffoldDir })
        prompt = sitePrompt(snap, ask)
      }
    } else {
      if (!ask) throw new Error('say what to change')
      prompt = `${kind === 'game' ? 'This is a browser game made from a spec in GAME_SPEC.md. Keep what works.' : KEEP}\n\nDo this: ${ask}\n\n${kind === 'game' ? '' : `${BACKEND}\n\n`}Finish with a working build: the typecheck and build must pass.`
    }
    j ||= { kind, steps: [], asks: [], proc: null, url: null, port: null }
    Object.assign(j, { kind, state: 'working', stage: 'starting', result: null, message: null, controller: new AbortController(), t: Date.now() })
    j.asks.push(ask || (kind === 'game' ? 'build the game' : 'make it a working app'))
    jobs.set(id, j)
    const m = modelFor('worker')
    send(id, 'app:start', { kind, ask: j.asks.at(-1), model: m, fresh })
    const step = s => {
      const item = { ...s, t: Date.now() }
      j.steps.push(item)
      if (j.steps.length > 400) j.steps.splice(0, j.steps.length - 400)
      if (s.kind !== 'write') j.stage = s.text
      // file writes go live only; the rest is kept with the run
      if (s.kind === 'write' || s.kind === 'think') broadcast({ type: 'app:step', t: item.t, run: id, step: item })
      else send(id, 'app:step', { step: item })
    }
    ;(async () => {
      // a busy or rate-limited model: on InferHub try the same model's other route,
      // then other fast coders; elsewhere wait a little and go again
      const chain = [m, ...(/inferhub/.test(provider('worker').baseUrl) ? APP_FALLBACKS.filter(x => x !== m) : [m, m])]
      let result
      for (let i = 0; ; i++) {
        try {
          result = await runEngine({ workspace: dir, prompt, provider: provider('worker'), model: chain[i], turns: input.turns || 4, onStep: step, signal: j.controller.signal })
          break
        } catch (err) {
          if (i + 1 >= chain.length || j.controller.signal.aborted || !BUSY.test(err.message)) throw err
          step({ kind: 'setup', text: `${chain[i]} is busy at the provider; going on with ${chain[i + 1]}`, ok: false })
          if (chain[i + 1] === chain[i]) await new Promise(r => setTimeout(r, 30000))
        }
      }
      j.result = { ok: result.ok, gatesPassed: result.gatesPassed, turns: result.turns, commits: result.commits, files: result.files?.length || 0 }
      if (!result.ok) throw new Error(result.error || 'the engine could not finish the app')
      await serve(id, j, step)
      Object.assign(j, { state: 'done', stage: 'ready' })
      send(id, 'app:done', { result: j.result, url: j.url, ms: Date.now() - j.t })
    })().catch(err => {
      Object.assign(j, { state: 'failed', message: String(err.message || err).slice(0, 400) })
      send(id, 'app:failed', { message: j.message, result: j.result })
    })
    return view(j)
  }

  // A dev server for the app (Vite, plus Nitro's routes when the app has them).
  // Kept running between turns: Vite picks up the engine's next edits itself.
  async function serve(id, j, step = () => {}) {
    const dir = dirOf(id)
    if (j.proc && j.proc.exitCode === null) return
    step({ kind: 'serve', text: 'installing the app\'s packages' })
    const inst = await sh('pnpm', ['install', '--prefer-offline'], dir)
    if (!inst.ok) throw new Error(`pnpm install failed: ${inst.out.slice(-300)}`)
    j.port = await freePort()
    step({ kind: 'serve', text: `starting the app on port ${j.port}` })
    const p = spawn(join(dir, 'node_modules', '.bin', 'vite'), ['--port', String(j.port), '--strictPort', '--host', '127.0.0.1'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' } })
    j.proc = p
    let log = ''
    p.stdout.on('data', b => { log = (log + b).slice(-4000) })
    p.stderr.on('data', b => { log = (log + b).slice(-4000) })
    const url = `http://127.0.0.1:${j.port}/`
    for (let i = 0; i < 60; i++) {
      if (p.exitCode !== null) throw new Error(`the app stopped: ${log.slice(-300)}`)
      if (await fetch(url, { signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false)) { j.url = url; break }
      await new Promise(r => setTimeout(r, 500))
    }
    if (!j.url) throw new Error('the app did not answer in 30 s')
    send(id, 'app:ready', { url: j.url })
  }

  async function open(id) {
    const j = jobs.get(id)
    if (j?.url && j.proc?.exitCode === null) return view(j)
    if (!existsSync(join(dirOf(id), 'package.json'))) throw new Error('no app yet')
    const k = j || { kind: state(id).kind, steps: state(id).steps || [], asks: [], state: 'done' }
    jobs.set(id, k)
    await serve(id, k)
    k.state = k.state === 'working' ? 'working' : 'done'
    return view(k)
  }

  function stop(id) {
    const j = jobs.get(id)
    if (j?.state === 'working') j.controller.abort()
    return j ? view(j) : state(id)
  }

  function files(id, path) {
    const dir = dirOf(id)
    if (!path) return { files: appFiles(dir), log: gitLog(dir) }
    const f = normalize(join(dir, path))
    if (!f.startsWith(dir + '/') || /node_modules|\.git[/\\]/.test(f) || !existsSync(f) || statSync(f).size > 200000) throw new Error('no such file')
    return { path, text: readFileSync(f, 'utf8') }
  }
  // each engine turn is a commit in the app's own git
  const gitLog = dir => { try { return execFileSync('git', ['log', '--format=%h|%ct|%s', '-n', '30'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(l => { const [hash, t, ...s] = l.split('|'); return { hash, t: Number(t) * 1000, subject: s.join('|') } }) } catch { return [] } }

  // The app on Vercel: the source goes up and Vercel builds it, so Nitro's
  // routes become functions (Nitro picks its Vercel output by itself there).
  async function deploy(id, { creds, dataDir, publishVercel }) {
    const dir = dirOf(id)
    if (!existsSync(join(dir, 'package.json'))) throw new Error('no app yet')
    if (jobs.get(id)?.state === 'working') throw new Error('the app is still building')
    const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name || 'swarm-app'
    const r = await publishVercel({ dir, name: `${name}-app`.slice(0, 80), creds, dataDir, build: true, onStage: stage => broadcast({ type: 'app:stage', t: Date.now(), run: id, stage: `deploy: ${stage}` }) })
    send(id, 'app:deployed', { url: r.url, project: r.repo, pending: !!r.pending })
    const j = jobs.get(id)
    if (j) j.deployed = r.url
    return { url: r.url, project: r.repo, pending: !!r.pending }
  }

  function close() { for (const j of jobs.values()) { j.controller?.abort(); j.proc?.kill() } }

  return { start, state, stop, open, files, deploy, close, dirOf, jobs }
}
