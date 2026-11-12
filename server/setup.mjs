// Routes for the one-time Setup sheet (docs/specs/06-onboarding.md; engine/setup.mjs).
//
//   GET  /api/setup                    -> { seen, models: { planner, worker, media }, test, pictures }
//   POST /api/setup { seen, pictures } -> the same; pictures: 'painted' | 'stock' | 'drawn' | null (the default again)
//   POST /api/setup/models { again }   -> one tiny call to the planner and the builders: { ok, planner, worker }
//   POST /api/setup/hermes             -> "Let Hermes set this up": opens `hermes model` in a terminal
//   POST /api/setup/account { provider } -> sign in to Swarm Feed with Google, GitHub or Discord, then link
//        this install to that account; { check } asks whether it came back, { reopen } opens the page
//        again, { cancel } drops it. Answers { ok, message?, account }. The token stays in feed.py.
//
// setup.json holds { seen, paint } and nothing secret: whether the sheet was shown, and how the
// last real paint went ({ provider, ok, error }), which is how the Pictures row knows an image
// model is out of quota without painting a test picture.
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { execFile } from '../engine/proc.mjs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pictureState, isPictures, modelTester, paintNote } from '../engine/setup.mjs'

// roles() -> { planner: { model, baseUrl, apiKey }, worker }; call(provider, model) throws when it
// does not answer; image() -> { providers, imagePick, pick }; setPictures(mode | null) saves the pick.
export function setupRoutes({ dataDir, roles, call, image, media = async () => null, setPictures, feed = null, hermesBin = process.env.SWARM_HERMES_BIN, platform = process.platform, run = execFile }) {
  const file = join(dataDir, 'setup.json')
  let state = {}
  try { state = JSON.parse(readFileSync(file, 'utf8')) } catch {}
  const save = () => { try { mkdirSync(dataDir, { recursive: true }); writeFileSync(file, JSON.stringify(state)) } catch {} }
  const tester = modelTester({ call })
  let lastTest = null

  const pictures = async () => { const i = await image(); return pictureState({ ...i, last: state.paint || null }) }
  const host = u => { try { return new URL(u).host } catch { return '' } }
  const view = async () => {
    const r = roles()
    const row = x => ({ model: x?.model || '', host: host(x?.baseUrl), key: !!x?.apiKey })
    // the media reader (spec 32): its model and what it can take; it is not part of the tiny call test
    const md = await media().catch(() => null)
    return { seen: !!state.seen, account: account(), models: { planner: row(r.planner), worker: row(r.worker), media: md ? { model: md.model || '', takes: md.takes || '', off: md.pick === 'off' } : null }, test: lastTest, pictures: await pictures() }
  }
  // who this install posts as, from feed.json (written by feed.py); never the token
  const account = () => {
    let f = {}
    try { f = JSON.parse(readFileSync(join(dataDir, 'feed.json'), 'utf8')) } catch {}
    const p = f.pending && f.pending.expiresAt * 1000 > Date.now() ? { code: f.pending.userCode || '', provider: f.pending.provider || '' } : null
    return { connected: !!f.token, name: f.name || '', handle: f.handle || '', guest: !!f.token && f.guest === true, pending: f.token ? null : p }
  }
  const ACCOUNT_OPS = { provider: 1, check: 1, reopen: 1, cancel: 1 }
  const PROVIDERS = ['google', 'github', 'discord']
  async function signIn(input) {
    if (!feed) return { ok: false, message: 'Start Swarm Studio from Hermes to sign in.', account: account() }
    const op = Object.keys(ACCOUNT_OPS).find(k => input[k])
    if (!op || (op === 'provider' && !PROVIDERS.includes(input.provider))) return null
    const arg = op === 'provider' ? JSON.stringify(input.provider) : JSON.stringify('')
    const out = await feed(`account_json(${JSON.stringify(op)}, ${arg})`)
    return { ok: out?.ok !== false, ...(out?.message ? { message: String(out.message).slice(0, 200) } : {}), account: account() }
  }
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const body = req => new Promise(resolve => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 1e4) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })

  // `hermes model` is Hermes's own model setup. It asks questions, so it needs a terminal: on a Mac
  // a .command file opens one. Elsewhere the sheet shows the command to copy.
  function hermesModel() {
    const bin = hermesBin || [join(homedir(), '.local', 'bin', 'hermes')].find(existsSync) || 'hermes'
    const command = 'hermes model'
    if (platform !== 'darwin') return Promise.resolve({ ok: false, command })
    const script = join(dataDir, 'hermes-model.command')
    try {
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(script, `#!/bin/sh\nexec ${JSON.stringify(bin)} model\n`)
      chmodSync(script, 0o700)
    } catch { return Promise.resolve({ ok: false, command }) }
    return new Promise(resolve => run('open', [script], { timeout: 15000 }, err => resolve({ ok: !err, command })))
  }

  function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/setup')) return false
    if (url.pathname === '/api/setup' && req.method === 'GET') { view().then(v => json(res, 200, v)); return true }
    if (url.pathname === '/api/setup' && req.method === 'POST') {
      body(req).then(async input => {
        if (input.seen === true && !state.seen) { state.seen = true; save() }
        if (input.pictures === null || isPictures(input.pictures)) setPictures(input.pictures)
        else if ('pictures' in input) return json(res, 400, { error: 'bad pick' })
        json(res, 200, await view())
      })
      return true
    }
    if (url.pathname === '/api/setup/models' && req.method === 'POST') {
      body(req).then(async input => { lastTest = await tester.test(roles(), { again: input.again === true }); json(res, 200, lastTest) })
      return true
    }
    if (url.pathname === '/api/setup/account' && req.method === 'POST') {
      body(req).then(async input => { const r = await signIn(input); r ? json(res, 200, r) : json(res, 400, { error: 'bad request' }) })
      return true
    }
    if (url.pathname === '/api/setup/hermes' && req.method === 'POST') { hermesModel().then(r => json(res, 200, r)); return true }
    return false
  }
  // how a real paint went, for the Pictures row
  handle.notePaint = (choice, r) => { const n = paintNote(choice, r); if (n) { state.paint = n; save() } }
  handle.pictures = pictures
  return handle
}
