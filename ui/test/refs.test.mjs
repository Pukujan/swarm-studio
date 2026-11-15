// A drop to References (src/shared/refs.ts, issue #543): where it goes, Hermia's words (web/refdrop.js's), and Use as
// is moving what was added to the project's Assets. Node runs the TypeScript file as it is (type stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addRefs, askLabel, askLine, inRefs, placeAsIs, placed, refAt, whatOf } from '../src/shared/refs.ts'

// a fake server: answers each call from `answer(path, init)` and keeps what was asked
function server(answer) {
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    const [status, body] = answer(path, init, calls.length)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  return { api, calls }
}
const file = (name, type = 'image/png') => new File(['x'], name, { type })

test('a drop goes to the project when it is known, else to the build, else nowhere', () => {
  assert.equal(refAt('p 1', 'r1'), '/api/projects/p%201')
  assert.equal(refAt(null, 'run-7'), '/api/runs/run-7')
  assert.equal(refAt(undefined, undefined), null)
})

test("Hermia's words: the file's name, or how many", () => {
  const one = [{ id: 'a', name: 'moodboard.png' }]
  const two = [{ id: 'a', name: 'a.png' }, { id: 'b', name: 'b.png' }]
  assert.equal(whatOf(one), 'moodboard.png')
  assert.equal(whatOf(two), '2 files')
  assert.equal(askLine(whatOf(one)), 'I put moodboard.png in References. Like this, or use as is?')
  assert.equal(inRefs(whatOf(two)), '2 files is in References.')
  assert.equal(placed(whatOf(two)), '2 files will be placed as it is.')
  assert.equal(askLabel('a.png'), 'a.png: like this, or use as is?')
})

test('each file is posted to References as an upload, with its name and type', async () => {
  const s = server((path, init, n) => [200, { ref: { id: `r${n}`, name: decodeURIComponent(path.match(/name=([^&]+)/)[1]) }, refs: [{ id: 'old', name: 'old' }, { id: `r${n}`, name: 'x' }] }])
  const out = await addRefs(s.api, '/api/runs/r1', [file('a b.png'), file('notes.txt', '')])
  assert.deepEqual(s.calls.map(c => c.path), ['/api/runs/r1/refs?name=a%20b.png&source=upload', '/api/runs/r1/refs?name=notes.txt&source=upload'])
  assert.equal(s.calls[0].init.method, 'POST')
  assert.equal(s.calls[0].init.headers['content-type'], 'image/png')
  assert.equal(s.calls[1].init.headers['content-type'], 'application/octet-stream')
  assert.deepEqual(out.added.map(r => r.id), ['r1', 'r2'])
  assert.deepEqual(out.refs.map(r => r.id), ['old', 'r2'])
})

test("the Studio's board asks for its drop to be read too (source=import)", async () => {
  const s = server(() => [200, { ref: { id: 'r1', name: 'a.png' }, refs: [] }])
  await addRefs(s.api, '/api/projects/p', [file('a.png')], () => {}, 'import')
  assert.equal(s.calls[0].path, '/api/projects/p/refs?name=a.png&source=import')
})

test('a build in no project: the reason is said, nothing is added', async () => {
  const s = server(() => [404, { error: 'this build is not in a project yet' }])
  const said = []
  const out = await addRefs(s.api, '/api/runs/r1', [file('a.png')], t => said.push(t))
  assert.deepEqual(out.added, [])
  assert.deepEqual(said, ['a.png could not be added: this build is not in a project yet.'])
})

test('at most 12 files are taken from one drop', async () => {
  const s = server((_, __, n) => [200, { ref: { id: `r${n}`, name: 'x' }, refs: [] }])
  await addRefs(s.api, '/api/projects/p', Array.from({ length: 15 }, (_, i) => file(`${i}.png`)))
  assert.equal(s.calls.length, 12)
})

test('Use as is posts each added reference to Assets and answers the store as it is after', async () => {
  const s = server((_, init, n) => [200, { refs: [], assets: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: 'x', from: JSON.parse(init.body).ref })) }])
  const out = await placeAsIs(s.api, '/api/projects/p', [{ id: 'r1', name: 'a' }, { id: 'r2', name: 'b' }])
  assert.deepEqual(s.calls.map(c => [c.path, c.init.method, c.init.headers['content-type'], JSON.parse(c.init.body)]), [
    ['/api/projects/p/assets', 'POST', 'application/json', { ref: 'r1' }],
    ['/api/projects/p/assets', 'POST', 'application/json', { ref: 'r2' }]
  ])
  assert.equal(out.assets.length, 2)
  assert.deepEqual(out.refs, [])
})

test('Use as is that the server refuses answers nothing', async () => {
  const s = server(() => [500, { error: 'no' }])
  assert.equal(await placeAsIs(s.api, '/api/projects/p', [{ id: 'r1', name: 'a' }]), null)
})
