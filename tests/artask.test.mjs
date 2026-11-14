import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { companionOf, heroLook, artList, sheetList, artBrief } from '../engine/game.mjs'
import { askItem, takeAsks, askedBefore, keepAsked, askBrief, ASK_FILE, ASKED_FILE, ASKS_PER_STAGE, ASKS_PER_BUILD } from '../engine/artask.mjs'
import { syncGodotArt } from '../engine/godotfirst.mjs'

const rooftop = { title: 'Rooftop Signal', view: 'side', setting: 'a rainy city of rooftops', hero: 'Mika, a courier in a yellow coat who runs with her cat Kumo, a grey stray with a bell', pitch: 'A rooftop runner: climb and repair relays' }
const tmp = () => mkdtempSync(join(tmpdir(), 'artask-'))

test('the companion in the hero line is found, and left out of the hero', () => {
  const c = companionOf(rooftop)
  assert.equal(c.name, 'Kumo'); assert.equal(c.id, 'kumo'); assert.equal(c.kind, 'cat')
  assert.match(c.look, /grey stray with a bell/)
  assert.equal(heroLook(rooftop), 'Mika, a courier in a yellow coat')
  assert.equal(companionOf({ hero: 'Mika, a courier; with Rust-8, a small robot' }).name, 'Rust-8')
  assert.equal(companionOf({ hero: 'Aki, a girl with a fox called Ember' }).name, 'Ember')
  assert.equal(heroLook({ hero: 'Aki, a girl with a fox called Ember' }), 'Aki, a girl')
  assert.equal(companionOf({ hero: 'Senna, a knight in silver armour' }), null)
  assert.equal(companionOf({ hero: 'Senna', companion: { name: 'Pip', kind: 'owl' } }).kind, 'owl')
})

