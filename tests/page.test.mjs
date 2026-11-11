// The canvas page joins several modules into one inline script (server/page.mjs). A top-level
// name two of them declare is a SyntaxError that stops the whole page, so every joined
// script must parse as one module.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canvasPage } from '../server/page.mjs'

test('every joined module script on the page parses', () => {
  const html = canvasPage(fileURLToPath(new URL('../web', import.meta.url)))
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1])
  assert.ok(scripts.length >= 2, 'the canvas and the studio scripts are inline')
  const dir = mkdtempSync(join(tmpdir(), 'page-'))
  try {
    scripts.forEach((src, i) => {
      const f = join(dir, `s${i}.mjs`)
      writeFileSync(f, src)
      assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }), `joined script ${i} does not parse`)
    })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
