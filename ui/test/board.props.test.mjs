// Property and metamorphic tests for the tier manager (decision 0019; spec 43 §2.3 and §3), with fast-check: every
// property runs at least 1000 generated boards, and a failure shrinks to the smallest board that breaks it.
//
//   budgets      never more live pages than the budget; the photos held stay inside the byte budget unless only
//                live pages are left holding any; the low-memory profile the same at its own numbers
//   hysteresis   an edge that flickers faster than the delay never changes a page's tier; a change that lasts the
//                delay always goes through
//   zoom         zooming in or out never breaks a budget, and every page can still be reached: a view centred on it
//                shows it
//   adding       a new card changes no other card's tier unless the budget forces it
// (Live → photo → live drawing the same is the browser's to check: tools/dev/audit/board.spec.mjs.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { TierManager, PROFILES } from '../src/board/tiers.ts'
import { Spatial } from '../src/board/spatial.ts'

const RUNS = { numRuns: 1000 }
const MB = 1024 * 1024

// a board: up to 60 items on a grid-ish plane, each 200–1440 wide, its photo 320–2048 px wide
const itemArb = fc.record({ x: fc.integer({ min: 0, max: 40000 }), y: fc.integer({ min: 0, max: 20000 }), w: fc.integer({ min: 200, max: 1440 }), h: fc.integer({ min: 200, max: 3000 }), photoW: fc.integer({ min: 320, max: 2048 }) })
const boardArb = fc.uniqueArray(itemArb, { minLength: 1, maxLength: 60, selector: i => `${i.x}:${i.y}` })
  .map(list => list.map((i, n) => ({ id: `i${n}`, rect: { x: i.x, y: i.y, w: i.w, h: i.h }, photoW: i.photoW })))
const viewArb = fc.record({ x: fc.integer({ min: -2000, max: 40000 }), y: fc.integer({ min: -2000, max: 20000 }), k: fc.double({ min: 0.04, max: 2, noNaN: true }), dpr: fc.constantFrom(1, 1.5, 2, 3) })
const budgetArb = fc.record({ live: fc.integer({ min: 0, max: 5 }), bytes: fc.integer({ min: 1, max: 600 }).map(n => n * MB), margin: fc.constantFrom(0.5, 1), hysteresisMs: fc.constant(300), tinyBelow: fc.constant(0.3) })

const plan = (budgets, items, v, wants = {}, now = 0, t = new TierManager(budgets)) => {
  const s = new Spatial()
  for (const i of items) s.upsert(i.id, i.rect)
  const rect = { x: v.x, y: v.y, w: 1440 / v.k, h: 900 / v.k }
  return t.plan({ rect, k: v.k, dpr: v.dpr, now }, items, new Set(s.query(rect, budgets.margin)), wants)
}
const pick = (items, mask) => new Set(items.filter((_, n) => mask[n % mask.length]).map(i => i.id))
const live = p => [...p.values()].filter(d => d.tier === 'live').length
const bytes = p => [...p.values()].reduce((n, d) => n + d.bytes, 0)
const withinBudget = (p, b) => bytes(p) <= b.bytes || [...p.values()].every(d => d.tier === 'live' || d.tier === 'hidden')

test('budgets: live pages never exceed the budget, and photos stay inside the byte budget', () => {
  fc.assert(fc.property(budgetArb, boardArb, viewArb, fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (b, items, v, ag, se) => {
    const p = plan(b, items, v, { agents: pick(items, ag), selected: pick(items, se) })
    assert.ok(live(p) <= b.live, `live ${live(p)} > ${b.live}`)
    assert.ok(withinBudget(p, b), `${(bytes(p) / MB).toFixed(1)} MB > ${b.bytes / MB} MB`)
    // an agent's page is live before a page that is only selected
    const agents = pick(items, ag)
    if ([...p].some(([id, d]) => d.tier === 'live' && !agents.has(id))) assert.ok([...agents].filter(id => p.get(id)?.tier === 'live').length === Math.min(agents.size, b.live))
  }), RUNS)
})

test('budgets: the low-memory profile holds 2 live and 256 MB', () => {
  fc.assert(fc.property(boardArb, viewArb, fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (items, v, ag) => {
    const p = plan(PROFILES.low, items, v, { agents: pick(items, ag) })
    assert.ok(live(p) <= 2)
    assert.ok(withinBudget(p, PROFILES.low))
  }), RUNS)
})

test('hysteresis: an edge flickering faster than the delay never changes a tier; one that lasts does', () => {
  fc.assert(fc.property(boardArb, fc.array(fc.integer({ min: 1, max: 299 }), { minLength: 1, maxLength: 12 }), (items, gaps) => {
    const b = { ...PROFILES.normal, bytes: 4096 * MB }
    const t = new TierManager(b)
    const near = new Set(items.map(i => i.id))
    const view = { rect: { x: 0, y: 0, w: 1440, h: 900 }, k: 0.5, dpr: 1 }
    const first = t.plan({ ...view, now: 0 }, items, near)
    // each flicker away lasts under the delay, and comes back before it ends
    let now = 0
    for (const g of gaps) {
      now += 1
      const away = t.plan({ ...view, now }, items, new Set())
      for (const i of items) assert.equal(away.get(i.id).tier, first.get(i.id).tier)
      now += g
      t.plan({ ...view, now }, items, near)
    }
    // gone for good: held for the delay, then released
    now += 1
    t.plan({ ...view, now }, items, new Set())
    const after = t.plan({ ...view, now: now + b.hysteresisMs }, items, new Set())
    for (const i of items) assert.equal(after.get(i.id).tier, 'hidden')
  }), RUNS)
})

test('zoom (metamorphic): zooming in or out never breaks a budget, and every item can still be reached', () => {
  fc.assert(fc.property(budgetArb, boardArb, viewArb, fc.double({ min: 0.25, max: 4, noNaN: true }), (b0, items, v, f) => {
    const b = { ...b0, bytes: Math.max(b0.bytes, 64 * MB) }
    const z = { ...v, k: Math.min(2, Math.max(0.04, v.k * f)) }
    for (const view of [v, z]) {
      const p = plan(b, items, view)
      assert.ok(live(p) <= b.live)
      assert.ok(withinBudget(p, b))
    }
    // reachable: centred on an item at the zoomed scale, the item is drawn (unless its own photo alone is over budget)
    const it = items[0]
    const k = z.k, at = { x: it.rect.x + it.rect.w / 2 - 720 / k, y: it.rect.y + it.rect.h / 2 - 450 / k, k, dpr: z.dpr }
    const d = plan(b, items, at).get(it.id)
    const own = Math.min(it.photoW, 2 ** Math.ceil(Math.log2(Math.max(1, it.rect.w * k * z.dpr)))) ** 2 * (it.rect.h / it.rect.w) * 4
    if (own <= b.bytes) assert.notEqual(d.tier, 'hidden')
  }), RUNS)
})

test('adding (metamorphic): a new card changes no other card\'s tier unless the budget forces it', () => {
  fc.assert(fc.property(boardArb, viewArb, itemArb, fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (items, v, extra, ag) => {
    // a budget that nothing here reaches, so nothing is forced
    const b = { ...PROFILES.normal, bytes: Number.MAX_SAFE_INTEGER }
    const wants = { agents: pick(items, ag) }
    const before = plan(b, items, v, wants)
    const added = { id: 'new', rect: { x: extra.x, y: extra.y, w: extra.w, h: extra.h }, photoW: extra.photoW }
    const after = plan(b, [...items, added], v, wants)
    for (const i of items) assert.deepEqual(after.get(i.id), before.get(i.id), i.id)
  }), RUNS)
})
