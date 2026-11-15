// Property tests for the tier manager (decision 0019 point 4, issue #463; ui/src/board/tiers.ts, image-first boards
// §3.3 and §4): random boards, views, budgets and wants against its rules. It is pure (no DOM, no clock of its own),
// so the cases drive it with a fake time; Node loads the TypeScript by type stripping, as tests/deck-model.test.mjs
// does. 1000 cases each; fast-check shrinks a failure to the smallest case.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PROFILES, TierManager, budgetsFor, pow2 } from '../../ui/src/board/tiers.ts'

const fc = createRequire(new URL('../../tools/dev/package.json', import.meta.url))('fast-check')
const RUNS = 1000
const MB = 1024 * 1024
const RANK = { hidden: 0, tiny: 1, sharp: 2, live: 3 }

// a board: up to 20 items, each with its place, size and photo width
const board = fc.uniqueArray(fc.record({
  id: fc.integer({ min: 0, max: 99 }).map(n => `i${n}`),
  x: fc.integer({ min: -6000, max: 6000 }), y: fc.integer({ min: -6000, max: 6000 }),
  w: fc.integer({ min: 100, max: 2000 }), h: fc.integer({ min: 100, max: 4000 }),
  photoW: fc.integer({ min: 64, max: 4096 })
}), { minLength: 1, maxLength: 20, selector: i => i.id }).map(list => list.map(i => ({ id: i.id, rect: { x: i.x, y: i.y, w: i.w, h: i.h }, photoW: i.photoW })))
const view = fc.record({ x: fc.integer({ min: -4000, max: 4000 }), y: fc.integer({ min: -4000, max: 4000 }), k: fc.double({ min: 0.05, max: 2, noNaN: true }), dpr: fc.constantFrom(1, 1.5, 2, 3) })
  .map(v => ({ rect: { x: v.x, y: v.y, w: 1440 / v.k, h: 900 / v.k }, k: v.k, dpr: v.dpr, now: 0 }))
const budgets = fc.record({ live: fc.integer({ min: 0, max: 4 }), bytes: fc.integer({ min: 1, max: 512 }).map(n => n * MB), tinyBelow: fc.constantFrom(0.3, 0.5) })
  .map(b => ({ ...PROFILES.normal, ...b }))
// which items the spatial index calls near, which the person picked and which agents work on: subsets of the board
const pick = (items) => fc.subarray(items.map(i => i.id)).map(ids => new Set(ids))
const at = (items) => fc.tuple(pick(items), pick(items), pick(items))
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2]
const distance = (i, v) => { const [a, b] = center(i.rect), [c, d] = center(v.rect); return Math.hypot(a - c, b - d) }

test('the profile: 4 GB or less, or saving data with no memory said, is low; otherwise 25% of the memory, at most 512 MB', () => {
  fc.assert(fc.property(fc.option(fc.double({ min: 0.25, max: 64, noNaN: true }), { nil: undefined }), fc.boolean(), (gb, saveData) => {
    const b = budgetsFor({ deviceMemoryGB: gb, saveData })
    const low = (gb !== undefined && gb <= 4) || (gb === undefined && saveData)
    if (low) return assert.deepEqual(b, PROFILES.low)
    assert.equal(b.live, PROFILES.normal.live)
    assert.equal(b.bytes, Math.min(512 * MB, Math.round((gb ?? 8) * 1024 * MB * 0.25)))
    assert.ok(b.bytes <= PROFILES.normal.bytes)
  }), { numRuns: RUNS })
})

test('sizes: every photo is a power of two or the photo itself, never past its own width, and its bytes are its pixels × 4', () => {
  fc.assert(fc.property(board.chain(items => fc.tuple(fc.constant(items), view, budgets, at(items))), ([items, v, b, [near, sel, agents]]) => {
    const plan = new TierManager({ ...b, bytes: 1e15 }).plan(v, items, near, { selected: sel, agents })
    for (const i of items) {
      const d = plan.get(i.id)
      if (d.tier === 'hidden') { assert.deepEqual([d.px, d.bytes], [0, 0]); continue }
      assert.ok(d.px > 0 && d.px <= i.photoW, `${i.id}: ${d.px} px for a ${i.photoW} px photo`)
      assert.ok(d.px === i.photoW || d.px === pow2(d.px), `${i.id}: ${d.px} is a power of two or the photo's width`)
      assert.equal(d.bytes, d.px * Math.round(d.px * (i.rect.h / i.rect.w)) * 4)
    }
  }), { numRuns: RUNS })
})

