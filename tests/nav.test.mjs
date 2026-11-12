// Where the person is (web/nav.js, docs/specs/34-navigation-state.md): every row of the events table,
// the moves the machine does not have (so a mixed screen cannot be drawn), and the address.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createActor } from '../web/vendor/xstate/xstate.mjs'
import { navMachine, view, toAddress, fromAddress, makeNav } from '../web/nav.js'

// a fresh machine taken through the events; each must be a move it has
const at = (...events) => {
  const a = createActor(navMachine).start()
  for (const e of events) { assert.ok(a.getSnapshot().can(e), `no ${e.type} from ${view(a.getSnapshot()).room}`); a.send(e) }
  return a
}
const v = (...events) => view(at(...events).getSnapshot())
const no = (events, e) => assert.equal(at(...events).getSnapshot().can(e), false, `${e.type} should not be a move`)
const A = { type: 'open.project', project: 'pa', version: 'ra1' }
const pick = (s, keys) => keys.map(k => s[k])

test('Projects is where it starts, with nothing open', () => {
  assert.deepEqual(pick(v(), ['room', 'project', 'version', 'run', 'player']), ['home', null, null, null, 'closed'])
})

test('opening a project shows its version on the Overview, with no player', () => {
  assert.deepEqual(pick(v(A), ['room', 'project', 'version', 'run', 'player']), ['overview', 'pa', 'ra1', 'ra1', 'closed'])
  no([], { type: 'open.project' })
})

test('opening a project closes a player left open on another one', () => {
  const s = v(A, { type: 'play', page: 'home' }, { type: 'home' }, { type: 'open.project', project: 'pb', version: 'rb2' })
  assert.deepEqual(pick(s, ['project', 'run', 'player', 'page']), ['pb', 'rb2', 'closed', null])
})

test('home closes the player and keeps the project for Back', () => {
  assert.deepEqual(pick(v(A, { type: 'play' }, { type: 'home' }), ['room', 'player', 'project']), ['home', 'closed', 'pa'])
})

test('a version opens inside the open project, in the same room, and closes the player', () => {
  const s = v(A, { type: 'room', room: 'deck' }, { type: 'play' }, { type: 'open.version', version: 'ra0' })
  assert.deepEqual(pick(s, ['room', 'version', 'run', 'player']), ['deck', 'ra0', 'ra0', 'closed'])
  assert.equal(v(A, { type: 'room', room: 'video' }, { type: 'open.version', version: 'ra0' }).room, 'video')
  // from the game room a version opens on its Overview
  assert.equal(v(A, { type: 'room', room: 'game', run: 'rg' }, { type: 'open.version', version: 'ra0' }).room, 'overview')
  no([], { type: 'open.version', version: 'ra0' })
  no([A], { type: 'open.version' })
})

test('a build the person started is shown and waited for; the stream only clears the wait', () => {
  const a = at(A, { type: 'started', run: 'rn', project: 'pa' })
  assert.deepEqual(pick(view(a.getSnapshot()), ['room', 'run', 'version', 'pending']), ['deck', 'rn', 'rn', 'rn'])
  a.send({ type: 'streamed', run: 'other' })
  assert.deepEqual(pick(view(a.getSnapshot()), ['run', 'pending']), ['rn', 'rn'])
  a.send({ type: 'streamed', run: 'rn' })
  assert.deepEqual(pick(view(a.getSnapshot()), ['run', 'pending']), ['rn', null])
  assert.equal(v({ type: 'started', run: 'rh', room: 'overview' }).room, 'overview')
  no([], { type: 'started' })
  no([], { type: 'started', run: 'rx', room: 'plan' })
})

test('the stream never changes the project, version, run, room or player', () => {
  for (const events of [[], [A], [A, { type: 'room', room: 'deck' }, { type: 'play' }], [{ type: 'brand' }], [{ type: 'plan', plan: 'p1' }]]) {
    const before = v(...events)
    const after = v(...events, { type: 'streamed', run: 'neon' })
    assert.deepEqual(after, before)
  }
})

test('rooms need a build; the game room shows the game run, the others the version', () => {
  for (const room of ['overview', 'deck', 'app', 'video']) {
    assert.equal(v(A, { type: 'room', room }).room, room)
    no([], { type: 'room', room })
  }
  const g = v(A, { type: 'room', room: 'game', run: 'rg' })
  assert.deepEqual(pick(g, ['room', 'run', 'version']), ['game', 'rg', 'ra1'])
  assert.equal(v(A, { type: 'room', room: 'game', run: 'rg' }, { type: 'room', room: 'deck' }).run, 'ra1')
  no([A], { type: 'room', room: 'game' })
  no([], { type: 'room', room: 'game', run: 'rg' })
  no([A], { type: 'room', room: 'home' })
  no([A], { type: 'room', room: 'nowhere' })
})

test('entering a room closes the player, even the room it is in', () => {
  for (const room of ['overview', 'deck', 'app', 'video']) assert.equal(v(A, { type: 'watch' }, { type: 'room', room }).player, 'closed', room)
})

