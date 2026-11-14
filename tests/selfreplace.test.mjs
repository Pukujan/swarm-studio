// The server replaces itself when its code changed on disk under it (engine/lifecycle.mjs codeStamp/staleCode,
// engine/proc.mjs respawnSelf, server/server.mjs replaceSelf): an old server must not serve new web files.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { codeStamp, staleCode } from '../engine/lifecycle.mjs'
import { respawnSelf } from '../engine/proc.mjs'

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

test('the replacement is the same program with the same environment, detached, on the same log', () => {
  let got = null, unref = false
  respawnSelf({ execPath: '/n/node', argv: ['server/server.mjs', '--port', '1'], env: { SWARM_TOKEN: 't', A: 'b' }, cwd: '/w', spawner: (cmd, args, opts) => { got = { cmd, args, opts }; return { unref: () => { unref = true } } } })
  assert.equal(got.cmd, '/n/node'); assert.deepEqual(got.args, ['server/server.mjs', '--port', '1'])
  assert.deepEqual(got.opts.env, { SWARM_TOKEN: 't', A: 'b' }); assert.equal(got.opts.cwd, '/w')
  assert.equal(got.opts.detached, true); assert.deepEqual(got.opts.stdio, ['ignore', 'inherit', 'inherit'])
  assert.equal(unref, true)
})
