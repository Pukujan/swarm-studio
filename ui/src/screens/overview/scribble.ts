// Scribble's rules (spec 29; web/project.js "Scribble", moved as it is): a mark is drawn on a page's artboard and
// kept as fractions of the whole page (x of its width, y of its height), so it sits on the same spot however the
// page is drawn. A drag is a stroke; a stroke that comes back near its start is a ring; with Shift it is a box.
// Nothing here touches the screen but `shotsOf`, which draws the pictures a send carries.
import type { DeckEvent } from '../deck/model.ts'

export type Pt = [number, number]
export interface Box { x: number, y: number, w: number, h: number }
// what a mark points at (web/markanchor.js), as the server keeps it (engine/marks.mjs cleanMarks)
export interface Target { section: string | null, selector: string | null, path: number[], text: string | null, tag: string | null, region: Box | null }
export interface Mark { id: string, run: string, page: string, kind: 'stroke' | 'ring' | 'box', pts: Pt[], box: Box, note: string, target: Target | null }
// a mark the run has (sent): drawn dashed until its draft is closed or it is erased
export interface SentMark { id: string, page: string, kind: Mark['kind'], pts: Pt[], box: Box, status: string }
export interface Draft { id: string, page: string, layer: string, role: string, html: string, marks: string[] }
export interface RunMarks { sent: SentMark[], reads: Record<string, string>, drafts: Draft[], drafting: { page: string, layer: string, role: string }[] }

