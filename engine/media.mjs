// The Film studio's outside services: music and sound effects (ElevenLabs), moving clips
// (Veo and other video models) and pictures (image models). Each one is optional.
//
// Where each comes from, first match wins:
//   1. Hermes already has it: a secret in Hermes's secret scope (passed in by launcher.py),
//      a Hermes MCP connector (ElevenLabs), or a Hermes image or video provider plugin
//      that is signed in (Codex, FAL, xAI, OpenRouter…). Nothing to set up.
//   2. A key the person pasted once in the Film panel, checked, then kept in a mode-0600
//      file under the data dir. Keys never go back to the canvas or into logs.
//   3. Nothing: the built-in path, painted stills with camera moves and the score
//      written in code (engine/score.mjs).

import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { musicPrompt, SFX_TEXT } from './score.mjs'

export const KEYS = {
  elevenlabs: { label: 'ElevenLabs', keyUrl: 'https://elevenlabs.io/app/settings/api-keys', env: 'SWARM_ELEVENLABS_KEY' },
  fal: { label: 'FAL', keyUrl: 'https://fal.ai/dashboard/keys', env: 'FAL_KEY' },
}
// the service, and the key that can switch it on when Hermes has nothing for it
export const SERVICES = {
  music: { label: 'Music', key: 'elevenlabs' },
  clips: { label: 'Clips', key: 'fal' },
  pictures: { label: 'Pictures', key: 'fal' },
}
// the Hermes MCP connector names that are ElevenLabs
export const ELEVEN_MCP = ['elevenlabs', 'eleven-labs', 'elevenlabs-mcp']

// names for Hermes's provider ids, as the chips show them
const NAMES = { 'openai-codex': 'Codex', openai: 'OpenAI', fal: 'FAL', xai: 'xAI', openrouter: 'OpenRouter', deepinfra: 'DeepInfra', krea: 'Krea', 'meta-ai': 'Meta AI', nous: 'Nous' }
const nameOf = id => NAMES[id] || id

const file = dataDir => join(dataDir, 'media-keys.json')
function load(dataDir) {
  try { return JSON.parse(readFileSync(file(dataDir), 'utf8')) } catch { return {} }
}
function save(dataDir, all) {
  writeFileSync(file(dataDir), JSON.stringify(all, null, 2), { mode: 0o600 })
  chmodSync(file(dataDir), 0o600)
}

