// The App tab's jobs: a build's design (or a game spec) becomes a working app
// with dyad's engine, one turn per ask, and runs on a local dev server so the
// tab can show it. The server imports this file only when someone opens the
// App tab, so a studio that never builds an app never loads it.

import { spawn, execFile, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, normalize } from 'node:path'
import { snapshot, dyadApp, seedProject } from './export.mjs'
import { deployName, isScreenName, projectName } from './naming.mjs'
import { runEngine, appFiles, scaffoldDir, engineReady, viaShell } from './appbuild.mjs'
import { crewRadio } from './radio.mjs'
import { playtest } from './playtest.mjs'
import { strangeLinks } from './links.mjs'
import { planBrief } from './advisor.mjs'
import { gameSlug, isBig, artList, sheetList, stagesFor, bigStagePrompt } from './game.mjs'
import { TARGETS, portTarget, portPrompt, checkPort, copyPortModels, checkGodot } from './port.mjs'

const KEEP = `This project already holds a finished design made in Swarm Studio: every section is a component in src/components/swarm/, every page is in src/pages/, and the theme lives in the CSS variables in src/globals.css. The look is decided. Keep that markup, those Tailwind classes and those variables. Change a section only where it needs real behaviour, and then keep its look. New pages and components use the same variables and shadcn/ui components so they match. Don't read every section first: the page list below says what each page holds; open only the files you are about to change.`

// Sign-in is real or plainly a guest pass: never a form that lets anyone in, never a dead provider button.
export const AUTH = `Sign-in (only where the design or the ask has sign-in, sign-up, accounts or players):
- When the app's database is connected (process.env.SUPABASE_URL is set), use Supabase Auth through @supabase/supabase-js on the server: sign-up and sign-in with email and password, a session cookie (httpOnly), and the server checks the session on every route that needs it.
- Otherwise it is a guest pass, labelled as one on the screen ("Guest pass: pick a name and a secret word; this is not a full account"): a visitor claims a display name with a secret; the server keeps only a salted hash of the secret (node:crypto scrypt) and compares with timingSafeEqual; a name already claimed needs its own secret; a wrong secret is refused with a clear message. Never accept any name with any password.
- Only show a "Sign in with <provider>" button (Discord, Google, GitHub, Apple…) when that provider is really configured in the server environment (for Discord: DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET) and the button runs its real OAuth flow. Otherwise remove the button from the design: never ship a button that does nothing.`

const BACKEND = `Server code: call enable_nitro first, then put API routes in server/routes/api/ (Nitro file routes, e.g. server/routes/api/orders.post.ts, served at /api/orders) and keep data in a small typed server-side store module, so the same code runs here and deploys to Vercel. Never put secrets in client code.

${AUTH}`

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
const portFree = port => new Promise(ok => {
  const s = createServer().once('error', () => ok(false)).listen(port, '127.0.0.1', () => s.close(() => ok(true)))
})
const stopProc = p => new Promise(ok => {
  if (p.exitCode !== null) return ok()
  const t = setTimeout(() => { p.kill('SIGKILL'); ok() }, 5000)
  p.once('exit', () => { clearTimeout(t); ok() })
  p.kill()
})

