import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTIONS, plan, isBig, bigGaps, artList, artBrief, BIG_STAGES, bigStagePrompt, gamePrompt, specMarkdown } from '../engine/game.mjs'

const big = {
  title: 'Ashfall Choir', pitch: 'Climb a cathedral of lava.', setting: 'a lava cathedral', hero: 'Senna', loop: 'fight, pick, go',
  engine: 'Phaser 3', skills: [], big: true, look: '2D painted', controls: 'WASD',
  hub: { name: 'The Vestry', what: 'a warm stone room' },
  rooms: [{ type: 'fight', what: 'nave' }, { type: 'elite', what: 'shaft' }, { type: 'rest', what: 'cistern' }],
  weapons: [{ name: 'Hammer' }, { name: 'Bow' }],
  patrons: [{ name: 'Dulcet', domain: 'frost', look: 'a pale bell' }],
  blessings: Array.from({ length: 12 }, (_, i) => ({ name: `Boon ${i}`, patron: 'Dulcet', effect: '+10%' })),
  enemies: ['mite', 'brute', 'wisp', 'husk', 'spider'].map(name => ({ name, attack: 'hits' })),
  boss: { name: 'The Cracked Tenor', look: 'a bell on legs', phases: ['rings', 'shatters'] },
  characters: [{ name: 'Senna', role: 'hero', look: 'soot', lines: ['Up again.'] }, { name: 'Old Abner', role: 'keeper', look: 'lantern', lines: ['Back?'] }],
  summary: 'rooms, foes, boons, time'
}

test('the interview asks how big, and the mini game stays the default', () => {
  const q = QUESTIONS.find(x => x.id === 'scope')
  assert.ok(q && q.chips.includes('Mini game') && q.chips.includes('Big game'))
  assert.equal(plan({}).big, false)
  assert.equal(plan({ scope: 'Big game' }).big, true)
  assert.equal(isBig({ big: true }), true)
  assert.equal(isBig({ answers: { scope: 'Big game' } }), true)
  assert.equal(isBig({ answers: { scope: 'Mini game' } }), false)
  assert.ok(plan({}).skills.length <= 6)
  assert.ok(plan({ scope: 'Big game' }).skills.includes('gamedev/level-design'))
})

test('a big spec is whole only with a hub, rooms, weapons, boons, enemies, a boss, people and a summary', () => {
  assert.deepEqual(bigGaps(big), [])
  const thin = { ...big, rooms: [big.rooms[0]], weapons: [], boss: null, characters: [] }
  assert.deepEqual(bigGaps(thin), ['3 room types', '2 weapons', 'a boss', '2 speaking characters'])
})

test('the art list covers every kind and stays under its cap', () => {
  const all = artList(big)
  const kinds = new Set(all.map(a => a.kind))
  for (const k of ['title', 'portrait', 'icon', 'backdrop']) assert.ok(kinds.has(k), k)
  assert.ok(all.length <= 20)
  assert.ok(all.some(a => a.id === 'portrait-the-cracked-tenor'), 'the boss gets a portrait')
  assert.ok(all.some(a => a.id === 'room-boss') && all.some(a => a.id === 'room-hub'))
  assert.equal(new Set(all.map(a => a.id)).size, all.length, 'ids are unique')
  const few = artList(big, { max: 4 })
  assert.equal(few.length, 4)
  assert.deepEqual(new Set(few.map(a => a.kind)), kinds, 'a tight cap still keeps one of each kind')
})

test('the stages go one system group at a time and name the painted files', () => {
  assert.ok(BIG_STAGES.length >= 4)
  assert.deepEqual(BIG_STAGES.map(s => s.id), ['core', 'rooms', 'boons', 'hub', 'boss'])
  const art = [{ file: 'art/title.png', what: 'title screen picture' }]
  const first = bigStagePrompt(big, 0, { art })
  assert.match(first, /stage 1: the core fight/)
  assert.match(first, /How to build it/, 'the first stage carries the engine notes')
  assert.match(first, /art\/title\.png/)
  assert.doesNotMatch(first, /so no image files are needed/)
  const later = bigStagePrompt(big, 2, { art, failed: 'the build failed. Make it pass.' })
  assert.match(later, /Already built: the core fight, the run of rooms/)
  assert.match(later, /^This is a big browser game/)
  assert.match(later, /First: the build failed/)
  assert.doesNotMatch(later, /How to build it/)
  assert.match(artBrief([]), /draw every portrait/)
})

test('the spec file lists a big game\'s systems; the mini prompt is unchanged', () => {
  const md = specMarkdown(big)
  for (const s of ['## Hub', '## Weapons', 'Boon 11', '## Boss', 'Old Abner', '## Run summary']) assert.ok(md.includes(s), s)
  assert.match(md, /Enemies \/ obstacles:\*\* mite, brute/, 'object enemies list by name')
  const mini = { ...big, big: undefined, enemies: ['ink moths'] }
  assert.doesNotMatch(specMarkdown(mini), /## Hub/)
  const p = gamePrompt(mini)
  assert.match(p, /^Build this browser game as the whole app/)
  assert.doesNotMatch(p, /stage/)
})
