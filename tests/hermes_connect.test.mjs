// MCP connectors through Hermes (Nous catalog review, point 5): calls go through the bridge's
// ctx.call_mcp, status is read with Hermes's public CLI, the allowlist is the person's to set, and
// `hermes mcp install` runs only after they say yes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { canvasFiles } from './canvas-source.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hermesConnectors, allowCommand } from '../engine/hermes_connect.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

function fakeHermes({ servers = {}, granted = null } = {}) {
  const runs = []
  const run = async args => {
    runs.push(args)
    const [a, b, key] = args
    if (a === 'config' && b === 'get' && key === 'mcp_servers') return { ok: true, out: JSON.stringify(servers) }
    if (a === 'config' && b === 'get' && key.endsWith('mcp_allowlist')) return granted ? { ok: true, out: JSON.stringify(granted) } : { ok: false, out: '' }
    if (a === 'mcp' && b === 'install') { servers[key] = { url: '***' }; return { ok: true, out: '' } }
    return { ok: false, out: '' }
  }
  return { run, runs }
}

test('status comes from the public CLI and the token file; an ungranted server carries the command', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hc-'))
  mkdirSync(join(home, 'mcp-tokens'))
  writeFileSync(join(home, 'mcp-tokens', 'supabase.json'), '{}')
  const h = fakeHermes({ servers: { supabase: {}, tinyfish: {} }, granted: ['tinyfish'] })
  const c = hermesConnectors({ run: h.run, home })
  const s = await c.status('supabase')
  assert.equal(s.installed, true)
  assert.equal(s.allowed, false)
  assert.equal(s.signed_in, true)
  assert.equal(s.allow, `hermes config set plugins.entries.swarm-studio.mcp_allowlist '["supabase","tinyfish"]'`, 'the grant keeps what is already granted')
  assert.ok(h.runs.every(a => a[0] === 'config' && a[1] === 'get' && a.includes('--json') && !a.includes('--raw')), 'only masked reads')
})

test('Connect asks before installing, installs on a yes, and never writes the allowlist', async () => {
  const h = fakeHermes({ servers: {}, granted: [] })
  const c = hermesConnectors({ run: h.run, home: mkdtempSync(join(tmpdir(), 'hc-')) })
  const first = await c.connect('supabase')
  assert.match(first.confirm, /hermes mcp install supabase/)
  assert.ok(!h.runs.some(a => a[0] === 'mcp'), 'nothing is installed without a yes')
  const second = await c.connect('supabase', { confirm: true })
  assert.deepEqual(h.runs.find(a => a[0] === 'mcp'), ['mcp', 'install', 'supabase'])
  assert.equal(second.installed, true)
  assert.equal(second.allowed, false)
  assert.equal(second.allow, allowCommand('supabase'))
  assert.ok(!h.runs.some(a => a[1] === 'set'), 'the studio never sets config')
})

test('a call goes through the bridge; a refused grant says how to allow it', async () => {
  const seen = []
  const bridge = { call: async (path, body) => (seen.push([path, body]), body.server === 'supabase' ? { ok: true, result: '[{"id":"p1"}]' } : { ok: false, allowed: false, error: 'Swarm Studio may not use elevenlabs yet', allow: 'x' }) }
  const h = fakeHermes({ servers: { supabase: {}, elevenlabs: {} }, granted: ['supabase'] })
  const c = hermesConnectors({ bridge, run: h.run, home: mkdtempSync(join(tmpdir(), 'hc-')) })
  assert.deepEqual(await c.call('supabase', 'list_projects'), [{ id: 'p1' }])
  assert.deepEqual(seen[0], ['/mcp', { server: 'supabase', tool: 'list_projects', args: {}, timeout: 180 }])
  await assert.rejects(c.call('elevenlabs', 'compose'), err => err.message.includes(`'["elevenlabs","supabase"]'`))
  await assert.rejects(hermesConnectors({ run: h.run }).call('supabase', 'x'), /Hermes is not open/)
})

test('no Hermes internals are run from Node, and nothing writes the allowlist', () => {
  assert.equal(existsSync(`${root}engine/hermes_mcp.py`), false)
  for (const f of ['engine/hermes_connect.mjs', 'server/server.mjs', 'engine/media.mjs', ...canvasFiles.map(c => `web/${c}`)]) {
    const src = readFileSync(`${root}${f}`, 'utf8')
    assert.doesNotMatch(src, /hermes_mcp\.py|\/api\/media\/allow/, f)
    assert.doesNotMatch(src, /\[\s*'config'\s*,\s*'set'/, f)
  }
})
