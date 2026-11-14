// Bring a game or app in (docs/specs/45-intake.md): a project made outside the Studio becomes a run the
// Studio can open. This file is the parts with no server in them: reading the request (a GitHub repo or a
// folder on this computer), fetching a repo with the person's own git and gh, copying the files into the run
// with its limits, and saying what was brought in. Nothing from the project is run here: no install, no script.
// (The Make box's showcases and questions are engine/intake.mjs, an older name; this is the door for outside work.)
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from './proc.mjs'

// the limits on one project, said in the refusal
export const CAPS = { bytes: 200 * 1024 * 1024, files: 20000 }
// never copied: packages, git, build output, caches, and files that hold keys
export const SKIP = /^(node_modules|\.git|dist|build|out|\.output|\.nitro|\.next|\.vite|\.vercel|\.dyad|\.turbo|\.cache|\.parcel-cache|\.godot|\.import|\.DS_Store|Thumbs\.db|\.swarm-built\.json|\.env|\.env\..+|\.npmrc)$/
const KEPT = /^\.env\.(example|sample|template)$/
export const skipped = name => SKIP.test(name) && !KEPT.test(name)

export const KINDS = ['game', 'app']
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

// "owner/name" or an https GitHub address of a repository, nothing else: no other host, no ssh, no file path,
// no name and password, no port, nothing that git could read as an option.
// → { owner, name, slug: 'owner/name', url: 'https://github.com/owner/name.git' }
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/
export function parseRepo(given) {
  const s = String(given ?? '').trim()
  if (!s || s.length > 200 || /[\s\\\0]/.test(s)) throw fail('Name a GitHub repository: owner/name')
  let owner, name
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    let u
    try { u = new URL(s) } catch { throw fail('That is not an address') }
    if (u.protocol !== 'https:' || !/^(www\.)?github\.com$/i.test(u.hostname) || u.username || u.password || u.port || u.search || u.hash) throw fail('Only https://github.com/owner/name works for now')
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length !== 2) throw fail('Give the repository itself (https://github.com/owner/name) and put the folder in Subfolder')
    ;[owner, name] = parts
  } else {
    const parts = s.split('/')
    if (parts.length !== 2) throw fail('Name a GitHub repository: owner/name')
    ;[owner, name] = parts
  }
  name = name.replace(/\.git$/i, '')
  if (!OWNER.test(owner) || !REPO.test(name) || name === '.' || name === '..' || name.startsWith('-')) throw fail('Name a GitHub repository: owner/name')
  return { owner, name, slug: `${owner}/${name}`, url: `https://github.com/${owner}/${name}.git` }
}

// The folder inside the repo or the folder given: '' (all of it) or a path that stays inside.
export function cleanSub(given) {
  const s = String(given ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!s) return ''
  if (s.length > 300 || /[\0-\x1f]/.test(s)) throw fail('That subfolder will not work')
  const parts = s.split('/').filter(Boolean)
  if (parts.some(p => p === '..' || p === '.' || p.startsWith('-') || p === '.git')) throw fail('The subfolder has to stay inside the project')
  return parts.join('/')
}

const inside = (root, p) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep)

// A folder on this computer: an absolute path to a real folder inside the person's home folder (never the
// home folder itself), and not one of the Studio's own (`deny`: its runs and data).
// → the folder's real path (links followed)
export function checkFolder(given, { home, deny = [] } = {}) {
  const s = String(given ?? '').trim()
  if (!s || s.length > 1000 || s.includes('\0') || !isAbsolute(s)) throw fail('Give the whole path of the folder, from the top')
  let real, base
  try { real = realpathSync(resolve(s)) } catch { throw fail('No such folder') }
  try { base = realpathSync(home) } catch { throw fail('No home folder to look in') }
  if (!statSync(real).isDirectory()) throw fail('That is a file: give its folder')
  if (!inside(base, real) || real === base) throw fail('Only a folder inside your home folder can be brought in')
  for (const d of deny) {
    let r = null
    try { r = realpathSync(d) } catch {}
    if (r && inside(r, real)) throw fail('That folder is the Studio\'s own')
  }
  return real
}

