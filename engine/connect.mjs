// Hosting connections, the way Dyad does them: the person pastes an access token
// once (Vercel, Cloudflare), it is checked against the provider and kept in a
// mode-0600 file under the data dir. Tokens never go back to the canvas or into
// logs; the canvas only learns who is connected. VERCEL_TOKEN and
// CLOUDFLARE_API_TOKEN in the environment work too.
//
// Or through an Octo vault (octodb): the person pastes a vault grant once, the
// plugin finds the provider's item and keeps only a working key (octo_tmp_…,
// one item, relay only, renewed before it expires). The grant is not stored,
// and the vendor token never leaves the vault: calls go through Octo's relay.

import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROVIDERS = {
  vercel: { label: 'Vercel', tokenUrl: 'https://vercel.com/account/tokens', env: 'VERCEL_TOKEN' },
  cloudflare: { label: 'Cloudflare Pages', tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens', env: 'CLOUDFLARE_API_TOKEN' },
}
const ROOT = { vercel: 'https://api.vercel.com', cloudflare: 'https://api.cloudflare.com/client/v4' }
// vault items that may hold the provider's token, by label
const ITEM = { vercel: /vercel/i, cloudflare: /cloudflare|^cf[_ ]/i }
const NOT_ITEM = /r2|zone|account_?id|access_?key|secret_?access|endpoint|bucket|url/i
const OCTO = 'https://octodb.design-bakery.com'
const LEASE_DAYS = 30

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
async function verify(provider, token, base = ROOT[provider]) {
  if (provider === 'vercel') {
    const r = await call(`${base}/v2/user`, token)
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'Vercel did not accept that token' : `Vercel answered ${r.status}`)
    const u = r.body.user || {}
    return { user: u.username || u.email || 'connected', teamId: u.defaultTeamId || null }
  }
  if (provider === 'cloudflare') {
    const CF = base
    const a = await call(`${CF}/accounts?per_page=5`, token)
    const acct = a.body.result?.[0]
    if (!acct) throw new Error(a.ok ? 'that token cannot see any Cloudflare account: give it Account → Cloudflare Pages → Edit' : 'Cloudflare did not accept that token')
    // user tokens verify under /user, account-owned tokens under their account
    const user = await call(`${CF}/user/tokens/verify`, token)
    const ok = user.body.result?.status === 'active' || (await call(`${CF}/accounts/${acct.id}/tokens/verify`, token)).body.result?.status === 'active'
    if (!ok) throw new Error('Cloudflare did not accept that token')
    const pages = await call(`${CF}/accounts/${acct.id}/pages/projects`, token)
    if (!pages.ok) throw new Error('that token cannot use Cloudflare Pages: give it Account → Cloudflare Pages → Edit')
    return { user: acct.name, accountId: acct.id }
  }
  throw new Error('unknown provider')
}

export async function connect(dataDir, provider, token, octoBase) {
  if (!PROVIDERS[provider]) throw new Error('unknown provider')
  const all = load(dataDir)
  if (!token) {
    delete all[provider]
    save(dataDir, all)
    return null
  }
  token = String(token).trim()
  const saved = token.startsWith('octo_vault_') ? await fromVault(provider, token, octoBase || OCTO)
    : token.startsWith('octo_tmp_') ? await fromWorkingKey(provider, token, octoBase || OCTO)
    : { token, ...(await verify(provider, token)) }
  all[provider] = { ...saved, t: Date.now() }
  save(dataDir, all)
  return saved
}

// ---------- Octo vault

const relay = (octo, provider) => `${octo}/api/vault/proxy/${ROOT[provider]}`

async function fromWorkingKey(provider, key, octo, extra = {}) {
  const who = await verify(provider, key, relay(octo, provider)).catch(err => { throw new Error(`through the Octo vault: ${err.message}`) })
  const info = await call(`${octo}/api/vault/lease/info`, key)
  return { via: 'octo', octo, token: key, expiresAt: info.body.expiresAt || info.body.lease?.expiresAt || null, ...extra, ...who }
}

