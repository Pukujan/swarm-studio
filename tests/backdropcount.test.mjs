// The number of backdrops a plan paints is one number (issue #666). Three places said it, each reading a different
// field: engine/plan.mjs's price read the World card then the settings; engine/gamestep.mjs's pictures read only the
// card (and clamped at 5); server/talk.mjs's stateOf read only the settings. A plan whose World card had been edited
// therefore had one price and a different count in the chat.
//
// This pins the one authority (engine/plan.mjs stageCount) to the two readers, so a change to either side fails here
// instead of reaching a person as two different numbers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stageCount, planPrice, SETTINGS } from '../engine/plan.mjs'
import { planFacts } from '../engine/gamestep.mjs'

// a plan with a World card, the way the board holds one (engine/plan.mjs modelOf writes the card, editCard edits it)
const planWith = (card, settings = {}) => ({
  cards: [{ id: 'world', body: { stages: card, backdrops: '3 painted panoramas a stage' } }, { id: 'enemies', body: {} }, { id: 'cast', body: {} }],
  settings: { ...SETTINGS, ...settings },
  shape: {},
  art: { sheets: ['cast', 'weapons'], shots: [['combat']] },
  sheets: [], mocks: [], backdrops: [], build: { characters: [], sprites: [] },
  systems: {}, starter: {}
})

const backdrops = plan => planFacts(plan, {}).pictures.find(p => p.what === 'backdrop')

test('the stage count is the World card, then the settings, then the default', () => {
  // the card wins: it is the one the person edits on the board
  assert.equal(stageCount(planWith('5', { stages: 2 })), 5)
  // no card value: the plan's own settings
  assert.equal(stageCount(planWith('', { stages: 2 })), 2)
  // neither: the default
  assert.equal(stageCount(planWith('', { stages: 0 })), SETTINGS.stages)
  // a card that is not a number is not a stage count
  assert.equal(stageCount(planWith('a lot', { stages: 4 })), 4)
})

test('the chat\'s backdrop total is the price\'s own stage count, not a second reading of it', () => {
  for (const [card, settings] of [['5', { stages: 2 }], ['', { stages: 2 }], ['2', {}], ['1', { stages: 4 }]]) {
    const plan = planWith(card, settings)
    const per = Number(plan.settings.backdropsPerStage)
    assert.equal(backdrops(plan).queued, stageCount(plan) * per, `card ${card || 'none'}, settings ${JSON.stringify(settings)}`)
  }
})

test('the price and the chat agree on how many backdrops are still to paint', () => {
  // the price is what the person is charged for; the chat is what they are told. They are the same plan, so they
  // are the same number.
  for (const card of ['1', '2', '3', '5']) {
    const plan = planWith(card, {})
    const priced = planPrice(plan).pics.backdrops
    assert.equal(backdrops(plan).queued, priced, `card ${card}: price says ${priced}`)
  }
})

test('a plan with no backdrops paints none, whatever the count says', () => {
  const plan = { ...planWith('5'), shape: { backdrops: false } }
  assert.equal(backdrops(plan).queued, 0)
})
