// Nothing builds unasked (the owner's Night Runner session, 2026-11-12): a showcase from the ideas pop
// built a whole App on one click. Now a showcase, the Make box and the no-question paths open a chat
// with the brief shown and build only on Build; Stop ends an auto run as stopped, not failed; and the
// tiles of an opened project are its versions, not projects of their own.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('a showcase opens a chat with its brief; it never starts a build on the click', () => {
  const home = src('web/home.js')
  assert.doesNotMatch(home, /start\(s\.prompt/)
  assert.match(home, /confirmBuild\(s\.prompt/)
  assert.match(home, /function confirmBuild\(/)
  assert.match(home, /brief: text/)
  // the Make box without questions confirms too
  assert.match(home, /if \(!qs\.length\) return confirmBuild\(text\)/)
  assert.doesNotMatch(home, /if \(!qs\.length\) return start\(text\)/)
})

test('the talk shows a given brief with its Build button', () => {
  const canvas = src('web/canvas.js')
  assert.match(canvas, /brief = ''/)
  assert.match(canvas, /talkBrief\(brief, '', what\)/)
})

test('Stop ends an auto run as stopped, not failed', () => {
  const auto = src('engine/auto.mjs')
  assert.match(auto, /job\.state = job\.stopped \? 'stopped'/)
  assert.match(auto, /if \(job\.stopped\) \{ set\(id, 'skipped', 'stopped'\); continue \}\n\s+set\(id, 'failed'/)
})

test('an opened project lists its versions as Version n, not as projects', () => {
  const home = src('web/home.js')
  assert.match(home, /title: `Version \$\{p\.versions\.length - i\}`/)
  assert.doesNotMatch(home, /title: `\$\{p\.title\} \$\{p\.versions\.length - i\}`/)
})
