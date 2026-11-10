// The film's score, written to the storyboard's cue sheet: its tempo, its
// sections (pulse, build, full, drop, resolve, calm), the hits, the hard stops
// (true silence) and the sound effects on each beat. Made here in code, or by
// ElevenLabs (music and sound effects) when the studio has a key; the key comes
// from Hermes's secret scope through the launcher (SWARM_ELEVENLABS_KEY), never
// from a file. Nothing here imitates a reference's melody: the notes only give
// tempo, instruments and shape.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RATE = 44100
const hz = semis => 110 * 2 ** (semis / 12)

// Progressions, as semitones above A2: chosen by mood, varied by the seed.
const PROGS = {
  dark: [[[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M']], [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M']]],
  bright: [[[3, 'M'], [10, 'M'], [0, 'm'], [8, 'M']], [[3, 'M'], [8, 'M'], [10, 'M'], [10, 'M']]],
  soft: [[[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']], [[8, 'M'], [3, 'M'], [10, 'M'], [5, 'm']]],
}

function rand(seed) { let s = (seed >>> 0) || 7; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1 }

export function shapeAt(sections, t) {
  let shape = sections[0]?.shape || 'full'
  for (const s of sections) if (s.at <= t + 1e-6) shape = s.shape
  return shape
}

// Writes a stereo WAV of `seconds` to `file`, following `cues` (see storyboard.cueSheet).
export function scoreWav({ seconds, music = {}, cues = {}, file, seed = 7, withSfx = true }) {
  const bpm = music.bpm || 110, beat = 60 / bpm, bar = beat * 4
  const mood = String(music.mood || '').toLowerCase()
  const family = /dark|scary|horror|tense|ominous|eerie|creep|dread|noir|epic/.test(mood) ? 'dark' : /calm|gentle|soft|warm|slow|dream|tender/.test(mood) ? 'soft' : 'bright'
  const prog = PROGS[family][seed % 2]
  const cute = /cute|playful|sweet|toy|whims|kawaii|fun/.test(mood + ' ' + (music.instruments || []).join(' ')).valueOf()
  const n = Math.ceil(seconds * RATE), L = new Float32Array(n), R = new Float32Array(n)
  const noise = rand(seed * 31 + 1)
  const add = (i, l, r = l) => { if (i >= 0 && i < n) { L[i] += l; R[i] += r } }
  const chordAt = t => prog[Math.floor(t / bar) % prog.length]
  const tones = ([root, q]) => [root, root + (q === 'm' ? 3 : 4), root + 7]
  const sections = cues.sections?.length ? cues.sections : [{ at: 0, shape: 'full' }]
  const silent = t => (cues.silence || []).some(([a, b]) => t >= a && t < b)
  // how loud each layer is in each section shape
  const MIX = {
    pulse: { pad: 0.6, bass: 1, kick: 0.5, hat: 0, arp: 0, snare: 0 },
    build: { pad: 0.8, bass: 1, kick: 0.8, hat: 0.7, arp: 0.6, snare: 0.6 },
    full: { pad: 1, bass: 1, kick: 1, hat: 1, arp: 1, snare: 1 },
    drop: { pad: 1, bass: 1.3, kick: 1.3, hat: 1, arp: 1, snare: 1.2 },
    resolve: { pad: 1, bass: 0.5, kick: 0, hat: 0, arp: 0.5, snare: 0 },
    calm: { pad: 0.9, bass: 0.5, kick: 0, hat: 0, arp: 0.7, snare: 0 },
  }
  const mixAt = t => MIX[shapeAt(sections, t)] || MIX.full
  // a section's rise: build sections swell in volume and speed up their hats
  const buildRise = t => {
    const i = sections.findLastIndex(s => s.at <= t + 1e-6)
    if (sections[i]?.shape !== 'build') return 1
    const end = sections[i + 1]?.at ?? seconds
    return 0.55 + 0.45 * Math.min(1, (t - sections[i].at) / Math.max(0.5, end - sections[i].at))
  }

  // pad
  for (let i = 0; i < n; i++) {
    const t = i / RATE, m = mixAt(t).pad * buildRise(t)
    if (!m) continue
    const inBar = (t % bar) / bar, env = Math.min(1, inBar * 5) * (1 - 0.2 * inBar)
    let l = 0, r = 0
    for (const s of tones(chordAt(t))) {
      const f = hz(s + 12)
      l += Math.sin(2 * Math.PI * f * 0.997 * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t)
      r += Math.sin(2 * Math.PI * f * 1.003 * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.004 * t)
    }
    add(i, l * 0.04 * env * m, r * 0.04 * env * m)
  }
  const pluck = (t0, f, len, amp, pan = 0, decay = 7, bell = 0) => {
    const s = Math.floor(t0 * RATE), m = Math.floor(len * RATE)
    for (let k = 0; k < m; k++) {
      const t = k / RATE, e = Math.exp(-t * decay) * Math.min(1, k / 60)
      const v = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + bell * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 14)) * e * amp
      add(s + k, v * (1 - pan), v * (1 + pan))
    }
  }
  const kick = (t0, amp) => { const s = Math.floor(t0 * RATE); for (let k = 0; k < RATE * 0.3; k++) { const u = k / RATE; add(s + k, Math.sin(2 * Math.PI * (45 + 110 * Math.exp(-u * 28)) * u) * Math.exp(-u * 11) * amp) } }
  const hat = (t0, amp) => { const s = Math.floor(t0 * RATE); for (let k = 0; k < RATE * 0.04; k++) { const v = noise() * Math.exp(-k / RATE * 110) * amp; add(s + k, v * 0.8, v) } }
  const snare = (t0, amp) => { const s = Math.floor(t0 * RATE); for (let k = 0; k < RATE * 0.18; k++) { const u = k / RATE; add(s + k, (noise() * 0.7 + Math.sin(2 * Math.PI * 190 * u) * 0.5) * Math.exp(-u * 22) * amp) } }
  // the grid: sixteenth notes
  const step = beat / 4
  for (let k = 0, t = 0; t < seconds; k++, t = k * step) {
    if (silent(t)) continue
    const m = mixAt(t), rise = buildRise(t), shape = shapeAt(sections, t)
    const ch = tones(chordAt(t))
    if (m.arp && k % (shape === 'calm' || shape === 'resolve' ? 4 : 2) === 0) pluck(t, hz(ch[[0, 1, 2, 1, 2, 0][(k / 2) % 6 | 0]] + (cute ? 36 : 24)), 0.5, 0.06 * m.arp * rise, (k / 2) % 2 ? 0.35 : -0.35, cute ? 9 : 6, cute ? 0.5 : 0)
    if (m.bass && k % (shape === 'pulse' ? 2 : 4) === 0) pluck(t, hz(ch[0] - 12), shape === 'calm' ? 1.2 : 0.32, 0.15 * m.bass, 0, shape === 'calm' ? 3 : 8)
    if (m.kick && k % 4 === 0 && (shape !== 'pulse' || k % 16 === 0 || k % 16 === 10)) kick(t, 0.3 * m.kick * rise)
    if (m.hat && k % 4 === 2) hat(t, 0.05 * m.hat * rise)
    if (m.hat && shape === 'build' && rise > 0.85) hat(t, 0.035)
    if (m.snare && k % 8 === 4) snare(t, 0.12 * m.snare * rise)
  }
  // the hits and the drop: a deep boom with a cymbal-like wash
  const boom = (t0, amp = 0.5) => {
    const s = Math.floor(t0 * RATE)
    for (let k = 0; k < RATE * 1.8; k++) {
      const u = k / RATE
      add(s + k, (Math.sin(2 * Math.PI * (38 + 60 * Math.exp(-u * 9)) * u) * Math.exp(-u * 2.6) + noise() * 0.25 * Math.exp(-u * 4)) * amp)
    }
  }
  for (const t of cues.hits || []) boom(t, 0.5)
  if (cues.drop != null) boom(cues.drop, 0.6)
  if (withSfx) for (const x of cues.sfx || []) sfxInto(add, noise, x.kind, x.at, n)
  // true silence in the hard stops, a short fade at each edge
  for (const [a, b] of cues.silence || []) {
    for (let i = Math.floor(a * RATE); i < Math.min(n, Math.floor(b * RATE)); i++) {
      const g = Math.min(1, Math.max(0, (a + 0.02 - i / RATE) / 0.02), Math.max(0, (i / RATE - (b - 0.03)) / 0.03))
      L[i] *= g; R[i] *= g
    }
  }
  write(file, L, R, seconds)
}

// one effect, synthesised into the buffer at t
function sfxInto(add, noise, kind, t, n) {
  const s = Math.floor(t * RATE)
  const span = (sec, f) => { for (let k = 0; k < RATE * sec && s + k < n; k++) f(k / RATE, k) }
  if (kind === 'riser') { // a rising noise sweep that ends on t
    const len = 1.6, s0 = Math.floor((t - len) * RATE)
    let lp = 0
    for (let k = 0; k < RATE * len; k++) { const u = k / (RATE * len); lp += (0.02 + 0.4 * u) * (noise() - lp); const v = (lp + Math.sin(2 * Math.PI * (200 + 1800 * u * u) * k / RATE) * 0.3) * u * u * 0.35; add(s0 + k, v * (1 - u), v * u) }
  } else if (kind === 'whoosh') {
    let lp = 0; const s0 = Math.floor((t - 0.45) * RATE)
    for (let k = 0; k < RATE * 0.7; k++) { const u = k / (RATE * 0.7); lp += (0.03 + 0.25 * u) * (noise() - lp); const e = Math.sin(Math.PI * u) * 0.3; add(s0 + k, lp * e * (1 - u), lp * e * u) }
  } else if (kind === 'hit' || kind === 'boom') {
    span(kind === 'boom' ? 2 : 0.9, u => add(s + Math.floor(u * RATE), (Math.sin(2 * Math.PI * (40 + 80 * Math.exp(-u * 12)) * u) * Math.exp(-u * (kind === 'boom' ? 2.2 : 5)) + noise() * 0.4 * Math.exp(-u * 9)) * 0.45))
  } else if (kind === 'tick') {
    span(0.03, u => add(s + Math.floor(u * RATE), Math.sin(2 * Math.PI * 2400 * u) * Math.exp(-u * 160) * 0.25))
  } else if (kind === 'glitch') {
    span(0.25, (u, k) => add(s + k, (Math.floor(k / 220) % 2 ? noise() : Math.sign(Math.sin(2 * Math.PI * 330 * u))) * 0.12))
  } else if (kind === 'sting') {
    for (const f of [hz(24), hz(27), hz(31)]) span(1.2, (u, k) => add(s + k, Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 2.5) * 0.07))
  } else if (kind === 'chime') {
    for (const [f, d] of [[hz(43), 0], [hz(48), 0.09], [hz(52), 0.18]]) for (let k = 0; k < RATE * 1.4; k++) { const u = k / RATE; add(s + Math.floor(d * RATE) + k, Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 3.5) * 0.06) }
  } else if (kind === 'heartbeat') {
    for (const d of [0, 0.28]) for (let k = 0; k < RATE * 0.2; k++) { const u = k / RATE; add(s + Math.floor(d * RATE) + k, Math.sin(2 * Math.PI * (50 + 30 * Math.exp(-u * 30)) * u) * Math.exp(-u * 18) * 0.4) }
  }
}

