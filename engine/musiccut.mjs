// Cuts on the music (spec 26): the track is made first, measured, and the film's
// cuts are moved onto it.
//
// analyse() finds the tempo and where the beat falls (never assumed to start at 0),
// the bar line, every onset with its strength, the drop and the quiet passages.
// cutToMusic() moves each cut: a `hit` beat to a strong onset, the `drop` beat to
// the measured drop, a `stop` to a quiet passage, a change of section to a bar
// line, every other cut to the nearest beat (half beats inside a fast montage).
// A beat with a spoken line never gets shorter than the line. A track with no
// clear beat leaves the storyboard's lengths as they are.

import { execFile } from './proc.mjs'
import { readFileSync } from 'node:fs'

const RATE = 22050
const round = (x, n = 3) => Number(x.toFixed(n))

// A 16-bit PCM WAV as mono samples (the studio's own score is one).
export function readWav(file) {
  const b = readFileSync(file)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.readUInt16LE(20) !== 1 || b.readUInt16LE(34) !== 16) throw new Error('not a 16-bit PCM WAV')
  const ch = b.readUInt16LE(22), rate = b.readUInt32LE(24)
  let at = 12
  while (at + 8 <= b.length && b.toString('ascii', at, at + 4) !== 'data') at += 8 + b.readUInt32LE(at + 4)
  const n = Math.floor(Math.min(b.readUInt32LE(at + 4), b.length - at - 8) / (2 * ch)), out = new Int16Array(n)
  for (let i = 0, p = at + 8; i < n; i++, p += 2 * ch) { let v = 0; for (let k = 0; k < ch; k++) v += b.readInt16LE(p + 2 * k); out[i] = v / ch }
  return { samples: out, rate }
}

// Any audio file as mono samples, through ffmpeg.
export function decode(ffmpeg, file, { env = {} } = {}) {
  return new Promise((ok, fail) => execFile(ffmpeg, ['-v', 'error', '-i', file, '-t', '300', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 26, timeout: 120000, env }, (err, out) => {
    if (err || !out?.length) return fail(err || new Error('no audio decoded'))
    ok({ samples: new Int16Array(out.buffer, out.byteOffset, Math.floor(out.length / 2)), rate: RATE })
  }))
}

