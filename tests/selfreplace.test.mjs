// The server replaces itself when its code changed on disk under it (engine/lifecycle.mjs codeStamp/staleCode,
// engine/proc.mjs respawnSelf, server/server.mjs replaceSelf): an old server must not serve new web files.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { codeStamp, staleCode } from '../engine/lifecycle.mjs'
import { readFileSync } from 'node:fs'
import { respawnSelf, SERVER_ENV, SERVER_SETTINGS, serverEnv } from '../engine/proc.mjs'

test('codeStamp is the newest .mjs change in the folders given; other files and missing folders do not count', () => {
  const d = mkdtempSync(join(tmpdir(), 'stamp-')), a = join(d, 'server'), b = join(d, 'engine')
  mkdirSync(a); mkdirSync(b)
  const at = (f, s) => { writeFileSync(f, ''); utimesSync(f, s, s) }
  at(join(a, 'server.mjs'), 1000); at(join(b, 'run.mjs'), 3000); at(join(b, 'notes.md'), 9000)
  assert.equal(codeStamp([a, b, join(d, 'nope')]), 3000 * 1000)
  assert.equal(codeStamp([join(d, 'nope')]), 0)
})

test('stale only when the code changed more than a second after the start', () => {
  assert.equal(staleCode(10000, 9000), false)
  assert.equal(staleCode(10000, 10500), false)
  assert.equal(staleCode(10000, 11001), true)
  assert.equal(staleCode(10000, 0), false)
})

test('the replacement is the same program, detached, on the same log, with only the launcher\'s environment', () => {
  let got = null, unref = false
  const from = { SWARM_TOKEN: 't', PATH: '/bin', HERMES_HOME: '/h', CKFF_API_KEY: 'declared', OPENAI_API_KEY: 'SENTINEL-not-ours', AWS_SECRET_ACCESS_KEY: 'SENTINEL-2', A: 'b' }
  respawnSelf({ execPath: '/n/node', argv: ['server/server.mjs', '--port', '1'], from, platform: 'darwin', cwd: '/w', spawner: (cmd, args, opts) => { got = { cmd, args, opts }; return { unref: () => { unref = true } } } })
  assert.equal(got.cmd, '/n/node'); assert.deepEqual(got.args, ['server/server.mjs', '--port', '1'])
  // what the launcher passes stays; anything else the server's own environment held does not
  assert.deepEqual(got.opts.env, { SWARM_TOKEN: 't', PATH: '/bin', HERMES_HOME: '/h', CKFF_API_KEY: 'declared' })
  assert.ok(!JSON.stringify(got.opts.env).includes('SENTINEL'))
  assert.equal(got.opts.cwd, '/w')
  assert.equal(got.opts.detached, true); assert.deepEqual(got.opts.stdio, ['ignore', 'inherit', 'inherit'])
  assert.equal(unref, true)
  // Windows keeps the system folders the launcher keeps there, nothing more
  assert.deepEqual(serverEnv({ SYSTEMROOT: 'C:\\Windows', PATH: 'p', GITHUB_TOKEN: 'SENTINEL' }, 'win32'), { SYSTEMROOT: 'C:\\Windows', PATH: 'p' })
})

test('the replacement\'s environment is exactly what launcher.py hands the server', () => {
  const py = readFileSync(new URL('../launcher.py', import.meta.url), 'utf8')
  const strings = src => [...src.matchAll(/"([A-Z][A-Z0-9_()]*)"/g)].map(m => m[1])
  // a tuple on one line, or over several up to the line that is only `)` (its comments may hold brackets)
  const tuple = name => strings(py.match(new RegExp(`^${name} = \\((.*\\)$|[\\s\\S]*?^\\))`, 'm'))[1])
  const start = py.slice(py.indexOf('def _ensure_server'), py.indexOf('subprocess.Popen('))
  const names = new Set([
    ...tuple('KEEP_ENV'), ...tuple('PASSED_KEYS'), ...tuple('KEY_SETTINGS'),
    py.match(/^KEY_ENV = "([A-Z_]+)"/m)[1],
    ...start.split('\n').filter(l => l.includes('env.update(')).flatMap(l => [...l.matchAll(/\b([A-Z][A-Z0-9_]+)=(?!=)/g)].map(x => x[1])),
    ...[...start.matchAll(/env\["([A-Z][A-Z0-9_]+)"\]\s*=/g)].map(m => m[1])
  ])
  assert.ok(names.size > 30, 'read launcher.py')
  assert.deepEqual([...SERVER_ENV].sort(), [...names].sort())
  // the Windows folders: the `keep += (...)` tuple in _ensure_server
  const win = strings(start.match(/keep \+= \(([\s\S]*?)\)\n/)[1])
  const all = Object.fromEntries([...SERVER_ENV, ...win].map(k => [k, 'x']))
  assert.deepEqual(Object.keys(serverEnv(all, 'win32')).sort(), [...new Set([...SERVER_ENV, ...win])].sort())
  // the few settings a hand-started server keeps for its successor (where it listens and writes) hold no secret
  for (const k of SERVER_SETTINGS) assert.doesNotMatch(k, /KEY|TOKEN|SECRET|PASS/, k)
  assert.deepEqual(serverEnv({ SWARM_PORT: '4397', SWARM_OUTPUT_DIR: '/o', OPENAI_API_KEY: 'SENTINEL' }, 'darwin'), { SWARM_PORT: '4397', SWARM_OUTPUT_DIR: '/o' })
})
