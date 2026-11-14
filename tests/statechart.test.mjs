// The Studio's statechart (docs/ux/statechart/studio.machine.js, docs/PLANS.md §5): every screen in
// docs/ux/SITEMAP.md has a state, every state names only screens SITEMAP has, every state is reachable
// from the start, and from every state the way home works (docs/ux/RULES.md rule 7): the logo lands on
// Home, and Esc, pressed again and again, climbs to Home without going round in a circle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createActor } from '../web/vendor/xstate/xstate.mjs'
import { studioMachine } from '../docs/ux/statechart/studio.machine.js'

const SITEMAP = readFileSync(new URL('../docs/ux/SITEMAP.md', import.meta.url), 'utf8').replace(/\r/g, '')

// SITEMAP's sections ('## 3. Home', '### Design deck') and, in each, the nodes of its mermaid charts
// that open into something: a place or a layer. A node with no line out is a control or a value on
// the screen it hangs from, and the object map, not the statechart, lists those.
const sections = new Map()
for (const part of SITEMAP.split(/\n(?=#{2,3} )/)) {
  const heading = part.split('\n')[0].replace(/^#+ /, '')
  const labels = new Set()
  const opens = new Set()
  for (const [, chart] of part.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    const label = {}
    for (const m of chart.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\[("([^"]*)"|([^\]"]*))\]/g)) label[m[1]] = m[3] ?? m[4]
    for (const l of Object.values(label)) labels.add(l)
    for (const line of chart.split('\n')) {
      const bare = line.replace(/\[("[^"]*"|[^\]"]*)\]/g, '').replace(/\|[^|]*\|/g, '')
      const ids = bare.split(/-->|-\.->|---/).map(s => s.trim()).filter(s => s in label)
      for (const n of ids.slice(0, -1)) opens.add(label[n])
    }
  }
  if (labels.size) sections.set(heading, { labels, opens })
}

// Sections that are not screens: the flows retell screens other sections already have, and the
// depth table is a table
const NOT_SCREENS = ['12. Flows by audience']
// Nodes that open into something but are not a screen of their own (the reason is in the README)
const NOT_STATES = new Map([
  ['1. The whole product › Hermes: /swarm', 'where the person comes from: Hermes opens the Feed'],
  ['1. The whole product › swarm.design-bakery.com', 'where the person comes from: the web opens the Feed'],
  ['2. Navigation › Swarm: opens on Home', 'the machine starting on Home'],
  ['11. Hermia, the commander › Hermia, the commander', 'a character on many screens, not a place'],
  ['11. Hermia, the commander › Look', 'how Hermia looks'],
  ['11. Hermia, the commander › Where she is', 'which screens Hermia is on'],
  ['11. Hermia, the commander › Voice', 'how Hermia sounds']
])

// every state node of the chart, with its path
const nodes = []
const walk = (node) => { nodes.push(node); for (const child of Object.values(node.states)) walk(child) }
walk(studioMachine.root)
const screens = nodes.filter(n => n.type !== 'history' && n !== studioMachine.root)
const claimed = new Set(screens.flatMap(n => n.meta?.sitemap || []))
const name = n => n.path.join('.')

test('every SITEMAP screen has a state', () => {
  const missing = []
  for (const [heading, { opens }] of sections) {
    if (NOT_SCREENS.includes(heading)) continue
    for (const label of opens) {
      const key = `${heading} › ${label}`
      if (!claimed.has(key) && !NOT_STATES.has(key)) missing.push(key)
    }
  }
  assert.deepEqual(missing, [], `SITEMAP screens with no state in docs/ux/statechart/studio.machine.js:\n${missing.join('\n')}`)
})

test('every state names only screens SITEMAP has, copied word for word', () => {
  const unknown = []
  for (const key of claimed) {
    const [heading, ...rest] = key.split(' › ')
    const label = rest.join(' › ')
    if (!sections.get(heading)?.labels.has(label)) unknown.push(key)
  }
  assert.deepEqual(unknown, [])
  for (const key of NOT_STATES.keys()) {
    const [heading, ...rest] = key.split(' › ')
    assert.ok(sections.get(heading)?.labels.has(rest.join(' › ')), `${key} is no longer in SITEMAP`)
  }
})

test('every state says what it is, who owns it and which live state matches', () => {
  for (const n of screens) {
    assert.ok(n.description, `${name(n)} has no description`)
    assert.ok(['feed', 'studio', 'hosted'].includes(n.meta?.owner), `${name(n)} has no owner`)
    assert.ok(n.meta && 'live' in n.meta, `${name(n)} does not say which live state matches`)
  }
})

// a state's snapshot: the state itself, its parallel siblings on their first states. A player that is
// open says so in the context (the playing flag its entry action sets).
const atomic = screens.filter(n => n.type === 'atomic')
const valueOf = n => n.path.reduceRight((inner, key) => ({ [key]: inner }), {})
const snapshotOf = n => studioMachine.resolveState({
  value: valueOf(n),
  context: { ...studioMachine.config.context, playing: n.path.includes('player') && n.key !== 'closed' }
})
const at = n => createActor(studioMachine, { snapshot: snapshotOf(n) }).start()
const isHome = s => s.matches({ feed: 'home' })

