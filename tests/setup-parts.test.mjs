import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GROUPS, statesOf, tally } from '../web/setup-parts.js'
import { partsLocal, PART_KEYS } from '../server/setup.mjs'

const declared = [...readFileSync(new URL('../plugin.yaml', import.meta.url), 'utf8').matchAll(/- name: ([A-Z_]+)/g)].map(m => m[1])

test('Parts are grouped by what the person makes, every build first', () => {
  assert.deepEqual(GROUPS.map(g => g.name), ['Every build', 'Website', 'App', 'Game', 'Video', 'Brand', 'Deck', 'Publishing', 'Feed'])
  for (const g of GROUPS) for (const p of g.parts) {
    assert.ok(p.name && p.for && p.by, `${p.k} says what it is for and what powers it`)
    assert.equal(typeof p.need, 'boolean', `${p.k} is required or optional`)
    if (!p.need) assert.ok(p.without, `${p.k} says what stops without it`)
  }
})

test('a key is fixed in Hermes with the key name only, never a value, and only a declared key', () => {
  const all = { local: { keys: {} }, conn: {}, media: { music: {} } }
  for (const g of GROUPS) for (const p of g.parts) {
    const f = p.fix(all)
    if (!f?.cmd?.includes('<your key>')) continue
    const name = /hermes config set ([A-Z_]+) <your key>$/.exec(f.cmd)?.[1]
    assert.ok(name, f.cmd)
    assert.ok(declared.includes(name), `${name} is in plugin.yaml optional_env`)
  }
  // the studio never writes the MCP allowlist: it is a command the person runs
  const c = GROUPS.find(g => g.k === 'app').parts.find(p => p.k === 'supabase')
  const allow = "hermes config set plugins.entries.swarm-studio.mcp_allowlist '[\"supabase\"]'"
  assert.deepEqual(c.fix({ conn: { supabase: { installed: true, allowed: false, allow } } }).cmd, allow)
  assert.equal(c.state({ local: { keys: {} }, conn: { supabase: { installed: true, allowed: false } } }).st, 'fail')
})

test('a part waits for its facts, then says working, not set up or not working', () => {
  for (const g of GROUPS) for (const { p, s } of statesOf({}, g)) if (p.k !== 'looks') assert.equal(s.st, 'wait', p.k)
  const F = {
    hermes: { attached: true },
    view: { test: { ok: true, planner: { ok: true }, worker: { ok: true } }, models: { planner: { model: 'openai/gpt-5' }, worker: { model: 'm' } }, pictures: { mode: 'stock' }, account: { connected: true, handle: 'pk' } },
    models: { roles: { reviewer: { picked: 'off' } } },
    local: { keys: { PEXELS_API_KEY: true }, stripe: 'live', godot: false, chrome: true, appEngine: false, renderer: true, voice: false },
    media: { music: { on: false }, clips: { on: true, by: 'Veo' } },
    publish: { github: 'pk', vercel: null, cloudflare: null }, conn: { supabase: {} }, gateway: { platforms: {} }
  }
  const st = Object.fromEntries(GROUPS.flatMap(g => statesOf(F, g)).map(({ p, s }) => [p.k, s]))
  assert.equal(st.planner.st, 'ok')
  assert.equal(st.planner.why, 'gpt-5')
  assert.equal(st.reviewer.why, 'Turned off')
  assert.equal(st.stripe.st, 'fail')
  assert.equal(st.godot.st, 'off')
  assert.equal(st.appengine.st, 'later')
  assert.equal(st.account.why, '@pk')
  assert.equal(tally(statesOf(F, GROUPS.find(g => g.k === 'app'))).bad, true)
})

test('GET /api/setup/parts says whether a key is set, never what it is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parts-'))
  const env = { PATH: '', MESHY_API_KEY: 'msy-secret', STRIPE_SECRET_KEY: 'sk_live_secret', SWARM_ELEVENLABS_KEY: 'el-secret' }
  const r = partsLocal({ env, dataDir: dir, root: dir, godot: () => null, chrome: () => null })
  assert.equal(r.keys.MESHY_API_KEY, true)
  assert.equal(r.keys.ELEVENLABS_API_KEY, true)
  assert.equal(r.keys.PEXELS_API_KEY, false)
  assert.equal(r.stripe, 'live')
  assert.ok(!JSON.stringify(r).includes('secret'))
  assert.deepEqual(Object.keys(r.keys), PART_KEYS)
  for (const k of PART_KEYS) assert.ok(declared.includes(k), `${k} is declared in plugin.yaml`)
  // the first film's renderer and a pinned ffmpeg are seen once they are installed
  mkdirSync(join(dir, 'video-tools', 'node_modules', 'hyperframes'), { recursive: true })
  mkdirSync(join(dir, 'video-tools', 'node_modules', '@ffmpeg-installer'), { recursive: true })
  const bin = join(dir, 'bin'); mkdirSync(bin)
  const after = partsLocal({ env: { PATH: bin }, dataDir: dir, root: dir, godot: () => null, chrome: () => null })
  assert.equal(after.renderer, true)
  assert.equal(after.ffmpeg, 'pinned')
  writeFileSync(join(bin, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), '')
  assert.equal(partsLocal({ env: { PATH: bin }, dataDir: dir, root: dir, godot: () => null, chrome: () => null }).ffmpeg, 'path')
})
