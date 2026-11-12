// Is Hermes there to answer the studio's model, picture and clip calls, and if not, why not, in words a
// person can act on (docs/specs/33-hermes-bridge.md, "When Hermes is not there").
//
// The studio's model calls go through a Hermes process's bridge (bridge.py). Three ways it can be missing:
// - closed: no Hermes process is running at all;
// - updated: Hermes is running, but on the plugin's Python from before an update. A copy from before the
//   bridge never attaches at all; a newer one attaches with the time its Python files were written, and
//   the files on disk are newer than that. Either way Hermes needs a restart to load the new copy;
// - (attached: all is well; a bridge that goes away mid-build is told apart by the caller.)
//
// A Hermes process that is current attaches within a few seconds of the server answering, so when one is
// running but has not attached yet, ready() gives it that long before calling it outdated.

import { execFile } from './proc.mjs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HERMES_SAYS = {
  closed: { message: "Hermes isn't connected.", action: 'Open Hermes Desktop, or run `hermes swarm`, then try again.' },
  updated: { message: 'Swarm Studio was updated. Restart Hermes to finish.', action: 'Run `hermes gateway restart`, or quit Hermes Desktop and open it again.' },
  gone: { message: 'Hermes closed during the build. What was built is kept.', action: 'Open Hermes again and the build goes on.' }
}

// When the plugin's Python half last changed on disk: the newest *.py at the plugin's root, in seconds.
// bridge.py sends the same stamp for the files it loaded, so the two can be compared.
export function pyStamp(root) {
  let newest = 0
  try {
    for (const f of readdirSync(root)) if (f.endsWith('.py')) newest = Math.max(newest, statSync(join(root, f)).mtimeMs / 1000)
  } catch {}
  return newest
}

// A running Hermes: 'young' when one started in the last `youngMs` (it may not have attached yet), true
// when one has run longer, false when none, null when it cannot be told (then the message does not guess).
// - the gateway Hermes Desktop starts writes $HERMES_HOME/gateway.pid ({"pid": …}) when it starts; its
//   command line need not say "hermes" (Desktop runs it as `python3 -I -c …`);
// - a chat or `hermes swarm` runs hermes_cli/main.py, or the `hermes` entry script in a bin folder.
const HERMES_PROC = /hermes_cli[/\\.]main|[/\\]bin[/\\]hermes(\.exe)?(\s|$)/i
const ETIME = t => { const m = String(t).trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/); return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + +m[3] * 60 + +m[4]) * 1000 : Infinity }
const alive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
export function hermesRunning({ run = execFile, platform = process.platform, self = process.pid, home = process.env.HERMES_HOME || join(homedir(), '.hermes'), youngMs = 30000, now = Date.now } = {}) {
  let gateway = null
  try {
    const file = join(home, 'gateway.pid')
    const pid = Number(JSON.parse(readFileSync(file, 'utf8')).pid)
    if (pid > 0 && pid !== self && alive(pid)) gateway = now() - statSync(file).mtimeMs < youngMs ? 'young' : true
  } catch {}
  if (gateway === 'young') return Promise.resolve('young')
  if (platform === 'win32') return Promise.resolve(gateway || null)
  return new Promise(resolve => {
    run('ps', ['-Ao', 'pid=,etime=,command='], { timeout: 3000, maxBuffer: 4 << 20 }, (err, out) => {
      if (err) return resolve(gateway || null)
      let found = gateway
      for (const line of String(out).split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/)
        if (!m || Number(m[1]) === self || /server\.mjs/.test(m[3]) || !HERMES_PROC.test(m[3])) continue
        if (ETIME(m[2]) < youngMs) return resolve('young')
        found = true
      }
      resolve(found || false)
    })
  })
}

export function hermesHealth({ bridge, root, running = () => hermesRunning(), stamp = () => pyStamp(root), settleMs = 8000, pollMs = 500, cacheMs = 3000, now = () => Date.now() } = {}) {
  let seen = { t: -Infinity, value: null }
  const procs = async () => {
    if (now() - seen.t < cacheMs) return seen.value
    seen = { t: now(), value: await running() }
    return seen.value
  }
  // the attached bridges' Python is older than the files on disk (a bridge too old to say is not judged)
  const outdated = () => {
    const codes = bridge.status().codes || []
    const disk = stamp()
    return codes.length > 0 && codes.every(c => typeof c === 'number' && disk > c + 1)
  }

  // {ok:true} | {ok:false, code, message, action}; never waits
  async function now_() {
    if (bridge.status().attached) return outdated() ? { ok: true, code: 'updated', ...HERMES_SAYS.updated } : { ok: true, code: 'ok' }
    const up = await procs()
    return up ? { ok: false, code: 'updated', ...HERMES_SAYS.updated } : { ok: false, code: 'closed', ...HERMES_SAYS.closed }
  }

  // before a build: a Hermes that is running but has not attached yet gets settleMs to do so
  async function ready() {
    // a bridge whose Hermes closed a moment ago still looks attached until it is asked something
    await bridge.ping?.().catch(() => {})
    const h = await now_()
    // only a Hermes that started moments ago may still be about to attach; one that has run longer and
    // has not attached is running an older copy, and is told so at once
    if (h.ok || h.code !== 'updated' || seen.value !== 'young') return h
    const end = now() + settleMs
    while (now() < end) {
      await new Promise(r => setTimeout(r, pollMs))
      if (bridge.status().attached) return now_()
    }
    return h
  }

  return { now: now_, ready }
}
