// Routes for the one-time Setup sheet (docs/specs/06-onboarding.md; engine/setup.mjs).
//
//   GET  /api/setup                    -> { seen, models: { planner, worker, media }, test, pictures }
//   POST /api/setup { seen, pictures } -> the same; pictures: 'painted' | 'stock' | 'drawn' | null (the default again)
//   POST /api/setup/models { again }   -> one tiny call to the planner and the builders: { ok, planner, worker }
//   POST /api/setup/hermes             -> "Let Hermes set this up": opens `hermes model` in a terminal
//   POST /api/setup/account { provider } -> sign in to Swarm Feed with Google, GitHub or Discord, then link
//        this install to that account; { check } asks whether it came back, { reopen } opens the page
//        again, { cancel } drops it. Answers { ok, message?, account }. The token stays in feed.py.
//   GET  /api/setup/parts              -> what the Parts list needs from this computer (web/setup-parts.js):
//        { keys: { NAME: true|false }, stripe: 'test'|'live'|'', godot, chrome, ffmpeg, renderer, voice, appEngine }.
//        Whether each declared key is set, never its value; whether each local program is found.
//
// setup.json holds { seen, paint } and nothing secret: whether the sheet was shown, and how the
// last real paint went ({ provider, ok, error }), which is how the Pictures row knows an image
// model is out of quota without painting a test picture.
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { execFile, spawn } from '../engine/proc.mjs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { godotBin } from '../engine/port.mjs'
import { findChrome } from '../engine/seo.mjs'
import { pictureState, isPictures, modelTester, paintNote } from '../engine/setup.mjs'

// The keys the Parts list asks about: plugin.yaml's optional_env (passed by launcher.py from Hermes's
// secret scope) plus the two the launcher renames. Only presence leaves this file.
export const PART_KEYS = ['SWARM_STUDIO_API_KEY', 'ELEVENLABS_API_KEY', 'CKFF_API_KEY', 'MESHY_API_KEY', 'PEXELS_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'VERCEL_TOKEN', 'CLOUDFLARE_API_TOKEN']
const onPath = (env, names) => String(env.PATH || env.Path || '').split(delimiter).filter(Boolean).some(d => names.some(n => existsSync(join(d, n))))
// What this computer has for the Parts list: key presence and local programs (engine pages: godot.md,
// video.md, sound.md, dyad.md). ffmpeg: on PATH, the pinned copy the first film installed, or not yet.
export function partsLocal({ env = process.env, dataDir, root, platform = process.platform, godot = godotBin, chrome = findChrome } = {}) {
  const win = platform === 'win32'
  const keys = Object.fromEntries(PART_KEYS.map(k => [k, !!env[k]]))
  keys.ELEVENLABS_API_KEY ||= !!env.SWARM_ELEVENLABS_KEY
  const stripe = env.STRIPE_SECRET_KEY ? (/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY) ? 'test' : 'live') : ''
  const tools = join(dataDir, 'video-tools', 'node_modules')
  const ff = onPath(env, win ? ['ffmpeg.exe'] : ['ffmpeg']) ? 'path' : existsSync(join(dataDir, 'video-tools', 'bin', win ? 'ffmpeg.exe' : 'ffmpeg')) || existsSync(join(tools, '@ffmpeg-installer')) ? 'pinned' : ''
  let g = null, c = null
  try { g = godot(env) } catch {}
  try { c = chrome() } catch {}
  return {
    keys, stripe, godot: !!g, chrome: !!c, ffmpeg: ff,
    renderer: existsSync(join(tools, 'hyperframes')),
    voice: existsSync(join(tools, 'kokoro-js')),
    appEngine: existsSync(join(root, 'dyad', '.vite', 'build', 'aba_headless.cjs'))
  }
}

