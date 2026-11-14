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

test('the strategy starter assembles into a Godot project with its add-on, and never over the crew\'s files', async () => {
  const { assembleStarter, crewBrief } = await import('../engine/starters.mjs')
  const { existsSync, writeFileSync } = await import('node:fs')
  const dest = mkdtempSync(join(tmpdir(), 'starter-'))
  try {
    const written = assembleStarter('strategy-topdown', dest)
    for (const f of ['project.godot', 'scenes/main.tscn', 'scripts/main.gd', 'scripts/bench.gd', 'addons/swarm_rts/swarm.gd', 'addons/swarm_rts/flow_field.gd', 'addons/swarm_rts/addon.json'])
      assert.ok(written.includes(f), f)
    writeFileSync(join(dest, 'scripts/main.gd'), '# theirs\n')
    assert.ok(!assembleStarter('strategy-topdown', dest).includes('scripts/main.gd'))
    assert.equal(readFileSync(join(dest, 'scripts/main.gd'), 'utf8'), '# theirs\n')
    assert.ok(!existsSync(join(dest, 'CREW.md')), 'the brief is for the crew, not the game')
    assert.match(crewBrief('strategy-topdown'), /never a node/)
  } finally { rmSync(dest, { recursive: true, force: true }) }
})

test('every add-on a starter carries is what its addon.json says, and small', async () => {
  const { ADDONS_DIR, checkAddon } = await import('../engine/starters.mjs')
  for (const s of starters()) for (const a of s.addons || []) assert.deepEqual(checkAddon(join(ADDONS_DIR, a)), { ok: true, problems: [] }, a)
})

test('a pinned add-on is held to its version, url and checksum', async () => {
  const { checkAddon, addonSum } = await import('../engine/starters.mjs')
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const dir = mkdtempSync(join(tmpdir(), 'pinned-'))
  try {
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'plugin.cfg'), '[plugin]\nname="X"\n')
    writeFileSync(join(dir, 'src/x.gd'), 'extends Node\n')
    const meta = { name: 'X', version: '2.1.0', source: 'pinned', licence: 'MIT', credits: 'Someone', url: 'https://example.org/x', web: true, native: false, files: ['plugin.cfg', 'src/x.gd'] }
    writeFileSync(join(dir, 'addon.json'), JSON.stringify({ ...meta, sha256: addonSum(dir) }))
    assert.equal(checkAddon(dir).ok, true)
    writeFileSync(join(dir, 'src/x.gd'), 'extends Node # changed\n')
    assert.match(checkAddon(dir).problems.join(), /sha256 does not match/)
    writeFileSync(join(dir, 'addon.json'), JSON.stringify({ ...meta, version: 'latest', url: 'http://x', sha256: addonSum(dir) }))
    assert.match(checkAddon(dir).problems.join(), /https url.*exact version|exact version/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('an add-on the person brings is copied into the project with where it came from; native ones leave the Web', async () => {
  const { bringAddon, checkAddon } = await import('../engine/starters.mjs')
  const { writeFileSync, mkdirSync, existsSync } = await import('node:fs')
  const tmp = mkdtempSync(join(tmpdir(), 'brought-'))
  try {
    const plain = join(tmp, 'Dialogue Box'), native = join(tmp, 'fast_noise'), proj = join(tmp, 'proj')
    mkdirSync(plain); mkdirSync(join(native, 'bin'), { recursive: true })
    writeFileSync(join(plain, 'plugin.cfg'), '[plugin]\n'); writeFileSync(join(plain, 'box.gd'), 'extends Control\n')
    writeFileSync(join(native, 'noise.gdextension'), '[configuration]\n'); writeFileSync(join(native, 'bin/noise.dll'), 'MZ')
    const a = bringAddon(plain, proj, { licence: 'MIT', credits: 'Ana' })
    assert.equal(a.id, 'dialogue_box')
    assert.equal(a.source, 'brought')
    assert.equal(a.web, true)
    assert.ok(existsSync(join(proj, 'addons/dialogue_box/box.gd')))
    assert.equal(checkAddon(join(proj, 'addons/dialogue_box')).ok, true)
    const n = bringAddon(native, proj)
    assert.equal(n.native, true)
    assert.equal(n.web, false, 'the Web preview cannot run it: Open in Godot')
    assert.equal(checkAddon(join(proj, 'addons/fast_noise')).ok, true)
    writeFileSync(join(tmp, 'notes.txt'), 'x')
    assert.throws(() => bringAddon(join(tmp, 'notes.txt'), proj), /a folder/)
    mkdirSync(join(tmp, 'pics')); writeFileSync(join(tmp, 'pics/a.png'), 'x')
    assert.throws(() => bringAddon(join(tmp, 'pics'), proj), /not a Godot add-on/)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test('a platformer gets the side-view starter, with its jump feel built in', async () => {
  const { assembleStarter } = await import('../engine/starters.mjs')
  const plan = planFromAnswers({ idea: 'a platformer about a fox', answers: {}, force: { family: 'platformer', size: 'tiny', art: '2d', engine: 'godot' } })
  assert.equal(plan.starter.template.value, 'platformer-side')
  assert.deepEqual(starterSpec(plan).systems, ['jump', 'corners', 'platforms', 'camera'])
  const dest = mkdtempSync(join(tmpdir(), 'plat-'))
  try {
    const w = assembleStarter('platformer-side', dest)
    for (const f of ['scripts/feel_test.gd', 'scripts/level.gd', 'addons/feel_platform/platformer_body.gd']) assert.ok(w.includes(f), f)
  } finally { rmSync(dest, { recursive: true, force: true }) }
})

test('a Godot build seeds the locked starter first and tells the crew to build on it', async () => {
  const { seedGodot, godotStagePrompt } = await import('../engine/godotfirst.mjs')
  const { existsSync } = await import('node:fs')
  const dir = mkdtempSync(join(tmpdir(), 'seed-'))
  const spec = { title: 'Army of Ants', loop: 'command ants', starter: { engine: 'godot', template: { id: 'strategy-topdown', version: '1.0.0' }, assets: 'placeholder', systems: ['pool', 'flowfield', 'select', 'camera'], addons: [] } }
  try {
    seedGodot(dir, spec)
    assert.ok(existsSync(join(dir, 'ports/godot/addons/swarm_rts/swarm.gd')))
    assert.match(readFileSync(join(dir, 'ports/godot/project.godot'), 'utf8'), /res:\/\/scenes\/main\.tscn/)
    assert.match(godotStagePrompt(spec, 0), /build on it, never around it/)
    assert.doesNotMatch(godotStagePrompt({ ...spec, starter: null }, 0), /never around it/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
