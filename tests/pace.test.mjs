// engine/pace.mjs: a section that arrives whole (Hermes's model call does not stream) is played out in pieces,
// so the canvas animates as with a streamed one; a real stream passes straight through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pacer, PACE } from '../engine/pace.mjs'

const manual = () => { const q = []; return { wait: fn => { q.push(fn); return q.length }, run: () => { let n = 0; while (q.length) { q.shift()(); n++ } return n } } }

test('small deltas of a real stream pass straight through, in order', async () => {
  const got = [], p = pacer(d => got.push(d))
  p.push('<section>'); p.push('Hello'); p.push('')
  assert.deepEqual(got, ['<section>', 'Hello'])
  await p.done()
})

test('a whole section is handed on in many pieces within the time cap, nothing lost', async () => {
  const html = `<section class="hero">${'<p>Some words about the work.</p>'.repeat(120)}</section>`
  const got = [], m = manual(), p = pacer(d => got.push(d), { wait: m.wait })
  p.push(html)
  assert.equal(got.length, 0)
  let finished = false
  const d = p.done().then(() => { finished = true })
  const ticks = m.run()
  await d
  assert.equal(finished, true)
  assert.equal(got.join(''), html)
  assert.ok(got.length > 20, `pieces: ${got.length}`)
  assert.ok(ticks * PACE.tick <= PACE.maxMs + PACE.tick, `took ${ticks * PACE.tick} ms`)
})

test('pieces do not end inside a tag', () => {
  const html = '<div class="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">x</div>'.repeat(20)
  const got = [], m = manual(), p = pacer(d => got.push(d), { wait: m.wait })
  p.push(html); m.run()
  for (const g of got) assert.ok(g.lastIndexOf('<') <= g.lastIndexOf('>'), g)
})

test('what comes after a whole section waits its turn, and a stop hands the rest over at once', async () => {
  const got = [], m = manual(), ac = new AbortController()
  const p = pacer(d => got.push(d), { wait: m.wait, signal: ac.signal })
  const big = 'a'.repeat(2000)
  p.push(big); p.push('TAIL')
  assert.equal(got.length, 0)
  ac.abort()
  m.run()
  await p.done()
  assert.equal(got.join(''), big + 'TAIL')
  assert.equal(got.length, 1)
})
