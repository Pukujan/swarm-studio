// Where builds go on GitHub (engine/ghowner.mjs): the person's account or one of their organizations, used by both
// paths that make a repository (engine/publish.mjs, engine/sourcehub.mjs), set in Settings and typed in the chat
// (web/github.js). A small function stands in for `gh` and a folder of bare repositories for GitHub, so nothing
// here touches the network or makes a real repository.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { savedOwner, ghOrgs, chooseOwner, ownerFor, ownerView } from '../engine/ghowner.mjs'
import { publishGitHub, pickRepo } from '../engine/publish.mjs'
import { pushSource } from '../engine/sourcehub.mjs'
import { siteRepos, claimRepo } from '../engine/connect.mjs'
import { ownerAsk, ownerSay, ownerWhere, githubLines } from '../web/github.js'
import { sourceRoutes } from '../server/sourcehub.mjs'
import { createServer } from 'node:http'

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'ghowner-')))
const g = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', '-c', 'protocol.file.allow=always', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const MARK = 'made with Swarm Studio'

// gh as the login `me`, a member of four organizations:
//   crew   an owner (admin) of it
//   open   a member; members may make repositories
//   shut   a member; members may not
//   later  invited, not accepted
// Repositories are bare ones in a folder; `pages` answers for GitHub Pages as GitHub would.
function github({ login = 'me' } = {}) {
  const root = tmp(), calls = [], desc = new Map()
  const at = slug => join(root, `${slug}.git`)
  const ORGS = {
    crew: { state: 'active', role: 'admin', any: false, pub: false },
    open: { state: 'active', role: 'member', any: true, pub: true },
    shut: { state: 'active', role: 'member', any: false, pub: false },
    later: { state: 'pending', role: 'member', any: true, pub: true }
  }
  const ok = out => ({ ok: true, out, err: '' }), no = err => ({ ok: false, out: '', err })
  const make = (slug, d = '') => { mkdirSync(at(slug), { recursive: true }); g(at(slug), 'init', '-q', '--bare'); g(at(slug), 'symbolic-ref', 'HEAD', 'refs/heads/main'); desc.set(slug, d) }
  const gh = async args => {
    calls.push(args)
    const [cmd, path] = args
    if (cmd === 'api' && path === 'user') return login ? ok(`${login}\n`) : no('not logged in')
    if (cmd === 'api' && path === 'user/orgs') return ok(Object.keys(ORGS).join('\n'))
    let m = cmd === 'api' && path.match(/^user\/memberships\/orgs\/(.+)$/)
    if (m) return ORGS[m[1]] ? ok(JSON.stringify([ORGS[m[1]].state, ORGS[m[1]].role])) : no('gh: Not Found (HTTP 404)')
    m = cmd === 'api' && path.match(/^orgs\/([^/]+)$/)
    if (m) return ok(JSON.stringify([ORGS[m[1]].any, ORGS[m[1]].pub]))
    // the description, as publish asks (--jq '.description // ""') and as the source push asks ([private, description])
    m = cmd === 'api' && path.match(/^repos\/([^/]+\/[^/]+)$/)
    if (m) return desc.has(m[1]) ? ok(args.includes('[.private, (.description // "")] | @json') ? JSON.stringify([true, desc.get(m[1])]) : desc.get(m[1])) : no('gh: Not Found (HTTP 404)')
    m = cmd === 'api' && (path.match(/^repos\/([^/]+\/[^/]+)\/pages$/) || args[3]?.match(/^repos\/([^/]+\/[^/]+)\/pages$/))
    if (m) { const [o, r] = m[1].split('/'); return ok(`https://${o.toLowerCase()}.github.io/${r}/`) }
    if (cmd === 'api' && /\/pages\/builds\/latest$/.test(path)) return ok(`built ${new Date().toISOString()}`)
    if (cmd === 'repo' && path === 'create') {
      const [o] = args[2].split('/')
      if (o !== login && (!ORGS[o] || (ORGS[o].role !== 'admin' && !ORGS[o].pub))) return no('GraphQL: me does not have the correct permissions to execute `CreateRepository`')
      make(args[2], args[args.indexOf('--description') + 1])
      return ok('')
    }
    if (cmd === 'repo' && path === 'edit') return ok('')
    return no(`unexpected gh ${args.join(' ')}`)
  }
  const hub = { url: at, page: slug => `https://github.com/${slug}`, file: true }
  const head = slug => g(at(slug), 'rev-parse', 'refs/heads/main')
  return { gh, hub, calls, make, head, at, desc }
}
const site = () => { const d = tmp(); writeFileSync(join(d, 'index.html'), '<h1>Bot Wiki</h1>'); return d }

