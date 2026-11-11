import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appJobs, isQuestion } from '../engine/appjob.mjs'

test('a question to the crew is told apart from a change', () => {
  for (const q of ['whats going on', 'what is happening?', 'why is she so small', 'is it done', 'how long left?']) assert.ok(isQuestion(q), q)
  for (const c of ['make Mika bigger', 'use the cat sheet for Kumo', 'no people in the background']) assert.ok(!isQuestion(c), c)
})

test('words told during a build are queued and kept with the run, only while it builds', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-tell-'))
  mkdirSync(join(runsDir, 'r1'))
  writeFileSync(join(runsDir, 'r1', 'events.jsonl'), '')
  const kept = []
  const a = appJobs({ runsDir, record: (id, e) => kept.push(e), broadcast: () => {}, readEvents: () => [], provider: () => ({}), modelFor: () => '' })
  assert.equal(a.tell('r1', 'make Mika bigger').queued, false)
  a.jobs.set('r1', { id: 'r1', state: 'working', steps: [] })
  const r = a.tell('r1', '  make Mika bigger  ')
  assert.equal(r.queued, true)
  assert.equal(r.waiting, 1)
  assert.deepEqual(a.jobs.get('r1').told, ['make Mika bigger'])
  assert.ok(kept.some(e => e.type === 'app:told' && e.text === 'make Mika bigger'))
  assert.equal(a.tell('r1', '   ').queued, false)
})

test('Hermia knows the play test runs by itself after each slice, and which slice it is on', async () => {
  const { processNotes } = await import('../engine/appjob.mjs')
  const n = processNotes({ kind: 'game', state: 'working', stage: 'stage 1 of 4: move, jump and climb' })
  assert.match(n, /play test runs by itself/)
  assert.match(n, /slice 1 of 4/)
  assert.match(processNotes({ kind: 'game', state: 'paused', stage: 'stage 2 of 4', done: ['slice 1 the core run'] }), /paused.*go on/)
  assert.doesNotMatch(processNotes({ kind: 'site' }), /play test/)
})
