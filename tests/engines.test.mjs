// The engine pages (docs/engines/, scripts/engine-docs-check.mjs): every page names its glue code, every claim
// cites a source, and a change to an engine's glue must come with its page.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pages, problems, unread } from '../scripts/engine-docs-check.mjs'

test('every engine page is sound: real glue paths, every claim cited or marked Unchecked', () => {
  const all = pages()
  assert.ok(all.length >= 5, 'docs/engines/ has the engine pages')
  assert.deepEqual(all.flatMap(pg => problems(pg)), [])
})

test('an uncited claim and a missing glue path are caught', () => {
  const pg = { file: 'docs/engines/x.md', glue: ['engine/nope.mjs'], text: '# X\n\n## What it already does\n- It clones sites.\n- It builds dashboards (dyad/src/x.ts:4).\n- Unchecked: Stripe.\n' }
  const bad = problems(pg, () => false)
  assert.equal(bad.length, 2)
  assert.match(bad[0], /does not exist/)
  assert.match(bad[1], /x\.md:4: a claim with no source/)
})

test('a change to glue code needs its page changed or named', () => {
  const all = [{ file: 'docs/engines/dyad.md', glue: ['engine/appjob.mjs', 'dyad/'] }]
  assert.deepEqual(unread(['engine/appjob.mjs'], all), ['docs/engines/dyad.md'])
  assert.deepEqual(unread(['dyad/src/a.ts'], all), ['docs/engines/dyad.md'])
  assert.deepEqual(unread(['engine/appjob.mjs', 'docs/engines/dyad.md'], all), [])
  assert.deepEqual(unread(['engine/appjob.mjs'], all, 'Read docs/engines/dyad.md'), [])
  assert.deepEqual(unread(['web/x.js'], all), [])
})
