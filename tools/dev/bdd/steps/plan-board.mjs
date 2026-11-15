// The Plan board (openspec/specs/plan-board/spec.md) beyond its machine gates (#461): the plan's menu, a saved plan
// opening, the price on the button, the Gate and a stale price, and a fresh talk. A saved plan is one made through
// the Studio's own POST /api/plans for the scenario; a price with Meshy parts (a 3D plan's) is the plan's own answer
// with its price changed on the way, since the test Studio has no paid parts. The paid build and the painting are
// Manual lines in the spec (they need models).
import { bind, problems, step } from '../kit.mjs'
import { studio as newStudio } from '../../../../scripts/walkthrough-fixtures.mjs'

const wait = (page, ms = 1000) => page.waitForTimeout(ms)
const BASE = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}`
const planUrl = (url, id) => new URL(url).pathname === `/api/plans/${id}`
// a 3D plan's price: Meshy parts, each n times its price, the coding runs and the pictures
const PRICE = (credits = 324) => ({ credits, runs: 4, images: 12, parts: [{ what: 'Meshy models', n: 3, each: credits / 3, credits }], first: { credits: credits / 3 }, rest: { credits: credits - credits / 3 } })
async function makePlan(fx, title) {
  const made = await fx.studio.api('/api/plans', { idea: 'A platformer through a night market', answers: {}, title })
  fx.seen.plan = made.id; fx.seen.title = title
  return made.id
}
// the plan as the board gets it, its price changed to `price()` (null: as it is)
const withPrice = (page, id, price) => page.route(url => planUrl(url, id), async route => {
  if (route.request().method() !== 'GET' || !price) return route.continue()
  const res = await route.fetch(); const json = await res.json()
  await route.fulfill({ response: res, json: { ...json, price: price() } })
})
const lockBtn = page => page.getByRole('button', { name: /^lock\b/i }).filter({ visible: true }).first()
async function board(fx, title, { price, width = 1440 } = {}) {
  await fx.page.setViewportSize({ width, height: 900 })
  const id = await makePlan(fx, title)
  if (price) await withPrice(fx.page, id, price)
  await fx.page.goto(`${BASE(fx)}?room=plan&plan=${id}`)
  await lockBtn(fx.page).waitFor({ timeout: 10_000 }).catch(() => {})
  await wait(fx.page, 1200)
  return id
}
const label = async page => (await lockBtn(page).count()) ? (await lockBtn(page).textContent()).replace(/\s+/g, ' ').trim() : null
const dialogOf = page => page.getByRole('dialog').filter({ visible: true }).first()

// a saved plan shows on Projects as a card of its own, so a scenario that saves one does it in a Studio of its own: the
// shared Studio's Projects (which the Projects scenarios' axe and empty views read) stays as it was
const own = fn => async fx => {
  const o = await newStudio()
  try { await o.api('/api/setup', { seen: true }); fx.studio = o; await fn(fx) } finally { try { o.stop() } catch { /* its folder may be held a moment on Windows */ } }
}

const BIND = {
  'plan-board › Breadcrumb › The plan menu': [
    step('the plan\'s name pressed', own(async fx => {
      await board(fx, 'Night Market')
      const name = fx.page.getByRole('button', { name: 'Night Market', exact: true }).filter({ visible: true }).first()
      const menuItems = () => fx.page.getByRole('menu').filter({ visible: true }).first().evaluate(m => [...m.querySelectorAll('[role="menuitem"], button')].map(b => b.innerText.trim()).filter(Boolean)).catch(() => null)
      const open = () => fx.page.getByRole('menu').filter({ visible: true }).count()
      if (!await name.count()) { fx.seen.missing = ['the plan\'s name is not a button in the breadcrumb']; return }
      await name.click({ timeout: 5000 }); await wait(fx.page, 600)
      fx.seen.items = await menuItems()
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 500); fx.seen.byEsc = await open()
      await name.click({ timeout: 5000 }); await wait(fx.page, 500)
      await fx.page.mouse.click(5, 450); await wait(fx.page, 500); fx.seen.byOutside = await open()
      await name.click({ timeout: 5000 }); await wait(fx.page, 500)
      const x = fx.page.getByRole('menu').filter({ visible: true }).first().getByRole('button', { name: /^(×|close)$/i }).first()
      fx.seen.hasX = await x.count()
      if (fx.seen.hasX) { await x.click({ timeout: 3000 }).catch(() => {}); await wait(fx.page, 500) }
      fx.seen.byX = fx.seen.hasX ? await open() : null
    })),
    step('a menu of Save as template only, closed by ×, Esc or a click outside', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      JSON.stringify(seen.items) !== JSON.stringify(['Save as template']) && `the menu offers ${JSON.stringify(seen.items)}, not Save as template only`,
      seen.byEsc && 'Esc does not close the menu',
      seen.byOutside && 'a click outside does not close the menu',
      !seen.hasX && 'the menu has no ×',
      seen.hasX && seen.byX && '× does not close the menu'
    ]))
  ],
  'plan-board › Loading › A saved plan opening': [
    step('a saved plan opened with its request held back', own(async fx => {
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      const id = await makePlan(fx, 'Night Market')
      let release; const gate = new Promise(r => { release = r })
      await fx.page.route(url => planUrl(url, id), async route => { await gate; await route.continue().catch(() => {}) })
      await fx.page.goto(`${BASE(fx)}?room=plan&plan=${id}`, { waitUntil: 'commit' })
      await wait(fx.page, 2000)
      const cards = () => fx.page.evaluate(() => ({
        waiting: [...document.querySelectorAll('.pcard.wait-in[aria-busy="true"], [aria-busy="true"].pcard, .wait-in[aria-busy="true"]')].filter(e => e.getClientRects().length).length,
        cards: [...document.querySelectorAll('[data-key^="card:"]')].filter(e => e.getClientRects().length).length
      }))
      fx.seen.held = await cards()
      release()
      await lockBtn(fx.page).waitFor({ timeout: 10_000 }).catch(() => {})
      await wait(fx.page, 1500)
      fx.seen.after = await cards()
    })),
    step('three waiting cards until the cards land in their place', async ({ seen }) => problems([
      seen.held.waiting !== 3 && `${seen.held.waiting} waiting cards show while the plan is held, not three`,
      seen.after.waiting && `${seen.after.waiting} waiting cards stay after the plan lands`,
      seen.after.cards !== 9 && `${seen.after.cards} cards land, not nine`
    ]))
  ],
  'plan-board › Nothing costly before Lock › The price on the button': [
    step('a plan with Meshy parts, and one with none, loaded', own(async fx => {
      await board(fx, 'Night Market', { price: () => PRICE(324) })
      fx.seen.meshy = await label(fx.page)
      await fx.page.unrouteAll({ behavior: 'ignoreErrors' })
      await board(fx, 'Night Market 2')
      fx.seen.flat = await label(fx.page)
    })),
    step('Lock · n credits, and Lock · n pictures', async ({ seen }) => problems([
      !/^Lock · \d+ credits$/.test(seen.meshy || '') && `a plan with Meshy parts reads "${seen.meshy}", not Lock · <n> credits`,
      !/^Lock · \d+ pictures$/.test(seen.flat || '') && `a plan with none reads "${seen.flat}", not Lock · <n> pictures`
    ]))
  ],
  'plan-board › Nothing costly before Lock › The Gate': [
    step('Lock · n pressed', own(async fx => {
      await board(fx, 'Night Market', { price: () => PRICE(324) })
      if (!await lockBtn(fx.page).count()) { fx.seen.missing = ['no Lock button on the board']; return }
      await lockBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 1000)
      fx.seen.gate = await dialogOf(fx.page).evaluate(d => ({
        text: d.innerText.replace(/\s+/g, ' ').trim(),
        first: !!d.querySelector('input[type="checkbox"]') && /test one first/i.test(d.innerText),
        primaries: [...d.querySelectorAll('button')].filter(b => /^lock\b/i.test(b.innerText.trim())).length
      })).catch(() => null)
    })),
    step('a dialog of the parts, coding runs, pictures, Test one first and one Lock', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      !seen.gate && 'no dialog opens',
      seen.gate && !/3 × 108/.test(seen.gate.text) && 'the dialog does not list the part as n × each',
      seen.gate && !/coding runs/i.test(seen.gate.text) && 'no Coding runs row',
      seen.gate && !/pictures/i.test(seen.gate.text) && 'no Pictures row',
      seen.gate && !seen.gate.first && 'no Test one first',
      seen.gate && seen.gate.primaries !== 1 && `${seen.gate.primaries} Lock buttons in the dialog, not one`
    ]))
  ],
  'plan-board › Nothing costly before Lock › A stale price': [
    step('the price changed between showing and confirming', own(async fx => {
      let stale = false
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      const id = await makePlan(fx, 'Night Market')
      await withPrice(fx.page, id, () => PRICE(stale ? 450 : 324))
      let locks = 0
      await fx.page.route(url => new URL(url).pathname === `/api/plans/${id}/lock`, route => { locks++; stale = true; return route.fulfill({ status: 402, json: { error: 'the price changed' } }) })
      await fx.page.goto(`${BASE(fx)}?room=plan&plan=${id}`)
      await lockBtn(fx.page).waitFor({ timeout: 10_000 }).catch(() => {})
      if (!await lockBtn(fx.page).count()) { fx.seen.missing = ['no Lock button on the board']; return }
      await lockBtn(fx.page).click({ timeout: 5000 }); await wait(fx.page, 800)
      await dialogOf(fx.page).getByRole('button', { name: /^lock\b/i }).first().click({ timeout: 5000 }); await wait(fx.page, 1800)
      fx.seen.locks = locks
      fx.seen.again = await dialogOf(fx.page).evaluate(d => d.innerText.replace(/\s+/g, ' ').trim()).catch(() => null)
      fx.seen.locked = (await fx.studio.api(`/api/plans/${id}`))?.gate?.locked
    })),
    step('nothing locked, the Gate open again with the new price', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      seen.locked && 'the plan was locked',
      seen.again === null && 'the Gate does not open again',
      seen.again !== null && !/450/.test(seen.again) && `the Gate shows ${JSON.stringify(seen.again.slice(0, 60))}, not the new price (450)`
    ]))
  ],
  'plan-board › Empty state › A fresh talk': [
    step('a game talk that has answered nothing yet', own(async fx => {
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      if (fx.app) await fx.page.goto(`${BASE(fx)}?room=plan`)
      else { await fx.page.goto(BASE(fx)); await fx.page.locator('.home .card').first().waitFor(); await fx.page.evaluate(() => window.swarmCosmos.talkGame({ text: 'A platformer through a night market' })) }
      await wait(fx.page, 3500)
      fx.seen.board = await fx.page.evaluate(() => {
        const world = document.querySelector('#world, .pj-world, main') || document.body
        const lines = world.innerText.split('\n').map(l => l.trim()).filter(Boolean)
        return { cards: [...document.querySelectorAll('[data-key^="card:"], .pcard')].filter(e => e.getClientRects().length).length, long: lines.filter(l => l.length > 50 && /[.!?]$/.test(l)) }
      })
    })),
    step('waiting cards or card names; no helper sentence', async ({ seen }) => problems([
      !seen.board.cards && 'the board shows no cards, waiting or named',
      seen.board.long.length && `a helper sentence shows: "${seen.board.long[0]}"`
    ]))
  ]
}
bind(BIND)
