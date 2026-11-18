// Ask mode answers the question (docs/specs/46-chat-modes.md, "What each mode does with a message"), on the real
// server, with a model the test steers: a reply that only recites the build's own bookkeeping is not an answer, and
// is asked again once for one, exactly as a claim of installing something is (engine/honest.mjs claimsDoing).
// The fixture is the owner's own exchange (EVIDENCE.md, failure 4): in ANSWER ONLY mode, "i cant test the game live"
// was answered with the picture queue's status line.
// Run: node --test tests/askanswer.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudio } from '../scripts/studio-child.mjs'
import * as ask from '../engine/ask.mjs'

const { ASK_PROMPT, answerOnly, isBookkeeping } = ask

const OWNER_ASKED = 'i cant test the game live'
const TELEMETRY = 'Right now: using 61 pictures painted before; painting 0.'
const REAL_ANSWER = 'No, you cannot play it in the browser yet: it is not a live game, only the design and its pictures. What would settle it is a built app: press Build the app and it can be played on your computer.'

// a model endpoint the test steers: one reply per call from a queue, the last one repeated
async function fakeModel(replies) {
  const ctl = { asked: [], replies: [...replies] }
  const srv = createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      ctl.asked.push(body)
      const say = ctl.replies.length > 1 ? ctl.replies.shift() : ctl.replies[0] || 'It has one page.'
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: say } }] })}\n\ndata: [DONE]\n\n`)
    })
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  return { ctl, url: `http://127.0.0.1:${srv.address().port}`, close: () => { srv.closeAllConnections?.(); srv.close() } }
}

async function studio(model) {
  const dir = mkdtempSync(join(tmpdir(), 'ask-srv-'))
  const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: join(dir, 'data'), SWARM_RUNS_DIR: join(dir, 'data', 'runs'), SWARM_OUTPUT_DIR: join(dir, 'out'), HERMES_HOME: join(dir, 'hermes'), SWARM_HERMES_RUNNING: '0' }
  for (const k of Object.keys(env)) if (/_API_KEY$/.test(k) || /^SWARM_(PLANNER|WORKER|REVIEWER)_/.test(k) || /^SWARM_(STUDIO_)?BASE_URL$/.test(k)) delete env[k]
  Object.assign(env, { SWARM_API_KEY: 'test-key', SWARM_BASE_URL: model.url, SWARM_PLANNER_MODEL: 'cb/deepseek-v4.1-flash', SWARM_WORKER_MODEL: 'cb/deepseek-v4.1-flash' })
  const { child, base } = await startStudio({ env })
  const call = (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-swarm-token': 't', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const upload = (path, bytes, type) => fetch(base + path, { method: 'POST', body: bytes, headers: { 'x-swarm-token': 't', 'content-type': type } })
  return { call, upload, stop: () => { child.kill(); try { rmSync(dir, { recursive: true, force: true }) } catch {} } }
}

const askBody = (text, extra = {}) => ({ said: [{ who: 'you', text }], kind: 'game', ask: true, ...extra })

