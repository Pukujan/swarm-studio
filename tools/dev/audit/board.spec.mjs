// The image-first board's one relation that only a browser can check (decision 0019; spec 43 §2.5; the rest are
// ui/test/board.props.test.mjs): a page that goes live, back to a photo and live again draws the same, within a small
// pixel tolerance. On the Design deck at /next/ with ?board=tiers: pick a page (live), pick another (the first drops
// back), pick it again, and compare the two live pictures of it.
import { test as base, expect } from '@playwright/test'
import { studio } from '../../../scripts/walkthrough-fixtures.mjs'

// how many pixels may differ between the two live pictures (anti-aliasing, a caret), of 1280 × ~360
const TOLERANCE = 400

const test = base.extend({
  studio: [async ({}, use) => {
    const s = await studio()
    await s.api('/api/setup', { seen: true })
    await use(s)
    s.stop()
  }, { scope: 'worker' }]
})

// the differing pixels of two PNG pictures, counted in the page (no image library needed)
const diff = (page, a, b) => page.evaluate(async ([x, y]) => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src })
  const [ia, ib] = await Promise.all([load(x), load(y)])
  const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
  const px = img => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data }
  const da = px(ia), db = px(ib)
  let n = 0
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++
  return n + Math.abs(ia.width * ia.height - ib.width * ib.height)
}, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`])

test('a page live, then a photo, then live again draws the same', async ({ page, studio: s }, info) => {
  test.skip(info.project.name !== '1440', 'one width is enough for a drawing')
  await page.goto(`${s.BASE}/next/?version=${s.ids.site}&room=deck&board=tiers`)
  const live = page.locator('[data-page="plans"][data-tier="live"] .opacity-100 iframe')
  const pick = name => page.getByText(name, { exact: true }).first().click()
  await page.getByText('Plans', { exact: true }).first().waitFor()

  await pick('Plans')
  await live.waitFor({ timeout: 15_000 })
  // the same camera for both pictures: ⇧1 fits every page
  await page.keyboard.press('Shift+Digit1')
  await page.waitForTimeout(800)
  const first = await live.screenshot()

  // another page picked: Plans drops back to its photo (after the tier delay), and its frame is removed
  await pick('About')
  await expect(page.locator('[data-page="plans"] iframe')).toHaveCount(0, { timeout: 5_000 })

  await pick('Plans')
  await live.waitFor({ timeout: 15_000 })
  // the same camera for both pictures: ⇧1 fits every page
  await page.keyboard.press('Shift+Digit1')
  await page.waitForTimeout(800)
  const again = await live.screenshot()

  expect(await diff(page, first, again)).toBeLessThanOrEqual(TOLERANCE)
})