test('each organization says whether builds can go there, and why not in plain words', async () => {
  const G = github()
  const { login, orgs } = await ghOrgs(G.gh)
  assert.equal(login, 'me')
  assert.deepEqual(orgs, [
    { login: 'crew', can: true, why: '' },
    { login: 'open', can: true, why: '' },
    { login: 'shut', can: false, why: 'No permission to make repositories' },
    { login: 'later', can: false, why: 'Invitation not accepted' }
  ])
  // the organizations are listed with --paginate, so a person in many sees all of them
  assert.ok(G.calls.some(c => c[1] === 'user/orgs' && c.includes('--paginate')))
  await assert.rejects(ghOrgs(github({ login: null }).gh), e => e.status === 424 && /gh auth login/.test(e.message))
  const v = await ownerView(tmp(), github({ login: null }).gh)
  assert.equal(v.login, null); assert.deepEqual(v.orgs, []); assert.match(v.error, /gh auth login/)
})

test('the choice is kept in the data folder, checked when set, and read each time (a hand edit counts)', async () => {
  const G = github(), data = tmp()
  assert.equal(savedOwner(data), null, 'no file: the person\'s own account')
  assert.equal(await chooseOwner(data, 'Open', G.gh), 'open', 'the organization\'s own spelling is kept')
  assert.deepEqual(JSON.parse(readFileSync(join(data, 'github.json'), 'utf8')), { owner: 'open' })
  await assert.rejects(chooseOwner(data, 'shut', G.gh), e => e.status === 403 && e.message === "shut can't be used: No permission to make repositories")
  await assert.rejects(chooseOwner(data, 'strangers', G.gh), e => e.status === 404 && /not one of your organizations/.test(e.message))
  await assert.rejects(chooseOwner(data, 'a b', G.gh), /letters, numbers and dashes/)
  assert.equal(savedOwner(data), 'open', 'a refused choice changes nothing')
  // the person's own login, or nothing, is their account
  assert.equal(await chooseOwner(data, 'me', G.gh), null); assert.equal(savedOwner(data), null)
  await chooseOwner(data, 'https://github.com/crew', G.gh); assert.equal(savedOwner(data), 'crew')
  assert.equal(await chooseOwner(data, null, G.gh), null); assert.equal(savedOwner(data), null)
  // what the owner writes by hand, with the server running
  writeFileSync(join(data, 'github.json'), JSON.stringify({ owner: 'crew' }))
  assert.deepEqual(await ownerFor(data, G.gh), { login: 'me', owner: 'crew' })
  writeFileSync(join(data, 'github.json'), '{ not json')
  assert.deepEqual(await ownerFor(data, G.gh), { login: 'me', owner: 'me' })
})

