// Ask before every build (docs/decisions/0020-ask-before-build.md, engine/askfirst.mjs): the recommendation from the
// person's words, typed answers, the answer in the chat (engine/talkplan.mjs say, offline), and the gate on
// /api/run (server/server.mjs): a new website asks, and builds only once the person answered, a script says
// it is sure, or the build is the next version of one that exists. "Don't build yet" still opens the talk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recommend, readAnswer, askTurn, askedOf, pendingAsk, pickOptions, answered, LONG_BRIEF } from '../engine/askfirst.mjs'
import { say } from '../engine/talkplan.mjs'
import { newChat } from '../engine/chats.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

test('the recommendation comes from the words alone', () => {
  // sure: just make it, no branding, don't ask, a long brief
  for (const t of ['a bakery site, just make it', 'no branding, just generate', 'portfolio site, skip the setup', "a cafe site, don't ask me anything", 'just build a landing page for my app'])
    assert.equal(recommend(t).path, 'all', t)
  assert.equal(recommend(Array.from({ length: LONG_BRIEF }, (_, i) => `word${i}`).join(' ')).path, 'all')
  // help, their own brand, a site to read, a file
  for (const t of ['help me set it up, a site for my yoga studio', 'a site in my brand', 'make it like https://stripe.com', 'a site like this one', 'walk me through it'])
    assert.equal(recommend(t).path, 'steps', t)
  assert.equal(recommend('a site for my shop', { files: 1 }).path, 'steps')
  // anything between
  assert.equal(recommend('a site for a bakery').path, 'pick')
  assert.equal(recommend('').path, 'pick')
  // conflicts, by the stated order: "no branding" is an opt-out, never a brand; an opt-out beats a link; a link beats "just make it"
  assert.equal(recommend('no branding, just generate it').path, 'all')
  assert.equal(recommend('no branding, like https://example.com').path, 'all')
  assert.equal(recommend('just make it like https://stripe.com').path, 'steps')
  assert.equal(recommend('help me, just make it').path, 'steps')
  // every recommendation says why, in a few words
  for (const t of ['just make it', 'help me', 'a site']) assert.ok(recommend(t).why.split(' ').length <= 8)
})

test('the question: three answers, the recommended one first with its reason', () => {
  const q = askTurn('t2', 'a bakery site, just make it')
  assert.equal(q.who, 'planner')
  assert.deepEqual(q.options.map(o => o.id), ['go:all', 'go:steps', 'go:pick'])
  assert.equal(q.options[0].why, 'You said to just make it')
  assert.deepEqual(askTurn('t2', 'help me set it up').options.map(o => o.id), ['go:steps', 'go:all', 'go:pick'])
  assert.deepEqual(askTurn('t2', 'a bakery site').options.map(o => o.id), ['go:pick', 'go:all', 'go:steps'])
  assert.equal(askedOf(q), 'skips')
  assert.equal(askedOf({ options: pickOptions('') }), 'pick')
  assert.equal(askedOf({ options: [{ id: 'lock' }] }), null)
  // Pick steps to skip: the step their words already answer comes first
  assert.equal(pickOptions('pages: home, menu, contact').map(o => o.id)[0], 'go:skip-plan')
  assert.equal(pickOptions('a dark site in pastel colours').map(o => o.id)[0], 'go:skip-brand')
  assert.deepEqual(answered('Home, About and contact'), { brand: false, plan: true })
})

test('typed answers read the same as a pick', () => {
  const cases = {
    'skip all': 'all', 'Build now': 'all', 'just build it': 'all', 'skip both': 'all', 'skip brand and plan': 'all', 'yes': 'all',
    'step by step': 'steps', 'Step-by-step please': 'steps', 'walk me through': 'steps',
    'skip the plan': 'skip-plan', 'no pages': 'skip-plan', 'skip brand': 'skip-brand', 'skip the branding': 'skip-brand',
    'let me pick': 'pick', 'a site for a bakery': null, '': null
  }
  for (const [t, want] of Object.entries(cases)) assert.equal(readAnswer(t), want, t)
  // answering "Which to skip?" with the step's name alone
  assert.equal(readAnswer('brand', 'pick'), 'skip-brand')
  assert.equal(readAnswer('the plan', 'pick'), 'skip-plan')
  assert.equal(readAnswer('both', 'pick'), 'all')
  assert.equal(readAnswer('pick', 'pick'), null)
})

