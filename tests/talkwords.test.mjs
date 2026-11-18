// The person's words become the action they mean, and the buttons under the answer come from what they said
// (owner, 2026-11-17; EVIDENCE.md failure 2). In the Rank Juggler chat, five messages in a row became no action at
// all — `pick=None` in the chat file — and the planner narrated them instead:
//
//     47  "i need better mocks please"     pick=None
//     49  "do it pls"                       pick=None
//     51  "theyre not being repainted"      pick=None
//     53  "no rebuild the mocks first"      pick=None
//
// `actionOf()` in server/talk.mjs read only `pick === 'lock'`, `pick.startsWith('do:')` and the narrow goWords()
// list, and "do it pls" fails that list on the "pls". Every message here is that chat's, verbatim. What the person
// meant was the mock screens repainted; the answer has to be the plan's true state with the action that would run,
// or the action itself when they ordered it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planRoutes } from '../server/plans.mjs'
import { planPrice } from '../engine/plan.mjs'
import { talkRoutes, readWords, orderOf, claimOf } from '../server/talk.mjs'

const FIX = fileURLToPath(new URL('./fixtures/rank-juggler/', import.meta.url))
const PLAN = 'p-44c1061860', CHAT = 'c-a081ad00b5'
const fixPlan = () => JSON.parse(readFileSync(join(FIX, 'plans', `${PLAN}.json`), 'utf8'))
// the night's plan asked for three mock screens (its `art.shots`), and the chat painted two of them
const SHOTS = ['combat', 'boss', 'ult']

// That night's plan once the chat had painted through it, as the four messages above found it: locked at the price
// the board showed, the look locked, both sheets picked, the six close-ups painted, two of the three mock screens
// painted and the backdrops painted. Nothing is invented: each list is the fixture plan's own, filled the way the
// night's plan file (plans/p-44c1061860.json, 2026-11-17) had it, and the two mocks left the same 1 picture short
// the chat's own step said ("Next: the mock screens from your picks, 1 picture").
function painted(plan0) {
  const plan = structuredClone(plan0)
  const stages = Number(plan.settings?.stages ?? 3), per = Number(plan.settings?.backdropsPerStage ?? 3)
  const name = '2D pixel sprites on a magenta key'
  Object.assign(plan, {
    // the gate is locked by the board's own route once the plan is written (talk() below), at the price the board
    // shows: the price is the plan's, so it is never made up here
    gate: { ...plan0.gate },
    style: { name, locked: true, refs: [], picks: 'cast 2 (Hero 2), 8, 9 (Hero 1); weapons 8, 12, 18' },
    engine: { target: 'godot', label: 'Godot 4', asked: true, installed: false },
    art: { ...plan0.art, shots: SHOTS.map(s => [s, s]) },
    sheets: [
      { ...plan0.sheets[0], kind: 'cast', state: 'done', picks: [1, 5, 9], notes: { 1: 'Hero 1', 5: 'Hero 2', 9: 'Hero 3' }, src: `/plans/${PLAN}/${plan0.sheets[0].file}` },
      { id: 's-weapons', kind: 'weapons', grid: [5, 4], picks: [7, 11, 17], notes: {}, state: 'done', file: 's-weapons.png', src: `/plans/${PLAN}/s-weapons.png` }
    ],
    mocks: SHOTS.map((shot, i) => ({ id: `m-${shot}`, shot, prompt: `an in-game screenshot: the ${shot} screen`, state: i < 2 ? 'done' : 'none', started: i < 2 ? 1794909031263 + i : null, error: null, ...(i < 2 ? { file: `m-${shot}.png`, src: `/plans/${PLAN}/m-${shot}.png`, model: 'ckff/gpt-image-2.5' } : {}) })),
    backdrops: Array.from({ length: stages * per }, (_, i) => ({ id: `b${i}`, stage: Math.floor(i / per), n: (i % per) + 1, name: 'arena rooftops at dusk', shape: i % per ? 'strip' : 'equirect', state: 'done', file: `b${i}.png`, src: `/plans/${PLAN}/b${i}.png` })),
    build: { ...plan0.build, characters: ['Hero 1', 'Hero 2', 'Hero 3'].map((hero, i) => ({ name: hero, slug: hero.toLowerCase().replace(' ', '-'), state: 'done', cutin: { id: `c${i}`, state: 'done', file: `c${i}.png`, src: `/plans/${PLAN}/c${i}.png` }, portrait: { id: `f${i}`, state: 'done', file: `f${i}.png`, src: `/plans/${PLAN}/f${i}.png` } })) }
  })
  return plan
}
// the plan with nothing painted of a part: the same plan, that part's list emptied
const without = (part, list = []) => { const plan = painted(fixPlan()); plan[part] = list; return plan }

