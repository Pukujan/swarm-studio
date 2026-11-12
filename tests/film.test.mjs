import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { projectItems, inside, filmSourceOf, filmRoutes } from '../server/film.mjs'
import { filmChecks } from '../engine/filmcritic.mjs'

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'film-'))
  const projectsDir = join(root, 'projects'), pid = 'p1'
  mkdirSync(join(projectsDir, pid, 'refs'), { recursive: true })
  mkdirSync(join(projectsDir, pid, 'assets'), { recursive: true })
  writeFileSync(join(projectsDir, pid, 'refs', 'mood.png'), PNG)
  writeFileSync(join(projectsDir, pid, 'refs', 'track.mp3'), 'ID3')
  writeFileSync(join(projectsDir, pid, 'assets', 'logo.png'), PNG)
  writeFileSync(join(projectsDir, pid, 'assets', 'index.json'), JSON.stringify([{ id: 'a1', kind: 'image', name: 'Logo', file: 'logo.png', role: 'logo' }, { id: 'a2', file: '../escape.png' }, { id: 'a3', file: 'gone.png', removed: 1 }]))
  writeFileSync(join(projectsDir, pid, 'brand.json'), JSON.stringify({ story: { name: 'Lantern Night', what: 'A night market at the harbor' }, palettes: [{ id: 'p', name: 'Harbor', bg: '#0e1a24', text: '#f4ead8', accent: '#e8743b', link: '#6cc4c0' }], types: [{ id: 't', heading: 'Fraunces', body: 'Inter' }], pick: { palette: 'p', type: 't' } }))
  const list = [{ id: 'r1', kind: 'image', name: 'mood.png', file: 'mood.png', use: 'the night light' }, { id: 'r2', kind: 'audio', name: 'track.mp3', file: 'track.mp3' }]
  const refs = { list: () => list, file: (p, f) => (list.some(r => r.file === f) ? { file: join(projectsDir, p, 'refs', f) } : null) }
  return { root, projectsDir, pid, refs }
}

test('projectItems lists References and Assets with their files, never a file outside the store', () => {
  const f = fixture()
  const items = projectItems(f)
  assert.deepEqual(items.map(x => [x.id, x.kind, x.given]), [['r1', 'image', false], ['r2', 'audio', false], ['a1', 'image', true]])
  assert.equal(projectItems({ ...f, pid: '../x' }).length, 0)
  rmSync(f.root, { recursive: true, force: true })
})

test('inside never leaves its folder', () => {
  const f = fixture()
  const run = join(f.projectsDir, f.pid)
  assert.ok(inside(run, 'refs/mood.png'))
  assert.equal(inside(run, '../../x'), null)
  assert.equal(inside(run, '/etc/passwd'), null)
  assert.equal(inside(run, 'refs/none.png'), null)
  rmSync(f.root, { recursive: true, force: true })
})

test('POST /api/projects/:pid/film makes a film run from the brand, refs and assets and starts the film', async () => {
  const f = fixture()
  const runsDir = join(f.root, 'runs')
  let started = null
  const handle = filmRoutes({
    projectsDir: f.projectsDir, refs: f.refs, known: p => p === 'p1',
    makeRun: (pid, events, fill) => { const dir = join(runsDir, 'r-1'); mkdirSync(dir, { recursive: true }); fill(dir); writeFileSync(join(dir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n')); return 'r-1' },
    startFilm: async (run, input) => { started = { run, input }; return { state: 'working' } }
  })
  const ask = (path, body) => new Promise(resolve => {
    const req = new EventEmitter(); req.method = 'POST'; req.destroy = () => {}
    const res = { writeHead: code => ({ end: s => resolve({ code, data: JSON.parse(s) }) }) }
    assert.equal(handle(req, res, new URL(`http://x${path}`)), true)
    req.emit('data', JSON.stringify(body)); req.emit('end')
  })
  assert.equal((await ask('/api/projects/nope/film', { kit: {} })).code, 404)
  assert.equal((await ask('/api/projects/p1/film', {})).code, 400)
  const r = await ask('/api/projects/p1/film', { kit: { beats: [{ text: 'Lanterns wake at seven', frame: { item: 'r1' } }], music: { file: 'r2' }, shape: 'square' } })
  assert.equal(r.code, 200)
  assert.equal(r.data.run, 'r-1')
  assert.deepEqual(started.input.shapes, ['square'])
  const dir = join(runsDir, 'r-1')
  assert.ok(existsSync(join(dir, 'img', 'k1.png')) && existsSync(join(dir, 'img', 'k2.png')))
  assert.ok(existsSync(join(dir, 'video', 'music.mp3')))
  const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').map(l => JSON.parse(l))
  assert.equal(events[0].kind, 'film')
  assert.equal(events.find(e => e.type === 'theme').vars['--primary'], '#e8743b')
  const c = filmSourceOf(events, dir)
  assert.equal(c.brand, 'Lantern Night')
  assert.deepEqual(c.images.map(i => [i.n, i.id]), [[1, 'r1'], [2, 'a1']])
  assert.equal(c.images[0].file, join(dir, 'img', 'k1.png'))
  // a story: all three shapes by default, and the story kept beside the run
  const s = await ask('/api/projects/p1/film', { story: { type: 'event', title: 'Lantern Night', beats: [{ role: 'hook', text: 'Friday at seven' }, { role: 'next', text: 'Come hungry' }] } })
  assert.equal(s.code, 200)
  assert.deepEqual(started.input.shapes, ['wide', 'tall', 'square'])
  assert.equal(started.input.story, true)
  assert.ok(existsSync(join(dir, 'story.json')))
  rmSync(f.root, { recursive: true, force: true })
})

test('the critic holds the film to what was locked: its length and every line of the script', () => {
  const m = { seconds: 30, hasSound: false, blacks: [], silences: [] }
  const board = { lengths: [], scenes: [{ headline: 'Lanterns wake at seven' }, { headline: 'Come Friday', sub: 'lanternnight.example' }], locked: { seconds: 20, script: ['Lanterns wake at seven!', 'Come Friday', 'Forty stalls'] } }
  const checks = filmChecks({ m, board, music: false })
  const len = checks.find(c => c.id === 'length'), script = checks.find(c => c.id === 'script')
  assert.equal(len.ok, false)
  assert.match(len.says, /30 s of the 20 s asked for/)
  assert.equal(script.ok, false)
  assert.match(script.says, /1 of 3 lines left out: “Forty stalls”/)
  const fine = filmChecks({ m: { ...m, seconds: 22 }, board: { ...board, locked: { seconds: 20, script: ['Come Friday'] } }, music: false })
  assert.ok(fine.filter(c => ['length', 'script'].includes(c.id)).every(c => c.ok))
  // a film with nothing locked has neither check
  assert.ok(!filmChecks({ m, board: { lengths: [] }, music: false }).some(c => ['length', 'script'].includes(c.id)))
})
