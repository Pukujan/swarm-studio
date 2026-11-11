import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { godotFirst, isGodotFirst, seedGodot, syncGodotArt, godotStagePrompt, godotArtBrief, unpersist, WEB_PRESET } from '../engine/godotfirst.mjs'

test('Godot-first only when the spec names Godot and a binary is found', () => {
  const bin = join(mkdtempSync(join(tmpdir(), 'gf-')), 'godot'); writeFileSync(bin, '')
  assert.equal(godotFirst({ target: 'Godot' }, { SWARM_GODOT: bin }), true)
  assert.equal(godotFirst({ answers: { target: 'godot 4' } }, { SWARM_GODOT: bin }), true)
  assert.equal(godotFirst({ target: 'web' }, { SWARM_GODOT: bin }), false)
  assert.equal(godotFirst({ target: 'godot' }, { PATH: '' }), false)
})

test('seedGodot writes the skeleton, the Web preset and copies the art', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gf-'))
  mkdirSync(join(dir, 'public', 'art'), { recursive: true })
  writeFileSync(join(dir, 'public', 'art', 'sprite-hero.png'), 'x')
  writeFileSync(join(dir, 'public', 'art', 'notes.txt'), 'x')
  const copied = seedGodot(dir, { title: 'Rooftop "Signal"' })
  assert.deepEqual(copied, ['sprite-hero.png'])
  const root = join(dir, 'ports', 'godot')
  assert.match(readFileSync(join(root, 'project.godot'), 'utf8'), /config\/name="Rooftop Signal"/)
  assert.ok(existsSync(join(root, 'assets', 'art', 'sprite-hero.png')))
  assert.ok(isGodotFirst(dir))
  assert.match(WEB_PRESET, /variant\/thread_support=false/)
})

test('syncGodotArt keeps a picture the crew changed in the project, and copies new paintings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gf-')), art = join(dir, 'public', 'art'), out = join(dir, 'ports', 'godot', 'assets', 'art')
  mkdirSync(art, { recursive: true })
  writeFileSync(join(art, 'portrait-mika.webp'), 'poster')
  writeFileSync(join(art, 'room-hub.webp'), 'hub')
  assert.deepEqual(syncGodotArt(dir).sort(), ['portrait-mika.webp', 'room-hub.webp'])
  writeFileSync(join(out, 'portrait-mika.webp'), 'face') // the crew cut a face
  writeFileSync(join(art, 'room-hub.webp'), 'hub, painted again')
  writeFileSync(join(art, 'boon-pulse.webp'), 'pulse')
  assert.deepEqual(syncGodotArt(dir).sort(), ['boon-pulse.webp', 'room-hub.webp'])
  assert.equal(readFileSync(join(out, 'portrait-mika.webp'), 'utf8'), 'face')
  assert.equal(readFileSync(join(out, 'room-hub.webp'), 'utf8'), 'hub, painted again')
  assert.deepEqual(syncGodotArt(dir), [])
})

test('stage prompts say Godot 4 and keep work in ports/godot', () => {
  const p0 = godotStagePrompt({ title: 'X' }, 0, { art: [{ file: 'art/sprite-hero.png', what: 'the hero' }] })
  assert.match(p0, /Godot 4/)
  assert.match(p0, /res:\/\/assets\/art\//)
  assert.match(p0, /ports\/godot\//)
  assert.match(p0, /sprite-hero\.png: the hero/)
  const p1 = godotStagePrompt({}, 1, { failed: 'Godot said no' })
  assert.match(p1, /^This is a big 2D game made in Godot 4/)
  const own = godotStagePrompt({ stages: [{ name: 'core run', what: 'run' }, { name: 'relays', what: 'r' }, { name: 'home', what: 'h' }] }, 1)
  assert.match(own, /3 slices.*slice 2: relays/)
  assert.match(p1, /First: Godot said no/)
  const sheet = godotArtBrief([{ file: 'art/sheet-hero-run.webp', what: 'run', kind: 'sheet', cell: [256, 256], count: 6, fps: 12, loop: true, frames: 'a' }])
  assert.match(sheet, /Rect2\(n\*256, 0, 256, 256\)/)
})

test('unpersist turns off IndexedDB paths in the export', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'gf-')), 'index.html')
  writeFileSync(f, 'const GODOT_CONFIG = {"args":[]};')
  unpersist(f)
  assert.match(readFileSync(f, 'utf8'), /GODOT_CONFIG = \{"persistentPaths":\[\],"args"/)
  unpersist(f)
  assert.equal(readFileSync(f, 'utf8').match(/persistentPaths/g).length, 1)
})

test('a Godot slice puts the person\'s words from the last slice first', async () => {
  const { godotStagePrompt } = await import('../engine/godotfirst.mjs')
  const p = godotStagePrompt({ title: 'T', pitch: 'a rooftop runner' }, 1, { note: 'make Mika bigger' })
  assert.match(p, /played the last slice and said: "make Mika bigger"/)
  assert.doesNotMatch(godotStagePrompt({ title: 'T', pitch: 'a rooftop runner' }, 1), /played the last slice/)
})
