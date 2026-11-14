// Builds the vendored libraries from npm (docs/specs/34-navigation-state.md): web/vendor/ from one tarball each,
// and the server's engine/vendor/ bundles from a committed lockfile (scripts/vendor/<name>/), every package in it
// checked against its recorded integrity by `npm ci`.
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

// The server's own libraries, bundled for Node (decision 0017, issue #450): execa starts the studio's child processes and
// tree-kill stops each one with all of its children, on every OS. scripts/vendor/procs/ pins every package.
export const NODE_VENDORED = [
  {
    name: 'procs',
    dir: 'scripts/vendor/procs',
    entry: "export { execa } from 'execa'\nexport { default as treeKill } from 'tree-kill'\n",
    exports: ['execa', 'treeKill'],
    out: 'engine/vendor/procs/procs.mjs'
  }
]

const sha = (algo, buf, enc = 'hex') => createHash(algo).update(buf).digest(enc)
const npm = args => process.platform === 'win32'
  ? [process.execPath, [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args]]
  : ['npm', args]

// A bundle for Node: `npm ci` from the committed lockfile (the integrity of every tarball checked), then one ESM
// file. CommonJS packages inside it (cross-spawn, tree-kill) reach Node's built-ins through createRequire.
async function buildNode(lib, outRoot) {
  const tmp = mkdtempSync(join(tmpdir(), 'vendor-node-'))
  try {
    for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(root, lib.dir, f), join(tmp, f))
    execFileSync(...npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error']), { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] })
    writeFileSync(join(tmp, 'entry.mjs'), lib.entry)
    const lock = JSON.parse(readFileSync(join(tmp, 'package-lock.json'), 'utf8'))
    const pkgs = Object.entries(lock.packages).filter(([k]) => k).map(([k, v]) => ({ path: k, name: k.replace(/^.*node_modules\//, ''), version: v.version, license: v.license, integrity: v.integrity }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const top = Object.entries(JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf8')).dependencies).map(([n, v]) => `${n} ${v}`).join(', ')
    const banner = `/* ${top} and their dependencies (licences in LICENSE), built by scripts/vendor.mjs with esbuild ${ESBUILD} */ import { createRequire as __vendorRequire } from 'node:module'; const require = __vendorRequire(import.meta.url);`
    execFileSync(...npx(['--yes', `esbuild@${ESBUILD}`, 'entry.mjs', '--bundle', '--platform=node', '--format=esm', '--target=node18', '--legal-comments=none', `--banner:js=${banner}`, '--outfile=out.mjs', '--log-level=warning']), { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] })
    const out = join(outRoot, lib.out)
    mkdirSync(dirname(out), { recursive: true })
    copyFileSync(join(tmp, 'out.mjs'), out)
    // every package's own licence text, in the lockfile's order
    const licence = pkgs.map(p => {
      const d = join(tmp, p.path), f = ['LICENSE', 'LICENSE.md', 'license', 'license.md', 'LICENSE.txt'].map(n => join(d, n)).find(x => { try { return readFileSync(x) } catch { return false } })
      if (!f) throw new Error(`${p.name}@${p.version}: no licence file`)
      return `${p.name} ${p.version} (${p.license})\n\n${readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim()}\n`
    }).join('\n----------------------------------------\n\n')
    writeFileSync(join(dirname(out), 'LICENSE'), licence)
    const source = { name: lib.name, lockfile: `${lib.dir}/package-lock.json`, esbuild: ESBUILD, exports: lib.exports, file: lib.out.split('/').pop(), packages: pkgs.map(({ name, version, license, integrity }) => ({ name, version, license, integrity })), sha256: sha('sha256', readFileSync(out)) }
    writeFileSync(join(dirname(out), 'SOURCE.json'), JSON.stringify(source, null, 2) + '\n')
    return dirname(lib.out)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

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
  for (const lib of [...VENDORED, ...NODE_VENDORED]) {
    const dir = lib.dir ? await buildNode(lib, outRoot) : await build(lib, outRoot)
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
