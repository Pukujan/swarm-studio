// A game talk takes media as any talk does (#648): the picture a person pasted while planning a game was
// uploaded and filed as a chip, but the send never named it, so the planner planned as if nothing was attached.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { say } from '../engine/talkplan.mjs'

const picture = { id: 'mabc123', kind: 'image', name: 'image (2).png', file: 'image (2).png', url: null, src: '/chatmedia/c-0123456789/image%20(2).png', read: { by: 'vision', text: 'a rooftop at dusk with a broken tile' }, at: 1 }

const gameChat = () => ({ id: 'c-0123456789', kind: 'game', title: 'rooftop signal', turns: [], decisions: {}, refs: [picture] })
// a fake planner: keeps the messages it was sent, answers with a plain step
const scripted = reply => { const seen = []; return { seen, model: async m => { seen.push(m); return reply } } }

test('the game talk keeps the picture on the person\'s turn and tells the planner how it was read', async () => {
  const chat = gameChat()
  const m = scripted('{"say":"I see the broken tile. Let us fix the roof first."}')
  const turn = await say(chat, { said: 'fix this', refs: ['mabc123'] }, { model: m.model, env: { godot: true } })
  const person = chat.turns.find(t => t.who === 'person')
  assert.deepEqual(person.refs, ['mabc123'], 'the turn keeps the media it was sent with')
  const prompt = m.seen[0].map(x => x.content).join('\n')
  assert.match(prompt, /What they attached to this message/)
  assert.match(prompt, /vision model looked at it: a rooftop at dusk with a broken tile/)
  assert.ok(turn && turn.text, 'the planner still answers')
})

test('an id the chat does not hold is never claimed as read', async () => {
  const chat = gameChat()
  const m = scripted('{"say":"Fine."}')
  await say(chat, { said: 'fix this', refs: ['mnosuch', 'mabc123'] }, { model: m.model, env: {} })
  const person = chat.turns.find(t => t.who === 'person')
  assert.deepEqual(person.refs, ['mabc123'])
  assert.equal(m.seen[0].map(x => x.content).join('\n').match(/What they attached/g)?.length, 1)
})

test('a turn with nothing attached says nothing about attachments', async () => {
  const chat = gameChat()
  const m = scripted('{"say":"Onwards."}')
  await say(chat, { said: 'make it 3d' }, { model: m.model, env: {} })
  assert.deepEqual(chat.turns.find(t => t.who === 'person').refs, [])
  assert.doesNotMatch(m.seen[0].map(x => x.content).join('\n'), /What they attached/)
})
