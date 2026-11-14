// The Map window's data (engine/gamemap.mjs, spec 44): a game's build and loop as Mermaid text from what the Studio
// knows, an app's plan with its screens marked, and the guard on a diagram a model wrote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gameMap, appMapView, lastPlayTest, nowScreen, cleanChart, wantsChart, CHART_MAX } from '../engine/gamemap.mjs'
import { planMap } from '../engine/appmap.mjs'
import { stagesFor } from '../engine/game.mjs'
import { talk, talkPrompt } from '../engine/talk.mjs'
import { VENDORED } from '../scripts/vendor.mjs'

const spec = { title: 'Rooftop "Signal"', big: true, loop: 'Run rooftop segments, bash obstacles and drones, calibrate antennas for signal boons', progression: 'Parcels become solder', goal: 'Reach home', places: [{ name: 'Laundry roofs' }, 'Water towers'], stages: [{ name: 'the core loop', what: 'a' }, { name: 'the stages', what: 'b' }, { name: 'the extras', what: 'c' }, { name: 'the ending', what: 'd' }] }
const stages = stagesFor(spec)

test('a game\'s build: the art, each slice of N, the one being built marked and the finished ones ticked', () => {
  const m = gameMap({ spec, stages, done: [0], now: 1, state: 'working', art: { done: 14, total: 20 } })
  const build = m.tabs.find(t => t.id === 'build')
  assert.match(build.text, /^flowchart LR/)
  assert.match(build.text, /art\["Art<br\/>14 of 20 painted"\]/)
  assert.match(build.text, /s1\["✓ Slice 1 of 4<br\/>the core loop"\]/)
  assert.match(build.text, /s2\["Slice 2 of 4<br\/>the stages"\]/, 'the slice being built has no tick')
  assert.match(build.text, /art --> s1 --> s2 --> s3 --> s4/)
  assert.match(build.text, /class s1 done/)
  assert.match(build.text, /class s2 now/)
  assert.doesNotMatch(build.text, /classDef|fill:|#[0-9a-f]{3}/i, 'the text names no colour: the page gives the classes theirs')
  assert.deepEqual(build.nodes.map(n => n.state), ['', 'done', 'now', '', ''])
  assert.equal(m.say, 'Slice 2 of 4, the stages: building. Art 14 of 20.')
  assert.equal(m.kind, 'game')
})

test('a failed play test is a node of its own, marked failed, with its one-line reason', () => {
  const steps = [{ kind: 'test', text: 'play test passed: still playing after 8.0 s' }, { kind: 'write', text: 'src/main.ts' }, { kind: 'test', text: 'play test failed: the hero "fell" through the [roof]\nmore', ok: false }]
  const test1 = lastPlayTest(steps)
  assert.deepEqual(test1, { state: 'failed', reason: 'the hero fell through the roof' })
  // it belongs to the slice whose "stage n of N" step came before it, not to the one being built now
  const said = lastPlayTest([{ kind: 'setup', text: 'stage 2 of 4: the stages' }, steps[2], { kind: 'setup', text: 'stage 3 of 4: the extras' }, { kind: 'write', text: 'src/a.ts' }])
  assert.equal(said.slice, 2)
  assert.match(gameMap({ spec, stages, done: [0, 1], now: 2, state: 'working', test: said }).tabs[0].text, /s2 -\.-> test/)
  assert.match(gameMap({ spec, stages, done: [0, 1], now: 2, state: 'working', test: test1 }).tabs[0].text, /s2 -\.-> test/, 'not said: the last slice finished')
  const m = gameMap({ spec, stages, done: [], now: 1, state: 'working', test: test1 })
  const build = m.tabs[0]
  assert.match(build.text, /test\["Play test failed<br\/>the hero fell through the roof"\]/)
  assert.match(build.text, /s2 -\.-> test/, 'it hangs off the slice that was played')
  assert.match(build.text, /class test failed/)
  assert.equal(build.nodes.at(-1).state, 'failed')
  assert.match(m.say, /Last play test failed: the hero fell through the roof\.$/)
  // one that passed is done, not red; none yet is no node
  assert.match(gameMap({ spec, stages, done: [0, 1], state: 'paused', test: lastPlayTest(steps.slice(0, 1)) }).tabs[0].text, /class s1,s2,test done/)
  assert.equal(lastPlayTest([{ kind: 'test', text: 'checking the game\'s links and play-testing it' }]), null)
  assert.doesNotMatch(gameMap({ spec, stages }).tabs[0].text, /test/)
})

test('a game\'s loop: title, play, pause, win, lose, next stage, ending, and its places in order', () => {
  const loop = gameMap({ spec, stages }).tabs.find(t => t.id === 'loop')
  for (const edge of ['title --> play', 'play --> pause', 'pause --> play', 'play --> win', 'play --> lose', 'lose --> title', 'win --> next', 'next --> play', 'win --> fin']) assert.ok(loop.text.includes(edge), edge)
  assert.match(loop.text, /title\(\["Title<br\/>Rooftop Signal"\]\)/, 'quotes in the person\'s words never reach Mermaid')
  assert.match(loop.text, /p1\["Laundry roofs"\]\n\s+p2\["Water towers"\]\n\s+p1 --> p2/)
  assert.doesNotMatch(loop.text, /^\s*end[\[(]/m, '"end" is Mermaid\'s own word, never a node')
  assert.ok(loop.nodes.some(n => n.name === 'Stage: Water towers'))
})

test('a mini game is one step; a build that is stopped, paused or done says so in its line', () => {
  const mini = gameMap({ spec: { title: 'Pong' }, stages: [], state: 'done' })
  assert.match(mini.tabs[0].text, /s1\["✓ Build the game"\]/)
  assert.equal(mini.say, 'The game is built.')
  assert.equal(gameMap({ spec, stages, done: [0, 1], state: 'paused' }).say, '2 of 4 slices built; your turn.')
  assert.equal(gameMap({ spec, stages, done: [0, 1], state: 'stopped' }).say, '2 of 4 slices built; the build is stopped.')
  assert.equal(gameMap({ spec, stages, done: [0, 1, 2, 3], state: 'done' }).say, 'All 4 slices are built.')
  assert.equal(gameMap({ spec, stages, state: 'working', art: { done: 2, total: 9 } }).tabs[0].nodes[0].state, 'now', 'while only the art is painted, the art is the step being built')
  // the same facts give the same version; a change gives another
  assert.equal(gameMap({ spec, stages, done: [0] }).version, gameMap({ spec, stages, done: [0] }).version)
  assert.notEqual(gameMap({ spec, stages, done: [0] }).version, gameMap({ spec, stages, done: [0, 1] }).version)
})

test('an app\'s map is the plan\'s own Mermaid text, with the screen being written and the ones checked marked', () => {
  const m = planMap({ screens: [{ name: 'Home', path: '/' }, { name: 'Events', path: '/events' }, { name: 'Tickets', path: '/tickets' }], flow: ['Home → Events', 'Events → Tickets'], data: [{ name: 'Event', fields: ['title'] }] })
  assert.equal(nowScreen(m.screens, 'src/pages/Events.tsx'), 's_events')
  assert.equal(nowScreen(m.screens, 'src/x.ts'), null)
  const v = appMapView(m, { now: 's_events', done: ['s_home'], state: 'working' })
  assert.deepEqual(v.tabs.map(t => t.name), ['Screens', 'Data'])
  assert.ok(v.tabs[0].text.startsWith(m.flow))
  assert.match(v.tabs[0].text, /class s_home done\n\s+class s_events now/)
  assert.equal(v.tabs[1].text, m.er)
  assert.equal(v.say, 'Building Events (/events). 1 of 3 screens checked.')
  assert.equal(appMapView(planMap({ screens: [{ name: 'Home' }] })).tabs.length, 1, 'no data, no Data tab')
})

test('a diagram a model wrote is cut to what Mermaid may be given, or refused', () => {
  assert.deepEqual(cleanChart('stateDiagram-v2\n  [*] --> Patrol\n  Patrol --> Chase: sees the hero'), { ok: true, text: 'stateDiagram-v2\n  [*] --> Patrol\n  Patrol --> Chase: sees the hero' })
  // a fence, a directive that would loosen Mermaid, front matter, comments and click lines are taken out
  const dirty = 'Here it is:\n```mermaid\n---\nconfig:\n  securityLevel: loose\n---\n%%{init: {"securityLevel": "loose"}}%%\nflowchart TD\n  %% a comment\n  a["Start"] --> b["Play"]\n  click a href "javascript:alert(1)"\n  click b call hack()\n```\nDone.'
  assert.deepEqual(cleanChart(dirty), { ok: true, text: 'flowchart TD\n  a["Start"] --> b["Play"]' })
  assert.equal(cleanChart('flowchart TD\n a["x"] --> b["javascript:alert(1)"]').text, 'flowchart TD')
  for (const bad of ['', '   ', null, 42, 'Here is how the enemy thinks: it patrols.', '<script>alert(1)</script>', '<svg onload=alert(1)>', '%%{init: {}}%%', `flowchart TD\n${'a --> b\n'.repeat(250)}`, `flowchart TD\n a["${'x'.repeat(CHART_MAX)}"]`]) assert.equal(cleanChart(bad).ok, false, String(bad).slice(0, 40))
  assert.ok(wantsChart('show the enemy AI as a state chart') && wantsChart('as mermaid') && !wantsChart('what are you working on?'))
})

test('Talk knows the Map window: it is told diagrams are drawn there, and a "chart" in its answer comes back', async () => {
  const prompt = talkPrompt({})
  assert.match(prompt, /Map window that draws Mermaid diagrams/)
  assert.match(prompt, /Never say a diagram cannot be shown, never ask them to confirm first/)
  assert.match(prompt, /"chart":/)
  const chat = async () => JSON.stringify({ say: 'The enemy patrols, then chases.', chart: 'stateDiagram-v2\n  [*] --> Patrol' })
  const r = await talk({ chat, appDir: '/nonexistent', text: 'show me the enemy AI as a state chart' })
  assert.equal(r.chart, 'stateDiagram-v2\n  [*] --> Patrol')
  assert.equal(r.media, null, 'a diagram is the thing shown: no clip is put under it for "show me"')
  assert.equal((await talk({ chat: async () => '{"say":"Slice 2."}', appDir: '/nonexistent', text: 'where are we?' })).chart, undefined)
})

test('one Mermaid for both UIs: the vendored copy is the version and tarball the next UI pins', () => {
  const lib = VENDORED.find(v => v.name === 'mermaid')
  const json = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
  assert.equal(lib.version, json('ui/package.json').devDependencies.mermaid)
  assert.equal(lib.integrity, json('ui/package-lock.json').packages['node_modules/mermaid'].integrity)
  const source = json('web/vendor/mermaid/SOURCE.json')
  assert.equal(source.version, lib.version)
  assert.equal(source.integrity, lib.integrity)
})