test('the reply the owner got: the picture queue line is not an answer, so the model is asked again once', { timeout: 60000 }, async () => {
  const model = await fakeModel([TELEMETRY, REAL_ANSWER])
  const s = await studio(model)
  try {
    const res = await s.call('/api/discuss', askBody(OWNER_ASKED))
    const j = await res.json()
    assert.equal(res.status, 200, JSON.stringify(j))
    // what is said back, with the question and the first reply the model gave now in view
    console.log('ASK ANSWERED WITH:', JSON.stringify(j.reply))
    assert.ok(model.ctl.asked.length >= 1)
    assert.equal(j.reply, REAL_ANSWER, 'the person gets an answer, not the build counters')
    assert.doesNotMatch(j.reply, /pictures painted before|painting 0/)
    assert.equal(model.ctl.asked.length, 2, 'the model was asked the question once, and asked again for a real answer')
    // the second asking says plainly that counters are not an answer, and what to say instead
    const again = model.ctl.asked.at(-1)
    assert.match(again, /not an answer/)
    assert.match(again, /I can't tell from here/)
    // and it still holds the person's own words
    assert.ok(again.includes(OWNER_ASKED), 'the question is still in view')
    // Ask's guarantees: nothing is saved as a chat, nothing is built, no link is read
    assert.ok(!j.chat && !j.brief && !j.options && !j.step, 'nothing is left open or saved: ' + JSON.stringify(Object.keys(j)))
    assert.doesNotMatch(JSON.stringify(j), /pictures painted before/)
  } finally { s.stop(); model.close() }
})

test('a model that answers only in counters twice is not shown to the person as an answer', { timeout: 60000 }, async () => {
  const model = await fakeModel([TELEMETRY])
  const s = await studio(model)
  try {
    const res = await s.call('/api/discuss', askBody(OWNER_ASKED))
    const j = await res.json()
    assert.equal(res.status, 200, JSON.stringify(j))
    // asked again once for a real answer, and the line the asking again carries is in the turn
    // (the system prompt says "not an answer" too, so count the askings again: the turns with a fourth message)
    const askedAgain = model.ctl.asked.filter(a => { try { return JSON.parse(a).messages.length >= 4 } catch { return false } })
    assert.equal(askedAgain.length, 1, 'asked again once, and only once')
    // never the counters as Hermia's words: the person is told there is no answer from here, and what would settle it
    assert.doesNotMatch(j.reply, /pictures painted before|painting 0/)
    assert.match(j.reply, /I can't tell from here/)
    assert.match(j.reply, /would settle it/i)
    // Ask still saves nothing and opens nothing
    assert.ok(!j.chat && !j.brief && !j.options, JSON.stringify(Object.keys(j)))
    assert.ok(!/\{"error"|HTTP \d{3}|undefined/.test(String(j.reply)), `plain words: ${j.reply}`)
  } finally { s.stop(); model.close() }
})

test('a real answer is answered once, and the question\'s picture is still read to the planner', { timeout: 60000 }, async () => {
  const model = await fakeModel([REAL_ANSWER])
  const s = await studio(model)
  try {
    // the attached picture rides the turn (server/server.mjs ask branch): it is uploaded to the chat's media, as the
    // chips do, and its ref goes with the question
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
    const up = await s.upload('/api/chats/new/media?name=shot.png&kind=game', png, 'image/png')
    const uj = await up.json()
    assert.equal(up.status, 200, JSON.stringify(uj))
    assert.ok(uj.ref?.id, 'the picture was taken')
    const res = await s.call('/api/discuss', askBody(OWNER_ASKED, { refs: [uj.ref.id], chat: uj.chat }))
    const j = await res.json()
    assert.equal(res.status, 200, JSON.stringify(j))
    assert.equal(j.reply, REAL_ANSWER)
    // the picture rode the turn: the planner was told about it, and how it was read (never that it was seen)
    const turn = JSON.stringify(model.ctl.asked)
    assert.ok(turn.includes('shot.png'), 'the picture is in the turn the planner was given')
    assert.match(turn, /What they attached|look at it|vision model/)
    // and Ask's guarantees hold: no chat was made or saved, nothing left open
    assert.ok(!j.chat && !j.brief && !j.options && !j.step, JSON.stringify(Object.keys(j)))
    // this test is about the picture, not the guard: whether the guard asked again is the test above's business
    assert.ok(model.ctl.asked.length >= 1)
  } finally { s.stop(); model.close() }
})

test('the guard reads the shapes a status line comes in, and leaves an answer alone', () => {  // what the owner saw, and the other bookkeeping the Studio says to itself
  for (const line of [
    TELEMETRY,
    'using 61 pictures painted before; painting 0.',
    'painting 0',
    'Right now: 5 of 9 sections are built and kept; 4 failed.',
    'The plan: 12 pictures, 3 sheets, 0 painted.',
    'Painting the backdrops now. It shows on the board as it lands.',
    'Current step: building app: 3 of 7 steps.',
    'Status: painting',
    'Progress 3/7',
    'Job: cut-out, running'
  ]) assert.equal(isBookkeeping(line), true, line)
  // an answer, even one that mentions where things are, is not bookkeeping
  for (const line of [
    REAL_ANSWER,
    'You cannot test it live yet: the game is not built. Press Build the app and it runs on your computer.',
    'I can\'t tell from here whether the sound works: I can only read the build. Build the app and press play to hear it.',
    'There are three pages: Home, Menu and Visit us.',
    'It is a platformer: you run, jump and collect stars.',
    'The menu has a bar, a mixer and a mixer stand.',
    'Pictures are painted in the background while you talk.',
    'The Studio paints 12 pictures for a game like this.',
    'Right now the game is only the design, not a built app.'
  ]) assert.equal(isBookkeeping(line), false, line)
  // the prompt says it in plain words (the prompt alone is a hope; the guard above is the check)
  const p = ASK_PROMPT('game', 'The plan: 12 pictures.', 'Setup parts: 16 of 23 working.')
  assert.match(p, /Answer what the person actually asked/i)
  assert.match(p, /counters|bookkeeping/)
  assert.match(p, /not an answer/)
  assert.match(p, /I can't tell from here/)
  assert.match(ASK_PROMPT('game'), /Nothing is built in this chat yet/)
})

test('the same guard in one call: a counter line is asked again once, and never returned', async () => {
  const seen = []
  const chat = async messages => { seen.push(messages); return seen.length === 1 ? TELEMETRY : REAL_ANSWER }
  assert.deepEqual(await answerOnly({ said: [{ who: 'you', text: OWNER_ASKED }], kind: 'game', chat, project: 'The plan: 12 pictures.' }), { reply: REAL_ANSWER })
  assert.equal(seen.length, 2)
  assert.match(seen[1].at(-1).content, /not an answer/)
  // a model that has nothing else to say is not shown as an answer: the person is told plainly there is none
  const stuck = async () => TELEMETRY
  const told = await answerOnly({ said: [{ who: 'you', text: OWNER_ASKED }], kind: 'game', chat: stuck })
  assert.match(told.reply, /I can't tell from here/)
  assert.match(told.reply, /would settle it/i)
  assert.doesNotMatch(told.reply, /pictures painted before/)
})
