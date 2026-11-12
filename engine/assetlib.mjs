// The asset library on purpose: search it, pick a picture for a slot of a build, and add packs
// of one's own. (engine/library.mjs keeps using it as the last resort when a picture fails.)
//
// Two kinds of pack:
//   - assetrizz (github.com/mojomast/assetrizz, its author gave this studio full use): about
//     14,600 pictures in 23 style packs, the catalog in dataDir/assetrizz/manifest.jsonl, each
//     picture fetched the first time it is used and kept there.
//   - imported packs: a folder or a .zip of the owner's own (or bought) art, copied into
//     dataDir/library/<pack>/ with pack.json { id, name, credit, license, url, imported } and
//     manifest.jsonl, one row per picture in assetrizz's shape.
// Every picture a build uses keeps its credit: the build's public/art/CREDITS.md and
// credits.json list the file, the pack, the credit and the licence.
//
// A build's picks are kept with the run, runs/<id>/art-picks.json: [{ slot, asset, what }].
// A picked slot is not painted: the picture comes from the library (engine/../server paintGame).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { RAW, CREDIT, terms } from './library.mjs'

const IMG = /\.(png|webp|jpe?g|gif)$/i
export const CATEGORIES = ['icons', 'markers', 'characters', 'vfx', 'tiles', 'decals', 'enemies', 'ui', 'foliage', 'furniture', 'creatures', 'props', 'backgrounds', 'portraits', 'weapons', 'vehicles', 'buildings', 'terrain', 'misc']
// packs that read as a 3D or realistic render: left out of a search unless asked (`all`)
export const RENDER_PACKS = new Set(['lowpoly_render', 'claymation', 'isometric_voxel'])
// a build slot → the library categories that fit it
export const SLOT_CATEGORIES = { item: ['icons'], place: ['backgrounds'], title: ['backgrounds'], prop: ['props', 'furniture', 'foliage', 'buildings', 'vehicles'], ui: ['ui', 'markers'], tile: ['tiles', 'terrain'], fx: ['vfx'], portrait: ['portraits'], sprite: ['characters', 'enemies', 'creatures'] }
export const slotKind = slot => String(slot || '').split('-')[0]

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>"`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const packId = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
export const isSlot = s => /^(item|place|title|prop|ui|tile|fx|portrait|sprite)(-[a-z0-9-]{1,40})?$/.test(String(s || '')) && (s === 'title' || /-/.test(s))

// a catalog row (assetrizz's shape) → what a search returns. id is "<pack>/<path in the pack>".
export function rowOf(r, pack) {
  const own = pack && pack.id
  return {
    id: own ? `${pack.id}/${r.path}` : String(r.path || '').replace(/^assets\//, ''),
    path: r.path, pack: own ? pack.id : r.style_pack, category: r.category || 'misc', sub: r.subcategory || '',
    subject: String(r.subject || '').replace(/_/g, ' '), w: r.width || null, h: r.height || null, tileable: !!r.tileable,
    credit: own ? pack.credit : CREDIT, license: own ? pack.license || '' : 'full grant from the author', url: own ? pack.url || '' : 'https://github.com/mojomast/assetrizz', own: !!own,
    words: new Set(terms(`${r.subject || ''} ${(r.tags || []).join(' ')} ${r.description || ''}`)), name: new Set(terms(r.subject))
  }
}

// rows → the best matches for a query. The subject counts three times a tag or the description.
export function searchRows(rows, { q = '', category = '', pack = '', all = false, limit = 40, used = new Set() } = {}) {
  const want = terms(q), cats = [].concat(category || []).filter(Boolean)
  const out = []
  for (const r of rows) {
    if (pack && r.pack !== pack) continue
    if (!pack && !all && RENDER_PACKS.has(r.pack)) continue
    if (cats.length && !cats.includes(r.category)) continue
    if (used.has(r.id)) continue
    let s = 0, hit = 0
    for (const w of want) { const h = r.name.has(w) ? 3 : r.words.has(w) ? 1 : 0; s += h; hit += h > 0 }
    if (want.length && hit < Math.ceil(want.length / 2)) continue
    out.push([s + (r.own ? 0.5 : 0), r])
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, Math.max(1, Math.min(200, limit))).map(([score, r]) => ({ ...view(r), score }))
}
const view = ({ words, name, ...r }) => r

// The files under a folder that are pictures, with their folder path (for the category)
function walk(dir, out = [], cap = 5000) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= cap || f.name.startsWith('.') || f.name === '__MACOSX') continue
    const p = join(dir, f.name)
    if (f.isDirectory()) walk(p, out, cap)
    else if (IMG.test(f.name) && statSync(p).size < 30e6) out.push(p)
  }
  return out
}
// the category a file sits in: the first folder (or the file name) that names one
export function categoryOf(rel) {
  const parts = rel.toLowerCase().split(/[\\/]/)
  for (const part of parts) {
    const w = part.replace(IMG, '').replace(/[^a-z]+/g, ' ').trim()
    for (const c of CATEGORIES) if (w.split(' ').some(x => x === c || `${x}s` === c || x === c.replace(/s$/, ''))) return c
    if (/\b(bg|background|backdrop|parallax|sky)\b/.test(w)) return 'backgrounds'
    if (/\b(button|panel|frame|bar|hud|gui)\b/.test(w)) return 'ui'
    if (/\b(fx|effect|particle|spark|explosion|smoke)\b/.test(w)) return 'vfx'
    if (/\b(tile|tileset|ground|floor)\b/.test(w)) return 'tiles'
    if (/\b(icon|item|pickup)\b/.test(w)) return 'icons'
  }
  return 'misc'
}

