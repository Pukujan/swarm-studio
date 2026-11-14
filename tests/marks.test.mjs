// node --test tests/marks.test.mjs
// Scribble (spec 29): marks the agent can read. The request holds each mark's target, note and crop;
// earlier open marks go along until a draft closes them or they are erased.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanMarks, markLine, openMarks, nextMarkId, readMarksMessages, parseReads, fixText, MARK_LIMIT } from '../engine/marks.mjs'

const HEAD = { id: 'k1', kind: 'ring', page: 'home', box: { x: 0.3, y: 0.05, w: 0.4, h: 0.04 }, pts: [[0.3, 0.05], [0.7, 0.09]], note: 'bigger, and on one line',
  target: { section: 'home/home-hero', selector: 'section > h1', path: [0, 1], text: 'Fresh leaf, every week', tag: 'h1' } }
const PHOTO = { id: 'k2', kind: 'box', page: 'home', box: { x: 0.5, y: 0.1, w: 0.2, h: 0.1 }, note: 'warmer',
  target: { section: 'home/home-hero', selector: 'img', path: [0, 2], tag: 'img', region: { x: 0.4, y: 0.28, w: 0.14, h: 0.09 } } }

test('marks are cleaned: ids, kinds, fractions, at most the limit', () => {
  const out = cleanMarks([HEAD, { ...HEAD }, { id: 'x', page: 'home', box: HEAD.box }, { id: 'k3', page: 'home', box: { x: 2, y: -1, w: 0, h: 0 } }, { id: 'k4', kind: 'scribble', page: 'home', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, target: { section: '<b>', selector: 'a'.repeat(400) } }])
  assert.deepEqual(out.map(m => m.id), ['k1', 'k4'], 'a repeat, a bad id and an empty box are dropped')
  assert.equal(out[1].kind, 'stroke')
  assert.equal(out[1].target.section, null)
  assert.equal(out[1].target.selector.length, 200)
  assert.equal(cleanMarks(Array.from({ length: 60 }, (_, i) => ({ ...HEAD, id: `k${i + 1}` }))).length, MARK_LIMIT)
})

test('a mark line names the section, the element, its text and the note; a picture gets its region', () => {
  assert.equal(markLine(HEAD, { role: 'hero' }), 'Mark k1 (ring) on page home, section home/home-hero (hero), element "section > h1" ("Fresh leaf, every week"): bigger, and on one line')
  assert.match(markLine(PHOTO), /element "img", region x 0.4 y 0.28 w 0.14 h 0.09 of the picture: warmer$/)
  assert.match(markLine({ id: 'k9', kind: 'stroke', page: 'about', box: { x: 0.12, y: 0.5, w: 0.1, h: 0.1 }, target: {} }), /at x 0.12 y 0.5 of the page$/)
})

test('the reader gets the pages, a crop per mark, the data lines and the still-open marks', () => {
  const msgs = readMarksMessages({ text: 'make it pop', marks: [HEAD], open: [PHOTO], roles: { 'home/home-hero': 'hero' }, shots: [{ page: 'home', image: 'data:image/jpeg;base64,AAAA' }], crops: [{ id: 'k1', image: 'data:image/jpeg;base64,BBBB' }] })
  assert.match(msgs[0].content, /Read each mark/)
  assert.match(msgs[0].content, /Change exactly what was marked, nothing else/)
  assert.match(msgs[0].content, /ask about that mark instead of guessing/)
  const [txt, ...pics] = msgs[1].content
  assert.match(txt.text, /section > h1/)
  assert.match(txt.text, /Fresh leaf, every week/)
  assert.match(txt.text, /bigger, and on one line/)
  assert.match(txt.text, /Marks still open from earlier:\nMark k2/)
  assert.deepEqual(pics.map(p => p.image_url.url), ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'])
})

test('a removed mark leaves no trace in the request', () => {
  // Eraser or Clear on the Overview: the mark is simply not among those sent
  const msgs = readMarksMessages({ text: '', marks: [HEAD], shots: [], crops: [{ id: 'k1', image: 'data:image/jpeg;base64,BBBB' }] })
  const all = JSON.stringify(msgs)
  assert.ok(!all.includes('k2') && !all.includes('warmer'))
  assert.ok(!fixText({ text: 'x', marks: [HEAD] }).includes('k2'))
})

test('still open: a draft closes its marks, Eraser erases one; ids are never reused', () => {
  const ev = [
    { type: 'marks', t: 1, marks: [HEAD, PHOTO] },
    { type: 'mark:status', t: 2, ids: ['k1'], status: 'closed', draft: 'accepted' }
  ]
  assert.deepEqual(openMarks(ev).map(m => m.id), ['k2'])
  assert.deepEqual(openMarks([...ev, { type: 'mark:status', t: 3, ids: ['k2'], status: 'erased' }]), [])
  assert.equal(nextMarkId(ev), 3)
  assert.equal(nextMarkId([]), 1)
})

test('reads are kept for real marks; the builder is told the marks, how they were read, and nothing else', () => {
  const reads = parseReads('sure {"reads":[{"mark":"k1","read":"k1: you want the heading larger and on one line","change":"make the h1 text-6xl and nowrap"},{"mark":"k7","read":"?"}]}', [HEAD])
  assert.deepEqual(reads.map(r => r.mark), ['k1'])
  const t = fixText({ text: 'make it pop', marks: [HEAD], reads, role: 'hero' })
  assert.match(t, /^make it pop\nThe person marked these spots:/)
  assert.match(t, /section > h1/)
  assert.match(t, /Meaning: make the h1 text-6xl and nowrap/)
  assert.match(t, /Change exactly those targets and nothing else\.$/)
  assert.deepEqual(parseReads('no json', [HEAD]), [])
})
