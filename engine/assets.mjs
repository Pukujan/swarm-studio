// A build's own assets, for the code wall's asset pane: the pictures the crew painted
// for the run (a site's pictures from its image events, a game's art kept in the run's
// img/ as game-*.webp) and any 3D models the app holds (public/models/*.glb|gltf, from
// an upload or a connector). `next` names the pictures still to come, so the pane can
// show what the crew is about to make before anything is painted.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const words = s => String(s || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// a game picture's id ("portrait-lokee", "boon-applause-heal", "room-hub") as a name: "Lokee portrait"
export function artName(id) {
  const w = words(id)
  const m = w.match(/^(portrait|boon|room|place|item)\s+(.+)$/i)
  if (!m) return cap(w || 'Art')
  const kind = { portrait: 'portrait', boon: 'boon', room: 'room', place: 'backdrop', item: 'icon' }[m[1].toLowerCase()]
  return `${cap(m[2])} ${kind}`
}

// files: { img: [names in runs/<id>/img], models: [names in app/public/models] }
// plan: the game's art list (artList(spec)), when the run is a game
export function listAssets({ id, events = [], files = {}, plan = [], pieceName = e => cap(words(e.layer)) || 'Picture' }) {
  const pageTitle = Object.fromEntries(events.filter(e => e.type === 'page').map(e => [e.id, e.title]))
  const assets = []
  // the newest picture per slot (a repaint replaces the old one)
  const latest = new Map()
  for (const e of events) if (e.type === 'image' && e.src) latest.set(`${e.page}|${e.layer}`, e)
  for (const e of latest.values()) assets.push({ kind: 'art', name: pieceName(e, pageTitle), src: e.src, t: e.t || 0 })
  const painted = new Set()
  // a game's art in its plan's order (the title first, then one of each kind), the rest after
  const at = f => { const i = plan.findIndex(it => `game-${it.id}` === f.replace(/\.[a-z]+$/, '')); return i < 0 ? plan.length : i }
  for (const f of (files.img || []).filter(f => /^game-[a-z0-9-]{1,48}\.(png|jpe?g|webp)$/.test(f)).sort().sort((a, b) => at(a) - at(b))) {
    const art = f.slice(5).replace(/\.[a-z]+$/, '')
    painted.add(art)
    assets.push({ kind: 'art', name: artName(art), src: `/img/${id}/${f}`, t: files.times?.[f] || 0 })
  }
  for (const f of (files.models || []).filter(f => /^[\w.-]{1,80}\.(glb|gltf)$/i.test(f)).sort()) {
    assets.push({ kind: 'model', name: cap(words(f)), file: f, t: 0 }) // the Studio does not load three.js: listed, not drawn
  }
  // still to come: a game's planned pictures not painted yet, then a site's queued pictures
  const next = plan.filter(it => !painted.has(it.id)).map(it => artName(it.id))
  const done = new Set(events.filter(e => e.type === 'image' || e.type === 'image:failed').map(e => `${e.page}|${e.layer}|${e.gen}`))
  for (const e of events) if (e.type === 'image:queued' && !done.has(`${e.page}|${e.layer}|${e.gen}`)) next.push(pieceName(e, pageTitle))
  // the whole art plan in order, painted or not: the App view's live sheet while a game builds
  const fileOf = new Map((files.img || []).filter(f => /^game-[a-z0-9-]{1,48}\.(png|jpe?g|webp)$/.test(f)).map(f => [f.slice(5).replace(/\.[a-z]+$/, ''), f]))
  const sheet = plan.map(it => ({ id: it.id, name: artName(it.id), kind: it.kind, aspect: it.aspect, src: fileOf.has(it.id) ? `/img/${id}/${fileOf.get(it.id)}` : null }))
  return { assets, next: [...new Set(next)].slice(0, 12), sheet }
}

// the files listAssets reads, from a run's folder
export function assetFiles(runDir) {
  const ls = d => { try { return existsSync(d) ? readdirSync(d) : [] } catch { return [] } }
  const img = ls(join(runDir, 'img'))
  // when each game picture was made: the wall shows the newest first
  const times = {}
  for (const f of img) if (/^game-/.test(f)) try { times[f] = Math.round(statSync(join(runDir, 'img', f)).mtimeMs) } catch {}
  return { img, models: ls(join(runDir, 'app', 'public', 'models')), times }
}

// Pictures that were painted but never recorded. Until a build's late picture events were kept
// (server.mjs, emit), a newer build starting made the server drop them: the files 1.png, 2.png…
// sat in the run's img/ while the build still said "0 of 8". The build's own queue names its files
// by the order its slots were noted, so the n-th image:queued event owns file n. Returns the image
// events to add, for slots that have a file and no picture or failure on record.
export function lostPictures({ id, events = [], img = [], max = 8, now = Date.now() } = {}) {
  const queued = events.filter(e => e.type === 'image:queued').slice(0, max)
  const key = e => `${e.page}|${e.layer}|${e.gen}`
  const settled = new Set(events.filter(e => e.type === 'image' || e.type === 'image:failed').map(key))
  const out = []
  queued.forEach((q, i) => {
    const file = img.find(f => new RegExp(`^${i + 1}\\.(png|jpe?g|webp)$`).test(f))
    if (!file || settled.has(key(q))) return
    out.push({ type: 'image', t: now, run: id, page: q.page, layer: q.layer, gen: q.gen, src: `/img/${id}/${file}`, model: q.model || undefined, recovered: true })
  })
  return out
}

