// Stand-in pictures. While the crew paints a real picture, its slot shows a
// matching photo marked "real picture coming", so a build looks alive. Stock photos only: a
// picture another build made is never a stand-in (it reads as that other site's art). Sources:
// the shipped library (photos tagged by a vision model and hosted on the Octo R2
// CDN, built by scripts/stock-library.mjs),
// Pexels when the studio has a key (directly or through Octo's vault proxy), and
// public-domain photos from Openverse (CC0 and the public domain mark, no key).
// A vision model looks at each found photo once, rejects what isn't a clean
// photo and tags the rest; the tags live in a local index. Credit is kept for
// every photo. On the canvas a stand-in is never saved into a build; only a slot
// still unpainted when an app is built gets one, with its credit (fillpics.mjs).
//
// Two lanes for the files: the local cache (served only to this studio, behind
// its token) and, when the studio has an Octo key, Octo's public bucket, so a
// hosted studio can hand visitors a stable public URL.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { streamChat } from './llm.mjs'

const UA = 'swarm-studio/1.0'
const STOP = new Set(('a an the of and or with for in on at to from by into over under near is are its their this that these those very ' +
  'image photo photograph picture shot scene style website hero section background banner cover close closeup up view wide light lighting ' +
  'soft warm cool natural cinematic realism realistic dramatic detailed high quality editorial film grain depth field bokeh tones palette color colors colour').split(' '))
export const words = s => [...new Set(String(s || '').toLowerCase().match(/[a-z]{3,}/g) || [])].filter(w => !STOP.has(w))
// one form per word, so 'bakeries' finds 'bakery' and 'cyclists' finds 'cyclist'
export const stem = w => (w.length > 4 ? w.replace(/ies$/, 'y').replace(/(sses|xes|ches|shes)$/, m => m.slice(0, -2)).replace(/([^s])s$/, '$1').replace(/ing$/, '') : w)
const aspectOf = (w, h) => (!w || !h ? '' : w / h > 1.25 ? 'wide' : w / h < 0.8 ? 'tall' : 'square')

const TAG_RULES = `You sort stock photos for a design tool that shows them as placeholders. Look at the photo and return JSON only:
{"photo": true if it is a real, clean, modern-looking photograph (false for drawings, scans, maps, postcards, documents, screenshots, collages, heavy text or watermarks, very blurry or very old-looking pictures),
 "quality": 1-5 (5 = could sit on a polished website),
 "tags": 6-12 lowercase single words for what is in it (subjects, place, mood, setting),
 "colors": up to 3 dominant colours as hex}`

