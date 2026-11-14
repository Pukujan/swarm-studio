// The asset library on purpose (engine/assetlib.mjs): search, packs of one's own, picks, credits.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assetLib, searchRows, rowOf, categoryOf, readPicks, setPick, pickedItem, creditsFor, isSlot } from '../engine/assetlib.mjs'
import { askItem } from '../engine/artask.mjs'

const rizzRow = (pack, category, subject, description = '') => ({ path: `assets/${pack}/${category}/misc/${subject}.png`, category, subcategory: 'misc', subject, style_pack: pack, tags: [category, subject], description })
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

function lib() {
  const dataDir = mkdtempSync(join(tmpdir(), 'assetlib-'))
  mkdirSync(join(dataDir, 'assetrizz'), { recursive: true })
  const rows = [
    rizzRow('cel_shaded_anime', 'props', 'water_tower', 'a rusty rooftop water tower'),
    rizzRow('cel_shaded_anime', 'icons', 'spring_boots'),
    rizzRow('lowpoly_render', 'props', 'water_tower'),
    rizzRow('pixel_32', 'ui', 'health_bar', 'a red health bar frame')
  ]
  writeFileSync(join(dataDir, 'assetrizz', 'manifest.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  const fetched = []
  const fetchImpl = async url => { fetched.push(url); return { ok: true, arrayBuffer: async () => PNG } }
  return { dataDir, fetched, lib: assetLib({ dataDir, fetchImpl }) }
}

test('a search finds by subject and tags, and leaves out 3D-looking packs unless asked', () => {
  const { lib: l } = lib()
  const hits = l.search({ q: 'water tower' })
  assert.deepEqual(hits.map(h => h.pack), ['cel_shaded_anime'])
  assert.equal(hits[0].id, 'cel_shaded_anime/props/misc/water_tower.png')
  assert.equal(hits[0].credit, 'assetrizz by mojomast')
  assert.equal(l.search({ q: 'water tower', all: true }).length, 2)
  assert.equal(l.search({ q: 'water tower', pack: 'lowpoly_render' }).length, 1, 'a pack asked for by name is searched')
  assert.deepEqual(l.search({ q: 'bar', category: ['ui'] }).map(h => h.subject), ['health bar'])
  assert.equal(l.search({ q: 'dragon' }).length, 0)
  assert.equal(l.search({}).length, 3, 'no words: everything but the render packs')
  const packs = l.packs()
  assert.ok(packs.find(p => p.id === 'lowpoly_render').render)
})

test('an assetrizz picture is fetched once, then served from disk', async () => {
  const { lib: l, fetched } = lib()
  const id = 'cel_shaded_anime/icons/misc/spring_boots.png'
  const a = await l.file(id), b = await l.file(id)
  assert.ok(existsSync(a.file) && a.file === b.file)
  assert.equal(fetched.length, 1)
  assert.match(fetched[0], /mojomast\/assetrizz\/main\/assets\/cel_shaded_anime\/icons/)
  assert.equal(await l.file('../../etc/passwd'), null)
})

test('a folder of the owner\'s own becomes a pack, credited, searched first', async () => {
  const { lib: l, dataDir } = lib()
  const src = mkdtempSync(join(tmpdir(), 'mypack-'))
  for (const f of ['Props/Water Tower.png', 'UI/button_blue.png', 'bg/night-sky.webp', 'readme.txt', '.hidden/x.png']) { mkdirSync(join(src, f, '..'), { recursive: true }); writeFileSync(join(src, f), PNG) }
  await assert.rejects(l.importPack({ path: src, name: 'Mine' }), /credit/)
  await assert.rejects(l.importPack({ path: join(src, 'nope'), name: 'x', credit: 'me' }), /no such/)
  await assert.rejects(l.importPack({ path: src, name: 'pixel 32', credit: 'me' }), /assetrizz pack/)
  const p = await l.importPack({ path: src, name: 'Rooftop Kit', credit: 'Kenney (kenney.nl)', license: 'CC0', url: 'https://kenney.nl' })
  assert.equal(p.id, 'rooftop_kit'); assert.equal(p.count, 3)
  const hits = l.search({ q: 'water tower' })
  assert.equal(hits[0].pack, 'rooftop_kit', 'your own pack comes first')
  assert.equal(hits[0].credit, 'Kenney (kenney.nl)'); assert.equal(hits[0].category, 'props')
  assert.equal(l.search({ q: 'button', category: ['ui'] })[0].pack, 'rooftop_kit')
  assert.equal(l.search({ q: 'night sky' })[0].category, 'backgrounds')
  const got = await l.file(hits[0].id)
  assert.ok(got.file.startsWith(join(dataDir, 'library', 'rooftop_kit')))
  assert.ok(l.packs().some(x => x.id === 'rooftop_kit' && x.own && x.count === 3))
  assert.equal(l.removePack('rooftop_kit'), true)
  assert.equal(l.search({ q: 'button', category: ['ui'] }).length, 0)
  assert.equal(l.removePack('pixel_32'), false, 'an assetrizz pack cannot be removed')
})

test('a zip is unpacked and imported like a folder', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'assetlib-'))
  const src = mkdtempSync(join(tmpdir(), 'zip-')), zip = join(src, 'pack.zip')
  writeFileSync(zip, 'PK')
  const l = assetLib({ dataDir, unzip: async (z, to) => { assert.equal(z, zip); mkdirSync(join(to, 'icons'), { recursive: true }); writeFileSync(join(to, 'icons', 'gem.png'), PNG) } })
  const p = await l.importPack({ path: zip, credit: 'someone' })
  assert.equal(p.id, 'pack'); assert.equal(l.search({ q: 'gem' })[0].category, 'icons')
})