// What the track does. `bpm` is the tempo that was asked for, when one was: the search starts there.
export function analyse(samples, rate, { bpm: hint = null } = {}) {
  const hop = Math.round(rate * 0.01), n = Math.floor(samples.length / hop), dt = hop / rate
  const seconds = samples.length / rate
  if (n < 200) return { seconds: round(seconds, 2), confidence: 0, beats: [], onsets: [], quiet: [], drop: null }
  const scale = samples instanceof Int16Array ? 1 / 32768 : 1
  const rms = new Float32Array(n), low = new Float32Array(n)
  const a = 1 - Math.exp(-2 * Math.PI * 160 / rate)
  let lp = 0
  for (let f = 0; f < n; f++) {
    let e = 0, el = 0
    for (let k = f * hop; k < (f + 1) * hop; k++) { const v = samples[k] * scale; lp += a * (v - lp); e += v * v; el += lp * lp }
    rms[f] = Math.sqrt(e / hop); low[f] = Math.sqrt(el / hop)
  }
  // onsets: how fast the loudness rises, in the full band and in the lows, above its own running average
  const rise = new Float32Array(n), lowRise = new Float32Array(n)
  for (let f = 1; f < n; f++) {
    lowRise[f] = Math.max(0, Math.log1p(200 * low[f]) - Math.log1p(200 * low[f - 1]))
    rise[f] = Math.max(0, Math.log1p(100 * rms[f]) - Math.log1p(100 * rms[f - 1])) + lowRise[f]
  }
  const env = new Float32Array(n), W = 30
  let run = 0
  for (let f = 0; f < n; f++) { run += rise[f] - (f >= W ? rise[f - W] : 0); env[f] = Math.max(0, rise[f] - run / Math.min(f + 1, W)) }
  let mean = 0, peak = 0
  for (let f = 0; f < n; f++) { mean += env[f]; if (env[f] > peak) peak = env[f] }
  mean /= n
  // a flat sound has no beat to cut on, however regular its tiny wobbles
  if (peak < 0.05 || !mean) return { seconds: round(seconds, 2), confidence: 0, beats: [], onsets: [], quiet: [], drop: null }
  const at = (e, t) => { const f = Math.round(t / dt); return Math.max(e[f - 1] || 0, e[f] || 0, e[f + 1] || 0) }
  // the tempo and where its beat falls: the period and offset whose beats collect the most onset
  const comb = period => {
    let best = 0, phase = 0
    for (let p = 0; p < period; p += dt) {
      let s = 0, c = 0
      for (let t = p; t < seconds - 0.05; t += period) { s += at(env, t); c++ }
      if (c && s / c > best) { best = s / c; phase = p }
    }
    return { score: best / mean, phase }
  }
  const search = (from, to, step) => { let top = { score: 0 }; for (let b = from; b <= to + 1e-9; b += step) { const r = comb(60 / b); const prior = Math.exp(-0.5 * (Math.log2(b / 112) / 0.7) ** 2); if (r.score * prior > (top.rank || 0)) top = { ...r, bpm: b, rank: r.score * prior } } return top }
  let found = null
  if (hint) { const near = search(hint * 0.94, hint * 1.06, 0.5); if (near.score >= 2) found = near }
  if (!found) found = search(60, 180, 1)
  // the tempo to a tenth of a beat a minute, so the grid does not drift over the film
  const fine = search(found.bpm - 0.9, found.bpm + 0.9, 0.1)
  if (fine.score >= found.score) found = fine
  const period = 60 / found.bpm
  const beats = []
  for (let t = found.phase; t < seconds; t += period) beats.push(round(t))
  // the bar line: the beat of every four that carries the most low end
  let downbeat = 0, barBest = -1
  for (let j = 0; j < 4; j++) { let s = 0, c = 0; for (let i = j; i < beats.length; i += 4) { s += at(lowRise, beats[i]) + at(low, beats[i] + 0.03); c++ } if (c && s / c > barBest) { barBest = s / c; downbeat = j } }
  // onsets strong enough to cut on, at least 80 ms apart
  let sd = 0
  for (let f = 0; f < n; f++) sd += (env[f] - mean) ** 2
  sd = Math.sqrt(sd / n)
  const onsets = []
  for (let f = 2; f < n - 2; f++) if (env[f] > mean + 1.5 * sd && env[f] >= env[f - 1] && env[f] >= env[f + 1] && env[f] >= env[f - 2] && env[f] >= env[f + 2]) {
    const o = { at: round(f * dt), strength: round(env[f] / peak, 2) }
    if (onsets.length && o.at - onsets.at(-1).at < 0.08) { if (o.strength > onsets.at(-1).strength) onsets[onsets.length - 1] = o } else onsets.push(o)
  }
  // loudness over 0.4 s: the quiet passages, and the drop (the biggest jump from one second to the next)
  const S = Math.round(0.4 / dt), lvl = new Float32Array(n)
  let acc = 0
  for (let f = 0; f < n; f++) { acc += rms[f] - (f >= S ? rms[f - S] : 0); lvl[f] = acc / Math.min(f + 1, S) }
  const loud = [...lvl].sort((x, y) => x - y)[Math.floor(n * 0.95)] || 1
  const quiet = []
  let q = -1
  for (let f = 0; f <= n; f++) {
    const is = f < n && rms[f] < loud * 0.08
    if (is && q < 0) q = f
    if (!is && q >= 0) { if ((f - q) * dt >= 0.35 && q * dt > 0.5 && f < n - 5) quiet.push([round(q * dt, 2), round(f * dt, 2)]); q = -1 }
  }
  const sec = Math.round(1 / dt)
  const avg = (i, j) => { let s = 0; for (let f = Math.max(0, i); f < Math.min(n, j); f++) s += rms[f]; return s / Math.max(1, Math.min(n, j) - Math.max(0, i)) }
  let drop = null, jump = loud * 0.3
  for (let f = 2 * sec; f < n - 2 * sec; f += 2) { const d = avg(f, f + sec) - avg(f - sec, f); if (d > jump) { jump = d; drop = f * dt } }
  if (drop != null) { const near = onsets.filter(o => Math.abs(o.at - drop) <= 0.2).sort((x, y) => y.strength - x.strength)[0]; drop = round(near ? near.at : drop) }
  return { seconds: round(seconds, 2), bpm: round(found.bpm, 1), period: round(period, 4), phase: round(found.phase), downbeat: beats[downbeat] ?? round(found.phase), confidence: round(found.score, 2), beats, onsets, quiet, drop }
}

// How sure the tempo has to be before any cut moves: steady noise or a held tone scores 4 to 5
// (some comb always lines up by chance), the studio's scores 16 to 30.
export const SURE = 8

