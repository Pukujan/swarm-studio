// ui/src/screens/app/radio.ts (#529, spec 44): the crew's radio folded from the stream, as web/canvas/auto.js does;
// run here by Node's own type stripping
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldRadio, NO_RADIO, heard, FRESH } from '../ui/src/screens/app/radio.ts'

test('an order, an act and a reply are kept by name; thinking is never an order', () => {
  let r = foldRadio(NO_RADIO, { type: 'crew:lead', run: 'r1', t: 1, text: 'Write the shift table', to: 'Pip' })
  r = foldRadio(r, { type: 'crew:lead', run: 'r1', t: 2, kind: 'reason', text: '💭 the table needs a week view' })
  r = foldRadio(r, { type: 'crew:act', run: 'r1', t: 3, name: 'Pip', text: 'writing src/Shifts.tsx' })
  r = foldRadio(r, { type: 'agent:say', run: 'r1', t: 4, name: 'Pip', text: 'On it.' })
  assert.deepEqual(r.lead, { text: 'Write the shift table', to: 'Pip', kind: 'think', t: 1 })
  assert.equal(r.reason.text, 'the table needs a week view')
  assert.equal(r.acts.Pip.text, 'writing src/Shifts.tsx')
  assert.equal(r.says.Pip.text, 'On it.')
})

test('another run starts the radio again, and other events leave it as it is', () => {
  const r = foldRadio(NO_RADIO, { type: 'crew:lead', run: 'r1', t: 1, text: 'x', to: 'Pip' })
  assert.equal(foldRadio(r, { type: 'app:step', run: 'r1' }), r)
  const s = foldRadio(r, { type: 'agent:say', run: 'r2', t: 5, name: 'Bo', text: 'hi' })
  assert.equal(s.lead, null)
  assert.equal(s.run, 'r2')
})

test('an order draws the line for 7 s', () => {
  assert.equal(heard({ text: 'x', t: 1000 }, FRESH.lead, 7999), true)
  assert.equal(heard({ text: 'x', t: 1000 }, FRESH.lead, 8000), false)
})
