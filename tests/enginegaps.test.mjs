// The gaps the engine pages found (docs/engines/, PR 382): a play test that could not run is never a
// pass, a render reports nothing home, and each key is read under the one name the launcher passes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { playtest } from '../engine/playtest.mjs'
import { playPassed } from '../engine/appjob.mjs'
import { renderEnv } from '../engine/video.mjs'
import { ckffCreds } from '../engine/ckff.mjs'
import { speakLine } from '../engine/voice.mjs'

test('a play test with no Playwright on the machine is skipped, not passed', async () => {
  const t = await playtest('http://127.0.0.1:9/', { playwright: null })
  assert.equal(t.ok, false)
  assert.match(t.skipped, /no browser/)
})

test('a play test whose browser will not start is skipped, not passed', async () => {
  const chromium = { launch: async () => { throw new Error('no chromium here') } }
  const t = await playtest('http://127.0.0.1:9/', { playwright: { chromium } })
  assert.equal(t.ok, false)
  assert.match(t.skipped, /would not start: no chromium here/)
})

test('a game passes only when its play test ran and found nothing', () => {
  assert.equal(playPassed({ ok: true, seconds: 4 }), true)
  assert.equal(playPassed({ ok: false, skipped: 'no browser for the play test' }), false)
  // even a result that says ok beside skipped (how it was before) is no pass
  assert.equal(playPassed({ ok: true, skipped: 'no browser for the play test' }), false)
  assert.equal(playPassed({ ok: false, problem: 'the run ended at once' }), false)
  assert.equal(playPassed({ ok: true }, 'a made-up link'), false)
  assert.equal(playPassed({ ok: true }, '', 'the game checks for the test'), false)
  assert.equal(playPassed(null), false)
})

test('a HyperFrames render is started with usage reports and the update check off', () => {
  const env = renderEnv('/bin')
  assert.deepEqual(env, { PATH: '/bin', HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', DO_NOT_TRACK: '1', NO_COLOR: '1' })
})

test('ckff reads its key only under the name the launcher passes', () => {
  assert.equal(ckffCreds({ CKFF_IMAGE_KEY: 'k' }), null)
  assert.deepEqual(ckffCreds({ CKFF_API_KEY: 'k' }), { key: 'k', base: 'https://ckffai.com/v1' })
})

test('an ElevenLabs game voice uses the key as the launcher hands it over', async t => {
  const was = { fetch: globalThis.fetch, a: process.env.ELEVENLABS_API_KEY, b: process.env.SWARM_ELEVENLABS_KEY }
  t.after(() => {
    globalThis.fetch = was.fetch
    for (const [k, v] of [['ELEVENLABS_API_KEY', was.a], ['SWARM_ELEVENLABS_KEY', was.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  })
  delete process.env.ELEVENLABS_API_KEY
  process.env.SWARM_ELEVENLABS_KEY = 'stand-in'
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), headers: init.headers }); return new Response(new Uint8Array([1, 2, 3])) }
  const out = join(mkdtempSync(join(tmpdir(), 'voice-')), 'line.mp3')
  assert.equal(await speakLine({ provider: 'elevenlabs', voice: 'v1' }, 'hello', out), 3)
  assert.equal(readFileSync(out).length, 3)
  // straight to ElevenLabs with that key, no vault lease asked for
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/v1/)
  assert.equal(calls[0].headers['xi-api-key'], 'stand-in')
})
