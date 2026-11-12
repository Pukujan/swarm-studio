// Sign-in connectors through Hermes, for people who don't want to paste keys.
//
// Hermes ships approved OAuth connectors (Supabase, Vercel, Stripe, Cloudflare): the person
// presses Connect, Hermes opens the provider's sign-in page, they approve, and Hermes keeps
// and refreshes the token. The canvas never sees a token.
//
// Nous catalog review, point 5:
// - calls go through Hermes's own ctx.call_mcp, inside the Hermes process (bridge.py's /mcp);
// - what is installed, granted and signed in is read with Hermes's public CLI
//   (`hermes config get … --json`) and the token file's presence, never with Hermes internals;
// - the studio never writes plugins.entries.swarm-studio.mcp_allowlist: which servers a plugin may
//   call is the person's grant, so the canvas shows them the `hermes config set` command to run;
// - `hermes mcp install` runs only after the person confirms it on the canvas.

import { execFile, spawn, hermesEnv } from './proc.mjs'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONNECTORS = { supabase: { label: 'Supabase' } }
const PLUGIN = 'swarm-studio'
const NAME = /^[A-Za-z0-9_.-]{1,64}$/

// A tool result is text; most connectors put JSON in it, sometimes inside a note.
export function parseResult(r) {
  if (r && typeof r === 'object') return r
  const text = String(r ?? '')
  try { return JSON.parse(text) } catch {}
  const m = /[[{][\s\S]*[\]}]/.exec(text)
  if (m) try { return JSON.parse(m[0]) } catch {}
  return text
}

// The command the person runs to let Swarm Studio use a server (the same text bridge.py gives back)
export function allowCommand(server, granted = []) {
  const names = [...new Set([...granted.filter(n => NAME.test(n)), server])].sort()
  return `hermes config set plugins.entries.${PLUGIN}.mcp_allowlist '${JSON.stringify(names)}'`
}

