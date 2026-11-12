// node --test tests/studio.test.mjs
// The Studio's scaffold (docs/specs/37-studio-first.md): the Assets store, the studio record and its
// one brand, a Studio project with nothing built yet, and the Studio's place in the navigation machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assetStore } from '../engine/assetstore.mjs'
import { studioStore, newStudio, brandOf } from '../engine/studio.mjs'
import { makeProjects } from '../server/projects.mjs'
import { createActor } from '../web/vendor/xstate/xstate.mjs'
import { navMachine, view, toAddress, fromAddress } from '../web/nav.js'

const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
const tmp = () => mkdtempSync(join(tmpdir(), 'studio-'))

test('an asset goes in as given, with a role; remove hides it and restore brings it back', () => {
  const dir = tmp()
  try {
    mkdirSync(join(dir, 'p1'))
    const s = assetStore({ projectsDir: dir, known: pid => pid === 'p1' })
    const logo = s.addFile('p1', { name: 'shop-logo.png' }, png(200, 100))
    assert.equal(logo.role, 'logo'); assert.equal(logo.kind, 'image'); assert.equal(logo.w, 200); assert.equal(logo.src, '/asset/p1/shop-logo.png')
    const photo = s.addFile('p1', { name: 'bread.png', role: 'product' }, png(10, 10))
    assert.equal(photo.role, 'product')
    assert.equal(s.addFile('p1', { name: 'bread.png' }, png(10, 10)).name, 'bread (2).png')
    assert.throws(() => s.addFile('p1', { name: 'x.exe' }, Buffer.from('x')), /picture/)
    assert.throws(() => s.addFile('p2', { name: 'a.png' }, png(1, 1)), /no such project/)
    assert.equal(s.setRole('p1', photo.id, 'photo').role, 'photo')
    assert.throws(() => s.setRole('p1', photo.id, 'nope'), /role/)
    s.remove('p1', logo.id)
    assert.deepEqual(s.list('p1').map(a => a.name), ['bread.png', 'bread (2).png'])
    assert.equal(s.file('p1', 'shop-logo.png'), null)
    s.restore('p1', logo.id)
    assert.equal(s.list('p1').length, 3)
    assert.match(s.file('p1', 'shop-logo.png').type, /png/)
    assert.match(s.brief('p1'), /shop-logo\.png \(logo\): \/asset\/p1\/shop-logo\.png/)
    // a reference moved over is a copy, with the size it had
    const copy = s.addCopy('p1', { name: 'mood.png', w: 5, h: 6, role: 'photo' }, join(dir, 'p1', 'assets', 'bread.png'))
    assert.equal(copy.w, 5); assert.equal(s.path('p1', copy.id).asset.name, 'mood.png')
    assert.equal(s.list('p9').length, 0); assert.equal(s.brief('p9'), '')
    // a starter pack keeps where it came from
    const pk = s.addFile('p1', { name: 'pack.png', role: 'pack', pack: { id: 'kenney-tiny', source: 'pinned', version: '1.2.0', licence: 'CC0', sha256: 'a'.repeat(64), url: 'http://x', engines: ['web', 'godot'], native: 1 } }, png(4, 4))
    assert.deepEqual(pk.pack, { id: 'kenney-tiny', source: 'pinned', version: '1.2.0', licence: 'CC0', credits: null, sha256: 'a'.repeat(64), url: null, engines: ['web', 'godot'], native: true })
    assert.equal(s.addFile('p1', { name: 'p.png', role: 'photo', pack: { id: 'x' } }, png(4, 4)).pack, undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a studio record: its steps, its depth, the kit\'s own state merged, and one brand', async () => {
  const dir = tmp()
  try {
    const n = newStudio({ kind: 'brand', idea: ' a bakery ', steps: ['brand', 'references', 'assets'], start: 'plan' })
    assert.deepEqual(n.steps, { brand: 'empty', references: 'empty', assets: 'empty' })
    assert.equal(n.start, 'brand'); assert.equal(n.idea, 'a bakery')
    assert.equal(newStudio({ kind: 'nope' }).kind, 'site')
    const s = studioStore({ projectsDir: dir })
    s.make('p1', { kind: 'site', idea: 'a jazz bar', start: 'references' })
    assert.equal(s.get('p1').start, 'references')
    assert.equal(s.step('p1', 'brand', 'done').steps.brand, 'done')
    assert.throws(() => s.step('p1', 'proposal', 'done'), /no such step/)
    assert.throws(() => s.step('p1', 'brand', 'finished'), /empty, started/)
    assert.equal(s.depth('p1', 'thorough').depth, 'thorough')
    s.kit('p1', { pages: ['Home', 'Menu'], note: 'x' })
    assert.deepEqual(s.kit('p1', { note: null }).kit, { pages: ['Home', 'Menu'] })
    assert.throws(() => s.kit('p1', { big: 'x'.repeat(21000) }), /too big/)
    assert.throws(() => s.kit('p1', ['x']), /an object/)
    assert.equal(s.get('../x'), null)
    // the brand, in the brand sheet's store shape
    assert.deepEqual(s.brands.get('p1'), { id: 'p1', brand: null })
    assert.equal(s.brands.get('p9'), null)
    await s.brands.update('p1', r => { r.brand = { name: 'Moody', locked: true } })
    assert.equal(s.brands.get('p1').brand.name, 'Moody')
    await assert.rejects(s.brands.update('p9', () => {}), /no such project/)
    assert.equal(brandOf({ project: 'p1', studios: s }).name, 'Moody')
    assert.equal(brandOf({ chat: 'c1', studios: s, chats: { get: () => ({ brand: { name: 'Chat' } }) } }).name, 'Chat')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a Studio project with nothing built is kept, and reads Studio', () => {
  const dir = tmp()
  try {
    const runsDir = join(dir, 'runs'); mkdirSync(runsDir)
    const p = makeProjects({ runsDir, dataDir: join(dir, 'data'), runCard: () => null, runMeta: () => ({}), isLive: () => false })
    const pid = p.makeStudio({ name: 'Small Bakery', kind: 'brand' })
    assert.match(pid, /^s-[0-9a-z]+$/)
    p.makeStudio({ name: 'Moody', kind: 'site' })
    const { projects } = p.list()
    assert.equal(projects.length, 2)
    const card = projects.find(x => x.id === pid)
    assert.equal(card.name, 'Small Bakery'); assert.equal(card.studio, 'brand'); assert.equal(card.head, null)
    assert.deepEqual(card.state, { kind: 'Brand', status: 'Studio', host: null })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const at = (...events) => {
  const a = createActor(navMachine).start()
  for (const e of events) { assert.ok(a.getSnapshot().can(e), `no ${e.type} from ${view(a.getSnapshot()).room}`); a.send(e) }
  return a
}
const v = (...events) => view(at(...events).getSnapshot())
const S = { type: 'studio', project: 's-1' }

test('the Studio is a room with one step in view; the brand sheet comes back to it', () => {
  assert.deepEqual([v(S).room, v(S).project, v(S).step], ['studio', 's-1', 'brand'])
  assert.equal(v({ type: 'studio', project: 's-1', step: 'plan' }).step, 'plan')
  assert.equal(v(S, { type: 'studio.step', step: 'assets' }).step, 'assets')
  assert.equal(v(S, { type: 'studio.step', step: 'proposal' }).step, 'proposal')
  assert.equal(at(S).getSnapshot().can({ type: 'studio.step', step: 'nope' }), false)
  const b = v(S, { type: 'studio.step', step: 'references' }, { type: 'brand' })
  assert.equal(b.room, 'brand')
  const back = v(S, { type: 'brand' }, { type: 'back' })
  assert.deepEqual([back.room, back.project], ['studio', 's-1'])
  assert.equal(v(S, { type: 'home' }).room, 'home')
})

test('a Studio address goes round: room, project and step', () => {
  const s = v(S, { type: 'studio.step', step: 'assets' })
  const q = toAddress(s)
  assert.match(q, /room=studio/); assert.match(q, /project=s-1/); assert.match(q, /step=assets/)
  const back = view(at(...fromAddress(q)).getSnapshot())
  assert.deepEqual([back.room, back.project, back.step], ['studio', 's-1', 'assets'])
})

test('Make offers the ways to begin in one menu; an empty Studio asks for the idea in its chat', () => {
  const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const home = src('web/home.js'), scaffold = src('web/scaffold.js'), studio = src('server/studio.mjs')
  for (const name of ["label: 'Studio'", "label: 'Brand sheet'", "label: 'Build now'"]) assert.ok(home.includes(name), name)
  assert.doesNotMatch(home, /Studio first\?/)
  assert.match(scaffold, /What are you making\?/)
  assert.match(studio, /'New project'/)
  assert.doesNotMatch(studio, /if \(!idea\) throw bad\('say what it is'\)\n    const pid/)
})
