// The Map window's pure rules (web/canvas/mapask.js): the typed requests that open it, the ones that ask for a
// diagram of their own, the wall's window that gives up its place, the diagram's colours and its text alternative.
// And the page's side of the untrusted-diagram guard (web/canvas/mapwin.js), read from its source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapAsk, mapNone, mapYields, chartFits, MAP_TEXT_MAX, mapLook, mapList, chartWords } from '../web/canvas/mapask.js'
import { stageOffers, stageNow, stageAuto, stageAsk, stageNone } from '../web/canvas/stage.js'
import { CHART_MAX } from '../engine/gamemap.mjs'

test('typed requests for the standing map open it at once', () => {
  for (const t of ['show the map', 'Show me the map please', 'map', 'open the map', 'show the diagrams', 'show me the mermaid charts',
    'can you show me how the game will run as mermaid charts?', 'show me how the game will run', 'show how the app works as a diagram',
    'draw this as a chart', 'draw this as a diagram', 'show it as mermaid', 'show the game as a flowchart', 'show me a diagram of how the game runs',
    'show me the loop as a diagram', "what's going on?", 'whats going on', 'What is happening with the build?', 'Hermia, what’s going on?']) assert.equal(mapAsk(t), 'map', t)
})

test('a diagram of one thing is the planner\'s to write', () => {
  for (const t of ['show the enemy AI as a state chart', 'show me the save system as a diagram', 'draw a sequence diagram of the login', 'diagram of the boss fight',
    'show me a chart of the enemy waves', 'mermaid chart of the inventory', 'explain the combat as a flowchart', 'could you draw the shop flow as a mermaid diagram?']) assert.equal(mapAsk(t), 'chart', t)
})

test('a change for the builder stays one: a map or a chart inside the app is not the Map window', () => {
  for (const t of ['show a map of nearby stores', 'add a map page', 'show sales as a chart', 'show a chart of sales on the dashboard', 'add a chart of sales', 'make the map bigger',
    'show the app a dark theme', 'show the art', 'show the crew', 'what is going on with the hero sprite', 'draw the hero bigger', 'the map screen crashes', 'put a diagram on the about page', '', '   ', 'x'.repeat(400)]) assert.equal(mapAsk(t), null, t)
})

test('the stage: Map is offered when there is one, pinned like the others, and never taken by itself', () => {
  const done = { working: false, state: 'done', kind: 'game', hasApp: true, url: 'http://localhost:5173/', painted: 4, steps: 90 }
  assert.deepEqual(stageOffers(done), ['art', 'live'], 'no map read: the switch is as it was')
  assert.deepEqual(stageOffers({ ...done, hasMap: true }), ['art', 'live', 'map'])
  assert.equal(stageAuto({ ...done, hasMap: true }), 'live')
  assert.equal(stageAuto({ working: true, state: 'working', kind: 'game', hasMap: true }), 'crew', 'while it builds the Map is a window of the wall')
  const pinned = stageNow({ ...done, hasMap: true }, 'map')
  assert.equal(pinned.shown, 'map')
  assert.equal(pinned.empty, false, 'the live game stays under it')
  assert.equal(stageNow({ ...done, hasMap: false }, 'map').pin, null, 'with no map the pin lets go')
  // nothing running, nothing built: the Map alone, over the room's card
  const idle = stageNow({ state: 'stopped', kind: 'game', hasMap: true, steps: 3 }, 'map')
  assert.deepEqual([idle.shown, idle.empty, idle.sheet], ['map', true, false])
  assert.equal(stageAsk('show the map'), 'map')
  assert.equal(stageNone('map', { kind: 'game' }), 'There is no plan to draw for this game yet.')
  assert.equal(mapNone('site'), 'There is no plan to draw for this app yet.')
})

test('the Map takes the wall\'s first window and the third of the older four gives up its place', () => {
  assert.equal(mapYields(true), 2)
  assert.equal(mapYields(false), -1, 'no plan to draw: the wall keeps its four')
})

