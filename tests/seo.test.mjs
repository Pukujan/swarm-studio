// Every build carries its own SEO (engine/seo.mjs): the planner writes it with the copy,
// the reviewer fixes what fails, the export writes the tags, JSON-LD, share pictures,
// robots.txt, sitemap.xml and a 404 page, and publish writes them again with the address.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSeo, fixSeo, reviewSeo, honestFacts, cleanSeo, fixHtml, seoFromEvents, jsonLd, composeTitle, seoStatic, TITLE_MAX, DESC_MAX, DESC_MIN } from '../engine/seo.mjs'
import { exportRun } from '../engine/export.mjs'
import { routeMessage, seoAsk } from '../web/route.js'

const nav = '<nav class="px-6"><a href="#" data-goto="home" aria-label="Puddle Knight home">Puddle Knight</a><a data-goto="menu">Menu</a></nav>'
const footer = '<footer class="px-6"><p>Rua das Flores 12, Porto · open daily 9:00 to 18:00 · hello@puddle.example</p></footer>'
const hero = '<section><h1>Rain boots for small knights</h1><p>Hand-stitched rubber boots for children aged two to eight, made in Porto and tested in every puddle we could find.</p><img data-gen="a child in yellow boots jumping in a puddle" src="/img/RUN/1.png"></section>'
const menu = '<section><h1>The boot list</h1><p>Every pair on the shelf this winter, in three colours and sizes 20 to 32, each one €48 with free repairs for a year.</p></section><section><h1>Sizes</h1><p>Measure the foot, add a thumb, and pick the size above it; every boot fits a thick sock.</p></section>'

function events(runId) {
  return [
    { type: 'run:start', brief: 'Puddle Knight — rain boots for kids, a shop in Porto', agents: [] },
    { type: 'theme', name: 'Wet Street', vars: { '--background': '#fdf6e3', '--foreground': '#1b1b1b', '--primary': '#f2b705', '--primary-foreground': '#1b1b1b' }, fonts: { heading: 'Fraunces', body: 'Inter' }, radius: '12px' },
    { type: 'page', id: 'home', title: 'Home', purpose: 'The shop front', index: 0 },
    { type: 'page', id: 'menu', title: 'The Book', purpose: 'Every boot we sell', index: 1 },
    { type: 'layer:plan', page: '*', id: 'nav', role: 'navigation' },
    { type: 'layer:plan', page: 'home', id: 'home-hero', role: 'hero' },
    { type: 'layer:plan', page: 'menu', id: 'menu-list', role: 'product-grid' },
    { type: 'layer:plan', page: '*', id: 'footer', role: 'footer' },
    { type: 'layer:done', page: '*', layer: 'nav', html: nav },
    { type: 'layer:done', page: 'home', layer: 'home-hero', html: hero.replace('RUN', runId) },
    { type: 'layer:done', page: 'menu', layer: 'menu-list', html: menu },
    { type: 'layer:done', page: '*', layer: 'footer', html: footer },
    { type: 'seo', page: 'home', title: 'Rain boots for kids in Porto · Puddle Knight', description: 'Hand-stitched rubber rain boots for children aged two to eight, made in Porto and tested in every puddle we could find.', schema: 'Store', lang: 'en',
      facts: { address: 'Rua das Flores 12, Porto', email: 'hello@puddle.example', telephone: '+351 912 345 678', aggregateRating: '4.9' } },
    // the planner gave the second page the same title and no description
    { type: 'seo', page: 'menu', title: 'Rain boots for kids in Porto · Puddle Knight', schema: 'CollectionPage' }
  ]
}

test('the reviewer catches a duplicate title and a missing description, and fixes both', () => {
  const pages = [
    { id: 'home', title: 'Home', purpose: 'The shop front', html: nav + hero, seo: { title: 'Rain boots · Puddle Knight', description: 'Hand-stitched rubber rain boots for children aged two to eight, made in Porto and tested in puddles.' } },
    { id: 'menu', title: 'The Book', purpose: 'Every boot we sell', html: nav + menu, seo: { title: 'Rain boots · Puddle Knight' } }
  ]
  const issues = checkSeo(pages, { brand: 'Puddle Knight' })
  assert.ok(issues.some(i => i.page === 'menu' && i.field === 'title' && /same title/.test(i.problem)))
  assert.ok(issues.some(i => i.page === 'menu' && i.field === 'description' && /no description/.test(i.problem)))
  assert.ok(issues.some(i => i.page === 'menu' && i.field === 'h1' && /2 main headings/.test(i.problem)))
  assert.ok(issues.some(i => i.page === 'home' && i.field === 'alt'))
  const r = reviewSeo(pages, { brand: 'Puddle Knight' })
  assert.deepEqual(r.after, [])
  const t = r.seo.get('menu').title, d = r.seo.get('menu').description
  assert.notEqual(t, r.seo.get('home').title)
  assert.ok(t.length <= TITLE_MAX && t.includes('Puddle Knight'))
  assert.ok(d.length >= DESC_MIN && d.length <= DESC_MAX, d)
  assert.match(d, /Every pair on the shelf/)
  assert.ok(r.changed.includes('menu') && !r.changed.includes('home'))
  assert.ok(r.notes.some(n => /same title/.test(n.text)))
})

