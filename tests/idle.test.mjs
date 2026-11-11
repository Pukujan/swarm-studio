import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idleCost, priceOk, idleKey, idleAspect, idleStartName, idlePrompt, IDLE_SECONDS } from '../engine/idle.mjs'
import { idleSheets, sheetList } from '../engine/game.mjs'
import { idleInput } from '../engine/appjob.mjs'
import { heavyConfig } from '../engine/heavy.mjs'

const spec = { title: 'Rooftop Signal', genre: 'Platformer', view: 'side', hero: 'Mika, a courier in a yellow jacket', look: '2D painted anime', engine: 'Phaser 3' }

test('the price line names the model, the clip and the cost; no video model means no price', () => {
  const c = idleCost({ on: true, provider: 'xai', by: 'Grok Imagine' })
  assert.equal(c.usd, Math.round(0.14 * IDLE_SECONDS * 100) / 100)
  assert.match(c.line, /^Grok Imagine · one 4 s clip · about \$0\.56$/)
  assert.equal(idleCost({ on: true, provider: 'openrouter', model: 'google/veo-3.1-fast', by: 'Veo' }).by, 'Veo 3.1 Fast')
  assert.equal(idleCost({ on: false }), null)
})

test('only the price on the button is accepted', () => {
  const c = idleCost({ on: true, provider: 'xai' })
  assert.ok(priceOk(c, c.usd))
  assert.ok(!priceOk(c, c.usd - 0.1))
  assert.ok(!priceOk(null, 0.56))
})

test('the clip is made on green, on magenta when the figure is green', () => {
  assert.equal(idleKey('a red cape').hex, '#00FF00')
  assert.equal(idleKey('an emerald robe').hex, '#FF00FF')
  assert.equal(idleAspect('xai'), '1:1')
  assert.equal(idleAspect('fal'), '16:9')
})

test('every start image has its own name the image route serves', () => {
  const a = idleStartName('2026-11-11T12-45-22-265Z'), b = idleStartName('2026-11-11T12-45-22-265Z')
  assert.notEqual(a, b)
  assert.match(a, /^idle-[a-z0-9-]{1,56}\.png$/)
})

test('the prompt keeps the camera still, the key flat and assumes no pronoun', () => {
  const p = idlePrompt({ who: 'Mika', look: 'yellow coat' })
  assert.match(p, /Locked-off static camera/)
  assert.match(p, /flat pure green \(#00FF00\)/)
  assert.match(p, /the hair and the coat/)
  assert.doesNotMatch(p, /\b(she|he|her|his)\b/i)
})

test('a yes adds the painted idle and the video one that replaces it', () => {
  const more = idleSheets(spec, [])
  const video = more.find(i => i.video)
  assert.ok(video)
  assert.equal(video.replaces, 'sheet-hero-idle')
  assert.equal(video.after, 'sprite-hero')
  assert.ok(more.some(i => i.id === 'sheet-hero-idle' && !i.video))
  // the painted idle already in the list is not added twice
  const have = [...[sheetList(spec)].flat(2), { id: 'sheet-hero-idle' }]
  assert.equal(idleSheets(spec, have).filter(i => i.id === 'sheet-hero-idle').length, 0)
})

test('the build input says no, a price, or asks', () => {
  assert.equal(idleInput('no'), 'no')
  assert.equal(idleInput(false), 'no')
  assert.deepEqual(idleInput({ usd: '0.56' }), { usd: 0.56 })
  assert.equal(idleInput(undefined), null)
})

test('the heavy machine is an SSH alias or none', () => {
  assert.equal(heavyConfig('/nowhere', { SWARM_HEAVY_HOST: 'mac-pro' }).host, 'mac-pro')
  assert.equal(heavyConfig('/nowhere', { SWARM_HEAVY_HOST: 'a; rm x' }).host, '')
  assert.equal(heavyConfig('/nowhere', {}).python, '')
})