// 40 unsent marks at most (web/project.js finishMark; the server takes no more, engine/marks.mjs MARK_LIMIT)
export const MARK_MAX = 40
export const NO_MARKS: RunMarks = { sent: [], reads: {}, drafts: [], drafting: [] }
export const markWords = (n: number) => `${n} mark${n > 1 ? 's' : ''}`
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function boxOf(pts: Pt[]): Box {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// a drag that ended: the mark it makes, or null for one too small to be meant
export function markFrom(drawn: Pt[], shift: boolean): Pick<Mark, 'kind' | 'pts' | 'box'> | null {
  if (!drawn.length) return null
  const pts = shift ? [drawn[0], drawn[drawn.length - 1]] : drawn
  const box = boxOf(pts)
  if (box.w + box.h < 0.01) return null
  const a = pts[0], b = pts[pts.length - 1]
  const closed = pts.length > 8 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.3 * Math.hypot(box.w, box.h)
  return { kind: shift ? 'box' : closed ? 'ring' : 'stroke', pts: shift ? [] : pts, box }
}

// a page's artboard shows nine widths of it at most (model.ts pageH): y on the artboard = y on the page × this.
// `ratio`: the page's height over its width, known once its picture has loaded
export const pageK = (ratio?: number) => (ratio ? Math.max(1, ratio / 9) : 1)
// the mark's path in the overlay's 1000 × 1000 box (web/project-parts.js ptsPath, web/project.js markD)
export function markD(m: Pick<Mark, 'kind' | 'pts' | 'box'>, k: number): string {
  if (m.kind === 'box') { const b = m.box, x0 = b.x * 1000, y0 = b.y * k * 1000, x1 = (b.x + b.w) * 1000, y1 = (b.y + b.h) * k * 1000; return `M${x0} ${y0}H${x1}V${y1}H${x0}Z` }
  return m.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 1000).toFixed(1)} ${(y * k * 1000).toFixed(1)}`).join('')
}

// what a run says about its marks and drafts (web/project.js sw.on): replayed from its events, then kept up live
const str = (v: unknown) => (typeof v === 'string' ? v : '')
export function runMarks(was: RunMarks, e: DeckEvent): RunMarks {
  const x = e as DeckEvent & Record<string, unknown>
  switch (e.type) {
    case 'reset': return NO_MARKS
    case 'marks': {
      const add = (Array.isArray(x.marks) ? x.marks : []).filter((m): m is SentMark => !!m && typeof m.id === 'string' && !!m.box).map(m => ({ id: m.id, page: str(m.page), kind: m.kind, pts: Array.isArray(m.pts) ? m.pts : [], box: m.box, status: 'open' }))
      return add.length ? { ...was, sent: [...was.sent.filter(m => !add.some(a => a.id === m.id)), ...add] } : was
    }
    case 'mark:status': {
      const ids = new Set(Array.isArray(x.ids) ? x.ids.map(String) : [])
      return { ...was, sent: was.sent.map(m => (ids.has(m.id) ? { ...m, status: str(x.status) || m.status } : m)) }
    }
    case 'marks:read': {
      const reads = { ...was.reads }
      for (const r of (Array.isArray(x.reads) ? x.reads : []) as { mark?: string, read?: string }[]) if (r?.mark) reads[r.mark] = str(r.read)
      return { ...was, reads }
    }
    case 'draft:start': return { ...was, drafting: [...was.drafting.filter(d => !(d.page === x.page && d.layer === x.layer)), { page: str(x.page), layer: str(x.layer), role: str(x.role) || str(x.layer) }] }
    case 'draft': return {
      ...was, drafting: was.drafting.filter(d => !(d.page === x.page && d.layer === x.layer)),
      drafts: [...was.drafts.filter(d => d.id !== x.id), { id: str(x.id), page: str(x.page), layer: str(x.layer), role: str(x.role) || str(x.layer), html: str(x.html), marks: Array.isArray(x.marks) ? x.marks.map(String) : [] }]
    }
    case 'draft:failed': return { ...was, drafting: was.drafting.filter(d => !(d.page === x.page && d.layer === x.layer)) }
    case 'draft:closed': return { ...was, drafts: was.drafts.filter(d => d.id !== x.id) }
    default: return was
  }
}

// ---------- sending: each page's picture with its marks drawn on it, and a crop round each mark (its box and a
// half more, at least 256 px of the page), as web/project.js sendMarks makes them
const loadImg = (src: string | null | undefined) => new Promise<HTMLImageElement | null>(ok => {
  if (!src) return ok(null)
  const im = new Image()
  im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src
})
function ink(g: CanvasRenderingContext2D, m: Mark, W: number, H: number, lw: number) {
  g.lineCap = g.lineJoin = 'round'
  const path = () => {
    g.beginPath()
    if (m.kind === 'box') g.rect(m.box.x * W, m.box.y * H, m.box.w * W, m.box.h * H)
    else m.pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)))
  }
  path(); g.strokeStyle = 'rgba(11,11,12,.55)'; g.lineWidth = lw * 2; g.stroke()
  path(); g.strokeStyle = '#ff5a36'; g.lineWidth = lw; g.stroke()
}
// `picture(page)`: the page's picture (its saved snapshot); a page with none is sent with its marks' data alone
export async function shotsOf(list: Mark[], picture: (page: string) => string | null | undefined): Promise<{ shots: Record<string, string>, crops: Record<string, string> }> {
  const shots: Record<string, string> = {}, crops: Record<string, string> = {}
  for (const page of new Set(list.map(m => m.page))) {
    const im = await loadImg(picture(page))
    if (!im) continue
    const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')
    if (!g) continue
    try {
      g.drawImage(im, 0, 0)
      const mine = list.filter(m => m.page === page)
      for (const m of mine) ink(g, m, W, H, Math.max(3, W / 240))
      const s = Math.min(1, 1024 / W), o = document.createElement('canvas')
      o.width = Math.round(W * s); o.height = Math.round(Math.min(H * s, 4000))
      o.getContext('2d')?.drawImage(c, 0, 0, W * s, H * s)
      shots[page] = o.toDataURL('image/jpeg', 0.8)
      for (const m of mine) {
        const b = m.box, side = 256 * W / 1280
        const w = Math.min(W, Math.max(side, b.w * W * 1.5)), h = Math.min(H, Math.max(side, b.h * H * 1.5))
        const x0 = Math.max(0, Math.min(W - w, (b.x + b.w / 2) * W - w / 2)), y0 = Math.max(0, Math.min(H - h, (b.y + b.h / 2) * H - h / 2))
        const cc = document.createElement('canvas'), z = Math.min(2, 768 / Math.max(w, h))
        cc.width = Math.round(w * z); cc.height = Math.round(h * z)
        cc.getContext('2d')?.drawImage(c, x0, y0, w, h, 0, 0, cc.width, cc.height)
        crops[m.id] = cc.toDataURL('image/jpeg', 0.85)
      }
    } catch { /* a picture the canvas may not read: the marks go without it */ }
  }
  return { shots, crops }
}