export function assetLib({ dataDir, fetchImpl = fetch, unzip = (zip, to) => new Promise((ok, no) => execFile('unzip', ['-qq', '-o', zip, '-d', to], { timeout: 300000 }, err => (err ? no(err) : ok()))) }) {
  const rizzDir = join(dataDir, 'assetrizz'), ownDir = join(dataDir, 'library')
  let rizz = null, own = null
  const readLines = f => readFileSync(f, 'utf8').split('\n').map(l => { try { return l ? JSON.parse(l) : null } catch { return null } }).filter(r => r && r.path)
  const loadRizz = () => (rizz ||= existsSync(join(rizzDir, 'manifest.jsonl')) ? readLines(join(rizzDir, 'manifest.jsonl')).filter(r => IMG.test(r.path)).map(r => rowOf(r)) : [])
  const ownPacks = () => {
    if (!existsSync(ownDir)) return []
    return readdirSync(ownDir).flatMap(d => { try { return [JSON.parse(readFileSync(join(ownDir, d, 'pack.json'), 'utf8'))] } catch { return [] } })
  }
  const loadOwn = () => (own ||= ownPacks().flatMap(p => (existsSync(join(ownDir, p.id, 'manifest.jsonl')) ? readLines(join(ownDir, p.id, 'manifest.jsonl')).map(r => rowOf(r, p)) : [])))
  const rows = () => [...loadOwn(), ...loadRizz()]

  function packs() {
    const count = new Map()
    for (const r of loadRizz()) count.set(r.pack, (count.get(r.pack) || 0) + 1)
    return [
      ...ownPacks().map(p => ({ id: p.id, name: p.name, credit: p.credit, license: p.license || '', url: p.url || '', count: loadOwn().filter(r => r.pack === p.id).length, own: true, imported: p.imported })),
      ...[...count].map(([id, n]) => ({ id, name: id.replace(/_/g, ' '), credit: CREDIT, license: 'full grant from the author', count: n, own: false, render: RENDER_PACKS.has(id) }))
    ]
  }
  const search = opts => searchRows(rows(), opts)
  const get = id => rows().find(r => r.id === id) || null

  // the picture on disk (an assetrizz one is fetched the first time) → { file, row } or null
  async function file(id) {
    const r = get(String(id || ''))
    if (!r) return null
    if (r.own) { const f = resolve(ownDir, r.pack, r.path); return f.startsWith(resolve(ownDir) + sep) && existsSync(f) ? { file: f, row: view(r) } : null }
    const f = resolve(rizzDir, r.path)
    if (!f.startsWith(resolve(rizzDir) + sep)) return null
    if (!existsSync(f)) {
      try {
        const res = await fetchImpl(RAW + r.path.split('/').map(encodeURIComponent).join('/'), { signal: AbortSignal.timeout(30000) })
        if (!res.ok) return null
        mkdirSync(dirname(f), { recursive: true })
        writeFileSync(f, Buffer.from(await res.arrayBuffer()))
      } catch { return null }
    }
    return { file: f, row: view(r) }
  }

  // Add a folder or a .zip of pictures as a pack of its own. The credit is required: it goes
  // with every picture a build takes from it. → the pack, with how many pictures it holds.
  async function importPack({ path, name, credit, license = '', url = '' } = {}) {
    const src = resolve(String(path || ''))
    if (!path || !existsSync(src)) throw Object.assign(new Error('no such folder or file'), { status: 404 })
    if (!clean(credit, 200)) throw Object.assign(new Error('say whose art it is in "credit"'), { status: 400 })
    const id = packId(name || basename(src, extname(src)))
    if (!id) throw Object.assign(new Error('the pack needs a name'), { status: 400 })
    if (existsSync(join(rizzDir, 'assets', id)) || loadRizz().some(r => r.pack === id)) throw Object.assign(new Error(`${id} is an assetrizz pack: pick another name`), { status: 409 })
    let from = src, temp = null
    if (statSync(src).isFile()) {
      if (!/\.zip$/i.test(src)) throw Object.assign(new Error('a pack is a folder or a .zip'), { status: 400 })
      temp = mkdtempSync(join(tmpdir(), 'pack-'))
      await unzip(src, temp)
      from = temp
    }
    try {
      const files = walk(from)
      if (!files.length) throw Object.assign(new Error('no pictures in it (png, webp, jpg or gif)'), { status: 400 })
      const dir = join(ownDir, id)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const seen = new Set(), lines = []
      for (const f of files) {
        let rel = relative(from, f).split(sep).join('/').replace(/[^\w./-]+/g, '_')
        while (seen.has(rel)) rel = rel.replace(/(\.\w+)$/, '_$1')
        seen.add(rel)
        mkdirSync(dirname(join(dir, rel)), { recursive: true })
        copyFileSync(f, join(dir, rel))
        const subject = basename(rel, extname(rel)).replace(/[-\s]+/g, '_').toLowerCase()
        lines.push(JSON.stringify({ path: rel, category: categoryOf(rel), subcategory: rel.split('/').slice(-2, -1)[0] || '', subject, tags: rel.split('/').slice(0, -1), description: '' }))
      }
      const pack = { id, name: clean(name, 60) || id, credit: clean(credit, 200), license: clean(license, 200), url: clean(url, 300), imported: new Date().toISOString() }
      writeFileSync(join(dir, 'manifest.jsonl'), lines.join('\n') + '\n')
      writeFileSync(join(dir, 'pack.json'), JSON.stringify(pack, null, 1))
      own = null
      return { ...pack, count: lines.length }
    } finally { if (temp) rmSync(temp, { recursive: true, force: true }) }
  }
  function removePack(id) {
    if (!ownPacks().some(p => p.id === id)) return false
    rmSync(join(ownDir, id), { recursive: true, force: true })
    own = null
    return true
  }
  return { packs, search, get, file, importPack, removePack, reset: () => { rizz = own = null } }
}

