import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { skinJobs, fxJobs, fxAt } from '../engine/skins.mjs'
import { voiceJobs } from '../engine/voice.mjs'

const heroes = JSON.parse(readFileSync(new URL('../games/ares/data/heroes.json', import.meta.url), 'utf8'))
const game = fileURLToPath(new URL('../games/ares/', import.meta.url))

test('every outfit job carries the look, the layout contract and the design picture first', () => {
  for (const hero of Object.keys(heroes.heroes)) {
    const jobs = skinJobs(heroes, { root: 'g', hero })
    assert.ok(jobs.length >= 8, hero)
    for (const j of jobs) {
      // a hero's own art.layout overrides the shared sheet.layout (skinJobs does the same)
      assert.ok(j.prompt.includes(heroes.heroes[hero].art.layout || heroes.sheet.layout), `${hero}/${j.sheet}`)
      assert.equal(j.refs[0], `g/${heroes.heroes[hero].art.outfits.default.design}`)
      assert.equal(j.out.replaceAll('\\', '/'), `g/assets/skins/${hero}/default/${j.sheet}.webp`)
    }
  }
})

test('the design pictures and every built sheet are in the game', () => {
  for (const [hero, h] of Object.entries(heroes.heroes)) {
    assert.ok(existsSync(game + h.art.outfits.default.design), hero)
    const pack = JSON.parse(readFileSync(`${game}assets/skins/${hero}/default/pack.json`, 'utf8'))
    for (const name of Object.keys(h.art.sheets)) assert.ok(pack.sheets[name]?.file, `${hero}/${name}`)
  }
})

test('only, unknown hero and missing outfit', () => {
  assert.deepEqual(skinJobs(heroes, { hero: 'runner', only: ['o-idle'] }).map(j => j.sheet), ['o-idle'])
  assert.throws(() => skinJobs(heroes, { hero: 'nobody' }), /no hero/)
  assert.throws(() => skinJobs(heroes, { hero: 'runner', outfit: 'nope' }), /no outfit/)
})

test('effect jobs and levels', () => {
  assert.ok(fxJobs(heroes).every(j => j.fx && j.prompt.includes('black background')))
  const feather = heroes.heroes.runner.moves.feather
  assert.equal(fxAt(feather, 1).art, 'feather-1')
  assert.equal(fxAt(feather, 3).art, 'feather-5')
  assert.equal(fxAt(feather, 9).level, 5)
  assert.equal(fxAt(feather, 0), null)
})

test('a level that renames a move gets its own recorded line', () => {
  assert.ok(voiceJobs(heroes).some(j => j.hero === 'runner' && j.key === 'feather-lv5'))
})
