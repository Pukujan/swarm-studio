import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHOWCASES, BRIEF_QUESTIONS, GRILL_WORDS, isVague, grillBrief, intake } from '../engine/intake.mjs'
import { QUESTIONS } from '../engine/game.mjs'
import { loadPack } from '../engine/packs.mjs'

const STEP_IDS = ['design', 'review', 'app', 'tools', 'games', 'shop', 'data', 'checks', 'video', 'deploy', 'launch']

test('each showcase runs a real Auto job and lists a few short steps', () => {
  assert.ok(SHOWCASES.length >= 3 && SHOWCASES.length <= 4)
  for (const s of SHOWCASES) {
    assert.ok(s.prompt.split(/\s+/).length >= GRILL_WORDS, `${s.id} is specific enough to skip the grill`)
    assert.ok(s.steps.length >= 3 && s.steps.length <= 7, s.id)
    for (const x of s.steps) assert.ok(x.split(' ').length <= 2, `${s.id}: step "${x}" is a name`)
    assert.ok(['none', 'mini', 'big'].includes(s.run.games), s.id)
    if (s.run.pack) assert.ok(loadPack(s.run.pack), `${s.id}: pack ${s.run.pack}`)
    for (const id of s.run.only || []) assert.ok(STEP_IDS.includes(id), `${s.id}: step ${id}`)
  }
  assert.deepEqual(SHOWCASES.find(s => s.id === 'game').run.games, 'big')
})

test('the hosted studio gets only the website showcases, without the Auto job', () => {
  const h = intake({ hosted: true })
  assert.ok(h.showcases.length >= 1)
  for (const s of h.showcases) { assert.equal(s.run, undefined); assert.ok(SHOWCASES.find(x => x.id === s.id).site) }
  assert.equal(intake().showcases.length, SHOWCASES.length)
  assert.deepEqual(h.questions, BRIEF_QUESTIONS)
})

test('the interview has the game interview\'s shape and asks the four things that matter', () => {
  for (const q of BRIEF_QUESTIONS) {
    assert.ok(q.id && q.q && Array.isArray(q.chips) && q.chips.length, q.id)
    assert.ok(q.q.split(/\s+/).length <= 6, `${q.id}: short question`)
  }
  for (const id of ['who', 'must', 'look', 'win']) assert.ok(BRIEF_QUESTIONS.some(q => q.id === id), id)
  for (const q of QUESTIONS) assert.ok(q.id && q.q && Array.isArray(q.chips))
})

test('short prompts are vague, a sentence with details is not', () => {
  assert.equal(isVague('a bakery site'), true)
  assert.equal(isVague(''), true)
  assert.equal(isVague(SHOWCASES[0].prompt), false)
})

test('the brief carries the locked answers and drops "Surprise me"', () => {
  const b = grillBrief('a bakery site', { name: 'Surprise me', who: 'Locals nearby', must: 'Orders and checkout', look: 'Warm and handmade', win: 'Sales on launch day' })
  assert.match(b, /^a bakery site\n\nLocked with the person/)
  assert.match(b, /- Audience: Locals nearby/)
  assert.match(b, /- Must work on day one: Orders and checkout/)
  assert.doesNotMatch(b, /Surprise me/)
  assert.equal(grillBrief('a bakery site', {}), 'a bakery site')
  // the game interview's questions have no labels: their question text, without the aside
  assert.match(grillBrief('a game', { like: 'Hades' }, QUESTIONS), /- Similar to what: Hades/)
})

test('the Make box builds the same brief as the engine', () => {
  const home = readFileSync(new URL('../web/home.js', import.meta.url), 'utf8')
  assert.match(home, /Locked with the person \(build exactly this\):/)
  assert.match(home, /\/api\/intake/)
  assert.doesNotMatch(home, /title=/)
})
