// Setup and Settings (openspec/specs/setup-settings/spec.md) beyond their machine gates (#461): Setup opening once,
// the model check's spinner, Pictures, Settings one level per tap, loading, closing and Setup at 390. Both sheets are
// the current Studio's (Settings and Setup have not moved to the next UI, whose menu opens them there), so these run
// in the current project. A state the test Studio does not start in (Setup not yet seen) is set through the Studio's
// own /api/setup for the scenario and put back after it; the model check has no model to answer in the test Studio.
import { bind, problems, step } from '../kit.mjs'
import { studio as newStudio } from '../../../../scripts/walkthrough-fixtures.mjs'

const wait = (page, ms = 1000) => page.waitForTimeout(ms)
const HOME = ({ studio }) => `${studio.BASE}/`
const setup = page => page.locator('.ui-dialog.su').first()
const dialog = page => page.locator('.ui-dialog').filter({ visible: true }).last()
const input = page => page.getByRole('textbox', { name: 'What should the crew build?' }).first()
// a Studio whose Setup has not been seen: the Studio keeps that in memory and only ever sets it, so a scenario that
// needs it unseen starts a Studio of its own (stopped after)
const unseen = () => newStudio()
const stop = own => { try { own.stop() } catch { /* its folder may be held a moment on Windows */ } }
async function home(fx, width = 1440) {
  await fx.page.setViewportSize(width === 390 ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  await fx.page.goto(HOME(fx))
  await fx.page.locator('.home .card, .hm-side').first().waitFor({ timeout: 15_000 })
}
// the You menu's item, the way a person opens a sheet
async function fromMenu(fx, item) {
  await fx.page.getByRole('button', { name: /^You/ }).first().click({ timeout: 5000 }); await wait(fx.page, 400)
  await fx.page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).first().click({ timeout: 5000 })
}
const rowsOf = page => page.evaluate(() => [...document.querySelectorAll('.ui-dialog.su .su-head')].map(h => ({ name: h.querySelector('.su-name')?.textContent.trim(), state: h.querySelector('.su-state')?.textContent.trim() || '' })))
const isOpen = page => setup(page).isVisible().catch(() => false)

