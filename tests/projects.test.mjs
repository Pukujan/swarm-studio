// node --test tests/projects.test.mjs
// One idea is one project with one name, everywhere (docs/specs/18-projects.md):
// the brand from the brief, never a screen; a run joins its brand's project as a piece.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandOf, deployName, isScreenName, packageName, pieceKind, projectName } from '../engine/naming.mjs'
import { snapshot } from '../engine/export.mjs'
import { makeProjects, gameProgress, stateOf } from '../server/projects.mjs'

const SITE = 'ARES — Boss Rush of the Burning Colosseum: an original fast first-person arena shooter boss rush.'
const APP = 'ARES Player Hub — the account app for ARES, an original fast first-person arena shooter boss rush where players sign in.'

test('the brand comes from the brief, and a piece name belongs to its brand', () => {
  assert.equal(brandOf(SITE), 'ARES')
  assert.equal(brandOf(APP), 'ARES')
  assert.equal(projectName({ brief: SITE }), 'ARES')
  assert.equal(projectName({ brief: APP }), 'ARES')
  assert.equal(brandOf('Atelier Nord client portal for a small architecture studio: clients sign in'), 'Atelier Nord')
  assert.equal(brandOf('Tempo, a focus timer for remote teams'), 'Tempo')
  assert.equal(brandOf('Make a website for Lumen Coffee, a roastery'), 'Lumen Coffee')
  // no brand: the brief's first words
  assert.equal(brandOf('a tiny ramen bar in Osaka'), '')
  assert.equal(projectName({ brief: 'a tiny ramen bar in Osaka' }), 'Tiny Ramen Bar')
  // a game's own brand comes before the first words
  assert.equal(projectName({ brief: 'a boss rush with ten bosses', brand: 'Cinder Gate' }), 'Cinder Gate')
})

test('a screen word never names a project, a package or a deploy', () => {
  for (const s of ['Sign In to ARES', 'Sign in', 'Log in', 'Login', 'Home', 'Dashboard', 'Welcome to Tempo', 'Untitled', 'index', 'Admin', 'Admin panel', 'Your Account'])
    assert.equal(isScreenName(s), true, s)
  for (const s of ['ARES', 'Home Run Pizza', 'Tempo', 'Atelier Nord']) assert.equal(isScreenName(s), false, s)
  assert.equal(projectName({ given: 'Sign In to ARES', brief: APP }), 'ARES')
  assert.equal(projectName({ brief: 'Sign in — the first screen' }), 'Swarm build')
  assert.equal(packageName('Sign In to ARES', 'scaffold'), 'scaffold')
  assert.equal(packageName('ARES'), 'ares')
  assert.equal(deployName('Sign In to ARES', 'app'), 'swarm-app')
})

test('deploy names are <project>-<kind>', () => {
  assert.equal(deployName('ARES', 'app'), 'ares-app')
  assert.equal(deployName('ARES', 'site'), 'ares-site')
  assert.equal(deployName('Atelier Nord', 'game'), 'atelier-nord-game')
  assert.equal(deployName('ares-app', 'app'), 'ares-app')
  assert.equal(deployName('ARES', 'nonsense'), 'ares-site')
})

test('which piece a run is', () => {
  assert.equal(pieceKind({ brief: SITE, pages: 4 }), 'site')
  assert.equal(pieceKind({ brief: APP, pages: 4, kind: 'app' }), 'app')
  assert.equal(pieceKind({ brief: 'Atelier Nord client portal for a studio', pages: 3 }), 'app')
  assert.equal(pieceKind({ brief: SITE, game: true }), 'game')
  assert.equal(pieceKind({ brief: SITE, pages: 0, video: true }), 'film')
  assert.equal(pieceKind({ brief: SITE, piece: 'film' }), 'film')
})

test('an app export is named after the project, not its first screen', () => {
  const events = [{ type: 'run:start', brief: APP }, { type: 'page', id: 'signin', title: 'Sign In to ARES', index: 0 }]
  assert.equal(snapshot(events).brand, 'ARES')
  assert.equal(snapshot(events, [], { name: 'Ares Arena' }).brand, 'Ares Arena')
  assert.equal(snapshot(events, [], { name: 'Sign in' }).brand, 'ARES')
})