// Find the provider's item with the grant, mint a working key for it, keep only that.
async function fromVault(provider, grant, octo) {
  const inv = await call(`${octo}/api/vault/open`, grant)
  if (!inv.ok) throw new Error(inv.status === 401 ? 'Octo did not accept that vault grant' : `Octo answered ${inv.status}`)
  const items = (Array.isArray(inv.body) ? inv.body : inv.body.items || []).filter(i => i.hasSecret !== false && ITEM[provider].test(i.label || '') && !NOT_ITEM.test(i.label || ''))
  if (!items.length) throw new Error(`no ${PROVIDERS[provider].label} token in that vault: store one there first`)
  let last = null
  for (const item of items) {
    const lease = await call(`${octo}/api/vault/open/lease`, grant, { method: 'POST', body: JSON.stringify({ itemId: item.id, baseUrl: ROOT[provider], expiresInDays: LEASE_DAYS }) })
    const key = lease.body.rawSecret
    if (!key) { last = new Error(`Octo would not issue a working key for ${item.label}`); continue }
    try {
      const got = await fromWorkingKey(provider, key, octo, { label: item.label })
      return { ...got, expiresAt: got.expiresAt || lease.body.expiresAt || lease.body.lease?.expiresAt || null }
    } catch (err) { last = err }
  }
  throw last
}

// A working key renews itself; do it when it has under a week left.
async function fresh(dataDir, provider, saved) {
  const left = saved.expiresAt ? Date.parse(saved.expiresAt) - Date.now() : Infinity
  if (left > 7 * 864e5) return saved
  const r = await call(`${saved.octo}/api/vault/lease/renew`, saved.token, { method: 'POST', body: JSON.stringify({ expiresInDays: LEASE_DAYS }) })
  if (!r.ok) {
    if (left <= 0) throw new Error(`the Octo vault key for ${PROVIDERS[provider].label} expired: connect it again`)
    return saved
  }
  const all = load(dataDir)
  all[provider] = { ...saved, expiresAt: r.body.expiresAt || r.body.lease?.expiresAt || new Date(Date.now() + LEASE_DAYS * 864e5).toISOString() }
  save(dataDir, all)
  return all[provider]
}

// The token, account and API base for a provider: a saved connection, else the environment.
const fromEnv = new Map()
export async function credentials(dataDir, provider) {
  let saved = load(dataDir)[provider]
  if (saved?.via === 'octo') {
    saved = await fresh(dataDir, provider, saved)
    return { ...saved, base: relay(saved.octo, provider) }
  }
  if (saved?.token) return saved
  const token = process.env[PROVIDERS[provider].env]
  if (!token) return null
  if (!fromEnv.has(provider)) fromEnv.set(provider, verify(provider, token).then(who => ({ token, ...who, env: true })).catch(() => null))
  return fromEnv.get(provider)
}

// What the canvas may know: who is connected where, and how. No tokens.
export async function connections(dataDir) {
  const all = load(dataDir), out = {}
  for (const p of Object.keys(PROVIDERS)) {
    const c = all[p]?.token ? all[p] : await credentials(dataDir, p)
    out[p] = c ? { user: c.user, env: !!c.env, ...(c.via === 'octo' ? { via: 'octo', item: c.label || null, expiresAt: c.expiresAt || null } : {}) } : null
  }
  return out
}

// Which GitHub repo each build publishes to (run id -> 'login/repo'), so two builds, two versions
// of one project or two projects with the same name, never share a repo and replace each other's site.
export function siteRepos(dataDir) {
  return load(dataDir)['github:repos'] || {}
}
export function claimRepo(dataDir, key, repo) {
  const all = load(dataDir)
  all['github:repos'] = { ...(all['github:repos'] || {}), [key]: repo }
  save(dataDir, all)
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
