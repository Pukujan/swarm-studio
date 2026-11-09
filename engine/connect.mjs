// Hosting connections, the way Dyad does them: the person pastes an access token
// once (Vercel, Cloudflare), it is checked against the provider and kept in a
// mode-0600 file under the data dir. Tokens never go back to the canvas or into
// logs; the canvas only learns who is connected. VERCEL_TOKEN and
// CLOUDFLARE_API_TOKEN in the environment work too.

import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROVIDERS = {
  vercel: { label: 'Vercel', tokenUrl: 'https://vercel.com/account/tokens', env: 'VERCEL_TOKEN' },
  cloudflare: { label: 'Cloudflare Pages', tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens', env: 'CLOUDFLARE_API_TOKEN' },
}

const file = dataDir => join(dataDir, 'connections.json')

function load(dataDir) {
  try { return JSON.parse(readFileSync(file(dataDir), 'utf8')) } catch { return {} }
}

function save(dataDir, all) {
  writeFileSync(file(dataDir), JSON.stringify(all, null, 2), { mode: 0o600 })
  chmodSync(file(dataDir), 0o600)
}

async function call(url, token, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(init.timeout || 20000) })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

// Checks a token and says whose it is.
async function verify(provider, token) {
  if (provider === 'vercel') {
    const r = await call('https://api.vercel.com/v2/user', token)
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'Vercel did not accept that token' : `Vercel answered ${r.status}`)
    const u = r.body.user || {}
    return { user: u.username || u.email || 'connected', teamId: u.defaultTeamId || null }
  }
  if (provider === 'cloudflare') {
    const v = await call('https://api.cloudflare.com/client/v4/user/tokens/verify', token)
    if (!v.ok || v.body.result?.status !== 'active') throw new Error('Cloudflare did not accept that token')
    const a = await call('https://api.cloudflare.com/client/v4/accounts?per_page=5', token)
    const acct = a.body.result?.[0]
    if (!acct) throw new Error('that token cannot see any Cloudflare account: give it Account → Cloudflare Pages → Edit')
    return { user: acct.name, accountId: acct.id }
  }
  throw new Error('unknown provider')
}

export async function connect(dataDir, provider, token) {
  if (!PROVIDERS[provider]) throw new Error('unknown provider')
  const all = load(dataDir)
  if (!token) {
    delete all[provider]
    save(dataDir, all)
    return null
  }
  const who = await verify(provider, String(token).trim())
  all[provider] = { token: String(token).trim(), ...who, t: Date.now() }
  save(dataDir, all)
  return who
}

// The token and account for a provider: a saved connection, else the environment.
const fromEnv = new Map()
export async function credentials(dataDir, provider) {
  const saved = load(dataDir)[provider]
  if (saved?.token) return saved
  const token = process.env[PROVIDERS[provider].env]
  if (!token) return null
  if (!fromEnv.has(provider)) fromEnv.set(provider, verify(provider, token).then(who => ({ token, ...who, env: true })).catch(() => null))
  return fromEnv.get(provider)
}

// What the canvas may know: who is connected where. No tokens.
export async function connections(dataDir) {
  const out = {}
  for (const p of Object.keys(PROVIDERS)) {
    const c = await credentials(dataDir, p)
    out[p] = c ? { user: c.user, env: !!c.env } : null
  }
  return out
}

// Projects this made, per provider, so a project it didn't make is never overwritten.
export function ownProjects(dataDir, provider) {
  return load(dataDir)[`${provider}:projects`] || []
}
export function rememberProject(dataDir, provider, name) {
  const all = load(dataDir), k = `${provider}:projects`
  all[k] = [...new Set([...(all[k] || []), name])]
  save(dataDir, all)
}
