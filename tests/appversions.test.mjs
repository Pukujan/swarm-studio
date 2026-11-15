// An app's versions and going back to one (issue #542): each change is a commit in the app's own git, listed with
// what was asked, and going back is one more commit, so it can be undone too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { appJobs, appVersions, screenOf } from '../engine/appjob.mjs'

test('versions: the first build, then each change by what was asked, newest first; an older app by its commits', () => {
  const events = [
    { type: 'app:start', t: 1000, fresh: true, ask: 'make it a working app' },
    { type: 'app:done', t: 2000, rev: 'aaaaaaa1', result: { files: 6 } },
    { type: 'app:start', t: 3000, ask: 'Call the list "Today"' },
    { type: 'app:done', t: 4000, rev: 'bbbbbbb2', result: { files: 1 } },
    { type: 'app:back', t: 5000, rev: 'aaaaaaa1', to: 'ccccccc3', label: 'First build' }
  ]
  const v = appVersions(events, [], 'ccccccc3')
  assert.deepEqual(v.map(x => [x.what, x.rev, x.now]), [['Back to: First build', 'ccccccc3', true], ['Call the list "Today"', 'bbbbbbb2', false], ['First build', 'aaaaaaa1', false]])
  // built before changes named their commit: the last commit made by each change's end
  const old = appVersions([{ type: 'app:start', t: 1000, fresh: true }, { type: 'app:done', t: 2000 }, { type: 'app:start', t: 3000, ask: 'add a field' }, { type: 'app:done', t: 9000 }],
    [{ hash: 'h3', t: 8500 }, { hash: 'h2', t: 5000 }, { hash: 'h1', t: 1500 }], 'h3')
  assert.deepEqual(old.map(x => [x.what, x.rev, x.now]), [['add a field', 'h3', true], ['First build', 'h1', false]])
  // a project brought in has no build of its own to go back to
  assert.deepEqual(appVersions([{ type: 'app:done', t: 1, intake: true }]), [])
})

test('back: the app\'s files as that version had them, as one more commit; the newer version stays to come back to', async () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-back-'))
  const RUN = '2026-11-14T11-00-00-000Z', dir = join(runsDir, RUN, 'app')
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim()
  const commit = msg => { g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', msg); return g('rev-parse', 'HEAD') }
  try {
    mkdirSync(join(dir, 'src'), { recursive: true })
    g('init', '-q')
    writeFileSync(join(dir, 'package.json'), '{"name":"taskly"}')
    writeFileSync(join(dir, 'src', 'Tasks.tsx'), '<h1>My tasks</h1>\n')
    const first = commit('first build')
    writeFileSync(join(dir, 'src', 'Tasks.tsx'), '<h1>Today</h1>\n')
    writeFileSync(join(dir, 'src', 'Settings.tsx'), '<h1>Settings</h1>\n')
    const second = commit('a change')
    const events = [{ type: 'app:start', t: 1, fresh: true }, { type: 'app:done', t: 2, rev: first }, { type: 'app:start', t: 3, ask: 'Call it Today, add settings' }, { type: 'app:done', t: 4, rev: second }]
    const a = appJobs({ runsDir, record: (id, e) => events.push(e), broadcast() {}, readEvents: () => events, provider: () => ({}), modelFor: () => '', sweepEvery: 1e9 })
    assert.deepEqual(a.versions(RUN).versions.map(v => [v.what, v.now]), [['Call it Today, add settings', true], ['First build', false]])
    const r = await a.back(RUN, first.slice(0, 7))
    assert.equal(readFileSync(join(dir, 'src', 'Tasks.tsx'), 'utf8'), '<h1>My tasks</h1>\n')
    assert.ok(!existsSync(join(dir, 'src', 'Settings.tsx')), 'a file the version did not have is gone')
    assert.deepEqual(r.versions.map(v => [v.what, v.now]), [['Back to: First build', true], ['Call it Today, add settings', false], ['First build', false]])
    // the change it went back from is still there, and going back to it is the undo
    await a.back(RUN, second)
    assert.equal(readFileSync(join(dir, 'src', 'Tasks.tsx'), 'utf8'), '<h1>Today</h1>\n')
    assert.ok(existsSync(join(dir, 'src', 'Settings.tsx')))
    await assert.rejects(a.back(RUN, 'deadbeef'), /no such version/)
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})

test('screenOf: the route of the page a change touched, read from the app\'s router', () => {
  const routes = '<Routes>\n  <Route path="/" element={<SignIn />} />\n  <Route path="/tasks" element={<Tasks user={u} />} />\n  <Route element={<Settings />} path="/settings" />\n  <Route path="*" element={<NotFound />} />\n</Routes>'
  // a page before a component it uses, whatever order the files came in
  assert.equal(screenOf(routes, ['src/components/TaskRow.tsx', 'src/pages/Tasks.tsx']), '/tasks')
  assert.equal(screenOf(routes, ['src\\pages\\Settings.tsx']), '/settings')
  // nothing routed: the app's own first screen
  assert.equal(screenOf(routes, ['src/index.css']), null)
  assert.equal(screenOf('', ['src/pages/Tasks.tsx']), null)
})

test('a version names the files its change touched (never the build stamp), its screen and its own photo', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-changed-'))
  const RUN = '2026-11-14T12-00-00-000Z', dir = join(runsDir, RUN, 'app')
  const g = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', ...a], { cwd: dir, encoding: 'utf8' }).trim()
  const commit = msg => { g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', msg); return g('rev-parse', 'HEAD') }
  try {
    mkdirSync(join(dir, 'src', 'pages'), { recursive: true })
    g('init', '-q')
    writeFileSync(join(dir, 'src', 'App.tsx'), '<Route path="/tasks" element={<Tasks />} />')
    writeFileSync(join(dir, 'src', 'pages', 'Tasks.tsx'), '<h1>My tasks</h1>')
    const first = commit('first')
    writeFileSync(join(dir, 'src', 'pages', 'Tasks.tsx'), '<h1>Today</h1>')
    writeFileSync(join(dir, '.swarm-built.json'), '{"sig":"y"}')
    const second = commit('change')
    mkdirSync(join(runsDir, RUN, 'img'), { recursive: true })
    writeFileSync(join(runsDir, RUN, 'img', `app-${second.slice(0, 7)}.jpg`), 'x')
    const events = [{ type: 'app:start', t: 1, fresh: true }, { type: 'app:done', t: 2, rev: first }, { type: 'app:start', t: 3, ask: 'Call it Today' }, { type: 'app:done', t: 4, rev: second }]
    const a = appJobs({ runsDir, record() {}, broadcast() {}, readEvents: () => events, provider: () => ({}), modelFor: () => '', sweepEvery: 1e9 })
    const [now, was] = a.versions(RUN).versions
    assert.deepEqual(now.changed, ['src/pages/Tasks.tsx'])
    assert.equal(now.screen, '/tasks')
    assert.match(now.photo, new RegExp(`^/img/${RUN}/app-${second.slice(0, 7)}\\.jpg\\?v=`))
    assert.deepEqual([was.changed, was.photo], [[], null])
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})
