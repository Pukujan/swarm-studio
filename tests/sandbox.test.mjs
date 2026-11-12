// Generated pages are sandboxed (Nous catalog review, point 4). The real-browser half of this is
// scripts/sandbox-check.mjs (run in CI); this half keeps the sources from drifting back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = f => readFileSync(`${root}${f}`, 'utf8')
const web = readdirSync(`${root}web`).filter(f => /\.(js|html)$/.test(f))

test('every frame that shows a generated page is sandboxed without allow-same-origin', () => {
  const canvas = read('web/canvas.js')
  assert.match(canvas, /const FRAME_SANDBOX = 'allow-scripts'\n/)
  // each frame the canvas makes gets its sandbox before it loads
  const made = canvas.split("document.createElement('iframe')").slice(1)
  assert.ok(made.length >= 3)
  for (const after of made) assert.match(after.slice(0, 200), /setAttribute\('sandbox', FRAME_SANDBOX\)/)
  // the page frames, from the frame template
  assert.equal((canvas.match(/iframe\.setAttribute\('sandbox', FRAME_SANDBOX\)\n {2}(iframe\.style|if \(BOOT\.frameHtml\))/g) || []).length, 2)
  // every <iframe> in markup has a sandbox, except the wall's tiles, which show the studio itself
  for (const f of web) {
    for (const tag of read(`web/${f}`).match(/<iframe\b[^>]*>/g) || []) {
      if (f === 'wall.html') continue
      assert.match(tag, /\ssandbox="allow-scripts[^"]*"/, `${f}: ${tag.slice(0, 80)}`)
      assert.doesNotMatch(tag, /allow-same-origin/, `${f}: ${tag.slice(0, 80)}`)
    }
  }
  // allow-same-origin is granted in one place (a string, not a comment): the app preview, only while it is another origin
  const same = web.flatMap(f => (read(`web/${f}`).match(/['"`][^'"`\n]*allow-same-origin/g) || []).map(() => f))
  assert.deepEqual(same, ['canvas.js'])
  assert.match(canvas, /new URL\(src, location\.href\)\.origin === location\.origin/)
})

test('clean() works on the parsed DOM, not on regexes over the text', () => {
  const clean = read('web/clean.js')
  assert.match(clean, /createElement\('template'\)/)
  assert.match(clean, /querySelectorAll\('script'\)/)
  assert.match(clean, /name\.startsWith\('on'\)/)
  assert.doesNotMatch(clean, /replace\(\/<script/)
  const canvas = read('web/canvas.js')
  assert.match(canvas, /import \{ clean \} from '\.\/clean\.js'/)
  assert.doesNotMatch(canvas, /function clean\(/)
  assert.match(read('server/page.mjs'), /'clean\.js', ('canvas\/[\w.-]+', )*'canvas\.js'/, 'the inlined studio carries clean.js before canvas.js')
})

test('/site/ and /video/…/live/ are served with a sandbox CSP', () => {
  const server = read('server/server.mjs')
  assert.match(server, /const SITE_CSP = 'sandbox allow-scripts'/)
  const site = server.slice(server.indexOf("const site = url.pathname.match(/^\\/site\\/"), server.indexOf('const live = url.pathname.match'))
  assert.match(site, /'content-security-policy': SITE_CSP/)
  const live = server.slice(server.indexOf('const live = url.pathname.match'), server.indexOf('const vid = url.pathname.match'))
  assert.match(live, /'content-security-policy': SITE_CSP/)
  assert.ok(read('.github/workflows/checks.yml').includes('node scripts/sandbox-check.mjs'))
})
