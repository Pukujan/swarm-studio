// The App tab's jobs: a build's design (or a game spec) becomes a working app
// with dyad's engine, one turn per ask, and runs on a local dev server so the
// tab can show it. The server imports this file only when someone opens the
// App tab, so a studio that never builds an app never loads it.

import { spawn, execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, normalize } from 'node:path'
import { snapshot, dyadApp, seedProject } from './export.mjs'
import { runEngine, appFiles, scaffoldDir, engineReady } from './appbuild.mjs'
import { crewRadio } from './radio.mjs'
import { playtest } from './playtest.mjs'
import { strangeLinks } from './links.mjs'
import { planBrief } from './advisor.mjs'
import { gameSlug } from './game.mjs'

const KEEP = `This project already holds a finished design made in Swarm Studio: every section is a component in src/components/swarm/, every page is in src/pages/, and the theme lives in the CSS variables in src/globals.css. The look is decided. Keep that markup, those Tailwind classes and those variables. Change a section only where it needs real behaviour, and then keep its look. New pages and components use the same variables and shadcn/ui components so they match. Don't read every section first: the page list below says what each page holds; open only the files you are about to change.`

const BACKEND = `Server code: call enable_nitro first, then put API routes in server/routes/api/ (Nitro file routes, e.g. server/routes/api/orders.post.ts, served at /api/orders) and keep data in a small typed server-side store module, so the same code runs here and deploys to Vercel. Never put secrets in client code.`

// What the design implies, made real: the default first turn for a website.
// A site with promo games gets rewards: points from what visitors book or buy and
// from the games (their win screen links back with ?game=<slug>&points=N), spent
// in a small shop of perks. Partners are made up: a real brand would suggest a deal
// that does not exist.
export const rewardsBrief = games => `Rewards: this site has ${games.length > 1 ? 'promo games' : 'a promo game'} (${games.map(g => `"${g.title}", ?game=${g.slug}`).join('; ')}) whose win and lose screens send players back here with points.
- A points balance per visitor (keyed by email once they book or sign up, by a random id kept in localStorage before that), with a history of every change, in the server store.
- Earning: each booking or purchase earns 1 point per whole unit of its price; a visit to any page with ?game=<slug>&points=N adds N (whole number, at most 500) once per game per visitor per day, shows a small toast "+N points from <game>" and removes the query from the address bar. Unknown games earn nothing.
- A /rewards page in the nav: the balance, the history, and a shop of 6 perks the points buy (things like a month of a streaming service, a lounge pass, a seat upgrade, a coffee voucher), each from a made-up partner with an invented name. Never use a real company's name or logo. Redeeming takes the points and shows a one-time code; you cannot go below zero.
- Server routes for the balance, the claim, the history and redeeming; validate everything on the server (zod).`

