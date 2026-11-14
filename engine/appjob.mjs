// The App tab's jobs: a build's design (or a game spec) becomes a working app
// with dyad's engine, one turn per ask, and runs on a local dev server so the
// tab can show it. The server imports this file only when someone opens the
// App tab, so a studio that never builds an app never loads it.

import { execFile, execFileSync, appEnv, start as startProc, stopTree } from './proc.mjs'
import { previewPool } from './lifecycle.mjs'
import { createHash } from 'node:crypto'
import { createServer as httpServer, request } from 'node:http'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, normalize } from 'node:path'
import { snapshot, dyadApp, seedProject } from './export.mjs'
import { seoFromEvents, shareApp } from './seo.mjs'
import { deployName, isScreenName, projectName } from './naming.mjs'
import { runEngine, appFiles, scaffoldDir, engineReady, viaShell } from './appbuild.mjs'
import { crewRadio } from './radio.mjs'
import { playtest } from './playtest.mjs'
import { strangeLinks } from './links.mjs'
import { checklist, checkLine, testDodges, dodgeProblem } from './playcheck.mjs'
import { planBrief } from './advisor.mjs'
import { gameSlug, isBig, artList, sheetList, stagesFor, bigStagePrompt, sliceAsk, artBrief, viewOf } from './game.mjs'
import { takeAsks, askedBefore, keepAsked, askBrief, ASKS_PER_STAGE } from './artask.mjs'
import { TARGETS, portTarget, portPrompt, checkPort, copyPortModels, checkGodot } from './port.mjs'
import { intakeOf } from './bringin.mjs'
import { godotFirst, isGodotFirst, seedGodot, syncGodotArt, godotArtBrief, godotStagePrompt, exportWeb, serveStatic, webBuild } from './godotfirst.mjs'

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
// What a finished app's build depends on: every file of the app but its packages and build output, by name,
// size and time. The build is redone only when this changes.
const BUILD_SKIP = /^(node_modules|dist|\.output|\.nitro|\.git|\.vite|\.dyad|\.vercel|\.swarm-built\.json)$/
export function sourceSig(dir) {
  const h = createHash('sha1')
  const walk = (d, rel) => {
    let names = []
    try { names = readdirSync(d).sort() } catch { return }
    for (const n of names) {
      if (BUILD_SKIP.test(n)) continue
      const f = join(d, n)
      let st
      try { st = statSync(f) } catch { continue }
      if (st.isDirectory()) walk(f, `${rel}${n}/`)
      else h.update(`${rel}${n}:${st.size}:${st.mtimeMs}\n`)
    }
  }
  walk(dir, '')
  return h.digest('hex')
}
// An app with server routes (Dyad's Nitro layer) builds to .output/ and runs as `node .output/server/index.mjs`
// (dyad/src/lib/framework_constants.ts:58); one without serves dist/ as files
export const hasServer = dir => ['nitro.config.ts', 'nitro.config.js', 'server'].some(f => existsSync(join(dir, f)))

// A built app's server behind a front on the app's own port that adds CORS: Hermes shows the Studio in a
// sandboxed frame (origin null), and the app's module scripts need it to load there (the dev server's --cors)
export function corsFront(port, to) {
  const srv = httpServer((req, res) => {
    const up = request({ host: '127.0.0.1', port: to, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${to}` } }, r => {
      res.writeHead(r.statusCode || 502, { ...r.headers, 'access-control-allow-origin': '*' })
      r.pipe(res)
    })
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
    req.pipe(up)
  })
  return new Promise((ok, fail) => {
    srv.once('error', fail)
    srv.listen(port, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${port}/`, close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(() => r()) }) }))
  })
}

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

const sh = (cmd, args, cwd, ms = 300000) => new Promise(ok => execFile(cmd, args, { ...viaShell, cwd, timeout: ms, maxBuffer: 1 << 22, env: { CI: '1' } }, (err, stdout, stderr) => ok({ ok: !err, out: String(stdout) + String(stderr) })))