test('every state is reachable from Home', () => {
  // the targets of every transition, guards aside; a state is reached when it or a descendant is
  const seen = new Set([studioMachine.root])
  const queue = [studioMachine.root]
  const enter = t => {
    for (let s = t; s && !seen.has(s); s = s.parent) {
      seen.add(s)
      queue.push(s)
      for (const c of Object.values(s.states)) if (s.type === 'parallel' || c.key === s.config.initial) enter(c)
    }
  }
  while (queue.length) {
    const n = queue.shift()
    for (const list of n.transitions.values()) for (const t of list) for (const target of t.target || []) enter(target.type === 'history' ? target.parent : target)
    if (n.type === 'parallel') for (const c of Object.values(n.states)) enter(c)
    if (n.config.initial) enter(n.states[n.config.initial])
  }
  const orphans = screens.filter(n => !seen.has(n)).map(name)
  assert.deepEqual(orphans, [])
})

test('the logo goes Home from every state', () => {
  for (const n of atomic) {
    const a = at(n)
    assert.ok(a.getSnapshot().can({ type: 'home' }), `no home from ${name(n)}`)
    a.send({ type: 'home' })
    assert.ok(isHome(a.getSnapshot()), `home from ${name(n)} did not land on Home`)
  }
})

test('Esc climbs from every state to Home, one level at a time, never in a circle', () => {
  for (const n of atomic) {
    const a = at(n)
    const been = []
    while (!isHome(a.getSnapshot())) {
      const here = JSON.stringify(a.getSnapshot().value)
      assert.ok(!been.includes(here), `Esc goes round in a circle from ${name(n)}: ${been.join(' → ')}`)
      been.push(here)
      assert.ok(a.getSnapshot().can({ type: 'up' }), `no Esc from ${here} (reached from ${name(n)})`)
      a.send({ type: 'up' })
      assert.ok(been.length < 12, `Esc from ${name(n)} takes more than 12 steps`)
    }
  }
})

test('an open player closes first on Esc, then the room climbs', () => {
  const a = at(screens.find(n => n.path.join('.') === 'build.playable.room.deck.live'))
  a.send({ type: 'play' })
  assert.ok(a.getSnapshot().matches({ build: { playable: { room: 'deck', player: 'prototype' } } }))
  a.send({ type: 'up' })
  assert.ok(a.getSnapshot().matches({ build: { playable: { room: 'deck', player: 'closed' } } }))
  a.send({ type: 'up' })
  assert.ok(a.getSnapshot().matches({ build: { playable: { room: 'overview' } } }))
})

test('the brand sheet goes back to where it was opened from', () => {
  const a = at(screens.find(n => n.path.join('.') === 'scaffold.references'))
  a.send({ type: 'brand', from: 'scaffold' })
  assert.ok(a.getSnapshot().matches('brandSheet'))
  a.send({ type: 'up' })
  assert.ok(a.getSnapshot().matches({ scaffold: 'references' }))
  const b = at(screens.find(n => n.path.join('.') === 'projects.browser'))
  b.send({ type: 'open.project', project: 'pa', version: 'ra1' })
  b.send({ type: 'room.app' })
  b.send({ type: 'brand', from: 'build' })
  b.send({ type: 'up' })
  assert.ok(b.getSnapshot().matches({ build: { playable: { room: 'app' } } }))
})

test('Make has two ways of making, Just make it and the Studio (decision 0020)', () => {
  const make = screens.find(n => n.path.join('.') === 'projects.make')
  assert.deepEqual([...make.transitions.keys()].filter(k => k.startsWith('way.')).sort(), ['way.just', 'way.studio'])
  const a = at(make)
  a.send({ type: 'way.just', run: 'r1' })
  assert.ok(a.getSnapshot().matches({ build: { playable: { room: 'deck' } } }))
  const b = at(make)
  b.send({ type: 'way.studio', project: 'p1' })
  assert.ok(b.getSnapshot().matches('scaffold'))
})

test('+ Create sends each lens where SITEMAP §5 says', () => {
  const where = lens => { const a = at(screens.find(n => n.path.join('.') === 'create.idea')); a.send({ type: 'make', lens }); return a.getSnapshot() }
  assert.ok(where('just').matches({ create: 'progress' }))
  assert.ok(where('design').matches({ build: { playable: { room: 'deck' } } }))
  assert.ok(where('develop').matches({ build: { playable: { room: 'app' } } }))
  assert.ok(where('game').matches({ create: 'planQuestions' }))
  assert.ok(where('launch').matches({ build: 'launch' }))
  assert.ok(where('mix').matches({ build: { playable: { room: 'deck' } } }))
})
