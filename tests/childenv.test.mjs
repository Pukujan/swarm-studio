// Every child process gets a minimal environment (Nous catalog review, point 3): PATH, HOME, TMPDIR,
// LANG and what that child is given by name. The server's keys never reach git, gh, pnpm, ffmpeg,
// Python, a browser or a generated app unless the call names them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { childEnv, appEnv, execFile, execFileSync, spawn } from '../engine/proc.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const sources = ['engine', 'server'].flatMap(d => readdirSync(join(root, d)).filter(f => f.endsWith('.mjs')).map(f => `${d}/${f}`))
const read = f => readFileSync(join(root, f), 'utf8')

test('no engine or server file reaches child_process except through engine/proc.mjs', () => {
  for (const f of sources) {
    if (f === 'engine/proc.mjs') continue
    assert.doesNotMatch(read(f), /['"]node:child_process['"]|['"]child_process['"]/, `${f} imports child_process directly`)
  }
})

test('no file hands the whole environment to anything', () => {
  for (const f of sources) {
    const s = read(f)
    assert.doesNotMatch(s, /\.\.\.\s*process\.env\b/, `${f} spreads process.env`)
    assert.doesNotMatch(s, /env:\s*process\.env\b/, `${f} passes process.env`)
  }
  // ffmpeg's decode takes an env for its child: it must not default to the whole environment
  assert.doesNotMatch(read('engine/musiccut.mjs'), /env\s*=\s*process\.env/)
})

test('every browser launch is given its own environment', () => {
  for (const f of sources) {
    for (const m of read(f).matchAll(/\b(?:chromium|pp)\.launch\(\{([^\n]*)/g)) assert.match(m[1], /env: browserEnv\(\)/, `${f}: ${m[0].slice(0, 80)}`)
  }
})

test('childEnv keeps the base and the named extras, drops every key', () => {
  const from = { PATH: '/bin', HOME: '/h', TMPDIR: '/t', LANG: 'C', SWARM_WORKER_API_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's', STRIPE_SECRET_KEY: 'sk_live_x', OPENAI_API_KEY: 'o', SYSTEMROOT: 'C:\\Windows' }
  assert.deepEqual(childEnv({ CI: '1', EMPTY: '' }, from, 'darwin'), { PATH: '/bin', HOME: '/h', TMPDIR: '/t', LANG: 'C', CI: '1' })
  assert.equal(childEnv({}, from, 'win32').SYSTEMROOT, 'C:\\Windows', 'Windows keeps its system folders')
})

test('a generated app gets its database and a Stripe test key, never a live key', () => {
  assert.deepEqual(appEnv({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 's', STRIPE_SECRET_KEY: 'sk_live_x', SWARM_WORKER_API_KEY: 'k' }), { SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 's' })
  assert.equal(appEnv({ STRIPE_SECRET_KEY: 'rk_test_x' }).STRIPE_SECRET_KEY, 'rk_test_x')
})

test('a real child does not see the server\'s keys', async () => {
  process.env.SWARM_WORKER_API_KEY = 'leak-check'
  process.env.VERCEL_TOKEN = 'leak-check'
  try {
    const script = 'console.log(JSON.stringify(Object.keys(process.env)))'
    const viaSync = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { NAMED: '1' } }))
    const viaAsync = JSON.parse(await new Promise((ok, no) => execFile(process.execPath, ['-e', script], (err, out) => (err ? no(err) : ok(out)))))
    const viaSpawn = JSON.parse(await new Promise(ok => { let o = ''; const p = spawn(process.execPath, ['-e', script]); p.stdout.on('data', b => { o += b }); p.on('close', () => ok(o)) }))
    for (const keys of [viaSync, viaAsync, viaSpawn]) {
      assert.ok(!keys.includes('SWARM_WORKER_API_KEY') && !keys.includes('VERCEL_TOKEN'), keys.join(','))
      assert.ok(keys.includes('PATH'))
    }
    assert.ok(viaSync.includes('NAMED'))
  } finally { delete process.env.SWARM_WORKER_API_KEY; delete process.env.VERCEL_TOKEN }
})
