// One way to start a throwaway Studio server from a test or a check script.
//
//   const s = await startStudio({ env })      s.base, s.port, s.child, s.exited (its exit code), s.log()
//
// The server binds port 0, so the system hands it a port nobody else has, and its first line of output says
// which. The other way, asking the system for a free port, letting it go and handing the number to the
// server, leaves a moment in which another process (another test file's server) binds it first: this server
// then exits with "address already in use", and the test goes on to talk to the other one (tests/lifecycle,
// 2026-11-14: exit code 1 after 233 ms). A server that exits before it listens is an error here, with its
// exit code and what it printed.
//
// `port`: a caller that needs a certain one (WALK_PORT), or whose files must carry the address before the server
// starts (scripts/board-gauge.mjs, through onFreePort): when it turns out taken the error's code is EADDRINUSE.
//
// `root` may be another tree (the motion check and the board gauge start a pull request's base). A tree from
// before the server could pick its own port listens on port 0 but calls itself ":0" and refuses its own
// address: that one is stopped and started again on a port picked beforehand, again if the port was taken.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LISTENING = /swarm studio on http:\/\/127\.0\.0\.1:(\d+)\//

const freePort = () => new Promise(done => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) }) })
// start(port) on a port asked of the system and let go; started again on another when someone took it in between
export async function onFreePort(start) {
  for (let i = 0; ; i++) {
    try { return await start(await freePort()) } catch (err) { if (err?.code !== 'EADDRINUSE' || i >= 4) throw err }
  }
}

export async function startStudio({ port = 0, ...rest } = {}) {
  const s = await startOn({ port, ...rest })
  if (s.port) return s
  s.child.kill()
  await s.exited
  return onFreePort(p => startOn({ port: p, ...rest }))
}

function startOn({ root = ROOT, env = process.env, port, show = false, waitMs = 30000 }) {
  const child = spawn(process.execPath, [join(root, 'server', 'server.mjs'), '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = '', out = ''
  const keep = (b, to) => { log = (log + b).slice(-20000); if (show) to.write(b) }
  const exited = new Promise(r => child.once('exit', code => r(code)))
  return new Promise((ok, fail) => {
    const no = why => {
      clearTimeout(timer)
      const taken = /EADDRINUSE/.test(log)
      fail(Object.assign(new Error(`the Studio server ${why}${log.trim() ? `; it printed:\n${log.trim().slice(-2000)}` : ', and printed nothing'}`), taken ? { code: 'EADDRINUSE' } : {}))
    }
    const timer = setTimeout(() => { child.kill(); no(`did not listen within ${waitMs / 1000} s`) }, waitMs)
    child.once('error', err => no(`could not start (${err.message})`))
    const early = (code, signal) => no(`exited with ${signal ? `signal ${signal}` : `code ${code}`} before it listened`)
    child.once('exit', early)
    child.stderr.on('data', b => keep(b, process.stderr))
    child.stdout.on('data', b => {
      keep(b, process.stdout)
      if (out === null) return
      out += b
      const m = out.match(LISTENING)
      if (!m) return
      out = null
      clearTimeout(timer)
      child.off('exit', early)
      ok({ child, port: Number(m[1]), base: `http://127.0.0.1:${m[1]}`, exited, log: () => log })
    })
  })
}
