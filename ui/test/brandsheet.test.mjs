// A brand sheet opened from a chat's brief (src/screens/brand/source.ts; docs/specs/31-brand-sheet.md): it is made
// by POST /api/brand and changed on that chat's own routes, as web/brand.js does, and the screen its chat is on
// draws it. Node runs the TypeScript file as it is (type stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatSheet, sheetHost } from '../src/screens/brand/source.ts'

// a fake server: answers each call from `answer(path, body)` and keeps what was asked
function server(answer) {
  const calls = []
  const api = async (path, init = {}) => {
    const body = JSON.parse(init.body || '{}')
    calls.push({ path, method: init.method, body })
    const [status, json] = answer(path, body)
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
  }
  return { api, calls }
}
const sheet = (chat, lockedAt = null) => ({ chat, brand: { brief: 'A rat rescue', palettes: [], types: [], lockedAt }, theme: null, packs: [] })

test("a chat's sheet is made from its brief, then picked, edited, locked and unlocked on that chat's routes", async () => {
  const s = server(path => [200, sheet('c1', path.endsWith('/lock') ? 5 : null)])
  const src = chatSheet({ chat: 'c1', brief: 'A rat rescue', kind: 'site' }, s.api)
  assert.equal((await src.open()).chat, 'c1')
  await src.change('pick', { part: 'palette', id: 'p2' })
  await src.change('edit', { part: 'story', values: { what: 'Rats' } })
  assert.equal((await src.change('lock')).brand.lockedAt, 5)
  await src.change('unlock')
  assert.deepEqual(s.calls.map(c => `${c.method} ${c.path}`), ['POST /api/brand', 'POST /api/brand/c1/pick', 'POST /api/brand/c1/edit', 'POST /api/brand/c1/lock', 'POST /api/brand/c1/unlock'])
  assert.deepEqual(s.calls[0].body, { chat: 'c1', brief: 'A rat rescue', kind: 'site' })
  assert.deepEqual(s.calls[1].body, { part: 'palette', id: 'p2' })
  assert.deepEqual(s.calls[3].body, {})
})

test('a brief with no chat yet gets the chat the server made, and every change goes to it', async () => {
  const s = server(() => [200, sheet('c made/1')])
  const src = chatSheet({ chat: null, brief: 'A todo app', kind: 'app' }, s.api)
  await assert.rejects(src.change('lock'), /No brand sheet yet/)
  assert.equal(s.calls.length, 0)
  await src.open()
  assert.deepEqual(s.calls[0].body, { chat: null, brief: 'A todo app', kind: 'app' })
  await src.change('lock')
  assert.equal(s.calls[1].path, '/api/brand/c%20made%2F1/lock')
})

test('only a website or an app has a sheet: any other kind is asked for as a website', async () => {
  const s = server(() => [200, sheet('c1')])
  await chatSheet({ chat: 'c1', brief: 'A film', kind: 'film' }, s.api).open()
  assert.equal(s.calls[0].body.kind, 'site')
})

test("the server's own words are the error; with none, the status", async () => {
  const said = server(() => [400, { error: 'pick a palette and a type first' }])
  const a = chatSheet({ chat: 'c1', brief: 'x', kind: 'site' }, said.api)
  await assert.rejects(a.change('lock'), /pick a palette and a type first/)
  const silent = server(() => [502, {}])
  await assert.rejects(chatSheet({ chat: null, brief: 'x', kind: 'site' }, silent.api).open(), /HTTP 502/)
})

test("a sheet opened from the deck's chat is drawn by the deck; a project's, from its Studio, by the brand screen", () => {
  assert.equal(sheetHost({ room: 'brand', from: 'draft' }), 'draft')
  assert.equal(sheetHost({ room: 'brand', from: 'deck' }), 'deck')
  assert.equal(sheetHost({ room: 'brand', from: 'studio' }), 'brand')
  assert.equal(sheetHost({ room: 'brand', from: null }), 'brand')
  // a room that is not the sheet is its own, whatever `from` still holds
  assert.equal(sheetHost({ room: 'deck', from: null }), 'deck')
  assert.equal(sheetHost({ room: 'overview', from: 'deck' }), 'overview')
})
