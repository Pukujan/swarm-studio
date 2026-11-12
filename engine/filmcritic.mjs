// The film critic (spec 26 step 6, spec 32): a finished film is watched and listened to, the way a person
// would, and each thing that is wrong is named. Most checks need no model: the pinned ffmpeg measures black
// stretches, silences and loudness, finds the cuts in the picture, and the music is measured for its beat.
// A model that hears checks the voice against the script; a model that sees looks at the frames.
// Every check says how it was made, and a check that could not be made says so.

import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { measure, sceneTimes, sampleFrames, soundClip, audioPart, imagePart, mediaInfo } from './mediareader.mjs'
import { decode, analyse, SURE } from './musiccut.mjs'

export const CRITIC = {
  black: 1.0, // seconds of black that count as a fault
  silence: 1.2, // seconds of silence inside a film with music
  lufs: [-24, -9], // integrated loudness a film should sit in
  peak: -0.3, // dBFS above which the sound may clip
  onBeat: 0.09, // seconds a cut may sit from the beat
  onBeatShare: 0.7, // share of cuts that should be on the beat
  matchCut: 0.3, // seconds a found cut may sit from a planned one
  voiceRecall: 0.6 // share of the script's words that should be heard
}

const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(w => w.length > 2)
export function recall(script, heard) {
  const want = words(script), got = new Set(words(heard))
  if (!want.length) return null
  return Number((want.filter(w => got.has(w)).length / want.length).toFixed(2))
}

// the planned cut times from a storyboard's lengths
export const cutTimes = lengths => lengths.slice(0, -1).reduce((a, l) => [...a, (a.at(-1) || 0) + l], [])
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]

// The checks, from what was measured. Pure, so it is tested without ffmpeg.
//   m: { seconds, lufs, peak, silences, blacks, hasSound }   cuts: found cut times   beats: the music's beat times
//   board: { lengths, voice, scenes, cues }   heard: transcript text or null   look: { broken: [] } or null
export function filmChecks({ m, cuts = [], beats = [], beatSure = false, board = {}, heard = null, look = null, music = true }) {
  const out = []
  const seconds = m.seconds || 0
  const add = (id, ok, says, how = 'measured') => out.push({ id, ok, says, how })
  // black: a black beat the storyboard asked for may be short; a long black stretch is a fault anywhere
  const blacks = (m.blacks || []).filter(([a, b]) => b - a >= CRITIC.black)
  add('black', !blacks.length, blacks.length ? `black for ${blacks.map(([a, b]) => `${(b - a).toFixed(1)} s at ${fmt(a)}`).join(', ')}` : 'no black stretches')
  if (music) {
    if (!m.hasSound) add('sound', false, 'the film has no sound')
    else {
      const quiet = (board.cues?.silence || []).map(s => Array.isArray(s) ? s : [s.at ?? s.start ?? 0, (s.at ?? s.start ?? 0) + (s.seconds ?? s.length ?? 0)])
      const gaps = (m.silences || []).map(([a, b]) => [a, b ?? seconds]).filter(([a, b]) => b - a >= CRITIC.silence && a < seconds - 1 && !quiet.some(q => overlaps(q, [a, b])))
      add('silence', !gaps.length, gaps.length ? `silent for ${gaps.map(([a, b]) => `${(b - a).toFixed(1)} s at ${fmt(a)}`).join(', ')}` : 'the music runs through')
      const [lo, hi] = CRITIC.lufs
      if (m.lufs == null) add('level', false, 'the loudness could not be measured')
      else add('level', m.lufs >= lo && m.lufs <= hi && !(m.peak > CRITIC.peak), m.lufs < lo ? `too quiet (${m.lufs} LUFS)` : m.lufs > hi ? `too loud (${m.lufs} LUFS)` : m.peak > CRITIC.peak ? `may clip (peak ${m.peak} dBFS)` : `${m.lufs} LUFS, peak ${m.peak} dBFS`)
    }
  }
  // cuts: the cuts found in the picture, matched to the planned ones, then held against the beat
  const planned = cutTimes(board.lengths || [])
  if (planned.length) {
    const matched = planned.map(p => cuts.reduce((best, c) => (Math.abs(c - p) < Math.abs(best - p) ? c : best), Infinity)).filter((c, i) => Math.abs(c - planned[i]) <= CRITIC.matchCut)
    if (!music || !m.hasSound) add('beat', null, 'no music to cut to')
    else if (!beatSure || !beats.length) add('beat', null, 'the music has no clear beat to check against')
    else if (matched.length < Math.max(2, planned.length * 0.4)) add('beat', null, `only ${matched.length} of ${planned.length} cuts could be found in the picture`)
    else {
      const near = c => Math.min(...beats.map(b => Math.abs(b - c)))
      const on = matched.filter(c => near(c) <= CRITIC.onBeat).length
      const share = on / matched.length
      add('beat', share >= CRITIC.onBeatShare, `${on} of ${matched.length} cuts land on the beat`)
    }
  }
  // the voice against the script
  const script = (board.scenes || []).map(s => s.say).filter(Boolean).join(' ')
  if (board.voice && script) {
    if (heard == null) add('voice', null, 'the voice was not checked: no model that hears is set', 'not checked')
    else {
      const r = recall(script, heard)
      add('voice', r >= CRITIC.voiceRecall, `${Math.round(r * 100)}% of the script's words were heard`, 'heard by the media model')
    }
  }
  if (look) add('look', !look.broken?.length, look.broken?.length ? look.broken.map(b => `at ${fmt(b.t)}: ${b.why}`).join('; ') : 'no broken frames seen', look.by)
  return out
}

