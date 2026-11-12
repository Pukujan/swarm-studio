// Idea -> plan shape (issue: "i just asked for rts game but i think the agents made something else").
// Each idea must land on the plan shape of its genre family, with nothing that contradicts an answer,
// its size word honoured, its title taken from the idea and its engine said in the plan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFromAnswers, planPrice, roster, card, is3d, replan } from '../engine/plan.mjs'
import { spriteJobs, viewJob, gameBrief } from '../engine/planart.mjs'
import { familyOf, sizeOf, titleFrom, engineFrom, planSummary, conflicts, readShape } from '../engine/planshape.mjs'
import { planRoutes } from '../server/plans.mjs'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const values = plan => plan.cards.flatMap(c => Object.entries(c.body).flatMap(([k, v]) => k === 'roster' ? v.flatMap(r => Object.values(r)) : [].concat(v))).map(String).join(' | ')
const ids = plan => plan.cards.map(c => c.id)
const GUNS = /pistol|rifle|shotgun|railgun|\bsmg\b|\bguns?\b|launcher/i
const ACTION_RPG = /\bults?\b|cut-ins?|aura|wings|pet companion|over the shoulder|telegraphed|asura/i

// the owner's plan p-3fa117afac, as asked
const ANTS = {
  idea: 'a tiny game called army of ants , rts game in godots',
  answers: { genre: 'rts base building, army building', cast: 'Monsters and mechs', size: '6', combat: 'no shooting', enemies: 'Endless waves', progression: 'Gear and upgrades', money: 'Free + cosmetics', look: 'Anime cel-shaded' }
}

test('ants RTS: an RTS plan, not an action RPG', () => {
  const p = planFromAnswers(ANTS, { godot: true })
  assert.equal(p.title, 'Army of Ants')
  assert.equal(p.shape.family, 'rts')
  for (const id of ['cast', 'buildings', 'resources', 'world', 'controls', 'enemies', 'hud']) assert.ok(ids(p).includes(id), `has ${id}`)
  assert.equal(card(p, 'cast').name, 'Units')
  const ctl = card(p, 'controls').body
  assert.match(ctl.camera, /top-down|isometric/i)
  assert.match(ctl.fog, /fog/i)
  assert.match(ctl.selection, /select/i)
  assert.match(ctl.orders, /move/i)
  assert.match(card(p, 'enemies').body.waves, /wave/i)
  const units = roster(p)
  assert.ok(units.every(u => /ant|queen/i.test(u.name)), units.map(u => u.name).join(', '))
  for (const role of ['worker', 'soldier', 'scout', 'queen']) assert.ok(units.some(u => new RegExp(role, 'i').test(`${u.name} ${u.role}`)), `a ${role}`)
  assert.doesNotMatch(values(p), GUNS, 'no guns with "no shooting"')
  assert.doesNotMatch(values(p), ACTION_RPG)
  assert.equal(p.systems.gacha, false)
  assert.equal(p.systems.loadout, false)
  assert.deepEqual(conflicts(p), [])
})

test('ants RTS: tiny means a small shape and a small price', () => {
  const p = planFromAnswers(ANTS, { godot: true })
  assert.equal(p.shape.size, 'tiny')
  assert.ok(roster(p).length <= 4)
  assert.equal(is3d(p), false, 'sprites, not rigged 3D characters')
  const price = planPrice(p)
  assert.equal(price.credits, 0)
  assert.ok(price.images <= 20, `${price.images} pictures`)
  assert.equal(price.pics.turnarounds || 0, 0)
  assert.equal(price.pics.closeups || 0, 0)
})

test('ants RTS: the engine asked for is in the plan, and missing Godot is said', () => {
  const p = planFromAnswers(ANTS, { godot: true })
  assert.equal(p.engine.target, 'godot')
  assert.match(planSummary(p), /Godot 4/)
  assert.match(gameBrief(p), /Godot 4/)
  const q = planFromAnswers(ANTS, { godot: false })
  assert.equal(q.engine.target, 'godot')
  assert.equal(q.engine.installed, false)
  assert.match(planSummary(q), /Godot is not installed/i)
})

