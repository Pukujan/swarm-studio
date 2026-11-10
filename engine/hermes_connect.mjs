// Sign-in connectors through Hermes, for people who don't want to paste keys.
//
// Hermes ships approved OAuth connectors (Supabase, Vercel, Stripe, Cloudflare): the person
// presses Connect, Hermes opens the provider's sign-in page, they approve, and Hermes keeps
// and refreshes the token. Connect also adds the connector to this plugin's MCP allowlist
// (plugins.entries.swarm-studio.mcp_allowlist), the grant Hermes requires before a plugin may
// call one. The canvas never sees a token: calls go through engine/hermes_mcp.py, which uses
// Hermes's own MCP client.

import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONNECTORS = { supabase: { label: 'Supabase' } }
const PLUGIN = 'swarm-studio'
const HELPER = join(dirname(fileURLToPath(import.meta.url)), 'hermes_mcp.py')

// A tool result is text; most connectors put JSON in it, sometimes inside a note.
export function parseResult(r) {
  if (r && typeof r === 'object') return r
  const text = String(r ?? '')
  try { return JSON.parse(text) } catch {}
  const m = /[[{][\s\S]*[\]}]/.exec(text)
  if (m) try { return JSON.parse(m[0]) } catch {}
  return text
}

export function hermesConnectors({ py, pyEnv, bin = process.env.SWARM_HERMES_BIN, broadcast = () => {} }) {
  const hermes = bin || [join(homedir(), '.local', 'bin', 'hermes')].find(existsSync) || 'hermes'
  const logins = new Map() // name -> { child, authUrl }

  const helper = (args, ms) => new Promise(resolve => {
    if (!py) return resolve({ ok: false, error: 'Hermes Python is not known to this server; start it with `hermes swarm`' })
    execFile(py, [HELPER, ...args], { env: pyEnv, timeout: ms, maxBuffer: 8e6 }, (err, out) => {
      try { resolve(JSON.parse(out)) } catch { resolve({ ok: false, error: String(err?.message || 'no answer').slice(0, 300) }) }
    })
  })
  const cli = (args, ms = 120000) => new Promise(resolve => {
    execFile(hermes, args, { env: process.env, timeout: ms, maxBuffer: 4e6 }, (err, out, errOut) => resolve({ ok: !err, out: `${out}\n${errOut}` }))
  })

  async function status(name) {
    const s = await helper(['status', name], 30000)
    return { label: CONNECTORS[name]?.label || name, ...s, signingIn: logins.has(name), authUrl: logins.get(name)?.authUrl || null }
  }

  async function list() {
    const out = {}
    for (const name of Object.keys(CONNECTORS)) out[name] = await status(name)
    return out
  }

  // Installs the connector, grants it to this plugin and starts the browser sign-in.
  async function connect(name) {
    if (!CONNECTORS[name]) throw new Error(`no connector called ${name}`)
    let s = await status(name)
    if (s.error) throw new Error(s.error)
    if (!s.installed) {
      const r = await cli(['mcp', 'install', name])
      if (!r.ok) throw new Error(`Hermes could not add the ${s.label} connector`)
    }
    if (!s.allowed) {
      const list = [...new Set([...(s.allowlist || []), name])]
      const r = await cli(['config', 'set', `plugins.entries.${PLUGIN}.mcp_allowlist`, JSON.stringify(list)])
      if (!r.ok) throw new Error(`Hermes would not let Swarm Studio use ${s.label}`)
    }
    s = await status(name)
    if (s.signed_in || logins.has(name)) return s
    return login(name)
  }

  // `hermes mcp login` opens the provider's page and waits for the redirect on 127.0.0.1.
  // Its link is shown on the canvas too, for a browser Hermes could not open.
  function login(name) {
    return new Promise(resolve => {
      const child = spawn(hermes, ['mcp', 'login', name], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
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

  // Lets this plugin use a connector Hermes already has (ElevenLabs's MCP holds its own key,
  // so there is no sign-in): the same grant Connect gives, without installing or logging in.
  async function allow(name) {
    const s = await helper(['status', name], 30000)
    if (s.error) throw new Error(s.error)
    if (!s.installed) throw new Error(`Hermes has no ${name} connector`)
    if (s.allowed) return s
    const list = [...new Set([...(s.allowlist || []), name])]
    const r = await cli(['config', 'set', `plugins.entries.${PLUGIN}.mcp_allowlist`, JSON.stringify(list)])
    if (!r.ok) throw new Error(`Hermes would not let Swarm Studio use ${name}`)
    return helper(['status', name], 30000)
  }

  async function call(server, tool, args = {}) {
    const r = await helper(['call', server, tool, JSON.stringify(args)], 200000)
    if (!r.ok) throw new Error(String(r.error?.message || r.error || 'the connector call failed').slice(0, 300))
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

  return { list, status, connect, cancel, allow, call, supabaseProject }
}