// a server on that plan: the planner answering as that night's chat answered ("Repainting the mocks so they read as
// fast side-view arena combat"), and a stand-in painter that lands a tiny picture at once
// godot: whether Godot is on this computer (the night's answer was "Install Godot 4", so the chat kept chat.godot)
async function talk({ godot = false, painter = true, plan = painted(fixPlan()) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'words-'))
  cpSync(FIX, dir, { recursive: true })
  writeFileSync(join(dir, 'plans', `${PLAN}.json`), JSON.stringify(plan))
  const png = join(dir, 'tiny.png')
  writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'))
  const paint = Object.assign(async () => ({ ok: true, path: png, model: 'stand-in' }), { ready: async () => painter })
  const plans = planRoutes({ dataDir: dir, paint, godot: () => godot })
  // the plan is locked by the board's own route, at the board's own price (the price the chat's Lock shows), so
  // nothing about it is invented for the test
  if (!plan.gate?.locked) await plans.act(PLAN, 'lock', { credits: planPrice(plan).credits })
  // the fixture's chat stops before the plan exists; this is that chat once its plan is locked and painted
  const chatPath = join(dir, 'chats', CHAT, 'chat.json')
  const base = JSON.parse(readFileSync(chatPath, 'utf8'))
  writeFileSync(chatPath, JSON.stringify({
    ...base, state: 'locked', godot: 'install',
    turns: [
      { id: 't1', who: 'person', text: 'thinking of a cool godot 4 game with pixelated characters and fighters', at: 1, refs: [], marks: [], layers: [] },
      { id: 't2', who: 'planner', text: 'Rank Juggler: side-view fast arena combat with launcher or air juggles and a rank meter.', at: 2, options: [{ id: 'lock', label: 'Lock · 21 pictures' }], refs: [], marks: [], layers: [] }
    ]
  }))
  const model = async () => JSON.stringify({ say: 'Repainting the mocks so they read as fast side-view arena combat with juggled enemies and a rank meter.', decide: {}, ask: null })
  const talks = talkRoutes({ dataDir: dir, plans, env: () => ({ godot }), model: () => model })
  const srv = createServer((req, res) => { const url = new URL(req.url, 'http://x'); if (!plans(req, res, url) && !talks(req, res, url)) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const at = `http://127.0.0.1:${srv.address().port}`
  const post = (b, path = '') => fetch(`${at}/api/talk/${CHAT}${path}`, { method: 'POST', body: JSON.stringify(b) }).then(r => r.json())
  const get = () => fetch(`${at}/api/talk/${CHAT}`).then(r => r.json())
  const planFile = () => JSON.parse(readFileSync(join(dir, 'plans', `${PLAN}.json`), 'utf8'))
  const chatFile = () => JSON.parse(readFileSync(chatPath, 'utf8'))
  return { post, get, planFile, chatFile, plans, close: () => { srv.close(); rmSync(dir, { recursive: true, force: true }) } }
}
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 20)) } }
const ids = j => (j.turn?.options || []).map(o => o.id)
const painting = plan => plan.mocks.filter(m => m.state === 'painting').length

// ---------- the words on their own: that night's four messages, and every other way a person says the same thing
test('the night\'s four messages read as what the person meant: the mocks, the order, a claim to check', () => {
  // 47 "i need better mocks please": the words name the part, not an order
  assert.deepEqual(readWords('i need better mocks please').parts, ['mock'])
  assert.equal(readWords('i need better mocks please').order, false)
  // 49 "do it pls": the order, with the courtesy on it (goWords fails on the "pls")
  assert.ok(orderOf('do it pls'))
  // 51 "theyre not being repainted": a claim about what has not happened, to be checked against the plan
  assert.equal(claimOf('theyre not being repainted'), 'notdone')
  // 53 "no rebuild the mocks first": the no, then the order, on the part they named
  assert.deepEqual(readWords('no rebuild the mocks first'), { order: true, parts: ['mock'], claim: null, again: true, wish: false })
})

