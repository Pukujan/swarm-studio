// Craft rules and the scored review (decision 0016 points 2 and 5, issue #449): the builders' prompt carries the
// condensed rules and stays short enough to cache, and a page under the bar is reviewed again until it passes
// or the rounds run out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WORKER_SYSTEM } from '../engine/prompts.mjs'
import { reviewAgain, REVIEW_PASS, REVIEW_ROUNDS } from '../engine/review.mjs'

test("the builders' prompt has the craft rules and stays short", () => {
  for (const rule of ['Never the AI defaults', 'One accent', 'One solid button per action', 'tracking-widest', '4.5:1', 'focus ring', '44px'])
    assert.ok(WORKER_SYSTEM.includes(rule), rule)
  // about 3.4 KB: the shared, cached opening of every section's call (it was 2.4 KB)
  assert.ok(WORKER_SYSTEM.length < 4000, `${WORKER_SYSTEM.length} characters`)
})

test('the reviewer scores the page and names the AI-default look', () => {
  const src = readFileSync(new URL('../engine/review.mjs', import.meta.url), 'utf8')
  assert.match(src, /Score the page 0 to 10/)
  assert.match(src, /"score":0-10/)
  assert.match(src, /the AI-default look/)
})

test("a page under the bar goes again until it passes or the rounds run out, as Critique Theater's defaults", () => {
  assert.equal(REVIEW_PASS, 8)
  assert.equal(REVIEW_ROUNDS, 3)
  const issues = [{ section: 'home/hero' }]
  assert.equal(reviewAgain({ score: 6, issues, round: 1 }), true)
  assert.equal(reviewAgain({ score: 6, issues, round: 2 }), true)
  assert.equal(reviewAgain({ score: 6, issues, round: 3 }), false)
  assert.equal(reviewAgain({ score: 8, issues, round: 1 }), false)
  // nothing to fix, or no score (a reviewer that gave none): once, as before
  assert.equal(reviewAgain({ score: 4, issues: [], round: 1 }), false)
  assert.equal(reviewAgain({ score: null, issues, round: 1 }), false)
})

test('the canvas asks for the next round with the round number, and waits for the fixes first', () => {
  const src = readFileSync(new URL('../web/canvas/marks.js', import.meta.url), 'utf8')
  assert.match(src, /mobile, round \}\)/)
  assert.match(src, /if \(!out\.again\) break/)
  assert.match(src, /fixing\(keys\)/)
})
