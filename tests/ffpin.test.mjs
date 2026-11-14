// The ffmpeg download is pinned and checked (Nous catalog review, point 7): exact package versions, and a
// binary whose SHA-256 is not the recorded one is never run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FF_PACKAGES, FF_SHA256, ffBinary, checkFf } from '../engine/video.mjs'

test('the ffmpeg packages are exact versions', () => {
  for (const spec of Object.values(FF_PACKAGES)) assert.match(spec, /^@ff(mpeg|probe)-installer\/ff(mpeg|probe)@\d+\.\d+\.\d+$/)
  const src = readFileSync(new URL('../engine/video.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /'@ff(mpeg|probe)-installer\/ff(mpeg|probe)'/, 'an unpinned ffmpeg package name is installed somewhere')
  assert.match(src, /'--save-exact'/)
})

test('every platform has both checksums', () => {
  for (const sums of Object.values(FF_SHA256)) for (const name of ['ffmpeg', 'ffprobe']) assert.match(sums[name], /^[0-9a-f]{64}$/)
  assert.ok(FF_SHA256['darwin-arm64'] && FF_SHA256['linux-x64'] && FF_SHA256['win32-x64'])
})

test('a binary that does not match its checksum is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ffpin-'))
  const file = ffBinary(dir, 'ffmpeg', 'linux-x64')
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, '#!/bin/sh\necho swapped\n')
  assert.throws(() => checkFf(file, 'ffmpeg', 'linux-x64'), /does not match its recorded checksum/)
  assert.throws(() => checkFf(file, 'ffmpeg', 'aix-ppc64'), /no checked ffmpeg/)
  assert.throws(() => checkFf(join(dir, 'nope'), 'ffprobe', 'linux-x64'), /missing/)
})