const BIND = {
  'setup-settings › Setup opens once by itself › First run': [
    step('the Studio opened for the first time', async fx => {
      const own = await unseen()
      try {
        await fx.page.setViewportSize({ width: 1440, height: 900 })
        await fx.page.goto(`${own.BASE}/`)
        await setup(fx.page).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
        await wait(fx.page, 1500)
        fx.seen.open = await isOpen(fx.page)
        fx.seen.rows = fx.seen.open ? await rowsOf(fx.page) : []
        fx.seen.over = await fx.page.locator('.home, .hm-side').first().isVisible()
      } finally { stop(own) }
    }),
    step('the Setup sheet over Projects with Account, Models and Pictures, each with its state', async ({ seen }) => problems([
      !seen.open && 'Setup does not open by itself',
      !seen.over && 'Projects is not behind the sheet',
      ...['Account', 'Models', 'Pictures'].map(n => seen.open && !seen.rows.find(r => r.name?.toLowerCase() === n.toLowerCase()) && `no ${n} row`),
      ...seen.rows.filter(r => ['account', 'models', 'pictures'].includes(r.name?.toLowerCase())).map(r => !r.state && `the ${r.name} row shows no state`)
    ]))
  ],
  'setup-settings › Setup opens once by itself › Closed once': [
    step('Setup closed with ×, Esc, a click outside or Start, and the Studio reloaded', async fx => {
      fx.seen.again = {}
      const ways = {
        '×': p => dialog(p).getByRole('button', { name: /^(close|×)$/i }).first().click({ timeout: 5000 }),
        Esc: p => p.keyboard.press('Escape'),
        'a click outside': p => p.mouse.click(5, 5),
        Start: p => setup(p).getByRole('button', { name: /^start/i }).first().click({ timeout: 5000 })
      }
      for (const [way, close] of Object.entries(ways)) {
        const own = await unseen()
        try {
          await fx.page.setViewportSize({ width: 1440, height: 900 })
          await fx.page.goto(`${own.BASE}/`)
          await setup(fx.page).waitFor({ state: 'visible', timeout: 15_000 })
          await wait(fx.page, 800)
          await close(fx.page).catch(e => { fx.seen.again[way] = `could not close it: ${String(e.message).split('\n')[0]}` })
          await wait(fx.page, 900)
          if (fx.seen.again[way]) continue
          fx.seen.closed ||= {}; fx.seen.closed[way] = !(await isOpen(fx.page))
          await fx.page.reload(); await fx.page.locator('.home, .hm-side').first().waitFor({ timeout: 15_000 }); await wait(fx.page, 2500)
          if (await isOpen(fx.page)) fx.seen.again[way] = 'Setup opens again after a reload'
        } finally { stop(own) }
      }
    }),
    step('Setup does not open by itself again', async ({ seen }) => problems(Object.entries(seen.again).map(([way, say]) => `closing with ${way}: ${say}`)))
  ],
  'setup-settings › The model check › Testing': [
    step('the model check running', async fx => {
      await home(fx)
      let release; const gate = new Promise(r => { release = r })
      await fx.page.route(url => new URL(url).pathname === '/api/setup/models', async route => { await gate; await route.continue().catch(() => {}) })
      await fromMenu(fx, 'Setup')
      const spin = fx.page.locator('.ui-dialog.su [aria-label="Testing"]').first()
      await spin.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      fx.seen.spin = await spin.evaluate(e => ({ busy: e.getAttribute('aria-busy'), label: e.getAttribute('aria-label'), role: e.getAttribute('role') })).catch(() => null)
      release(); await fx.page.unrouteAll({ behavior: 'ignoreErrors' })
    }),
    step('the Models state is a spinner, Testing, busy', async ({ seen }) => problems([
      !seen.spin && 'no spinner labelled Testing shows while the check runs',
      seen.spin && seen.spin.busy !== 'true' && `the spinner's aria-busy is ${seen.spin.busy}, not true`
    ]))
  ],
  'setup-settings › Pictures › Painted not ready': [
    step('Painted picked', async fx => {
      await home(fx)
      await fromMenu(fx, 'Setup')
      await setup(fx.page).waitFor({ state: 'visible', timeout: 8000 }); await wait(fx.page, 2500)
      await fx.page.locator('.ui-dialog.su button.su-head[data-row="pictures"]').click({ timeout: 5000 }); await wait(fx.page, 700)
      await fx.page.locator('.ui-dialog.su [data-pic="painted"]').click({ timeout: 5000 }); await wait(fx.page, 2500)
      fx.seen.row = await fx.page.evaluate(() => { const r = document.querySelector('.ui-dialog.su .su-row:has([data-row="pictures"])'); return { text: r?.innerText.replace(/\s+/g, ' ') || '', warn: !!r?.querySelector('.su-state [aria-label="Not ready"], .su-state .warn') } })
    }),
    step('the Pictures row shows ⚠ and the note says stock photos fill in', async ({ seen }) => problems([
      !seen.row.warn && `the Pictures row shows no ⚠ (it reads "${seen.row.text}")`,
      !/stock photos? fill/i.test(seen.row.text) && 'the note does not say stock photos fill in'
    ]))
  ],
  'setup-settings › Settings, one level per tap › Opening Crew': [
    step('Crew tapped in Settings', async fx => {
      await home(fx)
      await fromMenu(fx, 'Settings'); await dialog(fx.page).waitFor({ timeout: 8000 }); await wait(fx.page, 800)
      fx.seen.groups = await dialog(fx.page).evaluate(d => d.innerText.replace(/\s+/g, ' ').trim())
      const crew = dialog(fx.page).getByText('Crew', { exact: true }).first()
      if (!await crew.count()) return
      await crew.click({ timeout: 5000 }); await wait(fx.page, 900)
      fx.seen.crew = await dialog(fx.page).evaluate(d => d.innerText.replace(/\s+/g, ' ').trim())
    }),
    step('‹ Settings, then Planner, Builders, Reviewer, Media reader, Pictures, Film, Stand-in', async ({ seen }) => seen.crew === undefined ? problems([`Settings has no Crew group (it offers ${seen.groups})`]) : problems([
      !/Settings/.test(seen.crew) && 'no ‹ Settings to go back',
      ...['Planner', 'Builders', 'Reviewer', 'Media reader', 'Pictures', 'Film', 'Stand-in'].map(n => !seen.crew.includes(n) && `no ${n} in Crew`)
    ]))
  ],
  'setup-settings › Settings, one level per tap › Esc goes up one level': [
    step('a group open in Settings, Esc pressed twice', async fx => {
      await home(fx)
      await fromMenu(fx, 'Settings'); await dialog(fx.page).waitFor({ timeout: 8000 }); await wait(fx.page, 800)
      fx.seen.groupsText = await dialog(fx.page).evaluate(d => d.innerText.replace(/\s+/g, ' ').trim())
      await dialog(fx.page).getByText('Lite mode', { exact: true }).first().click({ timeout: 5000 }); await wait(fx.page, 900)
      const state = async () => { const open = await fx.page.locator('.ui-dialog').filter({ visible: true }).count() > 0; return { open, text: open ? await dialog(fx.page).evaluate(d => d.innerText.replace(/\s+/g, ' ').trim(), null, { timeout: 2000 }).catch(() => '') : '' } }
      fx.seen.inGroup = await state()
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 900)
      fx.seen.first = await state()
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 900)
      fx.seen.second = await state()
    }),
    step('the groups show again; a second Esc closes Settings', async ({ seen }) => problems([
      !seen.first.open && 'the first Esc closes Settings at once, from inside a group',
      seen.first.open && seen.first.text !== seen.groupsText && 'the first Esc does not bring the groups back',
      seen.first.open && seen.second.open && 'a second Esc does not close Settings'
    ]))
  ],
  'setup-settings › Loading › Slow connections': [
    step('Settings opened with the connection requests held back', async fx => {
      await home(fx)
      let release; const gate = new Promise(r => { release = r })
      await fx.page.route(url => { const p = new URL(url).pathname; return p.startsWith('/api/') && !/^\/api\/(projects|runs)/.test(p) }, async route => { await gate; await route.continue().catch(() => {}) })
      await fromMenu(fx, 'Settings'); await dialog(fx.page).waitFor({ timeout: 8000 }); await wait(fx.page, 900)
      fx.seen.rows = await dialog(fx.page).evaluate(d => {
        const labels = [...d.querySelectorAll('button, [role="button"]')].filter(b => b.getClientRects().length && !/^(close|×)$/i.test((b.getAttribute('aria-label') || b.innerText).trim()))
        return labels.map(b => ({ name: b.innerText.trim().split('\n')[0], busy: !!b.querySelector('[aria-busy="true"]') || b.getAttribute('aria-busy') === 'true' }))
      })
      release(); await fx.page.unrouteAll({ behavior: 'ignoreErrors' })
    }),
    step('each row shows a busy marker', async ({ seen }) => problems([
      !seen.rows.length && 'Settings shows no rows',
      ...seen.rows.filter(r => !r.busy).map(r => `the ${r.name} row shows no busy marker while the connections are held`)
    ]))
  ],
  'setup-settings › Closing › One sheet at a time': [
    step('Settings open, Setup opened from Models › Change', async fx => {
      await home(fx)
      await fromMenu(fx, 'Settings'); await dialog(fx.page).waitFor({ timeout: 8000 }); await wait(fx.page, 800)
      const models = dialog(fx.page).getByText('Models', { exact: true }).first()
      if (!await models.count()) { fx.seen.missing = ['Settings has no Models row to open Setup from']; return }
      await models.click({ timeout: 5000 }); await wait(fx.page, 700)
      await dialog(fx.page).getByRole('button', { name: /^change/i }).first().click({ timeout: 5000 }); await wait(fx.page, 1500)
      fx.seen.setup = await isOpen(fx.page)
      fx.seen.dialogs = await fx.page.locator('.ui-dialog').filter({ visible: true }).count()
    }),
    step('Settings closes and Setup opens on its Models row', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      !seen.setup && 'Setup does not open',
      seen.dialogs !== 1 && `${seen.dialogs} sheets are open, not one`
    ]))
  ],
  'setup-settings › 390 px › Setup at 390': [
    step('Setup opened at 390 wide', async fx => {
      const own = await unseen()
      try {
        await fx.page.setViewportSize({ width: 390, height: 844 })
        await fx.page.goto(`${own.BASE}/`)
        await setup(fx.page).waitFor({ state: 'visible', timeout: 15_000 }); await wait(fx.page, 2500)
        fx.seen.geo = await setup(fx.page).evaluate(d => {
          const r = d.getBoundingClientRect()
          const scrolls = [d, ...d.querySelectorAll('*')].some(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: innerHeight, scrollsInside: scrolls, sideways: document.documentElement.scrollWidth > innerWidth + 1, scrollableAtAll: [d, ...d.querySelectorAll('*')].some(e => /auto|scroll/.test(getComputedStyle(e).overflowY)) }
        })
      } finally { stop(own) }
    }),
    step('a bottom sheet, the picker scrolling inside itself, no sideways scroll', async ({ seen }) => problems([
      seen.geo.height - seen.geo.bottom > 12 && `the sheet ends ${Math.round(seen.geo.height - seen.geo.bottom)} px above the bottom: it is not a bottom sheet`,
      (seen.geo.left < -1 || seen.geo.right > 391) && 'the sheet is wider than the screen',
      !seen.geo.scrollableAtAll && 'nothing inside the sheet scrolls by itself',
      seen.geo.sideways && 'the page scrolls sideways'
    ]))
  ]
}
bind(BIND)
