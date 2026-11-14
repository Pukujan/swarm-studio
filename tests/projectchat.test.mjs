// A talk inside a project (the owner's "Night Runner Press" session, 2026-11-12): the planner is told
// what the project has, a different product goes to a new project, "redo from scratch" starts it over,
// and the colours a brief names become the theme, on a new build and on a follow-up.
import test from 'node:test'
import assert from 'node:assert/strict'
import { discuss, writeBrief, routeWords } from '../engine/talkplan.mjs'
import { namedColours, missingColours, fitTheme } from '../engine/pagetype.mjs'
import { extendBase } from '../engine/extend.mjs'
import { runSwarm } from '../engine/run.mjs'

// the owner's three briefs, as their chats kept them
const SNEAKERS = 'Night Runner, a limited sneaker drop from a small running brand: a countdown, live stock per size, a checkout and an orders admin with a restock list.'
const RATS = 'A community website for rat owners and lovers in the NYC tri-state area (NYC boroughs plus NJ and CT towns), making the case for rats as loving pets and connecting local owners.'
const REDO = 'Build a website for NYC rat lovers and care communities: a soft, editorial look in cream, warm grey, muted terracotta, and deep forest green. It serves rat owners and enthusiasts with a community hub (posts, meetups) plus care guides (feeding, health, vets).'
// the theme the sneaker project had: a bright green field, a pink main colour
const NIGHT_PRESS = { name: 'Night Press', direction: 'A deep midnight-blue editorial spread with hot-green drop accents.', vars: { '--background': '#176328', '--foreground': '#fbf9f6', '--primary': '#f04ccd', '--primary-foreground': '#121314', '--muted': '#307e41', '--muted-foreground': '#cfe6d3', '--border': '#3a8a4b', '--accent': '#f04ccd', '--card': '#1d6e30' }, fonts: { heading: 'Playfair Display', body: 'Inter' } }
const STATE = 'Project: "Night Runner Press".\nBuilt: 4 pages (The Drop; Sizes; Checkout; Orders).\nIts look: "Night Press", background #176328, text #fbf9f6, main colour #f04ccd.\nRunning now: app (turn 1: building).'

test('inside a project the planner is told what is there, never that nothing exists', async () => {
  let system = ''
  const chat = async m => { system = m[0].content; return 'There are 4 pages so far.' }
  await discuss({ said: [{ who: 'you', text: 'what is this lol' }], chat, project: STATE })
  assert.match(system, /Night Runner Press/)
  assert.match(system, /4 pages/)
  assert.match(system, /Never say nothing exists/)
  assert.doesNotMatch(system, /nothing is being built and nothing has started/)
  // outside a project the talk is as it was
  await discuss({ said: [{ who: 'you', text: 'a tea shop site' }], chat })
  assert.match(system, /nothing has started/)
})

test('a different product, typed in a project, comes back as a new project; outside one there is no route', async () => {
  const said = [{ who: 'you', text: 'lets make one around nyc loving rat communities in the tri state area' }, { who: 'hermia', text: 'Pages?' }, { who: 'you', text: 'yea go start it' }]
  const planner = async () => JSON.stringify({ build: true, brief: RATS, route: 'new' })
  assert.deepEqual(await discuss({ said, chat: planner, project: STATE }), { brief: RATS, route: 'new' })
  assert.deepEqual(await discuss({ said, chat: planner }), { brief: RATS })
})

test('"redo from scratch" is a start-over, whatever the planner picked', async () => {
  const said = [{ who: 'you', text: "can we redo from scratch instead? i really odnt like these colors pls" }, { who: 'hermia', text: 'Which colours?' }, { who: 'you', text: 'can we redo from scratch, you choose' }]
  const out = await writeBrief({ said, chat: async () => JSON.stringify({ build: true, brief: REDO, route: 'add' }), project: STATE })
  assert.equal(out.route, 'redo')
  assert.equal(routeWords('make it a separate site'), 'new')
  assert.equal(routeWords('add a meetups page'), '')
})

test('the colours a brief names are checked against the theme', () => {
  assert.deepEqual(namedColours(REDO), ['grey', 'cream', 'terracotta', 'green'])
  // the sneaker theme has no grey and no terracotta: the reviewer's check finds it
  assert.deepEqual(missingColours(REDO, NIGHT_PRESS.vars), ['grey', 'terracotta'])
  const fits = { '--background': '#f6f0e4', '--foreground': '#4a4541', '--primary': '#2f5a3c', '--accent': '#c0694a', '--muted': '#ece3d3', '--card': '#fbf7ef', '--border': '#d9cfbf' }
  assert.deepEqual(missingColours(REDO, fits), [])
  // a colour they say they do not want is not asked for
  assert.deepEqual(namedColours('you choose, just not this green and no pink'), [])
})

test('a coloured ground keeps the planner\'s own background hue (midnight blue stays blue)', () => {
  const t = fitTheme({ vars: { '--background': '#0d1633', '--primary': '#3ddc6a' } }, { ground: 'colour' })
  const b = t.vars['--background']
  assert.ok(parseInt(b.slice(5, 7), 16) > parseInt(b.slice(3, 5), 16), `blue, not green: ${b}`)
  assert.equal(t.vars['--primary'], '#3ddc6a', 'a main colour far from the ground stays')
})

