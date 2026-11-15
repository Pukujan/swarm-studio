// Preloaded into the gauge's Studio server when GAUGE_REQLOG is set (node --import): each request it receives goes to
// stderr as it arrives, so the last lines before a hang name the request that caused it.
import http from 'node:http'

const emit = http.Server.prototype.emit
http.Server.prototype.emit = function (ev, req) {
  if (ev === 'request') console.error(`REQ ${req.method} ${String(req.url).slice(0, 120)}`)
  return emit.apply(this, arguments)
}
