// The scenarios a machine can check today, the ones whose Gate is a ui-audit check (breadcrumb, loading, axe,
// console, scroll), bound to the screens Projects, the Overview, the Design deck and the Studio scaffold (#461).
// Each binding names its scenario as tests/bdd/gen.mjs does, "<screen> › <requirement> › <scenario>", and its
// steps' words are read from the spec, so a reworded spec stays bound and a renamed or removed scenario fails.
//
// They run in the current Studio (/) and in the next UI (/next/, a moved screen only: tools/dev/bdd.config.mjs),
// on the throwaway Studio the audit uses. A check that fails where the audit already knows it fails
// (.ui-audit-known-violations.json, .next.json for /next/) passes with a "known" note, as in the audit: the spec
// is the target, the known list is where the code is.
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { test as base, createBdd } from 'playwright-bdd'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { studio } from '../../../../scripts/walkthrough-fixtures.mjs'
import { parse, key } from '../../../../tests/bdd/gen.mjs'

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url))
const known = app => JSON.parse(readFileSync(`${ROOT}.ui-audit-known-violations${app ? `.${app}` : ''}.json`, 'utf8')).map(k => k.key)

export const test = base.extend({
  // '' is the current Studio at /, 'next' the next UI at /next/ (set per project)
  app: ['', { option: true }],
  // one throwaway Studio per worker, its Setup sheet seen, plus a project still in the Studio (as the audit)
  studio: [async ({}, use) => {
    const s = await studio()
    await s.api('/api/setup', { seen: true })
    const made = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
    await use({ ...s, scaffold: made.project.id })
    s.stop()
  }, { scope: 'worker' }],
  // what a scenario's When saw, for its Then
  seen: async ({}, use) => use({})
})
const { When, Then } = createBdd(test)

// the screens, as the audit opens them (tools/dev/audit/audit.spec.mjs); `id` is the audit's, for its known list
const SCREENS = {
  projects: { id: 'projects', address: () => '', ready: '.home .card' },
  overview: { id: 'overview', address: s => `?project=${s.ids.site}&version=${s.ids.site2}`, ready: '.pj-world .ab.page' },
  'design-deck': { id: 'deck', address: s => `?version=${s.ids.site2}&room=deck`, ready: 'body.cosmos-station #viewport', nextReady: '[role="region"][aria-label="Canvas"]' },
  studio: { id: 'studio', address: s => `?room=studio&project=${s.scaffold}&step=brand`, ready: '.ab[data-key="brand:open"]', nextReady: '.ab[data-key="brand:open"]' }
}
const HOLD = 2500
const BUSY = '[aria-busy="true"], [role="progressbar"], .sk, .skeleton, .wait-in, .spin'
const tidy = text => String(text).replace(/https?:\/\/127\.0\.0\.1:\d+/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)

