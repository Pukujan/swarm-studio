// The Deck kind (docs/specs/35-open-design.md, section 7): looks from html-ppt, an outline from the story,
// one self-contained HTML file that presents itself, and a PDF by the headless Chrome route.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DECK_LOOKS, DECK_SOURCE, lookOf, outlineFrom, outlineLines, cleanSlide, deckVars, deckHtml, deckPdf, LAYOUTS } from '../engine/deck.mjs'
import { applyPack } from '../engine/brandpacks.mjs'
import { findChrome } from '../engine/seo.mjs'

const BEATS = [
  { kind: 'open', headline: 'Pão da Esquina' },
  { kind: 'hook', kicker: 'Mornings', headline: 'Bread before the city wakes', sub: 'Baked at four, gone by nine.' },
  { kind: 'proof', headline: 'Our bakers', sub: 'Seven of them', image: 'https://example.com/b.jpg' },
  { kind: 'quote', say: 'Best bread on the street.' },
  { kind: 'cta', headline: 'Pão da Esquina', sub: 'Rua da Rosa 12' }
]
const bakery = () => { const b = { brief: 'A bakery in Lisbon', palettes: [], types: [], pick: {}, radius: '12px' }; applyPack(b, 'warm-editorial'); return b }

test('the looks are whole, credited, the plain one first, and every one has a look of its own', () => {
  assert.ok(DECK_LOOKS.length >= 10 && DECK_LOOKS.length <= 30)
  assert.equal(DECK_LOOKS[0].slug, 'minimal-white')
  assert.equal(DECK_SOURCE.commit, 'bc06128813c99fa63f5af53ad2c903c27db057f2')
  assert.match(DECK_SOURCE.licence, /MIT/)
  for (const t of DECK_LOOKS) {
    assert.ok(t.name && t.feel, t.slug)
    assert.match(t.source, /^design-templates\/html-ppt\/assets\/themes\/[a-z0-9-]+\.css$/)
    // nothing fetched by a look, and no page-wide rule left that the slide would cover
    assert.doesNotMatch(t.rules, /@import|url\(\s*['"]?https?:|(^|[\s},])(html|body)\s*\{/, t.slug)
  }
  const credits = readFileSync(new URL('../engine/opendesign/CREDITS.md', import.meta.url), 'utf8')
  for (const t of DECK_LOOKS) assert.ok(credits.includes(`themes/${t.slug}.css`), t.slug)
  assert.ok(existsSync(new URL('../engine/opendesign/LICENSE.html-ppt', import.meta.url)))
  assert.equal(lookOf('no-such').slug, 'minimal-white')
})

test('the outline comes from the story beats: a title first, a line per beat, the call to act last', () => {
  const d = outlineFrom({ story: { what: 'Pão da Esquina', who: 'neighbours' }, beats: BEATS })
  assert.deepEqual(d.slides.map(s => s.layout), ['title', 'section', 'picture', 'quote', 'end'])
  assert.equal(d.slides[2].image.url, 'https://example.com/b.jpg')
  assert.equal(d.slides.at(-1).lede, 'Rua da Rosa 12')
  assert.deepEqual(outlineLines(d).slice(0, 2), ['1. Pão da Esquina', '2. Bread before the city wakes'])
  // no beats: the brand sheet's storyboard frames, then the pages
  const f = outlineFrom({ brief: 'A bakery', frames: ['A wide photo', 'Three things', 'Where to find us'] })
  assert.equal(f.slides.length, 5)
  assert.equal(outlineFrom({ brief: 'A bakery' }).slides.length, 2)
})

test('a slide is cleaned: an unknown layout, long text, too many points and a bad picture are fixed', () => {
  const s = cleanSlide({ layout: 'spin', title: 'x'.repeat(300), points: ['a', 'b', 'c', 'd', 'e', 'f'], image: { url: 'javascript:alert(1)' } })
  assert.equal(s.layout, 'section')
  assert.ok(s.title.length <= 90)
  assert.equal(s.points.length, 4)
  assert.equal(s.image, undefined)
  assert.ok(LAYOUTS.includes('stats') && LAYOUTS.includes('steps'))
})

test('the brand gives the colours and fonts; the look keeps its shape', () => {
  const b = bakery()
  const plain = deckVars(b, lookOf('minimal-white'))
  assert.equal(plain.vars.bg, '#f5efe6')
  assert.equal(plain.fonts.heading, 'Fraunces')
  assert.equal(plain.vars.radius, b.radius, 'the plain look takes the brand corners')
  const bauhaus = deckVars(b, lookOf('bauhaus'))
  assert.equal(bauhaus.vars.radius, lookOf('bauhaus').shape.radius, 'a Bauhaus deck stays square')
  assert.equal(bauhaus.vars.bg, '#f5efe6')
  // no brand: the look's own colours
  assert.equal(deckVars(null, lookOf('aurora')).vars.bg, lookOf('aurora').colours.bg)
})

test('the HTML is one file that presents itself, with the text escaped and nothing but fonts fetched', () => {
  const d = outlineFrom({ story: { what: 'Pão <b>da</b> Esquina' }, beats: BEATS })
  const html = deckHtml({ ...d, look: 'swiss-grid' }, { brand: bakery() })
  assert.equal((html.match(/<section class="slide/g) || []).length, d.slides.length)
  assert.ok(!html.includes('<b>da</b>'))
  assert.match(html, /ArrowRight/)
  assert.match(html, /requestFullscreen/)
  assert.match(html, /@page\{size:1920px 1080px/)
  assert.match(html, /html-ppt \(MIT/)
  assert.match(html, /--bg:#f5efe6/)
  const fetched = [...html.matchAll(/(?:href|src)="(https?:[^"]+)"/g)].map(m => new URL(m[1]).host)
  assert.deepEqual([...new Set(fetched)].sort(), ['example.com', 'fonts.googleapis.com'].sort())
  assert.doesNotMatch(html, /<script[^>]+src=/)
})

test('the PDF is printed by the headless Chrome, one page a slide', { skip: !findChrome() && 'no Chrome here' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-'))
  try {
    const d = outlineFrom({ brief: 'A bakery', frames: ['One', 'Two', 'Three'] })
    const pdf = join(dir, 'deck.pdf')
    assert.equal(deckPdf(deckHtml(d, { brand: bakery() }), pdf), true)
    const bytes = readFileSync(pdf)
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
    assert.equal((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, d.slides.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('no Chrome, no PDF, and no throw', () => {
  assert.equal(deckPdf('<p>x</p>', join(tmpdir(), 'never.pdf'), { chrome: null }), false)
})

// ---------- the kit's routes (server/deck.mjs) ----------
import { deckRoutes } from '../server/deck.mjs'
import { suggestLooks, draftDeck, cleanDeck } from '../engine/deck.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'

const call = (routes, method, path, body) => new Promise(resolve => {
  const req = { method, on(ev, fn) { if (ev === 'data' && body) fn(JSON.stringify(body)); if (ev === 'end') fn() }, destroy() {} }
  const res = { writeHead(code, h) { this.code = code; this.h = h; return this }, end(t) { const s = String(t); resolve({ code: this.code, type: this.h?.['content-type'], body: /json/.test(this.h?.['content-type']) ? JSON.parse(s) : s }) } }
  assert.equal(routes(req, res, new URL(`http://x${path}`)), true)
})

test('two or three looks are suggested by the words, and the planner writes the slides (or the outline stays)', async () => {
  assert.equal(suggestLooks('A pitch for our seed round')[0], 'pitch-deck-vc')
  assert.equal(suggestLooks('a bakery').length, 3)
  let sys = ''
  const chat = async m => { sys = m[0].content; return JSON.stringify({ title: 'Bakery', slides: [{ layout: 'points', title: 'Why', points: ['Slow dough', 'Local flour'] }, { layout: 'stats', title: 'Numbers', stats: [{ value: '7', label: 'bakers' }] }, { layout: 'section', title: 'Visit' }] }) }
  const d = await draftDeck({ brief: 'A bakery', chat, voice: { name: 'Warm', lines: ['Made slowly.'] } })
  assert.match(sys, /Never invent/)
  assert.match(sys, /Made slowly/)
  assert.deepEqual(d.slides.map(s => s.layout), ['title', 'points', 'stats', 'section', 'end'], 'a title and an end are added')
  assert.equal((await draftDeck({ brief: 'A bakery', chat: async () => 'no json' })).from, 'outline')
  const c = cleanDeck({ look: 'nope', start: 'x', key: 99, slides: [] })
  assert.equal(c.look, 'minimal-white')
  assert.equal(c.start, 'outline')
  assert.ok(c.slides.length >= 2)
})

test('the routes: looks, a draft read from the project\'s brand, a still slide, saved, exported and served', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deckr-'))
  try {
    mkdirSync(join(dir, 'projects', 'p1'), { recursive: true })
    writeFileSync(join(dir, 'projects', 'p1', 'brand.json'), JSON.stringify(bakery()))
    let printed = 0
    const routes = deckRoutes({ dataDir: dir, pdf: (html, dst) => { printed++; writeFileSync(dst, '%PDF-1.4'); return true } })
    assert.equal(routes({ method: 'GET' }, {}, new URL('http://x/api/brand')), false, 'not ours')
    const looks = await call(routes, 'GET', '/api/kit/deck/looks')
    assert.equal(looks.body.looks.length, DECK_LOOKS.length)
    assert.equal((await call(routes, 'POST', '/api/kit/deck/draft', { brief: ' ' })).code, 400)
    const draft = await call(routes, 'POST', '/api/kit/deck/draft', { brief: 'A bakery in Lisbon', beats: BEATS, project: 'p1', quick: true })
    assert.equal(draft.body.deck.slides[1].title, 'Bread before the city wakes')
    assert.equal(draft.body.looks.length, 3)
    const still = await call(routes, 'POST', '/api/kit/deck/render', { deck: draft.body.deck, slide: 1, project: 'p1' })
    assert.equal((still.body.html.match(/<section class="slide/g) || []).length, 1)
    assert.doesNotMatch(still.body.html, /<script>/)
    assert.match(still.body.html, /--bg:#f5efe6/, 'the project\'s brand')
    assert.equal((await call(routes, 'POST', '/api/kit/deck/p1/export', { format: 'html' })).code, 409, 'nothing saved yet')
    await call(routes, 'PUT', '/api/kit/deck/p1', { deck: { ...draft.body.deck, look: 'swiss-grid' } })
    assert.equal((await call(routes, 'GET', '/api/kit/deck/p1')).body.deck.look, 'swiss-grid')
    const ex = await call(routes, 'POST', '/api/kit/deck/p1/export', { format: 'html' })
    assert.equal(ex.body.url, '/api/kit/deck/p1/deck.html')
    const file = await call(routes, 'GET', ex.body.url)
    assert.match(file.type, /text\/html/)
    assert.match(file.body, /ArrowRight/)
    assert.equal((await call(routes, 'POST', '/api/kit/deck/p1/export', { format: 'pdf' })).body.file, 'deck.pdf')
    assert.equal(printed, 1)
    assert.equal((await call(routes, 'GET', '/api/kit/deck/p2/deck.pdf')).code, 404)
    assert.equal((await call(routes, 'GET', '/api/kit/deck/p1%2F..%2F..%2Fx/deck.html')).code, 404, 'no way out of the project')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a build\'s story (spec 39) starts the outline: its beats by role, line and picture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'decks-'))
  try {
    const runs = join(dir, 'runs')
    mkdirSync(join(runs, 'r1'), { recursive: true })
    writeFileSync(join(runs, 'r1', 'story.json'), JSON.stringify({ v: 1, beats: [
      { id: 'b1', role: 'hook', kicker: 'New', headline: 'Bread at dawn', line: 'Baked at four.' },
      { id: 'b2', role: 'what', headline: 'A corner bakery', line: 'Slow dough, local flour.', picture: { kind: 'image', src: 'https://example.com/a.jpg' } },
      { id: 'b3', role: 'next', headline: 'Pão da Esquina', line: 'Rua da Rosa 12' }
    ] }))
    const routes = deckRoutes({ dataDir: dir, runsDir: runs })
    const d = (await call(routes, 'POST', '/api/kit/deck/draft', { brief: 'A bakery', run: 'r1', quick: true })).body
    assert.deepEqual(d.deck.slides.map(s => s.layout), ['title', 'section', 'picture', 'end'])
    assert.equal(d.deck.slides[1].lede, 'Baked at four.')
    assert.equal(d.deck.slides.at(-1).lede, 'Rua da Rosa 12')
    assert.match(d.say, /from the story/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
