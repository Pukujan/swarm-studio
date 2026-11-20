// Starting a game: the rules the questions, the spec card, the Cast step and Shape it follow
// (src/screens/game/start/model.ts), the same as the classic Studio's (web/canvas/rooms.js, web/workshop.js). Node
// runs the TypeScript file as it is (type stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { castForBuild, castJobs, freeRole, gameList, jobNext, jobRole, makeable, makingJobs, melodyOf, newCast, optionRows, pickOf, roleLabel, specEdit, specLine, spritePick, stageOf, walkAt } from '../src/screens/game/start/model.ts'

test('an edited line goes into the spec; an emptied one keeps what it had', () => {
  const s = { title: 'Lantern Run', hero: 'A keeper', enemies: [{ name: 'Crow' }, { name: 'Moth' }] }
  assert.equal(specEdit(s, 'hero', '  A lost keeper ').hero, 'A lost keeper')
  assert.equal(specEdit(s, 'hero', '   '), s)
  assert.equal(specLine(s, 'Enemies'), 'Crow, Moth')
  assert.equal(specLine(s, 'Hero'), 'A keeper')
})

test("a big spec's enemies stay objects unless that line changed", () => {
  const s = { title: 'T', enemies: [{ name: 'Crow', hp: 3 }, { name: 'Moth', hp: 1 }] }
  assert.equal(specEdit(s, 'enemies', 'Crow, Moth'), s)
  assert.deepEqual(specEdit(s, 'enemies', 'Crow, Wasp , ').enemies, ['Crow', 'Wasp'])
  assert.equal(gameList('just words'), 'just words')
})

test('an unfinished walk says how far it is', () => {
  assert.equal(walkAt('design'), 1)
  assert.equal(walkAt('heroes'), 4)
  assert.equal(walkAt('nowhere'), 1)
})

test('a picture becomes a role named from its file, with an id nobody has', () => {
  assert.equal(roleLabel('00a-messenger.png'), 'Messenger')
  assert.equal(roleLabel('old_guard-captain.webp'), 'Old guard captain')
  assert.equal(roleLabel('.png'), 'Character')
  assert.equal(freeRole([{ id: 'hero', label: 'Hero' }, { id: 'hero-2', label: 'Hero' }], 'hero'), 'hero-3')
  assert.equal(freeRole([], 'hero'), 'hero')
})

const cast = () => newCast({
  roles: [{ id: 'hero', label: 'Hero' }, { id: 'rival', label: 'Rival' }, { id: 'guide', label: 'Guide' }, { id: 'boss', label: 'Boss' }],
  meshy: { ready: true, cost: 35, art: ['/a.png'] },
  own: {
    hero: { art: '/a.png', job: null },
    rival: { art: '/b.png', job: { id: 'j1', state: 'running', stage: 'model', progress: 40 } },
    guide: { art: '/c.png', job: { id: 'j2', state: 'done', pick: { name: 'Guide', thumbSrc: '/models/meshy-guide.png' } } },
    boss: { art: '/d.png', job: { state: 'failed', error: 'out of credits' } }
  }
})

test('Make all makes the roles with a picture and nothing made or being made, only with a Meshy key', () => {
  const c = cast()
  assert.deepEqual(makeable(c).map(r => r.id), ['hero', 'boss'])
  assert.deepEqual(makeable({ ...c, meshy: { ...c.meshy, ready: false } }), [])
  assert.deepEqual(makeable({ ...c, meshy: null }), [])
})

test('the bench holds every job; only the running ones are polled', () => {
  const c = cast()
  assert.deepEqual(castJobs(c).map(x => x.r.id), ['rival', 'guide', 'boss'])
  assert.deepEqual(makingJobs(c).map(x => x.r.id), ['rival'])
  assert.equal(stageOf(c.own.boss.job), 'failed')
  assert.equal(stageOf({ state: 'running' }), 'queued')
})

test("a poll keeps when a stage began while the stage is the same, and marks when the job ended", () => {
  const was = { id: 'j1', state: 'running', stage: 'model', stageAt: 100 }
  assert.equal(jobNext(was, { id: 'j1', state: 'running', stage: 'model', progress: 60 }, 500).stageAt, 100)
  assert.equal(jobNext(was, { id: 'j1', state: 'running', stage: 'rig' }, 500).stageAt, 500)
  assert.equal(jobNext(was, { id: 'j1', state: 'done', stage: 'download' }, 900).endedAt, 900)
  assert.equal(jobNext(was, { id: 'j1', state: 'running', stage: 'rig' }, 500).endedAt, undefined)
  assert.equal(jobRole('old guard/2!'), 'oldguard2')
})

test('the build takes one model per role, without what only the page drew with', () => {
  const c = cast()
  c.picks.hero = { key: 'sketchfab:9', n: 3, preview: 'https://x/p.jpg', role: 'hero', source: 'sketchfab', id: '9', name: 'Knight' }
  c.picks.guide = { key: 'own', thumbSrc: '/models/meshy-guide.png', role: 'guide', source: 'meshy', rigged: true }
  assert.deepEqual(castForBuild(c), [{ role: 'hero', source: 'sketchfab', id: '9', name: 'Knight' }, { role: 'guide', source: 'meshy', rigged: true }])
  assert.deepEqual(spritePick({ id: 'hero', label: 'Hero' }, '/a.png'), { key: 'own', role: 'hero', label: 'Hero', source: 'art', format: 'sprite', art: '/a.png', name: 'Hero (sprite)', creator: 'this project' })
})

test('Shape it: nothing picked skips the step; enemies take several', () => {
  assert.equal(pickOf('world', null, [], ''), null)
  assert.deepEqual(pickOf('world', 'w2', [], ''), { id: 'w2' })
  assert.deepEqual(pickOf('world', 'w2', [], 'a flooded library'), { own: 'a flooded library' })
  assert.equal(pickOf('enemies', 'e1', [], ''), null)
  assert.deepEqual(pickOf('enemies', 'e1', ['e1', 'e3'], ''), { ids: ['e1', 'e3'], own: '' })
  assert.deepEqual(pickOf('enemies', null, [], 'paper wasps'), { ids: [], own: 'paper wasps' })
})

test("Shape it: an option's lines leave out what it does not have", () => {
  assert.deepEqual(optionRows('story', { id: 's1', name: 'The last light', logline: 'A keeper carries the last flame.', acts: ['Dusk', 'Night'] }), [['Story', 'A keeper carries the last flame.'], ['Act 1', 'Dusk'], ['Act 2', 'Night']])
  assert.deepEqual(optionRows('sound', { id: 'm1', name: 'Embers', feel: 'warm', bpm: 96, scale: 'dorian' }), [['Feel', 'warm'], ['Tempo', '96 bpm, dorian']])
})

test('the music loop is the same every time for an option, in its scale', () => {
  const a = melodyOf('m1', 'pentatonic'), b = melodyOf('m1', 'pentatonic')
  assert.deepEqual(a, b)
  assert.equal(a.melody.length, 16)
  assert.ok(a.melody.every(n => n === null || a.scale.includes(n % 12)))
  assert.deepEqual(melodyOf('m1', 'unknown').scale, [0, 2, 3, 5, 7, 8, 10])
})
