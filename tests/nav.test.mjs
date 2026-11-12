// Where the person is (web/nav.js, docs/specs/34-navigation-state.md): every row of the transition
// table, the refusals that stop a mixed screen, and the address.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { step, START, toAddress, fromAddress, makeNav } from '../web/nav.js'

const run = (s, ...actions) => actions.reduce((x, a) => { const r = step(x, a); assert.ok(r.state, `${a.type} refused: ${r.refused}`); return r.state }, s)
const refused = (s, a) => { const r = step(s, a); assert.ok(r.refused, `${a.type} should be refused`); return r.refused }
const A = { type: 'openProject', project: 'pa', version: 'ra1' }
const inA = run(START, A)

test('opening a project shows its version on the Overview, with no player', () => {
  const s = run(START, A)
  assert.deepEqual([s.room, s.project, s.version, s.run, s.player], ['overview', 'pa', 'ra1', 'ra1', 'closed'])
  refused(START, { type: 'openProject' })
})

test('opening a project closes a player left open on another one', () => {
  const s = run(START, A, { type: 'play', page: 'home' }, { type: 'home' }, { type: 'openProject', project: 'pb', version: 'rb2' })
  assert.deepEqual([s.project, s.run, s.player, s.page], ['pb', 'rb2', 'closed', null])
})

test('home closes the player and keeps the project for Back', () => {
  const s = run(inA, { type: 'play' }, { type: 'home' })
  assert.deepEqual([s.room, s.player, s.project], ['home', 'closed', 'pa'])
})

test('a version opens inside the open project and closes the player', () => {
  const s = run(inA, { type: 'enterRoom', room: 'deck' }, { type: 'play' }, { type: 'openVersion', version: 'ra0' })
  assert.deepEqual([s.room, s.version, s.run, s.player], ['deck', 'ra0', 'ra0', 'closed'])
  refused(START, { type: 'openVersion', version: 'ra0' })
  refused(inA, { type: 'openVersion' })
  // from the game room a version opens on its Overview
  assert.equal(run(inA, { type: 'enterRoom', room: 'game', run: 'rg' }, { type: 'openVersion', version: 'ra0' }).room, 'overview')
})

test('a build the person started is shown and waited for; the stream only clears the wait', () => {
  let s = run(inA, { type: 'started', run: 'rn', project: 'pa' })
  assert.deepEqual([s.room, s.run, s.version, s.pending], ['deck', 'rn', 'rn', 'rn'])
  s = run(s, { type: 'streamed', run: 'other' })
  assert.deepEqual([s.run, s.pending], ['rn', 'rn'])
  s = run(s, { type: 'streamed', run: 'rn' })
  assert.deepEqual([s.run, s.pending], ['rn', null])
  assert.equal(run(START, { type: 'started', run: 'rh', room: 'overview' }).room, 'overview')
  refused(START, { type: 'started' })
  refused(START, { type: 'started', run: 'rx', room: 'plan' })
})

test('the stream never changes the project, version, run or room', () => {
  for (const s of [START, inA, run(inA, { type: 'enterRoom', room: 'deck' }, { type: 'play' })]) {
    const after = run(s, { type: 'streamed', run: 'neon' })
    for (const k of ['project', 'version', 'run', 'room', 'player']) assert.equal(after[k], s[k], k)
  }
})

test('rooms need a build; the game room shows the game run, the others the version', () => {
  for (const room of ['overview', 'deck', 'app', 'video']) {
    assert.equal(run(inA, { type: 'enterRoom', room }).room, room)
    refused(START, { type: 'enterRoom', room })
  }
  const g = run(inA, { type: 'enterRoom', room: 'game', run: 'rg' })
  assert.deepEqual([g.room, g.run, g.version], ['game', 'rg', 'ra1'])
  assert.equal(run(g, { type: 'enterRoom', room: 'deck' }).run, 'ra1')
  refused(inA, { type: 'enterRoom', room: 'game' })
  refused(START, { type: 'enterRoom', room: 'game', run: 'rg' })
  refused(inA, { type: 'enterRoom', room: 'home' })
  refused(inA, { type: 'enterRoom', room: 'nowhere' })
  // entering a room closes the player
  assert.equal(run(inA, { type: 'play' }, { type: 'enterRoom', room: 'deck' }).player, 'closed')
})

