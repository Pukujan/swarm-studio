// The board's host seam (ui/src/board/host.ts, decision 0014): slice 1's host, where every attached page is a live
// frame, keeps the live wishes a tier manager would weigh and reaches only frames it holds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iframeHost } from '../ui/src/board/iframeHost.ts'

const frame = () => { const sent = []; return { sent, contentWindow: { postMessage: m => sent.push(m) } } }

test('an attached page is live and can be reached; a detached one is not, and nothing is queued for it', () => {
  const host = iframeHost()
  const seen = []
  host.onTier((id, t) => seen.push(`${id}:${t}`))
  const f = frame()
  const detach = host.attach('home', f)
  assert.equal(host.tier('home'), 'live')
  assert.equal(host.post('home', { type: 'theme' }), true)
  assert.deepEqual(f.sent, [{ type: 'theme' }])
  detach()
  assert.equal(host.tier('home'), 'hidden')
  assert.equal(host.post('home', { type: 'slot' }), false)
  assert.equal(f.sent.length, 1)
  assert.deepEqual(seen, ['home:live', 'home:hidden'])
})

test('live wishes are kept per reason, so releasing one leaves the others', () => {
  const host = iframeHost()
  host.requestLive('plans', 'agent')
  host.requestLive('plans', 'selected')
  host.releaseLive('plans', 'agent')
  assert.deepEqual([...host.wishes('plans')], ['selected'])
  host.place([{ id: 'plans', kind: 'page', rect: { x: 1540, y: 28, w: 1280, h: 900 } }])
  assert.equal(host.items()[0].rect.x, 1540)
})
