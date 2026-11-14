// A project's source on GitHub (docs/specs/45-intake.md, "The other direction"): the run's own git history
// (runs/<id>/app/.git, a commit per change) pushed to a repository under the person's own `gh` login, and what
// is new there brought back. This file is the parts with no server in them.
//   Never a force push. Never a repository the Studio did not make or the person did not name. A file that
//   looks like a key anywhere in the commits being sent stops the push, with its name.
// git and gh run through engine/proc.mjs (a minimal environment), with no prompt, no hook, and the person's gh
// login as the only credential helper. `hub` (the address of a repository) and `gh` are parameters so the
// tests can stand a local bare repository in for GitHub; nothing but a test passes them.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from './proc.mjs'
import { parseRepo } from './bringin.mjs'

const fail = (message, status = 400, more = {}) => Object.assign(new Error(message), { status, ...more })
const MARK = 'made with Swarm Studio'
const SIGN_IN = 'GitHub CLI is not signed in: run gh auth login'

/** the real GitHub: https only, and git may never read a repository from a file path */
export const GITHUB = { url: slug => `https://github.com/${slug}.git`, page: slug => `https://github.com/${slug}`, file: false }

const exec = (cmd, args, { cwd, timeout = 120000 } = {}) => new Promise(ok => {
  execFile(cmd, args, { cwd, timeout, maxBuffer: 64e6, windowsHide: true, env: { GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GIT_ASKPASS: '', GCM_INTERACTIVE: 'never', GIT_LFS_SKIP_SMUDGE: '1' } },
    (err, stdout, stderr) => ok({ ok: !err, out: String(stdout || ''), err: String(stderr || err?.message || '') }))
})
/** gh, as the person: → { ok, out, err } */
export const ghCli = (args, opts) => exec('gh', args, { timeout: 30000, ...opts })
// git in the run's own folder: no hook of the project's runs, nothing is asked, the gh login answers for GitHub
const git = (dir, args, hub = GITHUB, opts) => exec('git', ['-c', 'core.hooksPath=', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', '-c', `protocol.file.allow=${hub.file ? 'always' : 'never'}`,
  '-c', 'user.name=Swarm Studio', '-c', 'user.email=swarm@localhost', ...args], { cwd: dir, ...opts })
// git's own last words, without any name and password in an address
const said = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(-2).join(' ').replace(/https:\/\/[^@\s/]+@/g, 'https://').slice(0, 240)

// ---------- files that hold keys
// Intake never copies these (engine/bringin.mjs SKIP: .env, .env.*, .npmrc); a push also refuses key files by
// their endings. A file kept as an example (.env.example) is not one.
const KEY_FILE = /^(\.env|\.env\..+|\.npmrc|\.netrc|id_(rsa|dsa|ecdsa|ed25519)|.+\.(pem|key|p12|pfx|jks|keystore))$/i
const KEY_KEPT = /^\.env\.(example|sample|template)$/i
/** does this path name a file that holds keys? */
export const keyFile = path => { const n = String(path).split('/').pop() || ''; return KEY_FILE.test(n) && !KEY_KEPT.test(n) }

// Untracked build output and key files never get into a commit the Studio makes before a push (the app
// scaffold's own .gitignore covers node_modules and dist, not .env). Written to .git/info/exclude, so no file
// of the project changes.
const EXCLUDE = ['node_modules/', '.output/', '.nitro/', '.next/', '.vite/', '.vercel/', '.dyad/', '.turbo/', '.cache/', '.parcel-cache/', '.godot/', '.import/', '.DS_Store', 'Thumbs.db', '.swarm-built.json', '.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template', '.npmrc', '.netrc', '*.pem', '*.key']
function exclude(dir) {
  const f = join(dir, '.git', 'info', 'exclude')
  let text = ''
  try { text = readFileSync(f, 'utf8') } catch {}
  if (text.includes('# swarm studio')) return
  mkdirSync(join(dir, '.git', 'info'), { recursive: true })
  writeFileSync(f, `${text.replace(/\n*$/, '\n')}# swarm studio: never committed before a push\n${EXCLUDE.join('\n')}\n`)
}

