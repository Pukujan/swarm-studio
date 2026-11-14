// Property tests for idle shutdown (decision 0019 point 4, decision 0017, issue #450): random sequences of open,
// close, heartbeat, build and render events against engine/lifecycle.mjs, 1000 cases each, checking the rules that
// must always hold. fast-check is a pinned dev dependency (tools/dev), never shipped.
//
//   npm run --prefix tools/dev property        (CI: the `property` job)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { idleWatch, previewPool, serialQueue } from '../../engine/lifecycle.mjs'

const fc = createRequire(new URL('../../tools/dev/package.json', import.meta.url))('fast-check')
const RUNS = 1000

// a clock and interval timers the test moves by hand
function fakeTime() {
  let t = 0, n = 0
  const jobs = new Map()
  return {
    now: () => t,
    timers: { setInterval: (fn, ms) => { jobs.set(++n, { fn, ms, at: t + ms }); return n }, clearInterval: h => jobs.delete(h) },
    advance(ms) {
      const end = t + ms
      for (;;) {
        const next = [...jobs.values()].sort((a, b) => a.at - b.at)[0]
        if (!next || next.at > end) break
        t = next.at
        next.at += next.ms
        next.fn()
      }
      t = end
    }
  }
}

const MIN = 60e3

test('idle exit: never before the idle time since the last use, never while busy, at most once, and always once idle long enough', () => {
  const step = fc.oneof(
    fc.record({ k: fc.constant('wait'), ms: fc.integer({ min: 1, max: 30 * MIN }) }),
    fc.record({ k: fc.constant('touch') }),
    fc.record({ k: fc.constant('busy'), on: fc.boolean() })
  )
  fc.assert(fc.property(fc.integer({ min: 1, max: 60 }), fc.array(step, { maxLength: 40 }), (mins, steps) => {
    const ms = mins * MIN, every = 30e3, f = fakeTime()
    let busy = false, fired = 0, lastUse = 0
    const w = idleWatch({ ms, every, busy: () => busy, onIdle: () => { fired++; assert.ok(!busy, 'never while busy'); assert.ok(f.now() - lastUse >= ms, 'never before the idle time') }, now: f.now, timers: f.timers })
    for (const s of steps) {
      if (s.k === 'touch') { if (!fired) { w.touch(); lastUse = f.now() } }
      else if (s.k === 'busy') busy = s.on
      else {
        // busy at a check counts as use: the time starts again there
        const end = f.now() + s.ms
        while (f.now() < end) {
          const next = Math.min(end, Math.floor(f.now() / every) * every + every)
          f.advance(next - f.now())
          if (busy && f.now() % every === 0) lastUse = f.now()
        }
      }
      assert.ok(fired <= 1, 'at most once')
    }
    // liveness: left alone and not busy for the idle time plus one check, it has gone
    busy = false
    f.advance(ms + 2 * every)
    assert.equal(fired, 1, 'it exits once idle long enough')
  }), { numRuns: RUNS })
})

test('app servers: at most 2 run unless the others are being built, a building app is never stopped, idle ones stop on time, and room goes to the least recently viewed', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  const event = fc.oneof(
    fc.record({ k: fc.constant('open'), id: fc.constantFrom(...ids) }),
    fc.record({ k: fc.constant('close'), id: fc.constantFrom(...ids) }),
    fc.record({ k: fc.constant('seen'), id: fc.constantFrom(...ids) }),
    fc.record({ k: fc.constant('build'), id: fc.constantFrom(...ids), on: fc.boolean() }),
    fc.record({ k: fc.constant('wait'), ms: fc.integer({ min: 1, max: 5 * MIN }) }),
    fc.record({ k: fc.constant('sweep') })
  )
  await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 15 }), fc.array(event, { maxLength: 60 }), async (mins, events) => {
    const idleMs = mins * MIN, f = fakeTime()
    const building = new Set(), seenAt = new Map(), stopped = []
    let admitting = null
    const pool = previewPool({ max: 2, idleMs, now: f.now, busy: id => building.has(id), stop: async (id, why) => {
      assert.ok(!building.has(id), `${id} is being built and was stopped`)
      if (why === 'idle') assert.ok(f.now() - seenAt.get(id) >= idleMs, `${id} stopped as idle after ${f.now() - seenAt.get(id)} ms`)
      if (why === 'room') {
        // the one seen longest ago among the others not being built
        const others = pool.running().concat(id).filter(x => x !== admitting && !building.has(x))
        const oldest = Math.min(...others.map(x => seenAt.get(x)))
        assert.equal(seenAt.get(id), oldest, `${id} made room but another was seen longer ago`)
      }
      stopped.push([id, why])
      seenAt.delete(id)
    } })
    for (const e of events) {
      const running = new Set(pool.running())
      if (e.k === 'open' && !running.has(e.id)) { seenAt.set(e.id, f.now()); admitting = e.id; await pool.admit(e.id); admitting = null }
      else if (e.k === 'close' && running.has(e.id)) { pool.gone(e.id); seenAt.delete(e.id) }
      else if (e.k === 'seen' && running.has(e.id)) { pool.seen(e.id); seenAt.set(e.id, f.now()) }
      else if (e.k === 'build') { if (e.on) building.add(e.id); else building.delete(e.id) }
      else if (e.k === 'wait') f.advance(e.ms)
      else if (e.k === 'sweep') await pool.sweep()
      const now = pool.running()
      const idle = now.filter(x => !building.has(x))
      assert.ok(now.length <= 2 || idle.length <= 1, `${now.length} running with ${idle.length} not being built`)
    }
    // after a sweep, nothing that is not being built has gone unseen for the idle time
    await pool.sweep()
    for (const id of pool.running()) if (!building.has(id)) assert.ok(f.now() - seenAt.get(id) < idleMs, `${id} unseen for ${f.now() - seenAt.get(id)} ms and still running`)
  }), { numRuns: RUNS })
})

test('film renders: never two at once, every one runs, in the order asked, and a failure frees the slot', async () => {
  // how long each render takes and the gap before the next is asked, in microtask turns (fast, and still interleaved)
  const ticks = async n => { for (let k = 0; k < n; k++) await null }
  const job = fc.record({ ms: fc.integer({ min: 0, max: 20 }), fail: fc.boolean(), gap: fc.integer({ min: 0, max: 10 }) })
  await fc.assert(fc.asyncProperty(fc.array(job, { minLength: 1, maxLength: 12 }), async jobs => {
    const q = serialQueue(1)
    let active = 0, most = 0
    const order = []
    const runs = []
    for (const [i, j] of jobs.entries()) {
      runs.push(q.run(async () => {
        active++
        most = Math.max(most, active)
        order.push(i)
        await ticks(j.ms)
        active--
        if (j.fail) throw new Error('render failed')
        return i
      }).catch(() => -1))
      await ticks(j.gap)
    }
    const out = await Promise.all(runs)
    assert.equal(most, 1, 'at most one render at a time')
    assert.deepEqual(order, jobs.map((_, i) => i), 'in the order they were asked')
    assert.deepEqual(out, jobs.map((j, i) => (j.fail ? -1 : i)))
    assert.equal(q.busy(), false)
  }), { numRuns: RUNS })
})
