// The Design deck (openspec/specs/design-deck/spec.md) and the chats Projects reopens into it (projects/spec.md),
// beyond their machine gates (#461): Esc back to the Overview, a new chat, Replay, the chat at 390 and the skip
// question; reopening a website's chat and a game's. The same steps read both Studios by what a person sees. A
// chat is the server's own record (GET /api/chats); a scenario that makes one does it in a Studio of its own so the
// shared Studio's Chats view stays empty, as its Projects scenarios expect.
import { bind, problems, step } from '../kit.mjs'
import { studio as newStudio } from '../../../../scripts/walkthrough-fixtures.mjs'

const wait = (page, ms = 1000) => page.waitForTimeout(ms)
const BASE = ({ studio, app }) => `${studio.BASE}${app ? '/next/' : '/'}`
const DECK = (fx, run) => `${BASE(fx)}?project=${run}&version=${run}&room=deck`
const roomOf = page => new URL(page.url()).searchParams.get('room')
const inOwn = fn => async fx => {
  const own = await newStudio()
  try { await own.api('/api/setup', { seen: true }); fx.studio = own; await fn(fx) } finally { try { own.stop() } catch { /* its folder may be held a moment on Windows */ } }
}
const input = page => page.getByRole('textbox', { name: 'What should the crew build?' }).first()
const chatsView = async page => { await page.locator('button:not(.chats-btn)').filter({ hasText: /^\s*Chats/ }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(page, 1000) }
async function home(fx, app) {
  await fx.page.setViewportSize({ width: 1440, height: 900 })
  await fx.page.goto(`${fx.studio.BASE}${app ? '/next/' : '/'}`)
  await fx.page.locator('[data-id]').first().waitFor({ timeout: 15_000 }); await wait(fx.page, 1200)
}
async function newChat(fx) {
  await home(fx, fx.app)
  await chatsView(fx.page)
  await fx.page.getByRole('button', { name: /^New chat/ }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(fx.page, 3000)
}
const composer = (page, app) => app ? page.locator('textarea[aria-label="Message"]') : page.locator('#brief')
const text = page => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
// a chat the way a person starts one: in the current Studio, a brief and Just make it (a game's: its talk)
async function startChat(fx, kind, app = '') {
  await fx.page.setViewportSize({ width: 1440, height: 900 })
  await fx.page.goto(`${fx.studio.BASE}${app ? '/next/' : '/'}`)
  await fx.page.locator('.home .card, [data-id]').first().waitFor({ timeout: 15_000 }); await wait(fx.page, 1200)
  if (kind === 'game') await fx.page.evaluate(() => window.swarmCosmos.talkGame({ text: 'A platformer through a night market' }))
  else {
    if (!await input(fx.page).count()) return
    await input(fx.page).fill('A tea shop in Kyoto with an online menu')
    await fx.page.getByRole('button', { name: 'Make', exact: true }).first().click({ timeout: 5000 }); await wait(fx.page, 700)
    await fx.page.getByRole('menu').getByText('Just make it', { exact: true }).first().click({ timeout: 5000 })
  }
  await wait(fx.page, 3000)
}

const BIND = {
  'design-deck › Breadcrumb › Back': [
    step('nothing selected or open, Esc pressed', async fx => {
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      await fx.page.goto(DECK(fx, fx.studio.ids.site2))
      await fx.page.locator('iframe, img').first().waitFor({ timeout: 15_000 }); await wait(fx.page, 3500)
      await fx.page.mouse.click(1420, 880); await wait(fx.page, 400)
      await fx.page.keyboard.press('Escape'); await wait(fx.page, 2000)
      fx.seen.room = roomOf(fx.page); fx.seen.project = new URL(fx.page.url()).searchParams.has('project')
    }),
    step('the Overview opens', async ({ seen }) => problems([
      seen.room === 'deck' && 'Esc leaves the Design deck open',
      !seen.project && 'Esc leaves the project for Projects, not the Overview'
    ]))
  ],
  'design-deck › Empty states › A new chat': [
    step('New chat opened the deck with nothing built', async fx => {
      await newChat(fx)
      fx.seen.text = await text(fx.page)
      fx.seen.frames = await fx.page.locator('iframe').filter({ visible: true }).count()
      fx.seen.composer = await composer(fx.page, fx.app).count() ? await composer(fx.page, fx.app).getAttribute('placeholder') : null
      fx.seen.button = await fx.page.getByRole('button', { name: /^(send|build)/i }).filter({ visible: true }).count()
    }),
    step('Layers\' one line, an empty canvas, the composer reading Tell Hermia… and its button', async ({ seen }) => problems([
      !/pages appear here once the planner names them/i.test(seen.text) && 'Layers does not show its one line (Pages appear here once the planner names them.)',
      seen.frames && `${seen.frames} pages are on the canvas`,
      seen.composer !== 'Tell Hermia…' && `the composer reads ${JSON.stringify(seen.composer)}, not Tell Hermia…`,
      !seen.button && 'the composer has no button'
    ]))
  ],
  'design-deck › Replay › Replaying': [
    step('Replay picked in the menu', async fx => {
      await fx.page.setViewportSize({ width: 1440, height: 900 })
      await fx.page.goto(DECK(fx, fx.studio.ids.site2))
      await fx.page.getByRole('button', { name: /^More$/ }).filter({ visible: true }).first().waitFor({ timeout: 15_000 }).catch(() => {})
      await wait(fx.page, 1500)
      const more = fx.page.getByRole('button', { name: /^More$/ }).filter({ visible: true }).first()
      if (!await more.count()) { fx.seen.missing = ['no ☰ menu (More) on the deck']; return }
      await more.click({ timeout: 5000 }); await wait(fx.page, 600)
      const replay = fx.page.getByText(/^replay$/i).filter({ visible: true }).first()
      if (!await replay.count()) { fx.seen.missing = ['the menu offers no Replay']; return }
      await replay.click({ timeout: 5000 }); await wait(fx.page, 3000)
      await more.click({ timeout: 5000 }).catch(() => {}); await wait(fx.page, 600)
      fx.seen.stop = await fx.page.getByText(/stop replay/i).filter({ visible: true }).count()
    }),
    step('the pages build again, and ☰ offers Stop replay', async ({ seen }) => seen.missing ? problems(seen.missing) : problems([
      !seen.stop && '☰ does not offer Stop replay'
    ]))
  ],
  'design-deck › 390 px › The chat at 390': [
    step('the chat opened at 390 wide', async fx => {
      await fx.page.setViewportSize({ width: 390, height: 844 })
      await fx.page.goto(DECK(fx, fx.studio.ids.site2))
      await fx.page.locator('iframe, img').first().waitFor({ timeout: 15_000 }); await wait(fx.page, 2500)
      const open = fx.page.getByRole('button', { name: /^chat$/i }).filter({ visible: true }).first()
      if (await open.count()) { await open.click({ timeout: 5000 }); await wait(fx.page, 1200) }
      const box = composer(fx.page, fx.app)
      fx.seen.sheet = await box.evaluate(b => { const r = b.getBoundingClientRect(); return { visible: r.height > 0, top: r.top, bottom: r.bottom, height: innerHeight } }).catch(() => null)
      fx.seen.canvas = await fx.page.locator('iframe, img').filter({ visible: true }).count()
      const fold = fx.page.getByRole('button', { name: /^(×|fold chat|close chat|close)$/i }).filter({ visible: true }).first()
      fx.seen.fold = await fold.count()
      if (fx.seen.fold) { await fold.click({ timeout: 3000 }).catch(() => {}); await wait(fx.page, 900) }
      fx.seen.after = await box.isVisible().catch(() => false)
    }),
    step('a bottom sheet, the canvas behind it, × folds it', async ({ seen }) => problems([
      !seen.sheet?.visible && 'the chat does not open',
      seen.sheet?.visible && seen.sheet.bottom < seen.sheet.height - 120 && 'the chat is not at the bottom of the screen',
      !seen.canvas && 'the canvas is not behind the chat',
      !seen.fold && 'no × to fold the chat',
      seen.fold && seen.after && '× does not fold the chat'
    ]))
  ],
  'design-deck › Talk and brief before building › The skip question': [
    step('Build pressed on a brief for a new website', async fx => {
      // the brief goes in through the Make box and Just make it, which is Build pressed on a brief (the chat that opens)
      await startChat(fx, 'site', fx.app)
      fx.seen.text = await text(fx.page)
    }),
    step('the chat asks to skip the steps or go through them, no agent working', async ({ seen }) => problems([
      !/skip the steps, or go through them/i.test(seen.text) && 'the chat does not ask to skip the steps or go through them',
      !/skip all, build now/i.test(seen.text) && 'no Skip all, build now answer',
      /planning the pages|stopped:/i.test(seen.text) && 'an agent started before the question was answered'
    ]))
  ],
  'projects › Chats › Reopening a chat': [
    step('a website\'s chat opened from Chats', inOwn(async fx => {
      await startChat(fx, 'site')
      const before = (await fx.studio.api('/api/projects')).projects?.length ?? 0
      await home(fx, fx.app)
      await chatsView(fx.page)
      await fx.page.getByText('A tea shop in Kyoto with an online menu', { exact: false }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(fx.page, 3000)
      fx.seen.composer = await composer(fx.page, fx.app).count()
      fx.seen.text = await text(fx.page)
      fx.seen.projects = ((await fx.studio.api('/api/projects')).projects?.length ?? 0) - before
    })),
    step('the Design deck\'s chat where it left off, nothing built, no project made', async ({ seen }) => problems([
      !seen.composer && "the Design deck's chat does not open",
      !/tea shop in kyoto/i.test(seen.text) && 'the chat does not show where it left off',
      seen.projects && `${seen.projects} project(s) were made`
    ]))
  ],
  'projects › Chats › A game\'s chat': [
    step('a game\'s chat opened from Chats', inOwn(async fx => {
      await startChat(fx, 'game')
      await home(fx, fx.app)
      await chatsView(fx.page)
      await fx.page.getByText('now', { exact: true }).filter({ visible: true }).first().click({ timeout: 5000 }); await wait(fx.page, 3000)
      fx.seen.room = roomOf(fx.page)
      fx.seen.plan = await fx.page.getByRole('button', { name: /^lock/i }).filter({ visible: true }).count()
    })),
    step('the Plan board opens beside its talk', async ({ seen }) => problems([
      !seen.plan && 'no Lock button: the Plan board is not there'
    ]))
  ]
}
bind(BIND)