// a site chat as /api/run leaves it: the person's brief, then the planner's question
const asked = brief => {
  const chat = newChat({ kind: 'site' })
  chat.turns.push({ id: 't1', who: 'person', at: 1, text: brief, refs: [], marks: [], layers: [] })
  chat.ask = { brief, at: 1 }
  chat.turns.push(askTurn('t2', brief))
  return chat
}
const noModel = { model: null }

test('say(): a pick answers the question offline and is kept on the chat', async () => {
  const chat = asked('a bakery site')
  assert.equal(pendingAsk(chat), 'skips')
  const turn = await say(chat, { pick: 'go:all' }, noModel)
  assert.deepEqual(turn.go, { path: 'all', skip: ['brand', 'plan'], brief: 'a bakery site' })
  assert.equal(turn.text, 'Building it now.')
  assert.equal(chat.go.path, 'all')
  assert.equal(chat.go.turn, 't3')
  assert.equal(pendingAsk(chat), null)
  // the person's turn says what they picked
  assert.equal(chat.turns.at(-2).text, 'Skip all, build now')
  assert.equal(chat.turns.at(-2).pick, 'go:all')
})

test('say(): Step by step, and Pick steps to skip then Skip Brand', async () => {
  const a = asked('a bakery site')
  const t = await say(a, { pick: 'go:steps' }, noModel)
  assert.equal(t.go.path, 'steps')
  assert.deepEqual(t.go.skip, [])
  const b = asked('a bakery site')
  const q = await say(b, { pick: 'go:pick' }, noModel)
  assert.equal(q.text, 'Which to skip?')
  assert.ok(!b.go, 'not answered yet')
  assert.deepEqual(q.options.map(o => o.id).sort(), ['go:all', 'go:skip-brand', 'go:skip-plan'])
  const done = await say(b, { pick: 'go:skip-brand' }, noModel)
  assert.deepEqual(done.go, { path: 'skip-brand', skip: ['brand'], brief: 'a bakery site' })
  assert.deepEqual(b.go.skip, ['brand'])
})

test('say(): typed answers work the same; anything else asks again; "don\'t build yet" goes to the talk', async () => {
  const a = asked('a bakery site')
  assert.equal((await say(a, { said: 'skip the plan' }, noModel)).go.path, 'skip-plan')
  const b = asked('a bakery site')
  const again = await say(b, { said: 'it sells sourdough' }, noModel)
  assert.equal(askedOf(again), 'skips')
  assert.ok(!b.go)
  // a talk needs the planner model: offline it says so, and nothing is answered
  const c = asked('a bakery site')
  await assert.rejects(say(c, { said: "don't build yet, let's talk" }, noModel), /planner model/)
  assert.ok(!c.go)
  // a pick that is not one of the question's own options is not an answer
  const d = asked('a bakery site')
  await assert.rejects(say(d, { pick: 'go:bogus' }, noModel), /say something first/)
  assert.ok(!d.go)
})

// ---------- the gate on /api/run, on the real server with a fake Hermes bridge (tests/hermeshealth.test.mjs)

async function freePort() {
  const s = createServer()
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const p = s.address().port
  await new Promise(r => s.close(r))
  return p
}
async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'ask-srv-'))
  const port = await freePort()
  const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: join(dir, 'data'), SWARM_RUNS_DIR: join(dir, 'data', 'runs'), SWARM_OUTPUT_DIR: join(dir, 'out'), HERMES_HOME: join(dir, 'hermes'), SWARM_HERMES_RUNNING: '0' }
  for (const k of Object.keys(env)) if (/_API_KEY$/.test(k) || /^SWARM_(PLANNER|WORKER|REVIEWER)_/.test(k)) delete env[k]
  const child = spawn(process.execPath, [join(root, 'server', 'server.mjs'), '--port', String(port)], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 80; i++) { if (await fetch(base + '/').then(() => true, () => false)) break; await new Promise(r => setTimeout(r, 100)) }
  const call = (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-swarm-token': 't', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const stop = () => { child.kill(); try { rmSync(dir, { recursive: true, force: true }) } catch {} }
  return { call, stop, dir }
}

