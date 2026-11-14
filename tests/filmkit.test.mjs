import test from 'node:test'
import assert from 'node:assert/strict'
import { brandSource, checkKit, kitBoard, kitPrompt, checkStory, storySource, storyBoard, STORY_TYPES } from '../engine/filmkit.mjs'
import { checkBoard } from '../engine/storyboard.mjs'
import { composition, SHAPES } from '../engine/video.mjs'

const theme = { name: 'Harbor', direction: 'Night market by the sea', vars: { '--background': '#0e1a24', '--foreground': '#f4ead8', '--primary': '#e8743b', '--accent': '#6cc4c0' }, fonts: { heading: 'Fraunces', body: 'Inter' } }
const c0 = () => brandSource({ name: 'Lantern Night', theme, story: { what: 'A night market at the harbor', who: 'Families and late walkers' }, pictures: [{ file: '/x/a.jpg', about: 'lanterns over the water' }, { file: '/x/b.jpg', about: 'a noodle stall' }], clips: [{ file: '/x/c.mp4', about: 'the crowd', seconds: 6 }] })

test('brandSource gives the film engine a build-shaped c from a brand alone', () => {
  const c = c0()
  assert.equal(c.brand, 'Lantern Night')
  assert.equal(c.theme.vars['--primary'], '#e8743b')
  assert.deepEqual(c.images.map(i => i.n), [1, 2])
  assert.equal(c.clips[0].n, 1)
  assert.match(c.copy, /^PAGE story "Lantern Night"/)
  assert.match(c.copy, /\[who\] Families and late walkers/)
  // no theme: still a c the composition can read
  assert.deepEqual(brandSource({ name: 'X' }).theme, { direction: '' })
})

test('the kit spec is made safe; its script becomes beats in its own words, closed on the name', () => {
  const kit = checkKit({ beats: [{ text: 'Lanterns wake at seven', frame: { picture: 1 } }, { text: 'Noodles, music, the sea', frame: { picture: 9 } }, { text: 'The crowd', frame: { clip: 1 } }, { text: '', frame: null }, { text: 'Paint me a boat', frame: { paint: 'a fishing boat lit by lanterns' } }], shape: 'square', seconds: 400, voice: { who: 'a warm host', sample: 'Come hungry.' }, music: { mood: 'warm folk' }, start: 'nope' })
  assert.equal(kit.beats.length, 4)
  assert.equal(kit.seconds, 90)
  assert.equal(kit.shape, 'square')
  assert.equal(kit.start, 'storyboard')
  const c = c0()
  const raw = kitBoard(kit, c)
  assert.deepEqual(raw.beats.map(b => b.kind), ['image', 'title', 'clip', 'image', 'cta'])
  assert.equal(raw.beats[1].headline, 'Noodles, music, the sea') // a picture that is not there: the words stay, on a card
  assert.equal(raw.beats[3].shot, 'a fishing boat lit by lanterns')
  assert.equal(raw.beats.at(-1).headline, 'Lantern Night')
  assert.equal(raw.voice, true)
  assert.match(kitPrompt(kit), /1\. Lanterns wake at seven/)
  // a frame names a reference or asset by its id
  const named = brandSource({ name: 'Lantern Night', pictures: [{ file: '/x/a.jpg', id: 'r1abc' }], clips: [{ file: '/x/c.mp4', id: 'a9' }] })
  const nb = kitBoard({ beats: [{ text: 'One', frame: { item: 'a9' } }, { text: 'Two', frame: { item: 'r1abc' } }, { text: 'Three', frame: { item: 'gone' } }] }, named)
  assert.deepEqual(nb.beats.slice(0, 3).map(b => [b.kind, b.clip || b.image || null]), [['clip', 1], ['image', 1], ['title', null]])
  const board = checkBoard(raw, c, { seed: 1, shots: true })
  assert.ok(board.length >= 4)
  assert.ok(board.some(b => b.headline === 'Lanterns wake at seven'))
})

test('a story is read tolerantly: unknown roles and pictures fall back, too short is null', () => {
  assert.equal(checkStory({ beats: [{ text: 'one' }] }), null)
  assert.equal(checkStory(null), null)
  const s = checkStory({ type: 'nope', title: 'Lantern Night', extra: 1, beats: [
    { role: 'hook', text: 'Seven o clock, the harbor lights up', pic: { kind: 'picture', src: 'img/1.jpg' } },
    { role: 'zzz', text: 'Forty stalls', pic: { kind: 'hologram', src: 'img/2.jpg' } },
    { role: 'who', text: 'For anyone hungry after dark' },
    { role: 'made', text: 'Built by five agents', pic: { kind: 'replay', src: 'replay.mp4' }, seconds: 40 },
    { role: 'next', text: 'Come Friday' }
  ], next: { label: 'lanternnight.example', url: 'https://lanternnight.example' } })
  assert.equal(s.type, 'launch')
  assert.equal(s.beats[1].role, 'moment')
  assert.equal(s.beats[1].pic.kind, 'picture')
  assert.equal(s.beats[2].pic.kind, 'none')
  assert.equal(s.beats[3].seconds, 6)
})

