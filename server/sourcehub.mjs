// A project's source on GitHub (docs/specs/45-intake.md, engine/sourcehub.mjs): the door inside a project.
//   GET  /api/projects/<id>/github[?run=&piece=&check=1]  -> what is true: linked or not, pushed or pulled when,
//        changes not pushed, and (with check=1, one request to GitHub) new commits to pull
//   POST /api/projects/<id>/github { action: 'push' | 'pull' | 'bring', piece?, run?, repo?, public?, path?, kind? }
//        push   the run's history to its repository; the first one makes it (private unless public: true) from
//               `repo` as a name, or links `repo` as owner/name when that one is empty or already this project's
//        pull   what is new in the linked repository (or the one it was brought in from), as the next version
//        bring  a repository into this project, when it has no app or game source yet
// The answer comes at once with the job working; the sheet and the chat ask again until it is done. The person's
// own gh login does it; no token is read or kept. The hosted studio has no such door (server/hosted.mjs: 403).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GITHUB, ghCli, ghLogin, pushSource, remoteHead, localHead, hasCommit, isBehind, changedUnder, repoName, readTarget, sourceLinks, rememberLink } from '../engine/sourcehub.mjs'
import { parseRepo, cleanSub, KINDS } from '../engine/bringin.mjs'

const fail = (message, status = 400, more = {}) => Object.assign(new Error(message), { status, ...more })

