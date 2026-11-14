import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { parseInfo, pickTimes, parseScenes, parseChecks, mediaCaps, readPlan, readMessages, readSays, defaultMedia, TESTED, READ_LIMITS, readMedia } from '../engine/mediareader.mjs'
import { filmChecks, recall, cutTimes, verdict, CRITIC } from '../engine/filmcritic.mjs'

// real ffmpeg output (pinned ffmpeg 4.x, darwin-arm64)
const CLIP = `  Duration: 00:00:05.00, start: 0.000000, bitrate: 73 kb/s
  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 640x360 [SAR 1:1 DAR 16:9], 14 kb/s, 25 fps, 25 tbr, 12800 tbn, 50 tbc (default)
  Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 16000 Hz, mono, fltp, 51 kb/s (default)`
const SONG = `  Duration: 00:03:05.08, start: 0.069063, bitrate: 64 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 192 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 500x500 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn, 90k tbc (attached pic)`
const CHECKS = `[silencedetect @ 0x1] silence_start: 9.81
[silencedetect @ 0x1] silence_end: 11.6 | silence_duration: 1.79
[blackdetect @ 0x13f64fc60] black_start:3.3 black_end:5.16667 black_duration:1.86667
[Parsed_ebur128_0 @ 0x13f704240] t: 17.7 TARGET:-23 LUFS M: -20.2 S: -20.0 I: -20.0 LUFS
[Parsed_ebur128_0 @ 0x13f704240] Summary:

  Integrated loudness:
    I:         -20.1 LUFS
    Threshold: -30.3 LUFS

  True peak:
    Peak:       -1.3 dBFS`

test('parseInfo reads length, picture and sound; a cover picture is not a video', () => {
  assert.deepEqual(parseInfo(CLIP), { seconds: 5, video: { width: 640, height: 360, fps: 25 }, audio: true })
  const s = parseInfo(SONG)
  assert.equal(s.seconds, 185.08)
  assert.equal(s.video, null)
  assert.equal(s.audio, true)
  assert.deepEqual(parseInfo('garbage'), { seconds: null, video: null, audio: false })
})

test('pickTimes keeps cuts, fills with an even spread, stays inside the clip and in order', () => {
  const t = pickTimes(20, [3.3, 7.0, 12.1], 6)
  assert.equal(t.length, 6)
  assert.deepEqual([...t].sort((a, b) => a - b), t)
  for (const c of [3.5, 7.2, 12.3]) assert.ok(t.includes(c), `a frame just after the cut at ${c - 0.2}`)
  assert.ok(t.every(x => x > 0 && x < 20))
  // more cuts than frames: spread over the cuts
  const many = pickTimes(60, Array.from({ length: 40 }, (_, i) => i * 1.5 + 1), 10)
  assert.equal(many.length, 10)
  assert.ok(many.at(-1) - many[0] > 40)
  // a tiny clip still gets a frame; nothing for no length
  assert.ok(pickTimes(0.4, [], 10).length >= 1)
  assert.deepEqual(pickTimes(0, [], 10), [])
})

test('parseScenes and parseChecks read ffmpeg output', () => {
  assert.deepEqual(parseScenes('x pts_time:3.3 y pts_time:5.16667'), [3.3, 5.16667])
  const c = parseChecks(CHECKS)
  assert.equal(c.lufs, -20.1, 'the summary, not a running value')
  assert.equal(c.peak, -1.3)
  assert.deepEqual(c.blacks, [[3.3, 5.16667]])
  assert.deepEqual(c.silences, [[9.81, 11.6]])
})

test('mediaCaps: tested models first, then the endpoint listing; nothing guessed', () => {
  assert.equal(mediaCaps('mimotp/mimo-v2.6-flash').audio, true)
  assert.equal(mediaCaps('mimotp/mimo-v2.6-flash').video, false)
  assert.equal(mediaCaps('cb/minimax-m3').video, true)
  assert.equal(mediaCaps('cb/minimax-m3').source, 'tested')
  const listed = mediaCaps('x/omni', { modality: 'text,image,audio,video' })
  assert.deepEqual([listed.audio, listed.video, listed.source], [true, true, 'listed'])
  assert.equal(mediaCaps('x/unknown').source, 'unknown')
  assert.equal(mediaCaps(null).audio, false)
  assert.equal(defaultMedia(['a', 'cb/minimax-m3', 'mimotp/mimo-v2.6-flash']), 'mimotp/mimo-v2.6-flash')
  assert.equal(defaultMedia(['a']), null)
  for (const [m, t] of Object.entries(TESTED)) assert.ok(t.audio || t.video, `${m} passed something`)
})

