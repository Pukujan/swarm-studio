#!/usr/bin/env node
// Builds the stand-in photo library that ships with the studio:
// engine/stock/themes.json (what to cover) → Pexels search → a vision model
// tags each photo against a fixed schema → the photo goes to the Octo workspace
// and is published on the R2 CDN → engine/stock/library.json (the manifest the
// matcher in engine/standins.mjs reads). Resumable: queries already in the
// manifest are skipped, and the manifest is saved after every query.
//
// Keys (names only; values come from the environment only, never Hermes's own .env; e.g.
// `set -a; . ~/Documents/projects/.env; set +a` first): PEXELS_OCTO_LEASE or PEXELS_API_KEY, OCTO_SWARM_WS,
// and STOCK_VISION_KEY or inferhub_lease for the tagger (through Octo's proxy).
//
//   node scripts/stock-library.mjs [--limit N] [--only cafe,bakery] [--jobs 4] [--dry]

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const THEMES = join(here, '..', 'engine', 'stock', 'themes.json')
const LIB = join(here, '..', 'engine', 'stock', 'library.json')
const UA = 'swarm-feed/1.0'
const OCTO = (process.env.OCTO_BASE_URL || 'https://octodb.design-bakery.com').replace(/\/+$/, '')
const WS = process.env.OCTO_SWARM_WORKSPACE_ID || '9aba6ef6-d196-412f-9344-0efb744b9c6c'
const VISION = process.env.STOCK_VISION_MODEL || 'claude-haiku-5.5'

const arg = (name, d = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : process.argv[i + 1] ?? true }
const limit = Number(arg('limit', 0)) || Infinity
const only = arg('only') ? String(arg('only')).split(',').map(s => s.trim()) : null
const dry = process.argv.includes('--dry')

const key = k => process.env[k] || ''

const pexels = key('PEXELS_API_KEY') ? { url: 'https://api.pexels.com', auth: key('PEXELS_API_KEY') }
  : key('PEXELS_OCTO_LEASE') ? { url: `${OCTO}/api/vault/proxy/https://api.pexels.com`, auth: `Bearer ${key('PEXELS_OCTO_LEASE')}` } : null
const vision = key('STOCK_VISION_KEY') ? { url: (process.env.STOCK_VISION_URL || 'https://api.inferhub.dev/v1').replace(/\/+$/, ''), auth: `Bearer ${key('STOCK_VISION_KEY')}` }
  : key('inferhub_lease') ? { url: `${OCTO}/api/vault/proxy/https://api.inferhub.dev/v1`, auth: `Bearer ${key('inferhub_lease')}` } : null
const octoKey = key('OCTO_SWARM_WS')
for (const [name, v] of [['Pexels key (PEXELS_OCTO_LEASE or PEXELS_API_KEY)', pexels], ['vision key (STOCK_VISION_KEY or inferhub_lease)', vision], ['Octo key (OCTO_SWARM_WS)', octoKey]]) {
  if (!v) { console.error(`missing ${name}`); process.exit(1) }
}

const SHOTS = ['place', 'people', 'work', 'product', 'food', 'detail', 'landscape', 'texture', 'event']
const RULES = `You catalogue stock photos for a website design tool. They stand in for pictures while the real ones are made, so the matcher needs to know exactly what is in each photo and what kind of website it suits. Look at the photo and reply with JSON only:
{"photo": true if it is a clean, modern-looking photograph (false for illustrations, collages, screenshots, heavy text, watermarks, very blurry shots),
 "quality": 1-5 (5 = could be the hero of a polished website),
 "caption": "one plain sentence saying what is in the photo",
 "subjects": ["the main things or people, 1-4 short nouns"],
 "place": "where it is, 1-3 words (e.g. cafe counter, city street, home kitchen)",
 "setting": "indoor" | "outdoor" | "studio",
 "shot": one of ${SHOTS.map(s => `"${s}"`).join(', ')},
 "people": 0 | 1 | 2 | 3 (3 = a group),
 "mood": ["2-3 single words"],
 "light": "bright" | "dark" | "warm" | "cool",
 "copySpace": "left" | "right" | "top" | "bottom" | "center" | "none" (a calm area where a headline could sit),
 "colors": ["up to 3 dominant colours as #rrggbb"],
 "businesses": ["kinds of business whose website could use it, 1-5, lowercase (e.g. cafe, bakery, gym, real estate)"],
 "tags": ["10-16 lowercase single words a person might type when they want this photo"]}`

