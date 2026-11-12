// Scores for the film regression set (spec 26): does every film finish, how alike
// the films are in structure, whether each is the kind its prompt expects, how much
// the check had to repair, and how many cuts sit on the beat. Pure functions over
// storyboards; scripts/film-set.mjs runs the set and prints them.

import { composition } from './video.mjs'

// A fixture build (tests/films/set.json) in the shape video.collect() returns.
export function fixtureBuild(b) {
  return {
    brand: b.brand, brief: b.brief, agents: [], theme: b.theme || {}, copy: b.copy || '',
    images: (b.images || []).map((gen, i) => ({ n: i + 1, gen, page: 'home', file: '', name: `p${i + 1}.webp` })),
    clips: (b.clips || []).map((x, i) => ({ n: i + 1, what: x.what, label: x.label || 'Live', seconds: x.seconds || 20, from: 0, file: '', name: `c${i + 1}.mp4` })),
  }
}

export { spokenSeconds } from './storyboard.mjs'

// The film's structure as tokens: what each beat is, and how long it holds.
const hold = s => (s < 1.2 ? 'short' : s <= 3.5 ? 'mid' : 'long')
export const structure = board => board.map(b => b.kind)
export const rhythm = (board, lengths = board.map(b => b.seconds)) => lengths.map(hold)

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = keep
    }
  }
  return row[b.length]
}
// 1 when two sequences are the same, 0 when nothing lines up.
export const likeness = (a, b) => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 1)

// The share of cuts within `tol` seconds of a beat of the track (and of a half beat).
export function onBeat(lengths, bpm, { tol = 0.06, phase = 0 } = {}) {
  const beat = 60 / bpm
  let t = 0, on = 0, grid = 0
  const cuts = lengths.slice(0, -1).map(d => (t += d))
  for (const c of cuts) {
    const off = x => Math.abs((c - phase) / x - Math.round((c - phase) / x)) * x
    if (off(beat) <= tol) on++
    if (off(beat / 2) <= tol) grid++
  }
  return { cuts: cuts.length, beat: cuts.length ? on / cuts.length : 1, half: cuts.length ? grid / cuts.length : 1 }
}

// Does the renderer accept it: a composition with a length, every beat drawn.
export function plays(board, c, lengths) {
  try {
    const wide = composition(board, c, lengths, 'wipe')
    const tall = composition(board, c, lengths, 'wipe', wide.look, { shape: 'tall' })
    return wide.seconds > 3 && tall.seconds === wide.seconds && board.every((_, i) => wide.html.includes(`id="s${i}"`))
  } catch { return false }
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const round = (x, n = 2) => Number(x.toFixed(n))

// results: [{ id, build, expect, board, lengths, c, floor }] → the set's scores and one row per film.
export function scoreSet(results) {
  const films = results.map(r => {
    const b = r.board
    if (!b) return { id: r.id, finished: false, error: r.error || 'no storyboard' }
    const lengths = r.lengths || b.map(x => x.seconds)
    const beat = onBeat(lengths, r.bpm || b.music?.bpm || 110, { phase: r.phase || 0 })
    return {
      id: r.id, build: r.build, finished: plays(b, r.c, lengths),
      kind: b.film?.kind || null, fit: b.film?.kind ? r.expect.includes(b.film.kind) : null,
      beats: b.length, seconds: round(lengths.reduce((a, x) => a + x, 0), 1),
      opens: b[0].kind, closes: b.at(-1).kind,
      shot: round(mean(lengths)), voice: !!b.voice,
      type: round(lengths.reduce((a, d, i) => a + (b[i].layer === 'type' ? d : 0), 0) / lengths.reduce((a, x) => a + x, 0)),
      onBeat: round(beat.beat), onHalf: round(beat.half),
      repairs: (b.fixes || []).length, floor: !!r.floor,
      shape: structure(b).map(k => k[0]).join(''),
      _s: structure(b), _r: rhythm(b, lengths),
    }
  })
  const done = films.filter(f => f.finished)
  const pairs = []
  for (let i = 0; i < done.length; i++) for (let j = i + 1; j < done.length; j++) pairs.push([done[i], done[j]])
  const fits = done.filter(f => f.fit != null)
  const summary = {
    films: films.length,
    finishes: done.length,
    sameness: round(mean(pairs.map(([a, b]) => (likeness(a._s, b._s) + likeness(a._r, b._r)) / 2))),
    sameStructure: round(mean(pairs.map(([a, b]) => likeness(a._s, b._s)))),
    sameRhythm: round(mean(pairs.map(([a, b]) => likeness(a._r, b._r)))),
    openings: new Set(done.map(f => f.opens)).size,
    closings: new Set(done.map(f => f.closes)).size,
    kinds: new Set(done.map(f => f.kind).filter(Boolean)).size,
    fit: fits.length ? round(fits.filter(f => f.fit).length / fits.length) : null,
    repairs: round(mean(done.map(f => f.repairs))),
    floors: done.filter(f => f.floor).length,
    onBeat: round(mean(done.map(f => f.onBeat))),
    onBeatVoiced: done.some(f => f.voice) ? round(mean(done.filter(f => f.voice).map(f => f.onBeat))) : null,
  }
  for (const f of films) { delete f._s; delete f._r }
  return { summary, films }
}
