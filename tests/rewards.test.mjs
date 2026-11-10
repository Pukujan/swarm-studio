import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sitePrompt } from '../engine/appjob.mjs'
import { gamePrompt, gameSlug } from '../engine/game.mjs'

const snap = { brand: 'Search Flights', brief: 'flight ticket booking app', pages: [{ id: 'home', title: 'Home', sections: [{ role: 'hero' }] }] }
const spec = { title: 'Amber Ascent', pitch: 'a climb', engine: 'Phaser', enemies: [], screens: [] }

test('an app build for a site with a promo game gets rewards with made-up partners', () => {
  assert.doesNotMatch(sitePrompt(snap, ''), /Rewards:/)
  const p = sitePrompt(snap, '', null, [{ title: 'Amber Ascent', slug: gameSlug('Amber Ascent') }])
  assert.match(p, /Rewards: .*"Amber Ascent", \?game=amber-ascent/)
  assert.match(p, /made-up partner/)
  assert.match(p, /Never use a real company's name/)
  assert.doesNotMatch(sitePrompt(snap, 'make the header darker', null, [{ title: 'x', slug: 'x' }]), /Rewards:/)
})

test('a promo game links back with points only when the site has an address', () => {
  const off = gamePrompt({ ...spec, brand: { name: 'Search Flights' } })
  assert.match(off, /not online yet, so the game links nowhere/)
  assert.match(off, /Never write a web address that is not given here/)
  const on = gamePrompt({ ...spec, brand: { name: 'Search Flights', url: 'https://x.github.io/search-flights/' } })
  assert.match(on, /https:\/\/x\.github\.io\/search-flights\/\?game=amber-ascent&points=N/)
  assert.match(on, /Claim N points at Search Flights/)
})
