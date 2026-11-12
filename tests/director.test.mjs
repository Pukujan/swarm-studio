import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickKind, askedSeconds, directByRules, checkTreatment, direct, treatmentText, FILM_KINDS, KIND_IDS, buildFacts } from '../engine/director.mjs'
import { checkBoard, fallbackBoard, writeBoard, boardPrompt } from '../engine/storyboard.mjs'
import { fixtureBuild, plays } from '../engine/filmscore.mjs'
import { loadSet } from '../scripts/film-set.mjs'

const set = loadSet()
const build = k => fixtureBuild(set.builds[k])
const shop = build('shop'), game = build('game')

test('the rules pick a kind from the prompt, the plan and the build', () => {
  assert.equal(pickKind('', shop).kind, 'demo')
  assert.equal(pickKind('', game).kind, 'gameplay')
  assert.equal(pickKind('a calm, slow film with almost no words', game).kind, 'mood')
  assert.equal(pickKind('cut it to the beat, no talking', shop).kind, 'music')
  assert.equal(pickKind('announce the launch on March 20', shop).kind, 'announce')
  assert.equal(pickKind("one customer's story, in her own words", shop).kind, 'character')
  // a plan only breaks ties; the prompt pulls away from it
  assert.equal(pickKind('', shop, 'slideshow').kind, 'mood')
  assert.equal(pickKind('a hype reel cut on the drums', shop, 'slideshow').kind, 'music')
  assert.equal(pickKind('', game, 'teaser').kind, 'gameplay')
  // a gameplay trailer needs footage
  assert.notEqual(pickKind('a gameplay trailer', shop).kind, 'gameplay')
  assert.equal(buildFacts(game).game, true)
})

test('the length the prompt asks for', () => {
  assert.equal(askedSeconds('a 20 second ad'), 20)
  assert.equal(askedSeconds('show it in thirty seconds'), 30)
  assert.equal(askedSeconds('15s teaser'), 15)
  assert.equal(askedSeconds('a film'), null)
  const t = directByRules(shop, { prompt: 'a 20 second ad with a narrator' })
  assert.equal(t.seconds, 20)
  assert.equal(t.voice, true)
  assert.ok(Math.abs(t.acts.reduce((a, x) => a + x.seconds, 0) - 20) < 0.5)
})

test('every kind has acts that fill the film, and a treatment the writer can read', () => {
  for (const k of KIND_IDS) {
    assert.ok(Math.abs(FILM_KINDS[k].acts.reduce((a, x) => a + x.share, 0) - 1) < 0.001, k)
    const text = treatmentText(directByRules(game, { prompt: '', template: '' }))
    assert.match(text, /Acts, in this order/)
  }
  const p = boardPrompt(shop, { prompt: 'calm', film: directByRules(shop, { prompt: 'a calm film' }) })
  assert.match(p[1].content, /Kind of film: Mood piece/)
  assert.doesNotMatch(p[1].content, /Starting points you may borrow/)
})

test('a director answer the build cannot make falls to the rules', async () => {
  assert.equal(checkTreatment({ kind: 'gameplay' }, shop, {}).kind, 'demo')
  assert.match(checkTreatment({ kind: 'gameplay' }, shop, {}).fell, /cannot make/)
  assert.equal(checkTreatment({ kind: 'opera' }, game, {}).kind, 'gameplay')
  // no prompt: a film still says what the build is
  assert.equal(checkTreatment({ kind: 'mood' }, shop, { prompt: '' }).kind, 'demo')
  assert.equal(checkTreatment({ kind: 'mood' }, shop, { prompt: 'something quiet' }).kind, 'mood')
  const ok = checkTreatment({ kind: 'character', why: 'x', logline: 'Ines finds her coffee', seconds: 30, acts: [{ name: 'before', intent: 'Ines at the supermarket shelf' }] }, shop, { prompt: 'her story' })
  assert.equal(ok.by, 'model')
  assert.equal(ok.acts[0].intent, 'Ines at the supermarket shelf')
  assert.equal(ok.acts.length, FILM_KINDS.character.acts.length)
  const failed = await direct({ model: 'm', c: shop, prompt: 'a calm film', chat: async () => { throw new Error('down') } })
  assert.equal(failed.kind, 'mood')
  assert.match(failed.fell, /no director/)
  const junk = await direct({ model: 'm', c: shop, prompt: '', chat: async () => ({ text: 'sorry' }) })
  assert.equal(junk.kind, 'demo')
})