// ---------- a build's picks (runs/<id>/art-picks.json)
export const PICKS_FILE = 'art-picks.json'
export function readPicks(runDir) {
  try { const j = JSON.parse(readFileSync(join(runDir, PICKS_FILE), 'utf8')); return Array.isArray(j) ? j.filter(p => isSlot(p?.slot) && p.asset) : [] } catch { return [] }
}
// set (or with asset null, clear) the pick for one slot → all picks
export function setPick(runDir, { slot, asset, what = '' }) {
  if (!isSlot(slot)) throw Object.assign(new Error('slot is a build picture id such as item-glide-kite, place-harbour-roofs or prop-lamp'), { status: 400 })
  const all = readPicks(runDir).filter(p => p.slot !== slot)
  if (asset) all.push({ slot, asset: String(asset).slice(0, 300), ...(what ? { what: clean(what, 120) } : {}) })
  mkdirSync(runDir, { recursive: true })
  writeFileSync(join(runDir, PICKS_FILE), JSON.stringify(all, null, 1) + '\n')
  return all
}
// a pick for a slot the art plan does not have → a picture the game is told about
export function pickedItem(p, row) {
  const kind = { item: 'icon', place: 'backdrop', title: 'title', prop: 'prop', ui: 'ui', tile: 'tile', fx: 'fx', portrait: 'portrait', sprite: 'sprite' }[slotKind(p.slot)]
  const label = p.what || row?.subject || p.slot.replace(/^[a-z]+-/, '').replace(/-/g, ' ')
  return { id: p.slot, kind, what: `${kind === 'backdrop' ? 'backdrop for' : kind === 'icon' ? 'icon for' : `${kind}:`} ${label}`, picked: true }
}

// The credits a build's art carries: every library picture in it, by file → { md, json }
export function creditsFor(used) {
  const rows = [...used].filter(u => u && u.file && u.credit)
  if (!rows.length) return null
  const byCredit = new Map()
  for (const u of rows) byCredit.set(u.credit, [...(byCredit.get(u.credit) || []), u])
  const md = `# Art credits\n\nPictures in this folder that were not painted for this game:\n\n${[...byCredit].map(([credit, list]) => `## ${credit}${list[0].license ? ` (${list[0].license})` : ''}${list[0].url ? `\n${list[0].url}` : ''}\n\n${list.map(u => `- ${u.file}: ${u.from}`).join('\n')}`).join('\n\n')}\n`
  return { md, json: rows.map(({ file, from, pack, credit, license, url }) => ({ file, from, pack, credit, license: license || '', url: url || '' })) }
}
