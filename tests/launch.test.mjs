// The launch kit (engine/launch.mjs): written from the product, never before there is something to launch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runFacts, writePosts, pitchOf } from '../engine/launch.mjs'
import { navBrand } from '../engine/naming.mjs'
import { canvasSource } from './canvas-source.mjs'

// the owner's App run (2026-11-12T03-08-56-302Z): page design done, the app step failed, nothing published
const PROMPT = 'full stack saas app for ticket booking, do u wanna grill me first? Accounts: Email sign-in. The admin sees: booking orders members operations. dont build yet lets talk about specifications, i need an air booking api or something?'
const NAV = '<nav class="sticky"><div><!-- Brand --><a href="#" data-goto="search" class="flex"><span class="w-8 h-8">S</span><span class="font-semibold">SkyLedger</span></a><a href="#" data-goto="orders">Orders</a></div></nav>'
const run = (extra = []) => [
  { type: 'run:start', t: 1, run: 'r', brief: PROMPT, agents: [{}, {}, {}, {}, {}, {}, {}, {}] },
  ...['Flight Search', 'Booking Orders', 'Members', 'Operations'].map((title, index) => ({ type: 'page', run: 'r', id: `p${index}`, title, index, purpose: 'x' })),
  { type: 'layer:done', page: '*', layer: 'nav', html: NAV },
  ...Array.from({ length: 26 }, (_, i) => ({ type: 'layer:done', page: 'p0', layer: `l${i}`, html: '<section></section>' })),
  { type: 'auto', prompt: PROMPT, state: 'failed', steps: [{ id: 'design', state: 'done' }, { id: 'app', state: 'failed' }] },
  ...extra
]
const all = posts => posts.flatMap(p => [p.text, ...(p.thread || [])]).join('\n')

