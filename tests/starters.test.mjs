// Game starters (docs/specs/38-game-starters.md): the plan suggests an engine, a genre template and the art
// to begin with, each with why; the person keeps or removes them; the locked spec records them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { starters, starterById, suggestStarter, starterSpec, PAINT } from '../engine/starters.mjs'
import { planFromAnswers, planView, editStarter, replan, lockPlan } from '../engine/plan.mjs'
import { planRoutes } from '../server/plans.mjs'

const ANTS = 'a tiny game called army of ants , rts game in godots'
const ants = (engine = 'godot') => planFromAnswers({ idea: ANTS, answers: {}, force: { family: 'rts', size: 'tiny', art: '2d', engine } })

test('the shipped starters read, and the strategy starter has the systems an RTS needs', () => {
  const s = starterById('strategy-topdown')
  assert.ok(s, 'starters/strategy-topdown/starter.json')
  assert.ok(starters().every(x => x.id && x.name && x.engines?.length && x.systems?.length))
  assert.deepEqual(s.systems.filter(x => x.required).map(x => x.id), ['pool', 'flowfield', 'select'])
  assert.ok(s.systems.every(x => x.why))
})

test('the ant RTS in Godot starts from the strategy template, placeholder units, every system on', () => {
  const p = ants()
  assert.deepEqual([p.starter.engine.value, p.starter.template.value, p.starter.assets.value], ['godot', 'strategy-topdown', 'placeholder'])
  assert.ok(['engine', 'template', 'assets'].every(k => p.starter[k].why && p.starter[k].by === 'planner'))
  assert.deepEqual(Object.entries(p.starter.systems).filter(([, v]) => v.on).map(([k]) => k), ['pool', 'flowfield', 'select', 'camera', 'fog'])
  const v = planView(p).starterView
  assert.equal(v.template.name, 'Top-down strategy')
  assert.equal(v.systems.length, 5)
  assert.deepEqual(v.assets.options.map(o => o.id), ['placeholder', PAINT.id])
})

test('a template made for another engine is not used; the reason says so', () => {
  const p = ants('web')
  assert.equal(p.starter.template.value, null)
  assert.match(p.starter.template.why, /made for Godot 4 only/)
  assert.equal(p.starter.assets.value, PAINT.id)
  const action = planFromAnswers({ idea: 'a stylish anime action game', answers: {} })
  assert.match(action.starter.template.why, /no starter for this kind of game yet/)
})

test('the person keeps or removes: a required system stays, an optional one goes, choices survive a re-plan', () => {
  const p = ants()
  assert.throws(() => editStarter(p, { system: 'pool', on: false }), /part of this starter/)
  editStarter(p, { system: 'fog', on: false })
  assert.deepEqual(p.starter.systems.fog, { on: false, by: 'person' })
  editStarter(p, { key: 'assets', value: 'paint' })
  replan(p, { note: 'bigger map' })
  assert.deepEqual(p.starter.systems.fog, { on: false, by: 'person' })
  assert.equal(p.starter.assets.value, 'paint')
  assert.equal(p.starter.assets.by, 'person')
  // no template: an empty project and painted art
  editStarter(p, { key: 'template', value: null })
  assert.equal(p.starter.template.value, null)
  assert.deepEqual(p.starter.systems, {})
  assert.throws(() => editStarter(p, { key: 'assets', value: 'nope' }), /no such asset pack/)
})

test('the engine is the build target too, and a template that does not fit it is dropped', () => {
  const p = ants()
  editStarter(p, { key: 'engine', value: 'web' })
  assert.equal(p.shape.engine.target, 'web')
  assert.equal(p.decided.engine, 'web')
  assert.equal(p.starter.template.value, null)
  assert.throws(() => editStarter(p, { key: 'template', value: 'strategy-topdown' }), /made for Godot 4/)
  editStarter(p, { key: 'engine', value: 'godot' })
  editStarter(p, { key: 'template', value: 'strategy-topdown' })
  assert.equal(p.starter.template.by, 'person')
})

test('changing a starter choice reopens a locked plan; the lock records the starter', () => {
  const p = ants()
  lockPlan(p, { credits: 0 })
  assert.deepEqual(p.gate.starter, starterSpec(p))
  assert.deepEqual(p.gate.starter.systems, ['pool', 'flowfield', 'select', 'camera', 'fog'])
  assert.deepEqual(p.gate.starter.template, { id: 'strategy-topdown', version: '1.0.0' })
  editStarter(p, { system: 'camera', on: false })
  assert.equal(p.gate.locked, false)
  assert.deepEqual(suggestStarter(p, p.starter).systems.camera, { on: false, by: 'person' })
})

test('POST /api/plans/:id/starter changes one choice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'starter-'))
  const plans = planRoutes({ dataDir: dir, godot: () => true })
  const srv = createServer((req, res) => { if (!plans(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const post = (path, body) => fetch(base + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(async r => ({ status: r.status, data: await r.json() }))
  try {
    const plan = await plans.fromTalk({ idea: ANTS, answers: {}, force: { family: 'rts', size: 'tiny', art: '2d', engine: 'godot' } })
    assert.equal(plan.starterView.template.value, 'strategy-topdown')
    const off = await post(`/api/plans/${plan.id}/starter`, { system: 'fog', on: false })
    assert.equal(off.status, 200)
    assert.equal(off.data.starterView.systems.find(s => s.id === 'fog').on, false)
    assert.equal((await post(`/api/plans/${plan.id}/starter`, { system: 'select', on: false })).status, 409)
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('the board shows the Starter and Systems groups, and the person changes them there', () => {
  const web = readFileSync(new URL('../web/plan.js', import.meta.url), 'utf8')
  assert.match(web, /data-sec="starter"/)
  assert.match(web, /data-sec="systems"/)
  assert.match(web, /act\('starter', \{ system: /)
  assert.match(web, /act\('starter', \{ key: st\.dataset\.st/)
  assert.doesNotMatch(web, /title=/)
})
