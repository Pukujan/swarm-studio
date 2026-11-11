// node --test tests/publish.test.mjs
// Publishing to Vercel and Cloudflare against a mocked API: the public address is
// only ever one the host assigned, and an app's settings are kept on its project.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishVercel, publishCloudflare } from '../engine/publish.mjs'

const API = 'https://api.test'

function site() {
  const root = mkdtempSync(join(tmpdir(), 'swarm-publish-test-'))
  const dir = join(root, 'html'), dataDir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ARES</title>')
  return { dir, dataDir, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

// fetch stand-in: routes by method and URL; every call is kept
function mockFetch(routes) {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET'
    calls.push({ method, url: u, body: init.body })
    for (const [match, reply] of routes) {
      if (match(method, u)) {
        const r = typeof reply === 'function' ? reply(u, init) : reply
        return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
      }
    }
    return new Response('{}', { status: 404 })
  }
  return { calls, restore: () => { globalThis.fetch = real } }
}

function vercelWorld({ created = false, envOk = true } = {}) {
  let made = created
  return mockFetch([
    [(m, u) => m === 'GET' && u === `${API}/v9/projects/ares-app`, () => made
      ? { body: { id: 'prj_1', name: 'ares-app', targets: { production: { alias: ['ares-app-nu-nine.vercel.app', 'ares-app-teresas-projects.vercel.app'] } } } }
      : { status: 404, body: { error: { code: 'not_found' } } }],
    [(m, u) => m === 'GET' && u === `${API}/v9/projects/prj_1`, { body: { id: 'prj_1', name: 'ares-app', targets: { production: { alias: ['ares-app-nu-nine.vercel.app', 'ares-app-teresas-projects.vercel.app'] } } } }],
    [(m, u) => m === 'POST' && u === `${API}/v2/files`, { body: {} }],
    [(m, u) => m === 'POST' && u.startsWith(`${API}/v13/deployments`), () => { made = true; return { body: { id: 'dpl_1', projectId: 'prj_1', readyState: 'READY', url: 'ares-app-abc123-team.vercel.app', alias: ['ares-app-teresas-projects.vercel.app'] } } }],
    [(m, u) => m === 'GET' && u === `${API}/v13/deployments/dpl_1`, { body: { id: 'dpl_1', readyState: 'READY', url: 'ares-app-abc123-team.vercel.app', alias: ['ares-app-teresas-projects.vercel.app'] } }],
    [(m, u) => m === 'POST' && u.startsWith(`${API}/v10/projects/prj_1/env`), envOk ? { status: 201, body: { created: [] } } : { status: 403, body: { error: { code: 'forbidden' } } }],
    // a stranger owns ares-app.vercel.app, and it answers
    [(m, u) => m === 'HEAD' && u === 'https://ares-app.vercel.app/', { status: 200 }],
    [(m, u) => m === 'HEAD' && u === 'https://ares-app-nu-nine.vercel.app/', { status: 200 }],
    [(m, u) => m === 'HEAD' && u === 'https://ares-app-teresas-projects.vercel.app/', { status: 200 }],
  ])
}

test('Vercel: the address is the shortest one Vercel assigned, never <name>.vercel.app', async () => {
  const s = site(), f = vercelWorld()
  try {
    const r = await publishVercel({ dir: s.dir, name: 'ares-app', creds: { token: 't', base: API }, dataDir: s.dataDir })
    assert.equal(r.url, 'https://ares-app-nu-nine.vercel.app/')
    assert.equal(r.repo, 'vercel:ares-app')
    assert.equal(r.pending, false)
    assert.ok(!f.calls.some(c => c.url.startsWith('https://ares-app.vercel.app')), 'never even asks the stranger\'s address')
  } finally { f.restore(); s.cleanup() }
})

test('Vercel: an app\'s settings are kept on the project, encrypted, and never logged', async () => {
  const s = site(), f = vercelWorld()
  const logs = [], stages = []
  const env = { SUPABASE_URL: 'https://xyz.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-value' }
  try {
    const r = await publishVercel({ dir: s.dir, name: 'ares-app', creds: { token: 't', base: API }, dataDir: s.dataDir, build: true, env, onLog: l => logs.push(...l), onStage: x => stages.push(x) })
    assert.equal(r.envSaved, true)
    const saved = f.calls.find(c => c.url.startsWith(`${API}/v10/projects/prj_1/env`))
    assert.ok(saved, 'the env API was called')
    assert.match(saved.url, /upsert=true/)
    const vars = JSON.parse(saved.body)
    assert.deepEqual(vars.map(v => v.key).sort(), ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'])
    for (const v of vars) {
      assert.equal(v.type, 'encrypted')
      assert.deepEqual(v.target, ['production', 'preview'])
      assert.equal(v.value, env[v.key])
    }
    assert.ok(![...logs, ...stages].join('\n').includes('secret-service-role-value'))
  } finally { f.restore(); s.cleanup() }
})

test('Vercel: when the settings cannot be saved, it says so by key name only', async () => {
  const s = site(), f = vercelWorld({ envOk: false })
  const logs = []
  try {
    const r = await publishVercel({ dir: s.dir, name: 'ares-app', creds: { token: 't', base: API }, dataDir: s.dataDir, build: true, env: { SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-value' }, onLog: l => logs.push(...l) })
    assert.equal(r.envSaved, false)
    assert.match(logs.join('\n'), /SUPABASE_SERVICE_ROLE_KEY/)
    assert.ok(!logs.join('\n').includes('secret-service-role-value'))
  } finally { f.restore(); s.cleanup() }
})

test('Vercel: no settings, no env call', async () => {
  const s = site(), f = vercelWorld()
  try {
    const r = await publishVercel({ dir: s.dir, name: 'ares-app', creds: { token: 't', base: API }, dataDir: s.dataDir })
    assert.equal(r.envSaved, undefined)
    assert.ok(!f.calls.some(c => c.url.includes('/env')))
  } finally { f.restore(); s.cleanup() }
})

test('Cloudflare: the address is the subdomain Cloudflare assigned, never <name>.pages.dev', async () => {
  const s = site()
  const base = `${API}/accounts/acc/pages/projects`
  const f = mockFetch([
    [(m, u) => m === 'GET' && u === `${base}/ares-site`, { status: 404, body: { success: false, errors: [{ message: 'not found' }] } }],
    // Cloudflare made the project, but the plain name was taken, so it got a suffix
    [(m, u) => m === 'POST' && u === base, { body: { result: { name: 'ares-site', subdomain: 'ares-site-7xk.pages.dev' } } }],
    [(m, u) => m === 'GET' && u === `${base}/ares-site/upload-token`, { body: { result: { jwt: 'jwt' } } }],
    [(m, u) => m === 'POST' && u === 'https://api.cloudflare.com/client/v4/pages/assets/check-missing', { body: { result: [] } }],
    [(m, u) => m === 'POST' && u === 'https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes', { body: { result: true } }],
    [(m, u) => m === 'POST' && u === `${base}/ares-site/deployments`, { body: { result: { url: 'https://abc123.ares-site-7xk.pages.dev' } } }],
    [(m, u) => m === 'HEAD' && u === 'https://ares-site.pages.dev/', { status: 200 }],
    [(m, u) => m === 'HEAD' && u === 'https://ares-site-7xk.pages.dev/', { status: 200 }],
  ])
  try {
    const r = await publishCloudflare({ dir: s.dir, name: 'ares-site', creds: { token: 't', accountId: 'acc', base: API }, dataDir: s.dataDir })
    assert.equal(r.url, 'https://ares-site-7xk.pages.dev/')
    assert.equal(r.pending, false)
    assert.ok(!f.calls.some(c => c.url.startsWith('https://ares-site.pages.dev')))
  } finally { f.restore(); s.cleanup() }
})
