// The next UI's Design deck folds the engine's events the way the current deck draws them (web/canvas/events.js):
// ui/src/screens/deck/model.ts, run here by Node's own type stripping, on the stories' build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fold, apply, empty, layersOf, detectTool } from '../ui/src/screens/deck/model.ts'
import { deckEvents, RUN } from '../ui/src/screens/deck/deck.fixture.ts'

test('a finished build: every page and section, all done, the crew at rest', () => {
  const m = fold(deckEvents('done'), RUN)
  assert.equal(m.state, 'done')
  assert.deepEqual(m.pages.map(p => p.id), ['home', 'plans', 'gifts'])
  assert.equal(m.order.length, 8)
  assert.ok(m.order.every(k => m.layers[k].status === 'done' && m.layers[k].text.includes('<section')))
  assert.equal(m.done, 8)
  assert.ok(m.agents.every(a => a.idle && !a.layer))
  assert.equal(m.theme.vars['--primary'], '#d9a441')
  // the nav and footer are on every page, in the planner's order
  assert.deepEqual(layersOf(m, 'plans').map(l => l.id), ['nav', 'hero', 'features', 'footer'])
})

test('mid-build: the section being written streams, the one just picked up is assigned, each to its agent', () => {
  const m = fold(deckEvents('building'), RUN)
  assert.equal(m.state, 'building')
  const writing = m.order.map(k => m.layers[k]).filter(l => l.status === 'streaming')
  const assigned = m.order.map(k => m.layers[k]).filter(l => l.status === 'assigned')
  assert.equal(writing.length, 1)
  assert.equal(assigned.length, 1)
  for (const l of [...writing, ...assigned]) assert.equal(m.agents.find(a => a.id === l.agent).layer, l.key)
})

test('Stop keeps what is built and lets a section caught half way go', () => {
  const m = fold(deckEvents('stopped'), RUN)
  assert.equal(m.state, 'stopped')
  assert.ok(!m.order.some(k => ['assigned', 'streaming'].includes(m.layers[k].status)))
  assert.equal(m.order.filter(k => m.layers[k].status === 'done').length, 4)
  assert.ok(m.agents.every(a => !a.layer))
})

test('a failed section is marked and counted', () => {
  const m = fold(deckEvents('failed'), RUN)
  assert.equal(m.failed, 1)
  assert.equal(m.order.filter(k => m.layers[k].status === 'failed').length, 1)
})

test('another build\'s events are not this deck\'s; its run:start takes the deck over (a new build)', () => {
  const m = fold(deckEvents('done'), RUN)
  assert.equal(apply(m, { type: 'layer:delta', run: 'other', page: 'home', layer: 'hero', text: 'x' }), m)
  const n = apply(m, { type: 'run:start', run: 'other', brief: 'Next one', agents: [] })
  assert.equal(n.run, 'other')
  assert.equal(n.pages.length, 0)
  assert.equal(empty('r').state, 'empty')
})

test('the tool an agent holds is read off what it is writing (web/canvas/deck.js detectTool)', () => {
  assert.equal(detectTool('<section class="p-8"><h1>Tea'), 'text')
  assert.equal(detectTool('<div class="rounded-xl bg-[var(--card)]'), 'rect')
  assert.equal(detectTool('<svg viewBox="0 0 24 24"><path d="M'), 'image')
  assert.equal(detectTool('<a data-goto="plans"'), 'connect')
  assert.equal(detectTool(''), 'frame')
})
