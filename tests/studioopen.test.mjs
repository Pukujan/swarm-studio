// The Studio opens again from a built project, as the expanded Overview (web/modes.js, server/studio.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODES, modeOf, studioMode, modesShown } from '../web/modes.js'
import { brandFromLook, loadableFont } from '../engine/sitelook.mjs'
import { sweep, wanderOn } from '../web/canvas/wander.js'

const ctl = (view, extra = {}) => {
  const calls = []
  const C = { nav: { view }, project: view.project || null, calls,
    studio: pid => calls.push(['studio', pid]), brand: o => calls.push(['brand', o.project]),
    open: (run, pid) => { calls.push(['open', run, pid]); return Promise.resolve() }, go: (m, v) => calls.push(['go', m, v]), ...extra }
  return C
}

test('the menu lists Studio and Brand beside the build\'s rooms, and names the room it is in', () => {
  assert.deepEqual(MODES.map(m => m[0]), ['studio', 'overview', 'canvas', 'brand', 'video', 'app', 'game'])
  assert.equal(modeOf('studio'), 'studio'); assert.equal(modeOf('brand'), 'brand'); assert.equal(modeOf('deck'), 'canvas'); assert.equal(modeOf('nope'), 'overview')
})

test('Studio and Brand open from a built project; the build\'s own rooms are left to the menu', () => {
  const C = ctl({ room: 'overview', project: 'p1' })
  assert.equal(studioMode('studio', C), true); assert.deepEqual(C.calls, [['studio', 'p1']])
  const B = ctl({ room: 'overview', project: 'p1' })
  B.scaffoldView = { brand: () => B.calls.push(['sheet']) }
  assert.equal(studioMode('brand', B), true); assert.deepEqual(B.calls, [['studio', 'p1'], ['sheet']])
  assert.equal(studioMode('video', ctl({ room: 'overview', project: 'p1' })), false)
})

test('from the Studio, a room of the build opens the newest version first; with no build nothing happens', async () => {
  const C = ctl({ room: 'studio', project: 'p1' }, { scaffoldView: { head: 'run9', project: 'p1' } })
  assert.equal(studioMode('canvas', C), true)
  await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(C.calls, [['open', 'run9', 'p1'], ['go', 'station', 'canvas']])
  const O = ctl({ room: 'studio', project: 'p1' }, { scaffoldView: { head: 'run9' } })
  studioMode('overview', O); await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(O.calls, [['open', 'run9', 'p1']])
  const N = ctl({ room: 'studio', project: 'p1' }, { scaffoldView: { head: null } })
  assert.equal(studioMode('canvas', N), true); assert.deepEqual(N.calls, [])
})

test('options: the build\'s rooms hide in a Studio with no build; Studio and Brand hide outside a project', () => {
  const opts = () => MODES.map(([mode]) => ({ dataset: { mode }, hidden: false }))
  const a = opts(); modesShown(a, ctl({ room: 'studio', project: 'p1' }, { scaffoldView: { head: null } }))
  assert.deepEqual(a.filter(o => !o.hidden).map(o => o.dataset.mode), ['studio', 'brand'])
  const b = opts(); modesShown(b, ctl({ room: 'overview', project: 'p1' }))
  assert.equal(b.every(o => !o.hidden), true)
  const c = opts(); modesShown(c, ctl({ room: 'deck', project: null }))
  assert.deepEqual(c.filter(o => o.hidden).map(o => o.dataset.mode), ['studio', 'brand'])
})

test('a reference\'s look becomes a brand: its colours, a loadable font for each role, its corners', () => {
  const tokens = { bg: '#0F0F0F', text: '#f2efe8', accent: '#c6f432', radius: '0px', fonts: { display: { name: 'Bricolage Grotesque Variable', kind: 'display sans' }, body: { name: '-apple-system', kind: 'sans' } } }
  const b = brandFromLook(tokens, 'cool-studio.com')
  assert.deepEqual(b.palette, { name: 'From cool-studio.com', bg: '#0f0f0f', text: '#f2efe8', accent: '#c6f432', link: '#c6f432' })
  assert.deepEqual(b.type, { name: 'From cool-studio.com', heading: 'Bricolage Grotesque', body: 'Inter' })
  assert.equal(b.radius, '0px')
  assert.equal(brandFromLook({ ...tokens, radius: 'pill' }).radius, '9999px')
  assert.equal(brandFromLook({ bg: 'red' }), null)
  assert.equal(loadableFont({ name: 'Georgia', kind: 'serif' }), 'Fraunces')
  assert.equal(loadableFont({ name: 'SF Pro Display', kind: 'sans' }), 'Inter')
  assert.equal(loadableFont({ name: 'JetBrains Mono Variable', kind: 'mono' }), 'JetBrains Mono')
})

