// One place for references (issue #543): what the person gives the crew lands in the project's References, the
// one place the crew's brief reads, wherever it was given. A picture sent in a project's chat is filed there too,
// and a link in a project's talk joins it before the planner is asked, so a planner that fails never loses it.
// The drop on every screen and Hermia's one question are web/refdrop.js (checked in the browser).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chatStore } from '../engine/chats.mjs'
import { chatMediaRoutes } from '../server/chatmedia.mjs'
import { CANVAS_MODULES, studioModules } from '../server/page.mjs'
import { studio } from '../scripts/walkthrough-fixtures.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

test('a picture sent in a project\'s chat is filed in that project\'s References; a loose chat\'s is not', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'refdrop-'))
  mkdirSync(join(dataDir, 'projects', 'p1'), { recursive: true })
  const chats = chatStore(dataDir)
  const filed = []
  const route = chatMediaRoutes({ chats, toProject: (pid, { name, buf, chat }) => { filed.push({ pid, name, bytes: buf.length, chat }); return { id: 'r0001', name } } })
  const srv = http.createServer((req, res) => { if (!route(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const u = `http://127.0.0.1:${srv.address().port}`
  try {
    const inProject = chats.create({ kind: 'site', project: 'p1' }).id
    const j = await fetch(`${u}/api/chats/${inProject}/media?name=mood.png`, { method: 'POST', body: PNG }).then(r => r.json())
    assert.equal(j.ref.name, 'mood.png', 'it is still the chat\'s, for this turn')
    assert.deepEqual(j.project, { id: 'p1', ref: { id: 'r0001', name: 'mood.png' } })
    assert.deepEqual(filed, [{ pid: 'p1', name: 'mood.png', bytes: PNG.length, chat: inProject }])
    const loose = chats.create({ kind: 'site' }).id
    const k = await fetch(`${u}/api/chats/${loose}/media?name=other.png`, { method: 'POST', body: PNG }).then(r => r.json())
    assert.equal(k.project, undefined)
    assert.equal(filed.length, 1, 'a chat outside a project has no References to file it in')
  } finally { srv.close() }
})

test('a link in a project\'s talk joins its References even when the planner fails', async () => {
  // the throwaway Studio's model always answers 500
  const s = await studio()
  try {
    const made = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
    const pid = made.project.id
    const said = [{ who: 'person', text: 'I love the calm of https://example.org, more of that' }]
    const res = await fetch(`${s.BASE}/api/discuss`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': 'walkthrough' }, body: JSON.stringify({ kind: 'site', project: pid, chat: made.chat?.id, said }) })
    assert.notEqual(res.status, 200, 'the planner failed')
    const { refs } = await s.api(`/api/projects/${pid}/refs`)
    const link = refs.find(r => r.kind === 'link')
    assert.ok(link, 'the link is in References')
    assert.equal(link.url, 'https://example.org/')
    assert.equal(link.source, 'chat')
    assert.equal(link.use, 'I love the calm of more of that', 'the words around it are its note')
  } finally { s.stop() }
})

test('the Design deck drops on its build\'s address: the server files it in that build\'s project', async () => {
  const s = await studio()
  const head = { 'x-swarm-token': 'walkthrough' }
  try {
    // the fixture's Alpha Tea: two versions in one project
    const pid = (await s.api('/api/projects')).projects.find(p => p.name === 'Alpha Tea').id
    const res = await fetch(`${s.BASE}/api/runs/${s.ids.site2}/refs?name=mood.png&source=upload`, { method: 'POST', headers: head, body: PNG })
    assert.equal(res.status, 200)
    const j = await res.json()
    assert.equal(j.ref.name, 'mood.png')
    assert.ok((await s.api(`/api/projects/${pid}/refs`)).refs.some(r => r.id === j.ref.id), 'it is in the project\'s References')
    // Use as is, by the same address
    const moved = await fetch(`${s.BASE}/api/runs/${s.ids.site2}/assets`, { method: 'POST', headers: { ...head, 'content-type': 'application/json' }, body: JSON.stringify({ ref: j.ref.id }) }).then(r => r.json())
    assert.ok(moved.assets.some(a => a.name === 'mood.png'))
    // a build in no project: said plainly, nothing filed
    const none = await fetch(`${s.BASE}/api/runs/2020-01-01T00-00-00-000Z/refs?name=x.png`, { method: 'POST', headers: head, body: PNG })
    assert.equal(none.status, 404)
    assert.match((await none.json()).error, /not in a project yet/)
  } finally { s.stop() }
})

test('both pages carry the one drop target, before the screens that use it', () => {
  const studioList = studioModules(join(root, 'web'))
  assert.ok(CANVAS_MODULES.indexOf('refdrop.js') >= 0 && CANVAS_MODULES.indexOf('refdrop.js') < CANVAS_MODULES.indexOf('canvas/base.js'))
  assert.ok(studioList.indexOf('refdrop.js') >= 0 && studioList.indexOf('refdrop.js') < studioList.indexOf('project.js') && studioList.indexOf('refdrop.js') < studioList.indexOf('scaffold.js'))
  // every top-level name in it says refDrop, since a page's modules share one scope
  const src = readFileSync(join(root, 'web', 'refdrop.js'), 'utf8')
  for (const m of src.matchAll(/^(?:export )?(?:const|let|function) (\w+)/gm)) assert.match(m[1], /refDrop/i, m[1])
})