const lib = existsSync(LIB) ? JSON.parse(readFileSync(LIB, 'utf8')) : { about: '', photos: [] }
lib.about = 'Stand-in photos for the studio, built by scripts/stock-library.mjs. Photos are from Pexels (free to use; credit kept), hosted on the Octo R2 CDN. Never saved into a build.'
const byId = new Map(lib.photos.map(p => [p.id, p]))
const done = new Set(lib.photos.flatMap(p => p.queries || []))
const save = () => { lib.photos.sort((a, b) => a.id.localeCompare(b.id)); writeFileSync(LIB, `{"about": ${JSON.stringify(lib.about)},\n"photos": [\n${lib.photos.map(p => JSON.stringify(p)).join(',\n')}\n]}\n`) }

async function json(url, opts, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) })
      if (r.status === 429) { await new Promise(ok => setTimeout(ok, 30000)); continue }
      if (r.ok) return await r.json()
      const text = r.status < 500 ? await r.text() : ''
      if (r.status < 500 && !/please retry/i.test(text)) throw new Error(`${r.status} ${text.slice(0, 160)}`)
    } catch (e) { if (i === tries - 1) throw e }
    await new Promise(ok => setTimeout(ok, 2000 * (i + 1)))
  }
  throw new Error(`gave up on ${url.split('?')[0]}`)
}

const clean = (a, n, re = /^[a-z][a-z -]{1,30}$/) => (Array.isArray(a) ? a : []).map(x => String(x).toLowerCase().trim()).filter(x => re.test(x)).slice(0, n)

