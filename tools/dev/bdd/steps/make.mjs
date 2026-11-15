// The Make box (openspec/specs/make/spec.md) beyond its machine gates (#461): the box at rest, Examples, the ways
// each kind offers (and the one remembered per kind), Hermes not answering, the question before a new website and the
// menu at 390. The same steps read both Studios by what a person sees (a label, a menu's items, a line). What the
// planner and the builders answer is a Manual line in the spec: the test Studio has no model. A project a scenario
// makes is its own (Make in the Studio opens a new one each time).
import { bind, problems, step } from '../kit.mjs'

const phone = page => page.setViewportSize({ width: 390, height: 844 })
const desktop = page => page.setViewportSize({ width: 1440, height: 900 })
const wait = (page, ms = 1000) => page.waitForTimeout(ms)
const HOME = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}`
const input = page => page.getByRole('textbox', { name: 'What should the crew build?' }).first()
const kindBtn = page => page.getByRole('button', { name: /^What to make/ }).first()
const makeBtn = page => page.getByRole('button', { name: 'Make', exact: true }).first()
const menu = page => page.getByRole('menu').filter({ visible: true })
// opens Projects fresh, its remembered kind as it was left (a browser context per scenario starts with none)
async function home(fx, width = 1440) {
  await (width === 390 ? phone : desktop)(fx.page)
  await fx.page.goto(HOME(fx))
  await input(fx.page).waitFor({ timeout: 15_000 }); await wait(fx.page, 1500)
}
const pickKind = async (page, kind) => {
  await kindBtn(page).click({ timeout: 5000 }); await wait(page, 500)
  await menu(page).getByText(kind, { exact: true }).first().click({ timeout: 5000 }); await wait(page, 500)
}
const kindNow = page => kindBtn(page).evaluate(b => (b.getAttribute('aria-label') || '').replace(/^What to make:?\s*/, '').trim() || b.innerText.trim())
// the Make menu: its items, which one is pre-selected, and where they sit
const menuItems = page => menu(page).first().evaluate(m => [...m.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].map(b => {
  const r = b.getBoundingClientRect()
  return { label: b.innerText.trim().replace(/\s+/g, ' '), on: b.getAttribute('aria-checked') === 'true' || b.classList.contains('on'), left: r.left, right: r.right, height: r.height }
})).catch(() => [])
const roomOf = page => new URL(page.url()).searchParams.get('room')
const shownText = page => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
// Hermes does not answer: the Studio is asked, and says it is not signed in (what the line under the box reads)
const hermesOff = page => page.route(url => new URL(url).pathname === '/api/hermes' && new URL(url).searchParams.has('ready'), route =>
  route.fulfill({ json: { needed: true, health: { ok: false, message: 'Hermes is not signed in to a model.', action: 'Run hermes login, then check again.', code: 'no-login' } } }))

const BIND = {
  'make › One box, one primary button › At rest': [
    step('Projects loaded', async fx => {
      await home(fx)
      fx.seen.kind = await kindNow(fx.page)
      fx.seen.value = await input(fx.page).inputValue()
      fx.seen.placeholder = await input(fx.page).getAttribute('placeholder')
      fx.seen.make = await makeBtn(fx.page).isVisible()
      fx.seen.menu = await menu(fx.page).count()
      fx.seen.pop = await fx.page.getByRole('heading', { name: 'Examples' }).filter({ visible: true }).count()
    }),
    step('the last kind, an empty input with its placeholder, Make, no menu or pop', async ({ seen }) => problems([
      !seen.kind && 'no kind shows in the box',
      seen.value && `the input is not empty (it reads "${seen.value}")`,
      !seen.placeholder && 'the input has no placeholder',
      !seen.make && 'no Make button',
      seen.menu && 'a menu is open',
      seen.pop && 'the Examples pop is open'
    ]))
  ],
  'make › One box, one primary button › Examples': [
    step('Examples pressed for a Website, then an idea', async fx => {
      await home(fx)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await fx.page.getByRole('button', { name: 'Examples' }).first().click({ timeout: 5000 }); await wait(fx.page, 700)
      const head = fx.page.getByRole('heading', { name: 'Examples' }).filter({ visible: true }).first()
      fx.seen.headed = await head.count()
      // the ideas are what follows the heading, up to the next one (the pop goes on to Templates)
      fx.seen.ideas = await head.evaluate(h => { const ideas = h.nextElementSibling; const own = ideas && !/^Hd$/.test(ideas.tagName) ? [...ideas.querySelectorAll('button, [role="menuitem"], [role="option"], li, a')] : []; return (own.length ? own : ideas ? [...ideas.children] : []).filter(e => e.getClientRects().length).map(e => e.innerText.trim()).filter(Boolean) }).catch(() => [])
      const first = fx.seen.ideas[0]
      if (first) await fx.page.getByText(first, { exact: true }).first().click({ timeout: 5000 })
      await wait(fx.page, 800)
      fx.seen.value = await input(fx.page).inputValue()
      fx.seen.first = first
      fx.seen.stillOpen = await fx.page.getByRole('heading', { name: 'Examples' }).filter({ visible: true }).count()
    }),
    step('a pop of at most four ideas; one click fills the box and closes it', async ({ seen }) => problems([
      !seen.headed && 'no pop headed Examples',
      seen.headed && !seen.ideas.length && 'the pop lists no ideas',
      seen.ideas.length > 4 && `the pop lists ${seen.ideas.length} ideas (${seen.ideas.join(" | ")}), more than four`,
      seen.first && !seen.value.includes(seen.first.replace(/…$/, '')) && `the box reads "${seen.value}", not the idea's words`,
      seen.stillOpen && 'the pop stays open after a click'
    ]))
  ],
  'make › The ways each kind offers › A website with words': [
    step('the kind Website, words in the box, Make pressed', async fx => {
      await home(fx)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await input(fx.page).fill('A tea shop in Kyoto with an online menu')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 900)
      fx.seen.items = await menuItems(fx.page)
    }),
    step('a menu of Just make it and Studio, one pre-selected', async ({ seen }) => problems([
      JSON.stringify(seen.items.map(i => i.label).sort()) !== JSON.stringify(['Just make it', 'Studio']) && `the menu offers ${seen.items.map(i => i.label).join(', ') || 'nothing'}, not Just make it and Studio`,
      seen.items.filter(i => i.on).length !== 1 && `${seen.items.filter(i => i.on).length} items are pre-selected, not one`
    ]))
  ],
  'make › The ways each kind offers › An empty box': [
    step('the kind Website, an empty box, Make pressed', async fx => {
      await home(fx)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 3000)
      fx.seen.menu = await menu(fx.page).count(); fx.seen.room = roomOf(fx.page)
    }),
    step('straight to the Studio, no menu', async ({ seen }) => problems([
      seen.menu && 'a menu opens',
      seen.room !== 'studio' && `the address's room is ${seen.room}, not the Studio`
    ]))
  ],
  'make › The ways each kind offers › A brand': [
    step('the kind Brand, Make pressed', async fx => {
      await home(fx)
      await pickKind(fx.page, 'Brand')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 3000)
      fx.seen.menu = await menu(fx.page).count(); fx.seen.room = roomOf(fx.page)
    }),
    step('straight to the Studio, no menu', async ({ seen }) => problems([
      seen.menu && 'a menu opens',
      seen.room !== 'studio' && `the address's room is ${seen.room}, not the Studio`
    ]))
  ],
  'make › The ways each kind offers › Remembered per kind': [
    step('Studio picked for an App, then Make pressed on an App again', async fx => {
      await home(fx)
      await pickKind(fx.page, 'App')
      await input(fx.page).fill('A habit tracker for night owls')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 800)
      await menu(fx.page).getByText('Studio', { exact: true }).first().click({ timeout: 5000 }); await wait(fx.page, 2500)
      await home(fx)
      fx.seen.kind = await kindNow(fx.page)
      if (fx.seen.kind !== 'App') await pickKind(fx.page, 'App')
      await input(fx.page).fill('A habit tracker for night owls')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 900)
      fx.seen.items = await menuItems(fx.page)
    }),
    step('Studio is pre-selected', async ({ seen }) => problems([
      !seen.items.length && 'no menu opens for the App',
      seen.items.length && seen.items.find(i => i.on)?.label !== 'Studio' && `${seen.items.find(i => i.on)?.label || 'nothing'} is pre-selected, not Studio`
    ]))
  ],
  'make › Loading and refusals › Hermes not answering': [
    step('Make pressed, Just make it picked, Hermes not answering', async fx => {
      await hermesOff(fx.page)
      await home(fx)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await input(fx.page).fill('A tea shop in Kyoto with an online menu')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 800)
      await menu(fx.page).getByText('Just make it', { exact: true }).first().click({ timeout: 5000 }); await wait(fx.page, 2500)
      fx.seen.text = await shownText(fx.page)
      fx.seen.again = await fx.page.getByRole('button', { name: /check again/i }).filter({ visible: true }).count()
      fx.seen.room = roomOf(fx.page)
      fx.seen.value = await input(fx.page).inputValue().catch(() => null)
    }),
    step('the reason and the fix with Check again, nothing starts, the words stay', async ({ seen }) => problems([
      !/not signed in to a model/i.test(seen.text) && 'the reason is not shown',
      !/hermes login/i.test(seen.text) && 'the fix is not shown',
      !seen.again && 'no Check again',
      seen.room && `something started (the address's room is ${seen.room})`,
      seen.value !== 'A tea shop in Kyoto with an online menu' && `the words did not stay (the box reads ${JSON.stringify(seen.value)})`
    ]))
  ],
  'make › The question before a new website › Asked before a new site': [
    step('a new website made from the Make box', async fx => {
      await home(fx)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await input(fx.page).fill('A tea shop in Kyoto with an online menu')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 800)
      await menu(fx.page).getByText('Just make it', { exact: true }).first().click({ timeout: 5000 }); await wait(fx.page, 3500)
      fx.seen.text = await shownText(fx.page)
      fx.seen.answers = await fx.page.evaluate(() => ['Pick steps to skip', 'Skip all, build now', 'Step by step'].map(l => {
        const e = [...document.querySelectorAll('button, [role="button"]')].find(b => b.getClientRects().length && b.innerText.trim().startsWith(l))
        return e ? { label: l, text: e.innerText.trim().replace(/\s+/g, ' '), top: e.getBoundingClientRect().top } : null
      }).filter(Boolean))
    }),
    step('the chat asks, three answers, the recommended first with its reason, no agent started', async ({ seen }) => problems([
      !/skip the steps, or go through them/i.test(seen.text) && 'the chat does not ask the question',
      seen.answers.length !== 3 && `${seen.answers.length} of the three answers show (${seen.answers.map(a => a.label).join(', ')})`,
      seen.answers.length && seen.answers[0].text.length <= seen.answers[0].label.length && 'the first answer has no reason beside it',
      /Planning the pages|Stopped:/i.test(seen.text) && 'the planner started before the question was answered'
    ]))
  ],
  'make › The question before a new website › Pick steps to skip': [
    step('Pick steps to skip, then Skip Brand', async fx => {
      await home(fx)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await input(fx.page).fill('A tea shop in Kyoto with an online menu')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 800)
      await menu(fx.page).getByText('Just make it', { exact: true }).first().click({ timeout: 5000 }); await wait(fx.page, 3000)
      const pick = fx.page.getByRole('button', { name: /^pick steps to skip/i }).first()
      if (!await pick.count()) { fx.seen.missing = ['no Pick steps to skip answer']; return }
      await pick.click({ timeout: 5000 }); await wait(fx.page, 1200)
      const skip = fx.page.getByRole('button', { name: /^skip brand/i }).first()
      if (!await skip.count()) { fx.seen.missing = ['no Skip Brand choice']; return }
      await skip.click({ timeout: 5000 }); await wait(fx.page, 3000)
      fx.seen.step = new URL(fx.page.url()).searchParams.get('step'); fx.seen.room = roomOf(fx.page)
      fx.seen.dot = await fx.page.evaluate(() => {
        const b = [...document.querySelectorAll('nav[aria-label="Steps"] button')].find(b => b.innerText.replace(/^\s*\+\s*/, '').trim() === 'Brand')
        return b ? (b.querySelector('[role="img"]')?.getAttribute('aria-label') || 'none') : 'no chip'
      })
    }),
    step('the Studio opens on Plan, Brand marked skipped', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      seen.room !== 'studio' && `the room is ${seen.room}, not the Studio`,
      seen.step !== 'plan' && `the Studio opens on ${seen.step}, not Plan`,
      seen.dot !== 'Skipped' && `Brand's dot reads ${seen.dot}, not Skipped`
    ]))
  ],
  'make › 390 px › Menus at 390': [
    step('the Make menu opened at 390 wide', async fx => {
      await home(fx, 390)
      if ((await kindNow(fx.page)) !== 'Website') await pickKind(fx.page, 'Website')
      await input(fx.page).fill('A tea shop in Kyoto with an online menu')
      await makeBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 900)
      fx.seen.items = await menuItems(fx.page)
      fx.seen.sideways = await fx.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    }),
    step('every item within the screen, each at least 44 px tall', async ({ seen }) => problems([
      !seen.items.length && 'no menu opens',
      seen.sideways && 'the page scrolls sideways',
      ...seen.items.map(i => (i.left < 0 || i.right > 390) && `${i.label} is outside the screen (${Math.round(i.left)} to ${Math.round(i.right)} px)`),
      ...seen.items.map(i => i.height < 44 && `${i.label} is ${Math.round(i.height)} px tall, under 44`)
    ]))
  ]
}
bind(BIND)
