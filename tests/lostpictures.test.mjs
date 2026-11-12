// Pictures painted for a build whose events were dropped when a newer build started (engine/assets.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lostPictures } from '../engine/assets.mjs'

const id = '2026-11-11T22-47-35-583Z'
const q = (page, layer, gen) => ({ type: 'image:queued', run: id, page, layer, gen, provider: 'ckff', model: 'gpt-image-2.5' })
const events = [q('home', 'hero', 'a supper club table'), q('home', 'chef', 'a chef at the pass'), q('menu', 'dish', 'saffron rice')]

test('a build that says 0 pictures with its files on disk gets them back, slot by slot', () => {
  const got = lostPictures({ id, events, img: ['1.png', '2.png', '3.png', 'snap.jpg'], now: 5 })
  assert.equal(got.length, 3)
  assert.deepEqual(got[1], { type: 'image', t: 5, run: id, page: 'home', layer: 'chef', gen: 'a chef at the pass', src: `/img/${id}/2.png`, model: 'gpt-image-2.5', recovered: true })
})

test('a slot with a picture or a failure on record is left alone, and so is one with no file', () => {
  const had = [...events, { type: 'image', page: 'home', layer: 'hero', gen: 'a supper club table', src: `/img/${id}/1.png` }, { type: 'image:failed', page: 'menu', layer: 'dish', gen: 'saffron rice', message: 'no image' }]
  assert.deepEqual(lostPictures({ id, events: had, img: ['1.png', '3.png'] }), [])
  assert.deepEqual(lostPictures({ id, events, img: ['snap.jpg', 'edit-abc.png'] }), [])
})

test('a later Try again writes no numbered file, so it is never matched to one', () => {
  // three slots in the build's own queue (files 1 to 3), then a Try again on the first
  const later = [...events, q('home', 'hero', 'a supper club table')]
  const got = lostPictures({ id, events: later, img: ['1.png', '2.png', '3.png', 'edit-m3x.png'] })
  assert.deepEqual(got.map(e => e.src.split('/').pop()), ['1.png', '2.png', '3.png'])
})
