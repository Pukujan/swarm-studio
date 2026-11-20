// The brand sheet (docs/specs/31-brand-sheet.md). The Night Runner colour fault: the rat-site brief named
// cream, warm grey, terracotta and forest green, and the site came out green and pink. A locked sheet is
// the build's theme as it is, and the reviewer's check says so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandOptions, fallbackOptions, paletteFromWords, brandTheme, checkBrand, contrast, brandBrief } from '../engine/brand.mjs'
import { missingColours } from '../engine/pagetype.mjs'
import { runSwarm } from '../engine/run.mjs'
import { chatStore } from '../engine/chats.mjs'
import { brandRoutes, lockedBrand } from '../server/brand.mjs'

const REDO = 'Build a website for NYC rat lovers and care communities: a soft, editorial look in cream, warm grey, muted terracotta, and deep forest green. It serves rat owners and enthusiasts with a community hub (posts, meetups) plus care guides (feeding, health, vets).'
const NIGHT_PRESS = { name: 'Night Press', vars: { '--background': '#176328', '--foreground': '#fbf9f6', '--primary': '#f04ccd', '--accent': '#f04ccd' }, fonts: { heading: 'Playfair Display', body: 'Inter' } }

test('the words a person says become a palette that reads: a cream ground, terracotta and forest green', () => {
  const p = paletteFromWords(REDO)
  assert.equal(p.bg, '#f6f0e4')
  assert.deepEqual(missingColours(REDO, { '--background': p.bg, '--foreground': p.text, '--primary': p.accent, '--accent': p.link }), [])
  assert.ok(contrast(p.text, p.bg) >= 7)
  assert.ok(contrast(p.link, p.bg) >= 4.5)
  assert.equal(paletteFromWords('a bakery site'), null)
  // a colour they do not want is not used
  assert.ok(!/#c85584/.test(JSON.stringify(paletteFromWords('cream and green, no pink'))))
})

test('with no model the board still has three palettes and three pairings, the named colours first', () => {
  const o = fallbackOptions(REDO)
  assert.equal(o.palettes.length, 3)
  assert.equal(o.types.length, 3)
  assert.equal(o.palettes[0].bg, '#f6f0e4')
  assert.equal(new Set(o.palettes.map(p => `${p.bg}${p.accent}`)).size, 3)
  assert.match(o.story.what, /^A website for NYC rat lovers/)
})

test('a model that loses the named colours does not win: the words\' palette goes first', async () => {
  const chat = async () => JSON.stringify({
    story: { what: 'A rat lovers hub', who: 'NYC rat owners', pages: ['Home', 'Care guides', 'Meetups'] },
    palettes: [{ name: 'Neon', bg: '#000000', text: '#ffffff', accent: '#ff00ff', link: '#00ffff' }, { name: 'Mint', bg: '#e8fff4', text: '#102018', accent: '#10a060', link: '#106040' }],
    types: [{ name: 'Soft', heading: 'Fraunces', body: 'Inter' }, { name: 'bad', heading: '<script>', body: 'x' }]
  })
  const o = await brandOptions({ brief: REDO, chat })
  assert.deepEqual(o.palettes.map(p => p.id), ['p1', 'p2', 'p3'])
  assert.equal(o.palettes[0].bg, '#f6f0e4')
  assert.deepEqual(o.story.pages, ['Home', 'Care guides', 'Meetups'])
  assert.equal(o.types[0].heading, 'Fraunces')
  assert.ok(!o.types.some(t => /script/.test(t.heading)))
  // a reply that is not JSON: the built-in board
  const off = await brandOptions({ brief: REDO, chat: async () => 'sure! here are some ideas' })
  assert.equal(off.palettes[0].bg, '#f6f0e4')
})

test('the locked sheet is a full theme, and the reviewer finds what a theme lost', () => {
  const o = fallbackOptions(REDO)
  const brand = { ...o, palettes: o.palettes.map((p, i) => ({ ...p, id: `p${i + 1}` })), types: o.types.map((t, i) => ({ ...t, id: `t${i + 1}` })), pick: { palette: 'p1', type: 't1' } }
  const th = brandTheme(brand)
  for (const k of ['--background', '--foreground', '--primary', '--primary-foreground', '--muted', '--muted-foreground', '--border', '--accent', '--card']) assert.match(th.vars[k], /^#[0-9a-f]{6}$/, k)
  assert.deepEqual(checkBrand(th, th), { off: [], fonts: false })
  assert.deepEqual(checkBrand(NIGHT_PRESS, th).off, ['--background', '--foreground', '--primary', '--accent'])
  assert.match(brandBrief(brand), /look is locked/)
  assert.equal(brandTheme({ ...brand, pick: {} }), null)
})

const sse = text => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`)); c.close() } }), { status: 200 })

test('a build with a locked sheet: the planner\'s own theme is replaced, a cream site, checked', async () => {
  const o = fallbackOptions(REDO)
  const brand = { ...o, palettes: o.palettes.map((p, i) => ({ ...p, id: `p${i + 1}` })), types: o.types.map((t, i) => ({ ...t, id: `t${i + 1}` })), pick: { palette: 'p1', type: 't1' } }
  const locked = { theme: brandTheme(brand), brief: brandBrief(brand) }
  const realFetch = globalThis.fetch
  let sitemapAsk = '', themeCalls = 0
  globalThis.fetch = async (url, init) => {
    const m = JSON.parse(init.body).messages, sys = m[0].content
    if (sys.startsWith('You are the lead designer')) { sitemapAsk = m[1].content; return sse([JSON.stringify({ type: 'theme', ...NIGHT_PRESS }), '{"type":"page","id":"home","title":"Home","purpose":"x"}'].join('\n') + '\n') }
    if (sys.startsWith("You set a website's theme")) themeCalls++
    if (sys.startsWith('You are a page planner')) return sse('{"type":"layer","page":"home","id":"home-hero","role":"hero","content":"Hi","links":[],"height":300}')
    return sse('<section>b</section>')
  }
  const events = []
  try {
    const { plan } = await runSwarm({ provider: { baseUrl: 'http://fake', apiKey: 'k' }, brief: REDO, brand: locked, agents: 2, plannerModel: 'p', workerModel: 'w', emit: (type, data) => events.push({ type, ...data }) })
    assert.equal(plan.theme.vars['--background'], '#f6f0e4')
    assert.equal(plan.theme.fonts.heading, locked.theme.fonts.heading)
    assert.match(sitemapAsk, /The look is locked/)
    assert.doesNotMatch(sitemapAsk, /Required for this build's theme/)
    assert.equal(themeCalls, 0)
    const check = events.find(e => e.type === 'theme:check')
    assert.deepEqual(check.brand, { off: [], fonts: false })
    assert.deepEqual(check.missing, [])
    assert.ok(events.filter(e => e.type === 'theme').every(e => e.by === 'brand'))
  } finally {
    globalThis.fetch = realFetch
  }
})

// the routes, on a real chat store in a throwaway folder
function call(routes, method, path, body) {
  return new Promise(resolve => {
    const handlers = {}
    const req = { method, on: (ev, fn) => { handlers[ev] = fn; if (ev === 'end') queueMicrotask(() => { handlers.data?.(JSON.stringify(body || {})); fn() }) }, destroy() {} }
    const res = { writeHead(code) { this.code = code; return this }, end(s) { resolve({ code: this.code, body: JSON.parse(s) }) } }
    routes(req, res, new URL(`http://x${path}`))
  })
}

