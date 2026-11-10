// Sound for the promo video: a voiceover read by Kokoro (an 82M text-to-speech
// model that runs locally through kokoro-js, no Python, no account) and a music
// bed written here, in code, to the theme's mood and the video's cuts. ffmpeg
// lays both under the silent render, the music ducking while the voice speaks.

import { execFile } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const KOKORO = 'kokoro-js@1.2.1'
const run = (cmd, args, opts = {}) => new Promise((ok, fail) => execFile(cmd, args, { maxBuffer: 1 << 24, ...opts }, (err, out, errOut) => (err ? fail(new Error(`${err.message}\n${String(errOut).slice(-600)}`)) : ok(out))))

// Kokoro's voices that suit a promo; the theme's mood picks one.
export const VOICES = { snappy: 'af_bella', gentle: 'af_heart' }
// The voices the storyboard writer may cast, with what each sounds like.
export const CAST = {
  af_heart: 'warm, close, friendly woman (US)',
  af_bella: 'bright, upbeat woman (US)',
  af_nicole: 'soft, hushed, intimate woman (US)',
  af_sky: 'light, airy young woman (US)',
  am_michael: 'calm, assured man (US)',
  am_fenrir: 'deep, gritty man (US), for bold or night themes',
  am_puck: 'playful, lively man (US)',
  bf_emma: 'polished, elegant woman (UK)',
  bm_george: 'classic, rich storyteller man (UK)',
  bm_fable: 'gentle, wry narrator man (UK)',
}
export const MOODS = ['gentle', 'snappy']

// The worker loads the model, reads every line to its own WAV and exits, so the
// server never holds the model in memory. It lives next to kokoro-js so its
// import resolves there.
const WORKER = `import { KokoroTTS } from 'kokoro-js'
import { readFileSync } from 'node:fs'
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
const out = []
for (const l of job.lines) {
  if (!l.text) { out.push(null); continue }
  const a = await tts.generate(l.text, { voice: l.voice || job.voice, speed: job.speed })
  await a.save(l.file)
  out.push(a.audio.length / a.sampling_rate)
}
process.stdout.write(JSON.stringify(out))
`

// Seconds in a PCM WAV, from its header.
const wavSeconds = buf => { const at = buf.indexOf('data'); return at < 0 ? 0 : buf.readUInt32LE(at + 4) / buf.readUInt32LE(28) }