test('/api/run: a new website asks; it builds once answered, for a sure script, and for a follow-up', { timeout: 60000 }, async () => {
  const s = await startServer()
  // a Hermes that answers what pictures it offers (none) and holds every model call
  const bridge = createServer((req, res) => { req.resume(); if (!req.url.includes('/v1/')) res.writeHead(200, { 'content-type': 'application/json' }).end('{"image":false,"video":false}') })
  await new Promise(r => bridge.listen(0, '127.0.0.1', r))
  try {
    await s.call('/api/hermes/attach', { url: `http://127.0.0.1:${bridge.address().port}`, token: 'bridge-token-0123456789', pid: 4250, code: 1e10 })
    const state = async () => (await (await s.call('/api/state')).json()).run || null

    // a new website: the question, in a chat, and nothing builds
    let res = await s.call('/api/run', { brief: 'A site for a plant shop, just make it' })
    let j = await res.json()
    assert.equal(res.status, 409)
    assert.equal(j.error, 'ask')
    assert.equal(j.ask, 'skips')
    assert.match(j.chat, /^c-[0-9a-f]{10}$/)
    assert.equal(j.recommended, 'all')
    assert.deepEqual(j.options.map(o => o.id), ['go:all', 'go:steps', 'go:pick'])
    assert.equal(await state(), null, 'no build started')
    const chatId = j.chat
    let chat = await (await s.call(`/api/chats/${chatId}`)).json()
    assert.deepEqual(chat.turns.map(t => t.who), ['person', 'planner'])
    assert.equal(chat.turns[0].text, 'A site for a plant shop, just make it')

    // asked again with the same chat: one open question, not two
    res = await s.call('/api/run', { brief: 'A site for a plant shop, just make it', chat: chatId })
    assert.equal(res.status, 409)
    chat = await (await s.call(`/api/chats/${chatId}`)).json()
    assert.equal(chat.turns.length, 2)

    // a model can't answer through the run: an unknown field, or a chat with no answer, still asks
    res = await s.call('/api/run', { brief: 'A site for a plant shop', chat: chatId, go: 'all', answered: true })
    assert.equal(res.status, 409)

    // the person answers in the chat (offline: no model needed), then the same brief with that chat builds
    res = await s.call(`/api/talk/${chatId}`, { pick: 'go:all' })
    j = await res.json()
    assert.equal(res.status, 200)
    assert.equal(j.turn.go.path, 'all')
    res = await s.call('/api/run', { brief: 'A site for a plant shop, just make it', chat: chatId })
    j = await res.json()
    assert.equal(res.status, 200, JSON.stringify(j))
    const first = j.run
    assert.ok(first)
    // one answer is one build: the same chat asks again for another new build
    res = await s.call('/api/run', { brief: 'Another plant shop', chat: chatId })
    assert.equal(res.status, 409)
    await s.call('/api/stop', { run: first })

    // a follow-up of a build that exists does not ask (it may be busy, never asked)
    res = await s.call('/api/run', { brief: 'add a contact page', from: first })
    j = await res.json()
    assert.notEqual(j.error, 'ask')
    // a bare redo with no project, or a from that is no run, still asks
    assert.equal((await s.call('/api/run', { brief: 'A site for a bakery', redo: true })).status, 409)
    assert.equal((await s.call('/api/run', { brief: 'A site for a bakery', from: 'r-nope' })).status, 409)

    // "don't build yet": the talk, not the question, and nothing builds
    res = await s.call('/api/run', { brief: "a bakery site, don't build yet, let's talk" })
    j = await res.json()
    assert.equal(res.status, 409)
    assert.equal(j.ask, 'talk')
    assert.equal(j.chat, null)

    // a script that says it is sure builds at once
    await new Promise(r => setTimeout(r, 300))
    res = await s.call('/api/run', { brief: 'A site for a bakery', sure: true })
    j = await res.json()
    assert.equal(res.status, 200, JSON.stringify(j))
    assert.ok(j.run)
    await s.call('/api/stop', { run: j.run })
    // only true counts
    assert.equal((await s.call('/api/run', { brief: 'A site for a bakery', sure: 'yes' })).status, 409)
  } finally { bridge.closeAllConnections?.(); bridge.close(); s.stop() }
})