test('plans and the brand sheet; leaving the sheet goes back where it came from', () => {
  assert.deepEqual(pick(v(A, { type: 'play' }, { type: 'plan', plan: 'pl1' }), ['room', 'plan', 'player']), ['plan', 'pl1', 'closed'])
  no([], { type: 'plan' })
  const b = [A, { type: 'room', room: 'deck' }, { type: 'brand' }]
  assert.deepEqual(pick(v(...b), ['room', 'from']), ['brand', 'deck'])
  no(b, { type: 'brand' })
  assert.deepEqual(pick(v(...b, { type: 'back' }), ['room', 'from']), ['deck', null])
  assert.equal(v({ type: 'plan', plan: 'pl1' }, { type: 'brand' }, { type: 'back' }).room, 'plan')
  assert.equal(v(A, { type: 'room', room: 'game', run: 'rg' }, { type: 'brand' }, { type: 'back' }).room, 'game')
  assert.equal(v({ type: 'brand' }, { type: 'back' }).room, 'home')
  no([A], { type: 'back' })
})

test('the player opens only over a build with pages, in the Overview, deck or app', () => {
  let s = v(A, { type: 'watch', page: 'home' })
  assert.deepEqual(pick(s, ['player', 'page']), ['visitor', 'home'])
  s = v(A, { type: 'watch', page: 'home' }, { type: 'stop' }, { type: 'page', page: 'more' })
  assert.deepEqual(pick(s, ['player', 'page']), ['prototype', 'more'])
  assert.equal(v(A, { type: 'play' }, { type: 'close' }).player, 'closed')
  for (const room of ['overview', 'deck', 'app']) assert.equal(v(A, { type: 'room', room }, { type: 'play' }).player, 'prototype', room)
  no([], { type: 'play' })
  no([{ type: 'plan', plan: 'pl1' }], { type: 'play' })
  no([{ type: 'brand' }], { type: 'play' })
  no([A, { type: 'room', room: 'video' }], { type: 'play' })
  no([A, { type: 'room', room: 'game', run: 'rg' }], { type: 'watch' })
  no([A], { type: 'play', pages: 0 })
  no([A], { type: 'page', page: 'more' })
  no([A], { type: 'stop' })
  no([A], { type: 'close' })
  no([A, { type: 'play' }], { type: 'stop' })
})

test('a replay plays in the deck only and ends on leaving it', () => {
  const d = [A, { type: 'room', room: 'deck' }, { type: 'replay', on: true }]
  assert.equal(v(...d).replay, true)
  assert.equal(v(...d, { type: 'replay', on: false }).replay, false)
  assert.equal(v(...d, { type: 'room', room: 'app' }).replay, false)
  assert.equal(v(...d, { type: 'home' }).replay, false)
  no([A], { type: 'replay', on: true })
  no([A], { type: 'nonsense' })
})

test('the address carries the same state, and a reload shows exactly it', () => {
  const cases = [
    [],
    [A],
    [A, { type: 'room', room: 'deck' }],
    [A, { type: 'room', room: 'app' }, { type: 'watch', page: 'home' }],
    [A, { type: 'play', page: 'more' }],
    [A, { type: 'room', room: 'video' }],
    [A, { type: 'room', room: 'game', run: 'rg' }],
    [{ type: 'plan', plan: 'pl1' }]
  ]
  for (const events of cases) {
    const s = v(...events)
    const back = view(at(...fromAddress(toAddress(s))).getSnapshot())
    for (const k of ['room', 'project', 'version', 'run', 'plan', 'player', 'page']) assert.equal(back[k], s[k], `${toAddress(s)} ${k}`)
  }
  // the brand sheet is not an address of its own: a reload shows where it was opened from
  assert.equal(toAddress(v(A, { type: 'brand' })), toAddress(v(A)))
})

test('an address that asks for something impossible opens what fits, never a mixed screen', () => {
  const load = search => { const n = makeNav({ search, log: () => {} }); return n.view }
  assert.equal(load('?play=prototype').player, 'closed')
  assert.equal(load('?room=deck').room, 'home')
  assert.equal(load('?version=<script>').room, 'home')
  assert.deepEqual(pick(load('?run=r1'), ['room', 'version']), ['overview', 'r1'])
  assert.deepEqual(pick(load('?replay=r1'), ['room', 'run', 'replay']), ['deck', 'r1', true])
  assert.deepEqual(pick(load('?version=r1&room=video&play=prototype'), ['room', 'player']), ['video', 'closed'])
})

test('the door: go() moves it, a move it does not have is logged and changes nothing', () => {
  const said = []
  const nav = makeNav({ log: m => said.push(m) })
  let calls = 0
  nav.subscribe(() => calls++)
  assert.equal(nav.go({ type: 'play' }), null)
  assert.equal(said[0], 'nav: no play from home')
  nav.go(A)
  assert.equal(calls, 1)
  assert.equal(nav.view.run, 'ra1')
  assert.equal(nav.address(), '?project=pa&version=ra1')
  nav.go({ type: 'streamed', run: 'neon' })
  assert.equal(calls, 1, 'a change of nothing tells nobody')
  nav.go({ type: 'room', room: 'deck' })
  assert.equal(nav.restore('?project=pb&version=rb1&room=app').room, 'app')
  assert.equal(nav.view.project, 'pb')
})
