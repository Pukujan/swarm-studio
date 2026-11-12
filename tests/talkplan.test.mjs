// Talk first (engine/talkplan.mjs, grown from discuss.mjs): a "don't build yet" or a question never starts a build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wordsRead, readIntent, discuss, writeBrief, buildOf, toMessages } from '../engine/talkplan.mjs'

// the owner's own words (run 2026-11-12T03-08-56-302Z): the prompt, then the brief that reached the build
const PROMPT = 'full stack saas app for ticket booking, do u wanna grill me first?'
const ANSWER = 'dont build yet lets talk about specifications, i need an air booking api or something?'
const BRIEF = `${PROMPT.replace(/\?$/, '')}? Accounts: Email sign-in. The admin sees: booking orders members operations. ${ANSWER}`

test('the owner\'s prompt, answer and brief all read as talk from the words alone', () => {
  assert.equal(wordsRead(PROMPT), 'talk')
  assert.equal(wordsRead(ANSWER), 'talk')
  assert.equal(wordsRead(BRIEF), 'talk')
  assert.equal(wordsRead('i asked it not to develop yet and have discussion with me'), 'talk')
  for (const t of ["let's talk first", 'discuss it before you build', 'just plan', 'hold off for now', 'ask me a few questions first']) assert.equal(wordsRead(t), 'talk', t)
})

test('design words and plain briefs are not stops', () => {
  for (const t of ["a bakery site, don't make the header sticky", 'landing page for a no-code tool', 'a form so customers can ask me questions', 'Email sign-in', 'a site for my band'])
    assert.equal(wordsRead(t), 'build', t)
  assert.equal(wordsRead('can you make a bakery site?'), 'unsure')
})

test('a clear stop is talk even when the model says build; the model decides the rest', async () => {
  const says = word => async () => word
  assert.deepEqual(await readIntent({ text: BRIEF, kind: 'app', chat: says('build') }), { intent: 'talk', by: 'words' })
  assert.deepEqual(await readIntent({ text: 'which flight APIs could this use?', kind: 'app', chat: says('talk') }), { intent: 'talk', by: 'model' })
  assert.deepEqual(await readIntent({ text: 'can you make a bakery site?', chat: says('Build.') }), { intent: 'build', by: 'model' })
  assert.deepEqual(await readIntent({ text: 'hmm', chat: says('unsure') }), { intent: 'unsure', by: 'model' })
  // no model, or a model that fails: the words decide
  assert.deepEqual(await readIntent({ text: 'can you make a bakery site?' }), { intent: 'unsure', by: 'words' })
  assert.deepEqual(await readIntent({ text: 'a site for my band', chat: async () => { throw new Error('down') } }), { intent: 'build', by: 'words' })
})

test('the model reads an answer with the question it answers', async () => {
  let sent = null
  await readIntent({ text: 'which sign-in providers are there', answerTo: 'How do people sign in?', kind: 'app', chat: async m => { sent = m; return 'talk' } })
  assert.match(sent[1].content, /answering the question "How do people sign in\?"/)
  assert.match(sent[0].content, /web apps/)
})

test('a talk answers and never builds until the person says build', async () => {
  let sent = null
  const r = await discuss({ said: [{ who: 'you', text: BRIEF }], kind: 'app', chat: async m => { sent = m; return 'For flights, **Duffel** and Amadeus are the usual APIs. Who books: travellers or agents?' } })
  assert.deepEqual(Object.keys(r), ['reply'])
  assert.doesNotMatch(r.reply, /\*\*/)
  assert.match(sent[0].content, /nothing is being built/)
  assert.equal(sent.at(-1).role, 'user')
  // the person says build: the brief comes back to be shown, not a build
  const b = await discuss({ said: [{ who: 'you', text: BRIEF }, { who: 'hermia', text: 'Duffel or Amadeus.' }, { who: 'you', text: 'ok build it with Duffel' }], kind: 'app', chat: async () => '{"build": true, "brief": "A flight booking app on Duffel for travellers, with email sign-in and an admin for orders."}' })
  assert.deepEqual(b, { brief: 'A flight booking app on Duffel for travellers, with email sign-in and an admin for orders.' })
  await assert.rejects(discuss({ said: [{ who: 'hermia', text: 'hi' }], chat: async () => 'x' }))
})

