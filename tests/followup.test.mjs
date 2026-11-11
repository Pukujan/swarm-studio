// node --test tests/followup.test.mjs
// "Tell the crew…" inside an open project is that project's next turn, never a new project
// (engine/extend.mjs followUp, server/server.mjs /api/run). Each turn builds on the last.
import test from 'node:test'
import assert from 'node:assert/strict'
import { followUp, carryEvents } from '../engine/extend.mjs'

const BRIEF = 'A tiny ramen bar in Osaka with a 12-seat counter and late-night hours'
const site = (run, { brief = BRIEF, hero = '<section><h1>Twelve Seats</h1></section>', extra = [] } = {}) => [
  { type: 'run:start', t: 1, run, brief },
  { type: 'pagetype', t: 1, run, key: 'local', name: 'Local' },
  { type: 'theme', t: 2, run, name: 'Steam', direction: 'dark broth' },
  { type: 'page', t: 3, run, id: 'home', title: 'Menya Kō', purpose: 'the bar', index: 0 },
  { type: 'layer:plan', t: 4, run, page: '*', id: 'nav', role: 'navigation', links: ['home'] },
  { type: 'layer:plan', t: 4, run, page: 'home', id: 'home-hero', role: 'hero', links: [] },
  { type: 'layer:done', t: 5, run, page: '*', layer: 'nav', html: '<nav>Menya Kō</nav>' },
  { type: 'layer:done', t: 5, run, page: 'home', layer: 'home-hero', html: hero },
  ...extra,
  { type: 'run:done', t: 9, run }
]
// a version whose build failed before any page: nothing to extend
const failed = run => [{ type: 'run:start', t: 1, run, brief: BRIEF }, { type: 'error', t: 2, run, where: 'planner', message: 'no capacity' }, { type: 'run:done', t: 3, run }]
const store = runs => id => (runs[id] ? { events: runs[id], plan: null } : null)

test('a message on the open version extends that version, with the project brief', () => {
  const next = followUp({ ask: 'make the hero headline bigger', from: 'v2', versions: ['v2', 'v1'], read: store({ v1: site('v1'), v2: site('v2') }) })
  assert.equal(next.from, 'v2')
  assert.equal(next.brief, `${BRIEF}\n\nFor this version: make the hero headline bigger`)
  assert.deepEqual(next.base.pages.map(p => p.id), ['home'])
})

test('a failed version on screen extends the newest version that has pages', () => {
  const next = followUp({ ask: 'continue the work', from: 'v3', versions: ['v3', 'v2', 'v1'], read: store({ v1: site('v1'), v2: site('v2', { hero: '<section>v2 hero</section>' }), v3: failed('v3') }) })
  assert.equal(next.from, 'v2')
  assert.equal(next.base.pages[0].layers.find(l => l.id === 'home-hero').html, '<section>v2 hero</section>')
})

test('with nothing to extend, the turn is built from the project brief, not from the bare words', () => {
  const next = followUp({ ask: 'continue the work', from: 'v2', versions: ['v2', 'v1'], read: store({ v1: failed('v1'), v2: failed('v2') }) })
  assert.equal(next.base, null)
  assert.equal(next.brief, `${BRIEF}\n\nFor this version: continue the work`)
  // a game's brief is not a site's, and no brief at all leaves the words as they are
  assert.equal(followUp({ ask: 'x', from: 'g', read: store({ g: [{ type: 'run:start', run: 'g', kind: 'game', brief: 'Rooftop Signal' }] }) }), null)
  assert.equal(followUp({ ask: 'x', from: 'gone', read: store({}) }), null)
})

test('turns in a row each build on the last: no edit is lost, the brief does not pile up', () => {
  const runs = { v1: site('v1') }
  const read = store(runs)
  let from = 'v1'
  const asks = ['make the hero headline bigger', 'add the closing time to the hero', 'warmer colours']
  asks.forEach((ask, i) => {
    const next = followUp({ ask, from, versions: Object.keys(runs).reverse(), read })
    assert.equal(next.from, from, `turn ${i + 1} extends the version before it`)
    assert.equal(next.brief, `${BRIEF}\n\nFor this version: ${ask}`)
    // the new version: what the server puts back (carry) plus this turn's change and an edit
    const id = `v${i + 2}`
    const hero = next.base.pages[0].layers.find(l => l.id === 'home-hero').html
    runs[id] = [
      { type: 'run:start', t: 1, run: id, brief: next.brief, extend: true, ask },
      ...carryEvents(runs[from]).map(c => ({ type: c.type, t: 2, run: id, ...c.data })),
      { type: 'layer:done', t: 3, run: id, page: 'home', layer: 'home-hero', html: hero.replace('</section>', `<p>turn ${i + 1}</p></section>`), fixed: true },
      { type: 'edit', t: 4, run: id, kind: 'var', id: `--turn-${i + 1}`, value: '1' },
      { type: 'run:done', t: 5, run: id }
    ]
    from = id
  })
  const last = followUp({ ask: 'one more', from, versions: [], read })
  const hero = last.base.pages[0].layers.find(l => l.id === 'home-hero').html
  for (let i = 1; i <= asks.length; i++) assert.ok(hero.includes(`<p>turn ${i}</p>`), `turn ${i}'s change is still there`)
  const edits = last.base.carry.filter(c => c.type === 'edit').map(c => c.data.id)
  assert.deepEqual(edits, ['--turn-1', '--turn-2', '--turn-3'], 'every edit is carried')
  assert.equal(last.base.brief, BRIEF)
})

test('a section named without its page is the one on the first page', async () => {
  const { EXTEND_SYSTEM } = await import('../engine/extend.mjs')
  assert.match(EXTEND_SYSTEM, /named without its page[^\n]*first page/)
})