// The folder that is brought in: `sub` inside `root`, which it may not leave (a link out is refused).
export function subFolder(root, sub) {
  const base = realpathSync(root)
  let real
  try { real = realpathSync(join(base, sub)) } catch { throw fail(`No folder ${sub} in there`) }
  if (!inside(base, real)) throw fail('The subfolder has to stay inside the project')
  if (!statSync(real).isDirectory()) throw fail(`${sub} is a file: give its folder`)
  return real
}

// What a folder holds, without reading a file: every file that would be copied (name by name, SKIP left out),
// links that are not followed, and the refusal when it is over a limit.
// → { files: [{ rel, size }], bytes, left: files and folders skipped by name, links: links not followed }
export function measure(dir, caps = CAPS) {
  const root = realpathSync(dir)
  const files = []
  let bytes = 0, left = 0, links = 0
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      if (skipped(n)) { left++; continue }
      const f = join(d, n)
      let st
      try { st = lstatSync(f) } catch { continue }
      // a link is followed only to a file inside the folder; one that leaves it, or names a folder, is not copied
      if (st.isSymbolicLink()) {
        let to = null
        try { to = realpathSync(f) } catch {}
        if (!to || !inside(root, to) || !statSync(to).isFile()) { links++; continue }
        st = statSync(to)
      }
      if (st.isDirectory()) { walk(f, `${rel}${n}/`); continue }
      if (!st.isFile()) continue
      files.push({ rel: `${rel}${n}`, size: st.size })
      bytes += st.size
      if (files.length > caps.files) throw fail(`More than ${caps.files.toLocaleString('en-US')} files: bring in a smaller folder`, 413)
      if (bytes > caps.bytes) throw fail(`More than ${Math.round(caps.bytes / 1048576)} MB: bring in a smaller folder`, 413)
    }
  }
  walk(root, '')
  return { files, bytes, left, links }
}

// Copy what measure() listed into `dest` (made new). Files only, as plain files: a link's file is copied, never the link.
export async function copyIn(dir, dest, list, { signal, onFile = () => {} } = {}) {
  const root = realpathSync(dir)
  mkdirSync(dest, { recursive: true })
  const made = new Set()
  let n = 0
  for (const f of list) {
    if (signal?.aborted) throw fail('stopped')
    const to = join(dest, f.rel)
    const d = dirname(to)
    if (!made.has(d)) { mkdirSync(d, { recursive: true }); made.add(d) }
    await copyFile(realpathSync(join(root, f.rel)), to)
    if (++n % 200 === 0) onFile(n)
  }
  return n
}

// What kind of project a folder is, from its files alone:
//   vite    a package.json that depends on vite: the Studio builds and serves it the way it does its own apps
//   static  files a browser opens as they are; `page` is the folder of its index.html ('' or 'web/')
// A Godot project with no page of its own, and a project built by another tool, are not taken yet.
const PAGE_FIRST = ['web', 'public', 'www', 'site', 'docs', 'game', 'client', 'app', 'src', 'html', 'html5']
export function shapeOf(dir) {
  let pkg = null
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) } catch {}
  const godot = existsSync(join(dir, 'project.godot'))
  if (pkg && typeof pkg === 'object') {
    if (pkg.dependencies?.vite || pkg.devDependencies?.vite) return { shape: 'vite', page: '', godot }
    if (typeof pkg.scripts?.build === 'string' && pkg.scripts.build.trim()) throw fail('This project is built by a tool the Studio does not run yet. Static files or a Vite project work for now.', 422)
  }
  if (existsSync(join(dir, 'index.html'))) return { shape: 'static', page: '', godot }
  // no page at the top: the nearest one below, a web/ or public/ folder first
  const found = []
  const walk = (d, rel, depth) => {
    let names = []
    try { names = readdirSync(d).sort() } catch { return }
    for (const n of names) {
      if (skipped(n) || n.startsWith('.')) continue
      const f = join(d, n)
      let st
      try { st = lstatSync(f) } catch { continue }
      if (!st.isDirectory()) continue
      if (existsSync(join(f, 'index.html'))) found.push({ page: `${rel}${n}/`, depth, first: PAGE_FIRST.indexOf(n.toLowerCase()) })
      else if (depth < 3) walk(f, `${rel}${n}/`, depth + 1)
    }
  }
  walk(dir, '', 1)
  found.sort((a, b) => a.depth - b.depth || (a.first < 0 ? 99 : a.first) - (b.first < 0 ? 99 : b.first) || a.page.localeCompare(b.page))
  if (found.length) return { shape: 'static', page: found[0].page, godot }
  if (godot) throw fail('A Godot project with no web page of its own is not taken yet. Bring in its web export or its browser version.', 422)
  throw fail('No index.html and no Vite project in that folder', 422)
}

