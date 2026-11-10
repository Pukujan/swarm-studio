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