export function standins({ dataDir, runsDir, provider = null, model = '', octo = null, pexels = null, fetchImpl = fetch, libraryFile = new URL('./stock/library.json', import.meta.url) }) {
  const dir = join(dataDir, 'standins')
  mkdirSync(dir, { recursive: true })
  const idxFile = join(dir, 'index.json')
  let index = []
  try { index = JSON.parse(readFileSync(idxFile, 'utf8')) } catch {}
  // the keys Map is rebuilt on load; JSON would turn it into {}
  const save = () => writeFileSync(idxFile, JSON.stringify(index, (k, v) => (k === 'keys' ? undefined : v)))
  const searched = new Set(index.flatMap(x => x.q || []))
  const inflight = new Map()

  // the shipped library (scripts/stock-library.mjs): photos on the R2 CDN with structured tags.
  // Subjects, tags and businesses weigh most; the caption and place help break ties.
  let library = null
  function libraryPhotos() {
    if (library) return library
    library = []
    let photos = []
    try { photos = JSON.parse(readFileSync(libraryFile, 'utf8')).photos || [] } catch {}
    for (const p of photos) {
      if (!p.url) continue
      const keys = new Map()
      const add = (list, wt) => { for (const w of list) { const k = stem(w); keys.set(k, Math.max(keys.get(k) || 0, wt)) } }
      add(words(`${p.caption} ${p.place} ${(p.mood || []).join(' ')}`), 0.5)
      add([...(p.tags || []), ...words((p.subjects || []).join(' ')), ...words((p.businesses || []).join(' ')), ...words((p.themes || []).join(' '))], 1)
      library.push({ id: p.id, src: 'library', url: p.url, publicUrl: p.url, credit: p.credit, page: p.page, aspect: p.aspect, quality: p.quality, copySpace: p.copySpace, tags: p.tags || [], keys })
    }
    return library
  }

  function rank(want, aspect, avoid) {
    const stems = [...new Set(want.map(stem))]
    let best = null
    for (const x of [...libraryPhotos(), ...index]) {
      if (avoid?.has(x.url)) continue // a photo already used elsewhere on the same build
      const keys = x.keys instanceof Map ? x.keys : (x.keys = new Map(x.tags.map(t => [stem(t), 1]))) // an index saved by an older studio kept keys as {}
      let hit = 0, w = 0
      for (const k of stems) { const v = keys.get(k); if (v) { w += v; if (v >= 1) hit++ } }
      if (w < Math.min(2, stems.length)) continue
      const s = w + (aspect && x.aspect === aspect ? 0.5 : 0) + (x.quality || 3) / 10 + (x.src === 'library' ? 0.2 : 0)
      if (!best || s > best.s) best = { ...x, s, hit: Math.max(hit, Math.floor(w)) }
    }
    return best
  }

  async function tag(bytes, mime) {
    const pv = typeof provider === 'function' ? provider() : provider, m = typeof model === 'function' ? model() : model
    if (!pv?.baseUrl || !m) return { photo: true, quality: 3, tags: [], colors: [] }
    try {
      const res = await streamChat(pv, { trace: { kind: 'standin-tag' }, model: m, maxTokens: 300, temperature: 0.1, signal: AbortSignal.timeout(40000),
        messages: [{ role: 'system', content: TAG_RULES }, { role: 'user', content: [{ type: 'text', text: 'Sort this photo.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}` } }] }] })
      const t = res.text, a = t.indexOf('{'), b = t.lastIndexOf('}')
      const j = JSON.parse(t.slice(a, b + 1))
      return { photo: j.photo !== false, quality: Math.max(1, Math.min(5, Number(j.quality) || 3)), tags: (Array.isArray(j.tags) ? j.tags : []).map(x => String(x).toLowerCase()).filter(x => /^[a-z]{3,}$/.test(x)).slice(0, 12), colors: (Array.isArray(j.colors) ? j.colors : []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 3) }
    } catch { return { photo: true, quality: 3, tags: [], colors: [] } }
  }

  // the public lane: upload to the Octo workspace and publish; a failure only means no public URL
  async function publish(name, bytes, mime) {
    if (!octo?.key) return null
    try {
      const head = { authorization: `Bearer ${octo.key}`, 'user-agent': UA, 'content-type': 'application/json' }
      const up = await fetchImpl(`${octo.baseUrl}/api/files/upload`, { method: 'POST', headers: head, body: JSON.stringify({ workspaceId: octo.workspaceId, name, mimeType: mime, data: Buffer.from(bytes).toString('base64'), dataEncoding: 'base64' }), signal: AbortSignal.timeout(60000) })
      const id = (await up.json().catch(() => ({}))).id
      if (!up.ok || !id) return null
      octo.publishPath ||= await fetchImpl(`${octo.baseUrl}/api/capabilities?workspaceId=${octo.workspaceId}`, { headers: head }).then(r => r.json()).then(j => (j.capabilities || []).find(c => c.action === 'files.publish')?.path).catch(() => null)
      if (!octo.publishPath) return null
      const pub = await fetchImpl(`${octo.baseUrl}${octo.publishPath.replaceAll('<fileId>', id).replaceAll('<id>', octo.workspaceId)}`, { method: 'POST', headers: head, signal: AbortSignal.timeout(30000) })
      return pub.ok ? (await pub.json().catch(() => ({}))).url || null : null
    } catch { return null }
  }

  // Pexels when the studio has a key (straight, or a working key through Octo's vault proxy, which adds the real one)
  async function fromPexels(q, aspect) {
    if (!pexels?.key) return null
    const api = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12${aspect ? `&orientation=${{ wide: 'landscape', tall: 'portrait', square: 'square' }[aspect]}` : ''}`
    const url = pexels.proxy ? `${pexels.proxy.replace(/\/+$/, '')}/${api}` : api
    const headers = { 'user-agent': UA, authorization: pexels.proxy ? `Bearer ${pexels.key}` : pexels.key }
    try {
      const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) })
      if (!r.ok) return null
      return ((await r.json()).photos || []).map(p => ({ url: p.src?.large2x || p.src?.large, title: p.alt, creator: p.photographer, license: 'Pexels', foreign_landing_url: p.url, width: p.width, height: p.height, tags: [], src: 'pexels' }))
    } catch { return null }
  }

  // Openverse often times out (504) when it filters licences itself, so ask broadly and keep CC0 / public domain here
  async function fromOpenverse(q, aspect) {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&mature=false&page_size=20${aspect ? `&aspect_ratio=${aspect}` : ''}`
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
        if (r.ok) return ((await r.json()).results || []).filter(x => ['cc0', 'pdm'].includes(String(x.license || '').toLowerCase()) && (x.width || 0) >= 900).map(x => ({ ...x, src: 'openverse' }))
      } catch {}
    }
    return null
  }

  async function search(q, aspect) {
    let results = await fromPexels(q, aspect)
    if (!results?.length) results = await fromOpenverse(q, aspect)
    if (!results) return false
    const take = async r => {
      const id = createHash('sha1').update(r.url).digest('hex').slice(0, 16)
      const had = index.find(x => x.id === id)
      if (had) { had.q.push(q); had.tags = [...new Set([...words(q), ...had.tags])].slice(0, 24); return }
      let res
      try { res = await fetchImpl(r.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }) } catch { return }
      const mime = (res.headers.get('content-type') || '').split(';')[0]
      if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length < 20000 || bytes.length > 8e6) return
      const t = await tag(bytes, mime)
      if (!t.photo || t.quality < 3) return
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
      writeFileSync(join(dir, `${id}.${ext}`), bytes)
      const publicUrl = await publish(`standin-${id}.${ext}`, bytes, mime)
      index.push({ id, src: r.src, file: `${id}.${ext}`, url: `/standin/${id}.${ext}`, publicUrl, q: [q], aspect: aspectOf(r.width, r.height),
        tags: [...new Set([...words(q), ...t.tags, ...words(r.title), ...(r.tags || []).map(x => String(x.name || '').toLowerCase()).filter(x => /^[a-z]{3,}$/.test(x))])].slice(0, 24),
        colors: t.colors, quality: t.quality, credit: `${String(r.title || 'Photo').slice(0, 80)} by ${String(r.creator || 'unknown').slice(0, 60)} (${r.src === 'pexels' ? 'Pexels' : String(r.license || '').toUpperCase()})`, page: r.foreign_landing_url || null })
    }
    const list = results.filter(r => r.url && !/\.(gif|svg|tiff?)$/i.test(r.url)).slice(0, 6)
    for (let i = 0; i < list.length; i += 3) await Promise.all(list.slice(i, i + 3).map(take))
    save()
    return true
  }

  // the best stand-in for one picture slot: from the index, else after one Openverse search
  async function pick({ q, w, h, run, avoid } = {}) {
    const want = words(q).slice(0, 10)
    if (!want.length) return null
    const aspect = aspectOf(Number(w), Number(h))
    let best = rank(want, aspect, avoid)
    if (!best || best.hit < Math.min(3, want.length)) {
      for (const key of [want.slice(0, 3).join(' '), want.slice(0, 2).join(' ')]) {
      if (!searched.has(key)) {
        searched.add(key)
        if (!inflight.has(key)) inflight.set(key, search(key, aspect).then(ok => { if (!ok) searched.delete(key) }).finally(() => inflight.delete(key)))
      }
      if (inflight.has(key)) await inflight.get(key)
      best = rank(want, aspect, avoid) || best
      if (best) break
      }
    }
    if (!best) return null
    return { url: best.url, publicUrl: best.publicUrl || null, credit: best.credit || null, page: best.page || null, tags: best.tags.slice(0, 8), source: best.src }
  }

  const file = name => (/^[0-9a-f]{16}\.(jpg|png|webp)$/.test(name) && existsSync(join(dir, name)) ? join(dir, name) : null)
  return { pick, file, size: () => index.length }
}
