// One picture through ckff's OpenAI-shaped image API (gpt-image-2.5 by default): the studio's
// fallback when no Hermes image provider is signed in or the signed-in one fails (Codex out of
// quota). The key comes from CKFF_API_KEY / CKFF_IMAGE_KEY in the environment, else from
// ~/Documents/projects/.env. It stays in this process and is never printed or logged.
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { extname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

function envFile() {
  const f = join(homedir(), 'Documents', 'projects', '.env'), out = {}
  if (!existsSync(f)) return out
  for (const l of readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^([A-Za-z_]\w*)=(.*)$/); if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '') }
  return out
}
export function ckffCreds(env = process.env) {
  const file = env.CKFF_API_KEY || env.CKFF_IMAGE_KEY ? {} : envFile()
  const key = env.CKFF_API_KEY || env.CKFF_IMAGE_KEY || file.CKFF_API_KEY || file.CKFF_IMAGE_KEY || ''
  const base = (env.CKFF_BASE_URL || file.CKFF_BASE_URL || 'https://ckffai.com/v1').replace(/\/$/, '')
  return key ? { key, base } : null
}

const SIZE = { landscape: '1536x1024', portrait: '1024x1536', square: '1024x1024' }
const mime = p => ({ '.png': 'image/png', '.webp': 'image/webp' }[extname(p).toLowerCase()] || 'image/jpeg')

// -> { ok, path, model } or { ok: false, error }
export async function ckffPaint({ prompt, aspect = 'landscape', refs = [], model = process.env.CKFF_MODEL || 'gpt-image-2.5', fetchImpl = fetch, timeoutMs = 300000 } = {}) {
  const c = ckffCreds()
  if (!c) return { ok: false, error: 'no ckff key' }
  const pics = refs.filter(r => r && existsSync(r)).slice(0, 4)
  // With no picture attached, a prompt that happens to say "repair", "fix" or "edit" (a game item
  // that "charges the repair") was taken upstream for an edit request and refused with "please
  // upload the image to edit". Saying it is a new picture up front stops that.
  const lead = pics.length ? '' : 'Paint a new picture from this description. Nothing is uploaded and nothing is being edited. '
  const body = { model, size: SIZE[aspect] || SIZE.landscape, prompt: (lead + String(prompt)).slice(0, 3800) }
  let url = `${c.base}/images/generations`
  if (pics.length) {
    url = `${c.base}/images/edits`
    const im = pics.map(r => `data:${mime(r)};base64,${readFileSync(r).toString('base64')}`)
    body.image = im.length === 1 ? im[0] : im
  }
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${c.key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    const j = await r.json().catch(() => ({}))
    const b64 = j.data?.[0]?.b64_json
    if (!r.ok || !b64) return { ok: false, error: `ckff HTTP ${r.status}: ${String(j.error?.message || j.error || '').slice(0, 160)}` }
    const out = join(mkdtempSync(join(tmpdir(), 'swarm-ckff-')), 'image.png')
    writeFileSync(out, Buffer.from(b64, 'base64'))
    return { ok: true, path: out, model: `ckff/${model}` }
  } catch (err) {
    return { ok: false, error: `ckff: ${String(err?.message || err).slice(0, 160)}` }
  }
}
