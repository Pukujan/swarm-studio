// Decision 0001 (docs/decisions): the Studio is local and only the Feed is hosted. The hosted studio, build
// credits and "paid per build" must not come back in the brand docs or the README.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const files = ['README.md', ...readdirSync(join(root, 'docs/brand')).filter(f => f.endsWith('.md')).map(f => `docs/brand/${f}`)]
const BANNED = [/hosted (swarm )?studio/i, /paid per build/i, /\bcredits\b/i]

test('no hosted studio, build credits or paid per build in docs/brand or the README', () => {
  const hits = []
  for (const f of files) {
    readFileSync(join(root, f), 'utf8').split('\n').forEach((line, i) => {
      for (const re of BANNED) if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(hits, [], 'contradicts docs/PRODUCT.md and docs/decisions/0001:\n' + hits.join('\n'))
})

test('AGENTS.md sends every session to docs/PRODUCT.md first', () => {
  const head = readFileSync(join(root, 'AGENTS.md'), 'utf8').split('\n').slice(0, 5).join('\n')
  assert.match(head, /docs\/PRODUCT\.md/)
})
