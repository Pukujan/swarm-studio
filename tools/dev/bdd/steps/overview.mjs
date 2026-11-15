// The Overview (openspec/specs/overview/spec.md) beyond its machine gates (#461): the name menu's versions, the
// skeleton of a page being built, an empty version, a page into the Design deck, Esc out of a room, the inspector and
// the Files sheet at 390. The same steps read both Studios by what a person sees (a page's name, a label, a line).
// A state the test Studio does not have (three versions, a version with nothing built) is the server's own answer
// for that page only; the half-built Cedar Cafe is the test Studio's own (its "Menu" page has 2 of 3 sections built).
import { bind, problems, reshape, seedSnapshots, step, threeVersions } from '../kit.mjs'

const SITE = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}?project=${studio.ids.site}&version=${studio.ids.site2}`
const MID = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}?project=${studio.ids.mid}&version=${studio.ids.mid}`
const phone = page => page.setViewportSize({ width: 390, height: 844 })
const desktop = page => page.setViewportSize({ width: 1440, height: 900 })
// a page's artboard on the stage (each Studio draws it with its own classes; the row in the Files list has the key too)
const artboard = (page, key) => page.locator(`.ab.page[data-key="${key}"], .ov-ab.page[data-key="${key}"]`).first()
const crumbName = (page, name) => page.locator('nav[aria-label="Breadcrumb" i] button, .pj-crumb .pj-name').filter({ hasText: name }).first()
const inspector = page => page.locator('aside[aria-label="Inspector"]').filter({ visible: true })
// where the address is, without the Studio's own host
const where = (page, studio) => page.url().replace(studio.BASE, '')
const roomOf = u => new URL(u, 'http://x').searchParams.get('room')
const hasVersion = u => new URL(u, 'http://x').searchParams.has('version')
const settle = (page, ms = 3500) => page.waitForTimeout(ms)

// opens the Overview of Alpha Tea and its page, double-clicked into the deck; the frame nearest the middle of the
// deck's canvas is the page it is focused on (the deck's frames are in the order of the pages)
async function intoDeck({ page, studio, app }, index) {
  await desktop(page)
  await page.goto(SITE({ studio, app }))
  await settle(page)
  const keys = await page.locator('.ab.page[data-key], .ov-ab.page[data-key]').evaluateAll(els => els.map(e => e.getAttribute('data-key')))
  await artboard(page, keys[index]).dblclick({ position: { x: 20, y: 20 } })
  // the deck's camera takes a moment to arrive: judged once the frame it centres on has not changed for a second, and
  // only once the deck has drawn the page that was opened (it draws its pages one by one: a still camera over the
  // first page alone is not yet the deck it opens on)
  let last = '', same = 0
  for (let i = 0; i < 40 && same < 3; i++) {
    await page.waitForTimeout(400)
    const now = JSON.stringify(await focusedFrame(page))
    same = now === last && JSON.parse(now).index === index ? same + 1 : 0
    last = now
  }
  return keys
}
// which page the deck is centred on: each page is drawn after its "Page N · title" label, as a live frame or, for a page
// that has a picture, as that picture (the deck keeps only the pages near the camera live), so the pages are found by
// their labels and not by their frames
const focusedFrame = page => page.evaluate(() => {
  const area = document.querySelector('#viewport, [role="region"][aria-label="Canvas"]')?.getBoundingClientRect()
  const mid = area ? (area.left + area.right) / 2 : innerWidth / 2
  const pages = [...document.querySelectorAll('.frame-label, [role="region"][aria-label="Canvas"] *')].flatMap(el => {
    const n = /^Page (\d+) ·/.exec(el.textContent.trim())
    const frame = n && /^(IFRAME|IMG|CANVAS)$/.test(el.nextElementSibling?.tagName) && el.nextElementSibling
    const r = frame && frame.getBoundingClientRect()
    return r && r.width > 0 ? [{ n: Number(n[1]) - 1, c: (r.left + r.right) / 2 }] : []
  })
  // the next UI's deck draws no labels: every page is a live frame there
  if (!pages.length) document.querySelectorAll('iframe').forEach((f, n) => { const r = f.getBoundingClientRect(); if (r.width > 0) pages.push({ n, c: (r.left + r.right) / 2 }) })
  pages.sort((x, y) => Math.abs(x.c - mid) - Math.abs(y.c - mid))
  return { index: pages[0]?.n ?? null, frames: pages.length }
})

