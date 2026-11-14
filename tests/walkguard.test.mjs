// The site walk's network guard (engine/walkguard.mjs, Nous catalog review): every request the walk's browser
// makes is resolved, checked and connected to the checked address; redirects, sub-requests and a name that
// changes its answer (DNS rebinding) never reach a private, loopback, link-local or metadata address.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { walkGuard, vetHost } from '../engine/walkguard.mjs'
import { privateAddress } from '../engine/chatmedia.mjs'
import { walkSite } from '../engine/sitelook.mjs'
import { puppeteer } from '../engine/pageshots.mjs'
import { findChrome } from '../engine/seo.mjs'

const PUBLIC = '93.184.216.34'
// a pretend DNS: the names the tests use, and how many times each was asked
const fakeDns = (names) => {
  const asked = {}
  const lookup = async host => {
    asked[host] = (asked[host] || 0) + 1
    const a = names[host]
    const got = typeof a === 'function' ? a(asked[host]) : a
    if (!got) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
    return [].concat(got).map(address => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
  return { lookup, asked }
}
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)))
// one request through the proxy, as a browser sends it: an absolute URL for http, CONNECT for https
const viaProxy = (port, url) => new Promise(ok => {
  const r = http.request({ host: '127.0.0.1', port, path: url, headers: { host: new URL(url).host } }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => ok({ status: res.statusCode, body: b })) })
  r.on('error', e => ok({ status: 0, body: e.message })); r.end()
})
const connectVia = (port, target) => new Promise(ok => {
  const r = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: target })
  r.on('connect', (res, sock) => { sock.destroy(); ok(res.statusCode) })
  r.on('response', res => ok(res.statusCode))
  r.on('error', () => ok(0)); r.end()
})

test('the address check is ipaddr.js: public unicast only, mapped and odd forms included', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.118.248.35', '0.0.0.0', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::7f00:1', 'fd00:ec2::254', 'fe80::1', 'fe80::1%en0', '64:ff9b::7f00:1', '2002:7f00:1::', '2001::1', '2001:db8::1', 'ff02::1', 'not an address', ''])
    assert.equal(privateAddress(ip), true, ip)
  for (const ip of ['8.8.8.8', PUBLIC, '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(privateAddress(ip), false, ip)
})

test('vetHost: every address a name resolves to must be public', async () => {
  const { lookup } = fakeDns({ 'ok.example': PUBLIC, 'mixed.example': [PUBLIC, '10.0.0.1'], 'meta.example': '169.254.169.254', 'v6.example': 'fd00:ec2::254', 'mapped.example': '::ffff:127.0.0.1' })
  assert.deepEqual(await vetHost('ok.example', { lookup }), [{ address: PUBLIC, family: 4 }])
  for (const h of ['mixed.example', 'meta.example', 'v6.example', 'mapped.example', '127.0.0.1', '[::1]', 'localhost', 'box.internal', 'pc.tail1234.ts.net']) await assert.rejects(vetHost(h, { lookup }), /only public|resolve/, h)
  await assert.rejects(vetHost('gone.example', { lookup }), /did not resolve/)
})

test('the proxy refuses private targets for plain HTTP and CONNECT, and connects to the address it checked', async () => {
  const hits = []
  const inside = http.createServer((req, res) => { hits.push(req.url); res.end('secret') })
  const ip = await listen(inside)
  const { lookup, asked } = fakeDns({ 'site.example': PUBLIC, 'meta.example': '169.254.169.254', 'loop.example': '127.0.0.1' })
  // the checked public address is dialled at the local page: the test's stand-in for the internet
  const g = await walkGuard({ lookup, dial: (address, port) => (address === PUBLIC ? { host: '127.0.0.1', port: ip } : { host: address, port }) })
  try {
    assert.equal((await viaProxy(g.port, 'http://site.example/hello')).body, 'secret')
    assert.deepEqual(hits, ['/hello'])
    for (const u of ['http://meta.example/latest/meta-data/', 'http://169.254.169.254/latest/meta-data/', `http://127.0.0.1:${ip}/`, `http://loop.example:${ip}/`, `http://[::1]:${ip}/`, `http://[::ffff:7f00:1]:${ip}/`, `http://localhost:${ip}/`])
      assert.equal((await viaProxy(g.port, u)).status, 403, u)
    for (const t of ['meta.example:443', '169.254.169.254:443', `127.0.0.1:${ip}`, `[::1]:${ip}`, `[fd00:ec2::254]:443`]) assert.equal(await connectVia(g.port, t), 403, t)
    assert.equal(await connectVia(g.port, `site.example:${443}`), 200)
    assert.deepEqual(hits, ['/hello'])
    assert.ok(g.refused.some(r => r.host === 'meta.example'))
    assert.ok(asked['site.example'] >= 1)
  } finally { await g.close(); inside.close() }
})

