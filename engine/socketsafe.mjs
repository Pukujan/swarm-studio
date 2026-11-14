// A reset connection must not end the process (docs/engines/hermes-and-connections.md, "Limits inside Swarm").
//
// Node 24's fetch (its bundled undici, 7.29: writeH1) sets the IP type of service on the socket before every
// request it writes, 0 when nobody asked for one. On macOS that setsockopt fails with EINVAL on a socket the
// other side has already reset, and fetch does not expect it: the error is thrown out of the socket's own
// 'connect' event, where no caller's try/catch or .catch() is, so the whole process exits. The Studio met it
// when Hermes quit in the moment a call to its bridge was connecting (2026-11-14: the canvas heard "reset"
// and nothing after, because the server was gone; never on Linux or Windows, where the same call succeeds).
//
// Setting "no type of service" on a dead socket loses nothing, so that one case is let pass: the write that
// follows fails as a reset connection does everywhere else, and the caller gets an error it can handle (the
// bridge drops that Hermes, engine/bridge.mjs). Any other value still throws, for whoever asks for one.
// Imported for its effect, first, by every process of the Studio's that calls out (server/server.mjs,
// server/hosted.mjs).
import net from 'node:net'

export function safeTypeOfService(proto = net.Socket.prototype) {
  const set = proto.setTypeOfService
  if (typeof set !== 'function' || set.safe) return false
  proto.setTypeOfService = Object.assign(function setTypeOfService(tos) {
    try { return set.call(this, tos) } catch (err) { if (tos) throw err; return this }
  }, { safe: true })
  return true
}
safeTypeOfService()