const BIND = {
  'overview › Breadcrumb › Versions in the menu': [
    step('three versions, the name pressed', async ({ page, studio, app, seen }) => {
      await reshape(page, j => ({ ...j, projects: (j.projects || []).map(threeVersions) }))
      await desktop(page)
      await page.goto(SITE({ studio, app }))
      await settle(page)
      await crumbName(page, 'Alpha Tea').click()
      await page.locator('[role="menuitem"]').filter({ visible: true }).first().waitFor({ timeout: 5000 }).catch(() => {})
      seen.menu = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[role="menuitem"]')].filter(e => e.getClientRects().length).map(e => ({ text: e.innerText.trim().replace(/\s+/g, ' '), svgs: e.querySelectorAll('svg').length, on: e.matches('[aria-checked="true"], [aria-current="true"], .on') || !!e.querySelector('[aria-checked="true"], .on') }))
        // the ticked one carries a mark the others do not: its own state, or one more icon than the other versions
        const vs = rows.filter(r => /^Version \d+$/.test(r.text)), base = Math.min(...vs.map(r => r.svgs))
        return { items: rows.map(r => r.text), ticked: vs.filter(r => r.on || r.svgs > base).map(r => r.text) }
      })
    }),
    step('Rename, Duplicate, then the versions, the open one ticked', async ({ seen }) => problems([
      JSON.stringify(seen.menu.items) !== JSON.stringify(['Rename', 'Duplicate', 'Version 3', 'Version 2', 'Version 1']) && `the menu lists ${JSON.stringify(seen.menu.items)}`,
      // the open one is the second newest here (the third is the server's answer made newer for this page)
      JSON.stringify(seen.menu.ticked) !== JSON.stringify(['Version 2']) && `the open version (Version 2) is not the one ticked: ${JSON.stringify(seen.menu.ticked)}`
    ]))
  ],
  'overview › Loading › Pages being built': [
    step('a page with no snapshot, mid-build', async ({ page, studio, app, seen }) => {
      // nothing to photograph with: the frames' script never loads (the Studio's own page does), and none is kept
      await page.route(url => url.host === 'cdn.tailwindcss.com', () => {})
      await page.route(url => /\/snaps\b/.test(url.pathname), route => route.fulfill({ status: 200, json: { first: null, pages: {} } }))
      await desktop(page)
      await page.goto(MID({ studio, app }), { waitUntil: 'commit' })
      await artboard(page, 'page:menu').waitFor({ timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const board = await studio.api(`/api/runs/${studio.ids.mid}/board`)
      const menu = board.pages.find(p => p.id === 'menu')
      seen.plan = { planned: menu.plan.length, built: menu.plan.filter(l => l.done).length }
      seen.blocks = await artboard(page, 'page:menu').evaluate(a => ({ img: !!a.querySelector('img'), blocks: [...a.querySelectorAll('i')].map(i => ({ done: /\bdone\b/.test(i.className) })) }))
    }),
    step('a block per planned section, the built ones in place of theirs', async ({ seen }) => problems([
      seen.blocks.img && 'the page shows a picture, not its skeleton',
      seen.blocks.blocks.length !== seen.plan.planned && `the skeleton has ${seen.blocks.blocks.length} blocks for ${seen.plan.planned} planned sections`,
      seen.blocks.blocks.filter(b => b.done).length !== seen.plan.built && `the skeleton marks ${seen.blocks.blocks.filter(b => b.done).length} of the ${seen.plan.built} built sections`
    ]))
  ],
  'overview › Empty project › Nothing built': [
    step('a version that built nothing', async ({ page, studio, app, seen }) => {
      await page.route(url => /^\/api\/runs\/[^/]+\/board$/.test(url.pathname), async route => {
        const res = await route.fetch()
        await route.fulfill({ response: res, json: { ...(await res.json()), pages: [], art: [], films: [], app: false, code: false, painting: [], review: null, busy: false } })
      })
      await desktop(page)
      await page.goto(SITE({ studio, app }))
      await settle(page)
      seen.empty = await page.evaluate(() => {
        const vis = e => !!e.getClientRects().length
        const stage = [...document.querySelectorAll('[aria-label="Overview"], .pj-stage')].find(vis)
        const lines = stage ? stage.innerText.split('\n').map(s => s.trim()).filter(Boolean) : []
        const a = document.activeElement
        return { lines: lines.length, icons: stage ? [...stage.querySelectorAll('svg')].filter(vis).length : 0, headers: [...document.querySelectorAll('.al, h2')].filter(vis).map(e => e.innerText.trim()).filter(Boolean), focus: a && /^(INPUT|TEXTAREA)$/.test(a.tagName) ? 'input' : `${a?.tagName.toLowerCase()}` }
      })
    }),
    step('one icon, one line, the dock focused, no headers', async ({ seen }) => problems([
      seen.empty.lines !== 1 && `the stage has ${seen.empty.lines} lines, not one`,
      seen.empty.icons !== 1 && `the stage has ${seen.empty.icons} icons, not one`,
      seen.empty.focus !== 'input' && `the dock's input is not focused (focus is on the ${seen.empty.focus})`,
      seen.empty.headers.length && `section headers show: ${seen.empty.headers.join(', ')}`
    ]))
  ],
  'overview › One place per room › A page into the Design deck': [
    step('the second page double-clicked', async fx => {
      fx.seen.keys = await intoDeck(fx, 1)
      fx.seen.url = where(fx.page, fx.studio)
      fx.seen.focus = await focusedFrame(fx.page)
      fx.seen.back = await fx.page.evaluate(() => [...document.querySelectorAll('button, a')].filter(e => e.getClientRects().length && /overview/i.test((e.getAttribute('aria-label') || '') + ' ' + e.innerText)).map(e => (e.getAttribute('aria-label') || e.innerText).trim()))
    }),
    step('the deck, on that page, with Back reading Overview', async ({ seen }) => problems([
      roomOf(seen.url) !== 'deck' && `the address reads ${seen.url}, not the Design deck`,
      seen.focus.index !== 1 && `the deck is focused on page ${seen.focus.index == null ? '?' : seen.focus.index + 1} of ${seen.focus.frames}, not the second`,
      !seen.back.length && 'no Back control reads Overview'
    ]))
  ],
  'overview › One place per room › Esc from a room': [
    step('the deck open from the Overview, nothing selected', async fx => {
      await intoDeck(fx, 0)
      await fx.page.keyboard.press('Escape')
      await fx.page.waitForTimeout(1500)
      fx.seen.after = where(fx.page, fx.studio)
    }),
    step('Esc returns to the Overview', async ({ seen }) => problems([
      roomOf(seen.after) === 'deck' && 'Esc left the deck where it was',
      roomOf(seen.after) !== 'deck' && !hasVersion(seen.after) && `Esc left the deck for Projects (${seen.after}), not the Overview`
    ]))
  ],
  'overview › Inspector › Selecting a page': [
    step('a page clicked', async ({ page, studio, app, seen }) => {
      seen.seeded = await seedSnapshots({ page, studio }, studio.ids.site2)
      await desktop(page)
      await page.goto(SITE({ studio, app }))
      await settle(page)
      const keys = await page.locator('.ab.page[data-key], .ov-ab.page[data-key]').evaluateAll(els => els.map(e => e.getAttribute('data-key')))
      const art = artboard(page, keys[0])
      const before = await art.boundingBox()
      await art.click({ position: { x: 20, y: 20 } })
      // the preview and the size come from the page's snapshot, a moment after the click
      await page.waitForFunction(() => { const i = document.querySelector('aside[aria-label="Inspector"]'); return !!i && !!i.querySelector('img') && /\d+\s*×\s*\d+/.test(i.innerText) }, null, { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(500)
      const after = await art.boundingBox()
      const planned = (await studio.api(`/api/runs/${studio.ids.site2}/board`)).pages.find(p => p.id === keys[0].replace('page:', '')).plan.map(l => l.role)
      seen.shift = [Math.round(after.x - before.x), Math.round(after.y - before.y)]
      seen.insp = await inspector(page).first().evaluate((el, planned) => {
        const names = [...el.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.innerText).trim())
        const secs = [...el.querySelectorAll('[aria-label="Sections"] [role="listitem"], [aria-label="Sections"] button')].map(b => b.innerText.trim())
        return { preview: !!el.querySelector('img'), size: /\d+\s*×\s*\d+/.test(el.innerText), sections: secs, planned, open: names.some(n => /^open$/i.test(n)), exp: names.some(n => /^export/i.test(n)) }
      }, planned).catch(() => null)
    }),
    step('its preview, size, sections, Open and Export; the stage still', async ({ seen }) => problems([
      !seen.seeded && "the project's pages were not photographed first, so no preview could be there",
      !seen.insp && 'no inspector opened',
      seen.insp && !seen.insp.preview && 'the inspector has no preview',
      seen.insp && !seen.insp.size && 'the inspector shows no size',
      seen.insp && JSON.stringify(seen.insp.sections) !== JSON.stringify(seen.insp.planned) && `the inspector lists sections ${JSON.stringify(seen.insp.sections)}, not ${JSON.stringify(seen.insp.planned)}`,
      seen.insp && !seen.insp.open && 'the inspector has no Open',
      seen.insp && !seen.insp.exp && 'the inspector has no Export',
      (seen.shift[0] || seen.shift[1]) && `the stage shifted by ${seen.shift.join(', ')} px`
    ]))
  ],
  'overview › Inspector › Closing it': [
    step('Esc pressed twice with the inspector open', async ({ page, studio, app, seen }) => {
      await desktop(page)
      await page.goto(SITE({ studio, app }))
      await settle(page)
      await artboard(page, 'page:home').click({ position: { x: 20, y: 20 } })
      await inspector(page).first().waitFor({ timeout: 5000 }).catch(() => {})
      await page.keyboard.press('Escape')
      await page.waitForTimeout(700)
      seen.first = { inspector: await inspector(page).count(), url: where(page, studio) }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1200)
      seen.second = where(page, studio)
    }),
    step('the inspector closes and the selection clears; a second Esc goes to Projects', async ({ seen }) => problems([
      seen.first.inspector && 'the inspector is still open after Esc',
      !hasVersion(seen.first.url) && `the first Esc left the Overview (${seen.first.url})`,
      hasVersion(seen.second) && `the second Esc stayed in the Overview (${seen.second})`
    ]))
  ],
  'overview › 390 px › Files as a sheet': [
    step('Files pressed at 390', async ({ page, studio, app, seen }) => {
      await phone(page)
      await page.goto(SITE({ studio, app }))
      await settle(page)
      const sheet = () => page.locator('aside').filter({ visible: true, hasText: /layers/i }).filter({ hasText: /files/i })
      await page.getByRole('button', { name: 'Files', exact: true }).first().click()
      await page.waitForTimeout(800)
      seen.opened = await sheet().count()
      await sheet().first().getByText('Plans', { exact: true }).first().click()
      // up to 4 s for the sheet to go and the camera to arrive
      const view = () => page.evaluate(() => {
        const r = [...document.querySelectorAll('.ab.page[data-key="page:plans"], .ov-ab.page[data-key="page:plans"]')][0]?.getBoundingClientRect()
        return r ? { left: Math.round(r.left), right: Math.round(r.right), w: innerWidth } : null
      })
      for (let i = 0; i < 20; i++) { await page.waitForTimeout(200); seen.plans = await view(); seen.shut = await sheet().count() === 0; if (seen.shut && seen.plans && seen.plans.left >= 0 && seen.plans.right <= seen.plans.w) break }
    }),
    step('Files and Layers as a sheet; a row closes it and zooms to the page', async ({ seen }) => problems([
      !seen.opened && 'Files and Layers did not open as a sheet',
      !seen.shut && 'picking a row did not close the sheet',
      (!seen.plans || seen.plans.left < 0 || seen.plans.right > seen.plans.w) && `the page is not in view after picking its row (${seen.plans ? `${seen.plans.left} to ${seen.plans.right} of ${seen.plans.w} px` : 'not found'})`
    ]))
  ]
}

bind(BIND)