test('an App with no published URL: no "is live", no prompt text, no zero counts', () => {
  const f = runFacts(run(), 'r')
  assert.equal(f.name, 'SkyLedger')
  assert.equal(f.url, null)
  const text = all(writePosts(f))
  assert.doesNotMatch(text, /is live|Just launched/i)
  assert.doesNotMatch(text, /grill|do u|dont build|or something|\?/i)
  assert.doesNotMatch(text, /\b0 images\b|26 sections|every page designed/)
  assert.doesNotMatch(text, /Flight Search is/)
  assert.match(text, /What's inside: Flight Search, Booking Orders, Members and Operations\./)
})

test('the planner\'s pitch is used, and "is live" comes only with the live link in the posts', () => {
  const f = runFacts(run([{ type: 'app:deployed', url: 'https://skyledger.vercel.app' }]), 'r', { pitch: 'SkyLedger is a reservations console for small travel agencies.' })
  assert.equal(f.pitch, 'A reservations console for small travel agencies')
  const posts = writePosts(f)
  assert.match(all(posts), /SkyLedger is live|Say hello to SkyLedger|Just launched: SkyLedger/)
  assert.ok(posts.find(p => p.id === 'x').thread.some(t => t.includes('https://skyledger.vercel.app')))
  assert.match(posts.find(p => p.id === 'discord').text, /^\*\*SkyLedger is live!\*\*/)
})

test('without a pitch, only the prompt\'s clauses that say what the product is are kept', () => {
  assert.equal(pitchOf(PROMPT), 'Full stack saas app for ticket booking')
  assert.equal(pitchOf('A tiny ramen bar in Osaka. Make it moody.'), 'A tiny ramen bar in Osaka')
  assert.equal(pitchOf('dont build yet?'), '')
})

test('the nav wordmark names the product; the deck uses the same lines', () => {
  assert.equal(navBrand(NAV), 'SkyLedger')
  assert.equal(navBrand('<nav><a href="#" aria-label="Hopliner home"><svg><text>H</text></svg></a></nav>'), 'Hopliner')
  assert.equal(navBrand('<nav><a href="#"><span>ARES</span> <span>—</span></a></nav>'), 'ARES')
  assert.equal(navBrand('<nav><div>no link</div></nav>'), '')
  // Leaf & Kettle (2026-11-12): the wordmark, then a tagline in the same link
  assert.equal(navBrand('<nav><a href="#" data-goto="home"><span>Leaf &amp; Kettle</span> <span class="text-xs">loose-leaf tea, Portland</span></a></nav>'), 'Leaf & Kettle')
  const canvas = canvasSource()
  const naming = readFileSync(new URL('../engine/naming.mjs', import.meta.url), 'utf8')
  const body = src => src.slice(src.indexOf('// navbrand:start'), src.indexOf('// navbrand:end')).split('\n').slice(1).join('\n').replace(/^export /m, '')
  assert.equal(body(canvas), body(naming))
  assert.match(canvas, /if \(e\.index === 0 && !S\.brand\) setTitle\(e\.title\)/)
})

test('the kit never opens on its own before there is something to launch', () => {
  const canvas = canvasSource()
  const auto = readFileSync(new URL('../engine/auto.mjs', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8')
  // the summary pops up only for a finished job with a live link; a failed or stopped job does not interrupt
  assert.match(canvas, /e\.state === 'done' && e\.url && prev\.run === e\.run\) setTimeout\(\(\) => showSummary/)
  // the kit's entries show only when it is launchable; openLaunch is called from those entries alone
  assert.match(canvas, /const launchable = e => !!\(e\?\.url \|\| e\?\.steps\?\.some\(s => s\.id === 'video' && s\.state === 'done'\)\)/)
  assert.equal((canvas.match(/openLaunch\(e\.run\)/g) || []).length, 2)
  assert.match(canvas, /\$\{launchable\(e\) \? `<button class="ap-kit">/)
  // the server refuses to write one, and the Auto launch step skips, with nothing live
  assert.match(server, /if \(!launchable\(runFacts\(events, id\)\)\) throw/)
  assert.match(auto, /nothing to launch yet: no live link/)
})

test('with a story, the posts are written from it: its hook, what it is, its moments and how it was made', async () => {
  const { rulesStory, storyFacts } = await import('../engine/story.mjs')
  const events = [
    { type: 'run:start', t: 1, brief: 'do u wanna grill me first? a supper club called Saffron & Smoke', title: 'Saffron & Smoke', agents: [{ id: 'a' }, { id: 'b' }] },
    { type: 'page', id: 'home', title: 'Saffron & Smoke', index: 0 },
    { type: 'page', id: 'menu', title: "Tonight's Menu", index: 1 },
    { type: 'layer:done', page: 'menu', layer: 'hero', html: '<section><h2>Cooked once, eaten late</h2><p>Seven plates, one fire.</p></section>' }
  ]
  const story = rulesStory(storyFacts(events, 'r1', { brand: { story: { what: 'A late-night supper club in Lisbon', who: '' } } }))
  const posts = writePosts(runFacts(events, 'r1'), story)
  const x = posts.find(p => p.id === 'x')
  assert.match(x.thread[0], /^Meet Saffron( & Smoke)?\. A late-night supper club in Lisbon\./)
  assert.ok(x.thread.some(s => /Cooked once, eaten late: Seven plates, one fire\./.test(s)), x.thread.join(' | '))
  assert.ok(x.thread.some(s => /Planned, designed and built by 2 AI agents/.test(s)))
  for (const p of posts) assert.doesNotMatch(p.thread ? p.thread.join(' ') : p.text, /grill|\blive\b/i, p.id)
})

test('each network gets the story card in its shape: tall for TikTok and Instagram, square for Threads, wide for the rest', async () => {
  const { cardFor } = await import('../engine/launch.mjs')
  const media = ['tall-b3', 'tall-b1', 'square-b3', 'wide-b3'].map(n => ({ kind: 'image', src: `/story/r1/${n}.jpg`, shape: n.split('-')[0] }))
  assert.deepEqual(cardFor('tiktok', media), { shape: 'tall', src: '/story/r1/tall-b3.jpg' }, 'the first in beat order, the hook')
  assert.equal(cardFor('threads', media).shape, 'square')
  assert.equal(cardFor('x', media).shape, 'wide')
  assert.equal(cardFor('linkedin', media.slice(0, 2)).shape, 'tall', 'a missing shape falls back to the phone card')
  assert.equal(cardFor('x', [{ kind: 'image', src: '/img/r1/1.png' }]), null, 'no story, no card')
})
