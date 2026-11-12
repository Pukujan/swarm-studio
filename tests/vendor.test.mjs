// The vendored libraries (docs/specs/34-navigation-state.md): pinned, licensed, the committed file is the
// recorded one, and the page build inlines them so the pane's frame never fetches anything.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { VENDORED } from '../scripts/vendor.mjs'
import { joinModules } from '../server/page.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

test('each vendored file is pinned and is the one SOURCE.json records', () => {
  for (const lib of VENDORED) {
    assert.match(lib.version, /^\d+\.\d+\.\d+$/)
    assert.match(lib.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/)
    const dir = join(root, lib.out, '..')
    const source = JSON.parse(readFileSync(join(dir, 'SOURCE.json'), 'utf8'))
    assert.deepEqual([source.name, source.version, source.integrity, source.license], [lib.name, lib.version, lib.integrity, 'MIT'])
    assert.equal(source.tarball, `https://registry.npmjs.org/${lib.name}/-/${lib.name}-${lib.version}.tgz`)
    assert.equal(createHash('sha256').update(readFileSync(join(root, lib.out))).digest('hex'), source.sha256)
    assert.match(readFileSync(join(dir, 'LICENSE'), 'utf8'), /MIT License|Permission is hereby granted/)
    assert.doesNotMatch(readFileSync(join(root, lib.out), 'utf8'), /<\/script/i)
  }
})

test('xstate imports in node, and joined into a page script it works the same', async t => {
  const lib = VENDORED.find(l => l.name === 'xstate')
  const direct = await import(pathToFileURL(join(root, lib.out)))
  for (const name of lib.exports) assert.equal(typeof direct[name], 'function', name)

  const web = mkdtempSync(join(tmpdir(), 'vendor-page-'))
  t.after(() => rmSync(web, { recursive: true, force: true }))
  mkdirSync(join(web, 'vendor', 'xstate'), { recursive: true })
  copyFileSync(join(root, lib.out), join(web, 'vendor', 'xstate', 'xstate.mjs'))
  writeFileSync(join(web, 'a.js'), "import { createActor, fromTransition as reducer } from './vendor/xstate/xstate.mjs'\nexport const count = createActor(reducer((n, e) => n + e.by, 1)).start()\n")
  writeFileSync(join(web, 'b.js'), "import { count } from './a.js'\nimport { createActor } from './vendor/xstate/xstate.mjs'\ncount.send({ by: 2 })\nglobalThis.__vendorTest = { n: count.getSnapshot().context, same: typeof createActor }\n")
  const code = joinModules(web, ['a.js', 'b.js'])
  assert.equal(code.match(/const __vendor_xstate = /g).length, 1, 'the library goes in once')
  assert.doesNotMatch(code, /^import /m)
  await import(`data:text/javascript,${encodeURIComponent(code)}`)
  assert.deepEqual(globalThis.__vendorTest, { n: 3, same: 'function' })
})