test('a category is read from the folders or the file name', () => {
  assert.equal(categoryOf('Props/crate.png'), 'props')
  assert.equal(categoryOf('Kenney/Tiles/grass.png'), 'tiles')
  assert.equal(categoryOf('parallax/far.png'), 'backgrounds')
  assert.equal(categoryOf('hud/health.png'), 'ui')
  assert.equal(categoryOf('explosion_01.png'), 'vfx')
  assert.equal(categoryOf('random.png'), 'misc')
})

test('a build keeps its picks per slot, and a pick for a new slot is a picture of its own', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-'))
  assert.deepEqual(readPicks(dir), [])
  setPick(dir, { slot: 'item-spring-boots', asset: 'cel_shaded_anime/icons/misc/spring_boots.png' })
  setPick(dir, { slot: 'prop-water-tower', asset: 'rooftop_kit/Props/Water_Tower.png', what: 'the water tower' })
  assert.equal(setPick(dir, { slot: 'item-spring-boots', asset: null }).length, 1, 'a null asset clears the pick')
  assert.throws(() => setPick(dir, { slot: '../x', asset: 'a' }), /slot/)
  assert.ok(isSlot('title') && isSlot('place-harbour-roofs') && !isSlot('item') && !isSlot('game-x'))
  const it = pickedItem(readPicks(dir)[0], null)
  assert.deepEqual([it.id, it.kind, it.what], ['prop-water-tower', 'prop', 'prop: the water tower'])
})

test('the credits list every library picture by its source', () => {
  assert.equal(creditsFor([]), null)
  const c = creditsFor([
    { file: 'art/prop-water-tower.png', from: 'rooftop_kit/Props/Water_Tower.png', pack: 'rooftop_kit', credit: 'Kenney (kenney.nl)', license: 'CC0', url: 'https://kenney.nl' },
    { file: 'art/item-spring-boots.png', from: 'cel_shaded_anime/icons/misc/spring_boots.png', pack: 'cel_shaded_anime', credit: 'assetrizz by mojomast', license: 'full grant from the author' }
  ])
  assert.match(c.md, /## Kenney \(kenney\.nl\) \(CC0\)\nhttps:\/\/kenney\.nl\n\n- art\/prop-water-tower\.png: rooftop_kit/)
  assert.match(c.md, /## assetrizz by mojomast/)
  assert.equal(c.json.length, 2)
})

test('a slice can ask for a library picture; a sheet or an effect cannot', () => {
  const spec = { hero: 'Mika', setting: 'rooftops', view: 'side' }
  assert.equal(askItem(spec, { kind: 'prop', what: 'a water tower', from: 'library' }).library, true)
  assert.equal(askItem(spec, { kind: 'prop', what: 'a water tower' }).library, undefined)
  assert.equal(askItem(spec, { kind: 'effect', what: 'a spark', from: 'library' }).library, undefined)
})

test('rowOf keeps the credit of the pack a row came from', () => {
  const r = rowOf({ path: 'a/b.png', subject: 'b' }, { id: 'mine', credit: 'me', license: 'CC-BY' })
  assert.deepEqual([r.id, r.own, r.credit, r.license], ['mine/a/b.png', true, 'me', 'CC-BY'])
  assert.equal(searchRows([r], { q: 'b' }).length, 1)
})