test('an organization that can no longer be used stops a new repository in words, never falls back to the account', async () => {
  const G = github(), data = tmp()
  writeFileSync(join(data, 'github.json'), JSON.stringify({ owner: 'shut' }))
  await assert.rejects(ownerFor(data, G.gh), e => e.status === 403 && /Builds go to shut, which can't be used: No permission/.test(e.message))
  await assert.rejects(publishGitHub({ dir: site(), name: 'bot-wiki', title: 'Bot Wiki', key: 'r1', dataDir: data, ask: G.gh, hub: G.hub, probe: async () => true }), /Builds go to shut/)
  assert.ok(!G.calls.some(c => c[1] === 'create'), 'nothing was made anywhere')
})

test('Publish › Website goes to the organization: its repository, its github.io address, every link the Studio keeps', async () => {
  const G = github(), data = tmp()
  await chooseOwner(data, 'crew', G.gh)
  const based = []
  const out = await publishGitHub({ dir: site(), name: 'bot-wiki', title: 'Bot Wiki', key: 'r1', dataDir: data, rebase: u => based.push(u), ask: G.gh, hub: G.hub, probe: async () => true })
  assert.deepEqual(out, { url: 'https://crew.github.io/bot-wiki/', repo: 'crew/bot-wiki', fresh: true })
  assert.deepEqual(based, ['https://crew.github.io/bot-wiki/'], 'the canonical links, share tags and sitemap name the organization')
  const create = G.calls.find(c => c[1] === 'create')
  assert.equal(create[2], 'crew/bot-wiki'); assert.ok(create.includes('--public'))
  assert.equal(create[create.indexOf('--description') + 1], `Bot Wiki · ${MARK}`)
  assert.deepEqual(siteRepos(data), { r1: 'crew/bot-wiki' }, 'the build remembers the real owner')
  assert.ok(G.head('crew/bot-wiki'))
  assert.ok(!existsSync(G.at('me/bot-wiki')), 'nothing on the person\'s own account')
  // publishing the same build again goes back to the same repository
  const again = await publishGitHub({ dir: site(), name: 'bot-wiki', title: 'Bot Wiki', key: 'r1', dataDir: data, ask: G.gh, hub: G.hub, probe: async () => true })
  assert.equal(again.repo, 'crew/bot-wiki'); assert.equal(again.fresh, false)
  assert.equal(G.calls.filter(c => c[1] === 'create').length, 1)
})

test('the person\'s account stays the default, and a site with a key file in it is never published', async () => {
  const G = github(), data = tmp()
  const out = await publishGitHub({ dir: site(), name: 'bot-wiki', title: 'Bot Wiki', key: 'r1', dataDir: data, ask: G.gh, hub: G.hub, probe: async () => true })
  assert.deepEqual(out, { url: 'https://me.github.io/bot-wiki/', repo: 'me/bot-wiki', fresh: true })
  const leaky = site(); writeFileSync(join(leaky, '.env'), 'KEY=1')
  await assert.rejects(publishGitHub({ dir: leaky, name: 'leaky', title: 'Leaky', key: 'r2', dataDir: data, ask: G.gh, hub: G.hub, probe: async () => true }), /Not published\. This file looks like keys: \.env/)
  assert.ok(!existsSync(G.at('me/leaky')))
})

test('in an organization, a marked repository is taken over only when it is this build\'s own', async () => {
  const check = repos => async r => { if (r in repos) return repos[r]; throw Object.assign(new Error('HTTP 404 Not Found'), { stderr: '' }) }
  const ours = `Bot Wiki · ${MARK}`
  // someone else's Studio in the same organization made crew/bot-wiki: skipped, never replaced
  assert.deepEqual(await pickRepo('crew', 'bot-wiki', { shared: true, check: check({ 'bot-wiki': ours }) }), { repo: 'bot-wiki-site', fresh: true })
  // this build's own site, moved from the person's account into the organization: found again by its name
  assert.deepEqual(await pickRepo('crew', 'bot-wiki', { mine: 'me/bot-wiki', shared: true, check: check({ 'bot-wiki': ours }) }), { repo: 'bot-wiki', fresh: false })
  // not moved: a new one in the organization; the old one on the account is not touched
  assert.deepEqual(await pickRepo('crew', 'bot-wiki', { mine: 'me/bot-wiki', shared: true, check: check({}) }), { repo: 'bot-wiki', fresh: true })
  // on the person's own account it is as before
  assert.deepEqual(await pickRepo('me', 'bot-wiki', { check: check({ 'bot-wiki': ours }) }), { repo: 'bot-wiki', fresh: false })
})

test('a build published to the account before goes to a new organization repository; the old one is not touched', async () => {
  const G = github(), data = tmp()
  G.make('me/bot-wiki', `Bot Wiki · ${MARK}`)
  claimRepo(data, 'r1', 'me/bot-wiki')
  await chooseOwner(data, 'open', G.gh)
  const out = await publishGitHub({ dir: site(), name: 'bot-wiki', title: 'Bot Wiki', key: 'r1', dataDir: data, ask: G.gh, hub: G.hub, probe: async () => true })
  assert.deepEqual(out, { url: 'https://open.github.io/bot-wiki/', repo: 'open/bot-wiki', fresh: true })
  assert.throws(() => G.head('me/bot-wiki'), undefined, 'the account\'s repository got no push')
})

test('a project\'s first push makes its source repository in the organization; a linked one stays where it is', async () => {
  const G = github(), dir = tmp()
  writeFileSync(join(dir, 'index.html'), 'x'); g(dir, 'init', '-q'); g(dir, 'add', '-A'); g(dir, 'commit', '-qm', 'init')
  let asked = 0
  const ownerOf = async () => { asked++; return 'crew' }
  const first = await pushSource({ dir, title: 'ARES', hub: G.hub, gh: G.gh, ownerOf })
  assert.equal(first.repo, 'crew/ares'); assert.equal(first.private, true); assert.equal(first.url, 'https://github.com/crew/ares')
  assert.equal(G.calls.find(c => c[1] === 'create')[2], 'crew/ares')
  // the next push goes to the linked repository without asking where new ones go
  writeFileSync(join(dir, 'index.html'), 'y')
  const second = await pushSource({ dir, link: first, title: 'ARES', hub: G.hub, gh: G.gh, ownerOf: async () => { throw new Error('not asked') } })
  assert.equal(second.repo, 'crew/ares'); assert.equal(asked, 1)
  // a project linked to the account before keeps going there
  const old = tmp(); writeFileSync(join(old, 'a.txt'), 'a'); g(old, 'init', '-q'); g(old, 'add', '-A'); g(old, 'commit', '-qm', 'init')
  const mine = await pushSource({ dir: old, title: 'Old', hub: G.hub, gh: G.gh })
  assert.equal(mine.repo, 'me/old')
  writeFileSync(join(old, 'a.txt'), 'b')
  assert.equal((await pushSource({ dir: old, link: mine, title: 'Old', hub: G.hub, gh: G.gh, ownerOf })).repo, 'me/old')
})

test('typed in the chat: "publish to <organization>" and "where do builds go"; host words are not names', () => {
  for (const t of ['publish to Swarm-Generations', 'Publish to Swarm-Generations.', 'publish builds to swarm-generations', 'builds go to Swarm-Generations', 'send new builds to the org Swarm-Generations', 'publish to https://github.com/Swarm-Generations']) assert.equal(ownerAsk(t)?.did === 'set' && ownerAsk(t)?.owner?.toLowerCase(), 'swarm-generations', t)
  for (const t of ['publish to my account', 'Publish builds to my own GitHub account', 'builds go to my github']) assert.deepEqual(ownerAsk(t), { did: 'set', owner: null }, t)
  for (const t of ['where do builds go', 'Where do my builds go on GitHub?']) assert.deepEqual(ownerAsk(t), { did: 'show' }, t)
  for (const t of ['', 'publish to github', 'publish to vercel', 'publish to Cloudflare', 'publish it', 'publish to production', 'push to github', 'publish the menu page to the footer', 'publish to a b']) assert.equal(ownerAsk(t), null, t)
  assert.equal(ownerWhere({ login: 'me', owner: 'crew', orgs: [], error: null }), 'New sites and repositories go to crew.')
  assert.equal(ownerWhere({ login: 'me', owner: null, orgs: [], error: null }), 'New sites and repositories go to your account, me.')
  const base = { project: 'p', name: 'P', piece: 'app', pieces: ['app'], run: 'r', source: true, login: 'me', suggest: 'p', link: null, origin: null, ahead: false, behind: null, unreachable: null, job: null }
  assert.deepEqual(githubLines({ ...base, owner: 'crew' }), ['Not on GitHub', 'New repositories go to crew'])
  assert.deepEqual(githubLines({ ...base, owner: null }), ['Not on GitHub'])
})

test('the chat takes a name only when it is the person\'s account or one of their organizations', async () => {
  const view = { login: 'me', owner: null, orgs: [{ login: 'crew', can: true, why: '' }, { login: 'shut', can: false, why: 'No permission to make repositories' }], error: null }
  const posts = []
  const api = async (path, opts) => {
    if (opts?.method === 'POST') {
      const { owner } = JSON.parse(opts.body); posts.push(owner)
      if (owner === 'shut') return new Response(JSON.stringify({ error: "shut can't be used: No permission to make repositories" }), { status: 403 })
      return new Response(JSON.stringify({ ...view, owner }))
    }
    return new Response(JSON.stringify(view))
  }
  const run = async text => { const said = [], answers = []; const took = await ownerSay(text, { api, said: t => said.push(t), answer: t => answers.push(t) }); return { took, said, answers } }
  assert.deepEqual(await run('publish to crew'), { took: true, said: ['publish to crew'], answers: ['New sites and repositories go to crew.'] })
  assert.deepEqual(await run('publish to shut'), { took: true, said: ['publish to shut'], answers: ["shut can't be used: No permission to make repositories"] })
  assert.deepEqual(await run('publish to the-moon'), { took: false, said: [], answers: [] }, 'not theirs: the message goes on as it would have')
  assert.deepEqual(await run('make the hero bigger'), { took: false, said: [], answers: [] })
  assert.deepEqual(posts, ['crew', 'shut'])
  // the hosted studio (no door: a 403) never takes it
  assert.equal(await ownerSay('publish to crew', { api: async () => new Response('{}', { status: 403 }), said: () => {}, answer: () => {} }), false)
})

test('GET and POST /api/github/owner: the view Settings draws, and a choice refused in words', async () => {
  const G = github(), data = tmp()
  const route = sourceRoutes({ runsDir: tmp(), dataDir: data, projects: { get: () => null, projectOf: () => null }, readEvents: () => [], record: () => {}, bringIn: null, gh: G.gh })
  const srv = createServer((req, res) => { if (!route(req, res, new URL(req.url, 'http://x'))) res.writeHead(404).end() })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const at = `http://127.0.0.1:${srv.address().port}/api/github/owner`
  const post = owner => fetch(at, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner }) })
  try {
    const v = await (await fetch(at)).json()
    assert.equal(v.login, 'me'); assert.equal(v.owner, null); assert.equal(v.error, null)
    assert.deepEqual(v.orgs.map(o => [o.login, o.can]), [['crew', true], ['open', true], ['shut', false], ['later', false]])
    const set = await post('crew')
    assert.equal(set.status, 200); assert.equal((await set.json()).owner, 'crew')
    const no = await post('shut')
    assert.equal(no.status, 403); assert.deepEqual(await no.json(), { error: "shut can't be used: No permission to make repositories" })
    assert.equal(savedOwner(data), 'crew')
    assert.equal((await (await post(null)).json()).owner, null)
  } finally { srv.close() }
})
