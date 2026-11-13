// The prompt evals (bench/evals, decision 0019): the fingerprint is the prompts as sent, made without sending
// anything; the thresholds pass a change within them and fail one past any of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint, judge } from '../bench/evals/run.mjs'

test('the fingerprint is stable and sends nothing', async () => {
  const real = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('no network in this test') }
  try {
    const a = await fingerprint(), b = await fingerprint()
    assert.match(a, /^[0-9a-f]{16}$/)
    assert.equal(a, b)
  } finally { globalThis.fetch = real }
  // the review and fix prompts are caught at fetch, which the fingerprint swaps out and puts back
  assert.equal(globalThis.fetch, real)
  assert.equal(calls, 0)
})

const side = over => ({ fingerprint: 'x', sets: { kiln: { score: 7, findings: 0.2, p0: 0, wallMs: 10000, tokensIn: 20000, ...over } } })
const T = { scoreDrop: 0.5, findingsRise: 0.25, p0Rise: 1, timeRisePct: 25, tokensRisePct: 40 }

test('within every threshold passes, and says so in the table', () => {
  const { fails, table } = judge(side(), side({ score: 6.6, findings: 0.4, p0: 1, wallMs: 12000, tokensIn: 27000 }), T)
  assert.deepEqual(fails, [])
  assert.match(table, /\| kiln \| 7 → 6\.6 \|/)
})

for (const [name, over] of [['score', { score: 6.4 }], ['findings', { findings: 0.5 }], ['P0', { p0: 2 }], ['wall time', { wallMs: 12600 }], ['prompt tokens', { tokensIn: 28100 }]]) {
  test(`past the ${name} threshold fails`, () => {
    const { fails } = judge(side(), side(over), T)
    assert.equal(fails.length, 1, fails.join('; '))
  })
}

test('a set only after the change is listed, not judged', () => {
  const after = side(); after.sets.harbour = after.sets.kiln
  const { fails, table } = judge(side(), after, T)
  assert.deepEqual(fails, [])
  assert.match(table, /harbour \| new set/)
})