// roles() -> { planner: { model, baseUrl, apiKey }, worker }; call(provider, model) throws when it
// does not answer; image() -> { providers, imagePick, pick }; setPictures(mode | null) saves the pick.
export function setupRoutes({ dataDir, roles, call, image, media = async () => null, setPictures, feed = null, hermesModels = null, clearPicks = () => {}, hermesEnv = () => ({}), hermesBin = process.env.SWARM_HERMES_BIN, platform = process.platform, run = execFile, start = spawn, local = () => partsLocal({ dataDir, root: join(dirname(fileURLToPath(import.meta.url)), '..') }) }) {
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
    return { seen: !!state.seen, modelsOk: state.modelsOk !== false, account: account(), models: { planner: row(r.planner), worker: row(r.worker), media: md ? { model: md.model || '', takes: md.takes || '', off: md.pick === 'off' } : null }, test: lastTest, pictures: await pictures() }
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
  // a .command file opens one; on Windows a console window (the server runs in the person's session,
  // and `hermes` is Hermes Desktop's command alias there). Elsewhere the sheet shows the command to copy.
  function hermesModel() {
    const bin = hermesBin || [join(homedir(), '.local', 'bin', 'hermes')].find(existsSync) || 'hermes'
    const command = 'hermes model'
    if (platform === 'win32') {
      // a Store install's own files cannot be started outside its package: its `hermes` alias can
      const exe = (/\\WindowsApps\\/i.test(String(bin)) ? 'hermes' : String(bin)).replace(/'/g, "''")
      const ps = `Start-Process -FilePath cmd.exe -ArgumentList '/k', '"${exe}" model'`
      return new Promise(resolve => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 15000, windowsHide: true }, err => resolve({ ok: !err, command })))
    }
    if (platform !== 'darwin') return Promise.resolve({ ok: false, command })
    const script = join(dataDir, 'hermes-model.command')
    try {
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(script, `#!/bin/sh\nexec ${JSON.stringify(bin)} model\n`)
      chmodSync(script, 0o700)
    } catch { return Promise.resolve({ ok: false, command }) }
    return new Promise(resolve => run('open', [script], { timeout: 15000 }, err => resolve({ ok: !err, command })))
  }

  // ---------- the model picker (hermes_models.py): Hermes's own provider and model list, a pick sets the
  // planner and builder slots in Hermes, a key goes to Hermes's own key store, a browser sign-in is
  // `hermes auth add <provider>` with its link and code shown in the sheet
  let options = null // { at, value }: Hermes's list, kept a minute
  async function modelOptions(refresh = false) {
    if (!hermesModels) return { ok: false, message: 'Start Swarm Studio from Hermes to pick a model.', providers: [] }
    if (!refresh && options && Date.now() - options.at < 60e3) return options.value
    const value = await hermesModels(`options_json(${refresh ? 'True' : 'False'})`, '', 90000)
    if (value?.ok) options = { at: Date.now(), value }
    return value?.ok ? value : { ok: false, message: value?.message || 'Hermes did not answer.', providers: [] }
  }
  // every change goes through Hermes's public CLI; hermes_models.py only reads (tests/test_bridge.py)
  const hermesExe = () => {
    const bin = hermesBin || [join(homedir(), '.local', 'bin', 'hermes')].find(existsSync) || 'hermes'
    // the Store app's own file cannot start outside its package: its `hermes` alias does
    return platform === 'win32' && /\\WindowsApps\\/i.test(String(bin)) ? 'hermes' : bin
  }
  const hermesCli = args => new Promise(resolve => run(hermesExe(), args, { env: hermesEnv(), timeout: 30000, windowsHide: true }, (err, stdout, stderr) =>
    resolve(err ? { ok: false, message: lastLine(stderr) || lastLine(stdout) || String(err.message || err).split('\n')[0] } : { ok: true })))
  const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/i
  async function pickModel(input) {
    if (!hermesModels) return { ok: false, message: 'Start Swarm Studio from Hermes to pick a model.' }
    const provider = String(input.provider || '').trim(), model = String(input.model || '').trim()
    if (!SLUG.test(provider) || !model || model.length > 200 || /[\s'"]/.test(model) || model.startsWith('-')) return { ok: false, message: 'Pick a model.' }
    const now = await hermesModels('slots_json()')
    if (!now?.ok) return { ok: false, message: now?.message || 'Hermes did not answer.' }
    // as Hermes's own slot save does: the same provider changes only the model; a new one replaces the
    // slot, which drops the old endpoint and its credentials and keeps the slot's other settings
    for (const s of Object.values(now.slots)) {
      const same = s.provider.toLowerCase() === provider.toLowerCase()
      const value = { ...s.keep, provider, model, ...(provider.toLowerCase() === 'custom' && s.base_url ? { base_url: s.base_url } : {}) }
      const r = same ? await hermesCli(['config', 'set', `auxiliary.${s.slot}.model`, model]) : await hermesCli(['config', 'set', `auxiliary.${s.slot}`, JSON.stringify(value)])
      if (!r.ok) return { ok: false, message: r.message || 'Hermes did not save it.' }
    }
    clearPicks()
    options = null
    lastTest = await tester.test(roles(), { again: true })
    if (state.modelsOk !== lastTest.ok) { state.modelsOk = lastTest.ok; save() }
    const slots = Object.fromEntries(Object.keys(now.slots).map(role => [role, { provider, model }]))
    return { ok: true, slots, test: lastTest }
  }
  async function saveKey(input) {
    if (!hermesModels) return { ok: false, message: 'Start Swarm Studio from Hermes to sign in.' }
    const slug = String(input.slug || ''), key = String(input.key || '').trim()
    if (!key) return { ok: false, message: 'Paste the key.' }
    if (/\s/.test(key) || key.length > 500 || key.startsWith('-')) return { ok: false, message: 'That is not a key.' }
    // the name it is kept under comes from Hermes's own list, never from the page
    const row = (await modelOptions()).providers?.find(p => p.slug === slug && p.sign === 'key')
    if (!row || !/^[A-Z][A-Z0-9_]{1,63}$/.test(row.keyEnv || '')) return { ok: false, message: 'This provider signs in another way.' }
    const r = await hermesCli(['config', 'set', row.keyEnv, key])
    options = null
    return r.ok ? { ok: true, options: await modelOptions(true) } : { ok: false, message: r.message || 'Hermes did not save the key.' }
  }
  // one browser sign-in at a time: its provider, link and code, and how it ended
  let signing = null
  // Hermes prints the link after "Open:" or "Open this URL …:" (hermes_cli/auth_device_flow.py,
  // auth_codex_browser.py, auth_openrouter.py); other links it prints (the portal) are not the sign-in
  const URL_RE = /\bOpen\b[^\n]*?:\s*(https?:\/\/[^\s"'<>]+)/, CODE_RE = /\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+\b/
  function signInBrowser(slug) {
    if (signing?.child && signing.done === undefined) signing.child.kill()
    const exe = hermesExe()
    const s = { slug, url: '', code: '', out: '', done: undefined, child: null }
    signing = s
    try {
      s.child = start(exe, ['auth', 'add', slug, '--type', 'oauth'], { env: { ...hermesEnv(), PYTHONUNBUFFERED: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (e) { s.done = false; s.out = String(e?.message || e); return Promise.resolve(signState()) }
    const read = b => { s.out = (s.out + b).slice(-4000); s.url ||= s.out.match(URL_RE)?.[1] || ''; s.code ||= s.out.match(CODE_RE)?.[0] || '' }
    s.child.stdout?.on('data', read)
    s.child.stderr?.on('data', read)
    s.child.on('error', e => { s.done = false; s.out += String(e?.message || e) })
    s.child.on('exit', code => { s.done = code === 0; options = null })
    // the link comes in a second or two; answer once it is there (or the sign-in already ended)
    return new Promise(resolve => {
      const t0 = Date.now()
      const tick = () => (s.url || s.done !== undefined || Date.now() - t0 > 10000 ? resolve(signState()) : setTimeout(tick, 200))
      tick()
    })
  }
  const lastLine = s => String(s || '').trim().split('\n').map(x => x.trim()).filter(Boolean).pop() || ''
  const signState = () => !signing ? { signing: null } : { signing: { slug: signing.slug, url: signing.url, code: signing.code, done: signing.done ?? null, ...(signing.done === false ? { error: lastLine(signing.out).slice(0, 300) } : {}) } }

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
      body(req).then(async input => {
        lastTest = await tester.test(roles(), { again: input.again === true })
        // kept, so the avatar's warning dot outlives a restart until a check passes
        if (state.modelsOk !== lastTest.ok) { state.modelsOk = lastTest.ok; save() }
        json(res, 200, lastTest)
      })
      return true
    }
    if (url.pathname === '/api/setup/account' && req.method === 'POST') {
      body(req).then(async input => { const r = await signIn(input); r ? json(res, 200, r) : json(res, 400, { error: 'bad request' }) })
      return true
    }
    if (url.pathname === '/api/setup/parts' && req.method === 'GET') { json(res, 200, local()); return true }
    if (url.pathname === '/api/setup/hermes' && req.method === 'POST') { hermesModel().then(r => json(res, 200, r)); return true }
    if (url.pathname === '/api/setup/models/options' && req.method === 'GET') { modelOptions(url.searchParams.get('refresh') === '1').then(r => json(res, 200, { ...r, ...signState() })); return true }
    if (url.pathname === '/api/setup/models/pick' && req.method === 'POST') { body(req).then(async input => json(res, 200, await pickModel(input))); return true }
    if (url.pathname === '/api/setup/models/signin' && req.method === 'POST') {
      body(req).then(async input => {
        if (input.cancel) { if (signing?.child && signing.done === undefined) signing.child.kill(); signing = null; return json(res, 200, signState()) }
        if (input.key) return json(res, 200, await saveKey(input))
        if (!SLUG.test(String(input.slug || ''))) return json(res, 400, { error: 'bad provider' })
        json(res, 200, { ok: true, ...(await signInBrowser(String(input.slug))) })
      })
      return true
    }
    return false
  }
  // how a real paint went, for the Pictures row
  handle.notePaint = (choice, r) => { const n = paintNote(choice, r); if (n) { state.paint = n; save() } }
  handle.pictures = pictures
  return handle
}