// Does the page load files from the folder above what was brought ("../assets/hero.webp" from a page at the
// top)? Read from the page's own html, js and css (the first 4 MB). → the name of that folder above when it
// is really there (`from` is the folder as it was before the copy), else null
export function reachesUp(from, page = '') {
  if (page) return null
  let read = 0
  try {
    for (const n of readdirSync(from)) {
      if (!/\.(html?|m?js|css)$/i.test(n)) continue
      const f = join(from, n), st = statSync(f)
      if (!st.isFile() || st.size > 2e6 || (read += st.size) > 4e6) continue
      for (const m of readFileSync(f, 'utf8').matchAll(/["'`(]\.\.\/([\w$@-][\w$@.-]*)\//g)) if (existsSync(join(dirname(from), m[1])) && statSync(join(dirname(from), m[1])).isDirectory()) return m[1]
    }
  } catch {}
  return null
}
// the refusal for it: the page would open with its pictures and sounds missing
export function checkReach(from, page, top) {
  const up = dirname(from)
  const name = from !== top && inside(top, up) ? reachesUp(from, page) : null
  if (name) throw fail(`Its page loads ../${name}/ from the folder above. Bring in that folder (${basename(up)}) instead: its page is found inside.`, 422)
}

// The Swarm's own plan (the Plan board's format: kind, cards, a name or an idea) in the folder or beside it.
// → its text, or null. It is kept with the run; the Plan board does not read it yet.
export function planBeside(dir, { above = true } = {}) {
  for (const f of [join(dir, 'plan.json'), ...(above ? [join(dirname(dir), 'plan.json')] : [])]) {
    try {
      const st = lstatSync(f)
      if (!st.isFile() || st.size > 2e6) continue
      const text = readFileSync(f, 'utf8'), p = JSON.parse(text)
      if (p && typeof p === 'object' && typeof p.kind === 'string' && p.cards && typeof p.cards === 'object' && (typeof p.name === 'string' || typeof p.idea === 'string')) return text
    } catch {}
  }
  return null
}

// The name it goes by when none is given: the folder's own, or the one above a folder named for its job (web, src).
const JOB = /^(web|www|src|app|dist|build|public|client|game|site|html|html5|export|main|master)$/i
export function nameOf({ name = '', repo = null, sub = '', folder = '' } = {}) {
  const given = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 48)
  if (given) return given
  const parts = [...(repo ? [repo.name] : String(folder).split(/[\\/]/).filter(Boolean).slice(-3)), ...String(sub).split('/').filter(Boolean)]
  const pick = parts.findLast(p => !JOB.test(p)) || parts.at(-1) || 'Project'
  const words = pick.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48)
  // a short name in small letters is a brand said loud ("ares" → "ARES"); longer ones get a capital each word
  return /^[a-z0-9]{2,5}$/.test(words) ? words.toUpperCase() : words.replace(/\b[a-z]/g, c => c.toUpperCase())
}

// Read the request. → { kind, name, sub, repo | null, folder | null, project | null }; throws what is wrong, in words.
export function readAsk(input = {}, { home, deny = [] } = {}) {
  const kind = KINDS.includes(input.kind) ? input.kind : null
  if (!kind) throw fail('Game or App?')
  const hasRepo = typeof input.repo === 'string' && input.repo.trim(), hasFolder = typeof input.folder === 'string' && input.folder.trim()
  if (!hasRepo === !hasFolder) throw fail(hasRepo ? 'A repository or a folder, not both' : 'Name a GitHub repository (owner/name) or a folder')
  const sub = cleanSub(input.path)
  const repo = hasRepo ? parseRepo(input.repo) : null
  // ~ is the person's home folder, as in a terminal
  const folder = hasFolder ? checkFolder(String(input.folder).trim().replace(/^~(?=$|[\\/])/, home || '~'), { home, deny }) : null
  const project = typeof input.project === 'string' && /^[\w-]{1,64}$/.test(input.project.trim()) ? input.project.trim() : null
  return { kind, sub, repo, folder, project, name: nameOf({ name: input.name, repo, sub, folder: folder || '' }) }
}

// The first lines of a run that was brought in, and its last ones. The App and Game rooms read:
//   run:start   kind and title (the card, the board); `intake: true` marks it as not built here; no crew
//               designed it, so `agents` is empty (the canvas reads the list)
//   intake:start where it is coming from, so a failed try can be made again
//   intake      what came in: the source (repo, path, commit or folder), its shape, its page, the counts
// The app:start / app:done (or app:failed) around the copy are written by the app jobs (engine/appjob.mjs bring).
export function startEvents({ id, t = Date.now(), kind, name, source, from = null }) {
  const where = source.repo ? `github.com/${source.repo}${source.path ? `/${source.path}` : ''}` : `${basename(source.folder || '')}${source.path ? `/${source.path}` : ''}`
  return [
    { type: 'run:start', t, run: id, brief: `${name}: brought in from ${where}`, kind, title: name, intake: true, agents: [], ...(from ? { from } : {}) },
    { type: 'intake:start', t, run: id, source }
  ]
}
export function doneEvent({ id, t = Date.now(), source, shape, page, files, bytes, left, links, godot, plan }) {
  return { type: 'intake', t, run: id, source, shape, page, files, bytes, left, links, ...(godot ? { godot: true } : {}), ...(plan ? { plan: true } : {}) }
}
// what a run's log says about being brought in: null for a run the Studio built
export function intakeOf(events = []) {
  const start = events.find(e => e.type === 'intake:start')
  if (!start) return null
  const done = events.findLast(e => e.type === 'intake')
  // the person's own press to install and build a Vite project (never done for them)
  const ran = events.some(e => e.type === 'intake:run')
  return { source: done?.source || start.source, done: !!done, shape: done?.shape || null, page: done?.page || '', ran, fixed: done ? done.shape === 'static' : true }
}

// What a folder's own git says about where it is from, read from its files (git is not run in a folder from
// outside): the commit it is on and its GitHub origin, looking up from `dir` no higher than `top`.
// → { sha, repo: 'owner/name' | null } or null when it is not in a git repository
export function gitFacts(dir, top = dir) {
  for (let d = dir; ; d = dirname(d)) {
    const g = join(d, '.git')
    try {
      if (lstatSync(g).isDirectory()) {
        const head = readFileSync(join(g, 'HEAD'), 'utf8').trim()
        const ref = head.match(/^ref: (refs\/[\w./-]+)$/)?.[1]
        let sha = ref ? null : head
        if (ref) {
          try { sha = readFileSync(join(g, ref), 'utf8').trim() } catch {}
          if (!sha) try { sha = readFileSync(join(g, 'packed-refs'), 'utf8').split('\n').find(l => l.endsWith(` ${ref}`))?.split(' ')[0] || null } catch {}
        }
        let repo = null
        try {
          const url = readFileSync(join(g, 'config'), 'utf8').match(/\[remote "origin"\][^[]*?\n\s*url\s*=\s*(\S+)/)?.[1] || ''
          const m = url.match(/^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)
          if (m) repo = parseRepo(m[1]).slug
        } catch {}
        return { sha: /^[0-9a-f]{40,64}$/.test(sha || '') ? sha : null, repo }
      }
    } catch {}
    if (d === top || dirname(d) === d || !inside(top, dirname(d))) return null
  }
}

// ---------- a repository, fetched with the person's own git (and their gh login for a private one)
const run = (cmd, args, opts = {}) => new Promise(ok => {
  const p = execFile(cmd, args, { timeout: 180000, maxBuffer: 4e6, windowsHide: true, ...opts, env: { GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1', GIT_ASKPASS: '', GCM_INTERACTIVE: 'never', ...(opts.env || {}) } }, (err, stdout, stderr) => ok({ ok: !err, out: String(stdout || ''), err: String(stderr || err?.message || '') }))
  opts.signal?.addEventListener('abort', () => p.kill('SIGTERM'), { once: true })
})
// git's own words, without the address's query or any name and password
const gitSaid = text => String(text || '').split('\n').map(l => l.trim()).filter(l => l && !/^(Cloning into|remote: (Enumerating|Counting|Compressing|Total))/.test(l)).slice(-2).join(' ').replace(/https:\/\/[^@\s/]+@/g, 'https://').slice(0, 240)

// Clone `repo` (from parseRepo) into a new temp folder: the newest commit only, no tags, no submodules, and
// with `sub` only that folder's files (a sparse checkout; all of it when git is too old for one).
// The person's gh login answers for a private repository; nothing is ever asked on a terminal.
// → { dir, sha, clean() }
export async function fetchRepo(repo, sub = '', { signal, tmp = tmpdir(), exec = run } = {}) {
  const dir = mkdtempSync(join(tmp, 'swarm-intake-'))
  const clean = () => rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  // the person's gh login, when gh is there (a public repository needs neither)
  const auth = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', '-c', 'protocol.file.allow=never', '-c', 'core.symlinks=false']
  const base = ['clone', '--quiet', '--depth', '1', '--single-branch', '--no-tags', '--no-recurse-submodules']
  try {
    let r = sub
      ? await exec('git', [...auth, ...base, '--filter=blob:none', '--sparse', '--', repo.url, dir], { signal })
      : await exec('git', [...auth, ...base, '--', repo.url, dir], { signal })
    if (r.ok && sub) {
      const s = await exec('git', ['-C', dir, 'sparse-checkout', 'set', '--cone', sub], { signal })
      if (!s.ok) r = { ok: false, err: s.err }
    }
    if (!r.ok && sub && !signal?.aborted && !/not found|Authentication|could not read|denied|403|404/i.test(r.err)) {
      // an old git with no sparse checkout: everything, once
      rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
      r = await exec('git', [...auth, ...base, '--', repo.url, dir], { signal })
    }
    if (signal?.aborted) throw fail('stopped')
    if (!r.ok) {
      const said = gitSaid(r.err)
      if (/ENOENT/.test(r.err)) throw fail('git is not installed on this computer', 424)
      if (/not found|Authentication|could not read Username|denied|403|404/i.test(r.err)) throw fail(`GitHub would not give ${repo.slug}. If it is private, sign in first: gh auth login`, 424)
      throw fail(`Could not fetch ${repo.slug}: ${said || 'git stopped'}`, 502)
    }
    const head = await exec('git', ['-C', dir, 'rev-parse', 'HEAD'], { signal })
    return { dir, sha: head.ok ? head.out.trim().slice(0, 40) : null, clean }
  } catch (err) { clean(); throw err }
}

// Bring the folder in: measure it, copy it into the run's app/, keep a plan found beside it, and say what came.
// `root` is what the person named (a clone or their folder); `sub` the folder inside it. Runs nothing.
// → the fields of the `intake` event, less the source
export async function bringFolder({ root, sub = '', runDir, caps = CAPS, signal, step = () => {}, top = root }) {
  const from = sub ? subFolder(root, sub) : realpathSync(root)
  const { shape, page, godot } = shapeOf(from)
  if (shape === 'static') checkReach(from, page, realpathSync(top))
  step({ kind: 'setup', text: 'counting the files' })
  const m = measure(from, caps)
  if (!m.files.length) throw fail('Nothing to bring in from that folder', 422)
  step({ kind: 'setup', text: `copying ${m.files.length} files` })
  const app = join(runDir, 'app')
  rmSync(app, { recursive: true, force: true })
  await copyIn(from, app, m.files, { signal, onFile: n => step({ kind: 'setup', text: `copied ${n} of ${m.files.length} files` }) })
  // a plan beside the folder (games/ares/plan.json for games/ares/web): looked for one folder up, never above `top`
  // (the clone, or the person's home folder)
  const plan = planBeside(from, { above: from !== realpathSync(top) && inside(realpathSync(top), dirname(from)) })
  if (plan) writeFileSync(join(runDir, 'plan.json'), plan)
  return { shape, page, files: m.files.length, bytes: m.bytes, left: m.left, links: m.links, godot, plan: !!plan }
}
