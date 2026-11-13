// The next UI's build, committed where the plugin is installed from (docs/decisions/0018-next-ui-build-on-release.md).
// Main and every pull request leave ui/dist/ untracked; the release the catalog pins carries it, so installing the
// plugin builds nothing and the pinned commit holds the files /next/ serves.
//   node scripts/release-ui.mjs           on a release branch, after main is merged in: build ui/dist/, commit it
//   node scripts/release-ui.mjs --check   fail unless ui/dist/ is committed here and is a fresh build
// CI's macOS job runs it in its own checkout before it installs the plugin through Hermes, so every pull request
// installs exactly what a release would. It refuses to commit on main.
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
// npm is npm.cmd on Windows, which only a shell runs: one fixed command line, no arguments from outside
const npm = script => execSync(`npm run --prefix ui ${script}`, { cwd: root, stdio: 'inherit' })
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

if (process.argv.includes('--check')) {
  if (!git('ls-files', 'ui/dist')) { console.error('ui/dist/ is not committed here: a release carries it (node scripts/release-ui.mjs)'); process.exit(1) }
  npm('check')
} else {
  if (git('rev-parse', '--abbrev-ref', 'HEAD') === 'main') { console.error('ui/dist/ is committed on a release branch, never on main'); process.exit(1) }
  npm('build')
  git('add', '--force', 'ui/dist')
  if (!git('diff', '--cached', '--name-only', '--', 'ui/dist')) { console.log('ui/dist/ is already this commit\'s build'); process.exit(0) }
  git('-c', 'user.name=swarm-release', '-c', 'user.email=swarm-release@users.noreply.github.com', 'commit', '-m', `ui/dist: the next UI's build of ${git('rev-parse', '--short', 'HEAD')}`, '--', 'ui/dist')
  console.log(`committed ui/dist/ (${git('ls-files', 'ui/dist').split('\n').length} files)`)
}
