// Paints pictures through ckff's OpenAI-shaped image API (gpt-image-2.5 by default),
// for when the Hermes image tool's own provider is out of quota. Two ways in:
//
//   node engine/paint-ckff.mjs skins <config.json> <id> <out dir> [--only a,b] [--extra "text"]
//       paints every sheet skinJobs() lists for that hero, boss or enemy, with its design
//       picture as the reference, into <out dir>/<sheet>.png; then cut them with
//       node engine/skins.mjs <config.json> --hero <id> --from <out dir>
//   node engine/paint-ckff.mjs one "<prompt>" <out.png> [--ref a.png --ref b.jpg] [--size 1536x1024]
//
// Existing outputs are kept (delete one to repaint it). --jobs N paints N at a time (default 2).
// Key: CKFF_IMAGE_KEY, else the Octo vault item "ckff-cortex-image-generation" read with
// OCTO_AGENT_KEY from ~/Documents/projects/.env. The key is never printed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { extname, join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { skinJobs } from './skins.mjs'

const BASE = process.env.CKFF_BASE || 'https://ckffai.com/v1'
const VAULT = process.env.OCTO_URL || 'https://octodb.design-bakery.com'

function envFile() {
  const f = join(homedir(), 'Documents', 'projects', '.env'), out = {}
  if (!existsSync(f)) return out
  for (const l of readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^([A-Za-z_][\w]*)=(.*)$/); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '') }
  return out
}
let keyP = null
export function ckffKey() {
  return keyP ||= (async () => {
    if (process.env.CKFF_IMAGE_KEY) return process.env.CKFF_IMAGE_KEY
    const agent = process.env.OCTO_AGENT_KEY || envFile().OCTO_AGENT_KEY
    if (!agent) throw new Error('no CKFF_IMAGE_KEY and no OCTO_AGENT_KEY to read the vault')
    const h = { authorization: `Bearer ${agent}`, 'user-agent': 'octo-env-pull/1' }
    const { items } = await (await fetch(`${VAULT}/api/vault/items`, { headers: h })).json()
    const it = items.find(i => i.label === 'ckff-cortex-image-generation')
    if (!it) throw new Error('vault has no ckff-cortex-image-generation')
    const { item } = await (await fetch(`${VAULT}/api/vault/items/${it.id}`, { headers: h })).json()
    return item.secret
  })()
}

const mime = p => ({ '.png': 'image/png', '.webp': 'image/webp' }[extname(p)] || 'image/jpeg')
export async function paintOne({ prompt, refs = [], out, size = '1536x1024', model = process.env.CKFF_MODEL || 'gpt-image-2.5', tries = 4, log = console.log }) {
  if (existsSync(out)) { log(`${out}: kept`); return out }
  mkdirSync(dirname(out), { recursive: true })
  const key = await ckffKey()
  for (let i = 1; i <= tries; i++) {
    const t0 = Date.now()
    try {
      const body = { model, size, prompt }
      let url = `${BASE}/images/generations`
      if (refs.length) { url = `${BASE}/images/edits`; const im = refs.map(r => `data:${mime(r)};base64,${readFileSync(r).toString('base64')}`); body.image = im.length === 1 ? im[0] : im }
      const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) })
      const j = await r.json().catch(() => ({}))
      const b64 = j.data?.[0]?.b64_json
      if (!r.ok || !b64) throw new Error(`HTTP ${r.status} ${JSON.stringify(j.error || j).slice(0, 160)}`)
      writeFileSync(out, Buffer.from(b64, 'base64'))
      log(`${out}: painted in ${Math.round((Date.now() - t0) / 1000)}s`)
      return out
    } catch (e) {
      log(`${out}: try ${i} failed: ${e.message}`)
      if (i < tries) await new Promise(ok => setTimeout(ok, 4000 * i))
    }
  }
  return null
}

export async function pool(items, n, fn) { const q = [...items]; const res = []; await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const it = q.shift(); res.push(await fn(it)) } })); return res }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2)
  const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d)
  const all = k => a.flatMap((x, i) => (x === k ? [a[i + 1]] : []))
  const jobs = Number(opt('--jobs', 2))
  if (a[0] === 'skins') {
    const [, cfgPath, id, outDir] = a
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
    const root = dirname(dirname(resolve(cfgPath)))
    let list = skinJobs(cfg, { root, hero: id, only: opt('--only')?.split(',') })
    const extra = opt('--extra', '')
    const res = await pool(list, jobs, j => paintOne({ prompt: extra ? `${j.prompt} ${extra}` : j.prompt, refs: j.refs, out: join(outDir, `${j.sheet}.png`) }))
    const bad = res.filter(r => !r).length
    console.log(`${list.length} sheets: ${list.length - bad} painted, ${bad} failed`)
    process.exit(bad ? 1 : 0)
  } else if (a[0] === 'one') {
    const r = await paintOne({ prompt: a[1], out: a[2], refs: all('--ref'), size: opt('--size', '1536x1024') })
    process.exit(r ? 0 : 1)
  } else { console.error('usage: node engine/paint-ckff.mjs skins <config> <id> <out dir> [--only a,b] [--extra t] [--jobs n] | one "<prompt>" <out.png> [--ref f]... [--size WxH]'); process.exit(2) }
}