test('live: at most the budget; agents first, then what the person picked; never anything nobody asked for', () => {
  fc.assert(fc.property(board.chain(items => fc.tuple(fc.constant(items), view, budgets, at(items))), ([items, v, b, [near, sel, agents]]) => {
    const plan = new TierManager({ ...b, bytes: 1e15 }).plan(v, items, near, { selected: sel, agents })
    const live = items.filter(i => plan.get(i.id).tier === 'live').map(i => i.id)
    assert.ok(live.length <= b.live, `${live.length} live, budget ${b.live}`)
    assert.ok(live.every(id => agents.has(id) || sel.has(id)), 'only what an agent or the person asks for goes live')
    const asked = items.filter(i => agents.has(i.id) || sel.has(i.id)).length
    assert.equal(live.length, Math.min(b.live, asked), 'the budget is used while anything asks')
    // an agent's item left out only when every live one is an agent's; a pick left out only when every live one is asked more
    if (items.some(i => agents.has(i.id) && !live.includes(i.id))) assert.ok(live.every(id => agents.has(id)), 'agents come first')
  }), { numRuns: RUNS })
})

test('bytes: over the budget, photos step down until it fits or only live pages hold anything', () => {
  fc.assert(fc.property(board.chain(items => fc.tuple(fc.constant(items), view, budgets, at(items))), ([items, v, b, [near, sel, agents]]) => {
    const plan = new TierManager(b).plan(v, items, near, { selected: sel, agents })
    const total = TierManager.bytes(plan)
    const onlyLive = items.every(i => ['live', 'hidden'].includes(plan.get(i.id).tier))
    assert.ok(total <= b.bytes || onlyLive, `${(total / MB).toFixed(1)} MB held over a ${(b.bytes / MB).toFixed(1)} MB budget with photos still shown`)
  }), { numRuns: RUNS })
})

test('eviction: the furthest photo steps down first; a nearer one never holds less than a further one', () => {
  // one look at a board with nothing asked live, so every photo wants the same tier and only the budget decides
  fc.assert(fc.property(board.chain(items => fc.tuple(fc.constant(items), view, budgets, pick(items))), ([items, v, b, near]) => {
    const plan = new TierManager(b).plan(v, items, near, {})
    const shown = items.filter(i => near.has(i.id)).sort((a, z) => distance(a, v) - distance(z, v))
    for (let n = 1; n < shown.length; n++) {
      const nearer = shown[n - 1], further = shown[n]
      if (distance(nearer, v) === distance(further, v)) continue
      assert.ok(RANK[plan.get(nearer.id).tier] >= RANK[plan.get(further.id).tier],
        `${nearer.id} (${distance(nearer, v) | 0} away) is ${plan.get(nearer.id).tier} but ${further.id} (${distance(further, v) | 0} away) is ${plan.get(further.id).tier}`)
    }
  }), { numRuns: RUNS })
})

test('hysteresis: nothing changes tier or size before it has been wanted for hysteresisMs, and it settles once it has', () => {
  const views = fc.array(view, { minLength: 1, maxLength: 8 })
  fc.assert(fc.property(board.chain(items => fc.tuple(fc.constant(items), view, views, budgets, fc.array(pick(items), { minLength: 9, maxLength: 9 }))), ([items, v0, later, b, nears]) => {
    const roomy = { ...b, bytes: 1e15 }, hold = roomy.hysteresisMs
    const m = new TierManager(roomy)
    const first = m.plan(v0, items, nears[0], {})
    // within the hold, whatever the view and whatever is near, every item keeps its first decision
    later.forEach((v, n) => {
      const plan = m.plan({ ...v, now: Math.floor(((n + 1) / (later.length + 1)) * (hold - 1)) }, items, nears[n + 1], {})
      for (const i of items) assert.deepEqual(plan.get(i.id), first.get(i.id), `${i.id} changed before ${hold} ms`)
    })
    // held still for the full time, it is what a fresh look at that view would say
    const last = later.at(-1), near = nears[later.length]
    m.plan({ ...last, now: hold }, items, near, {})
    const settled = m.plan({ ...last, now: 2 * hold }, items, near, {})
    const fresh = new TierManager(roomy).plan({ ...last, now: 0 }, items, near, {})
    for (const i of items) assert.deepEqual(settled.get(i.id), fresh.get(i.id), `${i.id} settled`)
  }), { numRuns: RUNS })
})

test('going live is at once: an item an agent starts on is live in the same frame, inside any hold', () => {
  fc.assert(fc.property(board.chain(items => fc.tuple(fc.constant(items), view, view, budgets, fc.constantFrom(...items.map(i => i.id)), pick(items))), ([items, v0, v1, b, id, near]) => {
    const m = new TierManager({ ...b, live: Math.max(1, b.live), bytes: 1e15 })
    m.plan(v0, items, near, {})
    const plan = m.plan({ ...v1, now: 1 }, items, near, { agents: new Set([id]) })
    assert.equal(plan.get(id).tier, 'live')
  }), { numRuns: RUNS })
})
