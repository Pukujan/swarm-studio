// A build shows which references it used (issue #543): when a project's build starts, the references that reach
// its brief are kept beside it (refs-used.json), with what it took from each, and its board hands them to the
// Overview, which lists them on its pages and says on each reference whether this build took it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { refStore } from '../engine/refs.mjs'
import { runBoard } from '../server/board.mjs'
import { studio } from '../scripts/walkthrough-fixtures.mjs'

const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }

test('used: the references a build starting now reads, with what it takes from each', () => {
  const projectsDir = mkdtempSync(join(tmpdir(), 'refsused-'))
  mkdirSync(join(projectsDir, 'p1'))
  const s = refStore({ projectsDir, known: pid => pid === 'p1' })
  const pic = s.addFile('p1', { name: 'mood.png' }, png(2, 2))
  s.addFile('p1', { name: 'walk.mp4' }, Buffer.from('x'))
  s.addFile('p1', { name: 'brief.pdf' }, Buffer.from('%PDF'))
  const link = s.addLink('p1', { url: 'https://example.com' })
  assert.deepEqual(s.used('p1'), [
    { id: pic.id, name: 'mood.png', kind: 'image', what: ['its look'] },
    { id: link.id, name: 'example.com', kind: 'link', what: ['the address'] }
  ], 'a clip and a document not read yet give the build nothing')
})

test('the board hands over what the build used; an older build says nothing', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'refsused-runs-'))
  mkdirSync(join(runsDir, 'a')); mkdirSync(join(runsDir, 'b'))
  writeFileSync(join(runsDir, 'a', 'refs-used.json'), JSON.stringify([{ id: 'r0001', name: 'mood.png', kind: 'image', what: ['its look'] }]))
  const events = [{ type: 'run:start', brief: 'a cafe' }]
  assert.deepEqual(runBoard('a', events, runsDir).refsUsed, [{ id: 'r0001', name: 'mood.png', kind: 'image', what: ['its look'] }])
  assert.equal(runBoard('b', events, runsDir).refsUsed, null, 'not known, so not said')
})

test('a project\'s build keeps the references it read, and its board shows them', async () => {
  const s = await studio()
  const head = { 'x-swarm-token': 'walkthrough' }
  try {
    const made = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
    const pid = made.project.id
    const ref = (await fetch(`${s.BASE}/api/projects/${pid}/refs?name=mood.png&source=upload`, { method: 'POST', headers: head, body: png(4, 4) }).then(r => r.json())).ref
    const res = await fetch(`${s.BASE}/api/run`, { method: 'POST', headers: { ...head, 'content-type': 'application/json' }, body: JSON.stringify({ brief: 'Cedar Cafe', project: pid, sure: true }) })
    assert.equal(res.status, 200)
    const { run } = await res.json()
    const board = await s.api(`/api/runs/${encodeURIComponent(run)}/board`)
    assert.deepEqual(board.refsUsed, [{ id: ref.id, name: 'mood.png', kind: 'image', what: ['its look'] }])
  } finally { s.stop() }
})
