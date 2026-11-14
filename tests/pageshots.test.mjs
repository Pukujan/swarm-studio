import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitBudget, totalBytes, MAX_PAGES, DESKTOP, PHONE } from '../engine/pageshots.mjs'

const pic = kb => `data:image/webp;base64,${'A'.repeat(Math.ceil(kb * 1024 * 4 / 3))}`

test('the sizes the Feed shows: desktop 1280×800, phone 390×844 at 2×', () => {
  assert.deepEqual([DESKTOP.width, DESKTOP.height], [1280, 800])
  assert.deepEqual([PHONE.width, PHONE.height, PHONE.deviceScaleFactor, PHONE.isMobile, PHONE.hasTouch], [390, 844, 2, true, true])
  assert.equal(MAX_PAGES, 12)
})

test('over the budget, the last pages lose their shots first', () => {
  const shots = [0, 1, 2].map(i => ({ file: `${i}.html`, shot: pic(100), phoneShot: pic(100) }))
  const fit = fitBudget(shots, 450 * 1024)
  assert.ok(totalBytes(fit) <= 450 * 1024)
  assert.ok(fit[0].shot && fit[1].shot && !fit[2].shot && !fit[2].phoneShot)
  assert.equal(fit[2].file, '2.html')
  assert.ok(shots[2].shot, 'the input is left as it was')
})
