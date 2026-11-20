// The Game room's own rules (src/screens/game/model.ts) with the classic stage rules it follows
// (web/canvas/stage.js): each state the room draws puts the right thing on the stage. Node runs the TypeScript
// files as they are (type stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stageNow } from '../../web/canvas/stage.js'
import { sliceWords } from '../../web/canvas/wander.js'
import { failLine, frameUrl, saidYes, saysBroken, sliceKey, stageBuild, stopSummary } from '../src/screens/game/model.ts'
import { sheet, STATES } from '../src/screens/game/game.fixture.ts'

const now = (app, painted, o, pin = null) => stageNow(stageBuild({ app, sheet: sheet(painted), map: { tabs: [] } }, o), pin)

test('while the crew builds, the stage shows the crew, over the art sheet until there is a game', () => {
  const n = now(STATES.building, 3)
  assert.equal(n.shown, 'crew')
  assert.deepEqual(n.offers, ['crew', 'art', 'map'])
  assert.equal(n.sheet, true)
})

test('a built game that runs is on the stage, and Crew is no longer offered', () => {
  const n = now(STATES.playable, 8)
  assert.equal(n.shown, 'live')
  assert.equal(n.empty, false)
  assert.deepEqual(n.offers, ['art', 'live', 'map'])
})

test('a pin holds a view, and is dropped once its view is gone', () => {
  assert.equal(now(STATES.playable, 8, undefined, 'art').shown, 'art')
  assert.equal(now(STATES.playable, 8, undefined, 'crew').pin, null)
})

test('a game waiting after a slice offers Live, and asks for its server only when Live is shown', () => {
  assert.equal(now(STATES.waiting, 8).shown, 'art')
  assert.ok(now(STATES.waiting, 8).offers.includes('live'))
  assert.equal(now(STATES.waiting, 8).open, false)
  assert.equal(now(STATES.waiting, 8, undefined, 'live').open, true)
  // while it starts, and after a try that failed, the room does not ask again
  assert.equal(now(STATES.waiting, 8, { opening: true, failed: false }, 'live').open, false)
  assert.ok(!now(STATES.waiting, 8, { opening: false, failed: true }).offers.includes('live'))
})

test('a failed or stopped build shows the room\'s card', () => {
  for (const s of [STATES.failed, STATES.stopped, STATES.noArt]) {
    const n = now(s, 0)
    assert.equal(n.shown === 'card' || n.shown === 'map', true)
    assert.equal(n.auto, 'card')
    assert.equal(n.sheet, false)
  }
})

test('a waiting slice reads in the chat as the classic room says it', () => {
  const ok = sliceWords(STATES.waiting.slice, null, STATES.waiting.steps)
  assert.equal(ok.failed, false)
  assert.equal(ok.ideas.length, 3)
  const bad = sliceWords(STATES.waitingFailed.slice, null, STATES.waitingFailed.steps)
  assert.equal(bad.noStart, true)
  assert.deepEqual(bad.ideas, ['Fix it', 'Go on to slice 3, The market'])
})

test('a stopped build says what it had done', () => {
  assert.equal(stopSummary(STATES.stopped.steps), '3/8 pictures · stage 2 of 4')
  assert.equal(stopSummary([]), 'nothing built yet')
})

test('a failure is its first line, with long paths cut short', () => {
  assert.equal(failLine('boom at /Users/a/b/c/d.mjs\nmore'), 'boom at …/c/d.mjs')
  assert.equal(failLine(''), 'The engine stopped before the game built.')
})

test('a loopback address is framed under the Studio\'s own name', () => {
  assert.equal(frameUrl('http://127.0.0.1:5200/', 'http://localhost:4319/next/'), 'http://localhost:5200/')
  assert.equal(frameUrl('https://example.com/', 'http://localhost:4319/'), 'https://example.com/')
})

test('a slice\'s card has one key, a typed yes is a yes, and words about something broken are a fix', () => {
  assert.equal(sliceKey('r1', { i: 1, n: 4, clip: '/c.webm' }), 'r1:1:/c.webm:')
  assert.ok(saidYes(' Yes please '))
  assert.ok(!saidYes('yes, and add a boss'))
  assert.ok(saysBroken('the jump is broken'))
  assert.ok(!saysBroken('add a boss'))
})
