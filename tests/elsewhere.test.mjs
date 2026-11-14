// A build another Swarm Studio drives: this one reads it from the shared run log and
// shows it building, with the live address, instead of "stopped".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appJobs, sourceSig } from '../engine/appjob.mjs'

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

test('a build read from the log says which slice it is on, even once the status line moved on', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'runs-'))
  try {
    const events = [...log(0), { type: 'app:step', t: now, step: { kind: 'think', text: 'next step', t: now } }]
    const jobs = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => events, provider: () => ({}), modelFor: () => '' })
    assert.deepEqual(jobs.state('r1').at, [4, 5])
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})

// The owner, 2026-11-14: "Play it live" on a slice's chat card did nothing. The slice's server had been stopped
// (nobody looking), the game read as "no app" (no build has finished yet), and nothing started it again.
test('a big game waiting after a slice can be opened to play, and is still waiting afterwards', async () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'runs-'))
  let jobs
  try {
    const slice = { i: 0, n: 4, name: 'the core run', ask: 'Slice 1 of 4…', ideas: ['Looks good, go on'] }
    const events = [...log(0), { type: 'app:stage', t: now, big: { i: 0, n: 4, ok: true } }, { type: 'app:paused', t: now, slice, url: 'http://127.0.0.1:52768/' }]
    jobs = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => events, provider: () => ({}), modelFor: () => '' })
    // no files: nothing to serve, and it says so
    assert.equal(jobs.state('r1').canServe, false)
    await assert.rejects(jobs.open('r1'), /no app yet/)
    // its files, already built (the stamp matches the source): served as files, no build, no process
    const dir = join(runsDir, 'r1', 'app')
    mkdirSync(join(dir, 'dist'), { recursive: true })
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'package.json'), '{"name":"game"}')
    writeFileSync(join(dir, 'src', 'main.ts'), 'export {}')
    writeFileSync(join(dir, 'dist', 'index.html'), '<canvas></canvas>')
    writeFileSync(join(dir, '.swarm-built.json'), JSON.stringify({ sig: sourceSig(dir), server: false }))
    const before = jobs.state('r1')
    assert.deepEqual([before.state, before.hasApp, before.canServe, before.url || null], ['paused', false, true, null], 'not an app yet, but there to play; the address in the log is not trusted')
    const opened = await jobs.open('r1')
    assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/$/)
    assert.equal(await fetch(opened.url).then(r => r.text()), '<canvas></canvas>')
    assert.equal(opened.state, 'paused', 'opening it to play does not end the wait')
    assert.deepEqual(jobs.state('r1').slice, slice, 'the slice is still there to answer')
  } finally { await jobs?.close?.(); rmSync(runsDir, { recursive: true, force: true }) }
})