test('every way a person says "do it" is the order, and the words that are not the order still are not', () => {
  for (const said of ['do it', 'do it pls', 'do it please', 'yes do that', 'yes, do that please', 'go ahead', 'go ahead pls', 'ok do it', 'sure, go ahead', 'yeah do it', 'go for it', 'yes please', 'do it now', 'yes, go on then', 'alright, go ahead']) {
    assert.ok(orderOf(said), `${said} is the order`)
  }
  for (const said of ['do it in 3d', 'what does do it mean?', 'no do not do it', 'why did you do it', 'shall i do it', 'can we do it later', 'what now?', 'hello']) {
    assert.equal(orderOf(said), null, `${said} is not the order`)
  }
})

test('"rebuild / more / better / redo" + a part is that part, whichever part; a message with no part names none', () => {
  for (const said of ['i need better mocks', 'better mocks please', 'repaint the mocks', 'rebuild the mocks first', 'more mocks', 'redo the mocks']) {
    assert.deepEqual(readWords(said).parts, ['mock'], said)
  }
  for (const said of ['better backdrops', 'more backdrops please', 'repaint the backdrops', 'rebuild the backdrops']) {
    assert.deepEqual(readWords(said).parts, ['backdrop'], said)
  }
  for (const said of ['better close-ups', 'redo the close-ups', 'repaint the close-ups']) {
    assert.deepEqual(readWords(said).parts, ['piece'], said)
  }
  for (const said of ['better character art', 'redraw the sprites']) {
    assert.deepEqual(readWords(said).parts, ['piece'], said)
  }
  // two parts in one message are both, in the order they were said
  assert.deepEqual(readWords('repaint the backdrops, and better mocks').parts, ['backdrop', 'mock'])
  // talk is still talk: a question, a wish the plan has no part for, and plain praise name no part
  for (const said of ['what do you think of the arena?', 'i want more visual polish', 'this looks great', 'do it']) {
    assert.deepEqual(readWords(said).parts, [], said)
  }
})

test('a claim that the thing has not happened is recognised however it is said', () => {
  for (const said of ['theyre not being repainted', "they're not being repainted", 'they arent being repainted', 'they are not being repainted', "it's not working", 'its not working', 'it is not working', 'that didnt happen', "that didn't happen", 'nothing happened', 'the mocks are not painted', 'it did not work', "it doesn't work", 'nothing is painting']) {
    assert.equal(claimOf(said), 'notdone', said)
  }
  for (const said of ['repaint the mocks', 'why is that so?', 'it works now', 'the mocks are painted', 'do it']) assert.equal(claimOf(said), null, said)
})

// ---------- that night, message by message, on the plan it really had
test('47 "i need better mocks please": the true state of the mocks, and the button their own sentence implies', async () => {
  const f = await talk()
  try {
    const j = await f.post({ said: 'i need better mocks please' })
    assert.equal(painting(f.planFile()), 0, 'words that are not an order paint nothing')
    // the answer is the plan's real state, not the planner's "Repainting the mocks…"
    assert.match(j.turn.text, /The mock screens: 2 of 3 painted, 1 not painted yet\./)
    assert.doesNotMatch(j.turn.text, /^Repainting/)
    // and the buttons are what their sentence implies first: the mocks, by their own words
    assert.deepEqual(ids(j), ['do:mocks'])
    assert.equal(j.turn.options[0].label, 'Repaint these 2 mocks')
  } finally { f.close() }
})

test('49 "do it pls": the order, and it runs the mocks they were just talking about, not the plan\'s later step', async () => {
  const f = await talk()
  try {
    await f.post({ said: 'i need better mocks please' })
    const j = await f.post({ said: 'do it pls' })
    assert.match(j.turn.text, /^Painting the mock screens now/, 'the mocks they were just talking about, not a later step')
    assert.deepEqual(j.turn.options, [], 'a painting step offers nothing until it lands')
    // the stand-in painter lands each picture at once: every mock screen really was repainted
    await until(() => f.planFile().mocks.length === 3 && f.planFile().mocks.every(m => m.state === 'done'))
  } finally { f.close() }
})

