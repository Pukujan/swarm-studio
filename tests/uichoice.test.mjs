// Which Studio `/` opens (decision 0024, server/uichoice.mjs): the next UI unless the person chose the classic one,
// kept in the data folder's ui.json; anything else in the file reads as the default.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uiChoice } from '../server/uichoice.mjs'

test('the next UI unless the classic one was chosen, and the choice stays', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ui-'))
  try {
    const ui = uiChoice({ dataDir })
    assert.equal(ui.get(), 'next')
    assert.equal(ui.set('classic'), 'classic')
    assert.equal(uiChoice({ dataDir }).get(), 'classic')
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'ui.json'), 'utf8')), { ui: 'classic' })
    writeFileSync(join(dataDir, 'ui.json'), '{"ui":"something else"}')
    assert.equal(ui.get(), 'next')
    writeFileSync(join(dataDir, 'ui.json'), 'not json')
    assert.equal(ui.get(), 'next')
  } finally { rmSync(dataDir, { recursive: true, force: true }) }
})

test('the server serves / by the choice, /classic/ always the classic Studio, and the classic Studio has its way back', () => {
  const src = readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8')
  assert.match(src, /const next = !classic && ui\.get\(\) === 'next' \? nextPage\(uiDist, \{ token \}\) : null/)
  assert.match(src, /res\.end\(next \|\| canvasPage\(\)\)/)
  assert.match(read('web/home.js'), /label: 'Use the new Studio'/)
  assert.match(read('ui/src/shell/TopBar.tsx'), /Use the classic Studio/)
  assert.match(read('ui/src/screens/Projects.tsx'), /label="Use the classic Studio"/)
})
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
