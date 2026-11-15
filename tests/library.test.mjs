// Library pictures in a close style when no provider will paint one (engine/library.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { indexRows, pickRow, library, RAW, RIZZ_SHA, rizzDir, safeRel, inside } from '../engine/library.mjs'

const row = (pack, category, subcategory, subject, description = '') => ({ path: `assets/${pack}/${category}/${subcategory}/${subject}.png`, category, subcategory, subject, style_pack: pack, tags: [category, subject, pack], description })
const rows = [
  row('cel_shaded_anime', 'icons', 'misc', 'spring_boots', 'bouncy leather boots with coiled springs'),
  row('cel_shaded_anime', 'icons', 'potion', 'health_potion', 'red health potion'),
  row('storybook_gouache', 'icons', 'misc', 'signal_spark', 'a crackling spark of signal light'),
  row('pixel_32', 'icons', 'misc', 'spring_boots'),
  row('cel_shaded_anime', 'backgrounds', 'plate', 'city_rooftops_night', 'city rooftops under a night sky with antennas'),
  row('cel_shaded_anime', 'backgrounds', 'parallax', 'neon_roofs_sky', 'sky layer'),
  row('cel_shaded_anime', 'backgrounds', 'parallax', 'rooftop_city_far', 'far layer'),
  row('cel_shaded_anime', 'icons', 'misc', 'signal_mirror', 'a mirror for signalling'),
  row('cel_shaded_anime', 'icons', 'misc', 'iron_boots'),
  row('cel_shaded_anime', 'characters', 'humanoid', 'courier', 'a courier'),
  row('lowpoly_render', 'icons', 'misc', 'spring_boots')
]
const index = indexRows(rows)
const icon = what => ({ kind: 'icon', what: `icon for ${what}`, gen: `A single emblem for "${what}"` })

test('an icon comes from the nearest pack of the build style, matched by its subject', () => {
  assert.equal(pickRow(index, icon('Spring boots'), 'anime-cel').path, 'assets/cel_shaded_anime/icons/misc/spring_boots.png')
  assert.equal(pickRow(index, icon('Spring boots'), 'pixel').pack, 'pixel_32')
})
test('the next close pack is tried, and an icon with no match gets nothing', () => {
  assert.equal(pickRow(index, icon('Signal Spark'), 'anime-cel').pack, 'storybook_gouache')
  assert.equal(pickRow(index, icon('Grappling hook'), 'anime-cel'), null)
})
test('a backdrop can be a whole picture or a far layer, never a sky or near layer', () => {
  assert.equal(pickRow(index, { kind: 'backdrop', what: 'backdrop for Rooftops', gen: 'night rooftops with antennas' }, 'anime-cel').sub, 'plate')
  const used = new Set(['assets/cel_shaded_anime/backgrounds/plate/city_rooftops_night.png'])
  assert.equal(pickRow(index, { kind: 'backdrop', what: 'backdrop for Neon roofs', gen: 'a rooftop city' }, 'anime-cel', used).slug, 'rooftop_city_far')
})
test('an icon sharing one word of a two-word name is not that thing', () => {
  assert.equal(pickRow(index, icon('Signal Spark'), 'pixel'), null)
  assert.equal(pickRow(index, icon('Rocket boots'), 'anime-cel'), null)
})
test('no library picture for characters, a style with no close pack, or one already used', () => {
  assert.equal(pickRow(index, { kind: 'sprite', what: 'sprite of courier' }, 'anime-cel'), null)
  assert.equal(pickRow(index, icon('Spring boots'), 'photo'), null)
  assert.equal(pickRow(index, icon('Spring boots'), 'toy'), null)
  assert.equal(pickRow(index, icon('Spring boots'), 'anime-cel', new Set(['assets/cel_shaded_anime/icons/misc/spring_boots.png'])), null)
})
test('the catalog is fetched once and each picture is kept locally', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lib-'))
  const got = []
  const fetchImpl = async url => {
    got.push(url)
    if (url.endsWith('manifest.jsonl')) return { ok: true, text: async () => rows.map(r => JSON.stringify(r)).join('\n') }
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('png').buffer }
  }
  const lib = library({ dataDir, fetchImpl })
  const used = new Set()
  const a = await lib.pick(icon('Spring boots'), 'anime-cel', used)
  assert.ok(existsSync(a.path)); assert.equal(readFileSync(a.path, 'utf8'), 'png')
  assert.equal(await lib.pick(icon('Spring boots'), 'anime-cel', used), null)
  await lib.pick(icon('Health potion'), 'anime-cel', used)
  assert.equal(got.filter(u => u.endsWith('manifest.jsonl')).length, 1)
})
test('a library that cannot be reached gives nothing, without throwing', async () => {
  const lib = library({ dataDir: mkdtempSync(join(tmpdir(), 'lib-')), fetchImpl: async () => ({ ok: false, status: 503 }) })
  assert.equal(await lib.pick(icon('Spring boots'), 'anime-cel'), null)
})

// The catalog is remote data: it may never choose where a file is written (catalog review of e8ae13c4)
const HOSTILE = [
  '../escape.png', 'assets/../../escape.png', 'assets/cel_shaded_anime/icons/../../../../escape.png',
  '/etc/escape.png', 'C:/escape.png', 'C:\\escape.png', 'assets\\..\\..\\escape.png', '\\\\host\\share\\escape.png',
  'assets//icons/escape.png', 'assets/./escape.png', 'assets/icons/', '', 'assets/icons/esc\u0000ape.png'
]

test('everything is fetched from one pinned commit, never a branch', () => {
  assert.match(RIZZ_SHA, /^[0-9a-f]{40}$/)
  assert.equal(RAW, `https://raw.githubusercontent.com/mojomast/assetrizz/${RIZZ_SHA}/`)
  assert.ok(rizzDir('/data').includes(RIZZ_SHA.slice(0, 12)), 'its files are kept in a folder of their own')
})

test('a catalog path is kept only when it stays inside the library folder', () => {
  assert.equal(safeRel('assets/cel_shaded_anime/icons/misc/spring_boots.png'), true)
  for (const p of HOSTILE) assert.equal(safeRel(p), false, JSON.stringify(p))
  for (const p of [null, undefined, 42, { path: 'a' }]) assert.equal(safeRel(p), false)
  const dir = mkdtempSync(join(tmpdir(), 'lib-'))
  assert.equal(inside(dir, 'assets/a.png'), resolve(dir, 'assets/a.png'))
  for (const p of HOSTILE) assert.equal(inside(dir, p), null, JSON.stringify(p))
})

test('a hostile catalog is never fetched from or written outside the library folder', async () => {
  const base = mkdtempSync(join(tmpdir(), 'lib-')), dataDir = join(base, 'data')
  const evil = HOSTILE.map(p => ({ ...row('cel_shaded_anime', 'icons', 'misc', 'spring_boots'), path: p }))
  const got = []
  const fetchImpl = async url => {
    got.push(url)
    if (url.endsWith('manifest.jsonl')) return { ok: true, text: async () => evil.map(r => JSON.stringify(r)).join('\n') }
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('png').buffer }
  }
  assert.equal(indexRows(evil).length, 0, 'no hostile row is indexed')
  const lib = library({ dataDir, fetchImpl })
  assert.equal(await lib.pick(icon('Spring boots'), 'anime-cel'), null)
  assert.deepEqual(got.filter(u => !u.endsWith('manifest.jsonl')), [], 'no picture is fetched')
  assert.ok(!existsSync(join(base, 'escape.png')) && !existsSync(join(dataDir, 'escape.png')))
})
