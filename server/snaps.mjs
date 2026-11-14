// Saved page snapshots (the Overview's pictures of each page, spec 36).
//
// The browser photographs a page (there is no headless browser here) and sends the picture in two
// sizes: small for the Overview at rest, full for zooming in and for the build's cover. Each is
// keyed by the page's content version, a hash of the events that change how the page looks, so a
// project opens from these files and only a page whose content changed is photographed again.
//
// <run>/snaps/<page>.<version>.<s|f>.jpg, and index.json naming each page's current files. A newer
// version replaces the older files, so a run keeps one picture of each size per page.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PAGE_ID = /^[\w-]{1,64}$/
export const SNAP_FILE = /^[\w-]{1,64}\.[a-f0-9]{12}\.[sf]\.jpg$/
export const SIZES = ['s', 'f']

// the events that change how a page looks: its sections, pictures and edits, and the build's theme.
// A section's streamed text (layer:delta) is not one: a page is photographed once a section is done.
const looks = t => t === 'theme' || t === 'page' || t === 'image' || t === 'edit' || t === 'reset' || t === 'art' || (typeof t === 'string' && t.startsWith('layer:') && t !== 'layer:delta')

// page id → its content version (12 hex). An event of one page changes that page's version only; a
// shared one ('*') or the build's own (no page: the theme, an edit) changes every page's.
export function pageVersions(events) {
  const hashes = new Map()
  for (const e of events) if (e.type === 'page' && PAGE_ID.test(String(e.id)) && !hashes.has(e.id)) hashes.set(e.id, createHash('sha1'))
  for (const e of events) {
    if (!looks(e.type)) continue
    const line = JSON.stringify(e)
    const page = e.type === 'page' ? e.id : e.page
    if (page && page !== '*') hashes.get(page)?.update(line)
    else for (const h of hashes.values()) h.update(line)
  }
  return new Map([...hashes].map(([p, h]) => [p, h.digest('hex').slice(0, 12)]))
}

export function snapStore(runsDir) {
  const dir = id => join(runsDir, id, 'snaps')
  const url = (id, f) => `/snaps/${id}/${f}`
  const readIndex = id => {
    try { const j = JSON.parse(readFileSync(join(dir(id), 'index.json'), 'utf8')); return j && typeof j.pages === 'object' ? j : { pages: {} } } catch { return { pages: {} } }
  }
  const writeIndex = (id, idx) => {
    const tmp = join(dir(id), `index.${process.pid}.tmp`)
    writeFileSync(tmp, JSON.stringify(idx))
    renameSync(tmp, join(dir(id), 'index.json'))
  }
  return {
    // each page's current version, and its saved pictures when they are of that version
    list(id, events) {
      const versions = pageVersions(events), idx = readIndex(id), pages = {}
      for (const [page, v] of versions) {
        const d = idx.pages[page], out = { v }
        if (d?.v === v) for (const k of SIZES) if (d[k]) out[k] = url(id, d[k])
        pages[page] = out
      }
      return { first: versions.keys().next().value || null, pages }
    },
    // a picture of one page at one version: 'stale' when the page has changed since (it is not kept)
    save(id, events, { page, v, size, jpeg }) {
      if (!PAGE_ID.test(String(page)) || !SIZES.includes(size) || !/^[a-f0-9]{12}$/.test(String(v))) return 'bad'
      const versions = pageVersions(events)
      if (versions.get(page) !== v) return 'stale'
      mkdirSync(dir(id), { recursive: true })
      const idx = readIndex(id)
      const was = idx.pages[page]
      const d = was?.v === v ? was : { v }
      // the older version's pictures go: one of each size per page
      if (was && was.v !== v) for (const k of SIZES) if (was[k]) try { unlinkSync(join(dir(id), was[k])) } catch {}
      const file = `${page}.${v}.${size}.jpg`
      writeFileSync(join(dir(id), file), jpeg)
      d[size] = file
      idx.pages[page] = d
      idx.first = versions.keys().next().value || null
      writeIndex(id, idx)
      return 'ok'
    },
    // the build's cover: its first page's saved picture (the full one, else the small one)
    cover(id) {
      const idx = readIndex(id), d = idx.first && idx.pages[idx.first]
      const f = d?.f || d?.s
      return f ? url(id, f) : null
    },
    file(id, f) { return SNAP_FILE.test(f) ? join(dir(id), f) : null }
  }
}
