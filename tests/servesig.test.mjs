import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveSig } from '../engine/appjob.mjs'

test('the dev server restarts when a turn changes its setup, not for source edits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'servesig-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'vite.config.ts'), 'export default {}')
    const a = serveSig(dir)
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src', 'main.ts'), 'x')
    assert.equal(serveSig(dir), a, 'a source edit is picked up by Vite itself')
    mkdirSync(join(dir, 'server'))
    const b = serveSig(dir)
    assert.notEqual(b, a, 'a server/ folder (Nitro routes) appearing')
    writeFileSync(join(dir, 'nitro.config.ts'), 'export default {}')
    const c = serveSig(dir)
    assert.notEqual(c, b, 'a Nitro config appearing')
    const later = new Date(Date.now() + 5000)
    utimesSync(join(dir, 'vite.config.ts'), later, later)
    assert.notEqual(serveSig(dir), c, 'the Vite config changing (a new plugin)')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