test('a name that answers public and then private (DNS rebinding) never reaches the private address', async () => {
  const hits = []
  const inside = http.createServer((req, res) => { hits.push(req.url); res.end('secret') })
  const ip = await listen(inside)
  // first answer public (the check on the link), every later answer the machine itself
  const { lookup } = fakeDns({ 'rebind.example': n => (n === 1 ? PUBLIC : '127.0.0.1') })
  const g = await walkGuard({ lookup, dial: (address, port) => ({ host: address, port }) })
  try {
    await vetHost('rebind.example', { lookup })
    assert.equal((await viaProxy(g.port, `http://rebind.example:${ip}/`)).status, 403)
    assert.deepEqual(hits, [])
  } finally { await g.close(); inside.close() }
})

test('only the exact origins given are let through although local', async () => {
  const page = http.createServer((req, res) => res.end('ours'))
  const other = http.createServer((req, res) => res.end('theirs'))
  const [a, b] = [await listen(page), await listen(other)]
  const g = await walkGuard({ allow: [`http://127.0.0.1:${a}/`] })
  try {
    assert.equal((await viaProxy(g.port, `http://127.0.0.1:${a}/`)).body, 'ours')
    assert.equal((await viaProxy(g.port, `http://127.0.0.1:${b}/`)).status, 403)
    assert.equal((await viaProxy(g.port, `http://localhost:${a}/`)).status, 403)
  } finally { await g.close(); page.close(); other.close() }
})

test('the walk\'s browser goes only through the guard, loopback included', async () => {
  let given = null
  const fake = async opts => { given = opts; throw new Error('no browser') }
  await assert.rejects(walkSite('http://127.0.0.1:9/', { launch: fake, allow: ['http://127.0.0.1:9/'] }), /no browser/)
  const args = given.args.join(' ')
  assert.match(args, /--proxy-server=http:\/\/127\.0\.0\.1:\d+/)
  assert.match(args, /--proxy-bypass-list=<-loopback>/)
  assert.match(args, /--host-resolver-rules=MAP \* ~NOTFOUND/)
  assert.match(args, /disable_non_proxied_udp/)
})

// the real thing, when this machine has the browser the video tools install
const dataDir = join(homedir(), '.hermes', 'swarm-studio')
const canWalk = !!(puppeteer(dataDir) && findChrome())
test('in a real browser: a redirect, fetch, XHR, image, iframe and WebSocket to private addresses are all refused', { skip: !canWalk && 'no browser here' }, async () => {
  const hits = []
  const inside = http.createServer((req, res) => { hits.push(`${req.headers.host}${req.url}`); res.end('secret') })
  inside.on('upgrade', (req, sock) => { hits.push(`ws ${req.url}`); sock.destroy() })
  const ip = await listen(inside)
  const html = `<!doctype html><html><body style="background:#101010;color:#eee;font-family:Georgia"><h1>Hi</h1><p>Words for the body of this page.</p>
    <img src="http://127.0.0.1:${ip}/img"><img src="http://meta.example/img"><iframe src="http://169.254.169.254/latest/meta-data/"></iframe><iframe src="http://[::ffff:7f00:1]:${ip}/frame"></iframe>
    <script>fetch('http://localhost:${ip}/fetch').catch(()=>{});const x=new XMLHttpRequest();x.open('GET','http://loop.example:${ip}/xhr');x.send();try{new WebSocket('ws://127.0.0.1:${ip}/ws')}catch{}</script></body></html>`
  const site = http.createServer((req, res) => {
    if (req.url === '/') return res.writeHead(302, { location: '/home' }).end()
    if (req.url === '/away') return res.writeHead(302, { location: `http://127.0.0.1:${ip}/redirected` }).end()
    res.writeHead(200, { 'content-type': 'text/html' }).end(html)
  })
  const sp = await listen(site)
  const { lookup } = fakeDns({ 'site.example': PUBLIC, 'meta.example': '169.254.169.254', 'loop.example': '127.0.0.1' })
  const dial = (address, port) => (address === PUBLIC ? { host: '127.0.0.1', port: sp } : { host: address, port })
  try {
    const w = await walkSite('http://site.example/', { dataDir, pages: 1, shots: 1, lookup, dial })
    assert.equal(w.pages.length, 1)
    assert.ok(w.tokens)
    const w2 = await walkSite('http://site.example/away', { dataDir, pages: 1, shots: 1, lookup, dial })
    assert.ok(w2.refused.some(r => r.host === '127.0.0.1'))
    await new Promise(r => setTimeout(r, 300))
    assert.deepEqual(hits, [])
    const hosts = w.refused.map(r => r.host)
    for (const h of ['meta.example', '169.254.169.254', 'localhost', 'loop.example', '127.0.0.1']) assert.ok(hosts.includes(h), `${h} in ${hosts.join(', ')}`)
  } finally { inside.close(); site.close() }
})
