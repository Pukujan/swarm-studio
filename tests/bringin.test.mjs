// Bring a game or app in (docs/specs/45-intake.md, engine/bringin.mjs): what is asked for is read strictly,
// only what should be copied is, the limits refuse in words, and the run's log says where it came from.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseRepo, cleanSub, checkFolder, subFolder, measure, copyIn, shapeOf, reachesUp, checkReach, planBeside, nameOf, readAsk, startEvents, doneEvent, intakeOf, gitFacts, fetchRepo, bringFolder, skipped, CAPS } from '../engine/bringin.mjs'
import { appJobs } from '../engine/appjob.mjs'
import { serveStatic } from '../engine/godotfirst.mjs'
import { bringInRoutes } from '../server/bringin.mjs'

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'bringin-')))
const put = (root, files) => { for (const [f, text] of Object.entries(files)) { mkdirSync(join(root, f, '..'), { recursive: true }); writeFileSync(join(root, f), text) } return root }
// links need a right Windows does not give by default: the link cases run everywhere else
const LINKS = process.platform !== 'win32'
const says = (fn, re) => assert.throws(fn, e => re.test(e.message) || assert.fail(`said "${e.message}", wanted ${re}`))

test('a repository is owner/name or an https GitHub address, and nothing else', () => {
  const want = { owner: 'Pukujan', name: 'swarm-studio', slug: 'Pukujan/swarm-studio', url: 'https://github.com/Pukujan/swarm-studio.git' }
  for (const ok of ['Pukujan/swarm-studio', ' Pukujan/swarm-studio ', 'https://github.com/Pukujan/swarm-studio', 'https://github.com/Pukujan/swarm-studio.git', 'https://www.github.com/Pukujan/swarm-studio/']) assert.deepEqual(parseRepo(ok), want, ok)
  for (const bad of ['', 'swarm-studio', 'a/b/c', '-x/y', 'a/-y', '--upload-pack=x/y', 'a/..', '../x', 'a b/c', 'a/b c', 'a\\b', 'git@github.com:a/b.git', 'ssh://git@github.com/a/b', 'http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com.evil.io/a/b',
    'https://user:pass@github.com/a/b', 'https://github.com:8443/a/b', 'https://github.com/a/b?x=1', 'https://github.com/a/b#x', 'https://github.com/a/b/tree/main/web', 'https://github.com/a', 'file:///etc/passwd', '/etc/passwd', 'ext::sh -c id', 'a/b\n--x']) {
    assert.throws(() => parseRepo(bad), undefined, `took "${bad}"`)
  }
})

test('a subfolder stays inside: no way up, no option, no .git', () => {
  assert.equal(cleanSub(''), ''); assert.equal(cleanSub(undefined), '')
  assert.equal(cleanSub('/games/ares/web/'), 'games/ares/web'); assert.equal(cleanSub('games\\ares'), 'games/ares')
  for (const bad of ['..', '../x', 'a/../../b', 'a/./b', '-x', 'a/-rf', '.git', 'a/.git/hooks', 'a\0b']) assert.throws(() => cleanSub(bad), undefined, bad)
})

