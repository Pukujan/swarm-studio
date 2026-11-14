// A brought-in project's two questions, typed (web/intake.js): run it or not, its install scripts or not. The chat
// works for everything: both answers to each have a typed route, and only a whole message is an answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { intakeAsk, INTAKE_SAY } from '../web/intake.js'

test('the yes and the no to running it, typed', () => {
  for (const t of ['install and run it', 'Install and run it.', 'run it', 'yes, run it', 'start the app', 'install and run', 'please run this', 'OK, run it here']) assert.deepEqual(intakeAsk(t), { did: 'run' }, t)
  for (const t of ['not now', 'No, not now', "don't run it", 'leave it as files']) assert.deepEqual(intakeAsk(t), { did: 'norun' }, t)
})

test('the yes and the no to its install scripts, typed', () => {
  for (const t of ['run its install scripts', 'allow its install scripts', 'run the scripts too', 'allow install scripts for this project']) assert.deepEqual(intakeAsk(t), { did: 'scripts' }, t)
  for (const t of ['no install scripts', "don't run its install scripts", 'keep the scripts off', 'no scripts']) assert.deepEqual(intakeAsk(t), { did: 'noscripts' }, t)
})

test('a change for the crew is never an answer', () => {
  for (const t of ['run the tests in the footer', 'make it run faster', 'start a new page called scripts', 'add install instructions', 'now', '']) assert.equal(intakeAsk(t), null, t)
})

test('the questions name the answers they take, and the room asks them in the chat', () => {
  for (const said of ['"install and run it"', '"not now"']) assert.ok(INTAKE_SAY.ask.includes(said))
  for (const said of ['"run its install scripts"', '"no install scripts"']) assert.ok(INTAKE_SAY.scriptsAsk.includes(said))
  for (const t of ['install and run it', 'not now']) assert.ok(intakeAsk(t))
  for (const t of ['run its install scripts', 'no install scripts']) assert.ok(intakeAsk(t))
  const rooms = readFileSync(new URL('../web/canvas/rooms.js', import.meta.url), 'utf8')
  assert.match(rooms, /appApi\('\/scripts', \{ allow \}\)/)
  assert.match(rooms, /appApi\('\/open', \{ run: true \}\)/)
  assert.match(readFileSync(new URL('../web/canvas/loop.js', import.meta.url), 'utf8'), /intakeSay\(els\.brief\.value\)/)
})
