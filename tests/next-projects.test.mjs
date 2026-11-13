// node --test tests/next-projects.test.mjs
// Projects in the next UI (ui/src/screens/Projects.tsx, issue #404): its rules are web/home.js's, so both apps list
// the same cards and Make offers the same ways. Node runs the TypeScript files as they are (their types stripped).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GUIDES, pending, guideBrief as briefOf, guideSets as setsOf } from '../engine/intake.mjs'
import { makeWays, makeStudioStep, MAKE_KINDS } from '../web/makeways.js'
import { withPlans, working, shown, versionCards, assetGroups, filterKinds, filterStates, purgeSaid, ago } from '../ui/src/screens/projects/model.ts'
import { MAKES, KIT_STEPS, guidePending, guideBrief, guideSets, pickWay, studioFits, runOf, makeOf } from '../ui/src/screens/projects/make.ts'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const P = (id, o = {}) => ({ id, title: id, head: `r-${id}`, count: 1, updated: 0, made: 0, ...o })

test('a plan joins the project of its name; a plan with no project is one card per name', () => {
  const ps = withPlans([P('Night Runner')], [
    { id: 'p-1', title: 'Night Runner game', updated: '2026-11-02' },
    { id: 'p-2', title: 'Ant Farm', updated: '2026-11-03' },
    { id: 'p-3', title: 'ant farm', updated: '2026-11-01' },
    { id: 'p-4', title: 'Ant Farm', updated: '2026-10-01', locked: true }
  ])
  assert.equal(ps.find(p => p.id === 'Night Runner').planId, 'p-1')
  assert.deepEqual(ps.filter(p => p.plan).map(p => [p.id, p.state.status]), [['p-2', 'Plan'], ['p-4', 'Locked']])
})

test('a failed or empty version is not shown once a newer one works, and does not name the card', () => {
  const ok = { id: 'v1', state: { kind: 'App', status: 'App built' } }
  const p = working([P('a', { count: 3, state: { kind: 'App', status: 'App failed' }, versions: [{ id: 'v3', state: { kind: 'App', status: 'App failed' } }, ok, { id: 'v0', state: { kind: 'App', status: 'Draft' } }] })])[0]
  assert.deepEqual(p.versions.map(v => v.id), ['v3', 'v1'])
  assert.equal(p.count, 2); assert.equal(p.state.status, 'App built')
})

test('each view, the search, the filter and the sort pick and order the cards as web/home.js does', () => {
  const ps = [
    P('b', { title: 'Bakery', updated: 10, made: 3, state: { kind: 'Website', status: 'Live' }, folder: 'Shops' }),
    P('a', { title: 'Ants', updated: 30, made: 1, state: { kind: 'Game', status: 'Game built' }, versions: [{ id: 'v', title: 'Army of ants' }] }),
    P('t', { title: 'Old', updated: 50, trashed: true })
  ]
  const c = { view: 'all', folder: null, q: '', filter: '', sort: 'edited' }
  assert.deepEqual(shown(ps, c, {}).map(p => p.id), ['a', 'b'])
  assert.deepEqual(shown(ps, c, { b: 99 }).map(p => p.id), ['b', 'a'])
  assert.deepEqual(shown(ps, { ...c, sort: 'name' }, {}).map(p => p.id), ['a', 'b'])
  assert.deepEqual(shown(ps, { ...c, sort: 'created' }, {}).map(p => p.id), ['b', 'a'])
  assert.deepEqual(shown(ps, { ...c, view: 'trash' }, {}).map(p => p.id), ['t'])
  assert.deepEqual(shown(ps, { ...c, view: 'folder', folder: 'Shops' }, {}).map(p => p.id), ['b'])
  assert.deepEqual(shown(ps, { ...c, q: 'army' }, {}).map(p => p.id), ['a'])
  assert.deepEqual(shown(ps, { ...c, filter: 'k:Website' }, {}).map(p => p.id), ['b'])
  assert.deepEqual(shown(ps, { ...c, filter: 's:Game built' }, {}).map(p => p.id), ['a'])
  assert.deepEqual(filterKinds(ps), ['Website', 'Game']); assert.deepEqual(filterStates(ps), ['Game built', 'Live'])
  assert.equal(shown(Array.from({ length: 30 }, (_, i) => P(`p${i}`)), { ...c, view: 'recent' }, {}).length, 24)
})

