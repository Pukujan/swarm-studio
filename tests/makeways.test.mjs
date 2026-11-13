// node --test tests/makeways.test.mjs
// The ways to make something (docs/specs/42-ways-to-make.md, web/makeways.js): Make offers each kind's ways by
// their plain names, never two to one screen; a kind with one way has no menu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeWays, makeModeOf, makeStudioStep, MAKE_KINDS } from '../web/makeways.js'
import { STEPS } from '../web/nav.js'
import { STEPS as RECORD_STEPS } from '../engine/studio.mjs'

const KINDS = ['site', 'app', 'game', 'video', 'deck', 'brand']
const labels = (k, words) => makeWays(k, words).map(w => w.label)

test('every kind the Make menu offers has its ways', () => {
  assert.deepEqual(Object.keys(MAKE_KINDS).sort(), [...KINDS].sort())
  const home = readFileSync(new URL('../web/home.js', import.meta.url), 'utf8')
  for (const k of home.match(/const MAKES = \[[\s\S]*?\n  \]/)[0].matchAll(/\{ k: '([a-z]+)'/g)) assert.ok(MAKE_KINDS[k[1]], k[1])
})

test('each kind offers the ways spec 42 lists, by their plain names', () => {
  assert.deepEqual(Object.fromEntries(KINDS.map(k => [k, labels(k, true)])), {
    site: ['Just build', 'Guided', 'Three takes', 'Scaffold', 'Studio'],
    app: ['Just build', 'Guided', 'Three takes', 'Scaffold', 'Studio'],
    game: ['Just build', 'Guided'],
    video: ['Just build', 'Guided', 'Three takes', 'Scaffold', 'Studio'],
    deck: ['Three takes', 'Scaffold', 'Studio'],
    brand: ['Three takes', 'Studio']
  })
})

test('no two ways of a kind share a name or a key, and every one has an icon', () => {
  for (const k of KINDS) {
    const ways = makeWays(k, true)
    assert.equal(new Set(ways.map(w => w.k)).size, ways.length, k)
    assert.equal(new Set(ways.map(w => w.label)).size, ways.length, k)
    for (const w of ways) assert.ok(w.icon, `${k} ${w.label}`)
  }
})

test('an empty box offers only the ways that can ask; a kind left with one way has no menu', () => {
  assert.deepEqual(Object.fromEntries(KINDS.map(k => [k, labels(k, false)])), {
    site: ['Scaffold', 'Studio'], app: ['Scaffold', 'Studio'], video: ['Scaffold', 'Studio'], deck: ['Scaffold', 'Studio'],
    // a game's Guided talk asks what it is
    game: ['Guided'], brand: ['Studio']
  })
  assert.deepEqual(makeWays('nope', true), makeWays('site', true))
})

test('a Scaffold is a Studio with only its Plan step; the Studio opens where the kind starts', () => {
  const scaffold = makeWays('deck', false).find(w => w.k === 'scaffold')
  assert.deepEqual(scaffold.steps, ['plan']); assert.equal(scaffold.step, 'plan')
  for (const s of scaffold.steps) assert.ok(RECORD_STEPS.includes(s))
  assert.equal(makeStudioStep('site'), 'brand'); assert.equal(makeStudioStep('brand'), 'brand')
  for (const k of ['app', 'video', 'deck']) assert.equal(makeStudioStep(k), 'plan')
  for (const k of KINDS) assert.ok(STEPS.includes(makeStudioStep(k)))
})

test('a way remembered before spec 42 still pre-selects; anything else does not', () => {
  assert.equal(makeModeOf('now'), 'now'); assert.equal(makeModeOf('studio'), 'studio')
  assert.equal(makeModeOf('brand'), null); assert.equal(makeModeOf(null), null)
})