// opens one screen at one width; with `hold`, those requests wait while the page is watched for HOLD ms
async function open({ page, app, studio: s }, screen, width, hold) {
  const sc = SCREENS[screen]
  await page.setViewportSize(width === 390 ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  const errors = new Set()
  page.on('console', m => { if (m.type() === 'error') errors.add(`console: ${tidy(m.text())}`) })
  page.on('pageerror', e => errors.add(`page error: ${tidy(e.message)}`))
  page.on('response', r => { if (r.status() >= 400) errors.add(`${r.status()} ${tidy(r.url())}`) })
  let release = () => {}
  if (hold) {
    const gate = new Promise(r => { release = r })
    await page.route(url => hold(new URL(url).pathname), async route => { await gate; await route.continue().catch(() => {}) })
  }
  await page.goto(`${s.BASE}${app ? '/next/' : '/'}${sc.address(s)}`, { waitUntil: 'commit' })
  let during = null
  if (hold) {
    // the most of each loading sign seen while the data was held
    during = await page.evaluate(([ms, BUSY]) => new Promise(done => {
      const shown = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
      const count = sel => [...document.querySelectorAll(sel)].filter(shown).length
      const m = { busy: 0, waitCards: 0, siteSkeletons: 0, ready: false, nothingHere: false }
      const t0 = performance.now()
      const look = () => {
        m.busy = Math.max(m.busy, count(BUSY))
        m.waitCards = Math.max(m.waitCards, count('.card.wait-in[aria-busy="true"]'))
        m.siteSkeletons = Math.max(m.siteSkeletons, count('.pj-sec.site .ab.page[aria-busy="true"]'))
        const status = document.getElementById('status')
        if (status && shown(status) && status.textContent.trim() === 'Ready') m.ready = true
        if (/nothing here/i.test(document.body?.innerText || '')) m.nothingHere = true
        if (performance.now() - t0 < ms) setTimeout(look, 50); else done(m)
      }
      look()
    }), [HOLD, BUSY])
    release()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  }
  await page.locator(app ? sc.nextReady || 'main' : sc.ready).first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  return { width, errors, during }
}

// the breadcrumb as a person reads it (as the audit reads it)
const readCrumb = page => page.evaluate(() => {
  const seen = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
  const nav = [...document.querySelectorAll('nav[aria-label="Breadcrumb" i], [class$="-crumb"]')].find(seen)
  if (!nav) return null
  const PART = 'a, button, b, span, li, strong'
  return [...nav.querySelectorAll(PART)].filter(el => !el.querySelector(PART) && seen(el)).map(el => el.innerText.trim()).filter(t => t && t !== '›')
})

// A failed check passes when the audit already knows it (key "<id>@<width> <check>[ <detail>]"), with a note
function judge({ app, $testInfo }, screen, width, check, problems) {
  const id = SCREENS[screen].id
  const list = known(app)
  const fresh = problems.filter(p => !list.includes(`${id}@${width} ${check}${p.sub ? ` ${p.sub}` : ''}`))
  for (const p of problems.filter(p => !fresh.includes(p))) $testInfo.annotations.push({ type: 'known', description: `${id}@${width} ${check}: ${p.text}` })
  expect(fresh.map(p => p.text), `${screen} at ${width} (${app || 'current'} Studio), ${check}`).toEqual([])
}


// A When opens its screen and keeps what it saw; a Then checks it, on whatever screen the When opened. Each step
// carries `what` it does, so the same words bound twice must do the same thing.
const step = (what, fn) => Object.assign(fn, { what })
// (playwright-bdd reads which fixtures a step wants from its destructured first argument)
const at = (screen, width, hold) => step(`open ${screen} at ${width}${hold ? ' holding' : ''}`, async ({ page, app, studio, seen }) => Object.assign(seen, { screen }, await open({ page, app, studio }, screen, width, hold)))
const atBoth = screen => step(`open ${screen} at 1440 and 390`, async ({ page, app, studio, seen }) => { seen.screen = screen; seen.runs = [await open({ page, app, studio }, screen, 1440), await open({ page, app, studio }, screen, 390)]; seen.width = 390 })
const crumbIs = (want, what = want.join(' › ')) => step(`breadcrumb ${what}`, async ({ page, seen, app, $testInfo }) => {
  const parts = await readCrumb(page)
  const ok = typeof want === 'function' ? want(parts) : JSON.stringify(parts) === JSON.stringify(want)
  judge({ app, $testInfo }, seen.screen, seen.width, 'breadcrumb', ok ? [] : [{ text: `reads "${parts ? parts.join(' › ') : 'no breadcrumb'}"` }])
})
const loading = (what, test) => step(`loading ${what}`, async ({ seen, app, $testInfo }) => {
  const why = test(seen.during)
  judge({ app, $testInfo }, seen.screen, seen.width, 'loading', why ? [{ text: why }] : [])
})
const clean = ({ axe = true, console: errs = true } = {}) => step(`clean axe=${axe} console=${errs}`, async ({ page, seen, app, $testInfo, studio: s }) => {
  for (const run of seen.runs || [seen]) {
    if (axe) {
      // reopened at this width for axe; built pages in iframes are the person's content, not the Studio's UI
      await open({ page, app, studio: s }, seen.screen, run.width)
      const found = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('iframe').analyze()).violations
      judge({ app, $testInfo }, seen.screen, run.width, 'axe', found.map(v => ({ sub: v.id, text: `${v.id}: ${v.help}` })))
    }
    if (errs) judge({ app, $testInfo }, seen.screen, run.width, 'console', [...run.errors].map(e => ({ sub: e, text: e })))
  }
})
const noSideways = step('no sideways scroll', async ({ page, seen, app, $testInfo }) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  judge({ app, $testInfo }, seen.screen, seen.width, 'scroll', over > 0 ? [{ text: `the page scrolls ${over}px sideways` }] : [])
})