// A big game stopped partway: the stage to go on from (0: start over). Only
// stages since the last build from scratch count, and only with the app still there.
// The count of slices is the spec's own (stagesFor), saved on each app:stage event; older runs had five.
export function bigResumeAt(events, dir) {
  if (!dir || !existsSync(join(dir, 'package.json'))) return 0
  const startIdx = events.findLastIndex(e => e.type === 'app:start' && e.fresh && !e.resume)
  if (startIdx < 0) return 0
  // a Godot-first game counts only its Godot stages (a web build before it does not carry over)
  const godot = isGodotFirst(dir)
  let next = 0
  let total = 5
  for (const e of events.slice(startIdx)) if (e.type === 'app:stage' && e.big && !!e.big.godot === godot) { if (e.big.n) total = e.big.n; if (e.big.ok && e.big.i === next) next++ }
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
// A question to the crew (answered, not queued as a change)
const QUESTION = /\?\s*$|^(what|what's|whats|why|how|when|where|who|which|is|are|was|were|can|could|does|did|do|will|status)\b/i
// is a process still running (a Studio server that started a build)
export const alive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
// How a build runs, for Hermia's answers in the chat: without it she only sees the crew's last
// lines and guesses (she once said the play test "isn't in the notes, so it isn't built").
// slices: the plan's slice names in order, when the build has them (a game spec's stages)
export function processNotes({ kind = 'site', state = 'idle', stage = '', done = [], slices = [] } = {}) {
  const game = kind === 'game'
  const at = String(stage).match(/stage (\d+) of (\d+)( done)?/)
  let where = ''
  if (at) {
    const n = Number(at[2]), i = Number(at[1]), finished = !!at[3]
    const left = n - i
    where = finished
      ? `Slice ${i} of ${n} is done${left ? `; ${left} more to go after it` : ', the last one'}.`
      : `The build is on slice ${i} of ${n}${left ? `, with ${left} more after it` : ', the last one'}.`
    if (done.length) where += ` Done so far: ${done.join('; ')}.`
    if (slices.length === n) where += ` The slices: ${slices.map((x, k) => `${k + 1} ${x}${k + 1 < i || (finished && k + 1 === i) ? ' (done)' : k + 1 === i ? ' (now)' : ''}`).join('; ')}.`
  }
  return [
    game
      ? 'How the Studio builds a game: the art is painted first, then the game is built in slices (stages), one at a time. Each slice: the crew writes the code in turns, the Studio checks the build (Godot: a headless run, then a web export), then the play test runs by itself: a bot plays the exported game and films it, and that clip fills the Play test window. The play test is the "autoplay"; nobody has to ask for it or add it to the notes. After the clip the build pauses so the owner can watch it and say go on or what to change, then the next slice starts. Words sent while the crew works are read at the start of the next slice.'
      : 'How the Studio builds an app: the crew writes the code in turns, the Studio runs its checks, then serves the app in the preview. Words sent while the crew works are read at the start of the next stage.',
    where,
    state === 'paused' ? 'Right now the build is paused, waiting for the owner to watch the slice\'s play test and say go on.' : ''
  ].filter(Boolean).join(' ')
}
export const isQuestion = text => QUESTION.test(String(text || '').trim())

// the video idle's go-ahead carried by the build itself: 'no', or a yes at a price ({ usd })
// that must match the clip's price when it is asked (engine/idle.mjs priceOk)
export const idleInput = v => (v === 'no' || v === false ? 'no' : v && typeof v === 'object' && Number.isFinite(Number(v.usd)) ? { usd: Number(v.usd), ...(typeof v.video === 'string' && /^[\w.\/:@+-]{1,160}$/.test(v.video) ? { video: v.video } : {}) } : null)

// idleMs, maxApps: Settings › Background (numbers, or functions read each time): an app's server stops after idleMs
// with no viewer and no build, and at most maxApps run at once (decision 0017, issue #450)
export function appJobs({ runsDir, record, broadcast, readEvents, provider, modelFor, paint = null, fill = null, nameFor = () => null, idleMs = 120000, maxApps = 2, sweepEvery = 15000, now = Date.now }) {
  const jobs = new Map() // run id -> job
  // Each app's server (spec 44, "the dev server only while building"): the dev server runs while the crew builds
  // or someone edits; a finished app is served built (serveBuilt). Either one stops when no viewer has sent a
  // heartbeat (seen) for idleMs and nobody is building it, and at most maxApps run, the least recently viewed
  // stopped first. The next open serves it again, cold.
  const pool = previewPool({ max: maxApps, idleMs, now, busy: id => jobs.get(id)?.state === 'working', stop: (id, why) => park(id, why) })
  const sweeper = setInterval(() => { pool.sweep().catch(() => {}) }, sweepEvery)
  sweeper.unref?.()
  const send = (id, type, data) => record(id, { type, t: Date.now(), run: id, ...data })
  const dirOf = id => join(runsDir, id, 'app')

  function state(id) {
    const j = jobs.get(id)
    if (j) return view(j)
    // a finished app from before a restart: rebuild the state from the log
    const events = readEvents(id) || []
    // the last build's outcome: app:ready and app:deployed only say a server started or a deploy went out
    const last = events.findLast(e => ['app:start', 'app:done', 'app:failed', 'app:paused'].includes(e.type))
    const steps = events.filter(e => e.type === 'app:step').slice(-200).map(e => e.step)
    if (!last) return { state: 'idle', engineReady: engineReady() }
    const kindOf = () => events.find(e => e.type === 'app:start')?.kind || 'site'
    // a build another Studio drives (same runs folder): its log still moves, so it is working,
    // with the dev server it reported; this Studio only watches it
    // (a build that names its Studio's process counts only while that process lives: one killed mid-build stopped)
    const elsewhere = last.type === 'app:start' && (last.pid ? last.pid !== process.pid && alive(last.pid) : Date.now() - (events.at(-1)?.t || 0) < 20 * 60e3)
    if (elsewhere) {
      const ready = events.slice(events.lastIndexOf(last)).findLast(e => e.type === 'app:ready')
      const stage = steps.findLast(s => /^stage \d+ of \d+/.test(s.text || ''))?.text || steps.at(-1)?.text || ''
      const at = steps.findLast(x => /^stage \d+ of \d+/.test(x.text || ''))?.text.match(/^stage (\d+) of (\d+)/)?.slice(1).map(Number) || (events.findLast(e => e.type === 'app:step' && /^stage \d+ of \d+/.test(e.step?.text || ''))?.step.text.match(/^stage (\d+) of (\d+)/)?.slice(1).map(Number))
      return { ...(at ? { at } : {}), state: 'working', elsewhere: true, kind: last.kind || events.find(e => e.type === 'app:start')?.kind || 'site', stage, steps, url: ready?.url || null, result: null, deployed: events.findLast(e => e.type === 'app:deployed')?.url || null, hasApp: built(id, events), canServe: servable(id), engineReady: engineReady() }
    }
    return { state: last.type === 'app:failed' ? 'failed' : last.type === 'app:paused' ? 'paused' : last.type === 'app:start' ? 'stopped' : 'done', ...broughtIn(id, events), ...(last.type === 'app:paused' ? { slice: last.slice } : {}), kind: kindOf(), steps, result: events.findLast(e => e.type === 'app:done')?.result || null, message: last.message, deployed: events.findLast(e => e.type === 'app:deployed')?.url || null, hasApp: built(id, events), canServe: servable(id, events), engineReady: engineReady() }
  }
  // an app counts once a build finished; a failed first build leaves only the empty starter
  // (a project brought in, docs/specs/45-intake.md, counts once its files are in: it may have no package.json)
  const built = (id, events = readEvents(id) || []) => events.some(e => e.type === 'app:done') && (existsSync(join(dirOf(id), 'package.json')) || !!intakeOf(events)?.done)
  // a run that was brought in says so: its shape, whether the crew can change it (fixed: not yet) and whether
  // the person has pressed for its install and build (ran); null for a run the Studio built
  const broughtIn = (id, events = readEvents(id) || []) => { const it = intakeOf(events); return it ? { intake: { shape: it.shape, fixed: it.fixed, ran: it.ran, done: it.done } } : {} }
  // (asked of a job once: a run the Studio built never becomes one that was brought in)
  const broughtJob = j => (j.brought === false ? {} : (j.brought = !!intakeOf(readEvents(j.id) || [])) ? broughtIn(j.id) : {})
  // the app's own files are there, so it can be served (open): true for a big game waiting after a slice, which
  // is not an app yet (no build finished) but is there to play
  const servable = (id, events) => existsSync(join(dirOf(id), 'package.json')) || !!intakeOf(events || readEvents(id) || [])?.done
  const view = j => ({ ...broughtJob(j), state: j.state, kind: j.kind, stage: j.stage, served: j.mode || null, ...(j.slice_at ? { at: j.slice_at } : {}), steps: j.steps.slice(-200), url: j.url || null, result: j.result, message: j.message, asks: j.asks, deployed: j.deployed || null, hasApp: j.state === 'done' || built(j.id), canServe: servable(j.id), engineReady: engineReady(), ...(j.state === 'paused' && j.slice ? { slice: j.slice } : {}) })

  // Start the first build, or one more turn on the same app.
  async function start(id, input = {}) {
    const events = readEvents(id)
    if (!events) throw new Error('no such build')
    let j = jobs.get(id)
    if (j?.state === 'working') return view(j)
    if (!j && state(id).elsewhere) throw new Error('another Swarm Studio is building this one; it shows here as it goes')
    if ([...jobs.values()].some(x => x.state === 'working')) throw new Error('another app is building; wait for it or stop it')
    const dir = dirOf(id)
    // A project brought in (docs/specs/45-intake.md) is never built over: a first build would write the Studio's
    // starter into its folder. One of plain files has no build for the engine to check (dyad/src/aba/headless_cli.ts
    // runGates: no package.json is "not an ABA app", a failed turn), so the crew cannot change it yet.
    const brought = intakeOf(events)
    if (brought && !brought.done) throw new Error('This project did not come in. Bring it in again from Projects.')
    if (brought?.fixed) throw new Error('This project was brought in as plain files. The crew cannot change those yet: it plays here, and its code is in Code.')
    if (brought && (input.fresh || !String(input.ask || '').trim())) throw new Error('This project was brought in: say what to change.')
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
        const games = [...new Map(events.filter(e => e.type === 'game:linked' && e.title && !e.intake).map(e => [e.game, { title: e.title, slug: gameSlug(e.title) }])).values()]
        prompt = sitePrompt(snap, ask, input.plan && typeof input.plan === 'object' ? input.plan : null, input.rewards === false ? [] : games)
      }
    } else {
      if (!ask) throw new Error('say what to change')
      // brought in: the Studio's own rules for its apps (keep the converted design, add a Nitro server) do not apply
      prompt = brought ? `This project was made outside this tool and brought in as it is. Read its files before changing anything, and keep its structure, tools and style.\n\nDo this: ${ask}\n\nFinish with a working build: \`npm run build\` must pass.` : `${kind === 'game' ? 'This is a browser game made from a spec in GAME_SPEC.md. Keep what works.' : KEEP}\n\nDo this: ${ask}\n\n${kind === 'game' ? '' : `${BACKEND}\n\n`}Finish with a working build: the typecheck and build must pass.`
    }
    j ||= { id, kind, steps: [], asks: [], proc: null, url: null, port: null }
    // a locked App kit's keys (names only), kept for every later serve of this app, restarts included
    if (Array.isArray(input.plan?.keys)) { j.keys = input.plan.keys.filter(n => typeof n === 'string').slice(0, 8); try { mkdirSync(join(runsDir, id), { recursive: true }); writeFileSync(join(runsDir, id, 'app-keys.json'), JSON.stringify(j.keys)) } catch {} }
    Object.assign(j, { kind, state: 'working', stage: 'starting', result: null, message: null, controller: new AbortController(), t: Date.now() })
    j.asks.push(ask || (kind === 'game' ? 'build the game' : 'make it a working app'))
    jobs.set(id, j)
    const m = modelFor('worker')
    send(id, 'app:start', { kind, ask: j.asks.at(-1), model: m, fresh, pid: process.pid, ...(resumeAt ? { resume: resumeAt } : {}) })
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
      // the slice it is on outlives the status line ("next step") and the 200 steps the view sends
      if (/^stage \d+ of \d+/.test(s.text || '')) j.slice_at = s.text.match(/^stage (\d+) of (\d+)/).slice(1).map(Number)
      // file writes go live only; the rest is kept with the run
      if (s.kind === 'write' || s.kind === 'think') broadcast({ type: 'app:step', t: item.t, run: id, step: item })
      else send(id, 'app:step', { step: item })
    }
    // a big game builds in stages from its saved spec; everything else is one engine call
    const spec = kind === 'game' && fresh ? events.findLast(e => e.type === 'game:spec')?.spec : null
    const big = !!spec && (isBig(spec) || input.big === true)
    j.big = big
    ;(async () => {
      // a busy or rate-limited model: on InferHub try the same model's other route,
      // then other fast coders; elsewhere wait a little and go again
      const chain = [m, ...(/inferhub/.test(provider('worker').baseUrl) ? APP_FALLBACKS.filter(x => x !== m) : [m, m])]
      let used = m
      const engineCall = async (text, turns) => {
        // each turn can be stopped on its own (redirect: the person changed direction), the job goes on
        j.turn = new AbortController()
        const signal = AbortSignal.any([j.controller.signal, j.turn.signal])
        for (let i = chain.indexOf(used); ; i++) {
          try {
            used = chain[i]
            return await runEngine({ workspace: dir, prompt: text, provider: provider('worker'), model: chain[i], turns, onStep: step, signal, appKeys: !brought })
          } catch (err) {
            if (i + 1 >= chain.length || signal.aborted || !BUSY.test(err.message)) throw err
            step({ kind: 'setup', text: `${chain[i]} is busy at the provider; going on with ${chain[i + 1]}`, ok: false })
            if (chain[i + 1] === chain[i]) await new Promise(r => setTimeout(r, 30000))
          }
        }
      }
      if (big) {
        if (await buildBig(j, id, dir, spec, engineCall, () => used, step, liveBrand(events), input, resumeAt) === 'paused') {
          Object.assign(j, { state: 'paused', stage: `slice ${j.slice.i + 1} of ${j.slice.n} built` })
          await j.radio?.stop()
          return send(id, 'app:paused', { slice: j.slice, result: j.result, url: j.url, ms: Date.now() - j.t })
        }
      } else {
        const result = await engineCall(prompt, input.turns || (input.plan ? 6 : 4))
        j.result = { ok: result.ok, gatesPassed: result.gatesPassed, turns: result.turns, commits: result.commits, files: result.files?.length || 0 }
        if (!result.ok) throw new Error(result.error || 'the engine could not finish the app')
        if (fill && kind !== 'game') try { j.result.standins = (await fill(id, dir, step)).filled } catch (err) { step({ kind: 'setup', text: `empty picture slots could not be filled: ${String(err.message || err).slice(0, 160)}`, ok: false }) }
        await serve(id, j, step)
        // a new game was told about the play checks in its prompt; an older one being edited was not
        if (kind === 'game') j.result.playtest = await playGame(j, dir, used, step, liveBrand(events), fresh ? events.findLast(e => e.type === 'game:spec')?.spec : null)
      }
      // Godot, Unity or Unreal asked for: the same game written as that engine's project too
      const target = kind === 'game' ? portTarget(input.target ? input : spec || events.findLast(e => e.type === 'game:spec')?.spec) : null
      if (target && !(target === 'godot' && isGodotFirst(dir))) j.result.port = await buildPort(dir, target, spec || events.findLast(e => e.type === 'game:spec')?.spec || {}, engineCall, step)
      Object.assign(j, { state: 'done', stage: 'ready' })
      await j.radio?.stop()
      send(id, 'app:done', { result: j.result, url: j.url, ms: Date.now() - j.t })
      // building stopped: the app is served built from here on, on the same address (spec 44)
      if (!j.gsrv) serveBuilt(id, j, step).catch(err => step({ kind: 'serve', text: `the app stays on its dev server: ${String(err.message || err).slice(0, 200)}`, ok: false }))
    })().catch(err => {
      Object.assign(j, { state: 'failed', message: String(err.message || err).slice(0, 400) })
      j.radio?.stop()
      send(id, 'app:failed', { message: j.message, result: j.result })
    })
    return view(j)
  }

  // A project brought in (docs/specs/45-intake.md): no engine and no build, only `work(step, signal)`, which puts
  // its files in app/. While it runs the run is working like any build (its card, the App view, Stop); it ends
  // as app:done or app:failed, so the rooms read it as they read a build.
  function bring(id, { kind, work }) {
    if (jobs.get(id)?.state === 'working') return view(jobs.get(id))
    const j = { id, kind, steps: [], asks: [], proc: null, url: null, port: null, state: 'working', stage: 'bringing it in', result: null, message: null, controller: new AbortController(), t: Date.now() }
    jobs.set(id, j)
    send(id, 'app:start', { kind, intake: true, pid: process.pid })
    const step = s => {
      const item = { ...s, t: Date.now() }
      j.steps.push(item)
      j.stage = s.text
      send(id, 'app:step', { step: item })
    }
    j.done = Promise.resolve().then(() => work(step, j.controller.signal)).then(() => {
      Object.assign(j, { state: 'done', stage: 'ready' })
      send(id, 'app:done', { intake: true, ms: Date.now() - j.t })
    }, err => {
      Object.assign(j, { state: 'failed', message: j.controller.signal.aborted ? 'stopped' : String(err.message || err).slice(0, 400) })
      send(id, 'app:failed', { message: j.message, intake: true })
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
    // the pictures asked for during an earlier run of this build come back with the first pass
    const before = askedBefore(dir)
    const items = [...artList(spec), ...sheetList(spec)]
    for (const it of before) if (!items.some(x => x.id === it.id)) items.push(it)
    if (paint && input.art !== false) {
      step({ kind: 'setup', text: `painting the game's art: ${items.length} pictures` })
      try { art = await paint(id, spec, items, dir, step, j.controller.signal, { idle: idleInput(input.idle) }) } catch (err) { step({ kind: 'setup', text: `the art could not be painted: ${String(err.message || err).slice(0, 160)}`, ok: false }) }
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
    // Godot asked for and on this machine: the game is a Godot project from the start
    const godot = godotFirst(input.target ? input : spec)
    if (godot) {
      const n = seedGodot(dir, spec)
      j.result.godot = true
      step({ kind: 'setup', text: `building it in Godot 4: ${n.length} pictures copied into the project` })
    } else if (/godot/i.test(String((input.target ? input : spec)?.target ?? spec?.answers?.target ?? spec?.engine ?? ''))) {
      // asked for, not here: say so instead of quietly building for the browser
      step({ kind: 'setup', text: 'Godot 4 was asked for but is not installed on this machine: building it for the browser instead', ok: false })
    }
    if (from) step({ kind: 'setup', text: `stages 1–${from} are built already: going on from stage ${from + 1}` })
    // art asked for mid-build (engine/artask.mjs): only with painting on and the image model not out of quota
    let askedN = before.length
    const canAsk = () => !!(paint && input.art !== false && !art.stopped && ASKS_PER_STAGE)
    const paintAsks = async i => {
      if (!canAsk()) return null
      const { items: asks, refused } = takeAsks(dir, spec, { have: art, asked: askedN })
      for (const r of refused) step({ kind: 'setup', text: `left out the asked picture "${r.what}": ${r.why}`, ok: false })
      if (!asks.length) return null
      askedN += asks.length
      step({ kind: 'setup', text: `stage ${i + 1} asked for ${asks.length} picture${asks.length === 1 ? '' : 's'}: ${asks.map(a => a.what).join(', ')}` })
      keepAsked(dir, asks)
      let more = []
      try { more = await paint(id, spec, asks, dir, step, j.controller.signal, { have: art }) } catch (err) { step({ kind: 'setup', text: `the asked pictures could not be painted: ${String(err.message || err).slice(0, 160)}`, ok: false }) }
      if (j.controller.signal.aborted) throw new Error('stopped')
      const stopped = more.stopped || art.stopped
      art = [...art, ...more]
      if (stopped) art.stopped = stopped
      j.result.asked = (j.result.asked || 0) + more.length
      if (!more.length) return null
      if (godot) syncGodotArt(dir)
      // the crew swaps its stand-ins for the new pictures while the slice is still fresh
      const brief = godot ? godotArtBrief(more, viewOf(spec)) : artBrief(more)
      try {
        return await engineCall(`The pictures you asked for in slice ${i + 1} are painted:\n${brief}\n\nUse them in place of the stand-ins you drew for them, in the game as it is now. Change nothing else.${godot ? ' Touch nothing outside ports/godot/.' : ' Finish with the typecheck and build passing.'}`, 2)
      } catch (err) {
        if (j.controller.signal.aborted) throw err
        step({ kind: 'setup', text: `the turn to use the asked pictures stopped: ${String(err.message || err).slice(0, 160)}`, ok: false })
        return null
      }
    }
    let failed = from ? 'the last build stopped partway through this stage: some of its changes may already be in the code (git status shows them). Finish them or redo them.' : '', last = null
    // the slices are the game's own, planned with its spec from the person's answers and picks
    const stages = stagesFor(spec)
    if (from >= stages.length) from = 0
    for (let i = from; i < stages.length; i++) {
      if (j.controller.signal.aborted) throw new Error('stopped')
      const st = stages[i], t = Date.now()
      step({ kind: 'setup', text: `stage ${i + 1} of ${stages.length}: ${st.name}` })
      // what the person said during the last stage goes into this one's prompt
      const heard = takeTold(j)
      // the engine itself can stop with an error (a helper that never reports): one more go at the stage, then on
      for (let go = 0; ; go++) {
        try { j.inStage = true; last = await engineCall(`${(godot ? godotStagePrompt : bigStagePrompt)(spec, i, { art, failed, note: [i === from ? input.note : '', ...heard].filter(Boolean).join('\n') })}${canAsk() ? `\n\n${askBrief({ godot })}` : ''}`, input.turns || st.turns); j.inStage = false; break } catch (err) {
          j.inStage = false
          if (j.controller.signal.aborted) throw err
          // the person confirmed a change that cannot wait: this stage again, with their words, from where it got to
          if (j.redirected) {
            j.redirected = false
            heard.push(...takeTold(j))
            failed = 'The person stopped your last turn to change direction: some of its changes may already be in the code (git status shows them). Do what they said now, then finish this stage.'
            step({ kind: 'setup', text: `stage ${i + 1} again, with the change you sent` })
            go = -1
            continue
          }
          step({ kind: 'setup', text: `stage ${i + 1} stopped: ${String(err.message || err).slice(0, 160)}`, ok: false })
          if (go >= 1) { last = { ok: false, error: String(err.message || err) }; break }
          failed = 'the last try at this stage stopped partway: some of its changes may already be in the code (git status shows them). Finish them or redo them.'
        }
      }
      // the pictures this slice asked for: painted now, then one short turn to use them
      const asked = await paintAsks(i)
      if (asked) last = { ...asked, turns: (last?.turns || 0) + (asked.turns || 0), commits: (last?.commits || 0) + (asked.commits || 0) }
      if (godot) {
        const g = await godotStage(id, j, dir, engineCall, step)
        last = { ...last, ok: g.ok, error: g.error }
        failed = g.ok ? '' : `Godot reported problems at the end of the last stage: ${String(g.error).slice(0, 600)}. Fix them before anything else.`
      } else failed = last.ok ? '' : `the typecheck or build failed at the end of the last stage${last.error ? ` (${String(last.error).slice(0, 300)})` : ''}. Make it pass before anything else.`
      j.result.turns += last.turns || 0
      j.result.commits += last.commits || 0
      j.result.files = Math.max(j.result.files, last.files?.length || 0)
      if (!godot) await serve(id, j, step)
      const play = await playGame(j, dir, model(), step, brand, spec)
      j.result.stages.push({ id: st.id, name: st.name, ok: !!last.ok, gatesPassed: last.gatesPassed, turns: last.turns, playtest: play, ms: Date.now() - t })
      // each slice carries the bots' filmed play test, so the person sees it before the next one
      send(id, 'app:stage', { stage: `stage ${i + 1} of ${stages.length} done: ${st.name}`, big: { i, n: stages.length, name: st.name, ok: !!last.ok, play: !!play?.ok, ...(play?.clip ? { clip: play.clip } : {}), ...(godot ? { godot: true } : {}) } })
      // guided (the default): stop after each slice but the last and ask in the left chat; the
      // person's answer starts the next slice (a resume) with their words in its prompt
      if (input.guided !== false && i < stages.length - 1) {
        const talk = sliceAsk(spec, i)
        // what the chat shows: the bots' filmed play, the game's still (img/snap.jpg) and the live game
        j.slice = { i, n: stages.length, name: st.name, shot: `/img/${id}/snap.jpg?v=${Date.now()}`, ok: !!last.ok, play: !!play?.ok, url: j.url || null, ...(play?.clip ? { clip: play.clip } : {}), ...talk }
        j.result.paused = j.slice
        return 'paused'
      }
    }
    if (!last?.ok) {
      step({ kind: 'test', text: 'the last stage did not pass its build: one fix turn', ok: false })
      if (godot) {
        await engineCall(`This is a big 2D game in Godot 4 in ports/godot/, made from GAME_SPEC.md; keep what works. ${failed}\n\nFinish with the project opening in Godot with no errors. Touch nothing outside ports/godot/.`, 3)
        const g = await godotStage(id, j, dir, null, step)
        last = { ...last, ok: g.ok, error: g.error }
      } else last = await engineCall(`This is a big browser game made from GAME_SPEC.md; keep what works. ${failed}\n\nFinish with a working build: the typecheck and build must pass.`, 3)
    }
    Object.assign(j.result, { ok: !!last.ok, gatesPassed: last.gatesPassed, playtest: j.result.stages.at(-1)?.playtest })
    if (!last.ok) throw new Error(last.error || 'the engine could not finish the game')
  }

  // A Godot-first stage's checks: Godot opens the project headless (its errors get one
  // fix turn), then the Web export is served for the play test. → { ok, error }
  async function godotStage(id, j, dir, engineCall, step) {
    step({ kind: 'test', text: 'opening the project in Godot' })
    let opened = await checkGodot(dir)
    if (opened && !opened.ok && engineCall) {
      step({ kind: 'test', text: `Godot reports ${opened.errors.length} error${opened.errors.length === 1 ? '' : 's'}: fixing`, ok: false })
      await engineCall(`Godot 4 opened ports/godot/ headless and reported these errors:\n${opened.errors.map(e => `- ${e}`).join('\n')}\n\nFix them in ports/godot/ (GDScript 4 syntax, node paths, resource paths). Touch nothing outside ports/godot/.`, 2)
      opened = await checkGodot(dir)
    }
    if (opened) step({ kind: 'test', text: opened.ok ? 'Godot opens and runs the project with no errors' : `Godot still reports: ${opened.errors[0]}`, ok: opened.ok })
    step({ kind: 'test', text: 'exporting the game to the web' })
    const web = await exportWeb(dir)
    step({ kind: 'test', text: web.ok ? 'web export ready' : `the web export failed: ${web.error}`, ok: web.ok })
    if (web.ok) await serveGodot(id, j)
    const ok = !!opened?.ok && web.ok
    return { ok, error: ok ? '' : [...(opened?.errors || []).slice(0, 12), web.ok ? '' : `web export: ${web.error}`].filter(Boolean).join('\n') }
  }

  // The Godot export, served as files (Godot reads its .pck and .wasm from the same place)
  async function serveGodot(id, j) {
    j.godot = true
    if (j.gsrv) return
    await unserve(id, j)
    j.port = j.port && await portFree(j.port) ? j.port : await freePort()
    j.gsrv = await serveStatic(webBuild(dirOf(id)), j.port)
    j.url = j.gsrv.url
    send(id, 'app:ready', { url: j.url })
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
  // spec: the game's spec, when its builder was told about the play checks (engine/playcheck.mjs):
  // each control it names is held and the game's state read, enemies are watched, companions counted
  async function playGame(j, dir, model, step, brand, spec = null) {
    const checks = spec ? checklist(spec) : []
    const dodge = () => (spec ? dodgeProblem(testDodges(dir, { godot: !!j.godot })) : '')
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
    let t = await playtest(j.url, { shot, clip, secure: !!j.godot, checks })
    let dodged = dodge()
    if (dodged) step({ kind: 'test', text: 'the game plays differently when it is being tested', ok: false })
    const film = t.clip ? { clip: `/img/${j.id}/playtest-${n}.webm`, keys: t.keys || [] } : {}
    if (t.skipped) step({ kind: 'test', text: `play test skipped: ${t.skipped}`, ok: false })
    else if (t.ok) step({ kind: 'test', text: `play test passed: ${t.checks?.length ? checkLine(t.checks) : `still playing after ${t.seconds.toFixed(1)} s`}`, ...film })
    else step({ kind: 'test', text: `play test failed: ${t.checks?.some(c => c.ok === false) ? checkLine(t.checks) : t.problem.split('. ')[0]}`, ok: false, ...film })
    const withClip = o => ({ ...o, ...(film.clip ? { clip: film.clip } : {}), ...(t.checks ? { checks: t.checks } : {}) })
    if (!links && !dodged && t.ok) return t.skipped ? { skipped: t.skipped } : withClip({ ok: true, seconds: t.seconds })
    const problems = [t.ok ? '' : `A play test of this game failed. ${t.problem}`, dodged, links || ''].filter(Boolean).join('\n\n')
    try {
      const finish = j.godot ? 'The game is the Godot 4 project in ports/godot/ (its Web export is what was played); fix it there and touch nothing outside ports/godot/. Finish with the project opening in Godot with no errors.' : 'Finish with a working build: the typecheck and build must pass.'
      await runEngine({ workspace: dir, prompt: `${problems}\n\nKeep everything else as it is. ${finish}`, provider: provider('worker'), model, turns: 2, onStep: step, signal: j.controller.signal, appKeys: !intakeOf(readEvents(j.id) || []) })
      if (j.godot) await exportWeb(dir)
    } catch (err) {
      step({ kind: 'test', text: `the fix turn stopped: ${String(err.message).slice(0, 160)}`, ok: false })
      return withClip({ ok: false, problem: problems })
    }
    await new Promise(r => setTimeout(r, 2500))
    links = linkProblem()
    // played again the same way (a Godot export only starts in a secure frame)
    if (!t.ok || dodged) t = await playtest(j.url, { secure: !!j.godot, checks })
    dodged = dodge()
    const ok = !links && !dodged && t.ok
    step({ kind: 'test', text: ok ? `the game passes its checks after the fix${t.checks?.length ? `: ${checkLine(t.checks)}` : ''}` : `still wrong after the fix: ${t.checks?.some(c => c.ok === false) ? checkLine(t.checks) : (links || dodged || t.problem || '').split('. ')[0]}`, ok })
    return withClip(ok ? { ok: true, fixed: true, seconds: t.seconds } : { ok: false, problem: [t.ok ? '' : t.problem, dodged, links || ''].filter(Boolean).join(' ') })
  }

  // A dev server for the app (Vite, plus Nitro's routes when the app has them).
  // Kept running between turns: Vite picks up the engine's next edits itself.
  // Vite does not pick up a new plugin or package (a turn that adds Nitro, say):
  // when these files change the dev server starts over, on the same port.
  // What an app's own processes are given (its dev server, its build, its built server): its database, a Stripe
  // test key and its kit's keys (engine/proc.mjs appEnv). A project brought in gets none of them: its vite.config
  // and its server are code from outside, running outside the engine's egress guard.
  const appEnvFor = (id, j) => (intakeOf(readEvents(id) || []) ? {} : appEnv(process.env, keysOf(id, j)))
  // a project brought in is installed without its packages' own scripts: code from outside runs only as the
  // person's build and the app itself, never as an install hook
  const installArgs = id => ['install', '--prefer-offline', ...(intakeOf(readEvents(id) || []) ? ['--ignore-scripts'] : [])]
  const keysOf = (id, j) => { if (!j.keys) { try { j.keys = JSON.parse(readFileSync(join(runsDir, id, 'app-keys.json'), 'utf8')) } catch { j.keys = [] } } return j.keys }
  async function serve(id, j, step = () => {}) {
    const dir = dirOf(id)
    const sig = serveSig(dir)
    if (j.mode === 'dev' && j.proc && j.proc.exitCode === null) {
      if (j.sig === sig) return pool.seen(id)
      step({ kind: 'serve', text: 'the app\'s setup changed: restarting it' })
    }
    // the dev server, the app built, or none: whatever serves it now gives way
    await unserve(id, j)
    step({ kind: 'serve', text: 'installing the app\'s packages' })
    const inst = await sh('pnpm', installArgs(id), dir)
    if (!inst.ok) throw new Error(`pnpm install failed: ${inst.out.slice(-300)}`)
    j.port = j.port && await portFree(j.port) ? j.port : await freePort()
    j.sig = sig
    await pool.admit(id)
    step({ kind: 'serve', text: `starting the app on port ${j.port}` })
    // --cors: Hermes shows the Studio in a sandboxed frame (origin null), and the app's module scripts need CORS to load there
    // vite's own script under this Node: .bin/vite is a shell shim (vite.cmd on Windows)
    const p = startProc(process.execPath, [join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(j.port), '--strictPort', '--host', '127.0.0.1', '--cors'], { cwd: dir, stdout: 'pipe', stderr: 'pipe', env: { BROWSER: 'none', ...appEnvFor(id, j) } })
    j.url = await answers(id, j, p, `http://127.0.0.1:${j.port}/`, 'dev')
    send(id, 'app:ready', { url: j.url })
  }

  // A process that serves the app: kept as j.proc, waited for until its address answers (30 s)
  async function answers(id, j, p, url, mode) {
    Object.assign(j, { proc: p, mode })
    let log = ''
    p.stdout?.on('data', b => { log = (log + b).slice(-4000) })
    p.stderr?.on('data', b => { log = (log + b).slice(-4000) })
    // it stopped by itself (a crash, a kill from outside): nothing serves the app now
    p.once('exit', () => { if (j.proc === p) { Object.assign(j, { proc: null, url: null, mode: null }); pool.gone(id) } })
    for (let i = 0; i < 60; i++) {
      if (p.exitCode !== null && p.exitCode !== undefined) throw new Error(`the app stopped: ${log.slice(-300)}`)
      if (await fetch(url, { signal: AbortSignal.timeout(2000) }).then(r => r.status < 500).catch(() => false)) return url
      await new Promise(r => setTimeout(r, 500))
    }
    await stopTree(p)
    throw new Error('the app did not answer in 30 s')
  }

  // Whatever serves the app now stops: its dev server or built server with all their children, its files, its
  // front; the port is kept, so the next start has the same address
  async function unserve(id, j) {
    const p = j.proc, files = j.files, front = j.front
    Object.assign(j, { proc: null, files: null, front: null, url: j.gsrv ? j.url : null, mode: null })
    pool.gone(id)
    if (front) await front.close()
    if (files) await files.close()
    if (p) await stopTree(p)
  }

  // Nobody has looked for a while, or another app needs the room: its server stops (spec 44). The App view hears
  // it and opens the app again, served built, when someone comes back.
  async function park(id, why) {
    const j = jobs.get(id)
    if (!j || j.state === 'working') return
    await unserve(id, j)
    broadcast({ type: 'app:parked', t: Date.now(), run: id, why })
  }

  // A finished app, served built (spec 44): the app's build when the app changed since the last one, then dist/
  // as files from this process (no process of its own), or for an app with server routes its built Nitro server
  // alone behind a CORS front. Editing or building again starts the dev server (serve).
  async function serveBuilt(id, j, step = () => {}) {
    const dir = dirOf(id), server = hasServer(dir), sig = sourceSig(dir)
    const out = server ? join(dir, '.output', 'server', 'index.mjs') : join(dir, 'dist', 'index.html')
    let stamp = null
    try { stamp = JSON.parse(readFileSync(join(dir, '.swarm-built.json'), 'utf8')) } catch {}
    if (stamp?.sig !== sig || !existsSync(out)) {
      if (!existsSync(join(dir, 'node_modules', 'vite'))) {
        step({ kind: 'serve', text: 'installing the app\'s packages' })
        const inst = await sh('pnpm', installArgs(id), dir)
        if (!inst.ok) throw new Error(`pnpm install failed: ${inst.out.slice(-300)}`)
      }
      step({ kind: 'serve', text: 'building the app to serve it' })
      const b = await startProc(process.execPath, [join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: dir, buffer: true, all: true, timeout: 300000, env: { CI: '1', ...appEnvFor(id, j) } })
      if (b.exitCode !== 0 || !existsSync(out)) throw new Error(`the app's build failed: ${String(b.all || '').slice(-300)}`)
      writeFileSync(join(dir, '.swarm-built.json'), JSON.stringify({ sig, server, t: Date.now() }))
    }
    await unserve(id, j)
    j.port = j.port && await portFree(j.port) ? j.port : await freePort()
    if (server) {
      await pool.admit(id)
      const inner = await freePort()
      const p = startProc(process.execPath, [out], { cwd: dir, stdout: 'pipe', stderr: 'pipe', env: { PORT: String(inner), HOST: '127.0.0.1', NITRO_PORT: String(inner), NITRO_HOST: '127.0.0.1', NODE_ENV: 'production', ...appEnvFor(id, j) } })
      await answers(id, j, p, `http://127.0.0.1:${inner}/`, 'built')
      j.front = await corsFront(j.port, inner)
      j.url = j.front.url
    } else {
      // files from this process: no process to stop, so not one of the maxApps
      j.files = await serveStatic(join(dir, 'dist'), j.port, { spa: true })
      Object.assign(j, { mode: 'files', url: j.files.url })
    }
    send(id, 'app:ready', { url: j.url, built: true })
  }

  // a viewer's heartbeat (the App view, every 30 s while it shows the app): the app's server is kept
  function seen(id) {
    const j = jobs.get(id)
    if (j?.url) pool.seen(id)
    return { url: j?.url || null, served: j?.mode || null }
  }

  // Plain files (a project brought in): app/ as files from this process, opened on its page
  async function serveFiles(id, j, page = '') {
    await unserve(id, j)
    j.port = j.port && await portFree(j.port) ? j.port : await freePort()
    j.files = await serveStatic(dirOf(id), j.port)
    Object.assign(j, { mode: 'files', url: `${j.files.url}${page}`, state: 'done' })
    send(id, 'app:ready', { url: j.url, built: true })
  }

  async function open(id, input = {}) {
    const j = jobs.get(id)
    if (j?.url && j.gsrv) return view(j)
    // served built, or its dev server still up and current: kept
    if (j?.url && (j.mode === 'files' || j.mode === 'built')) { pool.seen(id); return view(j) }
    if (j?.url && j.mode === 'dev' && j.proc?.exitCode === null && j.sig === serveSig(dirOf(id))) { pool.seen(id); return view(j) }
    const brought = intakeOf(readEvents(id) || [])
    if (!existsSync(join(dirOf(id), 'package.json')) && !brought?.done) throw new Error('no app yet')
    // a Vite project brought in is installed and built only on the person's own press (its packages and its
    // build are code from outside): `run: true`, kept as intake:run
    if (brought?.done && brought.shape === 'vite' && !brought.ran) {
      if (input.run !== true) throw new Error('press Install and run first')
      send(id, 'intake:run', {})
    }
    // a big game waiting after a slice stays waiting: opening it to play must not end the wait (it read as done,
    // and the next slice could no longer be asked for)
    const was = j ? null : state(id)
    const k = j || { id, kind: was.kind, steps: was.steps || [], asks: [], state: was.state === 'paused' ? 'paused' : 'done', ...(was.state === 'paused' && was.slice ? { slice: was.slice } : {}) }
    jobs.set(id, k)
    // plain files brought in: served as they are from this process, on the page that was found
    if (brought?.done && brought.shape === 'static') { await serveFiles(id, k, brought.page); return view(k) }
    // a Godot-first game plays from its Web export; one being built, from its dev server; a finished one, built
    if (isGodotFirst(dirOf(id)) && existsSync(join(webBuild(dirOf(id)), 'index.html'))) await serveGodot(id, k)
    else if (k.state === 'working') await serve(id, k)
    else await serveBuilt(id, k)
    k.state = k.state === 'working' || k.state === 'paused' ? k.state : 'done'
    return view(k)
  }

  // Words from the person while a build runs: kept with the run, and handed to the crew at the
  // start of the next stage (or the next slice), since a turn in flight cannot take new words.
  function tell(id, text) {
    const j = jobs.get(id)
    const t = String(text || '').trim().slice(0, 1200)
    if (!t || j?.state !== 'working') return { queued: false, state: j?.state || state(id).state }
    ;(j.told ||= []).push(t)
    send(id, 'app:told', { text: t })
    return { queued: true, state: j.state, waiting: j.told.length }
  }
  // A confirmed change that cannot wait: the builder's turn in flight stops, and the stage starts
  // again at once with the words (a big game's slices only; anywhere else it waits for the next stage).
  function redirect(id, text) {
    const j = jobs.get(id)
    const told = tell(id, text)
    if (!told.queued) return told
    if (!j.big || !j.inStage || !j.turn || j.turn.signal.aborted) return { ...told, now: false }
    j.redirected = true
    j.turn.abort()
    send(id, 'app:redirect', { text: String(text).trim().slice(0, 1200) })
    return { ...told, now: true }
  }
  const takeTold = j => (j.told || []).splice(0).map(t => `The person said while you were building: "${t}"`)

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
    // a description and a share picture, so a shared link shows a card (engine/seo.mjs)
    const share = shareMeta(id, project || name, kind)
    // the stages and Vercel's build log are saved with the run, so the Auto show's deploy shot replays too
    const r = await publishVercel({ dir, name, creds, dataDir, build: true, env, rebase: base => { try { shareApp(dir, { ...share, base }) } catch {} },
      onStage: stage => send(id, 'app:stage', { stage: `deploy: ${stage}` }),
      onLog: lines => send(id, 'app:stage', { stage: 'deploy: building', log: lines.slice(-12) }) })
    send(id, 'app:deployed', { url: r.url, project: r.repo, pending: !!r.pending })
    const j = jobs.get(id)
    if (j) j.deployed = r.url
    return { url: r.url, project: r.repo, pending: !!r.pending }
  }

  // what a shared link to the app or game says: the site's home description when it came from
  // one, else the brief's first sentence; its picture: the game's title art, else the first picture
  function shareMeta(id, name, kind) {
    const events = readEvents(id) || []
    const start = events.find(e => e.type === 'run:start') || {}
    const home = events.find(e => e.type === 'page')?.id
    const desc = seoFromEvents(events).get(home)?.description || String(start.brief || '').split('\n')[0].split(/(?<=[.!?])\s/)[0]
    const img = join(runsDir, id, 'img')
    let files = []
    try { files = readdirSync(img) } catch {}
    const pick = files.find(f => /^game-title\.(webp|png|jpe?g)$/.test(f)) || files.find(f => /^\d{1,3}\.(png|jpe?g|webp)$/.test(f))
    const theme = events.findLast(e => e.type === 'theme') || null
    return { name, description: desc, picture: pick ? join(img, pick) : null, kind, theme }
  }

  // the run's project name: the projects index, else the brief's brand (never a screen's title)
  function projectNameOf(id, named = nameFor(id)) {
    if (named?.name && !isScreenName(named.name)) return named.name
    const start = (readEvents(id) || []).find(e => e.type === 'run:start')
    if (!start) return ''
    const n = projectName({ brief: start.brief, title: start.title })
    return n === 'Swarm build' ? '' : n
  }

  // the server is stopping: every app's server and its children go with it
  function close() {
    clearInterval(sweeper)
    return Promise.all([...jobs.entries()].map(([id, j]) => { j.controller?.abort(); return unserve(id, j) }))
  }
  // a build is running somewhere (the server's idle exit waits for it)
  const busy = () => [...jobs.values()].some(j => j.state === 'working')

  return { start, bring, state, stop, tell, redirect, open, seen, files, deploy, close, busy, dirOf, jobs, pool }
}

// "can I see it", "show me the pictures": the person wants to look, not to change anything
const SEE = /\b(screen ?shots?|pictures?|pics?|images?|art|sprites?|clips?|videos?|previews?|footage|show me|let me see|can i see|look(s)? like)\b/i
export const wantsToSee = text => SEE.test(String(text || ''))
// What there is to look at for a build, newest first: the play test clips (from the slices done
// and the steps) and the painted pictures in the run's img folder.
// files: [{ name, mtime }] of the run's img folder; slices: app:stage bigs; steps: the job's steps
const PIC = /^game-(?!.*-(?:raw|check|peek)\.)[a-z0-9-]{1,48}\.(png|webp|jpe?g)$/
export function buildMedia({ id, files = [], slices = [], steps = [] } = {}) {
  const clips = [
    ...steps.filter(s => s?.clip).map(s => ({ src: s.clip, t: s.t || 0, name: '' })),
    ...slices.filter(b => b?.clip).map(b => ({ src: b.clip, t: b.t || 0, name: b.name ? `slice ${(b.i ?? 0) + 1}, ${b.name}` : '' }))
  ].sort((x, y) => y.t - x.t)
  const pics = files.filter(f => PIC.test(f.name)).sort((x, y) => y.mtime - x.mtime)
    .map(f => ({ src: `/img/${id}/${f.name}`, name: f.name.replace(/^game-/, '').replace(/\.\w+$/, '').replace(/-/g, ' ') }))
  return { clip: clips[0] || null, clips: clips.length, clipList: clips.slice(0, 4), pics: pics.slice(0, 4), picCount: pics.length, picList: pics.slice(0, 24) }
}
// the line Hermia reads, so she never says there is nothing to see when there is
export function mediaNotes(m, attached) {
  if (!m.clip && !m.picCount) return 'Nothing has been painted or filmed yet, so there is nothing to show.'
  const have = [m.clips ? `${m.clips} play test clip${m.clips > 1 ? 's' : ''}` : '', m.picCount ? `${m.picCount} painted picture${m.picCount > 1 ? 's' : ''} (newest: ${m.pics.map(p => p.name).join(', ')})` : ''].filter(Boolean).join(' and ')
  return `The build has ${have}. ${attached ? 'The newest clip and pictures are shown right under your answer: say so in a few words and say what they show; never say there is nothing to see.' : 'If they ask to see something, tell them you can show it.'}`
}
