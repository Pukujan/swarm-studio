// node --test tests/makeways.test.mjs
// How each kind is made (docs/specs/37-studio-first.md, web/makeways.js): Make offers only ways that go to
// different places, each named by where it goes; a kind with one way has no menu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeWays, MAKE_WAYS } from '../web/makeways.js'
import { STEPS } from '../web/nav.js'

const KINDS = ['site', 'app', 'game', 'video', 'deck', 'brand']
const where = w => `${w.k}:${w.step || ''}`

test('every kind has its ways, and every kind the Make menu offers is in the table', () => {
  assert.deepEqual(Object.keys(MAKE_WAYS).sort(), [...KINDS].sort())
  const home = readFileSync(new URL('../web/home.js', import.meta.url), 'utf8')
  for (const k of home.match(/const MAKES = \[[\s\S]*?\n  \]/)[0].matchAll(/\{ k: '([a-z]+)'/g)) assert.ok(MAKE_WAYS[k[1]], k[1])
})

test('no two ways of a kind go to the same place or share a name', () => {
  for (const k of KINDS) {
    const ways = makeWays(k, true)
    assert.equal(new Set(ways.map(where)).size, ways.length, k)
    assert.equal(new Set(ways.map(w => w.label)).size, ways.length, k)
    // every item has an icon (docs/ux/RULES.md: in a menu every item has one or none do)
    for (const w of ways) assert.ok(w.icon, `${k} ${w.label}`)
  }
})

test('the brand sheet is not a way of its own: a Studio way opens on a real step', () => {
  for (const k of KINDS) for (const w of makeWays(k, true)) {
    assert.doesNotMatch(w.label, /Brand sheet/)
    if (w.k === 'studio' && k !== 'game') assert.ok(STEPS.includes(w.step), `${k} ${w.step}`)
  }
})

test('each kind starts where it should', () => {
  const ways = Object.fromEntries(KINDS.map(k => [k, makeWays(k, true).map(w => [w.label, w.step || null])]))
  assert.deepEqual(ways, {
    site: [['Studio · Brand', 'brand'], ['Build now', null]],
    app: [['Studio · Screens', 'plan'], ['Build now', null]],
    game: [['Plan board', null], ['Build now', null]],
    video: [['Studio · Storyboard', 'plan'], ['Build now', null]],
    // a deck starts from its outline, not the brand
    deck: [['Studio · Outline', 'plan']],
    brand: [['Studio · Brand', 'brand']]
  })
})

test('Build now needs the words; a Brand or a Deck is made in the Studio only, so Make goes straight there', () => {
  for (const k of KINDS) {
    assert.ok(!makeWays(k, false).some(w => w.k === 'now'), k)
    assert.equal(makeWays(k, false).length, 1, k)
  }
  assert.equal(makeWays('deck', true).length, 1)
  assert.equal(makeWays('brand', true).length, 1)
  assert.equal(makeWays('site', true).length, 2)
  // an unknown kind is made as a website
  assert.deepEqual(makeWays('nope', true), makeWays('site', true))
})