test('the routes: options on a new chat, own words picked, Lock gives the build its look, a change unlocks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-'))
  try {
    const chats = chatStore(dir)
    const routes = brandRoutes({ chats })
    const made = await call(routes, 'POST', '/api/brand', { brief: REDO, kind: 'site' })
    assert.equal(made.code, 200)
    const id = made.body.chat
    assert.equal(made.body.brand.palettes.length, 3)
    assert.equal(lockedBrand(chats, id), null)
    const own = await call(routes, 'POST', `/api/brand/${id}/pick`, { part: 'palette', words: 'ivory, charcoal and rust' })
    assert.equal(own.body.brand.pick.palette, 'pw1')
    assert.equal((await call(routes, 'POST', `/api/brand/${id}/pick`, { part: 'palette', words: 'something nice' })).code, 400)
    await call(routes, 'POST', `/api/brand/${id}/pick`, { part: 'palette', id: 'p1' })
    const lk = await call(routes, 'POST', `/api/brand/${id}/lock`)
    assert.ok(lk.body.brand.lockedAt)
    assert.equal(lockedBrand(chats, id).theme.vars['--background'], '#f6f0e4')
    // the same brief again keeps the sheet as it is
    assert.ok((await call(routes, 'POST', '/api/brand', { chat: id, brief: REDO })).body.brand.lockedAt)
    const ed = await call(routes, 'POST', `/api/brand/${id}/edit`, { part: 'palette', id: 'p1', values: { accent: '#9a3f2a' } })
    assert.equal(ed.body.brand.lockedAt, null)
    assert.equal(lockedBrand(chats, id), null)
    assert.equal((await call(routes, 'GET', '/api/brand/c-0000000000')).code, 404)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('brands.refresh: a new brief makes an unlocked project sheet again, keeps what the person did, and leaves a locked one alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-refresh-'))
  try {
    const { studioStore } = await import('../engine/studio.mjs')
    const chats = chatStore(dir)
    const studios = studioStore({ projectsDir: join(dir, 'projects') })
    studios.make('p1', { kind: 'site', idea: 'hermes website' })
    const routes = brandRoutes({ chats, projectBrands: studios.brands })
    // no sheet yet: nothing to make again
    assert.equal(await routes.refresh('p1', 'anything'), null)
    await call(routes, 'POST', '/api/projects/p1/brand', { brief: 'hermes website', kind: 'site' })
    assert.equal(studios.brands.get('p1').brand.brief, 'hermes website')
    // the same brief changes nothing
    assert.equal(await routes.refresh('p1', 'hermes website'), null)
    // what the person did on the sheet: a story line typed, and a pack picked whole
    await call(routes, 'POST', '/api/projects/p1/brand/edit', { part: 'story', values: { who: 'People who run agents' } })
    const slug = studios.brands.get('p1') && (await call(routes, 'GET', '/api/projects/p1/brand')).body.packs[0].slug
    await call(routes, 'POST', '/api/projects/p1/brand/pick', { part: 'pack', id: slug })
    const before = studios.brands.get('p1').brand
    assert.equal(before.pack, slug)
    // a new brief: the sheet is made for it, and those stay
    const refreshed = await routes.refresh('p1', 'Hermes Agent by Nous Research — dark developer website for an AI agent')
    assert.match(refreshed.brand.brief, /Nous Research/)
    assert.match(refreshed.brand.story.what, /Nous Research|Hermes Agent/i)
    assert.equal(refreshed.brand.story.who, 'People who run agents')
    assert.equal(refreshed.brand.pack, slug)
    assert.equal(refreshed.brand.pick.palette, `k-${slug}`)
    assert.equal(refreshed.brand.pick.type, `k-${slug}`)
    assert.equal(refreshed.brand.radius, before.radius)
    assert.deepEqual(refreshed.brand.voice, before.voice)
    assert.deepEqual(refreshed.brand.pictures, before.pictures)
    // locked: a new brief never overwrites it
    await call(routes, 'POST', '/api/projects/p1/brand/lock')
    assert.equal(await routes.refresh('p1', 'Something completely different'), null)
    assert.match(studios.brands.get('p1').brand.brief, /Nous Research/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Studio project\'s build uses the look the person chose without Lock; a sheet nobody touched, or a skipped Brand step, is not used', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-chosen-'))
  try {
    const { studioStore } = await import('../engine/studio.mjs')
    const chats = chatStore(dir)
    const studios = studioStore({ projectsDir: join(dir, 'projects') })
    studios.make('p1', { kind: 'site', idea: 'A portfolio for a photographer' })
    const routes = brandRoutes({ chats, projectBrands: studios.brands })
    const made = (await call(routes, 'POST', '/api/projects/p1/brand', { brief: 'A portfolio for a photographer', kind: 'site' })).body
    // made, never touched: a guess, so the planner picks the look
    assert.equal(lockedBrand(studios.brands, 'p1'), null)
    // an option picked, no Lock: the build gets that look
    const slug = made.packs[0].slug
    await call(routes, 'POST', '/api/projects/p1/brand/pick', { part: 'pack', id: slug })
    const b = studios.brands.get('p1').brand
    assert.equal(b.lockedAt, null)
    const used = lockedBrand(studios.brands, 'p1')
    assert.equal(used.theme.vars['--background'], b.palettes.find(x => x.id === b.pick.palette).bg)
    // the step skipped: the person said not to use it
    await studios.step('p1', 'brand', 'skipped')
    assert.equal(lockedBrand(studios.brands, 'p1'), null)
    // a loose chat's sheet still needs Lock, picked or not
    const loose = (await call(routes, 'POST', '/api/brand', { brief: 'A portfolio for a photographer', kind: 'site' })).body
    await call(routes, 'POST', `/api/brand/${loose.chat}/pick`, { part: 'pack', id: slug })
    assert.equal(lockedBrand(chats, loose.chat), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the page inlines every module the studio imports, and the sheet\'s styles', async () => {
  const { readFileSync } = await import('node:fs')
  const studio = readFileSync(new URL('../web/studio.js', import.meta.url), 'utf8'), page = readFileSync(new URL('../server/page.mjs', import.meta.url), 'utf8')
  for (const [, f] of studio.matchAll(/from '\.\/([\w-]+\.js)'/g)) assert.match(page, new RegExp(`'${f.replace('.', '\\.')}'`), f)
  assert.match(page, /read\('brand\.css'\)/)
})

test('every web module parses (a slip there only shows in the browser)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const dir = new URL('../web/', import.meta.url)
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(new URL(f, dir)) })
  }
})
