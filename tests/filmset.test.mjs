import { test } from 'node:test'
import assert from 'node:assert/strict'
import { likeness, onBeat, scoreSet, fixtureBuild } from '../engine/filmscore.mjs'
import { runSet, loadSet, timed } from '../scripts/film-set.mjs'

test('the set is 20 prompts over five builds, each expecting a kind', () => {
  const set = loadSet()
  assert.equal(set.prompts.length, 20)
  assert.equal(new Set(set.prompts.map(p => p.id)).size, 20)
  for (const p of set.prompts) { assert.ok(set.builds[p.build], p.id); assert.ok(p.expect.length, p.id) }
  assert.equal(fixtureBuild(set.builds.game).clips.length, 2)
})

test('likeness and the beat measure', () => {
  assert.equal(likeness(['a', 'b', 'c'], ['a', 'b', 'c']), 1)
  assert.equal(likeness(['a', 'b'], ['c', 'd']), 0)
  assert.equal(likeness(['a', 'b', 'c', 'd'], ['a', 'b', 'x', 'd']), 0.75)
  // 120 BPM: a beat every 0.5 s
  assert.equal(onBeat([1, 1.5, 2, 1], 120).beat, 1)
  assert.equal(onBeat([1.13, 1, 1], 120).beat, 0)
  assert.equal(onBeat([1.25, 1, 1], 120).half, 1)
  // a track whose beat does not start at 0
  assert.equal(onBeat([1.2, 1, 1], 120, { phase: 0.2 }).beat, 1)
})

test('with no model, every film in the set finishes', async () => {
  const out = await runSet({ seed: 1 })
  assert.equal(out.summary.films, 20)
  assert.equal(out.summary.finishes, 20, out.films.filter(f => !f.finished).map(f => f.id).join(', '))
  for (const r of out.results) assert.ok(timed(r.board).every(d => d >= 0.3 && d <= 12), r.id)
})

test('a film the renderer cannot play does not count as finished', () => {
  const c = fixtureBuild(loadSet().builds.shop)
  const bad = Object.assign([{ kind: 'image', image: 99, headline: 'x', seconds: 2, layer: 'story' }], { fixes: [] })
  const s = scoreSet([{ id: 'bad', build: 'shop', expect: ['demo'], c, board: bad }, { id: 'none', build: 'shop', expect: ['demo'], c, board: null, error: 'x' }])
  assert.equal(s.summary.finishes, 0)
})