// ---------- joining: a stand-in run list, as the server's runCard and runMeta give it
function world() {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-projects-'))
  const runsDir = join(dir, 'runs'), cards = {}, metas = {}
  mkdirSync(runsDir, { recursive: true })
  const add = (id, card, meta = {}) => {
    mkdirSync(join(runsDir, id), { recursive: true })
    writeFileSync(join(runsDir, id, 'events.jsonl'), '{}\n')
    cards[id] = { id, t: Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z')) || 0, pages: 4, sites: {}, ...card }
    cards[id].autoTitle = cards[id].title
    metas[id] = meta
  }
  const p = makeProjects({ runsDir, dataDir: join(dir, 'data'), runCard: id => cards[id] || null, runMeta: id => metas[id] || {}, isLive: () => false })
  return { p, add, runsDir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a run whose brand is a project\'s name joins it as a piece, with one name', () => {
  const w = world()
  try {
    w.add('2026-11-11T03-32-37-133Z', { title: 'ARES — Boss Rush of the Burning Colosseum', brief: SITE, game: true, sites: { vercel: 'https://ares-site.vercel.app' } })
    w.add('2026-11-11T03-33-59-295Z', { title: 'Sign In to ARES', brief: APP, kind: 'app', app: true, deployed: 'https://ares-app.vercel.app' })
    const { projects } = w.p.list()
    assert.equal(projects.length, 1)
    const ares = projects[0]
    assert.equal(ares.name, 'ARES')
    assert.equal(ares.title, 'ARES')
    assert.deepEqual(ares.pieces.map(x => [x.kind, x.runId, x.live]), [
      ['site', '2026-11-11T03-32-37-133Z', 'https://ares-site.vercel.app'],
      ['app', '2026-11-11T03-33-59-295Z', 'https://ares-app.vercel.app']
    ])
    assert.equal(JSON.parse(readFileSync(join(w.runsDir, 'folders.json'), 'utf8')).projects['2026-11-11T03-32-37-133Z'].name, 'ARES')
    // the same kind again is that piece's next version
    w.add('2026-11-11T04-00-00-000Z', { title: 'ARES Player Hub', brief: APP, kind: 'app', app: true })
    const again = w.p.list().projects
    assert.equal(again.length, 1)
    assert.deepEqual(again[0].pieces.map(x => [x.kind, x.runId, x.versions]), [['site', '2026-11-11T03-32-37-133Z', 1], ['app', '2026-11-11T04-00-00-000Z', 2]])
    const index = w.p.runIndex()
    assert.deepEqual(index.get('2026-11-11T03-33-59-295Z'), { project: '2026-11-11T03-32-37-133Z', name: 'ARES', piece: 'app' })
    // another brand is another project, even with a brief much like it
    w.add('2026-11-11T05-00-00-000Z', { title: 'HERA', brief: SITE.replace('ARES', 'HERA') })
    assert.equal(w.p.list().projects.length, 2)
  } finally { w.cleanup() }
})

test('the start request can name the project by id or by name; Trash is never joined', () => {
  const w = world()
  try {
    w.add('2026-11-11T01-00-00-000Z', { title: 'Tempo', brief: 'Tempo, a focus timer for remote teams' })
    // named by its name: a run with no brand of its own
    w.add('2026-11-11T02-00-00-000Z', { title: 'Trailer', brief: 'a moody trailer with rain', pages: 0, video: true }, { projectName: 'tempo' })
    // named by its id
    w.add('2026-11-11T03-00-00-000Z', { title: 'Game', brief: 'a tiny arcade game', kind: 'game' }, { project: '2026-11-11T01-00-00-000Z' })
    let { projects } = w.p.list()
    assert.equal(projects.length, 1)
    assert.deepEqual(projects[0].pieces.map(x => x.kind), ['site', 'film', 'game'])
    assert.equal(w.p.resolve('TEMPO'), '2026-11-11T01-00-00-000Z')
    w.p.op({ op: 'trash', id: '2026-11-11T01-00-00-000Z' })
    assert.equal(w.p.resolve('Tempo'), null)
    w.add('2026-11-11T04-00-00-000Z', { title: 'Tempo', brief: 'Tempo, a focus timer, again' })
    projects = w.p.list().projects
    assert.equal(projects.length, 2)
    // a rename renames the project's one name, but never to a screen word
    const fresh = projects.find(x => !x.trashed)
    w.p.op({ op: 'rename', id: fresh.id, title: 'Tempo Two' })
    assert.equal(w.p.get(fresh.id).name, 'Tempo Two')
    w.p.op({ op: 'rename', id: fresh.id, title: 'Dashboard' })
    assert.equal(w.p.get(fresh.id).name, 'Tempo Two')
  } finally { w.cleanup() }
})

test('a game card says how far its build is: art n of N, then the stage, or Stopped', () => {
  const steps = ['painting the game\'s art: 10 pictures', 'painting in Anime cel', 'using 6 pictures painted before; painting 4', 'painted the sprite of Mika', 'could not paint the icon']
  assert.deepEqual(gameProgress(steps.map(text => ({ text }))), { art: [7, 10] })
  assert.deepEqual(gameProgress([...steps, 'stage 2 of 5: the run of rooms', 'turn 1: building']), { stage: [2, 5] })
  assert.equal(gameProgress(['turn 1']), null)
  const game = { kind: 'game', game: true, pages: 0 }
  assert.equal(stateOf({ ...game, work: { what: 'game', progress: { art: [7, 10] } } }).status, 'Painting art · 7 of 10')
  assert.equal(stateOf({ ...game, work: { what: 'game', progress: { stage: [2, 5] } } }).status, 'Building · stage 2 of 5')
  assert.equal(stateOf({ ...game, build: 'working' }).status, 'Stopped')
})

test('a retry of a game replaces a try that left nothing behind', () => {
  const w = world()
  try {
    const brief = 'Rooftop Signal: a rooftop runner game'
    w.add('2026-11-11T12-29-35-444Z', { title: 'Rooftop Signal', brief, kind: 'game', game: true, pages: 0, build: 'working' }, { projectName: 'Rooftop Signal' })
    w.add('2026-11-11T12-45-22-265Z', { title: 'Rooftop Signal', brief, kind: 'game', game: true, pages: 0, build: 'working', cover: '/img/x/game-title.webp', work: { what: 'game', progress: { stage: [2, 5] } } }, { projectName: 'Rooftop Signal' })
    const [p] = w.p.list().projects
    assert.equal(p.count, 1)
    assert.equal(p.cover, '/img/x/game-title.webp')
    assert.equal(p.state.status, 'Building · stage 2 of 5')
    // a try with art of its own stays a version
    w.add('2026-11-11T13-00-28-617Z', { title: 'Rooftop Signal', brief, kind: 'game', game: true, pages: 0, build: 'failed', cover: '/img/y/game-title.webp' }, { projectName: 'Rooftop Signal' })
    assert.equal(w.p.list().projects[0].count, 2)
  } finally { w.cleanup() }
})

test('one idea is one card: the same name, or that name plus more words, folds into the older project', () => {
  const w = world()
  try {
    w.add('2026-11-11T12-29-35-444Z', { title: 'Rooftop Signal', brief: 'Rooftop Signal, a rain-soaked rooftop platformer', kind: 'game' })
    w.add('2026-11-11T13-00-28-617Z', { title: 'Rooftop Signal Art Test', brief: 'Rooftop Signal Art Test: sprint across skylines', kind: 'game' }, { projectName: 'Rooftop Signal Art Test' })
    w.add('2026-11-11T14-00-00-000Z', { title: 'Lantern Drift', brief: 'Lantern Drift, a night river game', kind: 'game' })
    let { projects } = w.p.list()
    assert.deepEqual(projects.map(x => x.name).sort(), ['Lantern Drift', 'Rooftop Signal'])
    assert.equal(projects.find(x => x.name === 'Rooftop Signal').pieces[0].versions, 2)
    // split off by the person: it stays its own
    w.p.op({ op: 'split', id: '2026-11-11T12-29-35-444Z', run: '2026-11-11T13-00-28-617Z' })
    projects = w.p.list().projects
    assert.equal(projects.length, 3)
  } finally { w.cleanup() }
})

test('the version being built leads the card, even when a newer try exists', () => {
  const w = world()
  try {
    const brief = 'Rooftop Signal: a rooftop runner game'
    w.add('2026-11-11T12-45-22-265Z', { title: 'Rooftop Signal', brief, kind: 'game', game: true, pages: 0, build: 'working', cover: '/img/a/game-title.webp', work: { what: 'game', progress: { stage: [1, 4] } } }, { projectName: 'Rooftop Signal' })
    w.add('2026-11-11T13-00-28-617Z', { title: 'Rooftop Signal Art Test', brief, kind: 'game', game: true, pages: 0, build: 'stopped', cover: '/img/b/game-title.webp' }, { projectName: 'Rooftop Signal' })
    const [p] = w.p.list().projects
    assert.equal(p.count, 2)
    assert.equal(p.head, '2026-11-11T12-45-22-265Z')
    assert.equal(p.state.status, 'Building · stage 1 of 4')
    assert.equal(p.cover, '/img/a/game-title.webp')
  } finally { w.cleanup() }
})
