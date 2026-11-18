// The chat takes the name of what it is building, two chats named the same are told apart, and a decision the
// planner read is said as read (EVIDENCE 2026-11-17, failure 5). The owner, correcting a 55-turn chat titled
// "New game" whose game is called "Rank Juggler": "why is the chat so weird"; and nothing ever asked for that name.
// The record's own shapes here are copies of that chat's file (tests/fixtures/rank-juggler).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chatStore, titleFromBuild, unnamed, distinguish, readsSaid, readLine } from '../engine/chats.mjs'
import { planRoutes } from '../server/plans.mjs'

const FIX = fileURLToPath(new URL('./fixtures/rank-juggler/', import.meta.url))
const PLAN = 'p-44c1061860', CHAT = 'c-a081ad00b5'
const chat0 = () => JSON.parse(readFileSync(join(FIX, 'chats', CHAT, 'chat.json'), 'utf8'))
// a store whose folder holds the night's own chat, as it was written
function nightStore() {
  const dataDir = mkdtempSync(join(tmpdir(), 'chatnaming-'))
  cpSync(join(FIX, 'chats'), join(dataDir, 'chats'), { recursive: true })
  const t = { v: 1_794_909_530_946 }
  const s = chatStore({ dataDir, now: () => t.v })
  return Object.assign(s, { t })
}

test('the chat takes the build\'s name: "New game" is "Rank Juggler" once the plan is named', async () => {
  const s = nightStore()
  const before = s.get(CHAT)
  assert.equal(before.title, 'New game', 'the record says what the owner saw')
  assert.equal(before.titleBy, 'planner')
  // a chat named for its first sentence (never entered by hand: titleBy is the Studio's) follows the plan's name
  const c = s.create({ kind: 'game', text: 'a tiny game. you lead the ant colony and it grows' })
  assert.equal(await s.nameFromBuild(c.id, 'Army of Ants'), true)
  assert.equal(s.get(c.id).title, 'Army of Ants')
  assert.equal(s.get(c.id).titleFrom, 'build')
  // the night's own chat: the same function over its file
  const chat = s.get(CHAT)
  assert.equal(titleFromBuild(chat, 'Rank Juggler'), true)
  assert.equal(chat.title, 'Rank Juggler')
  assert.equal(chat.titleBy, 'planner', 'a name the planner gave stays the planner\'s')
})

test('a chat the person renamed keeps its name; so does one named after a project', async () => {
  const s = nightStore()
  await s.rename(CHAT, 'Fight game for Ana')
  assert.equal(await s.nameFromBuild(CHAT, 'Rank Juggler'), false)
  assert.equal(s.get(CHAT).title, 'Fight game for Ana', 'a name the person typed is never clobbered')
  assert.equal(s.get(CHAT).titleBy, 'person')
  // a name typed on the board is the person's, and the chat takes it
  const c = s.create({ kind: 'site', text: 'a tea shop site' })
  await s.nameFromBuild(c.id, 'Leaf and Kettle', 'given')
  assert.equal(s.get(c.id).title, 'Leaf and Kettle')
  assert.equal(s.get(c.id).titleBy, 'person')
  // and nothing changes when there is no name to take
  assert.equal(await s.nameFromBuild(c.id, 'New game'), false)
  assert.equal(await s.nameFromBuild(c.id, ''), false)
  assert.equal(s.get(c.id).title, 'Leaf and Kettle')
})

test('an old chat file with no title or no titleBy still loads, and takes a name', () => {
  const noTitle = { id: 'c-0000000001', kind: 'game', turns: [] }
  assert.equal(unnamed(noTitle), true)
  assert.equal(titleFromBuild(noTitle, 'Rooftop Signal'), true)
  assert.equal(noTitle.title, 'Rooftop Signal')
  // one the Studio named from the first words said (titleBy the planner, the shape newChat writes)
  const auto = { id: 'c-0000000002', title: 'Tea shop', titleBy: 'planner', turns: [{ who: 'person', text: 'tea shop. more words here' }] }
  assert.equal(titleFromBuild(auto, 'Rank Juggler'), true)
  assert.equal(auto.title, 'Rank Juggler')
  // a title the person typed in a file that kept no titleBy is still theirs
  const typed = { id: 'c-0000000003', title: 'Fight game for Ana', titleBy: 'person', turns: [{ who: 'person', text: 'a tiny ant game' }] }
  assert.equal(titleFromBuild(typed, 'Rank Juggler'), false)
  assert.equal(typed.title, 'Fight game for Ana')
})