test('51 "theyre not being repainted": checked against the plan, never narrated, and it paints nothing', async () => {
  const f = await talk()
  try {
    const before = f.planFile()
    const j = await f.post({ said: 'theyre not being repainted' })
    assert.deepEqual(f.planFile().mocks, before.mocks, 'a claim paints nothing')
    // the true state of the mocks, said in their own words ("theyre not being repainted": they are not, and here is how
    // far they are)
    assert.match(j.turn.text, /^They are not: 2 of 3 mock screens painted\./)
    // and the action that would really run: their own part again, painted
    assert.deepEqual(ids(j), ['do:mocks'])
    // the same route the plan's own step offered, named by what it will do: the 1 mock screen left to paint
    assert.match(j.turn.options[0].label, /^(Paint the mock screens · 1 picture|Repaint these 2 mocks)/)
  } finally { f.close() }
})

test('53 "no rebuild the mocks first": the no does not stop the order it comes with', async () => {
  const f = await talk()
  try {
    const j = await f.post({ said: 'no rebuild the mocks first' })
    assert.match(j.turn.text, /^Painting the mock screens (again )?now/, 'the order the no comes with is still the order')
    // every mock screen is drawn again: all three of them, in one go (the stand-in painter lands each at once)
    await until(() => f.planFile().mocks.length === 3 && f.planFile().mocks.every(m => m.state === 'done'))
  } finally { f.close() }
})

// ---------- the same words, when the plan has moved on: the claim is false, and the answer says the truth
test('a claim that has come true is said to have come true, with the plan\'s real next step under it', async () => {
  const f = await talk()
  try {
    // 53 first: the mocks are repainted, all three of them
    await f.post({ said: 'no rebuild the mocks first' })
    await until(() => f.planFile().mocks.every(m => m.state === 'done'))
    // now 51, late: they HAVE been repainted
    const j = await f.post({ said: 'theyre not being repainted' })
    assert.match(j.turn.text, /^They are painted now: all 3 mock screens\./)
    assert.match(j.turn.options[0].id, /^(lock|do:)/, 'the plan\'s real next step is still offered')
    // all three are painted, so the one action left on the mocks is drawing them again
    assert.equal(j.turn.options[0].label, 'Repaint these 3 mocks')
    // "its not working" and "that didnt happen" are the same claim, checked the same way
    for (const said of ["it's not working", 'that didnt happen']) {
      const c = await f.post({ said })
      assert.doesNotMatch(c.turn.text, /^Repainting/, `${said}: ${c.turn.text}`)
      assert.ok((c.turn.options || []).length, `${said} offers a real action`)
    }
  } finally { f.close() }
})

// ---------- the buttons are what the person's sentence implies, and each one is a route the server really runs
test('each of the night\'s messages offers a button that is a real action, and its press really runs', async () => {
  for (const said of ['i need better mocks please', 'do it pls', 'theyre not being repainted', 'no rebuild the mocks first']) {
    const f = await talk()
    try {
      const j = await f.post({ said })
      const opts = j.turn.options || []
      for (const o of opts) assert.match(o.id, /^(lock|talk|do:[a-z]+(:[^:]+)*|start:[a-z]+)$/, o.id)
      const mock = opts.find(o => o.id === 'do:mocks')
      if (mock) {
        await f.post({ pick: mock.id })
        assert.ok(f.planFile().mocks.some(m => m.state !== 'none'), `${said}: the mocks button repaints`)
      }
    } finally { f.close() }
  }
})

test('anything the button does can be typed: the words and the press reach the same plan', async () => {
  const typed = await talk()
  const pressed = await talk()
  try {
    const a = await pressed.post({ said: 'i need better mocks please' })
    const mock = a.turn.options.find(o => o.id === 'do:mocks')
    assert.ok(mock, 'the mocks button is offered')
    await pressed.post({ pick: mock.id })
    await until(() => pressed.planFile().mocks.every(m => m.state === 'done'))
    // the button's own words, typed instead
    await typed.post({ said: 'repaint the mocks' })
    await until(() => typed.planFile().mocks.every(m => m.state === 'done'))
    const shape = p => p.mocks.map(m => [m.shot, m.state])
    assert.deepEqual(shape(typed.planFile()), shape(pressed.planFile()))
  } finally { typed.close(); pressed.close() }
})