/** Every key file named in the commits of `range` ('HEAD', or '<sha>..HEAD'): the whole history that would go
 * up, not only the newest files (a .env committed once and deleted later is still in it). → paths */
export async function keyFilesIn(dir, range = 'HEAD', hub = GITHUB) {
  const r = await git(dir, ['rev-list', '--objects', range, '--'], hub)
  if (!r.ok) throw fail(`Could not read the project's history: ${said(r.err)}`, 500)
  const out = new Set()
  for (const l of r.out.split('\n')) { const p = l.slice(l.indexOf(' ') + 1); if (l.includes(' ') && keyFile(p)) out.add(p) }
  return [...out].sort()
}

// ---------- what is where
/** The run's own history: its newest commit and whether files have changed since. null: no history there. */
export async function localHead(dir, hub = GITHUB) {
  if (!existsSync(join(dir, '.git'))) return null
  const head = await git(dir, ['rev-parse', '--verify', '-q', 'HEAD'], hub)
  if (!head.ok) return null
  const st = await git(dir, ['status', '--porcelain'], hub)
  return { sha: head.out.trim(), dirty: st.ok && !!st.out.trim() }
}
/** does the run's history hold this commit? */
export const hasCommit = async (dir, sha, hub = GITHUB) => !!sha && (await git(dir, ['cat-file', '-e', `${sha}^{commit}`], hub)).ok
/** is `sha` this history's newest commit or one before it? (a commit the history lacks is not) */
export const isBehind = async (dir, sha, hub = GITHUB) => (await hasCommit(dir, sha, hub)) && (await git(dir, ['merge-base', '--is-ancestor', sha, 'HEAD'], hub)).ok

/** The repository's newest commit and its branch, asked of the remote (one request, nothing is fetched).
 * → { sha: null, branch: 'main' } for an empty one; throws in words when it cannot be reached */
export async function remoteHead(slug, hub = GITHUB, { timeout = 20000 } = {}) {
  const r = await git(undefined, ['ls-remote', '--symref', '--', hub.url(slug), 'HEAD'], hub, { timeout })
  if (!r.ok) {
    if (/ENOENT/.test(r.err)) throw fail('git is not installed on this computer', 424)
    if (/not found|Authentication|could not read|denied|403|404/i.test(r.err)) throw fail(`GitHub would not give ${slug}. If it is private, sign in first: gh auth login`, 424)
    throw fail(`Could not reach ${slug}: ${said(r.err) || 'git stopped'}`, 502)
  }
  const branch = r.out.match(/^ref: refs\/heads\/(\S+)\s+HEAD$/m)?.[1] || 'main'
  const sha = r.out.match(/^([0-9a-f]{40,64})\s+HEAD$/m)?.[1] || null
  return { sha, branch }
}

/** who is signed in to gh, or null */
export async function ghLogin(gh = ghCli) {
  const r = await gh(['api', 'user', '--jq', '.login'])
  const login = r.ok ? r.out.trim() : ''
  return /^[A-Za-z0-9-]{1,39}$/.test(login) ? login : null
}
/** a repository as the person's login sees it: { private, mine: the Studio made it } or null when there is none */
export async function repoFacts(slug, gh = ghCli) {
  const r = await gh(['api', `repos/${slug}`, '--jq', '[.private, (.description // "")] | @json'])
  if (!r.ok) {
    if (/404|Not Found/i.test(r.err + r.out)) return null
    throw fail(/ENOENT/.test(r.err) ? 'The GitHub CLI (gh) is not installed on this computer' : `GitHub did not answer for ${slug}: ${said(r.err)}`, 502)
  }
  let got = []
  try { got = JSON.parse(r.out) } catch {}
  return { private: got[0] === true, mine: String(got[1] || '').includes(MARK) }
}
/** Did anything under `path` change between two commits of the repository? → true, false, or null (GitHub
 * would not say: more than it lists, or no answer) */