// What a running Vite dev server cannot take in without a restart: its
// config, Nitro's, the packages, and a server/ folder appearing.
const SERVE_FILES = ['package.json', 'vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'nitro.config.ts', 'nitro.config.js']
export function serveSig(dir) {
  return SERVE_FILES.map(f => { try { return `${f}:${statSync(join(dir, f)).mtimeMs}` } catch { return '' } }).join('|') + `|server:${existsSync(join(dir, 'server'))}`
}

// A game's 3D models into its app: input.copy maps public/models/<file> to a file
// on disk. A start over without them keeps the ones the game had (in app-before/).
export function copyModels(dir, copy = {}) {
  const to = join(dir, 'public', 'models')
  const pairs = Object.entries(copy || {}).filter(([rel]) => /^public\/models\/[\w.-]{1,80}\.(glb|gltf)$/i.test(rel)).map(([rel, src]) => [rel.slice('public/models/'.length), src])
  const before = join(`${dir}-before`, 'public', 'models')
  if (!pairs.length && existsSync(before)) for (const f of readdirSync(before)) if (/\.(glb|gltf)$/i.test(f)) pairs.push([f, join(before, f)])
  for (const [f, src] of pairs) {
    try { mkdirSync(to, { recursive: true }); copyFileSync(src, join(to, f)) } catch {}
  }
  return pairs.length
}

const sh = (cmd, args, cwd, ms = 300000) => new Promise(ok => execFile(cmd, args, { ...viaShell, cwd, timeout: ms, maxBuffer: 1 << 22, env: { ...process.env, CI: '1' } }, (err, stdout, stderr) => ok({ ok: !err, out: String(stdout) + String(stderr) })))

// A big game stopped partway: the stage to go on from (0: start over). Only
// stages since the last build from scratch count, and only with the app still there.
// The count of slices is the spec's own (stagesFor), saved on each app:stage event; older runs had five.
export function bigResumeAt(events, dir) {
  if (!dir || !existsSync(join(dir, 'package.json'))) return 0
  const startIdx = events.findLastIndex(e => e.type === 'app:start' && e.fresh && !e.resume)
  if (startIdx < 0) return 0
  let next = 0
  let total = 5
  for (const e of events.slice(startIdx)) if (e.type === 'app:stage' && e.big) { if (e.big.n) total = e.big.n; if (e.big.ok && e.big.i === next) next++ }
  return next < total ? next : 0
}

// An app's <title> is its project's name: a missing one, or one an engine turn took
// from a screen ("Sign In to ARES"), becomes the project name. A real title stays.
export function titleApp(dir, name) {
  const file = join(dir, 'index.html')
  if (!name || !existsSync(file)) return false
  const html = readFileSync(file, 'utf8')
  const m = html.match(/<title>([\s\S]*?)<\/title>/)
  const now = m ? m[1].replace(/&amp;/g, '&').trim() : ''
  if (now && !isScreenName(now) && !/^(vite|react|dyad|my[ -]app|swarm[ -]app)\b/i.test(now)) return false
  const safe = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 80)
  const next = m ? html.replace(m[0], `<title>${safe}</title>`) : html.replace('</head>', `<title>${safe}</title>\n</head>`)
  if (next === html) return false
  writeFileSync(file, next)
  return true
}