test('two chats named the same are told apart in the list; others are untouched', async () => {
  const s = nightStore()
  const t0 = 1_794_712_437_238, t = s.t
  // three loose game chats with one name, the way the owner's two were
  const made = []
  for (let i = 0; i < 3; i++) made.push(s.create({ kind: 'game', title: 'Rooftop Signal' }))
  // four days apart, the way the owner's two were (the store writes `updated` on every write)
  for (const [i, m] of made.entries()) { t.v = t0 + i * 4 * 864e5; await s.update(m.id, () => {}) }
  const c = s.create({ kind: 'site', text: 'a tea shop site' })
  const rows = s.listLoose()
  assert.equal(rows.length, 5, "the night's chat is there too")
  const named = rows.filter(r => r.title.startsWith('Rooftop Signal'))
  assert.equal(named.length, 3)
  assert.equal(new Set(named.map(r => r.title)).size, 3, 'no two rows read the same')
  // every one of them says which day it is (three of one name is not two)
  assert.equal(named.filter(r => / · /.test(r.title)).length, 3)
  assert.equal(new Set(rows.map(r => r.title)).size, rows.length)
  // a row whose name is its own is exactly as it was
  assert.equal(rows.find(r => r.id === c.id).title, s.get(c.id).title)
})

test('distinguish says which one each is: the date, then the time, then what it is building', () => {
  const t = Date.parse('2026-11-14T09:20:00Z')
  const rows = [
    { id: 'c-1', title: 'Rooftop Signal', kind: 'game', updated: t },
    { id: 'c-2', title: 'Rooftop Signal', kind: 'game', updated: t + 8 * 864e5 },
    { id: 'c-3', title: 'Army of Ants', kind: 'game', updated: t }
  ]
  const out = distinguish(rows)
  assert.deepEqual(out.map(r => r.id), ['c-1', 'c-2', 'c-3'], 'order is kept')
  assert.notEqual(out[0].title, out[1].title)
  assert.match(out[0].title, /^Rooftop Signal · \d{1,2} Nov/)
  assert.equal(out[2].title, 'Army of Ants', 'a row whose name is its own is untouched')
  // two chats made the same day: the time tells them apart
  const same = distinguish([{ id: 'c-1', title: 'Same', updated: t }, { id: 'c-2', title: 'Same', updated: t + 36e5 }])
  assert.notEqual(same[0].title, same[1].title)
  assert.match(same[0].title, / · \d{1,2} Nov, \d\d:\d\d$/)
  // a chat with no date at all: what it is building
  const undated = distinguish([{ id: 'c-1', title: 'Same', kind: 'game' }, { id: 'c-2', title: 'Same', kind: 'site' }])
  assert.deepEqual(undated.map(r => r.title), ['Same · a game', 'Same · a site'])
  // an empty list and rows without ids are no reason to throw
  assert.deepEqual(distinguish([]), [])
  assert.deepEqual(distinguish([null, { title: 'x' }, { id: 'c-9', title: 'y' }]).map(r => r.title), ['y'])
})

