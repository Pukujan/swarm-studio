import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { keyFor, keyNamed, keyClash, otherKey, measureKey, keyTrouble, CLASH } from '../engine/keycolor.mjs'

test('before a picture exists the key is a guess from the words', () => {
  assert.equal(keyFor('yellow rain jacket').name, 'magenta')
  assert.equal(keyFor('an elegant pink-haired caster').name, 'green')
  assert.deepEqual(keyNamed('blue'), { name: 'blue', hex: '#0000FF' })
  assert.equal(keyNamed('teal').name, 'magenta')
})

test('a measured clash names the problem and the key to paint on', () => {
  const c = keyClash({ key: 'magenta', clash: 0.2, best: 'green' })
  assert.equal(c.to, 'green')
  assert.equal(keyTrouble([c.problem]), true)
  // a sheet's report names its key `name`
  assert.equal(keyClash({ name: 'green', clash: 0.2, best: 'blue' }).to, 'blue')
  // under the threshold, already on the best key, or a plain background: nothing to do
  assert.equal(keyClash({ key: 'magenta', clash: CLASH / 2, best: 'green' }), null)
  assert.equal(keyClash({ key: 'magenta', clash: 0.2, best: 'magenta' }), null)
  assert.equal(keyClash({ key: null, clash: 0, best: 'green' }), null)
  assert.equal(keyClash(undefined), null)
})

test('the other key to try is the best-scoring one that is not the current', () => {
  assert.equal(otherKey({ magenta: 0.4, green: 0.01, blue: 0.2 }, 'green'), 'blue')
  assert.equal(otherKey({ magenta: 0, green: 0, blue: 0 }, 'magenta'), 'green')
  assert.equal(otherKey(undefined, 'green'), 'magenta')
})

test('measureKey reads the cutter and gives null when it cannot measure', async () => {
  const run = (py, args, opts, cb) => cb(null, '{"pick":"green","scores":{"magenta":0.4,"green":0,"blue":0.1},"key":"magenta","clash":0.4}\n')
  const m = await measureKey('x.png', { run })
  assert.equal(m.pick, 'green')
  assert.match((await new Promise(ok => measureKey('x.png', { run: (py, args, o, cb) => { ok(args); cb(null, '{}') } })))[0], /cutout\.py$/)
  assert.equal(await measureKey('x.png', { run: (py, args, o, cb) => cb(new Error('no python'), '') }), null)
  assert.equal(await measureKey('x.png', { run: (py, args, o, cb) => cb(null, 'not json') }), null)
})

// the real cutter, on a real (tiny) picture: skipped where Python has no Pillow
const py = process.platform === 'win32' ? 'python' : 'python3'
let pillow = true
try { execFileSync(py, ['-c', 'import PIL'], { stdio: 'ignore' }) } catch { pillow = false }
test('measureKey picks green for a pink figure painted on magenta', { skip: !pillow }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'keypick-'))
  const file = join(dir, 'pink.png')
  writeFileSync(join(dir, 'make.py'), `from PIL import Image, ImageDraw\nim = Image.new("RGB", (160, 160), (255, 0, 255))\nImageDraw.Draw(im).ellipse((40, 20, 120, 150), fill=(240, 120, 200), outline=(20, 10, 30), width=4)\nim.save(r"${file}")\n`)
  execFileSync(py, [join(dir, 'make.py')])
  const m = await measureKey(file)
  assert.equal(m.key, 'magenta')
  assert.equal(m.pick, 'green')
  assert.ok(m.clash > 0.5)
})
