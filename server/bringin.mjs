// Bring a game or app in (docs/specs/45-intake.md, engine/bringin.mjs):
//   POST /api/intake { repo? | folder?, path?, kind: 'game' | 'app', name?, project? } -> { project, run }
// The answer comes at once, with the run made and in its project; the files come in behind it (the run is
// working until they are, like a build), so Projects shows its card with the crew on it straight away.
// A repository is fetched with the person's own git and gh login; a folder is read where it is. Nothing of
// the project is run. The hosted studio has no such door (server/hosted.mjs answers 403).
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readAsk, subFolder, shapeOf, checkReach, fetchRepo, bringFolder, gitFacts, startEvents, doneEvent } from '../engine/bringin.mjs'
import { execFile } from '../engine/proc.mjs'

// the run's own history starts here (the files, never the project's .git): each later change by the crew is a commit
const ownGit = dir => new Promise(ok => {
  const g = (args, next) => execFile('git', ['-c', 'core.hooksPath=', '-c', 'user.name=Swarm Studio', '-c', 'user.email=swarm@localhost', ...args], { cwd: dir, timeout: 120000, maxBuffer: 1e6 }, err => (err ? ok(false) : next()))
  g(['init', '-q'], () => g(['add', '-A'], () => g(['commit', '-qm', 'Brought in'], () => ok(true))))
})

// `join` (engine/sourcehub.mjs joinHistory; the server passes it, a test may not): the whole of a repository
// continues that repository's history when its files came in unchanged, so it can be pushed back later.
export function bringInRoutes({ runsDir, projects, apps, record, readEvents, broadcast = () => {}, home = homedir(), fetch = fetchRepo, join: joinRepo = null }) {
  const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))

  // `onEnd(err)` is told when the files are in (or why they are not): the GitHub door waits on it (server/sourcehub.mjs)
  async function bringIn(input, { onEnd = null } = {}) {
    const ask = readAsk(input, { home, deny: [runsDir] })
    // a folder is looked at before anything is made: a wrong one is refused in the sheet, with no run left behind
    if (ask.folder) { const from = ask.sub ? subFolder(ask.folder, ask.sub) : ask.folder, sh = shapeOf(from); if (sh.shape === 'static') checkReach(from, sh.page, realpathSync(home)) }
    // the project it joins: the one named, else one of the same name (docs/specs/18-projects.md), else its own
    let pid = null
    if (ask.project) {
      const p = projects.get(ask.project)
      if (!p || p.trashed) throw Object.assign(new Error('no such project'), { status: 404 })
      pid = p.id
    } else pid = projects.resolve(ask.name)
    // a game joining a project with a site or an app is that build's game, so its Game mode opens it
    const host = pid && ask.kind === 'game' ? (projects.get(pid)?.versions || []).find(v => v.piece !== 'game' && v.piece !== 'film')?.id || null : null
    const id = new Date().toISOString().replace(/[:.]/g, '-')
    const runDir = join(runsDir, id)
    if (existsSync(runDir)) throw Object.assign(new Error('one at a time: try again'), { status: 409 })
    mkdirSync(runDir, { recursive: true })
    const source = ask.repo ? { repo: ask.repo.slug, path: ask.sub } : { folder: ask.folder, path: ask.sub }
    writeFileSync(join(runDir, 'meta.json'), JSON.stringify({ ...(pid ? { project: pid } : { projectName: ask.name }), piece: ask.kind }))
    writeFileSync(join(runDir, 'events.jsonl'), startEvents({ id, kind: ask.kind, name: ask.name, source, from: host }).map(e => JSON.stringify(e)).join('\n') + '\n')
    if (pid) projects.claim(id, pid)
    const a = await apps()
    a.bring(id, { kind: ask.kind, work: async (step, signal) => {
      let got = null
      try {
        if (ask.repo) { step({ kind: 'setup', text: `fetching ${ask.repo.slug}` }); got = await fetch(ask.repo, ask.sub, { signal }) }
        const info = await bringFolder({ root: got ? got.dir : ask.folder, sub: ask.sub, runDir, signal, step, top: got ? got.dir : home })
        // where it is from, for a later Pull: the repository, the folder in it and the commit
        const at = got ? { sha: got.sha } : (g => (g ? { sha: g.sha, ...(g.repo ? { origin: g.repo } : {}) } : {}))(gitFacts(ask.sub ? join(ask.folder, ask.sub) : ask.folder, home))
        step({ kind: 'setup', text: 'starting its history' })
        const joined = got && !ask.sub && joinRepo ? await joinRepo(join(runDir, 'app'), ask.repo.slug) : null
        if (!joined) await ownGit(join(runDir, 'app'))
        record(id, doneEvent({ id, source: { ...source, ...at, ...(joined ? { sha: joined, joined: true } : {}) }, ...info }))
        if (host) record(host, { type: 'game:linked', t: Date.now(), run: host, game: id, title: ask.name, intake: true })
        onEnd?.(null)
      } catch (err) { onEnd?.(err); throw err } finally { got?.clean() }
    } })
    broadcast({ type: 'files:changed', t: Date.now(), run: id })
    return { project: projects.projectOf(id) || pid || id, run: id }
  }

  function handle(req, res, url) {
    if (url.pathname !== '/api/intake' || req.method !== 'POST') return false
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy() })
    req.on('end', () => {
      let input = {}
      try { input = JSON.parse(body || '{}') } catch {}
      bringIn(input && typeof input === 'object' ? input : {}).then(out => json(res, 200, out), err => json(res, err.status || 400, { error: String(err.message || err) }))
    })
    return true
  }
  return Object.assign(handle, { bringIn })
}
