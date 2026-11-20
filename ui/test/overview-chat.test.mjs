// node --test ui/test/overview-chat.test.mjs
// The Overview's chat in the new Studio (src/screens/overview/OverviewChat.tsx): the Overview has no way to the
// classic Studio left for typing, its dock has no box of its own, and words for an app wait for that build's App room.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { askOn, takeAsk } from '../src/screens/app/asking.ts'

const read = f => readFileSync(new URL(`../src/screens/${f}`, import.meta.url), 'utf8')

test('the Overview draws the chat and sends nobody to the classic Studio to type', () => {
  const screen = read('Overview.tsx')
  assert.match(screen, /<OverviewChat /)
  assert.doesNotMatch(screen, /classicHref|\/classic\//)
  assert.doesNotMatch(read('overview/Dock.tsx'), /<input|<form/)
})

test('the Overview keeps clear of the chat, on the left and along the bottom', () => {
  const css = read('overview/overview.css')
  assert.match(css, /\.ov \{[^}]*var\(--chat-h, 0px\)[^}]*margin-left: var\(--chat-w, 0px\)/)
})

test('a build started from the Overview opens on the Overview, and a section in Layers drags into the chat', () => {
  assert.match(read('overview/OverviewChat.tsx'), /room="overview"/)
  assert.match(read('overview/Layers.tsx'), /layerDrag\(e, `\$\{p\.id\}\/\$\{l\.id\}`/)
})

test("words for an app wait for that build's App room, once", () => {
  assert.equal(takeAsk('r1'), '')
  askOn('r1', 'add a sign-in page')
  assert.equal(takeAsk('r1'), 'add a sign-in page')
  assert.equal(takeAsk('r1'), '')
  // another build's room drops them
  askOn('r1', 'make it faster')
  assert.equal(takeAsk('r2'), '')
  assert.equal(takeAsk('r1'), '')
})
