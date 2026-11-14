// The site walk's door to the network (engine/sitelook.mjs, Nous catalog review). The walk's browser is started
// with this proxy as its only way out (--proxy-server, loopback included), so every request it makes goes through
// here: the page, its redirects, iframes, fetch and XHR, pictures, fonts, WebSockets and workers. Each one is
// checked where the connection is made:
//
// - the host is resolved here, every address it resolves to is checked (engine/chatmedia.mjs privateAddress:
//   ipaddr.js, public unicast only, IPv4 and IPv6, IPv4-mapped forms included), and the connection goes to the
//   address that was checked. The browser never resolves a name itself, so a name that answers a public address
//   to the check and a private one a moment later (DNS rebinding) cannot reach the private one: the check and the
//   connection use the same answer.
// - a redirect is a new request from the browser, so it comes through here and is checked again.
// - an address written as an IP is checked as it is.
// - `allow`: exact origins the walk may reach although they are local (the crew's own pages); nothing else is.
//
// Plain HTTP is forwarded; HTTPS and WebSockets come as CONNECT and are tunnelled as bytes (nothing is decrypted).
// The proxy listens on 127.0.0.1 only, on a free port, for one walk, and closes with it.
import http from 'node:http'
import net from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'
import { privateAddress } from './chatmedia.mjs'

const HOP = new Set(['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

// the host's addresses, every one public, or an error. `lookup` is dns.promises.lookup's shape.
export async function vetHost(host, { lookup = dnsLookup } = {}) {
  const h = String(host || '').replace(/^\[|\]$/g, '')
  if (!h) throw new Error('no host')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.ts\.net)$/i.test(h)) throw new Error('only public web pages')
  const addrs = net.isIP(h) ? [{ address: h, family: net.isIP(h) }] : await lookup(h, { all: true, verbatim: true }).catch(() => [])
  if (!addrs.length) throw new Error('the name did not resolve')
  if (addrs.some(a => privateAddress(a.address))) throw new Error('only public web pages')
  return addrs.map(a => ({ address: a.address, family: a.family || net.isIP(a.address) }))
}

// The proxy. → { url, port, args (the browser flags), refused: [{ host, why }], close() }
// lookup: for tests. dial(address, port): where to connect for a checked address (tests point a public test
// address at a local page; otherwise it is the address itself).
export async function walkGuard({ allow = [], lookup = dnsLookup, dial = (address, port) => ({ host: address, port }) } = {}) {
  const allowed = new Set(allow.map(o => { try { const u = new URL(o); return /^https?:$/.test(u.protocol) ? `${u.hostname.replace(/^\[|\]$/g, '')}:${u.port || (u.protocol === 'https:' ? 443 : 80)}` : '' } catch { return '' } }).filter(Boolean))
  const refused = [], tunnels = new Set()
  // where to connect for host:port, or an error
  const target = async (host, port) => {
    const h = String(host || '').replace(/^\[|\]$/g, '')
    if (!(port > 0 && port < 65536)) throw new Error('no port')
    if (allowed.has(`${h}:${port}`)) return { host: h, port }
    const [first] = await vetHost(h, { lookup })
    return dial(first.address, port)
  }
  const refuse = (host, err) => { refused.push({ host: String(host || ''), why: String(err?.message || err) }); if (refused.length > 200) refused.shift() }

  const server = http.createServer(async (req, res) => {
    let u
    try { u = new URL(req.url) } catch { return res.writeHead(400).end() }
    if (u.protocol !== 'http:') return res.writeHead(400).end()
    let to
    try { to = await target(u.hostname, Number(u.port || 80)) } catch (err) { refuse(u.hostname, err); return res.writeHead(403, { 'content-type': 'text/plain' }).end('refused') }
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k.toLowerCase())) headers[k] = v
    const out = http.request({ host: to.host, port: to.port, method: req.method, path: `${u.pathname}${u.search}`, headers, setHost: false, agent: false }, up => {
      const back = {}
      for (const [k, v] of Object.entries(up.headers)) if (!HOP.has(k.toLowerCase())) back[k] = v
      res.writeHead(up.statusCode || 502, back)
      up.pipe(res)
    })
    out.on('error', () => { if (!res.headersSent) res.writeHead(502).end(); else res.destroy() })
    req.pipe(out)
  })
  server.on('connect', async (req, client, head) => {
    client.on('error', () => {})
    const m = String(req.url || '').match(/^\[?([^\]]*?)\]?:(\d+)$/)
    let to
    try { if (!m) throw new Error('bad address'); to = await target(m[1], Number(m[2])) } catch (err) { refuse(m?.[1] || req.url, err); return client.end('HTTP/1.1 403 Forbidden\r\n\r\n') }
    const up = net.connect({ host: to.host, port: to.port })
    tunnels.add(client); tunnels.add(up)
    for (const s of [client, up]) s.once('close', () => tunnels.delete(s))
    up.on('error', () => client.destroy())
    up.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head?.length) up.write(head); up.pipe(client); client.pipe(up) })
    client.on('close', () => up.destroy())
  })
  // a plain ws:// upgrade sent to the proxy itself is not a CONNECT: refused (the browser tunnels WebSockets)
  server.on('upgrade', (req, sock) => { refuse(req.url, 'upgrade'); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n') })
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok) })
  const port = server.address().port
  return {
    port, url: `http://127.0.0.1:${port}`, refused,
    // every request through the proxy, loopback too (Chrome skips a proxy for loopback unless told <-loopback>);
    // no name is resolved by the browser itself; WebRTC sends nothing that is not proxied
    args: [`--proxy-server=http://127.0.0.1:${port}`, '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-quic'],
    close: () => new Promise(ok => { for (const s of tunnels) s.destroy(); server.closeAllConnections?.(); server.close(() => ok()) })
  }
}
