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
