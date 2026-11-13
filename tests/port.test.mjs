import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TARGETS, portTarget, portPrompt, checkPort } from '../engine/port.mjs'
import { QUESTIONS } from '../engine/game.mjs'

test('the interview asks which engine, and the answer picks a port', () => {
  const q = QUESTIONS.find(q => q.id === 'target')
  assert.ok(q && q.chips.includes('Godot') && q.chips.includes('Unity') && q.chips.includes('Unreal'))
  assert.equal(portTarget({ answers: { target: 'Godot' } }), 'godot')
  assert.equal(portTarget({ target: 'Unreal' }), 'unreal')
  assert.equal(portTarget({ answers: { target: 'Web (plays here)' } }), null)
  assert.equal(portTarget({}), null)
})

test("every port's skill files are in gameskills", () => {
  for (const [k, t] of Object.entries(TARGETS)) for (const s of t.skills) assert.ok(existsSync(join('gameskills', s, 'SKILL.md')), `${k}: ${s}`)
})

test('the port prompt names the folder and carries the engine skills', () => {
  const p = portPrompt({ title: 'Bellwake', enemies: ['wisp'] }, 'godot')
  assert.match(p, /ports\/godot\//)
  assert.match(p, /Bellwake/)
  assert.match(p, /### Skill: godot-gdscript/)
})

test('checkPort says what the engine still needs to open the project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'port-'))
  assert.equal(checkPort(dir, 'unity').ok, false)
  const root = join(dir, 'ports', 'godot')
  mkdirSync(join(root, 'scenes'), { recursive: true })
  writeFileSync(join(root, 'project.godot'), 'config_version=5')
  writeFileSync(join(root, 'scenes', 'main.tscn'), '[gd_scene]')
  let c = checkPort(dir, 'godot')
  assert.deepEqual(c.missing, ['.gd'])
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'scripts', 'hero.gd'), 'extends Node')
  c = checkPort(dir, 'godot')
  assert.equal(c.ok, true)
  assert.equal(c.files, 3)
})

test('a port gets the app 3D models, and its prompt names them', async () => {
  const { copyPortModels } = await import('../engine/port.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'port-models-'))
  mkdirSync(join(dir, 'public', 'models'), { recursive: true })
  writeFileSync(join(dir, 'public', 'models', 'Knight.glb'), 'glTF')
  writeFileSync(join(dir, 'public', 'models', 'notes.txt'), 'x')
  assert.deepEqual(copyPortModels(dir, 'godot'), ['Knight.glb'])
  assert.ok(existsSync(join(dir, 'ports', 'godot', 'assets', 'models', 'Knight.glb')))
  assert.deepEqual(copyPortModels(dir, 'unreal'), [])
  const p = portPrompt({ title: 'Bellwake' }, 'godot', ['Knight.glb'])
  assert.match(p, /ports\/godot\/assets\/models\/ \(Knight\.glb\)/)
  assert.match(p, /res:\/\/assets\/models\/<file>/)
  assert.doesNotMatch(portPrompt({ title: 'Bellwake' }, 'godot'), /assets\/models/)
})

test("Godot's errors are read from its output", async () => {
  const { godotErrors, godotBin } = await import('../engine/port.mjs')
  const out = 'Godot Engine v4.7.2\nSCRIPT ERROR: Parse Error: Identifier "hp" not declared.\n   at: GDScript::reload (res://scripts/hero.gd:12)\nERROR: Failed to load script "res://scripts/hero.gd" with error "Parse error".\nall fine'
  const e = godotErrors(out)
  assert.equal(e.length, 2)
  assert.match(e[0], /hero\.gd:12/)
  assert.deepEqual(godotErrors('Godot Engine v4.7.2\nok'), [])
  assert.equal(godotBin({ PATH: '' }, []), null)
})

test('on a Mac, Godot is found as the app when it is not on PATH', async () => {
  const { godotBin, godotApps } = await import('../engine/port.mjs')
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const home = mkdtempSync(join(tmpdir(), 'godot-app-'))
  const apps = godotApps(home)
  assert.equal(apps[0], join('/Applications', 'Godot.app', 'Contents', 'MacOS', 'Godot'))
  assert.equal(godotBin({ PATH: '' }, apps.slice(1)), null)
  mkdirSync(dirname(apps[1]), { recursive: true })
  writeFileSync(apps[1], '')
  assert.equal(godotBin({ PATH: '' }, apps.slice(1)), apps[1])
  rmSync(home, { recursive: true, force: true })
})
