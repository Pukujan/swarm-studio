// Which page the Overview photographs next, by spec 36's rules as web/project.js thumbs() and shootNext() keep them:
// only a page with no saved picture of its current version, one at a time, a page in view first, the small picture
// before the full one, never while the camera moves, and a page still laid out as a thin strip tried again a few
// times. One picture taken inside the page makes both sizes (web/capture.js); a page whose small picture is saved
// but not its full one is photographed for the full one alone.
import type { Board } from './model'

// pictures taken here, as data URLs, for the version they are of (shown at once, and kept on the server)
export interface Kept { v: string, s?: string, f?: string }
export interface Job { page: string, v: string, scales: number[] }
export interface Want { s: Map<string, string>, f: Map<string, string> }

// the camera rests this long before a picture is taken
export const REST_MS = 400
// a page that came out a thin strip is tried again this many times, this far apart
export const TRIES = 8
export const RETRY_MS = 2500
export const SMALL = 0.25
export const FULL = 0.6

// page id → the version it wants a picture of, by size; a version photographed here already is not wanted again
export function wanted(board: Board | null, kept: ReadonlyMap<string, Kept>): Want {
  const want: Want = { s: new Map(), f: new Map() }
  for (const p of board?.pages || []) {
    const d = board?.snaps?.pages?.[p.id]
    if (!d?.v || kept.get(p.id)?.v === d.v) continue
    if (!d.s) want.s.set(p.id, d.v)
    else if (!d.f) want.f.set(p.id, d.v)
  }
  return want
}

// the next picture: a small one in view, else a full one in view, else none (a page out of view waits)
export function pick(want: Want, inView: (page: string) => boolean, failed: ReadonlySet<string>): Job | null {
  for (const [page, v] of want.s) if (!failed.has(page) && inView(page)) return { page, v, scales: [SMALL, FULL] }
  for (const [page, v] of want.f) if (!failed.has(page) && inView(page)) return { page, v, scales: [FULL] }
  return null
}

// a picture of a page still being laid out is a thin strip: it waits for a page-shaped one
export const pageShaped = (width: number, height: number) => height > width * 0.6

// the board with the pictures taken here drawn in: a page that changed keeps the last picture taken of it until its
// new one comes (no blank artboard meanwhile), and one just taken shows before the server is asked again
export function withShots(board: Board | null, kept: ReadonlyMap<string, Kept>): Board | null {
  if (!board || !kept.size) return board
  const pages = { ...board.snaps?.pages }
  for (const [id, k] of kept) {
    const d = pages[id]
    if (!d || !k.s) continue
    if (!d.s) pages[id] = k.v === d.v && k.f ? { ...d, s: k.s, f: k.f } : { v: d.v, s: k.s }
    else if (!d.f && k.v === d.v && k.f) pages[id] = { ...d, f: k.f }
  }
  return { ...board, snaps: { ...board.snaps, pages } }
}
