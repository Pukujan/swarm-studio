// The Film studio's model (src/screens/video/model.ts), held to the classic room's behaviour (web/canvas/film.js):
// what a film's events, its job and its one state make of the room. Node runs the TypeScript file as it is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cutNo, filmLines, filmShows, filmWhy, foldFilm, liveOn, makeBody, noFilm, playing, savedTo, shapesOf, stageSays, withCuts, withPart, withStatus } from '../src/screens/video/model.ts'
import { filmEvents, filmPart, filmStatus, RUN, savedCuts } from '../src/screens/video/film.fixture.ts'

const fold = cut => filmEvents(cut).filter(e => e.type.startsWith('video:')).reduce(foldFilm, noFilm(RUN))
const opened = cut => withPart(withStatus(fold(cut), filmStatus(cut)), filmPart(cut))

test('a build with no film shows the empty form', () => {
  const f = opened('none')
  assert.equal(filmShows(f), 'none')
  assert.deepEqual(f.story, [])
})

test('a film being made: busy from its start, its storyboard and its progress', () => {
  const f = opened('rendering')
  assert.equal(filmShows(f), 'making')
  assert.equal(f.story.length, 6)
  assert.deepEqual(f.board, { title: 'River Hours', pace: 'calm', bpm: 84 })
  assert.equal(stageSays(f), 'Rendering frames in headless Chrome… 42%')
  assert.equal(liveOn(f), true)
  assert.equal(liveOn(opened('storyboard')), false)
  assert.equal(stageSays(opened('storyboard')), 'Writing the storyboard…')
})

test('a finished film plays its newest cut, in the shapes it was made in', () => {
  const f = withCuts(opened('done'), savedCuts)
  assert.equal(filmShows(f), 'film')
  assert.deepEqual(shapesOf(f), ['wide', 'tall', 'square'])
  assert.equal(f.cuts.length, 3)
  assert.equal(f.pick, 2)
  assert.equal(f.cuts[2].idea, 'Slow, end on the open sign')
  assert.deepEqual(playing(f, 'wide'), { src: `/video/${RUN}/promo.mp4?v=3`, name: 'river-hours-promo-v3.mp4', file: '/Users/sam/Swarm Studio/River Hours/video/river-hours-promo-v3.mp4', shape: 'wide', latest: true })
  assert.equal(playing(f, 'tall').src, `/video/${RUN}/promo-tall.mp4?v=3`)
  assert.equal(playing(f, 'square').name, 'promo-square.mp4')
  assert.deepEqual(f.review, { ok: true, says: 'every cut lands on the beat; the voice is clear over the music' })
})

test('an older cut plays from the build\'s video folder, wide only', () => {
  const f = { ...withCuts(opened('done'), savedCuts), pick: 0 }
  const p = playing(f, 'tall')
  assert.equal(p.src, `/video/${RUN}/cut/river-hours-promo-v1.mp4`)
  assert.equal(p.shape, 'wide')
  assert.equal(p.latest, false)
})

test('a film made wide only offers no other shape', () => {
  const f = foldFilm(noFilm(RUN), { type: 'video:done', run: RUN, src: '/video/r/promo.mp4', tall: null, square: null, file: '/tmp/x-promo-v1.mp4', seconds: 9 })
  assert.deepEqual(shapesOf(f), ['wide'])
  assert.equal(playing(f, 'square').shape, 'wide')
})

test('a film that failed says why, from its state, and one cut off by a restart is not left busy', () => {
  const f = opened('failed')
  assert.equal(filmShows(f), 'failed')
  assert.equal(filmWhy(f).message, 'The render stopped: Chrome closed before the last frame.')
  const h = opened('no-hermes')
  assert.equal(filmWhy(h).code, 'hermes')
  assert.match(filmWhy(h).action, /hermes gateway/)
  // saved events end at video:start, the server has no job: the state's reason, never a bar that will not move
  const cut = withPart(withStatus(filmEvents('storyboard').filter(e => e.type.startsWith('video:')).reduce(foldFilm, noFilm(RUN)), { state: 'none' }), { state: 'failed', reason: { code: 'restart', message: 'The Studio restarted before the film finished.', action: '' } })
  assert.equal(cut.busy, false)
  assert.equal(filmShows(cut), 'failed')
})

test('a film whose state says making reads as being made, though the page heard nothing', () => {
  const f = withPart(noFilm(RUN), { state: 'making', pct: 12, stage: 'scoring' })
  assert.equal(f.busy, true)
  assert.equal(stageSays(f), 'Scoring the film… 12%')
})

test('a new film clears the last one\'s message and keeps its cuts', () => {
  const f = foldFilm(withCuts(opened('done'), savedCuts), { type: 'video:start', run: RUN, prompt: 'faster' })
  assert.equal(f.busy, true)
  assert.equal(f.src, '')
  assert.equal(f.cuts.length, 3)
  assert.deepEqual(f.next, { style: '', idea: 'faster' })
})

test('the chat\'s lines: the beats, the cast, the finished film and the critic', () => {
  const [, asked, story, done, review] = filmEvents('done')
  assert.deepEqual(filmLines(asked), [{ who: 'sys', text: '🎬 the planner is storyboarding a film: “Slow, end on the open sign”' }])
  const s = filmLines(story)
  assert.equal(s.length, 7)
  assert.equal(s[0].text, 'scene 1 · hero: “River Hours”')
  assert.equal(s[6].text, '🎙 cast for the theme: Heart reading, matching music')
  assert.equal(filmLines(done)[0].text, '🎬 promo video ready (13s, with voiceover, with music, made in 94s)')
  assert.deepEqual(filmLines(review), [{ who: 'sys', text: '🎬 checked by watching and listening: every cut lands on the beat; the voice is clear over the music' }])
  assert.equal(filmLines({ ...review, ok: false })[0].who, 'err')
  assert.deepEqual(filmLines({ type: 'video:progress', pct: 3 }), [])
})

test('what Make the film posts is what the classic room posts', () => {
  const o = { voice: '', music: true, clips: false, style: 'calm', idea: 'Slow', refs: [{ name: 'a.png' }] }
  assert.deepEqual(makeBody(o), { voice: undefined, music: true, template: 'calm', prompt: 'Slow', refs: [{ name: 'a.png' }], clips: false, film: 'auto' })
  assert.equal(makeBody(o, { idea: 'faster' }).prompt, 'faster')
})

test('small words', () => {
  assert.equal(cutNo('river-hours-promo-v12.mp4'), 12)
  assert.equal(savedTo('/Users/sam/Swarm Studio/x/video/a.mp4'), '~/Swarm Studio/x/video/a.mp4')
  assert.equal(savedTo('C:\\films\\a.mp4'), 'C:\\films\\a.mp4')
})
