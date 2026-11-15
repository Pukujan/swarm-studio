// The planner chat says only what really happened, and every button in it does what its label says (owner,
// 2026-11-14, the game "Rank Juggler": the chat said "Locked" and "roster locked … so I keep painting" while the plan
// was not locked, nothing was picked and nothing painted). The plan and the chat are copies of that night's files
// (tests/fixtures/rank-juggler); the painter is a stand-in that lands a tiny picture, so nothing is spent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planRoutes } from '../server/plans.mjs'
import { talkRoutes } from '../server/talk.mjs'
import { planFacts, nextStep, checkClaims, readPicks, goWords } from '../engine/gamestep.mjs'
import { factsText } from '../engine/talkplan.mjs'

const FIX = fileURLToPath(new URL('./fixtures/rank-juggler/', import.meta.url))
const PLAN = 'p-44c1061860', CHAT = 'c-a081ad00b5'
const plan0 = () => JSON.parse(readFileSync(join(FIX, 'plans', `${PLAN}.json`), 'utf8'))
const chat0 = () => JSON.parse(readFileSync(join(FIX, 'chats', CHAT, 'chat.json'), 'utf8'))
// the lines Hermia said that night that were not true
const SAID = t => chat0().turns.find(x => x.id === t).text

test('the night\'s false lines are cut against the plan file, and true ones stay', () => {
  const f = planFacts(plan0(), { godot: false })
  assert.equal(f.locked, false)
  assert.deepEqual(f.sheets.map(s => [s.kind, s.state, s.picks.length, s.needs]), [['cast', 'done', 0, 3], ['weapons', 'none', 0, 1]])
  assert.deepEqual(f.painting, [])
  for (const t of ['t11', 't13', 't18', 't20']) {
    const { text, cut } = checkClaims(SAID(t), f)
    assert.ok(cut.length, `${t} claims something`)
    assert.doesNotMatch(text, /underway|locked|keep painting|start painting/i, t)
  }
  assert.equal(checkClaims(SAID('t20'), f).text, 'Next thing that matters is how the slice gets built while Godot is missing.')
  // the reverse: a claim that is true is kept
  const painting = { ...f, locked: true, painting: ['the Weapons sketches'] }
  assert.equal(checkClaims('The plan is locked. I am painting the weapons now.', painting).text, 'The plan is locked. I am painting the weapons now.')
  // and the planner is told the truth before it speaks
  assert.match(factsText(f), /NOT locked\. Cast sketch sheet: done, picks none yet; Weapons sketch sheet: not painted\. close-ups: 0 of 6 painted\. Painting now: nothing\./)
})

test('the next step on that plan: Lock at the board\'s price, then Godot, then the picks the sheet waits on', () => {
  const plan = plan0(), chat = chat0()
  let s = nextStep(chat, plan, { godot: false })
  assert.match(s.text, /not locked yet, so nothing paints\. Lock it at about 21 pictures, no credits\./)
  assert.deepEqual(s.options.map(o => [o.id, o.label]), [['lock', 'Lock · 21 pictures'], ['talk', 'Keep talking']])
  plan.gate.locked = true
  s = nextStep(chat, plan, { godot: false })
  assert.equal(s.text, 'Godot 4 is not installed on this computer. Install Godot 4, or is the browser fine?')
  chat.godot = 'web'
  s = nextStep(chat, plan, { godot: false })
  assert.match(s.text, /^The Cast sheet waits on your picks: one number for Hero 1, Hero 2, Hero 3\./)
  assert.equal(s.sheet.id, 's-f16a4558')
  assert.equal(s.options.length, 21)
  assert.equal(s.options[3].id, 'do:cell:s-f16a4558:3:Hero 1')
})