async function tag(bytes) {
  const j = await json(`${vision.url}/chat/completions`, { method: 'POST', headers: { authorization: vision.auth, 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ model: VISION, max_tokens: 700, temperature: 0.1, messages: [{ role: 'system', content: RULES }, { role: 'user', content: [{ type: 'text', text: 'Catalogue this photo.' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}` } }] }] }) })
  const t = String(j.choices?.[0]?.message?.content || '')
  const o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))
  return {
    photo: o.photo !== false, quality: Math.max(1, Math.min(5, Number(o.quality) || 3)),
    caption: String(o.caption || '').slice(0, 220), subjects: clean(o.subjects, 4), place: String(o.place || '').toLowerCase().slice(0, 40),
    setting: ['indoor', 'outdoor', 'studio'].includes(o.setting) ? o.setting : '', shot: SHOTS.includes(o.shot) ? o.shot : '',
    people: Math.max(0, Math.min(3, Number(o.people) || 0)), mood: clean(o.mood, 3, /^[a-z]{3,20}$/),
    light: ['bright', 'dark', 'warm', 'cool'].includes(o.light) ? o.light : '',
    copySpace: ['left', 'right', 'top', 'bottom', 'center', 'none'].includes(o.copySpace) ? o.copySpace : 'none',
    colors: (Array.isArray(o.colors) ? o.colors : []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 3).map(c => c.toLowerCase()),
    businesses: clean(o.businesses, 5), tags: clean(o.tags, 16, /^[a-z]{3,20}$/)
  }
}

async function publish(name, bytes) {
  const head = { authorization: `Bearer ${octoKey}`, 'user-agent': UA, 'content-type': 'application/json' }
  const up = await json(`${OCTO}/api/files/upload`, { method: 'POST', headers: head, body: JSON.stringify({ workspaceId: WS, name, mimeType: 'image/jpeg', data: Buffer.from(bytes).toString('base64'), dataEncoding: 'base64' }) })
  publish.path ||= (await json(`${OCTO}/api/capabilities?workspaceId=${WS}`, { headers: head })).capabilities.find(c => c.action === 'files.publish').path
  const pub = await json(`${OCTO}${publish.path.replaceAll('<fileId>', up.id).replaceAll('<id>', WS)}`, { method: 'POST', headers: head })
  return { fileId: up.id, url: pub.url }
}

async function bytesOf(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error(`download ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}

const busy = new Set()
async function one(theme, q, p, orientation) {
  const id = `px${p.id}`
  if (busy.has(id)) return 'again'
  const had = byId.get(id)
  if (had) { had.queries = [...new Set([...had.queries, q])]; had.themes = [...new Set([...had.themes, theme])]; return 'again' }
  busy.add(id)
  try { return await fresh(theme, q, p, orientation, id) } finally { busy.delete(id) }
}

async function fresh(theme, q, p, orientation, id) {
  const small = await bytesOf(`${p.src.original}?auto=compress&cs=tinysrgb&w=900`)
  const t = await tag(small)
  if (!t.photo || t.quality < 3) return 'dropped'
  if (dry) { console.log('  ', id, t.quality, t.caption); return 'dry' }
  const big = await bytesOf(`${p.src.original}?auto=compress&cs=tinysrgb&w=1920`)
  const { fileId, url } = await publish(`stock-${id}.jpg`, big)
  const w = p.width >= p.height ? 1920 : Math.round(1920 * p.width / p.height), h = Math.round(w * p.height / p.width)
  const entry = { id, url, fileId, w, h, aspect: w / h > 1.25 ? 'wide' : w / h < 0.8 ? 'tall' : 'square', ...t, alt: String(p.alt || '').slice(0, 200),
    credit: `${String(p.alt || 'Photo').slice(0, 80)} by ${p.photographer} (Pexels)`, page: p.url, avgColor: p.avg_color || null,
    themes: [theme], queries: [q], orientation, sha: createHash('sha1').update(big).digest('hex').slice(0, 16) }
  lib.photos.push(entry); byId.set(id, entry)
  return 'added'
}

const themes = JSON.parse(readFileSync(THEMES, 'utf8'))
const jobs = Object.entries(themes.themes).filter(([t]) => !only || only.includes(t)).flatMap(([t, qs]) => qs.map(q => [t, q])).filter(([, q]) => !done.has(q)).slice(0, limit)
console.log(`${jobs.length} queries to run; library has ${lib.photos.length} photos`)
const tally = { added: 0, again: 0, dropped: 0, failed: 0, dry: 0 }
const CONCURRENCY = Number(arg('jobs', 4)) || 4
let next = 0, finished = 0
async function worker() {
  while (next < jobs.length) {
    const n = next++, [theme, q] = jobs[n]
    // mostly wide for heroes and section bands, some tall for cards and portraits
    const orientation = n % 4 === 3 ? 'portrait' : 'landscape'
    let photos = []
    try { photos = (await json(`${pexels.url}/v1/search?query=${encodeURIComponent(q)}&per_page=${themes.perQuery + 4}&orientation=${orientation}`, { headers: { authorization: pexels.auth, 'user-agent': UA } })).photos || [] } catch (e) { console.error(`search failed: ${q}: ${e.message}`); continue }
    const picks = photos.filter(p => p.width >= 1600).slice(0, themes.perQuery)
    const res = await Promise.all(picks.map(p => one(theme, q, p, orientation).catch(e => { console.error(`  ${p.id}: ${String(e.message).slice(0, 120)}`); return 'failed' })))
    for (const r of res) tally[r]++
    if (!dry) save()
    console.log(`[${++finished}/${jobs.length}] ${theme}: ${q} → ${res.join(' ')}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(JSON.stringify(tally), `library now ${lib.photos.length} photos`)