test('a stack opens as Version n, newest first; Assets group by folder; purge says what went', () => {
  assert.deepEqual(versionCards(P('x', { versions: [{ id: 'r3' }, { id: 'r2' }, { id: 'r1' }] })).map(v => [v.id, v.title, v.head]), [['r3', 'Version 3', 'r3'], ['r2', 'Version 2', 'r2'], ['r1', 'Version 1', 'r1']])
  const g = assetGroups([{ project: 'b', name: 'logo.png', kind: 'upload' }, { project: 'a', name: 'hero', kind: 'image' }], [P('a'), P('b', { folder: 'F' })], [{ name: 'F' }], { q: '', filter: '', sort: 'name' })
  assert.deepEqual(g.map(x => [x.folder, x.groups.map(y => y.project.id)]), [[null, ['a']], ['F', ['b']]])
  assert.deepEqual(purgeSaid({ removed: 2 }), { text: '2 projects deleted forever', retry: null })
  assert.deepEqual(purgeSaid({ removed: 0 }), { text: 'Nothing to delete', retry: null })
  assert.deepEqual(purgeSaid({ removed: 1, failed: [{ id: 'q', title: 'Q', code: 'EBUSY' }] }), { text: '1 project deleted forever. Q stayed in Trash: a file in it is open', retry: ['q'] })
  assert.equal(ago(1000, 1000 + 30 * 60e3), '30m')
})

test('Make: the kinds, their kits\' steps and runs are the current Studio\'s; the ways come from web/makeways.js', () => {
  const home = read('web/home.js')
  for (const m of MAKES) assert.ok(home.includes(`{ k: '${m.k}', icon: '${m.icon}', label: '${m.label}'`), m.k)
  assert.deepEqual(MAKES.map(m => m.k).sort(), Object.keys(MAKE_KINDS).sort())
  for (const [kind, steps] of Object.entries(KIT_STEPS)) {
    const kit = read(`web/kit-${kind}.js`)
    assert.ok(kit.includes(`steps: ${JSON.stringify(steps).replace(/"/g, "'").replace(/,/g, ', ')}`), kind)
  }
  assert.equal(runOf(makeOf('site')), null)
  assert.deepEqual(runOf(makeOf('video')), { games: 'none', only: ['review', 'video'] })
  assert.equal(makeOf('nope').k, 'site')
  // the menu reads from the same file in both apps
  assert.match(read('ui/src/screens/projects/MakeBox.tsx'), /from '@studio\/makeways'/)
  assert.equal(makeStudioStep('deck'), 'plan')
})

test('Make pre-selects the way picked last for the kind, else what the words suggest', () => {
  const site = makeWays('site', true)
  assert.equal(pickWay('site', site, 'a bakery', null), 'studio')
  assert.equal(pickWay('site', site, 'a site for my bakery with a menu page, opening hours and a map', null), 'now')
  assert.equal(pickWay('site', site, 'a site for my bakery with a menu page, opening hours, a map and a moody look', null), 'studio')
  assert.equal(pickWay('site', site, 'a bakery', 'takes'), 'takes')
  assert.equal(pickWay('game', makeWays('game', true), 'a platformer', null), 'guided')
  // a remembered way the kind does not offer falls back
  assert.equal(pickWay('deck', makeWays('deck', true), 'a pitch', 'now'), 'studio')
  assert.equal(studioFits('game', 'a long description of a game with many words in it'), true)
})

test('the guided prompt is engine/intake.mjs\'s, word for word', () => {
  for (const kind of ['site', 'app', 'film']) {
    const qs = GUIDES[kind]
    for (const text of ['', 'a bakery', 'a bakery in Leeds for families, warm and friendly, with stock photos']) assert.deepEqual(guidePending(qs, text), pending(kind, text), `${kind}: ${text}`)
    const answers = Object.fromEntries(qs.map(q => [q.id, q.chips[0]]))
    assert.equal(guideBrief('A bakery', answers, qs), briefOf('A bakery', answers, qs))
    assert.deepEqual(guideSets(answers, qs), setsOf(answers, qs))
  }
})