test('typed picks: 1-based numbers on the sheet, each with its hero', () => {
  const sheet = { grid: [5, 4] }
  const cast = ['Hero 1', 'Hero 2', 'Hero 3']
  assert.deepEqual(readPicks('hero 1 is 4, hero 2 is 7, hero 3 is 12', sheet, cast), [{ cell: 3, who: 'Hero 1' }, { cell: 6, who: 'Hero 2' }, { cell: 11, who: 'Hero 3' }])
  assert.deepEqual(readPicks('4, 7 and 12', sheet, cast), [{ cell: 3, who: 'Hero 1' }, { cell: 6, who: 'Hero 2' }, { cell: 11, who: 'Hero 3' }])
  assert.deepEqual(readPicks('hero 1 is 40', sheet, cast), [])
  assert.deepEqual(readPicks('make hero 2 a girl', sheet, cast), [])
  for (const w of ['do it', 'lock', 'go', 'Go on', 'ok, do it!', 'lock it']) assert.ok(goWords(w), w)
  for (const w of ['do it in 3d', 'go faster', 'what now?']) assert.ok(!goWords(w), w)
})

// a server on a copy of that night's data, with a stand-in painter and the planner saying the night's false line
async function night({ model = async () => JSON.stringify({ say: SAID('t20'), decide: {}, ask: null }), godotFound = false, painter = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rank-'))
  cpSync(FIX, dir, { recursive: true })
  const png = join(dir, 'tiny.png')
  writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'))
  let hold = null
  const paint = Object.assign(async () => { if (hold) await hold; return { ok: true, path: png, model: 'stand-in' } }, { ready: async () => painter })
  const plans = planRoutes({ dataDir: dir, paint, godot: () => false })
  const talks = talkRoutes({ dataDir: dir, plans, env: () => ({ godot: false }), godotCheck: () => godotFound, model: () => model })
  const srv = createServer((req, res) => { const url = new URL(req.url, 'http://x'); if (!plans(req, res, url) && !talks(req, res, url)) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const post = (body, path = '') => fetch(`${base}/api/talk/${CHAT}${path}`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json())
  const planFile = () => JSON.parse(readFileSync(join(dir, 'plans', `${PLAN}.json`), 'utf8'))
  const chatFile = () => JSON.parse(readFileSync(join(dir, 'chats', CHAT, 'chat.json'), 'utf8'))
  const step = () => fetch(`${base}/api/talk/${CHAT}`).then(r => r.json()).then(j => j.step)
  return { post, planFile, chatFile, step, holdPaint: p => { hold = p }, close: () => { srv.close(); rmSync(dir, { recursive: true, force: true }) } }
}
const ACTION = /^(lock|talk|do:.+|start:design)$/
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 20)) } }