test('the Build button writes a brief from the talk, not the talk itself', async () => {
  let sent = null
  const r = await writeBrief({ said: [{ who: 'you', text: BRIEF }, { who: 'hermia', text: 'Duffel works.' }], kind: 'app', chat: async m => { sent = m; return 'Brief: SkyLedger, a flight booking app for travellers.' } })
  assert.deepEqual(r, { brief: 'SkyLedger, a flight booking app for travellers.' })
  assert.match(sent[1].content, /^Person: full stack saas app/)
  assert.match(sent[0].content, /No instructions to the crew about talking or waiting/)
})

test('helpers: the JSON build reply and the message list', () => {
  assert.equal(buildOf('{"build": false}'), null)
  assert.equal(buildOf('sure {"build": true, "brief": "x"}'), 'x')
  assert.equal(buildOf('no json'), null)
  const m = toMessages(Array.from({ length: 30 }, (_, i) => ({ who: i % 2 ? 'hermia' : 'you', text: `m${i}` })))
  assert.equal(m.length, 24)
  assert.deepEqual(m.at(-1), { role: 'assistant', content: 'm29' })
})

test('the web side: Make box, answers, the brief step and both docks go through the talk check', () => {
  const home = readFileSync(new URL('../web/home.js', import.meta.url), 'utf8')
  const canvas = readFileSync(new URL('../web/canvas.js', import.meta.url), 'utf8')
  const project = readFileSync(new URL('../web/project.js', import.meta.url), 'utf8')
  // the Make box reads the prompt before the question (spec 37), and the reading pre-selects Studio first
  // or Build now: "let's talk first" or a vague idea leans Studio
  assert.match(home, /const read = [^\n]*sw\.readTalk\(text, '', guideKind\(\)\)[^\n]*\n\s*askStart\(text, modeOf\(make\.k\) \|\| \(studioFits\(text, read\) \? 'studio' : 'now'\)\)/)
  assert.match(home, /if \(make\.k === 'game' \|\| read === 'talk'\) return true/)
  assert.match(home, /<span>Studio first<\/span>[\s\S]*<span>Build now<\/span>/)
  // an answer typed in your own words is checked before it becomes brief text (Next and Just build)
  assert.equal((home.match(/if \(await answerTalks\(v, q\)\) return/g) || []).length, 2)
  // the brief step has Keep talking beside Build
  assert.match(home, /data-talk>Keep talking<\/button><button type="button" class="btn pri" data-go>/)
  // a talk in the deck builds only from its brief card's Build
  assert.match(canvas, /if \(talk\.on\) \{ skip\(\); if \(talk\.busy\) return; els\.brief\.value = ''; talkSay\(brief\); return \}/)
  assert.match(canvas, /els\.brief\.placeholder = 'Tell Hermia…'; dockBtn\.textContent = 'Send'/)
  // the brief's buttons: Build (or, inside a project, New project / Start over with Add here), then Keep talking
  assert.match(canvas, /<button class="primary" data-go="add">Build<\/button>/)
  assert.match(canvas, /\$\{acts\}\$\{sheetHtml\}<button data-more>Keep talking<\/button>/)
  assert.match(project, /const read = [^\n]*sw\.readTalk\(text\)\n\s*if \(read === 'build'\) return send\(text\)/)
})

