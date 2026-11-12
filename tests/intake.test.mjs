import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHOWCASES, BRIEF_QUESTIONS, GRILL_WORDS, GUIDES, STARTERS, isVague, grillBrief, guideBrief, guideSets, pending, intake } from '../engine/intake.mjs'
import { PICTURES } from '../engine/setup.mjs'
import { QUESTIONS } from '../engine/game.mjs'
import { loadPack } from '../engine/packs.mjs'

const STEP_IDS = ['design', 'review', 'app', 'tools', 'games', 'shop', 'data', 'checks', 'video', 'deploy', 'launch']

test('each showcase runs a real Auto job and lists a few short steps', () => {
  assert.ok(SHOWCASES.length >= 3 && SHOWCASES.length <= 4)
  for (const s of SHOWCASES) {
    assert.ok(s.prompt.split(/\s+/).length >= GRILL_WORDS, `${s.id} is specific`)
    assert.ok(['site', 'app', 'game'].includes(s.kind), s.id)
    assert.ok(s.steps.length >= 3 && s.steps.length <= 7, s.id)
    for (const x of s.steps) assert.ok(x.split(' ').length <= 2, `${s.id}: step "${x}" is a name`)
    assert.ok(['none', 'mini', 'big'].includes(s.run.games), s.id)
    if (s.run.pack) assert.ok(loadPack(s.run.pack), `${s.id}: pack ${s.run.pack}`)
    for (const id of s.run.only || []) assert.ok(STEP_IDS.includes(id), `${s.id}: step ${id}`)
  }
  assert.deepEqual(SHOWCASES.find(s => s.id === 'game').run.games, 'big')
})

test('the hosted studio gets only the website showcases, without the Auto job', () => {
  const h = intake({ hosted: true })
  assert.ok(h.showcases.length >= 1)
  for (const s of h.showcases) { assert.equal(s.run, undefined); assert.ok(SHOWCASES.find(x => x.id === s.id).site) }
  assert.equal(intake().showcases.length, SHOWCASES.length)
  assert.deepEqual(Object.keys(h.guides), ['site'])
  assert.ok(!h.guides.site.some(q => q.sets), 'the hosted studio has no picture modes')
  assert.deepEqual(intake().questions, BRIEF_QUESTIONS)
})

test('every mode has three to five short questions, each answerable with one tap', () => {
  assert.deepEqual(Object.keys(GUIDES), ['site', 'app', 'film'])
  for (const [kind, qs] of Object.entries(GUIDES)) {
    assert.ok(qs.length >= 3 && qs.length <= 5, kind)
    for (const q of qs) {
      assert.ok(q.id && q.q && q.label && Array.isArray(q.chips) && q.chips.length >= 2, `${kind}.${q.id}`)
      assert.ok(q.q.split(/\s+/).length <= 6, `${kind}.${q.id}: short question`)
      assert.doesNotThrow(() => new RegExp(q.covers, 'i'), `${kind}.${q.id}: covers`)
    }
    assert.ok(STARTERS[kind].length >= 3, `${kind}: starters`)
    // a starter is short on purpose: the questions shape it
    for (const p of STARTERS[kind]) assert.ok(pending(kind, p).length >= 2, `${kind}: "${p}" still gets questions`)
  }
  for (const q of QUESTIONS) assert.ok(q.id && q.q && Array.isArray(q.chips))
})

test('a prompt is not asked what its words already answer', () => {
  const ids = (kind, p) => pending(kind, p).map(q => q.id)
  assert.deepEqual(ids('site', 'a bakery site'), ['for', 'who', 'mood', 'pages', 'pictures'])
  assert.deepEqual(ids('site', 'a warm, handmade bakery site'), ['for', 'who', 'pages', 'pictures'])
  assert.deepEqual(ids('site', 'a bakery site for families with a menu page and online orders'), ['mood', 'pictures'])
  assert.deepEqual(ids('app', 'A booking app for a barber shop'), ['accounts', 'payments', 'admin'])
  assert.deepEqual(ids('film', 'A promo for a coffee roaster'), ['feeling', 'length', 'sound'])
  assert.deepEqual(ids('film', 'a 30 second hype teaser for a rooftop concert with music'), [])
  assert.deepEqual(ids('game', 'anything'), [])
})