export function verdict(checks) {
  const bad = checks.filter(c => c.ok === false)
  const unchecked = checks.filter(c => c.ok === null)
  return { ok: !bad.length, faults: bad.map(c => c.says), unchecked: unchecked.map(c => `${c.id}: ${c.says}`), says: bad.length ? `${bad.length} thing${bad.length > 1 ? 's' : ''} to fix: ${bad.map(c => c.says).join('; ')}` : 'it plays clean' }
}

const LOOK = n => `These are ${n} frames sampled from a finished promo film, in order, with their times. Name only frames that look broken: blank or nearly blank, words cut off at the edge or overlapping, words too small or low-contrast to read, a picture squashed, stretched or badly cropped, or something half-drawn. Answer only JSON: {"broken":[{"frame":<index from 0>,"why":"<at most 12 words>"}]}. An empty list when nothing is broken.`
const HEAR = 'Write down exactly the words spoken in this audio, nothing else. If no words are spoken, answer with an empty line.'

// Watch and listen to a rendered film. ask(who, messages) -> text; caps: the media pick's; vision: a vision model is set
export async function reviewFilm({ ffmpeg, file, board, tmp, caps = {}, vision = false, ask = null, music = true }) {
  mkdirSync(tmp, { recursive: true })
  const info = await mediaInfo(ffmpeg, file)
  const meas = await measure(ffmpeg, file, { video: true, audio: !!info.audio })
  const m = { ...meas, seconds: info.seconds, hasSound: !!info.audio && meas.lufs != null && meas.lufs > -70 }
  const cuts = await sceneTimes(ffmpeg, file, { threshold: 0.25 })
  let beats = [], beatSure = false
  if (m.hasSound) {
    try { const d = await decode(ffmpeg, file); const a = analyse(d.samples, d.rate, { bpm: board.music?.bpm }); beats = a.beats || []; beatSure = a.confidence >= SURE } catch {}
  }
  let heard = null, look = null
  const script = (board.scenes || []).some(s => s.say)
  if (ask && board.voice && script && m.hasSound && caps.audio) {
    const clip = await soundClip(ffmpeg, file, join(tmp, 'film.mp3'))
    if (clip) heard = await ask('media', [{ role: 'user', content: [{ type: 'text', text: HEAR }, audioPart(clip)] }]).catch(() => null)
  }
  const who = caps.image ? 'media' : vision ? 'vision' : null
  if (ask && who) {
    const frames = await sampleFrames(ffmpeg, file, join(tmp, 'frames'), { seconds: info.seconds, max: 8, width: 640 })
    if (frames.length) {
      const content = [{ type: 'text', text: LOOK(frames.length) }]
      frames.forEach((f, i) => content.push({ type: 'text', text: `frame ${i} at ${f.t.toFixed(1)} s` }, imagePart(f.file)))
      const text = await ask(who, [{ role: 'user', content }]).catch(() => '')
      const j = String(text || '').match(/\{[\s\S]*\}/)
      try {
        const broken = (JSON.parse(j?.[0] || 'null')?.broken || []).filter(b => frames[b.frame]).slice(0, 6).map(b => ({ t: frames[b.frame].t, why: String(b.why || '').slice(0, 80) }))
        look = { broken, by: `${frames.length} frames seen by the ${who === 'media' ? 'media' : 'vision'} model` }
      } catch {}
    }
  }
  const checks = filmChecks({ m, cuts, beats, beatSure, board, heard, look, music })
  return { at: Date.now(), seconds: m.seconds, lufs: m.lufs, peak: m.peak, cuts: cuts.length, checks, ...verdict(checks), heard: heard != null ? 'voice' : 'none', saw: look ? look.by : 'measured only' }
}
