// node --test tests/workshop.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanOptions, squareMap, applyPick, workshopStore, shippedArt, workshopSpec, workshopMarkdown, paintPrompt, askFor, STEP_IDS } from '../engine/workshop.mjs'
import { specMarkdown } from '../engine/game.mjs'

test('options are cleaned per step and capped', () => {
  const raw = JSON.stringify({ options: [1, 2, 3, 4, 5].map(i => ({ name: `World ${i}`, setting: 'x'.repeat(500), palette: 'ink, rust', art: 'a city' })) })
  const o = cleanOptions('world', `Sure! ${raw} done`)
  assert.equal(o.length, 4)
  assert.equal(o[0].id, 'world-1')
  assert.ok(o[0].setting.length <= 240)
  assert.equal(cleanOptions('story', 'not json').length, 0)
  const s = cleanOptions('sound', { options: [{ name: 'Rain', bpm: 999, scale: 'weird', wave: 'square', drums: 'driving', line: 'Go.' }] })[0]
  assert.equal(s.bpm, 180)
  assert.equal(s.scale, 'minor')
})

test('a level map is 16 × 32 with one start and one exit', () => {
  const m = squareMap(['S..S', '##X#X', 'short'])
  assert.equal(m.length, 16)
  assert.ok(m.every(r => r.length === 32))
  const all = m.join('')
  assert.equal(all.split('S').length - 1, 1)
  assert.equal(all.split('X').length - 1, 1)
  const empty = squareMap([]).join('')
  assert.ok(empty.includes('S') && empty.includes('X'))
})

test('each pick writes its part of the spec and moves on', () => {
  const store = workshopStore(mkdtempSync(join(tmpdir(), 'ws-')))
  const ws = store.create({ title: 'Rooftop Signal', pitch: 'p', loop: 'run', look: '2D flat and bold' })
  ws.options.design = cleanOptions('design', { options: [{ name: 'Dash', loop: 'jump gaps', goal: 'reach the mast', twist: 'wall runs', camera: 'side-on' }] })
  applyPick(ws, 'design', { id: 'design-1' })
  assert.equal(ws.spec.loop, 'jump gaps')
  assert.equal(ws.spec.twist, 'wall runs')
  assert.equal(ws.step, 'story')
  ws.options.enemies = cleanOptions('enemies', { options: [{ name: 'Drone', kind: 'minion', behaviour: 'dives', look: 'small' }, { name: 'Storm', kind: 'BOSS', behaviour: 'lightning', look: 'big' }] })
  applyPick(ws, 'enemies', { ids: ['enemies-1', 'enemies-2'] })
  assert.deepEqual(ws.spec.enemies.map(e => e.kind), ['minion', 'boss'])
  ws.options.levels = cleanOptions('levels', { options: [{ name: 'Roofs', idea: 'gaps', map: ['S.....X'] }] })
  applyPick(ws, 'levels', { id: 'levels-1' })
  assert.equal(ws.spec.levels[0].map.length, 16)
  applyPick(ws, 'world', { own: 'a flooded night market' })
  assert.equal(ws.spec.setting, 'a flooded night market')
  assert.throws(() => applyPick(ws, 'story', {}), /pick one/)
  assert.throws(() => applyPick(ws, 'nope', { id: 'x' }), /no such step/)
  const md = specMarkdown({ ...ws.spec, engine: 'phaser' })
  assert.match(md, /## Level: Roofs/)
  assert.match(md, /\*\*Storm\*\* \(boss\)/)
  assert.deepEqual(STEP_IDS, ['design', 'story', 'world', 'heroes', 'enemies', 'levels', 'sound'])
})

test('the build gets the picked art, named for the game', () => {
  const ws = { id: 'w-abcdefgh12', spec: { title: 'T' }, picks: { world: { id: 'world-2' }, heroes: { id: 'heroes-1' }, enemies: { ids: ['enemies-1'] } }, options: {
    world: [{ id: 'world-1', file: 'a.png' }, { id: 'world-2', file: 'b.png' }],
    heroes: [{ id: 'heroes-1', name: 'Kite', file: 'h.png', sprite: { file: 'h-sheet.png' } }],
    enemies: [{ id: 'enemies-1', name: 'Rain Wisp', kind: 'minion', file: 'e.webp' }, { id: 'enemies-2', name: 'Not me', file: 'n.png' }]
  } }
  const art = shippedArt(ws)
  assert.deepEqual(art.map(a => a.as), ['backdrop.png', 'hero.png', 'hero-sheet.png', 'enemy-rain-wisp.webp'])
  const spec = workshopSpec(ws)
  assert.equal(spec.workshop.art.length, 4)
  assert.match(workshopMarkdown(spec), /art\/hero-sheet\.png/)
})

test('prompts carry the look and never a franchise name from the maker', () => {
  const p = paintPrompt('heroes', { name: 'Kite', role: 'courier', look: 'yellow coat', personality: 'bold' }, { look: '2D pixel art' }, { world: { name: 'Roofs', setting: 'rain', palette: 'teal' } })
  assert.match(p.prompt, /2D pixel art/)
  assert.match(p.prompt, /Set in Roofs/)
  assert.equal(p.aspect, 'portrait')
  assert.match(askFor('story', { title: 'T' })[0].content, /never a character, name, world or text from an existing game/)
  assert.throws(() => paintPrompt('levels', {}), /no pictures/)
})