test('POST …/brand/pick { part: look } makes a sheet with no model, puts the look on top, and keeps the page list', async () => {
  const { brandRoutes } = await import('../server/brand.mjs')
  const http = (await import('node:http')).default
  const recs = { p1: { id: 'p1', brand: null } }
  const projectBrands = { get: id => recs[id] || null, update: async (id, fn) => { fn(recs[id]); return recs[id] } }
  const h = brandRoutes({ chats: { get: () => null }, projectBrands })
  const srv = http.createServer((req, res) => { if (!h(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  try {
    const look = { bg: '#ffffff', text: '#59636e', accent: '#1f883d', radius: '0px', fonts: { display: { name: 'Mona Sans', kind: 'sans' }, body: { name: 'system-ui', kind: 'sans' } } }
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/projects/p1/brand/pick`, { method: 'POST', body: JSON.stringify({ part: 'look', look, host: 'example.com', brief: 'a site about a repo' }) })
    assert.equal(r.status, 200)
    const b = recs.p1.brand
    assert.equal(b.pick.palette, 'plook'); assert.equal(b.pick.type, 'tlook')
    assert.equal(b.palettes[0].bg, '#ffffff'); assert.equal(b.palettes[0].name, 'From example.com')
    assert.deepEqual([b.types[0].heading, b.types[0].body], ['Mona Sans', 'Inter'])
    assert.equal(b.radius, '0px'); assert.deepEqual(b.story.pages, [])
    assert.ok(b.palettes.length > 1, 'the built-in options stay beside it')
    // again: replaced, not stacked
    await fetch(`http://127.0.0.1:${srv.address().port}/api/projects/p1/brand/pick`, { method: 'POST', body: JSON.stringify({ part: 'look', look: { ...look, accent: '#ff0000' }, host: 'example.com' }) })
    assert.equal(recs.p1.brand.palettes.filter(x => x.id === 'plook').length, 1)
    const bad = await fetch(`http://127.0.0.1:${srv.address().port}/api/projects/p1/brand/pick`, { method: 'POST', body: JSON.stringify({ part: 'look', look: {} }) })
    assert.equal(bad.status, 400)
  } finally { srv.close() }
})

test('a game\'s own room is Game: the label, the option list, and picking Game stays put', () => {
  assert.equal(modeOf('app', 'game'), 'game'); assert.equal(modeOf('app', 'site'), 'app'); assert.equal(modeOf('deck', 'game'), 'canvas')
  const C = ctl({ room: 'app', project: 'p1' })
  assert.equal(studioMode('game', C, 'game'), true); assert.deepEqual(C.calls, [], 'already there: no wizard, no move')
  const D = ctl({ room: 'deck', project: 'p1' })
  assert.equal(studioMode('game', D, 'game'), true); assert.deepEqual(D.calls, [['go', 'station', 'app']])
  assert.equal(studioMode('game', ctl({ room: 'app', project: 'p1' }), 'site'), false, 'a site still goes to its game or the wizard')
  const opts = MODES.map(([mode]) => ({ dataset: { mode }, hidden: false }))
  modesShown(opts, ctl({ room: 'app', project: 'p1' }), 'game')
  assert.deepEqual(opts.filter(o => o.hidden).map(o => o.dataset.mode), ['studio', 'brand', 'app'], 'a game is offered no Studio, Brand or App')
})

test('the Studio always has the way back to the build the person came from', async () => {
  const C = ctl({ room: 'overview', project: 'p1', version: 'run7' })
  studioMode('studio', C)
  assert.deepEqual(C.cameFrom, { pid: 'p1', run: 'run7' })
  // in the Studio, before (or without) its record loading: the build's rooms still show, and work
  C.nav.view = { room: 'studio', project: 'p1' }; C.scaffoldView = { head: null }; C.calls.length = 0
  const opts = MODES.map(([mode]) => ({ dataset: { mode }, hidden: false }))
  modesShown(opts, C)
  assert.equal(opts.every(o => !o.hidden), true)
  assert.equal(studioMode('overview', C), true); await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(C.calls, [['open', 'run7', 'p1']])
})

test('a working wall cursor sweeps across its tile and back, inside it, out of step with the others', () => {
  assert.equal(sweep(0), 0); assert.equal(sweep(0.5), 1); assert.equal(sweep(0.25), 0.5); assert.equal(sweep(1.75), 0.5)
  const tile = { left: 100, top: 200, width: 400, height: 300 }
  const at = (i, ms) => wanderOn(tile, i, ms)
  for (const ms of [0, 1500, 4000, 9000, 20000, 61000]) for (const i of [0, 1, 2, 3]) {
    const p = at(i, ms)
    assert.ok(p.x >= 100 + 400 * 0.13 && p.x <= 100 + 400 * 0.81, `x inside at ${ms}`); assert.ok(p.y >= 200 + 300 * 0.29 && p.y <= 200 + 300 * 0.71, `y inside at ${ms}`)
  }
  assert.ok(Math.abs(at(0, 0).x - at(0, 3000).x) > 20, 'it moves')
  assert.ok(Math.abs(at(0, 5000).x - at(1, 5000).x) > 10, 'two cursors are not in step')
})
