// A project's source on GitHub (docs/specs/45-intake.md, engine/sourcehub.mjs, server/sourcehub.mjs). A folder
// of bare repositories stands in for GitHub and a small function for `gh`, so nothing here touches the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { keyFile, keyFilesIn, pushSource, remoteHead, joinHistory, repoName, readTarget, sourceLinks, rememberLink, changedUnder, GITHUB } from '../engine/sourcehub.mjs'
import { appJobs } from '../engine/appjob.mjs'
import { bringInRoutes } from '../server/bringin.mjs'
import { sourceRoutes } from '../server/sourcehub.mjs'

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'sourcehub-')))
const put = (root, files) => { for (const [f, text] of Object.entries(files)) { mkdirSync(join(root, f, '..'), { recursive: true }); writeFileSync(join(root, f), text) } return root }
const g = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', '-c', 'protocol.file.allow=always', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
// a run's app/ with a history of its own, as the Studio makes it
const project = files => { const d = put(tmp(), files); g(d, 'init', '-q'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'init'); return d }
const change = (dir, files, msg = 'a change') => { put(dir, files); g(dir, 'add', '-A'); g(dir, 'commit', '-qm', msg) }

// "GitHub": bare repositories in a folder, and gh answering for them as the login `me`
function github({ login = 'me' } = {}) {
  const root = tmp(), calls = [], priv = new Map()
  const at = slug => join(root, `${slug}.git`)
  const hub = { url: at, page: GITHUB.page, file: true }
  const make = (slug, { isPrivate = true, desc = '' } = {}) => { mkdirSync(at(slug), { recursive: true }); g(at(slug), 'init', '-q', '--bare'); g(at(slug), 'symbolic-ref', 'HEAD', 'refs/heads/main'); priv.set(slug, [isPrivate, desc]) }
  const changed = { files: null }
  const gh = async args => {
    calls.push(args)
    if (args[0] === 'api' && args[1] === 'user') return login ? { ok: true, out: `${login}\n`, err: '' } : { ok: false, out: '', err: 'not logged in' }
    const cmp = args[0] === 'api' && args[1].match(/^repos\/(.+)\/compare\//)
    if (cmp) return changed.files ? { ok: true, out: JSON.stringify([changed.files.length, ...changed.files]), err: '' } : { ok: false, out: '', err: 'HTTP 404' }
    const one = args[0] === 'api' && args[1].match(/^repos\/([^/]+\/[^/]+)$/)
    if (one) return priv.has(one[1]) ? { ok: true, out: JSON.stringify(priv.get(one[1])), err: '' } : { ok: false, out: '', err: 'gh: Not Found (HTTP 404)' }
    if (args[0] === 'repo' && args[1] === 'create') { make(args[2], { isPrivate: args.includes('--private'), desc: args[args.indexOf('--description') + 1] }); return { ok: true, out: '', err: '' } }
    return { ok: false, out: '', err: `unexpected gh ${args.join(' ')}` }
  }
  // someone else's commit on the repository
  const commit = (slug, files, msg = 'from elsewhere') => { const c = tmp(); g(c, 'clone', '-q', at(slug), '.'); change(c, files, msg); g(c, 'push', '-q', 'origin', 'HEAD:refs/heads/main'); const sha = g(c, 'rev-parse', 'HEAD'); rmSync(c, { recursive: true, force: true }); return sha }
  const head = slug => g(at(slug), 'rev-parse', 'refs/heads/main')
  return { root, hub, gh, calls, make, commit, head, at, priv, changed }
}

test('a key file is known by its name, an example is not', () => {
  for (const f of ['.env', 'server/.env.production', '.env.local', '.npmrc', 'certs/site.pem', 'deploy/id_rsa', 'a/b/private.key', 'store.p12']) assert.ok(keyFile(f), f)
  for (const f of ['.env.example', '.env.sample', 'src/env.ts', 'keys.md', 'id_rsa.pub', 'monkey.js', 'README.md', 'pem.txt']) assert.ok(!keyFile(f), f)
})

test('a repository name comes from the project, and what is typed is a name or owner/name', () => {
  assert.equal(repoName('Night Runner!'), 'night-runner'); assert.equal(repoName('ARES'), 'ares'); assert.equal(repoName(''), 'project')
  assert.deepEqual(readTarget(''), {}); assert.deepEqual(readTarget(' ares-game '), { name: 'ares-game' })
  assert.deepEqual(readTarget('Pukujan/ares'), { repo: 'Pukujan/ares' }); assert.deepEqual(readTarget('https://github.com/Pukujan/ares'), { repo: 'Pukujan/ares' })
  for (const bad of ['-x', 'a b', '..', 'a/b/c', 'git@github.com:a/b.git', 'https://gitlab.com/a/b']) assert.throws(() => readTarget(bad), undefined, bad)
})

test('the first push makes a private repository; later ones go to the same one, never forced', async () => {
  const G = github(), dir = project({ 'index.html': '<h1>ARES</h1>', 'game.js': 'let T = 0' })
  const steps = [], links = []
  const first = await pushSource({ dir, title: 'ARES', hub: G.hub, gh: G.gh, step: s => steps.push(s), onLink: l => links.push(l) })
  assert.equal(first.repo, 'me/ares'); assert.equal(first.private, true); assert.equal(first.made, true); assert.equal(first.fresh, true); assert.equal(first.same, false)
  assert.equal(first.url, 'https://github.com/me/ares')
  assert.equal(G.head('me/ares'), g(dir, 'rev-parse', 'HEAD'))
  const create = G.calls.find(c => c[1] === 'create')
  assert.ok(create.includes('--private') && !create.includes('--public'))
  assert.match(create[create.indexOf('--description') + 1], /made with Swarm Studio/)
  assert.deepEqual(steps, ['checking me/ares', 'making me/ares', 'pushing to me/ares'])
  assert.equal(links[0].repo, 'me/ares')
  // nothing new: said, and nothing is sent
  const again = await pushSource({ dir, link: first, title: 'ARES', hub: G.hub, gh: G.gh })
  assert.equal(again.same, true); assert.equal(again.repo, 'me/ares')
  // a change, committed or not, goes to the same repository
  change(dir, { 'game.js': 'let T = 1' })
  put(dir, { 'notes.md': 'not committed yet', '.env': 'KEY=1', 'node_modules/x/index.js': 'x' })
  const second = await pushSource({ dir, link: first, title: 'ARES', hub: G.hub, gh: G.gh })
  assert.equal(second.repo, 'me/ares'); assert.equal(second.fresh, false); assert.equal(second.same, false)
  assert.equal(G.calls.filter(c => c[1] === 'create').length, 1, 'one repository, made once')
  const tree = g(G.at('me/ares'), 'ls-tree', '-r', '--name-only', 'refs/heads/main').split('\n')
  assert.deepEqual(tree.sort(), ['game.js', 'index.html', 'notes.md'], 'the untracked key file and the packages stayed home')
  // public only when asked
  const pub = await pushSource({ dir: project({ 'index.html': 'x' }), title: 'Open One', want: { public: true }, hub: G.hub, gh: G.gh })
  assert.equal(pub.private, false); assert.ok(G.calls.findLast(c => c[1] === 'create').includes('--public'))
})

test('a repository with commits the project lacks is refused, with Pull; nothing is overwritten', async () => {
  const G = github(), dir = project({ 'index.html': 'one' })
  const link = await pushSource({ dir, title: 'Site', hub: G.hub, gh: G.gh })
  const theirs = G.commit('me/site', { 'index.html': 'theirs' })
  change(dir, { 'index.html': 'mine' })
  await assert.rejects(pushSource({ dir, link, title: 'Site', hub: G.hub, gh: G.gh }), e => e.pull === true && e.status === 409 && /has commits this project does not have\. Pull/.test(e.message))
  assert.equal(G.head('me/site'), theirs, 'their commit is still the newest')
})

test('a key file anywhere in the history stops the push, with its name, and no repository is made', async () => {
  const G = github(), dir = project({ 'index.html': 'x', '.env': 'STRIPE=sk_live', 'certs/site.pem': 'k' })
  g(dir, 'rm', '-q', '.env', 'certs/site.pem'); g(dir, 'commit', '-qm', 'take the keys out')
  assert.deepEqual(await keyFilesIn(dir, 'HEAD', G.hub), ['.env', 'certs/site.pem'])
  await assert.rejects(pushSource({ dir, title: 'Leaky', hub: G.hub, gh: G.gh }), e => e.status === 422 && /look like keys: \.env, certs\/site\.pem/.test(e.message) && e.keys.length === 2)
  assert.ok(!G.calls.some(c => c[1] === 'create')); assert.ok(!existsSync(G.at('me/leaky')))
  // already up there (someone's own repository) is not this push's to refuse: only what would be sent is read
  const clean = project({ 'index.html': 'x' })
  const link = await pushSource({ dir: clean, title: 'Clean', hub: G.hub, gh: G.gh })
  change(clean, { '.env.example': 'KEY=' })
  assert.deepEqual(await keyFilesIn(clean, `${G.head('me/clean')}..HEAD`, G.hub), [])
  assert.equal((await pushSource({ dir: clean, link, title: 'Clean', hub: G.hub, gh: G.gh })).same, false)
})

test('a repository is linked by name only when it is empty or already this project\'s', async () => {
  const G = github(), dir = project({ 'index.html': 'x' })
  // a name that is taken is never taken over
  G.make('me/ares'); G.commit('me/ares', { 'README.md': 'someone else' })
  await assert.rejects(pushSource({ dir, title: 'ARES', hub: G.hub, gh: G.gh }), /me\/ares is already on GitHub/)
  await assert.rejects(pushSource({ dir, title: 'ARES', want: { repo: 'me/ares' }, hub: G.hub, gh: G.gh }), /already holds other work/)
  await assert.rejects(pushSource({ dir, title: 'ARES', want: { repo: 'me/nowhere' }, hub: G.hub, gh: G.gh }), /No repository me\/nowhere/)
  // an empty one the person names: linked, and its own visibility is kept
  G.make('team/ares-game', { isPrivate: false })
  const out = await pushSource({ dir, title: 'ARES', want: { repo: 'team/ares-game' }, hub: G.hub, gh: G.gh })
  assert.equal(out.repo, 'team/ares-game'); assert.equal(out.made, false); assert.equal(out.private, false); assert.equal(out.fresh, false)
  assert.equal(G.calls.filter(c => c[1] === 'create').length, 0)
  // one it was pushed to before (its newest commit is in this history) links again
  change(dir, { 'index.html': 'y' })
  assert.equal((await pushSource({ dir, title: 'ARES', want: { repo: 'team/ares-game' }, hub: G.hub, gh: G.gh })).same, false)
  assert.equal(G.head('team/ares-game'), g(dir, 'rev-parse', 'HEAD'))
})

test('without a gh login the push says how to sign in', async () => {
  const G = github({ login: null })
  await assert.rejects(pushSource({ dir: project({ 'index.html': 'x' }), title: 'X', hub: G.hub, gh: G.gh }), e => e.status === 424 && /run gh auth login/.test(e.message))
})

test('the real GitHub is https only and never a file path; a remote\'s newest commit is asked, not fetched', async () => {
  assert.equal(GITHUB.url('a/b'), 'https://github.com/a/b.git'); assert.equal(GITHUB.file, false)
  const G = github(); G.make('me/empty'); G.make('me/full'); const sha = G.commit('me/full', { 'a.txt': 'a' })
  assert.deepEqual(await remoteHead('me/empty', G.hub), { sha: null, branch: 'main' })
  assert.deepEqual(await remoteHead('me/full', G.hub), { sha, branch: 'main' })
  // with the real rule a path is refused by git itself
  await assert.rejects(remoteHead('me/full', { ...G.hub, file: false }), /Could not reach|would not give/)
})

test('what changed under a subfolder is asked of GitHub; no answer is "unknown", never "nothing"', async () => {
  const G = github()
  assert.equal(await changedUnder('a/b', 'x', 'y', '', G.gh), true)
  assert.equal(await changedUnder('a/b', 'x', 'y', 'games/ares', G.gh), null)
  G.changed.files = ['README.md', 'games/other/x.js']
  assert.equal(await changedUnder('a/b', 'x', 'y', 'games/ares', G.gh), false)
  G.changed.files = ['games/ares/web/game.js']
  assert.equal(await changedUnder('a/b', 'x', 'y', 'games/ares', G.gh), true)
})

test('a project remembers its repository, and forgets the old facts when it changes', () => {
  const d = tmp()
  rememberLink(d, 'p:app', { repo: 'me/a', private: true, sha: 'x', pushed: 1 })
  rememberLink(d, 'p:app', { repo: 'me/a', pulled: 2 })
  assert.deepEqual(sourceLinks(d)['p:app'], { repo: 'me/a', private: true, sha: 'x', pushed: 1, pulled: 2 })
  rememberLink(d, 'p:app', { repo: 'me/b', private: false })
  assert.deepEqual(sourceLinks(d)['p:app'], { repo: 'me/b', private: false })
  rememberLink(d, 'p:app', null); assert.deepEqual(sourceLinks(d), {})
})

// ---------- the routes, with a projects store, the app jobs and the intake route standing in
function studio(G) {
  const home = tmp(), runsDir = join(home, 'runs'), dataDir = join(home, 'data'), logs = new Map(), known = {}
  mkdirSync(runsDir)
  const record = (id, e) => { (logs.get(id) || logs.set(id, []).get(id)).push(e); return true }
  const readEvents = id => logs.get(id) || null
  const jobs = appJobs({ runsDir, record, broadcast: () => {}, readEvents, provider: () => ({}), modelFor: () => 'm', sweepEvery: 1e9 })
  const projects = {
    get: id => (known[id] ? { id, name: known[id].name, versions: known[id].runs.map(r => ({ id: r })), parts: {} } : null),
    resolve: () => null, projectOf: run => Object.keys(known).find(id => known[id].runs.includes(run)) || null,
    claim: (run, pid) => known[pid].runs.push(run)
  }
  const real = jobs.bring
  // a "clone" of the stand-in GitHub, as engine/bringin.mjs fetchRepo gives it
  const fetch = async repo => { const dir = tmp(); g(dir, 'clone', '-q', '--depth', '1', `file://${G.at(repo.slug)}`, '.'); return { dir, sha: g(dir, 'rev-parse', 'HEAD'), clean: () => rmSync(dir, { recursive: true, force: true }) } }
  const bring = bringInRoutes({ runsDir, projects, home, record, readEvents, fetch, join: (dir, slug) => joinHistory(dir, slug, G.hub),
    apps: async () => ({ bring: (id, o) => { logs.set(id, readFileSync(join(runsDir, id, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))); return real(id, o) } }) })
  let clock = 1000
  const route = sourceRoutes({ runsDir, dataDir, projects, readEvents, record, bringIn: bring.bringIn, hub: G.hub, gh: G.gh, now: () => (clock += 1000) })
  // a run the Studio built: its app/ with a history
  const built = (pid, name, run, files, kind = 'app') => {
    known[pid] ||= { name, runs: [] }; known[pid].runs.push(run)
    const app = join(runsDir, run, 'app'); put(app, files); g(app, 'init', '-q'); g(app, 'add', '-A'); g(app, 'commit', '-qm', 'init')
    logs.set(run, [{ type: 'run:start', run, kind, title: name }])
    return app
  }
  const done = async (pid, piece = 'app') => { await route.jobs.get(`${pid}:${piece}`).done; return route.state(pid, { piece }) }
  return { route, built, done, known, logs, runsDir, dataDir, jobs, appOf: run => join(runsDir, run, 'app') }
}

test('the door: not linked, pushed, changes not pushed, new commits, pulled as the next version, pushed again', async () => {
  const G = github(), S = studio(G)
  const app = S.built('p1', 'Night Runner', '2020-r1', { 'index.html': '<h1>one</h1>', 'package.json': '{"devDependencies":{"vite":"1"}}' })
  try {
    let st = await S.route.state('p1', { check: true })
    assert.equal(st.source, true); assert.equal(st.link, null); assert.equal(st.origin, null); assert.equal(st.login, 'me'); assert.equal(st.suggest, 'night-runner'); assert.equal(st.piece, 'app')
    st = await S.route.act('p1', { action: 'push' })
    assert.equal(st.job.state, 'working'); assert.equal(st.job.did, 'push')
    st = await S.done('p1')
    assert.equal(st.job.state, 'done'); assert.equal(st.job.message, 'Pushed to me/night-runner'); assert.equal(st.job.url, 'https://github.com/me/night-runner')
    assert.deepEqual({ repo: st.link.repo, private: st.link.private, fits: st.link.fits }, { repo: 'me/night-runner', private: true, fits: true })
    assert.ok(st.link.pushed > 0); assert.equal(st.ahead, false)
    assert.equal(S.logs.get('2020-r1').at(-1).type, 'source:push')
    // a local change shows as not pushed; a commit on GitHub shows as new, only when asked
    change(app, { 'index.html': '<h1>two</h1>' })
    assert.equal((await S.route.state('p1')).ahead, true); assert.equal((await S.route.state('p1')).behind, null)
    await S.route.act('p1', { action: 'push' }); st = await S.done('p1')
    assert.equal(st.ahead, false)
    const theirs = G.commit('me/night-runner', { 'index.html': '<h1>three</h1>', 'about.html': 'new' })
    st = await S.route.state('p1', { check: true })
    assert.equal(st.behind, true)
    // a push now is refused in words and offers Pull
    change(app, { 'local.txt': 'mine' })
    await S.route.act('p1', { action: 'push' }); st = await S.done('p1')
    assert.equal(st.job.state, 'failed'); assert.equal(st.job.pull, true); assert.match(st.job.message, /Pull them first/)
    assert.equal(G.head('me/night-runner'), theirs)
    // Pull: the next version of the same project, with GitHub's files and its history carried on
    await S.route.act('p1', { action: 'pull' }); st = await S.done('p1')
    assert.equal(st.job.state, 'done', st.job.message); assert.match(st.job.message, /Pulled from me\/night-runner/)
    const next = st.job.run
    assert.deepEqual(S.known.p1.runs, ['2020-r1', next]); assert.equal(st.run, next)
    assert.equal(readFileSync(join(S.appOf(next), 'about.html'), 'utf8'), 'new')
    assert.equal(g(S.appOf(next), 'rev-parse', 'HEAD'), theirs)
    assert.ok(st.link.pulled > 0); assert.equal(st.link.fits, true); assert.equal(st.ahead, false)
    assert.equal((await S.route.state('p1', { check: true })).behind, false)
    // nothing new: said so, and no run is made
    await S.route.act('p1', { action: 'pull' }); st = await S.done('p1')
    assert.equal(st.job.message, 'Nothing new on me/night-runner'); assert.equal(S.known.p1.runs.length, 2)
    // a change here goes up as an ordinary push on top of theirs
    change(S.appOf(next), { 'index.html': '<h1>four</h1>' })
    await S.route.act('p1', { action: 'push' }); st = await S.done('p1')
    assert.equal(st.job.state, 'done', st.job.message)
    assert.equal(G.head('me/night-runner'), g(S.appOf(next), 'rev-parse', 'HEAD'))
    assert.equal(g(G.at('me/night-runner'), 'rev-parse', 'refs/heads/main~1'), theirs, 'their commit is under ours: no force')
  } finally { S.jobs.close() }
})

test('the door: link by name, a second job waits, the crew at work blocks a push, wrong asks are refused', async () => {
  const G = github(), S = studio(G)
  S.built('p1', 'ARES', '2020-r1', { 'index.html': 'x' }, 'game')
  try {
    await assert.rejects(S.route.act('nope', { action: 'push' }), e => e.status === 404)
    await assert.rejects(S.route.act('p1', { action: 'sideways' }), /push, pull or bring/)
    await assert.rejects(S.route.act('p1', { action: 'pull' }), /not linked to a repository/)
    await assert.rejects(S.route.act('p1', { action: 'push', repo: 'https://gitlab.com/a/b' }), /github\.com/)
    await assert.rejects(S.route.act('p1', { action: 'bring', repo: 'me/x', kind: 'game' }), /already has its source/)
    G.make('team/ares')
    let st = await S.route.act('p1', { action: 'push', repo: 'team/ares' })
    assert.equal(st.piece, 'game'); assert.equal(st.job.state, 'working')
    // asked again while it works: the same job, not a second push
    assert.equal((await S.route.act('p1', { action: 'push', repo: 'team/other' })).job.state, 'working')
    st = await S.done('p1', 'game')
    assert.equal(st.link.repo, 'team/ares'); assert.equal(st.job.message, 'Pushed to team/ares')
    assert.equal(sourceLinks(S.dataDir)['p1:game'].made, false)
    // the run can be reached by its own id too
    assert.equal((await S.route.state('2020-r1')).link.repo, 'team/ares')
    const busy = sourceRoutes({ runsDir: S.runsDir, dataDir: S.dataDir, projects: { get: id => (id === 'p1' ? { id, name: 'ARES', versions: [{ id: '2020-r1' }], parts: {} } : null), projectOf: () => null }, readEvents: id => S.logs.get(id), record: () => {}, bringIn: null, working: async () => true, hub: G.hub, gh: G.gh })
    await assert.rejects(busy.act('p1', { action: 'push' }), /crew is still working/)
  } finally { S.jobs.close() }
})

test('the door: a repository comes into a project with no source, and a subfolder pulls only what changed in it', async () => {
  const G = github(), S = studio(G)
  S.known.p9 = { name: 'ARES', runs: [] }
  G.make('me/monorepo'); G.commit('me/monorepo', { 'games/ares/index.html': '<h1>ARES</h1>', 'games/ares/game.js': '1', 'README.md': 'mono' })
  try {
    let st = await S.route.state('p9')
    assert.equal(st.source, false); assert.equal(st.run, null); assert.equal(st.link, null)
    await assert.rejects(S.route.act('p9', { action: 'push' }), /no app or game source yet/)
    await assert.rejects(S.route.act('p9', { action: 'bring', repo: 'me/monorepo' }), /Game or App/)
    st = await S.route.act('p9', { action: 'bring', repo: 'me/monorepo', path: 'games/ares', kind: 'game' })
    assert.equal(st.job.did, 'bring')
    st = await S.done('p9', 'game')
    assert.equal(st.job.state, 'done', st.job.message); assert.equal(st.source, true); assert.equal(st.piece, 'game')
    assert.deepEqual({ repo: st.origin.repo, path: st.origin.path }, { repo: 'me/monorepo', path: 'games/ares' }); assert.equal(st.link, null)
    assert.equal(S.known.p9.runs.length, 1)
    assert.equal(S.logs.get(S.known.p9.runs[0])[0].title, 'ARES')
    // a subfolder starts its own history: the repository's is not this folder's
    assert.equal(g(S.appOf(st.run), 'log', '--format=%s'), 'Brought in')
    // a commit elsewhere in the repository is not news for this folder
    G.commit('me/monorepo', { 'README.md': 'mono 2' }); G.changed.files = ['README.md']
    assert.equal((await S.route.state('p9', { check: true })).behind, true)
    await S.route.act('p9', { action: 'pull' }); st = await S.done('p9', 'game')
    assert.equal(st.job.message, 'Nothing new in games/ares on me/monorepo'); assert.equal(S.known.p9.runs.length, 1)
    assert.equal((await S.route.state('p9', { check: true })).behind, false)
    // one in the folder is: the next version
    G.commit('me/monorepo', { 'games/ares/game.js': '2' }); G.changed.files = ['games/ares/game.js']
    await S.route.act('p9', { action: 'pull' }); st = await S.done('p9', 'game')
    assert.equal(st.job.state, 'done', st.job.message); assert.equal(S.known.p9.runs.length, 2)
    assert.equal(readFileSync(join(S.appOf(st.run), 'game.js'), 'utf8'), '2')
    assert.ok(st.origin.pulled > 0)
    // it goes to a repository of its own, never back into the one it is a folder of
    await assert.rejects(S.route.act('p9', { action: 'push', repo: 'me/monorepo' }).then(() => S.done('p9', 'game')).then(s => { if (s.job.state === 'failed') throw new Error(s.job.message) }), /already holds other work/)
    await S.route.act('p9', { action: 'push' }); st = await S.done('p9', 'game')
    assert.equal(st.link.repo, 'me/ares'); assert.equal(st.link.private, true)
  } finally { S.jobs.close() }
})

test('the whole of a repository brought in carries its history on, so it can be pushed back by name', async () => {
  const G = github(), S = studio(G)
  S.known.p2 = { name: 'Blog', runs: [] }
  G.make('me/blog'); const first = G.commit('me/blog', { 'index.html': 'blog', 'package.json': '{"devDependencies":{"vite":"1"}}', '.gitignore': 'node_modules\n' })
  try {
    await S.route.act('p2', { action: 'bring', repo: 'me/blog', kind: 'app' })
    let st = await S.done('p2')
    assert.equal(st.job.state, 'done', st.job.message)
    assert.equal(g(S.appOf(st.run), 'rev-parse', 'HEAD'), first)
    assert.equal(S.logs.get(st.run).find(e => e.type === 'intake').source.joined, true)
    change(S.appOf(st.run), { 'index.html': 'blog, edited here' })
    await S.route.act('p2', { action: 'push', repo: 'me/blog' }); st = await S.done('p2')
    assert.equal(st.job.state, 'done', st.job.message); assert.equal(st.link.repo, 'me/blog')
    assert.equal(g(G.at('me/blog'), 'rev-parse', 'refs/heads/main~1'), first)
  } finally { S.jobs.close() }
})

test('GET and POST /api/projects/<id>/github answer as JSON, and a refusal carries its words', async () => {
  const G = github(), S = studio(G)
  S.built('p1', 'Shop', '2020-r1', { 'index.html': 'x' })
  const call = (method, path, body) => new Promise(ok => {
    const res = { writeHead(code) { this.code = code; return this }, end(text) { ok({ code: this.code, body: JSON.parse(text) }) } }
    const on = {}, req = { method, on: (k, fn) => { on[k] = fn } }
    const took = S.route(req, res, new URL(`http://x${path}`))
    if (took === false) return ok({ code: 0 })
    if (method === 'POST') { on.data(JSON.stringify(body)); on.end() }
  })
  try {
    assert.equal((await call('GET', '/api/projects/p1/other')).code, 0)
    let r = await call('GET', '/api/projects/p1/github?check=1')
    assert.equal(r.code, 200); assert.equal(r.body.link, null); assert.equal(r.body.suggest, 'shop')
    assert.equal((await call('GET', '/api/projects/none/github')).code, 404)
    r = await call('POST', '/api/projects/p1/github', { action: 'pull' })
    assert.equal(r.code, 409); assert.match(r.body.error, /not linked/)
    r = await call('POST', '/api/projects/p1/github', { action: 'push', repo: 'shop-source', public: true })
    assert.equal(r.code, 200); assert.equal(r.body.job.state, 'working'); assert.equal(r.body.job.done, undefined)
    assert.equal(S.route.busy(), true)
    await S.done('p1')
    assert.equal(S.route.busy(), false)
    r = await call('GET', '/api/projects/p1/github')
    assert.deepEqual({ repo: r.body.link.repo, private: r.body.link.private, url: r.body.link.url }, { repo: 'me/shop-source', private: false, url: 'https://github.com/me/shop-source' })
  } finally { S.jobs.close() }
})
