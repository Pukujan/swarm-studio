// The chat says only the work it really did (rank-juggler, 2026-11-16/17; EVIDENCE.md failures 1 and 3). The owner's
// report named the game "Rank Juggler": the chat said "Repainting the mocks so they read as fast side-view arena
// combat" and no mock was ever repainted (it admits it two turns later), and nine replies in a row ended with the very
// same "Painting the backdrops now. It shows on the board as it lands." while nothing was painting at all.
// The strings here are the transcript's own; the plan is that night's plan file (tests/fixtures/rank-juggler).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { planFacts, checkClaims, nextStep, stepLineFor } from '../engine/gamestep.mjs'
import { planRoutes } from '../server/plans.mjs'
import { talkRoutes } from '../server/talk.mjs'

const FIX = fileURLToPath(new URL('./fixtures/rank-juggler/', import.meta.url))
const PLAN = 'p-44c1061860', CHAT = 'c-a081ad00b5'
const plan0 = () => JSON.parse(readFileSync(join(FIX, 'plans', `${PLAN}.json`), 'utf8'))
// the two lines the person saw, word for word
const REPAINTING = 'Repainting the mocks so they read as fast side-view arena combat'
const STEP = 'Painting the backdrops now. It shows on the board as it lands.'

// that night's plan, locked, with nothing painted yet but the first cast sheet
const night = () => { const p = plan0(); p.gate.locked = true; p.engine.target = 'web'; return p }

test('the mocks, the backdrops and the sheets are facts a claim can be checked against', () => {
  const f = planFacts(night(), {})
  const byWhat = Object.fromEntries(f.pictures.map(p => [p.what, p]))
  // the plan paints six close-ups, five mock screens and nine backdrops (three stages, three a stage); none has landed
  assert.deepEqual(byWhat['mock'], { what: 'mock', names: byWhat['mock'].names, done: 0, painting: 0, queued: 5 })
  assert.deepEqual([byWhat['backdrop'].done, byWhat['backdrop'].painting, byWhat['backdrop'].queued], [0, 0, 9])
  assert.deepEqual([byWhat['sheet'].done, byWhat['sheet'].painting, byWhat['sheet'].queued], [1, 0, 1])
  // a mock that is painting is what a "repainting the mocks" is checked against, and only for the mocks
  const p = night()
  p.mocks = [{ id: 'm1', shot: 'combat', state: 'painting' }]
  const g = planFacts(p, {})
  assert.deepEqual(g.pictures.filter(x => x.painting).map(x => x.what), ['mock'])
  assert.equal(g.pictures.find(x => x.what === 'backdrop').painting, 0)
})

test('failure 3: "Repainting the mocks" is cut when nothing is repainting, and said when it is', () => {
  const f = planFacts(night(), {})
  // the exact sentence from turn 50, which was false then and is false on that plan
  assert.deepEqual(checkClaims(REPAINTING, f).cut, [REPAINTING])
  // and one that ends the turn: the turn keeps what was true and loses the claim
  const turn = `The rank meter reads at the corner. ${REPAINTING}.`
  assert.equal(checkClaims(turn, f).text, 'The rank meter reads at the corner.')
  // the first person, the done tense's own words, and the other actions the chat uses
  for (const said of [
    'I am repainting the mocks.',
    'I repainted the mocks.',
    'I changed the mocks so they read as arena combat.',
    'I fixed the backdrop.',
    'I regenerated the mock screens.',
    'Repainted the mocks.'
  ]) assert.deepEqual(checkClaims(said, f).cut, [said], said)
  // the same claim, once the mocks really are painting, is true and stays
  const p = night()
  p.mocks = [{ id: 'm1', shot: 'combat', state: 'painting' }]
  const g = planFacts(p, {})
  assert.deepEqual(checkClaims(REPAINTING, g), { text: REPAINTING, cut: [] })
  // and once they have landed, the done claim is true
  p.mocks[0].state = 'done'
  assert.deepEqual(checkClaims('I repainted the mocks.', planFacts(p, {})), { text: 'I repainted the mocks.', cut: [] })
})

test('a mock claim is never borne out by another picture kind painting', () => {
  const p = night()
  // the backdrops are painting: a claim about the backdrops is true, one about the mocks is not
  p.backdrops = [{ id: 'b1', stage: 0, n: 1, state: 'painting' }]
  const f = planFacts(p, {})
  assert.deepEqual(checkClaims('Painting the backdrops now.', f), { text: 'Painting the backdrops now.', cut: [] })
  assert.deepEqual(checkClaims(REPAINTING, f).cut, [REPAINTING])
  // the one true claim the chat does make, that the plan is not locked, is untouched on an unlocked plan
  const open = plan0()
  assert.deepEqual(checkClaims('The plan is not locked yet.', planFacts(open, {})).cut, [])
})

test('a question, a refusal and the person\'s own next step are not claims', () => {
  const f = planFacts(night(), {})
  for (const said of [
    'I cannot repaint the mocks.',
    'I will not repaint the mocks.',
    'How would you like me to repaint the mocks?',
    'Next: repaint the mocks so they read as fast side-view arena combat.',
    'Should I repaint the mocks as arena combat?'
  ]) assert.deepEqual(checkClaims(said, f).cut, [], said)
})

