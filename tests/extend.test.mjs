// node --test tests/extend.test.mjs
// A message inside an open build makes the project's next version: every page is kept
// as it stands and the crew adds only what was asked (engine/extend.mjs, web/route.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { extendBase, carryEvents, extendPlannerMessages, EXTEND_SYSTEM, baseBrief, navAsk } from '../engine/extend.mjs'
import { runSwarm } from '../engine/run.mjs'
import { routeMessage } from '../web/route.js'

// a finished 2-page CRM build, with an edit, a fix and a picture painted twice
const NAV = '<nav><a data-goto="overview">Pipeline</a><a data-goto="contacts">Contacts</a></nav>'
const EVENTS = [
  { type: 'run:start', t: 1, run: 'r1', brief: 'A CRM dashboard for a small agency\n\nThe owner uploaded these pictures. x' },
  { type: 'pagetype', t: 1, run: 'r1', key: 'tool', name: 'Tool' },
  { type: 'theme', t: 2, run: 'r1', name: 'Ledger Grey', direction: 'quiet tables', vars: { '--background': '#fff', '--primary': '#111' }, fonts: { heading: 'Inter', body: 'Inter' }, radius: '8px' },
  { type: 'art', t: 2, run: 'r1', name: 'Ink wash', style: 'ink wash, muted' },
  { type: 'page', t: 3, run: 'r1', id: 'overview', title: 'Pipeline Overview', purpose: 'Deals at a glance', index: 0 },
  { type: 'page', t: 3, run: 'r1', id: 'contacts', title: 'Contacts', purpose: 'Everyone you talk to', index: 1 },
  { type: 'layer:plan', t: 4, run: 'r1', page: '*', id: 'nav', role: 'navigation', height: 80, links: ['overview', 'contacts'] },
  { type: 'layer:plan', t: 4, run: 'r1', page: '*', id: 'footer', role: 'footer', height: 120, links: [] },
  { type: 'layer:plan', t: 4, run: 'r1', page: 'overview', id: 'overview-hero', role: 'hero', height: 400, links: [] },
  { type: 'layer:plan', t: 4, run: 'r1', page: 'contacts', id: 'contacts-table', role: 'table', height: 500, links: [] },
  { type: 'layer:done', t: 5, run: 'r1', agent: 'a0', page: '*', layer: 'nav', html: NAV, ms: 900, done: 1, planned: 4 },
  { type: 'layer:done', t: 5, run: 'r1', agent: 'a1', page: '*', layer: 'footer', html: '<footer>f</footer>' },
  { type: 'layer:done', t: 5, run: 'r1', agent: 'a2', page: 'overview', layer: 'overview-hero', html: '<section>old hero <img data-gen="a desk"></section>' },
  { type: 'layer:done', t: 5, run: 'r1', agent: 'a3', page: 'contacts', layer: 'contacts-table', html: '<section>table</section>' },
  { type: 'image', t: 6, run: 'r1', page: 'overview', layer: 'overview-hero', gen: 'a desk', src: '/img/r1/1.webp' },
  { type: 'edit', t: 7, run: 'r1', kind: 'scale', id: 'type', axis: 'type', value: '1' },
  { type: 'layer:reset', t: 8, run: 'r1', page: 'overview', layer: 'overview-hero' },
  { type: 'layer:done', t: 9, run: 'r1', agent: 'a4', page: 'overview', layer: 'overview-hero', html: '<section>new hero <img data-gen="a desk"></section>', fixed: true },
  { type: 'image', t: 10, run: 'r1', page: 'overview', layer: 'overview-hero', gen: 'a desk', src: '/img/r1/2.webp' },
  { type: 'review:done', t: 11, run: 'r1', page: 'overview', issues: [] },
  { type: 'run:done', t: 12, run: 'r1', ms: 1000 }
]

test('the base keeps the brief, page type, theme, pages and each section as it stands now', () => {
  const b = extendBase(EVENTS, { shared: [{ page: '*', id: 'nav', content: 'Pipeline, Contacts; CTA New deal' }], pages: [] })
  assert.equal(b.brief, 'A CRM dashboard for a small agency')
  assert.equal(b.pageType, 'tool')
  assert.equal(b.theme.name, 'Ledger Grey')
  assert.equal(b.art.name, 'Ink wash')
  assert.deepEqual(b.pages.map(p => p.id), ['overview', 'contacts'])
  assert.equal(b.pages[0].layers[0].html, '<section>new hero <img data-gen="a desk"></section>', 'a fix wins over the first build')
  assert.equal(b.shared.find(l => l.id === 'nav').content, 'Pipeline, Contacts; CTA New deal')
  assert.equal(extendBase([{ type: 'run:start', kind: 'game' }]), null, 'a game is not extended')
  assert.equal(baseBrief('A\n\nFor this version: more'), 'A')
})