export function sitePrompt(snap, ask, plan = null, games = []) {
  const behind = planBrief(plan)
  const pages = snap.pages.map((p, i) => {
    const roles = p.sections.filter(s => s.page !== '*').map(s => s.role).slice(0, 14).join('; ')
    return `- ${i === 0 ? '/' : `/${p.id}`} ${p.title}${p.purpose ? `: ${p.purpose}` : ''}${roles ? ` (sections: ${roles})` : ''}`
  }).join('\n')
  const want = ask ? `Do this: ${ask}` : `Make it a working app. Read the pages and decide what has to be real:
1. Every form submits to a server route, validates (zod + react-hook-form, shadcn Form), and shows a success state in the theme.
2. Lists, prices, plans, schedules, menus or stock the design shows come from GET routes over the store, typed, with a loading state.
3. Anything a visitor buys, books, applies for or signs up to is saved, with an id, and lowers stock where it has any.
${behind ? '4. The back office in the app plan below.' : '4. An /admin page (not linked from the nav) with a shadcn Table of everything saved and a short summary (counts, revenue where there are prices).'}
5. Buttons with data-goto already route between pages; keep them working.`
  return `${KEEP}

${snap.brand}: ${snap.brief || ''}

Pages:
${pages}

${want}
${behind ? `\n${behind}\n` : ''}${games.length && !ask ? `\n${rewardsBrief(games)}\n` : ''}
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
    // the last build's outcome: app:ready and app:deployed only say a server started or a deploy went out
    const last = events.findLast(e => ['app:start', 'app:done', 'app:failed'].includes(e.type))
    const steps = events.filter(e => e.type === 'app:step').slice(-200).map(e => e.step)
    if (!last) return { state: 'idle', engineReady: engineReady() }
    return { state: last.type === 'app:failed' ? 'failed' : last.type === 'app:start' ? 'stopped' : 'done', kind: events.find(e => e.type === 'app:start')?.kind || 'site', steps, result: events.findLast(e => e.type === 'app:done')?.result || null, message: last.message, deployed: events.findLast(e => e.type === 'app:deployed')?.url || null, hasApp: built(id, events), engineReady: engineReady() }
  }
  // an app counts once a build finished; a failed first build leaves only the empty starter
  const built = (id, events = readEvents(id) || []) => events.some(e => e.type === 'app:done') && existsSync(join(dirOf(id), 'package.json'))
  const view = j => ({ state: j.state, kind: j.kind, stage: j.stage, steps: j.steps.slice(-200), url: j.url || null, result: j.result, message: j.message, asks: j.asks, deployed: j.deployed || null, hasApp: j.state === 'done' || built(j.id), engineReady: engineReady() })

  // Start the first build, or one more turn on the same app.
  async function start(id, input = {}) {
    const events = readEvents(id)
    if (!events) throw new Error('no such build')
    let j = jobs.get(id)
    if (j?.state === 'working') return view(j)
    if ([...jobs.values()].some(x => x.state === 'working')) throw new Error('another app is building; wait for it or stop it')
    const dir = dirOf(id)
    const kind = input.kind || j?.kind || events.find(e => e.type === 'app:start')?.kind || (events.some(e => e.type === 'run:start' && e.kind === 'game') ? 'game' : 'site')
    // a first build that failed left only the starter: build again from the start
    const fresh = !built(id, events) || input.fresh
    const ask = String(input.ask || '').trim().slice(0, 16000)
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
        const games = [...new Map(events.filter(e => e.type === 'game:linked' && e.title).map(e => [e.game, { title: e.title, slug: gameSlug(e.title) }])).values()]
        prompt = sitePrompt(snap, ask, input.plan && typeof input.plan === 'object' ? input.plan : null, input.rewards === false ? [] : games)
      }
    } else {
      if (!ask) throw new Error('say what to change')
      prompt = `${kind === 'game' ? 'This is a browser game made from a spec in GAME_SPEC.md. Keep what works.' : KEEP}\n\nDo this: ${ask}\n\n${kind === 'game' ? '' : `${BACKEND}\n\n`}Finish with a working build: the typecheck and build must pass.`
    }
    j ||= { id, kind, steps: [], asks: [], proc: null, url: null, port: null }
    Object.assign(j, { kind, state: 'working', stage: 'starting', result: null, message: null, controller: new AbortController(), t: Date.now() })
    j.asks.push(ask || (kind === 'game' ? 'build the game' : 'make it a working app'))
    jobs.set(id, j)
    const m = modelFor('worker')
    send(id, 'app:start', { kind, ask: j.asks.at(-1), model: m, fresh })
    // the crew radio: the engine's lead and helpers, said out loud as Hermia and the crew
    const crew = ((readEvents(id) || []).find(e => e.type === 'run:start')?.agents || []).map(a => ({ id: a.id, name: a.name }))
    const queue = []
    let talking = null
    const speak = () => {
      const x = queue.shift()
      if (!x) { talking = null; return }
      const lead = x.who === 'lead'
      const to = x.to === 'lead' ? 'Hermia' : x.to?.name
      const data = { kind: x.kind, text: x.text, ...(to ? { to } : {}), ...(lead ? {} : { agent: x.who.id, name: x.who.name }), app: true }
      // orders, reports and thinking are kept with the run; moment-to-moment work is live only
      if (x.quiet) broadcast({ type: 'crew:act', t: Date.now(), run: id, ...data })
      else if (lead) send(id, 'crew:lead', data)
      else send(id, 'agent:say', data)
      talking = setTimeout(speak, x.quiet ? 250 : 1400)
    }
    j.radio?.stop()
    j.radio = crewRadio({ runDir: join(runsDir, id), crew, say: x => { if (queue.length < 30 || !x.quiet) queue.push(x); if (!talking) speak() } })
    j.radio.start()
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
      let result, used = m
      for (let i = 0; ; i++) {
        try {
          used = chain[i]
          result = await runEngine({ workspace: dir, prompt, provider: provider('worker'), model: chain[i], turns: input.turns || (input.plan ? 6 : 4), onStep: step, signal: j.controller.signal })
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
      if (kind === 'game') j.result.playtest = await playGame(j, dir, used, step, liveBrand(events))
      Object.assign(j, { state: 'done', stage: 'ready' })
      await j.radio?.stop()
      send(id, 'app:done', { result: j.result, url: j.url, ms: Date.now() - j.t })
    })().catch(err => {
      Object.assign(j, { state: 'failed', message: String(err.message || err).slice(0, 400) })
      j.radio?.stop()
      send(id, 'app:failed', { message: j.message, result: j.result })
    })
    return view(j)
  }

  // The promo game's brand, with the address its site has now: a site put online
  // after the game was made still counts as given, not as a made-up link
  const liveBrand = events => {
    const brand = events.find(e => e.type === 'game:spec')?.spec?.brand
    if (!brand?.from) return brand
    const site = readEvents(brand.from) || []
    const url = site.findLast(e => e.type === 'app:deployed' && e.url)?.url || site.findLast(e => e.type === 'publish:done' && e.url && e.target !== 'local')?.url
    return url ? { ...brand, url } : brand
  }

  // Check the built game before calling it done: no web address nobody gave it
  // (a model asked for "a button back to the site" with no address invents a
  // domain, which is someone else's), and a few seconds of play (the typecheck
  // and build pass a game whose run ends the moment it starts). Problems get one
  // fix turn with them spelled out, then a second check. Vite reloads the fix.
  async function playGame(j, dir, model, step, brand) {
    const allowed = brand?.url ? [brand.url] : []
    const linkProblem = () => {
      const bad = strangeLinks(dir, allowed)
      if (!bad.length) return null
      const where = bad.slice(0, 6).map(b => `${b.url} (in ${b.file})`).join(', ')
      return `The code links to web addresses nobody gave it, which belong to someone else: ${where}. Remove them. ${brand?.url ? `The only address for ${brand.name} is ${brand.url}; point those links there.` : `${brand?.name || 'The brand'} is not online yet: take out those buttons and links (keep the words of the call to action, no link).`}`
    }
    step({ kind: 'test', text: 'checking the game\'s links and play-testing it' })
    let links = linkProblem()
    if (links) step({ kind: 'test', text: 'the game links to a made-up web address', ok: false })
    // the title screen becomes the game's cover (img/snap.jpg, the run's snapshot)
    const shot = join(runsDir, j.id, 'img', 'snap.jpg')
    try { mkdirSync(join(runsDir, j.id, 'img'), { recursive: true }) } catch {}
    let t = await playtest(j.url, { shot })
    if (t.skipped) step({ kind: 'test', text: `play test skipped: ${t.skipped}`, ok: false })
    else if (t.ok) step({ kind: 'test', text: `play test passed: still playing after ${t.seconds.toFixed(1)} s` })
    else step({ kind: 'test', text: `play test failed: ${t.problem.split('. ')[0]}`, ok: false })
    if (!links && t.ok) return t.skipped ? { skipped: t.skipped } : { ok: true, seconds: t.seconds }
    const problems = [t.ok ? '' : `A play test of this game failed. ${t.problem}`, links || ''].filter(Boolean).join('\n\n')
    try {
      await runEngine({ workspace: dir, prompt: `${problems}\n\nKeep everything else as it is. Finish with a working build: the typecheck and build must pass.`, provider: provider('worker'), model, turns: 2, onStep: step, signal: j.controller.signal })
    } catch (err) {
      step({ kind: 'test', text: `the fix turn stopped: ${String(err.message).slice(0, 160)}`, ok: false })
      return { ok: false, problem: problems }
    }
    await new Promise(r => setTimeout(r, 2500))
    links = linkProblem()
    if (!t.ok) t = await playtest(j.url)
    const ok = !links && t.ok
    step({ kind: 'test', text: ok ? 'the game passes its checks after the fix' : `still wrong after the fix: ${(links || t.problem || '').split('. ')[0]}`, ok })
    return ok ? { ok: true, fixed: true, seconds: t.seconds } : { ok: false, problem: [t.ok ? '' : t.problem, links || ''].filter(Boolean).join(' ') }
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
    const k = j || { id, kind: state(id).kind, steps: state(id).steps || [], asks: [], state: 'done' }
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
  async function deploy(id, { creds, dataDir, publishVercel, env = null }) {
    const dir = dirOf(id)
    if (!existsSync(join(dir, 'package.json'))) throw new Error('no app yet')
    if (jobs.get(id)?.state === 'working') throw new Error('the app is still building')
    const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name || 'swarm-app'
    // the stages and Vercel's build log are saved with the run, so the Auto show's deploy shot replays too
    const r = await publishVercel({ dir, name: `${name}-app`.slice(0, 80), creds, dataDir, build: true, env,
      onStage: stage => send(id, 'app:stage', { stage: `deploy: ${stage}` }),
      onLog: lines => send(id, 'app:stage', { stage: 'deploy: building', log: lines.slice(-12) }) })
    send(id, 'app:deployed', { url: r.url, project: r.repo, pending: !!r.pending })
    const j = jobs.get(id)
    if (j) j.deployed = r.url
    return { url: r.url, project: r.repo, pending: !!r.pending }
  }

  function close() { for (const j of jobs.values()) { j.controller?.abort(); j.proc?.kill() } }

  return { start, state, stop, open, files, deploy, close, dirOf, jobs }
}