export function hermesConnectors({ bridge, bin = process.env.SWARM_HERMES_BIN, home = process.env.HERMES_HOME || join(homedir(), '.hermes'), broadcast = () => {}, run } = {}) {
  const hermes = bin || [join(homedir(), '.local', 'bin', 'hermes')].find(existsSync) || 'hermes'
  const logins = new Map() // name -> { child, authUrl }

  const cli = run || ((args, ms = 120000) => new Promise(resolve => {
    execFile(hermes, args, { env: hermesEnv(), timeout: ms, maxBuffer: 4e6 }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || '') }))
  }))
  // `hermes config get <key> --json`: the value, or null when the key is not set. Masked by default
  // (never --raw); only the server names and the allowlist are read from it.
  const configGet = async key => {
    const r = await cli(['config', 'get', key, '--json'], 30000)
    if (!r.ok) return null
    try { return JSON.parse(r.out) } catch { return null }
  }
  let known = null // { at, servers, granted } for a few seconds: each look is a Hermes start
  async function config() {
    if (known && Date.now() - known.at < 5000) return known
    const [servers, granted] = await Promise.all([configGet('mcp_servers'), configGet(`plugins.entries.${PLUGIN}.mcp_allowlist`)])
    known = { at: Date.now(), servers: servers && typeof servers === 'object' ? Object.keys(servers) : [], granted: Array.isArray(granted) ? granted.map(String) : [] }
    return known
  }
  const forget = () => { known = null }

  async function status(name) {
    if (!NAME.test(String(name))) return { error: 'unknown connector' }
    const c = await config()
    const allowed = c.granted.includes(name)
    return {
      label: CONNECTORS[name]?.label || name,
      installed: c.servers.includes(name),
      allowed,
      ...(allowed ? {} : { allow: allowCommand(name, c.granted) }),
      signed_in: existsSync(join(home, 'mcp-tokens', `${name}.json`)),
      signingIn: logins.has(name),
      authUrl: logins.get(name)?.authUrl || null
    }
  }

  async function list() {
    const out = {}
    for (const name of Object.keys(CONNECTORS)) out[name] = await status(name)
    return out
  }

  // Connect: adds Hermes's connector (only once the person has said yes to that), asks them to grant
  // it to this plugin (a command for them to run), then starts the browser sign-in.
  async function connect(name, { confirm = false } = {}) {
    if (!CONNECTORS[name]) throw new Error(`no connector called ${name}`)
    let s = await status(name)
    if (!s.installed) {
      if (!confirm) return { ...s, confirm: `Add Hermes's ${s.label} connector? This runs: hermes mcp install ${name}` }
      const r = await cli(['mcp', 'install', name])
      forget()
      if (!r.ok) throw new Error(`Hermes could not add the ${s.label} connector`)
      s = await status(name)
    }
    if (!s.allowed) return s // the canvas shows s.allow for the person to run
    if (s.signed_in || logins.has(name)) return s
    return login(name)
  }

  // `hermes mcp login` opens the provider's page and waits for the redirect on 127.0.0.1.
  // Its link is shown on the canvas too, for a browser Hermes could not open.
  function login(name) {
    return new Promise(resolve => {
      const child = spawn(hermes, ['mcp', 'login', name], { env: hermesEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
      const entry = { child, authUrl: null }
      logins.set(name, entry)
      let buf = ''
      const settle = () => resolve({ label: CONNECTORS[name].label, signingIn: true, authUrl: entry.authUrl })
      const timer = setTimeout(settle, 20000)
      const read = chunk => {
        buf += chunk
        const m = !entry.authUrl && /(https:\/\/\S+\/oauth2?\/authorize\?\S+)/.exec(buf)
        if (m) { entry.authUrl = m[1]; clearTimeout(timer); settle(); broadcast({ type: 'connector', name, state: 'signing-in', authUrl: entry.authUrl }) }
      }
      child.stdout.on('data', read)
      child.stderr.on('data', read)
      // the sign-in window is open for a few minutes at most
      const giveUp = setTimeout(() => child.kill(), 10 * 60000)
      child.on('exit', async () => {
        clearTimeout(timer); clearTimeout(giveUp)
        logins.delete(name)
        const s = await status(name)
        broadcast({ type: 'connector', name, state: s.signed_in ? 'connected' : 'failed' })
        settle()
      })
    })
  }

  function cancel(name) { logins.get(name)?.child.kill() }

  async function call(server, tool, args = {}, timeout = 180) {
    if (!bridge) throw new Error('Hermes is not open')
    // a Hermes chat, the desktop app and the gateway connect their MCP servers at start; a bare
    // `hermes swarm …` may not have, so another open Hermes is asked
    const r = await bridge.call('/mcp', { server, tool, args, timeout }, timeout * 1000, { next: a => a?.ok === false && /is not connected/i.test(String(a.error?.message || a.error || '')) })
    // not granted: the command keeps every server already granted (a set replaces the whole list)
    const allow = r?.allowed === false ? (forget(), (await status(server)).allow || r.allow) : ''
    if (!r?.ok) throw new Error(String(r?.error?.message || r?.error || 'the connector call failed').slice(0, 300) + (allow ? `; to allow it, run: ${allow}` : ''))
    return parseResult(r.result)
  }

  // A Supabase project for an app's data, through the person's own Supabase sign-in:
  // reuses the project called "swarm-studio", else makes one when Supabase says it is free.
  // Returns { SUPABASE_URL, SUPABASE_ANON_KEY } (the connector hands out publishable keys only).
  async function supabaseProject({ sql, say = () => {} }) {
    const s = await status('supabase')
    if (!s.allowed || !s.signed_in) return null
    say('looking for your Supabase project')
    const arr = v => Array.isArray(v) ? v : Array.isArray(v?.projects) ? v.projects : Array.isArray(v?.organizations) ? v.organizations : []
    let project = arr(await call('supabase', 'list_projects')).find(p => p.name === 'swarm-studio')
    if (!project) {
      const org = arr(await call('supabase', 'list_organizations'))[0]
      if (!org) throw new Error('your Supabase account has no organization yet')
      const cost = await call('supabase', 'get_cost', { type: 'project', organization_id: org.id })
      const amount = Number(cost?.amount ?? /\$?(\d+(?:\.\d+)?)/.exec(String(cost))?.[1] ?? NaN)
      // money is the person's call: only a free project is made for them
      if (amount !== 0) throw new Error(`a new Supabase project would cost ${Number.isFinite(amount) ? `$${amount}` : 'money'} on ${org.name || 'your organization'}; make one called "swarm-studio" yourself and run Auto again`)
      const confirm = await call('supabase', 'confirm_cost', { type: 'project', recurrence: cost?.recurrence || 'monthly', amount: 0 })
      say('creating a free Supabase project (about two minutes)')
      // the Supabase MCP needs a region; SWARM_SUPABASE_REGION picks another one (us-west-1, eu-west-2, ap-southeast-1…)
      const region = /^[a-z]{2}-[a-z]+-\d$/.test(process.env.SWARM_SUPABASE_REGION || '') ? process.env.SWARM_SUPABASE_REGION : 'us-east-1'
      project = await call('supabase', 'create_project', { name: 'swarm-studio', region, organization_id: org.id, confirm_cost_id: String(confirm?.confirmation_id || confirm?.confirm_cost_id || confirm?.id || confirm) })
    }
    const id = project.id || project.ref
    for (let i = 0; i < 60 && !/ACTIVE_HEALTHY/.test(String(project.status || '')); i++) {
      await new Promise(r => setTimeout(r, 5000))
      project = { ...project, ...await call('supabase', 'get_project', { id }) }
    }
    const tables = await call('supabase', 'list_tables', { project_id: id, schemas: ['public'] }).catch(() => [])
    if (!JSON.stringify(tables).includes('swarm_records')) {
      say('making the swarm_records table')
      await call('supabase', 'apply_migration', { project_id: id, name: 'swarm_records', query: sql })
    }
    const url = await call('supabase', 'get_project_url', { project_id: id })
    const keys = await call('supabase', 'get_publishable_keys', { project_id: id }).catch(() => call('supabase', 'get_anon_key', { project_id: id }))
    const list = Array.isArray(keys) ? keys : keys?.keys || [keys]
    const key = list.map(k => typeof k === 'string' ? k : k?.api_key || k?.key).find(k => k && !/disabled/i.test(k))
    const SUPABASE_URL = typeof url === 'string' ? url.match(/https:\/\/\S+?\.supabase\.co/)?.[0] || url.trim() : url?.url
    if (!SUPABASE_URL || !key) throw new Error('Supabase did not hand back the project address and key')
    return { SUPABASE_URL, SUPABASE_ANON_KEY: key }
  }

  return { list, status, connect, cancel, call, supabaseProject, forget }
}
