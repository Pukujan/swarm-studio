// Auto mode: one prompt runs the whole studio, start to finish, on one timeline:
// the site's design, a review pass, a promo video, the working app, a 🎮 Play
// page with mini games, a $2 credit pack the games spend (a clearly labelled
// demo checkout with a fake card, or Stripe test mode when a test key is set),
// its data in Supabase (when keys are set), and a deploy to Vercel. Whatever
// app exists when a later step fails still deploys.
//
// The server passes in what it already has (the swarm, the video job, the App
// tab's jobs, the publisher), so this file only orders the steps and keeps score.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const GAMES_ASK = `Add a 🎮 Play page at /play, linked in the nav, with three small original mini games set in this brand's world and wearing the site's theme (its CSS variables and fonts). Each game is a canvas game in its own module under src/games/, works with keyboard and touch, and one round takes under a minute:
1. A tiny roguelike: one room at a time, move, dodge and hit; between rooms pick one of two upgrades; three rooms, then a boss.
2. A reflex game: catch the brand's own things (its products, dishes, tickets, whatever the site sells) and dodge the hazards, faster and faster.
3. A quick memory or puzzle game with the brand's things.
Each game shows its score, keeps a best score in localStorage, and has win and lose screens with Play again. After a round the player can save a score with a name: POST /api/scores { game, name, score }; the page shows the top 10 per game from GET /api/scores. Sounds are synthesised with the Web Audio API after the first click or key. Draw everything in code; original names only, nothing from existing games. Keep the rest of the app as it is.`

export const supabaseAsk = app => `Keep the app's data in Supabase. Add @supabase/supabase-js with add_dependency. In the server store module, create one client from process.env.SUPABASE_URL and the key process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY (server code only, never in client code). Every record goes in the existing table swarm_records (columns: id uuid default, app text, kind text, data jsonb, created_at timestamptz default now()) with app = '${app}' and kind = the collection (orders, signups, scores…); data holds the record. Reads filter by app and kind, newest first. Keep every API route, type and response shape the same. When the address or both keys are missing, fall back to the in-memory store so local development still works.`

// The table Supabase needs once, shown to the person when it is missing.
export const SUPABASE_SQL = `create table swarm_records (id uuid primary key default gen_random_uuid(), app text not null, kind text not null, data jsonb not null, created_at timestamptz not null default now()); create index on swarm_records (app, kind, created_at desc);`

