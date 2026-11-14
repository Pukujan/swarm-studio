// The App room's picker in a built app's pages (issue #542, "pointing"; engine/apppick.mjs): it goes into the HTML
// Swarm serves, never into another file, it waits for its parent to ask, and it answers only the origin that asked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PICKER, withPicker } from '../engine/apppick.mjs'
import { serveStatic } from '../engine/godotfirst.mjs'
import { corsFront } from '../engine/appjob.mjs'

const free = () => new Promise(r => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)) }) })

test('the picker goes once into a page, before </head>, and is a script that starts only when its parent asks', () => {
  const page = '<!doctype html><html><head><title>Taskly</title></head><body><div id="root"></div></body></html>'
  const out = withPicker(page)
  assert.ok(out.indexOf('data-swarm-pick') < out.indexOf('</head>'))
  assert.equal(withPicker(out), out, 'never twice')
  assert.match(withPicker('<body class="x"><p>hi</p></body>'), /<body class="x"><script data-swarm-pick>/)
  assert.equal(withPicker('<canvas></canvas>'), '<canvas></canvas>', 'not a document: left as it is')
  const js = PICKER.replace(/^<script data-swarm-pick>/, '').replace(/<\/script>$/, '')
  assert.doesNotThrow(() => new Function(js))
  // it answers its parent only, to the origin that asked, and sends what the element is, not the page
  assert.match(js, /e\.source !== P/)
  assert.match(js, /to = e\.origin/)
  assert.doesNotMatch(js, /postMessage\([^)]*'\*'\)/)
  assert.doesNotMatch(js, /innerHTML|outerHTML|document\.cookie|localStorage/)
})

test('a built app served as files: its HTML pages carry the picker, its other files are untouched', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'swarm-pick-'))
  try {
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'index.html'), '<html><head></head><body></body></html>')
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("</head>")')
    const s = await serveStatic(dist, await free(), { spa: true, html: withPicker })
    try {
      assert.match(await (await fetch(s.url)).text(), /data-swarm-pick/)
      assert.match(await (await fetch(`${s.url}tasks`)).text(), /data-swarm-pick/, 'a route of the app is its index.html')
      assert.equal(await (await fetch(`${s.url}assets/app.js`)).text(), 'console.log("</head>")')
    } finally { await s.close() }
    assert.doesNotMatch(readFileSync(join(dist, 'index.html'), 'utf8'), /swarm-pick/, 'the app\'s own file is unchanged')
  } finally { rmSync(dist, { recursive: true, force: true }) }
})

test('an app with a server: the front adds the picker to its HTML and passes everything else through', async () => {
  const app = createServer((req, res) => {
    if (req.url === '/api/tasks') return res.writeHead(200, { 'content-type': 'application/json' }).end('[{"title":"Buy milk"}]')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': 39 }).end('<html><head></head><body></body></html>')
  })
  const inner = await free()
  await new Promise(r => app.listen(inner, '127.0.0.1', r))
  const front = await corsFront(await free(), inner, { html: withPicker })
  try {
    const page = await fetch(front.url)
    const body = await page.text()
    assert.match(body, /data-swarm-pick/)
    assert.equal(Number(page.headers.get('content-length')), Buffer.byteLength(body))
    assert.equal(await (await fetch(`${front.url}api/tasks`)).text(), '[{"title":"Buy milk"}]')
  } finally { await front.close(); await new Promise(r => app.close(r)) }
})
