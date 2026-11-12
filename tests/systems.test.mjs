// The Systems card's modules (spec 21): each switch adds its block to the build prompt.
import test from 'node:test'
import assert from 'node:assert/strict'
import { planFromAnswers, setSystems, SYSTEMS } from '../engine/plan.mjs'
import { systemsAsk, MODULES } from '../engine/systems.mjs'
import { gameBrief } from '../engine/planart.mjs'
import { AUTH } from '../engine/appjob.mjs'
import { SHOP_ASK } from '../engine/auto.mjs'

const none = Object.fromEntries(SYSTEMS.map(([k]) => [k, false]))

test('every switch on the card has a module', () => {
  assert.deepEqual(Object.keys(MODULES).sort(), SYSTEMS.map(([k]) => k).sort())
})

test('an empty plan adds nothing', () => {
  assert.equal(systemsAsk(setSystems(planFromAnswers({}), none)), '')
  assert.equal(systemsAsk(null), '')
})

test('each switched-on module adds its block, in the card\'s order; logins and payments are reused word for word', () => {
  const p = setSystems(planFromAnswers({}), { ...none, logins: true, payments: true, gacha: true })
  const ask = systemsAsk(p)
  assert.ok(ask.includes(AUTH))
  assert.ok(ask.includes(SHOP_ASK))
  assert.ok(ask.indexOf(AUTH) < ask.indexOf(SHOP_ASK) && ask.indexOf(SHOP_ASK) < ask.indexOf(MODULES.gacha))
  assert.ok(!ask.includes(MODULES.leaderboard))
  for (const id of Object.keys(MODULES)) {
    const one = systemsAsk(setSystems(planFromAnswers({}), { ...none, [id]: true }))
    assert.ok(one.includes(MODULES[id]), id)
  }
})

test('money stays in test mode or a labelled demo', () => {
  assert.match(MODULES.subscriptions, /sk_test_/)
  assert.match(MODULES.subscriptions, /DEMO/)
  assert.match(MODULES.gacha, /cosmetic only/i)
  assert.match(MODULES.gacha, /pity/i)
})

test('the game brief carries the cards, the systems and the close-up rule', () => {
  const p = setSystems(planFromAnswers({ idea: 'ARES, a 3D test', answers: { size: '2' } }), { ...none, leaderboard: true })
  const b = gameBrief(p)
  assert.match(b, /Cast: /)
  assert.match(b, /Hero 1/)
  assert.ok(b.includes(MODULES.leaderboard))
  assert.match(b, /Art at close-ups/)
})
