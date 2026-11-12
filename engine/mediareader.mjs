// The media reader (spec 32): how a clip or a sound a person gives the crew is watched and heard, and how
// the crew checks its own films and sounds the same way. Two layers:
//
//   1. With what is always here: the pinned ffmpeg samples frames (scene changes plus even spacing) for the
//      vision model to look at, and measures the sound (loudness, silences, black stretches) without any model.
//   2. A media model (the `media` pick) that takes audio and/or video itself: the sound is sent as sound
//      (music, tempo, instruments, tone of voice), a video as video when it is small enough.
//
// Every read says what happened ("saw 9 frames, could not hear it"); "not read" is never silent.
// The person's media goes only to the model they chose: the media pick, else the reviewer's vision model.

import { execFile } from './proc.mjs'
import { mkdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// The limits, in one place (shown in the report and the docs)
export const READ_LIMITS = {
  frames: 10, // frames sampled from a clip
  frameWidth: 512, // pixels across each frame
  sceneThreshold: 0.3, // ffmpeg's scene score for a cut
  listenSeconds: 120, // the most of a sound (or a clip's soundtrack) sent to the media model
  watchSeconds: 60, // a clip longer than this is sent as frames plus its sound, never whole
  videoBytes: 15e6, // the most a clip may weigh to be sent whole to the media model
  probeSeconds: 900 // a file longer than this is only described by its length
}

// Media models that passed the 5-second audio and video tests (docs/specs/32-media-reader.md, 2026-11-12).
// `video` means the clip itself (video_url data URL); `videoSound` means it also heard the clip's soundtrack.
// A model not listed falls back to what its endpoint's /models says it takes.
// Tested at InferHub with a 5 s mp3 (input_audio, base64) and a 5 s 640x360 mp4 (video_url, data URL).
// Blocked by the key's price cap that day, so not tested: ali/ and alicn/qwen3.8-omni-flash, ocg/mimo-*,
// mimo/mimo-v2.6-flash; cb/gemini-3.1-pro had no free provider.
export const TESTED = {
  'mimotp/mimo-v2.6-flash': { audio: true, image: true, video: false, videoSound: false }, // frames and sound in one call
  'ali/qwen3.8-27b': { audio: false, image: true, video: true, videoSound: false },
  'cb/minimax-m3': { audio: false, image: true, video: true, videoSound: false },
  'cb/kimi-k3': { audio: false, image: true, video: true, videoSound: false },
  'zai/glm-5.3-flash': { audio: false, image: true, video: true, videoSound: false }
}
// the media model used when none is picked: the first one the endpoint offers
export const MEDIA_PREFER = ['mimotp/mimo-v2.6-flash', 'ali/qwen3.8-omni-flash', 'alicn/qwen3.8-omni-flash', 'mimo/mimo-v2.6-flash', 'ali/qwen3.8-27b', 'cb/minimax-m3']
export const defaultMedia = (offered = []) => MEDIA_PREFER.find(m => offered.includes(m)) || null

const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
// proc.mjs gives ffmpeg only the minimal environment (catalog review point 3)
const ff = (ffmpeg, args, { timeout = 120000, buffer = false } = {}) => new Promise(resolve => execFile(ffmpeg, args, { timeout, maxBuffer: 1 << 26, encoding: buffer ? 'buffer' : 'utf8' }, (err, stdout, stderr) => resolve({ err, stdout, stderr: String(stderr || '') })))

// ---------- what a file is: its length, picture size and whether it has sound
export function parseInfo(stderr) {
  const s = String(stderr || '')
  const d = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const seconds = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null
  const v = s.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/)
  const fps = s.match(/Stream #[^\n]*Video:[^\n]*?(\d+(?:\.\d+)?) fps/)
  // a cover picture inside an mp3 shows as a video stream marked attached pic: that is not a video
  const still = /Video:[^\n]*\(attached pic\)/.test(s) || /Video: (png|mjpeg)[^\n]*\n[^\n]*attached pic/.test(s)
  return {
    seconds: seconds && Number(seconds.toFixed(3)),
    video: v && !still ? { width: Number(v[1]), height: Number(v[2]), fps: fps ? Number(fps[1]) : null } : null,
    audio: /Stream #[^\n]*Audio:/.test(s)
  }
}
export async function mediaInfo(ffmpeg, file) {
  const { stderr } = await ff(ffmpeg, ['-hide_banner', '-i', file], { timeout: 20000 })
  return { ...parseInfo(stderr), bytes: existsSync(file) ? statSync(file).size : 0 }
}

// ---------- frames: the scene changes and an even spread, thinned to `max`, in time order
export function pickTimes(seconds, scenes = [], max = READ_LIMITS.frames) {
  if (!(seconds > 0) || max < 1) return []
  const edge = Math.min(0.25, seconds / 10)
  const even = Array.from({ length: max }, (_, i) => edge + ((seconds - 2 * edge) * (i + 0.5)) / max)
  // a frame just after each cut (the cut itself is often a blend), and the even spread fills the gaps
  const cuts = scenes.filter(t => t > edge && t < seconds - edge).map(t => Math.min(seconds - edge, t + 0.2))
  const all = [...cuts.map(t => ({ t, cut: true })), ...even.map(t => ({ t, cut: false }))].sort((a, b) => a.t - b.t)
  // keep the cuts first, then the even points that are furthest from anything kept
  const kept = cuts.length > max ? thin(cuts, max) : [...cuts]
  const far = t => Math.min(Infinity, ...kept.map(k => Math.abs(k - t)))
  const rest = all.filter(x => !x.cut).map(x => x.t)
  while (kept.length < max && rest.length) {
    rest.sort((a, b) => far(b) - far(a))
    const t = rest.shift()
    if (kept.length && far(t) < Math.min(0.4, seconds / (max * 3))) break
    kept.push(t)
  }
  return [...new Set(kept.map(t => Number(t.toFixed(2))))].sort((a, b) => a - b)
}
// `n` of the sorted times, spread evenly
function thin(times, n) {
  const s = [...times].sort((a, b) => a - b)
  return Array.from({ length: n }, (_, i) => s[Math.round((i * (s.length - 1)) / Math.max(1, n - 1))])
}

export function parseScenes(stderr) {
  return [...String(stderr || '').matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]))
}
export async function sceneTimes(ffmpeg, file, { threshold = READ_LIMITS.sceneThreshold } = {}) {
  const { stderr } = await ff(ffmpeg, ['-hide_banner', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { timeout: 180000 })
  return parseScenes(stderr)
}

// JPEG frames at the times picked, `width` across; [{ t, file }]
export async function sampleFrames(ffmpeg, file, outDir, { seconds = null, max = READ_LIMITS.frames, width = READ_LIMITS.frameWidth } = {}) {
  mkdirSync(outDir, { recursive: true })
  const len = seconds ?? (await mediaInfo(ffmpeg, file)).seconds
  const times = pickTimes(len, await sceneTimes(ffmpeg, file), max)
  const out = []
  for (const [i, t] of times.entries()) {
    const f = join(outDir, `frame-${String(i).padStart(2, '0')}.jpg`)
    const r = await ff(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', f], { timeout: 30000 })
    if (!r.err && existsSync(f)) out.push({ t, file: f })
  }
  return out
}

// The sound as a small mp3 (mono, 16 kHz, 48 kb/s: about 360 KB a minute), at most `seconds` long
export async function soundClip(ffmpeg, file, out, { seconds = READ_LIMITS.listenSeconds } = {}) {
  const r = await ff(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', file, '-vn', '-t', String(seconds), '-ac', '1', '-ar', '16000', '-b:a', '48k', out], { timeout: 120000 })
  return !r.err && existsSync(out) ? out : null
}

// ---------- the sound and picture measured without a model: loudness, silences, black stretches
export function parseChecks(stderr) {
  const s = String(stderr || '')
  const num = re => { const m = s.match(re); return m ? Number(m[1]) : null }
  const pairs = (start, end) => {
    const a = [...s.matchAll(start)].map(m => Number(m[1])), b = [...s.matchAll(end)].map(m => Number(m[1]))
    return a.map((x, i) => [x, b[i] ?? null])
  }
  // ebur128's summary comes last: take the integrated loudness and the true peak from it
  const summary = s.slice(s.lastIndexOf('Summary:') >= 0 ? s.lastIndexOf('Summary:') : 0)
  const lufs = summary.match(/I:\s+(-?\d+(?:\.\d+)?) LUFS/)
  const peak = summary.match(/Peak:\s+(-?(?:\d+(?:\.\d+)?|inf)) dBFS/)
  return {
    lufs: lufs ? Number(lufs[1]) : null,
    peak: peak ? (peak[1] === '-inf' ? -Infinity : Number(peak[1])) : null,
    silences: pairs(/silence_start:\s*(-?\d+(?:\.\d+)?)/g, /silence_end:\s*(-?\d+(?:\.\d+)?)/g).map(([a, b]) => [Math.max(0, a), b]),
    blacks: [...s.matchAll(/black_start:(\d+(?:\.\d+)?) black_end:(\d+(?:\.\d+)?)/g)].map(m => [Number(m[1]), Number(m[2])]),
    volume: num(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/)
  }
}
export async function measure(ffmpeg, file, { video = true, audio = true } = {}) {
  const args = ['-hide_banner', '-nostats', '-i', file]
  if (audio) args.push('-af', 'ebur128=peak=true,silencedetect=n=-45dB:d=0.8')
  else args.push('-an')
  if (video) args.push('-vf', 'blackdetect=d=0.5:pix_th=0.05:pic_th=0.999')
  else args.push('-vn')
  args.push('-f', 'null', '-')
  const { stderr } = await ff(ffmpeg, args, { timeout: 300000 })
  const c = parseChecks(stderr)
  // a still-open silence runs to the end
  return c
}

// ---------- what the media model can take: the tests first, then what the endpoint says
export function mediaCaps(model, listed = null) {
  if (!model) return { audio: false, video: false, videoSound: false, image: false, source: 'none' }
  const t = TESTED[model] || TESTED[String(model).replace(/^[a-z]+\//, '')]
  if (t) return { audio: !!t.audio, video: !!t.video, videoSound: !!t.videoSound, image: t.image !== false, source: 'tested' }
  const m = String(listed?.modality || '')
  if (m) return { audio: /audio/.test(m), video: /video/.test(m), videoSound: false, image: /image/.test(m), source: 'listed' }
  return { audio: false, video: false, videoSound: false, image: false, source: 'unknown' }
}

// what a media model takes, in the words Setup and Settings show
export function takesSays(caps) {
  if (!caps || (!caps.audio && !caps.video && !caps.image)) return 'nothing yet: clips and sounds are kept, not read'
  const parts = [caps.audio && 'hears sound', caps.video ? 'watches video' : caps.image && 'sees frames of a clip'].filter(Boolean)
  return parts.join(', ') + (caps.source === 'listed' ? ' (as its provider lists it, not tested here)' : caps.source === 'unknown' ? ' (not known)' : '')
}

// ---------- the messages a model reads a clip or a sound with
const b64 = f => readFileSync(f).toString('base64')
export const audioPart = file => ({ type: 'input_audio', input_audio: { data: b64(file), format: 'mp3' } })
export const videoPart = (file, mime = 'video/mp4') => ({ type: 'video_url', video_url: { url: `data:${mime};base64,${b64(file)}` } })
export const imagePart = file => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64(file)}` } })

const ASK = {
  video: 'A person gave this clip to a designer as a reference. Describe it in at most 90 words: what happens, the look (colours, light, framing, style), the pace of the cuts, and any words on screen.',
  sound: 'Then, in at most 50 words: the sound. The music (mood, tempo in BPM if you can tell, instruments), the voice (words said, tone) and anything else heard.',
  audio: 'A person gave this sound to a designer as a reference. In at most 80 words: the words said (quote them if short), the tone of voice, the music (mood, tempo in BPM if you can tell, instruments, genre) and anything else heard.',
  frames: n => `These are ${n} frames sampled in order from a clip (at the cuts and evenly between). Describe the clip in at most 90 words: what happens, the look (colours, light, framing, style), how it changes, and any words on screen. You only see frames: do not guess the sound.`
}

// How a clip or sound is read with what is set: { plan: 'video'|'frames+sound'|'frames'|'sound'|'none', ... }
export function readPlan(kind, info, caps, { vision = false } = {}) {
  const long = info.seconds > READ_LIMITS.probeSeconds
  if (kind === 'audio') {
    if (!info.audio) return { plan: 'none', why: 'it has no sound in it' }
    if (caps.audio) return { plan: 'sound', who: 'media', why: long ? `only the first ${READ_LIMITS.listenSeconds / 60} minutes` : '' }
    return { plan: 'none', why: 'no model that hears is set' }
  }
  if (!info.video) return info.audio ? readPlan('audio', info, caps, { vision }) : { plan: 'none', why: 'it has no picture or sound' }
  if (caps.video && info.bytes <= READ_LIMITS.videoBytes && info.seconds <= READ_LIMITS.watchSeconds) {
    return { plan: 'video', who: 'media', sound: info.audio && (caps.videoSound ? 'in-video' : caps.audio ? 'part' : 'none') }
  }
  if (caps.image) return { plan: 'frames', who: 'media', sound: info.audio && caps.audio ? 'part' : 'none' }
  if (vision) return { plan: 'frames', who: 'vision', sound: 'none' }
  return { plan: 'none', why: 'no model that sees is set' }
}

export function readMessages(kind, plan, { video = null, frames = [], sound = null } = {}) {
  const content = []
  if (plan.plan === 'sound') content.push({ type: 'text', text: ASK.audio }, audioPart(sound))
  else if (plan.plan === 'video') {
    content.push({ type: 'text', text: ASK.video + (plan.sound && plan.sound !== 'none' ? ' ' + ASK.sound : ' Do not guess the sound.') }, videoPart(video))
    if (plan.sound === 'part' && sound) content.push(audioPart(sound))
  } else if (plan.plan === 'frames') {
    content.push({ type: 'text', text: ASK.frames(frames.length) + (plan.sound === 'part' && sound ? ' The sound of the clip comes after the frames. ' + ASK.sound : '') }, ...frames.map(f => imagePart(f.file)))
    if (plan.sound === 'part' && sound) content.push(audioPart(sound))
  }
  return [{ role: 'user', content }]
}

// What happened, in the words the chat shows ("watched the clip and heard its sound")
export function readSays(r) {
  if (!r || r.by === 'none') return `not read${r?.why ? `: ${r.why}` : ''}`
  const saw = r.saw === 'video' ? 'watched the clip' : r.saw === 'frames' ? `saw ${r.frames} frames of it` : ''
  const heard = r.heard === 'sound' ? 'heard its sound (words and music)' : r.heard === 'words' ? 'heard the words, not the music' : ''
  if (saw && heard) return `${saw} and ${heard}`
  if (saw) return `${saw}; ${r.hasSound ? 'nothing here could hear its sound' : 'it has no sound'}`
  if (heard) return r.heard === 'sound' ? 'listened to it: words, music and tone' : heard
  return 'not read'
}

// Read one clip or sound. ask(model-role, messages) -> text; caps: the media pick's; tmp: a scratch folder
export async function readMedia({ ffmpeg, file, kind, tmp, caps, vision = false, ask }) {
  const info = await mediaInfo(ffmpeg, file)
  if (!info.seconds) return { by: 'none', why: 'it could not be opened', text: '' }
  const plan = readPlan(kind, info, caps, { vision })
  const base = { seconds: info.seconds, hasSound: !!info.audio }
  if (plan.plan === 'none') return { ...base, by: 'none', why: plan.why, text: '' }
  const sound = (plan.plan === 'sound' || plan.sound === 'part') ? await soundClip(ffmpeg, file, join(tmp, 'sound.mp3')) : null
  const frames = plan.plan === 'frames' ? await sampleFrames(ffmpeg, file, join(tmp, 'frames'), { seconds: info.seconds }) : []
  if (plan.plan === 'frames' && !frames.length) return { ...base, by: 'none', why: 'no frames could be taken from it', text: '' }
  const text = clean(await ask(plan.who, readMessages(kind, plan, { video: file, frames, sound })).catch(() => ''), 900)
  if (!text) return { ...base, by: 'none', why: `the ${plan.who === 'media' ? 'media' : 'vision'} model did not answer`, text: '' }
  const heard = plan.plan === 'sound' || (sound && plan.sound === 'part') || plan.sound === 'in-video' ? 'sound' : 'none'
  const saw = plan.plan === 'video' ? 'video' : plan.plan === 'frames' ? 'frames' : 'none'
  return { ...base, by: plan.who === 'media' ? 'media' : 'vision', saw, heard, frames: frames.length, text, short: plan.why || '' }
}
