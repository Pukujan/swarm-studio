// Library pictures in a close style when no provider will paint one (engine/library.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { indexRows, pickRow, library } from '../engine/library.mjs'

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
