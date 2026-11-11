// A refused picture is tried again, then on another provider (engine/paintretry.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseImage, paintWithBackup } from '../engine/paintretry.mjs'

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

// the image model for a build (chooseImage)
const LIST = [
  { provider: 'openai', available: false, models: ['gpt-image-2-low', 'gpt-image-2-medium'], default: 'gpt-image-2-medium' },
  { provider: 'openai-codex', available: true, models: ['gpt-image-2-low', 'gpt-image-2-medium'], default: 'gpt-image-2-medium' },
  { provider: 'xai', available: true, models: [], default: null }
]

test('a pick that is signed in is used as picked', () => {
  assert.deepEqual(chooseImage(LIST, { provider: 'xai', model: '' }), { provider: 'xai', model: '' })
  assert.deepEqual(chooseImage(LIST, { provider: 'openai-codex', model: 'gpt-image-2-medium' }), { provider: 'openai-codex', model: 'gpt-image-2-medium' })
})

test('a pick that is not signed in falls back instead of switching pictures off', () => {
  const c = chooseImage(LIST, { provider: 'openai', model: 'gpt-image-2.5' })
  assert.equal(c.provider, 'openai-codex')
  assert.equal(c.model, 'gpt-image-2-low')
  assert.equal(c.insteadOf, 'openai')
  assert.equal(chooseImage(LIST.filter(x => x.provider !== 'openai-codex'), { provider: 'openai', model: 'gpt-image-2.5' }).provider, 'xai')
})

test('a model the provider does not list gives way to its default', () => {
  assert.equal(chooseImage(LIST, { provider: 'openai-codex', model: 'gpt-image-2.5' }).model, 'gpt-image-2-medium')
})

test('no pick: the Codex login, else any signed-in provider, else no pictures', () => {
  assert.deepEqual(chooseImage(LIST, null), { provider: 'openai-codex', model: 'gpt-image-2-low' })
  assert.equal(chooseImage(LIST.filter(x => x.provider !== 'openai-codex'), null).provider, 'xai')
  assert.equal(chooseImage(LIST.map(x => ({ ...x, available: false })), null), null)
})

test('Off stays off', () => {
  assert.equal(chooseImage(LIST, 'off'), null)
})

// ckff: the studio's own image key, listed beside Hermes's logins when it has one
const WITH_CKFF = [...LIST, { provider: 'ckff', available: true, models: ['gpt-image-2.5', 'gpt-image-2-4k'], default: 'gpt-image-2.5' }]
test('ckff can be picked like any signed-in provider', () => {
  assert.deepEqual(chooseImage(WITH_CKFF, { provider: 'ckff', model: 'gpt-image-2-4k' }), { provider: 'ckff', model: 'gpt-image-2-4k' })
})
test('a pick that is not signed in falls back to ckff before the Codex login', () => {
  const c = chooseImage(WITH_CKFF, { provider: 'openai', model: 'gpt-image-2.5' })
  assert.equal(c.provider, 'ckff')
  assert.equal(c.model, 'gpt-image-2.5')
  assert.equal(c.insteadOf, 'openai')
})
test('no pick still means the Codex login when it is signed in, ckff when it is not', () => {
  assert.equal(chooseImage(WITH_CKFF, null).provider, 'openai-codex')
  assert.equal(chooseImage(WITH_CKFF.filter(x => x.provider !== 'openai-codex'), null).provider, 'ckff')
})
