// Packages a feature needs on first use, installed into the data folder from a lockfile committed beside the code
// (engine/imagetools, engine/videotools, engine/voicetools): `npm ci --ignore-scripts`, so every package is the
// pinned one, checked against the lockfile's integrity, and no package's install script runs. `npm` is Node's own,
// beside the binary that runs the studio, run by that Node: no shell, the same on Windows, macOS and Linux.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFile } from './proc.mjs'

// npm's own entry, beside the Node that runs the studio (Windows keeps it next to node.exe, macOS and Linux
// under lib/)
export const npmCli = (exe = process.execPath) => [join(dirname(exe), 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(dirname(exe), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find(f => existsSync(f))

export const NPM_CI = ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev']

// lockDir's package.json and package-lock.json, installed into dir. run(file, args, opts) is execFile's shape
// (replaceable in tests).
export function npmCi(lockDir, dir, { timeout = 300000, run = execFile } = {}) {
  mkdirSync(dir, { recursive: true })
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(lockDir, f), join(dir, f))
  return new Promise((ok, fail) => {
    const cli = npmCli()
    const done = err => (err ? fail(err) : ok())
    if (cli) run(process.execPath, [cli, ...NPM_CI], { cwd: dir, timeout, maxBuffer: 1 << 24 }, done)
    else run('npm', NPM_CI, { cwd: dir, timeout, maxBuffer: 1 << 24, shell: process.platform === 'win32' }, done)
  })
}
