import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { storyFacts, pickType, rulesStory, checkStory, editStory, writeStory, storyPrompt, STORY_TYPES, MIN_BEATS, MAX_BEATS, storyText } from '../engine/story.mjs'
import { cardHtml, drawCards, SHAPES } from '../engine/storycards.mjs'

const PROMPT = 'do u wanna grill me first? a late-night supper club in Lisbon called Saffron & Smoke, dont build yet'
const events = ({ url = null, game = false, who = true } = {}) => [
  { type: 'run:start', t: 1, brief: PROMPT, title: 'Saffron & Smoke', agents: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
  { type: 'theme', vars: { '--background': '#0b0d0a', '--foreground': '#f2ede1', '--primary': '#7fb069', '--primary-foreground': '#0b0d0a' }, fonts: { heading: 'Fraunces', body: 'Karla' } },
  { type: 'page', id: 'home', title: 'Saffron & Smoke', purpose: 'the cover', index: 0 },
  { type: 'page', id: 'menu', title: "Tonight's Menu", purpose: 'set the scene for the menu', index: 1 },
  { type: 'page', id: 'room', title: 'The Room', purpose: 'the room', index: 2 },
  { type: 'layer:done', page: 'home', layer: 'hero', html: '<section><h1>Saffron &amp; Smoke</h1><p>Supper after midnight.</p></section>' },
  { type: 'layer:done', page: 'menu', layer: 'hero', html: '<section><h2>Cooked once, eaten late</h2><p>Seven plates, one fire.</p></section>' },
  { type: 'layer:done', page: 'room', layer: 'hero', html: '<section><h2>One long low room</h2><p>Green banquettes.</p></section>' },
  { type: 'image', page: 'home', src: '/img/r1/1.png' },
  { type: 'image', page: 'menu', src: '/img/r1/2.png' },
  ...(url ? [{ type: 'app:deployed', url }] : []),
  ...(game ? [{ type: 'game:done' }] : [])
]
const brand = who => ({ story: { what: 'A late-night supper club in Lisbon', who: who ? 'Night owls who eat after midnight' : '' } })
const facts = (o = {}) => storyFacts(events(o), 'r1', { brand: brand(o.who !== false) })
const words = s => s.beats.map(b => `${b.kicker} ${b.headline} ${b.line}`).join(' ')

test('the type comes from what the project is, and every type has a hook first and where to go last', () => {
  assert.equal(pickType(facts()), 'launch')
  assert.equal(pickType(facts({ game: true })), 'trailer')
  assert.equal(pickType({ ...facts(), what: 'The portfolio of a Lisbon photographer' }), 'about')
  assert.equal(pickType({ ...facts(), what: 'A food festival weekend, tickets on sale' }), 'event')
  for (const type of Object.keys(STORY_TYPES)) {
    const s = rulesStory(facts(), type)
    assert.equal(s.type, type)
    assert.ok(s.beats.length >= MIN_BEATS && s.beats.length <= MAX_BEATS, `${type}: ${s.beats.length} beats`)
    assert.equal(s.beats[0].role, 'hook')
    assert.equal(s.beats.at(-1).role, 'next')
  }
})

test('a story is written from the brand and the pages, never the person\'s words to the crew', () => {
  const s = rulesStory(facts())
  const all = words(s)
  assert.match(all, /late-night supper club in Lisbon/)
  assert.match(all, /Cooked once, eaten late/, 'a moment uses its page\'s own heading')
  assert.doesNotMatch(all, /grill|dont build|wanna/i)
  assert.equal(s.brand.heading, 'Fraunces')
  assert.equal(s.brand.accent, '#7fb069')
  // a moment shows its own page's screen
  const menu = s.beats.find(b => b.headline === 'Cooked once, eaten late')
  assert.deepEqual(menu.picture, { kind: 'screen', src: null, page: 'menu' })
})

test('"is live" only with a real published link, and no counts of zero', () => {
  const draft = rulesStory(facts())
  assert.doesNotMatch(words(draft), /\blive\b/i)
  const live = rulesStory(facts({ url: 'https://saffron.example.com' }))
  assert.match(live.beats[0].headline, /is live/)
  assert.equal(live.beats.at(-1).headline, 'saffron.example.com')
  const { story, fixes } = checkStory({ type: 'launch', beats: [
    { role: 'hook', headline: 'Saffron & Smoke is live now' },
    { role: 'what', headline: 'A supper club', line: 'With 0 reviews so far.' },
    { role: 'moment', headline: 'do u wanna grill me first?' },
    { role: 'moment', headline: 'Lisbon called Saffron & Smoke, dont build yet' },
    { role: 'next', headline: 'Come by' }
  ] }, facts())
  assert.doesNotMatch(words(story), /\blive\b|\b0 reviews|grill|dont build/i)
  assert.ok(fixes.length >= 3, fixes.join('; '))
  // the brand's own words are not an echo, even when the person used them too
  const own = checkStory(rulesStory(facts()), facts(), { edited: true })
  assert.ok(!own.fixes.some(x => /repeated/.test(x)), own.fixes.join('; '))
})

test('a model\'s story is checked: unknown pictures replaced, the shape repaired, lengths clipped', async () => {
  const f = facts()
  const chat = async msgs => {
    assert.match(msgs[0].content, /never say it is live/)
    assert.doesNotMatch(msgs[1].content, /grill/)
    return JSON.stringify({ type: 'launch', beats: [
      { role: 'what', headline: 'x'.repeat(200), picture: 99 },
      { role: 'moment', headline: 'Seven plates', picture: 1 },
      { role: 'moment', headline: 'One room', picture: 3 }
    ] })
  }
  const { story, by } = await writeStory(f, { chat })
  assert.equal(by, 'planner')
  assert.equal(story.beats[0].role, 'hook')
  assert.equal(story.beats.at(-1).role, 'next')
  assert.ok(story.beats.length >= MIN_BEATS)
  assert.ok(story.beats.every(b => b.headline.length <= 60))
  assert.ok(story.beats.every(b => !b.picture || b.picture.src === null || b.picture.src.startsWith('/img/r1/')))
  // a broken answer falls back to rules
  const r = await writeStory(f, { chat: async () => 'no json' })
  assert.equal(r.by, 'rules')
  assert.ok(storyPrompt(f)[1].content.includes('Pictures you can use'))
})

test('edits: reword, swap the picture, reorder and switch type, each checked again', () => {
  const f = facts()
  let s = rulesStory(f)
  s = editStory(s, f, { op: 'reword', beat: 'b2', headline: 'Supper after midnight' })
  assert.equal(s.beats[1].headline, 'Supper after midnight')
  assert.throws(() => editStory(s, f, { op: 'reword', beat: 'b99', headline: 'x' }))
  s = editStory(s, f, { op: 'reword', beat: 'b2', headline: 'It is live now' })
  assert.doesNotMatch(s.beats[1].headline, /live/i)
  s = editStory(s, f, { op: 'picture', beat: 'b2', picture: { kind: 'image', src: '/img/r1/2.png' } })
  assert.equal(s.beats[1].picture.src, '/img/r1/2.png')
  s = editStory(s, f, { op: 'picture', beat: 'b2', picture: { kind: 'image', src: '/img/other/evil.png' } })
  assert.notEqual(s.beats[1].picture?.src, '/img/other/evil.png', 'only the build\'s own pictures')
  const second = s.beats[1].headline
  s = editStory(s, f, { op: 'move', beat: 'b2', by: 1 })
  assert.equal(s.beats[2].headline, second)
  assert.equal(s.beats[0].role, 'hook')
  assert.equal(s.edited, true)
  s = editStory(s, f, { op: 'type', type: 'making' })
  assert.equal(s.type, 'making')
  assert.match(words(s), /Planned, designed and built by 3 AI agents/)
  assert.ok(storyText(s).split('\n').length === s.beats.length)
})

test('with no word on who it is for, there is no empty "who" beat', () => {
  const s = rulesStory(facts({ who: false }))
  assert.ok(!s.beats.some(b => b.role === 'who'))
  assert.ok(s.beats.every(b => b.headline))
})

test('a card is laid out for its frame, in the brand\'s colours and type, words never over the picture', () => {
  const s = rulesStory(facts())
  const b = s.beats[0]
  for (const shape of Object.keys(SHAPES)) {
    const html = cardHtml(s, b, shape, 'file:///x.png')
    assert.match(html, new RegExp(`width:${SHAPES[shape].w}px;height:${SHAPES[shape].h}px`))
    assert.match(html, /Fraunces/)
    assert.match(html, /--ac:#7fb069/)
    assert.match(html, shape === 'wide' ? /card split/ : /card stack/)
  }
  assert.match(cardHtml(s, b, 'tall', null), /card type/, 'no picture: a type card')
  assert.match(cardHtml(s, s.beats[1], 'tall', 'data:image/jpeg;base64,xx'), /class="phone"/, 'a screen sits in a phone on a tall card')
  assert.match(cardHtml(s, s.beats[1], 'wide', 'data:image/jpeg;base64,xx'), /class="window"/)
  assert.doesNotMatch(cardHtml({ ...s, name: '<script>' }, { ...b, headline: '<img onerror=x>' }, 'tall', null), /<img onerror|<script>/)
})

test('cards are drawn (by PIL when there is no browser) and only again when they change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'story-'))
  try {
    const s = rulesStory(facts())
    const out = join(dir, 'story')
    const r = await drawCards(s, { outDir: out, runDir: dir, dataDir: join(dir, 'none'), shapes: ['square'] })
    if (r.drawn === 0) return // no PIL here
    assert.equal(r.by, 'pil')
    assert.equal(r.cards.square.length, s.beats.length)
    const again = await drawCards(s, { outDir: out, runDir: dir, dataDir: join(dir, 'none'), shapes: ['square'] })
    assert.equal(again.drawn, 0)
    const one = { ...s, beats: s.beats.map((b, i) => (i === 1 ? { ...b, headline: 'Changed' } : b)) }
    assert.equal((await drawCards(one, { outDir: out, runDir: dir, dataDir: join(dir, 'none'), shapes: ['square'] })).drawn, 1, 'an edit redraws one card')
    const fewer = { ...one, beats: one.beats.slice(0, 5) }
    await drawCards(fewer, { outDir: out, runDir: dir, dataDir: join(dir, 'none'), shapes: ['square'] })
    assert.equal(readdirSync(out).filter(f => f.endsWith('.jpg')).length, 5, 'cards of removed beats are deleted')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
