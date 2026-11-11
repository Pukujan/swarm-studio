import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sheetList as sheetListAll } from '../engine/game.mjs'
const sheetListOf = s => sheetListAll(s)[0]
import { QUESTIONS, plan, isBig, bigGaps, artList, artBrief, stagesFor, bigStagePrompt, gamePrompt, specMarkdown } from '../engine/game.mjs'

const big = {
  title: 'Rooftop Signal', pitch: 'A free rooftop runner: jump the gaps and fix the relays home.', genre: 'Platformer', view: 'side',
  setting: 'a rainy city of rooftops', hero: 'Mika, a courier in a yellow jacket; with Rust-8, a small robot', loop: 'run, jump, slide, grab power-ups',
  engine: 'Phaser 3', skills: [], big: true, look: '2D painted anime', controls: 'Space to jump, S to slide', win: 'reach home', goal: 'repair every relay on the way home',
  places: [{ name: 'Harbour Roofs', what: 'wet tin roofs' }, { name: 'Neon Market', what: 'signs and awnings' }, { name: 'Home Tower', what: 'her own roof' }],
  enemies: ['gull', 'drone', 'spark'].map(name => ({ name, attack: 'gets in the way' })),
  items: [{ name: 'Glide Kite', effect: 'float over a gap' }, { name: 'Spark Boots', effect: 'a double jump' }],
  stages: [
    { name: 'the core run', what: 'Mika runs right on her own; jump and slide; one gap and one vent; fall and restart' },
    { name: 'the relays', what: 'each stage ends at a broken relay she repairs; three stages from the places' },
    { name: 'power-ups', what: 'the items from the spec as pickups' },
    { name: 'home', what: 'the last relay lights the line home; the ending at Home Tower' }
  ]
}

test('the interview asks how big, and the mini game stays the default', () => {
  const q = QUESTIONS.find(x => x.id === 'scope')
  assert.ok(q && q.chips.includes('Mini game') && q.chips.includes('Big game'))
  assert.equal(plan({}).big, false)
  assert.equal(plan({ scope: 'Big game' }).big, true)
  assert.equal(isBig({ big: true }), true)
  assert.equal(isBig({ answers: { scope: 'Big game' } }), true)
  assert.equal(isBig({ answers: { scope: 'Mini game' } }), false)
  assert.ok(plan({}).skills.length <= 6)
  assert.ok(plan({ scope: 'Big game' }).skills.includes('gamedev/level-design'))
})

test('a big spec plans its own slices; nothing roguelike is required', () => {
  assert.deepEqual(bigGaps(big), [])
  assert.deepEqual(bigGaps({ ...big, stages: big.stages.slice(0, 2), places: [] }), ['3 build slices in "stages"', 'a place to paint'])
  assert.deepEqual(stagesFor(big).map(s => s.name), ['the core run', 'the relays', 'power-ups', 'home'])
  // a spec without its own slices gets plain ones that only point at the spec
  const plain = stagesFor({ title: 'x' })
  assert.ok(plain.length >= 3 && plain.every(s => !/hub|boon|weapon|room/i.test(s.what)))
})

