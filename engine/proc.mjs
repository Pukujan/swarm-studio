// Every child process the studio starts goes through here, with a minimal environment: PATH, HOME,
// TMPDIR, LANG (and the system folders Windows needs), plus only what that one child is given by name.
// The server's own environment holds keys (Hermes hands it the optional ones from plugin.yaml); none of
// them reaches git, gh, pnpm, ffmpeg, Python, a browser or a generated app unless its call names it.
//
// Engine and server code import spawn / execFile / execFileSync from this module, never from
// node:child_process (tests/childenv.test.mjs checks that).

import * as cp from 'node:child_process'
import { execa, treeKill } from './vendor/procs/procs.mjs'

const BASE = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'USER', 'LOGNAME']
// Node, npm, pnpm and Python break on Windows without these (sockets, crypto, temp folders, .cmd shims).
const WINDOWS = ['Path', 'SYSTEMROOT', 'SystemRoot', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'ProgramFiles', 'ProgramFiles(x86)', 'PROGRAMDATA', 'ProgramData',
  'HOMEDRIVE', 'HOMEPATH', 'NVM_HOME', 'NVM_SYMLINK']

// The base environment plus `extra` (an undefined or empty value is left out).
export function childEnv(extra = {}, from = process.env, platform = process.platform) {
  const out = {}
  for (const k of platform === 'win32' ? [...BASE, ...WINDOWS] : BASE) if (from[k]) out[k] = from[k]
  for (const [k, v] of Object.entries(extra || {})) if (v !== undefined && v !== null && v !== '') out[k] = String(v)
  return out
}

// Variables named here are read from the server's environment and handed to that child by name.
export const pick = (names, from = process.env) => Object.fromEntries(names.filter(k => from[k]).map(k => [k, from[k]]))

// What a generated app is given: its database (Supabase), a Stripe test key, and the declared keys its
// locked App kit uses (`keys`, names from engine/appkit.mjs kitPlan), nothing else. A live Stripe key is
// never handed over; a name not declared in plugin.yaml is never read.
export const APP_KEYS = ['RESEND_API_KEY']
export function appEnv(from = process.env, keys = []) {
  const out = pick(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'], from)
  if (/^(sk|rk)_test_/.test(from.STRIPE_SECRET_KEY || '')) out.STRIPE_SECRET_KEY = from.STRIPE_SECRET_KEY
  Object.assign(out, pick(APP_KEYS.filter(k => Array.isArray(keys) && keys.includes(k)), from))
  return out
}

// What Hermes's own CLI and Python need to find the person's Hermes (no keys: Hermes reads its own).
export const hermesEnv = (extra = {}) => ({ ...pick(['HERMES_HOME']), ...extra })

// A headless (or headed) browser started by Playwright or Puppeteer: the base, and a display on Linux.
export const browserEnv = () => childEnv(pick(['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR']))

// The options with `env` replaced by childEnv(options.env).
const scoped = (opts = {}) => ({ ...opts, env: childEnv(opts.env) })

export function spawn(cmd, args = [], opts = {}) {
  if (!Array.isArray(args)) return cp.spawn(cmd, scoped(args))
  return cp.spawn(cmd, args, scoped(opts))
}

export function execFile(cmd, args, opts, cb) {
  if (typeof args === 'function') return cp.execFile(cmd, [], scoped(), args)
  if (!Array.isArray(args)) return cp.execFile(cmd, [], scoped(args), opts)
  if (typeof opts === 'function') return cp.execFile(cmd, args, scoped(), opts)
  return cp.execFile(cmd, args, scoped(opts), cb)
}

export function execFileSync(cmd, args = [], opts = {}) {
  if (!Array.isArray(args)) return cp.execFileSync(cmd, scoped(args))
  return cp.execFileSync(cmd, args, scoped(opts))
}

// A child the studio keeps running and may have to stop (an app's dev server, a built app's server, a film
// render): started with execa (engine/vendor/procs/, pinned), so it dies with the server (cleanup), a stop it
// ignores becomes a kill (forceKillAfterDelay), and its environment is only childEnv(opts.env) (extendEnv: false).
// It is a ChildProcess (stdout, exitCode, 'exit') and a promise of its end; it never rejects (reject: false).
export function start(cmd, args = [], opts = {}) {
  return execa(cmd, args, { cleanup: true, forceKillAfterDelay: 5000, windowsHide: true, reject: false, buffer: false, stdin: 'ignore', ...opts, extendEnv: false, env: childEnv(opts.env) })
}

// Stop a child and every process it started: tree-kill (taskkill /T on Windows; the children by parent pid on
// macOS and Linux), SIGTERM first, then SIGKILL for what is left after `ms`. Resolves once it has exited.
export function stopTree(p, { ms = 5000, kill = treeKill } = {}) {
  if (!p?.pid || (p.exitCode !== null && p.exitCode !== undefined) || p.signalCode) return Promise.resolve()
  return new Promise(ok => {
    const t = setTimeout(() => kill(p.pid, 'SIGKILL', () => ok()), ms)
    p.once('exit', () => { clearTimeout(t); ok() })
    kill(p.pid, 'SIGTERM', () => {})
  })
}

// The one child that gets the server's whole environment: the server's own replacement, the same program
// started again after its code changed on disk (server/server.mjs, replaceSelf). It is detached and keeps the
// log the launcher gave this process.
export function respawnSelf({ execPath = process.execPath, argv = process.argv.slice(1), env = process.env, cwd = process.cwd(), spawner = cp.spawn } = {}) {
  const child = spawner(execPath, argv, { env, cwd, detached: true, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
  child.unref?.()
  return child
}