test('a full prompt builds at once: a setting is never the only question', () => {
  // everything but Pictures is in the words, so nothing is asked and the default pictures stand
  assert.deepEqual(pending('site', SHOWCASES.find(s => s.id === 'launch').prompt + ' For locals.'), [])
})

test('the brief is one short paragraph of what the person said, and only that', () => {
  const b = guideBrief('a bakery site', { for: 'Take bookings', who: 'Locals nearby', mood: 'Surprise me', pictures: 'Drawn' })
  assert.equal(b, 'a bakery site. Purpose: Take bookings. Audience: Locals nearby.')
  assert.equal(guideBrief('A bakery site.', {}), 'A bakery site.')
  assert.equal(guideBrief('a film', { length: '30 seconds' }, GUIDES.film), 'a film. Length: 30 seconds.')
})

test('the Pictures answer picks the build\'s pictures', () => {
  const q = GUIDES.site.find(x => x.sets === 'pictures')
  assert.deepEqual(q.chips.map(c => guideSets({ pictures: c }).pictures), PICTURES)
  assert.deepEqual(guideSets({ pictures: 'whatever I typed' }), {})
  assert.deepEqual(guideSets({}), {})
})

test('short prompts are vague, a sentence with details is not', () => {
  assert.equal(isVague('a bakery site'), true)
  assert.equal(isVague(''), true)
  assert.equal(isVague(SHOWCASES[0].prompt), false)
})

test('the brief carries the locked answers and drops "Surprise me"', () => {
  const b = grillBrief('a bakery site', { for: 'Surprise me', who: 'Locals nearby', mood: 'Warm and handmade' })
  assert.match(b, /^a bakery site\n\nLocked with the person/)
  assert.match(b, /- Audience: Locals nearby/)
  assert.match(b, /- Mood: Warm and handmade/)
  assert.doesNotMatch(b, /Surprise me/)
  assert.equal(grillBrief('a bakery site', {}), 'a bakery site')
  // the game interview's questions have no labels: their question text, without the aside
  assert.match(grillBrief('a game', { like: 'Hades' }, QUESTIONS), /- Similar to what: Hades/)
})

test('the Make box asks and writes the brief exactly as the engine does', () => {
  const home = readFileSync(new URL('../web/home.js', import.meta.url), 'utf8')
  assert.match(home, /\/api\/intake/)
  assert.doesNotMatch(home, /title=/)
  // the game interview's brief is still written in the box
  assert.match(home, /Locked with the person \(build exactly this\):/)
  const block = home.slice(home.indexOf('// guide:start'), home.indexOf('// guide:end'))
  const web = new Function(`${block}; return { guidePending, guideBrief, guideSets }`)()
  const prompts = ['a bakery site', 'a warm bakery site for families', 'A promo for a coffee roaster', 'a 30 second hype teaser with music', 'A booking app for a barber shop', SHOWCASES[0].prompt]
  const answers = [{}, { for: 'Take bookings', who: 'Surprise me', mood: 'Bold and loud.', pictures: 'Stock photos' }, { about: 'A place', length: '15 seconds', sound: 'No sound' }]
  for (const [kind, qs] of Object.entries(GUIDES)) {
    for (const p of prompts) {
      assert.deepEqual(web.guidePending(qs, p).map(q => q.id), pending(kind, p).map(q => q.id), `${kind}: ${p}`)
      for (const a of answers) {
        assert.equal(web.guideBrief(p, a, qs), guideBrief(p, a, qs))
        assert.deepEqual(web.guideSets(a, qs), guideSets(a, qs))
      }
    }
  }
})
