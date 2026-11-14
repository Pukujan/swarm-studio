// node --test tests/makeways.test.mjs
// The ways to make something (docs/decisions/0020-ask-before-build.md, web/makeways.js): Make offers each kind's ways by
// their plain names, never two to one screen; a kind with one way has no menu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeWays, makeModeOf, makeStudioStep, MAKE_KINDS } from '../web/makeways.js'
import { STEPS } from '../web/nav.js'

const KINDS = ['site', 'app', 'game', 'video', 'deck', 'brand']
const labels = (k, words) => makeWays(k, words).map(w => w.label)

test('every kind the Make menu offers has its ways', () => {
  assert.deepEqual(Object.keys(MAKE_KINDS).sort(), [...KINDS].sort())
  const home = readFileSync(new URL('../web/home.js', import.meta.url), 'utf8')
  for (const k of home.match(/const MAKES = \[[\s\S]*?\n  \]/)[0].matchAll(/\{ k: '([a-z]+)'/g)) assert.ok(MAKE_KINDS[k[1]], k[1])
})

test('Make has two ways, by their plain names: Just make it and Studio (decision 0020)', () => {
  assert.deepEqual(Object.fromEntries(KINDS.map(k => [k, labels(k, true)])), {
    site: ['Just make it', 'Studio'],
    app: ['Just make it', 'Studio'],
    game: ['Just make it', 'Studio'],
    video: ['Just make it', 'Studio'],
    // a deck is built from its Studio's Lock, and a brand is not built: one way, so no menu
    deck: ['Studio'],
    brand: ['Studio']
  })
})

test('no way is called Scaffold, Guided or Three takes any more, in the menu or in what a person reads', () => {
  const old = /Scaffold|Guided|Three takes|Just build/
  for (const k of KINDS) for (const w of makeWays(k, true)) assert.doesNotMatch(w.label, old)
  const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  // the word is never put in front of a person: no quoted or rendered "Scaffold" in either app's screens
  for (const f of ['web/home.js', 'web/scaffold.js', 'web/studio.js', 'web/makeways.js', 'ui/src/screens/projects/MakeBox.tsx', 'ui/src/screens/StudioFirst.tsx']) {
    const code = src(f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(code, /['"`>]\s*Scaffold\b/, f)
  }
})

test('no two ways of a kind share a name or a key, and every one has an icon', () => {
  for (const k of KINDS) {
    const ways = makeWays(k, true)
    assert.equal(new Set(ways.map(w => w.k)).size, ways.length, k)
    assert.equal(new Set(ways.map(w => w.label)).size, ways.length, k)
    for (const w of ways) assert.ok(w.icon, `${k} ${w.label}`)
  }
})

test('an empty box offers only the Studio, whose chat asks what it is: one way, so no menu', () => {
  assert.deepEqual(Object.fromEntries(KINDS.map(k => [k, labels(k, false)])), {
    site: ['Studio'], app: ['Studio'], video: ['Studio'], deck: ['Studio'], game: ['Studio'], brand: ['Studio']
  })
  assert.deepEqual(makeWays('nope', true), makeWays('site', true))
})

test('the Studio opens where the kind starts, and no way narrows its steps', () => {
  for (const k of KINDS) for (const w of makeWays(k, true)) { assert.equal(w.steps, undefined); assert.equal(w.step, undefined) }
  assert.equal(makeStudioStep('site'), 'brand'); assert.equal(makeStudioStep('brand'), 'brand')
  for (const k of ['app', 'video', 'deck']) assert.equal(makeStudioStep(k), 'plan')
  for (const k of KINDS) assert.ok(STEPS.includes(makeStudioStep(k)))
})

test('the way remembered for a kind pre-selects; one that is no longer offered is forgotten', () => {
  assert.equal(makeModeOf('now'), 'now'); assert.equal(makeModeOf('studio'), 'studio')
  for (const old of ['guided', 'takes', 'scaffold', 'brand']) assert.equal(makeModeOf(old), null)
  assert.equal(makeModeOf(null), null)
})