test('that night, again: "do it" locks the plan, every button does what it says, and the chat says only what happened', async () => {
  const n = await night()
  try {
    // "characters": the planner's false line is cut, and the turn ends with the real next step
    let j = await n.post({ said: 'characters' })
    assert.doesNotMatch(j.turn.text, /roster locked|keep painting/)
    assert.match(j.turn.text, /Lock it at about 21 pictures, no credits\.$/)
    assert.deepEqual(j.turn.options.map(o => o.label), ['Lock · 21 pictures', 'Keep talking'])
    assert.equal(n.planFile().gate.locked, false)

    // "do it": the board's Lock, at the board's price, then the Godot question
    j = await n.post({ said: 'do it' })
    assert.equal(n.planFile().gate.locked, true)
    assert.equal(n.planFile().gate.credits, 0)
    assert.equal(j.chat.state, 'locked')
    assert.equal(j.turn.text, 'Locked at about 21 pictures, no credits. Godot 4 is not installed on this computer. Install Godot 4, or is the browser fine?')
    assert.deepEqual(j.turn.options.map(o => [o.id, o.label]), [['do:godot', 'Install Godot 4'], ['do:browser', 'Browser is fine']])
    assert.equal(n.planFile().sheets.length, 1, 'the lock never re-plans: the cast sheet stays')

    // Install Godot 4: it looks for it, says it is still missing and how to get it
    j = await n.post({ pick: 'do:godot' })
    assert.match(j.turn.text, /still not on this computer/)
    assert.deepEqual(j.turn.options.map(o => o.label), ['Check again', 'Browser is fine'])

    // Browser is fine: the engine switches and the plan stays locked; then the sheet asks for its picks
    j = await n.post({ pick: 'do:browser' })
    assert.equal(n.planFile().engine.target, 'web')
    assert.equal(n.planFile().gate.locked, true)
    assert.match(j.turn.text, /^The game builds for the browser\. The Cast sheet waits on your picks/)
    assert.equal(j.turn.sheet.src, '/plans/p-44c1061860/s-f16a4558.png')

    // a number button picks for Hero 1; typed picks do the rest (and move Hero 1)
    j = await n.post({ pick: 'do:cell:s-f16a4558:3:Hero 1' })
    assert.deepEqual(n.planFile().sheets[0].picks, [3])
    assert.match(j.turn.text, /^Picked 4 for Hero 1\. The Cast sheet waits on your picks: one number for Hero 2, Hero 3\./)
    j = await n.post({ said: 'hero 1 is 5, hero 2 is 7, hero 3 is 12' })
    assert.deepEqual(n.planFile().sheets[0].picks, [4, 6, 11])
    assert.deepEqual(n.planFile().sheets[0].notes, { 4: 'Hero 1', 6: 'Hero 2', 11: 'Hero 3' })
    assert.deepEqual(j.turn.options.map(o => o.id), ['do:sheet:weapons', 'do:skip:weapons'])

    // paint the weapons sheet: it is painting at once, the answer says so, and the chat waits on it
    let release
    n.holdPaint(new Promise(r => { release = r }))
    j = await n.post({ pick: 'do:sheet:weapons' })
    assert.equal(n.planFile().sheets[1].state, 'painting')
    assert.equal(j.turn.wait, true)
    assert.match(j.turn.text, /^Painting the Weapons sketches now/)
    // "go" while it paints does nothing new and says what is painting
    j = await n.post({ said: 'go' })
    assert.match(j.turn.text, /Painting the Weapons sketches now/)
    release()
    await until(async () => n.planFile().sheets[1].state === 'done')
    assert.match((await n.step()).text, /The Weapons sheet waits on your pick/)

    // the weapons pick, then paint: the close-ups are painted for real
    await n.post({ pick: `do:cell:${n.planFile().sheets[1].id}:2` })
    j = await n.post({ said: 'go' })
    assert.equal(j.turn.text.startsWith('Painting'), true, j.turn.text)
    await until(async () => (n.planFile().build.characters || []).length === 3 && n.planFile().build.characters.every(c => c.cutin?.state === 'done' && c.portrait?.state === 'done'))
    assert.match((await n.step()).text, /The close-ups are painted\. Next: the mock screens/)

    // every option the chat offered from here on was an action the server runs, never a planner's made-up choice
    const later = n.chatFile().turns.slice(20).filter(t => t.who === 'planner')
    assert.ok(later.length >= 10)
    for (const t of later) for (const o of t.options || []) assert.match(o.id, ACTION, t.text)
  } finally { n.close() }
})

test('the Lock chip under the spec is the same lock, and a missing painter is said, not hidden', async () => {
  const n = await night()
  try {
    const j = await n.post({ pick: 'lock' })
    assert.equal(n.planFile().gate.locked, true)
    assert.match(j.turn.text, /^Locked at about 21 pictures, no credits\./)
    for (const o of j.turn.options) assert.match(o.id, ACTION)
  } finally { n.close() }
  // no image model signed in: the answer says nothing was painted and why, and the step is still there
  const p = await night({ painter: false })
  try {
    await p.post({ said: 'lock' })
    await p.post({ pick: 'do:browser' })
    await p.post({ said: '4, 7, 12' })
    const j = await p.post({ pick: 'do:sheet:weapons' })
    assert.match(j.turn.text, /^Nothing happened: sign in an image model first\. Next: the Weapons sketch sheet/)
    assert.equal(p.planFile().sheets.length, 1)
  } finally { p.close() }
  // Godot found after all
  const g = await night({ godotFound: true })
  try {
    await g.post({ said: 'lock' })
    const j = await g.post({ said: 'install godot' })
    assert.match(j.turn.text, /^Godot 4 is installed/)
    assert.match(j.turn.text, /The Cast sheet waits on your picks/)
  } finally { g.close() }
})