test('the diagram takes the Studio\'s tokens: graphite, one accent, red only for what failed', () => {
  const dark = { '--text': ' #f4f4f5', '--void': '#0b0b0c', '--deep': '#161618', '--frame': '#3a3a3f', '--muted': '#8e8e93', '--hot': '#F20000', '--hot-text': '#ff5c5c' }
  const look = mapLook(n => dark[n])
  assert.equal(look.vars.primaryTextColor, '#f4f4f5')
  assert.equal(look.vars.background, '#0b0b0c')
  assert.deepEqual(look.defs, ['classDef done fill:#0b0b0c,stroke:#3a3a3f,color:#8e8e93', 'classDef now fill:#f4f4f5,stroke:#f4f4f5,color:#0b0b0c,stroke-width:2px', 'classDef failed fill:#0b0b0c,stroke:#F20000,color:#ff5c5c,stroke-width:2px'])
  const used = new Set(JSON.stringify(look).match(/#[0-9a-fA-F]{6}/g))
  assert.deepEqual([...used].sort(), Object.values(dark).map(v => v.trim()).sort(), 'no colour of its own')
  assert.notEqual(mapLook(n => ({ ...dark, '--text': '#0b0b0c', '--void': '#ffffff' })[n]).key, look.key, 'a theme change is a new look')
  assert.ok(mapLook(() => '').vars.primaryTextColor, 'tokens not read yet: the dark defaults')
})

test('a diagram has a text alternative: its nodes as a list', () => {
  assert.deepEqual(mapList([{ name: 'Slice 1 of 4: the core loop', state: 'done' }, { name: 'Slice 2 of 4: the stages', state: 'now' }, { name: 'Play test failed: fell', state: 'failed' }, { name: 'Slice 3 of 4: the extras', state: '' }]),
    ['Slice 1 of 4: the core loop, done', 'Slice 2 of 4: the stages, being built', 'Play test failed: fell, failed', 'Slice 3 of 4: the extras'])
  assert.deepEqual(chartWords('stateDiagram-v2\n  [*] --> Patrol\n  Patrol --> Chase: sees the hero\n  a["Start<br/>here"] --> b(Play)\n  b --> a["Start<br/>here"]'), ['Patrol', 'Chase', 'sees the hero', 'Start here', 'Play'])
  assert.deepEqual(chartWords(''), [])
})

test('the page treats an asked diagram as untrusted: a size cap, strict Mermaid, parsed first, a plain line on failure', () => {
  assert.ok(chartFits('flowchart TD\n a --> b'))
  for (const bad of ['', '  ', null, undefined, 7, {}, 'x'.repeat(MAP_TEXT_MAX + 1)]) assert.equal(chartFits(bad), false)
  assert.ok(CHART_MAX < MAP_TEXT_MAX, 'what the server lets through fits')
  const src = readFileSync(new URL('../web/canvas/mapwin.js', import.meta.url), 'utf8')
  assert.match(src, /securityLevel: 'strict'/)
  assert.doesNotMatch(src, /securityLevel: '(loose|antiscript|sandbox)'/)
  assert.match(src, /suppressErrorRendering: true/)
  assert.match(src, /m\.parse\(text, \{ suppressErrors: true \}\)/)
  assert.match(src, /chartFits\(tab\.text\)/)
  assert.ok(src.includes("plain('Could not draw that.')"))
  // Mermaid's SVG goes in as nodes, cleaned; a diagram's text never becomes HTML
  assert.match(src, /new DOMParser\(\)\.parseFromString\(svg, 'text\/html'\)/)
  assert.match(src, /name\.startsWith\('on'\)/)
  for (const line of src.split('\n').filter(l => /innerHTML\s*=/.test(l))) assert.doesNotMatch(line, /text|svg|asked|tab\./, line.trim().slice(0, 80))
  // lazily, from the plugin's own server: one script, made only inside load()
  assert.equal(src.match(/createElement\('script'\)/g).length, 1)
  assert.doesNotMatch(src, /https?:\/\//)
  const rooms = readFileSync(new URL('../web/canvas/rooms.js', import.meta.url), 'utf8')
  assert.ok(rooms.includes('src: `${BASE}/vendor/mermaid/mermaid.min.js`'))
})
