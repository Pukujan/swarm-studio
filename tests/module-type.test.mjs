// An ancestor package.json declaring "type": "commonjs" must not decide how this repo's ESM .js files parse (#677).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

// The exact chain from the report: doctor.mjs imports QUOTED_RAW from engine/stopreason.mjs, which
// re-exports web/stopreason.js. Without a root manifest that .js file inherits the ancestor's type.
const CHAIN = ['engine/stopreason.mjs', 'web/stopreason.js']

test('the server ESM import chain survives a commonjs ancestor (#677)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'swarm-677-'))
  const ancestor = join(tmp, 'commonjs-ancestor')
  mkdirSync(ancestor)
  writeFileSync(join(ancestor, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  const clone = join(ancestor, 'swarm-studio')

  for (const rel of CHAIN) {
    const dest = join(clone, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(root, rel), dest)
  }
  // Copy the repo's own manifest, if it ships one, into the simulated install tree.
  const manifest = join(root, 'package.json')
  if (existsSync(manifest)) {
    assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).type, 'module', 'root package.json must declare ESM (#677)')
    copyFileSync(manifest, join(clone, 'package.json'))
  }

  const probe = "import { QUOTED_RAW } from './engine/stopreason.mjs'; if (!(QUOTED_RAW instanceof RegExp)) process.exit(3)"
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: clone, encoding: 'utf8' })
  assert.equal(run.status, 0, `the ESM chain failed under a commonjs ancestor: ${run.stderr || run.stdout}`)
})
