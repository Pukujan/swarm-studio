// Library pictures: the last resort for a game picture no image provider would paint.
// The library is assetrizz (github.com/mojomast/assetrizz), about 14,600 original 2D game
// assets in 23 style packs; its author gave this studio full use of it. Only icons and
// backdrops come from it, and only from a pack close to the build's own style, so a stock
// picture never sits in a look it doesn't belong to. Characters are always our own, and a
// style with no close pack (Film photo, Toy 3D) gets nothing from the library.
//
// The catalog (assets/manifest.jsonl, about 12 MB) is fetched once into dataDir/assetrizz;
// each picture used is fetched on its own and kept there, so nothing else is downloaded.
// A library picture is not kept as the run's painted picture: a Try again paints it for real.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { words } from './standins.mjs'

const RAW = 'https://raw.githubusercontent.com/mojomast/assetrizz/main/'
export const CREDIT = 'assetrizz by mojomast'

// the build's style (engine/artdirect.mjs STYLES) → the closest packs, nearest first
export const PACKS = {
  'anime-cel': ['cel_shaded_anime', 'storybook_gouache'],
  'vhs-anime': ['cel_shaded_anime', 'vaporwave_synth'],
  'manga-ink': ['ink_watercolor', 'cel_shaded_anime'],
  pixel: ['pixel_32', 'pixel_16bit', 'retro_8bit'],
  gouache: ['storybook_gouache', 'hand_painted_fantasy'],
  watercolour: ['ink_watercolor', 'storybook_gouache'],
  concept: ['hand_painted_fantasy', 'chalk_crayon'],
  riso: ['paper_cutout', 'art_deco_poster'],
  sticker: ['flat_vector_ui', 'cozy_cartoon'],
  papercraft: ['paper_cutout']
}
const CATEGORY = { icon: 'icons', backdrop: 'backgrounds', title: 'backgrounds' }
const CATEGORY_SET = new Set(Object.values(CATEGORY))
const FILLER = new Set(['icon', 'backdrop', 'emblem', 'single', 'bold', 'symbol', 'centred', 'centered', 'plain', 'dark', 'circle', 'readable', 'when', 'small', 'game', 'called', 'people', 'nobody', 'empty', 'figures', 'key', 'art', 'screen', 'title', 'mid', 'sky', 'front', 'back', 'png'])
const terms = s => words(String(s || '').replace(/_/g, ' ')).filter(w => !FILLER.has(w))

// rows: the catalog's lines, parsed; → the few fields a pick needs
export function indexRows(rows) {
  return rows.filter(r => r && r.path && CATEGORY_SET.has(r.category)).map(r => ({
    path: r.path, cat: r.category, sub: r.subcategory || '', pack: r.style_pack,
    subject: new Set(terms(r.subject)), more: new Set(terms(`${(r.tags || []).join(' ')} ${r.description || ''}`))
  }))
}
// The best row for one game picture, or null. it: { kind, what, gen }; style: the guide's style id;
// used: paths already given to this build (never the same picture twice).
export function pickRow(index, it, style, used = new Set()) {
  const packs = PACKS[style], cat = CATEGORY[it?.kind]
  if (!packs || !cat) return null
  const want = terms(`${String(it.what || '').replace(/^(icon|backdrop|title screen picture) for /i, '')}`)
  const extra = terms(it.gen).filter(w => !want.includes(w)).slice(0, 12)
  for (const pack of packs) {
    let best = null, top = 0
    for (const r of index) {
      if (r.pack !== pack || r.cat !== cat || used.has(r.path)) continue
      if (cat === 'backgrounds' && r.sub === 'parallax') continue // a layer of a set, not a whole backdrop
      let s = 0
      for (const w of want) s += r.subject.has(w) ? 3 : r.more.has(w) ? 1 : 0
      for (const w of extra) s += r.subject.has(w) ? 1 : r.more.has(w) ? 0.5 : 0
      if (s > top) { top = s; best = r }
    }
    // an icon must be of the thing itself; a backdrop only needs to share the place's mood
    if (best && top >= (cat === 'icons' ? 3 : 1)) return best
  }
  return null
}

export function library({ dataDir, fetchImpl = fetch }) {
  const dir = join(dataDir, 'assetrizz')
  let index = null, loading = null
  const load = async () => {
    if (index) return index
    return (loading ||= (async () => {
      const file = join(dir, 'manifest.jsonl')
      if (!existsSync(file)) {
        const res = await fetchImpl(`${RAW}assets/manifest.jsonl`, { signal: AbortSignal.timeout(60000) })
        if (!res.ok) throw new Error(`library catalog: ${res.status}`)
        mkdirSync(dir, { recursive: true })
        writeFileSync(file, await res.text())
      }
      const rows = readFileSync(file, 'utf8').split('\n').map(l => { try { return l ? JSON.parse(l) : null } catch { return null } })
      return (index = indexRows(rows))
    })().catch(err => { loading = null; throw err }))
  }
  // → { path (a local PNG), from (the library path), credit } or null; never throws
  async function pick(it, style, used = new Set()) {
    if (!PACKS[style] || !CATEGORY[it?.kind]) return null
    try {
      const row = pickRow(await load(), it, style, used)
      if (!row) return null
      const local = join(dir, row.path)
      if (!existsSync(local)) {
        const res = await fetchImpl(RAW + row.path.split('/').map(encodeURIComponent).join('/'), { signal: AbortSignal.timeout(30000) })
        if (!res.ok) return null
        mkdirSync(dirname(local), { recursive: true })
        writeFileSync(local, Buffer.from(await res.arrayBuffer()))
      }
      used.add(row.path)
      return { path: local, from: row.path, credit: CREDIT }
    } catch { return null }
  }
  return { pick }
}
