// The macOS checks CI's `checks-macos` job runs after installing the plugin through Hermes (issue #405).
// Each one is something only a Mac shows: what `hermes plugins install` copied, the darwin ffmpeg and
// ffprobe the film renderer installs and checks, and Godot found as an app.
//
//   node scripts/macos-check.mjs tree <installed plugin dir>   the copy a person gets: no build left to do
//   node scripts/macos-check.mjs ffmpeg                         the pinned darwin binaries match their SHA-256
//   node scripts/macos-check.mjs godot                          Godot.app is found with a Dock app's PATH
//
// Exits 1 on the first failure, with what failed.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { FF_PACKAGES, FF_SHA256, ffBinary, checkFf, videoTools } from '../engine/video.mjs'
import { godotBin } from '../engine/port.mjs'

const [what, arg] = process.argv.slice(2)
const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }
const ok = msg => console.log(`✓ ${msg}`)
// the PATH an app opened from the Dock gets: no Homebrew, no nvm
const DOCK_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'

function tree(dir) {
  if (!dir || !existsSync(join(dir, 'plugin.yaml'))) fail(`no installed plugin at ${dir}`)
  // the plugin installs nothing: no package.json at its root, and no node_modules anywhere a build would make
  for (const f of ['package.json', 'node_modules']) if (existsSync(join(dir, f))) fail(`the installed copy has ${f} at its root`)
  // what is served is already built: the next UI's static build, the vendored libraries, the fonts
  for (const f of ['ui/dist/index.html', 'web/vendor/xstate/xstate.mjs', 'web/fonts', 'server/server.mjs', 'launcher.py', '__init__.py']) if (!existsSync(join(dir, f))) fail(`the installed copy is missing ${f}`)
  const links = []
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); const s = lstatSync(p); if (s.isSymbolicLink()) links.push(relative(dir, p)); else if (s.isDirectory() && n !== '.git') walk(p) } }
  walk(dir)
  if (links.length) fail(`symlinks in the installed copy: ${links.slice(0, 5).join(', ')}`)
  ok(`installed copy at ${dir}: built UI present, nothing to install, no symlinks`)
}

async function ffmpeg() {
  const plat = `${process.platform}-${process.arch}`
  if (!FF_SHA256[plat]) fail(`no recorded ffmpeg for ${plat}`)
  // the renderer's own set-up, as on a Mac with no ffmpeg on PATH: pinned packages, checked, linked
  const data = mkdtempSync(join(tmpdir(), 'swarm-video-'))
  const path = process.env.PATH
  // node's own folder stays: the launcher starts the server only with node on PATH, and npm runs through it
  process.env.PATH = `${dirname(process.execPath)}:${DOCK_PATH}`
  const t = await videoTools(data, s => console.log(`  ${s}`)).finally(() => { process.env.PATH = path })
  const v = execFileSync(t.ffmpeg, ['-version']).toString().split('\n')[0]
  ok(`${plat}: ffmpeg and ffprobe installed from ${FF_PACKAGES.ffmpeg} / ${FF_PACKAGES.ffprobe}, checked and run (${v})`)
  // the other Mac: its packages, fetched for that cpu, checked against the same table
  const other = process.arch === 'arm64' ? 'x64' : 'arm64'
  const dir = mkdtempSync(join(tmpdir(), 'swarm-ff-'))
  writeFileSync(join(dir, 'package.json'), '{"private":true}\n')
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--save-exact', '--os=darwin', `--cpu=${other}`, FF_PACKAGES.ffmpeg, FF_PACKAGES.ffprobe], { cwd: dir, stdio: 'inherit' })
  for (const name of ['ffmpeg', 'ffprobe']) checkFf(ffBinary(dir, name, `darwin-${other}`), name, `darwin-${other}`)
  ok(`darwin-${other}: ffmpeg and ffprobe match their recorded SHA-256`)
}

function godot() {
  const bin = godotBin({ PATH: DOCK_PATH, HOME: process.env.HOME })
  if (!bin) fail('Godot.app is installed but not found with a Dock app\'s PATH')
  const v = execFileSync(bin, ['--headless', '--version']).toString().trim().split('\n').pop()
  ok(`Godot found as ${bin} (${v})`)
}

if (what === 'tree') tree(arg)
else if (what === 'ffmpeg') await ffmpeg()
else if (what === 'godot') godot()
else fail('usage: node scripts/macos-check.mjs tree <dir> | ffmpeg | godot')
