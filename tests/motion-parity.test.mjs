// The motion parity check (scripts/motion-parity.mjs, docs/ux/MOTION.md) plays the motion check's own scenes. It
// keeps a copy of them, so a change to it does not set off the motion check's base-against-head run; the copy
// must stay word for word the same. And its known list is labelled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const block = (src, from, to) => { const i = src.indexOf(from); assert.ok(i >= 0, from); return src.slice(i, src.indexOf(to, i)) }

test("the parity check plays the motion check's scenes, crew and seed, word for word", () => {
  const check = read('scripts/motion-check.mjs'), parity = read('scripts/motion-parity.mjs')
  for (const [from, to] of [
    ['async function loadPlaywright() {', '\n// a build with a crew'],
    ['// a build with a crew of four', '// the scenes: an address'],
    ['// the scenes: an address', '// Math.random, seeded'],
    ['// Math.random, seeded', '\n'],
    ["const FROZEN = new Date(", '\n']
  ]) assert.equal(block(parity, from, to), block(check, from, to), from)
})

test('every known difference is labelled intended (with its PR) or drift, with a why', () => {
  const known = JSON.parse(read('docs/ux/motion/parity-known.json'))
  assert.ok(known.length)
  for (const k of known) {
    assert.match(k.label, /^(intended \(PR #\d+\)|drift)$/, k.key)
    assert.ok(k.why && k.why.length > 20, k.key)
  }
  assert.equal(new Set(known.map(k => k.key)).size, known.length)
})
