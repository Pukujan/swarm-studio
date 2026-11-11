// Character voices: the lines a game's characters call out (spell names, sword
// skills, barks), recorded once from a config file into mp3s the game plays.
//
// The config (for ARES: games/ares/data/heroes.json) names voices once under
// `voices` and gives each hero a `voice`, `barks` and `moves`; any move or bark
// with a `line` gets recorded. Providers:
//   fish        Fish Audio TTS (POST /v1/tts, reference_id = voice, header model)
//   elevenlabs  ElevenLabs TTS (POST /v1/text-to-speech/<voice>)
// Keys: FISH_API_KEY / ELEVENLABS_API_KEY in the environment, or else a lease from
// the Octo vault (OCTO_VAULT_GRANT, the key named by the voice's `vault`), called
// through the vault proxy so the real key never leaves the vault.
//
//   node engine/voice.mjs games/ares/data/heroes.json [--hero runner] [--force] [--dry]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROVIDERS = ['fish', 'elevenlabs']
const VAULT = process.env.OCTO_VAULT_URL || 'https://octodb.design-bakery.com'
// Cloudflare in front of the vault and Fish refuses default script user agents.
const UA = 'curl/8.7.1'

// Every line to record: one job per hero move or bark that has a `line`.
export function voiceJobs(config, { root = '.', hero } = {}) {
  const jobs = []
  for (const [id, h] of Object.entries(config.heroes || {})) {
    if (hero && id !== hero) continue
    const voice = config.voices?.[h.voice]
    if (!voice) throw new Error(`${id}: voice "${h.voice}" is not in voices`)
    if (!PROVIDERS.includes(voice.provider)) throw new Error(`${id}: unknown provider "${voice.provider}"`)
    const add = (key, m) => m?.line && jobs.push({ hero: id, key, text: m.line, voice, out: join(root, 'assets', 'voice', id, `${key}.mp3`) })
    for (const [k, m] of Object.entries(h.moves || {})) {
      add(k, m)
      // a level can rename the move and give it a new line (e.g. its max level)
      for (const [lv, l] of Object.entries(m.fx?.levels || {})) add(`${k}-lv${lv}`, l)
    }
    for (const [k, m] of Object.entries(h.barks || {})) add(`bark-${k}`, m)
  }
  return jobs
}

// The HTTP request for one line, before auth; `target` is the provider URL.
export function ttsRequest(voice, text) {
  if (voice.provider === 'fish') {
    return {
      target: 'https://api.fish.audio/v1/tts',
      headers: { 'content-type': 'application/json', ...(voice.model ? { model: voice.model } : {}) },
      body: JSON.stringify({ text, reference_id: voice.voice, format: 'mp3' }),
    }
  }
  return {
    target: `https://api.elevenlabs.io/v1/text-to-speech/${voice.voice}?output_format=mp3_44100_128`,
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: voice.model || 'eleven_multilingual_v2' }),
  }
}

const ENV_KEY = { fish: 'FISH_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY' }
const leases = new Map()

async function vaultLease(label, baseUrl) {
  const grant = process.env.OCTO_VAULT_GRANT
  if (!grant) throw new Error(`no ${label} key: set an API key or OCTO_VAULT_GRANT`)
  const hit = leases.get(label)
  if (hit) return hit
  const h = { authorization: `Bearer ${grant}`, 'user-agent': UA }
  const open = await (await fetch(`${VAULT}/api/vault/open`, { headers: h })).json()
  const item = (open.items || []).find(i => i.label === label)
  if (!item) throw new Error(`vault has no key named ${label}`)
  const r = await fetch(`${VAULT}/api/vault/open/lease`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ itemId: item.id, baseUrl }) })
  const lease = await r.json()
  if (!lease.rawSecret) throw new Error(`vault lease for ${label} failed (${r.status})`)
  const out = { token: lease.rawSecret, proxy: lease.proxy?.url || `${VAULT}/api/vault/proxy` }
  leases.set(label, out)
  return out
}

// Record one line to an mp3 and return its size in bytes.
export async function speakLine(voice, text, out) {
  const req = ttsRequest(voice, text)
  const key = process.env[ENV_KEY[voice.provider]]
  let url = req.target
  const headers = { ...req.headers, 'user-agent': UA }
  if (key) {
    if (voice.provider === 'fish') headers.authorization = `Bearer ${key}`
    else headers['xi-api-key'] = key
  } else {
    const lease = await vaultLease(voice.vault || ENV_KEY[voice.provider].toLowerCase(), new URL(req.target).origin)
    url = lease.proxy
    headers.authorization = `Bearer ${lease.token}`
    headers['x-octo-target'] = req.target
  }
  const r = await fetch(url, { method: 'POST', headers, body: req.body })
  if (!r.ok) throw new Error(`${voice.provider} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const buf = Buffer.from(await r.arrayBuffer())
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, buf)
  return buf.length
}

// Record every missing line (or all with force). Returns what was done per job.
export async function recordVoices(config, { root = '.', hero, force = false, dry = false, log = console.log } = {}) {
  const done = []
  for (const j of voiceJobs(config, { root, hero })) {
    if (!force && existsSync(j.out)) { done.push({ ...j, status: 'kept' }); continue }
    if (dry) { log(`would record ${j.hero}/${j.key}: ${j.text}`); done.push({ ...j, status: 'dry' }); continue }
    try {
      const bytes = await speakLine(j.voice, j.text, j.out)
      log(`${j.hero}/${j.key} ${bytes} bytes`)
      done.push({ ...j, status: 'recorded', bytes })
    } catch (e) {
      log(`${j.hero}/${j.key} failed: ${e.message}`)
      done.push({ ...j, status: 'failed', error: e.message })
    }
  }
  return done
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) { console.error('usage: node engine/voice.mjs <heroes.json> [--hero id] [--force] [--dry]'); process.exit(2) }
  const hero = args.includes('--hero') ? args[args.indexOf('--hero') + 1] : undefined
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const root = resolve(dirname(file), '..')
  const res = await recordVoices(config, { root, hero, force: args.includes('--force'), dry: args.includes('--dry') })
  const failed = res.filter(r => r.status === 'failed').length
  console.log(`${res.length} lines: ${res.filter(r => r.status === 'recorded').length} recorded, ${res.filter(r => r.status === 'kept').length} kept, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
