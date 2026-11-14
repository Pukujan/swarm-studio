// The BDD steps' shared kit (decision 0019, #461): the throwaway Studio, the screens and how each opens, what a
// When saw for its Then, the audit's known list, the known gaps (tests/bdd/gaps.json), and bind(), which binds a
// table of scenarios to their When and Then by the words in their spec. Each tools/dev/bdd/steps/*.mjs binds one
// screen's (or one kind's) scenarios with it.
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { test as base, createBdd } from 'playwright-bdd'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { studio } from '../../../scripts/walkthrough-fixtures.mjs'
import { parse, key } from '../../../tests/bdd/gen.mjs'

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const known = app => JSON.parse(readFileSync(`${ROOT}.ui-audit-known-violations${app ? `.${app}` : ''}.json`, 'utf8')).map(k => k.key)

export const test = base.extend({
  // '' is the current Studio at /, 'next' the next UI at /next/ (set per project)
  app: ['', { option: true }],
  // one throwaway Studio per worker, its Setup sheet seen, plus a project still in the Studio (as the audit)
  studio: [async ({}, use) => {
    const s = await studio()
    await s.api('/api/setup', { seen: true })
    const made = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
    // the brand sheet's scenarios open a project of their own (the same idea, so the same name): opening the sheet
    // makes the project's brand, and the Studio scaffold's scenarios would then see a scaffold with a brand card
    const forBrand = await s.api('/api/studio', { kind: 'site', idea: 'Cedar Cafe, a small cafe by the river' })
    await use({ ...s, scaffold: made.project.id, brandScaffold: forBrand.project.id })
    s.stop()
  }, { scope: 'worker' }],
  // what a scenario's When saw, for its Then
  seen: async ({}, use) => use({})
})
export const { When, Then } = createBdd(test)

// the screens, as the audit opens them (tools/dev/audit/audit.spec.mjs); `id` is the audit's, for its known list
export const SCREENS = {
  projects: { id: 'projects', address: () => '', ready: '.home .card' },
  overview: { id: 'overview', address: s => `?project=${s.ids.site}&version=${s.ids.site2}`, ready: '.pj-world .ab.page' },
  'design-deck': { id: 'deck', address: s => `?version=${s.ids.site2}&room=deck`, ready: 'body.cosmos-station #viewport', nextReady: '[role="region"][aria-label="Canvas"]' },
  studio: { id: 'studio', address: s => `?room=studio&project=${s.scaffold}&step=brand`, ready: '.ab[data-key="brand:open"]', nextReady: '.ab[data-key="brand:open"]' },
  // two open the way a person reaches them in the current Studio (`pre`, then `go`, which is what a held request
  // is watched over), and at their own address in the next UI: the brand sheet from the Studio's Brand card…
  'brand-sheet': {
    id: 'brand', address: s => `?room=brand&project=${s.brandScaffold}&step=brand`, ready: 'body.cosmos-brand .br-crumb', nextReady: '.brand-sheet [data-sec="palette"] .ab',
    pre: async (p, s) => { await p.goto(`${s.BASE}/?room=studio&project=${s.brandScaffold}&step=brand`); await p.locator('.ab[data-key="brand:open"]').first().waitFor() },
    go: p => p.locator('.ab[data-key="brand:open"]').first().press('Enter')
  },
  // …and the Plan board from a game talk (what Make does for a game)
  'plan-board': {
    id: 'plan', address: () => '?room=plan', ready: 'body.cosmos-plan .pl-crumb', nextReady: 'main [role="region"][aria-label="Plan"]',
    pre: async (p, s) => { await p.goto(s.BASE + '/'); await p.locator('.home .card').first().waitFor() },
    go: p => p.evaluate(() => { window.swarmCosmos.talkGame({ text: 'A platformer through a night market' }) })
  }
}
export const HOLD = 2500
export const BUSY = '[aria-busy="true"], [role="progressbar"], .sk, .skeleton, .wait-in, .spin'
const tidy = text => String(text).replace(/https?:\/\/127\.0\.0\.1:\d+/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)

