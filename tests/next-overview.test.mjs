// node --test tests/next-overview.test.mjs
// The Overview in the next UI (ui/src/screens/Overview.tsx, issue #404): its rules are web/project.js's, so both apps
// group, size and open the same files the same way. Node runs the TypeScript file as it is (its types stripped).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SECTIONS, groups, findItem, isShut, pageH, planRatio, boardSize, skeletonBlocks, facts, acts, opening, download, projectOf, moveAfterLoad, pollMs, projectName } from '../ui/src/screens/overview/model.ts'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const plan = [{ id: 'hero', role: 'hero', h: 720, done: true }, { id: 'menu', h: 520 }]
const BOARD = {
  id: 'r1', title: 'Alpha Tea — tea for night shifts', kind: 'site',
  pages: [{ id: 'home', title: 'Alpha Tea — tea for night shifts', cover: '/img/r1/1.webp', plan }, { id: 'plans', title: 'Plans', cover: null, plan: [] }],
  art: [{ src: '/img/r1/1.webp', page: 'home', layer: 'home-hero', gen: 1, name: 'hero', used: 'Alpha Tea — tea for night shifts', style: 'Ink' }],
  painting: [{ page: 'home', layer: 'home-hero', gen: 1, name: 'hero', state: 'painting' }, { page: 'plans', layer: 'plans-cups', gen: 1, name: 'cups', used: 'Plans', state: 'painting' }],
  films: [{ name: 'Promo', src: '/video/r1/promo.mp4', poster: null, seconds: 75 }],
  game: { title: 'Dash', pitch: 'Run', cover: null, run: 'g1', work: null }, app: true, code: true,
  snaps: { pages: { home: { v: 'a', s: '/snaps/r1/home-s.jpg', f: '/snaps/r1/home-f.jpg' }, plans: { v: 'b' } } }
}

