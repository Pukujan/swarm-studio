// The image-first boards' core (ui/src/board/, the architecture's §3.1–3.3 and §4): the camera store, the spatial
// index and the tier manager, driven with a fake clock. Node runs the TypeScript files as they are (type stripping),
// so they keep to syntax that strips.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TierManager, PROFILES, budgetsFor, pow2 } from '../ui/src/board/tiers.ts'
import { Spatial } from '../ui/src/board/spatial.ts'
import { createCamera, bucketOf, SETTLE_MS } from '../ui/src/board/camera.ts'

const MB = 1024 * 1024
// a row of pages 1440 wide, 120 apart, their photos 1440 px wide
const pages = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, rect: { x: i * 1560, y: 0, w: 1440, h: 900 }, photoW: 1440 }))
const ids = list => new Set(list.map(p => p.id))
const view = (over = {}) => ({ rect: { x: 0, y: 0, w: 4000, h: 2000 }, k: 0.5, dpr: 2, now: 0, ...over })

test('a photo is as wide as the page on screen × the pixel ratio, rounded up to a power of two, never past the photo', () => {
  assert.equal(pow2(1), 1)
  assert.equal(pow2(700), 1024)
  assert.equal(pow2(1024), 1024)
  const t = new TierManager(PROFILES.normal)
  const [p] = pages(1)
  // 1440 × 0.25 × 2 = 720 → 1024; zoomed in, 1440 × 1 × 2 = 2880 → past the photo, so 1440
  assert.deepEqual(t.plan(view({ k: 0.25 }), [p], ids([p])).get('p0'), { tier: 'tiny', px: 1024, bytes: 1024 * 640 * 4 })
  assert.equal(new TierManager(PROFILES.normal).plan(view({ k: 1 }), [p], ids([p])).get('p0').px, 1440)
})

test('an item off the prepared area holds nothing; tiny below 0.3×, sharp above', () => {
  const t = new TierManager(PROFILES.normal)
  const ps = pages(3)
  const plan = t.plan(view({ k: 0.5 }), ps, new Set(['p0', 'p1']))
  assert.equal(plan.get('p0').tier, 'sharp')
  assert.deepEqual(plan.get('p2'), { tier: 'hidden', px: 0, bytes: 0 })
  assert.equal(new TierManager(PROFILES.normal).plan(view({ k: 0.2 }), ps, ids(ps)).get('p0').tier, 'tiny')
})

test('a change waits 300 ms (hysteresis): an edge does not flicker, and one that lasts goes through', () => {
  const t = new TierManager(PROFILES.normal)
  const ps = pages(2)
  t.plan(view({ now: 0 }), ps, ids(ps))
  // p1 leaves the prepared area at 1000 ms and comes back at 1200: it never changed
  assert.equal(t.plan(view({ now: 1000 }), ps, new Set(['p0'])).get('p1').tier, 'sharp')
  assert.equal(t.plan(view({ now: 1200 }), ps, ids(ps)).get('p1').tier, 'sharp')
  // it leaves again and stays gone: still held at 1299, released at 1300
  assert.equal(t.plan(view({ now: 1300 - 299 + 1000 - 1000 + 299 }), ps, new Set(['p0'])).get('p1').tier, 'sharp')
  assert.equal(t.plan(view({ now: 1500 }), ps, new Set(['p0'])).get('p1').tier, 'sharp')
  assert.equal(t.plan(view({ now: 1800 }), ps, new Set(['p0'])).get('p1').tier, 'hidden')
  // a zoom past the tiny line waits the same way
  assert.equal(t.plan(view({ now: 2000, k: 0.2 }), ps, ids(ps)).get('p0').tier, 'sharp')
  assert.equal(t.plan(view({ now: 2300, k: 0.2 }), ps, ids(ps)).get('p0').tier, 'tiny')
})

test('at most 3 live, agents first; going live is at once', () => {
  const t = new TierManager(PROFILES.normal)
  const ps = pages(6)
  t.plan(view({ now: 0 }), ps, ids(ps))
  const plan = t.plan(view({ now: 0 }), ps, ids(ps), { selected: new Set(['p5']), agents: new Set(['p1', 'p2', 'p3']) })
  const live = [...plan].filter(([, d]) => d.tier === 'live').map(([id]) => id).sort()
  // three agents take the three places; the pick waits for one
  assert.deepEqual(live, ['p1', 'p2', 'p3'])
  // with one agent done, the pick is live straight away
  const next = t.plan(view({ now: 10 }), ps, ids(ps), { selected: new Set(['p5']), agents: new Set(['p1', 'p2']) })
  assert.equal(next.get('p5').tier, 'live')
})

