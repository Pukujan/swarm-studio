// The next UI (ui/, docs/decisions/0013-react-ui-coexists.md): /next/ is one document with the token put in at
// serve time, both apps run the same XState on the same machine and address, and every dependency is pinned.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { nextPage } from '../server/next.mjs'
import * as nav from '../web/nav.js'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const json = f => JSON.parse(read(f))
const dist = new URL('../ui/dist', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
// ui/dist/ is built, not committed (docs/decisions/0018-next-ui-build-on-release.md): the tests that read it run where
// it is built, and CI, which builds it first, sets SWARM_NEED_UI so they cannot be skipped there
const built = existsSync(new URL('../ui/dist/index.html', import.meta.url))
const needsBuild = { skip: !built && 'ui/dist/ is not built (npm run --prefix ui build)' }
test('CI builds ui/dist/ before the tests', { skip: !process.env.SWARM_NEED_UI }, () => assert.ok(built, 'ui/dist/ is not built'))

test('/next/ is one document: its script and styles inline, nothing left to load from /next/assets/', needsBuild, () => {
  const page = nextPage(dist, { token: 'k' })
  assert.match(page, /<title>Swarm Studio<\/title>/)
  assert.match(page, /<div id="root"><\/div>/)
  assert.match(page, /<script type="module">/)
  assert.match(page, /<style>/)
  assert.doesNotMatch(page, /(src|href)="\/next\//)
})

test('the token goes into the page at serve time, escaped, and never into ui/dist/', needsBuild, () => {
  const page = nextPage(dist, { token: 'a</script><b>' })
  assert.ok(page.includes('window.SWARM = {"token":"a\\u003c/script>\\u003cb>","version":"'))
  assert.ok(read('ui/dist/index.html').includes('<!-- swarm:boot -->'))
  assert.ok(!read('ui/index.html').includes('window.SWARM ='), 'the page\'s source sets no window.SWARM of its own')
  // a moved screen asks the server with the token header, read from window.SWARM when it asks: never a value in the build
  const js = read('ui/dist/assets/next.js')
  assert.doesNotMatch(js, /["']?x-swarm-token["']?\s*:\s*["'`][^"'`]/)
  if (js.includes('x-swarm-token')) assert.match(js, /SWARM\??\.token/)
  assert.ok(!js.includes('window.SWARM = ') && !/"token":"/.test(js))
})

test('a plugin without ui/dist/ has no /next/ page, and nothing is built for it', () => {
  assert.equal(nextPage(new URL('./fixtures', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {}), null)
})

test('both apps run the same XState: the vendored file, tools/dev and ui/ pin one version', () => {
  const vendored = json('web/vendor/xstate/SOURCE.json').version
  assert.equal(json('ui/package.json').devDependencies.xstate, vendored)
  assert.equal(json('tools/dev/package.json').devDependencies.xstate, vendored)
})

test('every dependency of ui/ is pinned to an exact version', () => {
  for (const [name, v] of Object.entries(json('ui/package.json').devDependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, `${name} ${v}`)
  assert.equal(json('ui/package.json').dependencies, undefined, 'ui/ is development only: its build is committed')
})

test('every name ui/ declares for @studio/nav is one web/nav.js exports', () => {
  const declared = [...read('ui/src/nav/studio-nav.d.ts').matchAll(/^export declare (?:const|function) (\w+)/gm)].map(m => m[1])
  assert.ok(declared.length >= 6)
  for (const name of declared) assert.ok(name in nav, `web/nav.js has no export ${name}`)
  assert.deepEqual([...read('ui/src/nav/studio-nav.d.ts').match(/export type Room = (.*)/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]).sort(), [...nav.ROOMS].sort())
})

test('every name ui/ declares for @studio/clean, @studio/icons and @studio/video is one the web file exports', async () => {
  for (const [dts, file] of [['ui/src/screens/deck/studio-clean.d.ts', '../web/clean.js'], ['ui/src/primitives/studio-icons.d.ts', '../web/icons.js'], ['ui/src/primitives/studio-video.d.ts', '../web/video.js']]) {
    const mod = await import(file)
    const declared = [...read(dts).matchAll(/^export declare (?:const|function) (\w+)/gm)].map(m => m[1])
    assert.ok(declared.length >= 1, dts)
    for (const name of declared) assert.ok(name in mod, `${file} has no export ${name}`)
  }
})

test('ui/ writes the address by the same rules as web/studio.js', () => {
  const studio = read('web/studio.js'), ui = read('ui/src/nav/address.ts')
  const line = (src, start) => src.split('\n').find(l => l.startsWith(start))?.replace(/\(v: View\)/, 'v')
  for (const start of ['const NAV_KEYS = ', 'const place = ']) assert.equal(line(ui, start), line(studio, start), start)
})

test('main and pull requests carry no ui/dist/: only a release commits it (scripts/release-ui.mjs)', () => {
  assert.match(read('ui/.gitignore'), /^dist$/m)
})
