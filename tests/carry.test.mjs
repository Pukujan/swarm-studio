// A picture being painted on the Design deck (web/canvas/carry.js): where its card waits beside the page, how it
// travels to its slot, and which of a section's pictures it is. The drawing itself needs a browser; this is
// the geometry and the rule that the picture never waits on a card that is not there.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// the canvas's shared ground (web/canvas/core.js) reads the page as it loads: an empty one is enough here
globalThis.window ??= /** @type {any} */ ({})
globalThis.document ??= /** @type {any} */ ({ body: { classList: { contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { classList: { add() {} } } })
globalThis.location ??= /** @type {any} */ ({ search: '' })
const { CARRY, carryEase, carryStack, carryDrop, carryAt, carryZoom, carryOff, carryNth, carryStandin, carryEnd, carryStart, carryCards, carryMoving } = await import('../web/canvas/carry.js')

test('cards beside a page keep level with their sections and never overlap', () => {
  assert.deepEqual(carryStack([]), [])
  assert.deepEqual(carryStack([100, 900]), [100, 900])
  // two pictures in one section: the second sits right under the first
  assert.deepEqual(carryStack([100, 100]), [100, 100 + CARRY.h + CARRY.gap])
  // asked out of order: each answer is for the card asked, and a pushed card pushes the next
  assert.deepEqual(carryStack([300, 100, 120], 80, 10), [300, 100, 190])
  assert.deepEqual(carryStack([200, 100, 120], 80, 10), [280, 100, 190])
  // a bigger card (the camera far out) takes more room
  assert.deepEqual(carryStack([0, 0], 160, 14), [0, 174])
})

test('a card is dropped on the middle of its slot, eased, and is done when the time is up', () => {
  const to = carryDrop([200, 400, 600, 300], 1000)
  assert.deepEqual(to, { x: 1000 + 200 + 300 - CARRY.w / 2, y: 400 + 150 - CARRY.h / 2 })
  assert.deepEqual(carryDrop([0, 0, 240, 160], 0, 2), { x: 0, y: 0 })
  const from = { x: 2000, y: 100 }
  assert.deepEqual(carryAt(from, to, 0, 0), { ...from, done: false })
  const mid = carryAt(from, to, 0, CARRY.ms / 2)
  assert.equal(mid.x, (from.x + to.x) / 2); assert.equal(mid.done, false)
  assert.deepEqual(carryAt(from, to, 0, CARRY.ms), { ...to, done: true })
  assert.deepEqual(carryAt(from, to, 0, CARRY.ms * 3), { ...to, done: true })
  // slow, fast, slow
  assert.ok(carryEase(0.1) < 0.1 && carryEase(0.9) > 0.9)
  assert.equal(carryEase(-1), 0); assert.equal(carryEase(2), 1)
})

test('a card stays big enough to see with the camera far out, and waits in the gutter beside its page', () => {
  assert.equal(carryZoom(1), 1)
  assert.equal(carryZoom(0.5), 1)
  assert.ok(Math.abs(carryZoom(0.3) * CARRY.w * 0.3 - 56) < 1e-9)
  assert.ok(Math.abs(carryZoom(0.07) * CARRY.w * 0.07 - 56) < 1e-9)
  assert.equal(carryZoom(0), 10)
  // in the middle of the 260 px gutter; a card wider than the gutter starts just off its own page
  assert.equal(carryOff(1), 70)
  assert.equal(carryOff(2), 20)
  assert.equal(carryOff(6), 20)
})

test('a picture is found among its section\'s pictures, and only a photo stand-in goes on the card', () => {
  const html = '<section><img alt="" data-gen="a horse" class="w-full"><p>x</p><img src="/standin/lib/1?a=1&amp;b=2" data-sketch="photo" data-gen="a barn"><img data-gen="a field" src="data:image/svg+xml,x" data-sketch=""></section>'
  assert.equal(carryNth(html, 'a horse'), 0); assert.equal(carryNth(html, 'a barn'), 1); assert.equal(carryNth(html, 'a field'), 2)
  assert.equal(carryNth(html, 'a cow'), -1); assert.equal(carryNth('', 'a cow'), -1)
  assert.equal(carryStandin(html, 'a barn'), '/standin/lib/1?a=1&b=2')
  assert.equal(carryStandin(html, 'a horse'), '')
  assert.equal(carryStandin(html, 'a field'), '')
  assert.equal(carryStandin(undefined, 'a field'), '')
})

test('with no card waiting the picture goes into its slot at once; with no canvas no card is made', () => {
  let filled = 0
  carryEnd('home/hero|a horse', '/img/x.png', () => filled++)
  assert.equal(filled, 1)
  carryStart({ page: 'home', layer: 'hero', gen: 'a horse' }, 0)
  assert.equal(carryCards.size, 0)
  assert.equal(carryMoving(), false)
})
