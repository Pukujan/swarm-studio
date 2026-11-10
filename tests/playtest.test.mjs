import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { playtest } from '../engine/playtest.mjs'

// tiny games: one whose run ends straight after start, one that keeps going (both draw a scene)
const draw = `const c = document.querySelector('canvas').getContext('2d'); c.fillStyle = '#c23'; c.fillRect(20, 20, 200, 120); c.fillStyle = '#fd3'; c.fillRect(120, 160, 240, 100)`
const page = endsAfter => `<!doctype html><body><canvas width=400 height=300></canvas><button id=s>Play</button><p id=m></p><script>${draw}
s.onclick = () => { s.remove(); ${endsAfter ? `setTimeout(() => { m.textContent = 'Game over' }, ${endsAfter})` : ''} }</script></body>`
// a canvas and nothing drawn
const blankPage = '<!doctype html><body style="margin:0"><canvas width=1280 height=800></canvas></body>'
// the game is a module script: it only runs if the server allows the page's origin (Hermes's sandboxed frame is origin null)
const modulePage = '<!doctype html><body><script type="module" src="/game.js"></script></body>'
const moduleJs = `const k = document.createElement('canvas'); k.width = 400; k.height = 300; document.body.append(k); const c = k.getContext('2d'); c.fillStyle = '#c23'; c.fillRect(0, 0, 400, 150)`

function serve(handler) {
  const srv = createServer(handler)
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })))
}

test('playtest fails a game that ends at once and passes one that keeps going', { timeout: 60000 }, async () => {
  const { srv, base } = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(page(req.url === '/quick' ? 600 : 0)) })
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

test('playtest fails a blank screen', { timeout: 60000 }, async () => {
  const { srv, base } = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(blankPage) })
  try {
    const t = await playtest(`${base}/`, { seconds: 2 })
    if (t.skipped) return
    assert.equal(t.ok, false)
    assert.match(t.problem, /blank/)
  } finally { srv.close() }
})

test('playtest plays the game in a sandboxed frame, as Hermes shows it', { timeout: 60000 }, async () => {
  let cors = false
  const { srv, base } = await serve((req, res) => {
    if (req.url === '/game.js') {
      if (cors) res.setHeader('access-control-allow-origin', '*')
      res.setHeader('content-type', 'text/javascript'); return res.end(moduleJs)
    }
    res.setHeader('content-type', 'text/html'); res.end(modulePage)
  })
  try {
    const blocked = await playtest(`${base}/`, { seconds: 2 })
    if (blocked.skipped) return
    assert.equal(blocked.ok, false)
    assert.match(blocked.problem, /sandboxed frame/)
    cors = true
    const fine = await playtest(`${base}/`, { seconds: 2 })
    assert.equal(fine.ok, true)
  } finally { srv.close() }
})
