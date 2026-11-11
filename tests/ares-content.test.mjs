import test from 'node:test'
import assert from 'node:assert/strict'
import { check, load } from '../games/ares/tools/check-content.mjs'

const data = load()
const copy = () => structuredClone(data)

test('the stages, enemies and fights follow CONTENT.md', () => {
  assert.deepEqual(check(data), [])
})

test('six stages in ladder order, each boss in its own stage, Teknium on the last throne', () => {
  assert.deepEqual(data.stages.stages.map(s => s.id), ['ember', 'gold', 'snow', 'crimson', 'ruin', 'inferno'])
  for (const s of data.stages.stages) {
    const bosses = new Set(s.sections.filter(x => x.kind === 'arena').map(x => x.boss))
    assert.ok(bosses.size >= 2 && bosses.size <= 4, s.id)
  }
  const inferno = data.stages.stages.at(-1).sections
  assert.equal(inferno.at(-1).boss, 'Teknium')
  assert.equal(inferno.at(-2).kind, 'chase')
  assert.equal(inferno.at(-2).chaser, 'Teknium')
})

test('Teknium runs his four movements and lands on the red moon', () => {
  const t = data.fights.fights.Teknium
  assert.equal(t.body, 'platform')
  assert.equal(t.sprite, 'teknium')
  assert.deepEqual(t.modes.map(m => m.from), [1, 0.7, 0.45, 0.25])
  assert.deepEqual(t.modes[3].patterns, ['spiral', 'lances', 'glare', 'rain', 'summon', 'doom_wall'])
  assert.equal(t.modes[3].stage, 'red_moon')
  assert.equal(data.fights.fights.LocutusOfTheEye.body, 'float')
})

test('later stages hit harder', () => {
  const hp = data.bosses.bosses.map(b => data.fights.fights[b.handle].hp)
  assert.ok(hp.at(-1) === Math.max(...hp) && hp[0] === Math.min(...hp))
  const speeds = data.stages.stages.flatMap(s => s.sections.filter(x => x.kind === 'chase').map(x => x.wall.speed))
  assert.deepEqual(speeds, [...speeds].sort((a, b) => a - b))
})

test('the checker catches gaps, unknown names and unsorted modes', () => {
  let d = copy(); d.stages.stages[0].sections[1].from += 10
  assert.ok(check(d).some(e => /gap or overlap/.test(e)))
  d = copy(); d.fights.fights.Lokee.modes[0].patterns.push('laser_show')
  assert.ok(check(d).some(e => /unknown pattern laser_show/.test(e)))
  d = copy(); d.fights.fights.Lokee.modes.reverse()
  assert.ok(check(d).some(e => /from 1.0|descending/.test(e)))
  d = copy(); d.enemies.enemies.grunt.attack.kind = 'laser'
  assert.ok(check(d).some(e => /cannot use attack laser/.test(e)))
  d = copy(); d.stages.stages[0].sections[0].plats[0].role = 'trampoline'
  assert.ok(check(d).some(e => /unknown role/.test(e)))
  d = copy(); delete d.fights.fights.Suzu
  assert.ok(check(d).some(e => /Suzu/.test(e)))
  d = copy(); d.stages.stages[0].sections[0].waves[0].enemies[0].x = 99999
  assert.ok(check(d).some(e => /outside the section/.test(e)))
})
