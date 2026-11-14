import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { talk, appFiles, readAppFile, parseAction } from '../engine/talk.mjs'

const app = () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-talk-'))
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'node_modules'))
  writeFileSync(join(dir, 'scripts', 'player.gd'), 'extends CharacterBody2D\nvar speed = 240\n')
  writeFileSync(join(dir, 'node_modules', 'x.js'), 'no')
  writeFileSync(join(dir, 'project.godot'), '[application]')
  return dir
}
const media = { clips: [{ src: '/img/r1/playtest-3.webm', name: 'slice 1, Rooftop' }], pics: [{ src: '/img/r1/game-sprite-kumo.png', name: 'sprite kumo' }] }
// a fake model: says each reply in turn and keeps what it was sent
const scripted = replies => { const seen = []; return { seen, chat: async m => { seen.push(m.map(x => x.content)); return replies.shift() } } }

test('Talk reads only the app, never outside it or its dependencies', () => {
  const dir = app()
  assert.deepEqual(appFiles(dir), ['project.godot', 'scripts/player.gd'])
  assert.match(readAppFile(dir, 'scripts/player.gd'), /speed = 240/)
  assert.match(readAppFile(dir, '../../etc/passwd'), /outside the app/)
  assert.deepEqual(parseAction('sure: {"tool":"files"}'), { tool: 'files' })
  assert.deepEqual(parseAction('It is going well.'), { say: 'It is going well.' })
  // prose, then several tool calls at once: the first call is the action (the loop asks again)
  assert.deepEqual(parseAction('I will check both first.\n{"tool":"read","path":"a.gd"}\n{"tool":"read","path":"b.gd"}'), { tool: 'read', path: 'a.gd' })
  // a model's own tool-call markup is read as the same action, and never shown as an answer
  assert.deepEqual(parseAction('<｜DSML｜calls> <｜DSML｜invoke name="read"> <｜DSML｜parameter name="path" string="true">ports/kumo.gd</｜DSML｜parameter> </｜DSML｜invoke> </｜DSML｜calls>'), { tool: 'read', path: 'ports/kumo.gd' })
  assert.deepEqual(parseAction('Some words <｜DSML｜calls> and nothing else'), { say: 'Some words and nothing else' })
  assert.deepEqual(parseAction('{"say":"A brace } in text is fine.","now":false}'), { say: 'A brace } in text is fine.', now: false })
})

test('Talk reads the code before it answers, and shows only real media', async () => {
  const m = scripted(['{"tool":"read","path":"scripts/player.gd"}', '{"say":"She runs at 240. Here is the last play test.","show":["/img/r1/playtest-3.webm","/img/other/x.png"]}'])
  const r = await talk({ chat: m.chat, appDir: app(), media, text: 'how fast is she?' })
  assert.deepEqual(r.used, ['read'])
  assert.match(m.seen[1].at(-1), /speed = 240/)
  assert.equal(r.answer, 'She runs at 240. Here is the last play test.')
  assert.deepEqual(r.media, { clip: '/img/r1/playtest-3.webm', pics: [] })
})

test('a change is only written out for the person to confirm, never sent by Talk', async () => {
  const m = scripted(['{"say":"Make Kumo bigger in the next slice, right?","change":"Scale Kumo up to 1.5x","now":false}'])
  const r = await talk({ chat: m.chat, appDir: app(), media, text: 'make kumo bigger' })
  assert.deepEqual(r.proposal, { change: 'Scale Kumo up to 1.5x', now: false })
  const idle = await talk({ chat: scripted(['{"say":"ok","change":"x"}']).chat, appDir: app(), media, text: 'x', building: false })
  assert.equal(idle.proposal, null)
})

test('Talk looks at a listed picture and stops after its tool limit', async () => {
  const looked = []
  const m = scripted(['{"tool":"look","src":"/img/r1/game-sprite-kumo.png"}', ...Array(4).fill('{"tool":"files"}'), '{"tool":"files"}', '{"say":"never reached"}'])
  const r = await talk({ chat: m.chat, look: async src => (looked.push(src), 'a cat in a scarf'), appDir: app(), media, text: 'what does kumo look like' })
  assert.deepEqual(looked, ['/img/r1/game-sprite-kumo.png'])
  assert.match(m.seen[1].at(-1), /cat in a scarf/)
  // the last turn is told to answer; one that still calls a tool gets no answer (the server says its own)
  assert.equal(r.used.length, 5)
  assert.equal(r.answer, '')
  assert.match(m.seen[5].at(-1), /No more tools/)
})

test('asked to see, Talk always shows the newest even when the model forgets to', async () => {
  const r = await talk({ chat: scripted(['{"say":"Which one would you like?"}']).chat, appDir: app(), media, text: 'can i see any screenshots of it' })
  assert.deepEqual(r.media, { clip: '/img/r1/playtest-3.webm', pics: media.pics })
})
