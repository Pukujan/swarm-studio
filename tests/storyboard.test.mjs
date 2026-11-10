import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBoard, fallbackBoard, writeBoard, boardPrompt, readPace, cueSheet, TEMPLATES } from '../engine/storyboard.mjs'
import { breakdown, audioStats, rhythmOf, scrub, merge, paletteOf } from '../engine/reference.mjs'
import { scoreWav, musicPrompt } from '../engine/score.mjs'
import { composition } from '../engine/video.mjs'

const c = {
  brand: 'Lume', brief: 'a coffee roaster in Porto', theme: {},
  copy: 'PAGE home "Lume — Home": x\nPAGE beans "Lume — Beans": y\nPAGE classes "Lume — Classes": z',
  images: [1, 2, 3, 4, 5].map(n => ({ n, name: `p${n}.webp`, gen: 'a cup of coffee', page: 'home', file: '' })),
  clips: [{ n: 1, name: 'c1.mp4', what: 'a scroll through the site', label: 'Live', seconds: 30, from: 0, file: '' }],
}
const FAST = 'a fast-paced movie trailer for our launch, scary but cute'

test('the prompt sets the pace', () => {
  assert.equal(readPace(FAST), 'fast')
  assert.equal(readPace('a calm, gentle film for a quiet morning'), 'calm')
  assert.equal(readPace('a film'), 'medium')
  assert.equal(readPace('a film', { cutRhythm: { avgShot: 1.1 } }), 'fast')
})

test('the storyboard check fixes what the renderer cannot play', () => {
  const b = checkBoard({
    pace: 'calm',
    music: { bpm: 140 },
    beats: [
      { kind: 'image', image: 9, headline: 'Missing picture' },
      { kind: 'image', image: 1, headline: 'Night shift', accent: 'night', camera: 'punch-in', cut: 'hard', music: 'pulse', sfx: ['hit', 'nope'] },
      { kind: 'image', image: 1, headline: 'Same picture twice' },
      { kind: 'wat', headline: 'Unknown kind' },
      { kind: 'clip', clip: 1, from: 999, speed: 40, headline: 'Real footage' },
      { kind: 'black', headline: 'should go', music: 'stop', seconds: 50 },
      { kind: 'stat', headline: 'no number' },
    ],
  }, c, { prompt: FAST, seed: 1 })
  assert.equal(b.pace, 'fast', 'the prompt wins over the writer')
  assert.equal(b[0].kind, 'title')
  assert.equal(b[1].image, 1)
  assert.equal(b[1].accent, 'night')
  assert.deepEqual(b[1].sfx, ['hit'])
  assert.equal(b[2].kind, 'title', 'a picture is used once')
  assert.equal(b[3].kind, 'title')
  assert.equal(b[4].kind, 'clip')
  assert.equal(b[4].speed, 8)
  assert.ok(b[4].from <= 29.5)
  assert.equal(b[4].layer, 'proof')
  assert.equal(b[5].headline, '')
  assert.ok(b[5].seconds <= 5, 'a fast film never holds a beat 50 s')
  assert.equal(b.at(-1).kind, 'cta', 'the film closes on its name')
  assert.match(b.at(-1).headline, /Lume/)
  const total = b.reduce((a, x) => a + x.seconds, 0)
  assert.ok(total < 90)
  // without a voice, beats land on the half beat
  const half = 60 / 140 / 2
  for (const x of b) assert.ok(Math.abs(x.seconds / half - Math.round(x.seconds / half)) < 0.01, `${x.seconds} is on the beat`)
  assert.ok(b.fixes.length > 0)
})

test('a fast prompt cuts fast, a calm one holds', () => {
  const fast = fallbackBoard(c, { prompt: FAST, seed: 3 })
  const calm = fallbackBoard(c, { prompt: 'a calm, slow film', seed: 3 })
  const avg = b => b.reduce((a, x) => a + x.seconds, 0) / b.length
  assert.ok(avg(fast) < 2.2, `fast averages ${avg(fast)}`)
  assert.ok(avg(calm) > 3.5, `calm averages ${avg(calm)}`)
  assert.ok(fast.some(x => x.cue === 'stop') && fast.some(x => x.cue === 'drop'), 'a trailer has a hard stop and a drop')
  assert.ok(!calm.some(x => x.cue === 'drop'))
})