test('carried events keep their order, one finished section each, the newest picture, no agents', () => {
  const c = carryEvents(EVENTS)
  const types = c.map(e => e.type)
  assert.ok(!types.includes('layer:reset') && !types.includes('review:done') && !types.includes('run:start') && !types.includes('run:done'))
  const heroDone = c.filter(e => e.type === 'layer:done' && e.data.layer === 'overview-hero')
  assert.equal(heroDone.length, 1)
  assert.equal(heroDone[0].data.fixed, true)
  assert.equal(heroDone[0].data.kept, true)
  // the edit came after the first sections and before the fix: it stays there
  assert.ok(types.indexOf('edit') < c.indexOf(heroDone[0]))
  assert.ok(c.filter(e => e.type === 'layer:done').every(e => e.data.kept && !('agent' in e.data) && !('done' in e.data)))
  assert.deepEqual(c.filter(e => e.type === 'image').map(e => e.data.src), ['/img/r1/2.webp'])
})

test('the follow-up planner sees every existing page and the request, and plans only the new', () => {
  const b = extendBase(EVENTS)
  const [sys, user] = extendPlannerMessages({ base: b, ask: 'add more about social media and billboards' })
  assert.equal(sys.content, EXTEND_SYSTEM)
  assert.match(EXTEND_SYSTEM, /Never re-plan, repeat or rename an existing page/)
  assert.match(EXTEND_SYSTEM, /"type":"page"/)
  assert.match(EXTEND_SYSTEM, /"type":"change"/)
  assert.match(user.content, /overview "Pipeline Overview"/)
  assert.match(user.content, /contacts "Contacts"/)
  assert.match(user.content, /overview-hero \(hero\)/)
  assert.match(user.content, /The owner asks: add more about social media and billboards/)
  assert.match(user.content, /Brief: A CRM dashboard for a small agency/)
  const ask = navAsk([...b.pages, { id: 'social', title: 'Social' }], [{ id: 'social', title: 'Social' }])
  assert.match(ask, /data-goto="social"/)
  assert.match(ask, /Pipeline Overview → data-goto="overview"/)
})

// A model stand-in: answers by which prompt it is given, as a stream
function fakeModel() {
  const calls = []
  const answer = body => {
    const sys = body.messages[0].content, user = body.messages.at(-1).content
    if (sys.startsWith('You are the lead designer') && sys.includes('already built')) {
      return [
        '{"type":"page","id":"contacts","title":"Contacts","purpose":"dupe","sections":"hero"}',
        '{"type":"page","id":"social","title":"Social Media","purpose":"Campaign reach","sections":"hero, feed"}',
        '{"type":"page","id":"billboards","title":"Billboards","purpose":"Out of home","sections":"hero, map"}',
        '{"type":"change","page":"overview","layer":"overview-hero","ask":"mention campaigns"}'
      ].join('\n')
    }
    if (sys.startsWith('You are a page planner')) {
      const id = /Plan this page: ([\w-]+)/.exec(user)[1]
      return `{"type":"layer","page":"${id}","id":"${id}-hero","role":"hero","content":"Hi","links":[],"height":300}\n{"type":"layer","page":"${id}","id":"${id}-more","role":"feed","content":"More","links":[],"height":300}`
    }
    if (user.includes('Current section:')) return user.includes('<nav>') ? '<nav>new nav</nav>' : '<section>changed</section>'
    return '<section>built</section>'
  }
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push(body)
    const text = answer(body)
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close() } }), { status: 200 })
  }
  return calls
}

