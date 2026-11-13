// Builds the vendored libraries in web/vendor/ from their npm tarballs (docs/specs/34-navigation-state.md).
//   node scripts/vendor.mjs          rebuild the files and write SOURCE.json
//   node scripts/vendor.mjs --check  rebuild in a temp folder and fail if a byte differs from what is committed
// The dev-tools import xstate marks side-effect free is left out on purpose.
// The tarball must match npm's recorded integrity, and the bundler is pinned, so the same inputs give the same file.
// This runs on a developer's machine or in CI, never on the user's: the plugin only serves the committed files.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESBUILD = '0.28.2'
// npx is npx.cmd on Windows, which Node will not spawn without a shell: run npm's own npx script with this node
const npx = args => process.platform === 'win32'
  ? [process.execPath, [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...args]]
  : ['npx', args]
export const VENDORED = [
  {
    name: 'xstate',
    version: '5.33.3',
    integrity: 'sha512-AnDRjS/GyKHmbA1PyhVCYBqYsA7EGe3KGgeD0ht3NFsXzoz7leX/HQDFX9QlHFJ/ltLHPsgChJYwPzRvB/0b4g==',
    entry: 'dist/xstate.esm.js',
    exports: ['setup', 'createActor', 'assign', 'fromTransition'],
    out: 'web/vendor/xstate/xstate.mjs'
  }
]

const sha = (algo, buf, enc = 'hex') => createHash(algo).update(buf).digest(enc)

async function build(lib, outRoot) {
  const meta = await (await fetch(`https://registry.npmjs.org/${lib.name}/${lib.version}`)).json()
  const tarball = meta.dist.tarball
  if (meta.dist.integrity !== lib.integrity) throw new Error(`${lib.name}@${lib.version}: the registry's integrity is not the pinned one`)
  const tgz = Buffer.from(await (await fetch(tarball)).arrayBuffer())
  const integrity = `sha512-${sha('sha512', tgz, 'base64')}`
  if (integrity !== lib.integrity) throw new Error(`${lib.name}@${lib.version}: the tarball does not match npm's integrity`)
  const tmp = mkdtempSync(join(tmpdir(), 'vendor-'))
  try {
    writeFileSync(join(tmp, 'pkg.tgz'), tgz)
    execFileSync('tar', ['-xzf', 'pkg.tgz'], { cwd: tmp })
    writeFileSync(join(tmp, 'entry.mjs'), `export { ${lib.exports.join(', ')} } from './package/${lib.entry}'\n`)
    const banner = `/* ${lib.name} ${lib.version} (MIT, see LICENSE), built by scripts/vendor.mjs with esbuild ${ESBUILD} */`
    execFileSync(...npx(['--yes', `esbuild@${ESBUILD}`, 'entry.mjs', '--bundle', '--format=esm', '--minify', '--legal-comments=none', '--target=es2022', `--banner:js=${banner}`, '--outfile=out.mjs', '--log-level=warning', '--log-override:ignored-bare-import=silent']), { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] })
    const out = join(outRoot, lib.out)
    mkdirSync(dirname(out), { recursive: true })
    copyFileSync(join(tmp, 'out.mjs'), out)
    copyFileSync(join(tmp, 'package', 'LICENSE'), join(dirname(out), 'LICENSE'))
    const source = { name: lib.name, version: lib.version, license: meta.license, tarball, integrity, esbuild: ESBUILD, exports: lib.exports, file: lib.out.split('/').pop(), sha256: sha('sha256', readFileSync(out)) }
    writeFileSync(join(dirname(out), 'SOURCE.json'), JSON.stringify(source, null, 2) + '\n')
    return dirname(lib.out)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const outRoot = check ? mkdtempSync(join(tmpdir(), 'vendor-check-')) : root
  let bad = 0
  for (const lib of VENDORED) {
    const dir = await build(lib, outRoot)
    if (check) for (const f of ['LICENSE', 'SOURCE.json', lib.out.split('/').pop()]) {
      const same = readFileSync(join(outRoot, dir, f)).equals(readFileSync(join(root, dir, f)))
      console.log(`${same ? 'same' : 'DIFFERS'}  ${dir}/${f}`)
      if (!same) bad++
    }
    else console.log(`wrote ${dir}`)
  }
  if (check) rmSync(outRoot, { recursive: true, force: true })
  process.exit(bad ? 1 : 0)
}
