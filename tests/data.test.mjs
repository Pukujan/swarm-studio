// The canvas's shared data (web/data.js): XState actors that read and write like plain objects, notice writes, and reset keeps what it should.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataStore, dataSnapshot } from '../web/data.js'

test('a store reads and writes like a plain object', () => {
  const s = dataStore('t-plain', { run: null, steps: [] })
  s.state.run = 'r1'
  Object.assign(s.state, { kind: 'game' })
  s.state.steps.push({ text: 'a' })
  assert.deepEqual({ ...s.state }, { run: 'r1', steps: [{ text: 'a' }], kind: 'game' })
})

test('listeners run once per tick after changes', async () => {
  const s = dataStore('t-on', { a: 0, b: 0 })
  let calls = 0
  const off = s.on(() => calls++)
  s.state.a = 1; s.state.b = 2; s.set({ a: 3 })
  await Promise.resolve()
  assert.equal(calls, 1)
  s.state.a = 3
  await Promise.resolve()
  assert.equal(calls, 1, 'an unchanged value is not a change')
  off(); s.state.a = 4
  await Promise.resolve()
  assert.equal(calls, 1)
})

test('reset clears every field from the last run but keeps the named ones', () => {
  const s = dataStore('t-reset', { run: null, steps: [], mode: 'preview', w: 0, slice: null }, { keep: ['mode', 'w'] })
  Object.assign(s.state, { run: 'old', mode: 'code', w: 390, slice: { i: 1 }, deploying: true })
  s.state.steps.push(1)
  s.reset({ run: 'new' })
  assert.deepEqual({ ...s.state }, { run: 'new', steps: [], mode: 'code', w: 390, slice: null })
  s.state.steps.push(2)
  s.reset()
  assert.deepEqual(s.state.steps, [], 'each reset starts from a fresh copy')
})

test('the snapshot lists every store as plain data', () => {
  const s = dataStore('t-snap', { tags: new Set(['x']), n: 2 })
  s.state.off = () => {}
  assert.deepEqual(dataSnapshot()['t-snap'], { tags: ['x'], n: 2 })
})

test('the store is an XState actor: a write is its set event, and subscribers see the new context', () => {
  const s = dataStore('t-actor', { n: 0 })
  const seen = []
  s.actor.subscribe(snap => seen.push(snap.context.n))
  s.state.n = 1
  s.set({ n: 2 })
  assert.deepEqual(seen, [1, 2])
  assert.equal(s.actor.getSnapshot().context.n, 2)
  delete s.state.n
  assert.equal('n' in s.state, false)
})
