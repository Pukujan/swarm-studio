// Packages a feature needs on first use come from a committed lockfile, with no install script run (catalog review
// of e8ae13c4: hyperframes and kokoro-js as engine/images.mjs already did): engine/npmci.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { npmCi, NPM_CI } from '../engine/npmci.mjs'

const ROOT = new URL('../', import.meta.url)
const lockOf = dir => JSON.parse(readFileSync(new URL(`engine/${dir}/package-lock.json`, ROOT), 'utf8'))
const pkgOf = dir => JSON.parse(readFileSync(new URL(`engine/${dir}/package.json`, ROOT), 'utf8'))

test('npm ci, never install, and no package script runs', async () => {
  assert.deepEqual(NPM_CI.slice(0, 2), ['ci', '--ignore-scripts'])
  const dir = join(mkdtempSync(join(tmpdir(), 'npmci-')), 'tools'), calls = []
  await npmCi(fileURLToPath(new URL('../engine/voicetools/', import.meta.url)), dir, { run: (file, args, opts, done) => { calls.push({ file, args, opts }); done(null) } })
  assert.equal(calls.length, 1)
  assert.ok(calls[0].args.includes('ci') && calls[0].args.includes('--ignore-scripts') && !calls[0].args.includes('install'))
  assert.equal(calls[0].opts.cwd, dir)
  assert.ok(existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'package-lock.json')), 'the lockfile goes with it')
})

test('the film and voice tools are pinned exactly, every package with its integrity', () => {
  for (const [dir, want] of [['videotools', { hyperframes: '0.9.26', '@ffmpeg-installer/ffmpeg': '1.1.0', '@ffprobe-installer/ffprobe': '2.1.2' }], ['voicetools', { 'kokoro-js': '1.2.1' }], ['imagetools', null]]) {
    const pkg = pkgOf(dir), lock = lockOf(dir)
    for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, `${dir}: an exact version`)
    if (want) for (const [name, v] of Object.entries(want)) assert.equal(lock.packages[`node_modules/${name}`]?.version, v, `${dir}: ${name}`)
    for (const [path, p] of Object.entries(lock.packages)) if (path && !p.link) assert.match(p.integrity || '', /^sha512-/, `${dir}: ${path} has its integrity`)
  }
})

test('no first-use install runs npm install', () => {
  for (const f of ['engine/video.mjs', 'engine/sound.mjs', 'engine/images.mjs']) {
    const src = readFileSync(new URL(f, ROOT), 'utf8')
    assert.doesNotMatch(src, /\['install'/, f)
    assert.match(src, /npmCi\(/, f)
  }
})