test('the chat counts backdrops from the World card the board edits, not from a second reading of the settings', async () => {
  // issue #666: the price read the World card then the settings; the chat's own state read only the settings. A plan
  // whose World card had been edited to 5 stages therefore had one price and a different count in the chat. The
  // fixture has both at 3, which is exactly why the disagreement hid: this plan says 5 on the card and 3 in settings,
  // and its 9 painted backdrops are then 9 of 15, not 9 of 9.
  const plan = painted(fixPlan())
  plan.cards = plan.cards.map(c => (c.id === 'world' ? { ...c, body: { ...c.body, stages: '5' } } : c))
  assert.equal(Number(plan.settings.stages), 3, 'the settings still say 3: only the card the person edits moved')
  const f = await talk({ plan })
  try {
    // the same wish the offer test uses: it is the turn that states the part's real count
    const j = await f.post({ said: 'i want better backdrops' })
    assert.match(j.turn.text, /9 of 15 painted, 6 not painted yet/, `the card says 5 stages x 3: ${j.turn.text}`)
  } finally { f.close() }
})

test('a part the plan has not painted yet is offered by its own name, ahead of the plan\'s later step', async () => {
  // the person says "better backdrops" while the mocks still wait on the board: the button they meant is the
  // backdrops', and the plan's own next step (the mocks) is not what their sentence asked for
  const f = await talk({ plan: without('backdrops') })
  try {
    const j = await f.post({ said: 'i want better backdrops' })
    assert.equal((j.turn.options || [])[0].id, 'do:backdrops', JSON.stringify(j.turn.options))
    assert.match(j.turn.text, /The backdrops: nothing painted yet\./)
  } finally { f.close() }
})

test('"go ahead" and "yes do that" (53 style) run the plan\'s real next step, and a plain question is still talk', async () => {
  const f = await talk()
  try {
    const j = await f.post({ said: 'go ahead' })
    assert.match(j.turn.text, /^Painting the mock screens now/, `go ahead: ${j.turn.text}`)
    await until(() => f.planFile().mocks.every(m => m.state === 'done'))
    // a question is not an order: it is answered (the planner's own words, with any claim the plan denies cut), and
    // nothing is painted. The turn ends with the plan's real step, as every turn does.
    const before = f.planFile()
    const q = await f.post({ said: 'what do you think of the arena?' })
    assert.doesNotMatch(q.turn.text, /^Painting|^Repainting/, 'a question starts nothing')
    assert.match(q.turn.text, /\.$/)
    assert.deepEqual(f.planFile().mocks, before.mocks)
    assert.deepEqual(f.planFile().backdrops, before.backdrops)
    assert.deepEqual(f.planFile().gate, before.gate)
  } finally { f.close() }
})

// ---------- the step's line, said once (the sibling honesty stream's engine/gamestep.mjs stepLineFor, wired here)
test('the step\'s line ends the reply once, not on reply after reply, and no reply is left empty', async () => {
  const f = await talk()
  try {
    // the same open step asked about again and again: each turn is answered, and the line ending the last turn is not
    // the whole of the next one (that is the nine identical sentences of turns 46 to 54)
    for (const said of ['i need better mocks please', 'theyre not being repainted', 'its not working', 'that didnt happen', 'what do you think of the arena?']) {
      const j = await f.post({ said })
      assert.ok(j.turn.text.trim(), `${said}: the reply says something`)
    }
    const turns = f.chatFile().turns.filter(t => t.who === 'planner')
    assert.ok(turns.length >= 5)
    // the plan's step sentence does not end two replies in a row: whenever a turn ends on it, the one before it did not
    const step = (await f.get()).step?.text || ''
    if (step) {
      let run = 0, longest = 0
      for (const t of turns) { run = t.text.trim().endsWith(step) ? run + 1 : 0; longest = Math.max(longest, run) }
      assert.equal(longest, 1, `"${step}" ended ${longest} replies in a row`)
    }
  } finally { f.close() }
})
