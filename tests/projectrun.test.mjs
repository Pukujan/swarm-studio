// Which run a project's view shows (web/route.js projectRun): the one that was asked for, never the
// one the canvas happens to hold while the asked one loads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectRun } from '../web/route.js'

const A = '2026-11-11T12-45-22-265Z', B = '2026-11-11T23-21-35-958Z'

test('a project opened from its card shows its own run while the canvas still holds another', () => {
  // the owner's case: Rooftop Signal clicked, the canvas still on the last website build
  assert.equal(projectRun({ asked: A, viewing: B, live: B }), A)
  assert.equal(projectRun({ asked: A, viewing: null, live: B }), A)
})

test('back from a room while the run is still loading keeps the run that was asked for', () => {
  assert.equal(projectRun({ opening: A, viewing: B, live: B }), A)
})

test('with nothing asked for, the run the canvas shows; then the live one', () => {
  assert.equal(projectRun({ viewing: A, live: B }), A)
  assert.equal(projectRun({ live: B }), B)
  assert.equal(projectRun({}), null)
})