// Any other voice: an OpenAI-compatible /v1/audio/speech endpoint (a Kokoro
// server, OpenAI, or a proxy in front of ElevenLabs and the like), set with
// SWARM_TTS_URL, plus SWARM_TTS_KEY and SWARM_TTS_MODEL when it needs them.
async function speakRemote({ url, lines, voices = [], voice, dir, onStage }) {
  onStage('recording the voiceover')
  const out = []
  for (const [i, text] of lines.entries()) {
    if (!text) { out.push(null); continue }
    const res = await fetch(url.replace(/\/+$/, '') + (/audio\/speech$/.test(url) ? '' : '/v1/audio/speech'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.SWARM_TTS_KEY ? { authorization: `Bearer ${process.env.SWARM_TTS_KEY}` } : {}) },
      body: JSON.stringify({ model: process.env.SWARM_TTS_MODEL || 'kokoro', input: text, voice: voices[i] || voice, response_format: 'wav', speed: 1.04 }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) throw new Error(`the voice server answered ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer()), file = join(dir, `voice${i}.wav`)
    writeFileSync(file, buf)
    out.push({ file, seconds: wavSeconds(buf) })
  }
  return out
}

// Reads each line, in its own voice where the storyboard cast one; returns the
// seconds each takes (null for a scene with none).
export async function speak({ dataDir, lines, voices = [], voice, dir, onStage = () => {} }) {
  const url = process.env.SWARM_TTS_URL
  if (url) return speakRemote({ url, lines, voice: process.env.SWARM_TTS_VOICE || voice, voices: process.env.SWARM_TTS_VOICE ? [] : voices, dir, onStage })
  const tools = join(dataDir, 'video-tools')
  if (!existsSync(join(tools, 'node_modules', 'kokoro-js'))) {
    onStage('fetching the Kokoro voice (first time only)')
    const npm = [join(dirname(process.execPath), 'npm'), 'npm'].find(p => p === 'npm' || existsSync(p))
    await run(npm, ['install', '--no-audit', '--no-fund', KOKORO], { cwd: tools, timeout: 600000 })
  }
  writeFileSync(join(tools, 'voice-worker.mjs'), WORKER)
  const job = { voice, speed: 1.04, lines: lines.map((text, i) => ({ text, voice: voices[i] || voice, file: join(dir, `voice${i}.wav`) })) }
  writeFileSync(join(dir, 'voice.json'), JSON.stringify(job))
  onStage('recording the voiceover')
  const secs = JSON.parse(await run(process.execPath, [join(tools, 'voice-worker.mjs'), join(dir, 'voice.json')], { cwd: tools, timeout: 300000 }))
  return secs.map((s, i) => (s ? { file: job.lines[i].file, seconds: s } : null))
}

// ---------- the music bed

const RATE = 44100
// minor-key progressions, as semitones above A2 for each bar's chord root and quality
const PROGRESSIONS = {
  snappy: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], // Am F C G: synthwave
  gentle: [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']], // Am Dm F E: warm, late-night
}
const hz = semis => 110 * 2 ** (semis / 12)

// Writes a stereo WAV of `seconds`, with a soft whoosh into every cut.
export function music({ seconds, preset = 'gentle', cuts = [], file }) {
  const snappy = preset === 'snappy'
  const bpm = snappy ? 112 : 84, beat = 60 / bpm, bar = beat * 4
  const prog = PROGRESSIONS[snappy ? 'snappy' : 'gentle']
  const n = Math.ceil(seconds * RATE), L = new Float32Array(n), R = new Float32Array(n)
  let seed = 7
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1
  const add = (i, l, r = l) => { if (i >= 0 && i < n) { L[i] += l; R[i] += r } }
  const chordAt = t => prog[Math.floor(t / bar) % prog.length]
  const notes = ([root, q]) => [root, root + (q === 'm' ? 3 : 4), root + 7]

  // pad: three detuned voices per chord tone, slow swell each bar
  for (let i = 0; i < n; i++) {
    const t = i / RATE, inBar = (t % bar) / bar
    const env = Math.min(1, inBar * 6) * (1 - 0.25 * inBar)
    let l = 0, r = 0
    for (const s of notes(chordAt(t))) {
      const f = hz(s + 12)
      l += Math.sin(2 * Math.PI * f * 0.998 * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t)
      r += Math.sin(2 * Math.PI * f * 1.002 * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t)
    }
    add(i, l * 0.045 * env, r * 0.045 * env)
  }
  // a plucked note: decaying sine with a little octave
  const pluck = (t0, f, len, amp, pan = 0) => {
    const s = Math.floor(t0 * RATE), m = Math.floor(len * RATE)
    for (let k = 0; k < m; k++) {
      const t = k / RATE, e = Math.exp(-t * (snappy ? 9 : 5)) * Math.min(1, k / 80)
      const v = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * e * amp
      add(s + k, v * (1 - pan), v * (1 + pan))
    }
  }
  const steps = Math.floor(seconds / (beat / (snappy ? 4 : 2)))
  for (let k = 0; k < steps; k++) {
    const t = k * beat / (snappy ? 4 : 2), tones = notes(chordAt(t))
    // arpeggio up and down the chord, an octave above the pad
    const order = [0, 1, 2, 1]
    pluck(t, hz(tones[order[k % 4]] + 24), 0.5, snappy ? 0.07 : 0.06, k % 2 ? 0.35 : -0.35)
  }
  // bass on the root
  for (let t = 0; t < seconds; t += snappy ? beat / 2 : beat * 2) pluck(t, hz(chordAt(t)[0] - 12), snappy ? 0.3 : 1.2, snappy ? 0.16 : 0.14)
  if (snappy) {
    for (let t = 0; t < seconds; t += beat) {
      // kick: a falling sine thump
      const s = Math.floor(t * RATE)
      for (let k = 0; k < RATE * 0.25; k++) { const u = k / RATE; add(s + k, Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-u * 30)) * u) * Math.exp(-u * 14) * 0.32) }
      // hats on the off-beat
      const h = Math.floor((t + beat / 2) * RATE)
      for (let k = 0; k < RATE * 0.04; k++) { const v = noise() * Math.exp(-k / RATE * 120) * 0.05; add(h + k, v * 0.8, v) }
    }
  } else {
    // a soft shaker keeps it moving
    for (let t = beat / 2; t < seconds; t += beat) {
      const s = Math.floor(t * RATE)
      for (let k = 0; k < RATE * 0.08; k++) add(s + k, noise() * Math.sin(Math.PI * k / (RATE * 0.08)) * 0.025)
    }
  }
  // whoosh: filtered noise swelling into each cut, in time with the colour wipe
  for (const c of cuts) {
    const s = Math.floor((c - 0.7) * RATE), m = Math.floor(0.9 * RATE)
    let lp = 0
    for (let k = 0; k < m; k++) {
      const u = k / m, a = 0.02 + 0.25 * u
      lp += a * (noise() - lp)
      const e = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.22
      add(s + k, lp * e * (1 - u), lp * e * u)
    }
  }
  // fade in, a long fade out, then 16-bit stereo
  const pcm = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    const t = i / RATE, g = Math.min(1, t / 0.6) * Math.min(1, (seconds - t) / 1.8)
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 30000), i * 4)
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 30000), i * 4 + 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40)
  writeFileSync(file, Buffer.concat([head, pcm]))
}

// Lays the music, the voice lines (each at its start time) and the sound effects under the
// silent video. The music ducks under the voice; `silence` windows ([from, to] seconds) are
// true silence in the music (a trailer's hard stop), whatever made the music.
export async function mix({ ffmpeg, env, video, musicFile, voices = [], fx = [], silence = [], out }) {
  const lines = voices.filter(v => v?.file), hits = fx.filter(x => x?.file)
  const args = ['-y', '-i', video]
  if (musicFile) args.push('-i', musicFile)
  for (const v of lines) args.push('-i', v.file)
  for (const x of hits) args.push('-i', x.file)
  const f = []
  const m = musicFile ? 1 : null, first = musicFile ? 2 : 1, fxFirst = first + lines.length
  lines.forEach((v, i) => f.push(`[${first + i}]aformat=sample_rates=44100:channel_layouts=stereo,adelay=delays=${Math.round(v.at * 1000)}:all=1,volume=1.6[v${i}]`))
  if (lines.length) f.push(`${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:duration=longest[vo]`)
  const gate = silence.length ? `,${silence.map(([a, b]) => `volume=enable='between(t,${a.toFixed(3)},${b.toFixed(3)})':volume=0`).join(',')}` : ''
  let bed = null
  if (m !== null && lines.length) {
    f.push('[vo]asplit[vk][vm]', `[${m}]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.8${gate}[mu]`, '[mu][vk]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=400[md]', '[md][vm]amix=inputs=2:normalize=0:duration=first[bed]')
    bed = '[bed]'
  } else if (m !== null) { f.push(`[${m}]aformat=sample_rates=44100:channel_layouts=stereo${gate}[bed]`); bed = '[bed]' }
  else if (lines.length) bed = '[vo]'
  hits.forEach((x, i) => f.push(`[${fxFirst + i}]aformat=sample_rates=44100:channel_layouts=stereo,adelay=delays=${Math.round(x.at * 1000)}:all=1,volume=${x.gain ?? 0.9}[x${i}]`))
  if (!bed && !hits.length) return false
  const ins = [bed, ...hits.map((_, i) => `[x${i}]`)].filter(Boolean)
  f.push(ins.length > 1 ? `${ins.join('')}amix=inputs=${ins.length}:normalize=0:duration=${bed ? 'first' : 'longest'},alimiter=limit=0.95[out]` : `${ins[0]}alimiter=limit=0.95[out]`)
  args.push('-filter_complex', f.join(';'), '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out)
  await run(ffmpeg, args, { env, timeout: 180000 })
  return true
}
