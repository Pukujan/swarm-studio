// The game kit (docs/specs/37-studio-first.md): today's Plan board behind the kit contract, unchanged.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gameKit } from '../web/kit-game.js'
import { planFromAnswers, planView } from '../engine/plan.mjs'

const board = plan => {
  const calls = []
  return { calls, ctx: { C: { planView: { plan, select: k => calls.push(['select', k]), gate: async () => calls.push(['gate']) } } } }
}
const ants = () => planView(planFromAnswers({ idea: 'army of ants, an rts in godot', answers: {}, force: { family: 'rts', size: 'tiny', art: '2d', engine: 'godot' } }))

test('the game kit has every field of the contract', () => {
  for (const k of ['kind', 'name', 'icon', 'steps', 'starts', 'reads', 'plan', 'proposal', 'lock', 'build']) assert.ok(k in gameKit, k)
  assert.equal(gameKit.kind, 'game')
  for (const k of ['sections', 'questions', 'done']) assert.equal(typeof gameKit.plan[k], 'function', k)
  assert.match(readFileSync(new URL('../web/icons.js', import.meta.url), 'utf8'), new RegExp(`\\b${gameKit.icon}:`))
})

test('its sections are the board\'s artboards, and picking one selects it on the board', () => {
  const { ctx, calls } = board(ants())
  const secs = gameKit.plan.sections(ctx)
  assert.deepEqual(secs.map(s => s.sec), ['Starter', 'Systems', 'Plan'])
  assert.ok(secs[1].cards.some(c => c.key === 'sys:flowfield'))
  secs[2].cards[0].inspect()
  assert.match(calls[0][1], /^card:/)
  assert.deepEqual(gameKit.plan.sections(board(null).ctx), [])
})

test('its proposal is the Lock price, and its lock is the plan\'s gate with the starter', async () => {
  const p = ants()
  const { ctx, calls } = board(p)
  assert.equal(gameKit.proposal(ctx).credits, p.price.credits)
  assert.equal(gameKit.lock(ctx), null)
  assert.equal(gameKit.plan.done(ctx), false)
  p.gate = { locked: true, lockedAt: 'now', phase: 'all', credits: 0, starter: { engine: 'godot', template: { id: 'strategy-topdown', version: '1.0.0' } } }
  assert.equal(gameKit.lock(ctx).starter.template.id, 'strategy-topdown')
  assert.equal(gameKit.plan.done(ctx), true)
  await gameKit.build({}, ctx)
  assert.deepEqual(calls, [['gate']])
})
