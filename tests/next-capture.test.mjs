// node --test tests/next-capture.test.mjs
// The next UI's Overview photographs a page that changed (ui/src/screens/overview/snaps.ts, Snapper.tsx), by the
// rules web/project.js keeps in the current Studio (spec 36) and with its capture (web/capture.js, image-first boards
// §3.7): one page at a time, in view, with the camera at rest, and only a version with no saved picture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wanted, pick, pageShaped, withShots, REST_MS, TRIES, RETRY_MS, SMALL, FULL } from '../ui/src/screens/overview/snaps.ts'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const BOARD = {
  id: 'r1',
  pages: [{ id: 'home', title: 'Home' }, { id: 'plans', title: 'Plans' }, { id: 'gifts', title: 'Gifts' }, { id: 'new', title: 'New' }],
  snaps: { pages: { home: { v: 'a', s: '/snaps/r1/home.a.s.jpg', f: '/snaps/r1/home.a.f.jpg' }, plans: { v: 'b' }, gifts: { v: 'c', s: '/snaps/r1/gifts.c.s.jpg' } } }
}

test('the rules are web/project.js\'s', () => {
  const project = read('web/project.js')
  assert.match(project, new RegExp(`if \\(rest < ${REST_MS}\\) return pump\\(${REST_MS} - rest\\)`))
  assert.match(project, new RegExp(`>= ${TRIES}\\) return`))
  assert.match(project, new RegExp(`setTimeout\\(thumbs, ${RETRY_MS}\\)`))
  assert.match(project, new RegExp(`\\[${SMALL}, ${FULL}\\]`))
})

test('only a page with no saved picture of its version is wanted: the small one, else the full one', () => {
  const w = wanted(BOARD, new Map())
  assert.deepEqual([...w.s], [['plans', 'b']])
  assert.deepEqual([...w.f], [['gifts', 'c']])
  // a page with no version yet (no events of its own) is not photographed
  assert.ok(!w.s.has('new') && !w.f.has('new'))
  // photographed here for this version already (kept, or refused as stale): not asked for again
  assert.equal(wanted(BOARD, new Map([['plans', { v: 'b', s: 'data:s' }]])).s.size, 0)
  assert.deepEqual([...wanted(BOARD, new Map([['plans', { v: 'old', s: 'data:s' }]])).s], [['plans', 'b']])
  assert.equal(wanted(null, new Map()).s.size, 0)
})

test('the next picture is a small one in view, then a full one in view; a page out of view, or failed, waits', () => {
  const w = { s: new Map([['plans', 'b'], ['x', 'y']]), f: new Map([['gifts', 'c']]) }
  const all = () => true
  assert.deepEqual(pick(w, all, new Set()), { page: 'plans', v: 'b', scales: [0.25, 0.6] })
  assert.deepEqual(pick(w, p => p !== 'plans', new Set()), { page: 'x', v: 'y', scales: [0.25, 0.6] })
  assert.deepEqual(pick(w, p => p === 'gifts', new Set()), { page: 'gifts', v: 'c', scales: [0.6] })
  assert.deepEqual(pick(w, all, new Set(['plans', 'x'])), { page: 'gifts', v: 'c', scales: [0.6] })
  assert.equal(pick(w, () => false, new Set()), null)
})

test('a thin strip is not a page', () => {
  assert.equal(pageShaped(1280, 300), false)
  assert.equal(pageShaped(1280, 2400), true)
})

test('pictures taken here are drawn at once, and a changed page keeps its last one until its new one comes', () => {
  const kept = new Map([['plans', { v: 'b', s: 'data:s', f: 'data:f' }], ['gifts', { v: 'c', s: '/snaps/r1/gifts.c.s.jpg', f: 'data:gf' }], ['home', { v: 'z', s: 'data:old' }]])
  const b = withShots(BOARD, kept)
  assert.deepEqual(b.snaps.pages.plans, { v: 'b', s: 'data:s', f: 'data:f' })
  assert.deepEqual(b.snaps.pages.gifts, { v: 'c', s: '/snaps/r1/gifts.c.s.jpg', f: 'data:gf' })
  // the server's saved picture wins over an older one taken here
  assert.equal(b.snaps.pages.home.s, '/snaps/r1/home.a.s.jpg')
  // the page moved on (version d, nothing saved yet): the last picture stays, its full one does not
  const moved = withShots({ ...BOARD, snaps: { pages: { ...BOARD.snaps.pages, plans: { v: 'd' } } } }, kept)
  assert.deepEqual(moved.snaps.pages.plans, { v: 'd', s: 'data:s' })
  assert.equal(withShots(BOARD, new Map()), BOARD)
})

test('the page runs in a sandboxed frame of its own, photographs itself, and both sizes are kept on the server', () => {
  const snapper = read('ui/src/screens/overview/Snapper.tsx'), frame = read('ui/src/screens/deck/PageFrame.tsx')
  assert.match(snapper, /import \{ dataUrl, makeCapture \} from '@studio\/capture'/)
  assert.match(snapper, /<PageFrame key=/)
  assert.match(frame, /sandbox="allow-scripts"/)
  assert.doesNotMatch(frame, /allow-same-origin/)
  assert.match(snapper, /capture\.shoot\(win, \{ scales: job\.scales \}\)/)
  assert.match(snapper, /post\(`\/api\/runs\/\$\{enc\(run\)\}\/snaps`, \{ page: job\.page, v: job\.v, size, image \}\)/)
  // never while the camera moves, never in a hidden tab, in idle time
  assert.match(snapper, /if \(rest < REST_MS\) return next\(REST_MS - rest\)/)
  assert.match(snapper, /if \(document\.hidden\)/)
  assert.match(snapper, /idle\(\(\) => \{ if \(!gone\) setJob\(j\) \}\)/)
  // the alias and its types
  assert.match(read('ui/vite.config.ts'), /find: '@studio\/capture', replacement: fileURLToPath\(new URL\('\.\.\/web\/capture\.js'/)
  assert.match(read('ui/tsconfig.json'), /"@studio\/capture": \["\.\/src\/board\/studio-capture\.d\.ts"\]/)
  assert.match(read('ui/src/screens/Overview.tsx'), /\{snaps\.booth\}/)
})
