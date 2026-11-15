// Making a story never holds the server (issue #565): its page shots come from the saved snapshots, or are taken
// after the answer, a few pages and one build at a time; meanwhile every other request is answered.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { storyRoutes, SHOT_CAP } from '../server/story.mjs'
import { startStudio } from '../scripts/studio-child.mjs'

const RUN = '2026-11-14T13-00-00-000Z'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
// a built site of n pages, each with a finished section and no picture (the case that ran Chrome per page)
const site = n => [
  { type: 'run:start', t: 1, brief: 'Saffron, a supper club', title: 'Saffron', agents: [{ id: 'a' }] },
  { type: 'theme', vars: { '--background': '#0b0d0a', '--foreground': '#f2ede1' } },
  ...Array.from({ length: n }, (_, i) => [
    { type: 'page', id: i ? `p${i}` : 'home', title: i ? `Page ${i}` : 'Saffron', purpose: 'a page', index: i },
    { type: 'layer:plan', page: i ? `p${i}` : 'home', id: 'hero', role: 'hero' },
    { type: 'layer:done', page: i ? `p${i}` : 'home', layer: 'hero', html: `<section><h1>Page ${i}</h1><p>Supper after midnight.</p></section>` }
  ]).flat(),
  { type: 'run:done', t: 2 }
]
const runOf = (runsDir, events) => { mkdirSync(join(runsDir, RUN), { recursive: true }); writeFileSync(join(runsDir, RUN, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n') }
const timed = async p => { const t = performance.now(); const r = await p; return { r, ms: performance.now() - t } }

test('the story answers at once: a saved snapshot is used, the other pages are shot after, few and once', async () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-story-'))
  const saved = join(runsDir, 'home.f.jpg')
  writeFileSync(saved, JPEG)
  runOf(runsDir, site(3))
  const asked = [], said = []
  let release
  const slow = new Promise(r => { release = r })
  const routes = storyRoutes({
    runsDir, dataDir: runsDir, readEvents: () => site(3),
    shots: async (id, pages) => { asked.push(pages); await slow; return pages.map(page => ({ page, desktop: `data:image/jpeg;base64,${JPEG.toString('base64')}` })) },
    savedShot: () => page => (page === 'home' ? saved : null),
    notify: (id, type, data) => said.push({ type, ...data })
  })
  const srv = createServer(async (req, res) => { if (!(await routes.handle(req, res, new URL(req.url, 'http://x')))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const post = () => fetch(`http://127.0.0.1:${srv.address().port}/api/runs/${RUN}/story`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"auto":true}' })
  try {
    // the shooter is held until after the answer: the story answers without waiting for it (its cards are drawn,
    // the shotless beats without their screen)
    const { r, ms } = await timed(post())
    assert.equal(r.status, 200)
    assert.ok(ms < 15000, `the story answered in ${Math.round(ms)} ms`)
    const screens = join(runsDir, RUN, 'story', 'screens')
    assert.ok(existsSync(join(screens, 'home-desktop.jpg')), 'the saved snapshot is the home page\'s screen')
    assert.deepEqual(asked, [['p1', 'p2']], 'only the story\'s pages without a snapshot are shot')
    release()
    for (let i = 0; i < 100 && !said.some(x => x.state === 'done'); i++) await new Promise(r => setTimeout(r, 50))
    assert.deepEqual(said.map(x => x.state), ['shooting', 'done'])
    assert.ok(existsSync(join(screens, 'p1-desktop.jpg')))
    // a redraw does not shoot them again
    await post()
    assert.equal(asked.length, 1)
    assert.ok(SHOT_CAP <= 12)
  } finally { srv.close(); rmSync(runsDir, { recursive: true, force: true }) }
})

test('while a big site\'s story is made, the server answers every other request within a second', async () => {
  const data = mkdtempSync(join(tmpdir(), 'swarm-story-live-'))
  const runsDir = join(data, 'runs')
  runOf(runsDir, site(150))
  const env = { ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: data, SWARM_RUNS_DIR: runsDir, SWARM_OUTPUT_DIR: join(data, 'out'), HERMES_HOME: join(data, 'hermes'), SWARM_HERMES_RUNNING: '0' }
  const { child, base } = await startStudio({ env })
  const call = (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-swarm-token': 't', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  try {
    let done = false
    const story = timed(call(`/api/runs/${RUN}/story`, { auto: true })).finally(() => { done = true })
    const waits = []
    while (!done && waits.length < 200) { const { r, ms } = await timed(call('/api/state')); await r.text(); waits.push(ms); await new Promise(r => setTimeout(r, 25)) }
    const { r, ms } = await story
    assert.equal(r.status, 200, await r.text())
    assert.ok(waits.length > 0)
    assert.ok(Math.max(...waits) < 1000, `GET /api/state took ${Math.round(Math.max(...waits))} ms while the story was made`)
    assert.ok(ms < 30000, `the story took ${Math.round(ms)} ms`)
  } finally {
    const gone = new Promise(r => child.once('exit', r))
    child.kill()
    await gone
    rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

test('the pages a story photographs are the site\'s pages alone: no search pass, so no browser run in line', async () => {
  const { exportPages } = await import('../engine/export.mjs')
  const src = readFileSync(new URL('../engine/export.mjs', import.meta.url), 'utf8')
  const body = src.slice(src.indexOf('export async function exportPages'), src.indexOf('export async function exportRun'))
  assert.doesNotMatch(body, /seoSite|pageShot|zip\(/)
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-pages-'))
  try {
    const out = await exportPages({ events: site(3), runId: RUN, runDir: join(runsDir, RUN), outDir: join(runsDir, RUN, 'story', 'site') })
    assert.deepEqual(out.html, ['index.html', 'p1.html', 'p2.html'])
    assert.match(readFileSync(join(out.dir, 'html', 'p1.html'), 'utf8'), /Supper after midnight/)
    assert.ok(!existsSync(join(runsDir, RUN, 'export')), 'never the export Publish reads')
  } finally { rmSync(runsDir, { recursive: true, force: true }) }
})