test('the companion gets a sprite (after the hero, with its picture as reference) and a run sheet', () => {
  const art = artList(rooftop)
  const hero = art.find(a => a.id === 'sprite-hero'), pal = art.find(a => a.id === 'sprite-kumo')
  assert.ok(hero && pal, 'both sprites are painted')
  assert.ok(!/Kumo|cat/.test(hero.gen), 'the hero sprite is the hero alone')
  assert.equal(pal.ref, 'sprite-hero'); assert.ok(pal.cutout && pal.companion)
  assert.ok(art.indexOf(pal) < art.findIndex(a => a.kind === 'backdrop') || art.filter(a => a.kind === 'sprite').indexOf(pal) === 1)
  const sheets = sheetList(rooftop)
  const run = sheets.find(s => s.id === 'sheet-kumo-run')
  assert.equal(run.after, 'sprite-kumo'); assert.ok(run.loop)
  assert.match(run.frames, /four-legged/)
  assert.match(run.layout, /magenta \(#FF00FF\)/)
  assert.ok(sheets.filter(s => s.after === 'sprite-hero').every(s => !/Kumo/.test(s.look)))
  // a pink companion stands on green
  assert.match(sheetList({ ...rooftop, hero: 'Mika, a courier who runs with her cat Kumo, a pink fluffy cat' }).at(-1).layout, /green \(#00FF00\)/)
  // a game without a companion keeps only the hero's sheets
  assert.ok(sheetList({ ...rooftop, hero: 'Mika, a courier' }).every(s => s.after === 'sprite-hero'))
  assert.match(artBrief([{ file: 'art/sheet-kumo-run.webp', kind: 'sheet', what: 'run sheet of Kumo', cell: [200, 200], count: 6, fps: 12, loop: true, frames: 'x' }]), /companion/)
})

test('an ask becomes a picture the painters know, on the chroma key, in the game\'s view', () => {
  const prop = askItem(rooftop, { kind: 'prop', what: 'a rusty water tower' })
  assert.equal(prop.id, 'prop-a-rusty-water-tower'); assert.equal(prop.kind, 'sprite'); assert.ok(prop.cutout)
  assert.equal(prop.ref, 'sprite-hero', 'matched to the hero in style')
  assert.match(prop.gen, /#FF00FF/)
  const back = askItem(rooftop, { kind: 'backdrop', what: 'the night market roofs', id: 'night-market' })
  assert.equal(back.id, 'place-night-market'); assert.match(back.gen, /Side-on view/); assert.match(back.gen, /No people/)
  assert.equal(askItem(rooftop, { kind: 'icon', what: 'a relay fuse' }).aspect, 'square')
  assert.equal(askItem(rooftop, { kind: 'portrait', what: 'the old radio keeper' }).aspect, 'portrait')
  assert.match(askItem(rooftop, { kind: 'sprite', what: 'a pink-haired rival courier' }).gen, /#00FF00/, 'pink stands on green')
  assert.ok(askItem(rooftop, { kind: 'music', what: 'a song' }).error)
  assert.ok(askItem(rooftop, { kind: 'prop', what: '' }).error)
  // a sheet animates a sprite that is painted
  const known = new Map([['sprite-hero', { look: 'Mika' }], ['sprite-kumo', { look: 'a grey cat', kind: 'cat' }]])
  const sheet = askItem(rooftop, { kind: 'sheet', of: 'sprite-kumo', move: 'run', what: 'Kumo' }, known)
  assert.equal(sheet.id, 'sheet-kumo-run'); assert.equal(sheet.after, 'sprite-kumo'); assert.match(sheet.frames, /four-legged/)
  assert.equal(askItem(rooftop, { kind: 'sheet', of: 'hero', move: 'climb', what: 'Mika' }, known).id, 'sheet-hero-climb')
  assert.match(askItem(rooftop, { kind: 'sheet', of: 'sprite-gull', move: 'run', what: 'a gull' }, known).error, /ask for the sprite first/)
  assert.match(askItem(rooftop, { kind: 'sheet', of: 'hero', move: 'wave', what: 'Mika' }, known).error, /frames/)
  assert.equal(askItem(rooftop, { kind: 'sheet', of: 'hero', move: 'wave', what: 'Mika', frames: 'six waving poses' }, known).sheet, 'wave')
})

test('a slice\'s asks are read once, capped, and never painted twice', () => {
  const dir = tmp()
  try {
    const asks = [
      { kind: 'prop', what: 'a rusty water tower' },
      { kind: 'prop', what: 'a rusty water tower' },
      { kind: 'sprite', what: 'a rooftop gull', look: 'grey and white' },
      { kind: 'sheet', of: 'sprite-a-rooftop-gull', move: 'run', what: 'the gull', frames: 'six flapping poses' },
      { kind: 'backdrop', what: 'the antenna yard' },
      { kind: 'icon', what: 'a fuse' },
      { kind: 'icon', what: 'a battery' }
    ]
    writeFileSync(join(dir, ASK_FILE), JSON.stringify(asks))
    const have = [{ file: 'art/sprite-hero.png', kind: 'sprite' }, { file: 'art/place-the-antenna-yard.png', kind: 'backdrop' }]
    const { items, refused } = takeAsks(dir, rooftop, { have, cap: 4 })
    assert.deepEqual(items.map(i => i.id), ['prop-a-rusty-water-tower', 'sprite-a-rooftop-gull', 'sheet-a-rooftop-gull-run', 'item-a-fuse'])
    assert.ok(refused.some(r => /painted already/.test(r.why)), 'a duplicate and a painted backdrop are left out')
    assert.ok(refused.some(r => /at most 4 pictures per slice/.test(r.why)))
    assert.deepEqual(JSON.parse(readFileSync(join(dir, ASK_FILE), 'utf8')), [], 'the file is cleared once read')
    assert.deepEqual(takeAsks(dir, rooftop, { have }).items, [], 'nothing asked twice')
    // the build's own cap
    writeFileSync(join(dir, ASK_FILE), JSON.stringify({ asks: [{ kind: 'icon', what: 'a kite' }, { kind: 'icon', what: 'a key' }] }))
    const late = takeAsks(dir, rooftop, { have, asked: 15, cap: 4, total: 16 })
    assert.equal(late.items.length, 1); assert.match(late.refused[0].why, /this build has had its 16/)
    // broken JSON is said, not thrown
    writeFileSync(join(dir, ASK_FILE), '{nope')
    assert.match(takeAsks(dir, rooftop, { have }).refused[0].why, /not valid JSON/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a Godot game asks from ports/godot/, and its new art is copied into the project', () => {
  const dir = tmp()
  try {
    mkdirSync(join(dir, 'ports', 'godot'), { recursive: true })
    writeFileSync(join(dir, 'ports', 'godot', ASK_FILE), JSON.stringify([{ kind: 'prop', what: 'a satellite dish' }]))
    assert.equal(takeAsks(dir, rooftop).items[0].id, 'prop-a-satellite-dish')
    mkdirSync(join(dir, 'public', 'art'), { recursive: true })
    writeFileSync(join(dir, 'public', 'art', 'prop-a-satellite-dish.png'), 'x')
    assert.deepEqual(syncGodotArt(dir), ['prop-a-satellite-dish.png'])
    assert.ok(existsSync(join(dir, 'ports', 'godot', 'assets', 'art', 'prop-a-satellite-dish.png')))
    assert.match(askBrief({ godot: true }), /ports\/godot\/ART_REQUESTS\.json/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the asks taken are kept, so a resumed build has them again', () => {
  const dir = tmp()
  try {
    assert.deepEqual(askedBefore(dir), [])
    const a = askItem(rooftop, { kind: 'prop', what: 'a vent' })
    keepAsked(dir, [a]); keepAsked(dir, [a])
    assert.deepEqual(askedBefore(dir).map(i => i.id), ['prop-a-vent'])
    assert.ok(existsSync(join(dir, ASKED_FILE)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the stage is told how to ask, with the cap', () => {
  const b = askBrief({ cap: 3 })
  assert.match(b, /ART_REQUESTS\.json/); assert.match(b, /at most 3 per slice/); assert.match(b, /ART_ASKED\.json/)
  assert.equal(askBrief({ cap: 0 }), '')
  assert.ok(ASKS_PER_STAGE >= 1)
})

test('a slice can ask for a tile, an interface piece and an effect', () => {
  const tile = askItem(rooftop, { kind: 'tile', what: 'wet corrugated tin roof' })
  assert.equal(tile.id, 'tile-wet-corrugated-tin-roof'); assert.equal(tile.kind, 'tile'); assert.match(tile.gen, /seamless repeating/i)
  const ui = askItem(rooftop, { kind: 'ui', what: 'a relay signal meter frame' })
  assert.equal(ui.kind, 'ui'); assert.ok(ui.cutout && /^ui-/.test(ui.id)); assert.match(ui.gen, /#FF00FF/); assert.match(ui.gen, /no words/)
  const fx = askItem(rooftop, { kind: 'effect', what: 'relay spark', frames: 'a blue arc that jumps, forks and fades' })
  assert.equal(fx.id, 'fx-relay-spark'); assert.ok(fx.fx && fx.kind === 'sheet' && !fx.after); assert.match(fx.layout, /pure black/)
  assert.match(askItem(rooftop, { kind: 'effect', what: 'rain splash' }).frames, /fades to nothing/)
  assert.match(askBrief(), /a repeating tile, an interface piece, an effect/)
  assert.ok(ASKS_PER_STAGE >= 6 && ASKS_PER_BUILD >= 24)
})
