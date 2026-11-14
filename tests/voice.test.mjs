import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { voiceJobs, ttsRequest } from '../engine/voice.mjs'

const heroes = JSON.parse(readFileSync(new URL('../games/ares/data/heroes.json', import.meta.url), 'utf8'))

test('every ARES heroine has a known voice and her lines become jobs', () => {
  const jobs = voiceJobs(heroes, { root: 'games/ares' })
  assert.ok(jobs.some(j => j.hero === 'messenger' && j.key === 'ult'))
  assert.ok(jobs.some(j => j.hero === 'runner' && j.key === 'bark-start'))
  assert.ok(jobs.every(j => j.out.replaceAll('\\', '/').startsWith('games/ares/assets/voice/') && j.out.endsWith('.mp3')))
  assert.equal(jobs.filter(j => j.hero === 'runner').length, voiceJobs(heroes, { hero: 'runner' }).length)
})

test('boss lines become jobs with an inline voice', () => {
  const jobs = voiceJobs(heroes, { root: 'games/ares', hero: 'teknium' })
  assert.deepEqual(jobs.map(j => j.key).sort(), ['blade', 'chase', 'down', 'enter', 'glare', 'lance', 'laugh', 'phase'])
  assert.ok(jobs.every(j => j.out.replaceAll('\\', '/') === `games/ares/assets/voice/teknium/${j.key}.mp3` && j.voice.provider === 'fish'))
})

test('moves without a line are not recorded', () => {
  const jobs = voiceJobs(heroes)
  assert.ok(!jobs.some(j => j.key === 'slash1'))
})

test('an unknown voice or provider is refused', () => {
  assert.throws(() => voiceJobs({ voices: {}, heroes: { a: { voice: 'x' } } }), /not in voices/)
  assert.throws(() => voiceJobs({ voices: { x: { provider: 'nope' } }, heroes: { a: { voice: 'x' } } }), /unknown provider/)
})

test('fish and elevenlabs requests carry the voice and model', () => {
  const f = ttsRequest({ provider: 'fish', voice: 'abc', model: 's2.1-pro-free' }, 'はい')
  assert.equal(f.target, 'https://api.fish.audio/v1/tts')
  assert.equal(f.headers.model, 's2.1-pro-free')
  assert.equal(JSON.parse(f.body).reference_id, 'abc')
  const e = ttsRequest({ provider: 'elevenlabs', voice: 'v1' }, 'はい')
  assert.match(e.target, /text-to-speech\/v1/)
  assert.equal(JSON.parse(e.body).model_id, 'eleven_multilingual_v2')
})

test('spells record their chant and their shouted name', () => {
  const jobs = voiceJobs({ voices: { v: { provider: 'fish' } }, heroes: { a: { voice: 'v', spells: { bolt: { chant: '雷よ。', line: 'らい。' }, quiet: { kind: 'chain' } } } } }, { root: 'g' })
  assert.deepEqual(jobs.map(j => [j.key, j.text, j.out.replaceAll('\\', '/')]), [['spell-bolt-chant', '雷よ。', 'g/assets/voice/a/spell-bolt-chant.mp3'], ['spell-bolt', 'らい。', 'g/assets/voice/a/spell-bolt.mp3']])
})