test('failure 1: the step line is not echoed after the reply already said it; a new one is', () => {
  const plan = night(), chat = JSON.parse(readFileSync(join(FIX, 'chats', CHAT, 'chat.json'), 'utf8'))
  const step = nextStep(chat, plan, {})
  const own = 'The mocks have not been repainted yet.'
  // the same line after the reply already carried it: an echo, dropped
  chat.turns.push({ id: 't17', who: 'planner', text: `${own} ${STEP}`, step: true })
  assert.equal(stepLineFor(chat, { text: STEP }, own), '')
  // nothing of the reply's own: the line is the whole message, and repeating it is honest (silence would be worse)
  assert.equal(stepLineFor(chat, { text: STEP }, ''), STEP)
  // the step moves on (the lock happens): the new line is said
  assert.equal(stepLineFor(chat, { text: 'The plan is not locked yet.' }, own), 'The plan is not locked yet.')
  // the person's turn in between changes nothing: the last planner turn already ended on that line
  chat.turns.push({ id: 't18', who: 'person', text: 'theyre not being repainted' })
  assert.equal(stepLineFor(chat, { text: STEP }, own), '')
  // a planner turn that ended on something else does not block the step's line
  chat.turns.push({ id: 't19', who: 'planner', text: 'Tell me which one to keep.', step: true })
  assert.equal(stepLineFor(chat, { text: STEP }, own), STEP)
  // nothing to say, nothing said
  assert.equal(stepLineFor(chat, { text: '' }, own), '')
  assert.equal(stepLineFor({ turns: [] }, { text: STEP }, own), STEP)
  // a download running, a question open, or a paint in progress: never hidden behind the dedupe
  assert.equal(stepLineFor(chat, { text: STEP, install: { pct: 12 } }, own), STEP)
  assert.equal(stepLineFor(chat, { text: STEP, wait: true }, own), STEP)
  assert.equal(stepLineFor(chat, { text: STEP, options: [{ id: 'do:browser', label: 'Browser is fine' }] }, own), STEP)
  assert.equal(stepLineFor(chat, { text: 'Install Godot 4, or is the browser fine?' }, own), 'Install Godot 4, or is the browser fine?')
})

test('nine replies in a row, as that night read: the same step line is not echoed after the reply said it', () => {
  // The chat file that night ends every planner turn with the same sentence, appended even to the turn that said the
  // mocks had NOT been repainted. Rebuilt here as the chat builds a turn: the planner's own words, then the step's
  // line through stepLineFor. What must never happen again is a reply that ALREADY said its piece being closed with
  // the same sentence a second time, or with a promise the board never made.
  const chat = { turns: [] }
  const added = []
  const words = ['The mocks are next.', 'The look has to be settled first.', 'The rank meter is the thing to settle.', 'The mocks read as arena combat.', 'Two heroes are enough for the slice.', 'The controls are what the slice needs.', 'The rank meter reads at the corner.', 'The slice needs one arena.', 'The mocks are the next picture.']
  for (let n = 0; n < 9; n++) {
    const line = stepLineFor(chat, { text: STEP }, words[n])
    added.push(line)
    const text = line ? `${words[n]} ${line}` : words[n]
    // the step is still the end of the reply, with its buttons; the sentence is only in it once
    chat.turns.push({ id: `t${46 + n * 2}`, who: 'planner', text: line ? text : `${words[n]}`, step: true, options: [{ id: 'do:backdrops', label: 'Lock look, paint backdrops' }] })
    chat.turns.push({ id: `t${47 + n * 2}`, who: 'person', text: n % 2 ? 'i need better mocks please' : 'theyre not being repainted' })
  }
  // A reply that already carried the line is never given it twice. The turns where the person typed in between start
  // from a reply that had said something else, so the line is owed to them again: that is the honest alternation,
  // echo -> nothing to echo -> echo, never twice in a row.
  for (let i = 1; i < added.length; i++) if (added[i] === STEP) assert.notEqual(added[i - 1], STEP, `reply ${i} echoes the line before it`)
  assert.equal(added.filter(l => l === '').length, 4, 'four of the nine are echoes and dropped')
  const planner = chat.turns.filter(t => t.who === 'planner')
  assert.equal(planner.length, 9)
  // no reply carries it twice, and the sentence never lands on a reply that already had it
  assert.ok(planner.every(t => t.text.split(STEP).length - 1 <= 1), 'the sentence is never doubled in a reply')
  assert.equal(planner.filter(t => t.text.includes(STEP)).length, 5, 'it is said on the five replies that had nothing else')
  // the false line from turn 50 is never in any of them
  assert.ok(!chat.turns.some(t => /Repainting the mocks/i.test(t.text)))
  // a turn whose step moved on says the new one
  assert.equal(stepLineFor(chat, { text: 'The plan is not locked yet.' }, 'Fine.'), 'The plan is not locked yet.')
})
