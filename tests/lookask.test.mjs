// A look-only ask changes the theme in place and rebuilds nothing (web/route.js lookAsk, engine/lookask.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookAsk, routeMessage } from '../web/route.js'
import { lookEdits, lookEditsFrom, lookAskMessages, themeNow, LOOK_ASK_RULES } from '../engine/lookask.mjs'

test('colour, font and brand asks are look asks; anything about pages, sections, pictures or words is not', () => {
  for (const t of ['change the brand colors', 'i want to change the reference and brand colours', 'make it darker', 'use the reference colors and fonts', 'a warmer palette', 'different typography', 'dark mode please', 'rounder corners'])
    assert.equal(lookAsk(t), true, t)
  for (const t of ['add a pricing page', 'make the hero darker', 'new colours and a new page', 'change the picture colors', 'rewrite the copy', 'better image pls', 'bigger', ''])
    assert.equal(lookAsk(t), false, t)
})

test('with nothing selected a look ask is a change in place, never the next version; with a page selected it is that page\'s', () => {
  assert.equal(routeMessage({ text: 'change the brand colors', run: 'r1' }), 'fix')
  assert.equal(routeMessage({ text: 'add a page about pricing', run: 'r1' }), 'extend')
  assert.equal(routeMessage({ text: 'make it darker', run: 'r1', selected: true }), 'fix')
  assert.equal(routeMessage({ text: 'change the brand colors' }), 'new')
})

const theme = { vars: { '--background': '#ffffff', '--foreground': '#0d1117', '--accent': '#1f883d' }, fonts: { heading: 'Space Grotesk', body: 'Inter' }, radius: '0px' }

test('only the theme\'s own variables, valid values and real changes become edits', () => {
  const e = lookEditsFrom({ vars: { '--background': '#0A0A0A', '--foreground': '#0d1117', '--accent': 'blue', '--made-up': '#ff0000' }, fonts: { heading: 'Oswald', body: 'Inter' }, radius: '12px' }, theme)
  assert.deepEqual(e, [{ kind: 'var', name: '--background', value: '#0a0a0a' }, { kind: 'font', role: 'heading', value: 'Oswald' }, { kind: 'radius', value: '12px' }])
  assert.deepEqual(lookEditsFrom({ fonts: { heading: '<script>' }, radius: 'huge' }, theme), [])
  assert.deepEqual(lookEditsFrom(null, theme), [])
})

test('the planner is told the theme, the ask and the reference\'s look; no model or a bad answer changes nothing', async () => {
  let sent = null
  const chat = async m => { sent = m; return 'Sure: {"vars":{"--accent":"#00bbff"},"reply":"Accent is now the reference\'s blue"}' }
  const r = await lookEdits({ theme, text: 'use the reference accent', reference: { bg: '#0a0a0a', text: '#efeeeb', accent: '#00bbff' }, chat })
  assert.deepEqual(r.edits, [{ kind: 'var', name: '--accent', value: '#00bbff' }]); assert.match(r.reply, /blue/)
  assert.match(sent[1].content, /--accent/); assert.match(sent[1].content, /use the reference accent/); assert.match(sent[1].content, /#00bbff/)
  assert.match(LOOK_ASK_RULES, /nothing else/); assert.match(LOOK_ASK_RULES, /never add one/)
  assert.deepEqual((await lookEdits({ theme, text: 'x', chat: null })).edits, [])
  assert.deepEqual((await lookEdits({ theme, text: 'x', chat: async () => 'nope' })).edits, [])
  assert.equal(lookAskMessages({ theme, text: 'x' }).length, 2)
})

test('themeNow is the last theme with later look edits applied', () => {
  const ev = [{ type: 'theme', vars: { '--a': '#111111' }, fonts: { heading: 'A' }, radius: '4px' }, { type: 'edit', kind: 'var', name: '--a', value: '#222222' }, { type: 'edit', kind: 'font', role: 'heading', value: 'B' }, { type: 'edit', kind: 'radius', value: '0px' }, { type: 'edit', kind: 'size', value: '1' }]
  const t = themeNow(ev)
  assert.deepEqual([t.vars['--a'], t.fonts.heading, t.radius], ['#222222', 'B', '0px'])
  assert.equal(themeNow([]), null)
})