// Is this key real? ElevenLabs is asked; a FAL key is checked for its shape (id:secret).
export async function verifyKey(name, key, { fetcher = fetch } = {}) {
  key = String(key || '').trim()
  if (!key || /\s/.test(key)) throw new Error('that is not a key')
  if (name === 'elevenlabs') {
    const r = await fetcher('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15000) })
    if (r.status === 401 || r.status === 403) throw new Error('ElevenLabs did not accept that key')
    if (!r.ok) throw new Error(`ElevenLabs answered ${r.status}`)
    return key
  }
  if (name === 'fal') {
    if (!/^[\w-]{8,}:[\w-]{8,}$/.test(key)) throw new Error('a FAL key looks like id:secret')
    return key
  }
  throw new Error('unknown service')
}

export function mediaKeys(dataDir) {
  return {
    has: name => !!load(dataDir)[name]?.key,
    get: name => load(dataDir)[name]?.key || null,
    async set(name, key, opts) {
      if (!KEYS[name]) throw new Error('unknown service')
      const all = load(dataDir)
      if (!key) delete all[name]
      else all[name] = { key: await verifyKey(name, key, opts), t: Date.now() }
      save(dataDir, all)
      return !!key
    },
    // what the Hermes Python helpers get, so a pasted FAL key switches on Hermes's FAL providers;
    // Hermes's own secret wins when it has one
    env(base = process.env) {
      const fal = load(dataDir).fal?.key
      return fal && !base.FAL_KEY ? { FAL_KEY: fal } : {}
    },
  }
}

// Where each service comes from right now. Pure: the server passes what it found.
//   env         the server's environment (SWARM_ELEVENLABS_KEY comes from Hermes's secret scope)
//   keys        mediaKeys(dataDir)
//   mcp         { name: {installed, allowed} } for the ElevenLabs MCP names
//   images      imagegen.py --list providers, videos: videogen.py --list providers
//   picks       the image pick (picks.image), so "off" stays off
export function mediaSources({ env = {}, keys, mcp = {}, images = [], videos = [], imagePick = null }) {
  const pasted = name => !!keys?.has(name)
  const out = {}
  // music
  const server = ELEVEN_MCP.find(n => mcp[n]?.installed)
  if (env.SWARM_ELEVENLABS_KEY) out.music = { on: true, via: 'hermes', by: 'ElevenLabs' }
  else if (server && mcp[server].allowed) out.music = { on: true, via: 'hermes-mcp', by: 'ElevenLabs', server }
  else if (pasted('elevenlabs')) out.music = { on: true, via: 'key', by: 'ElevenLabs' }
  else out.music = { on: false, via: 'built-in', by: 'Studio score', ...(server ? { server, grant: true } : {}) }
  // clips: a signed-in Hermes video provider (a pasted FAL key signs in Hermes's FAL plugin)
  const video = videos.find(v => v.available)
  if (video) out.clips = { on: true, via: video.provider === 'fal' && pasted('fal') && !env.FAL_KEY ? 'key' : 'hermes', by: /veo/i.test(video.model || '') ? 'Veo' : video.label || nameOf(video.provider), provider: video.provider }
  else out.clips = { on: false, via: 'built-in', by: 'Camera moves' }
  // pictures
  const image = imagePick === 'off' ? null : images.find(p => p.available && (!imagePick?.provider || p.provider === imagePick.provider)) || images.find(p => p.available)
  if (image) out.pictures = { on: true, via: image.provider === 'fal' && pasted('fal') && !env.FAL_KEY ? 'key' : 'hermes', by: nameOf(image.provider), provider: image.provider }
  else out.pictures = { on: false, via: 'built-in', by: 'The build\'s art' }
  for (const [k, s] of Object.entries(SERVICES)) out[k] = { label: s.label, key: s.key, keyLabel: KEYS[s.key].label, keyUrl: KEYS[s.key].keyUrl, pasted: pasted(s.key), ...out[k] }
  return out
}

// A path an MCP tool says it wrote (ElevenLabs's MCP saves files and answers with where).
export function pathIn(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? '')
  return /(\/[^\s"'<>]+\.(?:mp3|wav|m4a|ogg))/i.exec(text)?.[1] || null
}

// The score through Hermes's ElevenLabs MCP connector: same prompt, same cue sheet as the
// direct API, but Hermes holds the key. `call(server, tool, args)` is hermesConnectors().call.
export async function mcpScore({ call, server, music, cues, seconds, dir }) {
  const out = { music: null, sfx: [] }
  const ms = Math.max(10000, Math.min(300000, Math.ceil(seconds * 1000)))
  const got = await call(server, 'compose_music', { prompt: musicPrompt(music, cues, seconds), music_length_ms: ms, output_directory: dir })
  const p = pathIn(got)
  if (!p || !existsSync(p)) throw new Error('the ElevenLabs connector wrote no music file')
  out.music = join(dir, `score-eleven${p.slice(p.lastIndexOf('.'))}`)
  if (p !== out.music) copyFileSync(p, out.music)
  const kinds = [...new Set((cues.sfx || []).map(x => x.kind))].slice(0, 6)
  const files = {}
  await Promise.all(kinds.map(async k => {
    try {
      const f = pathIn(await call(server, 'text_to_sound_effects', { text: SFX_TEXT[k] || k, duration_seconds: k === 'boom' ? 3 : k === 'riser' ? 2 : 1, output_directory: dir }))
      if (f && existsSync(f)) files[k] = f
    } catch {}
  }))
  for (const x of cues.sfx || []) if (files[x.kind]) out.sfx.push({ file: files[x.kind], at: Math.max(0, x.at - (x.kind === 'riser' ? 1.8 : x.kind === 'whoosh' ? 0.4 : 0)) })
  return out
}

// The stills a film animates: story beats on painted stills that have no clip yet, at most
// `max`, so a cut never spends on more than a few clips. Each comes with its motion line.
export function clipJobs(scenes, images, flowDir, max = 3) {
  const out = []
  for (const s of scenes) {
    if (out.length >= max) break
    if (s.layer !== 'story' || !(s.kind === 'image' || s.kind === 'split') || !s.image) continue
    const still = images.find(x => x.n === s.image)
    if (!still?.file || !existsSync(still.file)) continue
    const clip = join(flowDir, `${basename(still.file).replace(/\.[^.]+$/, '')}.mp4`)
    if (existsSync(clip) || out.some(j => j.clip === clip)) continue
    out.push({ still: still.file, clip, seconds: s.seconds > 4.5 ? 8 : 4, prompt: `${still.gen ? `${still.gen}. ` : ''}${(s.camera || 'slow push-in').replace('-', ' ')}, one continuous shot, small motions only, nothing appears or changes shape, no text` })
  }
  return out
}
