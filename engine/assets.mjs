// A build's own assets, for the code wall's asset pane: the pictures the crew painted
// for the run (a site's pictures from its image events, a game's art kept in the run's
// img/ as game-*.webp) and any 3D models the app holds (public/models/*.glb|gltf, from
// an upload or a connector). `next` names the pictures still to come, so the pane can
// show what the crew is about to make before anything is painted.
import { existsSync, readdirSync } from 'node:fs'
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
    assets.push({ kind: 'art', name: artName(art), src: `/img/${id}/${f}`, t: 0 })
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
  return { img: ls(join(runDir, 'img')), models: ls(join(runDir, 'app', 'public', 'models')) }
}
