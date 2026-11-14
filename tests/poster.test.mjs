// Clips get a poster frame, and every board video goes through web/video.js (image-first boards §3.6).
// The browser side (teardown, the budget, scrolling a board of 10 clips) is scripts/video-check.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePoster, posterPath, posterFfmpeg } from '../engine/poster.mjs'
import { findFfmpeg } from '../engine/playtest.mjs'
import { posterFor } from '../web/video.js'
import { startStudio } from '../scripts/studio-child.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

test('the server and the boards name a clip\'s poster the same way', () => {
  assert.equal(posterPath('/runs/r/img/playtest-3.webm'), '/runs/r/img/playtest-3.poster.jpg')
  assert.equal(posterPath('/runs/r/video/promo-tall.mp4'), '/runs/r/video/promo-tall.poster.jpg')
  assert.equal(posterFor('/img/r/playtest-3.webm'), '/img/r/playtest-3.poster.jpg')
  assert.equal(posterFor('/video/r/promo.mp4?v=17'), '/video/r/promo.poster.jpg?v=17')
  assert.equal(posterFor('/img/r/idle-0a1b2c3d.mp4'), '/img/r/idle-0a1b2c3d.poster.jpg')
  assert.equal(posterFor('/img/r/snap.jpg'), '')
  assert.equal(posterFor(''), '')
})

test('with no ffmpeg there is no poster, and nothing is run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poster-'))
  try {
    writeFileSync(join(dir, 'clip.webm'), 'not a video')
    assert.equal(await makePoster(join(dir, 'clip.webm'), { ffmpeg: null }), null)
    assert.equal(await makePoster(join(dir, 'missing.webm'), { ffmpeg: 'ffmpeg' }), null)
    assert.equal(posterFfmpeg(dir, () => null), null)
    mkdirSync(join(dir, 'video-tools', 'bin'), { recursive: true })
    const pinned = join(dir, 'video-tools', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    writeFileSync(pinned, '')
    assert.equal(posterFfmpeg(dir, () => '/usr/bin/ffmpeg'), pinned, 'the pinned ffmpeg the film renderer installed comes first')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const ff = findFfmpeg()
test('a clip\'s poster is a JPEG frame of it, beside it', { skip: !ff && 'no ffmpeg here' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poster-'))
  try {
    const clip = join(dir, 'playtest-1.webm')
    execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x200:rate=10', '-t', '2', '-c:v', 'libvpx', clip])
    const out = await makePoster(clip, { ffmpeg: ff })
    assert.equal(out, join(dir, 'playtest-1.poster.jpg'))
    const jpg = readFileSync(out)
    assert.deepEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff])
    // a clip shorter than half a second still gets its first frame
    const short = join(dir, 'short.webm')
    execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x100:rate=10', '-t', '0.2', '-c:v', 'libvpx', short])
    assert.ok(await makePoster(short, { ffmpeg: ff }))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the server serves a clip\'s poster, and a missing one is a 404', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poster-srv-'))
  const runs = join(dir, 'runs')
  mkdirSync(join(runs, 'r1', 'img'), { recursive: true })
  mkdirSync(join(runs, 'r1', 'video'), { recursive: true })
  writeFileSync(join(runs, 'r1', 'img', 'playtest-2.poster.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  writeFileSync(join(runs, 'r1', 'video', 'promo.poster.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: join(dir, 'data'), SWARM_RUNS_DIR: runs, SWARM_OUTPUT_DIR: join(dir, 'out'), HERMES_HOME: join(dir, 'hermes'), SWARM_FFMPEG: join(dir, 'no-ffmpeg') }
  // on a port of its own, which it says once it listens (scripts/studio-child.mjs)
  const { child, base } = await startStudio({ env })
  try {
    const got = await fetch(`${base}/img/r1/playtest-2.poster.jpg`)
    assert.equal(got.status, 200)
    assert.equal(got.headers.get('content-type'), 'image/jpeg')
    assert.equal((await fetch(`${base}/video/r1/promo.poster.jpg`)).status, 200)
    assert.equal((await fetch(`${base}/img/r1/playtest-9.poster.jpg`)).status, 404)
    assert.equal((await fetch(`${base}/video/r1/promo-tall.poster.jpg`)).status, 404)
  } finally { child.kill(); rmSync(dir, { recursive: true, force: true }) }
})

test('every board <video> in web/ goes through web/video.js: no src or autoplay written into the element', () => {
  const files = []
  const walk = d => { for (const n of readdirSync(join(root, d), { withFileTypes: true })) { const p = `${d}/${n.name}`; if (n.isDirectory() && n.name !== 'vendor') walk(p); else if (n.name.endsWith('.js')) files.push(p) } }
  walk('web')
  for (const f of files) {
    if (f === 'web/video.js') continue
    const src = readFileSync(join(root, f), 'utf8')
    const tags = [...src.matchAll(/<video\b[^>]*>/g)].map(m => m[0])
    for (const t of tags) assert.doesNotMatch(t, /\ssrc=|\sautoplay\b/, `${f}: ${t} (use data-src and adoptVideos, or boardVideo)`)
    if (tags.length) assert.match(src, /from '(\.\.\/|\.\/)video\.js'/, `${f} writes a <video> and does not use web/video.js`)
    for (const m of src.matchAll(/createElement\('video'\)/g)) {
      const after = src.slice(m.index, m.index + 400)
      assert.match(after, /boardVideo\(/, `${f}: a video made with createElement goes to boardVideo`)
    }
  }
  assert.ok(existsSync(join(root, 'web', 'video.js')))
})
