import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { playtest } from '../engine/playtest.mjs'

// two tiny games: one whose run ends straight after start, one that keeps going
const page = endsAfter => `<!doctype html><body><canvas width=400 height=300></canvas><button id=s>Play</button><p id=m></p><script>
s.onclick = () => { s.remove(); ${endsAfter ? `setTimeout(() => { m.textContent = 'Game over' }, ${endsAfter})` : ''} }</script></body>`

test('playtest fails a game that ends at once and passes one that keeps going', { timeout: 60000 }, async () => {
  const srv = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(page(req.url === '/quick' ? 600 : 0)) })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  try {
    const quick = await playtest(`${base}/quick`, { seconds: 3 })
    if (quick.skipped) return // no browser here (CI without Playwright's Chromium)
    assert.equal(quick.ok, false)
    assert.match(quick.problem, /run ends/)
    const fine = await playtest(`${base}/fine`, { seconds: 3 })
    assert.equal(fine.ok, true)
    assert.equal(fine.ended, false)
  } finally { srv.close() }
})