function write(file, L, R, seconds) {
  const n = L.length, pcm = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    const t = i / RATE, g = Math.min(1, t / 0.15) * Math.min(1, (seconds - t) / 1.2)
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 30000), i * 4)
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 30000), i * 4 + 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40)
  writeFileSync(file, Buffer.concat([head, pcm]))
}

// ---------- ElevenLabs, when the studio has a key

// The prompt ElevenLabs reads: tempo, instruments, mood and the timed shape. No titles, artists or melodies.
export function musicPrompt(music, cues, seconds) {
  const parts = cues.sections.map((s, i) => `${s.at.toFixed(1)}s ${s.shape}${cues.sections[i + 1] ? '' : ` to ${seconds.toFixed(1)}s`}`)
  return clip(`Original instrumental film score, ${music.bpm} BPM, ${music.mood}. Instruments: ${(music.instruments || []).join(', ')}. ${music.structure || ''} Timeline: ${parts.join(', ')}.${cues.hits.length ? ` Big hits at ${cues.hits.map(t => `${t.toFixed(1)}s`).join(', ')}.` : ''}${cues.silence.length ? ` Complete silence from ${cues.silence.map(([a, b]) => `${a.toFixed(1)}s to ${b.toFixed(1)}s`).join(' and ')}.` : ''}${cues.drop != null ? ` The drop lands at ${cues.drop.toFixed(1)}s.` : ''} No vocals.`, 1900)
}
const clip = (s, n) => String(s).replace(/\s+/g, ' ').trim().slice(0, n)

