// Talk first (engine/discuss.mjs): a "don't build yet" or a question never starts a build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wordsRead, readIntent, discuss, writeBrief, buildOf, toMessages } from '../engine/discuss.mjs'

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
  // the Make box reads the prompt before any question or build, and asks one choice when unsure
  assert.match(home, /const read = [^\n]*sw\.readTalk\(text, '', guideKind\(\)\)\n\s*if \(read === 'talk'\) return talkFirst\(text\)\n\s*if \(read === 'unsure'\) return askTalk\(text, go\)/)
  assert.match(home, /Build now or talk first\?/)
  // an answer typed in your own words is checked before it becomes brief text (Next and Just build)
  assert.equal((home.match(/if \(await answerTalks\(v, q\)\) return/g) || []).length, 2)
  // the brief step has Keep talking beside Build
  assert.match(home, /data-talk>Keep talking<\/button><button type="button" class="btn pri" data-go>/)
  // a talk in the deck builds only from its brief card's Build
  assert.match(canvas, /if \(talk\.on\) \{ skip\(\); if \(talk\.busy\) return; els\.brief\.value = ''; talkSay\(brief\); return \}/)
  assert.match(canvas, /els\.brief\.placeholder = 'Tell Hermia…'; dockBtn\.textContent = 'Send'/)
  assert.match(canvas, /<button class="primary" data-go>Build<\/button><button data-more>Keep talking<\/button>/)
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
