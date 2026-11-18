// How a test or a check script starts a throwaway Studio (scripts/studio-child.mjs): on a port the server
// binds itself, never one picked beforehand and let go, which another test's server could take first (the idle
// test met a server that had exited with code 1 after 233 ms, 2026-11-14).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startStudio, onFreePort } from '../scripts/studio-child.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const envIn = dir => ({ ...process.env, SWARM_TOKEN: 't', SWARM_DATA_DIR: join(dir, 'data'), SWARM_RUNS_DIR: join(dir, 'data', 'runs'), SWARM_OUTPUT_DIR: join(dir, 'out'), HERMES_HOME: join(dir, 'hermes') })

test('the server picks its own port, says which, and answers on it; two at once never meet', async () => {
  const dirs = [0, 1, 2].map(() => mkdtempSync(join(tmpdir(), 'child-srv-')))
  const all = await Promise.all(dirs.map(dir => startStudio({ env: envIn(dir) })))
  try {
    assert.equal(new Set(all.map(s => s.port)).size, 3)
    for (const s of all) {
      assert.ok(s.port > 0)
      // the page, not a refusal: the server knows its own address (its Host check)
      const page = await fetch(s.base + '/')
      assert.equal(page.status, 200)
      assert.match(await page.text(), /<title>Swarm Studio/)
    }
  } finally { for (const s of all) s.child.kill(); for (const d of dirs) rmSync(d, { recursive: true, force: true }) }
})

test('a port that is taken is said, with what the server printed, not met as somebody else\'s server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'child-srv-'))
  const other = createServer()
  await new Promise(r => other.listen(0, '127.0.0.1', r))
  try {
    await assert.rejects(startStudio({ env: envIn(dir), port: other.address().port }), err => {
      assert.equal(err.code, 'EADDRINUSE')
      assert.match(err.message, /exited with code \d+ before it listened/)
      assert.match(err.message, /EADDRINUSE/)
      return true
    })
    // and a start that picks its port beforehand goes again on another
    let tries = 0
    const s = await onFreePort(port => startStudio({ env: envIn(dir), port: tries++ ? port : other.address().port }))
    try { assert.equal(tries, 2); assert.notEqual(s.port, other.address().port) } finally { s.child.kill() }
  } finally { other.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('a tree from before the server could pick its port is started again on a picked one', async () => {
  // such a server listens on port 0 but calls itself ":0" (it printed the number it was given)
  const old = mkdtempSync(join(tmpdir(), 'child-old-'))
  mkdirSync(join(old, 'server'))
  writeFileSync(join(old, 'server', 'server.mjs'), `import { createServer } from 'node:http'
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
createServer((req, res) => res.end('old')).listen(port, '127.0.0.1', () => console.log(\`swarm studio on http://127.0.0.1:\${port}/  (planner x, workers y)\`))
`)
  const s = await startStudio({ root: old, env: process.env })
  try {
    assert.ok(s.port > 0)
    assert.equal(await (await fetch(s.base + '/')).text(), 'old')
  } finally { s.child.kill(); rmSync(old, { recursive: true, force: true }) }
})

test('no test or check script picks a port, lets it go and hands it to a server', () => {
  // the pattern, wherever it is written: a listener on port 0 that is closed to give its number away
  const files = [...readdirSync(join(root, 'tests')).filter(f => f.endsWith('.mjs')).map(f => `tests/${f}`), ...readdirSync(join(root, 'scripts')).filter(f => f.endsWith('.mjs')).map(f => `scripts/${f}`)]
  const picks = files.filter(f => f !== 'scripts/studio-child.mjs' && /\bfreePort\b/.test(readFileSync(join(root, f), 'utf8')))
  assert.deepEqual(picks, [])
})

// The person, 2026-11-16: "everytime i fix it it crashes". The server threw on a busy port, so a hand-over
// (the launcher starting a new server on a new build while the old one had not let go) became a crash loop
// instead of a one-second wait. It waits now — and still says EADDRINUSE when the port is really somebody
// else's, because the launcher reads that word to pick a fresh port.
test('a hand-over waits for the old server to let go, and a real conflict still says EADDRINUSE', async () => {
  const src = readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8')
  assert.match(src, /server\.on\('error'/, 'listen has an error handler')
  assert.match(src, /err\)\?\.code !== 'EADDRINUSE'|code !== 'EADDRINUSE'/, 'a code other than EADDRINUSE still ends it')
  assert.match(src, /setTimeout\(\(\) => server\.listen\(port, '127\.0\.0\.1'\), 200\)/, 'it waits and tries again')
  assert.match(src, /is still in use; another server has it \(EADDRINUSE\)/, 'and says the word the launcher reads')

  // a port held for a moment: the server that waits takes it over
  const dir = mkdtempSync(join(tmpdir(), 'child-hand-'))
  const other = createServer()
  await new Promise(r => other.listen(0, '127.0.0.1', r))
  const port = other.address().port
  setTimeout(() => other.close(), 400)
  try {
    const s = await startStudio({ env: envIn(dir), port })
    try {
      assert.equal(s.port, port, 'it took the very port that was busy a moment ago')
      assert.equal((await fetch(s.base + '/')).status, 200)
    } finally { s.child.kill() }
  } finally { try { other.close() } catch {} rmSync(dir, { recursive: true, force: true }) }
})