test('ants RTS: the art list follows the plan, on the chroma key, no A-pose', () => {
  const p = planFromAnswers(ANTS, { godot: true })
  const jobs = spriteJobs(p, '/tmp/x')
  const kinds = new Set(jobs.map(j => j.kind))
  for (const k of ['unit', 'building', 'tile', 'resource', 'hud']) assert.ok(kinds.has(k), `art for ${k}`)
  for (const j of jobs) {
    assert.doesNotMatch(j.prompt, /A-pose|grey|gray|white background/i, j.prompt)
    if (j.kind !== 'tile') assert.match(j.prompt, /#FF00FF|#00FF00/, j.prompt)
  }
  assert.ok(jobs.filter(j => j.kind === 'unit').every(j => /ant|queen/i.test(j.prompt)))
})

test('ants RTS: the first picture is shown with the plan in plain words', () => {
  const p = planFromAnswers(ANTS, { godot: true })
  const s = planSummary(p)
  assert.match(s, /Army of Ants/)
  assert.match(s, /real-time strategy|RTS/i)
  assert.match(s, /tiny/i)
  assert.match(s, /top-down|isometric/i)
})

test('a platformer gets moves, levels and a side view', () => {
  const p = planFromAnswers({ idea: 'a platformer about a fox who jumps between floating islands', answers: { genre: 'Platformer', look: 'Pixel art' } })
  assert.equal(p.shape.family, 'platformer')
  assert.match(card(p, 'moves').body.jump, /jump/i)
  assert.match(card(p, 'world').body.camera, /side/i)
  assert.equal(card(p, 'world').name, 'Levels')
  assert.doesNotMatch(values(p), ACTION_RPG)
  assert.equal(p.systems.gacha, false)
})

test('a puzzle has rules and levels, no cast to rig', () => {
  const p = planFromAnswers({ idea: 'a cosy match-3 puzzle game with garden tiles', answers: {} })
  assert.equal(p.shape.family, 'puzzle')
  assert.ok(ids(p).includes('rules'))
  assert.ok(ids(p).includes('pieces'))
  assert.equal(roster(p).length, 0)
  assert.equal(planPrice(p).credits, 0)
  assert.doesNotMatch(values(p), ACTION_RPG)
  assert.doesNotMatch(values(p), /boss/i)
})

test('a card game has a deck, rules and opponents', () => {
  const p = planFromAnswers({ idea: 'a deck-building card game where you duel wizards', answers: {} })
  assert.equal(p.shape.family, 'card')
  for (const id of ['deck', 'rules', 'opponents']) assert.ok(ids(p).includes(id), `has ${id}`)
  assert.doesNotMatch(values(p), ACTION_RPG)
  assert.doesNotMatch(card(p, 'world').body.camera, /third person/i)
})

test('the Rooftop Signal brief: a Godot runner with crouch, slide, crows and a cat', () => {
  const p = planFromAnswers({ idea: 'Rooftop Signal: a rooftop runner in Godot. A courier runs, jumps, crouches and slides across city rooftops at dusk, dodging crows and a stray cat.', answers: { genre: 'Platformer' } })
  assert.equal(p.title, 'Rooftop Signal')
  assert.equal(p.shape.family, 'platformer')
  assert.equal(p.engine.target, 'godot')
  const moves = card(p, 'moves').body
  assert.match(moves.crouch, /crouch/i)
  assert.match(moves.slide, /slide/i)
  const foes = String(card(p, 'enemies').body.list)
  assert.match(foes, /crow/i)
  assert.match(foes, /cat/i)
  assert.match(card(p, 'world').body.camera, /side/i)
})

test('an action RPG still gets the action RPG shape', () => {
  const p = planFromAnswers({ idea: 'ARES, a girls-only action RPG in the war god\'s arena', answers: { cast: 'Girls only', size: '6' } })
  assert.equal(p.shape.family, 'action')
  assert.ok(ids(p).includes('combat'))
  assert.equal(roster(p).length, 6)
  assert.equal(is3d(p), true)
  // humanoids still get the A-pose turnaround, now on the chroma key
  const j = viewJob(p, '/tmp/x', roster(p)[0], 'front')
  assert.match(j.prompt, /A-pose/)
  assert.match(j.prompt, /#FF00FF|#00FF00/)
  assert.doesNotMatch(j.prompt, /grey|gray/i)
})

test('"no shooting" never keeps a gun, in any family', () => {
  const p = planFromAnswers({ idea: 'ARES, a hero brawler', answers: { combat: 'no shooting' } })
  assert.doesNotMatch(values(p), GUNS)
  assert.deepEqual(conflicts(p), [])
})

test('helpers: family, size, title, engine', () => {
  assert.equal(familyOf('rts base building'), 'rts')
  assert.equal(familyOf('a farming sim where you run a bakery'), 'sim')
  assert.equal(familyOf('a kart racing game'), 'racing')
  assert.equal(familyOf('a visual novel about a lighthouse'), 'narrative')
  assert.equal(sizeOf('a tiny game'), 'tiny')
  assert.equal(sizeOf('a small jam game'), 'small')
  assert.equal(sizeOf('an action RPG'), 'normal')
  assert.equal(titleFrom('a tiny game called army of ants , rts game in godots'), 'Army of Ants')
  assert.equal(titleFrom('a game named "Moth Lamp" about light'), 'Moth Lamp')
  assert.equal(titleFrom('ARES, a girls-only action RPG'), 'ARES')
  assert.equal(titleFrom('a deck-building card game'), '')
  assert.equal(engineFrom('rts game in godots').target, 'godot')
  assert.equal(engineFrom('made in Unity').target, 'unity')
  assert.equal(engineFrom('a web game').target, 'web')
})

test('re-planning in place keeps the id and drops the wrong pictures', () => {
  // an old plan, made before the fix: the action RPG blueprint
  const old = { id: 'p-abcdef1234', created: 'x', from: null, ...planFromAnswers(ANTS) }
  old.shape = undefined
  old.cards = planFromAnswers({ idea: 'x', answers: {} }).cards
  old.sheets = [{ id: 's-1', kind: 'cast', state: 'done', file: 's-1.png' }]
  old.gate = { locked: true, phase: 'first' }
  old.build = { characters: [{ name: 'Hero 1', front: { state: 'done' } }], props: [], animations: null }
  const p = replan(old, { note: 'it should be ants, an RTS' }, { godot: true })
  assert.equal(p.id, 'p-abcdef1234')
  assert.equal(p.shape.family, 'rts')
  assert.equal(p.title, 'Army of Ants')
  assert.deepEqual(p.sheets, [])
  assert.equal(p.gate.locked, false)
  assert.deepEqual(p.build.characters, [])
  assert.equal(p.replanned.note, 'it should be ants, an RTS')
})

test('the planner model reads the idea; an explicit answer still wins', () => {
  const hint = readShape('Sure: {"family":"rts","title":"Leafcutters","size":"small","subject":"ant","cast":[{"name":"Leafcutter","role":"Worker","look":"carries leaves"},{"name":"Major","role":"Soldier","look":"big jaws, twin pistols"}],"lists":{"buildings":["Leaf nest","Fungus farm"],"bogus":["x"]}}')
  assert.equal(hint.family, 'rts')
  assert.deepEqual(Object.keys(hint.lists), ['buildings'])
  const p = planFromAnswers({ idea: 'a game about leafcutter ants farming fungus', answers: { combat: 'no shooting' } }, {}, hint)
  assert.equal(p.shape.family, 'rts')
  assert.equal(p.title, 'Leafcutters')
  assert.deepEqual(roster(p).map(r => r.name), ['Leafcutter', 'Major'])
  assert.match(card(p, 'buildings').body.list, /Leaf nest/)
  assert.doesNotMatch(values(p), GUNS, 'the model\'s pistols are dropped: the answer was "no shooting"')
  // the genre answer beats the model
  const q = planFromAnswers({ idea: 'a game about leafcutter ants', answers: { genre: 'Platformer' } }, {}, hint)
  assert.equal(q.shape.family, 'platformer')
  assert.equal(readShape('no json here'), null)
})

test('routes: a 2D plan builds its first sprite on the key, then re-plans in place in one step', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'planshape-'))
  const painted = []
  const paint = async job => { painted.push(job); const f = join(dir, `o-${painted.length}.png`); writeFileSync(f, 'png'); return { ok: true, path: f } }
  paint.ready = async () => true
  const handle = planRoutes({ dataDir: dir, paint, make: { key: () => '', character: async () => { throw new Error('no Meshy for 2D') } }, godot: () => false })
  const srv = createServer((req, res) => { if (!handle(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const post = (path, body) => fetch(base + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(async r => ({ status: r.status, data: await r.json() }))
  const get = id => fetch(`${base}/api/plans/${id}`).then(r => r.json())
  try {
    const { data: plan } = await post('/api/plans', ANTS)
    assert.equal(plan.title, 'Army of Ants')
    assert.equal(plan.engine.installed, false)
    assert.match(plan.summary, /Godot is not installed/)
    assert.equal(plan.price.first.credits, 0)
    assert.equal((await post(`/api/plans/${plan.id}/lock`, { credits: 0, testFirst: true })).status, 200)
    await post(`/api/plans/${plan.id}/build`)
    let p
    for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 20)); p = await get(plan.id); if (p.build.state === 'idle') break }
    assert.equal(painted.length, 1, 'one cheap picture first')
    assert.match(painted[0].prompt, /#FF00FF/)
    assert.doesNotMatch(painted[0].prompt, /A-pose|grey/)
    assert.equal(p.first.name, 'Ant worker')
    assert.equal(p.gate.tested, 'Ant worker')
    // "this is not what I asked for": one call, same plan, fresh shape, nothing kept from the old pictures
    const r = await post(`/api/plans/${plan.id}/replan`, { note: 'make the ants bigger, a queen first' })
    assert.equal(r.status, 200)
    assert.equal(r.data.id, plan.id)
    assert.deepEqual(r.data.build.sprites, [])
    assert.equal(r.data.first, null)
    assert.equal(r.data.gate.locked, false)
    assert.equal(r.data.replanned.note, 'make the ants bigger, a queen first')
  } finally { srv.close() }
})
