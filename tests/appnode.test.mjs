// The app engine is installed and bundled on a Node its package accepts (dyad/package.json "engines"),
// not on whatever Node Hermes put first on PATH: Hermes ships Node 26, and the engine's native module
// (better-sqlite3) has no build for it, so every app build failed for a new user.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nodeFits, installNode } from '../engine/appbuild.mjs'

test('the engine range is read from dyad/package.json', () => {
  const range = JSON.parse(readFileSync(new URL('../dyad/package.json', import.meta.url), 'utf8')).engines.node
  assert.equal(range, '>=24 <26', 'if this changes, check the native modules have builds for the new range')
  assert.equal(nodeFits('v24.22.0'), true)
  assert.equal(nodeFits('v25.1.0'), true)
  assert.equal(nodeFits('v26.12.1'), false, "Hermes's own Node")
  assert.equal(nodeFits('v22.3.0'), false)
})

test('the first Node in range wins, even behind a newer one first on PATH; none in range is null', () => {
  const versions = { '/h/node26': 'v26.12.1', '/u/node24': 'v24.22.0', '/x/broken': null }
  const versionOf = n => { if (!versions[n]) throw new Error('not runnable'); return versions[n] }
  assert.equal(installNode(['/h/node26', '/x/broken', '/u/node24'], versionOf), '/u/node24')
  assert.equal(installNode(['/h/node26'], versionOf), null)
})