export async function changedUnder(slug, from, to, path, gh = ghCli) {
  if (!path) return true
  if (!from || !to) return null
  const r = await gh(['api', `repos/${slug}/compare/${from}...${to}`, '--jq', '[(.files | length), (.files[].filename)] | @json'])
  if (!r.ok) return null
  let got = []
  try { got = JSON.parse(r.out) } catch { return null }
  if (!Array.isArray(got) || typeof got[0] !== 'number' || got[0] >= 300) return null
  return got.slice(1).some(f => String(f).startsWith(`${path}/`))
}

/** a repository's name from a project's: "Night Runner!" → "night-runner" */
export const repoName = title => String(title || '').normalize('NFKD').replace(/[^\w\s.-]+/g, '').trim().toLowerCase().replace(/[\s_.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project'

/** What the person typed in the sheet's Repository field: "owner/name" (or its https address) names one that
 * exists; a bare name is a new one under their login. → { repo } or { name } */
export function readTarget(given) {
  const s = String(given ?? '').trim()
  if (!s) return {}
  if (s.includes('/')) return { repo: parseRepo(s).slug }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(s) || s.startsWith('-') || s === '.' || s === '..') throw fail('A repository name is letters, numbers, dots and dashes')
  return { name: s }
}

// ---------- push
/**
 * Push the run's history. `link` is the repository this project already goes to ({ repo, branch }), if any;
 * `want` is what the person asked for when there is none (or to change it): { repo: 'owner/name' } links one
 * that exists, { name } makes a new one, `public: true` makes it public (private otherwise).
 *   - a new repository is made only when the name is free; one that exists is never taken over
 *   - a named repository is linked only when it is empty or its newest commit is already in this history
 *   - the remote having commits this history lacks is refused, with `pull: true`
 *   - a key file in the commits being sent is refused, with the names in `keys`
 * `onLink(link)` is called as soon as the repository is known (before the push), so a push that fails goes back
 * to the same one. → { repo, url, private, branch, sha, made, fresh, same: nothing new to send }
 */
export async function pushSource({ dir, link = null, want = {}, title = '', hub = GITHUB, gh = ghCli, step = () => {}, onLink = () => {} }) {
  const login = await ghLogin(gh)
  if (!login) throw fail(SIGN_IN, 424)
  if (!existsSync(join(dir, '.git'))) throw fail('Nothing to push yet: this project has no source', 409)
  // what changed since the last commit goes into one more (the crew commits each change; a hand edit may not be)
  exclude(dir)
  if ((await localHead(dir, hub))?.dirty) {
    step('saving the latest changes')
    await git(dir, ['add', '-A'], hub)
    await git(dir, ['commit', '-qm', 'Changes made in Swarm Studio'], hub)
  }
  const local = await localHead(dir, hub)
  if (!local) throw fail('Nothing to push yet: this project has no history', 409)

  const named = want.repo ? parseRepo(want.repo).slug : null
  const fresh = !named && (want.name || !link)
  const slug = named || (fresh ? `${login}/${readTarget(want.name || repoName(title)).name}` : link.repo)
  step(`checking ${slug}`)
  const facts = await repoFacts(slug, gh)
  if (fresh && facts) throw fail(`${slug} is already on GitHub. Give another name, or name it whole (${slug}) if it is this project's`, 409)
  if (!fresh && !facts) throw fail(`No repository ${slug} that your GitHub login can reach`, 404)
  let remote = { sha: null, branch: 'main' }
  if (!fresh) {
    remote = await remoteHead(slug, hub)
    if (remote.sha && !(await isBehind(dir, remote.sha, hub))) {
      if (link && link.repo === slug) throw fail(`${slug} has commits this project does not have. Pull them first.`, 409, { pull: true })
      throw fail(`${slug} already holds other work. Name an empty repository, or one this project was pushed to.`, 409)
    }
  }
  const keys = await keyFilesIn(dir, remote.sha ? `${remote.sha}..HEAD` : 'HEAD', hub)
  if (keys.length) throw fail(`Not pushed. ${keys.length === 1 ? 'This file looks' : 'These files look'} like keys: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ` and ${keys.length - 8} more` : ''}. Take ${keys.length === 1 ? 'it' : 'them'} out of the project first.`, 422, { keys })

  const isPrivate = fresh ? !want.public : facts.private
  if (fresh) {
    step(`making ${slug}`)
    const made = await gh(['repo', 'create', slug, isPrivate ? '--private' : '--public', '--description', `${title || slug.split('/')[1]} · ${MARK}`.slice(0, 340)])
    if (!made.ok) throw fail(`GitHub would not make ${slug}: ${said(made.err)}`, 502)
  }
  const out = { repo: slug, url: hub.page(slug), private: isPrivate, branch: remote.branch, made: fresh ? true : !!(link && link.repo === slug && link.made), fresh: !!fresh }
  onLink(out)
  if (remote.sha === local.sha) return { ...out, sha: local.sha, same: true }
  step(`pushing to ${slug}`)
  // by address and branch, never a remote kept in the project's own git config, and never with --force
  const p = await git(dir, ['push', '--quiet', '--', hub.url(slug), `HEAD:refs/heads/${remote.branch}`], hub, { timeout: 300000 })
  if (!p.ok) {
    if (/non-fast-forward|fetch first|\[rejected\]/i.test(p.err)) throw fail(`${slug} has commits this project does not have. Pull them first.`, 409, { pull: true })
    if (/Authentication|could not read Username|denied|403/i.test(p.err)) throw fail(`GitHub would not take the push to ${slug}. ${SIGN_IN.split(': ')[1]}, with a login that may write there`, 424)
    throw fail(`Could not push to ${slug}: ${said(p.err) || 'git stopped'}`, 502)
  }
  return { ...out, sha: local.sha, same: false }
}

// ---------- pull
/** A run just brought in from the whole of a repository continues that repository's history when its files
 * are exactly the repository's (nothing was left out on the way in): its newest commit is fetched alone and the
 * run's history starts from it, so a later push is an ordinary one. → the commit, or null (the run then starts
 * its own history, and cannot be pushed to that repository). Runs nothing of the project. */
export async function joinHistory(dir, slug, hub = GITHUB) {
  const undo = () => { rmSync(join(dir, '.git'), { recursive: true, force: true, maxRetries: 3 }); return null }
  if (existsSync(join(dir, '.git'))) return null
  if (!(await git(dir, ['init', '-q'], hub)).ok) return undo()
  const f = await git(dir, ['fetch', '--quiet', '--depth', '1', '--no-tags', '--no-recurse-submodules', '--', hub.url(slug), 'HEAD'], hub, { timeout: 180000 })
  if (!f.ok) return undo()
  if (!(await git(dir, ['reset', '-q', 'FETCH_HEAD'], hub)).ok) return undo()
  const st = await git(dir, ['status', '--porcelain'], hub)
  if (!st.ok || st.out.trim()) return undo()
  const head = await git(dir, ['rev-parse', 'HEAD'], hub)
  return head.ok ? head.out.trim() : undo()
}

// ---------- what a project remembers: its repository, per piece (the app or the game), in the Studio's data folder
const storeFile = dataDir => join(dataDir, 'github-source.json')
export function sourceLinks(dataDir) {
  try { const all = JSON.parse(readFileSync(storeFile(dataDir), 'utf8')); return all && typeof all === 'object' ? all : {} } catch { return {} }
}
/** remember (or with null, forget) what `key` ("<project>:<piece>") is linked to; fields given are merged in */
export function rememberLink(dataDir, key, link) {
  const all = sourceLinks(dataDir)
  if (link) all[key] = { ...(all[key]?.repo === link.repo ? all[key] : {}), ...link }
  else delete all[key]
  mkdirSync(dataDir, { recursive: true })
  const tmp = `${storeFile(dataDir)}.tmp`
  writeFileSync(tmp, JSON.stringify(all, null, 1))
  renameSync(tmp, storeFile(dataDir))
  return all[key] || null
}
