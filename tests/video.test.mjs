import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composition, SHAPES } from '../engine/video.mjs'
import { checkLook, LAYOUTS } from '../engine/look.mjs'

const c = {
  brand: 'Lume', brief: 'a coffee roaster', theme: {},
  images: [1, 2, 3, 4].map(n => ({ n, name: `p${n}.webp`, gen: '', page: 'home', file: '' })),
  clips: [{ n: 1, name: 'c1.mp4', what: 'a scroll', label: 'Live', seconds: 10, from: 0, file: '' }],
}
const scenes = () => Object.assign([
  { kind: 'open', headline: 'Lume', sub: 'Coffee from Porto' },
  { kind: 'clip', clip: 1, from: 0, headline: 'See it live', kicker: 'Live' },
  { kind: 'image', image: 1, headline: 'Roasted this week' },
  { kind: 'split', image: 2, headline: 'From the farm', sub: 'Three origins' },
  { kind: 'mosaic', images: [3, 4], headline: 'The shop' },
  { kind: 'list', headline: 'Inside', items: ['Beans', 'Brewing', 'Classes'] },
  { kind: 'cta', headline: 'Come and see', sub: 'Visit the site' },
], { fx: [] })

test('one storyboard makes a wide and a tall film of the same length and look', () => {
  const s = scenes()
  s.look = checkLook({ layout: 'classic' }, 3)
  const wide = composition(s, c, [], 'wipe')
  const tall = composition(s, c, [], 'wipe', wide.look, { shape: 'tall' })
  assert.equal(wide.shape, 'wide')
  assert.equal(tall.shape, 'tall')
  assert.equal(tall.seconds, wide.seconds)
  assert.deepEqual(tall.look, wide.look)
  assert.match(wide.html, /data-width="1920" data-height="1080"/)
  assert.match(tall.html, /data-width="1080" data-height="1920"/)
  assert.equal(SHAPES.wide.file, 'promo.mp4')
  assert.equal(SHAPES.tall.file, 'promo-tall.mp4')
})

test('the tall film is laid out again, not cropped or letterboxed', () => {
  const s = scenes()
  s.look = checkLook({ layout: 'classic' }, 3)
  const tall = composition(s, c, [], 'wipe', s.look, { shape: 'tall' }).html
  assert.match(tall, /<body class="[^"]* T">/)
  // the split's picture grows down from the top instead of in from the side
  assert.match(tall, /tl\.fromTo\('#s3p', \{height:0\}/)
  // the list stacks in one column
  assert.match(tall, /\.T \.list ol\{[^}]*grid-template-columns:1fr/)
  // mosaic tiles fit inside the tall frame
  for (const m of tall.matchAll(/class="tile"[^>]*style="left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px/g)) {
    const [x, y, w, h] = m.slice(1).map(Number)
    assert.ok(x + w <= 1080 && y + h <= 1920, `tile ${m[0]} leaves the frame`)
  }
})

test('every layout family has a tall frame that composes', () => {
  for (const layout of Object.keys(LAYOUTS)) {
    const s = scenes()
    s.look = checkLook({ layout }, 11)
    const html = composition(s, c, [], 'wipe', s.look, { shape: 'tall' }).html
    assert.match(html, new RegExp(`L-${layout} `))
    assert.ok(!/NaN|undefined/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), `${layout} has NaN or undefined in its markup`)
  }
})

test('a build whose pictures were never logged as events still gives the film its pictures', async () => {
  const { collect } = await import('../engine/video.mjs')
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const d = mkdtempSync(join(tmpdir(), 'collect-'))
  mkdirSync(join(d, 'img'))
  for (const f of ['2.png', '10.png', '1.png', 'video-x.png', 'notes.txt']) writeFileSync(join(d, 'img', f), 'x')
  const c = collect([{ type: 'run:start', brief: 'a wine bar' }, { type: 'page', id: 'home', title: 'Tidepool' }], d)
  assert.deepEqual(c.images.map(i => i.file.split(/[\\/]/).pop()), ['1.png', '2.png', '10.png'])
})

test('a build with no pictures: the film is signed with the site\'s name, and its pages\' shots become its pictures', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  const { screenStills, collect } = await import('../engine/video.mjs')
  const d = mkdtempSync(join(tmpdir(), 'stills-'))
  const events = [
    { type: 'run:start', brief: 'A portfolio for a photographer' },
    { type: 'page', id: 'home', title: 'Home', purpose: 'Show the work' }, { type: 'page', id: 'about', title: 'About' },
    { type: 'layer:done', page: '*', layer: 'nav', html: '<nav><a href="#" data-goto="home" aria-label="Mara Voss Photo home">Mara Voss Photo</a><a data-goto="about">About</a></nav>' }
  ]
  const c = collect(events, d)
  // not the first page's title
  assert.equal(c.brand, 'Mara Voss Photo')
  assert.equal(c.images.length, 0)
  // no ffmpeg on this machine: nothing to cut with, and nothing breaks
  assert.equal((await screenStills(c, events, d, '')).images.length, 0)
  let ffmpeg = ''
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpeg = 'ffmpeg' } catch { return }
  mkdirSync(join(d, 'story', 'screens'), { recursive: true })
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=768x1956', '-frames:v', '1', join(d, 'story', 'screens', 'home-desktop.jpg')])
  await screenStills(c, events, d, ffmpeg)
  // the page with a shot is a picture now, wide; the page with none is left out
  assert.deepEqual(c.images.map(i => [i.n, i.page, i.screen]), [[1, 'home', true]])
  assert.match(c.images[0].gen, /Home page of the finished site/)
  assert.ok(existsSync(join(d, 'img', 'video-screen-home.jpg')))
  // a build that has pictures keeps them: no shots are added
  const own = { images: [{ n: 1 }], clips: [] }
  assert.equal((await screenStills(own, events, d, ffmpeg)).images.length, 1)
})
