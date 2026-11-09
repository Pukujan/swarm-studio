// Publish an exported site. GitHub Pages through the person's own `gh` login:
// one public repo per site, pushed and served at <login>.github.io/<repo>/.
// Vercel and Cloudflare Pages through a token the person connected (connect.mjs).
// Without any of them, the canvas server hosts it on this computer (see /site/ in the server).

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { ownProjects, rememberProject } from './connect.mjs'

// Repos this makes say so in their description; a repo without it is never touched.
const MARK = 'made with Swarm Studio'

function run(cmd, args, { cwd, timeout = 60000, env = {} } = {}) {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 4e6, env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', ...env } }, (err, stdout, stderr) => {
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

// ---------- shared

function files(dir) {
  const out = []
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) out.push({ path: p, rel: relative(dir, p).split('\\').join('/') })
    }
  }
  walk(dir)
  return out
}

// Waits until a URL answers 200: hosts take a few seconds to start serving a new deploy.
async function live(url, ms = 120000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) }).then(r => r.ok).catch(() => false)) return true
    await wait(2500)
  }
  return false
}

async function rest(base, token, path, init = {}) {
  const res = await fetch(base + path, { ...init, headers: { authorization: `Bearer ${token}`, ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}), ...init.headers }, signal: AbortSignal.timeout(init.timeout || 60000) })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

// ---------- Vercel: upload each file by its SHA-1, then one production deployment

export async function publishVercel({ dir, name, creds, dataDir, onStage = () => {} }) {
  const api = (path, init) => rest(creds.base || 'https://api.vercel.com', creds.token, path + (creds.teamId ? `${path.includes('?') ? '&' : '?'}teamId=${creds.teamId}` : ''), init)
  onStage('project')
  const own = ownProjects(dataDir, 'vercel')
  let project = null
  for (const cand of [name, `${name}-swarm`, ...[2, 3, 4].map(n => `${name}-swarm-${n}`)].map(n => n.slice(0, 90))) {
    if (own.includes(cand)) { project = cand; break }
    const r = await api(`/v9/projects/${cand}`)
    if (r.status === 404) { project = cand; break }
    if (!r.ok && r.status !== 200) throw new Error(`Vercel: ${r.body.error?.message || r.status}`)
  }
  if (!project) throw new Error(`every Vercel project name for ${name} is taken`)

  onStage('upload')
  const list = files(dir).map(f => {
    const data = readFileSync(f.path)
    return { file: f.rel, data, sha: createHash('sha1').update(data).digest('hex'), size: data.length }
  })
  for (const f of list) {
    const r = await api('/v2/files', { method: 'POST', body: f.data, headers: { 'content-type': 'application/octet-stream', 'x-vercel-digest': f.sha, 'content-length': String(f.size) } })
    if (!r.ok) throw new Error(`Vercel upload: ${r.body.error?.message || r.status}`)
  }
  const dep = await api('/v13/deployments?skipAutoDetectionConfirmation=1', {
    method: 'POST',
    body: JSON.stringify({ name: project, target: 'production', files: list.map(f => ({ file: f.file, sha: f.sha, size: f.size })), projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: null } }),
  })
  if (!dep.ok) throw new Error(`Vercel: ${dep.body.error?.message || dep.status}`)
  rememberProject(dataDir, 'vercel', project)

  onStage('building')
  let d = dep.body
  const start = Date.now()
  while (!['READY', 'ERROR', 'CANCELED'].includes(d.readyState) && Date.now() - start < 240000) {
    await wait(2500)
    d = (await api(`/v13/deployments/${dep.body.id}`)).body || d
  }
  if (d.readyState !== 'READY') throw new Error(`Vercel deployment ${String(d.readyState || 'timed out').toLowerCase()}`)
  // the production domain is public; the per-deployment URL may sit behind Vercel's login
  const prod = (d.alias || []).filter(a => a.endsWith('.vercel.app')).sort((a, b) => a.length - b.length)[0]
  const url = `https://${prod || d.url}/`
  return { url, repo: `vercel:${project}`, pending: !(await live(url, 60000)) }
}

// ---------- Cloudflare Pages: direct upload, the way wrangler does it, without wrangler.
// Only the project, upload-token and deployment calls carry the account token
// (creds.base can point them at a relay that injects it); the files go up with
// the short-lived upload JWT straight to Cloudflare.

const CF = 'https://api.cloudflare.com/client/v4'
const TYPES = { html: 'text/html', css: 'text/css', js: 'application/javascript', mjs: 'application/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', txt: 'text/plain', woff2: 'font/woff2' }

export async function publishCloudflare({ dir, name, creds, dataDir, onStage = () => {} }) {
  const api = (path, init) => rest(creds.base || CF, creds.token, `/accounts/${creds.accountId}/pages/projects${path}`, init)
  const why = r => r.body.errors?.[0]?.message || r.status
  onStage('project')
  const own = ownProjects(dataDir, 'cloudflare')
  let project = null, sub = null
  for (const cand of [name, `${name}-swarm`, ...[2, 3, 4].map(n => `${name}-swarm-${n}`)].map(n => n.slice(0, 58))) {
    const r = await api(`/${cand}`)
    if (r.ok && own.includes(cand)) { project = cand; sub = r.body.result?.subdomain; break }
    if (r.ok) continue
    const made = await api('', { method: 'POST', body: JSON.stringify({ name: cand, production_branch: 'main' }) })
    if (!made.ok) throw new Error(`Cloudflare: ${why(made)}`)
    project = cand
    sub = made.body.result?.subdomain
    rememberProject(dataDir, 'cloudflare', cand)
    break
  }
  if (!project) throw new Error(`every Cloudflare Pages name for ${name} is taken`)

  onStage('upload')
  const tok = await api(`/${project}/upload-token`)
  const jwt = tok.body.result?.jwt
  if (!jwt) throw new Error(`Cloudflare upload token: ${why(tok)}`)
  const up = (path, body) => rest(CF, jwt, path, { method: 'POST', body: JSON.stringify(body) })
  const list = files(dir).map(f => {
    const value = readFileSync(f.path).toString('base64'), ext = f.rel.split('.').pop().toLowerCase()
    return { rel: f.rel, value, contentType: TYPES[ext] || 'application/octet-stream', hash: createHash('sha256').update(value + ext).digest('hex').slice(0, 32) }
  })
  const hashes = list.map(f => f.hash)
  const miss = await up('/pages/assets/check-missing', { hashes })
  if (!miss.ok) throw new Error(`Cloudflare upload: ${why(miss)}`)
  const todo = list.filter(f => (miss.body.result || hashes).includes(f.hash))
  for (let i = 0; i < todo.length; i += 20) {
    const r = await up('/pages/assets/upload', todo.slice(i, i + 20).map(f => ({ key: f.hash, value: f.value, metadata: { contentType: f.contentType }, base64: true })))
    if (!r.ok) throw new Error(`Cloudflare upload: ${why(r)}`)
  }
  await up('/pages/assets/upsert-hashes', { hashes })
  const form = new FormData()
  form.append('manifest', JSON.stringify(Object.fromEntries(list.map(f => [`/${f.rel}`, f.hash]))))
  form.append('branch', 'main')
  const dep = await api(`/${project}/deployments`, { method: 'POST', body: form })
  if (!dep.ok) throw new Error(`Cloudflare deployment: ${why(dep)}`)

  onStage('building')
  const url = `https://${sub || `${project}.pages.dev`}/`
  return { url, repo: `cloudflare:${project}`, pending: !(await live(url)) }
}
