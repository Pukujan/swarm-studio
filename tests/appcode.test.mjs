// The app's Code and its photo, as the App room reads them (issue #542): every file opens on every system, Swarm's
// own build stamp is not listed, and the built app's photo is served.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appJobs } from '../engine/appjob.mjs'
import { startStudio } from '../scripts/studio-child.mjs'

const RUN = '2026-11-14T10-00-00-000Z'
const app = runsDir => {
  const dir = join(runsDir, RUN, 'app')
  mkdirSync(join(dir, 'src', 'pages'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"taskly"}')
  writeFileSync(join(dir, 'src', 'pages', 'Tasks.tsx'), 'export default function Tasks() { return <h1>Today</h1> }\n')
  writeFileSync(join(dir, '.swarm-built.json'), '{"sig":"x"}')
  return dir
}

test('Code lists the app\'s files with forward slashes, without the build stamp, and opens each one', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-code-'))
  try {
    app(runsDir)
    const a = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => [], provider: () => ({}), modelFor: () => '', sweepEvery: 1e9 })
    const listed = a.files(RUN).files.map(f => f.path)
    assert.deepEqual(listed, ['package.json', 'src/pages/Tasks.tsx'])
    // the path as listed opens, on Windows too (its joined path has backslashes)
    assert.match(a.files(RUN, 'src/pages/Tasks.tsx').text, /Today/)
    for (const out of ['../../events.jsonl', '..\\..\\events.jsonl', 'node_modules/x.js']) assert.throws(() => a.files(RUN, out), /no such file/, out)
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})

test('the built app\'s photo is served at the address its event names', async () => {
  const data = mkdtempSync(join(tmpdir(), 'swarm-photo-'))
  const runsDir = join(data, 'runs')
  mkdirSync(join(runsDir, RUN, 'img'), { recursive: true })
  writeFileSync(join(runsDir, RUN, 'img', 'app.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  const { child, base } = await startStudio({ env: { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runsDir, SWARM_OUTPUT_DIR: join(data, 'out'), HERMES_HOME: join(data, 'hermes'), SWARM_HERMES_RUNNING: '0' } })
  try {
    const r = await fetch(`${base}/img/${RUN}/app.jpg?v=1`)
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type') || '', /image\/jpeg/)
  } finally {
    const gone = new Promise(r => child.once('exit', r))
    child.kill()
    await gone
    rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
