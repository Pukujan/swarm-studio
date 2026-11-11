// A refused picture is tried again, then on another provider (engine/paintretry.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paintWithBackup } from '../engine/paintretry.mjs'

const codex = { provider: 'openai-codex', model: 'gpt-image-2-low' }
const openai = { provider: 'openai', model: 'gpt-image-2.5' }
const QUOTA = /\b(429|402)\b|quota/i
const fake = answers => { const calls = []; return { calls, paint: c => { calls.push(c.provider); return answers.shift() } } }
const opts = (extra = {}) => ({ choice: openai, quota: QUOTA, wait: async () => {}, ...extra })
const ok = { ok: true, path: '/x.png' }
const refused = { ok: false, error: 'HTTP 400: upstream generation failed' }

test('a picture that works is not tried again', async () => {
  const f = fake([ok])
  assert.deepEqual(await paintWithBackup(f.paint, opts()), ok)
  assert.deepEqual(f.calls, ['openai'])
})

test('a refusal is tried once more on the same provider', async () => {
  const f = fake([refused, ok])
  const r = await paintWithBackup(f.paint, opts({ backup: async () => codex }))
  assert.equal(r.secondTry, true)
  assert.deepEqual(f.calls, ['openai', 'openai'])
})

test('two refusals move to another signed-in provider', async () => {
  const f = fake([refused, refused, ok])
  const r = await paintWithBackup(f.paint, opts({ backup: async () => codex }))
  assert.deepEqual(r.backup, codex)
  assert.deepEqual(f.calls, ['openai', 'openai', 'openai-codex'])
})

test('out of quota is handed back at once, for the caller to stop painting', async () => {
  const f = fake([{ ok: false, error: '429 quota' }])
  const r = await paintWithBackup(f.paint, opts({ backup: async () => codex }))
  assert.match(r.error, /quota/)
  assert.deepEqual(f.calls, ['openai'])
})

test('when the backup fails too, its quota does not read as the build being out of quota', async () => {
  const f = fake([refused, refused, { ok: false, error: '429 quota' }])
  const r = await paintWithBackup(f.paint, opts({ backup: async () => codex }))
  assert.equal(r.ok, false)
  assert.doesNotMatch(r.error, QUOTA)
  assert.match(r.error, /openai-codex could not paint it either/)
})

test('no other provider: the second failure comes back; a thrown error counts as a failure', async () => {
  const f = { paint: () => { throw new Error('timeout') } }
  const r = await paintWithBackup(f.paint, opts())
  assert.deepEqual(r, { ok: false, error: 'timeout' })
})

test('a result whose file is missing counts as a failure', async () => {
  const f = fake([ok, ok])
  const r = await paintWithBackup(f.paint, opts({ exists: () => false }))
  assert.equal(r.secondTry, undefined)
  assert.equal(f.calls.length, 2)
})