test('readPlan: sound to a model that hears, a small clip whole, else frames plus sound, else frames to vision', () => {
  const hears = mediaCaps('mimotp/mimo-v2.6-flash'), sees = mediaCaps('cb/minimax-m3'), none = mediaCaps(null)
  const clip = { seconds: 12, bytes: 4e6, video: { width: 640, height: 360 }, audio: true }
  assert.deepEqual(readPlan('audio', { seconds: 30, audio: true }, hears), { plan: 'sound', who: 'media', why: '' })
  assert.equal(readPlan('audio', { seconds: 30, audio: true }, sees).plan, 'none')
  assert.deepEqual(readPlan('video', clip, sees), { plan: 'video', who: 'media', sound: 'none' })
  assert.deepEqual(readPlan('video', clip, hears), { plan: 'frames', who: 'media', sound: 'part' })
  assert.deepEqual(readPlan('video', clip, none, { vision: true }), { plan: 'frames', who: 'vision', sound: 'none' })
  assert.equal(readPlan('video', clip, none).plan, 'none')
  // too big or too long to send whole: frames
  assert.equal(readPlan('video', { ...clip, bytes: READ_LIMITS.videoBytes + 1 }, sees).plan, 'frames')
  assert.equal(readPlan('video', { ...clip, seconds: READ_LIMITS.watchSeconds + 1 }, sees).plan, 'frames')
  // a "video" with no picture is read as a sound
  assert.equal(readPlan('video', { seconds: 30, audio: true, video: null }, hears).plan, 'sound')
})

test('readSays never hides what was not read', () => {
  assert.equal(readSays({ by: 'none', why: 'no model that hears is set' }), 'not read: no model that hears is set')
  assert.equal(readSays({ by: 'media', saw: 'frames', frames: 9, heard: 'sound', hasSound: true }), 'saw 9 frames of it and heard its sound (words and music)')
  assert.equal(readSays({ by: 'vision', saw: 'frames', frames: 9, heard: 'none', hasSound: true }), 'saw 9 frames of it; nothing here could hear its sound')
  assert.equal(readSays({ by: 'media', saw: 'video', heard: 'none', hasSound: false }), 'watched the clip; it has no sound')
  assert.equal(readSays({ by: 'media', saw: 'none', heard: 'sound' }), 'listened to it: words, music and tone')
  assert.equal(readSays({ by: 'media', saw: 'none', heard: 'words' }), 'heard the words, not the music')
})

