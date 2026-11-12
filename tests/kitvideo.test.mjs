// The Video kit (web/kit-video.js) against spec 37's contract: its lock is what engine/filmkit.mjs
// checkKit reads, its Build press posts the film route, and it only names what the project holds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { videoKit as kit } from '../web/kit-video.js'
import { checkKit, kitBoard, brandSource } from '../engine/filmkit.mjs'

let n = 0
// a fresh project each time, so drafts never carry over
const ctx = (over = {}) => ({
  project: `p${++n}`,
  studio: {},
  brand: { story: { name: 'Lantern Night' }, palettes: [{ id: 'a', name: 'Dusk', bg: '#101624', text: '#f4efe6', accent: '#ff8a3d', link: '#7cc6ff' }], pick: { palette: 'a' } },
  refs: [{ id: 'r1', kind: 'image', name: 'Lanterns', file: 'l.png' }, { id: 'r2', kind: 'audio', name: 'Theme', file: 't.mp3' }],
  assets: [{ id: 'as1', kind: 'image', name: 'Logo', file: 'logo.png', src: '/a/logo.png' }, { id: 'as2', kind: 'image', name: 'Gone', file: 'g.png', removed: 1 }],
  sw: { base: '', say: () => {} },
  ...over
})

test('the kit keeps the contract: kind, starts and four sections', async () => {
  assert.equal(kit.kind, 'video')
  assert.deepEqual(kit.starts.map(s => s.id), ['opening', 'storyboard', 'music'])
  assert.match(readFileSync(new URL('../web/icons.js', import.meta.url), 'utf8'), new RegExp(`\\b${kit.icon}:`))
  const c = ctx({ story: { beats: [{ headline: 'One', seconds: 2 }, { headline: 'Two' }] } })
  assert.deepEqual(kit.plan.sections(c), [], 'nothing until it is loaded')
  const d = await kit.prepare(c)
  assert.deepEqual(d.beats.map(b => b.text), ['One', 'Two'], 'a new draft starts from the story')
  const secs = kit.plan.sections(c)
  assert.deepEqual(secs.map(s => s.sec), ['Script', 'Storyboard', 'Sound', 'Look'])
  assert.equal(secs[1].cards.length, 2, 'one storyboard frame per beat')
  for (const s of secs) for (const card of s.cards) assert.ok(card.key && card.name && typeof card.render === 'function' && typeof card.inspect === 'function')
  assert.equal(kit.plan.done(c), true)
  const empty = ctx()
  await kit.prepare(empty)
  assert.equal(kit.plan.done(empty), false, 'an empty script is not done')
})

test('the script question fills the beats; lock gives what checkKit reads, dropping what the project lacks', async () => {
  const c = ctx()
  const d = await kit.prepare(c)
  const qs = kit.plan.questions(c)
  qs.find(q => q.id === 'script').pick('1. The harbor wakes\n- Stalls and lanterns\n\nBring everyone')
  qs.find(q => q.id === 'shape').pick('square')
  assert.deepEqual(d.beats.map(b => b.text), ['The harbor wakes', 'Stalls and lanterns', 'Bring everyone'])
  d.beats[0].frame = { item: 'r1' }
  d.beats[1].frame = { item: 'as2' } // removed: never handed on
  d.beats[2].frame = { paint: 'a crowd under lanterns' }
  d.music = { file: 'r2', mood: 'Warm' }
  d.seconds = 12
  const locked = kit.lock(c)
  assert.deepEqual(JSON.parse(JSON.stringify(locked)), locked, 'plain JSON')
  assert.deepEqual(locked.beats.map(b => b.frame), [{ item: 'r1' }, null, { paint: 'a crowd under lanterns' }])
  assert.equal(locked.shape, 'square')
  assert.deepEqual(checkKit(locked).music, { file: 'r2', mood: 'Warm' })
  const k = checkKit(locked)
  const board = kitBoard(k, brandSource({ name: 'Lantern Night', pictures: [{ id: 'r1', file: '/x/l.png', about: 'Lanterns' }] }))
  assert.equal(board.beats.at(-1).kind, 'cta')
  assert.equal(board.beats[0].kind, 'image')
  const prop = kit.proposal(c)
  assert.equal(prop.credits, 1, 'one painted frame')
  assert.ok(prop.items.some(i => /your track/.test(i.what)))
})

test('a saved draft is loaded, and Build posts the locked kit to the film route', async () => {
  const calls = []
  const c = ctx({ sw: { base: '', api: async (path, opts) => {
    calls.push({ path, method: opts.method || 'GET', body: opts.body && JSON.parse(opts.body) })
    return { ok: true, json: async () => (path.startsWith('/api/kit/video/') ? { kit: { beats: [{ text: 'Saved', frame: null, seconds: null }], music: { file: null, mood: '' }, voice: null, seconds: 10, shape: 'wide', start: 'music' } } : { run: 'r-9', state: 'working' }) }
  } } })
  const d = await kit.prepare(c)
  assert.equal(calls[0].path, `/api/kit/video/${c.project}`)
  assert.deepEqual(d.beats.map(b => b.text), ['Saved'])
  calls.length = 0
  const spec = { kits: { video: { beats: [{ text: 'A' }, { text: 'B' }], shape: 'tall' } } }
  assert.deepEqual(await kit.build(spec, c), { run: 'r-9' })
  assert.equal(calls[0].path, `/api/projects/${c.project}/film`)
  assert.deepEqual(calls[0].body.shapes, ['tall'])
  const bad = ctx({ sw: { api: async () => ({ ok: false, status: 404, json: async () => ({ error: 'no such project' }) }) } })
  await assert.rejects(kit.build(spec, bad), /no such project/)
})

test('check reads the critic on the locked length and script', () => {
  const run = { review: { checks: [{ id: 'length', ok: true, says: '12 s of the 12 s asked for' }, { id: 'script', ok: false, says: '1 of 3 lines left out' }, { id: 'black', ok: true, says: '' }] } }
  assert.deepEqual(kit.check({}, run), [{ part: 'Length', ok: true, note: '12 s of the 12 s asked for' }, { part: 'Script', ok: false, note: '1 of 3 lines left out' }])
})

test('the kit file keeps the UI rules: no tooltips, no helpers outside its closure', () => {
  const src = readFileSync(new URL('../web/kit-video.js', import.meta.url), 'utf8')
  assert.ok(!/\btitle=|data-tip/.test(src))
  const top = src.split('\n').filter(l => /^(const|let|function|export) /.test(l))
  assert.deepEqual(top, ['export const videoKit = (() => {'], 'only `videoKit` at the top level, since the modules are joined into one script')
})
