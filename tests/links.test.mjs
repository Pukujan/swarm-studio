import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strangeLinks } from '../engine/links.mjs'

test('strangeLinks reports made-up domains, not fonts, hidden folders or the given address', () => {
  const d = mkdtempSync(join(tmpdir(), 'links-'))
  mkdirSync(join(d, 'src')); mkdirSync(join(d, '.dyad'))
  writeFileSync(join(d, 'index.html'), '<link href="https://fonts.googleapis.com/css2?family=Inter">')
  writeFileSync(join(d, 'src/cta.tsx'), 'export const URL = "https://searchflights.com"; const home = "https://my-site.vercel.app/"')
  writeFileSync(join(d, '.dyad/chat.md'), 'https://elsewhere.example')
  const bad = strangeLinks(d, ['https://my-site.vercel.app'])
  assert.deepEqual(bad.map(b => b.host), ['searchflights.com'])
  assert.equal(bad[0].file, 'src/cta.tsx')
})
