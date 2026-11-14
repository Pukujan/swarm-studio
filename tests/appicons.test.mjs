// A built app or site carries its own marks, never Dyad's (the app template's favicon, title,
// "Made with Dyad" line and placeholder) and never Swarm's (engine/seo.mjs ownAppBrand).
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedProject, exportRun } from '../engine/export.mjs'
import { shareApp, faviconSvg, DYAD_FAVICON_SHA1 } from '../engine/seo.mjs'

const scaffold = fileURLToPath(new URL('../dyad/scaffold/', import.meta.url))
const sha1 = f => createHash('sha1').update(readFileSync(f)).digest('hex')
function* files(dir) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git') continue
    const f = join(dir, n)
    if (statSync(f).isDirectory()) yield* files(f)
    else yield f
  }
}
const noDyadFile = dir => { for (const f of files(dir)) assert.notEqual(sha1(f), DYAD_FAVICON_SHA1, `${f} is Dyad's favicon`) }

test('the template still ships Dyad\'s favicon (so the checks below mean something)', () => {
  assert.equal(sha1(join(scaffold, 'public', 'favicon.ico')), DYAD_FAVICON_SHA1)
})

test('a freshly scaffolded app has its own icons and title, and nothing of Dyad\'s a visitor sees', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'app-')), 'app')
  seedProject(scaffold, dir, 'Amber Ascent', { vars: { '--primary': '#c2410c', '--primary-foreground': '#fff7ed' } })
  noDyadFile(dir)
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  assert.doesNotMatch(html, /dyad/i)
  assert.match(html, /<title>Amber Ascent<\/title>/)
  assert.match(html, /<link rel="icon" href="\/favicon.svg"/)
  assert.match(readFileSync(join(dir, 'public', 'favicon.svg'), 'utf8'), /fill="#c2410c"[\s\S]*>A<\/text>/)
  if (existsSync(join(dir, 'public', 'favicon.ico'))) assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon.png"/)
  assert.doesNotMatch(readFileSync(join(dir, 'src', 'components', 'made-with-dyad.tsx'), 'utf8'), /Made with Dyad|dyad\.sh/)
  assert.doesNotMatch(readFileSync(join(dir, 'public', 'placeholder.svg'), 'utf8'), /#EAEAEA/)
  assert.doesNotMatch(readFileSync(join(dir, 'README.md'), 'utf8'), /dyad/i)
})

test('an app made before this loses Dyad\'s marks when it is deployed again', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'old-app-')), 'app')
  cpSync(scaffold, dir, { recursive: true, filter: f => !/node_modules/.test(f) })
  shareApp(dir, { name: 'Search Flights', description: 'Find a cheap flight from Porto in a few taps, with prices that include the bags.' })
  noDyadFile(dir)
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  assert.doesNotMatch(html, /dyad/i)
  assert.match(html, /<title>Search Flights<\/title>/)
  assert.match(html, /property="og:title" content="Search Flights"/)
  assert.equal((html.match(/rel="icon" href="\/favicon.svg"/g) || []).length, 1, 'one icon link')
})

test('with no name the icon is a plain neutral square: no letter, not Swarm\'s mark', () => {
  const svg = faviconSvg({ brand: '' })
  assert.doesNotMatch(svg, /<text/)
  assert.match(faviconSvg({ brand: 'Brasa' }), />B<\/text>/)
})

test('an exported site has no Dyad file and no default icon', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'site-'))
  const events = [
    { type: 'run:start', brief: 'Brasa, a ramen bar in Porto', agents: [] },
    { type: 'theme', name: 'Ember', vars: { '--background': '#0b0b0b', '--foreground': '#f5f5f5', '--primary': '#f2c12e', '--primary-foreground': '#111111' }, fonts: { heading: 'Inter', body: 'Inter' } },
    { type: 'page', id: 'home', title: 'Home', purpose: 'The front door', index: 0 },
    { type: 'layer:plan', page: 'home', id: 'home-hero', role: 'hero' },
    { type: 'layer:done', page: 'home', layer: 'home-hero', html: '<section><h1>Brasa</h1><p>Ramen on Rua das Flores, Porto, open Tuesday to Sunday from noon to ten at night.</p></section>' }
  ]
  const out = await exportRun({ events, runId: 'r', runDir: join(tmp, 'r'), sections: [] })
  noDyadFile(out.dir)
  for (const f of files(out.dir)) if (/\.html$/.test(f)) assert.doesNotMatch(readFileSync(f, 'utf8'), /dyad/i, f)
  const home = readFileSync(join(out.dir, 'html', 'index.html'), 'utf8')
  assert.match(home, /<link rel="icon" href="favicon.svg"/)
  assert.match(readFileSync(join(out.dir, 'html', 'favicon.svg'), 'utf8'), />B<\/text>/)
})
