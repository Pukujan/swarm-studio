// A build another Swarm Studio drives: this one reads it from the shared run log and
// shows it building, with the live address, instead of "stopped".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appJobs } from '../engine/appjob.mjs'

const now = Date.now()
const log = (age) => [
  { type: 'app:start', t: now - 60e3 - age, kind: 'game' },
  { type: 'app:ready', t: now - 50e3 - age, url: 'http://127.0.0.1:52768/' },
  { type: 'app:step', t: now - 40e3 - age, step: { kind: 'setup', text: 'stage 4 of 5: the hub', t: now - 40e3 - age } },
  { type: 'app:step', t: now - age, step: { kind: 'turn', text: 'turn 1: building', t: now - age } },
]

test('a recent build from another Studio shows as working, with its address', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'runs-'))
  try {
    const jobs = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => log(0), provider: () => ({}), modelFor: () => '' })
    const s = jobs.state('r1')
    assert.equal(s.state, 'working')
    assert.equal(s.elsewhere, true)
    assert.equal(s.url, 'http://127.0.0.1:52768/')
    assert.match(s.stage, /^stage 4 of 5/)
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})

test('a build whose log went quiet long ago is not taken for running', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'runs-'))
  try {
    const jobs = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => log(30 * 60e3), provider: () => ({}), modelFor: () => '' })
    assert.notEqual(jobs.state('r1').elsewhere, true)
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})

test('a big game waiting after a slice reads back as paused, with its slice for the chat', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'runs-'))
  try {
    const slice = { i: 0, n: 4, name: 'the core run', ask: 'Slice 1 of 4…', ideas: ['Looks good, go on'], clip: '/img/r1/playtest-1.webm' }
    const events = [...log(0), { type: 'app:stage', t: now, big: { i: 0, n: 4, ok: true } }, { type: 'app:paused', t: now, slice }]
    const jobs = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => events, provider: () => ({}), modelFor: () => '' })
    const s = jobs.state('r1')
    assert.equal(s.state, 'paused')
    assert.notEqual(s.elsewhere, true)
    assert.deepEqual(s.slice, slice)
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})

test('a build whose Studio process is gone reads as stopped at once, not as building elsewhere', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'runs-'))
  try {
    const dead = 2 ** 22 + 12345 // above any pid macOS or Linux hands out
    const events = log(0).map(e => e.type === 'app:start' ? { ...e, pid: dead } : e)
    const jobs = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => events, provider: () => ({}), modelFor: () => '' })
    assert.notEqual(jobs.state('r1').elsewhere, true)
    assert.equal(jobs.state('r1').state, 'stopped')
    // one whose process still runs (here: this test's own parent) is still taken for running
    const live = log(0).map(e => e.type === 'app:start' ? { ...e, pid: process.ppid } : e)
    const jobs2 = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => live, provider: () => ({}), modelFor: () => '' })
    assert.equal(jobs2.state('r1').elsewhere, true)
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})
