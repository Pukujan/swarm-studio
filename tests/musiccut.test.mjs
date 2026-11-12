import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scoreWav } from '../engine/score.mjs'
import { readWav, analyse, cutToMusic, retime, planLengths, leastLengths, SURE } from '../engine/musiccut.mjs'

const dir = mkdtempSync(join(tmpdir(), 'musiccut-'))
const track = (bpm, cues, seconds = 24) => {
  const file = join(dir, `t${bpm}-${Math.random().toString(36).slice(2)}.wav`)
  scoreWav({ seconds, music: { bpm, mood: 'tense, driving' }, cues: { sections: [{ at: 0, shape: 'pulse' }], hits: [], silence: [], drop: null, sfx: [], ...cues }, file, seed: 3 })
  const { samples, rate } = readWav(file)
  return analyse(samples, rate)
}
const on = (t, a) => Math.abs((t - a.phase) / a.period - Math.round((t - a.phase) / a.period)) * a.period

test('the tempo, the drop and the quiet passages are measured from the track', () => {
  for (const bpm of [84, 120, 150]) {
    const a = track(bpm, { sections: [{ at: 0, shape: 'pulse' }, { at: 9, shape: 'full' }], silence: [[13, 14]], drop: 14 })
    assert.ok(Math.abs(a.bpm - bpm) <= 1, `${bpm} measured as ${a.bpm}`)
    assert.ok(a.confidence > SURE)
    assert.ok(a.quiet.some(([s, e]) => Math.abs(s - 13) < 0.15 && Math.abs(e - 14) < 0.2), JSON.stringify(a.quiet))
    assert.ok(Math.abs(a.drop - 14) < 0.12, `drop at ${a.drop}`)
  }
})

test('every cut moves onto the beat, a hit onto a strong onset, the drop onto the drop', () => {
  const a = track(120, { sections: [{ at: 0, shape: 'full' }], hits: [4.5], silence: [[10, 11]], drop: 11 })
  const beats = [{}, {}, { cue: 'hit' }, {}, { cue: 'stop' }, { cue: 'drop' }, {}]
  const planned = [2.3, 1.9, 2.4, 3.6, 1.1, 3.3, 4]
  const r = cutToMusic(beats, planned, a)
  let t = 0
  const cuts = r.lengths.slice(0, -1).map(d => (t += d))
  for (const c of cuts) assert.ok(on(c, a) <= 0.06, `cut at ${c} is off the beat`)
  assert.ok(Math.abs(cuts[1] - 4.5) < 0.05, `the hit cut at ${cuts[1]}`)
  assert.ok(Math.abs(cuts[3] - 10) < 0.1, `the stop at ${cuts[3]}`)
  assert.ok(Math.abs(cuts[4] - 11) < 0.06, `the drop at ${cuts[4]}`)
  assert.equal(r.report.onBeat, 1)
  for (let i = 0; i < planned.length - 1; i++) assert.ok(Math.abs(r.lengths[i] - planned[i]) < planned[i] * 0.5 + 0.3)
})

test('a spoken line is never cut short: its beat runs on to the next beat', () => {
  const a = track(100, {})
  const voices = [{ seconds: 2.9 }, null, { seconds: 1.1 }]
  const beats = [{ say: 'a' }, {}, { say: 'b' }, {}]
  const planned = planLengths(beats.map(() => ({ seconds: 2 })), voices)
  const least = leastLengths(beats, voices)
  const r = cutToMusic(beats, planned, a, { min: least })
  r.lengths.forEach((d, i) => assert.ok(d >= least[i] - 1e-6, `beat ${i}: ${d} < ${least[i]}`))
  let t = 0
  for (const d of r.lengths.slice(0, -1)) { t += d; assert.ok(on(t, a) <= 0.06) }
})

test('a track with no beat leaves the lengths alone', () => {
  let x = 7
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (const flat of [new Int16Array(22050 * 10).map((_, i) => Math.round(Math.sin(i / 40) * 3000)), new Int16Array(22050 * 10).map(() => Math.round(rnd() * 6000))]) {
    const r = cutToMusic([{}, {}, {}], [2, 3, 4], analyse(flat, 22050))
    assert.deepEqual(r.lengths, [2, 3, 4])
    assert.ok(r.report.kept)
  }
  assert.deepEqual(cutToMusic([{}, {}], [2, 3], null).lengths, [2, 3])
})

test('a sound effect moves with its beat', () => {
  assert.equal(retime(2.5, [2, 2, 2], [2.2, 1.8, 2]), 2.65)
  assert.equal(retime(0.4, [2, 2], [3, 2]), 0.6)
  assert.equal(retime(5, [2, 2, 2], [2, 2, 3]), 5.5)
})
