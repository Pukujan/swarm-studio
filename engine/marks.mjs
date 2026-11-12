// Scribble: marks the agent can read (docs/specs/29-chats-references-marks.md, "Scribble"). The logic is
// ported from kresilo (src/creative/canvasMarks.ts): a mark points at the smallest element holding its
// centre, else the one it covers most of (at least a quarter). Here a mark is drawn on a page's artboard in
// the Overview; the page's hidden copy (web/canvas.js, swarm.marks.anchor) runs `ANCHOR_JS` to find what
// it points at.
//
//   mark   { id: 'k1', kind: 'stroke' | 'box' | 'ring', page, box: { x, y, w, h }, pts: [[x, y]…], note,
//            target: { section, selector, path, text, tag, region } }
//
// box and pts are fractions of the page (0..1), so zoom does not change them. A sent mark is kept on the
// run as a `marks` event; `mark:status` events close it (a draft accepted or dismissed) or erase it.

export const MARK_LIMIT = 40
const KINDS = new Set(['stroke', 'box', 'ring'])
const MID = /^k\d{1,4}$/
const KEY = /^[\w*-]{1,64}\/[\w-]{1,64}$/
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const frac = v => Math.max(0, Math.min(1, Number(v) || 0))
const box = b => b && typeof b === 'object' ? { x: frac(b.x), y: frac(b.y), w: frac(b.w), h: frac(b.h) } : null
const r2 = v => Math.round(v * 100) / 100

// what the Overview sent, made safe: at most MARK_LIMIT, each with a kind, a page and a box
export function cleanMarks(list, { pages = null } = {}) {
  if (!Array.isArray(list)) return []
  const seen = new Set(), out = []
  for (const m of list.slice(0, MARK_LIMIT)) {
    if (!m || !MID.test(String(m.id)) || seen.has(m.id)) continue
    const page = clip(m.page, 64)
    if (!/^[\w-]{1,64}$/.test(page) || (pages && !pages.includes(page))) continue
    const b = box(m.box)
    if (!b || b.w <= 0 || b.h <= 0) continue
    seen.add(m.id)
    const t = m.target && typeof m.target === 'object' ? m.target : {}
    out.push({
      id: m.id, kind: KINDS.has(m.kind) ? m.kind : 'stroke', page, box: b,
      pts: Array.isArray(m.pts) ? m.pts.slice(0, 400).filter(p => Array.isArray(p)).map(([x, y]) => [Math.round(frac(x) * 1e4) / 1e4, Math.round(frac(y) * 1e4) / 1e4]) : [],
      note: clip(m.note, 200),
      target: {
        section: KEY.test(String(t.section || '')) ? t.section : null,
        selector: clip(t.selector, 200) || null,
        path: Array.isArray(t.path) ? t.path.slice(0, 16).map(n => Math.max(0, Math.floor(Number(n) || 0))) : [],
        text: clip(t.text, 120) || null,
        tag: /^[a-z][a-z0-9-]{0,20}$/.test(String(t.tag || '')) ? t.tag : null,
        region: t.region ? box(t.region) : null
      }
    })
  }
  return out
}

// "Mark k1 (stroke) on page home, section home/hero, element "section > h1" ("Fresh leaf, every week"): bigger"
export function markLine(m, { role = null } = {}) {
  const t = m.target || {}
  const where = [`on page ${m.page}`]
  if (t.section) where.push(`section ${t.section}${role ? ` (${role})` : ''}`)
  if (t.selector) where.push(`element "${t.selector}"${t.text ? ` ("${t.text}")` : ''}`)
  else if (!t.section) where.push(`at x ${r2(m.box.x)} y ${r2(m.box.y)} of the page`)
  const region = t.region ? `, region x ${r2(t.region.x)} y ${r2(t.region.y)} w ${r2(t.region.w)} h ${r2(t.region.h)} of the ${t.tag === 'img' ? 'picture' : 'element'}` : ''
  return `Mark ${m.id} (${m.kind}) ${where.join(', ')}${region}${m.note ? `: ${m.note}` : ''}`
}

// the marks sent earlier on this run that are still open (not closed by a draft, not erased)
export function openMarks(events = []) {
  const all = new Map()
  for (const e of events) {
    if (e.type === 'marks') for (const m of e.marks || []) all.set(m.id, { ...m, status: 'open', sent: e.t })
    if (e.type === 'mark:status') for (const id of e.ids || []) { const m = all.get(id); if (m) m.status = e.status }
  }
  return [...all.values()].filter(m => m.status === 'open')
}

// the next free mark id on a run (k1, k2, …): ids are never reused, so "k3" always means one mark
export function nextMarkId(events = []) {
  let n = 0
  for (const e of events) if (e.type === 'marks') for (const m of e.marks || []) n = Math.max(n, Number(String(m.id).slice(1)) || 0)
  return n + 1
}

// The vision model reads the marks: one picture of each page with its marks on it, a crop around each
// mark, and the data lines. It answers how it read each one and the change it means.
export function readMarksMessages({ text, marks, open = [], roles = {}, shots = [], crops = [] }) {
  const lines = marks.map(m => markLine(m, { role: roles[m.target?.section] })).join('\n')
  const still = open.length ? `\n\nMarks still open from earlier:\n${open.map(m => markLine(m, { role: roles[m.target?.section] })).join('\n')}` : ''
  const content = [{ type: 'text', text: `The person's message: "${text || '(no words, only the marks)'}"\n\nMarks:\n${lines}${still}\n\nThe pictures: ${shots.map(s => `the page "${s.page}" with its marks drawn on it`).concat(crops.map(c => `a close crop around mark ${c.id}`)).join('; ')}.` }]
  for (const s of shots) content.push({ type: 'image_url', image_url: { url: s.image } })
  for (const c of crops) content.push({ type: 'image_url', image_url: { url: c.image } })
  return [
    {
      role: 'system',
      content: `A person drew marks on the pages of a website they are designing, to show what to change. You see each page with the marks drawn on it, a close crop around each mark, and a data line per mark naming the element under it.

Read each mark. For each one, say in one short line how you read it, written to the person ("k1: you want the heading larger and on one line"), and the change a web developer should make, naming the element. Change exactly what was marked, nothing else. When a mark is unclear, ask about that mark instead of guessing.

Return JSON only: {"reads":[{"mark":"k1","read":"one line to the person","change":"the change, under 40 words","ask":"a question, only when unclear"}]}`
    },
    { role: 'user', content }
  ]
}

export function parseReads(text, marks) {
  const ids = new Set(marks.map(m => m.id))
  let raw = {}
  try { const a = text.indexOf('{'), b = text.lastIndexOf('}'); raw = JSON.parse(text.slice(a, b + 1)) } catch { raw = {} }
  return (Array.isArray(raw.reads) ? raw.reads : []).filter(r => r && ids.has(r.mark)).map(r => ({ mark: r.mark, read: clip(r.read, 160), change: clip(r.change, 300), ask: clip(r.ask, 160) || null }))
}

// What the section's builder is told: the person's words, each mark on this section with how it was read,
// and the rule to change only those targets.
export function fixText({ text, marks, reads = [], role = null }) {
  const by = new Map(reads.map(r => [r.mark, r]))
  const lines = marks.map(m => {
    const r = by.get(m.id)
    return `- ${markLine(m, { role })}${r?.change ? `\n  Meaning: ${r.change}` : ''}`
  }).join('\n')
  return `${text ? `${text}\n` : ''}The person marked these spots:\n${lines}\nChange exactly those targets and nothing else.`.slice(0, 2400)
}
