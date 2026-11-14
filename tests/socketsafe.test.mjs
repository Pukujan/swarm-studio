// A reset connection must not end the server (engine/socketsafe.mjs). Node 24's fetch sets the IP type of
// service, 0, on a socket before each request it writes; on macOS that throws EINVAL when the other side has
// already reset the connection, from inside the socket's 'connect' event, and the process exits. It is how the
// Studio's server died when Hermes quit as a call to its bridge was connecting (2026-11-14, Mac only).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { safeTypeOfService } from '../engine/socketsafe.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

test('"no type of service" on a dead socket is let pass; any other value, and a live socket, are as they were', () => {
  const calls = []
  const proto = { setTypeOfService(tos) { calls.push(tos); if (this.dead) throw Object.assign(new Error('setTypeOfService EINVAL'), { code: 'EINVAL' }); return this } }
  assert.equal(safeTypeOfService(proto), true)
  assert.equal(safeTypeOfService(proto), false, 'guarded once')
  const live = Object.create(proto), dead = Object.assign(Object.create(proto), { dead: true })
  assert.equal(live.setTypeOfService(0), live)
  assert.equal(live.setTypeOfService(16), live)
  assert.equal(dead.setTypeOfService(0), dead)
  assert.throws(() => dead.setTypeOfService(16), { code: 'EINVAL' })
  assert.deepEqual(calls, [0, 16, 0, 16], 'the real call is always made')
  assert.equal(safeTypeOfService({}), false, 'a Node without it is left alone')
})

// The case itself, on whatever this runs on: another process resets the connection, and this one sets the type
// of service before it has read the reset, as fetch does when the server is busy. On a Mac the call underneath
// throws EINVAL (measured on Node 24.22: reset after accept, and a listener closed with the connection waiting)
test('a socket the other side has reset takes "no type of service" without throwing', async t => {
  if (typeof net.Socket.prototype.setTypeOfService !== 'function') return t.skip('this Node has no setTypeOfService')
  const peer = spawn(process.execPath, ['-e', "const s = require('net').createServer(c => c.resetAndDestroy()); s.listen(0, '127.0.0.1', () => console.log(s.address().port))"], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    const [line] = await once(peer.stdout, 'data')
    const c = net.connect(Number(String(line).trim()), '127.0.0.1')
    c.on('error', () => {})
    await once(c, 'connect')
    // this process stands still while the reset arrives: the socket is dead and nothing here has heard so yet
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
    assert.doesNotThrow(() => c.setTypeOfService(0))
    c.destroy()
  } finally { peer.kill() }
})

test('each server of the Studio\'s loads the guard before anything else', () => {
  for (const f of ['server/server.mjs', 'server/hosted.mjs']) {
    const first = readFileSync(`${root}${f}`, 'utf8').split('\n').find(l => l.startsWith('import '))
    assert.equal(first, "import '../engine/socketsafe.mjs'", f)
  }
})
