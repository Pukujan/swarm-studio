// node --test tests/artdirect.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickStyle, styleGuide, cleanGen, promptFor, tierFor, isHero, parseCheck, checkMessages } from '../engine/artdirect.mjs'

test('photo is the default; a brief that names a style gets it', () => {
  assert.equal(pickStyle('a site for a coffee roaster in Lisbon'), 'photo')
  assert.equal(pickStyle('a pixel art platformer about a mole mail carrier'), 'pixel')
  assert.equal(pickStyle('an anime-style game about a rooftop courier'), 'anime-cel')
  assert.equal(pickStyle('a risograph zine flyer for a club night'), 'riso')
  assert.equal(pickStyle('a storybook game, gouache look'), 'gouache')
  // words that name the subject, not the look, keep the photo default
  for (const b of ['AniNYC Comic Con 2025', 'a ceramics studio with clay classes', 'a toy store', 'a sticker shop', 'a painted furniture shop', 'a flyer for a bake sale']) assert.equal(pickStyle(b), 'photo', b)
})

test('the banned look is cleaned out of what a worker asks for', () => {
  const g = styleGuide({ brief: 'a night market food festival' })
  const out = cleanGen('glowing lanterns over an epic neon night market, teal and gold', g)
  assert.doesNotMatch(out, /glow|lantern|epic|neon|teal|gold/i)
  assert.match(out, /night market/)
})

test('a ban is lifted when the brief itself asks for it', () => {
  const g = styleGuide({ brief: 'a neon cyberpunk club night site' })
  assert.ok(!g.bans.includes('neon'))
  assert.match(cleanGen('neon signs in the rain', g), /neon/)
})

test('a brand name that mentions a banned thing does not lift the ban', () => {
  const g = styleGuide({ brief: 'Lantern Row: a weekend night market in a car park' })
  assert.ok(g.bans.includes('glow'))
  assert.doesNotMatch(cleanGen('a stall lit by warm lanterns', g), /lantern/)
})

test('a photo build bans illustrated looks; an art build does not', () => {
  assert.ok(styleGuide({ brief: 'a bakery' }).bans.includes('not-photo'))
  assert.ok(!styleGuide({ brief: 'a pixel art game' }).bans.includes('not-photo'))
})

test('the grade follows the theme colour', () => {
  assert.match(styleGuide({ brief: 'a bakery', theme: { vars: { '--primary': '#c2410c' } } }).guide, /warm grade/)
  assert.match(styleGuide({ brief: 'a bakery', theme: { vars: { '--primary': '#1d4ed8' } } }).guide, /cool grade/)
})

test('the prompt says the shape, the style and the no-text rule', () => {
  const g = styleGuide({ brief: 'a bakery' })
  const p = promptFor('a baker shaping loaves at dawn', g, { aspect: 'portrait' })
  assert.match(p, /^Tall vertical 2:3/)
  assert.match(p, /35mm film/)
  assert.match(p, /No text/)
  assert.match(promptFor('x', g, { strict: 'a glowing sky' }), /sent back for: a glowing sky/)
  assert.ok(p.length <= 1200)
})

test('heroes and posters get the high tier; other pictures keep the pick', () => {
  const choice = { provider: 'openai-codex', model: 'gpt-image-2-low' }
  assert.equal(tierFor(choice, { hero: true }).model, 'gpt-image-2-high')
  assert.equal(tierFor(choice, { hero: false }).model, 'gpt-image-2-low')
  assert.equal(tierFor({ provider: 'fal', model: 'flux' }, { hero: true }).model, 'flux')
  assert.ok(isHero({ layer: 'home-hero' }))
  assert.ok(isHero({ layer: 'home-gallery', n: 1 }))
  assert.ok(!isHero({ layer: 'home-gallery', n: 3 }))
})

test('the check reads the reviewer\'s answer, and doubt passes', () => {
  assert.deepEqual(parseCheck('{"ok":true}'), { ok: true, problems: [] })
  assert.deepEqual(parseCheck('sure {"ok":false,"problems":["glowing teal sky"]}'), { ok: false, problems: ['glowing teal sky'] })
  assert.equal(parseCheck('no json').ok, true)
  assert.equal(parseCheck('{"ok":false}').ok, true)
  const m = checkMessages(styleGuide({ brief: 'a bakery' }), 'data:image/webp;base64,AA')
  assert.match(m[0].content, /neon cyberpunk/)
  assert.equal(m[1].content[1].type, 'image_url')
})