const sse = text => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`)); c.close() } }), { status: 200 })
const ev = (type, data) => ({ type, t: 1, run: 'r1', ...data })
const BUILT = [
  ev('run:start', { brief: SNEAKERS }),
  ev('pagetype', { key: 'shop', name: 'Shop' }),
  ev('theme', NIGHT_PRESS),
  ev('page', { id: 'drop', title: 'The Drop', purpose: 'x', index: 0 }),
  ev('layer:plan', { page: '*', id: 'nav', role: 'navigation', height: 80, links: [] }),
  ev('layer:plan', { page: 'drop', id: 'drop-hero', role: 'hero', height: 300, links: [] }),
  ev('layer:done', { page: '*', layer: 'nav', html: '<nav>Night Runner</nav>', agent: 'a0' }),
  ev('layer:done', { page: 'drop', layer: 'drop-hero', html: '<section>drop</section>', agent: 'a1' }),
  ev('run:done', { pages: 1 })
]

test('a follow-up that names its colours re-themes the whole project, and the next version keeps it', async () => {
  const realFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body), sys = body.messages[0].content
    calls.push(sys.slice(0, 40))
    if (sys.startsWith("You set a website's theme")) return sse(JSON.stringify({ type: 'theme', name: 'Soft Press', direction: 'Cream and forest green.', vars: { '--background': '#f6f0e4', '--foreground': '#4a4541', '--primary': '#2f5a3c', '--primary-foreground': '#ffffff', '--muted': '#ece3d3', '--muted-foreground': '#6b645d', '--border': '#d9cfbf', '--accent': '#c0694a', '--card': '#fbf7ef' } }))
    if (sys.startsWith('You are a page planner')) return sse('{"type":"layer","page":"care","id":"care-hero","role":"hero","content":"Care","links":[],"height":300}')
    if (/^\{|lead designer|follow-up|existing/i.test(sys) && !sys.startsWith('You are a builder')) return sse('{"type":"page","id":"care","title":"Care","purpose":"care guides"}')
    return sse('<section>built</section>')
  }
  const events = []
  try {
    const base = extendBase(BUILT)
    const { plan } = await runSwarm({ provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: base.brief, base, ask: REDO, agents: 2, plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data }) })
    const themes = events.filter(e => e.type === 'theme')
    assert.equal(themes.length, 2, 'the carried theme, then the new one')
    assert.equal(themes.at(-1).vars['--background'], '#f6f0e4')
    assert.equal(plan.theme.name, 'Soft Press')
    assert.deepEqual(events.find(e => e.type === 'theme:check').missing, [])
    assert.ok(events.findIndex(e => e.type === 'theme' && e.by === 'ask') < events.findIndex(e => e.type === 'run:done'), 'the new look is there before the build is done')
    // the version after this one starts from the new look, not the first one
    const next = extendBase(events.map(e => ({ t: 1, run: 'r2', ...e })))
    assert.equal(next.theme.name, 'Soft Press')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('a follow-up that says nothing about the look keeps the theme, with no theme call', async () => {
  const realFetch = globalThis.fetch
  let themeCalls = 0
  globalThis.fetch = async (url, init) => {
    const sys = JSON.parse(init.body).messages[0].content
    if (sys.startsWith("You set a website's theme")) themeCalls++
    if (sys.startsWith('You are a page planner')) return sse('{"type":"layer","page":"faq","id":"faq-hero","role":"hero","content":"FAQ","links":[],"height":300}')
    return sse(sys.startsWith('You are a builder') ? '<section>b</section>' : '{"type":"page","id":"faq","title":"FAQ","purpose":"questions"}')
  }
  const events = []
  try {
    const base = extendBase(BUILT)
    await runSwarm({ provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: base.brief, base, ask: 'add a FAQ page', agents: 2, plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data }) })
    assert.equal(themeCalls, 0)
    assert.equal(events.filter(e => e.type === 'theme').length, 1)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('start over: a new build whose theme lost the named colours is re-themed before it is done', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const sys = JSON.parse(init.body).messages[0].content
    if (sys.startsWith('You are the lead designer')) return sse([JSON.stringify({ type: 'theme', ...NIGHT_PRESS }), '{"type":"page","id":"home","title":"Home","purpose":"x"}'].join('\n') + '\n')
    if (sys.startsWith("You set a website's theme")) return sse(JSON.stringify({ type: 'theme', name: 'Soft Press', vars: { '--background': '#f6f0e4', '--foreground': '#4a4541', '--primary': '#2f5a3c', '--accent': '#c0694a', '--border': '#d9cfbf' } }))
    if (sys.startsWith('You are a page planner')) return sse('{"type":"layer","page":"home","id":"home-hero","role":"hero","content":"Hi","links":[],"height":300}')
    return sse('<section>b</section>')
  }
  const events = []
  try {
    const { plan } = await runSwarm({ provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: REDO, agents: 2, plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data }) })
    assert.equal(plan.theme.vars['--background'], '#f6f0e4')
    assert.equal(events.filter(e => e.type === 'theme').at(-1).by, 'check')
    assert.deepEqual(events.find(e => e.type === 'theme:check').missing, [])
  } finally {
    globalThis.fetch = realFetch
  }
})
