// What Hermia says as the Studio's walk goes (#541, web/walkline.js): one line per step done or skipped, what it
// meant and what's next, the same in both Studios
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WALK_SAYS, nextStep, walkNext, walkLine, moodLine } from '../web/walkline.js'

const NAMES = { references: 'What you have', assets: 'Assets', brand: 'Brand', proposal: 'Lock', plan: 'Plan' }
const ORDER = ['references', 'assets', 'brand', 'proposal', 'plan']
const of = states => s => states[s] || 'empty'

test('every step of the walk has what it meant and what it asks for, each one short line', () => {
  for (const s of ORDER) {
    assert.ok(WALK_SAYS[s]?.done && WALK_SAYS[s]?.next, s)
    assert.ok(WALK_SAYS[s].done.length <= 70 && WALK_SAYS[s].next.length <= 70, s)
    assert.doesNotMatch(`${WALK_SAYS[s].done} ${WALK_SAYS[s].next}`, /\bpacks?\b/i, 'no "pack" (decision 0015)')
  }
})

test('the next step is the first open one after where the walk is, else the first open one', () => {
  assert.equal(nextStep(ORDER, of({})), 'references')
  assert.equal(nextStep(ORDER, of({ references: 'skipped', assets: 'done' })), 'brand')
  assert.equal(nextStep(ORDER, of({ brand: 'done' }), 'brand'), 'proposal')
  assert.equal(nextStep(ORDER, of(Object.fromEntries(ORDER.map(s => [s, 'done'])))), null)
})

test('a step done says what it meant and what is next, with Skip; Lock is never offered to skip', () => {
  assert.equal(walkLine({ step: 'references', how: 'done', next: 'assets', names: NAMES }),
    'Got it: what you brought is in. Next: Assets, logos and photos the crew should use as they are. Or skip it.')
  assert.equal(walkLine({ step: 'assets', how: 'skipped', next: 'brand', names: NAMES }),
    'Assets skipped. Next: Brand, pick one of three moods. Or skip it.')
  assert.equal(walkNext('proposal', NAMES), 'Next: Lock, lock the look so the build holds to it.')
  assert.equal(walkLine({ step: 'plan', how: 'done', next: null, names: NAMES }), "The pages are set. That's every step: press Build when you're ready.")
})

test('a mood picked says what follows from it, then what is next', () => {
  assert.equal(moodLine('Cafe', 'proposal', NAMES), 'Cafe it is: the moodboard, colours, type and voice follow from it. Next: Lock, lock the look so the build holds to it.')
  assert.equal(moodLine('Cafe', null, NAMES), 'Cafe it is: the moodboard, colours, type and voice follow from it.')
})
