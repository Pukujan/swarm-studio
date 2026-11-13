// The next UI (ui/, docs/decisions/0013-react-ui-coexists.md): /next/ is one document with the token put in at
// serve time, both apps run the same XState on the same machine and address, and every dependency is pinned.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextPage } from '../server/next.mjs'
import * as nav from '../web/nav.js'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const json = f => JSON.parse(read(f))
const dist = new URL('../ui/dist', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')

test('/next/ is one document: its script and styles inline, nothing left to load from /next/assets/', () => {
  const page = nextPage(dist, { token: 'k' })
  assert.match(page, /<title>Swarm Studio<\/title>/)
  assert.match(page, /<div id="root"><\/div>/)
  assert.match(page, /<script type="module">/)
  assert.match(page, /<style>/)
  assert.doesNotMatch(page, /(src|href)="\/next\//)
})

test('the token goes into the page at serve time, escaped, and never into ui/dist/', () => {
  const page = nextPage(dist, { token: 'a</script><b>' })
  assert.ok(page.includes('window.SWARM = {"token":"a\\u003c/script>\\u003cb>","version":"'))
  assert.ok(read('ui/dist/index.html').includes('<!-- swarm:boot -->'))
  // the build reads the token from window.SWARM at run time; it never holds one, or sets window.SWARM itself
  const js = read('ui/dist/assets/next.js')
  assert.ok(!/window\.SWARM\s*=[^=]/.test(js) && !/"token"\s*:\s*"[^"]/.test(js))
  assert.match(js, /window\.SWARM\?\.token/)
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

test('ui/ writes the address by the same rules as web/studio.js', () => {
  const studio = read('web/studio.js'), ui = read('ui/src/nav/address.ts')
  const line = (src, start) => src.split('\n').find(l => l.startsWith(start))?.replace(/\(v: View\)/, 'v')
  for (const start of ['const NAV_KEYS = ', 'const place = ']) assert.equal(line(ui, start), line(studio, start), start)
})
