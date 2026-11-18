// The handover to the build (issue #666). With every picture painted, nextStep used to offer only "Read the plan":
// the chat said "Next: build the game from the plan" and gave no way to build it, and it went on saying exactly that
// after a build had failed, because the plan's own state cannot know the app engine ever ran.
//
// env.app is the app engine's real state for the run. These pin what the chat does with each of its states.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextStep } from '../engine/gamestep.mjs'

// a plan with every picture painted: locked, both sheets picked, close-ups and mocks and backdrops done
const finished = () => ({
  id: 'p-1',
  cards: [{ id: 'world', body: { stages: '3' } }, { id: 'enemies', body: {} }, { id: 'cast', body: {} }],
  settings: { stages: 3, backdropsPerStage: 3, polycount: 40000, clips: 8 },
  shape: {},
  art: { sheets: ['cast', 'weapons'], shots: [['combat'], ['boss']] },
  gate: { locked: true },
  style: { locked: true },
  engine: { target: 'web' },
  sheets: [
    { id: 's1', kind: 'cast', grid: [5, 4], state: 'done', picks: [1, 5, 9], notes: { 1: 'Hero 1', 5: 'Hero 2', 9: 'Hero 3' } },
    { id: 's2', kind: 'weapons', grid: [5, 4], state: 'done', picks: [7], notes: {} }
  ],
  mocks: [{ id: 'm1', shot: 'combat', state: 'done' }, { id: 'm2', shot: 'boss', state: 'done' }],
  backdrops: Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, stage: Math.floor(i / 3), n: i % 3, state: 'done' })),
  build: { characters: ['Hero 1', 'Hero 2', 'Hero 3'].map(n => ({ name: n, state: 'done', cutin: { state: 'done' }, portrait: { state: 'done' } })) },
  systems: {}, starter: {}
})

const chat = () => ({ turns: [], decisions: {}, skip: [], godot: 'web' })
const ids = step => (step.options || []).map(o => o.id)

test('every picture painted and nothing built: the one next step is the build itself', () => {
  const step = nextStep(chat(), finished(), { godot: true, app: { state: 'idle', hasApp: false } })
  assert.deepEqual(ids(step), ['do:app', 'start:design'], 'the build comes before reading the plan')
  assert.equal(step.options[0].label, 'Build the game')
  assert.match(step.text, /Next: build the game from the plan/)
})

test('a build that failed says so, and offers the build again rather than reading the plan', () => {
  const step = nextStep(chat(), finished(), { godot: true, app: { state: 'failed', hasApp: false, message: 'typecheck failed: cannot find name Crew' } })
  assert.deepEqual(ids(step)[0], 'do:app')
  assert.equal(step.options[0].label, 'Try again')
  assert.match(step.text, /The game did not build: typecheck failed/)
  assert.match(step.text, /Nothing in the plan is lost/)
  // the plan is not called done when the build failed
  assert.notEqual(step.done, true)
})

test('a build running: nothing to press, and the chat waits on it', () => {
  const step = nextStep(chat(), finished(), { godot: true, app: { state: 'working', hasApp: false } })
  assert.equal(step.wait, true)
  assert.deepEqual(step.options, [])
  assert.match(step.text, /The game is building/)
})

test('a game that is built says so', () => {
  const step = nextStep(chat(), finished(), { godot: true, app: { state: 'done', hasApp: true } })
  assert.match(step.text, /The game is built/)
  assert.ok(!ids(step).includes('do:app'), 'nothing to build again')
})

test('with no app state known the chat still says what to do, and does not claim anything', () => {
  // before the app engine has ever been asked (a fresh server, a run with no events)
  const step = nextStep(chat(), finished(), { godot: true, app: null })
  assert.deepEqual(ids(step), ['do:app', 'start:design'])
  assert.match(step.text, /Next: build the game from the plan/)
})

test('the earlier steps are unchanged: the build is offered only once the pictures are done', () => {
  const half = finished()
  half.mocks = half.mocks.map(m => ({ ...m, state: 'none' }))
  const step = nextStep(chat(), half, { godot: true, app: { state: 'idle', hasApp: false } })
  assert.deepEqual(ids(step), ['do:mocks'], 'still painting mocks')
})
