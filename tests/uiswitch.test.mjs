// web/uiswitch.js (decision 0024): from a project in the classic Studio, ☰ → Use the new Studio goes back to the new
// UI at the same address
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toNewStudio } from '../web/uiswitch.js'
import { studioModules } from '../server/page.mjs'

test('the row chooses the new Studio, then opens it at the same address', async () => {
  const calls = []
  globalThis.location = { search: '?project=p1&version=r1', assign: u => calls.push(['go', u]) }
  const btn = {}
  toNewStudio(btn, { api: (path, opts) => { calls.push(['api', path, JSON.parse(opts.body).ui]); return Promise.resolve({}) } })
  btn.onclick()
  await new Promise(r => setTimeout(r, 5))
  assert.deepEqual(calls, [['api', '/api/ui', 'next'], ['go', '/?project=p1&version=r1']])
})

test("the classic page carries it, and ☰ has the row", () => {
  const list = studioModules('web')
  assert.ok(list.indexOf('uiswitch.js') >= 0 && list.indexOf('uiswitch.js') < list.indexOf('studio.js'))
  assert.match(readFileSync('web/studio.js', 'utf8'), /id="cosmos-next">.*Use the new Studio/)
})
