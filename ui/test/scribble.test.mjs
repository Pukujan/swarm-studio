// Scribble's rules (src/screens/overview/scribble.ts), held to the classic Overview's (web/project.js): what a drag
// makes, where a mark is drawn on a long page, and what a run's events say about its marks and drafts. Node runs the
// TypeScript file as it is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_MARKS, boxOf, markD, markFrom, markWords, pageK, runMarks } from '../src/screens/overview/scribble.ts'

test('a drag is a stroke, a ring when it comes back to its start, a box with Shift, and nothing when too small', () => {
  const line = [[0.1, 0.1], [0.2, 0.12], [0.3, 0.15], [0.4, 0.2]]
  assert.equal(markFrom(line, false).kind, 'stroke')
  assert.deepEqual(markFrom(line, false).box, boxOf(line))
  const ring = Array.from({ length: 16 }, (_, i) => [0.5 + 0.1 * Math.cos(i * Math.PI / 8), 0.5 + 0.1 * Math.sin(i * Math.PI / 8)])
  assert.equal(markFrom([...ring, [0.6, 0.5]], false).kind, 'ring')
  // Shift: the box between where it started and where it ended, and no points kept
  const box = markFrom(line, true)
  assert.equal(box.kind, 'box')
  assert.deepEqual(box.pts, [])
  assert.deepEqual(box.box, { x: 0.1, y: 0.1, w: 0.30000000000000004, h: 0.1 })
  // a slip of the pointer is not a mark
  assert.equal(markFrom([[0.1, 0.1], [0.102, 0.101]], false), null)
  assert.equal(markFrom([], false), null)
})

test('a mark is drawn where it was made: a page longer than nine widths shows its top, so its marks stretch', () => {
  assert.equal(pageK(undefined), 1)
  assert.equal(pageK(1.5), 1)
  assert.equal(pageK(18), 2)
  assert.equal(markD({ kind: 'stroke', pts: [[0.1, 0.2], [0.3, 0.4]], box: boxOf([[0.1, 0.2], [0.3, 0.4]]) }, 1), 'M100.0 200.0L300.0 400.0')
  assert.equal(markD({ kind: 'stroke', pts: [[0.1, 0.2], [0.3, 0.4]], box: boxOf([[0.1, 0.2], [0.3, 0.4]]) }, 2), 'M100.0 400.0L300.0 800.0')
  assert.equal(markD({ kind: 'box', pts: [], box: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 } }, 1), 'M100 100H600V300.00000000000006H100Z')
  assert.equal(markWords(1), '1 mark')
  assert.equal(markWords(3), '3 marks')
})

test('what a run says about its marks and drafts', () => {
  const k = id => ({ id, kind: 'stroke', page: 'home', pts: [[0.1, 0.1], [0.2, 0.2]], box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } })
  let m = [
    { type: 'marks', marks: [k('k1'), k('k2')] },
    { type: 'marks:read', reads: [{ mark: 'k1', read: 'k1: the headline' }] },
    { type: 'draft:start', page: 'home', layer: 'hero', role: 'hero' }
  ].reduce(runMarks, NO_MARKS)
  assert.deepEqual(m.sent.map(x => [x.id, x.status]), [['k1', 'open'], ['k2', 'open']])
  assert.equal(m.reads.k1, 'k1: the headline')
  assert.deepEqual(m.drafting, [{ page: 'home', layer: 'hero', role: 'hero' }])
  // the draft lands: no longer being written
  m = runMarks(m, { type: 'draft', id: 'd1', page: 'home', layer: 'hero', role: 'hero', html: '<section>x</section>', marks: ['k1'] })
  assert.deepEqual(m.drafting, [])
  assert.deepEqual(m.drafts.map(d => [d.id, d.layer, d.marks]), [['d1', 'hero', ['k1']]])
  // an erased mark, and a draft that is closed with its marks
  m = runMarks(m, { type: 'mark:status', ids: ['k2'], status: 'erased' })
  m = runMarks(m, { type: 'draft:closed', id: 'd1' })
  m = runMarks(m, { type: 'mark:status', ids: ['k1'], status: 'closed' })
  assert.deepEqual(m.sent.map(x => x.status), ['closed', 'erased'])
  assert.deepEqual(m.drafts, [])
  // a draft that did not come is not left waiting; anything else changes nothing; reset empties it
  assert.deepEqual(runMarks(runMarks(NO_MARKS, { type: 'draft:start', page: 'p', layer: 'l' }), { type: 'draft:failed', page: 'p', layer: 'l' }).drafting, [])
  assert.equal(runMarks(m, { type: 'layer:done' }), m)
  assert.equal(runMarks(m, { type: 'reset' }), NO_MARKS)
})
