// Plan before spend (spec 21): cards, the price, the gate. No network, no credits.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PLAN_QUESTIONS, CARDS, planFromAnswers, editCard, setSystems, planPrice, lockPlan, assertLocked, cellBox, pickCell, planStore, card, roster } from '../engine/plan.mjs'

const ARES = { genre: 'Action RPG', cast: 'Girls only', size: '6', combat: 'Stylish combos', enemies: 'Minions, elites, bosses', progression: 'New Game+', money: 'Free + cosmetics', look: 'Anime cel-shaded' }
const ares = () => {
  const p = planFromAnswers({ idea: 'ARES, a girls-only action RPG in the war god\'s arena', answers: ARES })
  // ARES shipped with five systems
  return setSystems(p, { logins: true, payments: true, leaderboard: true, gacha: true, pilot: true, enemyAI: false, loadout: false, subscriptions: false })
}

test('every question is a few chips, never a text wall', () => {
  assert.ok(PLAN_QUESTIONS.length >= 6 && PLAN_QUESTIONS.length <= 9)
  for (const q of PLAN_QUESTIONS) { assert.ok(q.chips.length >= 3 && q.chips.length <= 6, q.id); assert.ok(q.q.split(' ').length <= 7, q.q) }
})

test('answers become the nine cards, defaults filled', () => {
  const p = planFromAnswers({})
  assert.deepEqual(p.cards.map(c => c.name), CARDS.map(c => c[1]))
  assert.equal(roster(p).length, 3)
  assert.equal(p.gate.locked, false)
  const a = ares()
  assert.equal(a.title, 'ARES')
  assert.equal(roster(a).length, 6)
  assert.match(roster(a)[0].name, /Heroine/)
  assert.match(card(a, 'combat').body.style, /launcher/)
  assert.match(card(a, 'enemies').body.boss, /3 stages/)
  assert.equal(card(a, 'systems').body.Gacha, 'on')
})

test('unknown answers are ignored, long ones trimmed', () => {
  const p = planFromAnswers({ answers: { hack: 'x', look: 'y'.repeat(900) } })
  assert.equal(p.answers.hack, undefined)
  assert.ok(p.answers.look.length <= 300)
})

test('ARES costs 324 credits and 8 runs; test first is 59, then 265', () => {
  const pr = planPrice(ares())
  assert.equal(pr.credits, 324)
  assert.deepEqual(pr.parts.map(x => [x.what, x.n, x.credits]), [['Characters', 6, 180], ['Rigs', 6, 30], ['Animations', 8, 24], ['Weapons', 6, 90]])
  assert.equal(pr.runs, 8)
  assert.equal(pr.first.credits, 59)
  assert.equal(pr.rest.credits, 265)
  assert.ok(pr.images > 0)
})

test('a 2D game spends no Meshy credits', () => {
  assert.equal(planPrice(planFromAnswers({ answers: { look: 'Pixel art' } })).credits, 0)
})

test('a made character is not charged again', () => {
  const p = ares()
  p.build.characters.push({ name: roster(p)[0].name, state: 'done' })
  assert.equal(planPrice(p).credits, 324 - 35)
})

test('the gate: a stale price is refused and nothing is locked', () => {
  const p = ares()
  assert.throws(() => lockPlan(p, { credits: 300 }), e => e.status === 402)
  assert.equal(p.gate.locked, false)
  assert.throws(() => assertLocked(p), e => e.status === 409)
  lockPlan(p, { credits: 324 })
  assert.equal(p.gate.locked, true)
  assert.equal(assertLocked(p).phase, 'all')
})

test('test one first locks the first price only', () => {
  const p = ares()
  assert.throws(() => lockPlan(p, { credits: 324, testFirst: true }), e => e.status === 402)
  lockPlan(p, { credits: 59, testFirst: true })
  assert.equal(p.gate.phase, 'first')
})

test('an edit after the lock reopens the gate and changes the price', () => {
  const p = ares()
  lockPlan(p, { credits: 324 })
  editCard(p, 'cast', { roster: roster(p).slice(0, 2) })
  assert.equal(p.gate.locked, false)
  assert.equal(card(p, 'cast').body.count, '2')
  assert.equal(planPrice(p).credits, 2 * 35 + 24 + 2 * 15)
  editCard(p, 'story', { premise: 'A new premise' })
  assert.equal(card(p, 'story').body.premise, 'A new premise')
  assert.equal(card(p, 'story').body.acts, '3')
  editCard(p, 'systems', { Logins: 'off' })
  assert.equal(p.systems.logins, false)
  assert.throws(() => editCard(p, 'nope', {}), e => e.status === 404)
})

test('sheet cells: box math and picks with notes', () => {
  assert.deepEqual(cellBox([5, 4], 0), { x: 0, y: 0, w: 0.2, h: 0.25 })
  assert.deepEqual(cellBox([5, 4], 7), { x: 0.4, y: 0.25, w: 0.2, h: 0.25 })
  const p = ares()
  p.sheets.push({ id: 's1', kind: 'cast', grid: [5, 4], picks: [] })
  pickCell(p, { sheet: 's1', cell: 3, note: 'heels' })
  pickCell(p, { sheet: 's1', cell: 7 })
  assert.deepEqual(p.sheets[0].picks, [3, 7])
  assert.equal(p.sheets[0].notes[3], 'heels')
  pickCell(p, { sheet: 's1', cell: 3, on: false })
  assert.deepEqual(p.sheets[0].picks, [7])
  assert.equal(p.sheets[0].notes[3], undefined)
  assert.throws(() => pickCell(p, { sheet: 's1', cell: 20 }), e => e.status === 400)
})

test('the store keeps plans by id and lists them newest first', () => {
  const s = planStore(join(mkdtempSync(join(tmpdir(), 'plans-')), 'plans'))
  const a = s.create({ idea: 'Alpha, a test', answers: { size: '1' } })
  const b = s.create({ idea: 'Beta, a test' })
  assert.match(a.id, /^p-[a-z0-9]+$/)
  assert.equal(s.get(a.id).title, 'Alpha')
  assert.equal(s.get('../etc'), null)
  assert.deepEqual(s.list().map(x => x.id).sort(), [a.id, b.id].sort())
  assert.equal(typeof s.list()[0].price.credits, 'number')
})