export function sourceRoutes({ runsDir, dataDir, projects, readEvents, record, broadcast = () => {}, bringIn, working = async () => false, hub = GITHUB, gh = ghCli, now = () => Date.now() }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
  const jobs = new Map() // "<project>:<piece>" -> { did, state, step, message, repo, url, pull, keys, run, t }
  const appDir = run => join(runsDir, run, 'app')
  let who = null
  const login = async () => {
    if (who && now() - who.t < 60000 && who.login) return who.login
    who = { t: now(), login: await ghLogin(gh).catch(() => null) }
    return who.login
  }

  // the project, by its id or by one of its runs
  function projectFor(ref) {
    const id = String(ref || '')
    if (!/^[\w-]{1,64}$/.test(id)) throw fail('no such project', 404)
    const p = projects.get(id) || projects.get(projects.projectOf(id) || '')
    if (!p || p.trashed) throw fail('no such project', 404)
    return p
  }
  // the project's source: per piece (the app, the game), its newest run with a history of its own
  function sourcesOf(p) {
    const ids = [...new Set([...(p.versions || []).map(v => v.id), ...Object.keys(p.parts || {})])].sort()
    const out = new Map()
    for (const run of ids) {
      if (!existsSync(join(appDir(run), '.git'))) continue
      const start = (readEvents(run) || []).find(e => e.type === 'run:start')
      out.set(start?.kind === 'game' ? 'game' : 'app', { run, title: start?.title || p.name })
    }
    return out
  }
  // which piece is meant: the one asked for, the one the open run is, else the newest
  function pick(p, { run = '', piece = '' } = {}) {
    const srcs = sourcesOf(p)
    const byRun = [...srcs].find(([, s]) => s.run === run)?.[0]
    const kind = KINDS.includes(piece) && srcs.has(piece) ? piece : byRun || [...srcs].sort((a, b) => a[1].run.localeCompare(b[1].run)).at(-1)?.[0] || (KINDS.includes(piece) ? piece : 'app')
    return { srcs, piece: kind, src: srcs.get(kind) || null, key: `${p.id}:${kind}` }
  }
  // where a run was brought in from, when that is a GitHub repository
  function originOf(run) {
    const from = (readEvents(run) || []).findLast(e => e.type === 'intake')?.source
    const repo = from?.repo || from?.origin
    return repo ? { repo, path: from.path || '', sha: from.sha || null } : null
  }

  async function state(ref, ask = {}) {
    const p = projectFor(ref)
    const { srcs, piece, src, key } = pick(p, ask)
    const links = sourceLinks(dataDir)
    const link = links[key] || null, seen = links[`${key}:from`] || null
    const origin = src ? originOf(src.run) : null
    const local = src ? await localHead(appDir(src.run), hub) : null
    // a version that came in with a history of its own cannot go to a repository that holds another
    const fits = !link?.sha || !src || await hasCommit(appDir(src.run), link.sha, hub)
    let behind = null, unreachable = null
    if (ask.check && src && (link || origin) && jobs.get(key)?.state !== 'working') {
      try {
        const r = await remoteHead((link || origin).repo, hub, { timeout: 12000 })
        behind = !r.sha ? false : link ? r.sha !== link.sha && !(await isBehind(appDir(src.run), r.sha, hub)) : r.sha !== (seen?.repo === origin.repo && seen.sha || origin.sha)
      } catch (err) { unreachable = String(err.message || err) }
    }
    return {
      project: p.id, name: p.name, piece, pieces: [...srcs.keys()], run: src?.run || null, source: !!src, login: await login(),
      suggest: repoName(src?.title || p.name),
      link: link ? { repo: link.repo, url: hub.page(link.repo), private: link.private !== false, pushed: link.pushed || null, pulled: link.pulled || null, fits } : null,
      origin: origin ? { repo: origin.repo, path: origin.path, url: hub.page(origin.repo), pulled: seen?.pulled || null } : null,
      ahead: !!(link && fits && local && (local.dirty || local.sha !== link.sha)), behind, unreachable,
      job: jobs.get(key) || null
    }
  }

  // one job per piece: its steps are what the sheet and the chat show beside the crew's cursor
  function start(key, did, work) {
    const j = { did, state: 'working', step: '', message: '', t: now() }
    jobs.set(key, j)
    const say = () => broadcast({ type: 'source:job', t: now(), key, did, state: j.state, step: j.step })
    j.done = Promise.resolve().then(() => work(text => { j.step = String(text); say() })).then(out => { Object.assign(j, { state: 'done', step: '' }, out) }, err => {
      Object.assign(j, { state: 'failed', step: '', message: String(err.message || err).slice(0, 400), ...(err.pull ? { pull: true } : {}), ...(err.keys ? { keys: err.keys } : {}) })
    }).then(say)
    say()
    return j
  }

  async function act(ref, input = {}) {
    const p = projectFor(ref)
    const { piece, src, key } = pick(p, input)
    if (jobs.get(key)?.state === 'working') return state(ref, input)
    const action = String(input.action || '')
    const link = sourceLinks(dataDir)[key] || null

    if (action === 'bring') {
      if (src) throw fail('This project already has its source. Pull brings in what is new.', 409)
      const repo = parseRepo(input.repo), path = cleanSub(input.path), kind = KINDS.includes(input.kind) ? input.kind : null
      if (!kind) throw fail('Game or App?')
      const k = `${p.id}:${kind}`
      let end = null
      const ended = new Promise((ok, no) => { end = err => (err ? no(err) : ok()) })
      ended.catch(() => {})
      const out = await bringIn({ repo: repo.slug, path, kind, name: p.name, project: p.id }, { onEnd: end })
      start(k, 'bring', async step => { step(`bringing in ${repo.slug}`); await ended; return { run: out.run, repo: repo.slug, url: hub.page(repo.slug), message: `Brought in from ${repo.slug}` } })
      return state(ref, { piece: kind })
    }

    if (!src) throw fail('This project has no app or game source yet', 409)
    const dir = appDir(src.run)
    if (await working(src.run)) throw fail('The crew is still working on it. Try again when they are done.', 409)

    if (action === 'push') {
      const want = { ...readTarget(input.repo), public: input.public === true }
      const fits = !link?.sha || await hasCommit(dir, link.sha, hub)
      if (link && !fits && !want.repo && !want.name) throw fail(`This version does not continue ${link.repo}, so it cannot go there. Give it a repository of its own.`, 409)
      start(key, 'push', async step => {
        const out = await pushSource({ dir, link, want, title: src.title, hub, gh, step, onLink: l => rememberLink(dataDir, key, { repo: l.repo, private: l.private, branch: l.branch, made: l.made }) })
        rememberLink(dataDir, key, { repo: out.repo, sha: out.sha, pushed: now() })
        if (!out.same) record(src.run, { type: 'source:push', t: now(), run: src.run, repo: out.repo, sha: out.sha, private: out.private })
        return { repo: out.repo, url: out.url, private: out.private, message: out.same ? `Nothing new to push: ${out.repo} has it all` : `Pushed to ${out.repo}` }
      })
      return state(ref, input)
    }

    if (action === 'pull') {
      const origin = originOf(src.run)
      const from = link ? { repo: link.repo, path: '' } : origin
      if (!from) throw fail('This project is not linked to a repository yet', 409)
      const slug = parseRepo(from.repo).slug, path = cleanSub(from.path)
      start(key, 'pull', async step => {
        step(`checking ${slug}`)
        const seen = sourceLinks(dataDir)[`${key}:from`]
        const known = link ? link.sha : (seen?.repo === slug && seen.sha) || origin.sha
        const r = await remoteHead(slug, hub)
        const nothing = { repo: slug, url: hub.page(slug), message: `Nothing new on ${slug}` }
        if (!r.sha || r.sha === known || (link && await isBehind(dir, r.sha, hub))) return nothing
        if (!link && path && await changedUnder(slug, known, r.sha, path, gh) === false) {
          rememberLink(dataDir, `${key}:from`, { repo: slug, sha: r.sha })
          return { ...nothing, message: `Nothing new in ${path} on ${slug}` }
        }
        step(`pulling from ${slug}`)
        let end = null
        const ended = new Promise((ok, no) => { end = err => (err ? no(err) : ok()) })
        ended.catch(() => {})
        const out = await bringIn({ repo: slug, path, kind: piece, name: src.title, project: p.id }, { onEnd: end })
        await ended
        const got = originOf(out.run)
        if (link) rememberLink(dataDir, key, { repo: slug, sha: got?.sha || r.sha, pulled: now() })
        else rememberLink(dataDir, `${key}:from`, { repo: slug, sha: got?.sha || r.sha, pulled: now() })
        record(out.run, { type: 'source:pull', t: now(), run: out.run, repo: slug, sha: got?.sha || r.sha, from: src.run })
        return { run: out.run, repo: slug, url: hub.page(slug), message: `Pulled from ${slug}: it is the project's newest version` }
      })
      return state(ref, input)
    }
    throw fail('push, pull or bring')
  }

  function handle(req, res, url) {
    const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/github$/)
    if (!m) return false
    const say = err => json(res, err.status || 400, { error: String(err.message || err), ...(err.pull ? { pull: true } : {}), ...(err.keys ? { keys: err.keys } : {}) })
    const view = st => ({ ...st, job: st.job ? { ...st.job, done: undefined } : null })
    if (req.method === 'GET') {
      state(decodeURIComponent(m[1]), { run: url.searchParams.get('run') || '', piece: url.searchParams.get('piece') || '', check: url.searchParams.get('check') === '1' }).then(st => json(res, 200, view(st)), say)
      return true
    }
    if (req.method !== 'POST') return false
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      act(decodeURIComponent(m[1]), input && typeof input === 'object' ? input : {}).then(st => json(res, 200, view(st)), say)
    })
    return true
  }
  return Object.assign(handle, { state, act, jobs, busy: () => [...jobs.values()].some(j => j.state === 'working') })
}
