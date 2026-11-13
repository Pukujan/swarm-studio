// Brand packs (docs/specs/31-brand-sheet.md, slice 2): ready-made sets of pictures, look, voice and
// storyboard. Picking one fills the sheet; parts of different packs mix; the planner suggests two or three.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BRAND_PACKS, PACK_SLUG, packCards, suggestByWords, cleanSuggest, applyPack, packBrief } from '../engine/brandpacks.mjs'
import { brandOptions, brandBrief, brandTheme, contrast } from '../engine/brand.mjs'
import { pickStyle } from '../engine/artdirect.mjs'
import { chatStore } from '../engine/chats.mjs'
import { brandRoutes, lockedBrand } from '../server/brand.mjs'

const RATS = 'A community website for rat owners and lovers in the NYC tri-state area, with meetups and care guides.'
const BAKERY = 'A website for a small neighbourhood bakery in Lisbon: fresh bread, a café corner, opening hours.'

test('every pack is whole: a Feed-style slug, a readable palette, fonts, a voice, photos and a storyboard', () => {
  assert.ok(BRAND_PACKS.length >= 5)
  const cards = packCards(BAKERY)
  const seen = new Set()
  for (const k of cards) {
    assert.match(k.slug, PACK_SLUG)
    assert.ok(contrast(k.palette.bg, k.palette.text) >= 7, k.slug)
    assert.ok(k.type.heading && k.type.body && k.voice.lines.length >= 2 && k.storyboard.length >= 3, k.slug)
    // real sample pictures from the shipped library, never the same photo on two packs
    assert.equal(k.pictures.photos.length, 3, k.slug)
    for (const p of k.pictures.photos) { assert.match(p.url, /^https:\/\//); assert.ok(!seen.has(p.url), p.url); seen.add(p.url) }
    // websites get realistic people or a mature painted look, never anime by default
    assert.ok(!/anime|manga/.test(k.pictures.style), k.slug)
  }
})

test('two or three packs are suggested, each with a line; an unknown pack from the planner is dropped', () => {
  const s = suggestByWords(RATS)
  assert.ok(s.length >= 2 && s.length <= 3)
  assert.ok(s.some(x => x.slug === 'playful-community'))
  assert.ok(s.every(x => x.why.length > 5))
  const c = cleanSuggest([{ slug: 'neon-anime', why: 'x' }, { slug: 'bold-event', why: 'A launch night.' }], RATS)
  assert.equal(c[0].slug, 'bold-event')
  assert.equal(c.length, 2, 'filled up to two from the words')
  // the suggested packs come first on the board
  const cards = packCards(RATS, s)
  assert.deepEqual(cards.slice(0, s.length).map(k => k.slug).sort(), s.map(x => x.slug).sort())
})

test('the planner\'s board call names its packs', async () => {
  let sys = ''
  const chat = async m => { sys = m[0].content; return JSON.stringify({ story: { what: 'A rat club', who: 'rat owners', pages: ['Home'] }, palettes: [], types: [], packs: [{ slug: 'playful-community', why: 'A club people join.' }, { slug: 'warm-editorial', why: 'Care guides read slowly.' }] }) }
  const o = await brandOptions({ brief: RATS, chat })
  assert.match(sys, /playful-community/)
  assert.deepEqual(o.suggest.map(x => x.slug), ['playful-community', 'warm-editorial'])
  assert.ok((await brandOptions({ brief: RATS })).suggest.length >= 2, 'no model: by the words')
})

test('a pack fills the sheet, one part of another pack mixes in, and the build is told the voice and pictures', () => {
  const b = { brief: BAKERY, palettes: [], types: [], pick: { palette: null, type: null }, radius: '12px' }
  applyPack(b, 'warm-editorial')
  assert.equal(b.pack, 'warm-editorial')
  assert.equal(brandTheme(b).vars['--background'], '#f5efe6')
  assert.equal(brandTheme(b).fonts.heading, 'Fraunces')
  assert.equal(b.radius, '6px')
  assert.equal(b.pictures.photos.length, 3)
  assert.equal(b.storyboard.frames.length, 4)
  // the type of another pack: the palette and the voice stay
  applyPack(b, 'quiet-portfolio', ['type'])
  assert.equal(brandTheme(b).fonts.heading, 'Cormorant Garamond')
  assert.equal(brandTheme(b).vars['--background'], '#f5efe6')
  assert.equal(b.voice.pack, 'warm-editorial')
  assert.equal(b.pack, 'warm-editorial')
  // both packs' options stay on the sheet, so either can be picked again
  assert.equal(b.types.length, 2)
  b.story = { what: 'A bakery', who: 'neighbours', pages: ['Home'] }
  const brief = brandBrief(b)
  assert.match(brief, /Made slowly/)
  assert.match(packBrief(b), /Film photo/)
  assert.equal(pickStyle(brief), 'photo', 'the art director reads the pictures line')
})

const call = (routes, method, path, body) => new Promise(resolve => {
  const req = { method, on(ev, fn) { if (ev === 'data' && body) fn(JSON.stringify(body)); if (ev === 'end') fn() }, destroy() {} }
  const res = { writeHead(code) { this.code = code; return this }, end(t) { resolve({ code: this.code, body: JSON.parse(t) }) } }
  routes(req, res, new URL(`http://x${path}`))
})

test('the routes: the view carries the pack cards, a pack is picked whole or in part, and locks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brandpk-'))
  try {
    const chats = chatStore(dir)
    const routes = brandRoutes({ chats })
    const made = await call(routes, 'POST', '/api/brand', { brief: RATS, kind: 'site' })
    const id = made.body.chat
    // our own five, plus the imported looks the planner suggested (never all of them)
    assert.ok(made.body.packs.length >= 5 && made.body.packs.length <= 8, `${made.body.packs.length}`)
    assert.ok(made.body.brand.suggest.length >= 2)
    assert.equal((await call(routes, 'POST', `/api/brand/${id}/pick`, { part: 'pack', id: 'no-such' })).code, 400)
    const all = await call(routes, 'POST', `/api/brand/${id}/pick`, { part: 'pack', id: 'playful-community' })
    assert.equal(all.body.brand.pack, 'playful-community')
    assert.equal(all.body.theme.vars['--background'], '#fff8ec')
    const one = await call(routes, 'POST', `/api/brand/${id}/pick`, { part: 'pack', id: 'bold-event', parts: ['voice'] })
    assert.equal(one.body.brand.voice.pack, 'bold-event')
    assert.equal(one.body.theme.vars['--background'], '#fff8ec')
    await call(routes, 'POST', `/api/brand/${id}/lock`)
    assert.match(lockedBrand(chats, id).brief, /One night/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------- Open Design's generic design systems as packs (docs/specs/35-open-design.md)
import { readFileSync as readOd } from 'node:fs'
import { OD_PACKS, OWN_PACKS } from '../engine/brandpacks.mjs'

const OD = JSON.parse(readOd(new URL('../engine/opendesign/packs.json', import.meta.url), 'utf8'))
// fonts the Studio loads (Google Fonts families); the importer swaps anything else
const GOOGLE_FONT = /^[A-Z][A-Za-z0-9 ]{1,38}$/
const BRANDS = /\b(stripe|apple|linear|vercel|notion|airbnb|tesla|ferrari|nike|spotify|openai|claude|figma|pacman|tetris|google|microsoft|meta|slack|shopify|uber)\b/i

// every system, the ones named after a real brand too (decision 0016: the owner, "I want these")
test('the imported packs are whole and credited, all of them, and our own five stay first', () => {
  assert.ok(OD_PACKS.length >= 151, `${OD_PACKS.length}`)
  assert.deepEqual(BRAND_PACKS.slice(0, OWN_PACKS.length).map(p => p.slug), OWN_PACKS.map(p => p.slug))
  assert.equal(OD.source.commit, '59e4f2ae85de7e7318a5e6bdcf3a34584c4b7582')
  const slugs = new Set()
  for (const p of OD_PACKS) {
    assert.match(p.slug, PACK_SLUG); assert.ok(!slugs.has(p.slug)); slugs.add(p.slug)
    assert.match(p.source.path, /^design-systems\/[a-z0-9-]+\/$/)
    assert.match(p.type.heading, GOOGLE_FONT); assert.match(p.type.body, GOOGLE_FONT)
    assert.ok(p.voice.lines.length >= 2 && p.storyboard.length >= 3 && p.for && p.words instanceof RegExp, p.slug)
    assert.match(p.radius, /^\d+px$/)
  }
})

test('the board shows our five plus only the suggested looks, never sixty', () => {
  const s = suggestByWords('A website for a small café and bakery in Lisbon, with a tea corner')
  assert.ok(s.some(x => x.slug === 'od-cafe'))
  const cards = packCards('café', s)
  assert.ok(cards.length <= OWN_PACKS.length + 3)
  assert.ok(cards.some(k => k.slug === 'od-cafe'))
  for (const k of cards) assert.ok(contrast(k.palette.bg, k.palette.text) >= 7, k.slug)
  // with nothing suggested, only our own five
  assert.equal(packCards('café').length, OWN_PACKS.length)
  // a picked imported pack stays on the board
  assert.ok(packCards('', [], 'od-hud').some(k => k.slug === 'od-hud'))
})

test('an imported pack fills the sheet and the build is told its look', () => {
  const b = { brief: 'a trading tool', palettes: [], types: [], pick: { palette: null, type: null }, radius: '12px' }
  assert.ok(applyPack(b, 'od-trading-terminal'))
  assert.equal(b.pack, 'od-trading-terminal')
  assert.equal(brandTheme(b).fonts.heading, 'JetBrains Mono')
  assert.match(packBrief(b), /The look \(Trading Terminal\)/)
})