test('hermes swarm, /swarm auto and swarm_design refuse a talk-first brief', () => {
  const launcher = readFileSync(new URL('../launcher.py', import.meta.url), 'utf8')
  const init = readFileSync(new URL('../__init__.py', import.meta.url), 'utf8')
  const commands = readFileSync(new URL('../commands.py', import.meta.url), 'utf8')
  assert.match(launcher, /if not force and talk_first\(brief\):\n\s*return \{"running": True, "talk": True, "error": TALK_FIRST/)
  assert.match(init, /if started\.get\("talk"\):/)
  assert.match(init, /--build/)
  assert.match(commands, /if launcher\.talk_first\(prompt\):/)
})

// ===================== the plan is a conversation (docs/specs/27-plan-conversation.md) =====================
import { mkdtempSync, rmSync, existsSync as there } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { say, lock, unlock, planInput, draftOf, wordsDecide, openQuestions, readTurn, startsOf, startText, startTurn } from '../engine/talkplan.mjs'
import { newChat, chatStore } from '../engine/chats.mjs'
import { planPrice, planFromAnswers } from '../engine/plan.mjs'
import { planRoutes } from '../server/plans.mjs'
import { talkRoutes } from '../server/talk.mjs'

// the owner's words (plan p-3fa117afac), then the worked example's answers
const ANTS = 'a tiny game called army of ants , rts game in godots'
const ANTS_TALK = ['the browser for now, godot later', 'waves', '2d, and no guns, they bite']
const NO_GODOT = { godot: false }
const talkAnts = async (opts = {}) => {
  const chat = newChat({ kind: 'game' })
  const turns = []
  for (const said of [ANTS, ...ANTS_TALK]) turns.push(await say(chat, { said }, { env: NO_GODOT, ...opts }))
  return { chat, turns }
}

test('the ants talk: the planner asks only what the idea leaves open, then the spec in plain words', async () => {
  const { chat, turns } = await talkAnts()
  // read back, then the one open thing about the engine: Godot asked for and not installed
  assert.match(turns[0].text, /^Army of Ants: a tiny real-time strategy \(RTS\) game for Godot 4\. Godot 4 is not installed/)
  assert.deepEqual(turns[0].options.map(o => o.id), ['engine:godot', 'engine:web'])
  // never asked again: the genre, the size, the title (the idea said them)
  const asked = turns.flatMap(t => (t.options || []).map(o => o.id.split(':')[0]))
  for (const k of ['family', 'size', 'title']) assert.ok(!asked.includes(k), k)
  assert.equal(turns[1].text, 'How do the fights come?')
  assert.match(turns[1].options[0].why, /recommended/)
  // the art question says what each way costs: 2D is pictures and no credits, 3D is Meshy credits
  assert.equal(turns[2].text, 'Drawn or modelled?')
  assert.match(turns[2].options[0].why, /^about \d+ pictures, no credits \(recommended for tiny\)$/)
  assert.match(turns[2].options[1].why, /Meshy credits/)
  // the spec: Lock and Keep talking
  assert.deepEqual(turns[3].options.map(o => o.id), ['lock', 'talk'])
  assert.match(turns[3].text, /Army of Ants: a tiny real-time strategy \(RTS\) game for the browser\./)
  assert.match(turns[3].text, /Ant worker/)
  assert.equal(chat.state, 'open')
  assert.equal(chat.spec.cost.credits, 0)
  // every decision the person made is theirs
  for (const k of ['family', 'size', 'title', 'engine', 'enemies', 'art', 'combat']) assert.equal(chat.decisions[k].by, 'person', k)
  assert.deepEqual(Object.fromEntries(['family', 'size', 'engine', 'art', 'title'].map(k => [k, chat.decisions[k].value])), { family: 'rts', size: 'tiny', engine: 'web', art: '2d', title: 'Army of Ants' })
})

test('each decision lands on the plan: RTS cards, tiny, 2D, the browser, no guns, zero Meshy credits', async () => {
  const { chat } = await talkAnts()
  lock(chat, { env: NO_GODOT, now: 5 })
  assert.equal(chat.state, 'locked')
  assert.equal(chat.spec.lockedAt, 5)
  const plan = draftOf(chat, NO_GODOT)
  assert.equal(plan.title, 'Army of Ants')
  assert.deepEqual([plan.shape.family, plan.shape.size, plan.shape.art, plan.engine.target], ['rts', 'tiny', '2d', 'web'])
  assert.ok(plan.cards.some(c => c.name === 'Units') && !plan.cards.some(c => c.name === 'Cast'))
  assert.equal(planPrice(plan).credits, 0)
  assert.ok(!/pistol|rifle|\bgun/i.test(JSON.stringify(plan.cards.filter(c => c.id !== 'systems')).replace(/No guns/g, '')))
  assert.ok(plan.art.sprites.length > 0)
})

test('Open and Locked: only a locked spec builds, and changing a decision unlocks it', async () => {
  const chat = newChat({ kind: 'game' })
  await say(chat, { said: ANTS }, { env: NO_GODOT })
  assert.throws(() => lock(chat, { env: NO_GODOT }), /still open: engine/)
  const { chat: done } = await talkAnts()
  lock(done, { env: NO_GODOT })
  const t = await say(done, { said: 'make it 3d' }, { env: NO_GODOT })
  assert.equal(done.state, 'open')
  assert.equal(done.spec.lockedAt, null)
  assert.equal(done.decisions.art.value, '3d')
  assert.match(t.text, /3D models/)
  assert.ok(draftOf(done, NO_GODOT).shape.art === '3d' && planPrice(draftOf(done, NO_GODOT)).credits > 0)
  unlock(done)
  assert.equal(done.state, 'open')
})

test('a chip picked is the person\'s decision; Keep talking asks what should change', async () => {
  const chat = newChat({ kind: 'game' })
  await say(chat, { said: ANTS }, { env: NO_GODOT })
  await say(chat, { pick: 'engine:godot' }, { env: NO_GODOT })
  assert.deepEqual([chat.decisions.engine.value, chat.decisions.engine.by], ['godot', 'person'])
  assert.equal(chat.turns.at(-2).text, 'Godot (install it first)')
  assert.equal(planInput(chat).note, '')
  await say(chat, { pick: 'enemies:Endless waves' }, { env: NO_GODOT })
  await say(chat, { pick: 'art:2d' }, { env: NO_GODOT })
  const back = await say(chat, { pick: 'talk' }, { env: NO_GODOT })
  assert.match(back.text, /What should change/)
})

test('either side leads: "you decide" lets the planner take its recommendations', async () => {
  const chat = newChat({ kind: 'game' })
  await say(chat, { said: ANTS }, { env: NO_GODOT })
  const t = await say(chat, { said: 'you decide' }, { env: NO_GODOT })
  assert.equal(chat.lead, 'planner')
  assert.deepEqual(t.options.map(o => o.id), ['lock', 'talk'])
  assert.equal(chat.decisions.art.value, '2d')
  assert.equal(chat.decisions.art.by, 'planner')
  // the person's own decisions stay theirs
  assert.equal(chat.decisions.family.by, 'person')
})

test('a scripted planner: answers a question, never overrides the person, and its options are validated', async () => {
  const calls = []
  const model = async messages => {
    calls.push(messages)
    const last = messages[1].content
    if (/fog of war\?/.test(last)) return JSON.stringify({ say: 'Fog of war hides the map you have not scouted.', decide: { family: 'puzzle', money: 'Free' }, ask: null })
    return JSON.stringify({ say: '', decide: { art: '3d' }, ask: { key: 'art', text: 'Drawn or modelled?', options: [{ value: '2D', label: '2D sprites', why: 'cheap' }, { value: 'clay', label: 'Clay', why: 'no' }] } })
  }
  const chat = newChat({ kind: 'game' })
  await say(chat, { said: `${ANTS}, 2d` }, { env: NO_GODOT, model })
  // the planner's "art: 3d" never beats the person's "2d"; one valid option is not a question
  assert.equal(chat.decisions.art.value, '2d')
  const t = await say(chat, { said: 'what is fog of war?' }, { env: NO_GODOT, model })
  assert.match(t.text, /^Fog of war hides the map/)
  assert.equal(chat.decisions.family.value, 'rts')
  assert.equal(chat.decisions.money.by, 'planner')
  assert.match(calls[0][1].content, /Godot installed: no/)
  assert.deepEqual(readTurn('no json'), null)
  assert.equal(readTurn(JSON.stringify({ say: 'x', decide: { engine: 'cryengine', size: 'TINY' } })).decide.size, 'tiny')
})

test('the words decide only what they say', () => {
  assert.deepEqual(wordsDecide('the browser for now, godot later'), { engine: 'web' })
  assert.deepEqual(wordsDecide('waves'), { enemies: 'Endless waves' })
  assert.equal(wordsDecide('2d, and no guns, they bite').art, '2d')
  assert.match(wordsDecide('2d, and no guns, they bite').combat, /No guns/)
  assert.deepEqual(wordsDecide('ok'), {})
  // a platformer, a puzzle and a card game ask nothing about engines they did not name
  for (const idea of ['a small platformer about a fox', 'a puzzle game with falling blocks', 'a card game about witches']) {
    const chat = newChat({ kind: 'game' })
    chat.turns.push({ id: 't1', who: 'person', text: idea })
    Object.assign(chat.decisions, Object.fromEntries(Object.entries(wordsDecide(idea)).map(([k, v]) => [k, { value: v, by: 'person' }])))
    assert.ok(!openQuestions(chat, NO_GODOT).some(q => q.key === 'engine' || q.key === 'family'), idea)
  }
})

test('forced decisions win over the idea\'s words in the plan', () => {
  const p = planFromAnswers({ idea: ANTS, force: { engine: 'web', size: 'big', art: '3d' } }, NO_GODOT)
  assert.deepEqual([p.shape.family, p.shape.size, p.shape.art, p.engine.target], ['rts', 'big', '3d', 'web'])
})

test('the chat store: c- ids, one write at a time, a tmp file renamed into place', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chats-'))
  try {
    const store = chatStore(dir)
    const c = store.create({ kind: 'game' })
    assert.match(c.id, /^c-[0-9a-f]{10}$/)
    assert.equal(c.category, 'Game')
    await Promise.all(Array.from({ length: 5 }, (_, i) => store.update(c.id, async chat => { await new Promise(r => setTimeout(r, 5 - i)); chat.turns.push({ id: `t${chat.turns.length + 1}` }) })))
    assert.deepEqual(store.get(c.id).turns.map(t => t.id), ['t1', 't2', 't3', 't4', 't5'])
    assert.ok(!there(join(dir, 'chats', c.id, 'chat.json.tmp')))
    assert.equal(store.listLoose().length, 1)
    await assert.rejects(store.update('c-nope', () => {}), /bad chat id/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('/api/talk: the ants talk over HTTP, locked into a plan; locking again re-plans the same plan', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talk-'))
  const plans = planRoutes({ dataDir: dir, godot: () => false })
  const talks = talkRoutes({ dataDir: dir, plans, env: () => NO_GODOT })
  const srv = createServer((req, res) => { const url = new URL(req.url, 'http://x'); if (!plans(req, res, url) && !talks(req, res, url)) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const post = (path, body) => fetch(base + path, { method: 'POST', body: JSON.stringify(body || {}) }).then(async r => ({ status: r.status, data: await r.json() }))
  try {
    const first = await post('/api/talk', { kind: 'game', said: ANTS })
    const id = first.data.chat.id
    assert.match(first.data.turn.text, /Godot 4 is not installed/)
    assert.equal((await post(`/api/talk/${id}/lock`)).status, 409)
    for (const said of ANTS_TALK) assert.equal((await post(`/api/talk/${id}`, { said })).status, 200)
    const locked = await post(`/api/talk/${id}/lock`)
    assert.equal(locked.status, 200)
    const plan = locked.data.plan
    assert.deepEqual([plan.title, plan.shape.family, plan.shape.art, plan.price.credits], ['Army of Ants', 'rts', '2d', 0])
    assert.equal(locked.data.chat.plan, plan.id)
    assert.equal(locked.data.chat.state, 'locked')
    // the planner says where to start: the ants' units or map, never character creation
    assert.match(locked.data.turn.text, /begin with the units/)
    // (tiny: the board has two sheets, units and buildings, so no map sheet to open)
    assert.deepEqual(locked.data.starts.map(o => o.id), ['start:units', 'start:design', 'start:slice'])
    // the chat survives: read back from disk, with the parts to work on next
    const back = await fetch(`${base}/api/talk/${id}`).then(r => r.json())
    assert.equal(back.chat.turns.length, 9)
    assert.deepEqual(back.starts.map(o => o.focus), ['sheet:units', 'cards', 'mock:battle'])
    // change a decision, lock again: the same plan id, re-planned
    await post(`/api/talk/${id}`, { said: 'make it 3d' })
    const again = await post(`/api/talk/${id}/lock`)
    assert.equal(again.data.plan.id, plan.id)
    assert.equal(again.data.plan.shape.art, '3d')
    assert.ok(again.data.plan.price.credits > 0)
    const list = await fetch(`${base}/api/talk`).then(r => r.json())
    assert.equal(list.chats[0].plan, plan.id)
    assert.equal((await fetch(`${base}/api/talk/c-0000000000`)).status, 404)
  } finally { srv.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('nothing changed: a question after the spec gets an answer, not the spec again', async () => {
  const { chat } = await talkAnts()
  const offline = await say(chat, { said: 'what is fog of war?' }, { env: NO_GODOT })
  assert.match(offline.text, /A planner model answers questions/)
  assert.deepEqual(offline.options.map(o => o.id), ['lock', 'talk'])
  lock(chat, { env: NO_GODOT })
  const model = async () => JSON.stringify({ say: 'Fog of war hides what your ants have not seen.', decide: {}, ask: null })
  const t = await say(chat, { said: 'what is fog of war?' }, { env: NO_GODOT, model })
  assert.equal(t.text, 'Fog of war hides what your ants have not seen.')
  assert.equal(t.options, undefined)
  assert.equal(chat.state, 'locked')
})

test('the web side: a game idea opens the talk beside a draft board, and Lock is the chat\'s', () => {
  const read = f => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8')
  assert.match(read('home.js'), /make\.k === 'game' && !hosted\(\)\) \{ closePop\(\); input\.value = ''; return C\.talkGame\(\{ text \}\) \}/)
  assert.match(read('home.js'), /chat\.kind === 'game'\) return C\.talkGame\(/)
  const canvas = read('canvas.js')
  assert.match(canvas, /if \(talk\.kind === 'game'\) return gameSay\(\{ said: text \}\)/)
  assert.match(canvas, /talkPost\('\/api\/talk', \{ kind: 'game', said \}\)/)
  assert.match(canvas, /\/lock`\)/)
  assert.match(canvas, /<small>\$\{esc\(o\.why\)\}<\/small>/, 'the trade-off is the second line')
  const plan = read('plan.js')
  assert.match(plan, /primary\.onclick = \(\) => \(P\.draft \? sw\.talk\?\.lock\?\.\(\) : gate\(\)\)/)
  assert.match(plan, /bd\.inspector\(!P\.draft && /, 'a draft has no inspector')
  assert.match(read('studio.js'), /C\.talkGame = /)
})

test('where to start: the parts fit the game, each with a reason, and what is painted drops out', () => {
  const plan = f => planFromAnswers({ idea: 'an army of ants', answers: {}, force: { family: f, art: '2d', engine: 'web' } })
  const ants = plan('rts')
  const starts = startsOf(ants)
  assert.deepEqual(starts.map(o => o.label), ['Units', 'The map', 'Overall design', 'A tiny playable slice'])
  assert.ok(starts.every(o => o.why && o.focus))
  assert.ok(!starts.some(o => /character/i.test(o.label + o.why)), 'an RTS never starts with character creation')
  assert.match(startText(starts), /^Where to start\? I would begin with the units: /)
  assert.equal(startsOf(plan('platformer'))[0].focus, 'sheet:cast')
  assert.deepEqual(startsOf(plan('puzzle')).slice(0, 2).map(o => o.focus), ['sheet:pieces', 'sheet:board'])
  // the units sheet painted: the map comes first now
  ants.sheets = [{ kind: 'units', state: 'done' }]
  assert.match(startText(startsOf(ants)), /begin with the map: /)
  // all painted: the design is left
  ants.sheets.push({ kind: 'terrain', state: 'done' })
  ants.mocks = [{ shot: 'battle', state: 'done' }]
  assert.deepEqual(startsOf(ants).map(o => o.id), ['start:design'])
  const chat = newChat({ kind: 'game' })
  const turn = startTurn(chat, plan('rts'))
  assert.equal(chat.turns.at(-1), turn)
  assert.equal(turn.who, 'planner')
  assert.equal(turn.options[0].id, 'start:units')
  const canvas = readFileSync(new URL('../web/canvas.js', import.meta.url), 'utf8')
  const studio = readFileSync(new URL('../web/studio.js', import.meta.url), 'utf8')
  assert.match(canvas, /o\.id\.startsWith\('start:'\)\) return gameStart/)
  assert.match(studio, /C\.planView\.select\(select\)/)
  assert.match(studio, /C\.planView\.focus\(focus\)/)
})
