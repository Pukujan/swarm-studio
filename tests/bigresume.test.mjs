import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bigResumeAt } from '../engine/appjob.mjs'

const stage = (i, ok = true) => ({ type: 'app:stage', big: { i, ok, play: ok } })

test('a big game stopped partway goes on after its last finished stage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bigresume-'))
  try {
    const start = { type: 'app:start', kind: 'game', fresh: true }
    assert.equal(bigResumeAt([start, stage(0), stage(1)], dir), 0, 'no app yet: start over')
    writeFileSync(join(dir, 'package.json'), '{}')
    assert.equal(bigResumeAt([start, stage(0), stage(1), stage(2), stage(3)], dir), 4)
    assert.equal(bigResumeAt([start], dir), 0, 'nothing finished: start over')
    assert.equal(bigResumeAt([start, stage(0), stage(1, false)], dir), 1, 'a failed stage is done again')
    // an older build's stages do not count after a new build from scratch
    assert.equal(bigResumeAt([start, stage(0), stage(1), start, stage(0)], dir), 1)
    // a resume carries on counting from the build it resumes
    assert.equal(bigResumeAt([start, stage(0), stage(1), { type: 'app:start', fresh: true, resume: 2 }, stage(2)], dir), 3)
    // every stage done: nothing to resume
    assert.equal(bigResumeAt([start, ...[0, 1, 2, 3, 4].map(i => stage(i))], dir), 0)
    assert.equal(bigResumeAt([], dir), 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a game with its own count of slices resumes against that count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bigresume-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{}')
    const start = { type: 'app:start', kind: 'game', fresh: true }
    const s = (i, n) => ({ type: 'app:stage', big: { i, n, ok: true } })
    assert.equal(bigResumeAt([start, s(0, 3), s(1, 3), s(2, 3)], dir), 0, 'three of three: done')
    assert.equal(bigResumeAt([start, ...[0, 1, 2, 3, 4].map(i => s(i, 6))], dir), 5, 'five of six: one to go')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
