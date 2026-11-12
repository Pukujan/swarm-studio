import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, statSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cueSheet } from '../engine/storyboard.mjs'
import { mediaKeys, mediaSources, verifyKey, mcpScore, clipJobs, pathIn } from '../engine/media.mjs'

const tmp = () => mkdtempSync(join(tmpdir(), 'media-'))
const ok = async () => ({ ok: true, status: 200 })

test('with nothing connected, every service falls back to the built-in path', () => {
  const m = mediaSources({ env: {}, keys: mediaKeys(tmp()) })
  assert.equal(m.music.on, false)
  assert.equal(m.music.via, 'built-in')
  assert.equal(m.clips.via, 'built-in')
  assert.equal(m.pictures.via, 'built-in')
  assert.equal(m.music.keyLabel, 'ElevenLabs')
  // clips and pictures take no key here: their keys belong to Hermes
  assert.deepEqual([m.clips.key, m.pictures.key], [null, null])
  assert.match(m.clips.hint, /hermes tools/)
})

test('what Hermes already has is used first, with no setup', () => {
  const keys = mediaKeys(tmp())
  // a secret in Hermes's secret scope
  assert.equal(mediaSources({ env: { SWARM_ELEVENLABS_KEY: 'x' }, keys }).music.via, 'hermes')
  // Hermes's ElevenLabs MCP connector, already granted
  const viaMcp = mediaSources({ env: {}, keys, mcp: { elevenlabs: { installed: true, allowed: true } } }).music
  assert.deepEqual([viaMcp.on, viaMcp.via, viaMcp.server], [true, 'hermes-mcp', 'elevenlabs'])
  // installed but not granted to the studio yet: one press, no key
  const grant = mediaSources({ env: {}, keys, mcp: { elevenlabs: { installed: true, allowed: false } } }).music
  assert.deepEqual([grant.on, grant.grant], [false, true])
  // Hermes's own video and image tools, through the bridge
  const m = mediaSources({ env: {}, keys, videos: [{ provider: 'hermes', label: 'Hermes', available: true }], images: [{ provider: 'hermes', available: true }] })
  assert.deepEqual([m.clips.on, m.clips.via, m.clips.by, m.clips.provider], [true, 'hermes', 'Hermes', 'hermes'])
  assert.deepEqual([m.pictures.on, m.pictures.via], [true, 'hermes'])
  // an image pick of "off" stays off
  assert.equal(mediaSources({ env: {}, keys, images: [{ provider: 'openai-codex', available: true }], imagePick: 'off' }).pictures.on, false)
})

test('a pasted key is checked, kept private, and switches the service on', async () => {
  const dir = tmp(), keys = mediaKeys(dir)
  await assert.rejects(keys.set('elevenlabs', 'sk_bad', { fetcher: async () => ({ ok: false, status: 401 }) }), /did not accept/)
  // a FAL key is Hermes's to hold: the studio takes none
  await assert.rejects(keys.set('fal', 'abcdefgh-1234:0123456789abcdef'), /unknown service/)
  await keys.set('elevenlabs', 'sk_live_1234', { fetcher: ok })
  assert.equal(statSync(join(dir, 'media-keys.json')).mode & 0o777, 0o600)
  const m = mediaSources({ env: {}, keys, videos: [{ provider: 'hermes', available: true }] })
  assert.deepEqual([m.music.on, m.music.via, m.music.pasted], [true, 'key', true])
  assert.equal(m.clips.via, 'hermes')
  // nothing the canvas sees holds a key
  assert.doesNotMatch(JSON.stringify(m), /sk_live/)
  assert.equal(keys.env, undefined, 'no key is handed to a Python helper any more')
  await keys.set('elevenlabs', null)
  assert.equal(keys.has('elevenlabs'), false)
  assert.doesNotMatch(readFileSync(join(dir, 'media-keys.json'), 'utf8'), /sk_live/)
  // ElevenLabs is asked with its own header
  let seen = null
  await verifyKey('elevenlabs', 'sk_x', { fetcher: async (_u, init) => { seen = init.headers; return { ok: true, status: 200 } } })
  assert.equal(seen['xi-api-key'], 'sk_x')
})

test('the score goes through Hermes\'s ElevenLabs connector, which holds the key', async () => {
  const dir = tmp(), calls = []
  const call = async (server, tool, args) => {
    calls.push([server, tool, args])
    const f = join(args.output_directory, tool === 'compose_music' ? 'track_1.mp3' : `fx_${calls.length}.mp3`)
    writeFileSync(f, 'mp3')
    return `Success. File saved as: ${f}. Voice used: none`
  }
  const cues = cueSheet([{ cue: 'pulse' }, { cue: 'hit', sfx: ['whoosh'] }, { cue: 'stop' }, { cue: 'drop', sfx: ['boom'] }, { cue: 'resolve', sfx: ['boom'] }], [2, 2, 1, 2, 2])
  const out = await mcpScore({ call, server: 'elevenlabs', music: { bpm: 128, mood: 'scary but cute' }, cues, seconds: 9, dir })
  assert.equal(out.music, join(dir, 'score-eleven.mp3'))
  assert.ok(existsSync(out.music))
  assert.equal(calls[0][1], 'compose_music')
  assert.match(calls[0][2].prompt, /128 BPM/)
  assert.equal(calls[0][2].music_length_ms, 10000)
  assert.equal(calls.filter(c => c[1] === 'text_to_sound_effects').length, 2, 'one effect per kind')
  assert.equal(out.sfx.length, cues.sfx.length)
  assert.equal(pathIn('saved to /tmp/x.wav'), '/tmp/x.wav')
  await assert.rejects(mcpScore({ call: async () => 'no file', server: 'elevenlabs', music: {}, cues, seconds: 5, dir }), /no music file/)
})

test('a few story stills are animated, never more, never twice', () => {
  const dir = tmp(), flow = join(dir, 'flow')
  const images = [1, 2, 3, 4, 5].map(n => { const file = join(dir, `still-${n}.webp`); writeFileSync(file, 'x'); return { n, file, gen: `shot ${n}` } })
  const scenes = [
    { kind: 'image', layer: 'story', image: 1, camera: 'push-in', seconds: 2 },
    { kind: 'image', layer: 'proof', image: 2, seconds: 2 },
    { kind: 'title', layer: 'type', seconds: 1 },
    { kind: 'image', layer: 'story', image: 3, camera: 'pan-left', seconds: 6 },
    { kind: 'split', layer: 'story', image: 4, seconds: 2 },
    { kind: 'image', layer: 'story', image: 5, seconds: 2 },
  ]
  const jobs = clipJobs(scenes, images, flow, 3)
  assert.deepEqual(jobs.map(j => j.still.match(/still-(\d)/)[1]), ['1', '3', '4'])
  assert.equal(jobs[0].clip, join(flow, 'still-1.mp4'))
  assert.equal(jobs[1].seconds, 8)
  assert.match(jobs[1].prompt, /pan left, one continuous shot/)
})