test('every story type becomes a checked board that ends on where to go next', () => {
  for (const type of Object.keys(STORY_TYPES)) {
    const s = checkStory({ type, title: 'Lantern Night', beats: [
      { role: 'hook', text: 'Seven o clock, the harbor lights up', pic: { kind: 'picture', src: 'a' } },
      { role: 'what', text: 'A night market on the water', pic: { kind: 'screen', src: 'b' } },
      { role: 'who', text: 'For anyone hungry after dark' },
      { role: 'made', text: 'Built by five agents in an hour', pic: { kind: 'replay', src: 'r.mp4' } },
      { role: 'next', text: 'Come Friday', sub: 'lanternnight.example' }
    ], next: { label: 'lanternnight.example' } })
    const files = { a: '/x/a.jpg', b: '/x/shot.png', 'r.mp4': '/x/r.mp4' }
    const { c, at } = storySource(s, { ...c0(), brand: 'Lantern Night' }, p => files[p.src] || null)
    assert.equal(at[0].picture, 1) // a known file is not added twice
    assert.equal(at[1].picture, 3)
    assert.equal(at[3].clip, 2)
    const raw = storyBoard(s, c, at)
    assert.equal(raw.plan, `story:${type}`)
    assert.equal(raw.beats.at(-1).kind, 'cta')
    assert.equal(raw.beats[3].speed, 4)
    const board = checkBoard(raw, c, { seed: 2 })
    assert.equal(board.at(-1).kind, 'cta', type)
    assert.ok(board.some(b => b.headline === 'Seven o clock, the harbor lights up'), type)
    assert.equal(board.filter(b => b.kind === 'cta').length, 1, `${type}: one closing card`)
  }
})

test('the square shape: a 1080 × 1080 frame with the wide layout and smaller type', () => {
  assert.deepEqual([SHAPES.square.W, SHAPES.square.H], [1080, 1080])
  const c = c0()
  const board = checkBoard(kitBoard({ beats: [{ text: 'Lanterns wake at seven', frame: { picture: 1 } }, { text: 'Forty stalls' }] }, c), c, { seed: 3 })
  const sq = composition(board, c, board.map(b => b.seconds), 'wipe', undefined, { shape: 'square' })
  assert.match(sq.html, /data-width="1080" data-height="1080"/)
  assert.doesNotMatch(sq.html, /<body class="[^"]* T"/)
})

// build-seo's story.json (engine/story.mjs, spec 39) is what the Story film reads: one format, written once
test('a story written by engine/story.mjs becomes a film in every story type', async () => {
  const { STORY_TYPES: TYPES, rulesStory } = await import('../engine/story.mjs')
  const f = { name: 'Lantern Night', url: 'https://lantern.example', what: 'A night market at the harbor', who: 'Families and night owls', pages: [{ id: 'home', title: 'Home' }, { id: 'food', title: 'Food' }], images: ['/img/r1/a.png', '/img/r1/b.png'] }
  for (const t of Object.keys(TYPES)) {
    const written = rulesStory(f, t)
    const s = checkStory(written)
    assert.ok(s, t)
    assert.equal(s.title, 'Lantern Night')
    assert.equal(s.type, t === 'making' ? 'made' : t)
    assert.deepEqual(s.beats.map(b => b.text), written.beats.map(b => b.headline.slice(0, 90)), `${t}: the words are kept as written`)
    assert.ok(s.beats.every(b => !written.beats.find(w => w.id === b.id)?.picture || b.pic.kind !== 'none'), `${t}: every picture is kept`)
    assert.equal(s.next?.url, 'https://lantern.example')
    const pics = new Map([['/img/r1/a.png', '/run/img/a.png'], ['/img/r1/b.png', '/run/img/b.png']])
    const made = storySource(s, brandSource({ name: s.title }), p => pics.get(p.src) || (p.kind === 'screen' ? `/run/story/screens/${p.page}-desktop.jpg` : null))
    const board = checkBoard(storyBoard(s, made.c, made.at), made.c, { seed: 4 })
    assert.equal(board.filter(b => b.kind === 'cta').length, 1, t)
    assert.equal(board.at(-1).kind, 'cta', t)
  }
})