// paint(runId, spec, items, appDir, step) → [{ file, what, kind }]: a big game's art,
// painted by the server's art pipeline into the app's public/art/ (optional: without
// it a big game draws everything in code)
// fill(runId, appDir, step): fills picture slots the crew did not paint (optional)
// nameFor(id) -> { name, kind }: the run's project name and piece (docs/specs/18-projects.md)
export function appJobs({ runsDir, record, broadcast, readEvents, provider, modelFor, paint = null, fill = null, nameFor = () => null }) {
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
    // a build another Studio drives (same runs folder): its log still moves, so it is working,
    // with the dev server it reported; this Studio only watches it
    const elsewhere = last.type === 'app:start' && Date.now() - (events.at(-1)?.t || 0) < 20 * 60e3
    if (elsewhere) {
      const ready = events.slice(events.lastIndexOf(last)).findLast(e => e.type === 'app:ready')
      const stage = steps.findLast(s => /^stage \d+ of \d+/.test(s.text || ''))?.text || steps.at(-1)?.text || ''
      return { state: 'working', elsewhere: true, kind: last.kind || events.find(e => e.type === 'app:start')?.kind || 'site', stage, steps, url: ready?.url || null, result: null, deployed: events.findLast(e => e.type === 'app:deployed')?.url || null, hasApp: built(id, events), engineReady: engineReady() }
    }
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
    if (!j && state(id).elsewhere) throw new Error('another Swarm Studio is building this one; it shows here as it goes')
    if ([...jobs.values()].some(x => x.state === 'working')) throw new Error('another app is building; wait for it or stop it')
    const dir = dirOf(id)
    const kind = input.kind || j?.kind || events.find(e => e.type === 'app:start')?.kind || (events.some(e => e.type === 'run:start' && e.kind === 'game') ? 'game' : 'site')
    // a first build that failed left only the starter: build again from the start
    const fresh = !built(id, events) || input.fresh
    // the Studio's Try again sends fresh: true, so only restart: true starts a big game over
    const resumeAt = kind === 'game' && fresh && input.restart !== true ? bigResumeAt(events, dir) : 0
    const ask = String(input.ask || '').trim().slice(0, 16000)
    let prompt
    if (fresh) {
      // a new app starts a new engine chat: the old one's history (and its
      // failures) would steer the model
      const meta = join(runsDir, id, '.engine')
      if (existsSync(meta)) for (const d of readdirSync(meta)) if (d.startsWith('data-')) rmSync(join(meta, d), { recursive: true, force: true })
      if (kind === 'game') {
        if (!input.prompt) throw new Error('a game needs its spec')
        // a big game stopped partway keeps its finished stages: Try again goes on from the next one
        if (!resumeAt) {
          // the game made before is moved aside, not deleted: one copy is kept (app-before/) so a wrong start over loses nothing
          if (existsSync(join(dir, 'package.json'))) { rmSync(`${dir}-before`, { recursive: true, force: true }); renameSync(dir, `${dir}-before`) }
          seedProject(scaffoldDir, dir, nameFor(id)?.name || input.title || 'game')
        }
        for (const [name, text] of Object.entries(input.files || {})) if (/^[\w.-]+$/.test(name)) writeFileSync(join(dir, name), String(text))
        copyModels(dir, input.copy)
        prompt = input.prompt
      } else {
        const snap = snapshot(events, Array.isArray(input.sections) ? input.sections.slice(0, 80) : [], { name: nameFor(id)?.name })
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
    send(id, 'app:start', { kind, ask: j.asks.at(-1), model: m, fresh, ...(resumeAt ? { resume: resumeAt } : {}) })
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
    // a big game builds in stages from its saved spec; everything else is one engine call
    const spec = kind === 'game' && fresh ? events.findLast(e => e.type === 'game:spec')?.spec : null
    const big = !!spec && (isBig(spec) || input.big === true)
    ;(async () => {
      // a busy or rate-limited model: on InferHub try the same model's other route,
      // then other fast coders; elsewhere wait a little and go again
      const chain = [m, ...(/inferhub/.test(provider('worker').baseUrl) ? APP_FALLBACKS.filter(x => x !== m) : [m, m])]
      let used = m
      const engineCall = async (text, turns) => {
        for (let i = chain.indexOf(used); ; i++) {
          try {
            used = chain[i]
            return await runEngine({ workspace: dir, prompt: text, provider: provider('worker'), model: chain[i], turns, onStep: step, signal: j.controller.signal })
          } catch (err) {
            if (i + 1 >= chain.length || j.controller.signal.aborted || !BUSY.test(err.message)) throw err
            step({ kind: 'setup', text: `${chain[i]} is busy at the provider; going on with ${chain[i + 1]}`, ok: false })
            if (chain[i + 1] === chain[i]) await new Promise(r => setTimeout(r, 30000))
          }
        }
      }
      if (big) {
        await buildBig(j, id, dir, spec, engineCall, () => used, step, liveBrand(events), input, resumeAt)
      } else {
        const result = await engineCall(prompt, input.turns || (input.plan ? 6 : 4))
        j.result = { ok: result.ok, gatesPassed: result.gatesPassed, turns: result.turns, commits: result.commits, files: result.files?.length || 0 }
        if (!result.ok) throw new Error(result.error || 'the engine could not finish the app')
        if (fill && kind !== 'game') try { j.result.standins = (await fill(id, dir, step)).filled } catch (err) { step({ kind: 'setup', text: `empty picture slots could not be filled: ${String(err.message || err).slice(0, 160)}`, ok: false }) }
        await serve(id, j, step)
        if (kind === 'game') j.result.playtest = await playGame(j, dir, used, step, liveBrand(events))
      }
      // Godot, Unity or Unreal asked for: the same game written as that engine's project too
      const target = kind === 'game' ? portTarget(input.target ? input : spec || events.findLast(e => e.type === 'game:spec')?.spec) : null
      if (target) j.result.port = await buildPort(dir, target, spec || events.findLast(e => e.type === 'game:spec')?.spec || {}, engineCall, step)
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

  // The engine port: one engine call writes ports/<target>/, a second one fills in
  // what the engine needs to open it. A port that fails never fails the game.
  async function buildPort(dir, target, spec, engineCall, step) {
    const t = TARGETS[target]
    step({ kind: 'setup', text: `writing the game as a ${t.label} project` })
    try {
      const models = copyPortModels(dir, target)
      if (models.length) step({ kind: 'setup', text: `${models.length} 3D models copied into the ${t.label} project` })
      await engineCall(portPrompt(spec, target, models), 3)
      let c = checkPort(dir, target)
      if (!c.ok) {
        step({ kind: 'test', text: `the ${t.label} project lacks ${c.missing.join(', ')}`, ok: false })
        await engineCall(`The ${t.label} port in ports/${target}/ is missing ${c.missing.join(', ')}. Add them so ${t.label} can open the project. Touch nothing outside ports/${target}/.`, 2)
        c = checkPort(dir, target)
      }
      step({ kind: 'test', text: c.ok ? `${t.label} project written: ${c.files} files` : `the ${t.label} project still lacks ${c.missing.join(', ')}`, ok: c.ok })
      // with Godot on this machine, the project is opened and run headless, and its errors get a fix turn
      let opened = null
      if (c.ok && target === 'godot') {
        step({ kind: 'test', text: 'opening the project in Godot' })
        opened = await checkGodot(dir)
        if (opened && !opened.ok) {
          step({ kind: 'test', text: `Godot reports ${opened.errors.length} error${opened.errors.length === 1 ? '' : 's'}: fixing`, ok: false })
          await engineCall(`Godot 4 opened ports/godot/ headless and reported these errors:\n${opened.errors.map(e => `- ${e}`).join('\n')}\n\nFix them in ports/godot/ (GDScript 4 syntax, node paths, resource paths). Touch nothing outside ports/godot/.`, 2)
          opened = await checkGodot(dir)
        }
        if (opened) step({ kind: 'test', text: opened.ok ? 'Godot opens and runs the project with no errors' : `Godot still reports: ${opened.errors[0]}`, ok: opened.ok })
      }
      return { target, label: t.label, ...c, ...(opened ? { godot: opened } : {}) }
    } catch (err) {
      step({ kind: 'test', text: `the ${t.label} port stopped: ${String(err.message || err).slice(0, 160)}`, ok: false })
      return { target, label: t.label, ok: false, files: 0, missing: [], error: String(err.message || err).slice(0, 200) }
    }
  }

  // A big game: its art first (the stages are told which files exist), then one
  // system group per stage, each with its own turns, the engine's typecheck and
  // build gates, a play test and a fix turn. A stage whose build fails hands that
  // to the next stage first; the last one gets a fix turn of its own.
  async function buildBig(j, id, dir, spec, engineCall, model, step, brand, input, from = 0) {
    let art = []
    const items = [...artList(spec), ...sheetList(spec)]
    if (paint && input.art !== false) {
      step({ kind: 'setup', text: `painting the game's art: ${items.length} pictures` })
      try { art = await paint(id, spec, items, dir, step, j.controller.signal) } catch (err) { step({ kind: 'setup', text: `the art could not be painted: ${String(err.message || err).slice(0, 160)}`, ok: false }) }
    }
    if (j.controller.signal.aborted) throw new Error('stopped')
    j.result = { ok: false, big: true, art: art.length, stages: [], turns: 0, commits: 0, files: 0, ...(from ? { resumedAt: from } : {}) }
    // the image model ran out before any art landed: stop here and say so, rather than build a
    // game of placeholder shapes. The owner picks another image model, Try again, or Draw in code.
    if (art.stopped) {
      j.result.artStop = art.stopped
      if (!art.length) throw new Error(`No art: ${art.stopped.model} is out of quota. ${art.stopped.missing} pictures not painted.`)
      step({ kind: 'setup', text: `${art.stopped.missing} of ${items.length} pictures missing: the game draws them in code`, ok: false })
    }
    if (from) step({ kind: 'setup', text: `stages 1–${from} are built already: going on from stage ${from + 1}` })
    let failed = from ? 'the last build stopped partway through this stage: some of its changes may already be in the code (git status shows them). Finish them or redo them.' : '', last = null
    // the slices are the game's own, planned with its spec from the person's answers and picks
    const stages = stagesFor(spec)
    if (from >= stages.length) from = 0
    for (let i = from; i < stages.length; i++) {
      if (j.controller.signal.aborted) throw new Error('stopped')
      const st = stages[i], t = Date.now()
      step({ kind: 'setup', text: `stage ${i + 1} of ${stages.length}: ${st.name}` })
      // the engine itself can stop with an error (a helper that never reports): one more go at the stage, then on
      for (let go = 0; ; go++) {
        try { last = await engineCall(bigStagePrompt(spec, i, { art, failed }), input.turns || st.turns); break } catch (err) {
          if (j.controller.signal.aborted) throw err
          step({ kind: 'setup', text: `stage ${i + 1} stopped: ${String(err.message || err).slice(0, 160)}`, ok: false })
          if (go >= 1) { last = { ok: false, error: String(err.message || err) }; break }
          failed = 'the last try at this stage stopped partway: some of its changes may already be in the code (git status shows them). Finish them or redo them.'
        }
      }
      failed = last.ok ? '' : `the typecheck or build failed at the end of the last stage${last.error ? ` (${String(last.error).slice(0, 300)})` : ''}. Make it pass before anything else.`
      j.result.turns += last.turns || 0
      j.result.commits += last.commits || 0
      j.result.files = Math.max(j.result.files, last.files?.length || 0)
      await serve(id, j, step)
      const play = await playGame(j, dir, model(), step, brand)
      j.result.stages.push({ id: st.id, name: st.name, ok: !!last.ok, gatesPassed: last.gatesPassed, turns: last.turns, playtest: play, ms: Date.now() - t })
      // each slice carries the bots' filmed play test, so the person sees it before the next one
      send(id, 'app:stage', { stage: `stage ${i + 1} of ${stages.length} done: ${st.name}`, big: { i, n: stages.length, name: st.name, ok: !!last.ok, play: !!play?.ok, ...(play?.clip ? { clip: play.clip } : {}) } })
    }
    if (!last?.ok) {
      step({ kind: 'test', text: 'the last stage did not pass its build: one fix turn', ok: false })
      last = await engineCall(`This is a big browser game made from GAME_SPEC.md; keep what works. ${failed}\n\nFinish with a working build: the typecheck and build must pass.`, 3)
    }
    Object.assign(j.result, { ok: !!last.ok, gatesPassed: last.gatesPassed, playtest: j.result.stages.at(-1)?.playtest })
    if (!last.ok) throw new Error(last.error || 'the engine could not finish the game')
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
    // the play test is filmed: the App view replays it, with the keys it pressed
    // numbered from the clips already there, so a restart never reuses a name (they are cached for good)
    let n = 1
    try { n = 1 + Math.max(0, ...readdirSync(join(runsDir, j.id, 'img')).map(f => +(f.match(/^playtest-(\d+)\.webm$/)?.[1] || 0))) } catch {}
    if (n > 999) n = 999
    const clip = join(runsDir, j.id, 'img', `playtest-${n}.webm`)
    let t = await playtest(j.url, { shot, clip })
    const film = t.clip ? { clip: `/img/${j.id}/playtest-${n}.webm`, keys: t.keys || [] } : {}
    if (t.skipped) step({ kind: 'test', text: `play test skipped: ${t.skipped}`, ok: false })
    else if (t.ok) step({ kind: 'test', text: `play test passed: still playing after ${t.seconds.toFixed(1)} s`, ...film })
    else step({ kind: 'test', text: `play test failed: ${t.problem.split('. ')[0]}`, ok: false, ...film })
    const withClip = o => (film.clip ? { ...o, clip: film.clip } : o)
    if (!links && t.ok) return t.skipped ? { skipped: t.skipped } : withClip({ ok: true, seconds: t.seconds })
    const problems = [t.ok ? '' : `A play test of this game failed. ${t.problem}`, links || ''].filter(Boolean).join('\n\n')
    try {
      await runEngine({ workspace: dir, prompt: `${problems}\n\nKeep everything else as it is. Finish with a working build: the typecheck and build must pass.`, provider: provider('worker'), model, turns: 2, onStep: step, signal: j.controller.signal })
    } catch (err) {
      step({ kind: 'test', text: `the fix turn stopped: ${String(err.message).slice(0, 160)}`, ok: false })
      return withClip({ ok: false, problem: problems })
    }
    await new Promise(r => setTimeout(r, 2500))
    links = linkProblem()
    if (!t.ok) t = await playtest(j.url)
    const ok = !links && t.ok
    step({ kind: 'test', text: ok ? 'the game passes its checks after the fix' : `still wrong after the fix: ${(links || t.problem || '').split('. ')[0]}`, ok })
    return withClip(ok ? { ok: true, fixed: true, seconds: t.seconds } : { ok: false, problem: [t.ok ? '' : t.problem, links || ''].filter(Boolean).join(' ') })
  }

  // A dev server for the app (Vite, plus Nitro's routes when the app has them).
  // Kept running between turns: Vite picks up the engine's next edits itself.
  // Vite does not pick up a new plugin or package (a turn that adds Nitro, say):
  // when these files change the dev server starts over, on the same port.
  async function serve(id, j, step = () => {}) {
    const dir = dirOf(id)
    const sig = serveSig(dir)
    if (j.proc && j.proc.exitCode === null) {
      if (j.sig === sig) return
      step({ kind: 'serve', text: 'the app\'s setup changed: restarting it' })
      await stopProc(j.proc)
      j.url = null
    }
    step({ kind: 'serve', text: 'installing the app\'s packages' })
    const inst = await sh('pnpm', ['install', '--prefer-offline'], dir)
    if (!inst.ok) throw new Error(`pnpm install failed: ${inst.out.slice(-300)}`)
    j.port = j.port && await portFree(j.port) ? j.port : await freePort()
    j.sig = sig
    step({ kind: 'serve', text: `starting the app on port ${j.port}` })
    // --cors: Hermes shows the Studio in a sandboxed frame (origin null), and the app's module scripts need CORS to load there
    // vite's own script under this Node: .bin/vite is a shell shim (vite.cmd on Windows)
    const p = spawn(process.execPath, [join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(j.port), '--strictPort', '--host', '127.0.0.1', '--cors'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' } })
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
    if (j?.url && j.proc?.exitCode === null && j.sig === serveSig(dirOf(id))) return view(j)
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
    // <project>-<kind>, like ares-app: from the project's name, never a screen's ("sign-in-to-ares")
    const named = nameFor(id)
    const kind = named?.kind || (jobs.get(id)?.kind === 'game' || state(id).kind === 'game' ? 'game' : 'app')
    const project = projectNameOf(id, named)
    const name = deployName(project || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name || 'swarm', kind)
    // the tab title too: an engine turn may have named the page after its first screen
    if (project) titleApp(dir, project)
    // the stages and Vercel's build log are saved with the run, so the Auto show's deploy shot replays too
    const r = await publishVercel({ dir, name, creds, dataDir, build: true, env,
      onStage: stage => send(id, 'app:stage', { stage: `deploy: ${stage}` }),
      onLog: lines => send(id, 'app:stage', { stage: 'deploy: building', log: lines.slice(-12) }) })
    send(id, 'app:deployed', { url: r.url, project: r.repo, pending: !!r.pending })
    const j = jobs.get(id)
    if (j) j.deployed = r.url
    return { url: r.url, project: r.repo, pending: !!r.pending }
  }

  // the run's project name: the projects index, else the brief's brand (never a screen's title)
  function projectNameOf(id, named = nameFor(id)) {
    if (named?.name && !isScreenName(named.name)) return named.name
    const start = (readEvents(id) || []).find(e => e.type === 'run:start')
    if (!start) return ''
    const n = projectName({ brief: start.brief, title: start.title })
    return n === 'Swarm build' ? '' : n
  }

  function close() { for (const j of jobs.values()) { j.controller?.abort(); j.proc?.kill() } }

  return { start, state, stop, open, files, deploy, close, dirOf, jobs }
}