export const SFX_TEXT = {
  hit: 'a deep cinematic trailer hit, short', boom: 'a huge cinematic boom with a long tail', riser: 'a rising tension riser that ends abruptly', whoosh: 'a fast air whoosh', tick: 'a single clock tick', glitch: 'a short digital glitch stutter', sting: 'a short orchestral sting', chime: 'a small bright chime', heartbeat: 'two slow heartbeats',
}

async function eleven(key, path, body, signal) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body), signal })
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// Music and effects from ElevenLabs into dir. Returns { music, sfx: [{file, at}] }; throws when the music fails.
export async function elevenScore({ key, music, cues, seconds, dir, fetchTimeout = 180000 }) {
  const out = { music: join(dir, 'score-eleven.mp3'), sfx: [] }
  writeFileSync(out.music, await eleven(key, '/v1/music?output_format=mp3_44100_128', { prompt: musicPrompt(music, cues, seconds), music_length_ms: Math.max(10000, Math.min(300000, Math.ceil(seconds * 1000))) }, AbortSignal.timeout(fetchTimeout)))
  const kinds = [...new Set((cues.sfx || []).map(x => x.kind))].slice(0, 6)
  const files = {}
  await Promise.all(kinds.map(async k => {
    try {
      const f = join(dir, `sfx-${k}.mp3`)
      writeFileSync(f, await eleven(key, '/v1/sound-generation?output_format=mp3_44100_128', { text: SFX_TEXT[k] || k, duration_seconds: k === 'boom' ? 3 : k === 'riser' ? 2 : 1, prompt_influence: 0.6 }, AbortSignal.timeout(60000)))
      files[k] = f
    } catch {}
  }))
  for (const x of cues.sfx || []) if (files[x.kind]) out.sfx.push({ file: files[x.kind], at: Math.max(0, x.at - (x.kind === 'riser' ? 1.8 : x.kind === 'whoosh' ? 0.4 : 0)) })
  return out
}
