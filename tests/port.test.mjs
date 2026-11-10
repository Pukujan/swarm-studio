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
