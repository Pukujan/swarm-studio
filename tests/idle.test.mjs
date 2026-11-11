import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idleOptions, optionOf, priceOk, idleModel, idleKey, idleStartName, idlePrompt } from '../engine/idle.mjs'
import { idleSheets, idleKeySheets, sheetList } from '../engine/game.mjs'
import { idleInput } from '../engine/appjob.mjs'
import { heavyConfig, interpOf } from '../engine/heavy.mjs'

const spec = { title: 'Rooftop Signal', genre: 'Platformer', view: 'side', hero: 'Mika, a courier in a yellow jacket', look: '2D painted anime', engine: 'Phaser 3' }
const videos = [
  { provider: 'xai', available: true, model: 'grok-imagine-video-1.5', label: 'xAI' },
  { provider: 'fal', available: true, model: 'fal-ai/veo3.1/fast/image-to-video', label: 'FAL' },
  { provider: 'openrouter', available: false, model: 'google/veo-3.1-fast' },
]

test('every video model Hermes offers is a choice, Veo first, each at its own price', () => {
  const o = idleOptions(videos)
  assert.deepEqual(o.map(x => x.by), ['Veo 3.1 Fast', 'Grok Imagine'])
  assert.equal(o[0].usd, 0.6)
  assert.equal(o[0].aspect, '16:9')
  assert.equal(o[1].line, 'Grok Imagine · one 4 s clip · about $0.56')
  assert.equal(o[1].aspect, '1:1')
  assert.equal(o[1].tune, 'short')
})

test('the saved pick comes first, even a model its provider does not list', () => {
  assert.equal(idleOptions(videos, { provider: 'xai', model: '' })[0].by, 'Grok Imagine')
  const k = idleOptions(videos, { provider: 'fal', model: 'fal-ai/kling-video/v2.1/standard/image-to-video' })
  assert.equal(k[0].by, 'Kling')
  assert.equal(k[0].seconds, 5)
  assert.equal(k.length, 3)
  assert.deepEqual(idleOptions(videos, 'off'), [])
  assert.deepEqual(idleOptions([]), [])
  // a pick whose provider is not signed in falls back to the list
  assert.equal(idleOptions(videos, { provider: 'openrouter', model: 'x' })[0].by, 'Veo 3.1 Fast')
})

test('only the chosen model at the price on its button is accepted', () => {
  const o = idleOptions(videos)
  assert.equal(optionOf(o, o[1].id), o[1])
  assert.equal(optionOf(o, undefined), o[0])
  assert.equal(optionOf(o, 'nope/x'), null)
  assert.ok(priceOk(o[1], 0.56))
  assert.ok(!priceOk(o[1], 0.6))
  assert.ok(!priceOk(null, 0.56))
})

test('model tuning: Veo standard costs more than Fast; an unknown model gets the generic line', () => {
  assert.equal(idleModel('fal', 'fal-ai/veo3.1/image-to-video').by, 'Veo 3.1')
  assert.equal(idleModel('openrouter', 'google/veo-3.1-fast').rate, 0.10)
  assert.equal(idleModel('acme', 'magic-v1').by, '')
  assert.equal(idleOptions([{ provider: 'acme', available: true, model: 'magic-v1', label: 'Acme' }])[0].by, 'Acme')
})

test('the clip is made on green, on magenta when the figure is green', () => {
  assert.equal(idleKey('a red cape').hex, '#00FF00')
  assert.equal(idleKey('an emerald robe').hex, '#FF00FF')
})

test('every start image has its own name the image route serves', () => {
  const a = idleStartName('2026-11-11T12-45-22-265Z'), b = idleStartName('2026-11-11T12-45-22-265Z')
  assert.notEqual(a, b)
  assert.match(a, /^idle-[a-z0-9-]{1,56}\.png$/)
})

test('the prompt keeps the camera still and the key flat, in a long and a short tuning, with no pronoun', () => {
  for (const tune of ['full', 'short']) {
    const p = idlePrompt({ who: 'Mika', look: 'yellow jacket', tune })
    assert.match(p, /[Ss]tatic camera/)
    assert.match(p, /[Ff]lat pure green \(#00FF00\)/)
    assert.match(p, /the hair and the jacket/)
    assert.doesNotMatch(p, /\b(she|he|her|his)\b/i)
  }
  assert.ok(idlePrompt({ tune: 'short' }).length < idlePrompt({ tune: 'full' }).length)
})

test('the video route adds the painted idle and the video sheet that replaces it', () => {
  const more = idleSheets(spec, [])
  const video = more.find(i => i.video)
  assert.equal(video.replaces, 'sheet-hero-idle')
  assert.equal(video.after, 'sprite-hero')
  assert.ok(more.some(i => i.id === 'sheet-hero-idle' && !i.video))
  const have = [...[sheetList(spec)].flat(2), { id: 'sheet-hero-idle' }]
  assert.equal(idleSheets(spec, have).filter(i => i.id === 'sheet-hero-idle').length, 0)
})

test('the keys route paints close keyframes, then in-betweens them', () => {
  const more = idleSheets(spec, [], 'keys')
  assert.deepEqual(more.map(i => i.id), ['sheet-hero-idle', 'sheet-hero-idle-keys', 'sheet-hero-idle-tween'])
  const [, keys, tween] = more
  assert.ok(keys.keys)
  assert.match(keys.frames, /same standing pose/)
  assert.equal(tween.after, keys.id)
  assert.equal(tween.replaces, 'sheet-hero-idle')
  assert.ok(!tween.ref)
  assert.deepEqual(idleKeySheets(spec).map(i => i.id), ['sheet-hero-idle-keys', 'sheet-hero-idle-tween'])
})

test('the build input says no, a price (and model), or asks', () => {
  assert.equal(idleInput('no'), 'no')
  assert.equal(idleInput(false), 'no')
  assert.deepEqual(idleInput({ usd: '0.56' }), { usd: 0.56 })
  assert.deepEqual(idleInput({ usd: 0.6, video: 'fal/veo' }), { usd: 0.6, video: 'fal/veo' })
  assert.equal(idleInput(undefined), null)
})

test('the heavy machine is an SSH alias or none; the in-betweener is RIFE unless another is set', () => {
  assert.equal(heavyConfig('/nowhere', { SWARM_HEAVY_HOST: 'mac-pro' }).host, 'mac-pro')
  assert.equal(heavyConfig('/nowhere', { SWARM_HEAVY_HOST: 'a; rm x' }).host, '')
  assert.equal(heavyConfig('/nowhere', {}).python, '')
  assert.equal(interpOf(heavyConfig('/nowhere', {})), null)
  assert.deepEqual(interpOf(heavyConfig('/nowhere', { SWARM_RIFE: '/r/rife' })), { name: 'RIFE', args: ['--rife', '/r/rife'] })
  const film = interpOf(heavyConfig('/nowhere', { SWARM_RIFE: '/r/rife', SWARM_INTERP: 'film {a} {b} {out} {t}', SWARM_INTERP_NAME: 'FILM' }))
  assert.deepEqual(film, { name: 'FILM', args: ['--interp', 'film {a} {b} {out} {t}'] })
})
