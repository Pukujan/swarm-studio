// Fails if the committed ui/dist/ is not what the source builds (CI: tools/dev, `npm run ui:check`), the way
// tokens:check and scripts/vendor.mjs --check guard their generated files. It builds into a temporary folder and
// compares every file, line endings aside.
//   npm run --prefix ui check
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const committed = join(here, 'dist')
const fresh = mkdtempSync(join(tmpdir(), 'swarm-ui-'))
const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => join(e.parentPath, e.name).slice(dir.length + 1).replace(/\\/g, '/')).sort()
const text = (dir, f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')

try {
  await build({ root: here, logLevel: 'error', build: { outDir: fresh, emptyOutDir: true } })
  const want = files(fresh), have = files(committed)
  const stale = [...new Set([...want, ...have])].filter(f => !want.includes(f) || !have.includes(f) || text(fresh, f) !== text(committed, f))
  if (stale.length) {
    console.error(`ui/dist is not a fresh build of ui/ (${stale.join(', ')}): run npm run --prefix ui build and commit it`)
    process.exitCode = 1
  } else console.log(`ui/dist matches ui/ (${want.length} files)`)
} finally {
  rmSync(fresh, { recursive: true, force: true })
}