test('the storyboard is checked against its own kind', () => {
  const mood = checkBoard({ beats: [
    { kind: 'open', headline: 'Lume Roasters' }, { kind: 'image', image: 1, headline: 'Morning', seconds: 6 }, { kind: 'list', headline: 'x', items: ['a', 'b', 'c'] },
    { kind: 'image', image: 2, headline: '', seconds: 6 }, { kind: 'image', image: 3, headline: '', seconds: 6 }, { kind: 'cta', headline: 'Come and see' },
  ] }, shop, { prompt: 'a calm film', seed: 1, film: directByRules(shop, { prompt: 'a calm film' }) })
  assert.deepEqual(mood.map(b => b.kind), ['image', 'image', 'image'])
  assert.equal(mood[0].headline, '', 'it opens with no words')
  assert.equal(mood.at(-1).headline, 'Lume Roasters')
  assert.equal(mood.at(-1).sign, true)
  assert.equal(mood.pace, 'calm')
  assert.equal(mood.film.kind, 'mood')

  const trailer = checkBoard({ beats: [
    { kind: 'title', headline: 'Run the roofs', seconds: 2 }, { kind: 'image', image: 1, headline: 'She runs', seconds: 2 }, { kind: 'clip', clip: 1, headline: 'Live', seconds: 2 },
    { kind: 'image', image: 2, headline: 'Fix it', seconds: 2 }, { kind: 'cta', headline: 'Rooftop Signal', sub: 'Play free' },
  ] }, game, { prompt: 'a gameplay trailer', seed: 1, film: directByRules(game, { prompt: 'a gameplay trailer' }) })
  assert.equal(trailer[0].kind, 'clip', 'cold open on footage')
  assert.equal(trailer.at(-1).kind, 'title', 'a title card, not an invitation')
  const total = trailer.reduce((a, b) => a + b.seconds, 0), footage = trailer.reduce((a, b) => a + (b.kind === 'clip' ? b.seconds : 0), 0)
  assert.ok(footage / total >= 0.39, `footage is ${(footage / total).toFixed(2)} of the film`)
  assert.ok(plays(trailer, game, trailer.map(b => b.seconds)))

  const demo = checkBoard({ beats: [{ kind: 'image', image: 1, headline: 'Fresh' }, { kind: 'image', image: 2, headline: 'Roasted' }, { kind: 'image', image: 3, headline: 'Yours' }] }, shop, { seed: 1, film: directByRules(shop, {}) })
  assert.equal(demo.at(-1).kind, 'cta')
})

test('a missing picture is shown again from another angle, and the film keeps the length that was asked', () => {
  const film = directByRules(shop, { prompt: 'a 20 second ad with a narrator' })
  const b = checkBoard({ voice: true, beats: [
    { kind: 'image', image: 1, headline: 'One', seconds: 4, camera: 'push-in', say: 'this is a very long line that goes on and on and on for far too long to ever fit in four seconds of film' },
    { kind: 'image', image: 1, headline: 'Two', seconds: 4, camera: 'push-in', say: 'short line here' },
    { kind: 'image', image: 77, headline: 'Three', seconds: 4, say: 'another short line' },
    { kind: 'cta', headline: 'Lume Roasters', sub: 'Subscribe', seconds: 4, say: 'join us today' },
  ] }, shop, { prompt: 'a 20 second ad with a narrator', seed: 1, film })
  assert.ok(b.every(x => x.kind !== 'title'), 'no picture became a type card')
  assert.notEqual(b[1].image, b[0].image)
  assert.equal(b[0].say, '', 'the line that could not fit was left out')
  const total = b.reduce((a, x) => a + x.seconds, 0)
  assert.ok(total > 17 && total < 23, `${total} s for a 20 s ad`)
})

test('the writer is given the treatment, and the film remembers it', async () => {
  const seen = []
  const chat = async (_p, o) => {
    seen.push(o.messages[1].content)
    if (seen.length === 1) return { text: JSON.stringify({ kind: 'announce', why: 'a date', logline: 'the jam is coming', acts: [] }) }
    return { text: JSON.stringify({ beats: [{ kind: 'title', headline: 'March 20' }, { kind: 'image', image: 1, headline: 'The hall' }, { kind: 'image', image: 2, headline: 'The teams' }, { kind: 'cta', headline: 'Harbor Jam', sub: 'Get a ticket' }] }) }
  }
  const b = await writeBoard({ model: 'm', c: build('event'), prompt: 'announce it', seed: 4, chat })
  assert.equal(seen.length, 2)
  assert.match(seen[1], /Kind of film: Announcement/)
  assert.equal(b.film.kind, 'announce')
  assert.equal(b.film.by, 'model')
})

test('with no model, every kind cuts a film that plays, on every build', () => {
  for (const name of Object.keys(set.builds)) {
    const c = build(name)
    for (const k of KIND_IDS) {
      if (k === 'gameplay' && !c.clips.length) continue
      const film = checkTreatment({ kind: k }, c, { prompt: 'x' })
      const b = fallbackBoard(c, { prompt: 'x', seed: 9, film })
      assert.equal(b.film.kind, k, `${name}/${k}`)
      assert.ok(plays(b, c, b.map(x => x.seconds)), `${name}/${k} plays`)
      assert.ok(!b.fixes.some(f => /plain cut/.test(f)), `${name}/${k} stayed in its kind`)
    }
  }
  // the plain cut is still there under it
  const plain = fallbackBoard(shop, { prompt: '', seed: 2, film: null })
  assert.equal(plain[0].kind, 'open')
  assert.equal(plain.at(-1).kind, 'cta')
})
