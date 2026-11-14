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

// The night a sprite cut-out failed with "No module named 'PIL'" (2026-11-13): asked "can u install pillow
// then?", the chat said yes. Talk can only read and look, so whatever the model says, the answer is never a yes.
test('asked to install Pillow, Talk never says yes (the Pillow exchange)', async () => {
  const { talkPrompt } = await import('../engine/talk.mjs')
  const { claimsDoing } = await import('../engine/honest.mjs')
  const notes = 'State: working. Recent steps:\n- cutting out the sprite sheet: No module named \'PIL\''
  // the rule is in the prompt the model reads
  assert.match(talkPrompt({ notes }), /cannot install, restart, update or change anything in Swarm Studio/)
  // a model that says yes is asked again, and its second, honest answer is the one shown
  const twice = scripted(['{"say":"Yes, I\'ll install Pillow now and run the cut-out again."}', '{"say":"I cannot install anything: I only read the build. Pillow is missing from the Studio\'s Python; run python3 -m pip install pillow yourself."}'])
  const a = await talk({ chat: twice.chat, appDir: app(), media, notes, text: 'can u install pillow then?' })
  assert.match(a.answer, /cannot install/)
  assert.match(twice.seen[1].at(-1), /You cannot, and you did not/)
  // a model that keeps saying yes: the plain truth is said instead
  for (const lie of ['{"say":"Yes."}', '{"say":"Sure, installing it now."}', '{"say":"Done, Pillow is installed."}', 'I\'ll install Pillow for you.']) {
    const m = scripted([lie, lie])
    const r = await talk({ chat: m.chat, appDir: app(), media, notes, text: 'can u install pillow then?' })
    assert.equal(claimsDoing(r.answer, true), false, lie)
    assert.doesNotMatch(r.answer, /^\s*(yes|sure|done)\b/i, lie)
    assert.match(r.answer, /cannot install, restart or change anything/)
  }
  // unasked too: "why did it fail?" answered with "I'll install it" is the same claim
  const un = scripted(['{"say":"PIL is missing. I\'ll install Pillow and retry."}', '{"say":"PIL is missing. I\'ll install Pillow and retry."}'])
  assert.match((await talk({ chat: un.chat, appDir: app(), media, notes, text: 'why did the cut out fail?' })).answer, /cannot install/)
  // an honest answer, and ordinary build talk, pass through untouched with no second call
  for (const fine of ['I cannot install anything from here. Run python3 -m pip install pillow in a terminal.', 'The builder is installing the app\'s packages and updating the jump.']) {
    const m = scripted([JSON.stringify({ say: fine })])
    assert.equal((await talk({ chat: m.chat, appDir: app(), media, notes, text: 'can u install pillow then?' })).answer, fine)
    assert.equal(m.seen.length, 1)
  }
})