// a fake writer: what it writes depends on the twists the seed put in its prompt
const fakeChat = async (_p, { messages }) => {
  const user = messages[1].content
  const seed = Number(user.match(/Seed (\d+)/)[1])
  const order = seed % 2 ? ['clip', 'title', 'image', 'black', 'image', 'title'] : ['image', 'title', 'image', 'clip', 'black', 'title']
  let img = 0
  return { text: JSON.stringify({ title: `Cut ${seed}`, pace: 'fast', look: { layout: seed % 2 ? 'cinematic' : 'neon' }, music: { bpm: 120 + (seed % 20) }, beats: order.map((kind, i) => ({ kind, image: kind === 'image' ? ++img + (seed % 3) : undefined, clip: 1, headline: kind === 'black' ? '' : `Line ${i} ${seed}`, seconds: 1 + ((seed + i) % 3) * 0.5, camera: ['push-in', 'shake', 'pan-left'][(seed + i) % 3], music: i === 0 ? 'pulse' : kind === 'black' ? 'stop' : undefined })) }) }
}

test('the same prompt twice gives two different cuts', async () => {
  const a = await writeBoard({ c, prompt: FAST, seed: 101, chat: fakeChat })
  const b = await writeBoard({ c, prompt: FAST, seed: 202, chat: fakeChat })
  const sig = x => JSON.stringify([x.map(s => [s.kind, s.seconds, s.camera, s.image]), x.look.layout, x.music.bpm])
  assert.notEqual(sig(a), sig(b))
  assert.equal(a.pace, 'fast')
  // the writer is pushed off its first idea differently each time
  const twist = s => boardPrompt(c, { prompt: FAST, seed: s })[1].content.match(/Seed \d+: (.*)/)[1]
  const seen = new Set([1, 2, 3, 4, 5, 6].map(twist))
  assert.ok(seen.size >= 4)
  // without a model too
  const f1 = fallbackBoard(c, { prompt: FAST, seed: 1 }), f2 = fallbackBoard(c, { prompt: FAST, seed: 2 })
  assert.notEqual(sig(f1), sig(f2))
})

test('templates are only starting points', () => {
  const m = boardPrompt(c, { prompt: FAST, template: 'calm' })
  assert.match(m[1].content, /starting point/)
  assert.match(m[1].content, /their words come first/)
  assert.match(boardPrompt(c, { prompt: FAST })[1].content, /may borrow from, or ignore/)
  assert.ok(TEMPLATES.trailer && TEMPLATES.promo)
})

test('a reference is broken into style notes, and nothing of it is copied', async () => {
  const page = `<html><head><title>Moonbeam Bakery — Fresh Bread</title><meta name="theme-color" content="#ff3366"><style>body{background:#101010;color:#ffcc00;font-family:"Playfair Display",serif} h1{color:#ff3366}</style></head><body><h1>Moonbeam Bakery bakes at dawn</h1><p>Secret family recipes since 1952.</p></body></html>`
  const fetcher = async () => ({ ok: true, text: async () => page })
  let sent = ''
  const chat = async (_p, { messages }) => {
    sent = JSON.stringify(messages)
    return { text: JSON.stringify({ palette: ['#000000'], type: 'elegant serif like Moonbeam Bakery', pacing: 'slow', cutRhythm: 'long holds', camera: 'locked off', motion: 'gentle fades', mood: 'warm, nostalgic "Fresh Bread"', music: { tempo: 80, instruments: ['piano'], structure: 'rises once' } }) }
  }
  const r = await breakdown({ url: 'https://moonbeam-bakery.example/' }, { provider: {}, model: 'fake', chat, fetcher })
  assert.equal(r.kind, 'site')
  assert.equal(r.what, 'a website')
  assert.ok(r.notes.palette.includes('#ff3366'), 'the measured palette wins')
  assert.doesNotMatch(JSON.stringify(r.notes), /Moonbeam|Bakery|Fresh Bread|1952/, 'no names or words from the reference')
  assert.doesNotMatch(sent, /Secret family recipes/, 'the page text never goes to the model')
  assert.match(r.notes.type, /serif/)
  assert.equal(r.notes.music.tempo, 80)
  const m = merge([r])
  assert.equal(m.from[0].what, 'a website')
})

