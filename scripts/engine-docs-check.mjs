// The engine pages (docs/engines/) are what every session reads before it says what an engine can or can't do
// (owner, 2026-11-12: "do we not have anyhting forcing agents or you to read the docs before you guess about a
// dependency"). Two checks:
//
//   node scripts/engine-docs-check.mjs                  every page is sound: a Glue line whose paths exist, and
//                                                       every claim cites its source or says "Unchecked"
//   node scripts/engine-docs-check.mjs --base <sha>     a pull request that changes an engine's glue code also
//                                                       changes that engine's page, or names the page in its
//                                                       description (read from $GITHUB_EVENT_PATH)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(import.meta.dirname, '..')
const DIR = 'docs/engines'
// sections whose bullets are claims about the engine: each one carries its source. A bullet that ends in ":"
// heads a list; a sub-bullet may cite just ":line" in the file its parent named.
const CLAIMS = /^## (What it already does|How Swarm drives it|What the person connects|Limits inside Swarm)/
const CITED = /\((?:[^()]*?)(?:[\w.-]+\/[\w./-]+|[\w-]+\.(?:mjs|js|ts|tsx|md|yaml|yml|json|gd|py|sh))(?::\d+(?:-\d+)?)?[^()]*\)|https?:\/\/\S+|\((same (URL|file)|both URLs above)\)|\([^()]*:\d+[^()]*\)|:\s*$|Unchecked/

export function pages(dir = join(root, DIR)) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').map(f => {
    const text = readFileSync(join(dir, f), 'utf8')
    const glue = (text.match(/^Glue:\s*(.+)$/m)?.[1] || '').split(',').map(s => s.trim().replace(/^`|`$/g, '')).filter(Boolean)
    return { file: `${DIR}/${f}`, text, glue }
  })
}

// what is wrong with one page, as lines a person can act on
export function problems(page, exists = p => existsSync(join(root, p))) {
  const out = []
  if (!page.glue.length) out.push(`${page.file}: no "Glue:" line naming the Swarm code that drives this engine`)
  for (const p of page.glue) if (!exists(p)) out.push(`${page.file}: Glue names ${p}, which does not exist`)
  let inClaims = false, bullet = null
  const flush = () => { if (bullet && !CITED.test(bullet.text)) out.push(`${page.file}:${bullet.line}: a claim with no source (add "(path:line)" or a URL, or start it with "Unchecked:")`) }
  page.text.split('\n').forEach((line, i) => {
    if (/^## /.test(line)) { flush(); bullet = null; inClaims = CLAIMS.test(line); return }
    if (!inClaims) return
    if (/^\s*[-*] /.test(line)) { flush(); bullet = { text: line, line: i + 1 } }
    else if (bullet && line.trim()) bullet.text += ` ${line.trim()}`
    else { flush(); bullet = null }
  })
  flush()
  return out
}

// the pages whose glue a change touched and that the change neither updated nor named
export function unread(changed, all, body = '') {
  return all.filter(pg => pg.glue.some(g => changed.some(c => c === g || c.startsWith(g.endsWith('/') ? g : `${g}/`))))
    .filter(pg => !changed.includes(pg.file) && !body.includes(pg.file))
    .map(pg => pg.file)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const all = pages()
  const i = process.argv.indexOf('--base')
  if (i < 0) {
    const bad = all.flatMap(pg => problems(pg))
    if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
    console.log(`engine pages: ${all.length} sound`)
  } else {
    const changed = execFileSync('git', ['diff', '--name-only', `${process.argv[i + 1]}...HEAD`], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    let body = ''
    try { body = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.body || '' } catch {}
    const miss = unread(changed, all, body)
    if (miss.length) {
      console.error(`This change touches an engine's glue code. Read its page first, then update the page or name it in the PR description ("Read ${miss[0]}"):\n${miss.map(m => `- ${m}`).join('\n')}`)
      process.exit(1)
    }
    console.log('engine glue: every touched engine page was updated or named')
  }
}