test('plans and the brand sheet; leaving the sheet goes back where it came from', () => {
  const p = run(inA, { type: 'play' }, { type: 'openPlan', plan: 'pl1' })
  assert.deepEqual([p.room, p.plan, p.player], ['plan', 'pl1', 'closed'])
  refused(START, { type: 'openPlan' })
  const b = run(inA, { type: 'enterRoom', room: 'deck' }, { type: 'openBrand' }, { type: 'openBrand' })
  assert.deepEqual([b.room, b.from], ['brand', 'deck'])
  assert.equal(run(b, { type: 'leaveBrand' }).room, 'deck')
  assert.equal(run(START, { type: 'openBrand' }, { type: 'leaveBrand' }).room, 'home')
  refused(inA, { type: 'leaveBrand' })
})

test('the player opens only over a build with pages, in the Overview, deck or app', () => {
  let s = run(inA, { type: 'play', mode: 'visitor', page: 'home' })
  assert.deepEqual([s.player, s.page], ['visitor', 'home'])
  s = run(s, { type: 'stopVisitor' }, { type: 'playPage', page: 'more' })
  assert.deepEqual([s.player, s.page], ['prototype', 'more'])
  assert.equal(run(s, { type: 'closePlayer' }).player, 'closed')
  refused(START, { type: 'play' })
  refused(run(START, { type: 'openPlan', plan: 'pl1' }), { type: 'play' })
  refused(run(START, { type: 'openBrand' }), { type: 'play' })
  refused(run(inA, { type: 'enterRoom', room: 'video' }), { type: 'play' })
  refused(inA, { type: 'play', pages: 0 })
  refused(inA, { type: 'play', mode: 'film' })
  refused(inA, { type: 'playPage', page: 'more' })
  refused(inA, { type: 'stopVisitor' })
})

test('a replay plays in the deck only and ends on leaving it', () => {
  const d = run(inA, { type: 'enterRoom', room: 'deck' }, { type: 'replay', on: true })
  assert.equal(d.replay, true)
  assert.equal(run(d, { type: 'enterRoom', room: 'app' }).replay, false)
  assert.equal(run(d, { type: 'home' }).replay, false)
  refused(inA, { type: 'replay', on: true })
  assert.equal(run(inA, { type: 'replay', on: false }).replay, false)
  refused(inA, { type: 'nonsense' })
})

test('the address carries the same state, and a reload shows exactly it', () => {
  const states = [
    START,
    inA,
    run(inA, { type: 'enterRoom', room: 'deck' }),
    run(inA, { type: 'enterRoom', room: 'app' }, { type: 'play', mode: 'visitor', page: 'home' }),
    run(inA, { type: 'enterRoom', room: 'video' }),
    run(inA, { type: 'enterRoom', room: 'game', run: 'rg' }),
    run(START, { type: 'openPlan', plan: 'pl1' })
  ]
  for (const s of states) {
    const back = fromAddress(toAddress(s)).state
    for (const k of ['room', 'project', 'version', 'run', 'plan', 'player', 'page']) assert.equal(back[k], s[k], `${toAddress(s)} ${k}`)
  }
  // the brand sheet is not an address of its own: a reload shows where it was opened from
  assert.equal(toAddress(run(inA, { type: 'openBrand' })), toAddress(inA))
})

test('an address that asks for something impossible opens what fits, never a mixed screen', () => {
  assert.equal(fromAddress('?play=prototype').state.player, 'closed')
  assert.equal(fromAddress('?room=deck').state.room, 'home')
  assert.equal(fromAddress('?version=<script>').state.room, 'home')
  const r = fromAddress('?run=r1').state
  assert.deepEqual([r.room, r.version], ['overview', 'r1'])
  const rp = fromAddress('?replay=r1').state
  assert.deepEqual([rp.room, rp.run, rp.replay], ['deck', 'r1', true])
  const v = fromAddress('?version=r1&room=video&play=prototype').state
  assert.deepEqual([v.room, v.player], ['video', 'closed'])
})

test('the slice: dispatch changes it, a refusal is logged and changes nothing', async () => {
  const said = []
  const nav = makeNav({ log: m => said.push(m) })
  let calls = 0
  nav.on(() => calls++)
  assert.equal(nav.dispatch({ type: 'play' }), null)
  assert.match(said[0], /^nav: refused play: /)
  nav.dispatch(A)
  await Promise.resolve()
  assert.equal(calls, 1)
  assert.equal(nav.state.run, 'ra1')
  assert.equal(nav.address(), '?project=pa&version=ra1')
  nav.dispatch({ type: 'streamed', run: 'neon' })
  await Promise.resolve()
  assert.equal(calls, 1)
})
