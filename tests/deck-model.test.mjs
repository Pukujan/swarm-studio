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

test('Replay types each finished section back in, in time order, and cuts long gaps to 1.5 s', async () => {
  const { withTyping, schedule } = await import('../ui/src/screens/deck/replay.ts')
  const saved = deckEvents('done')
  const events = withTyping(saved)
  const deltas = events.filter(e => e.type === 'layer:delta')
  assert.ok(deltas.length >= 6 * 8, 'each section in at least six pieces')
  // the pieces of one section make its finished HTML, and they come before its layer:done
  const done = saved.find(e => e.type === 'layer:done' && e.page === 'home' && e.layer === 'hero')
  const mine = deltas.filter(e => e.page === 'home' && e.layer === 'hero')
  assert.equal(mine.map(e => e.text).join(''), done.html)
  assert.ok(events.indexOf(mine.at(-1)) < events.indexOf(done))
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t)
  // folded, the replay ends where the saved build does
  assert.deepEqual(fold(events, RUN).order.map(k => fold(events, RUN).layers[k].text), fold(saved, RUN).order.map(k => fold(saved, RUN).layers[k].text))
  const at = schedule([{ type: 'a', t: 0 }, { type: 'b', t: 1000 }, { type: 'c', t: 61000 }])
  assert.deepEqual(at, [0, 1000, 2500])
})

test('Publish and Export are the build\'s own: its saved events bring back the live link, never a stale "publishing"', async () => {
  const { liveUrl, doneSections } = await import('../ui/src/screens/deck/model.ts')
  const old = Date.now() - 60_000
  const saved = [...deckEvents('done'),
    { type: 'publish:start', run: RUN, t: old, target: 'github' },
    { type: 'publish:stage', run: RUN, t: old, target: 'github', stage: 'push' },
    { type: 'publish:done', run: RUN, t: old, target: 'local', url: 'http://127.0.0.1:4319/site/x/' },
    { type: 'publish:done', run: RUN, t: old, target: 'github', url: 'https://me.github.io/alpha-tea/' },
    { type: 'publish:done', run: RUN, t: old, target: 'local', url: 'http://127.0.0.1:4319/site/y/' },
    { type: 'export', run: RUN, t: old, pages: 3, sections: 8, dir: '/tmp/x', zip: '/tmp/x.zip' }]
  const m = fold(saved, RUN)
  assert.equal(m.publish.state, 'done')
  // a public link wins over this computer's, whatever came last
  assert.equal(liveUrl(m), 'https://me.github.io/alpha-tea/')
  assert.deepEqual(m.exported, { pages: 3, sections: 8, dir: '/tmp/x', zip: true })
  assert.equal(doneSections(m).length, 8)
  // a step happening now shows; the same step from a saved build does not
  const now = apply(m, { type: 'publish:stage', run: RUN, t: Date.now(), target: 'vercel', stage: 'upload' })
  assert.equal(now.publish.state, 'working')
  assert.equal(now.publish.stage, 'upload')
  assert.equal(fold([...deckEvents('done'), { type: 'publish:start', run: RUN, t: old, target: 'github' }], RUN).publish.state, 'none')
  assert.equal(apply(now, { type: 'publish:failed', run: RUN, t: Date.now(), target: 'vercel', message: 'no token' }).publish.message, 'no token')
})

test('a hand edit, a fix or Undo changes a finished section without counting it twice', () => {
  const m = fold(deckEvents('done'), RUN)
  const k = 'home/hero'
  const n = apply(m, { type: 'layer:done', run: RUN, t: Date.now(), page: 'home', layer: 'hero', html: '<section>by hand</section>', fixed: true, restored: true })
  assert.equal(n.done, m.done)
  assert.equal(n.layers[k].text, '<section>by hand</section>')
  assert.equal(n.layers[k].ver, m.layers[k].ver + 1)
})

test('a comment thread holds the note and the crew\'s reply; the Critic\'s issue stays until the section is reworked', () => {
  let m = fold(deckEvents('done'), RUN)
  const t = Date.now()
  m = apply(m, { type: 'comment', run: RUN, t, text: 'make the heading warmer', target: 'home/hero' })
  m = apply(m, { type: 'comment:take', run: RUN, t: t + 1, text: 'make the heading warmer', page: 'home', layer: 'hero', role: 'hero', agent: 'a1', reply: '' })
  assert.deepEqual(m.threads['home/hero'].map(n => [n.who, n.text]), [['You', 'make the heading warmer'], ['Mochi', 'On it, reworking the hero.']])
  // a comment the planner routed arrives only as the crew taking it: the person's words come first
  m = apply(m, { type: 'comment:take', run: RUN, t: t + 2, text: 'bigger prices', page: 'plans', layer: 'features', role: 'features', agent: 'a0', reply: 'Making the prices bigger.' })
  assert.deepEqual(m.threads['plans/features'].map(n => n.who), ['You', 'Pip'])
  m = apply(m, { type: 'review:issue', run: RUN, t: t + 3, page: 'gifts', layer: 'hero', agent: 'a0', problem: 'the heading is cut off on phones' })
  assert.equal(m.issues['gifts/hero'].problem, 'the heading is cut off on phones')
  m = apply(m, { type: 'layer:done', run: RUN, t: t + 4, page: 'gifts', layer: 'hero', agent: 'a0', html: '<section>fixed</section>', fixed: true })
  assert.equal(m.issues['gifts/hero'], undefined)
})