test('/api/run: a Studio project\'s Build is answered by the walk; /api/studio takes the skipped steps', { timeout: 30000 }, async () => {
  const s = await startServer()
  const bridge = createServer((req, res) => { req.resume(); if (!req.url.includes('/v1/')) res.writeHead(200, { 'content-type': 'application/json' }).end('{"image":false,"video":false}') })
  await new Promise(r => bridge.listen(0, '127.0.0.1', r))
  try {
    await s.call('/api/hermes/attach', { url: `http://127.0.0.1:${bridge.address().port}`, token: 'bridge-token-0123456789', pid: 4251, code: 1e10 })
    // the chat that asked moves into the Studio project, and Skip Brand starts the walk on Plan
    let res = await s.call('/api/run', { brief: 'A site for a plant shop' })
    const { chat } = await res.json()
    await s.call(`/api/talk/${chat}`, { pick: 'go:pick' })
    const j = await (await s.call(`/api/talk/${chat}`, { pick: 'go:skip-brand' })).json()
    assert.deepEqual(j.turn.go.skip, ['brand'])
    res = await s.call('/api/studio', { kind: 'site', idea: j.turn.go.brief, chat, skip: j.turn.go.skip, start: 'plan' })
    const st = await res.json()
    assert.equal(res.status, 200, JSON.stringify(st))
    assert.equal(st.chat, chat)
    assert.equal(st.studio.steps.brand, 'skipped')
    assert.equal(st.studio.start, 'plan')
    const moved = await (await s.call(`/api/chats/${chat}`)).json()
    assert.equal(moved.project, st.project.id)
    // the Studio's Build: the walk is the answer, so it builds
    res = await s.call('/api/run', { brief: 'A site for a plant shop', project: st.project.id, chat })
    const out = await res.json()
    assert.equal(res.status, 200, JSON.stringify(out))
    await s.call('/api/stop', { run: out.run })
  } finally { bridge.closeAllConnections?.(); bridge.close(); s.stop() }
})

test('the source: every client handles the ask before treating a 409 as busy; Hermes never answers', () => {
  const read = f => readFileSync(join(root, f), 'utf8')
  const loop = read('web/canvas/loop.js')
  assert.ok(loop.indexOf("j.error === 'ask'") > 0 && loop.indexOf("j.error === 'ask'") < loop.indexOf('{ busy: true'), 'loop.js: ask before busy')
  // the old UI's Make box and a project's Build need nothing more: the question's chat opens on the deck (home.js openChat)
  assert.match(loop, /openAsk\(j\.chat\)/)
  assert.match(loop, /if \(!from\) \{ window\.swarmCosmos\?\.go\?\.\('station', 'canvas'\)/, 'a talk from the Make box opens on the deck')
  assert.match(read('web/home.js'), /if \(!input\.value && !made\?\.ask\) input\.value = text/, 'the words leave the box once asked')
  for (const f of ['ui/src/screens/projects/MakeBox.tsx', 'ui/src/screens/deck/DeckChat.tsx']) assert.ok(read(f).includes("error === 'ask'"), f)
  const launcher = read('launcher.py'), init = read('__init__.py'), commands = read('commands.py')
  // swarm_design passes brief and agents only; sure is a script's (--build, remix)
  assert.match(init, /started = launcher\.start_run\(brief, agents\)\n/)
  assert.match(init, /"waiting": "person"/)
  assert.match(init, /start_run\(brief, args\.agents, force=args\.build, sure=args\.build\)/)
  assert.match(commands, /launcher\.start_run\(brief, sure=True\)/)
  assert.match(launcher, /if sure:\n\s*body\["sure"\] = True/)
  assert.match(launcher, /"op": "chat", "target": chat/)
})

test('a skipped Plan forces no pages on the Studio build (web/kit-site.js)', async () => {
  const { siteKit } = await import('../web/kit-site.js')
  const sent = []
  const ctx = plan => ({ state: {}, studio: { idea: 'a tea shop', steps: { plan } }, project: { id: 'p1' }, chat: 'c1', sw: { submit: async b => { sent.push(b); return 'r1' } } })
  assert.deepEqual(siteKit.lock(ctx('skipped')), {})
  await siteKit.build({}, ctx('skipped'))
  assert.equal(sent.at(-1), 'a tea shop', 'the planner picks the pages')
  // no pages are filled in by default (#487): with none named, the crew decides, Plan skipped or not
  assert.deepEqual(siteKit.lock(ctx('todo')).pages, [])
  await siteKit.build({}, ctx('todo'))
  assert.equal(sent.at(-1), 'a tea shop')
  // the brand story's pages are a suggestion: they go unless the Plan was skipped
  const story = plan => ({ ...ctx(plan), brand: { story: { pages: ['Home', 'Menu'] } } })
  await siteKit.build({}, story('todo'))
  assert.match(sent.at(-1), /Pages: Home, Menu\.$/)
  await siteKit.build({}, story('skipped'))
  assert.equal(sent.at(-1), 'a tea shop')
  const picked = { ...ctx('skipped'), state: { pages: ['Menu'] } }
  assert.deepEqual(siteKit.lock(picked).pages, ['Menu'], 'pages the person named still go')
})