test('the art list follows the game: side view for a runner, places, items, under its cap', () => {
  const all = artList(big)
  const kinds = new Set(all.map(a => a.kind))
  for (const k of ['title', 'sprite', 'icon', 'backdrop']) assert.ok(kinds.has(k), k)
  assert.ok(all.length <= 26)
  const backs = all.filter(a => a.kind === 'backdrop')
  assert.deepEqual(backs.map(a => a.id), ['place-harbour-roofs', 'place-neon-market', 'place-home-tower'])
  assert.ok(backs.every(a => /Side-on view/.test(a.gen) && !/Top-down/.test(a.gen) && /No people/.test(a.gen)))
  const sprites = all.filter(a => a.kind === 'sprite')
  assert.ok(sprites.some(a => a.id === 'sprite-hero') && sprites.every(a => a.cutout && /flat solid magenta \(#FF00FF\) chroma-key/.test(a.gen)))
  assert.ok(/Side view facing right/.test(sprites[0].gen))
  assert.ok(!all.some(a => /^room-|^boon-/.test(a.id)), 'no hub, rooms or boons the game never had')
  assert.ok(all.some(a => a.id === 'item-glide-kite'))
  assert.equal(new Set(all.map(a => a.id)).size, all.length, 'ids are unique')
  // a top-down game still gets its arena view, and a boss when it has one
  const arena = artList({ ...big, view: 'top-down', boss: { name: 'The Tenor', look: 'a bell' } })
  assert.ok(arena.filter(a => a.kind === 'backdrop').every(a => /Top-down/.test(a.gen)))
  assert.ok(arena.some(a => a.id === 'sprite-boss') && arena.some(a => a.id === 'portrait-the-tenor'))
  const few = artList(big, { max: 4 })
  assert.equal(few.length, 4)
  assert.deepEqual(new Set(few.map(a => a.kind)), kinds, 'a tight cap still keeps one of each kind')
})

test('the stages go one system group at a time and name the painted files', () => {
  const art = [{ file: 'art/title.png', what: 'title screen picture' }]
  const first = bigStagePrompt(big, 0, { art })
  assert.match(first, /slice 1: the core run/)
  assert.match(first, /never turn it into another kind of game/)
  assert.match(first, /How to build it/, 'the first stage carries the engine notes')
  assert.match(first, /art\/title\.png/)
  assert.doesNotMatch(first, /so no image files are needed/)
  // every stage keeps the figures upright and clears camera effects before a dialogue pause
  for (const i of [0, 3]) { const p = bigStagePrompt(big, i, { art }); assert.match(p, /never rotate a character/); assert.match(p, /resetFX/) }
  const later = bigStagePrompt(big, 2, { art, failed: 'the build failed. Make it pass.' })
  assert.match(later, /Already built: the core run, the relays/)
  assert.match(later, /^This is a big browser game/)
  assert.match(later, /First: the build failed/)
  assert.doesNotMatch(later, /How to build it/)
  assert.match(artBrief([]), /draw every portrait/)
})

test('the spec file lists a big game\'s systems; the mini prompt is unchanged', () => {
  const md = specMarkdown(big)
  for (const s of ['**Genre:** Platformer', '## Places', 'Neon Market', '## Items and power-ups', '## Build slices', '4. **home**']) assert.ok(md.includes(s), s)
  for (const s of ['## Hub', '## Weapons', '## Boss', '## Run summary']) assert.ok(!md.includes(s), `no ${s} the game never had`)
  assert.match(md, /Enemies \/ obstacles:\*\* gull, drone/, 'object enemies list by name')
  const mini = { ...big, big: undefined, enemies: ['ink moths'] }
  assert.doesNotMatch(specMarkdown(mini), /## Build slices/)
  const p = gamePrompt(mini)
  assert.match(p, /^Build this browser game as the whole app/)
  assert.doesNotMatch(p, /stage/)
})

test('a spec with 3D models builds the game around them', async () => {
  const { gamePrompt, gameModels } = await import('../engine/game.mjs')
  const spec = { title: 'Bonelight', engine: 'three.js', models: [{ file: 'Knight.glb', what: 'the hero' }, { file: '../x.glb' }, { file: 'a.exe' }] }
  assert.deepEqual(gameModels(spec).map(m => m.file), ['Knight.glb'])
  const p = gamePrompt(spec)
  assert.match(p, /public\/models\//)
  assert.match(p, /Knight\.glb: the hero/)
  assert.doesNotMatch(p, /Build every model in code/)
  assert.match(gamePrompt({ title: 'X', engine: 'three.js' }), /Build every model in code/)
})

test("a game's models are copied into its app, and kept on a start over", async () => {
  const { copyModels } = await import('../engine/appjob.mjs')
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const base = mkdtempSync(join(tmpdir(), 'models-'))
  writeFileSync(join(base, 'Knight.glb'), 'glTF')
  const dir = join(base, 'app')
  assert.equal(copyModels(dir, { 'public/models/Knight.glb': join(base, 'Knight.glb'), 'src/evil.ts': join(base, 'Knight.glb') }), 1)
  assert.ok(existsSync(join(dir, 'public', 'models', 'Knight.glb')))
  assert.ok(!existsSync(join(dir, 'src')))
  mkdirSync(join(`${dir}-before`, 'public', 'models'), { recursive: true })
  writeFileSync(join(`${dir}-before`, 'public', 'models', 'Mage.glb'), 'glTF')
  const again = join(base, 'app')
  assert.equal(copyModels(again, {}), 1)
  assert.ok(existsSync(join(again, 'public', 'models', 'Mage.glb')))
})

test('a runner gets side-view run and move sheets, painted after the hero sprite', async () => {
  const { sheetList, sideView } = await import('../engine/game.mjs')
  const runner = { hero: 'Mika, a girl courier in a yellow rain jacket; with Rust-8, a small rusty robot', pitch: 'A rooftop runner: jump and slide across the city' }
  assert.equal(sideView(runner), true)
  const s = sheetList(runner)
  assert.deepEqual(s.map(x => x.id), ['sheet-hero-run', 'sheet-hero-moves'])
  assert.ok(s.every(x => x.after === 'sprite-hero' && x.kind === 'sheet' && x.layout))
  assert.ok(!/Rust-8/.test(s[0].look), 'a companion is left out of the figure')
  assert.equal(sheetList({ hero: 'Senna', pitch: 'a top-down roguelike' })[0].id, 'sheet-hero-walk')
  assert.deepEqual(sheetList({}), [])
})

test('the art brief tells the stage how to play a sheet', () => {
  const b = artBrief([{ file: 'art/sheet-hero-run.webp', what: 'run sheet of Mika', kind: 'sheet', count: 6, cell: [511, 511], fps: 12, loop: true, frames: 'a run cycle' }])
  assert.match(b, /6 frames side by side, each 511×511 px/)
  assert.match(b, /12 fps, looping/)
  assert.match(b, /sheet-hero-\*\.webp\) are its animation/)
})

test('sprites stand on magenta, or green when the character is pink', async () => {
  const { keyFor } = await import('../engine/keycolor.mjs')
  assert.equal(keyFor('yellow rain jacket').hex, '#FF00FF')
  assert.equal(keyFor('an elegant pink-haired caster').hex, '#00FF00')
  const pink = artList({ ...big, hero: 'Rin, a deadpan caster with pink hair' })
  assert.match(pink.find(a => a.id === 'sprite-hero').gen, /solid green \(#00FF00\)/)
  assert.match(sheetListOf({ ...big }).layout, /magenta \(#FF00FF\)/)
})

test('after a slice the build asks in the chat, and the answer goes into the next slice', async () => {
  const { sliceAsk } = await import('../engine/game.mjs')
  const a = sliceAsk(big, 0)
  assert.match(a.ask, /Slice 1 of 4, the core run/)
  assert.match(a.ask, /App window/)
  assert.equal(a.next, 'the relays')
  assert.match(a.ideas[0], /^Looks good, go on to the relays/)
  assert.ok(a.ideas.some(x => /Mika bigger/.test(x)))
  const p = bigStagePrompt(big, 1, { note: 'make the gaps wider' })
  assert.match(p, /The person played the last slice and said: "make the gaps wider"/)
  assert.doesNotMatch(bigStagePrompt(big, 1), /The person played/)
})
