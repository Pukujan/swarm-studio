// A page's picture, taken inside the page (web/capture.js, web/frame.html `capture`; spec 36, image-first boards
// §3.7): the frame loads nothing from outside, photographs itself once and transfers the bitmap; the worker makes each
// size and closes every bitmap; the Overview's snapshots and every snapFrame caller go through it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { MAX_HEIGHT, LIB, sizeAt } from '../web/capture.js'
import { VENDORED } from '../scripts/vendor.mjs'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('the frame photographs itself with the vendored library, and fetches nothing from outside', () => {
  const frame = read('web/frame.html')
  assert.match(frame, /m\.type === 'capture'\) capture\(m\)/)
  // the library comes in a message, from the plugin's own server, only for a page that is photographed
  assert.match(frame, /if \(m\.lib && !window\.snapdom\)/)
  assert.match(frame, /say\(\{ need: 'lib' \}\)/)
  assert.doesNotMatch(frame, /cdn\.jsdelivr|html-to-image|unpkg|https:\/\/[\w.-]+\/npm\//)
  // one bitmap, transferred (not copied), and the canvas let go at once
  assert.match(frame, /createImageBitmap\(canvas\)/)
  assert.match(frame, /msg\.bitmap \? \[msg\.bitmap\] : \[\]/)
  assert.match(frame, /canvas\.width = canvas\.height = 0/)
  // the painters' marks and the review's scan line stay out of the picture
  assert.match(frame, /exclude: \['#scan', '\.pt-mark'\]/)
})

test('the library is vendored, pinned and served from web/vendor/', () => {
  const lib = VENDORED.find(l => l.name === '@zumer/snapdom')
  assert.ok(lib, 'snapDOM is in scripts/vendor.mjs')
  assert.equal(lib.out, `web/${LIB}`)
  assert.ok(existsSync(new URL(`../${lib.out}`, import.meta.url)))
  assert.match(read(lib.out), /window\.snapdom=/)
})

test('the worker makes each size from the one bitmap, off the main thread, and closes every bitmap', () => {
  const src = read('web/capture.js')
  assert.match(src, /new Worker\(url\)/)
  assert.match(src, /URL\.createObjectURL\(new Blob\(\[`\(\$\{workerMain\}\)\(\)`\]/)
  assert.match(src, /createImageBitmap\(bitmap, \{ resizeWidth: w, resizeHeight: h, resizeQuality: 'high' \}\)/)
  assert.match(src, /convertToBlob\(\{ type: 'image\/jpeg', quality \}\)/)
  // every bitmap it makes, and the one it was given (in the worker and in the main-thread stand-in)
  assert.equal((src.match(/if \(!same\) b\.close\(\)/g) || []).length, 2)
  assert.equal((src.match(/finally \{ bitmap\.close\(\) \}/g) || []).length, 2)
  // the bitmap goes to the worker transferred
  assert.match(src, /w\.postMessage\(\{ seq: n, bitmap, sizes, quality \}, \[bitmap\]\)/)
})

test('each size keeps the page\'s shape, and a page is photographed nine widths long at most', () => {
  assert.equal(MAX_HEIGHT, 9 * 1280)
  assert.deepEqual(sizeAt(1280, 3000, 0.25), { w: 320, h: 750 })
  assert.deepEqual(sizeAt(1280, 3000, 0.6), { w: 768, h: 1800 })
  assert.deepEqual(sizeAt(1280, 1, 0.25), { w: 320, h: 1 })
})

test('the Overview\'s snapshots and every picture of a page go through the in-page capture', () => {
  const project = read('web/project.js'), marks = read('web/canvas/marks.js'), hook = read('web/canvas/hook.js')
  // one capture makes both stored sizes; the full one alone only when the small one is saved already
  assert.match(project, /sw\.capture\?\.\(id, v \? \[0\.25, 0\.6\] : \[0\.25\]\)/)
  assert.match(project, /sw\.capture\?\.\(id, \[0\.6\]\)/)
  assert.doesNotMatch(project, /sw\.thumb\(id\)|sw\.thumb\(id, 0\.6\)/)
  // spec 36's rules stay: idle time, never while the camera moves, only a page with no picture of its version
  assert.match(project, /const rest = performance\.now\(\) - P\.camAt\n\s+if \(rest < 400\) return pump\(400 - rest\)/)
  assert.match(project, /idle\(\(\) => shootFull\(run, id, v, visit, out\.urls\.get\(0\.6\)\)\)/)
  assert.match(hook, /async capture\(id, scales = \[0\.25, 0\.6\]\)/)
  assert.match(marks, /export const pageCapture = makeCapture\(\{ base: BASE \}\)/)
  assert.match(marks, /export async function snapFrame\(f, scale\) \{\n  const s = scale \|\| 0\.625\n  const out = await pageCapture\.shoot/)
  // nothing asks a frame for the old `snap` any more
  for (const f of ['web/canvas/deck.js', 'web/canvas/marks.js', 'web/frame.html']) assert.doesNotMatch(read(f), /type: 'snap'|m\.type === 'snap'/, f)
})

test('the inlined studio carries web/capture.js', () => {
  assert.match(read('server/page.mjs'), /'capture\.js', 'clean\.js'/)
})
