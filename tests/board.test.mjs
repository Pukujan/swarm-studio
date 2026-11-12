// The Overview's board (server/board.mjs): each page carries its planned sections, so the Overview can
// draw a page before its picture (spec 36).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBoard } from '../server/board.mjs'

test('each page lists its planned sections in order, with heights, and which are built', () => {
  const run = 'r1'
  const ev = [
    { type: 'run:start', run, t: 1 },
    { type: 'page', run, t: 2, id: 'home', title: 'Home' },
    { type: 'page', run, t: 3, id: 'menu', title: 'Menu' },
    { type: 'layer:plan', run, t: 4, page: 'home', id: 'hero', role: 'hero', height: 720 },
    { type: 'layer:plan', run, t: 5, page: 'home', id: 'list', role: 'features', height: 9 },
    { type: 'layer:plan', run, t: 6, page: '*', id: 'nav', role: 'nav', height: 80 },
    { type: 'layer:done', run, t: 7, page: 'home', layer: 'hero', html: '<h1></h1>' },
    { type: 'layer:plan', run, t: 8, page: 'home', id: 'list', role: 'features', height: 500 }
  ]
  const b = runBoard(run, ev, '/nonexistent')
  assert.deepEqual(b.pages.find(p => p.id === 'home').plan, [
    { id: 'hero', role: 'hero', h: 720, done: true },
    { id: 'list', role: 'features', h: 500, done: false }
  ])
  assert.deepEqual(b.pages.find(p => p.id === 'menu').plan, [])
})