test('words and UI never reach the picture prompt, and the check sends them back', () => {
  const g = styleGuide({ brief: 'a robot factory site' })
  const what = cleanGen('hero dashboard showing assembly cell production stats with a nav bar, robot arms in a factory', g)
  assert.ok(!/dashboard|stats|nav bar/i.test(what), what)
  assert.ok(/robot arms in a factory/.test(what), what)
  const p = promptFor('robot arms', g)
  assert.match(p, /No user interface/)
  const sys = checkMessages(g, 'data:image/png;base64,AA')[0].content
  assert.match(sys, /ANY user interface/)
  assert.match(sys, /Text and interfaces are always sent back/)
})

test('an empty or unreadable reviewer answer is unread, so the next reviewer is asked', () => {
  assert.equal(parseCheck('').unread, true)
  assert.equal(parseCheck('{oops').unread, true)
  assert.equal(parseCheck('{"ok":true}').unread, undefined)
})

test('a sheet prompt keeps its layout and frames ahead of the style, with no companions', async () => {
  const { sheetPrompt } = await import('../engine/artdirect.mjs')
  const guide = styleGuide({ brief: 'anime cel, hand-painted' })
  const p = sheetPrompt({ look: 'Mika, '.repeat(200), frames: 'crouch, jump, fall, slide, hurt, land' }, guide, { layout: 'Six frames in a 3 by 2 grid' })
  assert.ok(p.indexOf('crouch, jump') < 200, 'the frames come first')
  assert.match(p, /3 by 2 grid/)
  assert.match(p, /no companions/)
  assert.ok(p.length <= 1400)
})

test('a key-colour problem swaps the key for the second try', async () => {
  const { keyTrouble, swapKey, keyOf } = await import('../engine/artdirect.mjs')
  const { SPRITE_GROUND: spriteGround0, sheetList } = await import('../engine/game.mjs')
  const spriteGround = () => spriteGround0, sheetLayout = () => sheetList({ hero: 'Mika, a courier in a yellow coat' })[0].layout
  assert.equal(keyTrouble(['magenta rim around the hair']), true)
  assert.equal(keyTrouble(['background left around the figure']), true)
  assert.equal(keyTrouble(['frame 3 cut off at the edge']), false)
  assert.match(swapKey(spriteGround()), /#00FF00/)
  assert.doesNotMatch(swapKey(spriteGround()), /#FF00FF/)
  assert.equal(keyOf(swapKey(swapKey(sheetLayout()))), 'magenta')
  assert.match(swapKey('A figure'), /#00FF00/)
  assert.doesNotMatch(swapKey(spriteGround()), /\bmagenta\b/)
  // the key can be named (the one measured from the picture), and blue is the third key
  assert.equal(keyOf(swapKey(spriteGround(), 'blue')), 'blue')
  assert.match(swapKey(spriteGround(), 'blue'), /solid blue \(#0000FF\).*no blue anywhere/)
  assert.equal(keyOf(swapKey(swapKey(spriteGround(), 'blue'))), 'magenta')
  // only the key's own words change: the figure keeps its green cloak
  const cloak = swapKey(`A ranger in a green cloak. ${swapKey(spriteGround())}`, 'magenta')
  assert.match(cloak, /green cloak/)
  assert.equal(keyOf(cloak), 'magenta')
  assert.doesNotMatch(cloak, /no green|green \(/)
  // a second try on another key is said once, not fought by the prompt's own key
  const { promptFor } = await import('../engine/artdirect.mjs')
  const again = promptFor(swapKey(spriteGround(), 'blue'), {}, { aspect: 'square', cutout: true })
  assert.doesNotMatch(again, /#FF00FF|#00FF00/)
})

test('a backdrop with no people says so up front and at the end, without the style\'s "moment"', async () => {
  const { promptFor, STYLES, EMPTY_PLACE } = await import('../engine/artdirect.mjs')
  const p = promptFor('Side-on view of wet rooftops at dusk. No people, creatures or figures anywhere in the picture', STYLES['anime-cel'])
  assert.ok(p.startsWith(p.split(EMPTY_PLACE)[0]) && p.split(EMPTY_PLACE).length === 3)
  assert.doesNotMatch(p, /slice-of-life moment|Original characters/)
  assert.doesNotMatch(promptFor('A girl reading on a rooftop', STYLES['anime-cel']), /An empty place/)
})