// opens one screen at one width; with `hold`, those requests wait while the page is watched for HOLD ms
export async function open({ page, app, studio: s }, screen, width, hold) {
  const sc = SCREENS[screen]
  await page.setViewportSize(width === 390 ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  const errors = new Set()
  page.on('console', m => { if (m.type() === 'error') errors.add(`console: ${tidy(m.text())}`) })
  page.on('pageerror', e => errors.add(`page error: ${tidy(e.message)}`))
  page.on('response', r => { if (r.status() >= 400) errors.add(`${r.status()} ${tidy(r.url())}`) })
  const way = !app && sc.go
  if (way && sc.pre) await sc.pre(page, s)
  let release = () => {}
  if (hold) {
    const gate = new Promise(r => { release = r })
    await page.route(url => hold(new URL(url).pathname), async route => { await gate; await route.continue().catch(() => {}) })
  }
  if (way) await sc.go(page, s)
  else await page.goto(`${s.BASE}${app ? '/next/' : '/'}${sc.address(s)}`, { waitUntil: 'commit' })
  let during = null
  if (hold) {
    // the most of each loading sign seen while the data was held
    during = await page.evaluate(([ms, BUSY]) => new Promise(done => {
      const shown = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
      const count = sel => [...document.querySelectorAll(sel)].filter(shown).length
      const m = { busy: 0, waitCards: 0, siteSkeletons: 0, ready: false, nothingHere: false, brandParts: 0, hermiaOnStory: false, planCards: 0 }
      const t0 = performance.now()
      const look = () => {
        m.busy = Math.max(m.busy, count(BUSY))
        // each Studio's own markup: / marks each skeleton busy; /next/ marks the list busy (ui/src/screens/Projects.tsx
        // Waiting) and draws its pages as .ov-ab (ui/src/screens/overview/Artboard.tsx WaitingPages)
        m.waitCards = Math.max(m.waitCards, count('.card.wait-in[aria-busy="true"], [aria-busy="true"] > .wait-in'))
        m.siteSkeletons = Math.max(m.siteSkeletons, count('.pj-sec.site .ab.page[aria-busy="true"], .ov-sec .ov-ab.page.ov-wait[aria-busy="true"]'))
        const status = document.getElementById('status')
        if (status && shown(status) && status.textContent.trim() === 'Ready') m.ready = true
        if (/nothing here/i.test(document.body?.innerText || '')) m.nothingHere = true
        // the brand sheet's Story, Palette and Type each with a skeleton, Hermia's cursor on the first Story card;
        // the Plan board's waiting cards in its Plan section
        // (found by each section's label: .al in /, an h2 in /next/)
        const part = name => [...document.querySelectorAll('section')].find(s => (s.querySelector(':scope > .al, :scope > h2')?.textContent || '').trim().toLowerCase() === name.toLowerCase())
        const waits = name => [...(part(name)?.querySelectorAll('.br-wait') || [])].filter(shown)
        m.brandParts = Math.max(m.brandParts, ['Story', 'Palette', 'Type'].filter(n => waits(n).length).length)
        if (/Hermia/.test(waits('Story')[0]?.textContent || '')) m.hermiaOnStory = true
        m.planCards = Math.max(m.planCards, count('.pj-sec .pcard.wait-in[aria-busy="true"]'))
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
export const readCrumb = page => page.evaluate(() => {
  const seen = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
  const nav = [...document.querySelectorAll('nav[aria-label="Breadcrumb" i], [class$="-crumb"]')].find(seen)
  if (!nav) return null
  const PART = 'a, button, b, span, li, strong'
  return [...nav.querySelectorAll(PART)].filter(el => !el.querySelector(PART) && seen(el)).map(el => el.innerText.trim()).filter(t => t && t !== '›')
})

// A failed check passes when the audit already knows it (key "<id>@<width> <check>[ <detail>]"), with a note
export function judge({ app, $testInfo }, screen, width, check, problems) {
  const id = SCREENS[screen].id
  const list = known(app)
  const fresh = problems.filter(p => !list.includes(`${id}@${width} ${check}${p.sub ? ` ${p.sub}` : ''}`))
  for (const p of problems.filter(p => !fresh.includes(p))) $testInfo.annotations.push({ type: 'known', description: `${id}@${width} ${check}: ${p.text}` })
  expect(fresh.map(p => p.text), `${screen} at ${width} (${app || 'current'} Studio), ${check}`).toEqual([])
}


// A When opens its screen and keeps what it saw; a Then checks it, on whatever screen the When opened. Each step
// carries `what` it does, so the same words bound twice must do the same thing.
export const step = (what, fn) => Object.assign(fn, { what })
// What a scenario says and the Studio does not: each falsy item is fine, each string a difference. The error
// carries them, so a known gap (tests/bdd/gaps.json) can pass only when every one of them is the one it names.
export const problems = list => {
  const found = list.filter(Boolean)
  if (found.length) throw Object.assign(new Error(`what the scenario says and the Studio does differ:\n  ${found.join('\n  ')}`), { found })
}
// (playwright-bdd reads which fixtures a step wants from its destructured first argument)
export const at = (screen, width, hold) => step(`open ${screen} at ${width}${hold ? ' holding' : ''}`, async ({ page, app, studio, seen }) => Object.assign(seen, { screen }, await open({ page, app, studio }, screen, width, hold)))
export const atBoth = screen => step(`open ${screen} at 1440 and 390`, async ({ page, app, studio, seen }) => { seen.screen = screen; seen.runs = [await open({ page, app, studio }, screen, 1440), await open({ page, app, studio }, screen, 390)]; seen.width = 390 })
export const crumbIs = (want, what = want.join(' › ')) => step(`breadcrumb ${what}`, async ({ page, seen, app, $testInfo }) => {
  const parts = await readCrumb(page)
  const ok = typeof want === 'function' ? want(parts) : JSON.stringify(parts) === JSON.stringify(want)
  judge({ app, $testInfo }, seen.screen, seen.width, 'breadcrumb', ok ? [] : [{ text: `reads "${parts ? parts.join(' › ') : 'no breadcrumb'}"` }])
})
export const loading = (what, test) => step(`loading ${what}`, async ({ seen, app, $testInfo }) => {
  const why = test(seen.during)
  judge({ app, $testInfo }, seen.screen, seen.width, 'loading', why ? [{ text: why }] : [])
})
export const clean = ({ axe = true, console: errs = true } = {}) => step(`clean axe=${axe} console=${errs}`, async ({ page, seen, app, $testInfo, studio: s }) => {
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
export const noSideways = step('no sideways scroll', async ({ page, seen, app, $testInfo }) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  judge({ app, $testInfo }, seen.screen, seen.width, 'scroll', over > 0 ? [{ text: `the page scrolls ${over}px sideways` }] : [])
})

// the Make box's three parts on one line (their middles within 8 px), and no sideways scroll; found by their names
export const oneRow = step('the Make box in one row, no sideways scroll', async ({ page, seen, app, $testInfo }) => {
  const parts = [page.getByRole('button', { name: 'What to make' }), page.getByRole('textbox', { name: 'What should the crew build?' }), page.getByRole('button', { name: 'Make', exact: true })]
  const boxes = await Promise.all(parts.map(l => l.first().boundingBox().catch(() => null)))
  const mids = boxes.map(b => b && b.y + b.height / 2)
  const row = mids.some(m => m == null) ? `missing: ${['the kind', 'the input', 'Make'].filter((_, i) => mids[i] == null).join(', ')}` : Math.max(...mids) - Math.min(...mids) > 8 ? `not in one row (middles at ${mids.map(Math.round).join(', ')} px)` : null
  judge({ app, $testInfo }, seen.screen, seen.width, 'row', row ? [{ text: `the kind, the input and Make: ${row}` }] : [])
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  judge({ app, $testInfo }, seen.screen, seen.width, 'scroll', over > 0 ? [{ text: `the page scrolls ${over}px sideways` }] : [])
})

export const trail = (build, room) => ['Home', 'Projects', build, room]
// at 390 the name may be shortened, but no part is dropped
export const toHome = (build, room) => crumbIs(parts => !!parts && parts.length === 4 && parts[0] === 'Home' && parts[1] === 'Projects' && parts[3] === room && build.startsWith(parts[2].replace(/[…\s.]+$/, '')), `Home › Projects › ${build}… › ${room}`)
export const projectsHeld = p => p.startsWith('/api/projects')
export const boardHeld = p => /^\/api\/runs\/[^/]+\/board$/.test(p) || p.endsWith('/events')

// Each binding's step words, from its spec; the same words bound twice must do the same thing. A Then that fails
// where tests/bdd/gaps.json says this Studio does not meet its scenario yet passes with a "gap" note, as a known
// audit failure does; one listed that passes is noted as closed, to take off the list.
const exact = s => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
const spec = screen => parse(readFileSync(`${ROOT}openspec/specs/${screen}/spec.md`, 'utf8'))
const gaps = Object.fromEntries(Object.entries(JSON.parse(readFileSync(`${ROOT}tests/bdd/gaps.json`, 'utf8'))).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([app, g]) => [app, { why: g.why, match: [].concat(g.match) }]))]))
const bound = new Map()
// the scenario a step runs in, from its test's title path (feature › rule › scenario)
const scenarioOf = info => info.titlePath.slice(-3).join(' › ')
// (playwright-bdd reads which fixtures a step wants from its destructured first argument, so every step is
// registered as one that destructures them and hands the lot to the step written in the steps files)
const asWhen = fn => step(fn.what, async ({ page, app, studio, seen, $testInfo }) => { await fn({ page, app, studio, seen, $testInfo }) })
const withGap = fn => step(fn.what, async ({ page, app, studio, seen, $testInfo }) => {
  const gap = gaps[scenarioOf($testInfo)]?.[app || 'current']
  try { await fn({ page, app, studio, seen, $testInfo }) } catch (e) {
    // only the failure the gap names passes: every difference found has one of its `match` words, so a different
    // failure, or one more beside it, fails (a failure with no list, such as an audit check, must have them all)
    const said = String(e.message || e)
    const named = e.found ? e.found.every(f => gap?.match.some(m => f.includes(m))) : gap?.match.every(m => said.includes(m))
    if (!gap || !named) throw e
    $testInfo.annotations.push({ type: 'gap', description: `${app || 'current'}: ${gap.why}` })
    return
  }
  if (gap) $testInfo.annotations.push({ type: 'closed', description: `${scenarioOf($testInfo)} passes in the ${app || 'current'} Studio now: take it off tests/bdd/gaps.json` })
})
export function bind(table) {
  for (const [k, [when, then]] of Object.entries(table)) {
    const [screen, req, name] = k.split(' › ')
    const sc = spec(screen).find(r => r.name === req)?.scenarios.find(x => x.name === name)
    if (!sc || key(screen, req, name) !== k) throw new Error(`tools/dev/bdd/steps binds "${k}", which no spec has`)
    for (const [kind, text, fn] of [['When', sc.when, when], ['Then', sc.then, then]]) {
      const was = bound.get(`${kind} ${text}`)
      if (was && was.what !== fn.what) throw new Error(`"${kind} ${text}" is bound to "${was.what}" for "${was.k}" and to "${fn.what}" for "${k}": give one of them other words in its spec`)
      if (was) continue
      bound.set(`${kind} ${text}`, { what: fn.what, k })
      ;(kind === 'When' ? When : Then)(exact(text), kind === 'Then' ? withGap(fn) : asWhen(fn))
    }
  }
}
