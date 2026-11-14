// engine/picask.mjs: a comment that is only about a section's picture repaints the picture and leaves the
// section alone (the owner: "told it to generate, it did but removed the prior layout").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pictureAsk, vagueAsk, gensOf, newPrompt, promptMessages } from '../engine/picask.mjs'

test('the owner\'s three comments are picture asks', () => {
  for (const t of ['better image pls', 'generate instead', 'a moodier photo', 'regenerate', 'Repaint it please', 'change this picture to a night scene', 'more impactful image'])
    assert.equal(pictureAsk(t), true, t)
})

test('layout and copy asks, and ones that never mention a picture, stay with the builder', () => {
  for (const t of ['much more better more impactful', 'make the image smaller', 'move the picture to the left', 'remove the photo', 'add a picture of the team', 'bigger heading', 'generate a pricing table', 'put the image above the text', 'round the picture corners', ''])
    assert.equal(pictureAsk(t), false, t)
})

test('gensOf lists a section\'s paintable pictures once each, in order', () => {
  const html = '<section><img data-gen="a sunlit studio corner" src="/img/a.png"><img alt="x" src="/logo.svg"><img class="w" data-gen="a ceramic vase"><img data-gen="a sunlit studio corner"></section>'
  assert.deepEqual(gensOf(html), ['a sunlit studio corner', 'a ceramic vase'])
  assert.deepEqual(gensOf('<section><p>no pictures</p></section>'), [])
})

test('the new prompt comes from the model, told the old picture and the ask; without one the two are joined', async () => {
  let sent = null
  const p = await newPrompt({ gen: 'a sunlit studio corner', comment: 'better image pls', role: 'index', chat: async m => { sent = m; return '"A painter at a wide oak table, raking window light, deep shadows, one clear focal point"' } })
  assert.equal(p, 'A painter at a wide oak table, raking window light, deep shadows, one clear focal point')
  assert.match(sent[1].content, /a sunlit studio corner/); assert.match(sent[1].content, /better image pls/)
  assert.match(sent[0].content, /No text in the picture/)
  assert.match(await newPrompt({ gen: 'a sunlit studio corner', comment: 'a night scene photo' }), /^a sunlit studio corner\. Changed as asked: a night scene photo$/)
  assert.match(await newPrompt({ gen: 'a vase', comment: 'generate instead' }), /A fresh take/)
  assert.match(await newPrompt({ gen: 'a vase', comment: 'better image', chat: async () => '' }), /^a vase\./)
  assert.match(await newPrompt({ gen: 'a vase', comment: 'better image', chat: async () => { throw new Error('down') } }), /^a vase\./)
  assert.equal(promptMessages({ gen: 'g', comment: 'c', role: 'r' }).length, 2)
})

test('a short follow-up that names nothing can ride on the last picture ask; a layout one cannot', () => {
  assert.equal(vagueAsk('much more better more impactful'), true)
  assert.equal(vagueAsk('again'), true)
  assert.equal(vagueAsk('make the heading bigger'), false)
  assert.equal(vagueAsk('this needs a completely different approach with far more detail and a lot more going on'), false)
  assert.equal(vagueAsk(''), false)
})