// Move the cuts onto the track. beats: the storyboard; lengths: each beat's planned seconds;
// min: the least each beat may run (a spoken line); maxEnd: the track's length when it is fixed.
export function cutToMusic(beats, lengths, a, { min = [], maxEnd = null, tol = 0.06 } = {}) {
  const plan = lengths.map(Number)
  if (!a?.period || (a.confidence || 0) < SURE || plan.length < 2) return { lengths: plan, report: { kept: a?.period ? `no clear beat in the track (${a.confidence})` : 'the track could not be measured', bpm: a?.bpm || null } }
  const P = a.period, snap = (t, step, origin = a.phase) => origin + Math.round((t - origin) / step) * step
  const up = (t, step) => a.phase + Math.ceil((t - a.phase - 1e-6) / step) * step
  const out = [], moved = []
  let planned = 0, prev = 0
  for (let i = 0; i < plan.length; i++) {
    planned += plan[i]
    const next = beats[i + 1], d = plan[i], dn = plan[i + 1] ?? d
    const short = Math.min(d, dn) < 1.5 * P, step = short ? P / 2 : P
    const reach = Math.max(Math.min(d, dn) / 3, step / 2 + 0.005)
    let t = snap(planned, step), why = short ? 'half beat' : 'beat'
    if (next?.cue === 'drop' && a.drop != null && Math.abs(a.drop - planned) <= Math.max(reach, 2 * P)) { t = a.drop; why = 'the drop' }
    else if (next?.cue === 'hit') {
      const hit = a.onsets.filter(o => Math.abs(o.at - planned) <= reach && o.strength >= 0.45).sort((x, y) => y.strength - x.strength || Math.abs(x.at - planned) - Math.abs(y.at - planned))[0]
      if (hit) { t = hit.at; why = 'a hit' }
    } else if (next?.cue === 'stop') {
      const gap = a.quiet.find(([s]) => Math.abs(s - planned) <= reach)
      if (gap) { t = gap[0]; why = 'a quiet passage' }
    } else if (next?.cue && !short) {
      const bar = snap(planned, 4 * P, a.downbeat)
      if (Math.abs(bar - planned) <= reach) { t = bar; why = 'a bar line' }
    }
    // never shorter than its spoken line, never shorter than a blink: on to the next beat instead
    const least = prev + Math.max(min[i] || 0, 0.3)
    if (t < least - 1e-6) { t = up(least, step); why = min[i] ? 'the beat after its line' : why }
    if (i === plan.length - 1 && maxEnd && t > maxEnd) t = Math.max(least, maxEnd)
    out.push(round(t - prev))
    if (i < plan.length - 1) moved.push({ to: why, by: round(t - planned) })
    prev = t
  }
  // what came of it: cuts within `tol` of a beat (or of a half beat)
  let t = 0, on = 0, half = 0
  const off = (x, step) => Math.abs((x - a.phase) / step - Math.round((x - a.phase) / step)) * step
  for (const d of out.slice(0, -1)) { t += d; if (off(t, P) <= tol) on++; if (off(t, P / 2) <= tol) half++ }
  const cuts = out.length - 1
  return {
    lengths: out,
    report: {
      bpm: a.bpm, phase: a.phase, confidence: a.confidence, cuts,
      onBeat: cuts ? round(on / cuts, 2) : 1, onHalfBeat: cuts ? round(half / cuts, 2) : 1,
      moved: round(moved.reduce((s, m) => s + Math.abs(m.by), 0) / Math.max(1, moved.length)), most: round(Math.max(0, ...moved.map(m => Math.abs(m.by)))),
      to: moved.reduce((o, m) => ({ ...o, [m.to]: (o[m.to] || 0) + 1 }), {}),
      drop: a.drop, quiet: a.quiet.length,
    },
  }
}

// The planned length of every beat before the music is heard: the storyboard's, or its spoken line's.
export const planLengths = (beats, voices = [], lead = 0.35) => beats.map((s, i) => round(Math.max(s.seconds || 2, voices[i]?.seconds ? voices[i].seconds + lead + 0.25 : 0)))
export const leastLengths = (beats, voices = [], lead = 0.35) => beats.map((_, i) => (voices[i]?.seconds ? round(voices[i].seconds + lead + 0.25) : 0))

// A moment planned against one set of lengths, moved with its beat to another.
export function retime(t, from, to) {
  let a = 0, b = 0
  for (let i = 0; i < from.length; i++) {
    if (t < a + from[i] - 1e-6 || i === from.length - 1) return round(Math.max(0, b + (t - a) * ((to[i] || from[i]) / from[i])))
    a += from[i]; b += to[i] ?? from[i]
  }
  return t
}