test('a long title and description are clipped at a word, a short one is filled from the copy', () => {
  const long = 'x'.repeat(10) + ' word'.repeat(60)
  const { seo } = fixSeo([{ id: 'a', title: 'A', html: menu, seo: { title: `A very long page title that keeps going and going for searching people`, description: long } }], { brand: 'B' })
  assert.ok(seo.get('a').title.length <= TITLE_MAX)
  assert.ok(seo.get('a').description.length <= DESC_MAX)
  assert.equal(composeTitle({ title: 'The boot list', brand: 'Puddle Knight' }), 'The boot list · Puddle Knight')
})

test('structured data carries only what the copy says: no invented ratings, phone numbers or dates', () => {
  const text = 'Rua das Flores 12, Porto. Open 12 June 2027 at the river. €48 a pair.'
  const kept = honestFacts({ address: 'Rua das Flores 12, Porto', telephone: '+351 912 345 678', startDate: '2027-06-12', endDate: '2028-01-01', aggregateRating: '4.9', price: '48', priceCurrency: 'EUR' }, text)
  assert.deepEqual(kept, { address: 'Rua das Flores 12, Porto', startDate: '2027-06-12', price: '48', priceCurrency: 'EUR' })
  assert.equal(cleanSeo({ facts: { reviewCount: '200', ratingValue: '5' } }).facts, undefined)
  // an event whose date the copy does not give is just a page
  const ld = jsonLd({ id: 'x', path: 'x.html', title: 'Night swim', description: 'd', schema: 'Event', facts: { startDate: '2027-07-01' }, text: 'Night swim at the river.' }, { brand: 'B' })
  assert.equal(ld['@type'], 'WebPage')
})

test('one main heading per page and alt text on every picture, fixed in the HTML', () => {
  const { html, notes } = fixHtml(`${nav.replace('<a href', '<h1><a href').replace('</a><a data', '</a></h1><a data')}${menu}<img src="a.jpg">`, { title: 'The Book' })
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<h1>The boot list<\/h1>/)
  assert.match(html, /<h2>Sizes<\/h2>/)
  assert.match(html, /<img alt="The Book" src="a.jpg">/)
  assert.ok(notes.length >= 2)
  assert.equal((fixHtml('<section><h2>Only</h2></section>').html.match(/<h1>Only<\/h1>/) || []).length, 1)
})

test('the person edits win, a cleared field goes back to the crew', () => {
  const m = seoFromEvents([
    { type: 'seo', page: 'home', title: 'Crew title', description: 'Crew description' },
    { type: 'seo', page: 'home', title: 'My title', by: 'person' },
    { type: 'seo', page: 'home', description: '', by: 'person' }
  ])
  assert.equal(m.get('home').title, 'My title')
  assert.equal(m.get('home').description, undefined)
})

