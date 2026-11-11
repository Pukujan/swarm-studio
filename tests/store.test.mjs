// The canvas's state store (web/store.js): slices notice writes, reset keeps what it should.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stateSlice, stateSnapshot } from '../web/store.js'

test('a slice reads and writes like a plain object', () => {
  const s = stateSlice('t-plain', { run: null, steps: [] })
  s.state.run = 'r1'
  Object.assign(s.state, { kind: 'game' })
  s.state.steps.push({ text: 'a' })
  assert.deepEqual({ ...s.state }, { run: 'r1', steps: [{ text: 'a' }], kind: 'game' })
})

test('listeners run once per tick after changes', async () => {
  const s = stateSlice('t-on', { a: 0, b: 0 })
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
  const s = stateSlice('t-reset', { run: null, steps: [], mode: 'preview', w: 0, slice: null }, { keep: ['mode', 'w'] })
  Object.assign(s.state, { run: 'old', mode: 'code', w: 390, slice: { i: 1 }, deploying: true })
  s.state.steps.push(1)
  s.reset({ run: 'new' })
  assert.deepEqual({ ...s.state }, { run: 'new', steps: [], mode: 'code', w: 390, slice: null })
  s.state.steps.push(2)
  s.reset()
  assert.deepEqual(s.state.steps, [], 'each reset starts from a fresh copy')
})

test('the snapshot lists every slice as plain data', () => {
  const s = stateSlice('t-snap', { tags: new Set(['x']), n: 2 })
  s.state.off = () => {}
  assert.deepEqual(stateSnapshot()['t-snap'], { tags: ['x'], n: 2 })
})
