// web/gametalk.js (decision 0024): the next UI's Make › Game › Studio hands the words to the classic Studio's game
// talk in ?game=; they leave the address at once and the talk starts with them
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { takeGameTalk } from '../web/gametalk.js'
import { studioModules } from '../server/page.mjs'

function page(href) {
  const state = { href, replaced: null }
  globalThis.location = { get href() { return state.href } }
  globalThis.history = { state: null, replaceState: (_s, _t, u) => { state.replaced = String(u); state.href = String(u) } }
  return state
}

test('the words in ?game= start the game talk and leave the address', async () => {
  const s = page('http://127.0.0.1:4319/classic/?game=A%20cosy%20tea%20game&x=1')
  const said = []
  takeGameTalk({ talkGame: o => said.push(o) })
  await new Promise(r => setTimeout(r, 5))
  assert.deepEqual(said, [{ text: 'A cosy tea game' }])
  assert.equal(s.replaced, 'http://127.0.0.1:4319/classic/?x=1')
})

test('no ?game=, no talk and the address is left alone', async () => {
  const s = page('http://127.0.0.1:4319/classic/')
  const said = []
  takeGameTalk({ talkGame: o => said.push(o) })
  await new Promise(r => setTimeout(r, 5))
  assert.deepEqual(said, [])
  assert.equal(s.replaced, null)
})

test('the classic page carries it, before home.js imports it', () => {
  const list = studioModules('web')
  assert.ok(list.indexOf('gametalk.js') >= 0 && list.indexOf('gametalk.js') < list.indexOf('home.js'))
})