test('an exported site has the tags, valid JSON-LD, a sitemap of every page, robots and a 404; publish puts in the address', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'seo-'))
  const runId = 'seo-run', runDir = join(tmp, runId)
  mkdirSync(join(runDir, 'img'), { recursive: true })
  // a tiny real PNG (1x1), so the share picture is a file that exists
  writeFileSync(join(runDir, 'img', '1.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
  const out = await exportRun({ events: events(runId), runId, runDir, sections: [] })
  const dir = join(out.dir, 'html')
  const pages = ['index.html', 'menu.html']
  const titles = new Set()
  for (const f of pages) {
    const html = readFileSync(join(dir, f), 'utf8')
    const title = html.match(/<title>([^<]+)<\/title>/)[1]
    titles.add(title)
    assert.ok(title.includes('Puddle Knight'), title)
    assert.match(html, /<html lang="en">/)
    assert.match(html, /<meta name="description" content="[^"]{70,160}">/)
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:site_name']) assert.match(html, new RegExp(`property="${tag}" content="[^"]+"`), `${f} ${tag}`)
    assert.match(html, /name="twitter:card" content="summary_large_image"/)
    assert.match(html, /<link rel="icon" href="favicon.svg"/)
    const img = html.match(/property="og:image" content="([^"]+)"/)[1]
    assert.ok(existsSync(join(dir, img)), `${f} share image ${img} exists`)
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${f} has one h1`)
    assert.doesNotMatch(html, /<img(?![^>]*\salt="[^"]*\S)[^>]*>/, `${f} has no picture without alt`)
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
    assert.equal(ld['@context'], 'https://schema.org')
    assert.doesNotMatch(JSON.stringify(ld), /rating|review|912 345/i)
    assert.doesNotMatch(html, /rel="canonical"/) // no address yet
  }
  assert.equal(titles.size, 2, 'every page has its own title')
  const home = JSON.parse(readFileSync(join(dir, 'index.html'), 'utf8').match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  const store = home['@graph'].find(x => x['@type'] === 'Store')
  assert.equal(store.address, 'Rua das Flores 12, Porto')
  assert.equal(store.email, 'hello@puddle.example')
  assert.equal(store.telephone, undefined, 'a phone number the copy never says is left out')
  assert.ok(existsSync(join(dir, 'favicon.svg')) && existsSync(join(dir, '404.html')) && existsSync(join(dir, 'robots.txt')))
  assert.match(readFileSync(join(dir, '404.html'), 'utf8'), /noindex/)
  let sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8')
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2)
  assert.ok(existsSync(join(out.dir, 'seo.json')))
  // the React project's page carries the home page's tags
  assert.match(readFileSync(join(out.dir, 'react', 'index.html'), 'utf8'), /property="og:title"/)

  // publish: the real address goes into canonical, og:url, og:image, the sitemap and robots
  out.rebase('https://example.github.io/puddle-knight')
  const menuHtml = readFileSync(join(dir, 'menu.html'), 'utf8')
  assert.match(menuHtml, /<link rel="canonical" href="https:\/\/example.github.io\/puddle-knight\/menu.html">/)
  assert.match(menuHtml, /property="og:url" content="https:\/\/example.github.io\/puddle-knight\/menu.html"/)
  assert.match(menuHtml, /property="og:image" content="https:\/\/example.github.io\/puddle-knight\/img\/share-/)
  assert.equal((menuHtml.match(/<!-- seo -->/g) || []).length, 1, 'written again, not twice')
  sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8')
  assert.match(sitemap, /<loc>https:\/\/example.github.io\/puddle-knight\/<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/example.github.io\/puddle-knight\/menu.html<\/loc>/)
  assert.match(readFileSync(join(dir, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example.github.io\/puddle-knight\/sitemap.xml/)
  assert.match(readFileSync(join(dir, '404.html'), 'utf8'), /<base href="https:\/\/example.github.io\/puddle-knight\/">/)
})

test('an old export without any events gets the same SEO (the Feed samples)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-static-'))
  const page = body => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>The Book</title>\n<style>:root { --primary: #f2b705; --background: #fdf6e3; }</style>\n</head>\n<body>\n${nav}${body}${footer}\n</body>\n</html>\n`
  writeFileSync(join(dir, 'index.html'), page(hero.replace(' src="/img/RUN/1.png"', '')))
  writeFileSync(join(dir, 'menu.html'), page(menu))
  const m = seoStatic(dir, { base: 'https://swarm.design-bakery.com/feed/demos/puddle-knight/' })
  assert.equal(m.brand, 'Puddle Knight')
  assert.equal(new Set(m.pages.map(p => p.title)).size, 2)
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  assert.match(html, /<link rel="canonical" href="https:\/\/swarm.design-bakery.com\/feed\/demos\/puddle-knight\/">/)
  assert.match(html, /<meta name="description" content="Hand-stitched/)
  assert.ok(readdirSync(dir).includes('sitemap.xml'))
})

test('"improve the SEO" in the project chat goes to the crew as an edit, not a new build', () => {
  for (const t of ['improve the SEO', 'write a better description for the menu page', 'target people searching for rain boots in Porto', 'fix the share image', 'better google ranking please'])
    assert.ok(seoAsk(t), t)
  for (const t of ['make the hero darker', 'add a page about our story', 'describe the boots better in the hero']) assert.ok(!seoAsk(t), t)
  assert.equal(routeMessage({ text: 'improve the SEO', run: 'r1', site: true }), 'fix')
  assert.equal(routeMessage({ text: 'add a page about rain', run: 'r1', site: true }), 'extend')
})
