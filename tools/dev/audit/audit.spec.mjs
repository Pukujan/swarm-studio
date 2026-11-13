// The UI audit gates (docs/ux/AUDIT.md): each top-level screen, at 1440 and 390 wide (tools/dev/playwright.config.mjs),
// is checked for the rules a machine can check:
//
//   breadcrumb   it reads Home › Projects › build › room (docs/ux/RULES.md, rule 7)
//   axe          no WCAG 2.2 A/AA violation that axe-core finds in the Studio's own UI (rule 26)
//   scroll       the page does not scroll sideways (rule 25)
//   console      no console error, page error or failed request
//   loading      a skeleton or busy indicator is on screen while the screen's data is on its way
//
// A violation the app has today is kept in .ui-audit-known-violations.json, so this passes now and fails
// on a new one. A known one that no longer happens is reported, never failed: delete its entry (or run
// `npm run --prefix tools/dev audit:update`). The Studio is the throwaway one the walkthrough uses
// (scripts/walkthrough-fixtures.mjs), one per worker; it never touches the 4319 server or the real data.
//
// AUDIT_APP=next runs the same screens in the next UI (ui/, served at /next/, docs/decisions/0013-react-ui-coexists.md)
// at the same addresses, with its own known list (.ui-audit-known-violations.next.json), so a screen moving to React
// is held to the same gates before and after (ui/README.md).
import { test as base, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { studio } from '../../../scripts/walkthrough-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const APP = process.env.AUDIT_APP === 'next' ? 'next' : ''
const KNOWN_FILE = `${ROOT}.ui-audit-known-violations${APP ? `.${APP}` : ''}.json`
const FOUND_DIR = `${ROOT}test-results/audit-found${APP ? `-${APP}` : ''}`
const known = JSON.parse(readFileSync(KNOWN_FILE, 'utf8'))

// what a screen's loading state may be: the kit's skeletons and busy markers
const BUSY = '[aria-busy="true"], [role="progressbar"], .sk, .skeleton, .wait-in, .spin'
// how long a screen's data is held back for the loading check
const HOLD = 2500
// requests the shell needs before it paints anything, so they are never held
const SHELL = /\/api\/(state|setup|events|stream)\b/

const trail = (build, room) => ['Home', 'Projects', build, room]

// The top-level screens (docs/ux/SITEMAP.md). `pre` gets the page to just before the screen opens, `go` opens it
// (that is what the loading check watches), `ready` is on screen once it has.
// `crumb` is what rule 7 asks for. Two are our reading of the rules, not the owner's words: Projects is the
// Studio's top layer (Home is the Feed, rule 1), so it reads Home › Projects; the Design deck keeps Figma's
// frame (rule 32) but rule 7 has no exception for it, so it reads like every other room.
const SCREENS = [
  { id: 'projects', crumb: ['Home', 'Projects'], address: () => '', go: (p, s) => p.goto(s.BASE + '/', { waitUntil: 'commit' }), ready: '.home .card' },
  { id: 'overview', crumb: trail('Alpha Tea', 'Overview'), address: s => `?project=${s.ids.site}&version=${s.ids.site2}`, go: (p, s) => p.goto(`${s.BASE}/?project=${s.ids.site}&version=${s.ids.site2}`, { waitUntil: 'commit' }), ready: '.pj-world .ab.page' },
  { id: 'deck', crumb: trail('Alpha Tea', 'Design deck'), address: s => `?version=${s.ids.site2}&room=deck`, go: (p, s) => p.goto(`${s.BASE}/?version=${s.ids.site2}&room=deck`, { waitUntil: 'commit' }), ready: 'body.cosmos-station #viewport', nextReady: '[role="region"][aria-label="Canvas"]' },
  { id: 'app', crumb: trail('Shift Log', 'App'), address: s => `?version=${s.ids.app}&room=app`, go: (p, s) => p.goto(`${s.BASE}/?version=${s.ids.app}&room=app`, { waitUntil: 'commit' }), ready: 'body.view-app #appview' },
  { id: 'game', crumb: trail('Lantern Run', 'Game'), address: s => `?version=${s.ids.game}&room=game`, go: (p, s) => p.goto(`${s.BASE}/?version=${s.ids.game}&room=game`, { waitUntil: 'commit' }), ready: 'body.view-app' },
  { id: 'film', crumb: trail('River Hours', 'Film'), address: s => `?version=${s.ids.film}&room=video`, go: (p, s) => p.goto(`${s.BASE}/?version=${s.ids.film}&room=video`, { waitUntil: 'commit' }), ready: 'body.view-video' },
  { id: 'studio', crumb: trail('Cedar Cafe', 'Studio'), address: s => `?room=studio&project=${s.scaffold}&step=brand`, go: (p, s) => p.goto(`${s.BASE}/?room=studio&project=${s.scaffold}&step=brand`, { waitUntil: 'commit' }), ready: '.ab[data-key="brand:open"]', nextReady: '.ab[data-key="brand:open"]' },
  { id: 'plan', crumb: trail('New game', 'Plan'), address: () => '?room=plan',
    pre: async (p, s) => { await p.goto(s.BASE + '/'); await p.locator('.home .card').first().waitFor() },
    go: p => p.evaluate(() => { window.swarmCosmos.talkGame({ text: 'A platformer through a night market' }) }), ready: 'body.cosmos-plan .pl-crumb' },
  // opened from the Studio, the way a person reaches it
  { id: 'brand', crumb: trail('Cedar Cafe', 'Brand sheet'),
    pre: async (p, s) => { await p.goto(`${s.BASE}/?room=studio&project=${s.scaffold}&step=brand`); await p.locator('.ab[data-key="brand:open"]').first().waitFor() },
    go: p => p.locator('.ab[data-key="brand:open"]').first().press('Enter'), ready: 'body.cosmos-brand .br-crumb' }
]

// In /next/ each screen opens at its address. Until it has moved, every one is the same stand-in, so `main` is
// what is on screen; a moved screen gives its own `nextReady`. The brand sheet has no address of its own (it opens
// from a screen), so it joins when its way in has moved.
const screens = APP !== 'next' ? SCREENS : SCREENS.filter(x => x.address).map(x => ({
  ...x, pre: undefined, ready: x.nextReady || 'main',
  go: (p, s) => p.goto(`${s.BASE}/next/${x.address(s)}`, { waitUntil: 'commit' })
}))

// one throwaway Studio per worker, its Setup sheet already seen, plus a project still in the Studio (no build yet)
const test = base.extend({
  studio: [async ({}, use) => {
    const s = await studio()
    await s.api('/api/setup', { seen: true })
    const made = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
    await use({ ...s, scaffold: made.project.id })
    s.stop()
  }, { scope: 'worker' }]
})

// the breadcrumb as a person reads it: the visible text of each part, in order
function readCrumb() {
  const seen = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
  const nav = [...document.querySelectorAll('nav[aria-label="Breadcrumb" i], [class$="-crumb"]')].find(seen)
  if (!nav) {
    const name = document.getElementById('file-name')
    return { parts: null, note: name && seen(name) ? `no breadcrumb; the file name reads "${name.innerText.trim()}"` : 'no breadcrumb' }
  }
  const PART = 'a, button, b, span, li, strong'
  const parts = [...nav.querySelectorAll(PART)].filter(el => !el.querySelector(PART) && seen(el)).map(el => el.innerText.trim()).filter(t => t && t !== '›')
  return { parts, note: parts.join(' › ') }
}

// holds back the requests `match` picks while `go` runs, and says whether a loading state was on screen meanwhile
async function whileHeld(page, match, go) {
  let release
  const gate = new Promise(r => { release = r })
  const held = new Set()
  await page.route(match, async route => {
    held.add(new URL(route.request().url()).pathname)
    await gate
    await route.continue().catch(() => {})
  })
  const timer = setTimeout(release, HOLD)
  await go()
  // any of them, not the first match (a hidden .spin is in every screen)
  const busy = await page.locator(BUSY).filter({ visible: true }).first().waitFor({ timeout: HOLD }).then(() => true, () => false)
  release(); clearTimeout(timer)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  return { busy, held: [...held] }
}

const tidy = text => String(text).replace(/https?:\/\/127\.0\.0\.1:\d+/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)

for (const screen of screens) {
  test(screen.id, async ({ page, studio: s }, info) => {
    const width = info.project.name
    const found = []
    const add = (check, detail, sub = '') => found.push({ key: `${screen.id}@${width} ${check}${sub ? ` ${sub}` : ''}`, detail })

    if (screen.pre) await screen.pre(page, s)

    // console errors, page errors and failed requests from here on
    const errors = new Set()
    page.on('console', m => { if (m.type() === 'error') errors.add(`console: ${tidy(m.text())}`) })
    page.on('pageerror', e => errors.add(`page error: ${tidy(e.message)}`))
    page.on('response', r => { if (r.status() >= 400) errors.add(`${r.status()} ${tidy(r.url())}`) })

    // loading: the screen's data is held back, and something must say it is on its way meanwhile
    const { busy, held } = await whileHeld(page, url => url.pathname.startsWith('/api/') && !SHELL.test(url.pathname) || url.pathname.startsWith('/snaps/'), () => screen.go(page, s))
    if (!busy) add('loading', held.length ? `nothing showed it was loading while ${held.join(', ')} were held` : 'nothing showed it was loading, and the screen asked for no data')

    await page.locator(screen.ready).first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(500)

    // breadcrumb (rule 7)
    const crumb = await page.evaluate(readCrumb)
    if (JSON.stringify(crumb.parts) !== JSON.stringify(screen.crumb)) add('breadcrumb', `reads "${crumb.note}", should read "${screen.crumb.join(' › ')}"`)

    // sideways scroll (rule 25)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (over > 0) add('scroll', `the page scrolls ${over}px sideways`)

    // accessibility: built pages are the person's content, not the Studio's UI
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('iframe').analyze()
    for (const v of axe.violations) add('axe', `${v.help}: ${v.nodes.slice(0, 6).map(n => n.target.join(' ')).join(', ')}${v.nodes.length > 6 ? ` and ${v.nodes.length - 6} more` : ''}`, v.id)

    for (const e of errors) add('console', e, e)

    // compare with the known ones
    const mine = known.filter(k => k.key.startsWith(`${screen.id}@${width} `))
    const fresh = found.filter(f => !mine.some(k => k.key === f.key))
    const gone = mine.filter(k => !found.some(f => f.key === k.key))
    for (const g of gone) {
      info.annotations.push({ type: 'fixed', description: `${g.key} no longer happens: delete it from .ui-audit-known-violations.json` })
      console.log(`  fixed: ${g.key} (delete it from .ui-audit-known-violations.json)`)
    }
    // what it found, always: audit:update makes it the known list, and CI uploads it when the run fails
    mkdirSync(FOUND_DIR, { recursive: true })
    writeFileSync(`${FOUND_DIR}/${screen.id}@${width}.json`, JSON.stringify(found))
    if (process.env.AUDIT_UPDATE) return
    expect(fresh, `new violations on ${screen.id} at ${width} (fix them, or if they are accepted, run audit:update)`).toEqual([])
  })
}

// the loading check can see a loading state: while a build's events are on their way, the Overview draws a skeleton
// per planned page. Alpha Tea's first version, because no other test opens it: a page photographed once paints from
// its picture instead. If this fails, the check is broken, not the screens.
test('the loading check sees a skeleton', async ({ page, studio: s }) => {
  test.skip(APP === 'next', 'the check itself, on the current Studio only')
  const { busy } = await whileHeld(page, url => url.pathname.endsWith('/events'), () => page.goto(`${s.BASE}/?project=${s.ids.site}&version=${s.ids.site}`, { waitUntil: 'commit' }))
  expect(busy).toBe(true)
})