test('the low profile: 2 live, 256 MB, half a screen of margin', () => {
  assert.equal(PROFILES.low.live, 2)
  assert.equal(PROFILES.low.bytes, 256 * MB)
  assert.equal(PROFILES.low.margin, 0.5)
  const t = new TierManager(PROFILES.low)
  const ps = pages(4)
  const plan = t.plan(view(), ps, ids(ps), { agents: ids(ps) })
  assert.equal([...plan.values()].filter(d => d.tier === 'live').length, 2)
})

test('the budget: 25% of device memory up to 512 MB; 4 GB or less is the low profile', () => {
  assert.equal(budgetsFor({ deviceMemoryGB: 8 }).bytes, 512 * MB)
  assert.equal(budgetsFor({ deviceMemoryGB: 6 }).bytes, 6 * 1024 * MB * 0.25 > 512 * MB ? 512 * MB : 6 * 1024 * MB * 0.25)
  assert.deepEqual(budgetsFor({ deviceMemoryGB: 4 }), PROFILES.low)
  assert.deepEqual(budgetsFor({ saveData: true }), PROFILES.low)
  assert.equal(budgetsFor({ deviceMemoryGB: 8, override: { live: 1 } }).live, 1)
})

test('over the byte budget the furthest photos step down at once, sharp → tiny → hidden, live ones last', () => {
  // each sharp photo here is 1440 × 900 × 4 ≈ 4.9 MB; a budget of 12 MB holds two of them
  const t = new TierManager({ ...PROFILES.normal, bytes: 12 * MB })
  const ps = pages(5)
  const plan = t.plan(view({ k: 1, rect: { x: 0, y: 0, w: 1440, h: 900 } }), ps, ids(ps), { agents: new Set(['p4']) })
  assert.ok(TierManager.bytes(plan) <= 12 * MB, `held ${TierManager.bytes(plan) / MB} MB`)
  // the nearest keeps its sharp photo, the live one its own, and the far ones stepped down to tiny
  assert.equal(plan.get('p0').tier, 'sharp')
  assert.equal(plan.get('p4').tier, 'live')
  assert.deepEqual(['p1', 'p2', 'p3'].map(id => plan.get(id).tier), ['tiny', 'tiny', 'tiny'])
  // tighter still, the furthest go on to hidden, and the nearest is the last photo standing
  const tight = new TierManager({ ...PROFILES.normal, bytes: 6.5 * MB }).plan(view({ k: 1, rect: { x: 0, y: 0, w: 1440, h: 900 } }), ps, ids(ps), { agents: new Set(['p4']) })
  assert.ok(TierManager.bytes(tight) <= 6.5 * MB, `held ${TierManager.bytes(tight) / MB} MB`)
  assert.equal(tight.get('p3').tier, 'hidden')
  assert.notEqual(tight.get('p0').tier, 'hidden')
})

test('the spatial index answers for the view plus its margin, and follows inserts and removals', () => {
  const s = new Spatial()
  for (const p of pages(10)) s.upsert(p.id, p.rect)
  // a view over the first page, one screen of margin each way, reaches p0 and p1 only
  assert.deepEqual(s.query({ x: 0, y: 0, w: 1440, h: 900 }, 1).sort(), ['p0', 'p1'])
  s.remove('p1')
  s.upsert('p0', { x: 5000, y: 0, w: 100, h: 100 })
  assert.deepEqual(s.query({ x: 0, y: 0, w: 1440, h: 900 }, 1), [])
  assert.equal(s.size, 9)
})

test('the camera draws once per frame and settles after resting; React only hears the settle', () => {
  let t = 0
  const frames = [], timers = []
  const clock = { now: () => t, frame: f => frames.push(f), cancel: () => {}, after: (f, ms) => { const x = { f, at: t + ms }; timers.push(x); return x }, clear: x => { const i = timers.indexOf(x); if (i >= 0) timers.splice(i, 1) } }
  const cam = createCamera({ x: 0, y: 0, k: 1 }, clock)
  const drawn = [], settled = []
  cam.subscribe(c => drawn.push(c.x))
  cam.onSettled(s => settled.push(s))
  cam.set({ x: 10 }); cam.set({ x: 20 }); cam.set({ k: 0.5 })
  assert.equal(frames.length, 1, 'three moves, one frame')
  frames.shift()()
  assert.deepEqual(drawn, [0, 20])
  assert.ok(cam.moving())
  t = SETTLE_MS
  timers.shift().f()
  assert.equal(settled.length, 1)
  assert.equal(settled[0].bucket, bucketOf(0.5))
  assert.equal(bucketOf(0.5), -1)
  assert.ok(!cam.moving())
})
