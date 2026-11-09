// Publish an exported site. GitHub Pages through the person's own `gh` login:
// one public repo per site, pushed and served at <login>.github.io/<repo>/.
// Without gh, the canvas server hosts it on this computer (see /site/ in the server).

import { execFile } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Repos this makes say so in their description; a repo without it is never touched.
const MARK = 'made with Swarm Studio'

function run(cmd, args, { cwd, timeout = 60000 } = {}) {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 4e6, env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) {
        const why = String(stderr || err.message).trim().split('\n').filter(Boolean).pop() || 'failed'
        return fail(Object.assign(new Error(`${cmd} ${args[0]}: ${why}`), { stderr: String(stderr || '') }))
      }
      ok(String(stdout).trim())
    })
  })
}

const gh = (args, o) => run('gh', args, o)
const wait = ms => new Promise(ok => setTimeout(ok, ms))

// Who is signed in to gh, if anyone. Cached briefly: the canvas asks when it opens the menu.
let seen = null
export async function githubLogin() {
  if (seen && Date.now() - seen.t < 60000) return seen.login
  let login = null
  try { login = await gh(['api', 'user', '--jq', '.login'], { timeout: 15000 }) || null } catch {}
  seen = { t: Date.now(), login }
  return login
}

// The repo for this site: its own name if free or already ours, otherwise a variant.
async function pickRepo(login, name) {
  for (const cand of [name, `${name}-site`, ...[2, 3, 4, 5].map(n => `${name}-${n}`)]) {
    try {
      const desc = await gh(['api', `repos/${login}/${cand}`, '--jq', '.description // ""'], { timeout: 15000 })
      if (desc.includes(MARK)) return { repo: cand, fresh: false }
    } catch (err) {
      if (/404|Not Found/i.test(err.message + err.stderr)) return { repo: cand, fresh: true }
      throw err
    }
  }
  throw new Error(`every repo name for ${name} is taken`)
}

export async function publishGitHub({ dir, name, title, onStage = () => {} }) {
  const login = await githubLogin()
  if (!login) throw new Error('GitHub CLI is not signed in (run `gh auth login`), so the site is hosted on this computer only')
  onStage('repo')
  const { repo, fresh } = await pickRepo(login, name)
  const full = `${login}/${repo}`
  if (fresh) await gh(['repo', 'create', full, '--public', '--description', `${title} · ${MARK}`.slice(0, 340)])

  onStage('push')
  const pushed = Date.now()
  const work = mkdtempSync(join(tmpdir(), 'swarm-publish-'))
  try {
    cpSync(dir, work, { recursive: true })
    writeFileSync(join(work, '.nojekyll'), '')
    const git = args => run('git', ['-c', `user.name=${login}`, '-c', `user.email=${login}@users.noreply.github.com`, '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', ...args], { cwd: work, timeout: 120000 })
    await git(['init', '-q', '-b', 'main'])
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', `Publish ${title} from Swarm Studio`])
    // the repo holds only the published site, so each publish replaces it
    await git(['push', '-q', '-f', `https://github.com/${full}.git`, 'main'])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  onStage('pages')
  try {
    await gh(['api', '-X', 'POST', `repos/${full}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/'])
  } catch (err) {
    if (!/409|already/i.test(err.message + err.stderr)) throw err
  }
  const url = (await gh(['api', `repos/${full}/pages`, '--jq', '.html_url'])).replace(/\/?$/, '/')
  if (fresh) gh(['repo', 'edit', full, '--homepage', url]).catch(() => {})

  // GitHub builds the site, then its CDN starts answering: wait for both
  onStage('building')
  const start = Date.now()
  let status = ''
  while (Date.now() - start < 240000) {
    // a re-publish: the latest build until GitHub starts a new one is the old site
    const [st, at] = (await gh(['api', `repos/${full}/pages/builds/latest`, '--jq', '[.status, .created_at] | join(" ")'], { timeout: 15000 }).catch(() => '')).split(' ')
    status = Date.parse(at) >= pushed - 10000 ? st : ''
    if (status === 'errored') throw new Error(`GitHub Pages could not build ${full}`)
    if (status === 'built') {
      const live = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) }).then(r => r.ok).catch(() => false)
      if (live) return { url, repo: full, fresh }
    }
    await wait(3000)
  }
  // slow, not broken: the link will work shortly
  return { url, repo: full, fresh, pending: true }
}