// Keys from the server's own environment, or from ~/.hermes/.env (where Hermes
// keeps the others).
function keys(want) {
  const out = Object.fromEntries(want.filter(k => process.env[k]).map(k => [k, process.env[k]]))
  const file = join(homedir(), '.hermes', '.env')
  if (Object.keys(out).length < want.length && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)$/.exec(line)
      if (m && want.includes(m[1]) && !out[m[1]]) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return want.every(k => out[k]) ? out : null
}
export const supabaseEnv = () => keys(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
// Made through the person's Supabase sign-in, the app holds a publishable key, so the table lets
// that role in. The key lives only in the app's server environment, never in the browser.
export const SUPABASE_CONNECTOR_SQL = `${SUPABASE_SQL} alter table swarm_records enable row level security; create policy swarm_app on swarm_records for all to anon using (true) with check (true);`
// Test mode only: a live key takes real money, and that is the person's call.
export function stripeEnv() {
  const k = keys(['STRIPE_SECRET_KEY'])
  return k && /^(sk|rk)_test_/.test(k.STRIPE_SECRET_KEY) ? k : null
}

export const SHOP_ASK = `Add credits the games spend, and a $2 credit pack with a demo checkout.
- Every visitor has a credit balance (starts at 3), shown in the nav and on /play. Playing a round of any mini game costs 1 credit; with none left, Play shows "Get credits".
- A /credits page (linked from /play) sells one pack: $2.00 for 20 credits. "Buy" opens a checkout step in the site's own theme (not any payment company's look or logo) with a clear banner on top: "DEMO · fake payment, no money moves". It has card number, expiry, CVC and name fields, prefilled with the test card 4242 4242 4242 4242, 12/34, 123, "Demo Player"; the number is checked with the Luhn rule and formatted as typed.
- Pay calls POST /api/checkout { visitor, card last 4 digits only }. With no STRIPE_SECRET_KEY it is demo mode: wait about a second, then record a fake transaction { id: "demo_txn_" + random, amount: 200, currency: "usd", last4, status: "succeeded", demo: true, time } in the store, add 20 credits and return it. Never send or store the full card number.
- When process.env.STRIPE_SECRET_KEY starts with sk_test_, /api/checkout instead creates a Stripe Checkout Session in payment mode (add_dependency stripe; server code only; price_data usd 200 "20 credits"; success_url /credits?session_id={CHECKOUT_SESSION_ID}) and the client redirects to it; GET /api/checkout/verify?session_id=… adds the credits once when it is paid. Any other key is ignored (demo mode).
- After paying, show a receipt in the theme: transaction id, amount, card •••• last4, the new balance, and the DEMO label when it was fake.
- Balances and transactions live in the store, keyed by a visitor id kept in localStorage and sent with each request. /admin lists the transactions (marked demo) and the total next to the other records.
Keep the rest of the app as it is.`

const STEPS = [
  ['design', '🎨 Design the site'],
  ['review', '🔎 Review every page'],
  ['video', '🎬 Cut the promo video'],
  ['app', '⚙️ Build the working app'],
  ['games', '🎮 Add the mini games'],
  ['shop', '💳 Sell a $2 credit pack (demo checkout)'],
  ['data', '🗄️ Keep the data in Supabase'],
  ['deploy', '🚀 Deploy to Vercel']
]
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function autoJob(d) {
  // d: { runsDir, startRun, current, readEvents, record, broadcast, clients, makeVideo, videos, apps, credentials, dataDir, publishVercel }
  let job = null

  const view = () => job && { state: job.state, run: job.run, prompt: job.prompt, t0: job.t0, ms: (job.end || Date.now()) - job.t0, url: job.url, message: job.message, steps: job.steps.map(s => ({ ...s })) }
  const push = (save = true) => {
    const v = view()
    if (save && job.run) d.record(job.run, { type: 'auto', t: Date.now(), run: job.run, ...v })
    else d.broadcast({ type: 'auto', t: Date.now(), ...v })
  }
  const step = id => job.steps.find(s => s.id === id)
  const set = (id, state, note) => {
    const s = step(id)
    if (state === 'working') s.t0 = Date.now()
    if (state !== 'working' && s.t0) s.ms = Date.now() - s.t0
    Object.assign(s, { state }, note !== undefined ? { note: String(note).slice(0, 300) } : {})
    push()
  }

  // wait for a step, checking once a second; Stop and a time limit end it
  async function until(done, { ms, stop }) {
    const end = Date.now() + ms
    for (;;) {
      if (job.stopped) { stop?.(); throw new Error('stopped') }
      const r = await done()
      if (r) return r
      if (Date.now() > end) { stop?.(); throw new Error('took too long') }
      await sleep(1000)
    }
  }

  async function design() {
    set('design', 'working', 'the planner is writing the sitemap')
    const run = d.startRun({ brief: job.prompt })
    job.run = run.id
    push()
    await until(() => {
      const err = run.events.find(e => e.type === 'error')
      if (err) throw new Error(err.message)
      if (d.current() !== run) throw new Error('another build replaced it')
      return run.done
    }, { ms: 15 * 60000, stop: () => run.controller.abort() })
    // the pictures paint after the sections land: wait for the queue to empty
    await until(() => {
      const ev = d.readEvents(job.run) || []
      const key = e => `${e.page}/${e.layer}|${e.gen}`
      const open = new Set()
      for (const e of ev) {
        if (e.type === 'image:queued') open.add(key(e))
        if (e.type === 'image' || e.type === 'image:failed') open.delete(key(e))
      }
      return open.size === 0
    }, { ms: 5 * 60000 }).catch(err => { if (job.stopped) throw err })
    const pages = (d.readEvents(job.run) || []).filter(e => e.type === 'layer:done').length
    set('design', 'done', `${pages} sections built`)
  }

  async function review() {
    if (!d.clients.size) return set('review', 'skipped', 'no canvas open to photograph the pages')
    set('review', 'working', 'the reviewer is looking at each page')
    d.broadcast({ type: 'cmd', op: 'review', run: job.run })
    const t = Date.now()
    await until(() => {
      const ev = d.readEvents(job.run) || []
      const starts = ev.filter(e => e.type === 'review:start').length, dones = ev.filter(e => e.type === 'review:done').length
      if (!starts) { if (Date.now() - t > 90000) throw new Error('the canvas did not start the review'); return false }
      // done once every page has its verdict and the fixes have gone quiet
      return dones >= starts && Date.now() - ev.at(-1).t > 25000
    }, { ms: 12 * 60000 })
    const ev = d.readEvents(job.run) || []
    set('review', 'done', `${ev.filter(e => e.type === 'review:done').length} pages reviewed, ${ev.filter(e => e.type === 'review:issue').length} fixes`)
  }

  async function video() {
    set('video', 'working', 'writing the storyboard from your prompt')
    await d.makeVideo(job.run, { idea: job.prompt })
    const v = await until(() => { const j = d.videos.get(job.run); return j && j.state !== 'working' && j }, { ms: 20 * 60000 })
    if (v.state !== 'done') throw new Error(v.message || 'the video failed')
    set('video', 'done', `${Math.round(v.seconds || 0)} s promo`)
  }

  async function appTurn(id, input, note, turns) {
    const a = await d.apps()
    set(id, 'working', note)
    await a.start(job.run, { ...input, ...(turns ? { turns } : {}) })
    const s = await until(() => { const st = a.state(job.run); return st.state !== 'working' && st }, { ms: 50 * 60000, stop: () => a.stop(job.run) })
    if (s.state !== 'done') throw new Error(s.message || 'the build failed')
    return s
  }

  async function data() {
    let env = supabaseEnv()
    // no keys: the person's Supabase sign-in through Hermes (🔌 Connect on the canvas)
    if (!env && d.connectors) env = await d.connectors.supabaseProject({ sql: SUPABASE_CONNECTOR_SQL, say: note => set('data', 'working', note) })
    if (!env) return set('data', 'skipped', 'connect Supabase (🔌 in the Auto window) or add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to ~/.hermes/.env to keep the data in Supabase')
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
    const probe = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/swarm_records?select=id&limit=1`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) }).catch(err => ({ ok: false, status: String(err.message || err) }))
    if (!probe.ok) return set('data', 'skipped', `Supabase has no swarm_records table yet (${probe.status}); run this once in its SQL editor: ${SUPABASE_SQL}`)
    // the app's own dev server reads them, and so does the deploy
    Object.assign(process.env, env)
    await appTurn('data', { ask: supabaseAsk(appName()) }, 'moving the store to Supabase')
    job.env = { ...job.env, ...env }
    set('data', 'done', 'orders, sign-ups and scores save to Supabase')
  }
  async function shop() {
    const env = stripeEnv()
    if (env) Object.assign(process.env, env)
    await appTurn('shop', { ask: SHOP_ASK }, 'credits, a /credits page and a demo checkout')
    job.env = { ...job.env, ...(env || {}) }
    set('shop', 'done', env ? '/credits: 20 credits for $2, Stripe test mode' : '/credits: 20 credits for $2, demo checkout with a fake card')
  }
  const appName = () => { try { return JSON.parse(readFileSync(join(d.runsDir, job.run, 'app', 'package.json'), 'utf8')).name || job.run } catch { return job.run } }

  async function deploy() {
    const a = await d.apps()
    if (!a.state(job.run).hasApp) return set('deploy', 'skipped', 'no app to deploy')
    const creds = await d.credentials(d.dataDir, 'vercel')
    if (!creds) return set('deploy', 'failed', 'connect Vercel first: 🚀 Publish → Website → Connect')
    set('deploy', 'working', 'uploading and building on Vercel')
    const r = await a.deploy(job.run, { creds, dataDir: d.dataDir, publishVercel: d.publishVercel, env: job.env })
    job.url = r.url
    set('deploy', 'done', r.pending ? `${r.url} (still waking up)` : r.url)
  }

  async function go() {
    const plan = [
      ['design', design, true], ['review', review, false], ['video', video, false],
      ['app', () => appTurn('app', {}, 'the app engine is wiring forms, routes and /admin').then(s => set('app', 'done', `${s.result?.files || 0} files, gates ${s.result?.gatesPassed ? 'passed' : 'checked'}`)), true],
      ['games', () => appTurn('games', { ask: GAMES_ASK }, 'three mini games on a 🎮 Play page', 6).then(() => set('games', 'done', '/play: roguelike, reflex and puzzle')), false],
      ['shop', shop, false],
      ['data', data, false]
    ]
    for (const [id, fn, needed] of plan) {
      if (job.stopped) { set(id, 'skipped', 'stopped'); continue }
      try { await fn() } catch (err) {
        set(id, 'failed', String(err.message || err))
        if (needed) { job.fatal = true; break }
      }
    }
    for (const s of job.steps) if (s.state === 'wait' && s.id !== 'deploy') set(s.id, 'skipped', job.fatal ? 'an earlier step failed' : 'skipped')
    // what was built goes live, even when a later step failed
    if (!job.stopped) await deploy().catch(err => set('deploy', 'failed', String(err.message || err)))
    else set('deploy', 'skipped', 'stopped')
    job.end = Date.now()
    job.state = job.url ? 'done' : 'failed'
    job.message = job.url ? `live at ${job.url}` : (job.steps.find(s => s.state === 'failed')?.note || 'nothing deployed')
    push()
  }

  function start({ prompt }) {
    prompt = String(prompt || '').trim().slice(0, 1200)
    if (!prompt) throw new Error('say what to make')
    if (job?.state === 'working') throw new Error('auto mode is already running')
    job = { state: 'working', prompt, t0: Date.now(), run: null, url: null, steps: STEPS.map(([id, label]) => ({ id, label, state: 'wait' })) }
    push()
    go().catch(err => { Object.assign(job, { state: 'failed', message: String(err.message || err), end: Date.now() }); push() })
    return view()
  }

  function stop() { if (job?.state === 'working') job.stopped = true; return view() }

  return { start, stop, state: view }
}
