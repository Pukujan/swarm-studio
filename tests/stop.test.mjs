// Stop (the top bar's Stop, `hermes swarm --stop`, the swarm_studio tool): a stopped build takes no
// more sections, aborts the model calls in flight, keeps what is built and ends with run:stopped.
// Resume builds only what the stop left unbuilt.
import test from 'node:test'
import assert from 'node:assert/strict'
import { extendBase } from '../engine/extend.mjs'
import { runSwarm } from '../engine/run.mjs'

const ev = (type, data) => ({ type, t: 1, run: 'r1', ...data })
const plan = (page, id, role) => ev('layer:plan', { page, id, role, height: 300, links: [] })
const done = (page, layer, html) => ev('layer:done', { page, layer, html, agent: 'a0' })
// a build stopped part way: the nav and the first hero are built, the rest is planned only
const STOPPED = [
  ev('run:start', { brief: 'A tea shop' }),
  ev('pagetype', { key: 'shop', name: 'Shop' }),
  ev('theme', { name: 'Leaf', vars: { '--background': '#fff' }, fonts: { heading: 'Inter', body: 'Inter' } }),
  ev('page', { id: 'home', title: 'Home', purpose: 'x', index: 0 }),
  ev('page', { id: 'teas', title: 'Teas', purpose: 'y', index: 1 }),
  plan('*', 'nav', 'navigation'),
  plan('home', 'home-hero', 'hero'),
  plan('home', 'home-more', 'story'),
  plan('teas', 'teas-grid', 'grid'),
  plan('teas', 'teas-more', 'faq'),
  done('*', 'nav', '<nav>Leaf</nav>'),
  done('home', 'home-hero', '<section>hero</section>'),
  ev('run:stopped', { stopped: true })
]

const sse = text => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`)); c.close() } }), { status: 200 })

test('a stopped build takes no more sections, aborts the calls in flight and ends with run:stopped', async () => {
  const realFetch = globalThis.fetch
  const calls = []
  // every builder call hangs until it is aborted, like a slow model
  globalThis.fetch = async (url, init) => {
    calls.push({ body: JSON.parse(init.body), signal: init.signal })
    return new Response(new ReadableStream({
      start(c) { init.signal?.addEventListener('abort', () => c.error(new DOMException('The operation was aborted.', 'AbortError'))) }
    }), { status: 200 })
  }
  const events = []
  const controller = new AbortController()
  try {
    const base = extendBase(STOPPED)
    const running = runSwarm({
      provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: base.brief, base, resume: true, agents: 2,
      plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data }), signal: controller.signal
    })
    // two builders on two sections, a third section still waiting in the queue
    while (calls.length < 2) await new Promise(r => setTimeout(r, 5))
    await new Promise(r => setTimeout(r, 20))
    assert.equal(calls.length, 2)
    controller.abort()
    const { result } = await running
    assert.equal(calls.length, 2, 'no model call after the stop: the waiting section is not taken')
    assert.ok(calls.every(c => c.signal?.aborted), 'the calls in flight were aborted at the provider')
    assert.equal(result.stopped, true)
    assert.equal(events.at(-1).type, 'run:stopped', 'the last word is run:stopped')
    assert.ok(!events.some(e => e.type === 'run:done'), 'no run:done, so the pictures and the review do not start')
    assert.ok(!events.some(e => e.type === 'layer:failed'), 'a section caught half way is left unbuilt, not failed')
    assert.ok(!events.some(e => e.type === 'error'), 'a stop is not an error')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('Resume builds only the sections the stop left, and plans a page it never reached', async () => {
  const realFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push(body)
    const sys = body.messages[0].content, user = body.messages.at(-1).content
    if (sys.startsWith('You are a page planner')) {
      const id = /Plan this page: ([\w-]+)/.exec(user)[1]
      return sse(`{"type":"layer","page":"${id}","id":"${id}-hero","role":"hero","content":"Hi","links":[],"height":300}`)
    }
    return sse('<section>built</section>')
  }
  const events = []
  try {
    // a third page the stop came before: no sections planned yet
    const base = extendBase([...STOPPED.slice(0, 5), ev('page', { id: 'visit', title: 'Visit', purpose: 'z', index: 2 }), ...STOPPED.slice(5)])
    const { plan, result } = await runSwarm({
      provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: base.brief, base, resume: true, agents: 3,
      plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data })
    })
    assert.equal(events.find(e => e.type === 'run:start').resume, true)
    const planners = calls.filter(c => c.messages[0].content.startsWith('You are a page planner'))
    assert.deepEqual(planners.map(c => /Plan this page: ([\w-]+)/.exec(c.messages.at(-1).content)[1]), ['visit'], 'only the page it never reached is planned')
    assert.ok(!calls.some(c => /lead designer/.test(c.messages[0].content)), 'no sitemap or follow-up planner')
    // three left unbuilt, plus the new page's one section; the nav and the hero are kept as they were
    assert.equal(result.planned, 4)
    assert.equal(result.done, 4)
    assert.equal(plan.shared.find(l => l.id === 'nav').html, '<nav>Leaf</nav>')
    assert.equal(plan.pages[0].layers.find(l => l.id === 'home-hero').html, '<section>hero</section>')
    assert.ok(plan.pages.flatMap(p => p.layers).every(l => l.html), 'every section is built')
    assert.equal(events.at(-1).type, 'run:done')
  } finally {
    globalThis.fetch = realFetch
  }
})