const trail = (build, room) => ['Home', 'Projects', build, room]
// at 390 the name may be shortened, but no part is dropped
const toHome = (build, room) => crumbIs(parts => !!parts && parts.length === 4 && parts[0] === 'Home' && parts[1] === 'Projects' && parts[3] === room && build.startsWith(parts[2].replace(/[…\s.]+$/, '')), `Home › Projects › ${build}… › ${room}`)
const projectsHeld = p => p.startsWith('/api/projects')

// scenario → its When and its Then
const BIND = {
  'projects › Breadcrumb › Projects at rest': [at('projects', 1440), crumbIs(['Home', 'Projects'])],
  'projects › Loading › First load': [at('projects', 1440, projectsHeld), loading('four skeleton cards, no empty line', d => d.waitCards < 4 ? `${d.waitCards} skeleton cards showed while the list was held, not four` : d.nothingHere ? 'a "nothing here" line showed while the list was held' : null)],
  'projects › Accessible and console-clean › axe at both widths': [atBoth('projects'), clean({ console: false })],
  'projects › Accessible and console-clean › No errors': [at('projects', 1440), clean({ axe: false })],
  'projects › 390 px › No sideways scroll': [at('projects', 390), noSideways],
  'overview › Breadcrumb › At rest': [at('overview', 1440), crumbIs(trail('Alpha Tea', 'Overview'))],
  'overview › Breadcrumb › At 390': [at('overview', 390), toHome('Alpha Tea', 'Overview')],
  'overview › Loading › The board loading': [at('overview', 1440, p => p.endsWith('/events')), loading('three site skeletons', d => d.siteSkeletons < 3 ? `${d.siteSkeletons} page skeletons showed in the Site section while the events were held, not three` : null)],
  'overview › Accessible and console-clean › axe and console': [atBoth('overview'), clean()],
  'overview › 390 px › No sideways scroll': [at('overview', 390), noSideways],
  'design-deck › Breadcrumb › At rest': [at('design-deck', 1440), crumbIs(trail('Alpha Tea', 'Design deck'))],
  'design-deck › Breadcrumb › At 390': [at('design-deck', 390), crumbIs(trail('Alpha Tea', 'Design deck'))],
  'design-deck › Loading › Opening a version': [at('design-deck', 1440, p => /^\/api\/(models|auto|work)\b/.test(p) || p.endsWith('/events')), loading('busy and not Ready', d => !d.busy ? 'no skeleton or busy marker showed while the build was held' : d.ready ? 'the status pill read Ready before the build had loaded' : null)],
  'design-deck › Accessible and console-clean › axe and console': [atBoth('design-deck'), clean()],
  'design-deck › 390 px › No sideways scroll': [at('design-deck', 390), noSideways],
  'studio › Breadcrumb › The scaffold at rest': [at('studio', 1440), crumbIs(trail('Cedar Cafe', 'Studio'))],
  'studio › Loading › First load': [at('studio', 1440, p => p.startsWith('/api/studio/')), loading('a waiting card', d => !d.busy ? 'no waiting card showed while the scaffold was held' : null)],
  'studio › Accessible and console-clean › axe and console': [atBoth('studio'), clean()],
  'studio › 390 px › No sideways scroll': [at('studio', 390), noSideways]
}

// each binding's step words, from its spec
const exact = s => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
const spec = screen => parse(readFileSync(`${ROOT}openspec/specs/${screen}/spec.md`, 'utf8'))
const bound = new Map()
for (const [k, [when, then]] of Object.entries(BIND)) {
  const [screen, req, name] = k.split(' › ')
  const sc = spec(screen).find(r => r.name === req)?.scenarios.find(x => x.name === name)
  if (!sc || key(screen, req, name) !== k) throw new Error(`tests/bdd/steps/gated.mjs binds "${k}", which no spec has`)
  for (const [kind, text, fn] of [['When', sc.when, when], ['Then', sc.then, then]]) {
    const was = bound.get(`${kind} ${text}`)
    if (was && was.what !== fn.what) throw new Error(`"${kind} ${text}" is bound to "${was.what}" for "${was.k}" and to "${fn.what}" for "${k}": give one of them other words in its spec`)
    if (was) continue
    bound.set(`${kind} ${text}`, { what: fn.what, k })
    ;(kind === 'When' ? When : Then)(exact(text), fn)
  }
}
