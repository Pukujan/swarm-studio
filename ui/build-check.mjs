// The next UI's build check (CI: tools/dev, `npm run ui:check`; docs/decisions/0018-next-ui-build-on-release.md).
//   On a branch, where ui/dist/ is not tracked: it builds ui/dist/ and checks it is what /next/ can serve, one
//   document with nothing left to load (server/next.mjs).
//   On a release branch, which carries ui/dist/: it builds into a temporary folder and fails if a committed file
//   differs from the fresh build (line endings aside), the way tokens:check and scripts/vendor.mjs --check do.
//   npm run --prefix ui check
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { nextPage } from '../server/next.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const dist = join(here, 'dist')
const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => join(e.parentPath, e.name).slice(dir.length + 1).replace(/\\/g, '/')).sort()
const text = (dir, f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')
const tracked = execFileSync('git', ['ls-files', 'dist'], { cwd: here, encoding: 'utf8' }).trim() !== ''

if (!tracked) {
  await build({ root: here, logLevel: 'error' })
  const page = existsSync(join(dist, 'index.html')) && nextPage(dist, { token: 'check' })
  if (!page || !page.includes('<div id="root">')) {
    console.error('ui/dist does not make the /next/ page')
    process.exitCode = 1
  } else console.log(`ui/dist built (${files(dist).length} files), one document for /next/`)
} else {
  const fresh = mkdtempSync(join(tmpdir(), 'swarm-ui-'))
  try {
    await build({ root: here, logLevel: 'error', build: { outDir: fresh, emptyOutDir: true } })
    const want = files(fresh), have = files(dist)
    const stale = [...new Set([...want, ...have])].filter(f => !want.includes(f) || !have.includes(f) || text(fresh, f) !== text(dist, f))
    if (stale.length) {
      console.error(`the release's ui/dist is not a fresh build of ui/ (${stale.join(', ')}): run node scripts/release-ui.mjs`)
      process.exitCode = 1
    } else console.log(`the release's ui/dist matches ui/ (${want.length} files)`)
  } finally {
    rmSync(fresh, { recursive: true, force: true })
  }
}
