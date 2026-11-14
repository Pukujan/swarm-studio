// The vendored libraries (docs/specs/34-navigation-state.md): pinned, licensed, the committed file is the
// recorded one, and the page build inlines them so the pane's frame never fetches anything.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { VENDORED, NODE_VENDORED } from '../scripts/vendor.mjs'
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

test("the server's bundle (execa, tree-kill) is the file SOURCE.json records, every package pinned and licensed", async () => {
  for (const lib of NODE_VENDORED) {
    const dir = join(root, lib.out, '..')
    const source = JSON.parse(readFileSync(join(dir, 'SOURCE.json'), 'utf8'))
    // a Windows checkout may hold the file with \r\n; the recorded hash is of the file as built (\n)
    const file = readFileSync(join(root, lib.out), 'utf8').replace(/\r\n/g, '\n')
    assert.equal(createHash('sha256').update(file).digest('hex'), source.sha256)
    const lock = JSON.parse(readFileSync(join(root, lib.dir, 'package-lock.json'), 'utf8'))
    const locked = Object.entries(lock.packages).filter(([k]) => k)
    assert.equal(source.packages.length, locked.length)
    for (const [, v] of locked) assert.match(v.integrity, /^sha512-/, 'every package in the lockfile has its integrity')
    const pinned = JSON.parse(readFileSync(join(root, lib.dir, 'package.json'), 'utf8')).dependencies
    for (const v of Object.values(pinned)) assert.match(v, /^\d+\.\d+\.\d+$/, 'exact versions only')
    const licence = readFileSync(join(dir, 'LICENSE'), 'utf8')
    for (const p of source.packages) {
      assert.match(p.license, /^(MIT|ISC|Apache-2\.0)$/, `${p.name}: a licence the plugin can ship`)
      assert.ok(licence.includes(`${p.name} ${p.version} (${p.license})`), `${p.name}'s licence text is in LICENSE`)
    }
    const mod = await import(pathToFileURL(join(root, lib.out)).href)
    assert.deepEqual(Object.keys(mod).sort(), [...lib.exports].sort())
  }
})