test('the sections are web/project.js\'s, in its order', () => {
  const src = read('web/project.js').match(/const SECTIONS = (\[.*\])/)[1]
  assert.deepEqual(SECTIONS, JSON.parse(src.replace(/'/g, '"')))
})

test('every file lands in its section: pages from their snapshots, pictures being painted in their slot', () => {
  const g = groups(BOARD, [{ name: 'logo.png', type: 'image/png', src: '/up/p/logo.png' }, { name: 'a.mp3', type: 'audio/mpeg' }], [{ id: 'f1', kind: 'image', name: 'Shelf', src: '/ref/p/s.jpg' }], '', [{ name: 'big.mov', pct: 0.5 }])
  assert.deepEqual(Object.keys(g), ['site', 'app', 'game', 'film', 'art', 'uploads', 'refs', 'code'])
  const [home, plans] = g.site
  assert.deepEqual([home.name, home.src, home.sharp, home.snap], ['Alpha Tea', '/snaps/r1/home-s.jpg', '/snaps/r1/home-f.jpg', true])
  // no snapshot yet: the cover, and it is drawn from its plan
  assert.deepEqual([plans.src, plans.snap], [null, false])
  // a picture painted again keeps its slot; a new one gets its own
  assert.deepEqual(g.art.map(a => [a.key, a.name, !!a.pending]), [['art:home/home-hero/1', 'Hero', true], ['art:plans/plans-cups/1', 'Cups', true]])
  assert.equal(g.art[0].used, 'Alpha Tea')
  assert.deepEqual(g.uploads.map(u => [u.name, u.src ?? null, u.sending ?? null]), [['logo.png', '/up/p/logo.png', null], ['a.mp3', null, null], ['big.mov', null, 0.5]])
  assert.equal(g.game[0].run, 'g1')
  assert.equal(findItem(g, 'film:0').seconds, 75)
})

test('search keeps only the files whose name has the words, and drops empty sections', () => {
  const g = groups(BOARD, [], [], 'plan')
  assert.deepEqual(Object.keys(g), ['site'])
  assert.deepEqual(g.site.map(x => x.page), ['plans'])
})

test('Code starts shut; any section stays as the person left it', () => {
  assert.equal(isShut({}, 'code'), true)
  assert.equal(isShut({ code: true }, 'code'), false)
  assert.equal(isShut({ site: false }, 'site'), true)
  assert.equal(isShut({}, 'site'), false)
})

test('a page is 124 wide and as long as its snapshot, nine widths at most; before one, as long as its plan', () => {
  assert.equal(pageH(2), 248)
  assert.equal(pageH(20), 124 * 9)
  // never a thin strip
  assert.equal(planRatio({ plan: [{ id: 'a', h: 300 }] }), 1.25)
  assert.equal(planRatio({ plan: [] }), (720 + 520 + 520 + 300) / 1280)
  const g = groups(BOARD)
  assert.deepEqual(boardSize(g.site[0], 3), [124, 372])
  assert.deepEqual(boardSize(g.site[0]), [124, 233])
  assert.deepEqual(boardSize(g.game[0]), [300, 169])
  const blocks = skeletonBlocks({ plan })
  assert.deepEqual(blocks.map(b => [b.id, b.hero, b.done]), [['hero', true, true], ['menu', false, false]])
  assert.equal(blocks[1].top + blocks[1].h, 1)
})

test('the inspector says what is known and offers what can be done', () => {
  const g = groups(BOARD, [{ name: 'big.pdf', size: 3 * 1048576 }], [{ id: 'l1', kind: 'link', name: 'x', url: 'https://www.example.com/a', source: 'link', use: 'the menu' }])
  assert.deepEqual(facts(g.art[0], '1024 × 1024'), [['Size', '1024 × 1024'], ['Style', 'Ink'], ['Used on', 'Alpha Tea']])
  assert.deepEqual(facts(g.film[0]), [['Length', '1:15']])
  assert.deepEqual(facts(g.uploads[0]), [['File', '3.0 MB']])
  assert.deepEqual(facts(g.refs[0]), [['From', 'A link'], ['Use', 'the menu'], ['Link', 'example.com/a']])
  assert.deepEqual(acts(g.site[0]), ['open', 'zip'])
  assert.deepEqual(acts(g.art[0]), ['open', 'export', 'replace'])
  assert.deepEqual(acts(g.uploads[0]), ['export', 'replace'])
  assert.deepEqual(acts(g.refs[0]), ['open', 'ref-remove'])
})

test('opening a file goes to its room, as the machine names it; an upload or a link opens in a new tab', () => {
  const g = groups(BOARD, [{ name: 'logo.png', type: 'image/png', src: '/up/p/logo.png' }], [{ id: 'l1', kind: 'link', name: 'x', url: 'https://example.com' }])
  assert.deepEqual(opening(g.site[0], 'r1'), { event: { type: 'room', room: 'deck' }, page: 'home' })
  assert.deepEqual(opening(g.art[0], 'r1'), { event: { type: 'room', room: 'deck' }, page: 'home' })
  assert.deepEqual(opening(g.film[0], 'r1'), { event: { type: 'room', room: 'video' } })
  // the game made from this site is its own run
  assert.deepEqual(opening(g.game[0], 'r1'), { event: { type: 'room', room: 'game', run: 'g1' } })
  assert.deepEqual(opening(g.app[0], 'r1'), { event: { type: 'room', room: 'app' } })
  assert.deepEqual(opening(g.uploads[0], 'r1'), { tab: '/up/p/logo.png' })
  assert.deepEqual(opening(g.refs[0], 'r1'), { tab: 'https://example.com' })
})

test('the machine takes every room an artboard opens', async () => {
  const { createActor } = await import('../web/vendor/xstate/xstate.mjs')
  const { navMachine } = await import('../web/nav.js')
  const g = groups(BOARD)
  for (const x of [g.site[0], g.film[0], g.game[0], g.app[0]]) {
    const a = createActor(navMachine).start()
    a.send({ type: 'open.project', project: 'p', version: 'r1' })
    assert.ok(a.getSnapshot().can(opening(x, 'r1').event), `${x.kind}: the machine has no such move`)
  }
})

test('a file is saved under its own name, or its name with its type', () => {
  const g = groups(BOARD, [{ name: 'menu.pdf' }])
  assert.deepEqual(download(g.uploads[0], 'p-1'), { href: '/up/p-1/menu.pdf', name: 'menu.pdf' })
  assert.deepEqual(download(g.art[0], 'p-1'), { href: '/img/r1/1.webp', name: 'Hero.webp' })
  assert.deepEqual(download(g.film[0], 'p-1'), { href: '/video/r1/promo.mp4', name: 'Promo.mp4' })
})

test('the project is the one the version belongs to, else the one it was opened from', () => {
  const list = [{ id: 'a', versions: [{ id: 'r1' }] }, { id: 'b', versions: [{ id: 'r2' }], parts: { g9: 'r2' } }]
  assert.equal(projectOf(list, 'r1', 'b').id, 'a')
  assert.equal(projectOf(list, 'g9', null).id, 'b')
  assert.equal(projectOf(list, 'new', 'b').id, 'b')
  assert.equal(projectOf(list, 'new', null), null)
  assert.equal(projectName(null, BOARD), 'Alpha Tea')
  assert.equal(projectName(null, null), 'New project')
})

test('a game still building opens on its build once; back from a site\'s game shows the site\'s version', () => {
  const building = { ...BOARD, game: { ...BOARD.game, work: { what: 'game' } } }
  assert.deepEqual(moveAfterLoad(building, null, 'r1', false), { type: 'room', room: 'game', run: 'g1' })
  assert.equal(moveAfterLoad(building, null, 'r1', true), null)
  assert.deepEqual(moveAfterLoad({ id: 'g1', kind: 'game', busy: true }, null, 'g1', false), { type: 'room', room: 'game', run: 'g1' })
  assert.deepEqual(moveAfterLoad({ id: 'g1', kind: 'game' }, { id: 'b', parts: { g1: 'r2' } }, 'g1', true), { type: 'open.version', version: 'r2', project: 'b' })
  assert.equal(moveAfterLoad(BOARD, { id: 'a' }, 'r1', true), null)
})

test('it looks again often while something happens, rarely when nothing does', () => {
  assert.deepEqual([pollMs({ busy: true }), pollMs({ live: true }), pollMs({}), pollMs(null)], [2000, 3000, 15000, 15000])
})

test('the Overview is listed as moved, under its OBJECTS.md name, and keeps the old screen', () => {
  assert.match(read('ui/src/screens/index.ts'), /SCREENS[^=]*= \{[^}]*overview: Overview/)
  assert.ok(read('web/project.js').includes('export function makeProject'))
  // never called a canvas in its own code
  for (const f of ['ui/src/screens/Overview.tsx', 'ui/src/screens/overview/Stage.tsx']) assert.doesNotMatch(read(f).replace(/^\/\/.*$/gm, ''), /\bcanvas\b/i, f)
})