test('a decision the planner read is said as read, in the turn that decided it, and only then', () => {
  const chat = chat0()
  // With no turn given, every decision the planner read is named: the record says it read three things and the
  // chat said none of them (the live record also read the cast again in t18, "let me confirm the roster").
  const turn = chat.turns.find(t => t.id === 't2')
  assert.doesNotMatch(turn.text, /I read/)
  const shown = readsSaid(turn.text, chat)
  assert.match(shown, /^New game: an action game for Godot 4\./)
  assert.match(shown, /I read that from what you said: .*Cast: Hero 1, Hero 2, Hero 3\./)
  assert.match(shown, /Type it differently and it changes\.$/)
  // one turn at a time: in the turn that read nothing, and where only what that turn read is named
  assert.equal(readsSaid('t4 words.', chat, { turn: 't4' }), 't4 words.')
  assert.match(readsSaid('t4 words.', chat, { turn: 't3' }), /I read that from what you said: Cast: Hero 1, Hero 2, Hero 3\./)
  assert.doesNotMatch(readsSaid('t4 words.', chat, { turn: 't3' }), /Game: action|Combat:|Look:/, 'only what was read in this turn')
  // a decision the person made is not "read": only what the planner read is named
  assert.doesNotMatch(shown, /Art: 2d|Engine: godot/)
  // a turn where nothing new was read gets no line
  const t6 = chat.turns.find(t => t.id === 't6').text
  assert.equal(readsSaid(t6, chat, { turn: 't6' }), t6)
  assert.equal(readsSaid('Plain words.', { decisions: { art: { value: '2d', by: 'person', turn: 't1' } } }, { turn: 't1' }), 'Plain words.')
  // already said: no second line
  assert.equal(readsSaid('I read the cast from what you said.', chat, { turn: 't3' }), 'I read the cast from what you said.')
  // an old chat with no decisions, and a chat with none, are shown as they are
  assert.equal(readsSaid('Hello.', null), 'Hello.')
  assert.equal(readsSaid('Hello.', { turns: [] }), 'Hello.')
  assert.equal(readLine(null), '')
})

test('the whole list the person sees tells the night\'s chats apart', () => {
  const rows = [
    { id: 'c-93478637a5', title: 'Rooftop Signal', kind: 'game', updated: Date.parse('2026-11-14T10:00:00Z') },
    { id: 'c-9fa99f2e93', title: 'Rooftop Signal', kind: 'game', updated: Date.parse('2026-11-16T18:00:00Z') }
  ]
  const out = distinguish(rows).map(r => r.title)
  assert.equal(out.length, 2)
  assert.notEqual(out[0], out[1], 'the owner could not tell these two apart')
  assert.ok(out.every(t => t.startsWith('Rooftop Signal')), 'each keeps its name and says which it is')
})

// The name reaches the chat from the board itself, not only from a call a test makes: a game named on its board
// names the chat that shaped it.
test('naming a plan on its board names its chat too, and a name the person typed is theirs', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'chatnaming-'))
  cpSync(join(FIX, 'chats'), join(dataDir, 'chats'), { recursive: true })
  cpSync(join(FIX, 'plans'), join(dataDir, 'plans'), { recursive: true })
  const chats = chatStore({ dataDir })
  assert.equal(chats.get(CHAT).title, 'New game')
  const handle = planRoutes({ dataDir, titled: (plan, mode) => { const c = chats.ofPlan(plan.id); if (c) chats.nameFromBuild(c.id, plan.title, mode) } })
  const settle = () => new Promise(res => setTimeout(res, 120))
  const srv = createServer((req, res) => { if (!handle(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  try {
    // the plan is already named "Rank Juggler" and its chat is not: the next action on the plan says the name
    const r = await fetch(`${base}/api/plans/${PLAN}/card`, { method: 'POST', body: JSON.stringify({ card: 'story', body: {} }) })
    assert.equal(r.status, 200)
    await settle()
    assert.equal(chats.get(CHAT).title, 'Rank Juggler', 'the chat list now says what the build is called')
    assert.equal(chats.get(CHAT).titleBy, 'planner')
    // a name typed on the board: the chat takes it, and it is the person's
    const t = await fetch(`${base}/api/plans/${PLAN}/title`, { method: 'POST', body: JSON.stringify({ title: 'Rank Juggler II' }) })
    assert.equal(t.status, 200)
    await settle()
    assert.equal(chats.get(CHAT).title, 'Rank Juggler II')
    assert.equal(chats.get(CHAT).titleBy, 'person')
    // and a chat the person renamed is not touched by any of it
    await chats.rename(CHAT, 'Fight game for Ana')
    await fetch(`${base}/api/plans/${PLAN}/card`, { method: 'POST', body: JSON.stringify({ card: 'story', body: {} }) })
    await settle()
    assert.equal(chats.get(CHAT).title, 'Fight game for Ana')
  } finally { await new Promise(r => srv.close(r)) }
})