test('the reference breakdown measures tempo, silence and cut rhythm', () => {
  const rate = 8000, sec = 12, s = new Int16Array(rate * sec)
  // clicks at 120 BPM, silent from 6 s to 7 s
  for (let t = 0; t < sec; t += 0.5) { if (t >= 6 && t < 7) continue; for (let k = 0; k < 200; k++) s[Math.floor(t * rate) + k] = Math.round(Math.sin(k / 3) * 20000 * Math.exp(-k / 60)) }
  for (let i = 0; i < s.length; i++) if (!(i / rate >= 6 && i / rate < 7)) s[i] += Math.round(Math.sin(i / 7) * 600)
  const a = audioStats(s, rate)
  assert.ok(Math.abs(a.tempo - 120) <= 3 || Math.abs(a.tempo - 60) <= 2, `tempo ${a.tempo}`)
  assert.ok(a.silences.some(([x, y]) => x >= 5.9 && y <= 7.1))
  const r = rhythmOf([1, 2, 3, 3.5, 4, 4.3, 4.6, 4.8], 5)
  assert.equal(r.cuts, 8)
  assert.ok(r.speeding)
  assert.deepEqual(paletteOf(Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255])), ['#ff0000', '#0000ff'])
  assert.doesNotMatch(scrub({ mood: 'like Zelda at night' }, ['Zelda Breath']).mood, /Zelda/)
})

test('the score follows the cue sheet, with a true hard stop', () => {
  const beats = [{ cue: 'pulse' }, { cue: 'hit', sfx: ['hit'] }, { cue: 'build' }, { cue: 'stop' }, { cue: 'drop', sfx: ['boom'] }, { cue: 'resolve' }]
  const lengths = [1, 1, 2, 1, 1.5, 1.5]
  const cues = cueSheet(beats, lengths)
  assert.deepEqual(cues.silence, [[4, 5]])
  assert.equal(cues.drop, 5)
  assert.deepEqual(cues.hits, [1])
  const file = join(mkdtempSync(join(tmpdir(), 'score-')), 'm.wav')
  scoreWav({ seconds: 8, music: { bpm: 128, mood: 'scary but cute' }, cues, file })
  const buf = readFileSync(file), pcm = buf.subarray(44)
  const peak = (a, b) => { let m = 0; for (let i = Math.floor(a * 44100) * 4; i < Math.floor(b * 44100) * 4; i += 2) m = Math.max(m, Math.abs(pcm.readInt16LE(i))); return m }
  assert.ok(peak(4.05, 4.95) < 50, 'silence in the hard stop')
  assert.ok(peak(5, 5.5) > 3000, 'the drop is loud')
  assert.match(musicPrompt({ bpm: 128, mood: 'tense', instruments: ['taiko'] }, cues, 8), /128 BPM.*silence from 4\.0s to 5\.0s/)
})

test('the composition plays type cards, hard cuts, camera moves and the speed chip', () => {
  const b = fallbackBoard(c, { prompt: FAST, seed: 5 })
  b.find(x => x.kind === 'clip').speed = 8
  const comp = composition(b, c, b.map(x => x.seconds), 'wipe')
  assert.match(comp.html, /class="clip scene center card"/)
  assert.match(comp.html, /8×/)
  assert.match(comp.html, /class="w acc"/)
  assert.ok(Math.abs(comp.seconds - b.reduce((a, x) => a + x.seconds, 0)) < 0.05)
  const tall = composition(b, c, b.map(x => x.seconds), 'wipe', comp.look, { shape: 'tall' })
  assert.equal(tall.seconds, comp.seconds)
})