test('a follow-up run keeps every page and builds only the new pages, the nav and named changes', async () => {
  const realFetch = globalThis.fetch
  const calls = fakeModel()
  const events = []
  try {
    const base = extendBase(EVENTS)
    const { plan, result } = await runSwarm({
      provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: `${base.brief}\n\nFor this version: x`, ask: 'add social media and billboards',
      base, agents: 3, plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data })
    })
    assert.deepEqual(plan.pages.map(p => p.id), ['overview', 'contacts', 'social', 'billboards'])
    assert.equal(plan.pages[1].layers[0].html, '<section>table</section>', 'an untouched page is kept as it was')
    assert.equal(plan.pages[0].layers[0].html, '<section>changed</section>', 'a named change is rewritten')
    assert.equal(plan.shared.find(l => l.id === 'nav').html, '<nav>new nav</nav>', 'the nav links the new pages')
    assert.equal(plan.shared.find(l => l.id === 'footer').html, '<footer>f</footer>')
    assert.equal(plan.theme.name, 'Ledger Grey')
    assert.deepEqual(result.added.map(p => p.title), ['Social Media', 'Billboards'])
    assert.deepEqual(result.changed.sort(), ['nav', 'overview-hero'])
    assert.equal(result.kept, 2)
    // only the new and changed sections went to builders: 2 pages × 2 sections + nav + hero
    assert.equal(result.planned, 6)
    assert.equal(result.done, 6)
    const plannerCalls = calls.filter(c => c.messages[0].content.startsWith('You are a page planner'))
    assert.deepEqual(plannerCalls.map(c => /Plan this page: ([\w-]+)/.exec(c.messages.at(-1).content)[1]).sort(), ['billboards', 'social'])
    assert.ok(!calls.some(c => c.messages[0].content.includes('Exactly 4 page lines')), 'no fresh sitemap')
    const start = events.find(e => e.type === 'run:start')
    assert.equal(start.extend, true)
    assert.equal(start.ask, 'add social media and billboards')
    assert.equal(events.filter(e => e.type === 'layer:done' && e.kept).length, 4, 'every kept section is put back on the canvas')
    assert.equal(events.filter(e => e.type === 'theme').length, 1, 'one theme: the old one')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('submit routing: a message in an open build goes to that build', () => {
  const repro = 'add more about the social media, real places , billboards, events and marketing campaigns itself'
  // the repro: the CRM open, nothing selected → the CRM's next version, not a new project
  assert.equal(routeMessage({ text: repro, run: 'r1' }), 'extend')
  // even with a page selected, asking for more is more site, not a rewrite of that page
  assert.equal(routeMessage({ text: repro, run: 'r1', selected: true }), 'extend')
  assert.equal(routeMessage({ text: 'add a page about pricing', run: 'r1', selected: true }), 'extend')
  // an edit of the selected section keeps the /fix path
  assert.equal(routeMessage({ text: 'make the hero darker', run: 'r1', selected: true }), 'fix')
  assert.equal(routeMessage({ text: 'add a button to this', run: 'r1', selected: true }), 'fix')
  // no build open (Projects home, a new file), a game, or the hosted studio: a new build
  assert.equal(routeMessage({ text: repro, run: null }), 'new')
  assert.equal(routeMessage({ text: repro, run: 'g1', site: false }), 'new')
  assert.equal(routeMessage({ text: repro, run: 'r1', hosted: true }), 'new')
  assert.equal(routeMessage({ text: '/fix make it red', run: 'r1' }), 'slash')
  assert.equal(routeMessage({ text: '  ', run: 'r1' }), 'none')
})

test('carried pictures move into the new version, and every src follows them', async () => {
  const fs = await import('node:fs'), { join } = await import('node:path'), { tmpdir } = await import('node:os')
  const { rehomeImages } = await import('../engine/extend.mjs')
  const runs = fs.mkdtempSync(join(tmpdir(), 'extend-'))
  fs.mkdirSync(join(runs, 'r1', 'img'), { recursive: true })
  fs.writeFileSync(join(runs, 'r1', 'img', '2.webp'), 'pic')
  const base = extendBase(EVENTS.map(e => e.layer === 'contacts-table' && e.type === 'layer:done' ? { ...e, html: '<section><img src="/img/r1/2.webp"></section>' } : e))
  assert.equal(rehomeImages(base, runs, join(runs, 'r2'), 'r2', { ...fs, join }), 1)
  assert.equal(fs.readFileSync(join(runs, 'r2', 'img', 'kept-1.webp'), 'utf8'), 'pic')
  assert.deepEqual(base.carry.filter(c => c.type === 'image').map(c => c.data.src), ['/img/r2/kept-1.webp'])
  assert.match(base.carry.find(c => c.data.layer === 'contacts-table' && c.type === 'layer:done').data.html, /\/img\/r2\/kept-1\.webp/)
  assert.match(base.pages[1].layers[0].html, /\/img\/r2\/kept-1\.webp/)
  fs.rmSync(runs, { recursive: true, force: true })
})