test('filmChecks names black stretches, silences, level, cuts off the beat and a voice that does not match', () => {
  const board = { lengths: [2, 2, 2, 2, 2], voice: 'af', scenes: [{ say: 'Orange lanterns at the harbor' }, {}, { say: 'seven o clock tonight' }, {}, {}] }
  const beats = Array.from({ length: 21 }, (_, i) => i * 0.5)
  const good = filmChecks({ m: { seconds: 10, hasSound: true, lufs: -16, peak: -1.5, blacks: [], silences: [] }, cuts: [2.01, 4.0, 6.02, 7.99], beats, beatSure: true, board, heard: 'orange lanterns at the harbor at seven o clock tonight' })
  assert.ok(good.every(c => c.ok), JSON.stringify(good))
  assert.equal(verdict(good).says, 'it plays clean')
  const bad = filmChecks({ m: { seconds: 10, hasSound: true, lufs: -31, peak: -0.1, blacks: [[3.3, 5.17]], silences: [[5, 7]] }, cuts: [2.25, 4.26, 6.24, 8.24], beats, beatSure: true, board, heard: 'something else entirely' })
  const by = Object.fromEntries(bad.map(c => [c.id, c]))
  assert.match(by.black.says, /1\.9 s at 0:03/)
  assert.equal(by.silence.ok, false)
  assert.match(by.level.says, /too quiet/)
  assert.equal(by.beat.ok, false)
  assert.equal(by.voice.ok, false)
  assert.match(verdict(bad).says, /^5 things to fix/)
  // what could not be checked says so, and is not a fault
  const blind = filmChecks({ m: { seconds: 10, hasSound: true, lufs: -16, peak: -2, blacks: [], silences: [] }, cuts: [], beats: [], beatSure: false, board, heard: null })
  const v = verdict(blind)
  assert.equal(v.ok, true)
  assert.ok(v.unchecked.some(u => /voice: .*no model that hears/.test(u)))
  assert.ok(v.unchecked.some(u => /beat: .*no clear beat/.test(u)))
  // a planned quiet passage is not a fault; a short black beat is not either
  const quiet = filmChecks({ m: { seconds: 10, hasSound: true, lufs: -16, peak: -2, blacks: [[1, 1.6]], silences: [[5, 6.5]] }, board: { lengths: [10], cues: { silence: [[4.8, 6.6]] } } })
  assert.ok(quiet.every(c => c.ok !== false), JSON.stringify(quiet))
  // a silent film with music asked for is a fault
  assert.equal(filmChecks({ m: { seconds: 10, hasSound: false, blacks: [] }, board: {} }).find(c => c.id === 'sound').ok, false)
})

test('recall and cutTimes', () => {
  assert.equal(recall('Orange lanterns at the harbor', 'orange lanterns by the harbour'), 0.75)
  assert.equal(recall('', 'x'), null)
  assert.deepEqual(cutTimes([2, 3, 1.5]), [2, 5])
  assert.ok(CRITIC.black > 0.5)
})

// With the pinned ffmpeg (on a machine that has it): a real clip read end to end, the model faked
const FF = [process.env.FFMPEG, join(process.env.HOME || '', '.hermes/swarm-studio/video-tools/bin/ffmpeg')].find(p => p && existsSync(p))
test('readMedia reads a real clip as frames plus sound, and says so', { skip: !FF && 'no ffmpeg here' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mr-'))
  try {
    const clip = join(dir, 'clip.mp4')
    execFileSync(FF, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x180:d=4:r=25', '-f', 'lavfi', '-i', 'color=c=red:s=60x60:d=4:r=25', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-filter_complex', "[0:v][1:v]overlay=x='20+t*60':y=60,format=yuv420p[v]", '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', clip])
    let sent = null
    const r = await readMedia({ ffmpeg: FF, file: clip, kind: 'video', tmp: dir, caps: mediaCaps('mimotp/mimo-v2.6-flash'), ask: async (who, messages) => { sent = { who, messages }; return 'A red square slides right; a steady tone.' } })
    assert.equal(r.by, 'media')
    assert.equal(r.saw, 'frames')
    assert.equal(r.heard, 'sound')
    assert.ok(r.frames >= 3)
    const parts = sent.messages[0].content
    assert.equal(parts.filter(p => p.type === 'image_url').length, r.frames)
    assert.equal(parts.filter(p => p.type === 'input_audio').length, 1)
    assert.equal(readSays(r), `saw ${r.frames} frames of it and heard its sound (words and music)`)
    // the same clip to a model that only sees: no sound is claimed
    const v = await readMedia({ ffmpeg: FF, file: clip, kind: 'video', tmp: join(dir, 'b'), caps: mediaCaps(null), vision: true, ask: async () => 'A red square.' })
    assert.equal(readSays(v), `saw ${v.frames} frames of it; nothing here could hear its sound`)
    // no model answering is said too
    const n = await readMedia({ ffmpeg: FF, file: clip, kind: 'video', tmp: join(dir, 'c'), caps: mediaCaps('cb/minimax-m3'), ask: async () => '' })
    assert.equal(n.by, 'none')
    assert.match(readSays(n), /the media model did not answer/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('readMessages puts the clip whole when the plan says video', () => {
  const m = readMessages('video', { plan: 'video', sound: 'none' }, { video: fileURLToPath(import.meta.url) })
  assert.equal(m[0].content[1].type, 'video_url')
  assert.match(m[0].content[0].text, /Do not guess the sound/)
})