test('a folder is a real one inside the home folder, never the home folder or the Studio\'s own', () => {
  const home = tmp(), out = tmp()
  put(home, { 'work/game/index.html': 'x', 'runs/r1/events.jsonl': '' })
  assert.equal(checkFolder(join(home, 'work/game'), { home }), join(home, 'work/game'))
  says(() => checkFolder('work/game', { home }), /whole path/)
  says(() => checkFolder(join(home, 'nope'), { home }), /No such folder/)
  says(() => checkFolder(join(home, 'work/game/index.html'), { home }), /file/)
  says(() => checkFolder(home, { home }), /inside your home/)
  says(() => checkFolder(out, { home }), /inside your home/)
  says(() => checkFolder('/etc', { home }), /inside your home|No such folder/)
  says(() => checkFolder(join(home, 'runs/r1'), { home, deny: [join(home, 'runs')] }), /Studio's own/)
  assert.equal(subFolder(join(home, 'work'), 'game'), join(home, 'work/game'))
  says(() => subFolder(join(home, 'work'), 'none'), /No folder none/)
  if (!LINKS) return
  // a link inside the home folder that points out of it is where it points
  symlinkSync(out, join(home, 'way-out'))
  says(() => checkFolder(join(home, 'way-out'), { home }), /inside your home/)
  // and the subfolder cannot be a link out either
  put(out, { 'secret/index.html': 'x' })
  symlinkSync(join(out, 'secret'), join(home, 'work', 'sub'))
  says(() => subFolder(join(home, 'work'), 'sub'), /stay inside/)
})

test('the request: one source, a kind, a name', () => {
  const home = tmp()
  put(home, { 'dev/ares/web/index.html': 'x' })
  says(() => readAsk({ repo: 'a/b' }, { home }), /Game or App/)
  says(() => readAsk({ kind: 'game' }, { home }), /repository .* or a folder/)
  says(() => readAsk({ kind: 'game', repo: 'a/b', folder: join(home, 'dev') }, { home }), /not both/)
  says(() => readAsk({ kind: 'site', repo: 'a/b' }, { home }), /Game or App/)
  const a = readAsk({ kind: 'game', folder: '~/dev/ares', path: 'web' }, { home })
  assert.deepEqual({ kind: a.kind, sub: a.sub, folder: a.folder, repo: a.repo, name: a.name, project: a.project }, { kind: 'game', sub: 'web', folder: join(home, 'dev/ares'), repo: null, name: 'ARES', project: null })
  const b = readAsk({ kind: 'app', repo: 'Pukujan/swarm-studio', path: 'games/ares/web', name: '  Player   Hub ', project: 'p-1' }, { home })
  assert.equal(b.name, 'Player Hub'); assert.equal(b.repo.slug, 'Pukujan/swarm-studio'); assert.equal(b.project, 'p-1')
  assert.equal(readAsk({ kind: 'app', repo: 'a/b', project: '../x' }, { home }).project, null)
  // the name: the folder's own, never the folder named for its job
  assert.equal(nameOf({ repo: { name: 'rooftop-signal' } }), 'Rooftop Signal')
  assert.equal(nameOf({ repo: { name: 'swarm-studio' }, sub: 'games/ares/web' }), 'ARES')
  assert.equal(nameOf({ folder: '/Users/x/dev/night_runner/dist' }), 'Night Runner')
})

test('what is copied: files only; packages, git, build output, keys and links out are left', async () => {
  const src = tmp(), out = tmp(), dest = join(tmp(), 'app')
  put(src, { 'index.html': '<p>', 'game.js': 'let a', 'art/hero.webp': 'img', '.env': 'KEY=1', '.env.local': 'KEY=2', '.env.example': 'KEY=', '.npmrc': 'token', 'node_modules/x/index.js': 'x', '.git/HEAD': 'ref', 'dist/a.js': 'b', 'build/b.js': 'b', '.DS_Store': 'x', 'src/dist/c.js': 'c' })
  put(out, { 'secret.txt': 'secret' })
  if (LINKS) {
    symlinkSync(join(out, 'secret.txt'), join(src, 'leak.txt'))   // a link out of the folder
    symlinkSync(out, join(src, 'outdir'))                          // a folder link out
    symlinkSync(join(src, 'game.js'), join(src, 'same.js'))        // a link to a file inside: its file is copied
    symlinkSync(join(src, 'art'), join(src, 'art2'))               // a folder link inside: not followed
  }
  const m = measure(src)
  assert.deepEqual(m.files.map(f => f.rel).sort(), ['.env.example', 'art/hero.webp', 'game.js', 'index.html', ...(LINKS ? ['same.js'] : [])])
  assert.equal(m.links, LINKS ? 3 : 0); assert.equal(m.left, 9)
  assert.equal(await copyIn(src, dest, m.files), LINKS ? 5 : 4)
  if (LINKS) assert.equal(readFileSync(join(dest, 'same.js'), 'utf8'), 'let a')
  for (const gone of ['.env', '.env.local', '.npmrc', 'node_modules', '.git', 'dist', 'build', 'leak.txt', 'outdir', 'art2', 'src']) assert.ok(!existsSync(join(dest, gone)), gone)
  for (const n of ['node_modules', '.git', 'dist', '.env', '.env.production', '.output']) assert.ok(skipped(n), n)
  for (const n of ['src', 'index.html', '.env.example', '.gitignore', 'distribution']) assert.ok(!skipped(n), n)
})

test('too much is refused in words, before anything is copied', async () => {
  const src = tmp(), run = tmp()
  put(src, { 'index.html': 'x', 'a.js': '12345', 'b.js': '12345', 'c.js': '12345' })
  says(() => measure(src, { files: 3, bytes: 1e6 }), /More than 3 files/)
  says(() => measure(src, { files: 10, bytes: 10 }), /More than 0 MB/)
  assert.equal(CAPS.files, 20000); assert.equal(CAPS.bytes, 200 * 1024 * 1024)
  says(() => measure(src, { files: 2, bytes: CAPS.bytes }), /More than 2 files/)
  await assert.rejects(bringFolder({ root: src, runDir: run, caps: { files: 2, bytes: 1e6 } }), /More than 2 files/)
  assert.ok(!existsSync(join(run, 'app')), 'nothing was copied')
})

test('the shape: plain files and their page, a Vite project, and what is not taken yet', () => {
  const d = tmp()
  assert.deepEqual(shapeOf(put(join(d, 'a'), { 'index.html': 'x' })), { shape: 'static', page: '', godot: false })
  assert.deepEqual(shapeOf(put(join(d, 'b'), { 'project.godot': 'x', 'web/index.html': 'x', 'docs/index.html': 'x', 'scenes/main.tscn': 'x' })), { shape: 'static', page: 'web/', godot: true })
  assert.deepEqual(shapeOf(put(join(d, 'c'), { 'package.json': '{"devDependencies":{"vite":"^5"},"scripts":{"build":"vite build"}}', 'index.html': 'x' })), { shape: 'vite', page: '', godot: false })
  // tools in a package.json do not make it a built project
  assert.equal(shapeOf(put(join(d, 'd'), { 'package.json': '{"scripts":{"test":"node t.js"}}', 'index.html': 'x' })).shape, 'static')
  says(() => shapeOf(put(join(d, 'e'), { 'package.json': '{"dependencies":{"next":"15"},"scripts":{"build":"next build"}}', 'public/index.html': 'x' })), /does not run yet/)
  says(() => shapeOf(put(join(d, 'f'), { 'project.godot': 'x', 'scenes/main.tscn': 'x' })), /Godot project/)
  says(() => shapeOf(put(join(d, 'g'), { 'readme.md': 'x' })), /No index.html/)
  // a page inside node_modules or build output is not the project's page
  says(() => shapeOf(put(join(d, 'h'), { 'node_modules/x/index.html': 'x', 'dist/index.html': 'x' })), /No index.html/)
})

test('a page that loads files from the folder above is refused, with the folder to bring instead', () => {
  const home = tmp()
  put(home, { 'ares/web/index.html': '<script src="game.js"></script>', 'ares/web/game.js': 'const hero = `../assets/skins/${h}.webp`', 'ares/assets/skins/a.webp': 'x', 'solo/index.html': '<img src="../nothing/a.png">' })
  assert.equal(reachesUp(join(home, 'ares/web')), 'assets')
  says(() => checkReach(join(home, 'ares/web'), '', home), /loads \.\.\/assets\/ from the folder above. Bring in that folder \(ares\)/)
  // the same game with its folder above brought too: the page is found inside, nothing to refuse
  assert.equal(shapeOf(join(home, 'ares')).page, 'web/')
  checkReach(join(home, 'ares'), 'web/', home)
  // "../nothing/" is not there: a path in a string is not a reason to refuse
  checkReach(join(home, 'solo'), '', home)
})

test('a Swarm plan in the folder or beside it is found; any other plan.json is not', () => {
  const d = tmp()
  const plan = JSON.stringify({ id: 'p-1', v: 3, kind: 'game', name: 'ARES', idea: 'x', cards: { core: {} } })
  put(d, { 'ares/plan.json': plan, 'ares/web/index.html': 'x', 'other/plan.json': '{"steps":[1,2]}', 'other/web/index.html': 'x' })
  assert.equal(planBeside(join(d, 'ares')), plan)
  assert.equal(planBeside(join(d, 'ares/web')), plan)
  assert.equal(planBeside(join(d, 'ares/web'), { above: false }), null)
  assert.equal(planBeside(join(d, 'other/web')), null)
})

test('the run\'s first lines and its last say what it is and where it came from', () => {
  const source = { repo: 'Pukujan/swarm-studio', path: 'games/ares' }
  const [start, began] = startEvents({ id: 'r1', t: 5, kind: 'game', name: 'ARES', source, from: 'r0' })
  assert.deepEqual(start, { type: 'run:start', t: 5, run: 'r1', brief: 'ARES: brought in from github.com/Pukujan/swarm-studio/games/ares', kind: 'game', title: 'ARES', intake: true, agents: [], from: 'r0' })
  assert.deepEqual(began, { type: 'intake:start', t: 5, run: 'r1', source })
  assert.equal(startEvents({ id: 'r2', kind: 'app', name: 'Hub', source: { folder: '/Users/x/dev/hub', path: '' } })[0].brief, 'Hub: brought in from hub')
  const done = doneEvent({ id: 'r1', t: 9, source: { ...source, sha: 'abc' }, shape: 'static', page: 'web/', files: 3, bytes: 10, left: 1, links: 0, godot: true, plan: true })
  assert.deepEqual(done, { type: 'intake', t: 9, run: 'r1', source: { repo: 'Pukujan/swarm-studio', path: 'games/ares', sha: 'abc' }, shape: 'static', page: 'web/', files: 3, bytes: 10, left: 1, links: 0, godot: true, plan: true })
  assert.equal(intakeOf([{ type: 'run:start' }]), null)
  assert.deepEqual(intakeOf([start, began]), { source, done: false, shape: null, page: '', ran: false, fixed: true })
  assert.deepEqual(intakeOf([start, began, done]), { source: done.source, done: true, shape: 'static', page: 'web/', ran: false, fixed: true })
  const vite = { ...done, shape: 'vite', page: '' }
  assert.deepEqual(intakeOf([start, began, vite, { type: 'intake:run' }]), { source: done.source, done: true, shape: 'vite', page: '', ran: true, fixed: false })
})

test('where a folder is from is read from its git files, never by running git', () => {
  const home = tmp(), sha = 'a'.repeat(40)
  put(home, { 'proj/.git/HEAD': 'ref: refs/heads/main\n', 'proj/.git/refs/heads/main': `${sha}\n`, 'proj/.git/config': '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:Pukujan/swarm-studio.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n', 'proj/games/ares/index.html': 'x', 'plain/index.html': 'x' })
  assert.deepEqual(gitFacts(join(home, 'proj/games/ares'), home), { sha, repo: 'Pukujan/swarm-studio' })
  assert.equal(gitFacts(join(home, 'plain'), home), null)
  // a name and password in the address never reach the log
  writeFileSync(join(home, 'proj/.git/config'), '[remote "origin"]\n\turl = https://me:ghp_secret@github.com/a/b.git\n')
  assert.deepEqual(gitFacts(join(home, 'proj'), home), { sha, repo: 'a/b' })
  writeFileSync(join(home, 'proj/.git/config'), '[remote "origin"]\n\turl = https://gitlab.com/a/b.git\n')
  assert.equal(gitFacts(join(home, 'proj'), home).repo, null)
})

test('a repository is fetched shallow, with no prompt, no submodules, and only its folder', async () => {
  const calls = []
  const exec = async (cmd, args) => { calls.push([cmd, ...args]); return { ok: true, out: 'f'.repeat(40) + '\n', err: '' } }
  const got = await fetchRepo(parseRepo('a/b'), 'games/ares', { exec })
  try {
    const clone = calls[0]
    assert.equal(clone[0], 'git')
    for (const flag of ['clone', '--depth', '--single-branch', '--no-tags', '--no-recurse-submodules', '--filter=blob:none', '--sparse', 'credential.helper=!gh auth git-credential', 'protocol.file.allow=never']) assert.ok(clone.includes(flag), flag)
    // the address comes after --, so nothing in it is an option
    assert.deepEqual(clone.slice(clone.indexOf('--')), ['--', 'https://github.com/a/b.git', got.dir])
    assert.deepEqual(calls[1].slice(-4), ['sparse-checkout', 'set', '--cone', 'games/ares'])
    assert.equal(got.sha, 'f'.repeat(40))
    assert.ok(existsSync(got.dir))
  } finally { got.clean() }
  assert.ok(!existsSync(got.dir), 'the temp folder is gone')
  // refused by GitHub: said in words with what to do, and the temp folder is gone
  let made = null
  await assert.rejects(fetchRepo(parseRepo('a/private'), '', { exec: async (cmd, args) => { made = args.at(-1); return { ok: false, out: '', err: 'remote: Repository not found.\nfatal: repository \'https://github.com/a/private.git/\' not found' } } }), /GitHub would not give a\/private.*gh auth login/)
  assert.ok(made && !existsSync(made))
})

// the app jobs with a log in memory, as the server gives them
function jobsFor(runsDir, logs = new Map()) {
  const record = (id, e) => { (logs.get(id) || logs.set(id, []).get(id)).push(e); return true }
  const jobs = appJobs({ runsDir, record, broadcast: () => {}, readEvents: id => logs.get(id) || null, provider: () => ({}), modelFor: () => 'm', sweepEvery: 1e9 })
  return { jobs, logs }
}

test('a run brought in reads as a finished build, plays as files, and is never built over', async () => {
  const runsDir = tmp(), src = tmp()
  put(src, { 'project.godot': 'x', 'web/index.html': '<h1>ARES</h1>', 'web/game.js': 'let T = 0', 'assets/a.webp': 'img' })
  const { jobs, logs } = jobsFor(runsDir)
  const id = 'r1', runDir = join(runsDir, id)
  mkdirSync(runDir, { recursive: true })
  logs.set(id, startEvents({ id, kind: 'game', name: 'ARES', source: { folder: src, path: '' } }))
  try {
    const first = jobs.bring(id, { kind: 'game', work: async step => { const info = await bringFolder({ root: src, runDir, step }); logs.get(id).push(doneEvent({ id, source: { folder: src, path: '' }, ...info })) } })
    assert.equal(first.state, 'working'); assert.equal(first.kind, 'game'); assert.deepEqual(first.intake, { shape: null, fixed: true, ran: false, done: false })
    await jobs.jobs.get(id).done
    const types = logs.get(id).map(e => e.type)
    assert.deepEqual(types.filter(t => t !== 'app:step'), ['run:start', 'intake:start', 'app:start', 'intake', 'app:done'])
    assert.equal(logs.get(id).find(e => e.type === 'app:start').intake, true)
    const st = jobs.state(id)
    assert.equal(st.state, 'done'); assert.equal(st.hasApp, true); assert.deepEqual(st.intake, { shape: 'static', fixed: true, ran: false, done: true })
    // the same after a restart, from the log alone
    const again = jobsFor(runsDir); again.logs.set(id, logs.get(id))
    assert.equal(again.jobs.state(id).hasApp, true); assert.equal(again.jobs.state(id).kind, 'game')
    again.jobs.close()
    // it opens on its page, served as files, with the folder above the page reachable
    const view = await jobs.open(id)
    assert.match(view.url, /^http:\/\/127\.0\.0\.1:\d+\/web\/$/); assert.equal(view.served, 'files')
    assert.equal(await (await fetch(view.url)).text(), '<h1>ARES</h1>')
    assert.equal(await (await fetch(`${view.url}game.js`)).text(), 'let T = 0')
    assert.equal((await fetch(`${view.url}../assets/a.webp`)).status, 200)
    assert.equal((await fetch(new URL('/nope/', view.url))).status, 404)
    // never built over: a change, a first build and a start over are all refused, and the files stay
    for (const input of [{ ask: 'make the jump higher' }, {}, { fresh: true, kind: 'game', prompt: 'a new game' }, { restart: true, fresh: true, prompt: 'x' }]) await assert.rejects(jobs.start(id, input), /brought in as plain files/)
    assert.equal(readFileSync(join(runDir, 'app/web/index.html'), 'utf8'), '<h1>ARES</h1>')
    assert.ok(!existsSync(join(runDir, 'app/package.json')), 'no starter was written into it')
  } finally { jobs.close() }
})

test('a run that did not come in says so and is not built either', async () => {
  const runsDir = tmp()
  const { jobs, logs } = jobsFor(runsDir)
  mkdirSync(join(runsDir, 'r2'), { recursive: true })
  logs.set('r2', startEvents({ id: 'r2', kind: 'app', name: 'Hub', source: { repo: 'a/b', path: '' } }))
  try {
    jobs.bring('r2', { kind: 'app', work: async () => { throw new Error('GitHub would not give a/b') } })
    await jobs.jobs.get('r2').done
    assert.equal(logs.get('r2').at(-1).type, 'app:failed'); assert.equal(logs.get('r2').at(-1).message, 'GitHub would not give a/b')
    assert.equal(jobs.state('r2').state, 'failed'); assert.equal(jobs.state('r2').hasApp, false)
    await assert.rejects(jobs.start('r2', { fresh: true, kind: 'game', prompt: 'x' }), /did not come in/)
    await assert.rejects(jobs.open('r2'), /no app yet/)
  } finally { jobs.close() }
})

test('a Vite project brought in installs and builds only on the person\'s press, and is never started over', async () => {
  const runsDir = tmp()
  const { jobs, logs } = jobsFor(runsDir)
  put(join(runsDir, 'r3', 'app'), { 'package.json': '{"devDependencies":{"vite":"^5"},"scripts":{"build":"vite build"}}', 'index.html': 'x' })
  const source = { folder: '/x', path: '' }
  logs.set('r3', [...startEvents({ id: 'r3', kind: 'app', name: 'Hub', source }), { type: 'app:start', kind: 'app', intake: true }, doneEvent({ id: 'r3', source, shape: 'vite', page: '', files: 2, bytes: 2, left: 0, links: 0 }), { type: 'app:done', intake: true }])
  try {
    assert.deepEqual(jobs.state('r3').intake, { shape: 'vite', fixed: false, ran: false, done: true })
    await assert.rejects(jobs.open('r3'), /Install and run/)
    assert.ok(!logs.get('r3').some(e => e.type === 'intake:run'))
    assert.ok(!existsSync(join(runsDir, 'r3', 'app', 'node_modules')), 'nothing was installed')
    // a first build or a start over would write the Studio's starter into it
    await assert.rejects(jobs.start('r3', { fresh: true }), /say what to change/)
    await assert.rejects(jobs.start('r3', {}), /say what to change/)
  } finally { jobs.close() }
})

test('the files server answers a folder with its index.html and never reads one as a file', async () => {
  const root = put(tmp(), { 'index.html': 'top', 'web/index.html': 'web', 'empty/a.txt': 'a' })
  const s = await serveStatic(root, 0)
  const at = `http://127.0.0.1:${s.srv.address().port}`
  try {
    assert.equal(await (await fetch(`${at}/`)).text(), 'top')
    assert.equal(await (await fetch(`${at}/web/`)).text(), 'web')
    assert.equal(await (await fetch(`${at}/web`)).text(), 'web')
    assert.equal((await fetch(`${at}/empty/`)).status, 404)
    assert.equal((await fetch(`${at}/..%2f..%2fetc/passwd`)).status, 404)
  } finally { await s.close() }
})

// the route, with a projects store and app jobs standing in
function routeFor({ home, runsDir, known = {} }) {
  const logs = new Map(), claimed = []
  const record = (id, e) => { (logs.get(id) || logs.set(id, []).get(id)).push(e); return true }
  const { jobs } = jobsFor(runsDir, logs)
  const real = jobs.bring
  const projects = { get: id => known[id] || null, resolve: name => Object.keys(known).find(id => known[id].name === name) || null, claim: (run, pid) => claimed.push([run, pid]), projectOf: run => claimed.find(c => c[0] === run)?.[1] || null }
  const fetched = []
  const route = bringInRoutes({ runsDir, projects, home, record, readEvents: id => logs.get(id) || null, fetch: async (repo, sub) => { fetched.push([repo.slug, sub]); const dir = put(tmp(), { [`${sub ? `${sub}/` : ''}index.html`]: 'from github' }); return { dir, sha: 'c'.repeat(40), clean: () => rmSync(dir, { recursive: true, force: true }) } },
    apps: async () => ({ bring: (id, o) => { logs.set(id, readFileSync(join(runsDir, id, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))); return real(id, o) } }) })
  return { route, logs, claimed, fetched, jobs }
}

test('POST /api/intake: a folder becomes a run in its own project, and a wrong one leaves nothing behind', async () => {
  const home = tmp(), runsDir = join(home, 'studio-runs')
  put(home, { 'dev/ares/web/index.html': '<h1>', 'dev/ares/web/game.js': 'x', 'dev/ares/plan.json': JSON.stringify({ kind: 'game', name: 'ARES', cards: {} }), 'dev/notes/readme.md': 'x' })
  mkdirSync(runsDir)
  const { route, logs, jobs } = routeFor({ home, runsDir })
  try {
    await assert.rejects(route.bringIn({ kind: 'game', folder: join(home, 'dev/notes') }), /No index.html/)
    await assert.rejects(route.bringIn({ kind: 'game', folder: '/etc' }), /inside your home|No such folder/)
    await assert.rejects(route.bringIn({ kind: 'game', folder: runsDir }), /Studio's own/)
    await assert.rejects(route.bringIn({ kind: 'game', folder: join(home, 'dev/ares'), project: 'gone' }), /no such project/)
    assert.deepEqual([...logs.keys()], [], 'no run was made')
    const out = await route.bringIn({ kind: 'game', folder: join(home, 'dev/ares'), path: 'web' })
    assert.equal(out.project, out.run)
    await jobs.jobs.get(out.run).done
    const ev = logs.get(out.run)
    assert.equal(ev[0].title, 'ARES'); assert.equal(ev[0].kind, 'game'); assert.equal(ev.at(-1).type, 'app:done')
    const got = ev.find(e => e.type === 'intake')
    assert.deepEqual(got.source, { folder: join(home, 'dev/ares'), path: 'web' })
    assert.equal(got.shape, 'static'); assert.equal(got.files, 2); assert.equal(got.plan, true)
    // the plan beside the folder is kept with the run; the files are in app/
    assert.ok(existsSync(join(runsDir, out.run, 'plan.json'))); assert.ok(existsSync(join(runsDir, out.run, 'app', 'game.js')))
    assert.deepEqual(JSON.parse(readFileSync(join(runsDir, out.run, 'meta.json'), 'utf8')), { projectName: 'ARES', piece: 'game' })
  } finally { jobs.close() }
})

test('POST /api/intake: a repository is fetched then copied; a game joins the project named and becomes its game', async () => {
  const home = tmp(), runsDir = join(home, 'studio-runs')
  mkdirSync(runsDir)
  const known = { p1: { id: 'p1', name: 'ARES', versions: [{ id: 'g0', piece: 'game' }, { id: 'site1', piece: 'app' }] }, bin: { id: 'bin', name: 'Old', trashed: 1, versions: [] } }
  const { route, logs, claimed, fetched, jobs } = routeFor({ home, runsDir, known })
  logs.set('site1', [])
  try {
    await assert.rejects(route.bringIn({ kind: 'game', repo: 'a/b', project: 'bin' }), /no such project/)
    await assert.rejects(route.bringIn({ kind: 'game', repo: 'https://evil.example/a/b' }), /github\.com/)
    assert.deepEqual(fetched, [])
    const out = await route.bringIn({ kind: 'game', repo: 'https://github.com/Pukujan/swarm-studio', path: 'games/ares/web', project: 'p1' })
    assert.equal(out.project, 'p1'); assert.deepEqual(claimed, [[out.run, 'p1']])
    await jobs.jobs.get(out.run).done
    assert.deepEqual(fetched, [['Pukujan/swarm-studio', 'games/ares/web']])
    const ev = logs.get(out.run)
    assert.equal(ev[0].from, 'site1')
    assert.deepEqual(ev.find(e => e.type === 'intake').source, { repo: 'Pukujan/swarm-studio', path: 'games/ares/web', sha: 'c'.repeat(40) })
    assert.equal(readFileSync(join(runsDir, out.run, 'app', 'index.html'), 'utf8'), 'from github')
    // the project's app is told of its game, marked as brought in (so a later app build does not wire rewards to it)
    assert.deepEqual(logs.get('site1').map(e => [e.type, e.game, e.title, e.intake]), [['game:linked', out.run, 'ARES', true]])
    // a name that is already a project's joins it (docs/specs/18-projects.md); an app does not become anyone's game
    const app = await route.bringIn({ kind: 'app', repo: 'a/hub', name: 'ARES' })
    assert.equal(app.project, 'p1')
    await jobs.jobs.get(app.run).done
    assert.equal(logs.get(app.run)[0].from, undefined); assert.equal(logs.get('site1').length, 1)
  } finally { jobs.close() }
})

test('code from outside is never handed the person\'s keys: a brought-in project builds with none of them', async () => {
  const runsDir = tmp()
  const { jobs, logs } = jobsFor(runsDir)
  // a stand-in for the project's own vite: it writes down the keys it can see, then "builds"
  const FAKE = `import { writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
writeFileSync('dist/index.html', 'built')
writeFileSync('saw.json', JSON.stringify(Object.keys(process.env).filter(k => /SUPABASE|STRIPE|RESEND|API_KEY/.test(k))))`
  const pkg = '{"type":"module","devDependencies":{"vite":"^5"},"scripts":{"build":"vite build"}}'
  const source = { repo: 'a/b', path: '' }
  put(join(runsDir, 'in', 'app'), { 'package.json': pkg, 'index.html': 'x', 'node_modules/vite/bin/vite.js': FAKE })
  logs.set('in', [...startEvents({ id: 'in', kind: 'app', name: 'Hub', source }), { type: 'app:start', kind: 'app', intake: true }, doneEvent({ id: 'in', source, shape: 'vite', page: '', files: 2, bytes: 2, left: 0, links: 0 }), { type: 'app:done', intake: true }])
  // the same files as an app the Studio built: its own build does get its database
  put(join(runsDir, 'own', 'app'), { 'package.json': pkg, 'index.html': 'x', 'node_modules/vite/bin/vite.js': FAKE })
  logs.set('own', [{ type: 'run:start', kind: 'app', brief: 'Hub', agents: [] }, { type: 'app:start', kind: 'site' }, { type: 'app:done', result: {} }])
  const had = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY }
  Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', STRIPE_SECRET_KEY: 'sk_test_x' })
  try {
    await assert.rejects(jobs.open('in'), /Install and run/)
    const view = await jobs.open('in', { run: true })
    assert.equal(view.served, 'files'); assert.equal(await (await fetch(view.url)).text(), 'built')
    assert.deepEqual(JSON.parse(readFileSync(join(runsDir, 'in', 'app', 'saw.json'), 'utf8')), [])
    assert.ok(logs.get('in').some(e => e.type === 'intake:run'), 'the press is on record')
    await jobs.open('own')
    assert.deepEqual(JSON.parse(readFileSync(join(runsDir, 'own', 'app', 'saw.json'), 'utf8')).sort(), ['STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'])
  } finally {
    for (const [k, v] of Object.entries(had)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    jobs.close()
  }
})
